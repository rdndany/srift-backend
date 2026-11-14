import { describe, expect, it } from 'vitest';
import {
  ANVIL_MAX_COST,
  AnvilMenu,
  B,
  BLOCKS,
  DYE_NAMES,
  Container,
  ENCH,
  GameSession,
  GrindstoneMenu,
  HeadlessWorld,
  I,
  LAPIS,
  PLAYER_SLOTS,
  RECIPES,
  WorldGenerator,
  anvilResult,
  canMerge,
  cleanName,
  cloneStack,
  dyeId,
  findRecipe,
  slabId,
  getItem,
  grindResult,
  isAnvil,
  isInteractive,
  makeStack,
  mulberry32,
  nextPenalty,
  parsePenalty,
  parsePlayerSave,
  parseSessionMessage,
  tooltipLines,
  tooltipName,
  totalForLevel,
  toolId,
  type Enchant,
  type InputFrame,
  type ItemStack,
} from './index';
import { settleOrbs } from './xpOrbs.testutil';

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

function make(seed = 7) {
  const generator = new WorldGenerator(SEED);
  const world = new HeadlessWorld(generator);
  for (let x = CX - 12; x <= CX + 12; x++)
    for (let z = CZ - 12; z <= CZ + 12; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 20; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.STONE);
    }
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(seed) });
  s.finishLoading();
  s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
  return { s, world };
}

const run = (s: GameSession, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 20); i++) s.tick(idle());
};

const sword = (...ench: Enchant[]): ItemStack => makeStack(toolId('sword', 'iron'), 1, 0, ench.length ? ench : undefined);
const book = (...e: Enchant[]) => makeStack(I.ENCHANTED_BOOK, 1, 0, e);

describe('names and penalties on a stack', () => {
  it('cleans a name: printable, trimmed, at most 35 characters', () => {
    expect(cleanName('  Sting  ')).toBe('Sting');
    expect(cleanName('a\u0000b\u007fc')).toBe('abc');
    expect(cleanName('x'.repeat(80))).toHaveLength(35);
    expect(cleanName('   ')).toBeUndefined();
    expect(cleanName('<b>hi</b>')).toBe('bhi/b');
    expect(cleanName(5)).toBeUndefined();
    expect(cleanName('§4red')).toBe('4red');
  });

  it('only believes whole positive penalties, up to a cap', () => {
    expect(parsePenalty(3)).toBe(3);
    expect(parsePenalty(5000)).toBe(1023);
    for (const bad of [0, -1, 1.5, '3', null, NaN]) expect(parsePenalty(bad)).toBeUndefined();
  });

  it('keeps name and penalty through a save, a clone and a merge test', () => {
    const inv = new Container(4);
    const named = { ...sword([ENCH.SHARPNESS, 2] as Enchant), name: 'Sting', rc: 7 };
    inv.set(0, named);
    const copy = new Container(4);
    copy.loadJSON(JSON.parse(JSON.stringify(inv.toJSON())));
    expect(copy.get(0)?.name).toBe('Sting');
    expect(copy.get(0)?.rc).toBe(7);
    expect(copy.get(0)?.ench).toEqual([[ENCH.SHARPNESS, 2]]);
    const c = cloneStack(named);
    expect(c.name).toBe('Sting');
    expect(c.rc).toBe(7);
    // Plain stacks stay as small as before.
    const plain = new Container(2);
    plain.set(0, makeStack(B.DIRT, 5));
    expect(plain.toJSON()[0]).toEqual([B.DIRT, 5, 0]);
    // Stacks with different names or penalties do not merge.
    const a = makeStack(B.DIRT, 1);
    expect(canMerge(a, { ...a, name: 'X' })).toBe(false);
    expect(canMerge(a, { ...a, rc: 1 })).toBe(false);
    expect(canMerge({ ...a, name: 'X' }, { ...a, name: 'X' })).toBe(true);
  });

  it('shows a custom name in italics and the penalty in the tooltip', () => {
    const s = { ...sword(), name: 'Sting', rc: 3 };
    expect(tooltipName(s)).toBe('Sting');
    const lines = tooltipLines(s);
    expect(lines[0].text).toBe('Sting');
    expect(lines[0].italic).toBe(true);
    expect(lines.some((l) => l.text === 'Anvil penalty: +3 levels')).toBe(true);
    expect(tooltipLines(sword())[0].italic).toBeFalsy();
  });

  it('carries the name and penalty over the wire, and refuses junk names', () => {
    expect(parseSessionMessage({ t: 'anvilName', name: 'Sting' })).toEqual({ t: 'anvilName', name: 'Sting' });
    expect(parseSessionMessage({ t: 'anvilName', name: null })).toEqual({ t: 'anvilName', name: null });
    expect(parseSessionMessage({ t: 'anvilName', name: 5 })).toBeNull();
    const long = parseSessionMessage({ t: 'anvilName', name: 'x'.repeat(500) });
    expect(long && 'name' in long ? (long.name as string).length : 0).toBeLessThanOrEqual(64);
  });
});

