/**
 * The pictures (16x16) of the nine relics of the Hollow King: burning stone, lava and gold. They are drawn the way the other
 * sprites are (a grid of colours with a dark outline) and handed to sprites.ts, which puts them in the atlas.
 * No imports from the game, so that a script can draw them to a picture.
 */

export type RGB = [number, number, number];
export type Cell = RGB | null;

const N = 16;
const OUTLINE: RGB = [20, 14, 22];

const PAL: Record<string, RGB> = {
  k: [34, 28, 42], // the darkest stone
  s: [74, 66, 86], // stone
  h: [118, 108, 132], // stone in the light
  l: [164, 154, 178], // an edge in the light
  d: [104, 26, 20], // dark red
  r: [178, 44, 24], // red
  o: [255, 122, 32], // lava
  y: [255, 208, 84], // hot lava
  w: [255, 244, 204], // white hot
  g: [214, 168, 70], // gold
  G: [150, 108, 40], // dark gold
};

const hash = (x: number, y: number, s = 0): number => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
const tint = (c: RGB, d: number): RGB => [clamp(c[0] + d), clamp(c[1] + d), clamp(c[2] + d)];

const blank = (): Cell[] => new Array<Cell>(N * N).fill(null);

function dot(g: Cell[], x: number, y: number, c: RGB): void {
  x = Math.round(x);
  y = Math.round(y);
  if (x >= 0 && y >= 0 && x < N && y < N) g[y * N + x] = c;
}

/** A letter picture: '.' is clear; stone letters get a little grain, lava letters a little flicker. */
function art(rows: readonly string[], seed: number): Cell[] {
  const g = blank();
  rows.forEach((row, y) => {
    for (let x = 0; x < N && x < row.length; x++) {
      const c = PAL[row[x]];
      if (!c) continue;
      const stone = 'kshl'.includes(row[x]);
      const n = (hash(x, y, seed) - 0.5) * (stone ? 16 : 22);
      dot(g, x, y, tint(c, n));
    }
  });
  return g;
}

/** A line, as wide as `w` pixels across. */
function line(g: Cell[], x0: number, y0: number, x1: number, y1: number, c: RGB | ((i: number, t: number) => RGB), w = 1): void {
  const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    for (let k = 0; k < w; k++) {
      const off = k - (w - 1) / 2;
      const col = typeof c === 'function' ? c(k, t) : c;
      dot(g, x0 + dx * t + nx * off, y0 + dy * t + ny * off, col);
    }
  }
}

function disc(g: Cell[], cx: number, cy: number, r: number, c: RGB | ((d: number) => RGB)): void {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d <= r) g[y * N + x] = typeof c === 'function' ? c(d / r) : c;
  }
}

/** The dark outline round a picture, and a light edge at the top and left of the stone. */
function finish(grid: Cell[]): Cell[] {
  const out = grid.slice();
  const at = (x: number, y: number): Cell => (x < 0 || y < 0 || x >= N || y >= N ? null : grid[y * N + x]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (grid[y * N + x]) continue;
    if (at(x + 1, y) || at(x - 1, y) || at(x, y + 1) || at(x, y - 1)) out[y * N + x] = OUTLINE;
  }
  return out;
}

/** Flames licking up from a spot: a few pixels of fire above it. */
function flame(g: Cell[], x: number, y: number, h: number, seed: number): void {
  for (let i = 0; i < h; i++) {
    const sway = Math.round((hash(x, i, seed) - 0.5) * 1.2);
    const c = i === 0 ? PAL.y : i < h - 1 ? PAL.o : PAL.r;
    if (!g[(y - i) * N + x + sway] || i > 0) dot(g, x + sway, y - i, c);
  }
}

/** The helm: a crown of stone horns tipped with fire over a visor with two burning eyes. */
function crownGrid(): Cell[] {
  const half = [
    '........',
    '..y....y',
    '..oy..yo',
    '..hs..sh',
    '..hsshss',
    '..hooyoo',
    '.khsssss',
    '.kshssss',
    '.ksssssh',
    '.kskkkkk',
    '.kskowkk',
    '.kskkkkk',
    '.ksssskk',
    '.kssssss',
    '..kssshs',
    '...kkkkk',
  ];
  return finish(art(half.map((r) => r + [...r].reverse().join('')), 1));
}

function cuirassGrid(): Cell[] {
  const half = [
    '........',
    '.hhhss..',
    'hhssssss',
    'hsssssss',
    'hsshsssl',
    'hssssooy',
    '.hssoyyw',
    '.hssoyww',
    '.hsssoyy',
    '.hssssor',
    '.hsssssh',
    '.ksoyooy',
    '.kssssss',
    '.ksshsss',
    '..kssssk',
    '...kkkkk',
  ];
  return finish(art(half.map((r) => r + [...r].reverse().join('')), 2));
}

