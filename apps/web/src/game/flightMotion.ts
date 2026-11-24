/**
 * The motion of a winged figure: floating over the ground, taking off, flying, banking, landing. Pure numbers (no three.js), so it can be tested;
 * `Character` is the only thing that writes them onto the body, and the game's own movement (the physics, the double tap, the hover height, the
 * collision) is not touched: it tells this what the body is doing (speed, climb, turn, whether it flies) and takes back a pose.
 *
 * The wings are a chain of three pieces on each side (see wingRig.ts): the arm from the shoulder to the elbow, from the elbow to the wrist, and the
 * hand with the long feathers. A beat starts at the shoulder and travels out: each piece follows the one before a little later and swings a little
 * further, so the tip whips and trails instead of the whole wing turning as one board. The beat is not a sine: the downstroke is quick and strong,
 * the upstroke slower, and both turn round gently at the top and the bottom. The rate, the depth, the fold and the glide all come from blends of the
 * state (floating, flying, how fast, up or down, turning), never from a switch, so nothing snaps.
 *
 * Conventions (those of `Character`): leaning forward is `lean` (positive); the root is turned about x by `-lean`; `turn` is positive to the left and
 * a bank to the left turns the root about z by a positive angle; a leg or arm turned about x is forward when positive. Wing angles are in the frame of
 * the right wing, +x out, +y up, +z behind: the rig mirrors them onto the left one.
 */

import type { MotionClass } from './classMotion';

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeOut = (t: number): number => 1 - (1 - t) ** 3;
/** Out past the end and back (a wing tip that flicks as it comes out). */
const easeOutBack = (t: number): number => {
  const u = clamp01(t) - 1;
  return 1 + 2.2 * u * u * u + 1.2 * u * u;
};

/**
 * One beat of a wing at `p` (a number of cycles): 1 at the top of the stroke, -1 at the bottom. The downstroke is the first `duty` of the cycle (a
 * smaller duty is a quicker, harder one); both strokes ease in and out, so the wing turns round at the top and the bottom with no jerk.
 */
export function flapShape(p: number, duty: number): number {
  const f = p - Math.floor(p);
  return f < duty ? Math.cos((Math.PI * f) / duty) : -Math.cos((Math.PI * (f - duty)) / (1 - duty));
}

/** What the rig takes of one wing: the angles of the pieces, in the frame of the right wing. */
export interface WingSide {
  /** The wing raised (+) or lowered, and swept back (+) or forward, at the shoulder; turned about its length (+: the front edge down). */
  phi: number;
  sweep: number;
  roll: number;
  /** The elbow: bent up (+z) and swept back (-y); the wrist the same. `wristX` twists the hand about its length. */
  elbowZ: number;
  elbowY: number;
  wristZ: number;
  wristY: number;
  wristX: number;
}

export interface WingPose {
  r: WingSide;
  l: WingSide;
}

const side = (): WingSide => ({ phi: 0, sweep: 0, roll: 0, elbowZ: 0, elbowY: 0, wristZ: 0, wristY: 0, wristX: 0 });
export const newWingPose = (): WingPose => ({ r: side(), l: side() });

/** How a class takes to the air. */
export interface FlightStyle {
  /** The beat of the wings (cycles a second): floating, and flying in place. */
  hoverRate: number;
  flapRate: number;
  /** How deep the beat is (1: the common depth), how much of the cycle the downstroke takes (smaller: harder, quicker), the delay between pieces of a wing (cycles). */
  amp: number;
  duty: number;
  lag: number;
  /** How much of the beat gives way to gliding at speed (0 none, 1: bursts of a few strokes between long glides). */
  glide: number;
  /** How quickly the body follows what the controls ask (a heavy one is slow, an agile one quick), per second. */
  response: number;
  /** The lean (radians, forward positive) while floating still, floating and moving as far as `hoverMove`, flying in place, flying on, and flying fast. */
  lean: { idle: number; hoverMove: number; air: number; fwd: number; fast: number };
  /** How far a turn banks the body (a share of the turn rate) and the most it banks. */
  bank: number;
  bankMax: number;
  /** The float: its size (units) and its rate (radians a second). */
  bob: number;
  bobRate: number;
  /** The time of the takeoff and of the landing (seconds). */
  takeoff: number;
  landing: number;
  /** How far the head turns up against the lean to keep looking where it goes. */
  headLook: number;
  /** The legs: floating (left, right, spread), hanging in the air, trailing in a flight and flat out in a fast one; how far they brace on a blow. */
  legs: { hoverL: number; hoverR: number; splay: number; airL: number; airR: number; trail: number; fast: number; brace: number };
  /** The arms (forward positive) and how far out they are held: floating, in the air still, flying on, and fast. */
  arms: { hoverX: number; hoverOut: number; airX: number; airOut: number; fwdX: number; fwdOut: number; fastX: number; fastOut: number };
}

