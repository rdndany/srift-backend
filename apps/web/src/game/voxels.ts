import * as THREE from 'three';

/**
 * A sculpting kit for small blocks. Shapes (ellipsoids, tapered rods, slabs) are poured into a grid of tiny cubes of one size
 * and the cubes are turned into a mesh with the faces between them left out, so a model is made of hundreds of
 * thousands of little blocks' worth of detail for a few thousand quads. Each cube has its own colour, and each face gets a
 * shade from the way it looks and how crowded its corners are (ambient occlusion), baked into the vertex colours.
 */

export type V3 = readonly [number, number, number];
export type RGB = readonly [number, number, number];

/** What a shape asks of its colour: a fixed one, or one chosen for each cube from where it is in the shape. */
export interface Spot {
  /** The cube's middle. */
  p: V3;
  /** Along a rod or a slab: 0 at its start (bottom), 1 at its end (top). Inside an ellipsoid: how far from the middle (0..1). */
  t: number;
  /** How close the cube is to the shape's surface: 0 in the middle, 1 at the skin. */
  d: number;
  /** Where the cube is in the shape's own frame (for a rod: the offset from its axis, x/y/z as the world's). */
  q: V3;
}
export type Paint = RGB | ((s: Spot) => RGB);

/** Options all the shapes have. */
export interface ShapeOpts {
  /** A tag that later passes can find the cubes by (`trim`). */
  tag?: number;
  /** The cube glows (it is meshed apart, to be drawn without the light). */
  glow?: boolean;
  /** The edge of the shape is torn into tufts by this much (blocks, a fraction of the radius): fur. */
  rough?: number;
  /** Turned about x, y and z (radians, z applied first). */
  rot?: V3;
  /** Only cubes where this is true are poured. */
  clip?: (p: V3) => boolean;
}

interface Cube {
  c: [number, number, number];
  tag: number;
  glow: boolean;
}

const key = (x: number, y: number, z: number): number => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);

/** A repeatable noise in -1..1 for a cube. */
const hash = (x: number, y: number, z: number, s = 0): number => {
  let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791) ^ Math.imul(s, 2654435761)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 2147483648 - 1;
};

const lin = (c: RGB): [number, number, number] => {
  const col = new THREE.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
  return [col.r, col.g, col.b];
};

/** How bright each way a face can look is: from above, the two ends, the two sides, from below. */
const SHADE = { px: 0.84, nx: 0.7, py: 1, ny: 0.5, pz: 0.9, nz: 0.78 } as const;
/** The brightness of a corner by how many cubes crowd it. */
const AO = [0.5, 0.68, 0.84, 1] as const;

const DIRS: readonly { n: V3; u: V3; v: V3; shade: number }[] = [
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1], shade: SHADE.px },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], shade: SHADE.nx },
  { n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0], shade: SHADE.py },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], shade: SHADE.ny },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], shade: SHADE.pz },
  { n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0], shade: SHADE.nz },
];

export class Voxels {
  private readonly cubes = new Map<number, Cube>();
  /** The cubes' colours, by cube. */
  private readonly colors = new Map<number, RGB>();
  private readonly mat = new THREE.Matrix4();
  private readonly inv = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly w = new THREE.Vector3();
  private readonly seed: number;

  /** `size` is the edge of a cube, in the model's units. */
  constructor(
    readonly size: number,
    seed = 1,
  ) {
    this.seed = seed;
  }

  get count(): number {
    return this.cubes.size;
  }

  private cell(v: number): number {
    return Math.round(v / this.size);
  }

  private put(ix: number, iy: number, iz: number, color: RGB, o: ShapeOpts): void {
    const k = key(ix, iy, iz);
    this.cubes.set(k, { c: [ix, iy, iz], tag: o.tag ?? 0, glow: o.glow === true });
    this.colors.set(k, color);
  }

