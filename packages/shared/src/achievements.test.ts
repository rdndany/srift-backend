import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, ACH_TIERS, AchievementBook, type AchStat } from './achievements';
import { CLASS_LEVELS } from './classes';

describe('achievements', () => {
  it('ids are unique and goals rise within a stat', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    const last = new Map<AchStat, number>();
    for (const a of ACHIEVEMENTS) {
      expect(a.goal).toBeGreaterThan(last.get(a.stat) ?? 0);
      last.set(a.stat, a.goal);
      expect(ACH_TIERS[a.tier]).toBeTruthy();
    }
  });

  it('the level goals reach the highest level and no further', () => {
    const top = Math.max(...ACHIEVEMENTS.filter((a) => a.stat === 'level').map((a) => a.goal));
    expect(top).toBe(CLASS_LEVELS.max);
  });

  it('a level reached wins every milestone passed, once', () => {
    const b = new AchievementBook();
    expect(b.reach('level', 4)).toEqual([]);
    expect(b.reach('level', 12).map((a) => a.id)).toEqual(['lvl-5', 'lvl-10']);
    expect(b.reach('level', 12)).toEqual([]);
    expect(b.reach('level', 3)).toEqual([]);
    expect(b.get('level')).toBe(12);
  });

  it('counted deeds win at their goal', () => {
    const b = new AchievementBook();
    for (let i = 0; i < 24; i++) expect(b.add('kills')).toEqual([]);
    expect(b.add('kills').map((a) => a.id)).toEqual(['kill-25']);
    expect(b.add('bosses').map((a) => a.id)).toEqual(['boss-1']);
    expect(b.add('kills', -5)).toEqual([]);
    expect(b.add('kills', NaN)).toEqual([]);
  });

  it('survives a save, and drops what is not believable', () => {
    const b = new AchievementBook();
    b.add('kills', 150);
    b.reach('level', 10);
    const c = new AchievementBook();
    c.loadJSON(JSON.parse(JSON.stringify(b.toJSON())));
    expect(c.view()).toEqual(b.view());
    expect(c.count).toBe(b.count);

    const bad = new AchievementBook();
    bad.loadJSON({ s: { kills: 'many', level: -3, bosses: Infinity }, d: ['nope', 7, 'lvl-5'] });
    expect(bad.get('kills')).toBe(0);
    expect(bad.get('level')).toBe(0);
    expect(bad.get('bosses')).toBe(0);
    expect(bad.has('lvl-5')).toBe(true);
    expect(bad.count).toBe(1);
    new AchievementBook().loadJSON(null);
  });

  it('an empty book saves as nothing', () => {
    expect(Object.keys(new AchievementBook().toJSON())).toHaveLength(0);
  });
});
