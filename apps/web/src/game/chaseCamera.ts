/**
 * The third-person camera: a free orbit round the player, a little to one shoulder and above the head, looking the way the mouse does. The
 * figure sits low and a touch off the middle of the picture, the crosshair in the middle. (The figure turns to face where it walks, and to face
 * the crosshair when it acts: see `SelfView`.)
 *
 * What makes it good to play with (and in caves):
 * - It follows the player on a short elastic: running pulls it a little behind, and it swings back in when the player stops.
 * - The camera looks along the player's own yaw and pitch, so the crosshair is where the mouse points. What it is on is worked out
 *   again by the game, see `aimThroughCrosshair`: the eyes aim at that spot, so a blow lands where the crosshair is.
 * - It is kept off the walls with a thick probe (five rays, not one), so a corner or a ceiling beside the line does not poke
 *   into the picture; it comes in at once when something is in the way and goes back out slowly, so it does not pump.
 * - Boxed in on the shoulder side (a tunnel, a wall) it steps over to the other shoulder while that side is free, and goes back
 *   when the preferred side is clear again.
 * - Close behind the head (a one-block tunnel, a wall at your back) the body would fill the picture: it is then not drawn (`bodyHidden`).
 * - The height of the head is followed smoothly, so stairs and sneaking do not jerk the picture.
 */

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** Running pulls the camera back by up to this much more (reached at a sprint), and it follows the player on an elastic of this stiffness (per second). */
export const RUN_PULL = 0.9;
export const FOLLOW_RATE = 12;
/** From behind the camera is this far to the shoulder and up from the head, and this far behind that spot. */
export const SHOULDER_SIDE = 0.7;
export const SHOULDER_UP = 0.6;
export const BEHIND_DISTANCE = 5.2;
/** A rider is higher and the mount long: the camera sits this much further back. */
export const MOUNTED_EXTRA = 1.6;
/** Drawing a bow brings the camera in by up to this share of the distance. */
export const AIM_ZOOM = 0.3;
/**
 * The body is left out while the camera is all but inside it: closer than `BODY_HIDE_DEPTH` (along the view) and within `BODY_HIDE_SIDE` of
 * the middle of the view. It comes back beyond the larger `_SHOW` values (so it does not flicker at the edge). Squeezed in against a wall the
 * body is still drawn, big, as long as the camera has room in front of it.
 */
export const BODY_HIDE_DEPTH = 1.3;
export const BODY_SHOW_DEPTH = 1.6;
export const BODY_HIDE_SIDE = 1.3;
export const BODY_SHOW_SIDE = 1.5;
/**
 * The body is also left out while it would be over the crosshair and the camera is not far from it: the line through the crosshair passes
 * within `COVER_HIDE_SIDE` of the body (a post `BODY_HEIGHT` tall from the head down) with the camera closer than `COVER_HIDE_DISTANCE`.
 * (With the camera out at its usual distance, over the shoulder, the line passes beside the body and nothing is left out.)
 */
export const COVER_HIDE_DISTANCE = 3.4;
export const COVER_SHOW_DISTANCE = 3.9;
export const COVER_HIDE_SIDE = 0.55;
export const COVER_SHOW_SIDE = 0.8;
const BODY_HEIGHT = 1.6;
/** How far from the line the probes of the camera reach (the camera is not a point: its picture has a width). */
const PROBE = 0.22;
/** Keeps the camera this far off a wall. */
const MARGIN = 0.3;
/** The slopes tried for the camera's line, steepest first (see lift). */
const LIFTS = [1, 0.6, 0.3, 0];

export type Solid = (x: number, y: number, z: number) => boolean;

export interface ChasePose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Camera to eyes, in blocks. */
  distance: number;
  /** True while the camera is so close that the body would be in the way. */
  bodyHidden: boolean;
}

/** How far from `from` along the unit direction `d` (up to `max`) is free of solid blocks, less the margin. */
export function clearRun(from: Point3, d: Point3, max: number, solid: Solid, margin = MARGIN): number {
  const step = 0.1;
  let t = 0;
  while (t < max) {
    const n = t + step;
    if (solid(Math.floor(from.x + d.x * n), Math.floor(from.y + d.y * n), Math.floor(from.z + d.z * n))) break;
    t = n;
  }
  return t >= max ? max : Math.max(0, t - margin);
}

const ease = (dt: number, rate: number): number => 1 - Math.exp(-dt * rate);