  /** Pour what is inside `inside` (given a cube's middle, it says how deep: > 0 is in) within the box `lo`..`hi`. */
  private pour(lo: V3, hi: V3, inside: (p: V3, w: THREE.Vector3) => Spot | null, paint: Paint, o: ShapeOpts): void {
    const s = this.size;
    const x0 = this.cell(lo[0]);
    const y0 = this.cell(lo[1]);
    const z0 = this.cell(lo[2]);
    const x1 = this.cell(hi[0]);
    const y1 = this.cell(hi[1]);
    const z1 = this.cell(hi[2]);
    for (let ix = x0; ix <= x1; ix++)
      for (let iy = y0; iy <= y1; iy++)
        for (let iz = z0; iz <= z1; iz++) {
          const p: V3 = [ix * s, iy * s, iz * s];
          if (o.clip && !o.clip(p)) continue;
          const spot = inside(p, this.w);
          if (!spot) continue;
          if (o.rough) {
            // Ragged edges: the outer cubes of the shape are kept or dropped by chance.
            if (spot.d > 1 - o.rough * 2 && hash(ix, iy, iz, this.seed) * 0.5 + 0.5 < ((spot.d - (1 - o.rough * 2)) / (o.rough * 2)) * 0.8) continue;
          }
          this.put(ix, iy, iz, typeof paint === 'function' ? paint(spot) : paint, o);
        }
  }

  private frame(rot: V3 | undefined, at: V3): void {
    if (rot) {
      this.e.set(rot[0], rot[1], rot[2], 'ZYX');
      this.q.setFromEuler(this.e);
    } else this.q.identity();
    this.mat.compose(this.w.set(at[0], at[1], at[2]), this.q, new THREE.Vector3(1, 1, 1));
    this.inv.copy(this.mat).invert();
  }

  /** An ellipsoid of radii `r` around `c`. */
  ellipsoid(c: V3, r: V3, paint: Paint, o: ShapeOpts = {}): this {
    this.frame(o.rot, c);
    const m = this.inv;
    const reach = Math.max(r[0], r[1], r[2]) + this.size;
    const v = new THREE.Vector3();
    this.pour(
      [c[0] - reach, c[1] - reach, c[2] - reach],
      [c[0] + reach, c[1] + reach, c[2] + reach],
      (p) => {
        v.set(p[0], p[1], p[2]).applyMatrix4(m);
        const d = Math.hypot(v.x / r[0], v.y / r[1], v.z / r[2]);
        return d <= 1 ? { p, t: d, d, q: [v.x, v.y, v.z] } : null;
      },
      paint,
      o,
    );
    return this;
  }

  /** A rod from `a` to `b`, `ra` thick at the start and `rb` at the end, round-ended; `flat` squeezes it across the world's x (< 1) or stretches it. */
  rod(a: V3, b: V3, ra: number, rb: number, paint: Paint, o: ShapeOpts & { flat?: number } = {}): this {
    const ax = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len2 = Math.max(1e-9, ax.lengthSq());
    const flat = o.flat ?? 1;
    const reach = Math.max(ra, rb) + this.size;
    const v = new THREE.Vector3();
    this.pour(
      [Math.min(a[0], b[0]) - reach, Math.min(a[1], b[1]) - reach, Math.min(a[2], b[2]) - reach],
      [Math.max(a[0], b[0]) + reach, Math.max(a[1], b[1]) + reach, Math.max(a[2], b[2]) + reach],
      (p) => {
        v.set(p[0] - a[0], p[1] - a[1], p[2] - a[2]);
        const t = Math.max(0, Math.min(1, v.dot(ax) / len2));
        const qx = v.x - ax.x * t;
        const qy = v.y - ax.y * t;
        const qz = v.z - ax.z * t;
        const r = ra + (rb - ra) * t;
        const d = Math.hypot(qx * flat, qy, qz) / r;
        return d <= 1 ? { p, t, d, q: [qx, qy, qz] } : null;
      },
      paint,
      o,
    );
    return this;
  }

  /**
   * A slab: a box of half-sizes `h` around `c`, turned by `o.rot`. `taper` is how much of its width and depth the top (+y) keeps,
   * as in a blade or a spike.
   */
  slab(c: V3, h: V3, paint: Paint, o: ShapeOpts & { taper?: readonly [number, number] } = {}): this {
    this.frame(o.rot, c);
    const m = this.inv;
    const tp = o.taper ?? [1, 1];
    const reach = Math.hypot(h[0], h[1], h[2]) + this.size;
    const v = new THREE.Vector3();
    this.pour(
      [c[0] - reach, c[1] - reach, c[2] - reach],
      [c[0] + reach, c[1] + reach, c[2] + reach],
      (p) => {
        v.set(p[0], p[1], p[2]).applyMatrix4(m);
        if (Math.abs(v.y) > h[1]) return null;
        const f = (v.y / h[1]) * 0.5 + 0.5;
        const kx = 1 + (tp[0] - 1) * f;
        const kz = 1 + (tp[1] - 1) * f;
        const d = Math.max(Math.abs(v.x) / (h[0] * kx), Math.abs(v.y) / h[1], Math.abs(v.z) / (h[2] * kz));
        return d <= 1 ? { p, t: f, d, q: [v.x, v.y, v.z] } : null;
      },
      paint,
      o,
    );
    return this;
  }

