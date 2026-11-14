import * as THREE from 'three';
import { BLOCKS } from '@solrift/shared';
import { BODY_SCALE, type SkinVoxel } from './character';

/** The ways a figure can go: 0 blown apart in a burst of cubes, 1 crumbling from the head down into a pile, 2 rising away as glowing cubes. */
export const DEATH_VARIANTS = 3;
export const DEATH_BURST = 0;
export const DEATH_CRUMBLE = 1;
export const DEATH_ASCEND = 2;

// Box face order: +x -x +y -y +z -z.
const FACE_SHADE = [0.82, 0.82, 1, 0.55, 0.9, 0.9];
/** One unit cube whose faces carry their own light, so every little cube shows its sides. */
const CUBE = ((): THREE.BoxGeometry => {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const c = new Float32Array(24 * 3);
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) c.fill(FACE_SHADE[f], (f * 4 + v) * 3, (f * 4 + v) * 3 + 3);
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
})();

const HEIGHT = 1.9 * BODY_SCALE;
const GRAVITY = 24;
const ASH = new THREE.Color(0.42, 0.4, 0.38);
const GLOW = new THREE.Color(0.7, 0.95, 1);
const GLOW_WARM = new THREE.Color(1, 0.92, 0.6);
const SPARK = new THREE.Color(1, 0.9, 0.55);

/** One figure coming apart: a cube each, moved by hand (a few hundred of them), drawn in one go. */
interface Fx {
  variant: number;
  mesh: THREE.InstancedMesh;
  n: number;
  t: number;
  /** The end of the longest-lived cube: the effect is over after it. */
  life: number;
  /** Where the middle of the body was, for the swirl and the burst. */
  cx: number;
  cy: number;
  cz: number;
  px: Float32Array;
  py: Float32Array;
  pz: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  rx: Float32Array;
  ry: Float32Array;
  rz: Float32Array;
  wx: Float32Array;
  wy: Float32Array;
  wz: Float32Array;
  size: Float32Array;
  /** When this cube lets go, and when it is gone. */
  delay: Float32Array;
  end: Float32Array;
  /** Where it started, for the cubes that wait their turn. */
  hx: Float32Array;
  hy: Float32Array;
  hz: Float32Array;
  /** 0 waiting, 1 moving, 2 lying on the ground; and a spark is not a piece of the body. */
  state: Uint8Array;
  spark: Uint8Array;
  base: THREE.Color[];
}

/**
 * What happens to a figure that dies, in the game's own voxel style: it comes apart into the little cubes it is made of (an eighth of a
 * block each, in the colours of its skin) and they burst out and bounce, crumble down like sand from the head, or lift away as light.
 */
