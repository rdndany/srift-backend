import { describe, expect, it } from 'vitest';
import {
  B,
  BLOCKS,
  ChestMenu,
  Container,
  CraftingMenu,
  CreativeMenu,
  EXHAUSTION,
  Furnace,
  FurnaceMenu,
  I,
  MAX_AIR,
  Vitals,
  allItems,
  blockDrop,
  breakTime,
  canHarvest,
  findRecipe,
  getItem,
  makeStack,
  mulberry32,
  toolId,
  type ItemStack,
} from './index';

const ctx = { eyeInWater: false, invulnerable: false };
const tool = (kind: 'pickaxe' | 'axe' | 'shovel' | 'sword', mat: 'wood' | 'stone' | 'iron' | 'gold' | 'diamond') =>
  getItem(toolId(kind, mat)).tool;

describe('items and mining rules', () => {
  it('registers every placeable block and unique tool ids', () => {
    expect(getItem(B.STONE).block).toBe(B.STONE);
    expect(getItem(B.WATER).name).toBe('unknown');
    const ids = allItems().map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getItem(toolId('pickaxe', 'diamond')).maxStack).toBe(1);
    expect(getItem(toolId('sword', 'iron')).tool!.damage).toBeGreaterThan(getItem(toolId('sword', 'wood')).tool!.damage);
  });

  it('matches the original break times', () => {
    expect(breakTime(BLOCKS[B.DIRT], null)).toBeCloseTo(0.75);
    expect(breakTime(BLOCKS[B.STONE], null)).toBeCloseTo(7.5); // bare hand: slow, no drop
    expect(breakTime(BLOCKS[B.STONE], tool('pickaxe', 'wood'))).toBeCloseTo(1.125);
    expect(breakTime(BLOCKS[B.STONE], tool('pickaxe', 'diamond'))).toBeLessThan(0.4);
    expect(breakTime(BLOCKS[B.BEDROCK], tool('pickaxe', 'diamond'))).toBe(Infinity);
    // Wrong tool kind gets no speed bonus.
    expect(breakTime(BLOCKS[B.DIRT], tool('pickaxe', 'diamond'))).toBeCloseTo(0.75);
  });

  it('enforces harvest levels', () => {
    expect(canHarvest(BLOCKS[B.STONE], null)).toBe(false);
    expect(canHarvest(BLOCKS[B.STONE], tool('pickaxe', 'wood'))).toBe(true);
    expect(canHarvest(BLOCKS[B.IRON_ORE], tool('pickaxe', 'wood'))).toBe(false);
    expect(canHarvest(BLOCKS[B.IRON_ORE], tool('pickaxe', 'stone'))).toBe(true);
    expect(canHarvest(BLOCKS[B.DIAMOND_ORE], tool('pickaxe', 'stone'))).toBe(false);
    expect(canHarvest(BLOCKS[B.DIAMOND_ORE], tool('pickaxe', 'iron'))).toBe(true);
    expect(canHarvest(BLOCKS[B.DIRT], null)).toBe(true);
    // A sword does not harvest stone.
    expect(canHarvest(BLOCKS[B.STONE], tool('sword', 'diamond'))).toBe(false);
  });

  it('produces the right drops', () => {
    const pick = tool('pickaxe', 'iron');
    expect(blockDrop(BLOCKS[B.STONE], null)).toBeNull();
    expect(blockDrop(BLOCKS[B.STONE], pick)).toEqual({ id: B.COBBLE, count: 1 });
    expect(blockDrop(BLOCKS[B.GRASS], null)).toEqual({ id: B.DIRT, count: 1 });
    expect(blockDrop(BLOCKS[B.COAL_ORE], tool('pickaxe', 'wood'))).toEqual({ id: I.COAL, count: 1 });
    expect(blockDrop(BLOCKS[B.DIAMOND_ORE], pick)).toEqual({ id: I.DIAMOND, count: 1 });
    expect(blockDrop(BLOCKS[B.IRON_ORE], pick)).toEqual({ id: I.RAW_IRON, count: 1 });
    expect(blockDrop(BLOCKS[B.GLASS], pick)).toBeNull();
    expect(blockDrop(BLOCKS[B.LEAVES], null, () => 0.5)).toBeNull();
    expect(blockDrop(BLOCKS[B.LEAVES], null, () => 0.01)).toEqual({ id: I.APPLE, count: 1 });
    expect(blockDrop(BLOCKS[B.LOG], null)).toEqual({ id: B.LOG, count: 1 });
  });
});

