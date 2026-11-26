import { describe, expect, it } from 'vitest';
import { WaterVision, eyeAdjust, murkyClimate, type WaterSample } from './waterVision';

const ocean: WaterSample = {
  submerged: true,
  depth: 2,
  open: true,
  color: [40, 90, 205],
  murky: false,
  viewDistance: 128,
  clear: false,
  sprint: false,
  dt: 0,
};

describe('eyeAdjust', () => {
  it('starts shut, is partly open at five seconds, and finishes at thirty', () => {
    expect(eyeAdjust(0)).toBe(0);
    expect(eyeAdjust(5)).toBeCloseTo(0.45);
    expect(eyeAdjust(30)).toBe(1);
    expect(eyeAdjust(5)).toBeGreaterThan(eyeAdjust(1));
    expect(eyeAdjust(30)).toBeGreaterThan(eyeAdjust(5));
  });
});

describe('WaterVision', () => {
  const step = (v: WaterVision, over: Partial<WaterSample>, dt = 0.05): ReturnType<WaterVision['step']> => v.step({ ...ocean, ...over, dt });

  it('is hazier the moment the eyes go under, then sees further', () => {
    const v = new WaterVision();
    const entered = step(v, {}, 0.05);
    expect(entered.blend).toBeGreaterThan(0.5);
    expect(entered.far).toBeLessThan(40);
    expect(entered.far).toBeGreaterThan(16);
    expect(entered.fovScale).toBeLessThan(0.95);
    for (let i = 0; i < 100; i++) step(v, {}, 0.05);
    const five = step(v, {}, 0);
    expect(five.far).toBeGreaterThan(entered.far);
    for (let i = 0; i < 500; i++) step(v, {}, 0.05);
    const full = step(v, {}, 0);
    expect(full.adjusted).toBe(1);
    expect(full.far).toBeGreaterThan(five.far);
    expect(full.fovScale).toBeCloseTo(0.9);
  });

  it('keeps a swamp shorter than open water after the eyes have adjusted', () => {
    const open = new WaterVision();
    const swamp = new WaterVision();
    for (let i = 0; i < 700; i++) {
      step(open, { murky: false }, 0.05);
      step(swamp, { murky: true, color: [70, 100, 70] }, 0.05);
    }
    expect(step(swamp, { murky: true }, 0).far).toBeLessThan(step(open, {}, 0).far * 0.5);
  });

  it('keeps a visible blue even in the dark, not a black void', () => {
    const v = new WaterVision();
    for (let i = 0; i < 120; i++) step(v, { depth: 20 }, 0.05);
    const look = step(v, { depth: 20 }, 0);
    expect(look.fog[0]).toBeGreaterThan(0.09);
    expect(look.fog[1]).toBeGreaterThan(0.26);
    expect(look.fog[2]).toBeGreaterThan(0.5);
    expect(look.light).toBeGreaterThan(0.5);
  });

  it('goes dark as the camera sinks, and hides the sky away from the surface', () => {
    const v = new WaterVision();
    for (let i = 0; i < 120; i++) step(v, { depth: 1 }, 0.05);
    const shallow = step(v, { depth: 1 }, 0);
    const deep = step(v, { depth: 20 }, 0);
    expect(deep.light).toBeLessThan(shallow.light);
    expect(deep.sky).toBeLessThan(0.15);
    expect(shallow.sky).toBeGreaterThan(0.4);
    expect(deep.fog[2]).toBeLessThan(shallow.fog[2]);
  });

  it('clears the fog at once for night vision, and restores the lens on the way out', () => {
    const v = new WaterVision();
    const clear = step(v, { clear: true }, 0.05);
    expect(clear.far).toBeGreaterThan(80);
    expect(clear.adjusted).toBe(1);
    let out = clear;
    for (let i = 0; i < 10; i++) out = step(v, { submerged: false, clear: false }, 0.05);
    expect(out.blend).toBe(0);
    expect(out.fovScale).toBe(1);
    const again = step(v, { clear: false }, 0.05);
    expect(again.far).toBeLessThan(40);
  });

  it('rolls the view while sprint-swimming and lets it fall back', () => {
    const v = new WaterVision();
    let look = step(v, { sprint: true }, 0.2);
    expect(Math.abs(look.roll)).toBeGreaterThan(0.02);
    for (let i = 0; i < 30; i++) look = step(v, { sprint: false, submerged: true }, 0.05);
    expect(Math.abs(look.roll)).toBeLessThan(0.02);
  });
});

describe('murkyClimate', () => {
  it('treats a swamp and a mangrove as murky, and open sea as clear', () => {
    expect(murkyClimate(null, true)).toBe(true);
    expect(murkyClimate({ ground: 'mangrove', flora: 'mangrove', atmosphere: 'swamp' }, false)).toBe(true);
    expect(murkyClimate({ ground: 'sea_sand', flora: 'sea_warm', atmosphere: 'clear' }, false)).toBe(false);
  });
});
