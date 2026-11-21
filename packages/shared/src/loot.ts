import { B, BB } from './blocks';
import { randomEnchantedBook } from './enchant';
import { armorId, I, toolId } from './items';
import { makeStack, type ItemStack } from './inventory';
import { hash2, mulberry32 } from './noise';
import { pickRarity, randomGear } from './gear';

/**
 * Loot tables, like the original's: a chest in a generated structure is not stored with the terrain.
 * It names a table; the first time anyone opens (or breaks) it the contents are rolled from the seed
 * and the chest's position, so a reloaded world rolls exactly the same items. There is nothing to
 * buy here: every item in these tables can also be found or made by playing.
 */
export interface LootEntry {
  item: number;
  weight: number;
  min: number;
  max: number;
}

export interface LootTable {
  /** How many stacks are rolled, inclusive. */
  rolls: readonly [number, number];
  entries: readonly LootEntry[];
  /** A chance of one extra piece of gear with a rarity and bonus stats (see gear.ts), of a level in the range. */
  gear?: { chance: number; level: readonly [number, number]; rarity: readonly [number, number, number] };
}

const e = (item: number, weight: number, min = 1, max = min): LootEntry => ({ item, weight, min, max });

export const LOOT_TABLES = {
  /** Monster rooms: the bones, string and gunpowder of the things that spawn there, plus a little treasure. */
  dungeon: {
    rolls: [3, 6],
    gear: { chance: 0.3, level: [2, 8], rarity: [70, 25, 5] },
    entries: [
      e(I.BONE, 12, 1, 4),
      e(I.ROTTEN_FLESH, 12, 1, 4),
      e(I.GUNPOWDER, 10, 1, 4),
      e(I.STRING, 10, 1, 4),
      e(I.WHEAT, 10, 1, 4),
      e(I.COAL, 8, 1, 4),
      e(I.BREAD, 8, 1),
      e(I.ARROW, 6, 2, 8),
      e(I.IRON_INGOT, 6, 1, 4),
      e(I.GOLD_INGOT, 3, 1, 3),
      e(I.APPLE, 4, 1, 2),
      e(I.WHEAT_SEEDS, 6, 1, 4),
      e(B.TORCH, 4, 2, 6),
      e(armorId(2, 'iron'), 1),
      e(toolId('pickaxe', 'iron'), 1),
      e(I.DIAMOND, 1, 1, 2),
      e(I.ENCHANTED_BOOK, 3),
      e(I.EXPERIENCE_BOTTLE, 2, 1, 3),
      e(I.JEWEL_DAWN, 2),
      e(I.JEWEL_RIFT, 1),
      e(I.WARDEN_SCROLL, 2),
      e(I.HOLLOW_BONE, 2),
    ],
  },
  /** Abandoned mineshafts: supplies someone left behind. */
  mineshaft: {
    rolls: [2, 4],
    entries: [
      e(I.COAL, 14, 2, 6),
      e(B.TORCH, 12, 3, 8),
      e(I.BREAD, 10, 1, 3),
      e(I.IRON_INGOT, 9, 1, 4),
      e(I.APPLE, 6, 1, 2),
      e(I.GOLD_INGOT, 5, 1, 3),
      e(I.WHEAT_SEEDS, 5, 2, 4),
      e(I.POTATO, 4, 1, 3),
      e(I.CARROT, 4, 1, 3),
      e(I.GLOW_BERRIES, 5, 1, 3),
      e(toolId('pickaxe', 'iron'), 2),
      e(toolId('pickaxe', 'stone'), 3),
      e(armorId(0, 'iron'), 1),
      e(I.DIAMOND, 2, 1, 2),
      e(I.ENCHANTED_BOOK, 3),
      e(I.BOOK, 3, 1, 2),
      e(I.JEWEL_DAWN, 1),
    ],
  },
  /** Village houses: food, seeds and a few tools. */
  village: {
    rolls: [2, 5],
    entries: [
      e(I.BREAD, 14, 1, 4),
      e(I.WHEAT, 12, 2, 6),
      e(I.WHEAT_SEEDS, 10, 1, 5),
      e(I.POTATO, 8, 1, 4),
      e(I.CARROT, 8, 1, 4),
      e(I.BEETROOT, 6, 1, 3),
      e(I.BEETROOT_SEEDS, 5, 1, 3),
      e(I.COCOA_BEANS, 4, 1, 2),
      e(I.SWEET_BERRIES, 5, 1, 3),
      e(I.MUSHROOM_STEW, 3, 1),
      e(I.RABBIT_STEW, 2, 1),
      e(I.APPLE, 9, 1, 3),
      e(I.COAL, 8, 1, 4),
      e(B.TORCH, 8, 2, 5),
      e(I.IRON_INGOT, 5, 1, 3),
      e(I.COOKED_MEAT, 5, 1, 3),
      e(I.LEATHER, 4, 1, 2),
      e(toolId('hoe', 'iron'), 1),
      e(toolId('sword', 'iron'), 1),
      e(I.DIAMOND, 1, 1),
    ],
  },
  /** Desert temples: the richest of the lot, as the chamber is hard to find. */
  temple: {
    rolls: [4, 7],
    gear: { chance: 0.65, level: [6, 14], rarity: [40, 45, 15] },
    entries: [
      e(I.BONE, 12, 1, 6),
      e(I.ROTTEN_FLESH, 12, 2, 6),
      e(I.GUNPOWDER, 12, 1, 6),
      e(I.STRING, 10, 1, 5),
      e(I.GOLD_INGOT, 8, 1, 5),
      e(I.IRON_INGOT, 10, 1, 5),
      e(I.COAL, 8, 2, 6),
      e(I.ENDER_PEARL, 3, 1, 2),
      e(I.FEATHER, 6, 1, 4),
      e(I.DIAMOND, 4, 1, 3),
      e(armorId(1, 'iron'), 1),
      e(armorId(3, 'gold'), 2),
      e(toolId('sword', 'iron'), 1),
      e(I.ENCHANTED_BOOK, 6),
      e(I.BOOK, 4, 1, 3),
      e(I.JEWEL_DAWN, 4),
      e(I.JEWEL_RIFT, 3),
      e(I.JEWEL_BLOOM, 2),
    ],
  },
  /** The cache behind a wall of rubble in a tunnel: what a miner left, mostly ore and what it buys. */
  cache: {
    rolls: [3, 5],
    gear: { chance: 0.2, level: [3, 10], rarity: [60, 32, 8] },
    entries: [
      e(I.GOLD_INGOT, 12, 2, 6),
      e(I.IRON_INGOT, 12, 2, 6),
      e(I.COAL, 8, 3, 8),
      e(I.LAPIS_LAZULI, 8, 3, 8),
      e(I.REDSTONE, 8, 3, 8),
      e(I.DIAMOND, 5, 1, 2),
      e(I.EMERALD, 3, 1, 2),
      e(B.TORCH, 8, 4, 10),
      e(I.BREAD, 4, 1, 3),
      e(toolId('pickaxe', 'iron'), 2),
      e(I.ENCHANTED_BOOK, 3),
      e(I.EXPERIENCE_BOTTLE, 3, 1, 3),
      e(I.JEWEL_DAWN, 2),
    ],
  },
  /** Ruins and camps of the World Beyond: supplies, and the stones and minerals of that land. */
  ruin: {
    rolls: [2, 5],
    gear: { chance: 0.25, level: [3, 12], rarity: [66, 28, 6] },
    entries: [
      e(I.BREAD, 10, 1, 3),
      e(I.COAL, 9, 2, 6),
      e(B.TORCH, 8, 3, 8),
      e(I.ARROW, 6, 3, 10),
      e(I.IRON_INGOT, 7, 1, 4),
      e(I.GOLD_INGOT, 4, 1, 3),
      e(I.BONE, 6, 1, 4),
      e(I.STRING, 5, 1, 4),
      e(BB.malachite, 5, 1, 3),
      e(BB.azurite, 5, 1, 3),
      e(BB.sulfur_ore, 4, 1, 3),
      e(BB.limestone, 5, 4, 12),
      e(BB.marble, 3, 2, 8),
      e(BB.ancient_bricks, 3, 4, 10),
      e(I.ENCHANTED_BOOK, 2),
      e(I.JEWEL_DAWN, 2),
      e(I.DIAMOND, 1),
    ],
  },
  /** Relics of the rarer places (temples, sanctuaries, fortresses, libraries): gems, enchanted books, jewels and good gear. */
  relic: {
    rolls: [4, 7],
    gear: { chance: 0.7, level: [8, 20], rarity: [34, 44, 22] },
    entries: [
      e(I.GOLD_INGOT, 8, 2, 6),
      e(I.IRON_INGOT, 7, 2, 6),
      e(I.DIAMOND, 6, 1, 3),
      e(I.EMERALD, 5, 1, 3),
      e(BB.jade, 6, 1, 4),
      e(BB.crystal_ore, 4, 1, 3),
      e(BB.cinnabar_ore, 4, 1, 3),
      e(BB.azure_crystal, 4, 1, 4),
      e(BB.rose_crystal, 4, 1, 4),
      e(BB.amber_crystal, 3, 1, 3),
      e(BB.polished_marble, 5, 4, 12),
      e(BB.obsidian_bricks, 2, 2, 6),
      e(I.ENCHANTED_BOOK, 8),
      e(I.EXPERIENCE_BOTTLE, 6, 1, 4),
      e(I.JEWEL_DAWN, 4),
      e(I.JEWEL_RIFT, 4),
      e(I.JEWEL_BLOOM, 3),
      e(I.ENDER_PEARL, 3, 1, 2),
    ],
  },
} as const satisfies Record<string, LootTable>;