describe('renaming at the anvil', () => {
  it('renames an item for one level, with no second item', () => {
    const r = anvilResult(sword(), null, 'Sting')!;
    expect(r.result.name).toBe('Sting');
    expect(r.cost).toBe(1);
    expect(r.useRight).toBe(0);
    // Nothing to do when the name is the same or empty and there is no name to remove.
    expect(anvilResult(sword(), null, null)).toBeNull();
    expect(anvilResult(sword(), null, '   ')).toBeNull();
    expect(anvilResult({ ...sword(), name: 'Sting' }, null, 'Sting')).toBeNull();
  });

  it('clearing a name costs a level too, and a bare rename adds no penalty', () => {
    const named = { ...sword(), name: 'Sting', rc: 3 };
    const cleared = anvilResult(named, null, '')!;
    expect(cleared.result.name).toBeUndefined();
    expect(cleared.cost).toBe(1 + 3);
    expect(cleared.result.rc).toBe(3);
  });

  it('adds a rename to a repair, and keeps the name when nothing new is typed', () => {
    const worn = { ...makeStack(toolId('sword', 'iron'), 1, 100), name: 'Sting' };
    const mended = anvilResult(worn, makeStack(I.IRON_INGOT, 3), null)!;
    expect(mended.result.name).toBe('Sting');
    const both = anvilResult(worn, makeStack(I.IRON_INGOT, 3), 'Stinger')!;
    expect(both.result.name).toBe('Stinger');
    expect(both.cost).toBe(mended.cost + 1);
  });

  it('renames through the menu, and a new item starts with its own name', () => {
    const inv = new Container(PLAYER_SLOTS);
    const menu = new AnvilMenu(inv, { level: () => 10, creative: () => false, spend: () => {}, done: () => {} });
    menu.cursor = sword();
    menu.click(menu.leftSlot, 0);
    expect(menu.cost).toBe(0);
    menu.setName('Sting');
    expect(menu.cost).toBe(1);
    expect(menu.stackAt(menu.resultSlot)?.name).toBe('Sting');
    // Take the item out and put a different one in: the typed name does not follow.
    menu.click(menu.leftSlot, 0);
    menu.click(menu.leftSlot, 0);
    menu.cursor = makeStack(toolId('pickaxe', 'iron'), 1);
    menu.click(menu.leftSlot, 0);
    expect(menu.cost).toBe(0);
    expect(menu.name).toBeNull();
  });

  it('renames over the command channel and takes one level', () => {
    const { s, world } = make();
    world.setBlock(CX + 3, FLOOR + 1, CZ, B.ANVIL);
    s.useBlock(CX + 3, FLOOR + 1, CZ);
    const menu = s.menu as AnvilMenu;
    s.xp.add(totalForLevel(5));
    s.inventory.set(0, sword());
    s.apply({ t: 'shift', slot: 0 });
    s.apply({ t: 'anvilName', name: 'Sting' });
    expect(menu.cost).toBe(1);
    s.apply({ t: 'click', slot: menu.resultSlot, button: 0 });
    expect(menu.cursor?.name).toBe('Sting');
    expect(s.xp.level).toBe(4);
    // The command does nothing at other screens.
    s.apply({ t: 'closeMenu' });
    s.apply({ t: 'anvilName', name: 'x' });
    expect(s.screen).toBe('none');
  });
});

