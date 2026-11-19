import {
  B,
  BED_HEIGHT,
  BLOCKS,
  IS_OPAQUE,
  IS_PARTIAL,
  bedInfo,
  buttonInfo,
  doorInfo,
  gateInfo,
  isFence,
  cakeInfo,
  campfireInfo,
  cocoaInfo,
  isAnvil,
  ladderInfo,
  lanternInfo,
  leverInfo,
  mountSupport,
  plateInfo,
  slabInfo,
  stairInfo,
  trapdoorInfo,
  wallInfo,
  potInfo,
  signInfo,
  chestInfo,
} from './blocks';

/**
 * Boxes for blocks that fill only part of their cell. A box is `[x0, y0, z0, x1, y1, z1]` in cell
 * units (0..1). Collision (`collisionBoxes`) and drawing (`meshBoxes`) share this data, so what you
 * see is what you bump into; the only differences are fences and gates, which are 1.5 blocks tall
 * to stop jumping over, and ladders, which can be walked through.
 */
export type Box = readonly [number, number, number, number, number, number];

/** Reads the block next to this one on the same level: `(dx, dz)` is -1, 0 or 1 on each axis. */
export type Neighbours = (dx: number, dz: number) => number;
/** A neighbour in any direction, including the block above. (0, 0, 0) is the block itself. */
type Around = (dx: number, dy: number, dz: number) => number;

/**
 * A solid opaque cube. Placed above a short block, it is drawn and collided lower so its underside
 * meets that block. A stack of cubes drops by the same amount, so the pile stays flush.
 */
export function isSeatCube(id: number): boolean {
  const d = BLOCKS[id];
  return d.shape === 'cube' && d.solid && d.opaque && !d.liquid;
}

/** Wool, moss and pale moss. A carpet is one pixel thick. */
export function isCarpet(id: number): boolean {
  return BLOCKS[id].name.endsWith('_carpet');
}

const CARPET_TOP = 1 / 16;

/**
 * The top of a short block a full cube can rest on, in cell units, or null when this block is not
 * such a support. A top slab, a stair and a full cube already reach the top of the cell.
 */
export function supportTop(id: number): number | null {
  if (isCarpet(id) || id === B.LILY_PAD) return CARPET_TOP;
  const slab = slabInfo(id);
  if (slab) return slab.top ? null : 0.5;
  const plate = plateInfo(id);
  if (plate) return (plate.on ? 0.5 : 1) / 16;
  const trap = trapdoorInfo(id);
  if (trap && !trap.open && !trap.top) return 3 / 16;
  if (cakeInfo(id)) return 8 / 16;
  if (campfireInfo(id)) return 7 / 16;
  if (bedInfo(id)) return BED_HEIGHT;
  if (id === B.ENCHANTING_TABLE) return 12 / 16;
  if (id === B.GRINDSTONE) return 13 / 16;
  if (potInfo(id)) return 8 / 16;
  return null;
}

/**
 * How many cubes high a pile can be and still sit on the short block under it. Without a limit, a carpet buried
 * in a cave would lower every block of rock above it up to the surface, and every collision test would walk the
 * whole column down.
 */
export const MAX_SEAT_PILE = 8;

/**
 * How far this cube drops, in blocks, so it sits on the short block under it. 0 when it stays in its cell.
 * `below(1)` is the block directly underneath.
 */
export function seatDrop(id: number, below: (dy: number) => number): number {
  if (!isSeatCube(id)) return 0;
  for (let dy = 1; dy <= MAX_SEAT_PILE; dy++) {
    const b = below(dy);
    const top = supportTop(b);
    if (top !== null) return 1 - top;
    if (!isSeatCube(b)) return 0;
  }
  return 0;
}

/** True when this cube rests on a short block and is drawn lower than its cell. */
export function sitsOnSlab(id: number, below: (dy: number) => number): boolean {
  return seatDrop(id, below) > 0;
}

/** The cube's box after it has dropped `drop` blocks: the bottom meets the support, and the cube is still one block tall. */
export function seatedBox(drop: number): readonly [number, number, number, number, number, number] {
  return [0, -drop, 0, 1, 1 - drop, 1];
}

/** The same four directions as `BED_DIRS`: +x, -x, +z, -z. */
const DX = [1, -1, 0, 0] as const;
const DZ = [0, 0, 1, -1] as const;

