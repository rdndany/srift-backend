import { describe, expect, it } from 'vitest';
import { B, CHUNK_SIZE, WORLD_HEIGHT } from '@solrift/shared';
import { columnAt, paintArea, shadeColumn, type MapSource, type RGB } from './mapData';

/** A world of chunks made by hand: `fill(cx, cz, fn)` sets the block at every (x, y, z) from `fn`. */
function makeWorld(): { src: MapSource; set(x: number, y: number, z: number, id: number): void; load(cx: number, cz: number): void } {
  const chunks = new Map<string, Uint16Array>();
  const key = (cx: number, cz: number): string => `${cx},${cz}`;
  const load = (cx: number, cz: number): Uint16Array => {
    let c = chunks.get(key(cx, cz));
    if (!c) chunks.set(key(cx, cz), (c = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT)));
    return c;
  };
  return {
    src: { chunk: (cx, cz) => chunks.get(key(cx, cz)) ?? null },
    set: (x, y, z, id) => {
      load(x >> 4, z >> 4)[(y * CHUNK_SIZE + (z & 15)) * CHUNK_SIZE + (x & 15)] = id;
    },
    load: (cx, cz) => void load(cx, cz),
  };
}

const color = (id: number): RGB => (id === B.STONE ? [100, 100, 100] : id === B.GRASS ? [100, 160, 60] : [200, 200, 200]);

describe('columnAt', () => {
  it('finds the top block, skipping air and walk-through plants', () => {
    const w = makeWorld();
    w.set(3, 10, 4, B.STONE);
    w.set(3, 11, 4, B.GRASS);
    w.set(3, 12, 4, B.TALL_GRASS);
    const c = columnAt(w.src, 3, 4);
    expect(c.id).toBe(B.GRASS);
    expect(c.y).toBe(11);
  });

  it('looks down from the given height: the floor of a cave, not its roof', () => {
    const w = makeWorld();
    w.set(5, 20, 5, B.STONE); // the roof
    w.set(5, 10, 5, B.STONE); // the floor
    expect(columnAt(w.src, 5, 5).y).toBe(20);
    expect(columnAt(w.src, 5, 5, 14).y).toBe(10);
  });

  it('measures how deep water is', () => {
    const w = makeWorld();
    w.set(1, 5, 1, B.STONE);
    for (let y = 6; y <= 9; y++) w.set(1, y, 1, B.WATER);
    const c = columnAt(w.src, 1, 1);
    expect(c.id).toBe(B.WATER);
    expect(c.y).toBe(9);
    expect(c.depth).toBe(4);
  });

  it('says nothing for a chunk that is not loaded or a column with nothing in it', () => {
    const w = makeWorld();
    w.load(0, 0);
    expect(columnAt(w.src, 2, 2).y).toBe(-1);
    expect(columnAt(w.src, 400, 400).y).toBe(-1);
  });
});

describe('shadeColumn', () => {
  it('lightens ground that is higher than the ground to its north-west and darkens lower ground', () => {
    const col = { id: B.STONE, y: 20, depth: 0 };
    const flat = shadeColumn(col, color, 20);
    const lit = shadeColumn(col, color, 17);
    const dark = shadeColumn(col, color, 24);
    expect(flat).toEqual([100, 100, 100]);
    expect(lit[0]).toBeGreaterThan(flat[0]);
    expect(dark[0]).toBeLessThan(flat[0]);
    // A neighbour that is not known changes nothing.
    expect(shadeColumn(col, color, -1)).toEqual(flat);
  });

  it('paints water blue, darker where it is deep', () => {
    const shallow = shadeColumn({ id: B.WATER, y: 9, depth: 1 }, color, 9);
    const deep = shadeColumn({ id: B.WATER, y: 9, depth: 10 }, color, 9);
    expect(shallow[2]).toBeGreaterThan(shallow[0]);
    expect(deep[2]).toBeLessThan(shallow[2]);
  });
});

describe('paintArea', () => {
  it('paints one pixel per block and leaves unloaded ground transparent', () => {
    const w = makeWorld();
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) w.set(x, 8, z, B.GRASS);
    const px = paintArea(w.src, 8, 0, 16, 4, color);
    expect(px.length).toBe(16 * 4 * 4);
    // Columns 0..7 are in chunk 0 (loaded), the rest in chunk 1 (not).
    expect(px[3]).toBe(255);
    expect([px[0], px[1], px[2]]).toEqual([100, 160, 60]);
    expect(px[(8 * 1) * 4 + 3]).toBe(0);
  });

  it('shows relief: a hill is lighter on one side than the other', () => {
    const w = makeWorld();
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) w.set(x, 8 + (x >= 8 ? 3 : 0), z, B.STONE);
    const px = paintArea(w.src, 0, 4, 16, 3, color);
    const at = (x: number, y: number): number => px[(y * 16 + x) * 4];
    expect(at(3, 1)).toBe(100); // flat ground
    expect(at(8, 1)).toBeGreaterThan(100); // the step up
    expect(at(12, 1)).toBe(100); // flat again on the plateau
  });

  it('sees only what is below the cut height', () => {
    const w = makeWorld();
    w.set(2, 30, 2, B.STONE);
    w.set(2, 5, 2, B.GRASS);
    const open = paintArea(w.src, 2, 2, 1, 1, color);
    const cut = paintArea(w.src, 2, 2, 1, 1, color, 10);
    expect(open[0]).toBe(100);
    expect([cut[0], cut[1], cut[2]]).toEqual([100, 160, 60]);
  });
});
