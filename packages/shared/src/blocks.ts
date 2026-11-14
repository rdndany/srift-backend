import { ARMOR_MATERIALS, ARMOR_SLOTS, OUTFIT_CLASSES } from './armor';
/**
 * Block registry. Data-driven so the client (mesher, UI, audio) and the server
 * (validation, drops) share one source of truth.
 */

/** The sixteen dye colours, in the original's order (so index 0 is white, which is also plain wool). */
export const DYE_NAMES = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'] as const;
export const DYE_RGB: readonly (readonly [number, number, number])[] = [
  [236, 240, 240],
  [240, 122, 28],
  [192, 76, 182],
  [60, 172, 214],
  [250, 210, 56],
  [124, 190, 30],
  [238, 134, 166],
  [68, 76, 80],
  [154, 154, 148],
  [22, 150, 150],
  [132, 50, 178],
  [58, 66, 164],
  [128, 82, 50],
  [92, 120, 24],
  [172, 46, 38],
  [30, 30, 36],
];
export const DYE_COUNT = DYE_NAMES.length;

/** The colour of the original bed (and of the first bed this game had): red. */
export const BED_RED = DYE_NAMES.indexOf('red');
/** The parts of a bed that have their own texture. */
export const BED_PARTS = ['top_foot', 'top_head', 'side_foot', 'side_head', 'end_foot', 'end_head'] as const;
export type BedPart = (typeof BED_PARTS)[number];
/** The tile of one part of a bed of a colour (red keeps the plain names). */
export function bedTileName(part: BedPart, color: number): string {
  return color === BED_RED ? `bed_${part}` : `bed_${part}_${DYE_NAMES[color]}`;
}

export const BLOCK_TILES = [
  'stone',
  'dirt',
  'grass_top',
  'grass_side',
  'sand',
  'water',
  'log_side',
  'log_top',
  'leaves',
  'bedrock',
  'snow',
  'snow_side',
  'planks',
  'cobble',
  'coal_ore',
  'iron_ore',
  'gold_ore',
  'diamond_ore',
  'gravel',
  'glass',
  'glowstone',
  'crafting_top',
  'crafting_side',
  'furnace_top',
  'furnace_side',
  'chest_top',
  'chest_side',
  'torch',
  'tall_grass',
  'rose',
  'dandelion',
  'farmland_top',
  'wheat_0',
  'wheat_1',
  'wheat_2',
  'wheat_3',
  'sapling',
  'lava',
  'mossy_cobble',
  'spawner',
  'cactus_top',
  'cactus_side',
  'dead_bush',
  'sandstone_top',
  'sandstone_side',
  'granite',
  'diorite',
  'andesite',
  'obsidian',
  'cobweb',
  'rail',
  'rail_z',
  'birch_log_side',
  'birch_log_top',
  'birch_leaves',
  'spruce_log_side',
  'spruce_log_top',
  'spruce_leaves',
  'birch_sapling',
  'spruce_sapling',
  'wool',
  'chiseled_sandstone',
  'ice',
  'bed_top_foot',
  'bed_top_head',
  'bed_side_foot',
  'bed_side_head',
  'bed_end_foot',
  'bed_end_head',
  'stone_bricks',
  'door_lower',
  'door_upper',
  'trapdoor',
  'ladder',
  'lapis_ore',
  ...DYE_NAMES.slice(1).map((n) => `wool_${n}`),
  ...DYE_NAMES.flatMap((_, c) => (c === BED_RED ? [] : BED_PARTS.map((p) => bedTileName(p, c)))),
  'emerald_ore',
  'enchanting_table_top',
  'enchanting_table_side',
  'enchanting_table_bottom',
  'bookshelf',
  'anvil_top',
  'anvil_side',
  // Four frames of flame; they must stay next to each other (the chunk shader cycles through them).
  'fire_0',
  'fire_1',
  'fire_2',
  'fire_3',
  'anvil_side_chipped',
  'anvil_side_damaged',
  'grindstone_top',
  'grindstone_side',
  'tnt_top',
  'tnt_side',
  'tnt_bottom',
  'slime_block',
  'rail_curve',
  'rail_powered',
  'rail_powered_z',
  'redstone_ore',
  'redstone_block',
  'redstone_lamp',
  'redstone_lamp_on',
  'redstone_dot',
  'redstone_dot_on',
  'redstone_line',
  'redstone_line_on',
  'redstone_torch',
  'redstone_torch_off',
  'lever',
  'portal',
  'waystone_top',
  'waystone_side',
  // ---- the new world: ground, rock, wood and plants of the biomes (see worldgen.ts) ----
  'coarse_dirt',
  'podzol_top',
  'podzol_side',
  'mud',
  'clay',
  'red_sand',
  'red_sandstone_top',
  'red_sandstone_side',
  'packed_ice',
  'deepslate',
  'cobbled_deepslate',
  'tuff',
  'mycelium_top',
  'mycelium_side',
  'mushroom_stem',
  'red_mushroom_block',
  'brown_mushroom_block',
  'terracotta',
  'terracotta_orange',
  'terracotta_yellow',
  'terracotta_red',
  'terracotta_white',
  'terracotta_brown',
  'terracotta_light_gray',
  'pumpkin_top',
  'pumpkin_side',
  'melon_top',
  'melon_side',
  'acacia_log_side',
  'acacia_log_top',
  'acacia_leaves',
  'acacia_sapling',
  'jungle_log_side',
  'jungle_log_top',
  'jungle_leaves',
  'jungle_sapling',
  'dark_oak_log_side',
  'dark_oak_log_top',
  'dark_oak_leaves',
  'dark_oak_sapling',
  'cherry_log_side',
  'cherry_log_top',
  'cherry_leaves',
  'cherry_sapling',
  'fern',
  'tulip_red',
  'tulip_orange',
  'tulip_white',
  'tulip_pink',
  'oxeye_daisy',
  'cornflower',
  'allium',
  'azure_bluet',
  'blue_orchid',
  'brown_mushroom',
  'red_mushroom',
  'sugar_cane',
  'lily_pad',
  'pink_petals',
  // ---- the caves: moss and vines, dripstone, geodes, sculk (see caves.ts and worldgen.ts) ----
  'moss_block',
  'cave_vines',
  'cave_vines_berries',
  'flowering_azalea',
  'spore_blossom',
  'dripstone_block',
  'stalagmite_base',
  'stalagmite_tip',
  'stalactite_base',
  'stalactite_tip',
  'glow_lichen',
  'amethyst_block',
  'budding_amethyst',
  'amethyst_cluster',
  'calcite',
  'smooth_basalt',
  'sculk',
] as const;

/** The compass sprite has one picture per needle position (the first is plain `compass`); the needle turns clockwise. */
export const COMPASS_FRAMES = 32;
export const compassTileName = (frame: number): string => {
  const f = ((Math.round(frame) % COMPASS_FRAMES) + COMPASS_FRAMES) % COMPASS_FRAMES;
  return f === 0 ? 'compass' : `compass_${f}`;
};

export const TOOL_KINDS = ['pickaxe', 'axe', 'shovel', 'sword', 'hoe'] as const;
export type ToolKind = (typeof TOOL_KINDS)[number];
export const TOOL_MATERIALS = ['wood', 'stone', 'iron', 'gold', 'diamond'] as const;
export type ToolMaterial = (typeof TOOL_MATERIALS)[number];

/** Flat item sprites that live in the same atlas as block textures. */
export const ITEM_TILES = [
  'stick',
  'coal',
  'iron_ingot',
  'gold_ingot',
  'diamond',
  'apple',
  'raw_meat',
  'cooked_meat',
  ...TOOL_MATERIALS.flatMap((m) => TOOL_KINDS.map((k) => `${m}_${k}`)),
  'rotten_flesh',
  'bone',
  'arrow',
  'gunpowder',
  'wheat_seeds',
  'wheat',
  'bread',
  'flint',
  'string',
  'bow',
  'leather',
  'bucket',
  'water_bucket',
  'lava_bucket',
  'feather',
  'mutton',
  'cooked_mutton',
  'chicken',
  'cooked_chicken',
  'rabbit',
  'cooked_rabbit',
  'ink_sac',
  'slimeball',
  'ender_pearl',
  'spider_eye',
  ...ARMOR_MATERIALS.flatMap((m) => ARMOR_SLOTS.map((slot) => `${m}_${slot}`)),
  'raw_iron',
  'raw_gold',
  'shield',
  'bed',
  'door',
  'fence',
  'fence_gate',
  ...DYE_NAMES.map((n) => `dye_${n}`),
  ...DYE_NAMES.filter((_, c) => c !== BED_RED).map((n) => `bed_${n}`),
  'emerald',
  'paper',
  'book',
  'enchanted_book',
  'flint_and_steel',
  'lapis_lazuli',
  'experience_bottle',
  'shears',
  'minecart',
  'boat',
  'redstone',
  'map',
  'greatsword',
  'dagger',
  'staff',
  'wand',
  'spellbook',
  'crossbow',
  'orb',
  'bow_frame',
  'crossbow_frame',
  'skillbook_warrior',
  'skillbook_mage',
  'skillbook_ranger',
  'bag_1',
  'bag_2',
  'bag_3',
  'bag_4',
  'bag_5',
  'bag_6',
  'emberstone',
  'jewel_dawn',
  'jewel_rift',
  'jewel_bloom',
  'compass',
  ...Array.from({ length: COMPASS_FRAMES - 1 }, (_, i) => `compass_${i + 1}`),
  'horn_fenrir',
  'horn_fenrir_black',
  'horn_fenrir_blue',
  'horn_fenrir_gold',
  ...OUTFIT_CLASSES.flatMap((c) => ARMOR_SLOTS.map((slot) => `outfit_${c}_${slot}`)),
  // lanterns and chains: the side views the mesh is cut from, the lid, and the pictures for the inventory
  'lantern',
  'lantern_hang',
  'soul_lantern',
  'soul_lantern_hang',
  'lantern_top',
  'soul_lantern_top',
  'chain',
  'lantern_item',
  'soul_lantern_item',
  'chain_item',
] as const;

