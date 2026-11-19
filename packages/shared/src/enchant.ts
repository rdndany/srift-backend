import { B } from './blocks';
import type { ItemStack } from './inventory';
import { I, getItem, type ItemDef } from './items';
import { mulberry32 } from './noise';

/**
 * Enchantments, with the original game's rules: what each one does, which items can carry it, the power
 * a table has to offer for it, the weights that decide which one comes up, and which ones refuse to share
 * an item. The numbers are the original's; nothing here is art or text taken from it.
 *
 * An enchantment is a pair [id, level]. A stack carries a short sorted list of them (`ItemStack.ench`).
 * Enchanted books are `I.ENCHANTED_BOOK` stacks that carry the list without being tools.
 */
export type Enchant = [id: number, level: number];

export const ENCH = {
  PROTECTION: 1,
  FIRE_PROTECTION: 2,
  FEATHER_FALLING: 3,
  BLAST_PROTECTION: 4,
  PROJECTILE_PROTECTION: 5,
  RESPIRATION: 6,
  SHARPNESS: 7,
  KNOCKBACK: 8,
  FIRE_ASPECT: 9,
  LOOTING: 10,
  EFFICIENCY: 11,
  SILK_TOUCH: 12,
  UNBREAKING: 13,
  FORTUNE: 14,
  POWER: 15,
  PUNCH: 16,
  FLAME: 17,
  INFINITY: 18,
  MENDING: 19,
  LURE: 20,
  LUCK_OF_THE_SEA: 21,
} as const;

export type Group = 'armor' | 'helmet' | 'boots' | 'melee' | 'digger' | 'bow' | 'rod' | 'durable';

export interface EnchantDef {
  id: number;
  name: string;
  max: number;
  /** Chance weight when a table draws one (10 common, 5 uncommon, 2 rare, 1 very rare). */
  weight: number;
  /** Lowest and highest table power at which `level` can come up. */
  min(level: number): number;
  maxPower(level: number): number;
  /** The kinds of item it can be put on. */
  group: Group;
  /** Enchantments of one family cannot share an item. */
  family?: 'protection' | 'fortune' | 'mending';
  /** Only found in loot, never offered by a table. */
  treasure?: boolean;
}

const e = (
  id: number,
  name: string,
  max: number,
  weight: number,
  group: Group,
  min: (l: number) => number,
  span: (l: number) => number,
  extra: Partial<EnchantDef> = {},
): EnchantDef => ({ id, name, max, weight, group, min, maxPower: (l) => min(l) + span(l), ...extra });

