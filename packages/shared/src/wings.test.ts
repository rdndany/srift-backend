import { describe, expect, it } from 'vitest';
import {
  B,
  CraftingMenu,
  GameSession,
  HeadlessWorld,
  I,
  RECIPES,
  TILE_NAMES,
  WINGS,
  WorldGenerator,
  createBody,
  stepPlayer,
  roofGap,
  type MoveInput,
  categoryOf,
  findRecipe,
  getItem,
  isUndroppable,
  makeStack,
  mulberry32,
  parsePlayerSave,
  shopOf,
  tooltipLines,
  tooltipName,
  wingBonusText,
  wingItemId,
  wingNumberOf,
  wingOfItem,
  type InputFrame,
  type ItemStack,
  type SessionEvent,
} from './index';

const idle = (over: Partial<InputFrame> = {}): InputFrame => ({ t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false, ...over });

function make() {
  const generator = new WorldGenerator(1337);
  const world = new HeadlessWorld(generator);
  for (let x = -32; x <= 48; x++)
    for (let z = -32; z <= 48; z++) {
      for (let y = 101; y < 140; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, 100, z, B.STONE);
    }
  const s = new GameSession({ seed: 1337, world, generator, naturalSpawning: false, rand: mulberry32(5), mode: 'survival', classId: 'mage' });
  s.finishLoading();
  s.teleport(8.5, 101, 8.5, 0, 0);
  s.drainEvents();
  return s;
}

const toasts = (s: GameSession): string[] => s.drainEvents().flatMap((e: SessionEvent) => (e.t === 'toast' ? [e.text] : []));
const slotAt = (s: GameSession, i: number) => s.menu!.slots.findIndex((x) => x.container === s.inventory && x.index === i && x.kind === 'normal');
const grid = (ids: (number | null)[]): (ItemStack | null)[] => ids.map((id) => (id ? makeStack(id, 1) : null));
const p = (s: GameSession) => s as unknown as { afterArmor(n: number): number; wingMight: number; wingNumber: number; wingFlying: boolean; flying: boolean };
const y = (s: GameSession) => (s as unknown as { body: { y: number } }).body.y;

describe('the wings are items', () => {
  it('have an item each, in the order of the list, with a picture of their own', () => {
    expect(WINGS.map((w) => w.id)).toEqual(['cinderwings', 'skywings', 'gladewings', 'ruinwings', 'radiantwings', 'stormwings']);
    WINGS.forEach((w, i) => {
      const id = wingItemId(w.id);
      expect(id).toBe(I.WING_BASE + i);
      expect(wingOfItem(id)?.id).toBe(w.id);
      expect(wingNumberOf(id)).toBe(i + 1);
      const item = getItem(id);
      expect(item.maxStack).toBe(1);
      expect(item.use).toBe('wings');
      expect(item.kind).toBe('Wings');
      expect(TILE_NAMES[item.tile]).toBe(`wings_${w.id}`);
      expect(categoryOf(makeStack(id, 1))).toBe('bag');
      expect(isUndroppable(id)).toBe(false);
    });
    expect(wingOfItem(I.WING_BASE + WINGS.length)).toBeNull();
    expect(wingOfItem(I.BREAD)).toBeNull();
    expect(wingNumberOf(I.BREAD)).toBe(0);
    expect(() => wingItemId('nope')).toThrow();
  });

  it('are stronger in the second pair, as in MU, and say what they give on the tooltip', () => {
    for (const w of WINGS) {
      expect(w.might).toBe(w.tier === 1 ? 0.12 : 0.32);
      expect(w.ward).toBe(w.tier === 1 ? 0.12 : 0.25);
    }
    const sky = wingItemId('skywings');
    expect(tooltipName(makeStack(sky, 1))).toBe('Skywings');
    const lines = tooltipLines(makeStack(sky, 1)).map((l) => l.text);
    expect(lines[1]).toBe('Wings');
    expect(lines).toContain(wingBonusText(WINGS[1]));
    expect(wingBonusText(WINGS[1])).toBe('+12% damage dealt, -12% damage taken, +6% speed');
  });

  it('use pictures that exist for the frame and the storm feather too', () => {
    for (const id of [I.WING_FRAME, I.STORM_FEATHER]) {
      const item = getItem(id);
      expect(item.kind).toBe('Material');
      expect(TILE_NAMES[item.tile]).toBe(item.name);
    }
  });
});

