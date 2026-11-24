import { ATTACK_ANIM, BOSS_ANIM, BOSS_WINDUP, MOBS, type MobKind } from '@solrift/shared';

/**
 * How a creature that is not a player moves: a villager, a pig, a zombie, a bat, a fish, the Hollow King, King Aurelion, and whatever is added
 * after them. Pure numbers and small functions with no three.js in them, so that every part can be tested alone (see `creatureMotion.test.ts`).
 *
 * The server (or the local game) decides where a creature is and which way it means to face; nothing here changes that. This module is
 * what the picture does with it, and it is driven by what is on the screen, not by what the server counted:
 *
 *  - The walk cycle advances by the DISTANCE the body has moved on screen, divided by a stride that suits the leg (`CreatureMotion.update`).
 *    A foot on the ground therefore stays on the ground (`legPose` keeps it there), however the position arrived (every frame in a local
 *    game, a smoothed snapshot twenty times a second online) and at whatever speed the creature happens to be going.
 *  - The body has weight: it turns at a rate that depends on its mass, leans into turns and into acceleration, drops when it puts a foot down,
 *    rides over a step instead of snapping up it, and pitches with a slope or a hop.
 *  - It has attention: the head leads the body into a turn, looks at the player who comes near (as far as its temper says: a villager greets, a
 *    rabbit freezes, a zombie fixes its eyes), and in between it does what its kind does when it stands (grazes, pecks, sniffs, shifts its weight,
 *    glances about).
 *  - It fights, is hurt and dies with a shape in time (a coil, a snap, a recovery; a flinch; a fall that has weight and settles).
 *
 * The part of the figure that writes to the meshes is `creatureRig.ts`. Angles are the model's own: the creature faces -z, so a positive turn about x
 * tips the nose UP (and a leg's foot forward); a positive turn about z leans the body to its left; a positive turn about y turns it left.
 */

export type Archetype =
  /** Walks upright on two legs, arms free: villagers, the undead, the enderman, the Gilded Tide's imps and colossi, the bosses. */
  | 'biped'
  /** Four legs: farm animals, hounds, horses, bears, the creeper. */
  | 'quad'
  /** A walking bird, head thrusting as it goes: chickens and parrots. */
  | 'bird'
  /** Stands, then hops: rabbits, frogs, slimes. */
  | 'hopper'
  /** Eight legs: spiders. */
  | 'arachnid'
  /** A low shell on four flippers: the turtle. */
  | 'crawler'
  /** Beats its wings and flies: the bat. */
  | 'flyer'
  /** Hangs in the air on little wings or on nothing: the bee, the allay, the spore puff, the ember wraith. */
  | 'hover'
  /** A fish, a dolphin, an axolotl: it swims by bending. */
  | 'swimmer'
  /** A squid: it jets and its arms trail. */
  | 'cephalopod'
  /** Does not move on its own: the training dummy, the armor stand. */
  | 'static';

/** How a creature feels about the player: what it does with its head and body when one comes near. */
export type Temper =
  /** Pays no mind. */
  | 'inert'
  /** Looks up and then goes back to what it was doing. */
  | 'calm'
  /** Freezes with its head up and watches. */
  | 'skittish'
  /** Comes round to look, and stares a while. */
  | 'curious'
  /** A person: turns to face you, and keeps turning to you while you are close. */
  | 'friendly'
  /** A quest giver: it has been waiting for you. */
  | 'attentive'
  /** Fixes its eyes on the player it can see and crouches to the fight. */
  | 'hostile';

export type IdleKind = 'none' | 'look' | 'graze' | 'sniff' | 'peck' | 'shift' | 'scan' | 'fidget';

export interface Profile {
  archetype: Archetype;
  temper: Temper;
  /** 0 (a feather) to 1 (a colossus): from the size of the body. */
  weight: number;
  /** Its walk and its run (blocks per second). */
  walk: number;
  run: number;
  /** Blocks per cycle (a cycle is two steps) as a number of leg lengths, at a walk and at a run. */
  stride: [number, number];
  /** The share of a cycle a foot is on the ground, at a walk and at a run. */
  duty: [number, number];
  /** The slowest and the quickest the legs go (cycles per second): the stride stretches or shrinks to keep to them. */
  cadence: [number, number];
  /** The most a leg swings (radians). */
  theta: number;
  /** How much of the drop that straight legs need to keep a foot on the ground is taken (0 the feet float, 1 the body sinks and the legs shrink). */
  plant: number;
  /** How far the body rises and dips with the steps (leg lengths), at a walk and at a run (for a thing that hovers: how far it bobs, in blocks). */
  bob: [number, number];
  /** Roll over the planted foot, and the wag of the spine, in radians. */
  sway: number;
  yawSway: number;
  /** The forward lean at a full run, and how much the body tips with acceleration (radians per block/s²; the sign says which way). */
  lean: number;
  accLean: number;
  /** How much of a slope (the angle the body climbs at) it tips with. Negative leans into the hill. */
  slope: number;
  /** How much it banks (rolls) into a turn, and into a sideways drift. */
  bank: number;
  drift: number;
  /** The quickest it turns (radians per second) and how briskly it follows the heading it was given. */
  turn: number;
  /** How far away it takes notice of the player (blocks). */
  gaze: number;
  /** The most its head turns from the body, and the most it nods. */
  headYaw: number;
  headPitch: number;
  /** Which things it does when it stands about and how likely each is (a weight each), and how long between them (seconds). */
  idle: Partial<Record<IdleKind, number>>;
  idleGap: [number, number];
  /** An archer does not step into its shot. */
  noLunge?: boolean;
  /** Strikes with its front paws (how high they come up), and with a thrust of the head (blocks). */
  paw?: number;
  bite?: number;
  /** Jelly: it wobbles as it sits and is flattened when it dies. */
  jelly?: boolean;
  /** Wing beats per second, and how far a bird or a bee flaps while it walks. */
  flapHz?: number;
  /** The way it falls when it dies. */
  fall: 'side' | 'back' | 'forward' | 'mixed' | 'tumble' | 'belly' | 'splat' | 'sink' | 'kneel';
  /** The tick of an enderman, a skeleton: the head snaps about now and then. */
  twitchy?: boolean;
  /** Turns its body to face a player who stands near (a person). */
  faces?: boolean;
  /** A boss: heavy, slow to turn, and it rears back before a blow. */
  boss?: boolean;
}

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const smooth = (v: number): number => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
/** 0 below `a`, 1 above `b`, smooth between. */
const between = (a: number, b: number, v: number): number => smooth((v - a) / (b - a));
/** `v` towards `target` at `rate` per second: the same at any frame rate. */
const follow = (v: number, target: number, dt: number, rate: number): number => v + (target - v) * (1 - Math.exp(-dt * rate));
/** `a - b` as a turn between -pi and pi. */
export const angleDiff = (a: number, b: number): number => {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return d;
};