/** All atlas tiles: block textures first (stable indices), then item sprites. */
export const TILE_NAMES: readonly string[] = [...BLOCK_TILES, ...ITEM_TILES];

export type SoundKind = 'none' | 'stone' | 'dirt' | 'grass' | 'sand' | 'gravel' | 'wood' | 'glass' | 'leaves' | 'snow';

/** Texture atlas layout (tiles are square). */
export const ATLAS_COLS = 16;
export const ATLAS_ROWS = 32;
export const TILE_PX = 16;

export function tileIndex(name: string): number {
  const i = TILE_NAMES.indexOf(name);
  if (i < 0) throw new Error(`unknown tile ${name}`);
  return i;
}

/**
 * Room for block ids. The first 256 are the original ids; ids 1000 and up are newer blocks (item id === block id, and
 * items sit between 256 and 999), so a world can hold more kinds than a byte allows.
 */
export const BLOCK_COUNT = 2048;

export const B = {
  AIR: 0,
  STONE: 1,
  DIRT: 2,
  GRASS: 3,
  SAND: 4,
  WATER: 5,
  LOG: 6,
  LEAVES: 7,
  BEDROCK: 8,
  SNOW: 9, // snowy grass block
  PLANKS: 10,
  COBBLE: 11,
  COAL_ORE: 12,
  IRON_ORE: 13,
  GOLD_ORE: 14,
  DIAMOND_ORE: 15,
  GRAVEL: 16,
  GLASS: 17,
  SNOW_BLOCK: 18,
  GLOWSTONE: 19,
  CRAFTING_TABLE: 20,
  FURNACE: 21,
  CHEST: 22,
  /** Standing torch; the four wall variants are named after the side the supporting block is on. */
  TORCH: 23,
  TORCH_PX: 24,
  TORCH_NX: 25,
  TORCH_PZ: 26,
  TORCH_NZ: 27,
  TALL_GRASS: 28,
  ROSE: 29,
  DANDELION: 30,
  FARMLAND: 31,
  /** Wheat growth stages 0 (sprout) .. 3 (ripe). */
  WHEAT_0: 32,
  WHEAT_1: 33,
  WHEAT_2: 34,
  WHEAT_3: 35,
  SAPLING: 36,
  /** Molten rock: a glowing liquid that burns whatever swims in it. Found underground. */
  LAVA: 37,
  MOSSY_COBBLE: 38,
  /** A cage that keeps producing mobs. Found in dungeons; never an item. */
  SPAWNER: 39,
  CACTUS: 40,
  DEAD_BUSH: 41,
  SANDSTONE: 42,
  GRANITE: 43,
  DIORITE: 44,
  ANDESITE: 45,
  /** Made where water meets a lava source; takes a diamond pickaxe. */
  OBSIDIAN: 46,
  /** Slows whatever is stuck in it; drops string. */
  COBWEB: 47,
  /** Flat track pieces, running along X or along Z. */
  RAIL_X: 48,
  RAIL_Z: 49,
  BIRCH_LOG: 50,
  BIRCH_LEAVES: 51,
  SPRUCE_LOG: 52,
  SPRUCE_LEAVES: 53,
  BIRCH_SAPLING: 54,
  SPRUCE_SAPLING: 55,
  WOOL: 56,
  CHISELED_SANDSTONE: 57,
  ICE: 58,
  /**
   * Flowing water: level 1 (next to a source) .. 7 (thinnest). `WATER` itself is the source (level 0)
   * and `WATER_FALL` is water falling straight down.
   */
  WATER_1: 60,
  WATER_2: 61,
  WATER_3: 62,
  WATER_4: 63,
  WATER_5: 64,
  WATER_6: 65,
  WATER_7: 66,
  WATER_FALL: 67,
  /** Flowing lava: level 1..3 (lava only creeps three blocks), then the falling kind. */
  LAVA_1: 68,
  LAVA_2: 69,
  LAVA_3: 70,
  LAVA_FALL: 71,
  /** Beds: eight variants = foot or head half x the way the bed points (from the foot toward the head). */
  BED_FOOT_PX: 72,
  BED_FOOT_NX: 73,
  BED_FOOT_PZ: 74,
  BED_FOOT_NZ: 75,
  BED_HEAD_PX: 76,
  BED_HEAD_NX: 77,
  BED_HEAD_PZ: 78,
  BED_HEAD_NZ: 79,
  /** Building blocks: families of variants (see slabId, stairId, doorId ...), one byte per state. */
  SLAB_BASE: 80,
  STAIR_BASE: 90,
  DOOR_BASE: 130,
  TRAPDOOR_BASE: 146,
  LADDER_BASE: 162,
  FENCE: 166,
  /** Four fence gate ids (167..170, see `gateId`): closed or open, one per axis; the ids freed went to fire, the anvil's wear and the grindstone. */
  GATE_BASE: 167,
  /** An anvil that has been used a while: chipped, then damaged; one more use after that and it breaks. */
  ANVIL_CHIPPED: 171,
  ANVIL_DAMAGED: 172,
  /** Flames on the ground or clinging to something that burns. Never an item; see fire.ts. */
  FIRE: 173,
  /** Takes the enchantments off an item for experience. */
  GRINDSTONE: 174,
  PANE: 175,
  STONE_BRICKS: 176,
  LAPIS_ORE: 177,
  /** Coloured wool: `woolId(colour)` for colour 1..15 (0 is plain wool, `B.WOOL`). */
  WOOL_COLOR_BASE: 178,
  /** Foot halves of the other fifteen bed colours: `bedId(false, dir, colour)`, four directions each (193..252). The head halves are shared. */
  BED_COLOR_BASE: 193,
  /** The only block after the bed colours (193..252); villagers pay in its drop. */
  EMERALD_ORE: 253,
  /** The three ids that were still free (59 sits between ice and the water levels): the enchanting table, the bookshelf and the anvil. */
  ANVIL: 59,
  ENCHANTING_TABLE: 254,
  BOOKSHELF: 255,
  /** From here the ids are new: 1000 and up (chunks hold 16-bit ids; see BLOCK_COUNT). */
  TNT: 1000,
  /** Nine slimeballs; you do not hurt yourself falling onto it, and it bounces you. */
  SLIME_BLOCK: 1001,
  /**
   * The other shapes of a rail. A rail reshapes itself to follow its neighbours (see rails.ts), so the player only ever holds
   * `RAIL_X` or `POWERED_RAIL_X`. Curves are named by the two edges they join; slopes climb towards the named direction.
   */
  RAIL_ES: 1002,
  RAIL_WS: 1003,
  RAIL_WN: 1004,
  RAIL_EN: 1005,
  RAIL_UP_PX: 1006,
  RAIL_UP_NX: 1007,
  RAIL_UP_PZ: 1008,
  RAIL_UP_NZ: 1009,
  /** Gold rails: always live, they push a minecart along (there is no redstone to switch them). */
  POWERED_RAIL_X: 1010,
  POWERED_RAIL_Z: 1011,
  POWERED_UP_PX: 1012,
  POWERED_UP_NX: 1013,
  POWERED_UP_PZ: 1014,
  POWERED_UP_NZ: 1015,
  /** Redstone: the ore (it drops dust), a block that is always on, and the lamp in its two states. */
  REDSTONE_ORE: 1016,
  REDSTONE_BLOCK: 1017,
  LAMP: 1018,
  LAMP_ON: 1019,
  /** Redstone dust: WIRE_BASE + signal strength (0..15). */
  WIRE_BASE: 1020,
  /** Levers, stone buttons and redstone torches: base + face * 2 + (on ? 1 : 0), see mountedInfo. */
  LEVER_BASE: 1040,
  BUTTON_BASE: 1050,
  /** Pressure plates: stone and wooden, each off then on. */
  PLATE_STONE: 1060,
  PLATE_STONE_ON: 1061,
  PLATE_WOOD: 1062,
  PLATE_WOOD_ON: 1063,
  RTORCH_BASE: 1070,
  /** The shimmer in a dungeon portal: walk into it. Part of a made place, never in the inventory. */
  PORTAL: 1080,
  /** The Dawnwatch waystone: a glowing pillar in the middle of the village. Part of a made place, never in the inventory, and it cannot be broken. */
  WAYSTONE: 1081,

  // ---- the new world (1100 and up): see worldgen.ts ----
  COARSE_DIRT: 1100,
  PODZOL: 1101,
  MUD: 1102,
  CLAY: 1103,
  RED_SAND: 1104,
  RED_SANDSTONE: 1105,
  PACKED_ICE: 1106,
  DEEPSLATE: 1107,
  COBBLED_DEEPSLATE: 1108,
  TUFF: 1109,
  MYCELIUM: 1110,
  MUSHROOM_STEM: 1111,
  RED_MUSHROOM_BLOCK: 1112,
  BROWN_MUSHROOM_BLOCK: 1113,
  /** Baked clay in the colours of the badlands. */
  TERRACOTTA: 1114,
  TERRACOTTA_ORANGE: 1115,
  TERRACOTTA_YELLOW: 1116,
  TERRACOTTA_RED: 1117,
  TERRACOTTA_WHITE: 1118,
  TERRACOTTA_BROWN: 1119,
  TERRACOTTA_LIGHT_GRAY: 1120,
  PUMPKIN: 1121,
  MELON: 1122,
  ACACIA_LOG: 1130,
  ACACIA_LEAVES: 1131,
  ACACIA_SAPLING: 1132,
  JUNGLE_LOG: 1133,
  JUNGLE_LEAVES: 1134,
  JUNGLE_SAPLING: 1135,
  DARK_OAK_LOG: 1136,
  DARK_OAK_LEAVES: 1137,
  DARK_OAK_SAPLING: 1138,
  CHERRY_LOG: 1139,
  CHERRY_LEAVES: 1140,
  CHERRY_SAPLING: 1141,
  FERN: 1150,
  TULIP_RED: 1151,
  TULIP_ORANGE: 1152,
  TULIP_WHITE: 1153,
  TULIP_PINK: 1154,
  OXEYE_DAISY: 1155,
  CORNFLOWER: 1156,
  ALLIUM: 1157,
  AZURE_BLUET: 1158,
  BLUE_ORCHID: 1159,
  BROWN_MUSHROOM: 1160,
  RED_MUSHROOM: 1161,
  SUGAR_CANE: 1162,
  LILY_PAD: 1163,
  PINK_PETALS: 1164,
  // ---- the caves (1170 and up) ----
  /** Lush caves: soft green moss over floors and ceilings. */
  MOSS_BLOCK: 1170,
  /** Hanging vines of a lush cave; the berry ones glow. */
  CAVE_VINES: 1171,
  CAVE_VINES_BERRIES: 1172,
  FLOWERING_AZALEA: 1173,
  SPORE_BLOSSOM: 1174,
  /** Dripstone caves: brown stone with stalagmites on the floor and stalactites hanging from the roof (a thick base and a thin tip). */
  DRIPSTONE_BLOCK: 1175,
  STALAGMITE_BASE: 1176,
  STALAGMITE_TIP: 1177,
  STALACTITE_BASE: 1178,
  STALACTITE_TIP: 1179,
  /** A faintly glowing mat on cave floors. */
  GLOW_LICHEN: 1180,
  /** Amethyst geodes: a hollow of crystal in calcite and smooth basalt. */
  AMETHYST_BLOCK: 1181,
  BUDDING_AMETHYST: 1182,
  AMETHYST_CLUSTER: 1183,
  CALCITE: 1184,
  SMOOTH_BASALT: 1185,
  /** The deep dark: black-teal growth on the floors of the deepest caves. */
  SCULK: 1186,
  /** Lanterns: standing on a block or hanging from one (the plain and the soul kind), and the chain they hang from. */
  LANTERN: 1190,
  LANTERN_HANG: 1191,
  SOUL_LANTERN: 1192,
  SOUL_LANTERN_HANG: 1193,
  CHAIN: 1194,
} as const;

