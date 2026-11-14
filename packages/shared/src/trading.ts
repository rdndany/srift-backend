import { B, DYE_NAMES, stairId } from './blocks';
import { I, armorId, bedItemId, dyeId, toolId } from './items';

/**
 * Villagers and what they trade, after the original: every villager has a profession, five levels
 * (Novice to Master) and a list of offers that grows as it levels up. Emeralds are the currency: a
 * villager buys what it needs (wheat, coal, flint...) for emeralds and sells its wares for emeralds.
 *
 * Pure data and rules, no world and no DOM. `TradeMenu` (menu.ts) is the screen, `Realm` keeps the
 * villagers of every village and `MobManager` moves them about.
 */

export const PROFESSIONS = ['unemployed', 'nitwit', 'farmer', 'cleric', 'armorer', 'weaponsmith', 'toolsmith', 'butcher', 'shepherd', 'fletcher', 'mason'] as const;
export type Profession = (typeof PROFESSIONS)[number];

/** Professions with something to sell. The others only wander (and shake their heads at you). */
export const TRADING_PROFESSIONS: readonly Profession[] = PROFESSIONS.filter((p) => p !== 'unemployed' && p !== 'nitwit');

export const LEVEL_NAMES = ['Novice', 'Apprentice', 'Journeyman', 'Expert', 'Master'] as const;
export const MAX_VILLAGER_LEVEL = LEVEL_NAMES.length;

/** Villager experience needed to reach level 2, 3, 4 and 5. */
export const LEVEL_XP = [10, 70, 150, 250] as const;

/** How many of the most recent trades' experience a trade is worth, by level of the offer. */
const OFFER_XP = [2, 10, 20, 30, 30];

export type StackSpec = [id: number, count: number];

/** One offer: what the villager wants (`a`, and maybe `b`), what it gives (`r`), and how often it will. */
export interface Offer {
  a: StackSpec;
  b?: StackSpec;
  r: StackSpec;
  /** Times it will trade before it needs a restock. */
  max: number;
  uses: number;
  /** Villager experience a trade earns. */
  xp: number;
  /** Villager level that unlocks it (1..5). */
  level: number;
}

/** What `TradeMenu` shows and what is kept for a villager: plain, JSON-safe data. */
export interface TradeBook {
  profession: Profession;
  level: number;
  xp: number;
  offers: Offer[];
}

/** A villager in the world: its trades and where it lives (the spot it goes back to at night). */
export interface VillagerState extends TradeBook {
  homeX: number;
  homeY: number;
  homeZ: number;
}

const E = I.EMERALD;
const colour = (name: string): number => (DYE_NAMES as readonly string[]).indexOf(name);
const dye = (name: string): number => dyeId(colour(name));
const wool = (name: string): number => (name === 'white' ? B.WOOL : B.WOOL_COLOR_BASE + colour(name) - 1);
const brickStairs = stairId(4, false, 0);

type Row = Omit<Offer, 'uses' | 'xp' | 'level'>;
type Table = Partial<Record<Profession, Row[][]>>;

/** Villager buys `n` of an item for `e` emeralds. */
const buy = (item: number, n: number, e = 1, max = 16): Row => ({ a: [item, n], r: [E, e], max });
/** Villager sells `n` of an item for `e` emeralds. */
const sell = (e: number, item: number, n = 1, max = 12): Row => ({ a: [E, e], r: [item, n], max });

