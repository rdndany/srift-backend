import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { disposeSculptGear, pulseSculptGlow } from './sculptGear';

/**
 * What a Mage wears: a wizard's hat with a brim, a buckled band and a tip that droops, a robe of violet cloth with gold trim, wide sleeves,
 * a cowl at the neck, a belt with a pouch and a vial that glows, a chain with two gems across the chest, split skirts that swing with the
 * legs, and a long lined cape in three hinged pieces that streams out as the figure moves. Looks only, no items.
 *
 * Everything is built from blocks at the scale of the skin (16 to the block), painted from small pictures that repeat one block wide, so the
 * cloth has the same pixels as the face and hands. The static blocks of a part are merged into one mesh per look, so a Mage costs a handful of
 * draw calls. Positions are in the figure's own units, the head's centre 0.1 above its pivot, the back toward +z.
 */

export type V3 = [number, number, number];
export type RGB = [number, number, number];

export interface GearCtx {
  /** A box whose vertices carry a colour each (the sun lives in them). */
  box(w: number, h: number, d: number): THREE.BoxGeometry;
  /** Put a finished mesh on a part of the body; the figure frees the shapes and takes the mesh off again. */
  add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[]): THREE.Mesh;
  head: THREE.Object3D;
  torso: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  /** The material of the figure's hair (it takes the colour of the hair on the skin): what a look builds of hair-coloured cubes is drawn with it. */
  hair?: THREE.Material;
}

/** The cape's pieces from the neck down: each hangs from the one before and is turned a little less than the figure's stride asks of the first. */
export interface MageRig {
  cape: THREE.Group[];
  /** The meshes that armor takes the place of: the hat (a helmet), the robe with its sleeves, belt and chain (a chestplate), the skirts (leggings). */
  slots: Record<GearSlot, THREE.Mesh[]>;
}

export type GearSlot = 'head' | 'chest' | 'legs' | 'feet';

// ---- pictures ---------------------------------------------------------------------------------------------------------

