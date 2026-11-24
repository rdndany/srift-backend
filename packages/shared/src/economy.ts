import { B, type ToolKind, type ToolMaterial } from './blocks';
import { bagPrice, bagStock } from './bags';
import { gearValue, rollGear, type GearRoll, type Rarity } from './gear';
import { mulberry32 } from './noise';
import type { ItemStack } from './inventory';
import { I, armorId, bagSlotsOf, companionItemId, mountItemId, necklaceId, ringId, skillBookAbility, toolId, wingItemId } from './items';
import { MOUNTS } from './mounts';
import { COMPANIONS } from './companions';
import { WINGS } from './wings';
import { ACCESSORY_MATERIALS, type AccessoryMaterial } from './accessories';
import type { ClassId } from './classes';
import type { MobKind } from './mobs';
import { skillBookPrice, skillBookStock } from './skillbooks';

/**
 * The game's money. Like the zen of MU Online it is a number the character carries, not an item in the bags: monsters
 * and quests pay it out straight to you, shops take it for wares and give it for what you sell, and anything else that
 * wants a price (repairs, services) spends it with `Player.spendCoins`.
 */
export const CURRENCY = { name: 'Auren', short: 'Auren' } as const;

/** The most a character can carry (a hostile save cannot make a bigger pile). */
export const MAX_COINS = 999_999_999;

/** Coins as written on screen: "1,234 Auren". */
export const formatCoins = (n: number): string => `${Math.max(0, Math.floor(n)).toLocaleString('en-US')} ${CURRENCY.short}`;

// ---- what monsters pay ------------------------------------------------------------------------------------

const KILL_COINS: Partial<Record<MobKind, [number, number]>> = {
  zombie: [4, 9],
  husk: [5, 10],
  drowned: [4, 9],
  skeleton: [5, 10],
  stray: [6, 11],
  creeper: [6, 12],
  spider: [3, 7],
  cave_spider: [3, 6],
  enderman: [30, 50],
  hollow_king: [160, 240],
  moss_lurker: [14, 24],
  spore_puff: [6, 12],
  ember_wraith: [20, 34],
  ashen_knight: [26, 42],
  hollow_priest: [34, 56],
  shade: [16, 28],
  slime: [1, 2],
  pig: [0, 2],
  cow: [0, 2],
  sheep: [0, 2],
  chicken: [0, 1],
  rabbit: [0, 1],
};

/** What a kill pays: a fresh roll between the kind's bounds (a slime pays for every size it has). */
export function coinsForKill(kind: MobKind, size: number, rand: () => number): number {
  const range = KILL_COINS[kind];
  if (!range) return 0;
  const [lo, hi] = range;
  const base = lo + Math.floor(rand() * (hi - lo + 1));
  return kind === 'slime' ? base * Math.max(1, Math.floor(size)) : base;
}

// ---- shops ------------------------------------------------------------------------------------------------

export interface ShopItem {
  /** The item id, how many of it one purchase gives, and what that costs. */
  id: number;
  count: number;
  price: number;
  /** A piece of gear with these stats (see gear.ts): every purchase gives the same piece. */
  gear?: GearRoll;
}

export interface ShopDef {
  /** The NPC who keeps it (`NpcDef.id`). */
  npc: string;
  /** What the keeper says over the counter. */
  line: string;
  stock: readonly ShopItem[];
}

type ArmorSet = 'leather' | 'gold' | 'iron' | 'diamond';
/** The four pieces of an armor set, helmet to boots, at the given prices. */
const armorSet = (material: ArmorSet, prices: [number, number, number, number]): ShopItem[] => prices.map((price, slot) => ({ id: armorId(slot, material), count: 1, price }));
const tool = (kind: ToolKind, material: ToolMaterial, price: number): ShopItem => ({ id: toolId(kind, material), count: 1, price });
const ware = (id: number, count: number, price: number): ShopItem => ({ id, count, price });
/** The rings and the necklaces (see accessories.ts), leather to diamond, at the given prices: the rings first, then the necklaces. */
const JEWELRY_PRICES: Record<AccessoryMaterial, readonly [number, number]> = { leather: [60, 90], iron: [220, 320], gold: [480, 700], diamond: [900, 1300] };
const jewelry = (): ShopItem[] => [
  ...ACCESSORY_MATERIALS.map((m) => ware(ringId(m), 1, JEWELRY_PRICES[m][0])),
  ...ACCESSORY_MATERIALS.map((m) => ware(necklaceId(m), 1, JEWELRY_PRICES[m][1])),
];
/** A piece of gear of a rarity and level, for a class (or anyone), with stats that are always the same ones. It costs eight times what it sells for (the merchants sell all three rarities). */
const piece = (id: number, rarity: Rarity, level: number, cls?: ClassId): ShopItem => {
  const gear = rollGear(id, level, rarity, cls, mulberry32(id * 131 + level * 7 + rarity))!;
  return { id, count: 1, price: gearValue(gear) * 8, gear };
};
/** All four pieces of an armor set with stats (helmet to boots), for anyone. */
const armorPieces = (material: ArmorSet, rarity: Rarity, level: number): ShopItem[] => [0, 1, 2, 3].map((slot) => piece(armorId(slot, material), rarity, level));

