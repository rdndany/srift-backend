import type { ClassId } from '@solrift/shared';

/**
 * How a class moves: the personality of the Warrior (heavy, planted, deliberate), the Mage (upright, flowing, composed) and the Ranger (light,
 * athletic, alert), as numbers and small pure functions, with no three.js in it so every part can be tested on its own.
 *
 * The figure itself (`Character`) is still the only thing that writes to the bones. This module is what it asks: how long a stride is and when
 * each foot touches the ground (`gaitLegs`), how the body leans, turns and drops in a step (`Gait`), what the idle body does (`IdleOut`), how the class
 * stands to fight (`CombatPose`), how it stretches (`STRETCHES`), how its cape, robe and weapon trail behind (`Secondary`), and the state machine that
 * blends between standing, fighting, walking, sprinting and stretching (`ClassMotion`). A figure with no class gets `PLAIN`, a neutral walker.
 *
 * Angles are the figure's own (see `Character`): an arm or a leg at 0 hangs straight down and positive x swings it forward; z swings an arm out and
 * a leg out (right: positive); a positive turn of the torso brings the right shoulder forward. Lengths are in the figure's own units (a leg is 0.75).
 */

export type MotionClass = ClassId;

const TAU = Math.PI * 2;
const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const smooth = (x: number): number => {
  const v = clamp01(x);
  return v * v * (3 - 2 * v);
};
/** Move `v` towards `target` as a lag of time constant `tau` seconds does (the same at any frame rate). */
const follow = (v: number, target: number, dt: number, tau: number): number => v + (target - v) * (1 - Math.exp(-dt / Math.max(1e-4, tau)));

// ---- the stride ---------------------------------------------------------------------------------------------------------------------------

/** What makes a walk or a run, for one class at one gait. */
export interface Gait {
  /** Half the swing of a leg at full speed (radians): the longer it is, the longer the stride. */
  stride: number;
  /** The share of a cycle each foot spends on the ground (more than a half: both feet down together; less: a flight between steps). */
  duty: number;
  /** How far the swinging foot is picked up (units). */
  lift: number;
  /** How much of the drop of the hips that a swing of straight legs would need (to keep the planted foot on the floor) is taken: 1 is all of it (the feet never float, the body bobs). */
  plant: number;
  /** How far the body is jarred down when a foot lands (units). */
  impact: number;
  /** The swing of the arms (radians), how far behind the legs they are (radians of the cycle), and how far forward they are carried while moving. */
  armSwing: number;
  armLag: number;
  armPump: number;
  /** The hips and the shoulders turn against each other with each step (radians each). */
  hipYaw: number;
  shoulderYaw: number;
  /** The body moves over the foot that takes the weight (units), and the pelvis drops on the side of the foot in the air (radians). */
  sway: number;
  roll: number;
  /** How far the body leans forward at full speed (radians). */
  lean: number;
  /** How much of the lean and the roll of the body the head cancels (0..1), and how far it bobs with the steps (units). */
  headStab: number;
  headBob: number;
  /** How much the legs trail a beat behind the stride, as the skirts of a robe make them (0..1), and how far apart they are kept. */
  legLag: number;
  spread: number;
  /** How far the knee of the leg in the air bends at the most, and how far the one on the ground gives as it takes the weight (radians). */
  knee: number;
  kneeLoad: number;
  /** How far the elbows are bent however the arms swing (radians), and how much more as the arm comes forward. */
  elbow: number;
  elbowSwing: number;
  /**
   * The spine is not a post: the chest leans to the side of the foot that takes the weight, a beat behind the hips (radians, about the hip); it pumps
   * forward and back twice in a stride (radians); and each shoulder rises as its arm swings forward (units).
   */
  spineRoll: number;
  spineBob: number;
  shrug: number;
}

const GAIT_KEYS: readonly (keyof Gait)[] = ['stride', 'duty', 'lift', 'plant', 'impact', 'armSwing', 'armLag', 'armPump', 'hipYaw', 'shoulderYaw', 'sway', 'roll', 'lean', 'headStab', 'headBob', 'legLag', 'spread', 'knee', 'kneeLoad', 'elbow', 'elbowSwing', 'spineRoll', 'spineBob', 'shrug'];

/** `a` towards `b` by `k`, into `out`. */
export function blendGait(a: Gait, b: Gait, k: number, out: Gait): Gait {
  for (const key of GAIT_KEYS) out[key] = lerp(a[key], b[key], k);
  return out;
}

/** The way the body stands when it is not moving. All offsets from a plain standing pose, in radians unless said. */
export interface Idle {
  /** Each leg turned out from the hip, and one leg ahead of the other. */
  splay: number;
  stagger: number;
  /** The waist (forward positive) and how far the arms are held out from the sides and forward. */
  lean: number;
  armOut: number;
  armFwd: number;
  /** Breathing: the seconds one takes, how much the chest fills (as a fraction), how far the shoulders rise (units) and how far the arms hang out with it. */
  breath: number;
  chest: number;
  shoulder: number;
  /** Shifting the weight: the sideways move (units) and the roll of the hips (radians) at the most, seconds between shifts (min, max), how fast it is done (Hz). */
  shift: number;
  shiftRoll: number;
  shiftEvery: readonly [number, number];
  shiftHz: number;
  /** Looking about: the turn of the head at the most (radians), the seconds between looks, how quick the eyes are. */
  glance: number;
  glanceEvery: readonly [number, number];
  glanceHz: number;
  /** The head tilted to a side and the up and down of a look (radians at the most). */
  tilt: number;
  nod: number;
  /** A slow sway of the whole body (units) and its period, a small movement of the hands (radians). */
  sway: number;
  swayPeriod: number;
  fidget: number;
  /** How long it stands still before stretching (seconds). */
  stretchAfter: number;
}

