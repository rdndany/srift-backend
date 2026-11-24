import type { LandConfig } from './landConfig';

/**
 * The shape of a claim, on the grid of blocks. A corner is a block (x, z); the claim is every block whose own (x, z) is inside the
 * polygon the corners make, or on its edge. So four corners on (0,0), (9,0), (9,9) and (0,9) claim 10 x 10 = 100 blocks, the ones that
 * were marked included, which is what a player expects. All the arithmetic is on whole numbers: the server and the client always agree
 * on what is inside, and no float can hide a block on an edge.
 *
 * Everything here is pure (no world, no time), which is what makes it testable and safe to run again on the server for every request.
 */

export type Pt = readonly [number, number];

export interface LandBox {
  x0: number;
  z0: number;
  /** Inclusive. */
  x1: number;
  z1: number;
}

export type PolygonFault =
  | 'format'
  | 'count'
  | 'coords'
  | 'duplicate'
  | 'short_edge'
  | 'fold'
  | 'self_intersect'
  | 'degenerate'
  | 'too_small'
  | 'too_wide'
  | 'too_large'
  | 'narrow';

/** What a player is told about each fault. */
export const POLYGON_FAULT_TEXT: Record<PolygonFault, string> = {
  format: 'That is not a claim.',
  count: 'A claim needs at least 3 corners, and not too many.',
  coords: 'A corner is somewhere it cannot be.',
  duplicate: 'Two corners are in the same place.',
  short_edge: 'The corners are too close together.',
  fold: 'An edge doubles back over another.',
  self_intersect: 'The boundary crosses itself.',
  degenerate: 'The corners do not make a shape.',
  too_small: 'The land is too small to claim.',
  too_wide: 'The land is spread too far.',
  too_large: 'Selected area exceeds your current land limit.',
  narrow: 'The land is too narrow: a claim has to be at least 5 blocks wide.',
};

export interface Polygon {
  readonly pts: readonly Pt[];
  readonly box: LandBox;
  /** Width and height of the box. */
  readonly w: number;
  readonly h: number;
  /** One byte per block of the box (row by row, z then x): 1 where the block belongs to the claim. */
  readonly mask: Uint8Array;
  /** Blocks in the claim. */
  readonly area: number;
}

export type PolygonResult = { ok: true; polygon: Polygon } | { ok: false; fault: PolygonFault; at?: number };

const cross = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number => (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
const sign = (n: number): number => (n > 0 ? 1 : n < 0 ? -1 : 0);

function onSegment(ax: number, az: number, bx: number, bz: number, px: number, pz: number): boolean {
  return cross(ax, az, bx, bz, px, pz) === 0 && px >= Math.min(ax, bx) && px <= Math.max(ax, bx) && pz >= Math.min(az, bz) && pz <= Math.max(az, bz);
}

/** Do the segments a-b and c-d share any point (touching and overlapping count)? */
export function segmentsTouch(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = sign(cross(a[0], a[1], b[0], b[1], c[0], c[1]));
  const d2 = sign(cross(a[0], a[1], b[0], b[1], d[0], d[1]));
  const d3 = sign(cross(c[0], c[1], d[0], d[1], a[0], a[1]));
  const d4 = sign(cross(c[0], c[1], d[0], d[1], b[0], b[1]));
  if (d1 !== d2 && d3 !== d4) return true;
  return (d1 === 0 && onSegment(a[0], a[1], b[0], b[1], c[0], c[1])) || (d2 === 0 && onSegment(a[0], a[1], b[0], b[1], d[0], d[1])) || (d3 === 0 && onSegment(c[0], c[1], d[0], d[1], a[0], a[1])) || (d4 === 0 && onSegment(c[0], c[1], d[0], d[1], b[0], b[1]));
}

/** Is the block (x, z) inside the polygon or on its boundary? (Ray casting on whole numbers.) */
export function pointInPolygon(pts: readonly Pt[], x: number, z: number): boolean {
  let inside = false;
  const n = pts.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [ax, az] = pts[j];
    const [bx, bz] = pts[i];
    if (onSegment(ax, az, bx, bz, x, z)) return true;
    if (az > z !== bz > z) {
      const t = (bx - ax) * (z - az) - (x - ax) * (bz - az);
      if (bz > az ? t > 0 : t < 0) inside = !inside;
    }
  }
  return inside;
}

