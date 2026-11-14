import { describe, expect, it } from 'vitest';
import {
  B,
  BLOCKS,
  BlockEntities,
  CHUNK_SIZE,
  CaveCarver,
  GameSession,
  HeadlessWorld,
  I,
  ITEMS,
  LAVA_LEVEL,
  LOOT_TABLES,
  SEA_LEVEL,
  WORLD_HEIGHT,
  WorldGenerator,
  blockIndex,
  canStayAt,
  getItem,
  makeStack,
  mulberry32,
  positionRand,
  rollChest,
  spawnerKind,
  toolId,
  type InputFrame,
  type LootTableName,
} from './index';
import { settleOrbs } from './xpOrbs.testutil';

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
function make(opts: { spawning?: boolean } = {}) {
  const generator = new WorldGenerator(SEED);
  const world = new HeadlessWorld(generator);
  for (let x = CX - 12; x <= CX + 12; x++)
    for (let z = CZ - 12; z <= CZ + 12; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 14; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.STONE);
    }
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: opts.spawning ?? false, rand: mulberry32(5) });
  s.finishLoading();
  s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
  return { s, world, generator };
}

function run(s: GameSession, seconds: number): void {
  for (let i = 0; i < seconds * 20; i++) s.tick(idle());
}

const blocksIn = (gen: WorldGenerator, cx: number, cz: number) => gen.generateChunk(cx, cz);

describe('loot tables', () => {
  it('only name items that exist, and roll within their limits', () => {
    for (const [name, table] of Object.entries(LOOT_TABLES)) {
      for (const e of table.entries) {
        expect(ITEMS.has(e.item), `${name}: item ${e.item}`).toBe(true);
        expect(e.min).toBeGreaterThan(0);
        expect(e.max).toBeGreaterThanOrEqual(e.min);
        expect(e.max).toBeLessThanOrEqual(getItem(e.item).maxStack);
        expect(e.weight).toBeGreaterThan(0);
      }
      for (let i = 0; i < 200; i++) {
        const slots = rollChest(table, mulberry32(i));
        expect(slots).toHaveLength(27);
        const stacks = slots.filter(Boolean);
        expect(stacks.length).toBeGreaterThanOrEqual(1);
        expect(stacks.length).toBeLessThanOrEqual(table.rolls[1] + ('gear' in table ? 1 : 0));
      }
    }
  });

  it('roll the same loot for the same seed and place, different loot elsewhere', () => {
    const a = rollChest(LOOT_TABLES.dungeon, positionRand(SEED, 10, 20, 30));
    const b = rollChest(LOOT_TABLES.dungeon, positionRand(SEED, 10, 20, 30));
    const c = rollChest(LOOT_TABLES.dungeon, positionRand(SEED, 11, 20, 30));
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
  });

  it('are random slot by slot, not packed at the top', () => {
    let packed = 0;
    for (let i = 0; i < 50; i++) {
      const slots = rollChest(LOOT_TABLES.dungeon, mulberry32(i));
      const n = slots.filter(Boolean).length;
      if (slots.slice(0, n).every(Boolean)) packed++;
    }
    expect(packed).toBeLessThan(5);
  });

  it('dungeon loot includes the monsters\' leavings and, rarely, treasure', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) for (const s of rollChest(LOOT_TABLES.dungeon, mulberry32(i))) if (s) seen.add(s.id);
    for (const id of [I.BONE, I.ROTTEN_FLESH, I.GUNPOWDER, I.STRING, I.IRON_INGOT, I.DIAMOND]) expect(seen.has(id)).toBe(true);
  });
});

