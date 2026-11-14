import * as THREE from 'three';
import { BLOCKS, type ItemDef } from '@solrift/shared';
import type { HandFrame, HeldKit, HeldView } from './view';

/** The plain ways of holding things: a block, a tool, a shield, and anything that is just its picture. */

/** A block: a little cube, turned so three faces show. */
export function cubeView(item: ItemDef, kit: HeldKit): HeldView {
  const group = new THREE.Group();
  group.add(kit.models.cube(BLOCKS[item.block!]));
  group.scale.setScalar(0.3);
  group.rotation.set(0.15, 0.6, 0);
  group.position.set(0, 0.02, 0);
  return { object: group };
}

/** Anything with no way of its own: its picture, small, in the corner. */
export function plainView(item: ItemDef, kit: HeldKit): HeldView {
  const group = new THREE.Group();
  group.add(kit.models.sprite(item.tile));
  group.rotation.set(0.05, 0.3, 0);
  group.scale.setScalar(0.4);
  return { object: group, rest: new THREE.Vector3(0.66, -0.32, -0.75) };
}

/**
 * A pickaxe, an axe, a shovel, a hoe: big, the grip below the bottom edge and the tip running off the right side. The picture is
 * shifted so that the lower middle of it is the origin: the swing turns round the hand, the tip drives forward and the hilt stays in view.
 * It also turns from its resting diagonal to upright as it pitches forward, so the tip (not the hilt) leads the strike.
 */
export function toolView(item: ItemDef, kit: HeldKit): HeldView {
  const group = new THREE.Group();
  const sprite = kit.models.sprite(item.tile);
  group.add(sprite);
  sprite.position.set(0.1, 0.1, 0);
  group.scale.setScalar(0.57);
  const restZ = 0.2;
  const swingZ = 1.15;
  group.rotation.set(0, 0.45, restZ);
  return {
    object: group,
    rest: new THREE.Vector3(0.6, -0.35, -0.82),
    pose(f: HandFrame): void {
      group.rotation.z = restZ + f.root * swingZ;
    },
  };
}

/** Where a shield in the main hand rests: low in the corner, a bit of it cut off by the edge of the view (see `guard.ts` for the rest). */
export const SHIELD_REST_MAIN = new THREE.Vector3(0.7, -0.42, -0.9);

export function shieldView(item: ItemDef, kit: HeldKit): HeldView {
  const group = new THREE.Group();
  group.add(kit.models.sprite(item.tile));
  group.scale.setScalar(0.48);
  group.rotation.set(0.05, 0, 0);
  return { object: group, rest: SHIELD_REST_MAIN.clone(), shield: true };
}

/** The orb rests in the palm, a little glowing ball that drifts. In the off hand it is drawn bigger than the others and sunk like the wand in the other hand, so only its top part shows. */
export function orbView(item: ItemDef, kit: HeldKit): HeldView {
  const group = new THREE.Group();
  group.add(kit.models.sprite(item.tile));
  group.scale.setScalar(0.45);
  group.rotation.set(0, 0.3, 0);
  return { object: group, rest: new THREE.Vector3(0.62, -0.3, -0.75), float: true, off: { scale: 0.36, at: [0.05, -0.125, 0], lean: 0 } };
}
