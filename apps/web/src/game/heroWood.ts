/**
 * Wood, drawn by hand at 64 x 64: bark, the rings on the end of a log, stripped wood and the planks of every tree.
 *
 * Wood is not a field (a log is a log, a board is a board), so each block gets one of several pictures by where it stands, as
 * with the first planks. What makes them join: every picture of a tile has the very same base (the ridges of the bark, the rows of
 * the boards), and only what lies in its middle differs (a knot, a scar, a patch of lichen, the board that is wholly inside the
 * tile), well clear of the edge. So any two pictures meet along their sides in the same bark or the same board.
 */
import { beyondTiles } from '@solrift/shared';
import { fbm, h2, mix, ramp, shade, vn, wrap, type HeroPainter, type HeroPixel, type RGB } from './heroKit';

const N = 64;
const smooth = (a: number, b: number, t: number): number => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const edgeDist = (x: number, y: number): number => Math.min(x, y, N - 1 - x, N - 1 - y);
/** 1 well inside the tile, falling to 0 at the edge: where a picture may differ from the others. */
const inner = (x: number, y: number): number => smooth(6, 12, edgeDist(x, y));
const scale = (c: RGB, ks: number[]): RGB[] => ks.map((k) => shade(c, k));
const clampc = (c: RGB): RGB => [Math.min(255, Math.max(0, c[0])), Math.min(255, Math.max(0, c[1])), Math.min(255, Math.max(0, c[2]))];
const px = (c: RGB): HeroPixel => [c[0], c[1], c[2], 255];
/** Shorter distance between two positions round the tile. */
const near = (a: number, b: number): number => {
  const d = wrap(a - b);
  return d > N / 2 ? d - N : d;
};
const bt = (name: string): { base: RGB; acc: RGB } => {
  const t = beyondTiles()[name];
  return { base: t.rgb as RGB, acc: (t.accent ?? t.rgb) as RGB };
};

type Variant = (x: number, y: number, v: number) => RGB;
function variants(tile: string, count: number, paint: Variant): { key: string; tile: string; paint: HeroPainter }[] {
  return Array.from({ length: count }, (_, v) => ({ key: `${tile}_${v}`, tile, paint: (x: number, y: number): HeroPixel => px(clampc(paint(x, y, v))) }));
}

// ============================ bark ============================
interface BarkSpec {
  /** Lightest first. */
  tones: RGB[];
  seed: number;
  /** Width of a ridge in pixels (a divisor of 64). */
  ridge?: number;
  /** How dark the grooves between ridges are. */
  groove?: number;
  /** A kind of marking: 'lenticels' (horizontal dashes, birch and cherry), 'plates' (scales, spruce), 'moss', 'warts' (nether stems), 'bands' (palm). */
  mark?: 'lenticels' | 'plates' | 'moss' | 'warts' | 'bands' | 'veins';
  markColor?: RGB;
}

/** Where a knot or scar goes in each picture (all well inside the tile). */
const KNOTS: [number, number][] = [[0, 0], [22, 24], [42, 40], [36, 18]];