export class DeathFx {
  readonly group = new THREE.Group();
  private readonly fx: Fx[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly tmp = new THREE.Color();
  private readonly v = new THREE.Vector3();

  /** `getBlock` tells what is in the world, so the pieces land on the ground and not through it. */
  constructor(private readonly getBlock: (x: number, y: number, z: number) => number) {}

  /** The top of the ground under (x, z), looking down from a little above `y`. */
  private floorAt(x: number, y: number, z: number): number {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    const top = Math.floor(y + 0.6);
    for (let k = 0; k < 8; k++) {
      const id = this.getBlock(bx, top - k, bz);
      if (id && BLOCKS[id]?.solid) return top - k + 1;
    }
    return -1e9;
  }

  /** Whether anything is still falling apart. */
  get active(): boolean {
    return this.fx.length > 0;
  }

  /**
   * Break a figure standing at (x, y, z) (its feet), turned `yaw`, into its cubes. `light` is how bright the world is there (0..1); `variant` one of
   * the DEATH_ ways (any other number picks one at random).
   */
  spawn(voxels: readonly SkinVoxel[], x: number, y: number, z: number, yaw: number, variant = -1, light = 1): void {
    if (voxels.length === 0) return;
    const kind = variant >= 0 && variant < DEATH_VARIANTS ? variant : Math.floor(Math.random() * DEATH_VARIANTS);
    const sparks = kind === DEATH_BURST ? 36 : kind === DEATH_ASCEND ? 20 : 0;
    const n = voxels.length + sparks;
    const f32 = (): Float32Array => new Float32Array(n);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const mesh = new THREE.InstancedMesh(CUBE, mat, n);
    mesh.frustumCulled = false;
    const fx: Fx = {
      variant: kind,
      mesh,
      n,
      t: 0,
      life: 0,
      cx: x,
      cy: y + 0.95 * BODY_SCALE,
      cz: z,
      px: f32(), py: f32(), pz: f32(),
      vx: f32(), vy: f32(), vz: f32(),
      rx: f32(), ry: f32(), rz: f32(),
      wx: f32(), wy: f32(), wz: f32(),
      size: f32(),
      delay: f32(),
      end: f32(),
      hx: f32(), hy: f32(), hz: f32(),
      state: new Uint8Array(n),
      spark: new Uint8Array(n),
      base: [],
    };
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const cell = 0.125 * BODY_SCALE;
    const rnd = Math.random;
    const lit = Math.max(0.35, Math.min(1, light));
    for (let i = 0; i < n; i++) {
      const isSpark = i >= voxels.length;
      if (!isSpark) {
        const vx = voxels[i];
        const lx = vx.x;
        const lz = vx.z;
        fx.px[i] = fx.hx[i] = x + lx * cos + lz * sin;
        fx.py[i] = fx.hy[i] = y + vx.y;
        fx.pz[i] = fx.hz[i] = z - lx * sin + lz * cos;
        fx.size[i] = cell * 0.98;
        fx.base.push(new THREE.Color().setRGB(vx.r, vx.g, vx.b, THREE.SRGBColorSpace).multiplyScalar(lit));
      } else {
        // Sparks and motes: tiny bright cubes round the middle of the body.
        const a = rnd() * Math.PI * 2;
        const r = rnd() * 0.3;
        fx.px[i] = fx.hx[i] = fx.cx + Math.cos(a) * r;
        fx.py[i] = fx.hy[i] = y + (0.3 + rnd() * 1.4) * BODY_SCALE;
        fx.pz[i] = fx.hz[i] = fx.cz + Math.sin(a) * r;
        fx.size[i] = cell * (0.28 + rnd() * 0.25);
        fx.spark[i] = 1;
        fx.base.push((kind === DEATH_ASCEND ? GLOW : SPARK).clone());
      }
      fx.rx[i] = fx.ry[i] = fx.rz[i] = 0;
      const hy = (fx.hy[i] - y) / HEIGHT; // 0 at the feet, 1 at the top of the head
      if (kind === DEATH_BURST) {
        const dx = fx.px[i] - fx.cx;
        const dz = fx.pz[i] - fx.cz;
        const dy = fx.py[i] - fx.cy;
        this.v.set(dx + (rnd() - 0.5) * 0.35, dy * 0.6 + (rnd() - 0.5) * 0.3, dz + (rnd() - 0.5) * 0.35);
        // Straight out from the middle, a little up; the ones from the middle go fastest of all.
        if (this.v.lengthSq() < 1e-4) this.v.set(rnd() - 0.5, 0.5, rnd() - 0.5);
        this.v.normalize();
        const speed = isSpark ? 4 + rnd() * 6 : 3 + rnd() * 5.5;
        fx.vx[i] = this.v.x * speed;
        fx.vy[i] = this.v.y * speed * 0.7 + (isSpark ? 3 : 3.5) + rnd() * 4;
        fx.vz[i] = this.v.z * speed;
        const spin = isSpark ? 4 : 11;
        fx.wx[i] = (rnd() - 0.5) * spin * 2;
        fx.wy[i] = (rnd() - 0.5) * spin * 2;
        fx.wz[i] = (rnd() - 0.5) * spin * 2;
        fx.delay[i] = rnd() * 0.03;
        fx.end[i] = isSpark ? 0.45 + rnd() * 0.5 : 2.6 + rnd() * 1.1;
      } else if (kind === DEATH_CRUMBLE) {
        // From the top down: the head lets go first, the feet last.
        fx.delay[i] = 0.35 + (1 - Math.min(1, Math.max(0, hy))) * 0.95 + rnd() * 0.14;
        fx.end[i] = fx.delay[i] + 2.4 + rnd() * 0.9;
      } else {
        // From the feet up: the legs go first and the head is the last of it.
        fx.delay[i] = isSpark ? rnd() * 1.1 : 0.25 + Math.min(1, Math.max(0, hy)) * 0.8 + rnd() * 0.14;
        fx.end[i] = fx.delay[i] + 1.5 + rnd() * 1.1;
      }
      fx.life = Math.max(fx.life, fx.end[i]);
      fx.state[i] = kind === DEATH_BURST ? 1 : 0;
      mesh.setColorAt(i, fx.base[i]);
    }
    this.group.add(mesh);
    this.fx.push(fx);
    this.place(fx);
  }

  /** Move the cubes and finish the effects that are over. */
  update(dt0: number): void {
    const dt = Math.min(dt0, 0.05);
    for (let k = this.fx.length - 1; k >= 0; k--) {
      const fx = this.fx[k];
      fx.t += dt;
      this.step(fx, dt);
      if (fx.t > fx.life + 0.05) {
        this.group.remove(fx.mesh);
        fx.mesh.dispose();
        (fx.mesh.material as THREE.Material).dispose();
        this.fx.splice(k, 1);
        continue;
      }
      this.place(fx);
    }
  }

  private step(fx: Fx, dt: number): void {
    const t = fx.t;
    let colors = false;
    for (let i = 0; i < fx.n; i++) {
      if (t >= fx.end[i]) continue;
      if (fx.state[i] === 0) {
        if (t < fx.delay[i]) {
          // Waiting its turn: it trembles more as the moment comes (crumbling), or glows (rising).
          if (fx.variant === DEATH_CRUMBLE) {
            const a = 0.012 * Math.min(1, (t / fx.delay[i]) * 1.3);
            fx.px[i] = fx.hx[i] + Math.sin(t * 61 + i * 7.1) * a;
            fx.pz[i] = fx.hz[i] + Math.cos(t * 53 + i * 3.7) * a;
          } else if (fx.variant === DEATH_ASCEND && fx.delay[i] - t < 0.3) {
            this.tmp.copy(fx.base[i]).lerp(GLOW, 0.5 * (1 - (fx.delay[i] - t) / 0.3));
            fx.mesh.setColorAt(i, this.tmp);
            colors = true;
          }
          continue;
        }
        fx.state[i] = 1;
        const rnd = Math.random;
        if (fx.variant === DEATH_CRUMBLE) {
          fx.vx[i] = (rnd() - 0.5) * 1.6;
          fx.vz[i] = (rnd() - 0.5) * 1.6;
          fx.vy[i] = -rnd() * 0.6;
          fx.wx[i] = (rnd() - 0.5) * 6;
          fx.wy[i] = (rnd() - 0.5) * 6;
          fx.wz[i] = (rnd() - 0.5) * 6;
          // Dust: the colour goes grey as it comes apart.
          this.tmp.copy(fx.base[i]).lerp(ASH, 0.25 + rnd() * 0.25);
          fx.mesh.setColorAt(i, this.tmp);
          colors = true;
        } else {
          // Lifts away: pale and bright, turning slowly.
          fx.vy[i] = 0.9 + rnd() * 1.1;
          fx.vx[i] = fx.vz[i] = 0;
          fx.wx[i] = (rnd() - 0.5) * 3;
          fx.wy[i] = (rnd() - 0.5) * 5;
          fx.wz[i] = (rnd() - 0.5) * 3;
          this.tmp.copy(fx.base[i]).lerp(rnd() < 0.7 ? GLOW : GLOW_WARM, fx.spark[i] ? 1 : 0.65 + rnd() * 0.3);
          fx.mesh.setColorAt(i, this.tmp);
          colors = true;
        }
      }
      if (fx.variant === DEATH_ASCEND) {
        // Up, faster as it goes, swirling round the middle of the body and drifting a little outward.
        const age = t - fx.delay[i];
        fx.vy[i] += dt * 1.2;
        const dx = fx.px[i] - fx.cx;
        const dz = fx.pz[i] - fx.cz;
        const w = (1.3 + 0.8 * Math.min(1, age)) * dt;
        const c = Math.cos(w);
        const s = Math.sin(w);
        const grow = 1 + 0.25 * dt;
        fx.px[i] = fx.cx + (dx * c - dz * s) * grow;
        fx.pz[i] = fx.cz + (dx * s + dz * c) * grow;
        fx.py[i] += fx.vy[i] * dt;
        fx.rx[i] += fx.wx[i] * dt;
        fx.ry[i] += fx.wy[i] * dt;
        fx.rz[i] += fx.wz[i] * dt;
        continue;
      }
      const rest = fx.state[i] === 2;
      if (rest) {
        // Lying on the ground: it settles flat, like a block laid down.
        const q = Math.PI / 2;
        const k = Math.min(1, dt * 12);
        fx.rx[i] += (Math.round(fx.rx[i] / q) * q - fx.rx[i]) * k;
        fx.ry[i] += (Math.round(fx.ry[i] / q) * q - fx.ry[i]) * k;
        fx.rz[i] += (Math.round(fx.rz[i] / q) * q - fx.rz[i]) * k;
        continue;
      }
      const g = fx.spark[i] ? GRAVITY * 0.35 : GRAVITY;
      fx.vy[i] -= g * dt;
      fx.px[i] += fx.vx[i] * dt;
      fx.py[i] += fx.vy[i] * dt;
      fx.pz[i] += fx.vz[i] * dt;
      fx.rx[i] += fx.wx[i] * dt;
      fx.ry[i] += fx.wy[i] * dt;
      fx.rz[i] += fx.wz[i] * dt;
      if (fx.spark[i]) continue;
      const half = fx.size[i] * 0.5;
      const floor = this.floorAt(fx.px[i], fx.py[i], fx.pz[i]);
      if (fx.vy[i] < 0 && fx.py[i] - half < floor) {
        fx.py[i] = floor + half;
        const bounce = fx.variant === DEATH_BURST ? 0.42 : 0.12;
        if (Math.abs(fx.vy[i]) > 2.2) {
          fx.vy[i] = -fx.vy[i] * bounce;
          fx.vx[i] *= 0.72;
          fx.vz[i] *= 0.72;
          fx.wx[i] *= 0.6;
          fx.wy[i] *= 0.6;
          fx.wz[i] *= 0.6;
        } else {
          // Slides to a stop and lies there.
          fx.vy[i] = 0;
          const slide = Math.exp(-dt * (fx.variant === DEATH_BURST ? 5 : 9));
          fx.vx[i] *= slide;
          fx.vz[i] *= slide;
          fx.wx[i] *= slide;
          fx.wy[i] *= slide;
          fx.wz[i] *= slide;
          if (Math.abs(fx.vx[i]) + Math.abs(fx.vz[i]) < 0.15) fx.state[i] = 2;
        }
      }
    }
    if (colors && fx.mesh.instanceColor) fx.mesh.instanceColor.needsUpdate = true;
  }

  private place(fx: Fx): void {
    const d = this.dummy;
    for (let i = 0; i < fx.n; i++) {
      // A cube shrinks away at the end of its life, and a cube of a body that has not let go yet is where it was.
      const left = fx.end[i] - fx.t;
      const s = left <= 0 ? 0 : fx.size[i] * Math.min(1, left / 0.5);
      d.position.set(fx.px[i], fx.py[i], fx.pz[i]);
      d.rotation.set(fx.rx[i], fx.ry[i], fx.rz[i]);
      d.scale.setScalar(s);
      d.updateMatrix();
      fx.mesh.setMatrixAt(i, d.matrix);
    }
    fx.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Put an end to everything at once. */
  clear(): void {
    for (const fx of this.fx) {
      this.group.remove(fx.mesh);
      fx.mesh.dispose();
      (fx.mesh.material as THREE.Material).dispose();
    }
    this.fx.length = 0;
  }

  dispose(): void {
    this.clear();
  }
}

