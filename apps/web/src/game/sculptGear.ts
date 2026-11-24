import * as THREE from 'three';
import type { Brick } from './mobPaint';
import type { GearCtx, GearSlot, MageRig } from './mageGear';
import type { Sculpt } from './mobVoxel';

/**
 * Class clothes sculpted from small cubes (the way King Aurelion is, see mobVoxel.ts), finer than the skin: a cube is `U` of a block, half a
 * pixel of the skin. A sculpture is built in cubes round the part's pivot (+x right, +y up, +z the back), turned into ONE mesh per material
 * with only the sides that face the air, and every cube carries a colour of its own from the palette with its little shade (a touch of
 * random, a touch of baked occlusion) in the `base` vertex attribute: the figure multiplies it by the light (see `paintFaces`).
 */

/** One cube of the clothes, in blocks. */
export const U = 1 / 32;

export type RGB = [number, number, number];

export interface Skin {
  c: RGB;
  /** Light that shines by itself (a gem, a rune): the name of its colour. Such cubes are not darkened by the dusk. */
  glow?: string;
  /** The cube is the colour of the figure's hair, shaded: its `c` is a gray that only says how light the tone is. */
  hair?: boolean;
}

/** A palette: `add` a colour (or a ramp of them) and get the number the sculpture paints with. */
export class Palette {
  readonly skins: Skin[] = [];
  add(c: RGB, glow?: string): number {
    this.skins.push({ c, glow });
    return this.skins.length - 1;
  }
  /** `n` tones of the colour of the figure's hair, dark to light (from `lo` to 1, of the hair's own colour): the numbers of them. */
  hair(n: number, lo = 0.62): number[] {
    return Array.from({ length: n }, (_, i) => {
      const g = Math.round(255 * (n === 1 ? 1 : lo + ((1 - lo) * i) / (n - 1)));
      this.skins.push({ c: [g, g, g], hair: true });
      return this.skins.length - 1;
    });
  }
  /** `n` colours from `a` to `b`, dark to light: the numbers of them. */
  ramp(a: RGB, b: RGB, n: number): number[] {
    return Array.from({ length: n }, (_, i) => {
      const t = n === 1 ? 0 : i / (n - 1);
      return this.add([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    });
  }
}

export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Corners of each side of a unit cube, in the order +x -x +y -y +z -z (top left, top right, bottom left, bottom right seen from outside).
const FACES: [number, number, number][][] = [
  [[1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1]],
  [[-1, 1, -1], [-1, 1, 1], [-1, -1, -1], [-1, -1, 1]],
  [[-1, 1, -1], [1, 1, -1], [-1, 1, 1], [1, 1, 1]],
  [[-1, -1, 1], [1, -1, 1], [-1, -1, -1], [1, -1, -1]],
  [[-1, 1, 1], [1, 1, 1], [-1, -1, 1], [1, -1, 1]],
  [[1, 1, -1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1]],
];
const NORMALS: V[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
type V = [number, number, number];

const linear = (c: RGB): [number, number, number] => {
  const k = new THREE.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
  return [k.r, k.g, k.b];
};

/** The cubes as one geometry: positions, a normal and `color` (white: the figure paints it) and `base` (the colour of the cube, shaded). */
export function sculptGeometry(bricks: Brick[], skins: Skin[]): THREE.BufferGeometry {
  let n = 0;
  for (const b of bricks) for (let f = 0; f < 6; f++) if (((b[8] ?? 63) >> f) & 1) n++;
  const pos = new Float32Array(n * 12);
  const nor = new Float32Array(n * 12);
  const col = new Float32Array(n * 12).fill(1);
  const base = new Float32Array(n * 12);
  const idx = new Uint32Array(n * 6);
  const lin = new Map<number, [number, number, number]>();
  let face = 0;
  for (const [x, y, z, w, h, d, shade, skin, mask] of bricks) {
    let rgb = lin.get(skin);
    if (!rgb) lin.set(skin, (rgb = linear(skins[skin]!.c)));
    for (let f = 0; f < 6; f++) {
      if (!(((mask ?? 63) >> f) & 1)) continue;
      const fi = face++;
      for (let c = 0; c < 4; c++) {
        const v = fi * 4 + c;
        const [cx, cy, cz] = FACES[f]![c]!;
        pos[v * 3] = x + (cx * w) / 2;
        pos[v * 3 + 1] = y + (cy * h) / 2;
        pos[v * 3 + 2] = z + (cz * d) / 2;
        nor.set(NORMALS[f]!, v * 3);
        base[v * 3] = rgb[0] * shade;
        base[v * 3 + 1] = rgb[1] * shade;
        base[v * 3 + 2] = rgb[2] * shade;
      }
      const v0 = fi * 4;
      idx.set([v0, v0 + 2, v0 + 1, v0 + 2, v0 + 3, v0 + 1], fi * 6);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('base', new THREE.BufferAttribute(base, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

const cloth = new THREE.MeshBasicMaterial({ vertexColors: true });
const lights = new Map<string, THREE.MeshBasicMaterial>();
const GLOWS = new Map<string, number>();

/** The colours of the lights the sculptures use. */
export function defineGlow(name: string, color: number): void {
  GLOWS.set(name, color);
}

const glowMat = (name: string): THREE.MeshBasicMaterial => {
  let m = lights.get(name);
  if (!m) lights.set(name, (m = new THREE.MeshBasicMaterial({ color: GLOWS.get(name) ?? 0xffffff })));
  return m;
};

/** The materials the clothes made (the figure frees them with the rest). */
export function disposeSculptGear(): void {
  for (const m of lights.values()) m.dispose();
  lights.clear();
}

/** Let the lights breathe: call with a clock in seconds. */
export function pulseSculptGlow(t: number): void {
  const k = 0.88 + 0.12 * Math.sin(t * 2.6);
  for (const [name, m] of lights) m.color.set(GLOWS.get(name) ?? 0xffffff).multiplyScalar(k);
}

/**
 * Put a sculpture on a part: one mesh of the cloth and one more for each light in it. Returns the meshes (to show and hide with the armor).
 * `ctx.add` takes care of the shapes.
 */
export function putSculpt(ctx: GearCtx, parent: THREE.Object3D, bricks: Brick[], skins: Skin[], nudge?: V3): THREE.Mesh[] {
  const groups = new Map<string, Brick[]>();
  for (const b of bricks) {
    const sk = skins[b[7]!]!;
    const key = sk.glow ?? (sk.hair && ctx.hair ? '#hair' : '');
    let list = groups.get(key);
    if (!list) groups.set(key, (list = []));
    list.push(b);
  }
  const out: THREE.Mesh[] = [];
  for (const [key, list] of groups) {
    const geo = sculptGeometry(list, skins);
    if (nudge) geo.translate(nudge[0], nudge[1], nudge[2]);
    out.push(ctx.add(parent, geo, key === '#hair' ? ctx.hair! : key ? glowMat(key) : cloth));
  }
  return out;
}

/** A deterministic scatter in 0..1 for a cube. */
/** Cloth has no grain: every class is one clean colour, shaded only by folds, edges and the light. So a scatter is always 'middle'. */
export function scatter(i: number, j: number, k: number, seed = 0): number {
  void i, j, k, seed;
  return 0.5;
}

export function grain(i: number, j: number, k: number, seed = 0): number {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647 + seed * 1274126177) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const wrap = (n: number, w: number): number => ((n % w) + w) % w;

/** A colour of a ramp:  picks the step, and now and then a cube is a step lighter or darker for grain. */
export const pick = (ramp: number[], f: number, i: number, j: number, k: number, seed: number): number => {
  const s = scatter(i, j, k, seed);
  const n = ramp.length - 1;
  return ramp[Math.max(0, Math.min(n, f + (s < 0.1 ? -1 : s > 0.92 ? 1 : 0)))]!;
};

/** A flat round (or oval) plate of cubes from row y0 to y1: radius 
 across, 
z front to back, centred on (cx, cz). */
export function disc(s: Sculpt, y0: number, y1: number, r: number, skin: (i: number, j: number, k: number) => number, cx = 0, cz = 0, rz = r): void {
  for (let j = y0; j < y1; j++)
    for (let i = Math.floor(cx - r); i <= Math.ceil(cx + r); i++)
      for (let k = Math.floor(cz - rz); k <= Math.ceil(cz + rz); k++) {
        const dx = (i + 0.5 - cx) / r;
        const dz = (k + 0.5 - cz) / rz;
        if (dx * dx + dz * dz <= 1) s.set(i, j, k, skin(i, j, k));
      }
}

/** One sculpted piece of a look: which armor slot it belongs to, which part of the body it hangs on (or which piece of the cape), its cubes. */
export interface Piece {
  slot: GearSlot | 'cape';
  part: 'head' | 'torso' | 'armL' | 'armR' | 'legL' | 'legR' | 0 | 1 | 2;
  bricks: Brick[];
}

/** Dress the figure in pieces: the cape's hinged pieces (their heights are hems) hang from the neck, the rest on the parts of the body. */
export function assemble(ctx: GearCtx, pieces: Piece[], skins: Skin[], hems: number[]): MageRig {
  const slots: Record<GearSlot, THREE.Mesh[]> = { head: [], chest: [], legs: [], feet: [] };
  const cape: THREE.Group[] = [];
  const parts = { head: ctx.head, torso: ctx.torso, armL: ctx.armL, armR: ctx.armR, legL: ctx.legL, legR: ctx.legR };
  let top: THREE.Object3D = ctx.torso;
  let y = 47 * U;
  hems.forEach((h, i) => {
    const pivot = new THREE.Group();
    pivot.position.set(0, y, i === 0 ? 0.158 : 0);
    top.add(pivot);
    cape.push(pivot);
    top = pivot;
    y = -h * U;
  });
  for (const p of pieces) {
    if (p.slot === 'cape') putSculpt(ctx, cape[p.part as number]!, p.bricks, skins);
    else {
      const nudge = NUDGE[p.part as string]!;
      const shift: V3 = p.slot === 'feet' ? [nudge[0] + NUDGE_FEET[0], nudge[1] + NUDGE_FEET[1], nudge[2] + NUDGE_FEET[2]] : nudge;
      slots[p.slot].push(...putSculpt(ctx, parts[p.part as keyof typeof parts], p.bricks, skins, shift));
    }
  }
  return { cape, slots };
}
/**
 * One row of cubes (row j) shaped as a rounded rectangle, hx and hz half-widths, centred on (cx, cz): 
 is how square it is (2 an ellipse,
 * 3 a soft rectangle, 6 almost square). wob and lobes ripple the outline (folds of cloth, flutes of metal): wob is how deep, as a fraction.
 */
export function slab(s: Sculpt, j: number, hx: number, hz: number, skin: (i: number, j: number, k: number) => number, cx = 0, cz = 0, n = 3, wob = 0, lobes = 0): void {
  for (let i = Math.floor(cx - hx - 1); i <= Math.ceil(cx + hx + 1); i++)
    for (let k = Math.floor(cz - hz - 1); k <= Math.ceil(cz + hz + 1); k++) {
      const dx = i + 0.5 - cx;
      const dz = k + 0.5 - cz;
      const r = wob ? 1 + wob * Math.cos(Math.atan2(dz, dx) * lobes) : 1;
      if ((Math.abs(dx) / (hx * r)) ** n + (Math.abs(dz) / (hz * r)) ** n <= 1) s.set(i, j, k, skin(i, j, k));
    }
}

export interface Round {
  hx: number;
  hz: number;
  cx?: number;
  cz?: number;
}

/** Rows j0..j1 (end exclusive), each a rounded slab whose size comes from shape(j): a body that swells and narrows instead of a box. */
export function stack(s: Sculpt, j0: number, j1: number, shape: (j: number) => Round, skin: (i: number, j: number, k: number) => number, n = 3, wob = 0, lobes = 0): void {
  for (let j = j0; j < j1; j++) {
    const r = shape(j);
    slab(s, j, r.hx, r.hz, skin, r.cx ?? 0, r.cz ?? 0, n, wob, lobes);
  }
}

/** Linear between two values: 	 0..1 (clamped). */
export const ease = (a: number, b: number, t: number): number => a + (b - a) * Math.max(0, Math.min(1, t));

/** The frontmost cube of the column (i, j) of a sculpture (the smallest k that is filled), or null. */
export function frontK(s: Sculpt, i: number, j: number): number | null {
  for (let k = -30; k < 30; k++) if (s.has(i, j, k)) return k;
  return null;
}

/** A tiny shift of each part's gear, so faces of two parts that lie in the same plane (an arm beside the body) never z-fight. In blocks. */
export const NUDGE: Record<string, V3> = {
  head: [0, 0.0009, 0],
  torso: [0, 0, 0],
  armL: [-0.0011, 0.0016, 0.0007],
  armR: [0.0011, 0.0019, -0.0007],
  legL: [-0.0008, 0.0013, 0.0011],
  legR: [0.0008, 0.0013, -0.0011],
};
export const NUDGE_FEET: V3 = [-0.0007, -0.0011, 0.0009];
type V3 = [number, number, number];
/** A dome of rounded plates: rows from j0 up, each narrower than the one below, like the shell of a pauldron or the top of a cap. */
export function dome(s: Sculpt, j0: number, rows: number, hx: number, hz: number, cx: number, skin: (i: number, j: number, k: number) => number): void {
  for (let t = 0; t < rows; t++) {
    const u = t / rows;
    const f = Math.sqrt(1 - u * u * 0.85);
    slab(s, j0 + t, hx * f, hz * f, skin, cx, 0, 2.3);
  }
}
/** The rearmost cube of the column (i, j) of a sculpture (the largest k that is filled), or null. */
export function backK(s: Sculpt, i: number, j: number): number | null {
  for (let k = 30; k > -30; k--) if (s.has(i, j, k)) return k;
  return null;
}
/**
 * A one-cube hoop round the head at row j: a square, 9 cubes out on each side, without its four outer corner cubes. Rounder than that and the corners would leave a cube of the hoop
 * with its face on the same plane as the face of the head (two surfaces in one place: they flicker as the figure moves).
 */
export function hoop(s: Sculpt, j: number, skin: (i: number, j: number, k: number) => number): void {
  s.box(-9, j, -9, 9, j + 1, 9, skin);
  for (const [x, z] of [[-9, -9], [8, -9], [-9, 8], [8, 8]] as const) s.carve(x, j, z, x + 1, j + 1, z + 1);
}

