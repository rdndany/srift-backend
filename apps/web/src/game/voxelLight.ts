import * as THREE from 'three';
import type { FxLook } from './emberFx';
import { clamp01, type FxEntry, type SpellKit } from './spellFx';
import { Cubes, snap, steps, voxelMaterial, type Rng } from './voxelFx';

/**
 * The pieces the mounts' cube effects share (the call and the arrival in mountSummonFx.ts, the Fenrir's bite and howl in fenrirFx.ts): the
 * colours of a mount's light, bolts of lightning made of cubes, rings and stepped shock waves on the ground, and a patch of burnt ground.
 * Like everything in voxelFx.ts they are laid out from the age of the effect alone.
 */

/** The colours of one mount's effects, from the palette of its light: deep to near white. */
export interface Tones {
  deep: THREE.Color;
  mid: THREE.Color;
  pale: THREE.Color;
  white: THREE.Color;
  /** The burnt ground. */
  dark: THREE.Color;
  /** What the sputtering of a lost call is made of. */
  dim: THREE.Color[];
}

export function tonesOf(look: FxLook): Tones {
  const at = (i: number): THREE.Color => new THREE.Color(look.palette[i][0], look.palette[i][1], look.palette[i][2]);
  const deep = at(0);
  return {
    deep,
    mid: at(1),
    pale: at(2),
    white: at(3),
    dark: deep.clone().multiplyScalar(0.035),
    dim: [new THREE.Color(look.dim[0], look.dim[1], look.dim[2]), deep.clone().multiplyScalar(0.45), deep.clone().multiplyScalar(0.22)],
  };
}

/** Put the cubes of an effect into its group (and free them with it); `light`: a little see-through, for the airy effects (the call of a mount). */
export const stage = (e: FxEntry, kit: SpellKit, cap: number, light = false): Cubes => {
  let material: THREE.MeshBasicMaterial;
  if (light) {
    material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false });
    e.materials.push(material);
  } else material = voxelMaterial(e);
  const cubes = new Cubes(kit, material, cap, e.group.position);
  e.group.add(cubes.mesh);
  e.dispose = () => cubes.dispose();
  return cubes;
};

// ---- bolts ----------------------------------------------------------------------------------------------------------

/** A bolt of cubes: a jagged line down from `top` to where it strikes (`x`, `z`), leaning and kinking on the way. */
export interface Bolt {
  x: number;
  z: number;
  thick: number;
  spacing: number;
  birth: number;
  life: number;
  /** How far each cube is off the straight line, from the ground up. */
  dx: Float32Array;
  dz: Float32Array;
}

export function makeBolt(rng: Rng, x: number, z: number, top: number, thick: number, birth: number, life: number, jag: number, lean: [number, number]): Bolt {
  const spacing = Math.max(0.28, thick * 1.5);
  const n = Math.ceil(top / spacing);
  const dx = new Float32Array(n);
  const dz = new Float32Array(n);
  // from where it strikes upward, each cube a step off the one below it, and the whole of it leaning toward where it comes from
  let ox = 0;
  let oz = 0;
  for (let j = 0; j < n; j++) {
    ox += lean[0] / n + (rng() - 0.5) * jag * 0.45;
    oz += lean[1] / n + (rng() - 0.5) * jag * 0.45;
    dx[j] = ox;
    dz[j] = oz;
  }
  return { x, z, thick, spacing, birth, life, dx, dz };
}

/** A bolt at `age`: white cubes with a wider, paler one between each pair, flickering, and shrinking in steps toward its end. */
export function drawBolt(cubes: Cubes, tone: Tones, b: Bolt, age: number): void {
  const t = age - b.birth;
  if (t < 0 || t >= b.life) return;
  const k = steps(Math.min(1, (b.life - t) / (b.life * 0.6)), 3);
  const flick = Math.floor(t * 40) % 2 === 0;
  for (let j = 0; j < b.dx.length; j++) {
    const wide = j % 2 === 1;
    const s = b.thick * (wide ? 1.6 : 1) * k;
    cubes.put(snap(b.x + b.dx[j], 0.1), (j + 0.5) * b.spacing, snap(b.z + b.dz[j], 0.1), s, b.spacing * 0.95 * k, s, wide ? (flick ? tone.pale : tone.mid) : flick ? tone.white : tone.pale);
  }
}

/** A short bolt between two points (the streaks that fly off the teeth, the static that jumps off the ground): cubes along a kinked line, showing from the start. */
export function drawStreak(cubes: Cubes, from: THREE.Vector3, to: THREE.Vector3, kinks: Float32Array, reach: number, size: number, colour: THREE.Color, wide: THREE.Color): void {
  const len = from.distanceTo(to);
  const n = Math.max(2, Math.round(len / (size * 1.4)));
  const shown = Math.floor(n * clamp01(reach));
  for (let i = 0; i < shown; i++) {
    const u = (i + 0.5) / n;
    const k = Math.sin(u * Math.PI) * 0.35;
    const o = i % 2 === 0 ? kinks[(i * 2) % kinks.length] : kinks[(i * 2 + 1) % kinks.length];
    const s = size * (1 - 0.45 * u);
    cubes.put(from.x + (to.x - from.x) * u + o * k, from.y + (to.y - from.y) * u + (kinks[(i + 3) % kinks.length] * k) / 2, from.z + (to.z - from.z) * u - o * k, s, s, s, i % 3 === 1 ? wide : colour);
  }
}

// ---- the ground -----------------------------------------------------------------------------------------------------

/** A ring of cubes on the ground, a stepped circle, shrinking in steps over `dur` seconds (the shock wave). */
export function drawWave(cubes: Cubes, radius: number, age: number, dur: number, size: number, colours: readonly THREE.Color[]): void {
  const left = steps(1 - age / dur, 3);
  if (left <= 0) return;
  const n = Math.max(8, Math.round((Math.PI * 2 * radius) / (size * 1.05)));
  const s = size * left;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    cubes.put(snap(Math.cos(a) * radius, 0.125), 0.1 + s / 2, snap(Math.sin(a) * radius, 0.125), s, s, s, colours[i % colours.length]);
  }
}

/** The burnt ground: flat dark cubes (half a block, a few left out) in a disc, shown from the middle outward. */
export interface Patch {
  x: number;
  z: number;
  /** Distance from the middle, a little off by chance so the edge is ragged. */
  d: number;
}

export function makePatch(rng: Rng, radius = 3.4): Patch[] {
  const out: Patch[] = [];
  const n = Math.ceil(radius / 0.5);
  for (let gx = -n; gx <= n; gx++) {
    for (let gz = -n; gz <= n; gz++) {
      const x = gx * 0.5;
      const z = gz * 0.5;
      const d = Math.hypot(x, z);
      if (d > radius || (d > 1 && rng() < 0.28)) continue;
      out.push({ x, z, d: d + rng() * 0.5 });
    }
  }
  return out;
}

export function drawPatch(cubes: Cubes, list: readonly Patch[], reach: number, colour: THREE.Color, scale: number): void {
  if (scale <= 0) return;
  for (const p of list) if (p.d <= reach) cubes.put(p.x, 0.03, p.z, 0.46 * scale, 0.04, 0.46 * scale, colour);
}
