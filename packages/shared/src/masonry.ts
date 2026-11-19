/**
 * The slabs, stairs and walls beyond the five original materials (wood, cobble, stone, sandstone, stone brick).
 * A row either cuts an existing block (`from`) or adds the full block the shapes are crafted from (`block`).
 * Ids start at 1246, after the campfire. Connections of a wall are not stored: the mesh looks at the neighbours.
 */

export type MasonryRGB = [number, number, number];

/** New tiles. Existing tiles (wool, andesite, cobble, …) are named on the row and are not in here. */
export const MASONRY_TILE_RGB: Record<string, MasonryRGB> = {
  birch_planks: [196, 179, 123],
  spruce_planks: [114, 84, 48],
  jungle_planks: [160, 115, 80],
  acacia_planks: [168, 90, 50],
  dark_oak_planks: [66, 43, 20],
  cherry_planks: [226, 178, 172],
  poplar_planks: [214, 206, 175],
  bricks: [150, 96, 80],
  mossy_stone_bricks: [110, 118, 90],
  deepslate_bricks: [70, 70, 74],
  deepslate_tiles: [54, 54, 58],
  polished_deepslate: [72, 72, 76],
  tuff_bricks: [130, 122, 100],
  polished_tuff: [160, 154, 136],
  polished_andesite: [180, 180, 176],
  polished_diorite: [220, 220, 218],
  polished_granite: [160, 114, 98],
  cut_sandstone: [218, 206, 158],
  cut_red_sandstone: [186, 100, 52],
  smooth_stone: [158, 158, 158],
  cinnabar: [176, 48, 40],
  cinnabar_bricks: [150, 40, 36],
  polished_cinnabar: [198, 70, 58],
  sulfur: [214, 198, 64],
  sulfur_bricks: [186, 170, 48],
  polished_sulfur: [230, 216, 90],
  resin_bricks: [196, 112, 40],
  red_nether_bricks: [72, 8, 12],
};

export interface MasonrySpec {
  /** Prefix of the shape items: `birch` becomes `birch_slab`. */
  name: string;
  /** Existing block this row is cut from. */
  from?: string;
  /** Full block this row adds. The shapes are crafted from it. */
  block?: string;
  tile: string;
  top?: string;
  side?: string;
  bottom?: string;
  slab: boolean;
  stair: boolean;
  wall: boolean;
  sound: 'wood' | 'stone' | 'grass';
  hardness: number;
  tool: 'axe' | 'pickaxe' | null;
  harvest: number;
  /** Planks, slabs and stairs of this row burn. */
  wood?: boolean;
  /** One of this block makes four planks. */
  planks?: string;
  /** Four of this, in a square, make four of the new block. */
  square?: string;
  /** Three of this in a row make one of the new block. */
  row3?: string;
  /** Shapeless ingredients for one of the new block. */
  shapeless?: readonly string[];
  /** Smelting this block makes the new block. */
  smelt?: string;
  /** Smelting this item makes the slab. Used when there is no full block. */
  smeltSlab?: string;
}

const plank = (name: string, log: string): MasonrySpec => ({
  name,
  block: `${name}_planks`,
  tile: `${name}_planks`,
  planks: log,
  slab: true,
  stair: true,
  wall: false,
  sound: 'wood',
  hardness: 2,
  tool: 'axe',
  harvest: 0,
  wood: true,
});

const wool = (name: string, from: string, tile: string): MasonrySpec => ({
  name,
  from,
  tile,
  slab: true,
  stair: true,
  wall: false,
  sound: 'grass',
  hardness: 0.8,
  tool: null,
  harvest: 0,
});

const stone = (name: string, from: string, tile: string, over: Partial<MasonrySpec> = {}): MasonrySpec => ({
  name,
  from,
  tile,
  slab: true,
  stair: true,
  wall: true,
  sound: 'stone',
  hardness: 1.5,
  tool: 'pickaxe',
  harvest: 1,
  ...over,
});

const born = (name: string, over: Partial<MasonrySpec> = {}): MasonrySpec => ({
  name,
  block: name,
  tile: name,
  slab: true,
  stair: true,
  wall: true,
  sound: 'stone',
  hardness: 1.5,
  tool: 'pickaxe',
  harvest: 1,
  ...over,
});

const WOOL_COLORS = ['orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'] as const;

