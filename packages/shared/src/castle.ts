import {
  B,
  BUILD_MATERIALS,
  DRESS,
  JOINERY,
  MASONRY,
  bannerId,
  campfireId,
  candleId,
  chestId,
  idByName,
  ladderId,
  lanternId,
  slabId,
  stairId,
  woolId,
} from './blocks';
import { hash2 } from './noise';
import type { LootTableName } from './loot';

/**
 * Greykeep, the castle north of Dawnwatch.
 *
 * Seen from the road it is a wide, even front: a tall gatehouse in the middle with a dark notch over a gold balcony and
 * a wooden bridge to its arch, a low curtain wall with barred windows and a wall walk on each side, and at both ends a
 * round-shouldered stone tower that carries an open timber pavilion, a broad orange roof and a dark spire with a red flag.
 * A smaller turret and spire stand behind each pavilion. Behind the front is a walled courtyard with gardens, a path and
 * a great hall, and two more towers close the back. The front faces south (+z), toward the village.
 *
 * Heights are written as `k`: blocks above the ground (`k = 0` is the ground block itself).
 */

type Box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number) => void;
/** Put a chest here (the block, which way it faces, and the loot it holds). */
export type CastleChest = (x: number, y: number, z: number, id: number, table: LootTableName) => void;

// ---- where things are ----------------------------------------------------------------------------------------

/** The front of the towers and the gatehouse, and the back of the rear towers (z). */
const FRONT = -60;
const BACK = -98;
/** The curtain walls stand two blocks behind the towers, front and back. */
const CURTAIN_FRONT = -62;
const CURTAIN_BACK = -96;
/** The outer face of the two side walls (and of the towers). */
const SIDE = 29;
const WALL_H = 10;
const TOWER_H = 14;
const GATE_H = 19;

/** The ground the castle stands on, and the places a test can look for. */
export const GREYKEEP = {
  x0: -31,
  z0: -108,
  x1: 31,
  /** The bridge stops here, on the flat ground, still north of the village. */
  z1: -47,
  /** Mid-way through the arch of the gatehouse: open from the ground to well over your head. */
  gate: { x: 0, z: -64 },
  /** The courtyard, open to the sky. */
  yard: { x: -8, z: -70 },
  /** A block of the dark notch in the gatehouse's front wall. */
  keep: { x: 0, z: FRONT, dy: 16 },
  /** Down the middle of the great hall, and its back wall. */
  nave: { x: 0, z: -84 },
  naveEnd: { x: 0, z: -92 },
  /** A block of the spire of the south-west tower, above its roof. */
  spire: { x: -25, z: -64, dy: 30 },
} as const;

// ---- what it is made of --------------------------------------------------------------------------------------

const rowOf = (name: string) => {
  const r = MASONRY.find((m) => m.spec.name === name);
  if (!r) throw new Error(`castle: no masonry row ${name}`);
  return r;
};
const cubeOf = (name: string): number => rowOf(name).cubeId || idByName(name);
const matOf = (name: string): number => BUILD_MATERIALS.length + rowOf(name).index;
const must = (name: string): number => {
  const id = idByName(name);
  if (!id) throw new Error(`castle: no block ${name}`);
  return id;
};
const wood = (name: string) => {
  const w = JOINERY.woods.find((x) => x.spec.name === name);
  if (!w) throw new Error(`castle: no wood ${name}`);
  return w;
};

const AIR = B.AIR;
const BRICK = B.STONE_BRICKS;
const BRICK_MAT = 4;
const MOSSY = cubeOf('mossy_stone_bricks');
const CRACKED = DRESS.crackedStone;
const CHISELED = DRESS.chiseledStone;
const POLISHED = cubeOf('polished_andesite');
const POLISHED_MAT = matOf('polished_andesite');
const DEEP = cubeOf('deepslate_bricks');
const DEEP_MAT = matOf('deepslate_bricks');
const DEEP_CRACKED = DRESS.crackedDeepslate;
const TILES = cubeOf('deepslate_tiles');
const TILES_MAT = matOf('deepslate_tiles');

const ACACIA = wood('acacia');
const ACACIA_PLANKS = cubeOf('acacia');
const ACACIA_MAT = matOf('acacia');
const ACACIA_LOG = ACACIA.strippedLog;
const ACACIA_FENCE = ACACIA.fence;
const SPRUCE_PLANKS = cubeOf('spruce');
const SPRUCE_MAT = matOf('spruce');
const SPRUCE_LOG = B.SPRUCE_LOG;
const DARK_OAK = wood('dark_oak');
const DARK_PLANKS = cubeOf('dark_oak');
const DARK_MAT = matOf('dark_oak');
const DARK_FENCE = DARK_OAK.fence;
const DARK_LOG = B.DARK_OAK_LOG;
const PLASTER = B.TERRACOTTA_WHITE;
const DARK_LOG_STRIPPED = DARK_OAK.strippedLog;
const BIRCH_FENCE = wood('birch').fence;

const RED = 14;
const RED_WOOL = woolId(RED);
const CARPET_RED = DRESS.carpet + RED;
const BARS = DRESS.ironBars;
const LANTERN = lanternId(false, false);
const LANTERN_HANG = lanternId(false, true);
const FLOWERS = ['rose', 'dandelion', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy', 'cornflower', 'allium', 'azure_bluet'].map(must);

// ---- a place to build in -------------------------------------------------------------------------------------

interface Kit {
  /** The ground block's height. */
  g: number;
  box: Box;
  chest: CastleChest;
  put(x: number, k: number, z: number, id: number): void;
  fill(x0: number, k0: number, z0: number, x1: number, k1: number, z1: number, id: number): void;
}

/** A stone-brick wall that is clean, with a few mossy and cracked blocks in it, as old stone has. */
function bricks(kit: Kit, x0: number, k0: number, z0: number, x1: number, k1: number, z1: number): void {
  kit.fill(x0, k0, z0, x1, k1, z1, BRICK);
  for (let y = k0; y <= k1; y++) {
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
        const n = hash2(x * 5 + 3, y + kit.g, z * 3 + 1);
        if (n < 0.04) kit.put(x, y, z, MOSSY);
        else if (n < 0.08) kit.put(x, y, z, CRACKED);
      }
    }
  }
}

