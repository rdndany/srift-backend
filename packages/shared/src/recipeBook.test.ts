import { describe, expect, it } from 'vitest';
import {
  B,
  Container,
  CraftingMenu,
  GameSession,
  HeadlessWorld,
  I,
  PLAYER_SLOTS,
  RECIPES,
  RECIPE_CATEGORIES,
  RecipeBook,
  WorldGenerator,
  canCraftWith,
  findRecipe,
  makeStack,
  mulberry32,
  parseSessionMessage,
  recipeCategory,
  recipeIngredients,
  recipeLayout,
  recipeNeeds,
  recipeSize,
  recipesForGrid,
  toolId,
} from './index';

const indexOf = (result: number, nth = 0): number => {
  let seen = 0;
  for (let i = 0; i < RECIPES.length; i++) {
    if (RECIPES[i].result.id === result && seen++ === nth) return i;
  }
  throw new Error(`no recipe for ${result}`);
};

describe('recipe layouts', () => {
  it('every recipe laid out in the grid gives back that recipe (or one with the same result)', () => {
    for (const r of RECIPES) {
      const layout = recipeLayout(r, 3)!;
      expect(layout, `layout of ${r.result.id}`).not.toBeNull();
      const grid = layout.map((id) => (id ? makeStack(id) : null));
      const found = findRecipe(grid, 3, 3);
      expect(found?.result, `recipe for ${r.result.id}`).toEqual(r.result);
    }
  });

  it('small recipes fit the 2x2 grid, big ones do not', () => {
    expect(recipeLayout(RECIPES[indexOf(B.CRAFTING_TABLE)], 2)).toEqual([B.PLANKS, B.PLANKS, B.PLANKS, B.PLANKS]);
    expect(recipeLayout(RECIPES[indexOf(B.PLANKS)], 2)).toEqual([B.LOG, 0, 0, 0]);
    expect(recipeLayout(RECIPES[indexOf(toolId('pickaxe', 'iron'))], 2)).toBeNull();
    expect(recipeLayout(RECIPES[indexOf(B.CHEST)], 2)).toBeNull();
    const two = recipesForGrid(2).map((i) => RECIPES[i].result.id);
    expect(two).toContain(B.PLANKS);
    expect(two).toContain(I.STICK);
    expect(two).toContain(B.TORCH);
    expect(two).not.toContain(B.FURNACE);
    expect(recipesForGrid(3)).toHaveLength(RECIPES.length);
  });

  it('knows what one craft uses', () => {
    expect(recipeNeeds(RECIPES[indexOf(B.TORCH)])).toEqual(new Map<number, number>([[I.COAL, 1], [I.STICK, 1]]));
    expect(recipeNeeds(RECIPES[indexOf(B.RAIL_X)])).toEqual(new Map<number, number>([[I.IRON_INGOT, 6], [I.STICK, 1]]));
    expect(recipeSize(RECIPES[indexOf(B.CHEST)])).toEqual({ w: 3, h: 3 });
    expect(recipeIngredients(RECIPES[indexOf(B.WOOL)])).toHaveLength(4);
    const have = new Map<number, number>([[I.COAL, 1]]);
    expect(canCraftWith(RECIPES[indexOf(B.TORCH)], (id) => have.get(id) ?? 0)).toBe(false);
    have.set(I.STICK, 1);
    expect(canCraftWith(RECIPES[indexOf(B.TORCH)], (id) => have.get(id) ?? 0)).toBe(true);
  });

  it('every recipe has a tab', () => {
    const tabs = new Set(RECIPE_CATEGORIES.map((c) => c.id));
    for (const r of RECIPES) expect(tabs.has(recipeCategory(r))).toBe(true);
    expect(recipeCategory(RECIPES[indexOf(toolId('axe', 'stone'))])).toBe('tools');
    expect(recipeCategory(RECIPES[indexOf(I.BREAD)])).toBe('food');
    expect(recipeCategory(RECIPES[indexOf(B.CRAFTING_TABLE)])).toBe('building');
  });
});

