import { POWERED_RAILS, PLAIN_RAILS } from './blocks';
import type { BlockReader } from './physics';

/**
 * Rails. A rail block is one of ten shapes (straight along x or z, four curves, four slopes), plain or powered.
 * Players only place the straight one: it looks at its neighbours and picks the shape that joins them, and the
 * neighbours do the same, so laying a line, a corner or a hill needs no care.
 *
 * Every shape has two exits, the middles of two cell edges. A cart follows the line from one exit to the other and
 * moves on into the rail that has a matching exit.
 */

/** A direction in the plane: 0 = +x (east), 1 = -x (west), 2 = +z (south), 3 = -z (north). */
export const RAIL_DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const OPPOSITE = [1, 0, 3, 2];

/** Shape numbers: 0 = along x, 1 = along z, 2..5 = curves (E-S, W-S, W-N, E-N), 6..9 = slopes up towards +x, -x, +z, -z. */
export type RailShape = number;
const SHAPE_X = 0;
const SHAPE_Z = 1;

/** The two edges each shape joins, and which of them is raised a block (slopes). */
const SHAPE_EXITS: readonly { dirs: readonly [number, number]; high: -1 | 0 | 1 }[] = [
  { dirs: [1, 0], high: -1 },
  { dirs: [3, 2], high: -1 },
  { dirs: [0, 2], high: -1 },
  { dirs: [1, 2], high: -1 },
  { dirs: [1, 3], high: -1 },
  { dirs: [0, 3], high: -1 },
  { dirs: [1, 0], high: 1 },
  { dirs: [0, 1], high: 1 },
  { dirs: [3, 2], high: 1 },
  { dirs: [2, 3], high: 1 },
];

export interface RailInfo {
  shape: RailShape;
  powered: boolean;
  curve: boolean;
  slope: boolean;
  /** One end of the line and the other, in the cell's own coordinates (the middles of two edges). */
  a: readonly [number, number, number];
  b: readonly [number, number, number];
  /** The edges (RAIL_DIRS) the ends are on, and how high each end is (0 or 1). */
  dirA: number;
  dirB: number;
  hA: number;
  hB: number;
  /** Length of the line. */
  length: number;
  /** Unit vector from `a` to `b`. */
  dx: number;
  dy: number;
  dz: number;
}

const INFO = new Map<number, RailInfo>();

function edgePoint(dir: number, h: number): [number, number, number] {
  switch (dir) {
    case 0:
      return [1, h, 0.5];
    case 1:
      return [0, h, 0.5];
    case 2:
      return [0.5, h, 1];
    default:
      return [0.5, h, 0];
  }
}

function register(id: number, shape: RailShape, powered: boolean): void {
  const e = SHAPE_EXITS[shape];
  // For a slope, the first listed edge is the low end and the second the high end.
  const hA = 0;
  const hB = e.high === 1 ? 1 : 0;
  const dirA = e.dirs[0];
  const dirB = e.dirs[1];
  const a = edgePoint(dirA, hA);
  const b = edgePoint(dirB, hB);
  const lx = b[0] - a[0];
  const ly = b[1] - a[1];
  const lz = b[2] - a[2];
  const length = Math.hypot(lx, ly, lz);
  INFO.set(id, { shape, powered, curve: shape >= 2 && shape <= 5, slope: shape >= 6, a, b, dirA, dirB, hA, hB, length, dx: lx / length, dy: ly / length, dz: lz / length });
}
PLAIN_RAILS.forEach((id, shape) => register(id, shape, false));
// Powered rails come in the straight and the slope shapes only (index 2..5 are curves, which they never take).
POWERED_RAILS.forEach((id, i) => register(id, i < 2 ? i : i + 4, true));

export function railInfo(id: number): RailInfo | null {
  return INFO.get(id) ?? null;
}

export const isRail = (id: number): boolean => INFO.has(id);

