import { MOB_TIER_INFO, mobTier } from './mobTier';
import { CLASSES, CLASS_IDS, CLASS_LEVELS, isClassId, type ClassId, type StatModifier } from './classes';
import { ENCHANTS, glyphStat } from './enchant';
import type { ItemStack } from './inventory';
import { NECKLACE_LEVEL, RING_LEVEL } from './equipLevel';
import { I, accessoryOfItem, armorId, getItem, toolId } from './items';
import type { MobKind } from './mobs';

/**
 * Gear with a character of its own, as in the MMORPGs: the plain pieces of the material tiers (leather, iron, diamond...) are
 * what anyone can make, and a piece that was found can be better. It has a rarity (uncommon, rare or epic), a level you must
 * have reached, perhaps a class it was made for, and one to three bonus stats rolled when it was found. The stats feed
 * `StatModifier`s into the class, which already knew how to take them.
 *
 * Pure data and rules, no world: the dice come in from the caller, so the server's own random source decides. A stack
 * without `gear` is a plain item and nothing here changes it.
 */

export const GEAR_STATS = ['vit', 'might', 'aim', 'arcane', 'crit', 'haste', 'ward', 'focus', 'swift'] as const;
export type GearStat = (typeof GEAR_STATS)[number];
export const isGearStat = (x: unknown): x is GearStat => typeof x === 'string' && (GEAR_STATS as readonly string[]).includes(x);

export type Rarity = 1 | 2 | 3;

export interface RarityDef {
  id: Rarity;
  name: string;
  /** How many bonus stats a piece of this rarity has. */
  stats: number;
  /** What its stat values are multiplied by. */
  power: number;
  /** Sells for this many times the plain price (and a little more for each level). */
  value: number;
}

export const RARITIES: readonly RarityDef[] = [
  { id: 1, name: 'Uncommon', stats: 1, power: 1, value: 3 },
  { id: 2, name: 'Rare', stats: 2, power: 1.25, value: 7 },
  { id: 3, name: 'Epic', stats: 3, power: 1.55, value: 16 },
];

export const rarityDef = (r: number): RarityDef => RARITIES[Math.min(RARITIES.length, Math.max(1, Math.floor(r))) - 1];

/**
 * The rolled part of a piece of gear. Treated as read-only: replace, never edit.
 *
 * The jewels (see jewels.ts) work on any piece that can carry gear, found or plain: `u` is the upgrade (+1..+9), which grows every stat of the piece and `o`
 * the extra attribute a Jewel of Bloom adds. A plain piece that has been through a jewel carries a roll with rarity 0, no
 * stats of its own and no level to reach: it has no rarity, only what the jewels gave it.
 */
export interface GearRoll {
  r: Rarity | 0;
  /** The class level it needs to be worn. */
  l: number;
  /** The class it was made for (it does nothing for the others). Absent: anyone. */
  c?: ClassId;
  s: [GearStat, number][];
  /** The upgrade, +1 to `UPGRADE_MAX` (absent: +0): the stats of the piece grow with it. */
  u?: number;
  /** The extra attribute from a Jewel of Bloom: one more stat, on top of the rolled ones. */
  o?: [GearStat, number];
}

/** The highest upgrade the jewels give a piece: from here on it is made in the crafting grid (see `forgeUpgrade`). */
export const PLUS_MAX = 9;
/** The highest upgrade a piece can have. */
export const UPGRADE_MAX = 13;

interface StatInfo {
  /** The tooltip line, with the value filled in. */
  line: (v: number, resource: string) => string;
  /** One point of it at level 1, before the piece's weight and rarity. */
  unit: number;
  /** The most a piece can have of it. */
  cap: number;
  /** The tail of the piece's name: "Greatsword of Might". */
  suffix: string;
  mod: (v: number) => StatModifier;
}

const pct = (v: number): number => 1 + v / 100;

