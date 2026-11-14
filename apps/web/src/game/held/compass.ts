import * as THREE from 'three';
import { COMPASS_FRAMES, compassTileName, tileIndex, type ItemDef } from '@solrift/shared';
import type { ItemModels } from './models';
import type { HeldKit, HeldView } from './view';

/** The compass: held up in the open palm, its face turned to the player. The needle is part of the picture, one picture for each way it can point. */
export class CompassView implements HeldView {
  readonly object = new THREE.Group();
  readonly rest = new THREE.Vector3(0.3, -0.16, -0.72);
  private mesh: THREE.Mesh;
  private frame = 0;
  private readonly frames = new Map<number, THREE.Mesh>();
  private readonly models: ItemModels;

  constructor(item: ItemDef, kit: HeldKit) {
    this.models = kit.models;
    this.mesh = kit.models.sprite(item.tile);
    this.frames.set(0, this.mesh);
    this.object.add(this.mesh);
    this.object.scale.setScalar(0.5);
    this.object.rotation.set(-0.35, -0.2, 0.04);
  }

  /** Turn the needle to one of its pictures (0 = straight ahead, clockwise). */
  setNeedle(frame: number): void {
    const f = ((Math.round(frame) % COMPASS_FRAMES) + COMPASS_FRAMES) % COMPASS_FRAMES;
    if (f === this.frame) return;
    let next = this.frames.get(f);
    if (!next) {
      next = this.models.sprite(tileIndex(compassTileName(f)));
      this.frames.set(f, next);
    }
    next.position.copy(this.mesh.position);
    this.object.remove(this.mesh);
    this.object.add(next);
    this.mesh = next;
    this.frame = f;
  }
}
