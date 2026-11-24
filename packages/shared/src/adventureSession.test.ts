import { describe, expect, it } from 'vitest';
import {
  ADVENTURE_SEED,
  UNDERCROFT_ORIGIN,
  B,
  CELLAR_HOUSE,
  CraftingMenu,
  DIALOG_RANGE,
  DUNGEON_MIN_LEVEL,
  IS_LIQUID,
  IS_SOLID,
  SEA_LEVEL,
  toolId,
  DUNGEON_X,
  DUNGEON_Z,
  FIRST_QUEST,
  Furnace,
  FurnaceMenu,
  GameSession,
  HeadlessWorld,
  I,
  CLEARING,
  NPCS,
  OUTPOSTS,
  VAULTS,
  Player,
  QUESTS,
  QuestLog,
  RECIPES,
  WorldGenerator,
  makeGenerator,
  makeStack,
  mulberry32,
  parsePlayerSave,
  parseSessionMessage,
  questById,
  totalForLevel,
  type AdventureWorldGenerator,
  type InputFrame,
  type Mob,
  type QuestLogJSON,
  type SessionEvent,
} from './index';
import { doObjectives } from './villageStart.testutil';

const idle = (over: Partial<InputFrame> = {}): InputFrame => ({ t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false, ...over });

const generator = makeGenerator(ADVENTURE_SEED, 'adventure') as AdventureWorldGenerator;

/**
 * A new character wakes in the Undercroft with nothing (see the tests on that below). Most tests are about the village, so by
 * default they start with the first quest handed in and the player on the Landing of Dawnwatch; `cave` gives the real start.
 */
function make(seed = 3, cave = false) {
  const world = new HeadlessWorld(generator);
  const s = new GameSession({ seed: ADVENTURE_SEED, world, generator, naturalSpawning: false, rand: mulberry32(seed) });
  s.finishLoading();
  if (!cave) {
    s.quests!.active.delete(FIRST_QUEST);
    s.quests!.done.add(FIRST_QUEST);
    const land = generator.landingFor(0);
    s.teleport(land.x, land.y, land.z, 0, 0);
    s.drainEvents();
    s.syncQuests();
  }
  return s;
}

const run = (s: GameSession, seconds: number): void => {
  for (let i = 0; i < Math.round(seconds * 20); i++) s.tick(idle());
};

const npcMob = (s: GameSession, id: string): Mob => {
  const v = NPCS.findIndex((n) => n.id === id);
  const m = s.mobs.mobs.find((x) => x.kind === 'npc' && x.variant === v);
  if (!m) throw new Error(`no ${id}`);
  return m;
};

/** Stand in front of a quest giver, and speak to them. */
function talkTo(s: GameSession, id: string): void {
  const n = NPCS.find((x) => x.id === id)!;
  s.teleport(n.x, (n.cellar ? generator.undercroftY : n.place ? generator.groundAt(n.place)! : generator.hubY) + 1, n.z + 2, 0, 0);
  run(s, 0.2);
  // A far village's chunks are loaded a few at a time: wait until its people are there.
  const v = NPCS.findIndex((x) => x.id === id);
  for (let i = 0; i < 400 && !s.mobs.mobs.some((m) => m.kind === 'npc' && m.variant === v); i++) s.tick(idle());
  expect(s.talkNpc(npcMob(s, id))).toBe(true);
  expect(s.screen).toBe('dialog');
  expect(s.dialogNpc).toBe(id);
}

/** Mark everything a quest needs as handed in, however it was done (a test of something else gets there quickly). */
function unlock(log: QuestLog, id: string): void {
  for (const r of questById(id)!.requires) {
    unlock(log, r);
    log.active.delete(r);
    log.done.add(r);
  }
}

/** Take the quest from whoever gives it and hand it in to whoever takes it, doing what it asks in between. */
function takeAndDo(s: GameSession, id: string, doIt: () => void = () => {}): void {
  const q = questById(id)!;
  talkTo(s, q.giver);
  s.apply({ t: 'quest', a: 'accept', id });
  s.closeMenu();
  expect(s.quests!.status(id)).toMatch(/active|ready/);
  doIt();
  run(s, 0.5);
  expect(s.quests!.status(id), `${id} should be ready`).toBe('ready');
  talkTo(s, q.turnIn);
  s.apply({ t: 'quest', a: 'complete', id });
  s.closeMenu();
  expect(s.quests!.status(id)).toBe('done');
}

