import * as THREE from 'three';
import { ATLAS_COLS, TILE_PX } from '@solrift/shared';

const MAX = 512;
const WHITE = new THREE.Color(1, 1, 1);

/** Block-break debris: small tumbling cubes coloured from the block's texture. */
export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private px = new Float32Array(MAX);
  private py = new Float32Array(MAX);
  private pz = new Float32Array(MAX);
  private vx = new Float32Array(MAX);
  private vy = new Float32Array(MAX);
  private vz = new Float32Array(MAX);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private size = new Float32Array(MAX);
  /** How hard each one is pulled down (debris falls fast, dust drifts). */
  private grav = new Float32Array(MAX);
  private next = 0;
  private material: THREE.MeshBasicMaterial;
  private tileCache = new Map<number, Uint8ClampedArray>();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private color = new THREE.Color();

  constructor(private readonly atlas: HTMLCanvasElement) {
    this.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.material, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.count = MAX;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX; i++) {
      this.mesh.setMatrixAt(i, zero);
      this.mesh.setColorAt(i, this.color.setRGB(1, 1, 1));
    }
  }

  private pixels(tile: number): Uint8ClampedArray {
    let px = this.tileCache.get(tile);
    if (!px) {
      const ctx = this.atlas.getContext('2d')!;
      px = ctx.getImageData((tile % ATLAS_COLS) * TILE_PX, Math.floor(tile / ATLAS_COLS) * TILE_PX, TILE_PX, TILE_PX).data;
      this.tileCache.set(tile, px);
    }
    return px;
  }

  burst(x: number, y: number, z: number, tile: number, count = 16): void {
    const px = this.pixels(tile);
    for (let n = 0; n < count; n++) {
      const i = this.next++ % MAX;
      this.px[i] = x + 0.15 + Math.random() * 0.7;
      this.py[i] = y + 0.15 + Math.random() * 0.7;
      this.pz[i] = z + 0.15 + Math.random() * 0.7;
      this.vx[i] = (Math.random() - 0.5) * 3.4;
      this.vy[i] = Math.random() * 3.6 + 0.6;
      this.vz[i] = (Math.random() - 0.5) * 3.4;
      this.maxLife[i] = this.life[i] = 0.55 + Math.random() * 0.6;
      this.size[i] = 0.07 + Math.random() * 0.07;
      this.grav[i] = 16;

      // Sample a random opaque pixel from the block's texture.
      let o = 0;
      for (let tries = 0; tries < 6; tries++) {
        o = Math.floor(Math.random() * TILE_PX * TILE_PX) * 4;
        if (px[o + 3] > 128) break;
      }
      this.color.setRGB(px[o] / 255, px[o + 1] / 255, px[o + 2] / 255, THREE.SRGBColorSpace);
      this.mesh.setColorAt(i, this.color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /**
   * A puff of dust for a footstep or a landing: small flecks in the colour of the ground that spread along it and drift up, slowly, and shrink away.
   * power is 0..1+ (a landing from a height is a lot more than a step).
   */
  dust(x: number, y: number, z: number, tile: number, count: number, power = 1): void {
    const px = this.pixels(tile);
    for (let n = 0; n < count; n++) {
      const i = this.next++ % MAX;
      const a = Math.random() * Math.PI * 2;
      const sp = (0.35 + Math.random() * 1.1) * (0.5 + 0.7 * power);
      this.px[i] = x + (Math.random() - 0.5) * 0.4;
      this.py[i] = y + 0.04 + Math.random() * 0.06;
      this.pz[i] = z + (Math.random() - 0.5) * 0.4;
      this.vx[i] = Math.cos(a) * sp;
      this.vz[i] = Math.sin(a) * sp;
      this.vy[i] = 0.35 + Math.random() * 0.9 * (0.5 + 0.5 * power);
      this.grav[i] = 2.6;
      this.maxLife[i] = this.life[i] = 0.35 + Math.random() * 0.45;
      this.size[i] = 0.08 + Math.random() * 0.09;
      let o = 0;
      for (let tries = 0; tries < 6; tries++) {
        o = Math.floor(Math.random() * TILE_PX * TILE_PX) * 4;
        if (px[o + 3] > 128) break;
      }
      // Dust is paler than the ground it comes from.
      this.color.setRGB(px[o] / 255, px[o + 1] / 255, px[o + 2] / 255, THREE.SRGBColorSpace).lerp(WHITE, 0.3);
      this.mesh.setColorAt(i, this.color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Sparks of a hit: fast little flecks of one colour that fly out from a point and fall. */
  sparks(x: number, y: number, z: number, r: number, g: number, b: number, count = 8): void {
    for (let n = 0; n < count; n++) {
      const i = this.next++ % MAX;
      this.px[i] = x + (Math.random() - 0.5) * 0.2;
      this.py[i] = y + (Math.random() - 0.5) * 0.2;
      this.pz[i] = z + (Math.random() - 0.5) * 0.2;
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 3.2;
      this.vx[i] = Math.cos(a) * sp;
      this.vz[i] = Math.sin(a) * sp;
      this.vy[i] = 0.8 + Math.random() * 3;
      this.grav[i] = 12;
      this.maxLife[i] = this.life[i] = 0.22 + Math.random() * 0.28;
      this.size[i] = 0.07 + Math.random() * 0.06;
      this.color.setRGB(r, g, b, THREE.SRGBColorSpace);
      this.mesh.setColorAt(i, this.color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    let any = false;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      this.vy[i] -= this.grav[i] * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const sz = this.size[i] * (0.4 + 0.6 * k);
      this.e.set(this.life[i] * 5, this.life[i] * 7, 0);
      this.q.setFromEuler(this.e);
      this.p.set(this.px[i], this.py[i], this.pz[i]);
      this.s.setScalar(this.life[i] > 0 ? sz : 0);
      this.m4.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m4);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }

  setBrightness(b: number): void {
    this.material.color.setScalar(Math.max(0.25, b));
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}
