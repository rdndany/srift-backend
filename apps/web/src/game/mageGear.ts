import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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

type TexKey = 'robe' | 'hat' | 'cape' | 'lining' | 'trim';

/** Folds in the cloth: a dark crease, then lighter and lighter toward the next one. */
export const PLEAT = [-20, -8, 5, 12];

const PAINT: Record<TexKey, (x: number, y: number) => string> = {
  robe: (x, y) => {
    const base: RGB = [98, 62, 178];
    let d = PLEAT[x % 4] + (noise(x, y, 3) - 0.5) * 9;
    if ((x === 5 && y === 3) || (x === 10 && y === 8) || (x === 2 && y === 11) || (x === 13 && y === 13)) return tone([176, 140, 255], 0); // faint arcane specks
    if ((x + y) % 8 === 0) d -= 6;
    return tone(base, d);
  },
  hat: (x, y) => {
    // Felt: a deep purple with a soft grain, no pattern.
    const base: RGB = [82, 50, 150];
    return tone(base, (noise(x, y, 5) - 0.5) * 12 + ((x + y) % 7 === 0 ? -5 : 0));
  },
  cape: (x, y) => {
    const base: RGB = [42, 32, 112];
    if ((x === 4 && y === 4) || (x === 11 && y === 10) || (x === 7 && y === 14)) return tone([140, 118, 230], 0);
    return tone(base, PLEAT[x % 4] * 1.1 + (noise(x, y, 7) - 0.5) * 8);
  },
  lining: (x, y) => {
    const base: RGB = [150, 104, 224];
    return tone(base, ((x + y) % 6 === 0 ? 12 : 0) + (noise(x, y, 9) - 0.5) * 8 - (y % 8 === 7 ? 8 : 0));
  },
  trim: (x, y) => {
    const base: RGB = [226, 180, 64];
    let d = (noise(x, y, 11) - 0.5) * 10;
    if (x % 4 === 0) d -= 24; // engraved lines
    if ((x * 3 + y * 5) % 11 === 0) d += 28; // glints
    return tone(base, d);
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
}

export function disposeMageGear(): void {
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
  put(h, hatCloth, [0.5, 0.13, 0.5], [0, 0.512, 0]);
  put(h, hatCloth, [0.43, 0.12, 0.43], [0, 0.628, 0.01]);
  put(h, hatCloth, [0.35, 0.1, 0.35], [0, 0.735, 0.025]);
  put(h, hatCloth, [0.22, 0.05, 0.3], [0, 0.805, 0.03]); // the pinch along the top

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
    put(arm, robe, [0.32, 0.07, 0.32], [s * 0.005, 0.02, 0]);
  }

  // ---- the skirts: one half on each leg, so they swing apart as the legs do and never cut through them; a gold hem.
  slot = 'legs';
  for (const [leg, d] of [[ctx.legL, 0], [ctx.legR, 0.002]] as const) {
    put(leg, robe, [0.27, 0.44, 0.33 + d], [0, -0.21, 0]);
    put(leg, trim, [0.28, 0.045, 0.34 + d], [0, -0.44, 0], gold);
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

function buildProp(kind: 'staff' | 'wand' | 'orb'): THREE.Group {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const wood = propMat('wood', 0x88603a);
  const woodDark = propMat('woodDark', 0x5c3c22);
  const leather = propMat('leather', 0x3e2819);
  const gold = propMat('gold', 0xf0c242);
  const goldDark = propMat('goldDark', 0xbe8c2c);
  if (kind === 'staff') {
    // Upright, held low at the middle (the grip is a third of the way up the shaft, so the foot hangs just above the ground): a thin
    // shaft of two woods with a leather grip and three brass rings, a foot, and a head of a gold cup, four prongs and a tip round a violet ball.
    // The head is raised on a longer shaft, so the staff stands over the wearer's head.
    const TALL = 0.3;
    for (let i = 0; i < 7; i++) propBox(inner, i % 2 ? woodDark : wood, [0.055, 0.26, 0.055], [0, -0.35 + 0.13 + i * 0.25, 0]);
    propBox(inner, leather, [0.075, 0.22, 0.075], [0, 0.34, 0]);
    for (const y of [0.2, 0.48, 0.78]) propBox(inner, gold, [0.09, 0.035, 0.09], [0, y, 0]);
    propBox(inner, gold, [0.075, 0.045, 0.075], [0, -0.37, 0]);
    propBox(inner, goldDark, [0.1, 0.04, 0.1], [0, 1.15 + TALL, 0]);
    propBox(inner, gold, [0.19, 0.04, 0.19], [0, 1.2 + TALL, 0]);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        propBox(inner, sx * sz > 0 ? gold : goldDark, [0.036, 0.24, 0.036], [sx * 0.085, 1.34 + TALL, sz * 0.085]);
        propBox(inner, gold, [0.036, 0.036, 0.036], [sx * 0.07, 1.48 + TALL, sz * 0.07]);
      }
    }
    propBall(inner, 'staffBall', [0, 1.34 + TALL, 0], 0.075, 0xf0e4ff, 0xc89cff, 0x9a5cf0, 0x6a38c0);
    propBox(inner, gold, [0.05, 0.06, 0.05], [0, 1.52 + TALL, 0]);
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
export function mageProp(kind: 'staff' | 'wand' | 'orb'): THREE.Object3D {
  let p = props.get(kind);
  if (!p) {
    p = buildProp(kind);
    props.set(kind, p);
  }
  return p.clone(true);
}
