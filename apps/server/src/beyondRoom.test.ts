import { describe, expect, it } from 'vitest';
import { BeyondWorldGenerator, SEA_LEVEL, makeGenerator, mulberry32, type NetServerMessage } from '@solrift/shared';
import { GameRoom } from './room';
import { MemoryRoomStore } from './roomStore';

class Client {
  messages: NetServerMessage[] = [];
  id = 0;
  conn = { send: (m: NetServerMessage) => this.messages.push(m), close: () => {} };
  constructor(readonly room: GameRoom) {}
  join(name: string): void {
    const id = this.room.join(this.conn, name);
    if (id === null) throw new Error('join refused');
    this.id = id;
  }
}

describe('a World Beyond room', () => {
  it('says it is the Beyond, with the seed it was given, and puts a newcomer on dry land', () => {
    const room = new GameRoom({ seed: 4242, kind: 'beyond', naturalSpawning: false, rand: mulberry32(1) });
    expect(room.kind).toBe('beyond');
    expect(room.seed).toBe(4242);
    const c = new Client(room);
    c.join('ann');
    expect(c.messages[0]).toMatchObject({ t: 'joined', kind: 'beyond', seed: 4242 });
    const p = room.player(c.id)!;
    expect(room.world.generator).toBeInstanceOf(BeyondWorldGenerator);
    expect(p.body.y).toBeGreaterThan(SEA_LEVEL - 1);
    for (let i = 0; i < 40; i++) room.tick();
    expect(room.player(c.id)!.vitals.dead).toBe(false);
  }, 60000);

  it('is the same land on the server as in the client (the generator is shared)', () => {
    const a = makeGenerator(4242, 'beyond');
    const room = new GameRoom({ seed: 4242, kind: 'beyond', naturalSpawning: false, rand: mulberry32(1) });
    expect([...room.world.generator.generateChunk(5, -7)]).toEqual([...a.generateChunk(5, -7)]);
  });

  it('keeps its save apart from an overworld of the same seed', () => {
    const store = new MemoryRoomStore();
    const beyond = new GameRoom({ seed: 7, kind: 'beyond', naturalSpawning: false, rand: mulberry32(1), store });
    const c = new Client(beyond);
    c.join('ann');
    beyond.world.setBlock(3, 90, 3, 1);
    beyond.save();
    const over = new GameRoom({ seed: 7, naturalSpawning: false, rand: mulberry32(1), store });
    expect(over.world.getBlock(3, 90, 3)).not.toBe(1);
    const again = new GameRoom({ seed: 7, kind: 'beyond', naturalSpawning: false, rand: mulberry32(1), store });
    expect(again.world.getBlock(3, 90, 3)).toBe(1);
  }, 60000);
});