export const ENCHANTS: readonly EnchantDef[] = [
  e(ENCH.PROTECTION, 'Protection', 4, 10, 'armor', (l) => 1 + (l - 1) * 11, () => 11, { family: 'protection' }),
  e(ENCH.FIRE_PROTECTION, 'Fire Protection', 4, 5, 'armor', (l) => 10 + (l - 1) * 8, () => 12, { family: 'protection' }),
  e(ENCH.FEATHER_FALLING, 'Feather Falling', 4, 5, 'boots', (l) => 5 + (l - 1) * 6, () => 10),
  e(ENCH.BLAST_PROTECTION, 'Blast Protection', 4, 2, 'armor', (l) => 5 + (l - 1) * 8, () => 12, { family: 'protection' }),
  e(ENCH.PROJECTILE_PROTECTION, 'Projectile Protection', 4, 5, 'armor', (l) => 3 + (l - 1) * 6, () => 15, { family: 'protection' }),
  e(ENCH.RESPIRATION, 'Respiration', 3, 2, 'helmet', (l) => 10 * l, () => 30),
  e(ENCH.SHARPNESS, 'Sharpness', 5, 10, 'melee', (l) => 1 + (l - 1) * 11, () => 20),
  e(ENCH.KNOCKBACK, 'Knockback', 2, 5, 'melee', (l) => 5 + (l - 1) * 20, () => 50),
  e(ENCH.FIRE_ASPECT, 'Fire Aspect', 2, 2, 'melee', (l) => 10 + (l - 1) * 20, () => 50),
  e(ENCH.LOOTING, 'Looting', 3, 2, 'melee', (l) => 15 + (l - 1) * 9, () => 50),
  e(ENCH.EFFICIENCY, 'Efficiency', 5, 10, 'digger', (l) => 1 + (l - 1) * 10, () => 50),
  e(ENCH.SILK_TOUCH, 'Silk Touch', 1, 1, 'digger', () => 15, () => 50, { family: 'fortune' }),
  e(ENCH.UNBREAKING, 'Unbreaking', 3, 5, 'durable', (l) => 5 + (l - 1) * 8, () => 50),
  e(ENCH.FORTUNE, 'Fortune', 3, 2, 'digger', (l) => 15 + (l - 1) * 9, () => 50, { family: 'fortune' }),
  e(ENCH.POWER, 'Power', 5, 10, 'bow', (l) => 1 + (l - 1) * 10, () => 15),
  e(ENCH.PUNCH, 'Punch', 2, 2, 'bow', (l) => 12 + (l - 1) * 20, () => 25),
  e(ENCH.FLAME, 'Flame', 1, 2, 'bow', () => 20, () => 30),
  e(ENCH.INFINITY, 'Infinity', 1, 1, 'bow', () => 20, () => 30, { family: 'mending' }),
  e(ENCH.LURE, 'Lure', 3, 2, 'rod', (l) => 15 + (l - 1) * 9, () => 50),
  e(ENCH.LUCK_OF_THE_SEA, 'Luck of the Sea', 3, 2, 'rod', (l) => 15 + (l - 1) * 9, () => 50),
  e(ENCH.MENDING, 'Mending', 1, 2, 'durable', (l) => 25 + (l - 1) * 25, () => 50, { family: 'mending', treasure: true }),
];

const BY_ID = new Map(ENCHANTS.map((d) => [d.id, d]));

/** The most enchantments one item can carry (a hostile save cannot make a huge list). */
export const MAX_ENCHANTS = 8;

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** "Sharpness V", or just "Silk Touch" for the ones with a single level. */
export function enchantName(id: number, level: number): string {
  const d = BY_ID.get(id);
  if (!d) return '';
  return d.max === 1 ? d.name : `${d.name} ${ROMAN[level] ?? level}`;
}

/** An enchantment's name without its level ("Sharpness"), or '' for an unknown id. */
export function enchantBaseName(id: number): string {
  return BY_ID.get(id)?.name ?? '';
}

// ---- custom names and prior work ---------------------------------------------------------------------------

/** Longest name an anvil will give an item. */
export const MAX_NAME = 35;
/** Highest "prior work" penalty an item can carry (more than any anvil will ever charge for). */
export const MAX_PENALTY = 1023;

/** A name that is safe to keep and show: printable characters only, trimmed, at most `MAX_NAME` long. */
export function cleanName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  // eslint-disable-next-line no-control-regex
  const s = raw.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u00a7<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME).trim();
  return s.length > 0 ? s : undefined;
}

/** A prior-work penalty read from a save or the network (a whole number from 1 up, or nothing). */
export function parsePenalty(raw: unknown): number | undefined {
  const n = typeof raw === 'number' ? raw : NaN;
  return Number.isInteger(n) && n > 0 ? Math.min(n, MAX_PENALTY) : undefined;
}

// ---- what an item is ---------------------------------------------------------------------------------------

/** Can this enchantment sit on this item (books take anything)? */
export function canCarry(item: ItemDef, d: EnchantDef): boolean {
  if (item.id === I.BOOK || item.id === I.ENCHANTED_BOOK) return true;
  switch (d.group) {
    case 'armor':
      return !!item.armor;
    case 'helmet':
      return item.armor?.slotIndex === 0;
    case 'boots':
      return item.armor?.slotIndex === 3;
    case 'melee':
      return item.tool?.kind === 'sword' || item.tool?.kind === 'axe';
    case 'digger':
      return !!item.tool && item.tool.kind !== 'sword';
    case 'bow':
      return item.use === 'bow';
    case 'rod':
      return item.use === 'fishing_rod';
    case 'durable':
      return item.durability > 0 && !item.shield;
  }
}