/** What each part is doing in the pose of a class standing to fight. Arms and legs are the angles themselves; the rest are added. */
export interface CombatPose {
  armLx: number;
  armLz: number;
  armRx: number;
  armRz: number;
  legLx: number;
  legLz: number;
  legRx: number;
  legRz: number;
  /** The shoulders and the hips turned (positive: the right shoulder forward), the waist, the head against the way the body is turned. */
  torsoYaw: number;
  hipYaw: number;
  lean: number;
  headX: number;
  headZ: number;
  /** How far the shield is raised in front (0..1). */
  shield: number;
  /** How far the weapon keeps the way it points when the arm moves (1: it points as it did; 0: it turns with the arm). */
  keep: number;
  /** The seconds between a breath, the weight shifts and its size, the move of the hands. */
  breath: number;
  shift: number;
  fidget: number;
  /** The seconds before the body gives up the fight when nothing is going on. */
  hold: number;
}

/** What a class wears and carries, for the way it stands to fight. */
export interface Loadout {
  shield: boolean;
  /** `hand`: a weapon or tool in the fist, `staff`, `wand`, `hang` (a lantern), or nothing at all. */
  carry: 'hand' | 'staff' | 'wand' | 'hang' | 'none';
  /** A bow or a crossbow is in the hand. */
  bow: boolean;
}

/** How long the changes of state take (seconds): about three times the time constant of each. */
export interface Transitions {
  toWalk: number;
  toSprint: number;
  toIdle: number;
  toCombat: number;
  fromCombat: number;
  fromStretch: number;
}

/** How fast the speed and the stride follow what is asked (per second): a heavy body takes longer to get going and to stop. */
export interface Response {
  speed: number;
  amp: number;
}

/** What a class is. */
export interface Profile {
  id: MotionClass | 'plain';
  walk: Gait;
  sprint: Gait;
  idle: Idle;
  /** The pose of the fight for a body with the loadout, written into `out`. */
  combat(l: Loadout, out: CombatPose): CombatPose;
  transitions: Transitions;
  response: Response;
  /** How much the cape, the weapon and the robe trail behind the body. */
  cape: number;
  weapon: number;
  robe: number;
}

// ---- the three of them --------------------------------------------------------------------------------------------------------------------

const baseCombat = (): CombatPose => ({
  armLx: 0, armLz: -0.1, armRx: 0, armRz: 0.1, legLx: 0, legLz: -0.1, legRx: 0, legRz: 0.1,
  torsoYaw: 0, hipYaw: 0, lean: 0.08, headX: 0, headZ: 0, shield: 0, keep: 1, breath: 3, shift: 0.02, fidget: 0, hold: 5,
});
const setPose = (out: CombatPose, from: Partial<CombatPose>): CombatPose => Object.assign(out, baseCombat(), from);

/** Heavy and planted: the feet wide, the weight low, the chest out, the shield up and the blade ready. */
const WARRIOR: Profile = {
  id: 'warrior',
  walk: { stride: 0.56, duty: 0.56, lift: 0.07, plant: 0.7, impact: 0.02, armSwing: 0.34, armLag: 0.5, armPump: 0.04, hipYaw: 0.08, shoulderYaw: 0.16, sway: 0.034, roll: 0.04, lean: 0.05, headStab: 0.75, headBob: 0.008, legLag: 0, spread: 0.07, knee: 0.62, kneeLoad: 0.13, elbow: 0.16, elbowSwing: 0.3, spineRoll: 0.05, spineBob: 0.015, shrug: 0.02 },
  sprint: { stride: 0.86, duty: 0.42, lift: 0.17, plant: 0.42, impact: 0.05, armSwing: 0.85, armLag: 0.35, armPump: 0.34, hipYaw: 0.11, shoulderYaw: 0.3, sway: 0.03, roll: 0.045, lean: 0.24, headStab: 0.9, headBob: 0.014, legLag: 0, spread: 0.08, knee: 1.25, kneeLoad: 0.3, elbow: 1.0, elbowSwing: 0.3, spineRoll: 0.09, spineBob: 0.03, shrug: 0.04 },
  idle: {
    splay: 0.17, stagger: 0.05, lean: -0.05, armOut: 0.1, armFwd: 0.07, breath: 4.4, chest: 0.014, shoulder: 0.011,
    shift: 0.032, shiftRoll: 0.03, shiftEvery: [5, 9], shiftHz: 0.8, glance: 0.2, glanceEvery: [6, 11], glanceHz: 1.1, tilt: 0.03, nod: 0.03,
    sway: 0.004, swayPeriod: 7, fidget: 0.02, stretchAfter: 24,
  },
  combat(l, out) {
    const shield = l.shield;
    return setPose(out, {
      armLx: shield ? 0.82 : l.carry === 'none' ? 1.0 : 0.55, armLz: shield ? -0.2 : -0.28,
      armRx: l.carry === 'none' ? 1.0 : 0.95, armRz: 0.24,
      legLx: 0.3, legLz: -0.19, legRx: -0.22, legRz: 0.2,
      torsoYaw: -0.3, hipYaw: -0.12, lean: 0.13, headX: 0.05, headZ: 0, shield: shield ? 0.6 : 0, keep: 0.35, breath: 3.2, shift: 0.02, fidget: 0.012, hold: 6,
    });
  },
  transitions: { toWalk: 0.24, toSprint: 0.34, toIdle: 0.3, toCombat: 0.26, fromCombat: 0.4, fromStretch: 0.4 },
  response: { speed: 7, amp: 6 },
  cape: 0.7,
  weapon: 0.7,
  robe: 0,
};

