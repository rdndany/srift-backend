import type { MobKind } from './mobs';
import { Biome } from './biomes';

/**
 * The catalog of The World Beyond: 110 biomes as data. Every biome has a climate niche (temperature, humidity and height),
 * the shape its land takes, what its ground and plants are, who lives there, what the air does, and what may be built in it.
 * The generator (beyondTerrain.ts) reads the niches to place biomes; nothing here draws a block.
 *
 * Ids 1..100 are the families of the design (plains, forests, tropics, deserts, mountains, the cold, wetlands, seas, fresh
 * water, fantasy) and 101..110 are the ten signature places, each so rare that finding one is a journey. Ids never change:
 * they are saved in discovery records.
 */

export type BiomeFamily =
  | 'plains' | 'forest' | 'tropical' | 'desert' | 'mountain' | 'cold' | 'wetland' | 'ocean' | 'fresh' | 'fantasy' | 'signature';
export const FAMILY_NAMES: Record<BiomeFamily, string> = {
  plains: 'Plains and Grasslands',
  forest: 'Forests',
  tropical: 'Tropics and Jungles',
  desert: 'Deserts and Dry Lands',
  mountain: 'Mountains and Highlands',
  cold: 'Cold and Polar Lands',
  wetland: 'Swamps and Wetlands',
  ocean: 'Oceans and Coasts',
  fresh: 'Rivers and Lakes',
  fantasy: 'Mushroom and Fantasy',
  signature: 'The Signature Realms',
};

export type BiomeRarity = 'common' | 'uncommon' | 'rare' | 'very_rare' | 'legendary';
export const BIOME_RARITY_ORDER: readonly BiomeRarity[] = ['common', 'uncommon', 'rare', 'very_rare', 'legendary'];
export const BIOME_RARITY_NAMES: Record<BiomeRarity, string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', very_rare: 'Very rare', legendary: 'Legendary' };

/** What a biome's land does: how it bends the ground (see `sculpt` in beyondTerrain.ts). */
export type SculptKind =
  | 'none' | 'rolling' | 'dunes' | 'mesa' | 'canyon' | 'spires' | 'plateau' | 'flat' | 'hummocks' | 'crevasse' | 'tors' | 'karst'
  | 'terraces' | 'hoodoos' | 'wetland' | 'seamount' | 'trench' | 'archipelago' | 'crater' | 'ridges';

/** What the ground of a biome is made of (see beyondSurface.ts). */
export type GroundKey =
  | 'grass' | 'meadow' | 'golden' | 'steppe' | 'highland' | 'podzol' | 'mossy' | 'jungle' | 'autumn' | 'dead' | 'petrified'
  | 'sand' | 'red_sand' | 'rock_desert' | 'badlands' | 'salt' | 'glass_sand' | 'ash' | 'bone'
  | 'mountain' | 'snow_rock' | 'alpine' | 'ice' | 'frost' | 'tundra' | 'polar'
  | 'swamp' | 'bog' | 'toxic' | 'marsh' | 'mangrove' | 'crystal' | 'volcanic' | 'mushroom' | 'fairy' | 'dream' | 'moonlit' | 'luminous'
  | 'sea_sand' | 'sea_gravel' | 'sea_clay' | 'sea_coral' | 'sea_rock' | 'sea_kelp' | 'sea_ice' | 'sea_volcanic' | 'sea_crystal' | 'abyss'
  | 'river_bed' | 'beach' | 'shingle' | 'cliff' | 'floodplain' | 'ancient' | 'worldroot' | 'night' | 'sky' | 'pale' | 'hollow' | 'drowned';

/** What grows on a biome (see beyondFlora.ts). */
export type FloraKey =
  | 'plains' | 'flower_field' | 'golden' | 'highland' | 'meadow' | 'ancient_grass' | 'steppe'
  | 'oak' | 'birch' | 'dark' | 'pine' | 'redwood' | 'autumn' | 'ancient' | 'bamboo' | 'cherry' | 'enchanted' | 'fog' | 'dead' | 'petrified'
  | 'jungle' | 'rainforest' | 'bamboo_rain' | 'tropic_wet' | 'mangrove' | 'jungle_high' | 'lost_jungle' | 'orchid'
  | 'desert' | 'red_desert' | 'rock_desert' | 'badlands' | 'salt' | 'oasis' | 'canyon' | 'glass' | 'ash_waste' | 'bone'
  | 'rock' | 'snow_peak' | 'alpine' | 'frozen_peak' | 'jagged' | 'crystal' | 'volcano' | 'sky_high' | 'floating' | 'thunder'
  | 'snow_plain' | 'snow_taiga' | 'frozen_forest' | 'ice_spikes' | 'glacier' | 'tundra' | 'arctic' | 'polar' | 'aurora' | 'winter'
  | 'swamp' | 'mangrove_swamp' | 'dark_swamp' | 'cypress' | 'bog' | 'toxic' | 'misty' | 'sunken_forest'
  | 'sea_warm' | 'sea_deep' | 'sea_cold' | 'sea_frozen' | 'coral' | 'kelp' | 'abyss' | 'sea_volcanic' | 'sea_crystal' | 'storm_coast' | 'rock_coast' | 'sand_coast' | 'mangrove_coast' | 'archipelago'
  | 'river' | 'lake' | 'alpine_lake' | 'waterfall' | 'floodplain'
  | 'mushroom' | 'spore' | 'crystal_forest' | 'luminous' | 'fairy' | 'dream' | 'moonlit'
  | 'shattered' | 'worldroot' | 'ashen' | 'drowned' | 'eternal_night' | 'crystal_expanse' | 'sunken_earth' | 'sky_islands' | 'pale' | 'hollow' | 'none';

/** What the air does (see `ATMOSPHERES` below). */
export type AtmosphereKey =
  | 'clear' | 'breezy' | 'forest' | 'mist' | 'fogbound' | 'jungle' | 'desert' | 'dust' | 'snow' | 'blizzard' | 'aurora' | 'swamp' | 'toxic'
  | 'mountain' | 'alpine' | 'thunder' | 'volcano' | 'ashfall' | 'sea' | 'deep' | 'abyss' | 'coast' | 'storm_coast' | 'fresh' | 'cave'
  | 'mushroom' | 'crystal' | 'fairy' | 'dream' | 'moonlit' | 'eternal_night' | 'sky' | 'shattered' | 'pale' | 'drowned' | 'sunken' | 'worldroot' | 'petals' | 'autumn';

export type PrecipKind = 'none' | 'rain' | 'snow';
export type ParticleKey = 'none' | 'pollen' | 'petals' | 'leaves' | 'fireflies' | 'spores' | 'snow' | 'sand' | 'ash' | 'embers' | 'crystal' | 'motes' | 'bubbles' | 'sparks' | 'mist';

export interface Atmosphere {
  /** How thick the haze is, 0 (clear) .. 1 (a few blocks of sight). The client scales the fog distance by it. */
  fog: number;
  /** The colour the distance fades into, and the sky's tint (0..255); null leaves the day and night colours alone. */
  fogColor: readonly [number, number, number] | null;
  sky: readonly [number, number, number] | null;
  /** Light of the day under this sky, 0..1 (1 is normal; an eternal night is 0.18). */
  light: number;
  /** Wind, 0 (still) .. 1 (a gale): bends grass and flags, drives the particles sideways. */
  wind: number;
  precip: PrecipKind;
  /** How much rain or snow falls when it is not clear, 0..1 (a desert never rains: 0). */
  wet: number;
  particles: ParticleKey;
  /** Which beds of sound play (the web audio engine knows these names). */
  ambience: 'meadow' | 'forest' | 'jungle' | 'desert' | 'wind' | 'snow' | 'swamp' | 'sea' | 'deep' | 'river' | 'cave' | 'magic' | 'storm' | 'fire' | 'night' | 'hollow';
  /** Thunder and a special storm (sandstorm, ash storm, blizzard) can blow up here. */
  storm: 'none' | 'thunder' | 'sand' | 'ash' | 'blizzard';
}

const A = (fog: number, fogColor: Atmosphere['fogColor'], sky: Atmosphere['sky'], light: number, wind: number, precip: PrecipKind, wet: number, particles: ParticleKey, ambience: Atmosphere['ambience'], storm: Atmosphere['storm'] = 'none'): Atmosphere => ({
  fog, fogColor, sky, light, wind, precip, wet, particles, ambience, storm,
});

