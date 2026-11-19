import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ATMOSPHERES,
  BB,
  BEYOND,
  BEYOND_ACHIEVEMENTS,
  BEYOND_BIOMES,
  BEYOND_BIOME_COUNT,
  BEYOND_CUBES,
  BEYOND_PLANTS,
  BIOME_RARITY_ORDER,
  BLOCKS,
  DiscoveryLog,
  FAMILY_NAMES,
  SIGNATURE,
  STRUCTURES,
  beyondBiome,
  beyondTiles,
  biomesOfFamily,
  codexPage,
  skyOf,
  type BiomeFamily,
  type StructureKey,
} from './index';

/** The catalogue: a hundred and ten biomes in the order the design lists them. */
describe('the biome catalogue', () => {
  const real = BEYOND_BIOMES.filter(Boolean);

  it('has 110 biomes numbered 1..110 with no gaps and unique keys and names', () => {
    expect(BEYOND_BIOME_COUNT).toBe(110);
    expect(real.map((b) => b.id)).toEqual(Array.from({ length: 110 }, (_, i) => i + 1));
    expect(new Set(real.map((b) => b.key)).size).toBe(110);
    expect(new Set(real.map((b) => b.name)).size).toBe(110);
    expect(beyondBiome(0)).toBeNull();
    expect(beyondBiome(111)).toBeNull();
  });

  it('puts every biome in the family and the id range the design gives it', () => {
    const ranges: Record<BiomeFamily, [number, number]> = {
      plains: [1, 7],
      forest: [8, 20],
      tropical: [21, 28],
      desert: [29, 38],
      mountain: [39, 48],
      cold: [49, 58],
      wetland: [59, 66],
      ocean: [67, 80],
      fresh: [81, 92],
      fantasy: [93, 100],
      signature: [101, 110],
    };
    for (const [family, [lo, hi]] of Object.entries(ranges) as [BiomeFamily, [number, number]][]) {
      const ids = biomesOfFamily(family).map((b) => b.id);
      expect(ids, family).toEqual(Array.from({ length: hi - lo + 1 }, (_, i) => lo + i));
      expect(FAMILY_NAMES[family]).toBeTruthy();
    }
  });

  it('names the ten signature realms', () => {
    expect(SIGNATURE).toEqual({
      SHATTERED_REALM: 101,
      WORLDROOT: 102,
      ASHEN_KINGDOM: 103,
      DROWNED_KINGDOM: 104,
      ETERNAL_NIGHT: 105,
      CRYSTAL_EXPANSE: 106,
      SUNKEN_EARTH: 107,
      SKY_ISLANDS: 108,
      PALE_WASTES: 109,
      EMERALD_HOLLOW: 110,
    });
    for (const id of Object.values(SIGNATURE)) expect(BEYOND_BIOMES[id].rarity).toBe('legendary');
  });

  it('gives every biome a description, a valid rarity, a climate niche, an atmosphere and a legacy biome', () => {
    for (const b of real) {
      expect(b.desc.length, b.key).toBeGreaterThan(20);
      expect(BIOME_RARITY_ORDER, b.key).toContain(b.rarity);
      expect(ATMOSPHERES[b.atmosphere], b.key).toBeDefined();
      expect(b.t[0] >= 0 && b.t[0] <= 1 && b.h[0] >= 0 && b.h[0] <= 1, b.key).toBe(true);
      expect(b.legacy, b.key).toBeGreaterThanOrEqual(0);
      for (const k of b.structures) expect(STRUCTURES[k], `${b.key} -> ${k}`).toBeDefined();
    }
  });

  it('keeps the rarer biomes rarer in the table: common are the most, legendary the fewest', () => {
    const count = (r: string) => real.filter((b) => b.rarity === r).length;
    expect(count('legendary')).toBeLessThan(count('very_rare') + 1);
    expect(count('common')).toBeGreaterThan(count('legendary'));
    expect(count('legendary')).toBe(10);
    expect(count('common') + count('uncommon') + count('rare') + count('very_rare') + count('legendary')).toBe(110);
  });
});