/** How easily an item takes enchantments (the original's "enchantability"); 0 means it cannot be enchanted. */
export function enchantability(id: number): number {
  const item = getItem(id);
  if (item.tool) return { wood: 15, stone: 5, iron: 14, gold: 22, diamond: 10 }[item.tool.material];
  if (item.armor) return { leather: 15, gold: 25, iron: 9, diamond: 10 }[item.armor.material];
  if (item.use === 'bow' || item.use === 'fishing_rod') return 1;
  if (id === I.BOOK) return 1;
  return 0;
}

/** The level of one enchantment on a stack (0 when it has none). */
export function levelOf(s: ItemStack | null | undefined, id: number): number {
  const list = s?.ench;
  if (!list) return 0;
  for (const [i, l] of list) if (i === id) return l;
  return 0;
}

/** A sorted, de-duplicated copy of an enchantment list, or undefined when it is empty. */
export function normalizeEnchants(list: readonly Enchant[]): Enchant[] | undefined {
  const m = new Map<number, number>();
  for (const [id, level] of list) {
    const d = BY_ID.get(id);
    if (!d || !Number.isInteger(level) || level < 1) continue;
    m.set(id, Math.max(m.get(id) ?? 0, Math.min(level, d.max)));
  }
  const out = [...m.entries()].sort((a, b) => a[0] - b[0]).slice(0, MAX_ENCHANTS) as Enchant[];
  return out.length > 0 ? out : undefined;
}

/** Read a list that came from a save or the network: anything unknown or out of range is dropped. */
export function parseEnchants(raw: unknown): Enchant[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list: Enchant[] = [];
  for (const x of raw.slice(0, 32)) {
    if (Array.isArray(x) && x.length >= 2 && typeof x[0] === 'number' && typeof x[1] === 'number') list.push([x[0], x[1]]);
  }
  return normalizeEnchants(list);
}

export function cloneEnchants(list: readonly Enchant[] | undefined): Enchant[] | undefined {
  return list && list.length > 0 ? list.map(([a, b]) => [a, b] as Enchant) : undefined;
}

export function sameEnchants(a: readonly Enchant[] | undefined, b: readonly Enchant[] | undefined): boolean {
  const x = a ?? [];
  const y = b ?? [];
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i][0] !== y[i][0] || x[i][1] !== y[i][1]) return false;
  return true;
}

/** Do two enchantments refuse to share an item? (the same one never conflicts with itself) */
export function conflicts(a: number, b: number): boolean {
  if (a === b) return false;
  const fa = BY_ID.get(a)?.family;
  return !!fa && fa === BY_ID.get(b)?.family;
}

/** A copy of the stack with these enchantments (replacing any it had). A plain book becomes an enchanted one. */
export function withEnchants(s: ItemStack, list: readonly Enchant[]): ItemStack {
  const ench = normalizeEnchants(list);
  const out: ItemStack = { id: s.id === I.BOOK && ench ? I.ENCHANTED_BOOK : s.id, count: s.count, damage: s.damage };
  if (ench) out.ench = ench;
  if (s.name) out.name = s.name;
  if (s.rc) out.rc = s.rc;
  return out;
}

// ---- the table -----------------------------------------------------------------------------------------------

/** Every enchantment a table could put on this item at this power: [definition, its highest fitting level]. */
function candidates(itemId: number, power: number): { d: EnchantDef; level: number }[] {
  const item = getItem(itemId);
  const out: { d: EnchantDef; level: number }[] = [];
  for (const d of ENCHANTS) {
    if (d.treasure || !canCarry(item, d)) continue;
    for (let l = d.max; l >= 1; l--) {
      if (power >= d.min(l) && power <= d.maxPower(l)) {
        out.push({ d, level: l });
        break;
      }
    }
  }
  return out;
}

function weighted<T extends { d: EnchantDef }>(list: readonly T[], rand: () => number): T {
  let total = 0;
  for (const x of list) total += x.d.weight;
  let pick = rand() * total;
  for (const x of list) {
    pick -= x.d.weight;
    if (pick < 0) return x;
  }
  return list[list.length - 1];
}

