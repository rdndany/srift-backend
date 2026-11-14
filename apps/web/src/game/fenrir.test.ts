import { describe, expect, it } from 'vitest';
import { MOUNT_MOUTH, MOUNTS, mountMouthAt } from '@solrift/shared';
import { Fenrir, ROAR_HEAD, ROAR_NECK } from './fenrir';

/** A Fenrir that has been standing a moment (its breathing is the only thing moving). */
function standing(id = MOUNTS[0].id): Fenrir {
  const f = new Fenrir(id);
  for (let i = 0; i < 5; i++) f.update(0.02, 0, 0, 0, false);
  return f;
}

describe('the mouth of the Fenrir', () => {
  it('is where the rules say it is, for every colour: the rules read it from the same neck and head the model is built from', () => {
    for (const m of MOUNTS) {
      const p = standing(m.id).mouth();
      expect(-p.z).toBeCloseTo(MOUNT_MOUTH.ahead, 1);
      expect(p.y).toBeCloseTo(MOUNT_MOUTH.up, 1);
      // (the head sways a little from side to side when it stands: its nose is never quite on the middle line)
      expect(Math.abs(p.x)).toBeLessThan(0.1);
    }
  });

  it('goes up and back with the head when it howls, as `mountMouthAt` says', () => {
    const f = standing();
    f.roar();
    // the howl peaks a little under a third of a second in
    for (let i = 0; i < 14; i++) f.update(0.02, 0, 0, 0, false);
    const want = mountMouthAt(ROAR_NECK, ROAR_HEAD);
    const p = f.mouth();
    expect(-p.z).toBeCloseTo(want.ahead, 1);
    expect(p.y).toBeCloseTo(want.up, 1);
    expect(p.y).toBeGreaterThan(MOUNT_MOUTH.up + 0.3);
  });
});

describe('the stride of the Fenrir', () => {
  /** Run at `speed` for a while and write down when each paw lands. */
  function run(speed: number, seconds: number, dt = 0.004): { t: number; power: number }[] {
    const f = new Fenrir();
    const steps: { t: number; power: number }[] = [];
    let t = 0;
    f.onStep = (_x, _y, _z, power) => steps.push({ t, power });
    for (; t < seconds; t += dt) f.update(dt, speed, 0, 0, false);
    return steps;
  }

  it('puts its paws down one at a time, never all together: the hind ones a little behind the fore ones', () => {
    const steps = run(8, 4).filter((s) => s.t > 1.5);
    expect(steps.length).toBeGreaterThan(20);
    // four paws a stride, the stride about three times a second at a run
    const perSecond = steps.length / 2.5;
    expect(perSecond).toBeGreaterThan(8);
    expect(perSecond).toBeLessThan(16);
    // a pair that goes down together is still a few thousandths of a second apart, and no paw lands twice in a hurry
    const gaps = steps.slice(1).map((s, i) => s.t - steps[i].t);
    expect(Math.min(...gaps)).toBeGreaterThan(0.006);
    expect(Math.max(...gaps)).toBeLessThan(0.35);
  });

  it('walks in four beats at a walk: the paws are spread evenly over the stride', () => {
    const steps = run(2.2, 6).filter((s) => s.t > 2);
    const gaps = steps.slice(1).map((s, i) => s.t - steps[i].t);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    for (const g of gaps) expect(Math.abs(g - mean)).toBeLessThan(mean * 0.35);
  });

  it('is quiet standing still, and lands hard from a jump', () => {
    expect(run(0, 2)).toHaveLength(0);
    const f = new Fenrir();
    const steps: number[] = [];
    f.onStep = (_x, _y, _z, power) => steps.push(power);
    for (let i = 0; i < 60; i++) f.update(0.02, 6, 0, 6, true);
    expect(steps).toHaveLength(0);
    for (let i = 0; i < 30; i++) f.update(0.02, 6, 0, 0, false);
    expect(Math.max(...steps)).toBeGreaterThan(1);
  });

  it('carries the louder steps at a run than at a walk', () => {
    const fast = run(8, 4).filter((s) => s.t > 2);
    const slow = run(2.2, 6).filter((s) => s.t > 2);
    const mean = (l: { power: number }[]): number => l.reduce((a, s) => a + s.power, 0) / l.length;
    expect(mean(fast)).toBeGreaterThan(mean(slow));
  });
});

describe('the lean of the rider', () => {
  const lean = (speed: number, turn: number, vy: number, air: boolean): Fenrir => {
    const f = new Fenrir();
    for (let i = 0; i < 100; i++) f.update(0.02, speed, turn, vy, air);
    return f;
  };

  it('is forward at a run, and more into a climb than into a drop', () => {
    expect(lean(8, 0, 0, false).leanPitch).toBeLessThan(-0.05);
    expect(lean(8, 0, 0, false).leanPitch).toBeLessThan(lean(0, 0, 0, false).leanPitch);
    expect(lean(6, 0, 7, true).leanPitch).toBeLessThan(lean(6, 0, -7, true).leanPitch);
  });

  it('goes into a turn, and the other way for the other turn; the neck leads it', () => {
    const left = lean(8, 2.5, 0, false);
    const right = lean(8, -2.5, 0, false);
    expect(left.leanRoll).toBeGreaterThan(0.03);
    expect(right.leanRoll).toBeLessThan(-0.03);
    // straight ahead there is almost none
    expect(Math.abs(lean(8, 0, 0, false).leanRoll)).toBeLessThan(0.02);
  });
});
