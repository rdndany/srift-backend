/**
 * Achievements: a list of deeds (reach a level, slay a number of monsters, bring down a boss, clear a dungeon ...), each
 * with a goal and a tier. A character keeps a count for every kind of deed and the list of the achievements it has won; the
 * server counts, the client only shows. The tier is what a deed will pay in $SOLRIFT once the token is live (see `ACH_TIERS`):
 * until then an achievement is won, kept with the character, and shown, and nothing is paid out.
 */

/** The things that are counted. */
export type AchStat = 'level' | 'kills' | 'elites' | 'bosses' | 'dungeons' | 'quests' | 'coins' | 'minutes';

export type AchCategory = 'level' | 'slayer' | 'boss' | 'dungeon' | 'quest' | 'wealth' | 'time';

/** How big the reward is meant to be, from a first step to a feat that few will do. */
export type AchTier = 'bronze' | 'silver' | 'gold' | 'mythic';

export interface AchTierDef {
  readonly id: AchTier;
  readonly name: string;
  /**
   * The reward, in $SOLRIFT, an achievement of this tier is meant to pay once the token is live. It is not paid out today, and
   * it is a plan: the website shows the tier, not this number, until the token's supply and reward pool are decided.
   */
  readonly reward: number;
}

export const ACH_TIERS: Record<AchTier, AchTierDef> = {
  bronze: { id: 'bronze', name: 'Bronze', reward: 5 },
  silver: { id: 'silver', name: 'Silver', reward: 15 },
  gold: { id: 'gold', name: 'Gold', reward: 40 },
  mythic: { id: 'mythic', name: 'Mythic', reward: 120 },
};
export const ACH_TIER_ORDER: readonly AchTier[] = ['bronze', 'silver', 'gold', 'mythic'];

export interface AchievementDef {
  readonly id: string;
  readonly name: string;
  /** What to do, as a sentence. */
  readonly text: string;
  readonly category: AchCategory;
  readonly stat: AchStat;
  /** The count the stat has to reach. */
  readonly goal: number;
  readonly tier: AchTier;
}

export const ACH_CATEGORIES: Record<AchCategory, { name: string; blurb: string }> = {
  level: { name: 'Levels', blurb: 'Grow your hero.' },
  slayer: { name: 'Slayer', blurb: 'Hunt what lives in the realm.' },
  boss: { name: 'Bosses', blurb: 'Bring down the kings.' },
  dungeon: { name: 'Dungeons', blurb: 'Go deep and come back.' },
  quest: { name: 'Quests', blurb: 'Help the people of Dawnwatch.' },
  wealth: { name: 'Fortune', blurb: 'Earn Auren.' },
  time: { name: 'Time', blurb: 'Stay a while in the rift.' },
};

