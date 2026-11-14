import { B, BUILD_MATERIALS, DYE_NAMES, woolColor, woolId, TOOL_KINDS, TOOL_MATERIALS, gateId, ladderId, slabId, stairId, trapdoorId, type ToolKind, type ToolMaterial } from './blocks';
import { ARMOR_MATERIALS, type ArmorMaterial } from './armor';
import { I, armorId, bagId, bedItemId, dyeId, toolId } from './items';
import type { ItemStack } from './inventory';

export interface Recipe {
  result: { id: number; count: number };
  /** Shaped recipes: rows of equal width; ' ' is an empty cell. */
  pattern?: string[];
  key?: Record<string, number>;
  /** Shapeless recipes: ingredient item ids. */
  shapeless?: number[];
}

export const RECIPES: Recipe[] = [];

function shaped(result: number, count: number, pattern: string[], key: Record<string, number>): void {
  RECIPES.push({ result: { id: result, count }, pattern, key });
}
function shapeless(result: number, count: number, ingredients: number[]): void {
  RECIPES.push({ result: { id: result, count }, shapeless: ingredients });
}

// ---- basics ----
shapeless(B.PLANKS, 4, [B.LOG]);
shapeless(B.PLANKS, 4, [B.BIRCH_LOG]);
shapeless(B.PLANKS, 4, [B.SPRUCE_LOG]);
for (const log of [B.ACACIA_LOG, B.JUNGLE_LOG, B.DARK_OAK_LOG, B.CHERRY_LOG]) shapeless(B.PLANKS, 4, [log]);
// Giant mushrooms are good for planks too, if a little soft.
shapeless(B.PLANKS, 2, [B.MUSHROOM_STEM]);
shaped(I.STICK, 4, ['P', 'P'], { P: B.PLANKS });
shaped(B.CRAFTING_TABLE, 1, ['PP', 'PP'], { P: B.PLANKS });
shaped(B.FURNACE, 1, ['CCC', 'C C', 'CCC'], { C: B.COBBLE });
shaped(B.SANDSTONE, 1, ['SS', 'SS'], { S: B.SAND });
shaped(B.CHEST, 1, ['PPP', 'P P', 'PPP'], { P: B.PLANKS });

shaped(B.TORCH, 4, ['C', 'S'], { C: I.COAL, S: I.STICK });
// A torch in an iron cage; a drop of lapis turns the flame blue. Chains are a column of iron.
shaped(B.LANTERN, 1, [' I ', 'ITI', ' I '], { I: I.IRON_INGOT, T: B.TORCH });
shapeless(B.SOUL_LANTERN, 1, [B.LANTERN, I.LAPIS_LAZULI]);
shaped(B.CHAIN, 3, ['I', 'I', 'I'], { I: I.IRON_INGOT });
shaped(I.BREAD, 1, ['WWW'], { W: I.WHEAT });
shaped(I.BOW, 1, [' SW', 'S W', ' SW'], { S: I.STICK, W: I.STRING });
// Flint head, stick shaft, bone fletching (stand-in for a feather).
shaped(I.ARROW, 4, ['F', 'S', 'B'], { F: I.FLINT, S: I.STICK, B: I.BONE });
shaped(I.ARROW, 4, ['F', 'S', 'E'], { F: I.FLINT, S: I.STICK, E: I.FEATHER });
shaped(I.BUCKET, 1, ['I I', ' I '], { I: I.IRON_INGOT });
// Four iron ingots round a pinch of redstone: the needle finds north, as in the original.
shaped(I.COMPASS, 1, [' I ', 'IRI', ' I '], { I: I.IRON_INGOT, R: I.REDSTONE });
shapeless(I.FLINT_AND_STEEL, 1, [I.IRON_INGOT, I.FLINT]);
// Six planks round an iron ingot, as in the original.
shaped(I.SHIELD, 1, ['PIP', 'PPP', ' P '], { P: B.PLANKS, I: I.IRON_INGOT });
// Class weapons (anyone may make and carry them; see classes.ts).
shaped(I.DAGGER, 1, ['I', 'S'], { I: I.IRON_INGOT, S: I.STICK });
shaped(I.GREATSWORD, 1, [' I ', 'III', ' S '], { I: I.IRON_INGOT, S: I.STICK });
shaped(I.STAFF, 1, ['  D', ' S ', 'S  '], { D: I.DIAMOND, S: I.STICK });
shaped(I.WAND, 1, ['  G', ' S ', 'S  '], { G: I.GOLD_INGOT, S: I.STICK });
shapeless(I.SPELLBOOK, 1, [I.BOOK, I.LAPIS_LAZULI, I.GOLD_INGOT]);
shaped(I.ORB, 1, [' L ', 'LEL', ' L '], { L: I.LAPIS_LAZULI, E: I.ENDER_PEARL });
shaped(I.CROSSBOW, 1, ['SIS', 'WSW', ' S '], { S: I.STICK, I: I.IRON_INGOT, W: I.STRING });
// Bags: leather sewn with string, and for the bigger ones a metal or a gem in the clasp. The biggest (the Rift Satchel)
// cannot be crafted: it is found on monsters and handed out by quests (see bags.ts).
shaped(bagId(0), 1, [' S ', 'L L', 'LLL'], { S: I.STRING, L: I.LEATHER });
shaped(bagId(1), 1, ['LLL', 'LSL', 'LLL'], { S: I.STRING, L: I.LEATHER });
shaped(bagId(2), 1, ['LIL', 'LSL', 'LLL'], { S: I.STRING, L: I.LEATHER, I: I.IRON_INGOT });
shaped(bagId(3), 1, ['LGL', 'LSL', 'LLL'], { S: I.STRING, L: I.LEATHER, G: I.GOLD_INGOT });
shaped(bagId(4), 1, ['LDL', 'LSL', 'LLL'], { S: I.STRING, L: I.LEATHER, D: I.DIAMOND });
// A bed takes three wool of one colour and gives a bed of that colour.
DYE_NAMES.forEach((_, c) => shaped(bedItemId(c), 1, ['WWW', 'PPP'], { W: woolId(c), P: B.PLANKS }));
shaped(B.RAIL_X, 16, ['I I', 'ISI', 'I I'], { I: I.IRON_INGOT, S: I.STICK });
shaped(B.WOOL, 1, ['SS', 'SS'], { S: I.STRING });