export function noise(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
export const tone = (c: RGB, d: number): string => `rgb(${clamp(c[0] + d)},${clamp(c[1] + d)},${clamp(c[2] + d)})`;
/** A colour as the picture's pixel wants it. */
export const rgbs = (c: RGB): string => `rgb(${clamp(c[0])},${clamp(c[1])},${clamp(c[2])})`;
/** Between two colours (`t` 0 is the first, 1 the second): how shadows lean toward one hue and lights toward another. */
export const lerp = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** A colour with a little grain: `amount` is the whole width of it. */
export const jitter = (c: RGB, x: number, y: number, seed: number, amount: number): RGB => {
  const d = (noise(x, y, seed) - 0.5) * amount;
  return [c[0] + d, c[1] + d, c[2] + d];
};

type TexKey = 'robe' | 'hat' | 'cape' | 'lining' | 'trim';

/** Folds in the cloth: a dark crease, then lighter and lighter toward the next one. */
export const PLEAT = [-20, -8, 5, 12];

const PAINT: Record<TexKey, (x: number, y: number) => string> = {
  // Silk-like cloth: folds a dark crease and then lighter and lighter toward the next, shadows leaning to indigo and lights to lilac; arcane specks.
  robe: (x, y) => {
    const f = [0, 0.3, 0.62, 0.92][x % 4];
    let c = lerp([52, 30, 124], [144, 106, 234], f);
    if ((x + y) % 8 === 0) c = lerp(c, [30, 16, 80], 0.18);
    if ((x === 5 && y === 3) || (x === 10 && y === 8) || (x === 2 && y === 11) || (x === 13 && y === 13)) return rgbs([204, 178, 255]);
    if ((x === 6 && y === 3) || (x === 11 && y === 8) || (x === 3 && y === 11) || (x === 14 && y === 13)) c = lerp(c, [176, 140, 255], 0.35);
    return rgbs(jitter(c, x, y, 3, 8));
  },
  // Felt: a deep purple with a soft grain and a stitched edge.
  hat: (x, y) => {
    let c = lerp([62, 36, 126], [100, 66, 176], noise(x >> 1, y, 5));
    if ((x + y) % 7 === 0) c = lerp(c, [36, 20, 84], 0.25);
    return rgbs(jitter(c, x, y, 6, 8));
  },
  // The cape's back: a deep indigo with folds, and stars.
  cape: (x, y) => {
    const f = [0, 0.3, 0.64, 0.9][x % 4];
    let c = lerp([24, 18, 82], [90, 70, 184], f);
    if ((x === 4 && y === 4) || (x === 11 && y === 10) || (x === 7 && y === 14) || (x === 14 && y === 2) || (x === 1 && y === 9)) return rgbs([196, 176, 255]);
    if ((x === 5 && y === 4) || (x === 12 && y === 10) || (x === 8 && y === 14)) c = lerp(c, [170, 146, 250], 0.4);
    return rgbs(jitter(c, x, y, 7, 7));
  },
  lining: (x, y) => {
    const f = [0, 0.3, 0.64, 0.9][x % 4];
    let c = lerp([116, 76, 196], [194, 152, 246], f);
    if (y % 8 === 7) c = lerp(c, [74, 44, 140], 0.3);
    return rgbs(jitter(c, x, y, 9, 7));
  },
  // Gold: engraved lines every four pixels in a deep amber, glints in a pale yellow.
  trim: (x, y) => {
    let c: RGB = [232, 186, 70];
    if (x % 4 === 0) c = [196, 136, 44];
    else if (x % 4 === 1) c = [246, 206, 96];
    if ((x * 3 + y * 5) % 11 === 0) c = [255, 238, 156];
    return rgbs(jitter(c, x, y, 11, 8));
  },
};

const textures = new Map<TexKey, THREE.CanvasTexture>();
const materials = new Map<string, THREE.MeshBasicMaterial>();
const glows: { mat: { color: THREE.Color }; base: THREE.Color }[] = [];
/** Shapes and materials made for the gear: freed with the rest. */
const spare: { dispose(): void }[] = [];
const props = new Map<string, THREE.Group>();

function texture(key: TexKey): THREE.CanvasTexture {
  let t = textures.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      g.fillStyle = PAINT[key](x, y);
      g.fillRect(x, y, 1, 1);
    }
  }
  t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  // Crisp up close, mip-mapped far off (a figure in the distance would shimmer), and clear when seen at a slant.
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  textures.set(key, t);
  return t;
}

/** A cloth material (lit through the vertex colours). */
function cloth(key: TexKey): THREE.MeshBasicMaterial {
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ map: texture(key), vertexColors: true });
    materials.set(key, m);
  }
  return m;
}

/** A plain coloured material (leather, a dark gap), lit through the vertex colours. */
function flat(name: string, color: number): THREE.MeshBasicMaterial {
  let m = materials.get(name);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, vertexColors: true });
    materials.set(name, m);
  }
  return m;
}

/** Light that shines by itself (a gem, a vial, the star on the hat): not darkened by the dusk, and it breathes a little (see `pulseMageGlow`). */
function glow(name: string, color: number, opacity = 1): THREE.MeshBasicMaterial {
  let m = materials.get(name);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
    materials.set(name, m);
    glows.push({ mat: m, base: new THREE.Color(color) });
  }
  return m;
}

/** Let the gems and the vial breathe: call with a clock in seconds, as often as you like. */
export function pulseMageGlow(t: number): void {
  const k = 0.88 + 0.12 * Math.sin(t * 2.6);
  for (const g of glows) g.mat.color.copy(g.base).multiplyScalar(k);
  pulseSculptGlow(t);
}

export function disposeMageGear(): void {
  disposeSculptGear();
  for (const m of materials.values()) m.dispose();
  materials.clear();
  glows.length = 0;
  for (const s of spare) s.dispose();
  spare.length = 0;
  props.clear();
  for (const t of textures.values()) t.dispose();
  textures.clear();
}

// ---- the figure -------------------------------------------------------------------------------------------------------