export class ChaseCamera {
  /** The shoulder the camera likes: 1 = right, -1 = left (the middle mouse button swaps it). */
  shoulder: 1 | -1 = 1;
  /** Which way the camera is on at the moment: it differs from the liked shoulder while that side is blocked. */
  private sign: 1 | -1 = 1;
  /** Signed sideways offset from the head, up from the head, and how far back: where the camera is on its way to its place. */
  private side = 0;
  private up = 0;
  private back = 0;
  /** How much of the line of sight's slope the camera's line keeps (1 = all, 0 = level). */
  private lift = 1;
  /** The head's height, followed smoothly. */
  private headY = 0;
  private placed = false;
  /** Where the camera follows to on the ground (the player's place on an elastic), and how hard the player is running (0..1). */
  private followX = 0;
  private followZ = 0;
  private run = 0;
  /** How long the liked shoulder has been free; the camera goes back to it after a moment, not at once. */
  private freeFor = 0;
  private hidden = false;

  /** Put the camera on the other shoulder. */
  swapShoulder(): void {
    this.shoulder = this.shoulder === 1 ? -1 : 1;
    this.sign = this.shoulder;
    this.freeFor = 0;
  }

  /** Forget where the camera was (it goes straight to its place next time: after a teleport, or a change of view). */
  reset(): void {
    this.placed = false;
  }

  /**
   * One frame. `eye` is the head, the look angles are the player's. `tight` (0..1) brings the camera in (drawing a bow).
   */
  update(dt: number, eye: Point3, yaw: number, pitch: number, solid: Solid, mounted = false, tight = 0, speed = 0): ChasePose {
    const cp = Math.cos(pitch);
    const f = { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
    const right = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
    const snap = !this.placed || dt <= 0 || Math.abs(eye.y - this.headY) > 2.5 || Math.hypot(eye.x - this.followX, eye.z - this.followZ) > 6;
    // Running (more than a walk) lets the camera out a little further, eased in and out.
    this.run = snap ? 0 : this.run + (Math.max(0, Math.min(1, (speed - 3.5) / 4)) - this.run) * ease(dt, 2.5);
    const wantBack = ((mounted ? BEHIND_DISTANCE + MOUNTED_EXTRA : BEHIND_DISTANCE) + RUN_PULL * this.run) * (1 - AIM_ZOOM * tight);

    // The head's height is followed smoothly: steps, stairs and sneaking move it by a little each time. On the ground the camera trails the
    // player on a short elastic: it is a little behind at a run and catches up when the player stops.
    this.headY = snap ? eye.y : this.headY + (eye.y - this.headY) * ease(dt, 16);
    this.followX = snap ? eye.x : this.followX + (eye.x - this.followX) * ease(dt, FOLLOW_RATE);
    this.followZ = snap ? eye.z : this.followZ + (eye.z - this.followZ) * ease(dt, FOLLOW_RATE);
    // (Never trailing into a wall at a corner: there it holds on to the player.)
    if (solid(Math.floor(this.followX), Math.floor(this.headY), Math.floor(this.followZ))) {
      this.followX = eye.x;
      this.followZ = eye.z;
    }
    const head = { x: this.followX, y: this.headY, z: this.followZ };

    // Which shoulder: the liked one while it is free; the other when the liked one is boxed in and the other is not.
    const runRight = clearRun(head, right, SHOULDER_SIDE, solid);
    const runLeft = clearRun(head, { x: -right.x, y: 0, z: -right.z }, SHOULDER_SIDE, solid);
    const likedRun = this.shoulder === 1 ? runRight : runLeft;
    const otherRun = this.shoulder === 1 ? runLeft : runRight;
    if (this.sign === this.shoulder) {
      if (likedRun < SHOULDER_SIDE * 0.45 && otherRun > likedRun + SHOULDER_SIDE / 3) this.sign = -this.shoulder as 1 | -1;
      this.freeFor = 0;
    } else if (likedRun >= SHOULDER_SIDE * 0.99) {
      this.freeFor += dt;
      if (this.freeFor > 0.5) {
        this.sign = this.shoulder;
        this.freeFor = 0;
      }
    } else this.freeFor = 0;

    // Out to the shoulder, then up: a wall in the way ends the step at once; the way back out is eased.
    const wantSide = this.sign === 1 ? runRight : -runLeft;
    const wantUp = clearRun({ x: head.x + right.x * wantSide, y: head.y, z: head.z + right.z * wantSide }, { x: 0, y: 1, z: 0 }, SHOULDER_UP, solid);
    if (snap) {
      this.side = wantSide;
      this.up = wantUp;
    } else {
      this.side += (wantSide - this.side) * ease(dt, 9);
      this.up += (wantUp - this.up) * ease(dt, 9);
      // Never into a wall (going over to the other shoulder sweeps across the head, where all is free).
      this.side = Math.max(-runLeft, Math.min(runRight, this.side));
      this.up = Math.min(this.up, wantUp);
    }
    const pivot = { x: head.x + right.x * this.side, y: head.y + this.up, z: head.z + right.z * this.side };

    // Back from the pivot, as far as five probes (the line and four around it) say is free. The camera sits on the line of sight, but
    // with a low ceiling (looking down) or a floor (looking up) in the way it slides to a flatter line, which is still free, rather
    // than shrinking onto the head: only its place changes, it keeps looking the way the player does.
    const u = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) }; // sideways of the view
    const lineFor = (lift: number): Point3 => {
      const y = -f.y * lift;
      const n = Math.hypot(cp, y) || 1;
      return { x: -f.x / n, y: y / n, z: -f.z / n };
    };
    const freeAlong = (b: Point3): number => {
      // Up of the view for this line: b x u.
      const v = { x: b.y * u.z, y: b.z * u.x - b.x * u.z, z: -b.y * u.x };
      const vl = Math.hypot(v.x, v.y, v.z) || 1;
      const reach = (ox: number, oy: number, oz: number): number => clearRun({ x: pivot.x + ox, y: pivot.y + oy, z: pivot.z + oz }, b, wantBack, solid);
      let free = reach(0, 0, 0);
      free = Math.min(free, reach(u.x * PROBE, u.y * PROBE, u.z * PROBE), reach(-u.x * PROBE, -u.y * PROBE, -u.z * PROBE));
      return Math.min(free, reach((v.x / vl) * PROBE, (v.y / vl) * PROBE, (v.z / vl) * PROBE), reach((-v.x / vl) * PROBE, (-v.y / vl) * PROBE, (-v.z / vl) * PROBE));
    };
    // The steepest line that is free enough (the line of sight itself when it is), else the freest.
    let bestLift = 1;
    let bestFree = -1;
    for (const lift of LIFTS) {
      const fr = freeAlong(lineFor(lift));
      if (fr >= wantBack * 0.92) {
        bestLift = lift;
        bestFree = fr;
        break;
      }
      if (fr > bestFree + 1e-6) {
        bestLift = lift;
        bestFree = fr;
      }
    }
    // Flatter at once, steeper again slowly.
    this.lift = snap ? bestLift : this.lift + (bestLift - this.lift) * ease(dt, bestLift < this.lift ? 10 : 2.5);
    const b = lineFor(this.lift);
    const free = freeAlong(b);
    // In at once; out slowly (so a doorway or a branch does not make it pump).
    this.back = snap || free < this.back ? free : Math.min(free, this.back + (wantBack - this.back) * ease(dt, 3));
    this.placed = true;

