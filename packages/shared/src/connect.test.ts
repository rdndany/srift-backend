import { describe, expect, it } from 'vitest';
import { B, BLOCKS, CONNECT, IS_LOG, MASONRY, RECIPES, materialBlock, placementFor, slabId, slabInfo, stairId, stairInfo, strippedOf } from './index';
import { collisionBoxes, type Box } from './shapes';

const LOW = 14 / 16;

/** Neighbours of one wall. (0, 0) is the wall itself, so a neighbour can see back to it. */
function shape(self: number, e = 0, w = 0, s = 0, n = 0, above = 0): readonly Box[] {
  const spot = (dx: number, dz: number): number => {
    if (dx === 0 && dz === 0) return self;
    if (dx === 1 && dz === 0) return e;
    if (dx === -1 && dz === 0) return w;
    if (dx === 0 && dz === 1) return s;
    if (dx === 0 && dz === -1) return n;
    return 0;
  };
  return collisionBoxes(
    self,
    (dx, dz) => spot(dx, dz),
    (dx, dy, dz) => (dy === 1 && dx === 0 && dz === 0 ? above : dy === 0 ? spot(dx, dz) : 0),
  );
}

const posted = (boxes: readonly Box[]): boolean => boxes.some((b) => b[4] === 1.5);

describe('each building block connects in its own way', () => {
  const stone = MASONRY.find((row) => row.spec.name === 'stone_brick')!.wallId;
  const deep = MASONRY.find((row) => row.spec.name === 'deepslate_bricks')!.wallId;
  const sand = MASONRY.find((row) => row.spec.name === 'sandstone')!.wallId;

  it('keeps a post on a lone wall, a corner, a T and a cross, and drops it on a straight run', () => {
    expect(posted(shape(stone))).toBe(true);
    expect(shape(stone)).toEqual([[4 / 16, 0, 4 / 16, 12 / 16, 1.5, 12 / 16]]);
    expect(posted(shape(stone, stone, 0, stone))).toBe(true);
    expect(posted(shape(stone, stone, stone, stone))).toBe(true);
    expect(posted(shape(stone, stone, stone, stone, stone))).toBe(true);
    const run = shape(stone, 0, 0, stone, stone);
    expect(posted(run)).toBe(false);
    expect(run).toEqual([[5 / 16, 0, 0, 11 / 16, LOW, 1]]);
    expect(shape(deep, deep, deep)).toEqual([[0, 0, 5 / 16, 1, LOW, 11 / 16]]);
    expect(shape(sand, 0, 0, sand, sand)).toEqual([[5 / 16, 0, 0, 11 / 16, LOW, 1]]);
    expect(shape(CONNECT.netherWall, 0, 0, CONNECT.netherWall, CONNECT.netherWall)).toEqual([[5 / 16, 0, 0, 11 / 16, LOW, 1]]);
  });

  it('puts the post back when a block sits on a straight wall, and rises to meet a solid block', () => {
    expect(posted(shape(stone, 0, 0, stone, stone, B.STONE))).toBe(true);
    expect(shape(stone, 0, 0, B.STONE_BRICKS, B.STONE_BRICKS)).toEqual([[5 / 16, 0, 0, 11 / 16, 1, 1]]);
  });

  it('leaves full cubes as cubes, and lets their stairs and slabs do the connecting', () => {
    for (const id of [B.STONE_BRICKS, B.SANDSTONE, CONNECT.netherBricks, CONNECT.quartz]) {
      expect(BLOCKS[id].shape).toBe('cube');
    }
    expect(BLOCKS[MASONRY.find((row) => row.spec.name === 'deepslate_bricks')!.cubeId].shape).toBe('cube');
    expect(materialBlock(slabInfo(slabId(4, false))!.mat)).toBe(B.STONE_BRICKS);
    expect(materialBlock(slabInfo(CONNECT.netherSlab)!.mat)).toBe(CONNECT.netherBricks);
    expect(materialBlock(slabInfo(CONNECT.quartzSlab)!.mat)).toBe(CONNECT.quartz);
    const stair = stairInfo(CONNECT.netherStair)!;
    const east = stairId(stair.mat, false, 0);
    const straight = collisionBoxes(east, () => 0);
    const corner = collisionBoxes(east, (dx, dz) => (dx === 1 && dz === 0 ? stairId(stair.mat, false, 2) : 0));
    expect(corner).not.toEqual(straight);
  });

  it('lays a log or a quartz pillar along the face it was placed on', () => {
    expect(placementFor(B.LOG, 0, 1, 0)).toBe(B.LOG);
    const east = placementFor(B.LOG, 1, 0, 0)!;
    const north = placementFor(B.LOG, 0, 0, -1)!;
    expect(BLOCKS[east].axis).toBe(0);
    expect(BLOCKS[north].axis).toBe(2);
    expect(BLOCKS[east].tiles).toEqual(BLOCKS[B.LOG].tiles);
    expect(IS_LOG[east]).toBe(1);
    expect(BLOCKS[strippedOf(east)].axis).toBe(0);
    expect(placementFor(CONNECT.quartz, 1, 0, 0)).toBe(CONNECT.quartz);
    expect(placementFor(CONNECT.quartzPillar, 0, -1, 0)).toBe(CONNECT.quartzPillar);
    const side = placementFor(CONNECT.quartzPillar, 0, 0, 1)!;
    expect(BLOCKS[side].axis).toBe(2);
    expect(BLOCKS[side].tiles.top).toBe(BLOCKS[CONNECT.quartzPillar].tiles.top);
    expect(BLOCKS[side].tiles.side).toBe(BLOCKS[CONNECT.quartzPillar].tiles.side);
  });

  it('can be crafted', () => {
    expect(RECIPES.some((r) => r.result.id === CONNECT.netherBricks && r.result.count === 4)).toBe(true);
    expect(RECIPES.some((r) => r.result.id === CONNECT.quartz && r.result.count === 4)).toBe(true);
    expect(RECIPES.some((r) => r.result.id === CONNECT.quartzPillar && r.result.count === 2)).toBe(true);
    expect(RECIPES.some((r) => r.result.id === CONNECT.netherWall)).toBe(true);
  });
});