const A = (id: string, name: string, category: AchCategory, stat: AchStat, goal: number, tier: AchTier, text: string): AchievementDef => ({ id, name, text, category, stat, goal, tier });

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  // ---- levels (the class level, or the experience level of a hero without a class) ----
  A('lvl-5', 'First Steps', 'level', 'level', 5, 'bronze', 'Reach level 5.'),
  A('lvl-10', 'Sworn Adventurer', 'level', 'level', 10, 'bronze', 'Reach level 10.'),
  A('lvl-15', 'Seasoned Fighter', 'level', 'level', 15, 'silver', 'Reach level 15.'),
  A('lvl-20', 'Veteran of the Rift', 'level', 'level', 20, 'silver', 'Reach level 20.'),
  A('lvl-25', 'Champion of Dawnwatch', 'level', 'level', 25, 'gold', 'Reach level 25.'),
  A('lvl-30', 'Legend of the Realm', 'level', 'level', 30, 'mythic', 'Reach level 30, the highest there is.'),

  // ---- slayer ----
  A('kill-25', 'Pest Control', 'slayer', 'kills', 25, 'bronze', 'Slay 25 monsters.'),
  A('kill-100', 'Monster Hunter', 'slayer', 'kills', 100, 'bronze', 'Slay 100 monsters.'),
  A('kill-500', 'Slayer', 'slayer', 'kills', 500, 'silver', 'Slay 500 monsters.'),
  A('kill-2000', 'Scourge of the Dark', 'slayer', 'kills', 2000, 'gold', 'Slay 2,000 monsters.'),
  A('kill-10000', 'Bane of the Rift', 'slayer', 'kills', 10000, 'mythic', 'Slay 10,000 monsters.'),
  A('elite-1', 'Hard Target', 'slayer', 'elites', 1, 'bronze', 'Defeat an elite monster, the ones with a name over their heads.'),
  A('elite-10', 'Elite Hunter', 'slayer', 'elites', 10, 'silver', 'Defeat 10 elite monsters.'),
  A('elite-50', 'Elite Bane', 'slayer', 'elites', 50, 'gold', 'Defeat 50 elite monsters.'),

  // ---- bosses ----
  A('boss-1', 'King-Slayer', 'boss', 'bosses', 1, 'silver', 'Bring down a boss, such as the Hollow King.'),
  A('boss-5', 'Boss Breaker', 'boss', 'bosses', 5, 'gold', 'Bring down 5 bosses.'),
  A('boss-25', 'Bane of Kings', 'boss', 'bosses', 25, 'mythic', 'Bring down 25 bosses.'),

  // ---- dungeons ----
  A('deep-1', 'Delver', 'dungeon', 'dungeons', 1, 'silver', 'Clear the Hollow Deep: break the cages, open the gates and fell the Hollow King.'),
  A('deep-5', 'Deep Diver', 'dungeon', 'dungeons', 5, 'gold', 'Clear the Hollow Deep 5 times.'),
  A('deep-20', 'Master of the Deep', 'dungeon', 'dungeons', 20, 'mythic', 'Clear the Hollow Deep 20 times.'),

  // ---- quests ----
  A('quest-1', 'Helping Hand', 'quest', 'quests', 1, 'bronze', 'Hand in your first quest.'),
  A('quest-5', 'Hero of Dawnwatch', 'quest', 'quests', 5, 'bronze', 'Hand in 5 quests.'),
  A('quest-10', 'Quest Master', 'quest', 'quests', 10, 'silver', 'Hand in 10 quests.'),

  // ---- fortune ----
  A('coin-1000', 'Pocket Change', 'wealth', 'coins', 1000, 'bronze', 'Earn 1,000 Auren in all.'),
  A('coin-10000', 'Well Off', 'wealth', 'coins', 10000, 'silver', 'Earn 10,000 Auren in all.'),
  A('coin-100000', 'Wealthy', 'wealth', 'coins', 100000, 'gold', 'Earn 100,000 Auren in all.'),
  A('coin-1000000', 'Rich as a King', 'wealth', 'coins', 1000000, 'mythic', 'Earn 1,000,000 Auren in all.'),

  // ---- time ----
  A('time-1', 'Settling In', 'time', 'minutes', 60, 'bronze', 'Play for 1 hour.'),
  A('time-10', 'A Regular', 'time', 'minutes', 600, 'silver', 'Play for 10 hours.'),
  A('time-50', 'Dedicated', 'time', 'minutes', 3000, 'gold', 'Play for 50 hours.'),
  A('time-200', 'Citizen of the Rift', 'time', 'minutes', 12000, 'mythic', 'Play for 200 hours.'),
];

export const ACHIEVEMENT_BY_ID: ReadonlyMap<string, AchievementDef> = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/** The stats as a record (every one, from zero). */
const ZERO = (): Record<AchStat, number> => ({ level: 0, kills: 0, elites: 0, bosses: 0, dungeons: 0, quests: 0, coins: 0, minutes: 0 });
const STATS = Object.keys(ZERO()) as AchStat[];

/** What is saved of a character's achievements: the counts and the ids won. */
export interface AchievementSave {
  /** The counts, by stat (only the ones above zero). */
  s?: Partial<Record<AchStat, number>>;
  /** The ids of the achievements won. */
  d?: string[];
}

