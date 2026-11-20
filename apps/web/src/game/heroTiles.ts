/**
 * Hero tiles: the blocks you see most (grass, and the earth under it) drawn at 64 x 64 instead of the atlas's 16 x 16, with the
 * hand-painted look of a lush turf block: a bright, clumpy lawn with a few flowers and a berry, long strands of grass hanging over
 * the side, and plain soil of lumpy clods under it.
 *
 * The terrain shader draws these from a texture of their own (see `chunkMaterial.ts`). The 16 x 16 atlas, which the hotbar, held
 * blocks, particles and the map read, gets the same tile boxed down (`heroDownsample`), so every picture of the block agrees.
 * Every tile wraps at its edge like the others, so greedy-merged quads still tile.
 */

import { COLOR_PICS } from './heroColor';
import { ROCK_PICS } from './heroRock';
import { SOIL_PICS } from './heroSoil';
import { WOOD_PICS } from './heroWood';
import { BRICK_PICS } from './heroBrick';
import { POLISH_PICS } from './heroPolish';
import { NATURE_PICS } from './heroNature';
import { ORE_PICS } from './heroOre';
import { turfSides } from './heroTurf';
import { OBJECT_PICS } from './heroObjects';
import { PLANT_PICS } from './heroPlants';
import { DECOR_PICS, oakDecor } from './heroDecor';
import { STONE_PICS } from './heroStone';
import { HERO_PX, N, clamp01, diff, h2, mix, shade, vn, wrap, type HeroPainter, type HeroPixel, type RGB } from './heroKit';

export { HERO_PX };
export type { HeroPixel };

// ---- the lawn ----
/** Deep green to sunlit lime: green all the way (a hint of yellow only in the brightest tips). */
const GRASS: RGB[] = [[46, 108, 24], [62, 132, 30], [82, 156, 38], [102, 174, 46], [126, 190, 54]];

function turf(x: number, y: number, s = 0): RGB {
  // Clumps of a few pixels each: broad drifts of light, then a coarse and a fine scatter on top.
  const o = s * 37;
  const v = vn(x, y, 16, 11 + o) * 0.45 + vn(x, y, 8, 12 + o) * 0.3 + h2(x >> 2, y >> 2, 13 + o) * 0.25;
  const t = clamp01(v + (h2(x >> 1, y >> 1, 14 + o) - 0.5) * 0.4 + (vn(x, y, 32, 15 + o) - 0.5) * 0.5);
  let c = GRASS[Math.min(GRASS.length - 1, Math.floor(t * GRASS.length))];
  // Short blades: a dark stroke with a bright tip.
  const row = y + (x >> 1) * 7;
  if (h2(x >> 1, row >> 2, 16 + o) > 0.74) c = (row & 3) === 0 ? shade(c, 1.22) : shade(c, 0.84);
  return c;
}

/**
 * The lawns, one per variant: the terrain picks one for every block by where it stands, so no two neighbours need look alike.
 * Most are plain grass; a few have a yellow flower or two, or a red berry, each in a different place.
 */
interface Lawn {
  flowers: [number, number][];
  berries: [number, number][];
}
const LAWNS: Lawn[] = [
  { flowers: [], berries: [] },
  { flowers: [], berries: [] },
  { flowers: [], berries: [] },
  { flowers: [], berries: [] },
  { flowers: [], berries: [] },
  { flowers: [[20, 44]], berries: [] },
  { flowers: [[45, 15], [11, 22]], berries: [] },
  { flowers: [], berries: [[36, 38]] },
];