/**
 * Where an opened door ends up: it swings a quarter turn about its hinge. A closed door stands on the edge
 * nearest the player who placed it, hinged on their left (as in the original), so it opens toward the left.
 */
export const OPEN_DOOR_EDGE = [2, 3, 1, 0] as const;

/**
 * Which way a door's panel runs and where its hinge is, for drawing the handle on the free end.
 * `alongZ`: the panel runs along z (it stands on an x edge); `hingeAtOne`: the hinge is at the high end of that axis.
 */
export function doorHinge(id: number): { alongZ: boolean; hingeAtOne: boolean } | null {
  const d = doorInfo(id);
  if (!d) return null;
  const closedEdge = d.facing;
  const openEdge = OPEN_DOOR_EDGE[d.facing];
  const panel = d.open ? openEdge : closedEdge;
  const other = d.open ? closedEdge : openEdge; // the edge sharing the hinge corner
  return { alongZ: panel < 2, hingeAtOne: other === 0 || other === 2 };
}

const T = 3 / 16;
const POST_LO = 6 / 16;
const POST_HI = 10 / 16;

/** A slab of the cell against one edge. */
function edge(dir: number, thick: number, y0 = 0, y1 = 1): Box {
  switch (dir) {
    case 0:
      return [1 - thick, y0, 0, 1, y1, 1];
    case 1:
      return [0, y0, 0, thick, y1, 1];
    case 2:
      return [0, y0, 1 - thick, 1, y1, 1];
    default:
      return [0, y0, 0, 1, y1, thick];
  }
}

/** A box along one axis: `a0..a1` runs along the panel, `t0..t1` across it. */
function along(alongZ: boolean, a0: number, a1: number, t0: number, t1: number, y0: number, y1: number): Box {
  return alongZ ? [t0, y0, a0, t1, y1, a1] : [a0, y0, t0, a1, y1, t1];
}

/** Do walls join up to this block? Walls, fences, gates, panes, and full solid blocks. */
export function wallJoins(id: number): boolean {
  if (wallInfo(id) || isFence(id) || gateInfo(id) !== null || BLOCKS[id].shape === 'pane') return true;
  return IS_OPAQUE[id] === 1 && BLOCKS[id].shape === 'cube';
}

/** A block above a wall that makes the post stay up: another wall, or a full solid cube. */
function wallRaised(above: number): boolean {
  if (wallInfo(above)) return true;
  return IS_OPAQUE[above] === 1 && BLOCKS[above].shape === 'cube';
}

const WALL_LOW = 14 / 16;
const WALL_POST: Box = [4 / 16, 0, 4 / 16, 12 / 16, 1.5, 12 / 16];

/** One arm from the post out to the cell edge. `h` is 14/16 beside another low wall, and 1 beside a solid block. */
function wallArm(dir: number, h: number): Box {
  const alongZ = dir >= 2;
  const pos = dir % 2 === 0;
  const a0 = pos ? 12 / 16 : 0;
  const a1 = pos ? 1 : 4 / 16;
  return along(alongZ, a0, a1, 5 / 16, 11 / 16, 0, h);
}

/**
 * A wall's post and arms, the way Minecraft builds them.
 * A straight run (exactly two opposite neighbours, nothing above) is one low beam and has no post.
 * A lone wall, a corner, a T and a cross keep the post. The post also stays when a wall or a full
 * block sits on top. An arm is full height when it meets a solid block, a fence, a pane or a gate,
 * and when both this wall and the neighbouring wall are raised. Otherwise the arm stays low.
 */
function wallBoxes(read: Around): Box[] {
  const conn = [0, 1, 2, 3].map((d) => wallJoins(read(DX[d], 0, DZ[d])));
  const straightX = conn[0] && conn[1] && !conn[2] && !conn[3];
  const straightZ = conn[2] && conn[3] && !conn[0] && !conn[1];
  const straight = straightX || straightZ;
  const up = !straight || wallRaised(read(0, 1, 0));
  const tall = (d: number): boolean => {
    const n = read(DX[d], 0, DZ[d]);
    if (!wallInfo(n)) return true;
    return up && neighborRaised(read, DX[d], DZ[d]);
  };
  if (straight && !up) {
    const h = tall(straightX ? 0 : 2) || tall(straightX ? 1 : 3) ? 1 : WALL_LOW;
    return straightX ? [[0, 0, 5 / 16, 1, h, 11 / 16]] : [[5 / 16, 0, 0, 11 / 16, h, 1]];
  }
  const out: Box[] = [];
  if (up) out.push(WALL_POST);
  for (let d = 0; d < 4; d++) {
    if (conn[d]) out.push(wallArm(d, tall(d) ? 1 : WALL_LOW));
  }
  return out;
}

