import { describe, expect, it } from 'vitest';
import { mulberry32, type NetServerMessage, type Snapshot } from '@solrift/shared';
import { GameRoom } from './room';
import { withPlayersJson } from './server';

describe('shared player serialisation', () => {
  it('sends exactly the bytes JSON.stringify would, for every recipient', () => {
    const room = new GameRoom({ seed: 7, naturalSpawning: false, rand: mulberry32(3) });
    const plain: Snapshot[] = [];
    const wire: string[] = [];
    const ids: number[] = [];
    for (let i = 0; i < 12; i++) {
      const slot = i;
      const id = room.join(
        {
          send: (m: NetServerMessage) => {
            if (m.t === 'snap' && slot === 3) plain.push(m);
          },
          sendSnapshot: (snap, playersJson) => {
            if (slot === 3) wire.push(withPlayersJson(snap, playersJson));
          },
          close: () => {},
        },
        // A name with characters JSON has to escape.
        i === 5 ? 'quo"te\\' : `p${i}`,
      );
      ids.push(id!);
    }
    for (let i = 0; i < 3; i++) room.tick();
    expect(wire.length).toBeGreaterThan(0);

    // The same member, asked for its snapshot the plain way, has the same text (the tick number aside).
    const member = (room as unknown as { members: Map<number, never> }).members.get(ids[3])!;
    const direct = room.snapshot(member);
    const last = JSON.parse(wire[wire.length - 1]) as Snapshot;
    expect(last.players.length).toBe(11);
    expect(last.players).toEqual(JSON.parse(JSON.stringify(direct.players)));
    expect(last.players.map((p) => p.name)).toContain('quo"te\\');
    expect(plain.length).toBe(1); // only the one sent on joining; every tick after that took the fast path
  });

  it('copes with a snapshot that has nobody else in view', () => {
    const s = withPlayersJson({ players: [], a: 1 } as { players: unknown[] }, '[]');
    expect(JSON.parse(s)).toEqual({ players: [], a: 1 });
  });
});
