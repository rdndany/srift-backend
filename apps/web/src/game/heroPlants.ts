/**
 * The plants that stand on the ground, hand-painted at 64 x 64: tall grass and ferns, the flowers, mushrooms, sugar cane, the dead
 * bush, the sweet berry bush and the saplings.
 *
 * A plant is not a texture to wrap: it is a little drawing on a see-through tile (the terrain draws it on two crossed planes). So
 * each is built from strokes (a blade, a stem, a petal) and blobs (a cap, a bloom, a leaf), shaded from the upper left, with a
 * light rim on the lit side and a dark one on the other, the way the painted blocks are. Several of them come in a few variants,
 * and the terrain shows a different one in every block, so a meadow is never one flower copied over and over.
 *
 * Nothing here wraps and nothing runs on into the next block, except sugar cane, whose stalks meet the top and the bottom of the
 * tile at the same places so a column of it is one plant.
 */
import { ramp, shade, type HeroPainter, type HeroPixel, type RGB } from './heroKit';

const N = 64;
const TAU = Math.PI * 2;
type Pt = [number, number];
/** A shader gets where it is along a stroke (0 base .. 1 tip) and across it (-1 .. 1, left of the way to right), and the pixel. Null leaves the pixel out. */
type Shader = (u: number, v: number, x: number, y: number) => RGB | null;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (v: number, lo = 0, hi = 1): number => (v < lo ? lo : v > hi ? hi : v);
function rng(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The picture being drawn: colour and see-through, 64 x 64. */
class Sheet {
  readonly c = new Float32Array(N * N * 3);
  readonly a = new Uint8Array(N * N);
  /** Whether what is drawn now takes the biome's tint (grass and ferns). */
  tint = false;
  put(px: number, py: number, col: RGB): void {
    const x = Math.floor(px);
    const y = Math.floor(py);
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const i = y * N + x;
    this.c[i * 3] = col[0];
    this.c[i * 3 + 1] = col[1];
    this.c[i * 3 + 2] = col[2];
    this.a[i] = this.tint ? 250 : 255;
  }
  erase(px: number, py: number): void {
    const x = Math.floor(px);
    const y = Math.floor(py);
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    this.a[y * N + x] = 0;
  }
  solid(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < N && y < N && this.a[y * N + x] !== 0;
  }
  /** The last touch: a light rim where the plant meets the light (upper left), a dark one where it turns away, and a quiet outline. */
  finish(): void {
    const keep = this.c.slice();
    const was = this.a.slice();
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        if (!was[i]) continue;
        const edge = (dx: number, dy: number): boolean => {
          const nx = x + dx;
          const ny = y + dy;
          return nx < 0 || ny < 0 || nx >= N || ny >= N ? false : !was[ny * N + nx];
        };
        let k = 1;
        if (edge(0, 1) || edge(1, 0)) k = 0.76;
        else if (edge(-1, 0) || edge(0, -1)) k = 0.92;
        // (the foot of a plant sits in the ground: no rim along the bottom edge of the tile)
        if (y === N - 1) k = 1;
        this.c[i * 3] = keep[i * 3] * k;
        this.c[i * 3 + 1] = keep[i * 3 + 1] * k;
        this.c[i * 3 + 2] = keep[i * 3 + 2] * k;
      }
    }
  }
}

// ---------------------------------------------------------------- drawing

function bez(p: Pt[], t: number): Pt {
  if (p.length === 3) {
    const m = 1 - t;
    return [m * m * p[0][0] + 2 * m * t * p[1][0] + t * t * p[2][0], m * m * p[0][1] + 2 * m * t * p[1][1] + t * t * p[2][1]];
  }
  const m = 1 - t;
  const a = m * m * m;
  const b = 3 * m * m * t;
  const c = 3 * m * t * t;
  const d = t * t * t;
  return [a * p[0][0] + b * p[1][0] + c * p[2][0] + d * p[3][0], a * p[0][1] + b * p[1][1] + c * p[2][1] + d * p[3][1]];
}

/** A tapering curve: from `w0` wide at the first point to `w1` at the last, through 3 (quadratic) or 4 (cubic) points. */
function stroke(s: Sheet, pts: Pt[], w0: number, w1: number, sh: Shader, round = false): void {
  let len = 0;
  let prev = pts[0];
  for (let i = 1; i <= 16; i++) {
    const q = bez(pts, i / 16);
    len += Math.hypot(q[0] - prev[0], q[1] - prev[1]);
    prev = q;
  }
  const steps = Math.max(4, Math.ceil(len * 3));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = bez(pts, t);
    const q = bez(pts, Math.min(1, t + 0.01));
    const o = bez(pts, Math.max(0, t - 0.01));
    let tx = q[0] - o[0];
    let ty = q[1] - o[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    // A round end: the width closes up like a circle in the last stretch.
    let w = lerp(w0, w1, t);
    if (round && t > 0.85) w *= Math.sqrt(Math.max(0, 1 - ((t - 0.85) / 0.15) ** 2 * 0.98));
    const hw = w / 2;
    const across = Math.max(1, Math.ceil(hw * 2.4));
    for (let j = 0; j <= across; j++) {
      const v = hw > 0 ? (j / across) * 2 - 1 : 0;
      const px = p[0] - ty * v * hw;
      const py = p[1] + tx * v * hw;
      const col = sh(t, v, px, py);
      if (col) s.put(px, py, col);
    }
  }
}

/** A filled ellipse (rotated by `rot`); the shader gets the position in its own frame, -1..1 across and along. */
function blob(s: Sheet, cx: number, cy: number, rx: number, ry: number, rot: number, sh: Shader): void {
  const r = Math.max(rx, ry) + 1.5;
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const lx = (dx * cs + dy * sn) / rx;
      const ly = (-dx * sn + dy * cs) / ry;
      if (lx * lx + ly * ly > 1) continue;
      const col = sh((ly + 1) / 2, lx, x, y);
      if (col) s.put(x, y, col);
    }
  }
}

const mixc = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Light from the upper left on a ball: 0 (shaded) .. 1 (lit). */
function ball(cx: number, cy: number, r: number): (x: number, y: number) => number {
  return (x, y) => {
    const dx = (x + 0.5 - cx) / r;
    const dy = (y + 0.5 - cy) / r;
    const nz = Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy));
    return clamp(0.5 + (-dx * 0.5 - dy * 0.55 + nz * 0.45) * 0.62);
  };
}

/** A round body (a berry, a head, a cap) shaded as a ball in the colours of the ramp. */
function sphere(s: Sheet, cx: number, cy: number, r: number, tones: readonly RGB[], spec = true): void {
  const lit = ball(cx, cy, r);
  blob(s, cx, cy, r, r, 0, (_u, _v, x, y) => {
    const l = lit(x, y);
    const c = ramp(tones, l);
    if (spec && l > 0.9) return shade(c, 1.12);
    return c;
  });
}

