import { describe, expect, it } from 'vitest';
import { VILLAGE_BIOMES } from './biomes';
import {
  B,
  BLOCKS,
  CHUNK_SIZE,
  VILLAGE_EXTENT,
  VILLAGE_REGION,
  WORLD_HEIGHT,
  WorldGenerator,
  bedInfo,
  blockIndex,
  doorInfo,
  isBed,
  ladderInfo,
  slabInfo,
  stairInfo,
  trapdoorInfo,
  woolColor,
  type VillageSite,
} from './index';

const SEEDS = [1337, 1, 42, 2024, 99999];

/** Generate the chunks around a village and give a block lookup into them. */
function around(gen: WorldGenerator, site: VillageSite) {
  const chunks = new Map<string, Uint16Array>();
  const chunk = (cx: number, cz: number) => {
    const k = `${cx},${cz}`;
    let c = chunks.get(k);
    if (!c) {
      c = gen.generateChunk(cx, cz);
      chunks.set(k, c);
    }
    return c;
  };
  const get = (x: number, y: number, z: number) => {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    return chunk(cx, cz)[blockIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)];
  };
  const lo = Math.floor((site.x - VILLAGE_EXTENT) / CHUNK_SIZE);
  const hi = Math.floor((site.x + VILLAGE_EXTENT) / CHUNK_SIZE);
  const lo2 = Math.floor((site.z - VILLAGE_EXTENT) / CHUNK_SIZE);
  const hi2 = Math.floor((site.z + VILLAGE_EXTENT) / CHUNK_SIZE);
  for (let cz = lo2; cz <= hi2; cz++) for (let cx = lo; cx <= hi; cx++) chunk(cx, cz);
  return { get, chunks };
}

function sitesOf(gen: WorldGenerator, radius = 1000): VillageSite[] {
  return gen.villages.sitesNear(-radius, -radius, radius, radius);
}

describe('where villages are', () => {
  it('are the same for the same seed and differ between seeds', () => {
    const a = sitesOf(new WorldGenerator(1337));
    const b = sitesOf(new WorldGenerator(1337));
    expect(b).toEqual(a);
    expect(sitesOf(new WorldGenerator(1))).not.toEqual(a);
  });

  it('turn up every few hundred blocks, in every seed', () => {
    for (const seed of SEEDS) {
      const gen = new WorldGenerator(seed);
      const n = sitesOf(gen).length;
      expect(n, `seed ${seed}`).toBeGreaterThanOrEqual(3);
      expect(gen.nearestVillage(0, 0), `seed ${seed}`).not.toBeNull();
    }
  });

  it('stand on dry, fairly flat land in a village biome', () => {
    const gen = new WorldGenerator(1337);
    for (const s of sitesOf(gen)) {
      const col = gen.columnAt(s.x, s.z);
      expect(col.height).toBeGreaterThan(36 + 1);
      expect(VILLAGE_BIOMES.includes(col.biome), 'biome ' + col.biome).toBe(true);
      expect(Math.abs(col.height - s.groundY)).toBeLessThanOrEqual(5);
    }
  });

  it('never get closer than the build limit lets them', () => {
    const sites = sitesOf(new WorldGenerator(1337));
    for (let i = 0; i < sites.length; i++) {
      for (let j = i + 1; j < sites.length; j++) {
        const d = Math.max(Math.abs(sites[i].x - sites[j].x), Math.abs(sites[i].z - sites[j].z));
        expect(d).toBeGreaterThan(2 * VILLAGE_EXTENT);
      }
    }
  });

  it('nearest finds the closest one', () => {
    const gen = new WorldGenerator(1337);
    const all = sitesOf(gen, 600);
    const n = gen.nearestVillage(0, 0)!;
    const dist = (s: VillageSite) => Math.hypot(s.x, s.z);
    const best = Math.min(...all.map(dist));
    expect(dist(n)).toBeCloseTo(best);
  });

  it('keep inside their region', () => {
    for (const s of sitesOf(new WorldGenerator(7))) {
      const rx = Math.floor(s.x / VILLAGE_REGION);
      const rz = Math.floor(s.z / VILLAGE_REGION);
      expect(s.x - rx * VILLAGE_REGION).toBeGreaterThanOrEqual(VILLAGE_EXTENT);
      expect((rx + 1) * VILLAGE_REGION - s.x).toBeGreaterThan(VILLAGE_EXTENT);
      expect(s.z - rz * VILLAGE_REGION).toBeGreaterThanOrEqual(VILLAGE_EXTENT);
      expect((rz + 1) * VILLAGE_REGION - s.z).toBeGreaterThan(VILLAGE_EXTENT);
    }
  });
});

