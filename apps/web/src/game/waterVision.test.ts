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
  it('stays shut for five seconds, then opens on the square curve, full at thirty', () => {
    expect(eyeAdjust(0)).toBe(0);
    expect(eyeAdjust(5)).toBe(0);
    expect(eyeAdjust(17.5)).toBeCloseTo(0.25);
    expect(eyeAdjust(30)).toBe(1);
    expect(eyeAdjust(30)).toBeGreaterThan(eyeAdjust(10));
  });
});

describe('WaterVision', () => {
  const step = (v: WaterVision, over: Partial<WaterSample>, dt = 0.05): ReturnType<WaterVision['step']> => v.step({ ...ocean, ...over, dt });

  it('keeps the land view, short at first and opening over thirty seconds', () => {
    const v = new WaterVision();
    const entered = step(v, { depth: 1 }, 0.05);
    expect(entered.blend).toBe(1);
    expect(entered.far).toBeCloseTo(96 * 0.65);
    expect(entered.near).toBeCloseTo(entered.far * 0.55);
    expect(entered.fovScale).toBe(1);
    for (let i = 0; i < 600; i++) step(v, { depth: 1 }, 0.05);
    const later = step(v, { depth: 32 }, 0);
    expect(later.far).toBeCloseTo(96);
    expect(later.fovScale).toBe(1);
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
    expect(look.fog[0]).toBeGreaterThan(0.04);
    expect(look.fog[1]).toBeGreaterThan(0.1);
    expect(look.fog[2]).toBeGreaterThan(0.25);
    expect(look.light).toBeGreaterThan(0.2);
  });

  it('darkens a little with every block, and eases instead of dropping at once', () => {
    const v = new WaterVision();
    for (let i = 0; i < 120; i++) step(v, { depth: 1 }, 0.05);
    const surface = step(v, { depth: 1 }, 0);
    const mid = step(v, { depth: 8 }, 0);
    const lower = step(v, { depth: 16 }, 0);
    const bottom = step(v, { depth: 32 }, 0);
    expect(surface.sky).toBeGreaterThan(0.9);
    expect(mid.sky).toBeLessThan(surface.sky);
    expect(mid.sky).toBeGreaterThan(0.6);
    expect(lower.sky).toBeLessThan(mid.sky);
    expect(lower.sky).toBeGreaterThan(0.35);
    expect(bottom.sky).toBeLessThan(lower.sky);
    expect(bottom.sky).toBeGreaterThan(0.12);
    expect(lower.sky - bottom.sky).toBeLessThan(surface.sky - mid.sky);
    expect(bottom.light).toBeLessThan(surface.light);
    expect(bottom.fog[2]).toBeLessThan(surface.fog[2]);
    expect(bottom.far).toBeCloseTo(surface.far);
    expect(bottom.fovScale).toBeCloseTo(surface.fovScale);
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
    expect(again.far).toBeLessThan(clear.far);
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