// ---------------------------------------------------------------- the greens

const LEAF: RGB[] = [[28, 88, 28], [48, 126, 36], [78, 168, 48], [120, 208, 64], [172, 238, 100]];
const LEAF_BLUE: RGB[] = [[22, 66, 44], [34, 94, 56], [52, 128, 70], [86, 168, 92], [136, 210, 130]];
const STEM: RGB[] = [[28, 82, 28], [44, 116, 36], [76, 158, 48], [128, 200, 76]];

/** A blade or a leaf: dark at the foot, bright towards the tip, lit on its left side, with a light rib down the middle. */
const bladeShader =
  (tones: readonly RGB[], rib = 0.18, base = 0.05, top = 0.95): Shader =>
  (u, v) => {
    let t = lerp(base, top, u) - v * 0.14;
    if (Math.abs(v + 0.1) < rib * 0.5 && u > 0.1) t += 0.1;
    if (v > 0.55) t -= 0.12;
    return ramp(tones, clamp(t));
  };

/** A thin stem, lit on its left. */
const stemShader = (tones: readonly RGB[] = STEM): Shader => (u, v) => ramp(tones, clamp(0.5 - v * 0.42 + u * 0.12));

function leafAt(s: Sheet, x: number, y: number, angle: number, len: number, wid: number, tones: readonly RGB[], bend = 0.25, serrate = false): void {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const tip: Pt = [x + dx * len, y + dy * len];
  const mid: Pt = [x + dx * len * 0.55 - dy * len * bend * (dx < 0 ? -1 : 1), y + dy * len * 0.55 + dx * len * bend * (dx < 0 ? -1 : 1) - len * 0.12];
  const base = bladeShader(tones);
  const sh: Shader = serrate
    ? (u, v, px, py) => (Math.abs(v) > 0.55 && (Math.floor(u * 7) + (v > 0 ? 1 : 0)) % 2 === 0 && u > 0.2 && u < 0.92 ? null : base(u, v, px, py))
    : base;
  stroke(s, [[x, y], mid, tip], wid, 0, sh);
}

// ---------------------------------------------------------------- tall grass and ferns

function tuft(s: Sheet, variant: number, tones: readonly RGB[]): void {
  const r = rng(1000 + variant * 31);
  s.tint = true;
  const count = 15 + variant;
  const blades: { x: number; h: number; lean: number; w: number; bend: number }[] = [];
  for (let i = 0; i < count; i++) {
    const x = 32 + (r() + r() + r() - 1.5) * 24;
    const mid = 1 - Math.abs(x - 32) / 34;
    blades.push({ x, h: 20 + mid * 28 + r() * 14, lean: (x - 32) * 0.34 + (r() - 0.5) * 10, w: 3 + r() * 2.2, bend: (r() - 0.5) * 14 });
  }
  // The far, dark blades first, the near, bright ones over them.
  blades.sort((a, b) => b.h - a.h || a.x - b.x);
  blades.forEach((b, i) => {
    const depth = i / blades.length;
    const sh = bladeShader(tones, 0.2, 0.02 + depth * 0.08, 0.7 + depth * 0.3);
    const tip: Pt = [b.x + b.lean + b.bend * 0.6, 63 - b.h];
    stroke(s, [[b.x, 64], [b.x + b.lean * 0.3, 63 - b.h * 0.55], tip], b.w, 0, sh);
  });
  s.tint = false;
}

function frond(s: Sheet, x: number, y: number, angle: number, len: number, droop: number, tones: readonly RGB[], dark: number): void {
  const tip: Pt = [x + Math.sin(angle) * len, y - Math.cos(angle) * len + droop];
  const ctrl: Pt = [x + Math.sin(angle) * len * 0.45, y - Math.cos(angle) * len * 0.95];
  const path: Pt[] = [[x, y], ctrl, tip];
  const k = 0.6 + dark * 0.4;
  stroke(s, path, 2.2, 1, (u, v) => shade(ramp(tones, 0.25 + u * 0.2 - v * 0.1), k));
  // The leaflets: pairs along the frond, long near the middle and short towards the tip.
  const pairs = Math.max(6, Math.round(len / 3.2));
  for (let i = 2; i < pairs; i++) {
    const t = i / pairs;
    const p = bez(path, t);
    const q = bez(path, Math.min(1, t + 0.04));
    const a = Math.atan2(q[1] - p[1], q[0] - p[0]);
    const size = (len * 0.3 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.05))) + 2.2;
    for (const side of [-1, 1]) {
      const ang = a + side * (1.05 - t * 0.35);
      const tipx = p[0] + Math.cos(ang) * size;
      const tipy = p[1] + Math.sin(ang) * size + size * 0.18;
      stroke(
        s,
        [p, [lerp(p[0], tipx, 0.5), lerp(p[1], tipy, 0.5) - size * 0.1], [tipx, tipy]],
        2.6 - t * 0.9,
        0,
        (u, v) => shade(ramp(tones, clamp(0.3 + u * 0.55 + t * 0.15 - (side === -1 ? 0.12 : 0) - v * 0.08)), k),
      );
    }
  }
}

function fern(s: Sheet, variant: number): void {
  const r = rng(2000 + variant * 17);
  s.tint = true;
  const fronds = [-78, -58, -38, -18, 4, 22, 42, 62, 80].map((d) => d + (r() - 0.5) * 8);
  const order = fronds.map((a, i) => ({ a, i })).sort((p, q) => Math.abs(q.a) - Math.abs(p.a));
  order.forEach(({ a }, n) => {
    const side = Math.abs(a) / 80;
    const len = 30 + (1 - side) * 14 + r() * 6;
    frond(s, 32 + (r() - 0.5) * 4, 64, (a * Math.PI) / 180, len, 4 + side * 12, LEAF, n / order.length);
  });
  s.tint = false;
}

// ---------------------------------------------------------------- flowers

/** The stalk of a flower, from the ground up to `head`, bending out as it climbs; the leaves go along it. Returns the path. */
function stalk(s: Sheet, headX: number, headY: number, w = 2.6, foot = 32): Pt[] {
  const path: Pt[] = [[foot, 64], [lerp(foot, headX, 0.15) + (headX - foot) * 0.1, lerp(64, headY, 0.55)], [headX, headY]];
  stroke(s, path, w, w * 0.8, stemShader());
  return path;
}