const lawnPixel = (variant: number): HeroPainter => {
  const lawn = LAWNS[variant];
  return (x, y) => {
    for (const [cx, cy] of lawn.flowers) {
      const u = diff(x, cx) - 0.5;
      const v = diff(y, cy) - 0.5;
      const au = Math.abs(u);
      const av = Math.abs(v);
      if (Math.max(au, av) <= 0.5) return [236, 150, 28, 255];
      if (Math.min(au, av) <= 1.0 && Math.max(au, av) <= 3.5) return u + v < -1 ? [255, 238, 110, 255] : u + v > 2.5 ? [214, 172, 30, 255] : [248, 216, 52, 255];
    }
    for (const [cx, cy] of lawn.berries) {
      const u = diff(x, cx) - 0.5;
      const v = diff(y, cy) - 0.5;
      const d = Math.hypot(u, v);
      if (d <= 2.2) return d < 0.9 && u < 0 && v < 0 ? [255, 176, 150, 255] : u + v > 1.2 ? [128, 20, 24, 255] : [196, 36, 30, 255];
    }
    // Every lawn is the same turf (it wraps at the edge), so neighbours of any variant meet without a seam; only the decals differ.
    const c = turf(x, y);
    return [c[0], c[1], c[2], 250];
  };
};
// ---- the strands of turf over the side ----
/** How far down the turf hangs in a column, in pixels. */
function turfDepth(x: number): number {
  const g = Math.floor((x + 1) / 3);
  const u = (x + 1) % 3;
  const base = 12 + 5 * vn(x, 0, 8, 21);
  if (h2(g, 2, 24) < 0.55) return base;
  let len = 14 + h2(g, 0, 22) * 16;
  if (h2(g, 1, 23) > 0.86) len += 12;
  // A strand is thickest in the middle and thins at its sides.
  if (u !== 1) len -= 3;
  return Math.max(base, len);
}

// ---- earth: lumpy clods of soil ----
/** Warm soil tones, from sunlit orange-brown to damp dark. */
const SOIL: RGB[] = [[176, 116, 72], [160, 102, 62], [146, 92, 56], [130, 82, 52], [114, 72, 46]];
const CREVICE: RGB = [88, 56, 40];
const CLOD = 8;
const CLODS = N / CLOD;

/**
 * Earth as irregular clods, not rows: a jittered grid of lumps, each its own shade of soil, lit on the upper left and shaded on the
 * lower right, with narrow crooked crevices between them, nothing but earth colours: no moss, no pebbles.
 */
function earth(x: number, y: number): HeroPixel {
  const cx = Math.floor(x / CLOD);
  const cy = Math.floor(y / CLOD);
  let d1 = 1e9;
  let d2 = 1e9;
  let id = 0;
  let ox = 0;
  let oy = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gi = (((cx + i) % CLODS) + CLODS) % CLODS;
      const gj = (((cy + j) % CLODS) + CLODS) % CLODS;
      const px = (cx + i) * CLOD + (0.1 + 0.8 * h2(gi, gj, 51)) * CLOD;
      const py = (cy + j) * CLOD + (0.1 + 0.8 * h2(gi, gj, 52)) * CLOD;
      const dx = x + 0.5 - px;
      const dy = (y + 0.5 - py) * 1.25; // a little wider than tall, like a clod
      const d = Math.hypot(dx, dy);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = gj * CLODS + gi;
        ox = dx;
        oy = dy;
      } else if (d < d2) d2 = d;
    }
  }
  const gap = d2 - d1;
  // The crevices wander a little, so they are never a straight line.
  const wob = (vn(x, y, 8, 53) - 0.5) * 0.9;
  if (gap + wob < 0.5 && h2(x >> 1, y >> 1, 61) > 0.25) {
    const n = 1 + (h2(x, y, 54) - 0.5) * 0.3;
    return [CREVICE[0] * n, CREVICE[1] * n, CREVICE[2] * n, 255];
  }
  const t = clamp01(h2(id, 3, 55) * 0.6 + vn(x, y, 16, 56) * 0.5);
  let c: RGB = SOIL[Math.min(SOIL.length - 1, Math.floor(t * SOIL.length))];
  // Lit from the upper left: the side of a clod that faces it is brighter, the far side darker; and it is lumpier than flat.
  const lit = clamp01(0.5 - (ox + oy) * 0.07);
  c = shade(c, 0.82 + 0.4 * lit);
  if (gap + wob < 1.6) c = shade(c, ox + oy < 0 ? 1.08 : 0.9);
  c = shade(c, 1 + (h2(x >> 1, y >> 1, 57) - 0.5) * 0.2 + (h2(x, y, 62) - 0.5) * 0.1);
  return [c[0], c[1], c[2], 255];
}
// ---- tilled farmland ----
/** Rich, damp tilled soil: warm brown ridges, lit from above, with dark wet furrows between them. */
const TILLED: RGB[] = [[122, 84, 58], [112, 76, 52], [102, 68, 48], [92, 62, 44]];
const FURROW: RGB = [52, 36, 30];
/** Rows run left to right, one ridge and furrow every 16 pixels, so they carry on across the next block (and the tile wraps). */
const ROW = 16;

