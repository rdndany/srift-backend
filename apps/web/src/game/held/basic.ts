import * as THREE from 'three';
import { BLOCKS, tileIndex, type ItemDef } from '@solrift/shared';
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

/**
 * How a held thing sits in the off hand: bigger than a floating orb and sunk so its lower end is below the bottom edge of the view
 * (the off hand rests low in the corner, and with free space under the item it would look like it hangs in the air).
 */
export const OFF_HELD = { scale: 0.5, at: [0, -0.12, 0] as [number, number, number], lean: -0.15 };

/** The same for a picture that runs corner to corner (a dagger): sunk further, so its hilt leaves by the bottom-left corner. */
export const OFF_HELD_DIAGONAL = { scale: 0.55, at: [-0.02, -0.2, 0] as [number, number, number], lean: -0.15 };
/** A torch: its picture, and a flame on the tip that shows from the front and from the side. */
export function torchView(item: ItemDef, kit: HeldKit): HeldView {
  const group = new THREE.Group();
  group.add(kit.models.sprite(item.tile));
  group.add(kit.models.torchFlame());
  // The same hold as the off hand, mirrored: the handle runs down out of the fist and the flame stays up.
  group.rotation.set(0.05, 0.45, -OFF_HELD.lean);
  group.position.set(0, OFF_HELD.at[1], 0);
  group.scale.setScalar(OFF_HELD.scale);
  return { object: group, rest: new THREE.Vector3(0.66, -0.32, -0.75), off: OFF_HELD };
}

/** Anything with no way of its own: its picture, small, in the corner. */
export function plainView(item: ItemDef, kit: HeldKit): HeldView {
  const group = new THREE.Group();
  group.add(kit.models.sprite(item.tile));
  group.rotation.set(0.05, 0.3, 0);
  group.scale.setScalar(0.4);
  return { object: group, rest: new THREE.Vector3(0.66, -0.32, -0.75), off: OFF_HELD_DIAGONAL };
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

/** Whether the line is out (set from the session each frame): the rod in the hand is drawn without its dangling line then. */
export const rodLine = { out: false };

/**
 * A fishing rod, held like a tool, the tip leaning out ahead. While the line is out the rod's picture has no line of its own
 * (the real one is drawn from the tip to the float: see `bobbers.ts`).
 */
export function rodView(item: ItemDef, kit: HeldKit): HeldView {
  const group = new THREE.Group();
  const idle = kit.models.sprite(item.tile);
  const cast = kit.models.sprite(tileIndex('fishing_rod_cast'));
  for (const s of [idle, cast]) {
    s.position.set(0.1, 0.1, 0);
    group.add(s);
  }
  group.scale.setScalar(0.5);
  const restZ = 0.5;
  group.rotation.set(0, 0.8, restZ);
  return {
    object: group,
    rest: new THREE.Vector3(0.5, -0.38, -0.8),
    pose(f: HandFrame): void {
      group.rotation.z = restZ + f.root * 0.9;
      idle.visible = !rodLine.out;
      cast.visible = rodLine.out;
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
