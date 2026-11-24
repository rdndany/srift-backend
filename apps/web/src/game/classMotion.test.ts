import { describe, expect, it } from 'vitest';
import {
  ClassMotion,
  PROFILES,
  STRETCHES,
  blendGait,
  footCycle,
  gaitLegs,
  gaitRate,
  legAngle,
  stretchAt,
  stretchLength,
  type Foot,
  type Gait,
  type Legs,
  type MotionClass,
  type MotionInput,
  type StretchKey,
} from './classMotion';

const CLASSES: MotionClass[] = ['warrior', 'mage', 'ranger'];
/** The size of the figure in blocks and the length of a leg in its own units (see Character). */
const UNIT = 0.9375;
const LEG = 0.75;
const WALK = 4.3;
const RUN = 5.9;

const gaitFor = (cls: MotionClass, run: number): Gait => blendGait(PROFILES[cls].walk, PROFILES[cls].sprint, run, { ...PROFILES[cls].walk });

/** What the feet do over a few strides at a pace: walks the gait at the rate that is asked, and gives each foot's place on the ground and its height. */
function walkFeet(g: Gait, speed: number, seconds = 4, fps = 240): { slide: number; hover: number; bob: number; floor: number } {
  const dt = 1 / fps;
  const rate = gaitRate(speed, g, 1, LEG, UNIT);
  const legs: Legs = { r: 0, l: 0, liftR: 0, liftL: 0, step: 0, since: 0, thud: 0, xr: 0, xl: 0, kneeR: 0, kneeL: 0 };
  let gait = 0;
  let body = 0;
  let slide = 0;
  let hover = 0;
  let lo = Infinity;
  let hi = -Infinity;
  let floor = Infinity;
  let prevR = 0;
  let prevL = 0;
  let first = true;
  let lastR = 1;
  let lastL = 1;
  for (let t = 0; t < seconds; t += dt) {
    gait += rate * dt;
    body += speed * dt;
    gaitLegs(gait, g, 1, 1, legs);
    const footAt = (angle: number): number => body + UNIT * LEG * Math.sin(angle);
    const fr = footAt(legs.r);
    const fl = footAt(legs.l);
    // A foot is on the ground while it is not lifted: how far it moves over the ground in a frame is how far it slides.
    if (!first) {
      if (legs.liftR === 0 && lastR === 0 && t > 1) slide = Math.max(slide, Math.abs(fr - prevR) / dt / speed);
      if (legs.liftL === 0 && lastL === 0 && t > 1) slide = Math.max(slide, Math.abs(fl - prevL) / dt / speed);
    }
    prevR = fr;
    prevL = fl;
    first = false;
    // The hips drop to keep the lowest foot down, as far as the class takes (see Character.plantFeet).
    const h = (angle: number, lift: number): number => lift + LEG * (1 - Math.cos(angle));
    const low = Math.min(h(legs.r, legs.liftR), h(legs.l, legs.liftL));
    const drop = low * g.plant * UNIT;
    if (t > 1) {
      lo = Math.min(lo, -drop);
      hi = Math.max(hi, -drop);
      // The foot that is lower is as high above the floor as the share of the drop that was not taken.
      hover = Math.max(hover, (low * UNIT - drop));
      floor = Math.min(floor, low * UNIT - drop);
    }
  }
  return { slide, hover, bob: hi - lo, floor };
}

describe('the foot', () => {
  const foot: Foot = { x: 0, lift: 0, bend: 0, load: 0 };

  it('is continuous round the cycle and at the moment it leaves and lands', () => {
    for (const duty of [0.38, 0.45, 0.5, 0.56]) {
      let prev = footCycle(0, duty, foot).x;
      let worst = 0;
      for (let i = 1; i <= 2000; i++) {
        const x = footCycle(i / 2000, duty, foot).x;
        worst = Math.max(worst, Math.abs(x - prev));
        prev = x;
      }
      // (the stance is a straight line of slope 2/duty: a step of 1/2000 cycle moves it 0.002 * 2 / duty)
      expect(worst, `duty ${duty}`).toBeLessThan(0.0035 + 0.0015 / duty);
    }
  });

  it('goes back at one steady pace on the ground and is lifted only in the air', () => {
    const duty = 0.5;
    const xs = [0.05, 0.15, 0.25, 0.35, 0.45].map((p) => footCycle(p, duty, foot).x);
    for (let i = 1; i < xs.length; i++) expect(xs[i - 1] - xs[i]).toBeCloseTo(0.4, 6);
    expect(footCycle(0.2, duty, foot).lift).toBe(0);
    expect(footCycle(0.75, duty, foot).lift).toBeCloseTo(1, 3);
  });

  it('lands at its most forward and leaves at its furthest back', () => {
    expect(footCycle(0, 0.5, foot).x).toBeCloseTo(1, 6);
    expect(footCycle(0.5 - 1e-9, 0.5, foot).x).toBeCloseTo(-1, 4);
    expect(footCycle(0.999999, 0.5, foot).x).toBeCloseTo(1, 3);
  });
});

