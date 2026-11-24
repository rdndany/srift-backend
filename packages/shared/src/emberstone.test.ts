import { describe, expect, it } from 'vitest';
import {
  B,
  BED_DIRS,
  CLASSES,
  GameSession,
  EMBER_CAST,
  EMBER_COOLDOWN,
  HeadlessWorld,
  I,
  CraftingMenu,
  holdsInOffhand,
  WorldGenerator,
  bedId,
  formatEmberTime,
  getItem,
  makeStack,
  mulberry32,
  parsePlayerSave,
  parseSessionMessage,
  shopOf,
  tooltipLines,
  QUESTS,
  type InputFrame,
  type SessionEvent,
} from './index';

const SEED = 1337;
const FLOOR = 100;
const CX = 8;
const CZ = 8;

const idle = (over: Partial<InputFrame> = {}): InputFrame => ({
  t: 'frame',
  dt: 1 / 20,
  locked: true,
  yaw: 0,
  pitch: 0,
  forward: 0,
  strafe: 0,
  jump: false,
  sprint: false,
  sneak: false,
  left: false,
  right: false,
  ...over,
});

/** A flat stone floor with a bed at the east side; the player stands at the west side with the Emberstone selected. */
function make(mode: 'survival' | 'creative' = 'survival') {
  const generator = new WorldGenerator(SEED);
  const world = new HeadlessWorld(generator);
  for (let x = CX - 14; x <= CX + 14; x++)
    for (let z = CZ - 14; z <= CZ + 14; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 14; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.STONE);
    }
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(5), mode });
  s.finishLoading();
  const [dx, dz] = BED_DIRS[3];
  world.setBlock(CX + 8, FLOOR + 1, CZ, bedId(false, 3));
  world.setBlock(CX + 8 + dx, FLOOR + 1, CZ + dz, bedId(true, 3));
  s.teleport(CX - 8 + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
  s.inventory.set(0, makeStack(I.EMBERSTONE, 1));
  s.apply({ t: 'select', slot: 0 });
  return { s, world, head: [CX + 8 + dx, FLOOR + 1, CZ + dz] as [number, number, number] };
}

const seconds = (s: GameSession, n: number, over: Partial<InputFrame> = {}): void => {
  for (let i = 0; i < Math.round(n * 20); i++) s.tick(idle(over));
};
const toasts = (s: GameSession): string[] => s.drainEvents().flatMap((e: SessionEvent) => (e.t === 'toast' ? [e.text] : []));

describe('the Emberstone item', () => {
  it('is a single item with a tooltip that says what it does', () => {
    expect(getItem(I.EMBERSTONE).name).toBe('emberstone');
    expect(getItem(I.EMBERSTONE).maxStack).toBe(1);
    const text = tooltipLines(makeStack(I.EMBERSTONE, 1)).map((l) => l.text).join('\n');
    expect(text).toContain('teleports you to your bed');
    expect(text).toContain(formatEmberTime(EMBER_COOLDOWN));
  });

  it('is sold by the general goods merchant for those who lose theirs', () => {
    expect(shopOf('tobin')!.stock.some((w) => w.id === I.EMBERSTONE)).toBe(true);
  });

  it('formats times as minutes and seconds', () => {
    expect(formatEmberTime(300)).toBe('5:00');
    expect(formatEmberTime(271.2)).toBe('4:32');
    expect(formatEmberTime(0)).toBe('0:00');
  });
});