function farmland(x: number, y: number): HeroPixel {
  // The rows wander a little, as a hoe leaves them.
  const yy = y + (vn(x, y, 16, 71) - 0.5) * 3.2 + (vn(x, y, 32, 72) - 0.5) * 2;
  const p = (((yy % ROW) + ROW) % ROW) / ROW;
  const crest = Math.sin(Math.PI * p);
  // The ridge faces the light on its upper side (p < 0.5, the rows' top slope) and turns away on the lower.
  const slope = Math.cos(Math.PI * p);
  // Crumbs and clods of the soil on the ridge: soft patches, then small lumps of a pixel or two.
  const patch = vn(x, y, 16, 73) * 0.6 + vn(x, y, 8, 74) * 0.4;
  let c: RGB = TILLED[Math.min(TILLED.length - 1, Math.floor(clamp01(patch) * TILLED.length))];
  let k = 0.74 + 0.26 * crest + 0.16 * slope;
  const lump = h2(x >> 1, y >> 1, 75);
  if (lump > 0.8) k *= slope > -0.2 ? 1.28 : 1.0; // a lit crumb
  else if (lump < 0.14) k *= 0.76; // a shaded hollow
  k *= 1 + (h2(x, y, 76) - 0.5) * 0.18 + (vn(x, y, 8, 77) - 0.5) * 0.16;
  // The bottom of a furrow is damp and dark.
  const wet = clamp01((0.16 - Math.min(p, 1 - p)) / 0.16);
  c = mix(c, FURROW, wet * 0.55);
  return [c[0] * k, c[1] * k, c[2] * k, 255];
}

// ---- cobblestone ----
/** Stones are 16 pixels across (a quarter of a block), laid in a wrapped, jittered grid. */
const ST = 16;
const STONES = N / ST;
const STONE_COOL: RGB = [120, 122, 134];
const STONE_WARM: RGB = [152, 138, 122];
const MORTAR: RGB = [44, 42, 50];
/** The colours of a kind of stonework: the cool and the warm end of its stones, and the joints. */
interface StonePalette {
  cool: RGB;
  warm: RGB;
  mortar: RGB;
}
const GREY_STONE: StonePalette = { cool: STONE_COOL, warm: STONE_WARM, mortar: MORTAR };
/** Cobbled deepslate: nearly black blue-grey stones, a touch of violet in the warm ones, and black joints. */
const DEEP_STONE: StonePalette = { cool: [58, 62, 78], warm: [82, 76, 88], mortar: [16, 16, 22] };
const MOSS: RGB[] = [[52, 92, 34], [68, 112, 40], [86, 134, 48], [108, 152, 58]];
/**
 * Only the stones in the middle of the tile (not those that touch its edge) differ from one picture to the next, in shape and in
 * shade, so any two pictures put side by side meet along their edges in the very same stones: the layout changes, the seam does not.
 */
const inner = (gi: number, gj: number): boolean => gi >= 1 && gi <= STONES - 2 && gj >= 1 && gj <= STONES - 2;

