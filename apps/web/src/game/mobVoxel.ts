import { hash, type Brick } from './mobPaint';

/**
 * A tiny voxel sculptor for the big, detailed monsters (King Aurelion, see mobAurelion.ts).
 *
 * You fill boxes, carve hollows and draw stepped strokes on a grid of cubes `u` blocks wide; `bricks()` then turns what is left into the
 * cubes of ONE mesh (`Part.bricks`): every cube hidden on all sides is dropped, a cube keeps only the sides that face the air, and each
 * gets a shade of its own (a little random for variety, a little darker where its neighbours stand close round it: baked ambient occlusion).
 *
 * Coordinates are in cubes along the edges of the grid: the cube `i` spans i..i+1, so a box from 4 to 14 is ten cubes wide and centred on 9.
 * A sculpture is built for one joint (the point the part turns about, in the same coordinates) and the cubes come out relative to it.
 */
export class Sculpt {
  private cells = new Map<number, { skin: number; shade: number }>();
  /** +1, or -1 while drawing the mirror image (see `both`): boxes are then given as for the +x side and land on the -x side. */
  private m: 1 | -1 = 1;

  constructor(
    readonly joint: [number, number, number] = [0, 0, 0],
    readonly u = 0.1,
    private readonly seed = 1,
  ) {}

  private static key(i: number, j: number, k: number): number {
    return (i + 256) * 262144 + (j + 256) * 512 + (k + 256);
  }

  /** Draw everything that follows (until the next call) on this side: +1 as given, -1 as its mirror image (a left arm built like a right one). */
  side(s: 1 | -1): this {
    this.m = s;
    return this;
  }

  /** Draw the same thing on both sides: `fn` is called for the +x side and then again mirrored onto the -x side. */
  both(fn: () => void): this {
    this.m = 1;
    fn();
    this.m = -1;
    fn();
    this.m = 1;
    return this;
  }

  private span(a: number, b: number): [number, number] {
    return this.m === 1 ? [a, b] : [-b, -a];
  }

  /** Whether there is a cube here (on the side being drawn, as `set` takes it). */
  has(i: number, j: number, k: number): boolean {
    return this.cells.has(Sculpt.key(this.m === 1 ? i : -i - 1, j, k));
  }

  /** One cube. */
  set(i: number, j: number, k: number, skin: number, shade = 1): this {
    const x = this.m === 1 ? i : -i - 1;
    this.cells.set(Sculpt.key(x, j, k), { skin, shade });
    return this;
  }

  /** Fill the box from (x0, y0, z0) up to but not including (x1, y1, z1). `skin` may be a function of the cube, for stripes and patterns. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, skin: number | ((i: number, j: number, k: number) => number), shade = 1): this {
    const [a, b] = this.span(x0, x1);
    for (let i = a; i < b; i++)
      for (let j = y0; j < y1; j++)
        for (let k = z0; k < z1; k++) {
          const s = typeof skin === 'number' ? skin : skin(this.m === 1 ? i : -i - 1, j, k);
          this.cells.set(Sculpt.key(i, j, k), { skin: s, shade });
        }
    return this;
  }

  /** Remove the cubes in the box (a mouth, an eye socket). */
  carve(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): this {
    const [a, b] = this.span(x0, x1);
    for (let i = a; i < b; i++) for (let j = y0; j < y1; j++) for (let k = z0; k < z1; k++) this.cells.delete(Sculpt.key(i, j, k));
    return this;
  }

  /** Recolour the cubes that are already in the box (the walls of a hollow); empty places stay empty. */
  paint(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, skin: number | ((i: number, j: number, k: number) => number)): this {
    const [a, b] = this.span(x0, x1);
    for (let i = a; i < b; i++)
      for (let j = y0; j < y1; j++)
        for (let k = z0; k < z1; k++) {
          const c = this.cells.get(Sculpt.key(i, j, k));
          if (c) c.skin = typeof skin === 'number' ? skin : skin(this.m === 1 ? i : -i - 1, j, k);
        }
    return this;
  }

  /**
   * A stepped stroke: boxes of the size given at each point [x, y, z, w, h, d] (centred on it), stamped along the line from point to point,
   * so a curved horn or a swooping fin is a staircase of cubes, thick here and thin there.
   */
  stroke(pts: readonly (readonly [number, number, number, number, number, number])[], skin: number | ((i: number, j: number, k: number) => number), shade = 1): this {
    for (let n = 0; n + 1 < pts.length; n++) {
      const p = pts[n]!;
      const q = pts[n + 1]!;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1]), Math.abs(q[2] - p[2])) * 1.5));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const v = p.map((a, i) => a + (q[i]! - a) * t) as [number, number, number, number, number, number];
        const w = Math.max(1, Math.round(v[3]));
        const h = Math.max(1, Math.round(v[4]));
        const d = Math.max(1, Math.round(v[5]));
        const x0 = Math.round(v[0] - w / 2);
        const y0 = Math.round(v[1] - h / 2);
        const z0 = Math.round(v[2] - d / 2);
        this.box(x0, y0, z0, x0 + w, y0 + h, z0 + d, skin, shade);
      }
    }
    return this;
  }

  /** How many cubes there are. */
  get size(): number {
    return this.cells.size;
  }

  /** The cubes, relative to the joint, ready for `Part.bricks`. */
  bricks(): Brick[] {
    const has = (i: number, j: number, k: number): boolean => this.cells.has(Sculpt.key(i, j, k));
    const out: Brick[] = [];
    const [jx, jy, jz] = this.joint;
    for (const [key, c] of this.cells) {
      const i = Math.floor(key / 262144) - 256;
      const j = Math.floor((key % 262144) / 512) - 256;
      const k = (key % 512) - 256;
      let mask = 0;
      let dark = 0;
      let faces = 0;
      for (let f = 0; f < 6; f++) {
        const ax = f >> 1;
        const sg = f & 1 ? -1 : 1;
        const n: [number, number, number] = [i, j, k];
        n[ax] += sg;
        if (has(n[0], n[1], n[2])) continue;
        mask |= 1 << f;
        faces++;
        // The eight places round the cube in front of this side: the more are filled, the more shut in the side is.
        const a1 = (ax + 1) % 3;
        const a2 = (ax + 2) % 3;
        let around = 0;
        for (let p = -1; p <= 1; p++)
          for (let q = -1; q <= 1; q++) {
            if (!p && !q) continue;
            const m: [number, number, number] = [n[0], n[1], n[2]];
            m[a1] += p;
            m[a2] += q;
            if (has(m[0], m[1], m[2])) around++;
          }
        dark += around / 8;
      }
      if (!mask) continue;
      const shade = c.shade * (0.93 + 0.14 * hash(i * 131 + k, j, this.seed)) * (1 - 0.34 * (dark / faces));
      out.push([(i + 0.5 - jx) * this.u, (j + 0.5 - jy) * this.u, (k + 0.5 - jz) * this.u, this.u, this.u, this.u, shade, c.skin, mask]);
    }
    return out;
  }
}
