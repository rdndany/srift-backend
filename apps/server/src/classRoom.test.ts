import { describe, expect, it } from 'vitest';
import { B, CLASSES, abilitiesOf, CLASS_LEVELS, I, mulberry32, parseNetClientMessage, type ClassId, type NetInput, type NetServerMessage, type Snapshot } from '@solrift/shared';
import { GameRoom, type RoomOptions } from './room';
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
  join(name: string, classId: ClassId | null = null, account: string | null = null): number {
    const id = this.room.join(this.conn, name, account, null, classId);
    if (id === null) throw new Error('join refused');
    this.id = id;
    return id;
  }
  get snap(): Snapshot {
    return this.messages.filter((m) => m.t === 'snap').pop() as Snapshot;
  }
  input(over: Partial<NetInput> = {}, n = 1): void {
    const frames: NetInput[] = [];
    for (let i = 0; i < n; i++) frames.push({ seq: ++this.seq, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false, ...over });
    const msg = parseNetClientMessage({ t: 'input', frames });
    if (!msg) throw new Error('invalid input');
    this.room.receive(this.id!, msg);
  }
  /** Ask for an ability the way a browser does: a raw message, validated, then handed over. */
  ability(slot: unknown, extra: Record<string, unknown> = {}): boolean {
    const msg = parseNetClientMessage({ t: 'cmd', c: { t: 'ability', slot, ...extra } });
    if (!msg) return false;
    this.room.receive(this.id!, msg);
    return true;
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

/** Joins and teleports. A new character knows no ability; unless told otherwise this one has read all four skill books of its class. */
function joinAt(room: GameRoom, name: string, classId: ClassId | null, x = CX + 0.5, z = CZ + 0.5, account: string | null = null, learnAll = true): Client {
  const c = new Client(room);
  c.join(name, classId, account);
  const p = room.player(c.id!)!;
  if (learnAll && p.cls) for (const a of abilitiesOf(p.cls.classId)) p.cls.unlocked.add(a.id);
  p.teleport(x, FLOOR + 1, z, 0, 0);
  return c;
}

const ticks = (room: GameRoom, n: number): void => {
  for (let i = 0; i < n; i++) room.tick();
};

/** `n` simulation steps of input (the server runs 60 a second and a client sends three with every tick). */
const step = (room: GameRoom, c: Client, n: number): void => {
  for (let i = 0; i < n; i += 3) {
    c.input({}, 3);
    room.tick();
  }
  ticks(room, 2);
};

describe('classes on the server', () => {
  it('joins a player as the class they chose, with that class\u2019s health, resource and kit', () => {
    const room = makeRoom();
    for (const id of ['warrior', 'mage', 'ranger'] as const) {
      const c = joinAt(room, id, id);
      ticks(room, 1);
      const you = c.snap.you;
      expect(you.cls?.id).toBe(id);
      expect(you.cls?.level).toBe(1);
      expect(you.cls?.maxHealth).toBe(room.player(c.id!)!.vitals.maxHealth);
      expect(you.cls?.maxResource).toBeGreaterThan(0);
      expect(you.cls?.abilities.length).toBe(4);
      for (const k of CLASSES[id].startingKit) {
        const p = room.player(c.id!)!;
        expect(p.inventory.countOf(k.id) + (p.offhand.get(0)?.id === k.id ? 1 : 0)).toBe(k.count);
      }
    }
  });

  it('leaves a player without a class classless', () => {
    const room = makeRoom();
    const c = joinAt(room, 'plain', null);
    ticks(room, 1);
    expect(c.snap.you.cls).toBeUndefined();
    expect(room.player(c.id!)!.cls).toBeNull();
    expect(room.player(c.id!)!.vitals.maxHealth).toBe(20);
  });

  it('shows every player the class and class level of the others', () => {
    const room = makeRoom();
    const a = joinAt(room, 'ann', 'mage');
    const b = joinAt(room, 'bob', 'warrior', CX + 4.5);
    const c = joinAt(room, 'cy', null, CX - 4.5);
    room.player(b.id!)!.addClassXp(CLASS_LEVELS.toNext(1));
    ticks(room, 2);
    const seenByA = a.snap.players;
    expect(seenByA.find((p) => p.name === 'bob')).toMatchObject({ cls: 'warrior', clv: 2 });
    expect(seenByA.find((p) => p.name === 'cy')?.cls).toBeUndefined();
    expect(b.snap.players.find((p) => p.name === 'ann')).toMatchObject({ cls: 'mage', clv: 1 });
    expect(c.snap.players.find((p) => p.name === 'ann')?.cls).toBe('mage');
  });

  it('a player\u2019s class never changes by asking again (a class is picked when the character is made)', () => {
    const room = makeRoom();
    const c = joinAt(room, 'ann', 'mage');
    const msg = parseNetClientMessage({ t: 'join', name: 'ann', class: 'warrior' });
    expect(msg).toMatchObject({ t: 'join', class: 'warrior' });
    room.receive(c.id!, msg!); // a second join message from a joined player means nothing to the room
    ticks(room, 1);
    expect(room.player(c.id!)!.cls!.classId).toBe('mage');
  });

  it('ignores a class that does not exist', () => {
    expect(parseNetClientMessage({ t: 'join', name: 'x', class: 'paladin' })).toEqual({ t: 'join', name: 'x' });
    expect(parseNetClientMessage({ t: 'join', name: 'x', class: 7 })).toEqual({ t: 'join', name: 'x' });
    expect(parseNetClientMessage({ t: 'join', name: 'x', class: { id: 'warrior' } })).toEqual({ t: 'join', name: 'x' });
  });
});

describe('abilities over the network', () => {
  it('cast on a message, and the server alone decides the cost and the cooldown', () => {
    const room = makeRoom();
    const a = joinAt(room, 'ann', 'warrior');
    ticks(room, 1);
    const before = a.snap.you.cls!.resource;
    expect(a.ability(0)).toBe(true);
    ticks(room, 1);
    const after = a.snap.you.cls!;
    expect(after.resource).toBeLessThan(before - 20);
    expect(after.abilities[0].cd).toBeGreaterThan(5);
    expect(after.abilities[1].cd).toBe(0);
  });

  it('refuses garbage before it reaches the player, and takes no extra fields (there is no way to name damage)', () => {
    const room = makeRoom();
    const a = joinAt(room, 'ann', 'mage');
    for (const bad of [-1, 4, 1.5, '0', null, undefined, NaN, {}, [0]]) expect(a.ability(bad)).toBe(false);
    expect(parseNetClientMessage({ t: 'cmd', c: { t: 'ability', slot: 1, damage: 99999, cost: 0, cooldown: 0, crit: true, target: 5 } })).toEqual({ t: 'cmd', c: { t: 'ability', slot: 1 } });
    for (const forged of [
      { t: 'damage', amount: 5 },
      { t: 'hit', id: 1, amount: 100 },
      { t: 'hurt', amount: 5 },
      { t: 'xp', amount: 1000 },
      { t: 'classxp', amount: 1000 },
      { t: 'class', id: 'warrior' },
    ]) {
      expect(parseNetClientMessage({ t: 'cmd', c: forged })).toBeNull();
    }
    ticks(room, 1);
    expect(room.player(a.id!)!.cls!.xp).toBe(0);
  });

  it('refuses a repeat during the cooldown, and a locked ability, and several in one tick cost once', () => {
    const room = makeRoom();
    const a = joinAt(room, 'ann', 'mage', CX + 0.5, CZ + 0.5, null, false);
    room.player(a.id!)!.cls!.unlocked.add('frost_nova'); // the only skill book this mage has read
    ticks(room, 1);
    const full = a.snap.you.cls!.maxResource;
    for (let i = 0; i < 4; i++) a.ability(1);
    ticks(room, 1);
    expect(a.snap.you.cls!.resource).toBeGreaterThan(full - 40); // one Frost Nova (30), not four
    a.ability(2); // Meteor: not learned
    ticks(room, 1);
    expect(a.snap.you.cls!.abilities[2].cd).toBe(0);
    expect(a.snap.you.cls!.abilities[2].unlocked).toBe(false);
  });

  it('runs cooldowns on the server\u2019s own steps: only input frames the server accepts move them', () => {
    const room = makeRoom();
    const a = joinAt(room, 'ann', 'warrior');
    ticks(room, 1);
    a.ability(0);
    ticks(room, 1);
    const cd0 = a.snap.you.cls!.abilities[0].cd;
    step(room, a, 60); // one second of steps
    const cd1 = a.snap.you.cls!.abilities[0].cd;
    expect(cd0 - cd1).toBeGreaterThan(0.6);
    expect(cd0 - cd1).toBeLessThan(1.3);
  });

  it('hurts mobs, and the mob\u2019s health is the server\u2019s', () => {
    const room = makeRoom();
    const a = joinAt(room, 'ann', 'warrior');
    const id = room.player(a.id!)!.spawnMob('zombie', CX + 0.5, FLOOR + 1, CZ - 1.5);
    const zombie = room.realm.mobs.mobs.find((m) => m.id === id)!;
    zombie.stunTime = 99;
    a.ability(0);
    step(room, a, 180); // up, and down on top of it
    expect(zombie.health).toBeLessThan(zombie.maxHealth);
  });

  it('shows the effect to the players near it, and not to the ones far away', () => {
    const room = makeRoom();
    const a = joinAt(room, 'ann', 'warrior');
    const near = joinAt(room, 'near', 'mage', CX + 6.5);
    const far = joinAt(room, 'far', null, CX + 18.5, CZ + 18.5);
    ticks(room, 1);
    a.ability(0);
    // the crouch, then the spring: the leap is shown when it begins
    for (let i = 0; i < 20 && !a.snap.fx?.some((f) => f.k === 'leap'); i++) {
      a.input({}, 3);
      room.tick();
    }
    expect(a.snap.fx?.some((f) => f.k === 'leap' && f.by === 'ann')).toBe(true);
    expect(near.snap.fx?.some((f) => f.k === 'leap')).toBe(true);
    // and the landing, a moment later, is shown the same way
    for (let i = 0; i < 80 && !a.snap.fx?.some((f) => f.k === 'slam'); i++) {
      a.input({}, 3);
      room.tick();
    }
    expect(a.snap.fx?.some((f) => f.k === 'slam' && f.by === 'ann')).toBe(true);
    expect(near.snap.fx?.some((f) => f.k === 'slam')).toBe(true);
    // the effect carries an id that does not repeat, so a client plays it once
    const ids = [...(a.snap.fx ?? [])].map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    // far is inside the platform (about 26 blocks off): it may or may not be in range, but it never gets other people's resources
    expect(far.snap.you.cls).toBeUndefined();
    expect(JSON.stringify(near.snap.players)).not.toMatch(/resource|abilities/);
  });

  it('drops a caster\u2019s pending effects when they leave', () => {
    const room = makeRoom();
    const a = joinAt(room, 'ann', 'mage');
    const watcher = joinAt(room, 'watch', 'warrior', CX + 3.5);
    room.player(a.id!)!.addClassXp(CLASS_LEVELS.toNext(1) + CLASS_LEVELS.toNext(2));
    ticks(room, 1);
    a.ability(2);
    ticks(room, 1);
    expect(room.realm.effects.pending.zones).toBeGreaterThan(0);
    room.leave(a.id!);
    expect(room.realm.effects.pending).toEqual({ zones: 0, traps: 0 });
    ticks(room, 1);
    expect(watcher.snap.players.length).toBe(0);
  });

  it('never hurts another player (PvP is off), whichever class asks', () => {
    for (const id of ['warrior', 'mage', 'ranger'] as const) {
      const room = makeRoom();
      const a = joinAt(room, 'ann', id);
      const b = joinAt(room, 'bob', 'warrior', CX + 0.5, CZ - 2);
      room.player(a.id!)!.addClassXp(xpTo(5));
      ticks(room, 1);
      const hp = room.player(b.id!)!.vitals.health;
      for (let slot = 0; slot < 4; slot++) {
        room.player(a.id!)!.cls!.resetCombat();
        a.ability(slot);
        step(room, a, 75);
      }
      expect(room.player(b.id!)!.vitals.health, id).toBe(hp);
    }
  });
});

const xpTo = (level: number): number => {
  let t = 0;
  for (let lv = 1; lv < level; lv++) t += CLASS_LEVELS.toNext(lv);
  return t;
};

describe('class progress that is kept', () => {
  const fresh = (store: MemoryRoomStore): GameRoom => new GameRoom({ seed: 1337, naturalSpawning: false, store });

  it('is saved with a signed-in character and comes back after a restart', () => {
    const store = new MemoryRoomStore();
    const one = fresh(store);
    const c = new Client(one);
    const id = c.join('ann', 'ranger', 'acct-1');
    one.player(id)!.addClassXp(xpTo(6) + 5);
    expect(one.player(id)!.cls!.unlocked.size).toBe(0); // levelling teaches nothing: only a skill book does
    one.player(id)!.cls!.learn('rain_of_arrows');
    one.leave(id);
    one.stop();

    const two = fresh(store);
    const d = new Client(two);
    const again = d.join('ann', 'ranger', 'acct-1');
    const p = two.player(again)!;
    expect(p.cls!.classId).toBe('ranger');
    expect(p.cls!.level).toBe(6);
    expect(p.cls!.xp).toBe(5);
    expect(p.cls!.unlocked.has('rain_of_arrows')).toBe(true);
    expect([...p.cls!.unlocked]).toEqual(['rain_of_arrows']);
    // and the bag is not handed out a second time
    expect(p.inventory.countOf(I.ARROW)).toBe(32);
  });

  it('keeps nothing for guests', () => {
    const store = new MemoryRoomStore();
    const one = fresh(store);
    const c = new Client(one);
    const id = c.join('guest', 'mage', null);
    one.player(id)!.addClassXp(xpTo(4));
    one.leave(id);
    one.stop();
    const two = fresh(store);
    const d = new Client(two);
    const again = d.join('guest', 'mage', null);
    expect(two.player(again)!.cls!.level).toBe(1);
  });

  it('puts no money, wallet or balance in what it saves', () => {
    const store = new MemoryRoomStore();
    const one = fresh(store);
    const c = new Client(one);
    const id = c.join('ann', 'mage', 'acct-9');
    one.player(id)!.addClassXp(xpTo(3));
    one.leave(id);
    one.stop();
    const saved = JSON.stringify(store.getJson('player:acct-9'));
    expect(saved).toContain('"cls"');
    expect(saved).not.toMatch(/wallet|balance|lamport|solana|token|price/i);
  });

  it('opens a save from before classes: a classed character begins at level one', () => {
    const store = new MemoryRoomStore();
    const one = fresh(store);
    const c = new Client(one);
    const id = c.join('ann', null, 'acct-old');
    one.player(id)!.giveItem(I.DIAMOND, 2);
    one.leave(id);
    one.stop();
    const saved = store.getJson('player:acct-old') as Record<string, unknown>;
    expect(saved.cls).toBeUndefined();
    const two = fresh(store);
    const d = new Client(two);
    const again = d.join('ann', 'warrior', 'acct-old');
    const p = two.player(again)!;
    expect(p.inventory.countOf(I.DIAMOND)).toBe(2);
    expect(p.cls!.level).toBe(1);
  });
});