/**
 * A frame of reference for a part of the castle. `u` runs along it and `v` across it, each in either direction
 * of the world, so that one description can be built on every side. Local directions are 0 = +u, 1 = -u, 2 = +v, 3 = -v.
 */
class Frame {
  constructor(
    readonly kit: Kit,
    readonly ox: number,
    readonly oz: number,
    readonly alongX: boolean,
    readonly su: 1 | -1,
    readonly sv: 1 | -1,
  ) {}

  x(u: number, v: number): number {
    return this.alongX ? this.ox + this.su * u : this.ox + this.sv * v;
  }

  z(u: number, v: number): number {
    return this.alongX ? this.oz + this.sv * v : this.oz + this.su * u;
  }

  /** The world direction (0..3, as the stairs and ladders count) of a local one. */
  dir(d: number): number {
    const lu = d === 0 ? 1 : d === 1 ? -1 : 0;
    const lv = d === 2 ? 1 : d === 3 ? -1 : 0;
    const vx = this.alongX ? this.su * lu : this.sv * lv;
    const vz = this.alongX ? this.sv * lv : this.su * lu;
    return vx > 0 ? 0 : vx < 0 ? 1 : vz > 0 ? 2 : 3;
  }

  put(u: number, k: number, v: number, id: number): void {
    this.kit.put(this.x(u, v), k, this.z(u, v), id);
  }

  fill(u0: number, k0: number, v0: number, u1: number, k1: number, v1: number, id: number): void {
    this.kit.fill(this.x(u0, v0), k0, this.z(u0, v0), this.x(u1, v1), k1, this.z(u1, v1), id);
  }

  bricks(u0: number, k0: number, v0: number, u1: number, k1: number, v1: number): void {
    bricks(this.kit, this.x(u0, v0), k0, this.z(u0, v0), this.x(u1, v1), k1, this.z(u1, v1));
  }

  stair(u: number, k: number, v: number, mat: number, d: number, top = false): void {
    this.put(u, k, v, stairId(mat, top, this.dir(d)));
  }

  slab(u: number, k: number, v: number, mat: number, top = false): void {
    this.put(u, k, v, slabId(mat, top));
  }

  /** A ring of stairs round a rectangle (inclusive), their tall side toward the middle. */
  stairRing(u0: number, v0: number, u1: number, v1: number, k: number, mat: number, top = false): void {
    for (let u = u0; u <= u1; u++) {
      this.stair(u, k, v0, mat, 2, top);
      this.stair(u, k, v1, mat, 3, top);
    }
    for (let v = v0 + 1; v < v1; v++) {
      this.stair(u0, k, v, mat, 0, top);
      this.stair(u1, k, v, mat, 1, top);
    }
  }
}

// ---- the whole ---------------------------------------------------------------------------------------------

/** Lay the castle out. `g` is the ground block, the same height as Dawnwatch. */
export function buildCastle(g: number, box: Box, chest: CastleChest): void {
  const kit: Kit = {
    g,
    box,
    chest,
    put: (x, k, z, id) => box(x, g + k, z, x, g + k, z, id),
    fill: (x0, k0, z0, x1, k1, z1, id) => box(x0, g + k0, z0, x1, g + k1, z1, id),
  };

  groundwork(kit);

  // The four towers. Local u runs toward the middle of the castle, v from the outer face inward.
  const towers: [Frame, boolean][] = [
    [new Frame(kit, -25, FRONT, true, 1, -1), true],
    [new Frame(kit, 25, FRONT, true, -1, -1), true],
    [new Frame(kit, -25, BACK, true, 1, 1), false],
    [new Frame(kit, 25, BACK, true, -1, 1), false],
  ];
  towers.forEach(([f, front], i) => tower(kit, f, front, i));

  // Curtain walls: along the front (u east), the sides (u south to north) and the back.
  for (const x0 of [-20, 6]) curtain(new Frame(kit, x0, CURTAIN_FRONT, true, 1, -1), 15, true);
  curtain(new Frame(kit, -SIDE, -72, false, -1, 1), 15, false);
  curtain(new Frame(kit, SIDE, -72, false, -1, -1), 15, false);
  for (const x0 of [-20, 6]) curtain(new Frame(kit, x0, CURTAIN_BACK, true, 1, 1), 15, false);
  // Between them, behind the great hall, the back wall closes the circle.
  curtain(new Frame(kit, -5, CURTAIN_BACK, true, 1, 1), 11, false);

  gatehouse(new Frame(kit, 0, FRONT, true, 1, -1));
  forecourt(kit);
  courtyard(kit);
  hall(kit);
  postern(kit);
}

// ---- the ground ---------------------------------------------------------------------------------------------

function groundwork(kit: Kit): void {
  // Stone under every building, so no tree root or hill shows through.
  kit.fill(-SIDE, 0, BACK, SIDE, 0, FRONT, BRICK);
  // The courtyard is green: put the grass back inside the walls.
  kit.fill(-26, 0, CURTAIN_BACK + 3, 26, 0, CURTAIN_FRONT - 3, B.GRASS);
}

// ---- the towers ---------------------------------------------------------------------------------------------

/**
 * A square tower, 9 wide and 12 deep: a stone body of two rooms joined by a ladder, a deck with a rail, an open timber pavilion
 * under a broad orange roof and a dark spire with a flag, and behind the pavilion a smaller turret with a spire of its own.
 * `u` runs from -4 (the outer side) to +4 (toward the middle of the castle), `v` from 0 (the outer face) to 11.
 */
