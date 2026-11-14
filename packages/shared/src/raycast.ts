import { BLOCKS, IS_LIQUID } from './blocks';
import type { BlockReader } from './physics';
import { meshBoxes } from './shapes';

export interface RayHit {
  x: number;
  y: number;
  z: number;
  /** Face normal of the hit face (points toward the ray origin). */
  nx: number;
  ny: number;
  nz: number;
  id: number;
  /** Where in the block the ray struck, 0..1 on each axis (tells the top half of a block from the bottom). */
  fx?: number;
  fy?: number;
  fz?: number;
}

/** Blocks that only fill part of their cell are hit where they actually are, so you can look through a gap. */
const SHAPED = new Set(['slab', 'stair', 'door', 'trapdoor', 'ladder', 'fence', 'gate', 'pane', 'bed', 'lantern', 'chain']);

/** Where a ray first meets the boxes of a shaped block, or null. `t` is distance along the ray. */
function hitShape(
  world: BlockReader,
  id: number,
  x: number,
  y: number,
  z: number,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
): { t: number; nx: number; ny: number; nz: number } | null {
  const boxes =
    BLOCKS[id].shape === 'bed'
      ? ([[0, 0, 0, 1, 9 / 16, 1]] as const)
      : meshBoxes(id, (ax, az) => world.getBlock(x + ax, y, z + az));
  let best: { t: number; nx: number; ny: number; nz: number } | null = null;
  const o = [ox - x, oy - y, oz - z];
  const d = [dx, dy, dz];
  for (const q of boxes) {
    let t0 = 0;
    let t1 = maxDist;
    let axis = -1;
    let sign = 0;
    let ok = true;
    for (let a = 0; a < 3 && ok; a++) {
      const lo = q[a];
      const hi = q[a + 3];
      if (d[a] === 0) {
        if (o[a] < lo || o[a] > hi) ok = false;
        continue;
      }
      let ta = (lo - o[a]) / d[a];
      let tb = (hi - o[a]) / d[a];
      let s = -1; // entering through the low face: its normal points to -axis
      if (ta > tb) {
        [ta, tb] = [tb, ta];
        s = 1;
      }
      if (ta > t0) {
        t0 = ta;
        axis = a;
        sign = s;
      }
      t1 = Math.min(t1, tb);
      if (t0 > t1) ok = false;
    }
    if (!ok || (best && t0 >= best.t)) continue;
    // Already inside the box (axis -1): treat as a hit on the nearest cell face.
    best = { t: t0, nx: axis === 0 ? sign : 0, ny: axis === 1 ? sign : 0, nz: axis === 2 ? sign : 0 };
  }
  return best;
}

/** Voxel traversal (Amanatides & Woo). Skips air and liquids. */
export function raycast(
  world: BlockReader,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  /** Count water and lava as something to hit (buckets). */
  liquids = false,
): RayHit | null {
  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);

  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tMaxX = dx > 0 ? (x + 1 - ox) / dx : dx < 0 ? (ox - x) / -dx : Infinity;
  let tMaxY = dy > 0 ? (y + 1 - oy) / dy : dy < 0 ? (oy - y) / -dy : Infinity;
  let tMaxZ = dz > 0 ? (z + 1 - oz) / dz : dz < 0 ? (oz - z) / -dz : Infinity;

  let nx = 0;
  let ny = 0;
  let nz = 0;
  /** Distance at which the ray entered the current cell. */
  let enter = 0;

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  for (let i = 0; i < 256; i++) {
    const id = world.getBlock(x, y, z);
    if (id !== 0 && (liquids || !IS_LIQUID[id])) {
      if (SHAPED.has(BLOCKS[id].shape)) {
        const s = hitShape(world, id, x, y, z, ox, oy, oz, dx, dy, dz, maxDist);
        if (s) {
          return {
            x,
            y,
            z,
            nx: s.nx,
            ny: s.ny,
            nz: s.nz,
            id,
            fx: clamp01(ox + dx * s.t - x),
            fy: clamp01(oy + dy * s.t - y),
            fz: clamp01(oz + dz * s.t - z),
          };
        }
      } else {
        return {
          x,
          y,
          z,
          nx,
          ny,
          nz,
          id,
          fx: clamp01(ox + dx * enter - x),
          fy: clamp01(oy + dy * enter - y),
          fz: clamp01(oz + dz * enter - z),
        };
      }
    }

    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      if (tMaxX > maxDist) return null;
      enter = tMaxX;
      x += stepX;
      tMaxX += tDeltaX;
      nx = -stepX;
      ny = 0;
      nz = 0;
    } else if (tMaxY < tMaxZ) {
      if (tMaxY > maxDist) return null;
      enter = tMaxY;
      y += stepY;
      tMaxY += tDeltaY;
      nx = 0;
      ny = -stepY;
      nz = 0;
    } else {
      if (tMaxZ > maxDist) return null;
      enter = tMaxZ;
      z += stepZ;
      tMaxZ += tDeltaZ;
      nx = 0;
      ny = 0;
      nz = -stepZ;
    }
  }
  return null;
}