describe('the stride', () => {
  it('keeps each foot on the ground still as the ground goes by, for every class at a walk and at a run', () => {
    for (const cls of CLASSES) {
      for (const [name, speed, run] of [['walk', WALK, 0], ['sprint', RUN, 1]] as const) {
        const r = walkFeet(gaitFor(cls, run), speed);
        // A foot on the ground moves over it by under 6% of the speed at any moment (a body that slides is at 100%).
        expect(r.slide, `${cls} ${name}`).toBeLessThan(0.06);
      }
    }
  });

  // A sprint has a flight (both feet in the air for a part of the stride) and legs without knees must be long and straight to reach, so the limit there is wider than the walk's.
  it('never has a foot through the floor, and keeps the hovering of the foot on the ground small', () => {
    for (const cls of CLASSES) {
      for (const [name, speed, run, limit] of [['walk', WALK, 0, 0.07], ['sprint', RUN, 1, 0.35]] as const) {
        const r = walkFeet(gaitFor(cls, run), speed);
        expect(r.floor, `${cls} ${name} floor`).toBeGreaterThanOrEqual(-1e-9);
        expect(r.hover, `${cls} ${name} hover`).toBeLessThan(limit);
      }
    }
  });

  it('bobs a little, not a bounce', () => {
    for (const cls of CLASSES) {
      expect(walkFeet(gaitFor(cls, 0), WALK).bob, `${cls} walk`).toBeLessThan(0.1);
      expect(walkFeet(gaitFor(cls, 1), RUN).bob, `${cls} sprint`).toBeLessThan(0.14);
    }
  });

  it('turns slower the longer the stride and faster the faster it goes', () => {
    const g = PROFILES.warrior.walk;
    expect(gaitRate(6, g, 1, LEG, UNIT)).toBeGreaterThan(gaitRate(3, g, 1, LEG, UNIT));
    expect(gaitRate(4, { ...g, stride: 0.9 }, 1, LEG, UNIT)).toBeLessThan(gaitRate(4, { ...g, stride: 0.5 }, 1, LEG, UNIT));
    // (and never to nothing or a blur)
    expect(gaitRate(0.01, g, 1, LEG, UNIT)).toBeGreaterThanOrEqual(3);
    expect(gaitRate(80, g, 1, LEG, UNIT)).toBeLessThanOrEqual(30);
  });

  it('walks backward with the legs the other way round', () => {
    const a: Legs = { r: 0, l: 0, liftR: 0, liftL: 0, step: 0, since: 0, thud: 0, xr: 0, xl: 0, kneeR: 0, kneeL: 0 };
    const b: Legs = { ...a };
    const g = PROFILES.ranger.walk;
    gaitLegs(1.2, g, 1, 1, a);
    gaitLegs(1.2, g, 1, -1, b);
    expect(b.r).toBeCloseTo(-a.r, 9);
    expect(b.l).toBeCloseTo(-a.l, 9);
    expect(b.liftR).toBeCloseTo(a.liftR, 9);
  });

  it('is as long as the class makes it: the Ranger runs the longest strides, the Mage the shortest, the Warrior lands hardest', () => {
    const s = (c: MotionClass): Gait => PROFILES[c].sprint;
    expect(s('ranger').stride).toBeGreaterThan(s('warrior').stride);
    expect(s('warrior').stride).toBeGreaterThan(s('mage').stride);
    expect(s('ranger').lift).toBeGreaterThan(s('warrior').lift);
    expect(PROFILES.warrior.walk.impact).toBeGreaterThan(PROFILES.ranger.walk.impact);
    expect(PROFILES.ranger.walk.impact).toBeGreaterThan(PROFILES.mage.walk.impact);
    expect(PROFILES.warrior.sprint.impact).toBeGreaterThan(PROFILES.mage.sprint.impact * 3);
    // The sprint is a different gait, not the walk faster: a flight between steps, a longer stride, a harder lean.
    for (const c of CLASSES) {
      expect(PROFILES[c].sprint.duty, c).toBeLessThan(PROFILES[c].walk.duty);
      expect(PROFILES[c].sprint.stride, c).toBeGreaterThan(PROFILES[c].walk.stride * 1.3);
      expect(PROFILES[c].sprint.lean, c).toBeGreaterThan(PROFILES[c].walk.lean * 2);
    }
    // A robe trails; armor and a hide do not.
    expect(PROFILES.mage.walk.legLag).toBeGreaterThan(0.3);
    expect(PROFILES.warrior.walk.legLag).toBe(0);
  });

  it('gives each class a leg curve of its own', () => {
    const legs: Legs[] = [0, 1, 2].map(() => ({ r: 0, l: 0, liftR: 0, liftL: 0, step: 0, since: 0, thud: 0, xr: 0, xl: 0, kneeR: 0, kneeL: 0 }));
    CLASSES.forEach((c, i) => gaitLegs(1.0, PROFILES[c].walk, 1, 1, legs[i]));
    expect(new Set(legs.map((l) => l.r.toFixed(3))).size).toBe(3);
    expect(legAngle(1, 0.5)).toBeCloseTo(0.5, 9);
  });
});

