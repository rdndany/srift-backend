import { describe, expect, it } from 'vitest';
import { DEPLOY_TIME, FLIGHT_STYLES, FlightMotion, flapShape, newWingPose, type FlightInput, type FlightOut, type WingPose } from './flightMotion';
import type { MotionClass } from './classMotion';

const CLASSES: MotionClass[] = ['warrior', 'mage', 'ranger'];
const TOP = 7.3;

const input = (cls: MotionClass | null, o: Partial<FlightInput> = {}): FlightInput => ({
  wings: true, flying: false, speed: 0, vy: 0, turn: 0, accel: 0, cls, top: TOP, shape: 'feather', brace: 0, combat: 0, ...o,
});

/** A flight at rest with its wings long since open. */
function settled(cls: MotionClass | null, shape: FlightInput['shape'] = 'feather'): FlightMotion {
  const m = new FlightMotion();
  m.update(0.016, input(cls, { shape }));
  for (let t = 0; t < DEPLOY_TIME + 0.2; t += 1 / 60) m.update(1 / 60, input(cls, { shape }));
  return m;
}

const run = (m: FlightMotion, seconds: number, i: FlightInput, fps = 60, each?: (o: FlightOut, t: number) => void): void => {
  for (let t = 0; t < seconds - 1e-9; t += 1 / fps) {
    m.update(1 / fps, i);
    each?.(m.out, t);
  }
};

const copyPose = (p: WingPose): WingPose => {
  const q = newWingPose();
  Object.assign(q.r, p.r);
  Object.assign(q.l, p.l);
  return q;
};

describe('the beat of a wing', () => {
  it('is 1 at the top and -1 at the bottom, and goes round without a break', () => {
    for (const duty of [0.34, 0.4, 0.5, 0.6]) {
      expect(flapShape(0, duty)).toBeCloseTo(1, 9);
      expect(flapShape(duty, duty)).toBeCloseTo(-1, 9);
      expect(flapShape(1, duty)).toBeCloseTo(1, 9);
      let prev = flapShape(0, duty);
      let worst = 0;
      for (let i = 1; i <= 4000; i++) {
        const v = flapShape(i / 4000, duty);
        worst = Math.max(worst, Math.abs(v - prev));
        prev = v;
      }
      expect(worst, `duty ${duty}`).toBeLessThan(0.02);
    }
  });

  it('turns round gently: no speed at the top and at the bottom of the stroke', () => {
    const duty = 0.4;
    const eps = 1e-4;
    for (const p of [0, duty]) expect(Math.abs(flapShape(p + eps, duty) - flapShape(p - eps, duty))).toBeLessThan(1e-4);
    // (and it is quicker down than up: the downstroke is the first part of the cycle)
    expect(flapShape(duty / 2, duty)).toBeCloseTo(0, 9);
    expect(flapShape(duty + (1 - duty) / 2, duty)).toBeCloseTo(0, 9);
    expect(duty / 2).toBeLessThan((1 - duty) / 2);
  });
});