/** Point the faces of a box at a repeating picture one block wide, so a pixel of it is a pixel of the skin; `off` slides it. */
export function tileUv(geo: THREE.BufferGeometry, [w, h, d]: V3, off: [number, number]): void {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0] + off[0], uv.getY(i) * dims[f][1] + off[1]);
    }
  }
  uv.needsUpdate = true;
}

export const snap = (v: number): number => Math.round((((v % 1) + 1) % 1) * 16) / 16;

export function dressMage(ctx: GearCtx): MageRig {
  const batches = new Map<string, { slot: GearSlot; parent: THREE.Object3D; mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
  /** Which piece of armor takes the place of what is being put on now. */
  let slot: GearSlot = 'head';
  /** A block of the outfit: it joins the others of its slot, part and look into one mesh. */
  const put = (parent: THREE.Object3D, mat: THREE.Material, size: V3, at: V3, off?: [number, number]): void => {
    const geo = ctx.box(...size);
    tileUv(geo, size, off ?? [snap(at[0] * 7.3 + at[2] * 3.1), snap(at[1] * 5.1)]);
    geo.translate(...at);
    const key = `${slot}:${parent.id}:${mat.uuid}`;
    let b = batches.get(key);
    if (!b) batches.set(key, (b = { slot, parent, mat, geos: [] }));
    b.geos.push(geo);
  };

  const slots: Record<GearSlot, THREE.Mesh[]> = { head: [], chest: [], legs: [], feet: [] };
  const robe = cloth('robe');
  const hatCloth = cloth('hat');
  const capeCloth = cloth('cape');
  const trim = cloth('trim');
  const leather = flat('leather', 0x58381f);
  const dark = flat('dark', 0x281a48);
  const band = flat('hatBand', 0xb8692a);
  const bandEdge = flat('hatBandEdge', 0x7d4219);
  const gem = glow('gem', 0xb48cff);
  const vial = glow('vial', 0x78e6ff);
  const star = glow('hatStar', 0xffe48a);
  const rune = glow('rune', 0xd6bcff);
  // A trim is one band of the picture (not a stripe of it): slide it so it shows the plain gold.
  const gold: [number, number] = [0.25, 0.4];

  // ---- the hat: a wide brim that dips at the front and lifts at the back and the sides, an orange leather band, and a short crown that
  // tapers to a pinched top.
  slot = 'head';
  const h = ctx.head;
  put(h, hatCloth, [0.84, 0.04, 0.84], [0, 0.372, 0]);
  put(h, hatCloth, [0.7, 0.04, 0.17], [0, 0.352, -0.495]); // the front lip dips
  put(h, hatCloth, [0.17, 0.04, 0.66], [-0.495, 0.392, 0]); // the sides lift
  put(h, hatCloth, [0.17, 0.04, 0.66], [0.495, 0.392, 0]);
  put(h, hatCloth, [0.7, 0.04, 0.17], [0, 0.404, 0.495]); // the back lifts most
  for (const [cx, cz, cy] of [[-1, -1, 0.362], [1, -1, 0.362], [-1, 1, 0.394], [1, 1, 0.394]] as const) put(h, hatCloth, [0.16, 0.04, 0.16], [cx * 0.46, cy, cz * 0.46]);
  put(h, band, [0.55, 0.075, 0.55], [0, 0.43, 0]);
  put(h, bandEdge, [0.56, 0.015, 0.56], [0, 0.4, 0]);
  put(h, bandEdge, [0.56, 0.015, 0.56], [0, 0.462, 0]);
  // The crown rises in steps that narrow and lean back, bends over at the top and droops down the back to a little gold bell.
  for (const [w, ht, cy, cz] of [[0.5, 0.12, 0.512, 0], [0.44, 0.11, 0.627, 0.005], [0.38, 0.1, 0.73, 0.015], [0.32, 0.1, 0.83, 0.035], [0.26, 0.09, 0.92, 0.065], [0.21, 0.09, 0.965, 0.12], [0.17, 0.08, 0.93, 0.19], [0.13, 0.08, 0.87, 0.255], [0.1, 0.08, 0.8, 0.3]] as const) put(h, hatCloth, [w, ht, w], [0, cy, cz]);
  put(h, trim, [0.075, 0.07, 0.075], [0, 0.735, 0.31], gold);  // A gold buckle on the band with a star in it.
  put(h, trim, [0.14, 0.1, 0.02], [0, 0.43, -0.285], gold);
  put(h, star, [0.05, 0.05, 0.02], [0, 0.43, -0.296]);

  // ---- the robe: the body, a gold stripe down the front, a cowl round the neck over a gold ring, a belt with a pouch and a vial.
  slot = 'chest';
  const t = ctx.torso;
  put(t, robe, [0.56, 0.78, 0.31], [0, 1.12, 0]);
  put(t, trim, [0.08, 0.22, 0.02], [0, 1.02, -0.163], gold);
  put(t, robe, [0.46, 0.1, 0.34], [0, 1.455, 0]);
  put(t, trim, [0.5, 0.03, 0.36], [0, 1.395, 0], gold);
  put(t, leather, [0.58, 0.075, 0.325], [0, 0.9, 0]);
  put(t, trim, [0.12, 0.1, 0.02], [0, 0.9, -0.168], gold);
  put(t, dark, [0.05, 0.05, 0.025], [0, 0.9, -0.172]);
  put(t, leather, [0.14, 0.15, 0.09], [0.17, 0.82, -0.185]);
  put(t, dark, [0.15, 0.05, 0.1], [0.17, 0.875, -0.19]);
  put(t, trim, [0.04, 0.04, 0.02], [0.17, 0.835, -0.236], gold);
  put(t, vial, [0.07, 0.11, 0.07], [-0.18, 0.83, -0.19]);
  put(t, leather, [0.05, 0.035, 0.05], [-0.18, 0.905, -0.19]);
  // A chain across the chest in a V, a gem in a gold setting at each shoulder and a pendant where the two sides meet.
  for (const side of [-1, 1]) {
    put(t, trim, [0.09, 0.02, 0.02], [side * 0.14, 1.35, -0.168], gold);
    put(t, trim, [0.08, 0.02, 0.02], [side * 0.075, 1.31, -0.168], gold);
    put(t, trim, [0.04, 0.02, 0.02], [side * 0.03, 1.275, -0.168], gold);
    put(t, trim, [0.1, 0.1, 0.02], [side * 0.2, 1.38, -0.165], gold);
    put(t, gem, [0.06, 0.06, 0.03], [side * 0.2, 1.38, -0.172]);
  }
  put(t, trim, [0.11, 0.11, 0.02], [0, 1.235, -0.165], gold);
  put(t, gem, [0.07, 0.07, 0.03], [0, 1.235, -0.172]);

  // ---- the sleeves, wide at the wrist with a gold cuff, and a cap on each shoulder.
  for (const [arm, s] of [[ctx.armL, -1], [ctx.armR, 1]] as const) {
    put(arm, robe, [0.3, 0.3, 0.3], [0, -0.14, 0]);
    put(arm, robe, [0.33, 0.24, 0.33], [0, -0.41, 0]);
    put(arm, trim, [0.355, 0.05, 0.355], [0, -0.555, 0], gold);
    put(arm, robe, [0.37, 0.09, 0.37], [s * 0.025, 0.03, 0]); // a mantle over the shoulder, edged in gold
    put(arm, trim, [0.375, 0.02, 0.375], [s * 0.025, -0.02, 0], gold);
  }

  // ---- the skirts: one half on each leg, so they swing apart as the legs do and never cut through them; a gold hem.
  slot = 'legs';
  for (const [leg, d] of [[ctx.legL, 0], [ctx.legR, 0.002]] as const) {
    put(leg, robe, [0.27, 0.44, 0.33 + d], [0, -0.21, 0]);
    put(leg, trim, [0.28, 0.045, 0.34 + d], [0, -0.44, 0], gold);
    // Runes of arcane light down the front of the skirt.
    for (const [rx, ry] of [[0, -0.13], [-0.045, -0.21], [0.045, -0.21], [0, -0.29]] as const) put(leg, rune, [0.035, 0.035, 0.012], [rx, ry, -0.172 - d]);
  }

  // ---- the boots: soft leather up to the shin, a gold cuff, a curled toe.
  slot = 'feet';
  for (const [leg, d] of [[ctx.legL, 0], [ctx.legR, 0.002]] as const) {
    put(leg, leather, [0.285, 0.2, 0.3 + d], [0, -0.62, 0]);
    put(leg, dark, [0.29, 0.03, 0.305 + d], [0, -0.7, 0]);
    put(leg, trim, [0.3, 0.035, 0.31 + d], [0, -0.525, 0], gold);
    put(leg, leather, [0.24, 0.06, 0.07], [0, -0.7, -0.18]);
  }

  for (const b of batches.values()) {
    const geo = b.geos.length > 1 ? mergeGeometries(b.geos, false)! : b.geos[0];
    if (b.geos.length > 1) for (const g of b.geos) g.dispose();
    slots[b.slot].push(ctx.add(b.parent, geo, b.mat));
  }

  // ---- the cape: three pieces hung from the neck, each wider than the one above; the back is a deep indigo, the inside a pale lilac.
  const cape: THREE.Group[] = [];
  const hems: [number, number][] = [[0.54, 0.38], [0.6, 0.34], [0.66, 0.3]];
  let top: THREE.Object3D = ctx.torso;
  let y = 1.47;
  hems.forEach(([w, ht], i) => {
    const pivot = new THREE.Group();
    pivot.position.set(0, y, i === 0 ? 0.158 : 0);
    top.add(pivot);
    const geo = ctx.box(w, ht, 0.065);
    tileUv(geo, [w, ht, 0.065], [snap(i * 0.31), snap(i * 0.43)]);
    geo.translate(0, -ht / 2, 0.0325);
    // +x, -x, +y, -y, +z (the back), -z (against the body)
    ctx.add(pivot, geo, [capeCloth, capeCloth, capeCloth, capeCloth, capeCloth, cloth('lining')]);
    if (i === hems.length - 1) {
      const g = ctx.box(w + 0.01, 0.05, 0.075);
      tileUv(g, [w + 0.01, 0.05, 0.075], gold);
      g.translate(0, -ht + 0.01, 0.0325);
      ctx.add(pivot, g, trim);
    }
    cape.push(pivot);
    top = pivot;
    y = -ht;
  });
  // Stars on the back of it: a larger one with four points, and small ones scattered.
  const starMat = glow('capeStar', 0xffe48a);
  const speck = glow('capeSpeck', 0xcfc0ff);
  const lit = (pivot: THREE.Object3D, mat: THREE.Material, size: V3, at: V3): void => {
    const g = ctx.box(...size);
    g.translate(...at);
    ctx.add(pivot, g, mat);
  };
  for (const [w, h] of [[0.05, 0.05], [0.03, 0.11], [0.11, 0.03]] as const) lit(cape[1], starMat, [w, h, 0.012], [0, -0.17, 0.071]);
  for (const [i, sx, sy] of [[0, -0.15, -0.1], [0, 0.17, -0.25], [1, -0.2, -0.08], [1, 0.2, -0.26], [2, -0.22, -0.1], [2, 0.12, -0.2], [2, -0.08, -0.24]] as const) lit(cape[i], speck, [0.02, 0.02, 0.012], [sx, sy, 0.071]);
  return { cape, slots };
}

// ---- what a Mage carries ----------------------------------------------------------------------------------------------
// The staff, the wand and the orb as a figure holds them: real little models of blocks (not flat pictures), in the colours of their first-person
// pictures. Plain colours with a lighter top and a darker underside: they do not glow.

/** How light each face of a box is (+x -x +y -y +z -z, BoxGeometry order): the top bright, the underside dark, so a block reads as a block. */
const PROP_SHADE = [0.86, 0.7, 1.1, 0.5, 0.94, 0.78];

/** A plain colour for a held block: the face shading is in the vertices, the colour in the material. */
function propMat(name: string, color: number): THREE.MeshBasicMaterial {
  let m = materials.get(name);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, vertexColors: true });
    materials.set(name, m);
  }
  return m;
}

