import { BEYOND_BIOMES, type FloraKey } from './beyondBiomes';
import type { Column } from './biomes';
import { B, BB, GROVE, IS_LEAVES, IS_SOLID } from './blocks';
import { CHUNK_SIZE, SEA_LEVEL, WORLD_HEIGHT, blockIndex } from './chunk';
import { Simplex, hash2, mulberry32 } from './noise';
import { isBeyondSoil } from './beyondSurface';
import { keepRooted } from './support';
import { treeBlocks, trunkHeight, isGiant, type TreeBlock, type TreeKind } from './trees';

/**
 * What grows in the Beyond. Every biome names a `FloraKey`; `FLORA` says which trees (and how densely), which ground cover,
 * which flowers, which boulders and spires and what lives on the sea floor. Like the overworld's vegetation, a chunk writes only
 * its own cells but asks for every candidate near it, so whatever crosses a chunk border comes out whole whichever chunk is
 * made first; and every roll is a hash of the seed and the column, so the same seed always grows the same forest.
 */

export interface FloraHost {
  readonly seed: number;
  columnAt(wx: number, wz: number): Column;
  /** The top block of a column's ground. */
  groundTop(wx: number, wz: number, col: Column): number;
  inLake(wx: number, wz: number, pad?: number): boolean;
  /** The built-over ground (places, villages) that comes within `pad` blocks of a square: nothing grows there. */
  claims?(ox: number, oz: number, size: number, pad: number): readonly Claim[];
}

/** A square of ground that a building has taken (centre, and the half side with the margin already added). */
export interface Claim {
  x: number;
  z: number;
  r: number;
}

const claimed = (claims: readonly Claim[], x: number, z: number): boolean => {
  for (const c of claims) if (Math.abs(x - c.x) <= c.r && Math.abs(z - c.z) <= c.r) return true;
  return false;
};

/** The trees of the Beyond: the overworld's own shapes, those same shapes in other leaves, and new shapes. */
export type Shape =
  | TreeKind
  | 'autumn_red' | 'autumn_orange' | 'autumn_yellow' | 'frosted' | 'silver' | 'dream' | 'luminous' | 'ebon_oak'
  | 'redwood' | 'palm' | 'ebon' | 'dead' | 'petrified' | 'cypress' | 'glowshroom' | 'sporecap' | 'worldroot' | 'crystal_tree';

/** Shapes that are the overworld's, with their blocks swapped. */
const REMAP: Partial<Record<Shape, { base: TreeKind; log?: number; leaves?: number }>> = {
  autumn_red: { base: 'oak', leaves: BB.autumn_leaves_red },
  autumn_orange: { base: 'oak', leaves: BB.autumn_leaves_orange },
  autumn_yellow: { base: 'birch', leaves: BB.autumn_leaves_yellow },
  frosted: { base: 'spruce', leaves: BB.frosted_leaves },
  silver: { base: 'birch', leaves: BB.silver_leaves },
  dream: { base: 'cherry', leaves: BB.dream_leaves },
  luminous: { base: 'oak', leaves: BB.luminous_leaves },
  ebon_oak: { base: 'dark_oak', log: BB.ebon_log, leaves: BB.ebon_leaves },
};

const BASE_KINDS: ReadonlySet<string> = new Set(['oak', 'birch', 'spruce', 'acacia', 'jungle', 'dark_oak', 'cherry', 'mangrove', 'pale_oak', 'azalea']);

type Cover = readonly [number, number];

type SpireKind = 'azure' | 'rose' | 'verdant' | 'amber' | 'ice' | 'salt' | 'bone' | 'obsidian' | 'stone';

export interface FloraDef {
  /** Trees and their relative weights. */
  trees?: readonly (readonly [Shape, number])[];
  /** Trees per column on average in a thick clump. */
  density?: number;
  /** Blocks of ground cover with weights, and the share of columns that carry one. */
  cover?: readonly Cover[];
  coverRate?: number;
  /** What ground the cover may stand on (default: soil). */
  floor?: 'soil' | 'sand' | 'any';
  /** Patches of flowers: one kind to a patch of eight blocks. */
  flowers?: readonly number[];
  flowerRate?: number;
  /** Cacti on a three-block grid. */
  cactus?: number;
  boulder?: { id: number; alt?: number; rate: number };
  spire?: { kind: SpireKind; rate: number; height: [number, number] };
  bush?: { log: number; leaves: number; rate: number };
  ribs?: number;
  /** On the floor of the sea (and of lakes and rivers). */
  sea?: { kelp?: number; grass?: number; reef?: number; spires?: SpireKind; spireRate?: number; lily?: number; vents?: number };
}

const T = (s: Shape, w = 1): readonly [Shape, number] => [s, w];
const G = B.TALL_GRASS;
const FERN = B.FERN;

const FLOWERS_MEADOW = [B.DANDELION, B.OXEYE_DAISY, B.CORNFLOWER, B.AZURE_BLUET, B.ALLIUM, B.TULIP_WHITE, B.ROSE];
const FLOWERS_ALL = [B.DANDELION, B.ROSE, B.OXEYE_DAISY, B.CORNFLOWER, B.AZURE_BLUET, B.ALLIUM, B.TULIP_RED, B.TULIP_ORANGE, B.TULIP_WHITE, B.TULIP_PINK, B.BLUE_ORCHID];
const FLOWERS_WILD = [BB.heather, BB.lavender, B.CORNFLOWER, B.ALLIUM, B.AZURE_BLUET];
const MUSH = [B.BROWN_MUSHROOM, B.RED_MUSHROOM];

