import * as THREE from 'three';
import { clamp01, type FxEntry, type SpellKit } from './spellFx';

/**
 * The pieces the Warrior's cube effects (slamFx.ts, bashFx.ts) are made of: a pool of cubes drawn together, cubes of dust that
 * drift and shrink, cubes of earth and sparks that are thrown and fall, and the colours and steps they share. Everything here is
 * laid out from the age of the effect alone (no stored positions that move frame by frame), so an effect that arrives late is in
 * the right place of its life, and one built far below the world to compile its shaders needs nothing special.
 */

export const srgb = (hex: number): THREE.Color => new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
export const pal = (...hexes: number[]): THREE.Color[] => hexes.map(srgb);

export const DUST = pal(0xe6d8b4, 0xd2c198, 0xbaa880, 0xa08f6e);
export const STONE = pal(0x9a9286, 0x7d756a, 0x625b52, 0x4b463f);
export const EARTH = pal(0x86633f, 0x6e5232, 0x59412a, 0x8c8272, 0x7d756a);
export const PALE = srgb(0xfff4d6);
export const FLASH = srgb(0xffd98a);
export const SPARKS = pal(0xfff0b0, 0xffc050, 0xff8a28);

/** The grid the cubes of the ground effects sit on. */
export const GRID = 0.25;
export const snap = (v: number, to = GRID): number => Math.round(v / to) * to;
/** A size that shrinks in `n` steps as `left` (1..0) runs out, like a picture of pixels. */
export const steps = (left: number, n = 4): number => Math.ceil(clamp01(left) * n - 1e-6) / n;

/** A repeatable stream of numbers in 0..1 (the same mark looks the same on every screen). */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type Rng = () => number;
export const between = (rng: Rng, a: number, b: number): number => a + rng() * (b - a);

/** Every cube of one effect, drawn together; they are laid out again every frame from the age of the effect. */
export class Cubes {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private readonly matrices: Float32Array;
  private readonly colors: Float32Array;

  constructor(
    private readonly kit: SpellKit,
    material: THREE.Material,
    private readonly cap: number,
    /** Where the effect stands in the world (the cubes are placed relative to it). */
    private readonly at: THREE.Vector3,
  ) {
    this.mesh = new THREE.InstancedMesh(kit.voxel, material, cap);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, PALE);
    this.matrices = this.mesh.instanceMatrix.array as Float32Array;
    this.colors = (this.mesh.instanceColor as THREE.InstancedBufferAttribute).array as Float32Array;
  }

  reset(): void {
    this.n = 0;
  }

  /**
   * A cube centred at (x, y, z) (relative to the effect), `sx` by `sy` by `sz` big, turned `yaw` about the upright axis (for the pieces that
   * face a way: a shield). A cube that would be right in front of the camera is made smaller, then not drawn.
   */
  put(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: THREE.Color, yaw = 0): void {
    if (this.n >= this.cap || sx <= 0.001) return;
    let k = 1;
    const v = this.kit.viewer;
    if (v) {
      const dx = this.at.x + x - v.x;
      const dy = this.at.y + y - v.y;
      const dz = this.at.z + z - v.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 1.69) {
        k = clamp01((Math.sqrt(d2) - 0.45) / 0.85);
        if (k <= 0.02) return;
      }
    }
    const c = yaw === 0 ? 1 : Math.cos(yaw);
    const s = yaw === 0 ? 0 : Math.sin(yaw);
    const m = this.matrices;
    const i = this.n * 16;
    m[i] = c * sx * k;
    m[i + 1] = 0;
    m[i + 2] = -s * sx * k;
    m[i + 3] = 0;
    m[i + 4] = 0;
    m[i + 5] = sy * k;
    m[i + 6] = 0;
    m[i + 7] = 0;
    m[i + 8] = s * sz * k;
    m[i + 9] = 0;
    m[i + 10] = c * sz * k;
    m[i + 11] = 0;
    m[i + 12] = x;
    m[i + 13] = y;
    m[i + 14] = z;
    m[i + 15] = 1;
    const o = this.n * 3;
    this.colors[o] = color.r;
    this.colors[o + 1] = color.g;
    this.colors[o + 2] = color.b;
    this.n++;
  }

  /** The frame is laid out. */
  done(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    (this.mesh.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.mesh.dispose();
  }
}

/** One cube of dust: it leaves the ground and slows down, rising a little, and shrinks away in steps. */
export interface Puff {
  x0: number;
  z0: number;
  y0: number;
  dx: number;
  dz: number;
  speed: number;
  up: number;
  size: number;
  life: number;
  delay: number;
  tone: number;
}

export interface PuffSpec {
  count: number;
  /** How far from the starting point they start. */
  spread: number;
  /** The most they travel is a quarter of the speed (they slow down fast). */
  speed: [number, number];
  /** The most they rise is a third of this. */
  up: [number, number];
  size: [number, number];
  life: [number, number];
  delay: [number, number];
  /** The height of the bottom of a cube when it starts (the ground), relative to the effect. */
  y0?: number;
  /** Where they start (x, z), relative to the effect. */
  from?: [number, number];
  /** Not all round but along this way (an angle in the ground plane), within `spread` radians either side. */
  way?: [number, number];
}

