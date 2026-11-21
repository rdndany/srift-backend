import type { BossState } from './boss';

/** How far a player is in the dungeon they stand in: what its tracker (under the quests, top right) shows. */
export interface DungeonView {
  name: string;
  /** Cages destroyed, and how many there are. */
  cages: number;
  cagesTotal: number;
  /** Iron gates opened, and how many there are. */
  gates: number;
  gatesTotal: number;
  /** The boss: asleep on his throne, in the fight, or fallen (and the way out open). */
  boss: BossState | 'none';
}
