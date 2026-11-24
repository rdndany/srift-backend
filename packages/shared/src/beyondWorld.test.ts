import { describe, expect, it, vi } from 'vitest';
import {
  ADVENTURE_SEED,
  B,
  BB,
  BEYOND_BIOMES,
  BLOCKS,
  BeyondWorldGenerator,
  CHUNK_SIZE,
  GameSession,
  HeadlessWorld,
  MobManager,
  MobSpawner,
  SEA_LEVEL,
  SIGNATURE,
  STRUCTURES,
  WORLD_HEIGHT,
  blockIndex,
  isWorldKind,
  makeGenerator,
  mulberry32,
  placeNameAt,
  type BlockReader,
  type InputFrame,
  type MobKind,
  type StructureKey,
} from './index';

vi.setConfig({ testTimeout: 90_000 });

const idle = (): InputFrame => ({ t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false });

const gen = new BeyondWorldGenerator(1);

/** A grid of columns across a square of the world. */
function scan(g: BeyondWorldGenerator, half: number, step: number) {
  const out: { x: number; z: number; sub: number; h: number; t: number; hum: number }[] = [];
  for (let z = -half; z <= half; z += step) {
    for (let x = -half; x <= half; x += step) {
      const c = g.columnAt(x, z);
      out.push({ x, z, sub: c.sub ?? 0, h: c.height, t: c.t ?? 0, hum: c.h ?? 0 });
    }
  }
  return out;
}

const SAMPLE = scan(gen, 6000, 100);
const kindOf = (sub: number) => BEYOND_BIOMES[sub].kind;
const familyOf = (sub: number) => BEYOND_BIOMES[sub].family;

describe('the World Beyond is a world kind', () => {
  it('is known by name, made by makeGenerator, and does not change the others', () => {
    expect(isWorldKind('beyond')).toBe(true);
    const g = makeGenerator(9, 'beyond');
    expect(g).toBeInstanceOf(BeyondWorldGenerator);
    expect(g.kind).toBe('beyond');
    expect(makeGenerator(9).kind).toBe('overworld');
    expect(makeGenerator(ADVENTURE_SEED, 'adventure').kind).toBe('adventure');
  });

  it('leaves the other worlds exactly as they were, however much of the Beyond has been generated', () => {
    const adv = makeGenerator(ADVENTURE_SEED, 'adventure');
    const over = makeGenerator(1337);
    const before = [[0, 0], [3, -2], [-5, 7]].map(([cx, cz]) => [adv.generateChunk(cx, cz), over.generateChunk(cx, cz)]);
    const beyond = new BeyondWorldGenerator(ADVENTURE_SEED);
    for (let i = -4; i < 4; i++) beyond.generateChunk(i, i * 2);
    const after = [[0, 0], [3, -2], [-5, 7]].map(([cx, cz]) => [makeGenerator(ADVENTURE_SEED, 'adventure').generateChunk(cx, cz), makeGenerator(1337).generateChunk(cx, cz)]);
    for (let i = 0; i < before.length; i++) {
      expect([...after[i][0]]).toEqual([...before[i][0]]);
      expect([...after[i][1]]).toEqual([...before[i][1]]);
    }
    // The overworld has no detailed biomes: they belong to the Beyond alone.
    expect(over.columnAt(100, 100).sub).toBeUndefined();
    expect(over.wildlifeAt(0, 0)).toBeNull();
  });
});

describe('determinism', () => {
  it('makes the same chunk for the same seed, in any order, and a different one for another seed', () => {
    const cells = [[0, 0], [12, -9], [-31, 40], [104, 7]];
    const a = new BeyondWorldGenerator(5);
    const forward = cells.map(([cx, cz]) => a.generateChunk(cx, cz));
    const b = new BeyondWorldGenerator(5);
    const backward = [...cells].reverse().map(([cx, cz]) => b.generateChunk(cx, cz)).reverse();
    for (let i = 0; i < cells.length; i++) expect([...backward[i]]).toEqual([...forward[i]]);
    const c = new BeyondWorldGenerator(6);
    expect([...c.generateChunk(12, -9)]).not.toEqual([...forward[1]]);
  });

  it('gives the same columns and biomes from a fresh generator (client, server and tests agree)', () => {
    const fresh = new BeyondWorldGenerator(1);
    for (let i = 0; i < 400; i++) {
      const x = Math.floor((i * 7919) % 9000) - 4500;
      const z = Math.floor((i * 104729) % 9000) - 4500;
      expect(fresh.columnAt(x, z)).toEqual(gen.columnAt(x, z));
    }
  });

  it('finds a spawn on dry land, the same every time', () => {
    const s = gen.findSpawn();
    expect(s).toEqual(new BeyondWorldGenerator(1).findSpawn());
    expect(gen.columnAt(Math.floor(s.x), Math.floor(s.z)).height).toBeGreaterThan(SEA_LEVEL);
  });
});