describe('the new blocks', () => {
  it('lays its blocks in one run after the old ones, and keeps them there', () => {
    // Saves store ids, so the run must never move: pin where it starts and how many it holds.
    expect(BEYOND.base).toBe(3016);
    const ids = Object.values(BB);
    expect(Math.min(...ids)).toBe(3016);
    expect(new Set(ids).size).toBe(ids.length);
    expect(BEYOND.next).toBeGreaterThan(Math.max(...ids));
    expect(BEYOND_CUBES.length).toBeGreaterThan(60);
    expect(BEYOND_PLANTS.length).toBeGreaterThan(10);
    for (const id of ids) expect(BLOCKS[id], `block ${id}`).toBeDefined();
  });

  it('draws every block from procedural tiles with unique names', () => {
    const tiles = Object.keys(beyondTiles());
    expect(new Set(tiles).size).toBe(tiles.length);
    expect(tiles.length).toBeGreaterThan(80);
  });

  it('is only ever asked for blocks that exist: every BB.key in the generators is real', () => {
    const dir = new URL('.', import.meta.url);
    const files = readdirSync(dir).filter((f) => /^beyond.*\.ts$/.test(f) && !f.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(5);
    const missing: string[] = [];
    for (const f of files) {
      const src = readFileSync(new URL(f, dir), 'utf8');
      for (const m of src.matchAll(/\bBB\.([a-z_0-9]+)/g)) if (BB[m[1]] === undefined) missing.push(`${f}: BB.${m[1]}`);
    }
    expect(missing).toEqual([]);
  });
});

describe('the places', () => {
  it('has the structures of the design, each of a known rarity with loot and a size', () => {
    const keys = Object.keys(STRUCTURES) as StructureKey[];
    expect(keys.length).toBeGreaterThanOrEqual(30);
    for (const k of keys) {
      const s = STRUCTURES[k];
      expect(BIOME_RARITY_ORDER).toContain(s.rarity);
      expect(s.radius).toBeGreaterThan(2);
      expect(s.decay).toBeLessThanOrEqual(0.5);
    }
    // Every place is wanted by at least one biome (or it could never appear), the legendary ones by a realm.
    const wanted = new Set(BEYOND_BIOMES.filter(Boolean).flatMap((b) => b.structures));
    for (const k of keys) expect(wanted.has(k), k).toBe(true);
  });
});

describe('the sky of a place', () => {
  it('never rains in a desert, snows in the cold and keeps storms to their own country', () => {
    const wet = { rain: 1, storm: 1 };
    const dry = { rain: 0, storm: 0 };
    expect(skyOf('desert', wet).precip).toBe(0);
    expect(skyOf('dust', wet).storm).toBe('sand');
    expect(skyOf('dust', dry).storm).toBe('none');
    expect(skyOf('snow', wet).snow).toBe(true);
    expect(skyOf('snow', wet).precip).toBeGreaterThan(0.5);
    expect(skyOf('blizzard', wet).storm).toBe('blizzard');
    expect(skyOf('clear', wet).snow).toBe(false);
    expect(skyOf('clear', wet).storm).toBe('none');
    expect(skyOf('clear', dry).precip).toBe(0);
    expect(skyOf('eternal_night', dry).light).toBeLessThan(0.3);
    for (const key of Object.keys(ATMOSPHERES) as (keyof typeof ATMOSPHERES)[]) {
      const s = skyOf(key, wet);
      expect(s.fog).toBeGreaterThanOrEqual(0);
      expect(s.fog).toBeLessThanOrEqual(1);
      expect(s.light).toBeGreaterThan(0);
    }
  });

  it('gives every biome an atmosphere the client knows how to play', () => {
    for (const b of BEYOND_BIOMES.filter(Boolean)) {
      const a = ATMOSPHERES[b.atmosphere];
      expect(a.fog).toBeLessThanOrEqual(1);
      expect(a.ambience).toBeTruthy();
    }
  });
});

describe('the discovery log', () => {
  it('records a find once and returns its entry for the notification', () => {
    const log = new DiscoveryLog();
    const first = log.findBiome(1);
    expect(first?.name).toBe(BEYOND_BIOMES[1].name);
    expect(log.findBiome(1)).toBeNull();
    expect(log.findBiome(0)).toBeNull();
    expect(log.findBiome(999)).toBeNull();
    expect(log.findStructure('shrine')?.name).toBe('Wayside Shrine');
    expect(log.findStructure('shrine')).toBeNull();
    expect(log.findCave('crystal')?.name).toBe('Crystal Cavern');
    expect(log.findCave('none')).toBeNull();
    expect(log.counts()).toMatchObject({ biomes: 1, structures: 1, caves: 1 });
  });

  it('unlocks achievements from the counts, once each', () => {
    const log = new DiscoveryLog();
    log.findBiome(1);
    expect(log.takeUnlocked().map((a) => a.id)).toEqual(['first_steps']);
    expect(log.takeUnlocked()).toEqual([]);
    for (let id = 2; id <= 10; id++) log.findBiome(id);
    expect(log.takeUnlocked().map((a) => a.id)).toContain('wanderer');
    log.findBiome(SIGNATURE.SKY_ISLANDS);
    const got = log.takeUnlocked().map((a) => a.id);
    expect(got).toContain('realm_walker');
    expect(got).toContain('legend');
    // A family is complete when every biome of it is found.
    for (const b of biomesOfFamily('plains')) log.findBiome(b.id);
    expect(log.hasAchievement('family_plains')).toBe(true);
    expect(BEYOND_ACHIEVEMENTS.length).toBeGreaterThan(15);
  });

  it('is complete when everything has been found', () => {
    const log = new DiscoveryLog();
    for (const b of BEYOND_BIOMES.filter(Boolean)) log.findBiome(b.id);
    for (const k of Object.keys(STRUCTURES) as StructureKey[]) log.findStructure(k);
    for (const c of ['glow', 'crystal', 'ancient', 'bone', 'flooded'] as const) log.findCave(c);
    const all = new Set(log.takeUnlocked().map((a) => a.id));
    expect(all.size).toBe(BEYOND_ACHIEVEMENTS.length);
  });

  it('saves and loads, and ignores whatever is not in the catalogue', () => {
    const log = new DiscoveryLog();
    log.findBiome(5);
    log.findBiome(70);
    log.findStructure('crypt');
    log.findCave('bone');
    const back = DiscoveryLog.from(JSON.parse(JSON.stringify(log)));
    expect(back.toJSON()).toEqual(log.toJSON());
    expect(back.hasBiome(70)).toBe(true);
    const junk = DiscoveryLog.from({ b: [1, 'x', 5000, -1], s: ['nope', 'crypt', 3], c: ['glow', 'none', 7], a: ['first_steps', 'bogus'] });
    expect(junk.toJSON()).toEqual({ b: [1], s: ['crypt'], c: ['glow'], a: ['first_steps'] });
    expect(DiscoveryLog.from(null).counts().biomes).toBe(0);
    expect(DiscoveryLog.from('garbage').counts().biomes).toBe(0);
  });

  it('has a Codex page for every biome', () => {
    for (const b of BEYOND_BIOMES.filter(Boolean)) {
      const page = codexPage(b.id);
      expect(page?.biome.name).toBe(b.name);
      expect(page?.structures.length).toBe(b.structures.length);
    }
    expect(codexPage(0)).toBeNull();
  });
});
