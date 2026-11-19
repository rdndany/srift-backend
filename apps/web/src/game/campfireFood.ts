import * as THREE from 'three';
import { campfireInfo, type CampfireFoodView } from '@solrift/shared';
import type { EntityLight } from './entityLight';

/**
 * The food sitting on campfires. Each piece is the same little model as a dropped item, laid flat on the logs.
 * Four places, turned with the way the campfire faces.
 */
export class CampfireFood {
  readonly group = new THREE.Group();
  private readonly shown = new Map<string, { id: number; obj: THREE.Object3D; mats: THREE.MeshBasicMaterial[] }>();
  private env: EntityLight | null = null;
  private readonly tmp = new THREE.Color();

  constructor(
    private readonly modelOf: (id: number) => THREE.Object3D | null,
    private readonly blockAt: (x: number, y: number, z: number) => number,
  ) {}

  setEnvironment(env: EntityLight): void {
    this.env = env;
  }

  /** Make the models match the food on these campfires. */
  sync(fires: readonly CampfireFoodView[]): void {
    const live = new Set<string>();
    for (const fire of fires) {
      const facing = campfireInfo(this.blockAt(fire.x, fire.y, fire.z))?.facing ?? 2;
      for (let slot = 0; slot < 4; slot++) {
        const id = fire.slots[slot] ?? 0;
        if (!id) continue;
        const key = `${fire.x},${fire.y},${fire.z},${slot}`;
        live.add(key);
        let piece = this.shown.get(key);
        if (!piece || piece.id !== id) {
          if (piece) this.remove(key, piece);
          const made = this.make(id);
          if (!made) continue;
          piece = made;
          this.shown.set(key, piece);
          this.group.add(piece.obj);
        }
        const spot = place(slot, facing);
        piece.obj.position.set(fire.x + spot.x, fire.y + 0.5, fire.z + spot.z);
        piece.obj.rotation.y = spot.yaw;
        if (this.env) {
          this.env.at(piece.obj.position.x, piece.obj.position.y, piece.obj.position.z, this.tmp);
          this.tmp.setRGB(Math.min(1, Math.max(0.35, this.tmp.r)), Math.min(1, Math.max(0.35, this.tmp.g)), Math.min(1, Math.max(0.35, this.tmp.b)));
        } else this.tmp.setScalar(1);
        for (const m of piece.mats) m.color.copy(this.tmp);
      }
    }
    for (const [key, piece] of this.shown) if (!live.has(key)) this.remove(key, piece);
  }

  dispose(): void {
    for (const [key, piece] of this.shown) this.remove(key, piece);
  }

  private make(id: number): { id: number; obj: THREE.Object3D; mats: THREE.MeshBasicMaterial[] } | null {
    const model = this.modelOf(id);
    if (!model) return null;
    const mats: THREE.MeshBasicMaterial[] = [];
    model.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const own = (o.material as THREE.MeshBasicMaterial).clone();
      o.material = own;
      mats.push(own);
    });
    // The dropped-item picture stands upright. Tip it onto its back so it lies on the logs.
    model.rotation.x = -Math.PI / 2;
    model.scale.multiplyScalar(0.62);
    const holder = new THREE.Group();
    holder.add(model);
    return { id, obj: holder, mats };
  }

  private remove(key: string, piece: { obj: THREE.Object3D; mats: THREE.MeshBasicMaterial[] }): void {
    this.group.remove(piece.obj);
    for (const m of piece.mats) m.dispose();
    this.shown.delete(key);
  }
}

/** One cooking place, in the cell, turned so the four pieces follow the campfire's facing. */
function place(slot: number, facing: number): { x: number; z: number; yaw: number } {
  const spots = [
    [-0.2, -0.2],
    [0.2, -0.2],
    [-0.2, 0.2],
    [0.2, 0.2],
  ];
  let x = spots[slot]?.[0] ?? 0;
  let z = spots[slot]?.[1] ?? 0;
  // The same quarter-turns as the log mesh: facing +z is unturned.
  const turns = [1, 3, 0, 2][facing] ?? 0;
  for (let n = 0; n < turns; n++) {
    const nx = z;
    const nz = -x;
    x = nx;
    z = nz;
  }
  return { x: x + 0.5, z: z + 0.5, yaw: turns * (Math.PI / 2) + slot * (Math.PI / 2) };
}