/** The item id of redstone dust (items.ts I.REDSTONE; here so block drops can name it). */
export const REDSTONE_ITEM = 389;

/** The first foot id of a bed colour (the red bed keeps the original ids). */
function bedFootBase(color: number): number {
  return color === BED_RED ? B.BED_FOOT_PX : B.BED_COLOR_BASE + (color < BED_RED ? color : color - 1) * 4;
}

export type RenderClass = 'opaque' | 'cutout' | 'translucent';

/** How a block is meshed. Everything except 'cube' is non-opaque and drawn with alpha testing. */
export type BlockShape = 'cube' | 'cross' | 'crop' | 'torch' | 'flat' | 'bed' | 'slab' | 'stair' | 'door' | 'trapdoor' | 'ladder' | 'fence' | 'gate' | 'pane' | 'table' | 'lever' | 'button' | 'plate' | 'lantern' | 'chain';

export const MAX_LIGHT = 15;

export interface BlockDef {
  id: number;
  name: string;
  /** Blocks movement. */
  solid: boolean;
  /** Fully hides neighbouring faces (used for face culling, AO and light blocking). */
  opaque: boolean;
  liquid: boolean;
  render: RenderClass;
  shape: BlockShape;
  /** Placing another block onto this one replaces it (grass, flowers). */
  replaceable: boolean;
  /** Base hardness (seconds-ish at hand speed); Infinity = unbreakable. */
  hardness: number;
  /** Tool kind that mines this block faster. */
  tool: ToolKind | null;
  /** Minimum tool harvest level needed to get a drop (0 = anything, even a bare hand). */
  harvest: number;
  /** Hide faces between two blocks of the same id (water, glass, leaves). */
  cullSame: boolean;
  /** Block light emitted (0-15). */
  light: number;
  sound: SoundKind;
  tiles: { top: number; bottom: number; side: number };
}

interface DefOpts {
  solid?: boolean;
  opaque?: boolean;
  liquid?: boolean;
  render?: RenderClass;
  shape?: BlockShape;
  hardness?: number;
  tool?: ToolKind;
  harvest?: number;
  cullSame?: boolean;
  replaceable?: boolean;
  light?: number;
  sound?: SoundKind;
}

function def(
  id: number,
  name: string,
  top: string | null,
  bottom: string | null,
  side: string | null,
  opts: DefOpts = {},
): BlockDef {
  const t = (n: string | null) => (n ? tileIndex(n) : 0);
  return {
    id,
    name,
    solid: opts.solid ?? true,
    opaque: opts.opaque ?? true,
    liquid: opts.liquid ?? false,
    render: opts.render ?? 'opaque',
    shape: opts.shape ?? 'cube',
    replaceable: opts.replaceable ?? opts.shape === 'cross',
    hardness: opts.hardness ?? 1,
    tool: opts.tool ?? null,
    harvest: opts.harvest ?? 0,
    cullSame: opts.cullSame ?? false,
    light: opts.light ?? 0,
    sound: opts.sound ?? 'stone',
    tiles: { top: t(top), bottom: t(bottom), side: t(side) },
  };
}

/** Options shared by walk-through, instantly-broken plants. */
function plant(sound: SoundKind): DefOpts {
  return { solid: false, opaque: false, render: 'cutout', shape: 'cross', hardness: 0, sound };
}

// ---- building blocks: slabs, stairs, doors, trapdoors, ladders, fences, gates, panes --------------------
// Orientation and state are part of the block id (like torches and beds), so a chunk stays one byte per
// block. Directions use `BED_DIRS`: 0 = +x, 1 = -x, 2 = +z, 3 = -z.

/** What slabs and stairs can be made of. `block` is the full block (two slabs make one when placed together). */
export const BUILD_MATERIALS = [
  { name: 'wooden', block: B.PLANKS, top: 'planks', bottom: 'planks', side: 'planks', sound: 'wood' as SoundKind, hardness: 2, tool: 'axe' as ToolKind | undefined, harvest: 0 },
  { name: 'cobblestone', block: B.COBBLE, top: 'cobble', bottom: 'cobble', side: 'cobble', sound: 'stone' as SoundKind, hardness: 2, tool: 'pickaxe' as ToolKind | undefined, harvest: 1 },
  { name: 'stone', block: B.STONE, top: 'stone', bottom: 'stone', side: 'stone', sound: 'stone' as SoundKind, hardness: 1.5, tool: 'pickaxe' as ToolKind | undefined, harvest: 1 },
  { name: 'sandstone', block: B.SANDSTONE, top: 'sandstone_top', bottom: 'sandstone_top', side: 'sandstone_side', sound: 'stone' as SoundKind, hardness: 0.8, tool: 'pickaxe' as ToolKind | undefined, harvest: 1 },
  { name: 'stone_brick', block: B.STONE_BRICKS, top: 'stone_bricks', bottom: 'stone_bricks', side: 'stone_bricks', sound: 'stone' as SoundKind, hardness: 1.5, tool: 'pickaxe' as ToolKind | undefined, harvest: 1 },
] as const;

export const slabId = (mat: number, top: boolean): number => B.SLAB_BASE + mat * 2 + (top ? 1 : 0);
export const stairId = (mat: number, top: boolean, dir: number): number => B.STAIR_BASE + mat * 8 + (top ? 4 : 0) + dir;
export const doorId = (upper: boolean, open: boolean, facing: number): number => B.DOOR_BASE + (upper ? 8 : 0) + (open ? 4 : 0) + facing;
export const trapdoorId = (top: boolean, open: boolean, facing: number): number => B.TRAPDOOR_BASE + (top ? 8 : 0) + (open ? 4 : 0) + facing;
export const ladderId = (facing: number): number => B.LADDER_BASE + facing;
/**
 * A gate only remembers the axis it blocks (facing 0/1 = along x, 2/3 = along z) and whether it is open; its
 * open leaves always swing out the same way.
 */
export const gateId = (open: boolean, facing: number): number => B.GATE_BASE + (open ? 2 : 0) + (facing >> 1);

const SLAB_COUNT = BUILD_MATERIALS.length * 2;
const STAIR_COUNT = BUILD_MATERIALS.length * 8;

export function slabInfo(id: number): { mat: number; top: boolean } | null {
  const i = id - B.SLAB_BASE;
  return i >= 0 && i < SLAB_COUNT ? { mat: i >> 1, top: (i & 1) === 1 } : null;
}
/** `dir` is the way the high side of the stairs faces (away from the player who placed them). */
export function stairInfo(id: number): { mat: number; top: boolean; dir: number } | null {
  const i = id - B.STAIR_BASE;
  return i >= 0 && i < STAIR_COUNT ? { mat: i >> 3, top: (i & 4) !== 0, dir: i & 3 } : null;
}
/** `facing` is the edge of the cell the closed door stands on. */
export function doorInfo(id: number): { upper: boolean; open: boolean; facing: number } | null {
  const i = id - B.DOOR_BASE;
  return i >= 0 && i < 16 ? { upper: (i & 8) !== 0, open: (i & 4) !== 0, facing: i & 3 } : null;
}
/** `facing` is the edge the open trapdoor stands against (its hinge side). */
export function trapdoorInfo(id: number): { top: boolean; open: boolean; facing: number } | null {
  const i = id - B.TRAPDOOR_BASE;
  return i >= 0 && i < 16 ? { top: (i & 8) !== 0, open: (i & 4) !== 0, facing: i & 3 } : null;
}
/** `facing` is the edge the ladder is fixed to: the wall it hangs on is on that side. */
export function ladderInfo(id: number): { facing: number } | null {
  const i = id - B.LADDER_BASE;
  return i >= 0 && i < 4 ? { facing: i } : null;
}
/**
 * `facing` is 0 (the gate blocks walking along x) or 2 (along z), open or not; an open gate's leaves
 * swing out the positive side of the other axis.
 */
export function gateInfo(id: number): { open: boolean; facing: number } | null {
  const i = id - B.GATE_BASE;
  if (i < 0 || i >= 4) return null;
  return { open: i >= 2, facing: (i & 1) * 2 };
}