describe('the repair-cost penalty', () => {
  it('doubles with each use: 1, 3, 7, 15, 31', () => {
    expect(nextPenalty(0, 0)).toBe(1);
    expect(nextPenalty(1, 0)).toBe(3);
    expect(nextPenalty(3, 1)).toBe(7);
    expect(nextPenalty(7, 0)).toBe(15);
    expect(nextPenalty(15, 15)).toBe(31);
    expect(nextPenalty(900, 900)).toBe(1023);
  });

  it('makes each trip dearer until it is too expensive after about six', () => {
    let item: ItemStack = makeStack(toolId('pickaxe', 'diamond'), 1, 1000);
    const costs: number[] = [];
    let uses = 0;
    for (; uses < 12; uses++) {
      const r = anvilResult(item, makeStack(toolId('pickaxe', 'diamond'), 1, 1000));
      if (!r) break;
      costs.push(r.cost);
      if (r.cost > ANVIL_MAX_COST) break;
      item = { ...r.result, damage: 1000 }; // worn down again between visits
    }
    expect(costs[0]).toBeLessThan(costs[1]);
    expect(costs[1]).toBeLessThan(costs[2]);
    expect(costs[costs.length - 1]).toBeGreaterThan(ANVIL_MAX_COST);
    expect(uses).toBeGreaterThanOrEqual(4);
    expect(uses).toBeLessThanOrEqual(7);
    expect(item.rc).toBeGreaterThanOrEqual(15);
  });

  it('is shown as "too expensive" by the menu and never in creative', () => {
    const worn: ItemStack = { ...makeStack(toolId('pickaxe', 'diamond'), 1, 1000), rc: 63 };
    const other = makeStack(toolId('pickaxe', 'diamond'), 1, 1000);
    const mk = (creative: boolean) => {
      const menu = new AnvilMenu(new Container(PLAYER_SLOTS), { level: () => 99, creative: () => creative, spend: () => {}, done: () => {} });
      menu.cursor = cloneStack(worn);
      menu.click(menu.leftSlot, 0);
      menu.cursor = cloneStack(other);
      menu.click(menu.rightSlot, 0);
      return menu;
    };
    const m = mk(false);
    expect(m.tooExpensive).toBe(true);
    expect(m.canTake()).toBe(false);
    expect(m.stackAt(m.resultSlot)).toBeNull();
    const c = mk(true);
    expect(c.tooExpensive).toBe(false);
    expect(c.canTake()).toBe(true);
  });

  it('is passed on in the result, and a bare rename leaves it alone', () => {
    const r = anvilResult(sword(), book([ENCH.SHARPNESS, 3]))!;
    expect(r.result.rc).toBe(1);
    const again = anvilResult(r.result, book([ENCH.UNBREAKING, 2]))!;
    expect(again.result.rc).toBe(3);
    expect(again.cost).toBeGreaterThan(anvilResult(sword(), book([ENCH.UNBREAKING, 2]))!.cost);
    expect(anvilResult(again.result, null, 'Sting')!.result.rc).toBe(3);
  });
});

