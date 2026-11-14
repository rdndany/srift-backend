import * as THREE from 'three';
import type { ItemDef } from '@solrift/shared';
import type { Character } from '../character';
import type { ItemModels } from './models';
import type { SwingStyle } from './swings';

/**
 * How an item is held in the first-person hand. Every kind of item has a file here that makes a `HeldView` for it: the model,
 * where it rests, and (if it moves in a way of its own) a `pose` that is called every frame. `HeldItem` runs whichever view is
 * in the hand, and `kinds.ts` says which item gets which view.
 *
 * To give a new item a way of its own: write a file like `lantern.ts` and add a line for it in `kinds.ts`.
 */

export const AXIS_X = new THREE.Vector3(1, 0, 0);
export const AXIS_Y = new THREE.Vector3(0, 1, 0);
export const AXIS_Z = new THREE.Vector3(0, 0, 1);
export const DEG = Math.PI / 180;
/** Where the grip of an item rests (camera space) unless its view says otherwise. */
export const REST_DEFAULT = new THREE.Vector3(0.55, -0.42, -0.75);

/** What a view is built with. */
export interface HeldKit {
  readonly models: ItemModels;
  /** The hand's own scene (camera space): for parts that are not carried by the hand, like an arrow that flies off. */
  readonly scene: THREE.Scene;
  /** A character for its arm, dressed like the player and lit like the hand. */
  makeChar(): Character;
}

/** One frame of the hand, as a view's `pose` sees it. The plain pose (the classic swing arc) is already on `pivot`. */
export interface HandFrame {
  dt: number;
  aspect: number;
  /** The hand's pivot (the grip): `pose` moves this. */
  pivot: THREE.Group;
  /** Where this item rests, and the turn of the hand at rest. */
  rest: THREE.Vector3;
  baseYaw: number;
  /** The swing, 0..1 (1 = none), which of the item's swings it is, and the plain arcs of it. */
  s: number;
  variant: number;
  root: number;
  sq: number;
  lin: number;
  lift: number;
  /** The walk: the bob of the hand sideways and down, and its phase and size. */
  bx: number;
  by: number;
  bobPhase: number;
  bobAmp: number;
  /** How far the hand is lowered for a change of item. */
  down: number;
  /** The item is on its way out (or the next one on its way in). */
  switching: boolean;
  /** The use button held on a bow, 0..1, and the shake of a full draw. */
  draw: number;
  tremble: number;
  /** A clock that never stops (38 a second), for shakes and drifts. */
  shakeT: number;
  /** The size of the item this frame (1 unless `pose` says otherwise). */
  scale: number;
}

export interface HeldView {
  /** The model, as it sits in the hand's holder. */
  readonly object: THREE.Object3D;
  /** Where its grip rests in camera space (`REST_DEFAULT` if left out). */
  readonly rest?: THREE.Vector3;
  /** A swing of its own, in keyframes (weapons). Without one it swings in the plain arc. */
  readonly swing?: SwingStyle;
  /** A shield: raised to block, bashed with, planted for a slam (see `guard.ts`). */
  readonly shield?: boolean;
  /** It drifts in the off hand, held in the bottom corner (the orb). */
  readonly float?: boolean;
  /** In the off hand (anything but a shield): how big, where, and how far it leans. */
  readonly off?: { scale: number; at?: [number, number, number]; lean: number };
  /** Its own movement, every frame it is in the main hand, after the plain pose. */
  pose?(f: HandFrame): void;
  /** After everything else has moved the hand this frame (a shield raised, a map opened): for parts placed in the scene. */
  late?(f: HandFrame): void;
  /** The use button, as it is held and let go (`prev` is the frame before). */
  drawn?(prev: number, now: number, switching: boolean): void;
  /** It has just been put away. */
  leave?(): void;
  /** Called before a copy of the model is made for a figure: put it in the pose a figure carries it in. */
  forFigure?(): void;
  /** Free what it made outside `object` (the geometry of `object` is freed for it). */
  dispose?(): void;
}

export type HeldBuilder = (item: ItemDef, kit: HeldKit) => HeldView;