function greavesGrid(): Cell[] {
  const half = [
    '........',
    '.kkkkkkk',
    'khhhhhhh',
    'ksoyooyo',
    'kssssssh',
    'kshsssss',
    'ksssssss',
    'kssshsss',
    'kssssskk',
    'ksssss..',
    'ksohsss.',
    'ksoyssh.',
    'ksssssh.',
    'ksshsss.',
    'kkssssk.',
    '.kkkkkk.',
  ];
  return finish(art(half.map((r) => r + [...r].reverse().join('')), 3));
}

function sabatonsGrid(): Cell[] {
  const rows = [
    '................',
    '....kkkkkk......',
    '...khhhhhhk.....',
    '...ksoyyosk.....',
    '...kssssssk.....',
    '...kshsssssk....',
    '...ksssssssk....',
    '...ksshssssskk..',
    '...kssssssssssk.',
    '..khssssssssssk.',
    '..kssshssssoosk.',
    '..kssssssoyyoosk',
    '..kkkkkkkkkkkkk.',
    '..y.o.y.oy.o.yo.',
    '................',
  ];
  const g = art(rows, 4);
  return finish(g);
}

/** A blade of stone and lava, edge lit by the fire along it, flames at its tip. */
function bladeGrid(): Cell[] {
  const g = blank();
  // the blade, from the guard to the tip, three wide: dark stone edges round a lava core with a white-hot line down it
  line(g, 4.2, 11.2, 14, 1.4, (k, t) => (k === 0 ? tint(PAL.s, -10 + t * 40) : k === 1 ? (t > 0.55 ? PAL.y : PAL.o) : tint(PAL.h, -20 + t * 30)), 3);
  line(g, 5.2, 10.2, 13, 2.4, (_k, t) => (t > 0.5 ? PAL.w : PAL.y), 1);
  // the crossguard of dark stone with a gem of fire
  line(g, 2.2, 8.8, 7.2, 13.8, (k) => (k === 0 ? PAL.s : PAL.h), 2);
  dot(g, 2, 9, PAL.o);
  dot(g, 7, 14, PAL.o);
  dot(g, 4.5, 11.5, PAL.w);
  // the grip, and a pommel that glows
  line(g, 3.4, 12.6, 1.4, 14.6, PAL.d, 2);
  disc(g, 1, 15, 0.9, PAL.o);
  // fire along the tip
  flame(g, 14, 2, 3, 3);
  dot(g, 15, 0, PAL.y);
  dot(g, 12, 0, PAL.o);
  dot(g, 15, 3, PAL.o);
  return finish(g);
}

/**
 * A staff of cracked stone that cradles a flame in a claw of horns. Drawn upright and squat, like the Mage's staff (the hand stretches
 * it upwards): a shaft one pixel wide, with the head at the top.
 */
function staffGrid(): Cell[] {
  const g = blank();
  for (let y = 5; y <= 14; y++) dot(g, 7, y, y % 3 === 0 ? PAL.o : y % 2 ? PAL.s : PAL.h);
  dot(g, 7, 15, PAL.o);
  for (const y of [8, 12]) {
    dot(g, 6, y, PAL.d);
    dot(g, 7, y, PAL.o);
    dot(g, 8, y, PAL.r);
  }
  // the claw round the flame
  for (let x = 5; x <= 9; x++) dot(g, x, 3, x < 7 ? PAL.h : PAL.s);
  for (const x of [6, 7, 8]) dot(g, x, 4, x < 7 ? PAL.h : PAL.k);
  for (const y of [1, 2]) {
    dot(g, 5, y, PAL.h);
    dot(g, 9, y, PAL.s);
  }
  dot(g, 5, 0, PAL.l);
  dot(g, 9, 0, PAL.s);
  // the flame
  for (const [x, y] of [[6, 2], [7, 2], [8, 2], [6, 1], [8, 1]] as const) dot(g, x, y, PAL.o);
  dot(g, 7, 1, PAL.y);
  dot(g, 7, 2, PAL.w);
  dot(g, 7, 0, PAL.y);
  dot(g, 6, 0, PAL.o);
  dot(g, 8, 0, PAL.r);
  return finish(g);
}

/**
 * The crossbow's frame (the shape the first-person hand draws its string and bolt on, so its limbs and stock are where the plain crossbow's
 * are: see held/aim.ts), of dark stone with fire in its limbs; and the whole of it with string and a bolt of fire laid in it.
 */
