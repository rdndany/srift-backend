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

  it('works the arms in turn, one reaching while the other pulls, and kicks the legs against each other', () => {
    for (const phase of [0, 0.7, 1.9, 3.3, 5.1]) {
      const p = swimShape(phase, 0);
      expect(p.armL + p.armR).toBeCloseTo(0.7, 5);
      expect(p.legL - 0.12).toBeCloseTo(-(p.legR - 0.12), 5);
    }
  });

  it('keeps each arm inside one short stroke, brings it back out to the side, and kicks twice a stroke', () => {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i <= 24; i++) {
      const phase = (i / 24) * Math.PI * 2;
      const p = swimShape(phase, 0);
      min = Math.min(min, p.armL);
      max = Math.max(max, p.armL);
      if (Math.sin(phase) < -0.4) {
        expect(p.outL).toBeGreaterThan(p.outR);
        expect(p.elbowL).toBeGreaterThan(p.elbowR);
      }
      if (Math.sin(phase) > 0.4) {
        expect(p.outR).toBeGreaterThan(p.outL);
        expect(p.elbowR).toBeGreaterThan(p.elbowL);
      }
    }
    expect(max - min).toBeLessThan(Math.PI);
    expect(max).toBeGreaterThan(1);
    expect(min).toBeLessThan(0);
    const a = swimShape(0.4, 0);
    expect(a.armL).toBeCloseTo(swimShape(0.4 + Math.PI * 2, 0).armL, 5);
    expect(a.legL).toBeCloseTo(swimShape(0.4 + Math.PI, 0).legL, 5);
  });
});