function cobble(x: number, y: number, variant: number, mossy: boolean, pal: StonePalette = GREY_STONE): HeroPixel {
  const cx = Math.floor(x / ST);
  const cy = Math.floor(y / ST);
  let d1 = 1e9;
  let d2 = 1e9;
  let id = 0;
  let sv = 0;
  let ox = 0;
  let oy = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gi = (((cx + i) % STONES) + STONES) % STONES;
      const gj = (((cy + j) % STONES) + STONES) % STONES;
      const v = inner(gi, gj) ? variant : 0;
      const px = (cx + i) * ST + (0.15 + 0.7 * h2(gi, gj, 81 + v * 17)) * ST;
      const py = (cy + j) * ST + (0.15 + 0.7 * h2(gi, gj, 82 + v * 17)) * ST;
      const dx = x + 0.5 - px;
      const dy = (y + 0.5 - py) * 1.2; // stones are a little wider than tall
      const d = Math.hypot(dx, dy);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = gj * STONES + gi;
        sv = v;
        ox = dx;
        oy = dy;
      } else if (d < d2) d2 = d;
    }
  }
  const gap = d2 - d1;
  const wob = (vn(x, y, 8, 83) - 0.5) * 1.6;
  const grain = 1 + (h2(x, y, 87) - 0.5) * 0.12 + (vn(x, y, 4, 86) - 0.5) * 0.12;
  // Moss grows in drifts of a few stones, thickest on the lit side of a stone, and creeps into the joints.
  let moss = 0;
  if (mossy) {
    const m = vn(x, y, 16, 91) * 0.5 + vn(x, y, 8, 92) * 0.3 + h2(x >> 1, y >> 1, 93) * 0.2 - 0.02 * (ox + oy);
    moss = clamp01((m - 0.5) / 0.1);
  }
  if (gap + wob < 2.2) {
    let c = shade(pal.mortar, grain);
    if (moss > 0) c = mix(c, shade(MOSS[0], 0.8), moss * 0.6);
    return [c[0], c[1], c[2], 255];
  }
  let c = mix(pal.cool, pal.warm, h2(id, 5, 84 + sv * 17));
  c = shade(c, 0.8 + 0.34 * h2(id, 6, 85 + sv * 17));
  // A stone is domed: lit on its upper left, shaded on its lower right, with a light lip and a dark foot where it meets the joints.
  const lit = clamp01(0.55 - (ox + oy) * 0.03);
  c = shade(c, 0.78 + 0.46 * lit);
  if (gap + wob < 5) c = shade(c, ox + oy < 0 ? 1.12 : 0.76);
  if (h2(x, y, 88) > 0.965) c = shade(c, 0.78);
  if (moss > 0) {
    const mc = MOSS[Math.min(MOSS.length - 1, Math.floor((0.2 + 0.8 * h2(x >> 1, y >> 1, 94) * moss + 0.35 * lit) * MOSS.length))];
    c = mix(c, mc, moss * 0.9);
  }
  c = shade(c, grain);
  return [c[0], c[1], c[2], 255];
}
const cobblePixel =
  (variant: number, mossy: boolean, pal: StonePalette = GREY_STONE): HeroPainter =>
  (x, y) =>
    cobble(x, y, variant, mossy, pal);
const COBBLE_VARIANTS = 4;

// ---- wooden planks ----
/** Honey-oak tones, from sunlit gold to shaded amber. */
const OAK: RGB[] = [[198, 154, 98], [188, 144, 88], [178, 134, 80], [206, 162, 104]];
const BOARD = 16;
const PLANK_VARIANTS = 4;

/**
 * Boards laid in rows of 16 pixels (four to a block), running on across every block. Each row has two butt joints: between them lies a
 * board that is wholly inside the tile, and it is the only part that differs from one picture to the next (its tone, grain and knots);
 * the board that crosses the tile's edge is the same in every picture, so any two pictures meet along their sides in the same board.
 */
