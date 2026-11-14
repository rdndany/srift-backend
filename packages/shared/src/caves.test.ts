import { beforeAll, describe, expect, it } from 'vitest';
import { B, BLOCKS, IS_LIQUID, IS_SOLID } from './blocks';
import { CHUNK_SIZE, WORLD_HEIGHT, blockIndex } from './chunk';
import { canStayAt } from './plants';
import { WorldGenerator } from './worldgen';

const SEED = 1337;
const R = 8;

/** Every chunk within R of the origin, generated once. */
const gen = new WorldGenerator(SEED);
const chunks = new Map<string, Uint16Array>();
const chunk = (cx: number, cz: number): Uint16Array => {
  const k = `${cx},${cz}`;
  let c = chunks.get(k);
  if (!c) chunks.set(k, (c = gen.generateChunk(cx, cz)));
  return c;
};
const blockAt = (x: number, y: number, z: number): number => {
  if (y < 0 || y >= WORLD_HEIGHT) return B.AIR;
  return chunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE))[blockIndex(((x % 16) + 16) % 16, y, ((z % 16) + 16) % 16)];
};

const ORES: number[] = [B.GOLD_ORE, B.IRON_ORE, B.COAL_ORE, B.LAPIS_ORE, B.REDSTONE_ORE, B.DIAMOND_ORE, B.EMERALD_ORE];
const CAVE_BLOCKS = new Set<number>([
  B.MOSS_BLOCK, B.CAVE_VINES, B.CAVE_VINES_BERRIES, B.FLOWERING_AZALEA, B.SPORE_BLOSSOM, B.DRIPSTONE_BLOCK, B.STALAGMITE_BASE, B.STALAGMITE_TIP,
  B.STALACTITE_BASE, B.STALACTITE_TIP, B.GLOW_LICHEN, B.AMETHYST_BLOCK, B.BUDDING_AMETHYST, B.AMETHYST_CLUSTER, B.CALCITE, B.SMOOTH_BASALT, B.SCULK,
]);

const counts = new Map<number, number>();
const kinds = new Set<string>();