describe('biome distribution', () => {
  const counts = new Map<number, number>();
  for (const c of SAMPLE) counts.set(c.sub, (counts.get(c.sub) ?? 0) + 1);

  it('shows a rich spread: many biomes within a few kilometres', () => {
    expect(counts.size).toBeGreaterThanOrEqual(85);
    for (const id of counts.keys()) expect(BEYOND_BIOMES[id], `biome ${id}`).toBeDefined();
  });

  it('keeps rarity honest: common biomes cover most of the land, rare ones little, legendary ones the least', () => {
    const share = (r: string) => [...counts].filter(([id]) => BEYOND_BIOMES[id].rarity === r).reduce((n, [, c]) => n + c, 0) / SAMPLE.length;
    expect(share('common')).toBeGreaterThan(share('uncommon'));
    expect(share('uncommon')).toBeGreaterThan(share('rare'));
    expect(share('rare')).toBeLessThan(0.12);
    expect(share('very_rare')).toBeLessThan(0.1);
    expect(share('legendary')).toBeLessThan(0.15);
    expect(share('common')).toBeGreaterThan(0.45);
  });

  it('reaches every surface biome somewhere in the world (the cave biomes are the cave ecosystems)', () => {
    const missing = new Set(BEYOND_BIOMES.filter(Boolean).filter((b) => b.kind !== 'cave' && b.kind !== 'signature').map((b) => b.id));
    const wide = new BeyondWorldGenerator(2);
    for (const c of SAMPLE) missing.delete(c.sub);
    for (let z = -16000; missing.size > 0 && z <= 16000; z += 160) for (let x = -16000; x <= 16000; x += 160) missing.delete(wide.columnAt(x, z).sub ?? 0);
    for (const c of SAMPLE) missing.delete(c.sub);
    expect([...missing].map((id) => BEYOND_BIOMES[id].key)).toEqual([]);
  });

  it('puts the legacy biome of every column in the old tables, so villages, mobs and the map still work', () => {
    for (const c of SAMPLE.slice(0, 2000)) {
      const col = gen.columnAt(c.x, c.z);
      expect(col.biome).toBe(BEYOND_BIOMES[c.sub].legacy);
    }
  });
});

