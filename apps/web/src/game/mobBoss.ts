import { hash, jit, mix, mul, type Brick, type Painter, type Part, type RGB } from './mobPaint';

/**
 * The Hollow King: a colossus of black volcanic stone with the fire of the earth showing through its wounds.
 *
 * He is not a heap of small cubes. Every limb is carved from a signed-distance model (a handful of big, rounded and tilted slabs:
 * a barrel of a chest, a mountain of a shoulder, a thigh, a heavy square jaw ...) into a grid of small cubes, and the surface is then
 * broken up in three scales:
 *   - big chunks (a Voronoi pattern about a block across) each shoved a little out or in, so the surface is made of plates and
 *     layers of stone, with strata running round every limb;
 *   - cracks along SOME of the seams between those chunks only, deepest and widest where the heat is (the chest, the shoulders,
 *     the joints, the hands), sunk into the stone with lava in the bottom, from deep red at the rim through orange and yellow to
 *     white at the hottest places; everywhere else the stone is dark and whole;
 *   - chips and rubble.
 * The chest holds a ragged cavity of white fire half covered by broken slabs, the head a heavy brow over deep sockets with
 * burning eyes, and the hands are made of separate fingers (a clenched fist and an open, clawing hand).
 *
 * Stone and lava are separate meshes: the stone is lit (and a little self-lit so that he reads in the dark), the lava is drawn
 * full-bright (`glow`) and breathes. Flames are few and small, on the shoulders, back and the back of the crown.
 *
 * Everything is built at the king's full size (about 9.5 blocks to the tips of the crown) when the module loads: see `RIGS.hollow_king`.
 */

// ---------------------------------------------------------------------------------------------------------------------------------
// Skins
// ---------------------------------------------------------------------------------------------------------------------------------

/** Black volcanic stone with a little tone of its own, pitted, with now and then a pale fleck. */
function stone(seed: number, base: RGB): Painter {
  return (x, y) => {
    const n = hash(x >> 2, y >> 2, seed) * 0.5 + hash(x >> 1, y >> 1, seed + 1) * 0.3 + hash(x, y, seed + 2) * 0.2;
    let c = mul(base, 0.76 + 0.46 * n);
    if (hash(x, y, seed + 3) > 0.95) c = mul(c, 0.7);
    else if (hash(x, y, seed + 4) > 0.965) c = mix(c, [168, 140, 118], 0.3);
    const e = Math.min(x, y, 15 - x, 15 - y);
    if (e === 0) c = mul(c, x === 0 || y === 0 ? 1.1 : 0.84);
    return jit(c, 3, x, y, seed + 5);
  };
}

/** Stone that the lava has warmed: dark red-brown with orange flecks. */
const ember: Painter = (x, y) => {
  const n = hash(x >> 1, y >> 1, 31) * 0.6 + hash(x, y, 32) * 0.4;
  if (hash(x, y, 33) > 0.9) return jit([226, 98, 30], 12, x, y, 34);
  return jit(mul([104, 46, 32], 0.8 + 0.5 * n), 6, x, y, 35);
};

/** Lava of one heat: `a` where it is cool, `b` where it is not. */
function lava(a: RGB, b: RGB, seed: number): Painter {
  return (x, y) => {
    const n = hash(x >> 1, y >> 1, seed) * 0.6 + hash(x, y, seed + 1) * 0.4;
    return jit(mix(a, b, n), 8, x, y, seed + 2);
  };
}

/** The eyes: a hot orange-red slab, brightest in the middle, with a darker red rim. */
const eye: Painter = (x, y) => {
  const edge = Math.min(x, y, 15 - x, 15 - y);
  if (edge <= 1) return jit([214, 52, 18], 8, x, y, 41);
  if (edge <= 3) return jit([255, 96, 24], 8, x, y, 42);
  return jit([255, 150, 44], 10, x, y, 43);
};

export const BOSS_SKINS: Record<string, Painter> = {
  gol_rock_a: stone(11, [88, 74, 72]),
  gol_rock_b: stone(23, [104, 84, 78]),
  gol_rock_c: stone(37, [72, 62, 66]),
  gol_rock_d: stone(53, [122, 98, 88]),
  gol_rock_e: stone(67, [138, 110, 94]),
  gol_rock_f: stone(79, [92, 76, 90]),
  gol_ember: ember,
  gol_lava0: lava([158, 30, 12], [214, 56, 16], 51),
  gol_lava1: lava([226, 72, 16], [255, 118, 26], 52),
  gol_lava2: lava([255, 140, 30], [255, 204, 76], 53),
  gol_lava3: lava([255, 216, 124], [255, 250, 218], 54),
  gol_lava: lava([255, 140, 30], [255, 204, 76], 55),
  gol_eye: eye,
};

/** What a cube carries: an index into this list (stone 0..5, warmed stone 6, lava from cool to white-hot 7..10, an eye 11). */
const BRICK_SKINS = ['gol_rock_a', 'gol_rock_b', 'gol_rock_c', 'gol_rock_d', 'gol_rock_e', 'gol_rock_f', 'gol_ember', 'gol_lava0', 'gol_lava1', 'gol_lava2', 'gol_lava3', 'gol_eye'];
const EMBER = 6;
const LAVA0 = 7;

