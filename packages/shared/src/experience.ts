import { B } from './blocks';

/**
 * Experience points and levels, with the original game's curve: the points needed to go from one level
 * to the next grow with the level (2L+7 up to 15, 5L-38 up to 30, then 9L-158).
 */

/** Levels are capped so a corrupt save or a bug cannot overflow the maths. */
export const MAX_LEVEL = 1000;
/** Most points a single award may add. */
export const MAX_AWARD = 100_000;

/** Points needed to advance from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  if (level <= 15) return 2 * level + 7;
  if (level <= 30) return 5 * level - 38;
  return 9 * level - 158;
}

/** Points needed in total to reach `level` from zero. */
export function totalForLevel(level: number): number {
  if (level <= 16) return level * level + 6 * level;
  if (level <= 31) return Math.round(2.5 * level * level - 40.5 * level + 360);
  return Math.round(4.5 * level * level - 162.5 * level + 2220);
}

export class Experience {
  /** Whole levels. */
  level = 0;
  /** Points collected towards the next level (0 <= points < xpToNext(level)). */
  points = 0;

  /** Fraction of the bar that is filled, 0..1. */
  get progress(): number {
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
    if (this.level >= MAX_LEVEL) this.points = 0;
    return gained;
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

  toJSON(): { l: number; p: number } {
    return { l: this.level, p: this.points };
  }

  /** Accepts anything: a missing or hostile record gives a fresh bar. */
  loadJSON(d: unknown): void {
    this.reset();
    if (typeof d !== 'object' || d === null) return;
    const r = d as { l?: unknown; p?: unknown };
    const level = Number(r.l);
    const points = Number(r.p);
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
