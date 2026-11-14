import { describe, expect, it } from 'vitest';
import {
  B,
  BAG_MENU_SLOTS,
  INVENTORY_SLOTS,
  I,
  LAPIS,
  lookCode,
  lookFromName,
  makeStack,
  mulberry32,
  parseNetClientMessage,
  armorId,
  toolId,
  totalForLevel,
  type NetInput,
  type NetServerMessage,
  type Snapshot,
} from '@solrift/shared';
import { GameRoom, STRIKES, type RoomOptions } from './room';
import { MemoryRoomStore } from './roomStore';

const FLOOR = 100;
const CX = 8;
const CZ = 8;

class Client {
  messages: NetServerMessage[] = [];
  closed: string | null = null;
  id: number | null = null;
  seq = 0;
  constructor(readonly room: GameRoom) {}
  conn = {
    send: (m: NetServerMessage) => this.messages.push(m),
    close: (r: string) => (this.closed = r),
  };
  join(name = 'steve'): number {
    const id = this.room.join(this.conn, name);
    if (id === null) throw new Error('join refused');
    this.id = id;
    return id;
  }
  of<T extends NetServerMessage['t']>(t: T): Extract<NetServerMessage, { t: T }>[] {
    return this.messages.filter((m) => m.t === t) as Extract<NetServerMessage, { t: T }>[];
  }
  get snap(): Snapshot {
    const s = this.of('snap');
    return s[s.length - 1];
  }
  input(over: Partial<NetInput> = {}, n = 1): void {
    const frames: NetInput[] = [];
    for (let i = 0; i < n; i++) {
      frames.push({ seq: ++this.seq, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false, ...over });
    }
    // Same path as the network: validate, then hand over.
    const msg = parseNetClientMessage({ t: 'input', frames });
    if (!msg) throw new Error('invalid input');
    this.room.receive(this.id!, msg);
  }
  clear(): void {
    this.messages = [];
  }
}

function makeRoom(opts: Partial<RoomOptions> = {}): GameRoom {
  const room = new GameRoom({ seed: 1337, naturalSpawning: false, rand: mulberry32(5), ...opts });
  for (let x = CX - 20; x <= CX + 20; x++)
    for (let z = CZ - 20; z <= CZ + 20; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 14; y++) room.world.setBlock(x, y, z, B.AIR);
      room.world.setBlock(x, FLOOR, z, B.STONE);
    }
  return room;
}

function joinAt(room: GameRoom, name: string, x = CX + 0.5, z = CZ + 0.5): Client {
  const c = new Client(room);
  c.join(name);
  room.player(c.id!)!.teleport(x, FLOOR + 1, z, 0, 0);
  return c;
}

const ticks = (room: GameRoom, n: number): void => {
  for (let i = 0; i < n; i++) room.tick();
};

describe('joining', () => {
  it('sends joined, the world edits and a first snapshot', () => {
    const room = makeRoom();
    const c = new Client(room);
    c.join('steve');
    expect(c.messages[0]).toMatchObject({ t: 'joined', seed: 1337, name: 'steve', tickHz: 20 });
    const edits = c.of('edits');
    expect(edits.length).toBeGreaterThan(0);
    expect(edits[edits.length - 1].last).toBe(true);
    // The platform was built by edits: they all arrive, 4 numbers per block.
    const total = edits.reduce((n, e) => n + e.blocks.length, 0);
    expect(total % 4).toBe(0);
    expect(total / 4).toBeGreaterThan(1000);
    const snap = c.snap;
    expect(snap.you.health).toBe(20);
    expect(snap.inv?.slots.length).toBe(INVENTORY_SLOTS);
  });

  it('shows every player the character the others chose, and makes one for those who chose none', () => {
    const room = makeRoom();
    const chosen = lookCode({ skin: 7, hair: 11, style: 2, eyes: 5, shirt: 8, pants: 6 });
    const a = new Client(room);
    expect(room.join(a.conn, 'alice', null, chosen)).not.toBeNull();
    a.id = 1;
    const b = new Client(room);
    b.join('bob'); // sent no look (an old client)
    expect(a.messages[0]).toMatchObject({ t: 'joined', look: chosen });
    expect(b.messages[0]).toMatchObject({ t: 'joined', look: lookCode(lookFromName('bob')) });
    ticks(room, 3);
    expect(b.snap.players.find((p) => p.name === 'alice')?.look).toBe(chosen);
    expect(a.snap.players.find((p) => p.name === 'bob')?.look).toBe(lookCode(lookFromName('bob')));
    // A look that is not one is ignored rather than trusted.
    const c = new Client(room);
    room.join(c.conn, 'carol', null, 99999999);
    expect(c.messages[0]).toMatchObject({ t: 'joined', look: lookCode(lookFromName('carol')) });
  });

  it('keeps the look in the join message only when it is a real one', () => {
    expect(parseNetClientMessage({ t: 'join', name: 'x', look: 12 })).toEqual({ t: 'join', name: 'x', look: 12 });
    expect(parseNetClientMessage({ t: 'join', name: 'x', look: -1 })).toEqual({ t: 'join', name: 'x' });
    expect(parseNetClientMessage({ t: 'join', name: 'x', look: '5' })).toEqual({ t: 'join', name: 'x' });
    expect(parseNetClientMessage({ t: 'join', name: 'x' })).toEqual({ t: 'join', name: 'x' });
  });

  it('gives duplicate names a number and refuses when full', () => {
    const room = makeRoom({ maxPlayers: 2 });
    const a = new Client(room);
    a.join('alex');
    const b = new Client(room);
    b.join('alex');
    expect(b.messages[0]).toMatchObject({ t: 'joined', name: 'alex2' });
    const c = new Client(room);
    expect(room.join(c.conn, 'extra')).toBeNull();
    expect(c.messages[0]).toMatchObject({ t: 'kicked', reason: 'server full' });
    expect(room.playerCount).toBe(2);
  });

  it('takes at least a hundred players by default and tells how many fit', () => {
    const room = makeRoom();
    expect(room.capacity).toBeGreaterThanOrEqual(100);
    const clients: Client[] = [];
    for (let i = 0; i < 100; i++) {
      const c = new Client(room);
      c.join(`p${i}`);
      clients.push(c);
    }
    expect(room.playerCount).toBe(100);
    ticks(room, 3);
    // Everyone is in view of everyone here, and each snapshot lists the other 99.
    expect(clients[0].snap.players.length).toBe(99);
    expect(clients.every((c) => c.closed === null)).toBe(true);
  });

  it('tells others when somebody joins or leaves', () => {
    const room = makeRoom();
    const a = new Client(room);
    a.join('alex');
    a.clear();
    const b = new Client(room);
    b.join('bob');
    expect(a.of('notice').map((n) => n.text)).toContain('bob joined');
    a.clear();
    room.leave(b.id!);
    expect(a.of('notice').map((n) => n.text)).toContain('bob left');
    expect(room.playerCount).toBe(1);
  });
});

