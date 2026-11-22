import { B } from './blocks';
import { MAX_LEVEL } from './experience';
import type { GearStat } from './gear';
import { cloneStack, type ItemStack } from './inventory';
import { I, accessoryOfItem, getItem, type ItemDef } from './items';

/**
 * Glyphs (the enchantments of the game). A glyph is a rune of power that is inscribed on a piece of equipment at a Runic Altar:
 * you choose which one, and what it asks for (lapis lazuli and Auren, and enough shelves of lore around the altar for its rank) is
 * shown before you pay. Nothing is rolled. A piece has a few sockets (more for the rarer ones) and each holds one glyph, which can be
 * raised rank by rank; a glyph is taken out again with the Erase button at the altar (or the grindstone).
 *
 * A glyph is a pair [id, rank]. A stack carries a short sorted list of them (`ItemStack.ench`, the same field the first enchantments
 * used, so every item that was saved keeps what it had). A Glyph Tome is an `I.ENCHANTED_BOOK` stack that carries the list without
 * being a tool: the anvil moves glyphs from a tome to a piece.
 *
 * Some glyphs are mechanics that were always in the game (a keener blade, a deeper breath, a faster pick); the rest add one of the stats
 * of the classes (see gear.ts: `glyphModifiers`), so they work for the class abilities too. Pure data and rules, no world.
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
  SIPHON: 22,
  VIGOR: 23,
  MIGHT: 24,
  HAWKEYE: 25,
  SORCERY: 26,
  FURY: 27,
  QUICKSTRIKE: 28,
  FOCUS: 29,
  SWIFTNESS: 30,
} as const;

/** The kinds of power a glyph is of: they colour its sigil, the glow of the piece that carries it, and tell a player what to expect. */
export type Element = 'ember' | 'tide' | 'storm' | 'verdant' | 'shadow' | 'radiant' | 'arcane';
export const ELEMENTS: Record<Element, { name: string; color: string }> = {
  ember: { name: 'Ember', color: '#ff8a3c' },
  tide: { name: 'Tide', color: '#4cc3ff' },
  storm: { name: 'Storm', color: '#ffd94a' },
  verdant: { name: 'Verdant', color: '#6ee06e' },
  shadow: { name: 'Shadow', color: '#b06cff' },
  radiant: { name: 'Radiant', color: '#fff1b0' },
  arcane: { name: 'Arcane', color: '#ff6ad5' },
};

/** What a glyph can be inscribed on. `worn` is anything that is worn or carried on the arm: armor, a shield, a ring or a necklace. */
export type Group = 'armor' | 'helmet' | 'boots' | 'melee' | 'caster' | 'ranged' | 'bow' | 'weapon' | 'digger' | 'rod' | 'durable' | 'worn' | 'jewelry';

export interface EnchantDef {
  id: number;
  name: string;
  /** The highest rank. */
  max: number;
  /** 1 (common) to 4 (rare): how dear it is, how much lore its ranks ask for and how much the anvil charges for it. */
  tier: 1 | 2 | 3 | 4;
  element: Element;
  /** The kinds of item it can be inscribed on (any one of them will do). */
  groups: readonly Group[];
  /** Glyphs of one family cannot share a piece. */
  family?: 'protection' | 'fortune';
  /** Only found (in loot, as a Glyph Tome), never inscribed at an altar. */
  treasure?: boolean;
  /** What it does at a rank, in a sentence (a glyph of a stat says it with `glyphStat`: the tooltips and the altar use the stat's own line instead). */
  effect(rank: number): string;
  /** The stat a glyph adds, by rank (`values[rank - 1]`): it goes into the class stats like the bonus stats of gear. */
  stat?: { stat: GearStat; values: readonly number[] };
}

const e = (
  id: number,
  name: string,
  max: number,
  tier: 1 | 2 | 3 | 4,
  element: Element,
  groups: Group | readonly Group[],
  effect: (rank: number) => string,
  extra: Partial<EnchantDef> = {},
): EnchantDef => ({ id, name, max, tier, element, groups: typeof groups === 'string' ? [groups] : groups, effect, ...extra });