/** The flora of every key. Anything not listed grows nothing but the odd tuft of grass. */
export const FLORA: Record<FloraKey, FloraDef> = {
  plains: { trees: [T('oak', 0.8), T('birch', 0.2)], density: 0.012, cover: [[G, 1]], coverRate: 0.25, flowers: FLOWERS_ALL, flowerRate: 0.13, boulder: { id: B.COBBLE, rate: 0.0008 } },
  flower_field: { density: 0, cover: [[G, 1]], coverRate: 0.12, flowers: FLOWERS_ALL, flowerRate: 0.5 },
  golden: { trees: [T('acacia', 0.8), T('oak', 0.2)], density: 0.009, cover: [[BB.golden_grass, 3], [BB.pampas_grass, 1]], coverRate: 0.55, floor: 'soil', flowers: [B.TULIP_ORANGE, B.DANDELION], flowerRate: 0.04 },
  highland: { trees: [T('spruce', 0.7), T('oak', 0.3)], density: 0.008, cover: [[BB.heather, 3], [G, 1]], coverRate: 0.28, flowers: FLOWERS_WILD, flowerRate: 0.12, boulder: { id: B.COBBLE, rate: 0.0035 } },
  meadow: { trees: [T('birch'), T('oak')], density: 0.004, cover: [[G, 1]], coverRate: 0.18, flowers: FLOWERS_MEADOW, flowerRate: 0.32 },
  ancient_grass: { trees: [T('oak', 0.7), T('dark_oak', 0.3)], density: 0.01, cover: [[G, 1], [FERN, 0.3]], coverRate: 0.3, flowers: FLOWERS_MEADOW, flowerRate: 0.06, spire: { kind: 'stone', rate: 0.0007, height: [4, 8] } },
  steppe: { trees: [T('acacia')], density: 0.0012, cover: [[BB.golden_grass, 1], [B.DEAD_BUSH, 0.1]], coverRate: 0.22, boulder: { id: B.COBBLE, rate: 0.004 } },

  oak: { trees: [T('oak', 0.8), T('birch', 0.2)], density: 0.05, cover: [[G, 1], [FERN, 0.2]], coverRate: 0.3, flowers: [B.ROSE, B.DANDELION], flowerRate: 0.05, bush: { log: B.LOG, leaves: B.LEAVES, rate: 0.0015 } },
  birch: { trees: [T('birch', 0.9), T('oak', 0.1)], density: 0.06, cover: [[G, 1], [FERN, 0.2]], coverRate: 0.26, flowers: [B.DANDELION, B.OXEYE_DAISY, B.AZURE_BLUET], flowerRate: 0.07 },
  dark: { trees: [T('dark_oak', 0.8), T('pale_oak', 0.1), T('oak', 0.1)], density: 0.05, cover: [[G, 1], [FERN, 1], [B.BROWN_MUSHROOM, 0.12], [B.RED_MUSHROOM, 0.1]], coverRate: 0.2 },
  pine: { trees: [T('spruce')], density: 0.05, cover: [[FERN, 1], [G, 0.4], [B.BROWN_MUSHROOM, 0.05]], coverRate: 0.15, boulder: { id: B.MOSSY_COBBLE, rate: 0.0016 } },
  redwood: { trees: [T('redwood', 0.9), T('spruce', 0.1)], density: 0.026, cover: [[FERN, 1.5], [G, 0.5], [B.RED_MUSHROOM, 0.12]], coverRate: 0.32, boulder: { id: B.MOSSY_COBBLE, rate: 0.0016 } },
  autumn: { trees: [T('autumn_red', 0.35), T('autumn_orange', 0.35), T('autumn_yellow', 0.3)], density: 0.045, cover: [[G, 1], [FERN, 0.3], [B.BROWN_MUSHROOM, 0.05]], coverRate: 0.22 },
  ancient: { trees: [T('dark_oak', 0.5), T('oak', 0.3), T('redwood', 0.2)], density: 0.05, cover: [[FERN, 1], [G, 0.5], [B.AZURE_BLUET, 0.1], [B.RED_MUSHROOM, 0.08]], coverRate: 0.3, spire: { kind: 'stone', rate: 0.0008, height: [3, 7] }, boulder: { id: B.MOSSY_COBBLE, rate: 0.003 } },
  bamboo: { trees: [T('oak', 0.5), T('birch', 0.5)], density: 0.006, cover: [[GROVE.bamboo, 2], [FERN, 1], [G, 1]], coverRate: 0.5 },
  cherry: { trees: [T('cherry')], density: 0.04, cover: [[B.PINK_PETALS, 2], [G, 1]], coverRate: 0.3, flowers: [B.TULIP_PINK, B.ALLIUM, B.AZURE_BLUET], flowerRate: 0.14 },
  enchanted: { trees: [T('luminous', 0.35), T('dream', 0.25), T('oak', 0.25), T('glowshroom', 0.15)], density: 0.045, cover: [[BB.luminous_fern, 2], [BB.glow_bloom, 1], [BB.moonpetal, 0.5], [G, 1]], coverRate: 0.4 },
  fog: { trees: [T('dark_oak', 0.4), T('oak', 0.3), T('pale_oak', 0.3)], density: 0.055, cover: [[FERN, 1.5], [G, 0.4], [B.BROWN_MUSHROOM, 0.15]], coverRate: 0.3 },
  dead: { trees: [T('dead', 0.8), T('petrified', 0.2)], density: 0.03, cover: [[B.DEAD_BUSH, 1], [BB.dead_shrub, 1.5]], coverRate: 0.18, floor: 'any', boulder: { id: B.COBBLE, rate: 0.002 }, ribs: 0.0006 },
  petrified: { trees: [T('petrified', 1)], density: 0.03, cover: [[BB.dead_shrub, 1], [B.DEAD_BUSH, 0.5]], coverRate: 0.05, floor: 'any', ribs: 0.0003 },

  jungle: { trees: [T('jungle', 0.86), T('oak', 0.14)], density: 0.09, cover: [[G, 1.2], [FERN, 1], [GROVE.bamboo, 0.2], [BB.vines, 0.1]], coverRate: 0.5, bush: { log: B.JUNGLE_LOG, leaves: B.JUNGLE_LEAVES, rate: 0.01 } },
  rainforest: { trees: [T('jungle', 0.7), T('oak', 0.1), T('redwood', 0.2)], density: 0.1, cover: [[FERN, 1.5], [G, 1], [BB.luminous_fern, 0.2], [BB.vines, 0.1]], coverRate: 0.6, bush: { log: B.JUNGLE_LOG, leaves: B.JUNGLE_LEAVES, rate: 0.012 } },
  bamboo_rain: { trees: [T('jungle', 0.3), T('oak', 0.1)], density: 0.03, cover: [[GROVE.bamboo, 3], [FERN, 1], [G, 1]], coverRate: 0.6 },
  tropic_wet: { trees: [T('palm', 0.5), T('mangrove', 0.5)], density: 0.014, cover: [[G, 1], [B.BLUE_ORCHID, 0.1], [BB.succulent, 0.05]], coverRate: 0.3 },
  mangrove: { trees: [T('mangrove')], density: 0.045, cover: [[G, 0.5], [B.BLUE_ORCHID, 0.05]], coverRate: 0.15, floor: 'any' },
  jungle_high: { trees: [T('jungle', 0.5), T('spruce', 0.2), T('palm', 0.1)], density: 0.06, cover: [[FERN, 1.5], [G, 1], [BB.vines, 0.1]], coverRate: 0.5 },
  lost_jungle: { trees: [T('jungle', 0.6), T('worldroot', 0.04)], density: 0.1, cover: [[BB.vines, 0.3], [FERN, 1.2], [BB.luminous_fern, 0.3], [BB.glow_bloom, 0.08]], coverRate: 0.6, spire: { kind: 'stone', rate: 0.002, height: [3, 9] } },
  orchid: { trees: [T('jungle', 0.5), T('dream', 0.2), T('palm', 0.1)], density: 0.06, cover: [[B.BLUE_ORCHID, 1], [BB.glow_bloom, 0.3], [FERN, 1], [G, 0.5]], coverRate: 0.55 },

  desert: { cactus: 0.06, cover: [[B.DEAD_BUSH, 1]], coverRate: 0.015, floor: 'sand', boulder: { id: B.SANDSTONE, rate: 0.0006 }, ribs: 0.00012 },
  red_desert: { cactus: 0.05, cover: [[B.DEAD_BUSH, 1], [BB.succulent, 0.4]], coverRate: 0.02, floor: 'sand', boulder: { id: B.RED_SANDSTONE, rate: 0.001 } },
  rock_desert: { cactus: 0.015, cover: [[B.DEAD_BUSH, 1], [BB.dead_shrub, 1]], coverRate: 0.025, floor: 'any', boulder: { id: B.ANDESITE, rate: 0.006 } },
  badlands: { cactus: 0.02, cover: [[B.DEAD_BUSH, 1]], coverRate: 0.035, floor: 'any', boulder: { id: B.TERRACOTTA_ORANGE, rate: 0.0015 } },
  salt: { cover: [[BB.dead_shrub, 1]], coverRate: 0.004, floor: 'any', spire: { kind: 'salt', rate: 0.0008, height: [2, 6] } },
  oasis: { trees: [T('palm')], density: 0.035, cover: [[BB.succulent, 1], [G, 1], [B.SUGAR_CANE, 0.5]], coverRate: 0.3, floor: 'any' },
  canyon: { cactus: 0.02, cover: [[B.DEAD_BUSH, 1], [BB.succulent, 0.4]], coverRate: 0.025, floor: 'any', boulder: { id: B.TERRACOTTA, rate: 0.002 } },
  glass: { cover: [[BB.dead_shrub, 1]], coverRate: 0.003, floor: 'any', spire: { kind: 'amber', rate: 0.0012, height: [3, 9] } },
  ash_waste: { trees: [T('dead')], density: 0.002, cover: [[BB.dead_shrub, 1]], coverRate: 0.015, floor: 'any', boulder: { id: BB.charred_stone, rate: 0.003 } },
  bone: { cover: [[BB.dead_shrub, 1]], coverRate: 0.01, floor: 'any', ribs: 0.0016, spire: { kind: 'bone', rate: 0.0012, height: [2, 6] } },

  rock: { trees: [T('spruce')], density: 0.006, cover: [[G, 0.5]], coverRate: 0.05, boulder: { id: B.COBBLE, rate: 0.003 } },
  snow_peak: { trees: [T('frosted')], density: 0.002, boulder: { id: BB.frosted_stone, rate: 0.003 } },
  alpine: { trees: [T('spruce', 0.8), T('birch', 0.2)], density: 0.012, cover: [[G, 1]], coverRate: 0.3, flowers: [B.CORNFLOWER, B.OXEYE_DAISY, BB.heather, B.AZURE_BLUET], flowerRate: 0.28 },
  frozen_peak: { boulder: { id: BB.frosted_stone, rate: 0.004 }, spire: { kind: 'ice', rate: 0.0006, height: [4, 12] } },
  jagged: { trees: [T('spruce')], density: 0.002, boulder: { id: BB.slate, alt: 40, rate: 0.004 } },
  crystal: { cover: [[BB.azure_cluster, 1], [BB.rose_cluster, 1]], coverRate: 0.02, floor: 'any', spire: { kind: 'azure', rate: 0.004, height: [4, 14] } },
  volcano: { cover: [[BB.dead_shrub, 1]], coverRate: 0.01, floor: 'any', boulder: { id: BB.volcanic_rock, rate: 0.004 }, spire: { kind: 'obsidian', rate: 0.0012, height: [3, 8] } },
  sky_high: { trees: [T('birch', 0.5), T('silver', 0.5)], density: 0.005, cover: [[G, 1]], coverRate: 0.25, flowers: [B.CORNFLOWER, BB.moonpetal], flowerRate: 0.2 },
  floating: { trees: [T('silver')], density: 0.004, cover: [[G, 1]], coverRate: 0.2, boulder: { id: BB.skystone, rate: 0.003 } },
  thunder: { trees: [T('spruce', 0.6), T('dead', 0.4)], density: 0.006, boulder: { id: BB.stormstone, rate: 0.003 }, cover: [[B.DEAD_BUSH, 1]], coverRate: 0.02 },

  snow_plain: { trees: [T('spruce')], density: 0.004, cover: [[FERN, 0.2]], coverRate: 0.01, floor: 'soil' },
  snow_taiga: { trees: [T('spruce', 0.9), T('frosted', 0.1)], density: 0.045, cover: [[FERN, 1], [G, 0.4]], coverRate: 0.15, boulder: { id: B.MOSSY_COBBLE, rate: 0.0015 } },
  frozen_forest: { trees: [T('frosted', 0.6), T('spruce', 0.4)], density: 0.05, cover: [[FERN, 0.5]], coverRate: 0.06 },
  ice_spikes: { spire: { kind: 'ice', rate: 0.014, height: [7, 24] } },
  glacier: { spire: { kind: 'ice', rate: 0.0016, height: [3, 9] } },
  tundra: { trees: [T('spruce')], density: 0.002, cover: [[BB.heather, 1], [G, 0.5], [BB.dead_shrub, 0.3]], coverRate: 0.14, boulder: { id: B.COBBLE, rate: 0.003 } },
  arctic: { boulder: { id: B.COBBLE, rate: 0.002 } },
  polar: { spire: { kind: 'ice', rate: 0.0008, height: [2, 6] }, boulder: { id: BB.frosted_stone, rate: 0.0015 } },
  aurora: { trees: [T('frosted', 0.5), T('silver', 0.5)], density: 0.014, cover: [[BB.moonpetal, 0.6], [FERN, 1]], coverRate: 0.12, spire: { kind: 'ice', rate: 0.0006, height: [4, 10] } },
  winter: { trees: [T('frosted')], density: 0.005, spire: { kind: 'ice', rate: 0.003, height: [5, 16] } },

  swamp: { trees: [T('mangrove', 0.55), T('oak', 0.45)], density: 0.03, cover: [[G, 1], [B.BLUE_ORCHID, 0.06], [B.BROWN_MUSHROOM, 0.05]], coverRate: 0.3, sea: { lily: 0.1 } },
  mangrove_swamp: { trees: [T('mangrove')], density: 0.05, cover: [[G, 0.4]], coverRate: 0.1, floor: 'any', sea: { lily: 0.04 } },
  dark_swamp: { trees: [T('dark_oak', 0.4), T('mangrove', 0.4), T('ebon_oak', 0.2)], density: 0.04, cover: [[G, 1], [B.BROWN_MUSHROOM, 0.15], [BB.vines, 0.1]], coverRate: 0.3, sea: { lily: 0.06 } },
  cypress: { trees: [T('cypress', 0.8), T('mangrove', 0.2)], density: 0.032, cover: [[G, 1], [BB.vines, 0.1], [FERN, 0.5]], coverRate: 0.3, sea: { lily: 0.08 } },
  bog: { trees: [T('dead', 0.4), T('spruce', 0.6)], density: 0.008, cover: [[G, 1], [B.BROWN_MUSHROOM, 0.2], [BB.heather, 0.4]], coverRate: 0.3, sea: { lily: 0.03 } },
  toxic: { trees: [T('dead')], density: 0.006, cover: [[BB.dead_shrub, 1], [B.RED_MUSHROOM, 0.5], [BB.glowshroom, 0.3]], coverRate: 0.14, floor: 'any', sea: { lily: 0.02 } },
  misty: { trees: [T('mangrove', 0.3), T('pale_oak', 0.4), T('oak', 0.3)], density: 0.018, cover: [[G, 1], [FERN, 0.6], [BB.moonpetal, 0.08]], coverRate: 0.3, sea: { lily: 0.08 } },
  sunken_forest: { trees: [T('oak', 0.5), T('mangrove', 0.5)], density: 0.05, cover: [[G, 1]], coverRate: 0.2, sea: { lily: 0.08, grass: 0.05 } },

  sea_warm: { sea: { grass: 0.12, kelp: 0.01 } },
  sea_deep: { sea: { grass: 0.01, kelp: 0.004 } },
  sea_cold: { sea: { kelp: 0.03, grass: 0.04 } },
  sea_frozen: { sea: { grass: 0.004 } },
  coral: { sea: { reef: 0.012, grass: 0.06 } },
  kelp: { sea: { kelp: 0.22, grass: 0.1 } },
  abyss: { sea: { vents: 0.0006 } },
  sea_volcanic: { sea: { vents: 0.003 } },
  sea_crystal: { sea: { spires: 'azure', spireRate: 0.012, grass: 0.02 } },
  storm_coast: { boulder: { id: B.COBBLE, rate: 0.006 }, cover: [[G, 0.5]], coverRate: 0.05 },
  rock_coast: { boulder: { id: B.STONE, rate: 0.008 }, sea: { kelp: 0.01 } },
  sand_coast: { trees: [T('palm')], density: 0.004, cover: [[B.SUGAR_CANE, 0.3], [BB.succulent, 0.2]], coverRate: 0.025, floor: 'sand' },
  mangrove_coast: { trees: [T('mangrove')], density: 0.04, cover: [[G, 0.3]], coverRate: 0.05, floor: 'any', sea: { lily: 0.02 } },
  archipelago: { trees: [T('palm', 0.8), T('mangrove', 0.2)], density: 0.012, cover: [[G, 1], [BB.succulent, 0.1]], coverRate: 0.2, floor: 'any', sea: { grass: 0.1, reef: 0.003 } },

  river: { cover: [[G, 0.8]], coverRate: 0.1, sea: { grass: 0.05, lily: 0.015 } },
  lake: { sea: { grass: 0.06, kelp: 0.01, lily: 0.04 } },
  alpine_lake: { sea: { grass: 0.03 } },
  waterfall: { trees: [T('spruce', 0.5), T('oak', 0.5)], density: 0.02, cover: [[FERN, 1], [G, 1]], coverRate: 0.3 },
  floodplain: { trees: [T('oak')], density: 0.002, cover: [[G, 1], [B.SUGAR_CANE, 0.2]], coverRate: 0.4, flowers: [B.DANDELION, B.AZURE_BLUET], flowerRate: 0.06 },

  mushroom: { trees: [T('glowshroom', 0.3), T('sporecap', 0.7)], density: 0.014, cover: [[B.RED_MUSHROOM, 1], [B.BROWN_MUSHROOM, 1], [BB.glowshroom, 0.2]], coverRate: 0.16, floor: 'any' },
  spore: { trees: [T('sporecap', 0.5), T('glowshroom', 0.5)], density: 0.01, cover: [[B.RED_MUSHROOM, 1], [B.BROWN_MUSHROOM, 1], [BB.glowshroom, 0.5], [BB.luminous_fern, 0.3]], coverRate: 0.3, floor: 'any' },
  crystal_forest: { trees: [T('crystal_tree', 0.8), T('silver', 0.2)], density: 0.03, cover: [[BB.azure_cluster, 1], [BB.rose_cluster, 1], [BB.moonpetal, 0.4]], coverRate: 0.1, floor: 'any', spire: { kind: 'rose', rate: 0.002, height: [4, 12] } },
  luminous: { trees: [T('luminous', 0.6), T('glowshroom', 0.2), T('dream', 0.2)], density: 0.045, cover: [[BB.luminous_fern, 2], [BB.glow_bloom, 1], [BB.glowshroom, 0.5]], coverRate: 0.5, floor: 'any' },
  fairy: { trees: [T('dream', 0.5), T('luminous', 0.3), T('cherry', 0.2)], density: 0.03, cover: [[BB.glow_bloom, 1], [BB.moonpetal, 1], [G, 1]], coverRate: 0.35, flowers: FLOWERS_ALL, flowerRate: 0.2 },
  dream: { trees: [T('dream', 0.8), T('silver', 0.2)], density: 0.03, cover: [[BB.moonpetal, 1], [BB.lavender, 1], [G, 1]], coverRate: 0.35, flowers: [B.ALLIUM, B.TULIP_PINK, BB.lavender], flowerRate: 0.2 },
  moonlit: { trees: [T('silver', 0.6), T('pale_oak', 0.4)], density: 0.026, cover: [[BB.moonpetal, 1.5], [G, 1], [B.AZURE_BLUET, 0.5]], coverRate: 0.35 },

  shattered: { trees: [T('dead', 0.5), T('silver', 0.5)], density: 0.003, cover: [[BB.moonpetal, 0.3]], coverRate: 0.03, floor: 'any', spire: { kind: 'azure', rate: 0.0016, height: [4, 14] }, boulder: { id: BB.skystone, rate: 0.003 } },
  worldroot: { trees: [T('luminous', 0.35), T('oak', 0.25), T('redwood', 0.25), T('worldroot', 0.15)], density: 0.045, cover: [[BB.luminous_fern, 1.5], [BB.glow_bloom, 0.6], [FERN, 1], [G, 1], [BB.vines, 0.2]], coverRate: 0.5 },
  ashen: { trees: [T('dead')], density: 0.0008, cover: [[BB.dead_shrub, 1]], coverRate: 0.01, floor: 'any', boulder: { id: BB.volcanic_rock, rate: 0.004 }, spire: { kind: 'obsidian', rate: 0.0016, height: [3, 10] } },
  drowned: { sea: { grass: 0.1, reef: 0.004, kelp: 0.05 } },
  eternal_night: { trees: [T('ebon', 0.7), T('ebon_oak', 0.3)], density: 0.04, cover: [[BB.moonpetal, 1], [BB.glow_bloom, 0.6], [BB.luminous_fern, 1], [BB.glowshroom, 0.7]], coverRate: 0.35, floor: 'any' },
  crystal_expanse: { cover: [[BB.azure_cluster, 1], [BB.rose_cluster, 1]], coverRate: 0.05, floor: 'any', spire: { kind: 'azure', rate: 0.012, height: [5, 18] } },
  sunken_earth: { trees: [T('oak', 0.4), T('jungle', 0.3), T('palm', 0.3)], density: 0.05, cover: [[G, 1], [FERN, 1], [BB.vines, 0.1]], coverRate: 0.45, flowers: FLOWERS_ALL, flowerRate: 0.1 },
  sky_islands: { trees: [T('silver', 0.5), T('birch', 0.5)], density: 0.01, cover: [[G, 1]], coverRate: 0.3, flowers: [B.CORNFLOWER, BB.moonpetal], flowerRate: 0.1 },
  pale: { trees: [T('petrified', 0.4), T('dead', 0.6)], density: 0.004, cover: [[BB.dead_shrub, 1], [BB.pampas_grass, 1]], coverRate: 0.05, floor: 'any', ribs: 0.0008, spire: { kind: 'bone', rate: 0.0008, height: [3, 7] } },
  hollow: { trees: [T('luminous', 0.3), T('jungle', 0.2), T('palm', 0.2), T('glowshroom', 0.3)], density: 0.06, cover: [[BB.luminous_fern, 2], [BB.glow_bloom, 1], [G, 1], [FERN, 1], [BB.glowshroom, 0.4]], coverRate: 0.6, floor: 'any' },
  none: {},
};

