/**
 * Brickwork, drawn by hand at 64 x 64: stone bricks (plain, mossy, cracked), deepslate, tuff, clay, nether, mud, the ancient and
 * the marble bricks, the bricks of cinnabar, sulfur and resin.
 *
 * A wall of bricks is not a field, so each block gets one of four pictures by where it stands (as the planks do). What makes them
 * join: every picture of a tile has the very same courses, the very same joints (they wander a little, so no joint is a ruled
 * line), the very same chips and cracks and moss along the edge, and only bricks wholly inside the middle of the tile are re-toned
 * or cracked or stained. So any two pictures meet in the same joints and the same bricks, and a wall of different pictures has no
 * seam to be found.
 */
import { beyondTiles } from '@solrift/shared';
import { fbm, h2, mix, ramp, ridge, shade, vn, wrap, type HeroPainter, type HeroPixel, type RGB } from './heroKit';

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

interface BrickSpec {
  /** Lightest first. */
  tones: RGB[];
  mortar: RGB;
  seed: number;
  /** Height of a course in pixels (8 or 16). */
  course: number;
  /** Bricks in a course. */
  per: number;
  /** Rows are all alike but shifted (a running bond) when true, or every course has its own joints when false. */
  cracks?: boolean;
  moss?: number;
  mossColor?: RGB;
  /** How strongly the bricks differ in tone (1 is usual). */
  spread?: number;
  /** Fine speckle in the stone. */
  grain?: number;
  /** A glossy highlight. */
  gloss?: boolean;
}

interface Row {
  /** Where each brick starts, ascending, then the first start plus 64. */
  edges: number[];
}

function layoutOf(spec: BrickSpec): Row[] {
  const rows: Row[] = [];
  const count = N / spec.course;
  for (let r = 0; r < count; r++) {
    const h = (i: number): number => h2(r, i, spec.seed + 500);
    // The brick that crosses the seam has at least five pixels on each side of it; the others share the rest.
    const seamW = Math.round(Math.max(12, (N / spec.per) * (0.7 + 0.5 * h(0))));
    const j0 = Math.round(5 + (seamW - 10) * (0.25 + 0.5 * h(1)));
    const first = j0;
    const last = N - (seamW - j0);
    const span = last - first;
    const nIn = spec.per - 1;
    const edges: number[] = [first];
    // Interior bricks of near-equal widths, a little different from one another.
    const w = new Array<number>(nIn).fill(span / nIn).map((v, i) => v * (0.88 + 0.24 * h(2 + i)));
    const total = w.reduce((a, b) => a + b, 0);
    let at = first;
    for (let i = 0; i < nIn - 1; i++) {
      at += (w[i] / total) * span;
      edges.push(Math.round(at));
    }
    edges.push(last);
    edges.push(first + N);
    rows.push({ edges });
  }
  return rows;
}


