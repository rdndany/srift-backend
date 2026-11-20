/**
 * Ores, drawn by hand at 64 x 64: nuggets, gems, crystals and dust set in the rock.
 *
 * An ore block is stone with something in it, and the stone must be the very stone around it, or every ore would sit in a frame.
 * So a picture here is only the ore: the terrain shader paints the stone of the world (the same stone field the plain blocks show)
 * wherever the picture is "stone", and lays the ore over it. A picture's alpha says which: 255 is ore, and less is the stone
 * showing through (the fraction of 254 being how much shade the ore casts on it). Nothing of an ore touches the edge of the tile
 * (every nugget is at least five pixels clear of it), so an ore block meets any other block exactly as plain stone does, and the
 * four pictures of an ore, which only place their nuggets differently, join the same way.
 *
 * The 16 x 16 picture (items, particles, the map) is the same with the stone painted in.
 */
import { beyondTiles } from '@solrift/shared';
import { fbm, h2, mix, ramp, shade, vn, type HeroPainter, type HeroPixel, type RGB } from './heroKit';
import { stoneBase } from './heroStone';

const N = 64;
const shadeOf = (c: RGB, k: number): RGB => shade(c, k);
const tonesOf = (c: RGB, ks: number[]): RGB[] => ks.map((k) => shadeOf(c, k));
const bt = (name: string): { base: RGB; acc: RGB } => {
  const t = beyondTiles()[name];
  return { base: t.rgb as RGB, acc: (t.accent ?? t.rgb) as RGB };
};

type Shape = 'round' | 'gem' | 'spike' | 'dust';
interface OreSpec {
  seed: number;
  shape: Shape;
  count: number;
  /** Smallest and largest radius in pixels. */
  r: [number, number];
  /** Darkest first. */
  tones: RGB[];
  speck?: RGB;
  speckChance?: number;
  /** Clusters of nuggets in a picture, and how far a cluster spreads in pixels. */
  clusters?: number;
  spread?: number;
  /** A bright glint on the lit side of each nugget. */
  glint?: RGB;
  /** The nuggets shine of their own (see EMISSIVE_ORES). */
}

interface Blob {
  x: number;
  y: number;
  r: number;
  rot: number;
  id: number;
}

const blobCache = new Map<string, Blob[]>();
/** The nuggets of one picture: a few clusters, each of several nuggets lying close and overlapping a little, like a vein cut across. */
function blobsOf(spec: OreSpec, v: number): Blob[] {
  const key = `${spec.seed}:${v}`;
  let list = blobCache.get(key);
  if (list) return list;
  list = [];
  const s = spec.seed + v * 31;
  const clusters = spec.clusters ?? 3;
  const per = Math.ceil(spec.count / clusters);
  const spread = spec.spread ?? 11;
  for (let c = 0; c < clusters; c++) {
    // Cluster centres are spread over the tile (never two on the same spot): a loose triangle, turned a different way in each picture.
    const ang = (c / clusters) * Math.PI * 2 + h2(v, 1, s + 1) * 6.28;
    const rad = 14 + h2(c, 2, s + 2) * 6;
    const cx = 32 + Math.cos(ang) * rad;
    const cy = 32 + Math.sin(ang) * rad;
    for (let i = 0; i < per; i++) {
      const a = h2(c * 16 + i, 3, s + 3) * Math.PI * 2;
      const d = (i === 0 ? 0 : 0.5 + 0.5 * h2(c * 16 + i, 4, s + 4)) * spread;
      const r = spec.r[0] + (spec.r[1] - spec.r[0]) * h2(c * 16 + i, 5, s + 5) * (i === 0 ? 1 : 0.8);
      let x = cx + Math.cos(a) * d;
      let y = cy + Math.sin(a) * d * 0.9;
      const reach = (spec.shape === 'spike' ? r * 1.7 : r * 1.15) + 6;
      x = Math.min(N - reach, Math.max(reach, x));
      y = Math.min(N - reach, Math.max(reach, y));
      list.push({ x, y, r, rot: (h2(c * 16 + i, 6, s + 6) - 0.5) * (spec.shape === 'gem' ? 1.6 : 1.1), id: c * 16 + i });
    }
  }
  blobCache.set(key, list);
  return list;
}
let stone: RGB[] | null = null;
const stoneAt = (x: number, y: number): RGB => {
  if (!stone) {
    stone = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) stone.push(stoneBase(i, j));
  }
  return stone[y * N + x];
};

/** How far into a nugget (1 at its edge) a pixel is, by the shape. */
function reachOf(spec: OreSpec, b: Blob, x: number, y: number): { d: number; dx: number; dy: number; u: number; w: number } {
  const dx = x + 0.5 - b.x;
  const dy = y + 0.5 - b.y;
  const cs = Math.cos(b.rot);
  const sn = Math.sin(b.rot);
  const u = dx * cs + dy * sn;
  const w = -dx * sn + dy * cs;
  let d: number;
  if (spec.shape === 'gem') d = Math.max(Math.max(Math.abs(u), Math.abs(w)), (Math.abs(u) + Math.abs(w)) * 0.74) / b.r;
  else if (spec.shape === 'spike') d = Math.hypot(u / (b.r * 0.6), w / (b.r * 1.6));
  else d = Math.hypot(dx, dy) / b.r + (vn(x, y, 8, spec.seed + 3) - 0.5) * 0.5 + (vn(x, y, 4, spec.seed + 4) - 0.5) * 0.25;
  return { d, dx, dy, u, w };
}