export const STAT_INFO: Record<GearStat, StatInfo> = {
  vit: { line: (v) => `+${v} Health`, unit: 1.4, cap: 20, suffix: 'of Vigor', mod: (v) => ({ health: v }) },
  might: { line: (v) => `+${v}% Melee Damage`, unit: 3, cap: 40, suffix: 'of Might', mod: (v) => ({ damage: { melee: pct(v) } }) },
  aim: { line: (v) => `+${v}% Ranged Damage`, unit: 3, cap: 40, suffix: 'of the Hawk', mod: (v) => ({ damage: { ranged: pct(v) } }) },
  arcane: { line: (v) => `+${v}% Spell Damage`, unit: 3, cap: 40, suffix: 'of Sorcery', mod: (v) => ({ damage: { spell: pct(v) } }) },
  crit: { line: (v) => `+${v}% Critical Chance`, unit: 1.4, cap: 12, suffix: 'of Fury', mod: (v) => ({ critChance: v / 100 }) },
  haste: { line: (v) => `+${v}% Attack Speed`, unit: 1.8, cap: 20, suffix: 'of Haste', mod: (v) => ({ attackSpeed: pct(v) }) },
  ward: { line: (v) => `-${v}% Damage Taken`, unit: 1.6, cap: 20, suffix: 'of the Bulwark', mod: (v) => ({ damageTaken: 1 - v / 100 }) },
  focus: { line: (v, resource) => `+${v} Maximum ${resource}`, unit: 4, cap: 80, suffix: 'of Focus', mod: (v) => ({ resource: v, resourceRegen: v / 12 }) },
  swift: { line: (v) => `+${v}% Movement Speed`, unit: 1.2, cap: 8, suffix: 'of the Wind', mod: (v) => ({ moveSpeed: pct(v) }) },
};

const OPTION_POWER = 1.1;

/** The stats a piece made for a class may roll (the first one of a weapon is fixed by what the weapon is). */
const POOL: Record<ClassId | 'any', readonly GearStat[]> = {
  warrior: ['vit', 'might', 'ward', 'crit', 'haste'],
  mage: ['arcane', 'focus', 'vit', 'ward', 'crit'],
  ranger: ['aim', 'crit', 'haste', 'swift', 'vit'],
  any: ['vit', 'ward', 'crit', 'haste', 'focus', 'swift'],
};

const LEVEL_GROWTH = 0.12;

// ---- what can have gear stats ---------------------------------------------------------------------------------------

/** May this item carry rolled gear stats? Armor, shields, the class weapons, swords, bows and the off-hand pieces. */
export function canRollGear(id: number): boolean {
  const item = getItem(id);
  return !!item.armor || item.shield || !!item.weapon || item.offhand || item.tool?.kind === 'sword' || item.use === 'bow';
}

/** How much of the stats a kind of piece carries: a chestplate more than boots, a weapon more than all. */
function slotWeight(id: number): number {
  const item = getItem(id);
  if (item.armor) return [0.75, 1.2, 1, 0.65][item.armor.slotIndex] ?? 1;
  if (item.weapon || item.tool || item.use === 'bow') return 1.3;
  if (item.shield) return 1;
  return 0.9;
}

/** The stat a weapon is for, which it always has (a greatsword: might; a bow: aim; a staff: arcane). Armor has none. */
export function primaryStat(id: number): GearStat | null {
  const item = getItem(id);
  if (item.weapon) return item.weapon.kind === 'melee' ? 'might' : item.weapon.kind === 'ranged' ? 'aim' : 'arcane';
  if (item.tool?.kind === 'sword') return 'might';
  if (item.use === 'bow') return 'aim';
  if (id === I.ORB) return 'arcane';
  return null;
}

// ---- rolling --------------------------------------------------------------------------------------------------------

const clampLevel = (l: number): number => Math.min(CLASS_LEVELS.max, Math.max(1, Math.floor(l)));

/**
 * Roll the stats of a piece. `cls` makes it a piece for that class (its stats come from that class's pool and it works for no
 * other); without it the piece is for anyone. Null when the item cannot carry gear.
 */
export function rollGear(id: number, level: number, rarity: Rarity, cls: ClassId | undefined, rand: () => number): GearRoll | null {
  if (!canRollGear(id)) return null;
  const def = rarityDef(rarity);
  const l = clampLevel(level);
  const growth = 1 + LEVEL_GROWTH * (l - 1);
  const pool = [...POOL[cls ?? 'any']];
  const stats: GearStat[] = [];
  const first = primaryStat(id);
  if (first) stats.push(first);
  while (stats.length < def.stats && pool.length > 0) {
    const k = Math.floor(rand() * pool.length);
    const [pick] = pool.splice(k, 1);
    if (!stats.includes(pick)) stats.push(pick);
  }
  const s: [GearStat, number][] = stats.slice(0, def.stats).map((stat) => {
    const info = STAT_INFO[stat];
    const v = Math.round(info.unit * growth * slotWeight(id) * def.power * (0.8 + rand() * 0.4));
    return [stat, Math.min(info.cap, Math.max(1, v))];
  });
  return { r: def.id, l, ...(cls ? { c: cls } : {}), s };
}

