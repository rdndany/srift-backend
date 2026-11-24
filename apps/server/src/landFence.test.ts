import { describe, expect, it } from 'vitest';
import { B, I, gateInfo, mulberry32, parseNetClientMessage, planFence, signInfo, type NetServerMessage } from '@solrift/shared';
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
  /** Every list of signs a snapshot has carried to this player, in order. */
  signLists() {
    return this.messages.flatMap((m) => (m.t === 'snap' && m.signs ? [m.signs] : []));
  }
}

const clock = { t: 1_700_000_000_000 };
const open = () => new GameRoom({ seed: 7, kind: 'overworld', naturalSpawning: false, rand: mulberry32(3), store: new MemoryRoomStore(), clock: () => clock.t });
const ticks = (room: GameRoom, n: number): void => {
  for (let i = 0; i < n; i++) room.tick();
};
function send(room: GameRoom, c: Client, cmd: Record<string, unknown>): void {
  const msg = parseNetClientMessage({ t: 'cmd', c: cmd });
  if (!msg) throw new Error('refused by the parser');
  room.receive(c.id, msg);
  ticks(room, 3);
}
const rect = (x0: number, z0: number, x1: number, z1: number): [number, number][] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const stand = (room: GameRoom, c: Client, x: number, z: number): void => {
  const y = room.world.surfaceY(x, z);
  c.p.teleport(x + 0.5, y + 1, z + 0.5, 0, 0);
  ticks(room, 2);
};
/** The blocks of a column from the ground up to where a fence could stand. */
const column = (room: GameRoom, x: number, z: number): number[] => {
  const out: number[] = [];
  for (let y = 40; y < 140; y++) out.push(room.world.getBlock(x, y, z));
  return out;
};
const find = (room: GameRoom, x: number, z: number, test: (id: number) => boolean): number => {
  for (let y = 40; y < 140; y++) if (test(room.world.getBlock(x, y, z))) return y;
  return -1;
};

describe('the fence a purchase builds, on a server', () => {
  it('fences the new land with a gate and a sign with the owner\u2019s name, which a neighbour is sent to read', () => {
    const room = open();
    const a = new Client(room).join('anna', 'char-anna');
    const b = new Client(room).join('ben', 'char-ben');
    for (const c of [a, b]) {
      c.p.clearInventory();
      c.p.giveItem(I.LAND_SURVEYOR, 1);
      c.p.coins = 10_000;
    }
    stand(room, a, 500, 530);
    send(room, a, { t: 'land', a: 'buy', v: rect(500, 500, 519, 519), name: 'Keep', idem: 'idem-fence-room-1' });
    ticks(room, 40);
    expect(room.land.index.size).toBe(1);
    const claim = [...room.land.index.all()][0];
    const plan = planFence(claim.polygon, { x: 500.5, z: 530.5 });
    // The fence stands on the boundary; the gate and the sign are where the plan put them.
    let fences = 0;
    for (const [x, z] of plan.cells) if (find(room, x, z, (id) => id === B.FENCE) >= 0) fences++;
    expect(fences).toBeGreaterThanOrEqual(Math.floor(plan.cells.length * 0.85));
    const gy = find(room, plan.gate!.at[0], plan.gate!.at[1], (id) => gateInfo(id) !== null);
    expect(gy).toBeGreaterThan(0);
    const sy = find(room, plan.sign!.at[0], plan.sign!.at[1], (id) => signInfo(id) !== null);
    expect(sy).toBeGreaterThan(0);
    expect(room.realm.blockEntities.signAt(plan.sign!.at[0], sy, plan.sign!.at[1])).toEqual(['Property of', 'anna', '', 'Keep']);
    // The buyer's money is the deed's: building the fence cost nothing more.
    expect(a.p.coins).toBe(10_000 - 400 * 5);

    // Whoever walks up to read it is sent the writing (once, then again only when something changes).
    stand(room, b, plan.sign!.at[0], plan.sign!.at[1] + 4);
    ticks(room, 40);
    const seen = b.signLists();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)).toEqual([{ x: plan.sign!.at[0], y: sy, z: plan.sign!.at[1], l: ['Property of', 'anna', '', 'Keep'] }]);
    const count = seen.length;
    ticks(room, 60);
    expect(b.signLists().length).toBe(count);
  });

  it('keeps the owner\u2019s sign the owner\u2019s to write on: a stranger\u2019s words are ignored, the owner\u2019s are kept and sent', () => {
    const room = open();
    const a = new Client(room).join('anna', 'char-anna');
    const b = new Client(room).join('ben', 'char-ben');
    a.p.clearInventory();
    a.p.giveItem(I.LAND_SURVEYOR, 1);
    a.p.coins = 10_000;
    stand(room, a, 500, 530);
    send(room, a, { t: 'land', a: 'buy', v: rect(500, 500, 519, 519), name: 'Keep', idem: 'idem-fence-room-2' });
    ticks(room, 40);
    const plan = planFence([...room.land.index.all()][0].polygon, { x: 500.5, z: 530.5 });
    const [sx, sz] = plan.sign!.at;
    const sy = find(room, sx, sz, (id) => signInfo(id) !== null);
    // A stranger standing at the sign says something else.
    b.p.teleport(sx + 0.5, sy + 0.5, sz + 0.5 + 2, 0, 0);
    ticks(room, 3);
    send(room, b, { t: 'sign', x: sx, y: sy, z: sz, lines: ['Mine now', '', '', ''] });
    expect(room.realm.blockEntities.signAt(sx, sy, sz)[0]).toBe('Property of');
    // The owner, from further than a stranger could be, in reach of the sign.
    a.p.teleport(sx + 0.5, sy + 0.5, sz + 0.5 + 2, 0, 0);
    ticks(room, 3);
    send(room, a, { t: 'sign', x: sx, y: sy, z: sz, lines: ['Anna', 'Keep out', '', ''] });
    expect(room.realm.blockEntities.signAt(sx, sy, sz)).toEqual(['Anna', 'Keep out', '', '']);
    // Far from the sign, nothing is written.
    a.p.teleport(sx + 0.5, sy + 0.5, sz + 0.5 + 40, 0, 0);
    ticks(room, 3);
    send(room, a, { t: 'sign', x: sx, y: sy, z: sz, lines: ['Far', '', '', ''] });
    expect(room.realm.blockEntities.signAt(sx, sy, sz)[0]).toBe('Anna');
    // And what is written on a column with no sign is not kept.
    send(room, a, { t: 'sign', x: sx + 3, y: sy, z: sz, lines: ['Nothing here', '', '', ''] });
    expect(room.realm.blockEntities.signAt(sx + 3, sy, sz)).toEqual(['', '', '', '']);
    expect(column(room, sx, sz).filter((id) => signInfo(id) !== null)).toHaveLength(1);
  });
});