/** Upright and flowing: the feet close, the hands kept in front, the body trailing a little behind its own step, and a hand always ready to channel. */
const MAGE: Profile = {
  id: 'mage',
  walk: { stride: 0.5, duty: 0.52, lift: 0.08, plant: 0.5, impact: 0.004, armSwing: 0.26, armLag: 0.75, armPump: 0.02, hipYaw: 0.1, shoulderYaw: 0.1, sway: 0.02, roll: 0.03, lean: 0.025, headStab: 0.92, headBob: 0.004, legLag: 0.55, spread: 0.015, knee: 0.55, kneeLoad: 0.1, elbow: 0.2, elbowSwing: 0.3, spineRoll: 0.04, spineBob: 0.01, shrug: 0.015 },
  sprint: { stride: 0.78, duty: 0.44, lift: 0.14, plant: 0.45, impact: 0.01, armSwing: 0.5, armLag: 0.6, armPump: 0.22, hipYaw: 0.1, shoulderYaw: 0.2, sway: 0.018, roll: 0.03, lean: 0.15, headStab: 0.92, headBob: 0.008, legLag: 0.7, spread: 0.03, knee: 1.1, kneeLoad: 0.2, elbow: 0.85, elbowSwing: 0.3, spineRoll: 0.07, spineBob: 0.02, shrug: 0.03 },
  idle: {
    splay: 0.025, stagger: 0.035, lean: 0.0, armOut: 0.045, armFwd: 0.1, breath: 5.2, chest: 0.007, shoulder: 0.005,
    shift: 0.012, shiftRoll: 0.012, shiftEvery: [6, 11], shiftHz: 0.6, glance: 0.16, glanceEvery: [5, 9], glanceHz: 0.9, tilt: 0.13, nod: 0.05,
    sway: 0.012, swayPeriod: 6, fidget: 0.09, stretchAfter: 28,
  },
  combat(l, out) {
    const staff = l.carry === 'staff';
    return setPose(out, {
      // The casting hand is up in front, open; the staff hand holds the staff a little forward and out.
      armLx: 1.5, armLz: -0.32, armRx: staff ? 0.66 : 1.05, armRz: staff ? 0.2 : 0.28,
      legLx: 0.2, legLz: -0.07, legRx: -0.24, legRz: 0.07,
      torsoYaw: -0.22, hipYaw: -0.08, lean: 0.04, headX: -0.02, headZ: 0.02, keep: 1, breath: 4, shift: 0.012, fidget: 0.07, hold: 6,
    });
  },
  transitions: { toWalk: 0.2, toSprint: 0.3, toIdle: 0.28, toCombat: 0.2, fromCombat: 0.34, fromStretch: 0.34 },
  response: { speed: 9, amp: 8 },
  cape: 1.1,
  weapon: 0.9,
  robe: 1,
};

/** Light and alert: the knees soft, a lean into the toes, quick looks, long quiet strides and a bow ready but not drawn. */
const RANGER: Profile = {
  id: 'ranger',
  walk: { stride: 0.62, duty: 0.5, lift: 0.1, plant: 0.48, impact: 0.006, armSwing: 0.5, armLag: 0.35, armPump: 0.05, hipYaw: 0.08, shoulderYaw: 0.15, sway: 0.016, roll: 0.025, lean: 0.08, headStab: 0.95, headBob: 0.003, legLag: 0, spread: 0.04, knee: 0.68, kneeLoad: 0.14, elbow: 0.18, elbowSwing: 0.3, spineRoll: 0.05, spineBob: 0.015, shrug: 0.02 },
  sprint: { stride: 0.98, duty: 0.38, lift: 0.21, plant: 0.32, impact: 0.012, armSwing: 1.02, armLag: 0.3, armPump: 0.3, hipYaw: 0.11, shoulderYaw: 0.32, sway: 0.02, roll: 0.03, lean: 0.28, headStab: 0.96, headBob: 0.008, legLag: 0, spread: 0.06, knee: 1.5, kneeLoad: 0.26, elbow: 1.15, elbowSwing: 0.3, spineRoll: 0.1, spineBob: 0.035, shrug: 0.045 },
  idle: {
    splay: 0.075, stagger: 0.09, lean: 0.07, armOut: 0.06, armFwd: 0.14, breath: 3.4, chest: 0.01, shoulder: 0.007,
    shift: 0.022, shiftRoll: 0.025, shiftEvery: [2.2, 4.5], shiftHz: 1.6, glance: 0.55, glanceEvery: [1.4, 3.2], glanceHz: 2.2, tilt: 0.06, nod: 0.07,
    sway: 0.003, swayPeriod: 4, fidget: 0.045, stretchAfter: 18,
  },
  combat(l, out) {
    const bow = l.bow;
    return setPose(out, {
      // The bow arm is half raised, the string hand is by the chest: ready, not drawn.
      armLx: bow ? 0.82 : 0.9, armLz: bow ? 0.4 : -0.2, armRx: bow ? 1.02 : 0.9, armRz: bow ? 0.06 : 0.22,
      legLx: -0.24, legLz: -0.17, legRx: 0.22, legRz: 0.17,
      torsoYaw: 0.34, hipYaw: 0.14, lean: 0.07, headX: 0.01, headZ: 0, keep: bow ? 0.4 : 0.5, breath: 2.6, shift: 0.026, fidget: 0.02, hold: 5,
    });
  },
  transitions: { toWalk: 0.15, toSprint: 0.22, toIdle: 0.22, toCombat: 0.16, fromCombat: 0.28, fromStretch: 0.28 },
  response: { speed: 12, amp: 10 },
  cape: 0.9,
  weapon: 0.6,
  robe: 0,
};

