import { describe, expect, it } from 'vitest';
import {
  B,
  BLOCKS,
  Biome,
  CHUNK_BYTES,
  CHUNK_SIZE,
  GameSession,
  HeadlessWorld,
  I,
  LEGACY_CHUNK_BYTES,
  LOOT_TABLES,
  rollChest,
  WORLD_HEIGHT,
  WorldGenerator,
  blockIndex,
  blockDrops,
  createBody,
  decodeChunk,
  makeStack,
  mulberry32,
  paletteColor,
  placementFor,
  stepPlayer,
  grassColor,
  grassTint,
  waterTint,
  waterColor,
  type InputFrame,
} from './index';
import { growTree, trunkHeight, treeBlocks, treeKindOfSapling, type TreeKind } from './trees';
import type { BlockReader, MoveInput } from './physics';

const SEED = 1337;
const FLOOR = 100;
const CX = 8;
const CZ = 8;

const idle = (): InputFrame => ({
  t: 'frame',
  dt: 1 / 20,
  locked: true,
  yaw: 0,
  pitch: 0,
  forward: 0,
  strafe: 0,
  jump: false,
  sprint: false,
  sneak: false,
  left: false,
  right: false,
});

/** A flat stone floor high above the terrain, so the tests control everything around the player. */
function make() {
  const generator = new WorldGenerator(SEED);
  const world = new HeadlessWorld(generator);
  for (let x = CX - 12; x <= CX + 12; x++)
    for (let z = CZ - 12; z <= CZ + 12; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 24; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.STONE);
    }
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(5) });
  s.finishLoading();
  s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
  return { s, world, generator };
}

function run(s: GameSession, seconds: number): void {
  for (let i = 0; i < seconds * 20; i++) s.tick(idle());
}

/** Lazily generated terrain with a block getter. */
function terrain(gen: WorldGenerator) {
  const cache = new Map<string, Uint16Array>();
  const chunk = (cx: number, cz: number) => {
    const k = `${cx},${cz}`;
    let a = cache.get(k);
    if (!a) cache.set(k, (a = gen.generateChunk(cx, cz)));
    return a;
  };
  const get = (x: number, y: number, z: number) => {
    if (y < 0 || y >= WORLD_HEIGHT) return B.AIR;
    return chunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE))[blockIndex(((x % 16) + 16) % 16, y, ((z % 16) + 16) % 16)];
  };
  return { chunk, get };
}

const LOGS: Record<string, number> = { oak: B.LOG, birch: B.BIRCH_LOG, spruce: B.SPRUCE_LOG };
const LEAVES: Record<string, number> = { oak: B.LEAVES, birch: B.BIRCH_LEAVES, spruce: B.SPRUCE_LEAVES };
const KINDS: TreeKind[] = ['oak', 'birch', 'spruce'];