describe('climate and geography make sense', () => {
  const land = SAMPLE.filter((c) => kindOf(c.sub) !== 'ocean' && familyOf(c.sub) !== 'signature');

  it('keeps the cold biomes cold, the deserts dry and hot, the tropics warm and wet', () => {
    for (const c of land) {
      const f = familyOf(c.sub);
      if (f === 'cold' && kindOf(c.sub) === 'land') expect(c.t, BEYOND_BIOMES[c.sub].key).toBeLessThan(0.4);
      if (f === 'desert' && kindOf(c.sub) === 'land') {
        expect(c.hum, BEYOND_BIOMES[c.sub].key).toBeLessThan(0.5);
        expect(c.t, BEYOND_BIOMES[c.sub].key).toBeGreaterThan(0.35);
      }
      if (f === 'tropical') expect(c.t, BEYOND_BIOMES[c.sub].key).toBeGreaterThan(0.5);
      if (f === 'wetland') expect(c.hum, BEYOND_BIOMES[c.sub].key).toBeGreaterThan(0.5);
    }
  });

  it('has deserts, snow, forests and wetlands in the numbers a planet would', () => {
    const share = (f: string) => land.filter((c) => familyOf(c.sub) === f).length / land.length;
    for (const f of ['plains', 'forest', 'desert', 'mountain', 'cold', 'tropical', 'wetland']) expect(share(f), f).toBeGreaterThan(0.02);
    expect(share('plains') + share('forest')).toBeGreaterThan(0.25);
  });

  it('puts the oceans under the sea and the land above it', () => {
    const oceans = SAMPLE.filter((c) => kindOf(c.sub) === 'ocean');
    expect(oceans.length).toBeGreaterThan(SAMPLE.length * 0.15);
    expect(oceans.filter((c) => c.h >= SEA_LEVEL).length / oceans.length).toBeLessThan(0.05);
    const dry = SAMPLE.filter((c) => kindOf(c.sub) === 'land');
    expect(dry.filter((c) => c.h < SEA_LEVEL).length / dry.length).toBeLessThan(0.1);
  });

  it('has mountains that stand high and valleys that lie low', () => {
    const peaks = land.filter((c) => familyOf(c.sub) === 'mountain');
    const plains = land.filter((c) => familyOf(c.sub) === 'plains');
    const avg = (a: { h: number }[]) => a.reduce((n, c) => n + c.h, 0) / a.length;
    expect(avg(peaks)).toBeGreaterThan(avg(plains) + 20);
    expect(Math.max(...peaks.map((c) => c.h))).toBeGreaterThan(150);
    expect(Math.max(...SAMPLE.map((c) => c.h))).toBeLessThan(WORLD_HEIGHT - 20);
  });

  it('has rivers and lakes that sit in the low ground and reach the sea', () => {
    const fresh = SAMPLE.filter((c) => familyOf(c.sub) === 'fresh');
    expect(fresh.length).toBeGreaterThan(50);
    expect(new Set(fresh.map((c) => c.sub)).size).toBeGreaterThanOrEqual(6);
    // The same river runs for a good stretch: walk a river column's neighbours along the grid.
    const rivers = BEYOND_BIOMES.filter((b) => b && b.kind === 'river').map((b) => b.id);
    const col = SAMPLE.find((c) => rivers.includes(c.sub));
    expect(col).toBeDefined();
    let length = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let k = 1; k <= 20; k++) {
        const c = gen.columnAt(col!.x + dx * k * 8, col!.z + dz * k * 8);
        if (c.sub !== undefined && BEYOND_BIOMES[c.sub].family === 'fresh') length = Math.max(length, k * 8);
      }
    }
    expect(length).toBeGreaterThan(0);
  });

  it('changes slowly: the ground never jumps from one column to the next, and climates blend', () => {
    let steep = 0;
    let cliff = 0;
    let n = 0;
    let clash = 0;
    for (let z = -3000; z < 3000; z += 211) {
      let prev = gen.columnAt(-3000, z);
      for (let x = -2999; x < 3000; x += 3) {
        const c = gen.columnAt(x, z);
        n++;
        if (Math.abs(c.height - prev.height) > 6) steep++;
        if (Math.abs(c.height - prev.height) > 24) cliff++;
        const a = BEYOND_BIOMES[prev.sub ?? 1].family;
        const b = BEYOND_BIOMES[c.sub ?? 1].family;
        // A desert never touches snow: something sits between them.
        if ((a === 'desert' && b === 'cold') || (a === 'cold' && b === 'desert')) clash++;
        prev = c;
      }
    }
    // (Mountains are steep, slopes of two blocks to a block happen; sheer walls of 24 do not.)
    expect(steep / n).toBeLessThan(0.06);
    expect(cliff / n).toBeLessThan(0.002);
    expect(clash).toBe(0);
  });
});

