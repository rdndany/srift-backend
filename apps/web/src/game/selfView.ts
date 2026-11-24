import type { EntityLight } from './entityLight';
import * as THREE from 'three';
import { BASH_ANIM, type ClassId, type MountId } from '@solrift/shared';
import { Character, DEFAULT_PALETTE, STAB_TIME, SWING_TIME, figureGlows, figureLoadout, layDown, standUp, type Palette, type SkinVoxel } from './character';
import type { StepHandler } from './fenrir';
import { MountRig } from './mountRig';
import { BEHIND_DISTANCE, ChaseCamera, MOUNTED_EXTRA, SHOULDER_SIDE, SHOULDER_UP, clearRun } from './chaseCamera';

/** 0 = first person, 1 = third person from behind, 2 = third person from the front (F5 cycles). */
export type ViewMode = 0 | 1 | 2;

/** How far the front camera sits from the head, in blocks (it looks back at the player; from behind, see `ChaseCamera`). */
export const THIRD_PERSON_DISTANCE = 4.5;
/** The field of view is widened by this many degrees in third person (a trim of -6): more of the world round the figure, which sits smaller in the picture. */
export const THIRD_PERSON_FOV_TRIM = -6;
export { BEHIND_DISTANCE, MOUNTED_EXTRA, SHOULDER_SIDE, SHOULDER_UP };

export interface CameraPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

/** Where the camera goes for a view mode, with nothing remembered between calls (see `ChaseCamera` for the one that eases). */
export function cameraPose(
  mode: ViewMode,
  eye: { x: number; y: number; z: number },
  yaw: number,
  pitch: number,
  solid: (x: number, y: number, z: number) => boolean,
  distance = THIRD_PERSON_DISTANCE,
  mounted = false,
): CameraPose {
  // First person is the eye itself, mounted or not: the camera, the aim and the hit tests all start from `eye` (one value, `MOUNTED_EYE`, for a rider).
  if (mode === 0) return { x: eye.x, y: eye.y, z: eye.z, yaw, pitch };
  // The way the player looks (yaw 0 faces -z, positive pitch looks up).
  const cp = Math.cos(pitch);
  const fx = -Math.sin(yaw) * cp;
  const fy = Math.sin(pitch);
  const fz = -Math.cos(yaw) * cp;
  // From behind: the chase camera, placed at once (the game keeps one going to ease it from frame to frame).
  if (mode === 1) {
    const p = new ChaseCamera().update(0, eye, yaw, pitch, solid, mounted);
    return { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch };
  }
  // The front view sits on the line of sight, in front of the player, pulled in so it never ends up inside a wall.
  const dx = fx;
  const dy = fy;
  const dz = fz;
  if (mounted) distance += MOUNTED_EXTRA;
  const d = clearRun(eye, { x: dx, y: dy, z: dz }, distance, solid);
  return {
    x: eye.x + dx * d,
    y: eye.y + dy * d,
    z: eye.z + dz * d,
    yaw: yaw + Math.PI,
    pitch: -pitch,
  };
}

/** The angle `a` brought into -PI..PI. */
export function wrapAngle(a: number): number {
  const t = (a + Math.PI) % (Math.PI * 2);
  return (t < 0 ? t + Math.PI * 2 : t) - Math.PI;
}

/** The head may turn this far from the body before the body has to follow (about 50 degrees). */
export const HEAD_TURN_LIMIT = 0.87;

/**
 * The body turns after the head, and eases round to it rather than snapping: it follows while walking, and otherwise only
 * when the head has turned too far (it is then brought back within the limit).
 */
export function followBodyYaw(body: number, head: number, moving: boolean, dt: number): number {
  const diff = wrapAngle(head - body);
  let want = 0;
  if (moving) want = diff;
  else if (diff > HEAD_TURN_LIMIT) want = diff - HEAD_TURN_LIMIT;
  else if (diff < -HEAD_TURN_LIMIT) want = diff + HEAD_TURN_LIMIT;
  return want === 0 ? body : body + want * (1 - Math.exp(-dt * (moving ? 10 : 12)));
}

/** The yaw a body has when it faces along the velocity (vx, vz): yaw 0 faces -z. */
export function motionYaw(vx: number, vz: number): number {
  return Math.atan2(-vx, -vz);
}

/**
 * The way a figure on the wing faces: the way the view looks, turned part of the way into the way it goes when that is off to a side (half of it, so
 * sideways it is a quarter round and the rest is a bank), less going back, and nothing while it hardly moves.
 */
export function wingedYaw(view: number, vx: number, vz: number, speed: number): number {
  const go = Math.max(0, Math.min(1, (speed - 1.2) / 3));
  if (go === 0) return view;
  const off = wrapAngle(motionYaw(vx, vz) - view);
  const a = Math.abs(off);
  const into = a <= 1.6 ? off * 0.5 : off * 0.5 * Math.max(0, Math.min(1, 2.6 - a));
  return view + into * go;
}