/** The item a building block drops and is placed from (0 = it is its own item or drops nothing special). */
export const BUILDING_ITEM = new Int16Array(BLOCK_COUNT);
/** Building variants that are never items themselves. */
export const NO_ITEM_BLOCKS = new Set<number>([B.FIRE]);
for (let i = 0; i < (DYE_COUNT - 1) * 4; i++) NO_ITEM_BLOCKS.add(B.BED_COLOR_BASE + i);
for (let mi = 0; mi < BUILD_MATERIALS.length; mi++) {
  for (const top of [false, true]) {
    BUILDING_ITEM[slabId(mi, top)] = slabId(mi, false);
    if (!(slabId(mi, top) === slabId(mi, false))) NO_ITEM_BLOCKS.add(slabId(mi, top));
    for (let d = 0; d < 4; d++) {
      BUILDING_ITEM[stairId(mi, top, d)] = stairId(mi, false, 0);
      if (stairId(mi, top, d) !== stairId(mi, false, 0)) NO_ITEM_BLOCKS.add(stairId(mi, top, d));
    }
  }
}
for (const top of [false, true])
  for (const open of [false, true])
    for (let f = 0; f < 4; f++) {
      BUILDING_ITEM[trapdoorId(top, open, f)] = trapdoorId(false, false, 0);
      if (trapdoorId(top, open, f) !== trapdoorId(false, false, 0)) NO_ITEM_BLOCKS.add(trapdoorId(top, open, f));
      BUILDING_ITEM[doorId(top, open, f)] = 0;
      NO_ITEM_BLOCKS.add(doorId(top, open, f));
    }
for (let f = 0; f < 4; f++) {
  BUILDING_ITEM[ladderId(f)] = ladderId(0);
  if (f > 0) NO_ITEM_BLOCKS.add(ladderId(f));
  for (const open of [false, true]) {
    BUILDING_ITEM[gateId(open, f)] = gateId(false, 0);
    if (gateId(open, f) !== gateId(false, 0)) NO_ITEM_BLOCKS.add(gateId(open, f));
  }
}
/** Every shape of plain and powered rail, as the first three are the ones an item places. */
export const PLAIN_RAILS: readonly number[] = [B.RAIL_X, B.RAIL_Z, B.RAIL_ES, B.RAIL_WS, B.RAIL_WN, B.RAIL_EN, B.RAIL_UP_PX, B.RAIL_UP_NX, B.RAIL_UP_PZ, B.RAIL_UP_NZ];
export const POWERED_RAILS: readonly number[] = [B.POWERED_RAIL_X, B.POWERED_RAIL_Z, B.POWERED_UP_PX, B.POWERED_UP_NX, B.POWERED_UP_PZ, B.POWERED_UP_NZ];
for (const id of PLAIN_RAILS) {
  BUILDING_ITEM[id] = B.RAIL_X;
  if (id !== B.RAIL_X) NO_ITEM_BLOCKS.add(id);
}
for (const id of POWERED_RAILS) {
  BUILDING_ITEM[id] = B.POWERED_RAIL_X;
  if (id !== B.POWERED_RAIL_X) NO_ITEM_BLOCKS.add(id);
}
// ---- redstone ---------------------------------------------------------------------------------------------
/** Signal strength of a dust block (0..15), or -1 for anything else. */
export const wirePower = (id: number): number => (id >= B.WIRE_BASE && id < B.WIRE_BASE + 16 ? id - B.WIRE_BASE : -1);
export const wireId = (power: number): number => B.WIRE_BASE + Math.max(0, Math.min(15, power));
/** A lever, button or redstone torch: stuck to the floor (face 0) or to the wall block in direction `face - 1` (BED_DIRS), and on or off. */
export interface MountedInfo {
  face: number;
  on: boolean;
}
function mountedInfo(base: number, id: number): MountedInfo | null {
  const i = id - base;
  return i >= 0 && i < 10 ? { face: i >> 1, on: (i & 1) === 1 } : null;
}
export const mountedId = (base: number, face: number, on: boolean): number => base + face * 2 + (on ? 1 : 0);
export const leverInfo = (id: number): MountedInfo | null => mountedInfo(B.LEVER_BASE, id);
export const buttonInfo = (id: number): MountedInfo | null => mountedInfo(B.BUTTON_BASE, id);
/** on means lit (a torch is lit unless something powers the block it hangs on). */
export const rtorchInfo = (id: number): MountedInfo | null => mountedInfo(B.RTORCH_BASE, id);
/** The way from a mounted block to the block holding it up: dx, dy, dz. */
export function mountSupport(face: number): [number, number, number] {
  if (face === 0) return [0, -1, 0];
  return [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]][face - 1] as [number, number, number];
}
export function plateInfo(id: number): { wood: boolean; on: boolean } | null {
  if (id < B.PLATE_STONE || id > B.PLATE_WOOD_ON) return null;
  return { wood: id >= B.PLATE_WOOD, on: ((id - B.PLATE_STONE) & 1) === 1 };
}
export const isLamp = (id: number): boolean => id === B.LAMP || id === B.LAMP_ON;
// Every state drops the one item that places it; the powered / pressed / unlit ones are never items themselves.
for (let p = 0; p < 16; p++) {
  BUILDING_ITEM[B.WIRE_BASE + p] = REDSTONE_ITEM;
  NO_ITEM_BLOCKS.add(B.WIRE_BASE + p);
}
for (const [base, item] of [[B.LEVER_BASE, B.LEVER_BASE], [B.BUTTON_BASE, B.BUTTON_BASE], [B.RTORCH_BASE, B.RTORCH_BASE + 1]] as const) {
  for (let i = 0; i < 10; i++) {
    BUILDING_ITEM[base + i] = item;
    if (base + i !== item) NO_ITEM_BLOCKS.add(base + i);
  }
}
for (const [id, item] of [[B.PLATE_STONE_ON, B.PLATE_STONE], [B.PLATE_WOOD_ON, B.PLATE_WOOD], [B.LAMP_ON, B.LAMP]] as const) {
  BUILDING_ITEM[id] = item;
  NO_ITEM_BLOCKS.add(id);
}

// ---- lanterns --------------------------------------------------------------------------------------------
/** Light given off by the two lanterns (the original's levels: 15 and 10). */
export const LANTERN_LIGHT = 15;
export const SOUL_LANTERN_LIGHT = 10;
/** A soul lantern keeps monsters off: none is born, none walks in, and none goes for a player, this many blocks around it (and 8 up or down). */
export const SOUL_WARD_RADIUS = 10;
export const SOUL_WARD_HEIGHT = 8;

export interface LanternInfo {
  /** The blue-flamed kind. */
  soul: boolean;
  /** Hung from the block above (and not standing on the one below). */
  hanging: boolean;
}

/** What a lantern block is (null for anything else). */
export function lanternInfo(id: number): LanternInfo | null {
  const i = id - B.LANTERN;
  return i >= 0 && i < 4 ? { soul: i >= 2, hanging: (i & 1) === 1 } : null;
}

export const lanternId = (soul: boolean, hanging: boolean): number => B.LANTERN + (soul ? 2 : 0) + (hanging ? 1 : 0);
export const isLantern = (id: number): boolean => id >= B.LANTERN && id <= B.SOUL_LANTERN_HANG;
/** Things water flows around instead of washing away. */
export const isMetalFitting = (id: number): boolean => isLantern(id) || id === B.CHAIN;
// A hanging lantern drops the standing one's item (and is never an item itself).
for (const soul of [false, true]) {
  BUILDING_ITEM[lanternId(soul, true)] = lanternId(soul, false);
  NO_ITEM_BLOCKS.add(lanternId(soul, true));
}

