import * as THREE from 'three';
import { AXIS_X, AXIS_Y, AXIS_Z } from './view';

/** Eating: where the food is held (under the face, a little to the right), how far it tilts toward the mouth, and the bites a second. */
const EAT_AT = new THREE.Vector3(0.05, -0.07, -0.74);
const EAT_TILT = -0.35;
const CHEWS_PER_SECOND = 4;
const Q = new THREE.Quaternion();
const Q_EAT = new THREE.Quaternion();

/**
 * Eating, as in Minecraft: the food comes up from the corner to the middle of the view, under the face, tilted toward the mouth, and then
 * bobs with every bite (quick little dips, a touch of side to side), the whole of it easing in and out.
 */
export class Eating {
  /** How far the food is up (0..1), and the seconds of chewing. */
  private k = 0;
  private t = 0;

  drive(dt: number, on: boolean, pivot: THREE.Object3D, baseYaw: number): void {
    this.k += ((on ? 1 : 0) - this.k) * Math.min(1, dt * (on ? 11 : 9));
    if (this.k < 0.003) this.k = 0;
    if (on) this.t += dt;
    else if (this.k === 0) this.t = 0;
    if (this.k === 0) return;
    const e = this.k * this.k * (3 - 2 * this.k);
    // The chewing builds up once the food has arrived.
    const ch = Math.min(1, this.t / 0.35);
    const bite = Math.abs(Math.sin(this.t * Math.PI * CHEWS_PER_SECOND));
    const sway = Math.sin(this.t * Math.PI * CHEWS_PER_SECOND * 0.5);
    pivot.position.lerp(EAT_AT, e);
    pivot.position.y += (bite * 0.045 - 0.012) * ch * e;
    pivot.position.x += sway * 0.012 * ch * e;
    pivot.position.z += bite * 0.03 * ch * e;
    Q_EAT.setFromAxisAngle(AXIS_Y, baseYaw * 0.3).multiply(Q.setFromAxisAngle(AXIS_X, EAT_TILT + bite * 0.1 * ch)).multiply(Q.setFromAxisAngle(AXIS_Z, sway * 0.05 * ch));
    pivot.quaternion.slerp(Q_EAT, e);
  }
}