function planks(x: number, y: number, variant: number): HeroPixel {
  const r = Math.floor(y / BOARD);
  const ry = y % BOARD;
  const sA = 8 + Math.floor(h2(r, 0, 201) * 16);
  const sB = sA + 28 + Math.floor(h2(r, 1, 202) * 8);
  const inside = x >= sA && x < sB;
  const s = inside ? variant * 19 : 0;
  let c = OAK[Math.floor(h2(r, inside ? 1 : 0, 203 + s) * OAK.length)];
  // Grain: long streaks along the board, some darker.
  let k = 0.9 + 0.1 * h2(x >> 3, y, 204 + s) + 0.12 * h2((x + y * 5) >> 4, y >> 1, 205 + s);
  if (h2(x >> 4, y, 206 + s) > 0.84) k *= 0.9;
  k *= 1.04 - 0.08 * (ry / (BOARD - 1));
  k *= 1 + (h2(x, y, 209 + s) - 0.5) * 0.06;
  // A knot in the board that is wholly inside the tile.
  if (inside && h2(r, 7, 207 + s) > 0.8) {
    const kx = sA + 6 + Math.floor(h2(r, 8, 208 + s) * (sB - sA - 12));
    const ky = 7 + Math.floor(h2(r, 9, 210 + s) * 3);
    const d = Math.hypot((x - kx) / 4.5, (y - r * BOARD - ky) / 3);
    if (d < 1) c = shade(c, d > 0.62 ? 0.72 : 0.86);
    else if (d < 1.7) k *= 0.95;
  }
  // The edges of the board: a lit lip on top, a shaded underside, and the dark gap to the board below.
  if (ry === 0) k *= 1.14;
  else if (ry === 1) k *= 1.06;
  else if (ry === 14) k *= 0.8;
  else if (ry === 13) k *= 0.92;
  else if (ry === 15) k *= 0.5;
  // The butt joints, and a nail near each end of a board.
  if (x === sA || x === sB) k *= 0.5;
  else if (x === sA + 1 || x === sB + 1) k *= 1.1;
  if ((x === sA + 3 || x === sB + 3) && (ry === 3 || ry === 12)) k *= 0.55;
  return [c[0] * k, c[1] * k, c[2] * k, 255];
}
const planksPixel =
  (variant: number): HeroPainter =>
  (x, y) =>
    planks(x, y, variant);

// ---- leaves ----
/**
 * A crown of foliage: three layers of pointed leaves with a rib down the middle, each lit along its upper left rim and shaded along the
 * lower right, the ones in front throwing a little shade on the ones behind, in soft drifting patches of sun and shadow. Where no leaf
 * reaches, it is deep shade, or (here and there) a gap the sky shows through (alpha 0).
 *
 * The tile covers two blocks and wraps; the terrain shader lays it over the world (not block by block), so a canopy is one carpet of
 * leaves with no seams between blocks. `alpha` is 250 for the foliage that takes the biome's tint, 255 for the one that keeps its colour.
 */