    const cam = { x: pivot.x + b.x * this.back, y: pivot.y + b.y * this.back, z: pivot.z + b.z * this.back };
    const distance = Math.hypot(cam.x - eye.x, cam.y - eye.y, cam.z - eye.z);
    // How far the head is in front of the camera along the view, and how far off the middle of it.
    const hx = eye.x - cam.x;
    const hy = eye.y - cam.y;
    const hz = eye.z - cam.z;
    const depth = hx * f.x + hy * f.y + hz * f.z;
    const off = Math.hypot(hx - f.x * depth, hy - f.y * depth, hz - f.z * depth);
    // And the other way the body is in the way: squeezed in (a tunnel, a corner) the camera is close behind it, and the body fills the
    // middle of the picture, over the crosshair. How near the line through the crosshair comes to the body (a post from the feet to just
    // over the head) tells.
    let cover = Infinity;
    for (let i = 0; i <= 4; i++) {
      const py = eye.y - BODY_HEIGHT + (i / 4) * (BODY_HEIGHT + 0.2);
      const qx = eye.x - cam.x;
      const qy = py - cam.y;
      const qz = eye.z - cam.z;
      const along = qx * f.x + qy * f.y + qz * f.z;
      if (along < 0.05) continue; // behind the camera
      cover = Math.min(cover, Math.hypot(qx - f.x * along, qy - f.y * along, qz - f.z * along));
    }
    const covering = this.hidden ? distance < COVER_SHOW_DISTANCE && cover < COVER_SHOW_SIDE : distance < COVER_HIDE_DISTANCE && cover < COVER_HIDE_SIDE;
    const closeIn = this.hidden ? depth < BODY_SHOW_DEPTH && off < BODY_SHOW_SIDE : depth < BODY_HIDE_DEPTH && off < BODY_HIDE_SIDE;
    this.hidden = closeIn || covering;
    return { x: cam.x, y: cam.y, z: cam.z, yaw, pitch, distance, bodyHidden: this.hidden };
  }
}