describe('an Adventure player', () => {
  it('wakes in the Undercroft, the cave under Ashbrook, with nothing at all, and the first quest is the healer\'s to give', () => {
    const s = make(3, true);
    expect(s.body.y).toBeCloseTo(generator.undercroftY + 1, 5);
    expect(generator.zoneAt(s.body.x, s.body.y, s.body.z)).toBe('undercroft');
    // Standing on solid ground, with room above.
    const bx = Math.floor(s.body.x);
    const bz = Math.floor(s.body.z);
    expect(IS_SOLID[s.world.getBlock(bx, generator.undercroftY, bz)]).toBeTruthy();
    expect(IS_SOLID[s.world.getBlock(bx, generator.undercroftY + 1, bz)]).toBeFalsy();
    expect(IS_SOLID[s.world.getBlock(bx, generator.undercroftY + 2, bz)]).toBeFalsy();
    // Nothing in the bags, the hands, or the off-hand.
    expect(s.inventory.slots.filter((x) => x)).toEqual([]);
    expect(s.held).toBeNull();
    expect(s.offhand.get(0)).toBeNull();
    expect(s.drainEvents().some((e) => e.t === 'toast')).toBe(true);
    // The quest is waiting at the healer; the elder's are locked behind it.
    expect(s.quests!.status(FIRST_QUEST)).toBe('available');
    expect(s.quests!.offeredBy('mirel').map((q) => q.id)).toEqual([FIRST_QUEST]);
    expect(s.quests!.status('ms01')).toBe('locked');
  });

  it('wakes different arrivals in different places of the cave, always the same for the same slot', () => {
    const spots = new Set<string>();
    for (let slot = 0; slot < 12; slot++) {
      const a = generator.startFor(slot);
      expect(a).toEqual(generator.startFor(slot));
      expect(generator.zoneAt(a.x, a.y, a.z)).toBe('undercroft');
      spots.add(`${Math.floor(a.x)},${Math.floor(a.z)}`);
    }
    expect(spots.size).toBe(12);
  });

  it('puts a creative character in the open, on the green of Ashbrook', () => {
    const world = new HeadlessWorld(generator);
    const s = new GameSession({ seed: ADVENTURE_SEED, world, generator, naturalSpawning: false, rand: mulberry32(4), mode: 'creative' });
    s.finishLoading();
    expect(generator.zoneAt(s.body.x, s.body.y, s.body.z)).toBe('ashbrook');
    expect(s.quests!.status(FIRST_QUEST)).toBe('done');
  });

  it('climbs out: the first quest is taken from the healer and done at the top of the stair, and the reeve pays the Emberstone, the map and a first meal', () => {
    const s = make(3, true);
    talkTo(s, 'mirel');
    s.apply({ t: 'quest', a: 'accept', id: FIRST_QUEST });
    s.closeMenu();
    expect(s.quests!.status(FIRST_QUEST)).toBe('active');
    // Up the stair: the village starts where the steps meet the floor of the cellar house.
    s.teleport(CELLAR_HOUSE.x0 + 3.5, generator.startY - 2, UNDERCROFT_ORIGIN.z + 12.5, 0, 0);
    run(s, 0.5);
    expect(s.quests!.status(FIRST_QUEST)).toBe('active');
    s.teleport(CELLAR_HOUSE.x0 + 1.5, generator.startY + 1, UNDERCROFT_ORIGIN.z + 12.5, 0, 0);
    run(s, 1.5);
    expect(generator.zoneAt(s.body.x, s.body.y, s.body.z)).toBe('ashbrook');
    expect(s.quests!.status(FIRST_QUEST)).toBe('ready');
    // The elder takes it in. It pays the Emberstone that was found on the character, the map, and bread and torches.
    talkTo(s, 'edda');
    s.apply({ t: 'quest', a: 'complete', id: FIRST_QUEST });
    s.closeMenu();
    expect(s.quests!.status(FIRST_QUEST)).toBe('done');
    expect(s.inventory.countOf(I.MAP)).toBe(1);
    expect(s.inventory.countOf(I.EMBERSTONE)).toBe(1);
    expect(s.inventory.countOf(I.BREAD)).toBeGreaterThan(0);
    expect(s.quests!.offeredBy('edda').map((q) => q.id)).toContain('ms01');
    // And the next quest is hers to give, with the work it asks for done the way the game counts it.
    takeAndDo(s, 'ms01', () => doObjectives(s, questById('ms01')!));
    expect(s.quests!.status('ms01')).toBe('done');
    expect(s.quests!.offeredBy('edda').map((q) => q.id)).toContain('ms02');
  });

  it('counts the village if the quest is taken while already standing in it', () => {
    const s = make(3, true);
    // Up on the ground over the cave, in range of the healer's mob (the dialog only checks distance on the map).
    const mirel = NPCS.find((n) => n.id === 'mirel')!;
    s.teleport(mirel.x, generator.startY + 1, mirel.z + 2, 0, 0);
    run(s, 1.5);
    expect(generator.zoneAt(s.body.x, s.body.y, s.body.z)).toBe('ashbrook');
    expect(s.talkNpc(npcMob(s, 'mirel'))).toBe(true);
    s.apply({ t: 'quest', a: 'accept', id: FIRST_QUEST });
    expect(s.quests!.status(FIRST_QUEST)).toBe('ready');
  });

  it('does not make a character saved before the cave start do the first quest, nor a new one skip it', () => {
    const a = make(3, true);
    // Brand new: saved and loaded again before talking to anybody, the quest is still to be had.
    const fresh = JSON.parse(JSON.stringify(a.savePlayer()));
    const world = new HeadlessWorld(generator);
    const again = new GameSession({ seed: ADVENTURE_SEED, world, generator, naturalSpawning: false, rand: mulberry32(9) });
    again.loadPlayer(parsePlayerSave(fresh)!);
    again.finishLoading();
    expect(again.quests!.status(FIRST_QUEST)).toBe('available');
    // An old character that has moved on (with quests behind it, and not this one) has no reason to go back.
    const old = JSON.parse(JSON.stringify(a.savePlayer()));
    old.quests = { d: ['ms00', 'ms01'], a: [] };
    const world2 = new HeadlessWorld(generator);
    const b = new GameSession({ seed: ADVENTURE_SEED, world: world2, generator, naturalSpawning: false, rand: mulberry32(10) });
    b.loadPlayer(parsePlayerSave(old)!);
    b.finishLoading();
    expect(b.quests!.status(FIRST_QUEST)).toBe('done');
    expect(b.quests!.status('ms02')).toBe('available');
  });

  it('starts on the green of Ashbrook after a death, even though the first start was in the cave', () => {
    const s = make(3, true);
    s.vitals.health = 0;
    s.vitals.dead = true;
    s.respawn();
    const land = generator.spawnFor(0);
    expect(Math.hypot(s.body.x - land.x, s.body.z - land.z)).toBeLessThan(40);
    expect(s.body.y).toBeGreaterThan(generator.startY);
  });

  it('is in a world that has people in it', () => {
    const s = make();
    expect(s.quests).not.toBeNull();
    s.syncQuests();
    expect(s.drainEvents().find((e) => e.t === 'quests')).toBeDefined();
    run(s, 1.5);
    const people = s.mobs.mobs.filter((m) => m.kind === 'npc');
    expect(people.map((m) => m.variant).sort((a, b) => a - b)).toEqual(NPCS.flatMap((n, i) => (n.dungeon || n.place ? [] : [i])));
    for (const m of people) {
      expect(m.def.invulnerable).toBe(true);
      const n = NPCS[m.variant];
      expect(m.body.x).toBeCloseTo(n.x, 1);
      expect(m.body.z).toBeCloseTo(n.z, 1);
    }
  });

  it('is in a world where the first dozen players to wake up each get a different spot in the cave', () => {
    const world = new HeadlessWorld(generator);
    const a = new GameSession({ seed: ADVENTURE_SEED, world, generator, naturalSpawning: false, rand: mulberry32(1) });
    const players: Player[] = [a];
    for (let i = 0; i < 11; i++) players.push(new Player(a.realm));
    const spots = new Set(players.map((p) => `${Math.floor(p.body.x)},${Math.floor(p.body.z)}`));
    expect(spots.size).toBe(players.length);
  });

  it('has no quests anywhere else', () => {
    const generator2 = new WorldGenerator(99);
    const s = new GameSession({ seed: 99, world: new HeadlessWorld(generator2), generator: generator2, naturalSpawning: false, rand: mulberry32(1) });
    expect(s.quests).toBeNull();
    expect(s.drainEvents().some((e) => e.t === 'quests')).toBe(false);
    s.apply({ t: 'quest', a: 'accept', id: 'ms00' });
    expect(s.savePlayer().quests).toBeUndefined();
  });

  it('cannot hurt a quest giver, and they are not saved with the mobs', () => {
    const s = make();
    run(s, 1.5);
    const m = npcMob(s, 'maren');
    expect(s.damageMob(m.id, 500)).toBe(false);
    expect(m.dead).toBe(false);
    expect(m.health).toBe(m.maxHealth);
    s.attackMob(m);
    expect(m.health).toBe(m.maxHealth);
    expect(s.mobs.toJSON(0, 0, 500).some((e) => e.kind === 'npc')).toBe(false);
    expect(s.mobs.loadJSON([{ kind: 'npc', x: 0, y: 80, z: 0 }])).toBe(0);
  });

  it('talks to a quest giver by right-clicking them, and the talk ends when walking away or closing', () => {
    const s = make();
    run(s, 1.5);
    const n = NPCS.find((x) => x.id === 'maren')!;
    // Aimed at, from two blocks away, level with the head.
    s.teleport(n.x, generator.hubY + 1, n.z + 2, 0, 0);
    run(s, 0.2);
    expect(s.aimedMob()?.mob.kind).toBe('npc');
    expect(s.useOnMob()).toBe(true);
    expect(s.screen).toBe('dialog');
    expect(s.drainEvents().some((e) => e.t === 'dialog' && e.npc === 'maren')).toBe(true);
    // Commands that are not about the dialog do nothing while it is open; closing it works as for any screen.
    s.apply({ t: 'closeMenu' });
    expect(s.screen).toBe('none');
    expect(s.drainEvents().some((e) => e.t === 'dialog' && e.npc === null)).toBe(true);
    // Walking away ends it.
    talkTo(s, 'maren');
    s.teleport(n.x, generator.hubY + 1, n.z + DIALOG_RANGE + 3);
    run(s, 0.3);
    expect(s.screen).toBe('none');
    expect(s.dialogNpc).toBeNull();
  });

  it('still speaks to a quest giver with the map in the hand, which otherwise does nothing', () => {
    const s = make();
    run(s, 1.5);
    const n = NPCS.find((x) => x.id === 'maren')!;
    s.inventory.set(3, makeStack(I.MAP, 1));
    s.apply({ t: 'select', slot: 3 });
    expect(s.held?.id).toBe(I.MAP);
    // Looking at no one: a right click does nothing (the client opens the map).
    s.teleport(n.x, generator.hubY + 1, n.z + 12, 0, 0);
    run(s, 0.2);
    expect(s.aimsAtTalker).toBe(false);
    s.tick(idle({ right: true }));
    s.tick(idle());
    expect(s.screen).toBe('none');
    // Looking at her: it talks.
    s.teleport(n.x, generator.hubY + 1, n.z + 2, 0, 0);
    run(s, 0.2);
    expect(s.aimsAtTalker).toBe(true);
    s.tick(idle({ right: true }));
    expect(s.screen).toBe('dialog');
    expect(s.dialogNpc).toBe('maren');
  });

  it('counts the time since the arm last swung, for the others to see', () => {
    const s = make();
    run(s, 1);
    expect(s.swingAge).toBeGreaterThan(0.9);
    s.emit({ t: 'swing' });
    expect(s.swingAge).toBe(0);
    run(s, 0.5);
    expect(s.swingAge).toBeGreaterThan(0.4);
  });

  it('takes a quest only from its giver, hands it in only to the one who takes it in, and cannot be cheated', () => {
    const s = make();
    run(s, 1.5);
    const q = questById('ms02')!; // The reeve gives it, and Brannoc takes it in
    expect([q.giver, q.turnIn]).toEqual(['edda', 'brannoc']);
    unlock(s.quests!, q.id);
    s.syncQuests();
    // Nobody to talk to: nothing happens.
    s.apply({ t: 'quest', a: 'accept', id: q.id });
    expect(s.quests!.status(q.id)).toBe('available');
    talkTo(s, 'brannoc');
    s.apply({ t: 'quest', a: 'accept', id: q.id }); // The reeve gives it, not Brannoc
    expect(s.quests!.status(q.id)).toBe('available');
    s.closeMenu();
    talkTo(s, 'edda');
    s.apply({ t: 'quest', a: 'accept', id: 'nonsense' });
    s.apply({ t: 'quest', a: 'accept', id: q.id });
    expect(s.quests!.status(q.id)).toBe('active');
    s.apply({ t: 'quest', a: 'complete', id: q.id }); // not done yet, and not hers to take in
    expect(s.quests!.status(q.id)).toBe('active');
    s.closeMenu();
    doObjectives(s, q);
    expect(s.quests!.status(q.id)).toBe('ready');
    talkTo(s, 'edda');
    s.apply({ t: 'quest', a: 'complete', id: q.id }); // Brannoc takes it in
    expect(s.quests!.status(q.id)).toBe('ready');
    expect(s.inventory.countOf(toolId('sword', 'stone'))).toBe(0);
    s.closeMenu();
    talkTo(s, 'brannoc');
    const xp0 = s.xp.total ?? 0;
    s.apply({ t: 'quest', a: 'complete', id: q.id });
    expect(s.quests!.status(q.id)).toBe('done');
    expect(s.inventory.countOf(toolId('sword', 'stone'))).toBe(1);
    expect(s.xp.total ?? 0).toBeGreaterThan(xp0);
    // And not twice.
    s.apply({ t: 'quest', a: 'complete', id: q.id });
    expect(s.inventory.countOf(toolId('sword', 'stone'))).toBe(1);
    const events = s.drainEvents();
    expect(events.filter((e) => e.t === 'quest' && e.what === 'done').length).toBe(1);
    expect(events.some((e) => e.t === 'quests')).toBe(true);
  });

  it('gathers: bones count while they are carried and are handed over with the quest', () => {
    const s = make();
    run(s, 1.5);
    const id = 'dw_tobin_1';
    const q = questById(id)!;
    unlock(s.quests!, id);
    s.syncQuests();
    talkTo(s, q.giver);
    s.apply({ t: 'quest', a: 'accept', id });
    s.closeMenu();
    s.giveItem(I.BONE, 5);
    s.giveItem(I.STRING, 4);
    run(s, 0.5);
    expect(s.quests!.status(id)).toBe('active');
    s.giveItem(I.BONE, 1);
    run(s, 0.5);
    expect(s.quests!.status(id)).toBe('ready');
    const events = s.drainEvents();
    expect(events.some((e) => e.t === 'quest' && e.what === 'ready')).toBe(true);
    talkTo(s, q.turnIn);
    s.apply({ t: 'quest', a: 'complete', id });
    expect(s.quests!.status(id)).toBe('done');
    expect(s.inventory.countOf(I.BONE)).toBe(0);
    expect(s.inventory.countOf(I.STRING)).toBe(0);
  });

  it('counts walking into each outpost, vault and the clearing', () => {
    const s = make();
    run(s, 1.5);
    const log = s.quests!;
    const ids = ['ex_3', 'ex_4', 'ex_6'];
    for (const id of ids) {
      unlock(log, id);
      expect(log.accept(id), id).toBe(true);
    }
    const spots = [
      ...OUTPOSTS.map((o) => ({ x: o.x + 0.5, y: generator.groundAt(o.id)! + 1, z: o.z + 0.5 })),
      ...VAULTS.map((v) => ({ x: v.x + 0.5, y: generator.groundAt(v.id)! - 10, z: v.z + 5.5 })),
      { x: CLEARING.x + 0.5, y: generator.groundAt('clearing')! + 1, z: CLEARING.z + 0.5 },
    ];
    for (const p of spots) {
      s.teleport(p.x, p.y, p.z, 0, 0);
      run(s, 0.6);
    }
    for (const id of ids) expect(log.status(id), id).toBe('ready');
  });

  it('counts what is crafted and smelted out of the screens, and what is mined and placed', () => {
    const s = make();
    run(s, 1.5);
    const log = s.quests!;
    // Do the first quests the plain way to open the third.
    const bench = questById('ms01')!;
    unlock(log, bench.id);
    s.syncQuests();
    talkTo(s, bench.giver);
    s.apply({ t: 'quest', a: 'accept', id: 'ms01' });
    s.closeMenu();
    // Sticks out of the 2x2 grid, via the recipe book.
    s.giveItem(B.PLANKS, 8);
    s.apply({ t: 'inventory' });
    const menu = s.menu as CraftingMenu;
    expect(menu).toBeInstanceOf(CraftingMenu);
    const table = RECIPES.findIndex((r) => r.result.id === I.STICK);
    s.apply({ t: 'recipe', index: table, all: false });
    s.apply({ t: 'click', slot: menu.resultSlot, button: 0 });
    s.apply({ t: 'closeMenu' });
    const tableStep = bench.objectives.findIndex((o) => o.kind === 'craft' && o.items.includes(I.STICK));
    expect(tableStep).toBeGreaterThanOrEqual(0);
    expect(log.progressOf('ms01')[tableStep]).toBe(4);

    // A furnace: take what it made out of its output slot.
    const forge = QUESTS.find((q) => !q.class && q.objectives.some((o) => o.kind === 'smelt' && !!o.items?.includes(I.IRON_INGOT)))!;
    const f = new Furnace();
    f.container.set(2, makeStack(I.IRON_INGOT, 2));
    // Put the quest in the log directly: this part is about the screen, not about the talk.
    unlock(log, forge.id);
    expect(log.accept(forge.id)).toBe(true);
    s.openMenu(new FurnaceMenu(s.inventory, f));
    const fm = s.menu as FurnaceMenu;
    s.apply({ t: 'shift', slot: fm.outputSlot });
    s.apply({ t: 'closeMenu' });
    const smeltStep = forge.objectives.findIndex((o) => o.kind === 'smelt');
    expect(log.progressOf(forge.id)[smeltStep]).toBe(2);

    // Mining and placing.
    const mine = QUESTS.find((q) => q.objectives.some((o) => o.kind === 'mine' && o.blocks.includes(B.STONE)))!;
    log.active.clear();
    log.done.clear();
    unlock(log, mine.id);
    expect(log.accept(mine.id)).toBe(true);
    const step = mine.objectives.findIndex((o) => o.kind === 'mine');
    // Past the village edge: the village itself is protected, and cannot be mined.
    s.teleport(60.5, generator.hubY + 30, 0.5, 0, 0);
    run(s, 0.2);
    const x = 60;
    const z = 0;
    const y = generator.hubY + 30;
    for (let i = 0; i < 3; i++) {
      s.world.setBlock(x + i, y, z + 5, B.STONE);
      s.breakBlock(x + i, y, z + 5);
    }
    expect(log.progressOf(mine.id)[step]).toBe(3);
  });

  it('counts kills for everyone near, and not for those far off, and only what a player hurt', () => {
    const world = new HeadlessWorld(generator);
    const a = new GameSession({ seed: ADVENTURE_SEED, world, generator, naturalSpawning: false, rand: mulberry32(5) });
    a.finishLoading();
    const b = new Player(a.realm);
    const c = new Player(a.realm);
    for (const p of [b, c]) p.finishLoading();
    const hunt = QUESTS.find((q) => q.objectives.some((o) => o.kind === 'kill'))!;
    const o = hunt.objectives.find((x) => x.kind === 'kill') as Extract<(typeof hunt.objectives)[number], { kind: 'kill' }>;
    const step = hunt.objectives.indexOf(o);
    const setup = (p: Player): void => {
      const chain = (id: string): void => {
        const q = questById(id)!;
        for (const r of q.requires) chain(r);
        p.quests!.done.add(id);
      };
      for (const r of hunt.requires) chain(r);
      p.quests!.accept(hunt.id);
    };
    setup(a);
    setup(b);
    setup(c);
    a.teleport(5.5, generator.hubY + 1, 8.5);
    b.teleport(12.5, generator.hubY + 1, 8.5);
    c.teleport(5.5, generator.hubY + 1, 300.5);
    const kind = o.mobs[0];
    const id = a.spawnMob(kind, 5.5, generator.hubY + 1, 6.5);
    expect(a.damageMob(id, 500)).toBe(true);
    expect(a.quests!.progressOf(hunt.id)[step]).toBe(1);
    expect(b.quests!.progressOf(hunt.id)[step]).toBe(1);
    expect(c.quests!.progressOf(hunt.id)[step]).toBe(0);
    // A mob that dies of something else (no player hurt it) is nobody's kill.
    const m = a.mobs.spawn(kind, 5.5, generator.hubY + 1, 6.5);
    a.mobs.damage(m, 500, 0, 1, a.realm.mobEvents, true, true, false);
    expect(a.quests!.progressOf(hunt.id)[step]).toBe(1);
  });

  it('walks into the dungeon and the village and gets the name of the place, once, and credit for entering', () => {
    const s = make();
    s.xp.add(totalForLevel(DUNGEON_MIN_LEVEL));
    run(s, 0.5);
    const log = s.quests!;
    const dark = questById('ms33')!;
    unlock(log, dark.id);
    s.syncQuests();
    // Maren gives the quest, and the Hollow Sigil that the portal asks for, and the three Embers.
    talkTo(s, dark.giver);
    s.apply({ t: 'quest', a: 'accept', id: dark.id });
    s.closeMenu();
    expect(s.inventory.countOf(I.HOLLOW_SIGIL)).toBe(1);
    expect(s.inventory.countOf(I.REED_EMBER)).toBe(1);
    s.drainEvents();
    run(s, 0.5);
    expect(s.drainEvents().filter((e) => e.t === 'zone' && e.id === 'dawnwatch').length).toBe(0); // the Landing is inside it, and was announced on arrival
    // Through the chapel's portal.
    s.teleport(DUNGEON_X + 0.5, generator.ruinY + 1, DUNGEON_Z + 0.5);
    run(s, 0.6);
    expect(s.realm.copyAt(s)).toBe(0);
    const events = s.drainEvents();
    expect(events.filter((e) => e.t === 'zone' && e.id === 'hollow_cellar').length).toBe(1);
    expect(log.status(dark.id)).toBe('ready');
    expect(s.inventory.countOf(I.HOLLOW_SIGIL)).toBe(0); // a new copy took it
    run(s, 0.6);
    expect(s.drainEvents().some((e) => e.t === 'zone')).toBe(false);
  });

  it('ends "Five Hands" with Warden Hale inside the cellar and takes the next quests from him, there and then', () => {
    const s = make();
    s.xp.add(totalForLevel(DUNGEON_MIN_LEVEL));
    run(s, 0.5);
    const log = s.quests!;
    unlock(log, 'ms33');
    s.syncQuests();
    // The quest and its key come from Maren in the village...
    expect(questById('ms33')!.turnIn).toBe('hale');
    expect(questById('ms34')!.giver).toBe('hale');
    expect(questById('ms34')!.turnIn).toBe('hale');
    talkTo(s, 'maren');
    s.apply({ t: 'quest', a: 'accept', id: 'ms33' });
    s.closeMenu();
    expect(s.inventory.countOf(I.HOLLOW_SIGIL)).toBe(1);
    expect(log.offeredBy('maren').map((q) => q.id)).not.toContain('ms34');
    // ...in the cellar, the Warden is at the door, and the portal need not be taken again.
    s.teleport(DUNGEON_X + 0.5, generator.ruinY + 1, DUNGEON_Z + 0.5);
    run(s, 2);
    expect(s.realm.copyAt(s)).toBe(0);
    expect(log.status('ms33')).toBe('ready');
    const st = generator.npcStations().find((n) => n.npc.id === 'hale' && generator.instanceAt(n.x, n.z) === 0)!;
    s.teleport(st.x + 2, st.y, st.z, Math.PI / 2, 0);
    run(s, 2);
    const hale = s.mobs.mobs.find((m) => m.kind === 'npc' && NPCS[m.variant].id === 'hale' && generator.instanceAt(m.body.x, m.body.z) === 0)!;
    expect(hale).toBeDefined();
    expect(s.talkNpc(hale)).toBe(true);
    expect(log.markerFor('hale')).toBe('ready');
    s.apply({ t: 'quest', a: 'complete', id: 'ms33' });
    expect(log.status('ms33')).toBe('done');
    expect(log.offeredBy('hale').map((q) => q.id)).toEqual(expect.arrayContaining(['ms34', 'ms35', 'ms36']));
    s.apply({ t: 'quest', a: 'accept', id: 'ms34' });
    expect(log.status('ms34')).toBe('active');
    s.closeMenu();
    // The cages are the locks of the cellar's gates: each is noted as it is smashed, and a gate opens when its cages are gone.
    const cages = generator.instanceCages(0);
    const gate = generator.instanceGates(0)[0].boxes[0];
    const toasts = (): string[] => s.drainEvents().flatMap((e) => (e.t === 'toast' ? [e.text] : []));
    toasts();
    for (const c of [cages[0], cages[1]]) {
      s.teleport(c.x + 0.5, c.y, c.z + 2.5, 0, 0);
      s.breakBlock(c.x, c.y, c.z);
      run(s, 1.5);
    }
    expect(s.world.getBlock(gate.x0, gate.y0, gate.z0)).toBe(B.AIR);
    expect(toasts().join(' ')).toMatch(/cage shatters \(2 of 3\)[\s\S]*grinds open/);
  });

  it('is saved with its quests and gets them back', () => {
    const s = make();
    run(s, 1.5);
    takeAndDo(s, 'ms01', () => doObjectives(s, questById('ms01')!));
    talkTo(s, 'edda');
    s.apply({ t: 'quest', a: 'accept', id: 'ms02' });
    s.closeMenu();
    const save = parsePlayerSave(JSON.parse(JSON.stringify(s.savePlayer())))!;
    expect(save.quests).toBeDefined();
    const t = make(9);
    t.loadPlayer(save);
    expect([...t.quests!.done]).toEqual([FIRST_QUEST, 'ms01']);
    expect(t.quests!.status('ms02')).toMatch(/active/);
    const synced = t.drainEvents().filter((e): e is Extract<SessionEvent, { t: 'quests' }> => e.t === 'quests');
    expect(synced.length).toBeGreaterThan(0);
    const log = synced[synced.length - 1].log as QuestLogJSON;
    expect(log.d).toEqual([FIRST_QUEST, 'ms01']);
  });

  it('wins achievements for levels, kills and coins, tells the player, and keeps them in the save', () => {
    const s = make();
    run(s, 1.5);
    s.drainEvents();
    s.xp.add(totalForLevel(10));
    run(s, 1.5);
    const won = (): string[] => s.drainEvents().flatMap((e) => (e.t === 'achievement' ? [e.id] : []));
    expect(won()).toEqual(expect.arrayContaining(['lvl-5', 'lvl-10']));
    expect(s.ach.has('lvl-15')).toBe(false);

    // Coins that were earned count; coins another player handed over do not.
    s.addCoins(5000, true);
    s.addCoins(500000);
    expect(s.ach.get('coins')).toBe(5000);
    expect(won()).toEqual(['coin-1000']);

    // Only monsters count as kills (not a cow), and a boss is also a kill.
    s.achKill({ kind: 'cow', def: { hostile: false } });
    expect(s.ach.get('kills')).toBe(0);
    s.achKill({ kind: 'hollow_king', elite: false, def: { hostile: true, boss: true } });
    expect(s.ach.get('kills')).toBe(1);
    expect(s.ach.get('bosses')).toBe(1);
    expect(s.ach.get('dungeons')).toBe(1);
    expect(won()).toEqual(expect.arrayContaining(['boss-1', 'deep-1']));

    const save = parsePlayerSave(JSON.parse(JSON.stringify(s.savePlayer())))!;
    expect(save.ach).toBeDefined();
    const t = make(9);
    t.loadPlayer(save);
    expect(t.ach.has('boss-1')).toBe(true);
    expect(t.ach.get('coins')).toBe(5000);
    const synced = t.drainEvents().filter((e) => e.t === 'ach');
    expect(synced.length).toBeGreaterThan(0);
  });

  it('says when a dungeon was cleared (the Hollow King fell), and for nothing else', () => {
    const s = make();
    run(s, 1.5);
    s.drainEvents();
    s.achKill({ kind: 'zombie', elite: false, def: { hostile: true } });
    expect(s.drainEvents().some((e) => e.t === 'clear')).toBe(false);
    s.achKill({ kind: 'hollow_king', elite: false, def: { hostile: true, boss: true } });
    expect(s.drainEvents().filter((e) => e.t === 'clear')).toEqual([{ t: 'clear', id: 'hollow-deep', name: 'the Hollow Deep' }]);
  });

  it('is told the quest commands are well formed or not at all', () => {
    expect(parseSessionMessage({ t: 'quest', a: 'accept', id: 'welcome' })).toEqual({ t: 'quest', a: 'accept', id: 'welcome' });
    expect(parseSessionMessage({ t: 'quest', a: 'complete', id: 'x' })).not.toBeNull();
    expect(parseSessionMessage({ t: 'quest', a: 'abandon', id: 'x' })).not.toBeNull();
    for (const bad of [{ t: 'quest', a: 'steal', id: 'x' }, { t: 'quest', a: 'accept' }, { t: 'quest', a: 'accept', id: '' }, { t: 'quest', a: 'accept', id: 'x'.repeat(100) }, { t: 'quest', a: 'accept', id: 5 }]) {
      expect(parseSessionMessage(bad)).toBeNull();
    }
  });
});
