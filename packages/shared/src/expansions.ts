/**
 * Expansions: SolRift grows in released chapters, the way an MMO does. The first chapter is the core game; each
 * later one is a named expansion with its own theme, zones, bosses, instances and dungeons.
 *
 * This file is the single list of them. The title screen, the docs and (later) the server read it, so adding an
 * expansion starts here (see docs/EXPANSIONS.md). Only expansions with status `live` are playable (the core game and the first expansion, Embers of the Hollow King,
 * are); everything else is a plan, and the UI says so rather than promising it.
 */

export type ExpansionStatus = 'live' | 'in-development' | 'announced';

/** What kind of content an expansion adds. */
export type ContentKind = 'boss' | 'instance' | 'dungeon' | 'raid' | 'zone' | 'feature';

export interface ExpansionContent {
  kind: ContentKind;
  name: string;
  blurb: string;
  /** Whether this piece can be played now (never true for an expansion that is not live). */
  playable: boolean;
}

export interface Expansion {
  /** Stable id, used in saves and URLs: lowercase letters and dashes. */
  id: string;
  /** 0 for the core game, then 1, 2, ... in release order. */
  order: number;
  /** The game's name, always "SolRift". */
  title: string;
  /** The expansion's own name ("Embers of the Hollow King"); null for the core game. */
  subtitle: string | null;
  /** One line under the logo. */
  tagline: string;
  blurb: string;
  status: ExpansionStatus;
  /** A colour for its card and banner. */
  accent: string;
  content: ExpansionContent[];
}

export const GAME_TITLE = 'SolRift';