describe('the signature realms', () => {
  it('sit far from the start and appear across the world: all ten are found over a few seeds', () => {
    const found = new Set<number>();
    for (const seed of [1, 2, 3, 4]) {
      const g = new BeyondWorldGenerator(seed);
      for (const s of g.land.realms.nearby(0, 0, 14)) {
        found.add(s.id);
        expect(Math.hypot(s.cx, s.cz)).toBeGreaterThan(1100);
        // (a realm's rim may come near the start, but the first spawn is never inside one)
        expect(g.land.realms.at(g.findSpawn().x, g.findSpawn().z)).toBeNull();
      }
    }
    expect([...found].sort()).toEqual(Object.values(SIGNATURE).sort());
  });

  it('has a realm column carry the realm biome, and a legacy biome the old systems understand', () => {
    const g = new BeyondWorldGenerator(3);
    const sites = g.land.realms.nearby(0, 0, 8);
    expect(sites.length).toBeGreaterThan(3);
    for (const s of sites) {
      const c = g.columnAt(Math.floor(s.cx), Math.floor(s.cz));
      expect(c.sub).toBe(s.id);
      expect(g.biomeAt(Math.floor(s.cx), Math.floor(s.cz)).family).toBe('signature');
    }
  });

  it('builds its great features: the sky islands, the volcano, the Great Tree', () => {
    const g = new BeyondWorldGenerator(3);
    const at = (id: number) => g.land.realms.nearest(id, 0, 0, 14)!;
    const highest = (cx: number, cz: number, half: number, minY: number): number => {
      let n = 0;
      for (let z = cz - half; z <= cz + half; z += CHUNK_SIZE) {
        for (let x = cx - half; x <= cx + half; x += CHUNK_SIZE) {
          const ch = g.generateChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
          for (let y = minY; y < WORLD_HEIGHT; y++) for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) if (ch[y * CHUNK_SIZE * CHUNK_SIZE + i] !== B.AIR) n++;
        }
      }
      return n;
    };
    const sky = at(SIGNATURE.SKY_ISLANDS);
    expect(highest(sky.cx, sky.cz, 160, 118)).toBeGreaterThan(2000);
    const volcano = at(SIGNATURE.ASHEN_KINGDOM);
    expect(highest(volcano.cx, volcano.cz, 40, 120)).toBeGreaterThan(500);
    const tree = at(SIGNATURE.WORLDROOT);
    const ch = g.generateChunk(Math.floor(tree.cx / CHUNK_SIZE), Math.floor(tree.cz / CHUNK_SIZE));
    let logs = 0;
    for (const id of ch) if (id === BB.worldroot_log) logs++;
    expect(logs).toBeGreaterThan(300);
  });
});

describe('the underground', () => {
  it('has air at every depth band, so the layers below the surface are open to explore', () => {
    const bands = [[8, 24], [24, 40], [40, 56]];
    const air = bands.map(() => 0);
    for (const [cx, cz] of [[0, 0], [9, 3], [-12, 5], [20, -17], [-3, -25], [31, 31]]) {
      const ch = gen.generateChunk(cx, cz);
      bands.forEach(([lo, hi], b) => {
        for (let y = lo; y < hi; y++) for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) if (ch[y * CHUNK_SIZE * CHUNK_SIZE + i] === B.AIR) air[b]++;
      });
    }
    for (const n of air) expect(n).toBeGreaterThan(200);
  });

  it('has cave ecosystems of every kind, deterministic, and flooded ones low down', () => {
    const seen = new Set<string>();
    for (let z = -400; z <= 400; z += 16) for (let x = -400; x <= 400; x += 16) for (const y of [14, 22, 30, 38, 46]) seen.add(gen.caveEcoAt(x, y, z));
    for (const eco of ['glow', 'crystal', 'ancient', 'bone', 'flooded']) expect(seen.has(eco), eco).toBe(true);
    expect(gen.caveEcoAt(77, 30, 91)).toBe(new BeyondWorldGenerator(1).caveEcoAt(77, 30, 91));
    expect(gen.caveEcoAt(77, 90, 91)).not.toBe('flooded');
  });

  it('has its own ores', () => {
    let found = 0;
    for (let cx = -6; cx < 6; cx++) {
      const ch = gen.generateChunk(cx, cx * 3);
      for (const id of ch) if (id === BB.malachite || id === BB.azurite || id === BB.cinnabar_ore || id === BB.sulfur_ore || id === BB.jade || id === BB.crystal_ore) found++;
    }
    expect(found).toBeGreaterThan(10);
  });
});