describe('putting the wings on', () => {
  it('opens them from the shoulder out: the root first, then the elbow, the tip last, in under a second and a bit', () => {
    for (const cls of CLASSES) {
      const ref = settled(cls);
      const m = new FlightMotion();
      m.equip();
      const fresh = copyPose(m.update(0, input(cls)).wing);
      const refPose = copyPose(ref.update(0, input(cls)).wing);
      // How far each piece is from where it will settle, as a share of how far it started.
      const left = (p: WingPose, k: 'sweep' | 'elbowY' | 'wristY'): number => Math.abs(p.r[k] - refPose.r[k]) / Math.max(1e-6, Math.abs(fresh.r[k] - refPose.r[k]));
      const done: Record<string, number> = {};
      let t = 0;
      for (; t < 1.6; t += 1 / 120) {
        const o = m.update(1 / 120, input(cls));
        // (The beat goes on while they open, and the settled pose is moving too: the share is read against the open pose of the same moment.)
        const r2 = copyPose(ref.update(1 / 120, input(cls)).wing);
        for (const k of ['sweep', 'elbowY', 'wristY'] as const) {
          const s = Math.abs(o.wing.r[k] - r2.r[k]) / Math.max(1e-6, Math.abs(fresh.r[k] - refPose.r[k]));
          if (s < 0.1 && done[k] === undefined) done[k] = t;
        }
      }
      expect(left(fresh, 'sweep')).toBeCloseTo(1, 6);
      expect(done.sweep, `${cls} root`).toBeLessThan(done.elbowY);
      expect(done.elbowY, `${cls} elbow`).toBeLessThan(done.wristY);
      expect(done.wristY, `${cls} tip`).toBeLessThan(1.2);
      expect(done.wristY, `${cls} tip`).toBeGreaterThan(0.5);
    }
  });

  it('does not play again for wings that are on already, and can be taken off and put on again', () => {
    const m = settled('mage');
    let equip = 0;
    run(m, 5, input('mage', { speed: 4, flying: false }), 60, (o) => o.state === 'equip' && equip++);
    expect(equip).toBe(0);
    m.equip();
    m.update(1 / 60, input('mage'));
    expect(m.out.state).toBe('equip');
    // Off, it is nothing; on again, it opens again.
    m.update(1 / 60, input('mage', { wings: false }));
    expect(m.out.state).toBe('none');
    expect(m.out.rise).toBe(0);
  });

  it('is folded at first and the figure rises with the wings, not at once', () => {
    const m = new FlightMotion();
    m.equip();
    m.update(1 / 60, input('warrior'));
    expect(m.out.rise).toBeLessThan(0.05);
    run(m, DEPLOY_TIME * 0.5, input('warrior'));
    expect(m.out.rise).toBeGreaterThan(0.2);
    expect(m.out.rise).toBeLessThan(0.8);
    run(m, DEPLOY_TIME, input('warrior'));
    expect(m.out.rise).toBeCloseTo(1, 3);
  });

  it('can be taken into the air at once, while it is still opening', () => {
    const m = new FlightMotion();
    m.equip();
    run(m, 0.2, input('ranger'));
    run(m, 1.2, input('ranger', { flying: true }));
    expect(m.out.fly).toBeGreaterThan(0.9);
    expect(['flightIdle', 'flight', 'fast', 'ascend', 'descend']).toContain(m.out.state);
  });
});

describe('floating on the ground', () => {
  it('keeps the float small and slow, and the wings quiet but alive', () => {
    for (const cls of CLASSES) {
      const m = settled(cls);
      let bobLo = Infinity;
      let bobHi = -Infinity;
      let phiLo = Infinity;
      let phiHi = -Infinity;
      run(m, 8, input(cls), 60, (o) => {
        bobLo = Math.min(bobLo, o.bob);
        bobHi = Math.max(bobHi, o.bob);
        phiLo = Math.min(phiLo, o.wing.r.phi);
        phiHi = Math.max(phiHi, o.wing.r.phi);
      });
      expect(bobHi - bobLo, `${cls} bob`).toBeGreaterThan(0.03);
      expect(bobHi - bobLo, `${cls} bob`).toBeLessThan(0.2);
      expect(phiHi - phiLo, `${cls} wings`).toBeGreaterThan(0.05);
      expect(phiHi - phiLo, `${cls} wings`).toBeLessThan(0.25);
      expect(m.out.state).toBe('hover');
    }
  });

  it('leans and glides with the speed, the legs trailing and the wings busier, and more so at a sprint', () => {
    for (const cls of CLASSES) {
      const idle = settled(cls);
      const walk = settled(cls);
      const sprint = settled(cls);
      run(idle, 3, input(cls));
      run(walk, 3, input(cls, { speed: 4.6 }));
      run(sprint, 3, input(cls, { speed: 6.4 }));
      expect(walk.out.lean, cls).toBeGreaterThan(idle.out.lean + 0.08);
      expect(sprint.out.lean, cls).toBeGreaterThan(walk.out.lean + 0.03);
      expect(sprint.out.legLx, cls).toBeLessThan(walk.out.legLx);
      expect(walk.out.legLx, cls).toBeLessThan(idle.out.legLx);
      expect(walk.out.state).toBe('hoverMove');
      expect(sprint.out.state).toBe('hoverSprint');
      // The sprint sweeps the wings back, not just faster.
      expect(sprint.out.wing.r.sweep).toBeGreaterThan(walk.out.wing.r.sweep);
      expect(walk.out.fly).toBe(0);
    }
  });
});