function leafHero(tones: RGB[], alpha: number, seed: number, holes: number): HeroPainter {
  let grid: HeroPixel[] | null = null;
  const build = (): HeroPixel[] => {
    const ramp: RGB[] = [shade(tones[0], 1.15), tones[0], tones[1], tones[2], tones[3], shade(tones[3], 0.6)];
    const owner = new Int16Array(N * N).fill(-1);
    const where = new Float32Array(N * N);
    const layers = [
      { n: 84, len: 4.4, wid: 2.1, base: 3.1 },
      { n: 70, len: 4.8, wid: 2.3, base: 2.2 },
      { n: 54, len: 5.0, wid: 2.5, base: 1.3 },
    ];
    let id = 0;
    for (const L of layers) {
      for (let i = 0; i < L.n; i++, id++) {
        const rnd = (k: number): number => h2(id & 63, k + 8 * (id >> 6), seed);
        const cx = rnd(0) * N;
        const cy = rnd(1) * N;
        const len = L.len * (0.8 + rnd(2) * 0.5);
        const wid = L.wid * (0.8 + rnd(3) * 0.5);
        const ang = rnd(4) * Math.PI;
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const base = L.base + (rnd(5) - 0.5) * 1.3 - (rnd(6) > 0.88 ? 0.7 : 0);
        const R = Math.ceil(len) + 1;
        for (let dy = -R; dy <= R; dy++) {
          for (let dx = -R; dx <= R; dx++) {
            const px = Math.floor(cx) + dx;
            const py = Math.floor(cy) + dy;
            const rx = px + 0.5 - cx;
            const ry = py + 0.5 - cy;
            const u = (rx * ca + ry * sa) / len;
            const v = (-rx * sa + ry * ca) / wid;
            if (Math.abs(u) > 1) continue;
            const hw = 1 - Math.abs(u) ** 1.8;
            if (Math.abs(v) > hw) continue;
            // Lit from the upper left; a bright rim on that side, a dark one on the other; a rib down the middle.
            const light = -(rx + ry) / (len + wid);
            let p = base - light * 1.7;
            if (hw - Math.abs(v) < 0.22) p += light > 0 ? -0.5 : 0.55;
            if (Math.abs(v) * wid < 0.45 && Math.abs(u) < 0.82) p += 0.4;
            const idx = wrap(py) * N + wrap(px);
            owner[idx] = id;
            where[idx] = p;
          }
        }
      }
    }
    const out: HeroPixel[] = new Array<HeroPixel>(N * N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const idx = y * N + x;
        if (owner[idx] < 0) {
          const gap = vn(x, y, 8, seed + 3) * 0.7 + h2(x, y, seed + 4) * 0.3 < 0.25 + holes * 3;
          const c = ramp[5];
          out[idx] = gap ? [0, 0, 0, 0] : [c[0], c[1], c[2], alpha];
          continue;
        }
        let p = where[idx];
        // The leaves in front throw their shade behind them.
        if (owner[wrap(y - 1) * N + wrap(x - 1)] > owner[idx]) p += 1;
        else if (owner[wrap(y - 2) * N + wrap(x - 2)] > owner[idx]) p += 0.45;
        // Soft patches of sun and shadow across the tile.
        p += (vn(x, y, 32, seed + 5) - 0.5) * 0.9 + (vn(x, y, 16, seed + 6) - 0.5) * 0.5;
        p = Math.max(0, Math.min(4.999, p));
        const i0 = Math.floor(p);
        const c = mix(ramp[i0], ramp[i0 + 1], p - i0);
        const g = 1 + (h2(x, y, seed + 9) - 0.5) * 0.06;
        out[idx] = [c[0] * g, c[1] * g, c[2] * g, alpha];
      }
    }
    return out;
  };
  return (x, y) => {
    grid ??= build();
    return grid[y * N + x];
  };
}
const LEAVES: { tile: string; tones: RGB[]; alpha: number; seed: number; holes: number }[] = [
  { tile: 'leaves', tones: [[104, 184, 58], [74, 152, 46], [52, 122, 38], [34, 92, 30]], alpha: 250, seed: 161, holes: 0.1 },
  { tile: 'birch_leaves', tones: [[158, 202, 100], [132, 182, 84], [108, 158, 68], [84, 130, 54]], alpha: 255, seed: 162, holes: 0.1 },
  { tile: 'spruce_leaves', tones: [[72, 138, 86], [52, 110, 68], [38, 88, 54], [26, 66, 42]], alpha: 255, seed: 163, holes: 0.09 },
  { tile: 'acacia_leaves', tones: [[124, 186, 58], [100, 160, 46], [78, 132, 36], [54, 100, 28]], alpha: 250, seed: 463, holes: 0.1 },
  { tile: 'jungle_leaves', tones: [[78, 180, 54], [54, 152, 42], [38, 122, 34], [24, 92, 26]], alpha: 250, seed: 473, holes: 0.09 },
  { tile: 'dark_oak_leaves', tones: [[80, 148, 46], [58, 122, 38], [42, 96, 30], [28, 70, 22]], alpha: 250, seed: 483, holes: 0.07 },
  { tile: 'cherry_leaves', tones: [[255, 206, 222], [246, 178, 204], [232, 150, 184], [210, 122, 158]], alpha: 255, seed: 493, holes: 0.11 },
  // The leaves of the other trees: from the colours the game gives them, lightest to darkest, none tinted by the biome.
  ...(
    [
      ['mangrove_leaves', [62, 122, 72], 503, 0.1],
      ['pale_oak_leaves', [186, 198, 180], 513, 0.1],
      ['azalea_leaves', [64, 128, 66], 523, 0.1],
      ['flowering_azalea_leaves', [78, 132, 78], 533, 0.1],
      ['redwood_leaves', [46, 112, 58], 543, 0.09],
      ['palm_fronds', [76, 158, 60], 553, 0.16],
      ['ebon_leaves', [40, 30, 74], 563, 0.1],
      ['worldroot_leaves', [60, 176, 120], 573, 0.1],
      ['autumn_leaves_red', [184, 56, 36], 583, 0.1],
      ['autumn_leaves_orange', [218, 118, 36], 593, 0.1],
      ['autumn_leaves_yellow', [226, 190, 52], 603, 0.1],
      ['frosted_leaves', [172, 214, 226], 613, 0.1],
      ['silver_leaves', [188, 200, 224], 623, 0.1],
      ['dream_leaves', [176, 134, 224], 633, 0.1],
      ['luminous_leaves', [50, 190, 170], 643, 0.1],
    ] as [string, RGB, number, number][]
  ).map(([tile, base, seed, holes]) => ({ tile, tones: [shade(base, 1.32), shade(base, 1.08), shade(base, 0.86), shade(base, 0.64)] as RGB[], alpha: 255, seed, holes })),
];
/** Pink blossoms among the leaves: little clusters of two or three pixels, a bright heart in each. */
function blossoms(leaf: HeroPainter): HeroPainter {
  return (x, y) => {
    const p = leaf(x, y);
    if (p[3] === 0) return p;
    const g = h2(x >> 1, y >> 1, 977);
    if (g > 0.9) return g > 0.965 ? [255, 214, 232, 255] : [238, 128, 176, 255];
    return p;
  };
}
/** Every leaf tile (the shader treats them all alike: foliage laid over the crown). */
export const LEAF_TILES: string[] = LEAVES.map((l) => l.tile);