/**
 * The merchants of Dawnwatch, one trade each, as in the towns of World of Warcraft: the armorer sells armor and
 * shields, the weaponsmith blades, the ranger bows and arrows, the arcanist wands, staves and enchanting supplies, and
 * the general goods merchant food, light and tools. Three of them also keep the skill books of a class (the weaponsmith
 * the Warrior's, the ranger quartermaster the Ranger's, the arcanist the Mage's): a character starts with no ability
 * and learns each by right-clicking its book.
 */
export const SHOPS: readonly ShopDef[] = [
  {
    npc: 'tobin',
    line: 'Bread, torches and a sturdy pick: everything a traveller forgets to pack. Coin for goods, goods for coin. And if you mean to settle: the Auren Land Surveyor is on the hook by the door. Hold it, mark the corners of the ground you want, and the Land Office will sell it to you. What you build there is yours for good; out in the wild, the land puts itself back after a few days.',
    stock: [
      ware(I.BREAD, 4, 24),
      ware(I.COOKED_MEAT, 4, 40),
      ware(I.APPLE, 4, 20),
      ware(I.POTATO, 8, 16),
      ware(I.CARROT, 6, 18),
      ware(I.BEETROOT, 8, 12),
      ware(I.BEETROOT_SEEDS, 8, 10),
      ware(I.COCOA_BEANS, 8, 20),
      ware(I.SWEET_BERRIES, 8, 20),
      ware(I.GLOW_BERRIES, 6, 14),
      ware(I.MUSHROOM_STEW, 1, 16),
      ware(I.RABBIT_STEW, 1, 28),
      ware(I.BAKED_POTATO, 4, 32),
      ware(B.TORCH, 8, 16),
      ware(I.BUCKET, 1, 40),
      ware(I.FISHING_ROD, 1, 44),
      ware(I.MILK_BUCKET, 1, 18),
      ware(I.MAP, 1, 60),
      ware(I.EMBERSTONE, 1, 30),
      ware(I.LAND_SURVEYOR, 1, 400),
      ware(I.WARDEN_SCROLL, 1, 90),
      ware(I.HOLLOW_BONE, 1, 140),
      ware(I.BED, 1, 70),
      ...bagStock([0, 1, 2]),
      tool('pickaxe', 'stone', 40),
      tool('axe', 'stone', 36),
      tool('shovel', 'stone', 24),
      tool('hoe', 'stone', 30),
      tool('pickaxe', 'iron', 190),
      tool('axe', 'iron', 170),
      tool('shovel', 'iron', 90),
      tool('hoe', 'iron', 100),
    ],
  },
  {
    npc: 'hilda',
    line: 'Armor does not make you brave, it makes you alive. Try the leather first, the iron when you have earned it. Rings and necklaces are in the glass case: right-click one to wear it, two rings and a necklace at a time.',
    stock: [
      ...armorSet('leather', [40, 64, 56, 32]),
      ...armorSet('iron', [150, 240, 210, 120]),
      ...armorSet('diamond', [520, 830, 720, 420]),
      ware(I.SHIELD, 1, 120),
      piece(I.SHIELD, 1, 4, 'warrior'),
      piece(I.SHIELD, 2, 10, 'warrior'),
      piece(I.SHIELD, 3, 16, 'warrior'),
      ...armorPieces('leather', 1, 3),
      ...armorPieces('leather', 2, 5),
      ...armorPieces('leather', 3, 5),
      ...armorPieces('iron', 1, 8),
      ...armorPieces('iron', 2, 12),
      ...armorPieces('iron', 3, 12),
      ...armorPieces('diamond', 1, 14),
      ...armorPieces('diamond', 2, 18),
      ...armorPieces('diamond', 3, 20),
      ...jewelry(),
      ...bagStock([3, 4]),
    ],
  },
  {
    npc: 'garrick',
    line: 'A good blade is an honest friend. Mind the edge, and mind who you point it at. I keep the Warrior\'s skill books too: buy one and right-click it to learn it.',
    stock: [
      tool('sword', 'stone', 45),
      tool('sword', 'iron', 160),
      tool('sword', 'diamond', 620),
      ware(I.DAGGER, 1, 220),
      ware(I.GREATSWORD, 1, 380),
      piece(I.GREATSWORD, 1, 4, 'warrior'),
      piece(I.GREATSWORD, 2, 10, 'warrior'),
      piece(I.GREATSWORD, 2, 16, 'warrior'),
      piece(I.GREATSWORD, 3, 20, 'warrior'),
      piece(toolId('sword', 'iron'), 1, 6, 'warrior'),
      piece(toolId('sword', 'iron'), 2, 12, 'warrior'),
      piece(toolId('sword', 'iron'), 3, 16, 'warrior'),
      piece(I.DAGGER, 1, 4, 'ranger'),
      piece(I.DAGGER, 2, 10, 'ranger'),
      piece(I.DAGGER, 3, 16, 'ranger'),
      ...skillBookStock('warrior'),
    ],
  },
  {
    npc: 'fenna',
    line: 'Bows, bolts and everything for the long shot. Keep your quiver full and your distance longer. The Ranger\'s skill books are on the end of the counter: right-click one to learn it. And the horns on the shelf behind me call a Fenrir, a great wolf in armour: put one in the mount slot (top right of the screen), then press H to ride. The wings hanging from the rafters are for those who would rather not ride: wear a pair in the wing slot and double-tap jump to take to the air. And the little ones in the cages by the door are companions: wear one in the companion slot and it follows you about, lending a hand.',
    stock: [
      ware(I.ARROW, 16, 32),
      ware(I.ARROW, 64, 120),
      ware(I.BOW, 1, 90),
      ware(I.CROSSBOW, 1, 300),
      piece(I.BOW, 1, 4, 'ranger'),
      piece(I.BOW, 2, 10, 'ranger'),
      piece(I.BOW, 2, 16, 'ranger'),
      piece(I.BOW, 3, 20, 'ranger'),
      piece(I.CROSSBOW, 1, 8, 'ranger'),
      piece(I.CROSSBOW, 2, 14, 'ranger'),
      piece(I.CROSSBOW, 3, 18, 'ranger'),
      ware(I.SHEARS, 1, 60),
      ware(I.BOAT, 1, 50),
      ware(I.MINECART, 1, 90),
      // The horns that teach a mount (see mounts.ts): right-click one to put it in the mount slot, then press H to ride.
      ...MOUNTS.map((m) => ware(mountItemId(m.id), 1, m.price)),
      // The wings (see wings.ts): right-click a pair to put it in the wing slot, then double-tap jump to fly. The first pairs are dear, the second pairs dearer.
      ...WINGS.map((w) => ware(wingItemId(w.id), 1, w.tier === 1 ? 3000 : 9000)),
      // The companions (see companions.ts): right-click one to put it in the companion slot, and it follows at your shoulder.
      ...COMPANIONS.map((c) => ware(companionItemId(c.id), 1, 2500)),
      ...skillBookStock('ranger'),
    ],
  },
  {
    npc: 'lysa',
    line: 'The Rift hums in the right hands. Wands, staves and the small things the old magic is made of. The Mage\'s skill books are here as well: right-click one to learn the spell inside.',
    stock: [
      ware(I.WAND, 1, 260),
      ware(I.STAFF, 1, 320),
      ware(I.SPELLBOOK, 1, 340),
      ware(I.ORB, 1, 280),
      piece(I.STAFF, 1, 4, 'mage'),
      piece(I.STAFF, 2, 10, 'mage'),
      piece(I.STAFF, 3, 16, 'mage'),
      piece(I.WAND, 1, 4, 'mage'),
      piece(I.WAND, 2, 10, 'mage'),
      piece(I.WAND, 3, 16, 'mage'),
      piece(I.SPELLBOOK, 1, 8, 'mage'),
      piece(I.SPELLBOOK, 2, 14, 'mage'),
      piece(I.SPELLBOOK, 3, 18, 'mage'),
      piece(I.ORB, 1, 8, 'mage'),
      piece(I.ORB, 2, 14, 'mage'),
      piece(I.ORB, 3, 18, 'mage'),
      ware(I.BOOK, 1, 40),
      ware(I.LAPIS_LAZULI, 4, 80),
      ware(I.EXPERIENCE_BOTTLE, 1, 150),
      ware(B.ENCHANTING_TABLE, 1, 350),
      // The jewels: click a piece of equipment with one to raise it (+1 to +9) or give it a new attribute (see jewels.ts).
      ware(I.JEWEL_DAWN, 1, 260),
      ware(I.JEWEL_RIFT, 1, 700),
      ware(I.JEWEL_BLOOM, 1, 900),
      ...skillBookStock('mage'),
    ],
  },
];
export const shopOf = (npc: string): ShopDef | null => SHOPS.find((s) => s.npc === npc) ?? null;

