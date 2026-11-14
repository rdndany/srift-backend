import * as THREE from 'three';
import { mulberry32 } from '@solrift/shared';

/** The ten stages of the block-breaking animation: 0 is a small crack, 9 a block covered in cracks (the next moment it breaks). */
export const CRACK_STAGES = 10;
const N = 16;

/** How much of the face is cracked at each stage (the first stages are a few fine lines, the last ones nearly all of it). */
const COVER = [0.05, 0.1, 0.16, 0.23, 0.31, 0.4, 0.5, 0.62, 0.74, 0.88];

/**
 * One 16x16 face with every cell given a place in the order the cracks reach it: a few fractures grow outward from the middle
 * (branching as they go), then the rest of the face crumbles in, nearest to the cracks first. A stage shows the cells whose
 * place is within its share, so each stage is the one before it with more cracks added, as in the game.
 */
function crackOrder(): { order: Int16Array; fractures: number } {
  const r = mulberry32(0x6b1e);
  const order = new Int16Array(N * N).fill(-1);
  let n = 0;
  const mark = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= N || y >= N || order[y * N + x] >= 0) return false;
    order[y * N + x] = n++;
    return true;
  };
  interface Walker {
    x: number;
    y: number;
    a: number;
    life: number;
  }
  const walkers: Walker[] = [];
  const sprout = (x: number, y: number, a: number, life: number) => walkers.push({ x, y, a, life });
  mark(7, 7);
  mark(8, 8);
  const start = r() * Math.PI;
  for (let k = 0; k < 3; k++) sprout(7.5, 7.5, start + k * 2.3 + (r() - 0.5) * 0.9, 9 + Math.floor(r() * 5));
  for (let round = 0; round < 40 && n < 78; round++) {
    for (const w of [...walkers]) {
      if (w.life <= 0) continue;
      w.life--;
      w.a += (r() - 0.5) * 1.1;
      w.x += Math.cos(w.a);
      w.y += Math.sin(w.a);
      mark(Math.round(w.x), Math.round(w.y));
      // A fracture splits now and then, and its branch is shorter.
      if (r() < 0.16 && walkers.length < 16) sprout(w.x, w.y, w.a + (r() < 0.5 ? 1 : -1) * (0.6 + r() * 0.7), Math.floor(w.life * 0.7));
    }
  }
  const fractures = n;
  // The rest: nearest to a crack first, a little shuffled.
  const rest: { i: number; k: number }[] = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (order[y * N + x] >= 0) continue;
      let d = 99;
      for (let j = 0; j < N * N; j++) {
        if (order[j] < 0 || order[j] >= fractures) continue;
        d = Math.min(d, Math.hypot((j % N) - x, Math.floor(j / N) - y));
      }
      rest.push({ i: y * N + x, k: d + r() * 3 });
    }
  }
  rest.sort((a, b) => a.k - b.k);
  for (const c of rest) order[c.i] = n++;
  return { order, fractures };
}

/** A strip of the ten stages side by side (160 x 16), dark cracks on clear ground. */
export function makeCrackTexture(): THREE.CanvasTexture {
  const { order, fractures } = crackOrder();
  const r = mulberry32(0x51de);
  const c = document.createElement('canvas');
  c.width = N * CRACK_STAGES;
  c.height = N;
  const g = c.getContext('2d')!;
  const img = g.createImageData(c.width, c.height);
  for (let s = 0; s < CRACK_STAGES; s++) {
    const shown = Math.round(N * N * COVER[s]);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const o = order[y * N + x];
        if (o >= shown) continue;
        const i = (y * c.width + s * N + x) * 4;
        const v = 18 + Math.floor(r() * 26);
        const fracture = o < fractures;
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = v;
        // The fractures themselves are dark and sharp; the crumbled ground around them is a thinner shade that deepens as it goes.
        img.data[i + 3] = fracture ? 225 : 70 + Math.floor((s / (CRACK_STAGES - 1)) * 80) + Math.floor(r() * 30);
      }
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.repeat.set(1 / CRACK_STAGES, 1);
  return t;
}

/** Point the strip at one stage (0..9). */
export function setCrackStage(t: THREE.Texture, stage: number): void {
  t.offset.x = Math.min(CRACK_STAGES - 1, Math.max(0, stage)) / CRACK_STAGES;
}