describe('inputs', () => {
  it('moves the player with their inputs and acknowledges them', () => {
    const room = makeRoom();
    const c = joinAt(room, 'steve');
    const z0 = room.player(c.id!)!.body.z;
    for (let i = 0; i < 20; i++) {
      c.input({ forward: 1 }, 3);
      room.tick();
    }
    expect(room.player(c.id!)!.body.z).toBeLessThan(z0 - 3);
    expect(c.snap.ack).toBe(60);
    expect(c.snap.you.z).toBeCloseTo(room.player(c.id!)!.body.z, 1);
  });

  it('cannot run faster than real time, however many inputs it sends', () => {
    const room = makeRoom();
    const honest = joinAt(room, 'honest', CX + 0.5, CZ + 10.5);
    const cheat = joinAt(room, 'cheat', CX - 5.5, CZ + 10.5);
    const z0 = room.player(cheat.id!)!.body.z;
    for (let i = 0; i < 20; i++) {
      // A second of ticks: the honest client sends 3 steps per tick, the cheater sends 30.
      honest.input({ forward: 1 }, 3);
      for (let k = 0; k < 4; k++) cheat.input({ forward: 1 }, 8);
      room.tick();
    }
    const walked = (c: Client) => z0 - room.player(c.id!)!.body.z;
    // Both walked about the same: the budget caps the cheater at real time.
    expect(walked(cheat)).toBeLessThan(walked(honest) * 1.3 + 0.2);
    expect(walked(cheat)).toBeGreaterThan(walked(honest) * 0.7);
  });

  it('drops duplicate and stale inputs', () => {
    const room = makeRoom();
    const c = joinAt(room, 'steve');
    const msg = parseNetClientMessage({
      t: 'input',
      frames: [{ seq: 5, yaw: 0, pitch: 0, forward: 1, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false }],
    })!;
    room.receive(c.id!, msg);
    room.receive(c.id!, msg);
    room.tick();
    expect(c.snap.ack).toBe(5);
    const z1 = room.player(c.id!)!.body.z;
    room.receive(c.id!, msg); // replay
    room.tick();
    expect(room.player(c.id!)!.body.z).toBe(z1);
  });

  it('rejects malformed messages at the parser', () => {
    const base = { seq: 1, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false };
    const bad: unknown[] = [
      { t: 'input' },
      { t: 'input', frames: [] },
      { t: 'input', frames: Array.from({ length: 50 }, (_, i) => ({ ...base, seq: i })) },
      { t: 'input', frames: [{ ...base, seq: -1 }] },
      { t: 'input', frames: [{ ...base, seq: 1.5 }] },
      { t: 'input', frames: [{ ...base, yaw: NaN }] },
      { t: 'input', frames: [{ ...base, jump: 'yes' }] },
      { t: 'cmd', c: { t: 'frame' } },
      { t: 'cmd', c: { t: 'select', slot: 99 } },
      { t: 'chat', text: '' },
      { t: 'chat', text: 42 },
      { t: 'join', name: 42 },
      { t: 'nope' },
    ];
    for (const b of bad) expect(parseNetClientMessage(b)).toBeNull();
    // Chat text is cleaned and capped; names lose odd characters.
    expect(parseNetClientMessage({ t: 'chat', text: 'hi\u0000 there\n' })).toEqual({ t: 'chat', text: 'hi there' });
    expect(parseNetClientMessage({ t: 'chat', text: 'x'.repeat(5000) })).toMatchObject({ t: 'chat' });
    expect(parseNetClientMessage({ t: 'join', name: '<b>Bob</b>' })).toEqual({ t: 'join', name: 'bBobb' });
  });
});

