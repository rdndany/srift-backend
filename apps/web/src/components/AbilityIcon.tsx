'use client';

import { useEffect, useMemo, useRef } from 'react';
import { ABILITY_BY_ID, type AbilityId, type ClassId } from '@solrift/shared';

/**
 * The picture of an ability: a 16x16 pixel-art tile in the colour of its class, drawn the same way as the item
 * sprites (a crisp canvas scaled with `image-rendering: pixelated`) so it sits in the voxel world's style.
 * Each drawing is built from a small palette; the dark outline and the dithered tile are added automatically.
 */

const N = 16;

/** One letter per colour; ' ' is empty. */
const PAL: Record<string, string> = {
  K: '#150d07', // outline
  W: '#ffffff',
  s: '#e4ebf7', // steel: light, mid, dark
  S: '#a3aec6',
  d: '#5f6988',
  Y: '#ffe680', // gold: light, mid, dark
  y: '#f2b632',
  o: '#a8691a',
  R: '#ff6a4a', // red: light, mid, dark
  r: '#cf2f1d',
  m: '#7a1410',
  O: '#ff9a1c', // orange
  F: '#ffd84a', // fire yellow
  B: '#b5ecff', // ice: light, mid, dark
  b: '#4f98ea',
  n: '#2250ae',
  P: '#e2c8ff', // arcane: light, mid, dark
  p: '#9a5cf0',
  q: '#5a2cb8',
  G: '#bdf58a', // green: light, mid, dark
  g: '#4fb83a',
  e: '#1f6b22',
  T: '#93602d', // wood: mid, light, dark
  t: '#d9ab6a',
  u: '#4e2f14',
  X: '#b3a291', // stone: light, mid, dark
  x: '#74645a',
  z: '#3f3229',
};

/** Tile shades per class: lit centre, middle, dark edge. */
const TILE: Record<ClassId, [string, string, string]> = {
  warrior: ['#b4503a', '#8a3425', '#5a2015'],
  mage: ['#6264dc', '#4546ae', '#2a2872'],
  ranger: ['#5cb060', '#3d8444', '#1d4a25'],
};

type Grid = string[][];
const blank = (): Grid => Array.from({ length: N }, () => Array<string>(N).fill(' '));
const put = (g: Grid, x: number, y: number, c: string) => {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px >= 0 && py >= 0 && px < N && py < N) g[py][px] = c;
};
const fromRows = (rows: string[]): Grid => {
  const g = blank();
  rows.forEach((row, y) => [...row.padEnd(N, '.').slice(0, N)].forEach((c, x) => (g[y][x] = c === '.' ? ' ' : c)));
  return g;
};
/** A filled circle; `pick` returns the colour from the distance (0 centre .. 1 edge) and offset, or null to skip. */
const disc = (g: Grid, cx: number, cy: number, r: number, pick: (d: number, dx: number, dy: number) => string | null) => {
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy) / r;
      if (d <= 1) {
        const c = pick(d, dx, dy);
        if (c) g[y][x] = c;
      }
    }
};
const line = (g: Grid, x0: number, y0: number, x1: number, y1: number, c: string) => {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) put(g, x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, c);
};
const tri = (g: Grid, a: [number, number], b: [number, number], c: [number, number], col: string) => {
  const side = (p: [number, number], q: [number, number], x: number, y: number) => (p[0] - x) * (q[1] - y) - (q[0] - x) * (p[1] - y);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const d1 = side(a, b, x, y);
      const d2 = side(b, c, x, y);
      const d3 = side(c, a, x, y);
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) g[y][x] = col;
    }
};
/** A little eight-pointed sparkle. */
const star = (g: Grid, cx: number, cy: number, len: number, core: string, ray: string) => {
  for (let k = 1; k <= len; k++) {
    const c = k === 1 ? core : ray;
    put(g, cx + k, cy, c);
    put(g, cx - k, cy, c);
    put(g, cx, cy + k, c);
    put(g, cx, cy - k, c);
  }
  put(g, cx, cy, core);
  put(g, cx + 1, cy + 1, ray);
  put(g, cx - 1, cy - 1, ray);
  put(g, cx + 1, cy - 1, ray);
  put(g, cx - 1, cy + 1, ray);
};

// ---------------------------------------------------------------------------------------------------------------
// The twelve drawings. Light comes from the upper left.
// ---------------------------------------------------------------------------------------------------------------

