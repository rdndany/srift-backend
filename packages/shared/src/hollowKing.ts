import { ENCH, type Enchant } from './enchant';
import { gearStack } from './gear';
import type { ItemStack } from './inventory';
import type { ClassId } from './classes';
import { HK, HOLLOW_KING_IDS } from './hollowKingData';

export * from './hollowKingData';

/** The level the relics ask for, and what a roll of their stats is made at. */
export const HK_LEVEL = 9;

/**
 * The glyphs each relic is made with: a relic is a found piece of epic gear (so it has stats to roll), and it comes with
 * fire already inscribed: the armor shrugs fire off, the blade, the bolts and the staff set things alight. The armor holds four
 * glyphs, so those are full; the ring and the necklace carry none and keep their two sockets free for the player.
 */
const HK_GLYPHS: Record<number, readonly Enchant[]> = {
  [HK.CROWN]: [[ENCH.FIRE_PROTECTION, 3], [ENCH.VIGOR, 3], [ENCH.UNBREAKING, 2]],
  [HK.CUIRASS]: [[ENCH.FIRE_PROTECTION, 4], [ENCH.VIGOR, 4], [ENCH.UNBREAKING, 3]],
  [HK.GREAVES]: [[ENCH.FIRE_PROTECTION, 3], [ENCH.VIGOR, 3], [ENCH.UNBREAKING, 2]],
  [HK.SABATONS]: [[ENCH.FIRE_PROTECTION, 3], [ENCH.SWIFTNESS, 2], [ENCH.FEATHER_FALLING, 3], [ENCH.VIGOR, 2]],
  [HK.BLADE]: [[ENCH.FIRE_ASPECT, 2], [ENCH.SHARPNESS, 4], [ENCH.MIGHT, 3], [ENCH.FURY, 2]],
  [HK.STAFF]: [[ENCH.SORCERY, 4], [ENCH.FOCUS, 3], [ENCH.FURY, 2], [ENCH.UNBREAKING, 2]],
  [HK.CROSSBOW]: [[ENCH.FLAME, 1], [ENCH.HAWKEYE, 4], [ENCH.FURY, 2], [ENCH.QUICKSTRIKE, 2]],
};

/** The class a relic is made for (the weapons; the armor, the ring and the necklace are for anyone). */
const HK_CLASS: Record<number, ClassId> = { [HK.BLADE]: 'warrior', [HK.STAFF]: 'mage', [HK.CROSSBOW]: 'ranger' };

/** A fresh relic: epic, with rolled stats, and with its glyphs of fire. */
export function hollowKingRelic(id: number, rand: () => number): ItemStack {
  if (!HOLLOW_KING_IDS.includes(id)) throw new Error(`not a relic of the Hollow King: ${id}`);
  const stack = gearStack(id, HK_LEVEL, 3, HK_CLASS[id], rand);
  const glyphs = HK_GLYPHS[id];
  if (glyphs) stack.ench = glyphs.map(([g, r]): Enchant => [g, r]);
  return stack;
}

/** One of the nine, chosen at random. */
export function randomHollowKingRelic(rand: () => number): ItemStack {
  return hollowKingRelic(HOLLOW_KING_IDS[Math.floor(rand() * HOLLOW_KING_IDS.length)], rand);
}
