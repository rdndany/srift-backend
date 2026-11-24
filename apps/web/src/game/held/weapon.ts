import * as THREE from 'three';
import { HK, I, type ItemDef } from '@solrift/shared';
import { POSE, SWING_STYLES, sampleSwing } from './swings';
import { AXIS_X, AXIS_Y, AXIS_Z, DEG, type HandFrame, type HeldKit, type HeldView } from './view';

/**
 * Swords and the class weapons: held by the grip like a tool, each with a swing of its own (`swings.ts`) that turns it round the hand.
 */

type WeaponKind = 'sword' | 'heavy' | 'dagger' | 'staff' | 'cast';

interface WeaponLook {
  /** Pixels the blade is drawn longer by in the hand than in its icon. */
  longer: number;
  /** Where the picture sits on the grip, and how big it is (a staff is thin and stretched up: a staff, not a club). */
  at: [number, number];
  scale: [number, number, number];
  /** The lean of the picture at rest (radians). */
  restZ: number;
  rest: [number, number, number];
  /** It comes in from the bottom right corner: the corner moves out with a wider window, and the weapon with it. */
  corner: boolean;
}

const LOOKS: Record<WeaponKind, WeaponLook> = {
  // A blade comes in from the bottom right corner: big, the grip below the edge of the view and the tip up toward the top right.
  sword: { longer: 3, at: [0.1, 0.1], scale: [0.54, 0.54, 0.54], restZ: 0.4, rest: [0.62, -0.46, -0.84], corner: true },
  heavy: { longer: 4, at: [0.1, 0.1], scale: [0.6, 0.6, 0.6], restZ: 0.4, rest: [0.62, -0.46, -0.84], corner: true },
  dagger: { longer: 0, at: [0.1, 0.1], scale: [0.6, 0.6, 0.6], restZ: 0.2, rest: [0.58, -0.3, -0.84], corner: false },
  // The staff is drawn upright and tall: the grip (low on the picture) is at the hand and the orb stands up above it.
  staff: { longer: 0, at: [0, 0.3], scale: [0.42, 0.9, 0.42], restZ: -0.55, rest: [0.5, -0.52, -0.85], corner: false },
  cast: { longer: 0, at: [0.1, 0.1], scale: [0.6, 0.6, 0.6], restZ: 0.2, rest: [0.58, -0.3, -0.84], corner: false },
};

/** Which weapon an item is held as (null: not one). */
export function weaponKind(item: ItemDef): WeaponKind | null {
  if (item.tool?.kind === 'sword') return 'sword';
  if (item.id === I.GREATSWORD || item.id === HK.BLADE) return 'heavy';
  if (item.id === I.DAGGER) return 'dagger';
  if (item.id === I.STAFF || item.id === HK.STAFF) return 'staff';
  if (item.id === I.WAND) return 'cast';
  return null;
}

const Q = new THREE.Quaternion();

export function weaponView(item: ItemDef, kind: WeaponKind, kit: HeldKit): HeldView {
  const look = LOOKS[kind];
  const style = SWING_STYLES[kind];
  const group = new THREE.Group();
  const sprite = kit.models.sprite(item.tile, look.longer);
  group.add(sprite);
  sprite.position.set(look.at[0], look.at[1], 0);
  group.scale.set(...look.scale);
  group.rotation.set(0, 0.45, look.restZ);
  return {
    object: group,
    rest: new THREE.Vector3(...look.rest),
    swing: style,
    // In the off hand the hilt leaves the view through the bottom corner, so the dagger is held and does not hang in the air.
    ...(kind === 'dagger' ? { off: { scale: 0.5, at: [-0.02, -0.1, 0] as [number, number, number], lean: -0.15 } } : {}),
    /** Wind up, strike, follow through, settle: the keyframes of the swing, in place of the plain arc. */
    pose(f: HandFrame): void {
      const keys = style.variants[f.variant % style.variants.length];
      sampleSwing(keys, f.s < 1 ? f.s : 0);
      f.pivot.position.set(
        f.rest.x + f.bx - f.draw * 0.12 + f.tremble + POSE[0],
        f.rest.y - f.by - f.down + f.draw * 0.03 + POSE[1],
        f.rest.z + f.draw * 0.06 + POSE[2],
      );
      f.pivot.quaternion
        .setFromAxisAngle(AXIS_Y, f.baseYaw + f.draw * 0.35 + POSE[3] * DEG)
        .multiply(Q.setFromAxisAngle(AXIS_Z, POSE[4] * DEG))
        .multiply(Q.setFromAxisAngle(AXIS_X, POSE[5] * DEG));
      group.rotation.z = look.restZ + POSE[6] * DEG;
      if (look.corner) f.pivot.position.x += 0.6 * (f.aspect - 16 / 9);
    },
  };
}