function tower(kit: Kit, f: Frame, front: boolean, index: number): void {
  // The body.
  f.bricks(-4, 0, 0, 4, TOWER_H, 11);
  f.fill(-3, 1, 1, 3, TOWER_H, 10, AIR);
  // The floor between the two rooms is level with the wall walk.
  f.fill(-3, WALL_H, 1, 3, WALL_H, 10, SPRUCE_PLANKS);

  // Light stone pillars on the corners, two wide on the faces.
  for (const u of [-4, -3, 3, 4]) {
    f.fill(u, 0, 0, u, TOWER_H, 0, POLISHED);
    f.fill(u, 0, 11, u, TOWER_H, 11, POLISHED);
  }
  for (const u of [-4, 4]) {
    f.fill(u, 0, 1, u, TOWER_H, 1, POLISHED);
    f.fill(u, 0, 10, u, TOWER_H, 10, POLISHED);
  }
  // A belt of carved stone under the deck, all the way round.
  f.fill(-4, TOWER_H, 0, 4, TOWER_H, 0, CHISELED);
  f.fill(-4, TOWER_H, 11, 4, TOWER_H, 11, CHISELED);
  f.fill(-4, TOWER_H, 1, -4, TOWER_H, 10, CHISELED);
  f.fill(4, TOWER_H, 1, 4, TOWER_H, 10, CHISELED);

  // Barred windows: one on each face, in each room, and a pair of small ones on the front.
  for (const [u, v] of [
    [0, 0],
    [0, 11],
    [-4, 5],
    [4, 6],
  ] as const) {
    f.fill(u, 3, v, u, 5, v, BARS);
    f.fill(u, 12, v, u, 13, v, BARS);
  }
  for (const u of [-2, 2]) f.put(u, 8, 0, BARS);

  // Ways in: a doorway on the courtyard side, and a gap at each end of a wall walk (the walks are level with the upper floor).
  f.fill(4, 1, 8, 4, 3, 8, AIR);
  f.fill(4, WALL_H + 1, 3, 4, WALL_H + 2, 3, AIR);
  f.fill(-3, WALL_H + 1, 11, -3, WALL_H + 2, 11, AIR);

  // The ladder from the floor up through the floor above and the deck.
  f.put(-2, WALL_H, 1, AIR);
  for (let k = 1; k <= TOWER_H + 1; k++) f.put(-2, k, 1, ladderId(f.dir(3)));

  // Light inside.
  for (const [u, v] of [
    [0, 5],
    [2, 8],
    [-2, 8],
  ] as const) {
    f.put(u, WALL_H - 1, v, LANTERN_HANG);
    f.put(u, TOWER_H, v, LANTERN_HANG);
  }
  towerRooms(kit, f, front, index);

  // The deck, with corbels under its edge, a carved rim and a rail.
  f.fill(-5, TOWER_H + 1, -1, 5, TOWER_H + 1, 12, BRICK);
  f.stairRing(-5, -1, 5, 12, TOWER_H, BRICK_MAT, true);
  f.fill(-5, TOWER_H + 1, -1, 5, TOWER_H + 1, -1, POLISHED);
  f.fill(-5, TOWER_H + 1, 12, 5, TOWER_H + 1, 12, POLISHED);
  f.fill(-5, TOWER_H + 1, 0, -5, TOWER_H + 1, 11, POLISHED);
  f.fill(5, TOWER_H + 1, 0, 5, TOWER_H + 1, 11, POLISHED);
  // The ladder goes on up through a hole in the deck.
  f.put(-2, TOWER_H + 1, 1, ladderId(f.dir(3)));
  const rail = TOWER_H + 2;
  for (let u = -5; u <= 5; u++) {
    f.put(u, rail, -1, ACACIA_FENCE);
    f.put(u, rail, 12, ACACIA_FENCE);
  }
  for (let v = 0; v <= 11; v++) {
    f.put(-5, rail, v, ACACIA_FENCE);
    f.put(5, rail, v, ACACIA_FENCE);
  }

  pavilion(f, rail);
  turret(f, rail);

  // The spires and flags are set last, so nothing is built over them.
  const cx = f.x(0, 4);
  const cz = f.z(0, 4);
  spire(kit, cx, cz, rail + 8, 2, 12);
  flag(kit, cx, cz, rail + 21, 3, 2);
  const tx = f.x(3, 11);
  const tz = f.z(3, 11);
  spire(kit, tx, tz, rail + 8, 1, 8);
  flag(kit, tx, tz, rail + 17, 2, 1);
}

/** Inside the rooms: books, a workbench and a chest. */
function towerRooms(kit: Kit, f: Frame, front: boolean, index: number): void {
  if (front) {
    // A workshop: shelves along the back, a bench, a furnace and an anvil.
    f.fill(-3, 1, 10, 1, 3, 10, B.BOOKSHELF);
    f.put(3, 1, 4, B.CRAFTING_TABLE);
    f.put(3, 1, 5, B.FURNACE);
    f.put(3, 1, 6, B.ANVIL);
  } else {
    // A library.
    f.fill(-3, 1, 10, 3, 2, 10, B.BOOKSHELF);
    f.fill(-3, 1, 2, -3, 2, 4, B.BOOKSHELF);
  }
  f.fill(-1, 1, 5, 1, 1, 6, CARPET_RED);
  // Upstairs: a chest by the wall, a rug and a candle.
  kit.chest(f.x(3, 9), kit.g + WALL_H + 1, f.z(3, 9), chestId(f.dir(1), 0), index % 2 === 0 ? 'village' : 'village');
  f.fill(-1, WALL_H + 1, 4, 1, WALL_H + 1, 7, CARPET_RED);
  f.put(-3, WALL_H + 1, 9, candleId(-1, 3));
}

