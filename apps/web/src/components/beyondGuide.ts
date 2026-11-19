import {
  BEYOND_ACHIEVEMENTS,
  BEYOND_BIOMES,
  BEYOND_BIOME_COUNT,
  BIOME_RARITY_NAMES,
  BIOME_RARITY_ORDER,
  CAVE_ECO_NAMES,
  FAMILY_NAMES,
  SIGNATURE,
  STRUCTURES,
  biomesOfFamily,
  caveDiscovery,
  structureDiscovery,
  type BeyondBiome,
  type BiomeFamily,
  type BiomeRarity,
  type CaveEco,
  type StructureInfo,
  type StructureKey,
} from '@solrift/shared';

/**
 * What the page about The World Beyond says. The numbers and the lists come from the game's own data (the catalogue of
 * biomes, the places, the achievements), so the page cannot drift from the game; only the words around them are written here.
 */

export const RARITY_LABEL = BIOME_RARITY_NAMES;
export const RARITIES = BIOME_RARITY_ORDER;

/** The families in the order the Codex lists them, signature realms last (they have a section of their own). */
export const FAMILIES: readonly BiomeFamily[] = (Object.keys(FAMILY_NAMES) as BiomeFamily[]).filter((f) => f !== 'signature');

export const familyName = (f: BiomeFamily): string => FAMILY_NAMES[f];

export const biomesIn = (f: BiomeFamily): BeyondBiome[] => biomesOfFamily(f);

/** The ten signature realms, in id order. */
export const REALMS: readonly BeyondBiome[] = Object.values(SIGNATURE).map((id) => BEYOND_BIOMES[id]);

/** The kinds of ancient place, rarest last. */
export const PLACES: readonly StructureInfo[] = (Object.values(STRUCTURES) as StructureInfo[]).sort(
  (a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity) || a.name.localeCompare(b.name),
);

/** What a place is, in a line (the Codex page's own words). */
export const placeText = (key: StructureKey): string => structureDiscovery(key).desc.replace(/^[^:]+: /, '');

export const CAVES: readonly CaveEco[] = ['glow', 'crystal', 'ancient', 'bone', 'flooded'];
export const caveName = (c: CaveEco): string => CAVE_ECO_NAMES[c];
export const caveText = (c: CaveEco): string => caveDiscovery(c)?.desc ?? '';

export const DEEDS = BEYOND_ACHIEVEMENTS;

/** How many biomes of each rarity there are (the signature realms are all legendary). */
export const rarityCounts = (): Record<BiomeRarity, number> => {
  const out = { common: 0, uncommon: 0, rare: 0, very_rare: 0, legendary: 0 } as Record<BiomeRarity, number>;
  for (let i = 1; i <= BEYOND_BIOME_COUNT; i++) out[BEYOND_BIOMES[i].rarity]++;
  return out;
};

export const COUNTS = {
  biomes: BEYOND_BIOME_COUNT,
  families: Object.keys(FAMILY_NAMES).length,
  realms: REALMS.length,
  places: PLACES.length,
  caverns: CAVES.length,
  deeds: BEYOND_ACHIEVEMENTS.length,
};