describe('anvil wear', () => {
  it('chips, then damages, then breaks, after a couple of dozen uses', () => {
    const { s, world } = make(3);
    const at = [CX + 3, FLOOR + 1, CZ] as const;
    world.setBlock(...at, B.ANVIL);
    const seen: number[] = [B.ANVIL];
    let uses = 0;
    for (; uses < 400 && world.getBlock(...at) !== B.AIR; uses++) {
      s.useBlock(...at);
      expect(s.screen).toBe('anvil');
      const menu = s.menu as AnvilMenu;
      s.xp.add(totalForLevel(3));
      s.inventory.set(0, sword());
      s.apply({ t: 'shift', slot: 0 });
      s.apply({ t: 'anvilName', name: `n${uses}` });
      s.apply({ t: 'click', slot: menu.resultSlot, button: 0 });
      s.apply({ t: 'closeMenu' });
      const now = world.getBlock(...at);
      if (now !== seen[seen.length - 1]) seen.push(now);
      for (let i = 0; i < PLAYER_SLOTS; i++) s.inventory.set(i, null);
    }
    expect(seen).toEqual([B.ANVIL, B.ANVIL_CHIPPED, B.ANVIL_DAMAGED, B.AIR]);
    expect(uses).toBeGreaterThan(6);
    expect(uses).toBeLessThan(120);
  });

  it('closes the screen and keeps the result when the anvil breaks under it', () => {
    const { s, world } = make(9);
    const at = [CX + 3, FLOOR + 1, CZ] as const;
    world.setBlock(...at, B.ANVIL_DAMAGED);
    let broke = false;
    for (let i = 0; i < 200 && !broke; i++) {
      s.useBlock(...at);
      const menu = s.menu as AnvilMenu;
      s.xp.add(totalForLevel(3));
      s.inventory.set(0, sword());
      s.apply({ t: 'shift', slot: 0 });
      s.apply({ t: 'anvilName', name: `n${i}` });
      s.apply({ t: 'click', slot: menu.resultSlot, button: 0 });
      if (world.getBlock(...at) === B.AIR) {
        broke = true;
        expect(s.screen).toBe('none');
        const held = [...Array(PLAYER_SLOTS).keys()].map((k) => s.inventory.get(k)).find((x) => x?.name === `n${i}`);
        expect(held).toBeTruthy();
      } else {
        s.apply({ t: 'closeMenu' });
        for (let k = 0; k < PLAYER_SLOTS; k++) s.inventory.set(k, null);
      }
    }
    expect(broke).toBe(true);
  });

  it('does not wear in creative', () => {
    const { s, world } = make();
    s.setMode('creative');
    const at = [CX + 3, FLOOR + 1, CZ] as const;
    world.setBlock(...at, B.ANVIL);
    for (let i = 0; i < 60; i++) {
      s.useBlock(...at);
      const menu = s.menu as AnvilMenu;
      menu.cursor = sword();
      menu.click(menu.leftSlot, 0);
      s.apply({ t: 'anvilName', name: `n${i}` });
      s.apply({ t: 'click', slot: menu.resultSlot, button: 0 });
      s.apply({ t: 'closeMenu' });
    }
    expect(world.getBlock(...at)).toBe(B.ANVIL);
  });

  it('has three looks, all of them anvils you can use', () => {
    for (const id of [B.ANVIL, B.ANVIL_CHIPPED, B.ANVIL_DAMAGED]) {
      expect(isAnvil(id)).toBe(true);
      expect(isInteractive(id)).toBe(true);
    }
    expect(isAnvil(B.STONE)).toBe(false);
    expect(BLOCKS[B.ANVIL_CHIPPED].tiles.side).not.toBe(BLOCKS[B.ANVIL].tiles.side);
    expect(BLOCKS[B.ANVIL_DAMAGED].tiles.side).not.toBe(BLOCKS[B.ANVIL_CHIPPED].tiles.side);
  });
});

