import { describe, expect, it } from 'vitest';
import { ADVENTURE_SEED, B, CHUNK_SIZE, HUB_HALF, IS_SOLID, NPCS, SPAWN_X0, SPAWN_Z0, blockIndex, makeGenerator, type AdventureWorldGenerator } from './index';
import { ladderId } from './blocks';
import { GATES, WALL_FIRST, WALL_LAST } from './villageWall';

const gen = makeGenerator(ADVENTURE_SEED, 'adventure') as AdventureWorldGenerator;
const chunks = new Map<string, Uint16Array>();
const blockAt = (x: number, y: number, z: number): number => {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cz = Math.floor(z / CHUNK_SIZE);
  const k = `${cx},${cz}`;
  let c = chunks.get(k);
  if (!c) chunks.set(k, (c = gen.generateChunk(cx, cz)));
  return c[blockIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)];
};
const LADDERS = new Set([0, 1, 2, 3].map(ladderId));
const solid = (x: number, y: number, z: number): boolean => IS_SOLID[blockAt(x, y, z)] === 1;
const ladder = (x: number, y: number, z: number): boolean => LADDERS.has(blockAt(x, y, z));

/** Every place a player can get to on foot (or by ladder) from the Landing, within a box round the village. */
function reachable(): Set<string> {
  const g = gen.hubY;
  const seen = new Set<string>();
  const queue: [number, number, number][] = [];
  const stand = (x: number, y: number, z: number): boolean => {
    if (solid(x, y, z) || solid(x, y + 1, z)) return false;
    return solid(x, y - 1, z) || ladder(x, y, z);
  };
  const visit = (x: number, y: number, z: number): void => {
    const k = `${x},${y},${z}`;
    if (seen.has(k)) return;
    seen.add(k);
    queue.push([x, y, z]);
  };
  visit(SPAWN_X0 + 3, g + 1, SPAWN_Z0 + 3);
  const LIM = HUB_HALF + 8;
  for (let head = 0; head < queue.length; head++) {
    const [x, y, z] = queue[head];
    if (ladder(x, y, z)) {
      if (!solid(x, y + 1, z) && y + 1 < g + 14) visit(x, y + 1, z);
      if (ladder(x, y - 1, z)) visit(x, y - 1, z);
    }
    if (!solid(x, y - 1, z) && ladder(x, y - 1, z)) visit(x, y - 1, z);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const nz = z + dz;
      if (Math.abs(nx) > LIM || Math.abs(nz) > LIM) continue;
      // Level, one step up (a jump), or a fall of up to three blocks.
      for (const ny of [y, y + 1, y - 1, y - 2, y - 3]) {
        if (!stand(nx, ny, nz)) continue;
        if (ny === y + 1 && (solid(x, y + 2, z) || solid(nx, y + 1, nz) )) continue;
        // The way through the block in between has to be open at the height of the move.
        if (ny < y && (solid(nx, y, nz) || solid(nx, y + 1, nz))) continue;
        visit(nx, ny, nz);
        break;
      }
    }
  }
  return seen;
}