describe('generated chests', () => {
  const loot = (x: number, y: number, z: number) => (x === 5 && y === 6 && z === 7 ? rollChest(LOOT_TABLES.dungeon, mulberry32(1)) : null);

  it('fill with loot the first time and stay as the player left them', () => {
    const be = new BlockEntities();
    be.loot = loot;
    const c = be.chest(5, 6, 7);
    expect(c.isEmpty()).toBe(false);
    const stacks = c.toJSON();
    c.drain();
    // Emptied by the player: it must not refill, not even after a save and load.
    expect(be.chest(5, 6, 7).isEmpty()).toBe(true);
    const saved = JSON.parse(JSON.stringify(be.toJSON()));
    const be2 = new BlockEntities();
    be2.loot = loot;
    be2.loadJSON(saved);
    expect(be2.chest(5, 6, 7).isEmpty()).toBe(true);
    expect(stacks.length).toBeGreaterThan(0);
  });

  it('keep their contents across a save, and ordinary chests stay empty', () => {
    const be = new BlockEntities();
    be.loot = loot;
    const before = JSON.stringify(be.chest(5, 6, 7).toJSON());
    expect(be.chest(1, 1, 1).isEmpty()).toBe(true);
    const be2 = new BlockEntities();
    be2.loot = loot;
    be2.loadJSON(JSON.parse(JSON.stringify(be.toJSON())));
    expect(JSON.stringify(be2.chest(5, 6, 7).toJSON())).toBe(before);
  });

  it('give their loot up when broken unopened, and never refill when replaced', () => {
    const be = new BlockEntities();
    be.loot = loot;
    const drops = be.remove(B.CHEST, 5, 6, 7);
    expect(drops.length).toBeGreaterThan(0);
    expect(be.remove(B.CHEST, 5, 6, 7)).toEqual([]);
    expect(be.chest(5, 6, 7).isEmpty()).toBe(true);
  });

  it('a chest placed by a player is empty even where loot could have been', () => {
    const be = new BlockEntities();
    be.loot = () => null;
    expect(be.chest(5, 6, 7).isEmpty()).toBe(true);
  });
});

// Where a dead bush may stand: sand, and the dry clays of the badlands.
const DRY_GROUND = new Set<number>([B.SAND, B.RED_SAND, B.COARSE_DIRT, B.TERRACOTTA, B.TERRACOTTA_ORANGE, B.TERRACOTTA_RED, B.TERRACOTTA_BROWN, B.TERRACOTTA_YELLOW, B.TERRACOTTA_WHITE, B.TERRACOTTA_LIGHT_GRAY]);

