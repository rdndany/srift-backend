import { describe, expect, it } from 'vitest';
import {
  B,
  BOBBER_LEASH,
  CATCH_CHANCE,
  ENCH,
  ENCHANTS,
  FISH_BITE,
  FISH_WAIT,
  FISHING_ROD_DURABILITY,
  GameSession,
  HeadlessWorld,
  I,
  MOBS,
  SMELTING,
  WorldGenerator,
  canCarry,
  catchChances,
  findRecipe,
  getItem,
  makeStack,
  mulberry32,
  rollCatch,
  toolId,
  type InputFrame,
  type ItemStack,
  type SessionEvent,
} from './index';

const SEED = 1337;
const FLOOR = 100;
const CX = 8;
const CZ = 8;

const idle = (over: Partial<InputFrame> = {}): InputFrame => ({
  t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false, ...over,
});

/** A flat meadow with a pond to the north (the way yaw 0 looks): five wide, from 5 to 11 blocks off, two deep. */
function make(opts: { pond?: boolean; mode?: 'survival' | 'creative'; roof?: boolean } = {}) {
  const generator = new WorldGenerator(SEED);
  const world = new HeadlessWorld(generator);
  for (let x = CX - 14; x <= CX + 14; x++)
    for (let z = CZ - 14; z <= CZ + 14; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 14; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.GRASS);
    }
  if (opts.pond !== false) {
    for (let x = CX - 4; x <= CX + 4; x++)
      for (let z = CZ - 12; z <= CZ - 5; z++) {
        world.setBlock(x, FLOOR - 1, z, B.SAND);
        world.setBlock(x, FLOOR, z, B.WATER);
      }
  }
  if (opts.roof) for (let x = CX - 5; x <= CX + 5; x++) for (let z = CZ - 13; z <= CZ - 4; z++) world.setBlock(x, FLOOR + 3, z, B.PLANKS);
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(11), mode: opts.mode ?? 'survival' });
  s.finishLoading();
  s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
  s.drainEvents();
  return { s, world };
}

const rod = (extra: Partial<ItemStack> = {}): ItemStack => ({ ...makeStack(I.FISHING_ROD, 1), ...extra });
const take = (s: GameSession, stack: ItemStack) => {
  s.inventory.set(s.selected, stack);
};
const run = (s: GameSession, seconds: number, over: Partial<InputFrame> = {}) => {
  for (let i = 0; i < Math.round(seconds * 20); i++) s.tick(idle(over));
};
/** One press of the use button. */
const click = (s: GameSession, over: Partial<InputFrame> = {}) => {
  s.tick(idle({ right: false, ...over }));
  s.tick(idle({ right: true, ...over }));
  s.tick(idle({ right: false, ...over }));
};
const events = (s: GameSession): SessionEvent[] => s.drainEvents();
/** Everything in the pack, counted by the item. */
const total = (s: GameSession): number => {
  let n = 0;
  for (let i = 0; i < s.inventory.size; i++) n += s.inventory.get(i)?.count ?? 0;
  return n;
};
const fishEvents = (list: SessionEvent[]) => list.flatMap((e) => (e.t === 'fish' ? [e.what] : []));
const drops = (s: GameSession) => s.drops.drops.map((d) => d.stack);
/** Cast at the pond and wait for the bobber to settle on it. */
const castAtPond = (s: GameSession, lookOver: Partial<InputFrame> = { pitch: 0.12 }) => {
  click(s, lookOver);
  run(s, 3, lookOver);
  return s.fishing.of(s)!;
};