const stat = (stat: GearStat, values: readonly number[]): Partial<EnchantDef> => ({ stat: { stat, values } });

// What the glyphs that change a number in the game do, and the numbers (the effects are further down: `sharpnessBonus`...).
const PROTECTION_STEP = 0.03; // each point of protection takes this share of the damage (at most `MAX_PROTECTION` points count)
const MAX_PROTECTION = 20;

/** The values of the glyphs of a stat, by id (by rank: the first number is rank I). */
const STAT_VALUES: Record<number, readonly number[]> = {
  [ENCH.VIGOR]: [2, 4, 6, 8],
  [ENCH.MIGHT]: [3, 6, 9, 12],
  [ENCH.HAWKEYE]: [3, 6, 9, 12],
  [ENCH.SORCERY]: [3, 6, 9, 12],
  [ENCH.FURY]: [2, 3, 5],
  [ENCH.QUICKSTRIKE]: [3, 6, 9],
  [ENCH.FOCUS]: [5, 10, 16, 24],
  [ENCH.SWIFTNESS]: [2, 4, 6],
};

export const ENCHANTS: readonly EnchantDef[] = [
  e(ENCH.PROTECTION, 'Aegis', 4, 1, 'radiant', 'armor', (r) => `${Math.round(r * PROTECTION_STEP * 100)}% less damage from everything (every piece you wear adds its own)`, { family: 'protection' }),
  e(ENCH.FIRE_PROTECTION, 'Cinderward', 4, 2, 'ember', 'armor', (r) => `${Math.round(2 * r * PROTECTION_STEP * 100)}% less damage from fire and lava`, { family: 'protection' }),
  e(ENCH.BLAST_PROTECTION, 'Shockward', 4, 3, 'storm', 'armor', (r) => `${Math.round(2 * r * PROTECTION_STEP * 100)}% less damage from explosions`, { family: 'protection' }),
  e(ENCH.PROJECTILE_PROTECTION, 'Deflection', 4, 2, 'storm', 'armor', (r) => `${Math.round(2 * r * PROTECTION_STEP * 100)}% less damage from arrows and bolts`, { family: 'protection' }),
  e(ENCH.FEATHER_FALLING, 'Windstep', 4, 2, 'storm', 'boots', (r) => `${Math.round(3 * r * PROTECTION_STEP * 100)}% less damage from falling`),
  e(ENCH.RESPIRATION, 'Deepbreath', 3, 3, 'tide', 'helmet', (r) => `Your breath lasts ${r + 1} times as long under water`),
  e(ENCH.SHARPNESS, 'Keen Edge', 5, 1, 'ember', 'melee', (r) => `+${sharpnessBonus(r)} damage with every blow`),
  e(ENCH.KNOCKBACK, 'Stagger', 2, 2, 'storm', 'melee', (r) => `Blows throw foes back ${r === 1 ? 'a little' : 'a long way'} further`),
  e(ENCH.FIRE_ASPECT, 'Emberbrand', 2, 3, 'ember', 'melee', (r) => `Sets what you hit alight for ${4 * r} seconds`),
  e(ENCH.LOOTING, 'Plunder', 3, 3, 'shadow', 'melee', (r) => `Foes you strike down drop more (+${r})`),
  e(ENCH.SIPHON, 'Siphon', 3, 3, 'shadow', 'melee', (r) => `Heals you for ${Math.round(siphonShare(r) * 100)}% of the damage your blows do`),
  e(ENCH.EFFICIENCY, 'Delving', 5, 1, 'verdant', 'digger', (r) => `Mines faster on what the tool is made for (+${efficiencyBonus(r)} speed)`),
  e(ENCH.SILK_TOUCH, 'Gentle Hand', 1, 3, 'verdant', 'digger', () => 'Blocks drop whole, as they were (ice, stone, glass)', { family: 'fortune' }),
  e(ENCH.FORTUNE, 'Prospecting', 3, 3, 'verdant', 'digger', (r) => `Ores and crops give more (rank ${r})`, { family: 'fortune' }),
  e(ENCH.UNBREAKING, 'Temper', 3, 2, 'radiant', 'durable', (r) => `Wears up to ${Math.round((1 - 1 / (r + 1)) * 100)}% slower`),
  e(ENCH.POWER, 'Hawkshot', 5, 1, 'storm', 'bow', (r) => `Arrows hit ${25 * (r + 1)}% harder`),
  e(ENCH.PUNCH, 'Impact', 2, 3, 'storm', 'bow', (r) => `Arrows throw foes back ${r === 1 ? 'a little' : 'a long way'} further`),
  e(ENCH.FLAME, 'Flare', 1, 3, 'ember', 'bow', () => 'Arrows set what they hit alight'),
  e(ENCH.INFINITY, 'Bottomless Quiver', 1, 4, 'shadow', 'bow', () => 'Shooting never uses up an arrow'),
  e(ENCH.MENDING, 'Renewal', 1, 4, 'radiant', 'durable', () => 'The experience you gather mends it', { treasure: true }),
  e(ENCH.LURE, 'Siren Call', 3, 2, 'tide', 'rod', (r) => `Fish bite ${5 * r} seconds sooner`),
  e(ENCH.LUCK_OF_THE_SEA, 'Tidefortune', 3, 3, 'tide', 'rod', (r) => `Better catches and more treasure (rank ${r})`),
  e(ENCH.VIGOR, 'Vigor', 4, 1, 'verdant', 'worn', (r) => `+${STAT_VALUES[ENCH.VIGOR][r - 1]} Health`, stat('vit', STAT_VALUES[ENCH.VIGOR])),
  e(ENCH.MIGHT, 'Might', 4, 1, 'ember', 'melee', (r) => `+${STAT_VALUES[ENCH.MIGHT][r - 1]}% Melee Damage`, stat('might', STAT_VALUES[ENCH.MIGHT])),
  e(ENCH.HAWKEYE, 'Hawkeye', 4, 1, 'storm', 'ranged', (r) => `+${STAT_VALUES[ENCH.HAWKEYE][r - 1]}% Ranged Damage`, stat('aim', STAT_VALUES[ENCH.HAWKEYE])),
  e(ENCH.SORCERY, 'Sorcery', 4, 1, 'arcane', 'caster', (r) => `+${STAT_VALUES[ENCH.SORCERY][r - 1]}% Spell Damage`, stat('arcane', STAT_VALUES[ENCH.SORCERY])),
  e(ENCH.FURY, 'Fury', 3, 2, 'ember', 'weapon', (r) => `+${STAT_VALUES[ENCH.FURY][r - 1]}% Critical Chance`, stat('crit', STAT_VALUES[ENCH.FURY])),
  e(ENCH.QUICKSTRIKE, 'Quickstrike', 3, 2, 'storm', 'weapon', (r) => `+${STAT_VALUES[ENCH.QUICKSTRIKE][r - 1]}% Attack Speed`, stat('haste', STAT_VALUES[ENCH.QUICKSTRIKE])),
  e(ENCH.FOCUS, 'Focus', 4, 1, 'arcane', ['caster', 'jewelry'], (r) => `+${STAT_VALUES[ENCH.FOCUS][r - 1]} Maximum Resource`, stat('focus', STAT_VALUES[ENCH.FOCUS])),
  e(ENCH.SWIFTNESS, 'Swiftness', 3, 2, 'storm', ['boots', 'jewelry'], (r) => `+${STAT_VALUES[ENCH.SWIFTNESS][r - 1]}% Movement Speed`, stat('swift', STAT_VALUES[ENCH.SWIFTNESS])),
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

const isMelee = (item: ItemDef): boolean => item.tool?.kind === 'sword' || item.tool?.kind === 'axe' || item.weapon?.kind === 'melee';
const isCaster = (item: ItemDef): boolean => item.weapon?.kind === 'spell' || item.id === I.ORB;
const isRanged = (item: ItemDef): boolean => item.use === 'bow' || item.use === 'crossbow' || item.weapon?.kind === 'ranged';

function fits(item: ItemDef, g: Group): boolean {
  switch (g) {
    case 'armor':
      return !!item.armor;
    case 'helmet':
      return item.armor?.slotIndex === 0;
    case 'boots':
      return item.armor?.slotIndex === 3;
    case 'melee':
      return isMelee(item);
    case 'caster':
      return isCaster(item);
    case 'ranged':
      return isRanged(item);
    case 'weapon':
      return isMelee(item) || isCaster(item) || isRanged(item);
    case 'digger':
      return !!item.tool && item.tool.kind !== 'sword';
    case 'bow':
      return item.use === 'bow';
    case 'rod':
      return item.use === 'fishing_rod';
    case 'durable':
      return item.durability > 0;
    case 'worn':
      return !!item.armor || item.shield || accessoryOfItem(item.id) !== null;
    case 'jewelry':
      return accessoryOfItem(item.id) !== null;
  }
}

/** Can this glyph sit on this item (a book takes anything)? */
export function canCarry(item: ItemDef, d: EnchantDef): boolean {
  if (item.id === I.BOOK || item.id === I.ENCHANTED_BOOK) return true;
  return d.groups.some((g) => fits(item, g));
}

const INSCRIBABLE = new Map<number, boolean>();
/** Can anything be inscribed on this item at an altar (equipment, tools, rings, and a plain book to make a Glyph Tome)? */
export function canInscribe(id: number): boolean {
  let ok = INSCRIBABLE.get(id);
  if (ok === undefined) {
    const item = getItem(id);
    ok = id === I.BOOK || (!item.storesEnchants && ENCHANTS.some((d) => !d.treasure && canCarry(item, d)));
    INSCRIBABLE.set(id, ok);
  }
  return ok;
}

/**
 * How many glyphs a piece can hold: one, and one more for each rarity a found piece has (an epic piece holds four). A ring or necklace of
 * diamond holds two, a book one.
 */
export function glyphSockets(s: ItemStack | null | undefined): number {
  if (!s) return 0;
  const jewel = accessoryOfItem(s.id);
  if (jewel) return jewel.material === 'diamond' ? 2 : 1;
  return 1 + (s.gear && s.gear.r > 0 ? s.gear.r : 0);
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

// ---- the altar ---------------------------------------------------------------------------------------------------------

/** The most shelves of books around an altar that count. */
export const MAX_SHELVES = 15;

const TIER_PRICE = [0, 30, 70, 160, 420];
/** The shelves of lore an altar needs for each rank (before the extra a rarer glyph asks). */
const LORE_RANK = [0, 2, 5, 8, 12];

export interface GlyphPrice {
  /** Auren (the coins of the realm) and lapis lazuli. */
  auren: number;
  lapis: number;
}

/** What inscribing a glyph at a rank costs. */
export function glyphPrice(d: EnchantDef, rank: number): GlyphPrice {
  const r = Math.max(1, Math.min(d.max, Math.floor(rank)));
  return { auren: Math.round((TIER_PRICE[d.tier] * r * (1 + 0.6 * (r - 1))) / 5) * 5, lapis: r + (d.tier >= 3 ? 1 : 0) };
}

/** The shelves of books around the altar that a rank needs: a rank of a rarer glyph needs more of them. */
export function glyphLore(d: EnchantDef, rank: number): number {
  const r = Math.max(1, Math.min(d.max, Math.floor(rank)));
  return Math.min(MAX_SHELVES, LORE_RANK[r - 1] + (d.tier >= 3 ? (d.tier - 2) * 2 : 0));
}

const TIER_CHANCE = [0, 85, 75, 65, 55];
/** The chance (percent, 15 to 95) that inscribing a glyph at a rank takes: rarer glyphs and higher ranks fail more, and lore beyond what the rank needs (more shelves) helps. */
export function inscribeChance(d: EnchantDef, rank: number, shelves: number): number {
  const r = Math.max(1, Math.min(d.max, Math.floor(rank)));
  const spare = Math.max(0, Math.min(MAX_SHELVES, shelves) - glyphLore(d, r));
  return Math.max(15, Math.min(95, Math.round(TIER_CHANCE[d.tier] - (r - 1) * 8 + spare)));
}

/** What a failed inscription costs: all the lapis and half the Auren (the piece is never harmed). */
export function failedPrice(price: GlyphPrice): GlyphPrice {
  return { auren: Math.ceil(price.auren / 2), lapis: price.lapis };
}

/** What a glyph is worth to the grindstone, which pays experience for the glyphs it takes off. */
export function glyphWorth(id: number, rank: number): number {
  const d = BY_ID.get(id);
  return d ? Math.max(1, Math.round((TIER_PRICE[d.tier] / 8) * rank)) : 0;
}

/** The stat a glyph of a stat adds at a rank, or null for the others. */
export function glyphStat(id: number, rank: number): [GearStat, number] | null {
  const d = BY_ID.get(id);
  const v = d?.stat?.values[Math.min(rank, d.stat.values.length) - 1];
  return d?.stat && v !== undefined ? [d.stat.stat, v] : null;
}

/** The element of the glyphs a piece carries that it has most of (by rank), or null for a piece with none: the colour it glows with. */
export function dominantElement(s: ItemStack | null | undefined): Element | null {
  if (!s?.ench || s.ench.length === 0) return null;
  const score = new Map<Element, number>();
  for (const [id, rank] of s.ench) {
    const d = BY_ID.get(id);
    if (d) score.set(d.element, (score.get(d.element) ?? 0) + rank * d.tier);
  }
  let best: Element | null = null;
  let top = 0;
  for (const [el, v] of score) if (v > top) {
    best = el;
    top = v;
  }
  return best;
}

/** The elements in a fixed order: a glow is sent over the network as 1 + the place of its element here. */
export const ELEMENT_LIST = Object.keys(ELEMENTS) as Element[];

/** What glows on a piece, as a small number for the network: 0 for a piece with no glyph, else 1 + the place of its strongest element. */
export function glowCode(s: ItemStack | null | undefined): number {
  const el = dominantElement(s);
  return el ? ELEMENT_LIST.indexOf(el) + 1 : 0;
}

/** The colour (CSS hex) a glow code stands for, or null for none or a number that is not one. */
export function glowColor(code: number | undefined): string | null {
  const el = code ? ELEMENT_LIST[code - 1] : undefined;
  return el ? ELEMENTS[el].color : null;
}

/** Why a glyph cannot be inscribed just now (the first reason that applies), or `ok`. */
export type GlyphState = 'ok' | 'maxed' | 'sockets' | 'conflict' | 'lore' | 'lapis' | 'auren';

export interface GlyphOption {
  def: EnchantDef;
  /** The rank it has on the piece now (0: not inscribed), and the rank this would make it. */
  have: number;
  rank: number;
  price: GlyphPrice;
  /** Shelves of lore the rank needs. */
  lore: number;
  /** The chance (percent) that it takes: 100 in creative. A failure costs `failedPrice` and leaves the piece as it was. */
  chance: number;
  state: GlyphState;
  /** For `conflict`: the glyph in the way. */
  blockedBy?: number;
}

export interface AltarContext {
  shelves: number;
  lapis: number;
  auren: number;
  /** Creative asks for nothing. */
  creative?: boolean;
}

/**
 * Everything an altar offers for a piece: every glyph that fits it, each with the rank it would make, its price and what stands in the way
 * (or `ok`). The ones that can be raised or inscribed now come first, then the rest from the cheapest tier up. A glyph found only in
 * loot (a treasure) is not offered. Nothing here is hidden or rolled, so the client works it out for itself and the server asks again.
 */
export function glyphOptions(item: ItemStack | null | undefined, ctx: AltarContext): GlyphOption[] {
  if (!item || item.count !== 1 || !canInscribe(item.id)) return [];
  const def = getItem(item.id);
  const have = new Map<number, number>((item.ench ?? []).map(([a, b]) => [a, b]));
  const sockets = glyphSockets(item);
  const out: GlyphOption[] = [];
  for (const d of ENCHANTS) {
    if (d.treasure || !canCarry(def, d)) continue;
    const now = have.get(d.id) ?? 0;
    const rank = Math.min(d.max, now + 1);
    const price = glyphPrice(d, rank);
    const lore = glyphLore(d, rank);
    let state: GlyphState = 'ok';
    let blockedBy: number | undefined;
    if (now >= d.max) state = 'maxed';
    else if (now === 0 && have.size >= sockets) state = 'sockets';
    else if (now === 0 && [...have.keys()].some((o) => conflicts(d.id, o))) {
      state = 'conflict';
      blockedBy = [...have.keys()].find((o) => conflicts(d.id, o));
    } else if (!ctx.creative) {
      if (ctx.shelves < lore) state = 'lore';
      else if (ctx.lapis < price.lapis) state = 'lapis';
      else if (ctx.auren < price.auren) state = 'auren';
    }
    out.push({ def: d, have: now, rank, price, lore, chance: ctx.creative ? 100 : inscribeChance(d, rank, ctx.shelves), state, ...(blockedBy !== undefined ? { blockedBy } : {}) });
  }
  const order = (o: GlyphOption): number => (o.state === 'ok' ? 0 : o.state === 'lapis' || o.state === 'auren' ? 1 : o.state === 'lore' ? 2 : 3);
  return out.sort((a, b) => order(a) - order(b) || (b.have > 0 ? 1 : 0) - (a.have > 0 ? 1 : 0) || a.def.tier - b.def.tier || a.def.id - b.def.id);
}

/**
 * Glyphs found on a piece in the wild (a catch from the water, a chest): `count` of them, chosen among what fits, never two that conflict
 * and never one that only comes as a treasure, each at a random rank (the common ones more often than the dear ones).
 */
export function wildGlyphs(itemId: number, rand: () => number, count = 1): Enchant[] {
  const item = getItem(itemId);
  let pool = ENCHANTS.filter((d) => !d.treasure && canCarry(item, d));
  const out: Enchant[] = [];
  while (out.length < count && pool.length > 0) {
    const weight = (d: EnchantDef): number => [0, 10, 5, 2, 1][d.tier];
    let pick = rand() * pool.reduce((n, d) => n + weight(d), 0);
    let d = pool[0];
    for (const x of pool) {
      pick -= weight(x);
      d = x;
      if (pick < 0) break;
    }
    out.push([d.id, 1 + Math.floor(rand() * Math.max(1, d.max - 1))]);
    pool = pool.filter((x) => x.id !== d.id && !conflicts(x.id, d.id));
  }
  return out;
}

/** The piece with one glyph more (or one rank more), or null when it cannot take it. A plain book becomes a Glyph Tome. */
export function inscribed(item: ItemStack, id: number): ItemStack | null {
  const d = BY_ID.get(id);
  if (!d || d.treasure || item.count !== 1 || !canInscribe(item.id) || !canCarry(getItem(item.id), d)) return null;
  const list = (item.ench ?? []).map(([a, b]) => [a, b] as Enchant);
  const at = list.findIndex(([a]) => a === id);
  if (at >= 0) {
    if (list[at][1] >= d.max) return null;
    list[at] = [id, list[at][1] + 1];
  } else {
    if (list.length >= glyphSockets(item) || list.some(([o]) => conflicts(id, o))) return null;
    list.push([id, 1]);
  }
  return withEnchants(item, list);
}

/** The piece with a glyph taken off it (all of its ranks), or null when it did not have it. */
export function erased(item: ItemStack, id: number): ItemStack | null {
  if (!item.ench || !item.ench.some(([a]) => a === id)) return null;
  const out = withEnchants(item, item.ench.filter(([a]) => a !== id));
  // A Glyph Tome with nothing left on it is a plain book again.
  if (item.id === I.ENCHANTED_BOOK && !out.ench) out.id = I.BOOK;
  return out;
}

// ---- effects -------------------------------------------------------------------------------------------------------

/** Extra mining speed from Delving: rank squared plus one, on blocks the tool is made for. */
export function efficiencyBonus(level: number): number {
  return level > 0 ? level * level + 1 : 0;
}

/** Keen Edge adds half a point per rank and half a point more. */
export function sharpnessBonus(level: number): number {
  return level > 0 ? 0.5 * level + 0.5 : 0;
}

/** The share of the damage of a blow that a Siphon of this rank gives back to the one who struck it. */
export function siphonShare(level: number): number {
  return level > 0 ? 0.04 * level : 0;
}

/**
 * Temper: how much of `amount` of wear actually lands. A tool uses a point with chance 1 / (level + 1);
 * armor keeps a bit more of its wear (60 percent + 40 percent / (level + 1)).
 */
export function wearAfterUnbreaking(amount: number, level: number, armor: boolean, rand: () => number): number {
  if (level <= 0 || amount <= 0) return amount;
  const chance = armor ? 0.6 + 0.4 / (level + 1) : 1 / (level + 1);
  let n = 0;
  for (let i = 0; i < amount; i++) if (rand() < chance) n++;
  return n;
}

/**
 * Why an anvil makes nothing of a piece and a Glyph Tome, in words for the player (null when the pair is not that, or it works).
 */
export function tomeBlocked(left: ItemStack | null, right: ItemStack | null): string | null {
  if (!left || !right || left.count !== 1 || !getItem(right.id).storesEnchants || !right.ench?.length) return null;
  if (anvilResult(left, right)) return null;
  const li = getItem(left.id);
  const defs = right.ench.map(([id]) => BY_ID.get(id)).filter((d): d is EnchantDef => !!d);
  const fitting = defs.filter((d) => canCarry(li, d));
  const name = li.name;
  if (!fitting.length) return `None of this tome's glyphs can go on a ${name}.`;
  if (fitting.every((d) => (left.ench ?? []).some(([o]) => conflicts(d.id, o)))) return `This ${name} already carries a glyph that clashes with the tome's.`;
  if ((left.ench?.length ?? 0) >= glyphSockets(left)) return `This ${name} has no free glyph socket.`;
  return `This ${name} already has what the tome offers.`;
}

export type ProtectionKind = 'all' | 'fire' | 'blast' | 'projectile' | 'fall';

/**
 * How much protection one worn stack gives against a kind of damage, in points (each is worth 3 percent of the damage, and at most
 * 20 points count in all, so a hero can never take less than two fifths).
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
  return 1 - Math.min(MAX_PROTECTION, Math.max(0, points)) * PROTECTION_STEP;
}

// ---- the anvil -------------------------------------------------------------------------------------------------------

/** Most levels an anvil will charge; beyond it the work is "too expensive". It is the level cap: a price above it could never be paid. */
export const ANVIL_MAX_COST = MAX_LEVEL;

/** What mends an item at the anvil: planks for wood, cobblestone for stone, an ingot or the gem for the rest. */
export function repairMaterial(id: number): number {
  const item = getItem(id);
  if (item.tool) return { wood: B.PLANKS, stone: B.COBBLE, iron: I.IRON_INGOT, gold: I.GOLD_INGOT, diamond: I.DIAMOND }[item.tool.material];
  if (item.armor) return { leather: I.LEATHER, gold: I.GOLD_INGOT, iron: I.IRON_INGOT, diamond: I.DIAMOND }[item.armor.material];
  return 0;
}

const multiplierOf = (d: EnchantDef): number => [1, 2, 4, 8][d.tier - 1];

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
        // A glyph the piece has no socket for stays on the tome.
        if (have === 0 && ench.size >= Math.max(glyphSockets(left), left.ench?.length ?? 0)) continue;
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
  // Everything else on the piece (its rolled stats, jewels, upgrade) stays as it was.
  const result: ItemStack = { ...cloneStack(left), id: base, count: 1, damage };
  delete result.ench;
  delete result.name;
  delete result.rc;
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
  for (const s of [a, b]) for (const [id, level] of s?.ench ?? []) xp += glyphWorth(id, level);
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
/** A random Glyph Tome for loot tables: any glyph (a treasure one too), at a random rank, the rarer ones less often. */
export function randomEnchantedBook(rand: () => number): ItemStack {
  const weight = (d: EnchantDef): number => [0, 10, 5, 2, 1][d.tier];
  let pick = rand() * ENCHANTS.reduce((n, d) => n + weight(d), 0);
  let d = ENCHANTS[0];
  for (const x of ENCHANTS) {
    pick -= weight(x);
    d = x;
    if (pick < 0) break;
  }
  const level = 1 + Math.floor(rand() * d.max);
  return { id: I.ENCHANTED_BOOK, count: 1, damage: 0, ench: [[d.id, level]] };
}
