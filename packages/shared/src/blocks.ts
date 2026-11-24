import { ARMOR_MATERIALS, ARMOR_SLOTS, OUTFIT_CLASSES } from './armor';
import { COMPANIONS } from './companions';
import { WINGS } from './wings';
import { ACCESSORY_KINDS, ACCESSORY_MATERIALS } from './accessories';
import { OUTFITS } from './outfitData';
import { HK_ITEM_NAMES } from './hollowKingData';
import { layoutMasonry, MASONRY_SPECS, MASONRY_TILE_RGB, type MasonryRow } from './masonry';
import { IRON_KIND, JOINERY_TILE_RGB, layoutJoinery, type JoineryLayout } from './joinery';
import { GROVE_TILE_RGB, layoutGrove, type GroveLayout, type GroveWood } from './grove';
import { DRESS_TILE_RGB, DYE_ORDER, EXTRA_TERRACOTTA, POT_COUNT, layoutDressing, type DressingLayout } from './dressing';
import { BEYOND_CUBES, BEYOND_PLANTS, BEYOND_SHAPES, beyondFaceTile, beyondTiles, layoutBeyond, type BeyondLayout } from './beyondBlocks';
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

/** Faces for the blocks added after the dressing set: nether bricks, quartz, and the quartz pillar. */
export const CONNECT_TILE_RGB: Record<string, readonly [number, number, number]> = {
  nether_bricks: [48, 20, 24],
  quartz_block: [236, 230, 224],
  quartz_pillar: [232, 226, 218],
};

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
  'potato_0',
  'potato_1',
  'potato_2',
  'potato_3',
  'carrot_0',
  'carrot_1',
  'carrot_2',
  'carrot_3',
  'melon_stem_0',
  'melon_stem_1',
  'melon_stem_2',
  'melon_stem_3',
  'pumpkin_stem_0',
  'pumpkin_stem_1',
  'pumpkin_stem_2',
  'pumpkin_stem_3',
  'beetroot_0',
  'beetroot_1',
  'beetroot_2',
  'beetroot_3',
  'cocoa_0',
  'cocoa_1',
  'cocoa_2',
  'cake_top',
  'cake_side',
  'cake_bottom',
  'sweet_berry_0',
  'sweet_berry_1',
  'sweet_berry_2',
  'sweet_berry_3',
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
  // Four frames of the flame on a torch. They must stay next to each other: the chunk shader cycles through them.
  'torch_flame_0',
  'torch_flame_1',
  'torch_flame_2',
  'torch_flame_3',
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
  'campfire',
  ...Object.keys(MASONRY_TILE_RGB),
  ...Object.keys(JOINERY_TILE_RGB),
  ...Object.keys(GROVE_TILE_RGB),
  ...Object.keys(DRESS_TILE_RGB),
  ...Object.keys(CONNECT_TILE_RGB),
  ...Object.keys(beyondTiles()),
];

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
  'potato',
  'baked_potato',
  'poisonous_potato',
  'melon_slice',
  'sugar',
  'egg',
  'pumpkin_pie',
  'carrot',
  'melon_seeds',
  'pumpkin_seeds',
  'beetroot_seeds',
  'beetroot',
  'bowl',
  'beetroot_soup',
  'cocoa_beans',
  'cookie',
  'milk_bucket',
  'cake',
  'sweet_berries',
  'glow_berries',
  'mushroom_stew',
  'rabbit_stew',
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
  'codex_of_aurelion',
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
  'flower_pot_item',
  'armor_stand',
  'fishing_rod',
  'fishing_rod_cast',
  'raw_cod',
  'cooked_cod',
  'raw_salmon',
  'cooked_salmon',
  'tropical_fish',
  'pufferfish',
  'warden_scroll',
  'hollow_bone',
  'hollow_sigil',
  // the glowing sets of the token shop, one picture each (new sets go at the end of OUTFITS, so the pictures keep their places)
  ...OUTFITS.map((o) => `outfit_set_${o.id}`),
  // the parts of the companions and the companions (new ones go at the end of COMPANIONS)
  'imp_horn',
  'cinder_heart',
  'seraph_feather',
  'halo_ring',
  ...COMPANIONS.map((c) => `companion_${c.id}`),
  // the frame and the feather of the wings, and the wings (new ones go at the end of WINGS)
  'wing_frame',
  'storm_feather',
  ...WINGS.map((w) => `wings_${w.id}`),
  // the rings and the necklaces (the same materials as the armor, see accessories.ts)
  ...ACCESSORY_KINDS.flatMap((k) => ACCESSORY_MATERIALS.map((m) => `${m}_${k}`)),
  // the quest items of the Adventure story (see questDrops.ts)
  'rift_singed_rag',
  'torn_satchel_scrap',
  'drowned_reed_charm',
  'reed_ember',
  'sun_scorched_tally',
  'caravan_tally_tag',
  'sand_ember',
  'frozen_ward_bell',
  'frost_ember',
  'warden_ledger_page',
  'ashen_medal',
  'throne_ember',
  'scorched_fuse',
  'sealed_coffer',
  'spore_jar',
  'bear_claw',
  'gilded_scale',
  'land_surveyor',
  // the relics of the Hollow King (see hollowKingData.ts)
  ...Object.values(HK_ITEM_NAMES),
  'cinderbolt_crossbow_frame',
] as const;

/** All atlas tiles: block textures first (stable indices), then item sprites. */
export const TILE_NAMES: readonly string[] = [...BLOCK_TILES, ...ITEM_TILES];

export type SoundKind = 'none' | 'stone' | 'dirt' | 'grass' | 'sand' | 'gravel' | 'wood' | 'glass' | 'leaves' | 'snow' | 'water';

/**
 * Texture atlas layout (tiles are square). 16 by 64 is 1024 tiles, twice the old 512.
 * The count stays a power of two: the world mesh packs a tile index into that many bits.
 */
export const ATLAS_COLS = 16;
export const ATLAS_ROWS = 64;
export const ATLAS_TILES = ATLAS_COLS * ATLAS_ROWS;
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
export const BLOCK_COUNT = 4096;

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
  /** Potato crop, youngest to ripe. The item that plants it is `I.POTATO`, not these blocks. */
  POTATO_0: 1195,
  POTATO_1: 1196,
  POTATO_2: 1197,
  POTATO_3: 1198,
  /** Carrot crop, youngest to ripe. The item that plants it is `I.CARROT`, not these blocks. */
  CARROT_0: 1199,
  CARROT_1: 1200,
  CARROT_2: 1201,
  CARROT_3: 1202,
  /** Melon stem, youngest to ripe. A ripe one grows a melon beside it. The item is `I.MELON_SEEDS`. */
  MELON_STEM_0: 1203,
  MELON_STEM_1: 1204,
  MELON_STEM_2: 1205,
  MELON_STEM_3: 1206,
  /** Pumpkin stem, youngest to ripe. A ripe one grows a pumpkin beside it. The item is `I.PUMPKIN_SEEDS`. */
  PUMPKIN_STEM_0: 1207,
  PUMPKIN_STEM_1: 1208,
  PUMPKIN_STEM_2: 1209,
  PUMPKIN_STEM_3: 1210,
  /** Beetroot crop, youngest to ripe. The item that plants it is `I.BEETROOT_SEEDS`, not these blocks. */
  BEETROOT_0: 1211,
  BEETROOT_1: 1212,
  BEETROOT_2: 1213,
  BEETROOT_3: 1214,
  /** First cocoa pod. Four facings, three ages each: `cocoaId(facing, stage)`. The item is `I.COCOA_BEANS`. */
  COCOA_BASE: 1215,
  /** A cake with no bites taken. The next six ids are the same cake with more bites gone. The item is `I.CAKE`. */
  CAKE_BASE: 1227,
  /** Sweet berry bush, youngest to ripe. The item that plants it is `I.SWEET_BERRIES`. */
  SWEET_BERRY_0: 1234,
  SWEET_BERRY_1: 1235,
  SWEET_BERRY_2: 1236,
  SWEET_BERRY_3: 1237,
  /** First campfire state. Four facings, each lit or out: `campfireId(facing, lit)`. The item is the lit one facing +x. */
  CAMPFIRE_BASE: 1238,
} as const;

/** The item id of redstone dust (items.ts I.REDSTONE; here so block drops can name it). */
export const REDSTONE_ITEM = 389;

/** The first foot id of a bed colour (the red bed keeps the original ids). */
function bedFootBase(color: number): number {
  return color === BED_RED ? B.BED_FOOT_PX : B.BED_COLOR_BASE + (color < BED_RED ? color : color - 1) * 4;
}

export type RenderClass = 'opaque' | 'cutout' | 'translucent';

/** How a block is meshed. Everything except 'cube' is non-opaque and drawn with alpha testing. */
export type BlockShape = 'cube' | 'cross' | 'crop' | 'torch' | 'flat' | 'bed' | 'slab' | 'stair' | 'door' | 'trapdoor' | 'ladder' | 'fence' | 'gate' | 'pane' | 'table' | 'lever' | 'button' | 'plate' | 'lantern' | 'chain' | 'cocoa' | 'cake' | 'campfire' | 'wall' | 'candle' | 'banner' | 'sign' | 'pot' | 'chest';

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
  /**
   * Which way a log or pillar lies. 0 puts the end texture on the east and west faces, 2 on the
   * north and south faces. Absent means the ordinary upright block.
   */
  axis?: 0 | 2;
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