function bark(spec: BarkSpec): Variant {
  const W = spec.ridge ?? 8;
  const n = N / W;
  const s = spec.seed;
  const dark = spec.groove ?? 0.55;
  return (x, y, v) => {
    // The base: the same in every picture.
    const warp = (vn(x, y, 32, s + 1) - 0.5) * W * 0.4 + (vn(x, y, 16, s + 2) - 0.5) * W * 0.16;
    const u = (x + warp + N * 4) / W;
    const cell = Math.floor(u);
    const f = u - cell;
    const id = ((cell % n) + n) % n;
    // Each ridge is a long dome, a different tone from the next and changing slowly down its length.
    const seg = Math.floor((y + Math.floor(h2(id, 9, s + 5) * 40)) / 16);
    const t = h2(id, seg & 3, s + 3) * 0.45 + fbm(x, y, s + 4, [32, 16, 8]) * 0.55 + Math.sin(Math.PI * f) * 0.12;
    let c = ramp([...spec.tones].reverse(), (t - 0.35) * 1.7 + 0.2);
    const edge = Math.min(f, 1 - f);
    const jag = (vn(x, y, 8, s + 6) - 0.5) * 0.08;
    if (edge + jag < 0.1) c = shade(c, dark);
    else if (edge + jag < 0.2) c = shade(c, 0.86 + 0.14 * ((edge + jag - 0.1) / 0.1));
    else if (f < 0.4) c = shade(c, 1.09);
    else if (f > 0.7) c = shade(c, 0.93);
    // Splits across a ridge.
    if (h2(id, ((y >> 3) & 7) + 7, s + 7) > 0.88 && edge > 0.2) c = shade(c, 0.78);
    // Markings.
    const mc = spec.markColor ?? [30, 28, 26];
    if (spec.mark === 'lenticels') {
      const row = ((y + id * 3) >> 3) & 7;
      if (h2(id, row, s + 8) > 0.5 && ((y + id * 3) % 8) < 2 && edge > 0.12) c = mix(c, mc, 0.8);
    } else if (spec.mark === 'plates') {
      const row = ((y + id * 5) >> 3) & 7;
      const pr = (y + id * 5) % 8;
      if (pr === 0 && h2(id, row, s + 8) > 0.45 && edge > 0.14) c = shade(c, 0.8);
      else if (pr === 1 && h2(id, row, s + 8) > 0.45 && edge > 0.14) c = shade(c, 1.07);
    } else if (spec.mark === 'warts') {
      const wx = h2(id, (y >> 3) & 7, s + 8);
      if (wx > 0.82 && Math.abs(((y + 4) % 8) - 4) < 2 && f > 0.25 && f < 0.75) c = mix(c, mc, 0.75);
    } else if (spec.mark === 'bands') {
      if ((y + 64 + Math.round(Math.sin(x * Math.PI * 2 * 3 / 64) * 1.2)) % 16 < 2) c = shade(c, 0.74);
      else if ((y + 64 + Math.round(Math.sin(x * Math.PI * 2 * 3 / 64) * 1.2)) % 16 === 2) c = shade(c, 1.1);
    } else if (spec.mark === 'veins') {
      const d = Math.abs(vn(x, y, 16, s + 9) - 0.5);
      if (d < 0.016) c = mix(c, mc, 0.5);
    }
    // The part that differs: a knot, a scar or a patch, only in the middle of the tile.
    const m = inner(x, y);
    if (v > 0 && m > 0) {
      const [kx0, ky0] = KNOTS[v];
      const dx = near(x, kx0) / 4.6;
      const dy = near(y, ky0) / (v === 2 ? 9 : 6);
      const d = Math.hypot(dx, dy);
      if (v === 1 || v === 3) {
        // A knot: a dark eye in a lit ring.
        if (d < 0.55) c = mix(c, shade(spec.tones[3], 0.55), m);
        else if (d < 1) c = mix(c, shade(spec.tones[2], 0.8), 0.9 * m);
        else if (d < 1.35) c = mix(c, shade(spec.tones[0], 1.12), 0.6 * m);
      } else {
        // A long scar where a branch tore off.
        if (d < 0.7) c = mix(c, shade(spec.tones[3], 0.6), m);
        else if (d < 1) c = mix(c, shade(spec.tones[0], 1.2), 0.6 * m);
      }
      if (v === 3 && spec.mark !== 'moss') {
        // (a second, smaller knot, and a crack beside it)
        const d2 = Math.hypot(near(x, 24) / 3.2, near(y, 46) / 4.2);
        if (d2 < 0.55) c = mix(c, shade(spec.tones[3], 0.55), m);
        else if (d2 < 1) c = mix(c, shade(spec.tones[2], 0.8), 0.9 * m);
        if (Math.abs(near(x, 40 + Math.round((y - 20) * 0.08))) < 0.7 && y > 14 && y < 34) c = mix(c, shade(spec.tones[3], 0.6), 0.9 * m);
      }
      if (spec.mark === 'moss') {
        const patch = smooth(0.55, 0.7, fbm(x, y, s + 11 + v, [16, 8, 4]) + (1 - Math.min(1, Math.hypot(near(x, 32), near(y, 32)) / 24)) * 0.25);
        const moss: RGB = spec.mark === 'moss' ? [78, 128, 56] : [92, 120, 66];
        if (patch > 0) c = mix(c, shade(moss, 0.85 + h2(x, y, s + 12) * 0.3), patch * 0.75 * m);
      }
    }
    return c;
  };
}