const SAND_FLOORS: ReadonlySet<number> = new Set<number>([B.SAND, B.RED_SAND, BB.white_sand, BB.black_sand, BB.crystal_sand, BB.ash_block, B.COARSE_DIRT]);

/** Ground a tree of a shape can root in. */
function rootsIn(shape: Shape, top: number): boolean {
  if (isBeyondSoil(top)) return top !== B.MYCELIUM || shape === 'glowshroom' || shape === 'sporecap';
  switch (shape) {
    case 'palm':
    case 'mangrove':
    case 'cypress':
      return SAND_FLOORS.has(top) || top === B.CLAY || top === B.GRAVEL;
    case 'dead':
    case 'petrified':
    case 'ebon':
    case 'glowshroom':
    case 'sporecap':
    case 'crystal_tree':
    case 'worldroot':
      return IS_SOLID[top] === 1 && !IS_LEAVES[top];
    default:
      return false;
  }
}

const pickWeighted = <T>(list: readonly (readonly [T, number])[], u: number): T => {
  let total = 0;
  for (const e of list) total += e[1];
  let r = u * total;
  for (const e of list) {
    r -= e[1];
    if (r < 0) return e[0];
  }
  return list[list.length - 1][0];
};

/**
 * Blocks of one tree of a shape rooted at (x, y, z) (y is the first block above the ground). A tree is one piece: whatever its
 * shape drew that does not touch the trunk (a gap in a broken trunk, a branch that missed the stem) is left out.
 */
