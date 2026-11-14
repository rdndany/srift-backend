import { IS_LIQUID, IS_SOLID, doorInfo } from './blocks';
import type { BlockReader } from './physics';

export interface PathNode {
  x: number;
  y: number;
  z: number;
}

export interface PathOptions {
  /** Search budget; the search gives up (returning the best partial path) beyond this. */
  maxNodes?: number;
  /** Largest fall the walker accepts. */
  maxDrop?: number;
  /** Stop when within this horizontal distance of the goal (and within 1 block vertically). */
  goalDist?: number;
  /** Return the closest reachable node when the goal itself cannot be reached. */
  partial?: boolean;
  /** Walk through doors (the walker opens them). */
  doors?: boolean;
}

interface Entry {
  x: number;
  y: number;
  z: number;
  g: number;
  f: number;
  parent: Entry | null;
}

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Min-heap on `f`. */
class Heap {
  private a: Entry[] = [];
  get size(): number {
    return this.a.length;
  }
  push(e: Entry): void {
    const a = this.a;
    a.push(e);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): Entry {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

/**
 * A* over the voxel grid for a 1x2 walker: nodes are the cells its feet occupy. It can walk,
 * step up one block and drop down a few; it never enters liquid. Returns the cells to visit
 * after the start (empty when already there) or null if there is no path.
 */
export function findPath(
  world: BlockReader,
  sx: number,
  sy: number,
  sz: number,
  gx: number,
  gy: number,
  gz: number,
  opts: PathOptions = {},
): PathNode[] | null {
  const maxNodes = opts.maxNodes ?? 500;
  const maxDrop = opts.maxDrop ?? 3;
  const goalDist = opts.goalDist ?? 0;
  const partial = opts.partial ?? true;
  const doors = opts.doors ?? false;

  const solid = (x: number, y: number, z: number) => IS_SOLID[world.getBlock(x, y, z)] === 1;
  const free = (x: number, y: number, z: number) => {
    const id = world.getBlock(x, y, z);
    if (doors && doorInfo(id)) return true;
    return !IS_SOLID[id] && !IS_LIQUID[id];
  };
  const standable = (x: number, y: number, z: number) => free(x, y, z) && free(x, y + 1, z) && solid(x, y - 1, z);

  sx = Math.floor(sx);
  sy = Math.floor(sy);
  sz = Math.floor(sz);
  gx = Math.floor(gx);
  gy = Math.floor(gy);
  gz = Math.floor(gz);

  const h = (x: number, y: number, z: number) => Math.abs(x - gx) + Math.abs(z - gz) + Math.abs(y - gy) * 0.5;
  const reached = (x: number, y: number, z: number) =>
    Math.hypot(x - gx, z - gz) <= goalDist && Math.abs(y - gy) <= 1;

  const start: Entry = { x: sx, y: sy, z: sz, g: 0, f: h(sx, sy, sz), parent: null };
  const open = new Heap();
  open.push(start);
  const best = new Map<string, number>([[key(sx, sy, sz), 0]]);
  let closest = start;
  let closestH = start.f;
  let expanded = 0;

  const build = (e: Entry): PathNode[] => {
    const out: PathNode[] = [];
    for (let n: Entry | null = e; n && n.parent; n = n.parent) out.push({ x: n.x, y: n.y, z: n.z });
    return out.reverse();
  };

  while (open.size > 0 && expanded < maxNodes) {
    const cur = open.pop();
    if (cur.g > (best.get(key(cur.x, cur.y, cur.z)) ?? Infinity)) continue; // stale entry
    expanded++;
    if (reached(cur.x, cur.y, cur.z)) return build(cur);

    const hc = h(cur.x, cur.y, cur.z);
    if (hc < closestH) {
      closestH = hc;
      closest = cur;
    }

    for (const [dx, dz] of DIRS) {
      const nx = cur.x + dx;
      const nz = cur.z + dz;
      let ny = cur.y;
      let cost = 1;

      if (free(nx, cur.y, nz) && free(nx, cur.y + 1, nz)) {
        if (!solid(nx, cur.y - 1, nz)) {
          // Walk off an edge and fall to the first floor within maxDrop.
          let landed = false;
          for (let d = 1; d <= maxDrop; d++) {
            if (!free(nx, cur.y - d, nz)) break;
            if (standable(nx, cur.y - d, nz) || solid(nx, cur.y - d - 1, nz)) {
              ny = cur.y - d;
              cost = 1 + d * 0.6;
              landed = true;
              break;
            }
          }
          if (!landed || !standable(nx, ny, nz)) continue;
        }
      } else if (solid(nx, cur.y, nz) && free(nx, cur.y + 1, nz) && free(nx, cur.y + 2, nz) && free(cur.x, cur.y + 2, cur.z)) {
        ny = cur.y + 1; // step up one block
        cost = 1.5;
      } else {
        continue;
      }

      if (!standable(nx, ny, nz)) continue;
      const g = cur.g + cost;
      const k = key(nx, ny, nz);
      if (g >= (best.get(k) ?? Infinity)) continue;
      best.set(k, g);
      open.push({ x: nx, y: ny, z: nz, g, f: g + h(nx, ny, nz), parent: cur });
    }
  }

  if (partial && closest !== start) return build(closest);
  return null;
}