// ============================ the end of a log ============================
interface TopSpec {
  rim: RGB;
  /** Lightest first. */
  rings: RGB[];
  seed: number;
  /** Tightness of the rings in pixels. */
  step?: number;
}

function logTop(spec: TopSpec): Variant {
  const s = spec.seed;
  const step = spec.step ?? 4.4;
  return (x, y, v) => {
    const d = edgeDist(x, y) + (vn(x, y, 8, s + 1) - 0.5) * 2.4;
    // The bark round the end: a dark band with the grain running round it.
    if (d < 4.2) {
      let c = shade(spec.rim, 0.86 + (vn(x, y, 4, s + 2) - 0.5) * 0.3 + (vn(x, y, 16, s + 3) - 0.5) * 0.2);
      if (d < 1.5) c = shade(c, 0.78);
      else if (d > 3) c = shade(c, 0.9);
      return c;
    }
    // The wood: rings round a heart that is a little off centre, a different place in each picture.
    const cx = 32 + [0, 3, -3, 2][v];
    const cy = 32 + [0, -2, 3, 3][v];
    const wob = (fbm(x, y, s + 4, [32, 16, 8]) - 0.5) * 7;
    const r = Math.hypot(near(x, cx), near(y, cy) * 1.03) + wob;
    const phase = r / step;
    const fr = phase - Math.floor(phase);
    // Each ring: early wood pale, late wood a little darker, then a thin dark line where the next ring begins.
    let c = ramp([...spec.rings].reverse(), 0.5 + 0.34 * (0.5 - fr) - 0.12 * smooth(26, 8, r) + (fbm(x, y, s + 6, [16, 8]) - 0.5) * 0.18);
    const edgeLine = Math.min(fr, 1 - fr);
    if (edgeLine < 0.11) c = shade(c, 0.74 + 0.2 * (edgeLine / 0.11));
    c = shade(c, 1 + (h2(x, y, s + 5) - 0.5) * 0.05);
    // The pith in the middle, and cracks running out from it in some pictures.
    if (r < 2.6) c = shade(spec.rings[3], 0.7);
    if (v >= 2) {
      const a = Math.atan2(near(y, cy), near(x, cx));
      const target = v === 2 ? 0.9 : -2.2;
      let da = Math.abs(a - target);
      if (da > Math.PI) da = 2 * Math.PI - da;
      if (da * Math.max(r, 3) < 0.9 && r > 3 && r < 24) c = shade(c, 0.6);
    }
    // The lip of the bark casts a little shade on the wood.
    if (d < 7) c = shade(c, 0.92 + 0.08 * ((d - 4.2) / 2.8));
    return c;
  };
}

// ============================ stripped wood ============================
function stripped(color: RGB, seed: number): Variant {
  return (x, y, v) => {
    const s = seed;
    // Grain: long streaks running down, wavering, with the pale and dark growth bands of the log seen from the side.
    const warp = (vn(x, y, 32, s + 1) - 0.5) * 6;
    const band = Math.sin(((x + warp) * Math.PI * 2) / 16) * 0.5 + 0.5;
    const streak = h2(Math.floor(x + warp), (Math.floor((y + Math.floor(h2(Math.floor(x + warp), 3, s + 2) * 30)) / 16) & 3), s + 3);
    let c = ramp(scale(color, [0.84, 0.92, 1, 1.07]), 0.25 + band * 0.35 + (streak - 0.5) * 0.4 + (fbm(x, y, s + 4, [32, 16]) - 0.5) * 0.4);
    if (streak > 0.86) c = shade(c, 0.88);
    c = shade(c, 1 + (h2(x, y, s + 5) - 0.5) * 0.05);
    // A knot in the middle of some pictures.
    const m = inner(x, y);
    if (v > 0 && m > 0) {
      const [kx, ky] = KNOTS[v];
      const dx = near(x, kx) / 4;
      const dy = near(y, ky) / 6;
      const d = Math.hypot(dx, dy);
      if (d < 0.5) c = mix(c, shade(color, 0.6), m);
      else if (d < 1) c = mix(c, shade(color, 0.76), 0.8 * m);
      else if (d < 1.35) c = mix(c, shade(color, 0.9), 0.5 * m);
    }
    return c;
  };
}

