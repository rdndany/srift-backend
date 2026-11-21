import { B, BB, BEYOND, BUILD_MATERIALS, CONNECT, DYE_NAMES, DRESS, GROVE, JOINERY, LOG_BLOCKS, woolColor, woolId, terracottaOf, TOOL_KINDS, TOOL_MATERIALS, campfireId, gateId, idByName, ladderId, MASONRY, slabId, stairId, trapdoorId, type ToolKind, type ToolMaterial } from './blocks';
import { ARMOR_MATERIALS, type ArmorMaterial } from './armor';
import { BEYOND_SHAPES } from './beyondBlocks';
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
// Oak logs (and a mushroom stem) make oak planks. Every other log makes planks of its own kind, below.
shapeless(B.PLANKS, 4, [B.LOG]);
// Giant mushrooms are good for planks too, if a little soft.
shapeless(B.PLANKS, 2, [B.MUSHROOM_STEM]);
shaped(I.STICK, 4, ['P', 'P'], { P: B.PLANKS });
shaped(B.CRAFTING_TABLE, 1, ['PP', 'PP'], { P: B.PLANKS });
shaped(B.FURNACE, 1, ['CCC', 'C C', 'CCC'], { C: B.COBBLE });
// Sticks over a coal, over any kind of log. It is placed already burning.
for (const log of LOG_BLOCKS) shaped(campfireId(0, true), 1, ['SSS', ' C ', 'LLL'], { S: I.STICK, C: I.COAL, L: log });
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
// The key of the Hollow Cellar, as the Cloak of Invisibility was made in Blood Castle: two pieces, joined.
shapeless(I.HOLLOW_SIGIL, 1, [I.WARDEN_SCROLL, I.HOLLOW_BONE]);
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
/** A block or item the masonry recipes name. */
function masonryNamed(name: string): number {
  const block = idByName(name);
  if (block) return block;
  if (name.endsWith('_dye')) {
    const color = (DYE_NAMES as readonly string[]).indexOf(name.slice(0, -4));
    if (color >= 0) return dyeId(color);
  }
  if (name === 'slimeball') return I.SLIMEBALL;
  throw new Error(`masonry ingredient ${name} is not an item`);
}
for (const row of MASONRY) {
  const s = row.spec;
  const src = row.blockId;
  if (src && s.slab && row.slabBase >= 0) shaped(row.slabBase, 6, ['MMM'], { M: src });
  if (src && s.stair && row.stairBase >= 0) {
    shaped(row.stairBase, 4, ['M  ', 'MM ', 'MMM'], { M: src });
    shaped(row.stairBase, 4, ['  M', ' MM', 'MMM'], { M: src });
  }
  if (src && s.wall && row.wallId) shaped(row.wallId, 6, ['WWW', 'WWW'], { W: src });
  if (s.planks && row.cubeId) {
    shapeless(row.cubeId, 4, [masonryNamed(s.planks)]);
    shaped(I.STICK, 4, ['P', 'P'], { P: row.cubeId });
  }
  if (s.square && row.cubeId) shaped(row.cubeId, 4, ['SS', 'SS'], { S: masonryNamed(s.square) });
  if (s.row3 && row.cubeId) shaped(row.cubeId, 1, ['SSS'], { S: masonryNamed(s.row3) });
  if (s.shapeless && row.cubeId) shapeless(row.cubeId, 1, s.shapeless.map(masonryNamed));
}
shaped(I.DOOR, 3, ['PP', 'PP', 'PP'], { P: B.PLANKS });
shaped(trapdoorId(false, false, 0), 2, ['PPP', 'PPP'], { P: B.PLANKS });
shaped(B.FENCE, 2, ['PSP', 'PSP'], { P: B.PLANKS, S: I.STICK });
shaped(gateId(false, 0), 1, ['SPS', 'SPS'], { P: B.PLANKS, S: I.STICK });
const whiteDye = dyeId(DYE_NAMES.indexOf('white'));
shapeless(JOINERY.poplarLog, 1, [idByName('birch_log'), whiteDye]);
for (const w of JOINERY.woods) {
  const planks = idByName(w.spec.planks);
  if (w.spec.log) shaped(w.wood, 3, ['LL', 'LL'], { L: idByName(w.spec.log) });
  if (w.spec.logFrom) {
    shaped(w.wood, 3, ['LL', 'LL'], { L: JOINERY.poplarLog });
    shapeless(planks, 4, [JOINERY.poplarLog]);
  }
  shapeless(planks, 4, [w.wood]);
  shapeless(planks, 4, [w.strippedLog]);
  shapeless(planks, 4, [w.strippedWood]);
  shaped(w.strippedWood, 3, ['LL', 'LL'], { L: w.strippedLog });
  shapeless(w.button, 1, [planks]);
  if (!w.door) continue;
  shaped(w.door, 3, ['PP', 'PP', 'PP'], { P: planks });
  shaped(w.trapdoor, 2, ['PPP', 'PPP'], { P: planks });
  shaped(w.fence, 2, ['PSP', 'PSP'], { P: planks, S: I.STICK });
  shaped(w.gate, 1, ['SPS', 'SPS'], { P: planks, S: I.STICK });
  shaped(w.plate, 1, ['PP'], { P: planks });
}
shaped(JOINERY.ironDoor, 3, ['II', 'II', 'II'], { I: I.IRON_INGOT });
shaped(JOINERY.ironTrapdoor, 1, ['II', 'II'], { I: I.IRON_INGOT });
shaped(JOINERY.heavyPlate, 1, ['II'], { I: I.IRON_INGOT });
shaped(JOINERY.lightPlate, 1, ['GG'], { G: I.GOLD_INGOT });
for (const n of JOINERY.nether) {
  const partner = n.with === 'lapis_lazuli' ? I.LAPIS_LAZULI : idByName(n.with);
  shapeless(n.stem, 1, [B.LOG, partner]);
  shaped(n.hyphae, 3, ['SS', 'SS'], { S: n.stem });
}
for (const w of [GROVE.mangrove, GROVE.paleOak, GROVE.bambooWood]) {
  const planks = w.planks;
  if (w.wood) {
    shaped(w.wood, 3, ['LL', 'LL'], { L: w.log });
    shapeless(planks, 4, [w.wood]);
    shapeless(planks, 4, [w.strippedWood]);
    shaped(w.strippedWood, 3, ['LL', 'LL'], { L: w.strippedLog });
  }
  shapeless(planks, w.name === 'bamboo' ? 2 : 4, [w.log]);
  shapeless(planks, w.name === 'bamboo' ? 2 : 4, [w.strippedLog]);
  shaped(I.STICK, 4, ['P', 'P'], { P: planks });
  shaped(w.slab, 6, ['PPP'], { P: planks });
  shaped(w.stair, 4, ['P  ', 'PP ', 'PPP'], { P: planks });
  shaped(w.stair, 4, ['  P', ' PP', 'PPP'], { P: planks });
  shaped(w.door, 3, ['PP', 'PP', 'PP'], { P: planks });
  shaped(w.trapdoor, 2, ['PPP', 'PPP'], { P: planks });
  shaped(w.fence, 2, ['PSP', 'PSP'], { P: planks, S: I.STICK });
  shaped(w.gate, 1, ['SPS', 'SPS'], { P: planks, S: I.STICK });
  shapeless(w.button, 1, [planks]);
  shaped(w.plate, 1, ['PP'], { P: planks });
  shaped(campfireId(0, true), 1, ['SSS', ' C ', 'LLL'], { S: I.STICK, C: I.COAL, L: w.log });
}
shaped(GROVE.bambooWood.log, 1, ['BBB', 'BBB', 'BBB'], { B: GROVE.bamboo });
shaped(GROVE.mosaic, 1, ['S', 'S'], { S: GROVE.bambooWood.slab });
shaped(GROVE.mosaicSlab, 6, ['MMM'], { M: GROVE.mosaic });
shaped(GROVE.mosaicStair, 4, ['M  ', 'MM ', 'MMM'], { M: GROVE.mosaic });
shaped(GROVE.mosaicStair, 4, ['  M', ' MM', 'MMM'], { M: GROVE.mosaic });
shapeless(GROVE.packedMud, 1, [B.MUD, I.WHEAT]);
shapeless(GROVE.rootedDirt, 1, [B.DIRT, B.MOSS_BLOCK]);
shapeless(GROVE.hangingRoots, 1, [GROVE.rootedDirt]);
shapeless(GROVE.muddyMangroveRoots, 1, [GROVE.mangroveRoots, B.MUD]);
shapeless(GROVE.azalea, 1, [B.MOSS_BLOCK]);
shaped(GROVE.mudBrickSlab, 6, ['MMM'], { M: GROVE.mudBricks });
shaped(GROVE.mudBrickStair, 4, ['M  ', 'MM ', 'MMM'], { M: GROVE.mudBricks });
shaped(GROVE.mudBrickStair, 4, ['  M', ' MM', 'MMM'], { M: GROVE.mudBricks });
shaped(GROVE.mudBrickWall, 6, ['WWW', 'WWW'], { W: GROVE.mudBricks });
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
shapeless(dye('brown'), 1, [I.COCOA_BEANS]);
shapeless(I.SUGAR, 1, [B.SUGAR_CANE]);
shaped(B.MELON, 1, ['SSS', 'SSS', 'SSS'], { S: I.MELON_SLICE });
shapeless(I.MELON_SEEDS, 1, [I.MELON_SLICE]);
shapeless(I.PUMPKIN_SEEDS, 4, [B.PUMPKIN]);
shapeless(I.PUMPKIN_PIE, 1, [B.PUMPKIN, I.SUGAR, I.EGG]);
shaped(I.BOWL, 4, ['P P', ' P '], { P: B.PLANKS });
shapeless(I.BEETROOT_SOUP, 1, [I.BOWL, I.BEETROOT, I.BEETROOT, I.BEETROOT, I.BEETROOT, I.BEETROOT, I.BEETROOT]);
shapeless(I.MUSHROOM_STEW, 1, [I.BOWL, B.RED_MUSHROOM, B.BROWN_MUSHROOM]);
shaped(I.RABBIT_STEW, 1, [' B ', 'CRM', ' P '], { B: I.BOWL, C: I.CARROT, R: I.COOKED_RABBIT, M: B.BROWN_MUSHROOM, P: I.BAKED_POTATO });
shapeless(I.COOKIE, 8, [I.WHEAT, I.COCOA_BEANS]);
shaped(I.CAKE, 1, ['MMM', 'SES', 'WWW'], { M: I.MILK_BUCKET, S: I.SUGAR, E: I.EGG, W: I.WHEAT });
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
// Six sticks and one smooth stone slab: three across the top, one in the middle, and one on each side of the slab.
const SMOOTH_STONE = BUILD_MATERIALS.length + MASONRY.findIndex((row) => row.spec.name === 'smooth_stone');
shaped(I.ARMOR_STAND, 1, ['SSS', ' S ', 'S#S'], { S: I.STICK, '#': slabId(SMOOTH_STONE, false) });
// Three sticks along a diagonal and the line hanging from the tip (it may be made the other way round too).
shaped(I.FISHING_ROD, 1, ['  S', ' S#', 'S #'], { S: I.STICK, '#': I.STRING });