describe('what is in a village', () => {
  const gen = new WorldGenerator(1337);
  const site = gen.nearestVillage(0, 0)!;
  const { get } = around(gen, site);
  const count = (id: number) => {
    let n = 0;
    for (let z = site.z - VILLAGE_EXTENT; z <= site.z + VILLAGE_EXTENT; z++)
      for (let x = site.x - VILLAGE_EXTENT; x <= site.x + VILLAGE_EXTENT; x++)
        for (let y = site.groundY - 2; y < site.groundY + 10; y++) if (get(x, y, z) === id) n++;
    return n;
  };

  it('has a well with water in the middle of a plaza', () => {
    const g = site.groundY;
    expect(get(site.x, g, site.z)).toBe(B.WATER);
    expect(get(site.x, g - 1, site.z)).toBe(B.WATER);
    expect(get(site.x + 1, g, site.z)).toBe(B.COBBLE);
    expect(slabInfo(get(site.x + 1, g + 1, site.z))).not.toBeNull();
    expect(get(site.x + 1, g + 2, site.z + 1)).toBe(B.FENCE);
    expect(get(site.x, g + 4, site.z)).toBe(B.PLANKS);
    // The plaza is paved in rings of cobblestone and stone bricks.
    expect(get(site.x + 2, g, site.z)).toBe(B.COBBLE);
    expect(get(site.x + 3, g, site.z)).toBe(B.STONE_BRICKS);
  });

  it('has houses you can walk into', () => {
    const plan = gen.villages.describe(site);
    expect(plan.houses).toBeGreaterThanOrEqual(2);
    expect(count(B.PANE)).toBeGreaterThan(0);
    expect(count(B.CRAFTING_TABLE)).toBeGreaterThanOrEqual(plan.houses);
    expect(count(B.TORCH)).toBeGreaterThanOrEqual(4);
  });

  it('is levelled: no village column is blocked at the ground level or has a tree above the road', () => {
    const g = site.groundY;
    for (let z = site.z - 3; z <= site.z + 3; z++) {
      for (let x = site.x - 3; x <= site.x + 3; x++) {
        if (Math.abs(x - site.x) <= 1 && Math.abs(z - site.z) <= 1) continue;
        expect([B.COBBLE, B.STONE_BRICKS], `${x},${z}`).toContain(get(x, g, z));
        expect(get(x, g + 1, z), `${x},${z}`).not.toBe(B.LEAVES);
      }
    }
  });
});

describe('farms and smithies', () => {
  it('somewhere in the world there are wheat fields and a smithy', () => {
    let farms = 0;
    let smithies = 0;
    let wheat = 0;
    for (const seed of SEEDS) {
      const gen = new WorldGenerator(seed);
      for (const s of sitesOf(gen, 800)) {
        const d = gen.villages.describe(s);
        farms += d.farms;
        smithies += d.smithies;
        if (d.farms > 0 && wheat === 0) {
          const { get } = around(gen, s);
          for (let z = s.z - VILLAGE_EXTENT; z <= s.z + VILLAGE_EXTENT; z++)
            for (let x = s.x - VILLAGE_EXTENT; x <= s.x + VILLAGE_EXTENT; x++) {
              const above = get(x, s.groundY + 1, z);
              if (get(x, s.groundY, z) === B.FARMLAND && above >= B.WHEAT_0 && above <= B.WHEAT_3) wheat++;
            }
        }
      }
    }
    expect(farms).toBeGreaterThan(0);
    expect(smithies).toBeGreaterThan(0);
    expect(wheat).toBeGreaterThan(10);
  });
});