beforeAll(() => {
  for (let cz = -R; cz <= R; cz++) {
    for (let cx = -R; cx <= R; cx++) {
      const a = chunk(cx, cz);
      for (let y = 5; y < 80; y++) {
        for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) {
          const id = a[y * CHUNK_SIZE * CHUNK_SIZE + i];
          if (CAVE_BLOCKS.has(id) || id === B.CHEST || ORES.includes(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }
      for (let k = 0; k < 6; k++) for (const y of [8, 20, 30, 45]) kinds.add(gen.caveKindAt(cx * 16 + k * 3, y, cz * 16 + k * 2));
    }
  }
}, 120000);

describe('cave country', () => {
  it('has lush, dripstone and deep dark caves, as well as plain ones, and each looks like itself', () => {
    expect([...kinds].sort()).toEqual(['deep_dark', 'dripstone', 'lush', 'plain']);
    for (const id of [B.MOSS_BLOCK, B.CAVE_VINES, B.CAVE_VINES_BERRIES, B.DRIPSTONE_BLOCK, B.STALAGMITE_TIP, B.STALACTITE_TIP, B.SCULK]) {
      expect(counts.get(id) ?? 0, BLOCKS[id].name).toBeGreaterThan(20);
    }
  });

  it('keeps the deep dark deep, and the lush caves and dripstone caves clear of the bottom', () => {
    for (let x = -200; x < 200; x += 7) {
      for (let z = -200; z < 200; z += 7) {
        if (gen.caveKindAt(x, 40, z) === 'deep_dark') throw new Error(`deep dark at y 40 (${x}, ${z})`);
        if (gen.caveKindAt(x, 8, z) === 'lush') throw new Error(`lush cave at y 8 (${x}, ${z})`);
      }
    }
  });

  it('puts every hanging and standing growth where it can stay', () => {
    const world = { getBlock: blockAt };
    let checked = 0;
    for (let cz = -R; cz <= R; cz++) {
      for (let cx = -R; cx <= R; cx++) {
        const a = chunk(cx, cz);
        for (let y = 5; y < 120; y++) {
          for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            for (let lx = 0; lx < CHUNK_SIZE; lx++) {
              const id = a[blockIndex(lx, y, lz)];
              if (!CAVE_BLOCKS.has(id) || IS_SOLID[id]) continue;
              checked++;
              if (!canStayAt(id, world, cx * 16 + lx, y, cz * 16 + lz)) throw new Error(`${BLOCKS[id].name} floats at ${cx * 16 + lx},${y},${cz * 16 + lz}`);
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('is made the same however the chunks are asked for', () => {
    const a = new WorldGenerator(SEED);
    const b = new WorldGenerator(SEED);
    // One generator walks the neighbours first, the other goes straight to the chunk.
    for (const [cx, cz] of [[-3, -5], [2, 4], [6, -2]]) {
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) a.generateChunk(cx + dx, cz + dz);
      expect(Buffer.compare(Buffer.from(a.generateChunk(cx, cz)), Buffer.from(b.generateChunk(cx, cz)))).toBe(0);
    }
  });
});

describe('amethyst geodes', () => {
  it('are hollow crystal in calcite in smooth basalt, deep in the rock, with crystals growing inside', () => {
    expect(counts.get(B.AMETHYST_BLOCK) ?? 0).toBeGreaterThan(50);
    expect(counts.get(B.CALCITE) ?? 0).toBeGreaterThan(50);
    expect(counts.get(B.SMOOTH_BASALT) ?? 0).toBeGreaterThan(50);
    expect(counts.get(B.AMETHYST_CLUSTER) ?? 0).toBeGreaterThan(0);
    // Find one cluster and look at what it stands on and what is around: crystal under it, a ring of calcite further out.
    let found = false;
    for (let cz = -R; cz <= R && !found; cz++) {
      for (let cx = -R; cx <= R && !found; cx++) {
        const a = chunk(cx, cz);
        for (let y = 6; y < 50 && !found; y++) {
          for (let lz = 2; lz < 14 && !found; lz++) {
            for (let lx = 2; lx < 14; lx++) {
              if (a[blockIndex(lx, y, lz)] !== B.AMETHYST_CLUSTER) continue;
              const x = cx * 16 + lx;
              const z = cz * 16 + lz;
              expect([B.AMETHYST_BLOCK, B.BUDDING_AMETHYST]).toContain(blockAt(x, y - 1, z));
              let calcite = 0;
              for (let d = 3; d <= 7; d++) for (const [dx, dz] of [[d, 0], [-d, 0], [0, d], [0, -d]]) if (blockAt(x + dx, y, z + dz) === B.CALCITE) calcite++;
              expect(calcite).toBeGreaterThan(0);
              found = true;
              break;
            }
          }
        }
      }
    }
    expect(found).toBe(true);
  });
});

describe('walls of rubble', () => {
  const seals = (): ReturnType<WorldGenerator['caveSeals']> => {
    const out: ReturnType<WorldGenerator['caveSeals']> = [];
    for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) out.push(...gen.caveSeals(cx, cz));
    return out;
  };

  it('are planned in plenty, and depend only on the seed', () => {
    const a = seals();
    expect(a.length).toBeGreaterThan(15);
    let at: [number, number] = [0, 0];
    for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) if (gen.caveSeals(cx, cz).length > 0) at = [cx, cz];
    expect(JSON.stringify(new WorldGenerator(SEED).caveSeals(...at))).toBe(JSON.stringify(gen.caveSeals(...at)));
    expect(JSON.stringify(new WorldGenerator(SEED + 1).caveSeals(...at))).not.toBe(JSON.stringify(gen.caveSeals(...at)));
  });

  it('close the tunnel with a slab rich in ore, gold above all', () => {
    let tested = 0;
    let rich = 0;
    let goldy = 0;
    for (const s of seals()) {
      if (Math.abs(s.x) > R * 16 - 20 || Math.abs(s.z) > R * 16 - 20) continue;
      let ore = 0;
      let gold = 0;
      let open = 0;
      const reach = Math.ceil(s.r + s.half);
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dz = -reach; dz <= reach; dz++) {
          for (let dx = -reach; dx <= reach; dx++) {
            const wx = Math.floor(s.x) + dx;
            const wy = Math.floor(s.y) + dy;
            const wz = Math.floor(s.z) + dz;
            const px = wx + 0.5 - s.x;
            const py = wy + 0.5 - s.y;
            const pz = wz + 0.5 - s.z;
            const t = px * s.dx + py * s.dy + pz * s.dz;
            if (Math.abs(t) > s.half || px * px + py * py + pz * pz - t * t > s.r * s.r) continue;
            const id = blockAt(wx, wy, wz);
            if (ORES.includes(id)) ore++;
            if (id === B.GOLD_ORE) gold++;
            if (id === B.AIR) open++;
          }
        }
      }
      tested++;
      if (ore >= 6 && open === 0) rich++;
      if (gold >= 2) goldy++;
    }
    expect(tested).toBeGreaterThan(10);
    // Some walls sit in a flooded tunnel or a hall, and a cave may run round them, so not every one is a clean plug.
    expect(rich / tested).toBeGreaterThan(0.8);
    expect(goldy / tested).toBeGreaterThan(0.5);
  });

  it('leave the tunnel going on behind them', () => {
    let tested = 0;
    let goes = 0;
    for (const s of seals()) {
      if (Math.abs(s.x) > R * 16 - 20 || Math.abs(s.z) > R * 16 - 20) continue;
      tested++;
      // Open air in the half-space beyond the wall, between three and nine blocks from it.
      let air = 0;
      for (let dy = -9; dy <= 9; dy++) {
        for (let dz = -9; dz <= 9; dz++) {
          for (let dx = -9; dx <= 9; dx++) {
            const px = Math.floor(s.x) + dx + 0.5 - s.x;
            const py = Math.floor(s.y) + dy + 0.5 - s.y;
            const pz = Math.floor(s.z) + dz + 0.5 - s.z;
            const t = px * s.dx + py * s.dy + pz * s.dz;
            const d = Math.hypot(px, py, pz);
            if (t < 2 || d < 3 || d > 9) continue;
            if (blockAt(Math.floor(s.x) + dx, Math.floor(s.y) + dy, Math.floor(s.z) + dz) === B.AIR) air++;
          }
        }
      }
      if (air >= 20) goes++;
    }
    expect(goes / tested).toBeGreaterThan(0.7);
  });

  it('keep a chest of ore and supplies in the tunnel beyond, with its own loot table', () => {
    let chests = 0;
    for (let cz = -R; cz <= R; cz++) {
      for (let cx = -R; cx <= R; cx++) {
        const a = chunk(cx, cz);
        for (let y = 5; y < 80; y++) {
          for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) {
            if (a[y * CHUNK_SIZE * CHUNK_SIZE + i] !== B.CHEST) continue;
            const x = cx * 16 + (i % 16);
            const z = cz * 16 + Math.floor(i / 16);
            if (gen.lootAt(x, y, z) === 'cache') {
              chests++;
              expect(IS_SOLID[blockAt(x, y - 1, z)]).toBe(1);
              expect(IS_LIQUID[blockAt(x, y + 1, z)]).toBe(0);
            }
          }
        }
      }
    }
    expect(chests).toBeGreaterThan(5);
  });
});

describe('ore in the caves', () => {
  it('shows in the open: ore is found against air, not only buried', () => {
    let exposed = 0;
    for (let cz = -4; cz <= 4; cz++) {
      for (let cx = -4; cx <= 4; cx++) {
        for (let y = 6; y < 60; y++) {
          for (let lz = 1; lz < 15; lz++) {
            for (let lx = 1; lx < 15; lx++) {
              const a = chunk(cx, cz);
              if (!ORES.includes(a[blockIndex(lx, y, lz)])) continue;
              if (a[blockIndex(lx, y + 1, lz)] === B.AIR || a[blockIndex(lx, y - 1, lz)] === B.AIR) exposed++;
            }
          }
        }
      }
    }
    expect(exposed).toBeGreaterThan(30);
  });
});