describe('the fishing rod', () => {
  it('is three sticks and two string, either way round', () => {
    const S = I.STICK;
    const T = I.STRING;
    const grid = (cells: number[]) => cells.map((c) => (c ? makeStack(c, 1) : null));
    expect(findRecipe(grid([0, 0, S, 0, S, T, S, 0, T]), 3, 3)?.result).toEqual({ id: I.FISHING_ROD, count: 1 });
    expect(findRecipe(grid([S, 0, 0, T, S, 0, T, 0, S]), 3, 3)?.result).toEqual({ id: I.FISHING_ROD, count: 1 });
    const def = getItem(I.FISHING_ROD);
    expect(def.use).toBe('fishing_rod');
    expect(def.durability).toBe(FISHING_ROD_DURABILITY);
    expect(def.maxStack).toBe(1);
  });

  it('takes Lure and Luck of the Sea, which no sword or pickaxe does', () => {
    const lure = ENCHANTS.find((e) => e.id === ENCH.LURE)!;
    const luck = ENCHANTS.find((e) => e.id === ENCH.LUCK_OF_THE_SEA)!;
    expect(canCarry(getItem(I.FISHING_ROD), lure)).toBe(true);
    expect(canCarry(getItem(I.FISHING_ROD), luck)).toBe(true);
    expect(canCarry(getItem(toolId('sword', 'diamond')), lure)).toBe(false);
    expect(canCarry(getItem(toolId('pickaxe', 'iron')), luck)).toBe(false);
    expect(canCarry(getItem(I.BOW), lure)).toBe(false);
  });
});

describe('casting', () => {
  it('throws a bobber that flies, comes down on the water and floats there', () => {
    const { s } = make();
    take(s, rod());
    click(s, { pitch: 0.12 });
    const b = s.fishing.of(s)!;
    expect(b).toBeTruthy();
    expect(b.state).toBe('flying');
    expect(fishEvents(events(s))).toContain('cast');
    run(s, 3, { pitch: 0.12 });
    expect(b.state).toBe('floating');
    expect(b.z).toBeLessThan(CZ - 4);
    expect(b.z).toBeGreaterThan(CZ - 13);
    // It rides the surface (a water source is a little under a whole block high).
    expect(b.y).toBeGreaterThan(FLOOR + 0.5);
    expect(b.y).toBeLessThan(FLOOR + 1);
    expect(s.bobbers.bobbers).toHaveLength(1);
    expect(s.bobbers.bobbers[0]).toMatchObject({ own: true, mode: 1 });
  });

  it('tells everyone near that it landed in the water', () => {
    const { s } = make();
    take(s, rod());
    click(s, { pitch: 0.12 });
    const heard = fishEvents(events(s));
    run(s, 2, { pitch: 0.12 });
    expect([...heard, ...fishEvents(events(s))]).toContain('splash');
  });

  it('cannot be cast on the ground: it is given back, with a word about it, and the rod is not worn', () => {
    const { s } = make({ pond: false });
    take(s, rod());
    events(s);
    click(s, { pitch: 0.1 });
    expect(s.fishing.of(s)).toBeTruthy();
    run(s, 3, { pitch: 0.1 });
    expect(s.fishing.of(s)).toBeNull();
    expect(events(s).some((e) => e.t === 'toast' && e.text.includes('only fish in water'))).toBe(true);
    expect(s.held!.damage).toBe(0);
    // It can be cast again at once.
    click(s, { pitch: 0.1 });
    expect(s.fishing.of(s)).toBeTruthy();
  });

  it('cannot be cast at a wall either', () => {
    const { s, world } = make();
    take(s, rod());
    for (let y = FLOOR + 1; y <= FLOOR + 6; y++) for (let x = CX - 3; x <= CX + 3; x++) world.setBlock(x, y, CZ - 3, B.STONE);
    click(s, { pitch: 0.05 });
    run(s, 2, { pitch: 0.05 });
    expect(s.fishing.of(s)).toBeNull();
  });

  it('comes loose when the fisher walks too far from it, with a word about it', () => {
    const { s } = make();
    take(s, rod());
    castAtPond(s);
    events(s);
    const b = s.fishing.of(s)!;
    s.teleport(b.x, FLOOR + 1, b.z + BOBBER_LEASH - 4, 0, 0);
    run(s, 0.2);
    expect(s.fishing.of(s)).toBeTruthy();
    s.teleport(b.x, FLOOR + 1, b.z + BOBBER_LEASH + 3, 0, 0);
    run(s, 0.2);
    expect(s.fishing.of(s)).toBeNull();
    expect(events(s).some((e) => e.t === 'toast' && e.text.includes('too far'))).toBe(true);
  });

  it('is reeled in by the next press of the button, and a new press casts again', () => {
    const { s } = make();
    take(s, rod());
    castAtPond(s);
    click(s, { pitch: 0.12 });
    expect(s.fishing.of(s)).toBeNull();
    expect(fishEvents(events(s))).toContain('reel');
    click(s, { pitch: 0.12 });
    expect(s.fishing.of(s)).toBeTruthy();
  });

  it('is lost when the rod is put away, or the line is too long, or the fisher dies', () => {
    const a = make();
    take(a.s, rod());
    a.s.inventory.set(1, makeStack(B.DIRT, 4));
    castAtPond(a.s);
    expect(a.s.fishing.of(a.s)).toBeTruthy();
    a.s.selectSlot(1);
    run(a.s, 0.2);
    expect(a.s.fishing.of(a.s)).toBeNull();

    const b = make();
    take(b.s, rod());
    castAtPond(b.s);
    b.s.teleport(CX + 60, FLOOR + 1, CZ, 0, 0);
    run(b.s, 0.2);
    expect(b.s.fishing.of(b.s)).toBeNull();

    const c = make();
    take(c.s, rod());
    castAtPond(c.s);
    c.s.vitals.health = 0;
    c.s.vitals.dead = true;
    run(c.s, 0.2);
    expect(c.s.fishing.of(c.s)).toBeNull();
  });

  it('keeps the shield in the off hand down while the rod is in use', () => {
    const { s } = make();
    take(s, rod());
    s.offhand.set(0, makeStack(I.SHIELD, 1));
    run(s, 0.3, { right: true });
    expect(s.blocking).toBe(false);
  });
});