export const EXPANSIONS: readonly Expansion[] = [
  {
    id: 'core',
    order: 0,
    title: GAME_TITLE,
    subtitle: null,
    tagline: 'Mine. Build. Survive. Together.',
    blurb: 'The open world: caves, villages, dungeons and mineshafts, crafting and enchanting, hostile mobs, and shared servers.',
    status: 'live',
    accent: '#e2a22b',
    content: [
      { kind: 'zone', name: 'The overworld', blurb: 'Biomes, rivers, caves, lava and villages.', playable: true },
      { kind: 'dungeon', name: 'Dungeons and mineshafts', blurb: 'Spawner rooms and abandoned tunnels with loot chests.', playable: true },
      { kind: 'feature', name: 'Multiplayer realm', blurb: 'One shared online world, the village of Dawnwatch with its quests and dungeon, for up to 120 players.', playable: true },
      { kind: 'feature', name: 'Quests and Auren', blurb: 'A quest log and tracker, nine people to talk to, merchants and a currency of your own.', playable: true },
      { kind: 'feature', name: 'Classes and abilities', blurb: 'Warrior, Mage or Ranger, each with a resource bar and four abilities learned as you level.', playable: true },
      { kind: 'feature', name: 'Gear and off-hand', blurb: 'Armor slots, a shield, orb or dagger in the off hand, bows and crossbows, and a character sheet with your stats.', playable: true },
      { kind: 'feature', name: 'Recipe book', blurb: 'Every recipe you know in one searchable book, with what is missing for each.', playable: true },
      { kind: 'feature', name: 'Party and world map', blurb: 'Parties of up to four with health frames and a map you can hold.', playable: true },
    ],
  },
  {
    id: 'hollow-king',
    order: 1,
    title: GAME_TITLE,
    subtitle: 'Embers of the Hollow King',
    tagline: 'Something stirs beneath the deepest stone.',
    blurb: 'An ancient king has woken under the world. Descend into the Cinderdeep, the first true instances, and end his reign.',
    status: 'live',
    accent: '#ff7a2e',
    content: [
      { kind: 'zone', name: 'Dawnwatch and the Adventure mode', blurb: 'A village of quest givers where every adventurer starts.', playable: true },
      { kind: 'dungeon', name: 'The Hollow Cellar', blurb: 'The first dungeon, behind the portal in the village chapel: a separate map made fresh for every player (level 5 and up): three cages that each let their pack out once, and at the end the Hollow King, a scripted boss with phases, telegraphed spells, a court of helpers and his own health bar.', playable: true },
      { kind: 'dungeon', name: 'The Cinderdeep', blurb: 'A party instance of burning halls and collapsing bridges.', playable: true },
      { kind: 'dungeon', name: 'Gloomhold Catacombs', blurb: 'Crypts guarded by the king\u2019s hollow knights.', playable: true },
      { kind: 'boss', name: 'Ashmaw, the Cinder Warden', blurb: 'Guards the gate of the Cinderdeep.', playable: true },
      { kind: 'boss', name: 'The Hollow King', blurb: 'The final boss of the expansion.', playable: true },
      { kind: 'feature', name: 'Party finder and instance lockouts', blurb: 'Group up and run instances on your own copy of the dungeon.', playable: true },
      { kind: 'feature', name: 'The Gilded Tide', blurb: 'On the hour and at half past, golden creatures hide all over the land: shy imps, hounds, drakes and a rare colossus, never in packs and never near you. Find them for the Codex of Aurelion, which opens into one piece of Epic gear.', playable: true },
      { kind: 'feature', name: 'Rifts', blurb: 'A tear opens in the world with a beam of light over it: beat its waves and its warden, and everyone who helped is paid. A rift that is left alone collapses.', playable: true },
      { kind: 'feature', name: 'Wings and free flight', blurb: 'Craft six kinds of wings in two tiers. Worn, they hit harder, soften blows and quicken your step, and a double tap of Space takes you into the air. They unfold, beat, bank in turns and fold again, each in the manner of your class.', playable: true },
      { kind: 'feature', name: 'Achievements', blurb: 'Tiered achievements for dungeons, bosses and more, counted by the server and kept with your wallet. A new character cannot win them again.', playable: true },
    ],
  },
  {
    id: 'drowned-throne',
    order: 2,
    title: GAME_TITLE,
    subtitle: 'Tides of the Drowned Throne',
    tagline: 'The sea remembers what the land forgot.',
    blurb: 'The oceans rise over a sunken kingdom. New water zones, underwater instances and the first raid.',
    status: 'announced',
    accent: '#2fb8d6',
    content: [
      { kind: 'zone', name: 'The Sunken Reach', blurb: 'Ruins and kelp forests below the waves.', playable: false },
      { kind: 'dungeon', name: 'Marrowtide Caverns', blurb: 'A flooded cave instance.', playable: false },
      { kind: 'raid', name: 'The Drowned Throne', blurb: 'A raid for a full group.', playable: false },
      { kind: 'boss', name: 'Thalassa, the Drowned Queen', blurb: 'Ruler of the sunken court.', playable: false },
    ],
  },
  {
    id: 'sky-titans',
    order: 3,
    title: GAME_TITLE,
    subtitle: 'Crown of the Sky Titans',
    tagline: 'Above the clouds, the titans wait.',
    blurb: 'Floating isles, storm fortresses and the biggest bosses yet.',
    status: 'announced',
    accent: '#a98bff',
    content: [
      { kind: 'zone', name: 'The Shattered Isles', blurb: 'Drifting islands joined by wind bridges.', playable: false },
      { kind: 'raid', name: 'Citadel of Storms', blurb: 'A raid on a fortress in the clouds.', playable: false },
      { kind: 'boss', name: 'Voltarix, the Storm Titan', blurb: 'Its lightning shapes the weather.', playable: false },
    ],
  },
];

const BY_ID = new Map(EXPANSIONS.map((e) => [e.id, e]));

export function expansionById(id: string): Expansion | undefined {
  return BY_ID.get(id);
}

/** The full name: "SolRift" or "SolRift: Embers of the Hollow King". */
export function expansionTitle(e: Expansion): string {
  return e.subtitle ? `${e.title}: ${e.subtitle}` : e.title;
}

/** The expansions a player can play today, oldest first. */
export function liveExpansions(): Expansion[] {
  return EXPANSIONS.filter((e) => e.status === 'live');
}

/** The newest expansion a player can play today (null if only the core game is live). */
export function latestExpansion(): Expansion | undefined {
  return liveExpansions()
    .filter((e) => e.order > 0)
    .pop();
}

/** The game's version as shown on the home page. Keep in step with the package.json versions when releasing. */
export const GAME_VERSION = '0.1.0';

/** The next expansion to arrive: the first one that is being built, else the first announced. */
export function nextExpansion(): Expansion | undefined {
  return EXPANSIONS.find((e) => e.status === 'in-development') ?? EXPANSIONS.find((e) => e.status === 'announced');
}

export const STATUS_LABEL: Record<ExpansionStatus, string> = {
  live: 'Live now',
  'in-development': 'In development',
  announced: 'Announced',
};

export const CONTENT_LABEL: Record<ContentKind, string> = {
  boss: 'Boss',
  instance: 'Instance',
  dungeon: 'Dungeon',
  raid: 'Raid',
  zone: 'Zone',
  feature: 'Feature',
};