/** Whether the wall at (ox, oz), measured from the wall being shaped, keeps its post. */
function neighborRaised(read: Around, ox: number, oz: number): boolean {
  const conn = [0, 1, 2, 3].map((d) => wallJoins(read(ox + DX[d], 0, oz + DZ[d])));
  const straight = (conn[0] && conn[1] && !conn[2] && !conn[3]) || (conn[2] && conn[3] && !conn[0] && !conn[1]);
  return !straight || wallRaised(read(ox, 1, oz));
}

/** Do fences and panes join up to this block? They also meet a wall. */
export function fenceJoins(id: number): boolean {
  if (isFence(id) || gateInfo(id) !== null || wallInfo(id)) return true;
  return IS_OPAQUE[id] === 1 && BLOCKS[id].shape === 'cube';
}
export function paneJoins(id: number): boolean {
  if (BLOCKS[id].shape === 'pane' || wallInfo(id)) return true;
  return IS_OPAQUE[id] === 1 && BLOCKS[id].shape === 'cube';
}

/** Which of +x, -x, +z, -z a fence or pane reaches toward. */
export function arms(id: number, at: Neighbours): [boolean, boolean, boolean, boolean] {
  const joins = BLOCKS[id].shape === 'pane' ? paneJoins : fenceJoins;
  const out: [boolean, boolean, boolean, boolean] = [false, false, false, false];
  for (let d = 0; d < 4; d++) {
    const n = at(DX[d], DZ[d]);
    out[d] = joins(n);
    // A gate only joins a fence along the line it is hinged on.
    const g = gateInfo(n);
    if (g && isFence(id)) {
      const alongX = g.facing >= 2;
      out[d] = alongX === (d < 2);
    }
  }
  return out;
}

function fenceBoxes(id: number, at: Neighbours, tall: boolean): Box[] {
  const top = tall ? 1.5 : 15 / 16;
  const out: Box[] = [[POST_LO, 0, POST_LO, POST_HI, tall ? 1.5 : 1, POST_HI]];
  const a = arms(id, at);
  for (let d = 0; d < 4; d++) {
    if (!a[d]) continue;
    const alongZ = d >= 2;
    const pos = d % 2 === 0;
    const a0 = pos ? POST_HI : 0;
    const a1 = pos ? 1 : POST_LO;
    if (tall) out.push(along(alongZ, a0, a1, 7 / 16, 9 / 16, 0, 1.5));
    else {
      out.push(along(alongZ, a0, a1, 7 / 16, 9 / 16, 6 / 16, 9 / 16));
      out.push(along(alongZ, a0, a1, 7 / 16, 9 / 16, 12 / 16, top));
    }
  }
  return out;
}

function paneBoxes(id: number, at: Neighbours): Box[] {
  const out: Box[] = [[7 / 16, 0, 7 / 16, 9 / 16, 1, 9 / 16]];
  const a = arms(id, at);
  const any = a[0] || a[1] || a[2] || a[3];
  for (let d = 0; d < 4; d++) {
    if (!a[d] && any) continue;
    const alongZ = d >= 2;
    const pos = d % 2 === 0;
    out.push(along(alongZ, pos ? 9 / 16 : 0, pos ? 1 : 7 / 16, 7 / 16, 9 / 16, 0, 1));
  }
  return out;
}