describe('the surface is dressed by its biome', () => {
  it('grows trees in forests, bare ground in deserts, and the soil of the biome under them', () => {
    const woods = SAMPLE.filter((c) => familyOf(c.sub) === 'forest' && kindOf(c.sub) === 'land' && c.h > SEA_LEVEL + 2).slice(0, 12);
    const sands = SAMPLE.filter((c) => familyOf(c.sub) === 'desert' && kindOf(c.sub) === 'land').slice(0, 12);
    expect(woods.length).toBeGreaterThan(3);
    expect(sands.length).toBeGreaterThan(3);
    const wood = (ids: Set<number>) => (id: number) => ids.has(id);
    const isLog = wood(new Set([...Object.entries(BB).filter(([k]) => k.endsWith('_log')).map(([, v]) => v), ...Object.entries(B).filter(([k]) => k === 'LOG' || k.endsWith('_LOG')).map(([, v]) => v as number)]));
    const logsIn = (cells: { x: number; z: number }[]) => {
      let n = 0;
      for (const c of cells) for (const id of gen.generateChunk(Math.floor(c.x / CHUNK_SIZE), Math.floor(c.z / CHUNK_SIZE))) if (isLog(id)) n++;
      return n;
    };
    expect(logsIn(woods)).toBeGreaterThan(40);
    expect(logsIn(woods)).toBeGreaterThan(logsIn(sands) * 3);
  });

  it('puts snow on the cold ground and not on the hot', () => {
    const snow = (c: { x: number; z: number }) => {
      const ch = gen.generateChunk(Math.floor(c.x / CHUNK_SIZE), Math.floor(c.z / CHUNK_SIZE));
      let n = 0;
      for (const id of ch) if (id === B.SNOW_BLOCK || id === B.SNOW || id === BB.snow_turf) n++;
      return n;
    };
    const cold = SAMPLE.filter((c) => familyOf(c.sub) === 'cold' && kindOf(c.sub) === 'land').slice(0, 8);
    const hot = SAMPLE.filter((c) => (familyOf(c.sub) === 'desert' || familyOf(c.sub) === 'tropical') && kindOf(c.sub) === 'land').slice(0, 8);
    expect(cold.reduce((n, c) => n + snow(c), 0)).toBeGreaterThan(hot.reduce((n, c) => n + snow(c), 0) * 4 + 50);
  });

  it('names the place under the player by its biome, and the cave by its kind', () => {
    const c = SAMPLE.find((s) => kindOf(s.sub) === 'land' && s.h > SEA_LEVEL + 3 && gen.nearestVillage(s.x, s.z) === null)!;
    const biome = BEYOND_BIOMES[c.sub];
    expect(placeNameAt(gen, c.x, c.h + 2, c.z)).toBe(biome.name);
    const over = makeGenerator(1337);
    expect(placeNameAt(over, 100, 80, 100)).not.toBe(biome.name);
  });
});