/** The block for a shape (powered rails have no curves: those fall back to the straight shape on their first edge's axis). */
export function railBlock(shape: RailShape, powered: boolean): number {
  if (!powered) return PLAIN_RAILS[shape];
  if (shape <= 1) return POWERED_RAILS[shape];
  if (shape >= 6) return POWERED_RAILS[shape - 4];
  return POWERED_RAILS[SHAPE_EXITS[shape].dirs[0] < 2 ? SHAPE_X : SHAPE_Z];
}

/** Which shape joins two directions (and which of them climbs, if any: -1 for none). */
function shapeFor(d1: number, d2: number, up: number): RailShape | null {
  if (d1 === d2) return null;
  const opposite = OPPOSITE[d1] === d2;
  if (opposite) {
    const axisX = d1 < 2;
    if (up === d1 || up === d2) {
      // Climbs towards `up`.
      return up === 0 ? 6 : up === 1 ? 7 : up === 2 ? 8 : 9;
    }
    return axisX ? SHAPE_X : SHAPE_Z;
  }
  const set = [d1, d2].sort().join();
  switch (set) {
    case '0,2':
      return 2;
    case '1,2':
      return 3;
    case '1,3':
      return 4;
    default:
      return 5; // 0,3
  }
}

type Cell = { x: number; y: number; z: number };

/** The rail that a cell `dir` away (and `dy` higher) holds, if any. */
function railAt(world: BlockReader, x: number, y: number, z: number, dir: number, dy: number): { id: number; info: RailInfo; y: number } | null {
  const [dx, dz] = RAIL_DIRS[dir];
  const id = world.getBlock(x + dx, y + dy, z + dz);
  const info = railInfo(id);
  return info ? { id, info, y: y + dy } : null;
}

/** Which of the rail's exits lead into a rail (the cell is the rail's own). Used to tell whether a rail still has room for another connection. */
function connectedExits(world: BlockReader, c: Cell, info: RailInfo): number[] {
  const out: number[] = [];
  for (const [dir, h] of [[info.dirA, info.hA], [info.dirB, info.hB]] as const) {
    // Past a raised end the next rail is at the same height as the end; past a low end it is at the same level or a block below.
    for (const dy of h === 1 ? [1] : [0, -1]) {
      if (railAt(world, c.x, c.y, c.z, dir, dy)) {
        out.push(dir);
        break;
      }
    }
  }
  return out;
}

/** A rail already joined to two others (or to one, in a way that leaves no room) does not swing round to a new one, unless the new one is already one of its joins. */
function open(world: BlockReader, c: Cell, info: RailInfo, towards: number, towardsY: number): boolean {
  const joined = connectedExits(world, c, info);
  if (joined.length < 2) return true;
  // Is the cell it joins on that side the one in question?
  return joined.includes(towards) && !!railAt(world, c.x, c.y, c.z, towards, towardsY - c.y);
}

/**
 * The shape the rail at `c` should take given the rails around it. `current` (its present shape) is kept when it is still
 * one of the good answers, and breaks ties.
 */