const DEFS: BlockDef[] = [
  def(B.AIR, 'air', null, null, null, { solid: false, opaque: false, hardness: 0, sound: 'none' }),
  def(B.STONE, 'stone', 'stone', 'stone', 'stone', { hardness: 1.5, tool: 'pickaxe', harvest: 1, sound: 'stone' }),
  def(B.DIRT, 'dirt', 'dirt', 'dirt', 'dirt', { hardness: 0.5, tool: 'shovel', sound: 'dirt' }),
  def(B.GRASS, 'grass', 'grass_top', 'dirt', 'grass_side', { hardness: 0.6, tool: 'shovel', sound: 'grass' }),
  def(B.SAND, 'sand', 'sand', 'sand', 'sand', { hardness: 0.5, tool: 'shovel', sound: 'sand' }),
  def(B.WATER, 'water', 'water', 'water', 'water', {
    solid: false,
    opaque: false,
    liquid: true,
    render: 'translucent',
    hardness: Infinity,
    cullSame: true,
    sound: 'none',
  }),
  def(B.LOG, 'log', 'log_top', 'log_top', 'log_side', { hardness: 2, tool: 'axe', sound: 'wood' }),
  def(B.LEAVES, 'leaves', 'leaves', 'leaves', 'leaves', {
    opaque: false,
    render: 'cutout',
    hardness: 0.2,
    cullSame: true,
    sound: 'leaves',
  }),
  def(B.BEDROCK, 'bedrock', 'bedrock', 'bedrock', 'bedrock', { hardness: Infinity, sound: 'stone' }),
  def(B.SNOW, 'snowy_grass', 'snow', 'dirt', 'snow_side', { hardness: 0.6, tool: 'shovel', sound: 'snow' }),
  def(B.PLANKS, 'planks', 'planks', 'planks', 'planks', { hardness: 2, tool: 'axe', sound: 'wood' }),
  def(B.COBBLE, 'cobblestone', 'cobble', 'cobble', 'cobble', { hardness: 2, tool: 'pickaxe', harvest: 1, sound: 'stone' }),
  def(B.COAL_ORE, 'coal_ore', 'coal_ore', 'coal_ore', 'coal_ore', { hardness: 3, tool: 'pickaxe', harvest: 1, sound: 'stone' }),
  def(B.IRON_ORE, 'iron_ore', 'iron_ore', 'iron_ore', 'iron_ore', { hardness: 3, tool: 'pickaxe', harvest: 2, sound: 'stone' }),
  def(B.GOLD_ORE, 'gold_ore', 'gold_ore', 'gold_ore', 'gold_ore', { hardness: 3, tool: 'pickaxe', harvest: 3, sound: 'stone' }),
  def(B.DIAMOND_ORE, 'diamond_ore', 'diamond_ore', 'diamond_ore', 'diamond_ore', {
    hardness: 3,
    tool: 'pickaxe',
    harvest: 3,
    sound: 'stone',
  }),
  def(B.GRAVEL, 'gravel', 'gravel', 'gravel', 'gravel', { hardness: 0.6, tool: 'shovel', sound: 'gravel' }),
  def(B.GLASS, 'glass', 'glass', 'glass', 'glass', {
    opaque: false,
    render: 'cutout',
    hardness: 0.3,
    cullSame: true,
    sound: 'glass',
  }),
  def(B.SNOW_BLOCK, 'snow_block', 'snow', 'snow', 'snow', { hardness: 0.2, tool: 'shovel', sound: 'snow' }),
  def(B.GLOWSTONE, 'glowstone', 'glowstone', 'glowstone', 'glowstone', {
    hardness: 0.3,
    light: MAX_LIGHT,
    sound: 'glass',
  }),
  def(B.CRAFTING_TABLE, 'crafting_table', 'crafting_top', 'planks', 'crafting_side', {
    hardness: 2.5,
    tool: 'axe',
    sound: 'wood',
  }),
  def(B.FURNACE, 'furnace', 'furnace_top', 'furnace_top', 'furnace_side', {
    hardness: 3.5,
    tool: 'pickaxe',
    harvest: 1,
    sound: 'stone',
  }),
  def(B.CHEST, 'chest', 'chest_top', 'chest_top', 'chest_side', { hardness: 2.5, tool: 'axe', sound: 'wood' }),
  ...[B.TORCH, B.TORCH_PX, B.TORCH_NX, B.TORCH_PZ, B.TORCH_NZ].map((id) =>
    def(id, 'torch', 'torch', 'torch', 'torch', {
      solid: false,
      opaque: false,
      render: 'cutout',
      shape: 'torch',
      hardness: 0,
      light: 14,
      sound: 'wood',
    }),
  ),
  def(B.TALL_GRASS, 'tall_grass', 'tall_grass', 'tall_grass', 'tall_grass', plant('grass')),
  def(B.ROSE, 'rose', 'rose', 'rose', 'rose', plant('grass')),
  def(B.DANDELION, 'dandelion', 'dandelion', 'dandelion', 'dandelion', plant('grass')),
  def(B.SAPLING, 'sapling', 'sapling', 'sapling', 'sapling', plant('grass')),
  def(B.FARMLAND, 'farmland', 'farmland_top', 'dirt', 'dirt', { hardness: 0.6, tool: 'shovel', sound: 'dirt' }),
  ...[B.WHEAT_0, B.WHEAT_1, B.WHEAT_2, B.WHEAT_3].map((id, i) =>
    def(id, 'wheat', `wheat_${i}`, `wheat_${i}`, `wheat_${i}`, { ...plant('grass'), shape: 'crop' }),
  ),
  def(B.LAVA, 'lava', 'lava', 'lava', 'lava', {
    solid: false,
    opaque: false,
    liquid: true,
    hardness: Infinity,
    cullSame: true,
    light: MAX_LIGHT,
    sound: 'none',
  }),
  def(B.MOSSY_COBBLE, 'mossy_cobblestone', 'mossy_cobble', 'mossy_cobble', 'mossy_cobble', { hardness: 2, tool: 'pickaxe', harvest: 1, sound: 'stone' }),
  def(B.SPAWNER, 'spawner', 'spawner', 'spawner', 'spawner', {
    opaque: false,
    render: 'cutout',
    hardness: 5,
    tool: 'pickaxe',
    harvest: 1,
    sound: 'stone',
  }),
  def(B.CACTUS, 'cactus', 'cactus_top', 'cactus_top', 'cactus_side', { hardness: 0.4, sound: 'grass' }),
  def(B.DEAD_BUSH, 'dead_bush', 'dead_bush', 'dead_bush', 'dead_bush', plant('grass')),
  def(B.SANDSTONE, 'sandstone', 'sandstone_top', 'sandstone_top', 'sandstone_side', { hardness: 0.8, tool: 'pickaxe', harvest: 1, sound: 'stone' }),
  def(B.GRANITE, 'granite', 'granite', 'granite', 'granite', { hardness: 1.5, tool: 'pickaxe', harvest: 1, sound: 'stone' }),
  def(B.DIORITE, 'diorite', 'diorite', 'diorite', 'diorite', { hardness: 1.5, tool: 'pickaxe', harvest: 1, sound: 'stone' }),
  def(B.ANDESITE, 'andesite', 'andesite', 'andesite', 'andesite', { hardness: 1.5, tool: 'pickaxe', harvest: 1, sound: 'stone' }),
  def(B.OBSIDIAN, 'obsidian', 'obsidian', 'obsidian', 'obsidian', { hardness: 50, tool: 'pickaxe', harvest: 4, sound: 'stone' }),
  def(B.COBWEB, 'cobweb', 'cobweb', 'cobweb', 'cobweb', {
    solid: false,
    opaque: false,
    render: 'cutout',
    shape: 'cross',
    replaceable: false,
    hardness: 4,
    sound: 'none',
  }),
  def(B.RAIL_X, 'rail', 'rail', 'rail', 'rail', { solid: false, opaque: false, render: 'cutout', shape: 'flat', hardness: 0.7, sound: 'stone' }),
  def(B.RAIL_Z, 'rail', 'rail_z', 'rail_z', 'rail_z', { solid: false, opaque: false, render: 'cutout', shape: 'flat', hardness: 0.7, sound: 'stone' }),
  def(B.BIRCH_LOG, 'birch_log', 'birch_log_top', 'birch_log_top', 'birch_log_side', { hardness: 2, tool: 'axe', sound: 'wood' }),
  def(B.BIRCH_LEAVES, 'birch_leaves', 'birch_leaves', 'birch_leaves', 'birch_leaves', { opaque: false, render: 'cutout', hardness: 0.2, cullSame: true, sound: 'leaves' }),
  def(B.SPRUCE_LOG, 'spruce_log', 'spruce_log_top', 'spruce_log_top', 'spruce_log_side', { hardness: 2, tool: 'axe', sound: 'wood' }),
  def(B.SPRUCE_LEAVES, 'spruce_leaves', 'spruce_leaves', 'spruce_leaves', 'spruce_leaves', { opaque: false, render: 'cutout', hardness: 0.2, cullSame: true, sound: 'leaves' }),
  def(B.BIRCH_SAPLING, 'birch_sapling', 'birch_sapling', 'birch_sapling', 'birch_sapling', plant('grass')),
  def(B.SPRUCE_SAPLING, 'spruce_sapling', 'spruce_sapling', 'spruce_sapling', 'spruce_sapling', plant('grass')),
  def(B.WOOL, 'wool', 'wool', 'wool', 'wool', { hardness: 0.8, sound: 'grass' }),
  def(B.LAPIS_ORE, 'lapis_ore', 'lapis_ore', 'lapis_ore', 'lapis_ore', { hardness: 3, tool: 'pickaxe', harvest: 2, sound: 'stone' }),
  ...DYE_NAMES.slice(1).map((n, i) => def(B.WOOL_COLOR_BASE + i, `${n}_wool`, `wool_${n}`, `wool_${n}`, `wool_${n}`, { hardness: 0.8, sound: 'grass' })),
  def(B.CHISELED_SANDSTONE, 'chiseled_sandstone', 'sandstone_top', 'sandstone_top', 'chiseled_sandstone', { hardness: 0.8, tool: 'pickaxe', harvest: 1, sound: 'stone' }),
  def(B.ICE, 'ice', 'ice', 'ice', 'ice', { opaque: false, render: 'translucent', hardness: 0.5, cullSame: true, sound: 'glass' }),
  ...[B.WATER_1, B.WATER_2, B.WATER_3, B.WATER_4, B.WATER_5, B.WATER_6, B.WATER_7, B.WATER_FALL].map((id) =>
    def(id, 'water', 'water', 'water', 'water', { solid: false, opaque: false, liquid: true, render: 'translucent', hardness: Infinity, cullSame: true, sound: 'none' }),
  ),
  ...[B.LAVA_1, B.LAVA_2, B.LAVA_3, B.LAVA_FALL].map((id) =>
    def(id, 'lava', 'lava', 'lava', 'lava', { solid: false, opaque: false, liquid: true, hardness: Infinity, cullSame: true, light: MAX_LIGHT, sound: 'none' }),
  ),
  // Every bed half. A foot half carries the colour and the direction, a head half only the direction (its
  // colour is that of the foot next to it), which is what keeps the ids inside one byte.
  ...DYE_NAMES.flatMap((n, c) =>
    [0, 1, 2, 3].map((dir) =>
      def(bedFootBase(c) + dir, c === BED_RED ? 'bed' : `${n}_bed`, bedTileName('top_foot', c), 'planks', bedTileName('side_foot', c), {
        solid: true,
        opaque: false,
        render: 'cutout',
        shape: 'bed',
        hardness: 0.2,
        sound: 'wood',
      }),
    ),
  ),
  ...[0, 1, 2, 3].map((dir) =>
    def(B.BED_HEAD_PX + dir, 'bed', bedTileName('top_head', BED_RED), 'planks', bedTileName('side_head', BED_RED), {
      solid: true,
      opaque: false,
      render: 'cutout',
      shape: 'bed',
      hardness: 0.2,
      sound: 'wood',
    }),
  ),
  ...BUILD_MATERIALS.flatMap((m, mi) => [
    ...[false, true].map((top) =>
      def(slabId(mi, top), `${m.name}_slab`, m.top, m.bottom, m.side, { opaque: false, render: 'cutout', shape: 'slab', hardness: m.hardness, tool: m.tool, harvest: m.harvest, sound: m.sound }),
    ),
    ...[false, true].flatMap((top) =>
      [0, 1, 2, 3].map((dir) =>
        def(stairId(mi, top, dir), `${m.name}_stairs`, m.top, m.bottom, m.side, { opaque: false, render: 'cutout', shape: 'stair', hardness: m.hardness, tool: m.tool, harvest: m.harvest, sound: m.sound }),
      ),
    ),
  ]),
  ...[false, true].flatMap((upper) =>
    [false, true].flatMap((open) =>
      [0, 1, 2, 3].map((f) =>
        def(doorId(upper, open, f), 'wooden_door', null, null, upper ? 'door_upper' : 'door_lower', { opaque: false, render: 'cutout', shape: 'door', hardness: 3, tool: 'axe', sound: 'wood' }),
      ),
    ),
  ),
  ...[false, true].flatMap((top) =>
    [false, true].flatMap((open) =>
      [0, 1, 2, 3].map((f) => def(trapdoorId(top, open, f), 'trapdoor', 'trapdoor', 'trapdoor', 'trapdoor', { opaque: false, render: 'cutout', shape: 'trapdoor', hardness: 3, tool: 'axe', sound: 'wood' })),
    ),
  ),
  ...[0, 1, 2, 3].map((f) => def(ladderId(f), 'ladder', 'ladder', 'ladder', 'ladder', { solid: false, opaque: false, render: 'cutout', shape: 'ladder', hardness: 0.4, tool: 'axe', sound: 'wood' })),
  def(B.FENCE, 'fence', 'planks', 'planks', 'planks', { opaque: false, render: 'cutout', shape: 'fence', hardness: 2, tool: 'axe', sound: 'wood' }),
  ...[0, 1, 2, 3].map((i) => def(B.GATE_BASE + i, 'fence_gate', 'planks', 'planks', 'planks', { opaque: false, render: 'cutout', shape: 'gate', hardness: 2, tool: 'axe', sound: 'wood' })),
  // Fire is drawn as crossed flames (four animation frames, see the `fire` tiles) and gives as much light as lava.
  def(B.FIRE, 'fire', 'fire_0', 'fire_0', 'fire_0', { solid: false, opaque: false, render: 'cutout', shape: 'cross', replaceable: true, hardness: 0, light: MAX_LIGHT, sound: 'none' }),
  def(B.PANE, 'glass_pane', 'glass', 'glass', 'glass', { opaque: false, render: 'cutout', shape: 'pane', hardness: 0.3, sound: 'glass' }),
  def(B.STONE_BRICKS, 'stone_bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', { hardness: 1.5, tool: 'pickaxe', harvest: 1, sound: 'stone' }),
  def(B.EMERALD_ORE, 'emerald_ore', 'emerald_ore', 'emerald_ore', 'emerald_ore', { hardness: 3, tool: 'pickaxe', harvest: 3, sound: 'stone' }),
  // A table is three quarters of a block tall (the book floats above it).
  def(B.ENCHANTING_TABLE, 'enchanting_table', 'enchanting_table_top', 'enchanting_table_bottom', 'enchanting_table_side', { opaque: false, render: 'cutout', shape: 'table', hardness: 5, tool: 'pickaxe', harvest: 1, sound: 'stone' }),
  def(B.BOOKSHELF, 'bookshelf', 'planks', 'planks', 'bookshelf', { hardness: 1.5, tool: 'axe', sound: 'wood' }),
  def(B.ANVIL, 'anvil', 'anvil_top', 'anvil_side', 'anvil_side', { opaque: false, render: 'cutout', shape: 'table', hardness: 5, tool: 'pickaxe', harvest: 1, sound: 'stone' }),
  def(B.ANVIL_CHIPPED, 'chipped_anvil', 'anvil_top', 'anvil_side_chipped', 'anvil_side_chipped', { opaque: false, render: 'cutout', shape: 'table', hardness: 5, tool: 'pickaxe', harvest: 1, sound: 'stone' }),
  def(B.ANVIL_DAMAGED, 'damaged_anvil', 'anvil_top', 'anvil_side_damaged', 'anvil_side_damaged', { opaque: false, render: 'cutout', shape: 'table', hardness: 5, tool: 'pickaxe', harvest: 1, sound: 'stone' }),
  def(B.GRINDSTONE, 'grindstone', 'grindstone_top', 'grindstone_top', 'grindstone_side', { opaque: false, render: 'cutout', shape: 'table', hardness: 2, tool: 'pickaxe', harvest: 1, sound: 'stone' }),
  def(B.TNT, 'tnt', 'tnt_top', 'tnt_bottom', 'tnt_side', { hardness: 0, sound: 'grass' }),
  def(B.REDSTONE_ORE, 'redstone_ore', 'redstone_ore', 'redstone_ore', 'redstone_ore', { hardness: 3, tool: 'pickaxe', harvest: 2, sound: 'stone' }),
  def(B.REDSTONE_BLOCK, 'redstone_block', 'redstone_block', 'redstone_block', 'redstone_block', { hardness: 5, tool: 'pickaxe', harvest: 1, sound: 'stone' }),
  def(B.LAMP, 'redstone_lamp', 'redstone_lamp', 'redstone_lamp', 'redstone_lamp', { hardness: 0.3, sound: 'glass' }),
  def(B.LAMP_ON, 'redstone_lamp', 'redstone_lamp_on', 'redstone_lamp_on', 'redstone_lamp_on', { hardness: 0.3, sound: 'glass', light: 15 }),
  ...Array.from({ length: 16 }, (_, p) => def(B.WIRE_BASE + p, 'redstone_dust', p ? 'redstone_dot_on' : 'redstone_dot', p ? 'redstone_line_on' : 'redstone_line', p ? 'redstone_line_on' : 'redstone_line', { solid: false, opaque: false, render: 'cutout', shape: 'flat', hardness: 0, sound: 'stone' })),
  ...Array.from({ length: 10 }, (_, i) => def(B.LEVER_BASE + i, 'lever', 'lever', 'lever', 'lever', { solid: false, opaque: false, render: 'cutout', shape: 'lever', hardness: 0.5, sound: 'wood' })),
  ...Array.from({ length: 10 }, (_, i) => def(B.BUTTON_BASE + i, 'stone_button', 'stone', 'stone', 'stone', { solid: false, opaque: false, render: 'cutout', shape: 'button', hardness: 0.5, sound: 'stone' })),
  def(B.PLATE_STONE, 'stone_pressure_plate', 'stone', 'stone', 'stone', { solid: false, opaque: false, render: 'cutout', shape: 'plate', hardness: 0.5, tool: 'pickaxe', sound: 'stone' }),
  def(B.PLATE_STONE_ON, 'stone_pressure_plate', 'stone', 'stone', 'stone', { solid: false, opaque: false, render: 'cutout', shape: 'plate', hardness: 0.5, tool: 'pickaxe', sound: 'stone' }),
  def(B.PLATE_WOOD, 'wooden_pressure_plate', 'planks', 'planks', 'planks', { solid: false, opaque: false, render: 'cutout', shape: 'plate', hardness: 0.5, tool: 'axe', sound: 'wood' }),
  def(B.PLATE_WOOD_ON, 'wooden_pressure_plate', 'planks', 'planks', 'planks', { solid: false, opaque: false, render: 'cutout', shape: 'plate', hardness: 0.5, tool: 'axe', sound: 'wood' }),
  ...Array.from({ length: 10 }, (_, i) => def(B.RTORCH_BASE + i, 'redstone_torch', i & 1 ? 'redstone_torch' : 'redstone_torch_off', i & 1 ? 'redstone_torch' : 'redstone_torch_off', i & 1 ? 'redstone_torch' : 'redstone_torch_off', { solid: false, opaque: false, render: 'cutout', shape: 'torch', hardness: 0, sound: 'wood', light: i & 1 ? 7 : 0 })),
  def(B.SLIME_BLOCK, 'slime_block', 'slime_block', 'slime_block', 'slime_block', { opaque: false, render: 'translucent', hardness: 0, cullSame: true, sound: 'dirt' }),
  def(B.RAIL_ES, 'rail', 'rail_curve', 'rail_curve', 'rail_curve', { solid: false, opaque: false, render: 'cutout', shape: 'flat', hardness: 0.7, sound: 'stone' }),
  def(B.RAIL_WS, 'rail', 'rail_curve', 'rail_curve', 'rail_curve', { solid: false, opaque: false, render: 'cutout', shape: 'flat', hardness: 0.7, sound: 'stone' }),
  def(B.RAIL_WN, 'rail', 'rail_curve', 'rail_curve', 'rail_curve', { solid: false, opaque: false, render: 'cutout', shape: 'flat', hardness: 0.7, sound: 'stone' }),
  def(B.RAIL_EN, 'rail', 'rail_curve', 'rail_curve', 'rail_curve', { solid: false, opaque: false, render: 'cutout', shape: 'flat', hardness: 0.7, sound: 'stone' }),
  def(B.RAIL_UP_PX, 'rail', 'rail', 'rail', 'rail', { solid: false, opaque: false, render: 'cutout', shape: 'flat', hardness: 0.7, sound: 'stone' }),
  def(B.RAIL_UP_NX, 'rail', 'rail', 'rail', 'rail', { solid: false, opaque: false, render: 'cutout', shape: 'flat', hardness: 0.7, sound: 'stone' }),
  def(B.RAIL_UP_PZ, 'rail', 'rail_z', 'rail_z', 'rail_z', { solid: false, opaque: false, render: 'cutout', shape: 'flat', hardness: 0.7, sound: 'stone' }),
  def(B.RAIL_UP_NZ, 'rail', 'rail_z', 'rail_z', 'rail_z', { solid: false, opaque: false, render: 'cutout', shape: 'flat', hardness: 0.7, sound: 'stone' }),
  def(B.POWERED_RAIL_X, 'powered_rail', 'rail_powered', 'rail_powered', 'rail_powered', { solid: false, opaque: false, render: 'cutout', shape: 'flat', hardness: 0.7, sound: 'stone' }),
  def(B.POWERED_RAIL_Z, 'powered_rail', 'rail_powered_z', 'rail_powered_z', 'rail_powered_z', { solid: false, opaque: false, render: 'cutout', shape: 'flat', hardness: 0.7, sound: 'stone' }),
  def(B.POWERED_UP_PX, 'powered_rail', 'rail_powered', 'rail_powered', 'rail_powered', { solid: false, opaque: false, render: 'cutout', shape: 'flat', hardness: 0.7, sound: 'stone' }),
  def(B.POWERED_UP_NX, 'powered_rail', 'rail_powered', 'rail_powered', 'rail_powered', { solid: false, opaque: false, render: 'cutout', shape: 'flat', hardness: 0.7, sound: 'stone' }),
  def(B.POWERED_UP_PZ, 'powered_rail', 'rail_powered_z', 'rail_powered_z', 'rail_powered_z', { solid: false, opaque: false, render: 'cutout', shape: 'flat', hardness: 0.7, sound: 'stone' }),
  def(B.POWERED_UP_NZ, 'powered_rail', 'rail_powered_z', 'rail_powered_z', 'rail_powered_z', { solid: false, opaque: false, render: 'cutout', shape: 'flat', hardness: 0.7, sound: 'stone' }),
  def(B.PORTAL, 'portal', 'portal', 'portal', 'portal', { solid: false, opaque: false, render: 'translucent', cullSame: true, hardness: Infinity, light: 11, sound: 'glass' }),
  def(B.WAYSTONE, 'waystone', 'waystone_top', 'waystone_top', 'waystone_side', { hardness: Infinity, light: 13, sound: 'stone' }),
  // ---- the new world: soils, rock and bricks of clay ----
  def(B.COARSE_DIRT, 'coarse_dirt', 'coarse_dirt', 'coarse_dirt', 'coarse_dirt', { hardness: 0.5, tool: 'shovel', sound: 'gravel' }),
  def(B.PODZOL, 'podzol', 'podzol_top', 'dirt', 'podzol_side', { hardness: 0.5, tool: 'shovel', sound: 'dirt' }),
  def(B.MUD, 'mud', 'mud', 'mud', 'mud', { hardness: 0.5, tool: 'shovel', sound: 'dirt' }),
  def(B.CLAY, 'clay', 'clay', 'clay', 'clay', { hardness: 0.6, tool: 'shovel', sound: 'dirt' }),
  def(B.RED_SAND, 'red_sand', 'red_sand', 'red_sand', 'red_sand', { hardness: 0.5, tool: 'shovel', sound: 'sand' }),
  def(B.RED_SANDSTONE, 'red_sandstone', 'red_sandstone_top', 'red_sandstone_top', 'red_sandstone_side', { hardness: 0.8, tool: 'pickaxe', harvest: 1, sound: 'stone' }),
  def(B.PACKED_ICE, 'packed_ice', 'packed_ice', 'packed_ice', 'packed_ice', { hardness: 0.5, tool: 'pickaxe', sound: 'glass' }),
  def(B.DEEPSLATE, 'deepslate', 'deepslate', 'deepslate', 'deepslate', { hardness: 3, tool: 'pickaxe', harvest: 1, sound: 'stone' }),
  def(B.COBBLED_DEEPSLATE, 'cobbled_deepslate', 'cobbled_deepslate', 'cobbled_deepslate', 'cobbled_deepslate', { hardness: 3.5, tool: 'pickaxe', harvest: 1, sound: 'stone' }),
  def(B.TUFF, 'tuff', 'tuff', 'tuff', 'tuff', { hardness: 1.5, tool: 'pickaxe', harvest: 1, sound: 'stone' }),
  def(B.MYCELIUM, 'mycelium', 'mycelium_top', 'dirt', 'mycelium_side', { hardness: 0.6, tool: 'shovel', sound: 'grass' }),
  def(B.MUSHROOM_STEM, 'mushroom_stem', 'mushroom_stem', 'mushroom_stem', 'mushroom_stem', { hardness: 0.4, tool: 'axe', sound: 'wood' }),
  def(B.RED_MUSHROOM_BLOCK, 'red_mushroom_block', 'red_mushroom_block', 'red_mushroom_block', 'red_mushroom_block', { hardness: 0.4, tool: 'axe', sound: 'wood' }),
  def(B.BROWN_MUSHROOM_BLOCK, 'brown_mushroom_block', 'brown_mushroom_block', 'brown_mushroom_block', 'brown_mushroom_block', { hardness: 0.4, tool: 'axe', sound: 'wood' }),
  ...(
    [
      [B.TERRACOTTA, 'terracotta', 'terracotta'],
      [B.TERRACOTTA_ORANGE, 'orange_terracotta', 'terracotta_orange'],
      [B.TERRACOTTA_YELLOW, 'yellow_terracotta', 'terracotta_yellow'],
      [B.TERRACOTTA_RED, 'red_terracotta', 'terracotta_red'],
      [B.TERRACOTTA_WHITE, 'white_terracotta', 'terracotta_white'],
      [B.TERRACOTTA_BROWN, 'brown_terracotta', 'terracotta_brown'],
      [B.TERRACOTTA_LIGHT_GRAY, 'light_gray_terracotta', 'terracotta_light_gray'],
    ] as const
  ).map(([id, name, tile]) => def(id, name, tile, tile, tile, { hardness: 1.25, tool: 'pickaxe', harvest: 1, sound: 'stone' })),
  def(B.PUMPKIN, 'pumpkin', 'pumpkin_top', 'pumpkin_top', 'pumpkin_side', { hardness: 1, tool: 'axe', sound: 'wood' }),
  def(B.MELON, 'melon', 'melon_top', 'melon_top', 'melon_side', { hardness: 1, tool: 'axe', sound: 'wood' }),
  // ---- trees of the other climates ----
  def(B.ACACIA_LOG, 'acacia_log', 'acacia_log_top', 'acacia_log_top', 'acacia_log_side', { hardness: 2, tool: 'axe', sound: 'wood' }),
  def(B.ACACIA_LEAVES, 'acacia_leaves', 'acacia_leaves', 'acacia_leaves', 'acacia_leaves', { opaque: false, render: 'cutout', hardness: 0.2, cullSame: true, sound: 'leaves' }),
  def(B.ACACIA_SAPLING, 'acacia_sapling', 'acacia_sapling', 'acacia_sapling', 'acacia_sapling', plant('grass')),
  def(B.JUNGLE_LOG, 'jungle_log', 'jungle_log_top', 'jungle_log_top', 'jungle_log_side', { hardness: 2, tool: 'axe', sound: 'wood' }),
  def(B.JUNGLE_LEAVES, 'jungle_leaves', 'jungle_leaves', 'jungle_leaves', 'jungle_leaves', { opaque: false, render: 'cutout', hardness: 0.2, cullSame: true, sound: 'leaves' }),
  def(B.JUNGLE_SAPLING, 'jungle_sapling', 'jungle_sapling', 'jungle_sapling', 'jungle_sapling', plant('grass')),
  def(B.DARK_OAK_LOG, 'dark_oak_log', 'dark_oak_log_top', 'dark_oak_log_top', 'dark_oak_log_side', { hardness: 2, tool: 'axe', sound: 'wood' }),
  def(B.DARK_OAK_LEAVES, 'dark_oak_leaves', 'dark_oak_leaves', 'dark_oak_leaves', 'dark_oak_leaves', { opaque: false, render: 'cutout', hardness: 0.2, cullSame: true, sound: 'leaves' }),
  def(B.DARK_OAK_SAPLING, 'dark_oak_sapling', 'dark_oak_sapling', 'dark_oak_sapling', 'dark_oak_sapling', plant('grass')),
  def(B.CHERRY_LOG, 'cherry_log', 'cherry_log_top', 'cherry_log_top', 'cherry_log_side', { hardness: 2, tool: 'axe', sound: 'wood' }),
  def(B.CHERRY_LEAVES, 'cherry_leaves', 'cherry_leaves', 'cherry_leaves', 'cherry_leaves', { opaque: false, render: 'cutout', hardness: 0.2, cullSame: true, sound: 'leaves' }),
  def(B.CHERRY_SAPLING, 'cherry_sapling', 'cherry_sapling', 'cherry_sapling', 'cherry_sapling', plant('grass')),
  // ---- flowers, ferns, mushrooms, reeds ----
  def(B.FERN, 'fern', 'fern', 'fern', 'fern', plant('grass')),
  ...(
    [
      [B.TULIP_RED, 'red_tulip', 'tulip_red'],
      [B.TULIP_ORANGE, 'orange_tulip', 'tulip_orange'],
      [B.TULIP_WHITE, 'white_tulip', 'tulip_white'],
      [B.TULIP_PINK, 'pink_tulip', 'tulip_pink'],
      [B.OXEYE_DAISY, 'oxeye_daisy', 'oxeye_daisy'],
      [B.CORNFLOWER, 'cornflower', 'cornflower'],
      [B.ALLIUM, 'allium', 'allium'],
      [B.AZURE_BLUET, 'azure_bluet', 'azure_bluet'],
      [B.BLUE_ORCHID, 'blue_orchid', 'blue_orchid'],
    ] as const
  ).map(([id, name, tile]) => def(id, name, tile, tile, tile, plant('grass'))),
  def(B.BROWN_MUSHROOM, 'brown_mushroom', 'brown_mushroom', 'brown_mushroom', 'brown_mushroom', plant('grass')),
  def(B.RED_MUSHROOM, 'red_mushroom', 'red_mushroom', 'red_mushroom', 'red_mushroom', plant('grass')),
  def(B.SUGAR_CANE, 'sugar_cane', 'sugar_cane', 'sugar_cane', 'sugar_cane', plant('grass')),
  def(B.LILY_PAD, 'lily_pad', 'lily_pad', 'lily_pad', 'lily_pad', { solid: false, opaque: false, render: 'cutout', shape: 'flat', hardness: 0, sound: 'grass' }),
  def(B.PINK_PETALS, 'pink_petals', 'pink_petals', 'pink_petals', 'pink_petals', { solid: false, opaque: false, render: 'cutout', shape: 'flat', hardness: 0, replaceable: true, sound: 'grass' }),
  // ---- the caves ----
  def(B.MOSS_BLOCK, 'moss_block', 'moss_block', 'moss_block', 'moss_block', { hardness: 0.1, tool: 'shovel', sound: 'grass' }),
  def(B.CAVE_VINES, 'cave_vines', 'cave_vines', 'cave_vines', 'cave_vines', plant('grass')),
  def(B.CAVE_VINES_BERRIES, 'glow_berry_vines', 'cave_vines_berries', 'cave_vines_berries', 'cave_vines_berries', { ...plant('grass'), light: 12 }),
  def(B.FLOWERING_AZALEA, 'flowering_azalea', 'flowering_azalea', 'flowering_azalea', 'flowering_azalea', plant('leaves')),
  def(B.SPORE_BLOSSOM, 'spore_blossom', 'spore_blossom', 'spore_blossom', 'spore_blossom', plant('grass')),
  def(B.DRIPSTONE_BLOCK, 'dripstone_block', 'dripstone_block', 'dripstone_block', 'dripstone_block', { hardness: 1.5, tool: 'pickaxe', harvest: 1, sound: 'stone' }),
  def(B.STALAGMITE_BASE, 'stalagmite', 'stalagmite_base', 'stalagmite_base', 'stalagmite_base', { ...plant('stone'), hardness: 0.4 }),
  def(B.STALAGMITE_TIP, 'stalagmite_tip', 'stalagmite_tip', 'stalagmite_tip', 'stalagmite_tip', { ...plant('stone'), hardness: 0.4 }),
  def(B.STALACTITE_BASE, 'stalactite', 'stalactite_base', 'stalactite_base', 'stalactite_base', { ...plant('stone'), hardness: 0.4 }),
  def(B.STALACTITE_TIP, 'stalactite_tip', 'stalactite_tip', 'stalactite_tip', 'stalactite_tip', { ...plant('stone'), hardness: 0.4 }),
  def(B.GLOW_LICHEN, 'glow_lichen', 'glow_lichen', 'glow_lichen', 'glow_lichen', { solid: false, opaque: false, render: 'cutout', shape: 'flat', hardness: 0, replaceable: true, light: 7, sound: 'grass' }),
  def(B.AMETHYST_BLOCK, 'amethyst_block', 'amethyst_block', 'amethyst_block', 'amethyst_block', { hardness: 1.5, tool: 'pickaxe', harvest: 1, light: 3, sound: 'glass' }),
  def(B.BUDDING_AMETHYST, 'budding_amethyst', 'budding_amethyst', 'budding_amethyst', 'budding_amethyst', { hardness: 1.5, tool: 'pickaxe', harvest: 1, light: 3, sound: 'glass' }),
  def(B.AMETHYST_CLUSTER, 'amethyst_cluster', 'amethyst_cluster', 'amethyst_cluster', 'amethyst_cluster', { ...plant('glass'), hardness: 1.5, tool: 'pickaxe', light: 6 }),
  def(B.CALCITE, 'calcite', 'calcite', 'calcite', 'calcite', { hardness: 0.75, tool: 'pickaxe', harvest: 1, sound: 'stone' }),
  def(B.SMOOTH_BASALT, 'smooth_basalt', 'smooth_basalt', 'smooth_basalt', 'smooth_basalt', { hardness: 1.25, tool: 'pickaxe', harvest: 1, sound: 'stone' }),
  def(B.SCULK, 'sculk', 'sculk', 'sculk', 'sculk', { hardness: 0.6, tool: 'hoe', sound: 'grass' }),
  // Lanterns glow without fuel; they sit on a block or hang from one (or from a chain). You can walk through them.
  ...([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ] as const).map(([soul, hanging]) => {
    const name = soul ? 'soul_lantern' : 'lantern';
    return def(lanternId(soul, hanging), name, `${name}_top`, `${name}_top`, hanging ? `${name}_hang` : name, {
      solid: false,
      opaque: false,
      render: 'cutout',
      shape: 'lantern',
      hardness: 3.5,
      tool: 'pickaxe',
      light: soul ? SOUL_LANTERN_LIGHT : LANTERN_LIGHT,
      sound: 'stone',
    });
  }),
  def(B.CHAIN, 'chain', 'chain', 'chain', 'chain', { solid: false, opaque: false, render: 'cutout', shape: 'chain', hardness: 5, tool: 'pickaxe', sound: 'stone' }),
];

