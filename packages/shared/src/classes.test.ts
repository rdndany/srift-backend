import { describe, expect, it } from 'vitest';
import {
  ABILITIES,
  ABILITY_BY_ID,
  ABILITY_SLOTS,
  CLASSES,
  CLASS_BALANCE,
  CLASS_IDS,
  CLASS_LEVELS,
  ClassState,
  abilitiesOf,
  abilityAt,
  computeStats,
  damageAfterDefense,
  I,
  getItem,
  isClassId,
  parseClassSave,
  rollDamage,
  type AbilityId,
  type ClassId,
} from './index';

const never = () => 0.999; // never a critical hit
const always = () => 0; // always a critical hit

describe('the three classes', () => {
  it('are the three main classes, each with a full description for the selection screen', () => {
    expect([...CLASS_IDS]).toEqual(['warrior', 'mage', 'ranger']);
    for (const id of CLASS_IDS) {
      const c = CLASSES[id];
      expect(c.id).toBe(id);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(40);
      expect(c.role.length).toBeGreaterThan(0);
      expect(c.strengths.length).toBeGreaterThanOrEqual(2);
      expect(c.weaknesses.length).toBeGreaterThanOrEqual(2);
      expect(c.resource.name.length).toBeGreaterThan(0);
      expect(c.startingKit.some((k) => k.id === c.startingWeapon)).toBe(true);
      const w = getItem(c.startingWeapon);
      expect(Boolean(w.weapon || w.tool || w.id === I.BOW)).toBe(true);
    }
  });

  it('use their own resource', () => {
    expect(CLASSES.warrior.resource.name).toBe('Stamina');
    expect(CLASSES.mage.resource.name).toBe('Mana');
    expect(CLASSES.ranger.resource.name).toBe('Focus');
  });

  it('have no specializations yet, but have a place for them', () => {
    for (const id of CLASS_IDS) expect(CLASSES[id].specializations).toEqual([]);
  });

  it('are recognised by id and nothing else is', () => {
    for (const id of CLASS_IDS) expect(isClassId(id)).toBe(true);
    for (const bad of ['', 'Warrior', 'paladin', null, undefined, 3, {}, ['warrior']]) expect(isClassId(bad)).toBe(false);
  });

  it('play to their roles (the balance table keeps its shape)', () => {
    const w = CLASS_BALANCE.warrior;
    const m = CLASS_BALANCE.mage;
    const r = CLASS_BALANCE.ranger;
    // tank: the most health, the toughest, best at melee
    expect(w.maxHealth).toBeGreaterThan(r.maxHealth);
    expect(r.maxHealth).toBeGreaterThan(m.maxHealth);
    expect(w.damageTaken).toBeLessThan(r.damageTaken);
    expect(m.damageTaken).toBeGreaterThan(r.damageTaken);
    expect(w.damage.melee).toBeGreaterThan(m.damage.melee);
    expect(w.damage.melee).toBeGreaterThan(r.damage.melee);
    // mage: spells; ranger: arrows, speed, crits
    expect(m.damage.spell).toBeGreaterThan(w.damage.spell);
    expect(m.damage.spell).toBeGreaterThan(r.damage.spell);
    expect(r.damage.ranged).toBeGreaterThan(w.damage.ranged);
    expect(r.damage.ranged).toBeGreaterThan(m.damage.ranged);
    expect(r.moveSpeed).toBeGreaterThan(w.moveSpeed);
    expect(r.moveSpeed).toBeGreaterThan(m.moveSpeed);
    expect(r.critChance).toBeGreaterThan(w.critChance);
    expect(r.critChance).toBeGreaterThan(m.critChance);
    expect(r.attackSpeed).toBeGreaterThan(w.attackSpeed);
    expect(m.maxResource).toBeGreaterThan(w.maxResource);
  });
});