describe('tree shapes', () => {
  it.each(KINDS)('a %s tree is made of its own wood and its own leaves', (kind) => {
    const trunk = trunkHeight(kind, mulberry32(1));
    const blocks = treeBlocks(0, 10, 0, trunk, mulberry32(2), kind);
    const logs = blocks.filter((b) => !b.leaf);
    const leaves = blocks.filter((b) => b.leaf);
    expect(logs).toHaveLength(trunk);
    expect(logs.every((b) => b.id === LOGS[kind] && b.x === 0 && b.z === 0)).toBe(true);
    expect(logs.map((b) => b.y).sort((a, b) => a - b)).toEqual(Array.from({ length: trunk }, (_, i) => 10 + i));
    expect(leaves.length).toBeGreaterThan(8);
    expect(leaves.every((b) => b.id === LEAVES[kind])).toBe(true);
  });

  it('trunk heights differ by kind: oaks shortest, spruces tallest', () => {
    const r = mulberry32(9);
    const span = (kind: TreeKind) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < 200; i++) {
        const h = trunkHeight(kind, r);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
      return [lo, hi];
    };
    expect(span('oak')).toEqual([4, 6]);
    expect(span('birch')).toEqual([5, 7]);
    expect(span('spruce')).toEqual([6, 9]);
  });

  it('a spruce is a cone: narrow at the tip, wide lower down, with a single leaf on top', () => {
    const trunk = 8;
    const blocks = treeBlocks(0, 10, 0, trunk, mulberry32(4), 'spruce').filter((b) => b.leaf);
    const top = Math.max(...blocks.map((b) => b.y));
    const reach = (y: number) => Math.max(...blocks.filter((b) => b.y === y).map((b) => Math.max(Math.abs(b.x), Math.abs(b.z))));
    expect(reach(top)).toBe(0);
    expect(reach(top - 5)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...blocks.map((b) => Math.max(Math.abs(b.x), Math.abs(b.z))))).toBeGreaterThanOrEqual(3);
    // An oak is a ball: never wider than two blocks from the trunk.
    const oak = treeBlocks(0, 10, 0, 5, mulberry32(4), 'oak').filter((b) => b.leaf);
    expect(Math.max(...oak.map((b) => Math.max(Math.abs(b.x), Math.abs(b.z))))).toBe(2);
  });

  it('every sapling maps to its tree, and nothing else does', () => {
    expect(treeKindOfSapling(B.SAPLING)).toBe('oak');
    expect(treeKindOfSapling(B.BIRCH_SAPLING)).toBe('birch');
    expect(treeKindOfSapling(B.SPRUCE_SAPLING)).toBe('spruce');
    expect(treeKindOfSapling(B.GRASS)).toBeNull();
    expect(treeKindOfSapling(B.LEAVES)).toBeNull();
  });

  it.each([
    [B.SAPLING, 'oak'],
    [B.BIRCH_SAPLING, 'birch'],
    [B.SPRUCE_SAPLING, 'spruce'],
  ] as const)('sapling %i grows into a %s tree', (sapling, kind) => {
    const cells = new Map<string, number>();
    const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
    const world = {
      getBlock: (x: number, y: number, z: number) => cells.get(key(x, y, z)) ?? (y < 0 ? B.STONE : y === 0 ? B.GRASS : B.AIR),
      setBlock: (x: number, y: number, z: number, id: number) => (cells.set(key(x, y, z), id), true),
    };
    world.setBlock(0, 1, 0, sapling);
    expect(growTree(world, 0, 1, 0, mulberry32(3))).toBe(true);
    expect(world.getBlock(0, 1, 0)).toBe(LOGS[kind]);
    const placed = [...cells.values()];
    expect(placed.includes(LEAVES[kind])).toBe(true);
    for (const other of KINDS) if (other !== kind) expect(placed.includes(LOGS[other]) || placed.includes(LEAVES[other])).toBe(false);
  });

  it('a sapling stays a sapling when something is in the way', () => {
    const cells = new Map<string, number>([['0,4,0', B.STONE]]);
    const world = {
      getBlock: (x: number, y: number, z: number) => cells.get(`${x},${y},${z}`) ?? (y < 0 ? B.STONE : y === 0 ? B.GRASS : B.AIR),
      setBlock: (x: number, y: number, z: number, id: number) => (cells.set(`${x},${y},${z}`, id), true),
    };
    world.setBlock(0, 1, 0, B.SPRUCE_SAPLING);
    expect(growTree(world, 0, 1, 0, mulberry32(3))).toBe(false);
    expect(world.getBlock(0, 1, 0)).toBe(B.SPRUCE_SAPLING);
  });

  it('birch and spruce leaves drop their own saplings, oak leaves oak ones and apples', () => {
    const drop = (id: number, r: number) => blockDrops(BLOCKS[id], null, () => r);
    expect(drop(B.BIRCH_LEAVES, 0.01)).toEqual([{ id: B.BIRCH_SAPLING, count: 1 }]);
    expect(drop(B.SPRUCE_LEAVES, 0.01)).toEqual([{ id: B.SPRUCE_SAPLING, count: 1 }]);
    expect(drop(B.BIRCH_LEAVES, 0.9)).toEqual([]);
    expect(drop(B.LEAVES, 0.01)).toEqual([{ id: I.APPLE, count: 1 }]);
    expect(drop(B.LEAVES, 0.08)).toEqual([{ id: B.SAPLING, count: 1 }]);
  });

  it('birch and spruce logs and leaves are real, collectable-or-decorative blocks of the right kind', () => {
    expect(BLOCKS[B.BIRCH_LOG].solid).toBe(true);
    expect(BLOCKS[B.SPRUCE_LOG].solid).toBe(true);
    expect(BLOCKS[B.BIRCH_LEAVES].opaque).toBe(false);
    expect(BLOCKS[B.SPRUCE_LEAVES].opaque).toBe(false);
    expect(blockDrops(BLOCKS[B.BIRCH_LOG], null, () => 0.5)).toEqual([{ id: B.BIRCH_LOG, count: 1 }]);
    expect(blockDrops(BLOCKS[B.SPRUCE_LOG], null, () => 0.5)).toEqual([{ id: B.SPRUCE_LOG, count: 1 }]);
  });
});