/** A figure with no class: an even, ordinary walk (what every figure had before the classes had their own). */
const PLAIN: Profile = {
  id: 'plain',
  walk: { stride: 0.8, duty: 0.5, lift: 0.06, plant: 0.35, impact: 0, armSwing: 0.65, armLag: 0.35, armPump: 0, hipYaw: 0.05, shoulderYaw: 0.15, sway: 0.022, roll: 0.025, lean: 0.04, headStab: 0.5, headBob: 0.014, legLag: 0, spread: 0.03, knee: 0.55, kneeLoad: 0.1, elbow: 0.18, elbowSwing: 0.3, spineRoll: 0.045, spineBob: 0.012, shrug: 0.02 },
  sprint: { stride: 1.0, duty: 0.42, lift: 0.12, plant: 0.35, impact: 0, armSwing: 0.85, armLag: 0.35, armPump: 0.2, hipYaw: 0.06, shoulderYaw: 0.24, sway: 0.022, roll: 0.025, lean: 0.14, headStab: 0.5, headBob: 0.014, legLag: 0, spread: 0.06, knee: 1.1, kneeLoad: 0.2, elbow: 0.9, elbowSwing: 0.3, spineRoll: 0.08, spineBob: 0.025, shrug: 0.035 },
  idle: {
    splay: 0.03, stagger: 0, lean: 0, armOut: 0.03, armFwd: 0, breath: 3.3, chest: 0.007, shoulder: 0.004,
    shift: 0.012, shiftRoll: 0.014, shiftEvery: [8, 14], shiftHz: 0.5, glance: 0.1, glanceEvery: [6, 12], glanceHz: 0.8, tilt: 0.03, nod: 0.03,
    sway: 0.004, swayPeriod: 13, fidget: 0.025, stretchAfter: 30,
  },
  combat(l, out) {
    return setPose(out, { armLx: 0.7, armRx: 0.8, legLx: 0.15, legRx: -0.15, torsoYaw: 0, lean: 0.06, hold: 4 });
  },
  transitions: { toWalk: 0.2, toSprint: 0.3, toIdle: 0.3, toCombat: 0.25, fromCombat: 0.35, fromStretch: 0.35 },
  response: { speed: 8, amp: 7 },
  cape: 1,
  weapon: 0.6,
  robe: 0.3,
};

export const PROFILES: Readonly<Record<MotionClass | 'plain', Profile>> = { warrior: WARRIOR, mage: MAGE, ranger: RANGER, plain: PLAIN };
export const profileOf = (cls: MotionClass | null | undefined): Profile => (cls ? PROFILES[cls] : PLAIN);

// ---- the feet -----------------------------------------------------------------------------------------------------------------------------

/** Where a foot is in a cycle: along the line of the walk (1 the furthest ahead, -1 the furthest behind) and how high it is lifted (0..1). */
export interface Foot {
  x: number;
  lift: number;
  /** How far the knee is bent (0..1 of the most the gait asks): the leg in the air folds up and opens again to land, the one on the ground gives as it takes the weight. */
  bend: number;
  load: number;
}

/**
 * The foot at `phase` of its cycle (0..1; 0 is the moment it lands, at its most forward). While it is on the ground (the first `duty` of the cycle)
 * it goes back at one steady pace, which is the pace of the ground going by under the body: so it does not slide. In the air it is brought forward
 * on a curve that leaves and arrives at that same pace, picked up in the middle, so there is no jerk as it takes off or lands.
 */
export function footCycle(phase: number, duty: number, out: Foot): Foot {
  const p = phase - Math.floor(phase);
  if (p < duty) {
    out.x = 1 - (2 * p) / duty;
    out.lift = 0;
    out.bend = 0;
    // The weight comes on: the knee gives a little over the first half of the stance and is straight again as the body passes over it.
    out.load = Math.sin(Math.PI * clamp01(p / (duty * 0.6)));
    return out;
  }
  const u = (p - duty) / (1 - duty);
  // A cubic from -1 to 1 whose slope at either end is the pace of the stance (limited, so a short air time does not swing the foot far past its ends).
  const s = -Math.min(2 * ((1 - duty) / duty), 1.5);
  const u2 = u * u;
  const u3 = u2 * u;
  out.x = -(2 * u3 - 3 * u2 + 1) + s * (u3 - 2 * u2 + u) + (-2 * u3 + 3 * u2) + s * (u3 - u2);
  out.lift = Math.sin(Math.PI * u);
  // The knee folds fast as the foot leaves the ground (the heel comes up behind), is most bent as the leg passes under the body, and opens to reach for the ground.
  out.bend = Math.sin(Math.PI * u ** 0.7);
  out.load = 0;
  return out;
}

/** The angle of a leg whose foot is at `x` along a stride of half-swing `stride`. */
export const legAngle = (x: number, stride: number): number => Math.asin(clamp(Math.sin(stride) * x, -0.97, 0.97));

/** Both legs at a point of the gait. */
export interface Legs {
  /** The angle of each leg (forward positive), how far each foot is lifted (units), and the step (-1..1: positive while the right foot is ahead). */
  r: number;
  l: number;
  liftR: number;
  liftL: number;
  step: number;
  /** How far after a foot has landed (0..1 of a step) and how hard the landing is at this moment (0..1). */
  since: number;
  thud: number;
  /** Where each foot is along the stride (-1..1, see `Foot`). */
  xr: number;
  xl: number;
  /** How far each knee is bent (radians; the shin turns back by this much from the thigh). */
  kneeR: number;
  kneeL: number;
}