function propBox(parent: THREE.Object3D, mat: THREE.Material, size: V3, at: V3): void {
  const geo = new THREE.BoxGeometry(...size);
  const shade = new Float32Array(24 * 3);
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) shade.fill(PROP_SHADE[f], (f * 4 + k) * 3, (f * 4 + k) * 3 + 3);
  geo.setAttribute('color', new THREE.BufferAttribute(shade, 3));
  spare.push(geo);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...at);
  parent.add(mesh);
}

/**
 * A ball of glass made of little cubes, 3 across (the corners left out): a pale heart, a lit side and a shaded one, a glint on the top. `lit`,
 * `mid` and `rim` are the colours from the glint side to the far side; `heart` is the middle.
 */
function propBall(parent: THREE.Object3D, name: string, at: V3, p: number, heart: number, lit: number, mid: number, rim: number): void {
  const mats = [heart, lit, mid, rim].map((c, i) => propMat(`${name}${i}`, c));
  for (let ix = -1; ix <= 1; ix++) {
    for (let iy = -1; iy <= 1; iy++) {
      for (let iz = -1; iz <= 1; iz++) {
        const d = Math.hypot(ix, iy, iz);
        if (d > 1.6) continue; // the corners
        // How lit it is: the upper, left and front cubes catch the light.
        const light = iy * 1.0 + -ix * 0.7 + -iz * 0.7;
        const m = d === 0 ? mats[0] : light > 0.9 ? mats[1] : light > -0.8 ? mats[2] : mats[3];
        propBox(parent, m, [p, p, p], [at[0] + ix * p, at[1] + iy * p, at[2] + iz * p]);
      }
    }
  }
}