/**
 * The enchantments a table rolls for an item at the given cost, as the original does: the cost is padded by
 * the item's enchantability and a random factor, the enchantments that fit that power are weighted, and
 * more are added with a falling chance, each one removing the ones that conflict with it.
 */
export function rollEnchants(itemId: number, cost: number, rand: () => number): Enchant[] {
  const ability = enchantability(itemId);
  if (ability <= 0) return [];
  const quarter = Math.floor(ability / 4) + 1;
  let power = cost + 1 + Math.floor(rand() * quarter) + Math.floor(rand() * quarter);
  const factor = 1 + (rand() + rand() - 1) * 0.15;
  power = Math.max(1, Math.round(power * factor));

  let pool = candidates(itemId, power);
  const out: Enchant[] = [];
  if (pool.length === 0) return out;
  const first = weighted(pool, rand);
  out.push([first.d.id, first.level]);
  while (pool.length > 0 && rand() * 50 <= power) {
    const last = out[out.length - 1];
    pool = pool.filter((c) => c.d.id !== last[0] && !conflicts(c.d.id, last[0]));
    if (pool.length === 0) break;
    const next = weighted(pool, rand);
    out.push([next.d.id, next.level]);
    power = Math.floor(power / 2);
  }
  // A book only keeps one of what it rolled when it rolled several.
  if (itemId === I.BOOK && out.length > 1) out.splice(Math.floor(rand() * out.length), 1);
  return out;
}

export interface EnchantOffer {
  /** Level the player must have (0 = this slot offers nothing). Spending is the slot number plus one. */
  cost: number;
  /** The one enchantment shown as a hint. */
  clue: Enchant | null;
  /** What you get (the server keeps this; clients only see the clue). */
  list: Enchant[];
}

/** The most bookshelves that count. */
export const MAX_SHELVES = 15;

/**
 * The three offers of an enchanting table for an item: the same seed, shelf count and item always give the
 * same three. The seed changes whenever the player enchants something, so the offers change.
 */
export function enchantOffers(seed: number, shelves: number, itemId: number, alreadyEnchanted = false): EnchantOffer[] {
  const none = (): EnchantOffer => ({ cost: 0, clue: null, list: [] });
  if (alreadyEnchanted || enchantability(itemId) <= 0) return [none(), none(), none()];
  const s = Math.max(0, Math.min(MAX_SHELVES, Math.floor(shelves)));
  const rand = mulberry32(seed | 0);
  const base = 1 + Math.floor(rand() * 8) + (s >> 1) + Math.floor(rand() * (s + 1));
  const costs = [Math.max(Math.floor(base / 3), 1), Math.floor((base * 2) / 3) + 1, Math.max(base, s * 2)];
  return costs.map((c, slot) => {
    if (c < slot + 1) return none();
    const r = mulberry32((seed | 0) + slot * 7919);
    const list = rollEnchants(itemId, c, r);
    if (list.length === 0) return none();
    return { cost: c, clue: list[Math.floor(r() * list.length)], list };
  });
}

// ---- effects -------------------------------------------------------------------------------------------------------

/** Extra mining speed from Efficiency: level squared plus one, on blocks the tool is made for. */
export function efficiencyBonus(level: number): number {
  return level > 0 ? level * level + 1 : 0;
}

/** Sharpness adds half a point per level and half a point more. */
export function sharpnessBonus(level: number): number {
  return level > 0 ? 0.5 * level + 0.5 : 0;
}

/**
 * Unbreaking: how much of `amount` of wear actually lands. A tool uses a point with chance 1 / (level + 1);
 * armor keeps a bit more of its wear (60 percent + 40 percent / (level + 1)).
 */
export function wearAfterUnbreaking(amount: number, level: number, armor: boolean, rand: () => number): number {
  if (level <= 0 || amount <= 0) return amount;
  const chance = armor ? 0.6 + 0.4 / (level + 1) : 1 / (level + 1);
  let n = 0;
  for (let i = 0; i < amount; i++) if (rand() < chance) n++;
  return n;
}

export type ProtectionKind = 'all' | 'fire' | 'blast' | 'projectile' | 'fall';