/** The offers of each profession, one list per level. */
const TABLE: Table = {
  farmer: [
    [buy(I.WHEAT, 20), sell(1, I.BREAD, 6)],
    [buy(I.WHEAT_SEEDS, 24), sell(1, I.APPLE, 4)],
    [sell(1, I.COOKED_CHICKEN, 4), buy(I.APPLE, 12, 1, 12)],
    [sell(2, I.COOKED_MUTTON, 5)],
    [sell(3, I.COOKED_RABBIT, 8, 8)],
  ],
  cleric: [
    [buy(I.ROTTEN_FLESH, 32), sell(1, I.SLIMEBALL, 2)],
    [buy(I.GOLD_INGOT, 3, 1, 12), sell(1, I.LAPIS_LAZULI, 2)],
    [buy(I.SPIDER_EYE, 8, 1, 12), sell(4, B.GLOWSTONE, 3)],
    [sell(5, I.ENDER_PEARL, 1, 8)],
    [buy(I.DIAMOND, 1, 4, 12), sell(3, I.GUNPOWDER, 8, 8), sell(3, I.EXPERIENCE_BOTTLE, 1, 12)],
  ],
  armorer: [
    [buy(I.COAL, 15), sell(5, armorId(0, 'iron'), 1, 12), sell(7, armorId(2, 'iron'), 1, 12)],
    [buy(I.IRON_INGOT, 4, 1, 12), sell(9, armorId(1, 'iron'), 1, 12), sell(4, armorId(3, 'iron'), 1, 12)],
    [buy(I.DIAMOND, 1, 4, 12), sell(5, I.SHIELD, 1, 12)],
    [sell(14, armorId(2, 'diamond'), 1, 3), sell(8, armorId(3, 'diamond'), 1, 3)],
    [sell(13, armorId(0, 'diamond'), 1, 3), sell(21, armorId(1, 'diamond'), 1, 3)],
  ],
  weaponsmith: [
    [buy(I.COAL, 15), sell(3, toolId('axe', 'iron'), 1, 12)],
    [buy(I.IRON_INGOT, 4, 1, 12), sell(7, toolId('sword', 'iron'), 1, 12)],
    [buy(I.FLINT, 24, 1, 12), sell(2, I.BOW, 1, 12)],
    [buy(I.DIAMOND, 1, 4, 12), sell(13, toolId('sword', 'diamond'), 1, 3)],
    [sell(12, toolId('axe', 'diamond'), 1, 3)],
  ],
  toolsmith: [
    [buy(I.COAL, 15), sell(1, toolId('axe', 'stone')), sell(1, toolId('shovel', 'stone')), sell(1, toolId('pickaxe', 'stone'))],
    [buy(I.IRON_INGOT, 4, 1, 12), sell(1, toolId('hoe', 'stone'))],
    [buy(I.FLINT, 30, 1, 12), sell(3, toolId('pickaxe', 'iron'), 1, 12), sell(2, toolId('shovel', 'iron'), 1, 12)],
    [buy(I.DIAMOND, 1, 4, 12), sell(12, toolId('axe', 'diamond'), 1, 3), sell(5, toolId('shovel', 'diamond'), 1, 3)],
    [sell(13, toolId('pickaxe', 'diamond'), 1, 3), sell(4, toolId('hoe', 'diamond'), 1, 3)],
  ],
  butcher: [
    [buy(I.CHICKEN, 14), buy(I.RAW_MEAT, 7), sell(1, I.COOKED_MEAT, 5)],
    [buy(I.COAL, 15), sell(1, I.COOKED_CHICKEN, 8)],
    [buy(I.MUTTON, 7), sell(1, I.COOKED_MUTTON, 6)],
    [buy(I.RABBIT, 4, 1, 12), sell(2, I.COOKED_RABBIT, 8)],
    [buy(I.LEATHER, 9, 1, 8), sell(3, I.COOKED_MEAT, 16, 8)],
  ],
  shepherd: [
    [buy(wool('white'), 18), buy(I.STRING, 20), sell(1, I.FEATHER, 6)],
    [buy(dye('gray'), 12), buy(dye('black'), 12), sell(1, wool('white'), 1, 16)],
    [buy(dye('brown'), 12), sell(3, bedItemId(colour('white')), 1, 12)],
    [buy(dye('green'), 12), sell(3, bedItemId(colour('blue')), 1, 12)],
    [buy(dye('lime'), 12), sell(3, bedItemId(colour('yellow')), 1, 12)],
  ],
  fletcher: [
    [buy(I.STICK, 32), sell(1, I.ARROW, 16)],
    [buy(I.FLINT, 26, 1, 12), sell(2, I.BOW, 1, 12)],
    [buy(I.STRING, 14, 1, 12), sell(1, I.STICK, 16)],
    [buy(I.FEATHER, 24, 1, 12), sell(1, I.ARROW, 24, 12)],
    [sell(3, I.ARROW, 64, 8)],
  ],
  mason: [
    [buy(B.COBBLE, 36), sell(1, B.STONE_BRICKS, 10)],
    [buy(B.GRANITE, 16, 1, 12), sell(1, brickStairs, 4)],
    [buy(B.DIORITE, 16, 1, 12), sell(1, B.CHISELED_SANDSTONE, 4)],
    [buy(B.ANDESITE, 16, 1, 12), sell(2, B.MOSSY_COBBLE, 8)],
    [buy(I.IRON_INGOT, 6, 1, 8), sell(1, B.GLASS, 12)],
  ],
};

