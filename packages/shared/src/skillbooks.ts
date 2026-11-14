import { ABILITIES, ABILITY_BY_ID, abilitiesOf, type AbilityId } from './abilities';
import type { ClassId } from './classes';
import { skillBookId } from './items';
import type { MobKind } from './mobs';

/**
 * Where skill books come from, as in World of Warcraft: a character starts with no ability, and learns each one by
 * right-clicking its book (`Player.learnFromBook`). The books are found on monsters (this file), handed out by quests
 * (`QuestReward.classItems`) and sold by the merchants of Dawnwatch (`SHOPS`, which uses `skillBookStock`).
 *
 * Pure data and rules, no world: the dice come in from the caller, so the server's own random source decides.
 */

/** What a merchant asks for the book of an ability: 60 for a level 1 book, 180 for level 3, 300 for level 5. */
export const skillBookPrice = (ability: AbilityId): number => 60 * (ABILITY_BY_ID.get(ability)?.unlockLevel ?? 1);

/** The books of a class in button order, as a merchant lists them (one purchase gives one book). */
export const skillBookStock = (classId: ClassId): { id: number; count: number; price: number }[] =>
  abilitiesOf(classId).map((a) => ({ id: skillBookId(a.id), count: 1, price: skillBookPrice(a.id) }));

/** The chance that a monster killed by a player leaves a skill book behind (monsters that are no danger leave none). */
const BOOK_DROP_CHANCE: Partial<Record<MobKind, number>> = {
  zombie: 0.07,
  husk: 0.08,
  drowned: 0.07,
  skeleton: 0.07,
  stray: 0.08,
  spider: 0.06,
  cave_spider: 0.05,
  creeper: 0.08,
  enderman: 0.25,
};

/** The chance a kill of this kind drops a book (before choosing which). */
export const skillBookDropChance = (kind: MobKind): number => BOOK_DROP_CHANCE[kind] ?? 0;

/**
 * What a monster that has just been killed leaves behind: the item id of a skill book, or null. It can be the book of
 * any of the twelve abilities, whatever the killer's class and whether or not they know it already (books can be
 * traded, sold or kept for another character), and the books that need a higher level are rarer.
 */
export function skillBookDrop(kind: MobKind, rand: () => number): number | null {
  const chance = BOOK_DROP_CHANCE[kind];
  if (!chance || rand() >= chance) return null;
  const pool = ABILITIES;
  const weight = (level: number): number => 12 / Math.max(1, level);
  let pick = rand() * pool.reduce((sum, a) => sum + weight(a.unlockLevel), 0);
  for (const a of pool) {
    pick -= weight(a.unlockLevel);
    if (pick < 0) return skillBookId(a.id);
  }
  return skillBookId(pool[pool.length - 1].id);
}