const footR: Foot = { x: 0, lift: 0, bend: 0, load: 0 };
const footL: Foot = { x: 0, lift: 0, bend: 0, load: 0 };

/**
 * The legs at `gait` (radians of the cycle, 0 to 2 pi; the right foot lands at pi/2, the left half a cycle later) for a stride `amp` of the full one
 * (0..1) of the gait `g`. `dir` is -1 walking backward.
 */
export function gaitLegs(gait: number, g: Gait, amp: number, dir: number, out: Legs): Legs {
  const cycle = (gait - Math.PI / 2) / TAU;
  footCycle(cycle, g.duty, footR);
  footCycle(cycle + 0.5, g.duty, footL);
  const stride = g.stride * amp;
  out.r = legAngle(footR.x * dir, stride);
  out.l = legAngle(footL.x * dir, stride);
  out.liftR = footR.lift * g.lift * amp;
  out.liftL = footL.lift * g.lift * amp;
  out.xr = footR.x;
  out.xl = footL.x;
  out.kneeR = (g.knee * footR.bend + g.kneeLoad * footR.load) * amp;
  out.kneeL = (g.knee * footL.bend + g.kneeLoad * footL.load) * amp;
  out.step = (footR.x - footL.x) / 2;
  const m = (cycle * 2) % 1;
  out.since = m < 0 ? m + 1 : m;
  // The landing: hardest at once, gone in a fifth of a step.
  out.thud = (1 - clamp01(out.since / 0.2)) ** 2 * amp;
  return out;
}

/**
 * How fast the gait turns (radians a second) so that the foot on the ground goes back at the pace of the ground (`speed`, blocks a second): the
 * stride is `chord` long over the ground while the foot is down, which is the `duty` of a cycle. `unit` is how many blocks a unit of the figure is.
 */
export function gaitRate(speed: number, g: Gait, amp: number, leg: number, unit: number): number {
  const chord = 2 * unit * leg * Math.sin(g.stride * Math.max(amp, 0.35));
  return clamp((TAU * g.duty * speed) / chord, 3, 30);
}

// ---- stretching ---------------------------------------------------------------------------------------------------------------------------

/** One moment of a stretch: the arms are the angles themselves (x forward, z out, y turned), the rest are added to the standing body. */
export interface StretchKey {
  t: number;
  armLx: number;
  armLz: number;
  armRx: number;
  armRz: number;
  armLy: number;
  armRy: number;
  torsoYaw: number;
  lean: number;
  headX: number;
  headY: number;
  headZ: number;
  /** Both legs bent (turned forward and out a little) and the heels raised (the whole body up). */
  bend: number;
  rise: number;
}

const K = (t: number, k: Partial<StretchKey>): StretchKey => ({ t, armLx: 0.05, armLz: -0.05, armRx: 0.05, armRz: 0.05, armLy: 0, armRy: 0, torsoYaw: 0, lean: 0, headX: 0, headY: 0, headZ: 0, bend: 0, rise: 0, ...k });

/** The stretches, each from standing back to standing: a Warrior rolls his shoulders, pulls an arm across his chest, works his neck and sets his gauntlets. */
export const STRETCHES: Readonly<Record<MotionClass | 'plain', readonly StretchKey[]>> = {
  warrior: [
    K(0, {}),
    K(0.55, { armLx: -0.35, armLz: -0.3, armRx: -0.35, armRz: 0.3, lean: -0.1, headX: -0.06 }),
    K(1.05, { armLx: 0.45, armLz: -0.14, armRx: 0.45, armRz: 0.14, lean: 0.07, headX: 0.05, rise: 0.01 }),
    K(1.55, { armLx: -0.38, armLz: -0.32, armRx: -0.38, armRz: 0.32, lean: -0.1, headX: -0.06 }),
    K(2.05, { armLx: 0.45, armLz: -0.14, armRx: 0.45, armRz: 0.14, lean: 0.07, headX: 0.05, rise: 0.01 }),
    K(2.6, { armLx: 0.78, armLz: -0.12, armRx: 1.38, armRz: -0.82, torsoYaw: -0.18, headY: 0.55 }),
    K(3.5, { armLx: 0.86, armLz: -0.1, armRx: 1.4, armRz: -0.9, torsoYaw: -0.2, headY: 0.58 }),
    K(4.0, { headZ: 0.3, headY: -0.12, headX: 0.04 }),
    K(4.55, { headZ: -0.3, headY: 0.1, headX: 0.04 }),
    K(5.05, { armLx: 1.12, armLz: -0.2, armRx: 1.0, armRz: -0.2, armLy: 0.2, armRy: -0.2, lean: 0.06, headX: 0.22 }),
    K(5.55, { armLx: 1.12, armLz: -0.2, armRx: 1.0, armRz: -0.2, armLy: 0.2, armRy: -0.2, lean: 0.06, headX: 0.22 }),
    K(6.1, {}),
  ],
  mage: [
    K(0, {}),
    K(0.75, { armLx: 2.9, armLz: -0.36, armRx: 2.9, armRz: 0.36, lean: -0.2, headX: -0.4, rise: 0.035 }),
    K(2.2, { armLx: 3.0, armLz: -0.3, armRx: 3.0, armRz: 0.3, lean: -0.24, headX: -0.44, rise: 0.04 }),
    K(2.9, { armLx: 1.25, armLz: -0.3, armRx: 1.25, armRz: 0.3, lean: 0.02, headX: 0.04, rise: 0.0 }),
    K(3.9, { armLx: 1.25, armLz: -0.3, armRx: 1.25, armRz: 0.3, lean: 0.02, headX: 0.06 }),
    K(4.45, { armLx: 0.35, armLz: -0.2, armRx: 1.55, armRz: 0.12, armRy: -0.5, lean: 0.04, headX: 0.3, headY: -0.32, headZ: 0.1 }),
    K(5.55, { armLx: 0.35, armLz: -0.2, armRx: 1.55, armRz: 0.12, armRy: -0.5, lean: 0.04, headX: 0.32, headY: -0.34, headZ: 0.1 }),
    K(6.2, {}),
  ],
  ranger: [
    K(0, {}),
    K(0.5, { armLx: 1.32, armLz: 0.82, armRx: 1.12, armRz: -0.5, torsoYaw: 0.2, headY: -0.3 }),
    K(1.55, { armLx: 1.35, armLz: 0.86, armRx: 1.14, armRz: -0.55, torsoYaw: 0.22, headY: -0.32 }),
    K(1.95, { armLx: 1.12, armLz: 0.5, armRx: 1.32, armRz: -0.82, torsoYaw: -0.2, headY: 0.3 }),
    K(2.95, { armLx: 1.14, armLz: 0.55, armRx: 1.35, armRz: -0.86, torsoYaw: -0.22, headY: 0.32 }),
    K(3.4, { bend: 1, lean: 0.12, armLx: 0.35, armRx: 0.35 }),
    K(3.85, { bend: 0, lean: 0.02 }),
    K(4.3, { bend: 1, lean: 0.12, armLx: 0.35, armRx: 0.35 }),
    K(4.95, { armRx: 2.5, armRz: 0.55, armRy: 0.3, headY: 0.3, torsoYaw: 0.1 }),
    K(5.85, { armRx: 2.55, armRz: 0.55, armRy: 0.3, headY: 0.34, torsoYaw: 0.1 }),
    K(6.5, {}),
  ],
  plain: [],
};

