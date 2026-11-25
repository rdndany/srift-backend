import { describe, expect, it } from 'vitest';
import { B, GROVE, SAPLING_GROW_SECONDS, cropGrowthSeconds, growPlants, type PlantChunk } from './index';

/** One edited chunk with a few blocks set in it. */
function chunk(blocks: Record<number, number>): PlantChunk {
  const data = new Uint16Array(16 * 16 * 256);
  for (const [i, id] of Object.entries(blocks)) data[Number(i)] = id;
  return { cx: 0, cz: 0, data, modified: true };
}

describe('growing plants over time', () => {
  it('leaves an azalea alone: it neither grows into a tree nor turns into some other block', () => {
    const c = chunk({ 300: GROVE.azalea, 301: B.FLOWERING_AZALEA });
    const edits: number[] = [];
    const world = { getBlock: () => 0, setBlock: (_x: number, _y: number, _z: number, id: number) => (edits.push(id), true) };
    for (let i = 0; i < 400; i++) growPlants([c], world, 2, () => 0);
    expect(edits).toEqual([]);
    expect(c.data[300]).toBe(GROVE.azalea);
    expect(c.data[301]).toBe(B.FLOWERING_AZALEA);
  });

  it('ripens a young crop by one stage, and skips chunks nobody edited', () => {
    const edits: number[] = [];
    const world = { getBlock: () => 0, setBlock: (_x: number, _y: number, _z: number, id: number) => (edits.push(id), true) };
    expect(growPlants([chunk({ 300: B.WHEAT_0 })], world, 2, () => 0)).toBe(1);
    expect(edits).toEqual([B.WHEAT_0 + 1]);
    expect(growPlants([{ ...chunk({ 300: B.WHEAT_0 }), modified: false }], world, 2, () => 0)).toBe(0);
    expect(growPlants([chunk({ 300: B.WHEAT_3 })], world, 2, () => 0)).toBe(0);
  });

  it('reports every fire it finds', () => {
    const fires: number[][] = [];
    const world = { getBlock: () => 0, setBlock: () => true };
    growPlants([chunk({ 0x123: B.FIRE })], world, 2, () => 1, (x, y, z) => fires.push([x, y, z]));
    expect(fires).toEqual([[3, 1, 2]]);
  });

  it('waits about as long as Minecraft before a sapling or a seed grows', () => {
    expect(SAPLING_GROW_SECONDS).toBeCloseTo((4096 / 60) * 7, 5);
    const lone = { getBlock: (x: number, y: number, z: number) => (x === 0 && y === 0 && z === 0 ? B.FARMLAND : B.DIRT) };
    const plot = {
      getBlock: (x: number, y: number, z: number) => (y === 0 && Math.abs(x) <= 1 && Math.abs(z) <= 1 ? B.FARMLAND : B.DIRT),
    };
    const row = {
      getBlock: (x: number, y: number, z: number) => {
        if (y === 1 && z === 0 && Math.abs(x) <= 1) return B.WHEAT_0;
        if (y === 0 && Math.abs(x) <= 1 && Math.abs(z) <= 1) return B.FARMLAND;
        return B.DIRT;
      },
    };
    // One moist block: seven random ticks per age, and seven ages spread over three pictures.
    expect(cropGrowthSeconds(lone, 0, 1, 0, B.WHEAT_0)).toBeCloseTo((4096 / 60) * 7 * (7 / 3), 4);
    // A 3 by 3 of farmland is the fast farm: about eight minutes a picture, about 24 minutes to ripe.
    expect(cropGrowthSeconds(plot, 0, 1, 0, B.WHEAT_0)).toBeCloseTo((4096 / 60) * 7, 4);
    // A straight row grows half as fast.
    expect(cropGrowthSeconds(row, 0, 1, 0, B.WHEAT_0)).toBeCloseTo((4096 / 60) * 14, 4);
    const world = {
      getBlock: (x: number, y: number, z: number) => (x === (300 & 15) && y === (300 >> 8) && z === ((300 >> 4) & 15) ? B.SAPLING : B.DIRT),
      setBlock: () => true,
    };
    const sapling = chunk({ 300: B.SAPLING });
    let rolls = 0;
    expect(growPlants([sapling], world, 2, () => {
      rolls++;
      return 0.5;
    })).toBe(0);
    expect(rolls).toBe(1);
  });
});
