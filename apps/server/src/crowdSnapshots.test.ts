import { describe, expect, it } from 'vitest';
import { mulberry32, type NetServerMessage, type Snapshot } from '@solrift/shared';
import { GameRoom } from './room';
import { withPlayersJson } from './server';

// What a crowd is sent: the players nearest every snapshot, the others every few, and an ability effect in full once.

function crowd(count: number): { room: GameRoom; snaps: Snapshot[]; ids: number[]; me: number } {
  const room = new GameRoom({ seed: 7, naturalSpawning: false, rand: mulberry32(3) });
  const snaps: Snapshot[] = [];
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    const slot = i;
    const id = room.join(
      {
        send: (_m: NetServerMessage) => {},
        sendSnapshot: (snap, playersJson) => {
          if (slot === 0) snaps.push(JSON.parse(withPlayersJson(snap, playersJson)) as Snapshot);
        },
        close: () => {},
      },
      `p${i}`,
    );
    ids.push(id!);
  }
  return { room, snaps, ids, me: ids[0] };
}

describe('the players of a crowd', () => {
  it('are sent the nearest every snapshot and the others every fourth, with the ids of the rest to keep', () => {
    const { room, snaps, ids, me } = crowd(40);
    for (let i = 0; i < 8; i++) room.tick();
    expect(snaps.length).toBeGreaterThanOrEqual(8);
    const others = ids.filter((id) => id !== me);
    const last = snaps.slice(-8);
    for (const s of last) {
      // Everybody is in the snapshot or named in `keep`, nobody is both, and the snapshot is far smaller than the crowd.
      const sent = s.players.map((p) => p.id);
      expect(new Set([...sent, ...(s.keep ?? [])])).toEqual(new Set(others));
      expect(sent.some((id) => (s.keep ?? []).includes(id))).toBe(false);
      expect(sent.length).toBeLessThan(others.length);
      expect(sent.length).toBeGreaterThanOrEqual(24);
    }
    // Every player is sent in full within any four snapshots, so nobody is stale for long.
    for (let from = 0; from + 4 <= last.length; from++) {
      const window = new Set(last.slice(from, from + 4).flatMap((s) => s.players.map((p) => p.id)));
      expect(window).toEqual(new Set(others));
    }
  });

  it('are all sent every time when there are few of them', () => {
    const { room, snaps } = crowd(12);
    for (let i = 0; i < 3; i++) room.tick();
    const s = snaps[snaps.length - 1];
    expect(s.players.length).toBe(11);
    expect(s.keep).toBeUndefined();
  });
});

describe('the ability effects of a crowd', () => {
  it('are sent in full once, then only named, until they are over', () => {
    const { room, snaps, me } = crowd(2);
    room.tick();
    const body = room.player(me)!.body;
    const mark = room.realm.effects.mark('slam', 'p1', body.x + 3, body.y, body.z, 3, 0.4);
    const before = snaps.length;
    for (let i = 0; i < 4; i++) room.tick();
    const during = snaps.slice(before);
    expect(during[0].fx?.map((f) => f.id)).toEqual([mark.id]);
    expect(during[0].fxKeep).toBeUndefined();
    expect(during[1].fx).toBeUndefined();
    expect(during[1].fxKeep).toEqual([mark.id]);
    // When it is over, nothing names it any more.
    for (let i = 0; i < 40; i++) room.tick();
    const end = snaps[snaps.length - 1];
    expect(end.fx).toBeUndefined();
    expect(end.fxKeep).toBeUndefined();
  });

  it('are sent again in full when they move', () => {
    const { room, snaps, me } = crowd(2);
    room.tick();
    const body = room.player(me)!.body;
    const mark = room.realm.effects.mark('charge', 'p1', body.x + 3, body.y, body.z, 1, 2);
    room.tick();
    room.tick();
    mark.x += 1;
    room.tick();
    const s = snaps[snaps.length - 1];
    expect(s.fx?.map((f) => f.id)).toEqual([mark.id]);
    expect(s.fx![0].x).toBeCloseTo(mark.x, 1);
  });
});