/** The pavilion: timber posts round an open room under a broad roof. */
function pavilion(f: Frame, rail: number): void {
  const posts: [number, number][] = [
    [-3, 1],
    [0, 1],
    [3, 1],
    [-3, 4],
    [3, 4],
    [-3, 7],
    [0, 7],
    [3, 7],
  ];
  for (const [u, v] of posts) f.fill(u, rail, v, u, rail + 3, v, DARK_LOG);
  // A low rail between the posts. The front is left open on the ladder's side.
  for (const u of [1, 2]) f.put(u, rail, 1, BIRCH_FENCE);
  for (const u of [-2, -1, 1, 2]) f.put(u, rail, 7, BIRCH_FENCE);
  for (const v of [2, 3, 5, 6]) {
    f.put(-3, rail, v, BIRCH_FENCE);
    f.put(3, rail, v, BIRCH_FENCE);
  }
  // A beam round the top of the posts.
  const beam = rail + 4;
  f.fill(-3, beam, 1, 3, beam, 1, DARK_LOG);
  f.fill(-3, beam, 7, 3, beam, 7, DARK_LOG);
  f.fill(-3, beam, 2, -3, beam, 6, DARK_LOG);
  f.fill(3, beam, 2, 3, beam, 6, DARK_LOG);
  // The roof: a pyramid of acacia stairs, 11 wide at the eaves.
  const eaves = beam + 1;
  for (let step = 0; step < 3; step++) {
    const u0 = -5 + step;
    const v0 = -1 + step;
    const k = eaves + step;
    f.stairRing(u0, v0, -u0, 9 - step, k, ACACIA_MAT);
    f.fill(u0 + 1, k, v0 + 1, -u0 - 1, k, 8 - step, ACACIA_PLANKS);
  }
  f.put(0, beam, 4, LANTERN_HANG);
}

/** The small turret behind the pavilion: timber walls, a window and a spire of its own. */
function turret(f: Frame, rail: number): void {
  const top = rail + 5;
  f.fill(2, rail, 10, 4, top, 12, DARK_PLANKS);
  f.fill(3, rail, 11, 3, top, 11, AIR);
  for (const u of [2, 4]) for (const v of [10, 12]) f.fill(u, rail, v, u, top, v, DARK_LOG);
  f.fill(3, rail, 10, 3, rail + 1, 10, AIR);
  for (const [u, v] of [
    [3, 12],
    [2, 11],
    [4, 11],
  ] as const) f.fill(u, rail + 2, v, u, rail + 3, v, B.PANE);
  f.put(3, top, 11, DARK_PLANKS);
  f.put(3, rail + 2, 11, LANTERN);
  // The eaves, then a dark spire is set on top.
  for (let step = 0; step < 2; step++) {
    const k = top + 1 + step;
    f.stairRing(1 + step, 9 + step, 5 - step, 13 - step, k, ACACIA_MAT);
    f.fill(2 + step, k, 10 + step, 4 - step, k, 12 - step, ACACIA_PLANKS);
  }
}

/**
 * A stepped spire of dark brick: a square 2w+1 wide, then a ring of stairs that carries it in to a smaller one,
 * down to a single block. `height` is the number of layers above `k0`. A pole stands on the top.
 */
function spire(kit: Kit, cx: number, cz: number, k0: number, w0: number, height: number): void {
  let w = w0;
  let k = k0;
  let left = height;
  const solid = (x0: number, z0: number, x1: number, z1: number, y: number): void => {
    kit.fill(x0, y, z0, x1, y, z1, DEEP);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) if (hash2(x * 7 + 1, y + kit.g, z * 5 + 2) < 0.08) kit.put(x, y, z, DEEP_CRACKED);
    }
  };
  while (left > 0) {
    const run = w === 0 ? left : Math.min(left, 3);
    for (let i = 0; i < run; i++, k++, left--) solid(cx - w, cz - w, cx + w, cz + w, k);
    if (w === 0 || left <= 0) break;
    // The step in: a ring of stairs, tall side in, round a core one block smaller.
    for (let x = cx - w; x <= cx + w; x++) {
      for (let z = cz - w; z <= cz + w; z++) {
        const dx = x - cx;
        const dz = z - cz;
        if (Math.max(Math.abs(dx), Math.abs(dz)) < w) kit.put(x, k, z, DEEP);
        else {
          const dir = Math.abs(dx) >= Math.abs(dz) ? (dx > 0 ? 1 : 0) : dz > 0 ? 3 : 2;
          kit.put(x, k, z, stairId(DEEP_MAT, false, dir));
        }
      }
    }
    k++;
    left--;
    w--;
  }
  kit.fill(cx, k, cz, cx, k + 2, cz, BIRCH_FENCE);
}

/** A flag of red wool on a pole, blowing east. */
function flag(kit: Kit, cx: number, cz: number, k: number, length: number, height: number): void {
  for (let i = 1; i <= length; i++) kit.fill(cx + i, k, cz, cx + i, k + height - 1, cz, RED_WOOL);
  // A swallow-tail.
  if (height > 1) kit.put(cx + length, k, cz, AIR);
}

// ---- the curtain wall ---------------------------------------------------------------------------------------

/**
 * A stretch of curtain wall, `length` long, three thick, with the outer face at v = 0. Barred windows in two rows,
 * a belt of carved stone, a ledge, and a wall walk behind merlons and rails. `front` adds the stairs up to the walk.
 */