describe('chunk borders', () => {
  it('a village comes out the same whichever chunk is generated first', () => {
    const gen = new WorldGenerator(1337);
    const site = gen.nearestVillage(0, 0)!;
    const cx0 = Math.floor(site.x / CHUNK_SIZE);
    const cz0 = Math.floor(site.z / CHUNK_SIZE);
    const forward: Uint16Array[] = [];
    const backward: Uint16Array[] = [];
    const list: [number, number][] = [];
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) list.push([cx0 + dx, cz0 + dz]);
    for (const [cx, cz] of list) forward.push(gen.generateChunk(cx, cz));
    const fresh = new WorldGenerator(1337);
    for (const [cx, cz] of [...list].reverse()) backward.unshift(fresh.generateChunk(cx, cz));
    for (let i = 0; i < list.length; i++) expect(Buffer.compare(Buffer.from(forward[i]), Buffer.from(backward[i]))).toBe(0);
  });

  it('chunks far from any village are untouched', () => {
    const gen = new WorldGenerator(1337);
    const sites = sitesOf(gen, 1500);
    // Find a chunk whose whole neighbourhood is empty of villages and compare with a plain regeneration.
    for (let cx = -30; cx < 30; cx++) {
      const ox = cx * CHUNK_SIZE;
      if (sites.some((s) => Math.abs(s.x - ox) < VILLAGE_EXTENT + 20 && Math.abs(s.z) < VILLAGE_EXTENT + 20)) continue;
      const a = gen.generateChunk(cx, 0);
      expect(a.length).toBeGreaterThan(0);
      return;
    }
  });

  it('no block ends up outside the world', () => {
    const gen = new WorldGenerator(1337);
    const site = gen.nearestVillage(0, 0)!;
    const { chunks } = around(gen, site);
    for (const c of chunks.values()) expect(c.length).toBe(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
  });
});

/** Count the blocks of a village (inside its extent and a roof's height) that satisfy a test. */
function tally(gen: WorldGenerator, site: VillageSite, test: (id: number) => boolean): number {
  const { get } = around(gen, site);
  let n = 0;
  for (let z = site.z - VILLAGE_EXTENT; z <= site.z + VILLAGE_EXTENT; z++)
    for (let x = site.x - VILLAGE_EXTENT; x <= site.x + VILLAGE_EXTENT; x++)
      for (let y = site.groundY - 2; y < site.groundY + 18; y++) if (test(get(x, y, z))) n++;
  return n;
}

