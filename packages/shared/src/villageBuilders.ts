import { B, bedId, doorId, gateId, ladderId, slabId, stairId, trapdoorId, woolId } from './blocks';

/**
 * The buildings of a village. Each builder works in lot coordinates: `i` runs along the road, `j` away
 * from it (0 is the wall that faces the road) and `dy` is the height above the village ground. A `Lot`
 * turns those into world blocks for whichever way the road happens to run.
 *
 * Directions are indices into `BED_DIRS` (0 = +x, 1 = -x, 2 = +z, 3 = -z), so `d ^ 1` is the opposite one.
 */

export type Put = (x: number, dy: number, z: number, id: number) => void;

/** Material indices into `BUILD_MATERIALS` (for slabs and stairs). */
const MAT = { wood: 0, cobble: 1, stone: 2, sand: 3, brick: 4 } as const;

/** The wall torch that hangs on the block in a direction (the index is where its support is). */
const TORCH_ON = [B.TORCH_PX, B.TORCH_NX, B.TORCH_PZ, B.TORCH_NZ] as const;

export interface Style {
  /** Wall, foundation course, corner posts, floor and the material of the roof's stairs. */
  wall: number;
  base: number;
  corner: number;
  floor: number;
  roofMat: number;
  /** The block that fills a roof under its stairs. */
  roofBlock: number;
  /** Flat roof with a low parapet (desert) instead of a gable. */
  flat: boolean;
  /** Plants and flowers in the gardens. */
  garden: 'flowers' | 'bush' | 'none';
}

export type StyleName = 'oak' | 'spruce' | 'desert';

export function styleFor(name: StyleName, rand: () => number): Style {
  if (name === 'desert') {
    return { wall: B.SANDSTONE, base: B.CHISELED_SANDSTONE, corner: B.CHISELED_SANDSTONE, floor: B.SANDSTONE, roofMat: MAT.sand, roofBlock: B.SANDSTONE, flat: true, garden: 'bush' };
  }
  const cobbleRoof = rand() < 0.4;
  return {
    wall: B.PLANKS,
    base: B.COBBLE,
    corner: name === 'spruce' ? B.SPRUCE_LOG : rand() < 0.3 ? B.BIRCH_LOG : B.LOG,
    floor: B.PLANKS,
    roofMat: cobbleRoof ? MAT.cobble : MAT.wood,
    roofBlock: cobbleRoof ? B.COBBLE : B.PLANKS,
    flat: false,
    garden: 'flowers',
  };
}

export class Lot {
  /** The way from the house to the road. */
  readonly front: number;
  constructor(
    readonly w: number,
    readonly d: number,
    /** Direction of increasing `i` and of increasing `j`. */
    readonly iDir: number,
    readonly jDir: number,
    private readonly toWorld: (i: number, j: number) => [number, number],
    private readonly putFn: Put,
  ) {
    this.front = jDir ^ 1;
  }

  set(i: number, dy: number, j: number, id: number): void {
    const [x, z] = this.toWorld(i, j);
    this.putFn(x, dy, z, id);
  }

  /** World position of a lot cell. */
  at(i: number, j: number): [number, number] {
    return this.toWorld(i, j);
  }
}

// ---------------------------------------------------------------------------------------------------
// roofs

/** A gable roof of stairs along the road, with the gable ends closed in and a ridge of slabs. */
function gableRoof(lot: Lot, st: Style): number {
  const { w, d, jDir } = lot;
  const stair = (dir: number) => stairId(st.roofMat, false, dir);
  const ridgeSlab = slabId(st.roofMat, false);
  let k = 0;
  for (; ; k++) {
    const jf = -1 + k;
    const jb = d - k;
    const dy = 4 + k;
    if (k === 0) for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) lot.set(i, dy, j, st.wall); // ceiling
    if (jf === jb) {
      for (let i = 0; i < w; i++) lot.set(i, dy - 1, jf, st.roofBlock);
      for (let i = -1; i <= w; i++) lot.set(i, dy, jf, ridgeSlab);
      break;
    }
    if (jb - jf === 1) {
      for (const j of [jf, jb]) {
        for (let i = 0; i < w; i++) lot.set(i, dy - 1, j, st.roofBlock);
        for (let i = -1; i <= w; i++) lot.set(i, dy, j, ridgeSlab);
      }
      break;
    }
    for (let i = -1; i <= w; i++) {
      lot.set(i, dy, jf, stair(jDir));
      lot.set(i, dy, jb, stair(jDir ^ 1));
    }
    if (k > 0) {
      for (let i = 0; i < w; i++) {
        lot.set(i, dy - 1, jf, st.roofBlock);
        lot.set(i, dy - 1, jb, st.roofBlock);
      }
      // The gable ends are walled up to the roof.
      for (let j = jf + 1; j <= jb - 1; j++) {
        lot.set(0, dy, j, st.wall);
        lot.set(w - 1, dy, j, st.wall);
      }
    }
  }
  return 4 + k;
}

