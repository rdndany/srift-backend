import { describe, expect, it } from 'vitest';
import { B, BLOCK_COUNT, GROVE, GROVE_NEXT, I, findRecipe, growColumn, growTree, idByName, makeStack, mulberry32, strippedOf } from './index';

describe('bamboo, mangrove and pale oak', () => {
  it('fits after the earlier woods', () => {
    expect(GROVE.azalea).toBeGreaterThan(0);
    expect(GROVE_NEXT).toBeLessThan(BLOCK_COUNT);
    expect(idByName('mangrove_log')).toBe(GROVE.mangrove.log);
    expect(idByName('pale_oak_sapling')).toBe(GROVE.paleOak.sapling);
    expect(idByName('bamboo_mosaic_stairs')).toBe(GROVE.mosaicStair);
    expect(idByName('stripped_bamboo_block')).toBe(GROVE.bambooWood.strippedLog);
  });

  it('crafts the wood and strips the logs', () => {
    const grid = (ids: (number | null)[]) => ids.map((id) => (id == null ? null : makeStack(id, 1)));
    const bamboo = GROVE.bamboo;
    expect(findRecipe(grid([bamboo, bamboo, bamboo, bamboo, bamboo, bamboo, bamboo, bamboo, bamboo]), 3, 3)?.result.id).toBe(GROVE.bambooWood.log);
    expect(findRecipe(grid([GROVE.bambooWood.log]), 1, 1)?.result).toEqual({ id: GROVE.bambooWood.planks, count: 2 });
    expect(strippedOf(GROVE.mangrove.log)).toBe(idByName('stripped_mangrove_log'));
    expect(strippedOf(GROVE.paleOak.wood)).toBe(idByName('stripped_pale_oak_wood'));
    const packed = findRecipe(grid([B.MUD, I.WHEAT, null, null, null, null, null, null, null]), 3, 3);
    expect(packed?.result.id).toBe(GROVE.packedMud);
  });

  it('grows a mangrove from a propagule and a stalk of bamboo', () => {
    const cells = new Map<string, number>();
    const world = {
      getBlock: (x: number, y: number, z: number) => cells.get(`${x},${y},${z}`) ?? (y === 0 ? B.MUD : B.AIR),
      setBlock(x: number, y: number, z: number, id: number) {
        cells.set(`${x},${y},${z}`, id);
        return true;
      },
    };
    world.setBlock(0, 1, 0, GROVE.mangrove.sapling);
    expect(growTree(world, 0, 1, 0, mulberry32(4))).toBe(true);
    expect(world.getBlock(0, 1, 0)).toBe(GROVE.mangroveRoots);
    expect(world.getBlock(0, 2, 0)).toBe(GROVE.mangrove.log);
    world.setBlock(2, 1, 0, GROVE.bamboo);
    expect(growColumn(world, 2, 1, 0, GROVE.bamboo)).toBe(true);
    expect(world.getBlock(2, 2, 0)).toBe(GROVE.bamboo);
  });
});