/** One picture of an ore: [r, g, b, a] with the alpha code described above. */
function orePainter(spec: OreSpec): (x: number, y: number, v: number) => HeroPixel {
  return (x, y, v) => {
    const s = spec.seed;
    // The nugget this pixel is deepest in (where two overlap, the nearer to its heart wins), else the shade of the nearest.
    let best: { b: Blob; r: ReturnType<typeof reachOf> } | null = null;
    let shadow = 1;
    for (const b of blobsOf(spec, v)) {
      const rr = reachOf(spec, b, x, y);
      if (rr.d < 1) {
        if (!best || rr.d < best.r.d) best = { b, r: rr };
      } else if (rr.d < 1.45 && rr.dx + rr.dy > 0) shadow = Math.min(shadow, 1 - 0.22 * (1 - (rr.d - 1) / 0.45));
    }
    if (best) {
      const { b, r: { d, dx, dy, u, w } } = best;
      // The nugget: lit from the upper left, with a dark edge on its lower right and a bright lip on its upper left.
      const lit = Math.min(1, Math.max(0, 0.5 - (dx + dy) / (2.4 * b.r)));
      let t = 0.18 + 0.62 * lit + (h2(x, y, s + 5) - 0.5) * 0.14 + (fbm(x, y, s + 6, [8, 4]) - 0.5) * 0.25;
      let k = 1;
      if (spec.shape === 'gem') {
        // Facets: four slopes meeting at the middle, each catching the light differently.
        const facet = (u > w ? 1 : 0) + (u > -w ? 2 : 0);
        t += [0.26, -0.06, 0.12, -0.3][facet];
        if (Math.abs(Math.abs(u) - Math.abs(w)) < 0.5) k *= 1.12;
      }
      if (d > 0.78) {
        if (dx + dy > 0) k *= 0.66;
        else t += 0.2;
      }
      let c = shadeOf(ramp(spec.tones, t), k);
      if (spec.speck && h2(x, y, s + 7) < (spec.speckChance ?? 0.05)) c = mix(c, spec.speck, 0.8);
      // A bright glint high on the lit side.
      if (spec.glint && Math.hypot(dx + b.r * 0.38, dy + b.r * 0.38) < Math.max(1.1, b.r * 0.2) && d < 0.8) c = mix(c, spec.glint, 0.85);
      return [c[0], c[1], c[2], 255];
    }
    if (shadow < 1) {
      const c = shadeOf(stoneAt(x, y), shadow);
      return [c[0], c[1], c[2], Math.round(254 * shadow)];
    }    const c = stoneAt(x, y);
    return [c[0], c[1], c[2], 254];
  };
}

const out: { key: string; tile: string; paint: HeroPainter }[] = [];
export const EMISSIVE_ORES = new Set<string>(['redstone_ore', 'crystal_ore']);
const add = (tile: string, spec: OreSpec): void => {
  const p = orePainter(spec);
  for (let v = 0; v < 4; v++) out.push({ key: `${tile}_${v}`, tile, paint: (x, y) => p(x, y, v) });
};

add('coal_ore', { seed: 15000, shape: 'round', count: 9, r: [5, 8.5], clusters: 3, tones: [[14, 14, 16], [30, 30, 34], [52, 52, 58], [88, 88, 96]], speck: [120, 120, 128], speckChance: 0.025 });
add('iron_ore', { seed: 15100, shape: 'round', count: 11, r: [4, 7], tones: [[150, 100, 78], [190, 138, 108], [218, 170, 136], [240, 206, 176]], speck: [112, 70, 52], speckChance: 0.08 });
add('gold_ore', { seed: 15200, shape: 'round', count: 8, r: [4.5, 7.5], clusters: 3, tones: [[164, 112, 14], [214, 164, 28], [248, 208, 62], [255, 240, 150]], glint: [255, 252, 220], speck: [255, 236, 120], speckChance: 0.05 });
add('diamond_ore', { seed: 15300, shape: 'gem', count: 7, r: [5, 9], clusters: 2, spread: 9, tones: [[22, 140, 164], [56, 200, 214], [126, 238, 240], [226, 255, 255]], glint: [255, 255, 255] });
add('lapis_ore', { seed: 15400, shape: 'round', count: 15, r: [3.2, 5.4], clusters: 3, tones: [[20, 44, 132], [34, 70, 186], [60, 104, 222], [120, 152, 244]], speck: [230, 236, 255], speckChance: 0.04 });
add('emerald_ore', { seed: 15500, shape: 'gem', count: 6, r: [4.5, 8], clusters: 2, spread: 9, tones: [[14, 112, 52], [30, 164, 80], [84, 218, 128], [190, 255, 212]], glint: [240, 255, 245] });
add('redstone_ore', { seed: 15600, shape: 'dust', count: 21, r: [2.6, 4.4], clusters: 3, spread: 12, tones: [[104, 8, 8], [164, 14, 14], [222, 32, 26], [255, 112, 92]], speck: [255, 170, 150], speckChance: 0.07 });
const crystal = bt('crystal_ore');
add('crystal_ore', { seed: 15700, shape: 'spike', count: 9, r: [5, 8], clusters: 3, spread: 8, tones: tonesOf(crystal.base, [0.55, 0.78, 1, 1.18]).map((c, i) => (i === 3 ? mix(c, crystal.acc, 0.6) : c)), glint: crystal.acc });
const cin = bt('cinnabar_ore');
add('cinnabar_ore', { seed: 15800, shape: 'round', count: 10, r: [4.5, 7], clusters: 3, tones: tonesOf(cin.base, [0.6, 0.82, 1, 1.2]), glint: cin.acc, speck: cin.acc, speckChance: 0.04 });
const sul = bt('sulfur_ore');
add('sulfur_ore', { seed: 15900, shape: 'dust', count: 18, r: [3.4, 5.4], clusters: 3, spread: 12, tones: tonesOf(sul.base, [0.7, 0.86, 1, 1.12]), speck: sul.acc, speckChance: 0.08 });

export const ORE_PICS = out;