export type LootTableName = keyof typeof LOOT_TABLES;

/**
 * Roll a chest's 27 slots. The stacks land in random slots, not packed from the top, as in the
 * original.
 */
export function rollChest(table: LootTable, rand: () => number): (ItemStack | null)[] {
  const slots: (ItemStack | null)[] = Array.from({ length: 27 }, () => null);
  const total = table.entries.reduce((a, x) => a + x.weight, 0);
  const rolls = table.rolls[0] + Math.floor(rand() * (table.rolls[1] - table.rolls[0] + 1));
  for (let r = 0; r < rolls; r++) {
    let pick = rand() * total;
    let entry = table.entries[0];
    for (const x of table.entries) {
      pick -= x.weight;
      if (pick < 0) {
        entry = x;
        break;
      }
    }
    const count = entry.min + Math.floor(rand() * (entry.max - entry.min + 1));
    // An enchanted book is rolled afresh each time: any enchantment, at any level.
    const stack = entry.item === I.ENCHANTED_BOOK ? randomEnchantedBook(rand) : makeStack(entry.item, count);
    // Land in a free slot; merge into one that already holds the same thing if we run out of tries.
    for (let tries = 0; tries < 30; tries++) {
      const i = Math.floor(rand() * 27);
      if (!slots[i]) {
        slots[i] = stack;
        break;
      }
    }
  }
  // Some chests also hold a piece of gear (any class: it is rolled for one of them).
  const g = table.gear;
  if (g && rand() < g.chance) {
    const level = g.level[0] + Math.floor(rand() * (g.level[1] - g.level[0] + 1));
    const piece = randomGear(level, pickRarity(g.rarity, rand), undefined, rand);
    const free: number[] = [];
    slots.forEach((s, i) => !s && free.push(i));
    if (free.length > 0) slots[free[Math.floor(rand() * free.length)]] = piece;
  }
  return slots;
}

/** A random source that depends only on the world seed and a position: the same chest rolls the same loot. */
export function positionRand(seed: number, x: number, y: number, z: number, salt = 0): () => number {
  return mulberry32(Math.floor(hash2(seed + salt, x * 31 + y * 7, z) * 4294967296) | 0);
}

/** What a monster spawner produces. Fixed by its position, so it needs no saved data. */
export function spawnerKind(seed: number, x: number, y: number, z: number): 'zombie' | 'skeleton' {
  return hash2(seed ^ 0x5b3a, x * 131 + y, z) < 0.5 ? 'zombie' : 'skeleton';
}