function gateBoxes(id: number, tall: boolean): Box[] {
  const g = gateInfo(id)!;
  const alongZ = g.facing < 2; // the panel is perpendicular to the way it blocks
  const top = tall ? 1.5 : 1;
  if (tall) {
    if (g.open) {
      return [along(alongZ, 0, 2 / 16, 7 / 16, 9 / 16, 0, top), along(alongZ, 14 / 16, 1, 7 / 16, 9 / 16, 0, top)];
    }
    return [along(alongZ, 0, 1, 7 / 16, 9 / 16, 0, top)];
  }
  const out: Box[] = [];
  for (const [a0, a1] of [
    [0, 2 / 16],
    [14 / 16, 1],
  ] as const) {
    out.push(along(alongZ, a0, a1, 6 / 16, 10 / 16, 5 / 16, 1));
  }
  if (!g.open) {
    out.push(along(alongZ, 2 / 16, 14 / 16, 7 / 16, 9 / 16, 6 / 16, 9 / 16));
    out.push(along(alongZ, 2 / 16, 14 / 16, 7 / 16, 9 / 16, 12 / 16, 15 / 16));
    out.push(along(alongZ, 7 / 16, 9 / 16, 7 / 16, 9 / 16, 6 / 16, 15 / 16));
  } else {
    // Both leaves swing out along the way the gate faces.
    const pos = g.facing % 2 === 0;
    const t0 = pos ? 9 / 16 : 1 / 16;
    const t1 = pos ? 15 / 16 : 7 / 16;
    for (const [a0, a1] of [
      [0, 2 / 16],
      [14 / 16, 1],
    ] as const) {
      out.push(along(alongZ, a0, a1, t0, t1, 6 / 16, 9 / 16));
      out.push(along(alongZ, a0, a1, t0, t1, 12 / 16, 15 / 16));
      const s0 = pos ? 13 / 16 : 1 / 16;
      out.push(along(alongZ, a0, a1, s0, s0 + 2 / 16, 6 / 16, 15 / 16));
    }
  }
  return out;
}

/** One turn counter-clockwise, matching Minecraft's stair `rotateYCCW`: +x, -z, -x, +z. */
const STAIR_CCW = [3, 2, 0, 1] as const;
const STAIR_OPP = [1, 0, 3, 2] as const;
/** How many of those turns take the east-facing model around to this direction. */
const STAIR_TURNS = [0, 2, 3, 1] as const;

/**
 * The corner a stair takes from the stairs of the same material and half beside it.
 * A stair in front, facing across, makes an outer corner. One behind makes an inner corner.
 * A stair already running the same way on that side keeps this one straight, so a flight is not nicked.
 */
function stairCorner(dir: number, top: boolean, mat: number, at: Neighbours): 'straight' | 'inner_left' | 'inner_right' | 'outer_left' | 'outer_right' {
  const axis = dir < 2 ? 0 : 1;
  const front = stairInfo(at(DX[dir], DZ[dir]));
  if (front && front.mat === mat && front.top === top && (front.dir < 2 ? 0 : 1) !== axis && stairOpen(at, STAIR_OPP[front.dir], dir, top, mat)) {
    return front.dir === STAIR_CCW[dir] ? 'outer_left' : 'outer_right';
  }
  const back = STAIR_OPP[dir];
  const behind = stairInfo(at(DX[back], DZ[back]));
  if (behind && behind.mat === mat && behind.top === top && (behind.dir < 2 ? 0 : 1) !== axis && stairOpen(at, behind.dir, dir, top, mat)) {
    return behind.dir === STAIR_CCW[dir] ? 'inner_left' : 'inner_right';
  }
  return 'straight';
}

/** The stair on `side` is not already part of this flight. */
function stairOpen(at: Neighbours, side: number, dir: number, top: boolean, mat: number): boolean {
  const other = stairInfo(at(DX[side], DZ[side]));
  return !other || other.dir !== dir || other.top !== top || other.mat !== mat;
}

/**
 * East-facing, bottom half. The tall side is +x. Left is -z. An outer corner keeps one quarter of the step;
 * an inner corner keeps three. The other directions are this model turned.
 */
const EAST_STAIR: Record<'straight' | 'inner_left' | 'inner_right' | 'outer_left' | 'outer_right', readonly Box[]> = {
  straight: [
    [0, 0, 0, 1, 0.5, 1],
    [0.5, 0.5, 0, 1, 1, 1],
  ],
  outer_left: [
    [0, 0, 0, 1, 0.5, 1],
    [0.5, 0.5, 0, 1, 1, 0.5],
  ],
  outer_right: [
    [0, 0, 0, 1, 0.5, 1],
    [0.5, 0.5, 0.5, 1, 1, 1],
  ],
  inner_left: [
    [0, 0, 0, 1, 0.5, 1],
    [0.5, 0.5, 0, 1, 1, 1],
    [0, 0.5, 0, 0.5, 1, 0.5],
  ],
  inner_right: [
    [0, 0, 0, 1, 0.5, 1],
    [0.5, 0.5, 0, 1, 1, 1],
    [0, 0.5, 0.5, 0.5, 1, 1],
  ],
};

function flipY(box: Box): Box {
  return [box[0], 1 - box[4], box[2], box[3], 1 - box[1], box[5]];
}