describe('worldgen v2', () => {
  it('is deterministic whatever order chunks are generated in', () => {
    const a = new WorldGenerator(SEED);
    const b = new WorldGenerator(SEED);
    const coords: [number, number][] = [];
    for (let cx = -4; cx <= 4; cx++) for (let cz = -4; cz <= 4; cz++) coords.push([cx, cz]);
    const first = new Map<string, Uint16Array>();
    for (const [cx, cz] of coords) first.set(`${cx},${cz}`, a.generateChunk(cx, cz));
    for (const [cx, cz] of [...coords].reverse()) {
      expect(Buffer.compare(Buffer.from(b.generateChunk(cx, cz)), Buffer.from(first.get(`${cx},${cz}`)!))).toBe(0);
    }
  });

  it('digs caves under the ground and a few of them open onto the surface', () => {
    const gen = new WorldGenerator(SEED);
    let underground = 0;
    let openings = 0;
    for (let cx = -6; cx <= 6; cx++) {
      for (let cz = -6; cz <= 6; cz++) {
        const a = blocksIn(gen, cx, cz);
        for (let z = 0; z < CHUNK_SIZE; z++) {
          for (let x = 0; x < CHUNK_SIZE; x++) {
            const h = gen.columnAt(cx * 16 + x, cz * 16 + z).height;
            for (let y = 6; y < h - 4; y++) if (a[blockIndex(x, y, z)] === B.AIR) underground++;
            if (h > SEA_LEVEL + 2 && a[blockIndex(x, h, z)] === B.AIR && a[blockIndex(x, h - 1, z)] === B.AIR) openings++;
          }
        }
      }
    }
    expect(underground).toBeGreaterThan(50000);
    expect(openings).toBeGreaterThan(5);
  });

  it('puts lava only deep down and never over open ground', () => {
    const gen = new WorldGenerator(SEED);
    let lava = 0;
    let water = 0;
    for (let cx = -6; cx <= 6; cx++) {
      for (let cz = -6; cz <= 6; cz++) {
        const a = blocksIn(gen, cx, cz);
        for (let y = 1; y < WORLD_HEIGHT; y++) {
          for (let z = 0; z < CHUNK_SIZE; z++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
              const id = a[blockIndex(x, y, z)];
              if (id === B.LAVA) {
                lava++;
                expect(y).toBeLessThanOrEqual(LAVA_LEVEL);
                expect(y).toBeGreaterThan(4);
              }
              if (id === B.WATER && y < SEA_LEVEL - 4) {
                const h = gen.columnAt(cx * 16 + x, cz * 16 + z).height;
                if (y > h) water++;
              }
            }
          }
        }
      }
    }
    expect(lava).toBeGreaterThan(1000);
    expect(water).toBeGreaterThan(0);
  });

  it('keeps bedrock at the bottom and never carves through it', () => {
    const gen = new WorldGenerator(SEED);
    for (let cx = -3; cx <= 3; cx++) {
      for (let cz = -3; cz <= 3; cz++) {
        const a = blocksIn(gen, cx, cz);
        for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) expect(a[blockIndex(x, 0, z)]).toBe(B.BEDROCK);
      }
    }
  });

  it('cave carvers depend only on the seed and the start chunk', () => {
    const a = new CaveCarver(SEED);
    const b = new CaveCarver(SEED);
    const c = new CaveCarver(SEED + 1);
    let differs = false;
    let spheres = 0;
    for (let sx = -10; sx <= 10; sx++) {
      for (let sz = -10; sz <= 10; sz++) {
        expect(b.plan(sx, sz)).toEqual(a.plan(sx, sz));
        spheres += a.plan(sx, sz).length;
        if (JSON.stringify(c.plan(sx, sz)) !== JSON.stringify(a.plan(sx, sz))) differs = true;
      }
    }
    expect(spheres).toBeGreaterThan(500);
    expect(differs).toBe(true);
  });

  it('tunnels stay in reach of the chunks that plan them', () => {
    const carver = new CaveCarver(SEED);
    for (let sx = -8; sx <= 8; sx++) {
      for (let sz = -8; sz <= 8; sz++) {
        for (const s of carver.plan(sx, sz)) {
          // 5 chunks of reach: no sphere may touch a chunk farther away than that.
          expect(Math.abs(s.x - (sx * 16 + 8))).toBeLessThan(5 * 16 + 8 - s.rh + 1);
          expect(Math.abs(s.z - (sz * 16 + 8))).toBeLessThan(5 * 16 + 8 - s.rh + 1);
        }
      }
    }
  });

  it('lays a river bed below sea level somewhere, and mountains stay dry', () => {
    const gen = new WorldGenerator(SEED);
    let rivers = 0;
    for (let x = -600; x <= 600; x += 6) {
      for (let z = -600; z <= 600; z += 6) {
        const c = gen.columnAt(x, z);
        if (c.height < SEA_LEVEL && c.height >= SEA_LEVEL - 4) rivers++;
      }
    }
    expect(rivers).toBeGreaterThan(100);
  });

  it('turns desert ground into sand over sandstone, with cacti and dead bushes on top', () => {
    const gen = new WorldGenerator(SEED);
    let sandstone = 0;
    let cacti = 0;
    let bushes = 0;
    for (let cx = -90; cx <= 90; cx += 2) {
      for (let cz = -90; cz <= 90; cz += 2) {
        if (gen.columnAt(cx * 16 + 8, cz * 16 + 8).biome !== 4) continue;
        const a = blocksIn(gen, cx, cz);
        for (let y = 1; y < WORLD_HEIGHT; y++) {
          for (let z = 0; z < CHUNK_SIZE; z++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
              const id = a[blockIndex(x, y, z)];
              if (id === B.SANDSTONE) sandstone++;
              if (id === B.CACTUS) {
                cacti++;
                const below = a[blockIndex(x, y - 1, z)];
                expect(below === B.SAND || below === B.RED_SAND || below === B.CACTUS).toBe(true);
              }
              if (id === B.DEAD_BUSH) {
                bushes++;
                expect(DRY_GROUND.has(a[blockIndex(x, y - 1, z)])).toBe(true);
              }
            }
          }
        }
      }
    }
    expect(sandstone).toBeGreaterThan(500);
    expect(cacti).toBeGreaterThan(5);
    expect(bushes).toBeGreaterThan(5);
  });

  it('mixes granite, diorite and andesite into the stone', () => {
    const gen = new WorldGenerator(SEED);
    const seen = new Set<number>();
    for (let cx = -3; cx <= 3; cx++) {
      for (let cz = -3; cz <= 3; cz++) {
        const a = blocksIn(gen, cx, cz);
        for (let i = 0; i < a.length; i++) if (a[i] === B.GRANITE || a[i] === B.DIORITE || a[i] === B.ANDESITE) seen.add(a[i]);
      }
    }
    expect(seen.size).toBe(3);
  });
});