describe('the stretches', () => {
  const sample = (cls: MotionClass, t: number): StretchKey => stretchAt(cls, t, { t: 0, armLx: 0, armLz: 0, armRx: 0, armRz: 0, armLy: 0, armRy: 0, torsoYaw: 0, lean: 0, headX: 0, headY: 0, headZ: 0, bend: 0, rise: 0 });

  it('each class has one of its own, a few seconds long, that begins and ends standing', () => {
    for (const c of CLASSES) {
      const len = stretchLength(c);
      expect(len, c).toBeGreaterThan(4);
      expect(len, c).toBeLessThan(8);
      const a = sample(c, 0);
      const b = sample(c, len);
      for (const k of Object.keys(a) as (keyof StretchKey)[]) if (k !== 't') expect(b[k], `${c} ${k}`).toBeCloseTo(a[k], 6);
      // (standing: nothing raised, turned, bent)
      expect(Math.abs(a.armLx) + Math.abs(a.armRx)).toBeLessThan(0.2);
      expect(a.bend).toBe(0);
    }
  });

  it('moves smoothly: no part jumps between two frames', () => {
    for (const c of CLASSES) {
      const len = stretchLength(c);
      let prev = sample(c, 0);
      for (let t = 1 / 60; t <= len; t += 1 / 60) {
        const cur = sample(c, t);
        for (const k of Object.keys(cur) as (keyof StretchKey)[]) if (k !== 't') expect(Math.abs(cur[k] - prev[k]), `${c} ${k} at ${t.toFixed(2)}`).toBeLessThan(0.1);
        prev = { ...cur };
      }
    }
  });

  it('are different things: the Warrior rolls his shoulders and crosses an arm, the Mage reaches up, the Ranger crosses an arm and bends his knees', () => {
    const reach = (c: MotionClass): number => Math.max(...STRETCHES[c].map((k) => Math.max(k.armLx, k.armRx)));
    expect(reach('mage')).toBeGreaterThan(2.7);
    expect(reach('warrior')).toBeLessThan(1.6);
    expect(reach('ranger')).toBeLessThan(2.7);
    expect(Math.max(...STRETCHES.ranger.map((k) => k.bend))).toBeGreaterThan(0.9);
    expect(Math.max(...STRETCHES.warrior.map((k) => k.bend))).toBe(0);
    // The Warrior rolls his shoulders: his arms go back and forward more than once.
    const swings = STRETCHES.warrior.filter((k) => k.t > 0 && k.t < 2.2).map((k) => Math.sign(k.armRx));
    expect(swings.some((s) => s < 0) && swings.some((s) => s > 0)).toBe(true);
    // None of them is the same.
    expect(new Set(CLASSES.map((c) => stretchLength(c))).size).toBe(3);
    expect(stretchLength(null)).toBe(0);
  });
});