describe('crafting them', () => {
  it('makes the frame from iron and bone', () => {
    expect(findRecipe(grid([I.IRON_INGOT, null, I.IRON_INGOT, I.BONE, I.IRON_INGOT, I.BONE, I.IRON_INGOT, null, I.IRON_INGOT]), 3, 3)?.result.id).toBe(I.WING_FRAME);
  });

  it('makes each first pair from the frame, a jewel and the parts of its kind', () => {
    const cinder = findRecipe(grid([I.IMP_HORN, I.IMP_HORN, I.IMP_HORN, I.LEATHER, I.WING_FRAME, I.LEATHER, null, I.JEWEL_DAWN, null]), 3, 3);
    expect(cinder?.result.id).toBe(wingItemId('cinderwings'));
    const sky = findRecipe(grid([I.SERAPH_FEATHER, I.SERAPH_FEATHER, I.SERAPH_FEATHER, I.GOLD_INGOT, I.WING_FRAME, I.GOLD_INGOT, null, I.JEWEL_DAWN, null]), 3, 3);
    expect(sky?.result.id).toBe(wingItemId('skywings'));
    const glade = findRecipe(grid([I.FEATHER, I.FEATHER, I.FEATHER, I.EMERALD, I.WING_FRAME, I.EMERALD, null, I.JEWEL_DAWN, null]), 3, 3);
    expect(glade?.result.id).toBe(wingItemId('gladewings'));
    // Not out of a weaker jewel.
    expect(findRecipe(grid([I.FEATHER, I.FEATHER, I.FEATHER, I.EMERALD, I.WING_FRAME, I.EMERALD, null, I.JEWEL_RIFT, null]), 3, 3)).toBeNull();
  });

  it('grows each first pair into its own second pair, with a storm feather, diamonds and a stronger jewel', () => {
    for (const [from, to] of [['cinderwings', 'ruinwings'], ['skywings', 'radiantwings'], ['gladewings', 'stormwings']] as const) {
      const r = findRecipe(grid([null, I.STORM_FEATHER, null, I.DIAMOND, wingItemId(from), I.DIAMOND, null, I.JEWEL_RIFT, null]), 3, 3);
      expect(r?.result.id).toBe(wingItemId(to));
    }
  });

  it('has one recipe for each of the wings, the frame and the feather of the storm', () => {
    for (const id of [I.WING_FRAME, ...WINGS.map((w) => wingItemId(w.id))]) expect(RECIPES.filter((r) => r.result.id === id)).toHaveLength(1);
    expect(RECIPES.filter((r) => r.result.id === I.STORM_FEATHER).length).toBeGreaterThanOrEqual(1);
  });
});

describe('buying them', () => {
  it('has the ranger quartermaster sell every pair, the second pairs for more', () => {
    const stock = shopOf('fenna')!.stock;
    for (const w of WINGS) {
      const ware = stock.find((x) => x.id === wingItemId(w.id));
      expect(ware?.count).toBe(1);
      expect(ware?.price).toBe(w.tier === 1 ? 3000 : 9000);
    }
    // No other merchant keeps them.
    for (const npc of ['tobin', 'hilda', 'garrick', 'lysa']) expect(shopOf(npc)!.stock.some((x) => wingOfItem(x.id))).toBe(false);
  });
});