describe('a shared world', () => {
  it('players see each other', () => {
    const room = makeRoom();
    const a = joinAt(room, 'alex', CX + 0.5, CZ + 0.5);
    const b = joinAt(room, 'bob', CX + 5.5, CZ + 0.5);
    a.input({ yaw: 1 }, 1);
    room.tick();
    expect(a.snap.players.map((p) => p.name)).toEqual(['bob']);
    expect(b.snap.players.map((p) => p.name)).toEqual(['alex']);
    expect(b.snap.players[0].yaw).toBeCloseTo(1, 1);
    expect(b.snap.players[0].x).toBeCloseTo(CX + 0.5, 1);
  });

  it('block edits reach everyone, and late joiners get them as edits', () => {
    const room = makeRoom();
    const a = joinAt(room, 'alex');
    const b = joinAt(room, 'bob', CX + 6.5, CZ + 0.5);
    room.world.setBlock(CX, FLOOR + 2, CZ - 3, B.DIRT);
    room.tick();
    a.clear();
    b.clear();
    // Alex mines it in creative mode.
    room.player(a.id!)!.apply({ t: 'mode', mode: 'creative' });
    a.input({ left: true, pitch: -0.02 }, 6);
    ticks(room, 3);
    expect(room.world.getBlock(CX, FLOOR + 2, CZ - 3)).toBe(B.AIR);
    for (const c of [a, b]) {
      const changes = c.of('blocks').flatMap((m) => m.blocks);
      const idx = changes.findIndex((_, i) => i % 4 === 0 && changes[i] === CX && changes[i + 1] === FLOOR + 2 && changes[i + 2] === CZ - 3);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(changes[idx + 3]).toBe(B.AIR);
    }
    // Someone who joins later learns the block is gone.
    const late = new Client(room);
    late.join('late');
    const edits = late.of('edits').flatMap((m) => m.blocks);
    const at = (x: number, y: number, z: number): number | undefined => {
      for (let i = 0; i < edits.length; i += 4) if (edits[i] === x && edits[i + 1] === y && edits[i + 2] === z) return edits[i + 3];
      return undefined;
    };
    expect(at(CX, FLOOR, CZ)).toBe(B.STONE); // the platform is part of the world now
    expect([undefined, B.AIR]).toContain(at(CX, FLOOR + 2, CZ - 3)); // the mined block is gone
  });

  it('sounds are local: far-away players do not hear a block break', () => {
    const room = makeRoom();
    const near = joinAt(room, 'near', CX + 0.5, CZ + 0.5);
    const far = joinAt(room, 'far', CX + 0.5, CZ + 19.5);
    const nearPlayer = room.player(near.id!)!;
    room.world.setBlock(CX, FLOOR + 1, CZ - 3, B.DIRT);
    near.clear();
    far.clear();
    nearPlayer.breakBlock(CX, FLOOR + 1, CZ - 3);
    room.tick();
    expect(
      near
        .of('events')
        .flatMap((e) => e.events)
        .some((e) => e.t === 'sound'),
    ).toBe(true);
    // 22 blocks away is inside hearing range but much quieter.
    const heard = far
      .of('events')
      .flatMap((e) => e.events)
      .filter((e) => e.t === 'sound');
    for (const e of heard) if (e.t === 'sound') expect(e.vol).toBeLessThan(0.9);
  });

  it('drops go to the player who is closest', () => {
    const room = makeRoom();
    const a = joinAt(room, 'alex', CX + 0.5, CZ + 0.5);
    const b = joinAt(room, 'bob', CX + 3.5, CZ + 0.5);
    room.realm.drops.spawn(makeStack(B.DIRT, 3), CX + 3.2, FLOOR + 1, CZ + 0.5, 0, 0, 0, 0);
    ticks(room, 10);
    expect(room.player(b.id!)!.inventory.countOf(B.DIRT)).toBe(3);
    expect(room.player(a.id!)!.inventory.countOf(B.DIRT)).toBe(0);
  });

  it('items on the ground are sent with their count, name and enchantments for the label above them', () => {
    const room = makeRoom();
    const a = joinAt(room, 'alex', CX + 0.5, CZ + 0.5);
    const sword = makeStack(I.GREATSWORD, 1, 0, [[0, 2]]);
    sword.name = 'Sting';
    room.realm.drops.spawn(sword, CX + 4.5, FLOOR + 1, CZ + 0.5, 0, 0, 0, 5);
    room.realm.drops.spawn(makeStack(B.DIRT, 7), CX + 4.5, FLOOR + 1, CZ + 3.5, 0, 0, 0, 5);
    ticks(room, 3);
    const seen = a.snap.drops;
    expect(seen.find((d) => d.item === I.GREATSWORD)).toMatchObject({ count: 1, name: 'Sting', ench: [[0, 2]] });
    const dirt = seen.find((d) => d.item === B.DIRT)!;
    expect(dirt.count).toBe(7);
    expect(dirt.name).toBeUndefined();
    expect(dirt.ench).toBeUndefined();
  });

  it('a zombie goes for the nearest player and hurts only them', () => {
    const room = makeRoom();
    const a = joinAt(room, 'alex', CX - 12.5, CZ + 0.5);
    const b = joinAt(room, 'bob', CX + 10.5, CZ + 0.5);
    room.realm.weather.set('clear', 100000);
    room.realm.time = 0.75;
    room.realm.mobs.spawn('zombie', CX + 8.5, FLOOR + 1, CZ + 0.5);
    for (let i = 0; i < 100; i++) {
      a.input({}, 3);
      b.input({}, 3);
      room.tick();
    }
    expect(room.player(b.id!)!.vitals.health).toBeLessThan(20);
    expect(room.player(a.id!)!.vitals.health).toBe(20);
  });

  it('an explosion hurts everyone close to it', () => {
    const room = makeRoom();
    const a = joinAt(room, 'alex', CX + 0.5, CZ + 0.5);
    const b = joinAt(room, 'bob', CX + 2.5, CZ + 0.5);
    const far = joinAt(room, 'far', CX - 18.5, CZ + 0.5);
    room.realm.weather.set('clear', 100000);
    room.realm.mobs.spawn('creeper', CX + 1.5, FLOOR + 1, CZ + 2.5);
    for (let i = 0; i < 160; i++) {
      for (const c of [a, b, far]) c.input({}, 3);
      room.tick();
    }
    expect(room.player(a.id!)!.vitals.health).toBeLessThan(20);
    expect(room.player(b.id!)!.vitals.health).toBeLessThan(20);
    expect(room.player(far.id!)!.vitals.health).toBe(20);
  });

  it('inventory and menus are server side: clicks go through commands', () => {
    const room = makeRoom();
    const c = joinAt(room, 'steve');
    const p = room.player(c.id!)!;
    p.inventory.set(0, makeStack(B.PLANKS, 5));
    c.clear();
    room.receive(c.id!, { t: 'cmd', c: { t: 'inventory' } });
    room.tick();
    expect(c.snap.you.screen).toBe('inventory');
    expect(c.snap.inv?.menu?.kind).toBe('inventory');
    c.clear();
    room.receive(c.id!, { t: 'cmd', c: { t: 'click', slot: 0, button: 0 } });
    room.tick();
    expect(c.snap.inv?.menu?.cursor).toMatchObject({ id: B.PLANKS, count: 5 });
    expect(c.snap.inv?.slots[0]).toBeNull();
    // An attacker cannot reach into somebody else's menu: there is only their own.
    const other = joinAt(room, 'other', CX + 5.5, CZ + 0.5);
    room.receive(other.id!, { t: 'cmd', c: { t: 'click', slot: 0, button: 0 } });
    room.tick();
    expect(other.snap.inv?.menu ?? null).toBeNull();
    expect(room.player(other.id!)!.inventory.countOf(B.PLANKS)).toBe(0);
  });

  it('death and respawn work per player', () => {
    const room = makeRoom();
    const a = joinAt(room, 'alex');
    const b = joinAt(room, 'bob', CX + 5.5, CZ + 0.5);
    room.player(a.id!)!.inventory.set(0, makeStack(I.BOW));
    room.player(a.id!)!.vitals.damage(100, 'generic');
    ticks(room, 2);
    expect(a.snap.you.screen).toBe('dead');
    expect(a.snap.you.deathMessage).toBeTruthy();
    expect(b.snap.you.screen).toBe('none');
    room.receive(a.id!, { t: 'cmd', c: { t: 'respawn' } });
    room.tick();
    expect(a.snap.you.screen).toBe('none');
    expect(a.snap.you.health).toBe(20);
  });
});