export function wantedShape(world: BlockReader, c: Cell, current: RailShape, powered: boolean): RailShape {
  const links: { dir: number; up: boolean }[] = [];
  for (let dir = 0; dir < 4; dir++) {
    // Same level first, then a block up, then a block down (the lower rail will climb to meet this one).
    for (const dy of [0, 1, -1]) {
      const n = railAt(world, c.x, c.y, c.z, dir, dy);
      if (!n) continue;
      if (!open(world, { x: c.x + RAIL_DIRS[dir][0], y: c.y + dy, z: c.z + RAIL_DIRS[dir][1] }, n.info, OPPOSITE[dir], c.y)) continue;
      links.push({ dir, up: dy === 1 });
      break;
    }
  }
  const cur = SHAPE_EXITS[current];
  if (links.length === 0) {
    // Nothing to join: stay straight, along the axis it already had.
    return current <= 1 ? current : cur.dirs[0] < 2 ? SHAPE_X : SHAPE_Z;
  }
  if (links.length === 1) {
    const l = links[0];
    // A rail with one neighbour lines up with it (climbing if it is a block up).
    return shapeFor(l.dir, OPPOSITE[l.dir], l.up ? l.dir : -1) ?? SHAPE_X;
  }
  const upOf = (d: number): number => (links.some((l) => l.dir === d && l.up) ? d : -1);
  const has = (d: number): boolean => links.some((l) => l.dir === d);
  // Keep what it is if its two ends are both still joined.
  const [c1, c2] = cur.dirs;
  const keep = has(c1) && has(c2);
  let pair: [number, number] | null = null;
  if (keep && !(powered && (current >= 2 && current <= 5))) pair = [c1, c2];
  else {
    // Straight pairs win over turns; powered rails take no turns.
    const straight: [number, number][] = [[0, 1], [2, 3]];
    for (const p of straight) if (has(p[0]) && has(p[1])) { pair = p; break; }
    if (!pair && !powered) {
      const ds = links.map((l) => l.dir);
      pair = [ds[0], ds.find((d) => d !== ds[0] && OPPOSITE[d] !== ds[0]) ?? ds[1]];
    }
    if (!pair) pair = [links[0].dir, OPPOSITE[links[0].dir]];
  }
  const up = upOf(pair[0]) >= 0 ? pair[0] : upOf(pair[1]) >= 0 ? pair[1] : -1;
  // Curves cannot slope.
  return shapeFor(pair[0], pair[1], OPPOSITE[pair[0]] === pair[1] ? up : -1) ?? SHAPE_X;
}

export interface RailEditor extends BlockReader {
  setBlock(x: number, y: number, z: number, id: number): boolean;
}

function reshape(world: RailEditor, c: Cell): boolean {
  const id = world.getBlock(c.x, c.y, c.z);
  const info = railInfo(id);
  if (!info) return false;
  const next = railBlock(wantedShape(world, c, info.shape, info.powered), info.powered);
  if (next === id) return false;
  world.setBlock(c.x, c.y, c.z, next);
  return true;
}

/** Each rail next to (or a block above or below the neighbour of) a cell. */
function neighbours(world: BlockReader, x: number, y: number, z: number): Cell[] {
  const out: Cell[] = [];
  for (let dir = 0; dir < 4; dir++) {
    for (const dy of [-1, 0, 1]) {
      const [dx, dz] = RAIL_DIRS[dir];
      if (isRail(world.getBlock(x + dx, y + dy, z + dz))) out.push({ x: x + dx, y: y + dy, z: z + dz });
    }
  }
  return out;
}

/** A rail was put at (x, y, z): shape it, then let the rails around it turn to meet it. */
export function railPlaced(world: RailEditor, x: number, y: number, z: number): void {
  reshape(world, { x, y, z });
  for (const n of neighbours(world, x, y, z)) reshape(world, n);
}

/** A rail (or what held one up) is gone from (x, y, z): the rails that used to join it straighten out. */
export function railRemoved(world: RailEditor, x: number, y: number, z: number): void {
  for (const n of neighbours(world, x, y, z)) reshape(world, n);
}

/** Rails that run to (x, y, z)'s edge from the given direction, for the cart: the rail one step on from an exit. */
export function nextRail(world: BlockReader, x: number, y: number, z: number, dir: number, h: number): { x: number; y: number; z: number; id: number; info: RailInfo } | null {
  const [dx, dz] = RAIL_DIRS[dir];
  // The exit is `h` blocks up this cell; the next rail's matching end is at the same height, so its cell is at y + h (flat or climbing away) or y + h - 1 (a slope whose top is that end).
  for (const dy of h === 1 ? [1, 0] : [0, -1]) {
    const ny = y + dy;
    const id = world.getBlock(x + dx, ny, z + dz);
    const info = railInfo(id);
    if (!info) continue;
    const back = OPPOSITE[dir];
    // The matching end must be on the edge we come through and at the height we arrive at.
    const arrive = y + h;
    if (info.dirA === back && ny + info.hA === arrive) return { x: x + dx, y: ny, z: z + dz, id, info };
    if (info.dirB === back && ny + info.hB === arrive) return { x: x + dx, y: ny, z: z + dz, id, info };
  }
  return null;
}

export const OPPOSITE_DIR = OPPOSITE;
