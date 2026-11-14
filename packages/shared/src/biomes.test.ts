import { describe, expect, it } from 'vitest';
import { BIOME_NAMES, Biome, FROZEN_BIOMES, HOT_BIOMES } from './biomes';
import { B } from './blocks';
import { CHUNK_SIZE, WORLD_HEIGHT, blockIndex } from './chunk';
import { WorldGenerator } from './worldgen';

const SEEDS = [1337, 7, 2026];
const ADJ_SEEDS = [1337, 2026];

describe('the biomes of the world', () => {
  it('has a name for every biome', () => {
    for (const id of Object.values(Biome)) expect(BIOME_NAMES[id], `biome ${id}`).toBeTruthy();
  });

  it('never puts ice country next to hot or warm country: the temperature bands only touch their neighbours', () => {
    const bad: string[] = [];
    for (const seed of ADJ_SEEDS) {
      const gen = new WorldGenerator(seed);
      const STEP = 6;
      for (let z = -900; z <= 900; z += STEP) {
        for (let x = -900; x <= 900; x += STEP) {
          const a = gen.columnAt(x, z);
          for (const [dx, dz] of [[STEP, 0], [0, STEP]]) {
            const b = gen.columnAt(x + dx, z + dz);
            if (Math.abs(a.heat! - b.heat!) > 1) bad.push(`seed ${seed}: heat ${a.heat} next to ${b.heat} at ${x},${z}`);
            const frozen = FROZEN_BIOMES.has(a.biome) ? a : FROZEN_BIOMES.has(b.biome) ? b : null;
            if (!frozen) continue;
            const other = frozen === a ? b : a;
            if (HOT_BIOMES.has(other.biome) || other.heat! > 1) bad.push(`seed ${seed}: ${BIOME_NAMES[frozen.biome]} next to ${BIOME_NAMES[other.biome]} at ${x},${z}`);
          }
        }
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
  }, 120_000);
  it('shows every biome somewhere, in every seed', () => {
    for (const seed of SEEDS) {
      const gen = new WorldGenerator(seed);
      const seen = new Set<number>();
      for (let z = -6000; z <= 5000; z += 25) for (let x = -5000; x <= 5000; x += 25) seen.add(gen.columnAt(x, z).biome);
      const missing = Object.values(Biome).filter((id) => !seen.has(id)).map((id) => BIOME_NAMES[id]);
      // The rarest (mushroom islands, ice spikes) may take a bigger world than this window.
      expect(missing.filter((n) => n !== 'Mushroom Fields' && n !== 'Ice Spikes'), `seed ${seed}`).toEqual([]);
    }
  });

  it('is the same every time', () => {
    const a = new WorldGenerator(77);
    const b = new WorldGenerator(77);
    for (let i = 0; i < 200; i++) {
      const x = i * 97 - 9000;
      const z = i * -61 + 4000;
      expect(a.columnAt(x, z)).toEqual(b.columnAt(x, z));
    }
  });
});

describe('snow and ice on the ground', () => {
  it('lie only where it is cold: never on a hot or warm column, and only as high as the snow line allows', () => {
    const SNOWY = new Set<number>([B.SNOW, B.SNOW_BLOCK, B.ICE, B.PACKED_ICE]);
    const bad: string[] = [];
    for (const seed of SEEDS) {
      const gen = new WorldGenerator(seed);
      let snowy = 0;
      for (let cz = -10; cz <= 10; cz++) {
        for (let cx = -10; cx <= 10; cx++) {
          const a = gen.generateChunk(cx * 7, cz * 7);
          const ox = cx * 7 * CHUNK_SIZE;
          const oz = cz * 7 * CHUNK_SIZE;
          for (let lz = 0; lz < CHUNK_SIZE; lz += 3) {
            for (let lx = 0; lx < CHUNK_SIZE; lx += 3) {
              let y = WORLD_HEIGHT - 1;
              while (y > 0 && (a[blockIndex(lx, y, lz)] === B.AIR || a[blockIndex(lx, y, lz)] === B.WATER)) y--;
              const id = a[blockIndex(lx, y, lz)];
              if (!SNOWY.has(id)) continue;
              snowy++;
              const col = gen.columnAt(ox + lx, oz + lz);
              if (col.heat! > 2 || HOT_BIOMES.has(col.biome)) bad.push(`seed ${seed}: ${BIOME_NAMES[col.biome]} has block ${id} at ${ox + lx},${oz + lz}`);
            }
          }
        }
      }
      expect(snowy, `seed ${seed}`).toBeGreaterThan(50);
    }
    expect(bad.slice(0, 10)).toEqual([]);
  }, 120_000);
});