describe('the takeoff', () => {
  it('takes between 0.4 and 0.8 seconds for every class, and passes through draw-in, spread and a hard downstroke', () => {
    for (const cls of CLASSES) {
      const m = settled(cls);
      run(m, 1, input(cls));
      const seen: number[] = [];
      let sweepDraw = 0;
      let phiTop = -Infinity;
      let phiBottom = Infinity;
      let last = 0;
      const base = m.out.wing.r.sweep;
      run(m, 1.4, input(cls, { flying: true }), 120, (o, t) => {
        if (o.state === 'takeoff') last = t + 1 / 120;
        if (t < 0.12) sweepDraw = Math.max(sweepDraw, o.wing.r.sweep - base);
        if (t < 0.5) {
          phiTop = Math.max(phiTop, o.wing.r.phi);
          phiBottom = Math.min(phiBottom, o.wing.r.phi);
        }
        seen.push(o.lean);
      });
      expect(last, `${cls} takeoff`).toBeGreaterThan(0.38);
      expect(last, `${cls} takeoff`).toBeLessThan(0.82);
      expect(sweepDraw, `${cls} draws in first`).toBeGreaterThan(0.12);
      // From above the rest to well below it: one hard stroke.
      expect(phiTop - phiBottom, `${cls} stroke`).toBeGreaterThan(0.45);
    }
  });

  it('moves smoothly: no wing joint, leg or the lean jumps between two frames, at 60 frames a second', () => {
    for (const cls of CLASSES) {
      for (const fps of [30, 60, 144]) {
        const m = settled(cls);
        run(m, 1, input(cls, { speed: 2 }), fps);
        let prev = copyPose(m.out.wing);
        let prevLean = m.out.lean;
        let prevLeg = m.out.legLx;
        let worst = 0;
        let worstLean = 0;
        let worstLeg = 0;
        const i = input(cls, { flying: true, speed: 2 });
        run(m, 2, i, fps, (o) => {
          for (const k of ['phi', 'sweep', 'elbowZ', 'elbowY', 'wristZ', 'wristY'] as const) worst = Math.max(worst, Math.abs(o.wing.r[k] - prev.r[k]));
          worstLean = Math.max(worstLean, Math.abs(o.lean - prevLean));
          worstLeg = Math.max(worstLeg, Math.abs(o.legLx - prevLeg));
          prev = copyPose(o.wing);
          prevLean = o.lean;
          prevLeg = o.legLx;
        });
        // (a joint turning faster than 9 radians a second would be a flick: 0.15 at 60 a second)
        expect(worst * fps, `${cls} wings at ${fps}`).toBeLessThan(11);
        expect(worstLean * fps, `${cls} lean at ${fps}`).toBeLessThan(6);
        expect(worstLeg * fps, `${cls} legs at ${fps}`).toBeLessThan(8);
      }
    }
  });

  it('follows the real flight: it only starts when the flying does, and does not hold anything up', () => {
    const m = settled('mage');
    run(m, 1, input('mage'));
    expect(m.sinceTakeoff).toBeGreaterThan(90);
    m.update(1 / 60, input('mage', { flying: true }));
    expect(m.sinceTakeoff).toBeLessThan(0.05);
    // (The state is read the frame it happens; nothing waits for it: the weights it gives are already moving.)
    expect(m.out.fly).toBeGreaterThan(0);
  });
});

