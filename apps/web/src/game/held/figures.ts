import * as THREE from 'three';
import { BLOCKS, I, getItem, lanternInfo } from '@solrift/shared';
import { mageProp } from '../mageGear';
import { FIGURE_AIM } from './aim';
import type { HeldViews } from './kinds';
import type { ItemModels } from './models';

/**
 * Items as they are seen outside the first-person hand: in the hand of a blocky figure, on its shield arm, and lying on the ground.
 * Every call makes a new object (a node can have only one parent) that shares geometry and materials with the first-person copy,
 * so nothing here needs disposing by the caller.
 */
export class ItemFigures {
  private readonly lanterns = new Map<number, THREE.Object3D>();
  private readonly drops = new Map<number, THREE.Object3D>();

  constructor(
    private readonly models: ItemModels,
    private readonly views: HeldViews,
  ) {}

  /** The item as a figure holds it in its right hand (grip at the origin, blade pointing forward). */
  figureModel(id: number): THREE.Object3D | null {
    if (id === 0) return null;
    // The Mage's staff, wand and orb are real little models of blocks in a figure's hand (the first-person hand keeps the pictures).
    if (id === I.STAFF) return mageProp('staff');
    if (id === I.WAND) return mageProp('wand');
    if (id === I.ORB) return mageProp('orb');
    if (lanternInfo(id)) {
      let model = this.lanterns.get(id);
      if (!model) {
        // A real little 3D lantern: it hangs from the hand, a little in front of the palm.
        model = new THREE.Group();
        model.add(this.models.lanternMesh(id));
        model.scale.setScalar(0.62);
        model.position.set(0, 0, -0.05);
        this.lanterns.set(id, model);
      }
      return model.clone();
    }
    const view = this.views.get(id);
    // (a bow hangs relaxed and a crossbow is cocked, whatever the first-person one is doing just now)
    view.forFigure?.();
    const inner = view.object.clone();
    inner.position.set(0, 0, 0);
    inner.rotation.set(0, 0, 0);
    inner.scale.setScalar(1);
    const item = getItem(id);
    if ((item.use === 'bow' || item.use === 'crossbow') && view.rigFigure) {
      // A bow and a crossbow are held the way they are shot (see `FIGURE_AIM`), the grip of the picture in the hand, with a string that can be drawn.
      const spec = item.use === 'bow' ? FIGURE_AIM.bow : FIGURE_AIM.crossbow;
      inner.rotation.z = spec.roll;
      const aim = new THREE.Group();
      aim.add(inner);
      aim.quaternion.copy(spec.q);
      aim.scale.setScalar(spec.scale);
      aim.updateMatrixWorld(true);
      aim.position.sub(inner.localToWorld(new THREE.Vector3(spec.grip[0], spec.grip[1], 0)));
      const holder = new THREE.Group();
      holder.add(aim);
      holder.userData.rig = view.rigFigure(inner);
      return holder;
    }
    // Class weapons are centred for the figure's hand (only the first-person copy is held by the grip).
    if (view.swing && !item.tool) inner.children[0]?.position.set(0, 0, 0);
    const cube = item.block !== null && BLOCKS[item.block].shape === 'cube';
    const wrap = new THREE.Group();
    wrap.add(inner);
    if (cube) {
      wrap.scale.setScalar(0.3);
      wrap.rotation.set(0, Math.PI / 4, 0);
      wrap.position.set(0, 0.02, -0.12);
    } else {
      // The sprite turns so its right edge points forward: the tip of a tool leads, up and ahead.
      wrap.scale.setScalar(item.tool ? 0.8 : 0.55);
      wrap.rotation.set(0, Math.PI / 2, 0);
      if (!item.tool) wrap.position.set(0, 0.12, -0.05);
    }
    const holder = new THREE.Group();
    holder.add(wrap);
    return holder;
  }

  /** A shield as the figure carries it on the left arm: facing -z, upright, centred on the origin. */
  figureShield(id: number): THREE.Object3D | null {
    if (!id) return null;
    const inner = this.views.get(id).object.clone();
    inner.position.set(0, 0, 0);
    inner.rotation.set(0, 0, 0);
    inner.scale.setScalar(0.78);
    const wrap = new THREE.Group();
    wrap.add(inner);
    return wrap;
  }

  /**
   * The item as it lies and spins on the ground, a real little solid like the ones in the hand: a block is a small cube with its own faces,
   * a lantern the lantern itself, anything else its picture built up in pixels. Centred on the origin, about a third of a block across.
   * The caller clones the materials to light it.
   */
  dropModel(id: number): THREE.Object3D | null {
    if (id === 0) return null;
    let src = this.drops.get(id);
    if (!src) {
      const item = getItem(id);
      src = new THREE.Group();
      if (item.block !== null && BLOCKS[item.block].shape === 'cube') {
        src.add(this.models.cube(BLOCKS[item.block]));
        src.scale.setScalar(0.3);
      } else if (item.block !== null && lanternInfo(item.block)) {
        const lantern = this.models.lanternMesh(item.block);
        lantern.position.y = 0.18;
        src.add(lantern);
        src.scale.setScalar(0.62);
      } else {
        src.add(this.models.sprite(item.tile));
        // Thicker than it is in the hand, so that the edge shows as it turns.
        src.scale.set(0.5, 0.5, 0.8);
      }
      this.drops.set(id, src);
    }
    return src.clone();
  }

  dispose(): void {
    for (const obj of this.drops.values()) {
      obj.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    }
    this.drops.clear();
  }
}