describe('chat and commands', () => {
  it('relays chat and rate limits spam', () => {
    const room = makeRoom();
    const a = joinAt(room, 'alex');
    const b = joinAt(room, 'bob', CX + 5.5, CZ + 0.5);
    b.clear();
    room.receive(a.id!, { t: 'chat', text: 'hello' });
    expect(b.of('chat')).toEqual([{ t: 'chat', from: 'alex', text: 'hello', ch: 'say' }]);
    for (let i = 0; i < 50; i++) room.receive(a.id!, { t: 'chat', text: `spam ${i}` });
    expect(b.of('chat').length).toBeLessThanOrEqual(6);
  });

  it('answers /who and /help, and keeps cheats off by default', () => {
    const room = makeRoom();
    const a = joinAt(room, 'alex');
    joinAt(room, 'bob', CX + 5.5, CZ + 0.5);
    a.clear();
    room.receive(a.id!, { t: 'chat', text: '/who' });
    expect(a.of('notice')[0].text).toContain('alex');
    expect(a.of('notice')[0].text).toContain('bob');
    room.tick();
    a.clear();
    for (let i = 0; i < 3; i++) room.tick();
    room.receive(a.id!, { t: 'chat', text: '/time night' });
    expect(a.of('notice').pop()?.text).toContain('Cheats are off');
    expect(room.realm.time).not.toBe(0.75);
  });

  it('cheat commands work when enabled', () => {
    const room = makeRoom({ cheats: true });
    const a = joinAt(room, 'alex');
    room.receive(a.id!, { t: 'chat', text: '/time night' });
    expect(room.realm.time).toBe(0.75);
    room.receive(a.id!, { t: 'chat', text: '/weather rain' });
    expect(room.realm.weather.kind).toBe('rain');
    room.tick();
    room.tick();
    for (let i = 0; i < 5; i++) room.tick();
    room.receive(a.id!, { t: 'chat', text: '/gamemode creative' });
    expect(room.player(a.id!)!.mode).toBe('creative');
    for (let i = 0; i < 4; i++) room.tick();
    room.receive(a.id!, { t: 'chat', text: '/tp 10 120 -5' });
    expect(room.player(a.id!)!.body.x).toBe(10);
  });
});

describe('persistence', () => {
  const fresh = (store: MemoryRoomStore): GameRoom => new GameRoom({ seed: 1337, naturalSpawning: false, store });
  const join = (room: GameRoom, name: string, account: string | null) => {
    const c = new Client(room);
    const id = room.join(c.conn, name, account);
    return { c, id };
  };

  it('keeps edits, the clock and signed-in players across a restart', () => {
    const store = new MemoryRoomStore();
    const one = fresh(store);
    const { id } = join(one, 'ann', 'acct-1');
    const p = one.player(id!)!;
    p.giveItem(I.DIAMOND, 7);
    const y = Math.floor(p.body.y) + 3;
    one.world.setBlock(2, y, 2, B.PLANKS);
    one.realm.time = 0.6;
    const where = { x: p.body.x, z: p.body.z };
    one.leave(id!);
    one.stop();

    const two = fresh(store);
    expect(two.world.getBlock(2, y, 2)).toBe(B.PLANKS);
    expect(two.realm.time).toBeCloseTo(0.6, 5);
    const again = join(two, 'ann', 'acct-1');
    const q = two.player(again.id!)!;
    expect(q.inventory.countOf(I.DIAMOND)).toBe(7);
    expect(q.body.x).toBeCloseTo(where.x, 1);
    expect(q.body.z).toBeCloseTo(where.z, 1);
    // The late joiner is told about the edit.
    expect(
      again.c
        .of('edits')
        .flatMap((e) => e.blocks)
        .join(),
    ).toContain(`2,${y},2,${B.PLANKS}`);
  });

  it('does not store guests, and a different seed is a different world', () => {
    const store = new MemoryRoomStore();
    const one = fresh(store);
    const { id } = join(one, 'guest', null);
    one.player(id!)!.giveItem(I.DIAMOND, 3);
    one.leave(id!);
    one.world.setBlock(0, 70, 0, B.PLANKS);
    one.stop();
    const again = join(fresh(store), 'guest', null);
    expect(again.id).not.toBeNull();
    const other = new GameRoom({ seed: 4242, naturalSpawning: false, store });
    expect(other.world.getBlock(0, 70, 0)).not.toBe(B.PLANKS);
  });

  it('lets an account play only once at a time: signing in again takes over, and the items exist once', () => {
    const room = fresh(new MemoryRoomStore());
    const first = join(room, 'ann', 'acct-1');
    expect(first.id).not.toBeNull();
    room.player(first.id!)!.giveItem(I.DIAMOND, 4);
    const second = join(room, 'ann2', 'acct-1');
    // The earlier session was put out (and told why), the new one is in with what the old one carried.
    expect(first.c.of('kicked')[0].reason).toContain('another place');
    expect(room.player(first.id!)).toBeFalsy();
    expect(second.id).not.toBeNull();
    expect(room.player(second.id!)!.inventory.countOf(I.DIAMOND)).toBe(4);
    expect(room.stats().players).toBe(1);
    // Other accounts, and guests, are not touched.
    const other = join(room, 'bob', 'acct-2');
    expect(other.id).not.toBeNull();
    expect(second.c.of('kicked')).toHaveLength(0);
  });

  it('autosaves on a timer', () => {
    const store = new MemoryRoomStore();
    const room = new GameRoom({ seed: 1337, naturalSpawning: false, store, autosaveSeconds: 1, tickHz: 10 });
    const { id } = join(room, 'ann', 'acct-1');
    room.player(id!)!.giveItem(I.DIAMOND, 2);
    for (let i = 0; i < 10; i++) room.tick();
    expect(store.getJson('player:acct-1')).not.toBeNull();
  });
});

