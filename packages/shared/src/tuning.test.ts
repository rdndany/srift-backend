import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CLASSIC_TUNING,
  ABILITY_BY_ID,
  ClassState,
  DEFAULT_TUNING,
  Experience,
  GameSession,
  HeadlessWorld,
  I,
  MAX_LEVEL,
  TUNING,
  WorldGenerator,
  abilityCost,
  castCost,
  computeStats,
  getItem,
  rollDamage,
  tooltipLines,
  makeStack,
  mulberry32,
  setTuning,
  totalForLevel,
  xpToNext,
  type SessionEvent,
} from './index';

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

describe('the game\'s tuning (big numbers, tough creatures, slow levels)', () => {
  beforeEach(() => setTuning(DEFAULT_TUNING));
  afterEach(() => setTuning(CLASSIC_TUNING));

  it('is what the game runs with', () => {
    expect(DEFAULT_TUNING.damageScale).toBeGreaterThanOrEqual(10);
    expect(DEFAULT_TUNING.mobToughness).toBeGreaterThan(1);
    expect(DEFAULT_TUNING.xpPace).toBe(true);
    expect(TUNING).toEqual(DEFAULT_TUNING);
  });

  it('levels take longer than the original curve at every step, and the total is the sum of the steps', () => {
    setTuning(CLASSIC_TUNING);
    const classic = Array.from({ length: MAX_LEVEL }, (_, l) => xpToNext(l));
    const classicTotal = totalForLevel(MAX_LEVEL);
    setTuning(DEFAULT_TUNING);
    let sum = 0;
    for (let l = 0; l < MAX_LEVEL; l++) {
      expect(xpToNext(l)).toBeGreaterThan(classic[l]!);
      expect(totalForLevel(l)).toBe(sum);
      sum += xpToNext(l);
    }
    expect(totalForLevel(MAX_LEVEL)).toBe(sum);
    expect(sum).toBeGreaterThan(classicTotal * 2.5);
  });

  it('the bar fills at the new pace: a few kills no longer give a level', () => {
    const xp = new Experience();
    const levels = xp.add(100); // 20 hostile kills' worth
    expect(levels).toBeLessThanOrEqual(4);
    expect(xp.total).toBe(100);
    const classicLevels = (() => {
      setTuning(CLASSIC_TUNING);
      const c = new Experience();
      return c.add(100);
    })();
    expect(classicLevels).toBeGreaterThan(levels);
  });

  it('creatures have far more health, and one point of damage counts for many', () => {
    const s = session();
    const id = s.spawnMob('zombie', 12.5, FLOOR + 1, 8.5);
    const m = s.mobs.mobs.find((x) => x.id === id)!;
    expect(m.maxHealth).toBe(20 * DEFAULT_TUNING.damageScale * DEFAULT_TUNING.mobToughness);
    s.damageMob(id, 4);
    expect(m.health).toBe(m.maxHealth - 4 * DEFAULT_TUNING.damageScale);
    // The same swings that killed a zombie before, times the toughness, kill it now.
    const swings = Math.ceil(20 * DEFAULT_TUNING.mobToughness / 4);
    for (let i = 0; i < swings - 1; i++) s.damageMob(id, 4);
    expect(m.dead).toBe(true);
  });

  it('the training dummy and the armor stand are not made tougher', () => {
    const s = session();
    const d = s.mobs.spawn('dummy', 12.5, FLOOR + 1, 8.5);
    expect(d.maxHealth).toBe(1000 * DEFAULT_TUNING.damageScale);
  });

  it('the number that floats up over a hit is in the hundreds', () => {
    const s = session();
    const id = s.spawnMob('zombie', 12.5, FLOOR + 1, 8.5);
    const m = s.mobs.mobs.find((x) => x.id === id)!;
    m.stunTime = 999;
    s.drainEvents();
    s.strike(m, 7, 'melee', { x: 8.5, z: 8.5 });
    const hit = s.drainEvents().find((e: SessionEvent) => e.t === 'dmg' && !e.taken) as Extract<SessionEvent, { t: 'dmg' }>;
    expect(hit).toBeTruthy();
    expect(hit.amount).toBeGreaterThanOrEqual(7 * DEFAULT_TUNING.damageScale * 0.5);
    expect(Number.isInteger(hit.amount)).toBe(true);
    expect(hit.amount).toBeGreaterThanOrEqual(100);
  });

  it('the tooltip of a weapon says the same bigger number', () => {
    const sword = getItem(I.GREATSWORD);
    const line = tooltipLines(makeStack(I.GREATSWORD, 1)).map((l) => l.text).find((t) => t.includes('Melee Damage'));
    expect(line).toContain(String((sword.weapon?.damage ?? 0) * DEFAULT_TUNING.damageScale));
  });

  it('no two hits are alike: a classed hit lands in a band around its damage', () => {
    const stats = { ...computeStats('warrior', 10), critChance: 0 };
    const rand = mulberry32(99);
    const seen = new Set<number>();
    const mid = 7 * stats.damage.melee;
    for (let i = 0; i < 300; i++) {
      const r = rollDamage(stats, 'melee', 7, rand);
      expect(r.amount).toBeGreaterThanOrEqual(mid * (1 - DEFAULT_TUNING.damageSpread) - 0.01);
      expect(r.amount).toBeLessThanOrEqual(mid * (1 + DEFAULT_TUNING.damageSpread) + 0.01);
      seen.add(Math.round(r.amount * DEFAULT_TUNING.damageScale));
    }
    expect(seen.size).toBeGreaterThan(40);
  });

  it('without a class the hit is the plain one, and in plain units it is exact', () => {
    expect(rollDamage(null, 'melee', 7, mulberry32(1)).amount).toBe(7);
    setTuning(CLASSIC_TUNING);
    const stats = { ...computeStats('warrior', 10), critChance: 0 };
    const a = rollDamage(stats, 'melee', 7, mulberry32(1)).amount;
    const b = rollDamage(stats, 'melee', 7, mulberry32(2)).amount;
    expect(a).toBe(b);
  });
});
describe('spending a class resource (a wand is a cheap basic attack, abilities are the real cost)', () => {
  beforeEach(() => setTuning(DEFAULT_TUNING));
  afterEach(() => setTuning(CLASSIC_TUNING));

  it('abilities cost more than the plain numbers, a bolt costs less, and the plain numbers stay exact', () => {
    expect(abilityCost(14)).toBe(21);
    expect(castCost(4)).toBe(3);
    setTuning(CLASSIC_TUNING);
    expect(abilityCost(14)).toBe(14);
    expect(castCost(4)).toBe(4);
  });

  it('a wand bolt costs a small share of a fireball', () => {
    const wand = castCost(getItem(I.WAND)!.weapon!.cost);
    const fireball = abilityCost(ABILITY_BY_ID.get('fireball')!.cost);
    expect(wand * 5).toBeLessThanOrEqual(fireball);
    expect(castCost(getItem(I.STAFF)!.weapon!.cost)).toBeLessThan(fireball);
    expect(castCost(getItem(I.SPELLBOOK)!.weapon!.cost)).toBeLessThan(fireball);
  });

  it('no bolt out-damages the ability it stands beside, second for second', () => {
    const fireball = ABILITY_BY_ID.get('fireball')!;
    const bolt = fireball.effect.t === 'bolt' ? fireball.effect.damage / fireball.cooldown : 0;
    const wand = getItem(I.WAND)!.weapon!;
    const staff = getItem(I.STAFF)!.weapon!;
    expect(wand.damage / wand.cooldown).toBeLessThan(bolt * 0.8);
    expect(staff.damage / staff.cooldown).toBeLessThanOrEqual(bolt);
    expect(staff.damage).toBeGreaterThan(wand.damage);
  });
  it('a mage who fires the wand without a stop runs dry, then is held to a slow trickle of casts', () => {
    const mage = new ClassState('mage');
    const cost = castCost(getItem(I.WAND)!.weapon!.cost);
    const cooldown = getItem(I.WAND)!.weapon!.cooldown;
    const total = 90;
    let casts = 0;
    let late = 0;
    for (let t = 0; t < total; t += cooldown) {
      if (mage.spend(cost)) {
        casts++;
        if (t >= total - 30) late++;
      }
      mage.tick(cooldown);
    }
    expect(casts).toBeGreaterThanOrEqual(Math.floor(120 / cost));
    // an unbroken wand would fire ~200 times in 90 s and ~66 in the last 30
    expect(casts).toBeLessThan(110);
    expect(late).toBeLessThan(25);
  });

  it('the resource waits a moment after a bolt, longer after an ability, then comes back more slowly than before', () => {
    const mage = new ClassState('mage');
    mage.spend(60);
    mage.tick(TUNING.castRegenDelay - 0.2);
    expect(mage.resource).toBe(60);
    mage.tick(5);
    expect(mage.resource).toBeGreaterThan(60);
    expect(mage.stats.resourceRegen).toBeCloseTo(7 * TUNING.regen, 1);

    const caster = new ClassState('mage');
    caster.commit('fireball');
    const left = caster.resource;
    caster.tick(TUNING.regenDelay - 0.2);
    expect(caster.resource).toBe(left);
    // a bolt straight after must not cut that wait short
    caster.spend(1);
    caster.tick(0.3);
    expect(caster.resource).toBe(left - 1);
  });
});