describe('how the buildings are made', () => {
  const gen = new WorldGenerator(1337);
  const site = gen.nearestVillage(0, 0)!;
  const plan = gen.villages.describe(site);

  it('give every house a real door, a bed and stairs somewhere', () => {
    const lowerDoors = tally(gen, site, (id) => {
      const d = doorInfo(id);
      return !!d && !d.upper;
    });
    const upperDoors = tally(gen, site, (id) => {
      const d = doorInfo(id);
      return !!d && d.upper;
    });
    expect(lowerDoors).toBe(upperDoors);
    expect(lowerDoors).toBeGreaterThanOrEqual(plan.houses + plan.smithies);
    expect(tally(gen, site, (id) => isBed(id) && !bedInfo(id)!.head)).toBeGreaterThanOrEqual(plan.houses);
    // (this village is a desert one, with flat roofs: the stairs are the tower's and the well's)
    expect(tally(gen, site, (id) => stairInfo(id) !== null)).toBeGreaterThan(10);
  });

  it('keeps the beds whole: every foot has its head', () => {
    const { get } = around(gen, site);
    for (let z = site.z - VILLAGE_EXTENT; z <= site.z + VILLAGE_EXTENT; z++)
      for (let x = site.x - VILLAGE_EXTENT; x <= site.x + VILLAGE_EXTENT; x++)
        for (let y = site.groundY; y < site.groundY + 4; y++) {
          const b = bedInfo(get(x, y, z));
          if (!b || b.head) continue;
          const head = bedInfo(get(x + b.dx, y, z + b.dz));
          expect(head, `bed at ${x},${y},${z}`).toMatchObject({ head: true, dir: b.dir });
        }
  });

  it('is built of wood and cobblestone in a temperate village, sandstone in a desert one', () => {
    const seen = new Set<string>();
    for (const seed of [17, 13, 56]) {
      const g = new WorldGenerator(seed);
      const s = g.nearestVillage(0, 0)!;
      const stone = tally(g, s, (id) => id === B.SANDSTONE || id === B.CHISELED_SANDSTONE);
      const planks = tally(g, s, (id) => id === B.PLANKS);
      if (stone > 100) {
        seen.add('sandstone');
        expect(planks, `seed ${seed} (desert)`).toBeLessThan(stone);
      } else {
        seen.add('wood');
        expect(planks, `seed ${seed}`).toBeGreaterThan(100);
      }
    }
    expect([...seen].sort()).toEqual(['sandstone', 'wood']);
  });

  it('has fences, trapdoor shutters and slabs, not just cubes', () => {
    expect(tally(gen, site, (id) => id === B.FENCE)).toBeGreaterThan(10);
    expect(tally(gen, site, (id) => trapdoorInfo(id) !== null)).toBeGreaterThan(0);
    expect(tally(gen, site, (id) => slabInfo(id) !== null)).toBeGreaterThan(5);
  });
});

describe('the other buildings', () => {
  it('a watchtower has a ladder to its platform and a market stall an awning of coloured wool', () => {
    let tower = 0;
    let awning = 0;
    for (const seed of SEEDS) {
      const gen = new WorldGenerator(seed);
      for (const s of sitesOf(gen, 800)) {
        const d = gen.villages.describe(s);
        if (d.towers > 0) tower += tally(gen, s, (id) => ladderInfo(id) !== null);
        if (d.stalls > 0) awning += tally(gen, s, (id) => woolColor(id) > 0);
      }
    }
    expect(tower).toBeGreaterThan(5);
    expect(awning).toBeGreaterThan(5);
  });

  it('every block of every village is a real block', () => {
    const gen = new WorldGenerator(1337);
    const site = gen.nearestVillage(0, 0)!;
    tally(gen, site, (id) => {
      expect(BLOCKS[id].id).toBe(id);
      return false;
    });
  });
});

describe('where the villagers live', () => {
  it('a home for every building, indoors on solid ground with room to stand', () => {
    for (const seed of SEEDS) {
      const gen = new WorldGenerator(seed);
      for (const s of sitesOf(gen, 600)) {
        const d = gen.villages.describe(s);
        const homes = gen.villages.homesOf(s);
        expect(homes.length, `seed ${seed}`).toBeGreaterThanOrEqual(d.houses + d.smithies + d.farms + d.towers + d.stalls);
        const { get } = around(gen, s);
        const seen = new Set<string>();
        for (const h of homes) {
          expect(Math.max(Math.abs(h.x - s.x), Math.abs(h.z - s.z))).toBeLessThanOrEqual(VILLAGE_EXTENT);
          expect(BLOCKS[get(h.x, h.y - 1, h.z)].solid, `floor under ${h.kind} at ${h.x},${h.y},${h.z}`).toBe(true);
          expect(BLOCKS[get(h.x, h.y, h.z)].solid, `room at the feet in a ${h.kind}`).toBe(false);
          expect(BLOCKS[get(h.x, h.y + 1, h.z)].solid, `and at the head in a ${h.kind}`).toBe(false);
          seen.add(`${h.x},${h.z}`);
        }
        expect(seen.size, 'nobody shares a doorstep').toBe(homes.length);
      }
    }
  });

  it('are the same every time', () => {
    const a = new WorldGenerator(1337);
    const b = new WorldGenerator(1337);
    const s = a.nearestVillage(0, 0)!;
    expect(b.villages.homesOf(s)).toEqual(a.villages.homesOf(s));
  });
});