/** The angle `from` turned toward `to` the short way, by the share of the gap that `rate` (per second) and `dt` make, but no faster than `maxSpeed`. */
export function turnToward(from: number, to: number, dt: number, rate: number, maxSpeed = 16): number {
  const diff = wrapAngle(to - from);
  const step = diff * (1 - Math.exp(-dt * rate));
  const cap = maxSpeed * dt;
  return from + Math.max(-cap, Math.min(cap, step));
}

export interface SelfState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Horizontal speed in blocks per second, and its direction (the velocity itself: the figure turns to face it). */
  speed: number;
  vx?: number;
  vz?: number;
  /** The player is aiming (a bow drawn): the figure faces the crosshair, as it does while it swings, casts or blocks. */
  aiming?: boolean;
  /** How far the bow in the hand is drawn (a crossbow: wound), 0..1. */
  bowDraw?: number;
  /** Vertical speed (up is positive), and whether the feet are off the ground (jumping or falling, not swimming or climbing). */
  vy: number;
  airborne: boolean;
  sneaking: boolean;
  /** In the water with the feet off the bottom: the figure swims (or treads water when still). */
  afloat?: boolean;
  /** The wings worn (1 + their place in WINGS, 0 or left out: none), and whether the figure flies on them. */
  wing?: number;
  winged?: boolean;
  /** The room over the head (blocks, see `roofGap`; left out: plenty). */
  roof?: number;
  /** Item ids worn: helmet, chestplate, leggings, boots (0 = none). */
  armor: readonly number[];
  /** Item id in hand (0 = empty). */
  held: number;
  /** The colour the held item glows with (it carries glyphs), or null. */
  glow?: string | null;
  /** The same for the off-hand item. */
  offGlow?: string | null;
  /** Off-hand item id (a shield) and whether it is raised. */
  offhand: number;
  blocking: boolean;
  /** Eating: the food is brought to the mouth. */
  eating?: boolean;
  /** A Ground Slam: 1 crouching, 2 in the air, 3 down on the shield after the blow (0 or left out: none). */
  slam?: number;
  /** Running at a Charge (the body leans into it). */
  charging?: boolean;
  /** Casting the Emberstone: how far into the cast (0..1), 0 or left out when not. */
  casting?: number;
  /** The class the player is (the figure moves as it does: see classMotion.ts), and whether a fight is on (an enemy near): it stands to fight. */
  cls?: ClassId | null;
  engaged?: boolean;
  /** Lying in a bed: 0 = awake, else 1 + the way the bed points. */
  sleeping: number;
  /** The mount ridden, none on foot. */
  mount?: MountId | null;
  /** Dead: the body has come apart (see `DeathFx`), nothing of it is drawn. */
  dead?: boolean;
  brightness: number;
  /** Where the camera is (world space): the lightning of a mount keeps off it. */
  viewer?: THREE.Vector3;
  /** When given, lights the body from the world (sky colour, caves, torches) instead of by brightness alone. */
  light?: EntityLight;
}

/** Your own character, drawn when the camera is outside your head (third person). */
export class SelfView {
  mode: ViewMode = 0;
  /** The third-person camera is so close to the head that the body is not drawn (set by the game each frame, see `ChasePose.bodyHidden`). */
  cameraInHead = false;
  readonly group = new THREE.Group();
  private readonly character = new Character(DEFAULT_PALETTE());
  private readonly rider = new THREE.Group();
  private readonly rig = new MountRig(this.group, this.rider, this.character);
  private bodyYaw = 0;
  /** Standing still, the crosshair went past what the neck can turn to: the body is turning to face it (until it does). */
  private turnToAim = false;
  /** The head's turn against the body, smoothed. */
  private headYaw = 0;
  /** How fast the body is turning, radians per second (positive to the left), smoothed. */
  private turn = 0;
  private attack = 1;
  /** Seconds since a Shield Bash was thrown (`BASH_ANIM` and more: none). */
  private bashAge = 9;
  private placed = false;

  /** `models` makes the model of a held item (see `HeldItem.figureModel`). */
  constructor(private readonly models: (id: number) => THREE.Object3D | null) {
    this.rider.add(this.character.root);
    this.group.add(this.rider);
    this.group.visible = false;
  }

  /** Dress the body for the look the player chose. */
  setLook(palette: Palette): void {
    this.character.setLook(palette);
  }

  /** First person, then behind, then in front, then first person again. */
  cycle(): ViewMode {
    this.mode = ((this.mode + 1) % 3) as ViewMode;
    this.group.visible = this.mode !== 0;
    return this.mode;
  }

  setMode(mode: ViewMode): void {
    this.mode = mode;
    this.group.visible = mode !== 0;
  }