describe('forests of three kinds', () => {
  const gen = new WorldGenerator(SEED);
  const t = terrain(gen);

  // Every trunk base in a block of the world: [kind, biome].
  const trunks: { id: number; biome: number }[] = [];
  const R = 14;
  for (let cx = -R; cx <= R; cx++) {
    for (let cz = -R; cz <= R; cz++) {
      const a = t.chunk(cx, cz);
      for (let y = 1; y < 200; y++) {
        for (let i = 0; i < 256; i++) {
          const id = a[y * 256 + i];
          if (id !== B.LOG && id !== B.BIRCH_LOG && id !== B.SPRUCE_LOG) continue;
          if (a[(y - 1) * 256 + i] === id) continue; // not the base
          // A tree, not a village pillar or a mine prop: its trunk ends in leaves of its own kind.
          let top = y;
          while (top < 250 && a[top * 256 + i] === id) top++;
          if (a[top * 256 + i] !== (id === B.LOG ? B.LEAVES : id === B.BIRCH_LOG ? B.BIRCH_LEAVES : B.SPRUCE_LEAVES)) continue;
          const wx = cx * 16 + (i & 15);
          const wz = cz * 16 + (i >> 4);
          trunks.push({ id, biome: gen.columnAt(wx, wz).biome });
        }
      }
    }
  }

  it('oaks, birches and spruces all occur', () => {
    for (const id of [B.LOG, B.BIRCH_LOG, B.SPRUCE_LOG]) expect(trunks.some((x) => x.id === id), `log ${id}`).toBe(true);
  });

  it('spruces stand only in cold biomes, birches only in forests, and no oak grows in the snow', () => {
    for (const x of trunks) {
      if (x.id === B.SPRUCE_LOG) expect([Biome.SNOW, Biome.TAIGA, Biome.SNOWY_TAIGA, Biome.OLD_TAIGA, Biome.WINDSWEPT_HILLS, Biome.MOUNTAIN]).toContain(x.biome);
      if (x.id === B.BIRCH_LOG) expect([Biome.FOREST, Biome.BIRCH_FOREST, Biome.FLOWER_FOREST, Biome.PLAINS, Biome.MEADOW]).toContain(x.biome);
      if (x.id === B.LOG) expect([Biome.SNOW, Biome.TAIGA, Biome.SNOWY_TAIGA, Biome.OLD_TAIGA]).not.toContain(x.biome);
    }
  });
});

describe('lakes', () => {
  const gen = new WorldGenerator(SEED);
  const t = terrain(gen);
  const lake = gen.nearestLake(0, 0, 40)!;

  it('exist near the spawn, with a level between the sea and the hills', () => {
    expect(lake).not.toBeNull();
    expect(lake.rx).toBeGreaterThan(2);
    expect(lake.rz).toBeGreaterThan(2);
    expect(lake.level).toBeGreaterThan(60);
  });

  it('hold water at their level, with open air above and a bed below', () => {
    const top = t.get(lake.x, lake.level, lake.z);
    expect(top === B.WATER || top === B.ICE).toBe(true);
    expect(t.get(lake.x, lake.level - 1, lake.z)).toBe(B.WATER);
    expect(t.get(lake.x, lake.level + 1, lake.z)).toBe(B.AIR);
    expect(BLOCKS[t.get(lake.x, lake.level - 3, lake.z)].solid).toBe(true);
  });

  it('are sealed: lake water never has air beside it', () => {
    let water = 0;
    for (let x = Math.floor(lake.x - lake.rx) - 2; x <= Math.ceil(lake.x + lake.rx) + 2; x++) {
      for (let z = Math.floor(lake.z - lake.rz) - 2; z <= Math.ceil(lake.z + lake.rz) + 2; z++) {
        for (let y = lake.level - 2; y <= lake.level; y++) {
          if (t.get(x, y, z) !== B.WATER) continue;
          water++;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            expect(t.get(x + dx, y, z + dz), `air next to water at ${x},${y},${z}`).not.toBe(B.AIR);
          }
        }
      }
    }
    expect(water).toBeGreaterThan(9);
  });

  it('freeze over in the snow', () => {
    let frozen: ReturnType<WorldGenerator['nearestLake']> = null;
    let plain: ReturnType<WorldGenerator['nearestLake']> = null;
    for (let i = -8; i <= 8 && !(frozen && plain); i++) {
      for (let j = -8; j <= 8 && !(frozen && plain); j++) {
        const l = gen.nearestLake(i * 600, j * 600, 6);
        if (!l) continue;
        if (l.ice) frozen ??= l;
        else plain ??= l;
      }
    }
    expect(plain).not.toBeNull();
    expect(frozen).not.toBeNull();
    expect(t.get(frozen!.x, frozen!.level, frozen!.z)).toBe(B.ICE);
    expect(t.get(frozen!.x, frozen!.level - 1, frozen!.z)).toBe(B.WATER);
    expect(t.get(plain!.x, plain!.level, plain!.z)).toBe(B.WATER);
  });

  it('keep trees out of the water', () => {
    for (let x = Math.floor(lake.x - lake.rx); x <= Math.ceil(lake.x + lake.rx); x++) {
      for (let z = Math.floor(lake.z - lake.rz); z <= Math.ceil(lake.z + lake.rz); z++) {
        if (t.get(x, lake.level, z) !== B.WATER) continue;
        for (let y = lake.level + 1; y < lake.level + 8; y++) {
          const id = t.get(x, y, z);
          expect([B.LOG, B.BIRCH_LOG, B.SPRUCE_LOG], `${x},${y},${z}`).not.toContain(id);
        }
      }
    }
  });
});

