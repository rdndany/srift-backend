import { describe, expect, it } from 'vitest';
import { Sculpt } from './mobVoxel';
import { mageCubes, mageLook } from './mageLook';
import { U } from './sculptGear';

describe('the Mage sculpted from small cubes', () => {
  const parts = mageLook();

  it('is finer than the skin and drawn only where the air touches it', () => {
    expect(mageCubes()).toBeGreaterThan(1500);
    for (const p of parts) for (const b of p.bricks) {
      expect(b[3]).toBe(U);
      expect(b[8]).toBeGreaterThan(0);
    }
  });

  it('builds the hat, what hangs from the belt, the mantles and the cape, and leaves the robe and the boots to the skin', () => {
    const top = (slot: string, part: unknown): number => Math.max(...parts.filter((p) => p.slot === slot && p.part === part).flatMap((p) => p.bricks.map((b) => b[1]!)));
    expect(top('head', 'head')).toBeGreaterThan(0.8);
    expect(parts.some((p) => p.slot === 'cape')).toBe(true);
    expect(parts.some((p) => p.slot === 'legs' || p.slot === 'feet')).toBe(false);
  });

  it('has no face of the hat on the same plane as a face of the head (the two would flicker)', () => {
    const hat = parts.find((p) => p.slot === 'head')!;
    const half = 0.25;
    const lo = -0.15;
    const hi = 0.35;
    const out = 0.01875;
    const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.002;
    const inside = (v: number, a: number, b: number): boolean => v > a + 0.001 && v < b - 0.001;
    const clashes: number[][] = [];
    for (const b of hat.bricks) {
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
    }
    expect(clashes).toEqual([]);
  });

  it('knows where its cubes are', () => {
    const s = new Sculpt([0, 0, 0], U).box(0, 0, 0, 2, 2, 2, 0);
    expect(s.has(1, 1, 1)).toBe(true);
    expect(s.has(2, 0, 0)).toBe(false);
    expect(s.side(-1).has(-1, 0, 0)).toBe(true);
    expect(s.has(0, 0, 0)).toBe(false);
  });
});