// ---------------------------------------------------------------------------------------------------------------------------------
// The carving machine
// ---------------------------------------------------------------------------------------------------------------------------------

type V3 = [number, number, number];

/** A rounded slab of space, centred on `c`, `h` half its size, turned by `rot` (about z, then y, then x) and thinning towards the top by `taper`. */
interface Shape {
  c: V3;
  h: V3;
  r?: number;
  rot?: V3;
  taper?: number;
}
/** A hollow cut out of the stone: its walls glow with a heat of `lava` (0..1) as far as `lining` from the edge. */
interface Cut extends Shape {
  lava?: number;
  lining?: number;
}
interface Spec {
  shapes: Shape[];
  cuts?: Cut[];
  /** Stone laid back over a hollow (the broken slabs over the heart). */
  covers?: Shape[];
  /** Hot places: [x, y, z, radius, heat]. */
  hot?: [number, number, number, number, number][];
  /** The heat of the stone everywhere else. */
  base?: number;
  seed: number;
  /** How far the chunks stand out of or sink into the surface. */
  amp?: number;
  /** The size of the chunks. */
  chunk?: number;
}

/** The size of a cube. */
const U = 0.16;

interface Prep extends Shape {
  rad: number;
  /** The box of space where the shape is nearer than 0.3 (beyond it the shape does not matter). */
  lo: V3;
  hi: V3;
  cs: [number, number, number, number, number, number];
}
function prep(s: Shape): Prep {
  const [rx, ry, rz] = s.rot ?? [0, 0, 0];
  const rad = Math.hypot(s.h[0], s.h[1], s.h[2]) + (s.r ?? 0);
  const e: V3 = s.rot ? [rad, rad, rad] : [s.h[0] + (s.r ?? 0), s.h[1] + (s.r ?? 0), s.h[2] + (s.r ?? 0)];
  const lo: V3 = [s.c[0] - e[0] - 0.3, s.c[1] - e[1] - 0.3, s.c[2] - e[2] - 0.3];
  const hi: V3 = [s.c[0] + e[0] + 0.3, s.c[1] + e[1] + 0.3, s.c[2] + e[2] + 0.3];
  return { ...s, rad, lo, hi, cs: [Math.cos(rx), Math.sin(rx), Math.cos(ry), Math.sin(ry), Math.cos(rz), Math.sin(rz)] };
}

