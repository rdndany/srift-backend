import { describe, expect, it } from 'vitest';
import { meshBoxes, signId } from '@solrift/shared';
import { signFace } from './signBoards';

describe('where the writing of a sign goes', () => {
  // The writing lies on the front face of the board, which is the face of the model, for every sign: standing or hung, facing any way.
  for (const wall of [false, true]) {
    for (let facing = 0; facing < 4; facing++) {
      it(`is on the front of the board of a ${wall ? 'hung' : 'standing'} sign facing ${facing}`, () => {
        const id = signId(0, facing, wall);
        const boxes = meshBoxes(id, () => 0);
        const board = boxes[wall ? 0 : 1];
        const f = signFace(id, 10, 70, 20)!;
        expect(f).not.toBeNull();
        expect(Math.abs(f.nx) + Math.abs(f.nz)).toBe(1);
        const [x0, y0, z0, x1, y1, z1] = board;
        const px = f.x - 10;
        const py = f.y - 70;
        const pz = f.z - 20;
        // On the face that looks the way the writing looks...
        if (f.nx !== 0) expect(px).toBeCloseTo(f.nx > 0 ? x1 : x0, 5);
        else expect(pz).toBeCloseTo(f.nz > 0 ? z1 : z0, 5);
        // ... in the middle of it, as big as it (the writing is drawn a little smaller than the board).
        if (f.nx !== 0) {
          expect(pz).toBeCloseTo((z0 + z1) / 2, 5);
          expect(f.w).toBeCloseTo(z1 - z0, 5);
        } else {
          expect(px).toBeCloseTo((x0 + x1) / 2, 5);
          expect(f.w).toBeCloseTo(x1 - x0, 5);
        }
        expect(py).toBeCloseTo((y0 + y1) / 2, 5);
        expect(f.h).toBeCloseTo(y1 - y0, 5);
      });
    }
  }

  it('is nowhere for a block that is not a sign', () => {
    expect(signFace(1, 0, 0, 0)).toBeNull();
  });
});
