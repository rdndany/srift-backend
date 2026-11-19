/**
 * The blocks of The World Beyond: the stones, soils, woods, minerals, crystals, corals and glowing plants that its biomes are
 * made of. This file is pure data (no imports from blocks.ts, which lays them out and registers them), so it can be read by
 * the world generator, the texture painters and the tests alike.
 *
 * Ids are laid out in one fixed order starting at the first id left free after the chests, and they only ever grow at the END of the
 * lists below: a saved world stores block ids, so an id may never move. The tests pin the first and last ones.
 */

export type BeyondRGB = readonly [number, number, number];

/** How a procedural tile is painted (the painters live in the web app, `beyondTiles.ts`). */
export type BeyondTileKind =
  | 'stone' | 'strata' | 'veined' | 'bricks' | 'carved' | 'mossy' | 'salt' | 'frost' | 'ember' | 'soft' | 'sand' | 'peat'
  | 'ore' | 'crystal' | 'mineral' | 'coral' | 'bark' | 'rings' | 'planks' | 'leaves' | 'fronds' | 'grass_top' | 'grass_side' | 'turf_top'
  | 'cluster' | 'plant' | 'glow_plant' | 'tall_grass' | 'kelp' | 'weed' | 'vines' | 'cap' | 'stem' | 'bone' | 'glassy' | 'spark' | 'ice' | 'moss';

export interface BeyondTile {
  rgb: BeyondRGB;
  kind: BeyondTileKind;
  /** A second colour: the vein, the speck, the flower, the glow. */
  accent?: BeyondRGB;
}

export type BeyondSound = 'stone' | 'wood' | 'grass' | 'dirt' | 'sand' | 'glass' | 'gravel' | 'snow' | 'leaves';
type Tool = 'pickaxe' | 'axe' | 'shovel' | 'hoe';

/** How a cube's faces are named: one tile, a log (`_top` and `_side`) or a grass block (`_top` and `_side`, dirt below). */
type Faces = 'one' | 'log' | 'grass';

export interface BeyondCube {
  key: string;
  faces: Faces;
  tile: BeyondTile;
  /** The second tile of a log (the bark) or grass block (the side); the first is the end or top. */
  side?: BeyondTile;
  tool: Tool;
  hardness: number;
  harvest: number;
  sound: BeyondSound;
  light?: number;
  translucent?: boolean;
  /** A leaf block: it hangs on a tree, is cut by shears, and is not tinted by the biome. */
  leaf?: boolean;
  /** A log: it can lie on its side, and burns. */
  log?: boolean;
  /** Planks and wood: burns, and fuels a furnace. */
  wood?: boolean;
}

export interface BeyondPlant {
  key: string;
  tile: BeyondTile;
  light?: number;
  sound?: BeyondSound;
}

const c = (r: number, g: number, b: number): BeyondRGB => [r, g, b];
const t = (kind: BeyondTileKind, rgb: BeyondRGB, accent?: BeyondRGB): BeyondTile => ({ kind, rgb, accent });

