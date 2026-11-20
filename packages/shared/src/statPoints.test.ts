import { describe, expect, it } from 'vitest';
import {
  CLASS_LEVELS,
  ClassState,
  GameSession,
  HeadlessWorld,
  MAX_POINTS,
  POINTS_PER_LEVEL,
  WorldGenerator,
  computeStats,
  mulberry32,
  parseClassSave,
  parseSessionMessage,
  pointModifier,
  pointsForLevel,
  sheetOfSave,
} from './index';

const grown = (level: number, classId: 'warrior' | 'mage' | 'ranger' = 'warrior'): ClassState => {
  const c = new ClassState(classId);
  c.raiseLevel(level);
  return c;
};

describe('stat points (MU Online style)', () => {
  it('every level gives 5 points, none at level 1, 145 at the cap of 30', () => {
    expect(POINTS_PER_LEVEL).toBe(5);
    expect(pointsForLevel(1)).toBe(0);
    expect(pointsForLevel(2)).toBe(5);
    expect(pointsForLevel(CLASS_LEVELS.max)).toBe(145);
    expect(MAX_POINTS).toBe(145);
    expect(grown(7).freePoints).toBe(30);
  });

  it('spending is capped by what is left, and a character that was already high has its points waiting', () => {
    const c = grown(3);
    expect(c.freePoints).toBe(10);
    expect(c.spendPoints('str', 4)).toBe(4);
    expect(c.spendPoints('vit', 99)).toBe(6);
    expect(c.freePoints).toBe(0);
    expect(c.spendPoints('ene', 1)).toBe(0);
    expect([...c.points]).toEqual([4, 0, 6, 0]);
    c.raiseLevel(4);
    expect(c.freePoints).toBe(5);
  });

  it('refuses nonsense', () => {
    const c = grown(5);
    expect(c.spendPoints('str', -3)).toBe(0);
    expect(c.spendPoints('str', NaN)).toBe(0);
    expect(c.spendPoints('str', 0.9)).toBe(0);
    expect(c.spendPoints('luck' as 'str', 1)).toBe(0);
    expect(c.freePoints).toBe(20);
  });

  it('each stat changes what it should', () => {
    const base = computeStats('warrior', 11);
    const c = grown(11);
    c.spendPoints('str', 10);
    expect(c.stats.damage.melee).toBeCloseTo(base.damage.melee * 1.05, 3);
    expect(c.stats.damage.spell).toBeCloseTo(base.damage.spell, 5);

    const a = grown(11);
    a.spendPoints('agi', 20);
    expect(a.stats.damage.ranged).toBeGreaterThan(base.damage.ranged);
    expect(a.stats.critChance).toBeGreaterThan(base.critChance);
    expect(a.stats.attackSpeed).toBeGreaterThan(base.attackSpeed);
    expect(a.stats.moveSpeed).toBeGreaterThan(base.moveSpeed);

    const v = grown(11);
    v.spendPoints('vit', 20);
    expect(v.stats.maxHealth).toBeCloseTo(base.maxHealth + 3, 3);
    expect(v.stats.damageTaken).toBeLessThan(base.damageTaken);

    const e = grown(11, 'mage');
    const mageBase = computeStats('mage', 11);
    e.spendPoints('ene', 20);
    expect(e.stats.damage.spell).toBeGreaterThan(mageBase.damage.spell);
    expect(e.stats.maxResource).toBeCloseTo(mageBase.maxResource + 16, 3);
    expect(e.stats.resourceRegen).toBeGreaterThan(mageBase.resourceRegen);
  });

  it('the whole 145 in one stat stays inside the game\'s sanity limits', () => {
    for (const k of ['str', 'agi', 'vit', 'ene'] as const) {
      const c = grown(30);
      expect(c.spendPoints(k, 999)).toBe(145);
      const s = c.stats;
      expect(s.maxHealth).toBeLessThanOrEqual(200);
      expect(s.moveSpeed).toBeLessThanOrEqual(1.6);
      expect(s.critChance).toBeLessThanOrEqual(0.75);
      expect(s.attackSpeed).toBeLessThanOrEqual(2);
    }
    expect(pointModifier([0, 0, 0, 0])).toBeNull();
  });

  it('a reset gives every point back', () => {
    const c = grown(6);
    const before = c.stats.maxHealth;
    c.spendPoints('vit', 25);
    expect(c.stats.maxHealth).toBeGreaterThan(before);
    expect(c.resetPoints()).toBe(25);
    expect(c.freePoints).toBe(25);
    expect(c.stats.maxHealth).toBe(before);
    expect(c.resetPoints()).toBe(0);
  });

  it('is saved and loaded, and a saved record is never trusted', () => {
    const c = grown(10);
    c.spendPoints('str', 12);
    c.spendPoints('ene', 8);
    const save = JSON.parse(JSON.stringify(c.toJSON()));
    expect(save.pts).toEqual([12, 0, 0, 8]);
    const back = new ClassState('warrior');
    back.load(save);
    expect([...back.points]).toEqual([12, 0, 0, 8]);
    expect(back.freePoints).toBe(25);
    expect(back.stats).toEqual(c.stats);

    // Nothing spent: nothing written (old saves keep their shape).
    expect('pts' in grown(10).toJSON()).toBe(false);

    const base = { id: 'warrior', lvl: 4, xp: 0, unlocked: [] };
    expect(parseClassSave({ ...base, pts: 'lots' }, 'warrior')!.pts).toBeUndefined();
    expect(parseClassSave({ ...base, pts: [-5, NaN, 'x', null] }, 'warrior')!.pts).toBeUndefined();
    expect(parseClassSave({ ...base, pts: [1.9, 2, 0, 0] }, 'warrior')!.pts).toEqual([1, 2, 0, 0]);
    // More than level 4 has given (15): the surplus is cut, the last stat first.
    const greedy = parseClassSave({ ...base, pts: [10, 10, 10, 10] }, 'warrior')!.pts!;
    expect(greedy.reduce((a, b) => a + b, 0)).toBe(15);
    expect(greedy).toEqual([10, 5, 0, 0]);
    expect(parseClassSave({ ...base, pts: [1e12, 0, 0, 0] }, 'warrior')!.pts).toEqual([15, 0, 0, 0]);
  });

  it('the lobby sheet counts the points in the health it shows', () => {
    const plain = sheetOfSave({ v: 1, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, mode: 'survival', selected: 0, inv: [], vitals: null, mobs: [], cls: { v: 1, id: 'warrior', lvl: 21, xp: 0, unlocked: [] }, of: true } as never, 'warrior');
    const spent = sheetOfSave({ v: 1, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, mode: 'survival', selected: 0, inv: [], vitals: null, mobs: [], cls: { v: 1, id: 'warrior', lvl: 21, xp: 0, unlocked: [], pts: [0, 0, 100, 0] }, of: true } as never, 'warrior');
    expect(spent.maxHealth).toBe(plain.maxHealth + 15);
  });

  it('the message is checked: only a known stat and a sensible whole number get through', () => {
    expect(parseSessionMessage({ t: 'stat', stat: 'str', n: 5 })).toEqual({ t: 'stat', stat: 'str', n: 5 });
    expect(parseSessionMessage({ t: 'stat', stat: 'agi', n: 1, extra: 1 })).toEqual({ t: 'stat', stat: 'agi', n: 1 });
    expect(parseSessionMessage({ t: 'statReset' })).toEqual({ t: 'statReset' });
    for (const bad of [{ stat: 'luck', n: 1 }, { stat: 'str', n: 0 }, { stat: 'str', n: -1 }, { stat: 'str', n: 1.5 }, { stat: 'str', n: 1e9 }, { stat: 'str' }, { stat: 7, n: 1 }, { n: 1 }]) {
      expect(parseSessionMessage({ t: 'stat', ...bad })).toBeNull();
    }
  });
});