const laidMasonry = layoutMasonry(MASONRY_SPECS);
/** Slabs, stairs and walls past the original five materials, in id order. */
export const MASONRY: readonly MasonryRow[] = laidMasonry.rows;
/** First block id still free after the masonry. The wood set starts here. */
export const MASONRY_NEXT = laidMasonry.next;
const laidJoinery = layoutJoinery(MASONRY_NEXT);
/** Doors, fences, stripped logs and the rest of each wood. */
export const JOINERY: JoineryLayout = laidJoinery;
/** The first block id after the wood set. */
export const JOINERY_NEXT = laidJoinery.next;
const laidGrove = layoutGrove(JOINERY_NEXT);
/** Bamboo, mangrove, pale oak, and the plants that grow with them. */
export const GROVE: GroveLayout = laidGrove;
/** The first block id after that set. */
export const GROVE_NEXT = laidGrove.next;
const laidDress = layoutDressing(GROVE_NEXT);
/** Coloured glass, carpets, concrete, candles, banners, pots, bars, dressed stone and signs. */
export const DRESS: DressingLayout = laidDress;
/** The first block id after the dressing. */
export const DRESS_NEXT = laidDress.next;

const SLAB_EXTRA = new Map<number, { mat: number; top: boolean }>();
const STAIR_EXTRA = new Map<number, { mat: number; top: boolean; dir: number }>();
const WALL_EXTRA = new Map<number, number>();
/** Slabs and stairs that are not part of the masonry table (mud bricks, bamboo, mangrove, pale oak). */
const SHAPE_FULL = new Map<number, number>();
const SHAPE_SLAB = new Map<number, number>();
const SHAPE_STAIR = new Map<number, number>();
let shapeMat = BUILD_MATERIALS.length + MASONRY.length;
for (const row of MASONRY) {
  const mat = BUILD_MATERIALS.length + row.index;
  if (row.slabBase >= 0) {
    SLAB_EXTRA.set(row.slabBase, { mat, top: false });
    SLAB_EXTRA.set(row.slabBase + 1, { mat, top: true });
  }
  if (row.stairBase >= 0) {
    for (let k = 0; k < 8; k++) STAIR_EXTRA.set(row.stairBase + k, { mat, top: (k & 4) !== 0, dir: k & 3 });
  }
  if (row.wallId) WALL_EXTRA.set(row.wallId, mat);
}

export const slabId = (mat: number, top: boolean): number => {
  if (mat < BUILD_MATERIALS.length) return B.SLAB_BASE + mat * 2 + (top ? 1 : 0);
  const row = MASONRY[mat - BUILD_MATERIALS.length];
  if (row) return row.slabBase + (top ? 1 : 0);
  const base = SHAPE_SLAB.get(mat);
  return base === undefined ? 0 : base + (top ? 1 : 0);
};
export const stairId = (mat: number, top: boolean, dir: number): number => {
  if (mat < BUILD_MATERIALS.length) return B.STAIR_BASE + mat * 8 + (top ? 4 : 0) + (dir & 3);
  const row = MASONRY[mat - BUILD_MATERIALS.length];
  if (row) return row.stairBase + (top ? 4 : 0) + (dir & 3);
  const base = SHAPE_STAIR.get(mat);
  return base === undefined ? 0 : base + (top ? 4 : 0) + (dir & 3);
};
/** Extra doors, trapdoors and gates. Kind 0 is the original oak set and is not stored here. */
const DOOR_KIND = new Map<number, number>();
const DOOR_BASE_OF = new Map<number, number>();
const TRAP_KIND = new Map<number, number>();
const TRAP_BASE_OF = new Map<number, number>();
const GATE_KIND = new Map<number, number>();
const GATE_BASE_OF = new Map<number, number>();
const FENCE_IDS = new Set<number>();
const BUTTON_OF = new Map<number, number>();
const PLATE_OF = new Map<number, { wood: boolean; on: boolean; off: number; onId: number }>();
const NO_HAND_DOOR = new Set<number>();
const NO_HAND_TRAP = new Set<number>();
const JOINERY_FUEL: number[] = [];
const JOINERY_DOORS: { id: number; fuel: number }[] = [];
const JOINERY_ICONS: { id: number; tile: string }[] = [];
const JOINERY_BURN_PLANKS: number[] = [];
const JOINERY_BURN_LOGS: number[] = [];
const JOINERY_LOGS: number[] = [];
const GROVE_LEAVES: number[] = [];
const LEAF_OF = new Map<number, number>();
const STRIP = new Map<number, number>();

export const doorId = (upper: boolean, open: boolean, facing: number, kind = 0): number => {
  const base = kind === 0 ? B.DOOR_BASE : (DOOR_BASE_OF.get(kind) ?? B.DOOR_BASE);
  return base + (upper ? 8 : 0) + (open ? 4 : 0) + (facing & 3);
};
export const trapdoorId = (top: boolean, open: boolean, facing: number, kind = 0): number => {
  const base = kind === 0 ? B.TRAPDOOR_BASE : (TRAP_BASE_OF.get(kind) ?? B.TRAPDOOR_BASE);
  return base + (top ? 8 : 0) + (open ? 4 : 0) + (facing & 3);
};
export const ladderId = (facing: number): number => B.LADDER_BASE + facing;
/**
 * A gate only remembers the axis it blocks (facing 0/1 = along x, 2/3 = along z) and whether it is open; its
 * open leaves always swing out the same way. Kind 0 is the oak gate.
 */
export const gateId = (open: boolean, facing: number, kind = 0): number => {
  const base = kind === 0 ? B.GATE_BASE : (GATE_BASE_OF.get(kind) ?? B.GATE_BASE);
  return base + (open ? 2 : 0) + (facing >> 1);
};

const SLAB_COUNT = BUILD_MATERIALS.length * 2;
const STAIR_COUNT = BUILD_MATERIALS.length * 8;

export function slabInfo(id: number): { mat: number; top: boolean } | null {
  const i = id - B.SLAB_BASE;
  if (i >= 0 && i < SLAB_COUNT) return { mat: i >> 1, top: (i & 1) === 1 };
  return SLAB_EXTRA.get(id) ?? null;
}
/** `dir` is the way the high side of the stairs faces (away from the player who placed them). */
export function stairInfo(id: number): { mat: number; top: boolean; dir: number } | null {
  const i = id - B.STAIR_BASE;
  if (i >= 0 && i < STAIR_COUNT) return { mat: i >> 3, top: (i & 4) !== 0, dir: i & 3 };
  return STAIR_EXTRA.get(id) ?? null;
}
/** A cobblestone-style wall. The post and the arms are worked out from the neighbours. */
export function wallInfo(id: number): { mat: number } | null {
  const mat = WALL_EXTRA.get(id);
  return mat === undefined ? null : { mat };
}
/** The full block two slabs of this material join into, or 0 when they do not join. */
export function materialBlock(mat: number): number {
  if (mat < BUILD_MATERIALS.length) return BUILD_MATERIALS[mat].block;
  const row = MASONRY[mat - BUILD_MATERIALS.length];
  if (row) return row.blockId;
  return SHAPE_FULL.get(mat) ?? 0;
}
function packedDoor(id: number, oakBase: number, kinds: Map<number, number>, bases: Map<number, number>): number {
  if (id >= oakBase && id < oakBase + 16) return id - oakBase;
  const kind = kinds.get(id);
  if (kind === undefined) return -1;
  const base = bases.get(kind);
  if (base === undefined) return -1;
  const i = id - base;
  return i >= 0 && i < 16 ? i : -1;
}
/** `facing` is the edge of the cell the closed door stands on. */
export function doorInfo(id: number): { upper: boolean; open: boolean; facing: number } | null {
  const i = packedDoor(id, B.DOOR_BASE, DOOR_KIND, DOOR_BASE_OF);
  return i < 0 ? null : { upper: (i & 8) !== 0, open: (i & 4) !== 0, facing: i & 3 };
}
/** Which door set this block belongs to. 0 is the original oak door, including the wooden door item. */
export function doorKind(id: number): number {
  if (id >= B.DOOR_BASE && id < B.DOOR_BASE + 16) return 0;
  return DOOR_KIND.get(id) ?? 0;
}
/** `facing` is the edge the open trapdoor stands against (its hinge side). */
export function trapdoorInfo(id: number): { top: boolean; open: boolean; facing: number } | null {
  const i = packedDoor(id, B.TRAPDOOR_BASE, TRAP_KIND, TRAP_BASE_OF);
  return i < 0 ? null : { top: (i & 8) !== 0, open: (i & 4) !== 0, facing: i & 3 };
}
/** 0 is the original oak trapdoor. */
export function trapdoorKind(id: number): number {
  if (id >= B.TRAPDOOR_BASE && id < B.TRAPDOOR_BASE + 16) return 0;
  return TRAP_KIND.get(id) ?? 0;
}
/** `facing` is the edge the ladder is fixed to: the wall it hangs on is on that side. */
export function ladderInfo(id: number): { facing: number } | null {
  const i = id - B.LADDER_BASE;
  return i >= 0 && i < 4 ? { facing: i } : null;
}
/** Ages of a cocoa pod. Stage 2 is ripe. */
export const COCOA_STAGES = 3;
/** Four facings times three ages. */
export const COCOA_KINDS = 12;
/** A cocoa pod on the side `facing` points at (BED_DIRS), of the given age. */
export function cocoaId(facing: number, stage: number): number {
  return B.COCOA_BASE + facing * COCOA_STAGES + stage;
}
/** Facing and age of a cocoa pod, or null. */
export function cocoaInfo(id: number): { facing: number; stage: number } | null {
  const i = id - B.COCOA_BASE;
  if (i < 0 || i >= COCOA_KINDS) return null;
  return { facing: Math.floor(i / COCOA_STAGES), stage: i % COCOA_STAGES };
}
/** How many bites a cake has left to give. Seven bites, then it is gone. */
export const CAKE_BITES = 7;
/** A cake that has already been bitten `bites` times (0 is whole). */
export function cakeId(bites: number): number {
  return B.CAKE_BASE + bites;
}
/** How many bites have been taken, or null when this block is not a cake. */
export function cakeInfo(id: number): { bites: number } | null {
  const i = id - B.CAKE_BASE;
  if (i < 0 || i >= CAKE_BITES) return null;
  return { bites: i };
}
/** A campfire facing one of BED_DIRS, burning or put out. Eight states. */
export function campfireId(facing: number, lit: boolean): number {
  return B.CAMPFIRE_BASE + (facing & 3) * 2 + (lit ? 1 : 0);
}
/** Facing and whether the fire is burning, or null. */
export function campfireInfo(id: number): { facing: number; lit: boolean } | null {
  const i = id - B.CAMPFIRE_BASE;
  if (i < 0 || i >= 8) return null;
  return { facing: i >> 1, lit: (i & 1) === 1 };
}
/**
 * `facing` is 0 (the gate blocks walking along x) or 2 (along z), open or not; an open gate's leaves
 * swing out the positive side of the other axis.
 */