/** What the client is told: the same, in full. */
export interface AchievementView {
  stats: Record<AchStat, number>;
  done: string[];
}

/** Counts that cannot be believed from a save (a hostile one cannot hand itself every achievement by a huge number). */
const STAT_CAP: Record<AchStat, number> = { level: 100, kills: 10_000_000, elites: 1_000_000, bosses: 1_000_000, dungeons: 1_000_000, quests: 10_000, coins: 2_000_000_000, minutes: 6_000_000 };

/**
 * A character's achievements: the counts of its deeds and the achievements they have won. `add` and `reach` change a count
 * and give back the achievements it just won (so the caller can tell the player).
 */
export class AchievementBook {
  private readonly stats = ZERO();
  private readonly won = new Set<string>();

  /** How many of a deed there have been. */
  get(stat: AchStat): number {
    return this.stats[stat];
  }

  has(id: string): boolean {
    return this.won.has(id);
  }

  get count(): number {
    return this.won.size;
  }

  /** The $SOLRIFT the achievements won so far are meant to pay (a plan: see `ACH_TIERS`). */
  get rewardTotal(): number {
    let n = 0;
    for (const id of this.won) {
      const a = ACHIEVEMENT_BY_ID.get(id);
      if (a) n += ACH_TIERS[a.tier].reward;
    }
    return n;
  }

  /** A deed (or several) was done: count it. */
  add(stat: AchStat, n = 1): AchievementDef[] {
    if (!(n > 0) || !Number.isFinite(n)) return [];
    this.stats[stat] = Math.min(STAT_CAP[stat], this.stats[stat] + n);
    return this.check(stat);
  }

  /** A level was reached: the count only ever goes up. */
  reach(stat: AchStat, value: number): AchievementDef[] {
    if (!Number.isFinite(value) || value <= this.stats[stat]) return [];
    this.stats[stat] = Math.min(STAT_CAP[stat], Math.floor(value));
    return this.check(stat);
  }

  /** Won the achievements of a stat whose goals are met and are not won yet. */
  private check(stat: AchStat): AchievementDef[] {
    const out: AchievementDef[] = [];
    for (const a of ACHIEVEMENTS) {
      if (a.stat !== stat || this.won.has(a.id) || this.stats[stat] < a.goal) continue;
      this.won.add(a.id);
      out.push(a);
    }
    return out;
  }

  view(): AchievementView {
    return { stats: { ...this.stats }, done: [...this.won] };
  }

  toJSON(): AchievementSave {
    const s: Partial<Record<AchStat, number>> = {};
    for (const k of STATS) if (this.stats[k] > 0) s[k] = Math.floor(this.stats[k]);
    return { ...(Object.keys(s).length > 0 ? { s } : {}), ...(this.won.size > 0 ? { d: [...this.won] } : {}) };
  }

  /** Reads a save (anything unknown or out of range is dropped). The achievements won are kept as saved, and those the counts already earn are won too. */
  loadJSON(raw: unknown): void {
    for (const k of STATS) this.stats[k] = 0;
    this.won.clear();
    if (typeof raw !== 'object' || raw === null) return;
    const o = raw as AchievementSave;
    if (typeof o.s === 'object' && o.s !== null) {
      for (const k of STATS) {
        const v = (o.s as Record<string, unknown>)[k];
        if (typeof v === 'number' && Number.isFinite(v) && v > 0) this.stats[k] = Math.min(STAT_CAP[k], Math.floor(v));
      }
    }
    if (Array.isArray(o.d)) for (const id of o.d) if (typeof id === 'string' && ACHIEVEMENT_BY_ID.has(id)) this.won.add(id);
    // (A new achievement added to the list is won at once by a character that has already done the deed.)
    for (const a of ACHIEVEMENTS) if (this.stats[a.stat] >= a.goal) this.won.add(a.id);
  }

  /** Progress towards an achievement, 0..1. */
  progress(a: AchievementDef): number {
    return this.won.has(a.id) ? 1 : Math.min(1, this.stats[a.stat] / a.goal);
  }
}
