import { describe, expect, it } from 'vitest';
import { makeStack, mulberry32, parseNetClientMessage, toolId, type NetServerMessage } from '@solrift/shared';
import { GameRoom } from './room';
import { MemoryRoomStore } from './roomStore';

class Client {
  messages: NetServerMessage[] = [];
  id = 0;
  conn = { send: (m: NetServerMessage) => this.messages.push(m), close: () => {} };
  constructor(readonly room: GameRoom) {}
  join(name: string): this {
    const id = this.room.join(this.conn, name, `acct-${name}`);
    if (id === null) throw new Error('join refused');
    this.id = id;
    return this;
  }
  get player() {
    return this.room.player(this.id)!;
  }
  act(a: { a: 'ask'; name: string } | { a: 'accept' } | { a: 'decline' }): void {
    for (let i = 0; i < 4; i++) this.room.tick();
    this.room.receive(this.id, { t: 'duel', act: a });
  }
  asks(): (string | null)[] {
    return this.messages.flatMap((m) => (m.t === 'duelAsk' ? [m.from] : []));
  }
  count(): (number | 'start' | null)[] {
    return this.messages.flatMap((m) => (m.t === 'duel' ? [m.n] : []));
  }
}

function pair() {
  const room = new GameRoom({ seed: 7, naturalSpawning: false, rand: mulberry32(1), store: new MemoryRoomStore() });
  const ann = new Client(room).join('ann');
  const bob = new Client(room).join('bob');
  bob.player.teleport(ann.player.body.x + 1, ann.player.body.y, ann.player.body.z);
  return { room, ann, bob };
}

describe('a duel', () => {
  it('asks like a trade, counts from 5 to Start, and only then can a blow land', () => {
    expect(parseNetClientMessage({ t: 'duel', act: { a: 'ask', name: 'bob' } })).toEqual({ t: 'duel', act: { a: 'ask', name: 'bob' } });
    const { room, ann, bob } = pair();
    ann.act({ a: 'ask', name: 'bob' });
    expect(bob.asks().pop()).toBe('ann');
    bob.act({ a: 'decline' });
    expect(bob.asks().pop()).toBeNull();
    expect(ann.player.duelTarget).toBeNull();

    ann.act({ a: 'ask', name: 'bob' });
    bob.act({ a: 'accept' });
    expect(ann.count()[0]).toBe(5);
    expect(bob.count()[0]).toBe(5);
    expect(ann.player.duelTarget).toBeNull();

    ann.player.inventory.set(0, makeStack(toolId('sword', 'iron')));
    ann.player.yaw = -Math.PI / 2;
    const full = bob.player.vitals.health;
    ann.player.updateInteraction(1 / 20, { t: 'frame', dt: 1 / 20, locked: true, yaw: -Math.PI / 2, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: true, right: false });
    expect(bob.player.vitals.health).toBe(full);

    for (let i = 0; i < room.tickHz * 5; i++) room.tick();
    expect(ann.count().at(-1)).toBe('start');
    expect(bob.count().at(-1)).toBe('start');
    expect(ann.player.duelTarget).toBe(bob.player);
    expect(bob.player.duelTarget).toBe(ann.player);

    ann.player.yaw = -Math.PI / 2;
    ann.player.updateInteraction(1 / 20, { t: 'frame', dt: 1 / 20, locked: true, yaw: -Math.PI / 2, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: true, right: false });
    expect(bob.player.vitals.health).toBeLessThan(full);
  });
});