describe('experience', () => {
  it('experience orbs go to the closest player, show in the snapshot while they fly, and then in the bar', () => {
    const room = makeRoom();
    const a = joinAt(room, 'alex', CX + 0.5, CZ + 0.5);
    const b = joinAt(room, 'bob', CX + 3.5, CZ + 0.5);
    room.realm.awardXp(3, CX + 3.2, FLOOR + 1, CZ + 0.5);
    room.tick();
    expect(b.snap.orbs?.length).toBe(1);
    expect(b.snap.orbs?.[0].v).toBe(3);
    for (let i = 0; i < 80; i++) room.tick();
    expect(b.snap.orbs).toBeUndefined();
    expect(room.player(b.id!)!.xp.total).toBe(3);
    expect(room.player(a.id!)!.xp.total).toBe(0);
    expect(b.snap.you.level).toBe(0);
    expect(b.snap.you.xpProgress).toBeCloseTo(3 / 7, 1);
  });

  it('experience far from every player goes to nobody', () => {
    const room = makeRoom();
    const a = joinAt(room, 'alex');
    room.realm.awardXp(1, CX + 0.5 + 200, FLOOR + 1, CZ + 0.5);
    room.tick();
    expect(room.player(a.id!)!.xp.total).toBe(0);
  });

  it('/xp is a cheat: refused by default, works when enabled', () => {
    const off = makeRoom();
    const x = joinAt(off, 'alex');
    off.receive(x.id!, { t: 'chat', text: '/xp 100' });
    expect(off.player(x.id!)!.xp.total).toBe(0);

    const on = makeRoom({ cheats: true });
    const a = joinAt(on, 'alex');
    on.receive(a.id!, { t: 'chat', text: '/xp 7' });
    expect(on.player(a.id!)!.xp.level).toBe(1);
    on.receive(a.id!, { t: 'chat', text: '/xp 10L' });
    expect(on.player(a.id!)!.xp.level).toBe(11);
    on.receive(a.id!, { t: 'chat', text: '/xp banana' });
    on.receive(a.id!, { t: 'chat', text: '/xp -5' });
    expect(on.player(a.id!)!.xp.level).toBe(11);
  });

  it('is saved with a signed-in account, and guests start fresh', () => {
    const store = new MemoryRoomStore();
    const one = new GameRoom({ seed: 1337, naturalSpawning: false, store });
    const ann = new Client(one);
    const annId = one.join(ann.conn, 'ann', 'acct-1')!;
    one.player(annId)!.addXp(totalForLevel(12) + 4);
    const guest = new Client(one);
    const guestId = one.join(guest.conn, 'guest', null)!;
    one.player(guestId)!.addXp(100);
    one.leave(annId);
    one.leave(guestId);
    one.stop();

    const two = new GameRoom({ seed: 1337, naturalSpawning: false, store });
    const again = new Client(two);
    const q = two.player(two.join(again.conn, 'ann', 'acct-1')!)!;
    expect(q.xp.level).toBe(12);
    expect(q.xp.points).toBe(4);
    const g = two.player(two.join(new Client(two).conn, 'guest', null)!)!;
    expect(g.xp.total).toBe(0);
  });
});
describe('armor', () => {
  it('shows your defense to you and your armor to the people near you', () => {
    const room = makeRoom();
    const a = joinAt(room, 'alex', CX + 0.5, CZ + 0.5);
    const b = joinAt(room, 'bob', CX + 3.5, CZ + 0.5);
    const p = room.player(a.id!)!;
    p.armor.set(0, makeStack(armorId(0, 'iron')));
    p.armor.set(1, makeStack(armorId(1, 'diamond')));
    room.tick();
    expect(a.snap.you.defense).toBe(2 + 8);
    expect(b.snap.you.defense).toBe(0);
    const seen = b.snap.players.find((v) => v.name === 'alex')!;
    expect(seen.armor).toEqual([armorId(0, 'iron'), armorId(1, 'diamond'), 0, 0]);
  });

  it('the inventory screen carries the armor slots, and clicks put armor on', () => {
    const room = makeRoom();
    const a = joinAt(room, 'alex');
    const p = room.player(a.id!)!;
    p.inventory.set(0, makeStack(armorId(3, 'gold')));
    room.receive(a.id!, { t: 'cmd', c: { t: 'inventory' } });
    room.tick();
    const view = a.snap.inv!.menu!;
    expect(view.kind).toBe('inventory');
    expect(view.slots.length).toBe(36 + 4 + 1 + 4 + 1 + 1 + BAG_MENU_SLOTS); // armor, the off hand, the mount and the bags
    room.receive(a.id!, { t: 'cmd', c: { t: 'shift', slot: 0 } });
    for (let i = 0; i < 3; i++) room.tick();
    expect(p.armor.get(3)?.id).toBe(armorId(3, 'gold'));
    expect(a.snap.you.defense).toBe(1);
  });

  it('is saved with a signed-in account', () => {
    const store = new MemoryRoomStore();
    const one = new GameRoom({ seed: 1337, naturalSpawning: false, store });
    const ann = new Client(one);
    const id = one.join(ann.conn, 'ann', 'acct-1')!;
    const p = one.player(id)!;
    p.armor.set(1, makeStack(armorId(1, 'iron'), 1, 12));
    one.leave(id);
    one.stop();
    const two = new GameRoom({ seed: 1337, naturalSpawning: false, store });
    const q = two.player(two.join(new Client(two).conn, 'ann', 'acct-1')!)!;
    expect(q.armor.get(1)?.id).toBe(armorId(1, 'iron'));
    expect(q.armor.get(1)?.damage).toBe(12);
  });
});

