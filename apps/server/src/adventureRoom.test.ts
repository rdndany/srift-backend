import { describe, expect, it } from 'vitest';
import { ADVENTURE_LAYOUT, ADVENTURE_SEED, B, GENERATOR_VERSION, CELLAR_HOUSE, CHUNK_VOLUME, DUNGEON_MIN_LEVEL, FIRST_QUEST, I, INSTANCE_STRIDE, INSTANCE_X0, NPCS, makeStack, totalForLevel, SPAWN_SIZE, SPAWN_X0, SPAWN_Z0, makeGenerator, mulberry32, parseNetClientMessage, type AdventureWorldGenerator, type NetServerMessage, type Snapshot } from '@solrift/shared';
import { GameRoom } from './room';
import { MemoryRoomStore } from './roomStore';

const generator = makeGenerator(ADVENTURE_SEED, 'adventure') as AdventureWorldGenerator;

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
  get snap(): Snapshot {
    return this.messages.filter((m) => m.t === 'snap').pop() as Snapshot;
  }
  events() {
    return this.messages.flatMap((m) => (m.t === 'events' ? m.events : []));
  }
}

const ticks = (room: GameRoom, n: number): void => {
  for (let i = 0; i < n; i++) room.tick();
};

describe('an Adventure room', () => {
  it('has its own seed, and says what kind of world it is', () => {
    const room = new GameRoom({ seed: 1337, kind: 'adventure', naturalSpawning: false, rand: mulberry32(1) });
    expect(room.seed).toBe(ADVENTURE_SEED);
    expect(room.kind).toBe('adventure');
    const c = new Client(room);
    c.join('ann');
    expect(c.messages[0]).toMatchObject({ t: 'joined', kind: 'adventure', seed: ADVENTURE_SEED });
    expect(new GameRoom({ seed: 7, naturalSpawning: false }).kind).toBe('overworld');
  });

  it('puts every arrival in the cave under the village, each on a spot of their own, with nothing on them and the first quest waiting at the healer', () => {
    const room = new GameRoom({ seed: 1, kind: 'adventure', naturalSpawning: false, rand: mulberry32(2) });
    const clients: Client[] = [];
    for (let i = 0; i < 8; i++) {
      const c = new Client(room);
      c.join(`p${i}`);
      clients.push(c);
    }
    const spots = new Set<string>();
    for (const c of clients) {
      const p = room.player(c.id)!;
      const b = p.body;
      expect(b.y).toBeCloseTo(generator.undercroftY + 1, 5);
      expect(generator.zoneAt(b.x, b.y, b.z)).toBe('undercroft');
      expect(p.inventory.slots.filter((s) => s)).toEqual([]);
      spots.add(`${Math.floor(b.x)},${Math.floor(b.z)}`);
    }
    expect(spots.size).toBe(8);
    ticks(room, 2);
    for (const c of clients) {
      const quests = c.events().filter((e) => e.t === 'quests');
      expect(quests.length).toBeGreaterThan(0);
      expect(quests[quests.length - 1]).toMatchObject({ t: 'quests', log: { d: [], a: [] } });
      expect(room.player(c.id)!.quests!.status(FIRST_QUEST)).toBe('available');
    }
  }, 60000);

  it('mends the village in a world saved before the cave was dug, once, and wakes newcomers in it', () => {
    const store = new MemoryRoomStore();
    store.setJson(`terrain:${-ADVENTURE_SEED}`, GENERATOR_VERSION); // the land is as it is now; only the made places are older
    // An old save: the chunks the village stands on, as they were then (solid rock where the cave is now), and an edit outside it.
    const old = (): Uint16Array => new Uint16Array(CHUNK_VOLUME).fill(B.STONE);
    store.saveChunks(-ADVENTURE_SEED, [-1, 0].map((cx) => ({ cx, cz: 0, data: old() })));
    const far = old();
    store.saveChunks(-ADVENTURE_SEED, [{ cx: 40, cz: 40, data: far }]);
    const room = new GameRoom({ seed: 1, kind: 'adventure', naturalSpawning: false, rand: mulberry32(2), store });
    const c = new Client(room);
    c.join('ann');
    const b = room.player(c.id)!.body;
    expect(b.y).toBeCloseTo(generator.undercroftY + 1, 5);
    expect(generator.zoneAt(b.x, b.y, b.z)).toBe('undercroft');
    expect(store.getJson(`layout:${-ADVENTURE_SEED}`)).toBe(ADVENTURE_LAYOUT);
    // The land outside the made places is left as it was saved.
    expect(room.world.getBlock(40 * 16 + 3, 100, 40 * 16 + 3)).toBe(B.STONE);
    // Once mended, an operator's change in the village is a change that stays: it is not mended again.
    room.world.setBlock(2, generator.hubY + 6, 2, B.GLASS);
    room.save();
    const again = new GameRoom({ seed: 1, kind: 'adventure', naturalSpawning: false, rand: mulberry32(2), store });
    expect(again.world.getBlock(2, generator.hubY + 6, 2)).toBe(B.GLASS);
  }, 60000);

  it('lets a character who climbs out of the cave hand the first quest in, and sends them back to the Landing after a death', () => {
    const room = new GameRoom({ seed: 1, kind: 'adventure', naturalSpawning: false, rand: mulberry32(2) });
    const c = new Client(room);
    c.join('ann');
    const p = room.player(c.id)!;
    expect(p.quests!.accept(FIRST_QUEST)).toBe(true);
    p.teleport(CELLAR_HOUSE.x0 + 1.5, generator.hubY + 1, 12.5, 0, 0);
    ticks(room, 6);
    expect(p.quests!.status(FIRST_QUEST)).toBe('ready');
    const land = generator.spawnFor(0);
    expect(land.x).toBeGreaterThanOrEqual(SPAWN_X0);
    expect(land.x).toBeLessThan(SPAWN_X0 + SPAWN_SIZE);
    expect(land.z).toBeGreaterThanOrEqual(SPAWN_Z0);
    expect(land.z).toBeLessThan(SPAWN_Z0 + SPAWN_SIZE);
  }, 60000);

  it('shows the quest givers to everybody, and takes quest commands from the network, and keeps the log between visits', () => {
    const store = new MemoryRoomStore();
    const room = new GameRoom({ seed: 1, kind: 'adventure', naturalSpawning: false, rand: mulberry32(3), store });
    const c = new Client(room);
    c.join('ann');
    const p = room.player(c.id)!;
    // A new character wakes in the wilds: bring this one to the village, the first quest done.
    const land = generator.spawnFor(0);
    p.teleport(land.x, land.y, land.z, 0, 0);
    p.quests!.active.delete(FIRST_QUEST);
    p.quests!.done.add(FIRST_QUEST);
    ticks(room, 30);
    const npcs = c.snap.mobs.filter((m) => m.kind === 'npc');
    expect(npcs.map((m) => m.variant).sort((a, b) => a - b)).toEqual(NPCS.flatMap((n, i) => (n.dungeon ? [] : [i])));

    const maren = NPCS.find((n) => n.id === 'maren')!;
    p.teleport(maren.x, generator.hubY + 1, maren.z + 2, 0, 0);
    ticks(room, 4);
    const mob = room.realm.mobs.mobs.find((m) => m.kind === 'npc' && NPCS[m.variant].id === 'maren')!;
    expect(p.talkNpc(mob)).toBe(true);
    c.messages = [];
    ticks(room, 1);
    expect(c.snap.you.screen).toBe('dialog');
    // The command comes in as a message, is validated, and then does what it says.
    const accept = parseNetClientMessage({ t: 'cmd', c: { t: 'quest', a: 'accept', id: 'welcome' } });
    expect(accept).not.toBeNull();
    room.receive(c.id, accept!);
    ticks(room, 2);
    expect(p.quests!.status('welcome')).toBe('ready');
    const synced = c.events().filter((e) => e.t === 'quests');
    expect(synced.length).toBeGreaterThan(0);
    // A cheater's claim to a reward they have not earned changes nothing.
    const cheat = parseNetClientMessage({ t: 'cmd', c: { t: 'quest', a: 'complete', id: 'first_timber' } });
    room.receive(c.id, cheat!);
    ticks(room, 2);
    expect(p.quests!.status('first_timber')).toBe('locked');
    room.save();

    // Without an account nothing is kept; with one, the log is.
    const room2 = new GameRoom({ seed: 1, kind: 'adventure', naturalSpawning: false, rand: mulberry32(3), store });
    const d = new Client(room2);
    const id = room2.join(d.conn, 'ann', 'account-1');
    expect(id).not.toBeNull();
    const q = room2.player(id!)!;
    q.quests!.active.delete(FIRST_QUEST);
    q.quests!.done.add(FIRST_QUEST);
    q.quests!.accept('welcome');
    room2.leave(id!);
    const d2 = new Client(room2);
    const id2 = room2.join(d2.conn, 'ann', 'account-1');
    expect(room2.player(id2!)!.quests!.status('welcome')).toBe('ready');
    const last = d2.events().filter((e) => e.t === 'quests').pop();
    expect(last).toBeDefined();
  }, 60000);

  it('takes /party commands from chat, and a party goes through the portal into one dungeon', () => {
    const room = new GameRoom({ seed: 1, kind: 'adventure', naturalSpawning: false, rand: mulberry32(5) });
    const a = new Client(room);
    a.join('ann');
    const b = new Client(room);
    b.join('bob');
    const say = (c: Client, text: string): void => room.receive(c.id, { t: 'chat', text });
    const notices = (c: Client): string[] => c.messages.flatMap((m) => (m.t === 'notice' ? [m.text] : []));
    say(a, '/party invite bob');
    say(b, '/party accept');
    expect(notices(a).join(' ')).toMatch(/Invited Bob|Invited bob/i);
    expect(notices(b).join(' ')).toMatch(/joined ann's party/);
    say(a, '/party');
    expect(notices(a).pop()).toBe('Party (2/4): ann (leader), bob');
    // Party chat reaches the party only.
    const c = new Client(room);
    c.join('cy');
    say(a, '/p hello');
    expect(b.messages.some((m) => m.t === 'chat' && m.text === 'hello' && m.from === 'ann (party)')).toBe(true);
    expect(c.messages.some((m) => m.t === 'chat' && m.text === 'hello')).toBe(false);

    for (const x of [a, b, c]) {
      const p = room.player(x.id)!;
      p.xp.add(totalForLevel(DUNGEON_MIN_LEVEL));
      p.inventory.collect(makeStack(I.HOLLOW_SIGIL, 1));
      p.teleport(92.5, generator.ruinY + 1, 0.5, 0, 0);
    }
    ticks(room, 4);
    const slot = (x: Client): number => generator.instanceAt(room.player(x.id)!.body.x, room.player(x.id)!.body.z);
    expect(slot(a)).toBeGreaterThanOrEqual(0);
    expect(slot(b)).toBe(slot(a));
    expect(slot(c)).not.toBe(slot(a));
  }, 60000);

  it('carries a player through the chapel portal into a dungeon of their own, and never saves what happens in it', () => {
    const store = new MemoryRoomStore();
    const room = new GameRoom({ seed: 1, kind: 'adventure', naturalSpawning: false, rand: mulberry32(4), store });
    const c = new Client(room);
    c.join('ann');
    const p = room.player(c.id)!;
    p.xp.add(totalForLevel(DUNGEON_MIN_LEVEL));
    p.inventory.collect(makeStack(I.HOLLOW_SIGIL, 1));
    p.teleport(92.5, generator.ruinY + 1, 0.5, 0, 0);
    ticks(room, 4);
    const slot = generator.instanceAt(p.body.x, p.body.z);
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(room.realm.copyOwner(slot)).toBe(p.instanceKey());

    // A second player gets another copy, and the first one's work stays in the first one.
    const d = new Client(room);
    d.join('bob');
    const q = room.player(d.id)!;
    q.xp.add(totalForLevel(DUNGEON_MIN_LEVEL));
    q.inventory.collect(makeStack(I.HOLLOW_SIGIL, 1));
    q.teleport(92.5, generator.ruinY + 1, 0.5, 0, 0);
    ticks(room, 4);
    expect(generator.instanceAt(q.body.x, q.body.z)).not.toBe(slot);

    // Whatever is built inside a copy is not part of the saved world.
    const spot = { x: INSTANCE_X0 + 10, y: generator.cellarY + 1, z: generator.roomZ + slot * INSTANCE_STRIDE };
    room.realm.world.setBlock(spot.x, spot.y, spot.z, 1);
    room.save();
    const again = new GameRoom({ seed: 1, kind: 'adventure', naturalSpawning: false, rand: mulberry32(4), store });
    expect(again.realm.world.getBlock(spot.x, spot.y, spot.z)).toBe(0);
  }, 60000);
});
