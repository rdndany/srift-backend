import { describe, expect, it } from 'vitest';
import { B, BLOCK_COUNT, BLOCKS, DRESS, DRESS_NEXT, DYE_NAMES, I, SMELTING, bannerId, blockDrops, candleId, candleInfo, canStayAt, dyeId, findRecipe, idByName, makeStack, placementFor, pottedOf, signId, terracottaOf } from './index';

describe('dressing for castles, streets and caves', () => {
  const grid = (ids: (number | null)[]) => ids.map((id) => (id == null ? null : makeStack(id, 1)));

  it('fits after the plants and stays inside the block table', () => {
    expect(DRESS.crackedStone).toBeGreaterThan(0);
    expect(DRESS_NEXT).toBeLessThan(BLOCK_COUNT);
    expect(idByName('cracked_stone_bricks')).toBe(DRESS.crackedStone);
    expect(idByName('chiseled_deepslate')).toBe(DRESS.chiseledDeepslate);
    expect(idByName('white_stained_glass')).toBe(DRESS.glass);
    expect(idByName('black_concrete')).toBe(DRESS.concrete + 15);
    expect(idByName('candle')).toBe(DRESS.plainCandle);
    expect(idByName('oak_sign')).toBe(DRESS.signs[0].standing);
    expect(BLOCKS[DRESS.ironBars].shape).toBe('pane');
    expect(BLOCKS[DRESS.carpet].shape).toBe('flat');
  });

  it('crafts the coloured blocks, the bars, the candle, the banner, the pot and a sign', () => {
    const dye = (name: (typeof DYE_NAMES)[number]) => dyeId(DYE_NAMES.indexOf(name));
    expect(dye('white')).toBeGreaterThan(0);
    expect(findRecipe(grid([B.GLASS, B.GLASS, B.GLASS, B.GLASS, dye('red'), B.GLASS, B.GLASS, B.GLASS, B.GLASS]), 3, 3)?.result).toEqual({ id: DRESS.glass + DYE_NAMES.indexOf('red'), count: 8 });
    expect(findRecipe(grid([B.WOOL, B.WOOL]), 2, 1)?.result).toEqual({ id: DRESS.carpet, count: 3 });
    expect(findRecipe(grid([B.SAND, B.SAND, B.SAND, B.SAND, B.GRAVEL, B.GRAVEL, B.GRAVEL, B.GRAVEL, dye('blue')]), 3, 3)?.result.id).toBe(DRESS.concrete + DYE_NAMES.indexOf('blue'));
    expect(findRecipe(grid([I.IRON_INGOT, I.IRON_INGOT, I.IRON_INGOT, I.IRON_INGOT, I.IRON_INGOT, I.IRON_INGOT]), 3, 2)?.result).toEqual({ id: DRESS.ironBars, count: 16 });
    expect(findRecipe(grid([I.STRING, I.COAL]), 1, 2)?.result).toEqual({ id: DRESS.plainCandle, count: 1 });
    expect(findRecipe(grid([B.WOOL, B.WOOL, B.WOOL, B.WOOL, B.WOOL, B.WOOL, null, I.STICK, null]), 3, 3)?.result.id).toBe(DRESS.bannerFloor);
    expect(findRecipe(grid([idByName('bricks')]), 1, 1)?.result).toEqual({ id: DRESS.pot, count: 4 });
    const oak = DRESS.signs[0];
    expect(findRecipe(grid([idByName(oak.plank), idByName(oak.plank), idByName(oak.plank), idByName(oak.plank), idByName(oak.plank), idByName(oak.plank), null, I.STICK, null]), 3, 3)?.result).toEqual({ id: oak.standing, count: 3 });
  });

  it('smelts cracked bricks and glazed clay, and a pot gives back the flower', () => {
    expect(SMELTING.get(B.STONE_BRICKS)).toBe(DRESS.crackedStone);
    expect(SMELTING.get(B.TERRACOTTA_WHITE)).toBe(DRESS.glazed);
    expect(terracottaOf(DYE_NAMES.indexOf('magenta'))).toBe(idByName('magenta_terracotta'));
    expect(terracottaOf(DYE_NAMES.indexOf('white'))).toBe(B.TERRACOTTA_WHITE);
    const four = candleId(-1, 4);
    expect(candleInfo(four)?.count).toBe(4);
    expect(blockDrops(BLOCKS[four], null, () => 0)).toEqual([{ id: DRESS.plainCandle, count: 4 }]);
    const planted = pottedOf(B.DANDELION);
    expect(planted).toBeGreaterThan(0);
    expect(blockDrops(BLOCKS[planted], null, () => 0)).toEqual([{ id: DRESS.pot, count: 1 }, { id: B.DANDELION, count: 1 }]);
  });

  it('stands a sign on the floor and hangs a banner on a wall', () => {
    const cells = new Map<string, number>();
    const world = {
      getBlock: (x: number, y: number, z: number) => cells.get(`${x},${y},${z}`) ?? B.AIR,
      setBlock(x: number, y: number, z: number, id: number) {
        cells.set(`${x},${y},${z}`, id);
        return true;
      },
    };
    world.setBlock(0, 0, 0, B.STONE);
    const sign = placementFor(DRESS.signs[0].standing, 0, 1, 0, 0);
    expect(sign).toBe(signId(0, 3, false));
    expect(canStayAt(sign!, world, 0, 1, 0)).toBe(true);
    expect(canStayAt(sign!, world, 0, 3, 0)).toBe(false);
    const wall = placementFor(DRESS.bannerFloor, 1, 0, 0, 0);
    expect(wall).toBe(bannerId(0, 1, true));
    world.setBlock(0, 1, 0, B.STONE_BRICKS);
    expect(canStayAt(wall!, world, 1, 1, 0)).toBe(true);
  });
});
