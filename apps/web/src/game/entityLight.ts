import * as THREE from 'three';
import { smoothstep } from '@solrift/shared';
import type { Sky } from './sky';
import type { TorchGlow } from './torchGlow';

/**
 * Lighting for everything that is not terrain (mobs, other players, your own body) so they sit in the world the way the
 * blocks do: the colour of the light follows the sky (gold at dusk, silver-blue by the moon), they go dim in caves,
 * glow orange next to torches, and each face is shaded by where the sun or moon is.
 *
 * It costs a handful of arithmetic operations per entity per frame; no extra draw calls and no shader changes.
 */
const TORCH = new THREE.Color(1.0, 0.62, 0.28);
const WHITE = new THREE.Color(1, 1, 1);

// Local face normals of a box: +x -x +y -y +z -z (the order three.js uses for BoxGeometry materials).
const NORMALS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

export class EntityLight {
  /** The colour of the light out in the open, already scaled by how bright it is. */
  readonly base = new THREE.Color(1, 1, 1);
  /** Unit vector towards the sun (or the moon at night). */
  readonly dir = new THREE.Vector3(0, 1, 0);
  /** 0..1: how strongly that light picks out the faces that look at it. */
  share = 0;
  private readonly raw = new THREE.Color();
  private readonly tmp = new THREE.Color();

  constructor(
    private readonly surfaceY: (x: number, z: number) => number,
    private readonly torches: TorchGlow | null = null,
  ) {}

  /** Call once a frame, after the sky has updated. */
  update(sky: Sky): void {
    const L = sky.lighting;
    this.raw.copy(L.ambient).add(this.tmp.copy(L.sun).multiplyScalar(1.2));
    const m = Math.max(this.raw.r, this.raw.g, this.raw.b, 0.001);
    // Keep the hue of the light but wash it half way out, so mobs read as lit, not dyed.
    this.base.copy(this.raw).multiplyScalar(1 / m).lerp(WHITE, 0.45).multiplyScalar(0.5 + 0.5 * sky.brightness);
    this.dir.copy(sky.lightDir);
    this.share = Math.min(1, L.sun.g * 2) * (sky.sunHeight > 0 ? 1 : 0.5);
  }

  /** The light that reaches a body standing at (x, y, z), written into `out`. */
  at(x: number, y: number, z: number, out: THREE.Color): THREE.Color {
    const sy = this.surfaceY(Math.floor(x), Math.floor(z));
    let open = 1;
    if (sy >= 0) {
      // How far under the open sky: under a roof or in a cave the daylight is mostly gone.
      const depth = sy - (y + 1.8);
      open = 1 - 0.72 * smoothstep(0.5, 10, depth);
    }
    out.copy(this.base).multiplyScalar(open);
    const t = this.torches ? this.torches.lightAt(x, y + 1, z) : 0;
    if (t > 0) {
      out.r += TORCH.r * t * 0.8;
      out.g += TORCH.g * t * 0.8;
      out.b += TORCH.b * t * 0.8;
    }
    out.r = Math.min(1.12, Math.max(0.07, out.r));
    out.g = Math.min(1.12, Math.max(0.07, out.g));
    out.b = Math.min(1.12, Math.max(0.07, out.b));
    return out;
  }

  /** Brightness of a face with this world-space normal: tops are lighter than bottoms, and the sun lifts the faces towards it. */
  faceFactor(nx: number, ny: number, nz: number): number {
    const sun = 0.28 * this.share * Math.max(0, nx * this.dir.x + ny * this.dir.y + nz * this.dir.z);
    return Math.min(1.1, 0.8 + 0.12 * ny + sun);
  }

  /** The six box faces' factors for a body turned by `yaw` about the vertical axis. */
  faces(yaw: number, out: Float32Array): void {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    for (let i = 0; i < 6; i++) {
      const [x, y, z] = NORMALS[i];
      out[i] = this.faceFactor(x * c + z * s, y, -x * s + z * c);
    }
  }
}
