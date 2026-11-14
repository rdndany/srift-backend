import * as THREE from 'three';
import type { Character } from '../character';
import { AXIS_X, AXIS_Y, AXIS_Z, DEG, type HandFrame } from './view';

/** The empty hand: the character's own arm, scaled down, from the shoulder out of the view in the corner, so only its end shows. */
export const ARM_SCALE = 0.55;
const ARM_TILT = 0.4;
const HAND_AT = new THREE.Vector3(0.63, -0.57, -0.67);

const Q = new THREE.Quaternion();

/**
 * The arm of `char` (the same skin, sleeve and armor as in third person), laid forward from the shoulder: the arm hangs down in the
 * character's own space, so turning it a quarter round the side makes it point away from the camera.
 */
export function bareArm(char: Character): THREE.Group {
  const arm = new THREE.Group();
  char.armR.position.set(0, 0, 0);
  char.armR.rotation.set(0, 0, 0);
  arm.rotation.x = Math.PI / 2;
  arm.scale.setScalar(ARM_SCALE);
  arm.add(char.armR);
  return arm;
}

/**
 * The empty hand, moving like Minecraft's: the arm rests low in the corner, angled in toward the middle with only the hand showing, and a
 * swing sends it across, forward, and brings it back. The pivot is the shoulder.
 */
export function poseBareHand(f: HandFrame): void {
  const s = f.s;
  const r = s < 1 ? Math.sqrt(s) : 0;
  const across = s < 1 ? Math.sin(r * Math.PI) : 0;
  const punch = s < 1 ? Math.sin(s * Math.PI) : 0;
  const bend = s < 1 ? Math.sin(s * s * Math.PI) : 0;
  f.pivot.position.set(HAND_AT.x - across * 0.1 + f.bx, HAND_AT.y - f.by - f.down + across * 0.12, HAND_AT.z - punch * 0.12);
  f.pivot.quaternion
    .setFromAxisAngle(AXIS_Y, (25 + across * 45) * DEG)
    .multiply(Q.setFromAxisAngle(AXIS_Z, -bend * 18 * DEG))
    .multiply(Q.setFromAxisAngle(AXIS_X, ARM_TILT + punch * 0.4));
}