/** A small repeatable random stream (so one creature is always the same person, and a test is the same twice). */
function stream(seed: number): () => number {
  let a = (seed | 0) ^ 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- what each kind is --------------------------------------------------------------------------------------------------------------------

/**
 * The kinds whose shape is not told by what the game knows of them. Anything not listed is worked out (a flier flies, a swimmer swims, a hopper hops, a
 * climber is a spider, the rest walk on two legs; a model with four legs is a quadruped, see `guessArchetype` in creatureRig.ts), so a creature added
 * tomorrow moves sensibly before anyone has tuned it.
 */
const ARCHETYPES: Record<string, Archetype> = {
  pig: 'quad', cow: 'quad', sheep: 'quad', wolf: 'quad', fox: 'quad', cat: 'quad', ocelot: 'quad', horse: 'quad', donkey: 'quad', mule: 'quad',
  llama: 'quad', trader_llama: 'quad', camel: 'quad', goat: 'quad', panda: 'quad', polar_bear: 'quad', mooshroom: 'quad', armadillo: 'quad',
  sniffer: 'quad', creeper: 'quad', gilt_hound: 'quad',
  npc: 'biped', villager: 'biped',
  chicken: 'bird', parrot: 'bird',
  rabbit: 'hopper', frog: 'hopper', slime: 'hopper',
  spider: 'arachnid', cave_spider: 'arachnid',
  turtle: 'crawler',
  bat: 'flyer',
  bee: 'hover', allay: 'hover', spore_puff: 'hover', ember_wraith: 'hover',
  squid: 'cephalopod', glow_squid: 'cephalopod',
  dummy: 'static', armor_stand: 'static',
};

/** The temper of a kind that is not what its kind of body would say (a villager is a person; a cat is curious; a fox is shy). */
const TEMPERS: Record<string, Temper> = {
  villager: 'friendly', npc: 'attentive', allay: 'curious', parrot: 'curious', cat: 'curious', ocelot: 'skittish', fox: 'skittish', wolf: 'curious', goat: 'curious',
  llama: 'curious', trader_llama: 'curious', donkey: 'curious', mule: 'curious', horse: 'curious', rabbit: 'skittish', chicken: 'skittish', frog: 'skittish',
  armadillo: 'skittish', sheep: 'skittish', pig: 'curious', cow: 'calm', panda: 'curious', polar_bear: 'calm', turtle: 'calm', camel: 'calm', sniffer: 'calm',
  mooshroom: 'calm', bat: 'inert', bee: 'inert', dummy: 'inert', armor_stand: 'inert', spore_puff: 'inert', squid: 'inert', glow_squid: 'inert',
};

/** What each shape of body is like, before the size and the kind are taken into account. */
type Base = Omit<Profile, 'archetype' | 'temper' | 'weight' | 'walk' | 'run' | 'gaze'>;

const BASE: Record<Archetype, Base> = {
  biped: {
    stride: [1.7, 3.0], duty: [0.62, 0.42], cadence: [0.8, 2.6], theta: 0.78, plant: 0.4, bob: [0.03, 0.06], sway: 0.035, yawSway: 0.05, lean: 0.16, accLean: -0.02,
    slope: -0.25, bank: 0.035, drift: 0, turn: 7, headYaw: 1.1, headPitch: 0.5,
    idle: { look: 3, shift: 2.5 }, idleGap: [1.5, 5], fall: 'mixed',
  },
  quad: {
    stride: [1.7, 2.9], duty: [0.62, 0.44], cadence: [0.9, 4], theta: 0.8, plant: 0.7, bob: [0.025, 0.05], sway: 0.03, yawSway: 0.05, lean: 0.03, accLean: 0.012,
    slope: 0.7, bank: 0.03, drift: 0, turn: 8, headYaw: 1.0, headPitch: 0.55,
    idle: { look: 3, graze: 3, shift: 1 }, idleGap: [1.2, 4.5], fall: 'side',
  },
  bird: {
    stride: [2.4, 3.6], duty: [0.6, 0.45], cadence: [1.2, 5], theta: 0.85, plant: 0.6, bob: [0.07, 0.1], sway: 0.12, yawSway: 0.06, lean: 0.12, accLean: -0.01,
    slope: 0.3, bank: 0.04, drift: 0, turn: 13, headYaw: 1.4, headPitch: 0.8,
    idle: { peck: 4, look: 3.5, shift: 0.8 }, idleGap: [0.6, 2.4], fall: 'side', flapHz: 9,
  },
  hopper: {
    stride: [3, 4], duty: [0.5, 0.4], cadence: [0.6, 3], theta: 0.8, plant: 0, bob: [0, 0], sway: 0, yawSway: 0, lean: 0, accLean: 0,
    slope: 0.8, bank: 0.05, drift: 0, turn: 11, headYaw: 0.9, headPitch: 0.5,
    idle: { look: 3, sniff: 2, shift: 1 }, idleGap: [1, 4], fall: 'side',
  },
  arachnid: {
    stride: [2.2, 3.4], duty: [0.55, 0.45], cadence: [1.2, 5.5], theta: 0.62, plant: 0, bob: [0.02, 0.03], sway: 0.025, yawSway: 0.03, lean: 0.02, accLean: 0,
    slope: 0.5, bank: 0.04, drift: 0, turn: 11, headYaw: 0.6, headPitch: 0.3,
    idle: { fidget: 4, look: 1.5 }, idleGap: [0.6, 2.2], fall: 'side', twitchy: true,
  },
  crawler: {
    stride: [1.5, 2.2], duty: [0.65, 0.55], cadence: [0.4, 1.4], theta: 0.5, plant: 0, bob: [0.05, 0.05], sway: 0.07, yawSway: 0.08, lean: 0, accLean: 0,
    slope: 0.4, bank: 0.02, drift: 0, turn: 3.2, headYaw: 0.8, headPitch: 0.35,
    idle: { look: 3, shift: 1 }, idleGap: [2, 6], fall: 'side',
  },
  flyer: {
    stride: [2, 3], duty: [0.5, 0.5], cadence: [1, 3], theta: 0.5, plant: 0, bob: [0, 0], sway: 0.05, yawSway: 0.04, lean: 0.2, accLean: -0.02,
    slope: 0.9, bank: 0.1, drift: 0.04, turn: 9, headYaw: 0.8, headPitch: 0.4,
    idle: { look: 1 }, idleGap: [1, 3], fall: 'tumble', flapHz: 9,
  },
  hover: {
    stride: [2, 3], duty: [0.5, 0.5], cadence: [1, 3], theta: 0.4, plant: 0, bob: [0, 0], sway: 0, yawSway: 0, lean: 0.25, accLean: -0.02,
    slope: 0.6, bank: 0.07, drift: 0.06, turn: 5, headYaw: 0.9, headPitch: 0.4,
    idle: { look: 2 }, idleGap: [1.5, 4], fall: 'sink', flapHz: 8,
  },
  swimmer: {
    stride: [1.5, 2.2], duty: [0.5, 0.5], cadence: [0.8, 3.5], theta: 0.5, plant: 0, bob: [0, 0], sway: 0.04, yawSway: 0.16, lean: 0.05, accLean: -0.01,
    slope: 1, bank: 0.08, drift: 0.05, turn: 5, headYaw: 0.5, headPitch: 0.3,
    idle: {}, idleGap: [2, 6], fall: 'belly',
  },
  cephalopod: {
    stride: [1.5, 2.2], duty: [0.5, 0.5], cadence: [0.5, 1.6], theta: 0.5, plant: 0, bob: [0, 0], sway: 0.02, yawSway: 0.05, lean: 0.05, accLean: 0,
    slope: 0.9, bank: 0.05, drift: 0.03, turn: 3, headYaw: 0, headPitch: 0,
    idle: {}, idleGap: [2, 6], fall: 'belly',
  },
  static: {
    stride: [1, 1], duty: [0.5, 0.5], cadence: [1, 1], theta: 0, plant: 0, bob: [0, 0], sway: 0, yawSway: 0, lean: 0, accLean: 0,
    slope: 0, bank: 0, drift: 0, turn: 0, headYaw: 0, headPitch: 0,
    idle: {}, idleGap: [5, 9], fall: 'side',
  },
};

/** Changes to a kind's `BASE`. */
const PATCH: Record<string, Partial<Profile>> = {
  // The people: upright, easy, they look about and turn to a visitor.
  villager: { faces: true, idle: { look: 3, shift: 3 }, theta: 0.6, sway: 0.025, lean: 0.1, idleGap: [1.5, 4] },
  npc: { faces: true, idle: { look: 2.5, shift: 3 }, theta: 0.6, sway: 0.02, lean: 0.1, idleGap: [2, 5] },
  // The undead shamble: heavy-headed, swaying, never quite upright; the skeletons are brittle and twitchy.
  zombie: { idle: { shift: 3, look: 1.5, fidget: 2 }, sway: 0.05, lean: 0.12, stride: [1.6, 2.6], theta: 0.62, fall: 'mixed' },
  husk: { idle: { shift: 3, look: 1.5, fidget: 2 }, sway: 0.05, lean: 0.12, stride: [1.6, 2.6], theta: 0.62 },
  drowned: { idle: { shift: 3, look: 1.5, fidget: 2 }, sway: 0.06, lean: 0.12, stride: [1.6, 2.6], theta: 0.62 },
  skeleton: { idle: { look: 3, fidget: 3 }, twitchy: true, noLunge: true, sway: 0.02, lean: 0.06, fall: 'forward' },
  stray: { idle: { look: 3, fidget: 3 }, twitchy: true, noLunge: true, sway: 0.02, lean: 0.06, fall: 'forward' },
  enderman: { idle: { look: 2, fidget: 4, scan: 1 }, twitchy: true, stride: [1.5, 2.4], theta: 0.55, sway: 0.02, lean: 0.05, fall: 'back' },
  shade: { idle: { scan: 2, look: 2 }, sway: 0.03, lean: 0.2, fall: 'sink' },
  hollow_priest: { idle: { scan: 2, look: 2 }, sway: 0.015, lean: 0.05, fall: 'kneel' },
  ashen_knight: { idle: { scan: 2, shift: 2 }, sway: 0.03, lean: 0.1, fall: 'kneel' },
  moss_lurker: { idle: { scan: 2, shift: 1 }, sway: 0.04, lean: 0.05, fall: 'kneel' },
  gilt_imp: { idle: { fidget: 3, look: 3 }, twitchy: true, stride: [2.2, 3.4], cadence: [1.2, 3.4], fall: 'back' },
  gilt_drake: { idle: { scan: 2, shift: 2 }, fall: 'kneel' },
  gilt_colossus: { idle: { scan: 2, shift: 1 }, sway: 0.02, lean: 0.04, fall: 'back' },
  creeper: { idle: { look: 3, shift: 1 }, sway: 0.02, stride: [1.6, 2.6], noLunge: true, fall: 'side' },
  // The animals.
  pig: { idle: { graze: 3.5, look: 2, shift: 1 }, bite: 0.1 },
  cow: { idle: { graze: 4, look: 2, shift: 1.5 }, sway: 0.035, bite: 0.15 },
  mooshroom: { idle: { graze: 3, look: 2, shift: 1.5 }, bite: 0.15 },
  sheep: { idle: { graze: 4.5, look: 2, shift: 0.8 }, bite: 0.1 },
  goat: { idle: { graze: 3, look: 3, shift: 1 }, bite: 0.18 },
  horse: { idle: { graze: 3, look: 3, shift: 1.5 }, stride: [1.6, 2.7], bite: 0.2, paw: 0.7 },
  donkey: { idle: { graze: 3, look: 3, shift: 1.5 }, bite: 0.2, paw: 0.5 },
  mule: { idle: { graze: 3, look: 3, shift: 1.5 }, bite: 0.2, paw: 0.5 },
  llama: { idle: { graze: 3, look: 4, shift: 1 }, bite: 0.18 },
  trader_llama: { idle: { graze: 2, look: 4, shift: 1 }, bite: 0.18 },
  camel: { idle: { graze: 2, look: 3, shift: 2 }, sway: 0.045, bite: 0.25 },
  sniffer: { idle: { sniff: 4, graze: 2, look: 1 }, sway: 0.045, bite: 0.2 },
  panda: { idle: { graze: 4, look: 2, shift: 2 }, sway: 0.05, paw: 0.9, bite: 0.15 },
  polar_bear: { idle: { sniff: 3, look: 3, shift: 2 }, sway: 0.05, paw: 1.0, bite: 0.2 },
  wolf: { idle: { sniff: 3, look: 3, shift: 1 }, stride: [1.7, 3.2], lean: 0.08, bite: 0.25, paw: 0.3 },
  gilt_hound: { idle: { sniff: 2, look: 3, scan: 1 }, stride: [1.8, 3.3], lean: 0.1, bite: 0.3, paw: 0.2 },
  fox: { idle: { sniff: 3, look: 3, shift: 1 }, stride: [1.7, 3.2], lean: 0.08, bite: 0.18 },
  cat: { idle: { look: 4, sniff: 2, shift: 1 }, bite: 0.12, paw: 0.8, sway: 0.02 },
  ocelot: { idle: { look: 4, sniff: 2, shift: 1 }, bite: 0.12, paw: 0.8, sway: 0.02 },
  armadillo: { idle: { sniff: 4, look: 2 }, sway: 0.04, bite: 0.08 },
  chicken: { idle: { peck: 5, look: 3.5, shift: 0.6 } },
  parrot: { idle: { look: 4, shift: 2, peck: 1 }, flapHz: 12 },
  rabbit: { idle: { look: 3, sniff: 3, shift: 0.8 }, stride: [3.5, 5] },
  frog: { idle: { look: 3, shift: 2 } },
  slime: { jelly: true, idle: { shift: 1 }, fall: 'splat' },
  turtle: { idle: { look: 3, shift: 1 } },
  bat: { flapHz: 10 },
  bee: { flapHz: 26, idle: {}, drift: 0.05, lean: 0.12, bob: [0.03, 0.03] },
  allay: { flapHz: 8, idle: { look: 3, scan: 1 }, drift: 0.07, bob: [0.06, 0.06] },
  spore_puff: { drift: 0.06, lean: 0.12, fall: 'sink' },
  ember_wraith: { drift: 0.07, lean: 0.3, fall: 'sink', idle: { scan: 2 } },
  dolphin: { cadence: [0.6, 2.4], yawSway: 0.12 },
  salmon: { cadence: [1, 4] },
  cod: { cadence: [1, 4] },
  tropical_fish: { cadence: [1, 4] },
  pufferfish: { cadence: [0.5, 2] },
  tadpole: { cadence: [1.5, 5] },
  axolotl: { cadence: [0.6, 2.2], yawSway: 0.2 },
  hollow_king: { boss: true, idle: { scan: 3, shift: 1 }, sway: 0.03, turn: 2.2, fall: 'kneel' },
  aurelion: { boss: true, idle: { scan: 3, shift: 1 }, sway: 0.03, turn: 2.0, fall: 'kneel' },
};

/** The body's weight from its size: a mouse is near 0, a horse about a half, a giant 1. */
export const weightOf = (width: number, height: number): number => clamp(Math.log2(1 + width * width * height) / 4.5, 0, 1);

/**
 * What a kind is like. `arch` is the shape of its body (`archetypeOf`); everything else comes from the kind's definition and from `PATCH`.
 * A kind that nothing here knows is given the base of its shape, sized to its definition: it walks, it turns, it looks at you, it falls.
 */
export function profileFor(kind: string, arch: Archetype): Profile {
  const def = (MOBS as Record<string, (typeof MOBS)[MobKind] | undefined>)[kind];
  const base = BASE[arch];
  const w = def ? weightOf(def.width, def.height) : 0.3;
  const hostile = !!def?.hostile;
  const walk = def && def.speed > 0 ? def.speed : 1.2;
  const run = def && def.runSpeed > walk ? def.runSpeed : walk * 2.2;
  const patch = PATCH[kind];
  const temper: Temper = TEMPERS[kind] ?? (hostile ? 'hostile' : arch === 'biped' ? 'friendly' : 'calm');
  const p: Profile = {
    ...base,
    archetype: arch,
    temper,
    weight: w,
    walk,
    run,
    gaze: temper === 'hostile' ? Math.max(8, def?.detect ?? 16) : temper === 'attentive' ? 7 : temper === 'friendly' ? 8 : temper === 'inert' ? 0 : temper === 'calm' ? 5 : 7,
    ...patch,
  };
  // The heavy turn slowly, and take a longer step less often.
  p.turn *= 1 - 0.6 * w;
  if (def?.boss) p.boss = true;
  if (p.boss) p.turn = Math.min(p.turn, 2.4);
  return p;
}

/** The archetype a kind is known to be, or null when it has to be worked out (from its flags, then from its model). */
export function archetypeOf(kind: string): Archetype | null {
  const known = ARCHETYPES[kind];
  if (known) return known;
  const def = (MOBS as Record<string, (typeof MOBS)[MobKind] | undefined>)[kind];
  if (!def) return null;
  if (def.aquatic) return 'swimmer';
  if (def.flying) return 'flyer';
  if (def.hopper) return 'hopper';
  if (def.climbs) return 'arachnid';
  return null;
}

// ---- the legs ------------------------------------------------------------------------------------------------------------------------------

/**
 * One leg through one cycle. `phase` is 0..1 and 0 is the moment the foot comes down. On the ground (the first `duty` of the cycle) the foot
 * moves back at an even rate (so that, carried by a body at an even speed, it stands still on the ground); in the air it swings forward in a
 * smooth run and is picked up. `a` is -1 (the foot far behind) to +1 (far in front); `lift` is 0 on the ground and peaks at 1 in the middle of
 * the swing; `stance` is how far through the time on the ground it is (0..1), or -1 in the air.
 */
export interface Wave {
  a: number;
  lift: number;
  stance: number;
  /** How far through the swing, 0..1 (0 on the ground). */
  swing: number;
}
export function legWave(phase: number, duty: number, out: Wave = { a: 0, lift: 0, stance: 0, swing: 0 }): Wave {
  const p = phase - Math.floor(phase);
  if (p < duty) {
    const s = p / duty;
    out.a = 1 - 2 * s;
    out.lift = 0;
    out.stance = s;
    out.swing = 0;
  } else {
    const u = (p - duty) / (1 - duty);
    out.a = -1 + 2 * smooth(u);
    out.lift = Math.sin(Math.PI * u);
    out.stance = -1;
    out.swing = u;
  }
  return out;
}

/** What a leg does at a point of its cycle. */
export interface LegOut {
  /** Radians about x: the foot forward is positive. */
  angle: number;
  /** A factor on the length of a leg that has no knee (it is shortened to keep its foot on the ground, and to pick it up). */
  scale: number;
  /** How far a knee bends (0..1: the share of its largest bend). */
  knee: number;
  /** 0 on the ground, up to 1 in the middle of a step. */
  lift: number;
  /** The foot is in the air. */
  air: boolean;
  /** The foot's place in front of the hip as a share of the leg's length (it stays still on the ground, relative to the world). */
  foot: number;
}

/** The gait's numbers that a leg needs, as a frame produces them. */
export interface GaitOut {
  phase: number;
  duty: number;
  /** The sine of the most a leg swings: half the stretch of the ground a foot covers, over the length of the leg. */
  sinTheta: number;
  /** 0..1: how far into a run. */
  run: number;
  /** 0..1: how much it is walking (0 stands). */
  mov: number;
  /** The share of the ground-keeping drop of the body that is taken. */
  plant: number;
  /** The length of a stride (blocks per cycle). */
  stride: number;
}

const legTmp: Wave = { a: 0, lift: 0, stance: 0, swing: 0 };

/**
 * A leg at the phase `phase + offset` of the gait `g` (no allocation: it fills and returns `out`). The hips are held at a height at which a leg that is
 * swung as far as it goes still reaches the ground; in between, the leg is shorter (one that has a knee folds it, one without is made shorter), so that
 * the foot that is on the ground stays on it.
 */
export function legPose(g: GaitOut, offset: number, kneed: boolean, out: LegOut): LegOut {
  const w = legWave(g.phase + offset, g.duty, legTmp);
  const f = w.a * g.sinTheta;
  const theta = Math.asin(clamp(g.sinTheta, 0, 0.999));
  const hip = 1 - g.plant * (1 - Math.cos(theta));
  out.foot = f;
  out.lift = w.lift;
  out.air = w.stance < 0;
  if (kneed) {
    out.angle = Math.asin(clamp(f, -1, 1));
    out.scale = 1;
    // Weight taken on the ground, then the fold of the swing.
    out.knee = w.stance >= 0 ? 0.22 * Math.sin(Math.PI * w.stance) : w.lift ** 0.85;
    out.knee *= 0.35 + 0.65 * g.mov;
  } else {
    out.angle = Math.atan2(f, hip);
    out.scale = Math.min(1, Math.hypot(hip, f)) * (1 - 0.14 * w.lift * (0.5 + 0.5 * g.run) * g.mov);
    out.knee = 0;
  }
  return out;
}

// ---- the creature ---------------------------------------------------------------------------------------------------------------------------

/** What the picture needs to know of a creature this frame. */
export interface MotionInput {
  /** Where its feet are on the screen, as drawn (smoothed, if the game smooths it). */
  x: number;
  y: number;
  z: number;
  /** The heading the game chose for it (radians; it faces -z at 0). */
  yaw: number;
  dt: number;
  /** Seconds, the same for every creature. */
  time: number;
  dead: boolean;
  /** Seconds since it died. */
  deathTime: number;
  /** Seconds since it was last hurt. */
  hurtTime: number;
  /** Seconds since its swing began (more than the length of a swing: it is not swinging). */
  attackTime: number;
  /** A boss gathering a spell. */
  casting: number;
  /** Where the player is (feet), when there is one to notice. */
  focus: { x: number; y: number; z: number } | null;
  /** How tall and wide the body is as drawn (blocks). */
  height: number;
  width: number;
  /** How much the model is scaled up or down as drawn (a slime of a size, a young animal): its legs are that much longer or shorter. */
  scale: number;
}

/** What it looks like this frame: read by `creatureRig.ts`. Reused from frame to frame. */
export interface Pose {
  /** The heading as drawn. */
  yaw: number;
  /** Added to the y of the body (blocks), and along the way it faces (a lunge). */
  lift: number;
  fwd: number;
  /** Tip of the body: + is nose up (radians). Roll: + is leaning to its left. */
  pitch: number;
  roll: number;
  /** Squash and stretch. */
  sx: number;
  sy: number;
  sz: number;
  gait: GaitOut;
  /** The head's turn, nod and tilt (radians), and how far it is lowered and thrust forward, both in head sizes. */
  head: { yaw: number; pitch: number; roll: number; drop: number; thrust: number };
  /** How slack the limbs are (a corpse), 0..1. */
  limp: number;
  /** -1 (falling) to 1 (rising): the vertical speed as a share of a hop. */
  air: number;
  /** Gait blend: 0 a walk, 1 a trot or a run. */
  trot: number;
  /** The wing beat (cycles) and how hard it beats (0..1). */
  wingPhase: number;
  flapAmt: number;
  /** How far (0..1) through a melee swing it is, or -1. */
  strike: number;
  /** How alert it is (0..1). */
  alert: number;
  /** A slow breath, -1..1. */
  breath: number;
  /** A beat that goes on whether it moves or not (the arms of a squid, the fins of a fish), in cycles. */
  pulse: number;
  /** How hard it is swimming or jetting (0..1). */
  effort: number;
  dead: boolean;
  /** How fast it is moving on the screen (blocks per second). */
  speed: number;
}

const newPose = (): Pose => ({
  yaw: 0, lift: 0, fwd: 0, pitch: 0, roll: 0, sx: 1, sy: 1, sz: 1,
  gait: { phase: 0, duty: 0.6, sinTheta: 0, run: 0, mov: 0, plant: 0, stride: 1 },
  head: { yaw: 0, pitch: 0, roll: 0, drop: 0, thrust: 0 },
  limp: 0, air: 0, trot: 0, wingPhase: 0, flapAmt: 0, strike: -1, alert: 0, breath: 0, pulse: 0, effort: 0, dead: false, speed: 0,
});

interface IdleState {
  kind: IdleKind;
  t: number;
  dur: number;
  next: number;
  yaw: number;
  yaw2: number;
  pitch: number;
  beat: number;
  side: number;
}

/** What the model tells the motion of its body. */
export interface BodyInfo {
  /** The length of a leg (blocks), from the model. */
  legLen: number;
  /** The side (+1 / -1) of the leg that touches down at phase 0: the body rolls over it. */
  side0: number;
  /** How high the head is above the feet. */
  headY: number;
}

export class CreatureMotion {
  readonly profile: Profile;
  readonly pose: Pose = newPose();
  private readonly rand: () => number;
  private ready = false;
  private x = 0;
  private y = 0;
  private z = 0;
  private yaw = 0;
  private vx = 0;
  private vy = 0;
  private vz = 0;
  private yawRate = 0;
  private acc = 0;
  private vAlongPrev = 0;
  private mov = 0;
  private run = 0;
  private trot = 0;
  private phase = 0;
  private bank = 0;
  private stepOff = 0;
  private landed = 0;
  private vyPrev = 0;
  private wing = 0;
  private effort = 0;
  private pulse = 0;
  private alert = 0;
  private gazeK = 0;
  private gazeFor = 0;
  private gazeRest = 0;
  private reactIn = -1;
  private gazeYaw = 0;
  private gazePitch = 0;
  private facing = false;
  private castK = 0;
  private twitch = 0;
  private twitchIn = 1;
  private twitchYaw = 0;
  private time = 0;
  private readonly idle: IdleState = { kind: 'none', t: 0, dur: 0, next: 1, yaw: 0, yaw2: 0, pitch: 0, beat: 0, side: 1 };
  /** What the idle is doing to the body this frame, smoothed so that none of it ever pops. */
  private readonly ih = { yaw: 0, pitch: 0, drop: 0, thrust: 0, roll: 0, bodyPitch: 0, bodyRoll: 0, bodyYaw: 0 };
  private readonly d = { lift: 0, pitch: 0, roll: 0 };
  /** How it differs from the others of its kind: a pace, a bearing and a manner. */
  private readonly pace: number;
  private readonly poise: number;
  private readonly deathSide: number;
  private readonly deathMode: Profile['fall'];

  constructor(
    kind: string,
    readonly id: number,
    readonly body: BodyInfo,
    arch: Archetype,
  ) {
    this.profile = profileFor(kind, arch);
    this.rand = stream(id * 7919 + kind.length * 104729);
    this.pace = 0.93 + this.rand() * 0.14;
    this.poise = this.rand();
    this.deathSide = this.rand() < 0.5 ? -1 : 1;
    const r = this.rand();
    const f = this.profile.fall;
    this.deathMode = f === 'mixed' ? (r < 0.4 ? 'back' : r < 0.7 ? 'forward' : 'side') : f;
    this.idle.next = 0.3 + this.rand() * 3;
    this.twitchIn = 1 + this.rand() * 3;
    this.phase = this.rand();
  }

  /** Forget where it was (a creature that was carried off, or is first drawn). */
  reset(i: MotionInput): void {
    this.ready = true;
    this.x = i.x;
    this.y = i.y;
    this.z = i.z;
    this.yaw = i.yaw;
    this.vx = this.vy = this.vz = 0;
    this.stepOff = 0;
    this.yawRate = 0;
    this.acc = 0;
    this.vAlongPrev = 0;
  }

  /** Advance by one frame and return the pose (the same object every time). */
  update(i: MotionInput): Pose {
    const P = this.profile;
    const o = this.pose;
    const dt = clamp(i.dt, 0, 0.1);
    this.time = i.time;
    if (!this.ready) this.reset(i);
    o.sx = o.sy = o.sz = 1;

    // ---- what it did on the screen ------------------------------------------------------------------------------------------------
    let dx = i.x - this.x;
    let dy = i.y - this.y;
    let dz = i.z - this.z;
    if (Math.hypot(dx, dz) > 4 || Math.abs(dy) > 6) {
      // Carried off (a teleport, a view that came back): begin again where it is.
      this.reset(i);
      dx = dy = dz = 0;
    }
    this.x = i.x;
    this.y = i.y;
    this.z = i.z;
    if (dt > 1e-4) {
      let vyRaw = clamp(dy / dt, -30, 30);
      // A step up (a block, a stair) is the game moving the body at once: ride over it instead of snapping.
      const walker = P.archetype === 'biped' || P.archetype === 'quad' || P.archetype === 'bird' || P.archetype === 'arachnid' || P.archetype === 'crawler';
      if (walker && dy > 0.18 && dy < 1.3 && Math.abs(this.vy) < 2.5) {
        this.stepOff -= dy;
        vyRaw = 0;
      }
      const k = 1 - Math.exp(-dt / 0.08);
      this.vx += (dx / dt - this.vx) * k;
      this.vz += (dz / dt - this.vz) * k;
      this.vy += (vyRaw - this.vy) * k;
    }
    this.stepOff *= Math.exp(-dt * 11);
    if (Math.abs(this.stepOff) < 1e-4) this.stepOff = 0;
    const speed = Math.hypot(this.vx, this.vz);
    o.speed = speed;

    // ---- the heading ------------------------------------------------------------------------------------------------------------------
    let want = i.yaw;
    const f = i.focus;
    let fdist = Infinity;
    let faceYawTo = this.yaw;
    if (f) {
      const fdx = f.x - i.x;
      const fdz = f.z - i.z;
      fdist = Math.hypot(fdx, fdz);
      if (fdist > 0.05) faceYawTo = Math.atan2(-fdx, -fdz);
    }
    const standing = speed < 0.25 && !i.dead && i.attackTime > 1;
    // A person who is visited turns to the visitor, and stays turned while the visitor is near.
    this.facing = !!P.faces && standing && fdist < P.gaze * (this.facing ? 0.95 : 0.75);
    if (this.facing) want = faceYawTo;
    const err = angleDiff(want, this.yaw);
    let step = err * (1 - Math.exp(-dt * (12 - 8 * P.weight)));
    step = P.turn > 0 ? clamp(step, -P.turn * dt, P.turn * dt) : 0;
    this.yaw += step;
    if (dt > 1e-4) this.yawRate += (step / dt - this.yawRate) * (1 - Math.exp(-dt * 10));

    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const vAlong = this.vx * fx + this.vz * fz;
    const vSide = this.vx * Math.cos(this.yaw) - this.vz * Math.sin(this.yaw);
    if (dt > 1e-4) this.acc += ((vAlong - this.vAlongPrev) / dt - this.acc) * (1 - Math.exp(-dt / 0.14));
    this.vAlongPrev = vAlong;

    // ---- the walk ---------------------------------------------------------------------------------------------------------------------
    const walkRef = Math.max(0.6, P.walk);
    this.mov = follow(this.mov, between(0.05, 0.05 + walkRef * 0.3, speed), dt, 10);
    this.run = follow(this.run, clamp01((speed - P.walk * 0.9) / Math.max(0.5, P.run - P.walk * 0.9)), dt, 4);
    this.trot = follow(this.trot, between(0.12, 0.55, this.run), dt, 5);
    const L = Math.max(0.08, this.body.legLen * i.scale);
    const duty = lerp(P.duty[0], P.duty[1], this.run);
    // The stride of a leg of this length, held to the pace the legs can keep: a slow creature takes short steps and a quick one long, so that the cycle
    // goes at a rate that looks like walking whatever the speed, and the foot still stands on the ground.
    let D = L * lerp(P.stride[0], P.stride[1], this.run) * this.pace;
    D = Math.max(1e-3, clamp(D, speed / P.cadence[1], speed / P.cadence[0]));
    // Backwards (knocked back, backing away): the legs go the other way.
    const dir = vAlong < -0.3 * speed && speed > 0.2 ? -1 : 1;
    this.phase += (speed * dir * dt) / D;
    this.phase -= Math.floor(this.phase);
    const g = o.gait;
    g.phase = this.phase;
    g.duty = duty;
    g.run = this.run;
    g.mov = this.mov;
    g.plant = P.plant;
    g.stride = D;
    g.sinTheta = clamp((D * duty) / (2 * L), 0, Math.sin(P.theta));
    o.trot = this.trot;
    o.air = clamp(this.vy / 5, -1, 1);

    // Landing after a fall or a hop: the body is pressed down a moment.
    if (this.vyPrev < -2 && this.vy > -0.8) this.landed = clamp(-this.vyPrev / 8, 0.25, 1);
    this.vyPrev = this.vy;
    this.landed *= Math.exp(-dt * 9);

    // ---- the body ---------------------------------------------------------------------------------------------------------------------
    const theta = Math.asin(clamp(g.sinTheta, 0, 0.999));
    let lift = this.stepOff;
    // Keeping the feet on the ground takes a lower body while the legs swing wide.
    lift -= P.plant * L * (1 - Math.cos(theta));
    // The body rises over the foot it stands on and falls into the next step; the heavy come down hard.
    const half = (this.phase * 2) % 1;
    lift += lerp(P.bob[0], P.bob[1], this.run) * L * this.mov * Math.cos(4 * Math.PI * (this.phase - duty * 0.5)) * (1 - P.plant * 0.6) * (P.archetype === 'hover' ? 0 : 1);
    lift -= (0.02 + 0.07 * P.weight) * L * (0.4 + 0.6 * this.run) * this.mov * Math.max(0, 1 - half / 0.22) ** 2 * (P.plant > 0 ? 1 : 0);
    lift -= this.landed * 0.12 * L;
    if (P.archetype === 'hover') lift += P.bob[0] * Math.sin(this.time * 2.1 + this.id * 1.3);

    let pitch = -P.lean * this.run * this.mov + clamp(this.acc * P.accLean, -0.14, 0.14);
    if (P.archetype === 'hopper') pitch = clamp(this.vy * 0.06, -0.45, 0.45) * (speed > 0.2 ? 1 : 0.3);
    else if (P.slope !== 0) {
      // Climbing tips the nose up (or, for something upright, leans it into the hill); a flier or a swimmer pitches with the way it goes.
      const free = P.archetype === 'swimmer' || P.archetype === 'cephalopod' || P.archetype === 'hover' || P.archetype === 'flyer';
      pitch += clamp(Math.atan2(this.vy, Math.max(speed, free ? 1.5 : 1)) * P.slope, -0.45, 0.45);
    }
    // The body rolls over the foot that carries it.
    let roll = -this.body.side0 * P.sway * Math.sin(2 * Math.PI * this.phase) * this.mov * (1 - 0.6 * this.trot);
    // Leaning into a turn and into a drift.
    this.bank = follow(this.bank, clamp(this.yawRate * Math.min(speed, P.run) * P.bank * 0.35, -0.5, 0.5), dt, 7);
    roll += this.bank - clamp(vSide * P.drift, -0.4, 0.4);
    let yawSway = P.yawSway * Math.sin(2 * Math.PI * this.phase + 0.7) * this.mov;

    // ---- wings, tails, jets ---------------------------------------------------------------------------------------------------------
    this.pulse += dt * (P.cadence[0] * 0.8 + 1.8 * this.mov) * 0.9;
    this.pulse -= Math.floor(this.pulse);
    o.pulse = this.pulse;
    if (P.archetype === 'swimmer') {
      // The tail beats at a rate that goes with the speed; a fish that hangs still still works its fins.
      const rate = speed > 0.05 ? clamp(speed / D, P.cadence[0], P.cadence[1]) : P.cadence[0] * 0.5;
      this.effort = follow(this.effort, this.mov, dt, 3);
      this.wing += dt * rate;
      yawSway = P.yawSway * Math.sin(2 * Math.PI * (this.wing - 0.2)) * (0.3 + 0.7 * this.effort);
    } else if (P.archetype === 'cephalopod') {
      // Jets: a pulse squeezes the body, then it drifts.
      this.effort = follow(this.effort, this.mov, dt, 3);
      this.wing += dt * lerp(0.45, 1.5, this.effort);
      const jet = Math.max(0, Math.sin(2 * Math.PI * this.wing)) ** 2;
      const k = 0.4 + 0.6 * this.effort;
      o.sy = 1 + 0.13 * jet * k - 0.05 * (1 - jet);
      o.sx = o.sz = 1 - 0.09 * jet * k + 0.03 * (1 - jet);
      lift += 0.03 * Math.sin(2 * Math.PI * this.wing + 1);
    } else if (P.flapHz) {
      const airborne = P.archetype === 'flyer' || P.archetype === 'hover';
      const falling = this.vy < -1.2;
      this.effort = follow(this.effort, airborne || falling ? 1 : this.run > 0.3 ? 0.35 * this.run : 0, dt, falling ? 14 : 4);
      let hz = P.flapHz * (airborne ? 0.8 + 0.4 * clamp01(this.vy / 3 + 0.5) : 1);
      if (P.archetype === 'flyer') {
        // A bat folds its wings and glides now and then, in a long falling swoop.
        const glide = this.vy < -0.5 && speed > 1.2 ? 0.8 : 0;
        hz *= 1 - glide * 0.85;
        this.effort *= 1 - glide * 0.6;
        lift += Math.sin(2 * Math.PI * this.wing * 0.5) * 0.025;
      }
      this.wing += dt * hz;
    }
    o.wingPhase = this.wing;
    o.flapAmt = this.effort;
    o.effort = this.effort;

    // ---- attention: the head, the eyes, the stance --------------------------------------------------------------------------------
    this.stepIdle(i, dt, speed, standing);
    const h = this.ih;
    let wantGaze = 0;
    let gy = 0;
    let gp = 0;
    if (!i.dead && f && fdist < P.gaze && fdist > 0.2 && P.temper !== 'inert') {
      const rel = angleDiff(faceYawTo, this.yaw);
      const cone = P.temper === 'hostile' ? 1.5 : P.temper === 'friendly' || P.temper === 'attentive' ? 2.2 : 1.9;
      if (Math.abs(rel) < cone) {
        // It takes a moment to notice.
        if (this.reactIn < 0) this.reactIn = 0.15 + this.rand() * 0.45;
        wantGaze = 1;
        gy = rel;
        gp = Math.atan2(f.y + 1.55 - (i.y + this.body.headY), Math.max(0.5, fdist));
      } else this.reactIn = -1;
    } else this.reactIn = -1;
    if (this.reactIn > 0) {
      this.reactIn -= dt;
      wantGaze = 0;
      if (this.reactIn <= 0) this.reactIn = 0;
    }
    // The curious look for a while and lose interest, and look again later; a person and a hunter do not.
    const holds = P.temper === 'hostile' || P.temper === 'attentive' || (P.temper === 'friendly' && fdist < P.gaze * 0.6);
    if (wantGaze > 0 && !holds) {
      this.gazeFor += dt;
      if (this.gazeFor > 3.5 + this.poise * 4) {
        this.gazeRest = 3.5 + this.poise * 3;
        this.gazeFor = 0;
      }
    } else if (wantGaze === 0) this.gazeFor = Math.max(0, this.gazeFor - dt);
    if (this.gazeRest > 0) {
      this.gazeRest -= dt;
      wantGaze = 0;
    }
    this.gazeK = follow(this.gazeK, wantGaze, dt, wantGaze ? 4.5 : 2.5);
    this.gazeYaw = follow(this.gazeYaw, gy, dt, 8);
    this.gazePitch = follow(this.gazePitch, gp, dt, 8);

    // A shy animal that somebody is coming at stops what it is doing, lifts its head and watches.
    const shy = P.temper === 'skittish' || P.temper === 'calm' || P.temper === 'curious';
    const wantAlert = !i.dead && shy && !!f && fdist < (P.temper === 'skittish' ? 7 : 4.5) && this.gazeK > 0.3 ? 1 : 0;
    this.alert = follow(this.alert, wantAlert, dt, wantAlert ? 6 : 1.4);
    o.alert = this.alert;

    let hy = this.gazeYaw * this.gazeK;
    let hp = this.gazePitch * this.gazeK * 0.85;
    let hroll = 0;
    // The head leads the body into a turn.
    hy += clamp(err * 0.55, -0.8, 0.8) * (1 - 0.6 * this.gazeK);
    // Glances, grazing, pecking.
    hy += h.yaw * (1 - this.gazeK * 0.85);
    hp += h.pitch * (1 - this.gazeK * 0.6);
    hroll += h.roll + (this.gazeK > 0.5 && (P.temper === 'curious' || P.temper === 'friendly') ? 0.14 * Math.sin(this.time * 0.9 + this.id) * this.gazeK : 0);
    hp += this.alert * 0.2;
    // The head holds level while the body tips.
    hp -= (pitch + h.bodyPitch) * 0.55;
    hroll -= (roll + h.bodyRoll) * 0.5;
    if (P.twitchy && !i.dead) {
      this.twitchIn -= dt;
      if (this.twitchIn <= 0) {
        this.twitchIn = 0.8 + this.rand() * (this.gazeK > 0.5 ? 1.4 : 4);
        this.twitch = 1;
        this.twitchYaw = (this.rand() - 0.5) * 0.9;
      }
      this.twitch *= Math.exp(-dt * 11);
      hy += this.twitchYaw * this.twitch;
      hroll += this.twitchYaw * 0.25 * this.twitch;
    }

    // ---- the fight ---------------------------------------------------------------------------------------------------------------------
    const bossy = !!P.boss;
    const swingLen = bossy ? BOSS_ANIM : ATTACK_ANIM;
    const k = !i.dead && i.attackTime >= 0 && i.attackTime < swingLen ? i.attackTime / swingLen : -1;
    o.strike = k;
    let fwd = 0;
    let thrust = h.thrust;
    const reach = Math.max(0.3, i.width);
    this.castK = follow(this.castK, i.casting && !i.dead ? 1 : 0, dt, 6);
    if (k >= 0) {
      if (bossy) {
        // Rears back and rises through the wind-up, drives forward and down as the blow lands, and gathers itself.
        const hit = BOSS_WINDUP / BOSS_ANIM;
        const wind = between(0, hit - 0.07, k);
        const slam = between(hit - 0.07, hit + 0.03, k);
        const back = 1 - between(hit + 0.03, 1, k);
        pitch += 0.2 * wind * (1 - slam) - 0.42 * slam * back;
        lift += 0.015 * i.height * wind * (1 - slam) - 0.05 * i.height * slam * back;
        fwd += (0.4 + 0.1 * reach) * slam * back;
        roll += -0.05 * this.deathSide * wind * (1 - slam);
        thrust += 0.12 * slam * back;
        hp += -0.3 * slam * back + 0.15 * wind * (1 - slam);
      } else {
        // The blow lands as the swing begins, so: a snap forward, a hold, a drawing back.
        const out = k < 0.3 ? 1 - (1 - k / 0.3) ** 2 : 1 - between(0.3, 1, k);
        if (P.noLunge) thrust += 0.03 * out;
        else {
          fwd += (0.2 + 0.2 * Math.min(1.2, reach)) * out * (P.jelly ? 1.3 : 1);
          pitch -= (P.archetype === 'biped' ? 0.16 : P.archetype === 'quad' ? 0.1 : 0.05) * out;
          thrust += (P.bite ?? 0.12) * out;
          hp -= 0.35 * out * (P.bite ? 1 : 0.4);
          lift -= 0.02 * L * out;
        }
      }
    } else if (P.temper === 'hostile' && !i.dead && !!f && fdist < i.width + 1.8 && this.gazeK > 0.4 && !P.noLunge && !bossy) {
      // About to strike: gathered, a little lower, leaning in.
      const near = (1 - fdist / (i.width + 1.8)) * this.gazeK;
      pitch -= 0.05 * near;
      lift -= 0.015 * L * near;
    }
    if (bossy && !i.dead) {
      // A spell gathering: the boss draws itself up and back.
      pitch += 0.1 * this.castK;
      lift += 0.02 * i.height * this.castK;
    }
    if (!i.dead && i.hurtTime < 0.5) {
      // A blow lands: the head is thrown back, the body sinks a little and comes back (the heavy hardly move).
      const hurt = (i.hurtTime < 0.05 ? i.hurtTime / 0.05 : 1) * Math.exp(-i.hurtTime * 8);
      const soft = 1 - 0.6 * P.weight;
      pitch += 0.2 * hurt * soft;
      lift -= 0.025 * L * hurt * soft;
      hp += 0.35 * hurt * soft;
      o.sy *= 1 - 0.05 * hurt * soft;
      o.sx *= 1 + 0.03 * hurt * soft;
      o.sz *= 1 + 0.03 * hurt * soft;
    }
    if (P.archetype === 'static') {
      // A dummy takes the blow and rocks on its post.
      const s = i.hurtTime < 2 ? Math.exp(-i.hurtTime * 3.2) : 0;
      roll += Math.sin(i.hurtTime * 21) * 0.17 * s;
      pitch += Math.cos(i.hurtTime * 17) * 0.1 * s;
    }

    // ---- at rest -----------------------------------------------------------------------------------------------------------------------
    const still = 1 - this.mov;
    pitch += h.bodyPitch * still;
    roll += h.bodyRoll * still;
    yawSway += h.bodyYaw * still;
    o.breath = Math.sin(this.time * (1.3 + this.poise * 0.5) + this.id * 1.7);
    // Everything that lives breathes; a boss visibly.
    o.sy *= 1 + (bossy ? 0.012 : 0.004 + 0.004 * (1 - P.weight)) * o.breath * still * (i.dead ? 0 : 1);
    if (P.jelly && !i.dead) {
      // A slime wobbles as it sits, stretches as it rises, is squashed as it comes down, and lands in a squash.
      const wob = Math.sin(this.time * 5 + this.id) * 0.04 * (1 - this.mov * 0.5);
      const e = wob + clamp(this.vy * 0.04, -0.18, 0.24) - this.landed * 0.28;
      o.sy *= 1 + e;
      o.sx *= 1 - e * 0.6;
      o.sz *= 1 - e * 0.6;
    }

    // ---- death -------------------------------------------------------------------------------------------------------------------------
    o.dead = i.dead;
    o.limp = 0;
    let headDrop = h.drop;
    if (i.dead) {
      o.limp = between(0.04, 0.3, i.deathTime);
      const d = this.d;
      d.lift = d.pitch = d.roll = 0;
      this.dying(i, o, L, P);
      lift = d.lift;
      pitch = d.pitch;
      roll = d.roll;
      hy = 0;
      hp = -0.25 * o.limp;
      hroll = 0;
      fwd = 0;
      yawSway = 0;
      thrust = 0;
      headDrop = 0;
    }

    // ---- out ---------------------------------------------------------------------------------------------------------------------------
    o.yaw = this.yaw + yawSway;
    o.lift = lift;
    o.fwd = fwd;
    o.pitch = pitch;
    o.roll = roll;
    o.head.yaw = clamp(hy, -P.headYaw, P.headYaw);
    o.head.pitch = clamp(hp, -(P.headPitch * 1.8 + 0.2), P.headPitch);
    o.head.roll = clamp(hroll, -0.5, 0.5);
    o.head.drop = headDrop;
    o.head.thrust = thrust + (P.archetype === 'bird' && !i.dead ? this.birdThrust() : 0);
    return o;
  }

  /** A walking bird's head goes forward fast and stays put while the body catches up with it (in head sizes, see `Pose.head`). */
  private birdThrust(): number {
    const s = (this.phase * 2) % 1;
    const off = s < 0.3 ? -1 + 2 * smooth(s / 0.3) : 1 - (2 * (s - 0.3)) / 0.7;
    return off * 0.12 * this.mov;
  }

  /** The things a creature does while it stands about: pick one now and then, play it out, rest. */
  private stepIdle(i: MotionInput, dt: number, speed: number, standing: boolean): void {
    const P = this.profile;
    const s = this.idle;
    const h = this.ih;
    const can = standing && this.alert < 0.5 && speed < 0.2 && i.hurtTime > 0.8;
    if (!can) {
      if (s.kind !== 'none') {
        s.kind = 'none';
        s.next = 0.5 + this.rand() * 1.5;
      }
    } else if (s.kind !== 'none') {
      s.t += dt;
      s.beat += dt;
      if (s.t >= s.dur) {
        s.kind = 'none';
        s.next = P.idleGap[0] + this.rand() * (P.idleGap[1] - P.idleGap[0]);
      }
    } else {
      s.next -= dt;
      if (s.next <= 0) this.startIdle();
    }
    // Where each channel is headed.
    let ty = 0;
    let tp = 0;
    let td = 0;
    let tt = 0;
    let tr = 0;
    let tbp = 0;
    let tbr = 0;
    let tby = 0;
    let rate = 5;
    const p = s.t / Math.max(0.01, s.dur);
    switch (s.kind) {
      case 'look':
        // Two glances: one way, then (often) the other.
        ty = p < 0.55 ? s.yaw : s.yaw2;
        tp = s.pitch;
        rate = 6;
        break;
      case 'graze': {
        // Head down to the ground, chewing; now and then it comes up and looks about.
        const cyc = (s.t / (1.8 + this.poise * 1.5)) % 1;
        const up = between(0.8, 0.88, cyc) * (1 - between(0.94, 1, cyc));
        tp = lerp(-0.95, 0.1, up) + Math.sin(s.beat * 2 * Math.PI * 2.4) * 0.07 * (1 - up);
        td = lerp(0.62, 0, up);
        tt = lerp(0.08, 0, up);
        ty = up * s.yaw * 0.7 + Math.sin(s.t * 0.9 + this.id) * 0.05;
        tbp = -0.03 * (1 - up);
        rate = 4;
        break;
      }
      case 'sniff':
        tp = -0.5 + Math.sin(s.beat * 2 * Math.PI * 2.1) * 0.05;
        td = 0.3;
        tt = 0.06;
        ty = Math.sin(s.beat * 2.7 + s.side) * 0.38;
        tbp = -0.04;
        rate = 6;
        break;
      case 'peck': {
        const dip = Math.max(0, Math.sin(s.beat * 2 * Math.PI * 2.1)) ** 3;
        tp = -1.0 * dip;
        td = 0.1 * dip;
        tt = 0.12 * dip;
        ty = s.yaw * 0.3;
        tbp = -0.2 * dip;
        rate = 16;
        break;
      }
      case 'shift': {
        // Moves its weight from one foot to the other and settles.
        const sw = Math.sin(Math.PI * clamp01(p));
        tbr = s.side * 0.03 * sw * (1 + P.weight);
        tbp = 0.01 * sw;
        tby = s.side * 0.07 * sw;
        ty = -s.side * 0.12 * sw;
        tr = s.side * 0.07 * sw;
        rate = 2.2;
        break;
      }
      case 'scan':
        // A slow sweep of the whole field: the watchman's turn of the head.
        ty = Math.sin(s.t * 0.7 + s.side) * 0.65;
        tp = Math.sin(s.t * 0.37) * 0.06;
        rate = 2.4;
        break;
      case 'fidget':
        // A twitching and a sway: the lurch of the undead, a spider's nervous legs.
        tbr = Math.sin(s.t * 1.7 + this.id) * 0.04;
        tp = -0.18 * Math.sin(Math.PI * clamp01(p));
        ty = Math.sin(s.t * 2.3 + this.id) * 0.3 * (1 - p);
        tr = Math.sin(s.t * 3.1) * 0.12;
        rate = 5;
        break;
      default:
        break;
    }
    h.yaw = follow(h.yaw, ty, dt, rate);
    h.pitch = follow(h.pitch, tp, dt, rate);
    h.drop = follow(h.drop, td, dt, rate);
    h.thrust = follow(h.thrust, tt, dt, rate);
    h.roll = follow(h.roll, tr, dt, rate);
    h.bodyPitch = follow(h.bodyPitch, tbp, dt, rate);
    h.bodyRoll = follow(h.bodyRoll, tbr, dt, rate);
    h.bodyYaw = follow(h.bodyYaw, tby, dt, rate);
  }

  private startIdle(): void {
    const P = this.profile;
    const s = this.idle;
    const entries = Object.entries(P.idle) as [IdleKind, number][];
    let total = 0;
    for (const [, w] of entries) total += w;
    if (total <= 0) {
      s.next = 3 + this.rand() * 4;
      return;
    }
    let r = this.rand() * total;
    let kind: IdleKind = entries[0]![0];
    for (const [k, w] of entries) {
      r -= w;
      if (r <= 0) {
        kind = k;
        break;
      }
    }
    s.kind = kind;
    s.t = 0;
    s.beat = this.rand();
    s.side = this.rand() < 0.5 ? -1 : 1;
    s.yaw = (this.rand() * 0.7 + 0.3) * s.side * P.headYaw * 0.75;
    s.yaw2 = this.rand() < 0.6 ? -s.yaw * (0.4 + this.rand() * 0.6) : s.yaw * 0.3;
    s.pitch = (this.rand() - 0.4) * 0.3;
    s.dur =
      kind === 'look' ? 1.6 + this.rand() * 1.8
      : kind === 'graze' ? 3 + this.rand() * 5
      : kind === 'sniff' ? 1.6 + this.rand() * 2.4
      : kind === 'peck' ? 1 + this.rand() * 2.4
      : kind === 'shift' ? 2.2 + this.rand() * 2
      : kind === 'scan' ? 4 + this.rand() * 4
      : 1.2 + this.rand() * 1.6;
  }

  /** The shape of a death: a stagger, a fall that gathers speed, a landing that settles. Writes into `this.d` (and the squash into `o`). */
  private dying(i: MotionInput, o: Pose, L: number, P: Profile): void {
    const d = this.d;
    const t = i.deathTime;
    const slow = 1 + P.weight * 0.6;
    const stagger = between(0, 0.14 * slow, t);
    const fall = clamp01((t - 0.1 * slow) / (0.42 * slow)) ** 2;
    const tb = Math.max(0, t - 0.52 * slow);
    const bounce = tb > 0 ? 0.07 * Math.exp(-tb * 12) * Math.abs(Math.sin(tb * 20)) : 0;
    const angle = (Math.PI / 2) * fall - (fall >= 1 ? bounce : 0);
    const half = Math.max(0.2, i.width) * 0.5;
    switch (this.deathMode) {
      case 'side':
        d.roll = this.deathSide * angle;
        d.pitch = 0.12 * stagger * (1 - fall);
        d.lift = half * Math.sin(Math.abs(angle)) * 0.9;
        break;
      case 'back':
        d.pitch = 0.2 * stagger * (1 - fall) + angle;
        d.lift = half * Math.sin(angle) * 0.9;
        break;
      case 'forward':
        d.pitch = 0.15 * stagger * (1 - fall) - angle;
        d.lift = half * Math.sin(angle) * 0.9;
        break;
      case 'kneel': {
        // The legs give: the body sinks, then it topples forward, slowly.
        const sink = between(0, 0.3 * slow, t);
        d.lift = -0.2 * i.height * sink * (1 - fall * 0.6) + half * Math.sin(Math.min(1.2, 0.9 * fall)) * 0.9;
        d.pitch = -0.9 * fall - 0.15 * sink * (1 - fall);
        d.roll = this.deathSide * 0.12 * fall;
        break;
      }
      case 'tumble':
        // A bat falls out of the air, turning.
        d.pitch = -1.4 * fall;
        d.roll = this.deathSide * 2.2 * fall;
        break;
      case 'belly':
        // Turns belly up and goes still.
        d.roll = this.deathSide * Math.PI * between(0, 0.5, t);
        d.lift = 0.02 * between(0, 1, t);
        break;
      case 'splat': {
        const k = between(0, 0.22, t);
        o.sy *= 1 - 0.65 * k;
        o.sx *= 1 + 0.35 * k;
        o.sz *= 1 + 0.35 * k;
        break;
      }
      case 'sink':
        // A thing of air and cinder goes slack and falls.
        d.lift = -0.25 * between(0, 0.7, t) * Math.max(0.3, L);
        d.pitch = -0.5 * between(0, 0.5, t);
        break;
      default:
        break;
    }
  }
}