/** A flat roof with a low parapet all round. */
function flatRoof(lot: Lot, st: Style): void {
  const { w, d } = lot;
  for (let j = 0; j < d; j++) {
    for (let i = 0; i < w; i++) {
      lot.set(i, 4, j, st.wall);
      if (i === 0 || j === 0 || i === w - 1 || j === d - 1) lot.set(i, 5, j, slabId(st.roofMat, false));
    }
  }
}

/** A stepped pyramid of stairs over the rectangle [i0..i1] x [j0..j1], starting at height dy. Returns the top height. */
function pyramid(lot: Lot, i0: number, i1: number, j0: number, j1: number, dy: number, mat: number, block: number, layers = Infinity): number {
  const { iDir, jDir } = lot;
  const stair = (dir: number) => stairId(mat, false, dir);
  for (let layer = 0; ; layer++) {
    if (layer >= layers) {
      // A low cap of slabs over what is left.
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) lot.set(i, dy, j, slabId(mat, false));
      return dy;
    }
    if (i1 - i0 < 2 || j1 - j0 < 2) {
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          lot.set(i, dy, j, block);
          lot.set(i, dy + 1, j, slabId(mat, false));
        }
      }
      return dy + 1;
    }
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const onI = i === i0 || i === i1;
        const onJ = j === j0 || j === j1;
        if (onI && onJ) lot.set(i, dy, j, block);
        else if (j === j0) lot.set(i, dy, j, stair(jDir));
        else if (j === j1) lot.set(i, dy, j, stair(jDir ^ 1));
        else if (i === i0) lot.set(i, dy, j, stair(iDir));
        else if (i === i1) lot.set(i, dy, j, stair(iDir ^ 1));
        else lot.set(i, dy, j, block);
      }
    }
    i0++;
    i1--;
    j0++;
    j1--;
    dy++;
  }
}

// ---------------------------------------------------------------------------------------------------
// furniture

function table(lot: Lot, i: number, j: number): void {
  lot.set(i, 1, j, B.FENCE);
  lot.set(i, 2, j, trapdoorId(false, false, 0));
}

/** A chair is a stair whose back is on the side away from the table. */
function chair(lot: Lot, i: number, j: number, awayFromTable: number): void {
  lot.set(i, 1, j, stairId(MAT.wood, false, awayFromTable));
}

function bed(lot: Lot, i: number, j: number, color: number): void {
  lot.set(i, 1, j, bedId(false, lot.jDir, color));
  lot.set(i, 1, j + 1, bedId(true, lot.jDir));
}

// ---------------------------------------------------------------------------------------------------
// buildings

export type HouseKind = 'small' | 'large' | 'smithy';