const grid = (cells: (number | null)[]): (ItemStack | null)[] => cells.map((c) => (c ? makeStack(c) : null));

describe('crafting recipes', () => {
  it('crafts planks, sticks and a crafting table', () => {
    expect(findRecipe(grid([B.LOG, null, null, null]), 2, 2)!.result).toEqual({ id: B.PLANKS, count: 4 });
    expect(findRecipe(grid([B.PLANKS, null, B.PLANKS, null]), 2, 2)!.result).toEqual({ id: I.STICK, count: 4 });
    expect(findRecipe(grid([null, B.PLANKS, null, B.PLANKS]), 2, 2)!.result).toEqual({ id: I.STICK, count: 4 });
    expect(findRecipe(grid([B.PLANKS, B.PLANKS, B.PLANKS, B.PLANKS]), 2, 2)!.result.id).toBe(B.CRAFTING_TABLE);
  });

  it('finds a recipe wherever it sits in a 3x3 grid', () => {
    const S = I.STICK;
    const P = B.COBBLE;
    const a = grid([P, P, P, null, S, null, null, S, null]);
    expect(findRecipe(a, 3, 3)!.result.id).toBe(toolId('pickaxe', 'stone'));
    // shifted down one row would not fit in 3 rows, but a shovel can slide around
    const shovel = grid([null, null, null, null, B.PLANKS, null, null, S, null]);
    expect(findRecipe(shovel, 3, 3)).toBeNull(); // only one stick + one plank: no recipe
    const shovel2 = grid([null, B.PLANKS, null, null, S, null, null, S, null]);
    expect(findRecipe(shovel2, 3, 3)!.result.id).toBe(toolId('shovel', 'wood'));
  });

  it('accepts mirrored axes and rejects incomplete patterns', () => {
    const S = I.STICK;
    const I1 = I.IRON_INGOT;
    expect(findRecipe(grid([I1, I1, I1, S, null, S, null, S, null]), 3, 3)).toBeNull();
    const left = grid([I1, I1, null, I1, S, null, null, S, null]);
    const right = grid([null, I1, I1, null, S, I1, null, S, null]);
    expect(findRecipe(left, 3, 3)!.result.id).toBe(toolId('axe', 'iron'));
    expect(findRecipe(right, 3, 3)!.result.id).toBe(toolId('axe', 'iron'));
  });

  it('cannot craft 3x3 recipes in the 2x2 grid', () => {
    expect(findRecipe(grid([B.COBBLE, B.COBBLE, B.COBBLE, I.STICK]), 2, 2)).toBeNull();
    expect(findRecipe(grid([null, null, null, null]), 2, 2)).toBeNull();
  });

  it('crafts a furnace and chest from a ring of blocks', () => {
    const ring = (id: number) => grid([id, id, id, id, null, id, id, id, id]);
    expect(findRecipe(ring(B.COBBLE), 3, 3)!.result.id).toBe(B.FURNACE);
    expect(findRecipe(ring(B.PLANKS), 3, 3)!.result.id).toBe(B.CHEST);
  });
});

