import * as THREE from 'three';
import { AXIS_X, AXIS_Y, AXIS_Z } from './view';

/** Casting the Emberstone: where the stone is held up at the start of the cast (in front of the chest) and where at the end (high in front of the face). */
const FROM = new THREE.Vector3(0.04, -0.2, -0.7);
const TO = new THREE.Vector3(0, 0.1, -0.8);
const Q = new THREE.Quaternion();
const Q_CAST = new THREE.Quaternion();
const AT = new THREE.Vector3();

const smooth = (v: number): number => {
  const k = Math.min(1, Math.max(0, v));
  return k * k * (3 - 2 * k);
};

/**
 * Casting the Emberstone, seen from the caster's own eyes: the stone is lifted from the corner to the middle of the view, tipped to face
 * them, and then held there, floating a little; as the cast builds it climbs higher and starts to shake. It comes down again when the
 * cast ends. (The figure seen from outside does the same: see Character.castPose.)
 */
export class Casting {
  /** How far the stone is up (0..1), and the seconds it has been held. */
  private k = 0;
  private t = 0;

  /** `progress` is how far into the cast the player is (0..1), 0 when not casting. */
  drive(dt: number, progress: number, pivot: THREE.Object3D, baseYaw: number): void {
    const on = progress > 0;
    this.k += ((on ? 1 : 0) - this.k) * Math.min(1, dt * (on ? 6 : 10));
    if (this.k < 0.003) this.k = 0;
    if (on) this.t += dt;
    else if (this.k === 0) this.t = 0;
    if (this.k === 0) return;
    const e = smooth(this.k);
    const rise = smooth(progress);
    // it climbs as the cast builds, floats a little, and shakes more and more near the end
    const shake = progress * progress * 0.006;
    AT.lerpVectors(FROM, TO, rise);
    AT.y += Math.sin(this.t * 2.2) * 0.012;
    AT.x += Math.sin(this.t * 41) * shake;
    AT.y += Math.cos(this.t * 33) * shake;
    pivot.position.lerp(AT, e);
    Q_CAST.setFromAxisAngle(AXIS_Y, baseYaw * 0.3)
      .multiply(Q.setFromAxisAngle(AXIS_X, -0.45 - 0.2 * rise))
      .multiply(Q.setFromAxisAngle(AXIS_Z, Math.sin(this.t * 1.7) * 0.05));
    pivot.quaternion.slerp(Q_CAST, e);
  }
}