/** Full blocks, in id order. Never reorder: only append. */
export const BEYOND_CUBES: readonly BeyondCube[] = [
  // ---- stones
  { key: 'limestone', faces: 'one', tile: t('stone', c(214, 206, 182)), tool: 'pickaxe', hardness: 1.4, harvest: 1, sound: 'stone' },
  { key: 'slate', faces: 'one', tile: t('strata', c(86, 94, 108), c(60, 66, 78)), tool: 'pickaxe', hardness: 2.2, harvest: 1, sound: 'stone' },
  { key: 'marble', faces: 'one', tile: t('veined', c(234, 233, 238), c(150, 154, 170)), tool: 'pickaxe', hardness: 1.6, harvest: 1, sound: 'stone' },
  { key: 'basalt', faces: 'one', tile: t('stone', c(64, 66, 74)), tool: 'pickaxe', hardness: 2.6, harvest: 1, sound: 'stone' },
  { key: 'volcanic_rock', faces: 'one', tile: t('ember', c(52, 40, 40), c(214, 96, 36)), tool: 'pickaxe', hardness: 2.8, harvest: 1, sound: 'stone' },
  { key: 'charred_stone', faces: 'one', tile: t('stone', c(36, 34, 38)), tool: 'pickaxe', hardness: 2.4, harvest: 1, sound: 'stone' },
  { key: 'frosted_stone', faces: 'one', tile: t('frost', c(168, 190, 206), c(236, 246, 255)), tool: 'pickaxe', hardness: 1.8, harvest: 1, sound: 'stone' },
  { key: 'mossy_stone', faces: 'one', tile: t('mossy', c(118, 120, 116), c(78, 128, 64)), tool: 'pickaxe', hardness: 1.6, harvest: 1, sound: 'stone' },
  { key: 'ancient_bricks', faces: 'one', tile: t('bricks', c(126, 116, 98), c(66, 60, 52)), tool: 'pickaxe', hardness: 2.4, harvest: 1, sound: 'stone' },
  { key: 'mossy_ancient_bricks', faces: 'one', tile: t('bricks', c(104, 112, 84), c(54, 64, 44)), tool: 'pickaxe', hardness: 2.4, harvest: 1, sound: 'stone' },
  { key: 'cracked_ancient_bricks', faces: 'one', tile: t('bricks', c(118, 108, 92), c(34, 30, 26)), tool: 'pickaxe', hardness: 2.2, harvest: 1, sound: 'stone' },
  { key: 'carved_ancient_stone', faces: 'one', tile: t('carved', c(134, 124, 104), c(70, 64, 54)), tool: 'pickaxe', hardness: 2.6, harvest: 1, sound: 'stone' },
  { key: 'polished_marble', faces: 'one', tile: t('carved', c(242, 242, 246), c(196, 198, 210)), tool: 'pickaxe', hardness: 1.8, harvest: 1, sound: 'stone' },
  { key: 'marble_bricks', faces: 'one', tile: t('bricks', c(236, 236, 240), c(166, 168, 182)), tool: 'pickaxe', hardness: 1.8, harvest: 1, sound: 'stone' },
  { key: 'obsidian_bricks', faces: 'one', tile: t('bricks', c(26, 18, 40), c(10, 6, 18)), tool: 'pickaxe', hardness: 40, harvest: 4, sound: 'stone' },
  { key: 'weathered_obsidian', faces: 'one', tile: t('spark', c(36, 26, 56), c(120, 70, 190)), tool: 'pickaxe', hardness: 36, harvest: 4, sound: 'stone' },
  { key: 'petrified_log', faces: 'log', tile: t('rings', c(158, 148, 134)), side: t('bark', c(140, 130, 118), c(96, 90, 80)), tool: 'pickaxe', hardness: 2.4, harvest: 1, sound: 'stone', log: true },
  { key: 'skystone', faces: 'one', tile: t('stone', c(206, 214, 228)), tool: 'pickaxe', hardness: 2, harvest: 1, sound: 'stone' },
  { key: 'stormstone', faces: 'one', tile: t('spark', c(66, 76, 108), c(150, 200, 255)), tool: 'pickaxe', hardness: 3, harvest: 2, sound: 'stone', light: 4 },
  { key: 'fossil_rock', faces: 'one', tile: t('bone', c(168, 154, 128), c(236, 228, 206)), tool: 'pickaxe', hardness: 1.8, harvest: 1, sound: 'stone' },
  { key: 'bone_block', faces: 'one', tile: t('bone', c(228, 222, 202), c(190, 182, 160)), tool: 'pickaxe', hardness: 1.2, harvest: 0, sound: 'stone' },
  // ---- salt, ice, ash, sands and soils
  { key: 'salt_block', faces: 'one', tile: t('salt', c(240, 238, 232), c(214, 214, 210)), tool: 'pickaxe', hardness: 0.8, harvest: 0, sound: 'stone' },
  { key: 'blue_ice', faces: 'one', tile: t('ice', c(122, 176, 242), c(206, 232, 255)), tool: 'pickaxe', hardness: 2.6, harvest: 0, sound: 'glass' },
  { key: 'permafrost', faces: 'one', tile: t('frost', c(116, 106, 96), c(210, 226, 236)), tool: 'shovel', hardness: 1.2, harvest: 0, sound: 'gravel' },
  { key: 'ash_block', faces: 'one', tile: t('soft', c(92, 90, 90)), tool: 'shovel', hardness: 0.4, harvest: 0, sound: 'sand' },
  { key: 'white_sand', faces: 'one', tile: t('sand', c(234, 230, 214)), tool: 'shovel', hardness: 0.5, harvest: 0, sound: 'sand' },
  { key: 'black_sand', faces: 'one', tile: t('sand', c(44, 42, 48)), tool: 'shovel', hardness: 0.5, harvest: 0, sound: 'sand' },
  { key: 'crystal_sand', faces: 'one', tile: t('glassy', c(238, 214, 150), c(255, 244, 200)), tool: 'pickaxe', hardness: 0.8, harvest: 0, sound: 'glass' },
  { key: 'peat', faces: 'one', tile: t('peat', c(64, 48, 36), c(40, 30, 22)), tool: 'shovel', hardness: 0.6, harvest: 0, sound: 'dirt' },
  { key: 'golden_grass_block', faces: 'grass', tile: t('turf_top', c(190, 170, 80)), side: t('grass_side', c(190, 170, 80)), tool: 'shovel', hardness: 0.6, harvest: 0, sound: 'grass' },
  { key: 'dead_grass_block', faces: 'grass', tile: t('turf_top', c(128, 112, 80)), side: t('grass_side', c(128, 112, 80)), tool: 'shovel', hardness: 0.6, harvest: 0, sound: 'grass' },
  { key: 'tundra_turf', faces: 'grass', tile: t('turf_top', c(122, 134, 104)), side: t('grass_side', c(122, 134, 104)), tool: 'shovel', hardness: 0.6, harvest: 0, sound: 'grass' },
  { key: 'luminous_moss', faces: 'one', tile: t('moss', c(52, 168, 140), c(160, 255, 220)), tool: 'shovel', hardness: 0.2, harvest: 0, sound: 'grass', light: 6 },
  // ---- ores and minerals
  { key: 'crystal_ore', faces: 'one', tile: t('ore', c(150, 120, 255), c(205, 190, 255)), tool: 'pickaxe', hardness: 3.4, harvest: 3, sound: 'glass', light: 5 },
  { key: 'malachite', faces: 'one', tile: t('mineral', c(34, 150, 96), c(120, 220, 160)), tool: 'pickaxe', hardness: 2.2, harvest: 1, sound: 'stone' },
  { key: 'cinnabar_ore', faces: 'one', tile: t('mineral', c(176, 40, 40), c(240, 110, 90)), tool: 'pickaxe', hardness: 2.2, harvest: 1, sound: 'stone' },
  { key: 'azurite', faces: 'one', tile: t('mineral', c(36, 78, 186), c(120, 160, 240)), tool: 'pickaxe', hardness: 2.2, harvest: 1, sound: 'stone' },
  { key: 'sulfur_ore', faces: 'one', tile: t('mineral', c(226, 204, 56), c(255, 240, 130)), tool: 'pickaxe', hardness: 1.4, harvest: 1, sound: 'stone' },
  { key: 'jade', faces: 'one', tile: t('mineral', c(86, 176, 130), c(180, 240, 200)), tool: 'pickaxe', hardness: 2.6, harvest: 2, sound: 'stone' },
  { key: 'azure_crystal', faces: 'one', tile: t('crystal', c(90, 170, 255), c(230, 245, 255)), tool: 'pickaxe', hardness: 1.6, harvest: 1, sound: 'glass', light: 8, translucent: true },
  { key: 'rose_crystal', faces: 'one', tile: t('crystal', c(255, 130, 190), c(255, 225, 240)), tool: 'pickaxe', hardness: 1.6, harvest: 1, sound: 'glass', light: 8, translucent: true },
  { key: 'verdant_crystal', faces: 'one', tile: t('crystal', c(90, 235, 150), c(225, 255, 235)), tool: 'pickaxe', hardness: 1.6, harvest: 1, sound: 'glass', light: 8, translucent: true },
  { key: 'amber_crystal', faces: 'one', tile: t('crystal', c(255, 190, 60), c(255, 240, 190)), tool: 'pickaxe', hardness: 1.6, harvest: 1, sound: 'glass', light: 8, translucent: true },
  // ---- coral blocks
  { key: 'coral_block_pink', faces: 'one', tile: t('coral', c(236, 106, 160), c(255, 170, 205)), tool: 'pickaxe', hardness: 1.2, harvest: 0, sound: 'stone' },
  { key: 'coral_block_red', faces: 'one', tile: t('coral', c(214, 58, 62), c(255, 120, 110)), tool: 'pickaxe', hardness: 1.2, harvest: 0, sound: 'stone' },
  { key: 'coral_block_blue', faces: 'one', tile: t('coral', c(52, 110, 224), c(130, 180, 255)), tool: 'pickaxe', hardness: 1.2, harvest: 0, sound: 'stone' },
  { key: 'coral_block_yellow', faces: 'one', tile: t('coral', c(236, 200, 52), c(255, 238, 130)), tool: 'pickaxe', hardness: 1.2, harvest: 0, sound: 'stone' },
  { key: 'coral_block_purple', faces: 'one', tile: t('coral', c(150, 66, 206), c(205, 140, 250)), tool: 'pickaxe', hardness: 1.2, harvest: 0, sound: 'stone' },
  { key: 'dead_coral_block', faces: 'one', tile: t('coral', c(140, 136, 128), c(176, 172, 164)), tool: 'pickaxe', hardness: 1.2, harvest: 0, sound: 'stone' },
  // ---- woods and leaves
  { key: 'redwood_log', faces: 'log', tile: t('rings', c(150, 82, 56)), side: t('bark', c(122, 62, 42), c(84, 40, 28)), tool: 'axe', hardness: 2.2, harvest: 0, sound: 'wood', log: true, wood: true },
  { key: 'redwood_planks', faces: 'one', tile: t('planks', c(164, 88, 62), c(110, 56, 40)), tool: 'axe', hardness: 2, harvest: 0, sound: 'wood', wood: true },
  { key: 'redwood_leaves', faces: 'one', tile: t('leaves', c(46, 112, 58), c(26, 76, 40)), tool: 'axe', hardness: 0.2, harvest: 0, sound: 'leaves', leaf: true },
  { key: 'palm_log', faces: 'log', tile: t('rings', c(196, 168, 112)), side: t('bark', c(176, 150, 104), c(122, 100, 68)), tool: 'axe', hardness: 2, harvest: 0, sound: 'wood', log: true, wood: true },
  { key: 'palm_planks', faces: 'one', tile: t('planks', c(214, 184, 120), c(150, 124, 78)), tool: 'axe', hardness: 2, harvest: 0, sound: 'wood', wood: true },
  { key: 'palm_fronds', faces: 'one', tile: t('fronds', c(76, 158, 60), c(40, 104, 40)), tool: 'axe', hardness: 0.2, harvest: 0, sound: 'leaves', leaf: true },
  { key: 'ebon_log', faces: 'log', tile: t('rings', c(52, 44, 70)), side: t('bark', c(34, 28, 48), c(18, 14, 28)), tool: 'axe', hardness: 2.6, harvest: 0, sound: 'wood', log: true, wood: true },
  { key: 'ebon_leaves', faces: 'one', tile: t('leaves', c(40, 30, 74), c(70, 120, 170)), tool: 'axe', hardness: 0.2, harvest: 0, sound: 'leaves', leaf: true, light: 2 },
  { key: 'worldroot_log', faces: 'log', tile: t('rings', c(150, 112, 70)), side: t('bark', c(104, 76, 48), c(58, 120, 78)), tool: 'axe', hardness: 3, harvest: 0, sound: 'wood', log: true, wood: true },
  { key: 'worldroot_leaves', faces: 'one', tile: t('leaves', c(60, 176, 120), c(180, 255, 210)), tool: 'axe', hardness: 0.2, harvest: 0, sound: 'leaves', leaf: true, light: 5 },
  { key: 'autumn_leaves_red', faces: 'one', tile: t('leaves', c(184, 56, 36), c(120, 30, 24)), tool: 'axe', hardness: 0.2, harvest: 0, sound: 'leaves', leaf: true },
  { key: 'autumn_leaves_orange', faces: 'one', tile: t('leaves', c(218, 118, 36), c(160, 80, 24)), tool: 'axe', hardness: 0.2, harvest: 0, sound: 'leaves', leaf: true },
  { key: 'autumn_leaves_yellow', faces: 'one', tile: t('leaves', c(226, 190, 52), c(170, 134, 36)), tool: 'axe', hardness: 0.2, harvest: 0, sound: 'leaves', leaf: true },
  { key: 'frosted_leaves', faces: 'one', tile: t('leaves', c(172, 214, 226), c(236, 250, 255)), tool: 'axe', hardness: 0.2, harvest: 0, sound: 'leaves', leaf: true },
  { key: 'silver_leaves', faces: 'one', tile: t('leaves', c(188, 200, 224), c(236, 240, 255)), tool: 'axe', hardness: 0.2, harvest: 0, sound: 'leaves', leaf: true, light: 3 },
  { key: 'dream_leaves', faces: 'one', tile: t('leaves', c(176, 134, 224), c(236, 200, 255)), tool: 'axe', hardness: 0.2, harvest: 0, sound: 'leaves', leaf: true, light: 2 },
  { key: 'luminous_leaves', faces: 'one', tile: t('leaves', c(50, 190, 170), c(200, 255, 240)), tool: 'axe', hardness: 0.2, harvest: 0, sound: 'leaves', leaf: true, light: 7 },
  // ---- mushrooms
  { key: 'glowshroom_cap', faces: 'one', tile: t('cap', c(60, 200, 190), c(220, 255, 250)), tool: 'axe', hardness: 0.4, harvest: 0, sound: 'wood', light: 9 },
  { key: 'glowshroom_stem', faces: 'one', tile: t('stem', c(196, 224, 220), c(130, 170, 170)), tool: 'axe', hardness: 0.4, harvest: 0, sound: 'wood', light: 3 },
  { key: 'spore_cap', faces: 'one', tile: t('cap', c(176, 90, 200), c(240, 190, 255)), tool: 'axe', hardness: 0.4, harvest: 0, sound: 'wood', light: 5 },
];

