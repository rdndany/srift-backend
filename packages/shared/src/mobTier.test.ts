import { describe, expect, it } from 'vitest';
import { MOBS, Mob, mobMaxHealth, type MobKind } from './mobs';
import { MOB_ROLE_LABEL, MOB_TIERS, MOB_TIER_INFO, mobLevel, mobRole, mobTier, shownTier } from './mobTier';
import { gearDrop } from './gear';

const kinds = Object.keys(MOBS) as MobKind[];

describe('mob tiers', () => {
  it('gives every kind a tier and a level', () => {
    for (const k of kinds) {
      expect(MOB_TIERS, k).toContain(mobTier(k));
      expect(mobLevel(k), k).toBeGreaterThanOrEqual(1);
    }
  });

  it('puts the animals low and the dungeon high, and the boss at the top', () => {
    expect(mobTier('pig')).toBe('common');
    expect(mobTier('zombie')).toBe('uncommon');
    expect(mobTier('enderman')).toBe('rare');
    expect(mobTier('hollow_king')).toBe('epic');
    expect(mobLevel('hollow_king')).toBeGreaterThan(mobLevel('zombie'));
    expect(mobLevel('pig')).toBeLessThan(mobLevel('zombie'));
  });

  it('makes a bigger slime a higher level', () => {
    expect(mobLevel('slime', 2)).toBeGreaterThan(mobLevel('slime', 1));
    expect(mobLevel('slime', 4)).toBeGreaterThan(mobLevel('slime', 2));
  });

  it('shows an elite a step higher, never past epic', () => {
    expect(shownTier('zombie')).toBe('uncommon');
    expect(shownTier('zombie', true)).toBe('rare');
    expect(shownTier('hollow_king', true)).toBe('epic');
  });

  it('says what a creature is to the player', () => {
    expect(mobRole(MOBS.zombie)).toBe('hostile');
    expect(mobRole(MOBS.pig)).toBe('passive');
    expect(mobRole(MOBS.hollow_king)).toBe('boss');
    expect(mobRole(MOBS.npc)).toBe('npc');
    expect(mobRole(MOBS.villager)).toBe('trader');
    expect(mobRole(MOBS.dummy)).toBe('dummy');
    for (const k of kinds) expect(MOB_ROLE_LABEL[mobRole(MOBS[k])], k).toBeTruthy();
  });

  it('works out the health a client shows the same as the one the mob is born with', () => {
    for (const k of kinds) {
      const m = new Mob(1, k, 0, 64, 0, () => 0.5, k === 'slime' ? { size: 2, variant: 0 } : {});
      expect(mobMaxHealth(k, m.size), k).toBe(m.maxHealth);
    }
  });

  it('pays rare and epic kinds a little more, and the common ones the base', () => {
    expect(MOB_TIER_INFO.common.xp).toBe(1);
    expect(MOB_TIER_INFO.uncommon.xp).toBe(1);
    expect(MOB_TIER_INFO.rare.xp).toBeGreaterThan(1);
    expect(MOB_TIER_INFO.epic.xp).toBeGreaterThan(MOB_TIER_INFO.rare.xp);
  });

  it('lets a rare kind drop gear on a roll that a lower tier of the same base chance misses', () => {
    // creeper (rare) and zombie (uncommon) both have a 0.04 base chance
    const roll = (): (() => number) => {
      let n = 0;
      return () => (n++ === 0 ? 0.045 : 0.5);
    };
    expect(gearDrop('zombie', roll())).toBeNull();
    expect(gearDrop('creeper', roll())).not.toBeNull();
  });
});
