import type { GearStat } from './gear';

/**
 * The relics of the Hollow King: nine pieces that only he leaves (see hollowKing.ts for how one is made and realm.ts for when
 * they drop). Pure data with no imports from the item table, so that the item table, the tooltips and the glyph code can all
 * read it. A relic always burns: whatever glyphs it carries, it glows with the fire of the Ember element.
 *
 * A full set of armor (crown, cuirass, greaves, sabatons), a sword, a staff, a crossbow, a ring and a necklace.
 */
export const HK = {
  CROWN: 700,
  CUIRASS: 701,
  GREAVES: 702,
  SABATONS: 703,
  BLADE: 704,
  STAFF: 705,
  CROSSBOW: 706,
  SIGNET: 707,
  HEART: 708,
} as const;

export const HOLLOW_KING_IDS: readonly number[] = Object.values(HK);

export const isHollowKingItem = (id: number): boolean => id >= HK.CROWN && id <= HK.HEART;

/** The armor pieces, by slot (0 helmet .. 3 boots). */
export const HK_ARMOR: readonly number[] = [HK.CROWN, HK.CUIRASS, HK.GREAVES, HK.SABATONS];

/** The name each relic shows (the item names are in snake case and double as the picture names). */
export const HK_NAMES: Record<number, string> = {
  [HK.CROWN]: 'Crown of the Hollow King',
  [HK.CUIRASS]: 'Cuirass of the Hollow King',
  [HK.GREAVES]: 'Greaves of the Hollow King',
  [HK.SABATONS]: 'Sabatons of the Hollow King',
  [HK.BLADE]: 'Emberfall, Blade of the King',
  [HK.STAFF]: 'Staff of the Burning Throne',
  [HK.CROSSBOW]: 'Cinderbolt Crossbow',
  [HK.SIGNET]: 'Signet of the Hollow King',
  [HK.HEART]: 'Heart of the Hollow King',
};

/** The item names (and so the picture names). */
export const HK_ITEM_NAMES: Record<number, string> = {
  [HK.CROWN]: 'hollow_king_crown',
  [HK.CUIRASS]: 'hollow_king_cuirass',
  [HK.GREAVES]: 'hollow_king_greaves',
  [HK.SABATONS]: 'hollow_king_sabatons',
  [HK.BLADE]: 'emberfall_blade',
  [HK.STAFF]: 'burning_throne_staff',
  [HK.CROSSBOW]: 'cinderbolt_crossbow',
  [HK.SIGNET]: 'hollow_king_signet',
  [HK.HEART]: 'hollow_king_heart',
};

/** A line of lore under each name. */
export const HK_LORE: Record<number, string> = {
  [HK.CROWN]: 'Cut from the throne itself, and still lit from within.',
  [HK.CUIRASS]: 'A heart of lava beats behind the stone.',
  [HK.GREAVES]: 'They leave scorched prints on the cold floor.',
  [HK.SABATONS]: 'The ground remembers every step the King took.',
  [HK.BLADE]: 'It was drawn once, and the hollow burned for a year.',
  [HK.STAFF]: 'Whoever sits on the throne speaks in fire.',
  [HK.CROSSBOW]: 'Its bolts leave the string already burning.',
  [HK.SIGNET]: 'The seal of a kingdom with no one left in it.',
  [HK.HEART]: 'Cold stone, and a coal that will not go out.',
};

/** Defense of the four pieces of armor (better than diamond), the toughness they share, and how long they last. */
export const HK_DEFENSE: readonly [number, number, number, number] = [3, 8, 6, 3];
export const HK_TOUGHNESS = 3;
export const HK_DURABILITY: readonly [number, number, number, number] = [460, 660, 620, 540];

/** What the ring and the necklace give: fixed, like all jewelry, and above the diamond ones. */
export const HK_RING_STATS: readonly (readonly [GearStat, number])[] = [['vit', 12], ['crit', 5], ['haste', 6], ['ward', 4]];
export const HK_NECKLACE_STATS: readonly (readonly [GearStat, number])[] = [['focus', 32], ['vit', 14], ['haste', 6], ['ward', 6], ['crit', 4]];

/** The weapons: a sword, a staff that throws fireballs and a crossbow (the stats are what the items are made with). */
export const HK_BLADE_STATS = { kind: 'melee', damage: 11, cooldown: 0.8, cost: 0 } as const;
export const HK_STAFF_STATS = { kind: 'spell', damage: 7, cooldown: 1.1, cost: 9, speed: 26, radius: 2.4 } as const;
export const HK_CROSSBOW_STATS = { kind: 'ranged', damage: 15, cooldown: 0.75, cost: 0 } as const;
