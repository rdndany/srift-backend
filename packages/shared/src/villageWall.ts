import { B, ladderId, slabId, woolId } from './blocks';
import type { Put } from './villageBuilders';

/**
 * The wall of Dawnwatch: a palisade of spruce logs on a stone footing, with stakes along its top, and a wooden walkway behind
 * it. Four corner towers, a big open gatehouse on the south, east and west, and a sealed north gate that gives onto the
 * Elder's garden. Like the rest of the village it is built in world blocks round the village's edge (x and z from `FIRST` to
 * `LAST`); every builder works in the wall's own coordinates, so the four sides share their code:
 *
 *   u runs along the wall (from the middle of it: the gates are at u = 0),
 *   v runs across it: 0 is the palisade itself, negative is inside the village, positive is outside (not built on).
 */
export const WALL_FIRST = -38;
export const WALL_LAST = 37;

export type WallSide = 'N' | 'E' | 'S' | 'W';
export type CornerId = 'NW' | 'NE' | 'SW' | 'SE';

interface Frame {
  /** World block of the wall cell (u, v). */
  at(u: number, v: number): [number, number];
  /** The world step of one block along u, and across v. */
  du: [number, number];
  dv: [number, number];
}

const FRAMES: Record<WallSide, Frame> = {
  E: { at: (u, v) => [WALL_LAST + v, u], du: [0, 1], dv: [1, 0] },
  W: { at: (u, v) => [WALL_FIRST - v, u], du: [0, 1], dv: [-1, 0] },
  S: { at: (u, v) => [u, WALL_LAST + v], du: [1, 0], dv: [0, 1] },
  N: { at: (u, v) => [u, WALL_FIRST - v], du: [1, 0], dv: [0, -1] },
};

/** The index (into `BED_DIRS`: 0 = +x, 1 = -x, 2 = +z, 3 = -z) of a world step. */
const dirIndex = (dx: number, dz: number): number => (dx > 0 ? 0 : dx < 0 ? 1 : dz > 0 ? 2 : 3);
const TORCH_ON = [B.TORCH_PX, B.TORCH_NX, B.TORCH_PZ, B.TORCH_NZ] as const;
const MAT_BRICK = 4;
/** How long a tower (or a gate tower) is, along the wall, and how far it reaches in. */
const TOWER = 5;
const GATE_DEEP = 4;

/** The halves of the opening of each gate: the south one is the big one. */
export const GATES: Readonly<Record<WallSide, { half: number; open: boolean }>> = {
  S: { half: 3, open: true },
  E: { half: 2, open: true },
  W: { half: 2, open: true },
  N: { half: 1, open: false },
};

type Hash = (a: number, b: number) => number;

/** The footing: cobblestone, a little mossy. */
const footing = (hash: Hash, x: number, z: number): number => (hash(x, z) < 0.18 ? B.MOSSY_COBBLE : B.COBBLE);

/** Everything: the palisades, the towers and the gates. `hash` is a deterministic scatter for the mossy stones. */
export function buildWall(put: Put, hash: Hash): void {
  for (const side of ['N', 'E', 'S', 'W'] as const) {
    palisade(put, side, hash);
    gatehouse(put, side, hash);
  }
  for (const corner of ['NW', 'NE', 'SW', 'SE'] as const) cornerTower(put, corner, hash);
}

/** The palisade and its walkway between two towers, leaving the gate's span to the gatehouse. */
function palisade(put: Put, side: WallSide, hash: Hash): void {
  const f = FRAMES[side];
  const gate = GATES[side].half + TOWER;
  const dir = dirIndex(f.dv[0], f.dv[1]);
  for (let u = WALL_FIRST + TOWER; u <= WALL_LAST - TOWER; u++) {
    if (Math.abs(u) <= gate) continue;
    const [x, z] = f.at(u, 0);
    // The logs stand on a footing two blocks high, the stakes on top (every third one longer).
    put(x, 0, z, B.COBBLE);
    put(x, 1, z, footing(hash, x, z));
    put(x, 2, z, footing(hash, x + 7, z));
    for (let y = 3; y <= 5; y++) put(x, y, z, B.SPRUCE_LOG);
    put(x, 6, z, B.FENCE);
    if (u % 3 === 0) put(x, 7, z, B.FENCE);
    // Behind it, a walkway two planks wide on log posts, with a rail on its inner edge.
    for (const v of [-1, -2]) {
      const [wx, wz] = f.at(u, v);
      put(wx, 3, wz, B.PLANKS);
    }
    const [rx, rz] = f.at(u, -2);
    put(rx, 4, rz, B.FENCE);
    // (Not in front of a tower's door, which is the first block after the tower.)
    if (u % 4 === 0 && u > WALL_FIRST + TOWER && u < WALL_LAST - TOWER) for (let y = 1; y <= 2; y++) put(rx, y, rz, B.SPRUCE_LOG);
    // A torch on the logs every sixth block.
    if (u % 6 === 0) {
      const [tx, tz] = f.at(u, -1);
      put(tx, 5, tz, TORCH_ON[dir]);
    }
  }
}