/** The box round some corners. */
export function boxOf(pts: readonly Pt[]): LandBox {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const [x, z] of pts) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  return { x0, z0, x1, z1 };
}

/** The blocks of the polygon, as a mask over its box. */
export function rasterize(pts: readonly Pt[], box: LandBox): { mask: Uint8Array; area: number } {
  const w = box.x1 - box.x0 + 1;
  const h = box.z1 - box.z0 + 1;
  const mask = new Uint8Array(w * h);
  let area = 0;
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      if (pointInPolygon(pts, box.x0 + x, box.z0 + z)) {
        mask[z * w + x] = 1;
        area++;
      }
    }
  }
  return { mask, area };
}

/** A mask in which every block is 1 if all blocks within `r` of it (a square) are 1 in the input, or, with `any`, if one of them is. */
function window(mask: Uint8Array, w: number, h: number, r: number, any: boolean): Uint8Array {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  const span = 2 * r + 1;
  // Along x, then along z, with running sums: the cost does not depend on r.
  for (let z = 0; z < h; z++) {
    const pre = new Int32Array(w + 1);
    for (let x = 0; x < w; x++) pre[x + 1] = pre[x] + mask[z * w + x];
    for (let x = 0; x < w; x++) {
      const lo = x - r;
      const hi = x + r;
      const n = pre[Math.min(w - 1, hi) + 1] - pre[Math.max(0, lo)];
      tmp[z * w + x] = any ? (n > 0 ? 1 : 0) : n === span ? 1 : 0;
    }
  }
  for (let x = 0; x < w; x++) {
    const pre = new Int32Array(h + 1);
    for (let z = 0; z < h; z++) pre[z + 1] = pre[z] + tmp[z * w + x];
    for (let z = 0; z < h; z++) {
      const lo = z - r;
      const hi = z + r;
      const n = pre[Math.min(h - 1, hi) + 1] - pre[Math.max(0, lo)];
      out[z * w + x] = any ? (n > 0 ? 1 : 0) : n === span ? 1 : 0;
    }
  }
  return out;
}

/** The share (0..1) of the claim's blocks that lie in some (2r+1) x (2r+1) square that is wholly inside the claim. */
export function solidShare(mask: Uint8Array, w: number, h: number, r: number, area: number): number {
  if (area === 0) return 0;
  const core = window(mask, w, h, r, false);
  const covered = window(core, w, h, r, true);
  let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] === 1 && covered[i] === 1) n++;
  return n / area;
}

const isWhole = (n: unknown, limit: number): n is number => typeof n === 'number' && Number.isInteger(n) && Math.abs(n) <= limit;

/** Read what a client sent as corners: an array of [x, z] pairs of whole numbers. */
export function cornersOf(raw: unknown, cfg: Pick<LandConfig, 'maxCorners' | 'coordLimit'>): Pt[] | PolygonFault {
  if (!Array.isArray(raw)) return 'format';
  if (raw.length < 3 || raw.length > cfg.maxCorners) return 'count';
  const out: Pt[] = [];
  for (const c of raw) {
    if (!Array.isArray(c) || c.length !== 2) return 'format';
    if (!isWhole(c[0], cfg.coordLimit) || !isWhole(c[1], cfg.coordLimit)) return 'coords';
    out.push([c[0], c[1]]);
  }
  return out;
}

/**
 * Check the corners against every rule of shape and work out the claim. Does not know about land, owners or Auren: that is the service's job.
 * `maxArea` is a parameter of its own because a player's limit may be lower than the server's general one.
 */