describe('biome tint', () => {
  const gen = new WorldGenerator(SEED);

  it('tintGrid has one packed climate per column, each within the 8x8 palette', () => {
    const g = gen.tintGrid(3, -4);
    expect(g).toHaveLength(CHUNK_SIZE * CHUNK_SIZE);
    for (const v of g) expect(v >> 6).toBeLessThanOrEqual(3); // temperature, humidity and a kind of water
    expect([...gen.tintGrid(3, -4)]).toEqual([...g]);
  });

  it('varies across the world and is smooth over a short distance', () => {
    let tLo = 1;
    let tHi = 0;
    let hLo = 1;
    let hHi = 0;
    for (let x = -3000; x <= 3000; x += 150) {
      for (let z = -3000; z <= 3000; z += 150) {
        const c = gen.climateAt(x, z);
        expect(c.t).toBeGreaterThanOrEqual(0);
        expect(c.t).toBeLessThanOrEqual(1);
        tLo = Math.min(tLo, c.t);
        tHi = Math.max(tHi, c.t);
        hLo = Math.min(hLo, c.h);
        hHi = Math.max(hHi, c.h);
      }
    }
    expect(tHi - tLo).toBeGreaterThan(0.6);
    expect(hHi - hLo).toBeGreaterThan(0.6);
    const a = gen.climateAt(100, 100);
    const b = gen.climateAt(101, 100);
    expect(Math.abs(a.t - b.t)).toBeLessThan(0.02);
  });

  it('the palette is white for "no tint", then grass, then water', () => {
    expect(paletteColor(0)).toEqual([255, 255, 255]);
    expect(paletteColor(1 + 3 * 8 + 4)).toEqual(grassColor(3.5 / 8, 4.5 / 8));
    expect(paletteColor(65 + 6)).toEqual(waterColor(6.5 / 8));
    expect(paletteColor(65 + 16 + 6)).toEqual(waterColor(6.5 / 8, 2));
    expect(waterTint(1 * 64 + 5 * 8 + 3)).toBe(65 + 8 + 5);
    expect(grassTint(2 * 64 + 5 * 8 + 3)).toBe(1 + 5 * 8 + 3);
    expect(grassTint(1 * 64 + 5 * 8 + 3)).toBe(97 + 5); // a swamp's own foliage
    for (let i = 1; i <= 104; i++) for (const c of paletteColor(i)) expect(c).toBeGreaterThanOrEqual(0), expect(c).toBeLessThanOrEqual(255);
  });

  it('cold grass is bluer than hot grass; cold water is greyer than warm water', () => {
    const cold = grassColor(0, 0.5);
    const hot = grassColor(1, 0.5);
    expect(cold[2]).toBeGreaterThan(hot[2]);
    expect(hot[0]).toBeGreaterThan(cold[0]);
    expect(waterColor(0)[0]).toBeGreaterThan(waterColor(1)[0]);
    expect(waterColor(1)[1]).toBeGreaterThan(waterColor(0)[1]);
  });
});

describe('desert temples', () => {
  const gen = new WorldGenerator(SEED);
  const t = terrain(gen);
  const temple = gen.nearestStructure('temple', 0, 0)!;

  it('exist, and only on desert sand', () => {
    expect(temple).not.toBeNull();
    expect(gen.columnAt(temple.x, temple.z).biome).toBe(Biome.DESERT);
  });

  it('hide four chests of the richest table, deep in a sealed chamber', () => {
    expect(temple.chests.size).toBe(4);
    for (const [key, table] of temple.chests) {
      expect(table).toBe('temple');
      const [x, y, z] = key.split(',').map(Number);
      expect(gen.lootAt(x, y, z)).toBe('temple');
      expect(t.get(x, y, z)).toBe(B.CHEST);
      expect(y).toBeLessThan(temple.y - 5);
    }
  });

  it('are built of sandstone, with a chiselled mark above the chamber', () => {
    let sandstone = 0;
    let chiselled = 0;
    for (let x = temple.minX; x <= temple.maxX; x++) {
      for (let z = temple.minZ; z <= temple.maxZ; z++) {
        for (let y = temple.y - 2; y <= temple.y + 16; y++) {
          const id = t.get(x, y, z);
          if (id === B.SANDSTONE) sandstone++;
          if (id === B.CHISELED_SANDSTONE) chiselled++;
        }
      }
    }
    expect(sandstone).toBeGreaterThan(150);
    expect(chiselled).toBeGreaterThan(0);
  });

  it('the temple loot is richer than a dungeon chest, and holds the rare finds', () => {
    expect(LOOT_TABLES.temple.rolls[0]).toBeGreaterThan(LOOT_TABLES.dungeon.rolls[0]);
    const items = LOOT_TABLES.temple.entries.map((x) => x.item);
    expect(items).toContain(I.DIAMOND);
    expect(items).toContain(I.ENDER_PEARL);
    expect(rollChest(LOOT_TABLES.temple, mulberry32(4)).filter(Boolean).length).toBeGreaterThanOrEqual(4);
  });
});