/** Plants that stand in a cell and are walked through, in id order (after the cubes). Never reorder: only append. */
export const BEYOND_PLANTS: readonly BeyondPlant[] = [
  { key: 'kelp', tile: t('kelp', c(54, 130, 60), c(110, 180, 80)) },
  { key: 'seagrass', tile: t('weed', c(60, 150, 84)) },
  { key: 'luminous_fern', tile: t('glow_plant', c(60, 200, 160), c(200, 255, 235)), light: 7 },
  { key: 'glow_bloom', tile: t('glow_plant', c(250, 120, 210), c(255, 230, 250)), light: 9 },
  { key: 'moonpetal', tile: t('glow_plant', c(180, 200, 255), c(255, 255, 255)), light: 6 },
  { key: 'glowshroom', tile: t('glow_plant', c(70, 210, 200), c(230, 255, 250)), light: 8 },
  { key: 'coral_fan_pink', tile: t('weed', c(236, 120, 170)) },
  { key: 'coral_fan_blue', tile: t('weed', c(70, 120, 230)) },
  { key: 'succulent', tile: t('plant', c(96, 170, 120), c(240, 120, 150)) },
  { key: 'golden_grass', tile: t('tall_grass', c(214, 184, 84)) },
  { key: 'heather', tile: t('plant', c(110, 130, 80), c(176, 90, 190)) },
  { key: 'lavender', tile: t('plant', c(96, 140, 84), c(150, 110, 220)) },
  { key: 'azure_cluster', tile: t('cluster', c(90, 170, 255), c(230, 245, 255)), light: 7, sound: 'glass' },
  { key: 'rose_cluster', tile: t('cluster', c(255, 130, 190), c(255, 225, 240)), light: 7, sound: 'glass' },
  { key: 'vines', tile: t('vines', c(60, 128, 52)) },
  { key: 'dead_shrub', tile: t('plant', c(120, 100, 72), c(90, 74, 52)) },
  { key: 'pampas_grass', tile: t('tall_grass', c(226, 214, 168)) },
  { key: 'sea_lantern_bloom', tile: t('glow_plant', c(90, 190, 240), c(220, 250, 255)), light: 10 },
];

