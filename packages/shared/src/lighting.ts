import { IS_OPAQUE, LIGHT_EMIT, MAX_LIGHT } from './blocks';

/**
 * Voxel light propagation (flood fill), shared by client (meshing) and server.
 *
 * Operates on a rectangular region of blocks laid out like chunk data:
 *   index = (y * depth + z) * width + x
 * and returns one byte per cell: (skyLight << 4) | blockLight.
 *
 * Light only travels up to 15 blocks, so computing a chunk's light from a
 * region that extends 16 blocks past it on every side is exact.
 */

// Reusable, growable ring buffer for the BFS frontier and seed list.
let ring = new Int32Array(1 << 14);
let seedBuf = new Int32Array(1 << 12);

function pushSeed(count: number, idx: number): void {
  if (count >= seedBuf.length) {
    const bigger = new Int32Array(seedBuf.length * 2);
    bigger.set(seedBuf);
    seedBuf = bigger;
  }
  seedBuf[count] = idx;
}

/**
 * Spread light from seeded cells. `shift` selects the nibble (4 = sky, 0 = block).
 * Seeds must already have their level written into `light`.
 */
function propagate(
  blocks: Uint16Array,
  light: Uint8Array,
  w: number,
  h: number,
  d: number,
  shift: 0 | 4,
  seedCount: number,
): void {
  const layer = w * d;
  const clear = ~(0xf << shift);

  let cap = ring.length;
  while (cap < seedCount * 2) cap *= 2;
  if (cap !== ring.length) ring = new Int32Array(cap);
  let q = ring;
  let mask = cap - 1;

  let head = 0;
  let tail = 0;
  for (let i = 0; i < seedCount; i++) q[tail++ & mask] = seedBuf[i];

  while (head < tail) {
    const idx = q[head++ & mask];
    const level = (light[idx] >> shift) & 0xf;
    if (level <= 1) continue;
    const next = level - 1;

    const y = (idx / layer) | 0;
    const rem = idx - y * layer;
    const z = (rem / w) | 0;
    const x = rem - z * w;

    for (let n = 0; n < 6; n++) {
      let ni: number;
      switch (n) {
        case 0:
          if (x === 0) continue;
          ni = idx - 1;
          break;
        case 1:
          if (x === w - 1) continue;
          ni = idx + 1;
          break;
        case 2:
          if (z === 0) continue;
          ni = idx - w;
          break;
        case 3:
          if (z === d - 1) continue;
          ni = idx + w;
          break;
        case 4:
          if (y === 0) continue;
          ni = idx - layer;
          break;
        default:
          if (y === h - 1) continue;
          ni = idx + layer;
      }
      if (IS_OPAQUE[blocks[ni]]) continue;
      if (((light[ni] >> shift) & 0xf) >= next) continue;
      light[ni] = (light[ni] & clear) | (next << shift);

      if (tail - head >= cap) {
        // Frontier outgrew the ring: double it, preserving order.
        const bigger = new Int32Array(cap * 2);
        for (let i = head; i < tail; i++) bigger[i - head] = q[i & mask];
        tail -= head;
        head = 0;
        cap *= 2;
        mask = cap - 1;
        q = bigger;
        ring = bigger;
      }
      q[tail++ & mask] = ni;
    }
  }
}

export function computeLight(blocks: Uint16Array, w: number, h: number, d: number): Uint8Array {
  const layer = w * d;
  const light = new Uint8Array(blocks.length);

  // ---- sky light ------------------------------------------------------
  // top[z*w+x] = y of the highest opaque block (-1 if none). Everything above is sky-lit.
  const top = new Int16Array(layer);
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      let y = h - 1;
      let idx = (y * d + z) * w + x;
      while (y >= 0 && !IS_OPAQUE[blocks[idx]]) {
        light[idx] |= MAX_LIGHT << 4;
        y--;
        idx -= layer;
      }
      top[z * w + x] = y;
    }
  }

  // Seeds: sky-lit cells beside a taller column can spill light sideways.
  let seeds = 0;
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      const t = top[z * w + x];
      let nb = -1;
      if (x > 0) nb = Math.max(nb, top[z * w + x - 1]);
      if (x < w - 1) nb = Math.max(nb, top[z * w + x + 1]);
      if (z > 0) nb = Math.max(nb, top[(z - 1) * w + x]);
      if (z < d - 1) nb = Math.max(nb, top[(z + 1) * w + x]);
      for (let y = t + 1; y <= nb; y++) pushSeed(seeds++, (y * d + z) * w + x);
    }
  }
  if (seeds > 0) propagate(blocks, light, w, h, d, 4, seeds);

  // ---- block light ----------------------------------------------------
  seeds = 0;
  for (let i = 0; i < blocks.length; i++) {
    const e = LIGHT_EMIT[blocks[i]];
    if (e > 0) {
      light[i] |= e;
      pushSeed(seeds++, i);
    }
  }
  if (seeds > 0) propagate(blocks, light, w, h, d, 0, seeds);

  return light;
}