const ART: Record<AbilityId, () => Grid> = {
  // A warhammer smashing the ground, the shockwave bursting out of the cracks.
  ground_slam: () =>
    fromRows([
      '................',
      '....KKKKKKKK....',
      '...KWsssSSSdK...',
      '...KsssssSSdK...',
      '...KsssssSSdK...',
      '...KSSSSSSddK...',
      '....KKKtTKKK....',
      '.....KtTTuK.....',
      '.....KtTTuK.....',
      '.....KtTTuK.....',
      '..Y..KtTTuK..Y..',
      '.YOxXXxKKxXXxOY.',
      'OFxzxXxzzxXxzxFO',
      '.zzxKxxzzxxKxzz.',
      '..zzzzzzzzzzzz..',
      '................',
    ]),

  // A shield slammed into something: the impact bursts on its edge.
  shield_bash: () => {
    const g = blank();
    const span: Record<number, [number, number]> = { 2: [1, 10], 3: [1, 10], 4: [1, 10], 5: [1, 10], 6: [1, 10], 7: [1, 10], 8: [1, 10], 9: [2, 9], 10: [3, 8], 11: [4, 7], 12: [5, 6] };
    for (const [ys, [x0, x1]] of Object.entries(span)) {
      const y = Number(ys);
      for (let x = x0; x <= x1; x++) {
        let c = 'r';
        if (x === x0) c = 's';
        else if (x === x1) c = 'd';
        else if (y === 2) c = 'S';
        else if ((x - x0) + (y - 2) < 4) c = 'R';
        g[y][x] = c;
      }
    }
    // the studded boss
    disc(g, 5.5, 6, 2, (d) => (d < 0.4 ? 'Y' : d < 0.8 ? 'y' : 'o'));
    put(g, 5, 5, 'W');
    // the impact burst
    star(g, 12, 5, 3, 'W', 'F');
    put(g, 14, 2, 'O');
    put(g, 10, 1, 'O');
    put(g, 14, 8, 'O');
    return g;
  },

  // Three chevrons, the front one bright: the rush forward.
  charge: () => {
    const g = blank();
    const tones: [string, string][] = [
      ['r', 'R'],
      ['O', 'F'],
      ['Y', 'W'],
    ];
    for (let k = 0; k < 3; k++)
      for (let r = 0; r < 12; r++) {
        const x = 1 + k * 3 + Math.min(r, 11 - r);
        put(g, x, 2 + r, tones[k][0]);
        put(g, x + 1, 2 + r, tones[k][1]);
      }
    return g;
  },

  // A knight's helm with a red crest: take less damage.
  iron_defense: () =>
    fromRows([
      '................',
      '......rRRr......',
      '....SSSSSSSS....',
      '..sWsssSSSSSdd..',
      '..ssssSSSSSSdd..',
      '..ssssSSSSSSdd..',
      '..SKKKKKKKKKKd..',
      '..SSSSSKKSSSdd..',
      '..SSSKSSSSKSdd..',
      '..SSSSSSSSSSdd..',
      '...SSSSSSSSdd...',
      '....SSSSSSdd....',
      '.....SSSSdd.....',
      '................',
      '................',
      '................',
    ]),

  // A blazing ball trailing flame.
  fireball: () => {
    const g = blank();
    for (let i = 0; i < 10; i++) {
      const t = i / 9;
      disc(g, 10 - i * 0.95, 5.5 + i * 0.95, 3.2 * (1 - t) + 0.6, () => (t < 0.35 ? 'F' : t < 0.65 ? 'O' : t < 0.85 ? 'r' : 'm'));
    }
    disc(g, 10, 5.5, 3.7, (d) => (d < 0.3 ? 'W' : d < 0.62 ? 'F' : d < 0.85 ? 'O' : 'r'));
    put(g, 12, 2, 'F');
    put(g, 14, 7, 'O');
    put(g, 3, 8, 'F');
    put(g, 7, 12, 'O');
    return g;
  },

  // A snowflake.
  frost_nova: () => {
    const g = blank();
    for (let k = 0; k <= 6; k++) {
      const c = k > 4 ? 'b' : 'B';
      for (const [x, y] of [[7, 7 - k], [8, 7 - k], [7, 8 + k], [8, 8 + k], [7 - k, 7], [7 - k, 8], [8 + k, 7], [8 + k, 8]]) put(g, x, y, c);
    }
    for (let k = 1; k <= 4; k++) {
      put(g, 7 - k, 7 - k, 'b');
      put(g, 8 + k, 7 - k, 'b');
      put(g, 7 - k, 8 + k, 'b');
      put(g, 8 + k, 8 + k, 'b');
    }
    // the little branches on every arm
    for (const [x, y] of [[6, 3], [9, 3], [6, 12], [9, 12], [3, 6], [3, 9], [12, 6], [12, 9]]) put(g, x, y, 'B');
    for (const [x, y] of [[7, 7], [8, 7], [7, 8], [8, 8]]) put(g, x, y, 'W');
    put(g, 7, 4, 'W');
    put(g, 4, 7, 'W');
    return g;
  },

  // A rock wreathed in fire, falling from the upper right.
  meteor: () => {
    const g = blank();
    for (let i = 0; i < 11; i++) {
      const t = i / 10;
      disc(g, 6 + i * 0.85, 9.5 - i * 0.85, 2.9 * (1 - t) + 0.5, () => (t < 0.3 ? 'F' : t < 0.6 ? 'O' : t < 0.85 ? 'r' : 'm'));
    }
    disc(g, 5.5, 10, 3.9, (d, dx, dy) => {
      const lit = dx - dy;
      if (d > 0.8 && lit > 1) return 'O';
      return lit > 2 ? 'X' : lit > -2 ? 'x' : 'z';
    });
    for (const [x, y] of [[4, 9], [6, 11], [3, 11], [7, 8]]) put(g, x, y, 'z');
    put(g, 5, 8, 'X');
    put(g, 14, 2, 'F');
    put(g, 11, 1, 'O');
    return g;
  },

  // A glowing bubble with a rune star.
  arcane_shield: () => {
    const g = blank();
    disc(g, 7.5, 7.5, 6.4, (d, dx, dy) => {
      if (d > 0.8) return dx + dy < -2 ? 'W' : dx + dy < 3 ? 'P' : 'p';
      return d > 0.5 ? 'p' : 'q';
    });
    star(g, 8, 8, 3, 'W', 'P');
    put(g, 5, 5, 'P');
    put(g, 10, 10, 'P');
    return g;
  },

  // An arrow flying up and to the right.
  piercing_shot: () => {
    const g = blank();
    line(g, 2, 13, 11, 4, 'T');
    line(g, 3, 13, 10, 6, 't');
    // fletching
    for (const [x, y, c] of [[1, 12, 'R'], [2, 11, 'R'], [3, 10, 'r'], [3, 14, 'R'], [4, 13, 'R'], [5, 12, 'r']] as [number, number, string][]) put(g, x, y, c);
    put(g, 2, 13, 'u');
    put(g, 3, 12, 'u');
    // head
    tri(g, [14, 1], [9, 3], [12, 6], 'S');
    for (let y = 0; y < N; y++) for (let x = 8; x < N; x++) if (g[y][x] === 'S') g[y][x] = x + y <= 13 ? 's' : x + y <= 15 ? 'S' : 'd';
    put(g, 14, 1, 'W');
    // a sparkle of speed
    put(g, 7, 2, 'G');
    put(g, 14, 9, 'G');
    put(g, 10, 12, 'G');
    return g;
  },

  // A dash: a swirling arrow circling the hero, wind streaks inside.
  evasive_roll: () => {
    const g = blank();
    for (let a = 25; a <= 305; a += 4) {
      const rad = (a * Math.PI) / 180;
      const lit = Math.cos(rad - Math.PI * 1.25) > 0.2;
      for (const [r, c] of [[5.2, lit ? 'G' : 'g'], [4.2, lit ? 'g' : 'e']] as [number, string][]) put(g, 7.5 + Math.cos(rad) * r, 8 + Math.sin(rad) * r, c);
    }
    tri(g, [14, 6], [8.5, 1.5], [11.5, 6.5], 'G');
    put(g, 12, 5, 'W');
    for (const [x0, x1, y] of [[6, 9, 7], [5, 8, 9]]) line(g, x0, y, x1, y, 'B');
    return g;
  },

  // A jaw trap: the toothed ring around the trigger plate.
  bear_trap: () => {
    const g = blank();
    disc(g, 7.5, 8, 6.4, (d, dx, dy) => (d < 0.78 ? 'x' : dx + dy < -1 ? 's' : dx + dy < 4 ? 'S' : 'd'));
    disc(g, 7.5, 8, 4.4, () => 'z');
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + Math.PI / 8;
      put(g, 7.5 + Math.cos(a) * 4.2, 8 + Math.sin(a) * 4.2, 'W');
      put(g, 7.5 + Math.cos(a) * 3.3, 8 + Math.sin(a) * 3.3, 'S');
    }
    disc(g, 7.5, 8, 1.9, (d, dx, dy) => (dx + dy < 0 ? 't' : d < 0.5 ? 'y' : 'T'));
    return g;
  },

  // Arrows dropping into a marked circle on the ground.
  rain_of_arrows: () => {
    const g = blank();
    // the target
    for (let y = 9; y <= 15; y++)
      for (let x = 0; x < N; x++) {
        const d = Math.hypot((x - 7.5) / 7.2, (y - 12.2) / 2.8);
        if (d <= 1) g[y][x] = d > 0.72 ? 'G' : 'e';
      }
    // the arrows
    const arrow = (x: number, y0: number, y1: number) => {
      line(g, x, y0, x, y1, 'T');
      put(g, x - 1, y0, 'R');
      put(g, x + 1, y0, 'R');
      put(g, x - 1, y0 + 1, 'r');
      put(g, x + 1, y0 + 1, 'r');
      put(g, x, y1 + 1, 'S');
      put(g, x - 1, y1, 's');
      put(g, x + 1, y1, 'S');
      put(g, x, y1 + 2, 'W');
    };
    arrow(3, 1, 8);
    arrow(8, 0, 9);
    arrow(12, 2, 8);
    return g;
  },
};