// ============================ planks ============================
interface PlankSpec {
  /** Lightest first. */
  tones: RGB[];
  seed: number;
  /** Grain contrast (1 is usual). */
  grain?: number;
  /** Knots: chance a row has one. */
  knots?: number;
  /** Rows of boards, in pixels (a divisor of 64). */
  board?: number;
  /** Dark flecks (birch). */
  flecks?: boolean;
  /** Pale streaks across the boards (acacia). */
  streaks?: RGB;
}

function planksOf(spec: PlankSpec): Variant {
  const s = spec.seed;
  const B = spec.board ?? 16;
  const grain = spec.grain ?? 1;
  return (x, y, v) => {
    const r = Math.floor(y / B);
    const ry = y % B;
    // Two butt joints in each row; the board between them lies wholly inside the tile and is the only part that differs.
    const sA = 8 + Math.floor(h2(r, 0, s + 1) * 16);
    const sB = sA + 28 + Math.floor(h2(r, 1, s + 2) * 8);
    const insideBoard = x >= sA && x < sB;
    const o = insideBoard ? v * 19 : 0;
    let c = spec.tones[Math.floor(h2(r, insideBoard ? 1 : 0, s + 3 + o) * spec.tones.length)];
    let k = 1 + (0.1 * h2(x >> 3, y, s + 4 + o) + 0.12 * h2((x + y * 5) >> 4, y >> 1, s + 5 + o) - 0.1) * grain;
    if (h2(x >> 4, y, s + 6 + o) > 0.84) k *= 1 - 0.1 * grain;
    k *= 1.04 - 0.08 * (ry / (B - 1));
    k *= 1 + (h2(x, y, s + 9 + o) - 0.5) * 0.06;
    if (spec.streaks && h2((x + y * 3) >> 3, r, s + 10 + o) > 0.82) c = mix(c, spec.streaks, 0.4);
    if (spec.flecks && h2(x, y, s + 11 + o) > 0.972) c = shade(c, 0.55);
    // A knot in the board that is wholly inside the tile.
    if (insideBoard && h2(r, 7, s + 7 + o) < (spec.knots ?? 0.2)) {
      const kx = sA + 6 + Math.floor(h2(r, 8, s + 8 + o) * (sB - sA - 12));
      const ky = Math.floor(B * 0.45) + Math.floor(h2(r, 9, s + 12 + o) * 3);
      const d = Math.hypot((x - kx) / 4.5, (y - r * B - ky) / 3);
      if (d < 1) c = shade(c, d > 0.62 ? 0.72 : 0.86);
      else if (d < 1.7) k *= 0.95;
    }
    // The lip on top of a board, the shaded underside, the dark gap below, the butt joints.
    if (ry === 0) k *= 1.14;
    else if (ry === 1) k *= 1.06;
    else if (ry === B - 2) k *= 0.8;
    else if (ry === B - 3) k *= 0.92;
    else if (ry === B - 1) k *= 0.5;
    if (x === sA || x === sB) k *= 0.5;
    else if (x === sA + 1 || x === sB + 1) k *= 1.1;
    return shade(c, k);
  };
}

/** Bamboo planks: slats set upright side by side, with the pale scar of a node across some. */
function bambooPlanks(color: RGB, seed: number): Variant {
  return (x, y, v) => {
    const slat = Math.floor(x / 8);
    const sx = x % 8;
    let c = ramp(scale(color, [0.86, 0.94, 1, 1.07]), h2(slat, 0, seed + 1) * 0.7 + (fbm(x, y, seed + 2, [32, 16]) - 0.5) * 0.4);
    let k = 1 + (h2(x, y >> 2, seed + 3) - 0.5) * 0.08;
    if (sx === 0) k *= 1.1;
    else if (sx === 7) k *= 0.62;
    else if (sx === 6) k *= 0.86;
    // The node: a pale band across the slat, different slats in different pictures but never at the edge.
    const ny = 10 + Math.floor(h2(slat, 4, seed + 4 + v * 5) * 40);
    if (Math.abs(y - ny) < 1.5 && sx > 0 && sx < 7 && h2(slat, 5, seed + 5 + v * 5) > 0.45 && inner(x, y) > 0.5) c = mix(c, shade(color, 1.2), 0.7);
    return shade(c, k);
  };
}