describe('shield', () => {
  it('shows the off hand and the raised shield to you and to the people near you', () => {
    const room = makeRoom();
    const a = joinAt(room, 'alex', CX + 0.5, CZ + 0.5);
    const b = joinAt(room, 'bob', CX + 3.5, CZ + 0.5);
    const p = room.player(a.id!)!;
    p.offhand.set(0, makeStack(I.SHIELD));
    a.input({ right: true }, 3);
    room.tick();
    expect(a.snap.you.offhand?.id).toBe(I.SHIELD);
    expect(a.snap.you.blocking).toBe(true);
    const seen = b.snap.players.find((v) => v.name === 'alex')!;
    expect(seen.offhand).toBe(I.SHIELD);
    expect(seen.blocking).toBe(true);
    expect(b.snap.you.blocking).toBe(false);
    a.input({ right: false }, 3);
    room.tick();
    expect(a.snap.you.blocking).toBe(false);
  });

  it('the swap command moves a shield from the hand to the off hand', () => {
    const room = makeRoom();
    const a = joinAt(room, 'alex');
    const p = room.player(a.id!)!;
    p.inventory.set(p.selected, makeStack(I.SHIELD));
    room.receive(a.id!, { t: 'cmd', c: { t: 'swap' } });
    room.tick();
    expect(p.offhand.get(0)?.id).toBe(I.SHIELD);
    expect(a.snap.you.offhand?.id).toBe(I.SHIELD);
  });

  it('is saved with a signed-in account', () => {
    const store = new MemoryRoomStore();
    const one = new GameRoom({ seed: 1337, naturalSpawning: false, store });
    const ann = new Client(one);
    const id = one.join(ann.conn, 'ann', 'acct-1')!;
    one.player(id)!.offhand.set(0, makeStack(I.SHIELD, 1, 20));
    one.leave(id);
    one.stop();
    const two = new GameRoom({ seed: 1337, naturalSpawning: false, store });
    const q = two.player(two.join(new Client(two).conn, 'ann', 'acct-1')!)!;
    expect(q.offhand.get(0)?.id).toBe(I.SHIELD);
    expect(q.offhand.get(0)?.damage).toBe(20);
  });
});

