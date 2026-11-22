import type { GearStat } from './gear';

/**
 * Rings and necklaces: jewelry worn in three slots of its own, two for rings and one for a necklace. Like the armor they come in
 * four materials (leather, iron, gold, diamond) and are crafted from the same ingots (see crafting.ts). Each piece gives fixed
 * bonus stats, from the same list the found gear rolls (`GearStat`), so the class takes them like any other bonus: rings a little
 * of everything, necklaces a deeper pool of the class resource and a little more on top.
 *
 * Pure data, no world: the item ids are in items.ts (`ringId`, `necklaceId`), the stat modifiers in gear.ts (`accessoryModifiers`).
 */

export const ACCESSORY_KINDS = ['ring', 'necklace'] as const;
export type AccessoryKind = (typeof ACCESSORY_KINDS)[number];

/** The materials, weakest first. They are the ones of the armor (the same ingots, the same leather). */
export const ACCESSORY_MATERIALS = ['leather', 'iron', 'gold', 'diamond'] as const;
export type AccessoryMaterial = (typeof ACCESSORY_MATERIALS)[number];

/** The slots of the `Player.accessories` container: two for rings, then one for a necklace. */
export const RING_SLOTS = 2;
export const NECKLACE_SLOT = 2;
export const ACCESSORY_SLOT_COUNT = 3;

/** What a piece of jewelry gives, by kind and material (every value is under the cap of its stat). */
export const ACCESSORY_STATS: Record<AccessoryKind, Record<AccessoryMaterial, readonly (readonly [GearStat, number])[]>> = {
  ring: {
    leather: [['vit', 4]],
    iron: [['vit', 6], ['ward', 2]],
    gold: [['crit', 4], ['haste', 5]],
    diamond: [['vit', 8], ['crit', 3], ['ward', 3]],
  },
  necklace: {
    leather: [['focus', 8]],
    iron: [['focus', 14], ['ward', 3]],
    gold: [['focus', 16], ['crit', 4], ['swift', 2]],
    diamond: [['focus', 24], ['vit', 10], ['haste', 5], ['ward', 4]],
  },
};

export interface AccessoryDef {
  kind: AccessoryKind;
  material: AccessoryMaterial;
  /** The name the item has ("leather_ring"). */
  name: string;
  stats: readonly (readonly [GearStat, number])[];
}

export function accessoryDef(kind: AccessoryKind, material: AccessoryMaterial): AccessoryDef {
  return { kind, material, name: `${material}_${kind}`, stats: ACCESSORY_STATS[kind][material] };
}

/** The container slots a kind of jewelry may go in: both ring slots, or the necklace slot. */
export function accessorySlotsOf(kind: AccessoryKind): readonly number[] {
  return kind === 'ring' ? [0, 1] : [NECKLACE_SLOT];
}