/** Bamboo mosaic: little slats woven in squares, alternately laid across and up. */
function bambooMosaic(color: RGB, seed: number): Variant {
  return (x, y) => {
    const bx = Math.floor(x / 8);
    const by = Math.floor(y / 8);
    const across = (bx + by) % 2 === 0;
    const u = across ? y % 8 : x % 8;
    const slat = Math.floor(u / 2);
    let c = ramp(scale(color, [0.86, 0.94, 1, 1.08]), h2(bx, by * 4 + slat, seed + 1) * 0.8 + 0.1);
    let k = 1;
    if (u % 2 === 1) k *= 0.8;
    if (x % 8 === 0 || y % 8 === 0) k *= 0.62;
    k *= 1 + (h2(x, y, seed + 2) - 0.5) * 0.06;
    return shade(c, k);
  };
}

/** Bamboo stalks side by side, each with its nodes. */
function bambooBlock(color: RGB, seed: number): Variant {
  return (x, y, v) => {
    const stalk = Math.floor(x / 16);
    const sx = x % 16;
    // A stalk is round: bright on its left, dark on its right.
    const dome = Math.sin(((sx + 0.5) / 16) * Math.PI);
    let c = mix(shade(color, 0.7), shade(color, 1.18), dome * 0.9 - (sx / 16) * 0.2);
    c = shade(c, 1 + (fbm(x, y, seed + 1, [32, 16, 8]) - 0.5) * 0.14 + (h2(x, y >> 2, seed + 2) - 0.5) * 0.06);
    if (sx === 0 || sx === 15) c = shade(c, 0.55);
    // Nodes: a ring round the stalk, every so far, a different height for each stalk.
    const ny = (14 + stalk * 13) % 32;
    const dy = Math.min(Math.abs(wrap(y - ny)), Math.abs(wrap(y - ny - 32)), Math.abs(wrap(y - ny + 32)));
    if (dy < 1) c = shade(c, 0.66);
    else if (dy < 2) c = shade(c, 1.16);
    // (in the second picture, a scar where a leaf sheath fell away, well inside the tile)
    if (v === 1 && inner(x, y) > 0.4 && Math.abs(near(x, 24)) < 3.5 && Math.abs(near(y, 30)) < 1.5) c = shade(c, 0.7);
    return c;
  };
}