/** A fresh stack of `id` with its stats rolled (a plain stack if it cannot carry any). */
export function gearStack(id: number, level: number, rarity: Rarity, cls: ClassId | undefined, rand: () => number): ItemStack {
  const stack: ItemStack = { id, count: 1, damage: 0 };
  const gear = rollGear(id, level, rarity, cls, rand);
  if (gear) stack.gear = gear;
  return stack;
}

// ---- what the jewels give -----------------------------------------------------------------------------------------

/**
 * What an upgrade of `u` gives a piece that has no stats of its own to grow: a weapon more of the damage it is for (and from
 * +7 a little critical chance), armor and shields health and less damage taken, anything else health. The heavier pieces get more.
 */
export function plusStats(id: number, u: number): [GearStat, number][] {
  const level = Math.min(UPGRADE_MAX, Math.floor(u));
  if (!(level > 0) || !canRollGear(id)) return [];
  const w = slotWeight(id);
  const item = getItem(id);
  const out: [GearStat, number][] = [];
  const give = (stat: GearStat, v: number): void => {
    out.push([stat, Math.min(STAT_INFO[stat].cap, Math.max(1, Math.round(v)))]);
  };
  const first = primaryStat(id);
  if (first) {
    give(first, level * 2.6 * w);
    if (level >= 7) give('crit', level - 6);
  } else if (item.armor || item.shield) {
    give('vit', level * 1.5 * w);
    give('ward', level * 0.6 * w);
  } else {
    give('vit', level * 1.5 * w);
  }
  return out;
}

/**
 * The attribute a Jewel of Bloom adds to a piece: one stat it does not have yet, from what its class (or anyone) may roll,
 * a little stronger than the rolled ones. Plain pieces count as level 8. Null when nothing is left to add.
 */
export function rollOption(id: number, gear: GearRoll | undefined, rand: () => number): [GearStat, number] | null {
  const have = new Set<GearStat>(gear?.s.map(([stat]) => stat) ?? []);
  const first = primaryStat(id);
  if (first) have.add(first);
  const pool = POOL[gear?.c ?? 'any'].filter((stat) => !have.has(stat));
  if (first && !have.has(first)) pool.push(first);
  if (pool.length === 0) return null;
  const stat = pool[Math.floor(rand() * pool.length)];
  const l = clampLevel(gear && gear.r > 0 ? gear.l : 8);
  const info = STAT_INFO[stat];
  const v = Math.round(info.unit * (1 + LEVEL_GROWTH * (l - 1)) * slotWeight(id) * OPTION_POWER * (0.9 + rand() * 0.4));
  return [stat, Math.min(info.cap, Math.max(1, v))];
}

/** How much of a stat each level of the upgrade adds to it (a fraction of the stat, and always a little more than nothing). */
export const UPGRADE_STEP = 0.12;

/** A stat of `v` once its piece is upgraded to +`u`: every level grows it by a tenth or so, and by at least a point every third level. */
export function grownValue(v: number, u: number): number {
  const level = Math.min(UPGRADE_MAX, Math.max(0, Math.floor(u)));
  return level > 0 ? v + Math.max(Math.ceil(level / 3), Math.round(v * UPGRADE_STEP * level)) : v;
}

/**
 * The stats a piece has once its upgrade is counted: the rolled stats, grown. A piece with none of its own (a plain one that
 * went through a jewel) has nothing to grow, so the upgrade gives it the stats for its kind instead (see `plusStats`).
 */
export function rolledStats(id: number, g: GearRoll): [GearStat, number][] {
  const u = g.u ?? 0;
  return g.s.length > 0 ? g.s.map(([stat, v]) => [stat, grownValue(v, u)] as [GearStat, number]) : plusStats(id, u);
}

/** The attribute a Jewel of Bloom added, grown with the upgrade like the other stats; null when there is none. */
export function optionStat(g: GearRoll): [GearStat, number] | null {
  return g.o ? [g.o[0], grownValue(g.o[1], g.u ?? 0)] : null;
}