function stairBoxes(top: boolean, dir: number, mat: number, at: Neighbours): Box[] {
  const shape = stairCorner(dir, top, mat, at);
  const turns = STAIR_TURNS[dir] ?? 0;
  return EAST_STAIR[shape].map((box) => {
    const turned = turnY(box, turns);
    return top ? flipY(turned) : turned;
  });
}

/**
 * Whether the block on `side` (+x, -x, +z, -z) already fills the rectangle of a stair face, so that face is not drawn.
 * `a0..a1` runs along z for an x side and along x for a z side.
 */
export function stairFaceCovered(neighbor: number, side: number, y0: number, y1: number, a0: number, a1: number, at: Neighbours): boolean {
  if (IS_OPAQUE[neighbor] === 1 && BLOCKS[neighbor].shape === 'cube') return true;
  const dx = DX[side] ?? 0;
  const dz = DZ[side] ?? 0;
  const boxes = meshBoxes(neighbor, (ox, oz) => at(ox + dx, oz + dz));
  for (const b of boxes) {
    if (b[1] > y0 + 1e-4 || b[4] < y1 - 1e-4) continue;
    if (side === 0 && b[0] <= 1e-4 && b[2] <= a0 + 1e-4 && b[5] >= a1 - 1e-4) return true;
    if (side === 1 && b[3] >= 1 - 1e-4 && b[2] <= a0 + 1e-4 && b[5] >= a1 - 1e-4) return true;
    if (side === 2 && b[2] <= 1e-4 && b[0] <= a0 + 1e-4 && b[3] >= a1 - 1e-4) return true;
    if (side === 3 && b[5] >= 1 - 1e-4 && b[0] <= a0 + 1e-4 && b[3] >= a1 - 1e-4) return true;
  }
  return false;
}

function doorBoxes(id: number): Box[] {
  const d = doorInfo(id)!;
  return [edge(d.open ? OPEN_DOOR_EDGE[d.facing] : d.facing, T)];
}

function trapdoorBoxes(id: number): Box[] {
  const t = trapdoorInfo(id)!;
  if (t.open) return [edge(t.facing, T)];
  return [t.top ? [0, 1 - T, 0, 1, 1, 1] : [0, 0, 0, 1, T, 1]];
}

/**
 * Boxes drawn for something stuck to the floor, given for the floor (up is +y) and turned onto the wall
 * block in direction `face - 1`. On a wall the box's old x runs up and down.
 */
function mounted(face: number, boxes: readonly Box[]): readonly Box[] {
  if (face === 0) return boxes;
  const [sx, , sz] = mountSupport(face);
  return boxes.map(([x0, y0, z0, x1, y1, z1]): Box => {
    if (sx !== 0) return sx < 0 ? [y0, x0, z0, y1, x1, z1] : [1 - y1, x0, z0, 1 - y0, x1, z1];
    return sz < 0 ? [z0, x0, y0, z1, x1, y1] : [z0, x0, 1 - y1, z1, x1, 1 - y0];
  });
}

/** A lever: a small base on its support and a stick that leans one way off and the other on. */
function leverBoxes(face: number, on: boolean): readonly Box[] {
  const p = 1 / 16;
  const stick: Box[] = [
    [5 * p, 3 * p, 7 * p, 7 * p, 6 * p, 9 * p],
    [4 * p, 6 * p, 7 * p, 6 * p, 9 * p, 9 * p],
    [3 * p, 9 * p, 7 * p, 5 * p, 12 * p, 9 * p],
  ];
  const lean = on ? stick.map(([x0, y0, z0, x1, y1, z1]): Box => [1 - x1, y0, z0, 1 - x0, y1, z1]) : stick;
  return mounted(face, [[4 * p, 0, 5 * p, 12 * p, 3 * p, 11 * p], ...lean]);
}

/**
 * A lantern: a lit cage with a lid and a ring on top. Standing, it rests on the floor of its cell; hanging, it is raised
 * and a hook reaches the top of the cell (where a chain, or the block above, holds it).
 */
function lanternBoxes(hanging: boolean): readonly Box[] {
  const p = 1 / 16;
  const up = hanging ? 2 : 0;
  const boxes: Box[] = [
    [5 * p, up * p, 5 * p, 11 * p, (7 + up) * p, 11 * p],
    [6 * p, (7 + up) * p, 6 * p, 10 * p, (9 + up) * p, 10 * p],
    [6 * p, (9 + up) * p, 7.5 * p, 10 * p, (11 + up) * p, 8.5 * p],
  ];
  if (hanging) boxes.push([7 * p, 13 * p, 7.5 * p, 9 * p, 1, 8.5 * p]);
  return boxes;
}