export const ATMOSPHERES: Record<AtmosphereKey, Atmosphere> = {
  clear: A(0.05, null, null, 1, 0.2, 'rain', 0.5, 'pollen', 'meadow'),
  breezy: A(0.05, null, null, 1, 0.75, 'rain', 0.4, 'leaves', 'wind'),
  forest: A(0.12, [150, 178, 150], null, 0.9, 0.15, 'rain', 0.6, 'leaves', 'forest'),
  mist: A(0.35, [196, 208, 210], null, 0.85, 0.1, 'rain', 0.7, 'mist', 'forest'),
  fogbound: A(0.6, [186, 196, 200], [150, 160, 168], 0.7, 0.05, 'rain', 0.8, 'mist', 'forest'),
  jungle: A(0.2, [140, 176, 140], [120, 170, 150], 0.82, 0.1, 'rain', 1, 'fireflies', 'jungle'),
  desert: A(0.12, [226, 206, 160], [150, 190, 235], 1, 0.45, 'none', 0, 'sand', 'desert', 'sand'),
  dust: A(0.3, [214, 176, 126], [200, 170, 130], 0.92, 0.8, 'none', 0, 'sand', 'desert', 'sand'),
  snow: A(0.18, [214, 226, 238], [176, 200, 226], 0.95, 0.3, 'snow', 0.8, 'snow', 'snow'),
  blizzard: A(0.5, [226, 234, 244], [190, 206, 226], 0.78, 0.9, 'snow', 1, 'snow', 'wind', 'blizzard'),
  aurora: A(0.1, [150, 190, 220], [60, 110, 150], 0.9, 0.4, 'snow', 0.5, 'motes', 'snow'),
  swamp: A(0.3, [120, 140, 110], [140, 160, 130], 0.8, 0.05, 'rain', 0.9, 'fireflies', 'swamp'),
  toxic: A(0.38, [140, 170, 70], [150, 170, 90], 0.78, 0.1, 'rain', 0.6, 'spores', 'swamp'),
  mountain: A(0.08, [190, 206, 226], null, 1, 0.8, 'snow', 0.5, 'none', 'wind'),
  alpine: A(0.1, [196, 214, 232], [140, 190, 240], 1, 0.55, 'rain', 0.6, 'pollen', 'wind'),
  thunder: A(0.3, [110, 118, 140], [86, 94, 118], 0.62, 0.9, 'rain', 1, 'sparks', 'storm', 'thunder'),
  volcano: A(0.3, [150, 96, 70], [120, 80, 70], 0.8, 0.5, 'none', 0, 'embers', 'fire'),
  ashfall: A(0.5, [96, 90, 90], [80, 76, 80], 0.6, 0.7, 'none', 0, 'ash', 'fire', 'ash'),
  sea: A(0.08, null, null, 1, 0.5, 'rain', 0.5, 'none', 'sea'),
  deep: A(0.1, null, null, 1, 0.6, 'rain', 0.6, 'none', 'sea'),
  abyss: A(0.2, [20, 36, 70], null, 1, 0.6, 'rain', 0.6, 'bubbles', 'deep'),
  coast: A(0.1, null, null, 1, 0.6, 'rain', 0.5, 'none', 'sea'),
  storm_coast: A(0.35, [120, 136, 160], [96, 108, 130], 0.7, 1, 'rain', 1, 'mist', 'storm', 'thunder'),
  fresh: A(0.08, null, null, 1, 0.3, 'rain', 0.5, 'pollen', 'river'),
  cave: A(0.2, [30, 30, 40], null, 1, 0, 'none', 0, 'none', 'cave'),
  mushroom: A(0.28, [130, 100, 170], [140, 110, 180], 0.75, 0.05, 'rain', 0.4, 'spores', 'magic'),
  crystal: A(0.1, [186, 180, 255], [150, 170, 255], 1, 0.3, 'none', 0, 'crystal', 'magic'),
  fairy: A(0.2, [214, 190, 255], [180, 160, 255], 0.9, 0.1, 'rain', 0.3, 'motes', 'magic'),
  dream: A(0.38, [200, 170, 230], [170, 140, 210], 0.8, 0.2, 'rain', 0.3, 'motes', 'magic'),
  moonlit: A(0.25, [140, 160, 210], [70, 90, 160], 0.45, 0.15, 'none', 0, 'fireflies', 'night'),
  eternal_night: A(0.55, [14, 14, 32], [6, 6, 22], 0.18, 0.1, 'none', 0, 'fireflies', 'night'),
  sky: A(0.03, [226, 236, 255], [110, 170, 255], 1, 0.9, 'none', 0, 'motes', 'wind'),
  shattered: A(0.12, [196, 170, 230], [150, 120, 210], 0.95, 0.8, 'none', 0, 'sparks', 'wind'),
  pale: A(0.3, [226, 224, 214], [214, 212, 204], 1, 0.9, 'none', 0, 'sand', 'wind'),
  drowned: A(0.3, [30, 90, 110], null, 1, 0.5, 'rain', 0.6, 'bubbles', 'deep'),
  sunken: A(0.22, [170, 196, 170], null, 0.92, 0.3, 'rain', 0.7, 'mist', 'river'),
  worldroot: A(0.25, [150, 200, 160], [140, 200, 170], 0.7, 0.2, 'rain', 0.7, 'motes', 'forest'),
  petals: A(0.12, null, null, 1, 0.3, 'rain', 0.5, 'petals', 'meadow'),
  autumn: A(0.15, [226, 190, 150], null, 0.95, 0.5, 'rain', 0.6, 'leaves', 'forest'),
};

/** What can be built in a biome (see beyondStructures.ts). */
export type StructureKey =
  | 'standing_stones' | 'ruined_watchtower' | 'shrine' | 'abandoned_village' | 'hunters_camp' | 'ancient_library' | 'crypt' | 'burial_ground'
  | 'ruined_monastery' | 'fishing_village' | 'lighthouse' | 'shipwreck' | 'buried_treasure' | 'giant_statue' | 'battlefield' | 'dragon_skeleton'
  | 'jungle_temple' | 'desert_temple' | 'oasis_camp' | 'mountain_hold' | 'ruined_fortress' | 'tree_village' | 'sky_temple' | 'volcanic_fortress'
  | 'sunken_temple' | 'crystal_sanctuary' | 'ice_cairn' | 'bridge' | 'harbor' | 'coral_reef' | 'sunken_ruins' | 'fossil' | 'monolith' | 'witch_hut' | 'nest';

export interface BeyondBiome {
  id: number;
  key: string;
  name: string;
  family: BiomeFamily;
  rarity: BiomeRarity;
  kind: 'land' | 'ocean' | 'coast' | 'river' | 'lake' | 'cave' | 'signature';
  /** The tier a land biome competes in: 0 anywhere its climate fits, 1..3 only inside patches of rarer and rarer luck. */
  tier: 0 | 1 | 2 | 3;
  desc: string;
  /** Climate niche: temperature and humidity (0..1) as [centre, reach]. The reach is how far from the centre it still fits. */
  t: readonly [number, number];
  h: readonly [number, number];
  /** Land: blocks above the sea the ground may lie in. Water: depth below the surface. */
  alt: readonly [number, number];
  /** Optional variant axis (0..1): [centre, reach]. Tells apart biomes that share a climate. */
  v?: readonly [number, number];
  shape: SculptKind;
  /** How strongly the shape bends the ground, in blocks. */
  amp: number;
  ground: GroundKey;
  flora: FloraKey;
  atmosphere: AtmosphereKey;
  /** Animals of the game's own that graze or swim here, most common first. */
  wildlife: readonly MobKind[];
  /** The original creatures and plants the encyclopedia tells of (data for the Codex). */
  lore: readonly string[];
  structures: readonly StructureKey[];
  /** Nearest biome of the other worlds, so that villages, mobs, spawn points and the old map keep working. */
  legacy: number;
}

interface Entry {
  id: number;
  key: string;
  name: string;
  family: BiomeFamily;
  rarity: BiomeRarity;
  kind?: BeyondBiome['kind'];
  tier?: 0 | 1 | 2 | 3;
  desc: string;
  t: readonly [number, number];
  h: readonly [number, number];
  alt?: readonly [number, number];
  v?: readonly [number, number];
  shape?: SculptKind;
  amp?: number;
  ground: GroundKey;
  flora: FloraKey;
  atmosphere: AtmosphereKey;
  wildlife?: readonly MobKind[];
  lore?: readonly string[];
  structures?: readonly StructureKey[];
  legacy: number;
}

const L = Biome;

