import { I, toolId } from './items';

/**
 * Character classes: who a character is in a fight. Everything about balance is in this file (the numbers in
 * `CLASS_BALANCE`, `LEVEL_SCALING` and `CLASS_LEVELS`), so tuning never means hunting through the game.
 *
 * A class never restricts anything: every class mines, builds, crafts, explores and may hold any item. A class only
 * changes how hard you hit with each kind of damage, how much you take, how fast you move and the resource your
 * abilities cost. The rules here are pure (no world, no clock), so the server and the client compute the same
 * numbers and the tests can pin them down.
 */

export const CLASS_IDS = ['warrior', 'mage', 'ranger'] as const;
export type ClassId = (typeof CLASS_IDS)[number];

export const isClassId = (x: unknown): x is ClassId => typeof x === 'string' && (CLASS_IDS as readonly string[]).includes(x);

/** What a hit is made of. Each class is good at one of them and weak at another. */
export const DAMAGE_KINDS = ['melee', 'ranged', 'spell'] as const;
export type DamageKind = (typeof DAMAGE_KINDS)[number];

/** The numbers that make up a class at a moment in time (see `computeStats`). */
export interface ClassStats {
  /** Health points (the unmodified game has 20, drawn as ten hearts). */
  maxHealth: number;
  /** Multiplier on the damage you deal, by kind. */
  damage: Record<DamageKind, number>;
  /** Multiplier on the damage you take after the rest (below 1 is tougher). */
  damageTaken: number;
  /** Multiplier on walking and running speed. */
  moveSpeed: number;
  /** Chance (0..1) that a hit is critical. */
  critChance: number;
  /** Multiplier a critical hit applies. */
  critDamage: number;
  /** Multiplier on how fast you swing (above 1 is faster). */
  attackSpeed: number;
  /** Size of the resource pool abilities spend, and its regeneration per second. */
  maxResource: number;
  resourceRegen: number;
}

/**
 * Adjustments to the stats from outside the class: gear, buffs, specializations. They are all optional, so a
 * source only says what it changes. Future equipment that gives class bonuses is just another source of these.
 */
export interface StatModifier {
  health?: number;
  /** Multiplies the damage of these kinds (1.1 = 10% more). */
  damage?: Partial<Record<DamageKind, number>>;
  damageTaken?: number;
  moveSpeed?: number;
  /** Added to the crit chance and the crit multiplier. */
  critChance?: number;
  critDamage?: number;
  attackSpeed?: number;
  /** Added to the resource pool. */
  resource?: number;
  resourceRegen?: number;
}

/** What a class names its resource and how the interface paints it. */
export interface ResourceDef {
  name: string;
  color: string;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  tagline: string;
  description: string;
  /** The combat role in a few words (shown on the selection screen). */
  role: string;
  strengths: readonly string[];
  weaknesses: readonly string[];
  /** Name of the artwork accent colour (also the card's colour). */
  color: string;
  resource: ResourceDef;
  /** The items a new character of this class starts a world with (see `Player.grantClassKit`). */
  startingKit: readonly { id: number; count: number }[];
  /** The part of the kit that starts in the off-hand slot instead of the bags (it is also in `startingKit`). */
  startingOffhand: number;
  /** The one you are told about: the weapon the class starts with. */
  startingWeapon: number;
  /**
   * Specializations this class can branch into later (Warrior: Berserker or Paladin, ...). Empty on purpose: the
   * initial release has only the three main classes, and this is where a later one hooks in.
   */
  specializations: readonly string[];
}

/** Starting values. Numbers are tuned together: change one class and check the others (see classes.test.ts). */
export const CLASS_BALANCE: Record<ClassId, ClassStats> = {
  // Tank and melee damage: lots of health, hits hard up close, weak at range and with spells.
  warrior: {
    maxHealth: 28,
    damage: { melee: 1.25, ranged: 0.7, spell: 0.6 },
    damageTaken: 0.8,
    moveSpeed: 1.0,
    critChance: 0.05,
    critDamage: 1.5,
    attackSpeed: 1.0,
    maxResource: 100,
    resourceRegen: 6,
  },
  // Ranged magic damage: very high spell damage, low health, takes more damage, hits poorly in melee.
  mage: {
    maxHealth: 14,
    damage: { melee: 0.6, ranged: 0.8, spell: 1.5 },
    damageTaken: 1.15,
    moveSpeed: 1.0,
    critChance: 0.08,
    critDamage: 1.6,
    attackSpeed: 1.0,
    maxResource: 120,
    resourceRegen: 7,
  },
  // Ranged damage and mobility: fast, precise and critical, medium health, weak in melee and spells.
  ranger: {
    maxHealth: 20,
    damage: { melee: 0.8, ranged: 1.3, spell: 0.7 },
    damageTaken: 1.0,
    moveSpeed: 1.12,
    critChance: 0.15,
    critDamage: 1.8,
    attackSpeed: 1.1,
    maxResource: 100,
    resourceRegen: 8,
  },
};