/** The signed distance from a point to the shape: negative inside. */
function sd(p: Prep, x: number, y: number, z: number): number {
  let a = x - p.c[0];
  let b = y - p.c[1];
  let c = z - p.c[2];
  if (p.rot) {
    const [cx, sx, cy, sy, cz, sz] = p.cs;
    const a1 = a * cz + b * sz;
    const b1 = -a * sz + b * cz;
    const a2 = a1 * cy - c * sy;
    const c2 = a1 * sy + c * cy;
    const b2 = b1 * cx + c2 * sx;
    const c3 = -b1 * sx + c2 * cx;
    a = a2;
    b = b2;
    c = c3;
  }
  const r = p.r ?? 0.1;
  let hx = p.h[0];
  let hz = p.h[2];
  if (p.taper) {
    const t = Math.min(1, Math.max(0, (b + p.h[1]) / (2 * p.h[1])));
    const k = 1 - p.taper * t;
    hx *= k;
    hz *= k;
  }
  const qx = Math.abs(a) - (hx - r);
  const qy = Math.abs(b) - (p.h[1] - r);
  const qz = Math.abs(c) - (hz - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

/** A 32-bit hash of a place on a lattice. */
function rh(i: number, j: number, k: number, s: number): number {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(k, 0x9e3779b1) ^ Math.imul(s, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}
const u01 = (h: number, s: number): number => (rh(h & 0xffff, h >>> 16, 7, s) >>> 8) / 16777216;

/** Smooth value noise (0..1) on a lattice of one block. */
function vn(x: number, y: number, z: number, s: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const sz = fz * fz * (3 - 2 * fz);
  const v = (a: number, b: number, c: number): number => (rh(ix + a, iy + b, iz + c, s) >>> 8) / 16777216;
  const x00 = v(0, 0, 0) + (v(1, 0, 0) - v(0, 0, 0)) * sx;
  const x10 = v(0, 1, 0) + (v(1, 1, 0) - v(0, 1, 0)) * sx;
  const x01 = v(0, 0, 1) + (v(1, 0, 1) - v(0, 0, 1)) * sx;
  const x11 = v(0, 1, 1) + (v(1, 1, 1) - v(0, 1, 1)) * sx;
  const y0 = x00 + (x10 - x00) * sy;
  const y1 = x01 + (x11 - x01) * sy;
  return y0 + (y1 - y0) * sz;
}

const VOR = { d1: 0, d2: 0, id1: 0, id2: 0 };
/** The two nearest points of a jittered lattice of `S` blocks: their distances and identities (in `VOR`). */
function vor(x: number, y: number, z: number, S: number, seed: number): void {
  const fx = x / S;
  const fy = y / S;
  const fz = z / S;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const iz = Math.floor(fz);
  let d1 = 99;
  let d2 = 99;
  let id1 = 0;
  let id2 = 0;
  for (let a = -1; a <= 1; a++)
    for (let b = -1; b <= 1; b++)
      for (let c = -1; c <= 1; c++) {
        const h = rh(ix + a, iy + b, iz + c, seed);
        const px = ix + a + 0.12 + 0.76 * ((h & 1023) / 1023) - fx;
        const py = iy + b + 0.12 + 0.76 * (((h >>> 10) & 1023) / 1023) - fy;
        const pz = iz + c + 0.12 + 0.76 * (((h >>> 20) & 1023) / 1023) - fz;
        const dd = px * px + py * py + pz * pz;
        if (dd < d1) {
          d2 = d1;
          id2 = id1;
          d1 = dd;
          id1 = h;
        } else if (dd < d2) {
          d2 = dd;
          id2 = h;
        }
      }
  VOR.d1 = Math.sqrt(d1) * S;
  VOR.d2 = Math.sqrt(d2) * S;
  VOR.id1 = id1;
  VOR.id2 = id2;
}

/** A cube of a grid: 0 empty, else the skin + 1. */
interface Grid {
  i0: number;
  j0: number;
  k0: number;
  nx: number;
  ny: number;
  nz: number;
  skin: Uint8Array;
  shade: Float32Array;
}

/** Carves one limb: returns its stone cubes and its lava cubes, relative to the joint of the limb (the origin of the shapes). */
function carve(spec: Spec): { stone: Brick[]; lava: Brick[] } {
  const shapes = spec.shapes.map(prep);
  const cuts = (spec.cuts ?? []).map((c) => ({ ...prep(c), lava: c.lava ?? 0.8, lining: c.lining ?? U * 1.3 }));
  const covers = (spec.covers ?? []).map(prep);
  const hot = spec.hot ?? [];
  const base = (spec.base ?? 0.1) + 0.13;
  const amp = spec.amp ?? 0.3;
  const chunk = spec.chunk ?? 1.05;
  const seed = spec.seed;

  // The box of cubes that holds everything.
  let lo: V3 = [1e9, 1e9, 1e9];
  let hi: V3 = [-1e9, -1e9, -1e9];
  for (const s of [...shapes, ...covers]) {
    const e = s.rot ? [s.rad, s.rad, s.rad] : [s.h[0] + (s.r ?? 0), s.h[1] + (s.r ?? 0), s.h[2] + (s.r ?? 0)];
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a]!, s.c[a]! - e[a]! - 0.4);
      hi[a] = Math.max(hi[a]!, s.c[a]! + e[a]! + 0.4);
    }
  }
  const g: Grid = {
    i0: Math.floor(lo[0] / U) - 2,
    j0: Math.floor(lo[1] / U) - 2,
    k0: Math.floor(lo[2] / U) - 2,
    nx: 0,
    ny: 0,
    nz: 0,
    skin: new Uint8Array(0),
    shade: new Float32Array(0),
  };
  g.nx = Math.ceil(hi[0] / U) + 2 - g.i0;
  g.ny = Math.ceil(hi[1] / U) + 2 - g.j0;
  g.nz = Math.ceil(hi[2] / U) + 2 - g.k0;
  g.skin = new Uint8Array(g.nx * g.ny * g.nz);
  g.shade = new Float32Array(g.nx * g.ny * g.nz);
  const at = (i: number, j: number, k: number): number => ((i - g.i0) * g.ny + (j - g.j0)) * g.nz + (k - g.k0);
  const get = (i: number, j: number, k: number): number => {
    if (i < g.i0 || j < g.j0 || k < g.k0 || i >= g.i0 + g.nx || j >= g.j0 + g.ny || k >= g.k0 + g.nz) return 0;
    return g.skin[at(i, j, k)]!;
  };

  /** How hot the stone is at a place (0..1.3). */
  const heat = (x: number, y: number, z: number): number => {
    let h = base;
    for (const [hx, hy, hz, r, w] of hot) {
      const d = Math.hypot(x - hx, y - hy, z - hz) / r;
      if (d < 1) h += w * (1 - d) * (1 - d) * (1 + 0.6 * d);
    }
    return Math.min(1.3, h) * (0.72 + 0.56 * vn(x * 0.8, y * 0.8, z * 0.8, seed + 40));
  };
  /** The lava skin for a heat: red, orange, yellow, white. */
  const lavaSkin = (h: number): number => (h < 0.3 ? 0 : h < 0.55 ? 1 : h < 0.88 ? 2 : 3) + LAVA0;

  const lavaCells: number[] = [];
  for (let i = g.i0; i < g.i0 + g.nx; i++)
    for (let j = g.j0; j < g.j0 + g.ny; j++)
      for (let k = g.k0; k < g.k0 + g.nz; k++) {
        const x = (i + 0.5) * U;
        const y = (j + 0.5) * U;
        const z = (k + 0.5) * U;
        let d = 99;
        for (const s of shapes) if (x > s.lo[0] && x < s.hi[0] && y > s.lo[1] && y < s.hi[1] && z > s.lo[2] && z < s.hi[2]) d = Math.min(d, sd(s, x, y, z));
        let dcov = 99;
        for (const s of covers) dcov = Math.min(dcov, sd(s, x, y, z));
        if (d > 0.3 && dcov > 0.02) continue;
        let dc = 99;
        let cut: (typeof cuts)[number] | undefined;
        if (cuts.length) {
          const wob = (vn(x * 4.2, y * 4.2, z * 4.2, seed + 70) - 0.5) * 0.24;
          for (const c of cuts) {
            const v = sd(c, x, y, z) + wob;
            if (v < dc) {
              dc = v;
              cut = c;
            }
          }
        }
        const idx = at(i, j, k);
        if (dcov < 0) {
          // Broken slabs lying over a hollow.
          g.skin[idx] = 1 + (u01(rh(i >> 2, j >> 2, k >> 2, seed), 5) < 0.5 ? 0 : 2);
          g.shade[idx] = 0.85;
          continue;
        }
        if (d > 0.3 || dc < 0) continue;
        if (d < -0.52 && dc > 0.5) {
          g.skin[idx] = 1;
          g.shade[idx] = 0.5;
          continue;
        }
        vor(x, y, z, chunk, seed);
        const id1 = VOR.id1;
        const id2 = VOR.id2;
        const gap = VOR.d2 - VOR.d1;
        // The chunk is shoved out or in, and the strata (layers of stone) run round the limb.
        const layer = Math.floor(y / 0.42 + 0.9 * vn(x * 0.9, 3, z * 0.9, seed + 20));
        const off = (u01(id1, seed + 1) - 0.5) * amp + (u01(layer, seed + 2) - 0.5) * 0.11 + (vn(x * 5, y * 5, z * 5, seed + 3) - 0.5) * 0.09;
        let s = d - off;
        const ht = heat(x, y, z);
        // Some seams only open into cracks: those between chunks of the hot places most often, and not along their whole length.
        const pair = u01((id1 + id2) >>> 0, seed + 4);
        const alive = vn(x * 1.9, y * 1.9, z * 1.9, seed + 5);
        const width = (0.05 + 0.2 * Math.min(ht, 1)) * (0.55 + 0.9 * vn(x * 3.1, y * 3.1, z * 3.1, seed + 6));
        const crack = pair < 0.1 + 0.95 * Math.pow(Math.min(ht, 1), 0.85) && alive > 0.46 - 0.34 * Math.min(ht, 1) && gap < width;
        if (crack) s += 0.07 + 0.15 * Math.min(ht, 1);
        if (s >= 0) continue;
        let skin: number;
        let shade: number;
        if (cut && dc < cut.lining) {
          const fr = Math.max(0, dc / cut.lining);
          skin = lavaSkin((cut.lava * (1.1 - 0.9 * fr) + (fr < 0.3 ? 0.3 : 0)) * (0.92 + 0.16 * vn(x * 6, y * 6, z * 6, seed + 8)));
          shade = 1;
        } else if (crack && s > -U * 1.3) {
          skin = lavaSkin(ht * (0.85 + 0.45 * (1 - gap / width)));
          shade = 1;
        } else {
          const r = u01(id1, seed + 9);
          skin = r < 0.3 ? 0 : r < 0.52 ? 2 : r < 0.7 ? 1 : r < 0.82 ? 5 : r < 0.94 ? 3 : 4;
          if (hash(i, j + k * 7, seed) < 0.03) skin = (skin + 1) % 6;
          shade = 0.72 + 0.4 * u01(id1, seed + 10);
          // The seam between two chunks is a little darker, and so is the foot of a step.
          if (gap < 0.05) shade *= 0.82;
        }
        g.skin[idx] = skin + 1;
        g.shade[idx] = shade;
        if (skin >= LAVA0) lavaCells.push(idx);
      }

  // Stone near lava is warmed by it.
  const warm = (ci: number, cj: number, ck: number): void => {
    for (let a = -2; a <= 2; a++)
      for (let b = -2; b <= 2; b++)
        for (let c = -2; c <= 2; c++) {
          const i = ci + a;
          const j = cj + b;
          const k = ck + c;
          const v = get(i, j, k);
          if (v > 0 && v <= 6 && hash(i * 7 + k, j, seed + 11) < 0.55 / (1 + Math.abs(a) + Math.abs(b) + Math.abs(c) * 0.6)) g.skin[at(i, j, k)] = EMBER + 1;
        }
  };
  for (const idx of lavaCells) {
    const k = (idx % g.nz) + g.k0;
    const j = (Math.floor(idx / g.nz) % g.ny) + g.j0;
    const i = Math.floor(idx / (g.nz * g.ny)) + g.i0;
    warm(i, j, k);
  }

  // Chips and rubble: single cubes stuck on the surface, a few sticking out far.
  const dirs: V3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const chips: [number, number, number, number][] = [];
  for (let i = g.i0; i < g.i0 + g.nx; i++)
    for (let j = g.j0; j < g.j0 + g.ny; j++)
      for (let k = g.k0; k < g.k0 + g.nz; k++) {
        const v = get(i, j, k);
        if (v <= 0 || v > 7) continue;
        if (hash(i * 3 + k, j * 5 + i, seed + 12) > 0.012) continue;
        const dr = dirs[Math.floor(hash(i, k, seed + 13) * 6)]!;
        if (get(i + dr[0], j + dr[1], k + dr[2]) === 0) chips.push([i + dr[0], j + dr[1], k + dr[2], v]);
      }
  for (const [i, j, k, v] of chips) {
    if (i <= g.i0 + 1 || j <= g.j0 + 1 || k <= g.k0 + 1 || i >= g.i0 + g.nx - 2 || j >= g.j0 + g.ny - 2 || k >= g.k0 + g.nz - 2) continue;
    g.skin[at(i, j, k)] = v;
    g.shade[at(i, j, k)] = 0.9;
  }

  // The cubes with a side in the air.
  const stone: Brick[] = [];
  const lava: Brick[] = [];
  for (let i = g.i0; i < g.i0 + g.nx; i++)
    for (let j = g.j0; j < g.j0 + g.ny; j++)
      for (let k = g.k0; k < g.k0 + g.nz; k++) {
        const v = g.skin[at(i, j, k)]!;
        if (!v) continue;
        let mask = 0;
        let dark = 0;
        let faces = 0;
        for (let f = 0; f < 6; f++) {
          const ax = f >> 1;
          const sg = f & 1 ? -1 : 1;
          const n: V3 = [i, j, k];
          n[ax] += sg;
          if (get(n[0], n[1], n[2])) continue;
          mask |= 1 << f;
          faces++;
          const a1 = (ax + 1) % 3;
          const a2 = (ax + 2) % 3;
          let around = 0;
          for (let p = -1; p <= 1; p++)
            for (let q = -1; q <= 1; q++) {
              if (!p && !q) continue;
              const m: V3 = [n[0], n[1], n[2]];
              m[a1] += p;
              m[a2] += q;
              if (get(m[0], m[1], m[2])) around++;
            }
          dark += around / 8;
        }
        if (!mask) continue;
        const skin = v - 1;
        const isLava = skin >= LAVA0 && skin < LAVA0 + 4;
        const shade = isLava ? 0.92 + 0.16 * hash(i, j + k, seed + 14) : g.shade[at(i, j, k)]! * (0.93 + 0.14 * hash(i * 131 + k, j, seed)) * (1 - 0.34 * (dark / faces));
        (isLava ? lava : stone).push([(i + 0.5) * U, (j + 0.5) * U, (k + 0.5) * U, U, U, U, shade, skin, mask]);
      }
  return { stone, lava };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The king
// ---------------------------------------------------------------------------------------------------------------------------------

const B = (c: V3, h: V3, r = 0.1, rot?: V3, taper?: number): Shape => ({ c, h, r, rot, taper });

/**
 * The king, at his full size. Tall legs with great stone feet, a hunched barrel of a chest under shoulders that rise to the height
 * of his jaw, arms that hang to his knees ending in a clenched fist and an open, clawing hand, and a heavy-browed head
 * under a crown of jagged stone.
 */
export function hollowKingRig(): Part[] {
  const rig: Part[] = [];
  const add = (part: Part): number => rig.push(part) - 1;
  /** A limb: stone cubes (lit) and lava cubes (full-bright, breathing) in one place. */
  const limb = (spec: Spec, at: V3, extra: Partial<Part> = {}): number => {
    const { stone, lava } = carve(spec);
    const id = add({ size: [0.1, 0.1, 0.1], at, skin: 'gol_rock_a', bricks: stone, brickSkins: BRICK_SKINS, selfLit: 0.6, flat: true, ...extra });
    if (lava.length) add({ size: [0.1, 0.1, 0.1], at: [0, 0, 0], skin: 'gol_lava', bricks: lava, brickSkins: BRICK_SKINS, flat: true, glow: true, pulse: 0.1, of: id });
    return id;
  };
  /** A small lump of white-hot lava in a joint, seen in the gap when the limb bends. */
  const joint = (of: number, at: V3, size: V3): void => {
    add({ size, at, skin: 'gol_lava1', flat: true, glow: true, pulse: 0.14, of });
  };
  const fire = (of: number, at: V3, w: number, h: number): void => {
    add({ size: [w, h, w], at, skin: 'gol_lava', flat: true, of, flame: rig.length * 0.37 });
  };
  let seed = 200;

  // --- the legs: thick columns of stone with armoured knees and great feet with toes, hot in the hip, the knee and the ankle.
  for (const s of [-1, 1]) {
    const x = (v: number): number => v * s;
    const thigh = limb(
      {
        seed: seed++,
        base: 0.08,
        hot: [[0, -0.1, 0, 0.9, 0.7], [0, -2.0, -0.2, 0.9, 0.75]],
        shapes: [
          B([0, -1.05, 0], [0.9, 1.08, 0.9], 0.2),
          B([x(0.74), -0.5, 0.05], [0.36, 0.62, 0.85], 0.1),
          B([0, -1.95, -0.7], [0.64, 0.4, 0.36], 0.12),
          B([0, -1.0, -0.82], [0.6, 0.72, 0.12], 0.06),
          B([x(-0.66), -0.4, -0.5], [0.3, 0.5, 0.4], 0.08),
        ],
      },
      [x(1.4), 4.35, 0.05],
      { hang: true, swing: s },
    );
    const shin = limb(
      {
        seed: seed++,
        base: 0.1,
        hot: [[0, -0.05, -0.2, 0.9, 0.7], [0, -1.6, -0.1, 0.9, 0.65]],
        shapes: [
          B([0, -0.82, 0.02], [0.82, 0.82, 0.84], 0.2),
          B([0, -0.76, -0.8], [0.56, 0.76, 0.12], 0.06),
          B([0, -0.12, -0.72], [0.72, 0.26, 0.3], 0.1),
          B([0, -0.6, 0.82], [0.6, 0.55, 0.2], 0.08),
          B([0, -1.5, 0], [0.7, 0.2, 0.72], 0.08),
        ],
      },
      [0, -2.15, 0],
      { hang: true, of: thigh, bend: 0.9 },
    );
    joint(thigh, [0, -2.1, -0.05], [1.05, 0.4, 1.0]);
    const foot = limb(
      {
        seed: seed++,
        base: 0.1,
        hot: [[0, 0.2, 0.2, 1.0, 0.6], [0, -0.2, -1.6, 1.0, 0.3]],
        shapes: [
          B([0, -0.14, -0.1], [1.0, 0.26, 1.35], 0.1),
          B([0, 0.2, 0.3], [0.8, 0.26, 0.8], 0.12),
          B([0, -0.1, 1.0], [0.7, 0.3, 0.4], 0.08),
          ...[-0.72, -0.24, 0.24, 0.72].map((tx, n) => B([tx, -0.2, -1.65 - (n === 1 || n === 2 ? 0.08 : 0)], [0.21, 0.2, 0.4], 0.06)),
        ],
        cuts: [-0.48, 0, 0.48].map((tx) => ({ ...B([tx, -0.2, -1.95], [0.08, 0.16, 0.2], 0.02), lava: 0.5, lining: 0.1 })),
      },
      [0, -1.8, -0.3],
      { of: shin },
    );
    joint(shin, [0, -1.8, -0.3], [1.0, 0.35, 0.95]);
    void foot;
    if (s > 0) fire(shin, [0, -0.1, -0.9], 0.6, 0.8);
  }

  // --- the hips: a belt of dark stone with the fire showing at its seams.
  limb(
    {
      seed: seed++,
      base: 0.4,
      hot: [[0, 0, -0.6, 1.5, 0.45]],
      shapes: [B([0, 0, 0], [1.9, 0.5, 0.96], 0.2), B([0, -0.15, -0.9], [1.1, 0.46, 0.2], 0.08), B([-1.8, -0.2, 0], [0.3, 0.45, 0.8], 0.08), B([1.8, -0.2, 0], [0.3, 0.45, 0.8], 0.08)],
    },
    [0, 4.55, 0.05],
  );

  // --- the torso: a barrel of a chest leaning forward, a hump on the back, the heart a ragged cavity of white fire half closed by broken slabs.
  const torso = limb(
    {
      seed: seed++,
      base: 0.12,
      amp: 0.34,
      hot: [[0, 1.05, -1.2, 2.9, 1.2], [-2.2, 1.9, 0, 1.6, 0.9], [2.2, 1.9, 0, 1.6, 0.9], [0, -0.5, -0.6, 1.5, 0.65], [0, 0.8, 1.0, 1.6, 0.5], [-1.5, 0.4, 0.2, 1.2, 0.5], [1.5, 0.4, 0.2, 1.2, 0.5]],
      shapes: [
        B([0, -0.45, 0], [1.55, 0.78, 1.0], 0.25),
        B([0, -0.3, -0.75], [1.1, 0.6, 0.35], 0.1),
        B([0, 1.65, -0.05], [2.4, 0.7, 1.32], 0.3),
        B([0, 0.6, 0], [1.85, 0.5, 1.15], 0.25),
        B([-1.1, 1.3, -0.9], [1.0, 0.7, 0.5], 0.2, [0, 0, 0.2]),
        B([1.1, 1.3, -0.9], [1.0, 0.7, 0.5], 0.2, [0, 0, -0.2]),
        B([0, 1.55, 0.85], [2.0, 0.95, 0.85], 0.3),
        B([0, 2.2, -0.5], [2.0, 0.24, 0.5], 0.1),
        B([0, 2.35, 1.0], [0.5, 0.4, 0.3], 0.1),
        B([-1.1, 2.15, 0.9], [0.4, 0.3, 0.3], 0.1),
        B([1.1, 2.15, 0.9], [0.4, 0.3, 0.3], 0.1),
      ],
      cuts: [{ ...B([0, 1.05, -1.4], [0.72, 0.7, 0.62], 0.34), lava: 0.7, lining: 0.3 }],
      covers: [B([-0.1, 1.32, -1.38], [0.62, 0.09, 0.16], 0.05, [0, 0, 0.62]), B([0.42, 0.62, -1.4], [0.3, 0.22, 0.14], 0.06, [0, 0, -0.3]), B([-0.38, 0.55, -1.36], [0.2, 0.2, 0.12], 0.05)],
    },
    [0, 5.3, 0],
    { rotX: -0.16 },
  );
  // The back: a few flames along the spine.
  fire(torso, [0, 2.5, 1.1], 1.1, 1.5);
  fire(torso, [-1.3, 2.2, 1.0], 0.8, 1.1);
  fire(torso, [1.3, 2.2, 1.0], 0.8, 1.1);

  // --- the head: broad, square-jawed, a heavy brow over deep sockets with burning eyes, a crown of jagged stone.
  const crown: Shape[] = [
    [-0.62, -0.5, 0.95, 0.9],
    [0.62, -0.46, 0.75, 0.85],
    [-0.98, -0.1, 1.15, 0.7],
    [0.98, -0.1, 0.9, 0.7],
    [-0.5, 0.45, 1.35, 0.85],
    [0.45, 0.5, 1.6, 1.0],
    [0, 0.62, 1.15, 1.02],
    [-0.2, -0.15, 0.55, 0.7],
  ].map(([cx, cz, hh, sc]) => B([cx!, 0.62 + hh! * 0.5, cz!], [0.27 * sc!, hh! * 0.5, 0.27 * sc!], 0.05, [cz! * 0.28, 0, -cx! * 0.28], 0.78));
  const head = limb(
    {
      seed: seed++,
      base: -0.04,
      hot: [[0, -1.0, 0.3, 0.8, 0.6], [0, -1.2, -0.5, 0.5, 0.25]],
      shapes: [
        B([0, 0.05, 0], [1.08, 0.78, 1.0], 0.22),
        B([0, 0.5, -0.86], [1.14, 0.22, 0.34], 0.06),
        B([-0.62, 0.54, -0.86], [0.55, 0.15, 0.26], 0.05, [0, 0, -0.28]),
        B([0.62, 0.54, -0.86], [0.55, 0.15, 0.26], 0.05, [0, 0, 0.28]),
        B([-0.84, -0.25, -0.7], [0.3, 0.25, 0.28], 0.08),
        B([0.84, -0.25, -0.7], [0.3, 0.25, 0.28], 0.08),
        B([0, -0.08, -0.95], [0.17, 0.3, 0.15], 0.05),
        B([0, -0.62, -0.45], [0.88, 0.3, 0.6], 0.1),
        B([0, -0.8, -0.85], [0.52, 0.2, 0.2], 0.06),
        B([0, -1.05, 0.3], [0.7, 0.6, 0.6], 0.12),
        B([-1.02, 0, 0.15], [0.2, 0.3, 0.35], 0.06),
        B([1.02, 0, 0.15], [0.2, 0.3, 0.35], 0.06),
      ...crown,
    ],
      cuts: [
        { ...B([-0.45, 0.16, -1.0], [0.4, 0.2, 0.3], 0.04), lining: -1 },
        { ...B([0.45, 0.16, -1.0], [0.4, 0.2, 0.3], 0.04), lining: -1 },
        { ...B([0, -0.56, -1.02], [0.5, 0.08, 0.2], 0.02), lining: -1 },
      ],
    },
    [0, 3.25, -0.8],
    { of: torso, isHead: true },
  );
  for (const s of [-1, 1]) add({ size: [0.6, 0.22, 0.1], at: [s * 0.45, 0.16, -0.76], skin: 'gol_eye', flat: true, glow: true, pulse: 0.16, of: head });
  fire(head, [0, 1.35, 0.75], 0.7, 1.0);

  // --- the arms: a mountain of a shoulder (the left broader, the right with spikes), a thick upper arm, an elbow, a forearm, and a
  // hand much bigger than his head: the right a clenched fist, the left an open claw.
  for (const s of [-1, 1]) {
    const x = (v: number): number => v * s;
    const spiky = s > 0;
    const pauldron = limb(
      {
        seed: seed++ + (s > 0 ? 0 : 7),
        base: 0.15,
        amp: 0.36,
        hot: [[x(-1.0), -0.3, 0, 1.3, 0.8]],
        shapes: [
          B([0, 0, 0], [spiky ? 1.2 : 1.35, 0.78, 1.25], 0.3),
          B([0, 0.68, 0], [spiky ? 1.28 : 1.5, 0.28, spiky ? 1.3 : 1.45], 0.15, [0, 0, x(-0.12)]),
          B([x(0.92), 0.32, 0], [0.46, 0.56, 1.1], 0.1),
          ...(spiky
            ? [
                B([x(0.4), 1.25, 0.1], [0.3, 0.55, 0.3], 0.05, [0, 0, x(-0.2)], 0.82),
                B([x(1.05), 1.0, -0.5], [0.22, 0.42, 0.22], 0.04, [0, 0, x(-0.35)], 0.85),
                B([x(0.85), 1.0, 0.6], [0.24, 0.46, 0.24], 0.04, [0, 0, x(-0.3)], 0.85),
                B([x(-0.2), 1.2, 0.75], [0.2, 0.46, 0.2], 0.04, [0, 0, 0], 0.85),
              ]
            : [
                B([x(0.6), 0.98, 0.05], [0.95, 0.24, 1.2], 0.1, [0, 0, x(-0.1)]),
                B([x(1.2), 1.1, 0.2], [0.24, 0.5, 0.24], 0.04, [0, 0, x(-0.4)], 0.85),
                B([x(0.3), 1.35, -0.5], [0.2, 0.5, 0.2], 0.04, [0, 0, x(-0.15)], 0.85),
              ]),
        ],
      },
      [x(3.1), 2.0, 0.05],
      { of: torso },
    );
    fire(pauldron, [x(0.3), 1.65, 0.1], 0.9, 1.2);
    const upper = limb(
      {
        seed: seed++,
        base: 0.1,
        hot: [[0, 0, 0, 1.0, 0.7], [0, -2.5, 0, 0.9, 0.8]],
        shapes: [
          B([0, -1.25, 0], [0.95, 1.3, 0.95], 0.22),
          B([0, -0.9, -0.3], [0.9, 0.7, 0.65], 0.2),
          B([x(0.8), -1.2, 0], [0.3, 0.7, 0.7], 0.08),
          B([0, -2.35, 0.05], [0.82, 0.22, 0.82], 0.08),
        ],
      },
      [x(3.45), 1.85, 0.05],
      { hang: true, of: torso, swing: s * 0.45, rotX: 0.15, rotZ: s * 0.16, strike: 1, raise: 1.9 },
    );
    const fore = limb(
      {
        seed: seed++,
        base: 0.1,
        hot: [[0, 0.1, 0.1, 0.9, 0.8], [0, -2.1, 0, 0.9, 0.8]],
        shapes: [
          B([0, -1.2, 0], [0.9, 1.08, 0.9], 0.2),
          B([0, -0.12, 0.55], [0.66, 0.5, 0.45], 0.1),
          B([0, -1.2, -0.85], [0.66, 0.86, 0.15], 0.06),
          B([0, -2.1, 0], [0.8, 0.2, 0.8], 0.08),
        ],
      },
      [0, -2.7, 0],
      { hang: true, of: upper, rotX: 0.3, rotZ: -s * 0.03 },
    );
    joint(upper, [0, -2.65, 0], [1.0, 0.4, 0.95]);
    joint(fore, [0, -2.4, 0], [0.9, 0.35, 0.88]);
    if (s > 0) {
      // The clenched fist: a mass of knuckles, four fingers folded over it with slits of fire between them, and a thumb across.
      const fx = [-0.75, -0.25, 0.25, 0.75];
      limb(
        {
          seed: seed++,
          base: 0.22,
          hot: [[0, 0.2, 0, 1.1, 0.7]],
          shapes: [
            B([0, -0.72, 0.12], [0.98, 0.7, 0.82], 0.2),
            B([0, -0.12, 0.1], [0.78, 0.2, 0.7], 0.08),
            ...fx.map((px) => B([px, -0.85, -0.82], [0.215, 0.5, 0.3], 0.06)),
            ...fx.map((px) => B([px, -1.42, -0.55], [0.215, 0.2, 0.44], 0.06)),
            B([0.52, -1.2, -1.1], [0.45, 0.2, 0.2], 0.06, [0, -0.3, 0]),
            B([-0.9, -0.75, -0.3], [0.2, 0.4, 0.45], 0.06),
          ],
          cuts: [-0.5, 0, 0.5].map((px) => ({ ...B([px, -0.95, -1.1], [0.08, 0.55, 0.2], 0.02), lava: 0.7, lining: 0.12 })),
        },
        [0, -2.45, 0],
        { of: fore },
      );
    } else {
      // The open hand: a broad palm and four fingers curling forward like claws, and a thumb out to the side.
      const fx = [-0.78, -0.26, 0.26, 0.78];
      limb(
        {
          seed: seed++,
          base: 0.22,
          hot: [[0, 0.2, 0, 1.1, 0.7]],
          shapes: [
            B([0, -0.62, 0.05], [0.98, 0.58, 0.4], 0.16),
            B([0, -0.1, 0.05], [0.78, 0.2, 0.55], 0.08),
            ...fx.map((px, n) => B([px, -1.5 - (n === 1 || n === 2 ? 0.08 : 0), -0.05], [0.25, 0.5, 0.27], 0.06, [0.12, 0, 0], 0.15)),
            ...fx.map((px, n) => B([px, -2.0 - (n === 1 || n === 2 ? 0.1 : 0), -0.4], [0.23, 0.3, 0.24], 0.06, [0.7, 0, 0], 0.25)),
            B([1.05, -0.85, -0.25], [0.28, 0.44, 0.24], 0.06, [0, 0, 0.55]),
          ],
          cuts: [-0.52, 0, 0.52].map((px) => ({ ...B([px, -1.5, 0], [0.08, 0.6, 0.35], 0.02), lava: 0.7, lining: 0.12 })),
        },
        [0, -2.45, 0],
      { of: fore },
    );
    }
  }
  return rig;
}
