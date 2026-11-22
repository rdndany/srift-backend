import { describe, expect, it } from 'vitest';
import { CLASS_IDS, DEFAULT_LOOK, LOOK_COUNT, OUTFITS, OUTFIT_TIERS, WORN_COUNT, lookCode, lookOfCode, outfitById, outfitOfCode, outfitPerk, outfitsOfClass, parseLookCode, parseNetClientMessage, parseWornCode, plainCodeOf, wornCode } from './index';

describe('the outfits', () => {
  it('are a clean list: unique plain ids, real colours, every tier stocked', () => {
    const ids = new Set(OUTFITS.map((o) => o.id));
    expect(ids.size).toBe(OUTFITS.length);
    for (const o of OUTFITS) {
      expect(o.id).toMatch(/^[a-z][a-z-]*$/);
      for (const c of [o.shirt, o.pants, o.trim, o.glow]) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
      expect(OUTFIT_TIERS).toContain(o.tier);
      expect(o.name.length).toBeGreaterThan(2);
      expect(outfitPerk(o.id)).toBe(`outfit:${o.id}`);
    }
    for (const t of OUTFIT_TIERS) expect(OUTFITS.some((o) => o.tier === t)).toBe(true);
    // Every class has its own eight: three common, three rare, two epic.
    for (const cls of CLASS_IDS) {
      const own = outfitsOfClass(cls);
      expect(own).toHaveLength(8);
      expect(own.filter((o) => o.tier === 'common')).toHaveLength(3);
      expect(own.filter((o) => o.tier === 'rare')).toHaveLength(3);
      expect(own.filter((o) => o.tier === 'epic')).toHaveLength(2);
    }
    expect(outfitsOfClass(null)).toEqual([]);
    expect(OUTFITS).toHaveLength(CLASS_IDS.length * 8);
    // The order is part of the wire number: the first sets must stay where they were.
    expect(OUTFITS.slice(0, 8).map((o) => o.id)).toEqual(['mossback', 'dusk-wanderer', 'frostbound', 'crimson-warden', 'sunforged', 'tidecaller', 'voidwalker', 'hollow-livery']);
    expect(outfitById('mossback')?.name).toBe('Mossback');
    expect(outfitById('nope')).toBeNull();
    expect(outfitById(7)).toBeNull();
  });

  it('ride on the look code and come back out of it', () => {
    const base = lookCode({ ...DEFAULT_LOOK, hair: 5, shirt: 3 });
    expect(wornCode(base, null)).toBe(base);
    expect(wornCode(base, 'not-an-outfit')).toBe(base);
    for (const [i, o] of OUTFITS.entries()) {
      const worn = wornCode(base, o.id);
      expect(worn).toBe(base + LOOK_COUNT * (i + 1));
      expect(outfitOfCode(worn)?.id).toBe(o.id);
      expect(plainCodeOf(worn)).toBe(base);
      expect(lookCode(lookOfCode(worn))).toBe(base);
      expect(parseWornCode(worn)).toBe(worn);
    }
    expect(outfitOfCode(base)).toBeNull();
    expect(wornCode(parseLookCode(base)!, 'frostbound')).toBe(wornCode(base, 'frostbound'));
  });

  it('are never accepted from a client, and bad codes are nothing', () => {
    const worn = wornCode(7, 'voidwalker');
    expect(parseLookCode(worn)).toBeNull(); // (what an account may save)
    expect(parseNetClientMessage({ t: 'join', name: 'sneaky', look: worn })).toEqual({ t: 'join', name: 'sneaky' }); // (what a guest may send)
    expect(parseNetClientMessage({ t: 'join', name: 'fine', look: 7 })).toEqual({ t: 'join', name: 'fine', look: 7 });
    for (const bad of [-1, 1.5, WORN_COUNT, Number.NaN, Infinity, '5', null, undefined, {}]) {
      expect(parseWornCode(bad)).toBeNull();
      expect(outfitOfCode(bad)).toBeNull();
    }
    expect(lookCode(lookOfCode(-3))).toBe(lookCode(DEFAULT_LOOK)); // (a bad code shows the default look)
    expect(outfitOfCode(WORN_COUNT + 5)).toBeNull(); // (an outfit that does not exist is not worn, whatever the look under it)
  });
});