/** A pair of slim leaves low on the stalk, and a thorn or two when asked. */
function basalLeaves(s: Sheet, x: number, count: number, len: number, wid: number, tones: readonly RGB[] = LEAF, spread = 1): void {
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const ang = side < 0 ? Math.PI + 0.55 + (i >> 1) * 0.35 * spread : -0.55 - (i >> 1) * 0.35 * spread;
    leafAt(s, x, 63 - (i >> 1) * 4, ang, len - (i >> 1) * 3, wid, tones, 0.3);
  }
}

const GOLD: RGB[] = [[200, 130, 10], [244, 180, 18], [255, 212, 34], [255, 236, 78], [255, 250, 160]];

/** A head of ray petals round a middle: the dandelion, the daisy. */
function rayHead(s: Sheet, cx: number, cy: number, rings: { n: number; len: number; w: number; tones: readonly RGB[]; turn: number }[], centre: RGB[], centreR: number): void {
  for (const ring of rings) {
    for (let i = 0; i < ring.n; i++) {
      const a = (i / ring.n) * TAU + ring.turn;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // Petals lit on the upper left side of the head.
      const lit = clamp(0.5 - ca * 0.28 - sa * 0.32);
      const tip: Pt = [cx + ca * ring.len, cy + sa * ring.len * 0.92];
      stroke(s, [[cx + ca * centreR * 0.5, cy + sa * centreR * 0.5], [cx + ca * ring.len * 0.6, cy + sa * ring.len * 0.55], tip], ring.w, ring.w * 0.6, (u, v) => ramp(ring.tones, clamp(0.2 + lit * 0.6 + u * 0.22 - Math.abs(v) * 0.12)), true);
    }
  }
  sphere(s, cx, cy, centreR, centre, false);
}

function dandelion(s: Sheet, variant: number): void {
  const r = rng(3000 + variant * 13);
  const lean = (variant - 1) * 5 + (r() - 0.5) * 3;
  // The rosette of toothed leaves.
  for (let i = 0; i < 6; i++) {
    const a = [-2.55, -2.15, -1.8, -1.34, -0.99, -0.59][i];
    leafAt(s, 32, 64, a, 20 + (i % 2) * 5, 6.2, LEAF, 0.18, true);
  }
  const hx = 32 + lean;
  stalk(s, hx, 24, 2.6, 32);
  // A bud on a short stalk, and the open head over it.
  const bx = 32 - lean * 1.4 - 9;
  stroke(s, [[32, 62], [bx + 2, 52], [bx, 40]], 2, 1.6, stemShader());
  blob(s, bx, 37, 3.4, 4.6, 0.15, (u, v) => ramp(LEAF, clamp(0.35 + (1 - u) * 0.15 - v * 0.2)));
  blob(s, bx - 0.4, 34, 2.2, 2.4, 0, () => [255, 210, 50]);
  rayHead(
    s,
    hx,
    22,
    [
      { n: 18, len: 11.5, w: 2.4, tones: GOLD, turn: 0.1 },
      { n: 14, len: 8.5, w: 2.4, tones: GOLD.map((c) => shade(c, 1.06)), turn: 0.3 },
      { n: 9, len: 5.4, w: 2.2, tones: GOLD.map((c) => shade(c, 1.1)), turn: 0 },
    ],
    [[230, 150, 10], [255, 196, 30], [255, 236, 100]],
    2.6,
  );
}

const PETAL_RED: RGB[] = [[96, 6, 22], [150, 12, 30], [204, 28, 44], [240, 64, 70], [255, 130, 120]];

function rose(s: Sheet, variant: number): void {
  const r = rng(3100 + variant * 7);
  const lean = (variant - 1) * 4;
  const hx = 32 + lean;
  stalk(s, hx, 27, 2.8, 32);
  // Thorns.
  for (const [ty, side] of [[46, 1], [38, -1], [54, -1]] as const) {
    const tx = lerp(32, hx, (64 - ty) / 37) + side * 1.6;
    stroke(s, [[tx, ty + 1.5], [tx + side * 1.6, ty], [tx + side * 3, ty - 1.4]], 2.2, 0, () => [190, 170, 120]);
  }
  // Leaves of three leaflets.
  for (const [ly, side] of [[52, -1], [43, 1]] as const) {
    const lx = lerp(32, hx, (64 - ly) / 37);
    for (const k of [-0.55, 0, 0.55]) {
      const ang = side < 0 ? Math.PI + 0.05 + k * 0.9 : -0.05 - k * 0.9;
      leafAt(s, lx, ly, ang, 11 - Math.abs(k) * 3, 5.4, LEAF, 0.15, true);
    }
  }
  // The bloom: outer petals round, then ever smaller ones wrapped inside.
  const cx = hx;
  const cy = 22;
  const sepal = (a: number): void => leafAt(s, cx, cy + 6, a, 10, 3.2, LEAF_BLUE, 0.2);
  sepal(Math.PI * 0.85);
  sepal(Math.PI * 0.15);
  const layers: { n: number; d: number; rx: number; ry: number; k: number }[] = [
    { n: 5, d: 6.2, rx: 6.2, ry: 6.2, k: 0.0 },
    { n: 4, d: 4.4, rx: 5.1, ry: 5.1, k: 0.3 },
    { n: 3, d: 2.6, rx: 3.9, ry: 4, k: 0.55 },
  ];
  const off = r() * TAU;
  for (const L of layers) {
    for (let i = 0; i < L.n; i++) {
      const a = (i / L.n) * TAU + off + L.k * 2;
      const px = cx + Math.cos(a) * L.d;
      const py = cy + Math.sin(a) * L.d * 0.9;
      const lit = ball(px, py, L.rx);
      blob(s, px, py, L.rx, L.ry, a, (_u, _v, x, y) => ramp(PETAL_RED, clamp(0.12 + L.k * 0.28 + lit(x, y) * 0.6)));
    }
  }
  // The heart: a dark swirl with a bright fold.
  blob(s, cx - 0.5, cy - 0.5, 3, 2.6, 0.5, () => [118, 8, 26]);
  blob(s, cx - 1.6, cy - 1.8, 2.2, 1.2, -0.4, () => [255, 120, 110]);
}

type Tulip = { dark: RGB; mid: RGB; light: RGB; edge: RGB };
const TULIPS: Record<string, Tulip> = {
  red: { dark: [120, 8, 20], mid: [214, 30, 38], light: [255, 96, 86], edge: [255, 150, 130] },
  orange: { dark: [166, 62, 6], mid: [244, 124, 18], light: [255, 178, 60], edge: [255, 220, 130] },
  white: { dark: [150, 150, 170], mid: [236, 236, 242], light: [255, 255, 255], edge: [255, 255, 255] },
  pink: { dark: [170, 40, 100], mid: [240, 112, 170], light: [255, 176, 214], edge: [255, 220, 236] },
};