describe('a falling anvil', () => {
  it('falls like sand and lands on the floor', () => {
    const { s, world } = make();
    world.setBlock(CX + 3, FLOOR + 8, CZ, B.ANVIL);
    s.realm.checkFall(CX + 3, FLOOR + 8, CZ);
    run(s, 4);
    expect(world.getBlock(CX + 3, FLOOR + 8, CZ)).toBe(B.AIR);
    expect(isAnvil(world.getBlock(CX + 3, FLOOR + 1, CZ))).toBe(true);
  });

  it('squashes a mob under it, two points a block it fell', () => {
    const { s, world } = make();
    const m = s.mobs.spawn('cow', CX + 3.5, FLOOR + 1, CZ + 0.5);
    const h = m.health;
    world.setBlock(CX + 3, FLOOR + 3, CZ, B.ANVIL);
    s.realm.checkFall(CX + 3, FLOOR + 3, CZ);
    run(s, 2);
    expect(m.health).toBeLessThan(h);
  });

  it('hurts a player in survival, by how far it fell, and drops as an item on top of them', () => {
    const { s, world } = make();
    s.teleport(CX + 3.5, FLOOR + 1, CZ + 0.5, 0, 0);
    expect(s.vitals.health).toBe(20);
    world.setBlock(CX + 3, FLOOR + 6, CZ, B.ANVIL);
    s.realm.checkFall(CX + 3, FLOOR + 6, CZ);
    run(s, 2);
    expect(s.vitals.health).toBeLessThan(20);
    expect(s.vitals.health).toBeGreaterThan(0);
    expect(isAnvil(world.getBlock(CX + 3, FLOOR + 1, CZ))).toBe(false);
  });

  it('does not hurt a player in creative', () => {
    const { s, world } = make();
    s.setMode('creative');
    s.teleport(CX + 3.5, FLOOR + 1, CZ + 0.5, 0, 0);
    world.setBlock(CX + 3, FLOOR + 6, CZ, B.ANVIL);
    s.realm.checkFall(CX + 3, FLOOR + 6, CZ);
    run(s, 2);
    expect(s.vitals.health).toBe(20);
  });

  it('is a long drop that kills: a hundred blocks is forty points', () => {
    const { s, world } = make();
    world.setBlock(CX + 3, FLOOR + 1, CZ, B.AIR);
    s.teleport(CX + 3.5, FLOOR + 1, CZ + 0.5, 0, 0);
    world.setBlock(CX + 3, FLOOR + 18, CZ, B.ANVIL);
    s.realm.checkFall(CX + 3, FLOOR + 18, CZ);
    run(s, 4);
    expect(s.vitals.dead).toBe(true);
  });
});