describe('class stats', () => {
  it('start at the table values at level one', () => {
    for (const id of CLASS_IDS)
      expect(computeStats(id, 1)).toEqual(expect.objectContaining({ maxHealth: CLASS_BALANCE[id].maxHealth, moveSpeed: CLASS_BALANCE[id].moveSpeed, damageTaken: CLASS_BALANCE[id].damageTaken }));
  });

  it('grow with the level, and only up to the cap', () => {
    for (const id of CLASS_IDS) {
      let last = computeStats(id, 1);
      for (let lv = 2; lv <= CLASS_LEVELS.max; lv++) {
        const s = computeStats(id, lv);
        expect(s.maxHealth).toBeGreaterThan(last.maxHealth);
        expect(s.damage.melee).toBeGreaterThan(last.damage.melee);
        expect(s.maxResource).toBeGreaterThan(last.maxResource);
        last = s;
      }
      expect(computeStats(id, 999)).toEqual(computeStats(id, CLASS_LEVELS.max));
    }
  });

  it('treat nonsense levels as level one or the cap', () => {
    expect(computeStats('mage', NaN)).toEqual(computeStats('mage', 1));
    expect(computeStats('mage', -5)).toEqual(computeStats('mage', 1));
    expect(computeStats('mage', 2.9)).toEqual(computeStats('mage', 2));
    expect(computeStats('mage', Infinity)).toEqual(computeStats('mage', 1));
  });

  it('apply modifiers from gear, buffs and specializations on top', () => {
    const base = computeStats('warrior', 5);
    const geared = computeStats('warrior', 5, [
      { health: 6, damage: { melee: 1.1 }, damageTaken: 0.9, moveSpeed: 1.05, critChance: 0.05, critDamage: 0.25, attackSpeed: 1.1, resource: 20, resourceRegen: 2 },
    ]);
    expect(geared.maxHealth).toBe(base.maxHealth + 6);
    expect(geared.damage.melee).toBeCloseTo(base.damage.melee * 1.1, 3);
    expect(geared.damage.spell).toBe(base.damage.spell);
    expect(geared.damageTaken).toBeCloseTo(base.damageTaken * 0.9, 3);
    expect(geared.moveSpeed).toBeCloseTo(base.moveSpeed * 1.05, 3);
    expect(geared.critChance).toBeCloseTo(base.critChance + 0.05, 3);
    expect(geared.critDamage).toBeCloseTo(base.critDamage + 0.25, 3);
    expect(geared.maxResource).toBe(base.maxResource + 20);
    expect(geared.resourceRegen).toBe(base.resourceRegen + 2);
    const twice = computeStats('warrior', 5, [{ health: 2 }, { health: 3 }]);
    expect(twice.maxHealth).toBe(base.maxHealth + 5);
  });

  it('never leave sane limits, however many bonuses stack', () => {
    const huge = computeStats('ranger', 20, [{ health: 1e6, moveSpeed: 50, critChance: 5, critDamage: 50, attackSpeed: 50, damageTaken: 0, damage: { melee: -3 } }]);
    expect(huge.maxHealth).toBeLessThanOrEqual(200);
    expect(huge.moveSpeed).toBeLessThanOrEqual(1.6);
    expect(huge.critChance).toBeLessThanOrEqual(0.75);
    expect(huge.critDamage).toBeLessThanOrEqual(4);
    expect(huge.attackSpeed).toBeLessThanOrEqual(2);
    expect(huge.damageTaken).toBeGreaterThanOrEqual(0.1);
    expect(huge.damage.melee).toBeGreaterThanOrEqual(0);
    const tiny = computeStats('mage', 1, [{ health: -1e6, moveSpeed: 0, attackSpeed: 0, resource: -1e6 }]);
    expect(tiny.maxHealth).toBeGreaterThanOrEqual(1);
    expect(tiny.moveSpeed).toBeGreaterThanOrEqual(0.4);
    expect(tiny.attackSpeed).toBeGreaterThanOrEqual(0.4);
    expect(tiny.maxResource).toBeGreaterThanOrEqual(0);
  });

  it('are the same every time they are asked for (the client and the server agree)', () => {
    expect(computeStats('mage', 7, [{ health: 1 }])).toEqual(computeStats('mage', 7, [{ health: 1 }]));
  });
});