const WARRIOR: FlightStyle = {
  hoverRate: 0.42, flapRate: 1.25, amp: 1.2, duty: 0.4, lag: 0.09, glide: 0.35, response: 4.2,
  lean: { idle: -0.02, hoverMove: 0.3, air: 0.05, fwd: 0.6, fast: 0.8 },
  bank: 0.85, bankMax: 0.5, bob: 0.034, bobRate: 1.9, takeoff: 0.74, landing: 0.7, headLook: 0.72,
  legs: { hoverL: 0.16, hoverR: -0.03, splay: 0.14, airL: 0.14, airR: -0.1, trail: 0.42, fast: 0.62, brace: 0.22 },
  arms: { hoverX: 0.3, hoverOut: 0.12, airX: 0.38, airOut: 0.14, fwdX: 0.5, fwdOut: 0.1, fastX: 0.34, fastOut: 0.07 },
};

const MAGE: FlightStyle = {
  hoverRate: 0.32, flapRate: 0.95, amp: 0.82, duty: 0.5, lag: 0.17, glide: 0.55, response: 3.2,
  lean: { idle: 0, hoverMove: 0.24, air: 0.02, fwd: 0.5, fast: 0.64 },
  bank: 1.0, bankMax: 0.52, bob: 0.064, bobRate: 1.45, takeoff: 0.8, landing: 0.78, headLook: 0.62,
  legs: { hoverL: -0.03, hoverR: -0.13, splay: 0.025, airL: -0.05, airR: -0.2, trail: 0.36, fast: 0.52, brace: 0.1 },
  arms: { hoverX: 0.1, hoverOut: 0.21, airX: 0.14, airOut: 0.26, fwdX: -0.06, fwdOut: 0.2, fastX: -0.22, fastOut: 0.1 },
};

const RANGER: FlightStyle = {
  hoverRate: 0.56, flapRate: 1.7, amp: 0.98, duty: 0.36, lag: 0.075, glide: 0.5, response: 7.5,
  lean: { idle: 0.08, hoverMove: 0.34, air: 0.1, fwd: 0.74, fast: 0.92 },
  bank: 1.35, bankMax: 0.62, bob: 0.04, bobRate: 2.7, takeoff: 0.5, landing: 0.55, headLook: 0.78,
  legs: { hoverL: 0.2, hoverR: -0.16, splay: 0.07, airL: 0.18, airR: -0.2, trail: 0.5, fast: 0.84, brace: 0.16 },
  arms: { hoverX: 0.04, hoverOut: 0.15, airX: 0.0, airOut: 0.3, fwdX: -0.42, fwdOut: 0.12, fastX: -0.62, fastOut: 0.06 },
};

export const FLIGHT_STYLES: Readonly<Record<MotionClass | 'plain', FlightStyle>> = { warrior: WARRIOR, mage: MAGE, ranger: RANGER, plain: { ...RANGER, hoverRate: 0.5, flapRate: 1.5, response: 5.5, lean: { ...RANGER.lean, idle: 0.02 } } };

/** How the build of a pair of wings changes the beat: feathers bend and trail the most, glass the least. */
const FLEX = { feather: 1.15, bat: 1.0, blade: 0.8 } as const;
const LAGS = { feather: 1.2, bat: 0.9, blade: 0.7 } as const;