/**
 * How much protection one worn stack gives against a kind of damage, in the original's "enchantment protection
 * factor" points (each is worth 4 percent, at most 20 points in all).
 */
export function protectionPoints(s: ItemStack | null, kind: ProtectionKind): number {
  if (!s || !s.ench) return 0;
  let p = 0;
  for (const [id, l] of s.ench) {
    if (id === ENCH.PROTECTION) p += l;
    else if (id === ENCH.FIRE_PROTECTION && kind === 'fire') p += 2 * l;
    else if (id === ENCH.BLAST_PROTECTION && kind === 'blast') p += 2 * l;
    else if (id === ENCH.PROJECTILE_PROTECTION && kind === 'projectile') p += 2 * l;
    else if (id === ENCH.FEATHER_FALLING && kind === 'fall') p += 3 * l;
  }
  return p;
}

/** The fraction of damage that still gets through, given the points of every worn piece. */
export function protectionFactor(points: number): number {
  return 1 - Math.min(20, Math.max(0, points)) * 0.04;
}

// ---- the anvil -------------------------------------------------------------------------------------------------------

/** Most levels an anvil will charge; beyond it the work is "too expensive". */
export const ANVIL_MAX_COST = 39;

/** What mends an item at the anvil: planks for wood, cobblestone for stone, an ingot or the gem for the rest. */
export function repairMaterial(id: number): number {
  const item = getItem(id);
  if (item.tool) return { wood: B.PLANKS, stone: B.COBBLE, iron: I.IRON_INGOT, gold: I.GOLD_INGOT, diamond: I.DIAMOND }[item.tool.material];
  if (item.armor) return { leather: I.LEATHER, gold: I.GOLD_INGOT, iron: I.IRON_INGOT, diamond: I.DIAMOND }[item.armor.material];
  return 0;
}

const multiplierOf = (d: EnchantDef): number => (d.weight >= 10 ? 1 : d.weight >= 5 ? 2 : d.weight >= 2 ? 4 : 8);

export interface AnvilResult {
  result: ItemStack;
  /** Levels it costs. */
  cost: number;
  /** How many of the right-hand stack are used up. */
  useRight: number;
}

/** What an item's prior work adds to the next job: 0, 1, 3, 7, 15, 31... */
export const penaltyOf = (s: ItemStack | null | undefined): number => s?.rc ?? 0;

/** The penalty an item carries after one more trip through an anvil. */
export const nextPenalty = (a: number, b: number): number => Math.min(MAX_PENALTY, Math.max(a, b) * 2 + 1);

/**
 * What an anvil makes of two stacks, or null when it makes nothing. Four things happen there, as in the
 * original: an item is repaired with its material (a quarter of its life per unit), two of the same item are
 * joined (their remaining life adds, with a little extra) and their enchantments are merged, an enchanted
 * book (or another enchanted item) is joined to an item to move its enchantments over, and an item is renamed
 * (one level). Every job costs the prior work of both items on top, and the result carries a penalty that
 * doubles (and adds one) each time, so an item that has been through the anvil many times gets too expensive.
 * A bare rename does not add to the penalty.
 */