describe('the wing slot', () => {
  it('takes wings from the hotbar with a right-click', () => {
    const s = make();
    const id = wingItemId('cinderwings');
    s.inventory.set(0, makeStack(id, 1));
    s.apply({ t: 'select', slot: 0 });
    s.drainEvents();
    s.tick(idle({ right: true }));
    s.tick(idle());
    expect(s.wingSlot.get(0)?.id).toBe(id);
    expect(s.inventory.get(0)).toBeNull();
    expect(p(s).wingNumber).toBe(1);
    expect(toasts(s).join(' ')).toContain('Cinderwings on your back');
  });

  it('swaps with the pair that is there when a right-click in the bags puts another on', () => {
    const s = make();
    s.wingSlot.set(0, makeStack(wingItemId('cinderwings'), 1));
    s.inventory.set(15, makeStack(wingItemId('skywings'), 1));
    s.apply({ t: 'inventory' });
    s.apply({ t: 'click', slot: slotAt(s, 15), button: 1 });
    expect(p(s).wingNumber).toBe(2);
    expect(s.inventory.get(15)?.id).toBe(wingItemId('cinderwings'));
    expect(s.menu!.cursor).toBeNull();
  });

  it('is a slot of the inventory window right after the companion slot, that takes wings and nothing else, and shift-click fills it', () => {
    const s = make();
    s.inventory.set(0, makeStack(I.BREAD, 1));
    s.inventory.set(1, makeStack(wingItemId('gladewings'), 1));
    s.apply({ t: 'inventory' });
    const menu = s.menu as CraftingMenu;
    expect(menu.wingSlot).toBe(menu.companionSlot + 1);
    s.apply({ t: 'click', slot: slotAt(s, 0), button: 0 });
    s.apply({ t: 'click', slot: menu.wingSlot, button: 0 });
    expect(s.wingSlot.get(0)).toBeNull();
    s.apply({ t: 'click', slot: slotAt(s, 0), button: 0 }); // (put the bread back)
    s.apply({ t: 'shift', slot: slotAt(s, 1) });
    expect(p(s).wingNumber).toBe(3);
  });

  it('gives its bonus: blows land harder, the ones that land on you are softer', () => {
    const s = make();
    expect(p(s).wingMight).toBe(1);
    const bare = p(s).afterArmor(10);
    s.wingSlot.set(0, makeStack(wingItemId('skywings'), 1));
    expect(p(s).wingMight).toBeCloseTo(1.12);
    expect(p(s).afterArmor(10)).toBeCloseTo(bare * 0.88);
    s.wingSlot.set(0, makeStack(wingItemId('ruinwings'), 1));
    expect(p(s).wingMight).toBeCloseTo(1.32);
    expect(p(s).afterArmor(10)).toBeCloseTo(bare * 0.75);
  });

  it('is saved with the hero, and a hostile save cannot put a stack or a plain item in it', () => {
    const s = make();
    s.wingSlot.set(0, makeStack(wingItemId('radiantwings'), 1));
    const saved = JSON.parse(JSON.stringify(s.savePlayer()));
    expect(saved.wingSlot).toBeTruthy();
    const back = make();
    back.loadPlayer(parsePlayerSave(saved)!);
    expect(p(back).wingNumber).toBe(5);

    const stacked = { ...saved, wingSlot: [[wingItemId('cinderwings'), 9, 0]] };
    const a = make();
    a.loadPlayer(parsePlayerSave(stacked)!);
    expect(a.wingSlot.get(0)?.count).toBe(1);
    const plain = { ...saved, wingSlot: [[I.BREAD, 1, 0]] };
    const b = make();
    b.loadPlayer(parsePlayerSave(plain)!);
    expect(b.wingSlot.get(0)).toBeNull();
    expect(p(b).wingNumber).toBe(0);
  });
});

describe('flying on them', () => {
  it('needs the wings: without them a double tap of jump does nothing in survival', () => {
    const s = make();
    s.apply({ t: 'fly' });
    s.tick(idle());
    expect(p(s).flying).toBe(false);
    expect(p(s).wingFlying).toBe(false);
  });

  it('takes off with a double tap, climbs while jump is held, and ends on the ground', () => {
    const s = make();
    s.wingSlot.set(0, makeStack(wingItemId('skywings'), 1));
    s.apply({ t: 'fly' });
    expect(p(s).wingFlying).toBe(true);
    const y0 = y(s);
    for (let i = 0; i < 20; i++) s.tick(idle({ jump: true }));
    expect(p(s).wingFlying).toBe(true);
    expect(y(s)).toBeGreaterThan(y0 + 3);
    // Sneak to come down; the flight ends on the ground.
    for (let i = 0; i < 200 && p(s).wingFlying; i++) s.tick(idle({ sneak: true }));
    expect(p(s).wingFlying).toBe(false);
    expect(y(s)).toBeCloseTo(101, 0);
  });

  it('folds with another double tap, and a hungry wearer cannot take off', () => {
    const s = make();
    s.wingSlot.set(0, makeStack(wingItemId('skywings'), 1));
    s.apply({ t: 'fly' });
    expect(p(s).flying).toBe(true);
    s.apply({ t: 'fly' });
    expect(p(s).flying).toBe(false);
    (s as unknown as { vitals: { hunger: number } }).vitals.hunger = 2;
    s.drainEvents();
    s.apply({ t: 'fly' });
    expect(p(s).flying).toBe(false);
    expect(toasts(s).join(' ')).toContain('too hungry');
  });

  it('is quicker than walking, and the second wings are quicker than the first', () => {
    const far = (wing: string | null): number => {
      const s = make();
      if (wing) s.wingSlot.set(0, makeStack(wingItemId(wing), 1));
      if (wing) s.apply({ t: 'fly' });
      s.teleport(0.5, 101, 0.5, 0, 0);
      const x0 = (s as unknown as { body: { z: number } }).body.z;
      for (let i = 0; i < 40; i++) s.tick(idle({ forward: 1, jump: !!wing }));
      return Math.abs((s as unknown as { body: { z: number } }).body.z - x0);
    };
    const walk = far(null);
    const first = far('skywings');
    const second = far('radiantwings');
    expect(first).toBeGreaterThan(walk * 1.2);
    expect(second).toBeGreaterThan(first * 1.1);
  });
});