/** How long a stretch of a class lasts (seconds); 0: it has none of its own. */
export const stretchLength = (cls: MotionClass | null | undefined): number => {
  const keys = STRETCHES[cls ?? 'plain'];
  return keys.length ? keys[keys.length - 1].t : 0;
};

const KEY_FIELDS: readonly (keyof StretchKey)[] = ['armLx', 'armLz', 'armRx', 'armRz', 'armLy', 'armRy', 'torsoYaw', 'lean', 'headX', 'headY', 'headZ', 'bend', 'rise'];

/** The stretch of a class `t` seconds in, eased between its keys, into `out`. */
export function stretchAt(cls: MotionClass | null | undefined, t: number, out: StretchKey): StretchKey {
  const keys = STRETCHES[cls ?? 'plain'];
  if (keys.length === 0) return out;
  let i = 1;
  while (i < keys.length - 1 && t > keys[i].t) i++;
  const a = keys[i - 1];
  const b = keys[i];
  const k = smooth((t - a.t) / (b.t - a.t));
  for (const f of KEY_FIELDS) out[f] = lerp(a[f], b[f], k);
  out.t = t;
  return out;
}

// ---- the state machine --------------------------------------------------------------------------------------------------------------------

/** What the body is doing, in the main (the weights say how far into it it is, and the others may still be fading). */
export type MotionState = 'idle' | 'combat' | 'walk' | 'sprint' | 'stretch';

/** What `ClassMotion.update` is told each frame. */
export interface MotionInput {
  /** The speed (blocks a second, as the figure eases it), how much of a walk and of a run it makes (0..1), how much of a stride the body is making (0..1). */
  speed: number;
  walk: number;
  run: number;
  amp: number;
  /** 0..1: how far off the ground it is, how much it is standing about (not moving, not in the air). */
  air: number;
  still: number;
  /** Something is going on that is a fight: an enemy near (the caller says), or one of the figure's own blows, blocks, shots or spells. */
  engaged: boolean;
  fighting: boolean;
  /** The figure is making a blow (a swing of the arm: it breaks a block as well as it strikes, so by itself it is not a fight, but it keeps one going). */
  swinging: boolean;
  /** How far into a stretch the figure is (its own weight, 0..1), and whether the hands are taken by something else (a swing, a bow drawn, a bite). */
  stretching: number;
  busy: boolean;
  /** How fast the speed is changing (blocks a second per second), how fast the body is turning (radians a second, positive to the left). */
  accel: number;
  turn: number;
  load: Loadout;
}

/** The idle body, as offsets to add (all already weighed by how still the body is and how far it is from fighting). */
export interface IdleOut {
  rootX: number;
  rootRoll: number;
  /** One foot ahead of the other and both turned out. */
  legLx: number;
  legRx: number;
  legLz: number;
  legRz: number;
  lean: number;
  torsoYaw: number;
  headX: number;
  headY: number;
  headZ: number;
  armLx: number;
  armRx: number;
  armLz: number;
  armRz: number;
  /** The chest (a fraction) and the shoulders (units) with the breath: -1..1 is in the scalar, these are its sizes. */
  breath: number;
  chest: number;
  shoulder: number;
}

/** What trails behind the body: the cape and the weapon (radians), as springs on how the speed changes and how the body turns. */
export interface Secondary {
  capeX: number;
  capeZ: number;
  weaponX: number;
  weaponZ: number;
  /** The shoulders lag a little behind the chest in a start and a stop (units). */
  shoulder: number;
}

interface Drift {
  x: number;
  v: number;
  target: number;
  wait: number;
}

const newDrift = (rnd: () => number, first: number): Drift => ({ x: 0, v: 0, target: 0, wait: first * (0.3 + rnd()) });

/**
 * One figure's motion: it holds the state of the personality (the weights of fighting and stretching, what the body is drifting to, the springs
 * behind it) and each frame turns what the figure is doing into what its class does with it. It never touches a bone; see `Character`.
 */
