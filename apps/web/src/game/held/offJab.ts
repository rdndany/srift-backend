import * as THREE from 'three';
import { AXIS_X, AXIS_Y, AXIS_Z, DEG } from './view';
import { POSE, sampleSwing, type Key } from './swings';

/**
 * The dagger of the ranger, in the left hand. A bow takes both hands, so the dagger is out of sight until it is needed: it comes up
 * from below the view when the bow is put away, the left hand pulls back a little and drives the blade in toward the middle of the view,
 * and the dagger goes down again when the bow comes back. All of it is laid on top of wherever the off hand rests (see `ShieldMoves.pose`).
 * The stab has the keyframes of a swing (see swings.ts): x, y, z (camera space), yaw, roll, pitch (degrees; pitch negative = tip forward),
 * and the last number is how much bigger the dagger gets (the one in the off hand is held small).
 */
const STAB: Key[] = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0.24, -0.04, -0.06, 0.18, 10, -8, 16, 0.1],
  [0.46, 0.4, 0.36, -0.3, -34, 8, -62, 0.8, 'out'],
  [0.62, 0.42, 0.37, -0.32, -36, 8, -66, 0.85],
  [1, 0, 0, 0, 0, 0, 0, 0],
];
/** How long a stab takes (seconds), and how far into it the next may start. */
const DURATION = 0.24;
const AGAIN = 0.7;
/** How far below its place the dagger waits (camera space). */
const BELOW = 0.7;

const Q = new THREE.Quaternion();

export class OffJab {
  /** 0..1 while stabbing, 1 = at rest. */
  private t = 1;
  /** 0 = out of sight below the view, 1 = up in the hand (eased). */
  private out = 1;
  private hidden = false;
  /** Held at one moment of it, for looking at the pose (null lets it play). */
  frozen: number | null = null;

  /** The dagger is up in the hand, ready to stab. */
  get ready(): boolean {
    return this.out > 0.9;
  }

  /** Start a stab (a new one waits until the last is nearly home, or until it is all the way home when idle). Returns whether one started. */
  start(idle = false): boolean {
    if (!this.ready || this.t < (idle ? 1 : AGAIN)) return false;
    this.t = 0;
    return true;
  }

  /** Move on by a frame and lay the dagger on the off-hand pivot: `want` brings it up into the hand (false: it goes down out of sight), `on` is whether there is something there that stabs. */
  apply(dt: number, pivot: THREE.Object3D, want: boolean, on: boolean): void {
    this.out += ((want ? 1 : 0) - this.out) * Math.min(1, dt * (want ? 16 : 13));
    if (this.out > 0.995) this.out = 1;
    else if (this.out < 0.01) this.out = 0;
    // (the pivot is only touched while the dagger is away or has just come back: the map and the shield have their own say about it)
    if (this.out === 0) {
      pivot.visible = false;
      this.hidden = true;
    } else if (this.hidden) {
      pivot.visible = true;
      this.hidden = false;
    }
    pivot.position.y -= (1 - this.out) * BELOW;
    this.t = Math.min(1, this.t + dt / DURATION);
    if (!on || this.out < 1) {
      if (!on || !want) this.t = 1;
      return;
    }
    const s = this.frozen ?? this.t;
    if (s >= 1) return;
    sampleSwing(STAB, s);
    pivot.position.x += POSE[0];
    pivot.position.y += POSE[1];
    pivot.position.z += POSE[2];
    // (the dagger of the off hand is held small: it grows as it is driven in, so that the blow is as big as the one of a dagger in the main hand)
    pivot.scale.multiplyScalar(1 + POSE[6]);
    pivot.quaternion
      .multiply(Q.setFromAxisAngle(AXIS_Y, POSE[3] * DEG))
      .multiply(Q.setFromAxisAngle(AXIS_Z, POSE[4] * DEG))
      .multiply(Q.setFromAxisAngle(AXIS_X, POSE[5] * DEG));
  }
}