describe('flying through buildings', () => {
  const FLOOR = 100;
  /** A wall across z = 20 with a doorway two blocks high at x = 8, and the sky over it. */
  const wallWorld = (opening: boolean) => ({
    getBlock(x: number, y: number, z: number): number {
      if (y <= FLOOR) return B.STONE;
      if (z === 20 && y <= 110 && !(opening && x === 8 && y <= 102)) return B.STONE;
      return B.AIR;
    },
  });
  const fly = (over: Partial<MoveInput> = {}): MoveInput => ({ forward: 1, strafe: 0, jump: false, sprint: false, sneak: false, fly: true, flyDown: false, yaw: Math.PI, flyBoost: 1.7, flyRise: 6, ...over });
  const run = (world: { getBlock(x: number, y: number, z: number): number }, y: number, input: MoveInput, steps = 80) => {
    const b = createBody(8.5, y, 14);
    for (let i = 0; i < steps; i++) stepPlayer(world, b, input, 1 / 20);
    return b;
  };

  it('is carried through a doorway it would miss by a little, high or low', () => {
    for (const y of [101.35, 101.5, 101.05]) {
      const b = run(wallWorld(true), y, fly({ flyAssist: true }));
      expect(b.z).toBeGreaterThan(22);
    }
    // Without the help the same flight is stopped at the wall.
    const stuck = run(wallWorld(true), 101.4, fly());
    expect(stuck.z).toBeLessThan(20);
    // And a wall with no door stops it either way.
    expect(run(wallWorld(false), 101.4, fly({ flyAssist: true })).z).toBeLessThan(20);
  });

  it('goes over a ledge of one block that is in the way, but not over a wall', () => {
    const ledge = {
      getBlock: (x: number, y: number, z: number): number => (y <= 100 || (z === 20 && y === 101) ? B.STONE : B.AIR),
    };
    expect(run(ledge, 101, fly({ flyAssist: true })).z).toBeGreaterThan(22);
    const wall = { getBlock: (x: number, y: number, z: number): number => (y <= 100 || (z === 20 && y <= 104) ? B.STONE : B.AIR) };
    expect(run(wall, 101, fly({ flyAssist: true })).z).toBeLessThan(20);
  });

  it('slows to little more than a walk under a low roof, and the roof is measured over the head', () => {
    const roofed = (roof: number) => ({ getBlock: (x: number, y: number, z: number): number => (y <= 100 ? B.STONE : y === roof ? B.STONE : B.AIR) });
    const open = run(roofed(999), 101, fly({ flyAssist: true }), 40);
    const under = run(roofed(104), 101, fly({ flyAssist: true }), 40);
    expect(under.z - 14).toBeLessThan((open.z - 14) * 0.85);
    expect(under.z - 14).toBeGreaterThan(4.3 * 0.8); // (still no slower than a walk)
    expect(roofGap(roofed(104), createBody(0.5, 101, 0.5))).toBeCloseTo(1.2);
    expect(roofGap(roofed(999), createBody(0.5, 101, 0.5))).toBe(4);
  });

  it('lifts gently off the ground under a roof, instead of knocking its head on it', () => {
    const s = make();
    for (let y = 101; y < 140; y++) s.world.setBlock(8, y, 8, B.AIR);
    s.world.setBlock(8, 102, 8, B.STONE);
    s.tick(idle()); // (on the ground)
    s.wingSlot.set(0, makeStack(wingItemId('skywings'), 1));
    s.apply({ t: 'fly' });
    expect((s as unknown as { body: { vy: number } }).body.vy).toBe(2);
  });

  it('keeps flying when it hovers low over the ground, and lands only when it sinks onto it', () => {
    const s = make();
    s.tick(idle());
    s.wingSlot.set(0, makeStack(wingItemId('skywings'), 1));
    p(s).flying = true; // (on the wings, a hair over the ground)
    for (let i = 0; i < 40; i++) s.tick(idle({ forward: 1 }));
    expect(p(s).wingFlying).toBe(true);
    for (let i = 0; i < 40; i++) s.tick(idle({ sneak: true }));
    expect(p(s).wingFlying).toBe(false);
  });
});
