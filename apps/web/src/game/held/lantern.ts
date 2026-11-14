import * as THREE from 'three';
import type { ItemDef } from '@solrift/shared';
import { ARM_SCALE } from './bareHand';
import { AXIS_X, AXIS_Y, DEG, type HandFrame, type HeldBuilder, type HeldKit, type HeldView } from './view';

/**
 * A lantern is carried by its ring: the hand closes on the top of the ring and the lantern hangs under it, swaying.
 * It is the block's own model, this many view units to a block.
 */
const LANTERN_SCALE = 0.6;
/** Which way the arm runs back from the hand: toward the viewer, a little up and right (the arm is held out forward, and it comes in from the top right corner). */
const LANTERN_ARM_DIR = new THREE.Vector3(0.28, 0.2, 0.94).normalize();
const LANTERN_REST = new THREE.Vector3(0.47, -0.06, -0.8);
/** How thick the arm is: the same as the empty hand's. */
const LANTERN_ARM_SIZE = ARM_SCALE;
/** The arm is longer than the empty hand's, so it always runs out of the view in the corner (never a hand floating in mid air). */
const LANTERN_ARM_LONG = 2.6;

const Q = new THREE.Quaternion();

/** The lanterns of one hand share a clock, so that the sway carries on when one is swapped for another. */
export function lanternBuilder(): HeldBuilder {
  const clock = { t: 0 };
  return (item: ItemDef, kit: HeldKit): HeldView => {
    // The arm (the character's own) reaches in from the right and closes on the ring; the lantern hangs below on a sway.
    const group = new THREE.Group();
    group.scale.setScalar(LANTERN_SCALE);
    const sway = new THREE.Group();
    // The real lantern, as the block is drawn (the same boxes and pictures), the ring at the hand.
    sway.add(kit.models.lanternMesh(item.block!));
    group.add(sway);
    const arm = kit.makeChar().armR;
    arm.position.set(0, 0, 0);
    arm.rotation.set(0, 0, 0);
    const wrap = new THREE.Group();
    wrap.quaternion.setFromUnitVectors(AXIS_Y, LANTERN_ARM_DIR);
    // The arm is as thick as the empty hand's, whatever the size of the lantern.
    const k = LANTERN_ARM_SIZE / LANTERN_SCALE;
    wrap.scale.set(k, k * LANTERN_ARM_LONG, k);
    wrap.position.copy(LANTERN_ARM_DIR).multiplyScalar(0.75 * k * LANTERN_ARM_LONG - 0.06);
    wrap.position.y += 0.13;
    wrap.add(arm);
    group.add(wrap);
    // Turned back against the base yaw of the hand, so the lantern faces the viewer (a little turned, for its depth).
    group.rotation.y = 0.62;
    return {
      object: group,
      rest: LANTERN_REST.clone(),
      /**
       * It hangs from the hand: it sways with the walk, and stays hanging down as the hand swings forward. The attack keeps the arm
       * where it is (it runs out of the view in the corner): the hand only pushes forward and dips a little, the lantern swinging on
       * its ring. The wide arc of the other items would drag the hand into the middle of the view, floating.
       */
      pose(f: HandFrame): void {
        f.pivot.position.set(f.rest.x + f.bx - f.root * 0.05, f.rest.y - f.by - f.down - f.root * 0.05, f.rest.z - f.lin * 0.14);
        f.pivot.quaternion.setFromAxisAngle(AXIS_Y, f.baseYaw - f.sq * 6 * DEG).multiply(Q.setFromAxisAngle(AXIS_X, -f.root * 10 * DEG));
        clock.t += f.dt;
        sway.rotation.z = Math.sin(clock.t * 2.1) * 0.05 + Math.sin(f.bobPhase) * 0.1 * f.bobAmp;
        sway.rotation.x = Math.sin(clock.t * 1.6 + 1) * 0.035 + f.root * 1.2;
      },
    };
  };
}
