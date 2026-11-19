import { describe, expect, it } from 'vitest';
import { BODY_SCALE, swimShape } from './character';

describe('the swimming pose', () => {
  it('lies the body out flat, face down, about its middle at the height it floats at', () => {
    const p = swimShape(0, 0);
    expect(p.pitch).toBeCloseTo(-Math.PI / 2, 5);
    // The middle of the body (0.9 of the figure, scaled) stays 0.62 above the feet whatever the angle.
    const middle = 0.9 * BODY_SCALE;
    expect(p.y + middle * Math.cos(p.pitch)).toBeCloseTo(0.62, 5);
    expect(-p.z / middle).toBeCloseTo(Math.sin(p.pitch), 5);
  });

  it('tips the body up when rising and down when sinking, but never upright', () => {
    expect(swimShape(0, 0.4).pitch).toBeGreaterThan(swimShape(0, 0).pitch);
    expect(swimShape(0, -0.4).pitch).toBeLessThan(swimShape(0, 0).pitch);
    expect(Math.abs(swimShape(0, 0.45).pitch)).toBeGreaterThan(1);
  });

  it('works the arms in turn, half a stroke apart, and kicks the legs against each other', () => {
    for (const phase of [0, 0.7, 1.9, 3.3, 5.1]) {
      const p = swimShape(phase, 0);
      expect(p.armR - p.armL).toBeCloseTo(Math.PI, 5);
      expect(p.legL - 0.12).toBeCloseTo(-(p.legR - 0.12), 5);
    }
  });

  it('goes right round with the arms (a full stroke is a full circle) and kicks twice a stroke', () => {
    const a = swimShape(0.4, 0);
    const b = swimShape(0.4 + Math.PI * 2, 0);
    expect(Math.cos(a.armL)).toBeCloseTo(Math.cos(b.armL), 5);
    expect(a.legL).toBeCloseTo(swimShape(0.4 + Math.PI, 0).legL, 5);
  });
});
