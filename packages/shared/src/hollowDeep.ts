/**
 * The Hollow Deep: the dungeon of the Hollow King, a cave system that goes down and down.
 *
 * It is made like the caves of the overworld (see caves.ts and caveDecor.ts): winding tunnels with arched roofs, big
 * lumpy caverns, pillars of rock, pools and lakes, and the same country on the walls: a lush cave of moss and glowing
 * vines, a dripstone cave of stalagmites and stalactites, an amethyst geode, and below them a dark cave of deepslate and
 * lava. There is one way down, but it is a long one, and side tunnels lead to things to find.
 *
 * Measures are the dungeon's own: `u` east from the copy's west edge, `v` south of its middle, `y` the height. A copy is
 * a block of rock, `DEEP_U` by `DEEP_V` and 120 high, with the caves cut in it. Every cave is a heightmap (a floor and a
 * height of air over each column), kept in a few layers so that two caves may lie over one another; the floors are
 * smoothed so that no step is more than one block, which is what makes every part of the caves walkable.
 *
 * The result is a pure function of the seed.
 */
import { B, DRESS, GROVE, IS_SOLID } from './blocks';
import type { LootTableName } from './loot';
import type { MobKind } from './mobs';
import { hash2 } from './noise';
import { railBlock, railInfo, wantedShape } from './rails';

export const DEEP_U = 320;
export const DEEP_V = 192;
/** `v` of the first row of a copy. */
export const DEEP_V0 = -96;
/** The lowest and the highest (exclusive) height a copy holds; below and above it is rock. */
export const DEEP_Y0 = 48;
export const DEEP_Y1 = 168;
const DY = DEEP_Y1 - DEEP_Y0;

export type DeepTheme = 'camp' | 'plain' | 'lush' | 'drip' | 'amethyst' | 'dark' | 'lair' | 'mine';
const THEMES: readonly DeepTheme[] = ['camp', 'plain', 'lush', 'drip', 'amethyst', 'dark', 'lair', 'mine'];
const themeId = (t: DeepTheme): number => THEMES.indexOf(t) + 1;

export interface DeepPost {
  kind: MobKind;
  /** Which layer of caves it is in (0 the lush levels, 1 the deep ones, 2 the lair). */
  layer: number;
  u: number;
  v: number;
  /** The height a monster stands at (the air over the floor). */
  y: number;
  elite?: number;
}
export interface DeepSpot {
  u: number;
  v: number;
  /** The height of the air cell over the floor, which is where a person, a chest or a cage stands. */
  y: number;
}
export interface DeepGate {
  id: 'court' | 'throne';
  name: string;
  /** Indices into `cages` of the cages that hold the gate. */
  cages: number[];
  /** The bars are one block thick along u, across v0..v1 and y0..y1 (inclusive). */
  u: number;
  v0: number;
  v1: number;
  y0: number;
  y1: number;
}
export interface DeepModel {
  readonly fy: number;
  readonly grid: Uint16Array;
  readonly entry: DeepSpot & { yaw: number };
  readonly hale: DeepSpot & { yaw: number };
  readonly cages: DeepSpot[];
  readonly gates: DeepGate[];
  readonly boss: DeepSpot & { yaw: number };
  readonly arena: { u0: number; u1: number; v0: number; v1: number };
  readonly chests: (DeepSpot & { table: LootTableName })[];
  readonly posts: DeepPost[];
  /** Where the portal that leads out stands after the boss has fallen (a frame of obsidian along v, the portal between its posts). */
  readonly exitPortal: DeepSpot;
  /** The columns of rock no player can dig through (u of each wall that shuts a part of the dungeon off from the next; the gates are holes in them). */
  readonly seals: number[];
  /** Blocks that are protected whatever else may be changed (the bars of the gates, the portal out in the camp). */
  protectedAt(u: number, y: number, v: number): boolean;
  /** The standing height over a floor of layer `layer` (or -1 where there is none). */
  standAt(layer: number, u: number, v: number): number;
  /** Copies the part of the dungeon that lies in the chunk at (ox, oz) of a copy whose west edge is at x0 and north edge (v = DEEP_V0) at z0. */
  fillChunk(blocks: Uint16Array, ox: number, oz: number, x0: number, z0: number, blockIndex: (x: number, y: number, z: number) => number): void;
  /** The caves seen from above, for tests and tools: one character per column. */
  topView(): string;
}

// ---- noise -------------------------------------------------------------------------------------

const smooth = (t: number): number => t * t * (3 - 2 * t);
const clamp = (n: number, lo: number, hi: number): number => (n < lo ? lo : n > hi ? hi : n);

function vn2(s: number, x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const sx = smooth(x - ix);
  const sz = smooth(z - iz);
  const a = hash2(s, ix, iz);
  const b = hash2(s, ix + 1, iz);
  const c = hash2(s, ix, iz + 1);
  const d = hash2(s, ix + 1, iz + 1);
  const top = a + (b - a) * sx;
  return top + (c + (d - c) * sx - top) * sz;
}

function vn3(s: number, x: number, y: number, z: number): number {
  const iy = Math.floor(y);
  const f = smooth(y - iy);
  const a = vn2(s + iy * 7919, x, z);
  const b = vn2(s + (iy + 1) * 7919, x, z);
  return a + (b - a) * f;
}

// ---- the layers --------------------------------------------------------------------------------

const NONE = -32768;
const N = DEEP_U * DEEP_V;
const col = (u: number, v: number): number => (u < 1 || u > DEEP_U - 2 || v < DEEP_V0 + 1 || v > DEEP_V0 + DEEP_V - 2 ? -1 : (v - DEEP_V0) * DEEP_U + u);
const colU = (i: number): number => i % DEEP_U;
const colV = (i: number): number => Math.floor(i / DEEP_U) + DEEP_V0;
const NEIGHBOURS = [1, -1, DEEP_U, -DEEP_U];

/** One layer of caves: a floor (the height of the top block of the floor) and a height of air over it, for every column that has any. */
class Layer {
  readonly F = new Int16Array(N).fill(NONE);
  readonly H = new Uint8Array(N);
  /** The path through the caves: these floors are never moved. */
  readonly pin = new Uint8Array(N);
  readonly theme = new Uint8Array(N);
  readonly prio = new Uint8Array(N);
  /** Rock that nothing may open (pillars, the walls of a gate). */
  readonly rock = new Uint8Array(N);
  /** 0 nothing, 1 lava, 2 water: a pool whose surface is at `Ls`. */
  readonly liquid = new Uint8Array(N);
  readonly Ls = new Int16Array(N);
  /** Where nothing is to be put: monsters, chests and cages stand here. */
  readonly keep = new Uint8Array(N);

  open(i: number): boolean {
    return this.F[i] !== NONE;
  }

  put(i: number, f: number, h: number, theme: number, prio: number): void {
    if (i < 0 || this.rock[i]) return;
    if (this.F[i] === NONE) {
      this.F[i] = f;
      this.H[i] = h;
      this.theme[i] = theme;
      this.prio[i] = prio;
      return;
    }
    if (!this.pin[i] && prio > this.prio[i]) this.F[i] = f;
    if (h > this.H[i]) this.H[i] = h;
    if (prio >= this.prio[i]) {
      this.theme[i] = theme;
      this.prio[i] = prio;
    }
  }

  pinAt(i: number, f: number, theme: number): void {
    if (i < 0 || this.rock[i]) return;
    this.F[i] = f;
    this.pin[i] = 1;
    if (this.H[i] < 5) this.H[i] = 5;
    if (this.theme[i] === 0 || this.prio[i] < 1) {
      this.theme[i] = theme;
      this.prio[i] = 1;
    }
  }

  /** Smooth the floors so that no two neighbouring columns differ by more than one block (the path stays as it is). */
  relax(): void {
    for (let it = 0; it < 14; it++) {
      const forward = it % 2 === 0;
      for (let k = 0; k < N; k++) {
        const i = forward ? k : N - 1 - k;
        if (this.F[i] === NONE || this.pin[i]) continue;
        let lo = -Infinity;
        let hi = Infinity;
        for (const d of NEIGHBOURS) {
          const j = i + d;
          if (j < 0 || j >= N || this.F[j] === NONE) continue;
          if (this.F[j] - 1 > lo) lo = this.F[j] - 1;
          if (this.F[j] + 1 < hi) hi = this.F[j] + 1;
        }
        if (lo === -Infinity) continue;
        let f = this.F[i];
        if (lo > hi) f = Math.round((lo + hi) / 2);
        else f = clamp(f, lo, hi);
        this.F[i] = f;
      }
    }
  }
}

// ---- shapes ------------------------------------------------------------------------------------

type P3 = [number, number, number];