// ---- dressing: glass, cloth, stone, candles, banners, pots and signs ----
for (let c = 0; c < DYE_NAMES.length; c++) {
  const dye = dyeId(c);
  shaped(DRESS.glass + c, 8, ['GGG', 'GDG', 'GGG'], { G: B.GLASS, D: dye });
  shaped(DRESS.pane + c, 16, ['GGG', 'GGG'], { G: DRESS.glass + c });
  shaped(DRESS.carpet + c, 3, ['WW'], { W: woolId(c) });
  shapeless(DRESS.concrete + c, 8, [B.SAND, B.SAND, B.SAND, B.SAND, B.GRAVEL, B.GRAVEL, B.GRAVEL, B.GRAVEL, dye]);
  const clay = terracottaOf(c);
  if (clay) shapeless(clay, 1, [B.TERRACOTTA, dye]);
  shaped(DRESS.bannerFloor + c * 4, 1, ['WWW', 'WWW', ' S '], { W: woolId(c), S: I.STICK });
  shapeless(DRESS.dyeCandle + c * 4, 1, [DRESS.plainCandle, dye]);
}
shaped(DRESS.crackedStoneSlab, 6, ['MMM'], { M: DRESS.crackedStone });
shaped(DRESS.crackedStoneStair, 4, ['M  ', 'MM ', 'MMM'], { M: DRESS.crackedStone });
shaped(DRESS.crackedStoneWall, 6, ['WWW', 'WWW'], { W: DRESS.crackedStone });
shaped(DRESS.chiseledStone, 1, ['S', 'S'], { S: slabId(4, false) });
shaped(DRESS.crackedDeepslateSlab, 6, ['MMM'], { M: DRESS.crackedDeepslate });
shaped(DRESS.crackedDeepslateStair, 4, ['M  ', 'MM ', 'MMM'], { M: DRESS.crackedDeepslate });
shaped(DRESS.crackedDeepslateWall, 6, ['WWW', 'WWW'], { W: DRESS.crackedDeepslate });
shaped(DRESS.chiseledDeepslate, 1, ['S', 'S'], { S: idByName('deepslate_bricks_slab') });
shaped(DRESS.ironBars, 16, ['III', 'III'], { I: I.IRON_INGOT });
shaped(DRESS.plainCandle, 1, ['S', 'C'], { S: I.STRING, C: I.COAL });
shapeless(DRESS.pot, 4, [idByName('bricks')]);
for (const s of DRESS.signs) shaped(s.standing, 3, ['PPP', 'PPP', ' S '], { P: idByName(s.plank), S: I.STICK });