describe('the grindstone', () => {
  const enchanted = (...e: Enchant[]) => sword(...e);

  it('takes every enchantment off, and pays experience for them', () => {
    const r = grindResult(enchanted([ENCH.SHARPNESS, 3], [ENCH.UNBREAKING, 2]), null)!;
    expect(r.result.ench).toBeUndefined();
    expect(r.result.id).toBe(toolId('sword', 'iron'));
    expect(r.xpMax).toBeGreaterThan(0);
    expect(r.xpMin).toBe(Math.ceil(r.xpMax / 2));
    // A stronger enchantment pays more.
    const high = grindResult(enchanted([ENCH.SHARPNESS, 5]), null)!;
    const low = grindResult(enchanted([ENCH.SHARPNESS, 1]), null)!;
    expect(high.xpMax).toBeGreaterThan(low.xpMax);
  });

  it('forgets the penalty, keeps the name and the wear', () => {
    const item = { ...makeStack(toolId('sword', 'iron'), 1, 40, [[ENCH.SHARPNESS, 2]] as Enchant[]), name: 'Sting', rc: 15 };
    const r = grindResult(item, null)!;
    expect(r.result.rc).toBeUndefined();
    expect(r.result.name).toBe('Sting');
    expect(r.result.damage).toBe(40);
  });

  it('turns a lone enchanted book into a plain book', () => {
    const r = grindResult(book([ENCH.MENDING, 1]), null)!;
    expect(r.result.id).toBe(I.BOOK);
    expect(r.result.ench).toBeUndefined();
  });

  it('does nothing with a plain item, or two different ones', () => {
    expect(grindResult(sword(), null)).toBeNull();
    expect(grindResult(null, null)).toBeNull();
    expect(grindResult(sword(), makeStack(toolId('pickaxe', 'iron'), 1))).toBeNull();
    expect(grindResult(makeStack(B.DIRT, 1), null)).toBeNull();
  });

  it('joins two worn items of a kind, with a little extra life, and drops their enchantments', () => {
    const a = makeStack(toolId('pickaxe', 'iron'), 1, 150, [[ENCH.EFFICIENCY, 2]] as Enchant[]);
    const b = makeStack(toolId('pickaxe', 'iron'), 1, 150);
    const r = grindResult(a, b)!;
    expect(r.result.damage).toBeLessThan(150);
    expect(r.result.ench).toBeUndefined();
    expect(r.xpMax).toBeGreaterThan(0);
  });

  const rig = (rand = () => 0.99) => {
    const got: number[] = [];
    const inv = new Container(PLAYER_SLOTS);
    const menu = new GrindstoneMenu(inv, { creative: () => false, xp: (n) => got.push(n), rand, done: () => {} });
    return { menu, got };
  };

  it('pays a roll between half and all of it when the result is taken', () => {
    const items = [enchanted([ENCH.SHARPNESS, 4], [ENCH.LOOTING, 3])];
    const lo = rig(() => 0);
    lo.menu.cursor = cloneStack(items[0]);
    lo.menu.click(lo.menu.topSlot, 0);
    const max = lo.menu.xp;
    expect(max).toBeGreaterThan(1);
    lo.menu.click(lo.menu.resultSlot, 0);
    expect(lo.got).toEqual([Math.ceil(max / 2)]);
    expect(lo.menu.cursor?.ench).toBeUndefined();
    expect(lo.menu.input.get(0)).toBeNull();

    const hi = rig(() => 0.999);
    hi.menu.cursor = cloneStack(items[0]);
    hi.menu.click(hi.menu.topSlot, 0);
    hi.menu.click(hi.menu.resultSlot, 0);
    expect(hi.got).toEqual([max]);
  });

  it('takes only things it can work on, and gives everything back when closed', () => {
    const { menu } = rig();
    menu.cursor = makeStack(B.DIRT, 4);
    menu.click(menu.topSlot, 0);
    expect(menu.input.get(0)).toBeNull();
    menu.cursor = enchanted([ENCH.SHARPNESS, 1]);
    menu.click(menu.topSlot, 0);
    expect(menu.input.get(0)).not.toBeNull();
    expect(menu.close()).toHaveLength(1);
  });

  it('opens from the block and pays out experience straight to you', () => {
    const { s, world } = make();
    world.setBlock(CX + 3, FLOOR + 1, CZ, B.GRINDSTONE);
    expect(s.useBlock(CX + 3, FLOOR + 1, CZ)).toBe(true);
    expect(s.screen).toBe('grindstone');
    const menu = s.menu as GrindstoneMenu;
    s.inventory.set(0, enchanted([ENCH.SHARPNESS, 5]));
    s.apply({ t: 'shift', slot: 0 });
    expect(menu.stackAt(menu.resultSlot)).not.toBeNull();
    s.apply({ t: 'click', slot: menu.resultSlot, button: 0 });
    settleOrbs(s);
    expect(s.xp.total).toBeGreaterThan(0);
    s.apply({ t: 'closeMenu' });
    const out = [...Array(PLAYER_SLOTS).keys()].map((k) => s.inventory.get(k)).find((x) => x?.id === toolId('sword', 'iron'));
    expect(out?.ench).toBeUndefined();
  });

  it('is made of a stone slab on two sticks between two planks', () => {
    const S = I.STICK;
    const M = slabId(2, false);
    const P = B.PLANKS;
    const grid = (ids: number[]) => ids.map((id) => (id ? makeStack(id) : null));
    expect(findRecipe(grid([S, M, S, P, 0, P, 0, 0, 0]), 3, 3)?.result).toEqual({ id: B.GRINDSTONE, count: 1 });
    // A wooden slab is not a stone one.
    expect(findRecipe(grid([S, slabId(0, false), S, P, 0, P, 0, 0, 0]), 3, 3)).toBeNull();
  });

  it('is a block with a shape, a place in the world and an item', () => {
    expect(BLOCKS[B.GRINDSTONE].shape).toBe('table');
    expect(isInteractive(B.GRINDSTONE)).toBe(true);
    expect(getItem(B.GRINDSTONE).block).toBe(B.GRINDSTONE);
  });
});