describe('biting', () => {
  it('waits for a fish for as long as the original does, with Lure it is quicker', () => {
    const waits = (lure: number) => {
      const { s } = make();
      take(s, rod(lure > 0 ? { ench: [[ENCH.LURE, lure]] } : {}));
      return castAtPond(s).timer;
    };
    const plain = waits(0);
    const lured = waits(3);
    expect(plain).toBeLessThanOrEqual(FISH_WAIT[1]);
    expect(plain).toBeGreaterThan(FISH_WAIT[0] - 3);
    expect(lured).toBeLessThan(plain);
    expect(lured).toBeGreaterThanOrEqual(1 - 3);
  });

  it('is first a fish that comes (bubbles), then a bite that pulls the float under', () => {
    const { s } = make();
    take(s, rod({ ench: [[ENCH.LURE, 3]] }));
    const b = castAtPond(s);
    events(s);
    b.timer = 0.05;
    run(s, 0.3, { pitch: 0.12 });
    expect(b.phase).toBe('lured');
    expect(s.bobbers.bobbers[0].mode).toBe(2);
    expect(fishEvents(events(s))).toContain('lure');
    b.timer = 0.05;
    run(s, 0.3, { pitch: 0.12 });
    expect(b.phase).toBe('bite');
    expect(s.bobbers.bobbers[0].mode).toBe(3);
    expect(fishEvents(events(s))).toContain('bite');
    // It dips under the surface while the fish has it.
    run(s, 0.5, { pitch: 0.12 });
    expect(b.y).toBeLessThan(FLOOR + 0.75);
  });

  it('lets the fish go if nobody reels in in time, and the wait starts over', () => {
    const { s } = make();
    take(s, rod());
    const b = castAtPond(s);
    b.phase = 'bite';
    b.timer = FISH_BITE[0];
    events(s);
    run(s, FISH_BITE[0] + 0.3, { pitch: 0.12 });
    expect(b.phase).toBe('wait');
    expect(b.timer).toBeGreaterThan(0);
    expect(fishEvents(events(s))).toContain('escape');
  });

  it('brings a catch out of the water when you reel in on a bite, and wears the rod', () => {
    const { s } = make();
    take(s, rod());
    const before = total(s);
    const b = castAtPond(s);
    b.phase = 'bite';
    b.timer = 2;
    events(s);
    click(s, { pitch: 0.12 });
    expect(s.fishing.of(s)).toBeNull();
    const out = events(s);
    expect(fishEvents(out)).toContain('catch');
    expect(drops(s)).toHaveLength(1);
    expect(s.held!.damage).toBe(1);
    // The catch flies to you and is picked up; experience orbs are let out with it.
    expect(s.xpOrbs.count).toBeGreaterThan(0);
    run(s, 3);
    expect(s.drops.count).toBe(0);
    expect(total(s) - before).toBe(1);
  });

  it('gives nothing, and takes nothing off the rod, when you reel in too early', () => {
    const { s } = make();
    take(s, rod());
    const b = castAtPond(s);
    expect(b.phase).toBe('wait');
    click(s, { pitch: 0.12 });
    expect(s.drops.count).toBe(0);
    expect(s.held!.damage).toBe(0);
    expect(s.xpOrbs.count).toBe(0);
  });

  it('does not wear a rod in creative mode', () => {
    const { s } = make({ mode: 'creative' });
    take(s, rod());
    const b = castAtPond(s);
    b.phase = 'bite';
    b.timer = 2;
    click(s, { pitch: 0.12 });
    expect(s.drops.count).toBe(1);
    expect(s.held!.damage).toBe(0);
  });

  it('breaks the rod on its last use', () => {
    const { s } = make();
    take(s, rod({ damage: FISHING_ROD_DURABILITY - 1 }));
    const b = castAtPond(s);
    b.phase = 'bite';
    b.timer = 2;
    click(s, { pitch: 0.12 });
    expect(s.held).toBeNull();
  });

  it('pays attention to the weather: rain under the open sky hurries the fish, a roof does not', () => {
    const wait = (roof: boolean, rain: number) => {
      const { s } = make({ roof });
      take(s, rod());
      s.weather.rain = rain;
      const b = castAtPond(s);
      const before = b.timer;
      s.weather.rain = rain;
      run(s, 2, { pitch: 0.12 });
      return before - b.timer;
    };
    expect(wait(false, 1)).toBeGreaterThan(wait(false, 0) + 0.2);
    expect(wait(true, 1)).toBeCloseTo(wait(true, 0), 0);
  });
});