  /** Start the arm swing (attack, place). Ignored while one is already in its first half. */
  swing(rate = 1): void {
    if (this.attack > 0.5) {
      this.attack = 0;
      this.attackRate = rate;
    }
  }

  /** How much faster than usual the swing in progress runs (the attack speed of the weapon). */
  private attackRate = 1;

  /** A Shield Bash was thrown: the figure draws its shield back and drives it forward. */
  bash(): void {
    this.bashAge = 0;
  }

  /** Debug: stand to fight as if a monster were near (see debugHooks). */
  forceEngaged = false;
  /** Debug: the figure drawn turned this far from where it faces (to look at it from the side, the front, three-quarters), with nothing else changed. */
  viewTurn = 0;

  /** Start one of the things the figure does when left standing (1 sit, 2 stretch, 3 look around; 0 ends it). */
  idle(kind: number): void {
    this.character.playIdle(kind);
  }

  /** The body as it stands, cut into cubes (for `DeathFx`), and the way it faces. */
  voxels(): SkinVoxel[] {
    return this.character.voxels();
  }

  /** The way the drawn body faces now (it is not kept up to date in first person). */
  get facing(): number {
    return this.group.rotation.y;
  }

  /** The left hand stabs (the dagger of a ranger who has put the bow away). */
  stab(): boolean {
    if (this.character.stabAge < STAB_TIME * 0.8) return false;
    this.character.stabAge = 0;
    return true;
  }

  /** Keep swinging while mining: a new swing starts only when the last one has finished. */
  swingIfIdle(): void {
    if (this.attack >= 1) {
      this.attack = 0;
      this.attackRate = 1;
    }
  }

  /** The mount does what its rider's skill says (a bite, the howl). */
  mountAct(what: 'bite' | 'howl'): void {
    this.rig.act(what);
  }

  /** Where the game hears the paws of your own mount (see `Fenrir.onStep`). */
  set onMountStep(fn: StepHandler | null) {
    this.rig.onStep = fn;
  }