describe('unlocking', () => {
  it('a new player has nothing, and holding an ingredient unlocks the recipes that use it', () => {
    const book = new RecipeBook();
    expect(book.list(3, false)).toEqual([]);
    expect(book.observe([B.LOG])).toBe(true);
    const names = book.list(3, false).map((i) => RECIPES[i].result.id);
    expect(names).toContain(B.PLANKS);
    expect(book.unlocked(RECIPES[indexOf(B.PLANKS, 1)])).toBe(false); // birch planks need a birch log
    expect(book.observe([B.LOG])).toBe(false);
    book.observe([B.PLANKS]);
    const more = book.list(3, false).map((i) => RECIPES[i].result.id);
    for (const id of [I.STICK, B.CRAFTING_TABLE, B.CHEST, toolId('pickaxe', 'wood')]) expect(more).toContain(id);
    expect(more).not.toContain(toolId('pickaxe', 'iron'));
  });

  it('learn() names the recipes an item newly unlocked, once', () => {
    const book = new RecipeBook();
    const first = book.learn([B.LOG]);
    expect(first.map((i) => RECIPES[i].result.id)).toContain(B.PLANKS);
    expect(book.learn([B.LOG])).toEqual([]); // nothing new the second time
    const next = book.learn([B.PLANKS, B.LOG]).map((i) => RECIPES[i].result.id);
    expect(next).toContain(I.STICK);
    expect(next).not.toContain(B.PLANKS);
    expect(book.learn([B.BEDROCK])).toEqual([]); // an item no recipe uses is still remembered, but says nothing
    expect(book.seen.has(B.BEDROCK)).toBe(true);
  });

  it('the creative list is everything, and the 2x2 list is a subset', () => {
    const book = new RecipeBook();
    expect(book.list(3, true)).toHaveLength(RECIPES.length);
    expect(book.list(2, true).length).toBeLessThan(RECIPES.length);
  });

  it('is remembered, and a damaged list does not hurt', () => {
    const book = new RecipeBook();
    book.observe([B.LOG, I.COAL, 0, -4]);
    const copy = new RecipeBook();
    copy.loadJSON(book.toJSON());
    expect([...copy.seen]).toEqual([...book.seen].sort((a, b) => a - b));
    const bad = new RecipeBook();
    bad.loadJSON('nonsense');
    bad.loadJSON([1.5, 'x', null, 99999999, B.LOG]);
    expect([...bad.seen]).toEqual([B.LOG]);
  });
});

describe('filling the grid from the book', () => {
  function menu(items: [number, number][], size: 2 | 3 = 3) {
    const inv = new Container(PLAYER_SLOTS);
    for (const [id, n] of items) inv.add(makeStack(id, n));
    return { inv, m: new CraftingMenu(inv, size) };
  }

  it('one click lays out one craft and shows the result', () => {
    const { inv, m } = menu([[B.PLANKS, 8]]);
    expect(m.fillRecipe(indexOf(I.STICK), false)).toBe(true);
    expect(m.grid.get(0)).toMatchObject({ id: B.PLANKS, count: 1 });
    expect(m.grid.get(3)).toMatchObject({ id: B.PLANKS, count: 1 });
    expect(m.result.get(0)).toMatchObject({ id: I.STICK, count: 4 });
    expect(inv.countOf(B.PLANKS)).toBe(6);
    expect(m.totalItems()).toBe(8);
  });

  it('clicking the same recipe again adds one more set', () => {
    const logs = menu([[B.LOG, 5]], 2);
    const planks = indexOf(B.PLANKS);
    expect(logs.m.fillRecipe(planks, false)).toBe(true);
    expect(logs.m.fillRecipe(planks, false)).toBe(true);
    expect(logs.m.grid.get(0)).toMatchObject({ id: B.LOG, count: 2 });
    expect(logs.m.result.get(0)).toMatchObject({ id: B.PLANKS, count: 8 });
    expect(logs.inv.countOf(B.LOG)).toBe(3);
    // Nothing left to add: the grid stays as it is.
    const last = menu([[B.LOG, 1]], 2);
    expect(last.m.fillRecipe(planks, false)).toBe(true);
    expect(last.m.fillRecipe(planks, false)).toBe(false);
    expect(last.m.grid.get(0)).toMatchObject({ id: B.LOG, count: 1 });

    const { inv, m } = menu([[B.PLANKS, 8]]);
    const sticks = indexOf(I.STICK);
    expect(m.fillRecipe(sticks, false)).toBe(true);
    expect(m.fillRecipe(sticks, false)).toBe(true);
    expect(m.grid.get(0)?.count).toBe(2);
    expect(m.grid.get(3)?.count).toBe(2);
    expect(m.result.get(0)).toMatchObject({ id: I.STICK, count: 8 });
    expect(inv.countOf(B.PLANKS)).toBe(4);
  });

  it('shift fills as many crafts as the inventory allows', () => {
    const { inv, m } = menu([[B.PLANKS, 9]]);
    expect(m.fillRecipe(indexOf(I.STICK), true)).toBe(true);
    // 9 planks, two cells: four crafts, one plank left over.
    expect(m.grid.get(0)?.count).toBe(4);
    expect(inv.countOf(B.PLANKS)).toBe(1);
    // The result is every craft the grid holds: four pairs of planks become sixteen sticks.
    m.shiftClick(m.resultSlot);
    expect(inv.countOf(I.STICK)).toBe(16);
    expect(m.grid.isEmpty()).toBe(true);
    expect(inv.countOf(B.PLANKS)).toBe(1);
  });

  it('does nothing when the ingredients are missing or the recipe is too big', () => {
    const { inv, m } = menu([[B.PLANKS, 3]]);
    expect(m.fillRecipe(indexOf(B.CRAFTING_TABLE), false)).toBe(false);
    expect(m.grid.isEmpty()).toBe(true);
    expect(inv.countOf(B.PLANKS)).toBe(3);
    const two = menu([[B.PLANKS, 20], [I.STICK, 20]], 2);
    expect(two.m.fillRecipe(indexOf(toolId('pickaxe', 'wood')), false)).toBe(false);
    expect(two.m.fillRecipe(-1, false)).toBe(false);
    expect(two.m.fillRecipe(99999, false)).toBe(false);
  });

  it('sends what was in the grid back to the inventory first', () => {
    const { inv, m } = menu([[B.PLANKS, 8]]);
    m.grid.set(4, makeStack(B.COBBLE, 5));
    m.recalc();
    const before = m.totalItems();
    expect(m.fillRecipe(indexOf(I.STICK), false)).toBe(true);
    expect(m.grid.get(4)).toBeNull();
    expect(inv.countOf(B.COBBLE)).toBe(5);
    expect(m.totalItems()).toBe(before);
  });

  it('can use ingredients already in the grid', () => {
    const { inv, m } = menu([]);
    m.grid.set(0, makeStack(B.PLANKS, 2));
    m.fillRecipe(indexOf(I.STICK), false);
    expect(inv.countOf(B.PLANKS)).toBe(0);
    expect(m.grid.get(0)).toMatchObject({ id: B.PLANKS, count: 1 });
    expect(m.grid.get(3)).toMatchObject({ id: B.PLANKS, count: 1 });
  });

  it('changes nothing when there is no room to put the grid back', () => {
    const inv = new Container(PLAYER_SLOTS);
    for (let i = 0; i < PLAYER_SLOTS - 1; i++) inv.set(i, makeStack(B.STONE, 64));
    inv.set(PLAYER_SLOTS - 1, makeStack(B.PLANKS, 2));
    const m = new CraftingMenu(inv, 3);
    m.grid.set(5, makeStack(B.DIRT, 1));
    m.recalc();
    const snapshot = JSON.stringify([inv.toJSON(), m.grid.toJSON()]);
    expect(m.fillRecipe(indexOf(I.STICK), false)).toBe(false);
    expect(JSON.stringify([inv.toJSON(), m.grid.toJSON()])).toBe(snapshot);
  });

  it('the cell count of a recipe that repeats an ingredient is respected', () => {
    // A pickaxe needs three planks (three cells) and two sticks: with 5 planks, one craft only.
    const { m } = menu([[B.PLANKS, 5], [I.STICK, 4]]);
    m.fillRecipe(indexOf(toolId('pickaxe', 'wood')), true);
    expect(m.grid.get(0)?.count).toBe(1);
    expect(m.grid.get(4)?.count).toBe(1);
    expect(m.grid.get(7)?.count).toBe(1);
    expect(m.result.get(0)?.id).toBe(toolId('pickaxe', 'wood'));
  });
});