/** A crack that wanders down through the bricks, jogging left and right, and breaking off into a few short branches. */
function crackMask(seed: number, starts: [number, number][], len: number, bound?: [number, number]): Uint8Array {
  const mask = new Uint8Array(N * N);
  const put = (x: number, y: number): boolean => {
    if (bound && (x < bound[0] || x > bound[1] || y < bound[0] || y > bound[1])) return false;
    mask[wrap(y) * N + wrap(x)] = 1;
    return true;
  };
  const walk = (x0: number, y0: number, n: number, dir: number, salt: number, depth: number): void => {
    let x = x0;
    let y = y0;
    let dx = dir;
    for (let i = 0; i < n; i++) {
      const h = h2(Math.floor(x0 + 31), i + salt * 7, seed + salt);
      if (h < 0.1) dx = -1;
      else if (h > 0.9) dx = 1;
      else if (h > 0.5 && h < 0.56) dx = 0;
      // Mostly down, leaning a little; now and then it runs sideways along a joint.
      if (h2(i, salt, seed + 99) < 0.08) x += dx || 1;
      else {
        y += 1;
        if (i % 2 === 0) x += dx;
      }      if (!put(x, y)) return;
      if (depth < 2 && i > 3 && h2(i, salt, seed + 97) > 0.975) walk(x, y, Math.floor(n / 3), dx === 0 ? 1 : -dx, salt + 11 + i, depth + 1);
    }
  };
  starts.forEach(([x, y], i) => walk(x, y, len, h2(i, 0, seed + 96) < 0.5 ? -1 : 1, i * 3 + 1, 0));
  return mask;
}
const crackCache = new Map<string, Uint8Array>();
function cracksOf(seed: number, kind: 'base' | 'v2' | 'v3'): Uint8Array {
  const key = `${seed}:${kind}`;
  let m = crackCache.get(key);
  if (!m) {
    if (kind === 'base') {
      const starts: [number, number][] = [0, 1, 2, 3].map((i) => [(i * 16 + Math.floor(h2(i, 1, seed + 60) * 14)) % N, (i * 29 + Math.floor(h2(i, 2, seed + 60) * 20)) % N]);
      m = crackMask(seed + 61, starts, 40);
    } else {
      const k = kind === 'v2' ? 0 : 1;
      m = crackMask(seed + 70 + k, [[16 + Math.floor(h2(k, 1, seed + 71) * 26), 12 + Math.floor(h2(k, 2, seed + 71) * 10)]], 34, [11, 52]);
    }
    crackCache.set(key, m);
  }
  return m;
}
/** Darkens a pixel on a crack, and lights the lip beside it. */
function crackShade(c: RGB, mask: Uint8Array, x: number, y: number): RGB {
  if (mask[wrap(y) * N + wrap(x)]) return shade(c, 0.4);
  if (mask[wrap(y) * N + wrap(x - 1)] || mask[wrap(y - 1) * N + wrap(x)]) return shade(c, 0.78);
  if (mask[wrap(y) * N + wrap(x + 1)] || mask[wrap(y + 1) * N + wrap(x)]) return shade(c, 1.1);
  return c;
}
function brickPainter(spec: BrickSpec): (x: number, y: number, v: number) => RGB {
  const rows = layoutOf(spec);
  const s = spec.seed;
  const H = spec.course;
  const nRows = N / H;
  const mortarW = H >= 16 ? 2 : 1;
  const spread = spec.spread ?? 1;
  return (x, y, v) => {
    // Joints wander a little, so none is ruled straight.
    const wx = Math.round((vn(x, y, 16, s + 1) - 0.5) * 2.2 + (vn(x, y, 8, s + 2) - 0.5) * 0.9);
    const wy = Math.round((vn(x, y, 32, s + 3) - 0.5) * 2.2);
    const yy = y + wy + N * 2;
    const r = Math.floor(yy / H) % nRows;
    const ry = yy % H;
    const row = rows[r];
    const xx = wrap(x + wx);
    const x2 = xx < row.edges[0] ? xx + N : xx;
    let k = 0;
    while (k < row.edges.length - 2 && row.edges[k + 1] <= x2) k++;
    const bx = x2 - row.edges[k];
    const bw = row.edges[k + 1] - row.edges[k];
    const id = k % (row.edges.length - 1);
    const seamBrick = k === row.edges.length - 2;
    const gx = h2(r * 8 + k, 0, s + 4);

    // Is this brick wholly inside the tile, in a course clear of the top and bottom? Then it is one of those a picture may change.
    const lo = row.edges[k];
    const hi = row.edges[k + 1];
    const free = !seamBrick && lo >= 5 && hi <= 59 && r > 0 && r < nRows - 1;

    // Mortar: the joints between courses and between bricks.
    const fat = H >= 16 && vn(x, y, 8, s + 14) > 0.7 ? 1 : 0;
    const mortar = ry < mortarW + fat * (ry < H / 2 ? 1 : 0) || bx < mortarW + fat;
    const wob = fbm(x, y, s + 5, [16, 8, 4]);
    const mortarTone = shade(spec.mortar, 0.9 + wob * 0.22 + (h2(x, y, s + 6) - 0.5) * 0.08);
    let c: RGB;
    if (mortar) {
      c = mortarTone;
      // The brick above and the brick to the left cast a little shade into the joint.
      if (ry === 0 || bx === 0) c = shade(c, 0.78);
    } else {
      // A brick: its own tone, pitted and lumpy, lit from the upper left.
      let shift = 0;
      let extra = 0;
      if (free && v > 0) {
        shift = (h2(r * 8 + k, v, s + 40) - 0.5) * 0.5 * spread;
        extra = h2(r * 8 + k, v, s + 41);
      }
      const base = (gx - 0.5) * 0.55 * spread + (fbm(x, y, s + 7, [32, 16, 8]) - 0.5) * 0.55 + shift + 0.5;
      c = ramp([...spec.tones].reverse(), base);
      const pit = h2(x, y, s + 8);
      const g = spec.grain ?? 1;
      if (pit > 0.965) c = shade(c, 1 + 0.16 * g);
      else if (pit < 0.04) c = shade(c, 1 - 0.18 * g);
      const hh = (qx: number, qy: number): number => fbm(qx, qy, s + 13, [16, 8, 4]);
      c = shade(c, 1 + (vn(x, y, 4, s + 9) - 0.5) * 0.1 + (hh(x - 1, y - 1) - hh(x + 1, y + 1)) * 1.6 + ((bx - bw / 2) / bw) * -0.08);
      // The face of the brick domes a little: bright on its upper left, darker on its lower right.
      const top = ry - mortarW;
      const left = bx - mortarW;
      const bottom = H - 1 - ry;
      const right = bw - 1 - bx;
      if (top === 0 || left === 0) c = shade(c, 1.14);
      else if (top === 1 && H >= 16) c = shade(c, 1.06);
      if (bottom === 0 || right === 0) c = shade(c, 0.78);
      else if (bottom === 1 && H >= 16) c = shade(c, 0.9);
      // Corners are rounded off, and a few bricks are chipped: a little of the corner is gone.
      const dxs = Math.min(left, right);
      const dys = Math.min(top, bottom);
      if (dxs === 0 && dys === 0) c = mix(c, mortarTone, 0.6);
      const chip = h2(r * 8 + k, 5, s + 10);
      if (chip > 0.8) {
        const cornerX = chip > 0.9 ? left : right;
        const cornerY = top;
        const depth = 2 + Math.floor((chip * 100) % 3);
        if (cornerX + cornerY < depth && cornerX >= 0 && cornerY >= 0) c = mix(c, mortarTone, 0.8);
        else if (cornerX + cornerY === depth) c = shade(c, 0.78);
      }
      if (spec.gloss && top <= 3 && left <= 8 && top + left < 7) c = shade(c, 1.07);
      // Wear that is the same in every picture: cracks and moss follow the same noise wherever the block stands.
      if (spec.cracks) c = crackShade(c, cracksOf(s, 'base'), x, y);
      // What a picture adds, away from the edge.
      const m = inner(x, y);
      if (v === 2 || v === 3) c = crackShade(c, cracksOf(s, v === 2 ? 'v2' : 'v3'), x, y);
      if (free && v > 0 && m > 0) {
        if (v === 1 || v === 3) {
          // A water stain running down from the joint above.
          const sx = lo + bw * (0.3 + 0.4 * extra);
          const fall = (ry - mortarW) / H;
          const wide = 2.2 + 2 * extra;
          const d = Math.abs(x - sx + (vn(x, y, 8, s + 23) - 0.5) * 2.4);
          if (d < wide) c = mix(c, shade(c, 0.8), m * (1 - fall * 0.7) * (1 - d / wide) * 0.9);
        }
      }
    }
    // Moss grows in the joints and over the lower bricks (the same in every picture).
    if (spec.moss) {
      const mc = spec.mossColor ?? [84, 118, 54];
      const patch = smooth(1 - spec.moss, 1 - spec.moss + 0.14, fbm(x, y, s + 30, [16, 8, 4]) * 0.82 + (mortar ? 0.14 : 0) + (vn(x, y, 4, s + 31) - 0.5) * 0.2);
      if (patch > 0) c = mix(c, shade(mc, 0.78 + h2(x, y, s + 32) * 0.4 + (vn(x, y, 8, s + 33) - 0.5) * 0.25), patch * 0.88);
    }
    return c;
  };
}