function curtain(f: Frame, length: number, front: boolean): void {
  f.bricks(0, 0, 0, length - 1, WALL_H, 2);
  // Carved belt just under the walk.
  f.fill(0, WALL_H - 1, 0, length - 1, WALL_H - 1, 0, CHISELED);
  // A ledge, hung out over the face.
  for (let u = 0; u < length; u++) f.stair(u, WALL_H, -1, BRICK_MAT, 2, true);

  // Light pillars at the ends and the middle.
  for (const u of [0, length - 1, (length - 1) / 2]) f.fill(u, 1, 0, u, WALL_H - 2, 0, POLISHED);

  // Windows: two tall slits and two small ones above them in each half, with a pocket behind the bars.
  for (const u of length > 12 ? [2, 4, 10, 12] : [2, length - 3]) {
    f.fill(u, 2, 0, u, 4, 0, BARS);
    f.fill(u, 2, 1, u, 4, 1, AIR);
    f.put(u, 7, 0, BARS);
    f.put(u, 7, 1, AIR);
  }

  // The walk: merlons in front with a rail in the gaps, a rail behind.
  for (let u = 0; u < length; u++) {
    if (u % 2 === 0) f.fill(u, WALL_H + 1, 0, u, WALL_H + 2, 0, BRICK);
    else f.put(u, WALL_H + 1, 0, ACACIA_FENCE);
    f.put(u, WALL_H + 1, 2, ACACIA_FENCE);
  }
  // A lantern on two of the merlons, so the wall is lit.
  for (const u of [4, 10]) f.put(u, WALL_H + 3, 0, LANTERN);

  if (front) {
    // Stairs from the courtyard up to the walk, along the inner face.
    for (let i = 0; i < WALL_H; i++) {
      const u = length - 3 - i;
      if (u < 1) break;
      if (i > 0) f.fill(u, 1, 3, u, i, 3, BRICK);
      f.stair(u, i + 1, 3, BRICK_MAT, 1);
    }
    // The rail gives way where the stairs arrive.
    for (let u = 3; u <= 5; u++) f.put(u, WALL_H + 1, 2, AIR);
  }
}

// ---- the gatehouse ------------------------------------------------------------------------------------------

/**
 * The tall gate in the middle: an arch, barred windows, a balcony with a gold rail under a dark notch, and a
 * crenellated top. Inside is a hall above the arch. `u` is x; `v` runs from the front face (0) into the castle (8).
 */
function gatehouse(f: Frame): void {
  const top = GATE_H;
  f.bricks(-5, 0, 0, 5, top, 8);
  // Pillars on the corners, two wide on the front.
  for (const u of [-5, -4, 4, 5]) f.fill(u, 0, 0, u, top, 0, POLISHED);
  for (const u of [-5, 5]) {
    f.fill(u, 0, 1, u, top, 1, POLISHED);
    f.fill(u, 0, 7, u, top, 8, POLISHED);
  }

  // The arch: five wide and four high, with the top corners rounded off, and a bar across the top.
  f.fill(-2, 1, 0, 2, 4, 8, AIR);
  f.fill(-1, 5, 0, 1, 5, 8, AIR);
  for (let v = 0; v <= 8; v++) {
    f.stair(-2, 5, v, BRICK_MAT, 1, true);
    f.stair(2, 5, v, BRICK_MAT, 0, true);
  }
  f.fill(-2, 4, 1, 2, 4, 1, BARS);
  // Carved stone round the arch.
  f.fill(-3, 1, 0, -3, 5, 0, CHISELED);
  f.fill(3, 1, 0, 3, 5, 0, CHISELED);
  f.fill(-3, 6, 0, 3, 6, 0, CHISELED);
  // Lanterns hung inside the passage, and arrow slits that look into it.
  for (const v of [2, 6]) f.put(0, 5, v, LANTERN_HANG);
  for (const u of [-3, 3]) {
    f.fill(u, 2, 0, u, 4, 0, BARS);
    f.fill(u, 2, 1, u, 4, 1, AIR);
  }

  // The hall above: a floor level with the wall walks, a ceiling under the roof.
  f.fill(-4, 10, 1, 4, 10, 7, ACACIA_PLANKS);
  f.fill(-4, 11, 1, 4, top - 1, 7, AIR);
  // Doors out to the walls (the walks reach the gatehouse at its sides) and to the balcony in front.
  f.fill(-5, 11, 3, -5, 12, 3, AIR);
  f.fill(5, 11, 3, 5, 12, 3, AIR);
  f.fill(-1, 11, 0, 1, 12, 0, AIR);
  // Windows beside the balcony door.
  for (const u of [-3, 3]) f.fill(u, 11, 0, u, 14, 0, BARS);
  // The dark notch: a triangle of dark brick in the face, point up.
  for (let i = 0; i < 4; i++) f.fill(-3 + i, 15 + i, 0, 3 - i, 15 + i, 0, DEEP);
  f.put(0, 15, 0, DEEP_CRACKED);

  // The balcony: two deep, a slab on carved corbels, with a gold rail round three sides.
  for (let u = -4; u <= 4; u++) {
    for (const v of [-1, -2]) {
      f.stair(u, 9, v, POLISHED_MAT, 2, true);
      f.slab(u, 10, v, BRICK_MAT, false);
    }
  }
  for (let u = -4; u <= 4; u++) f.put(u, 11, -2, BIRCH_FENCE);
  for (const u of [-4, 4]) f.put(u, 11, -1, BIRCH_FENCE);
  for (const u of [-4, 4]) f.put(u, 12, -2, LANTERN);

  // The crenellated top: merlons with a rail between them, on all four sides, over a ledge along the front.
  const edge = (u: number, v: number): void => {
    if (((u + v) & 1) === 0) f.fill(u, top + 1, v, u, top + 2, v, BRICK);
    else f.put(u, top + 1, v, ACACIA_FENCE);
  };
  for (let u = -5; u <= 5; u++) {
    edge(u, 0);
    edge(u, 8);
  }
  for (let v = 1; v <= 7; v++) {
    edge(-5, v);
    edge(5, v);
  }
  for (let u = -5; u <= 5; u++) f.stair(u, top, -1, BRICK_MAT, 2, true);
  // Red banners hang down the pillars either side of the gate.
  for (const u of [-4, 4]) {
    f.put(u, 7, -1, bannerId(RED, f.dir(2), true));
    f.put(u, 6, -1, bannerId(RED, f.dir(2), true));
  }
  gateHall(f);
}