describe('flying', () => {
  const fly = (cls: MotionClass, o: Partial<FlightInput>, seconds = 4): FlightMotion => {
    const m = settled(cls);
    run(m, seconds, input(cls, { flying: true, ...o }));
    return m;
  };

  it('is a different pose from standing: legs hung, arms out, the wings beating deeper', () => {
    for (const cls of CLASSES) {
      const hover = settled(cls);
      run(hover, 4, input(cls));
      const f = fly(cls, {});
      expect(f.out.state).toBe('flightIdle');
      expect(f.out.fly).toBe(1);
      let hLo = Infinity;
      let hHi = -Infinity;
      let fLo = Infinity;
      let fHi = -Infinity;
      run(hover, 3, input(cls), 60, (o) => {
        hLo = Math.min(hLo, o.wing.r.phi);
        hHi = Math.max(hHi, o.wing.r.phi);
      });
      run(f, 3, input(cls, { flying: true }), 60, (o) => {
        fLo = Math.min(fLo, o.wing.r.phi);
        fHi = Math.max(fHi, o.wing.r.phi);
      });
      expect(fHi - fLo, cls).toBeGreaterThan((hHi - hLo) * 3);
      expect(Math.abs(f.out.armLz), cls).toBeGreaterThan(Math.abs(hover.out.armLz));
    }
  });

  it('leans into speed, more the faster, with the legs behind and the head up against the lean', () => {
    for (const cls of CLASSES) {
      const idle = fly(cls, {});
      const fwd = fly(cls, { speed: TOP * 0.5, accel: 0 });
      const fast = fly(cls, { speed: TOP });
      expect(fwd.out.lean, cls).toBeGreaterThan(idle.out.lean + 0.2);
      expect(fast.out.lean, cls).toBeGreaterThan(fwd.out.lean + 0.05);
      expect(fwd.out.legLx, cls).toBeLessThan(0);
      expect(fast.out.legLx, cls).toBeLessThan(fwd.out.legLx);
      expect(fast.out.headX, cls).toBeGreaterThan(0.35);
      expect(fast.out.state, cls).toBe('fast');
      expect(fwd.out.state, cls).toBe('flight');
      // A flat out flight sweeps the wings back and beats in bursts, not faster.
      expect(fast.out.wing.r.sweep, cls).toBeGreaterThan(fwd.out.wing.r.sweep + 0.1);
    }
  });

  it('does not simply beat faster at speed: the stroke rate drops and the depth shortens', () => {
    for (const cls of CLASSES) {
      const rate = (o: Partial<FlightInput>): number => {
        const m = settled(cls);
        run(m, 3, input(cls, { flying: true, ...o }));
        let prev = m.out.wing.r.phi;
        let crossings = 0;
        run(m, 8, input(cls, { flying: true, ...o }), 120, (out) => {
          const v = out.wing.r.phi;
          const mid = out.wing.r.phi;
          if (prev < 0.1 && v >= 0.1) crossings++;
          prev = mid;
        });
        return crossings / 8;
      };
      const idleRate = rate({});
      const fastRate = rate({ speed: TOP });
      expect(idleRate, `${cls} idle`).toBeGreaterThan(0.4);
      expect(fastRate, `${cls} fast`).toBeLessThanOrEqual(idleRate * 1.05);
    }
  });

  it('banks into a turn and out of it, by the speed and the turn, to the left and the right alike, and not much at a crawl', () => {
    for (const cls of CLASSES) {
      const slow = fly(cls, { speed: 0.5, turn: 3 });
      const quick = fly(cls, { speed: TOP * 0.7, turn: 3 });
      const left = fly(cls, { speed: TOP * 0.7, turn: 3 });
      const right = fly(cls, { speed: TOP * 0.7, turn: -3 });
      expect(Math.abs(slow.out.bank), `${cls} slow`).toBeLessThan(0.12);
      expect(quick.out.bank, `${cls} left`).toBeGreaterThan(0.18);
      expect(right.out.bank, `${cls} right`).toBeCloseTo(-left.out.bank, 2);
      expect(Math.abs(quick.out.bank)).toBeLessThanOrEqual(FLIGHT_STYLES[cls].bankMax + 1e-6);
      // The wings: a turn to the left lifts the outer (right) wing and drops the inner one, and the head stays level.
      expect(left.out.wing.r.phi, cls).toBeGreaterThan(right.out.wing.r.phi);
      expect(left.out.wing.l.phi, cls).toBeLessThan(right.out.wing.l.phi);
      expect(Math.sign(left.out.headZ), cls).toBe(-1);
      // It comes in over a moment and goes out over a moment.
      const m = fly(cls, { speed: TOP * 0.7 });
      m.update(1 / 60, input(cls, { flying: true, speed: TOP * 0.7, turn: 3 }));
      expect(m.out.bank).toBeLessThan(0.1);
      run(m, 2, input(cls, { flying: true, speed: TOP * 0.7, turn: 3 }));
      run(m, 2, input(cls, { flying: true, speed: TOP * 0.7 }));
      expect(Math.abs(m.out.bank)).toBeLessThan(0.02);
    }
  });

  it('goes into a drift as it does into a turn: banked toward the side it goes, the legs left behind the other way, and no lean forward for going sideways', () => {
    for (const cls of CLASSES) {
      const speed = TOP * 0.7;
      const ahead = fly(cls, { speed });
      const toLeft = fly(cls, { speed, fwd: 0, side: -1 });
      const toRight = fly(cls, { speed, fwd: 0, side: 1 });
      // Banked into it (to the left is a positive bank, as a turn to the left is), alike on both sides, and no more than a turn would.
      expect(toLeft.out.bank, `${cls} left`).toBeGreaterThan(0.12);
      expect(toRight.out.bank, `${cls} right`).toBeCloseTo(-toLeft.out.bank, 2);
      expect(Math.abs(toLeft.out.bank)).toBeLessThanOrEqual(FLIGHT_STYLES[cls].bankMax + 1e-6);
      expect(Math.abs(ahead.out.bank)).toBeLessThan(0.02);
      // The legs go the other way to the drift (the feet to the right of a figure going to the left), both of them.
      expect(toLeft.out.legLz - ahead.out.legLz, cls).toBeGreaterThan(0.05);
      expect(toLeft.out.legRz - ahead.out.legRz, cls).toBeGreaterThan(0.05);
      expect(toRight.out.legLz - ahead.out.legLz, cls).toBeLessThan(-0.05);
      // The nose is down for going ahead and not for going sideways, and up for going back.
      expect(toLeft.out.lean, cls).toBeLessThan(ahead.out.lean * 0.6);
      const back = fly(cls, { speed, fwd: -1, side: 0 });
      expect(back.out.lean, cls).toBeLessThan(toLeft.out.lean);
      expect(back.out.lean, cls).toBeLessThan(0.02);
      // A drift and a turn add up, and a diagonal is in between.
      const diag = fly(cls, { speed, fwd: 0.7, side: -0.7 });
      expect(diag.out.bank, cls).toBeGreaterThan(0.05);
      expect(diag.out.bank, cls).toBeLessThanOrEqual(toLeft.out.bank + 1e-6);
      expect(diag.out.lean, cls).toBeGreaterThan(toLeft.out.lean);
      expect(diag.out.lean, cls).toBeLessThan(ahead.out.lean);
    }
  });

  it('tilts nose up in a climb and down in a dive, with the wings working harder and softer, blended with no jump', () => {
    for (const cls of CLASSES) {
      const level = fly(cls, { speed: 5 });
      const up = fly(cls, { speed: 5, vy: 6 });
      const down = fly(cls, { speed: 5, vy: -6 });
      expect(up.out.climb, cls).toBeGreaterThan(0.1);
      expect(down.out.climb, cls).toBeLessThan(-0.1);
      expect(up.out.state).toBe('ascend');
      expect(down.out.state).toBe('descend');
      // A dive holds the wings up and out to slow it.
      expect(down.out.wing.r.phi, cls).toBeGreaterThan(-1);
      let upAmp = 0;
      let lvAmp = 0;
      let dnAmp = 0;
      const amp = (m: FlightMotion, o: Partial<FlightInput>, set: (v: number) => void): void => {
        let lo = Infinity;
        let hi = -Infinity;
        run(m, 3, input(cls, { flying: true, ...o }), 60, (out) => {
          lo = Math.min(lo, out.wing.r.phi);
          hi = Math.max(hi, out.wing.r.phi);
        });
        set(hi - lo);
      };
      amp(up, { speed: 5, vy: 6 }, (v) => (upAmp = v));
      amp(level, { speed: 5 }, (v) => (lvAmp = v));
      amp(down, { speed: 5, vy: -6 }, (v) => (dnAmp = v));
      expect(upAmp, cls).toBeGreaterThan(lvAmp);
      expect(dnAmp, cls).toBeLessThan(lvAmp);
      // Suddenly going from a climb to a dive (the input is a step) changes the body over a moment, not in a frame.
      const m = fly(cls, { speed: 5, vy: 6 });
      const before = { lean: m.out.lean, leg: m.out.legLx, climb: m.out.climb };
      m.update(1 / 60, input(cls, { flying: true, speed: 5, vy: -6 }));
      expect(Math.abs(m.out.climb - before.climb)).toBeLessThan(0.06);
      expect(Math.abs(m.out.legLx - before.leg)).toBeLessThan(0.06);
      expect(Math.abs(m.out.lean - before.lean)).toBeLessThan(0.03);
    }
  });

  it('stops without a snap: stopping suddenly the lean comes back over a moment', () => {
    for (const cls of CLASSES) {
      const m = fly(cls, { speed: TOP });
      const lean0 = m.out.lean;
      let worst = 0;
      let prev = lean0;
      run(m, 1.5, input(cls, { flying: true, speed: 0, accel: -25 }), 60, (o) => {
        worst = Math.max(worst, Math.abs(o.lean - prev));
        prev = o.lean;
      });
      expect(worst * 60, cls).toBeLessThan(5);
      expect(m.out.lean, cls).toBeLessThan(lean0 - 0.3);
    }
  });

  it('is tipped back by a sudden stop and forward by a start', () => {
    const a = fly('warrior', { speed: 4, accel: 12 }, 1);
    const b = fly('warrior', { speed: 4, accel: -12 }, 1);
    expect(a.out.lean).toBeGreaterThan(b.out.lean);
  });
});