export function shapeBlocks(shape: Shape, x: number, y: number, z: number, rand: () => number, big: boolean): TreeBlock[] {
  return keepRooted(rawShapeBlocks(shape, x, y, z, rand, big), (b) => b.y <= y);
}

function rawShapeBlocks(shape: Shape, x: number, y: number, z: number, rand: () => number, big: boolean): TreeBlock[] {
  if (BASE_KINDS.has(shape)) {
    const kind = shape as TreeKind;
    const trunk = trunkHeight(kind, rand, big);
    return treeBlocks(x, y, z, trunk, rand, kind, big);
  }
  const remap = REMAP[shape];
  if (remap) {
    const trunk = trunkHeight(remap.base, rand, big);
    const blocks = treeBlocks(x, y, z, trunk, rand, remap.base, big);
    for (const b of blocks) {
      if (b.leaf && remap.leaves !== undefined) b.id = remap.leaves;
      else if (!b.leaf && remap.log !== undefined) b.id = remap.log;
    }
    return blocks;
  }
  const out: TreeBlock[] = [];
  const log = (lx: number, ly: number, lz: number, id: number): void => void out.push({ x: lx, y: ly, z: lz, id, leaf: false });
  const leaf = (lx: number, ly: number, lz: number, id: number): void => void out.push({ x: lx, y: ly, z: lz, id, leaf: true });
  const disc = (cx: number, cy: number, cz: number, radius: number, id: number, hole = 0.06): void => {
    const R = Math.ceil(radius);
    for (let dx = -R; dx <= R; dx++) {
      for (let dz = -R; dz <= R; dz++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > radius * radius + 0.5) continue;
        if (d2 > (radius - 1) * (radius - 1) && rand() < hole) continue;
        leaf(cx + dx, cy, cz + dz, id);
      }
    }
  };
  const blob = (cx: number, cy: number, cz: number, radius: number, id: number): void => {
    const R = Math.ceil(radius);
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        for (let dz = -R; dz <= R; dz++) {
          const d = dx * dx + dz * dz + dy * dy * 1.25 + (rand() - 0.5) * 1.2;
          if (d <= radius * radius) leaf(cx + dx, cy + dy, cz + dz, id);
        }
      }
    }
  };

  switch (shape) {
    case 'redwood': {
      const h = 22 + Math.floor(rand() * (big ? 26 : 12));
      for (let k = 0; k < h + 2; k++) log(x, y + k, z, BB.redwood_log);
      if (big) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let k = 0; k < 3 - Math.floor(rand() * 2); k++) log(x + dx, y + k, z + dz, BB.redwood_log);
      // A tall cone: the canopy starts at a third of the height and narrows to a tuft.
      const start = Math.floor(h * 0.34);
      for (let k = start; k <= h + 2; k++) {
        const t = (k - start) / (h + 2 - start);
        const r = Math.max(0, (big ? 6 : 4.2) * (1 - t) * (0.8 + 0.2 * Math.sin(k * 1.7)));
        if (r < 0.6 && k < h + 2) continue;
        disc(x, y + k, z, Math.max(0.8, r), BB.redwood_leaves, 0.12);
      }
      return out;
    }
    case 'palm': {
      const h = 7 + Math.floor(rand() * 6);
      const lean = rand() * Math.PI * 2;
      const lx = Math.cos(lean) * 0.22;
      const lz = Math.sin(lean) * 0.22;
      let tx = x;
      let tz = z;
      for (let k = 0; k < h; k++) {
        tx = x + Math.round(lx * k);
        tz = z + Math.round(lz * k);
        log(tx, y + k, tz, BB.palm_log);
      }
      const top = y + h - 1;
      leaf(tx, top + 1, tz, BB.palm_fronds);
      for (let arm = 0; arm < 7; arm++) {
        const a = (arm / 7) * Math.PI * 2 + rand() * 0.3;
        for (let s = 1; s <= 4; s++) {
          const fx = tx + Math.round(Math.cos(a) * s);
          const fz = tz + Math.round(Math.sin(a) * s);
          const fy = top + 1 - (s >= 3 ? 1 : 0) - (s >= 4 ? 1 : 0);
          leaf(fx, fy, fz, BB.palm_fronds);
        }
      }
      return out;
    }
    case 'ebon': {
      const h = 8 + Math.floor(rand() * 8);
      let cx = x;
      let cz = z;
      for (let k = 0; k < h; k++) {
        log(cx, y + k, cz, BB.ebon_log);
        if (k > 3 && rand() < 0.3) {
          cx += rand() < 0.5 ? -1 : 1;
          log(cx, y + k, cz, BB.ebon_log);
        }
        if (k > 3 && rand() < 0.15) {
          cz += rand() < 0.5 ? -1 : 1;
          log(cx, y + k, cz, BB.ebon_log);
        }
      }
      blob(cx, y + h, cz, 3.2 + rand() * 1.5, BB.ebon_leaves);
      for (let b = 0; b < 3; b++) {
        const a = rand() * Math.PI * 2;
        const by = y + Math.floor(h * 0.6) + b;
        const bx = x + Math.round(Math.cos(a) * 3);
        const bz = z + Math.round(Math.sin(a) * 3);
        log(x + Math.round(Math.cos(a)), by, z + Math.round(Math.sin(a)), BB.ebon_log);
        log(x + Math.round(Math.cos(a) * 2), by, z + Math.round(Math.sin(a) * 2), BB.ebon_log);
        blob(bx, by + 1, bz, 2.2, BB.ebon_leaves);
      }
      return out;
    }
    case 'dead': {
      const h = 5 + Math.floor(rand() * 6);
      for (let k = 0; k < h; k++) log(x, y + k, z, B.SPRUCE_LOG);
      const branches = 2 + Math.floor(rand() * 3);
      for (let b = 0; b < branches; b++) {
        const a = rand() * Math.PI * 2;
        const by = y + 2 + Math.floor(rand() * (h - 2));
        const len = 1 + Math.floor(rand() * 3);
        for (let s = 1; s <= len; s++) log(x + Math.round(Math.cos(a) * s), by + (s > 1 ? 1 : 0), z + Math.round(Math.sin(a) * s), B.SPRUCE_LOG);
      }
      return out;
    }
    case 'petrified': {
      const h = 6 + Math.floor(rand() * 11);
      const wide = rand() < 0.35;
      for (let k = 0; k < h; k++) {
        const broken = k > h * 0.6 && rand() < 0.2;
        if (broken) continue;
        log(x, y + k, z, BB.petrified_log);
        if (wide && k < h - 3) {
          log(x + 1, y + k, z, BB.petrified_log);
          log(x, y + k, z + 1, BB.petrified_log);
          log(x + 1, y + k, z + 1, BB.petrified_log);
        }
      }
      for (let k = 0; k < 2; k++) {
        const a = rand() * Math.PI * 2;
        for (let s = 1; s <= 2 + Math.floor(rand() * 2); s++) log(x + Math.round(Math.cos(a) * s), y + Math.floor(h * 0.5), z + Math.round(Math.sin(a) * s), BB.petrified_log);
      }
      return out;
    }
    case 'cypress': {
      const h = 9 + Math.floor(rand() * 8);
      for (let k = 0; k < h; k++) log(x, y + k, z, GROVE.mangrove.log);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (rand() < 0.7) log(x + dx, y, z + dz, GROVE.mangrove.log);
      for (let k = h - 5; k <= h; k++) disc(x, y + k, z, k >= h - 1 ? 1.5 : 3 - Math.abs(k - (h - 3)) * 0.3, GROVE.mangrove.leaves, 0.12);
      // Hanging moss.
      for (let k = 0; k < 6; k++) {
        const a = rand() * Math.PI * 2;
        const hx = x + Math.round(Math.cos(a) * 3);
        const hz = z + Math.round(Math.sin(a) * 3);
        for (let s = 0; s < 1 + Math.floor(rand() * 3); s++) out.push({ x: hx, y: y + h - 3 - s, z: hz, id: BB.vines, leaf: true });
      }
      return out;
    }
    case 'glowshroom':
    case 'sporecap': {
      const cap = shape === 'glowshroom' ? BB.glowshroom_cap : BB.spore_cap;
      const stem = shape === 'glowshroom' ? BB.glowshroom_stem : BB.glowshroom_stem;
      const h = 6 + Math.floor(rand() * (big ? 14 : 8));
      for (let k = 0; k < h; k++) log(x, y + k, z, stem);
      const R = (big ? 6 : 3.4) + rand() * 1.2;
      for (let dy = 0; dy <= Math.ceil(R * 0.7); dy++) {
        const rr = dy === 0 ? R : Math.sqrt(Math.max(0, R * R - (dy * R) / (R * 0.7) * dy * 1.4));
        for (let dx = -Math.ceil(R); dx <= Math.ceil(R); dx++) {
          for (let dz = -Math.ceil(R); dz <= Math.ceil(R); dz++) {
            const d = Math.hypot(dx, dz);
            if (d > rr + 0.2 || (dy > 0 && d < rr - 1.6 && dy < Math.ceil(R * 0.7))) continue;
            if (dy === 0 && d < 1.2) continue;
            leaf(x + dx, y + h + dy - 1, z + dz, cap);
          }
        }
      }
      return out;
    }
    case 'crystal_tree': {
      const h = 7 + Math.floor(rand() * 8);
      const mats = [BB.azure_crystal, BB.rose_crystal, BB.verdant_crystal, BB.amber_crystal];
      const mat = mats[Math.floor(rand() * mats.length)];
      for (let k = 0; k < h; k++) log(x, y + k, z, BB.marble);
      for (let b = 0; b < 4; b++) {
        const a = (b / 4) * Math.PI * 2 + rand();
        const len = 3 + Math.floor(rand() * 3);
        const by = y + Math.floor(h * 0.5) + b;
        for (let s = 1; s <= len; s++) leaf(x + Math.round(Math.cos(a) * s), by + Math.floor(s / 2), z + Math.round(Math.sin(a) * s), mat);
      }
      blob(x, y + h, z, 2.4, mat);
      return out;
    }
    case 'worldroot': {
      // A great tree: a wide trunk with buttress roots, heavy limbs and a canopy of discs.
      const h = 34 + Math.floor(rand() * 18);
      const r = 2;
      for (let k = 0; k < h; k++) {
        const rr = k < 6 ? r + 1 : k > h - 10 ? 1 : r;
        for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) if (dx * dx + dz * dz <= rr * rr + 1) log(x + dx, y + k, z + dz, BB.worldroot_log);
      }
      for (let b = 0; b < 6; b++) {
        const a = (b / 6) * Math.PI * 2 + rand() * 0.5;
        for (let s = 3; s <= 9; s++) log(x + Math.round(Math.cos(a) * s), y + Math.max(0, 3 - Math.floor(s / 2)), z + Math.round(Math.sin(a) * s), BB.worldroot_log);
      }
      for (let b = 0; b < 7; b++) {
        const a = (b / 7) * Math.PI * 2 + rand() * 0.6;
        const by = y + Math.floor(h * 0.62) + Math.floor(rand() * 8);
        const len = 6 + Math.floor(rand() * 5);
        for (let s = 1; s <= len; s++) log(x + Math.round(Math.cos(a) * s), by + Math.floor(s / 3), z + Math.round(Math.sin(a) * s), BB.worldroot_log);
        blob(x + Math.round(Math.cos(a) * len), by + Math.floor(len / 3) + 1, z + Math.round(Math.sin(a) * len), 4.2, BB.worldroot_leaves);
      }
      for (let k = 0; k < 5; k++) disc(x, y + h - 2 + k, z, 8 - k * 1.5, BB.worldroot_leaves, 0.1);
      return out;
    }
    default:
      return out;
  }
}