const AIR_DEF = DEFS[0];

/** Dense lookup by id (unknown ids resolve to air). */
export const BLOCKS: BlockDef[] = Array.from({ length: BLOCK_COUNT }, () => AIR_DEF);
for (const d of DEFS) BLOCKS[d.id] = d;

export const IS_OPAQUE = new Uint8Array(BLOCK_COUNT);
export const IS_SOLID = new Uint8Array(BLOCK_COUNT);
export const IS_LIQUID = new Uint8Array(BLOCK_COUNT);
/** Sand and gravel fall when nothing holds them up. */
export const FALLS = new Uint8Array(BLOCK_COUNT);
FALLS[B.SAND] = 1;
FALLS[B.GRAVEL] = 1;
FALLS[B.RED_SAND] = 1;
FALLS[B.ANVIL] = 1;
FALLS[B.ANVIL_CHIPPED] = 1;
FALLS[B.ANVIL_DAMAGED] = 1;
export const LIGHT_EMIT = new Uint8Array(BLOCK_COUNT);
/** The leaves of every kind of tree, and the logs they sit on. */
export const LEAF_BLOCKS: readonly number[] = [B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.ACACIA_LEAVES, B.JUNGLE_LEAVES, B.DARK_OAK_LEAVES, B.CHERRY_LEAVES];
export const LOG_BLOCKS: readonly number[] = [B.LOG, B.BIRCH_LOG, B.SPRUCE_LOG, B.ACACIA_LOG, B.JUNGLE_LOG, B.DARK_OAK_LOG, B.CHERRY_LOG];
export const IS_LEAVES = new Uint8Array(BLOCK_COUNT);
for (const id of LEAF_BLOCKS) IS_LEAVES[id] = 1;
export const IS_LOG = new Uint8Array(BLOCK_COUNT);
for (const id of LOG_BLOCKS) IS_LOG[id] = 1;
/** Leaves that take the colour of the biome (the others, birch, spruce and cherry, keep their own). */
export const IS_TINTED_LEAVES = new Uint8Array(BLOCK_COUNT);
for (const id of [B.LEAVES, B.ACACIA_LEAVES, B.JUNGLE_LEAVES, B.DARK_OAK_LEAVES]) IS_TINTED_LEAVES[id] = 1;
/** Plants painted in grey-green that take the biome's grass colour. */
export const IS_TINTED_PLANT = new Uint8Array(BLOCK_COUNT);
IS_TINTED_PLANT[B.TALL_GRASS] = 1;
IS_TINTED_PLANT[B.FERN] = 1;
/** Beds are knee-high, so you can step onto them. */
export const BED_HEIGHT = 9 / 16;
/** Solid blocks that fill only part of their cell (beds, slabs, stairs, doors, fences...): see shapes.ts. */
export const IS_PARTIAL = new Uint8Array(BLOCK_COUNT);
for (const d of DEFS) {
  if (d.solid && d.shape !== 'cube') IS_PARTIAL[d.id] = 1;
  IS_OPAQUE[d.id] = d.opaque ? 1 : 0;
  IS_SOLID[d.id] = d.solid ? 1 : 0;
  IS_LIQUID[d.id] = d.liquid ? 1 : 0;
  LIGHT_EMIT[d.id] = d.light;
}

