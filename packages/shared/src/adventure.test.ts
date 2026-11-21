import { describe, expect, it, vi } from 'vitest';
import {
  ADVENTURE_SEED,
  AdventureWorldGenerator,
  B,
  BLOCKS,
  CHUNK_SIZE,
  CELLAR_HOUSE,
  DUNGEON_MIN_LEVEL,
  COMPASS_FRAMES,
  DUNGEON_X,
  DUNGEON_Z,
  GREYKEEP,
  HUB_HALF,
  HeadlessWorld,
  I,
  INSTANCE_LENGTH,
  INSTANCE_SLOTS,
  INSTANCE_STRIDE,
  INSTANCE_X0,
  INSTANCE_Z0,
  IS_LIQUID,
  IS_SOLID,
  NPCS,
  SEA_LEVEL,
  SPAWN_SIZE,
  SPAWN_X0,
  SPAWN_Z0,
  UNDERCROFT_DEPTH,
  UNDERCROFT_SPAWNS,
  WORLD_KINDS,
  blockIndex,
  compassTileName,
  doorInfo,
  isWorldKind,
  ladderInfo,
  makeGenerator,
  stairInfo,
  tileIndex,
} from './index';

const gen = makeGenerator(ADVENTURE_SEED, 'adventure') as AdventureWorldGenerator;

const blockAt = (x: number, y: number, z: number): number => {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cz = Math.floor(z / CHUNK_SIZE);
  return gen.generateChunk(cx, cz)[blockIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)];
};