/** The offers a profession adds at one level (1..5); a villager of no trade has none. */
export function offersAt(profession: Profession, level: number): Offer[] {
  const rows = TABLE[profession]?.[level - 1] ?? [];
  return rows.map((r) => ({ a: [...r.a], ...(r.b ? { b: [...r.b] } : {}), r: [...r.r], max: r.max, uses: 0, xp: OFFER_XP[level - 1], level }) as Offer);
}

/** A new level 1 villager. */
export function newBook(profession: Profession): TradeBook {
  return { profession, level: 1, xp: 0, offers: offersAt(profession, 1) };
}

/** The level a villager of this much experience has reached. */
export function levelForXp(xp: number): number {
  let level = 1;
  for (const need of LEVEL_XP) if (xp >= need) level++;
  return level;
}

/** Give a villager experience; every level it reaches adds that level's offers. Returns whether it levelled up. */
export function addVillagerXp(book: TradeBook, amount: number): boolean {
  book.xp += amount;
  let up = false;
  while (book.level < MAX_VILLAGER_LEVEL && book.xp >= LEVEL_XP[book.level - 1]) {
    book.level++;
    book.offers.push(...offersAt(book.profession, book.level));
    up = true;
  }
  return up;
}

/** Refill every offer (the villagers restock a couple of times a day). */
export function restock(book: TradeBook): void {
  for (const o of book.offers) o.uses = 0;
}

export function canTradeOffer(o: Offer): boolean {
  return o.uses < o.max;
}

/** "Farmer", "Armorer"... */
export function professionName(p: Profession): string {
  return p === 'nitwit' ? 'Nitwit' : p === 'unemployed' ? 'Villager' : p.charAt(0).toUpperCase() + p.slice(1);
}

const isSpec = (x: unknown): x is StackSpec =>
  Array.isArray(x) && x.length === 2 && Number.isInteger(x[0]) && Number.isInteger(x[1]) && x[0] > 0 && x[0] < 4096 && x[1] > 0 && x[1] <= 64;

/** Validate a saved or received offer list; nothing malformed gets through. */
export function parseOffers(raw: unknown): Offer[] {
  if (!Array.isArray(raw)) return [];
  const out: Offer[] = [];
  for (const o of raw.slice(0, 40) as Record<string, unknown>[]) {
    if (!o || typeof o !== 'object' || !isSpec(o.a) || !isSpec(o.r)) continue;
    if (o.b !== undefined && !isSpec(o.b)) continue;
    const max = Number(o.max);
    const uses = Number(o.uses);
    const xp = Number(o.xp);
    const level = Number(o.level);
    if (![max, uses, xp, level].every(Number.isFinite)) continue;
    out.push({
      a: [o.a[0], o.a[1]],
      ...(o.b ? { b: [o.b[0], o.b[1]] as StackSpec } : {}),
      r: [o.r[0], o.r[1]],
      max: Math.max(1, Math.min(64, Math.floor(max))),
      uses: Math.max(0, Math.min(64, Math.floor(uses))),
      xp: Math.max(0, Math.min(100, Math.floor(xp))),
      level: Math.max(1, Math.min(MAX_VILLAGER_LEVEL, Math.floor(level))),
    });
  }
  return out;
}

export function parseProfession(raw: unknown): Profession {
  return (PROFESSIONS as readonly unknown[]).includes(raw) ? (raw as Profession) : 'unemployed';
}