/** The wool block of a dye colour (0 = white, plain wool). */
export function woolId(color: number): number {
  return color <= 0 ? B.WOOL : B.WOOL_COLOR_BASE + color - 1;
}

/** The dye colour of a wool block (0 for plain wool), or -1 if the block is not wool. */
export function woolColor(id: number): number {
  if (id === B.WOOL) return 0;
  const i = id - B.WOOL_COLOR_BASE;
  return i >= 0 && i < DYE_COUNT - 1 ? i + 1 : -1;
}

/** The anvil in any of its three states of wear. */
export const isAnvil = (id: number): boolean => id === B.ANVIL || id === B.ANVIL_CHIPPED || id === B.ANVIL_DAMAGED;

/** Blocks with a right-click interface (GUI) rather than placing a block against them. */
export function isInteractive(id: number): boolean {
  return id === B.CRAFTING_TABLE || id === B.FURNACE || id === B.CHEST || id === B.ENCHANTING_TABLE || isAnvil(id) || id === B.GRINDSTONE || isBed(id) || isSwitchable(id) || leverInfo(id) !== null || buttonInfo(id) !== null;
}

/** Doors, trapdoors and fence gates open and close when used. */
export function isSwitchable(id: number): boolean {
  return doorInfo(id) !== null || trapdoorInfo(id) !== null || gateInfo(id) !== null;
}