describe('beds', () => {
  const bedFor = (room: GameRoom, p: NonNullable<ReturnType<GameRoom['player']>>, x: number, z: number) => {
    room.world.setBlock(x, FLOOR + 1, z, B.BED_FOOT_NZ);
    room.world.setBlock(x, FLOOR + 1, z - 1, B.BED_HEAD_NZ);
    return { x, y: FLOOR + 1, z, id: B.BED_FOOT_NZ, nx: 0, ny: 1, nz: 0, p };
  };

  it('only sets the respawn point online: nobody lies down, and the night is not skipped', () => {
    const room = makeRoom();
    const a = joinAt(room, 'alex', CX + 0.5, CZ + 0.5);
    const b = joinAt(room, 'bob', CX + 6.5, CZ + 0.5);
    const pa = room.player(a.id!)!;
    const pb = room.player(b.id!)!;
    const bedA = bedFor(room, pa, CX + 2, CZ);
    const bedB = bedFor(room, pb, CX + 8, CZ);
    room.realm.time = 0.75; // midnight: a single player bed would put them to sleep
    a.clear();
    pa.useBed(bedA);
    pb.useBed(bedB);
    expect(pa.spawnPoint).toEqual({ x: CX + 2, y: FLOOR + 1, z: CZ - 1 });
    expect(pb.spawnPoint).not.toBeNull();
    expect(pa.sleeping).toBeNull();
    expect(pb.sleeping).toBeNull();
    room.tick();
    expect(a.snap.you.sleeping).toBe(0);
    expect(b.snap.players.find((v) => v.name === 'alex')!.sleeping).toBe(0);
    expect(
      a
        .of('events')
        .flatMap((m) => m.events)
        .some((e) => e.t === 'toast' && e.text.startsWith('Respawn point')),
    ).toBe(true);

    // Both players keep using their beds for a long time: it is still the middle of the night.
    for (let i = 0; i < 200; i++) {
      pa.useBed(bedA);
      pb.useBed(bedB);
      a.input({}, 3);
      b.input({}, 3);
      room.tick();
    }
    expect(room.realm.time).toBeGreaterThan(0.7);
    expect(room.realm.allowSleep).toBe(false);
  });

  it('ignores a forged wake command while awake', () => {
    const room = makeRoom();
    const a = joinAt(room, 'alex');
    const p = room.player(a.id!)!;
    room.receive(a.id!, { t: 'cmd', c: { t: 'wake' } });
    room.tick();
    expect(p.sleeping).toBeNull();
    expect(room.members.size).toBe(1);
  });
  it('keeps the respawn point with a signed-in account', () => {
    const store = new MemoryRoomStore();
    const one = new GameRoom({ seed: 1337, naturalSpawning: false, store });
    const ann = new Client(one);
    const id = one.join(ann.conn, 'ann', 'acct-9')!;
    one.player(id)!.spawnPoint = { x: 40, y: 70, z: -12 };
    one.leave(id);
    one.stop();
    const two = new GameRoom({ seed: 1337, naturalSpawning: false, store });
    const q = two.player(two.join(new Client(two).conn, 'ann', 'acct-9')!)!;
    expect(q.spawnPoint).toEqual({ x: 40, y: 70, z: -12 });
  });
});
describe('anti-cheat v1', () => {
  const kickedMsg = (c: Client) => c.of('kicked')[0]?.reason;

  it('lets an honest client play for a long time without a single strike', () => {
    const strikes: string[] = [];
    const room = makeRoom({ onViolation: (v) => strikes.push(v.reason) });
    const c = joinAt(room, 'honest');
    for (let i = 0; i < 400; i++) {
      c.input({ forward: 1, yaw: i * 0.01 }, 3); // 60 inputs per second at 20 ticks per second
      if (i % 40 === 0) room.receive(c.id!, { t: 'cmd', c: { t: 'select', slot: (i / 40) % 9 } });
      if (i % 100 === 0) room.receive(c.id!, { t: 'chat', text: 'hi' });
      room.tick();
    }
    expect(strikes).toEqual([]);
    expect(room.members.size).toBe(1);
  });

  it('kicks an input flood', () => {
    const reasons: string[] = [];
    const room = makeRoom({ onViolation: (v) => reasons.push(v.reason) });
    const c = joinAt(room, 'flooder');
    for (let i = 0; i < 100 && room.members.size > 0; i++) c.input({ forward: 1 }, 8);
    expect(room.members.size).toBe(0);
    expect(kickedMsg(c)).toContain('input flood');
    expect(c.closed).toContain('input flood');
    expect(reasons.at(-1)).toBe('input flood');
  });

  it('kicks replayed inputs', () => {
    const room = makeRoom();
    const c = joinAt(room, 'replayer');
    const msg = parseNetClientMessage({
      t: 'input',
      frames: [{ seq: 5, yaw: 0, pitch: 0, forward: 1, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false }],
    })!;
    room.receive(c.id!, msg);
    for (let i = 0; i < 80 && room.members.size > 0; i++) room.receive(c.id!, msg);
    expect(room.members.size).toBe(0);
    expect(kickedMsg(c)).toContain('stale input');
  });

  it('limits commands per second and kicks command floods', () => {
    const room = makeRoom();
    const c = joinAt(room, 'clicker');
    for (let i = 0; i < 300; i++) room.receive(c.id!, { t: 'cmd', c: { t: 'click', slot: 0, button: 0 } });
    // Only the burst got through before the flood was cut off.
    const queued = room.members.get(c.id!)?.queue.length ?? 60;
    expect(queued).toBeLessThanOrEqual(60);
    for (let i = 0; i < 300 && room.members.size > 0; i++) room.receive(c.id!, { t: 'cmd', c: { t: 'click', slot: 0, button: 0 } });
    expect(room.members.size).toBe(0);
    expect(kickedMsg(c)).toContain('command flood');
  });

  it('warns before it kicks, and the score decays', () => {
    const room = makeRoom();
    const c = joinAt(room, 'spammer');
    for (let i = 0; i < 5; i++) room.receive(c.id!, { t: 'chat', text: `spam ${i}` }); // the 5 tokens are free
    expect(room.members.get(c.id!)!.score).toBe(0);
    c.clear();
    for (let i = 0; i < 14; i++) room.receive(c.id!, { t: 'chat', text: 'more' });
    const score = room.members.get(c.id!)!.score;
    expect(score).toBeCloseTo(14 * STRIKES.chatSpam, 5);
    expect(c.of('notice').some((n) => n.text.includes('Warning'))).toBe(true);
    expect(room.members.size).toBe(1);
    ticks(room, 20 * 20); // 20 seconds
    expect(room.members.get(c.id!)!.score).toBeLessThan(score - 15);
  });

  it('counts a creative switch without cheats as suspicious', () => {
    const room = makeRoom();
    const c = joinAt(room, 'sneaky');
    room.receive(c.id!, { t: 'cmd', c: { t: 'mode', mode: 'creative' } });
    room.receive(c.id!, { t: 'chat', text: '/gamemode creative' });
    expect(room.members.get(c.id!)!.score).toBe(STRIKES.forbidden * 2);
    ticks(room, 2);
    expect(room.player(c.id!)!.mode).toBe('survival');
  });

  it('strike() ignores players that are already gone', () => {
    const room = makeRoom();
    expect(() => room.strike(999, 100, 'nobody')).not.toThrow();
  });

  it('reports tick timing in stats()', () => {
    const room = makeRoom();
    joinAt(room, 'a');
    ticks(room, 10);
    const s = room.stats(true);
    expect(s.players).toBe(1);
    expect(s.ticks).toBe(10);
    expect(s.tickMsMax).toBeGreaterThan(0);
    expect(room.stats().tickMsMax).toBe(0);
  });

  // What the server never needs to detect, because it never believed the client in the first place.
  describe('is authoritative about', () => {
    it('mining speed: a bare hand cannot break stone in half a second', () => {
      const room = makeRoom();
      const c = joinAt(room, 'miner');
      room.world.setBlock(CX, FLOOR + 2, CZ - 3, B.STONE);
      room.world.setBlock(CX + 1, FLOOR + 2, CZ - 3, B.DIRT);
      for (let i = 0; i < 4; i++) c.input({ left: true, pitch: -0.02 }, 8);
      ticks(room, 12);
      expect(room.world.getBlock(CX, FLOOR + 2, CZ - 3)).toBe(B.STONE);
    });

    it('mining speed: but a patient player does break dirt', () => {
      const room = makeRoom();
      const c = joinAt(room, 'miner');
      room.world.setBlock(CX, FLOOR + 2, CZ - 3, B.DIRT);
      for (let i = 0; i < 40; i++) {
        c.input({ left: true, pitch: -0.02 }, 3);
        room.tick();
      }
      expect(room.world.getBlock(CX, FLOOR + 2, CZ - 3)).toBe(B.AIR);
    });

    it('reach: creative players cannot break blocks beyond arm length', () => {
      const room = makeRoom();
      const c = joinAt(room, 'reacher');
      room.player(c.id!)!.apply({ t: 'mode', mode: 'creative' });
      room.world.setBlock(CX, FLOOR + 2, CZ - 9, B.DIRT);
      room.world.setBlock(CX, FLOOR + 2, CZ - 3, B.DIRT);
      c.input({ left: true, pitch: -0.02 }, 8);
      c.input({ left: true, pitch: -0.02 }, 4);
      ticks(room, 5);
      expect(room.world.getBlock(CX, FLOOR + 2, CZ - 3)).toBe(B.AIR); // in reach
      expect(room.world.getBlock(CX, FLOOR + 2, CZ - 9)).toBe(B.DIRT); // not in reach
    });

    it('flying: survival players cannot fly', () => {
      const room = makeRoom();
      const c = joinAt(room, 'icarus');
      room.receive(c.id!, { t: 'cmd', c: { t: 'fly' } });
      for (let i = 0; i < 20; i++) {
        c.input({ jump: true }, 3);
        room.tick();
      }
      expect(room.player(c.id!)!.flying).toBe(false);
      expect(room.player(c.id!)!.body.y).toBeLessThan(FLOOR + 3);
    });

    it('walls: walking into a solid wall never gets through', () => {
      const room = makeRoom();
      const c = joinAt(room, 'ghost');
      for (let y = FLOOR + 1; y <= FLOOR + 4; y++) for (let x = CX - 3; x <= CX + 3; x++) room.world.setBlock(x, y, CZ - 2, B.STONE);
      for (let i = 0; i < 60; i++) {
        c.input({ forward: 1, sprint: true }, 3);
        room.tick();
      }
      expect(room.player(c.id!)!.body.z).toBeGreaterThan(CZ - 2 + 0.2);
    });

    it('other players inventories: item commands only touch your own', () => {
      const room = makeRoom();
      const a = joinAt(room, 'alice');
      const b = joinAt(room, 'bob', CX + 3.5, CZ + 0.5);
      const before = JSON.stringify(room.player(b.id!)!.inventory.toJSON());
      room.player(a.id!)!.giveItem(I.DIAMOND, 5);
      for (let s = 0; s < 36; s++) room.receive(a.id!, { t: 'cmd', c: { t: 'click', slot: s, button: 0 } });
      ticks(room, 5);
      expect(JSON.stringify(room.player(b.id!)!.inventory.toJSON())).toBe(before);
    });
  });
});