describe('a new character', () => {
  it('starts with an Emberstone in slot 2 of the bottom bar and a map in slot 3, and the quest no longer hands out the map', () => {
    const generator = new WorldGenerator(SEED);
    const world = new HeadlessWorld(generator);
    const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(2) });
    s.finishLoading();
    expect(s.inventory.get(1)?.id).toBe(I.EMBERSTONE);
    expect(s.inventory.get(2)?.id).toBe(I.MAP);
    expect(s.inventory.countOf(I.EMBERSTONE)).toBe(1);
    expect(s.inventory.countOf(I.MAP)).toBe(1);
    // Only the Adventure world gives one, for climbing out of the Undercroft (see quests.ts).
    expect(QUESTS.filter((q) => q.reward.items?.some((it) => it.id === I.MAP)).map((q) => q.id)).toEqual(['ms00']);
  });

  it('keeps the two slots whatever the class, and the class kit takes the free ones around them', () => {
    for (const classId of ['warrior', 'mage', 'ranger'] as const) {
      const generator = new WorldGenerator(SEED);
      const s = new GameSession({ seed: SEED, world: new HeadlessWorld(generator), generator, naturalSpawning: false, rand: mulberry32(2), classId });
      s.finishLoading();
      expect(s.inventory.get(1)?.id).toBe(I.EMBERSTONE);
      expect(s.inventory.get(2)?.id).toBe(I.MAP);
      for (const k of CLASSES[classId].startingKit) expect(s.inventory.countOf(k.id) + (s.offhand.get(0)?.id === k.id ? 1 : 0)).toBe(k.count);
      expect(s.held?.id).toBe(CLASSES[classId].startingWeapon); // the weapon is still in the first slot, in hand
    }
  });
  it('gets nothing extra in creative mode, where everything is at hand', () => {
    const generator = new WorldGenerator(SEED);
    const world = new HeadlessWorld(generator);
    const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(2), mode: 'creative' });
    s.finishLoading();
    expect(s.inventory.countOf(I.EMBERSTONE)).toBe(0);
  });

  it('is not given another one when a saved character is loaded', () => {
    const { s } = make();
    const save = parsePlayerSave(JSON.parse(JSON.stringify(s.savePlayer())))!;
    const generator = new WorldGenerator(SEED);
    const t = new GameSession({ seed: SEED, world: new HeadlessWorld(generator), generator, naturalSpawning: false, rand: mulberry32(2) });
    t.loadPlayer(save);
    t.finishLoading();
    // What was saved comes back as it was: no second helping of the starter items.
    expect(t.inventory.countOf(I.EMBERSTONE)).toBe(s.inventory.countOf(I.EMBERSTONE));
    expect(t.inventory.countOf(I.MAP)).toBe(s.inventory.countOf(I.MAP));
  });
});