/** The page's own prose. */
export const COPY = {
  lead: 'A second world inside SolRift: an endless planet with one hundred and ten biomes, ten realms found nowhere else, a layered underground, ancient places to loot and weather that is always on its way. Nothing is painted by hand. Every mountain, river and ruin is worked out from the seed, so the same seed is the same world for everyone.',
  intro: [
    'The overworld is a place to settle. The World Beyond is a place to wander. Its land is shaped by a climate: the air gets colder as the ground rises, and rain falls on one side of a range and not on the other. A desert is where the rain does not reach. A jungle is where it does. Snow lies only where it is cold enough.',
    'Because of that, the world is believable at every scale. Walk far enough in one direction and the grass turns to steppe, the steppe to dunes, the dunes to bone-white wastes. Follow a river and it reaches the sea. Climb a mountain and the air thins, the trees give out and the snow begins.',
    'It is the same game underneath: the same blocks, the same tools, the same classes, the same mobs and the same servers. You choose the world when you start, and a World Beyond save never touches one of the overworld.',
  ],
  rules: [
    ['Made from the seed', 'Every biome, river and ruin is a pure function of the seed and the place. Share a seed and you share a world.'],
    ['Generated as you go', 'Nothing is made ahead. The land you walk toward appears as you reach it, so the world has no edge and no loading of a whole map.'],
    ['Nothing hangs in the air', 'Trees, spires and ruins are checked for support. The only things that float are the islands that are meant to.'],
    ['Saved apart', 'A World Beyond save is kept separately from an overworld with the same seed. Neither can overwrite the other.'],
  ] as const,
  rarity: [
    ['Common', 'Anywhere its climate fits. You will cross these without trying.'],
    ['Uncommon', 'Only inside patches of luck, where the world is a little different from the land around it.'],
    ['Rare', 'Rarer patches still. Worth a long walk to see.'],
    ['Very rare', 'Found only where the world is strange: crystal woods, glowing forests, spore fields.'],
    ['Legendary', 'The ten signature realms. Each is a region of its own, hundreds of blocks across.'],
  ] as const,
  families: {
    plains: 'Open country: meadows, steppe, golden grass and old green hills. The easy start, and the place the standing stones and the old villages hide.',
    forest: 'From plain oak woods to redwoods with canopies a hundred blocks up, and the enchanted, petrified and dead woods that are not like any other.',
    tropical: 'Warm, wet and loud: jungles, rainforests, orchid groves and a lost jungle with a temple somewhere in it.',
    desert: 'Dry land of every colour: sand, red rock, salt, glass and bone, with oases and temples if you can find them.',
    mountain: 'Ridges, spires and plateaus up to the clouds, volcanoes with lava on their slopes, and stone that hums with thunder.',
    cold: 'Snow plains, ice spikes, glaciers split by crevasses, and a winter in which it has never stopped snowing.',
    wetland: 'Swamps, bogs, marshes and sunken forests. Fog, black water, fireflies and things that live in them.',
    ocean: 'Warm shallows with reefs, kelp forests, trenches where no light reaches, volcanic seas and storm coasts.',
    fresh: 'Rivers that carry cold water out of the mountains, lakes you cannot see across, and waterfalls that leap from cliff to cliff.',
    fantasy: 'The strange ones: giant mushroom forests, woods of glass, glades full of floating light and gardens that open only after dark.',
  } as Record<string, string>,
  realms: {
    shattered_realm: 'Islands, hanging rivers and ancient structures strung between drifting rocks. The ground has been broken, and the pieces are still moving.',
    worldroot: 'One colossal living tree, with roots as high as hills, hollow chambers and a dungeon in its heart.',
    ashen_kingdom: 'Blackstone mountains, rivers of lava and ruined fortresses, under a sky that is always ash.',
    drowned_kingdom: 'A whole civilisation under the sea: roads, statues, collapsed temples and treasure chambers, guarded.',
    eternal_night: 'A forest the sun never reaches. Black trees, glowing plants, mist and shrines.',
    crystal_expanse: 'Mountains and caves of crystal, mirror-still lakes and natural bridges, and the rarest minerals in the world.',
    sunken_earth: 'A vast depression with sheer cliffs around a lower world, waterfalls pouring off the rim and a forest hidden at the bottom.',
    sky_islands: 'Floating forests, waterfalls that fall into the sky, sky temples and bridges hung between the islands.',
    pale_wastes: 'White stone, dead forests, fossilised giants and buried cities, watched by ancient sentinels.',
    emerald_hollow: 'A green world under a stone sky: lakes, waterfalls, giant glowing trees and the settlements of those who lived below.',
  } as Record<string, string>,
  layers: [
    ['Upper caves', 'Just under the surface', 'Ordinary stone with roots and moss. Now and then a chamber of a rarer kind.'],
    ['Deep caves', 'The big halls', 'Where the ecosystems below are common: glowing mushrooms, crystal, the ruins of an older people, bone beds and flooded halls.'],
    ['The deepest rock', 'Far below', 'Crystal ore, basalt and lava, and minerals found nowhere else.'],
  ] as const,
  rock: 'The rock itself changes with the country above. Limestone lies under coasts and jungles, slate under mountains, basalt under volcanoes, salt under deserts and frozen ground under the cold.',
  ores: [
    ['Malachite', 'Under tropics and plains'],
    ['Azurite', 'Under mountains and ice'],
    ['Cinnabar', 'Under deserts and the realms'],
    ['Sulfur', 'Under wetlands and the realms'],
    ['Jade', 'Under jungles and forests'],
    ['Crystal ore', 'Deep, under mountains and the fantasy lands'],
  ] as const,
  air: [
    ['Every biome has its own air', 'Fog thickens in a bog and clears on a peak. The sky turns green over a toxic marsh and amber over a volcano. A forest dims the day. An eternal night leaves less than a fifth of it.'],
    ['Weather that belongs to the place', 'It never rains in a desert. It snows on a mountain. A storm coast always has thunder on the way, and a plain might have a shower or none.'],
    ['Storms with names', 'Sandstorms in the dunes, ash storms on the volcanoes, blizzards on the ice and thunder in the high ranges. Each one comes with its own sound.'],
    ['Things in the air', 'Pollen over the meadows, petals in the cherry woods, fireflies in the swamp, spores, embers, crystal motes, falling ash, drifting leaves.'],
  ] as const,
  codex: 'Press B anywhere in the World Beyond to open the Codex. It fills as you travel: every biome you set foot in, every ancient place you come close to, every kind of cavern you find. A note slides in when something is new. The Codex is only a record. It grants nothing, and it is yours alone.',
  start: [
    ['Pick the world', 'On the Play page, under Which world, choose The World Beyond. It is saved apart from the overworld.'],
    ['Choose a seed', 'Leave it random, or type any number. The same seed is the same world for everyone who uses it.'],
    ['Walk', 'Set off. Press B for the Codex. Your first biome is found at once, and the first deed with it.'],
  ] as const,
};
