import { describe, expect, it } from 'vitest';
import { mulberry32, type NetServerMessage } from '@solrift/shared';
import { GameRoom } from './room';
import { MemoryRoomStore } from './roomStore';

class Client {
  messages: NetServerMessage[] = [];
  id = 0;
  conn = { send: (m: NetServerMessage) => this.messages.push(m), close: () => {} };
  constructor(readonly room: GameRoom) {}
  join(name: string, account: string): this {
    const id = this.room.join(this.conn, name, account, null, 'warrior', `wallet-${account}`);
    if (id === null) throw new Error('join refused');
    this.id = id;
    return this;
  }
  get p() {
    return this.room.player(this.id)!;
  }
}

/** A room with 100 players spread over a field, and `claims` claims among them. Every player walks a little each tick. */
function crowd(claims: number) {
  const room = new GameRoom({ seed: 7, kind: 'overworld', naturalSpawning: false, rand: mulberry32(3), store: new MemoryRoomStore() });
  const clients: Client[] = [];
  for (let i = 0; i < 100; i++) clients.push(new Client(room).join(`p${i}`, `char-${i}`));
  const rnd = mulberry32(99);
  for (let i = 0; i < claims; i++) {
    const x = 400 + (i % 10) * 40;
    const z = 400 + Math.floor(i / 10) * 40;
    const buyer = { balance: () => 1e9, charge: () => true, refund: () => {}, save: (): [string, unknown] => ['perf', 1] };
    const r = room.land.purchase({ account: `char-${i % 100}`, ownerName: `p${i % 100}`, name: `c${i}`, vertices: [[x, z], [x + 14, z], [x + 14, z + 14], [x, z + 14]], idem: `idem-perf-${i}-aaaa`, carries: true }, buyer);
    if (!r.ok) throw new Error(`claim ${i}: ${r.code} ${r.text}`);
  }
  const spots = clients.map((c, i) => ({ c, x: 400 + (i % 10) * 40 + 5, z: 400 + Math.floor(i / 10) * 40 + 5 }));
  const step = (): void => {
    for (const s of spots) {
      s.x += (rnd() - 0.5) * 2;
      s.z += (rnd() - 0.5) * 2;
      s.c.p.teleport(s.x, room.world.surfaceY(Math.floor(s.x), Math.floor(s.z)) + 1, s.z, 0, 0);
    }
    room.tick();
  };
  return { room, step, clients };
}
function msPerTick(claims: number, ticks: number): number {
  const { step, clients } = crowd(claims);
  for (let i = 0; i < 20; i++) step();
  const t0 = performance.now();
  for (let i = 0; i < ticks; i++) step();
  const ms = (performance.now() - t0) / ticks;
  for (const c of clients) c.messages.length = 0;
  return ms;
}

describe('land with a hundred players', () => {
  it('adds little to the tick: a hundred players moving among eighty claims cost about what they cost without any', () => {
    const base = msPerTick(0, 60);
    const withLand = msPerTick(80, 60);
    console.log(`tick: ${base.toFixed(2)} ms without claims, ${withLand.toFixed(2)} ms with 80 claims`);
    // A generous bound (timing on a busy machine is noisy): the land must not double the work, and a tick stays far under the 50 ms budget.
    expect(withLand).toBeLessThan(base * 1.6 + 2);
    expect(withLand).toBeLessThan(50);
  }, 120_000);

  it('answers 200,000 permission questions among eighty claims in well under three seconds', () => {
    const { room } = crowd(80);
    const t0 = performance.now();
    let ok = 0;
    for (let i = 0; i < 200_000; i++) {
      const x = 380 + ((i * 7) % 420);
      const z = 380 + ((i * 13) % 420);
      if (room.land.checkBuild(`char-${i % 100}`, x, 70, z, i % 2 ? 'place' : 'break', 1).ok) ok++;
    }
    const ms = performance.now() - t0;
    console.log(`200k checkBuild: ${ms.toFixed(0)} ms (${ok} allowed)`);
    expect(ms).toBeLessThan(3000);
    expect(ok).toBeGreaterThan(0);
  }, 60_000);
});
