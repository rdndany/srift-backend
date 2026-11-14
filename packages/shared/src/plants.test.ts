import { describe, expect, it } from 'vitest';
import {
  ATLAS_COLS,
  ATLAS_ROWS,
  B,
  BLOCKS,
  CHUNK_SIZE,
  I,
  IS_SOLID,
  WORLD_HEIGHT,
  WorldGenerator,
  allItems,
  blockDrop,
  blockDrops,
  blockIndex,
  breakTime,
  canStayAt,
  computeLight,
  findRecipe,
  getItem,
  isTillable,
  isTorch,
  makeStack,
  placementFor,
  toolId,
  type BlockReader,
} from './index';

function reader(edits: Record<string, number> = {}): BlockReader & { set: (x: number, y: number, z: number, id: number) => void } {
  const m = new Map(Object.entries(edits));
  return {
    getBlock: (x, y, z) => m.get(`${x},${y},${z}`) ?? (y < 0 ? B.STONE : y === 0 ? B.GRASS : B.AIR),
    set: (x, y, z, id) => void m.set(`${x},${y},${z}`, id),
  };
}

describe('torches', () => {
  it('emit light and let light through', () => {
    for (const id of [B.TORCH, B.TORCH_PX, B.TORCH_NX, B.TORCH_PZ, B.TORCH_NZ]) {
      expect(BLOCKS[id].light).toBe(14);
      expect(BLOCKS[id].opaque).toBe(false);
      expect(BLOCKS[id].solid).toBe(false);
      expect(BLOCKS[id].shape).toBe('torch');
    }
    // A torch lights the cave around it.
    const W = 24;
    const H = 16;
    const idx = (x: number, y: number, z: number) => (y * W + z) * W + x;
    const b = new Uint16Array(W * H * W).fill(B.STONE);
    for (let x = 2; x < 22; x++) b[idx(x, 8, 12)] = B.AIR;
    b[idx(4, 8, 12)] = B.TORCH;
    const l = computeLight(b, W, H, W);
    expect(l[idx(4, 8, 12)] & 15).toBe(14);
    expect(l[idx(10, 8, 12)] & 15).toBe(8);
  });

  it('is placed upright on top faces and sideways on walls, never on ceilings', () => {
    expect(placementFor(B.TORCH, 0, 1, 0)).toBe(B.TORCH);
    expect(placementFor(B.TORCH, 0, -1, 0)).toBeNull();
    // Clicking the +x face of a wall: the wall is on the torch's -x side.
    expect(placementFor(B.TORCH, 1, 0, 0)).toBe(B.TORCH_NX);
    expect(placementFor(B.TORCH, -1, 0, 0)).toBe(B.TORCH_PX);
    expect(placementFor(B.TORCH, 0, 0, 1)).toBe(B.TORCH_NZ);
    expect(placementFor(B.TORCH, 0, 0, -1)).toBe(B.TORCH_PZ);
    expect(placementFor(B.STONE, 0, 0, 1)).toBe(B.STONE);
    expect(isTorch(B.TORCH_PZ)).toBe(true);
    expect(isTorch(B.STONE)).toBe(false);
  });

  it('falls off when its support disappears', () => {
    const w = reader({ '3,1,3': B.STONE });
    expect(canStayAt(B.TORCH, w, 3, 2, 3)).toBe(true);
    w.set(3, 1, 3, B.AIR);
    expect(canStayAt(B.TORCH, w, 3, 2, 3)).toBe(false);

    const wall = reader({ '5,3,4': B.STONE });
    expect(canStayAt(B.TORCH_PX, w, 4, 3, 4)).toBe(false);
    expect(canStayAt(B.TORCH_PX, wall, 4, 3, 4)).toBe(true);
    expect(canStayAt(B.TORCH_NX, wall, 4, 3, 4)).toBe(false);
  });

  it('wall torches drop a normal torch, and torches craft from coal and a stick', () => {
    expect(blockDrop(BLOCKS[B.TORCH_NZ], null)).toEqual({ id: B.TORCH, count: 1 });
    const r = findRecipe([makeStack(I.COAL), null, makeStack(I.STICK), null], 2, 2);
    expect(r?.result).toEqual({ id: B.TORCH, count: 4 });
  });

  it('only a torch and a redstone torch exist as torch items', () => {
    const torches = allItems().filter((i) => BLOCKS[i.block ?? 0]?.shape === 'torch');
    expect(torches.map((t) => t.id)).toEqual([B.TORCH, B.RTORCH_BASE + 1]);
  });
});