  update(dt: number, s: SelfState): void {
    // In first person only a mount is drawn: you see the head of the beast you ride in front of you, not your own body.
    const mounted = !!s.mount;
    if (this.mode === 0 && !mounted && !this.rig.mounted) {
      this.character.root.visible = true;
      return;
    }
    this.group.visible = (this.mode !== 0 || mounted) && !s.dead;
    // The body is left out when the camera is in the head (a tunnel one block wide): it would only be in the way.
    this.character.root.visible = this.mode !== 0 && !this.cameraInHead && !s.dead;
    if (!this.placed) {
      this.bodyYaw = s.yaw;
      this.placed = true;
    }
    this.attack = Math.min(1, this.attack + (dt * this.attackRate) / SWING_TIME);
    this.bashAge = Math.min(9, this.bashAge + dt);
    const moving = s.speed > 0.3;
    const before = this.bodyYaw;
    // The body: a mount turns with the view (the head you ride behind must stay in front of you). On foot the camera orbits freely and the body
    // faces where it walks (sideways and backward too, so it always walks forward); while it swings, casts, blocks or aims it faces the
    // crosshair, and standing still it stays as it is until the crosshair goes past what the neck can turn to: then it turns right round to face it.
    const acting = this.attack < 1 || this.character.stabAge < 0.5 || s.blocking || !!s.aiming || !!s.eating || !!s.slam || this.bashAge < BASH_ANIM;
    if (moving || acting || mounted) this.turnToAim = false;
    if (mounted) this.bodyYaw = s.yaw;
    else if (acting) this.bodyYaw = turnToward(this.bodyYaw, s.yaw, dt, 24, 22);
    else if (s.vx === undefined || s.vz === undefined) this.bodyYaw = followBodyYaw(this.bodyYaw, s.yaw, moving, dt);
    // On the wings it faces where the view looks (it flies the way the keys push it, along the view, and the crosshair is where it is going).
    // (It turns part of the way into a drift: flying to the left or diagonally it is half round to where it goes, banked into it, not a post carried sideways.)
    else if (s.winged && (s.wing ?? 0) > 0) this.bodyYaw = turnToward(this.bodyYaw, wingedYaw(s.yaw, s.vx, s.vz, s.speed), dt, 9, 12);
    else if (s.speed > 0.5 && !s.airborne) this.bodyYaw = turnToward(this.bodyYaw, motionYaw(s.vx, s.vz), dt, 14);
    else if (!s.airborne) {
      const gap = Math.abs(wrapAngle(s.yaw - this.bodyYaw));
      if (gap > HEAD_TURN_LIMIT) this.turnToAim = true;
      else if (gap < 0.08) this.turnToAim = false;
      if (this.turnToAim) this.bodyYaw = turnToward(this.bodyYaw, s.yaw, dt, 9, 12);
    }
    // In a jump the body keeps the way the jump was taken, but as the way it goes bends (the keys or the view change in the air) it comes round
    // with it, more slowly than on the ground: it can be seen to turn in the air.
    else if (s.speed > 1) this.bodyYaw = turnToward(this.bodyYaw, motionYaw(s.vx, s.vz), dt, 6, 8);
    if (dt > 0) this.turn += (wrapAngle(this.bodyYaw - before) / dt - this.turn) * (1 - Math.exp(-dt * 10));
    const c = this.character;
    if (s.sleeping > 0) {
      this.rig.update(dt, null, 0, 0, 0, false);
      layDown(this.group, s.x, s.y, s.z, s.sleeping);
      this.bodyYaw = s.yaw;
      c.settle();
      c.headPivot.rotation.set(0, 0, 0);
      c.pose(0, 1, false, false);
      c.setArmor(s.armor);
      c.setHeld(0, this.models);
      c.setShield(0, this.models);
      this.lit(s);
      return;
    }
    standUp(this.group);
    this.group.position.set(s.x, s.y - (s.sneaking ? 0.1 : 0), s.z);
    this.group.rotation.y = this.bodyYaw + this.viewTurn;
    this.group.scale.y = s.sneaking ? 0.92 : 1;
    // The head looks where you aim, though the body eases round behind it (and the neck only turns so far).
    // Walking backward or sideways, the head turns toward the view only as far as a neck can; right round the back it looks along the body.
    const gaze = wrapAngle(s.yaw - this.bodyYaw);
    const headWant = mounted ? Math.max(-1.3, Math.min(1.3, gaze)) : Math.abs(gaze) > 2.3 ? 0 : Math.max(-1.0, Math.min(1.0, gaze));
    this.headYaw += (headWant - this.headYaw) * (1 - Math.exp(-dt * 16));
    c.headPivot.rotation.y = this.headYaw;
    c.headPivot.rotation.x = s.pitch;
    // A rider holds nothing: no weapon in the hand, no shield on the arm.
    const load = mounted ? { hand: 0, shield: 0 } : figureLoadout(s.held, s.offhand);
    const light = s.light ? s.light.at(s.x, s.y, s.z, this.tint) : this.tint.setScalar(Math.max(0.3, s.brightness));
    // In first person the camera is the rider's own, in the middle of the lightning that crackles over the mount.
    this.rig.update(dt, s.mount ?? null, s.speed, this.turn, s.vy, s.airborne, light, s.viewer ?? null, this.mode === 0 || this.cameraInHead);
    c.slamPhase = mounted ? 0 : (s.slam ?? 0);
    c.charging = !mounted && !!s.charging;
    c.casting = mounted ? 0 : (s.casting ?? 0);
    c.bashAge = mounted ? 9 : this.bashAge;
    c.aimDraw = mounted ? 0 : (s.bowDraw ?? 0);
    c.aimPitch = s.pitch;
    c.afloat = !mounted && !!s.afloat;
    c.setWings(mounted ? 0 : (s.wing ?? 0));
    c.roof = s.roof ?? 4;
    c.wingFlying = !mounted && !!s.winged;
    c.setMotionClass(s.cls ?? null);
    c.engaged = (!!s.engaged || this.forceEngaged) && !mounted;
    // Which way it goes against the way it faces: it faces where it walks, but while it aims, blocks or swings it faces the crosshair and goes sideways or back.
    if (s.vx !== undefined && s.vz !== undefined && s.speed > 0.3) {
      const by = this.bodyYaw;
      c.moveF = (-s.vx * Math.sin(by) - s.vz * Math.cos(by)) / s.speed;
      c.moveR = (s.vx * Math.cos(by) - s.vz * Math.sin(by)) / s.speed;
    } else {
      c.moveF = 1;
      c.moveR = 0;
    }
    c.animate(dt, s.speed, this.turn, this.attack, load.hand !== 0, s.blocking && !mounted, s.vy, s.airborne, !!s.eating && !mounted);
    c.setArmor(s.armor);
    c.setHeld(load.hand, this.models);
    const fx = figureGlows(s.held, s.offhand, s.glow ?? null, s.offGlow ?? null);
    c.setHeldGlow(load.hand ? fx.hand : null);
    c.setShield(load.shield, this.models);
    c.setShieldGlow(load.shield ? fx.shield : null);
    this.lit(s);
  }

  private readonly tint = new THREE.Color();

  private lit(s: SelfState): void {
    if (s.light) this.character.setLight(s.light.at(s.x, s.y, s.z, this.tint), s.light, this.group.rotation.y);
    else this.character.setBrightness(s.brightness);
  }

  dispose(): void {
    this.rig.dispose();
    this.character.setHeld(0, this.models);
    this.character.setShield(0, this.models);
    this.character.dispose();
  }
}
