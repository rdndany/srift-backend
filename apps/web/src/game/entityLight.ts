import * as THREE from 'three';
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
/** The dark unlit blocks keep (the terrain shader's sky floor). A body in a cave goes this dim, not a quarter of daylight. */
const CAVE = 0.035;

interface HeldSpot {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  range: number;
}

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
  /** Torches and lanterns people are carrying, copied so the list can be rebuilt next frame. */
  private readonly held: HeldSpot[] = Array.from({ length: 4 }, () => ({ x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, range: 0 }));
  private heldCount = 0;

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

  /** The carried torches and lanterns lighting the world this frame. Bodies read them on the next pass. */
  setHeld(spots: readonly HeldSpot[]): void {
    this.heldCount = Math.min(spots.length, this.held.length);
    for (let i = 0; i < this.heldCount; i++) {
      const s = spots[i];
      const d = this.held[i];
      d.x = s.x;
      d.y = s.y;
      d.z = s.z;
      d.r = s.r;
      d.g = s.g;
      d.b = s.b;
      d.range = s.range;
    }
  }

  /** The light that reaches a body standing at (x, y, z), written into `out`. */
  at(x: number, y: number, z: number, out: THREE.Color): THREE.Color {
    const sy = this.surfaceY(Math.floor(x), Math.floor(z));
    // A solid block above the head shuts out the sky, the same as it does for the blocks. Depth used to stop at
    // about a quarter of daylight, so a person stayed bright in a cave whose walls were black.
    const covered = sy >= y + 1;
    out.copy(this.base).multiplyScalar(covered ? CAVE : 1);
    const t = this.torches ? this.torches.lightAt(x, y + 1, z) : 0;
    if (t > 0) {
      out.r += TORCH.r * t * 0.8;
      out.g += TORCH.g * t * 0.8;
      out.b += TORCH.b * t * 0.8;
    }
    const hy = y + 1;
    for (let i = 0; i < this.heldCount; i++) {
      const s = this.held[i];
      if (s.range <= 0) continue;
      const d = Math.hypot(s.x - x, s.y - hy, s.z - z);
      const k = 1 - d / s.range;
      if (k <= 0) continue;
      const w = k * k;
      out.r += s.r * w;
      out.g += s.g * w;
      out.b += s.b * w;
    }
    out.r = Math.min(1.12, Math.max(CAVE, out.r));
    out.g = Math.min(1.12, Math.max(CAVE, out.g));
    out.b = Math.min(1.12, Math.max(CAVE, out.b));
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