export function isBed(id: number): boolean {
  return (id >= B.BED_FOOT_PX && id <= B.BED_HEAD_NZ) || (id >= B.BED_COLOR_BASE && id < B.BED_COLOR_BASE + (DYE_COUNT - 1) * 4);
}

/** Unit steps toward the head for the four bed directions: +x, -x, +z, -z. */
export const BED_DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export interface BedInfo {
  head: boolean;
  /** 0..3 into BED_DIRS: the way the bed points, from its foot toward its head. */
  dir: number;
  dx: number;
  dz: number;
  /** The dye colour of a foot half; -1 for a head half, which takes the colour of the foot beside it. */
  color: number;
}

/** What a bed block is (null for anything else). */
export function bedInfo(id: number): BedInfo | null {
  if (!isBed(id)) return null;
  if (id >= B.BED_COLOR_BASE) {
    const k = Math.floor((id - B.BED_COLOR_BASE) / 4);
    const dir = (id - B.BED_COLOR_BASE) % 4;
    return { head: false, dir, dx: BED_DIRS[dir][0], dz: BED_DIRS[dir][1], color: k < BED_RED ? k : k + 1 };
  }
  const head = id >= B.BED_HEAD_PX;
  const dir = (id - B.BED_FOOT_PX) % 4;
  return { head, dir, dx: BED_DIRS[dir][0], dz: BED_DIRS[dir][1], color: head ? -1 : BED_RED };
}

/** The block id of one half of a bed pointing in the given direction (the colour only matters for the foot). */
export function bedId(head: boolean, dir: number, color: number = BED_RED): number {
  return head ? B.BED_HEAD_PX + dir : bedFootBase(color) + dir;
}