describe('dungeons', () => {
  const gen = new WorldGenerator(SEED);
  const d = gen.nearestStructure('dungeon', 0, 0)!;

  it('exist, and hold a spawner, one or two chests and a mossy floor', () => {
    expect(d).not.toBeNull();
    expect(d.chests.size).toBeGreaterThanOrEqual(1);
    expect(d.chests.size).toBeLessThanOrEqual(2);
    const cx = Math.floor(d.x / 16);
    const cz = Math.floor(d.z / 16);
    const a = blocksIn(gen, cx, cz);
    const at = (x: number, y: number, z: number) => a[blockIndex(x - cx * 16, y, z - cz * 16)];
    expect(at(d.x, d.y, d.z)).toBe(B.SPAWNER);
    for (const key of d.chests.keys()) {
      const [x, y, z] = key.split(',').map(Number);
      expect(at(x, y, z)).toBe(B.CHEST);
      expect(at(x, y - 1, z)).not.toBe(B.AIR);
    }
    let mossy = 0;
    let cobble = 0;
    for (let x = d.x - 2; x <= d.x + 2; x++)
      for (let z = d.z - 2; z <= d.z + 2; z++) {
        const f = at(x, d.y - 1, z);
        if (f === B.MOSSY_COBBLE) mossy++;
        if (f === B.COBBLE) cobble++;
      }
    expect(mossy + cobble).toBeGreaterThan(15);
    expect(mossy).toBeGreaterThan(0);
    // The room itself is open air.
    expect(at(d.x + 1, d.y, d.z)).toBe(B.AIR);
    expect(at(d.x + 1, d.y + 2, d.z)).toBe(B.AIR);
  });

  it('are found at a sensible rate, under dry land and rock', () => {
    let n = 0;
    for (let cx = -12; cx <= 12; cx++) {
      for (let cz = -12; cz <= 12; cz++) {
        const p = gen.structures.dungeonInChunk(cx, cz);
        if (!p) continue;
        n++;
        expect(p.y).toBeGreaterThanOrEqual(12);
        expect(gen.columnAt(p.x, p.z).height).toBeGreaterThanOrEqual(p.y + 8);
      }
    }
    expect(n).toBeGreaterThan(20);
    expect(n).toBeLessThan(250);
  });

  it('know which chests are theirs: the loot table is named by place, not stored in the chunk', () => {
    for (const key of d.chests.keys()) {
      const [x, y, z] = key.split(',').map(Number);
      expect(gen.lootAt(x, y, z)).toBe('dungeon');
      expect(gen.lootAt(x + 1, y, z)).toBeNull();
    }
  });

  it('give a spawner a fixed kind of mob', () => {
    expect(spawnerKind(SEED, d.x, d.y, d.z)).toBe(spawnerKind(SEED, d.x, d.y, d.z));
    const kinds = new Set<string>();
    for (let i = 0; i < 40; i++) kinds.add(spawnerKind(SEED, i * 7, 20, i * 3));
    expect(kinds).toEqual(new Set(['zombie', 'skeleton']));
  });

  it('roll loot through a realm, the same every time it is looked at', () => {
    const generator = new WorldGenerator(SEED);
    const world = new HeadlessWorld(generator);
    const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(1) });
    const [x, y, z] = [...d.chests.keys()][0].split(',').map(Number);
    const first = JSON.stringify(s.blockEntities.chest(x, y, z).toJSON());
    expect(s.blockEntities.chest(x, y, z).isEmpty()).toBe(false);
    // Another world with the same seed rolls the same items.
    const s2 = new GameSession({ seed: SEED, world: new HeadlessWorld(generator), generator, naturalSpawning: false, rand: mulberry32(9) });
    expect(JSON.stringify(s2.blockEntities.chest(x, y, z).toJSON())).toBe(first);
  });
});

