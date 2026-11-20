import { B } from './blocks';
import { levelPace, TUNING } from './tuning';

/**
 * Experience points and levels, with the original game's curve: the points needed to go from one level
 * to the next grow with the level (2L+7 up to 15, 5L-38 up to 30, then 9L-158).
 */

/**
 * The level cap, for now. Points earned at the cap fill the bar no further: they are set aside as surplus and become
 * bottles (orbs still mend your gear first). Levels spent at the enchanting table or the anvil, or lost in a death, can be earned back.
 */
export const MAX_LEVEL = 30;

/** At the cap, this many points of surplus fill one Bottle o' Enchanting (which breaks into only a few, so it is worth more as a thing to trade). */
export const BANK_PER_BOTTLE = 100;
/** The most surplus kept at once, so a bug or a corrupt save cannot make a flood of bottles. */
const MAX_SURPLUS = 100_000;
/** Most points a single award may add. */
export const MAX_AWARD = 100_000;

/** Points needed to advance from `level` to `level + 1`: the original curve, made slower by levelPace (see tuning.ts). */
export function xpToNext(level: number): number {
  const classic = level <= 15 ? 2 * level + 7 : level <= 30 ? 5 * level - 38 : 9 * level - 158;
  return TUNING.xpPace ? Math.round(classic * levelPace(level)) : classic;
}

/** Points needed in total to reach `level` from zero. */
export function totalForLevel(level: number): number {
  if (TUNING.xpPace) {
    let sum = 0;
    for (let l = 0; l < level; l++) sum += xpToNext(l);
    return sum;
  }
  if (level <= 16) return level * level + 6 * level;
  if (level <= 31) return Math.round(2.5 * level * level - 40.5 * level + 360);
  return Math.round(4.5 * level * level - 162.5 * level + 2220);
}

export class Experience {
  /** Whole levels. */
  level = 0;
  /** Points collected towards the next level (0 <= points < xpToNext(level)). */
  points = 0;
  /** Points earned at the level cap, waiting to fill a bottle (a death does not touch them). */
  surplus = 0;

  /** At the level cap: the bar stays full and nothing more is kept. */
  get maxed(): boolean {
    return this.level >= MAX_LEVEL;
  }

  /** Fraction of the bar that is filled, 0..1. At the cap it shows how far the surplus is to the next bottle. */
  get progress(): number {
    if (this.maxed) return Math.min(1, this.surplus / BANK_PER_BOTTLE);
    return this.points / xpToNext(this.level);
  }

  /** Lifetime points the current level and bar add up to. */
  get total(): number {
    return totalForLevel(this.level) + this.points;
  }

  /** Add points. Returns how many levels that gained. */
  add(amount: number): number {
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    this.points += Math.min(MAX_AWARD, Math.floor(amount));
    let gained = 0;
    while (this.level < MAX_LEVEL && this.points >= xpToNext(this.level)) {
      this.points -= xpToNext(this.level);
      this.level++;
      gained++;
    }
    // At the cap the points that are left over are not lost: they are set aside, to be poured into bottles (see `takeBottles`).
    if (this.level >= MAX_LEVEL) {
      this.surplus = Math.min(MAX_SURPLUS, this.surplus + this.points);
      this.points = 0;
    }
    return gained;
  }

  /** How many whole bottles the surplus fills (at `BANK_PER_BOTTLE` points each); it takes them out of the surplus. */
  takeBottles(): number {
    const n = Math.floor(this.surplus / BANK_PER_BOTTLE);
    this.surplus -= n * BANK_PER_BOTTLE;
    return n;
  }

  /** Spend whole levels (an enchanting table, an anvil). Returns false and changes nothing if there are too few. */
  spend(levels: number): boolean {
    if (!Number.isInteger(levels) || levels < 0 || levels > this.level) return false;
    this.level -= levels;
    // Spending levels keeps the bar where it was, as a fraction, like the original.
    this.points = Math.min(this.points, xpToNext(this.level) - 1);
    return true;
  }

  /** Lose a share (0..1) of all the points collected, which may cost levels. Returns how many points that was. */
  lose(share: number): number {
    const before = this.total;
    let rest = Math.floor(before * (1 - Math.max(0, Math.min(1, share))));
    this.reset();
    while (rest > 0) {
      const n = Math.min(rest, MAX_AWARD);
      this.add(n);
      rest -= n;
    }
    return before - this.total;
  }

  reset(): void {
    this.level = 0;
    this.points = 0;
  }

  toJSON(): { l: number; p: number; s?: number } {
    return this.surplus > 0 ? { l: this.level, p: this.points, s: this.surplus } : { l: this.level, p: this.points };
  }

  /** Accepts anything: a missing or hostile record gives a fresh bar. */
  loadJSON(d: unknown): void {
    this.reset();
    this.surplus = 0;
    if (typeof d !== 'object' || d === null) return;
    const r = d as { l?: unknown; p?: unknown; s?: unknown };
    const level = Number(r.l);
    const points = Number(r.p);
    const surplus = Number(r.s);
    if (Number.isFinite(surplus)) this.surplus = Math.max(0, Math.min(MAX_SURPLUS, Math.floor(surplus)));
    if (Number.isFinite(level)) this.level = Math.max(0, Math.min(MAX_LEVEL, Math.floor(level)));
    if (Number.isFinite(points) && this.level < MAX_LEVEL) this.points = Math.max(0, Math.min(xpToNext(this.level) - 1, Math.floor(points)));
  }
}

/** Points a broken block gives when it was harvested properly (min, max inclusive). */
export const BLOCK_XP: Partial<Record<number, readonly [number, number]>> = {
  [B.COAL_ORE]: [0, 2],
  [B.DIAMOND_ORE]: [3, 7],
  [B.LAPIS_ORE]: [2, 5],
  [B.EMERALD_ORE]: [3, 7],
  [B.REDSTONE_ORE]: [1, 5],
  /** Breaking a spawner pays out although it drops nothing. */
  [B.SPAWNER]: [15, 43],
};