// Nether bricks are the plain ones: four of the red nether bricks, squared. Quartz is cut from polished diorite (a square of plain diorite is already polished diorite).
const RED_NETHER = MASONRY.find((row) => row.spec.name === 'red_nether_bricks')!.cubeId;
shaped(CONNECT.netherBricks, 4, ['RR', 'RR'], { R: RED_NETHER });
shaped(CONNECT.netherSlab, 6, ['NNN'], { N: CONNECT.netherBricks });
shaped(CONNECT.netherStair, 4, ['N  ', 'NN ', 'NNN'], { N: CONNECT.netherBricks });
shaped(CONNECT.netherStair, 4, ['  N', ' NN', 'NNN'], { N: CONNECT.netherBricks });
shaped(CONNECT.netherWall, 6, ['WWW', 'WWW'], { W: CONNECT.netherBricks });
shaped(CONNECT.quartz, 4, ['DD', 'DD'], { D: idByName('polished_diorite') });
shaped(CONNECT.quartzSlab, 6, ['QQQ'], { Q: CONNECT.quartz });
shaped(CONNECT.quartzStair, 4, ['Q  ', 'QQ ', 'QQQ'], { Q: CONNECT.quartz });
shaped(CONNECT.quartzStair, 4, ['  Q', ' QQ', 'QQQ'], { Q: CONNECT.quartz });
shaped(CONNECT.quartzPillar, 2, ['Q', 'Q'], { Q: CONNECT.quartz });