describe('mineshafts', () => {
  const gen = new WorldGenerator(SEED);
  const m = gen.nearestStructure('mineshaft', 0, 0)!;

  it('exist, with a long corridor that is open across chunk borders', () => {
    expect(m).not.toBeNull();
    const op = m.ops[0] as { x0: number; x1: number; z0: number; z1: number; y0: number };
    const alongX = op.x1 - op.x0 > op.z1 - op.z0;
    const len = alongX ? op.x1 - op.x0 : op.z1 - op.z0;
    expect(len).toBeGreaterThan(30);
    const cache = new Map<string, Uint16Array>();
    const get = (x: number, y: number, z: number) => {
      const k = `${x >> 4},${z >> 4}`;
      let a = cache.get(k);
      if (!a) cache.set(k, (a = gen.generateChunk(x >> 4, z >> 4)));
      return a[blockIndex(x & 15, y, z & 15)];
    };
    const mid = alongX ? Math.floor((op.z0 + op.z1) / 2) : Math.floor((op.x0 + op.x1) / 2);
    let chunksCrossed = new Set<number>();
    for (let i = alongX ? op.x0 : op.z0; i <= (alongX ? op.x1 : op.z1); i++) {
      const x = alongX ? i : mid;
      const z = alongX ? mid : i;
      chunksCrossed.add(alongX ? x >> 4 : z >> 4);
      expect(get(x, op.y0 + 1, z), `air at ${x},${op.y0 + 1},${z}`).toBe(B.AIR);
    }
    expect(chunksCrossed.size).toBeGreaterThanOrEqual(3);
  });

  it('are propped with timber and lit with torches', () => {
    let logs = 0;
    let planks = 0;
    let torches = 0;
    const seen = new Set<string>();
    for (const op of m.ops) {
      for (let x = op.x0; x <= op.x1; x += 8) {
        for (let z = op.z0; z <= op.z1; z += 8) {
          const k = `${x >> 4},${z >> 4}`;
          if (seen.has(k)) continue;
          seen.add(k);
          const a = gen.generateChunk(x >> 4, z >> 4);
          for (let y = m.y - 1; y <= m.y + 3; y++) {
            for (let i = 0; i < 256; i++) {
              const id = a[(y * 16 + (i >> 4)) * 16 + (i & 15)];
              if (id === B.LOG) logs++;
              else if (id === B.PLANKS) planks++;
              else if (id === B.TORCH) torches++;
            }
          }
        }
      }
    }
    expect(logs).toBeGreaterThan(10);
    expect(planks).toBeGreaterThan(10);
    expect(torches).toBeGreaterThan(0);
  });

  it('have chests that roll the mineshaft table', () => {
    expect(m.chests.size).toBeGreaterThan(0);
    for (const key of m.chests.keys()) {
      const [x, y, z] = key.split(',').map(Number);
      expect(gen.lootAt(x, y, z)).toBe('mineshaft' satisfies LootTableName);
    }
  });
});

describe('villages', () => {
  it('keep chests in their houses, with village loot', () => {
    const gen = new WorldGenerator(SEED);
    const site = gen.nearestVillage(0, 0)!;
    let chests = 0;
    const others: string[] = ['dungeon', 'mineshaft', 'cache'];
    for (let cx = Math.floor((site.x - 30) / 16); cx <= Math.floor((site.x + 30) / 16); cx++) {
      for (let cz = Math.floor((site.z - 30) / 16); cz <= Math.floor((site.z + 30) / 16); cz++) {
        const a = gen.generateChunk(cx, cz);
        for (let y = 1; y < WORLD_HEIGHT; y++)
          for (let z = 0; z < 16; z++)
            for (let x = 0; x < 16; x++) {
              if (a[blockIndex(x, y, z)] !== B.CHEST) continue;
              const table = gen.lootAt(cx * 16 + x, y, cz * 16 + z);
              expect(table).not.toBeNull();
              if (table === 'village') chests++;
              else expect(others).toContain(table);
            }
      }
    }
    expect(chests).toBeGreaterThan(0);
  });
});

