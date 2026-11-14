/**
 * Armor, with the original game's numbers.
 *
 * Four slots (helmet, chestplate, leggings, boots) and four craftable materials. Each piece gives
 * "defense points" (a full armor icon is 2 points, 20 points is a full set of diamond). Damage is
 * reduced by the formula the original uses since 1.9:
 *
 *   reduction = min(20, max(defense / 5, defense - damage / (2 + toughness / 4))) / 25
 *
 * Armor protects against attacks (mobs, arrows, explosions) but not against falling, drowning,
 * starving or the void. Every piece takes `max(1, floor(damage / 4))` wear when you are hit.
 */

export const ARMOR_SLOTS = ['helmet', 'chestplate', 'leggings', 'boots'] as const;
export type ArmorSlot = (typeof ARMOR_SLOTS)[number];

/** Chainmail is not craftable in the original either (it only drops from mobs), so it is left out. */
export const ARMOR_MATERIALS = ['leather', 'gold', 'iron', 'diamond'] as const;
export type ArmorMaterial = (typeof ARMOR_MATERIALS)[number];

/** Defense points per piece: [helmet, chestplate, leggings, boots]. */
export const ARMOR_DEFENSE: Record<ArmorMaterial, readonly [number, number, number, number]> = {
  leather: [1, 3, 2, 1],
  gold: [2, 5, 3, 1],
  iron: [2, 6, 5, 2],
  diamond: [3, 8, 6, 3],
};

/** Durability = material multiplier x slot base. */
const MATERIAL_DURABILITY: Record<ArmorMaterial, number> = { leather: 5, gold: 7, iron: 15, diamond: 33 };
const SLOT_DURABILITY: readonly [number, number, number, number] = [11, 16, 15, 13];

/** Extra resistance of heavy armor against strong hits. */
export const ARMOR_TOUGHNESS: Record<ArmorMaterial, number> = { leather: 0, gold: 0, iron: 0, diamond: 2 };

export const MAX_DEFENSE = 20;

/** The classes that have clothes of their own (the same ids as `ClassId`, written out so that this file need not import classes). */
export const OUTFIT_CLASSES = ['warrior', 'mage', 'ranger'] as const;
export type OutfitClass = (typeof OUTFIT_CLASSES)[number];

export interface ArmorDef {
  slot: ArmorSlot;
  /** Set for the clothes of a class (a Warrior's helm, a Mage's robe): worn like armor, but only for the look: no defense, never wears out. */
  outfit?: OutfitClass;
  /** 0 = helmet .. 3 = boots. */
  slotIndex: number;
  material: ArmorMaterial;
  defense: number;
  toughness: number;
  durability: number;
}

export function armorDef(slotIndex: number, material: ArmorMaterial): ArmorDef {
  return {
    slot: ARMOR_SLOTS[slotIndex],
    slotIndex,
    material,
    defense: ARMOR_DEFENSE[material][slotIndex],
    toughness: ARMOR_TOUGHNESS[material],
    durability: MATERIAL_DURABILITY[material] * SLOT_DURABILITY[slotIndex],
  };
}

/** A piece of a class's clothes: it goes in the same slot as armor, protects nothing and does not wear. */
export function outfitDef(slotIndex: number, outfit: OutfitClass): ArmorDef {
  return { slot: ARMOR_SLOTS[slotIndex], slotIndex, material: 'leather', defense: 0, toughness: 0, durability: 0, outfit };
}

/** Fraction of an attack of `damage` that armor absorbs (0..0.8). */
export function armorReduction(damage: number, defense: number, toughness = 0): number {
  if (defense <= 0 || damage <= 0) return 0;
  const d = Math.max(defense / 5, defense - damage / (2 + toughness / 4));
  return Math.min(MAX_DEFENSE, d) / 25;
}

/** Damage left after armor. */
export function reduceDamage(damage: number, defense: number, toughness = 0): number {
  return damage * (1 - armorReduction(damage, defense, toughness));
}

/** Wear each worn piece takes from one hit of `damage`. */
export function armorWear(damage: number): number {
  return Math.max(1, Math.floor(damage / 4));
}