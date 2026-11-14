import { B, gateId, slabId, stairId, woolId } from './blocks';
import type { Put } from './villageBuilders';

/**
 * The furnishings of Dawnwatch's open ground: trees, a fountain, flower beds, benches, hay, crates, carts and fences.
 * All of them take absolute world x and z (the height is relative to the village ground) and are built with the same
 * `put` the buildings use.
 */

const MAT_WOOD = 0;
const MAT_STONE = 2;
const MAT_BRICK = 4;

export type TreeKind = 'oak' | 'birch';

/** A tree: a trunk and a rounded crown. `trunk` is the number of logs. */
export function tree(put: Put, x: number, z: number, kind: TreeKind, trunk: number): void {
  const log = kind === 'oak' ? B.LOG : B.BIRCH_LOG;
  const leaf = kind === 'oak' ? B.LEAVES : B.BIRCH_LEAVES;
  const layers: { dy: number; r: number }[] = [
    { dy: trunk - 1, r: 2 },
    { dy: trunk, r: 2 },
    { dy: trunk + 1, r: 1 },
    { dy: trunk + 2, r: 1 },
  ];
  for (const { dy, r } of layers) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const corner = Math.abs(dx) === r && Math.abs(dz) === r;
        if (corner && (r === 2 || dy === trunk + 2)) continue;
        if (dx === 0 && dz === 0 && dy <= trunk) continue;
        put(x + dx, dy, z + dz, leaf);
      }
    }
  }
  for (let y = 1; y <= trunk; y++) put(x, y, z, log);
}

/** A round fountain on a stepped stone base, five blocks across, with a spout in the middle. */
export function fountain(put: Put, cx: number, cz: number): void {
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      const ring = Math.max(Math.abs(dx), Math.abs(dz));
      const corner = Math.abs(dx) === 2 && Math.abs(dz) === 2;
      if (corner) continue;
      if (ring === 2) {
        put(cx + dx, 1, cz + dz, B.STONE_BRICKS);
        put(cx + dx, 2, cz + dz, slabId(MAT_BRICK, false));
      } else {
        put(cx + dx, 0, cz + dz, B.STONE_BRICKS);
        put(cx + dx, 1, cz + dz, B.WATER);
      }
    }
  }
  // The spout: a column with a lamp on top and a small basin of slabs round it.
  for (let y = 1; y <= 3; y++) put(cx, y, cz, B.STONE_BRICKS);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) put(cx + dx, 3, cz + dz, slabId(MAT_BRICK, true));
  put(cx, 4, cz, B.GLOWSTONE);
}

/** A bed of flowers inside a low hedge, with a gap in the hedge on one side. */
export function flowerGarden(put: Put, x0: number, z0: number, x1: number, z1: number, gap: 'N' | 'E' | 'S' | 'W', rand: () => number): void {
  for (let z = z0 - 1; z <= z1 + 1; z++) {
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      const edge = x < x0 || x > x1 || z < z0 || z > z1;
      if (edge) {
        const midX = (x0 + x1) >> 1;
        const midZ = (z0 + z1) >> 1;
        const open = (gap === 'E' && x === x1 + 1 && z === midZ) || (gap === 'W' && x === x0 - 1 && z === midZ) || (gap === 'N' && z === z0 - 1 && x === midX) || (gap === 'S' && z === z1 + 1 && x === midX);
        if (!open) put(x, 1, z, B.LEAVES);
        continue;
      }
      const r = rand();
      put(x, 0, z, B.DIRT);
      put(x, 1, z, r < 0.4 ? B.ROSE : r < 0.8 ? B.DANDELION : B.TALL_GRASS);
    }
  }
}

/** A bench for two. `dir` is the way its back faces (0 = +x, 1 = -x, 2 = +z, 3 = -z). */
export function bench(put: Put, x: number, z: number, dir: number, alongX: boolean): void {
  const dx = alongX ? 1 : 0;
  const dz = alongX ? 0 : 1;
  for (const k of [0, 1]) put(x + dx * k, 1, z + dz * k, stairId(MAT_WOOD, false, dir));
}

/** A hay bale (yellow cloth is the nearest we have), `n` high. */
export function hayBale(put: Put, x: number, z: number, n = 1): void {
  for (let y = 1; y <= n; y++) put(x, y, z, woolId(4));
}

/** A stack of crates: planks with a trapdoor-like lid of slabs. */
export function crates(put: Put, x: number, z: number, height: number): void {
  for (let y = 1; y <= height; y++) put(x, y, z, B.PLANKS);
  if (height > 1) put(x, height + 1, z, slabId(MAT_WOOD, false));
}

/** A hand cart, three long and two wide: a bed of planks with a rail, two wheels of logs and a heap of hay in it. */
export function cart(put: Put, x: number, z: number, alongX: boolean): void {
  const at = (i: number, j: number): [number, number] => (alongX ? [x + i, z + j] : [x + j, z + i]);
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 3; i++) {
      const [px, pz] = at(i, j);
      put(px, 1, pz, B.PLANKS);
      if (j === 0 || i === 0) put(px, 2, pz, B.FENCE);
    }
  }
  for (const [i, j] of [[1, 1], [2, 1]] as const) {
    const [px, pz] = at(i, j);
    put(px, 2, pz, woolId(4));
  }
  // The shafts.
  for (const k of [1, 2]) {
    const [px, pz] = at(-k, 0);
    put(px, 1, pz, B.FENCE);
  }
}

/** A tall pole with a flag of the given colour (a wool colour index) flying toward +x. */
export function banner(put: Put, x: number, z: number, colour: number): void {
  for (let y = 1; y <= 6; y++) put(x, y, z, B.FENCE);
  for (let y = 4; y <= 6; y++) {
    put(x + 1, y, z, woolId(colour));
    if (y > 4) put(x + 2, y, z, woolId(colour));
  }
  put(x, 7, z, B.TORCH);
}

/** A fence round a rectangle, with one gate in a side. */
export function fencedRing(put: Put, x0: number, z0: number, x1: number, z1: number, gates: readonly { x: number; z: number }[]): void {
  for (let x = x0; x <= x1; x++) for (const z of [z0, z1]) put(x, 1, z, B.FENCE);
  for (let z = z0 + 1; z < z1; z++) for (const x of [x0, x1]) put(x, 1, z, B.FENCE);
  for (const g of gates) {
    const alongX = g.z === z0 || g.z === z1;
    put(g.x, 1, g.z, gateId(false, alongX ? 2 : 0));
  }
}

/** An open shelter: four log posts and a slab roof, with hay inside. */
export function shelter(put: Put, x0: number, z0: number, x1: number, z1: number): void {
  for (const x of [x0, x1]) for (const z of [z0, z1]) for (let y = 1; y <= 3; y++) put(x, y, z, B.LOG);
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) put(x, 4, z, slabId(MAT_WOOD, false));
  for (let x = x0 + 1; x < x1; x++) put(x, 1, z1 - 1, woolId(4));
  put(x0 + 1, 2, z1 - 1, woolId(4));
}

/** A brazier on a stone column: a lantern for a plaza, lit and a little high. */
export function obelisk(put: Put, x: number, z: number): void {
  put(x, 1, z, B.STONE_BRICKS);
  put(x, 2, z, B.STONE_BRICKS);
  put(x, 3, z, slabId(MAT_STONE, false));
  put(x, 4, z, B.GLOWSTONE);
}
