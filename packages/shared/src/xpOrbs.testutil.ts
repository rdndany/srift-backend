import type { Player } from './player';

/** Let the world run for a few seconds so the experience orbs that came out of something reach the player (tests only). */
export function settleOrbs(s: Player, seconds = 3): void {
  for (let i = 0; i < seconds * 20; i++) s.realm.update(0.05, s.realm.players);
}