describe('using the Emberstone', () => {
  it('takes you to your bed after the cast, and then rests', () => {
    const { s, head } = make();
    s.spawnPoint = { x: head[0], y: head[1], z: head[2] };
    seconds(s, EMBER_CAST - 1, { right: true });
    expect(s.body.x).toBeLessThan(CX); // still where it began
    expect(s.hudProgress).toBeGreaterThan(0.5);
    seconds(s, 1.5, { right: true });
    expect(Math.hypot(s.body.x - (head[0] + 0.5), s.body.z - (head[2] + 0.5))).toBeLessThan(3);
    expect(s.emberCooldown).toBeGreaterThan(EMBER_COOLDOWN - 3);
    expect(toasts(s).some((t) => t.includes('took you home'))).toBe(true);
  });

  it('cannot be used again until it has rested, and says for how long', () => {
    const { s, head } = make();
    s.spawnPoint = { x: head[0], y: head[1], z: head[2] };
    seconds(s, EMBER_CAST + 1, { right: true });
    s.drainEvents();
    s.teleport(CX - 8 + 0.5, FLOOR + 1, CZ + 0.5);
    seconds(s, 0.2); // let go of the button
    seconds(s, EMBER_CAST + 1, { right: true });
    expect(s.body.x).toBeLessThan(CX);
    expect(toasts(s).some((t) => t.includes('resting'))).toBe(true);
  });

  it('works again after the rest', () => {
    const { s, head } = make();
    s.spawnPoint = { x: head[0], y: head[1], z: head[2] };
    s.emberCooldown = 0.5;
    seconds(s, 1);
    expect(s.emberCooldown).toBe(0);
    seconds(s, EMBER_CAST + 1, { right: true });
    expect(s.body.x).toBeGreaterThan(CX);
  });

  it('is lost by walking away, and by letting go', () => {
    const { s, head } = make();
    s.spawnPoint = { x: head[0], y: head[1], z: head[2] };
    seconds(s, 2, { right: true });
    seconds(s, 1.5, { right: true, forward: 1 });
    expect(toasts(s).some((t) => t.includes('interrupted'))).toBe(true);
    seconds(s, EMBER_CAST + 2, { right: true }); // the button is still down: it does not start over by itself
    expect(s.body.x).toBeLessThan(CX);
    expect(s.emberCooldown).toBe(0);
    // Letting go ends a cast, too.
    seconds(s, 0.1);
    s.teleport(CX - 8 + 0.5, FLOOR + 1, CZ + 0.5);
    seconds(s, 3, { right: true });
    seconds(s, 0.2);
    seconds(s, 4, {});
    expect(s.body.x).toBeLessThan(CX);
    expect(s.emberCooldown).toBe(0);
  });

  it('does not start while you walk or jump, only when you stand still', () => {
    const { s, head } = make();
    s.spawnPoint = { x: head[0], y: head[1], z: head[2] };
    seconds(s, 0.5, { forward: 1 });
    s.drainEvents();
    seconds(s, 1, { right: true, forward: 1 });
    expect(s.hudProgress).toBe(0);
    expect(toasts(s).some((t) => t.includes('stand still'))).toBe(true);
    // in the air
    seconds(s, 0.3);
    s.tick(idle({ jump: true }));
    s.tick(idle({ jump: true, right: true }));
    expect(s.hudProgress).toBe(0);
    // standing: it starts
    seconds(s, 1.5);
    seconds(s, 1, { right: true });
    expect(s.hudProgress).toBeGreaterThan(0);
  });

  it('is lost when you are hurt', () => {
    const { s, head } = make();
    s.spawnPoint = { x: head[0], y: head[1], z: head[2] };
    seconds(s, 2, { right: true });
    s.vitals.health -= 2;
    seconds(s, EMBER_CAST, { right: true });
    expect(s.body.x).toBeLessThan(CX);
    expect(s.emberCooldown).toBe(0);
  });

  it('without a bed takes you to the village instead', () => {
    const { s } = make();
    expect(s.spawnPoint).toBeNull();
    seconds(s, EMBER_CAST + 1, { right: true });
    expect(toasts(s).some((t) => t.includes('no bed'))).toBe(true);
    expect(s.emberCooldown).toBeGreaterThan(0);
  });

  it('has no cooldown in creative mode', () => {
    const { s, head } = make('creative');
    s.spawnPoint = { x: head[0], y: head[1], z: head[2] };
    seconds(s, EMBER_CAST + 1, { right: true });
    expect(s.body.x).toBeGreaterThan(CX);
    expect(s.emberCooldown).toBe(0);
  });

  it('keeps its rest when the character is saved and loaded', () => {
    const { s } = make();
    s.emberCooldown = 120.4;
    const save = parsePlayerSave(JSON.parse(JSON.stringify(s.savePlayer())))!;
    expect(save.hs).toBe(121);
    const generator = new WorldGenerator(SEED);
    const t = new GameSession({ seed: SEED, world: new HeadlessWorld(generator), generator, naturalSpawning: false, rand: mulberry32(2) });
    t.loadPlayer(save);
    expect(t.emberCooldown).toBe(121);
    // A forged value cannot be longer than the rest itself, nor negative.
    expect(parsePlayerSave({ ...JSON.parse(JSON.stringify(s.savePlayer())), hs: 99999 })!.hs).toBe(EMBER_COOLDOWN);
    expect(parsePlayerSave({ ...JSON.parse(JSON.stringify(s.savePlayer())), hs: -5 })!.hs).toBeUndefined();
  });

  it('is not an exploit of the protocol: it needs no command of its own', () => {
    expect(parseSessionMessage({ t: 'emberstone' })).toBeNull();
  });
});