/**
 * A gatehouse in the wall: a tower on each side of the way through (a stone footing, timber above, stone on top with
 * battlements, a pole and a red flag, a ladder up the village side), and over the way a lintel with the gate's banner.
 * The open gates have a raised portcullis; the sealed one is shut with great timber doors.
 */
function gatehouse(put: Put, side: WallSide, hash: Hash): void {
  const f = FRAMES[side];
  const { half, open } = GATES[side];
  const alongV = dirIndex(f.dv[0], f.dv[1]);
  const at = (u: number, v: number, dy: number, id: number): void => {
    const [x, z] = f.at(u, v);
    put(x, dy, z, id);
  };

  for (const sgn of [-1, 1]) {
    const u0 = sgn > 0 ? half + 1 : -(half + TOWER);
    const u1 = sgn > 0 ? half + TOWER : -(half + 1);
    const mid = sgn * (half + 1 + (TOWER >> 1));
    for (let u = u0; u <= u1; u++) {
      for (let v = -(GATE_DEEP - 1); v <= 0; v++) {
        const edgeU = u === u0 || u === u1;
        const edgeV = v === 0 || v === -(GATE_DEEP - 1);
        const [x, z] = f.at(u, v);
        put(x, 0, z, B.COBBLE);
        for (let y = 1; y <= 8; y++) {
          const post = edgeU && edgeV;
          let id: number;
          if (y <= 3) id = post ? B.COBBLE : footing(hash, x, z + y * 3);
          else if (y === 8) id = B.STONE_BRICKS;
          else if (post || y === 5) id = B.SPRUCE_LOG;
          else id = B.PLANKS;
          at(u, v, y, id);
        }
        // Battlements: every other block of the edge, and a tall post with a torch at each corner.
        if (edgeU || edgeV) {
          if (edgeU && edgeV) {
            at(u, v, 9, B.COBBLE);
            at(u, v, 10, B.COBBLE);
            at(u, v, 11, B.TORCH);
          } else if ((u + v) % 2 === 0) at(u, v, 9, B.COBBLE);
        }
      }
    }
    // The flag: a pole in the middle of the roof, and red cloth flying toward the way through.
    for (let y = 9; y <= 13; y++) at(mid, -1, y, B.FENCE);
    for (const k of [1, 2, 3]) {
      at(mid - sgn * k, -1, 13, woolId(14));
      if (k < 3) at(mid - sgn * k, -1, 12, woolId(14));
    }
    // A banner in the timber of the face that looks out, and one on the face that looks in.
    for (let y = 4; y <= 7; y++) {
      at(mid, 0, y, woolId(14));
      at(mid, -(GATE_DEEP - 1), y, woolId(14));
    }
    for (let y = 6; y <= 7; y++) {
      at(mid - 1, 0, y, woolId(4));
      at(mid + 1, 0, y, woolId(4));
    }
    // The ladder up the village side, where the battlements leave a gap.
    for (let y = 1; y <= 9; y++) at(mid + sgn * 1, -GATE_DEEP, y, ladderId(alongV));
    // The torches in the way through (hung on the tower's side).
    for (const v of [-1, -2]) at(sgn * half, v, 3, TORCH_ON[dirIndex(f.du[0] * sgn, f.du[1] * sgn)]);
  }
  // The gap in the battlements over the ladders is the top rung's own block: nothing is built there.
  for (const sgn of [-1, 1]) {
    const mid = sgn * (half + 1 + (TOWER >> 1));
    at(mid + sgn * 1, -(GATE_DEEP - 1), 9, B.AIR);
  }

  // Over the way through: a stone beam, a timber beam and the stone roof of the gatehouse, joining the two towers.
  for (let u = -half; u <= half; u++) {
    for (let v = -(GATE_DEEP - 1); v <= 0; v++) {
      at(u, v, 6, B.STONE_BRICKS);
      at(u, v, 7, v === 0 || v === -(GATE_DEEP - 1) ? B.SPRUCE_LOG : B.PLANKS);
      at(u, v, 8, B.STONE_BRICKS);
      const edgeV = v === 0 || v === -(GATE_DEEP - 1);
      if (edgeV && (u + v) % 2 === 0) at(u, v, 9, B.COBBLE);
    }
  }
  // The gate's colours over the arch, between two lamps of glowstone.
  for (let u = -1; u <= 1; u++) for (let y = 6; y <= 7; y++) at(u, 0, y, woolId(u === 0 ? 4 : 14));
  for (const u of [-half, half]) {
    at(u, 0, 6, B.GLOWSTONE);
    at(u, -(GATE_DEEP - 1), 6, B.GLOWSTONE);
  }
  // The arch's shoulders: top slabs in the upper corners of the way.
  for (const u of [-half, half]) for (let v = -(GATE_DEEP - 1); v <= 0; v++) at(u, v, 5, slabId(MAT_BRICK, true));
  // The ground of the way through, in cobblestone.
  for (let u = -half; u <= half; u++) for (let v = -(GATE_DEEP - 1); v <= 0; v++) at(u, v, 0, B.COBBLE);

  if (open) {
    // A raised portcullis: the lower ends of the bars in the front of the arch.
    for (let u = -half; u <= half; u++) {
      at(u, 0, 5, B.FENCE);
      if (u % 2 === 0) at(u, 0, 4, B.FENCE);
    }
  } else {
    // Sealed: two great doors of planks bound in logs, two blocks thick.
    for (let u = -half; u <= half; u++) {
      for (let y = 1; y <= 5; y++) {
        const band = y === 1 || y === 3 || y === 5 || u === -half || u === half || (half > 1 && u === 0);
        for (const v of [0, -1]) at(u, v, y, band ? B.SPRUCE_LOG : B.PLANKS);
      }
    }
  }
}