describe('containers', () => {
  it('merges, overflows and reports leftovers', () => {
    const c = new Container(3);
    expect(c.add(makeStack(B.DIRT, 50))).toBeNull();
    expect(c.add(makeStack(B.DIRT, 30))).toBeNull();
    expect(c.get(0)!.count).toBe(64);
    expect(c.get(1)!.count).toBe(16);
    const left = c.add(makeStack(B.STONE, 64 * 2 + 5));
    // only the one empty slot is available for stone: 133 - 64 left over
    expect(left!.count).toBe(69);
    expect(c.totalItems()).toBe(80 + 64);
  });

  it('never stacks tools and serialises round-trip', () => {
    const c = new Container(4);
    c.add(makeStack(toolId('pickaxe', 'iron'), 1, 12));
    c.add(makeStack(toolId('pickaxe', 'iron'), 1));
    expect(c.get(0)!.count).toBe(1);
    expect(c.get(1)).not.toBeNull();
    c.add(makeStack(B.COBBLE, 40));
    const d = new Container(4);
    d.loadJSON(JSON.parse(JSON.stringify(c.toJSON())));
    expect(d.toJSON()).toEqual(c.toJSON());
    expect(d.get(0)!.damage).toBe(12);
  });

  it('rejects garbage when loading saved data', () => {
    const d = new Container(2);
    d.loadJSON([[99999, 5, 0], 'x']);
    expect(d.isEmpty()).toBe(true);
  });

  it('removes items across stacks', () => {
    const c = new Container(3);
    c.add(makeStack(B.COBBLE, 100));
    expect(c.remove(B.COBBLE, 70)).toBe(true);
    expect(c.countOf(B.COBBLE)).toBe(30);
    expect(c.remove(B.COBBLE, 31)).toBe(false);
    expect(c.countOf(B.COBBLE)).toBe(30);
  });
});

describe('menu click semantics', () => {
  it('picks up, splits, places and swaps like the original', () => {
    const inv = new Container(36);
    inv.set(0, makeStack(B.DIRT, 10));
    inv.set(1, makeStack(B.STONE, 5));
    const m = new ChestMenu(inv, new Container(27));

    m.click(0, 1); // right-click: take half (rounded up)
    expect(m.cursor).toMatchObject({ id: B.DIRT, count: 5 });
    expect(inv.get(0)!.count).toBe(5);

    m.click(2, 1); // right-click empty slot: place one
    expect(inv.get(2)).toMatchObject({ id: B.DIRT, count: 1 });
    expect(m.cursor!.count).toBe(4);

    m.click(0, 0); // left-click same type: merge
    expect(inv.get(0)!.count).toBe(9);
    expect(m.cursor).toBeNull();

    m.click(0, 0); // pick up
    m.click(1, 0); // swap with stone
    expect(m.cursor).toMatchObject({ id: B.STONE, count: 5 });
    expect(inv.get(1)).toMatchObject({ id: B.DIRT, count: 9 });
  });

  it('respects max stack when merging', () => {
    const inv = new Container(36);
    inv.set(0, makeStack(B.DIRT, 60));
    inv.set(1, makeStack(B.DIRT, 20));
    const m = new ChestMenu(inv, new Container(27));
    m.click(1, 0);
    m.click(0, 0);
    expect(inv.get(0)!.count).toBe(64);
    expect(m.cursor!.count).toBe(16);
  });

  it('conserves items under random clicking (chest menu)', () => {
    const rand = mulberry32(1234);
    const inv = new Container(36);
    const chest = new Container(27);
    inv.add(makeStack(B.COBBLE, 200));
    inv.add(makeStack(B.DIRT, 90));
    inv.add(makeStack(toolId('pickaxe', 'iron'), 1));
    chest.add(makeStack(B.COAL_ORE, 33));
    const m = new ChestMenu(inv, chest);
    const total = m.totalItems();
    const per = (id: number) => inv.countOf(id) + chest.countOf(id) + (m.cursor?.id === id ? m.cursor.count : 0);
    for (let n = 0; n < 4000; n++) {
      const i = Math.floor(rand() * m.slots.length);
      const r = rand();
      if (r < 0.15) m.shiftClick(i);
      else m.click(i, rand() < 0.5 ? 0 : 1);
      expect(m.totalItems()).toBe(total);
    }
    expect(per(B.COBBLE)).toBe(200);
    expect(per(B.DIRT)).toBe(90);
    expect(per(toolId('pickaxe', 'iron'))).toBe(1);
    expect(per(B.COAL_ORE)).toBe(33);
  });

  it('crafts through the grid and result slot, consuming ingredients', () => {
    const inv = new Container(36);
    inv.add(makeStack(B.LOG, 3));
    const m = new CraftingMenu(inv, 2);

    m.click(0, 0); // take logs
    m.click(m.gridStart, 1); // place one log in the grid
    expect(m.result.get(0)).toMatchObject({ id: B.PLANKS, count: 4 });

    m.click(m.resultSlot, 0); // cursor still holds other logs: cannot take the result
    expect(m.cursor).toMatchObject({ id: B.LOG, count: 2 });
    m.click(0, 0); // put the logs back
    m.click(m.resultSlot, 0); // take planks
    expect(m.cursor).toMatchObject({ id: B.PLANKS, count: 4 });
    expect(m.grid.isEmpty()).toBe(true);
    expect(m.result.get(0)).toBeNull();
  });

  it('shift-clicking the result crafts repeatedly into the inventory', () => {
    const inv = new Container(36);
    inv.add(makeStack(B.LOG, 3));
    const m = new CraftingMenu(inv, 2);
    m.click(0, 0);
    m.click(m.gridStart, 0); // put all 3 logs in the grid cell
    m.shiftClick(m.resultSlot);
    expect(inv.countOf(B.PLANKS)).toBe(12);
    expect(m.grid.isEmpty()).toBe(true);
  });

  it('returns grid contents and cursor on close', () => {
    const inv = new Container(36);
    inv.add(makeStack(B.LOG, 3));
    const m = new CraftingMenu(inv, 3);
    m.click(0, 0);
    m.click(m.gridStart + 4, 1);
    const returned = m.close();
    expect(returned.reduce((n, s) => n + s.count, 0)).toBe(3);
    expect(m.grid.isEmpty()).toBe(true);
  });

  it('furnace slots only accept fuel in the fuel slot and are take-only for output', () => {
    const inv = new Container(36);
    inv.add(makeStack(B.COBBLE, 10));
    inv.add(makeStack(I.COAL, 4));
    const f = new Furnace();
    const m = new FurnaceMenu(inv, f);

    m.click(0, 0); // pick up cobble
    m.click(m.fuelSlot, 0); // not a fuel: rejected
    expect(f.container.get(1)).toBeNull();
    m.click(m.inputSlot, 0);
    expect(f.container.get(0)).toMatchObject({ id: B.COBBLE, count: 10 });

    m.shiftClick(1); // coal -> fuel slot
    expect(f.container.get(1)).toMatchObject({ id: I.COAL, count: 4 });

    f.container.set(2, makeStack(B.STONE, 3));
    m.click(m.outputSlot, 0);
    expect(m.cursor).toMatchObject({ id: B.STONE, count: 3 });
  });

  it('creative palette hands out stacks and deletes held ones', () => {
    const inv = new Container(36);
    const m = new CreativeMenu(inv);
    const idx = m.slots.findIndex((s) => s.kind === 'palette' && s.container.get(s.index)!.id === B.GLOWSTONE);
    m.click(idx, 0);
    expect(m.cursor).toMatchObject({ id: B.GLOWSTONE, count: 64 });
    m.click(0, 0); // drop in hotbar slot
    expect(inv.get(0)!.count).toBe(64);
    m.click(idx, 1);
    expect(m.cursor!.count).toBe(1);
    m.click(idx, 0); // clicking the palette with an item deletes it
    expect(m.cursor).toBeNull();
  });
});

