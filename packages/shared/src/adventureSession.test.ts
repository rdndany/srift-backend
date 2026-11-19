import { describe, expect, it } from 'vitest';
import {
  ADVENTURE_SEED,
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
  NPCS,
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

const idle = (over: Partial<InputFrame> = {}): InputFrame => ({ t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false, ...over });

const generator = makeGenerator(ADVENTURE_SEED, 'adventure') as AdventureWorldGenerator;

/**
 * A new character wakes in the Undercroft with nothing (see the tests on that below). Most tests are about the village, so by
 * default they start with the first quest handed in and the player on the Landing; `cave` gives the real start.
 */
function make(seed = 3, cave = false) {
  const world = new HeadlessWorld(generator);
  const s = new GameSession({ seed: ADVENTURE_SEED, world, generator, naturalSpawning: false, rand: mulberry32(seed) });
  s.finishLoading();
  if (!cave) {
    s.quests!.active.delete(FIRST_QUEST);
    s.quests!.done.add(FIRST_QUEST);
    const land = generator.spawnFor(0);
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
  s.teleport(n.x, (n.cellar ? generator.undercroftY : generator.hubY) + 1, n.z + 2, 0, 0);
  run(s, 0.2);
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
  it('wakes in the Undercroft, the cave under the village, with nothing at all, and the first quest is the healer\'s to give', () => {
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
    expect(s.quests!.status('a_blade_for_the_road')).toBe('locked');
    expect(s.quests!.status('welcome')).toBe('locked');
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

  it('puts a creative character in the open, on the Landing', () => {
    const world = new HeadlessWorld(generator);
    const s = new GameSession({ seed: ADVENTURE_SEED, world, generator, naturalSpawning: false, rand: mulberry32(4), mode: 'creative' });
    s.finishLoading();
    expect(generator.zoneAt(s.body.x, s.body.y, s.body.z)).toBe('dawnwatch');
    expect(s.quests!.status(FIRST_QUEST)).toBe('done');
  });

  it('climbs out: the first quest is taken from the healer and done at the top of the stair, and Maren pays the map and the compass and offers the sword', () => {
    const s = make(3, true);
    talkTo(s, 'mirel');
    s.apply({ t: 'quest', a: 'accept', id: FIRST_QUEST });
    s.closeMenu();
    expect(s.quests!.status(FIRST_QUEST)).toBe('active');
    // Up the stair: the village starts where the steps meet the floor of the cellar house.
    s.teleport(CELLAR_HOUSE.x0 + 3.5, generator.hubY - 2, 12.5, 0, 0);
    run(s, 0.5);
    expect(s.quests!.status(FIRST_QUEST)).toBe('active');
    s.teleport(CELLAR_HOUSE.x0 + 1.5, generator.hubY + 1, 12.5, 0, 0);
    run(s, 1.5);
    expect(generator.zoneAt(s.body.x, s.body.y, s.body.z)).toBe('dawnwatch');
    expect(s.quests!.status(FIRST_QUEST)).toBe('ready');
    // The elder takes it in. It pays the map and the compass.
    talkTo(s, 'maren');
    s.apply({ t: 'quest', a: 'complete', id: FIRST_QUEST });
    expect(s.quests!.status(FIRST_QUEST)).toBe('done');
    expect(s.inventory.countOf(I.MAP)).toBe(1);
    expect(s.inventory.countOf(I.COMPASS)).toBe(1);
    expect(s.quests!.offeredBy('maren').map((q) => q.id).sort()).toEqual(['a_blade_for_the_road', 'welcome']);
    s.apply({ t: 'quest', a: 'accept', id: 'a_blade_for_the_road' });
    talkTo(s, 'garrick');
    s.apply({ t: 'quest', a: 'complete', id: 'a_blade_for_the_road' });
    expect(s.quests!.status('a_blade_for_the_road')).toBe('done');
    expect(s.inventory.countOf(toolId('sword', 'stone'))).toBe(1);
  });

  it('counts the village if the quest is taken while already standing in it', () => {
    const s = make(3, true);
    // Up on the ground over the cave, in range of the healer's mob (the dialog only checks distance on the map).
    const mirel = NPCS.find((n) => n.id === 'mirel')!;
    s.teleport(mirel.x, generator.hubY + 1, mirel.z + 2, 0, 0);
    run(s, 1.5);
    expect(generator.zoneAt(s.body.x, s.body.y, s.body.z)).toBe('dawnwatch');
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
    old.quests = { d: ['welcome'], a: [] };
    const world2 = new HeadlessWorld(generator);
    const b = new GameSession({ seed: ADVENTURE_SEED, world: world2, generator, naturalSpawning: false, rand: mulberry32(10) });
    b.loadPlayer(parsePlayerSave(old)!);
    b.finishLoading();
    expect(b.quests!.status(FIRST_QUEST)).toBe('done');
    expect(b.quests!.status('first_timber')).toBe('available');
  });

  it('starts on the Landing after a death, even though the first start was in the cave', () => {
    const s = make(3, true);
    s.vitals.health = 0;
    s.vitals.dead = true;
    s.respawn();
    const land = generator.spawnFor(0);
    expect(Math.hypot(s.body.x - land.x, s.body.z - land.z)).toBeLessThan(40);
    expect(s.body.y).toBeGreaterThan(generator.hubY);
  });

  it('is in a world that has people in it', () => {
    const s = make();
    expect(s.quests).not.toBeNull();
    s.syncQuests();
    expect(s.drainEvents().find((e) => e.t === 'quests')).toBeDefined();
    run(s, 1.5);
    const people = s.mobs.mobs.filter((m) => m.kind === 'npc');
    expect(people.map((m) => m.variant).sort((a, b) => a - b)).toEqual(NPCS.map((_, i) => i));
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
    s.apply({ t: 'quest', a: 'accept', id: 'welcome' });
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
    // Nobody to talk to: nothing happens.
    s.apply({ t: 'quest', a: 'accept', id: 'welcome' });
    expect(s.quests!.status('welcome')).toBe('available');
    talkTo(s, 'brannoc');
    s.apply({ t: 'quest', a: 'accept', id: 'welcome' }); // Maren gives it, not Brannoc
    expect(s.quests!.status('welcome')).toBe('available');
    s.closeMenu();
    talkTo(s, 'maren');
    s.apply({ t: 'quest', a: 'accept', id: 'nonsense' });
    s.apply({ t: 'quest', a: 'accept', id: 'welcome' });
    expect(s.quests!.status('welcome')).toBe('ready');
    s.apply({ t: 'quest', a: 'complete', id: 'welcome' }); // Brannoc takes it in
    expect(s.quests!.status('welcome')).toBe('ready');
    expect(s.inventory.countOf(I.BREAD)).toBe(0);
    s.closeMenu();
    talkTo(s, 'brannoc');
    const xp0 = s.xp.total ?? 0;
    s.apply({ t: 'quest', a: 'complete', id: 'welcome' });
    expect(s.quests!.status('welcome')).toBe('done');
    expect(s.inventory.countOf(I.BREAD)).toBe(3);
    expect(s.inventory.countOf(I.EMBERSTONE)).toBe(1); // the Emberstone is this quest's gift (the map comes from the first quest)
    expect(s.inventory.countOf(I.MAP)).toBe(0);
    expect(s.xp.total ?? 0).toBeGreaterThanOrEqual(xp0);
    // And not twice.
    s.apply({ t: 'quest', a: 'complete', id: 'welcome' });
    expect(s.inventory.countOf(I.BREAD)).toBe(3);
    expect(s.inventory.countOf(I.EMBERSTONE)).toBe(1);
    const events = s.drainEvents();
    expect(events.filter((e) => e.t === 'quest' && e.what === 'done').length).toBe(1);
    expect(events.some((e) => e.t === 'quests')).toBe(true);
  });

  it('gathers: logs count while they are carried and are handed over with the quest', () => {
    const s = make();
    run(s, 1.5);
    takeAndDo(s, 'welcome');
    const id = 'first_timber';
    const q = questById(id)!;
    const need = q.objectives[0].count;
    talkTo(s, q.giver);
    s.apply({ t: 'quest', a: 'accept', id });
    s.closeMenu();
    s.giveItem(B.LOG, need - 1);
    run(s, 0.5);
    expect(s.quests!.status(id)).toBe('active');
    s.giveItem(B.BIRCH_LOG, 1); // any kind of log will do
    run(s, 0.5);
    expect(s.quests!.status(id)).toBe('ready');
    const events = s.drainEvents();
    expect(events.some((e) => e.t === 'quest' && e.what === 'ready')).toBe(true);
    talkTo(s, q.turnIn);
    s.apply({ t: 'quest', a: 'complete', id });
    expect(s.quests!.status(id)).toBe('done');
    expect(s.inventory.countOf(B.LOG) + s.inventory.countOf(B.BIRCH_LOG)).toBe(0);
  });

  it('counts what is crafted and smelted out of the screens, and what is mined and placed', () => {
    const s = make();
    run(s, 1.5);
    const log = s.quests!;
    // Do the first quests the plain way to open the third.
    takeAndDo(s, 'welcome');
    takeAndDo(s, 'first_timber', () => s.giveItem(B.LOG, 5));
    const bench = questById('workbench')!;
    talkTo(s, bench.giver);
    s.apply({ t: 'quest', a: 'accept', id: 'workbench' });
    s.closeMenu();
    // Crafting table out of the 2x2 grid, via the recipe book.
    s.giveItem(B.PLANKS, 8);
    s.apply({ t: 'inventory' });
    const menu = s.menu as CraftingMenu;
    expect(menu).toBeInstanceOf(CraftingMenu);
    const table = RECIPES.findIndex((r) => r.result.id === B.CRAFTING_TABLE);
    s.apply({ t: 'recipe', index: table, all: false });
    s.apply({ t: 'click', slot: menu.resultSlot, button: 0 });
    s.apply({ t: 'closeMenu' });
    const tableStep = bench.objectives.findIndex((o) => o.kind === 'craft' && o.items.includes(B.CRAFTING_TABLE));
    expect(tableStep).toBeGreaterThanOrEqual(0);
    expect(log.progressOf('workbench')[tableStep]).toBe(1);

    // A furnace: take what it made out of its output slot.
    const forge = QUESTS.find((q) => q.objectives.some((o) => o.kind === 'smelt'))!;
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
    const dark = questById('into_the_dark')!;
    const chain = (id: string): void => {
      const q = questById(id)!;
      for (const r of q.requires) chain(r);
      log.done.add(id);
    };
    for (const r of dark.requires) chain(r);
    expect(log.accept(dark.id)).toBe(true);
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
    run(s, 0.6);
    expect(s.drainEvents().some((e) => e.t === 'zone')).toBe(false);
  });

  it('is saved with its quests and gets them back', () => {
    const s = make();
    run(s, 1.5);
    takeAndDo(s, 'welcome');
    talkTo(s, 'brannoc');
    s.apply({ t: 'quest', a: 'accept', id: 'first_timber' });
    s.closeMenu();
    const save = parsePlayerSave(JSON.parse(JSON.stringify(s.savePlayer())))!;
    expect(save.quests).toBeDefined();
    const t = make(9);
    t.loadPlayer(save);
    expect([...t.quests!.done]).toEqual([FIRST_QUEST, 'welcome']);
    expect(t.quests!.status('first_timber')).toMatch(/active/);
    const synced = t.drainEvents().filter((e): e is Extract<SessionEvent, { t: 'quests' }> => e.t === 'quests');
    expect(synced.length).toBeGreaterThan(0);
    const log = synced[synced.length - 1].log as QuestLogJSON;
    expect(log.d).toEqual([FIRST_QUEST, 'welcome']);
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