// ---- The World Beyond: what its woods and stones can be made into (the rest is found, not crafted) ----
shapeless(BB.redwood_planks, 4, [BB.redwood_log]);
shapeless(BB.palm_planks, 4, [BB.palm_log]);
shapeless(B.PLANKS, 4, [BB.ebon_log]);
shapeless(B.PLANKS, 4, [BB.worldroot_log]);
for (const s of BEYOND_SHAPES) {
  const at = BEYOND.shape[s.key];
  const src = BB[s.key];
  shaped(at.slab, 6, ['MMM'], { M: src });
  shaped(at.stair, 4, ['M  ', 'MM ', 'MMM'], { M: src });
  shaped(at.stair, 4, ['  M', ' MM', 'MMM'], { M: src });
  if (s.wall) shaped(at.wall, 6, ['WWW', 'WWW'], { W: src });
}
shaped(BB.ancient_bricks, 4, ['LL', 'LL'], { L: BB.limestone });
shaped(BB.polished_marble, 4, ['MM', 'MM'], { M: BB.marble });
shaped(BB.marble_bricks, 4, ['PP', 'PP'], { P: BB.polished_marble });
shapeless(BB.mossy_ancient_bricks, 1, [BB.ancient_bricks, B.MOSS_BLOCK]);
shapeless(BB.mossy_stone, 1, [B.STONE, B.MOSS_BLOCK]);
shapeless(BB.cracked_ancient_bricks, 1, [BB.ancient_bricks, I.FLINT]);
shaped(BB.carved_ancient_stone, 1, ['A', 'A'], { A: BB.ancient_bricks });
shaped(BB.obsidian_bricks, 4, ['OO', 'OO'], { O: B.OBSIDIAN });
shaped(BB.bone_block, 1, ['BBB', 'BBB', 'BBB'], { B: I.BONE });
shapeless(I.BONE, 9, [BB.bone_block]);

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