describe('the state machine', () => {
  const load = { shield: true, carry: 'hand' as const, bow: false };
  const input = (o: Partial<MotionInput> = {}): MotionInput => ({
    speed: 0, walk: 0, run: 0, amp: 0, air: 0, still: 1, engaged: false, fighting: false, swinging: false, stretching: 0, busy: false, accel: 0, turn: 0, load, ...o,
  });
  const run = (m: ClassMotion, seconds: number, i: MotionInput, fps = 60): void => {
    for (let t = 0; t < seconds - 1e-9; t += 1 / fps) m.update(1 / fps, i);
  };
  const make = (cls: MotionClass): ClassMotion => {
    const m = new ClassMotion(7);
    m.setClass(cls);
    return m;
  };

  it('goes into the stance of a fight over the time of its class and not at once', () => {
    for (const c of CLASSES) {
      const m = make(c);
      const t = PROFILES[c].transitions.toCombat;
      m.update(1 / 60, input({ engaged: true }));
      expect(m.combat, `${c} first frame`).toBeLessThan(0.5);
      run(m, t, input({ engaged: true }));
      expect(m.combat, `${c} after ${t}`).toBeGreaterThan(0.9);
      expect(m.state).toBe('combat');
    }
  });

  it('comes out of it after the fight is over, over the time of its class', () => {
    for (const c of CLASSES) {
      const m = make(c);
      run(m, 1.5, input({ engaged: true }));
      expect(m.combat).toBeGreaterThan(0.99);
      // (it holds the stance for a while after the last of the fight)
      run(m, 2, input());
      expect(m.combat, `${c} still holding`).toBeGreaterThan(0.99);
      run(m, 12, input());
      expect(m.combat, `${c} let go`).toBeLessThan(0.01);
      expect(m.state).toBe('idle');
    }
  });

  it('a swing alone is not a fight (it breaks a block as well), but keeps one going', () => {
    const m = make('warrior');
    run(m, 1, input({ swinging: true }));
    expect(m.combat).toBe(0);
    run(m, 1, input({ engaged: true }));
    const hold = 8;
    run(m, hold, input({ swinging: true }));
    expect(m.combat).toBeGreaterThan(0.99);
  });

  it('walks and sprints in over the time the class takes, and out again', () => {
    for (const c of CLASSES) {
      const m = make(c);
      const t = PROFILES[c].transitions;
      run(m, t.toWalk, input({ walk: 1, speed: 4.3, still: 0 }));
      expect(m.moving, `${c} walk`).toBeGreaterThan(0.9);
      expect(m.state).toBe('walk');
      run(m, t.toSprint, input({ walk: 1, run: 1, speed: 5.9, still: 0 }));
      expect(m.sprinting, `${c} sprint`).toBeGreaterThan(0.9);
      expect(m.state).toBe('sprint');
      run(m, t.toIdle + 0.1, input());
      expect(m.moving, `${c} stop`).toBeLessThan(0.1);
      expect(m.state).toBe('idle');
    }
  });

  it('keeps the arms in the fight when walking and lets the legs stride; a sprint swings the arms', () => {
    const m = make('ranger');
    run(m, 1, input({ engaged: true }));
    expect(m.combatLegs).toBeGreaterThan(0.99);
    run(m, 1, input({ engaged: true, walk: 1, speed: 4.3, still: 0, amp: 1 }));
    expect(m.combatLegs).toBeLessThan(0.01);
    expect(m.combatArms).toBeGreaterThan(0.45);
    expect(m.combatArms).toBeLessThan(0.65);
    run(m, 1, input({ engaged: true, walk: 1, run: 1, speed: 5.9, still: 0, amp: 1 }));
    expect(m.combatArms).toBeLessThan(0.25);
    expect(m.combat).toBeGreaterThan(0.99);
  });

  it('is in a stretch while stretching and it ends the fight stance while it does', () => {
    const m = make('mage');
    run(m, 1, input({ engaged: true }));
    expect(m.combatArms).toBeGreaterThan(0.99);
    run(m, 0.2, input({ stretching: 1 }));
    expect(m.state).toBe('stretch');
    expect(m.combatArms).toBe(0);
  });

  it('is the same at any frame rate', () => {
    const scenario = (fps: number): ClassMotion => {
      const m = make('warrior');
      run(m, 0.7, input({ engaged: true }), fps);
      run(m, 0.6, input({ engaged: true, walk: 1, speed: 4.3, still: 0, amp: 1, accel: 8 }), fps);
      run(m, 0.8, input({ engaged: true, walk: 1, run: 1, speed: 5.9, still: 0, amp: 1, accel: 3, turn: 2 }), fps);
      run(m, 0.5, input(), fps);
      return m;
    };
    const ref = scenario(240);
    for (const fps of [30, 60, 144]) {
      const m = scenario(fps);
      expect(Math.abs(m.combat - ref.combat), `combat at ${fps}`).toBeLessThan(0.03);
      expect(Math.abs(m.moving - ref.moving), `moving at ${fps}`).toBeLessThan(0.03);
      expect(Math.abs(m.sprinting - ref.sprinting), `sprinting at ${fps}`).toBeLessThan(0.03);
      expect(Math.abs(m.second.capeX - ref.second.capeX), `cape at ${fps}`).toBeLessThan(0.03);
      expect(Math.abs(m.second.weaponX - ref.second.weaponX), `weapon at ${fps}`).toBeLessThan(0.03);
    }
  });

  it('breathes, shifts its weight and looks about when it stands, not when it moves; each figure its own', () => {
    const a = make('ranger');
    const b = new ClassMotion(99);
    b.setClass('ranger');
    let moved = 0;
    let differ = 0;
    for (let t = 0; t < 30; t += 1 / 60) {
      a.update(1 / 60, input());
      b.update(1 / 60, input());
      moved = Math.max(moved, Math.abs(a.idle.headY), Math.abs(a.idle.rootX) * 10);
      differ = Math.max(differ, Math.abs(a.idle.headY - b.idle.headY));
      expect(Math.abs(a.idle.breath)).toBeLessThanOrEqual(1);
    }
    expect(moved).toBeGreaterThan(0.05);
    expect(differ).toBeGreaterThan(0.05);
    // Moving, it is all gone.
    for (let t = 0; t < 1; t += 1 / 60) a.update(1 / 60, input({ walk: 1, speed: 4.3, still: 0, amp: 1 }));
    expect(a.idle.breath).toBeCloseTo(0, 9);
    expect(Math.abs(a.idle.headY)).toBeLessThan(1e-9);
  });

  it('trails the cape behind a start and forward a stop, and the weapon the other way round', () => {
    const m = make('mage');
    run(m, 0.3, input({ walk: 1, speed: 4.3, still: 0, accel: 20 }));
    expect(m.second.capeX).toBeLessThan(-0.1);
    expect(m.second.weaponX).toBeLessThan(0);
    run(m, 0.3, input({ walk: 0.2, speed: 1, still: 0, accel: -20 }));
    expect(m.second.capeX).toBeGreaterThan(0);
  });

  it('stands a class its own way', () => {
    // Feet wide for the Warrior, close for the Mage; a lean for the Ranger.
    expect(PROFILES.warrior.idle.splay).toBeGreaterThan(PROFILES.ranger.idle.splay);
    expect(PROFILES.ranger.idle.splay).toBeGreaterThan(PROFILES.mage.idle.splay);
    expect(PROFILES.ranger.idle.lean).toBeGreaterThan(0.04);
    expect(PROFILES.warrior.idle.lean).toBeLessThan(0);
    // The Ranger is the most alert (looks about most), the Mage the most calm.
    expect(PROFILES.ranger.idle.glanceEvery[1]).toBeLessThan(PROFILES.warrior.idle.glanceEvery[0]);
    expect(PROFILES.mage.idle.tilt).toBeGreaterThan(PROFILES.warrior.idle.tilt * 2);
    // In a fight: one foot ahead of the other for each, the Warrior with the shield up, the Mage with a hand raised, the Ranger's bow not drawn.
    const pose = PROFILES.warrior.combat({ shield: true, carry: 'hand', bow: false }, { ...PROFILES.plain.combat({ shield: false, carry: 'none', bow: false }, {} as never) });
    expect(pose.shield).toBeGreaterThan(0.3);
    expect(pose.legLx).not.toBe(pose.legRx);
    const mage = PROFILES.mage.combat({ shield: false, carry: 'staff', bow: false }, { ...pose });
    expect(mage.armLx).toBeGreaterThan(1.3);
    const bow = PROFILES.ranger.combat({ shield: false, carry: 'hand', bow: true }, { ...pose });
    expect(bow.armRx).toBeLessThan(1.3);
    expect(bow.legLx).not.toBe(bow.legRx);
  });
});