/** The hall above the gate: a red runner, shelves, chests and light. */
function gateHall(f: Frame): void {
  f.fill(-1, 11, 1, 1, 11, 7, CARPET_RED);
  f.fill(-4, 11, 7, -2, 12, 7, B.BOOKSHELF);
  f.fill(2, 11, 7, 4, 12, 7, B.BOOKSHELF);
  f.kit.chest(f.x(-4, 6), f.kit.g + 11, f.z(-4, 6), chestId(f.dir(0), 0), 'village');
  f.kit.chest(f.x(4, 6), f.kit.g + 11, f.z(4, 6), chestId(f.dir(1), 0), 'village');
  for (const v of [2, 5]) {
    f.put(0, 18, v, LANTERN_HANG);
    for (const u of [-3, 3]) f.put(u, 18, v, LANTERN_HANG);
  }
  f.put(-2, 11, 2, candleId(-1, 4));
  f.put(2, 11, 2, candleId(-1, 4));
}

// ---- the front of the castle --------------------------------------------------------------------------------

/** A row of hedge with flowers on it. */
function hedge(kit: Kit, x0: number, z0: number, x1: number, z1: number, h: number, flowers: number): void {
  kit.fill(x0, 1, z0, x1, h, z1, B.LEAVES);
  for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      if (hash2(x * 11 + 5, kit.g, z * 13 + 7) < flowers) kit.put(x, h + 1, z, FLOWERS[Math.floor(hash2(x, 3, z) * FLOWERS.length)]);
    }
  }
}

/** A lamp post: a fence with a lantern on top. */
function lamp(kit: Kit, x: number, z: number, h = 2): void {
  kit.fill(x, 1, z, x, h, z, DARK_FENCE);
  kit.put(x, h + 1, z, LANTERN);
}

function forecourt(kit: Kit): void {
  // Hedges along the foot of the front: in the recess of each curtain wall, and before each tower.
  for (const [x0, x1] of [
    [-20, -6],
    [6, 20],
  ] as const) hedge(kit, x0, FRONT - 1, x1, FRONT - 1, 1, 0.5);
  for (const [x0, x1] of [
    [-29, -22],
    [22, 29],
  ] as const) hedge(kit, x0, FRONT + 1, x1, FRONT + 1, 1, 0.45);
  // And round the sides and the back.
  for (const x of [-SIDE - 1, SIDE + 1]) hedge(kit, x, -86, x, -72, 1, 0.4);
  // (a gap is left for the postern at x = 14..16)
  for (const [x0, x1] of [
    [-20, 12],
    [18, 20],
  ] as const) hedge(kit, x0, CURTAIN_BACK - 1, x1, CURTAIN_BACK - 1, 1, 0.4);

  // The bridge to the gate: dark planks between two rails, edged with logs, and a path beyond.
  for (let z = FRONT + 1; z <= FRONT + 8; z++) {
    kit.fill(-2, 0, z, 2, 0, z, DARK_PLANKS);
    kit.put(-3, 0, z, DARK_LOG_STRIPPED);
    kit.put(3, 0, z, DARK_LOG_STRIPPED);
    if (z % 2 === 0) {
      kit.put(-3, 1, z, DARK_FENCE);
      kit.put(3, 1, z, DARK_FENCE);
    }
  }
  kit.fill(-3, 1, FRONT + 1, -3, 1, FRONT + 8, DARK_FENCE);
  kit.fill(3, 1, FRONT + 1, 3, 1, FRONT + 8, DARK_FENCE);
  lamp(kit, -3, FRONT + 8, 2);
  lamp(kit, 3, FRONT + 8, 2);
  lamp(kit, -3, FRONT + 1, 2);
  lamp(kit, 3, FRONT + 1, 2);
  // The path from the bridge to the edge of the flat ground: polished stone with a brick edge.
  kit.fill(-2, 0, FRONT + 9, 2, 0, GREYKEEP.z1, POLISHED);
  kit.fill(-3, 0, FRONT + 9, -3, 0, GREYKEEP.z1, BRICK);
  kit.fill(3, 0, FRONT + 9, 3, 0, GREYKEEP.z1, BRICK);
  for (let z = FRONT + 12; z < GREYKEEP.z1; z += 6) {
    lamp(kit, -4, z);
    lamp(kit, 4, z);
  }
}

// ---- the courtyard ------------------------------------------------------------------------------------------

function courtyard(kit: Kit): void {
  // The passage floor, and a paved plaza inside the gate with a path to the hall's door.
  kit.fill(-2, 0, -68, 2, 0, FRONT - 1, POLISHED);
  kit.fill(-1, 0, -68, 1, 0, FRONT - 1, BRICK);
  kit.fill(-4, 0, -74, 4, 0, -69, POLISHED);
  kit.fill(-3, 0, -73, 3, 0, -70, BRICK);
  kit.fill(-1, 0, -72, 1, 0, -71, CHISELED);
  kit.fill(-2, 0, -79, 2, 0, -75, POLISHED);
  kit.fill(-1, 0, -79, 1, 0, -75, BRICK);
  // A bench each side of the plaza, facing the path, and lamps.
  for (const s of [-1, 1]) {
    for (const z of [-71, -72]) kit.put(s * 5, 1, z, stairId(SPRUCE_MAT, false, s < 0 ? 1 : 0));
    lamp(kit, s * 5, -69);
    lamp(kit, s * 5, -74);
    lamp(kit, s * 3, -79);
    // Paved ways out to the gardens, and lamps along the foot of the side walls and the back.
    kit.fill(Math.min(s * 3, s * 12), 0, -78, Math.max(s * 3, s * 12), 0, -77, POLISHED);
    for (const z of [-74, -82]) lamp(kit, s * 25, z);
    lamp(kit, s * 13, CURTAIN_BACK + 3);
  }
  garden(kit, -1);
  garden(kit, 1);
}

