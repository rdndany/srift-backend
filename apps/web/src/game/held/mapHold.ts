import * as THREE from 'three';
import type { Character } from '../character';
import { MapModel, type MapSheet } from '../heldMap';
import type { HeldKit, HeldView } from './view';

/** The map held open: in front of the face, tipped back a little, this many times the size it has in one hand. */
const MAP_UP_AT = new THREE.Vector3(0, 0.0, -0.76);
const MAP_UP_TURN = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.26, 0, 0));
const MAP_UP_SCALE = 1.7;

/**
 * The map item in the hands: one model for each hand (a model has only one place to be, see `MapModel`), the picture they share, and
 * bringing it up in both hands to read it.
 */
export class MapHold {
  /** The map as the main hand and as the off hand hold it (null until there is a sheet). */
  main: HeldView | null = null;
  off: HeldView | null = null;
  private mainModel: MapModel | null = null;
  private offModel: MapModel | null = null;
  private chars: Character[] = [];
  /** Asked to be open, and how far it is (0..1). */
  private up = false;
  private k = 0;

  constructor(
    private readonly kit: HeldKit,
    /** A character made for the map is done with. */
    private readonly retire: (c: Character) => void,
  ) {}

  /** The sheet is shared by the two models. */
  setSheet(sheet: MapSheet): void {
    this.mainModel?.dispose();
    this.offModel?.dispose();
    for (const ch of this.chars) this.retire(ch);
    this.chars = [this.kit.makeChar(), this.kit.makeChar()];
    const flat = (): THREE.MeshBasicMaterial => this.kit.models.flat();
    this.mainModel = new MapModel(sheet.texture, { left: this.chars[0].armL, right: this.chars[0].armR }, flat, 'right');
    this.offModel = new MapModel(sheet.texture, { left: this.chars[1].armL, right: this.chars[1].armR }, flat, 'left');
    this.main = { object: this.mainModel.group, rest: new THREE.Vector3(0.44, -0.22, -0.8) };
    this.off = { object: this.offModel.group };
  }

  /** The map in the hand is open (brought up in both hands) or put down. The one in the off hand is only carried. */
  setUp(up: boolean): void {
    this.up = up;
  }

  /**
   * Bring the map up in both hands, big and in front of the face, or let it down: and lower what is in the off hand to make room.
   * `reading` is whether the map is the item in the main hand (and not on its way out).
   */
  apply(dt: number, reading: boolean, pivot: THREE.Object3D, offPivot: THREE.Object3D, shakeT: number): void {
    const want = this.up && reading ? 1 : 0;
    this.k = reading ? this.k + (want - this.k) * Math.min(1, dt * 9) : 0;
    if (Math.abs(want - this.k) < 0.004) this.k = want;
    const e = this.k * this.k * (3 - 2 * this.k);
    this.mainModel?.pose(reading ? e : 0);
    this.offModel?.pose(0);
    pivot.visible = true;
    offPivot.visible = true;
    if (!reading) return;
    if (e > 0) {
      pivot.position.lerp(MAP_UP_AT, e);
      pivot.position.y += Math.sin(shakeT * 0.04) * 0.004 * e;
      pivot.quaternion.slerp(MAP_UP_TURN, e);
      pivot.scale.setScalar(1 + (MAP_UP_SCALE - 1) * e);
      offPivot.position.y -= 0.9 * e;
      offPivot.visible = e < 0.97;
    }
  }

  dispose(): void {
    this.mainModel?.dispose();
    this.offModel?.dispose();
  }
}