const ENTRIES: Entry[] = [
  // ---- A. plains and grasslands
  { id: 1, key: 'green_plains', name: 'Green Plains', family: 'plains', rarity: 'common', desc: 'Rolling hills of grass, wildflowers, small lakes and scattered trees.', t: [0.52, 0.2], h: [0.42, 0.22], alt: [0, 22], shape: 'rolling', amp: 4, ground: 'grass', flora: 'plains', atmosphere: 'clear', wildlife: ['cow', 'pig', 'sheep', 'horse', 'rabbit', 'chicken'], lore: ['Meadow larks', 'Hedge roses'], structures: ['standing_stones', 'abandoned_village', 'ruined_watchtower'], legacy: L.PLAINS },
  { id: 2, key: 'flower_fields', name: 'Flower Fields', family: 'plains', rarity: 'uncommon', tier: 1, desc: 'Enormous colourful fields of flowers, humming with bees and drifting with butterflies.', t: [0.53, 0.14], h: [0.52, 0.14], alt: [0, 20], v: [0.8, 0.3], shape: 'rolling', amp: 3, ground: 'meadow', flora: 'flower_field', atmosphere: 'petals', wildlife: ['bee', 'rabbit', 'sheep', 'cow'], lore: ['Prism butterflies', 'Honey bees'], structures: ['shrine', 'hunters_camp'], legacy: L.FLOWER_FOREST },
  { id: 3, key: 'golden_grasslands', name: 'Golden Grasslands', family: 'plains', rarity: 'common', desc: 'Tall golden grass bending in warm winds, with herds grazing between lone trees.', t: [0.67, 0.14], h: [0.36, 0.14], alt: [0, 25], shape: 'rolling', amp: 5, ground: 'golden', flora: 'golden', atmosphere: 'breezy', wildlife: ['horse', 'donkey', 'cow', 'llama', 'rabbit'], lore: ['Plains stags', 'Pampas rats'], structures: ['standing_stones', 'battlefield', 'hunters_camp'], legacy: L.SAVANNA },
  { id: 4, key: 'windy_highlands', name: 'Windy Highlands', family: 'plains', rarity: 'common', desc: 'Open hills with exposed rock, heather and a strong wind that never rests.', t: [0.42, 0.2], h: [0.42, 0.25], alt: [26, 62], shape: 'tors', amp: 8, ground: 'highland', flora: 'highland', atmosphere: 'breezy', wildlife: ['goat', 'sheep', 'rabbit', 'fox'], lore: ['Highland ravens', 'Heather hares'], structures: ['standing_stones', 'ruined_watchtower', 'mountain_hold'], legacy: L.WINDSWEPT_HILLS },
  { id: 5, key: 'wildflower_meadows', name: 'Wildflower Meadows', family: 'plains', rarity: 'uncommon', tier: 1, desc: 'Dense flowers, quiet streams and beautiful scenery in every direction.', t: [0.5, 0.14], h: [0.6, 0.14], alt: [8, 34], v: [0.3, 0.3], shape: 'rolling', amp: 5, ground: 'meadow', flora: 'meadow', atmosphere: 'petals', wildlife: ['bee', 'rabbit', 'sheep', 'horse', 'fox'], lore: ['Dew fairies', 'Wild bluebells'], structures: ['shrine', 'bridge'], legacy: L.MEADOW },
  { id: 6, key: 'ancient_grasslands', name: 'Ancient Grasslands', family: 'plains', rarity: 'rare', tier: 2, desc: 'Enormous old trees, mysterious standing stones and abandoned settlements across a timeless plain.', t: [0.5, 0.14], h: [0.5, 0.14], alt: [0, 28], shape: 'rolling', amp: 5, ground: 'ancient', flora: 'ancient_grass', atmosphere: 'clear', wildlife: ['horse', 'cow', 'fox', 'wolf'], lore: ['Elder oaks', 'Stone wardens'], structures: ['standing_stones', 'abandoned_village', 'monolith', 'ancient_library'], legacy: L.PLAINS },
  { id: 7, key: 'rocky_steppe', name: 'Rocky Steppe', family: 'plains', rarity: 'common', desc: 'Dry grass, scattered boulders and rugged ground under a wide sky.', t: [0.5, 0.2], h: [0.24, 0.12], alt: [4, 40], shape: 'tors', amp: 5, ground: 'steppe', flora: 'steppe', atmosphere: 'breezy', wildlife: ['goat', 'horse', 'rabbit', 'camel'], lore: ['Steppe eagles', 'Pika'], structures: ['standing_stones', 'hunters_camp', 'battlefield'], legacy: L.PLAINS },

  // ---- B. forests
  { id: 8, key: 'oak_forest', name: 'Oak Forest', family: 'forest', rarity: 'common', desc: 'Classic mixed woodland of oak and birch, with deer between the trunks.', t: [0.5, 0.16], h: [0.58, 0.18], alt: [0, 30], shape: 'rolling', amp: 4, ground: 'grass', flora: 'oak', atmosphere: 'forest', wildlife: ['pig', 'cow', 'wolf', 'fox', 'rabbit'], lore: ['Forest deer', 'Acorn jays'], structures: ['hunters_camp', 'abandoned_village', 'shrine', 'ruined_watchtower'], legacy: L.FOREST },
  { id: 9, key: 'birch_forest', name: 'Birch Forest', family: 'forest', rarity: 'common', desc: 'Pale trunks and dense green undergrowth, bright and quiet.', t: [0.44, 0.14], h: [0.55, 0.16], alt: [0, 30], v: [0.35, 0.4], shape: 'rolling', amp: 4, ground: 'grass', flora: 'birch', atmosphere: 'forest', wildlife: ['cow', 'rabbit', 'fox', 'bee'], lore: ['Silver finches'], structures: ['hunters_camp', 'shrine'], legacy: L.BIRCH_FOREST },
  { id: 10, key: 'dark_forest', name: 'Dark Forest', family: 'forest', rarity: 'uncommon', tier: 1, desc: 'An extremely dense canopy lets almost no sun through, and the creatures below are dangerous.', t: [0.46, 0.16], h: [0.76, 0.14], alt: [0, 34], shape: 'rolling', amp: 5, ground: 'podzol', flora: 'dark', atmosphere: 'fogbound', wildlife: ['wolf', 'fox'], lore: ['Gloom spiders', 'Hollow owls'], structures: ['witch_hut', 'crypt', 'ruined_monastery'], legacy: L.DARK_FOREST },
  { id: 11, key: 'pine_forest', name: 'Pine Forest', family: 'forest', rarity: 'common', desc: 'Evergreen trees over a carpet of needles, home to wolves and foxes.', t: [0.34, 0.14], h: [0.56, 0.2], alt: [0, 40], shape: 'rolling', amp: 5, ground: 'podzol', flora: 'pine', atmosphere: 'forest', wildlife: ['wolf', 'fox', 'rabbit', 'goat'], lore: ['Pine martens', 'Needle owls'], structures: ['hunters_camp', 'abandoned_village', 'ruined_watchtower'], legacy: L.TAIGA },
  { id: 12, key: 'redwood_forest', name: 'Redwood Forest', family: 'forest', rarity: 'uncommon', tier: 1, desc: 'Giants with trunks like towers and canopies a hundred blocks up, in perpetual shade.', t: [0.48, 0.12], h: [0.76, 0.12], alt: [4, 48], shape: 'rolling', amp: 6, ground: 'mossy', flora: 'redwood', atmosphere: 'mist', wildlife: ['wolf', 'fox', 'bee'], lore: ['Canopy gliders', 'Fern bears'], structures: ['nest', 'tree_village', 'shrine', 'hunters_camp'], legacy: L.OLD_TAIGA },
  { id: 13, key: 'autumn_forest', name: 'Autumn Forest', family: 'forest', rarity: 'uncommon', tier: 1, desc: 'Orange, yellow and red foliage with leaves always drifting down.', t: [0.4, 0.1], h: [0.5, 0.14], alt: [0, 36], shape: 'rolling', amp: 5, ground: 'autumn', flora: 'autumn', atmosphere: 'autumn', wildlife: ['fox', 'rabbit', 'pig', 'wolf'], lore: ['Harvest foxes', 'Leaf moths'], structures: ['hunters_camp', 'abandoned_village', 'shrine'], legacy: L.FOREST },
  { id: 14, key: 'ancient_forest', name: 'Ancient Forest', family: 'forest', rarity: 'rare', tier: 2, desc: 'Giant trees, ruins, hidden groves and rare wildlife in a wood older than memory.', t: [0.48, 0.12], h: [0.68, 0.12], alt: [0, 40], shape: 'rolling', amp: 5, ground: 'mossy', flora: 'ancient', atmosphere: 'mist', wildlife: ['wolf', 'fox', 'allay', 'bee'], lore: ['Elder stags', 'Moss wardens'], structures: ['ruined_monastery', 'shrine', 'tree_village', 'monolith', 'ancient_library'], legacy: L.DARK_FOREST },
  { id: 15, key: 'bamboo_forest', name: 'Bamboo Forest', family: 'forest', rarity: 'uncommon', tier: 1, desc: 'Thick bamboo groves and dense undergrowth, with pandas rolling in the shade.', t: [0.6, 0.12], h: [0.62, 0.14], alt: [0, 36], shape: 'rolling', amp: 4, ground: 'jungle', flora: 'bamboo', atmosphere: 'forest', wildlife: ['panda', 'parrot', 'frog'], lore: ['Bamboo pandas', 'Jade snakes'], structures: ['shrine', 'hunters_camp'], legacy: L.JUNGLE },
  { id: 16, key: 'cherry_blossom_forest', name: 'Cherry Blossom Forest', family: 'forest', rarity: 'uncommon', tier: 1, desc: 'Pink flowering trees, drifting petals and peaceful lakes.', t: [0.5, 0.1], h: [0.5, 0.12], alt: [4, 40], v: [0.6, 0.3], shape: 'rolling', amp: 4, ground: 'meadow', flora: 'cherry', atmosphere: 'petals', wildlife: ['bee', 'rabbit', 'sheep', 'fox'], lore: ['Petal sprites', 'Koi'], structures: ['shrine', 'bridge', 'ruined_monastery'], legacy: L.CHERRY_GROVE },
  { id: 17, key: 'enchanted_forest', name: 'Enchanted Forest', family: 'forest', rarity: 'rare', tier: 2, desc: 'Luminous plants, strange trees, magical particles and creatures seen nowhere else.', t: [0.52, 0.1], h: [0.7, 0.1], alt: [0, 36], shape: 'rolling', amp: 5, ground: 'fairy', flora: 'enchanted', atmosphere: 'fairy', wildlife: ['allay', 'fox', 'bee', 'rabbit'], lore: ['Wisp foxes', 'Glimmer moths'], structures: ['shrine', 'monolith', 'ancient_library'], legacy: L.FLOWER_FOREST },
  { id: 18, key: 'fog_forest', name: 'Fog Forest', family: 'forest', rarity: 'uncommon', tier: 1, desc: 'Heavy fog drifts between moss-covered trees and hides everything beyond a few blocks.', t: [0.4, 0.12], h: [0.84, 0.1], alt: [0, 40], shape: 'rolling', amp: 5, ground: 'mossy', flora: 'fog', atmosphere: 'fogbound', wildlife: ['frog', 'fox', 'wolf'], lore: ['Mist stags', 'Veil spiders'], structures: ['crypt', 'ruined_monastery', 'witch_hut'], legacy: L.DARK_FOREST },
  { id: 19, key: 'dead_forest', name: 'Dead Forest', family: 'forest', rarity: 'uncommon', tier: 1, desc: 'Twisted bare trees, dead vegetation and dangerous wildlife.', t: [0.6, 0.2], h: [0.22, 0.12], alt: [0, 40], shape: 'hummocks', amp: 3, ground: 'dead', flora: 'dead', atmosphere: 'mist', wildlife: ['wolf', 'fox'], lore: ['Carrion crows', 'Bone wolves'], structures: ['crypt', 'burial_ground', 'battlefield', 'witch_hut'], legacy: L.PLAINS },
  { id: 20, key: 'petrified_forest', name: 'Petrified Forest', family: 'forest', rarity: 'rare', tier: 2, desc: 'Enormous fossilised trees turned to stone, standing where the forest once drowned.', t: [0.62, 0.16], h: [0.3, 0.12], alt: [0, 44], shape: 'hoodoos', amp: 5, ground: 'petrified', flora: 'petrified', atmosphere: 'dust', wildlife: ['camel', 'armadillo', 'rabbit'], lore: ['Stone beetles'], structures: ['fossil', 'monolith', 'dragon_skeleton'], legacy: L.SAVANNA },

  // ---- C. tropical and jungle
  { id: 21, key: 'tropical_jungle', name: 'Tropical Jungle', family: 'tropical', rarity: 'common', desc: 'Huge trees, hanging vines, dense foliage and exotic animals.', t: [0.76, 0.12], h: [0.72, 0.14], alt: [0, 40], shape: 'rolling', amp: 6, ground: 'jungle', flora: 'jungle', atmosphere: 'jungle', wildlife: ['parrot', 'ocelot', 'panda', 'frog', 'bee'], lore: ['Canopy macaws', 'Strangler figs'], structures: ['jungle_temple', 'tree_village', 'hunters_camp'], legacy: L.JUNGLE },
  { id: 22, key: 'rainforest', name: 'Rainforest', family: 'tropical', rarity: 'uncommon', tier: 1, desc: 'Many layers of vegetation, enormous leaves and constant humidity.', t: [0.72, 0.1], h: [0.9, 0.08], alt: [0, 44], shape: 'rolling', amp: 6, ground: 'jungle', flora: 'rainforest', atmosphere: 'jungle', wildlife: ['parrot', 'ocelot', 'frog', 'sniffer'], lore: ['Giant-leaf gliders', 'Orchid mantises'], structures: ['nest', 'jungle_temple', 'tree_village'], legacy: L.JUNGLE },
  { id: 23, key: 'bamboo_rainforest', name: 'Bamboo Rainforest', family: 'tropical', rarity: 'uncommon', tier: 1, desc: 'Massive bamboo forests with dense undergrowth under constant mist.', t: [0.68, 0.1], h: [0.8, 0.1], alt: [0, 44], shape: 'rolling', amp: 5, ground: 'jungle', flora: 'bamboo_rain', atmosphere: 'mist', wildlife: ['panda', 'parrot', 'frog'], lore: ['Jade pandas'], structures: ['shrine', 'jungle_temple'], legacy: L.JUNGLE },
  { id: 24, key: 'tropical_wetlands', name: 'Tropical Wetlands', family: 'tropical', rarity: 'uncommon', tier: 1, desc: 'Shallow warm water, mangroves and unusual wildlife.', t: [0.76, 0.14], h: [0.8, 0.14], alt: [-1, 9], v: [0.15, 0.2], shape: 'wetland', amp: 3, ground: 'marsh', flora: 'tropic_wet', atmosphere: 'swamp', wildlife: ['frog', 'parrot', 'turtle'], lore: ['Heron kings', 'Glass frogs'], structures: ['hunters_camp', 'abandoned_village'], legacy: L.SWAMP },
  { id: 25, key: 'mangrove_forest', name: 'Mangrove Forest', family: 'tropical', rarity: 'uncommon', tier: 1, desc: 'Trees standing in tidal water on tangled, exposed roots.', t: [0.74, 0.14], h: [0.74, 0.16], alt: [-1, 9], v: [0.5, 0.16], shape: 'wetland', amp: 2, ground: 'mangrove', flora: 'mangrove', atmosphere: 'swamp', wildlife: ['frog', 'turtle', 'parrot'], lore: ['Mudskippers'], structures: ['fishing_village', 'hunters_camp'], legacy: L.SWAMP },
  { id: 26, key: 'jungle_highlands', name: 'Jungle Highlands', family: 'tropical', rarity: 'uncommon', tier: 1, desc: 'Elevated tropical forests streaked with waterfalls.', t: [0.66, 0.1], h: [0.7, 0.14], alt: [40, 110], shape: 'terraces', amp: 6, ground: 'jungle', flora: 'jungle_high', atmosphere: 'mist', wildlife: ['parrot', 'ocelot', 'goat', 'panda'], lore: ['Cloud macaws'], structures: ['jungle_temple', 'mountain_hold'], legacy: L.JUNGLE },
  { id: 27, key: 'lost_jungle', name: 'Lost Jungle', family: 'tropical', rarity: 'rare', tier: 2, desc: 'Overgrown temples, ancient structures and rare creatures swallowed by the green.', t: [0.76, 0.1], h: [0.75, 0.1], alt: [0, 44], shape: 'rolling', amp: 6, ground: 'jungle', flora: 'lost_jungle', atmosphere: 'jungle', wildlife: ['parrot', 'ocelot', 'sniffer', 'frog'], lore: ['Temple jaguars', 'Idol vines'], structures: ['jungle_temple', 'ruined_fortress', 'monolith', 'ancient_library'], legacy: L.JUNGLE },
  { id: 28, key: 'orchid_jungle', name: 'Orchid Jungle', family: 'tropical', rarity: 'rare', tier: 2, desc: 'Colourful flowers and extraordinary plant life hang from every branch.', t: [0.74, 0.1], h: [0.68, 0.1], alt: [0, 40], shape: 'rolling', amp: 5, ground: 'jungle', flora: 'orchid', atmosphere: 'petals', wildlife: ['parrot', 'bee', 'ocelot', 'frog'], lore: ['Orchid mantises', 'Rainbow macaws'], structures: ['shrine', 'jungle_temple'], legacy: L.JUNGLE },

  // ---- D. deserts and dry lands
  { id: 29, key: 'sand_desert', name: 'Sand Desert', family: 'desert', rarity: 'common', desc: 'Dunes, cacti and extreme temperatures under a merciless sun.', t: [0.86, 0.12], h: [0.12, 0.12], alt: [0, 32], shape: 'dunes', amp: 7, ground: 'sand', flora: 'desert', atmosphere: 'desert', wildlife: ['camel', 'rabbit', 'armadillo'], lore: ['Dune scorpions', 'Sand vipers'], structures: ['desert_temple', 'abandoned_village', 'oasis_camp', 'fossil', 'ruined_watchtower'], legacy: L.DESERT },
  { id: 30, key: 'red_desert', name: 'Red Desert', family: 'desert', rarity: 'uncommon', tier: 1, desc: 'Red sand, sandstone formations and mesas glowing at dusk.', t: [0.84, 0.1], h: [0.2, 0.1], alt: [0, 44], shape: 'mesa', amp: 12, ground: 'red_sand', flora: 'red_desert', atmosphere: 'desert', wildlife: ['camel', 'armadillo', 'rabbit'], lore: ['Ochre lizards'], structures: ['desert_temple', 'fossil', 'ruined_watchtower'], legacy: L.BADLANDS },
  { id: 31, key: 'rocky_desert', name: 'Rocky Desert', family: 'desert', rarity: 'uncommon', tier: 1, desc: 'Exposed stone, dry valleys and hardy scrub between the cliffs.', t: [0.78, 0.12], h: [0.15, 0.12], alt: [10, 60], shape: 'tors', amp: 10, ground: 'rock_desert', flora: 'rock_desert', atmosphere: 'desert', wildlife: ['goat', 'camel', 'armadillo'], lore: ['Rock agamas'], structures: ['desert_temple', 'ruined_fortress', 'fossil'], legacy: L.DESERT },
  { id: 32, key: 'badlands', name: 'Badlands', family: 'desert', rarity: 'uncommon', tier: 1, desc: 'Layered, brightly coloured geological formations carved by ancient rivers.', t: [0.82, 0.1], h: [0.28, 0.1], alt: [4, 60], shape: 'mesa', amp: 20, ground: 'badlands', flora: 'badlands', atmosphere: 'desert', wildlife: ['camel', 'armadillo'], lore: ['Banded lizards'], structures: ['desert_temple', 'fossil', 'battlefield'], legacy: L.BADLANDS },
  { id: 33, key: 'salt_flats', name: 'Salt Flats', family: 'desert', rarity: 'rare', tier: 2, desc: 'Enormous white plains of crusted salt, mirror-flat after a rare rain.', t: [0.8, 0.14], h: [0.1, 0.1], alt: [-2, 5], shape: 'flat', amp: 2, ground: 'salt', flora: 'salt', atmosphere: 'desert', wildlife: ['camel', 'rabbit'], lore: ['Brine flamingos'], structures: ['monolith', 'fossil', 'abandoned_village'], legacy: L.DESERT },
  { id: 34, key: 'desert_oasis', name: 'Desert Oasis', family: 'desert', rarity: 'rare', tier: 2, desc: 'Palm trees, clear water, lush vegetation and a settlement living off a hidden spring.', t: [0.84, 0.1], h: [0.3, 0.1], alt: [0, 20], shape: 'wetland', amp: 2, ground: 'sand', flora: 'oasis', atmosphere: 'clear', wildlife: ['camel', 'parrot', 'frog'], lore: ['Date palms', 'Oasis herons'], structures: ['oasis_camp', 'shrine', 'fishing_village'], legacy: L.DESERT },
  { id: 35, key: 'canyon_desert', name: 'Canyon Desert', family: 'desert', rarity: 'rare', tier: 2, desc: 'Huge ravines and winding sandstone cliffs cut through the dry land.', t: [0.78, 0.1], h: [0.1, 0.1], alt: [20, 70], shape: 'canyon', amp: 30, ground: 'red_sand', flora: 'canyon', atmosphere: 'dust', wildlife: ['goat', 'camel'], lore: ['Cliff condors'], structures: ['bridge', 'desert_temple', 'mountain_hold', 'fossil'], legacy: L.BADLANDS },
  { id: 36, key: 'glass_desert', name: 'Glass Desert', family: 'desert', rarity: 'very_rare', tier: 3, desc: 'A magical desert where lightning has fused the sand into glittering natural crystal.', t: [0.9, 0.06], h: [0.06, 0.06], alt: [0, 40], shape: 'spires', amp: 6, ground: 'glass_sand', flora: 'glass', atmosphere: 'crystal', wildlife: ['armadillo'], lore: ['Prism scarabs'], structures: ['monolith', 'crystal_sanctuary'], legacy: L.DESERT },
  { id: 37, key: 'ash_desert', name: 'Ash Desert', family: 'desert', rarity: 'rare', tier: 2, desc: 'Volcanic ash, blackened earth and the abandoned structures of those who fled it.', t: [0.8, 0.1], h: [0.1, 0.1], alt: [0, 50], shape: 'dunes', amp: 5, ground: 'ash', flora: 'ash_waste', atmosphere: 'ashfall', wildlife: ['armadillo'], lore: ['Cinder crawlers'], structures: ['ruined_fortress', 'burial_ground', 'abandoned_village'], legacy: L.DESERT },
  { id: 38, key: 'bone_desert', name: 'Bone Desert', family: 'desert', rarity: 'rare', tier: 2, desc: 'Fossilised skeletons and ancient buried creatures lie bleaching in the sand.', t: [0.84, 0.08], h: [0.08, 0.08], alt: [0, 40], shape: 'dunes', amp: 6, ground: 'bone', flora: 'bone', atmosphere: 'dust', wildlife: ['camel', 'armadillo'], lore: ['Marrow crows'], structures: ['dragon_skeleton', 'fossil', 'burial_ground', 'monolith'], legacy: L.DESERT },

  // ---- E. mountains and high altitudes
  { id: 39, key: 'rocky_mountains', name: 'Rocky Mountains', family: 'mountain', rarity: 'common', desc: 'Tall mountains of grey stone with cliffs, ridges and wooded valleys between.', t: [0.5, 0.3], h: [0.45, 0.35], alt: [44, 170], shape: 'ridges', amp: 8, ground: 'mountain', flora: 'rock', atmosphere: 'mountain', wildlife: ['goat', 'wolf', 'fox'], lore: ['Mountain eagles', 'Stone bears'], structures: ['mountain_hold', 'ruined_watchtower', 'bridge', 'crypt'], legacy: L.MOUNTAIN },
  { id: 40, key: 'snowy_mountains', name: 'Snowy Mountains', family: 'mountain', rarity: 'common', desc: 'Snow-covered peaks and glaciers high above the treeline.', t: [0.2, 0.15], h: [0.5, 0.4], alt: [40, 180], shape: 'ridges', amp: 8, ground: 'snow_rock', flora: 'snow_peak', atmosphere: 'mountain', wildlife: ['goat', 'polar_bear', 'fox'], lore: ['Snow leopards', 'Ice eagles'], structures: ['mountain_hold', 'ice_cairn', 'ruined_watchtower'], legacy: L.MOUNTAIN },
  { id: 41, key: 'alpine_meadows', name: 'Alpine Meadows', family: 'mountain', rarity: 'uncommon', tier: 1, desc: 'Flowers and grass in sheltered bowls between the mountains, with clear tarns.', t: [0.4, 0.2], h: [0.6, 0.2], alt: [26, 78], shape: 'rolling', amp: 6, ground: 'alpine', flora: 'alpine', atmosphere: 'alpine', wildlife: ['goat', 'sheep', 'rabbit', 'bee'], lore: ['Edelweiss', 'Marmots'], structures: ['mountain_hold', 'shrine', 'hunters_camp'], legacy: L.MEADOW },
  { id: 42, key: 'frozen_peaks', name: 'Frozen Peaks', family: 'mountain', rarity: 'uncommon', tier: 1, desc: 'Enormous summits sheathed in ice, scoured by blizzards.', t: [0.08, 0.12], h: [0.5, 0.5], alt: [90, 230], shape: 'ridges', amp: 10, ground: 'ice', flora: 'frozen_peak', atmosphere: 'blizzard', wildlife: ['goat', 'polar_bear'], lore: ['Frost wyrms'], structures: ['ice_cairn', 'mountain_hold'], legacy: L.MOUNTAIN },
  { id: 43, key: 'jagged_peaks', name: 'Jagged Peaks', family: 'mountain', rarity: 'uncommon', tier: 1, desc: 'Dramatic vertical stone formations that rise like broken teeth.', t: [0.45, 0.3], h: [0.35, 0.3], alt: [70, 200], shape: 'spires', amp: 22, ground: 'cliff', flora: 'jagged', atmosphere: 'mountain', wildlife: ['goat'], lore: ['Crag hawks'], structures: ['nest', 'ruined_fortress', 'mountain_hold'], legacy: L.STONY_PEAKS },
  { id: 44, key: 'crystal_mountains', name: 'Crystal Mountains', family: 'mountain', rarity: 'very_rare', tier: 3, desc: 'Peaks where translucent crystal formations break through the rock and catch the light.', t: [0.4, 0.3], h: [0.4, 0.3], alt: [50, 200], shape: 'spires', amp: 14, ground: 'crystal', flora: 'crystal', atmosphere: 'crystal', wildlife: ['goat'], lore: ['Prism eagles'], structures: ['crystal_sanctuary', 'monolith'], legacy: L.STONY_PEAKS },
  { id: 45, key: 'volcanic_mountains', name: 'Volcanic Mountains', family: 'mountain', rarity: 'rare', tier: 2, desc: 'Active and dormant volcanoes with black slopes, craters and rivers of lava.', t: [0.8, 0.2], h: [0.25, 0.25], alt: [40, 180], shape: 'crater', amp: 16, ground: 'volcanic', flora: 'volcano', atmosphere: 'volcano', wildlife: ['goat'], lore: ['Magma lizards'], structures: ['volcanic_fortress', 'ruined_fortress', 'monolith'], legacy: L.STONY_PEAKS },
  { id: 46, key: 'sky_highlands', name: 'Sky Highlands', family: 'mountain', rarity: 'rare', tier: 2, desc: 'Extremely elevated plateaus above the clouds, ringed by cliffs and swept by wind.', t: [0.45, 0.3], h: [0.5, 0.4], alt: [100, 230], shape: 'plateau', amp: 40, ground: 'sky', flora: 'sky_high', atmosphere: 'sky', wildlife: ['goat', 'llama'], lore: ['Cloud eagles'], structures: ['sky_temple', 'monolith', 'bridge'], legacy: L.MOUNTAIN },
  { id: 47, key: 'floating_mountain_region', name: 'Floating Mountain Region', family: 'mountain', rarity: 'very_rare', tier: 3, desc: 'Enormous rock formations drift in the air above a shattered mountain range.', t: [0.45, 0.3], h: [0.5, 0.4], alt: [40, 200], shape: 'spires', amp: 12, ground: 'sky', flora: 'floating', atmosphere: 'sky', wildlife: ['goat'], lore: ['Drift hawks'], structures: ['sky_temple', 'bridge', 'monolith'], legacy: L.MOUNTAIN },
  { id: 48, key: 'thunder_mountains', name: 'Thunder Mountains', family: 'mountain', rarity: 'rare', tier: 2, desc: 'Storm-prone ranges where lightning walks the ridges and the stone hums.', t: [0.45, 0.2], h: [0.6, 0.2], alt: [60, 200], shape: 'ridges', amp: 10, ground: 'mountain', flora: 'thunder', atmosphere: 'thunder', wildlife: ['goat'], lore: ['Storm eagles'], structures: ['mountain_hold', 'monolith', 'ruined_fortress'], legacy: L.MOUNTAIN },

  // ---- F. cold and polar
  { id: 49, key: 'snowy_plains', name: 'Snowy Plains', family: 'cold', rarity: 'common', desc: 'Open snow-covered land under a pale sky.', t: [0.1, 0.1], h: [0.4, 0.3], alt: [0, 30], shape: 'rolling', amp: 3, ground: 'frost', flora: 'snow_plain', atmosphere: 'snow', wildlife: ['rabbit', 'fox', 'polar_bear', 'goat'], lore: ['Snow hares', 'Ptarmigans'], structures: ['hunters_camp', 'abandoned_village', 'ice_cairn'], legacy: L.SNOW },
  { id: 50, key: 'snowy_taiga', name: 'Snowy Taiga', family: 'cold', rarity: 'common', desc: 'Evergreen forests under a thick blanket of snow.', t: [0.2, 0.1], h: [0.6, 0.2], alt: [0, 40], shape: 'rolling', amp: 5, ground: 'frost', flora: 'snow_taiga', atmosphere: 'snow', wildlife: ['wolf', 'fox', 'rabbit'], lore: ['Snow owls'], structures: ['hunters_camp', 'abandoned_village', 'ruined_watchtower'], legacy: L.SNOWY_TAIGA },
  { id: 51, key: 'frozen_forest', name: 'Frozen Forest', family: 'cold', rarity: 'uncommon', tier: 1, desc: 'Trees encased in ice, glittering and silent.', t: [0.13, 0.07], h: [0.6, 0.15], alt: [0, 40], shape: 'rolling', amp: 4, ground: 'frost', flora: 'frozen_forest', atmosphere: 'snow', wildlife: ['wolf', 'fox', 'polar_bear'], lore: ['Rime wolves'], structures: ['crypt', 'ice_cairn', 'hunters_camp'], legacy: L.SNOWY_TAIGA },
  { id: 52, key: 'ice_spikes', name: 'Ice Spikes', family: 'cold', rarity: 'uncommon', tier: 1, desc: 'Enormous naturally formed towers of ice rising from a frozen plain.', t: [0.06, 0.06], h: [0.3, 0.3], alt: [0, 30], shape: 'spires', amp: 3, ground: 'ice', flora: 'ice_spikes', atmosphere: 'snow', wildlife: ['polar_bear', 'rabbit'], lore: ['Frost sprites'], structures: ['ice_cairn', 'monolith'], legacy: L.ICE_SPIKES },
  { id: 53, key: 'glacier_fields', name: 'Glacier Fields', family: 'cold', rarity: 'uncommon', tier: 1, desc: 'Huge ice sheets split by deep blue crevasses.', t: [0.05, 0.07], h: [0.5, 0.3], alt: [5, 70], shape: 'crevasse', amp: 12, ground: 'ice', flora: 'glacier', atmosphere: 'blizzard', wildlife: ['polar_bear', 'goat'], lore: ['Ice worms'], structures: ['ice_cairn', 'dragon_skeleton'], legacy: L.ICE_SPIKES },
  { id: 54, key: 'frozen_tundra', name: 'Frozen Tundra', family: 'cold', rarity: 'common', desc: 'Frozen earth, sparse hardy vegetation and wildlife of the cold.', t: [0.22, 0.08], h: [0.3, 0.15], alt: [0, 30], shape: 'hummocks', amp: 3, ground: 'tundra', flora: 'tundra', atmosphere: 'snow', wildlife: ['rabbit', 'fox', 'goat', 'polar_bear'], lore: ['Musk oxen', 'Lemmings'], structures: ['hunters_camp', 'battlefield', 'burial_ground'], legacy: L.SNOW },
  { id: 55, key: 'arctic_coast', name: 'Arctic Coast', family: 'cold', rarity: 'common', kind: 'coast', desc: 'Frozen beaches and icy waters lapping at floes of pack ice.', t: [0.1, 0.12], h: [0.5, 0.5], alt: [-2, 4], shape: 'none', amp: 0, ground: 'shingle', flora: 'arctic', atmosphere: 'coast', wildlife: ['polar_bear', 'rabbit'], lore: ['Walrus herds'], structures: ['shipwreck', 'lighthouse', 'ice_cairn'], legacy: L.SNOWY_BEACH },
  { id: 56, key: 'polar_desert', name: 'Polar Desert', family: 'cold', rarity: 'uncommon', tier: 1, desc: 'Barren snow and stone, where nothing grows and the wind carves ridges in the drifts.', t: [0.03, 0.04], h: [0.08, 0.08], alt: [0, 40], shape: 'dunes', amp: 4, ground: 'polar', flora: 'polar', atmosphere: 'blizzard', wildlife: ['polar_bear'], lore: ['Frost hares'], structures: ['ice_cairn', 'fossil'], legacy: L.SNOW },
  { id: 57, key: 'aurora_highlands', name: 'Aurora Highlands', family: 'cold', rarity: 'rare', tier: 2, desc: 'Colourful lights ripple over cold mountains and silent lakes.', t: [0.14, 0.1], h: [0.5, 0.3], alt: [40, 110], shape: 'rolling', amp: 8, ground: 'frost', flora: 'aurora', atmosphere: 'aurora', wildlife: ['goat', 'fox', 'polar_bear'], lore: ['Aurora elk'], structures: ['monolith', 'shrine', 'ice_cairn'], legacy: L.SNOWY_TAIGA },
  { id: 58, key: 'eternal_winter', name: 'Eternal Winter', family: 'cold', rarity: 'very_rare', tier: 3, desc: 'An extremely rare region where snow has never stopped falling.', t: [0.04, 0.04], h: [0.5, 0.4], alt: [0, 50], shape: 'rolling', amp: 5, ground: 'polar', flora: 'winter', atmosphere: 'blizzard', wildlife: ['polar_bear', 'fox'], lore: ['Winter wraiths'], structures: ['ice_cairn', 'monolith', 'crypt'], legacy: L.SNOW },

  // ---- G. swamps and wetlands
  { id: 59, key: 'ordinary_swamp', name: 'Ordinary Swamp', family: 'wetland', rarity: 'common', desc: 'Muddy water, hanging trees and vegetation in a lowland full of pools.', t: [0.55, 0.14], h: [0.8, 0.1], alt: [-1, 5], shape: 'wetland', amp: 3, ground: 'swamp', flora: 'swamp', atmosphere: 'swamp', wildlife: ['frog', 'turtle'], lore: ['Marsh frogs', 'Reed bitterns'], structures: ['witch_hut', 'hunters_camp'], legacy: L.SWAMP },
  { id: 60, key: 'mangrove_swamp', name: 'Mangrove Swamp', family: 'wetland', rarity: 'uncommon', tier: 1, desc: 'Tidal water and a maze of exposed roots.', t: [0.7, 0.14], h: [0.8, 0.14], alt: [-1, 9], v: [0.85, 0.2], shape: 'wetland', amp: 2, ground: 'mangrove', flora: 'mangrove_swamp', atmosphere: 'swamp', wildlife: ['frog', 'turtle'], lore: ['Root crabs'], structures: ['fishing_village', 'hunters_camp'], legacy: L.SWAMP },
  { id: 61, key: 'dark_swamp', name: 'Dark Swamp', family: 'wetland', rarity: 'uncommon', tier: 1, desc: 'Thick fog, black water and dangerous creatures in the dripping gloom.', t: [0.5, 0.1], h: [0.9, 0.07], alt: [-1, 5], shape: 'wetland', amp: 3, ground: 'bog', flora: 'dark_swamp', atmosphere: 'fogbound', wildlife: ['frog'], lore: ['Will-o-wisps', 'Leech lords'], structures: ['witch_hut', 'crypt', 'burial_ground'], legacy: L.SWAMP },
  { id: 62, key: 'cypress_marsh', name: 'Cypress Marsh', family: 'wetland', rarity: 'uncommon', tier: 1, desc: 'Giant swamp trees draped in hanging vegetation over still water.', t: [0.6, 0.12], h: [0.85, 0.1], alt: [-1, 5], shape: 'wetland', amp: 3, ground: 'marsh', flora: 'cypress', atmosphere: 'swamp', wildlife: ['frog', 'turtle', 'parrot'], lore: ['Moss gators'], structures: ['witch_hut', 'fishing_village'], legacy: L.SWAMP },
  { id: 63, key: 'peat_bog', name: 'Peat Bog', family: 'wetland', rarity: 'uncommon', tier: 1, desc: 'Deep mud, thick moss and unusual plants over a cold dark peat.', t: [0.32, 0.1], h: [0.8, 0.12], alt: [-1, 6], shape: 'hummocks', amp: 2, ground: 'bog', flora: 'bog', atmosphere: 'mist', wildlife: ['frog', 'fox'], lore: ['Bog cranes'], structures: ['burial_ground', 'hunters_camp'], legacy: L.SWAMP },
  { id: 64, key: 'toxic_marsh', name: 'Toxic Marsh', family: 'wetland', rarity: 'rare', tier: 2, desc: 'Dangerous coloured water and poisonous vegetation rising from the fumes.', t: [0.6, 0.14], h: [0.8, 0.12], alt: [-1, 5], shape: 'wetland', amp: 3, ground: 'toxic', flora: 'toxic', atmosphere: 'toxic', wildlife: ['frog'], lore: ['Acid toads'], structures: ['witch_hut', 'abandoned_village'], legacy: L.SWAMP },
  { id: 65, key: 'misty_wetlands', name: 'Misty Wetlands', family: 'wetland', rarity: 'uncommon', tier: 1, desc: 'Thick fog and hidden islands among still pools.', t: [0.42, 0.12], h: [0.88, 0.08], alt: [-1, 5], shape: 'wetland', amp: 3, ground: 'marsh', flora: 'misty', atmosphere: 'fogbound', wildlife: ['frog', 'turtle', 'fox'], lore: ['Mist herons'], structures: ['shrine', 'hunters_camp', 'ruined_monastery'], legacy: L.SWAMP },
  { id: 66, key: 'sunken_forest', name: 'Sunken Forest', family: 'wetland', rarity: 'rare', tier: 2, desc: 'A partially submerged ancient woodland, its crowns breaking the water like islands.', t: [0.55, 0.12], h: [0.85, 0.1], alt: [-1, 4], shape: 'wetland', amp: 3, ground: 'marsh', flora: 'sunken_forest', atmosphere: 'sunken', wildlife: ['frog', 'turtle', 'axolotl'], lore: ['Drowned stags'], structures: ['sunken_ruins', 'shrine', 'ruined_monastery'], legacy: L.SWAMP },

  // ---- H. oceans and coasts (alt is the depth of the water)
  { id: 67, key: 'warm_ocean', name: 'Warm Ocean', family: 'ocean', rarity: 'common', kind: 'ocean', desc: 'Tropical shallows with colourful marine life above pale sand.', t: [0.78, 0.2], h: [0.5, 0.5], alt: [2, 36], shape: 'none', amp: 0, ground: 'sea_sand', flora: 'sea_warm', atmosphere: 'sea', wildlife: ['tropical_fish', 'dolphin', 'turtle', 'squid'], lore: ['Clownfish shoals'], structures: ['shipwreck', 'buried_treasure', 'harbor'], legacy: L.WARM_OCEAN },
  { id: 68, key: 'deep_ocean', name: 'Deep Ocean', family: 'ocean', rarity: 'common', kind: 'ocean', desc: 'Enormous underwater environments, cold, blue and empty of light below.', t: [0.5, 0.5], h: [0.5, 0.5], alt: [32, 60], shape: 'seamount', amp: 14, ground: 'sea_gravel', flora: 'sea_deep', atmosphere: 'deep', wildlife: ['squid', 'glow_squid', 'dolphin', 'cod'], lore: ['Reef sharks', 'Whale song'], structures: ['shipwreck', 'buried_treasure'], legacy: L.DEEP_OCEAN },
  { id: 69, key: 'cold_ocean', name: 'Cold Ocean', family: 'ocean', rarity: 'common', kind: 'ocean', desc: 'Cold water with its own marine ecosystems of cod and salmon.', t: [0.3, 0.14], h: [0.5, 0.5], alt: [2, 36], shape: 'none', amp: 0, ground: 'sea_gravel', flora: 'sea_cold', atmosphere: 'sea', wildlife: ['cod', 'salmon', 'squid', 'dolphin'], lore: ['Herring shoals'], structures: ['shipwreck', 'buried_treasure', 'harbor'], legacy: L.OCEAN },
  { id: 70, key: 'frozen_ocean', name: 'Frozen Ocean', family: 'ocean', rarity: 'common', kind: 'ocean', desc: 'Sheets of ice, floes and frozen islands over black water.', t: [0.08, 0.1], h: [0.5, 0.5], alt: [2, 60], shape: 'none', amp: 0, ground: 'sea_ice', flora: 'sea_frozen', atmosphere: 'snow', wildlife: ['cod', 'salmon', 'polar_bear'], lore: ['Ice seals'], structures: ['shipwreck', 'ice_cairn'], legacy: L.FROZEN_OCEAN },
  { id: 71, key: 'coral_ocean', name: 'Coral Ocean', family: 'ocean', rarity: 'uncommon', kind: 'ocean', tier: 1, desc: 'Reefs of every colour and the bright aquatic life that lives on them.', t: [0.8, 0.12], h: [0.5, 0.5], alt: [3, 22], shape: 'none', amp: 0, ground: 'sea_coral', flora: 'coral', atmosphere: 'sea', wildlife: ['tropical_fish', 'turtle', 'pufferfish', 'dolphin'], lore: ['Parrotfish', 'Anemones'], structures: ['coral_reef', 'shipwreck', 'buried_treasure'], legacy: L.WARM_OCEAN },
  { id: 72, key: 'kelp_forest', name: 'Kelp Forest', family: 'ocean', rarity: 'uncommon', kind: 'ocean', tier: 1, desc: 'Enormous swaying kelp towers reaching for the light.', t: [0.45, 0.16], h: [0.5, 0.5], alt: [8, 34], shape: 'none', amp: 0, ground: 'sea_kelp', flora: 'kelp', atmosphere: 'sea', wildlife: ['cod', 'salmon', 'squid', 'dolphin'], lore: ['Kelp otters', 'Sea dragons'], structures: ['shipwreck', 'buried_treasure'], legacy: L.OCEAN },
  { id: 73, key: 'abyssal_ocean', name: 'Abyssal Ocean', family: 'ocean', rarity: 'uncommon', kind: 'ocean', desc: 'Extremely deep trenches where no sunlight has ever reached.', t: [0.5, 0.5], h: [0.5, 0.5], alt: [56, 120], shape: 'trench', amp: 18, ground: 'abyss', flora: 'abyss', atmosphere: 'abyss', wildlife: ['glow_squid', 'squid'], lore: ['Anglers', 'Giant squid'], structures: ['sunken_ruins', 'buried_treasure'], legacy: L.DEEP_OCEAN },
  { id: 74, key: 'volcanic_ocean', name: 'Volcanic Ocean', family: 'ocean', rarity: 'rare', kind: 'ocean', tier: 2, desc: 'Black seabed of vents and lava seams, warm and clouded with minerals.', t: [0.7, 0.2], h: [0.5, 0.5], alt: [12, 60], shape: 'seamount', amp: 12, ground: 'sea_volcanic', flora: 'sea_volcanic', atmosphere: 'volcano', wildlife: ['pufferfish', 'squid'], lore: ['Vent shrimp'], structures: ['volcanic_fortress', 'sunken_ruins', 'buried_treasure'], legacy: L.DEEP_OCEAN },
  { id: 75, key: 'crystal_ocean', name: 'Crystal Ocean', family: 'ocean', rarity: 'very_rare', kind: 'ocean', tier: 3, desc: 'A rare sea where crystals grow from the seabed and light the water from below.', t: [0.5, 0.4], h: [0.5, 0.5], alt: [6, 50], shape: 'seamount', amp: 8, ground: 'sea_crystal', flora: 'sea_crystal', atmosphere: 'crystal', wildlife: ['glow_squid', 'tropical_fish'], lore: ['Glass jellies'], structures: ['crystal_sanctuary', 'sunken_ruins'], legacy: L.OCEAN },
  { id: 76, key: 'storm_coast', name: 'Storm Coast', family: 'ocean', rarity: 'uncommon', kind: 'coast', tier: 1, desc: 'Dramatic waves, black cliffs and thunderstorms rolling in off the sea.', t: [0.4, 0.2], h: [0.6, 0.3], alt: [-2, 8], shape: 'none', amp: 0, ground: 'cliff', flora: 'storm_coast', atmosphere: 'storm_coast', wildlife: ['goat', 'fox'], lore: ['Storm petrels'], structures: ['lighthouse', 'shipwreck', 'ruined_watchtower'], legacy: L.STONY_SHORE },
  { id: 77, key: 'rocky_coast', name: 'Rocky Coast', family: 'ocean', rarity: 'common', kind: 'coast', desc: 'Cliffs, sea caves and tidal pools along a rugged shore.', t: [0.45, 0.3], h: [0.4, 0.4], alt: [-2, 8], shape: 'none', amp: 0, ground: 'shingle', flora: 'rock_coast', atmosphere: 'coast', wildlife: ['goat', 'turtle', 'rabbit'], lore: ['Gulls', 'Hermit crabs'], structures: ['lighthouse', 'shipwreck', 'ruined_watchtower'], legacy: L.STONY_SHORE },
  { id: 78, key: 'sandy_coast', name: 'Sandy Coast', family: 'ocean', rarity: 'common', kind: 'coast', desc: 'Long beaches and coastal vegetation behind the dunes.', t: [0.6, 0.35], h: [0.4, 0.5], alt: [-2, 6], shape: 'none', amp: 0, ground: 'beach', flora: 'sand_coast', atmosphere: 'coast', wildlife: ['turtle', 'parrot', 'rabbit'], lore: ['Sandpipers', 'Sea turtles'], structures: ['fishing_village', 'shipwreck', 'harbor', 'buried_treasure'], legacy: L.BEACH },
  { id: 79, key: 'mangrove_coast', name: 'Mangrove Coast', family: 'ocean', rarity: 'uncommon', kind: 'coast', tier: 1, desc: 'Tidal forests standing in the surf on rafts of roots.', t: [0.72, 0.12], h: [0.75, 0.2], alt: [-2, 4], shape: 'wetland', amp: 2, ground: 'mangrove', flora: 'mangrove_coast', atmosphere: 'swamp', wildlife: ['turtle', 'frog', 'parrot'], lore: ['Fiddler crabs'], structures: ['fishing_village', 'shipwreck'], legacy: L.BEACH },
  { id: 80, key: 'sunken_archipelago', name: 'Sunken Archipelago', family: 'ocean', rarity: 'rare', kind: 'ocean', tier: 2, desc: 'Partially submerged islands and the ruins of a drowned island people.', t: [0.6, 0.3], h: [0.5, 0.5], alt: [1, 18], shape: 'archipelago', amp: 14, ground: 'sea_sand', flora: 'archipelago', atmosphere: 'sunken', wildlife: ['turtle', 'tropical_fish', 'parrot', 'dolphin'], lore: ['Tide hermits'], structures: ['sunken_ruins', 'shipwreck', 'fishing_village', 'buried_treasure'], legacy: L.WARM_OCEAN },

  // ---- I. rivers, lakes and fresh water
  { id: 81, key: 'mountain_rivers', name: 'Mountain Rivers', family: 'fresh', rarity: 'common', kind: 'river', desc: 'Cold, fast water in stony beds, tumbling between boulders.', t: [0.4, 0.4], h: [0.5, 0.5], alt: [30, 160], shape: 'none', amp: 0, ground: 'river_bed', flora: 'river', atmosphere: 'fresh', wildlife: ['salmon', 'cod', 'goat'], lore: ['Trout'], structures: ['bridge'], legacy: L.RIVER },
  { id: 82, key: 'forest_rivers', name: 'Forest Rivers', family: 'fresh', rarity: 'common', kind: 'river', desc: 'Slow clear rivers under overhanging trees.', t: [0.5, 0.2], h: [0.6, 0.4], alt: [0, 30], shape: 'none', amp: 0, ground: 'river_bed', flora: 'river', atmosphere: 'fresh', wildlife: ['salmon', 'cod', 'frog'], lore: ['Pike'], structures: ['bridge', 'fishing_village'], legacy: L.RIVER },
  { id: 83, key: 'tropical_rivers', name: 'Tropical Rivers', family: 'fresh', rarity: 'common', kind: 'river', desc: 'Warm, wide, brown-green water winding through the jungle.', t: [0.78, 0.2], h: [0.7, 0.3], alt: [0, 40], shape: 'none', amp: 0, ground: 'river_bed', flora: 'river', atmosphere: 'fresh', wildlife: ['tropical_fish', 'frog', 'turtle'], lore: ['Piranha shoals'], structures: ['bridge', 'fishing_village'], legacy: L.RIVER },
  { id: 84, key: 'frozen_rivers', name: 'Frozen Rivers', family: 'fresh', rarity: 'common', kind: 'river', desc: 'Rivers locked in ice, with black water moving beneath.', t: [0.08, 0.14], h: [0.5, 0.5], alt: [0, 60], shape: 'none', amp: 0, ground: 'river_bed', flora: 'river', atmosphere: 'snow', wildlife: ['salmon', 'rabbit'], lore: ['Ice fish'], structures: ['bridge', 'ice_cairn'], legacy: L.FROZEN_RIVER },
  { id: 85, key: 'underground_rivers', name: 'Underground Rivers', family: 'fresh', rarity: 'uncommon', kind: 'cave', desc: 'Dark water running through the deep caves, far from any sky.', t: [0.5, 0.5], h: [0.5, 0.5], alt: [0, 0], shape: 'none', amp: 0, ground: 'river_bed', flora: 'none', atmosphere: 'cave', wildlife: ['axolotl', 'glow_squid'], lore: ['Blind cave fish'], structures: [], legacy: L.PLAINS },
  { id: 86, key: 'giant_lakes', name: 'Giant Lakes', family: 'fresh', rarity: 'uncommon', kind: 'lake', tier: 1, desc: 'Inland seas of fresh water, wide enough to lose sight of the shore.', t: [0.5, 0.4], h: [0.55, 0.45], alt: [0, 60], shape: 'none', amp: 0, ground: 'sea_sand', flora: 'lake', atmosphere: 'fresh', wildlife: ['salmon', 'cod', 'turtle'], lore: ['Lake sturgeon'], structures: ['fishing_village', 'harbor', 'shipwreck', 'lighthouse'], legacy: L.RIVER },
  { id: 87, key: 'alpine_lakes', name: 'Alpine Lakes', family: 'fresh', rarity: 'uncommon', kind: 'lake', tier: 1, desc: 'Cold, glass-clear tarns cupped in the high rock.', t: [0.3, 0.3], h: [0.5, 0.5], alt: [50, 180], shape: 'none', amp: 0, ground: 'river_bed', flora: 'alpine_lake', atmosphere: 'alpine', wildlife: ['salmon', 'goat'], lore: ['Char'], structures: ['mountain_hold', 'shrine'], legacy: L.RIVER },
  { id: 88, key: 'swamp_lakes', name: 'Swamp Lakes', family: 'fresh', rarity: 'uncommon', kind: 'lake', tier: 1, desc: 'Brown, still water ringed by reeds and drowned trunks.', t: [0.55, 0.3], h: [0.8, 0.2], alt: [0, 8], shape: 'none', amp: 0, ground: 'marsh', flora: 'lake', atmosphere: 'swamp', wildlife: ['frog', 'turtle'], lore: ['Mud eels'], structures: ['witch_hut', 'fishing_village'], legacy: L.SWAMP },
  { id: 89, key: 'volcanic_lakes', name: 'Volcanic Lakes', family: 'fresh', rarity: 'rare', kind: 'lake', tier: 2, desc: 'Steaming crater lakes of hot green water and black glass shores.', t: [0.8, 0.2], h: [0.3, 0.3], alt: [20, 180], shape: 'none', amp: 0, ground: 'sea_volcanic', flora: 'lake', atmosphere: 'volcano', wildlife: [], lore: ['Fire newts'], structures: ['volcanic_fortress'], legacy: L.RIVER },
  { id: 90, key: 'crystal_lakes', name: 'Crystal Lakes', family: 'fresh', rarity: 'very_rare', kind: 'lake', tier: 3, desc: 'Mirror-still lakes whose beds glitter with crystal.', t: [0.5, 0.4], h: [0.5, 0.5], alt: [0, 160], shape: 'none', amp: 0, ground: 'sea_crystal', flora: 'lake', atmosphere: 'crystal', wildlife: ['salmon'], lore: ['Glass trout'], structures: ['crystal_sanctuary', 'shrine'], legacy: L.RIVER },
  { id: 91, key: 'waterfall_valleys', name: 'Waterfall Valleys', family: 'fresh', rarity: 'rare', tier: 2, desc: 'Steep green gorges where streams leap off cliff after cliff into misty pools.', t: [0.55, 0.3], h: [0.7, 0.2], alt: [14, 90], shape: 'terraces', amp: 8, ground: 'mossy', flora: 'waterfall', atmosphere: 'mist', wildlife: ['salmon', 'frog', 'parrot'], lore: ['Mist swifts'], structures: ['shrine', 'bridge', 'ruined_monastery'], legacy: L.JUNGLE },
  { id: 92, key: 'ancient_floodplains', name: 'Ancient Floodplains', family: 'fresh', rarity: 'uncommon', tier: 1, desc: 'Vast silt flats along great rivers, scattered with the ruins of a farming people.', t: [0.58, 0.2], h: [0.5, 0.2], alt: [-1, 8], shape: 'flat', amp: 2, ground: 'floodplain', flora: 'floodplain', atmosphere: 'clear', wildlife: ['cow', 'horse', 'frog', 'turtle'], lore: ['Silt cranes'], structures: ['abandoned_village', 'ancient_library', 'battlefield', 'burial_ground'], legacy: L.PLAINS },

  // ---- J. mushroom and fantasy biomes (tier 3: found only where the world is strange)
  { id: 93, key: 'giant_mushroom_forest', name: 'Giant Mushroom Forest', family: 'fantasy', rarity: 'very_rare', tier: 3, desc: 'Massive mushrooms towering over colourful fungal vegetation.', t: [0.55, 0.3], h: [0.7, 0.3], alt: [0, 40], v: [0.2, 0.3], shape: 'rolling', amp: 4, ground: 'mushroom', flora: 'mushroom', atmosphere: 'mushroom', wildlife: ['mooshroom'], lore: ['Fungal beetles', 'Cap dancers'], structures: ['witch_hut', 'shrine'], legacy: L.MUSHROOM_FIELDS },
  { id: 94, key: 'glowing_mushroom_caves', name: 'Glowing Mushroom Caves', family: 'fantasy', rarity: 'rare', kind: 'cave', desc: 'Bioluminescent fungi and still underground lakes in the dark below.', t: [0.5, 0.5], h: [0.5, 0.5], alt: [0, 0], shape: 'none', amp: 0, ground: 'mushroom', flora: 'none', atmosphere: 'mushroom', wildlife: ['mooshroom', 'glow_squid', 'axolotl'], lore: ['Glow beetles'], structures: [], legacy: L.MUSHROOM_FIELDS },
  { id: 95, key: 'spore_fields', name: 'Spore Fields', family: 'fantasy', rarity: 'very_rare', tier: 3, desc: 'Drifting spores, mushroom towers and fungal creatures over a purple, spongy ground.', t: [0.65, 0.3], h: [0.6, 0.3], alt: [0, 36], v: [0.5, 0.3], shape: 'hummocks', amp: 3, ground: 'mushroom', flora: 'spore', atmosphere: 'mushroom', wildlife: ['mooshroom', 'frog'], lore: ['Spore moths', 'Puffball swarms'], structures: ['witch_hut'], legacy: L.MUSHROOM_FIELDS },
  { id: 96, key: 'crystal_forest', name: 'Crystal Forest', family: 'fantasy', rarity: 'very_rare', tier: 3, desc: 'Giant mineral formations and reflective surfaces in a wood of glass.', t: [0.4, 0.3], h: [0.4, 0.3], alt: [0, 50], v: [0.8, 0.3], shape: 'spires', amp: 6, ground: 'crystal', flora: 'crystal_forest', atmosphere: 'crystal', wildlife: ['allay'], lore: ['Glass deer'], structures: ['crystal_sanctuary', 'monolith'], legacy: L.FLOWER_FOREST },
  { id: 97, key: 'luminous_forest', name: 'Luminous Forest', family: 'fantasy', rarity: 'very_rare', tier: 3, desc: 'Glowing vegetation and magical wildlife lighting a night that never quite falls.', t: [0.55, 0.3], h: [0.75, 0.3], alt: [0, 40], v: [0.35, 0.3], shape: 'rolling', amp: 4, ground: 'luminous', flora: 'luminous', atmosphere: 'fairy', wildlife: ['allay', 'bee', 'fox'], lore: ['Lantern foxes', 'Glow moths'], structures: ['shrine', 'tree_village'], legacy: L.FLOWER_FOREST },
  { id: 98, key: 'fairy_glades', name: 'Fairy Glades', family: 'fantasy', rarity: 'very_rare', tier: 3, desc: 'Magical clearings full of floating particles and rare resources.', t: [0.5, 0.3], h: [0.6, 0.3], alt: [0, 32], v: [0.65, 0.3], shape: 'rolling', amp: 3, ground: 'fairy', flora: 'fairy', atmosphere: 'fairy', wildlife: ['allay', 'rabbit', 'bee'], lore: ['Pixies', 'Moon deer'], structures: ['shrine', 'monolith'], legacy: L.MEADOW },
  { id: 99, key: 'dreaming_woods', name: 'Dreaming Woods', family: 'fantasy', rarity: 'very_rare', tier: 3, desc: 'Strange twisting trees and mysterious atmospheric effects that bend the light.', t: [0.45, 0.3], h: [0.65, 0.3], alt: [0, 40], v: [0.1, 0.3], shape: 'hummocks', amp: 4, ground: 'dream', flora: 'dream', atmosphere: 'dream', wildlife: ['allay', 'sniffer'], lore: ['Dream deer', 'Mirror owls'], structures: ['shrine', 'monolith', 'ancient_library'], legacy: L.DARK_FOREST },
  { id: 100, key: 'moonlit_gardens', name: 'Moonlit Gardens', family: 'fantasy', rarity: 'very_rare', tier: 3, desc: 'Silver foliage and rare nocturnal plants that open only after dark.', t: [0.4, 0.3], h: [0.55, 0.3], alt: [0, 36], v: [0.95, 0.3], shape: 'rolling', amp: 4, ground: 'moonlit', flora: 'moonlit', atmosphere: 'moonlit', wildlife: ['allay', 'fox', 'rabbit'], lore: ['Moon moths', 'Silver foxes'], structures: ['shrine', 'ancient_library'], legacy: L.FLOWER_FOREST },

  // ---- the ten signature realms (placed by region, see beyondRealms.ts)
  { id: 101, key: 'shattered_realm', name: 'The Shattered Realm', family: 'signature', rarity: 'legendary', kind: 'signature', desc: 'A landscape that looks broken: floating islands, rivers hanging in the air, drifting mountain fragments and ancient structures strung between floating rocks.', t: [0.5, 0.5], h: [0.5, 0.5], alt: [20, 120], shape: 'canyon', amp: 28, ground: 'sky', flora: 'shattered', atmosphere: 'shattered', wildlife: ['goat', 'allay'], lore: ['Shard hawks', 'Gravity moths'], structures: ['sky_temple', 'bridge', 'monolith', 'ruined_fortress'], legacy: L.MOUNTAIN },
  { id: 102, key: 'worldroot', name: 'The Worldroot', family: 'signature', rarity: 'legendary', kind: 'signature', desc: 'An enormous ancient forest around a colossal living tree: roots as high as hills above the ground, hollow chambers, root tunnels and a dungeon deep inside.', t: [0.5, 0.5], h: [0.5, 0.5], alt: [0, 60], shape: 'rolling', amp: 6, ground: 'worldroot', flora: 'worldroot', atmosphere: 'worldroot', wildlife: ['allay', 'fox', 'wolf', 'bee'], lore: ['Root keepers', 'Heartwood moths'], structures: ['tree_village', 'monolith', 'ancient_library'], legacy: L.DARK_FOREST },
  { id: 103, key: 'ashen_kingdom', name: 'The Ashen Kingdom', family: 'signature', rarity: 'legendary', kind: 'signature', desc: 'An enormous volcanic wasteland: blackstone mountains, rivers of lava, obsidian fields, volcanic craters and ruined fortresses under ash storms.', t: [0.5, 0.5], h: [0.5, 0.5], alt: [10, 140], shape: 'crater', amp: 24, ground: 'volcanic', flora: 'ashen', atmosphere: 'ashfall', wildlife: [], lore: ['Cinder drakes', 'Magma strider'], structures: ['volcanic_fortress', 'ruined_fortress', 'monolith', 'dragon_skeleton'], legacy: L.STONY_PEAKS },
  { id: 104, key: 'drowned_kingdom', name: 'The Drowned Kingdom', family: 'signature', rarity: 'legendary', kind: 'signature', desc: 'An ancient civilisation submerged under the sea: sunken buildings, giant statues, old roads, collapsed temples and treasure chambers guarded by dangerous creatures.', t: [0.5, 0.5], h: [0.5, 0.5], alt: [14, 50], shape: 'none', amp: 0, ground: 'drowned', flora: 'drowned', atmosphere: 'drowned', wildlife: ['squid', 'glow_squid'], lore: ['Tide wardens', 'Statue crabs'], structures: ['sunken_temple', 'sunken_ruins', 'giant_statue', 'buried_treasure'], legacy: L.DEEP_OCEAN },
  { id: 105, key: 'eternal_night', name: 'The Eternal Night', family: 'signature', rarity: 'legendary', kind: 'signature', desc: 'A forest where sunlight barely reaches the ground: enormous black trees, bioluminescent plants, permanent mist and ancient shrines.', t: [0.5, 0.5], h: [0.5, 0.5], alt: [0, 50], shape: 'rolling', amp: 6, ground: 'night', flora: 'eternal_night', atmosphere: 'eternal_night', wildlife: ['bat', 'fox'], lore: ['Night stalkers', 'Lantern moths'], structures: ['shrine', 'crypt', 'monolith', 'ruined_monastery'], legacy: L.DARK_FOREST },
  { id: 106, key: 'crystal_expanse', name: 'The Crystal Expanse', family: 'signature', rarity: 'legendary', kind: 'signature', desc: 'A gigantic landscape of crystal: mountains of it, caves of it, reflective lakes, natural bridges and rare mineral deposits.', t: [0.5, 0.5], h: [0.5, 0.5], alt: [10, 150], shape: 'spires', amp: 30, ground: 'crystal', flora: 'crystal_expanse', atmosphere: 'crystal', wildlife: ['allay'], lore: ['Prism wyrms', 'Echo bats'], structures: ['crystal_sanctuary', 'monolith', 'bridge'], legacy: L.STONY_PEAKS },
  { id: 107, key: 'sunken_earth', name: 'The Sunken Earth', family: 'signature', rarity: 'legendary', kind: 'signature', desc: 'A massive geological depression: sheer cliffs ringing a lower world, waterfalls pouring from the upper land, hidden forests and a huge subterranean ecosystem.', t: [0.5, 0.5], h: [0.5, 0.5], alt: [-30, 60], shape: 'plateau', amp: 40, ground: 'hollow', flora: 'sunken_earth', atmosphere: 'sunken', wildlife: ['sniffer', 'parrot', 'frog', 'horse'], lore: ['Lowland lords', 'Fall swifts'], structures: ['tree_village', 'ancient_library', 'abandoned_village', 'ruined_fortress'], legacy: L.JUNGLE },
  { id: 108, key: 'sky_islands', name: 'The Sky Islands', family: 'signature', rarity: 'legendary', kind: 'signature', desc: 'A scatter of floating islands at extreme elevation: floating forests, waterfalls falling into the sky, aerial creatures, sky temples and suspended bridges.', t: [0.5, 0.5], h: [0.5, 0.5], alt: [60, 220], shape: 'none', amp: 0, ground: 'sky', flora: 'sky_islands', atmosphere: 'sky', wildlife: ['parrot', 'allay', 'goat'], lore: ['Cloud whales', 'Wind sprites'], structures: ['sky_temple', 'bridge', 'monolith', 'buried_treasure'], legacy: L.MOUNTAIN },
  { id: 109, key: 'pale_wastes', name: 'The Pale Wastes', family: 'signature', rarity: 'legendary', kind: 'signature', desc: 'An enormous abandoned landscape of white stone, dead forests, fossilised giants, buried cities and wind-carved monuments guarded by ancient sentinels.', t: [0.5, 0.5], h: [0.5, 0.5], alt: [0, 70], shape: 'hoodoos', amp: 16, ground: 'pale', flora: 'pale', atmosphere: 'pale', wildlife: [], lore: ['Bone choirs', 'Marrow sentinels'], structures: ['dragon_skeleton', 'fossil', 'ruined_fortress', 'monolith', 'ancient_library'], legacy: L.DESERT },
  { id: 110, key: 'emerald_hollow', name: 'The Emerald Hollow', family: 'signature', rarity: 'legendary', kind: 'signature', desc: 'An enormous underground green ecosystem: lakes and waterfalls under a stone sky, huge glowing trees, giant mushrooms and the abandoned settlements of those who lived below.', t: [0.5, 0.5], h: [0.5, 0.5], alt: [0, 0], shape: 'none', amp: 0, ground: 'hollow', flora: 'hollow', atmosphere: 'cave', wildlife: ['sniffer', 'axolotl', 'frog', 'allay'], lore: ['Glow stags', 'Hollow kings'], structures: ['tree_village', 'ancient_library', 'abandoned_village'], legacy: L.MUSHROOM_FIELDS },
];