describe('what the Emberstone shows and plays', () => {
  const ember = (s: GameSession): { what: string; x: number; z: number }[] =>
    s.drainEvents().flatMap((e: SessionEvent) => (e.t === 'ember' ? [{ what: e.what, x: e.x, z: e.z }] : []));

  it('tells everyone near when the cast begins, once, and where it is happening', () => {
    const { s } = make();
    s.drainEvents();
    seconds(s, 2, { right: true });
    const seen = ember(s);
    expect(seen.filter((e) => e.what === 'start')).toHaveLength(1);
    expect(seen[0].x).toBeCloseTo(s.body.x, 0);
    expect(seen[0].z).toBeCloseTo(s.body.z, 0);
  });

  it('tells them the cast was lost, where it began, when you move', () => {
    const { s } = make();
    seconds(s, 1, { right: true });
    s.drainEvents();
    const fromX = s.body.x;
    seconds(s, 1.5, { right: true, forward: 1, strafe: 1 });
    const seen = ember(s);
    const stop = seen.find((e) => e.what === 'stop');
    expect(stop).toBeDefined();
    expect(Math.abs(stop!.x - fromX)).toBeLessThan(1);
    expect(seen.filter((e) => e.what === 'stop')).toHaveLength(1);
  });

  it('shows the departure where you stood and the arrival at the bed', () => {
    const { s, head } = make();
    s.spawnPoint = { x: head[0], y: head[1], z: head[2] };
    const fromX = s.body.x;
    s.drainEvents();
    seconds(s, EMBER_CAST + 1, { right: true });
    const seen = ember(s);
    const depart = seen.find((e) => e.what === 'depart')!;
    const arrive = seen.find((e) => e.what === 'arrive')!;
    expect(Math.abs(depart.x - fromX)).toBeLessThan(1);
    expect(Math.hypot(arrive.x - (head[0] + 0.5), arrive.z - (head[2] + 0.5))).toBeLessThan(3);
    expect(seen.map((e) => e.what).indexOf('depart')).toBeLessThan(seen.map((e) => e.what).indexOf('arrive'));
  });

  it('tells how far into the cast the figure is (for its stance), only while the cast goes on', () => {
    const { s } = make();
    expect(s.emberProgress).toBe(0);
    seconds(s, 0.1, { right: true });
    expect(s.emberProgress).toBeGreaterThan(0);
    expect(s.emberProgress).toBeLessThan(0.1);
    seconds(s, 2, { right: true });
    expect(s.emberProgress).toBeGreaterThan(0.35);
    // lost by walking: the stance ends with it
    seconds(s, 1.5, { right: true, forward: 1, strafe: 1 });
    expect(s.emberProgress).toBe(0);
  });

  it('says nothing when there is nothing to cast (another item in hand)', () => {
    const { s } = make();
    s.inventory.set(1, makeStack(I.APPLE, 1));
    s.apply({ t: 'select', slot: 1 });
    s.vitals.hunger = 20;
    s.drainEvents();
    seconds(s, 2, { right: true });
    expect(ember(s)).toHaveLength(0);
  });

  it('the protocol accepts the event as plain data', () => {
    const e: SessionEvent = { t: 'ember', what: 'arrive', x: 1, y: 2, z: 3 };
    expect(JSON.parse(JSON.stringify(e))).toEqual(e);
  });
});

describe('what cannot be thrown away', () => {
  const dropped = (s: GameSession): number => s.drops.drops.length;

  it('keeps the Emberstone and the map when dropped from the hand (all of it or one)', () => {
    const { s } = make();
    s.drainEvents();
    for (const slot of [1, 2]) {
      s.apply({ t: 'select', slot });
      s.apply({ t: 'drop', all: false });
      s.apply({ t: 'drop', all: true });
    }
    expect(dropped(s)).toBe(0);
    expect(s.inventory.countOf(I.EMBERSTONE)).toBeGreaterThanOrEqual(1);
    expect(s.inventory.get(2)?.id).toBe(I.MAP);
    expect(toasts(s).some((t) => t.includes('cannot be dropped'))).toBe(true);
  });

  it('keeps them when let go of outside an open screen', () => {
    const { s } = make();
    s.apply({ t: 'inventory' });
    expect(s.menu).not.toBeNull();
    s.menu!.cursor = makeStack(I.MAP, 1);
    s.drainEvents();
    s.apply({ t: 'dropCursor', all: true });
    expect(s.menu!.cursor?.id).toBe(I.MAP);
    expect(dropped(s)).toBe(0);
    expect(toasts(s).some((t) => t.includes('cannot be dropped'))).toBe(true);
    s.menu!.cursor = makeStack(I.EMBERSTONE, 1);
    s.apply({ t: 'dropCursor', all: false });
    expect(s.menu!.cursor?.id).toBe(I.EMBERSTONE);
    // Anything else on the cursor does fall to the ground.
    s.menu!.cursor = makeStack(I.APPLE, 3);
    s.apply({ t: 'dropCursor', all: true });
    expect(s.menu!.cursor).toBeNull();
    expect(dropped(s)).toBe(1);
  });
  it('still lets everything else go', () => {
    const { s } = make();
    s.inventory.set(3, makeStack(I.APPLE, 5));
    s.apply({ t: 'select', slot: 3 });
    s.apply({ t: 'drop', all: true });
    expect(dropped(s)).toBe(1);
  });

  it('says so in the tooltip', () => {
    for (const id of [I.EMBERSTONE, I.MAP]) expect(tooltipLines(makeStack(id, 1)).some((l) => l.text === 'Cannot be dropped')).toBe(true);
    expect(tooltipLines(makeStack(I.APPLE, 1)).some((l) => l.text === 'Cannot be dropped')).toBe(false);
  });
});