function tulip(s: Sheet, kind: string, variant: number): void {
  const T = TULIPS[kind];
  const lean = (variant - 0.5) * 6;
  const hx = 32 + lean;
  // Two long arching leaves, grey-green, with a lighter rib.
  leafAt(s, 31, 64, Math.PI + 0.62, 30, 8, LEAF_BLUE, 0.34);
  leafAt(s, 33, 64, -0.55, 28, 7.4, LEAF_BLUE, 0.3);
  stalk(s, hx, 31, 2.8, 32);
  const tones: RGB[] = [T.dark, mixc(T.dark, T.mid, 0.6), T.mid, T.light, T.edge];
  // The cup: two side petals leaning out and a broad front one, all pointed at the tip.
  const petal = (cx: number, cy: number, rx: number, ry: number, rot: number, base: number): void => {
    blob(s, cx, cy, rx, ry, rot, (u, v, x) => ramp(tones, clamp(base + (1 - u) * 0.2 - v * 0.2 + (x < hx ? 0.06 : -0.02))));
  };
  petal(hx - 4.2, 22, 4.6, 10.5, -0.28, 0.2);
  petal(hx + 4.2, 22, 4.6, 10.5, 0.28, 0.12);
  petal(hx, 20, 5.8, 12.4, 0, 0.42);
  // The pointed tips.
  for (const [dx, dy, rot, base] of [[-5.5, 11.5, -0.28, 0.5], [5.5, 11.5, 0.28, 0.4], [0, 8, 0, 0.7]] as const) {
    stroke(s, [[hx + dx * 0.55, 15 + dy * 0.2], [hx + dx * 0.8, 12 + dy * 0.1], [hx + dx, 9.6 + dy * 0.1 + (dy > 9 ? 1.5 : 0)]], 3.8, 0, (u) => ramp(tones, clamp(base + u * 0.3)));
    void rot;
  }
  // The fold between the front petal and the sides.
  stroke(s, [[hx - 2.6, 28], [hx - 2.2, 20], [hx - 1.2, 11]], 1.1, 0.4, () => shade(T.dark, 1.1));
  stroke(s, [[hx + 2.6, 28], [hx + 2.2, 20], [hx + 1.2, 11]], 1.1, 0.4, () => shade(T.dark, 1.1));
  // The calyx where the cup meets the stalk.
  blob(s, hx, 31.5, 3, 1.9, 0, () => ramp(LEAF, 0.45));
}

function daisy(s: Sheet, variant: number): void {
  const lean = (variant - 0.5) * 6;
  const hx = 32 + lean;
  leafAt(s, 31, 64, Math.PI + 0.7, 18, 3.6, LEAF, 0.25, true);
  leafAt(s, 33, 64, -0.7, 17, 3.4, LEAF, 0.25, true);
  stalk(s, hx, 24, 2.4, 32);
  const WHITE: RGB[] = [[170, 186, 210], [214, 224, 240], [244, 248, 255], [255, 255, 255]];
  rayHead(
    s,
    hx,
    21,
    [
      { n: 15, len: 13, w: 4.2, tones: WHITE.map((c) => shade(c, 0.94)), turn: 0.1 },
      { n: 13, len: 11.4, w: 4.2, tones: WHITE, turn: 0.35 },
    ],
    [[200, 120, 8], [248, 176, 18], [255, 224, 70]],
    4.4,
  );
  // Pollen on the middle.
  for (const [dx, dy] of [[-1.5, -1], [1, 0.5], [-0.5, 1.5], [1.6, -1.4]]) s.put(hx + dx, 21 + dy, [255, 238, 130]);
}

function cornflower(s: Sheet, variant: number): void {
  const lean = (variant - 0.5) * 7;
  const hx = 32 + lean;
  stroke(s, [[30, 64], [26, 52], [16, 46]], 2, 0.2, bladeShader(LEAF_BLUE));
  stroke(s, [[34, 64], [38, 50], [47, 44]], 2, 0.2, bladeShader(LEAF_BLUE));
  stalk(s, hx, 26, 2.2, 32);
  // Side leaves along the stalk, narrow and grey-green.
  leafAt(s, lerp(32, hx, 0.3), 50, Math.PI + 0.5, 9, 2.2, LEAF_BLUE, 0.1);
  leafAt(s, lerp(32, hx, 0.5), 41, -0.5, 8, 2.2, LEAF_BLUE, 0.1);
  const BLUE: RGB[] = [[26, 40, 160], [44, 78, 214], [86, 130, 250], [150, 190, 255]];
  // A ring of ruffled petals, each with a notched end.
  const cx = hx;
  const cy = 21;
  const petals = 11;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * TAU + 0.2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const lit = clamp(0.55 - ca * 0.2 - sa * 0.25);
    for (const f of [-0.2, 0, 0.2]) {
      const aa = a + f;
      const len = 11.5 - Math.abs(f) * 4;
      stroke(
        s,
        [[cx + ca * 2, cy + sa * 2], [cx + Math.cos(aa) * len * 0.55, cy + Math.sin(aa) * len * 0.5], [cx + Math.cos(aa) * len, cy + Math.sin(aa) * len * 0.9]],
        2.4,
        1.2,
        (u) => ramp(BLUE, clamp(0.05 + lit * 0.55 + u * 0.3)),
        true,
      );
    }
  }
  // The middle: a tuft of dark purple florets.
  blob(s, cx, cy, 4, 3.8, 0, (_u, _v, x, y) => (((x * 7 + y * 13) & 3) === 0 ? [186, 120, 230] : [92, 44, 150]));
  for (const [dx, dy] of [[-1.5, -1.5], [1.2, -1], [0, 1.2]]) s.put(cx + dx, cy + dy, [222, 170, 255]);
}

function allium(s: Sheet, variant: number): void {
  const r = rng(3400 + variant);
  // Two broad strap leaves at the foot.
  leafAt(s, 30, 64, Math.PI + 0.52, 26, 8.4, LEAF_BLUE, 0.32);
  leafAt(s, 34, 64, -0.5, 24, 8, LEAF_BLUE, 0.3);
  const hx = 32 + (variant - 0.5) * 3;
  stroke(s, [[32, 64], [32 + (hx - 32) * 0.4, 44], [hx, 25]], 3, 2.4, stemShader());
  const cx = hx;
  const cy = 19;
  const R = 14;
  // The globe of star florets, spread over a sphere and drawn back to front.
  const pts: { x: number; y: number; z: number }[] = [];
  const total = 70;
  for (let i = 0; i < total; i++) {
    const zz = 1 - (i + 0.5) * (2 / total);
    const rr = Math.sqrt(1 - zz * zz);
    const ph = i * 2.399963 + r() * 0.2;
    pts.push({ x: Math.cos(ph) * rr, y: Math.sin(ph) * rr, z: zz });
  }
  pts.sort((a, b) => a.z - b.z);
  const PURPLE: RGB[] = [[70, 26, 120], [122, 50, 180], [172, 96, 224], [214, 160, 255], [244, 214, 255]];
  // The stalks of the florets, a pale green hub first.
  blob(s, cx, cy, R * 0.7, R * 0.7, 0, () => [96, 50, 150]);
  for (const p of pts) {
    const px = cx + p.x * R;
    const py = cy + p.y * R * 0.95;
    const lit = clamp(0.5 - p.x * 0.28 - p.y * 0.3 + p.z * 0.3);
    const c = ramp(PURPLE, lit);
    s.put(px, py, c);
    s.put(px + 1, py, shade(c, 0.9));
    s.put(px - 1, py, shade(c, 1.08));
    s.put(px, py + 1, shade(c, 0.86));
    s.put(px, py - 1, shade(c, 1.1));
    if (p.z > 0.1) s.put(px, py, shade(c, 1.2));
  }
}

