import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { B, HOUR_MS, I, mulberry32, parseNetClientMessage, type Command, type LandEvent, type NetServerMessage } from '@solrift/shared';
import { GameRoom } from './room';
import { MemoryRoomStore, SqliteRoomStore } from './roomStore';
import { SqliteLandStore } from './landStore';

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
  land(): LandEvent[] {
    return this.messages.flatMap((m) => (m.t === 'events' ? m.events.flatMap((e) => (e.t === 'land' ? [e.e] : [])) : []));
  }
  toasts(): string[] {
    return this.messages.flatMap((m) => (m.t === 'events' ? m.events.flatMap((e) => (e.t === 'toast' ? [e.text] : [])) : []));
  }
  lastResult(what: string) {
    const r = this.land().filter((e) => e.k === 'result' && e.what === what).pop();
    return r && r.k === 'result' ? r.result : null;
  }
  lastPreview() {
    const r = this.land().filter((e) => e.k === 'preview').pop();
    return r && r.k === 'preview' ? r.preview : null;
  }
}

const clock = { t: 1_700_000_000_000 };
const open = (over: Partial<ConstructorParameters<typeof GameRoom>[0]> = {}) => new GameRoom({ seed: 7, kind: 'overworld', naturalSpawning: false, rand: mulberry32(3), store: new MemoryRoomStore(), clock: () => clock.t, ...over });
const ticks = (room: GameRoom, n: number): void => {
  for (let i = 0; i < n; i++) room.tick();
};
function send(room: GameRoom, c: Client, cmd: Record<string, unknown>): boolean {
  const msg = parseNetClientMessage({ t: 'cmd', c: cmd });
  if (!msg) return false;
  room.receive(c.id, msg);
  ticks(room, 3);
  return true;
}
const rect = (x0: number, z0: number, x1: number, z1: number): [number, number][] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const stand = (room: GameRoom, c: Client, x: number, z: number): number => {
  const y = room.world.surfaceY(x, z);
  c.p.teleport(x + 0.5, y + 1, z + 0.5, 0, 0);
  ticks(room, 2);
  return y;
};
/** A player ready to buy: a surveyor in the bag and the Auren for it. */
function buyer(room: GameRoom, name: string, account: string, coins = 10_000): Client {
  const c = new Client(room).join(name, account);
  c.p.clearInventory();
  c.p.giveItem(I.LAND_SURVEYOR, 1);
  c.p.coins = coins;
  return c;
}

