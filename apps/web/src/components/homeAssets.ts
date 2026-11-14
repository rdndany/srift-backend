import type { HomeMode } from './modes';

/** Screenshots of the game itself (see scripts/shots.mjs), served from /public/shots. */
export const SHOT = {
  dusk: '/shots/village-dusk.jpg',
  night: '/shots/village-night.jpg',
  isle: '/shots/isle.jpg',
  snow: '/shots/snow-village.jpg',
  snowNoon: '/shots/snow-noon.jpg',
  party: '/shots/party.jpg',
  mobs: '/shots/mobs.jpg',
  aerial: '/shots/village-aerial.jpg',
  green: '/shots/green-village.jpg',
  /** The Adventure interface (see scripts/uishots.mjs). */
  hud: '/shots/adv-hud.jpg',
  inventory: '/shots/adv-inventory.jpg',
  quests: '/shots/adv-quests.jpg',
  spellbook: '/shots/adv-spellbook.jpg',
  recipes: '/shots/adv-recipes.jpg',
} as const;

/** The picture on each game mode's card. */
export const MODE_SHOT: Record<HomeMode, string> = {
  survival: SHOT.mobs,
  creative: SHOT.snow,
  hardcore: SHOT.night,
};

/** The picture on each expansion's card (by expansion id). */
export const EXPANSION_SHOT: Record<string, string> = {
  core: SHOT.dusk,
  'hollow-king': SHOT.night,
  'drowned-throne': SHOT.isle,
  'sky-titans': SHOT.aerial,
};

/** The slides behind the landing page, in order. */
export const HERO_SLIDES: readonly string[] = [SHOT.dusk, SHOT.isle, SHOT.snowNoon, SHOT.night, SHOT.green];
