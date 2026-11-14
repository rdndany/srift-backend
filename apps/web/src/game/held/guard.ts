import * as THREE from 'three';
import { I, getItem } from '@solrift/shared';
import { AXIS_X, AXIS_Y, AXIS_Z, DEG } from './view';

/**
 * Everything a shield does in the first-person view, in either hand: raised to block, jolted by a blow, drawn back and driven
 * forward in a Shield Bash, held ready for Iron Defense or a Charge, and planted in a Ground Slam. It also places whatever else
 * is in the off hand (an orb, a dagger), which makes way for the shield when one of those moves brings one out.
 */

// A shield rests low at the side and comes up to guard when it is raised: in front of the body and a little to its side, angled
// inwards and held out from the face, so that it covers the lower part of the view and leaves the crosshair clear.
// A shield always comes in from the bottom corner (a bit of it is cut off by the edge of the view), so it is held by something out of sight
// and never floats: at rest it sits in the corner, raised it comes up from under the view.
const SHIELD_UP_MAIN = new THREE.Vector3(0.34, -0.3, -0.82);
const SHIELD_REST_OFF = new THREE.Vector3(-0.5, -0.36, -0.9);
const SHIELD_EDGE_OFF = new THREE.Vector3(-0.7, -0.42, -0.9);
const SHIELD_UP_OFF = new THREE.Vector3(-0.34, -0.3, -0.82);
/** How far the view's side edge moves out (at the shield's depth) for each step of the aspect ratio over 16:9. */
const EDGE_PER_ASPECT = Math.tan(THREE.MathUtils.degToRad(32.5)) * 0.9;
/** The guard pose is angled inwards (radians about the vertical), leans back a little and is drawn a little smaller. */
const SHIELD_GUARD_YAW = 0.42;
const SHIELD_GUARD_LEAN = 0.18;
const SHIELD_GUARD_SCALE = 1.1;
// A Charge holds it more to the front, still low and out from the face.
const SHIELD_CHARGE_OFF = new THREE.Vector3(-0.14, -0.2, -0.8);
const SHIELD_CHARGE_SCALE = 0.86;
// A Shield Bash ends with the shield driven into the middle of the view, close and a little large.
const SHIELD_BASH = new THREE.Vector3(0.04, -0.06, -0.72);
const SHIELD_PULL = new THREE.Vector3(-0.1, -0.12, 0.26);

const Q = new THREE.Quaternion();
const Q_GUARD = new THREE.Quaternion();
const Q_TILT = new THREE.Quaternion();
const Q_SLAM = new THREE.Quaternion();
const V_UP = new THREE.Vector3();
const V_SLAM = new THREE.Vector3();

/** The two hands this frame, as the shield's moves see them. */
export interface GuardHands {
  pivot: THREE.Object3D;
  offPivot: THREE.Object3D;
  /** The main hand holds something, and it is a shield. */
  hasMain: boolean;
  mainShield: boolean;
  /** The off hand holds something; it is a shield; it drifts (the orb). */
  hasOff: boolean;
  offShield: boolean;
  offFloat: boolean;
  camera: THREE.PerspectiveCamera;
  aspect: number;
  /** The bob of the walk and the dip of a change of item. */
  bx: number;
  by: number;
  down: number;
  shakeT: number;
  /** The size of the item in the main hand this frame. */
  scale: number;
}

export class ShieldMoves {
  /** How far the shield is raised for a block (a spring, so it can overshoot a little), and how fast it is moving. */
  private raise = 0;
  private raiseV = 0;
  /** Seconds since a blow was stopped by the shield, and whether it was a parry. */
  private guardT = 9;
  private guardParry = false;
  /** 0..1 over a Shield Bash (1 = not bashing). */
  private bashT = 1;
  /** How far the shield is held up for a Charge or Iron Defense (0 none, 1 right in front), and where it is heading. */
  private stance = 0;
  private stanceTo = 0;
  /** A Ground Slam: where it is (1 crouching, 2 in the air, 3 the blow), the speed of the fall, how far each part is in (eased), and the seconds in this part. */
  private slamTo = 0;
  private slamVy = 0;
  private slamWas = 0;
  private slamT = 0;
  private readonly slamK = { wind: 0, up: 0, fall: 0, hit: 0 };
  /** How much of the slam there is this frame (0..1). */
  private slam = 0;