export function house(lot: Lot, kind: HouseKind, st: Style, rand: () => number): void {
  const { w, d, front, jDir } = lot;
  const smithy = kind === 'smithy';
  const door = w >> 1;
  // A smithy is built of stone wherever it stands (the desert's sandstone already is).
  if (smithy && !st.flat) st = { ...st, wall: B.COBBLE, base: B.STONE_BRICKS, floor: B.COBBLE, roofMat: MAT.cobble, roofBlock: B.COBBLE };

  // Floor, foundation and walls.
  for (let j = 0; j < d; j++) {
    for (let i = 0; i < w; i++) {
      const edgeI = i === 0 || i === w - 1;
      const edgeJ = j === 0 || j === d - 1;
      if (!edgeI && !edgeJ) {
        lot.set(i, 0, j, st.floor);
        continue;
      }
      lot.set(i, 0, j, st.base);
      if (edgeI && edgeJ) {
        for (let y = 1; y <= 3; y++) lot.set(i, y, j, st.corner);
        continue;
      }
      lot.set(i, 1, j, st.base);
      lot.set(i, 2, j, st.wall);
      lot.set(i, 3, j, st.wall);
    }
  }

  // Windows: two beside the door, one in the middle of each side and of the back.
  const windows: [number, number][] = [
    [1, 0],
    [w - 2, 0],
    [w >> 1, d - 1],
    [0, d >> 1],
    [w - 1, d >> 1],
  ];
  for (const [i, j] of windows) lot.set(i, 2, j, B.PANE);
  // Open shutters on the outside of the front windows, flat against the wall.
  for (const i of [0, w - 1]) lot.set(i, 2, -1, trapdoorId(false, true, jDir));
  if (w >= 7) for (const i of [2, w - 3]) lot.set(i, 2, -1, trapdoorId(false, true, jDir));

  // The front door, with a lamp above it and a step.
  lot.set(door, 1, 0, doorId(false, false, front));
  lot.set(door, 2, 0, doorId(true, false, front));
  lot.set(door, 3, -1, TORCH_ON[jDir]);
  lot.set(door, 3, 1, TORCH_ON[front]);

  // The roof.
  let top: number;
  if (st.flat) {
    flatRoof(lot, st);
    top = 5;
  } else {
    top = gableRoof(lot, st);
  }

  // Inside.
  lot.set(w >> 1, 3, d - 2, TORCH_ON[jDir]);
  const colors = [0, 1, 3, 4, 5, 6, 9, 10, 11, 14];
  const pick = () => colors[Math.floor(rand() * colors.length)];
  if (smithy) {
    lot.set(w - 2, 1, d - 2, B.FURNACE);
    lot.set(w - 3, 1, d - 2, B.FURNACE);
    lot.set(w - 2, 1, 1, B.CRAFTING_TABLE);
    lot.set(1, 1, 1, B.CHEST);
    table(lot, 1, d - 2);
  } else if (kind === 'large') {
    bed(lot, 1, d - 3, pick());
    bed(lot, 2, d - 3, pick());
    lot.set(1, 1, 1, B.CRAFTING_TABLE);
    lot.set(w - 2, 1, 1, B.CHEST);
    lot.set(w - 2, 1, d - 2, B.FURNACE);
    table(lot, w - 3, d - 3);
    chair(lot, w - 3, d - 4, front);
    chair(lot, w - 4, d - 3, lot.iDir ^ 1);
  } else {
    bed(lot, 1, d - 3, pick());
    lot.set(w - 2, 1, 1, B.CRAFTING_TABLE);
    lot.set(w - 2, 1, d - 2, B.CHEST);
  }

  // A chimney over the furnace.
  if (!st.flat && (kind === 'large' || smithy)) {
    for (let y = 2; y <= top + 1; y++) lot.set(w - 2, y, d - 2, B.COBBLE);
  }
}

/** A fenced field of wheat with a ditch of water, a scarecrow and a gate. */
export function farm(lot: Lot, rand: () => number): void {
  const { w, d } = lot;
  const stages = [B.WHEAT_0, B.WHEAT_1, B.WHEAT_2, B.WHEAT_3, B.WHEAT_3];
  const mid = d >> 1;
  const gate = gateId(false, lot.iDir < 2 ? 2 : 0);
  for (let j = 0; j < d; j++) {
    for (let i = 0; i < w; i++) {
      const edgeI = i === 0 || i === w - 1;
      const edgeJ = j === 0 || j === d - 1;
      const corner = edgeI && edgeJ;
      if (corner) {
        lot.set(i, 1, j, B.LOG);
        lot.set(i, 2, j, B.LOG);
        lot.set(i, 3, j, B.TORCH);
      } else if (edgeI || edgeJ) {
        lot.set(i, 1, j, j === 0 && i === w >> 1 ? gate : B.FENCE);
      } else if (j === mid) {
        lot.set(i, 0, j, B.WATER);
      } else {
        lot.set(i, 0, j, B.FARMLAND);
        lot.set(i, 1, j, stages[Math.floor(rand() * stages.length)]);
      }
    }
  }
  // The scarecrow stands in the field: a post, a straw head and outstretched arms.
  const si = w - 3;
  const sj = d - 2;
  lot.set(si, 1, sj, B.FENCE);
  lot.set(si, 2, sj, B.FENCE);
  lot.set(si, 3, sj, woolId(4));
  lot.set(si - 1, 2, sj, B.FENCE);
  lot.set(si + 1, 2, sj, B.FENCE);
}

/** A market stall: four posts, a striped awning of coloured wool and a counter. */
export function stall(lot: Lot, rand: () => number): void {
  const { w, d } = lot;
  const pairs: [number, number][] = [
    [14, 0],
    [11, 0],
    [4, 0],
    [1, 0],
    [5, 0],
    [3, 4],
  ];
  const [a, b] = pairs[Math.floor(rand() * pairs.length)];
  for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) lot.set(i, 0, j, B.PLANKS);
  for (const i of [0, w - 1]) {
    for (const j of [0, d - 1]) for (let y = 1; y <= 3; y++) lot.set(i, y, j, B.FENCE);
  }
  for (let j = -1; j <= d; j++) for (let i = -1; i <= w; i++) lot.set(i, 4, j, woolId(i % 2 === 0 ? a : b));
  // A counter along the back, with a crate on it and a lamp.
  for (let i = 1; i < w - 1; i++) lot.set(i, 1, d - 1, slabId(MAT.wood, true));
  lot.set(1, 1, d - 2, B.CHEST);
  table(lot, w - 2, d - 2);
  lot.set(w >> 1, 2, d - 1, B.FENCE);
  lot.set(w >> 1, 3, d - 1, B.TORCH);
}

