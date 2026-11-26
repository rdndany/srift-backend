import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, ACH_TIERS, AchievementBook, achievementsFor, type AchStat } from './achievements';
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

  it('keeps the island and the realm on separate boards', () => {
    const realm = new AchievementBook();
    const isle = new AchievementBook();
    isle.board = 'isle';
    expect(achievementsFor('realm').every((a) => a.board === 'realm')).toBe(true);
    expect(achievementsFor('isle').every((a) => a.board === 'isle')).toBe(true);
    expect(achievementsFor('isle').length).toBeGreaterThan(0);
    expect(realm.add('kills', 100).map((a) => a.id)).toContain('kill-25');
    expect(isle.add('kills', 100)).toEqual([]);
    expect(isle.reach('days', 8).map((a) => a.id)).toEqual(['isle-day-2', 'isle-day-5', 'isle-day-8']);
    expect(realm.reach('days', 32)).toEqual([]);
    expect(isle.add('drowned').map((a) => a.id)).toEqual(['isle-drown-1']);
    expect(isle.rewardTotal).toBe(0);

    const kept = new AchievementBook();
    kept.board = 'isle';
    kept.loadJSON({ s: { days: 5, kills: 500 }, d: ['lvl-5', 'isle-day-2', 'nope'] });
    expect(kept.has('isle-day-2')).toBe(true);
    expect(kept.has('isle-day-5')).toBe(true);
    expect(kept.has('lvl-5')).toBe(false);
    expect(kept.has('kill-25')).toBe(false);

    const realmSave = new AchievementBook();
    realmSave.loadJSON({ s: { days: 32, moons: 4 }, d: ['isle-moon-1', 'lvl-5'] });
    expect(realmSave.has('isle-moon-1')).toBe(false);
    expect(realmSave.has('lvl-5')).toBe(true);
    expect(realmSave.has('isle-day-32')).toBe(false);
  });

  it('keeps a wallet\'s deeds on the next character, and does not award them again', () => {
    const first = new AchievementBook();
    first.add('kills', 25);
    first.reach('level', 10);
    const next = new AchievementBook();
    next.adopt(first.toJSON());
    expect(next.has('kill-25')).toBe(true);
    expect(next.has('lvl-5')).toBe(true);
    expect(next.has('lvl-10')).toBe(true);
    expect(next.add('kills')).toEqual([]);
    expect(next.get('kills')).toBe(26);
    const behind = new AchievementBook();
    behind.add('kills', 10);
    behind.adopt(next.toJSON());
    expect(behind.get('kills')).toBe(26);
    expect(behind.has('kill-25')).toBe(true);
    const isle = new AchievementBook();
    isle.board = 'isle';
    isle.adopt(first.toJSON());
    expect(isle.has('kill-25')).toBe(false);
    expect(isle.has('lvl-5')).toBe(false);
    expect(isle.get('kills')).toBe(0);
  });
});