function build(e: Entry): BeyondBiome {
  const kind = e.kind ?? (e.id >= 101 ? 'signature' : 'land');
  return {
    id: e.id,
    key: e.key,
    name: e.name,
    family: e.family,
    rarity: e.rarity,
    kind,
    tier: e.tier ?? 0,
    desc: e.desc,
    t: e.t,
    h: e.h,
    alt: e.alt ?? [0, 30],
    v: e.v,
    shape: e.shape ?? 'none',
    amp: e.amp ?? 0,
    ground: e.ground,
    flora: e.flora,
    atmosphere: e.atmosphere,
    wildlife: e.wildlife ?? [],
    lore: e.lore ?? [],
    structures: e.structures ?? [],
    legacy: e.legacy,
  };
}

/** All 110 biomes, indexed so that `BEYOND_BIOMES[id]` is the biome with that id (index 0 is unused). */
export const BEYOND_BIOMES: readonly BeyondBiome[] = (() => {
  const out: BeyondBiome[] = new Array(ENTRIES.length + 1);
  for (const e of ENTRIES) out[e.id] = build(e);
  return out;
})();

export const BEYOND_BIOME_COUNT = ENTRIES.length;

export function beyondBiome(id: number): BeyondBiome | null {
  return id >= 1 && id <= BEYOND_BIOME_COUNT ? BEYOND_BIOMES[id] : null;
}

/** The biomes of a family, in id order. */
export function biomesOfFamily(family: BiomeFamily): BeyondBiome[] {
  return BEYOND_BIOMES.filter((b) => b && b.family === family);
}

/** Id of a biome by its key, or 0. */
export function beyondBiomeId(key: string): number {
  for (let i = 1; i <= BEYOND_BIOME_COUNT; i++) if (BEYOND_BIOMES[i].key === key) return i;
  return 0;
}

/** The id of the legacy biome (the overworld's 30) that stands in for a Beyond biome, for the systems that only know those. */
export function legacyBiomeOf(id: number): number {
  return BEYOND_BIOMES[id]?.legacy ?? Biome.PLAINS;
}

/** Ids of the ten signature realms. */
export const SIGNATURE = {
  SHATTERED_REALM: 101,
  WORLDROOT: 102,
  ASHEN_KINGDOM: 103,
  DROWNED_KINGDOM: 104,
  ETERNAL_NIGHT: 105,
  CRYSTAL_EXPANSE: 106,
  SUNKEN_EARTH: 107,
  SKY_ISLANDS: 108,
  PALE_WASTES: 109,
  EMERALD_HOLLOW: 110,
} as const;
