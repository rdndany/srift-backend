import { BEYOND_BIOMES, type BiomeRarity, type CaveEco } from '@solrift/shared';

/**
 * The captures on the page about the World Beyond (/beyond): pictures of the game itself, taken by scripts/beyondshots.mjs
 * (and scripts/beyondcodex.mjs for the Codex) in a World Beyond of seed 1 (a few of the rarest biomes are of other seeds),
 * with no interface on screen. They are in /public/beyond, as WebP.
 */

export interface Shot {
  /** The file in /public/beyond, without its extension. */
  file: string;
  title: string;
  note?: string;
  alt?: string;
  /** The biome key, for a picture of a biome (the page groups those by family). */
  key?: string;
  rarity?: BiomeRarity;
}

/** Bumped when the pictures are taken again, so that a browser does not keep the old ones. */
const VERSION = 4;

export const shotExt = (_file: string): 'webp' => 'webp';
export const shotUrl = (s: Shot): string => `/beyond/${s.file}.${shotExt(s.file)}?v=${VERSION}`;

const biomeByKey = (key: string) => BEYOND_BIOMES.find((b) => b?.key === key);

/** A picture of a biome: named and graded as the biome is. */
const biome = (key: string, note?: string): Shot => {
  const b = biomeByKey(key);
  if (!b) throw new Error(`no biome ${key}`);
  return { file: `biome-${key}`, key, title: b.name, rarity: b.rarity, note, alt: `${b.name}, in the World Beyond` };
};

const shot = (file: string, title: string, note?: string): Shot => ({ file, title, note, alt: `${title}, in the World Beyond` });

/** Every biome we have a picture of, by family on the page (the order here is the order there). */
const BIOME_KEYS = [
  // plains
  'green_plains', 'golden_grasslands', 'flower_fields', 'ancient_grasslands',
  // forests
  'cherry_blossom_forest', 'ancient_forest', 'enchanted_forest', 'dead_forest', 'petrified_forest', 'autumn_forest', 'bamboo_forest',
  // tropics
  'tropical_jungle', 'orchid_jungle',
  // deserts
  'badlands', 'glass_desert', 'red_desert', 'bone_desert',
  // mountains
  'jagged_peaks', 'crystal_mountains', 'volcanic_mountains',
  // cold
  'ice_spikes', 'glacier_fields', 'frozen_forest', 'aurora_highlands', 'snowy_taiga',
  // wetlands
  'toxic_marsh', 'sunken_forest', 'ordinary_swamp',
  // oceans
  'sunken_archipelago', 'kelp_forest',
  // fresh water
  'giant_lakes', 'waterfall_valleys', 'crystal_lakes',
  // fantasy
  'giant_mushroom_forest', 'luminous_forest', 'spore_fields', 'fairy_glades', 'dreaming_woods', 'moonlit_gardens', 'crystal_forest',
] as const;

const NOTES: Record<string, string> = {
  cherry_blossom_forest: 'Pink canopies, and petals always on the wind.',
  badlands: 'Banded red rock, with mesas and hollows.',
  ice_spikes: 'Towers of ice rising from a frozen plain.',
  glass_desert: 'Sand fused to glass, with black rock breaking through.',
  giant_mushroom_forest: 'Mushrooms taller than trees, and a purple haze.',
  crystal_forest: 'A wood of glass in every colour.',
  sunken_archipelago: 'Drowned hills, and islands where their tops break the sea.',
  petrified_forest: 'A wood turned to white stone.',
  dead_forest: 'Bare trunks over dry earth.',
  aurora_highlands: 'Cold mountains under a sky that ripples with light.',
  luminous_forest: 'Glowing leaves under a night that never quite falls.',
  waterfall_valleys: 'Steep green gorges and falling water.',
  toxic_marsh: 'Poisonous water and the plants that grow from the fumes.',
};

const withNote = (key: string): Shot => biome(key, NOTES[key]);

