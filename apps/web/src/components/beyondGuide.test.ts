import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BEYOND_BIOMES } from '@solrift/shared';
import { COUNTS, FAMILIES, REALMS, biomesIn, rarityCounts } from './beyondGuide';
import { SHOTS, shotExt, type Shot } from './beyondShots';

const all = (): Shot[] => [
  ...SHOTS.hero, SHOTS.about, ...SHOTS.biomes, ...SHOTS.featured, ...Object.values(SHOTS.realms).flat(),
  ...SHOTS.places, ...Object.values(SHOTS.caves), ...SHOTS.air, SHOTS.codex,
];

describe('the page about the World Beyond', () => {
  it('has every picture it names (scripts/beyondpack.ts puts them in public/beyond)', () => {
    for (const s of all()) expect(existsSync(new URL(`../../public/beyond/${s.file}.${shotExt(s.file)}`, import.meta.url)), s.file).toBe(true);
  });

  it('pictures every realm twice', () => {
    for (const r of REALMS) expect(SHOTS.realms[r.key]?.length, r.key).toBe(2);
    expect(REALMS.length).toBe(10);
  });

  it('counts what the world has', () => {
    expect(COUNTS.biomes).toBe(BEYOND_BIOMES.filter(Boolean).length);
    const r = rarityCounts();
    expect(Object.values(r).reduce((a, b) => a + b, 0)).toBe(COUNTS.biomes);
    // the ten families of the land, and the ten signature realms that are a family of their own
    expect(FAMILIES.reduce((n, f) => n + biomesIn(f).length, 0) + REALMS.length).toBe(COUNTS.biomes);
  });

  it('shows each biome picture under the family of that biome', () => {
    for (const s of SHOTS.biomes) expect(BEYOND_BIOMES.find((b) => b?.key === s.key), s.file).toBeTruthy();
  });
});