/** A smooth curve through the points (Catmull-Rom), sampled every half block; `wobble` bends it between the points. */
function sampleSpline(pts: readonly P3[], s: number, wobble: number): P3[] {
  const out: P3[] = [];
  const at = (i: number): P3 => pts[clamp(i, 0, pts.length - 1)];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
    const n = Math.max(2, Math.ceil(len / 0.5));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const cr = (a: number, b: number, c: number, d: number): number => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      const w = Math.sin(Math.PI * t) * wobble;
      total += 0.5;
      out.push([
        cr(p0[0], p1[0], p2[0], p3[0]) + (vn2(s + 5, total * 0.07, 3.3) - 0.5) * 2 * w,
        cr(p0[1], p1[1], p2[1], p3[1]) + (vn2(s + 6, total * 0.07, 9.1) - 0.5) * 2 * w,
        cr(p0[2], p1[2], p2[2], p3[2]),
      ]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

interface TunnelSpec {
  layer: number;
  pts: readonly P3[];
  r: number;
  theme: DeepTheme;
  /** Bends between the points (default 1.5). */
  wobble?: number;
  /** A mineshaft: square, straight, without alcoves. */
  square?: boolean;
  /** No alcoves along it. */
  plain?: boolean;
}

interface ChamberSpec {
  layer: number;
  u: number;
  v: number;
  /** The depth of the floor (below the camp's) at the middle. */
  d: number;
  rx: number;
  rz: number;
  /** The height of the roof at the middle. */
  h: number;
  /** How much the floor rolls. */
  amp?: number;
  theme: DeepTheme;
  salt?: number;
}

const tunnelHeight = (dist: number, r: number): number => {
  const a = Math.sqrt(Math.max(0, 1 - (dist / r) * (dist / r)));
  return Math.max(3, Math.round(2.4 + a * (r * 0.85 + 1.6)));
};

// ---- the model ---------------------------------------------------------------------------------

/** The two walls of bedrock, across the whole of the dungeon, with a gate in each: nobody gets past one by digging. */
export const SEAL_ONE = 113;
export const SEAL_TWO = 200;

const cache = new Map<string, DeepModel>();

export function buildHollowDeep(seed: number, fy: number): DeepModel {
  const key = `${seed}:${fy}`;
  let m = cache.get(key);
  if (!m) {
    m = new DeepBuilder(seed + 700, fy).build();
    if (cache.size > 4) cache.delete(cache.keys().next().value as string);
    cache.set(key, m);
  }
  return m;
}

interface Anchor {
  layer: number;
  u: number;
  v: number;
}

class DeepBuilder {
  readonly layers = [new Layer(), new Layer(), new Layer()];
  readonly grid = new Uint16Array(DEEP_U * DEEP_V * DY).fill(B.STONE);
  readonly chests: (DeepSpot & { table: LootTableName; layer: number })[] = [];
  readonly posts: DeepPost[] = [];
  readonly cages: (DeepSpot & { layer: number })[] = [];
  private readonly keepList: (Anchor & { r: number })[] = [];
  /** The cells of every layer's path, for tests of reach and for keeping the pools clear of it. */
  private readonly pathCells: Anchor[] = [];

  constructor(
    private readonly s: number,
    private readonly fy: number,
  ) {}

  private cellIndex(u: number, y: number, v: number): number {
    return ((y - DEEP_Y0) * DEEP_V + (v - DEEP_V0)) * DEEP_U + u;
  }
  private get(u: number, y: number, v: number): number {
    if (u < 0 || u >= DEEP_U || v < DEEP_V0 || v >= DEEP_V0 + DEEP_V || y < DEEP_Y0 || y >= DEEP_Y1) return B.STONE;
    return this.grid[this.cellIndex(u, y, v)];
  }
  private set(u: number, y: number, v: number, id: number): void {
    if (u < 0 || u >= DEEP_U || v < DEEP_V0 || v >= DEEP_V0 + DEEP_V || y < DEEP_Y0 || y >= DEEP_Y1) return;
    this.grid[this.cellIndex(u, y, v)] = id;
  }
  private box(u0: number, y0: number, v0: number, u1: number, y1: number, v1: number, id: number): void {
    for (let v = Math.min(v0, v1); v <= Math.max(v0, v1); v++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let u = Math.min(u0, u1); u <= Math.max(u0, u1); u++) this.set(u, y, v, id);
  }

  // ---- shapes into layers ----

  private tunnel(t: TunnelSpec): void {
    const L = this.layers[t.layer];
    const th = themeId(t.theme);
    const salt = Math.floor(t.pts[0][0] * 31 + t.pts[0][1] * 17 + t.pts.length);
    const samples = sampleSpline(t.pts, this.s + salt, t.wobble ?? 1.5);
    // The path: one cell at a time, never more than a block of height between two.
    const cells: { u: number; v: number; y: number; r: number }[] = [];
    for (let k = 0; k < samples.length; k++) {
      const [pu, pv, pd] = samples[k];
      const u = Math.round(pu);
      const v = Math.round(pv);
      const last = cells[cells.length - 1];
      if (last && last.u === u && last.v === v) continue;
      let y = Math.round(this.fy - pd);
      if (last) y = clamp(y, last.y - 1, last.y + 1);
      const r = t.square ? t.r : t.r * (0.86 + 0.34 * vn2(this.s + 21, k * 0.06, salt));
      cells.push({ u, v, y, r });
    }
    for (const c of cells) {
      L.pinAt(col(c.u, c.v), c.y, th);
      this.pathCells.push({ layer: t.layer, u: c.u, v: c.v });
    }
    // The width: every column near the path that lies within the (ragged) radius of its nearest cell.
    const best = new Map<number, { dist: number; y: number; r: number }>();
    for (const c of cells) {
      const rad = Math.ceil(c.r * 1.3 + 1);
      for (let dv = -rad; dv <= rad; dv++) {
        for (let du = -rad; du <= rad; du++) {
          const i = col(c.u + du, c.v + dv);
          if (i < 0) continue;
          const dist = Math.hypot(du, dv);
          const ragged = t.square ? 1 : 0.78 + 0.5 * vn2(this.s + 22, (c.u + du) * 0.23, (c.v + dv) * 0.23);
          if (dist > c.r * ragged && dist > 1.5) continue;
          const prev = best.get(i);
          if (!prev || dist < prev.dist) best.set(i, { dist, y: c.y, r: c.r });
        }
      }
    }
    for (const [i, b] of best) {
      const u = colU(i);
      const v = colV(i);
      const bump = !t.square && b.dist > 1.7 && vn2(this.s + 23, u * 0.55, v * 0.55) > 0.8 ? 1 : 0;
      const h = t.square ? 4 : tunnelHeight(b.dist, b.r);
      L.put(i, b.y + bump, h, th, 1);
    }
    // Alcoves: now and then a lumpy side chamber off the path, at the same floor.
    if (!t.plain && !t.square) {
      for (let k = 12; k < cells.length - 12; k += 14 + Math.floor(hash2(this.s + 24, k, salt) * 8)) {
        const c = cells[k];
        const a = cells[k - 4];
        const b = cells[k + 4];
        const hu = b.u - a.u;
        const hv = b.v - a.v;
        const len = Math.hypot(hu, hv) || 1;
        const side = hash2(this.s + 25, k, salt) < 0.5 ? -1 : 1;
        const off = c.r + 1.5 + hash2(this.s + 26, k, salt) * 2.5;
        const rr = 2.5 + hash2(this.s + 27, k, salt) * 3.2;
        this.chamberAt(t.layer, c.u + (-hv / len) * side * off, c.v + (hu / len) * side * off, c.y, rr, rr, 5 + hash2(this.s + 28, k, salt) * 4, 0, th, 1, k + salt);
      }
    }
  }

  private chamber(c: ChamberSpec): void {
    this.chamberAt(c.layer, c.u, c.v, this.fy - c.d, c.rx, c.rz, c.h, c.amp ?? 1.5, themeId(c.theme), 2, c.salt ?? Math.floor(c.u * 7 + c.v * 13));
  }

  /** A lumpy cavern: an ellipse with a ragged edge, a roof that domes, a floor that rolls (less near the edge and the middle). */
  private chamberAt(layer: number, cu: number, cv: number, yFloor: number, rx: number, rz: number, h: number, amp: number, th: number, prio: number, salt: number): void {
    const L = this.layers[layer];
    const ru = Math.ceil(rx * 1.5) + 1;
    const rv = Math.ceil(rz * 1.5) + 1;
    for (let v = Math.floor(cv) - rv; v <= Math.floor(cv) + rv; v++) {
      for (let u = Math.floor(cu) - ru; u <= Math.floor(cu) + ru; u++) {
        const i = col(u, v);
        if (i < 0) continue;
        const r = Math.hypot((u - cu) / rx, (v - cv) / rz);
        const m = 0.8 + 0.46 * vn2(this.s + 31 + salt, u * 0.17, v * 0.17) + 0.1 * vn2(this.s + 32 + salt, u * 0.5, v * 0.5);
        const q = r / m;
        if (q >= 1) continue;
        const roll = amp * (vn2(this.s + 33 + salt, u * 0.11, v * 0.11) - 0.5) * 2 * smooth(clamp((q - 0.2) / 0.5, 0, 1)) * smooth(clamp((1 - q) / 0.3, 0, 1));
        const dome = Math.pow(Math.max(0, 1 - q * q), 0.55);
        const hh = Math.max(3, Math.round(h * dome + (vn2(this.s + 34 + salt, u * 0.3, v * 0.3) - 0.5) * 2));
        L.put(i, Math.round(yFloor + roll), hh, th, prio);
      }
    }
  }

  /** A flat floor over a rectangle (a room made, or a stretch that must be level), with at least `h` of air. */
  private level(layer: number, u0: number, u1: number, v0: number, v1: number, y: number, h: number, th: number): void {
    const L = this.layers[layer];
    for (let v = v0; v <= v1; v++) {
      for (let u = u0; u <= u1; u++) {
        const i = col(u, v);
        if (i < 0) continue;
        L.rock[i] = 0;
        if (L.F[i] === NONE) L.put(i, y, h, th, 3);
        L.F[i] = y;
        L.pin[i] = 1;
        if (L.H[i] < h) L.H[i] = h;
      }
    }
  }

  /** A straight corridor along u, three wide and four high, with solid rock either side (the walls of a gate). */
  private corridor(layer: number, u0: number, u1: number, v: number, y: number, th: number): void {
    const L = this.layers[layer];
    for (let vv = v - 4; vv <= v + 4; vv++) {
      for (let u = u0; u <= u1; u++) {
        const i = col(u, vv);
        if (i < 0) continue;
        if (Math.abs(vv - v) <= 1) {
          L.rock[i] = 0;
          L.F[i] = y;
          L.pin[i] = 1;
          L.H[i] = 4;
          L.theme[i] = th;
          L.prio[i] = 9;
        } else {
          L.F[i] = NONE;
          L.H[i] = 0;
          L.pin[i] = 0;
          L.rock[i] = 1;
        }
      }
    }
  }

  private keepAround(layer: number, u: number, v: number, r: number): void {
    this.keepList.push({ layer, u, v, r });
  }

  /** Pillars of rock in a cavern, away from the path and from what must stay clear. */
  private pillars(layer: number, cu: number, cv: number, rx: number, rz: number, n: number, salt: number): void {
    const L = this.layers[layer];
    for (let k = 0; k < n; k++) {
      const ang = hash2(this.s + 41, k, salt) * Math.PI * 2;
      const rad = 0.25 + 0.55 * hash2(this.s + 42, k, salt);
      const pu = Math.round(cu + Math.cos(ang) * rad * rx);
      const pv = Math.round(cv + Math.sin(ang) * rad * rz);
      const pr = 0.9 + hash2(this.s + 43, k, salt) * 1.5;
      if (this.nearPath(layer, pu, pv, pr + 4.5) || this.nearKeep(layer, pu, pv, pr + 2.5)) continue;
      for (let dv = -3; dv <= 3; dv++) {
        for (let du = -3; du <= 3; du++) {
          if (Math.hypot(du, dv) > pr) continue;
          const i = col(pu + du, pv + dv);
          if (i < 0 || L.pin[i]) continue;
          L.F[i] = NONE;
          L.H[i] = 0;
          L.rock[i] = 1;
        }
      }
    }
  }

  private nearPath(layer: number, u: number, v: number, r: number): boolean {
    for (const p of this.pathCells) if (p.layer === layer && Math.hypot(p.u - u, p.v - v) < r) return true;
    return false;
  }
  private nearKeep(layer: number, u: number, v: number, r: number): boolean {
    for (const k of this.keepList) if (k.layer === layer && Math.hypot(k.u - u, k.v - v) < r + k.r) return true;
    return false;
  }

  /** A pool (water or lava) in a cavern: a lumpy blob away from the path, sunk below the floor so that its surface is two blocks lower. */
  private pool(layer: number, cu: number, cv: number, rad: number, kind: 1 | 2, surfaceY: number, salt: number): void {
    const L = this.layers[layer];
    const cells: number[] = [];
    for (let dv = -Math.ceil(rad * 1.4); dv <= Math.ceil(rad * 1.4); dv++) {
      for (let du = -Math.ceil(rad * 1.4); du <= Math.ceil(rad * 1.4); du++) {
        const u = cu + du;
        const v = cv + dv;
        const i = col(u, v);
        if (i < 0 || L.F[i] === NONE || L.pin[i] || L.rock[i]) continue;
        const m = 0.75 + 0.5 * vn2(this.s + 51 + salt, u * 0.25, v * 0.25);
        if (Math.hypot(du, dv) / (rad * m) >= 1) continue;
        if (this.nearPath(layer, u, v, 4) || this.nearKeep(layer, u, v, 1.5)) continue;
        cells.push(i);
      }
    }
    const inPool = new Set(cells);
    // Only where every neighbour is in the pool or has ground as high as the surface (else the liquid would run out).
    for (const i of cells) {
      let ok = true;
      for (const d of NEIGHBOURS) {
        const j = i + d;
        if (inPool.has(j)) continue;
        if (j < 0 || j >= N || L.F[j] === NONE) continue;
        if (L.F[j] < surfaceY) {
          // Raise the low shore to the surface rather than lose the pool.
          if (L.pin[j]) ok = false;
          else {
            const top = L.F[j] + L.H[j];
            L.F[j] = surfaceY;
            L.H[j] = Math.max(3, top - surfaceY);
          }
        }
      }
      if (!ok) continue;
      const top = L.F[i] + L.H[i];
      L.F[i] = surfaceY - 3;
      L.H[i] = Math.max(5, top - L.F[i]);
      L.liquid[i] = kind;
      L.Ls[i] = surfaceY;
    }
  }

  // ---- the plan ----

  build(): DeepModel {
    const fy = this.fy;
    const L0 = 0;
    const L1 = 1;
    const L2 = 2;

    // ===== Part one: the lush levels (west of the first seal) =====
    // The camp, where the way in is: flat, with the portal in its west wall.
    this.chamber({ layer: L0, u: 17, v: 0, d: 0, rx: 11, rz: 8, h: 9, amp: 0, theme: 'camp', salt: 1 });
    this.level(L0, 5, 9, -4, 4, fy, 8, themeId('camp'));
    // The first tunnel: out of the camp and down towards the lush cave.
    this.tunnel({ layer: L0, pts: [[22, 0, 0], [30, -2, 0.5], [38, -6, 2], [44, -12, 4], [50, -18, 6], [55, -23, 9], [62, -24, 11]], r: 3.0, theme: 'plain' });
    // An old mineshaft off it, with rails and timber, that comes out in a quarry.
    this.tunnel({ layer: L0, pts: [[38, -6, 2], [38, 0, 3], [38, 6, 3], [38, 12, 4], [38, 14, 4], [42, 14, 4], [48, 14, 4], [54, 14, 4], [60, 14, 4], [70, 14, 4], [80, 14, 4]], r: 1.7, theme: 'mine', square: true, wobble: 0 });
    this.tunnel({ layer: L0, pts: [[80, 14, 4], [86, 24, 6], [90, 34, 9], [88, 46, 13]], r: 2.6, theme: 'plain' });
    this.chamber({ layer: L0, u: 86, v: 60, d: 14, rx: 17, rz: 14, h: 13, amp: 1.4, theme: 'plain', salt: 11 });
    // The drowned hollow: a lake cavern south of the first tunnel, joined to the quarry.
    this.tunnel({ layer: L0, pts: [[30, -2, 0.5], [28, 8, 1], [30, 20, 2], [36, 32, 4], [40, 38, 5]], r: 2.6, theme: 'plain' });
    this.chamber({ layer: L0, u: 44, v: 52, d: 6, rx: 22, rz: 17, h: 12, amp: 1.2, theme: 'lush', salt: 12 });
    this.tunnel({ layer: L0, pts: [[62, 56, 7], [70, 58, 9], [78, 60, 11], [84, 60, 13]], r: 2.6, theme: 'lush', plain: true });

    // The lush cave: a big cavern of moss, pools and hanging vines, with a shrine in it and two grottoes off it that hold the first cages.
    this.chamber({ layer: L0, u: 80, v: -22, d: 11, rx: 24, rz: 18, h: 15, amp: 1.6, theme: 'lush', salt: 2 });
    this.level(L0, 88, 96, -35, -28, fy - 11, 10, themeId('lush'));
    this.tunnel({ layer: L0, pts: [[74, -36, 11], [70, -42, 12], [66, -47, 13], [62, -50, 13]], r: 2.4, theme: 'drip', plain: true });
    this.chamber({ layer: L0, u: 60, v: -52, d: 13, rx: 8, rz: 7, h: 8, amp: 1, theme: 'drip', salt: 3 });
    // North of it, the root cellar: a dead end with a hoard.
    this.tunnel({ layer: L0, pts: [[56, -56, 13], [50, -64, 15], [46, -72, 17], [46, -78, 18]], r: 2.4, theme: 'drip', plain: true });
    this.chamber({ layer: L0, u: 46, v: -80, d: 19, rx: 15, rz: 9, h: 12, amp: 1.2, theme: 'lush', salt: 13 });
    // South of it, the grotto of the second cage.
    this.tunnel({ layer: L0, pts: [[86, -8, 11], [90, -1, 12], [94, 8, 14], [96, 16, 16]], r: 2.4, theme: 'drip', plain: true });
    this.chamber({ layer: L0, u: 98, v: 24, d: 16, rx: 8, rz: 8, h: 8, amp: 1, theme: 'amethyst', salt: 4 });
    // A geode off the north-east side of the cave.
    this.tunnel({ layer: L0, pts: [[98, -34, 11], [100, -42, 12], [100, -50, 13], [100, -57, 14]], r: 2.2, theme: 'drip', plain: true });
    this.chamber({ layer: L0, u: 100, v: -62, d: 14, rx: 7, rz: 7, h: 9, amp: 0.8, theme: 'amethyst', salt: 5 });
    // The way on, through the first gate (in the first seal).
    this.tunnel({ layer: L0, pts: [[98, -24, 11], [106, -24, 11], [113, -24, 11], [120, -24, 11]], r: 2.4, theme: 'plain', wobble: 0, plain: true });
    this.corridor(L0, 108, 118, -24, fy - 11, themeId('plain'));

    // ===== Part two: the dripstone caves and the cavern of lava (between the seals) =====
    this.tunnel({ layer: L1, pts: [[120, -24, 11], [128, -22, 12], [136, -14, 16], [142, -4, 22], [146, 8, 28]], r: 2.9, theme: 'drip' });
    this.tunnel({ layer: L1, pts: [[146, 8, 28], [147, 18, 31], [149, 28, 36], [150, 34, 39], [150, 40, 42]], r: 3.0, theme: 'dark' });
    // A vent cave on the way down, with a pool of lava off to one side.
    this.chamber({ layer: L1, u: 147, v: 17, d: 31, rx: 9, rz: 8, h: 11, amp: 1, theme: 'dark', salt: 9 });
    // The basalt hall: a dead end off the descent, behind a long tunnel.
    this.tunnel({ layer: L1, pts: [[142, -4, 22], [150, -2, 23], [158, 0, 24], [166, 2, 25]], r: 2.6, theme: 'dark', plain: true });
    this.chamber({ layer: L1, u: 176, v: 4, d: 26, rx: 15, rz: 13, h: 14, amp: 1.2, theme: 'dark', salt: 14 });
    // The ember depths: the great cavern of lava, with a crypt, a lake, and the grotto of the third cage.
    this.chamber({ layer: L1, u: 150, v: 58, d: 42, rx: 26, rz: 20, h: 18, amp: 1.5, theme: 'dark', salt: 6 });
    this.level(L1, 154, 164, 66, 74, fy - 42, 10, themeId('dark'));
    this.tunnel({ layer: L1, pts: [[150, 40, 42], [154, 48, 42], [162, 56, 42], [172, 60, 42], [184, 58, 42], [195, 56, 42], [205, 56, 42]], r: 2.7, theme: 'dark', plain: true });
    this.tunnel({ layer: L1, pts: [[154, 48, 42], [144, 50, 42], [136, 56, 43], [130, 62, 44], [128, 66, 45]], r: 2.4, theme: 'dark', plain: true });
    this.chamber({ layer: L1, u: 126, v: 69, d: 46, rx: 6.5, rz: 6, h: 8, amp: 1, theme: 'dark', salt: 7 });
    // The second gate (in the second seal).
    this.corridor(L1, 195, 205, 56, fy - 42, themeId('dark'));

    // ===== Part three: the last descent and the Molten Heart (east of the second seal) =====
    this.tunnel({ layer: L1, pts: [[205, 56, 42], [214, 58, 45], [226, 60, 49], [240, 62, 53], [256, 62, 57], [272, 58, 61], [286, 50, 65], [294, 38, 67], [296, 28, 68]], r: 3.0, theme: 'dark' });
    this.chamber({ layer: L1, u: 248, v: 62, d: 55, rx: 10, rz: 8, h: 11, amp: 1, theme: 'dark', salt: 10 });
    // The ashen ossuary: a dead end off the descent.
    this.tunnel({ layer: L1, pts: [[226, 60, 49], [226, 66, 51], [228, 72, 53]], r: 2.4, theme: 'drip', plain: true });
    this.chamber({ layer: L1, u: 232, v: 80, d: 54, rx: 9, rz: 7, h: 10, amp: 1, theme: 'drip', salt: 15 });
    this.tunnel({ layer: L2, pts: [[296, 28, 68], [298, 20, 70], [292, 12, 72]], r: 3.0, theme: 'dark', plain: true });
    // The Molten Heart: the Hollow King's cavern, flat, with a ring of lava round the floor of the fight.
    this.chamber({ layer: L2, u: 270, v: 0, d: 72, rx: 30, rz: 24, h: 24, amp: 0, theme: 'lair', salt: 8 });
    this.level(L2, 243, 283, -14, 14, fy - 72, 14, themeId('lair'));

    // What stands where: monsters, chests and cages (it also keeps pillars, pools and growth off them).
    const posts = this.plan();

    // Pillars and pools.
    this.layers.forEach((L) => L.relax());
    this.pillars(L0, 80, -22, 24, 18, 9, 1);
    this.pillars(L0, 44, 52, 22, 17, 5, 5);
    this.pillars(L0, 86, 60, 17, 14, 6, 6);
    this.pillars(L0, 46, -80, 15, 9, 3, 7);
    this.pillars(L1, 150, 58, 26, 20, 9, 3);
    this.pillars(L1, 176, 4, 15, 13, 5, 8);
    this.pillars(L2, 270, 0, 30, 24, 12, 4);
    this.pool(L0, 84, -11, 5.5, 2, fy - 11 - 2, 1);
    this.pool(L0, 74, -30, 3.2, 2, fy - 11 - 2, 2);
    this.pool(L0, 44, 54, 10, 2, fy - 6 - 2, 7);
    this.pool(L0, 84, 66, 4.5, 2, fy - 14 - 2, 8);
    this.pool(L1, 164, 48, 5.5, 1, fy - 42 - 2, 3);
    this.pool(L1, 140, 70, 3.4, 1, fy - 43 - 2, 4);
    this.pool(L1, 141, 20, 3.2, 1, fy - 31 - 2, 5);
    this.pool(L1, 182, 10, 4.5, 1, fy - 26 - 2, 9);
    this.pool(L1, 254, 68, 3.2, 1, fy - 55 - 2, 6);
    this.arenaRing();
    this.layers.forEach((L) => L.relax());
    this.resolveAnchors(posts);

    this.carve();
    this.paint();
    this.decorate();
    this.structures();
    return this.finish(posts);
  }
  /** Put the monsters, chests and cages on the floors as they finally are (smoothed, with pools and pillars in), in the nearest open column if need be. */
  private resolveAnchors(posts: DeepPost[]): void {
    const fix = (a: { layer: number; u: number; v: number; y: number }): void => {
      const p = this.spot(a.layer, a.u, a.v);
      a.u = p.u;
      a.v = p.v;
      a.y = p.y;
    };
    posts.forEach(fix);
    this.chests.forEach(fix);
    this.cages.forEach(fix);
  }

  /** The ring of lava round the floor of the fight: outside the arena and a margin of ground round it, before the walls. */
  private arenaRing(): void {
    const L = this.layers[2];
    const y = this.fy - 72;
    for (let v = -34; v <= 34; v++) {
      for (let u = 230; u <= 318; u++) {
        const i = col(u, v);
        if (i < 0 || L.F[i] === NONE || L.pin[i]) continue;
        const r = Math.hypot((u - 270) / 30, v / 24);
        if (r < 0.74 || r > 0.93) continue;
        // Not within the margin of the arena, and not across the way in (the east side).
        if (u >= 243 && u <= 285 && v >= -18 && v <= 18) continue;
        if (this.nearPath(2, u, v, 5)) continue;
        const top = L.F[i] + L.H[i];
        L.F[i] = y - 4;
        L.H[i] = top - L.F[i];
        L.liquid[i] = 1;
        L.Ls[i] = y - 2;
      }
    }
  }

  // ---- the carve ----

  private carve(): void {
    for (const L of this.layers) {
      for (let i = 0; i < N; i++) {
        const f = L.F[i];
        if (f === NONE) continue;
        const u = colU(i);
        const v = colV(i);
        const top = f + Math.max(3, L.H[i]);
        for (let y = f + 1; y <= top; y++) this.set(u, y, v, B.AIR);
        if (L.liquid[i]) {
          const id = L.liquid[i] === 1 ? B.LAVA : B.WATER;
          for (let y = f + 1; y <= L.Ls[i]; y++) this.set(u, y, v, id);
        }
      }
    }
  }

  // ---- the look of the rock ----

  private oreAt(u: number, y: number, v: number, th: DeepTheme): number {
    if (vn3(this.s + 61, u * 0.5, y * 0.5, v * 0.5) < 0.88) return 0;
    const r = hash2(this.s + 62 + Math.floor(y / 5) * 13, Math.floor(u / 5), Math.floor(v / 5));
    if (th === 'dark' || th === 'lair') return r < 0.35 ? B.REDSTONE_ORE : r < 0.6 ? B.GOLD_ORE : r < 0.85 ? B.IRON_ORE : B.DIAMOND_ORE;
    if (th === 'lush') return r < 0.4 ? B.COAL_ORE : r < 0.75 ? B.IRON_ORE : r < 0.9 ? B.EMERALD_ORE : B.LAPIS_ORE;
    return r < 0.5 ? B.COAL_ORE : r < 0.8 ? B.IRON_ORE : r < 0.93 ? B.GOLD_ORE : r < 0.98 ? B.LAPIS_ORE : B.DIAMOND_ORE;
  }

  /** The rock at a place, in blobs and veins (the stone of a cave changes in patches, not block by block). */
  private rockAt(th: DeepTheme, kind: 'wall' | 'floor' | 'ceil', u: number, y: number, v: number): number {
    const ore = this.oreAt(u, y, v, th);
    if (ore && kind !== 'floor') return ore;
    const n1 = vn3(this.s + 71, u * 0.15, y * 0.2, v * 0.15);
    const n2 = vn3(this.s + 72, u * 0.3, y * 0.3, v * 0.3);
    switch (th) {
      case 'camp':
        if (kind === 'floor') return n2 > 0.62 ? B.GRAVEL : n1 > 0.55 ? B.COBBLE : B.STONE;
        return n1 > 0.7 ? B.ANDESITE : n1 < 0.18 ? B.TUFF : B.STONE;
      case 'plain':
      case 'mine':
        if (kind === 'floor') return n2 > 0.64 ? B.GRAVEL : n1 > 0.62 ? B.ANDESITE : B.STONE;
        return n1 > 0.68 ? B.ANDESITE : n1 < 0.16 ? B.TUFF : n2 > 0.86 ? B.COBBLE : B.STONE;
      case 'lush':
        if (kind === 'floor') return n1 > 0.34 ? B.MOSS_BLOCK : n2 > 0.7 ? B.CLAY : B.DIRT;
        return n1 > (kind === 'ceil' ? 0.38 : 0.5) ? B.MOSS_BLOCK : n2 > 0.82 ? B.MOSSY_COBBLE : n1 < 0.15 ? B.TUFF : B.STONE;
      case 'drip':
      case 'amethyst':
        if (kind === 'floor') return n1 > 0.4 ? B.DRIPSTONE_BLOCK : n2 > 0.7 ? B.GRAVEL : B.STONE;
        return n1 > 0.42 ? B.DRIPSTONE_BLOCK : n1 < 0.13 ? B.TUFF : n2 > 0.88 ? B.CALCITE : B.STONE;
      case 'dark':
        if (kind === 'floor') return n2 > 0.68 ? B.COBBLED_DEEPSLATE : n1 > 0.7 ? B.SMOOTH_BASALT : B.DEEPSLATE;
        return n1 > 0.62 ? B.COBBLED_DEEPSLATE : n1 < 0.12 ? B.TUFF : n2 > 0.85 ? B.SMOOTH_BASALT : B.DEEPSLATE;
      case 'lair':
        if (kind === 'floor') return n1 > 0.6 ? B.SMOOTH_BASALT : n2 > 0.78 ? B.OBSIDIAN : B.DEEPSLATE;
        return n1 > 0.58 ? B.SMOOTH_BASALT : n2 > 0.8 ? B.OBSIDIAN : B.DEEPSLATE;
    }
  }

  private paint(): void {
    for (const L of this.layers) {
      for (let i = 0; i < N; i++) {
        const f = L.F[i];
        if (f === NONE) continue;
        const u = colU(i);
        const v = colV(i);
        const th = THEMES[Math.max(0, L.theme[i] - 1)];
        const top = f + Math.max(3, L.H[i]);
        // The floor (under a pool, the bed of it), and the roof.
        this.set(u, f, v, L.liquid[i] === 1 ? B.OBSIDIAN : L.liquid[i] === 2 ? B.CLAY : this.rockAt(th, 'floor', u, f, v));
        if (this.get(u, top + 1, v) === B.STONE) this.set(u, top + 1, v, this.rockAt(th, 'ceil', u, top + 1, v));
        // The walls: whatever rock of a neighbouring column the air here can see.
        for (const d of NEIGHBOURS) {
          const j = i + d;
          if (j < 0 || j >= N) continue;
          const nu = colU(j);
          const nv = colV(j);
          for (let y = f + 1; y <= top; y++) if (this.get(nu, y, nv) === B.STONE) this.set(nu, y, nv, this.rockAt(th, 'wall', nu, y, nv));
        }
      }
    }
  }

  // ---- what grows in the caves ----

  private decorate(): void {
    const s = this.s;
    for (const L of this.layers) {
      for (let i = 0; i < N; i++) {
        const f = L.F[i];
        if (f === NONE || L.liquid[i]) continue;
        const u = colU(i);
        const v = colV(i);
        const th = THEMES[Math.max(0, L.theme[i] - 1)];
        const h = Math.max(3, L.H[i]);
        const top = f + h;
        const floorId = this.get(u, f, v);
        const ceilId = this.get(u, top + 1, v);
        const clear = !L.keep[i] && !L.pin[i];
        const r1 = hash2(s + 610 + f, u, v);
        const r2 = hash2(s + 620 + top, u, v);
        const r3 = hash2(s + 630 + f * 3, u + 5, v + 11);
        const r4 = hash2(s + 640 + top * 3, u - 7, v + 3);
        const patchA = vn2(s + 81, u * 0.16, v * 0.16);
        if (th === 'lush') {
          if (floorId === B.MOSS_BLOCK && !L.keep[i]) {
            const cover = r1 < 0.2 ? B.TALL_GRASS : r1 < 0.27 ? B.FERN : r1 < 0.3 ? B.FLOWERING_AZALEA : r1 < 0.33 ? GROVE.azalea : r1 < 0.37 ? B.GLOW_LICHEN : r1 < 0.5 ? GROVE.mossCarpet : 0;
            if (cover) this.set(u, f + 1, v, cover);
          }
          if (ceilId === B.MOSS_BLOCK || patchA > 0.4) {
            if (r2 < 0.03) this.set(u, top, v, B.SPORE_BLOSSOM);
            else if (r2 < 0.08) this.set(u, top, v, GROVE.hangingRoots);
            else if (r2 < 0.42 && h >= 3) {
              const len = 1 + Math.floor(Math.pow(r3, 1.4) * Math.min(h - 3, 8));
              for (let k = 0; k < len; k++) {
                const berry = k === len - 1 ? r4 < 0.7 : hash2(s + 660 + k, u, v) < 0.14;
                this.set(u, top - k, v, berry ? B.CAVE_VINES_BERRIES : B.CAVE_VINES);
              }
            }
          }
        } else if (th === 'drip' || th === 'amethyst' || th === 'dark' || th === 'lair') {
          const dens = th === 'drip' || th === 'amethyst' ? 1 : th === 'dark' ? 0.45 : 0.3;
          const dripFloor = floorId === B.DRIPSTONE_BLOCK;
          const up = clear && !NEIGHBOURS.some((d) => L.pin[i + d]) && r1 < (dripFloor ? 0.15 : 0.03) * dens ? 1 + Math.floor(Math.pow(r3, 1.6) * Math.min(4, h - 3)) : 0;
          const down = !L.pin[i] && r2 < (ceilId === B.DRIPSTONE_BLOCK ? 0.2 : 0.04) * dens ? 1 + Math.floor(Math.pow(r4, 1.3) * Math.min(7, h - 3)) : 0;
          for (let k = 0; k < up; k++) this.set(u, f + 1 + k, v, k === up - 1 ? B.STALAGMITE_TIP : B.STALAGMITE_BASE);
          for (let k = 0; k < down; k++) this.set(u, top - k, v, k === down - 1 ? B.STALACTITE_TIP : B.STALACTITE_BASE);
          if (th === 'amethyst' && clear && r3 > 0.93 && !up) this.set(u, f + 1, v, B.AMETHYST_CLUSTER);
        } else if ((th === 'plain' || th === 'camp') && r2 < 0.012 && h >= 4) {
          this.set(u, top, v, B.COBWEB);
        }
      }
    }
  }

  // ---- built things ----

  private floorY(layer: number, u: number, v: number): number {
    const i = col(u, v);
    return i < 0 ? NONE : this.layers[layer].F[i];
  }

  /** The nearest open column to (u, v) of a layer (within a few blocks), so that a hand-placed thing never lands in rock. */
  private nearestOpen(layer: number, u: number, v: number): { u: number; v: number } {
    const L = this.layers[layer];
    for (let r = 0; r <= 8; r++) {
      let best: { u: number; v: number; d: number } | null = null;
      for (let dv = -r; dv <= r; dv++) {
        for (let du = -r; du <= r; du++) {
          if (Math.max(Math.abs(du), Math.abs(dv)) !== r) continue;
          const i = col(u + du, v + dv);
          if (i < 0 || L.F[i] === NONE || L.liquid[i]) continue;
          const d = Math.hypot(du, dv);
          if (!best || d < best.d) best = { u: u + du, v: v + dv, d };
        }
      }
      if (best) return { u: best.u, v: best.v };
    }
    return { u, v };
  }

  private spot(layer: number, u: number, v: number): DeepSpot {
    const p = this.nearestOpen(layer, u, v);
    return { u: p.u, v: p.v, y: this.floorY(layer, p.u, p.v) + 1 };
  }

  /** A torch standing on the floor of a column (the nearest open one), if there is room: players can pick them up and carry them. */
  private lightAt(layer: number, u: number, v: number): void {
    const p = this.spot(layer, u, v);
    if (this.get(p.u, p.y, p.v) !== B.AIR || this.get(p.u, p.y + 1, p.v) !== B.AIR) return;
    if (!IS_SOLID[this.get(p.u, p.y - 1, p.v)]) return;
    this.set(p.u, p.y, p.v, B.TORCH);
  }

  /** Torches along the ways (close in the first levels, wide apart further down: the deeper, the darker), and by every cage, chest and gate. */
  private torches(): void {
    let n = 0;
    for (const pc of this.pathCells) {
      n++;
      const stride = pc.u < SEAL_ONE ? 12 : pc.u < SEAL_TWO ? 24 : 40;
      if (n % stride !== 0) continue;
      const L = this.layers[pc.layer];
      const j = col(pc.u, pc.v);
      if (j < 0 || L.F[j] === NONE) continue;
      const side = hash2(this.s + 61, pc.u, pc.v) < 0.5 ? 1 : -1;
      let done = false;
      for (const [du, dv] of [[2 * side, 0], [0, 2 * side], [-2 * side, 0], [0, -2 * side]] as const) {
        const i = col(pc.u + du, pc.v + dv);
        if (i < 0 || L.F[i] === NONE || L.liquid[i] || L.H[i] < 3 || Math.abs(L.F[i] - L.F[j]) > 1) continue;
        this.lightAt(pc.layer, pc.u + du, pc.v + dv);
        done = true;
        break;
      }
      if (!done) this.lightAt(pc.layer, pc.u, pc.v);
    }
    for (const [layer, u, v] of [[0, 6, -6], [0, 6, 6], [0, 12, -7], [0, 12, 7], [0, 19, -7], [0, 19, 7], [0, 8, -2], [0, 8, 2]] as const) {
      const p = this.spot(layer, u, v);
      this.set(p.u, p.y, p.v, B.COBBLE);
      this.set(p.u, p.y + 1, p.v, B.TORCH);
    }
    for (const c of this.cages) {
      this.lightAt(c.layer, c.u + 3, c.v + 3);
      this.lightAt(c.layer, c.u - 3, c.v - 3);
    }
    for (const c of this.chests) this.lightAt(c.layer, c.u + 2, c.v);
    for (const g of this.gateList()) {
      this.lightAt(1, g.u - 5, g.v0 - 3);
      this.lightAt(1, g.u + 5, g.v1 + 3);
    }
    // The hall of the king: a few at the door, so that there is a place to stand and stock up before the fight.
    for (const [u, v] of [[292, 8], [292, -8], [296, 28]] as const) this.lightAt(2, u, v);
  }
  private structures(): void {
    const fy = this.fy;
    // The portal back to the village, in the west wall of the camp.
    this.box(4, fy, -2, 4, fy + 4, 2, B.OBSIDIAN);
    this.box(4, fy + 1, -1, 4, fy + 3, 1, B.PORTAL);
    this.box(5, fy + 1, -1, 5, fy + 3, 1, B.AIR);
    this.box(3, fy - 1, -3, 3, fy + 5, 3, B.OBSIDIAN);

    // The gates: a frame of stone brick round the bars.
    for (const g of this.gateList()) {
      this.box(g.u - 1, g.y0 - 1, g.v0 - 1, g.u + 1, g.y0 - 1, g.v1 + 1, B.STONE_BRICKS);
      this.box(g.u - 1, g.y1 + 1, g.v0 - 1, g.u + 1, g.y1 + 1, g.v1 + 1, B.STONE_BRICKS);
      this.box(g.u - 1, g.y0, g.v0 - 1, g.u + 1, g.y1, g.v0 - 1, B.STONE_BRICKS);
      this.box(g.u - 1, g.y0, g.v1 + 1, g.u + 1, g.y1, g.v1 + 1, B.STONE_BRICKS);
      this.box(g.u, g.y0, g.v0, g.u, g.y1, g.v1, DRESS.ironBars);
    }

    this.torches();
    this.shrine();
    this.mineshaft();
    this.geode();
    this.crypt();
    this.lair();
    // Chests and cages.
    for (const c of this.chests) this.set(c.u, c.y, c.v, B.CHEST);
    for (const c of this.cages) {
      this.set(c.u, c.y, c.v, B.SPAWNER);
      // Rubble round it, and it is easy to find: a ring of gravel and a bone-white calcite cap.
      for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (this.get(c.u + du, c.y - 1, c.v + dv) !== B.AIR) this.set(c.u + du, c.y - 1, c.v + dv, B.CALCITE);
    }
  }

  private gateList(): DeepGate[] {
    const fy = this.fy;
    return [
      { id: 'court', name: 'The iron gate under the lush cave', cages: [0, 1], u: SEAL_ONE, v0: -25, v1: -23, y0: fy - 11 + 1, y1: fy - 11 + 4 },
      { id: 'throne', name: 'The gate of the Molten Heart', cages: [2], u: SEAL_TWO, v0: 55, v1: 57, y0: fy - 42 + 1, y1: fy - 42 + 4 },
    ];
  }

  /** An overgrown shrine on a level of the lush cave: a floor of mossy brick, four pillars, and a chest. */
  private shrine(): void {
    const fy = this.fy - 11;
    this.box(88, fy, -35, 96, fy, -28, B.MOSSY_COBBLE);
    this.box(89, fy, -34, 95, fy, -29, B.STONE_BRICKS);
    this.box(91, fy, -32, 93, fy, -31, B.MOSSY_COBBLE);
    for (const [u, v] of [[89, -34], [95, -34], [89, -29], [95, -29]] as const) {
      this.box(u, fy + 1, v, u, fy + 4, v, hash2(this.s + 91, u, v) < 0.5 ? B.MOSSY_COBBLE : B.STONE_BRICKS);
      this.set(u, fy + 5, v, B.STONE_BRICKS);
    }
    this.box(90, fy + 1, -33, 94, fy + 3, -30, B.AIR);
    this.box(90, fy + 5, -33, 94, fy + 5, -30, B.AIR);
  }

  /** The mineshaft: a timber frame every few blocks, a clean line of rails down the middle (corners and slopes joined properly), cobwebs, and the cache at the end. */
  private mineshaft(): void {
    const L = this.layers[0];
    const cells = this.pathCells.filter((c) => c.layer === 0);
    // The mine tunnel's cells, in order, as a chain in which every cell touches the next along an edge.
    const chain: { u: number; v: number }[] = [];
    const seen = new Set<number>();
    const push = (u: number, v: number): void => {
      const i = col(u, v);
      if (i < 0 || seen.has(i)) return;
      seen.add(i);
      chain.push({ u, v });
    };
    void cells;
    // One straight line down the middle of the way (along v, then a single right-angle turn, then along u), as far as the tunnel runs.
    const inMine = (u: number, v: number): boolean => {
      const i = col(u, v);
      return i >= 0 && L.theme[i] === themeId('mine') && L.F[i] !== NONE;
    };
    for (let v = -3; v <= 14; v++) if (inMine(38, v)) push(38, v);
    for (let u = 39; u <= 90; u++) {
      if (!inMine(u, 14)) break;
      push(u, 14);
    }
    const rails: { u: number; v: number; y: number }[] = [];
    for (const c of chain) {
      const f = this.floorY(0, c.u, c.v);
      if (f === NONE) continue;
      const here = this.get(c.u, f + 1, c.v);
      if (here !== B.AIR && here !== B.TORCH) continue;
      if (here === B.TORCH) {
        // A torch that stood on the line moves to the side of the way, so the rails stay in one piece.
        for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          if (seen.has(col(c.u + du, c.v + dv))) continue;
          const sf = this.floorY(0, c.u + du, c.v + dv);
          if (sf === NONE || this.get(c.u + du, sf + 1, c.v + dv) !== B.AIR) continue;
          this.set(c.u + du, sf + 1, c.v + dv, B.TORCH);
          break;
        }
      }
      this.set(c.u, f + 1, c.v, B.RAIL_X);
      rails.push({ u: c.u, v: c.v, y: f + 1 });
    }
    // Let every rail pick the shape that joins its neighbours (a few passes, as the rails in a row settle each other).
    const reader = { getBlock: (x: number, y: number, z: number): number => this.get(x, y, z) };
    for (let pass = 0; pass < 3; pass++) {
      for (const r of rails) {
        const cur = railInfo(this.get(r.u, r.y, r.v))?.shape ?? 0;
        const shape = wantedShape(reader, { x: r.u, y: r.y, z: r.v }, cur, false);
        this.set(r.u, r.y, r.v, railBlock(shape, false));
      }
    }
    // The timber: a frame across the way every few blocks (a post either side and a beam over), and cobwebs in some.
    for (let k = 4; k < chain.length - 4; k += 6) {
      const c = chain[k];
      const f = this.floorY(0, c.u, c.v);
      if (f === NONE) continue;
      const a = chain[k - 3];
      const b = chain[k + 3];
      const alongU = Math.abs(b.u - a.u) >= Math.abs(b.v - a.v);
      for (const side of [-2, 2]) {
        const pu = alongU ? c.u : c.u + side;
        const pv = alongU ? c.v + side : c.v;
        for (let y = f + 1; y <= f + 3; y++) if (this.get(pu, y, pv) === B.AIR || this.get(pu, y, pv) === B.STONE) this.set(pu, y, pv, B.FENCE);
      }
      for (let o = -2; o <= 2; o++) {
        const pu = alongU ? c.u : c.u + o;
        const pv = alongU ? c.v + o : c.v;
        this.set(pu, f + 4, pv, B.PLANKS);
      }
      if (k % 12 === 4) this.set(alongU ? c.u : c.u + 1, f + 3, alongU ? c.v + 1 : c.v, B.COBWEB);
    }
  }
  /** The geode: a shell of amethyst, calcite and smooth basalt round the amethyst cavern, with budding crystals inside. */
  private geode(): void {
    const cu = 100;
    const cv = -62;
    const reach = 12;
    const L = this.layers[0];
    for (let v = cv - reach; v <= cv + reach; v++) {
      for (let u = cu - reach; u <= cu + reach; u++) {
        const i = col(u, v);
        if (i < 0 || L.F[i] === NONE || Math.hypot(u - cu, v - cv) > 8.5) continue;
        const f = L.F[i];
        const top = f + L.H[i];
        // The inside of the cavern: crystals on the floor and the roof.
        const rr = hash2(this.s + 93, u, v);
        if (rr < 0.16 && !L.keep[i]) this.set(u, f + 1, v, B.AMETHYST_CLUSTER);
        if (this.get(u, top + 1, v) !== B.AIR) this.set(u, top + 1, v, rr < 0.5 ? B.AMETHYST_BLOCK : B.CALCITE);
        this.set(u, f, v, rr < 0.3 ? B.BUDDING_AMETHYST : rr < 0.7 ? B.AMETHYST_BLOCK : B.CALCITE);
      }
    }
    // The shell round the air.
    const base = this.fy - 14;
    for (let y = base - 3; y <= base + 12; y++) {
      for (let v = cv - reach; v <= cv + reach; v++) {
        for (let u = cu - reach; u <= cu + reach; u++) {
          if (Math.hypot(u - cu, v - cv) > 9.5) continue;
          const here = this.get(u, y, v);
          if (here === B.AIR || here === B.AMETHYST_CLUSTER) continue;
          let near = 99;
          for (let dz = -2; dz <= 2 && near > 1; dz++) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (this.get(u + dx, y + dy, v + dz) === B.AIR) near = Math.min(near, Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)));
          if (near === 1) this.set(u, y, v, hash2(this.s + 94, u + y, v) < 0.25 ? B.BUDDING_AMETHYST : B.AMETHYST_BLOCK);
          else if (near === 2) this.set(u, y, v, B.CALCITE);
        }
      }
    }
  }
  /** The Sunken Crypt in the cavern of lava: a basalt vault with a ledge round it and its treasure in the middle. */
  private crypt(): void {
    const y = this.fy - 42;
    this.box(154, y, 66, 164, y, 74, B.SMOOTH_BASALT);
    this.box(155, y, 67, 163, y, 73, B.DEEPSLATE);
    for (const [u, v] of [[155, 67], [163, 67], [155, 73], [163, 73]] as const) this.box(u, y + 1, v, u, y + 5, v, B.SMOOTH_BASALT);
    this.box(159, y + 1, 67, 159, y + 3, 67, B.SMOOTH_BASALT);
    this.box(157, y + 1, 73, 161, y + 2, 73, B.COBBLED_DEEPSLATE);
  }

  /** The Molten Heart: a throne of obsidian on a dais at the west end, black pillars with braziers of lava round the floor of the fight. */
  private lair(): void {
    const y = this.fy - 72;
    // The dais and the throne.
    this.box(242, y, -5, 246, y, 5, B.OBSIDIAN);
    this.box(247, y, -3, 248, y, 3, B.SMOOTH_BASALT);
    this.box(242, y + 1, -2, 242, y + 9, 2, B.OBSIDIAN);
    this.box(243, y + 1, -2, 243, y + 3, -2, B.OBSIDIAN);
    this.box(243, y + 1, 2, 243, y + 3, 2, B.OBSIDIAN);
    this.box(243, y + 1, -1, 243, y + 1, 1, B.OBSIDIAN);
    this.box(242, y + 10, -1, 242, y + 10, 1, B.OBSIDIAN);
    // Pillars of black stone with a brazier of lava on each: the light of the hall, round the edge of the floor of the fight.
    for (const [u, v] of [[252, -12], [260, -13], [268, -13], [276, -12], [252, 12], [260, 13], [268, 13], [276, 12]] as const) {
      this.box(u, y + 1, v, u, y + 3, v, B.OBSIDIAN);
      this.box(u - 1, y + 1, v, u + 1, y + 1, v, B.SMOOTH_BASALT);
      this.box(u, y + 1, v - 1, u, y + 1, v + 1, B.SMOOTH_BASALT);
      // The bowl: obsidian round, lava in the middle, level with the rim so that it cannot run over.
      this.box(u - 1, y + 4, v - 1, u + 1, y + 5, v + 1, B.OBSIDIAN);
      this.box(u, y + 5, v, u, y + 5, v, B.LAVA);
    }
  }
  // ---- the plan of monsters, chests and cages ----

  private plan(): DeepPost[] {
    const posts: DeepPost[] = [];
    // [kind, layer, u, v, elite]
    const list: readonly (readonly [MobKind, number, number, number, number?])[] = [
      // the first tunnel and the mineshaft
      ['zombie', 0, 40, -8],
      ['spider', 0, 52, -20],
      ['spider', 0, 38, 9],
      ['skeleton', 0, 56, 14],
      ['cave_spider', 0, 66, 14],
      ['cave_spider', 0, 74, 14],
      ['zombie', 0, 86, 24],
      ['skeleton', 0, 90, 34],
      ['spider', 0, 88, 44],
      // the way to the drowned hollow, and the hollow
      ['zombie', 0, 29, 14],
      ['skeleton', 0, 34, 30],
      ['spore_puff', 0, 26, 46],
      ['skeleton', 0, 30, 60],
      ['moss_lurker', 0, 38, 67],
      ['zombie', 0, 56, 63],
      ['skeleton', 0, 58, 44],
      ['husk', 0, 48, 36, 2.2],
      ['cave_spider', 0, 62, 50],
      // the way to the quarry, and the quarry
      ['skeleton', 0, 70, 58],
      ['cave_spider', 0, 76, 60],
      ['zombie', 0, 74, 54],
      ['skeleton', 0, 80, 68],
      ['spider', 0, 92, 54],
      ['husk', 0, 98, 62, 2.2],
      ['zombie', 0, 88, 70],
      ['skeleton', 0, 94, 67],
      ['cave_spider', 0, 82, 50],
      ['husk', 0, 86, 52],
      // the lush cave
      ['zombie', 0, 66, -26],
      ['moss_lurker', 0, 72, -16],
      ['skeleton', 0, 78, -30],
      ['moss_lurker', 0, 84, -26],
      ['spore_puff', 0, 94, -12],
      ['skeleton', 0, 92, -20],
      ['spore_puff', 0, 100, -30],
      ['spore_puff', 0, 76, -8],
      ['hollow_priest', 0, 92, -31, 2.2],
      // the first grotto (cage A) and the way to it
      ['skeleton', 0, 68, -40],
      ['zombie', 0, 64, -46],
      ['stray', 0, 57, -54],
      ['hollow_priest', 0, 64, -50, 2.2],
      // the root cellar
      ['spore_puff', 0, 54, -58],
      ['skeleton', 0, 50, -66],
      ['moss_lurker', 0, 46, -74],
      ['husk', 0, 46, -80, 2.2],
      ['skeleton', 0, 38, -84],
      ['zombie', 0, 54, -84],
      ['spore_puff', 0, 46, -88],
      // the second grotto (cage B) and the way to it
      ['skeleton', 0, 90, 0],
      ['zombie', 0, 94, 10],
      ['spider', 0, 97, 20],
      ['stray', 0, 103, 26],
      ['hollow_priest', 0, 97, 26, 2.2],
      // the geode and the way to it
      ['skeleton', 0, 100, -40],
      ['shade', 0, 100, -50],
      ['stray', 0, 100, -61, 2.2],
      ['skeleton', 0, 105, -64],
      ['zombie', 0, 95, -60],
      ['zombie', 0, 104, -27],
      // below the first gate: the dripstone caves
      ['skeleton', 1, 128, -22],
      ['ember_wraith', 1, 136, -14],
      ['zombie', 1, 142, -4],
      ['shade', 1, 144, 8],
      ['ashen_knight', 1, 143, 14],
      ['zombie', 1, 150, 22],
      ['skeleton', 1, 149, 28],
      // the basalt hall
      ['skeleton', 1, 150, -2],
      ['ember_wraith', 1, 158, 0],
      ['husk', 1, 176, 4, 2.2],
      ['zombie', 1, 170, -4],
      ['skeleton', 1, 182, 2],
      ['ember_wraith', 1, 176, 12],
      ['shade', 1, 168, 10],
      ['skeleton', 1, 184, -4],
      ['zombie', 1, 172, 12],
      // the ember depths
      ['ashen_knight', 1, 152, 44],
      ['zombie', 1, 158, 54],
      ['skeleton', 1, 148, 52],
      ['zombie', 1, 136, 52],
      ['shade', 1, 146, 66],
      ['ember_wraith', 1, 170, 64],
      ['ashen_knight', 1, 172, 56],
      ['ashen_knight', 1, 160, 70, 3.2],
      ['stray', 1, 158, 68],
      ['ember_wraith', 1, 162, 74],
      // the third grotto (cage C) and the way to it
      ['zombie', 1, 144, 50],
      ['skeleton', 1, 136, 56],
      ['hollow_priest', 1, 130, 62, 2.2],
      ['ember_wraith', 1, 126, 72],
      ['skeleton', 1, 122, 66],
      // below the second gate
      ['skeleton', 1, 178, 58],
      ['ashen_knight', 1, 188, 57],
      ['skeleton', 1, 214, 58],
      ['ashen_knight', 1, 226, 60],
      ['shade', 1, 240, 62],
      ['ember_wraith', 1, 248, 62],
      ['skeleton', 1, 256, 62],
      ['ashen_knight', 1, 272, 58],
      ['zombie', 1, 286, 50],
      ['ember_wraith', 1, 294, 38],
      // the ashen ossuary
      ['shade', 1, 226, 66],
      ['skeleton', 1, 228, 72],
      ['hollow_priest', 1, 232, 80, 2.2],
      ['stray', 1, 238, 80],
      ['shade', 1, 226, 84],
    ];
    for (const [kind, layer, u, v, elite] of list) {
      const p = this.spot(layer, u, v);
      this.keepAround(layer, p.u, p.v, 1);
      posts.push({ kind, layer, u: p.u, v: p.v, y: p.y, ...(elite ? { elite } : {}) });
    }

    const chestList: readonly (readonly [number, number, number, LootTableName])[] = [
      [0, 78, 15, 'dungeon'],
      [0, 92, -32, 'temple'],
      [0, 60, -55, 'dungeon'],
      [0, 98, 26, 'dungeon'],
      [0, 100, -66, 'temple'],
      [0, 46, -84, 'temple'],
      [0, 88, 65, 'dungeon'],
      [0, 57, 57, 'dungeon'],
      [0, 28, 62, 'dungeon'],
      [1, 143, 0, 'dungeon'],
      [1, 180, 2, 'temple'],
      [1, 159, 73, 'temple'],
      [1, 124, 71, 'dungeon'],
      [1, 232, 84, 'temple'],
      [1, 250, 66, 'dungeon'],
    ];
    for (const [layer, u, v, table] of chestList) {
      const p = this.spot(layer, u, v);
      this.keepAround(layer, p.u, p.v, 1.5);
      this.chests.push({ ...p, table, layer });
    }
    const cageList: readonly (readonly [number, number, number])[] = [
      [0, 62, -51],
      [0, 98, 22],
      [1, 126, 70],
    ];
    for (const [layer, u, v] of cageList) {
      const p = this.spot(layer, u, v);
      this.keepAround(layer, p.u, p.v, 2);
      this.cages.push({ ...p, layer });
    }
    // The camp, the way in, the arena and the path.
    for (const [layer, u, v, r] of [[0, 9, -3, 2.5], [0, 7, 0, 3], [2, 256, 0, 5], [2, 268, 0, 3]] as const) this.keepAround(layer, u, v, r);
    // Mark the keep cells on their layers.
    for (const k of this.keepList) {
      const L = this.layers[k.layer];
      const rad = Math.ceil(k.r);
      for (let dv = -rad; dv <= rad; dv++) {
        for (let du = -rad; du <= rad; du++) {
          if (Math.hypot(du, dv) > k.r) continue;
          const i = col(k.u + du, k.v + dv);
          if (i >= 0) L.keep[i] = 1;
        }
      }
    }
    return posts;
  }

  private finish(posts: DeepPost[]): DeepModel {
    const grid = this.grid;
    const layers = this.layers;
    const entry = { ...this.spot(0, 8, 0), yaw: -Math.PI / 2 };
    const hale = { ...this.spot(0, 12, -3), yaw: Math.PI / 2 };
    const boss = { ...this.spot(2, 256, 0), yaw: -Math.PI / 2 };
    const exitPortal = this.spot(2, 268, 0);
    const gates = this.gateList();
    const chests = this.chests;
    const cages = this.cages;
    const arena = { u0: 249, u1: 275, v0: -10, v1: 10 };
    const seals = [SEAL_ONE, SEAL_TWO];
    const fy = this.fy;
    const standAt = (layer: number, u: number, v: number): number => {
      const i = col(u, v);
      return i < 0 || layers[layer].F[i] === NONE ? -1 : layers[layer].F[i] + 1;
    };
    const topView = (): string => {
      const rows: string[] = [];
      for (let v = DEEP_V0; v < DEEP_V0 + DEEP_V; v++) {
        let row = '';
        for (let u = 0; u < DEEP_U; u++) {
          const i = col(u, v);
          let c = '#';
          for (let k = 2; k >= 0 && i >= 0; k--) {
            const L = layers[k];
            if (L.F[i] === NONE) continue;
            c = L.liquid[i] === 1 ? '~' : L.liquid[i] === 2 ? '=' : L.pin[i] ? String(k) : String.fromCharCode(97 + k);
            break;
          }
          row += c;
        }
        rows.push(row);
      }
      return rows.join('\n');
    };
    /** What no player may change: the bars of the gates and the portal back to the village in the camp's west wall. */
    const protectedAt = (u: number, y: number, v: number): boolean => {
      for (const g of gates) if (u === g.u && v >= g.v0 && v <= g.v1 && y >= g.y0 && y <= g.y1) return true;
      return u >= 3 && u <= 4 && v >= -3 && v <= 3 && y >= fy - 1 && y <= fy + 5;
    };
    return {
      fy,
      grid,
      entry,
      hale,
      cages,
      gates,
      boss,
      arena,
      exitPortal,
      seals,
      chests,
      posts,
      standAt,
      topView,
      protectedAt,
      fillChunk: (blocks, ox, oz, x0, z0, blockIndex) => {
        const top = 254;
        for (let lz = 0; lz < 16; lz++) {
          const gv = oz + lz - z0;
          if (gv < 0 || gv >= DEEP_V) continue;
          for (let lx = 0; lx < 16; lx++) {
            const gu = ox + lx - x0;
            if (gu < 0 || gu >= DEEP_U) continue;
            // The outer wall of the dungeon: bedrock from floor to cap, so nobody digs into the next copy.
            if (gu === 0 || gu === DEEP_U - 1 || gv === 0 || gv === DEEP_V - 1) {
              for (let y = 1; y <= top; y++) blocks[blockIndex(lx, y, lz)] = B.BEDROCK;
              continue;
            }
            for (let y = DEEP_Y0; y < DEEP_Y1; y++) blocks[blockIndex(lx, y, lz)] = grid[((y - DEEP_Y0) * DEEP_V + gv) * DEEP_U + gu];
            // The seals: a wall of bedrock across the whole of the dungeon, from the floor to the cap, with the gate in it.
            if (seals.includes(gu)) {
              const g = gates.find((q) => q.u === gu)!;
              const v = gv + DEEP_V0;
              for (let y = 1; y <= top; y++) if (!(v >= g.v0 && v <= g.v1 && y >= g.y0 && y <= g.y1)) blocks[blockIndex(lx, y, lz)] = B.BEDROCK;
            }
            // A cap of bedrock, so nobody climbs out through the roof and walks over the seals.
            blocks[blockIndex(lx, top, lz)] = B.BEDROCK;
          }
        }
      },
    };
  }
}
