import type { HomeMode } from './modes';

/** Screenshots of the game itself (see scripts/shots.mjs), served from /public/shots. */
export const SHOT = {
  dusk: '/shots/village-dusk.webp?v=4',
  night: '/shots/village-night.webp?v=4',
  isle: '/shots/isle.webp?v=4',
  snow: '/shots/snow-village.webp?v=4',
  snowNoon: '/shots/snow-noon.webp?v=4',
  party: '/shots/party.webp?v=4',
  mobs: '/shots/mobs.webp?v=4',
  aerial: '/shots/village-aerial.webp?v=4',
  green: '/shots/green-village.webp?v=4',
  /** The Adventure interface (see scripts/uishots.mjs). */
  hud: '/shots/adv-hud.webp?v=4',
  quests: '/shots/adv-quests.webp?v=4',
  spellbook: '/shots/adv-spellbook.webp?v=4',
  recipes: '/shots/adv-recipes.webp?v=4',
  /** A Raging Rift at night: the beam, and the first wave under it. */
  rift: '/shots/rift.webp?v=4',
  /** The Gilded Tide: a gilt colossus, with a drake, a hound and an imp. */
  gilded: '/shots/gilded.webp?v=4',
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