export function gateInfo(id: number): { open: boolean; facing: number } | null {
  let i = id - B.GATE_BASE;
  if (i < 0 || i >= 4) {
    const kind = GATE_KIND.get(id);
    const base = kind === undefined ? undefined : GATE_BASE_OF.get(kind);
    i = base === undefined ? -1 : id - base;
  }
  if (i < 0 || i >= 4) return null;
  return { open: i >= 2, facing: (i & 1) * 2 };
}
/** 0 is the original oak fence gate. */
export function gateKind(id: number): number {
  if (id >= B.GATE_BASE && id < B.GATE_BASE + 4) return 0;
  return GATE_KIND.get(id) ?? 0;
}
/** A fence post. Oak is the original fence; the other woods are registered beside it. */
export function isFence(id: number): boolean {
  return id === B.FENCE || FENCE_IDS.has(id);
}
/** Iron doors and iron trapdoors stay shut until redstone opens them. */
export function opensByHand(id: number): boolean {
  const door = DOOR_KIND.get(id);
  if (door !== undefined && NO_HAND_DOOR.has(door)) return false;
  const trap = TRAP_KIND.get(id);
  if (trap !== undefined && NO_HAND_TRAP.has(trap)) return false;
  return true;
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
for (const row of MASONRY) {
  if (row.slabBase >= 0) {
    BUILDING_ITEM[row.slabBase] = row.slabBase;
    BUILDING_ITEM[row.slabBase + 1] = row.slabBase;
    NO_ITEM_BLOCKS.add(row.slabBase + 1);
  }
  if (row.stairBase >= 0) {
    for (let k = 0; k < 8; k++) {
      BUILDING_ITEM[row.stairBase + k] = row.stairBase;
      if (k !== 0) NO_ITEM_BLOCKS.add(row.stairBase + k);
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
/** The off, floor-mounted state of this button, or -1. Stone uses BUTTON_BASE. */
export function buttonBase(id: number): number {
  if (id >= B.BUTTON_BASE && id < B.BUTTON_BASE + 10) return B.BUTTON_BASE;
  return BUTTON_OF.get(id) ?? -1;
}
export const buttonInfo = (id: number): MountedInfo | null => {
  const base = buttonBase(id);
  return base < 0 ? null : mountedInfo(base, id);
};
/** on means lit (a torch is lit unless something powers the block it hangs on). */
export const rtorchInfo = (id: number): MountedInfo | null => mountedInfo(B.RTORCH_BASE, id);
/** The way from a mounted block to the block holding it up: dx, dy, dz. */
export function mountSupport(face: number): [number, number, number] {
  if (face === 0) return [0, -1, 0];
  return [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]][face - 1] as [number, number, number];
}
export function plateInfo(id: number): { wood: boolean; on: boolean } | null {
  const extra = PLATE_OF.get(id);
  if (extra) return { wood: extra.wood, on: extra.on };
  if (id < B.PLATE_STONE || id > B.PLATE_WOOD_ON) return null;
  return { wood: id >= B.PLATE_WOOD, on: ((id - B.PLATE_STONE) & 1) === 1 };
}
/** The resting and the pressed block of a plate. */
export function platePair(id: number): { off: number; on: number } | null {
  const extra = PLATE_OF.get(id);
  if (extra) return { off: extra.off, on: extra.onId };
  if (id === B.PLATE_STONE || id === B.PLATE_STONE_ON) return { off: B.PLATE_STONE, on: B.PLATE_STONE_ON };
  if (id === B.PLATE_WOOD || id === B.PLATE_WOOD_ON) return { off: B.PLATE_WOOD, on: B.PLATE_WOOD_ON };
  return null;
}
/** What an axe turns this block into, or 0. */
export function strippedOf(id: number): number {
  return STRIP.get(id) ?? 0;
}
/** Log to stripped log, wood to stripped wood, stem to stripped stem. */
export function axeStripPairs(): readonly (readonly [number, number])[] {
  return [...STRIP];
}
/** Wooden blocks from the wood set that burn in a furnace. */
export function joineryFuel15(): readonly number[] {
  return JOINERY_FUEL;
}
/** Doors whose item opens as a door. Fuel is 10 for wood and 0 for iron. */
export function joineryDoorItems(): readonly { id: number; fuel: number }[] {
  return JOINERY_DOORS;
}
/** Item icons that should not look like a full plank. */
export function joineryIcons(): readonly { id: number; tile: string }[] {
  return JOINERY_ICONS;
}
/** Fences, doors and the other worked wood. Burns like planks. */
export function joineryBurnPlanks(): readonly number[] {
  return JOINERY_BURN_PLANKS;
}
/** Stripped logs, the poplar log, and the wood blocks. Burns like logs. */
export function joineryBurnLogs(): readonly number[] {
  return JOINERY_BURN_LOGS;
}
/** Leaves that drop a sapling and burn, and need shears to be picked up whole. */
export function groveLeaves(): readonly number[] {
  return GROVE_LEAVES;
}
/** The sapling a leaf block drops, or 0. */
export function leafSapling(id: number): number {
  return LEAF_OF.get(id) ?? 0;
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
// Every facing of a campfire, lit or out, is the one campfire item (the lit block facing +x).
for (let f = 0; f < 4; f++) {
  for (const lit of [false, true]) {
    const id = campfireId(f, lit);
    BUILDING_ITEM[id] = campfireId(0, true);
    if (id !== campfireId(0, true)) NO_ITEM_BLOCKS.add(id);
  }
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
    render: 'translucent',
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
  def(B.CHEST, 'chest', 'chest_top', 'chest_top', 'chest_side', { opaque: false, render: 'cutout', shape: 'chest', hardness: 2.5, tool: 'axe', sound: 'wood' }),
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
  def(B.PANE, 'glass_pane', 'glass', 'glass', 'glass', { opaque: false, render: 'translucent', shape: 'pane', hardness: 0.3, sound: 'glass' }),
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
  ...[B.POTATO_0, B.POTATO_1, B.POTATO_2, B.POTATO_3].map((id, i) =>
    def(id, 'potato', `potato_${i}`, `potato_${i}`, `potato_${i}`, { ...plant('grass'), shape: 'crop' }),
  ),
  ...[B.CARROT_0, B.CARROT_1, B.CARROT_2, B.CARROT_3].map((id, i) =>
    def(id, 'carrot', `carrot_${i}`, `carrot_${i}`, `carrot_${i}`, { ...plant('grass'), shape: 'crop' }),
  ),
  ...[B.MELON_STEM_0, B.MELON_STEM_1, B.MELON_STEM_2, B.MELON_STEM_3].map((id, i) =>
    def(id, 'melon_stem', `melon_stem_${i}`, `melon_stem_${i}`, `melon_stem_${i}`, { ...plant('grass'), shape: 'crop' }),
  ),
  ...[B.PUMPKIN_STEM_0, B.PUMPKIN_STEM_1, B.PUMPKIN_STEM_2, B.PUMPKIN_STEM_3].map((id, i) =>
    def(id, 'pumpkin_stem', `pumpkin_stem_${i}`, `pumpkin_stem_${i}`, `pumpkin_stem_${i}`, { ...plant('grass'), shape: 'crop' }),
  ),
  ...[B.BEETROOT_0, B.BEETROOT_1, B.BEETROOT_2, B.BEETROOT_3].map((id, i) =>
    def(id, 'beetroot', `beetroot_${i}`, `beetroot_${i}`, `beetroot_${i}`, { ...plant('grass'), shape: 'crop' }),
  ),
  ...[0, 1, 2, 3].flatMap((facing) =>
    [0, 1, 2].map((stage) =>
      def(cocoaId(facing, stage), 'cocoa', `cocoa_${stage}`, `cocoa_${stage}`, `cocoa_${stage}`, {
        solid: false,
        opaque: false,
        render: 'cutout',
        shape: 'cocoa',
        hardness: 0,
        sound: 'wood',
      }),
    ),
  ),
  ...[0, 1, 2, 3, 4, 5, 6].map((bites) =>
    def(cakeId(bites), 'cake', 'cake_top', 'cake_side', 'cake_bottom', {
      solid: true,
      opaque: false,
      render: 'cutout',
      shape: 'cake',
      hardness: 0.5,
      sound: 'grass',
    }),
  ),
  ...[B.SWEET_BERRY_0, B.SWEET_BERRY_1, B.SWEET_BERRY_2, B.SWEET_BERRY_3].map((id, i) =>
    def(id, 'sweet_berry_bush', `sweet_berry_${i}`, `sweet_berry_${i}`, `sweet_berry_${i}`, { ...plant('grass'), shape: 'crop' }),
  ),
  // A campfire is knee-high. Lit ones shine like fire; a shovel or a bucket of water puts them out.
  ...[0, 1, 2, 3].flatMap((f) =>
    [false, true].map((lit) =>
      def(campfireId(f, lit), 'campfire', 'campfire', 'campfire', 'campfire', {
        solid: true,
        opaque: false,
        render: 'cutout',
        shape: 'campfire',
        hardness: 2,
        tool: 'axe',
        sound: 'wood',
        light: lit ? MAX_LIGHT : 0,
      }),
    ),
  ),
];

for (const row of MASONRY) {
  if (!row.spec.from) continue;
  const src = DEFS.find((d) => d.id !== 0 && d.name === row.spec.from);
  if (!src) throw new Error(`masonry source ${row.spec.from} is not a block`);
  row.blockId = src.id;
}
for (const row of MASONRY) {
  const s = row.spec;
  const top = s.top ?? s.tile;
  const bottom = s.bottom ?? top;
  const side = s.side ?? s.tile;
  const opts = { hardness: s.hardness, tool: s.tool ?? undefined, harvest: s.harvest, sound: s.sound };
  if (row.cubeId) DEFS.push(def(row.cubeId, s.block!, top, bottom, side, opts));
  if (row.slabBase >= 0) {
    for (const up of [false, true]) {
      DEFS.push(def(row.slabBase + (up ? 1 : 0), `${s.name}_slab`, top, bottom, side, { ...opts, opaque: false, render: 'cutout', shape: 'slab' }));
    }
  }
  if (row.stairBase >= 0) {
    for (const up of [false, true]) {
      for (let dir = 0; dir < 4; dir++) {
        DEFS.push(def(row.stairBase + (up ? 4 : 0) + dir, `${s.name}_stairs`, top, bottom, side, { ...opts, opaque: false, render: 'cutout', shape: 'stair' }));
      }
    }
  }
  if (row.wallId) DEFS.push(def(row.wallId, `${s.name}_wall`, top, bottom, side, { ...opts, opaque: false, render: 'cutout', shape: 'wall' }));
}

/** A full block: a log, a wood block, or a stem. */
function joineryCube(id: number, name: string, top: string, side: string, sound: SoundKind = 'wood'): void {
  DEFS.push(def(id, name, top, top, side, { hardness: 2, tool: 'axe', sound }));
}
function joineryDoor(base: number, name: string, lower: string, upper: string, kind: number, hand: boolean, sound: SoundKind, tool: 'axe' | 'pickaxe', hardness: number): void {
  DOOR_BASE_OF.set(kind, base);
  if (!hand) NO_HAND_DOOR.add(kind);
  for (const up of [false, true]) {
    for (const open of [false, true]) {
      for (let f = 0; f < 4; f++) {
        const id = base + (up ? 8 : 0) + (open ? 4 : 0) + f;
        DEFS.push(def(id, name, null, null, up ? upper : lower, { opaque: false, render: 'cutout', shape: 'door', hardness, tool, sound }));
        DOOR_KIND.set(id, kind);
        if (up || id !== base) NO_ITEM_BLOCKS.add(id);
        if (!up && id !== base) BUILDING_ITEM[id] = base;
        if (hand) JOINERY_BURN_PLANKS.push(id);
      }
    }
  }
  JOINERY_DOORS.push({ id: base, fuel: hand ? 10 : 0 });
}
function joineryTrap(base: number, name: string, tile: string, kind: number, hand: boolean, sound: SoundKind, tool: 'axe' | 'pickaxe', hardness: number): void {
  TRAP_BASE_OF.set(kind, base);
  if (!hand) NO_HAND_TRAP.add(kind);
  for (let i = 0; i < 16; i++) {
    const id = base + i;
    DEFS.push(def(id, name, tile, tile, tile, { opaque: false, render: 'cutout', shape: 'trapdoor', hardness, tool, sound }));
    TRAP_KIND.set(id, kind);
    BUILDING_ITEM[id] = base;
    if (id !== base) NO_ITEM_BLOCKS.add(id);
    if (hand) JOINERY_BURN_PLANKS.push(id);
  }
  if (hand) JOINERY_FUEL.push(base);
}
function joineryGate(base: number, name: string, tile: string, kind: number): void {
  GATE_BASE_OF.set(kind, base);
  for (let i = 0; i < 4; i++) {
    const id = base + i;
    DEFS.push(def(id, name, tile, tile, tile, { opaque: false, render: 'cutout', shape: 'gate', hardness: 2, tool: 'axe', sound: 'wood' }));
    GATE_KIND.set(id, kind);
    BUILDING_ITEM[id] = base;
    if (id !== base) NO_ITEM_BLOCKS.add(id);
    JOINERY_BURN_PLANKS.push(id);
  }
  JOINERY_FUEL.push(base);
}
function joineryButton(base: number, name: string, tile: string, sound: SoundKind): void {
  for (let i = 0; i < 10; i++) {
    DEFS.push(def(base + i, name, tile, tile, tile, { solid: false, opaque: false, render: 'cutout', shape: 'button', hardness: 0.5, sound }));
    BUTTON_OF.set(base + i, base);
    BUILDING_ITEM[base + i] = base;
    if (i !== 0) NO_ITEM_BLOCKS.add(base + i);
    if (sound === 'wood') JOINERY_BURN_PLANKS.push(base + i);
  }
  if (sound === 'wood') JOINERY_FUEL.push(base);
}
function joineryPlate(off: number, name: string, tile: string, wood: boolean, sound: SoundKind, tool: 'axe' | 'pickaxe'): void {
  const opts = { solid: false, opaque: false, render: 'cutout' as const, shape: 'plate' as const, hardness: 0.5, tool, sound };
  DEFS.push(def(off, name, tile, tile, tile, opts));
  DEFS.push(def(off + 1, name, tile, tile, tile, opts));
  PLATE_OF.set(off, { wood, on: false, off, onId: off + 1 });
  PLATE_OF.set(off + 1, { wood, on: true, off, onId: off + 1 });
  BUILDING_ITEM[off + 1] = off;
  NO_ITEM_BLOCKS.add(off + 1);
  if (wood) {
    JOINERY_FUEL.push(off);
    JOINERY_BURN_PLANKS.push(off, off + 1);
  }
}

joineryCube(JOINERY.poplarLog, 'poplar_log', 'poplar_log_top', 'poplar_bark');
JOINERY_FUEL.push(JOINERY.poplarLog);
JOINERY_BURN_LOGS.push(JOINERY.poplarLog);
JOINERY_LOGS.push(JOINERY.poplarLog);
for (const n of JOINERY.nether) {
  const side = `${n.name}_stem_side`;
  const top = `${n.name}_stem_top`;
  const bare = `stripped_${n.name}`;
  joineryCube(n.stem, `${n.name}_stem`, top, side);
  joineryCube(n.hyphae, `${n.name}_hyphae`, side, side);
  joineryCube(n.strippedStem, `stripped_${n.name}_stem`, top, bare);
  joineryCube(n.strippedHyphae, `stripped_${n.name}_hyphae`, bare, bare);
  JOINERY_FUEL.push(n.stem, n.hyphae, n.strippedStem, n.strippedHyphae);
  JOINERY_LOGS.push(n.stem);
}
for (const w of JOINERY.woods) {
  const s = w.spec;
  const bare = `${s.name}_stripped`;
  joineryCube(w.wood, `${s.name}_wood`, s.barkTile, s.barkTile);
  joineryCube(w.strippedLog, `stripped_${s.name}_log`, s.topTile, bare);
  joineryCube(w.strippedWood, `stripped_${s.name}_wood`, bare, bare);
  JOINERY_FUEL.push(w.wood, w.strippedLog, w.strippedWood);
  JOINERY_BURN_LOGS.push(w.wood, w.strippedLog, w.strippedWood);
  JOINERY_LOGS.push(w.strippedLog);
  joineryButton(w.button, `${s.name}_button`, s.planksTile, 'wood');
  JOINERY_ICONS.push({ id: w.button, tile: `${s.name}_button` });
  if (!s.full || !w.door) continue;
  joineryDoor(w.door, `${s.name}_door`, `${s.name}_door_lower`, `${s.name}_door_upper`, w.kind, true, 'wood', 'axe', 3);
  joineryTrap(w.trapdoor, `${s.name}_trapdoor`, `${s.name}_trapdoor`, w.kind, true, 'wood', 'axe', 3);
  DEFS.push(def(w.fence, `${s.name}_fence`, s.planksTile, s.planksTile, s.planksTile, { opaque: false, render: 'cutout', shape: 'fence', hardness: 2, tool: 'axe', sound: 'wood' }));
  FENCE_IDS.add(w.fence);
  JOINERY_FUEL.push(w.fence);
  JOINERY_BURN_PLANKS.push(w.fence);
  joineryGate(w.gate, `${s.name}_fence_gate`, s.planksTile, w.kind);
  joineryPlate(w.plate, `${s.name}_pressure_plate`, s.planksTile, true, 'wood', 'axe');
  JOINERY_ICONS.push({ id: w.fence, tile: `${s.name}_fence` }, { id: w.gate, tile: `${s.name}_gate` }, { id: w.plate, tile: `${s.name}_plate` });
}
joineryDoor(JOINERY.ironDoor, 'iron_door', 'iron_door_lower', 'iron_door_upper', IRON_KIND, false, 'stone', 'pickaxe', 5);
joineryTrap(JOINERY.ironTrapdoor, 'iron_trapdoor', 'iron_trapdoor', IRON_KIND, false, 'stone', 'pickaxe', 5);
joineryPlate(JOINERY.heavyPlate, 'heavy_weighted_pressure_plate', 'heavy_plate', false, 'stone', 'pickaxe');
joineryPlate(JOINERY.lightPlate, 'light_weighted_pressure_plate', 'light_plate', false, 'stone', 'pickaxe');

function grovePlant(id: number, name: string, tile: string, sound: SoundKind = 'grass'): void {
  DEFS.push(def(id, name, tile, tile, tile, { solid: false, opaque: false, render: 'cutout', shape: 'cross', hardness: 0, sound }));
}
function groveCube(id: number, name: string, tile: string, sound: SoundKind, tool: 'axe' | 'pickaxe' | 'shovel', hardness: number): void {
  DEFS.push(def(id, name, tile, tile, tile, { hardness, tool, sound }));
}
function groveLeaf(id: number, name: string, tile: string, sapling: number): void {
  DEFS.push(def(id, name, tile, tile, tile, { opaque: false, render: 'cutout', hardness: 0.2, cullSame: true, sound: 'leaves' }));
  GROVE_LEAVES.push(id);
  LEAF_OF.set(id, sapling);
}
/** A slab, eight stairs and an optional wall, joined back into `full` when two slabs meet. */
function groveShapes(full: number, slabName: string, stairName: string, wallName: string, wall: number, tile: string, slab: number, stair: number, sound: SoundKind, tool: 'axe' | 'pickaxe', hardness: number, burn: boolean, harvest = 0): void {
  const mat = shapeMat++;
  SHAPE_FULL.set(mat, full);
  SHAPE_SLAB.set(mat, slab);
  SHAPE_STAIR.set(mat, stair);
  const opts = { hardness, tool, sound, harvest, opaque: false as const, render: 'cutout' as const };
  for (const up of [false, true]) {
    const id = slab + (up ? 1 : 0);
    DEFS.push(def(id, slabName, tile, tile, tile, { ...opts, shape: 'slab' }));
    SLAB_EXTRA.set(id, { mat, top: up });
    if (burn) JOINERY_BURN_PLANKS.push(id);
  }
  BUILDING_ITEM[slab + 1] = slab;
  NO_ITEM_BLOCKS.add(slab + 1);
  for (let k = 0; k < 8; k++) {
    const id = stair + k;
    DEFS.push(def(id, stairName, tile, tile, tile, { ...opts, shape: 'stair' }));
    STAIR_EXTRA.set(id, { mat, top: (k & 4) !== 0, dir: k & 3 });
    BUILDING_ITEM[id] = stair;
    if (k !== 0) NO_ITEM_BLOCKS.add(id);
    if (burn) JOINERY_BURN_PLANKS.push(id);
  }
  if (wall) {
    DEFS.push(def(wall, wallName, tile, tile, tile, { ...opts, shape: 'wall' }));
    WALL_EXTRA.set(wall, mat);
  }
  if (burn) JOINERY_FUEL.push(slab, stair);
}
function groveWood(w: GroveWood, logName: string, logTop: string, logSide: string): void {
  const planks = `${w.name}_planks`;
  joineryCube(w.log, logName, logTop, logSide);
  JOINERY_FUEL.push(w.log, w.strippedLog);
  JOINERY_BURN_LOGS.push(w.log, w.strippedLog);
  JOINERY_LOGS.push(w.log, w.strippedLog);
  if (w.wood) {
    joineryCube(w.wood, `${w.name}_wood`, logSide, logSide);
    joineryCube(w.strippedWood, `stripped_${w.name}_wood`, `${w.name}_stripped`, `${w.name}_stripped`);
    JOINERY_FUEL.push(w.wood, w.strippedWood);
    JOINERY_BURN_LOGS.push(w.wood, w.strippedWood);
  }
  joineryCube(w.strippedLog, `stripped_${logName}`, logTop, `${w.name}_stripped`);
  joineryCube(w.planks, planks, planks, planks);
  JOINERY_FUEL.push(w.planks);
  JOINERY_BURN_PLANKS.push(w.planks);
  groveShapes(w.planks, `${w.name}_slab`, `${w.name}_stairs`, '', 0, planks, w.slab, w.stair, 'wood', 'axe', 2, true);
  joineryDoor(w.door, `${w.name}_door`, `${w.name}_door_lower`, `${w.name}_door_upper`, w.kind, true, 'wood', 'axe', 3);
  joineryTrap(w.trapdoor, `${w.name}_trapdoor`, `${w.name}_trapdoor`, w.kind, true, 'wood', 'axe', 3);
  DEFS.push(def(w.fence, `${w.name}_fence`, planks, planks, planks, { opaque: false, render: 'cutout', shape: 'fence', hardness: 2, tool: 'axe', sound: 'wood' }));
  FENCE_IDS.add(w.fence);
  JOINERY_FUEL.push(w.fence);
  JOINERY_BURN_PLANKS.push(w.fence);
  joineryGate(w.gate, `${w.name}_fence_gate`, planks, w.kind);
  joineryButton(w.button, `${w.name}_button`, planks, 'wood');
  joineryPlate(w.plate, `${w.name}_pressure_plate`, planks, true, 'wood', 'axe');
  JOINERY_ICONS.push({ id: w.fence, tile: `${w.name}_fence` }, { id: w.gate, tile: `${w.name}_gate` }, { id: w.button, tile: `${w.name}_button` }, { id: w.plate, tile: `${w.name}_plate` });
  if (w.leaves) groveLeaf(w.leaves, `${w.name}_leaves`, `${w.name}_leaves`, w.sapling);
  if (w.sapling) grovePlant(w.sapling, w.name === 'mangrove' ? 'mangrove_propagule' : `${w.name}_sapling`, w.name === 'mangrove' ? 'mangrove_propagule' : `${w.name}_sapling`);
}

grovePlant(GROVE.azalea, 'azalea', 'azalea');
groveLeaf(GROVE.azaleaLeaves, 'azalea_leaves', 'azalea_leaves', GROVE.azalea);
groveLeaf(GROVE.floweringAzaleaLeaves, 'flowering_azalea_leaves', 'flowering_azalea_leaves', B.FLOWERING_AZALEA);
grovePlant(GROVE.hangingRoots, 'hanging_roots', 'hanging_roots');
DEFS.push(def(GROVE.mossCarpet, 'moss_carpet', 'moss_carpet', 'moss_carpet', 'moss_carpet', { solid: false, opaque: false, render: 'cutout', shape: 'flat', hardness: 0.1, tool: 'shovel', sound: 'grass' }));
groveCube(GROVE.rootedDirt, 'rooted_dirt', 'rooted_dirt', 'dirt', 'shovel', 0.5);
groveCube(GROVE.packedMud, 'packed_mud', 'packed_mud', 'dirt', 'shovel', 0.5);
groveCube(GROVE.mudBricks, 'mud_bricks', 'mud_bricks', 'stone', 'pickaxe', 1.5);
groveShapes(GROVE.mudBricks, 'mud_brick_slab', 'mud_brick_stairs', 'mud_brick_wall', GROVE.mudBrickWall, 'mud_bricks', GROVE.mudBrickSlab, GROVE.mudBrickStair, 'stone', 'pickaxe', 1.5, false);
groveCube(GROVE.mangroveRoots, 'mangrove_roots', 'mangrove_roots', 'wood', 'axe', 0.7);
groveCube(GROVE.muddyMangroveRoots, 'muddy_mangrove_roots', 'muddy_mangrove_roots', 'dirt', 'shovel', 0.7);
groveCube(GROVE.paleMoss, 'pale_moss_block', 'pale_moss_block', 'grass', 'shovel', 0.1);
DEFS.push(def(GROVE.paleMossCarpet, 'pale_moss_carpet', 'pale_moss_carpet', 'pale_moss_carpet', 'pale_moss_carpet', { solid: false, opaque: false, render: 'cutout', shape: 'flat', hardness: 0.1, tool: 'shovel', sound: 'grass' }));
grovePlant(GROVE.paleHangingMoss, 'pale_hanging_moss', 'pale_hanging_moss');
groveWood(GROVE.mangrove, 'mangrove_log', 'mangrove_log_top', 'mangrove_bark');
groveWood(GROVE.paleOak, 'pale_oak_log', 'pale_oak_log_top', 'pale_oak_bark');
grovePlant(GROVE.bamboo, 'bamboo', 'bamboo');
JOINERY_FUEL.push(GROVE.bamboo, GROVE.mangroveRoots);
JOINERY_BURN_PLANKS.push(GROVE.bamboo, GROVE.mangroveRoots);
groveWood(GROVE.bambooWood, 'bamboo_block', 'bamboo_block', 'bamboo_block');
groveCube(GROVE.mosaic, 'bamboo_mosaic', 'bamboo_mosaic', 'wood', 'axe', 2);
JOINERY_FUEL.push(GROVE.mosaic);
JOINERY_BURN_PLANKS.push(GROVE.mosaic);
groveShapes(GROVE.mosaic, 'bamboo_mosaic_slab', 'bamboo_mosaic_stairs', '', 0, 'bamboo_mosaic', GROVE.mosaicSlab, GROVE.mosaicStair, 'wood', 'axe', 2, true);

const woolTile = (color: number): string => (color === 0 ? 'wool' : `wool_${DYE_NAMES[color]}`);
const candleTile = (color: number): string => (color < 0 ? 'candle' : `candle_${DYE_NAMES[color]}`);
const dressCube = (id: number, name: string, tile: string, opts: DefOpts = {}): void => {
  DEFS.push(def(id, name, tile, tile, tile, opts));
};
groveShapes(DRESS.crackedStone, 'cracked_stone_brick_slab', 'cracked_stone_brick_stairs', 'cracked_stone_brick_wall', DRESS.crackedStoneWall, 'cracked_stone_bricks', DRESS.crackedStoneSlab, DRESS.crackedStoneStair, 'stone', 'pickaxe', 1.5, false);
dressCube(DRESS.crackedStone, 'cracked_stone_bricks', 'cracked_stone_bricks', { hardness: 1.5, tool: 'pickaxe', harvest: 1, sound: 'stone' });
dressCube(DRESS.chiseledStone, 'chiseled_stone_bricks', 'chiseled_stone_bricks', { hardness: 1.5, tool: 'pickaxe', harvest: 1, sound: 'stone' });
groveShapes(DRESS.crackedDeepslate, 'cracked_deepslate_brick_slab', 'cracked_deepslate_brick_stairs', 'cracked_deepslate_brick_wall', DRESS.crackedDeepslateWall, 'cracked_deepslate_bricks', DRESS.crackedDeepslateSlab, DRESS.crackedDeepslateStair, 'stone', 'pickaxe', 3.5, false);
dressCube(DRESS.crackedDeepslate, 'cracked_deepslate_bricks', 'cracked_deepslate_bricks', { hardness: 3.5, tool: 'pickaxe', harvest: 1, sound: 'stone' });
dressCube(DRESS.chiseledDeepslate, 'chiseled_deepslate', 'chiseled_deepslate', { hardness: 3.5, tool: 'pickaxe', harvest: 1, sound: 'stone' });
DEFS.push(def(DRESS.ironBars, 'iron_bars', 'iron_bars', 'iron_bars', 'iron_bars', { opaque: false, render: 'cutout', shape: 'pane', hardness: 5, tool: 'pickaxe', harvest: 1, sound: 'stone' }));
for (let c = 0; c < DYE_ORDER.length; c++) {
  const n = DYE_ORDER[c];
  dressCube(DRESS.glass + c, `${n}_stained_glass`, `stained_${n}`, { opaque: false, render: 'translucent', cullSame: true, hardness: 0.3, sound: 'glass' });
  DEFS.push(def(DRESS.pane + c, `${n}_stained_glass_pane`, `stained_${n}`, `stained_${n}`, `stained_${n}`, { opaque: false, render: 'translucent', shape: 'pane', hardness: 0.3, sound: 'glass' }));
  DEFS.push(def(DRESS.carpet + c, `${n}_carpet`, woolTile(c), woolTile(c), woolTile(c), { solid: false, opaque: false, render: 'cutout', shape: 'flat', hardness: 0.1, sound: 'grass' }));
  dressCube(DRESS.concrete + c, `${n}_concrete`, `concrete_${n}`, { hardness: 1.8, tool: 'pickaxe', harvest: 1, sound: 'stone' });
  dressCube(DRESS.glazed + c, `${n}_glazed_terracotta`, `glazed_${n}`, { hardness: 1.4, tool: 'pickaxe', harvest: 1, sound: 'stone' });
}
for (let i = 0; i < EXTRA_TERRACOTTA.length; i++) {
  const n = EXTRA_TERRACOTTA[i];
  dressCube(DRESS.terracotta + i, `${n}_terracotta`, `terracotta_${n}`, { hardness: 1.25, tool: 'pickaxe', harvest: 1, sound: 'stone' });
}
const addCandle = (base: number, color: number, name: string): void => {
  const tile = candleTile(color);
  for (let k = 0; k < 4; k++) {
    const id = base + k;
    DEFS.push(def(id, name, tile, tile, tile, { solid: false, opaque: false, render: 'cutout', shape: 'candle', hardness: 0.1, light: (k + 1) * 3, sound: 'wood' }));
    if (k > 0) {
      NO_ITEM_BLOCKS.add(id);
      BUILDING_ITEM[id] = base;
    }
  }
};
addCandle(DRESS.plainCandle, -1, 'candle');
for (let c = 0; c < DYE_ORDER.length; c++) addCandle(DRESS.dyeCandle + c * 4, c, `${DYE_ORDER[c]}_candle`);
for (let c = 0; c < DYE_ORDER.length; c++) {
  const tile = `banner_${DYE_ORDER[c]}`;
  const name = `${DYE_ORDER[c]}_banner`;
  for (let f = 0; f < 4; f++) {
    const floor = DRESS.bannerFloor + c * 4 + f;
    const wall = DRESS.bannerWall + c * 4 + f;
    DEFS.push(def(floor, name, tile, tile, tile, { solid: false, opaque: false, render: 'cutout', shape: 'banner', hardness: 1, tool: 'axe', sound: 'wood' }));
    DEFS.push(def(wall, name, tile, tile, tile, { solid: false, opaque: false, render: 'cutout', shape: 'banner', hardness: 1, tool: 'axe', sound: 'wood' }));
    if (f > 0) {
      NO_ITEM_BLOCKS.add(floor);
      BUILDING_ITEM[floor] = DRESS.bannerFloor + c * 4;
    }
    NO_ITEM_BLOCKS.add(wall);
    BUILDING_ITEM[wall] = DRESS.bannerFloor + c * 4;
  }
}
for (const s of DRESS.signs) {
  const tile = `${s.name}_sign`;
  const name = `${s.name}_sign`;
  for (let f = 0; f < 4; f++) {
    const stand = s.standing + f;
    const wall = s.wall + f;
    DEFS.push(def(stand, name, tile, tile, tile, { solid: false, opaque: false, render: 'cutout', shape: 'sign', hardness: 1, tool: 'axe', sound: 'wood' }));
    DEFS.push(def(wall, name, tile, tile, tile, { solid: false, opaque: false, render: 'cutout', shape: 'sign', hardness: 1, tool: 'axe', sound: 'wood' }));
    if (f > 0) {
      NO_ITEM_BLOCKS.add(stand);
      BUILDING_ITEM[stand] = s.standing;
    }
    NO_ITEM_BLOCKS.add(wall);
    BUILDING_ITEM[wall] = s.standing;
  }
  JOINERY_FUEL.push(s.standing);
  JOINERY_BURN_PLANKS.push(s.standing, s.standing + 1, s.standing + 2, s.standing + 3, s.wall, s.wall + 1, s.wall + 2, s.wall + 3);
}
DEFS.push(def(DRESS.pot, 'flower_pot', 'flower_pot', 'flower_pot', 'flower_pot', { opaque: false, render: 'cutout', shape: 'pot', hardness: 0, sound: 'stone' }));
const POT_PLANTS: readonly { name: string; tile: string; plant: number }[] = [
  { name: 'dandelion', tile: 'dandelion', plant: B.DANDELION },
  { name: 'rose', tile: 'rose', plant: B.ROSE },
  { name: 'tulip_red', tile: 'tulip_red', plant: B.TULIP_RED },
  { name: 'tulip_orange', tile: 'tulip_orange', plant: B.TULIP_ORANGE },
  { name: 'tulip_white', tile: 'tulip_white', plant: B.TULIP_WHITE },
  { name: 'tulip_pink', tile: 'tulip_pink', plant: B.TULIP_PINK },
  { name: 'oxeye_daisy', tile: 'oxeye_daisy', plant: B.OXEYE_DAISY },
  { name: 'cornflower', tile: 'cornflower', plant: B.CORNFLOWER },
  { name: 'allium', tile: 'allium', plant: B.ALLIUM },
  { name: 'azure_bluet', tile: 'azure_bluet', plant: B.AZURE_BLUET },
  { name: 'blue_orchid', tile: 'blue_orchid', plant: B.BLUE_ORCHID },
  { name: 'fern', tile: 'fern', plant: B.FERN },
  { name: 'red_mushroom', tile: 'red_mushroom', plant: B.RED_MUSHROOM },
  { name: 'brown_mushroom', tile: 'brown_mushroom', plant: B.BROWN_MUSHROOM },
  { name: 'sapling', tile: 'sapling', plant: B.SAPLING },
  { name: 'birch_sapling', tile: 'birch_sapling', plant: B.BIRCH_SAPLING },
  { name: 'spruce_sapling', tile: 'spruce_sapling', plant: B.SPRUCE_SAPLING },
  { name: 'jungle_sapling', tile: 'jungle_sapling', plant: B.JUNGLE_SAPLING },
  { name: 'acacia_sapling', tile: 'acacia_sapling', plant: B.ACACIA_SAPLING },
  { name: 'dark_oak_sapling', tile: 'dark_oak_sapling', plant: B.DARK_OAK_SAPLING },
  { name: 'cherry_sapling', tile: 'cherry_sapling', plant: B.CHERRY_SAPLING },
  { name: 'pale_oak_sapling', tile: 'pale_oak_sapling', plant: GROVE.paleOak.sapling },
  { name: 'mangrove_propagule', tile: 'mangrove_propagule', plant: GROVE.mangrove.sapling },
  { name: 'azalea', tile: 'azalea', plant: GROVE.azalea },
  { name: 'flowering_azalea', tile: 'flowering_azalea', plant: B.FLOWERING_AZALEA },
  { name: 'bamboo', tile: 'bamboo', plant: GROVE.bamboo },
];
if (POT_PLANTS.length !== POT_COUNT) throw new Error('flower pot count does not match the plants');
const POTTED_OF = new Map<number, number>();
POT_PLANTS.forEach((p, i) => {
  const id = DRESS.potted + i;
  DEFS.push(def(id, `potted_${p.name}`, p.tile, 'flower_pot', 'flower_pot', { opaque: false, render: 'cutout', shape: 'pot', hardness: 0, sound: 'stone' }));
  NO_ITEM_BLOCKS.add(id);
  POTTED_OF.set(p.plant, id);
});

/**
 * Logs and pillars keep their upright id. Clicking an east or west face places the east-west block,
 * and a north or south face places the north-south block. The new ids sit after the dressing set.
 */
const PILLAR_X = new Map<number, number>();
const PILLAR_Z = new Map<number, number>();
const PILLAR_BASE = new Map<number, number>();
let connectId = DRESS_NEXT;

function layAxis(base: number): void {
  const src = DEFS.find((d) => d.id === base);
  if (!src || src.shape !== 'cube' || src.tiles.top === src.tiles.side || PILLAR_X.has(base)) return;
  const x = connectId++;
  const z = connectId++;
  DEFS.push({ ...src, id: x, axis: 0 });
  DEFS.push({ ...src, id: z, axis: 2 });
  PILLAR_X.set(base, x);
  PILLAR_Z.set(base, z);
  PILLAR_BASE.set(x, base);
  PILLAR_BASE.set(z, base);
  NO_ITEM_BLOCKS.add(x);
  NO_ITEM_BLOCKS.add(z);
  BUILDING_ITEM[x] = base;
  BUILDING_ITEM[z] = base;
}

for (const id of [B.LOG, B.BIRCH_LOG, B.SPRUCE_LOG, B.ACACIA_LOG, B.JUNGLE_LOG, B.DARK_OAK_LOG, B.CHERRY_LOG]) layAxis(id);
for (const id of JOINERY_LOGS) layAxis(id);
for (const n of JOINERY.nether) layAxis(n.strippedStem);

const netherBricks = connectId++;
DEFS.push(def(netherBricks, 'nether_bricks', 'nether_bricks', 'nether_bricks', 'nether_bricks', { hardness: 2, tool: 'pickaxe', harvest: 1, sound: 'stone' }));
const netherSlab = connectId;
connectId += 2;
const netherStair = connectId;
connectId += 8;
const netherWall = connectId++;
groveShapes(netherBricks, 'nether_brick_slab', 'nether_brick_stairs', 'nether_brick_wall', netherWall, 'nether_bricks', netherSlab, netherStair, 'stone', 'pickaxe', 2, false, 1);

const quartz = connectId++;
DEFS.push(def(quartz, 'quartz_block', 'quartz_block', 'quartz_block', 'quartz_block', { hardness: 0.8, tool: 'pickaxe', harvest: 1, sound: 'stone' }));
const quartzSlab = connectId;
connectId += 2;
const quartzStair = connectId;
connectId += 8;
groveShapes(quartz, 'quartz_slab', 'quartz_stairs', '', 0, 'quartz_block', quartzSlab, quartzStair, 'stone', 'pickaxe', 0.8, false, 1);
const quartzPillar = connectId++;
DEFS.push(def(quartzPillar, 'quartz_pillar', 'quartz_block', 'quartz_pillar', 'quartz_pillar', { hardness: 0.8, tool: 'pickaxe', harvest: 1, sound: 'stone' }));
layAxis(quartzPillar);
if (connectId >= BLOCK_COUNT) throw new Error('connected blocks ran past the block id limit');

/** Nether bricks, quartz, and the quartz pillar. Their stairs, slabs and walls use the same rules as the older ones. */
export const CONNECT = {
  netherBricks,
  netherSlab,
  netherStair,
  netherWall,
  quartz,
  quartzSlab,
  quartzStair,
  quartzPillar,
  next: connectId + 12,
};

/**
 * A chest's front and which half of a double chest it is.
 * `dir` follows BED_DIRS (the latch faces that way). `half` is 0 single, 1 the left half, 2 the right half,
 * seen by someone looking at the latch. B.CHEST is the single chest facing +x, which is also the item.
 */
const CHEST_SPAN = 12;
export const CHEST_BASE = connectId;
connectId += CHEST_SPAN;
/** Clockwise from above: +x, +z, -x, -z. */
export const CHEST_CW = [2, 3, 1, 0];
/** Counter-clockwise from above: +x, -z, -x, +z. */
export const CHEST_CCW = [3, 2, 0, 1];

for (let i = 0; i < CHEST_SPAN; i++) {
  const id = CHEST_BASE + i;
  DEFS.push(def(id, 'chest', 'chest_top', 'chest_top', 'chest_side', { opaque: false, render: 'cutout', shape: 'chest', hardness: 2.5, tool: 'axe', sound: 'wood' }));
  NO_ITEM_BLOCKS.add(id);
  BUILDING_ITEM[id] = B.CHEST;
}

// ---- The World Beyond: stones, soils, woods, crystals, corals and glowing plants (see beyondBlocks.ts) ----------------
// Laid out in one fixed run right after the chests, so no older id moves. The sideways forms of its logs come after the run.
const laidBeyond = layoutBeyond(connectId);
connectId = laidBeyond.next;
export const BEYOND: BeyondLayout = laidBeyond;
/** Block ids of The World Beyond by key (`BB.limestone`). */
export const BB: Readonly<Record<string, number>> = laidBeyond.id;
const BEYOND_SOUND: Record<string, SoundKind> = { stone: 'stone', wood: 'wood', grass: 'grass', dirt: 'dirt', sand: 'sand', glass: 'glass', gravel: 'gravel', snow: 'snow', leaves: 'leaves' };
const BEYOND_LOGS: number[] = [];
for (const cube of BEYOND_CUBES) {
  const id = laidBeyond.id[cube.key];
  const tiles = cube.faces === 'one' ? [cube.key, cube.key, cube.key] : cube.faces === 'log' ? [`${cube.key}_top`, `${cube.key}_top`, `${cube.key}_side`] : [`${cube.key}_top`, 'dirt', `${cube.key}_side`];
  const opts: DefOpts = { hardness: cube.hardness, tool: cube.tool, harvest: cube.harvest, sound: BEYOND_SOUND[cube.sound], light: cube.light ?? 0 };
  if (cube.leaf) Object.assign(opts, { opaque: false, render: 'cutout' as RenderClass, cullSame: true });
  if (cube.translucent) Object.assign(opts, { opaque: false, render: 'translucent' as RenderClass, cullSame: true });
  DEFS.push(def(id, cube.key, tiles[0], tiles[1], tiles[2], opts));
  if (cube.leaf) GROVE_LEAVES.push(id);
  if (cube.log) {
    BEYOND_LOGS.push(id);
    JOINERY_LOGS.push(id);
  }
  if (cube.wood) {
    JOINERY_FUEL.push(id);
    if (cube.log) JOINERY_BURN_LOGS.push(id);
    else if (!cube.leaf) JOINERY_BURN_PLANKS.push(id);
  }
}
for (const leafy of BEYOND_PLANTS) {
  const id = laidBeyond.id[leafy.key];
  DEFS.push(def(id, leafy.key, leafy.key, leafy.key, leafy.key, { ...plant(BEYOND_SOUND[leafy.sound ?? 'grass']), light: leafy.light ?? 0 }));
}
for (const s of BEYOND_SHAPES) {
  const at = laidBeyond.shape[s.key];
  const cube = BEYOND_CUBES.find((b) => b.key === s.key)!;
  const tile = beyondFaceTile(s.key);
  groveShapes(laidBeyond.id[s.key], `${s.key}_slab`, `${s.key}_stairs`, `${s.key}_wall`, s.wall ? at.wall : 0, tile, at.slab, at.stair, BEYOND_SOUND[cube.sound], cube.tool === 'axe' ? 'axe' : 'pickaxe', cube.hardness, s.wood, cube.harvest);
}
for (const id of BEYOND_LOGS) layAxis(id);
if (connectId >= BLOCK_COUNT) throw new Error('The World Beyond ran past the block id limit');

export function chestId(dir: number, half: number): number {
  const d = dir & 3;
  const h = half <= 0 ? 0 : half >= 2 ? 2 : 1;
  if (h === 0 && d === 0) return B.CHEST;
  return CHEST_BASE + h * 4 + d;
}

export function chestInfo(id: number): { dir: number; half: number } | null {
  if (id === B.CHEST) return { dir: 0, half: 0 };
  if (id < CHEST_BASE || id >= CHEST_BASE + CHEST_SPAN) return null;
  const k = id - CHEST_BASE;
  return { dir: k & 3, half: k >> 2 };
}

export function isChest(id: number): boolean {
  return chestInfo(id) !== null;
}

/** Where the other half of a double chest sits, or null when this one is single. */
export function chestPartnerPos(id: number, x: number, y: number, z: number): [number, number, number] | null {
  const info = chestInfo(id);
  if (!info || info.half === 0) return null;
  const d = info.half === 1 ? CHEST_CCW[info.dir] : CHEST_CW[info.dir];
  const [dx, dz] = BED_DIRS[d];
  return [x + dx, y, z + dz];
}

/**
 * A single chest just placed at x,y,z joins one neighbouring single chest.
 * Sides of the way it faces come first, then the front and the back. Nothing above, below or diagonal joins.
 * The pair turns so the latch is perpendicular to the seam and, when it can, still faces the player.
 */
export function chestMerge(
  get: (x: number, y: number, z: number) => number,
  x: number,
  y: number,
  z: number,
): { facing: number; left: [number, number, number]; right: [number, number, number] } | null {
  const placed = chestInfo(get(x, y, z));
  if (!placed || placed.half !== 0) return null;
  let px = 0;
  let py = 0;
  let pz = 0;
  let found = false;
  for (const d of [CHEST_CCW[placed.dir], CHEST_CW[placed.dir], placed.dir, placed.dir ^ 1]) {
    const [dx, dz] = BED_DIRS[d];
    const info = chestInfo(get(x + dx, y, z + dz));
    if (info && info.half === 0) {
      px = x + dx;
      py = y;
      pz = z + dz;
      found = true;
      break;
    }
  }
  if (!found) return null;
  const conn = px !== x ? (px > x ? 0 : 1) : pz > z ? 2 : 3;
  const sideA = CHEST_CW[conn];
  const sideB = CHEST_CCW[conn];
  const facing = placed.dir === sideA || placed.dir === sideB ? placed.dir : sideA;
  const [lx, lz] = BED_DIRS[CHEST_CW[facing]];
  const partnerIsLeft = px === x + lx && pz === z + lz;
  const left: [number, number, number] = partnerIsLeft ? [px, py, pz] : [x, y, z];
  const right: [number, number, number] = partnerIsLeft ? [x, y, z] : [px, py, pz];
  return { facing, left, right };
}

/** The sideways form of a log or pillar for the face that was clicked, or 0 when this block always stands upright. */
export function pillarFor(block: number, nx: number, ny: number, nz: number): number {
  if (!PILLAR_X.has(block)) return 0;
  if (ny !== 0) return block;
  if (nx !== 0) return PILLAR_X.get(block)!;
  return PILLAR_Z.get(block) ?? block;
}

const AIR_DEF = DEFS[0];

/** Dense lookup by id (unknown ids resolve to air). */
export const BLOCKS: BlockDef[] = Array.from({ length: BLOCK_COUNT }, () => AIR_DEF);
for (const d of DEFS) BLOCKS[d.id] = d;

/** The block id of a registered name, or 0. The first id wins when a top slab shares its name with the item. */
export function idByName(name: string): number {
  for (let id = 1; id < BLOCK_COUNT; id++) if (BLOCKS[id].id === id && BLOCKS[id].name === name) return id;
  return 0;
}

for (const w of JOINERY.woods) {
  if (w.spec.log) {
    const log = idByName(w.spec.log);
    if (!log) throw new Error(`joinery log ${w.spec.log} is missing`);
    STRIP.set(log, w.strippedLog);
  }
  STRIP.set(w.wood, w.strippedWood);
}
const poplarWood = JOINERY.woods.find((w) => w.spec.name === 'poplar');
if (poplarWood) STRIP.set(JOINERY.poplarLog, poplarWood.strippedLog);
for (const n of JOINERY.nether) {
  STRIP.set(n.stem, n.strippedStem);
  STRIP.set(n.hyphae, n.strippedHyphae);
}
for (const w of [GROVE.mangrove, GROVE.paleOak, GROVE.bambooWood]) {
  STRIP.set(w.log, w.strippedLog);
  if (w.wood) STRIP.set(w.wood, w.strippedWood);
}
for (const [from, to] of [...STRIP]) {
  const fx = PILLAR_X.get(from);
  const fz = PILLAR_Z.get(from);
  const tx = PILLAR_X.get(to);
  const tz = PILLAR_Z.get(to);
  if (fx !== undefined && tx !== undefined) STRIP.set(fx, tx);
  if (fz !== undefined && tz !== undefined) STRIP.set(fz, tz);
}

/** Every wooden plank, slab and stair added with the masonry, including the states that are not items. */
export function masonryWoodBlocks(): number[] {
  const ids: number[] = [];
  for (const row of MASONRY) {
    if (!row.spec.wood) continue;
    if (row.cubeId) ids.push(row.cubeId);
    if (row.slabBase >= 0) ids.push(row.slabBase, row.slabBase + 1);
    if (row.stairBase >= 0) for (let k = 0; k < 8; k++) ids.push(row.stairBase + k);
  }
  return ids;
}

/** Wool slabs and stairs, including the states that are not items. Wool burns. */
export function masonryWoolBlocks(): number[] {
  const ids: number[] = [];
  for (const row of MASONRY) {
    if (row.spec.sound !== 'grass') continue;
    if (row.slabBase >= 0) ids.push(row.slabBase, row.slabBase + 1);
    if (row.stairBase >= 0) for (let k = 0; k < 8; k++) ids.push(row.stairBase + k);
  }
  return ids;
}

/** The wooden masonry blocks a player can hold: planks, one slab and one stair. */
export function masonryWoodItems(): number[] {
  const ids: number[] = [];
  for (const row of MASONRY) {
    if (!row.spec.wood) continue;
    if (row.cubeId) ids.push(row.cubeId);
    if (row.slabBase >= 0) ids.push(row.slabBase);
    if (row.stairBase >= 0) ids.push(row.stairBase);
  }
  return ids;
}

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
for (const id of GROVE_LEAVES) IS_LEAVES[id] = 1;
export const IS_LOG = new Uint8Array(BLOCK_COUNT);
for (const id of LOG_BLOCKS) IS_LOG[id] = 1;
for (const id of JOINERY_LOGS) IS_LOG[id] = 1;
for (const [id, base] of PILLAR_BASE) if (IS_LOG[base]) IS_LOG[id] = 1;
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

/** A candle. `color` is -1 for the plain one, otherwise a dye index. `count` is 1..4. */
export function candleInfo(id: number): { color: number; count: number } | null {
  if (id >= DRESS.plainCandle && id < DRESS.plainCandle + 4) return { color: -1, count: id - DRESS.plainCandle + 1 };
  const i = id - DRESS.dyeCandle;
  if (i >= 0 && i < 64) return { color: Math.floor(i / 4), count: (i % 4) + 1 };
  return null;
}

/** The candle block with this many wicks (1..4). */
export function candleId(color: number, count: number): number {
  const n = Math.min(4, Math.max(1, count)) - 1;
  return color < 0 ? DRESS.plainCandle + n : DRESS.dyeCandle + color * 4 + n;
}

/** The item a candle breaks into: the single candle of its colour. */
export function candleItem(color: number): number {
  return candleId(color, 1);
}

/** A banner standing on the floor or hung on a wall. `facing` is a BED_DIRS index. */
export function bannerInfo(id: number): { color: number; facing: number; wall: boolean } | null {
  const floor = id - DRESS.bannerFloor;
  if (floor >= 0 && floor < 64) return { color: Math.floor(floor / 4), facing: floor % 4, wall: false };
  const wall = id - DRESS.bannerWall;
  if (wall >= 0 && wall < 64) return { color: Math.floor(wall / 4), facing: wall % 4, wall: true };
  return null;
}

export function bannerId(color: number, facing: number, wall: boolean): number {
  return (wall ? DRESS.bannerWall : DRESS.bannerFloor) + color * 4 + (facing & 3);
}

/** A wooden sign. `wood` is an index into DRESS.signs. */
export function signInfo(id: number): { wood: number; facing: number; wall: boolean } | null {
  for (let i = 0; i < DRESS.signs.length; i++) {
    const s = DRESS.signs[i];
    if (id >= s.standing && id < s.standing + 4) return { wood: i, facing: id - s.standing, wall: false };
    if (id >= s.wall && id < s.wall + 4) return { wood: i, facing: id - s.wall, wall: true };
  }
  return null;
}

export function signId(wood: number, facing: number, wall: boolean): number {
  const s = DRESS.signs[wood];
  return (wall ? s.wall : s.standing) + (facing & 3);
}

/** A flower pot. `plant` is 0 when the pot is empty. */
export function potInfo(id: number): { plant: number } | null {
  if (id === DRESS.pot) return { plant: 0 };
  const i = id - DRESS.potted;
  if (i < 0 || i >= POT_COUNT) return null;
  for (const [plant, pot] of POTTED_OF) if (pot === id) return { plant };
  return { plant: 0 };
}

/** The potted form of a plant block, or 0 when that plant does not fit in a pot. */
export function pottedOf(plant: number): number {
  return POTTED_OF.get(plant) ?? 0;
}

/** The terracotta block of a dye colour, including the ten colours added with the dressing. */
export function terracottaOf(color: number): number {
  if (color === 0) return B.TERRACOTTA_WHITE;
  if (color === 1) return B.TERRACOTTA_ORANGE;
  if (color === 4) return B.TERRACOTTA_YELLOW;
  if (color === 8) return B.TERRACOTTA_LIGHT_GRAY;
  if (color === 12) return B.TERRACOTTA_BROWN;
  if (color === 14) return B.TERRACOTTA_RED;
  const extra = EXTRA_TERRACOTTA.indexOf(DYE_ORDER[color] as (typeof EXTRA_TERRACOTTA)[number]);
  return extra < 0 ? 0 : DRESS.terracotta + extra;
}

/** Carpets and banners. Fire treats them like wool. */
export function dressBurnWool(): number[] {
  const ids: number[] = [];
  for (let c = 0; c < 16; c++) ids.push(DRESS.carpet + c);
  for (let i = 0; i < 64; i++) ids.push(DRESS.bannerFloor + i, DRESS.bannerWall + i);
  return ids;
}

/** The anvil in any of its three states of wear. */
export const isAnvil = (id: number): boolean => id === B.ANVIL || id === B.ANVIL_CHIPPED || id === B.ANVIL_DAMAGED;

/** Blocks with a right-click interface (GUI) rather than placing a block against them. */
export function isInteractive(id: number): boolean {
  return signInfo(id) !== null || id === B.CRAFTING_TABLE || id === B.FURNACE || isChest(id) || id === B.ENCHANTING_TABLE || isAnvil(id) || id === B.GRINDSTONE || isBed(id) || isSwitchable(id) || leverInfo(id) !== null || buttonInfo(id) !== null;
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
