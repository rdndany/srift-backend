import { describe, expect, it } from 'vitest';
import { BLOCKS, B, MASONRY, MASONRY_NEXT, findRecipe, idByName, materialBlock, slabId, slabInfo, stairId, stairInfo, wallInfo } from './index';
import { collisionBoxes } from './shapes';
import { makeStack } from './inventory';
import { SMELTING } from './smelting';

describe('the rest of the slabs, stairs and walls', () => {
  it('adds one placeable shape for each of the 129, and keeps the ids clear of the campfire', () => {
    let shapes = 0;
    const ids = new Set<number>();
    for (const row of MASONRY) {
      if (row.spec.slab) shapes++;
      if (row.spec.stair) shapes++;
      if (row.spec.wall) shapes++;
      for (const id of [row.cubeId, row.slabBase, row.slabBase + 1, row.stairBase, row.wallId]) {
        if (id <= 0) continue;
        expect(ids.has(id), `${row.spec.name} ${id}`).toBe(false);
        ids.add(id);
      }
      if (row.stairBase >= 0) for (let k = 1; k < 8; k++) ids.add(row.stairBase + k);
    }
    expect(shapes).toBe(129);
    expect(Math.min(...ids)).toBeGreaterThan(B.CAMPFIRE_BASE + 7);
    expect(MASONRY_NEXT).toBeLessThan(2048);
    expect(BLOCKS[MASONRY_NEXT].id).toBe(MASONRY_NEXT);
  });

  it('crafts a birch plank from a birch log, and a slab, stairs and a wall from the block', () => {
    const grid = (cells: (number | null)[]) => cells.map((c) => (c === null ? null : makeStack(c)));
    const planks = idByName('birch_planks');
    expect(findRecipe(grid([B.BIRCH_LOG, null, null, null, null, null, null, null, null]), 3, 3)?.result).toEqual({ id: planks, count: 4 });
    expect(findRecipe(grid([planks, planks, planks, null, null, null, null, null, null]), 3, 3)?.result.id).toBe(idByName('birch_slab'));
    const wall = idByName('andesite_wall');
    expect(findRecipe(grid([B.ANDESITE, B.ANDESITE, B.ANDESITE, B.ANDESITE, B.ANDESITE, B.ANDESITE, null, null, null]), 3, 3)?.result).toEqual({ id: wall, count: 6 });
    const mat = slabInfo(idByName('birch_slab'))!;
    expect(slabId(mat.mat, true)).not.toBe(slabId(mat.mat, false));
    expect(stairInfo(stairId(mat.mat, false, 2))).toEqual({ mat: mat.mat, top: false, dir: 2 });
    expect(materialBlock(mat.mat)).toBe(planks);
    expect(wallInfo(wall)?.mat).toBeGreaterThan(4);
  });

  it('stands a wall a block and a half tall, and smelts a wooden slab into petrified oak', () => {
    const wall = idByName('cobblestone_wall');
    const boxes = collisionBoxes(wall, () => 0);
    expect(Math.max(...boxes.map((b) => b[4]))).toBeCloseTo(1.5);
    expect(SMELTING.get(idByName('wooden_slab'))).toBe(idByName('petrified_oak_slab'));
    expect(materialBlock(slabInfo(idByName('petrified_oak_slab'))!.mat)).toBe(0);
  });
});