  /**
   * Colour the cubes of `tag` that touch (face to face) a cube that is not of `tag`: a rim of trim round a plate. `empty` also
   * counts air as something else (the plate's silhouette); `above` limits it to the cubes with air or another thing above them.
   */
  trim(tag: number, color: RGB, mode: { seam?: boolean; rim?: boolean } = { seam: true }): this {
    const edge: number[] = [];
    for (const [k, cube] of this.cubes) {
      if (cube.tag !== tag) continue;
      const [x, y, z] = cube.c;
      for (const d of DIRS) {
        const n = this.cubes.get(key(x + d.n[0], y + d.n[1], z + d.n[2]));
        if (n ? n.tag !== tag && mode.seam : mode.rim) {
          edge.push(k);
          break;
        }
      }
    }
    for (const k of edge) this.colors.set(k, color);
    return this;
  }

  /** Recolour the cubes of `tag`. */
  recolor(tag: number, f: (p: V3, c: RGB) => RGB): this {
    for (const [k, cube] of this.cubes) {
      if (cube.tag !== tag) continue;
      this.colors.set(k, f([cube.c[0] * this.size, cube.c[1] * this.size, cube.c[2] * this.size], this.colors.get(k)!));
    }
    return this;
  }

  /** Is there a cube here? */
  private has(x: number, y: number, z: number): boolean {
    return this.cubes.has(key(x, y, z));
  }

  /** The geometry of the cubes that glow (`glow`) or do not. Null when there are none. */
  build(glow: boolean): THREE.BufferGeometry | null {
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const h = this.size / 2;
    const cache = new Map<string, [number, number, number]>();
    for (const [k, cube] of this.cubes) {
      if (cube.glow !== glow) continue;
      const [x, y, z] = cube.c;
      const rgb = this.colors.get(k)!;
      const ck = rgb.join();
      let l = cache.get(ck);
      if (!l) {
        l = lin(rgb);
        cache.set(ck, l);
      }
      // Each cube is a little lighter or darker than its neighbours: the grain of fur and of beaten metal.
      const grain = 1 + 0.07 * hash(x, y, z, this.seed + 7);
      for (const d of DIRS) {
        const nx = x + d.n[0];
        const ny = y + d.n[1];
        const nz = z + d.n[2];
        if (this.has(nx, ny, nz)) continue;
        const base = pos.length / 3;
        const ao: number[] = [];
        for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
          const s1 = this.has(nx + su * d.u[0], ny + su * d.u[1], nz + su * d.u[2]) ? 1 : 0;
          const s2 = this.has(nx + sv * d.v[0], ny + sv * d.v[1], nz + sv * d.v[2]) ? 1 : 0;
          const c = this.has(nx + su * d.u[0] + sv * d.v[0], ny + su * d.u[1] + sv * d.v[1], nz + su * d.u[2] + sv * d.v[2]) ? 1 : 0;
          const level = s1 && s2 ? 0 : 3 - (s1 + s2 + c);
          ao.push(level);
          const k2 = (glow ? 1 : AO[level] * d.shade) * grain;
          pos.push(
            x * this.size + d.n[0] * h + su * d.u[0] * h + sv * d.v[0] * h,
            y * this.size + d.n[1] * h + su * d.u[1] * h + sv * d.v[1] * h,
            z * this.size + d.n[2] * h + su * d.u[2] * h + sv * d.v[2] * h,
          );
          col.push(Math.min(1, l[0] * k2), Math.min(1, l[1] * k2), Math.min(1, l[2] * k2));
        }
        // Split the quad along the diagonal that crosses the darker corners, so the shading does not show a seam.
        if (ao[0] + ao[2] >= ao[1] + ao[3]) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        else idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
      }
    }
    if (idx.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }
}