export class ClassMotion {
  private profile: Profile = PLAIN;
  private cls: MotionClass | null = null;
  /** The gait of the moment, blended from the walk and the run by how fast the figure goes. */
  readonly gait: Gait = { ...PLAIN.walk };
  /** How far the figure is in the pose of a fight (0..1), in its arms and in its legs (the legs keep the stride they are making). */
  combat = 0;
  combatArms = 0;
  combatLegs = 0;
  /** Seconds the fight has left before the body gives it up. */
  private hold = 0;
  readonly pose: CombatPose = baseCombat();
  readonly idle: IdleOut = { rootX: 0, rootRoll: 0, legLx: 0, legRx: 0, legLz: 0, legRz: 0, lean: 0, torsoYaw: 0, headX: 0, headY: 0, headZ: 0, armLx: 0, armRx: 0, armLz: 0, armRz: 0, breath: 0, chest: 0, shoulder: 0 };
  readonly second: Secondary = { capeX: 0, capeZ: 0, weaponX: 0, weaponZ: 0, shoulder: 0 };
  /** The weights of walking and of sprinting, as eased here (how far into each), and the one the body is in. */
  moving = 0;
  sprinting = 0;
  state: MotionState = 'idle';
  private clock = 0;
  private breathPhase = 0;
  private readonly shiftD: Drift;
  private readonly glanceY: Drift;
  private readonly glanceX: Drift;
  private readonly tiltD: Drift;
  private readonly handD: Drift;
  private readonly cape = { x: 0, v: 0 };
  private readonly capeSide = { x: 0, v: 0 };
  private readonly weaponA = { x: 0, v: 0 };
  private readonly weaponB = { x: 0, v: 0 };
  private readonly shoulderS = { x: 0, v: 0 };
  private readonly rnd: () => number;

  /** `seed` makes each figure's fidgets its own, so a crowd does not breathe and look about in step. */
  constructor(seed = Math.floor(Math.random() * 1e9)) {
    let s = seed >>> 0 || 1;
    this.rnd = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    this.shiftD = newDrift(this.rnd, 3);
    this.glanceY = newDrift(this.rnd, 3);
    this.glanceX = newDrift(this.rnd, 4);
    this.tiltD = newDrift(this.rnd, 5);
    this.handD = newDrift(this.rnd, 2);
    this.breathPhase = this.rnd() * TAU;
  }

  /** Become this class (null: none). */
  setClass(cls: MotionClass | null): void {
    this.cls = cls;
    this.profile = profileOf(cls);
  }

  get profileNow(): Profile {
    return this.profile;
  }

  get classId(): MotionClass | null {
    return this.cls;
  }

  /** How long this figure's stretch lasts, and how long it stands before it stretches. */
  get stretchSeconds(): number {
    return stretchLength(this.cls);
  }

  get stretchAfter(): number {
    return this.profile.idle.stretchAfter;
  }

  /** Whether the figure is in the pose of a fight. */
  get fighting(): boolean {
    return this.combat > 0.02;
  }

  /** The wait before a figure that is let go of comes back to standing (the weights are all at their rest). */
  reset(): void {
    this.combat = this.combatArms = this.combatLegs = this.hold = 0;
    this.moving = this.sprinting = 0;
    this.state = 'idle';
    for (const k of Object.keys(this.second) as (keyof Secondary)[]) this.second[k] = 0;
    for (const sp of [this.cape, this.capeSide, this.weaponA, this.weaponB, this.shoulderS]) sp.x = sp.v = 0;
  }

  private drift(d: Drift, dt: number, amp: number, every: readonly [number, number], hz: number, zero: number): number {
    d.wait -= dt;
    if (d.wait <= 0) {
      d.target = this.rnd() < zero ? 0 : (this.rnd() * 2 - 1) * amp;
      d.wait = every[0] + this.rnd() * (every[1] - every[0]);
    }
    this.spring(d, d.target, dt, hz * TAU, 1);
    return d.x;
  }

