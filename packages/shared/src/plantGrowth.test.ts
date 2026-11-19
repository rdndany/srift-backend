import { describe, expect, it } from 'vitest';
import { B, GROVE, growPlants, type PlantChunk } from './index';

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
});