describe('damage calculation', () => {
  it('passes the base damage through untouched without a class', () => {
    expect(rollDamage(null, 'melee', 7, never)).toEqual({ amount: 7, crit: false });
    expect(rollDamage(null, 'spell', 7, always)).toEqual({ amount: 7, crit: false });
    expect(damageAfterDefense(10, null)).toBe(10);
  });

  it('multiplies by the class number for the kind of damage', () => {
    const w = computeStats('warrior', 1);
    expect(rollDamage(w, 'melee', 8, never).amount).toBe(10);
    expect(rollDamage(w, 'ranged', 10, never).amount).toBe(7);
    expect(rollDamage(w, 'spell', 10, never).amount).toBe(6);
    const m = computeStats('mage', 1);
    expect(rollDamage(m, 'spell', 8, never).amount).toBe(12);
    const r = computeStats('ranger', 1);
    expect(rollDamage(r, 'ranged', 10, never).amount).toBe(13);
  });

  it('rolls a critical hit when the random number is under the chance, and only then', () => {
    const r = computeStats('ranger', 1);
    const hit = rollDamage(r, 'ranged', 10, always);
    expect(hit.crit).toBe(true);
    expect(hit.amount).toBeCloseTo(10 * 1.3 * 1.8, 3);
    expect(rollDamage(r, 'ranged', 10, () => r.critChance).crit).toBe(false);
    expect(rollDamage(r, 'ranged', 10, () => r.critChance - 0.001).crit).toBe(true);
  });

  it('crits about as often as the stat says', () => {
    const r = computeStats('ranger', 1);
    let n = 0;
    let seed = 12345;
    const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let i = 0; i < 20000; i++) if (rollDamage(r, 'ranged', 10, rand).crit) n++;
    expect(n / 20000).toBeGreaterThan(r.critChance - 0.02);
    expect(n / 20000).toBeLessThan(r.critChance + 0.02);
  });

  it('deals nothing for no damage', () => {
    expect(rollDamage(computeStats('warrior', 1), 'melee', 0, always).amount).toBe(0);
    expect(rollDamage(computeStats('warrior', 1), 'melee', -5, always).amount).toBe(0);
    expect(damageAfterDefense(-3, computeStats('warrior', 1))).toBe(0);
  });

  it('takes defense and temporary reduction off what a hit does', () => {
    const w = computeStats('warrior', 1);
    expect(damageAfterDefense(10, w)).toBeCloseTo(8, 5);
    expect(damageAfterDefense(10, w, 0.5)).toBeCloseTo(4, 5);
    const m = computeStats('mage', 1);
    expect(damageAfterDefense(10, m)).toBeGreaterThan(10);
  });

  it('gives a Warrior a longer life than a Mage against the same hits', () => {
    const w = computeStats('warrior', 1);
    const m = computeStats('mage', 1);
    const hitsToKill = (s: typeof w) => Math.ceil(s.maxHealth / damageAfterDefense(4, s));
    expect(hitsToKill(w)).toBeGreaterThan(hitsToKill(m) * 2);
  });
});

describe('class levels', () => {
  it('ask for more points at each level', () => {
    for (let lv = 1; lv < CLASS_LEVELS.max; lv++) expect(CLASS_LEVELS.toNext(lv + 1)).toBeGreaterThan(CLASS_LEVELS.toNext(lv));
    expect(CLASS_LEVELS.toNext(1)).toBeGreaterThan(0);
  });
});