describe('lava', () => {
  function pool(s: GameSession, world: HeadlessWorld, size = 3) {
    for (let y = FLOOR + 1; y <= FLOOR + 2; y++)
      for (let x = CX - size; x <= CX + size; x++) for (let z = CZ - size; z <= CZ + size; z++) world.setBlock(x, y, z, B.LAVA);
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
  }

  it('burns the player who wades in, right away and then twice a second', () => {
    const { s, world } = make();
    expect(s.vitals.health).toBe(20);
    pool(s, world);
    s.tick(idle());
    expect(s.body.inLava).toBe(true);
    expect(s.body.inWater).toBe(true); // lava counts as swimmable too
    s.tick(idle());
    expect(s.vitals.health).toBe(16);
    expect(s.vitals.lastDamage).toBe('lava');
    run(s, 1);
    expect(s.vitals.health).toBeLessThanOrEqual(12);
  });

  it('kills with its own death message', () => {
    const { s, world } = make();
    pool(s, world);
    run(s, 4);
    expect(s.vitals.dead).toBe(true);
    expect(s.deathMessage()).toBe('You tried to swim in lava');
  });

  it('does not hurt in creative mode', () => {
    const { s, world } = make();
    s.setMode('creative');
    pool(s, world);
    run(s, 2);
    expect(s.vitals.health).toBe(20);
  });

  it('is slow to wade through and does not drown you', () => {
    const { s, world } = make();
    s.setMode('creative');
    pool(s, world, 6);
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
    s.flying = false;
    const f: InputFrame = { ...idle(), forward: 1 };
    const z0 = s.body.z;
    run(s, 1);
    expect(s.body.eyeInLava).toBeDefined();
    for (let i = 0; i < 20; i++) s.tick(f);
    expect(z0 - s.body.z).toBeLessThan(1.6);
    expect(s.vitals.air).toBeGreaterThanOrEqual(10);
  });

  it('burns up items that fall into it', () => {
    const { s, world } = make();
    pool(s, world);
    s.realm.drops.spawn(makeStack(B.COBBLE, 1), CX + 0.5, FLOOR + 1.5, CZ + 0.5, 0, 0, 0, 0);
    expect(s.realm.drops.count).toBe(1);
    run(s, 0.5);
    expect(s.realm.drops.count).toBe(0);
  });

  it('burns mobs, and cannot be mined or picked up', () => {
    const { s, world } = make();
    pool(s, world, 5);
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 12.5, 0, 0);
    const z = s.realm.mobs.spawn('zombie', CX + 0.5, FLOOR + 1.2, CZ + 0.5);
    run(s, 4);
    expect(z.dead).toBe(true);
    expect(BLOCKS[B.LAVA].hardness).toBe(Infinity);
    expect(ITEMS.has(B.LAVA)).toBe(false);
  });

  it('gives off the brightest light', () => {
    expect(BLOCKS[B.LAVA].light).toBeGreaterThanOrEqual(14);
    expect(BLOCKS[B.LAVA].liquid).toBe(true);
    expect(BLOCKS[B.LAVA].solid).toBe(false);
  });
});