function bluet(s: Sheet, variant: number): void {
  const r = rng(3500 + variant * 5);
  const heads: Pt[] = [[22, 36], [34, 24], [45, 40], [29, 47]];
  if (variant === 1) heads.push([41, 30]);
  for (const [hx, hy] of heads) stroke(s, [[32 + (hx - 32) * 0.1, 64], [32 + (hx - 32) * 0.55, lerp(64, hy, 0.6)], [hx, hy]], 1.8, 1.4, stemShader());
  leafAt(s, 31, 64, Math.PI + 0.7, 14, 3, LEAF, 0.2);
  leafAt(s, 33, 64, -0.7, 14, 3, LEAF, 0.2);
  leafAt(s, 30, 58, Math.PI + 0.25, 10, 2.4, LEAF, 0.2);
  const PET: RGB[] = [[120, 130, 190], [184, 196, 236], [226, 234, 252], [255, 255, 255]];
  for (const [hx, hy] of heads) {
    const turn = r() * TAU;
    for (let i = 0; i < 4; i++) {
      const a = turn + (i * TAU) / 4;
      const px = hx + Math.cos(a) * 3.6;
      const py = hy + Math.sin(a) * 3.4;
      const lit = ball(px, py, 3.4);
      blob(s, px, py, 3.5, 3.5, 0, (_u, _v, x, y) => ramp(PET, clamp(0.2 + lit(x, y) * 0.8)));
    }
    sphere(s, hx, hy, 2, [[210, 140, 10], [255, 210, 40], [255, 244, 140]], false);
  }
}

function orchid(s: Sheet, variant: number): void {
  const lean = (variant - 0.5) * 5;
  // Glossy broad leaves.
  leafAt(s, 30, 64, Math.PI + 0.5, 24, 9.2, LEAF, 0.3);
  leafAt(s, 34, 64, -0.45, 22, 8.4, LEAF, 0.28);
  const hx = 32 + lean;
  stalk(s, hx, 29, 2.6, 32);
  const SKY: RGB[] = [[20, 90, 170], [30, 146, 220], [70, 190, 244], [150, 226, 255], [214, 248, 255]];
  const petal = (cx: number, cy: number, rx: number, ry: number, rot: number, base: number): void => {
    blob(s, cx, cy, rx, ry, rot, (u, v) => ramp(SKY, clamp(base + (1 - u) * 0.25 - v * 0.12)));
  };
  const cx = hx;
  const cy = 21;
  // Lower sepals sweep down and out, upper petals up and out, the lip hangs in the middle.
  petal(cx - 7.5, cy + 4.5, 3.8, 8.6, 0.95, 0.3);
  petal(cx + 7.5, cy + 4.5, 3.8, 8.6, -0.95, 0.2);
  petal(cx - 6.2, cy - 5, 4.4, 8.4, -0.82, 0.55);
  petal(cx + 6.2, cy - 5, 4.4, 8.4, 0.82, 0.45);
  petal(cx, cy - 8, 3.6, 8.2, 0, 0.62);
  petal(cx, cy + 5, 5.2, 7.2, 0, 0.14);
  // The lip is darker, with speckles, and a pale throat.
  for (const [dx, dy] of [[-2.4, 6], [2, 8], [-0.5, 9.6], [1.4, 4.2], [-3.2, 8.4]]) blob(s, cx + dx, cy + dy, 0.9, 0.9, 0, () => [10, 52, 130]);
  blob(s, cx, cy - 0.5, 3, 3.4, 0, (_u, _v, x, y) => ramp([[236, 250, 255], [255, 255, 240], [255, 232, 130]], clamp(0.5 - (x - cx) * 0.05 - (y - cy) * 0.1)));
  blob(s, cx - 0.6, cy - 1.2, 1.3, 1.5, 0, () => [255, 255, 255]);
}

// ---------------------------------------------------------------- mushrooms

function stemMushroom(s: Sheet, x: number, top: number, wTop: number, wBot: number, tones: readonly RGB[]): void {
  stroke(s, [[x, 64], [x - 0.5, lerp(64, top, 0.5)], [x, top]], wBot, wTop, (u, v) => ramp(tones, clamp(0.62 - v * 0.4 + (u < 0.1 ? -0.3 : 0))));
}

function cap(s: Sheet, cx: number, cy: number, rx: number, ry: number, tones: readonly RGB[], gill: RGB[]): void {
  const lit = ball(cx - rx * 0.1, cy + ry * 0.2, Math.max(rx, ry) * 1.1);
  // The gills first, under the rim.
  blob(s, cx, cy + 0.6, rx * 0.96, ry * 0.32, 0, (u, v) => ramp(gill, clamp(0.35 + (((Math.floor((v + 1) * 6)) & 1) ? 0.14 : 0) - u * 0.1)));
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy); y++) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy > 1 || y + 0.5 > cy) continue;
      // A domed top lit from the upper left, and a darker rim just above the gills.
      let t = lit(x, y);
      if (y + 0.5 > cy - 1.6) t -= 0.18;
      s.put(x, y, ramp(tones, clamp(t * 1.05)));
    }
  }
}