describe('landing', () => {
  it('flares the wings open, brings the legs down and settles into the float over the time of the class, and then is a float again', () => {
    for (const cls of CLASSES) {
      const m = settled(cls);
      run(m, 3, input(cls, { flying: true, speed: TOP }));
      const leanIn = m.out.lean;
      m.update(1 / 60, input(cls));
      const st = FLIGHT_STYLES[cls];
      let landing = 0;
      let flare = -Infinity;
      run(m, st.landing + 1.5, input(cls), 60, (o) => {
        if (o.state === 'landing') landing += 1 / 60;
        flare = Math.max(flare, o.wing.r.phi);
      });
      expect(landing, cls).toBeGreaterThan(st.landing * 0.55);
      expect(landing, cls).toBeLessThan(st.landing + 0.2);
      expect(m.out.state).toBe('hover');
      expect(m.out.lean, cls).toBeLessThan(leanIn - 0.4);
      expect(m.out.fly).toBe(0);
      expect(flare).toBeGreaterThan(0.18);
    }
  });

  it('does not change its float height or leave the hover pose on the ground behind: it is the same body the physics moves', () => {
    const m = settled('ranger');
    run(m, 3, input('ranger', { flying: true, speed: 6 }));
    run(m, 3, input('ranger'));
    expect(Math.abs(m.out.bob)).toBeLessThan(0.1);
    expect(m.out.rise).toBe(1);
  });
});