describe('the knees and the elbows', () => {
  const legs: Legs = { r: 0, l: 0, liftR: 0, liftL: 0, step: 0, since: 0, thud: 0, xr: 0, xl: 0, kneeR: 0, kneeL: 0 };
  /** The most each knee bends over a cycle, and the most the one on the ground gives. */
  const kneesOver = (g: Gait, amp: number): { air: number; ground: number; min: number } => {
    let air = 0;
    let ground = 0;
    let min = 0;
    const foot: Foot = { x: 0, lift: 0, bend: 0, load: 0 };
    for (let i = 0; i < 720; i++) {
      const gait = (i / 720) * Math.PI * 2;
      gaitLegs(gait, g, amp, 1, legs);
      min = Math.min(min, legs.kneeR, legs.kneeL);
      footCycle((gait - Math.PI / 2) / (Math.PI * 2), g.duty, foot);
      if (foot.lift > 0) air = Math.max(air, legs.kneeR);
      else ground = Math.max(ground, legs.kneeR);
    }
    return { air, ground, min };
  };

  it('are straight when the body does not stride, and never bend the wrong way', () => {
    for (const cls of CLASSES) {
      const k = kneesOver(gaitFor(cls, 1), 0);
      expect(k.air).toBe(0);
      expect(k.ground).toBe(0);
      expect(kneesOver(gaitFor(cls, 1), 1).min).toBeGreaterThanOrEqual(0);
    }
  });

  it('fold the leg in the air a good deal and let the one on the ground give only a little, and a run folds more than a walk', () => {
    for (const cls of CLASSES) {
      const walk = kneesOver(gaitFor(cls, 0), 1);
      const run = kneesOver(gaitFor(cls, 1), 1);
      expect(walk.air).toBeGreaterThan(0.3);
      expect(walk.ground).toBeLessThan(walk.air * 0.4);
      expect(run.air).toBeGreaterThan(walk.air * 1.4);
      expect(run.air).toBeLessThan(1.8);
      expect(run.ground).toBeLessThan(run.air * 0.5);
    }
  });

  it('are the same for a walk and a run where the gait is blended: nothing jumps between them', () => {
    const a = kneesOver(gaitFor('ranger', 0.4), 1).air;
    const b = kneesOver(gaitFor('ranger', 0.45), 1).air;
    expect(Math.abs(a - b)).toBeLessThan(0.1);
  });

  it('ask for elbows that are more bent in a run, and bent a little in a walk', () => {
    for (const cls of CLASSES) {
      const { walk, sprint } = PROFILES[cls];
      expect(walk.elbow).toBeGreaterThan(0.05);
      expect(sprint.elbow).toBeGreaterThan(walk.elbow * 3);
      expect(sprint.elbow + sprint.elbowSwing * 1.4).toBeLessThan(2);
    }
  });
});