/** A flower garden with a hedge round it, east or west of the path (`s` is the side). The west one has a well. */
function garden(kit: Kit, s: number): void {
  const xa = Math.min(s * 12, s * 24);
  const xb = Math.max(s * 12, s * 24);
  const z0 = -84;
  const z1 = -72;
  // Flowers on the grass inside.
  for (let z = z0 + 1; z < z1; z++) {
    for (let x = xa + 1; x < xb; x++) {
      if (hash2(x * 3 + 9, kit.g + 2, z * 7 + 1) < 0.5) kit.put(x, 1, z, FLOWERS[Math.floor(hash2(x + 40, 5, z) * FLOWERS.length)]);
    }
  }
  // The hedge round it, open toward the path.
  hedge(kit, xa, z0, xb, z0, 1, 0.3);
  hedge(kit, xa, z1, xb, z1, 1, 0.3);
  hedge(kit, s * 24, z0, s * 24, z1, 1, 0.3);
  hedge(kit, s * 12, z0, s * 12, -79, 1, 0.3);
  hedge(kit, s * 12, -76, s * 12, z1, 1, 0.3);
  kit.fill(s * 12, 1, -78, s * 12, 2, -77, AIR);
  if (s < 0) {
    // A well in the middle: a brick ring round a pool, posts and a little roof.
    const wx = -18;
    const wz = -78;
    kit.fill(wx - 2, 1, wz - 2, wx + 2, 1, wz + 2, BRICK);
    kit.fill(wx - 2, 0, wz - 2, wx + 2, 0, wz + 2, BRICK);
    kit.fill(wx - 1, 1, wz - 1, wx + 1, 1, wz + 1, AIR);
    kit.fill(wx - 1, 0, wz - 1, wx + 1, 0, wz + 1, B.WATER);
    kit.fill(wx - 1, -1, wz - 1, wx + 1, -1, wz + 1, BRICK);
    for (const dx of [-2, 2]) for (const dz of [-2, 2]) kit.fill(wx + dx, 2, wz + dz, wx + dx, 4, wz + dz, DARK_FENCE);
    for (let x = wx - 2; x <= wx + 2; x++) {
      kit.put(x, 5, wz - 2, stairId(DARK_MAT, false, 2));
      kit.put(x, 5, wz + 2, stairId(DARK_MAT, false, 3));
    }
    for (let z = wz - 1; z <= wz + 1; z++) {
      kit.put(wx - 2, 5, z, stairId(DARK_MAT, false, 0));
      kit.put(wx + 2, 5, z, stairId(DARK_MAT, false, 1));
    }
    kit.fill(wx - 1, 5, wz - 1, wx + 1, 5, wz + 1, DARK_PLANKS);
    kit.put(wx, 6, wz, slabId(DARK_MAT, false));
    kit.put(wx, 4, wz, LANTERN_HANG);
  } else {
    // Two benches facing each other, and a lamp between.
    for (const x of [17, 19]) {
      kit.put(x, 1, -81, stairId(SPRUCE_MAT, false, 3));
      kit.put(x, 1, -75, stairId(SPRUCE_MAT, false, 2));
    }
    lamp(kit, 18, -78);
    kit.fill(17, 0, -80, 19, 0, -76, POLISHED);
    kit.put(18, 1, -78, LANTERN);
    kit.put(18, 1, -78, DARK_FENCE);
    kit.put(18, 2, -78, DARK_FENCE);
    kit.put(18, 3, -78, LANTERN);
  }
}

// ---- the great hall -----------------------------------------------------------------------------------------

/**
 * A long hall of stone below and timber above under a dark gabled roof, at the back of the courtyard. Open to the
 * rafters inside: a red runner to a dais, tables and benches, chandeliers and banners.
 */