describe('stat points in a session', () => {
  const FLOOR = 100;
  function session() {
    const generator = new WorldGenerator(1337);
    const world = new HeadlessWorld(generator);
    for (let x = -4; x <= 20; x++)
      for (let z = -4; z <= 20; z++) {
        for (let y = FLOOR + 1; y < FLOOR + 8; y++) world.setBlock(x, y, z, 0);
        world.setBlock(x, FLOOR, z, 1);
      }
    const s = new GameSession({ seed: 1337, world, generator, naturalSpawning: false, rand: mulberry32(7), classId: 'warrior' });
    s.finishLoading();
    s.teleport(8.5, FLOOR + 1, 8.5, 0, 0);
    s.drainEvents();
    return s;
  }

  it('the server spends them on request, health follows, and the view reports them', () => {
    const s = session();
    expect(s.classView()!.free).toBe(0);
    s.apply({ t: 'stat', stat: 'vit', n: 3 }); // no points yet: nothing happens
    expect(s.classView()!.pts).toEqual([0, 0, 0, 0]);

    s.cls!.raiseLevel(5);
    expect(s.classView()!.free).toBe(20);
    const hp = Math.round(computeStats('warrior', 5).maxHealth);
    s.apply({ t: 'stat', stat: 'vit', n: 20 });
    const v = s.classView()!;
    expect(v.pts).toEqual([0, 0, 20, 0]);
    expect(v.free).toBe(0);
    expect(v.maxHealth).toBeGreaterThan(hp);
    expect(s.vitals.maxHealth).toBe(Math.round(s.cls!.stats.maxHealth));

    s.apply({ t: 'stat', stat: 'str', n: 5 }); // none left
    expect(s.classView()!.pts).toEqual([0, 0, 20, 0]);

    s.apply({ t: 'statReset' });
    expect(s.classView()!.free).toBe(20);
    expect(s.vitals.maxHealth).toBe(hp);
  });
});