const px = (c: RGB): HeroPixel => {
  const d = clampc(c);
  return [d[0], d[1], d[2], 255];
};

function variants(tile: string, spec: BrickSpec, count = 4): { key: string; tile: string; paint: HeroPainter }[] {
  const paint = brickPainter(spec);
  return Array.from({ length: count }, (_, v) => ({ key: `${tile}_${v}`, tile, paint: (x: number, y: number): HeroPixel => px(paint(x, y, v)) }));
}

const bt = (name: string): { base: RGB; acc: RGB } => {
  const t = beyondTiles()[name];
  return { base: t.rgb as RGB, acc: (t.accent ?? t.rgb) as RGB };
};
const tonesOf = (c: RGB): RGB[] => scale(c, [1.14, 1.04, 0.94, 0.82]);

const out: { key: string; tile: string; paint: HeroPainter }[] = [];
const add = (tile: string, spec: BrickSpec, count = 4): void => {
  out.push(...variants(tile, spec, count));
};

const GREY = tonesOf([126, 126, 128]);
add('stone_bricks', { tones: GREY, mortar: [88, 88, 92], seed: 11000, course: 16, per: 3 });
add('mossy_stone_bricks', { tones: scale([118, 122, 108], [1.14, 1.04, 0.94, 0.82]), mortar: [76, 82, 66], seed: 11100, course: 16, per: 3, moss: 0.46 });
add('cracked_stone_bricks', { tones: GREY, mortar: [84, 84, 88], seed: 11200, course: 16, per: 3, cracks: true });
add('deepslate_bricks', { tones: scale([74, 74, 80], [1.2, 1.06, 0.94, 0.8]), mortar: [38, 38, 44], seed: 11300, course: 16, per: 3, gloss: true });
add('cracked_deepslate_bricks', { tones: scale([72, 72, 78], [1.2, 1.06, 0.94, 0.8]), mortar: [36, 36, 42], seed: 11400, course: 16, per: 3, cracks: true });
add('deepslate_tiles', { tones: scale([58, 58, 64], [1.22, 1.08, 0.94, 0.78]), mortar: [28, 28, 34], seed: 11500, course: 16, per: 4, gloss: true, spread: 0.8 });
add('tuff_bricks', { tones: scale([134, 128, 106], [1.14, 1.04, 0.94, 0.82]), mortar: [94, 90, 74], seed: 11600, course: 16, per: 3 });
add('bricks', { tones: [[186, 112, 92], [168, 98, 80], [150, 84, 68], [128, 68, 56]], mortar: [168, 158, 146], seed: 11700, course: 8, per: 4, spread: 1.15 });
add('nether_bricks', { tones: [[104, 48, 54], [88, 38, 44], [72, 28, 34], [52, 18, 24]], mortar: [32, 10, 14], seed: 11800, course: 8, per: 4, grain: 0.7 });
add('red_nether_bricks', { tones: [[132, 28, 34], [112, 20, 26], [92, 12, 18], [68, 6, 12]], mortar: [40, 6, 10], seed: 11900, course: 8, per: 4, grain: 0.7 });
add('mud_bricks', { tones: [[170, 134, 100], [154, 120, 88], [138, 106, 78], [116, 88, 62]], mortar: [110, 84, 60], seed: 12000, course: 16, per: 3, spread: 0.8, grain: 0.6 });