function hall(kit: Kit): void {
  const x0 = -10;
  const x1 = 10;
  const z0 = -92;
  const z1 = -80;
  const mid = -86;
  const eaves = 9;

  // The walls: stone to head height, then plaster and timber.
  bricks(kit, x0, 0, z0, x1, 6, z1);
  kit.fill(x0 + 1, 1, z0 + 1, x1 - 1, eaves, z1 - 1, AIR);
  kit.fill(x0, 7, z0, x1, eaves, z1, PLASTER);
  kit.fill(x0 + 1, 7, z0 + 1, x1 - 1, eaves, z1 - 1, AIR);
  // Timber: posts every five blocks, a sill and a plate.
  for (const x of [-10, -5, 0, 5, 10]) {
    kit.fill(x, 7, z0, x, eaves, z0, SPRUCE_LOG);
    kit.fill(x, 7, z1, x, eaves, z1, SPRUCE_LOG);
  }
  for (const z of [-92, -86, -80]) {
    kit.fill(x0, 7, z, x0, eaves, z, SPRUCE_LOG);
    kit.fill(x1, 7, z, x1, eaves, z, SPRUCE_LOG);
  }
  kit.fill(x0, 7, z0, x1, 7, z0, SPRUCE_LOG);
  kit.fill(x0, 7, z1, x1, 7, z1, SPRUCE_LOG);
  kit.fill(x0, eaves, z0, x1, eaves, z0, SPRUCE_LOG);
  kit.fill(x0, eaves, z1, x1, eaves, z1, SPRUCE_LOG);
  // Panes in the timber, bars in the stone.
  for (const x of [-8, -7, -3, -2, 2, 3, 7, 8]) {
    kit.put(x, 8, z0, B.PANE);
    kit.put(x, 8, z1, B.PANE);
  }
  for (const z of [-90, -89, -83, -82]) {
    kit.put(x0, 8, z, B.PANE);
    kit.put(x1, 8, z, B.PANE);
  }
  for (const x of [-7, -4, 4, 7]) kit.fill(x, 2, z1, x, 4, z1, BARS);
  for (const x of [-7, 7]) kit.fill(x, 2, z0, x, 4, z0, BARS);
  for (const z of [-89, -83]) {
    kit.fill(x0, 2, z, x0, 4, z, BARS);
    kit.fill(x1, 2, z, x1, 4, z, BARS);
  }

  // The door: three wide, in a frame of light stone with a carved lintel.
  kit.fill(-1, 1, z1, 1, 3, z1, AIR);
  kit.fill(-2, 1, z1, -2, 4, z1, POLISHED);
  kit.fill(2, 1, z1, 2, 4, z1, POLISHED);
  kit.fill(-2, 4, z1, 2, 4, z1, CHISELED);
  kit.fill(-1, 1, z1 - 1, 1, 3, z1 - 1, AIR);
  // Steps up to it from the path.
  for (const x of [-1, 0, 1]) kit.put(x, 0, z1 + 1, POLISHED);
  lamp(kit, -3, z1 + 1, 2);
  lamp(kit, 3, z1 + 1, 2);
  for (const x of [-4, 4]) kit.put(x, 5, z1 + 1, bannerId(RED, 3, true));

  // The roof: stairs of dark tile, sloping from the eaves up to the ridge. Each side overhangs the wall by a block, and so do the gables.
  for (let d = 0; d <= 7; d++) {
    const rk = eaves + 1 + (6 - d);
    for (const side of d === 0 ? [-1] : [-1, 1]) {
      const z = mid + side * d;
      kit.fill(x0 - 1, rk, z, x1 + 1, rk, z, d === 0 ? TILES : stairId(TILES_MAT, false, side < 0 ? 2 : 3));
      // The gables close the space under the roof at both ends.
      if (rk - 1 > eaves) {
        kit.fill(x0, eaves + 1, z, x0, rk - 1, z, PLASTER);
        kit.fill(x1, eaves + 1, z, x1, rk - 1, z, PLASTER);
      }
    }
  }
  // Heavy tie beams across the hall, and a chimney through the roof at the hearth end.
  for (const z of [-90, -86, -82]) kit.fill(x0 + 1, eaves + 1, z, x1 - 1, eaves + 1, z, DARK_LOG);
  kit.fill(9, eaves + 6, -87, 10, eaves + 11, -86, BRICK);
  kit.fill(9, eaves + 12, -87, 10, eaves + 12, -86, DEEP);

  // Inside: a red runner to the dais, with a throne, and banners behind it.
  kit.fill(-1, 1, z0 + 4, 1, 1, z1 - 1, CARPET_RED);
  kit.fill(-4, 1, z0 + 1, 4, 1, z0 + 3, slabId(BRICK_MAT, false));
  kit.put(0, 1, z0 + 1, stairId(DARK_MAT, false, 3));
  kit.put(-2, 1, z0 + 1, stairId(DARK_MAT, false, 3));
  kit.put(2, 1, z0 + 1, stairId(DARK_MAT, false, 3));
  for (const x of [-5, -3, 3, 5]) {
    kit.put(x, 5, z0 + 1, bannerId(RED, 3, true));
    kit.put(x, 4, z0 + 1, bannerId(RED, 3, true));
  }
  kit.put(0, 5, z0 + 1, bannerId(RED, 3, true));
  kit.put(0, 4, z0 + 1, bannerId(RED, 3, true));
  // Two long tables with benches, and candles.
  for (const s of [-1, 1]) {
    for (let z = -89; z <= -83; z++) {
      kit.put(s * 6, 1, z, slabId(SPRUCE_MAT, false));
      kit.put(s * 5, 1, z, stairId(SPRUCE_MAT, false, s < 0 ? 0 : 1));
      kit.put(s * 7, 1, z, stairId(SPRUCE_MAT, false, s < 0 ? 1 : 0));
    }
    kit.put(s * 6, 2, -88, candleId(-1, 2));
    kit.put(s * 6, 2, -84, candleId(-1, 3));
    // A chest and shelves at the head of the hall.
    kit.chest(s * 8, kit.g + 1, z0 + 1, chestId(2, 0), 'village');
    kit.fill(s * 9, 1, z0 + 1, s * 9, 3, z0 + 3, B.BOOKSHELF);
    // Banners on the long walls.
    for (const z of [-88, -84]) {
      kit.put(s * 9, 6, z, bannerId(RED, s < 0 ? 1 : 0, true));
      kit.put(s * 9, 5, z, bannerId(RED, s < 0 ? 1 : 0, true));
    }
  }
  // A hearth against the end wall: a stone chimney breast with a fire in it.
  kit.fill(9, 1, -88, 9, 4, -84, BRICK);
  kit.fill(9, 1, -86, 9, 2, -86, AIR);
  kit.put(9, 1, -86, campfireId(1, true));
  kit.put(9, 3, -86, slabId(BRICK_MAT, false));
  // Chandeliers: a chain from each beam and a lantern on the end.
  for (const z of [-90, -86, -82]) {
    for (const x of [-6, 0, 6]) {
      kit.fill(x, 8, z, x, eaves, z, B.CHAIN);
      kit.put(x, 7, z, LANTERN_HANG);
    }
  }
}

// ---- the back door ------------------------------------------------------------------------------------------

function postern(kit: Kit): void {
  // A little arched gate in the back wall, east of the hall.
  kit.fill(14, 1, CURTAIN_BACK, 16, 3, CURTAIN_BACK + 2, AIR);
  kit.fill(13, 1, CURTAIN_BACK, 13, 3, CURTAIN_BACK, POLISHED);
  kit.fill(17, 1, CURTAIN_BACK, 17, 3, CURTAIN_BACK, POLISHED);
  kit.fill(13, 4, CURTAIN_BACK, 17, 4, CURTAIN_BACK, CHISELED);
  kit.put(15, 3, CURTAIN_BACK + 1, LANTERN_HANG);
  kit.fill(14, 0, CURTAIN_BACK - 2, 16, 0, CURTAIN_BACK - 1, POLISHED);
}
