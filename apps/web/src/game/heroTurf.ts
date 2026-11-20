/**
 * The sides of the blocks that have a turf on top: snow, podzol, mycelium, the golden and the dead grass, the cold turf of the
 * tundra. Each is the picture of its own top (the very ground that lies on top of the block, so the two meet without a change of
 * colour at the corner) hanging over the earth in drips and strands of different length, with the shade it throws on the earth
 * below, as the grass block's side does.
 */
import { fbm, h2, mix, shade, vn, type HeroPainter, type HeroPixel, type RGB } from './heroKit';
import { SOIL_PICS } from './heroSoil';

const TAU = Math.PI * 2;
const topOf = (key: string): HeroPainter => {
  const e = SOIL_PICS.find((p) => p.key === key);
  if (!e) throw new Error(`no picture ${key}`);
  return e.paint;
};

interface TurfSide {
  tile: string;
  /** The key of the picture of the top that hangs over the side. */
  top: string;
  /** How far the turf hangs down in each column, in pixels. */
  depth: (x: number) => number;
  /** The earth is tinted towards this by `amount`, and brightened or darkened by `k`. */
  earth?: { color: RGB; amount: number; k: number };
  /** Shade the turf throws on the earth, at the strongest. */
  shadow?: number;
  /** Rounded edge: the lowest pixels of a strand are shaded, as the grass block's are. */
  rim?: number;
  seed: number;
}

/** Strands and drips: the turf hangs lower in some columns, in groups of three with the middle longest, never the same twice. */
function drips(base: number, wave: number, reach: number, seed: number): (x: number) => number {
  return (x) => {
    const g = Math.floor((x + 1) / 4) % 16;
    const u = (x + 1) % 4;
    const b = base + wave * vn(x, 0, 8, seed + 1);
    if (h2(g, 2, seed + 4) < 0.5) return b;
    let len = base + 2 + h2(g, 0, seed + 2) * reach;
    if (h2(g, 1, seed + 3) > 0.88) len += 10;
    if (u === 0 || u === 3) len -= 4;
    return Math.max(b, len);
  };
}

/** Snow: a deep cap, its edge scalloped in soft rounded lumps and a few icicle-like drips. */
function snowDepth(seed: number): (x: number) => number {
  return (x) => {
    const lumps = Math.sin((x / 64) * TAU * 4 + h2(0, 1, seed) * 6) * 2.6 + Math.sin((x / 64) * TAU * 7 + 1.3) * 1.5;
    const base = 20 + lumps + 3 * vn(x, 0, 16, seed + 1);
    const g = Math.floor((x + 2) / 4) % 16;
    const u = (x + 2) % 4;
    if (h2(g, 2, seed + 4) > 0.8) return base + (u === 1 || u === 2 ? 7 + h2(g, 0, seed + 2) * 8 : 2);
    return base;
  };
}

const SIDES: TurfSide[] = [
  { tile: 'snow_side', top: 'snow_0', depth: snowDepth(16000), earth: { color: [70, 76, 96], amount: 0.1, k: 1 }, shadow: 0.7, rim: 0.78, seed: 16000 },
  { tile: 'podzol_side', top: 'podzol_top_0', depth: drips(16, 5, 18, 16100), earth: { color: [88, 60, 38], amount: 0.28, k: 0.88 }, shadow: 0.62, rim: 0.66, seed: 16100 },
  { tile: 'mycelium_side', top: 'mycelium_top_0', depth: drips(16, 5, 18, 16200), earth: { color: [96, 78, 96], amount: 0.14, k: 0.95 }, shadow: 0.62, rim: 0.66, seed: 16200 },
  { tile: 'golden_grass_block_side', top: 'golden_grass_block_top_0', depth: drips(16, 5, 18, 16300), earth: { color: [150, 110, 62], amount: 0.2, k: 1 }, shadow: 0.64, rim: 0.66, seed: 16300 },
  { tile: 'dead_grass_block_side', top: 'dead_grass_block_top_0', depth: drips(15, 4, 16, 16400), earth: { color: [150, 120, 88], amount: 0.3, k: 1.02 }, shadow: 0.7, rim: 0.7, seed: 16400 },
  { tile: 'tundra_turf_side', top: 'tundra_turf_top_0', depth: drips(16, 4, 16, 16500), earth: { color: [104, 100, 92], amount: 0.34, k: 0.96 }, shadow: 0.66, rim: 0.68, seed: 16500 },
];

/** Side pictures, given the picture of earth to hang them over. */
export function turfSides(earth: HeroPainter): { key: string; tile: string; paint: HeroPainter }[] {
  return SIDES.map((spec) => {
    const top = topOf(spec.top);
    const paint: HeroPainter = (x, y): HeroPixel => {
      const depth = spec.depth(x);
      if (y < depth) {
        const t = y / depth;
        let c = top(x, y);
        let col: RGB = [c[0], c[1], c[2]];
        col = shade(col, 1.06 - 0.3 * t);
        if (y < 2) col = shade(col, 1.1);
        // The lowest pixels of a strand roll under and are in its own shade.
        const bottom = depth - y;
        if (bottom < 1.5) col = shade(col, spec.rim ?? 0.7);
        else if (bottom < 3) col = shade(col, 0.9);
        return [col[0], col[1], col[2], 255];
      }
      const e = earth(x, y);
      let col: RGB = [e[0], e[1], e[2]];
      if (spec.earth) col = shade(mix(col, spec.earth.color, spec.earth.amount), spec.earth.k);
      // A deeper shade on the earth just under the turf, easing out.
      const d = y - depth;
      const k = d < 6 ? (spec.shadow ?? 0.64) + (1 - (spec.shadow ?? 0.64)) * (d / 6) : 1;
      col = shade(col, k * (1 + (fbm(x, y, spec.seed + 9, [16, 8]) - 0.5) * 0.06));
      return [col[0], col[1], col[2], 255];
    };
    return { key: spec.tile, tile: spec.tile, paint };
  });
}