/** A cake: short, inset from the edges, and narrower once a bite is taken off the west side. */
function cakeBoxes(bites: number): Box[] {
  const p = 1 / 16;
  return [[(1 + bites * 2) * p, 0, p, 15 * p, 8 * p, 15 * p]];
}

/** A cocoa pod against the log it faces. It gets bigger as it ripens. */
function cocoaBoxes(facing: number, stage: number): Box[] {
  const p = 1 / 16;
  const thick = [4, 6, 7][stage]! * p;
  const inset = [6, 4, 3][stage]! * p;
  const y0 = [6, 4, 3][stage]! * p;
  const y1 = [11, 13, 14][stage]! * p;
  const [x0, , z0, x1, , z1] = edge(facing, thick, y0, y1);
  if (facing < 2) return [[x0, y0, inset, x1, y1, 1 - inset]];
  return [[inset, y0, z0, 1 - inset, y1, z1]];
}

/** Turn a box around the middle of the cell. One turn faces it from +x toward +z. */
function turnY(box: Box, turns: number): Box {
  let [x0, y0, z0, x1, y1, z1] = box;
  for (let i = 0; i < (turns & 3); i++) {
    const nx0 = z0;
    const nz0 = 1 - x1;
    const nx1 = z1;
    const nz1 = 1 - x0;
    x0 = Math.min(nx0, nx1);
    x1 = Math.max(nx0, nx1);
    z0 = Math.min(nz0, nz1);
    z1 = Math.max(nz0, nz1);
  }
  return [x0, y0, z0, x1, y1, z1];
}

/** A sign: a post and a board on the floor, or just the board when it hangs on a wall. */
function signBoxes(wall: boolean, facing: number): Box[] {
  const p = 1 / 16;
  const standing: Box[] = [
    [7 * p, 0, 7 * p, 9 * p, 9 * p, 9 * p],
    [7 * p, 7 * p, p, 9 * p, 15 * p, 15 * p],
  ];
  const hung: Box[] = [[14 * p, 4 * p, p, 1, 14 * p, 15 * p]];
  const turns = [0, 2, 3, 1][facing] ?? 0;
  return (wall ? hung : standing).map((b) => turnY(b, turns));
}

/**
 * A chest, built facing +z and then turned. A single chest sits in from the sides. A double chest's half
 * runs into the shared face (left meets the block on its right, right meets the block on its left) and the
 * latch sits on that seam, so the two halves read as one chest.
 */
function chestBoxes(dir: number, half: number): Box[] {
  const p = 1 / 16;
  const yBody = 10 * p;
  const yLid0 = 9 * p;
  const yLid1 = 14 * p;
  let body: Box;
  let lid: Box;
  let latch: Box;
  if (half === 0) {
    body = [p, 0, p, 15 * p, yBody, 15 * p];
    lid = [p, yLid0, p, 15 * p, yLid1, 15 * p];
    latch = [7 * p, 7 * p, 15 * p, 9 * p, 11 * p, 1];
  } else if (half === 1) {
    // Left half: outer edge is -x once the model faces +z, so the shared face is +x.
    body = [p, 0, p, 1, yBody, 15 * p];
    lid = [p, yLid0, p, 1, yLid1, 15 * p];
    latch = [14 * p, 7 * p, 15 * p, 1, 11 * p, 1];
  } else {
    body = [0, 0, p, 15 * p, yBody, 15 * p];
    lid = [0, yLid0, p, 15 * p, yLid1, 15 * p];
    latch = [0, 7 * p, 15 * p, 2 * p, 11 * p, 1];
  }
  const turns = [1, 3, 0, 2][dir] ?? 0;
  return [body, lid, latch].map((b) => turnY(b, turns));
}

/** A clay pot: a foot, a neck and a rim. */
function potBoxes(): Box[] {
  const p = 1 / 16;
  return [
    [5 * p, 0, 5 * p, 11 * p, 4 * p, 11 * p],
    [6 * p, 4 * p, 6 * p, 10 * p, 6 * p, 10 * p],
    [4 * p, 6 * p, 4 * p, 12 * p, 8 * p, 12 * p],
  ];
}

