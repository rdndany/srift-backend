import { describe, expect, it } from 'vitest';
import { B, BB, BUBBLE_BLOOM, CHUNK_SIZE, CHUNK_VOLUME, CORAL_FAN_RED, CORAL_FAN_YELLOW, GameSession, HeadlessWorld, IS_SOLID, Realm, SEA_LEVEL, WorldGenerator, blockIndex, isChest, isWorldKind, makeGenerator, mulberry32, waterColor, type InputFrame } from './index';
import { IS_LIQUID } from './blocks';
import { MobManager } from './mobs';
import { IsleDirector, IsleWorldGenerator, ISLE_BEACH, ISLE_WRECK, floodIsleGaps, isleBlackMoon, isleCaveChest, isleDryAir, isleDryCave, isleFlock, isleMarks, isleRoll, parseIsleSave, raiseIsleKelp, thinIsleSea, unstackIsleBlooms, type IsleSim } from './isle';

const idle = (): InputFrame => ({ t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false });

const at = (gen: { generateChunk(cx: number, cz: number): Uint16Array }, x: number, y: number, z: number): number => {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cz = Math.floor(z / CHUNK_SIZE);
  return gen.generateChunk(cx, cz)[blockIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)];
};

describe('isle rules', () => {
  it('keeps two of the three animals, and the same pair for a seed', () => {
    const kinds = ['pig', 'chicken', 'sheep'];
    for (const seed of [0, 1, 2, 5, 9]) {
      const flock = isleFlock(seed);
      expect(flock).toHaveLength(2);
      expect(new Set(flock).size).toBe(2);
      expect(flock.every((k) => kinds.includes(k))).toBe(true);
      expect(isleFlock(seed)).toEqual(flock);
    }
    expect(new Set([0, 1, 2].map((s) => isleFlock(s).join()))).toHaveLength(3);
  });

  it('darkens the moon on the night that ends day 4, then every fourth night', () => {
    expect(isleBlackMoon(4, 0.496)).toBe(true);
    expect(isleBlackMoon(4, 0.49)).toBe(false);
    expect(isleBlackMoon(4, 0.75)).toBe(true);
    expect(isleBlackMoon(8, 0.6)).toBe(true);
    expect(isleBlackMoon(4, 0.99)).toBe(true);
    expect(isleBlackMoon(5, 0.002)).toBe(true);
    expect(isleBlackMoon(4, 0.3)).toBe(false);
    expect(isleBlackMoon(4, 0.002)).toBe(false);
    expect(isleBlackMoon(5, 0.02)).toBe(false);
    expect(isleBlackMoon(3, 0.75)).toBe(false);
    expect(isleBlackMoon(5, 0.75)).toBe(false);
  });

  it('rolls a quiet morning often, and never a second event on a black-moon day', () => {
    expect(isleRoll(1, false, false, null, () => 0)).toBe('crate');
    expect(isleRoll(1, false, false, null, () => 0.99)).toBeNull();
    expect(isleRoll(2, false, false, 'crate', () => 0)).toBeNull();
    expect(isleRoll(4, true, false, null, () => 0)).toBeNull();
    expect(isleRoll(5, false, false, 'crate', () => 0)).toBe('sharks');
    expect(isleRoll(6, true, true, 'sharks', () => 0)).toBe('crate');
  });

  it('reads a saved day and ignores a broken record', () => {
    const saved = parseIsleSave({ day: 6, last: 'crate', today: null, ready: true, map: false, prev: 0.2, ghost: [] });
    expect(saved?.day).toBe(6);
    expect(saved?.ready).toBe(true);
    expect(parseIsleSave({ day: 0, prev: 0.2 })).toBeNull();
    expect(parseIsleSave(null)).toBeNull();
    expect(parseIsleSave({ day: 3 })?.day).toBe(3);
  });
});