/** Materials that also come as slabs, stairs and (for the stones) walls. Never reorder: only append. */
export const BEYOND_SHAPES: readonly { key: string; wall: boolean; wood: boolean }[] = [
  { key: 'limestone', wall: true, wood: false },
  { key: 'marble', wall: true, wood: false },
  { key: 'slate', wall: true, wood: false },
  { key: 'basalt', wall: true, wood: false },
  { key: 'ancient_bricks', wall: true, wood: false },
  { key: 'redwood_planks', wall: false, wood: true },
  { key: 'palm_planks', wall: false, wood: true },
  { key: 'marble_bricks', wall: true, wood: false },
];

/** Ids a material takes: two slabs (bottom, top), eight stairs and a wall (reserved even for the woods). */
export const BEYOND_SHAPE_SPAN = 11;

export interface BeyondLayout {
  base: number;
  /** key -> id for every cube and plant. */
  id: Record<string, number>;
  /** key -> { slab, stair, wall } of the shaped materials. */
  shape: Record<string, { slab: number; stair: number; wall: number }>;
  /** First id after everything. */
  next: number;
}

export function layoutBeyond(base: number): BeyondLayout {
  const id: Record<string, number> = {};
  let n = base;
  for (const cube of BEYOND_CUBES) id[cube.key] = n++;
  for (const plant of BEYOND_PLANTS) id[plant.key] = n++;
  const shape: Record<string, { slab: number; stair: number; wall: number }> = {};
  for (const s of BEYOND_SHAPES) {
    shape[s.key] = { slab: n, stair: n + 2, wall: n + 10 };
    n += BEYOND_SHAPE_SPAN;
  }
  return { base, id, shape, next: n };
}

/** Every tile of the set by name, for the atlas: cubes with several faces name their end and side separately. */
export function beyondTiles(): Record<string, BeyondTile> {
  const out: Record<string, BeyondTile> = {};
  for (const cube of BEYOND_CUBES) {
    if (cube.faces === 'one') out[cube.key] = cube.tile;
    else {
      out[`${cube.key}_top`] = cube.tile;
      out[`${cube.key}_side`] = cube.side ?? cube.tile;
    }
  }
  for (const plant of BEYOND_PLANTS) out[plant.key] = plant.tile;
  return out;
}

/** The tile that names the faces of a shaped material (the cube's own tile). */
export function beyondFaceTile(key: string): string {
  const cube = BEYOND_CUBES.find((b) => b.key === key);
  if (!cube) throw new Error(`unknown beyond block ${key}`);
  return cube.faces === 'one' ? key : `${key}_side`;
}