describe('castles', () => {
  const gen = new WorldGenerator(SEED);
  const t = terrain(gen);
  const castle = gen.nearestStructure('castle', 0, 0)!;

  it('exist, on open or wooded land', () => {
    expect(castle).not.toBeNull();
    const biome = gen.columnAt(castle.x, castle.z).biome;
    expect([Biome.DESERT, Biome.OCEAN, Biome.BEACH, Biome.SWAMP]).not.toContain(biome);
  });

  it('are the same for the same seed', () => {
    const again = new WorldGenerator(SEED).nearestStructure('castle', 0, 0)!;
    expect([again.x, again.y, again.z]).toEqual([castle.x, castle.y, castle.z]);
  });

  it('keep four chests with loot, and stand in the generated world', () => {
    expect(castle.chests.size).toBe(4);
    for (const [key, table] of castle.chests) {
      const [x, y, z] = key.split(',').map(Number);
      expect(gen.lootAt(x, y, z)).toBe(table);
      expect(t.get(x, y, z)).toBe(B.CHEST);
    }
  });

  it('are built of stone brick, with wool roofs, ladders and lit rooms', () => {
    let stone = 0;
    let wool = 0;
    let ladders = 0;
    let torches = 0;
    for (let x = castle.minX; x <= castle.maxX; x++) {
      for (let z = castle.minZ; z <= castle.maxZ; z++) {
        for (let y = castle.y - 1; y <= castle.y + 34; y++) {
          const id = t.get(x, y, z);
          if (id === B.STONE_BRICKS) stone++;
          else if (id >= B.WOOL_COLOR_BASE && id < B.WOOL_COLOR_BASE + 15) wool++;
          else if (id >= B.LADDER_BASE && id < B.LADDER_BASE + 4) ladders++;
          else if (id === B.TORCH) torches++;
        }
      }
    }
    expect(stone).toBeGreaterThan(2500);
    expect(wool).toBeGreaterThan(100);
    expect(ladders).toBeGreaterThan(30);
    expect(torches).toBeGreaterThan(20);
  });

  it('stand on level ground: the courtyard is clear and the mound is solid beneath', () => {
    // The gate's own side is open; the exact centre of the courtyard is in the middle of the keep, so test beside the wall.
    let solidBelow = 0;
    for (let dx = -8; dx <= 8; dx += 4) {
      for (let dz = -8; dz <= 8; dz += 4) {
        if (t.get(castle.x + dx, castle.y - 1, castle.z + dz) !== B.AIR) solidBelow++;
      }
    }
    expect(solidBelow).toBe(25);
  });
});

describe('mineshaft details', () => {
  const gen = new WorldGenerator(SEED);
  const t = terrain(gen);
  const m = gen.nearestStructure('mineshaft', 0, 0)!;

  it('lay rails and spin cobwebs along the corridors', () => {
    let rails = 0;
    let webs = 0;
    for (let cx = m.minX >> 4; cx <= m.maxX >> 4; cx++) {
      for (let cz = m.minZ >> 4; cz <= m.maxZ >> 4; cz++) {
        const a = t.chunk(cx, cz);
        for (let y = m.y - 4; y <= m.y + 6; y++) {
          for (let i = 0; i < 256; i++) {
            const id = a[y * 256 + i];
            if (id === B.RAIL_X || id === B.RAIL_Z) rails++;
            else if (id === B.COBWEB) webs++;
          }
        }
      }
    }
    expect(rails).toBeGreaterThan(10);
    expect(webs).toBeGreaterThan(0);
  });

  it('the first corridor always has a chest of supplies', () => {
    expect(m.chests.size).toBeGreaterThan(0);
  });

  it('cave spider nests exist, and every one is a spawner for cave spiders', () => {
    let nest: ReturnType<WorldGenerator['nearestStructure']> = null;
    for (let i = -6; i <= 6 && !nest; i++) {
      for (let j = -6; j <= 6 && !nest; j++) {
        const p = gen.nearestStructure('mineshaft', i * 700, j * 700);
        if (p && p.spawners.size > 0) nest = p;
      }
    }
    expect(nest).not.toBeNull();
    const tt = terrain(gen);
    for (const [key, mob] of nest!.spawners) {
      const [x, y, z] = key.split(',').map(Number);
      expect(mob).toBe('cave_spider');
      expect(gen.structures.spawnerAt(x, y, z)).toBe('cave_spider');
      expect(tt.get(x, y, z)).toBe(B.SPAWNER);
    }
    expect(gen.structures.spawnerAt(1, 1, 1)).toBeNull();
  });
});