function mushroom(s: Sheet, kind: 'red' | 'brown', variant: number): void {
  const r = rng(kind === 'red' ? 4000 + variant : 4100 + variant);
  const RED: RGB[] = [[98, 8, 14], [160, 16, 24], [214, 36, 40], [244, 80, 70], [255, 150, 130]];
  const BROWN: RGB[] = [[78, 46, 22], [120, 76, 38], [162, 108, 56], [196, 144, 84], [224, 182, 124]];
  const CREAM: RGB[] = [[150, 130, 100], [200, 184, 150], [238, 226, 196], [255, 248, 226]];
  const GILL: RGB[] = [[120, 86, 60], [196, 160, 120], [226, 196, 150]];
  const tones = kind === 'red' ? RED : BROWN;
  const set =
    variant === 0
      ? [{ x: 24, top: 36, rx: 15, ry: 15 }, { x: 44, top: 46, rx: 9, ry: 9.5 }, { x: 36, top: 54, rx: 5.4, ry: 5 }]
      : [{ x: 40, top: 34, rx: 14, ry: 14 }, { x: 20, top: 47, rx: 9.6, ry: 9 }, { x: 28, top: 55, rx: 5, ry: 4.6 }];
  // Moss at the foot, so they sit in the ground and not on it.
  for (let i = 0; i < 9; i++) blob(s, 8 + i * 6.5 + r() * 3, 62.5, 4, 2.4, 0, () => ramp(LEAF, 0.12 + r() * 0.3));
  // Small ones first, the big one last.
  for (const m of [...set].reverse()) {
    stemMushroom(s, m.x, m.top, m.rx * 0.5, m.rx * 0.62, CREAM);
    cap(s, m.x, m.top + 1, m.rx, m.ry, tones, GILL);
    if (kind === 'red') {
      // White spots, bigger in the middle of the cap.
      const spots = Math.round(m.rx / 3.2);
      for (let i = 0; i < spots; i++) {
        const a = r() * Math.PI;
        const d = r() * 0.72;
        const px = m.x + Math.cos(a + Math.PI) * m.rx * d;
        const py = m.top + 1 - Math.sin(a) * m.ry * d * 0.8 - 1;
        const sz = 1.4 + r() * 1.5;
        blob(s, px, py, sz * 1.15, sz * 0.85, 0, (_u, _v, x, y) => (x < px && y < py ? [255, 255, 250] : [238, 230, 222]));
      }
    } else {
      // Pale mottling and a rim highlight.
      for (let i = 0; i < 6; i++) s.put(m.x + (r() - 0.5) * m.rx * 1.4, m.top + 1 - r() * m.ry * 0.8, [214, 164, 100]);
    }
  }
}

// ---------------------------------------------------------------- sugar cane

function sugarCane(s: Sheet): void {
  const CANE: RGB[] = [[40, 100, 40], [70, 140, 56], [116, 188, 76], [170, 224, 112], [210, 244, 160]];
  // Three stalks, their joints half a step apart, every joint on a 16 pixel beat so a column of cane meets at the tile's edges.
  const stalks = [{ x: 14, w: 7, phase: 5 }, { x: 32, w: 8, phase: 12 }, { x: 50, w: 7, phase: 0 }];
  // The leaves first (behind the stalks): long and arching, from every joint.
  stalks.forEach((st, si) => {
    for (let k = 0; k < 4; k++) {
      const y = st.phase + k * 16 + 1;
      if (y < 12 || y > 56) continue;
      const side = (k + si) % 2 === 0 ? -1 : 1;
      const ang = side < 0 ? Math.PI + 0.55 : -0.55;
      leafAt(s, st.x + side * (st.w / 2 - 1), y, ang, 17 + ((k + si) % 3) * 3, 4.2, LEAF, 0.34);
    }
  });
  for (const st of stalks) {
    stroke(
      s,
      [[st.x, 63.99], [st.x, 32], [st.x, 0]],
      st.w,
      st.w,
      (_u, v, _x, y) => {
        const j = (y - st.phase + 64) % 16;
        // The joints: a dark groove with a light lip over it, and a slight swelling.
        let t = 0.62 - v * 0.5;
        if (j >= 14.2 || j < 0.6) t -= 0.36;
        else if (j >= 12.4) t += 0.0;
        else if (j >= 1.4 && j < 2.6) t += 0.16;
        // A fine vertical streak, lighter on the left.
        if (v < -0.3 && v > -0.55) t += 0.08;
        return ramp(CANE, clamp(t));
      },
    );
  }
}

// ---------------------------------------------------------------- dead bush

function dryBranch(s: Sheet, x: number, y: number, ang: number, len: number, w: number, depth: number, r: () => number): void {
  const BARK: RGB[] = [[56, 38, 24], [96, 68, 42], [140, 104, 66], [182, 146, 98]];
  const bend = (r() - 0.5) * 0.7;
  const mx = x + Math.sin(ang + bend * 0.5) * len * 0.5;
  const my = y - Math.cos(ang + bend * 0.5) * len * 0.5;
  const tx = x + Math.sin(ang + bend) * len;
  const ty = y - Math.cos(ang + bend) * len;
  stroke(s, [[x, y], [mx, my], [tx, ty]], w, Math.max(0.9, w * 0.62), (u, v) => ramp(BARK, clamp(0.55 - v * 0.4 + u * 0.1)));
  if (depth <= 0) {
    // A few curled dry leaves at the twig ends.
    if (r() > 0.35) blob(s, tx, ty, 1.7, 1.2, r() * 3, () => [150, 112, 56]);
    return;
  }
  const kids = depth > 2 ? 3 : 2;
  for (let i = 0; i < kids; i++) {
    const da = (i - (kids - 1) / 2) * 0.62 + (r() - 0.5) * 0.35;
    dryBranch(s, lerp(x, tx, 0.55 + i * 0.12), lerp(y, ty, 0.55 + i * 0.12), ang + bend + da, len * (0.62 + r() * 0.15), Math.max(1, w * 0.7), depth - 1, r);
  }
}

function deadBush(s: Sheet, variant: number): void {
  const r = rng(5000 + variant * 11);
  for (const a of [-0.78, -0.4, -0.08, 0.22, 0.5, 0.8]) dryBranch(s, 32 + a * 4, 64, a, 20 + r() * 8, 3.4, 3, r);
}

// ---------------------------------------------------------------- sweet berry bush

function leafy(s: Sheet, cx: number, cy: number, rx: number, ry: number, count: number, r: () => number, tones: readonly RGB[]): void {
  const leaves: { x: number; y: number; a: number; z: number }[] = [];
  for (let i = 0; i < count; i++) {
    const a = r() * TAU;
    const d = Math.sqrt(r());
    leaves.push({ x: cx + Math.cos(a) * rx * d, y: cy + Math.sin(a) * ry * d, a: r() * TAU, z: r() });
  }
  // Back to front: the leaves nearer the middle and top are lighter (the sun comes from the upper left).
  leaves.sort((p, q) => q.y - p.y);
  for (const l of leaves) {
    const lit = clamp(0.35 + (cy - l.y) / (ry * 2.2) + (cx - l.x) / (rx * 5) + (l.z - 0.5) * 0.4);
    leafAt(s, l.x, l.y, l.a, 6.5 + l.z * 3, 4.2, tones.map((c) => shade(c, 0.7 + lit * 0.5)) as RGB[], 0.2, true);
  }
}