describe('furnace', () => {
  it('smelts one item per 10 seconds and burns fuel', () => {
    const f = new Furnace();
    f.container.set(0, makeStack(B.IRON_ORE, 3));
    f.container.set(1, makeStack(I.COAL, 1));
    for (let t = 0; t < 9.9; t += 0.1) f.tick(0.1);
    expect(f.container.get(2)).toBeNull();
    for (let t = 0; t < 0.4; t += 0.1) f.tick(0.1);
    expect(f.container.get(2)).toMatchObject({ id: I.IRON_INGOT, count: 1 });
    expect(f.lit).toBe(true);
    for (let t = 0; t < 25; t += 0.1) f.tick(0.1);
    expect(f.container.get(2)!.count).toBe(3);
    expect(f.container.get(0)).toBeNull();
  });

  it('one coal smelts 8 items', () => {
    const f = new Furnace();
    f.container.set(0, makeStack(B.SAND, 20));
    f.container.set(1, makeStack(I.COAL, 1));
    for (let t = 0; t < 200; t += 0.5) f.tick(0.5);
    expect(f.container.get(2)).toMatchObject({ id: B.GLASS, count: 8 });
    expect(f.container.get(0)!.count).toBe(12);
    expect(f.lit).toBe(false);
  });

  it('does nothing without fuel or when the output is blocked', () => {
    const f = new Furnace();
    f.container.set(0, makeStack(B.COBBLE, 5));
    for (let t = 0; t < 30; t += 0.5) f.tick(0.5);
    expect(f.container.get(2)).toBeNull();

    f.container.set(1, makeStack(I.COAL, 1));
    f.container.set(2, makeStack(B.GLASS, 1)); // wrong output type blocks smelting
    for (let t = 0; t < 30; t += 0.5) f.tick(0.5);
    expect(f.container.get(0)!.count).toBe(5);
    expect(f.container.get(1)!.count).toBe(1);
  });

  it('serialises its state', () => {
    const f = new Furnace();
    f.container.set(0, makeStack(B.SAND, 4));
    f.container.set(1, makeStack(B.PLANKS, 2));
    for (let t = 0; t < 4; t += 0.5) f.tick(0.5);
    const g = new Furnace();
    g.loadJSON(JSON.parse(JSON.stringify(f.toJSON())));
    expect(g.toJSON()).toEqual(f.toJSON());
  });
});