describe('what comes up', () => {
  const tally = (luck: number, open: boolean, n = 20000) => {
    const rand = mulberry32(99);
    const count = { fish: 0, junk: 0, treasure: 0 };
    for (let i = 0; i < n; i++) count[rollCatch(rand, luck, open).kind]++;
    return { fish: count.fish / n, junk: count.junk / n, treasure: count.treasure / n };
  };

  it('is mostly fish, some junk and, in open water only, treasure', () => {
    const open = tally(0, true);
    expect(open.fish).toBeGreaterThan(0.82);
    expect(open.fish).toBeLessThan(0.88);
    expect(open.junk).toBeGreaterThan(0.08);
    expect(open.junk).toBeLessThan(0.12);
    expect(open.treasure).toBeGreaterThan(CATCH_CHANCE.treasure - 0.015);
    expect(open.treasure).toBeLessThan(CATCH_CHANCE.treasure + 0.015);
    const closed = tally(0, false);
    expect(closed.treasure).toBe(0);
  });

  it('is less junk and more treasure with Luck of the Sea', () => {
    expect(catchChances(0, true).junk).toBeCloseTo(0.1);
    expect(catchChances(3, true).junk).toBeLessThan(catchChances(0, true).junk);
    expect(catchChances(3, true).treasure).toBeGreaterThan(catchChances(0, true).treasure);
    expect(catchChances(3, false).treasure).toBe(0);
    for (const luck of [0, 1, 2, 3]) for (const open of [true, false]) {
      const c = catchChances(luck, open);
      expect(c.fish + c.junk + c.treasure).toBeCloseTo(1);
      expect(c.fish).toBeGreaterThan(0.8);
    }
  });

  it('has cod most often among the fish, and every kind turns up', () => {
    const rand = mulberry32(5);
    const seen = new Map<number, number>();
    for (let i = 0; i < 4000; i++) {
      const c = rollCatch(rand, 0, true);
      if (c.kind === 'fish') seen.set(c.stack.id, (seen.get(c.stack.id) ?? 0) + 1);
    }
    expect([...seen.keys()].sort()).toEqual([I.RAW_COD, I.RAW_SALMON, I.PUFFERFISH, I.TROPICAL_FISH].sort());
    expect(seen.get(I.RAW_COD)!).toBeGreaterThan(seen.get(I.RAW_SALMON)!);
    expect(seen.get(I.RAW_SALMON)!).toBeGreaterThan(seen.get(I.PUFFERFISH)!);
    expect(seen.get(I.PUFFERFISH)!).toBeGreaterThan(seen.get(I.TROPICAL_FISH)!);
  });

  it('gives treasures that are worth having: enchanted, and only things that exist', () => {
    const rand = mulberry32(21);
    const kinds = new Set<number>();
    for (let i = 0; i < 3000; i++) {
      const c = rollCatch(rand, 3, true);
      expect(c.stack.count).toBeGreaterThan(0);
      expect(getItem(c.stack.id)).toBeTruthy();
      expect(c.stack.damage).toBeLessThan(Math.max(1, getItem(c.stack.id).durability || 1));
      if (c.kind === 'treasure') {
        kinds.add(c.stack.id);
        if (c.stack.id === I.ENCHANTED_BOOK) expect(c.stack.ench!.length).toBeGreaterThan(0);
      }
    }
    expect([...kinds].sort()).toEqual([I.BOW, I.FISHING_ROD, I.EMERALD, I.ENCHANTED_BOOK].sort());
  });

  it('counts a pond with a roof over it as not open', () => {
    const open = make();
    take(open.s, rod());
    const a = castAtPond(open.s);
    expect(open.s.fishing.openWater(a)).toBe(true);
    const roofed = make({ roof: true });
    take(roofed.s, rod());
    const b = castAtPond(roofed.s);
    expect(roofed.s.fishing.openWater(b)).toBe(false);
  });
});