function berryBush(s: Sheet, stage: number): void {
  const r = rng(6000 + stage * 3);
  if (stage === 0) {
    // A young shoot: a stem with two small pairs of leaves.
    stroke(s, [[32, 64], [32, 50], [33, 38]], 2.4, 1.6, stemShader());
    for (const [y, a] of [[56, 0.5], [48, 0.8], [40, 0.4]] as const) {
      leafAt(s, 32, y, Math.PI + a, 11, 6, LEAF, 0.2, true);
      leafAt(s, 32, y - 2, -a, 11, 6, LEAF, 0.2, true);
    }
    return;
  }
  const height = [0, 32, 44, 44][stage];
  const width = [0, 20, 26, 28][stage];
  // Woody canes first.
  const cane: RGB[] = [[56, 38, 22], [92, 64, 36], [130, 92, 54]];
  for (const a of [-0.7, -0.3, 0.1, 0.45, 0.8]) {
    stroke(s, [[32 + a * 5, 64], [32 + a * 14, 64 - height * 0.5], [32 + a * 24, 64 - height * 0.85]], 3, 1.6, (_u, v) => ramp(cane, clamp(0.5 - v * 0.4)));
  }
  // The leaf mass: low and wide at the sides, high in the middle.
  leafy(s, 32, 64 - height * 0.42, width, height * 0.5, 34 + stage * 6, r, LEAF);
  leafy(s, 32, 64 - height * 0.55, width * 0.7, height * 0.42, 22 + stage * 4, r, [[34, 100, 30], [58, 142, 40], [96, 184, 52], [150, 216, 84], [190, 236, 120]]);
  if (stage === 2) {
    // White blossoms with a pink blush.
    for (let i = 0; i < 7; i++) {
      const bx = 32 + (r() - 0.5) * width * 1.6;
      const by = 64 - height * (0.3 + r() * 0.6);
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * TAU + r();
        blob(s, bx + Math.cos(a) * 2, by + Math.sin(a) * 2, 1.9, 1.9, 0, () => [255, 244, 248]);
      }
      blob(s, bx, by, 1.2, 1.2, 0, () => [250, 190, 50]);
    }
  }
  if (stage === 3) {
    // Red berries in little clusters, with a light spot on each.
    const BERRY: RGB[] = [[70, 4, 18], [140, 10, 30], [200, 24, 44], [244, 70, 78], [255, 160, 150]];
    for (let i = 0; i < 11; i++) {
      const bx = 32 + (r() - 0.5) * width * 1.7;
      const by = 64 - height * (0.22 + r() * 0.65);
      sphere(s, bx, by, 2.9, BERRY);
      if (i % 2 === 0) sphere(s, bx + 3.2, by + 2.4, 2.4, BERRY);
    }
  }
}

// ---------------------------------------------------------------- saplings

interface SaplingLook {
  trunk: RGB[];
  leaves: RGB[];
  crown: number;
  spread: number;
  height: number;
  /** A tree of its own shape: 'spruce' (tiers of needles), 'acacia' (forked, flat), 'tuft' (a clump on a short stem). */
  shape?: 'spruce' | 'acacia' | 'tuft' | 'jungle';
  bark?: 'birch';
  blossom?: RGB[];
}
const OAK_TRUNK: RGB[] = [[52, 34, 18], [90, 62, 34], [126, 92, 52], [164, 126, 78]];
const SAPLINGS: Record<string, SaplingLook> = {
  sapling: { trunk: OAK_TRUNK, leaves: [[24, 78, 24], [44, 118, 34], [76, 164, 46], [124, 204, 66], [176, 232, 108]], crown: 15, spread: 15, height: 30 },
  birch_sapling: { trunk: [[150, 148, 138], [206, 204, 192], [238, 236, 226], [255, 255, 250]], leaves: [[48, 106, 30], [84, 150, 40], [124, 188, 56], [170, 218, 84], [214, 240, 130]], crown: 13, spread: 14, height: 32, bark: 'birch' },
  spruce_sapling: { trunk: [[44, 28, 16], [76, 50, 28], [108, 76, 44], [140, 104, 64]], leaves: [[14, 54, 40], [24, 82, 52], [38, 112, 66], [62, 146, 86], [104, 184, 118]], crown: 0, spread: 18, height: 40, shape: 'spruce' },
  acacia_sapling: { trunk: [[96, 90, 78], [140, 134, 120], [176, 168, 150], [208, 200, 180]], leaves: [[54, 96, 24], [88, 140, 30], [130, 182, 44], [174, 214, 66], [214, 240, 112]], crown: 11, spread: 20, height: 30, shape: 'acacia' },
  jungle_sapling: { trunk: [[58, 40, 22], [96, 70, 40], [132, 100, 60], [168, 132, 84]], leaves: [[10, 70, 26], [20, 110, 34], [40, 158, 44], [84, 204, 60], [140, 238, 104]], crown: 17, spread: 17, height: 34, shape: 'jungle' },
  dark_oak_sapling: { trunk: [[34, 24, 14], [58, 40, 24], [86, 62, 38], [116, 88, 56]], leaves: [[12, 50, 22], [22, 80, 30], [36, 110, 36], [58, 144, 46], [96, 180, 66]], crown: 17, spread: 17, height: 28 },
  cherry_sapling: { trunk: [[70, 36, 40], [108, 62, 66], [146, 94, 96], [186, 130, 130]], leaves: [[176, 74, 120], [220, 110, 156], [246, 156, 190], [255, 200, 220], [255, 232, 240]], crown: 16, spread: 17, height: 30, blossom: [[236, 130, 170], [255, 190, 214]] },
  pale_oak_sapling: { trunk: [[110, 108, 100], [158, 156, 146], [196, 194, 182], [226, 224, 212]], leaves: [[78, 110, 78], [116, 148, 110], [158, 186, 148], [200, 220, 188], [232, 244, 220]], crown: 15, spread: 15, height: 30 },
};