function crossbowGrid(withString = true): Cell[] {
  const g = blank();
  // the prod: a bow laid across the stock, its limbs bent forward (toward the upper right), with lava on the tips
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const bend = Math.sin(t * Math.PI) * 2.2;
    const x = Math.round(6.5 + t * 8 + bend * 0.707);
    const y = Math.round(3.5 + t * 8 - bend * 0.707);
    const tip = t < 0.12 || t > 0.88;
    dot(g, x, y, tip ? PAL.o : tint(PAL.h, -4));
    dot(g, x - 1, y, tip ? PAL.r : PAL.s);
    if (!tip && t > 0.3 && t < 0.7) dot(g, x, y - 1, PAL.l);
    if (i === 8 || i === 16) dot(g, x, y, PAL.o);
  }
  // the stock, from the butt (lower left) up to the middle of the prod, with a seam of lava along it
  for (let k = 0; k <= 8; k++) {
    const x = 3 + k;
    const y = 15 - k;
    dot(g, x, y, k % 3 === 1 ? PAL.o : tint(PAL.d, k % 2 ? 10 : -4));
    dot(g, x + 1, y, tint(PAL.s, -14));
    dot(g, x - 1, y, tint(PAL.h, -6));
  }
  dot(g, 2, 15, PAL.k);
  dot(g, 3, 15, PAL.k);
  dot(g, 2, 14, PAL.s);
  line(g, 11, 6, 12, 5, PAL.o, 1); // the stirrup
  dot(g, 12, 4, PAL.y);
  dot(g, 8, 9, PAL.k); // the lock
  dot(g, 7, 10, PAL.y);
  if (withString) {
    line(g, 6, 3, 14, 11, PAL.l, 1);
    // the bolt of fire in the groove
    line(g, 4, 12, 9, 7, (_k, t) => (t > 0.7 ? PAL.y : PAL.o), 1);
    dot(g, 10, 6, PAL.w);
    dot(g, 11, 5, PAL.y);
    flame(g, 10, 5, 3, 7);
    dot(g, 12, 3, PAL.o);
  }
  return finish(g);
}

/** The signet: a band of dark stone and gold with a gem of fire, and a little flame on it. */
function signetGrid(): Cell[] {
  const g = blank();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - 7.5, y - 10);
    if (d <= 4.6 && d >= 2.6) {
      const light = (x - 7.5 + (y - 10)) / 8;
      g[y * N + x] = tint(PAL.g, -30 - light * 50 + (hash(x, y, 8) - 0.5) * 12);
    }
  }
  // the seal: a block of stone over the band, with the gem in it
  for (let y = 3; y <= 7; y++) for (let x = 5; x <= 10; x++) g[y * N + x] = tint(PAL.s, (hash(x, y, 9) - 0.5) * 14);
  for (let x = 5; x <= 10; x++) g[3 * N + x] = PAL.h;
  disc(g, 7.5, 5.2, 2, (d) => (d < 0.35 ? PAL.w : d < 0.7 ? PAL.y : PAL.o));
  dot(g, 7, 4, PAL.w);
  flame(g, 7, 2, 3, 10);
  dot(g, 9, 1, PAL.o);
  return finish(g);
}

/** The heart: a beating coal in a cage of stone, on a chain of dark links. */
function heartGrid(): Cell[] {
  const g = blank();
  // the chain, a loop of links that hangs from the two top corners
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const x = 1.5 + t * 13;
    const y = 1 + Math.sin(t * Math.PI) * 6.5;
    dot(g, x, y, i % 2 === 0 ? PAL.g : tint(PAL.G, -10));
  }
  // the pendant: a stone heart with a coal in it
  const heart = [
    '..hh..hh..',
    '.hsshhssh.',
    'hsssssssss',
    'hssoyyossk',
    'hssyywyssk',
    '.hsoyyosk.',
    '..hsooskk.',
    '...hsskk..',
    '....kk....',
  ];
  heart.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = PAL[row[i]];
      if (!c) continue;
      const stone = 'kshl'.includes(row[i]);
      dot(g, 3 + i, 6 + j, tint(c, (hash(i, j, 11) - 0.5) * (stone ? 14 : 20)));
    }
  });
  flame(g, 8, 6, 2, 12);
  return finish(g);
}

export const HOLLOW_KING_ICONS: Record<string, () => Cell[]> = {
  hollow_king_crown: crownGrid,
  hollow_king_cuirass: cuirassGrid,
  hollow_king_greaves: greavesGrid,
  hollow_king_sabatons: sabatonsGrid,
  emberfall_blade: bladeGrid,
  burning_throne_staff: staffGrid,
  cinderbolt_crossbow: () => crossbowGrid(true),
  cinderbolt_crossbow_frame: () => crossbowGrid(false),
  hollow_king_signet: signetGrid,
  hollow_king_heart: heartGrid,
};