describe('plants', () => {
  it('flowers and grass need soil and are replaceable and instant to break', () => {
    const w = reader();
    for (const id of [B.TALL_GRASS, B.ROSE, B.DANDELION]) {
      expect(canStayAt(id, w, 2, 1, 2)).toBe(true); // on grass
      w.set(2, 0, 2, B.STONE);
      expect(canStayAt(id, w, 2, 1, 2)).toBe(false);
      w.set(2, 0, 2, B.SAND);
      expect(canStayAt(id, w, 2, 1, 2)).toBe(false);
      w.set(2, 0, 2, B.DIRT);
      expect(canStayAt(id, w, 2, 1, 2)).toBe(true);
      w.set(2, 0, 2, B.GRASS);
      expect(BLOCKS[id].replaceable).toBe(true);
      expect(BLOCKS[id].solid).toBe(false);
      expect(breakTime(BLOCKS[id], null)).toBe(0);
    }
  });

  it('tall grass sometimes drops seeds; flowers drop themselves', () => {
    expect(blockDrop(BLOCKS[B.TALL_GRASS], null, () => 0.9)).toBeNull();
    expect(blockDrop(BLOCKS[B.TALL_GRASS], null, () => 0.01)).toEqual({ id: I.WHEAT_SEEDS, count: 1 });
    expect(blockDrop(BLOCKS[B.ROSE], null)).toEqual({ id: B.ROSE, count: 1 });
  });

  it('worldgen scatters plants only on grass with open air above, deterministically', () => {
    const gen = new WorldGenerator(1337);
    let plants = 0;
    let flowers = 0;
    for (let cx = -3; cx <= 3; cx++) {
      for (let cz = -3; cz <= 3; cz++) {
        const a = gen.generateChunk(cx, cz);
        const b = gen.generateChunk(cx, cz);
        expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).toBe(0);
        for (let y = 1; y < WORLD_HEIGHT; y++) {
          for (let z = 0; z < CHUNK_SIZE; z++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
              const id = a[blockIndex(x, y, z)];
              if (BLOCKS[id].shape !== 'cross') continue;
              plants++;
              if (id !== B.TALL_GRASS) flowers++;
              // Every plant stands on what its own rule allows (sugar cane at the water's edge is judged by its soil alone).
              if (id === B.SUGAR_CANE) expect(IS_SOLID[a[blockIndex(x, y - 1, z)]] === 1 || a[blockIndex(x, y - 1, z)] === B.SUGAR_CANE).toBe(true);
              else expect(canStayAt(id, { getBlock: (bx, by, bz) => (bx < 0 || bx >= CHUNK_SIZE || bz < 0 || bz >= CHUNK_SIZE || by < 0 || by >= WORLD_HEIGHT ? B.AIR : a[blockIndex(bx, by, bz)]) }, x, y, z), `plant ${id} at ${x},${y},${z}`).toBe(true);
            }
          }
        }
      }
    }
    expect(plants).toBeGreaterThan(100);
    expect(flowers).toBeGreaterThan(0);
  });
});

describe('farming', () => {
  it('only grass, dirt and snowy grass can be tilled', () => {
    expect(isTillable(B.GRASS)).toBe(true);
    expect(isTillable(B.DIRT)).toBe(true);
    expect(isTillable(B.SNOW)).toBe(true);
    expect(isTillable(B.SAND)).toBe(false);
    expect(isTillable(B.STONE)).toBe(false);
  });

  it('seeds plant a sprout that only survives on farmland', () => {
    const seeds = getItem(I.WHEAT_SEEDS);
    expect(seeds.block).toBe(B.WHEAT_0);
    const w = reader({ '1,0,1': B.FARMLAND });
    expect(canStayAt(B.WHEAT_0, w, 1, 1, 1)).toBe(true);
    expect(canStayAt(B.WHEAT_0, w, 2, 1, 2)).toBe(false); // plain grass
    w.set(1, 0, 1, B.AIR);
    expect(canStayAt(B.WHEAT_2, w, 1, 1, 1)).toBe(false);
  });

  it('young wheat gives a seed back; ripe wheat gives wheat and 1-3 seeds', () => {
    expect(blockDrops(BLOCKS[B.WHEAT_1], null)).toEqual([{ id: I.WHEAT_SEEDS, count: 1 }]);
    const ripe = blockDrops(BLOCKS[B.WHEAT_3], null, () => 0.99);
    expect(ripe).toEqual([
      { id: I.WHEAT, count: 1 },
      { id: I.WHEAT_SEEDS, count: 3 },
    ]);
    expect(blockDrops(BLOCKS[B.WHEAT_3], null, () => 0)[1].count).toBe(1);
    expect(blockDrops(BLOCKS[B.STONE], null)).toEqual([]);
  });

  it('farmland drops dirt', () => {
    expect(blockDrop(BLOCKS[B.FARMLAND], null)).toEqual({ id: B.DIRT, count: 1 });
  });

  it('crafts hoes from every material, and bread from three wheat', () => {
    const hoe = findRecipe([makeStack(B.PLANKS), makeStack(B.PLANKS), null, makeStack(I.STICK), null, makeStack(I.STICK)], 2, 3);
    expect(hoe?.result.id).toBe(toolId('hoe', 'wood'));
    const mirrored = findRecipe([makeStack(I.DIAMOND), makeStack(I.DIAMOND), makeStack(I.STICK), null, makeStack(I.STICK), null], 2, 3);
    expect(mirrored?.result.id).toBe(toolId('hoe', 'diamond'));

    const bread = findRecipe([makeStack(I.WHEAT), makeStack(I.WHEAT), makeStack(I.WHEAT), null, null, null, null, null, null], 3, 3);
    expect(bread?.result).toEqual({ id: I.BREAD, count: 1 });
    expect(getItem(I.BREAD).food?.hunger).toBe(5);
  });

  it('keeps every tile index inside the atlas', () => {
    for (const item of allItems()) expect(item.tile).toBeLessThan(ATLAS_COLS * ATLAS_ROWS);
    // The mesher keeps a block's tile in nine bits.
    for (const b of BLOCKS) for (const t of [b.tiles.top, b.tiles.bottom, b.tiles.side]) expect(t).toBeLessThan(512);
    expect(getItem(toolId('hoe', 'iron')).tool?.kind).toBe('hoe');
  });
});