describe('the recipe command', () => {
  it('is validated like every other command', () => {
    expect(parseSessionMessage({ t: 'recipe', index: 3, all: true })).toEqual({ t: 'recipe', index: 3, all: true });
    for (const bad of [
      { t: 'recipe', index: -1, all: false },
      { t: 'recipe', index: 1.5, all: false },
      { t: 'recipe', index: 'x', all: false },
      { t: 'recipe', index: 9999, all: false },
      { t: 'recipe', index: 1 },
      { t: 'recipe', index: NaN, all: true },
    ]) {
      expect(parseSessionMessage(bad)).toBeNull();
    }
  });

  it('fills the open crafting table, and does nothing with no menu, a furnace, or in the creative palette', () => {
    const generator = new WorldGenerator(5);
    const world = new HeadlessWorld(generator);
    const s = new GameSession({ seed: 5, world, generator, naturalSpawning: false, rand: mulberry32(1) });
    s.finishLoading();
    s.setMode('survival');
    s.clearInventory();
    s.giveItem(B.PLANKS, 8);
    s.apply({ t: 'recipe', index: indexOf(I.STICK), all: false });
    expect(s.inventory.countOf(B.PLANKS)).toBe(8); // no menu open
    s.apply({ t: 'inventory' });
    s.apply({ t: 'recipe', index: indexOf(I.STICK), all: false });
    expect(s.inventory.countOf(B.PLANKS)).toBe(6);
    expect(s.drainEvents().some((e) => e.t === 'inv')).toBe(true);
    s.apply({ t: 'recipe', index: indexOf(B.CHEST), all: true }); // too big for 2x2
    expect(s.inventory.countOf(B.PLANKS)).toBe(6);
    s.apply({ t: 'closeMenu' });
    expect(s.inventory.countOf(B.PLANKS)).toBe(8); // the grid came home

    s.setMode('creative');
    s.apply({ t: 'inventory' });
    s.apply({ t: 'recipe', index: indexOf(I.STICK), all: false });
    expect(s.inventory.countOf(B.PLANKS)).toBe(8);
  });
});