describe('cobwebs', () => {
  const idleInput: MoveInput = { forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, fly: false, flyDown: false, yaw: 0 };

  it('slow walking to a fifth and a fall to a crawl', () => {
    const open: BlockReader = { getBlock: (_x, y) => (y < 0 ? B.STONE : B.AIR) };
    const webbed: BlockReader = { getBlock: (_x, y) => (y < 0 ? B.STONE : B.COBWEB) };
    const walk = (w: BlockReader) => {
      const b = createBody(0.5, 0, 0.5);
      for (let i = 0; i < 60; i++) stepPlayer(w, b, { ...idleInput, forward: 1 }, 1 / 60);
      return -b.z;
    };
    const free = walk(open);
    const stuck = walk(webbed);
    expect(stuck).toBeLessThan(free * 0.35);
    expect(stuck).toBeGreaterThan(0);

    const b = createBody(0.5, 30, 0.5);
    let fastest = 0;
    for (let i = 0; i < 120; i++) {
      stepPlayer({ getBlock: (_x, y) => (y < 0 ? B.STONE : y < 40 ? B.COBWEB : B.AIR) }, b, idleInput, 1 / 60);
      fastest = Math.min(fastest, b.vy);
    }
    expect(b.inWeb).toBe(true);
    expect(fastest).toBeGreaterThanOrEqual(-0.81);
  });

  it('a web is not solid, and costs a fall nothing', () => {
    expect(BLOCKS[B.COBWEB].solid).toBe(false);
    const { s, world } = make();
    s.setMode('survival');
    for (let y = FLOOR + 1; y <= FLOOR + 22; y++) world.setBlock(CX, y, CZ, B.COBWEB);
    const max = s.vitals.health;
    s.teleport(CX + 0.5, FLOOR + 20, CZ + 0.5, 0, 0);
    run(s, 40);
    expect(s.vitals.dead).toBe(false);
    expect(s.vitals.health).toBe(max);
    expect(s.body.y).toBeLessThan(FLOOR + 3);

    // The same drop without the web hurts.
    const other = make();
    other.s.setMode('survival');
    other.s.teleport(CX + 0.5, FLOOR + 20, CZ + 0.5, 0, 0);
    run(other.s, 6);
    expect(other.s.vitals.health).toBeLessThan(max);
  });
});

describe('buckets', () => {
  /** Stand west of a water source, looking at it. */
  function pond(mode: 'survival' | 'creative') {
    const { s, world } = make();
    s.setMode(mode);
    s.clearInventory();
    s.giveItem(I.BUCKET, 1);
    s.selectSlot(0);
    world.setBlock(CX + 2, FLOOR + 1, CZ, B.WATER);
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, -Math.PI / 2, -0.5);
    return { s, world };
  }

  it('an empty bucket scoops up a source and comes back full', () => {
    const { s, world } = pond('survival');
    expect(s.useBucket()).toBe(true);
    expect(world.getBlock(CX + 2, FLOOR + 1, CZ)).toBe(B.AIR);
    expect(s.inventory.countOf(I.WATER_BUCKET)).toBe(1);
    expect(s.inventory.countOf(I.BUCKET)).toBe(0);
  });

  it('a full bucket pours a source and comes back empty', () => {
    const { s, world } = pond('survival');
    s.useBucket();
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, -Math.PI / 2, -1.2);
    expect(s.useBucket()).toBe(true);
    expect(world.getBlock(CX + 1, FLOOR + 1, CZ)).toBe(B.WATER);
    expect(s.inventory.countOf(I.WATER_BUCKET)).toBe(0);
    expect(s.inventory.countOf(I.BUCKET)).toBe(1);
  });

  it('poured water runs, and a scooped source stops the flow', () => {
    const { s, world } = pond('survival');
    s.useBucket();
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, -Math.PI / 2, -1.2);
    s.useBucket();
    run(s, 4);
    expect(world.getBlock(CX + 2, FLOOR + 1, CZ)).not.toBe(B.AIR);
    expect(world.getBlock(CX + 1, FLOOR + 1, CZ)).toBe(B.WATER);
  });

  it('lava goes into a bucket too, and a stack of buckets gives one up at a time', () => {
    const { s, world } = make();
    s.setMode('survival');
    s.clearInventory();
    s.giveItem(I.BUCKET, 3);
    s.selectSlot(0);
    world.setBlock(CX + 2, FLOOR + 1, CZ, B.LAVA);
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, -Math.PI / 2, -0.5);
    expect(s.useBucket()).toBe(true);
    expect(s.inventory.countOf(I.LAVA_BUCKET)).toBe(1);
    expect(s.inventory.countOf(I.BUCKET)).toBe(2);
  });

  it('flowing water cannot be scooped, only its source', () => {
    const { s, world } = make();
    s.setMode('survival');
    s.clearInventory();
    s.giveItem(I.BUCKET, 1);
    s.selectSlot(0);
    world.setBlock(CX + 2, FLOOR + 1, CZ, B.WATER_3);
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, -Math.PI / 2, -0.5);
    expect(s.useBucket()).toBe(false);
    expect(world.getBlock(CX + 2, FLOOR + 1, CZ)).toBe(B.WATER_3);
  });

  it('in creative a bucket is never used up', () => {
    const { s } = pond('creative');
    expect(s.useBucket()).toBe(true);
    expect(s.inventory.countOf(I.BUCKET)).toBe(1);
    expect(s.inventory.countOf(I.WATER_BUCKET)).toBe(1);
  });

  it('only buckets work as buckets', () => {
    const { s } = pond('survival');
    s.inventory.set(0, makeStack(I.STICK, 1));
    expect(s.useBucket()).toBe(false);
  });
});

