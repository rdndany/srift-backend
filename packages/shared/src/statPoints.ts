import { CLASS_LEVELS, clampClassLevel, type StatModifier } from './classes';

/**
 * Stat points, as in MU Online: every level of the class gives `POINTS_PER_LEVEL` points to spend on four stats, for good
 * (until they are reset). Strength hits harder in melee, Agility is the bow and the feet, Vitality is health and toughness,
 * Energy is the spells and the resource pool. They stack on top of the class, the gear and the off hand (see `computeStats`).
 *
 * Only what was spent is saved; what is left to spend follows from the level, so a character that was already at a high level
 * when this came in has its points waiting, and a level lost to an enchanting table or a death never takes any away.
 */

export const POINTS_PER_LEVEL = 5;

export const ATTR_KEYS = ['str', 'agi', 'vit', 'ene'] as const;
export type AttrKey = (typeof ATTR_KEYS)[number];

/** Points spent on each stat, in `ATTR_KEYS` order. */
export type AttrSpend = readonly [number, number, number, number];

export const NO_POINTS: AttrSpend = [0, 0, 0, 0];

export interface AttrInfo {
  key: AttrKey;
  name: string;
  /** What the stat is about, in a sentence ({resource} stands for the class's own: mana, stamina or focus). */
  blurb: string;
  /** What a point does, as short lines for the interface. */
  gain: string[];
  color: string;
}

export const ATTR_INFO: Record<AttrKey, AttrInfo> = {
  str: { key: 'str', name: 'Strength', blurb: 'Raw power. Your melee weapons and melee abilities hit harder.', gain: ['+0.5% melee damage'], color: '#e0653f' },
  agi: {
    key: 'agi',
    name: 'Agility',
    blurb: 'Speed and aim. Arrows hit harder, you land more critical hits, and you swing and move faster.',
    gain: ['+0.5% ranged damage', '+0.05% crit chance', '+0.1% attack speed', '+0.03% move speed'],
    color: '#7fd35a',
  },
  vit: { key: 'vit', name: 'Vitality', blurb: 'Toughness. You have more health, and every hit you take hurts a little less.', gain: ['+0.15 health', '-0.12% damage taken'], color: '#e8b04a' },
  ene: {
    key: 'ene',
    name: 'Energy',
    blurb: 'Magic. Your spells hit harder, and your {resource} pool is bigger and refills faster.',
    gain: ['+0.5% spell damage', '+0.8 max {resource}', '+0.02 {resource}/s regen'],
    color: '#6ab4f5',
  },
};

/** What one point of each stat adds. */
export const POINT_EFFECT = {
  str: { melee: 0.005 },
  agi: { ranged: 0.005, critChance: 0.0005, attackSpeed: 0.001, moveSpeed: 0.0003 },
  vit: { health: 0.15, damageTaken: 0.0012 },
  ene: { spell: 0.005, resource: 0.8, resourceRegen: 0.02 },
} as const;

/** Points a class level has given in all: none at level 1. */
export const pointsForLevel = (level: number): number => (clampClassLevel(level) - 1) * POINTS_PER_LEVEL;

/** Most points a character can ever have. */
export const MAX_POINTS = (CLASS_LEVELS.max - 1) * POINTS_PER_LEVEL;

export const spentOf = (pts: AttrSpend): number => pts[0] + pts[1] + pts[2] + pts[3];

/** Read what was saved: four whole non-negative numbers (anything else counts as nothing), never more than the level has given. */
export function parseSpend(raw: unknown, level: number): AttrSpend {
  if (!Array.isArray(raw)) return NO_POINTS;
  const out = ATTR_KEYS.map((_, i) => {
    const n = raw[i];
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.min(MAX_POINTS, Math.floor(n)) : 0;
  });
  // Too many (a level that was cut, or a hand-edited file): take the surplus back from the last stat first.
  let over = spentOf(out as unknown as AttrSpend) - pointsForLevel(level);
  for (let i = out.length - 1; i >= 0 && over > 0; i--) {
    const cut = Math.min(out[i]!, over);
    out[i]! -= cut;
    over -= cut;
  }
  return out as unknown as AttrSpend;
}

/** What the points add to the stats of a class, as a modifier like those of gear. */
export function pointModifier(pts: AttrSpend): StatModifier | null {
  const [str, agi, vit, ene] = pts;
  if (str + agi + vit + ene <= 0) return null;
  return {
    health: vit * POINT_EFFECT.vit.health,
    damage: { melee: 1 + str * POINT_EFFECT.str.melee, ranged: 1 + agi * POINT_EFFECT.agi.ranged, spell: 1 + ene * POINT_EFFECT.ene.spell },
    damageTaken: 1 - vit * POINT_EFFECT.vit.damageTaken,
    moveSpeed: 1 + agi * POINT_EFFECT.agi.moveSpeed,
    critChance: agi * POINT_EFFECT.agi.critChance,
    attackSpeed: 1 + agi * POINT_EFFECT.agi.attackSpeed,
    resource: ene * POINT_EFFECT.ene.resource,
    resourceRegen: ene * POINT_EFFECT.ene.resourceRegen,
  };
}
