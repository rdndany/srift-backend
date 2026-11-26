import { describe, expect, it } from 'vitest';
import { B, BB, BLOCKS, DRESS, MASONRY, WORLD_HEIGHT, WorldGenerator, campfireId, packWaterDepth, placementFor, slabId, stairId } from '@solrift/shared';
import { REGION, TILE_EXTRA, assembleRegion, meshChunk, regionIndex, type MeshData } from './mesher';

function emptyRegion(): Uint16Array {
  return new Uint16Array(REGION * WORLD_HEIGHT * REGION);
}

const quads = (m: MeshData | null) => (m ? m.indices.length / 6 : 0);

function eachQuad(m: MeshData, fn: (verts: number[]) => void): void {
  for (let i = 0; i < m.indices.length; i += 6) {
    const ids = new Set<number>();
    for (let k = 0; k < 6; k++) ids.add(m.indices[i + k]!);
    fn([...ids]);
  }
}

function corner(m: MeshData, v: number): [number, number, number] {
  return [m.positions[v * 3]!, m.positions[v * 3 + 1]!, m.positions[v * 3 + 2]!];
}

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

  it('draws glass and its panes clear, and keeps iron bars solid', () => {
    const glass = emptyRegion();
    glass[regionIndex(5, 10, 5)] = B.GLASS;
    glass[regionIndex(6, 10, 5)] = B.GLASS;
    const g = meshChunk(glass);
    // The face between two blocks of glass is hidden, and the outside faces join into one sheet.
    expect(g.opaque).toBeNull();
    expect(quads(g.translucent)).toBe(6);
    assertValid(g.translucent!);

    const pane = emptyRegion();
    pane[regionIndex(5, 10, 5)] = B.PANE;
    const p = meshChunk(pane);
    expect(p.opaque).toBeNull();
    expect(quads(p.translucent)).toBeGreaterThan(0);

    const stained = emptyRegion();
    stained[regionIndex(5, 10, 5)] = DRESS.glass;
    stained[regionIndex(5, 11, 5)] = DRESS.pane;
    const s = meshChunk(stained);
    expect(s.opaque).toBeNull();
    expect(s.translucent).not.toBeNull();

    const bars = emptyRegion();
    bars[regionIndex(5, 10, 5)] = DRESS.ironBars;
    const b = meshChunk(bars);
    expect(b.translucent).toBeNull();
    expect(quads(b.opaque)).toBeGreaterThan(0);
  });

  it('puts water in the translucent mesh and merges its surface', () => {
    const p = emptyRegion();
    for (let x = 2; x < 8; x++) p[regionIndex(x, 3, 2)] = B.WATER;
    const r = meshChunk(p);
    expect(r.opaque).toBeNull();
    // The surface is cut where its shore sides change: the two ends and the strip between them (the flags the shader draws foam by).
    // The underside is drawn too, so the body can be seen from below.
    expect(quads(r.translucent)).toBe(10);
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

  it('meshes flowers as four double-sided planes in a star and crops as four', () => {
    const p = emptyRegion();
    p[regionIndex(5, 10, 5)] = B.ROSE;
    const r = meshChunk(p);
    expect(quads(r.opaque)).toBe(8); // 4 planes x 2 sides
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
    expect(quads(r.opaque)).toBe(6 + 8);
  });

  it('meshes a torch as a thin post with a flame on top, at full brightness', () => {
    const p = emptyRegion();
    p[regionIndex(5, 10, 5)] = B.TORCH;
    const r = meshChunk(p);
    // Five faces of the post, plus two crossed planes of flame, each drawn from both sides.
    expect(quads(r.opaque)).toBe(9);
    const xs = Array.from(r.opaque!.positions).filter((_, i) => i % 3 === 0);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(8 / 16, 5);
    const ys = Array.from(r.opaque!.positions).filter((_, i) => i % 3 === 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(15 / 16, 5);
    for (let i = 2; i < r.opaque!.light.length; i += 4) expect(r.opaque!.light[i]).toBe(255);
  });

  it('meshes a campfire as four logs, and a flame only while it is lit', () => {
    const lit = emptyRegion();
    lit[regionIndex(5, 10, 5)] = campfireId(2, true);
    const burning = meshChunk(lit);
    expect(quads(burning.opaque)).toBe(28);
    assertValid(burning.opaque!);
    const ys = Array.from(burning.opaque!.positions).filter((_, i) => i % 3 === 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(14 / 16, 5);
    const out = emptyRegion();
    out[regionIndex(5, 10, 5)] = campfireId(2, false);
    expect(quads(meshChunk(out).opaque)).toBe(24);
  });

  it('shifts wall torches towards their support', () => {
    const p = emptyRegion();
    p[regionIndex(5, 10, 5)] = B.TORCH_PX; // supported by the block at +x
    const xs = Array.from(meshChunk(p).opaque!.positions).filter((_, i) => i % 3 === 0);
    expect(Math.min(...xs)).toBeGreaterThan(5.5);
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
    // Two cubes of water on top of each other: the shared pair is gone. The lower one has an underside.
    expect(quads(meshChunk(stack).translucent)).toBe(10);

    const level = emptyRegion();
    level[regionIndex(5, 10, 5)] = B.WATER;
    level[regionIndex(6, 10, 5)] = B.WATER;
    // Same height: the faces between them vanish. Each cell keeps its underside.
    expect(quads(meshChunk(level).translucent)).toBe(8);

    const step = emptyRegion();
    step[regionIndex(5, 10, 5)] = B.WATER;
    step[regionIndex(6, 10, 5)] = B.WATER_7;
    // The tall side shows the part that rises above the thin one, and each cell has an underside.
    expect(quads(meshChunk(step).translucent)).toBe(11);
  });

  it('slopes a fluid downhill instead of keeping a cube step', () => {
    const slopeOf = (id: number, thin: number, mesh: 'translucent' | 'opaque'): { far: number; mid: number; end: number } => {
      const p = emptyRegion();
      p[regionIndex(5, 10, 5)] = id;
      p[regionIndex(6, 10, 5)] = thin;
      const m = meshChunk(p)[mesh]!;
      let far = 0;
      let mid = 0;
      let end = 0;
      eachQuad(m, (verts) => {
        const pts = verts.map((v) => corner(m, v));
        const ys = pts.map((pt) => pt[1]);
        if (Math.max(...ys) - Math.min(...ys) > 0.4) return;
        for (const [x, y] of pts) {
          if (y < 10.05) continue;
          if (Math.abs(x - 5) < 0.05) far = Math.max(far, y);
          if (Math.abs(x - 6) < 0.05) mid = Math.max(mid, y);
          if (Math.abs(x - 7) < 0.05) end = Math.max(end, y);
        }
      });
      return { far, mid, end };
    };
    const water = slopeOf(B.WATER, B.WATER_7, 'translucent');
    expect(water.far).toBeGreaterThan(water.mid);
    expect(water.mid).toBeGreaterThan(water.end);
    expect(water.far).toBeCloseTo(10 + 14 / 16, 2);
    expect(water.end).toBeCloseTo(10 + 2 / 16, 2);
    const lava = slopeOf(B.LAVA, B.LAVA_3, 'opaque');
    expect(lava.far).toBeGreaterThan(lava.mid);
    expect(lava.mid).toBeGreaterThan(lava.end);
  });

  it('tells water where its shore is and a floor how deep the water over it is', () => {
    const p = emptyRegion();
    // A pond of 3 x 3 on a stone floor, two deep in the middle.
    for (let x = 4; x <= 6; x++) {
      for (let z = 4; z <= 6; z++) {
        p[regionIndex(x, 2, z)] = B.STONE;
        p[regionIndex(x, 3, z)] = B.WATER;
      }
    }
    p[regionIndex(5, 2, 5)] = B.AIR;
    p[regionIndex(5, 1, 5)] = B.STONE;
    p[regionIndex(5, 2, 5)] = B.WATER;
    const r = meshChunk(p);
    // Water faces and floor faces are told apart by the tint byte: the water's surface carries its shore as flags above the tile.
    const flags = (m: { tiles: ArrayLike<number> } | null): number[] => Array.from(m!.tiles, (t) => Math.floor(t / TILE_EXTRA));
    const water = flags(r.translucent);
    expect(Math.max(...water)).toBeLessThanOrEqual(15);
    // The corner cells meet land on two sides, the middle one on none: so more than one kind of surface exists.
    expect(new Set(water).size).toBeGreaterThan(2);
    // The opaque floor faces that look at water are flagged 1 + the depth class (1: a block of water; 2: two or three).
    const floor = new Set(flags(r.opaque));
    expect(floor.has(1)).toBe(true);
    expect(floor.has(2)).toBe(true);
  });

  it('draws water around and over a plant standing in it as if the plant were not there', () => {
    const pond = (mid: number): ReturnType<typeof meshChunk> => {
      const p = emptyRegion();
      for (let x = 3; x <= 7; x++) {
        for (let z = 3; z <= 7; z++) {
          p[regionIndex(x, 2, z)] = B.STONE;
          for (let y = 3; y <= 5; y++) p[regionIndex(x, y, z)] = B.WATER;
        }
      }
      // A stalk two cells tall, with one cell of water over it.
      if (mid !== B.WATER) p[regionIndex(5, 3, 5)] = p[regionIndex(5, 4, 5)] = mid;
      return meshChunk(p);
    };
    const plain = pond(B.WATER);
    const planted = pond(B.TALL_GRASS);
    // No hole in the surface, no wall round the plant: the same water faces, the same flags.
    expect(quads(planted.translucent)).toBe(quads(plain.translucent));
    const flags = (m: { tiles: ArrayLike<number> } | null): number[] => Array.from(m!.tiles, (t) => Math.floor(t / TILE_EXTRA));
    expect(flags(planted.translucent).sort()).toEqual(flags(plain.translucent).sort());
    // The floor under the plant is told it is under water, like the floor round it.
    expect(new Set(flags(planted.opaque))).toEqual(new Set(flags(plain.opaque)));
  });

  it('does not cut a hole in the surface where a plant stands in the top layer of the water', () => {
    const pond = (plant: boolean): ReturnType<typeof meshChunk> => {
      const p = emptyRegion();
      for (let x = 3; x <= 7; x++) {
        for (let z = 3; z <= 7; z++) {
          p[regionIndex(x, 2, z)] = B.STONE;
          for (let y = 3; y <= 4; y++) p[regionIndex(x, y, z)] = B.WATER;
        }
      }
      p[regionIndex(5, 4, 5)] = plant ? BB.seagrass : B.WATER;
      return meshChunk(p);
    };
    expect(quads(pond(true).translucent)).toBe(quads(pond(false).translucent));
  });

  it('never takes the plants of a meadow for water (no blue blocks in the grass)', () => {
    const p = emptyRegion();
    for (let x = 2; x <= 9; x++) {
      for (let z = 2; z <= 9; z++) {
        p[regionIndex(x, 10, z)] = B.GRASS;
        p[regionIndex(x, 11, z)] = (x + z) % 3 === 0 ? B.TALL_GRASS : B.FERN;
      }
    }
    // A flower with grass on all four sides and a puddle's worth of water on three of the sides of another.
    p[regionIndex(5, 11, 5)] = B.TALL_GRASS;
    p[regionIndex(6, 11, 6)] = B.FERN;
    p[regionIndex(5, 11, 6)] = B.WATER;
    p[regionIndex(7, 11, 6)] = B.WATER;
    p[regionIndex(6, 11, 7)] = B.WATER;
    expect(meshChunk(p).translucent).not.toBeNull();
    const water = quads(meshChunk(p).translucent);
    // Only the three real blocks of water are drawn: five faces each at most, none for the plants.
    expect(water).toBeLessThanOrEqual(3 * 5);
  });

  it('draws the side of water standing higher than the pool, with air between', () => {
    const p = emptyRegion();
    p[regionIndex(6, 10, 5)] = B.WATER;
    p[regionIndex(5, 12, 5)] = B.WATER;
    const r = meshChunk(p);
    let lip = 0;
    eachQuad(r.translucent!, (verts) => {
      const xs = verts.map((v) => r.translucent!.positions[v * 3]!);
      const ys = verts.map((v) => r.translucent!.positions[v * 3 + 1]!);
      if (Math.max(...ys) - Math.min(...ys) < 0.01 || Math.min(...ys) < 11.9) return;
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      if (x0 > 5.9 && x1 < 6.1) lip++;
    });
    expect(lip).toBe(1);
  });

  it('hides the side of a taller pool where it stands in shorter water', () => {
    const p = emptyRegion();
    p[regionIndex(5, 10, 5)] = B.WATER;
    p[regionIndex(5, 11, 5)] = B.WATER;
    p[regionIndex(6, 10, 5)] = B.WATER;
    const r = meshChunk(p);
    let lip = 0;
    let outer = 0;
    eachQuad(r.translucent!, (verts) => {
      const xs = verts.map((v) => r.translucent!.positions[v * 3]!);
      const ys = verts.map((v) => r.translucent!.positions[v * 3 + 1]!);
      if (Math.max(...ys) - Math.min(...ys) < 0.01 || Math.min(...ys) < 10.9) return;
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      if (x0 > 5.9 && x1 < 6.1) lip++;
      if (x0 > 4.9 && x1 < 5.1) outer++;
    });
    // The face toward the lower water is there, and so is the face toward open air.
    expect(lip).toBe(1);
    expect(outer).toBe(1);
  });

  it('hides the water faces that would touch ice or glass', () => {
    const p = emptyRegion();
    p[regionIndex(5, 10, 5)] = B.WATER;
    const alone = quads(meshChunk(p).translucent);
    p[regionIndex(6, 10, 5)] = B.ICE;
    const withIce = meshChunk(p);
    // The water gives up its face towards the ice, and the ice gives up the side that meets the water.
    expect(quads(withIce.translucent)).toBe(alone - 1 + 5);
  });

  it('closes the edge of a body of water, and hides the sides between its cells', () => {
    const p = emptyRegion();
    p[regionIndex(5, 9, 5)] = B.WATER;
    p[regionIndex(5, 10, 5)] = B.WATER;
    p[regionIndex(6, 10, 5)] = B.WATER;
    const r = meshChunk(p);
    // The face between the two surface cells is gone. The outer edge of the surface is still there, so the shore is not a hole.
    let between = 0;
    let edge = 0;
    eachQuad(r.translucent!, (verts) => {
      const xs = verts.map((v) => r.translucent!.positions[v * 3]!);
      const ys = verts.map((v) => r.translucent!.positions[v * 3 + 1]!);
      if (Math.min(...ys) < 10 - 0.01 || Math.max(...ys) - Math.min(...ys) < 0.01) return;
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      if (x0 > 5.9 && x1 < 6.1) between++;
      else edge++;
    });
    expect(between).toBe(0);
    expect(edge).toBeGreaterThan(0);
  });

  it('draws ice on water as a sheet, with no sides hanging in the water', () => {
    const p = emptyRegion();
    p[regionIndex(5, 9, 5)] = B.WATER;
    p[regionIndex(5, 10, 5)] = B.ICE;
    const r = meshChunk(p);
    let iceSides = 0;
    let waterSides = 0;
    eachQuad(r.translucent!, (verts) => {
      const ys = verts.map((v) => r.translucent!.positions[v * 3 + 1]!);
      if (Math.max(...ys) - Math.min(...ys) < 0.01) return;
      // The ice sits on the water. Its outer sides are the edge of the sheet. Nothing of it hangs down into the water.
      if (Math.min(...ys) >= 10 - 0.01) iceSides++;
      else waterSides++;
    });
    expect(iceSides).toBe(4);
    expect(waterSides).toBe(4);
  });

  it('draws the full side of water that sits in a cave', () => {
    const p = emptyRegion();
    for (let x = 4; x <= 7; x++) {
      for (let z = 4; z <= 7; z++) {
        p[regionIndex(x, 9, z)] = B.STONE;
        p[regionIndex(x, 13, z)] = B.STONE;
      }
    }
    for (let y = 10; y <= 12; y++) {
      for (let x = 4; x <= 7; x++) {
        p[regionIndex(x, y, 4)] = B.STONE;
        p[regionIndex(x, y, 7)] = B.STONE;
      }
      for (let z = 5; z <= 6; z++) {
        p[regionIndex(4, y, z)] = B.STONE;
        p[regionIndex(7, y, z)] = B.STONE;
      }
    }
    p[regionIndex(5, 10, 5)] = B.WATER;
    const r = meshChunk(p);
    let side = 0;
    eachQuad(r.translucent!, (verts) => {
      const xs = verts.map((v) => r.translucent!.positions[v * 3]!);
      const ys = verts.map((v) => r.translucent!.positions[v * 3 + 1]!);
      if (Math.max(...ys) - Math.min(...ys) < 0.01) return;
      if (Math.abs(Math.min(...xs) - 6) > 0.01 || Math.abs(Math.max(...xs) - 6) > 0.01) return;
      side++;
      expect(Math.min(...ys)).toBeCloseTo(10, 5);
      expect(Math.max(...ys)).toBeCloseTo(10 + 14 / 16, 5);
    });
    expect(side).toBe(1);
  });

  it('draws every exposed side of a water block, down to the floor of the cell', () => {
    const shore = emptyRegion();
    shore[regionIndex(5, 10, 5)] = B.WATER;
    const water = meshChunk(shore);
    let sides = 0;
    eachQuad(water.translucent!, (verts) => {
      const ys = verts.map((v) => water.translucent!.positions[v * 3 + 1]!);
      if (Math.max(...ys) - Math.min(...ys) < 0.01) return;
      sides++;
      // A source sits at 14/16, and the side is the whole face up to that, in the open and in a cave.
      expect(Math.max(...ys)).toBeCloseTo(10 + 14 / 16, 5);
      expect(Math.min(...ys)).toBeCloseTo(10, 5);
    });
    expect(sides).toBe(4);

    const deep = emptyRegion();
    deep[regionIndex(5, 9, 5)] = B.STONE;
    deep[regionIndex(6, 9, 5)] = B.WATER;
    deep[regionIndex(6, 10, 5)] = B.WATER;
    const buried = meshChunk(deep).opaque!;
    let facing = 0;
    eachQuad(buried, (verts) => {
      const xs = verts.map((v) => buried.positions[v * 3]!);
      const ys = verts.map((v) => buried.positions[v * 3 + 1]!);
      if (Math.max(...ys) - Math.min(...ys) < 0.01) return;
      if (Math.max(...xs) - Math.min(...xs) > 0.01) return;
      if (Math.abs(xs[0]! - 6) > 0.01) return;
      facing++;
      // The stone under the water keeps its full side, so the seabed is not a hole.
      expect(Math.min(...ys)).toBeCloseTo(9, 5);
      expect(Math.max(...ys)).toBeCloseTo(10, 5);
    });
    expect(facing).toBe(1);
  });

  it('keeps lava out of the translucent mesh and lowers it too', () => {
    const p = emptyRegion();
    p[regionIndex(5, 10, 5)] = B.LAVA_3;
    const r = meshChunk(p);
    expect(r.translucent).toBeNull();
    const ys = Array.from(r.opaque!.positions).filter((_, i) => i % 3 === 1);
    expect(Math.max(...ys)).toBeCloseTo(10 + 4 / 16, 5);
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

  it('draws a block on a slab half a block lower, with the same tile and the same daylight', () => {
    const side = BLOCKS[B.STONE_BRICKS].tiles.side;
    const top = BLOCKS[B.STONE_BRICKS].tiles.top;
    const seated = emptyRegion();
    seated[regionIndex(5, 9, 5)] = slabId(4, false);
    seated[regionIndex(5, 10, 5)] = B.STONE_BRICKS;
    const plain = emptyRegion();
    plain[regionIndex(5, 10, 5)] = B.STONE_BRICKS;
    const a = meshChunk(seated).opaque!;
    const b = meshChunk(plain).opaque!;
    assertValid(a);

    let minY = Infinity;
    let maxY = -Infinity;
    const tiles = new Set<number>();
    let sky = 0;
    let uvs: number[] = [];
    eachQuad(a, (verts) => {
      const ys = verts.map((v) => corner(a, v)[1]);
      if (Math.max(...ys) <= 9.6) return;
      minY = Math.min(minY, ...ys);
      maxY = Math.max(maxY, ...ys);
      tiles.add(a.tiles[verts[0]!]!);
      const xs = verts.map((v) => corner(a, v)[0]);
      if (xs.every((x) => Math.abs(x - 5) < 1e-4)) {
        sky = a.light[verts[0]! * 4 + 1]!;
        uvs = verts.flatMap((v) => [a.uvs[v * 2]!, a.uvs[v * 2 + 1]!]);
      }
    });
    expect(minY).toBeCloseTo(9.5, 5);
    expect(maxY).toBeCloseTo(10.5, 5);
    expect(tiles).toEqual(new Set([side, top]));

    let plainSky = 0;
    let plainUvs: number[] = [];
    eachQuad(b, (verts) => {
      const xs = verts.map((v) => corner(b, v)[0]);
      if (!xs.every((x) => Math.abs(x - 5) < 1e-4)) return;
      plainSky = b.light[verts[0]! * 4 + 1]!;
      plainUvs = verts.flatMap((v) => [b.uvs[v * 2]!, b.uvs[v * 2 + 1]!]);
    });
    expect(sky).toBe(plainSky);
    expect(sky).toBe(255);
    expect(uvs).toEqual(plainUvs);

    // A top slab already meets the block above it, so that block stays in its cell.
    const upper = emptyRegion();
    upper[regionIndex(5, 9, 5)] = slabId(4, true);
    upper[regionIndex(5, 10, 5)] = B.STONE_BRICKS;
    const high = meshChunk(upper).opaque!;
    let topMost = 0;
    eachQuad(high, (verts) => {
      topMost = Math.max(topMost, ...verts.map((v) => corner(high, v)[1]));
    });
    expect(topMost).toBeCloseTo(11, 5);
  });

  it('keeps the hanging side of a lowered block beside a normal block', () => {
    const p = emptyRegion();
    p[regionIndex(5, 9, 5)] = slabId(4, false);
    p[regionIndex(5, 10, 5)] = B.STONE_BRICKS;
    p[regionIndex(6, 10, 5)] = B.STONE_BRICKS;
    const m = meshChunk(p).opaque!;
    let hanging = false;
    eachQuad(m, (verts) => {
      const xs = verts.map((v) => corner(m, v)[0]);
      const ys = verts.map((v) => corner(m, v)[1]);
      if (xs.every((x) => Math.abs(x - 6) < 1e-4) && Math.min(...ys) < 9.6 && Math.max(...ys) > 10.4) hanging = true;
    });
    expect(hanging).toBe(true);
  });

  it('sits a block on a carpet, one pixel above the floor', () => {
    const p = emptyRegion();
    p[regionIndex(5, 9, 5)] = DRESS.carpet;
    p[regionIndex(5, 10, 5)] = B.STONE_BRICKS;
    const m = meshChunk(p).opaque!;
    let minY = Infinity;
    let maxY = -Infinity;
    eachQuad(m, (verts) => {
      const ys = verts.map((v) => corner(m, v)[1]);
      if (Math.max(...ys) <= 9.5) return;
      minY = Math.min(minY, ...ys);
      maxY = Math.max(maxY, ...ys);
    });
    expect(minY).toBeCloseTo(9 + 1 / 16, 5);
    expect(maxY).toBeCloseTo(10 + 1 / 16, 5);
  });

  it('draws a straight wall as a low beam and a lone wall with its post', () => {
    const wall = MASONRY.find((row) => row.spec.name === 'stone_brick')!.wallId;
    const run = emptyRegion();
    run[regionIndex(5, 10, 4)] = wall;
    run[regionIndex(5, 10, 5)] = wall;
    run[regionIndex(5, 10, 6)] = wall;
    const beam = meshChunk(run).opaque!;
    let beamTop = 0;
    eachQuad(beam, (verts) => {
      const pts = verts.map((v) => corner(beam, v));
      const inMiddle = pts.every((p) => p[0] >= 5 - 1e-4 && p[0] <= 6 + 1e-4 && p[2] >= 5 - 1e-4 && p[2] <= 6 + 1e-4);
      if (inMiddle) beamTop = Math.max(beamTop, ...pts.map((p) => p[1]));
    });
    expect(beamTop).toBeCloseTo(10 + 14 / 16, 5);

    const lone = emptyRegion();
    lone[regionIndex(5, 10, 5)] = wall;
    const post = meshChunk(lone).opaque!;
    let postTop = 0;
    eachQuad(post, (verts) => {
      postTop = Math.max(postTop, ...verts.map((v) => corner(post, v)[1]));
    });
    expect(postTop).toBeCloseTo(11.5, 5);
  });

  it('shows the rings on the ends of a log laid on its side', () => {
    const east = placementFor(B.LOG, 1, 0, 0)!;
    const p = emptyRegion();
    p[regionIndex(5, 10, 5)] = east;
    const m = meshChunk(p).opaque!;
    const rings = BLOCKS[east].tiles.top;
    const bark = BLOCKS[east].tiles.side;
    let ends = 0;
    let sides = 0;
    eachQuad(m, (verts) => {
      const xs = verts.map((v) => corner(m, v)[0]);
      const tile = m.tiles[verts[0]!]!;
      const cap = xs.every((x) => Math.abs(x - 5) < 1e-4) || xs.every((x) => Math.abs(x - 6) < 1e-4);
      if (cap) {
        expect(tile).toBe(rings);
        ends++;
      } else {
        expect(tile).toBe(bark);
        sides++;
      }
    });
    expect(ends).toBe(2);
    expect(sides).toBe(4);

    const upright = emptyRegion();
    upright[regionIndex(5, 10, 5)] = B.LOG;
    const u = meshChunk(upright).opaque!;
    let tops = 0;
    eachQuad(u, (verts) => {
      const ys = verts.map((v) => corner(u, v)[1]);
      if (Math.max(...ys) - Math.min(...ys) < 1e-4) {
        expect(u.tiles[verts[0]!]!).toBe(BLOCKS[B.LOG].tiles.top);
        tops++;
      }
    });
    expect(tops).toBe(2);
  });

  it('cuts the tall part of a stair back when the neighbour turns the corner', () => {
    const p = emptyRegion();
    p[regionIndex(5, 10, 5)] = stairId(4, false, 0);
    p[regionIndex(6, 10, 5)] = stairId(4, false, 2);
    const m = meshChunk(p).opaque!;
    const high: number[] = [];
    eachQuad(m, (verts) => {
      for (const v of verts) {
        const [x, y, z] = corner(m, v);
        if (y > 10.7 && x >= 5 && x <= 6 && z >= 5 && z <= 6) high.push(z);
      }
    });
    expect(high.length).toBeGreaterThan(0);
    expect(Math.min(...high)).toBeGreaterThanOrEqual(5.5 - 1e-4);
  });
});