/** Every stat a piece gives, with the upgrade in them. */
export function allStats(id: number, g: GearRoll): [GearStat, number][] {
  const out = rolledStats(id, g);
  const option = optionStat(g);
  if (option) out.push(option);
  return out;
}

/** The material of a piece found at this level: leather and stone, then iron, then diamond. */
function materialFor(level: number): 'leather' | 'iron' | 'diamond' {
  return level <= 5 ? 'leather' : level <= 12 ? 'iron' : 'diamond';
}

/** What a piece for a class (or for anyone) can be. */
function candidates(level: number, cls: ClassId | undefined): number[] {
  const m = materialFor(level);
  const armor = [0, 1, 2, 3].map((slot) => armorId(slot, m));
  const sword = toolId('sword', m === 'leather' ? 'stone' : m);
  if (cls === 'warrior') return [...armor, ...armor, I.GREATSWORD, I.SHIELD, sword];
  if (cls === 'mage') return [...armor, ...armor, I.STAFF, I.WAND, I.SPELLBOOK, I.ORB];
  if (cls === 'ranger') return [...armor, ...armor, I.BOW, I.CROSSBOW, I.DAGGER];
  return armor;
}

/** A found piece of gear: a random one of the kinds that fit, at this level, for this class or for anyone. */
export function randomGear(level: number, rarity: Rarity, cls: ClassId | undefined, rand: () => number): ItemStack {
  const l = clampLevel(level);
  const list = candidates(l, cls);
  return gearStack(list[Math.floor(rand() * list.length)], l, rarity, cls, rand);
}

// ---- what monsters leave ---------------------------------------------------------------------------------------------

interface GearDrop {
  chance: number;
  /** The level range of what it leaves. */
  level: readonly [number, number];
  /** Weights of uncommon, rare and epic. */
  rarity: readonly [number, number, number];
}

const COMMON: readonly [number, number, number] = [72, 24, 4];

export const GEAR_DROPS: Partial<Record<MobKind, GearDrop>> = {
  zombie: { chance: 0.04, level: [1, 5], rarity: COMMON },
  husk: { chance: 0.045, level: [2, 6], rarity: COMMON },
  drowned: { chance: 0.04, level: [2, 6], rarity: COMMON },
  skeleton: { chance: 0.045, level: [2, 7], rarity: COMMON },
  stray: { chance: 0.05, level: [3, 8], rarity: COMMON },
  spider: { chance: 0.035, level: [1, 5], rarity: COMMON },
  cave_spider: { chance: 0.035, level: [3, 7], rarity: COMMON },
  creeper: { chance: 0.04, level: [2, 7], rarity: COMMON },
  enderman: { chance: 0.1, level: [8, 14], rarity: [55, 35, 10] },
  moss_lurker: { chance: 0.07, level: [4, 9], rarity: [62, 30, 8] },
  spore_puff: { chance: 0.02, level: [3, 7], rarity: COMMON },
  ember_wraith: { chance: 0.09, level: [6, 11], rarity: [55, 35, 10] },
  ashen_knight: { chance: 0.14, level: [6, 12], rarity: [50, 38, 12] },
  hollow_priest: { chance: 0.2, level: [7, 13], rarity: [40, 42, 18] },
  shade: { chance: 0.08, level: [6, 11], rarity: [55, 35, 10] },
};

export const gearDropChance = (kind: MobKind): number => GEAR_DROPS[kind]?.chance ?? 0;

/** Pick a rarity by weights. */
export function pickRarity(weights: readonly [number, number, number], rand: () => number): Rarity {
  const total = weights[0] + weights[1] + weights[2];
  let x = rand() * total;
  for (let i = 0; i < 3; i++) {
    x -= weights[i];
    if (x < 0) return (i + 1) as Rarity;
  }
  return 1;
}

/** What a monster of this kind leaves when it dies: null most of the time, else a piece for a random class or for anyone. */
export function gearDrop(kind: MobKind, rand: () => number): ItemStack | null {
  const d = GEAR_DROPS[kind];
  if (!d || rand() >= d.chance * MOB_TIER_INFO[mobTier(kind)].loot) return null;
  const level = d.level[0] + Math.floor(rand() * (d.level[1] - d.level[0] + 1));
  const pick = Math.floor(rand() * (CLASS_IDS.length + 1));
  return randomGear(level, pickRarity(d.rarity, rand), pick < CLASS_IDS.length ? CLASS_IDS[pick] : undefined, rand);
}

