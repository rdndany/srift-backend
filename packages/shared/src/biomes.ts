/**
 * The biomes of the world and what the rest of the game needs to know about them.
 *
 * A biome is picked from the climate of a column (temperature and humidity, each in bands), the shape of the land (sea,
 * coast, hills, mountains) and a few extra fields (rivers, swamps, islands); see `terrain.ts`. The temperature band is
 * the backbone: bands only ever touch their neighbours, so frozen land borders cold land, cold borders temperate, and so
 * on up to the desert; snow and ice never lie next to hot, green country.
 */

export const Biome = {
  OCEAN: 0,
  BEACH: 1,
  PLAINS: 2,
  FOREST: 3,
  DESERT: 4,
  /** Snowy plains. */
  SNOW: 5,
  MOUNTAIN: 6,
  TAIGA: 7,
  DEEP_OCEAN: 8,
  FROZEN_OCEAN: 9,
  WARM_OCEAN: 10,
  RIVER: 11,
  FROZEN_RIVER: 12,
  SNOWY_BEACH: 13,
  STONY_SHORE: 14,
  BIRCH_FOREST: 15,
  DARK_FOREST: 16,
  FLOWER_FOREST: 17,
  SWAMP: 18,
  SAVANNA: 19,
  JUNGLE: 20,
  BADLANDS: 21,
  SNOWY_TAIGA: 22,
  /** Old-growth taiga: podzol, mossy boulders and great spruces. */
  OLD_TAIGA: 23,
  WINDSWEPT_HILLS: 24,
  MEADOW: 25,
  CHERRY_GROVE: 26,
  ICE_SPIKES: 27,
  /** Bare mountains of the warm lands: rock and gravel, never snow. */
  STONY_PEAKS: 28,
  MUSHROOM_FIELDS: 29,
} as const;
export type BiomeId = (typeof Biome)[keyof typeof Biome];

export interface Column {
  height: number;
  biome: BiomeId;
  /** The temperature band of the column: 0 frozen, 1 cold, 2 temperate, 3 warm, 4 hot. */
  heat?: number;
  /** Temperature and humidity, 0..1 (cold..hot, dry..wet). */
  t?: number;
  h?: number;
}

/** Names for the debug hooks, the map legend and the tests. */
export const BIOME_NAMES: Record<number, string> = {
  [Biome.OCEAN]: 'Ocean',
  [Biome.BEACH]: 'Beach',
  [Biome.PLAINS]: 'Plains',
  [Biome.FOREST]: 'Forest',
  [Biome.DESERT]: 'Desert',
  [Biome.SNOW]: 'Snowy Plains',
  [Biome.MOUNTAIN]: 'Mountains',
  [Biome.TAIGA]: 'Taiga',
  [Biome.DEEP_OCEAN]: 'Deep Ocean',
  [Biome.FROZEN_OCEAN]: 'Frozen Ocean',
  [Biome.WARM_OCEAN]: 'Warm Ocean',
  [Biome.RIVER]: 'River',
  [Biome.FROZEN_RIVER]: 'Frozen River',
  [Biome.SNOWY_BEACH]: 'Snowy Beach',
  [Biome.STONY_SHORE]: 'Stony Shore',
  [Biome.BIRCH_FOREST]: 'Birch Forest',
  [Biome.DARK_FOREST]: 'Dark Forest',
  [Biome.FLOWER_FOREST]: 'Flower Forest',
  [Biome.SWAMP]: 'Swamp',
  [Biome.SAVANNA]: 'Savanna',
  [Biome.JUNGLE]: 'Jungle',
  [Biome.BADLANDS]: 'Badlands',
  [Biome.SNOWY_TAIGA]: 'Snowy Taiga',
  [Biome.OLD_TAIGA]: 'Old Growth Taiga',
  [Biome.WINDSWEPT_HILLS]: 'Windswept Hills',
  [Biome.MEADOW]: 'Meadow',
  [Biome.CHERRY_GROVE]: 'Cherry Grove',
  [Biome.ICE_SPIKES]: 'Ice Spikes',
  [Biome.STONY_PEAKS]: 'Stony Peaks',
  [Biome.MUSHROOM_FIELDS]: 'Mushroom Fields',
};

/** Biomes that lie under water (their top block is the sea floor). */
export const WATER_BIOMES: ReadonlySet<number> = new Set<number>([Biome.OCEAN, Biome.DEEP_OCEAN, Biome.FROZEN_OCEAN, Biome.WARM_OCEAN, Biome.RIVER, Biome.FROZEN_RIVER]);

/** Biomes of the frozen band: snow on the ground, ice on the water. Nothing else has ice. */
export const FROZEN_BIOMES: ReadonlySet<number> = new Set<number>([
  Biome.SNOW,
  Biome.SNOWY_TAIGA,
  Biome.ICE_SPIKES,
  Biome.FROZEN_OCEAN,
  Biome.FROZEN_RIVER,
  Biome.SNOWY_BEACH,
]);

/** Biomes of the hot and warm lands (the dry and the lush ones): never next to a frozen one. */
export const HOT_BIOMES: ReadonlySet<number> = new Set<number>([Biome.DESERT, Biome.BADLANDS, Biome.SAVANNA, Biome.JUNGLE, Biome.WARM_OCEAN, Biome.STONY_PEAKS]);

/** Tree-bearing biomes of the cold: spruce country. */
export const SPRUCE_BIOMES: ReadonlySet<number> = new Set<number>([Biome.TAIGA, Biome.SNOWY_TAIGA, Biome.OLD_TAIGA]);

/** Biomes whose ground is grass (or close to it) and where villages may stand. */
export const VILLAGE_BIOMES: readonly number[] = [Biome.PLAINS, Biome.FOREST, Biome.BIRCH_FOREST, Biome.DESERT, Biome.SNOW, Biome.TAIGA, Biome.SAVANNA, Biome.MEADOW];

/** Biomes on land with grass under a roof of trees or open sky, where the passive animals graze. */
export const GRAZING_BIOMES: ReadonlySet<number> = new Set<number>([
  Biome.PLAINS,
  Biome.FOREST,
  Biome.BIRCH_FOREST,
  Biome.FLOWER_FOREST,
  Biome.DARK_FOREST,
  Biome.TAIGA,
  Biome.OLD_TAIGA,
  Biome.SAVANNA,
  Biome.MEADOW,
  Biome.CHERRY_GROVE,
  Biome.SWAMP,
]);
