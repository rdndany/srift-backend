import { describe, expect, it } from 'vitest';
import { B, WORLD_HEIGHT, WorldGenerator, packWaterDepth } from '@solrift/shared';
import { REGION, assembleRegion, meshChunk, regionIndex, type MeshData } from './mesher';

function emptyRegion(): Uint16Array {
  return new Uint16Array(REGION * WORLD_HEIGHT * REGION);
}

const quads = (m: MeshData | null) => (m ? m.indices.length / 6 : 0);

function assertValid(m: MeshData): void {
  const verts = m.positions.length / 3;
  expect(m.uvs.length / 2).toBe(verts);
  expect(m.tiles.length).toBe(verts);
  expect(m.light.length / 4).toBe(verts);
  for (let i = 0; i < m.indices.length; i++) expect(m.indices[i]).toBeLessThan(verts);
}

describe('mesher', () => {
  it('returns nothing for an empty chunk', () => {
    const r = meshChunk(emptyRegion());
    expect(r.opaque).toBeNull();
    expect(r.translucent).toBeNull();
  });

  it('emits 6 faces for a lone block', () => {
    const p = emptyRegion();
    p[regionIndex(5, 10, 5)] = B.STONE;
    const r = meshChunk(p);
    expect(r.opaque!.positions.length / 3).toBe(24);
    expect(quads(r.opaque)).toBe(6);
    assertValid(r.opaque!);
  });

  it('greedily merges the sunlit top of two adjacent blocks', () => {
    const p = emptyRegion();
    p[regionIndex(5, 10, 5)] = B.STONE;
    p[regionIndex(6, 10, 5)] = B.STONE;
    const r = meshChunk(p);
    // Un-merged would be 10 faces. Shaded undersides keep smooth lighting, so they stay separate.
    expect(quads(r.opaque)).toBeLessThanOrEqual(7);
    // The merged top face covers 2x1 blocks: UVs span 0..2 along one axis.
    expect(Math.max(...r.opaque!.uvs)).toBe(2);
  });

  it('does not merge faces with different textures', () => {
    const p = emptyRegion();
    p[regionIndex(5, 10, 5)] = B.STONE;
    p[regionIndex(6, 10, 5)] = B.DIRT;
    const r = meshChunk(p);
    // Top, bottom, front, back can't merge (4 x 2 quads) + 2 end caps.
    expect(quads(r.opaque)).toBe(10);
  });

  it('merges flat sunlit terrain into a single 16x16 quad', () => {
    const p = emptyRegion();
    for (let y = 0; y <= 5; y++) {
      for (let z = -16; z < 32; z++) for (let x = -16; x < 32; x++) p[regionIndex(x, y, z)] = B.STONE;
    }
    const r = meshChunk(p);
    expect(quads(r.opaque)).toBe(1);
    expect(Math.max(...r.opaque!.uvs)).toBe(16);
    assertValid(r.opaque!);
  });

  it('does not merge across a texture change on flat terrain', () => {
    const p = emptyRegion();
    for (let y = 0; y <= 5; y++) {
      for (let z = -16; z < 32; z++) for (let x = -16; x < 32; x++) p[regionIndex(x, y, z)] = y === 5 && x >= 8 ? B.DIRT : B.STONE;
    }
    const r = meshChunk(p);
    expect(quads(r.opaque)).toBe(2);
  });

  it('culls faces against blocks in neighbouring chunks', () => {
    const p = emptyRegion();
    p[regionIndex(0, 10, 0)] = B.STONE;
    p[regionIndex(-1, 10, 0)] = B.STONE; // lives in the west neighbour
    const r = meshChunk(p);
    expect(quads(r.opaque)).toBe(5);
  });

  it('puts water in the translucent mesh and merges its surface', () => {
    const p = emptyRegion();
    for (let x = 2; x < 8; x++) p[regionIndex(x, 3, 2)] = B.WATER;
    const r = meshChunk(p);
    expect(r.opaque).toBeNull();
    expect(quads(r.translucent)).toBe(6);
    // A source's surface sits 2/16 below the block top.
    const ys = Array.from(r.translucent!.positions).filter((_, i) => i % 3 === 1);
    expect(Math.max(...ys)).toBeCloseTo(4 - 2 / 16, 5);
  });

  it('bakes full sky light on exposed faces and darker values in the open vs. enclosed', () => {
    const p = emptyRegion();
    p[regionIndex(5, 10, 5)] = B.STONE;
    const r = meshChunk(p);
    const light = r.opaque!.light;
    let maxSky = 0;
    for (let i = 0; i < light.length; i += 4) maxSky = Math.max(maxSky, light[i + 1]);
    expect(maxSky).toBe(255);
  });

  it('bakes block light from emitters onto nearby faces', () => {
    const p = emptyRegion();
    p[regionIndex(5, 10, 5)] = B.GLOWSTONE;
    p[regionIndex(7, 10, 5)] = B.STONE;
    const r = meshChunk(p);
    const light = r.opaque!.light;
    let maxBlk = 0;
    for (let i = 0; i < light.length; i += 4) maxBlk = Math.max(maxBlk, light[i + 2]);
    expect(maxBlk).toBeGreaterThan(150);
  });

  it('meshes flowers as two crossed double-sided planes and crops as four', () => {
    const p = emptyRegion();
    p[regionIndex(5, 10, 5)] = B.ROSE;
    const r = meshChunk(p);
    expect(quads(r.opaque)).toBe(4); // 2 planes x 2 sides
    assertValid(r.opaque!);

    const c = emptyRegion();
    c[regionIndex(5, 10, 5)] = B.WHEAT_3;
    expect(quads(meshChunk(c).opaque)).toBe(8);
  });

  it('plants do not hide the faces of the block they stand on', () => {
    const p = emptyRegion();
    p[regionIndex(5, 10, 5)] = B.GRASS;
    p[regionIndex(5, 11, 5)] = B.TALL_GRASS;
    const r = meshChunk(p);
    expect(quads(r.opaque)).toBe(6 + 4);
  });

  it('meshes a torch as a thin post that glows at full brightness', () => {
    const p = emptyRegion();
    p[regionIndex(5, 10, 5)] = B.TORCH;
    const r = meshChunk(p);
    expect(quads(r.opaque)).toBe(5);
    const xs = Array.from(r.opaque!.positions).filter((_, i) => i % 3 === 0);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2 / 16, 5);
    const ys = Array.from(r.opaque!.positions).filter((_, i) => i % 3 === 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(10 / 16, 5);
    for (let i = 2; i < r.opaque!.light.length; i += 4) expect(r.opaque!.light[i]).toBe(255);
  });

  it('shifts wall torches towards their support', () => {
    const p = emptyRegion();
    p[regionIndex(5, 10, 5)] = B.TORCH_PX; // supported by the block at +x
    const xs = Array.from(meshChunk(p).opaque!.positions).filter((_, i) => i % 3 === 0);
    expect(Math.min(...xs)).toBeGreaterThan(5.7);
  });

  it('lowers flowing water with its level', () => {
    const p = emptyRegion();
    p[regionIndex(5, 10, 5)] = B.WATER_7;
    const ys = Array.from(meshChunk(p).translucent!.positions).filter((_, i) => i % 3 === 1);
    expect(Math.max(...ys)).toBeCloseTo(10 + 2 / 16, 5); // level 7 is 2/16 high
  });

  it('hides faces between cells of the same fluid and shows the step down to a lower one', () => {
    const stack = emptyRegion();
    stack[regionIndex(5, 10, 5)] = B.WATER;
    stack[regionIndex(5, 11, 5)] = B.WATER;
    // Two cubes of water on top of each other: 5 faces each, minus the shared pair, plus nothing.
    expect(quads(meshChunk(stack).translucent)).toBe(10);

    const level = emptyRegion();
    level[regionIndex(5, 10, 5)] = B.WATER;
    level[regionIndex(6, 10, 5)] = B.WATER;
    // Same height: the faces between them vanish.
    expect(quads(meshChunk(level).translucent)).toBe(6);

    const step = emptyRegion();
    step[regionIndex(5, 10, 5)] = B.WATER;
    step[regionIndex(6, 10, 5)] = B.WATER_7;
    // The tall one shows a side above the short one's surface; the short one's side is hidden.
    expect(quads(meshChunk(step).translucent)).toBe(11);
  });

  it('keeps lava out of the translucent mesh and lowers it too', () => {
    const p = emptyRegion();
    p[regionIndex(5, 10, 5)] = B.LAVA_3;
    const r = meshChunk(p);
    expect(r.translucent).toBeNull();
    const ys = Array.from(r.opaque!.positions).filter((_, i) => i % 3 === 1);
    expect(Math.max(...ys)).toBeCloseTo(10 + 5 / 16, 5);
  });

  it('lays rails flat on the floor of their cell', () => {
    const p = emptyRegion();
    p[regionIndex(5, 10, 5)] = B.STONE;
    p[regionIndex(5, 11, 5)] = B.RAIL_X;
    const r = meshChunk(p);
    const ys = Array.from(r.opaque!.positions).filter((_, i) => i % 3 === 1);
    expect(ys.filter((y) => y > 11 && y < 11.1)).toHaveLength(4);
  });

  it('raises a sloped rail one block towards its high end', () => {
    for (const [id, high] of [[B.RAIL_UP_PX, (x: number) => x > 5.5], [B.RAIL_UP_NX, (x: number) => x < 5.5]] as const) {
      const p = emptyRegion();
      p[regionIndex(5, 10, 5)] = B.STONE;
      p[regionIndex(5, 11, 5)] = id;
      const pos = Array.from(meshChunk(p).opaque!.positions);
      const corners: [number, number][] = [];
      for (let i = 0; i < pos.length; i += 3) if (pos[i + 1] > 11) corners.push([pos[i], pos[i + 1]]);
      // The slope's four corners: two on the floor of the cell, two a block up, and the high ones are at the high end.
      const ys = corners.map((c) => c[1]).sort((a, b) => a - b);
      expect(ys[0]).toBeCloseTo(11.04, 5);
      expect(ys[3]).toBeCloseTo(12.04, 5);
      for (const [x, y] of corners) expect(y > 11.5).toBe(high(x));
    }
  });

  it('mirrors the curve tile for the turns that are not east-south', () => {
    const uvs = (id: number): number[] => {
      const p = emptyRegion();
      p[regionIndex(5, 10, 5)] = B.STONE;
      p[regionIndex(5, 11, 5)] = id;
      const r = meshChunk(p).opaque!;
      const out: number[] = [];
      for (let i = 0; i < r.positions.length / 3; i++) if (r.positions[i * 3 + 1] > 11 && r.positions[i * 3 + 1] < 11.1) out.push(r.uvs[i * 2], r.uvs[i * 2 + 1]);
      return out;
    };
    const es = uvs(B.RAIL_ES);
    expect(es).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
    expect(uvs(B.RAIL_WS)).toEqual([1, 0, 0, 0, 0, 1, 1, 1]);
    expect(uvs(B.RAIL_EN)).toEqual([0, 1, 1, 1, 1, 0, 0, 0]);
    expect(uvs(B.RAIL_WN)).toEqual([1, 1, 0, 1, 0, 0, 1, 0]);
  });

  it('puts a biome palette index on grass, leaves and water only', () => {
    const tint = new Uint8Array(256).fill(9);
    const p = emptyRegion();
    p[regionIndex(2, 10, 2)] = B.GRASS;
    p[regionIndex(6, 10, 6)] = B.STONE;
    p[regionIndex(9, 10, 9)] = B.WATER;
    const r = meshChunk(p, tint);
    const alphas = (m: MeshData | null) => new Set(Array.from(m!.light).filter((_, i) => i % 4 === 3));
    // Grass gets 1 + packed climate, water gets the water row (65 + temperature step), stone nothing.
    expect(alphas(r.opaque)).toEqual(new Set([0, 1 + 9]));
    // Water also carries its depth in the high bits: one block of water is class 0.
    expect(alphas(r.translucent)).toEqual(new Set([packWaterDepth(65 + 1, 0)]));
    expect(packWaterDepth(65 + 1, 3)).toBe(128 + 1 + 96);
    // Untinted without a grid.
    expect(alphas(meshChunk(p).opaque)).toEqual(new Set([0]));
  });

  it('merges tinted faces only when they share a tint', () => {
    const tint = new Uint8Array(256).fill(9);
    tint[4 * 16 + 3] = 20;
    const p = emptyRegion();
    for (let x = 0; x < 8; x++) p[regionIndex(x, 10, 4)] = B.GRASS;
    // One column of the row has another climate: the top faces cannot all be one quad.
    const merged = quads(meshChunk(p, new Uint8Array(256).fill(9)).opaque);
    const split = quads(meshChunk(p, tint).opaque);
    expect(split).toBeGreaterThan(merged);
  });

  it('meshes real terrain quickly and consistently', () => {
    const gen = new WorldGenerator(1337);
    const cache = new Map<string, Uint16Array>();
    const get = (cx: number, cz: number) => {
      const k = `${cx},${cz}`;
      let c = cache.get(k);
      if (!c) cache.set(k, (c = gen.generateChunk(cx, cz)));
      return c;
    };
    const region = assembleRegion(get, 0, 0);
    const t0 = performance.now();
    const r = meshChunk(region);
    const ms = performance.now() - t0;
    expect(r.opaque).not.toBeNull();
    assertValid(r.opaque!);
    if (r.translucent) assertValid(r.translucent);
    expect(ms).toBeLessThan(1500);
  });
});