// ---- building blocks ----
shaped(B.STONE_BRICKS, 4, ['SS', 'SS'], { S: B.STONE });
BUILD_MATERIALS.forEach((m, i) => {
  shaped(slabId(i, false), 6, ['MMM'], { M: m.block });
  shaped(stairId(i, false, 0), 4, ['M  ', 'MM ', 'MMM'], { M: m.block });
  shaped(stairId(i, false, 0), 4, ['  M', ' MM', 'MMM'], { M: m.block });
});
shaped(I.DOOR, 3, ['PP', 'PP', 'PP'], { P: B.PLANKS });
shaped(trapdoorId(false, false, 0), 2, ['PPP', 'PPP'], { P: B.PLANKS });
shaped(B.FENCE, 2, ['PSP', 'PSP'], { P: B.PLANKS, S: I.STICK });
shaped(gateId(false, 0), 1, ['SPS', 'SPS'], { P: B.PLANKS, S: I.STICK });
shaped(ladderId(0), 3, ['S S', 'SSS', 'S S'], { S: I.STICK });
shaped(B.PANE, 16, ['GGG', 'GGG'], { G: B.GLASS });

// Enchanting: paper is pressed from a column of wheat (there is no sugar cane), a book is three paper and leather.
shaped(I.PAPER, 3, ['W', 'W', 'W'], { W: I.WHEAT });
shapeless(I.BOOK, 1, [I.PAPER, I.PAPER, I.PAPER, I.LEATHER]);
/** A map is drawn on paper with a lump of coal for ink. */
shapeless(I.MAP, 1, [I.PAPER, I.PAPER, I.PAPER, I.COAL]);
shaped(B.BOOKSHELF, 1, ['PPP', 'BBB', 'PPP'], { P: B.PLANKS, B: I.BOOK });
shaped(B.ENCHANTING_TABLE, 1, [' B ', 'DOD', 'OOO'], { B: I.BOOK, D: I.DIAMOND, O: B.OBSIDIAN });
shaped(B.ANVIL, 1, ['III', ' I ', 'III'], { I: I.IRON_INGOT });
// The grindstone: a stone slab on two sticks, between two planks (the original's shape).
shaped(B.GRINDSTONE, 1, ['SMS', 'P P'], { S: I.STICK, M: slabId(2, false), P: B.PLANKS });