describe('abilities', () => {
  it('give each class four, one for each button, with sane numbers', () => {
    for (const id of CLASS_IDS) {
      const list = abilitiesOf(id);
      expect(list.map((a) => a.slot)).toEqual([0, 1, 2, 3]);
      expect(list.length).toBe(ABILITY_SLOTS);
      for (const a of list) {
        expect(a.classId).toBe(id);
        expect(a.cooldown).toBeGreaterThan(0);
        expect(a.cost).toBeGreaterThan(0);
        expect(a.cost).toBeLessThanOrEqual(CLASS_BALANCE[id].maxResource);
        expect(a.unlockLevel).toBeGreaterThanOrEqual(1);
        expect(a.unlockLevel).toBeLessThanOrEqual(CLASS_LEVELS.max);
        expect(getItem(a.icon)).toBeTruthy();
        expect(abilityAt(id, a.slot)).toBe(a);
      }
      // a new character can start learning straight away: at least two of the books need no level
      expect(list.filter((a) => a.unlockLevel === 1).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('are the twelve the design names (the Warrior has Ground Slam), with unique ids', () => {
    const ids = ABILITIES.map((a) => a.id).sort();
    expect(new Set(ids).size).toBe(12);
    const named = (c: ClassId) => abilitiesOf(c).map((a) => a.name);
    expect(named('warrior').sort()).toEqual(['Charge', 'Ground Slam', 'Iron Defense', 'Shield Bash']);
    expect(named('mage').sort()).toEqual(['Arcane Shield', 'Fireball', 'Frost Nova', 'Meteor']);
    expect(named('ranger').sort()).toEqual(['Bear Trap', 'Evasive Roll', 'Piercing Shot', 'Rain of Arrows']);
    for (const a of ABILITIES) expect(ABILITY_BY_ID.get(a.id)).toBe(a);
  });

  it('can be affordable more than once in a row from a full pool of the right resource', () => {
    for (const id of CLASS_IDS) {
      const cheapest = Math.min(...abilitiesOf(id).map((a) => a.cost));
      expect(CLASS_BALANCE[id].maxResource / cheapest).toBeGreaterThanOrEqual(3);
    }
  });

  it('answers null for a button or class that does not exist', () => {
    expect(abilityAt('warrior', 4)).toBeNull();
    expect(abilityAt('warrior', -1)).toBeNull();
    expect(abilityAt('warrior', 0.5)).toBeNull();
  });
});

describe('the class state', () => {
  /** A class that has read every skill book its level allows (a character that has been playing for a while). */
  const stateAt = (id: ClassId, level = 1) => {
    const s = new ClassState(id);
    s.addXp(totalXpFor(level));
    for (const a of abilitiesOf(id)) s.learn(a.id);
    return s;
  };
  /** A class that knows all four of its abilities, whatever the level (for the tests of what they cost and how they cool down). */
  const knowingAll = (id: ClassId) => {
    const s = new ClassState(id);
    for (const a of abilitiesOf(id)) s.unlocked.add(a.id);
    return s;
  };
  const totalXpFor = (level: number) => {
    let t = 0;
    for (let lv = 1; lv < level; lv++) t += CLASS_LEVELS.toNext(lv);
    return t;
  };

  it('starts at level one, with a full resource and no ability learned', () => {
    for (const id of CLASS_IDS) {
      const s = new ClassState(id);
      expect(s.level).toBe(1);
      expect(s.resource).toBe(s.stats.maxResource);
      expect(s.unlocked.size).toBe(0);
      for (const a of abilitiesOf(id)) expect(s.block(a.id)).toBe('locked');
    }
  });

  it('refuses an ability that is not learned, an ability of another class and an unknown id', () => {
    const s = new ClassState('mage');
    expect(s.block('meteor')).toBe('locked');
    expect(s.block('fireball')).toBe('locked');
    expect(s.block('ground_slam')).toBe('locked');
    expect(s.block('nonsense' as AbilityId)).toBe('locked');
    expect(s.learn('fireball')).toBe('learned');
    expect(s.block('fireball')).toBeNull();
    expect(s.block('frost_nova')).toBe('locked'); // each ability is learned on its own
  });

  describe('learning from a skill book', () => {
    it('teaches the ability, once, and only the class\u2019s own', () => {
      const s = new ClassState('warrior');
      expect(s.learn('ground_slam')).toBe('learned');
      expect(s.unlocked.has('ground_slam')).toBe(true);
      expect(s.learn('ground_slam')).toBe('known');
      expect(s.learn('fireball')).toBe('class');
      expect(s.learn('nonsense' as AbilityId)).toBe('class');
      expect([...s.unlocked]).toEqual(['ground_slam']);
    });

    it('needs the level the ability asks for, and nothing is learned below it', () => {
      for (const a of ABILITIES) {
        const s = new ClassState(a.classId);
        expect(s.level).toBe(1);
        expect(s.learn(a.id)).toBe(a.unlockLevel <= 1 ? 'learned' : 'level');
        expect(s.unlocked.has(a.id)).toBe(a.unlockLevel <= 1);
      }
      const s = new ClassState('warrior');
      s.addXp(totalXpFor(3));
      expect(s.level).toBe(3);
      expect(s.learn('iron_defense')).toBe('level');
      expect(s.learn('charge')).toBe('learned');
    });

    it('is not what a level does: reaching one never teaches anything', () => {
      for (const id of CLASS_IDS) {
        const s = new ClassState(id);
        s.addXp(totalXpFor(CLASS_LEVELS.max));
        s.raiseLevel(CLASS_LEVELS.max);
        expect(s.level).toBe(CLASS_LEVELS.max);
        expect(s.unlocked.size).toBe(0);
      }
    });
  });

  it('charges the resource and starts the cooldown on a cast', () => {
    const s = knowingAll('mage');
    const fb = ABILITY_BY_ID.get('fireball')!;
    s.commit('fireball');
    expect(s.resource).toBeCloseTo(s.stats.maxResource - fb.cost, 5);
    expect(s.cooldownLeft('fireball')).toBe(fb.cooldown);
    expect(s.block('fireball')).toBe('cooldown');
    expect(s.block('frost_nova')).toBeNull(); // its own cooldown only
  });

  it('counts a cooldown down only as simulated time passes, and then allows the cast', () => {
    const s = knowingAll('warrior');
    s.commit('ground_slam');
    s.tick(3);
    expect(s.cooldownLeft('ground_slam')).toBeCloseTo(4, 5);
    expect(s.block('ground_slam')).toBe('cooldown');
    s.tick(4);
    expect(s.cooldownLeft('ground_slam')).toBe(0);
    expect(s.block('ground_slam')).toBeNull();
  });

  it('ignores a bad time step', () => {
    const s = new ClassState('warrior');
    s.commit('ground_slam');
    const left = s.cooldownLeft('ground_slam');
    s.tick(-5);
    s.tick(NaN);
    s.tick(0);
    expect(s.cooldownLeft('ground_slam')).toBe(left);
  });

  it('refuses a cast it cannot pay for, and recovers resource over time up to the pool size', () => {
    const s = knowingAll('warrior');
    s.resource = 10;
    expect(s.block('ground_slam')).toBe('resource');
    s.tick(1);
    expect(s.resource).toBeCloseTo(10 + s.stats.resourceRegen, 5);
    s.tick(1000);
    expect(s.resource).toBe(s.stats.maxResource);
  });

  it('never lets the resource go below zero or above the pool', () => {
    const s = new ClassState('warrior');
    s.resource = 5;
    s.commit('ground_slam');
    expect(s.resource).toBe(0);
    expect(s.spend(1)).toBe(false);
    expect(s.resource).toBe(0);
    s.resource = 30;
    expect(s.spend(10)).toBe(true);
    expect(s.resource).toBe(20);
    expect(s.spend(0)).toBe(true);
  });

  it('levels up from experience, carrying the rest over (and learns nothing on the way)', () => {
    const s = new ClassState('ranger');
    const first = CLASS_LEVELS.toNext(1);
    expect(s.addXp(first - 1).levels).toBe(0);
    expect(s.level).toBe(1);
    const r = s.addXp(1);
    expect(r.levels).toBe(1);
    expect(s.level).toBe(2);
    expect(s.xp).toBe(0);
    const big = s.addXp(totalXpFor(3) - totalXpFor(2) + 5);
    expect(big.levels).toBe(1);
    expect(s.xp).toBe(5);
    s.addXp(totalXpFor(5) - totalXpFor(3));
    expect(s.level).toBe(5);
    expect(s.unlocked.size).toBe(0);
    expect(s.learn('rain_of_arrows')).toBe('learned'); // its book can be read now
  });

  it('stops at the cap and ignores bad amounts', () => {
    const s = new ClassState('warrior');
    s.addXp(-10);
    s.addXp(NaN);
    s.addXp(0);
    expect(s.level).toBe(1);
    expect(s.xp).toBe(0);
    s.addXp(1e9);
    expect(s.level).toBe(CLASS_LEVELS.max);
    expect(s.xp).toBe(0);
    expect(s.xpToNext).toBe(0);
    expect(s.addXp(100).levels).toBe(0);
    expect(s.unlocked.size).toBe(0);
  });

  it('grows its stats with the level', () => {
    const s = new ClassState('warrior');
    const before = s.stats.maxHealth;
    s.addXp(totalXpFor(10));
    expect(s.level).toBe(10);
    expect(s.stats.maxHealth).toBeGreaterThan(before);
  });

  it('applies outside modifiers and keeps the resource inside the new pool', () => {
    const s = new ClassState('mage');
    s.setModifiers([{ resource: 30, health: 4 }]);
    expect(s.stats.maxResource).toBe(CLASS_BALANCE.mage.maxResource + 30);
    expect(s.stats.maxHealth).toBe(CLASS_BALANCE.mage.maxHealth + 4);
    s.resource = s.stats.maxResource;
    s.setModifiers([]);
    expect(s.resource).toBe(CLASS_BALANCE.mage.maxResource);
  });

  describe('taking damage', () => {
    it('takes the class defense off', () => {
      expect(new ClassState('warrior').mitigate(10)).toBeCloseTo(8, 5);
      expect(new ClassState('mage').mitigate(10)).toBeCloseTo(11.5, 5);
      expect(new ClassState('ranger').mitigate(10)).toBeCloseTo(10, 5);
      expect(new ClassState('ranger').mitigate(0)).toBe(0);
    });

    it('halves it under Iron Defense, until it runs out', () => {
      const s = new ClassState('warrior');
      s.guardReduction(0.5, 6);
      expect(s.mitigate(10)).toBeCloseTo(4, 5);
      s.tick(5);
      expect(s.mitigate(10)).toBeCloseTo(4, 5);
      s.tick(1.5);
      expect(s.mitigate(10)).toBeCloseTo(8, 5);
      expect(s.reductionLeft).toBe(0);
    });

    it('soaks up damage in a shield until the pool is gone, then lets the rest through', () => {
      const s = new ClassState('ranger');
      s.guardAbsorb(12, 8);
      expect(s.mitigate(5)).toBe(0);
      expect(s.absorbAmount).toBeCloseTo(7, 5);
      expect(s.mitigate(10)).toBeCloseTo(3, 5);
      expect(s.absorbAmount).toBe(0);
      expect(s.mitigate(4)).toBe(4);
    });

    it('drops the shield when its time is up', () => {
      const s = new ClassState('ranger');
      s.guardAbsorb(12, 2);
      s.tick(2.1);
      expect(s.mitigate(5)).toBe(5);
    });

    it('takes nothing while rolling, and does not use up the shield on those hits', () => {
      const s = new ClassState('ranger');
      s.guardAbsorb(12, 8);
      s.grantImmunity(0.6);
      expect(s.mitigate(50)).toBe(0);
      expect(s.absorbAmount).toBe(12);
      s.tick(0.7);
      expect(s.immuneLeft).toBe(0);
      expect(s.mitigate(5)).toBe(0); // the shield again
      expect(s.mitigate(20)).toBeCloseTo(13, 5);
    });

    it('limits how strong a defense can be made', () => {
      const s = new ClassState('warrior');
      s.guardReduction(0, 10);
      expect(s.mitigate(100)).toBeGreaterThan(0);
      s.guardAbsorb(1e9, 10);
      expect(s.absorbAmount).toBeLessThanOrEqual(200);
    });
  });

  it('starts fresh after a death: full resource, no cooldowns, no defenses (and keeps what it has learned)', () => {
    const s = knowingAll('warrior');
    s.commit('ground_slam');
    s.guardReduction(0.5, 6);
    s.guardAbsorb(10, 6);
    s.grantImmunity(1);
    s.resetCombat();
    expect(s.resource).toBe(s.stats.maxResource);
    expect(s.block('ground_slam')).toBeNull();
    expect(s.mitigate(10)).toBeCloseTo(8, 5);
  });

  describe('being saved', () => {
    it('keeps the level, experience and unlocked abilities, and nothing about money or timers', () => {
      const s = stateAt('mage', 6);
      s.addXp(7);
      s.commit('fireball');
      const save = s.toJSON();
      expect(save).toEqual({ v: 1, id: 'mage', lvl: 6, xp: 7, unlocked: expect.arrayContaining(['fireball', 'frost_nova', 'meteor', 'arcane_shield']) });
      expect(Object.keys(save).sort()).toEqual(['id', 'lvl', 'unlocked', 'v', 'xp']);
      expect(JSON.stringify(save)).not.toMatch(/sol|wallet|balance|token|price/i);
      const back = new ClassState('mage');
      back.load(JSON.parse(JSON.stringify(save)));
      expect(back.level).toBe(6);
      expect(back.xp).toBe(7);
      expect([...back.unlocked].sort()).toEqual([...s.unlocked].sort());
      expect(back.resource).toBe(back.stats.maxResource);
      expect(back.block('fireball')).toBeNull(); // cooldowns are not saved
    });

    it('is the same character after any number of save and load cycles', () => {
      let s = stateAt('ranger', 9);
      for (let i = 0; i < 5; i++) {
        const next = new ClassState('ranger');
        next.load(JSON.parse(JSON.stringify(s.toJSON())));
        s = next;
      }
      expect(s.toJSON()).toEqual(stateAt('ranger', 9).toJSON());
    });

    it('ignores a save made for another class', () => {
      const s = new ClassState('warrior');
      s.load(stateAt('mage', 8).toJSON());
      expect(s.level).toBe(1);
    });

    it('cleans up damaged data instead of trusting it', () => {
      expect(parseClassSave(null, 'warrior')).toBeNull();
      expect(parseClassSave('x', 'warrior')).toBeNull();
      expect(parseClassSave({}, 'warrior')).toBeNull();
      expect(parseClassSave({ id: 'mage' }, 'warrior')).toBeNull();
      const messy = parseClassSave({ id: 'warrior', lvl: 9999, xp: -4, unlocked: ['ground_slam', 'fireball', 7, null, 'ground_slam'] }, 'warrior')!;
      expect(messy.lvl).toBe(CLASS_LEVELS.max);
      expect(messy.xp).toBe(0);
      expect(messy.unlocked).toEqual(['ground_slam', 'ground_slam']);
      const nan = parseClassSave({ id: 'warrior', lvl: NaN, xp: Infinity, unlocked: 'yes' }, 'warrior')!;
      expect(nan.lvl).toBe(1);
      expect(nan.xp).toBe(0);
      expect(nan.unlocked).toEqual([]);
    });

    it('cannot be given an ability that is not the class\u2019s, and keeps what was learned (the level adds nothing)', () => {
      const s = new ClassState('warrior');
      s.load({ id: 'warrior', lvl: 3, xp: 0, unlocked: ['fireball', 'charge'] });
      expect(s.unlocked.has('fireball' as AbilityId)).toBe(false);
      expect(s.unlocked.has('charge')).toBe(true);
      expect(s.unlocked.has('ground_slam')).toBe(false);
      expect(s.unlocked.has('shield_bash')).toBe(false);
    });

    it('opens a character with no abilities saved as one that has learned none', () => {
      const s = new ClassState('mage');
      s.load({ v: 1, id: 'mage', lvl: 7, xp: 0, unlocked: [] });
      expect(s.level).toBe(7);
      expect(s.unlocked.size).toBe(0);
    });

    it('caps a hand-edited experience value below the next level instead of leaving a level owing', () => {
      const s = new ClassState('warrior');
      s.load({ id: 'warrior', lvl: 2, xp: 999999, unlocked: [] });
      expect(s.level).toBe(2);
      expect(s.xp).toBe(CLASS_LEVELS.toNext(2) - 1);
    });
  });
});