describe('poison', () => {
  it('a cave spider bite drains health but can never kill', () => {
    const { s } = make();
    s.setMode('survival');
    s.vitals.health = 4;
    s.hurtByMob(1, 0, 0, 'cave_spider', 'poison');
    expect(s.poison).toBeGreaterThan(0);
    let lowest = 99;
    for (let i = 0; i < 20 * 30; i++) {
      s.tick(idle());
      lowest = Math.min(lowest, s.vitals.health);
    }
    expect(s.vitals.dead).toBe(false);
    expect(lowest).toBeGreaterThanOrEqual(1);
    expect(s.poison).toBe(0);
  });

  it('wears off, and does nothing in creative', () => {
    const { s } = make();
    s.setMode('creative');
    s.hurtByMob(1, 0, 0, 'cave_spider', 'poison');
    expect(s.poison).toBe(0);
  });

  it('an ordinary hit never poisons', () => {
    const { s } = make();
    s.setMode('survival');
    s.hurtByMob(1, 0, 0, 'zombie');
    expect(s.poison).toBe(0);
  });
});

describe('old worlds', () => {
  /** Hand-rolled run-length encoding, as `encodeChunk` did it, for a chunk of the old height. */
  function rle(runs: [number, number][]): Uint8Array {
    const out: number[] = [1];
    for (const [v, n] of runs) {
      out.push(v);
      let run = n;
      while (run >= 0x80) {
        out.push((run & 0x7f) | 0x80);
        run >>>= 7;
      }
      out.push(run);
    }
    return Uint8Array.from(out);
  }

  it('a chunk saved at 128 blocks high loads with open sky above', () => {
    expect(LEGACY_CHUNK_BYTES).toBeLessThan(CHUNK_BYTES);
    const old = decodeChunk(rle([[B.STONE, LEGACY_CHUNK_BYTES / 2], [B.AIR, LEGACY_CHUNK_BYTES / 2]]));
    expect(old).toHaveLength(CHUNK_BYTES);
    expect(old[blockIndex(3, 10, 3)]).toBe(B.STONE);
    expect(old[blockIndex(3, 70, 3)]).toBe(B.AIR);
    for (let y = 128; y < WORLD_HEIGHT; y += 17) expect(old[blockIndex(0, y, 0)]).toBe(B.AIR);
  });

  it('a chunk of any other size is refused', () => {
    expect(() => decodeChunk(rle([[B.STONE, 1000]]))).toThrow();
  });
});