/** What each level above the first adds (a share of the class's own numbers, so a class keeps its character). */
export const LEVEL_SCALING = {
  /** Health points per level. */
  health: 0.6,
  /** Fraction of extra damage per level (all kinds). */
  damage: 0.02,
  /** Extra resource per level, and critical chance per level. */
  resource: 2,
  critChance: 0.002,
};

/**
 * What an item in the off-hand slot adds to the stats of a class (null: nothing; a shield works by blocking, not by
 * numbers). The orb sharpens spells and deepens the mana pool; a dagger in the off hand makes hits land more often and harder.
 */
export function offhandModifier(id: number): StatModifier | null {
  if (id === I.ORB) return { damage: { spell: 1.12 }, resource: 20, resourceRegen: 1.5 };
  if (id === I.DAGGER) return { critChance: 0.05, critDamage: 0.1 };
  return null;
}

/** The class level: earned from kills and quests, separate from the experience level of the world. */
export const CLASS_LEVELS = {
  max: 20,
  /** Points to go from `level` to the next one. */
  toNext: (level: number): number => 30 + 20 * (level - 1) + 4 * (level - 1) * (level - 1),
};

export const CLASSES: Record<ClassId, ClassDef> = {
  warrior: {
    id: 'warrior',
    name: 'Warrior',
    tagline: 'Hold the line',
    description: 'A battle-hardened fighter who stands in front of everyone else. Steel, shields and heavy blows: the Warrior takes the hits so that the rest of the party does not have to.',
    role: 'Tank / melee damage',
    strengths: ['The most health and the toughest hide', 'Strong melee damage and crowd control', 'Abilities that stun, charge and shrug off damage'],
    weaknesses: ['Poor at range and with magic', 'Medium speed: hard to run from a ranger', 'Has to get close to do anything'],
    color: '#c1473a',
    resource: { name: 'Stamina', color: '#e0a23a' },
    startingKit: [
      { id: toolId('sword', 'stone'), count: 1 },
      { id: I.SHIELD, count: 1 },
    ],
    startingOffhand: I.SHIELD,
    startingWeapon: toolId('sword', 'stone'),
    specializations: [],
  },
  mage: {
    id: 'mage',
    name: 'Mage',
    tagline: 'Burn it all down',
    description: 'A scholar of fire, frost and the arcane. Fragile, but nobody deals damage from afar like the Mage: fireballs, falling meteors and freezing waves that crowds cannot escape.',
    role: 'Ranged magic damage',
    strengths: ['Very high spell damage', 'Area attacks and crowd control (slow, burn)', 'A shield of pure arcane energy'],
    weaknesses: ['The least health and the thinnest defense', 'Weak in melee and with a bow', 'Runs dry: every spell costs mana'],
    color: '#4d7bd6',
    resource: { name: 'Mana', color: '#4ea1ff' },
    startingKit: [
      { id: I.WAND, count: 1 },
      { id: I.ORB, count: 1 },
    ],
    startingOffhand: I.ORB,
    startingWeapon: I.WAND,
    specializations: [],
  },
  ranger: {
    id: 'ranger',
    name: 'Ranger',
    tagline: 'Never where they aim',
    description: 'A wilderness hunter: quick on foot, deadly with a bow. Precision shots that pierce, a roll out of danger, traps and a rain of arrows for anything that follows.',
    role: 'Ranged damage / mobility',
    strengths: ['High ranged damage and critical hits', 'The fastest on foot, with a dodging roll', 'Piercing shots and traps'],
    weaknesses: ['Medium health and defense, nothing to hide behind', 'Weak in melee and with magic', 'Needs arrows'],
    color: '#4f9a4a',
    resource: { name: 'Focus', color: '#7fd35a' },
    startingKit: [
      { id: I.BOW, count: 1 },
      { id: I.ARROW, count: 32 },
      { id: I.DAGGER, count: 1 },
    ],
    startingOffhand: I.DAGGER,
    startingWeapon: I.BOW,
    specializations: [],
  },
};