/** How long the wings take to open when put on (seconds), and when each piece is on its way (the delay before it starts). */
export const DEPLOY_TIME = 0.95;
const DEPLOY = { root: [0, 0.55], elbow: [0.14, 0.58], wrist: [0.3, 0.6] } as const;

export interface FlightInput {
  /** Wings are worn (and the figure is not on a mount or in the water), and the wearer flies on them. */
  wings: boolean;
  flying: boolean;
  /** Ground speed (blocks/s), the climb (blocks/s, positive up), the turn (radians/s, positive to the left), how fast the speed is changing (blocks/s per second). */
  speed: number;
  vy: number;
  turn: number;
  accel: number;
  cls: MotionClass | null;
  /** The speed these wings fly at flat out (blocks/s), the build of the pair, how much the hands are busy (0..1, a blow, a guard, a spell), and how far the class is in a fight (0..1). */
  top: number;
  shape: 'bat' | 'feather' | 'blade' | null;
  brace: number;
  combat: number;
  /** The way it goes against the way it faces: ahead (1) or back (-1), and to the right (1) or the left (-1), both faded to straight ahead while it hardly moves (default: ahead). */
  fwd?: number;
  side?: number;
}

/** What the body is told to do: the angles are those `Character` writes (see the top of the file). */
export interface FlightOut {
  /** How far the figure has come up out of the grounded pose (0..1; the wings take about a second to open and it rises with them) and how far it flies (0..1). */
  rise: number;
  fly: number;
  /** The root: turned (pitch positive: nose down, as in `lean`), banked, and how far up the float is (units, over the hover height). */
  lean: number;
  climb: number;
  bank: number;
  bob: number;
  /** The chest turned with the turn, the head turned up against the lean and level against the bank. */
  torsoY: number;
  headX: number;
  headZ: number;
  legLx: number;
  legRx: number;
  legLz: number;
  legRz: number;
  armLx: number;
  armRx: number;
  armLz: number;
  armRz: number;
  /** The angle the cape should hang at (negative: streaming back). */
  cape: number;
  wing: WingPose;
  /** For tests and the lab: which part of the flight this is. */
  state: FlightState;
}

export type FlightState = 'none' | 'equip' | 'hover' | 'hoverMove' | 'hoverSprint' | 'takeoff' | 'flightIdle' | 'flight' | 'fast' | 'ascend' | 'descend' | 'landing';

export class FlightMotion {
  readonly out: FlightOut = {
    rise: 0, fly: 0, lean: 0, climb: 0, bank: 0, bob: 0, torsoY: 0, headX: 0, headZ: 0,
    legLx: 0, legRx: 0, legLz: 0, legRz: 0, armLx: 0, armRx: 0, armLz: 0, armRz: 0, cape: -0.07, wing: newWingPose(), state: 'none',
  };

  /** The seconds since the wings went on, and the share of the time they are folded (the pieces of each wing unfold one after another). */
  private dep = DEPLOY_TIME;
  private wasFly = false;
  private takeT = 99;
  /** The place in the beat where the takeoff began, and the top of the stroke it draws in to. */
  private takeFrom = 0;
  private landT = 99;
  private f = 0;
  private phase = 0;
  private bobPhase = 0;
  private burstPhase = 0;
  private shimmer = 0;
  private mvG = 0;
  private mvF = 0;
  private fast = 0;
  private turnLP = 0;
  /** Which way it goes against the way it faces, eased. */
  private fwdLP = 1;
  private sideLP = 0;
  private vyLP = 0;
  private leanS = 0;
  private bankS = 0;
  private armPh = 0;
  // The tips are on springs: they trail what the body does (a climb, a start, a stop) and spring back.
  private tipX = 0;
  private tipV = 0;

  /** The wings have just been put on: they open from folded (it is the only time the whole opening is played). */
  equip(): void {
    this.dep = 0;
    this.f = 0;
    this.takeT = this.landT = 99;
    this.wasFly = false;
    this.tipX = this.tipV = 0;
  }

  /** Forget everything: no wings. */
  reset(): void {
    this.dep = DEPLOY_TIME;
    this.f = 0;
    this.wasFly = false;
    this.takeT = this.landT = 99;
    this.mvG = this.mvF = this.fast = this.turnLP = this.vyLP = this.leanS = this.bankS = this.sideLP = 0;
    this.fwdLP = 1;
    this.out.rise = 0;
    this.out.fly = 0;
    this.out.state = 'none';
  }