describe('the adventure world', () => {
  it('is a kind of world, and the same every time', () => {
    expect(gen.kind).toBe('adventure');
    expect(isWorldKind('adventure')).toBe(true);
    expect(WORLD_KINDS).toContain('adventure');
    expect([...gen.generateChunk(0, 0)]).toEqual([...new AdventureWorldGenerator(ADVENTURE_SEED).generateChunk(0, 0)]);
    expect([...gen.generateChunk(6, 0)]).toEqual([...new AdventureWorldGenerator(ADVENTURE_SEED).generateChunk(6, 0)]);
  });

  it('has the waystone in the middle of the village', () => {
    for (let y = 1; y <= 3; y++) expect(blockAt(0, gen.hubY + y, 0), `waystone at height ${y}`).toBe(B.WAYSTONE);
    expect(blockAt(0, gen.hubY + 4, 0)).toBe(B.TORCH);
    expect(BLOCKS[B.WAYSTONE].hardness).toBe(Infinity);
  });

  describe('the Undercroft, the cave under the village', () => {
    const chunks = new Map<string, Uint16Array>();
    const at = (x: number, y: number, z: number): number => {
      const cx = Math.floor(x / CHUNK_SIZE);
      const cz = Math.floor(z / CHUNK_SIZE);
      const k = `${cx},${cz}`;
      let c = chunks.get(k);
      if (!c) chunks.set(k, (c = gen.generateChunk(cx, cz)));
      return c[blockIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)];
    };
    const floorY = gen.undercroftY;

    it('lies well under the village, far below the sea of grass above it', () => {
      expect(floorY).toBe(gen.hubY - UNDERCROFT_DEPTH);
      expect(floorY).toBeGreaterThan(10);
    });

    it('has room to stand and a floor under every place a new character can wake', () => {
      expect(UNDERCROFT_SPAWNS.length).toBe(12);
      for (const s of UNDERCROFT_SPAWNS) {
        const x = Math.floor(s.x);
        const z = Math.floor(s.z);
        expect(IS_SOLID[at(x, floorY, z)], `floor at ${x},${z}`).toBe(1);
        for (let dy = 1; dy <= 3; dy++) expect(IS_SOLID[at(x, floorY + dy, z)], `air at ${x},${z} +${dy}`).toBe(0);
      }
      // Each arrival gets a place of their own, until all twelve are used.
      const spots = new Set(Array.from({ length: 12 }, (_, i) => `${gen.startFor(i).x},${gen.startFor(i).z}`));
      expect(spots.size).toBe(12);
      for (let i = 0; i < 30; i++) expect(gen.startFor(i).y).toBe(floorY + 1);
    });

    it('is sealed: the air of the cave and the stair reaches no natural cave, no water and nothing else underground', () => {
      // A flood through every block that is not solid, from where people wake up.
      const s = UNDERCROFT_SPAWNS[0];
      const start = `${Math.floor(s.x)},${floorY + 1},${Math.floor(s.z)}`;
      const seen = new Set<string>([start]);
      const queue: [number, number, number][] = [[Math.floor(s.x), floorY + 1, Math.floor(s.z)]];
      const stairX0 = CELLAR_HOUSE.x0 + 2;
      for (let qi = 0; qi < queue.length; qi++) {
        const [x, y, z] = queue[qi];
        expect(IS_LIQUID[at(x, y, z)], `no liquid at ${x},${y},${z}`).toBeFalsy();
        // Underground (below the village's ground) the air is either in the cave or in the stair.
        if (y < gen.hubY) {
          const inCave = x >= -17 && x <= 17 && z >= 4 && z <= 29;
          const inStair = x >= stairX0 && x <= stairX0 + UNDERCROFT_DEPTH && z >= 11 && z <= 13;
          expect(inCave || inStair, `air outside the cave at ${x},${y},${z}`).toBe(true);
        }
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
          const n: [number, number, number] = [x + dx, y + dy, z + dz];
          const key = n.join(',');
          if (seen.has(key) || n[1] < 1 || n[1] > gen.hubY || IS_SOLID[at(...n)]) continue;
          seen.add(key);
          queue.push(n);
        }
      }
      expect(seen.size).toBeGreaterThan(1500);
    });

    it('has the healer standing on its floor, in a place with room for her', () => {
      const mirel = gen.npcStations().find((st) => st.npc.id === 'mirel')!;
      expect(mirel.y).toBe(floorY + 1);
      expect(IS_SOLID[at(Math.floor(mirel.x), floorY, Math.floor(mirel.z))]).toBe(1);
      expect(IS_SOLID[at(Math.floor(mirel.x), floorY + 1, Math.floor(mirel.z))]).toBe(0);
      expect(IS_SOLID[at(Math.floor(mirel.x), floorY + 2, Math.floor(mirel.z))]).toBe(0);
      // The other people of the village still stand on its ground.
      for (const st of gen.npcStations()) if (st.npc.id !== 'mirel' && !st.npc.dungeon) expect(st.y).toBe(gen.hubY + 1);
    });

    it('is in a zone of its own, and the village begins at the top of the stair', () => {
      const s = UNDERCROFT_SPAWNS[0];
      expect(gen.zoneAt(s.x, floorY + 1, s.z)).toBe('undercroft');
      expect(gen.zoneAt(0.5, gen.hubY + 1, 20.5)).toBe('dawnwatch');
      expect(gen.zoneAt(CELLAR_HOUSE.x0 + 3.5, gen.hubY + 1, 12.5)).toBe('dawnwatch');
      expect(gen.zoneAt(CELLAR_HOUSE.x0 + 8.5, gen.hubY - 4, 12.5)).toBe('undercroft');
    });

    it('stays the village\'s: it cannot be dug into, and no monster is born in it', () => {
      const s = UNDERCROFT_SPAWNS[0];
      expect(gen.isProtected(s.x, floorY + 1, s.z)).toBe(true);
      expect(gen.isProtected(CELLAR_HOUSE.x0 + 6, gen.hubY - 4, 12)).toBe(true);
      expect(gen.safeFromMonsters(s.x, s.z)).toBe(true);
    });

    it('can be walked out of, step by step, into the village outside the cellar house', () => {
      // A breadth-first walk: one block at a time, up or down by one, through doors, never through anything solid.
      const passable = (id: number): boolean => !IS_SOLID[id] || doorInfo(id) !== null;
      const standable = (x: number, y: number, z: number): boolean => passable(at(x, y, z)) && passable(at(x, y + 1, z)) && (IS_SOLID[at(x, y - 1, z)] === 1 || stairInfo(at(x, y - 1, z)) !== null);
      const start = { x: Math.floor(UNDERCROFT_SPAWNS[0].x), y: floorY + 1, z: Math.floor(UNDERCROFT_SPAWNS[0].z) };
      const seen = new Set<string>([`${start.x},${start.y},${start.z}`]);
      const queue = [start];
      const goal = { x: CELLAR_HOUSE.x0 + 1, z: CELLAR_HOUSE.z0 - 2 };
      let found = false;
      for (let qi = 0; qi < queue.length && !found; qi++) {
        const c = queue[qi];
        if (c.x === goal.x && c.z === goal.z && c.y === gen.hubY + 1) found = true;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          for (const dy of [0, 1, -1]) {
            const n = { x: c.x + dx, y: c.y + dy, z: c.z + dz };
            const key = `${n.x},${n.y},${n.z}`;
            if (seen.has(key) || n.x < -45 || n.x > 25 || n.z < 0 || n.z > 35 || n.y < floorY || n.y > gen.hubY + 3) continue;
            // Climbing a block needs the cell above the walker's head free too.
            if (dy === 1 && !passable(at(c.x, c.y + 2, c.z))) continue;
            if (!standable(n.x, n.y, n.z)) continue;
            seen.add(key);
            queue.push(n);
          }
        }
      }
      expect(found).toBe(true);
    });

    it('has a stair of stone-brick steps that rises a block for every block, with room to climb it', () => {
      const x0 = CELLAR_HOUSE.x0 + 2;
      for (let k = 0; k < UNDERCROFT_DEPTH; k++) {
        for (const z of [11, 12, 13]) {
          const info = stairInfo(at(x0 + k, gen.hubY - k, z));
          expect(info, `step ${k} at z ${z}`).not.toBeNull();
          expect(info!.dir).toBe(1);
        }
        // The middle of the stair is clear (a torch post stands now and then at its sides).
        for (let dy = 1; dy <= 3; dy++) expect(IS_SOLID[at(x0 + k, gen.hubY - k + dy, 12)], `headroom over step ${k}`).toBe(0);
      }
    });
  });

  it('draws the compass needle in 32 pictures, each its own tile', () => {
    const names = new Set(Array.from({ length: COMPASS_FRAMES }, (_, i) => compassTileName(i)));
    expect(names.size).toBe(COMPASS_FRAMES);
    for (const n of names) expect(() => tileIndex(n)).not.toThrow();
    expect(compassTileName(COMPASS_FRAMES)).toBe(compassTileName(0));
    expect(compassTileName(-1)).toBe(compassTileName(COMPASS_FRAMES - 1));
  });

  it('stands on dry land: the village, the road to the dungeon and the chapel', () => {
    expect(gen.hubY).toBeGreaterThan(SEA_LEVEL + 1);
    expect(gen.ruinY).toBeGreaterThan(SEA_LEVEL + 1);
    for (let x = -HUB_HALF; x < DUNGEON_X + 8; x += 7) {
      for (const z of [-30, -1, 0, 1, 30]) {
        if (Math.abs(x) > HUB_HALF && Math.abs(z) > 1 && x < DUNGEON_X - 8) continue;
        expect(gen.columnAt(x, z).height, `land at ${x},${z}`).toBeGreaterThan(SEA_LEVEL + 1);
      }
    }
    // The village's ground is level.
    for (const [x, z] of [[0, 0], [-30, -30], [30, 30], [-30, 30], [30, -30]]) expect(gen.columnAt(x, z).height).toBeGreaterThan(SEA_LEVEL);
    for (const [x, z] of [[0, 8], [0, -11], [15, 0], [-20, 25], [-6, 12]]) {
      expect(blockAt(x, gen.hubY + 1, z), `air above the ground at ${x},${z}`).toBe(B.AIR);
      expect(IS_SOLID[blockAt(x, gen.hubY, z)], `ground at ${x},${z}`).toBe(1);
    }
  });

  it('puts everybody on the Landing, each on a block of their own, for the first 144 arrivals', () => {
    const seen = new Set<string>();
    for (let slot = 0; slot < SPAWN_SIZE * SPAWN_SIZE; slot++) {
      const s = gen.spawnFor(slot);
      expect(s.x).toBeGreaterThanOrEqual(SPAWN_X0);
      expect(s.x).toBeLessThan(SPAWN_X0 + SPAWN_SIZE);
      expect(s.z).toBeGreaterThanOrEqual(SPAWN_Z0);
      expect(s.z).toBeLessThan(SPAWN_Z0 + SPAWN_SIZE);
      expect(s.y).toBe(gen.hubY + 1);
      seen.add(`${Math.floor(s.x)},${Math.floor(s.z)}`);
      // Paved, with open air to stand in.
      const bx = Math.floor(s.x);
      const bz = Math.floor(s.z);
      expect([B.STONE_BRICKS, B.STONE, B.COBBLE]).toContain(blockAt(bx, gen.hubY, bz));
      for (let dy = 1; dy <= 3; dy++) expect(blockAt(bx, gen.hubY + dy, bz)).toBe(B.AIR);
    }
    expect(seen.size).toBe(SPAWN_SIZE * SPAWN_SIZE);
    expect(gen.findSpawn()).toEqual(gen.spawnFor(0));
    // And it goes round again.
    expect(gen.spawnFor(144)).toEqual(gen.spawnFor(0));
  });

  it('stands each quest giver on open ground, with room for their head', () => {
    const stations = gen.npcStations();
    // The village's people stand once; a dungeon's person stands in every copy of it, each in its own place.
    expect(stations.length).toBe(NPCS.filter((n) => !n.dungeon).length + NPCS.filter((n) => n.dungeon).length * INSTANCE_SLOTS);
    const keys = stations.map((st) => st.key ?? st.index);
    expect(new Set(keys).size).toBe(keys.length);
    for (const st of stations.filter((s) => s.npc.dungeon)) expect(gen.instanceAt(st.x, st.z)).toBe(Math.round((st.z - NPCS[st.index].z) / INSTANCE_STRIDE));    for (const st of stations) {
      const x = Math.floor(st.x);
      const z = Math.floor(st.z);
      expect(IS_SOLID[blockAt(x, st.y - 1, z)], `${st.npc.id} has ground`).toBe(1);
      expect(IS_SOLID[blockAt(x, st.y, z)], `${st.npc.id} has room (feet)`).toBe(0);
      expect(IS_SOLID[blockAt(x, st.y + 1, z)], `${st.npc.id} has room (head)`).toBe(0);
      expect(NPCS[st.index]).toBe(st.npc);
    }
  });

  it('knows the village and the dungeon as named places', () => {
    expect(gen.zoneAt(0.5, gen.hubY + 1, 0.5)).toBe('dawnwatch');
    expect(gen.zoneAt(INSTANCE_X0 + 8.5, gen.cellarY + 1, gen.roomZ + 0.5)).toBe('hollow_cellar');
    expect(gen.zoneAt(INSTANCE_X0 + 8.5, gen.cellarY + 1, gen.roomZ + 5 * INSTANCE_STRIDE + 0.5)).toBe('hollow_cellar');
    expect(gen.zoneAt(DUNGEON_X + 0.5, gen.ruinY + 1, DUNGEON_Z + 0.5)).toBeNull();
    expect(gen.zoneAt(400, 70, 400)).toBeNull();
    expect(makeGenerator(5).zoneAt(0, 70, 0)).toBeNull();
    expect(makeGenerator(5).npcStations()).toEqual([]);
  });

  it('raises Greykeep north of Dawnwatch, with a gate, a long hall and a spire', () => {
    const g = gen.hubY;
    const { gate, yard, keep, nave, naveEnd, spire } = GREYKEEP;
    // The arch is open well over head height, and the stone closes it above.
    for (let dy = 1; dy <= 5; dy++) expect(blockAt(gate.x, g + dy, gate.z)).toBe(B.AIR);
    expect(IS_SOLID[blockAt(gate.x, g + 6, gate.z)]).toBe(1);
    // The curtain is stone, and the side passage is open ground with sky above it.
    expect(IS_SOLID[blockAt(-6, g + 2, gate.z)]).toBe(1);
    expect(IS_SOLID[blockAt(yard.x, g, yard.z)]).toBe(1);
    expect(blockAt(yard.x, g + 1, yard.z)).toBe(B.AIR);
    expect(blockAt(yard.x, g + 12, yard.z)).toBe(B.AIR);
    // The gatehouse is solid in its face, up where the dark notch is.
    expect(IS_SOLID[blockAt(keep.x, g + keep.dy, keep.z)]).toBe(1);
    // The hall runs north from the gate, and the back wall closes it.
    expect(blockAt(nave.x, g + 2, nave.z)).toBe(B.AIR);
    expect(blockAt(nave.x, g + 2, -63)).toBe(B.AIR);
    expect(IS_SOLID[blockAt(naveEnd.x, g + 2, naveEnd.z)]).toBe(1);
    // The spire stands above the hall roof.
    expect(IS_SOLID[blockAt(spire.x, g + spire.dy, spire.z)]).toBe(1);
    expect(gen.zoneAt(yard.x + 0.5, g + 2, yard.z + 0.5)).toBe('greykeep');
    expect(gen.isProtected(gate.x, g + 1, gate.z)).toBe(true);
    expect(gen.safeFromMonsters(yard.x, yard.z)).toBe(true);
    expect(gen.zoneAt(0.5, g + 1, 0.5)).toBe('dawnwatch');
  });

  it('can be climbed: ladders up the towers, stairs to the wall walk, and a clear way onto both', () => {
    const g = gen.hubY;
    // The south-west tower: a ladder against its front wall from the floor to the deck, and clear air above it.
    for (let dy = 1; dy <= 15; dy++) expect(ladderInfo(blockAt(-27, g + dy, -61))?.facing, `ladder at height ${dy}`).toBe(2);
    expect(blockAt(-27, g + 16, -61)).toBe(B.AIR);
    expect(blockAt(-27, g + 17, -61)).toBe(B.AIR);
    // Stairs run up the inside of the front wall, one block per step, and the rail leaves a gap where they arrive.
    for (let i = 0; i < 10; i++) expect(stairInfo(blockAt(-8 - i, g + 1 + i, -65))?.dir, `step ${i}`).toBe(1);
    for (let x = -17; x <= -15; x++) expect(blockAt(x, g + 11, -64), `gap at ${x}`).toBe(B.AIR);
    // The walk itself is stone with two blocks of air above it, and runs into the tower.
    for (let x = -20; x <= -6; x++) {
      expect(IS_SOLID[blockAt(x, g + 10, -63)], `walk at ${x}`).toBe(1);
      expect(blockAt(x, g + 11, -63)).toBe(B.AIR);
      expect(blockAt(x, g + 12, -63)).toBe(B.AIR);
    }
    expect(blockAt(-21, g + 11, -63)).toBe(B.AIR);
    expect(blockAt(-21, g + 12, -63)).toBe(B.AIR);
    // The ground-floor door of the tower and the doors of the gatehouse hall.
    for (let dy = 1; dy <= 3; dy++) expect(blockAt(-21, g + dy, -68), `tower door at ${dy}`).toBe(B.AIR);
    for (const x of [-5, 5]) for (let dy = 11; dy <= 12; dy++) expect(blockAt(x, g + dy, -63), `hall door at ${x}, ${dy}`).toBe(B.AIR);
  });

  it('has a gravel road from the village to the chapel', () => {
    for (const x of [45, 60, 75]) {
      let y = 255;
      while (y > 1 && (blockAt(x, y, 0) === B.AIR || !IS_SOLID[blockAt(x, y, 0)])) y--;
      expect([B.GRAVEL, B.COBBLE], `road at x=${x}`).toContain(blockAt(x, y, 0));
    }
  });

  it('puts a portal in the middle of the chapel, in a frame of obsidian, and nothing under it', () => {
    const g = gen.ruinY;
    for (let dz = -1; dz <= 1; dz++) for (let y = 1; y <= 3; y++) expect(blockAt(DUNGEON_X, g + y, DUNGEON_Z + dz), `portal at ${dz},${y}`).toBe(B.PORTAL);
    for (let dz = -2; dz <= 2; dz++) {
      expect(blockAt(DUNGEON_X, g + 4, DUNGEON_Z + dz)).toBe(B.OBSIDIAN);
      expect(blockAt(DUNGEON_X, g, DUNGEON_Z + dz)).toBe(B.OBSIDIAN);
    }
    for (let y = 1; y <= 3; y++) for (const dz of [-2, 2]) expect(blockAt(DUNGEON_X, g + y, DUNGEON_Z + dz)).toBe(B.OBSIDIAN);
    // There is room to walk up to it from the gate (west).
    for (let x = DUNGEON_X - 4; x < DUNGEON_X; x++) expect(IS_SOLID[blockAt(x, g + 1, DUNGEON_Z)], `walkway at ${x}`).toBe(0);
  });

  it('can be walked from the Landing, through the village and along the road, to the portal in the chapel', () => {
    const world = new HeadlessWorld(gen);
    const start = gen.spawnFor(0);
    const exit = gen.instanceExit();
    expect(walk(world, { x: Math.floor(start.x), y: start.y, z: Math.floor(start.z) }, { x: DUNGEON_X - 1, y: gen.ruinY + 1, z: DUNGEON_Z }, { x0: -60, x1: DUNGEON_X + 5, z0: -60, z1: 60 })).toBe(true);
    // And the way out of the portal comes out in the open, in front of it.
    expect(exit.x).toBeLessThan(DUNGEON_X);
    expect(IS_SOLID[blockAt(Math.floor(exit.x), Math.floor(exit.y), Math.floor(exit.z))]).toBe(0);
    expect(IS_SOLID[blockAt(Math.floor(exit.x), Math.floor(exit.y) + 1, Math.floor(exit.z))]).toBe(0);
    expect(IS_SOLID[blockAt(Math.floor(exit.x), Math.floor(exit.y) - 1, Math.floor(exit.z))]).toBe(1);
  }, 120000);
});