  /** A blow stopped by the raised shield (a parry thrusts it out first): it is jolted back, and settles. */
  blockHit(parry: boolean): void {
    this.guardT = 0;
    this.guardParry = parry;
  }

  /** A Shield Bash: the shield is drawn back and driven forward (the warrior's own shield if they have one in hand, otherwise one is brought out for it). */
  bash(): void {
    this.bashT = 0;
  }

  /** Hold the shield up ready (0.55 for Iron Defense) or right in front (1, the Charge): 0 puts it away. */
  setStance(v: number): void {
    this.stanceTo = v;
  }

  /** A Ground Slam (0 none, 1 crouching, 2 in the air, 3 the blow) and the vertical speed: the weapon goes up out of the view, the shield comes forward and down. */
  setSlam(phase: number, vy: number): void {
    this.slamTo = phase;
    this.slamVy = vy;
  }

  /**
   * Move everything on by a frame. Returns the item the off hand should show: what is in it, or a shield brought out for a bash,
   * a charge or a guard (an orb or a dagger makes way for it).
   */
  step(dt: number, blocking: boolean, offId: number, mainShield: boolean): number {
    // The shield snaps up with a little overshoot (a spring) and drops back more softly.
    for (let left = Math.min(dt, 0.1); left > 0; left -= 1 / 120) {
      const h = Math.min(left, 1 / 120);
      const w = blocking ? 26 : 16;
      this.raiseV += (((blocking ? 1 : 0) - this.raise) * w * w - 2 * (blocking ? 0.5 : 0.9) * w * this.raiseV) * h;
      this.raise += this.raiseV * h;
    }
    this.raise = Math.max(-0.02, Math.min(1.2, this.raise));
    if (!blocking && Math.abs(this.raise) < 0.002 && Math.abs(this.raiseV) < 0.02) this.raise = this.raiseV = 0;
    this.guardT += dt;
    this.stance += (this.stanceTo - this.stance) * Math.min(1, dt * 10);
    this.bashT = Math.min(1, this.bashT + dt / 0.55);
    this.slam = this.slamStep(dt);
    const wantShield = this.bashT < 1 || this.stance > 0.02 || this.slam > 0.02;
    const offKeeps = offId !== 0 && (getItem(offId).shield || !(wantShield && !mainShield));
    return offKeeps ? offId : wantShield && !mainShield ? I.SHIELD : 0;
  }

  /** Put the hands where the shield's moves have them: on top of the pose the main hand already has. */
  pose(h: GuardHands): void {
    const { pivot, offPivot, mainShield } = h;
    const { back, hit } = this.bashAmounts();
    const k = Math.max(this.raise, this.stance);
    // 0 while guarding (a block, Iron Defense), 1 in the Charge's more forward pose.
    const forward = Math.max(0, Math.min(1, (this.stance - 0.55) / 0.45));
    pivot.scale.setScalar(h.scale);
    const edge = EDGE_PER_ASPECT * (h.aspect - 16 / 9);
    // The shield in hand rises toward the middle.
    if (mainShield) {
      pivot.position.x += edge;
      V_UP.copy(SHIELD_UP_MAIN).lerp(SHIELD_CHARGE_OFF.clone().setX(-SHIELD_CHARGE_OFF.x), forward);
      pivot.position.lerp(V_UP, k);
      // Angled inwards (the opposite way to the off hand) and leaning back.
      Q_GUARD.setFromAxisAngle(AXIS_Y, SHIELD_GUARD_YAW * (1 - forward)).multiply(Q.setFromAxisAngle(AXIS_X, SHIELD_GUARD_LEAN * (1 - forward)));
      pivot.quaternion.slerp(Q_GUARD, k);
      pivot.scale.setScalar(1 + (SHIELD_GUARD_SCALE + (SHIELD_CHARGE_SCALE - SHIELD_GUARD_SCALE) * forward - 1) * k);
      this.driveBash(pivot, back, hit);
    }
    // ... and so does the off-hand one.
    if (h.hasOff) {
      // Only a shield is raised; an orb or a dagger rests at the side and the orb drifts a little.
      const offShield = h.offShield;
      const ko = mainShield || !offShield ? 0 : k;
      V_UP.copy(SHIELD_UP_OFF).lerp(SHIELD_CHARGE_OFF, forward);
      // The orb is held in the bottom-left corner of the view, mirroring the wand in the other hand, whatever the window's shape.
      const orbShift = h.offFloat ? -0.72 * Math.tan(THREE.MathUtils.degToRad(h.camera.fov / 2)) * Math.abs(SHIELD_REST_OFF.z) * h.camera.aspect - SHIELD_REST_OFF.x : 0;
      // A shield rests in the corner, whatever the window's shape (the corner moves out with a wider view).
      const R = offShield ? SHIELD_EDGE_OFF : SHIELD_REST_OFF;
      const cornerX = offShield ? -edge : 0;
      offPivot.position.set(
        R.x + cornerX + orbShift + (V_UP.x - R.x - cornerX) * ko - h.bx,
        R.y + (V_UP.y - R.y) * ko - h.by - h.down,
        R.z + (V_UP.z - R.z) * ko,
      );
      // From resting turned outwards (+0.5) to guarding turned inwards, leaning back a little.
      offPivot.quaternion
        .setFromAxisAngle(AXIS_Y, 0.5 * (1 - ko) - SHIELD_GUARD_YAW * ko * (1 - forward))
        .multiply(Q.setFromAxisAngle(AXIS_X, SHIELD_GUARD_LEAN * ko * (1 - forward)));
      offPivot.scale.setScalar(1 + (SHIELD_GUARD_SCALE + (SHIELD_CHARGE_SCALE - SHIELD_GUARD_SCALE) * forward - 1) * ko);
      if (offShield && !mainShield) this.driveBash(offPivot, back, hit);
      if (h.offFloat) offPivot.position.y += Math.sin(h.shakeT * 0.05) * 0.012;
      // Charging: the shield shudders as the ground rushes past.
      if (this.stanceTo >= 1 && !mainShield && offShield) offPivot.position.y += Math.sin(h.shakeT * 0.9) * 0.006;
    }
    this.driveGuard(h);
    if (this.slam > 0) this.driveSlam(h);
  }