/** The spire materials. */
const SPIRES: Record<SpireKind, { body: number; tip?: number; width: number }> = {
  azure: { body: BB.azure_crystal, width: 1.6 },
  rose: { body: BB.rose_crystal, width: 1.6 },
  verdant: { body: BB.verdant_crystal, width: 1.6 },
  amber: { body: BB.amber_crystal, width: 1.8 },
  ice: { body: B.PACKED_ICE, tip: BB.blue_ice, width: 2 },
  salt: { body: BB.salt_block, width: 1.4 },
  bone: { body: BB.bone_block, width: 1.2 },
  obsidian: { body: B.OBSIDIAN, tip: BB.weathered_obsidian, width: 1.8 },
  stone: { body: BB.limestone, tip: BB.ancient_bricks, width: 1.2 },
};

export class BeyondFlora {
  private readonly nClump: Simplex;
  private readonly nPatch: Simplex;

  constructor(private readonly host: FloraHost) {
    this.nClump = new Simplex(host.seed * 17 + 5101);
    this.nPatch = new Simplex(host.seed * 17 + 5102);
  }

  private floraAt(col: Column): FloraDef {
    const b = col.sub ? BEYOND_BIOMES[col.sub] : null;
    return b ? FLORA[b.flora] : FLORA.none;
  }