describe('the isle world', () => {
  const gen = makeGenerator(3, 'isle');

  it('is a grass island in a sloping ocean, with trees, plants and a wreck', () => {
    expect(isWorldKind('isle')).toBe(true);
    expect(gen.kind).toBe('isle');
    expect(makeGenerator(3).kind).toBe('overworld');
    expect(makeGenerator(3, 'square').kind).toBe('square');
    expect(at(gen, 0, SEA_LEVEL, 0)).toBe(B.GRASS);
    expect(at(gen, 0, SEA_LEVEL - 1, 0)).toBe(B.DIRT);
    expect(at(gen, 0, SEA_LEVEL - 4, 0)).toBe(B.SAND);
    expect(at(gen, 8, SEA_LEVEL, 0)).toBe(B.SAND);
    expect(at(gen, 8, SEA_LEVEL + 1, 0)).toBe(B.AIR);
    expect(at(gen, 24, SEA_LEVEL, 0)).toBe(B.WATER);
    expect(at(gen, 200, SEA_LEVEL, 200)).toBe(B.WATER);
    expect(at(gen, 200, 0, 200)).toBe(B.BEDROCK);
    const shore = gen.columnAt(14, 0).height;
    const deep = gen.columnAt(200, 0).height;
    expect(shore).toBeLessThan(SEA_LEVEL);
    expect(shore).toBeGreaterThan(deep);
    expect(deep).toBeLessThan(SEA_LEVEL - 6);
    expect(new Set([deep, gen.columnAt(40, 90).height, gen.columnAt(-70, 50).height]).size).toBeGreaterThan(1);
    expect(at(gen, 1, SEA_LEVEL + 1, 1)).toBe(B.LOG);
    expect(isChest(at(gen, ISLE_WRECK.x, ISLE_WRECK.y, ISLE_WRECK.z))).toBe(true);
    expect(gen.findSpawn()).toEqual({ x: 0.5, y: SEA_LEVEL + 1, z: 0.5 });
    expect(gen.columnAt(0, 0).height).toBe(SEA_LEVEL);
    expect(gen.columnAt(1000, 1000).height).toBeLessThan(SEA_LEVEL - 6);
    const over = makeGenerator(3);
    for (const [x, z] of [[40, 10], [-80, 30], [12, -40]] as const) {
      const sea = gen.columnAt(x, z);
      const there = over.columnAt(x, z);
      expect(sea.t).toBeCloseTo(there.t ?? 0, 5);
      expect(sea.h).toBeCloseTo(there.h ?? 0, 5);
      expect(waterColor(sea.t ?? Number.NaN).every((c) => Number.isFinite(c))).toBe(true);
    }
    let plants = 0;
    const home = gen.generateChunk(0, 0);
    for (let i = 0; i < home.length; i++) {
      const id = home[i]!;
      if (id === B.TALL_GRASS || id === B.FERN || id === B.DANDELION || id === B.ROSE || id === B.SUGAR_CANE) plants++;
    }
    expect(plants).toBeGreaterThan(8);
    const found = new Set<number>();
    for (const [cx, cz] of [[0, 0], [1, 0], [0, 1], [-1, -1]] as const) {
      const data = gen.generateChunk(cx, cz);
      for (let i = 0; i < data.length; i++) found.add(data[i]);
    }
    for (const id of [B.COAL_ORE, B.IRON_ORE, B.GOLD_ORE, B.DIAMOND_ORE, B.LAPIS_ORE, B.REDSTONE_ORE, B.DEEPSLATE]) {
      expect(found.has(id)).toBe(true);
    }
  });

  it('grows a different kelp forest, seagrass bed and coral reef for every seed', () => {
    const sea = new Set<number>([BB.kelp, BB.seagrass, BB.coral_fan_pink, BB.coral_fan_blue, CORAL_FAN_YELLOW, CORAL_FAN_RED]);
    const survey = (seed: number) => {
      const g = makeGenerator(seed, 'isle');
      const n = { kelp: 0, grass: 0, coral: 0, mark: 0, tallest: 0 };
      for (let cz = -3; cz <= 3; cz++) {
        for (let cx = -3; cx <= 3; cx++) {
          const data = g.generateChunk(cx, cz);
          const run = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
          for (let i = 0; i < data.length; i++) {
            const id = data[i]!;
            const col = i & 255;
            if (id === BB.kelp) {
              n.kelp++;
              run[col] = (run[col] ?? 0) + 1;
              if ((run[col] ?? 0) > n.tallest) n.tallest = run[col] ?? 0;
            } else {
              if (id === BB.seagrass) n.grass++;
              else if (sea.has(id)) n.coral++;
              run[col] = 0;
            }
            if (sea.has(id)) n.mark = (Math.imul(n.mark, 33) + id + i) >>> 0;
          }
        }
      }
      return n;
    };
    const a = survey(3);
    const b = survey(11);
    expect(a.kelp).toBeGreaterThan(40);
    expect(a.kelp).toBeLessThan(1600);
    expect(a.tallest).toBeGreaterThanOrEqual(6);
    expect(a.tallest).toBeLessThanOrEqual(12);
    expect(a.grass).toBeGreaterThan(20);
    expect(a.grass).toBeLessThan(300);
    expect(a.coral).toBeGreaterThan(8);
    expect(a.coral).toBeLessThan(200);
    expect(b.mark).not.toBe(a.mark);
    expect(at(gen, 24, SEA_LEVEL, 0)).toBe(B.WATER);
  });

  it('is a deep sea, different on every seed, with flooded caves, bubble plants and buried finds', () => {
    expect(gen.columnAt(200, 0).height).toBeLessThan(SEA_LEVEL - 24);
    const floors = (seed: number) => {
      const g = makeGenerator(seed, 'isle');
      return [g.columnAt(200, 0).height, g.columnAt(90, 70).height, g.columnAt(-110, 40).height].join(',');
    };
    expect(floors(3)).not.toBe(floors(11));
    const plants = new Set<number>([BB.kelp, BB.seagrass, BB.coral_fan_pink, BB.coral_fan_blue, CORAL_FAN_YELLOW, CORAL_FAN_RED, BUBBLE_BLOOM]);
    let water = 0;
    let bloom = 0;
    for (const [cx, cz] of [[5, 0], [6, -2], [-5, 4], [4, 5]] as const) {
      const data = gen.generateChunk(cx, cz);
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          let floor = 0;
          for (let y = SEA_LEVEL; y >= 1; y--) {
            const id = data[blockIndex(lx, y, lz)]!;
            if (id !== B.WATER && id !== B.AIR && !plants.has(id)) {
              floor = y;
              break;
            }
          }
          if (data[blockIndex(lx, floor + 1, lz)] === BUBBLE_BLOOM) bloom++;
          for (let y = 8; y < floor - 1; y++) {
            const id = data[blockIndex(lx, y, lz)]!;
            if (id === B.WATER) water++;
            else if (id === B.AIR) expect(isleDryAir(3, cx * CHUNK_SIZE + lx, y, cz * CHUNK_SIZE + lz)).toBe(true);
            else if (id === BUBBLE_BLOOM) bloom++;
          }
        }
      }
    }
    expect(water).toBeGreaterThan(20);
    expect(bloom).toBeGreaterThan(0);
    const marks = isleMarks(3);
    expect(isChest(at(gen, marks.wreck.x, marks.wreck.y, marks.wreck.z))).toBe(true);
    expect(isChest(at(gen, marks.hoard.x, marks.hoard.y, marks.hoard.z))).toBe(true);
    expect(gen.lootAt(marks.wreck.x, marks.wreck.y, marks.wreck.z)).toBe('ruin');
    expect(gen.lootAt(marks.hoard.x, marks.hoard.y, marks.hoard.z)).toBe('ruin');
    const other = isleMarks(11);
    expect(other.wreck.x !== marks.wreck.x || other.wreck.z !== marks.wreck.z).toBe(true);
    const underHome = at(gen, 0, 30, 0);
    expect(underHome).not.toBe(B.WATER);
    if (underHome === B.AIR) expect(isleDryAir(3, 0, 30, 0)).toBe(true);
  });

  it('cuts dry caves through the rock all around the sea, with ore, a cage and a chest', () => {
    let n = 0;
    const first: { gx: number; gz: number }[] = [];
    for (let gz = -8; gz <= 8; gz++) {
      for (let gx = -8; gx <= 8; gx++) {
        if (!isleDryCave(3, gx, gz)) continue;
        n++;
        if (first.length < 3) first.push({ gx, gz });
      }
    }
    expect(n).toBeGreaterThan(8);
    const other = isleDryCave(11, first[0]!.gx, first[0]!.gz);
    const here = isleDryCave(3, first[0]!.gx, first[0]!.gz)!;
    expect(other?.chest.x === here.chest.x && other?.chest.z === here.chest.z).toBe(false);
    const ores = new Set([B.COAL_ORE, B.IRON_ORE, B.GOLD_ORE, B.DIAMOND_ORE, B.LAPIS_ORE, B.REDSTONE_ORE]);
    for (const spot of first) {
      const cave = isleDryCave(3, spot.gx, spot.gz)!;
      expect(at(gen, cave.spawner.x, cave.spawner.y, cave.spawner.z)).toBe(B.SPAWNER);
      expect(at(gen, cave.spawner.x, cave.spawner.y + 1, cave.spawner.z)).toBe(B.AIR);
      expect(isChest(at(gen, cave.chest.x, cave.chest.y, cave.chest.z))).toBe(true);
      expect(gen.lootAt(cave.chest.x, cave.chest.y, cave.chest.z)).toBe('ruin');
      expect(isleCaveChest(3, cave.chest.x, cave.chest.y, cave.chest.z)).toBe(true);
      expect(ores.has(at(gen, cave.ores[0]!.x, cave.ores[0]!.y, cave.ores[0]!.z))).toBe(true);
      const chunks = new Map<string, Uint16Array>();
      const touch = (x: number, y: number, z: number): number => {
        const cx = Math.floor(x / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        const key = `${cx},${cz}`;
        let data = chunks.get(key);
        if (!data) {
          data = gen.generateChunk(cx, cz);
          chunks.set(key, data);
        }
        if (y < 0 || y >= data.length) return B.STONE;
        return data[blockIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)] ?? B.STONE;
      };
      let air = 0;
      for (const l of cave.lobes) {
        const x0 = Math.floor(l.x - l.rx);
        const x1 = Math.floor(l.x + l.rx);
        const y0 = Math.floor(l.y - l.ry);
        const y1 = Math.floor(l.y + l.ry);
        const z0 = Math.floor(l.z - l.rz);
        const z1 = Math.floor(l.z + l.rz);
        for (let y = y0; y <= y1; y++) {
          for (let z = z0; z <= z1; z++) {
            for (let x = x0; x <= x1; x++) {
              if (touch(x, y, z) !== B.AIR) continue;
              air++;
              for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
                expect(IS_LIQUID[touch(x + dx, y + dy, z + dz)] ?? 0).not.toBe(1);
              }
            }
          }
        }
      }
      expect(air).toBeGreaterThan(10);
      floodIsleGaps(chunks);
      let still = 0;
      for (const l of cave.lobes) {
        const x0 = Math.floor(l.x - l.rx);
        const x1 = Math.floor(l.x + l.rx);
        const y0 = Math.floor(l.y - l.ry);
        const y1 = Math.floor(l.y + l.ry);
        const z0 = Math.floor(l.z - l.rz);
        const z1 = Math.floor(l.z + l.rz);
        for (let y = y0; y <= y1; y++) {
          for (let z = z0; z <= z1; z++) {
            for (let x = x0; x <= x1; x++) if (touch(x, y, z) === B.AIR) still++;
          }
        }
      }
      expect(still).toBe(air);
    }
  });

  it('leaves an overworld chunk alone', () => {
    const a = new WorldGenerator(11);
    const b = makeGenerator(11, 'overworld');
    const ca = a.generateChunk(2, -3);
    const cb = b.generateChunk(2, -3);
    expect(cb.length).toBe(ca.length);
    let diff = 0;
    for (let i = 0; i < ca.length; i++) if (ca[i] !== cb[i]) diff++;
    expect(diff).toBe(0);
  });
});

