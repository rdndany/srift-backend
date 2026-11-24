import { I } from './items';
import { MOBS, type MobKind } from './mobs';

/**
 * The things only a quest makes monsters carry. A drop is rolled for a player only while that player has the quest active, on top of the
 * monster's ordinary loot, and never for a player who already carries what the quest asks for. A drop with a `pity` is guaranteed after
 * that many kills of the right kind without one, so a long hunt cannot go on for ever.
 */
export interface QuestDrop {
  /** The quest that has to be active. */
  quest: string;
  /** What falls. */
  item: number;
  /** The monsters that may carry it; `'hostile'` is any hostile monster. */
  mobs: readonly MobKind[] | 'hostile';
  /** Only where the player stands in this zone (see ZONES). */
  zone?: string;
  /** The chance for one kill, 0 to 1. */
  chance: number;
  /** After this many kills without one it is certain. */
  pity?: number;
}

export const QUEST_DROPS: readonly QuestDrop[] = [
  { quest: 'ms04', item: I.RIFT_SINGED_RAG, mobs: ['zombie'], chance: 0.35 },
  { quest: 'ms07', item: I.TORN_SATCHEL_SCRAP, mobs: ['zombie'], chance: 0.25 },
  { quest: 'ms13', item: I.DROWNED_REED_CHARM, mobs: ['drowned'], chance: 0.3 },
  { quest: 'ms15', item: I.REED_EMBER, mobs: 'hostile', zone: 'reed_grotto', chance: 0.12, pity: 15 },
  { quest: 'ms17', item: I.SUN_SCORCHED_TALLY, mobs: ['husk'], chance: 0.35 },
  { quest: 'ms18', item: I.CARAVAN_TALLY_TAG, mobs: ['llama', 'trader_llama'], chance: 0.3 },
  { quest: 'ms19', item: I.SAND_EMBER, mobs: 'hostile', zone: 'sand_crypt', chance: 0.12, pity: 15 },
  { quest: 'ms21', item: I.FROZEN_WARD_BELL, mobs: ['stray'], chance: 0.3 },
  { quest: 'ms23', item: I.FROST_EMBER, mobs: 'hostile', zone: 'frost_vault', chance: 0.12, pity: 15 },
  { quest: 'ms27', item: I.WARDEN_LEDGER_PAGE, mobs: ['skeleton'], chance: 0.3 },
  { quest: 'ms30', item: I.ASHEN_MEDAL, mobs: ['ashen_knight'], chance: 0.3 },
  { quest: 'ms37', item: I.THRONE_EMBER, mobs: ['hollow_king'], chance: 1 },
  { quest: 'dw_varro_3', item: I.SCORCHED_FUSE, mobs: ['creeper'], chance: 0.3 },
  { quest: 'gk_aldren_1', item: I.SEALED_COFFER, mobs: ['skeleton', 'zombie'], chance: 0.25, pity: 20 },
  { quest: 'dw_hale_1', item: I.SPORE_JAR, mobs: ['spore_puff'], chance: 0.4 },
  { quest: 'fg_sigrun_3', item: I.BEAR_CLAW, mobs: ['polar_bear'], chance: 1 },
  { quest: 'eg_tide_2', item: I.GILDED_SCALE, mobs: ['gilt_drake'], chance: 0.4 },
];

/** Every item that a quest alone makes fall (they are found nowhere else). */
export const QUEST_ITEMS: readonly number[] = [...new Set(QUEST_DROPS.map((d) => d.item))];

/** Does this drop apply to a kill of `mob` by a player standing in `zone`? */
export const dropFits = (d: QuestDrop, mob: MobKind, zone: string | null): boolean => {
  if (d.zone && d.zone !== zone) return false;
  return d.mobs === 'hostile' ? MOBS[mob]?.hostile === true : d.mobs.includes(mob);
};

/**
 * What one kill leaves for one player. `active` says whether a quest is active for them, `held` how many of an item they carry, `need` how
 * many the quest wants of it (a drop stops once they have enough), and `misses` is the player's count of kills without a drop (changed here).
 */
export function rollQuestDrops(mob: MobKind, zone: string | null, active: (quest: string) => boolean, held: (item: number) => number, need: (quest: string, item: number) => number, misses: Map<string, number>, rand: () => number): number[] {
  const found: number[] = [];
  for (const d of QUEST_DROPS) {
    if (!active(d.quest) || !dropFits(d, mob, zone)) continue;
    if (held(d.item) >= Math.max(1, need(d.quest, d.item))) continue;
    const n = (misses.get(d.quest) ?? 0) + 1;
    if (d.chance >= 1 || rand() < d.chance || (d.pity !== undefined && n >= d.pity)) {
      misses.delete(d.quest);
      found.push(d.item);
    } else misses.set(d.quest, n);
  }
  return found;
}
