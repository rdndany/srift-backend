/**
 * The little tools every hand-painted hero tile is made with: colours, hashes and noise that wrap at the tile's edge.
 * (A hero tile is 64 x 64; see heroTiles.ts for what they are and how the terrain shader shows them.)
 */

export const HERO_PX = 64;
export const N = HERO_PX;

export type RGB = readonly [number, number, number];
/**
 * r, g, b and a: 250 marks a biome-tinted pixel (as in the atlas), 255 a pixel that keeps its colour, 0 a gap you see through
 * (foliage).
 */
export type HeroPixel = [number, number, number, number];
export type HeroPainter = (x: number, y: number) => HeroPixel;

export const wrap = (v: number): number => ((v % N) + N) % N;
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** A colour from a ramp (darkest or first colour first) at a position 0..1, blended between the two nearest. */
export function ramp(colors: readonly RGB[], t: number): RGB {
  const p = clamp01(t) * (colors.length - 1);
  const i = Math.min(colors.length - 2, Math.floor(p));
  return mix(colors[i], colors[i + 1], p - i);
}
export const px = (c: RGB, a = 255): HeroPixel => [c[0], c[1], c[2], a];

/** A hash of a lattice point in 0..1, repeating every tile. */
export function h2(x: number, y: number, seed: number): number {
  let h = Math.imul(wrap(x), 374761393) ^ Math.imul(wrap(y), 668265263) ^ Math.imul(seed + 1, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth noise in 0..1 that repeats every tile (`period` must divide the tile). */
export function vn(x: number, y: number, period: number, seed: number): number {
  const cells = N / period;
  const fx = wrap(x) / period;
  const fy = wrap(y) / period;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const sx = fx - x0;
  const sy = fy - y0;
  const tx = sx * sx * (3 - 2 * sx);
  const ty = sy * sy * (3 - 2 * sy);
  const g = (i: number, j: number): number => h2((i % cells) * period, (j % cells) * period, seed);
  const a = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * tx;
  const b = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * tx;
  return a + (b - a) * ty;
}

/** Layers of smooth noise, broad to fine (0..1): the usual way to get a natural drift of tone. */
export function fbm(x: number, y: number, seed: number, periods: readonly number[] = [32, 16, 8, 4]): number {
  let sum = 0;
  let norm = 0;
  periods.forEach((p, i) => {
    const w = 1 / (i + 1.3);
    sum += vn(x, y, p, seed + i * 7) * w;
    norm += w;
  });
  return sum / norm;
}

/** How far (in pixels, roughly) a pixel is from the 0.5 contour of a smooth noise: the line of a crack or a vein, of the same thickness all along it. */
export function ridge(x: number, y: number, period: number, seed: number): number {
  const n = vn(x, y, period, seed);
  const gx = vn(x + 1, y, period, seed) - vn(x - 1, y, period, seed);
  const gy = vn(x, y + 1, period, seed) - vn(x, y - 1, period, seed);
  return Math.abs(n - 0.5) / (Math.hypot(gx, gy) * 0.5 + 1e-4);
}

/** The shortest signed distance from a to b round the tile. */
export const diff = (a: number, b: number): number => {
  const d = wrap(a - b);
  return d > N / 2 ? d - N : d;
};

/** The nearest two points of a jittered grid of `cells` x `cells` points over the (wrapped) tile: the stuff of stones, pebbles and clods. */
export interface Cell {
  d1: number;
  d2: number;
  /** Which point is nearest, 0..cells*cells. */
  id: number;
  /** From the nearest point to this pixel. */
  dx: number;
  dy: number;
}
export function cells(x: number, y: number, count: number, seed: number, jitter = 0.8, squash = 1): Cell {
  const size = N / count;
  const cx = Math.floor(x / size);
  const cy = Math.floor(y / size);
  let d1 = 1e9;
  let d2 = 1e9;
  let id = 0;
  let ox = 0;
  let oy = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gi = (((cx + i) % count) + count) % count;
      const gj = (((cy + j) % count) + count) % count;
      const lo = (1 - jitter) / 2;
      const px = (cx + i) * size + (lo + jitter * h2(gi, gj, seed)) * size;
      const py = (cy + j) * size + (lo + jitter * h2(gi, gj, seed + 1)) * size;
      const dx = x + 0.5 - px;
      const dy = (y + 0.5 - py) * squash;
      const d = Math.hypot(dx, dy);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = gj * count + gi;
        ox = dx;
        oy = dy;
      } else if (d < d2) d2 = d;
    }
  }
  return { d1, d2, id, dx: ox, dy: oy };
}