// ---- wearing it ------------------------------------------------------------------------------------------------------

/** Who is wearing: their class and class level (null: no class, so no stats and no gear bonuses at all). */
export interface Wearer {
  id: ClassId;
  level: number;
}

/** Can this wearer use the piece (its level reached and its class right)? A plain item always can. */
export function gearUsable(stack: ItemStack | null, who: Wearer | null): boolean {
  const g = stack?.gear;
  if (!g || g.r === 0) return true; // a plain piece that went through a jewel has no level or class to ask for
  if (!who) return false;
  return who.level >= g.l && (!g.c || g.c === who.id);
}

/** Why this piece cannot be put on, or null when it can. A plain item always can. */
export function gearRefuse(stack: ItemStack | null, who: Wearer | null): string | null {
  if (gearUsable(stack, who)) return null;
  const g = stack?.gear;
  if (!g || g.r === 0) return null;
  if (g.c && who && who.level >= g.l && g.c !== who.id) return `That is for a ${CLASSES[g.c].name}.`;
  return `Requires level ${g.l}.`;
}

/** The stat modifiers of the pieces a character wears and holds (the ones they may not use yet add nothing). */
export function gearModifiers(stacks: readonly (ItemStack | null)[], who: Wearer | null): StatModifier[] {
  const out: StatModifier[] = [];
  if (!who) return out;
  for (const st of stacks) {
    if (!st?.gear || !gearUsable(st, who)) continue;
    for (const [stat, v] of allStats(st.id, st.gear)) out.push(STAT_INFO[stat].mod(v));
  }
  return out;
}

/** The stat modifiers of the rings and the necklace a character wears (see accessories.ts). Every class may wear them; a ring asks for level 10 and a necklace for level 10. */
export function accessoryModifiers(stacks: readonly (ItemStack | null)[], who: Wearer | null): StatModifier[] {
  const out: StatModifier[] = [];
  if (!who) return out;
  for (const st of stacks) {
    const def = st ? accessoryOfItem(st.id) : null;
    if (!def) continue;
    if (who.level < (def.kind === 'ring' ? RING_LEVEL : NECKLACE_LEVEL)) continue;
    for (const [stat, v] of def.stats) out.push(STAT_INFO[stat].mod(v));
  }
  return out;
}

/**
 * The stat modifiers of the glyphs a character wears and holds: the glyphs of a stat (Vigor, Might, Fury...) add to the class stats like the
 * bonus stats of the gear itself, and so do for every ability. A Glyph Tome adds nothing, and nor does a piece that needs a higher level
 * than the wearer has. A ring or a necklace below its level adds nothing.
 */
export function glyphModifiers(stacks: readonly (ItemStack | null)[], who: Wearer | null): StatModifier[] {
  const out: StatModifier[] = [];
  if (!who) return out;
  for (const st of stacks) {
    const jewelry = st ? accessoryOfItem(st.id) : null;
    if (jewelry && who.level < (jewelry.kind === 'ring' ? RING_LEVEL : NECKLACE_LEVEL)) continue;
    if (!st?.ench || getItem(st.id).storesEnchants || !gearUsable(st, who)) continue;
    for (const [id, rank] of st.ench) {
      const g = glyphStat(id, rank);
      if (g) out.push(STAT_INFO[g[0]].mod(g[1]));
    }
  }
  return out;
}

/** A short text that changes when the glyphs of a stat on the stacks change (see `gearKey`). */
export function glyphKey(stacks: readonly (ItemStack | null)[]): string {
  let key = '';
  for (const st of stacks) {
    if (!st?.ench || getItem(st.id).storesEnchants) continue;
    for (const [id, rank] of st.ench) if (ENCHANTS.some((d) => d.id === id && d.stat)) key += `${id}.${rank},`;
    key += ';';
  }
  return key;
}

/** What a glyph does at a rank, as the tooltip and the altar say it: a glyph of a stat in the line of that stat (`resource` names the class's pool). */
export function glyphLine(id: number, rank: number, resource = 'Resource'): string {
  const g = glyphStat(id, rank);
  if (g) return statLine(g[0], g[1], resource);
  return ENCHANTS.find((d) => d.id === id)?.effect(rank) ?? '';
}