  /** The flora key of a column's biome. */
  floraKeyAt(col: Column): FloraKey {
    return col.sub ? BEYOND_BIOMES[col.sub].flora : 'none';
  }

  /** The tree rooted at a column, if any: its shape and whether it is a big one. */
  treeAt(wx: number, wz: number, col: Column): { shape: Shape; big: boolean } | null {
    const def = this.floraAt(col);
    if (!def.trees || !def.density) return null;
    if (col.height <= SEA_LEVEL) return null;
    const r = hash2(this.host.seed + 177, wx, wz);
    const n = this.nClump.fbm2(wx / 55, wz / 55, 2);
    const clump = Math.min(1.5, Math.max(0.05, 0.5 + n * 1.6));
    const d = def.density * clump;
    if (r >= d) return null;
    const shape = pickWeighted(def.trees, hash2(this.host.seed + 179, wx, wz));
    const big = r / d < 0.1;
    return { shape, big };
  }

  placeTrees(blocks: Uint16Array, cx: number, cz: number): void {
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    const seed = this.host.seed;
    const REACH = 12;
    const set = (wx: number, y: number, wz: number, id: number, onlyAir: boolean): void => {
      const lx = wx - ox;
      const lz = wz - oz;
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < 1 || y >= WORLD_HEIGHT) return;
      const idx = blockIndex(lx, y, lz);
      const cur = blocks[idx];
      if (onlyAir && cur !== B.AIR && cur !== B.WATER) return;
      if (onlyAir && cur === B.WATER && y > SEA_LEVEL) return;
      blocks[idx] = id;
    };
    // A building clears a volume of its own; a tree rooted near it would be left with only its top (and the canopy of one rooted
    // outside would be cut), so no tree is rooted within a canopy's reach of one.
    const claims = this.host.claims?.(ox - REACH, oz - REACH, CHUNK_SIZE + 2 * REACH, REACH) ?? [];
    for (let tx = ox - REACH; tx < ox + CHUNK_SIZE + REACH; tx++) {
      for (let tz = oz - REACH; tz < oz + CHUNK_SIZE + REACH; tz++) {
        if (hash2(seed + 177, tx, tz) >= 0.14) continue;
        if (claims.length > 0 && claimed(claims, tx, tz)) continue;
        const col = this.host.columnAt(tx, tz);
        const choice = this.treeAt(tx, tz, col);
        if (!choice) continue;
        if (this.host.inLake(tx, tz, 1.6)) continue;
        const top = this.host.groundTop(tx, tz, col);
        if (!rootsIn(choice.shape, top)) continue;
        let big = choice.big;
        if (choice.shape === 'jungle' || choice.shape === 'dark_oak') {
          if (isGiant(choice.shape, big)) {
            for (const [dx, dz] of [[1, 0], [0, 1], [1, 1]]) {
              const c2 = this.host.columnAt(tx + dx, tz + dz);
              if (Math.abs(c2.height - col.height) > 1 || c2.height <= SEA_LEVEL) big = false;
            }
          }
        }
        const rand = mulberry32(Math.floor(hash2(seed + 178, tx, tz) * 4294967296) | 0);
        for (const b of shapeBlocks(choice.shape, tx, col.height + 1, tz, rand, big)) set(b.x, b.y, b.z, b.id, b.leaf);
      }
    }
  }

  /** Where the ground surface of a chunk column is (the first solid block that is neither leaf nor log, near the biome's height). */
  private groundY(blocks: Uint16Array, lx: number, lz: number, h: number): number {
    for (let y = Math.min(WORLD_HEIGHT - 3, h + 3); y >= Math.max(1, h - 3); y--) {
      const id = blocks[blockIndex(lx, y, lz)];
      if (id === B.AIR || IS_LEAVES[id] || !IS_SOLID[id]) continue;
      return y;
    }
    return -1;
  }

  /** Ground cover, flowers, cacti and the life of the sea floor. */
  placeCover(blocks: Uint16Array, cx: number, cz: number): void {
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    const seed = this.host.seed;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx;
        const wz = oz + lz;
        const col = this.host.columnAt(wx, wz);
        const def = this.floraAt(col);
        const h = col.height;
        if (h < SEA_LEVEL) {
          this.seaFloor(blocks, lx, lz, wx, wz, h, def);
          continue;
        }
        const y = this.groundY(blocks, lx, lz, h);
        if (y < SEA_LEVEL || y >= WORLD_HEIGHT - 4) continue;
        if (blocks[blockIndex(lx, y + 1, lz)] !== B.AIR) continue;
        const ground = blocks[blockIndex(lx, y, lz)];
        const floor = def.floor ?? 'soil';
        const ok = floor === 'any' ? !IS_LEAVES[ground] : floor === 'sand' ? SAND_FLOORS.has(ground) || ground === B.SANDSTONE : isBeyondSoil(ground) && ground !== B.SNOW_BLOCK;
        if (def.cactus && (SAND_FLOORS.has(ground) && ground !== B.COARSE_DIRT) && wx % 3 === 0 && wz % 3 === 0 && hash2(seed + 195, wx, wz) < def.cactus) {
          let lonely = true;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.host.columnAt(wx + dx, wz + dz).height > h) lonely = false;
          if (lonely) {
            const hh = 1 + Math.floor(hash2(seed + 196, wx, wz) * 3);
            for (let k = 1; k <= hh && y + k < WORLD_HEIGHT; k++) blocks[blockIndex(lx, y + k, lz)] = B.CACTUS;
            continue;
          }
        }
        if (!ok) continue;
        const r = hash2(seed + 191, wx, wz);
        const patch = hash2(seed + 193, wx >> 3, wz >> 3);
        const patch2 = hash2(seed + 194, wx >> 3, wz >> 3);
        let put: number = B.AIR;
        if (def.flowers && patch < 0.4 && r < (def.flowerRate ?? 0.1)) {
          put = def.flowers[Math.min(def.flowers.length - 1, Math.floor(patch2 * def.flowers.length))];
        } else if (def.cover && def.coverRate && hash2(seed + 192, wx, wz) < def.coverRate) {
          const kind = pickWeighted(def.cover, hash2(seed + 197, wx, wz));
          if (kind === GROVE.bamboo) {
            const n = 3 + Math.floor(hash2(seed + 198, wx, wz) * 8);
            for (let k = 1; k <= n && y + k < WORLD_HEIGHT; k++) {
              if (blocks[blockIndex(lx, y + k, lz)] !== B.AIR) break;
              blocks[blockIndex(lx, y + k, lz)] = GROVE.bamboo;
            }
            continue;
          }
          put = kind;
        }
        if (put !== B.AIR) blocks[blockIndex(lx, y + 1, lz)] = put;
      }
    }
  }

  /** Life on the floor of the sea, a lake or a river. */
  private seaFloor(blocks: Uint16Array, lx: number, lz: number, wx: number, wz: number, h: number, def: FloraDef): void {
    const sea = def.sea;
    if (!sea) return;
    const seed = this.host.seed;
    if (blocks[blockIndex(lx, h + 1, lz)] !== B.WATER) return;
    const r = hash2(seed + 201, wx, wz);
    if (sea.kelp && r < sea.kelp) {
      const room = SEA_LEVEL - h - 2;
      if (room >= 2) {
        const n = Math.min(room, 3 + Math.floor(hash2(seed + 202, wx, wz) * 10));
        for (let k = 1; k <= n; k++) blocks[blockIndex(lx, h + k, lz)] = BB.kelp;
      }
      return;
    }
    // Only where there is water over it too: in a single layer of water a plant would stand in the surface and leave a hole in it.
    if (sea.grass && hash2(seed + 203, wx, wz) < sea.grass && blocks[blockIndex(lx, h + 2, lz)] === B.WATER) {
      blocks[blockIndex(lx, h + 1, lz)] = BB.seagrass;
      return;
    }
    if (sea.lily && h >= SEA_LEVEL - 6 && hash2(seed + 204, wx, wz) < sea.lily && blocks[blockIndex(lx, SEA_LEVEL + 1, lz)] === B.AIR) {
      blocks[blockIndex(lx, SEA_LEVEL + 1, lz)] = B.LILY_PAD;
    }
  }

  /** Boulders, spires, bushes, ribs and reefs: the large features, which reach across chunk borders. */
  placeFeatures(blocks: Uint16Array, cx: number, cz: number): void {
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    const seed = this.host.seed;
    const REACH = 10;
    // The ground level of the feature being drawn: what it puts at its foot is carried down to the terrain, so nothing hangs
    // over a lower neighbour on a slope.
    let footH = 0;
    const write = (wx: number, y: number, wz: number, id: number, free: boolean): void => {
      const lx = wx - ox;
      const lz = wz - oz;
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < 1 || y >= WORLD_HEIGHT) return;
      const idx = blockIndex(lx, y, lz);
      const cur = blocks[idx];
      if (free && cur !== B.AIR && cur !== B.WATER && !(IS_LEAVES[cur] === 1) && IS_SOLID[cur]) return;
      blocks[idx] = id;
      if (y <= footH + 2 && !IS_LEAVES[id]) {
        for (let yy = y - 1; yy >= Math.max(1, y - 24); yy--) {
          const below = blockIndex(lx, yy, lz);
          if (IS_SOLID[blocks[below]] && !IS_LEAVES[blocks[below]]) break;
          blocks[below] = id;
        }
      }
    };
    // A feature is drawn whole (even the part in the next chunk), then only what is joined to the ground is written: a spire's tip
    // that missed its stem, or a rib cut off by the terrain, is left out.
    const pending: { x: number; y: number; z: number; id: number; free: boolean }[] = [];
    const put = (wx: number, y: number, wz: number, id: number, free: boolean): void => void pending.push({ x: wx, y, z: wz, id, free });
    const flush = (): void => {
      if (pending.length === 0) return;
      for (const b of keepRooted(pending, (q) => q.y <= this.host.columnAt(q.x, q.z).height + 2)) write(b.x, b.y, b.z, b.id, b.free);
      pending.length = 0;
    };
    const claims = this.host.claims?.(ox - REACH, oz - REACH, CHUNK_SIZE + 2 * REACH, 6) ?? [];
    for (let x = ox - REACH; x < ox + CHUNK_SIZE + REACH; x++) {
      for (let z = oz - REACH; z < oz + CHUNK_SIZE + REACH; z++) {
        const roll = hash2(seed + 410, x, z);
        if (roll >= 0.02) continue;
        if (claims.length > 0 && claimed(claims, x, z)) continue;
        const col = this.host.columnAt(x, z);
        const def = this.floraAt(col);
        const h = col.height;
        footH = h;
        const rand = mulberry32(Math.floor(hash2(seed + 411, x, z) * 4294967296) | 0);
        const sea = h < SEA_LEVEL;
        if (sea) {
          if (def.sea?.reef && roll < def.sea.reef * 0.6 && h > SEA_LEVEL - 26) this.reef(put, x, h, z, rand);
          if (def.sea?.spires && roll < (def.sea.spireRate ?? 0.01)) this.spire(put, x, h, z, rand, def.sea.spires, [3, 10]);
          if (def.sea?.vents && roll < def.sea.vents) this.vent(put, x, h, z, rand);
          flush();
          continue;
        }
        if (this.host.inLake(x, z, 1.4)) continue;
        const top = this.host.groundTop(x, z, col);
        if (def.boulder && roll < def.boulder.rate && (def.boulder.alt === undefined || h > SEA_LEVEL + def.boulder.alt)) this.boulder(put, x, h, z, rand, def.boulder.id);
        else if (def.spire && roll < def.spire.rate) this.spire(put, x, h, z, rand, def.spire.kind, def.spire.height);
        else if (def.bush && roll < def.bush.rate && isBeyondSoil(top)) this.bush(put, x, h, z, def.bush.log, def.bush.leaves);
        else if (def.ribs && roll < def.ribs) this.ribs(put, x, h, z, rand);
        flush();
      }
    }
  }

  private boulder(put: (x: number, y: number, z: number, id: number, free: boolean) => void, x: number, h: number, z: number, rand: () => number, id: number): void {
    const r = 1.3 + rand() * 1.5;
    const R = Math.ceil(r);
    for (let dy = 0; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        for (let dz = -R; dz <= R; dz++) {
          const d = dx * dx + dz * dz + dy * dy * 1.3 + (rand() - 0.5) * 0.8;
          if (d > r * r) continue;
          put(x + dx, h + 1 + dy, z + dz, rand() < 0.2 && id === B.MOSSY_COBBLE ? B.COBBLE : id, true);
        }
      }
    }
  }

  private bush(put: (x: number, y: number, z: number, id: number, free: boolean) => void, x: number, h: number, z: number, logId: number, leaves: number): void {
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (Math.abs(dx) + Math.abs(dz) + dy > 2 || (dx === 0 && dz === 0 && dy === 0)) continue;
          put(x + dx, h + 1 + dy, z + dz, leaves, true);
        }
      }
    }
    put(x, h + 1, z, logId, false);
  }

  /** A tapering spire of crystal, ice, salt or bone, sometimes leaning, with a collar at its foot. */
  private spire(put: (x: number, y: number, z: number, id: number, free: boolean) => void, x: number, h: number, z: number, rand: () => number, kind: SpireKind, range: [number, number]): void {
    const spec = SPIRES[kind];
    const height = range[0] + Math.floor(rand() * (range[1] - range[0] + 1));
    const r = spec.width * (0.8 + rand() * 0.8);
    const lean = (rand() - 0.5) * 0.5;
    const lean2 = (rand() - 0.5) * 0.5;
    for (let k = -1; k < height; k++) {
      const t = 1 - Math.max(0, k) / height;
      const rr = Math.max(0, r * t * t);
      const sx = x + lean * k * 0.5;
      const sz = z + lean2 * k * 0.5;
      const fx = sx - Math.floor(sx);
      const fz = sz - Math.floor(sz);
      const R = Math.ceil(rr + 1);
      // Every layer has a block on the axis, however thin the tip grows.
      if (k >= 0) put(Math.floor(sx), h + 1 + k, Math.floor(sz), spec.tip !== undefined && k > height * 0.6 && rand() < 0.3 ? spec.tip : spec.body, false);
      for (let dx = -R; dx <= R; dx++) {
        for (let dz = -R; dz <= R; dz++) {
          if (Math.hypot(dx - fx, dz - fz) > rr + (k === height - 1 ? 0.4 : 0.05)) continue;
          put(Math.floor(sx) + dx, h + 1 + k, Math.floor(sz) + dz, spec.tip !== undefined && k > height * 0.6 && rand() < 0.3 ? spec.tip : spec.body, false);
        }
      }
    }
  }

  /** A gentle arc of bone half buried in the ground: the rib cage of something enormous. */
  private ribs(put: (x: number, y: number, z: number, id: number, free: boolean) => void, x: number, h: number, z: number, rand: () => number): void {
    const dir = rand() < 0.5;
    const n = 4 + Math.floor(rand() * 4);
    const span = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const base = i * 3;
      for (let s = -span; s <= span; s++) {
        const up = Math.round(Math.sqrt(Math.max(0, span * span - s * s)) * 0.9);
        const px = dir ? x + base : x + s;
        const pz = dir ? z + s : z + base;
        put(px, h + up, pz, BB.bone_block, true);
      }
    }
  }

  /** A mound of coral in one colour, with fans on top. */
  private reef(put: (x: number, y: number, z: number, id: number, free: boolean) => void, x: number, h: number, z: number, rand: () => number): void {
    const colours = [BB.coral_block_pink, BB.coral_block_red, BB.coral_block_blue, BB.coral_block_yellow, BB.coral_block_purple];
    const colour = colours[Math.floor(rand() * colours.length)];
    const n = 3 + Math.floor(rand() * 4);
    for (let i = 0; i < n; i++) {
      const dx = Math.floor((rand() - 0.5) * 8);
      const dz = Math.floor((rand() - 0.5) * 8);
      const height = 1 + Math.floor(rand() * 4);
      const c = this.host.columnAt(x + dx, z + dz);
      if (c.height >= SEA_LEVEL - 1) continue;
      for (let k = 1; k <= height; k++) put(x + dx, c.height + k, z + dz, rand() < 0.1 ? BB.dead_coral_block : colour, false);
      put(x + dx, c.height + height + 1, z + dz, rand() < 0.5 ? BB.coral_fan_pink : BB.coral_fan_blue, false);
    }
  }

  /** A black chimney with glowing rock round its mouth. */
  private vent(put: (x: number, y: number, z: number, id: number, free: boolean) => void, x: number, h: number, z: number, rand: () => number): void {
    const height = 3 + Math.floor(rand() * 6);
    for (let k = 1; k <= height; k++) {
      for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (k < height - 1 || (dx === 0 && dz === 0)) put(x + dx, h + k, z + dz, BB.basalt, false);
    }
    put(x, h + height, z, B.GLOWSTONE, false);
  }
}