/** A watchtower with a ladder inside, an open belfry and a stone roof. */
export function tower(lot: Lot): void {
  const { w, d, front, jDir } = lot;
  const door = w >> 1;
  const H = 6;
  for (let j = 0; j < d; j++) {
    for (let i = 0; i < w; i++) {
      const edgeI = i === 0 || i === w - 1;
      const edgeJ = j === 0 || j === d - 1;
      lot.set(i, 0, j, B.COBBLE);
      if (!edgeI && !edgeJ) continue;
      for (let y = 1; y < H; y++) {
        const corner = edgeI && edgeJ;
        lot.set(i, y, j, corner ? B.COBBLE : y <= 1 || y === H - 1 ? B.COBBLE : B.STONE_BRICKS);
      }
    }
  }
  // Slits for light on every side.
  lot.set(door, 3, d - 1, B.PANE);
  lot.set(0, 3, d >> 1, B.PANE);
  lot.set(w - 1, 3, d >> 1, B.PANE);
  lot.set(1, 3, 0, B.PANE);
  lot.set(w - 2, 3, 0, B.PANE);
  lot.set(door, 1, 0, doorId(false, false, front));
  lot.set(door, 2, 0, doorId(true, false, front));
  lot.set(door, 3, -1, TORCH_ON[jDir]);
  lot.set(door, 3, 1, TORCH_ON[front]);
  lot.set(door, 4, d - 2, TORCH_ON[jDir]);
  // A ladder up the back wall, through a hole in the platform.
  for (let y = 1; y <= H; y++) lot.set(door, y, d - 2, ladderId(jDir));
  for (let j = 0; j < d; j++) {
    for (let i = 0; i < w; i++) {
      if (i === door && j === d - 2) continue;
      lot.set(i, H, j, B.PLANKS);
    }
  }
  // The belfry: four stone posts, a rail between them and a bell's worth of air.
  for (let j = 0; j < d; j++) {
    for (let i = 0; i < w; i++) {
      const edgeI = i === 0 || i === w - 1;
      const edgeJ = j === 0 || j === d - 1;
      if (!edgeI && !edgeJ) continue;
      const corner = edgeI && edgeJ;
      if (corner) for (let y = H + 1; y <= H + 3; y++) lot.set(i, y, j, B.COBBLE);
      else lot.set(i, H + 1, j, B.FENCE);
    }
  }
  pyramid(lot, -1, w, -1, d, H + 4, MAT.cobble, B.COBBLE);
}

/** A well: a stone rim, water two deep, four posts and a little roof. */
export function well(lot: Lot): void {
  // The well is 3 x 3 and centred on the plaza; (1, 1) is the water.
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      if (i === 1 && j === 1) {
        lot.set(i, -1, j, B.WATER);
        lot.set(i, 0, j, B.WATER);
        continue;
      }
      lot.set(i, -1, j, B.COBBLE);
      lot.set(i, 0, j, B.COBBLE);
      const corner = i !== 1 && j !== 1;
      if (corner) {
        for (let y = 1; y <= 3; y++) lot.set(i, y, j, y === 1 ? B.COBBLE : B.FENCE);
      } else {
        lot.set(i, 1, j, slabId(MAT.cobble, false));
      }
    }
  }
  pyramid(lot, -1, 3, -1, 3, 4, MAT.wood, B.PLANKS, 1);
}

/**
 * The Dawnwatch waystone: a pillar of three glowing blocks on a low stone-brick plinth in the middle of the plaza, a torch on
 * top. It stands on (0, 0), the heart of the village.
 */
export function waystone(put: Put): void {
  for (let z = -1; z <= 1; z++) {
    for (let x = -1; x <= 1; x++) {
      put(x, 0, z, B.STONE_BRICKS);
      if (x !== 0 || z !== 0) put(x, 1, z, slabId(MAT.stone, false));
    }
  }
  for (let y = 1; y <= 3; y++) put(0, y, 0, B.WAYSTONE);
  put(0, 4, 0, B.TORCH);
}

/** A lamp post: a fence post with a torch on top. */
export function lampPost(put: Put, x: number, z: number): void {
  put(x, 1, z, B.FENCE);
  put(x, 2, z, B.FENCE);
  put(x, 3, z, B.TORCH);
}
