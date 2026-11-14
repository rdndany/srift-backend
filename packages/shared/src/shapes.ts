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
  isAnvil,
  ladderInfo,
  lanternInfo,
  leverInfo,
  mountSupport,
  plateInfo,
  slabInfo,
  stairInfo,
  trapdoorInfo,
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

/** Half of the cell (the side `dir` points to), between two heights. */
function half(dir: number, y0: number, y1: number): Box {
  return edge(dir, 0.5, y0, y1);
}

/** A box along one axis: `a0..a1` runs along the panel, `t0..t1` across it. */
function along(alongZ: boolean, a0: number, a1: number, t0: number, t1: number, y0: number, y1: number): Box {
  return alongZ ? [t0, y0, a0, t1, y1, a1] : [a0, y0, t0, a1, y1, t1];
}

/** Do fences and panes join up to this block? */
export function fenceJoins(id: number): boolean {
  if (id === B.FENCE || gateInfo(id) !== null) return true;
  return IS_OPAQUE[id] === 1 && BLOCKS[id].shape === 'cube';
}
export function paneJoins(id: number): boolean {
  if (id === B.PANE) return true;
  return IS_OPAQUE[id] === 1 && BLOCKS[id].shape === 'cube';
}

/** Which of +x, -x, +z, -z a fence or pane reaches toward. */
export function arms(id: number, at: Neighbours): [boolean, boolean, boolean, boolean] {
  const joins = id === B.PANE ? paneJoins : fenceJoins;
  const out: [boolean, boolean, boolean, boolean] = [false, false, false, false];
  for (let d = 0; d < 4; d++) {
    const n = at(DX[d], DZ[d]);
    out[d] = joins(n);
    // A gate only joins a fence along the line it is hinged on.
    const g = gateInfo(n);
    if (g && id === B.FENCE) {
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

function stairBoxes(top: boolean, dir: number): Box[] {
  return top
    ? [[0, 0.5, 0, 1, 1, 1], half(dir, 0, 0.5)]
    : [[0, 0, 0, 1, 0.5, 1], half(dir, 0.5, 1)];
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

/** What a block looks like: the boxes the mesher draws (empty for blocks that are not box shaped). */
export function meshBoxes(id: number, at: Neighbours): readonly Box[] {
  const slab = slabInfo(id);
  if (slab) return [slab.top ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1]];
  const stair = stairInfo(id);
  if (stair) return stairBoxes(stair.top, stair.dir);
  if (doorInfo(id)) return doorBoxes(id);
  if (trapdoorInfo(id)) return trapdoorBoxes(id);
  const lad = ladderInfo(id);
  if (lad) return [edge(lad.facing, 1.5 / 16)];
  if (id === B.FENCE) return fenceBoxes(id, at, false);
  if (gateInfo(id)) return gateBoxes(id, false);
  if (id === B.PANE) return paneBoxes(id, at);
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
export function collisionBoxes(id: number, at: Neighbours): readonly Box[] {
  if (!IS_PARTIAL[id]) return [];
  if (bedInfo(id)) return [[0, 0, 0, 1, BED_HEIGHT, 1]];
  if (id === B.FENCE) return fenceBoxes(id, at, true);
  if (gateInfo(id)) {
    // An open gate lets you through.
    return gateInfo(id)!.open ? [] : gateBoxes(id, true);
  }
  return meshBoxes(id, at);
}

/** Can a body ever reach above its own cell (fences and gates)? Physics looks one layer lower for these. */
export function isTallShape(id: number): boolean {
  return id === B.FENCE || gateInfo(id) !== null;
}