// Shears: two iron ingots meeting at a corner. TNT: gunpowder and sand, five and four. Nine slimeballs make a block of it, and back.
shaped(I.SHEARS, 1, [' I', 'I '], { I: I.IRON_INGOT });
// A minecart is a bowl of five iron ingots, a boat five planks. Gold rails (they need no redstone here) are six gold ingots and a stick.
shaped(I.MINECART, 1, ['I I', 'III'], { I: I.IRON_INGOT });
shaped(I.BOAT, 1, ['P P', 'PPP'], { P: B.PLANKS });
shaped(B.POWERED_RAIL_X, 6, ['G G', 'GSG', 'G G'], { G: I.GOLD_INGOT, S: I.STICK });
// Redstone: dust from the ore, a block of nine, and the parts that use it.
shapeless(I.REDSTONE, 9, [B.REDSTONE_BLOCK]);
shaped(B.REDSTONE_BLOCK, 1, ['RRR', 'RRR', 'RRR'], { R: I.REDSTONE });
shaped(B.RTORCH_BASE + 1, 1, ['R', 'S'], { R: I.REDSTONE, S: I.STICK });
shaped(B.LEVER_BASE, 1, ['S', 'C'], { S: I.STICK, C: B.COBBLE });
shapeless(B.BUTTON_BASE, 1, [B.STONE]);
shaped(B.PLATE_STONE, 1, ['SS'], { S: B.STONE });
shaped(B.PLATE_WOOD, 1, ['PP'], { P: B.PLANKS });
shaped(B.LAMP, 1, [' R ', 'RGR', ' R '], { R: I.REDSTONE, G: B.GLOWSTONE });
shaped(B.TNT, 1, ['GSG', 'SGS', 'GSG'], { G: I.GUNPOWDER, S: B.SAND });
shaped(B.SLIME_BLOCK, 1, ['SSS', 'SSS', 'SSS'], { S: I.SLIMEBALL });
shapeless(I.SLIMEBALL, 9, [B.SLIME_BLOCK]);

// ---- dyes ----
const dye = (name: (typeof DYE_NAMES)[number]): number => dyeId(DYE_NAMES.indexOf(name));
shapeless(dye('red'), 1, [B.ROSE]);
shapeless(dye('yellow'), 1, [B.DANDELION]);
shapeless(dye('black'), 1, [I.INK_SAC]);
shapeless(dye('white'), 3, [I.BONE]);
// Mixing (lapis lazuli grinds to blue, cactus smelts into green).
shapeless(dye('blue'), 1, [I.LAPIS_LAZULI]);
shapeless(dye('orange'), 2, [dye('red'), dye('yellow')]);
shapeless(dye('pink'), 2, [dye('red'), dye('white')]);
shapeless(dye('lime'), 2, [dye('green'), dye('white')]);
shapeless(dye('gray'), 2, [dye('black'), dye('white')]);
shapeless(dye('light_gray'), 2, [dye('gray'), dye('white')]);
shapeless(dye('light_blue'), 2, [dye('blue'), dye('white')]);
shapeless(dye('purple'), 2, [dye('red'), dye('blue')]);
shapeless(dye('cyan'), 2, [dye('green'), dye('blue')]);
shapeless(dye('magenta'), 2, [dye('purple'), dye('pink')]);
// There is no cocoa here, so brown is a mix of its own.
shapeless(dye('brown'), 2, [dye('red'), dye('green')]);
// Dyeing wool: any wool plus a dye. The recipes are written for white wool; `findRecipe` lets any colour stand in for it.
DYE_NAMES.forEach((_, c) => shapeless(woolId(c), 1, [B.WOOL, dyeId(c)]));

// ---- tools ----
const HEAD: Record<ToolMaterial, number> = {
  wood: B.PLANKS,
  stone: B.COBBLE,
  iron: I.IRON_INGOT,
  gold: I.GOLD_INGOT,
  diamond: I.DIAMOND,
};
const TOOL_PATTERNS: Record<ToolKind, string[]> = {
  pickaxe: ['MMM', ' S ', ' S '],
  axe: ['MM', 'MS', ' S'],
  shovel: ['M', 'S', 'S'],
  sword: ['M', 'M', 'S'],
  hoe: ['MM', ' S', ' S'],
};
for (const kind of TOOL_KINDS) {
  for (const material of TOOL_MATERIALS) {
    shaped(toolId(kind, material), 1, TOOL_PATTERNS[kind], { M: HEAD[material], S: I.STICK });
  }
}