function buildProp(kind: 'staff' | 'wand' | 'orb' | 'ember_staff'): THREE.Group {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const wood = propMat('wood', 0x88603a);
  const woodDark = propMat('woodDark', 0x5c3c22);
  const leather = propMat('leather', 0x3e2819);
  const gold = propMat('gold', 0xf0c242);
  const goldDark = propMat('goldDark', 0xbe8c2c);
  // The Hollow King's staff: the same shape in dark stone with lava in its rings, and a flame in the claw instead of the violet ball.
  const ember = kind === 'ember_staff';
  const stone = propMat('emberStone', 0x4a4256);
  const stoneDark = propMat('emberStoneDark', 0x2a2432);
  const stoneLight = propMat('emberStoneLight', 0x766a82);
  const lava = propMat('emberLava', 0xff7a20);
  const lavaHot = propMat('emberLavaHot', 0xffd054);
  if (kind === 'staff' || ember) {
    // Upright, held low at the middle (the grip is a third of the way up the shaft, so the foot hangs just above the ground): a thin
    // shaft of two woods with a leather grip and three brass rings, a foot, and a head of a gold cup, four prongs and a tip round a violet ball.
    // The head is raised on a longer shaft, so the staff stands over the wearer's head.
    const TALL = 0.3;
    for (let i = 0; i < 7; i++) propBox(inner, ember ? (i % 3 === 1 ? lava : i % 2 ? stoneDark : stone) : i % 2 ? woodDark : wood, [0.055, 0.26, 0.055], [0, -0.35 + 0.13 + i * 0.25, 0]);
    propBox(inner, leather, [0.075, 0.22, 0.075], [0, 0.34, 0]);
    for (const y of [0.2, 0.48, 0.78]) propBox(inner, ember ? lava : gold, [0.09, 0.035, 0.09], [0, y, 0]);
    propBox(inner, ember ? lava : gold, [0.075, 0.045, 0.075], [0, -0.37, 0]);
    propBox(inner, ember ? stoneDark : goldDark, [0.1, 0.04, 0.1], [0, 1.15 + TALL, 0]);
    propBox(inner, ember ? stoneLight : gold, [0.19, 0.04, 0.19], [0, 1.2 + TALL, 0]);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        propBox(inner, ember ? (sx * sz > 0 ? stoneLight : stone) : sx * sz > 0 ? gold : goldDark, [0.036, 0.24, 0.036], [sx * 0.085, 1.34 + TALL, sz * 0.085]);
        propBox(inner, ember ? lava : gold, [0.036, 0.036, 0.036], [sx * 0.07, 1.48 + TALL, sz * 0.07]);
      }
    }
    if (ember) {
      propBall(inner, 'emberBall', [0, 1.34 + TALL, 0], 0.075, 0xfff4cc, 0xffd054, 0xff7a20, 0xb83a18);
      // Tongues of flame standing up out of the claw.
      propBox(inner, lava, [0.07, 0.14, 0.07], [0, 1.58 + TALL, 0]);
      propBox(inner, lavaHot, [0.04, 0.12, 0.04], [0, 1.7 + TALL, 0]);
      propBox(inner, lava, [0.04, 0.09, 0.04], [0.07, 1.56 + TALL, 0.02]);
      propBox(inner, lava, [0.04, 0.08, 0.04], [-0.06, 1.55 + TALL, -0.03]);
      propBox(inner, lavaHot, [0.025, 0.05, 0.025], [0, 1.8 + TALL, 0]);
    } else {
      propBall(inner, 'staffBall', [0, 1.34 + TALL, 0], 0.075, 0xf0e4ff, 0xc89cff, 0x9a5cf0, 0x6a38c0);
      propBox(inner, gold, [0.05, 0.06, 0.05], [0, 1.52 + TALL, 0]);
    }
    // Standing straight up beside the hand, which is on the grip (the body keeps it level as the arm swings: see `Character.pose`).
    inner.rotation.set(0, 0, -0.04);
    inner.position.set(0, -0.38, -0.02);
  } else if (kind === 'wand') {
    // A short dark wand along -z with a leather grip and a brass band, and a little cross of gold and violet at its tip.
    propBox(inner, leather, [0.065, 0.065, 0.13], [0, 0, 0.02]);
    propBox(inner, wood, [0.042, 0.042, 0.32], [0, 0, -0.2]);
    propBox(inner, woodDark, [0.042, 0.042, 0.1], [0, 0, -0.34]);
    propBox(inner, gold, [0.07, 0.07, 0.03], [0, 0, -0.1]);
    const gem = propMat('wandGem', 0xb48cff);
    propBox(inner, propMat('wandStar', 0xffd65c), [0.065, 0.065, 0.065], [0, 0, -0.42]);
    for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) propBox(inner, gem, [0.045, 0.045, 0.045], [x * 0.062, y * 0.062, -0.42]);
    propBox(inner, gem, [0.045, 0.045, 0.045], [0, 0, -0.47]);
    inner.rotation.x = 0.5;
  } else {
    // A ball of glass in a little gold cup, hovering at the fist: pale blue light in a heart, blue to indigo toward the glass.
    propBox(inner, goldDark, [0.17, 0.03, 0.17], [0, -0.1, 0]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) propBox(inner, gold, [0.032, 0.1, 0.032], [sx * 0.075, -0.045, sz * 0.075]);
    propBall(inner, 'orbBall', [0, 0.04, 0], 0.07, 0xd2ecff, 0x9cc8ff, 0x5a8ceb, 0x4034a0);
    inner.position.set(0, 0.06, -0.22);
  }
  return root;
}

/** What a figure holds in its hand: a copy that shares the shapes and materials of the first, so nothing needs freeing for it. */
export function mageProp(kind: 'staff' | 'wand' | 'orb' | 'ember_staff'): THREE.Object3D {
  let p = props.get(kind);
  if (!p) {
    p = buildProp(kind);
    props.set(kind, p);
  }
  return p.clone(true);
}