describe('a creature on the line', () => {
  it('is hooked by a bobber that hits it, and flung towards you when you reel in', () => {
    const { s } = make();
    take(s, rod());
    const cow = s.mobs.spawn('cow', CX + 0.5, FLOOR + 1, CZ - 3.5);
    cow.noDrops = true;
    click(s, { pitch: 0.02 });
    run(s, 2, { pitch: 0.02 });
    const b = s.fishing.of(s)!;
    expect(b.state).toBe('hooked');
    expect(b.hook).toBe(cow);
    expect(s.bobbers.bobbers[0].mode).toBe(5);
    click(s, { pitch: 0.02 });
    expect(s.fishing.of(s)).toBeNull();
    // It is pulled towards the fisher (the way yaw 0 looks is -z, so the pull is +z).
    expect(cow.kbz).toBeGreaterThan(0);
    expect(cow.knockTime).toBeGreaterThan(0);
    expect(s.held!.damage).toBe(3);
  });

  it('lets go of a creature that is gone', () => {
    const { s } = make();
    take(s, rod());
    const cow = s.mobs.spawn('cow', CX + 0.5, FLOOR + 1, CZ - 3.5);
    click(s, { pitch: 0.02 });
    run(s, 2, { pitch: 0.02 });
    const b = s.fishing.of(s)!;
    expect(b.hook).toBe(cow);
    cow.dead = true;
    run(s, 0.2, { pitch: 0.02 });
    expect(b.hook).toBeNull();
    expect(b.state).not.toBe('hooked');
  });
});

describe('the fish themselves', () => {
  it('are food, and cook', () => {
    for (const [raw, cooked] of [[I.RAW_COD, I.COOKED_COD], [I.RAW_SALMON, I.COOKED_SALMON]]) {
      expect(SMELTING.get(raw)).toBe(cooked);
      expect(getItem(cooked).food!.hunger).toBeGreaterThan(getItem(raw).food!.hunger);
    }
    expect(getItem(I.TROPICAL_FISH).food).toBeTruthy();
    expect(SMELTING.has(I.TROPICAL_FISH)).toBe(false);
  });

  it('are poison, when it is a pufferfish', () => {
    const food = getItem(I.PUFFERFISH).food!;
    expect(food.poison!.chance).toBe(1);
    expect(food.sickness!.chance).toBe(1);
  });

  it('drop themselves when killed, and come cooked from a fish that burns', () => {
    const rand = mulberry32(3);
    const out = (kind: keyof typeof MOBS) => MOBS[kind].drops(rand, undefined as never).map((d) => d.id);
    expect(out('cod')).toContain(I.RAW_COD);
    expect(out('salmon')).toContain(I.RAW_SALMON);
    expect(out('pufferfish')).toContain(I.PUFFERFISH);
    expect(out('tropical_fish')).toEqual([I.TROPICAL_FISH]);
  });
});