function sapling(s: Sheet, look: SaplingLook, variant: number): void {
  const r = rng(7000 + variant * 29 + Math.round(look.crown * 7));
  const topY = 64 - look.height;
  if (look.shape === 'spruce') {
    stroke(s, [[32, 64], [32, 52], [32, 28]], 3.4, 1.4, (_u, v) => ramp(look.trunk, clamp(0.5 - v * 0.4)));
    // Tiers of drooping boughs, wide at the foot and narrowing to the leader.
    for (let t = 0; t < 5; t++) {
      const y = 56 - t * 7.6;
      const w = 16 - t * 2.9;
      for (const side of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
          const dx = side * (w * (0.5 + k * 0.28));
          stroke(
            s,
            [[32, y - k * 1.2], [32 + dx * 0.5, y - 2.4 - k * 1.2], [32 + dx, y + 3.4 - k * 0.5 + (side < 0 ? 0.5 : 0)]],
            3.4,
            0.4,
            (u, v) => ramp(look.leaves, clamp(0.3 + t * 0.07 + u * 0.38 - v * 0.14 - (side > 0 ? 0.14 : 0))),
          );
        }
      }
    }
    stroke(s, [[32, 30], [32, 24], [32, 17]], 3.2, 0, (u) => ramp(look.leaves, 0.5 + u * 0.4));
    return;
  }
  // The trunk.
  const lean = (variant - 0.5) * 5;
  const topX = 32 + lean;
  const trunk: Pt[] = look.shape === 'acacia' ? [[32, 64], [30, 50], [31 + lean * 0.4, 40]] : [[32, 64], [32 + lean * 0.4, lerp(64, topY, 0.5)], [topX, topY + 6]];
  stroke(s, trunk, look.shape === 'jungle' ? 4.4 : 3.6, 2.6, (u, v, x, y) => {
    let c = ramp(look.trunk, clamp(0.55 - v * 0.42));
    if (look.bark === 'birch' && ((y * 7 + Math.floor(x)) % 11 === 0 || (y + 3) % 9 === 0) && v > -0.6) c = [38, 36, 34];
    return c;
  });
  const clump = (cx: number, cy: number, rad: number, count: number): void => {
    const leaves: { x: number; y: number; a: number; z: number }[] = [];
    for (let i = 0; i < count; i++) {
      const a = r() * TAU;
      const d = Math.sqrt(r());
      leaves.push({ x: cx + Math.cos(a) * rad * d * 1.1, y: cy + Math.sin(a) * rad * d * 0.85, a: r() * TAU, z: r() });
    }
    leaves.sort((p, q) => q.y - p.y);
    for (const l of leaves) {
      const lit = clamp(0.4 + (cy - l.y) / (rad * 2.2) + (cx - l.x) / (rad * 4) + (l.z - 0.5) * 0.5);
      blob(s, l.x, l.y, 4.2 + l.z * 1.6, 2.6 + l.z * 0.8, l.a, (_u, _v, x, y) => {
        const c = ramp(look.leaves, lit);
        return (x * 3 + y * 5) % 11 === 0 ? shade(c, 0.78) : c;
      });
    }
    if (look.blossom) {
      for (let i = 0; i < 9; i++) {
        const a = r() * TAU;
        const d = Math.sqrt(r()) * rad;
        const bx = cx + Math.cos(a) * d;
        const by = cy + Math.sin(a) * d * 0.8;
        for (let p = 0; p < 4; p++) {
          const aa = (p / 4) * TAU + r();
          blob(s, bx + Math.cos(aa) * 1.5, by + Math.sin(aa) * 1.5, 1.7, 1.7, 0, () => (look.blossom as RGB[])[p % 2]);
        }
      }
    }
  };
  if (look.shape === 'acacia') {
    // Forked branches carrying two flat pads of leaves.
    stroke(s, [[31, 42], [24, 36], [19, 30]], 2.6, 1.8, (_u, v) => ramp(look.trunk, clamp(0.5 - v * 0.4)));
    stroke(s, [[31, 42], [39, 36], [45, 31]], 2.6, 1.8, (_u, v) => ramp(look.trunk, clamp(0.5 - v * 0.4)));
    clump(18, 25, 11, 26);
    clump(46, 26, 11, 26);
    clump(32, 21, 9, 18);
    return;
  }
  clump(topX, topY + 2, look.crown, 44);
  if (look.shape === 'jungle') clump(topX + 8, topY + 9, look.crown * 0.55, 14);
  clump(topX - 6, topY + 8, look.crown * 0.5, 14);
}

// ---------------------------------------------------------------- the pictures

type Maker = (s: Sheet, variant: number) => void;
const FLOWER = (fn: Maker): Maker => fn;

/** Every plant picture: the tile it is for, how many variants, and how it is painted. */
const PLANTS: { tile: string; variants: number; make: Maker }[] = [
  { tile: 'tall_grass', variants: 4, make: (s, v) => tuft(s, v, LEAF) },
  { tile: 'fern', variants: 3, make: fern },
  { tile: 'dandelion', variants: 3, make: dandelion },
  { tile: 'rose', variants: 3, make: rose },
  ...(['red', 'orange', 'white', 'pink'] as const).map((k) => ({ tile: `tulip_${k}`, variants: 2, make: FLOWER((s, v) => tulip(s, k, v)) })),
  { tile: 'oxeye_daisy', variants: 2, make: daisy },
  { tile: 'cornflower', variants: 2, make: cornflower },
  { tile: 'allium', variants: 2, make: allium },
  { tile: 'azure_bluet', variants: 2, make: bluet },
  { tile: 'blue_orchid', variants: 2, make: orchid },
  { tile: 'red_mushroom', variants: 2, make: (s, v) => mushroom(s, 'red', v) },
  { tile: 'brown_mushroom', variants: 2, make: (s, v) => mushroom(s, 'brown', v) },
  { tile: 'sugar_cane', variants: 1, make: (s) => sugarCane(s) },
  { tile: 'dead_bush', variants: 3, make: deadBush },
  ...[0, 1, 2, 3].map((i) => ({ tile: `sweet_berry_${i}`, variants: 1, make: FLOWER((s) => berryBush(s, i)) })),
  ...Object.entries(SAPLINGS).map(([tile, look]) => ({ tile, variants: 2, make: FLOWER((s, v) => sapling(s, look, v)) })),
];

const cache = new Map<string, Sheet>();
function sheetOf(key: string, make: Maker, variant: number): Sheet {
  let s = cache.get(key);
  if (!s) {
    s = new Sheet();
    make(s, variant);
    s.finish();
    cache.set(key, s);
  }
  return s;
}

/** The painter of one picture: read from the finished drawing (a gap is alpha 0). */
const painterOf = (key: string, make: Maker, variant: number): HeroPainter => (x, y): HeroPixel => {
  const s = sheetOf(key, make, variant);
  const i = y * N + x;
  return [s.c[i * 3], s.c[i * 3 + 1], s.c[i * 3 + 2], s.a[i]];
};

export const PLANT_PICS: { key: string; tile: string; paint: HeroPainter }[] = PLANTS.flatMap((p) =>
  Array.from({ length: p.variants }, (_, v) => {
    const key = `${p.tile}_plant_${v}`;
    return { key, tile: p.tile, paint: painterOf(key, p.make, v) };
  }),
);
/** The tiles these pictures are for: the atlas keeps its own 16 x 16 picture of each (the hotbar, the particles and held plants use it). */
export const PLANT_TILES = new Set(PLANTS.map((p) => p.tile));