  private spring(s: { x: number; v: number }, target: number, dt: number, w: number, z: number): void {
    const n = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      s.v += (w * w * (target - s.x) - 2 * z * w * s.v) * h;
      s.x += s.v * h;
    }
  }

  /** One frame. */
  update(dt: number, m: MotionInput): void {
    const p = this.profile;
    this.clock += dt;
    const t = p.transitions;

    // The gait: from the walk to the run by how fast it goes.
    blendGait(p.walk, p.sprint, m.run, this.gait);

    // The weights of walking and sprinting: each comes in over the time the class takes and goes out over its own.
    this.moving = follow(this.moving, m.walk, dt, (m.walk > this.moving ? t.toWalk : t.toIdle) / 3);
    this.sprinting = follow(this.sprinting, m.run, dt, (m.run > this.sprinting ? t.toSprint : t.toWalk) / 3);
    if (this.moving < 0.002) this.moving = 0;
    if (this.sprinting < 0.002) this.sprinting = 0;

    // The fight: any blow, block or shot, or an enemy near, keeps the body in it for `hold` seconds after the last.
    const l = p.combat(m.load, this.pose);
    if (m.engaged || m.fighting || (m.swinging && this.combat > 0.3)) this.hold = l.hold;
    else this.hold = Math.max(0, this.hold - dt);
    const want = this.hold > 0 ? 1 : 0;
    this.combat = follow(this.combat, want, dt, (want ? t.toCombat : t.fromCombat) / 3);
    if (this.combat < 0.002) this.combat = 0;
    // On the move, the arms keep less of the stance (a run swings them) and the legs none of it (they stride): standing, all of it.
    const stretching = m.stretching;
    this.combatArms = this.combat * (1 - 0.45 * m.walk) * (1 - 0.65 * m.run) * (1 - stretching) * (1 - 0.9 * m.air);
    this.combatLegs = this.combat * (1 - m.walk) * (1 - m.air) * (1 - stretching);

    // The state it is in (the one with the most of the body).
    this.state = stretching > 0.5 ? 'stretch' : m.run > 0.5 ? 'sprint' : m.walk > 0.25 ? 'walk' : this.combat > 0.5 ? 'combat' : 'idle';

    this.idleStep(dt, m);
    this.secondStep(dt, m);
  }

  /** The body standing: breath, weight, looks, the sway of a robe, the hands. */
  private idleStep(dt: number, m: MotionInput): void {
    const p = this.profile;
    const i = p.idle;
    const o = this.idle;
    const c = this.pose;
    // How much of it there is: it is gone as the body moves and goes into a stretch, and is quieter in a fight (which has its own).
    const rest = m.still * (1 - m.stretching);
    const fight = this.combat;
    const calm = rest * (1 - fight);
    const alive = rest;
    // Breathing: a little slower than the clock, quicker in a fight.
    const period = lerp(i.breath, c.breath, fight);
    this.breathPhase += (dt * TAU) / period;
    const b = Math.sin(this.breathPhase);
    // (the breath comes in with an easing at the top, as a lung does)
    o.breath = b * alive;
    o.chest = i.chest * lerp(1, 0.8, fight);
    o.shoulder = i.shoulder * lerp(1, 0.8, fight);
    // The weight: shifts from one foot to the other now and then, quicker and smaller in a fight.
    const shift = this.drift(this.shiftD, dt, 1, [i.shiftEvery[0] * lerp(1, 0.3, fight), i.shiftEvery[1] * lerp(1, 0.3, fight)], i.shiftHz, 0.15);
    const shiftAmp = lerp(i.shift, c.shift, fight);
    o.rootX = shift * shiftAmp * alive + Math.sin((this.clock * TAU) / i.swayPeriod) * i.sway * calm;
    o.rootRoll = -shift * i.shiftRoll * alive + Math.cos((this.clock * TAU) / i.swayPeriod) * i.sway * 0.8 * calm;
    // The loaded leg is straight under the hip, the other eased forward and out a little, its heel up.
    const off = Math.max(0, -shift) * 0.5;
    const offR = Math.max(0, shift) * 0.5;
    o.legLx = (i.stagger * 0.5 + off * 0.1) * calm;
    o.legRx = (-i.stagger * 0.5 + offR * 0.1) * calm;
    o.legLz = -(i.splay + off * 0.04) * calm;
    o.legRz = (i.splay + offR * 0.04) * calm;
    o.lean = i.lean * calm;
    // Looks: the head turns now and then to a side and settles, tilts, nods; the shoulders go with a big one a little.
    const gy = this.drift(this.glanceY, dt, i.glance, i.glanceEvery, i.glanceHz, 0.35) * alive;
    const gx = this.drift(this.glanceX, dt, i.nod, i.glanceEvery, i.glanceHz * 0.8, 0.3) * alive;
    const tz = this.drift(this.tiltD, dt, i.tilt, [i.glanceEvery[0] * 1.2, i.glanceEvery[1] * 1.2], i.glanceHz * 0.7, 0.4) * alive;
    o.headY = gy;
    o.headX = gx;
    o.headZ = tz;
    o.torsoYaw = gy * 0.18;
    // The hands: a small move now and then (a mage's fingers are never quite still), and the arms out and forward by the class's way of standing.
    const hand = this.drift(this.handD, dt, 1, [1.2, 3.2], 2.6, 0.2) * alive;
    const fid = lerp(i.fidget, c.fidget, fight);
    const wob = Math.sin(this.clock * 1.7) * 0.5 + Math.sin(this.clock * 2.9 + 1.3) * 0.5;
    o.armLx = i.armFwd * calm + (hand * 0.8 + wob * 0.3) * fid * alive;
    o.armRx = i.armFwd * calm + (-hand * 0.7 + wob * 0.3) * fid * alive;
    o.armLz = -i.armOut * calm - hand * fid * 0.35 * alive;
    o.armRz = i.armOut * calm + hand * fid * 0.3 * alive;
  }

  /** What trails behind: the cape, the weapon and the shoulders swing on the way the speed changes and the body turns. */
  private secondStep(dt: number, m: MotionInput): void {
    const p = this.profile;
    const sec = this.second;
    const a = clamp(m.accel, -30, 30);
    const speedK = clamp01(m.speed / 6);
    // Speeding up throws the cape back (more of it away from the back), stopping brings it forward; a turn swings it to the side.
    this.spring(this.cape, -clamp(a * 0.014, -0.3, 0.5) * p.cape, dt, 12, 0.5);
    this.spring(this.capeSide, clamp(m.turn * 0.05, -0.4, 0.4) * p.cape * speedK, dt, 10, 0.55);
    // The weapon in the hand lags the arm: it tips back as the body goes forward, rolls with the turn and with each step.
    this.spring(this.weaponA, -clamp(a * 0.012, -0.25, 0.25) * p.weapon, dt, 16, 0.5);
    this.spring(this.weaponB, clamp(m.turn * 0.03, -0.25, 0.25) * p.weapon, dt, 14, 0.55);
    // The shoulders lag the chest in a start and in a stop.
    this.spring(this.shoulderS, -clamp(a * 0.0009, -0.02, 0.02), dt, 14, 0.5);
    sec.capeX = this.cape.x;
    sec.capeZ = this.capeSide.x;
    sec.weaponX = this.weaponA.x;
    sec.weaponZ = this.weaponB.x;
    sec.shoulder = this.shoulderS.x;
  }
}