// ============================ the list ============================
const BARKS = (): { tile: string; spec: BarkSpec; top: string; topSpec: TopSpec; stripped?: { tile: string; color: RGB } }[] => [
  {
    tile: 'log_side', top: 'log_top', stripped: { tile: 'oak_stripped', color: [214, 178, 122] },
    spec: { tones: [[142, 112, 70], [124, 98, 60], [104, 80, 48], [80, 60, 36]], seed: 7100 },
    topSpec: { rim: [96, 74, 44], rings: [[196, 160, 106], [180, 144, 90], [188, 152, 98], [166, 130, 80]], seed: 7110 },
  },
  {
    tile: 'birch_log_side', top: 'birch_log_top', stripped: { tile: 'birch_stripped', color: [220, 210, 168] },
    spec: { tones: [[240, 236, 224], [228, 224, 210], [214, 210, 196], [196, 192, 178]], seed: 7200, mark: 'lenticels', markColor: [44, 42, 40], groove: 0.8 },
    topSpec: { rim: [226, 222, 208], rings: [[214, 196, 134], [198, 180, 118], [206, 188, 126], [184, 166, 106]], seed: 7210 },
  },
  {
    tile: 'spruce_log_side', top: 'spruce_log_top', stripped: { tile: 'spruce_stripped', color: [158, 124, 78] },
    spec: { tones: [[100, 74, 48], [84, 62, 40], [70, 51, 32], [52, 38, 24]], seed: 7300, mark: 'plates' },
    topSpec: { rim: [58, 42, 28], rings: [[156, 122, 80], [140, 108, 70], [148, 114, 74], [126, 96, 60]], seed: 7310, step: 3.6 },
  },
  {
    tile: 'acacia_log_side', top: 'acacia_log_top', stripped: { tile: 'acacia_stripped', color: [196, 122, 78] },
    spec: { tones: [[146, 136, 124], [130, 120, 110], [114, 104, 96], [92, 82, 76]], seed: 7400, ridge: 16, groove: 0.62 },
    topSpec: { rim: [104, 94, 86], rings: [[200, 116, 66], [186, 104, 58], [194, 110, 62], [172, 94, 52]], seed: 7410 },
  },
  {
    tile: 'jungle_log_side', top: 'jungle_log_top', stripped: { tile: 'jungle_stripped', color: [186, 140, 96] },
    spec: { tones: [[120, 100, 54], [102, 84, 44], [84, 68, 36], [62, 50, 26]], seed: 7500, mark: 'moss' },
    topSpec: { rim: [74, 58, 30], rings: [[180, 138, 86], [166, 126, 76], [174, 132, 80], [154, 116, 68]], seed: 7510 },
  },
  {
    tile: 'dark_oak_log_side', top: 'dark_oak_log_top', stripped: { tile: 'dark_oak_stripped', color: [110, 82, 48] },
    spec: { tones: [[86, 60, 36], [70, 48, 28], [56, 38, 22], [38, 26, 16]], seed: 7600, ridge: 8, groove: 0.4 },
    topSpec: { rim: [48, 32, 20], rings: [[126, 92, 52], [110, 78, 44], [118, 84, 48], [102, 72, 40]], seed: 7610, step: 3.8 },
  },
  {
    tile: 'cherry_log_side', top: 'cherry_log_top', stripped: { tile: 'cherry_stripped', color: [232, 196, 186] },
    spec: { tones: [[124, 76, 88], [106, 62, 74], [88, 50, 60], [66, 36, 46]], seed: 7700, mark: 'lenticels', markColor: [200, 150, 160], groove: 0.72 },
    topSpec: { rim: [76, 44, 52], rings: [[234, 184, 174], [222, 168, 160], [228, 174, 166], [210, 156, 150]], seed: 7710 },
  },
  {
    tile: 'mangrove_bark', top: 'mangrove_log_top', stripped: { tile: 'mangrove_stripped', color: [168, 112, 92] },
    spec: { tones: [[110, 68, 52], [92, 56, 42], [76, 46, 34], [56, 32, 24]], seed: 7800, groove: 0.45 },
    topSpec: { rim: [74, 44, 34], rings: [[148, 98, 74], [132, 86, 64], [140, 92, 68], [120, 76, 56]], seed: 7810 },
  },
  {
    tile: 'pale_oak_bark', top: 'pale_oak_log_top', stripped: { tile: 'pale_oak_stripped', color: [236, 232, 220] },
    spec: { tones: [[226, 222, 210], [212, 208, 196], [198, 194, 182], [176, 172, 160]], seed: 7900, groove: 0.72, mark: 'veins', markColor: [150, 146, 134] },
    topSpec: { rim: [200, 196, 184], rings: [[232, 226, 208], [220, 214, 196], [226, 220, 202], [208, 202, 184]], seed: 7910 },
  },
  {
    tile: 'poplar_bark', top: 'poplar_log_top', stripped: { tile: 'poplar_stripped', color: [230, 224, 200] },
    spec: { tones: [[196, 192, 170], [182, 178, 156], [166, 162, 140], [138, 134, 114]], seed: 8000, groove: 0.6, mark: 'plates' },
    topSpec: { rim: [160, 156, 132], rings: [[210, 200, 170], [198, 188, 158], [204, 194, 164], [186, 176, 146]], seed: 8010 },
  },
  {
    tile: 'crimson_stem_side', top: 'crimson_stem_top', stripped: { tile: 'stripped_crimson', color: [168, 72, 78] },
    spec: { tones: [[150, 44, 56], [128, 32, 44], [108, 24, 34], [78, 14, 22]], seed: 8100, mark: 'warts', markColor: [220, 120, 90] },
    topSpec: { rim: [88, 20, 28], rings: [[170, 56, 66], [150, 44, 54], [160, 50, 60], [132, 36, 46]], seed: 8110 },
  },
  {
    tile: 'warped_stem_side', top: 'warped_stem_top', stripped: { tile: 'stripped_warped', color: [58, 150, 140] },
    spec: { tones: [[40, 128, 120], [28, 108, 102], [20, 88, 84], [12, 62, 60]], seed: 8200, mark: 'warts', markColor: [110, 220, 190] },
    topSpec: { rim: [14, 66, 64], rings: [[60, 156, 144], [46, 138, 128], [52, 146, 136], [38, 120, 112]], seed: 8210 },
  },
];