describe('the spine and the shoulders', () => {
  it('give every class a chest that leans, pumps and shrugs more in a run than in a walk, and never so much that it looks thrown about', () => {
    for (const cls of CLASSES) {
      const { walk, sprint } = PROFILES[cls];
      for (const k of ['spineRoll', 'spineBob', 'shrug', 'shoulderYaw'] as const) {
        expect(walk[k]).toBeGreaterThan(0);
        expect(sprint[k]).toBeGreaterThan(walk[k]);
      }
      expect(sprint.spineRoll).toBeLessThan(0.16);
      expect(sprint.spineBob).toBeLessThan(0.06);
      expect(sprint.shrug).toBeLessThan(0.07);
      // (The shoulders turn against the hips, and turn further than they do: that is what a twist of the chest is.)
      expect(sprint.shoulderYaw).toBeGreaterThan(sprint.hipYaw);
      expect(sprint.shoulderYaw).toBeLessThan(0.45);
    }
  });

  it('is blended with the rest of the gait between a walk and a run', () => {
    const half = gaitFor('warrior', 0.5);
    const { walk, sprint } = PROFILES.warrior;
    for (const k of ['spineRoll', 'spineBob', 'shrug'] as const) expect(half[k]).toBeCloseTo((walk[k] + sprint[k]) / 2, 8);
  });
});