function grassSide(x: number, y: number): HeroPixel {
  const depth = turfDepth(x);
  if (y < depth) {
    const t = y / depth;
    let c = shade(turf(x, y), 1.06 - 0.42 * t);
    if (y < 3) c = shade(c, 1.15);
    if (y >= Math.floor(depth) - 1) c = shade(c, 0.64);
    return [c[0], c[1], c[2], 250];
  }
  const e = earth(x, y);
  // The turf throws a shadow on the earth under it.
  const d = y - depth;
  const k = d < 5 ? 0.62 + 0.38 * (d / 5) : 1;
  return [e[0] * k, e[1] * k, e[2] * k, e[3]];
}

/** One picture in the strip: the tile it is for, and how it is drawn. A tile with several (the lawns) shows one at random per block. */
export const HERO_STRIP: { key: string; tile: string; paint: HeroPainter }[] = [
  ...LAWNS.map((_, i) => ({ key: `grass_top_${i}`, tile: 'grass_top', paint: lawnPixel(i) })),
  { key: 'grass_side', tile: 'grass_side', paint: grassSide },
  ...turfSides(earth),
  { key: 'dirt', tile: 'dirt', paint: earth },
  { key: 'farmland_top', tile: 'farmland_top', paint: farmland },
  ...LEAVES.map((l) => ({ key: l.tile, tile: l.tile, paint: l.tile === 'flowering_azalea_leaves' ? blossoms(leafHero(l.tones, l.alpha, l.seed, l.holes)) : leafHero(l.tones, l.alpha, l.seed, l.holes) })),
  ...OBJECT_PICS,
  ...PLANT_PICS,
  ...DECOR_PICS,
  ...oakDecor(planksPixel(0)),
  // (from here on, every picture runs on across the blocks without edge lines, see SEAMLESS_HERO; the first of them are the world-mapped "fields", see FIELD_HERO)
  ...STONE_PICS,
  ...ROCK_PICS,
  ...SOIL_PICS,
  ...COLOR_PICS,
  ...POLISH_PICS,
  ...NATURE_PICS,
  ...WOOD_PICS,
  ...BRICK_PICS,
  ...ORE_PICS,
  ...Array.from({ length: COBBLE_VARIANTS }, (_, i) => ({ key: `cobble_${i}`, tile: 'cobble', paint: cobblePixel(i, false) })),
  ...Array.from({ length: COBBLE_VARIANTS }, (_, i) => ({ key: `mossy_cobble_${i}`, tile: 'mossy_cobble', paint: cobblePixel(i, true) })),
  ...Array.from({ length: COBBLE_VARIANTS }, (_, i) => ({ key: `cobbled_deepslate_${i}`, tile: 'cobbled_deepslate', paint: cobblePixel(i, false, DEEP_STONE) })),
  ...Array.from({ length: PLANK_VARIANTS }, (_, i) => ({ key: `planks_${i}`, tile: 'planks', paint: planksPixel(i) })),
];
/** The tiles that run on across the blocks on every face, top and sides (no edge lines): stonework and planks. A range of picture numbers in the strip. */
export const SEAMLESS_HERO = { first: HERO_STRIP.findIndex((e) => e.key === 'stone_0'), end: HERO_STRIP.length };
/** The fields: masses of one material (stone, sand, snow...) that the shader lays over the world and not block by block, drifting between the two pictures of the tile. */
export const FIELD_HERO = { first: SEAMLESS_HERO.first, end: HERO_STRIP.findIndex((e) => e.key === WOOD_PICS[0].key) };
/** The ores (see heroOre.ts): stone with something in it, the stone being the world's own, drawn by the shader. */
export const ORE_HERO = { first: HERO_STRIP.findIndex((e) => e.key === ORE_PICS[0].key), end: HERO_STRIP.findIndex((e) => e.key === ORE_PICS[0].key) + ORE_PICS.length };
export const ORE_TILES = new Set(ORE_PICS.map((e) => e.tile));
/** The tiles that are fields. */
export const FIELD_TILES = new Set(HERO_STRIP.slice(FIELD_HERO.first, FIELD_HERO.end).map((e) => e.tile));
/** The pictures sit in a grid, HERO_COLS across (a texture is only so wide). */
export const HERO_COLS = 32;
export const HERO_COUNT = HERO_STRIP.length;
export const HERO_ROWS = Math.ceil(HERO_COUNT / HERO_COLS);
const PAINTERS_BY_KEY: Record<string, HeroPainter> = Object.fromEntries(HERO_STRIP.map((e) => [e.key, e.paint]));
/** The tiles drawn at the larger size. */
export const HERO_TILES: string[] = [...new Set(HERO_STRIP.map((e) => e.tile))];
/** Where a tile's pictures are in the strip: the first, and how many. */
export function heroSlot(tile: string): { first: number; count: number } {
  let slot = SLOTS.get(tile);
  if (!slot) {
    slot = { first: HERO_STRIP.findIndex((e) => e.tile === tile), count: HERO_STRIP.filter((e) => e.tile === tile).length };
    SLOTS.set(tile, slot);
  }
  return slot;
}
const SLOTS = new Map<string, { first: number; count: number }>();
const cache = new Map<string, Uint8ClampedArray>();