describe('the ancient places', () => {
  const places = gen.places.near(0, 0, 4500);

  it('are laid out by rarity: many common, few legendary, none on top of the start', () => {
    const n = (r: string) => places.filter((p) => p.info.rarity === r).length;
    expect(n('common')).toBeGreaterThan(n('uncommon'));
    expect(n('uncommon')).toBeGreaterThan(n('rare'));
    expect(n('rare')).toBeGreaterThan(n('very_rare'));
    expect(n('very_rare')).toBeGreaterThan(0);
    expect(places.filter((p) => Math.hypot(p.x, p.z) < 70 && p.info.radius > 8)).toEqual([]);
    expect(new Set(places.map((p) => p.key)).size).toBeGreaterThanOrEqual(28);
  });

  it('stand on ground that suits them: land on land, wrecks and reefs on the sea floor', () => {
    for (const p of places.slice(0, 600)) {
      const info = STRUCTURES[p.key];
      const h = gen.columnAt(p.x, p.z).height;
      if (info.site === 'sea') expect(h, p.key).toBeLessThan(SEA_LEVEL - 2);
      else expect(h, p.key).toBeGreaterThan(SEA_LEVEL - 1);
    }
  });

  it('are drawn the same whatever chunk reaches them first: a fortress crossing chunks agrees', () => {
    const fort = places.find((p) => p.key === 'ruined_fortress' || p.key === 'mountain_hold' || p.key === 'abandoned_village')!;
    expect(fort).toBeDefined();
    const cx0 = Math.floor((fort.x - 24) / CHUNK_SIZE);
    const cx1 = Math.floor((fort.x + 24) / CHUNK_SIZE);
    const cz0 = Math.floor((fort.z - 24) / CHUNK_SIZE);
    const cz1 = Math.floor((fort.z + 24) / CHUNK_SIZE);
    const cells: [number, number][] = [];
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) cells.push([cx, cz]);
    const a = new BeyondWorldGenerator(1);
    const first = new Map(cells.map(([cx, cz]) => [`${cx},${cz}`, a.generateChunk(cx, cz)]));
    const b = new BeyondWorldGenerator(1);
    for (const [cx, cz] of [...cells].reverse()) expect([...b.generateChunk(cx, cz)], `${cx},${cz}`).toEqual([...first.get(`${cx},${cz}`)!]);
    // And it is there: made of its own stone, not the land's.
    let built = 0;
    for (const ch of first.values()) for (const id of ch) if (BLOCKS[id]?.name && /brick|marble|limestone|obsidian|planks/i.test(BLOCKS[id].name)) built++;
    expect(built).toBeGreaterThan(150);
  });

  it('keep their treasure in chests the loot lookup knows', () => {
    let checked = 0;
    for (const p of places.filter((q) => ['crypt', 'jungle_temple', 'desert_temple', 'ruined_fortress', 'mountain_hold', 'ancient_library', 'abandoned_village'].includes(q.key)).slice(0, 12)) {
      const r = p.info.radius + 8;
      for (let cz = Math.floor((p.z - r) / CHUNK_SIZE); cz <= Math.floor((p.z + r) / CHUNK_SIZE); cz++) {
        for (let cx = Math.floor((p.x - r) / CHUNK_SIZE); cx <= Math.floor((p.x + r) / CHUNK_SIZE); cx++) gen.generateChunk(cx, cz);
      }
      gen.places.lootAt(p.x, p.y, p.z);
      for (const [key, table] of p.chests) {
        const [x, y, z] = key.match(/-?\d+/g)!.map(Number);
        expect(gen.lootAt(x, y, z)).toBe(table);
        const cx = Math.floor(x / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        const id = gen.generateChunk(cx, cz)[blockIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)];
        expect(BLOCKS[id]?.name.toLowerCase(), `${p.key} chest at ${x},${y},${z}`).toContain('chest');
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(3);
  });

  it('finds its rarer places by their key', () => {
    for (const k of ['mountain_hold', 'jungle_temple', 'desert_temple', 'ruined_monastery'] as StructureKey[]) expect(gen.places.near(0, 0, 4500, k).length, k).toBeGreaterThan(0);
  });
});

describe('wildlife', () => {
  const flat = (): BlockReader => ({ getBlock: (_x, y) => (y < 0 ? B.STONE : y === 0 ? BB.golden_grass_block : B.AIR) });

  it('lets a biome name its own animals: they spawn on its own ground and no others', () => {
    const allowed: readonly MobKind[] = ['camel', 'rabbit'];
    const rand = mulberry32(3);
    const mgr = new MobManager(rand);
    const sp = new MobSpawner();
    const seen = new Set<MobKind>();
    for (let i = 0; i < 400; i++) {
      mgr.mobs.length = 0;
      for (const m of sp.update(1, mgr, { world: flat(), player: { x: 0.5, y: 1, z: 0.5 }, daylight: 1, rand, wildlife: () => allowed })) seen.add(m.kind);
    }
    expect(seen.size).toBeGreaterThan(0);
    for (const k of seen) expect(allowed, k).toContain(k);
  });

  it('is only asked of the Beyond, where every biome with animals lists some of the game', () => {
    expect(gen.wildlifeAt(0, 0)?.length).toBeGreaterThan(0);
    const withLife = BEYOND_BIOMES.filter(Boolean).filter((b) => b.wildlife.length > 0);
    expect(withLife.length).toBeGreaterThan(90);
  });
});

describe('play', () => {
  it('lets a player stand, walk and live in it', () => {
    const g = new BeyondWorldGenerator(1);
    const world = new HeadlessWorld(g);
    const s = new GameSession({ seed: 1, world, generator: g, naturalSpawning: false, rand: mulberry32(1) });
    s.finishLoading();
    const y0 = s.body.y;
    expect(y0).toBeGreaterThan(SEA_LEVEL - 1);
    for (let i = 0; i < 120 && !s.vitals.dead; i++) s.tick({ ...idle(), forward: 1 });
    expect(s.vitals.dead).toBe(false);
    expect(Math.hypot(s.body.x, s.body.z)).toBeGreaterThan(5);
  });
});

describe('speed', () => {
  it('makes a chunk in a few milliseconds on average and caches columns', () => {
    const g = new BeyondWorldGenerator(8);
    const t0 = performance.now();
    for (let i = 0; i < 24; i++) g.generateChunk(i - 12, (i * 5) % 17);
    const per = (performance.now() - t0) / 24;
    expect(per).toBeLessThan(60);
    const t1 = performance.now();
    for (let i = 0; i < 24; i++) g.generateChunk(i - 12, (i * 5) % 17);
    expect(performance.now() - t1).toBeLessThan((performance.now() - t0) * 2 + 50);
  });

  it('answers a thousand column queries in well under a second', () => {
    const g = new BeyondWorldGenerator(11);
    const t = performance.now();
    for (let i = 0; i < 1000; i++) g.columnAt(i * 53 - 20000, i * 97 - 30000);
    expect(performance.now() - t).toBeLessThan(1500);
  });
});