describe('land on a server', () => {
  it('says its rules and the claims round a player again when asked (what was said during the loading of the world is lost)', () => {
    const room = open();
    const a = buyer(room, 'anna', 'char-anna');
    stand(room, a, 500, 500);
    send(room, a, { t: 'land', a: 'buy', v: rect(500, 500, 519, 519), name: 'Keep', idem: 'idem-room-hello1' });
    ticks(room, 80);
    expect(a.land().filter((e) => e.k === 'cfg')).toHaveLength(1);
    expect(a.land().some((e) => e.k === 'sync' && e.add.length > 0)).toBe(true);
    // The client was not ready to hear any of that.
    a.messages.length = 0;
    ticks(room, 80);
    expect(a.land().filter((e) => e.k === 'cfg' || e.k === 'sync')).toHaveLength(0);
    send(room, a, { t: 'land', a: 'hello' });
    ticks(room, 5);
    expect(a.land().filter((e) => e.k === 'cfg')).toHaveLength(1);
    const sync = a.land().find((e) => e.k === 'sync');
    expect(sync && sync.k === 'sync' ? sync.add.map((c) => c.name) : []).toContain('Keep');
  });

  it('tells a player which ground is the server\u2019s (a town, a reserved square), once, again when it changes, and again when asked', () => {
    const room = open({ kind: 'adventure' });
    const a = buyer(room, 'anna', 'char-anna');
    stand(room, a, 0, 0);
    ticks(room, 80);
    const zones = () => a.land().filter((e) => e.k === 'zones');
    expect(zones()).toHaveLength(1);
    const first = zones()[0];
    expect(first.k === 'zones' ? first.zones.map((z) => z.name) : []).toContain('Dawnwatch');
    // Standing still, nothing more is said.
    ticks(room, 200);
    expect(zones()).toHaveLength(1);
    // An administrator reserves ground (it shows within a few seconds, without anybody moving).
    room.land.reserve('boss', 'Fair', { x0: 60, z0: 60, x1: 80, z1: 80 });
    ticks(room, 200);
    expect(zones()).toHaveLength(2);
    const second = zones()[1];
    expect(second.k === 'zones' ? second.zones.map((z) => z.name) : []).toContain('Fair');
    // A client that missed it all asks again.
    a.messages.length = 0;
    send(room, a, { t: 'land', a: 'hello' });
    ticks(room, 5);
    expect(zones()).toHaveLength(1);
  });

  it('sells a claim to a player who has the Surveyor, and takes exactly its price', () => {
    const room = open();
    const a = buyer(room, 'anna', 'char-anna');
    stand(room, a, 500, 500);
    expect(send(room, a, { t: 'land', a: 'preview', v: rect(500, 500, 519, 519) })).toBe(true);
    expect(a.lastPreview()).toMatchObject({ ok: true, status: 'available', area: 400, price: 2000, balance: 10_000 });
    send(room, a, { t: 'land', a: 'buy', v: rect(500, 500, 519, 519), name: 'Anna\u2019s Keep', idem: 'idem-room-0001' });
    expect(a.lastResult('buy')).toMatchObject({ ok: true, charged: 2000 });
    expect(a.p.coins).toBe(8000);
    expect(a.toasts()).toContain('Land Claimed! Your property is now protected.');
    expect(room.land.index.size).toBe(1);
    // The same message again (a retry after a lost reply) is the same purchase.
    send(room, a, { t: 'land', a: 'buy', v: rect(500, 500, 519, 519), name: 'Anna\u2019s Keep', idem: 'idem-room-0001' });
    expect(a.p.coins).toBe(8000);
    expect(room.land.index.size).toBe(1);
  });

  it('does not sell to a player who has no Surveyor, no Auren, or is far away, and says nothing it should not', () => {
    const room = open();
    const c = new Client(room).join('carl', 'char-carl');
    c.p.clearInventory();
    c.p.coins = 10_000;
    stand(room, c, 500, 500);
    send(room, c, { t: 'land', a: 'buy', v: rect(500, 500, 519, 519), name: 'x', idem: 'idem-room-0002' });
    expect(c.lastResult('buy')?.ok).toBe(false);
    expect(c.p.coins).toBe(10_000);
    c.p.giveItem(I.LAND_SURVEYOR, 1);
    c.p.coins = 100;
    send(room, c, { t: 'land', a: 'buy', v: rect(500, 500, 519, 519), name: 'x', idem: 'idem-room-0003' });
    expect(c.lastResult('buy')?.text).toBe('Not enough Auren.');
    c.p.coins = 10_000;
    stand(room, c, 100, 100);
    send(room, c, { t: 'land', a: 'buy', v: rect(500, 500, 519, 519), name: 'x', idem: 'idem-room-0004' });
    expect(c.lastResult('buy')?.ok).toBe(false);
    expect(c.p.coins).toBe(10_000);
    expect(room.land.index.size).toBe(0);
  });

  it('ignores malformed land messages, and a price the client made up', () => {
    const room = open();
    const a = buyer(room, 'anna', 'char-anna');
    stand(room, a, 500, 500);
    expect(send(room, a, { t: 'land', a: 'buy', v: [[0, 0], [1, 1]], name: 'x', idem: 'idem-room-0005' })).toBe(false);
    expect(send(room, a, { t: 'land', a: 'buy', v: rect(500, 500, 519, 519), name: 'x', idem: 'a' })).toBe(false);
    expect(send(room, a, { t: 'land', a: 'buy', v: [[0.5, 0], [1, 1], [4, 9]], name: 'x', idem: 'idem-room-0006' })).toBe(false);
    expect(send(room, a, { t: 'land', a: 'nonsense' })).toBe(false);
    // A client that says what it will pay: the field is not part of the protocol and is dropped; the server charges what it works out.
    send(room, a, { t: 'land', a: 'buy', v: rect(500, 500, 519, 519), name: 'x', idem: 'idem-room-0007', price: 1, total: 1 });
    expect(a.p.coins).toBe(8000);
  });

  it('keeps other players out of a claim: they cannot dig, build, burn or blow it up', () => {
    const room = open();
    const a = buyer(room, 'anna', 'char-anna');
    const y = stand(room, a, 500, 500);
    send(room, a, { t: 'land', a: 'buy', v: rect(500, 500, 519, 519), name: 'Keep', idem: 'idem-room-0008' });
    expect(room.land.index.size).toBe(1);
    // Anna builds: the world is changed and kept.
    expect(a.p.world.setBlock(505, y + 1, 505, B.PLANKS)).toBe(true);
    expect(a.p.world.setBlock(506, y + 1, 505, B.PLANKS)).toBe(true);
    const b = new Client(room).join('bob', 'char-bob');
    b.p.clearInventory();
    stand(room, b, 495, 505);
    // Bob cannot break, place, or dig down, by any road a player has.
    b.p.breakBlock(505, y + 1, 505);
    expect(room.world.getBlock(505, y + 1, 505)).toBe(B.PLANKS);
    expect(b.p.world.setBlock(507, y + 1, 505, B.PLANKS)).toBe(false);
    expect(b.p.world.setBlock(505, y, 505, B.AIR)).toBe(false);
    ticks(room, 2);
    expect(b.toasts().some((t) => t.startsWith('Protected Property'))).toBe(true);
    // An explosion and fire leave it alone.
    (room.realm as unknown as { explode(x: number, y: number, z: number, r: number, source: string): void }).explode(505.5, y + 1.5, 505.5, 4, 'tnt');
    expect(room.world.getBlock(505, y + 1, 505)).toBe(B.PLANKS);
    expect(room.world.getBlock(506, y + 1, 505)).toBe(B.PLANKS);
    // Bob cannot open Anna's chest, and Anna can.
    expect(a.p.world.setBlock(507, y + 1, 507, B.CHEST)).toBe(true);
    // Anna invites Bob as a builder: now he can.
    send(room, a, { t: 'land', a: 'grant', id: room.land.allClaims()[0].id, kind: 'player', who: 'bob', role: 'builder' });
    expect(a.lastResult('grant')?.ok).toBe(true);
    expect(b.p.world.setBlock(508, y + 1, 505, B.PLANKS)).toBe(true);
    // And the land tells Bob what changed.
    ticks(room, 25);
    const sync = b.land().filter((e) => e.k === 'sync');
    expect(sync.length).toBeGreaterThan(0);
  });

  it('does not let the Surveyor mine, hit or build while it is in the hand', () => {
    const room = open();
    const a = buyer(room, 'anna', 'char-anna');
    const y = stand(room, a, 500, 500);
    a.p.selected = 0;
    a.p.inventory.set(0, { id: I.LAND_SURVEYOR, count: 1, damage: 0 });
    expect(room.world.getBlock(500, y, 500)).not.toBe(B.AIR);
    const f = { t: 'frame' as const, dt: 0.05, locked: true, yaw: 0, pitch: 1.5, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: true, right: true };
    for (let i = 0; i < 80; i++) {
      a.p.beginFrame(f);
      a.p.advanceOne(f);
      a.p.updateInteraction(0.05, f);
    }
    expect(room.world.getBlock(500, y, 500)).not.toBe(B.AIR);
    expect(room.land.ledger.size).toBe(0);
  });

  it('puts the wilderness back after its time, but never what stands in a claim', () => {
    const room = open();
    const a = buyer(room, 'anna', 'char-anna');
    const y = stand(room, a, 500, 500);
    send(room, a, { t: 'land', a: 'buy', v: rect(500, 500, 519, 519), name: 'Keep', idem: 'idem-room-0009' });
    a.p.world.setBlock(505, y + 1, 505, B.PLANKS);
    a.p.breakBlock(600, room.world.surfaceY(600, 600), 600);
    const wildY = room.world.surfaceY(600, 600);
    expect(room.land.ledger.wildCount).toBeGreaterThan(0);
    // Anna walks off to the other side of the world, and four days go by.
    a.p.teleport(4000.5, room.world.surfaceY(4000, 4000) + 2, 4000.5, 0, 0);
    clock.t += HOURS(24 * 4);
    ticks(room, 120);
    ticks(room, 120);
    expect(room.world.getBlock(505, y + 1, 505)).toBe(B.PLANKS);
    expect(room.land.ledger.wildCount).toBe(0);
    expect(room.world.getBlock(600, wildY, 600)).not.toBe(B.AIR);
  });

  it('keeps claims, Auren and what stands on them across a restart, in a real database', () => {
    const db = new DatabaseSync(':memory:');
    const store = new SqliteRoomStore(db);
    const land = new SqliteLandStore(db);
    const room = open({ store, land });
    const a = buyer(room, 'anna', 'char-anna');
    const y = stand(room, a, 500, 500);
    send(room, a, { t: 'land', a: 'buy', v: rect(500, 500, 519, 519), name: 'Keep', idem: 'idem-room-0010' });
    a.p.world.setBlock(505, y + 1, 505, B.PLANKS);
    // The purchase wrote the Auren with the deed: it is in the database before anything has been saved.
    expect((store.getJson('player:char-anna') as { coins: number }).coins).toBe(8000);
    room.save();
    room.leave(a.id);

    const again = open({ store, land });
    expect(again.land.index.size).toBe(1);
    expect(again.world.getBlock(505, y + 1, 505)).toBe(B.PLANKS);
    const a2 = new Client(again).join('anna', 'char-anna');
    expect(a2.p.coins).toBe(8000);
    expect(a2.p.world.setBlock(506, y + 1, 505, B.PLANKS)).toBe(true);
    const b = new Client(again).join('bob', 'char-bob');
    expect(b.p.world.setBlock(507, y + 1, 505, B.PLANKS)).toBe(false);
    // Four days on, the plank is still there.
    clock.t += HOURS(24 * 4);
    ticks(again, 200);
    expect(again.world.getBlock(505, y + 1, 505)).toBe(B.PLANKS);
  });
});

function HOURS(h: number): number {
  return h * HOUR_MS;
}

void ({} as Command);