  /** How far into the bash (back = drawing it back, hit = driven forward), both 0..1. */
  private bashAmounts(): { back: number; hit: number } {
    const p = this.bashT;
    if (p >= 1) return { back: 0, hit: 0 };
    if (p < 0.22) return { back: Math.sin((p / 0.22) * Math.PI * 0.5), hit: 0 };
    if (p < 0.36) {
      const u = (p - 0.22) / 0.14;
      const e = 1 - Math.pow(1 - u, 3);
      return { back: 1 - e, hit: e };
    }
    const u = (p - 0.36) / 0.64;
    return { back: 0, hit: 1 - u * u * (3 - 2 * u) };
  }

  /** The bash on top of whatever pose the shield has: drawn back and tilted, then driven to the middle of the view. */
  private driveBash(pivot: THREE.Object3D, back: number, hit: number): void {
    if (back <= 0 && hit <= 0) return;
    pivot.position.addScaledVector(SHIELD_PULL, back);
    pivot.position.lerp(SHIELD_BASH, hit);
    pivot.quaternion.multiply(Q_TILT.setFromAxisAngle(AXIS_X, 0.35 * back - 0.45 * hit));
    pivot.quaternion.multiply(Q_TILT.setFromAxisAngle(AXIS_Z, -0.3 * back));
    pivot.scale.multiplyScalar(1 + 0.15 * hit);
  }

  /**
   * Blocking, on top of the shield's pose: the weapon hand tucks down and in to make room, the shield shudders when a blow lands on it
   * (jolted back and down toward the face, ringing out), and a parry first punches it forward.
   */
  private driveGuard(h: GuardHands): void {
    const up = Math.max(0, Math.min(1, this.raise));
    const weapon = h.mainShield ? (h.hasOff && !h.offShield ? h.offPivot : null) : h.hasMain ? h.pivot : null;
    if (weapon && up > 0.001 && this.bashT >= 1) {
      weapon.position.x += 0.03 * up;
      weapon.position.y -= 0.025 * up;
      weapon.position.z += 0.04 * up;
    }
    if (this.guardT >= 0.6) return;
    const shield = h.mainShield ? h.pivot : h.offShield ? h.offPivot : null;
    if (!shield) return;
    const t = this.guardT;
    const amp = (this.guardParry ? 1.5 : 1) * Math.min(1, up + 0.3);
    const ring = Math.exp(-t * 10) * Math.cos(t * 26);
    const punch = this.guardParry && t < 0.14 ? Math.sin((t / 0.14) * Math.PI) : 0;
    const side = shield === h.offPivot ? -1 : 1;
    shield.position.z += (0.07 * ring - 0.12 * punch) * amp;
    shield.position.y -= 0.03 * ring * amp;
    shield.position.x += side * 0.015 * Math.sin(t * 50) * Math.exp(-t * 14) * amp;
    shield.quaternion.multiply(Q_TILT.setFromAxisAngle(AXIS_X, (-0.12 * ring + 0.1 * punch) * amp));
    shield.quaternion.multiply(Q_TILT.setFromAxisAngle(AXIS_Z, side * 0.05 * ring * amp));
  }