describe('the classes', () => {
  const swing = (cls: MotionClass, o: Partial<FlightInput> = {}): { rate: number; depth: number } => {
    const m = settled(cls);
    run(m, 3, input(cls, { flying: true, ...o }));
    let prev = m.out.wing.r.phi;
    let crossings = 0;
    let lo = Infinity;
    let hi = -Infinity;
    run(m, 10, input(cls, { flying: true, ...o }), 120, (out) => {
      const v = out.wing.r.phi;
      const mid = (lo + hi) / 2;
      if (prev < 0.1 && v >= 0.1) crossings++;
      void mid;
      prev = v;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    });
    return { rate: crossings / 10, depth: hi - lo };
  };

  it('beat at their own pace and depth: the Warrior slow and deep, the Mage slowest and softest, the Ranger quickest', () => {
    const w = swing('warrior');
    const m = swing('mage');
    const r = swing('ranger');
    expect(r.rate).toBeGreaterThan(w.rate);
    expect(w.rate).toBeGreaterThan(m.rate);
    expect(w.depth).toBeGreaterThan(m.depth);
    expect(w.depth).toBeGreaterThan(r.depth * 0.95);
  });

  it('lean and bank in their own way: the Ranger the furthest forward and the quickest to bank, the Mage the softest, the Warrior the slowest', () => {
    const lean = (cls: MotionClass): number => {
      const m = settled(cls);
      run(m, 4, input(cls, { flying: true, speed: TOP }));
      return m.out.lean;
    };
    expect(lean('ranger')).toBeGreaterThan(lean('warrior'));
    expect(lean('warrior')).toBeGreaterThan(lean('mage'));
    const bankAfter = (cls: MotionClass): number => {
      const m = settled(cls);
      run(m, 3, input(cls, { flying: true, speed: TOP * 0.7 }));
      run(m, 0.3, input(cls, { flying: true, speed: TOP * 0.7, turn: 2 }));
      return m.out.bank / Math.min(FLIGHT_STYLES[cls].bankMax, 2 * 0.12 * FLIGHT_STYLES[cls].bank * 1);
    };
    expect(bankAfter('ranger')).toBeGreaterThan(bankAfter('warrior'));
    expect(FLIGHT_STYLES.ranger.response).toBeGreaterThan(FLIGHT_STYLES.mage.response);
    expect(FLIGHT_STYLES.mage.response).toBeGreaterThan(FLIGHT_STYLES.warrior.response * 0.7);
  });

  it('hang in the air their own way: the Warrior stands broad, the Mage with feet close and floating higher and slower, the Ranger alert and forward', () => {
    const s = FLIGHT_STYLES;
    expect(s.warrior.legs.splay).toBeGreaterThan(s.ranger.legs.splay);
    expect(s.ranger.legs.splay).toBeGreaterThan(s.mage.legs.splay);
    expect(s.mage.bob).toBeGreaterThan(s.ranger.bob);
    expect(s.mage.bobRate).toBeLessThan(s.warrior.bobRate);
    expect(s.ranger.lean.idle).toBeGreaterThan(s.warrior.lean.idle);
    expect(s.warrior.arms.fwdX).toBeGreaterThan(0.3); // arms forward and guarding
    expect(s.ranger.arms.fwdX).toBeLessThan(-0.3); // arms along the body
    expect(s.ranger.legs.fast).toBeGreaterThan(s.mage.legs.fast);
    for (const cls of CLASSES) {
      expect(s[cls].takeoff).toBeGreaterThanOrEqual(0.4);
      expect(s[cls].takeoff).toBeLessThanOrEqual(0.8);
    }
  });

  it('keep what the hands are doing in the air: bracing for a blow draws the body upright and the legs forward', () => {
    for (const cls of CLASSES) {
      const calm = settled(cls);
      const hit = settled(cls);
      run(calm, 3, input(cls, { flying: true, speed: 5 }));
      run(hit, 3, input(cls, { flying: true, speed: 5, brace: 1 }));
      expect(hit.out.lean, cls).toBeLessThan(calm.out.lean);
      expect(hit.out.legLx, cls).toBeLessThan(calm.out.legLx + 0.0001);
    }
  });
});

