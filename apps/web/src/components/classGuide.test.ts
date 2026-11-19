import { ABILITIES, CLASSES, CLASS_IDS, abilitiesOf, isClassId } from '@solrift/shared';
import { describe, expect, it } from 'vitest';
import { ABILITY_GUIDE, ABILITY_KEY_LABELS, GUIDE, abilityDef, abilityFacts, baseDamage, damageAt, statRows, unlockSteps } from './classGuide';

describe('the class pages', () => {
  it('say something about every ability, and every class', () => {
    for (const a of ABILITIES) {
      const g = ABILITY_GUIDE[a.id];
      expect(g.use.length, a.id).toBeGreaterThan(40);
      expect(g.tip.length, a.id).toBeGreaterThan(20);
    }
    for (const id of CLASS_IDS) {
      const g = GUIDE[id];
      expect(g.intro.length).toBeGreaterThan(0);
      // one line for each item of the starting kit, in its order
      expect(g.kit).toHaveLength(CLASSES[id].startingKit.length);
      expect(g.tips.length).toBeGreaterThan(2);
    }
  });

  it('only combine abilities of their own class', () => {
    for (const id of CLASS_IDS) {
      const own = new Set(abilitiesOf(id).map((a) => a.id));
      for (const combo of GUIDE[id].combos) {
        expect(combo.steps.length).toBeGreaterThan(1);
        for (const s of combo.steps) expect(own.has(s), `${id}: ${s}`).toBe(true);
      }
    }
  });

  it('have a key for each of the four buttons', () => {
    expect(ABILITY_KEY_LABELS).toHaveLength(4);
    for (const a of ABILITIES) expect(ABILITY_KEY_LABELS[a.slot], a.id).toBeTruthy();
  });

  it('work every number out from the game data, with the class multiplier', () => {
    // Ground Slam: 14 base melee damage, the Warrior hits for 1.25 times
    expect(damageAt(abilityDef('ground_slam'), baseDamage(abilityDef('ground_slam')), 1)).toBeCloseTo(17.5, 5);
    // Meteor: 15 base, the Mage's spells are 1.5 times
    expect(damageAt(abilityDef('meteor'), 15, 1)).toBeCloseTo(22.5, 5);
    // a level 20 character hits harder than a level 1 one
    expect(damageAt(abilityDef('fireball'), 8, 20)).toBeGreaterThan(damageAt(abilityDef('fireball'), 8, 1));
    const iron = abilityFacts(abilityDef('iron_defense'));
    expect(iron.some((f) => f.value.startsWith('40%'))).toBe(true);
    const rain = abilityFacts(abilityDef('rain_of_arrows'));
    expect(rain.find((f) => f.label === 'Volleys')?.value).toContain('6');
  });

  it('list the facts of every ability, and a damage line for the ones that hurt', () => {
    for (const a of ABILITIES) {
      const facts = abilityFacts(a);
      expect(facts.length, a.id).toBeGreaterThan(1);
      for (const f of facts) {
        expect(f.value, `${a.id}: ${f.label}`).not.toMatch(/NaN|undefined|Infinity/);
      }
      if (baseDamage(a) > 0) expect(facts.some((f) => /^Damage/.test(f.label)), a.id).toBe(true);
    }
  });

  it('draw the bars of a class between empty and full, and the unlocks in order', () => {
    for (const id of CLASS_IDS) {
      for (const r of statRows(id)) {
        expect(r.fill, `${id} ${r.key}`).toBeGreaterThan(0);
        expect(r.fill, `${id} ${r.key}`).toBeLessThanOrEqual(1.0001);
      }
      const steps = unlockSteps(id);
      expect(steps.flatMap((s) => s.abilities)).toHaveLength(4);
      expect(steps.map((s) => s.level)).toEqual([...steps.map((s) => s.level)].sort((a, b) => a - b));
    }
  });

  it('only know the three classes (the route 404s anything else)', () => {
    expect(CLASS_IDS.every(isClassId)).toBe(true);
    expect(isClassId('paladin')).toBe(false);
  });
});