/** A short text that changes when what the wearer gets from their gear changes (to know when to recompute). */
export function gearKey(stacks: readonly (ItemStack | null)[], who: Wearer | null): string {
  let key = who ? `${who.id}${who.level}` : '-';
  for (const st of stacks) if (st?.gear) key += `|${st.id}:${st.gear.r}${st.gear.l}${st.gear.c ?? ''}${st.gear.s.map(([a, v]) => a + v).join(',')}+${st.gear.u ?? 0}${st.gear.o ? st.gear.o[0] + st.gear.o[1] : ''}`;
  return key;
}

/** What the stat adds, for the tooltip. `resource` names the class's pool (mana, stamina, focus). */
export const statLine = (stat: GearStat, v: number, resource = 'Resource'): string => STAT_INFO[stat].line(v, resource);

/** The name of a piece that has stats: its tail names the first stat ("Greatsword of Might"). Empty for plain items. */
export const gearSuffix = (g: GearRoll | undefined): string => (g && g.s.length > 0 ? STAT_INFO[g.s[0][0]].suffix : '');

/** The name of the resource a class spends (for the tooltip of a piece for a class that was not asked about). */
export const resourceNameOf = (cls: ClassId | undefined): string => (cls ? CLASSES[cls].resource.name : 'Resource');

// ---- saved and sent -----------------------------------------------------------------------------------------------

/** Read gear stats from untrusted data (a save, the network): anything that does not add up is dropped. */
export function parseGear(raw: unknown, itemId?: number): GearRoll | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as { r?: unknown; l?: unknown; c?: unknown; s?: unknown; u?: unknown; o?: unknown };
  const r = Number(o.r);
  const l = Number(o.l);
  if (!Number.isInteger(r) || r < 0 || r > 3 || !Number.isFinite(l) || !Array.isArray(o.s)) return undefined;
  if (itemId !== undefined && !canRollGear(itemId)) return undefined;
  const s: [GearStat, number][] = [];
  for (const e of r === 0 ? [] : o.s) {
    if (s.length >= 3) break;
    if (!Array.isArray(e) || !isGearStat(e[0]) || s.some(([k]) => k === e[0])) continue;
    const v = Number(e[1]);
    if (!Number.isFinite(v)) continue;
    s.push([e[0], Math.min(STAT_INFO[e[0]].cap, Math.max(1, Math.round(v)))]);
  }
  if (r > 0 && s.length === 0) return undefined;
  const u = Math.min(UPGRADE_MAX, Math.max(0, Math.floor(Number(o.u))));
  let extra: [GearStat, number] | undefined;
  if (Array.isArray(o.o) && isGearStat(o.o[0]) && Number.isFinite(Number(o.o[1]))) {
    extra = [o.o[0], Math.min(STAT_INFO[o.o[0]].cap, Math.max(1, Math.round(Number(o.o[1]))))];
  }
  if (r === 0 && !(u > 0) && !extra) return undefined;
  const jewel = { ...(u > 0 ? { u } : {}), ...(extra ? { o: extra } : {}) };
  if (r === 0) return { r: 0, l: 1, s: [], ...jewel };
  return { r: r as Rarity, l: clampLevel(l), ...(isClassId(o.c) ? { c: o.c } : {}), s, ...jewel };
}

export const cloneGear = (g: GearRoll | undefined): GearRoll | undefined =>
  g
    ? {
        r: g.r,
        l: g.l,
        ...(g.c ? { c: g.c } : {}),
        s: g.s.map(([a, b]) => [a, b] as [GearStat, number]),
        ...(g.u ? { u: g.u } : {}),
        ...(g.o ? { o: [g.o[0], g.o[1]] as [GearStat, number] } : {}),
      }
    : undefined;

/** The coins the jewels add to a piece, by its upgrade and (a Bloom attribute) a flat amount. */
const PLUS_VALUE = [0, 6, 14, 26, 44, 70, 110, 170, 260, 400, 700, 1200, 2000, 3200];

/** What a piece of gear is worth to a merchant, on top of its plain price (for a plain piece: only what the jewels gave it). */
export const gearValue = (g: GearRoll): number =>
  (g.r > 0 ? Math.round(rarityDef(g.r).value * (3 + g.l)) : 0) + PLUS_VALUE[Math.min(UPGRADE_MAX, g.u ?? 0)] + (g.o ? 90 : 0);