const ancient = bt('ancient_bricks');
const mossyAncient = bt('mossy_ancient_bricks');
const crackedAncient = bt('cracked_ancient_bricks');
add('ancient_bricks', { tones: tonesOf(ancient.base), mortar: ancient.acc, seed: 12100, course: 16, per: 3 });
add('mossy_ancient_bricks', { tones: tonesOf(mossyAncient.base), mortar: mossyAncient.acc, seed: 12200, course: 16, per: 3, moss: 0.4, mossColor: [70, 120, 60] });
add('cracked_ancient_bricks', { tones: tonesOf(crackedAncient.base), mortar: crackedAncient.acc, seed: 12300, course: 16, per: 3, cracks: true });
const marble = bt('marble_bricks');
add('marble_bricks', { tones: [[232, 232, 238], [220, 220, 228], [206, 208, 220], [186, 190, 206]], mortar: shade(marble.acc, 1.02), seed: 12400, course: 16, per: 3, spread: 0.7, grain: 0.4, gloss: true });
const obs = bt('obsidian_bricks');
add('obsidian_bricks', { tones: [[48, 34, 72], [36, 24, 56], [26, 16, 42], [16, 8, 28]], mortar: shade(obs.acc, 0.8), seed: 12500, course: 16, per: 3, gloss: true, spread: 0.8 });
add('cinnabar_bricks', { tones: scale([158, 44, 40], [1.16, 1.04, 0.92, 0.78]), mortar: [96, 24, 24], seed: 12600, course: 16, per: 3 });
add('sulfur_bricks', { tones: scale([196, 180, 54], [1.12, 1.02, 0.92, 0.8]), mortar: [136, 120, 30], seed: 12700, course: 16, per: 3 });
add('resin_bricks', { tones: scale([204, 118, 44], [1.16, 1.04, 0.92, 0.78]), mortar: [140, 72, 22], seed: 12800, course: 8, per: 4, gloss: true });

export const BRICK_PICS = out;
