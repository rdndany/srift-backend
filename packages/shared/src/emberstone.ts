/**
 * The Emberstone, as in World of Warcraft: every new character carries one. Hold the right mouse button on it and stand
 * still for a few seconds, and it takes you to your bed (or to the village when you have none). It then needs a long
 * rest before it can be used again. Pure numbers, so the server, the tooltip and the tests agree.
 */

/** Seconds the stone takes to cast: holding still (not moving, not hurt, button held) the whole time. */
export const EMBER_CAST = 5;
/** Seconds before it can be used again. */
export const EMBER_COOLDOWN = 300;
/** How far (in blocks) a player may be moved while casting before the cast is lost. */
export const EMBER_MOVE_LIMIT = 0.6;

/** "4:32", "0:09": a time left, for the cooldown messages and the tooltip. */
export function formatEmberTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
