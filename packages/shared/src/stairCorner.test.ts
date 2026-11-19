import { describe, expect, it } from 'vitest';
import { B, BUILD_MATERIALS, MASONRY, collisionBoxes, stairFaceCovered, stairId, type Box } from './index';

/**
 * Stairs of one material meet the way Minecraft's do. The tall side is the direction the stair faces.
 * A stair in front of that side, turned across it, cuts an outer corner. One behind cuts an inner corner.
 * Taking the neighbour away leaves a straight step again.
 */

const BRICK = 4;
const DX = [1, -1, 0, 0];
const DZ = [0, 0, 1, -1];
const CCW = [3, 2, 0, 1];
const CW = [2, 3, 1, 0];

const covers = (boxes: readonly Box[], x: number, y: number, z: number): boolean =>
  boxes.some((b) => x >= b[0] && x < b[3] && y >= b[1] && y < b[4] && z >= b[2] && z < b[5]);

describe('stair corners', () => {
  it('stays a straight step on its own, in every direction and both halves', () => {
    const straight: Box[][] = [
      [
        [0, 0, 0, 1, 0.5, 1],
        [0.5, 0.5, 0, 1, 1, 1],
      ],
      [
        [0, 0, 0, 1, 0.5, 1],
        [0, 0.5, 0, 0.5, 1, 1],
      ],
      [
        [0, 0, 0, 1, 0.5, 1],
        [0, 0.5, 0.5, 1, 1, 1],
      ],
      [
        [0, 0, 0, 1, 0.5, 1],
        [0, 0.5, 0, 1, 1, 0.5],
      ],
    ];
    for (let d = 0; d < 4; d++) {
      expect(collisionBoxes(stairId(BRICK, false, d), () => 0)).toEqual(straight[d]);
      expect(collisionBoxes(stairId(BRICK, true, d), () => 0)).toEqual(straight[d]!.map((b): Box => [b[0], 1 - b[4], b[2], b[3], 1 - b[1], b[5]]));
    }
  });

  it('cuts an outer corner in front and an inner corner behind', () => {
    const east = stairId(BRICK, false, 0);
    expect(collisionBoxes(east, (dx, dz) => (dx === 1 && dz === 0 ? stairId(BRICK, false, 2) : 0))).toEqual([
      [0, 0, 0, 1, 0.5, 1],
      [0.5, 0.5, 0.5, 1, 1, 1],
    ]);
    expect(collisionBoxes(east, (dx, dz) => (dx === 1 && dz === 0 ? stairId(BRICK, false, 3) : 0))).toEqual([
      [0, 0, 0, 1, 0.5, 1],
      [0.5, 0.5, 0, 1, 1, 0.5],
    ]);
    expect(collisionBoxes(east, (dx, dz) => (dx === -1 && dz === 0 ? stairId(BRICK, false, 2) : 0))).toEqual([
      [0, 0, 0, 1, 0.5, 1],
      [0.5, 0.5, 0, 1, 1, 1],
      [0, 0.5, 0.5, 0.5, 1, 1],
    ]);
    expect(collisionBoxes(east, (dx, dz) => (dx === -1 && dz === 0 ? stairId(BRICK, false, 3) : 0))).toEqual([
      [0, 0, 0, 1, 0.5, 1],
      [0.5, 0.5, 0, 1, 1, 1],
      [0, 0.5, 0, 0.5, 1, 0.5],
    ]);
  });

  it('meets its neighbour on every side, right way up and upside down, with no gap and no overlap', () => {
    for (const top of [false, true]) {
      for (let dir = 0; dir < 4; dir++) {
        for (const [kind, side] of [
          ['outer', CCW[dir]!],
          ['outer', CW[dir]!],
          ['inner', CCW[dir]!],
          ['inner', CW[dir]!],
        ] as const) {
          const front = kind === 'outer';
          const ox = (front ? 1 : -1) * DX[dir]!;
          const oz = (front ? 1 : -1) * DZ[dir]!;
          const a = stairId(BRICK, top, dir);
          const b = stairId(BRICK, top, side);
          const at = (x: number, z: number) => (x === 0 && z === 0 ? a : x === ox && z === oz ? b : 0);
          const aBoxes = collisionBoxes(a, (dx, dz) => at(dx, dz));
          const bBoxes = collisionBoxes(b, (dx, dz) => at(ox + dx, oz + dz));
          const face = dir === 0 || dir === 2 ? 1 : 0;
          const intoA = front ? (face === 1 ? 0.99 : 0.01) : face === 1 ? 0.01 : 0.99;
          const intoB = front ? (face === 1 ? 0.01 : 0.99) : face === 1 ? 0.99 : 0.01;
          for (const u of [0.25, 0.75]) {
            for (const y of [0.25, 0.75]) {
              const ax = dir < 2 ? intoA : u;
              const az = dir < 2 ? u : intoA;
              const bx = dir < 2 ? intoB : u;
              const bz = dir < 2 ? u : intoB;
              expect(covers(aBoxes, ax, y, az), `${kind} dir ${dir} side ${side} top ${top}`).toBe(covers(bBoxes, bx, y, bz));
            }
          }
        }
      }
    }
  });

  it('leaves a flight straight, and ignores a different material or the other half', () => {
    const east = stairId(BRICK, false, 0);
    const straight = collisionBoxes(east, () => 0);
    expect(collisionBoxes(east, (dx) => (dx === 1 ? east : 0))).toEqual(straight);
    expect(collisionBoxes(east, (dx, dz) => (dx === 1 && dz === 0 ? stairId(BRICK, false, 2) : dx === 0 && dz === -1 ? east : 0))).toEqual(straight);
    expect(collisionBoxes(east, (dx) => (dx === 1 ? stairId(0, false, 2) : 0))).toEqual(straight);
    expect(collisionBoxes(east, (dx) => (dx === 1 ? stairId(BRICK, true, 2) : 0))).toEqual(straight);
  });

  it('connects deepslate bricks the same way, and hides a face the neighbour already fills', () => {
    const row = MASONRY.find((r) => r.spec.name === 'deepslate_bricks');
    expect(row).toBeTruthy();
    const mat = BUILD_MATERIALS.length + row!.index;
    const a = stairId(mat, false, 0);
    const b = stairId(mat, false, 2);
    expect(collisionBoxes(a, (dx, dz) => (dx === 1 && dz === 0 ? b : 0))).toEqual([
      [0, 0, 0, 1, 0.5, 1],
      [0.5, 0.5, 0.5, 1, 1, 1],
    ]);
    const beside = (dx: number, dz: number) => (dx === 1 && dz === 0 ? b : 0);
    expect(stairFaceCovered(b, 0, 0.5, 1, 0.5, 1, beside)).toBe(true);
    expect(stairFaceCovered(b, 0, 0.5, 1, 0, 0.5, beside)).toBe(false);
    expect(stairFaceCovered(B.STONE, 0, 0.5, 1, 0, 1, () => 0)).toBe(true);
  });
});