/** What a shop pays for one of an item (nothing for what it will not take: tools, armor, ordinary blocks). */
const SELL: Record<number, number> = {
  [I.COAL]: 3,
  [I.IRON_INGOT]: 14,
  [I.RAW_IRON]: 8,
  [I.GOLD_INGOT]: 30,
  [I.RAW_GOLD]: 15,
  [I.DIAMOND]: 120,
  [I.EMERALD]: 40,
  [I.LAPIS_LAZULI]: 6,
  [I.REDSTONE]: 3,
  [I.LEATHER]: 4,
  [I.STRING]: 2,
  [I.FEATHER]: 1,
  [I.BONE]: 2,
  [I.GUNPOWDER]: 8,
  [I.ROTTEN_FLESH]: 1,
  [I.SLIMEBALL]: 6,
  [I.SPIDER_EYE]: 3,
  [I.INK_SAC]: 2,
  [I.ENDER_PEARL]: 50,
  [I.FLINT]: 1,
  [I.WHEAT]: 2,
  [I.APPLE]: 2,
  [I.BREAD]: 3,
  [I.POTATO]: 1,
  [I.CARROT]: 2,
  [I.BEETROOT]: 1,
  [I.BEETROOT_SOUP]: 6,
  [I.MUSHROOM_STEW]: 6,
  [I.RABBIT_STEW]: 10,
  [I.COCOA_BEANS]: 2,
  [I.COOKIE]: 1,
  [I.MILK_BUCKET]: 4,
  [I.CAKE]: 8,
  [I.SWEET_BERRIES]: 2,
  [I.GLOW_BERRIES]: 2,
  [I.BAKED_POTATO]: 4,
  [I.RAW_MEAT]: 2,
  [I.COOKED_MEAT]: 5,
  [I.MUTTON]: 2,
  [I.COOKED_MUTTON]: 5,
  [I.CHICKEN]: 2,
  [I.COOKED_CHICKEN]: 5,
  [I.RABBIT]: 2,
  [I.COOKED_RABBIT]: 5,
  [I.RAW_COD]: 2,
  [I.COOKED_COD]: 5,
  [I.RAW_SALMON]: 3,
  [I.COOKED_SALMON]: 6,
  [I.TROPICAL_FISH]: 4,
  [I.PUFFERFISH]: 3,
  [I.BOWL]: 1,
  [I.ARROW]: 1,
  [I.BOOK]: 6,
  [I.EXPERIENCE_BOTTLE]: 60,
  [I.JEWEL_DAWN]: 65,
  [I.JEWEL_RIFT]: 175,
  [I.JEWEL_BLOOM]: 225,
  [B.LOG]: 2,
  [B.PLANKS]: 1,
};

/** The coins a stack sells for each: found gear by its rarity and level; renamed or enchanted things are not bought. */
export function stackSellPrice(s: ItemStack): number {
  if (s.ench || s.name) return 0;
  if (!s.gear) return sellPrice(s.id);
  // A found piece sells for its rarity and level; a plain one that went through a jewel for its price and what the jewels gave it.
  return s.gear.r > 0 ? gearValue(s.gear) : sellPrice(s.id) + gearValue(s.gear);
}

/** The coins one of this item sells for, or 0 when shops do not buy it. */
export function sellPrice(id: number): number {
  // A spare skill book sells for a quarter of what the merchants ask for it.
  const book = skillBookAbility(id);
  if (book) return Math.floor(skillBookPrice(book) / 4);
  // A spare bag too (the Rift Satchel, which no merchant stocks, sells for a quarter of its price all the same).
  if (bagSlotsOf(id) > 0) return Math.floor(bagPrice(id) / 4);
  return SELL[id] ?? 0;
}