export const SHOTS = {
  /** The slides at the top of the page. */
  hero: [
    shot('realm-shattered_realm-4', 'The Shattered Realm', 'Drifting islands over a broken land.'),
    withNote('cherry_blossom_forest'),
    shot('realm-crystal_expanse-4', 'The Crystal Expanse', 'Spires of stone and crystal as far as you can see.'),
    shot('place-sky_temple', 'A Sky Temple', 'Marble steps, and islands overhead.'),
    shot('air-night-luminous', 'Night in the Luminous Forest', 'Glowing canopies under a violet sky.'),
  ],
  /** Beside the first words. */
  about: shot('biome-ancient_grasslands', 'Ancient Grasslands', 'Hills, a lake and a far shore. Walk in any direction and it goes on.'),
  /** Every biome that has a picture. */
  biomes: BIOME_KEYS.map(withNote),
  /** The ones shown in the wall of pictures. */
  featured: ['cherry_blossom_forest', 'badlands', 'ice_spikes', 'giant_mushroom_forest', 'crystal_forest', 'sunken_archipelago', 'petrified_forest', 'enchanted_forest', 'golden_grasslands', 'giant_lakes', 'frozen_forest', 'toxic_marsh'].map(withNote),
  /** Two for each realm, by the realm's key. */
  realms: {
    shattered_realm: [shot('realm-shattered_realm-4', 'The Shattered Realm'), shot('realm-shattered_realm-5', 'The Shattered Realm', 'A tower of black stone, and islands that drift.')],
    worldroot: [shot('realm-worldroot-4', 'The Worldroot', 'The Great Tree, one hundred and fifty blocks of trunk under a canopy of its own.'), shot('realm-worldroot-0', 'The Worldroot')],
    ashen_kingdom: [shot('realm-ashen_kingdom-5', 'The Ashen Kingdom'), shot('realm-ashen_kingdom-3', 'The Ashen Kingdom')],
    drowned_kingdom: [shot('extra-sunken-a', 'The Drowned Kingdom', 'A temple stair, under the sea.'), shot('extra-sunken-b', 'The Drowned Kingdom')],
    eternal_night: [shot('realm-eternal_night-2', 'The Eternal Night'), shot('realm-eternal_night-3', 'The Eternal Night')],
    crystal_expanse: [shot('realm-crystal_expanse-4', 'The Crystal Expanse'), shot('realm-crystal_expanse-1', 'The Crystal Expanse')],
    sunken_earth: [shot('realm-sunken_earth-3', 'The Sunken Earth'), shot('realm-sunken_earth-0', 'The Sunken Earth')],
    sky_islands: [shot('realm-sky_islands-5', 'The Sky Islands'), shot('realm-sky_islands-4', 'The Sky Islands')],
    pale_wastes: [shot('realm-pale_wastes-3', 'The Pale Wastes'), shot('realm-pale_wastes-6', 'The Pale Wastes')],
    emerald_hollow: [shot('realm-emerald_hollow-4', 'The Emerald Hollow'), shot('realm-emerald_hollow-6', 'The Emerald Hollow')],
  } as Record<string, Shot[]>,
  /** Ancient places. */
  places: [
    shot('place-desert_temple', 'Desert Temple', 'A stepped pyramid of sandstone.'),
    shot('place-jungle_temple', 'Jungle Temple', 'Moss over a stair that climbs out of the trees.'),
    shot('place-lighthouse', 'Lighthouse', 'A red and white tower on a river mouth.'),
    shot('place-monolith', 'Monolith', 'A lone obelisk on a frozen lake.'),
    shot('place-mountain_hold', 'Mountain Hold', 'Walls and towers set on a hillside.'),
    shot('place-ruined_fortress', 'Ruined Fortress', 'Mossy battlements over a white plain.'),
    shot('place-ruined_monastery', 'Ruined Monastery', 'Cloisters open to the sky, above a quiet bay.'),
    shot('place-sky_temple', 'Sky Temple', 'A stepped hall under floating rock.'),
    shot('place-volcanic_fortress', 'Volcanic Fortress', 'Black towers over a moat of lava.'),
    shot('place-fishing_village', 'Fishing Village', 'Houses by a calm sea.'),
    shot('place-harbor', 'Harbour', 'Piers and boats on a quiet shore.'),
    shot('place-witch_hut', "Witch's Hut", 'A hut with something strange in the pot.'),
  ],
  /** The caverns, by kind. */
  caves: {
    glow: shot('cave-glow', 'Glowing Mushroom Cavern'),
    crystal: shot('cave-crystal-2', 'Crystal Cavern'),
    ancient: shot('cave-ancient', 'Ancient Hall'),
    bone: shot('cave-bone-0', 'Bone Beds'),
    flooded: shot('cave-flooded-1', 'Flooded Cavern'),
  } as Record<CaveEco, Shot>,
  /** Weather and the hours of the day. */
  air: [
    shot('air-thunder', 'Thunderstorm', 'A storm coast, with rain and lightning rolling in off the sea.'),
    shot('air-snowfall', 'Snowfall', 'A snowy taiga, with the snow still coming down.'),
    shot('air-blizzard', 'Blizzard', 'Frozen peaks, with a white-out and a wind that never rests.'),
    shot('air-dusk-swamp', 'Dusk in the swamp', 'Fog, and a sky going orange and violet.'),
    shot('air-night-luminous', 'Night in the Luminous Forest', 'Its leaves glow under a violet sky.'),
    shot('air-aurora', 'Aurora Highlands', 'Cold mountains under a night sky.'),
  ],
  /** The Codex, open on the biomes. */
  codex: shot('codex-biomes', 'The Codex', 'Press B. What you have found is written in, and the rest is waiting.'),
};