describe('lapis lazuli', () => {
  it('is a real item, which the table uses, and grinds into blue dye', () => {
    expect(getItem(I.LAPIS_LAZULI).name).toBe('lapis_lazuli');
    expect(LAPIS).toBe(I.LAPIS_LAZULI);
    const blue = dyeId(DYE_NAMES.indexOf('blue'));
    const rec = RECIPES.find((r) => r.shapeless?.length === 1 && r.shapeless[0] === I.LAPIS_LAZULI);
    expect(rec?.result.id).toBe(blue);
  });
});

describe("bottle o' enchanting", () => {
  it('is thrown, breaks on a wall and drops three to eleven experience', () => {
    const { s, world } = make();
    for (let y = FLOOR + 1; y <= FLOOR + 3; y++) world.setBlock(CX, y, CZ - 4, B.STONE);
    s.inventory.set(0, makeStack(I.EXPERIENCE_BOTTLE, 3));
    s.tick(idle({ right: true }));
    s.tick(idle());
    expect(s.inventory.get(0)?.count).toBe(2);
    run(s, 6);
    expect(s.xp.total).toBeGreaterThanOrEqual(3);
    expect(s.xp.total).toBeLessThanOrEqual(11);
  });

  it('is not used up in creative, and does no damage to a mob it hits', () => {
    const { s } = make();
    s.setMode('creative');
    s.inventory.set(0, makeStack(I.EXPERIENCE_BOTTLE, 1));
    const m = s.mobs.spawn('cow', CX + 0.5, FLOOR + 1, CZ - 3.5);
    const h = m.health;
    s.tick(idle({ right: true }));
    s.tick(idle());
    run(s, 3);
    expect(s.inventory.get(0)?.count).toBe(1);
    expect(m.health).toBe(h);
  });
});

describe('the enchant seed in a save', () => {
  it('survives a save and a load, so offers stay the same across sessions', () => {
    const { s, world } = make();
    world.setBlock(CX + 3, FLOOR + 1, CZ, B.ENCHANTING_TABLE);
    s.useBlock(CX + 3, FLOOR + 1, CZ);
    s.inventory.set(0, sword());
    s.apply({ t: 'shift', slot: 0 });
    const saved = s.savePlayer();
    expect(saved.es).toBeGreaterThan(0);
    const offers = JSON.stringify((s.menu as unknown as { offers: unknown }).offers);
    const parsed = parsePlayerSave(JSON.parse(JSON.stringify(saved)))!;
    expect(parsed.es).toBe(saved.es);

    const other = make(99);
    other.world.setBlock(CX + 3, FLOOR + 1, CZ, B.ENCHANTING_TABLE);
    other.s.loadPlayer(parsed);
    other.s.useBlock(CX + 3, FLOOR + 1, CZ);
    other.s.inventory.set(0, sword());
    other.s.apply({ t: 'shift', slot: 0 });
    expect(JSON.stringify((other.s.menu as unknown as { offers: unknown }).offers)).toBe(offers);
  });
});