describe('isle days and events', () => {
  function harness(rand: () => number = () => 0, seed = 3) {
    const gen = makeGenerator(seed, 'isle') as IsleWorldGenerator;
    const world = new HeadlessWorld(gen);
    const mobs: { kind: string; x: number; y: number; z: number }[] = [];
    const said: string[] = [];
    const sim: IsleSim = {
      seed,
      rand,
      getBlock: (x, y, z) => world.getBlock(x, y, z),
      setBlock: (x, y, z, id) => world.setBlock(x, y, z, id),
      spawn: (kind, x, y, z) => mobs.push({ kind, x, y, z }),
      count: (kind, x, z, r) => mobs.filter((m) => m.kind === kind && Math.hypot(m.x - x, m.z - z) <= r).length,
      clearDrowned: (x, z, r) => {
        for (let i = mobs.length - 1; i >= 0; i--) if (mobs[i].kind === 'drowned' && Math.hypot(mobs[i].x - x, mobs[i].z - z) <= r) mobs.splice(i, 1);
      },
      trim: (kind, x, z, r, keep) => {
        const hit = mobs
          .map((m, i) => ({ m, i }))
          .filter(({ m }) => m.kind === kind && Math.hypot(m.x - x, m.z - z) <= r)
          .sort((a, b) => Math.hypot(a.m.x - x, a.m.z - z) - Math.hypot(b.m.x - x, b.m.z - z));
        const drop = new Set(hit.slice(keep).map(({ i }) => i));
        for (let i = mobs.length - 1; i >= 0; i--) if (drop.has(i)) mobs.splice(i, 1);
      },
      say: (text) => said.push(text),
      noteChest: (x, y, z) => gen.noteChest(x, y, z),
      forgetChest: (x, y, z) => gen.forgetChest(x, y, z),
      chestRolled: () => false,
      discardChest: () => {},
      hasFish: () => false,
    };
    return { gen, world, mobs, said, director: new IsleDirector(sim) };
  }

  it('thins a crowd of pigs and chickens down to four of each', () => {
    const { mobs, director } = harness();
    for (let i = 0; i < 20; i++) mobs.push({ kind: 'pig', x: i * 0.2, y: 1, z: 0 });
    for (let i = 0; i < 15; i++) mobs.push({ kind: 'chicken', x: 0, y: 1, z: i * 0.2 });
    director.onClock(0.2);
    expect(mobs.filter((m) => m.kind === 'pig')).toHaveLength(4);
    expect(mobs.filter((m) => m.kind === 'chicken')).toHaveLength(4);
  });

  it('starts on the grass with animals and can wash a crate ashore', () => {
    const { world, mobs, said, director } = harness();
    director.onClock(0.2);
    expect(director.day).toBe(1);
    const flock = isleFlock(3);
    expect(flock.every((k) => mobs.some((m) => m.kind === k))).toBe(true);
    expect(mobs.filter((m) => flock.includes(m.kind as (typeof flock)[number]))).toHaveLength(2);
    expect(mobs.some((m) => m.kind === 'cod')).toBe(true);
    expect(isChest(world.getBlock(ISLE_BEACH[1]![0], SEA_LEVEL + 1, ISLE_BEACH[1]![1]))).toBe(true);
    expect(said[0]).toContain('crate');
    director.onClock(0.01);
    expect(director.day).toBe(1);
  });

  it('counts a sunrise and does not repeat the crate the next morning', () => {
    let n = 0;
    const { director } = harness(() => (n++ === 0 ? 0 : 0.99));
    director.onClock(0.2);
    director.onClock(0.95);
    director.onClock(0.05);
    expect(director.day).toBe(2);
    expect(director.line).toBeNull();
  });

  it('sends drowned onto the sand on the black moon', () => {
    const { mobs, said, director } = harness();
    director.restore({ day: 4, last: null, today: null, ready: false, map: false, prev: 0.4, ghost: [] }, 0.4);
    director.onClock(0.75);
    expect(director.blackMoon(0.75)).toBe(true);
    const n = mobs.filter((m) => m.kind === 'drowned').length;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(3);
    expect(said.some((s) => s.includes('black'))).toBe(true);
    director.onClock(0.8);
    expect(mobs.filter((m) => m.kind === 'drowned')).toHaveLength(n);
  });

  it('does not call another band of drowned when the island is opened again', () => {
    const save = { day: 5, last: 'crate' as const, today: 'sharks' as const, ready: false, map: false, prev: 0.3, ghost: [] };
    const first = harness(() => 0);
    first.director.restore(save, 0.3);
    first.director.onClock(0.3);
    const n = first.mobs.filter((m) => m.kind === 'drowned').length;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(3);
    const next = harness(() => 0);
    for (const m of first.mobs) if (m.kind === 'drowned') next.mobs.push({ ...m });
    next.director.restore(first.director.save(0.3), 0.3);
    next.director.onClock(0.3);
    expect(next.mobs.filter((m) => m.kind === 'drowned')).toHaveLength(n);
  });

  it('sends home the crowd a repeated visit had left waiting', () => {
    const { mobs, director } = harness(() => 0);
    for (let i = 0; i < 8; i++) mobs.push({ kind: 'drowned', x: 8, y: SEA_LEVEL + 1, z: i });
    director.restore({ day: 5, last: 'crate', today: 'sharks', ready: false, map: false, prev: 0.3, ghost: [] }, 0.3);
    director.onClock(0.3);
    expect(mobs.filter((m) => m.kind === 'drowned')).toHaveLength(0);
  });

  it('does not send drowned onto sand that has a torch', () => {
    const { world, mobs, director } = harness(() => 0);
    for (const [x, z] of ISLE_BEACH) world.setBlock(x + 1, SEA_LEVEL + 1, z, B.TORCH);
    director.restore({ day: 5, last: 'crate', today: 'sharks', ready: false, map: false, prev: 0.3, ghost: [] }, 0.3);
    director.onClock(0.3);
    expect(mobs.filter((m) => m.kind === 'drowned')).toHaveLength(0);
  });

  it('does not stand a drowned inside a chest or a log', () => {
    const { world, mobs, director } = harness(() => 0);
    for (const [x, z] of ISLE_BEACH) world.setBlock(x, SEA_LEVEL + 1, z, B.LOG);
    const [openX, openZ] = ISLE_BEACH[0];
    world.setBlock(openX, SEA_LEVEL + 1, openZ, B.AIR);
    director.restore({ day: 5, last: 'crate', today: 'sharks', ready: false, map: false, prev: 0.3, ghost: [] }, 0.3);
    director.onClock(0.3);
    const drowned = mobs.filter((m) => m.kind === 'drowned');
    expect(drowned).toHaveLength(1);
    expect(world.getBlock(Math.floor(drowned[0].x), SEA_LEVEL + 1, Math.floor(drowned[0].z))).toBe(B.AIR);
  });

  it('raises a ship at dusk and takes only its own blocks away at dawn', () => {
    const { world, said, director } = harness(() => 0.6);
    director.restore({ day: 8, last: 'crate', today: null, ready: true, map: true, prev: 0.9, ghost: [] }, 0.9);
    director.onClock(0.05);
    expect(director.day).toBe(9);
    expect(world.getBlock(-12, SEA_LEVEL, 9)).toBe(B.WATER);
    director.onClock(0.6);
    expect(world.getBlock(-12, SEA_LEVEL, 9)).toBe(B.PLANKS);
    expect(said.some((s) => s.includes('ship'))).toBe(true);
    world.setBlock(-12, SEA_LEVEL, 9, B.STONE);
    director.onClock(0.95);
    director.onClock(0.02);
    expect(director.day).toBe(10);
    expect(world.getBlock(-12, SEA_LEVEL, 9)).toBe(B.STONE);
    expect(world.getBlock(-11, SEA_LEVEL, 9)).toBe(B.WATER);
  });

  it('keeps the animals when the player is out in the ocean, and writes them into the save', () => {
    const gen = makeGenerator(4, 'isle');
    const world = new HeadlessWorld(gen);
    const s = new GameSession({ seed: 4, world, generator: gen, naturalSpawning: false, rand: mulberry32(1) });
    s.finishLoading();
    for (let i = 0; i < 40; i++) s.tick(idle());
    expect(s.mobs.mobs.some((m) => m.kind === 'pig')).toBe(true);
    s.body.x = 400;
    s.body.y = SEA_LEVEL + 2;
    s.body.z = 0;
    for (let i = 0; i < 40; i++) s.tick(idle());
    const pig = s.mobs.mobs.find((m) => m.kind === 'pig');
    expect(pig).toBeTruthy();
    expect(Math.hypot(pig!.body.x, pig!.body.z)).toBeLessThan(30);
    const saved = s.savePlayer().mobs as { kind: string }[];
    expect(saved.some((m) => m.kind === 'pig')).toBe(true);
  });

  it('stands a player on the island and remembers the day', () => {
    const gen = makeGenerator(4, 'isle');
    const world = new HeadlessWorld(gen);
    const s = new GameSession({ seed: 4, world, generator: gen, naturalSpawning: false, rand: mulberry32(1) });
    s.finishLoading();
    expect(s.body.y).toBeGreaterThan(SEA_LEVEL);
    for (let i = 0; i < 40; i++) s.tick(idle());
    expect(s.vitals.dead).toBe(false);
    expect(s.body.y).toBeGreaterThan(SEA_LEVEL);
    expect(s.cls).toBeNull();
    expect(s.inventory.totalItems()).toBe(0);
    expect(s.realm.isleInfo()?.day).toBe(1);
    const again = new Realm({ seed: 4, world, generator: gen, naturalSpawning: false, rand: mulberry32(2) });
    again.loadState(s.realm.saveState());
    expect(again.isleInfo()?.day).toBe(1);
  });

  it('keeps a later day on the character when the world record is behind', () => {
    const gen = makeGenerator(4, 'isle');
    const world = new HeadlessWorld(gen);
    const s = new GameSession({ seed: 4, world, generator: gen, naturalSpawning: false, rand: mulberry32(1) });
    s.finishLoading();
    for (let i = 0; i < 250; i++) s.realm.advanceClock(10);
    const day = s.realm.isleInfo()?.day ?? 0;
    expect(day).toBe(3);
    expect(s.savePlayer().dy).toBe(3);
    const state = s.saveWorldState();
    expect(parseIsleSave(state.isle)?.day).toBe(3);
    const again = new Realm({ seed: 4, world, generator: gen, naturalSpawning: false, rand: mulberry32(2) });
    again.loadState({ v: 1, time: state.time, weather: state.weather, blockEntities: state.blockEntities });
    expect(again.isleInfo()?.day).toBe(1);
    again.keepIsleDay(3);
    expect(again.isleInfo()?.day).toBe(3);
    again.keepIsleDay(1);
    expect(again.isleInfo()?.day).toBe(3);
  });

  it('writes no isle record for an overworld', () => {
    const gen = new WorldGenerator(1);
    const realm = new Realm({ seed: 1, world: new HeadlessWorld(gen), generator: gen, naturalSpawning: false, rand: mulberry32(1) });
    realm.advanceClock(1);
    expect(realm.isleInfo()).toBeNull();
    expect(realm.saveState().isle).toBeUndefined();
  });

  it('never stacks two bubble blooms in one column', () => {
    const gen = makeGenerator(3, 'isle');
    for (const [cx, cz] of [[5, 0], [6, -2], [-5, 4], [4, 5]] as const) {
      const data = gen.generateChunk(cx, cz);
      for (let y = 2; y < SEA_LEVEL; y++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            if (data[blockIndex(lx, y, lz)] !== BUBBLE_BLOOM) continue;
            const under = data[blockIndex(lx, y - 1, lz)]!;
            expect(under).not.toBe(BUBBLE_BLOOM);
            expect(IS_SOLID[under]).toBe(1);
          }
        }
      }
    }
  });

  it('keeps the lower bloom when a saved column has two', () => {
    const data = new Uint16Array(CHUNK_VOLUME);
    data.fill(B.STONE);
    data[blockIndex(3, 12, 3)] = BUBBLE_BLOOM;
    data[blockIndex(3, 13, 3)] = BUBBLE_BLOOM;
    data[blockIndex(3, 14, 3)] = BUBBLE_BLOOM;
    expect(unstackIsleBlooms(new Map([['1,1', data]]))).toEqual(['1,1']);
    expect(data[blockIndex(3, 12, 3)]).toBe(BUBBLE_BLOOM);
    expect(data[blockIndex(3, 13, 3)]).toBe(B.WATER);
    expect(data[blockIndex(3, 14, 3)]).toBe(B.WATER);
  });

  it('fills saved air that touches the sea and leaves a sealed room dry', () => {
    const data = new Uint16Array(CHUNK_VOLUME);
    data.fill(B.STONE);
    for (let y = 8; y <= 14; y++) data[blockIndex(4, y, 4)] = B.WATER;
    data[blockIndex(5, 10, 4)] = B.AIR;
    data[blockIndex(5, 11, 4)] = B.AIR;
    data[blockIndex(6, 11, 4)] = B.AIR;
    data[blockIndex(8, 10, 8)] = B.AIR;
    const changed = floodIsleGaps(new Map([['2,3', data]]));
    expect(changed).toEqual(['2,3']);
    expect(data[blockIndex(5, 10, 4)]).toBe(B.WATER);
    expect(data[blockIndex(5, 11, 4)]).toBe(B.WATER);
    expect(data[blockIndex(6, 11, 4)]).toBe(B.WATER);
    expect(data[blockIndex(8, 10, 8)]).toBe(B.AIR);
    expect(data[blockIndex(4, 20, 4)]).toBe(B.STONE);
  });

  it('cuts a saved kelp forest back to short stalks, and a second pass changes nothing', () => {
    const gen = makeGenerator(3, 'isle');
    const data = gen.generateChunk(4, 0);
    let planted = false;
    for (let lz = 0; lz < CHUNK_SIZE && !planted; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE && !planted; lx++) {
        let floor = -1;
        for (let y = SEA_LEVEL; y >= 1; y--) {
          const id = data[blockIndex(lx, y, lz)]!;
          if (id === B.SAND || id === B.GRAVEL || id === B.CLAY || id === B.SANDSTONE) {
            floor = y;
            break;
          }
        }
        if (floor < 1 || SEA_LEVEL - floor < 10) continue;
        if (data[blockIndex(lx, floor + 1, lz)] === BB.kelp) continue;
        for (let k = 1; k <= 8 && floor + k < SEA_LEVEL; k++) data[blockIndex(lx, floor + k, lz)] = BB.kelp;
        planted = true;
      }
    }
    expect(planted).toBe(true);
    const chunks = new Map([['4,0', data]]);
    expect(thinIsleSea(3, chunks)).toEqual(['4,0']);
    let tallest = 0;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        let run = 0;
        for (let y = 1; y <= SEA_LEVEL; y++) if (data[blockIndex(lx, y, lz)] === BB.kelp) run++;
        if (run > tallest) tallest = run;
      }
    }
    expect(tallest).toBeLessThanOrEqual(12);
    expect(thinIsleSea(3, chunks)).toEqual([]);
  });

  it('grows a short saved stalk up toward the surface, once', () => {
    const gen = makeGenerator(3, 'isle');
    let data: Uint16Array | null = null;
    let key = '';
    let floor = -1;
    let lx = 0;
    let lz = 0;
    for (let cz = -3; cz <= 3 && floor < 0; cz++) {
      for (let cx = -3; cx <= 3 && floor < 0; cx++) {
        const chunk = gen.generateChunk(cx, cz);
        for (let z = 0; z < CHUNK_SIZE && floor < 0; z++) {
          for (let x = 0; x < CHUNK_SIZE && floor < 0; x++) {
            let base = -1;
            let run = 0;
            for (let y = 1; y < SEA_LEVEL; y++) {
              if (chunk[blockIndex(x, y, z)] === BB.kelp) {
                if (base < 0) base = y - 1;
                run++;
              }
            }
            if (run < 6 || base < 1) continue;
            floor = base;
            lx = x;
            lz = z;
            data = chunk;
            key = `${cx},${cz}`;
            for (let y = base + 3; y < SEA_LEVEL; y++) if (chunk[blockIndex(x, y, z)] === BB.kelp) chunk[blockIndex(x, y, z)] = B.WATER;
          }
        }
      }
    }
    expect(data).not.toBeNull();
    const chunks = new Map([[key, data!]]);
    expect(raiseIsleKelp(3, chunks)).toEqual([key]);
    let run = 0;
    for (let y = floor + 1; y < SEA_LEVEL; y++) if (data![blockIndex(lx, y, lz)] === BB.kelp) run++;
    expect(run).toBeGreaterThanOrEqual(6);
    expect(data![blockIndex(lx, SEA_LEVEL, lz)]).not.toBe(BB.kelp);
    expect(raiseIsleKelp(3, chunks)).toEqual([]);
  });

  it('land animals climb out of the real shore, including a corner', () => {
    const world = new HeadlessWorld(makeGenerator(3, 'isle'));
    const spots: { x: number; z: number }[] = [];
    for (let x = -14; x <= 14 && spots.length < 6; x++) {
      for (let z = -14; z <= 14 && spots.length < 6; z++) {
        if (IS_LIQUID[world.getBlock(x, SEA_LEVEL, z)] !== 1) continue;
        const land = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => {
          const id = world.getBlock(x + dx, SEA_LEVEL, z + dz);
          return IS_SOLID[id] === 1 && IS_LIQUID[id] !== 1;
        });
        if (land) spots.push({ x, z });
      }
    }
    expect(spots.length).toBeGreaterThan(0);
    const mgr = new MobManager(mulberry32(1));
    const kinds = ['pig', 'chicken', 'fox', 'rabbit', 'cat'] as const;
    const mobs = kinds.map((kind, i) => {
      const s = spots[i % spots.length];
      return mgr.spawn(kind, s.x + 0.5, SEA_LEVEL + 0.1, s.z + 0.5);
    });
    const player = { x: 0.5, y: SEA_LEVEL + 1, z: 0.5, alive: true, invulnerable: true };
    const env = { world, player, daylight: 1, rand: mulberry32(2), keepAnimals: true };
    const events = { hurtPlayer: () => undefined, explode: () => undefined, sound: () => undefined, drop: () => undefined };
    for (let t = 0; t < 12; t += 1 / 30) mgr.update(1 / 30, env, events);
    const stuck = mobs
      .filter((m) => m.body.inWater || m.body.y < SEA_LEVEL + 1)
      .map((m) => `${m.kind}@${m.body.x.toFixed(2)},${m.body.y.toFixed(2)},${m.body.z.toFixed(2)}`);
    expect(stuck).toEqual([]);
  });

  it('points the morning map at the chest under the sand', () => {
    const { said, director } = harness(() => 0.6);
    const marks = isleMarks(3);
    director.restore({ day: 5, last: 'crate', today: null, ready: true, map: false, prev: 0.9, ghost: [] }, 0.9);
    director.onClock(0.05);
    expect(director.day).toBe(6);
    expect(said.some((s) => s.includes(`${marks.hoard.x}, ${marks.hoard.z}`) && s.includes('sand'))).toBe(true);
  });
});