  /** Ease the parts of the slam in and out; returns how much of it there is (0..1). */
  private slamStep(dt: number): number {
    if (this.slamTo !== this.slamWas) {
      this.slamWas = this.slamTo;
      this.slamT = 0;
    }
    this.slamT += dt;
    const k = this.slamK;
    const go = (v: number, on: boolean, rin: number, rout: number): number => v + ((on ? 1 : 0) - v) * Math.min(1, dt * (on ? rin : rout));
    const ph = this.slamTo;
    k.wind = go(k.wind, ph === 1, 14, 10);
    k.up = go(k.up, ph === 2 && this.slamVy > 0.5, 16, 8);
    k.fall = go(k.fall, ph === 2 && this.slamVy <= 0.5, 8, 8);
    k.hit = go(k.hit, ph === 3 && this.slamT < 0.16, 26, 9);
    const all = k.wind + k.up + k.fall + k.hit;
    if (all < 0.002) {
      k.wind = k.up = k.fall = k.hit = 0;
      return 0;
    }
    return Math.min(1, all);
  }

  /**
   * The Ground Slam seen from the eyes. The weapon is drawn back in the crouch, thrown up out of the top of the view on the jump, and brought
   * back low for the fall and the blow; the shield is out in front for all of it: held ready, dropped to the side on the jump, then driven
   * forward and down in the dive and planted at the ground in the blow, big and close, with a bounce.
   */
  private driveSlam(h: GuardHands): void {
    const k = this.slamK;
    const bump = Math.max(0, 1 - this.slamT / 0.14);
    const weapon = h.mainShield ? (h.hasOff && !h.offShield ? h.offPivot : null) : h.pivot;
    const shield = h.mainShield ? h.pivot : h.offShield ? h.offPivot : null;
    if (weapon) {
      weapon.position.x += 0.1 * k.wind + 0.02 * k.up + 0.08 * k.fall + 0.12 * k.hit;
      weapon.position.y += -0.14 * k.wind + 0.8 * k.up - 0.1 * k.fall - 0.22 * k.hit;
      weapon.position.z += 0.1 * k.wind + 0.15 * k.up + 0.08 * k.fall + 0.12 * k.hit;
      weapon.quaternion
        .multiply(Q_SLAM.setFromAxisAngle(AXIS_X, (28 * k.wind + 38 * k.up + 15 * k.fall + 22 * k.hit) * DEG))
        .multiply(Q_SLAM.setFromAxisAngle(AXIS_Z, (-8 * k.wind - 12 * k.up) * DEG));
    }
    if (shield) {
      const off = shield === h.offPivot;
      const side = off ? -1 : 1;
      const lerpTo = (w: number, x: number, y: number, z: number, yaw: number, tilt: number, scale: number): void => {
        if (w <= 0) return;
        V_SLAM.set(side * x, y, z);
        shield.position.lerp(V_SLAM, w);
        shield.quaternion.slerp(Q_SLAM.setFromAxisAngle(AXIS_Y, side * yaw).multiply(Q.setFromAxisAngle(AXIS_X, tilt * DEG)), w);
        shield.scale.multiplyScalar(1 + (scale - 1) * w);
      };
      lerpTo(k.wind, 0.3, -0.3, -0.82, SHIELD_GUARD_YAW, 8, 0.9);
      lerpTo(k.up, 0.46, -0.46, -0.85, 0.3, -6, 0.9);
      lerpTo(k.fall, 0.08, -0.24, -0.7, 0.1, -45, 1.1);
      lerpTo(k.hit, 0, -0.38 - 0.06 * bump, -0.74 + 0.04 * bump, 0, -62, 1.15 + 0.1 * bump);
    }
  }
}