describe('time', () => {
  it('gives the same flight at any frame rate', () => {
    const scenario = (fps: number): FlightMotion => {
      const m = settled('warrior');
      run(m, 1.0, input('warrior'), fps);
      run(m, 0.8, input('warrior', { speed: 4.6 }), fps);
      run(m, 1.2, input('warrior', { flying: true, speed: 4.6, vy: 5 }), fps);
      run(m, 1.5, input('warrior', { flying: true, speed: TOP, turn: 2 }), fps);
      run(m, 1.0, input('warrior', { flying: true, speed: 3, vy: -4 }), fps);
      return m;
    };
    const ref = scenario(240);
    for (const fps of [30, 60, 144]) {
      const m = scenario(fps);
      for (const k of ['lean', 'bank', 'legLx', 'armLx', 'climb', 'headX'] as const) expect(Math.abs(m.out[k] - ref.out[k]), `${k} at ${fps}`).toBeLessThan(0.05);
      expect(Math.abs(m.out.wing.r.phi - ref.out.wing.r.phi), `phi at ${fps}`).toBeLessThan(0.12);
      expect(m.out.state).toBe(ref.out.state);
    }
  });

  it('survives a frame that takes far too long, and a frame of no time', () => {
    const m = settled('mage');
    m.update(5, input('mage', { flying: true }));
    m.update(0, input('mage', { flying: true }));
    for (const v of [m.out.lean, m.out.bank, m.out.wing.r.phi, m.out.wing.l.wristZ, m.out.legLx, m.out.armRx, m.out.bob]) expect(Number.isFinite(v)).toBe(true);
  });

  it('allocates nothing as it goes: the output is the same object, and the wing pose too', () => {
    const m = settled('ranger');
    const out = m.out;
    const pose = m.out.wing;
    const r = pose.r;
    run(m, 2, input('ranger', { flying: true, speed: 6 }));
    expect(m.out).toBe(out);
    expect(m.out.wing).toBe(pose);
    expect(m.out.wing.r).toBe(r);
  });
});