describe('the map in the off hand', () => {
  it('is something the off hand takes, besides a shield, an orb and a dagger', () => {
    expect(holdsInOffhand(I.MAP)).toBe(true);
    expect(holdsInOffhand(I.SHIELD)).toBe(true);
    expect(holdsInOffhand(I.EMBERSTONE)).toBe(false);
  });

  it('swaps in and out of the off hand, and goes there with shift-click', () => {
    const { s } = make();
    s.apply({ t: 'select', slot: 2 });
    expect(s.held?.id).toBe(I.MAP);
    s.apply({ t: 'swap' });
    expect(s.offhand.get(0)?.id).toBe(I.MAP);
    expect(s.held).toBeNull();
    s.apply({ t: 'swap' });
    expect(s.held?.id).toBe(I.MAP);
    expect(s.offhand.get(0)).toBeNull();
    s.apply({ t: 'inventory' });
    const menu = s.menu as CraftingMenu;
    expect(menu.offhandSlot).toBeGreaterThanOrEqual(0);
    menu.shiftClick(menu.slots.findIndex((sl) => sl.container === s.inventory && sl.index === 2)); // the map's slot
    expect(s.offhand.get(0)?.id).toBe(I.MAP);
  });

  it('does not take other things: the hand keeps them, with a word about it', () => {
    const { s } = make();
    s.apply({ t: 'select', slot: 1 });
    s.drainEvents();
    s.swapHands();
    expect(s.offhand.get(0)).toBeNull();
    expect(toasts(s).some((t) => t.includes('a map'))).toBe(true);
  });});

describe('the map in the hand', () => {
  /** A block of stone right in front of the player, at eye height. */
  const wall = (world: HeadlessWorld): [number, number, number] => {
    const at: [number, number, number] = [CX - 8, FLOOR + 2, CZ - 2];
    world.setBlock(at[0], at[1], at[2], B.STONE);
    return at;
  };

  it('does not mine, while an empty hand does (creative mode breaks at once)', () => {
    const { s, world } = make('creative');
    const at = wall(world);
    s.inventory.set(3, makeStack(I.MAP, 1));
    s.apply({ t: 'select', slot: 3 });
    seconds(s, 1, { left: true });
    expect(world.getBlock(...at)).toBe(B.STONE);
    s.apply({ t: 'select', slot: 8 });
    seconds(s, 1, { left: true });
    expect(world.getBlock(...at)).toBe(B.AIR);
  });

  it('does not use anything either (no swing for the hand to make, no block placed)', () => {
    const { s, world } = make('creative');
    wall(world);
    s.inventory.set(3, makeStack(I.MAP, 1));
    s.apply({ t: 'select', slot: 3 });
    s.drainEvents();
    seconds(s, 0.5, { left: true, right: true });
    expect(s.drainEvents().some((e) => e.t === 'swing')).toBe(false);
    expect(s.inventory.countOf(I.MAP)).toBe(1);
  });
});