// ---- armor ----
const ARMOR_PIECE: Record<ArmorMaterial, number> = {
  leather: I.LEATHER,
  gold: I.GOLD_INGOT,
  iron: I.IRON_INGOT,
  diamond: I.DIAMOND,
};
/** Helmet, chestplate, leggings, boots: 5, 8, 7 and 4 pieces of the material. */
const ARMOR_PATTERNS: string[][] = [['MMM', 'M M'], ['M M', 'MMM', 'MMM'], ['MMM', 'M M', 'M M'], ['M M', 'M M']];
for (const material of ARMOR_MATERIALS) {
  ARMOR_PATTERNS.forEach((pattern, slotIndex) => shaped(armorId(slotIndex, material), 1, pattern, { M: ARMOR_PIECE[material] }));
}

// ---- matching --------------------------------------------------------------

/** Crop a grid of ids to its bounding box of non-empty cells. */
function crop(ids: number[], w: number, h: number): { cells: number[]; w: number; h: number } | null {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (ids[y * w + x] !== 0) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < 0) return null;
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const cells: number[] = [];
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) cells.push(ids[(minY + y) * w + minX + x]);
  return { cells, w: cw, h: ch };
}

function matchShaped(r: Recipe, c: { cells: number[]; w: number; h: number }, mirror: boolean): boolean {
  const pattern = r.pattern!;
  if (pattern.length !== c.h || pattern[0].length !== c.w) return false;
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const px = mirror ? c.w - 1 - x : x;
      const ch = pattern[y][px];
      const want = ch === ' ' ? 0 : r.key![ch];
      if (c.cells[y * c.w + x] !== want) return false;
    }
  }
  return true;
}

/** Finds the recipe for a crafting grid (row-major, `null` = empty). */
export function findRecipe(grid: (ItemStack | null)[], w: number, h: number): Recipe | null {
  const ids = grid.map((s) => (s ? s.id : 0));
  const hit = findRecipeFor(ids, w, h);
  if (hit) return hit;
  // Wool of any colour counts as plain wool when dyeing it (a bed still needs wool of one colour).
  const plain = ids.map((id) => (woolColor(id) > 0 ? B.WOOL : id));
  if (!plain.some((id, i) => id !== ids[i])) return null;
  const again = findRecipeFor(plain, w, h);
  return again && woolColor(again.result.id) >= 0 ? again : null;
}

function findRecipeFor(ids: number[], w: number, h: number): Recipe | null {
  const c = crop(ids, w, h);
  if (!c) return null;
  const sorted = c.cells.filter((v) => v !== 0).sort((a, b) => a - b);

  for (const r of RECIPES) {
    if (r.pattern) {
      if (matchShaped(r, c, false) || matchShaped(r, c, true)) return r;
    } else if (r.shapeless) {
      const want = [...r.shapeless].sort((a, b) => a - b);
      if (want.length === sorted.length && want.every((v, i) => v === sorted[i])) return r;
    }
  }
  return null;
}

// ---- the recipe book ---------------------------------------------------------

/** What one craft uses up: item id to count. */
export function recipeNeeds(r: Recipe): Map<number, number> {
  const out = new Map<number, number>();
  for (const id of recipeIngredients(r)) out.set(id, (out.get(id) ?? 0) + 1);
  return out;
}

/** Every ingredient cell of a recipe, one item id per cell that must be filled. */
export function recipeIngredients(r: Recipe): number[] {
  if (r.shapeless) return [...r.shapeless];
  const ids: number[] = [];
  for (const row of r.pattern!) for (const ch of row) if (ch !== ' ') ids.push(r.key![ch]);
  return ids;
}

/** Width and height of the smallest grid the recipe fits in. */
export function recipeSize(r: Recipe): { w: number; h: number } {
  if (r.pattern) return { w: r.pattern[0].length, h: r.pattern.length };
  const n = r.shapeless!.length;
  const side = n <= 1 ? 1 : n <= 4 ? 2 : 3;
  return { w: side, h: side };
}

/** The recipe laid out on a `size` x `size` grid (row-major item ids, 0 = empty), or null if it does not fit. */
export function recipeLayout(r: Recipe, size: number): number[] | null {
  const { w, h } = recipeSize(r);
  if (w > size || h > size) return null;
  const cells = Array.from({ length: size * size }, () => 0);
  if (r.pattern) {
    r.pattern.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) cells[y * size + x] = row[x] === ' ' ? 0 : r.key![row[x]];
    });
  } else {
    r.shapeless!.forEach((id, i) => (cells[i] = id));
  }
  return cells;
}

/** Can the recipe be made once from what `have` says is available? */
export function canCraftWith(r: Recipe, have: (id: number) => number): boolean {
  for (const [id, n] of recipeNeeds(r)) if (have(id) < n) return false;
  return true;
}