describe('climbing out of the water', () => {
  const idleInput: MoveInput = { forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, fly: false, flyDown: false, yaw: 0 };
  /** A pool 8 wide (water up to y 4) beside a bank whose top is at `bank`. */
  const pool = (bank: number): BlockReader => ({
    getBlock: (x, y) => (y <= 0 ? B.STONE : x >= 1 ? (y < bank ? B.STONE : B.AIR) : y <= 3 ? B.WATER : B.AIR),
  });

  it.each([5, 4])('a swimmer who walks at the bank and jumps gets out onto a bank with its top at %i', (bank) => {
    const w = pool(bank);
    const b = createBody(-2.5, 1, 0.5);
    for (let i = 0; i < 60 * 6; i++) stepPlayer(w, b, { ...idleInput, forward: 1, jump: true, yaw: -Math.PI / 2 }, 1 / 60);
    expect(b.x).toBeGreaterThan(1.1);
    expect(b.y).toBeGreaterThanOrEqual(bank - 0.01);
  });

  it('without jumping a swimmer stays in the water', () => {
    const w = pool(5);
    const b = createBody(-2.5, 1, 0.5);
    for (let i = 0; i < 60 * 6; i++) stepPlayer(w, b, { ...idleInput, forward: 1, yaw: -Math.PI / 2 }, 1 / 60);
    expect(b.x).toBeLessThan(1);
    expect(b.inWater).toBe(true);
  });

  it('a wall that is too high is not climbed', () => {
    const w = pool(8);
    const b = createBody(-2.5, 1, 0.5);
    for (let i = 0; i < 60 * 6; i++) stepPlayer(w, b, { ...idleInput, forward: 1, jump: true, yaw: -Math.PI / 2 }, 1 / 60);
    expect(b.x).toBeLessThan(1);
  });

  it.each([
    ['pig', 0.9, 0.9, 3.4],
    ['fox', 0.6, 0.7, 4.6],
    ['chicken', 0.4, 0.7, 2.8],
    ['rabbit', 0.4, 0.5, 3.2],
    ['chick', 0.2, 0.35, 2.8],
  ])('a %s climbs a corner of the shore', (_name, width, height, speed) => {
    const corner = (bank: number): BlockReader => ({
      getBlock: (x, y, z) => (y <= 0 ? B.STONE : x >= 1 && z >= 1 ? (y < bank ? B.STONE : B.AIR) : y <= 3 ? B.WATER : B.AIR),
    });
    for (const bank of [4, 5]) {
      const w = corner(bank);
      const b = createBody(0.15, 1.6, 0.15);
      b.width = width;
      b.height = height;
      // Facing the corner, the way an animal swims for the nearest dry cell.
      const yaw = Math.atan2(-1, -1);
      for (let i = 0; i < 60 * 6; i++) stepPlayer(w, b, { ...idleInput, forward: 1, jump: true, speed, yaw }, 1 / 60);
      expect(b.x, `bank ${bank} x=${b.x.toFixed(2)} z=${b.z.toFixed(2)} y=${b.y.toFixed(2)}`).toBeGreaterThan(1.05);
      expect(b.z, `bank ${bank} z`).toBeGreaterThan(1.05);
      expect(b.inWater, `bank ${bank} water`).toBe(false);
    }
  });

  it.each([
    ['pig', 0.9, 0.9, 3.4],
    ['fox', 0.6, 0.7, 4.6],
    ['chicken', 0.4, 0.7, 2.8],
    ['rabbit', 0.4, 0.5, 3.2],
    ['chick', 0.2, 0.35, 2.8],
  ])('a %s already draped on the lip steps up out of the water', (_name, width, height, speed) => {
    for (const bank of [4, 5]) {
      const w = pool(bank);
      // Leading edge already inside the bank, feet still in the surface water. Rising in place used to
      // hit the face and drop them back.
      const b = createBody(1 - width / 2 + 0.06, 3.15, 0.5);
      b.width = width;
      b.height = height;
      for (let i = 0; i < 60 * 3; i++) stepPlayer(w, b, { ...idleInput, forward: 1, jump: true, speed, yaw: -Math.PI / 2 }, 1 / 60);
      expect(b.x, `bank ${bank} x=${b.x.toFixed(2)} y=${b.y.toFixed(2)}`).toBeGreaterThan(1.05);
      expect(b.y, `bank ${bank} y`).toBeGreaterThanOrEqual(bank - 0.05);
      expect(b.inWater, `bank ${bank} water`).toBe(false);
    }
  });

  it.each([
    ['pig', 0.9, 0.9, 3.4],
    ['fox', 0.6, 0.7, 4.6],
    ['chicken', 0.4, 0.7, 2.8],
    ['rabbit', 0.4, 0.5, 3.2],
    ['chick', 0.2, 0.35, 2.8],
  ])('a %s climbs out of the water onto the shore', (_name, width, height, speed) => {
    for (const bank of [4, 5]) {
      for (const startX of [-1.2, 1 - width / 2 - 0.02]) {
        const w = pool(bank);
        const b = createBody(startX, 1.6, 0.5);
        b.width = width;
        b.height = height;
        for (let i = 0; i < 60 * 6; i++) stepPlayer(w, b, { ...idleInput, forward: 1, jump: true, speed, yaw: -Math.PI / 2 }, 1 / 60);
        expect(b.x, `bank ${bank} from ${startX.toFixed(2)} x=${b.x.toFixed(2)} y=${b.y.toFixed(2)}`).toBeGreaterThan(1.05);
        expect(b.y, `bank ${bank} y`).toBeGreaterThanOrEqual(bank - 0.05);
        expect(b.inWater, `bank ${bank} water`).toBe(false);
      }
    }
  });
});

describe('rails', () => {
  it('can be set on the side of a block as well as on top, never on a ceiling', () => {
    expect(placementFor(B.RAIL_X, 0, 1, 0, 0)).toBe(B.RAIL_Z);
    expect(placementFor(B.RAIL_X, 1, 0, 0, 0)).not.toBeNull();
    expect(placementFor(B.RAIL_X, 0, 0, -1, Math.PI / 2)).toBe(B.RAIL_X);
    expect(placementFor(B.RAIL_X, 0, -1, 0, 0)).toBeNull();
  });

  it('a player clicking the wall of a block puts the rail on the floor beside it', () => {
    const { s, world } = make();
    s.setMode('survival');
    s.clearInventory();
    s.giveItem(B.RAIL_X, 4);
    s.selectSlot(0);
    world.setBlock(CX + 2, FLOOR + 1, CZ, B.STONE);
    expect(s.useHeldOn({ x: CX + 2, y: FLOOR + 1, z: CZ, id: B.STONE, nx: -1, ny: 0, nz: 0 })).toBe(true);
    expect(world.getBlock(CX + 1, FLOOR + 1, CZ)).toBe(B.RAIL_Z); // facing -z (yaw 0)
    expect(s.inventory.countOf(B.RAIL_X)).toBe(3);
  });

  it('but a rail with no floor under it is refused', () => {
    const { s, world } = make();
    s.setMode('survival');
    s.clearInventory();
    s.giveItem(B.RAIL_X, 4);
    s.selectSlot(0);
    world.setBlock(CX + 2, FLOOR + 5, CZ, B.STONE);
    expect(s.useHeldOn({ x: CX + 2, y: FLOOR + 5, z: CZ, id: B.STONE, nx: -1, ny: 0, nz: 0 })).toBe(false);
    expect(s.inventory.countOf(B.RAIL_X)).toBe(4);
  });
});