describe('the dungeon copies', () => {
  vi.setConfig({ testTimeout: 120_000 });
  const slots = [0, 1, 7, INSTANCE_SLOTS - 1];

  it('lie in a field of their own: a slot for each stride of z, and nothing around them', () => {
    expect(gen.instanceCount()).toBe(INSTANCE_SLOTS);
    expect(gen.instanceAt(INSTANCE_X0, INSTANCE_Z0)).toBe(0);
    expect(gen.instanceAt(INSTANCE_X0 + INSTANCE_LENGTH - 1, INSTANCE_Z0 + INSTANCE_STRIDE - 1)).toBe(0);
    expect(gen.instanceAt(INSTANCE_X0, INSTANCE_Z0 + INSTANCE_STRIDE)).toBe(1);
    expect(gen.instanceAt(INSTANCE_X0, INSTANCE_Z0 + INSTANCE_STRIDE * INSTANCE_SLOTS - 1)).toBe(INSTANCE_SLOTS - 1);
    for (const [x, z] of [[INSTANCE_X0 - 1, INSTANCE_Z0], [INSTANCE_X0 + INSTANCE_LENGTH, INSTANCE_Z0], [INSTANCE_X0, INSTANCE_Z0 - 1], [INSTANCE_X0, INSTANCE_Z0 + INSTANCE_STRIDE * INSTANCE_SLOTS], [0, 0], [92, 0]]) {
      expect(gen.instanceAt(x, z), `${x},${z}`).toBe(-1);
    }
    for (const s of slots) {
      const b = gen.instanceBounds(s)!;
      expect(gen.instanceAt(b.x0, b.z0)).toBe(s);
      expect(gen.instanceAt(b.x1, b.z1)).toBe(s);
    }
    expect(gen.instanceBounds(-1)).toBeNull();
    expect(gen.instanceBounds(INSTANCE_SLOTS)).toBeNull();
    // An ordinary world has none.
    const plain = makeGenerator(5);
    expect(plain.instanceCount()).toBe(0);
    expect(plain.instanceAt(INSTANCE_X0, INSTANCE_Z0)).toBe(-1);
    expect(plain.instanceEntry(0)).toBeNull();
  });

  it('are all the same rooms, shifted: solid rock with the dungeon cut in it, the same chunk for chunk', () => {
    const cz0 = INSTANCE_Z0 >> 4;
    const per = INSTANCE_STRIDE >> 4;
    for (const s of slots) {
      for (let cx = INSTANCE_X0 >> 4; cx < (INSTANCE_X0 + INSTANCE_LENGTH) >> 4; cx++) {
        for (let k = 0; k < per; k++) {
          expect([...gen.generateChunk(cx, cz0 + s * per + k)], `slot ${s} chunk ${cx},${k}`).toEqual([...gen.generateChunk(cx, cz0 + k)]);
        }
      }
    }
    // Rock above and around the rooms, bedrock at the bottom.
    const b = gen.instanceBounds(2)!;
    expect(blockAt(b.x0 + 1, 1, b.z0 + 1)).toBe(B.STONE);
    expect(blockAt(b.x0 + 1, 0, b.z0 + 1)).toBe(B.BEDROCK);
    expect(blockAt(b.x1 - 1, 200, b.z1 - 1)).toBe(B.STONE);
    expect(blockAt(INSTANCE_X0 + 8, gen.cellarY + 30, b.z0 + 24)).toBe(B.STONE);
  });

  it('give each copy its own cages and chests, with the same loot', () => {
    expect(gen.deep.cages.length).toBe(3);
    for (const s of slots) {
      const cages = gen.instanceCages(s);
      for (const c of cages) expect(blockAt(c.x, c.y, c.z), `cage ${c.x},${c.y},${c.z}`).toBe(B.SPAWNER);
      // The cages are locks, not makers of monsters.
      expect(cages.map((c) => gen.spawnerAt(c.x, c.y, c.z))).toEqual([null, null, null]);
      const z = gen.roomZ + s * INSTANCE_STRIDE;
      expect(gen.deep.chests.length).toBeGreaterThanOrEqual(8);
      for (const c of gen.deep.chests) {
        expect(blockAt(INSTANCE_X0 + c.u, c.y, z + c.v), `slot ${s} chest ${c.u},${c.v}`).toBe(B.CHEST);
        expect(gen.lootAt(INSTANCE_X0 + c.u, c.y, z + c.v)).toBe(c.table);
      }
    }
    // A cage outside the dungeons is the usual kind of cage.
    expect(gen.spawnerAt(5, 30, 5)).toBeNull();
  });

  it('have a portal out in the west wall of the camp, and an arrival spot in front of it, facing the caves', () => {
    for (const s of slots) {
      const e = gen.instanceEntry(s)!;
      const z = gen.roomZ + s * INSTANCE_STRIDE;
      for (let dz = -1; dz <= 1; dz++) for (let y = 1; y <= 3; y++) expect(blockAt(INSTANCE_X0 + 4, gen.cellarY + y, z + dz), `portal ${dz},${y}`).toBe(B.PORTAL);
      expect(blockAt(INSTANCE_X0 + 4, gen.cellarY, z)).toBe(B.OBSIDIAN);
      const bx = Math.floor(e.x);
      const bz = Math.floor(e.z);
      expect(IS_SOLID[blockAt(bx, e.y - 1, bz)]).toBe(1);
      expect(blockAt(bx, e.y, bz)).toBe(B.AIR);
      expect(blockAt(bx, e.y + 1, bz)).toBe(B.AIR);
      expect(e.x).toBeGreaterThan(INSTANCE_X0 + 5);
      expect(gen.instanceAt(e.x, e.z)).toBe(s);
      // Facing +x: the look vector is (-sin yaw, -cos yaw).
      expect(-Math.sin(e.yaw)).toBeCloseTo(1);
    }
    expect(gen.instanceEntry(-1)).toBeNull();
    expect(gen.instanceEntry(INSTANCE_SLOTS)).toBeNull();
  });

  it('are a cave system with two gates: the lush levels are open, the iron gates shut the deep caves and the Molten Heart until their cages are broken', () => {
    for (const s of [0, INSTANCE_SLOTS - 1]) {
      const world = new HeadlessWorld(gen);
      const e = gen.instanceEntry(s)!;
      const z = gen.roomZ + s * INSTANCE_STRIDE;
      const b = gen.instanceBounds(s)!;
      const box = { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 };
      const from = { x: Math.floor(e.x), y: e.y, z: Math.floor(e.z) };
      const at = (u: number, v: number, y: number) => ({ x: INSTANCE_X0 + u, y, z: z + v });
      const key = (p: { x: number; y: number; z: number }): string => `${p.x},${p.y},${p.z}`;
      const gates = gen.instanceGates(s);
      expect(gates.map((g) => g.id)).toEqual(['court', 'throne']);
      for (const g of gates) for (const gb of g.boxes) expect(IS_SOLID[blockAt(gb.x0, gb.y0, gb.z0)], `slot ${s}: gate ${g.id} is bars`).toBe(1);
      const open = (g: (typeof gates)[number]): void => {
        for (const gb of g.boxes) for (let y = gb.y0; y <= gb.y1; y++) for (let zz = gb.z0; zz <= gb.z1; zz++) for (let x = gb.x0; x <= gb.x1; x++) world.setBlock(x, y, zz, B.AIR);
      };
      const posts = gen.deep.posts;
      const spots = (list: readonly { u: number; v: number; y: number }[]) => list.map((p) => at(p.u, p.v, p.y));
      // A chest is a block: it is reached when somebody can stand beside it.
      const beside = (set: Set<string>, p: { x: number; y: number; z: number }): boolean => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => [-1, 0, 1].some((dy) => set.has(key({ x: p.x + dx, y: p.y + dy, z: p.z + dz }))));
      const shut = reachable(world, from, box);
      // Open from the camp: everything on the lush levels (monsters, chests, the first two cages).
      for (const p of posts.filter((q) => q.layer === 0)) expect(shut.has(key(at(p.u, p.v, p.y))), `slot ${s}: ${p.kind} at ${p.u},${p.v}`).toBe(true);
      for (const c of [...spots(gen.deep.chests.filter((q) => q.y > gen.cellarY - 20)), ...spots(gen.deep.cages.slice(0, 2))]) expect(beside(shut, c), `slot ${s}: ${c.x},${c.z}`).toBe(true);
      expect(shut.has(key(at(gen.deep.entry.u, gen.deep.entry.v, gen.deep.entry.y)))).toBe(true);
      // Shut: the deep caves and everything below them.
      for (const p of posts.filter((q) => q.layer > 0)) expect(shut.has(key(at(p.u, p.v, p.y))), `slot ${s}: ${p.kind} at ${p.u},${p.v} is shut away`).toBe(false);
      expect(shut.has(key(at(gen.deep.boss.u, gen.deep.boss.v, gen.deep.boss.y)))).toBe(false);
      // The first gate out: the deep caves and the cavern of lava (and the third cage) are open, the Molten Heart is not.
      open(gates[0]);
      const one = reachable(world, from, box);
      const beyondTwo = (p: { u: number; v: number }): boolean => p.u > 200;
      for (const p of posts.filter((q) => q.layer === 1 && !beyondTwo(q))) expect(one.has(key(at(p.u, p.v, p.y))), `slot ${s}: ${p.kind} at ${p.u},${p.v}`).toBe(true);
      expect(beside(one, at(gen.deep.cages[2].u, gen.deep.cages[2].v, gen.deep.cages[2].y))).toBe(true);
      for (const p of posts.filter((q) => beyondTwo(q))) expect(one.has(key(at(p.u, p.v, p.y))), `slot ${s}: ${p.kind} at ${p.u},${p.v} is behind the second gate`).toBe(false);
      expect(one.has(key(at(gen.deep.boss.u, gen.deep.boss.v, gen.deep.boss.y)))).toBe(false);
      // The second gate out: the king's cavern, and all of the dungeon, is open.
      open(gates[1]);
      const all = reachable(world, from, box);
      for (const p of posts) expect(all.has(key(at(p.u, p.v, p.y))), `slot ${s}: ${p.kind} at ${p.u},${p.v}`).toBe(true);
      expect(all.has(key(at(gen.deep.boss.u, gen.deep.boss.v, gen.deep.boss.y)))).toBe(true);
      for (const c of gen.deep.chests) expect(beside(all, at(c.u, c.v, c.y)), `slot ${s}: chest ${c.u},${c.v}`).toBe(true);
    }
  });
  it('has a Warden at the entrance of every copy, in the clear, where the first quest ends', () => {
    for (const s of slots) {
      const st = gen.npcStations().find((n) => n.npc.id === 'hale' && gen.instanceAt(n.x, n.z) === s)!;
      expect(st, `slot ${s}`).toBeDefined();
      const e = gen.instanceEntry(s)!;
      expect(Math.hypot(st.x - e.x, st.z - e.z)).toBeLessThan(6);
      const x = Math.floor(st.x);
      const z = Math.floor(st.z);
      expect(IS_SOLID[blockAt(x, st.y - 1, z)]).toBe(1);
      expect(IS_SOLID[blockAt(x, st.y, z)]).toBe(0);
      expect(IS_SOLID[blockAt(x, st.y + 1, z)]).toBe(0);
      // No monster stands in the gatehall, and none near him.
      for (const m of gen.instanceMobs(s)) expect(Math.hypot(m.x - st.x, m.z - st.z), `${m.kind}`).toBeGreaterThan(15);
    }
  });

  it('asks for a Hollow Sigil, which a new copy uses up', () => {
    expect(gen.instanceRequirement()).toMatchObject({ item: I.HOLLOW_SIGIL, consume: true, level: DUNGEON_MIN_LEVEL });
  });

  it('puts the cages in grottoes off the main ways, and the strong monsters near the cages and the lava', () => {
    const mobs = gen.instanceMobs(0);
    expect(mobs.length).toBeGreaterThanOrEqual(40);
    expect(new Set(mobs.map((m) => m.kind)).size).toBeGreaterThanOrEqual(6);
    expect(mobs.filter((m) => m.elite).length).toBeGreaterThanOrEqual(6);
    for (const m of mobs) expect(m.kind).not.toBe('creeper');
    // The captain, in the cavern of lava, is the strongest of them.
    const top = [...mobs].sort((p, q) => (q.elite ?? 0) - (p.elite ?? 0))[0];
    expect(top.elite).toBeGreaterThanOrEqual(3);
    expect(top.y).toBeLessThan(gen.cellarY - 35);
  });

  it('is dark: no glowstone, no lanterns of souls, no lamps but torches (that players can pick up), lava and berries', () => {
    const lights = new Set<number>([B.GLOWSTONE, B.SOUL_LANTERN, B.SOUL_LANTERN_HANG, B.LANTERN, B.LANTERN_HANG]);
    const grid = gen.deep.grid;
    let torches = 0;
    for (let i = 0; i < grid.length; i++) {
      expect(lights.has(grid[i]), `block ${grid[i]} at ${i}`).toBe(false);
      if (grid[i] === B.TORCH) torches++;
    }
    expect(torches).toBeGreaterThan(0);
    expect(torches).toBeGreaterThanOrEqual(60);
    expect(torches).toBeLessThanOrEqual(260);
  });
  it('are free to dig and build in, but for the bars of the gates, the portal back and the bedrock walls; the world never keeps them', () => {
    for (const s of slots) {
      const b = gen.instanceBounds(s)!;
      const z = gen.roomZ + s * INSTANCE_STRIDE;
      expect(gen.isProtected(INSTANCE_X0 + 8, gen.cellarY + 2, z)).toBe(false);
      expect(gen.isProtected(INSTANCE_X0 + 40, gen.cellarY - 10, z + 10)).toBe(false);
      // The portal in the camp's wall.
      expect(gen.isProtected(INSTANCE_X0 + 4, gen.cellarY + 2, z)).toBe(true);
      // The bars of the gates.
      for (const g of gen.instanceGates(s)) for (const gb of g.boxes) expect(gen.isProtected(gb.x0, gb.y0, gb.z0), `slot ${s}: gate ${g.id}`).toBe(true);
      // The walls and the seals are bedrock, which nobody breaks.
      expect(gen.generateChunk(b.x0 >> 4, b.z0 >> 4)[blockIndex(b.x0 & 15, 100, b.z0 & 15)]).toBe(B.BEDROCK);
      for (const u of gen.deep.seals) {
        const c = gen.generateChunk((INSTANCE_X0 + u) >> 4, (z + 40) >> 4);
        expect(c[blockIndex((INSTANCE_X0 + u) & 15, 100, (z + 40) & 15)], `seal ${u}`).toBe(B.BEDROCK);
      }
    }
    const world = new HeadlessWorld(gen);
    const z = gen.roomZ + 3 * INSTANCE_STRIDE;
    expect(world.setBlock(INSTANCE_X0 + 8, gen.cellarY + 2, z, B.STONE)).toBe(true);
    expect(world.editedChunks().length).toBe(0);
    const other = new HeadlessWorld(gen);
    other.loadEdited([{ cx: (INSTANCE_X0 + 8) >> 4, cz: z >> 4, data: new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * 256).fill(B.DIRT) }]);
    expect(other.getBlock(INSTANCE_X0 + 8, gen.cellarY + 2, z)).toBe(B.AIR);
  });
});

interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Can somebody on foot get from one standing place to another, inside a box? */
function walk(world: HeadlessWorld, start: { x: number; y: number; z: number }, goal: { x: number; y: number; z: number }, box: Box): boolean {
  const solid = (x: number, y: number, z: number): boolean => IS_SOLID[world.getBlock(x, y, z)] === 1;
  const stands = (x: number, y: number, z: number): boolean => !solid(x, y, z) && !solid(x, y + 1, z) && solid(x, y - 1, z) && world.getBlock(x, y, z) !== B.WATER && world.getBlock(x, y, z) !== B.LAVA;
  const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
  const seen = new Set<string>([key(start.x, start.y, start.z)]);
  const queue: [number, number, number][] = [[start.x, start.y, start.z]];
  for (let head = 0; head < queue.length; head++) {
    const [x, y, z] = queue[head];
    if (x === goal.x && y === goal.y && z === goal.z) return true;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < box.x0 || nx > box.x1 || nz < box.z0 || nz > box.z1) continue;
      for (const dy of [1, 0, -1, -2, -3]) {
        const ny = y + dy;
        if (ny < 2 || seen.has(key(nx, ny, nz)) || !stands(nx, ny, nz)) continue;
        // Stepping up needs head room over the block you leave; stepping across or down needs the cells you pass through.
        if (dy === 1 && solid(x, y + 2, z)) continue;
        if (dy < 0 && (solid(nx, y, nz) || solid(nx, y + 1, nz))) continue;
        seen.add(key(nx, ny, nz));
        queue.push([nx, ny, nz]);
        break;
      }
    }
  }
  return false;
}