export const MASONRY_SPECS: readonly MasonrySpec[] = [
  plank('birch', 'birch_log'),
  plank('spruce', 'spruce_log'),
  plank('jungle', 'jungle_log'),
  plank('acacia', 'acacia_log'),
  plank('dark_oak', 'dark_oak_log'),
  plank('cherry', 'cherry_log'),
  // There is no poplar tree yet. Bone meal bleaches a birch plank into one.
  { ...plank('poplar', ''), planks: undefined, shapeless: ['birch_planks', 'white_dye'] },
  wool('wool', 'wool', 'wool'),
  ...WOOL_COLORS.map((c) => wool(`${c}_wool`, `${c}_wool`, `wool_${c}`)),
  stone('andesite', 'andesite', 'andesite'),
  stone('diorite', 'diorite', 'diorite'),
  stone('granite', 'granite', 'granite'),
  born('bricks', { smelt: 'clay', hardness: 2 }),
  stone('mossy_cobblestone', 'mossy_cobblestone', 'mossy_cobble', { hardness: 2 }),
  born('mossy_stone_bricks', { shapeless: ['stone_bricks', 'moss_block'] }),
  stone('cobbled_deepslate', 'cobbled_deepslate', 'cobbled_deepslate', { hardness: 3.5 }),
  born('polished_deepslate', { square: 'cobbled_deepslate', hardness: 3.5 }),
  born('deepslate_bricks', { square: 'polished_deepslate', hardness: 3.5 }),
  born('deepslate_tiles', { square: 'deepslate_bricks', hardness: 3.5 }),
  stone('tuff', 'tuff', 'tuff'),
  born('polished_tuff', { square: 'tuff' }),
  born('tuff_bricks', { square: 'polished_tuff' }),
  born('polished_andesite', { square: 'andesite', wall: false }),
  born('polished_diorite', { square: 'diorite', wall: false }),
  born('polished_granite', { square: 'granite', wall: false }),
  // A wall for the materials that already have a slab and stairs.
  stone('cobblestone', 'cobblestone', 'cobble', { slab: false, stair: false, hardness: 2 }),
  stone('sandstone', 'sandstone', 'sandstone_side', { slab: false, stair: false, top: 'sandstone_top', bottom: 'sandstone_top', side: 'sandstone_side', hardness: 0.8 }),
  stone('stone_brick', 'stone_bricks', 'stone_bricks', { slab: false, stair: false }),
  stone('red_sandstone', 'red_sandstone', 'red_sandstone_side', { top: 'red_sandstone_top', bottom: 'red_sandstone_top', side: 'red_sandstone_side', hardness: 0.8 }),
  born('smooth_sandstone', { smelt: 'sandstone', tile: 'sandstone_top', wall: false, hardness: 0.8 }),
  born('smooth_red_sandstone', { smelt: 'red_sandstone', tile: 'red_sandstone_top', wall: false, hardness: 0.8 }),
  born('cut_sandstone', { square: 'sandstone', stair: false, wall: false, hardness: 0.8 }),
  born('cut_red_sandstone', { square: 'red_sandstone', stair: false, wall: false, hardness: 0.8 }),
  born('smooth_stone', { smelt: 'stone', stair: false, wall: false }),
  // Heat turns a wooden slab to stone. There is no petrified oak block, so two of them do not join.
  {
    name: 'petrified_oak',
    tile: 'planks',
    slab: true,
    stair: false,
    wall: false,
    sound: 'stone',
    hardness: 1.5,
    tool: 'pickaxe',
    harvest: 1,
    smeltSlab: 'wooden_slab',
  },
  // Red dye on a red sandstone. (A square of it is already cut red sandstone, and three in a row are a slab.)
  born('cinnabar', { shapeless: ['red_sandstone', 'red_dye'] }),
  born('polished_cinnabar', { square: 'cinnabar' }),
  born('cinnabar_bricks', { square: 'polished_cinnabar' }),
  // Three sand in a row: a square of sand is already sandstone.
  born('sulfur', { row3: 'sand' }),
  born('polished_sulfur', { square: 'sulfur' }),
  born('sulfur_bricks', { square: 'polished_sulfur' }),
  born('resin_bricks', { square: 'slimeball' }),
  born('red_nether_bricks', { square: 'red_terracotta' }),
];

export interface MasonryRow {
  spec: MasonrySpec;
  index: number;
  /** Block the shapes are crafted from. 0 when the row is only a slab. Filled in for `from` rows while the registry is built. */
  blockId: number;
  cubeId: number;
  slabBase: number;
  stairBase: number;
  wallId: number;
}

/** First id used by these blocks. The campfire occupies 1238..1245. */
export const MASONRY_BASE = 1246;

export function layoutMasonry(specs: readonly MasonrySpec[], base = MASONRY_BASE): { rows: MasonryRow[]; next: number } {
  let n = base;
  const rows: MasonryRow[] = specs.map((spec, index) => {
    const cubeId = spec.block ? n++ : 0;
    const slabBase = spec.slab ? n : -1;
    if (spec.slab) n += 2;
    const stairBase = spec.stair ? n : -1;
    if (spec.stair) n += 8;
    const wallId = spec.wall ? n++ : 0;
    return { spec, index, blockId: cubeId, cubeId, slabBase, stairBase, wallId };
  });
  return { rows, next: n };
}