// ---------------------------------------------------------------------------------------------------------------

const BAYER = [
  [0, 2],
  [3, 1],
];

const hexToRgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

/** The finished 16x16 picture: dithered tile, bevel, the drawing, its outline and the dark frame. */
function compose(id: AbilityId): Uint8ClampedArray {
  const cls = ABILITY_BY_ID.get(id)!.classId;
  const tone = TILE[cls].map(hexToRgb);
  const px: ([number, number, number] | null)[][] = Array.from({ length: N }, () => Array<[number, number, number] | null>(N).fill(null));

  // the dithered tile
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const t = Math.min(1, Math.hypot(x - 7.5, (y - 5.5) * 1.1) / 11);
      const idx = Math.max(0, Math.min(2, Math.floor(t * 2 + 0.5 + BAYER[y & 1][x & 1] / 4 - 0.375)));
      px[y][x] = tone[idx];
    }
  // the bevel
  for (let i = 1; i < N - 1; i++) {
    px[1][i] = px[1][i]!.map((v) => Math.round(v + (255 - v) * 0.25)) as [number, number, number];
    px[i][1] = px[i][1]!.map((v) => Math.round(v + (255 - v) * 0.25)) as [number, number, number];
    px[N - 2][i] = px[N - 2][i]!.map((v) => Math.round(v * 0.6)) as [number, number, number];
    px[i][N - 2] = px[i][N - 2]!.map((v) => Math.round(v * 0.6)) as [number, number, number];
  }

  // the drawing, then its outline
  const art = ART[id]();
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && art[y][x] !== ' ';
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (solid(x, y)) px[y][x] = hexToRgb(PAL[art[y][x]]);
      else if (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1)) px[y][x] = hexToRgb(PAL.K);
    }

  // the frame, with rounded corners
  for (let i = 0; i < N; i++) px[0][i] = px[N - 1][i] = px[i][0] = px[i][N - 1] = hexToRgb(PAL.K);
  for (const [x, y] of [[0, 0], [N - 1, 0], [0, N - 1], [N - 1, N - 1]]) px[y][x] = null;

  const out = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const c = px[y][x];
      const o = (y * N + x) * 4;
      if (c) [out[o], out[o + 1], out[o + 2], out[o + 3]] = [c[0], c[1], c[2], 255];
    }
  return out;
}

export function AbilityIcon({ id, size = 32 }: { id: AbilityId; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pixels = useMemo(() => compose(id), [id]);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), N, N), 0, 0);
  }, [pixels]);
  return <canvas ref={ref} width={N} height={N} className="ability-icon" data-ability={id} aria-hidden style={{ width: size, height: size, imageRendering: 'pixelated' }} />;
}