describe("Dawnwatch's wall and its gates", () => {
  const g = gen.hubY;
  const seen = reachable();
  const anyAt = (pred: (x: number, z: number, y: number) => boolean): boolean => [...seen].some((k) => {
    const [x, y, z] = k.split(',').map(Number);
    return pred(x, z, y - g);
  });

  it('is a palisade of logs on a stone footing with stakes along its top', () => {
    for (const [x, z] of [[-20, WALL_LAST], [20, WALL_FIRST], [WALL_LAST, 20], [WALL_FIRST, -20]]) {
      expect([B.COBBLE, B.MOSSY_COBBLE], `footing at ${x},${z}`).toContain(blockAt(x, g + 1, z));
      for (let y = 3; y <= 5; y++) expect(blockAt(x, g + y, z), `log at ${x},${g + y},${z}`).toBe(B.SPRUCE_LOG);
      expect(blockAt(x, g + 6, z)).toBe(B.FENCE);
    }
  });

  it('has a walkway behind it, and the ground is not solid up there only on the way through the gates', () => {
    for (const [x, z] of [[-20, WALL_LAST - 1], [20, WALL_FIRST + 1], [WALL_LAST - 1, 20], [WALL_FIRST + 1, -20]]) {
      expect(blockAt(x, g + 3, z)).toBe(B.PLANKS);
      expect(solid(x, g + 4, z)).toBe(false);
    }
  });

  it('opens the south, east and west gates onto the roads: wide open, with a paved floor', () => {
    for (const [side, half] of [['S', GATES.S.half], ['E', GATES.E.half], ['W', GATES.W.half]] as const) {
      expect(GATES[side].open).toBe(true);
      for (let u = -half; u <= half; u++) {
        for (let depth = 0; depth < 4; depth++) {
          const x = side === 'E' ? WALL_LAST - depth : side === 'W' ? WALL_FIRST + depth : u;
          const z = side === 'S' ? WALL_LAST - depth : u;
          expect(solid(x, g, z), `floor of the ${side} gate at ${x},${z}`).toBe(true);
          // (The portcullis hangs from the lintel, its bars ending at the height of a raised hand.)
          for (let y = 1; y <= 3; y++) expect(solid(x, g + y, z), `${side} gate open at ${x},${g + y},${z}`).toBe(false);
        }
      }
    }
  });

  it('keeps the north gate shut', () => {
    expect(GATES.N.open).toBe(false);
    for (let x = -GATES.N.half; x <= GATES.N.half; x++) for (let y = 1; y <= 5; y++) expect(solid(x, g + y, WALL_FIRST), `door at ${x},${g + y}`).toBe(true);
  });

  it('lets a player walk from the Landing to every quest giver and out through the three open gates, but not out the north', () => {
    for (const npc of NPCS) {
      if (npc.cellar || npc.dungeon) continue;
      expect(seen.has(`${Math.floor(npc.x)},${g + 1},${Math.floor(npc.z)}`), `${npc.id} can be reached`).toBe(true);
    }
    expect(anyAt((x) => x > HUB_HALF + 1)).toBe(true);
    expect(anyAt((x) => x < -HUB_HALF - 1)).toBe(true);
    expect(anyAt((_x, z) => z > HUB_HALF + 1)).toBe(true);
    // The north gate is shut: nobody gets into its way, from the garden or from outside.
    expect(anyAt((x, z, y) => Math.abs(x) <= GATES.N.half && z <= WALL_FIRST + 1 && z >= WALL_FIRST && y <= 5)).toBe(false);
    expect(seen.has(`0,${g + 1},-34`)).toBe(true);
  });

  it('can be climbed: a ladder in each corner tower up to its roof and the walkway, and one in each gate tower', () => {
    const roofs = [[WALL_FIRST + 2, WALL_FIRST + 2], [WALL_LAST - 2, WALL_FIRST + 2], [WALL_FIRST + 2, WALL_LAST - 2], [WALL_LAST - 2, WALL_LAST - 2]];
    for (const [x, z] of roofs) expect(seen.has(`${x},${g + 9},${z}`), `the roof of the tower at ${x},${z}`).toBe(true);
    // The walkway on every side, between the towers.
    for (const [x, z] of [[-37, 20], [36, -20], [-20, 36], [20, -37]]) expect(seen.has(`${x},${g + 4},${z}`), `the walkway at ${x},${z}`).toBe(true);
    for (const side of ['S', 'E', 'W', 'N'] as const) {
      const half = GATES[side].half + 3;
      const [x, z] = side === 'S' ? [half + 1, WALL_LAST - 4] : side === 'N' ? [half + 1, WALL_FIRST + 4] : side === 'E' ? [WALL_LAST - 4, half + 1] : [WALL_FIRST + 4, half + 1];
      let top = 0;
      for (let y = 1; y <= 10; y++) if (ladder(x, g + y, z)) top = y;
      expect(top, `ladder of the ${side} gate tower at ${x},${z}`).toBeGreaterThanOrEqual(9);
    }
  });

  it('leaves the ground inside the wall open for the roads: no block in the way at the height of a head', () => {
    for (const [x, z] of [[8, 0], [20, 0], [-20, 0], [0, 25], [0, -8], [0, -20]]) {
      expect(solid(x, g + 1, z), `${x},${z}`).toBe(false);
      expect(solid(x, g + 2, z), `${x},${z}`).toBe(false);
    }
  });
});
