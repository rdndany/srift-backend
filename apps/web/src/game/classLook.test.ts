import { describe, expect, it } from 'vitest';
import { rangerLook } from './rangerLook';
import { U } from './sculptGear';
import { warriorLook } from './warriorLook';

describe.each([['Warrior', warriorLook, 1000], ['Ranger', rangerLook, 1000]] as const)('the %s sculpted from small cubes', (_name, look, min) => {
  const parts = look();

  it('is finer than the skin and drawn only where the air touches it', () => {
    expect(parts.reduce((n, p) => n + p.bricks.length, 0)).toBeGreaterThan(min);
    for (const p of parts) for (const b of p.bricks) {
      expect(b[3]).toBe(U);
      expect(b[8]).toBeGreaterThan(0);
    }
  });

  it('has a piece for the head, and a cape unless it is the Ranger (whose quiver shows)', () => {
    expect(parts.some((p) => p.slot === 'head' && p.bricks.length > 0)).toBe(true);
    expect(parts.some((p) => p.slot === 'cape')).toBe(_name !== 'Ranger');
  });
});

describe('the Warrior stays thin', () => {
  it('builds only what stands out: no block over the body, the lower legs or the feet', () => {
    const parts = warriorLook();
    expect(parts.some((p) => p.part === 'torso')).toBe(false);
    expect(parts.some((p) => p.slot === 'feet')).toBe(false);
    expect(parts.filter((p) => p.slot === 'chest').map((p) => p.part).sort()).toEqual(['armL', 'armR']);
  });

  it('has no face of the helm on the same plane as a face of the head (the two would flicker)', () => {
    const helm = warriorLook().find((p) => p.slot === 'head')!;
    const half = 0.25;
    const lo = -0.15;
    const hi = 0.35;
    const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.002;
    const inside = (v: number, a: number, b: number): boolean => v > a + 0.001 && v < b - 0.001;
    const clashes: number[][] = [];
    // The head's faces (and the outer layer's, a little further out) that look outwards: +x, -x, +y, -y, +z (the back), -z (the front).
    const out = 0.01875;
    for (const b of helm.bricks) {
      const [x, y, z, , , , , , mask] = b as [number, number, number, number, number, number, number, number, number];
      const h = U / 2;
      const inYZ = inside(y, lo, hi) && inside(z, -half, half);
      const inXZ = inside(x, -half, half) && inside(z, -half, half);
      const inXY = inside(x, -half, half) && inside(y, lo, hi);
      const hit = [
        inYZ && (near(x + h, half) || near(x + h, half + out)),
        inYZ && (near(x - h, -half) || near(x - h, -half - out)),
        inXZ && (near(y + h, hi) || near(y + h, hi + out)),
        inXZ && (near(y - h, lo) || near(y - h, lo - out)),
        inXY && (near(z + h, half) || near(z + h, half + out)),
        inXY && (near(z - h, -half) || near(z - h, -half - out)),
      ];
      hit.forEach((on, bit) => {
        if (on && mask & (1 << bit)) clashes.push([x, y, z, bit]);
      });
    }    expect(clashes).toEqual([]);
  });

  it('mirrors the left knee guard onto the right', () => {
    const xs = (part: string): number[] => warriorLook().find((p) => p.slot === 'legs' && p.part === part)!.bricks.map((b) => b[0]!);
    expect(Math.max(...xs('legR'))).toBeCloseTo(-Math.min(...xs('legL')), 5);
  });
});