export function anvilResult(left: ItemStack | null, right: ItemStack | null, rename: string | null = null): AnvilResult | null {
  if (!left || left.count !== 1) return null;
  const li = getItem(left.id);
  let cost = 0;
  let useRight = right ? right.count : 0;
  let damage = left.damage;
  const ench = new Map<number, number>((left.ench ?? []).map(([a, b]) => [a, b]));
  let changed = false;

  if (right) {
    const sameKind = right.id === left.id && right.count === 1;
    const fromBook = getItem(right.id).storesEnchants;

    if (li.durability > 0 && !fromBook && right.id === repairMaterial(left.id) && damage > 0 && right.id !== left.id) {
      const unit = Math.max(1, Math.floor(li.durability / 4));
      let units = 0;
      while (units < right.count && damage > 0) {
        damage = Math.max(0, damage - unit);
        units++;
      }
      useRight = units;
      cost += units;
      changed = true;
    } else if (sameKind || fromBook) {
      if (!fromBook && li.durability > 0 && damage > 0) {
        const left_ = li.durability - damage;
        const right_ = li.durability - right.damage;
        const total = Math.min(li.durability, left_ + right_ + Math.floor(li.durability * 0.12));
        const nd = li.durability - total;
        if (nd < damage) {
          damage = nd;
          cost += 2;
          changed = true;
        }
      }
      // The right-hand item's enchantments move over where they fit.
      for (const [id, rl] of right.ench ?? []) {
        const d = BY_ID.get(id);
        if (!d) continue;
        if (!canCarry(li, d)) continue;
        const have = ench.get(id) ?? 0;
        if ([...ench.keys()].some((o) => conflicts(id, o))) {
          cost += 1;
          continue;
        }
        let level = rl;
        if (have > 0) level = have === rl ? Math.min(d.max, rl + 1) : Math.max(have, rl);
        if (level === have) continue;
        ench.set(id, level);
        changed = true;
        let mult = multiplierOf(d);
        if (fromBook) mult = Math.max(1, Math.floor(mult / 2));
        cost += level * mult;
      }
    } else {
      return null;
    }
  }

  // A new name (or none, to clear the old one) is one more level.
  let name = left.name;
  const wanted = rename === null ? undefined : cleanName(rename);
  const renamed = rename !== null && wanted !== left.name && !(wanted === undefined && !left.name);
  if (renamed) {
    name = wanted;
    cost += 1;
  }
  if (!changed && !renamed) return null;

  const priorWork = penaltyOf(left) + penaltyOf(right);
  cost += priorWork;
  if (cost < 1) cost = 1;

  const base = left.id === I.BOOK && ench.size > 0 ? I.ENCHANTED_BOOK : left.id;
  const result: ItemStack = { id: base, count: 1, damage };
  const list = normalizeEnchants([...ench.entries()] as Enchant[]);
  if (list) result.ench = list;
  if (name) result.name = name;
  const rc = changed ? nextPenalty(penaltyOf(left), penaltyOf(right)) : penaltyOf(left);
  if (rc > 0) result.rc = rc;
  return { result, cost, useRight };
}

// ---- the grindstone ------------------------------------------------------------------------------------------------

export interface GrindResult {
  result: ItemStack;
  /** The experience it pays: somewhere from `xpMin` to `xpMax` (a roll the menu makes when the result is taken). */
  xpMin: number;
  xpMax: number;
}

/**
 * What a grindstone makes of up to two stacks: every enchantment comes off (and pays experience, the more the
 * better the enchantment), the prior-work penalty is forgotten, and two of the same worn item join into one with
 * their remaining life added and a little extra. A lone enchanted book turns back into a plain book. Null when
 * there is nothing to take off or join.
 */
export function grindResult(a: ItemStack | null, b: ItemStack | null): GrindResult | null {
  const one = a ?? b;
  if (!one) return null;
  let xp = 0;
  for (const s of [a, b]) for (const [id, level] of s?.ench ?? []) xp += BY_ID.get(id)?.min(level) ?? 0;
  const out: ItemStack = { id: one.id === I.ENCHANTED_BOOK ? I.BOOK : one.id, count: 1, damage: one.damage };
  if (one.name) out.name = one.name;
  if (a && b) {
    const item = getItem(a.id);
    if (a.id !== b.id || a.count !== 1 || b.count !== 1 || item.durability <= 0) return null;
    const total = Math.min(item.durability, item.durability - a.damage + (item.durability - b.damage) + Math.floor(item.durability * 0.05));
    out.damage = item.durability - total;
    if (xp === 0 && out.damage >= Math.max(a.damage, b.damage)) return null;
  } else if (one.count !== 1 || !one.ench) {
    return null;
  }
  return { result: out, xpMin: Math.ceil(xp / 2), xpMax: xp };
}
/** A random enchanted book or item for loot tables (any enchantment, treasure included, at a random level). */
export function randomEnchantedBook(rand: () => number): ItemStack {
  const d = ENCHANTS[Math.floor(rand() * ENCHANTS.length)];
  const level = 1 + Math.floor(rand() * d.max);
  return { id: I.ENCHANTED_BOOK, count: 1, damage: 0, ench: [[d.id, level]] };
}
