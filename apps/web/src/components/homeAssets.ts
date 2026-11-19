import type { HomeMode } from './modes';

/** Screenshots of the game itself (see scripts/shots.mjs), served from /public/shots. */
export const SHOT = {
  dusk: '/shots/village-dusk.jpg?v=2',
  night: '/shots/village-night.jpg?v=2',
  isle: '/shots/isle.jpg',
  snow: '/shots/snow-village.jpg',
  snowNoon: '/shots/snow-noon.jpg',
  party: '/shots/party.jpg?v=2',
  mobs: '/shots/mobs.jpg',
  aerial: '/shots/village-aerial.jpg?v=2',
  green: '/shots/green-village.jpg',
  /** The Adventure interface (see scripts/uishots.mjs). */
  hud: '/shots/adv-hud.jpg?v=2',
  inventory: '/shots/adv-inventory.jpg',
  quests: '/shots/adv-quests.jpg?v=2',
  spellbook: '/shots/adv-spellbook.jpg?v=2',
  recipes: '/shots/adv-recipes.jpg?v=2',
} as const;

/** The picture on each game mode's card. */
export const MODE_SHOT: Record<HomeMode, string> = {
  survival: SHOT.mobs,
  creative: SHOT.snow,
  hardcore: SHOT.night,
};

/** Painted key art for the front page. The colossus is the Hollow King, boss of that expansion. */
export const ART = {
  party: '/art/party.jpg',
  /** The front page's full-screen key art (solrift-hero-bg.png, re-saved as a q92 JPEG to load faster). */
  hero: '/art/solrift-hero-bg.jpg?v=2',
  /** The character select screen (/game): a moonlit castle over the voxel hills (solrfit-character-select.png, as a q90 JPEG). */
  characterSelect: '/art/character-select.jpg',
  hollowKing: '/art/hollow-king.jpg',
  hollowKingFight: '/art/hollow-king-fight.jpg',
} as const;

/** The picture on each expansion's card (by expansion id). */
export const EXPANSION_SHOT: Record<string, string> = {
  core: SHOT.dusk,
  'hollow-king': ART.hollowKing,
  'drowned-throne': SHOT.isle,
  'sky-titans': SHOT.aerial,
};

/** The slides behind the landing page, in order. */
export const HERO_SLIDES: readonly string[] = [SHOT.dusk, SHOT.isle, SHOT.snowNoon, SHOT.night, SHOT.green];