/** A corner tower: hollow, five blocks square, with a plank floor on the level of the walkway, a ladder to its roof and arrow slits. */
function cornerTower(put: Put, corner: CornerId, hash: Hash): void {
  const sx = corner.endsWith('W') ? 1 : -1;
  const sz = corner.startsWith('N') ? 1 : -1;
  const x0 = sx > 0 ? WALL_FIRST : WALL_LAST;
  const z0 = sz > 0 ? WALL_FIRST : WALL_LAST;
  const at = (i: number, j: number, dy: number, id: number): void => put(x0 + sx * i, dy, z0 + sz * j, id);
  const last = TOWER - 1;
  const ladderCell: [number, number] = [last - 1, last - 1];
  // The openings: the walkway of each side comes in at the level of the floor, and the door is on the village side.
  const isOpening = (i: number, j: number, y: number): boolean => {
    if (y >= 4 && y <= 5 && ((i === last && (j === 1 || j === 2)) || (j === last && (i === 1 || i === 2)))) return true;
    return y >= 1 && y <= 2 && j === last && i === 2;
  };
  for (let j = 0; j <= last; j++) {
    for (let i = 0; i <= last; i++) {
      const edge = i === 0 || i === last || j === 0 || j === last;
      const post = (i === 0 || i === last) && (j === 0 || j === last);
      at(i, j, 0, B.COBBLE);
      if (!edge) {
        // The floor of the walkway's level and the roof platform, with the ladder's hole in both.
        if (i !== ladderCell[0] || j !== ladderCell[1]) {
          at(i, j, 3, B.PLANKS);
          at(i, j, 8, B.PLANKS);
        }
        continue;
      }
      for (let y = 1; y <= 8; y++) {
        if (isOpening(i, j, y)) continue;
        let id: number;
        if (post) id = y <= 3 ? B.COBBLE : B.SPRUCE_LOG;
        else if (y <= 3) id = footing(hash, x0 + sx * i, z0 + sz * j + y * 5);
        else if (y === 6 && ((i === 0 && j === 2) || (j === 0 && i === 2) || (i === last && j === 3) || (j === last && i === 3))) id = B.PANE;
        else if (y === 8) id = B.STONE_BRICKS;
        else id = B.PLANKS;
        at(i, j, y, id);
      }
      // Battlements and a lamp at every corner.
      if (post) {
        at(i, j, 9, B.COBBLE);
        at(i, j, 10, B.COBBLE);
        at(i, j, 11, B.TORCH);
      } else if ((i + j) % 2 === 0) at(i, j, 9, B.COBBLE);
    }
  }
  // The ladder: up from the ground, through both floors, on the wall toward the village's middle.
  for (let y = 1; y <= 9; y++) at(ladderCell[0], ladderCell[1], y, ladderId(dirIndex(sx, 0)));
  // A torch inside, on the far wall.
  at(1, 2, 5, TORCH_ON[dirIndex(-sx, 0)]);
}