/** What a block looks like: the boxes the mesher draws (empty for blocks that are not box shaped). */
export function meshBoxes(id: number, at: Neighbours, column?: Around): readonly Box[] {
  const slab = slabInfo(id);
  if (slab) return [slab.top ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1]];
  const stair = stairInfo(id);
  if (stair) return stairBoxes(stair.top, stair.dir, stair.mat, at);
  if (doorInfo(id)) return doorBoxes(id);
  if (trapdoorInfo(id)) return trapdoorBoxes(id);
  const lad = ladderInfo(id);
  if (lad) return [edge(lad.facing, 1.5 / 16)];
  const pod = cocoaInfo(id);
  if (pod) return cocoaBoxes(pod.facing, pod.stage);
  const cake = cakeInfo(id);
  if (cake) return cakeBoxes(cake.bites);
  if (campfireInfo(id)) return [[0, 0, 0, 1, 7 / 16, 1]];
  if (wallInfo(id)) {
    const read: Around = column ?? ((dx, dy, dz) => (dy !== 0 ? 0 : dx === 0 && dz === 0 ? id : at(dx, dz)));
    return wallBoxes(read);
  }
  if (isFence(id)) return fenceBoxes(id, at, false);
  if (gateInfo(id)) return gateBoxes(id, false);
  if (BLOCKS[id].shape === 'pane') return paneBoxes(id, at);
  const sign = signInfo(id);
  if (sign) return signBoxes(sign.wall, sign.facing);
  if (potInfo(id)) return potBoxes();
  const chest = chestInfo(id);
  if (chest) return chestBoxes(chest.dir, chest.half);
  const lever = leverInfo(id);
  if (lever) return leverBoxes(lever.face, lever.on);
  const button = buttonInfo(id);
  if (button) return mounted(button.face, [[5 / 16, 0, 6 / 16, 11 / 16, (button.on ? 1 : 2) / 16, 10 / 16]]);
  const plate = plateInfo(id);
  if (plate) return [[1 / 16, 0, 1 / 16, 15 / 16, (plate.on ? 0.5 : 1) / 16, 15 / 16]];
  if (id === B.ENCHANTING_TABLE) return [[0, 0, 0, 1, 12 / 16, 1]];
  if (id === B.GRINDSTONE) {
    // A stone wheel between two wooden supports.
    return [
      [1 / 16, 0, 5 / 16, 4 / 16, 13 / 16, 11 / 16],
      [12 / 16, 0, 5 / 16, 15 / 16, 13 / 16, 11 / 16],
      [4 / 16, 3 / 16, 3 / 16, 12 / 16, 13 / 16, 13 / 16],
    ];
  }
  if (isAnvil(id)) {
    // A foot, a narrow waist and a wide face to hammer on.
    return [
      [2 / 16, 0, 2 / 16, 14 / 16, 4 / 16, 14 / 16],
      [4 / 16, 4 / 16, 4 / 16, 12 / 16, 10 / 16, 12 / 16],
      [0, 10 / 16, 1 / 16, 1, 1, 15 / 16],
    ];
  }
  const lantern = lanternInfo(id);
  if (lantern) return lanternBoxes(lantern.hanging);
  if (id === B.CHAIN) {
    // Two thin plates crossed, the way links turn a quarter between one and the next.
    return [
      [6 / 16, 0, 7.5 / 16, 10 / 16, 1, 8.5 / 16],
      [7.5 / 16, 0, 6 / 16, 8.5 / 16, 1, 10 / 16],
    ];
  }
  return [];
}

/** What a body bumps into. Fences and gates are 1.5 blocks tall; ladders and anything else non-solid have none. */
export function collisionBoxes(id: number, at: Neighbours, column?: Around): readonly Box[] {
  if (!IS_PARTIAL[id]) return [];
  if (bedInfo(id)) return [[0, 0, 0, 1, BED_HEIGHT, 1]];
  if (isFence(id)) return fenceBoxes(id, at, true);
  if (gateInfo(id)) {
    // An open gate lets you through.
    return gateInfo(id)!.open ? [] : gateBoxes(id, true);
  }
  return meshBoxes(id, at, column);
}

/** Can a body ever reach above its own cell (fences and gates)? Physics looks one layer lower for these. */
export function isTallShape(id: number): boolean {
  return isFence(id) || gateInfo(id) !== null || wallInfo(id) !== null;
}