/** The tile as N x N rgba, top row first. */
export function heroPixels(name: string): Uint8ClampedArray {
  let px = cache.get(name);
  if (px) return px;
  const paint = PAINTERS_BY_KEY[name];
  px = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const p = paint(x, y);
      px.set([Math.round(p[0]), Math.round(p[1]), Math.round(p[2]), p[3]], (y * N + x) * 4);
    }
  }
  cache.set(name, px);
  return px;
}

/** The pixel of the 16 x 16 version of a tile (every pixel is a box of 4 x 4 of the large one). */
export function heroDownsample(tile: string, x: number, y: number, size = 16): HeroPixel {
  const px = heroPixels(HERO_STRIP[heroSlot(tile).first].key);
  const k = N / size;
  let r = 0;
  let g = 0;
  let b = 0;
  let tinted = 0;
  let solid = 0;
  for (let j = 0; j < k; j++) {
    for (let i = 0; i < k; i++) {
      const o = ((y * k + j) * N + x * k + i) * 4;
      // (alpha 0 is a gap in foliage: it does not count towards the colour)
      if (px[o + 3] === 0) continue;
      solid++;
      r += px[o];
      g += px[o + 1];
      b += px[o + 2];
      if (px[o + 3] < 255) tinted++;
    }
  }
  const n = k * k;
  // (an ore's 16 x 16 picture is the whole stone and what is in it: nothing in it is a gap or a tint)
  if (ORE_TILES.has(tile)) return [r / Math.max(1, solid), g / Math.max(1, solid), b / Math.max(1, solid), 255];
  if (solid * 3 < n * 2) return [r / Math.max(1, solid), g / Math.max(1, solid), b / Math.max(1, solid), 0];
  return [r / solid, g / solid, b / solid, tinted * 2 >= solid ? 250 : 255];
}