/** The woods of The World Beyond, by their colours in the game's data. */
function beyondWood(name: string, seed: number, mark?: BarkSpec['mark'], ridge = 8): { tile: string; spec: BarkSpec; top: string; topSpec: TopSpec } {
  const ring = bt(`${name}_log_top`);
  const side = bt(`${name}_log_side`);
  return {
    tile: `${name}_log_side`,
    top: `${name}_log_top`,
    spec: { tones: scale(side.base, [1.2, 1, 0.82, 0.62]), seed, mark, markColor: side.acc, ridge, groove: mark === 'bands' ? 0.8 : 0.5 },
    topSpec: { rim: shade(side.base, 0.78), rings: scale(ring.base, [1.12, 1, 1.06, 0.9]), seed: seed + 10 },
  };
}

const PLANKS: [string, PlankSpec][] = [
  ['birch_planks', { tones: [[204, 188, 134], [196, 179, 123], [186, 170, 114], [210, 196, 142]], seed: 8300, flecks: true, grain: 0.8 }],
  ['spruce_planks', { tones: [[124, 92, 54], [114, 84, 48], [104, 76, 42], [132, 98, 58]], seed: 8400, knots: 0.12 }],
  ['jungle_planks', { tones: [[170, 124, 88], [160, 115, 80], [148, 104, 72], [178, 132, 96]], seed: 8500, knots: 0.34, grain: 1.3 }],
  ['acacia_planks', { tones: [[180, 98, 56], [168, 90, 50], [156, 82, 44], [190, 108, 64]], seed: 8600, streaks: [214, 150, 104], grain: 1.2 }],
  ['dark_oak_planks', { tones: [[76, 50, 24], [66, 43, 20], [58, 37, 17], [84, 58, 30]], seed: 8700, grain: 0.9 }],
  ['cherry_planks', { tones: [[234, 188, 182], [226, 178, 172], [216, 168, 162], [240, 196, 190]], seed: 8800, grain: 0.7, knots: 0.06 }],
  ['poplar_planks', { tones: [[220, 212, 182], [214, 206, 175], [206, 198, 166], [226, 218, 190]], seed: 8900, grain: 0.7 }],
  ['mangrove_planks', { tones: [[128, 62, 54], [116, 54, 48], [104, 46, 42], [136, 70, 60]], seed: 9000, grain: 1.2, knots: 0.18 }],
  ['pale_oak_planks', { tones: [[238, 232, 216], [230, 224, 208], [220, 214, 198], [244, 238, 224]], seed: 9100, grain: 0.6, knots: 0.08 }],
];

function beyondPlanks(name: string, seed: number): [string, PlankSpec] {
  const t = bt(name);
  return [name, { tones: scale(t.base, [1.06, 1, 0.92, 1.1]), seed, grain: 1, knots: 0.16 }];
}

const out: { key: string; tile: string; paint: HeroPainter }[] = [];
const wood = [
  ...BARKS(),
  beyondWood('redwood', 9300, undefined, 16),
  beyondWood('palm', 9400, 'bands', 16),
  beyondWood('ebon', 9500, 'veins'),
  beyondWood('worldroot', 9600, 'veins', 16),
  beyondWood('petrified', 9700, undefined, 8),
];
for (const w of wood) {
  out.push(...variants(w.tile, 4, bark(w.spec)));
  out.push(...variants(w.top, 4, logTop(w.topSpec)));
  const st = (w as { stripped?: { tile: string; color: RGB } }).stripped;
  if (st) out.push(...variants(st.tile, 4, stripped(st.color, w.spec.seed + 50)));
}
for (const [name, spec] of [...PLANKS, beyondPlanks('redwood_planks', 9310), beyondPlanks('palm_planks', 9410)]) out.push(...variants(name, 4, planksOf(spec)));
out.push(...variants('bamboo_planks', 4, bambooPlanks([196, 176, 80], 9800)));
out.push(...variants('bamboo_mosaic', 1, bambooMosaic([176, 150, 64], 9810)));
out.push(...variants('bamboo_block', 2, bambooBlock([198, 186, 72], 9820)));
out.push(...variants('bamboo_stripped', 4, stripped([222, 206, 122], 9830)));

export const WOOD_PICS = out;