export function analyzePolygon(raw: unknown, cfg: LandConfig, maxArea: number = cfg.maxArea): PolygonResult {
  const corners = cornersOf(raw, cfg);
  if (typeof corners === 'string') return { ok: false, fault: corners };
  const n = corners.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) if (corners[i][0] === corners[j][0] && corners[i][1] === corners[j][1]) return { ok: false, fault: 'duplicate', at: j };
  }
  const minEdge2 = cfg.minEdge * cfg.minEdge;
  for (let i = 0; i < n; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % n];
    if ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 < minEdge2) return { ok: false, fault: 'short_edge', at: i };
  }
  // An edge that goes back over the one before it.
  for (let i = 0; i < n; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % n];
    const c = corners[(i + 2) % n];
    if (cross(a[0], a[1], b[0], b[1], c[0], c[1]) === 0 && (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) < 0) return { ok: false, fault: 'fold', at: i };
  }
  // No two edges that are not neighbours may touch.
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsTouch(corners[i], corners[(i + 1) % n], corners[j], corners[(j + 1) % n])) return { ok: false, fault: 'self_intersect', at: i };
    }
  }
  let twice = 0;
  for (let i = 0; i < n; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % n];
    twice += a[0] * b[1] - b[0] * a[1];
  }
  if (twice === 0) return { ok: false, fault: 'degenerate' };

  const box = boxOf(corners);
  const w = box.x1 - box.x0 + 1;
  const h = box.z1 - box.z0 + 1;
  if (w > cfg.maxSpan || h > cfg.maxSpan) return { ok: false, fault: 'too_wide' };
  const { mask, area } = rasterize(corners, box);
  if (area < cfg.minArea) return { ok: false, fault: 'too_small' };
  if (area > maxArea) return { ok: false, fault: 'too_large' };
  if (solidShare(mask, w, h, cfg.minHalfWidth, area) < cfg.solidFraction) return { ok: false, fault: 'narrow' };
  return { ok: true, polygon: { pts: corners, box, w, h, mask, area } };
}

/** Is the block in the polygon? (Constant time: the mask answers.) */
export function polygonHas(p: Polygon, x: number, z: number): boolean {
  if (x < p.box.x0 || x > p.box.x1 || z < p.box.z0 || z > p.box.z1) return false;
  return p.mask[(z - p.box.z0) * p.w + (x - p.box.x0)] === 1;
}

/** Is any block of the polygon within `r` (a square, Chebyshev) of (x, z)? */
export function polygonNear(p: Polygon, x: number, z: number, r: number): boolean {
  if (x < p.box.x0 - r || x > p.box.x1 + r || z < p.box.z0 - r || z > p.box.z1 + r) return false;
  const xa = Math.max(p.box.x0, x - r);
  const xb = Math.min(p.box.x1, x + r);
  const za = Math.max(p.box.z0, z - r);
  const zb = Math.min(p.box.z1, z + r);
  for (let zz = za; zz <= zb; zz++) {
    const row = (zz - p.box.z0) * p.w - p.box.x0;
    for (let xx = xa; xx <= xb; xx++) if (p.mask[row + xx] === 1) return true;
  }
  return false;
}

/** Visit every block of the polygon. */
export function eachCell(p: Polygon, visit: (x: number, z: number) => void): void {
  for (let z = 0; z < p.h; z++) {
    const row = z * p.w;
    for (let x = 0; x < p.w; x++) if (p.mask[row + x] === 1) visit(p.box.x0 + x, p.box.z0 + z);
  }
}

/** Does the second polygon lie wholly inside the first (a claim grown from another has to contain it)? */
export function polygonContains(outer: Polygon, inner: Polygon): boolean {
  for (let z = 0; z < inner.h; z++) {
    for (let x = 0; x < inner.w; x++) {
      if (inner.mask[z * inner.w + x] === 1 && !polygonHas(outer, inner.box.x0 + x, inner.box.z0 + z)) return false;
    }
  }
  return true;
}