  /** How long ago the flight began and ended (for tests). */
  get sinceTakeoff(): number {
    return this.takeT;
  }

  update(dt0: number, i: FlightInput): FlightOut {
    const dt = clamp(dt0, 0, 0.1);
    const o = this.out;
    const st = FLIGHT_STYLES[i.cls ?? 'plain'];
    if (!i.wings) {
      this.reset();
      return o;
    }
    const ease = (rate: number): number => 1 - Math.exp(-dt * rate);
    const flying = i.flying;
    if (flying && !this.wasFly) {
      this.takeT = 0;
      this.takeFrom = this.phase;
      this.landT = 99;
    } else if (!flying && this.wasFly) {
      this.landT = 0;
      this.takeT = 99;
    }
    this.wasFly = flying;
    this.dep = Math.min(this.dep + dt, DEPLOY_TIME + 1);
    if (this.takeT < 90) this.takeT += dt;
    if (this.landT < 90) this.landT += dt;
    this.f += ((flying ? 1 : 0) - this.f) * ease(flying ? 7 : 4.2);
    if (this.f < 0.002) this.f = 0;
    else if (this.f > 0.998) this.f = 1;
    const f = this.f;

    // ---- what the body is doing, smoothed (the controls change in one frame; the figure does not) ----
    const spd = i.speed;
    this.mvG += (clamp01(spd / 6.5) - this.mvG) * ease(6);
    this.mvF += (clamp01(spd / Math.max(1, i.top)) - this.mvF) * ease(4);
    // Flat out is the last third of the flight speed; it comes in over a moment.
    this.fast += (smooth(0.62, 0.95, spd / Math.max(1, i.top)) * f - this.fast) * ease(3);
    this.turnLP += (i.turn - this.turnLP) * ease(10);
    this.fwdLP += (clamp(i.fwd ?? 1, -1, 1) - this.fwdLP) * ease(6);
    this.sideLP += (clamp(i.side ?? 0, -1, 1) - this.sideLP) * ease(6);
    this.vyLP += (i.vy - this.vyLP) * ease(8);
    const mvG = this.mvG;
    const mvF = this.mvF;
    const fast = this.fast;
    const run = clamp01((spd - 4.9) / 1.6) * (1 - f);
    const up = clamp01(this.vyLP / 6) * f;
    const dn = clamp01(-this.vyLP / 6) * f;

    // ---- the equip: the wings open from the shoulder out, the elbow after the root and the hand last ----
    const stage = (k: readonly [number, number], back = false): number => {
      const t = clamp01((this.dep - k[0]) / k[1]);
      return back ? easeOutBack(t) : easeOut(t);
    };
    const dRoot = stage(DEPLOY.root);
    const dElbow = stage(DEPLOY.elbow);
    const dWrist = stage(DEPLOY.wrist, true);
    const fRoot = 1 - dRoot;
    const fElbow = 1 - dElbow;
    const fWrist = 1 - dWrist;
    o.rise = smooth(0, 1, this.dep / (DEPLOY_TIME * 0.95));

    // ---- the takeoff: draw in, spread, one hard downstroke, then the beat of the flight; and the landing: a flare ----
    const tk = st.takeoff;
    const k = tk / 0.62;
    const t1 = 0.14 * k;
    const t2 = 0.44 * k;
    const taking = this.takeT < t2;
    let draw = 0;
    let boost = 0;
    if (this.takeT < 90) {
      const t = this.takeT;
      draw = t < t1 ? smooth(0, t1, t) : 1 - smooth(t1, t1 + 0.1 * k, t);
      if (t >= t1 && t < t2) boost = Math.sin((Math.PI * (t - t1)) / (t2 - t1));
    }
    const tuck = this.takeT < 90 ? Math.sin(Math.PI * clamp01((this.takeT - t1) / (tk * 1.15 - t1))) : 0;
    const landU = this.landT / st.landing;
    const land = landU < 1 ? 1 - smooth(0, 1, landU) : 0;

    // ---- the beat ----
    const duty = lerp(0.5, st.duty, f);
    const hoverHz = st.hoverRate * (1 + 1.5 * mvG + 0.7 * run);
    const flightHz = st.flapRate * (0.85 + 0.35 * mvF) * (1 + 0.16 * up) * (1 - 0.28 * fast) * (1 - 0.3 * dn);
    if (taking) {
      // (The beat is brought to the top of the stroke while it draws in (from wherever it was, by the near way: no jump), then the downstroke is played through in the time it has.)
      this.phase = this.takeT < t1 ? this.takeFrom + (Math.round(this.takeFrom) - this.takeFrom) * smooth(0, 1, this.takeT / t1) : (duty * (this.takeT - t1)) / (t2 - t1);
    } else if (this.takeT < 90 && this.takeT - dt < t2) {
      this.phase = duty; // the bottom of the stroke: the beat takes up from there
      this.phase += flightHz * (this.takeT - t2);
    } else this.phase += lerp(hoverHz, flightHz, f) * dt;
    this.phase -= Math.floor(this.phase);
    this.burstPhase += dt * TAU * 0.5;
    this.shimmer += dt;
    // Flat out it beats in bursts with gliding between; a glide is the wings held out and still.
    const burst = smooth(-0.25, 0.75, Math.sin(this.burstPhase));
    const glideK = 1 - st.glide * fast * (1 - burst);
    const ampHover = 0.045 * (1 + 2.4 * mvG + 1.2 * run);
    const ampFlight = 0.3 * st.amp * (1 + 0.32 * up) * (1 - 0.55 * dn) * (1 - 0.3 * fast) * glideK;
    const A = lerp(ampHover, ampFlight, f) * (1 + 0.42 * boost);
    const flex = FLEX[i.shape ?? 'bat'];
    const lag = st.lag * LAGS[i.shape ?? 'bat'];
    const s0 = flapShape(this.phase, duty);
    const s1 = flapShape(this.phase - lag, duty);
    const s2 = flapShape(this.phase - 2 * lag, duty);
    const sRoll = flapShape(this.phase + 0.18, duty);

    // The tips trail a start, a climb and a stop, and spring back.
    const tipTarget = clamp(-i.accel * 0.012 - this.vyLP * 0.035 * f, -0.5, 0.5);
    let h = dt;
    while (h > 0) {
      const step = Math.min(h, 0.008);
      this.tipV += ((tipTarget - this.tipX) * 70 - this.tipV * 8.5) * step;
      this.tipX += this.tipV * step;
      h -= step;
    }

    // ---- the pose of the wings: the middle of the beat (where the wing rests) and the beat round it ----
    const phiHover = 0.22 + 0.1 * mvG + 0.1 * run;
    const phiFlight = 0.1 - 0.1 * fast + 0.2 * dn - 0.04 * up;
    const sweepHover = 0.5 + 0.22 * mvG + 0.22 * run;
    const sweepFlight = 0.3 + 0.12 * mvF + 0.34 * fast - 0.14 * dn;
    const phiMean = lerp(phiHover, phiFlight, f);
    const sweepMean = lerp(sweepHover, sweepFlight, f);
    const elbowMean = -(0.08 * run) * (1 - f) - (0.05 + 0.3 * fast) * f;
    const wristMean = -(0.04 + 0.36 * fast) * f + 0.03 * (1 - f);
    // A turn: the wing on the inside of it draws in and drops, the outer one reaches out and lifts. The flare of a landing opens both wide.
    const bankIn = clamp(this.turnLP * st.bank * 0.12 - this.sideLP * st.bank * 0.3, -st.bankMax, st.bankMax) * (0.08 + 0.92 * smooth(0, 0.6, mvF)) * f;
    const vib = fast * 0.018 * Math.sin(this.shimmer * 41);
    const w = o.wing;
    const leanNow = clamp(this.leanS, 0, 1.3);
    const sinLean = Math.sin(leanNow);
    const cosLean = Math.cos(leanNow);
    for (const [sd, left] of [[w.r, false], [w.l, true]] as const) {
      const sg = left ? -1 : 1; // (a turn to the left: the right wing is outside)
      const ph = left ? 0.018 : 0; // (the two wings are not quite in step)
      const a = A * (left ? 0.97 : 1);
      const e = ph ? flapShape(this.phase - lag + ph, duty) : s1;
      const t = ph ? flapShape(this.phase - 2 * lag + ph, duty) : s2;
      const r0 = ph ? flapShape(this.phase + ph, duty) : s0;
      sd.phi = phiMean + a * r0 + sg * 0.34 * bankIn + 0.2 * draw + 0.18 * land;
      // The sweep is how far back the wing is swept as the world sees it. A body lying forward has its back turned up, so a wing swept back along it is
      // swept toward the feet, not up into the air: the sweep is turned into the angles of the hinge for the lean the body has.
      const swept = sweepMean + 0.45 * a * r0 - sg * 0.16 * bankIn + 0.5 * draw - 0.12 * land + 0.18 * i.brace * (1 - f);
      sd.sweep = Math.atan2(Math.sin(swept) * cosLean, Math.cos(swept));
      sd.phi += Math.asin(clamp(-Math.sin(swept) * sinLean, -0.95, 0.95));
      sd.roll = 0.45 * a * (ph ? flapShape(this.phase + 0.18 + ph, duty) : sRoll) + 0.12 * land;
      sd.elbowZ = a * 0.8 * flex * e + this.tipX * 0.5 + vib * 0.5;
      sd.elbowY = elbowMean + sg * 0.14 * bankIn - 0.5 * draw;
      sd.wristZ = a * 0.95 * flex * t + this.tipX + vib;
      sd.wristY = wristMean - 0.32 * draw + sg * 0.1 * bankIn;
      sd.wristX = 0.3 * a * flex * (ph ? flapShape(this.phase - 2 * lag + 0.15 + ph, duty) : flapShape(this.phase - 2 * lag + 0.15, duty));
      // The wings open from folded (the shoulder first, the elbow after and the tip last, flicking out).
      sd.phi += 0.2 * fRoot;
      sd.sweep += 0.7 * fRoot;
      sd.elbowY -= 1.0 * fElbow;
      sd.elbowZ += 0.15 * fElbow;
      sd.wristY -= 0.95 * fWrist;
      sd.wristZ -= 0.2 * fWrist;
    }

    // ---- the body ----
    const hoverLean = st.lean.idle + (0.04 + 0.26 * mvG) * (st.lean.hoverMove / 0.3) + 0.12 * run;
    const flightLean = lerp(st.lean.air, st.lean.fwd, mvF) + (st.lean.fast - st.lean.fwd) * fast;
    let lean = lerp(hoverLean, flightLean, f);
    {
      const ahead = clamp(this.fwdLP, -0.6, 1);
      const l0 = lerp(st.lean.idle, st.lean.air, f);
      lean = l0 + (lean - l0) * lerp(1, ahead >= 0 ? ahead : ahead * 0.7, smooth(0, 0.5, Math.max(mvF, mvG * (1 - f))));
    }
    lean += clamp(i.accel * 0.012, -0.12, 0.15) * (0.4 + 0.6 * f);
    // The takeoff straightens it up first; a blow braces it; a landing sits it back.
    lean *= 1 - 0.85 * draw;
    lean *= 1 - 0.45 * i.brace;
    lean *= 1 - 0.55 * land;
    this.leanS += (lean - this.leanS) * ease(st.response);
    // Nose up in a climb and down in a dive (it never turns over).
    o.climb = clamp(this.vyLP * 0.035, -0.3, 0.3) * (0.5 + 0.5 * f);
    o.lean = this.leanS;
    const bankHover = clamp(this.turnLP * 0.03 - this.sideLP * 0.14, -0.16, 0.16) * mvG * (1 - f);
    this.bankS += (bankIn + bankHover - this.bankS) * ease(st.response * 0.9);
    o.bank = this.bankS;
    o.fly = f;
    // (The float: slow and small floating; in the air the body rises as the wings come down and sinks as they go up, a little.)
    this.bobPhase += dt * st.bobRate;
    const breath = Math.sin(this.bobPhase) + 0.3 * Math.sin(this.bobPhase * 2.1 + 1);
    o.bob = st.bob * breath * (1 - 0.45 * f) - 0.06 * (A / 0.3) * s1 * f * 0.9 - 0.045 * Math.sin(Math.PI * Math.min(1, this.landT / 0.45)) * (this.landT < 0.45 ? 1 : 0);
    o.torsoY = clamp(-this.turnLP * 0.05, -0.2, 0.2) * (0.4 + 0.6 * f);
    o.headX = this.leanS * st.headLook;
    o.headZ = -this.bankS * 0.6;

    // The legs hang and drift floating, trail in a flight and lie out in a fast one; they tuck as it takes off and reach down to land.
    const flutter = Math.sin(this.shimmer * (2.2 + 3 * f)) * (0.05 - 0.02 * f);
    const L = st.legs;
    const hoverTrail = (0.06 + 0.36 * mvG + 0.16 * run);
    const airTrail = (lerp(0, L.trail, mvF) + (L.fast - L.trail) * fast) * clamp(this.fwdLP, -0.5, 1);
    const legLhover = L.hoverL - hoverTrail;
    const legRhover = L.hoverR - hoverTrail * 0.8;
    const legLair = lerp(L.airL, -airTrail, mvF) - up * 0.1 + dn * 0.28;
    const legRair = lerp(L.airR, -airTrail * 0.86, mvF) - up * 0.18 + dn * 0.3;
    o.legLx = lerp(legLhover, legLair, f) + flutter + 0.3 * tuck * (1 - fast) + 0.26 * land - L.brace * i.brace * (1 - f * 0.5);
    o.legRx = lerp(legRhover, legRair, f) - flutter + 0.38 * tuck * (1 - fast) + 0.2 * land - L.brace * i.brace * 0.6 * (1 - f * 0.5);
    const splay = lerp(L.splay, L.splay * 0.55, f) * (1 - 0.6 * fast);
    // (Going to a side, the feet are left behind on the other: both legs swing that way.)
    const drift = -this.sideLP * 0.3 * Math.max(mvF, mvG * 0.6);
    o.legLz = -splay + drift;
    o.legRz = splay + drift;

    // The arms: held up and ready floating, out to steady the body in the air, along the body in a flight; what a hand holds or does is left to it.
    this.armPh += dt * (1.7 + 2.6 * f);
    const rock = Math.sin(this.armPh);
    const Ar = st.arms;
    const armHover = Ar.hoverX - 0.22 * mvG - 0.1 * run;
    const armAir = lerp(Ar.airX, Ar.fwdX, mvF) + (Ar.fastX - Ar.fwdX) * fast;
    const outHover = Ar.hoverOut + 0.12 * mvG;
    const outAir = lerp(Ar.airOut, Ar.fwdOut, mvF) + (Ar.fastOut - Ar.fwdOut) * fast;
    const armX = lerp(armHover, armAir, f) + 0.14 * tuck;
    const out = lerp(outHover, outAir, f) + 0.05 * land + 0.1 * draw;
    const sway = (0.06 - 0.02 * f) * rock * (1 - 0.7 * fast);
    o.armLx = armX - sway;
    o.armRx = armX + sway;
    // (Going to a side, both arms go that way, to steady it.)
    const reach = this.sideLP * 0.2 * Math.max(mvF, mvG * 0.6);
    o.armLz = -out - 0.03 * rock + reach;
    o.armRz = out + 0.03 * rock + reach;
    o.cape = -(0.07 + 0.28 * mvG * (1 - f) + f * (0.3 + 0.5 * mvF + 0.4 * fast));

    o.state =
      this.dep < DEPLOY_TIME * 0.95 ? 'equip'
      : this.takeT < tk ? 'takeoff'
      : f > 0.5 ? (dn > 0.35 ? 'descend' : up > 0.35 ? 'ascend' : fast > 0.5 ? 'fast' : mvF > 0.25 ? 'flight' : 'flightIdle')
      : this.landT < st.landing ? 'landing'
      : run > 0.5 ? 'hoverSprint'
      : mvG > 0.3 ? 'hoverMove'
      : 'hover';
    return o;
  }
}