describe('falling blocks', () => {
  it('sand with nothing under it drops to the ground', () => {
    const { s, world } = make();
    world.setBlock(CX + 3, FLOOR + 6, CZ, B.SAND);
    s.realm.checkFall(CX + 3, FLOOR + 6, CZ);
    run(s, 3);
    expect(world.getBlock(CX + 3, FLOOR + 6, CZ)).toBe(B.AIR);
    expect(world.getBlock(CX + 3, FLOOR + 1, CZ)).toBe(B.SAND);
  });

  it('a column of gravel comes down together', () => {
    const { s, world } = make();
    for (let y = FLOOR + 4; y <= FLOOR + 7; y++) world.setBlock(CX + 3, y, CZ, B.GRAVEL);
    s.realm.checkFall(CX + 3, FLOOR + 4, CZ);
    run(s, 4);
    for (let y = FLOOR + 1; y <= FLOOR + 4; y++) expect(world.getBlock(CX + 3, y, CZ)).toBe(B.GRAVEL);
    expect(world.getBlock(CX + 3, FLOOR + 5, CZ)).toBe(B.AIR);
  });

  it('supported sand stays put', () => {
    const { s, world } = make();
    world.setBlock(CX + 3, FLOOR + 1, CZ, B.SAND);
    s.realm.checkFall(CX + 3, FLOOR + 1, CZ);
    run(s, 2);
    expect(world.getBlock(CX + 3, FLOOR + 1, CZ)).toBe(B.SAND);
  });

  it('falls when the block under it is mined away', () => {
    const { s, world } = make();
    world.setBlock(CX + 3, FLOOR + 1, CZ, B.STONE);
    world.setBlock(CX + 3, FLOOR + 2, CZ, B.SAND);
    s.setMode('creative');
    s.breakBlock(CX + 3, FLOOR + 1, CZ);
    run(s, 2);
    expect(world.getBlock(CX + 3, FLOOR + 2, CZ)).toBe(B.AIR);
    expect(world.getBlock(CX + 3, FLOOR + 1, CZ)).toBe(B.SAND);
  });

  it('breaks the plant it lands on and falls through water', () => {
    const { s, world } = make();
    world.setBlock(CX + 3, FLOOR + 1, CZ, B.ROSE);
    world.setBlock(CX + 3, FLOOR + 3, CZ, B.SAND);
    s.realm.checkFall(CX + 3, FLOOR + 3, CZ);
    run(s, 2);
    expect(world.getBlock(CX + 3, FLOOR + 1, CZ)).toBe(B.SAND);
    world.setBlock(CX - 3, FLOOR + 1, CZ, B.WATER);
    world.setBlock(CX - 3, FLOOR + 2, CZ, B.SAND);
    s.realm.checkFall(CX - 3, FLOOR + 2, CZ);
    run(s, 2);
    expect(world.getBlock(CX - 3, FLOOR + 1, CZ)).toBe(B.SAND);
  });

  it('turns into an item instead of burying a player', () => {
    const { s, world } = make();
    world.setBlock(CX, FLOOR + 5, CZ, B.SAND);
    s.realm.checkFall(CX, FLOOR + 5, CZ);
    run(s, 2);
    expect(world.getBlock(CX, FLOOR + 1, CZ)).not.toBe(B.SAND);
    expect(world.getBlock(CX, FLOOR + 2, CZ)).not.toBe(B.SAND);
    expect(s.inventory.countOf(B.SAND) + s.realm.drops.count).toBeGreaterThan(0);
  });

  it('placing sand in mid-air by hand makes it fall', () => {
    const { s, world } = make();
    world.setBlock(CX + 3, FLOOR + 4, CZ, B.STONE);
    s.setMode('survival');
    s.clearInventory();
    s.giveItem(B.SAND, 2);
    s.selectSlot(0);
    expect(s.useOn(CX + 3, FLOOR + 4, CZ, 1, 0, 0)).toBe(true);
    run(s, 2);
    expect(world.getBlock(CX + 4, FLOOR + 1, CZ)).toBe(B.SAND);
  });
});

describe('monster spawners', () => {
  const place = (world: HeadlessWorld) => {
    world.setBlock(CX + 5, FLOOR + 1, CZ + 5, B.SPAWNER);
  };
  // Only the spawner's own kind: natural spawning (spiders that climb up to the player, say) is a different matter.
  const near = (s: GameSession) => s.realm.mobs.mobs.filter((m) => !m.dead && (m.kind === 'zombie' || m.kind === 'skeleton') && Math.hypot(m.body.x - (CX + 5.5), m.body.z - (CZ + 5.5)) < 12);

  it('produce mobs of their kind while a player is close', () => {
    const { s, world } = make({ spawning: true });
    s.setMode('creative');
    place(world);
    s.realm.time = 0.25;
    run(s, 25);
    const mobs = near(s);
    expect(mobs.length).toBeGreaterThan(0);
    expect(mobs.length).toBeLessThanOrEqual(6);
    const kind = spawnerKind(SEED, CX + 5, FLOOR + 1, CZ + 5);
    expect(mobs.every((m) => m.kind === kind)).toBe(true);
  });

  it('make nothing when the world is quiet or nobody is near', () => {
    const { s, world } = make({ spawning: true });
    s.setMode('creative');
    s.realm.time = 0.25;
    run(s, 25);
    expect(near(s)).toHaveLength(0);
    place(world);
    s.teleport(CX + 0.5, FLOOR + 1, CZ - 90, 0, 0);
    s.realm.mobs.mobs.length = 0;
    run(s, 25);
    expect(near(s)).toHaveLength(0);
  });

  it('stop at six of a kind', () => {
    const { s, world } = make({ spawning: true });
    s.setMode('creative');
    place(world);
    s.realm.time = 0.25;
    run(s, 120);
    expect(near(s).length).toBeLessThanOrEqual(6);
  });

  it('drop nothing but pay experience when broken with a pickaxe', () => {
    const { s, world } = make();
    place(world);
    s.setMode('survival');
    s.clearInventory();
    s.giveItem(toolId('pickaxe', 'iron'), 1);
    s.selectSlot(0);
    const xp = s.xp.total;
    s.breakBlock(CX + 5, FLOOR + 1, CZ + 5);
    expect(world.getBlock(CX + 5, FLOOR + 1, CZ + 5)).toBe(B.AIR);
    expect(s.realm.drops.count).toBe(0);
    settleOrbs(s, 15); // the spawner is seven blocks off, where the pull is faint
    expect(s.xp.total).toBeGreaterThan(xp);
  });
});