describe('vitals', () => {
  it('takes fall damage only beyond 3 blocks', () => {
    const v = new Vitals();
    expect(v.land(3, ctx)).toBe(0);
    expect(v.land(5.5, ctx)).toBe(2);
    expect(v.health).toBe(18);
    expect(v.land(40, { ...ctx, invulnerable: true })).toBe(0);
  });

  it('dies and respawns', () => {
    const v = new Vitals();
    v.damage(25, 'mob');
    expect(v.dead).toBe(true);
    expect(v.health).toBe(0);
    v.damage(5);
    expect(v.health).toBe(0);
    v.respawn();
    expect(v.dead).toBe(false);
    expect(v.health).toBe(20);
  });

  it('exhaustion drains saturation first, then hunger', () => {
    const v = new Vitals();
    v.saturation = 1;
    v.addExhaustion(4);
    v.tick(0.05, ctx);
    expect(v.saturation).toBe(0);
    expect(v.hunger).toBe(20);
    v.addExhaustion(4);
    v.tick(0.05, ctx);
    expect(v.hunger).toBe(19);
  });

  it('regenerates when well fed, faster with saturation', () => {
    const v = new Vitals();
    v.health = 10;
    for (let t = 0; t < 2; t += 0.05) v.tick(0.05, ctx);
    expect(v.health).toBeGreaterThanOrEqual(13);

    const w = new Vitals();
    w.health = 10;
    w.saturation = 0;
    w.hunger = 19;
    for (let t = 0; t < 8.1; t += 0.05) w.tick(0.05, ctx);
    expect(w.health).toBeGreaterThanOrEqual(11);
    expect(w.health).toBeLessThanOrEqual(13);
  });

  it('starves down to half a heart but no further', () => {
    const v = new Vitals();
    v.hunger = 0;
    v.saturation = 0;
    for (let t = 0; t < 200; t += 0.5) v.tick(0.5, ctx);
    expect(v.health).toBe(1);
    expect(v.dead).toBe(false);
  });

  it('drowns after running out of air and recovers air at the surface', () => {
    const v = new Vitals();
    const under = { ...ctx, eyeInWater: true };
    for (let t = 0; t < MAX_AIR - 0.5; t += 0.1) v.tick(0.1, under);
    expect(v.health).toBe(20);
    for (let t = 0; t < 3.5; t += 0.1) v.tick(0.1, under);
    expect(v.health).toBeLessThan(20);
    for (let t = 0; t < 3; t += 0.1) v.tick(0.1, ctx);
    expect(v.air).toBe(MAX_AIR);
  });

  it('eating restores hunger and caps at the maximum', () => {
    const v = new Vitals();
    v.hunger = 10;
    v.saturation = 0;
    v.eat(getItem(I.COOKED_MEAT).food!);
    expect(v.hunger).toBe(18);
    v.eat(getItem(I.COOKED_MEAT).food!);
    expect(v.hunger).toBe(20);
    expect(v.canEat()).toBe(false);
    expect(v.saturation).toBeLessThanOrEqual(20);
    expect(EXHAUSTION.sprintJump).toBeGreaterThan(EXHAUSTION.jump);
  });
});