/** Everywhere somebody on foot can get to from a standing place, inside a box (as `walk`, but for the whole of it). */
function reachable(world: HeadlessWorld, start: { x: number; y: number; z: number }, box: Box): Set<string> {
  const solid = (x: number, y: number, z: number): boolean => IS_SOLID[world.getBlock(x, y, z)] === 1;
  const stands = (x: number, y: number, z: number): boolean => !solid(x, y, z) && !solid(x, y + 1, z) && solid(x, y - 1, z) && world.getBlock(x, y, z) !== B.WATER && world.getBlock(x, y, z) !== B.LAVA;
  const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
  const seen = new Set<string>([key(start.x, start.y, start.z)]);
  const queue: [number, number, number][] = [[start.x, start.y, start.z]];
  for (let head = 0; head < queue.length; head++) {
    const [x, y, z] = queue[head];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < box.x0 || nx > box.x1 || nz < box.z0 || nz > box.z1) continue;
      for (const dy of [1, 0, -1, -2, -3]) {
        const ny = y + dy;
        if (ny < 2 || seen.has(key(nx, ny, nz)) || !stands(nx, ny, nz)) continue;
        if (dy === 1 && solid(x, y + 2, z)) continue;
        if (dy < 0 && (solid(nx, y, nz) || solid(nx, y + 1, nz))) continue;
        seen.add(key(nx, ny, nz));
        queue.push([nx, ny, nz]);
        break;
      }
    }
  }
  return seen;
}