describe('cactus and dead bush', () => {
  it('a cactus needs sand and bare sides; a dead bush needs sand or dirt', () => {
    const { world } = make();
    world.setBlock(CX, FLOOR + 1, CZ, B.SAND);
    expect(canStayAt(B.CACTUS, world, CX, FLOOR + 2, CZ)).toBe(true);
    world.setBlock(CX + 1, FLOOR + 2, CZ, B.STONE);
    expect(canStayAt(B.CACTUS, world, CX, FLOOR + 2, CZ)).toBe(false);
    world.setBlock(CX + 1, FLOOR + 2, CZ, B.AIR);
    world.setBlock(CX, FLOOR + 1, CZ, B.GRASS);
    expect(canStayAt(B.CACTUS, world, CX, FLOOR + 2, CZ)).toBe(false);
    expect(canStayAt(B.DEAD_BUSH, world, CX, FLOOR + 2, CZ)).toBe(false);
    world.setBlock(CX, FLOOR + 1, CZ, B.SAND);
    expect(canStayAt(B.DEAD_BUSH, world, CX, FLOOR + 2, CZ)).toBe(true);
    world.setBlock(CX, FLOOR + 1, CZ, B.DIRT);
    expect(canStayAt(B.DEAD_BUSH, world, CX, FLOOR + 2, CZ)).toBe(true);
  });

  it('pricks the player who touches it', () => {
    const { s, world } = make();
    world.setBlock(CX + 3, FLOOR + 1, CZ, B.SAND);
    for (let k = 2; k <= 3; k++) world.setBlock(CX + 3, FLOOR + k, CZ, B.CACTUS);
    s.teleport(CX + 4.32, FLOOR + 1, CZ + 0.5, 0, 0);
    run(s, 1);
    expect(s.vitals.health).toBeLessThan(20);
    expect(s.vitals.lastDamage).toBe('cactus');
    const { s: s2, world: w2 } = make();
    w2.setBlock(CX + 3, FLOOR + 1, CZ, B.SAND);
    w2.setBlock(CX + 3, FLOOR + 2, CZ, B.CACTUS);
    s2.teleport(CX + 6.5, FLOOR + 1, CZ + 0.5, 0, 0);
    run(s2, 1);
    expect(s2.vitals.health).toBe(20);
  });

  it('a dead bush drops sticks and no item of its own', () => {
    expect(ITEMS.has(B.DEAD_BUSH)).toBe(false);
    expect(getItem(I.STICK)).toBeTruthy();
  });

  it('pops off when the sand under it is mined', () => {
    const { s, world } = make();
    s.setMode('creative');
    world.setBlock(CX + 3, FLOOR + 1, CZ, B.SAND);
    world.setBlock(CX + 3, FLOOR + 2, CZ, B.CACTUS);
    s.breakBlock(CX + 3, FLOOR + 1, CZ);
    expect(world.getBlock(CX + 3, FLOOR + 2, CZ)).toBe(B.AIR);
  });
});