export function makePuffs(rng: Rng, s: PuffSpec): Puff[] {
  const out: Puff[] = [];
  for (let i = 0; i < s.count; i++) {
    const a = s.way ? s.way[0] + (rng() * 2 - 1) * s.way[1] : rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * s.spread;
    const b = rng() * Math.PI * 2;
    out.push({
      x0: (s.from?.[0] ?? 0) + Math.cos(s.way ? b : a) * d,
      z0: (s.from?.[1] ?? 0) + Math.sin(s.way ? b : a) * d,
      y0: s.y0 ?? 0,
      dx: Math.cos(a),
      dz: Math.sin(a),
      speed: between(rng, s.speed[0], s.speed[1]),
      up: between(rng, s.up[0], s.up[1]),
      size: between(rng, s.size[0], s.size[1]),
      life: between(rng, s.life[0], s.life[1]),
      delay: between(rng, s.delay[0], s.delay[1]),
      tone: Math.floor(rng() * 2),
    });
  }
  return out;
}

export function drawPuffs(cubes: Cubes, list: readonly Puff[], age: number): void {
  for (const p of list) {
    const t = age - p.delay;
    if (t <= 0 || t >= p.life) continue;
    const k = t / p.life;
    const out = (1 - Math.exp(-4 * t)) / 4;
    const rise = (1 - Math.exp(-3 * t)) / 3;
    const s = p.size * steps(1 - k * k);
    // darker as it ages: dust that has settled is the colour of the ground
    cubes.put(p.x0 + p.dx * p.speed * out, p.y0 + s / 2 + p.up * rise, p.z0 + p.dz * p.speed * out, s, s, s, DUST[Math.min(3, p.tone + (k > 0.5 ? 1 : 0) + (k > 0.8 ? 1 : 0))]);
  }
}

/** One thrown cube (a piece of the ground, a spark): up and out, it falls, lies where it lands for a while, and shrinks away. */
export interface Chunk {
  x0: number;
  y0: number;
  z0: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  life: number;
  delay: number;
  /** When it reaches the ground. */
  land: number;
  /** The height of the ground, relative to the effect. */
  floor: number;
  color: THREE.Color;
}

const GRAVITY = 24;

export interface ChunkSpec {
  count: number;
  radius: number;
  speed: [number, number];
  up: [number, number];
  size: [number, number];
  life: [number, number];
  delay?: [number, number];
  colors: readonly THREE.Color[];
  /** How high above the ground (or above the effect's origin, when `floor` is given) they start. */
  y0?: number;
  /** The height of the ground relative to the effect (0 by default). */
  floor?: number;
  /** Where they start (x, z), relative to the effect. */
  from?: [number, number];
  /** Not all round but along this way (an angle in the ground plane), within this many radians either side. */
  way?: [number, number];
}

export function makeChunks(rng: Rng, s: ChunkSpec): Chunk[] {
  const out: Chunk[] = [];
  const floor = s.floor ?? 0;
  for (let i = 0; i < s.count; i++) {
    const a = s.way ? s.way[0] + (rng() * 2 - 1) * s.way[1] : rng() * Math.PI * 2;
    const b = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * s.radius;
    const sp = between(rng, s.speed[0], s.speed[1]);
    const vy = between(rng, s.up[0], s.up[1]);
    const size = between(rng, s.size[0], s.size[1]);
    const y0 = floor + (s.y0 ?? 0.25) + size / 2;
    out.push({
      x0: (s.from?.[0] ?? 0) + Math.cos(s.way ? b : a) * d,
      y0,
      z0: (s.from?.[1] ?? 0) + Math.sin(s.way ? b : a) * d,
      vx: Math.cos(a) * sp,
      vy,
      vz: Math.sin(a) * sp,
      size,
      life: between(rng, s.life[0], s.life[1]),
      delay: s.delay ? between(rng, s.delay[0], s.delay[1]) : 0,
      land: (vy + Math.sqrt(vy * vy + 2 * GRAVITY * Math.max(0, y0 - floor - size / 2))) / GRAVITY,
      floor,
      color: s.colors[Math.floor(rng() * s.colors.length)],
    });
  }
  return out;
}

export function drawChunks(cubes: Cubes, list: readonly Chunk[], age: number): void {
  for (const c of list) {
    const t = age - c.delay;
    if (t <= 0 || t >= c.life) continue;
    const tt = Math.min(t, c.land);
    const slide = (1 - Math.exp(-0.9 * tt)) / 0.9;
    const y = t < c.land ? c.y0 + c.vy * t - 0.5 * GRAVITY * t * t : c.floor + c.size / 2;
    const s = c.size * steps((c.life - t) / 0.35, 3);
    cubes.put(c.x0 + c.vx * slide, y - (c.size - s) / 2, c.z0 + c.vz * slide, s, s, s, c.color);
  }
}

/** A material for the cubes: each face has its own shade (see `SpellKit.voxel`), and the colour of each cube comes from the pool. */
export function voxelMaterial(e: FxEntry): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true });
  e.materials.push(m);
  return m;
}