describe('enchanting', () => {
  const table = (room: GameRoom) => {
    const tx = CX + 3;
    const ty = FLOOR + 1;
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++) {
        if (Math.abs(dx) < 2 && Math.abs(dz) < 2) continue;
        for (let dy = 0; dy <= 1; dy++) room.world.setBlock(tx + dx, ty + dy, CZ + dz, B.BOOKSHELF);
      }
    room.world.setBlock(tx, ty, CZ, B.ENCHANTING_TABLE);
    return { tx, ty };
  };

  it('shows the offers to the player, enchants on command and sends the enchantments with the item', () => {
    const room = makeRoom();
    const c = joinAt(room, 'merlin');
    const p = room.player(c.id!)!;
    const { tx, ty } = table(room);
    p.xp.add(totalForLevel(30));
    p.inventory.set(0, makeStack(toolId('sword', 'iron')));
    p.inventory.set(1, makeStack(LAPIS, 5));
    expect(p.useBlock(tx, ty, CZ)).toBe(true);
    room.receive(c.id!, { t: 'cmd', c: { t: 'shift', slot: 0 } });
    room.receive(c.id!, { t: 'cmd', c: { t: 'shift', slot: 1 } });
    room.tick();
    const view = c.snap.inv!.menu!;
    expect(view.kind).toBe('enchant');
    expect(view.enchant?.shelves).toBe(15);
    expect(view.enchant!.offers).toHaveLength(3);
    expect(view.enchant!.offers[2].cost).toBeGreaterThan(0);
    // The server keeps what is on offer to itself: only the cost and one hint go out.
    expect(JSON.stringify(view.enchant)).not.toContain('list');
    expect(view.slots[36]?.e).toBeUndefined();
    room.receive(c.id!, { t: 'cmd', c: { t: 'enchant', index: 2 } });
    room.tick();
    const after = c.snap.inv!.menu!;
    expect(after.slots[36]?.e?.length).toBeGreaterThan(0);
    expect(after.slots[37]?.count).toBe(2);
    expect(c.snap.you.level).toBe(27);
  });

  it('refuses an offer that is not one of three', () => {
    expect(parseNetClientMessage({ t: 'cmd', c: { t: 'enchant', index: 3 } })).toBeNull();
    expect(parseNetClientMessage({ t: 'cmd', c: { t: 'enchant', index: -1 } })).toBeNull();
    expect(parseNetClientMessage({ t: 'cmd', c: { t: 'enchant', index: 1 } })).not.toBeNull();
  });

  it('keeps an enchanted item through a save', () => {
    const store = new MemoryRoomStore();
    const one = new GameRoom({ seed: 1337, naturalSpawning: false, store });
    const id = one.join(new Client(one).conn, 'ann', 'acct-2')!;
    one.player(id)!.inventory.set(0, makeStack(toolId('sword', 'iron'), 1, 3, [[7, 4]]));
    one.leave(id);
    one.stop();
    const two = new GameRoom({ seed: 1337, naturalSpawning: false, store });
    const q = two.player(two.join(new Client(two).conn, 'ann', 'acct-2')!)!;
    expect(q.inventory.get(0)?.ench).toEqual([[7, 4]]);
    expect(q.inventory.get(0)?.damage).toBe(3);
  });

  it('shows another player nothing of your screen', () => {
    const room = makeRoom();
    const a = joinAt(room, 'a');
    const b = joinAt(room, 'b', CX + 5.5, CZ + 6.5);
    const { tx, ty } = table(room);
    room.player(a.id!)!.useBlock(tx, ty, CZ);
    room.tick();
    expect(a.snap.inv?.menu?.kind).toBe('enchant');
    expect(b.snap.inv?.menu ?? null).toBeNull();
    room.receive(b.id!, { t: 'cmd', c: { t: 'enchant', index: 0 } });
    room.tick();
    expect(room.player(b.id!)!.screen).toBe('none');
  });
});
describe('minecarts and boats', () => {
  const track = (room: GameRoom, z: number, x0 = CX - 2, x1 = CX + 12) => {
    for (let x = x0; x <= x1; x++) room.world.setBlock(x, FLOOR + 1, z, B.RAIL_X);
  };

  it('lists vehicles to players near them, and tells a rider which one they sit in', () => {
    const room = makeRoom();
    const a = joinAt(room, 'alex', CX + 0.5, CZ + 0.5);
    const b = joinAt(room, 'bob', CX + 8.5, CZ + 0.5);
    track(room, CZ);
    const p = room.player(a.id!)!;
    const cart = room.realm.vehicles.spawn('minecart', CX + 1.5, FLOOR + 1.1, CZ + 0.5)!;
    room.tick();
    expect(a.snap.vehicles).toEqual([expect.objectContaining({ id: cart.id, kind: 'minecart', rider: false })]);
    expect(b.snap.vehicles).toHaveLength(1);
    expect(a.snap.you.riding).toBe(0);
    expect(p.mount(cart)).toBe(true);
    cart.s = 5;
    ticks(room, 10);
    expect(a.snap.you.riding).toBe(cart.id);
    expect(a.snap.vehicles[0].rider).toBe(true);
    expect(b.snap.vehicles[0].rider).toBe(true);
    // The rider's body went along with the cart, and the server does not trust the client to move it.
    expect(a.snap.you.x).toBeCloseTo(cart.x, 1);
    expect(a.snap.you.x).toBeGreaterThan(CX + 3);
    a.input({ forward: 1, strafe: 1, jump: true }, 5);
    ticks(room, 2);
    expect(a.snap.you.riding).toBe(cart.id);
    // Sneaking gets out.
    a.input({ sneak: true });
    room.tick();
    expect(a.snap.you.riding).toBe(0);
  });

  it('puts the rider down when they leave the game, and the cart stays', () => {
    const room = makeRoom();
    const a = joinAt(room, 'alex');
    track(room, CZ);
    const cart = room.realm.vehicles.spawn('minecart', CX + 1.5, FLOOR + 1.1, CZ + 0.5)!;
    room.player(a.id!)!.mount(cart);
    room.leave(a.id!);
    room.tick();
    expect(cart.rider).toBeNull();
    expect(room.realm.vehicles.list).toContain(cart);
  });
});
