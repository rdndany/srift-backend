import type { AchStat } from './achievements';
import { mulberry32 } from './noise';

/**
 * Daily bounties: every UTC day the realm posts three (an easy one, a medium one and a hard one), the same for every player, picked from
 * the lists below by the day alone. They count the same deeds as the achievements (see `AchStat`) from the start of the day, and each one
 * done pays its tier's $SOLRIFT once per wallet per day (the server decides: see `TokenService.rewardBounty`). Progress is kept with
 * the character and starts over each day.
 */

export type BountyTier = 'easy' | 'medium' | 'hard';
export const BOUNTY_TIERS: readonly BountyTier[] = ['easy', 'medium', 'hard'];
export const BOUNTY_TIER_NAME: Record<BountyTier, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

/** What a bounty may count: the deeds, but not the level (a level is reached, not done today). */
export type BountyStat = Exclude<AchStat, 'level' | 'quests'>;

export interface BountyDef {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  readonly tier: BountyTier;
  readonly stat: BountyStat;
  readonly goal: number;
}

const B = (id: string, name: string, tier: BountyTier, stat: BountyStat, goal: number, text: string): BountyDef => ({ id, name, text, tier, stat, goal });

export const BOUNTIES: readonly BountyDef[] = [
  B('e-kills', 'Pest Patrol', 'easy', 'kills', 20, 'Slay 20 monsters.'),
  B('e-coins', 'Pocket Money', 'easy', 'coins', 300, 'Earn 300 Auren.'),
  B('e-time', 'Stay a While', 'easy', 'minutes', 15, 'Play for 15 minutes.'),

  B('m-kills', 'Monster Hunter', 'medium', 'kills', 60, 'Slay 60 monsters.'),
  B('m-elites', 'Named and Shamed', 'medium', 'elites', 2, 'Defeat 2 elite monsters.'),
  B('m-coins', 'Earn Your Keep', 'medium', 'coins', 1_500, 'Earn 1,500 Auren.'),
  B('m-time', 'Long Watch', 'medium', 'minutes', 45, 'Play for 45 minutes.'),

  B('h-dungeon', 'Into the Deep', 'hard', 'dungeons', 1, 'Clear the Hollow Deep.'),
  B('h-kills', 'Rift Reaper', 'hard', 'kills', 150, 'Slay 150 monsters.'),
  B('h-elites', 'Elite Bane', 'hard', 'elites', 6, 'Defeat 6 elite monsters.'),
];

export const BOUNTY_BY_ID: ReadonlyMap<string, BountyDef> = new Map(BOUNTIES.map((b) => [b.id, b]));

export const DAY_MS = 86_400_000;

/** The UTC day a moment (ms) is in, as a whole number of days since 1970. */
export const dayOf = (ms: number): number => Math.floor(ms / DAY_MS);

/** "2026-11-21" */
export const dayName = (day: number): string => new Date(day * DAY_MS).toISOString().slice(0, 10);

/**
 * The day's three bounties, easy first. They are picked from the day alone (the hard one first, then a medium and an easy one that count
 * something else), so that every player sees the same three and they ask for three different things.
 */
export function bountiesOn(day: number): BountyDef[] {
  const rand = mulberry32((Math.imul(Math.floor(day), 2654435761) ^ 0x9e3779b9) >>> 0);
  const used = new Set<BountyStat>();
  const pick = (tier: BountyTier): BountyDef => {
    const all = BOUNTIES.filter((b) => b.tier === tier);
    const fresh = all.filter((b) => !used.has(b.stat));
    const from = fresh.length > 0 ? fresh : all;
    const b = from[Math.floor(rand() * from.length)];
    used.add(b.stat);
    return b;
  };
  const hard = pick('hard');
  const medium = pick('medium');
  const easy = pick('easy');
  return [easy, medium, hard];
}

/** One bounty as the player sees it. */
export interface BountyRowView {
  id: string;
  name: string;
  text: string;
  tier: BountyTier;
  goal: number;
  have: number;
  done: boolean;
}

export interface BountyView {
  /** The UTC day, as `dayName` says it. */
  day: string;
  /** Milliseconds from the moment of the view to the next day's bounties. */
  resetIn: number;
  rows: BountyRowView[];
}

export interface BountySave {
  /** The day the counts are of. */
  d: number;
  /** What has been done today, by bounty id. */
  p?: Record<string, number>;
  /** The ids done today. */
  c?: string[];
}

/**
 * A character's day: what it has done towards each of today's bounties, and which it has finished. The counts begin at nothing every new
 * day (the book rolls itself over when it is told the day has changed), and a bounty that is finished is finished for the day.
 */
export class BountyBook {
  private day = -1;
  private readonly progress = new Map<string, number>();
  private readonly done = new Set<string>();

  get today(): number {
    return this.day;
  }

  /** Begin `day` afresh if it is not the day the book is of. True when it did. */
  roll(day: number): boolean {
    if (day === this.day) return false;
    this.day = day;
    this.progress.clear();
    this.done.clear();
    return true;
  }

  /** A deed (or several) was done on `day`: count it, and return the bounties it finished. */
  add(day: number, stat: AchStat, n = 1): BountyDef[] {
    this.roll(day);
    if (!(n > 0) || !Number.isFinite(n)) return [];
    const finished: BountyDef[] = [];
    for (const b of bountiesOn(day)) {
      if (b.stat !== stat || this.done.has(b.id)) continue;
      const have = Math.min(b.goal, (this.progress.get(b.id) ?? 0) + n);
      this.progress.set(b.id, have);
      if (have >= b.goal) {
        this.done.add(b.id);
        finished.push(b);
      }
    }
    return finished;
  }

  view(day: number, now: number): BountyView {
    this.roll(day);
    return {
      day: dayName(day),
      resetIn: Math.max(0, (day + 1) * DAY_MS - now),
      rows: bountiesOn(day).map((b) => ({ id: b.id, name: b.name, text: b.text, tier: b.tier, goal: b.goal, have: this.done.has(b.id) ? b.goal : Math.floor(this.progress.get(b.id) ?? 0), done: this.done.has(b.id) })),
    };
  }

  /** Nothing to save (a day with no deeds in it). */
  get empty(): boolean {
    return this.progress.size === 0 && this.done.size === 0;
  }

  toJSON(): BountySave {
    const p: Record<string, number> = {};
    for (const [k, v] of this.progress) p[k] = Math.floor(v);
    return { d: this.day, ...(Object.keys(p).length > 0 ? { p } : {}), ...(this.done.size > 0 ? { c: [...this.done] } : {}) };
  }

  /** Reads a save (anything unknown or out of range is dropped). A save of another day is not kept: the day starts over when it is asked about. */
  loadJSON(raw: unknown): void {
    this.day = -1;
    this.progress.clear();
    this.done.clear();
    if (typeof raw !== 'object' || raw === null) return;
    const o = raw as BountySave;
    if (typeof o.d !== 'number' || !Number.isInteger(o.d) || o.d < 0) return;
    this.day = o.d;
    if (typeof o.p === 'object' && o.p !== null) {
      for (const [k, v] of Object.entries(o.p)) {
        const b = BOUNTY_BY_ID.get(k);
        if (b && typeof v === 'number' && Number.isFinite(v) && v > 0) this.progress.set(k, Math.min(b.goal, Math.floor(v)));
      }
    }
    if (Array.isArray(o.c)) for (const id of o.c) if (typeof id === 'string' && BOUNTY_BY_ID.has(id)) this.done.add(id);
  }
}