const round = (n: number, digits = 4): number => {
  const k = 10 ** digits;
  return Math.round(n * k) / k;
};

/** The class level, as a whole number from 1 to the cap. */
export const clampClassLevel = (level: number): number => (Number.isFinite(level) ? Math.min(CLASS_LEVELS.max, Math.max(1, Math.floor(level))) : 1);

/**
 * The stats of a class at a level, with every outside source (gear, buffs) applied on top. Pure: the same inputs
 * give the same numbers on the server and in the client.
 */
export function computeStats(classId: ClassId, level: number, mods: readonly StatModifier[] = []): ClassStats {
  const base = CLASS_BALANCE[classId];
  const lv = clampClassLevel(level) - 1;
  const damageGrowth = 1 + LEVEL_SCALING.damage * lv;
  const out: ClassStats = {
    maxHealth: base.maxHealth + LEVEL_SCALING.health * lv,
    damage: { melee: base.damage.melee * damageGrowth, ranged: base.damage.ranged * damageGrowth, spell: base.damage.spell * damageGrowth },
    damageTaken: base.damageTaken,
    moveSpeed: base.moveSpeed,
    critChance: base.critChance + LEVEL_SCALING.critChance * lv,
    critDamage: base.critDamage,
    attackSpeed: base.attackSpeed,
    maxResource: base.maxResource + LEVEL_SCALING.resource * lv,
    resourceRegen: base.resourceRegen,
  };
  for (const m of mods) {
    out.maxHealth += m.health ?? 0;
    for (const k of DAMAGE_KINDS) out.damage[k] *= m.damage?.[k] ?? 1;
    out.damageTaken *= m.damageTaken ?? 1;
    out.moveSpeed *= m.moveSpeed ?? 1;
    out.critChance += m.critChance ?? 0;
    out.critDamage += m.critDamage ?? 0;
    out.attackSpeed *= m.attackSpeed ?? 1;
    out.maxResource += m.resource ?? 0;
    out.resourceRegen += m.resourceRegen ?? 0;
  }
  // Sanity limits, so a stack of bonuses can never produce something the rest of the game cannot handle.
  out.maxHealth = Math.max(1, Math.min(200, round(out.maxHealth, 2)));
  for (const k of DAMAGE_KINDS) out.damage[k] = Math.max(0, round(out.damage[k]));
  out.damageTaken = Math.max(0.1, round(out.damageTaken));
  out.moveSpeed = Math.min(1.6, Math.max(0.4, round(out.moveSpeed)));
  out.critChance = Math.min(0.75, Math.max(0, round(out.critChance)));
  out.critDamage = Math.min(4, Math.max(1, round(out.critDamage)));
  out.attackSpeed = Math.min(2, Math.max(0.4, round(out.attackSpeed)));
  out.maxResource = Math.max(0, round(out.maxResource, 1));
  out.resourceRegen = Math.max(0, round(out.resourceRegen, 2));
  return out;
}

/** Damage from a hit that is already worked out: what the rolls decided. */
export interface DamageRoll {
  amount: number;
  crit: boolean;
}

/**
 * The one place damage dealt by a class is worked out: the base damage of the weapon or ability, the class's
 * multiplier for that kind, and a critical roll. `rand` is the server's own random source, never the client's.
 * Without a class (stats null) the base damage passes through untouched, so classless play is the unmodified game.
 */
export function rollDamage(stats: ClassStats | null, kind: DamageKind, base: number, rand: () => number): DamageRoll {
  if (!stats || base <= 0) return { amount: Math.max(0, base), crit: false };
  const crit = rand() < stats.critChance;
  return { amount: round(base * stats.damage[kind] * (crit ? stats.critDamage : 1), 3), crit };
}

/**
 * What gets through to a target: its class multiplier, then temporary damage reduction. Used by every hit on a
 * classed player, whoever or whatever it comes from.
 */
export function damageAfterDefense(amount: number, stats: ClassStats | null, reduction = 1): number {
  if (amount <= 0) return 0;
  return amount * (stats ? stats.damageTaken : 1) * reduction;
}
