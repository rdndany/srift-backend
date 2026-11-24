import * as THREE from 'three';
import { B, BASH_ANIM, BED_DIRS, I, getItem, wingByNumber, type ArmorMaterial, type Carry, type OutfitClass, type OutfitDef, type WingDef } from '@solrift/shared';
import type { EntityLight } from './entityLight';
import { disposeMageGear, pulseMageGlow, type GearCtx, type MageRig } from './mageGear';
import { dressMageSculpt } from './mageLook';
import { dressRangerSculpt } from './rangerLook';
import { dressWarriorSculpt } from './warriorLook';
import { disposeSetGear, dressSet, type SetRig } from './setGear';
import { buildWings, type WingRig } from './wingRig';
import { FlightMotion, type FlightInput } from './flightMotion';
import { disposeClassGear } from './classGear';
import { PAINTED_CLASSES, paintClassSkin } from './classSkin';
import { outfitHead, outfitSole, paintOutfitSkin } from './outfitSkin';
import { HAIR_STYLES, PARTS, THREE_FACE_ORDER, isSkinSize, legacyToModern, paintSkin, partRects, SKIN_SIZE, type FaceName, type Look, type PartName, type Rect } from './skin';
import { StoneHeat } from './held/heat';
import { addAura, stripAura } from './enchantFx';
import { addFlame } from './emberFlame';
import { JOINT_Y, Limb, addToLimb } from './limb';
import { ClassMotion, gaitLegs, gaitRate, stretchAt, type Legs, type Loadout, type MotionClass, type StretchKey } from './classMotion';

/** How high a figure with wings floats above the ground (blocks). */
const WING_HOVER = 0.42;

/**
 * A blocky humanoid dressed from a 64x64 skin (see `skin.ts`): a face with eyes and brows, hair, a hoodie
 * with a belt, gloves, trousers and boots, each on two layers, plus armor drawn over it. One model serves
 * other players in the world, your own body in third person and the preview in the inventory screen.
 * The default skin is painted at run time from a `Palette`; `setSkin` swaps in any other 64x64 picture.
 * The figure faces -z (the direction a player with yaw 0 looks).
 */

export interface Palette {
  shirt: THREE.Color;
  pants: THREE.Color;
  skin: THREE.Color;
  hair: THREE.Color;
  eyes?: THREE.Color;
  /** Hair style, 0..2 (see `HAIR_STYLES`). */
  style?: number;
  seed?: number;
  /** The buckles and the badge (an outfit's trim; brass without one). */
  trim?: THREE.Color;
  /** The set of armor to wear over it all (an outfit of the shop: see `setGear.ts`), or none. */
  outfit?: OutfitDef | null;
}

/** The default look of the local player: an orange hoodie and slate trousers. */
export const DEFAULT_PALETTE: () => Palette = () => ({
  shirt: new THREE.Color('#c8553d'),
  pants: new THREE.Color('#36425e'),
  skin: new THREE.Color('#d9a273'),
  hair: new THREE.Color('#3a2a1e'),
  eyes: new THREE.Color('#3b6aa8'),
  style: 0,
  seed: 1,
});

export function lookOf(p: Palette): Look {
  return {
    shirt: rgb(p.shirt),
    pants: rgb(p.pants),
    skin: rgb(p.skin),
    hair: rgb(p.hair),
    eyes: rgb(p.eyes ?? new THREE.Color('#3b6aa8')),
    style: ((p.style ?? 0) % HAIR_STYLES + HAIR_STYLES) % HAIR_STYLES,
    seed: p.seed ?? 1,
    ...(p.trim ? { trim: rgb(p.trim) } : {}),
  };
}

type RGB = [number, number, number];
/** The colour as sRGB bytes (what a person picked), not the linear values three.js keeps inside. */
const rgb = (c: THREE.Color): RGB => {
  const hex = c.getHex();
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
};
const css = (c: RGB, d = 0): string => `rgb(${clamp(c[0] + d)},${clamp(c[1] + d)},${clamp(c[2] + d)})`;
const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

function noise(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function canvasTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  paint(g);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const px = (g: CanvasRenderingContext2D, x: number, y: number, c: string, w = 1, h = 1): void => {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
};

// ---- armor textures ----------------------------------------------------------------------------

/** Each material has a main plate and a darker trim (belts, cuffs, boots, the crown of a helmet): a whole suit in one tone is what made it look like a brick. */
export type ArmorTone = 'plate' | 'trim';
/** What a piece of armor is made of: the four materials, and the burning stone and the lava of the Hollow King's armor. */
export type ArmorLook = ArmorMaterial | 'ember' | 'lava';
const ARMOR_BASE: Record<ArmorLook, Record<ArmorTone, RGB>> = {
  ember: { plate: [104, 94, 120], trim: [58, 50, 72] },
  lava: { plate: [255, 132, 38], trim: [214, 70, 22] },
  leather: { plate: [160, 102, 62], trim: [92, 58, 36] },
  gold: { plate: [246, 208, 52], trim: [186, 134, 34] },
  iron: { plate: [188, 196, 210], trim: [98, 106, 124] },
  diamond: { plate: [92, 228, 214], trim: [30, 140, 160] },
};

const textureCache = new Map<string, THREE.CanvasTexture>();

/** A 16x16 plate of the material with a bevel and the details that tell the materials apart: stitching, brushed steel and rivets, crystal facets. */
export function armorTexture(material: ArmorLook, hole = false, tone: ArmorTone = 'plate'): THREE.CanvasTexture {
  const key = `${material}-${tone}${hole ? '-hole' : ''}`;
  const hit = textureCache.get(key);
  if (hit) return hit;
  const base = ARMOR_BASE[material][tone];
  const plate = tone === 'plate';
  const t = canvasTexture(16, 16, (g) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        let d = (noise(x, y, 7) - 0.5) * 10;
        let over: RGB | null = null;
        const edge = x === 0 || y === 0 || x === 15 || y === 15;
        if (x === 0 || y === 0) d += 26;
        else if (x === 15 || y === 15) d -= 40;
        if (material === 'leather') {
          d += (noise(x * 3, y * 3, 2) - 0.5) * 16; // grain
          if (plate) {
            // Panels stitched at the edge and sewn down the middle, the thread a pale cream.
            const stitch = ((y === 2 || y === 13) && x >= 2 && x <= 13 && x % 2 === 0) || ((x === 2 || x === 13) && y >= 2 && y <= 13 && y % 2 === 0);
            if (stitch) over = [226, 196, 140];
            else if (x === 7 || x === 8) d -= x === 7 ? 30 : -14;
          } else {
            if ((x === 4 || x === 11) && (y === 4 || y === 11)) over = [238, 194, 84]; // brass studs
            else if (y === 7 || y === 8) d += y === 7 ? -30 : 12;
          }
        } else if (material === 'iron') {
          if (!edge) d += (noise(1, y, 3) - 0.5) * 26; // brushed along the plate
          if (plate) {
            if (y === 7) d -= 40;
            else if (y === 8) d += 18;
            if (!edge && (x === 2 || x === 13) && (y === 2 || y === 13)) over = [236, 240, 248]; // rivet heads
            else if (!edge && (x === 3 || x === 14) && (y === 3 || y === 14)) d -= 50;
          } else {
            d += y % 4 === 0 ? 22 : y % 4 === 1 ? -24 : 0; // ribs
          }
        } else if (material === 'diamond') {
          // Cut like a gem: facets of three lights, bright seams between them, a few sparks.
          const facet = ((x >> 2) + (y >> 2) * 2) % 3;
          d += [-8, 8, -22][facet];
          if (!edge && (x + y) % 8 === 0) d += 28;
          if (!plate) d -= y * 2.4 - 14; // darker toward the foot
          if (noise(x * 5, y * 3, 4) > 0.97) over = [236, 255, 250];
        } else if (material === 'ember') {
          // Dark rough stone with lava breathing through its cracks.
          d += (noise(x * 2, y * 2, 5) - 0.5) * 24;
          const crack = plate ? ((x * 3 + y * 2) % 7 === 0 && noise(x, y, 13) > 0.2) || ((x * 2 - y * 3 + 40) % 9 === 0 && noise(x, y, 17) > 0.45) || ((x === 7 || x === 8) && y > 3 && y < 13 && noise(x, y, 3) > 0.25) : (y === 7 || y === 8) && x % 3 === 0;
          if (crack && !edge) over = noise(x, y, 21) > 0.55 ? [255, 214, 90] : [255, 128, 36];
        } else if (material === 'lava') {
          // Molten: orange with hot gold veins and a few darker clots.
          const n = noise(x * 2, y * 2, 6);
          d += (n - 0.5) * 60;
          if (n > 0.72) over = [255, 226, 120];
          else if (n < 0.2) d -= 40;
        } else {
          d += (noise(x * 3, y * 7, 9) > 0.86 ? 30 : 0) + (plate ? (y === 7 ? -34 : y === 8 ? 16 : 0) : y % 4 === 0 ? 22 : y % 4 === 1 ? -22 : 0);
        }
        px(g, x, y, over && !edge ? css(over, d * 0.4) : css(base, d));
      }
    }
    if (hole) g.clearRect(3, 6, 10, 7); // the face shows through
  });
  textureCache.set(key, t);
  return t;
}

/**
 * What a figure carries: a shield goes on the left arm (whichever hand it is in), everything else in
 * the right hand. With shields in both hands, the one in the hand stays in the hand.
 */
export function figureLoadout(held: number, offhand: number): { hand: number; shield: number } {
  if (held && getItem(held).shield) return { hand: offhand && !getItem(offhand).shield ? offhand : 0, shield: held };
  return { hand: held, shield: offhand };
}

/** The glow (a colour, or null) for what each hand of a figure carries, following `figureLoadout`: a shield in the main hand glows on the arm, the off-hand item in the hand. */
export function figureGlows(held: number, offhand: number, heldGlow: string | null, offGlow: string | null): { hand: string | null; shield: string | null } {
  if (held && getItem(held).shield) return { hand: offhand && !getItem(offhand).shield ? offGlow : null, shield: heldGlow };
  return { hand: heldGlow, shield: offGlow };
}

// The shield hangs in front of the left arm, turned a little outward, and swings up when it is raised.
const SHIELD_REST_POS = new THREE.Vector3(-0.12, -0.42, -0.17);
const SHIELD_REST_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI + 0.45, 0));
const SHIELD_UP_POS = new THREE.Vector3(0.2, -0.6, -0.1);
const SHIELD_UP_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, Math.PI));

// Box face order: +x -x +y -y +z -z. The figure faces -z.
const FACE_SHADE = [0.82, 0.82, 1, 0.55, 0.9, 0.9];

/**
 * A box whose 24 vertices carry a colour each (4 per face), so one material serves all six faces and
 * the sun can still light every face on its own. One draw call per part instead of six: with a hundred
 * players in view this is what keeps the frame rate up.
 */
const box = (w: number, h: number, d: number): THREE.BoxGeometry => {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(24 * 3).fill(1), 3));
  return geo;
};

/**
 * Paint the vertices of a geometry with `tint * light`: each vertex takes the light of the faces its normal leans on
 * (`light` is +x -x +y -y +z -z, as for a box), so a flat face gets its own light and a rounded edge shades smoothly from one to the next.
 */
function paintFaces(geo: THREE.BufferGeometry, tint: THREE.Color, light: ArrayLike<number>): void {
  const attr = geo.getAttribute('color') as THREE.BufferAttribute;
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  const a = attr.array as Float32Array;
  // Sculpted clothes (see sculptGear.ts) carry the colour of each cube, shaded, in `base`: the light is multiplied into it.
  const base = geo.getAttribute('base') as THREE.BufferAttribute | undefined;
  for (let i = 0; i < attr.count; i++) {
    const nx = nor.getX(i);
    const ny = nor.getY(i);
    const nz = nor.getZ(i);
    const wx = nx * nx;
    const wy = ny * ny;
    const wz = nz * nz;
    const l = (wx * (nx >= 0 ? light[0] : light[1]) + wy * (ny >= 0 ? light[2] : light[3]) + wz * (nz >= 0 ? light[4] : light[5])) / (wx + wy + wz || 1);
    a[i * 3] = tint.r * l * (base ? base.getX(i) : 1);
    a[i * 3 + 1] = tint.g * l * (base ? base.getY(i) : 1);
    a[i * 3 + 2] = tint.b * l * (base ? base.getZ(i) : 1);
  }
  attr.needsUpdate = true;
}

/** The metal that picks out each material's trim: brass on leather and steel, a gem on gold. */
const ACCENT: Record<ArmorLook, ArmorLook> = { leather: 'gold', gold: 'diamond', iron: 'gold', diamond: 'gold', ember: 'lava', lava: 'lava' };

/** A block this big is one plate's picture at the scale of the big armor pieces (a 16x16 plate over 0.58 blocks): a small block shows only a part of it. */
function plateUv(geo: THREE.BufferGeometry, w: number, h: number, d: number): void {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const su = Math.min(1, dims[f][0] / 0.58);
    const sv = Math.min(1, dims[f][1] / 0.58);
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
  }
  uv.needsUpdate = true;
}

/** Point the faces of a box at tiles of a strip of `tiles` equal textures: `slotOf(face)` picks the tile. */
function atlasUv(geo: THREE.BufferGeometry, tiles: number, slotOf: (face: number) => number): void {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const inset = 0.03; // keep nearest-filtering from reading the neighbour tile at the edges
  const per = 4;
  for (let f = 0; f < 6; f++) {
    const slot = slotOf(f);
    for (let v = 0; v < per; v++) {
      const i = f * per + v;
      uv.setX(i, (slot + inset + uv.getX(i) * (1 - 2 * inset)) / tiles);
    }
  }
  uv.needsUpdate = true;
}

/** Point the six faces of a box at their places on the 64x64 skin. */
function skinUv(geo: THREE.BufferGeometry, rects: Record<FaceName, Rect>): void {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const inset = 0.02; // keep nearest-filtering from reading the neighbour at the edges
  const per = 4;
  THREE_FACE_ORDER.forEach((name, f) => {
    const r = rects[name];
    // three.js draws the top and bottom faces with the picture the other way up from the net of the skin.
    const flip = name === 'top' || name === 'bottom';
    for (let v = 0; v < per; v++) {
      const i = f * per + v;
      // The vertex's place in its face as the box gave it: 0..1 across, and 0 at the top row of the picture.
      const col = uv.getX(i);
      const row = flip ? uv.getY(i) : 1 - uv.getY(i);
      const x = r.x + inset + col * (r.w - 2 * inset);
      const y = r.y + inset + row * (r.h - 2 * inset);
      uv.setXY(i, x / SKIN_SIZE, 1 - y / SKIN_SIZE);
    }
  });
  uv.needsUpdate = true;
}

/** Glue equal-sized canvas textures side by side into one texture (the sources are not disposed here). */
function strip(sources: THREE.Texture[]): THREE.CanvasTexture {
  const first = sources[0].image as HTMLCanvasElement;
  const canvas = document.createElement('canvas');
  canvas.width = first.width * sources.length;
  canvas.height = first.height;
  const g = canvas.getContext('2d')!;
  sources.forEach((s, i) => g.drawImage(s.image as HTMLCanvasElement, i * first.width, 0));
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** One shared material per armor look (the tint lives in the vertex colours, so characters can share it). */
const armorMaterials = new Map<string, THREE.MeshBasicMaterial>();
const helmetAtlases = new Map<string, THREE.CanvasTexture>();
function armorMaterial(mat: ArmorLook, helmet: boolean, tone: ArmorTone = 'plate'): THREE.MeshBasicMaterial {
  const key = `${mat}-${tone}${helmet ? '-helmet' : ''}`;
  let m = armorMaterials.get(key);
  if (m) return m;
  let map: THREE.Texture;
  if (helmet) {
    const k = `${mat}-${tone}`;
    let atlas = helmetAtlases.get(k);
    if (!atlas) {
      atlas = strip([armorTexture(mat, false, tone), armorTexture(mat, true, tone)]);
      helmetAtlases.set(k, atlas);
    }
    map = atlas;
  } else map = armorTexture(mat, false, tone);
  m = new THREE.MeshBasicMaterial({ map, vertexColors: true, alphaTest: helmet ? 0.5 : 0 });
  armorMaterials.set(key, m);
  return m;
}

/**
 * The figure is drawn at this scale, as Minecraft draws its player: the model is 32 pixels (2 blocks) tall, the body that collides
 * is 1.8, and the drawn figure ends up in between, 1.875 (a little shorter than a door, not as tall as one).
 */
export const BODY_SCALE = 0.9375;

/** One cube of a figure cut into cubes (`Character.voxels`): where it is (blocks, from the feet, facing -z) and its colour (sRGB 0..1). */
export interface SkinVoxel {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
}
/** How far forward (radians) the arm that holds a staff hangs, so the staff stands a little in front of the body. */
/**
 * How the left hand carries something that is not a shield. The arm comes forward and the forearm up, so the thing is held out in front of the
 * body at about the height of the belt and chest (not hung at the hip), and it is kept in its own way as the arm moves (`keep`: how much of the arm's
 * turn is taken back by the wrist; `lean`: how far it tips forward from there). `swing` is how much of the stride the arm still takes.
 */
export interface OffCarry {
  arm: number;
  elbow: number;
  keep: number;
  lean: number;
  scale: number;
  swing: number;
  inward: number;
  turn: number;
  /** tipped out to the side (rad) */
  roll: number;
}
export const OFF_CARRY = {
  /** upright, flame up and a little out */
  torch: { arm: 0.3, elbow: 0.65, keep: 1, lean: -0.15, scale: 1.15, swing: 0.3, inward: 0.05, turn: 0, roll: 0.22 },
  /** point forward and a little up, as a blade held ready */
  dagger: { arm: 0.35, elbow: 0.6, keep: 1, lean: 0.1, scale: 1.1, swing: 0.3, inward: 0.08, turn: 0, roll: 0 },
  /** in the palm, in front of the chest */
  orb: { arm: 0.3, elbow: 0.55, keep: 1, lean: 0, scale: 1.2, swing: 0.3, inward: 0.1, turn: 0, roll: 0 },
  /** held open at the chest, its face to the one who holds it */
  map: { arm: 0.3, elbow: 0.6, keep: 1, lean: -0.55, scale: 0.85, swing: 0.2, inward: 0.15, turn: Math.PI / 2, roll: 0 },
} satisfies Record<string, OffCarry>;
/** The carry of an item that goes in the left hand (not a shield). */
export const offCarryOf = (id: number): OffCarry =>
  id === B.TORCH ? OFF_CARRY.torch : id === I.ORB ? OFF_CARRY.orb : id === I.DAGGER ? OFF_CARRY.dagger : getItem(id).use === 'map' ? OFF_CARRY.map : OFF_CARRY.dagger;

const STAFF_ARM = 0.36;
/** How far (radians) the held staff leans, its head toward the front and its foot back, instead of standing straight up. */
const STAFF_LEAN = 0.2;
/** How far forward (radians) the arm that carries a lantern is held, so the lantern hangs out in front of the body from the ring in the hand. */
const LANTERN_ARM = 0.95;
/** Eating: how far up (radians) the arm is raised to bring the hand to the mouth, how far it is held in toward the middle, and how far the food tilts. */
const EAT_ARM = 1.5;
const EAT_IN = 0.3;
const EAT_TILT = 0.2;
/** Bites per second (the jaw and the hand each make one dip per bite). */
export const CHEWS_PER_SECOND = 4;
/** How long one swing of the arm takes (seconds): a blow, a placed block, one stroke of mining. */
export const SWING_TIME = 0.3;
/** Seconds a stab of the left hand takes. */
export const STAB_TIME = 0.3;

/** The share of the lift of a stepping foot that is still made by raising the whole leg (the knee folding makes the rest). */
const KNEE_LIFT = 0.35;
/** The styles of a jump: feet together, a stride with one leg ahead and one behind, knees pulled up, arms and legs flung out, a long leap at a run, and the flailing of a fall. */
const JUMP_PLAIN = 0;
const JUMP_STRIDE = 1;
const JUMP_TUCK = 2;
const JUMP_STAR = 3;
const JUMP_LEAP = 4;
const JUMP_FALL = 5;
const mix = (a: number, b: number, k: number): number => a + (b - a) * k;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
/** An angle brought to -PI..PI, so that blending towards another angle takes the short way round. */
const wrapPi = (a: number): number => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));

/** The height above the feet at which a swimmer's body lies, in blocks: its back just under the surface, the head clear of it. */
const SWIM_HEIGHT = 0.62;

/**
 * The swimming pose (the front crawl, as the player swims in Minecraft) at a point of the stroke: the body lies face down along the water
 * (`pitch` of the whole body about its middle, tipped up a little when rising and down when sinking by `tilt`), rolling a little with each
 * stroke, with where the root has to be (`y`, `z`) for it to turn about its middle. The arms go right round in turn, one reaching ahead
 * while the other pulls back under the water (`armL`, `armR`), the legs kick in quick alternation (`legL`, `legR`). Angles are the figure's own.
 */
export function swimShape(phase: number, tilt: number): { pitch: number; roll: number; y: number; z: number; armL: number; armR: number; legL: number; legR: number } {
  const pitch = -Math.PI / 2 + tilt;
  const middle = 0.9 * BODY_SCALE;
  return {
    pitch,
    roll: Math.sin(phase) * 0.2,
    y: SWIM_HEIGHT - middle * Math.cos(pitch),
    z: -middle * Math.sin(pitch),
    armL: -phase + 0.2,
    armR: -phase + Math.PI + 0.2,
    legL: 0.12 + 0.45 * Math.sin(phase * 2),
    legR: 0.12 - 0.45 * Math.sin(phase * 2),
  };
}
const easeStep = (x: number): number => {
  const v = clamp01(x);
  return v * v * (3 - 2 * v);
};

/** How far each part of a Shield Bash is in, `t` seconds after it was thrown: the shield drawn back, driven forward, and the squash of the blow. */
interface BashWeights {
  back: number;
  push: number;
  bump: number;
}
function bashWeights(t: number, out: BashWeights): void {
  out.back = easeStep(t / 0.09) * (1 - easeStep((t - 0.09) / 0.07));
  out.push = easeStep((t - 0.09) / 0.07) * (1 - easeStep((t - 0.3) / 0.2));
  out.bump = t > 0.16 ? Math.max(0, 1 - (t - 0.16) / 0.14) : 0;
}

/** One moment of a swing: how far the arm is raised, how far out it is turned, how the shoulders are twisted and how far the body is thrown into it. */
interface SwingKey {
  t: number;
  arm: number;
  out: number;
  twist: number;
  lunge: number;
  /** How far the forearm is folded (a blade or a tool in the hand: cocked at the wind-up, straight at the strike). */
  elbow: number;
  /** The turn of the wrist (added to what keeps the hand's item as it was): the blade goes up over the shoulder, through level, and down across the body. */
  wrist: number;
}
/**
 * A swing: it winds up (the arm up and back with the elbow folded and the blade cocked up over the shoulder, the shoulders turned away),
 * strikes fast (the arm comes down and across the body, the wrist turns the blade through level, the shoulders and the weight thrown forward),
 * follows through (the blade ends low on the far side) and recovers.
 */
const SWING: readonly SwingKey[] = [
  { t: 0, arm: 0, out: 0, twist: 0, lunge: 0, elbow: 0, wrist: 0 },
  { t: 0.22, arm: 2.05, out: 0.5, twist: -0.34, lunge: 0.05, elbow: 1.05, wrist: -1.12 },
  { t: 0.44, arm: 1, out: -0.4, twist: 0.42, lunge: 1, elbow: 0.15, wrist: -2.1 },
  { t: 0.62, arm: 0.45, out: -0.62, twist: 0.36, lunge: 0.75, elbow: 0.1, wrist: -2.6 },
  { t: 1, arm: 0, out: 0, twist: 0, lunge: 0, elbow: 0, wrist: 0 },
];
const smooth = (x: number): number => x * x * (3 - 2 * x);
/** The moment of a swing `p` (0..1 through it), eased between its keys. */
function swingAt(p: number, out: SwingKey): SwingKey {
  let i = 1;
  while (i < SWING.length - 1 && p > SWING[i].t) i++;
  const a = SWING[i - 1];
  const b = SWING[i];
  const k = smooth(Math.min(1, Math.max(0, (p - a.t) / (b.t - a.t))));
  out.arm = a.arm + (b.arm - a.arm) * k;
  out.out = a.out + (b.out - a.out) * k;
  out.twist = a.twist + (b.twist - a.twist) * k;
  out.lunge = a.lunge + (b.lunge - a.lunge) * k;
  out.elbow = a.elbow + (b.elbow - a.elbow) * k;
  out.wrist = a.wrist + (b.wrist - a.wrist) * k;
  return out;
}

export class Character {
  readonly root = new THREE.Group();
  readonly headPivot = new THREE.Group();
  /** The limbs bend at the elbow and the knee (see limb.ts): what dresses them is put on as it was for one stiff piece. */
  readonly armL = new Limb(0.125);
  readonly armR = new Limb(0.125);
  readonly legL = new Limb(-0.125);
  readonly legR = new Limb(-0.125);
  /** Body and everything that is worn on it. */
  readonly torso = new THREE.Group();

  private readonly skinCanvas: HTMLCanvasElement;
  private readonly skinTex: THREE.CanvasTexture;
  private mats: THREE.Material[] = [];
  private textures: THREE.Texture[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private armorGroup: THREE.Object3D[] = [];
  private armorGeos: THREE.BufferGeometry[] = [];
  /** The parts of armor that glow by themselves (the lava of the Hollow King's): never darkened by the light. */
  private armorGlowGeos: THREE.BufferGeometry[] = [];
  private armorKey = '';
  /**
   * The clothes of the classes that are worn (a Warrior's helm, a Mage's robe...): items in the armor slots like any armor, drawn from
   * one rig per class (a Warrior may wear a Mage's hat), built when first worn and freed when no piece of it is left.
   */
  private outfits = new Map<OutfitClass, { rig: MageRig; parts: THREE.Object3D[]; geos: THREE.BufferGeometry[] }>();
  /** The class whose clothes are worn in each armor slot (helmet, chestplate, leggings, boots); null where there are none. */
  private outfitSlot: (OutfitClass | null)[] = [null, null, null, null];
  /** 'leather' in each armor slot that holds a piece of the leather set (painted on the skin like the class outfits). */
  private paintedSlot: (string | null)[] = [null, null, null, null];
  /** The shapes of every rig that is worn (painted with the light, freed with the figure). */
  private classGeos: THREE.BufferGeometry[] = [];
  /** The cape that is worn (it swings as the figure walks), and the lower pieces of one that is made of several (each hangs from the one above and bends a little less than the stride asks). */
  private capePivot: THREE.Group | null = null;
  private capeSegs: THREE.Group[] = [];
  /** What the hero wears as armor, whatever is seen of it (a set of armor takes its place in the picture while one is worn). */
  private wantedArmor: readonly number[] = [];
  /** The set of armor of an outfit that is worn: its blocks, and the light that stands clear of the body. */
  private dressed: { def: OutfitDef; rig: SetRig; parts: THREE.Object3D[]; geos: THREE.BufferGeometry[] } | null = null;
  private fxOn = true;
  private haloOn = true;
  /** The tint and face light last written to the vertex colours; skip the upload when nothing visible changed. */
  private applied = new Float32Array(9).fill(-1);
  private brightness = 1;
  /** Hair that stands off the head (it changes with the style, and takes its colour from the skin), and the buckle: only for the painted looks. */
  private hairMat!: THREE.MeshBasicMaterial;
  private hairMeshes: THREE.Mesh[] = [];
  private hairGeos: THREE.BufferGeometry[] = [];
  private hairStyle = -1;
  /** A helmet of plate is on: the hair blocks (which stand off the head) would poke out of it. */
  private helmed = false;
  /** The plate helmet that is worn (null: none). */
  private helmedBy: ArmorLook | null = null;
  /** The skin without the painted clothes, and the sole of the boots. */
  private readonly baseSkin = new Uint8ClampedArray(SKIN_SIZE * SKIN_SIZE * 4);
  private soleMat: THREE.MeshBasicMaterial | null = null;
  private paintedLook = true;
  private lookBits: THREE.Object3D[] = [];
  /** Where the right hand holds an item: just below the end of the arm, a little forward. */
  private readonly heldMount = new THREE.Group();
  private heldObj: THREE.Object3D | null = null;
  /** The model the glow is on and its colour (see `setHeldGlow`). */
  private glowObj: THREE.Object3D | null = null;
  private glowColor: string | null = null;
  /** The same for what the left arm carries (a shield, or an orb or dagger). */
  private shieldGlowObj: THREE.Object3D | null = null;
  private shieldGlowColor: string | null = null;
  private heldId = 0;
  /** How the held item is carried (see `ItemDef.carry`): in the fist, hanging from it, or as a staff or a wand. */
  private carry: Carry = 'hand';
  /** Where the left hand holds an orb or a dagger (the mirror of the right hand's mount). */
  private readonly offMount = new THREE.Group();
  /** The upper body (chest, head, arms) as one: it tips about the hip, to a side, as the spine bends. Everything above the hip is in it; the legs are not. */
  readonly upper = new THREE.Group();
  /** Where the left arm carries a shield. */
  private readonly shieldMount = new THREE.Group();
  private shieldObj: THREE.Object3D | null = null;
  private shieldId = 0;
  /** The off-hand item is a shield (the only one that is raised to block). */
  private shieldIsShield = false;
  /** How the left hand carries what it holds, when that is not a shield. */
  private offSpec: OffCarry | null = null;
  /** 0..1: how far the shield is raised. */
  private raise = 0;

  /**
   * What makes the figure move as its class does (see classMotion.ts): the weights of fighting, walking and sprinting, the stride, what the body
   * does standing about and what trails behind it. It decides nothing about the bones: this class still writes every one of them.
   */
  readonly motion = new ClassMotion();
  /** Something is going on that is a fight (an enemy near: set by whoever draws the figure each frame): it stands to fight until it is over. */
  engaged = false;
  /** The way the figure goes against the way it faces: ahead (1) or back (-1), and to its right (1) or left (-1), as a share of its speed. 1, 0: forward. */
  moveF = 1;
  moveR = 0;
  private mf = 1;
  private mr = 0;
  private readonly legs: Legs = { r: 0, l: 0, liftR: 0, liftL: 0, step: 0, since: 0, thud: 0, xr: 0, xl: 0, kneeR: 0, kneeL: 0 };
  private readonly load: Loadout = { shield: false, carry: 'none', bow: false };
  private readonly motionIn = { speed: 0, walk: 0, run: 0, amp: 0, air: 0, still: 0, engaged: false, fighting: false, swinging: false, stretching: 0, busy: false, accel: 0, turn: 0, load: this.load };
  /** The stretch being played, and how far the shoulders are turned (the arms go round with them: the torso block alone turns by `torso.rotation.y`). */
  private readonly sk: StretchKey = { t: 0, armLx: 0, armLz: 0, armRx: 0, armRz: 0, armLy: 0, armRy: 0, torsoYaw: 0, lean: 0, headX: 0, headY: 0, headZ: 0, bend: 0, rise: 0 };
  private shoulderTwist = 0;
  private readonly legSpringL = { x: 0, v: 0 };
  private readonly legSpringR = { x: 0, v: 0 };
  /** How far a frame brings the shield and the like to where they are going (a share, not the same at any frame rate: set from the time of the frame). */
  private poseEase = 0.35;
  private static readonly TWIST_AXIS = new THREE.Vector3(0, 1, 0);
  private static readonly twistQ = new THREE.Quaternion();

  /** Move as a Warrior, a Mage or a Ranger (null: none): the way it stands, walks, runs, fights and stretches is the class's own. (Not `setClass`: that is the class of the set that is worn.) */
  setMotionClass(cls: MotionClass | null): void {
    if (cls === this.motion.classId) return;
    this.motion.setClass(cls);
    this.idleAfter = this.motion.stretchAfter;
  }

  constructor(palette: Palette = DEFAULT_PALETTE()) {
    this.root.scale.setScalar(BODY_SCALE);
    const g = (b: THREE.BufferGeometry): THREE.BufferGeometry => {
      this.geos.push(b);
      return b;
    };
    const tex = <T extends THREE.Texture>(t: T): T => {
      this.textures.push(t);
      return t;
    };
    /** One material (vertex-coloured, lit per face by `applyBrightness`) for a texture. */
    const sided = (t: THREE.Texture): THREE.MeshBasicMaterial => {
      const m = new THREE.MeshBasicMaterial({ map: t, vertexColors: true });
      this.mats.push(m);
      return m;
    };

    // The skin: one picture for the whole figure, a base layer and (alpha-tested) an outer layer on each part.
    const canvas = document.createElement('canvas');
    canvas.width = SKIN_SIZE;
    canvas.height = SKIN_SIZE;
    this.skinCanvas = canvas;
    this.writeSkin(paintSkin(lookOf(palette)));
    const skinTex = new THREE.CanvasTexture(canvas);
    skinTex.magFilter = THREE.NearestFilter;
    skinTex.minFilter = THREE.NearestFilter;
    skinTex.generateMipmaps = false;
    skinTex.colorSpace = THREE.SRGBColorSpace;
    tex(skinTex);
    this.skinTex = skinTex;
    const baseMat = sided(skinTex);
    const overMat = new THREE.MeshBasicMaterial({ map: skinTex, vertexColors: true, alphaTest: 0.5 });
    this.mats.push(overMat);

    /** One part: its base box, and the outer layer a hair's breadth bigger. Every geometry has its own vertex colours. */
    const addPart = (parent: THREE.Object3D, part: PartName, x: number, y: number): void => {
      const s = PARTS[part];
      for (const layer of ['base', 'over'] as const) {
        const grow = layer === 'over' ? 0.6 : 0; // pixels, in total
        const geo = g(box((s.w + grow) / 16, (s.h + grow) / 16, (s.d + grow) / 16));

        skinUv(geo, partRects(part, layer));
        const mesh = new THREE.Mesh(geo, layer === 'over' ? overMat : baseMat);
        mesh.position.set(x, y, 0);
        parent.add(mesh);
      }
    };

    addPart(this.headPivot, 'head', 0, 0.1);
    this.headPivot.position.y = 1.65;
    addPart(this.torso, 'body', 0, 1.125);

    /** A limb: its skin is two boxes each (above and below the joint), the lower a hair wider so where the bent lower part passes the side of the upper one it is the one on top. */
    const mkLimb = (pivot: Limb, part: PartName, x: number, y: number): void => {
      pivot.position.set(x, y, 0);
      const s = PARTS[part];
      for (const layer of ['base', 'over'] as const) {
        const grow = layer === 'over' ? 0.6 : 0; // pixels, in total
        const rects = partRects(part, layer);
        const half = (r: Rect, lower: boolean): Rect => ({ x: r.x, y: r.y + (lower ? r.h / 2 : 0), w: r.w, h: r.h / 2 });
        const halves = (lower: boolean): Record<FaceName, Rect> => ({ ...rects, front: half(rects.front, lower), back: half(rects.back, lower), right: half(rects.right, lower), left: half(rects.left, lower) });
        const mat = layer === 'over' ? overMat : baseMat;
        const edge = grow / 32; // how far the outer layer stands beyond the end of the limb, at each end
        const w = (s.w + grow) / 16;
        const d = (s.d + grow) / 16;
        // The upper part: from the pivot (a hair above it, for the outer layer) down to the joint.
        const upperH = -JOINT_Y + edge;
        const upper = g(box(w, upperH, d));
        skinUv(upper, halves(false));
        const um = new THREE.Mesh(upper, mat);
        um.position.set(0, JOINT_Y + upperH / 2, 0);
        pivot.addUpper(um);
        // The lower part, in the space of the joint: from it down to the end of the limb (a hair beyond, for the outer layer).
        const lowerH = -JOINT_Y + edge;
        const lower = g(box(w + 0.004, lowerH, d));
        skinUv(lower, halves(true));
        const lm = new THREE.Mesh(lower, mat);
        lm.position.set(0, -lowerH / 2, -pivot.hinge);
        pivot.shin.add(lm);
      }
    };
    mkLimb(this.armL, 'armL', -0.375, 1.5);
    mkLimb(this.armR, 'armR', 0.375, 1.5);
    // The hand holds things: they go on the forearm, and turn with it at the elbow. (The shield stays on the arm as a whole.)
    this.heldMount.position.set(0, -0.75, -0.12);
    this.armR.add(this.heldMount);
    this.shieldMount.position.copy(SHIELD_REST_POS);
    this.shieldMount.quaternion.copy(SHIELD_REST_Q);
    this.armL.addUpper(this.shieldMount);
    this.offMount.position.set(0, -0.75, -0.12);
    this.armL.add(this.offMount);
    mkLimb(this.legL, 'legL', -0.125, 0.75);
    mkLimb(this.legR, 'legR', 0.125, 0.75);

    // Small blocks on top of the skin: a hair that stands off the head, the buckle, the soles of the boots.
    this.hairMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.mats.push(this.hairMat);
    const brass = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xc9a23a });
    const sole = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x2a1d14 });
    this.mats.push(brass, sole);
    this.soleMat = sole;
    const bit = (parent: THREE.Object3D, mat: THREE.Material, size: [number, number, number], at: [number, number, number]): THREE.Mesh => {
      const mesh = new THREE.Mesh(g(box(...size)), mat);
      mesh.position.set(...at);
      parent.add(mesh);
      return mesh;
    };
    this.lookBits.push(bit(this.torso, brass, [0.1, 0.07, 0.04], [0, 0.906, -0.165]));
    for (const leg of [this.legL, this.legR]) bit(leg, sole, [0.275, 0.05, 0.31], [0, -0.725, -0.03]);

    // The chest, head and arms hang from the spine and the legs from the hips: the spine leans to a side about the hip (see `spineStep`) and the legs stay under the body.
    this.upper.add(this.torso, this.headPivot, this.armL, this.armR);
    this.root.add(this.upper, this.legL, this.legR);
    this.buildHair(lookOf(palette).style);
    this.applyBrightness();
  }

  /** Hair in blocks over the painted hair: a swept top for every style, side locks for the middle one, a long fall at the back for the last. */
  private buildHair(style: number): void {
    this.hairStyle = style;
    for (const m of this.hairMeshes) m.parent?.remove(m);
    for (const geo of this.hairGeos) geo.dispose();
    this.hairMeshes = [];
    this.hairGeos = [];
    const add = (size: [number, number, number], at: [number, number, number]): void => {
      const geo = box(...size);
      const mesh = new THREE.Mesh(geo, this.hairMat);
      mesh.position.set(...at);
      mesh.visible = this.paintedLook && !this.helmed;
      this.headPivot.add(mesh);
      this.hairMeshes.push(mesh);
      this.hairGeos.push(geo);
    };
    if (style === 0) {
      add([0.26, 0.06, 0.16], [0.04, 0.395, -0.12]);
      add([0.14, 0.05, 0.1], [0.06, 0.44, -0.1]);
      add([0.34, 0.1, 0.05], [0, 0.22, 0.295]);
    } else if (style === 1) {
      add([0.26, 0.06, 0.16], [0.04, 0.395, -0.12]);
      add([0.3, 0.05, 0.3], [0, 0.395, 0.05]);
      add([0.14, 0.05, 0.1], [0.06, 0.44, -0.1]);
      add([0.38, 0.2, 0.06], [0, 0.12, 0.295]);
      for (const s of [-1, 1]) {
        add([0.05, 0.16, 0.14], [s * 0.29, 0.2, 0.1]);
        add([0.05, 0.1, 0.1], [s * 0.29, 0.07, 0.12]);
      }
    } else {
      add([0.34, 0.06, 0.34], [0, 0.395, 0]);
      add([0.3, 0.06, 0.06], [0, 0.33, -0.29]);
      add([0.4, 0.34, 0.07], [0, 0, 0.3]);
      add([0.32, 0.18, 0.06], [0, -0.26, 0.31]);
      for (const s of [-1, 1]) add([0.05, 0.3, 0.14], [s * 0.29, 0.05, 0.12]);
    }
    this.sampleHair();
    this.applied.fill(-1);
    this.applyBrightness();
  }

  /** The hair blocks take the colour of the hair on the skin (the middle of its top). */
  private sampleHair(): void {
    try {
      // (From the bare skin: a helm painted on the head must not turn the hair gray.)
      const at = (layer: 'over' | 'base'): Uint8ClampedArray => {
        const r = partRects('head', layer).top;
        const i = (Math.floor(r.y + r.h / 2) * SKIN_SIZE + Math.floor(r.x + r.w / 2)) * 4;
        return this.baseSkin.subarray(i, i + 4);
      };
      let d = at('over');
      if (d[3] < 128) d = at('base');
      this.hairMat.color.setRGB(d[0] / 255, d[1] / 255, d[2] / 255, THREE.SRGBColorSpace);
    } catch {
      this.hairMat.color.set(0x3a2a1e);
    }
  }

  /** The blocks that go with the painted looks (hair, buckle) show only for those: another picture has its own. */
  private showLookBits(show: boolean): void {
    this.paintedLook = show;
    this.fitLookBits();
  }
  /** Wear this picture as the bare skin; the clothes that are painted (see `classSkin.ts`) go over it. */
  private writeSkin(rgba: Uint8ClampedArray): void {
    this.baseSkin.set(rgba);
    this.repaintSkin();
  }

  /** Draw the bare skin with the painted clothes of the armor slots on it. */
  private repaintSkin(): void {
    const g = this.skinCanvas.getContext('2d')!;
    const rgba = this.dressed ? paintOutfitSkin(this.baseSkin, this.dressed.def) : paintClassSkin(this.baseSkin, this.paintSlots());
    g.putImageData(new ImageData(rgba, SKIN_SIZE, SKIN_SIZE), 0, 0);
  }

  /** What is painted on the skin for each armor slot: the class clothes, or the leather of a leather set (a token outfit paints all four: see `outfitSkin.ts`). */
  private paintSlots(): (string | null)[] {
    if (this.dressed) return ['outfit', 'outfit', 'outfit', 'outfit'];
    return this.outfitSlot.map((c, i) => c ?? this.paintedSlot[i]);
  }

  /** Is this armor slot painted on the skin (a class outfit or leather), not built of blocks? */
  private painted(slot: number): boolean {
    const c = this.paintSlots()[slot];
    return c !== null && PAINTED_CLASSES.has(c);
  }

  /** What hangs on the painted look follows what is worn: no buckle over a painted belt, soles in the colour of the boots, and no hair under a helm. */
  private fitLookBits(): void {
    for (const o of this.lookBits) o.visible = this.paintedLook && !this.painted(1);
    this.soleMat?.color.set(this.dressed ? outfitSole(this.dressed.def) : this.paintSlots()[3] === 'iron' ? 0x2c3040 : this.paintSlots()[3] === 'gold' ? 0x68400f : this.paintSlots()[3] === 'diamond' ? 0x0c4254 : this.outfitSlot[3] === 'warrior' ? 0x23252b : this.outfitSlot[3] === 'mage' ? 0x1a0c33 : this.outfitSlot[3] === 'ranger' ? 0x10241a : 0x2a1d14);
    // (A helm is painted over the hair; the hat of a mage or a ranger stands on it.)
    this.helmed = this.helmedBy !== null || this.outfitSlot[0] === 'warrior' || (this.dressed !== null && outfitHead(this.dressed.def) !== null);
    for (const m of this.hairMeshes) m.visible = this.paintedLook && !this.helmed;
  }

  /** Repaint the default skin for another look. */
  setLook(palette: Palette): void {
    this.writeSkin(paintSkin(lookOf(palette)));
    this.skinTex.needsUpdate = true;
    this.showLookBits(true);
    const style = lookOf(palette).style;
    if (style !== this.hairStyle) this.buildHair(style);
    else this.sampleHair();
    this.setOutfit(palette.outfit ?? null);
  }

  /** Wear the set of armor of an outfit (null: none), in place of the armor the hero has on in the picture. */
  setOutfit(def: OutfitDef | null): void {
    if ((this.dressed?.def.id ?? null) === (def?.id ?? null)) return;
    if (this.dressed) {
      const d = this.dressed;
      for (const m of d.parts) m.parent?.remove(m);
      for (const geo of d.geos) geo.dispose();
      d.rig.dispose();
      this.dressed = null;
    }
    if (def) {
      const parts: THREE.Object3D[] = [];
      const geos: THREE.BufferGeometry[] = [];
      const ctx = {
        box,
        add: (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[]): THREE.Mesh =>
          addToLimb(parent, geo, mat, (m, g) => {
            parts.push(m);
            geos.push(g);
          }),
        root: this.root,
        head: this.headPivot,
        torso: this.torso,
        armL: this.armL,
        armR: this.armR,
        legL: this.legL,
        legR: this.legR,
      };
      const rig = dressSet(ctx, def);
      rig.effects.visible = this.fxOn;
      rig.halo.visible = this.haloOn;
      this.dressed = { def, rig, parts, geos };
    }
    this.repaintSkin();
    this.skinTex.needsUpdate = true;
    this.refreshClassGeos();
    this.armorKey = '';
    this.wearArmor(this.dressed ? [0, 0, 0, 0] : this.wantedArmor);
    this.applied.fill(-1); // the new blocks still have plain white vertices
    this.applyBrightness();
  }

  /** How far a worn set reaches above the head and to the sides (blocks): 0 with none. The name tag and the camera of a preview make room for it. */
  get setHeight(): number {
    return this.dressed?.rig.height ?? 0;
  }
  /** The class whose set is worn (null: none). */
  get setClass(): string | null {
    return this.dressed?.def.cls ?? null;
  }
  get setExtent(): number {
    return this.dressed?.rig.extent ?? 0;
  }

  /** Show the light and the wings of a set (off for the arm of the first-person hand, which has the camera in the middle of them). */
  showSetFx(on: boolean): void {
    this.fxOn = on;
    if (this.dressed) this.dressed.rig.effects.visible = on;
  }

  /** Show the glow behind a worn set (a figure drawn on a see-through canvas, as in a menu, is better without it: its edge shows against the page). */
  showSetHalo(on: boolean): void {
    this.haloOn = on;
    if (this.dressed) this.dressed.rig.halo.visible = on;
  }

  /** Move the lights and the wings of a worn set (the figure's own `animate` does this; a figure that is only posed, as in a menu, calls it itself). */
  updateSet(t: number, dt: number, lift = 0): void {
    this.dressed?.rig.update(t, dt, lift);
  }

  private refreshClassGeos(): void {
    this.classGeos = [...[...this.outfits.values()].flatMap((o) => o.geos), ...(this.dressed?.geos ?? [])];
  }

  /**
   * Wear another skin: a 64x64 picture in the standard layout (or the old 64x32 one, whose left arm and leg
   * are made from the right ones). Returns false, changing nothing, for any other size.
   */
  setSkin(source: HTMLCanvasElement | HTMLImageElement | ImageBitmap): boolean {
    const w = source.width;
    const h = source.height;
    if (!isSkinSize(w, h)) return false;
    if (h === SKIN_SIZE) {
      const g = this.skinCanvas.getContext('2d')!;
      g.clearRect(0, 0, SKIN_SIZE, SKIN_SIZE);
      g.drawImage(source, 0, 0);
      try {
        this.baseSkin.set(g.getImageData(0, 0, SKIN_SIZE, SKIN_SIZE).data);
        this.repaintSkin();
      } catch {
        /* a picture that cannot be read back is worn as it is, without painted clothes */
      }
    } else {
      const tmp = document.createElement('canvas');
      tmp.width = w;
      tmp.height = h;
      const t = tmp.getContext('2d')!;
      t.drawImage(source, 0, 0);
      this.writeSkin(legacyToModern(t.getImageData(0, 0, w, h).data));
    }
    this.skinTex.needsUpdate = true;
    this.sampleHair();
    this.showLookBits(false);
    return true;
  }

  /** Put armor on: item ids for [helmet, chestplate, leggings, boots], 0 for nothing. */
  setArmor(ids: readonly number[]): void {
    this.wantedArmor = ids;
    this.wearArmor(this.dressed ? [0, 0, 0, 0] : ids);
  }

  /** Show these pieces of armor (what `setArmor` was asked for, or none while a set of armor stands in for them). */
  private wearArmor(ids: readonly number[]): void {
    const key = ids.join(',');
    if (key === this.armorKey) return;
    this.armorKey = key;
    this.syncOutfits(ids);
    for (const o of this.armorGroup) o.parent?.remove(o);
    this.armorGroup = [];
    for (const geo of this.armorGeos) geo.dispose();
    this.armorGeos = [];
    for (const geo of this.armorGlowGeos) geo.dispose();
    this.armorGlowGeos = [];

    // (The clothes of a class are not plate: they are drawn by their own rig, see `syncOutfits`.)
    const material = (i: number): ArmorLook | null => (ids[i] && !getItem(ids[i]).armor?.outfit ? (getItem(ids[i]).armor?.set === 'hollow_king' ? 'ember' : (getItem(ids[i]).armor?.material ?? null)) : null);

    const piece = (parent: THREE.Object3D, w: number, h: number, d: number, y: number, mat: ArmorLook, faceHole = false, x = 0, tone: ArmorTone = 'plate'): void => {
      const geo = box(w, h, d);
      // A helmet's texture strip has the plain plate first and the one with the face hole second.
      if (faceHole) atlasUv(geo, 2, (f) => (f === 5 ? 1 : 0));
      const mesh = new THREE.Mesh(geo, armorMaterial(mat, faceHole, tone));
      mesh.position.set(x, y, 0);
      parent.add(mesh);
      this.armorGroup.push(mesh);
      this.armorGeos.push(geo);
    };
    /** A small block of armor (a rivet, a spike, a plate edge) at `at` in the parent: the plate's picture at the same scale as on the big pieces. `tilt` turns it about the front-to-back axis. */
    const bit = (parent: THREE.Object3D, mat: ArmorLook, size: [number, number, number], at: [number, number, number], tone: ArmorTone = 'plate', tilt = 0): void => {
      const [w, h, d] = size;
      const geo = box(w, h, d);
      plateUv(geo, w, h, d);
      const mesh = new THREE.Mesh(geo, armorMaterial(mat, false, tone));
      mesh.position.set(...at);
      mesh.rotation.z = tilt;
      parent.add(mesh);
      this.armorGroup.push(mesh);
      (mat === 'lava' ? this.armorGlowGeos : this.armorGeos).push(geo);
    };

    const helmet = material(0);
    const chest = material(1);
    const legs = material(2);
    const boots = material(3);
    const head = this.headPivot;
    // Leather and iron are painted on the skin; only what stands out of it (a button, ear flaps, a brim, shoulder plates) is a block.
    const paintedNow = [helmet, chest, legs, boots].map((m) => (m === 'leather' || m === 'iron' || m === 'gold' || m === 'diamond' ? m : null));
    if (paintedNow.join() !== this.paintedSlot.join()) {
      this.paintedSlot = paintedNow;
      this.repaintSkin();
      this.skinTex.needsUpdate = true;
    }
    this.helmedBy = helmet;
    this.fitLookBits();
    if (helmet) {
      const gem = ACCENT[helmet];
      // The skull is a little smaller than a cube of plate, and the helm is built up from it in steps: a band at the brow, a stepped crown, a guard behind the neck.
      // The face stays open, forehead to chin: a cap over the top of the head, a shell over the back and a plate over each ear.
      if (helmet !== 'leather' && helmet !== 'iron' && helmet !== 'gold' && helmet !== 'diamond') {
        bit(head, helmet, [0.58, 0.16, 0.58], [0, 0.3, 0]);
        bit(head, helmet, [0.58, 0.46, 0.1], [0, 0.12, 0.24]);
        for (const s of [-1, 1]) bit(head, helmet, [0.06, 0.4, 0.4], [s * 0.27, 0.15, 0.08]);
        bit(head, helmet, [0.61, 0.07, 0.61], [0, 0.3, 0], 'trim');
        bit(head, helmet, [0.5, 0.2, 0.04], [0, -0.07, 0.3], 'trim');
      }
      if (helmet === 'leather') {
        // The cap is painted on the head; a button on the crown, a flap over each ear and a brass stud at the brow stand out of it.
        bit(head, helmet, [0.2, 0.06, 0.2], [0, 0.4, 0], 'trim');
        for (const s of [-1, 1]) bit(head, helmet, [0.035, 0.19, 0.17], [s * 0.2775, 0.07, -0.025], 'trim');
        bit(head, gem, [0.06, 0.06, 0.03], [0, 0.27, -0.265]);
      } else if (helmet === 'iron') {
        // A kettle helm: the skull is painted; a thin wide brim, a crown in two steps with a ridge along it, a plate over each ear and a gold stud stand out of it.
        bit(head, helmet, [0.68, 0.03, 0.68], [0, 0.33, 0], 'trim');
        bit(head, helmet, [0.44, 0.07, 0.44], [0, 0.385, 0]);
        bit(head, helmet, [0.28, 0.07, 0.28], [0, 0.455, 0]);
        bit(head, helmet, [0.05, 0.06, 0.42], [0, 0.52, 0], 'trim');
        for (const s of [-1, 1]) bit(head, helmet, [0.035, 0.19, 0.17], [s * 0.2775, 0.07, -0.025], 'trim');
        bit(head, gem, [0.05, 0.05, 0.03], [0, 0.385, -0.235]);
      } else if (helmet === 'gold') {
        // The skull cap is painted; the points of a crown stand on its front and back edge, with a stone set at the brow.
        for (const [x, h] of [[-0.2, 0.08], [-0.1, 0.12], [0, 0.16], [0.1, 0.12], [0.2, 0.08]] as const) {
          bit(head, helmet, [0.07, h, 0.07], [x, 0.35 + h / 2, -0.22], 'trim');
          bit(head, helmet, [0.07, h, 0.07], [x, 0.35 + h / 2, 0.22], 'trim');
        }
        bit(head, gem, [0.07, 0.07, 0.03], [0, 0.27, -0.265]);
      } else if (helmet === 'ember') {
        // A crown of stone horns, each tipped with fire, over a brow band of lava, with a flame standing up out of it.
        bit(head, helmet, [0.5, 0.07, 0.5], [0, 0.4, 0]);
        bit(head, 'lava', [0.62, 0.035, 0.62], [0, 0.255, 0]);
        const tall = [0.14, 0.2, 0.3, 0.2, 0.14];
        [-0.22, -0.11, 0, 0.11, 0.22].forEach((x, k) => {
          const h = tall[k];
          for (const z of [-0.26, 0.26]) {
            bit(head, helmet, [0.07, h, 0.07], [x, 0.43 + h / 2, z], 'trim');
            bit(head, 'lava', [0.05, 0.05, 0.05], [x, 0.43 + h + 0.025, z]);
          }
        });
        for (const s of [-1, 1]) {
          for (const z of [-0.1, 0.1]) {
            bit(head, helmet, [0.07, 0.16, 0.07], [s * 0.28, 0.51, z], 'trim');
            bit(head, 'lava', [0.05, 0.05, 0.05], [s * 0.28, 0.61, z]);
          }
        }
        bit(head, 'lava', [0.1, 0.1, 0.04], [0, 0.3, -0.315]);
        this.armorGroup.push(addFlame(head, [0, 0.55, 0], 0.5, 0.66, 0));
        this.armorGroup.push(addFlame(head, [-0.19, 0.52, 0], 0.3, 0.44, 2));
        this.armorGroup.push(addFlame(head, [0.19, 0.52, 0], 0.3, 0.44, 3));
      } else {
        // A crystal crown: the skull is painted; fins sweep up and out from each temple, a blade stands along the crown, with a gold stud at the brow.
        for (const s of [-1, 1]) {
          bit(head, helmet, [0.05, 0.16, 0.12], [s * 0.32, 0.2, 0], 'plate', s * -0.12);
          bit(head, helmet, [0.05, 0.14, 0.1], [s * 0.37, 0.33, 0.02], 'plate', s * -0.25);
          bit(head, helmet, [0.05, 0.12, 0.08], [s * 0.43, 0.44, 0.04], 'plate', s * -0.4);
        }
        bit(head, helmet, [0.06, 0.12, 0.4], [0, 0.41, 0], 'plate');
        bit(head, helmet, [0.05, 0.1, 0.26], [0, 0.52, 0], 'trim');
        bit(head, gem, [0.06, 0.06, 0.03], [0, 0.27, -0.265]);
      }
    }
    if (chest === 'leather') {
      // The vest and the sleeves are painted; a thin leather cap lies on each shoulder, with a brass stud on it.
      for (const [arm, s] of [[this.armL, -1], [this.armR, 1]] as const) {
        bit(arm, chest, [0.27, 0.05, 0.31], [s * 0.035, 0.02, 0], 'plate', -s * 0.1);
        bit(arm, ACCENT[chest], [0.05, 0.04, 0.05], [s * 0.065, 0.065, 0], 'plate', -s * 0.1);
      }
    } else if (chest === 'iron' || chest === 'gold' || chest === 'diamond') {
      // The cuirass and the sleeves are painted; two thin lames lie on each shoulder like tiles, the upper one tilted further out.
      for (const [arm, s] of [[this.armL, -1], [this.armR, 1]] as const) {
        bit(arm, chest, [0.28, 0.05, 0.34], [s * 0.045, 0.02, 0], 'plate', -s * 0.14);
        bit(arm, chest, [0.22, 0.05, 0.28], [s * 0.07, 0.065, 0], 'trim', -s * 0.28);
        if (chest === 'diamond') bit(arm, chest, [0.06, 0.14, 0.06], [s * 0.1, 0.18, 0], 'trim', -s * 0.35); // a crystal on the shoulder
        else bit(arm, ACCENT[chest], [0.05, 0.04, 0.05], [s * 0.085, 0.105, 0], 'plate', -s * 0.28);
      }
    } else if (chest) {
      const gem = ACCENT[chest];
      // Broad across the chest and narrower at the waist (a plain block of plate is a brick): a breastplate, a waist band under a belt, a collar round the neck.
      piece(this.torso, 0.6, 0.58, 0.34, 1.24, chest);
      piece(this.torso, 0.54, 0.23, 0.3, 0.84, chest);
      bit(this.torso, chest, [0.64, 0.07, 0.37], [0, 0.955, 0], 'trim');
      bit(this.torso, gem, [0.1, 0.09, 0.04], [0, 0.955, -0.19]);
      bit(this.torso, chest, [0.42, 0.08, 0.3], [0, 1.54, 0], 'trim');
      bit(this.torso, chest, [0.1, 0.4, 0.05], [0, 1.26, -0.195], 'trim');
      bit(this.torso, chest, [0.3, 0.4, 0.04], [0, 1.26, 0.19], 'trim');
      for (const s of [-1, 1]) {
        bit(this.torso, chest, [0.18, 0.2, 0.04], [s * 0.17, 1.36, -0.185]);
        bit(this.torso, gem, [0.05, 0.05, 0.04], [s * 0.17, 1.3, -0.21]);
      }
      for (const [arm, s] of [[this.armL, -1], [this.armR, 1]] as const) {
        // A shoulder of three lames laid like tiles, each tilted further outward, with a spike on the top; the upper arm below, an elbow cop, a vambrace down the forearm and a flared cuff.
        bit(arm, chest, [0.4, 0.05, 0.38], [s * 0.05, 0.0, 0], 'plate', -s * 0.16);
        bit(arm, chest, [0.34, 0.05, 0.34], [s * 0.065, 0.06, 0], 'trim', -s * 0.28);
        bit(arm, chest, [0.24, 0.06, 0.28], [s * 0.075, 0.115, 0], 'plate', -s * 0.4);
        bit(arm, chest, [0.06, 0.14, 0.06], [s * 0.11, 0.2, 0], 'trim', -s * 0.35);
        piece(arm, 0.31, 0.34, 0.31, -0.19, chest);
        bit(arm, chest, [0.34, 0.08, 0.34], [0, -0.38, 0], 'trim');
        piece(arm, 0.3, 0.3, 0.3, -0.55, chest); // (no narrower than the sleeve layer of the skin, 0.2875, or its wristband shows through)
        piece(arm, 0.31, 0.17, 0.31, -0.665, chest, false, 0, 'trim');
      }
      if (chest === 'ember') {
        // The heart of the king glows in the breastplate, with a seam of lava down each side, and a horn on each shoulder with a fire on it.
        bit(this.torso, 'lava', [0.26, 0.3, 0.03], [0, 1.27, -0.19]);
        for (const s of [-1, 1]) bit(this.torso, 'lava', [0.03, 0.3, 0.03], [s * 0.2, 1.2, -0.185]);
        for (const [arm, s] of [[this.armL, -1], [this.armR, 1]] as const) {
          bit(arm, chest, [0.07, 0.2, 0.07], [s * 0.14, 0.3, 0], 'trim', -s * 0.45);
          bit(arm, 'lava', [0.05, 0.05, 0.05], [s * 0.2, 0.41, 0]);
          this.armorGroup.push(addFlame(arm, [s * 0.16, 0.36, 0], 0.3, 0.42, s > 0 ? 1 : 4));
        }
      }
    }
    if (legs && legs !== 'leather' && legs !== 'iron' && legs !== 'gold' && legs !== 'diamond') {
      const gem = ACCENT[legs];
      piece(this.torso, 0.54, 0.05, 0.3, 0.745, legs, false, 0, 'trim');
      for (const leg of [this.legL, this.legR]) {
        // A plate over the thigh, a cop at the knee, a greave down the shin, and hanging plates in front.
        piece(leg, 0.3, 0.3, 0.3, -0.16, legs);
        bit(leg, legs, [0.34, 0.05, 0.34], [0, -0.01, 0], 'trim');
        bit(leg, legs, [0.2, 0.2, 0.04], [0, -0.12, -0.17], 'trim');
        bit(leg, legs, [0.12, 0.08, 0.04], [0, -0.26, -0.17]);
        bit(leg, legs, [0.34, 0.1, 0.35], [0, -0.35, 0], 'trim');
        bit(leg, gem, [0.05, 0.05, 0.04], [0, -0.35, -0.19]);
        piece(leg, 0.3, 0.2, 0.3, -0.46, legs);
        if (legs === 'ember') bit(leg, 'lava', [0.06, 0.14, 0.03], [0, -0.12, -0.195]);
      }
    }
    if (boots && boots !== 'leather' && boots !== 'iron' && boots !== 'gold' && boots !== 'diamond') {
      for (const leg of [this.legL, this.legR]) {
        piece(leg, 0.31, 0.26, 0.33, -0.6, boots, false, 0, 'trim');
        bit(leg, boots, [0.35, 0.07, 0.37], [0, -0.465, 0]);
        bit(leg, boots, [0.27, 0.12, 0.1], [0, -0.66, -0.2]);
        bit(leg, boots, [0.33, 0.04, 0.41], [0, -0.73, -0.03], 'trim');
        if (boots === 'ember') {
          bit(leg, 'lava', [0.29, 0.04, 0.37], [0, -0.69, -0.03]);
          this.armorGroup.push(addFlame(leg, [0, -0.7, 0.02], 0.3, 0.3, leg === this.legL ? 2 : 0));
        }
      }
    }
    this.applied.fill(-1); // the new pieces still have plain white vertices
    this.applyBrightness();
  }

  /**
   * Put on the clothes of the classes the armor slots hold: a Warrior's cape, a Mage's hat, a Ranger's quiver, each piece only while it is
   * worn (take the hat off and the head is bare). Positions are in the figure's own units (a block is 1): the head's centre is 0.1 above the
   * neck, and the figure faces -z, so the back is +z.
   */
  private syncOutfits(ids: readonly number[]): void {
    const worn = [0, 1, 2, 3].map((i) => (ids[i] ? (getItem(ids[i]).armor?.outfit ?? null) : null));
    const before = this.outfitSlot.map((c) => (c !== null && PAINTED_CLASSES.has(c) ? c : '')).join();
    this.outfitSlot = worn;
    if (before !== worn.map((c) => (c !== null && PAINTED_CLASSES.has(c) ? c : '')).join()) {
      this.repaintSkin();
      this.skinTex.needsUpdate = true;
    }
    const need = new Set(worn.filter((c): c is OutfitClass => c !== null));
    let changed = false;
    for (const [cls, o] of this.outfits) {
      if (need.has(cls)) continue;
      for (const m of o.parts) m.parent?.remove(m);
      o.rig.cape[0]?.parent?.remove(o.rig.cape[0]);
      for (const geo of o.geos) geo.dispose();
      this.outfits.delete(cls);
      changed = true;
    }
    for (const cls of need) {
      if (this.outfits.has(cls)) continue;
      this.outfits.set(cls, this.dress(cls));
      changed = true;
    }
    this.refreshClassGeos();
    this.fitGear();
    if (changed) {
      this.applied.fill(-1); // the new parts still have plain white vertices
      this.applyBrightness();
    }
  }

  /** Build the clothes of a class: each class is dressed by its own module (see `mageGear.ts`, `classGear.ts`), blocks painted from small pictures. */
  private dress(cls: OutfitClass): { rig: MageRig; parts: THREE.Object3D[]; geos: THREE.BufferGeometry[] } {
    const parts: THREE.Object3D[] = [];
    const geos: THREE.BufferGeometry[] = [];
    const ctx: GearCtx = {
      box,
      add: (parent, geo, mat) =>
        addToLimb(parent, geo, mat, (m, g) => {
          parts.push(m);
          geos.push(g);
        }),
      head: this.headPivot,
      torso: this.torso,
      armL: this.armL,
      armR: this.armR,
      legL: this.legL,
      legR: this.legR,
      hair: this.hairMat,
    };
    const rig = cls === 'warrior' ? dressWarriorSculpt(ctx) : cls === 'mage' ? dressMageSculpt(ctx) : dressRangerSculpt(ctx);
    return { rig, parts, geos };
  }

  /** Light level of the surroundings (0..1): plain white light, the same on every side but for the fixed face shading. */
  setBrightness(b: number): void {
    this.brightness = Math.max(0.3, b);
    this.tint.setScalar(this.brightness);
    this.faceLight.set(FACE_SHADE);
    this.applyBrightness();
  }

  /** Light the figure with one colour (the plain face shading): for the arm of the first-person hand, which is lit as the hand is. */
  setTint(tint: THREE.Color): void {
    this.tint.copy(tint);
    this.faceLight.set(FACE_SHADE);
    this.applyBrightness();
  }

  /** Light the figure like the world: `tint` is the colour reaching it, `env` says where the sun is, `yaw` how the body is turned. */
  setLight(tint: THREE.Color, env: EntityLight, yaw: number): void {
    this.tint.copy(tint);
    env.faces(yaw, this.faceLight);
    this.applyBrightness();
  }

  private readonly tint = new THREE.Color(1, 1, 1);
  private readonly faceLight = new Float32Array(FACE_SHADE);

  private applyBrightness(): void {
    const t = this.tint;
    const f = this.faceLight;
    const a = this.applied;
    // Under about 1% change nobody can see the difference; skip the vertex upload.
    if (
      Math.abs(a[0] - t.r) + Math.abs(a[1] - t.g) + Math.abs(a[2] - t.b) < 0.01 &&
      Math.abs(a[3] - f[0]) + Math.abs(a[4] - f[1]) + Math.abs(a[5] - f[2]) + Math.abs(a[6] - f[3]) + Math.abs(a[7] - f[4]) + Math.abs(a[8] - f[5]) < 0.02
    )
      return;
    a[0] = t.r;
    a[1] = t.g;
    a[2] = t.b;
    for (let i = 0; i < 6; i++) a[3 + i] = f[i];
    for (const geo of this.geos) paintFaces(geo, t, f);
    for (const geo of this.armorGeos) paintFaces(geo, t, f);
    for (const geo of this.classGeos) paintFaces(geo, t, f);
    for (const geo of this.wingRig?.geos ?? []) paintFaces(geo, t, f);
    for (const geo of this.hairGeos) paintFaces(geo, t, f);
  }

  /** The held item glows in this colour (it carries glyphs; null: plain). Call after `setHeld`, which can change the model. */
  setHeldGlow(color: string | null): void {
    const obj = this.heldObj;
    if (this.glowObj === obj && this.glowColor === color) return;
    if (this.glowObj) stripAura(this.glowObj);
    this.glowObj = obj;
    this.glowColor = color;
    if (obj && color) addAura(obj, color);
  }

  /** What the left arm carries glows in this colour (it has glyphs; null: plain). Call after `setShield`, which can change the model. */
  setShieldGlow(color: string | null): void {
    const obj = this.shieldObj;
    if (this.shieldGlowObj === obj && this.shieldGlowColor === color) return;
    if (this.shieldGlowObj) stripAura(this.shieldGlowObj);
    this.shieldGlowObj = obj;
    this.shieldGlowColor = color;
    if (obj && color) addAura(obj, color);
  }

  /**
   * Hold an item in the right hand (id 0 = nothing). The model shares geometry and materials with the
   * first-person hand, so the character never disposes it.
   */
  setHeld(id: number, make: (id: number) => THREE.Object3D | null): void {
    if (id === this.heldId) return;
    this.heldId = id;
    this.carry = getItem(id).carry;
    this.heldBlade = !!id && this.carry === 'hand' && (!!getItem(id).tool || getItem(id).weapon?.kind === 'melee');
    const use = id ? getItem(id).use : undefined;
    this.aimKind = use === 'bow' || use === 'crossbow' ? use : null;
    if (this.heldObj) this.heldMount.remove(this.heldObj);
    this.heldObj = id ? make(id) : null;
    if (this.heldObj) this.heldMount.add(this.heldObj);
  }

  /**
   * Carry what the off hand holds (id 0 = none): a shield hangs on the left arm, an orb or a dagger sits in the left
   * hand. `make` builds its model, as for `setHeld`.
   */
  setShield(id: number, make: (id: number) => THREE.Object3D | null): void {
    if (id === this.shieldId) return;
    this.shieldId = id;
    if (this.shieldObj) this.shieldObj.parent?.remove(this.shieldObj);
    this.shieldObj = id ? make(id) : null;
    this.shieldIsShield = !!id && getItem(id).shield;
    this.offSpec = this.shieldObj && !this.shieldIsShield ? offCarryOf(id) : null;
    this.offMount.scale.setScalar(this.offSpec?.scale ?? 1);
    this.offMount.rotation.y = this.offSpec?.turn ?? 0;
    if (this.shieldObj) (this.shieldIsShield ? this.shieldMount : this.offMount).add(this.shieldObj);
  }

  /**
   * Walk cycle: limbs swing by `swing` radians. `attack` (0..1, while a swing is in progress) lifts
   * the right arm forward and back down; `holding` keeps that arm a little forward, as a person
   * carrying something does. `blocking` brings the left arm, and its shield, up in front of the body.
   */
  pose(swing: number, attack = 0, holding = false, blocking = false, armSwing = swing): void {
    const mo = this.motion;
    // (Straight limbs: the stride, the pose of a fight and the rest bend them where they ask to, in `humanize`.)
    this.armL.bend(0);
    this.armR.bend(0);
    this.legL.bend(0);
    this.legR.bend(0);
    // (What is held in the off hand is turned back against the elbow in `elbows`, so it starts each frame from level: left alone it turns a little more every frame.)
    this.offMount.rotation.x = 0;
    this.offMount.rotation.z = 0;
    this.upper.position.set(0, 0, 0);
    this.upper.rotation.set(0, 0, 0);
    this.armStruck = attack > 0 && attack < 1;
    const wA = mo.combatArms;
    const cp = mo.pose;
    // (Standing to fight with a shield, it is held part way up, over the chest.)
    const stance = this.shieldObj && this.shieldIsShield ? cp.shield * wA : 0;
    this.raise += ((blocking && this.shieldObj && this.shieldIsShield ? 1 : stance) - this.raise) * this.poseEase;
    const r = this.raise < 0.01 ? 0 : this.raise;
    // (The arms are brought to the pose of a fight as far as the class is in it; the stride swings what is left, and a blow is made from there.)
    this.armL.rotation.y = 0;
    this.armR.rotation.y = 0;
    const leftSwing = armSwing + (cp.armLx - armSwing) * wA;
    // (Something carried in the left hand holds the arm out in front, and it swings less. It gives way to the fight, to wings and to the water.)
    const os = this.offSpec;
    const carryW = os ? (1 - this.wingW) * (1 - this.swimW) * (1 - 0.5 * wA) : 0;
    this.armL.rotation.x = os ? leftSwing * (1 - carryW * (1 - os.swing)) + os.arm * carryW : leftSwing * (1 - r) + 1.35 * r;
    this.shieldMount.position.lerpVectors(SHIELD_REST_POS, SHIELD_UP_POS, r);
    this.shieldMount.quaternion.slerpQuaternions(SHIELD_REST_Q, SHIELD_UP_Q, r);
    // A staff is held low on the shaft, the arm a little forward, and stays upright with its foot by the ground however the arm swings.
    const staff = this.carry === 'staff';
    const lantern = this.carry === 'hang';
    const base0 = staff ? STAFF_ARM - armSwing * 0.3 : lantern ? LANTERN_ARM - armSwing * 0.25 : -armSwing + (holding ? 0.35 : 0);
    const base = lantern ? base0 : base0 + (cp.armRx - base0) * wA;
    let right = base;
    let lift = 0;
    const swinging = attack > 0 && attack < 1;
    const cast = staff || this.carry === 'wand';
    if (swinging) {
      swingAt(attack, this.sw);
      if (cast) {
        // A staff or a wand is raised and brought down to cast (not chopped with).
        lift = Math.sin(Math.sqrt(attack) * Math.PI) * 1.5;
        right += lift;
        // (the body only leans into it a little)
        this.sw.arm = this.sw.out = this.sw.elbow = this.sw.wrist = 0;
        this.sw.twist *= 0.3;
        this.sw.lunge *= 0.4;
      } else {
        right += this.sw.arm;
        lift = this.sw.arm;
        // (only a blade or a tool is swung from the wrist and the elbow; a placed block is not)
        if (!this.heldBlade) this.sw.elbow = this.sw.wrist = 0;
      }
    } else {
      this.sw.arm = this.sw.out = this.sw.twist = this.sw.lunge = this.sw.elbow = this.sw.wrist = 0;
    }
    this.armR.rotation.x = right;
    // A staff or a wand is cast with its tip, so as the arm comes up it turns against it and ends up aimed forward (left alone it would turn
    // over with the arm and point its foot at the target).
    // (A weapon in the hand keeps its way as far as the class asks when the arm is brought up for the fight: a blade is not carried pointing at the ground.)
    const keep = -(base - base0) * cp.keep;
    this.heldMount.rotation.x = staff ? -base - STAFF_LEAN - lift * 1.9 : this.carry === 'wand' ? -lift * 1.1 + keep : keep + this.sw.wrist;
    this.legL.rotation.x = -swing;
    this.legR.rotation.x = swing;
    // The cape hangs a little off the back and streams out further the faster the figure walks, and trails the speeding up and the stopping.
    this.setCape(-(0.07 + Math.min(1, Math.abs(swing) / 0.8) * 0.5) + mo.second.capeX);
  }

  /** Show each piece of clothes only while it is worn, and the cape only with the chest piece it belongs to. */
  private fitGear(): void {
    const names = ['head', 'chest', 'legs', 'feet'] as const;
    this.capePivot = null;
    this.capeSegs = [];
    for (const [cls, o] of this.outfits) {
      names.forEach((name, i) => {
        const on = this.outfitSlot[i] === cls;
        for (const m of o.rig.slots[name]) {
          m.visible = on;
          // (A piece on a limb is cut at the joint: the lower half is the twin of the upper.)
          const twin = m.userData.twin as THREE.Object3D | undefined;
          if (twin) twin.visible = on;
        }
      });
      const cape = o.rig.cape[0];
      const hangs = this.outfitSlot[1] === cls;
      if (cape) cape.visible = hangs;
      if (cape && hangs) {
        this.capePivot = cape;
        this.capeSegs = o.rig.cape.slice(1);
        cape.position.z = 0.158;
      }
    }
  }

  /** Swing the cape back by `a` radians (negative: away from the back). A cape of several pieces bends: each lower piece turns a little further. */
  private capeA = 0;
  private setCape(a: number): void {
    this.capeA = a;
    if (!this.capePivot) return;
    this.capePivot.rotation.x = a;
    this.capePivot.rotation.z = this.motion.second.capeZ;
    // The lower pieces follow the stride a little less, and always hang a touch further out: the cape billows toward its hem.
    const bend = [0.4, 0.3];
    this.capeSegs.forEach((s, i) => (s.rotation.x = a * (bend[i] ?? 0.3) - 0.08));
  }

  // ---- locomotion ------------------------------------------------------------------------------
  private gait = 0;
  /** 0..1: how much the figure is at its meal (eased), and the seconds it has been chewing. */
  private eatK = 0;
  private chew = 0;
  /** The speed, eased: the speed that comes in jumps (a network update, a stop) must not make the stride jump with it. */
  private spd = 0;
  /** 0..1: how much of a stride the body is making (it eases in and out instead of switching). */
  private amp = 0;
  private lean = 0;
  private bank = 0;
  private clock = 0;
  /** 0..1: how far into the air pose (arms up, legs split) the body is. */
  private air = 0;
  private wasAir = false;
  /** Which leg leads in the air, and the fastest fall of this jump (how hard the landing is). */
  private legDir = 1;
  /** Which way it goes in the air against the way it faces: ahead (1) or back (-1), to the right (1) or to the left (-1); straight ahead while it hardly moves. */
  private airF = 1;
  private airS = 0;
  /** How fast the body is turning (radians a second, positive to the left). */
  private turnNow = 0;
  private fallV = 0;
  /** The style of the jump in progress (JUMP_*), and the seconds since it left the ground. */
  private jumpStyle = 0;
  private airT = 0;
  /** The pose of the jump this frame (see `jumpShape`). */
  private readonly jp = { lead: 0, trail: 0, leadLift: 0, trailLift: 0, armLead: 0, armTrail: 0, spread: 0, legSpread: 0, lean: 0, twist: 0 };
  /** Seconds since the last landing, and how hard it was (0..1): the body crouches into it and springs back. */
  private landT = 9;
  private landKick = 0;
  /** A Ground Slam, set by the caller before `animate`: 1 crouching, 2 in the air, 3 down on the shield after the blow, 0 none. */
  slamPhase = 0;
  /** How far each part of the slam is in (0..1, eased): the crouch, the rise with the weapon to the sky, the dive on the shield, the blow. */
  private readonly slamW = { wind: 0, up: 0, fall: 0, hit: 0 };
  /** Seconds since the slam last changed phase (the crouch deepens, the blow lands and settles by it), the phase it was in, and the speed of the fall. */
  private slamT = 0;
  private slamWas = 0;
  private slamVy = 0;
  /** A Shield Bash, set by the caller before `animate`: seconds since it was thrown (`BASH_ANIM` and more, the default: none). */
  bashAge = 9;
  /**
   * A bow or a crossbow in the hand (null: neither). The caller sets how far it is drawn (0..1: a bow's draw, a crossbow wound to 1 and held) and
   * the way the player looks (positive: up) before `animate`: the figure raises it, draws it, lets go of it (it is seen to let go by the draw
   * dropping back) and lowers it again.
   */
  aimKind: 'bow' | 'crossbow' | null = null;
  aimDraw = 0;
  aimPitch = 0;
  private aimW = 0;
  private aimPrev = 0;
  private shotAge = 9;
  private shotPull = 0;
  /** Seconds since the left hand last stabbed (a dagger in it, the bow put away); `STAB_TIME` and more: not stabbing. */
  stabAge = 9;
  /** Running at a Charge: the body goes in low over the shield with the weapon arm swept back (set by whoever draws the figure). */
  charging = false;
  private chargeW = 0;
  /** Casting the Emberstone (how far into the cast, 0..1; 0 when not): the figure stands with the stone held up, reaching for the sky. The same for every class. */
  casting = 0;
  private castW = 0;
  private castT = 0;
  private readonly heat = new StoneHeat();
  private readonly bashK: BashWeights = { back: 0, push: 0, bump: 0 };
  /**
   * Standing about: after `idleAfter` seconds quite still the figure does something (sits down, stretches, looks around); moving, jumping,
   * fighting, eating or turning ends it. Which one (IDLE_SIT.., 0 none), seconds still, seconds into this one, a pause before the next, and how far
   * each is in (eased).
   */
  idleAfter = 30;
  private idleKind = 0;
  private idleLast = 0;
  private idleT = 0;
  private idleClock = 0;
  private idleWait = 0;
  private readonly idleW = { sit: 0, stretch: 0, look: 0 };
  /** The bend of the waist as a spring (it follows what the pose asks for, a little late, and overshoots a little), and the head the same, more loosely. */
  private waist = { x: 0, v: 0 };
  private neck = { x: 0, v: 0 };
  /** The vertical speed a frame ago and how fast it is changing (eased): the head lags behind a spring and a landing. */
  private lastVy = 0;
  private liftAccel = 0;
  /**
   * A body that moves like a person instead of a machine. Call once a frame instead of `pose`:
   * `speed` (blocks/s) sets the stride, `turn` (radians/s, positive to the left) leans the body into a turn and shuffles the feet
   * when turning on the spot, `vy` and `airborne` give the jump its arms-up leap, its fall with the arms out, and a crouch on landing.
   * Everything eases: the stride in and out, the lean, the air pose; the legs swing, the arms swing against them a beat later,
   * the shoulders twist against the hips, the body dips a little with each step and breathes when still.
   */
  animate(dt0: number, speed: number, turn: number, attack = 0, holding = false, blocking = false, vy = 0, airborne = false, eating = false): void {
    const dt = Math.min(dt0, 0.05);
    const ease = (rate: number): number => 1 - Math.exp(-dt * rate);
    this.poseEase = 1 - Math.exp(-dt * 24);
    const resp = this.motion.profileNow.response;
    // Eating: the food comes up to the mouth and the jaw works. It eases in and out; the chewing runs on its own clock, from the first bite.
    this.eatK += ((eating ? 1 : 0) - this.eatK) * ease(eating ? 14 : 10);
    if (this.eatK < 0.003) this.eatK = 0;
    if (eating) this.chew += dt;
    else if (this.eatK === 0) this.chew = 0;
    this.spd += (speed - this.spd) * ease(resp.speed);
    const spd = this.spd < 0.05 ? 0 : this.spd;
    const walk = Math.min(1, spd / 4);
    // (a walk is 4.3 blocks a second and a sprint 5.9, a little more for a quick class: that is the range of walking to running)
    const run = Math.min(1, Math.max(0, spd - 4.6) / 1.6);
    const shuffle = spd < 0.3 ? Math.min(0.4, Math.abs(turn) * 0.08) : 0;
    this.amp += (Math.max(walk, shuffle) - this.amp) * ease(resp.amp);
    if (this.amp < 0.002) this.amp = 0;
    this.clock += dt;
    // Which way it goes against the way it faces (a figure that aims while it walks goes sideways and back as well as forward).
    this.mf += (this.moveF - this.mf) * ease(14);
    this.mr += (this.moveR - this.mr) * ease(14);
    // Which way it goes in a jump against the way it faces (nothing in particular while it hardly moves), and how fast it turns.
    const going = clamp01((spd - 0.8) / 2.2);
    this.airF = 1 + (Math.max(-1, Math.min(1, this.mf)) - 1) * going;
    this.airS = Math.max(-1, Math.min(1, this.mr)) * going;
    this.turnNow = turn;
    const gaitNow = this.motion.gait;
    // The gait turns at the pace that keeps the foot on the ground going back as fast as the ground goes by (see `gaitRate`).
    if (this.amp > 0) this.gait += (spd > 0.3 ? gaitRate(spd, gaitNow, this.amp * Math.min(1, Math.abs(this.mf) + 0.7 * Math.abs(this.mr)), Character.LEG, BODY_SCALE) : 6) * dt;

    // The jump: leaves the ground with a leading leg and the arms thrown up, falls with the arms out, lands crouched.
    if (airborne && !this.wasAir) {
      this.legDir = Math.sin(this.gait) >= 0 ? 1 : -1;
      this.fallV = 0;
      this.airT = 0;
      // The style of this jump: off a ledge it is a fall (the limbs flail); otherwise it depends on the speed it is taken at (a run takes a long
      // leaping stride, a walk a stride or a tuck, standing still a plain jump, a tuck or a star), with a little luck among them.
      const luck = Math.random();
      const sp = this.spd;
      if (vy < 1) this.jumpStyle = JUMP_FALL;
      // (Sideways or backward there is no long stride to take: the knees come up, or the body is flung wide.)
      else if (sp > 1.2 && this.airF < 0.55) this.jumpStyle = luck < 0.55 ? JUMP_TUCK : luck < 0.85 ? JUMP_PLAIN : JUMP_STAR;
      else if (sp > 5) this.jumpStyle = luck < 0.8 ? JUMP_LEAP : JUMP_STRIDE;
      else if (sp > 1.2) this.jumpStyle = luck < 0.55 ? JUMP_STRIDE : luck < 0.8 ? JUMP_TUCK : JUMP_PLAIN;
      else this.jumpStyle = luck < 0.45 ? JUMP_PLAIN : luck < 0.75 ? JUMP_TUCK : JUMP_STAR;
    }
    if (airborne) this.airT += dt;
    if (airborne) this.fallV = Math.max(this.fallV, -vy);
    else if (this.wasAir && this.fallV > 2) {
      this.landKick = Math.min(1, this.fallV / 12);
      this.landT = 0;
    }
    this.wasAir = airborne;
    this.air += ((airborne ? 1 : 0) - this.air) * ease(airborne ? 16 : 12);
    if (this.air < 0.002) this.air = 0;
    this.landT += dt;
    const u = this.landT / 0.34;
    const crouch = u < 1 ? this.landKick * Math.sin(Math.PI * Math.pow(u, 0.6)) : 0;
    const air = this.air;
    const rise = Math.max(-1, Math.min(1, vy / 7));

    const g = gaitNow;
    const a = this.amp * (1 - air);
    const s = Math.sin(this.gait);
    const lg = gaitLegs(this.gait, g, this.amp, this.mf, this.legs);
    // (How far the legs swing, as far as the cape and the like are told.)
    const walkLegs = lg.step * g.stride * a;
    const legs = walkLegs * (1 - air) + this.legDir * (0.5 + 0.15 * rise) * air;
    // (On wings the stride does not swing the arms: see `wingStep`.)
    const arms = Math.sin(this.gait - g.armLag) * g.armSwing * a * (1 - 0.9 * this.wingW);
    // A Ground Slam: each part comes in quickly, the dive and the way out more slowly. The shield is out in front for all of it.
    const sk = this.slamW;
    const ph = this.slamPhase;
    if (ph !== this.slamWas) {
      this.slamWas = ph;
      this.slamT = 0;
    }
    this.slamT += dt;
    this.slamVy = vy;
    // The blow is the landing: no second crouch on top of it.
    if (ph === 3) this.landT = 9;
    const goes = (v: number, on: boolean, rin: number, rout: number): number => v + ((on ? 1 : 0) - v) * ease(on ? rin : rout);
    sk.wind = goes(sk.wind, ph === 1, 16, 12);
    sk.up = goes(sk.up, ph === 2 && vy > 0.5, 18, 10);
    sk.fall = goes(sk.fall, ph === 2 && vy <= 0.5, 10, 9);
    sk.hit = goes(sk.hit, ph === 3 && this.slamT < 0.16, 24, 9); // held for a moment, then it lets go while the figure is still counted as down
    if (sk.wind + sk.up + sk.fall + sk.hit < 0.002) sk.wind = sk.up = sk.fall = sk.hit = 0;
    // A Shield Bash: the shield (raised in front for it) is drawn back and driven forward, the body going with it.
    const bashing = this.bashAge < BASH_ANIM;
    if (bashing) bashWeights(this.bashAge, this.bashK);
    else this.bashK.back = this.bashK.push = this.bashK.bump = 0;
    // A Charge: the shield goes up in front and the body in behind it at once; it lets go a little more slowly.
    this.chargeW += ((this.charging ? 1 : 0) - this.chargeW) * ease(this.charging ? 22 : 9);
    if (this.chargeW < 0.002) this.chargeW = 0;
    // The Emberstone: the stone is lifted over a moment, and let go of more quickly.
    this.castW += ((this.casting > 0 ? 1 : 0) - this.castW) * ease(this.casting > 0 ? 7 : 12);
    if (this.castW < 0.002) this.castW = 0;
    this.castT = this.casting > 0 ? this.castT + dt : 0;
    const charged = this.chargeW > 0.05 || this.castW > 0.05;
    this.idleStep(dt, speed, turn, attack, blocking || bashing || charged, airborne, eating);
    {
      // What the class makes of it all: how far it is in a fight, a walk, a run, a stretch; what it does standing; what trails behind.
      const mi = this.motionIn;
      mi.speed = this.spd;
      mi.walk = walk;
      mi.run = run;
      mi.amp = this.amp;
      mi.air = air;
      mi.still = (1 - this.amp) * (1 - air);
      mi.engaged = this.engaged && !this.riding;
      // (A swing alone is not a fight: the same swing breaks a block. Blocking, drawing a bow, an ability or a spell are.)
      mi.fighting = blocking || this.aimDraw > 0.02 || ph > 0 || bashing || charged || this.stabAge < STAB_TIME * 2;
      mi.swinging = attack < 1;
      mi.stretching = this.idleW.stretch;
      mi.busy = attack < 1 || blocking || eating;
      mi.accel = this.accel;
      mi.turn = turn;
      this.load.shield = !!this.shieldObj && this.shieldIsShield;
      this.load.carry = this.heldId ? this.carry : 'none';
      this.load.bow = this.aimKind !== null;
      this.motion.update(dt, mi);
    }
    this.pose(legs, attack, holding, blocking || ph > 0 || bashing || charged, arms);
    // The legs go by the gait (the stride that keeps each foot on the ground), as far as they are not in the air.
    if (air < 1) {
      const onGround = 1 - air;
      this.legR.rotation.x += (lg.r - this.legR.rotation.x) * onGround;
      this.legL.rotation.x += (lg.l - this.legL.rotation.x) * onGround;
    }

    // The breath (it is gone as the body moves, and the class says how it breathes) and its size.
    const idleNow = this.motion.idle;
    const breath = idleNow.breath;
    const still = (1 - this.amp) * (1 - air);
    // Sink into a landing and when a foot lands (the dip of the hips in the stride itself is made by planting the feet: see `plantFeet`).
    this.root.position.y = -0.15 * crouch - g.impact * lg.thud * (1 - air) + breath * idleNow.shoulder * 0.5;
    this.root.scale.set(1 + 0.05 * crouch, 1 - 0.07 * crouch + 0.03 * Math.max(0, rise) * air, 1 + 0.05 * crouch).multiplyScalar(BODY_SCALE);
    // Lean forward as the speed rises, into a turn and into a landing.
    this.lean += ((-0.03 * walk - 0.07 * run) - this.lean) * ease(6);
    this.bank += (Math.max(-0.07, Math.min(0.07, turn * 0.02)) * (0.4 + 0.6 * walk) - this.bank) * ease(5);
    this.root.rotation.x = this.lean - 0.14 * crouch;
    // (In the air the body leans into the way it goes: to the side it is going, and into a turn more than on the ground.)
    this.root.rotation.z = this.bank * (1 - air) + air * (Math.max(-0.2, Math.min(0.2, this.turnNow * 0.03)) - this.airS * 0.16);
    // Shoulders against hips; the arms hang a touch out and in again as the chest breathes.
    this.shoulderTwist = 0;
    this.torso.rotation.y = -s * g.shoulderYaw * a;
    this.shoulderTwist = this.torso.rotation.y;
    this.torso.position.y = breath * idleNow.shoulder * 0.5;
    const out = 0.03 + breath * idleNow.shoulder * 2.5 + a * 0.03;
    // In the air the arms fly up and forward on the way up, and out to the sides on the way down.
    const airX = 0.35 + 1.25 * Math.max(rise, 0);
    const airZ = 0.3 + 0.55 * Math.max(-rise, 0) + 0.15 * Math.max(rise, 0);
    const wL = (1 - this.raise) * air;
    const wR = (holding || (attack > 0 && attack < 1) ? 0.35 : 1) * air;
    this.armL.rotation.x += (airX - this.armL.rotation.x) * wL + 0.45 * crouch * (1 - this.raise);
    this.armR.rotation.x += (airX - this.armR.rotation.x) * wR + 0.45 * crouch * (holding ? 0.5 : 1);
    this.armL.rotation.z = -out * (1 - wL) - airZ * wL;
    this.armR.rotation.z = out * (1 - wR) + airZ * wR;
    // A lantern hangs straight down from the hand whatever the arm does.
    if (this.carry === 'hang') this.heldMount.rotation.x = -this.armR.rotation.x;
    this.headPivot.position.y = 1.65 + breath * idleNow.shoulder * 0.5;
    const eatK = this.eatK;
    if (eatK > 0) {
      // The right arm folds up to the face (held in toward the middle) and the hand bobs with each bite; the head dips a little to meet it.
      const e = eatK * eatK * (3 - 2 * eatK);
      const bite = Math.abs(Math.sin(this.chew * Math.PI * CHEWS_PER_SECOND));
      this.armR.rotation.x += (EAT_ARM - this.armR.rotation.x + bite * 0.16) * e;
      this.armR.rotation.z += (-EAT_IN - this.armR.rotation.z) * e;
      this.armR.rotation.y = -0.6 * e;
      this.heldMount.rotation.x += (EAT_TILT + bite * 0.12) * e;
      this.headPivot.rotation.x += bite * 0.1 * e;
    } else this.armR.rotation.y = 0;
    if (this.outfits.has('mage')) pulseMageGlow(this.clock);
    this.dressed?.rig.update(this.clock, dt, Math.min(1, this.spd / 6));
    if (this.capeSegs.length) {
      // The cape ripples: the lower pieces sway a little, more when the figure is on the move.
      const sway = 0.02 + 0.05 * Math.min(1, this.spd / 6);
      this.capeSegs.forEach((s, i) => (s.rotation.z = Math.sin(this.clock * (2.1 + i * 0.6) + i * 1.7) * sway * (i + 1)));
    }
    if (this.riding) {
      this.restPose();
      this.sit(spd, attack, holding, rise, air);
    } else this.humanize(dt, ease, { s, a, walk, run, air, rise, crouch, still, breath, eatK, wL, wR });
    this.swimStep(dt, ease, vy);
    // (Whatever the hands are doing, a swing, a block, a bite, a bow drawn, a spell, is theirs: the pose of the wings leaves them alone.)
    const busy = attack < 1 || blocking || bashing || charged || ph > 0 || eatK > 0.05 || this.aimDraw > 0.02 || this.stabAge < STAB_TIME;
    this.wingStep(dt, ease, vy, turn, busy, holding);
  }

  /**
   * The wings on the back (see wingRig.ts), the number the wire gives (1 + the place in WINGS, 0: none), and whether the wearer flies on them. What they
   * do and what the body does with them (floating, the takeoff, the flight, the bank, the landing) is worked out in flightMotion.ts; this class only
   * says what the body is doing and writes down what comes back, so nothing else moves these joints.
   */
  private wingRig: WingRig | null = null;
  private wingDef: WingDef | null = null;
  private wingNo = 0;
  wingFlying = false;
  private wingW = 0;
  private readonly flight = new FlightMotion();
  private readonly flightIn: FlightInput = { wings: false, flying: false, speed: 0, vy: 0, turn: 0, accel: 0, cls: null, top: 7.3, shape: null, brace: 0, combat: 0 };
  /** How much the hands are busy with something (0..1, eased): the pose of the wings gives way to it. */
  private wingBusy = 0;
  /** How much room there is over the figure's head (blocks, 4: plenty). A figure with wings floats as high as there is room for, so its head does not go through a low door or a roof. */
  roof = 4;
  private hover = WING_HOVER;

  /** Wear this pair of wings (0: none). Put on, they open from folded (see `FlightMotion.equip`); the same pair put on again is left alone. */
  setWings(no: number): void {
    if (no === this.wingNo) return;
    this.wingNo = no;
    this.wingRig?.dispose();
    this.wingRig = null;
    const def = wingByNumber(no);
    this.wingDef = def;
    if (def) {
      this.wingRig = buildWings(def, this.torso);
      this.flight.equip();
      // (Folded at first: the wings are posed before the first frame they are drawn in.)
      this.wingRig.apply(this.flight.update(0, this.wingInput(true, false, 0, 0, 0, 0, 0)).wing, this.clock, 0);
    } else {
      this.flight.reset();
      this.root.position.y = 0;
      this.legL.rotation.x = 0;
      this.legR.rotation.x = 0;
    }
    this.applied.fill(-1); // the new wings still have plain white vertices
    this.applyBrightness();
  }

  /** What the wings are told of the body this frame (one object, filled again every time: nothing is made per frame). */
  private wingInput(on: boolean, flies: boolean, vy: number, turn: number, brace: number, combat: number, accel: number): FlightInput {
    const i = this.flightIn;
    i.wings = on;
    i.flying = flies;
    i.speed = this.spd;
    i.vy = vy;
    i.turn = turn;
    i.accel = accel;
    i.cls = this.motion.classId;
    i.top = 4.3 * (this.wingDef?.fly ?? 1.7);
    i.shape = this.wingDef?.shape ?? null;
    i.brace = brace;
    i.combat = combat;
    i.fwd = this.airF;
    i.side = this.airS;
    return i;
  }

  /** Move the wings of a figure that is only posed (a menu): `animate` does it for the rest. */
  updateWings(t: number, dt: number): void {
    if (!this.wingRig) return;
    const o = this.flight.update(dt, this.wingInput(true, false, 0, 0, 0, 0, 0));
    this.wingRig.apply(o.wing, t, dt);
    // (It floats there too: the legs hang and drift.)
    this.root.position.y = (WING_HOVER + o.bob) * o.rise;
    this.legL.rotation.x = o.legLx;
    this.legR.rotation.x = o.legRx;
    this.legL.rotation.z = o.legLz;
    this.legR.rotation.z = o.legRz;
  }

  /**
   * A figure with wings on never touches the ground: it floats a little above it, the legs hanging and drifting, bobbing as it breathes; moving, it
   * glides with the wings a little busier; and on the wing it flies, leaning, banking and trailing its legs, the wings beating from the shoulder out.
   * Blended over what `humanize` and the swimming did (a mount or the water take the figure out of it), by how far the figure is in the wings: the
   * hands keep what they are doing (a blow, a guard, a bow drawn, a spell, a shield), and the wings brace for it.
   */
  private wingStep(dt: number, ease: (rate: number) => number, vy: number, turn: number, busy: boolean, holding: boolean): void {
    const on = this.wingRig !== null && !this.riding && !this.afloat;
    this.wingW += ((on ? 1 : 0) - this.wingW) * ease(on ? 6 : 8);
    if (this.wingW < 0.002) this.wingW = 0;
    this.wingBusy += ((busy ? 1 : 0) - this.wingBusy) * ease(busy ? 22 : 7);
    if (this.wingBusy < 0.002) this.wingBusy = 0;
    if (this.wingRig === null) return;
    const flies = on && this.wingFlying;
    const o = this.flight.update(dt, this.wingInput(on, flies, vy, turn, this.wingBusy, this.motion.combat, this.accel));
    this.wingRig.apply(o.wing, this.clock, dt);
    const w = this.wingW * o.rise;
    if (w === 0) return;
    // How much of the pose of the wings the figure takes: all of it, less while it is acting (its blow, its guard and its stance are its own).
    const free = w * (1 - this.wingBusy);
    const lite = w * (1 - 0.8 * this.wingBusy);
    // A figure in a fight keeps the hand of its stance (the casting hand, the string hand) in the air as well.
    const armKeep = 1 - 0.8 * this.motion.combat;
    const pitch = -o.lean + o.climb;
    const root = this.root;
    root.rotation.x = mix(root.rotation.x, pitch, lite);
    root.rotation.z = mix(root.rotation.z, o.bank, lite);
    // (The figure turns about its middle, not about its feet: the body is lifted and shifted to make up for the lean and the bank. The float is only what is
    // drawn: the body the physics moves is not touched.)
    // (It sinks quickly under a lintel and rises slowly out from it. Flying, the figure is lifted by its lean as well: that is allowed for.)
    const cb = Math.cos(o.bank);
    const lift = 0.9 * (1 - cb * Math.cos(pitch));
    const room = Math.max(0, Math.min(WING_HOVER, this.roof - 0.04 - lift * o.fly));
    this.hover += (room - this.hover) * ease(room < this.hover ? 14 : 3);
    root.position.y = mix(root.position.y, (this.hover + o.bob) * 1 + lift, w);
    root.position.z = mix(root.position.z, -0.9 * cb * Math.sin(pitch), lite);
    root.position.x = mix(root.position.x, 0.9 * Math.sin(o.bank), lite);
    this.torso.rotation.y += o.torsoY * lite;
    this.headPivot.rotation.x += o.headX * lite;
    this.headPivot.rotation.z += o.headZ * lite;
    this.legL.rotation.x = mix(this.legL.rotation.x, o.legLx, lite);
    this.legR.rotation.x = mix(this.legR.rotation.x, o.legRx, lite);
    // (The legs do not step: the foot picked up at each stride of the walk is put back, so they hang and drift instead.)
    this.legL.position.y = mix(this.legL.position.y, Character.HIP, lite);
    this.legR.position.y = mix(this.legR.position.y, Character.HIP, lite);
    this.legL.rotation.z = mix(this.legL.rotation.z, o.legLz, lite);
    this.legR.rotation.z = mix(this.legR.rotation.z, o.legRz, lite);
    // The arms of a figure on wings do not swing as a walker's do: empty, they hang loose and drift; a hand with a weapon or a tool in it, and an arm with a
    // shield on it, keep the pose they have (the weapon stays up and ready, and the swing and the guard are drawn on it): the stride that would swing
    // them is taken out of them in `animate`.
    const shielded = this.shieldId !== 0 && this.shieldIsShield;
    const freeR = holding ? 0 : free * armKeep;
    const freeL = shielded ? 0 : free * armKeep;
    if (this.carry === 'hand') this.armR.rotation.x = mix(this.armR.rotation.x, o.armRx, freeR);
    this.armL.rotation.x = mix(this.armL.rotation.x, o.armLx, freeL);
    this.armL.rotation.z = mix(this.armL.rotation.z, o.armLz, freeL);
    this.armR.rotation.z = mix(this.armR.rotation.z, o.armRz, freeR);
    // The cape streams back with the speed.
    this.setCape(this.capeA + (o.cape - this.capeA) * free * 0.8);
  }

  /**
   * In the water with the feet off the bottom (set by the caller before `animate`). Moving, the figure swims as a player does in Minecraft:
   * the body lies out flat along the water face down, the arms go round in turn (the front crawl) and the legs kick; keeping still it treads
   * water upright, the legs pedalling and the arms sculling. On the bottom, or wading, it walks as it does on land.
   */
  afloat = false;
  /** 0 not in the water, 1 swimming, 2 treading water (kept with a little hysteresis, so the pose does not flicker at the edge of the speed). */
  private swimMode = 0;
  private swimW = 0;
  private treadW = 0;
  private swimPhase = 0;
  private swimTilt = 0;

  /** Blend the swimming (or treading) pose over what `humanize` did, by how far it has come in. */
  private swimStep(dt: number, ease: (rate: number) => number, vy: number): void {
    const on = this.afloat && !this.riding && this.slamPhase === 0;
    if (!on) this.swimMode = 0;
    else if (this.spd > 0.5) this.swimMode = 1;
    else if (this.spd < 0.2 || this.swimMode === 0) this.swimMode = 2;
    this.swimW += ((this.swimMode === 1 ? 1 : 0) - this.swimW) * ease(this.swimMode === 1 ? 7 : 5);
    this.treadW += ((this.swimMode === 2 ? 1 : 0) - this.treadW) * ease(6);
    if (this.swimW < 0.002) this.swimW = 0;
    if (this.treadW < 0.002) this.treadW = 0;
    if (this.swimW === 0 && this.treadW === 0) {
      this.swimTilt = 0;
      return;
    }
    // A stroke a little over a second, quicker the faster it goes.
    this.swimPhase += dt * (4.4 + 0.6 * Math.min(this.spd, 4));
    this.swimTilt += (Math.max(-0.45, Math.min(0.45, vy * 0.1)) - this.swimTilt) * ease(5);
    const root = this.root;
    const sw = this.swimW;
    if (sw > 0) {
      const pose = swimShape(this.swimPhase, this.swimTilt);
      // The body turns about its middle, which is kept at the height it floats at.
      root.rotation.x = mix(root.rotation.x, pose.pitch, sw);
      root.rotation.y = mix(root.rotation.y, pose.roll, sw);
      root.rotation.z = mix(root.rotation.z, 0, sw);
      root.position.x = mix(root.position.x, 0, sw);
      root.position.y = mix(root.position.y, pose.y, sw);
      root.position.z = mix(root.position.z, pose.z, sw);
      this.torso.position.set(mix(this.torso.position.x, 0, sw), mix(this.torso.position.y, 0, sw), mix(this.torso.position.z, 0, sw));
      this.torso.rotation.x = mix(this.torso.rotation.x, 0, sw);
      this.torso.rotation.y = mix(this.torso.rotation.y, 0, sw);
      // The head is lifted up out of the water to look ahead (the neck turns back what the body has turned forward).
      this.headPivot.position.set(0, mix(this.headPivot.position.y, 1.65, sw), mix(this.headPivot.position.z, 0, sw));
      this.headPivot.rotation.x = mix(this.headPivot.rotation.x, Math.max(0.35, Math.min(2.1, this.headPivot.rotation.x * 0.6 - pose.pitch)), sw);
      this.headPivot.rotation.y = mix(this.headPivot.rotation.y, this.headPivot.rotation.y * 0.5, sw);
      this.headPivot.rotation.z = mix(this.headPivot.rotation.z, 0, sw);
      for (const [arm, side, ang] of [[this.armL, -1, pose.armL], [this.armR, 1, pose.armR]] as const) {
        arm.position.set(mix(arm.position.x, side * 0.375, sw), mix(arm.position.y, 1.5, sw), mix(arm.position.z, 0, sw));
        arm.rotation.x += wrapPi(ang - arm.rotation.x) * sw;
        arm.rotation.z = mix(arm.rotation.z, side * 0.1, sw);
        arm.rotation.y = mix(arm.rotation.y, 0, sw);
      }
      for (const [leg, side, ang] of [[this.legL, -1, pose.legL], [this.legR, 1, pose.legR]] as const) {
        leg.position.set(mix(leg.position.x, side * 0.125, sw), mix(leg.position.y, Character.HIP, sw), mix(leg.position.z, 0, sw));
        leg.rotation.x = mix(leg.rotation.x, ang, sw);
        leg.rotation.z = mix(leg.rotation.z, 0, sw);
      }
    }
    const tr = this.treadW;
    if (tr > 0) {
      // Upright and bobbing a little: the legs pedal in turn, the arms sweep out and in to hold the body up.
      const t = this.clock * 5.5;
      root.position.y = mix(root.position.y, Math.sin(this.clock * 2.1) * 0.04 - 0.05, tr);
      this.legL.rotation.x = mix(this.legL.rotation.x, 0.25 + 0.5 * Math.sin(t), tr);
      this.legR.rotation.x = mix(this.legR.rotation.x, 0.25 - 0.5 * Math.sin(t), tr);
      this.armL.rotation.x = mix(this.armL.rotation.x, 0.3 + 0.2 * Math.sin(t + 1), tr);
      this.armR.rotation.x = mix(this.armR.rotation.x, 0.3 - 0.2 * Math.sin(t + 1), tr);
      this.armL.rotation.z = mix(this.armL.rotation.z, -(0.55 + 0.3 * Math.sin(t)), tr);
      this.armR.rotation.z = mix(this.armR.rotation.z, 0.55 + 0.3 * Math.sin(t), tr);
    }
    // A lantern hangs straight down from the hand whatever the arm does.
    if (this.carry === 'hang') this.heldMount.rotation.x = -this.armR.rotation.x;
  }

  /**
   * The shape of the jump this frame, for the style it was taken in, by how it is going: leaving the ground (rising fast), the top, falling.
   * The legs: the one that leads and the one that trails (swinging, and lifted at the knee); the arms: the one opposite the lead leg and the other;
   * how far the arms and the legs are flung out to the sides; and how the body leans and twists.
   */
  private jumpShape(rise: number): void {
    const p = this.jp;
    const r = Math.max(rise, 0);
    // 0 while leaving the ground fast, 1 once it is falling.
    const down = clamp01((0.4 - rise) / 0.8);
    // 1 at the top of the jump, less either side of it.
    const top = clamp01(1 - Math.abs(rise) * 1.1);
    const t = this.airT;
    p.leadLift = p.trailLift = p.legSpread = p.lean = p.twist = 0;
    switch (this.jumpStyle) {
      case JUMP_STRIDE:
      case JUMP_LEAP: {
        const big = this.jumpStyle === JUMP_LEAP;
        // One leg reaches ahead, the other trails behind and is brought up under the body as it comes down; the arms swing against the legs.
        p.lead = big ? mix(1.05, 0.6, down) : mix(0.75, 0.45, down);
        p.trail = big ? mix(-0.8, 0.1, down) : mix(-0.5, 0.15, down);
        p.trailLift = (big ? 0.16 : 0.12) * (1 - down) + 0.04;
        p.armLead = big ? mix(1.3, 0.7, down) : mix(1.1, 0.6, down);
        p.armTrail = big ? mix(-0.8, 0.1, down) : mix(-0.45, 0.2, down);
        p.spread = (big ? 0.2 : 0.25) + 0.35 * down;
        p.lean = big ? 0.05 : 0.02;
        p.twist = (big ? 0.25 : 0.18) * (1 - down);
        break;
      }
      case JUMP_TUCK: {
        // The knees are pulled up to the chest at the top and let down again to meet the ground.
        p.lead = p.trail = 0.2 + 0.85 * top;
        p.leadLift = p.trailLift = 0.04 + 0.12 * top;
        p.armLead = p.armTrail = 0.5 + 0.8 * r - 0.3 * top;
        p.spread = 0.25 + 0.2 * top;
        p.lean = 0.05 * top;
        break;
      }
      case JUMP_STAR: {
        // Flung wide: the arms up and out, the legs apart, the back a little arched.
        p.lead = p.trail = 0.05;
        p.legSpread = 0.15 + 0.4 * top;
        p.armLead = p.armTrail = 0.2 + 0.4 * r;
        p.spread = 0.5 + 1.0 * top;
        p.lean = -0.05;
        break;
      }
      case JUMP_FALL: {
        // Off a ledge: the legs pedal, the arms are out and waving.
        const w = Math.sin(t * 10) * 0.45;
        p.lead = w;
        p.trail = -w;
        p.armLead = 0.3 + Math.sin(t * 8 + 1) * 0.3;
        p.armTrail = 0.3 + Math.sin(t * 8 + 4) * 0.3;
        p.spread = 0.9 + Math.sin(t * 7) * 0.2;
        p.lean = 0;
        break;
      }
      default: {
        // Feet together, knees coming up a little at the top; the arms swing up on the way up and are let out to the sides on the way down.
        p.lead = p.trail = 0.1 + 0.25 * top + 0.2 * down;
        p.leadLift = p.trailLift = 0.04 + 0.07 * top;
        p.armLead = p.armTrail = 0.35 + 1.25 * r - 0.2 * down;
        p.spread = 0.3 + 0.5 * down;
        p.lean = -0.04 * r + 0.04 * down;
      }
    }
    // A long stride goes the way the body goes: sideways the legs and arms hardly reach (the legs step out to the side instead, see `humanize`),
    // and backward they reach the other way. (The direction may change in the air: the pose follows it.)
    if (this.jumpStyle === JUMP_STRIDE || this.jumpStyle === JUMP_LEAP) {
      const k = Math.max(-0.7, Math.min(1, this.airF * 1.25));
      p.lead *= k;
      p.trail *= k;
      p.armLead *= k;
      p.armTrail *= k;
      p.twist *= Math.abs(k);
    }
    // Backward the body leans back, as it does moving that way on the ground.
    p.lean += Math.min(0, this.airF) * 0.1;
  }

  /** The speed (eased) a frame ago, and how fast it is changing (eased): speeding up leans the body forward, stopping rocks it back. */
  private lastSpd = 0;
  private accel = 0;
  /** Where the swing of the arm is now (see `SWING`): set by `pose`, used by `humanize` for the body. */
  private readonly sw: SwingKey = { t: 0, arm: 0, out: 0, twist: 0, lunge: 0, elbow: 0, wrist: 0 };
  /** What is held is a blade or a tool (swung with the wrist: see `SwingKey.wrist`), not a block or a cast. */
  private heldBlade = false;
  private momentum = 0;

  /** One step of a damped spring pulling `s.x` to `target` (`w` stiffness in radians a second, `z` damping: below 1 it overshoots). */
  private spring(s: { x: number; v: number }, target: number, dt: number, w: number, z: number): void {
    const n = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      s.v += (w * w * (target - s.x) - 2 * z * w * s.v) * h;
      s.x += s.v * h;
    }
  }

  /** The hip, where the body bends: the upper body (chest, head, arms) tips about it, not about the feet. */
  private static readonly HIP = 0.75;

  /** Everything at rest on its own pivot (no bend, no hip twist, no lifted foot). */
  private restPose(): void {
    this.torso.position.set(0, 0, 0);
    this.torso.scale.set(1, 1, 1);
    this.armsLoose = false;
    this.headPivot.position.set(0, 1.65, 0);
    this.armL.position.set(-0.375, 1.5, 0);
    this.armR.position.set(0.375, 1.5, 0);
    this.legL.position.set(-0.125, Character.HIP, 0);
    this.legR.position.set(0.125, Character.HIP, 0);
    this.legL.rotation.z = 0;
    this.legR.rotation.z = 0;
    this.root.position.x = 0;
    this.root.position.z = 0;
    this.root.rotation.y = 0;
  }

  /** Tip a part of the upper body by `th` about the hip (negative: forward): it moves round the hip and turns with it. */
  private bendAbout(o: THREE.Object3D, baseX: number, baseY: number, th: number): void {
    const dy = baseY - Character.HIP;
    o.position.set(baseX, Character.HIP + dy * Math.cos(th), dy * Math.sin(th));
    o.rotation.x += th;
  }

  /**
   * The small things a person does that a pair of swinging blocks does not: the body bends at the waist (more in a run, forward into a
   * start and back into a stop, into a landing), the hips turn against the shoulders and the weight shifts from foot to foot, the swinging
   * foot is picked up (as a knee would) and splayed a little in a run, the head stays level and nods with each step, the trailing leg tucks
   * in a jump and both reach for the ground on the way down, and standing still the body shifts its weight and the head wanders.
   */
  private humanize(
    dt: number,
    ease: (rate: number) => number,
    m: { s: number; a: number; walk: number; run: number; air: number; rise: number; crouch: number; still: number; breath: number; eatK: number; wL: number; wR: number },
  ): void {
    const { s, a, walk, run, air, rise, crouch, breath, eatK, wL, wR } = m;
    const c = Math.cos(this.gait);
    // How fast it is speeding up or slowing down (blocks/s per second, eased).
    if (dt > 0) this.accel += (Math.max(-30, Math.min(30, (this.spd - this.lastSpd) / dt)) - this.accel) * ease(9);
    this.lastSpd = this.spd;
    this.momentum += (Math.max(-0.12, Math.min(0.16, this.accel * 0.013)) - this.momentum) * ease(8);

    // ---- the waist ----
    // (In the air the lean of the stride and the run is let go: the body goes up fairly upright.)
    const mo = this.motion;
    const g = mo.gait;
    const lg = this.legs;
    const cp = mo.pose;
    const idleNow = mo.idle;
    // How far the body is in the stance of a fight (the stance of the legs is made further down, and goes as the legs stride).
    const fightBody = mo.combat * (1 - 0.6 * run) * (1 - air) * (1 - this.idleW.stretch);
    if (this.idleW.stretch > 0.002 && mo.stretchSeconds > 0) stretchAt(mo.classId, this.idleClock, this.sk);
    let lean = g.lean * walk * (1 - air) + this.momentum * (1 - air) + 0.2 * crouch + idleNow.lean + cp.lean * fightBody;
    // In the air the body leans as the style of the jump asks.
    if (air > 0) this.jumpShape(rise);
    lean += air * Math.max(-0.08, Math.min(0.06, this.jp.lean));
    // The back is not held still in a stride: the chest pumps forward and back twice a stride, a hair behind the feet.
    lean += Math.cos(this.gait * 2 - 0.5) * g.spineBob * a;
    lean *= 1 - 0.7 * eatK;
    // Sitting the back is rounded a little; in a stretch it arches.
    lean += 0.12 * this.idleW.sit + (mo.stretchSeconds > 0 ? this.sk.lean * this.idleW.stretch : -0.22 * this.idleW.stretch);
    // Thrown into a blow, the body goes forward with it.
    const sw = this.sw;
    lean += sw.lunge * 0.17;
    // A Ground Slam: bent over in the crouch, stretched up on the rise, forward over the shield in the dive, and right down in the blow.
    const k = this.slamW;
    const slam = clamp01(k.wind + k.up + k.fall + k.hit);
    if (slam > 0) {
      const sT = this.slamT;
      const gather = 0.18 + 0.2 * clamp01(sT / 0.2); // the crouch deepens as it goes
      const arch = -0.12 * (1 - clamp01(sT / 0.35)); // the back arches into the spring, and straightens
      const dive = 0.2 + 0.25 * clamp01(-this.slamVy / 12); // the faster the fall, the more it goes head over shield
      const settle = 0.5 - 0.15 * clamp01((sT - 0.15) / 0.3); // down hard in the blow, then rising a little
      lean = lean * (1 - slam) + gather * k.wind + arch * k.up + dive * k.fall + settle * k.hit;
    }
    // A Shield Bash: leaning back as the shield is drawn, and forward over it as it goes.
    lean += 0.3 * this.bashK.push - 0.12 * this.bashK.back;
    // A Charge: head and shoulders down into the run.
    lean += 0.28 * this.chargeW;
    // The Emberstone: a little back, chest open to the sky.
    lean -= 0.04 * this.castW;
    // The waist is not a hinge that jumps to where it is told: it follows as a spring does, a beat late and overshooting a little, so every
    // change of speed, jump and blow ripples through the body instead of arriving at once. The neck is looser still, and nods with the lift.
    const want = -Math.max(-0.2, Math.min(0.85, lean));
    if (dt > 0) {
      this.liftAccel += (Math.max(-60, Math.min(60, (this.slamVy - this.lastVy) / dt)) - this.liftAccel) * ease(10);
      this.spring(this.waist, want, dt, 15, 0.62);
      this.spring(this.neck, -want * 0.65 - Math.max(-0.3, Math.min(0.3, this.liftAccel * 0.004)), dt, 11, 0.45);
    }
    this.lastVy = this.slamVy;
    const th = this.waist.x;
    // The trunk is squeezed by a push off the ground and pulled long by a fall (and fills a little with each breath), about the hip: the
    // chest, shoulders and head ride up and down with it.
    const sy = 1 - Math.max(-0.05, Math.min(0.05, this.liftAccel * 0.0009)) + breath * idleNow.chest * (1 - eatK);
    const sx = 1 + (1 - sy) * 0.7;
    const hip = Character.HIP;
    this.torso.rotation.x = 0;
    this.torso.scale.set(sx, sy, sx);
    this.bendAbout(this.torso, 0, this.torso.position.y, th);
    this.torso.position.y += hip * (1 - sy) * Math.cos(th);
    this.torso.position.z += hip * (1 - sy) * Math.sin(th);
    this.bendAbout(this.headPivot, 0, hip + (this.headPivot.position.y - hip) * sy, th);
    this.headPivot.rotation.x += this.neck.x; // the eyes stay up, a little behind the body
    this.bendAbout(this.armL, -0.375, hip + (1.5 - hip) * sy, th);
    this.bendAbout(this.armR, 0.375, hip + (1.5 - hip) * sy, th);
    if (this.carry === 'hang') this.heldMount.rotation.x = -this.armR.rotation.x;

    // ---- the hips and the weight ----
    // The hips turn against the shoulders (which turn the other way already), and the body sways over the foot that takes the weight.
    this.root.rotation.y = s * g.hipYaw * a * (1 - air);
    this.headPivot.rotation.y -= this.root.rotation.y;
    this.root.position.x = -c * g.sway * a * (1 - air);
    // The head stays level against the lean and the roll, and nods a little with each foot that lands.
    this.headPivot.rotation.x -= this.root.rotation.x * g.headStab;
    this.headPivot.rotation.x += Math.cos(this.gait * 2) * 0.025 * a;
    this.headPivot.rotation.z = -this.root.rotation.z * 0.8;
    // The head is never held dead level: it rolls a little against the sway of the shoulders, turns a hair with each stride, bobs up and down
    // with the steps, and leans into a turn before the body does.
    this.root.rotation.z += c * g.roll * a * (1 - air);
    this.headPivot.rotation.z += Math.sin(this.gait - 0.7) * 0.045 * a * (1 - g.headStab * 0.7) - this.bank * 0.9 * (1 - air);
    this.headPivot.rotation.y += Math.sin(this.gait + 0.5) * 0.05 * a * (1 - g.headStab * 0.7);
    this.headPivot.position.y += Math.cos(this.gait * 2) * g.headBob * a * (1 - air);
    // The arms in the pose of a fight, out from the sides (the class's own way; a blow is made from there).
    {
      const wz = mo.combatArms;
      this.armL.rotation.z += (cp.armLz - this.armL.rotation.z) * wz * (1 - this.raise);
      this.armR.rotation.z += (cp.armRz - this.armR.rotation.z) * wz * (1 - Math.min(1, this.sw.arm * 2));
    }

    // ---- a blow, a stroke of mining, a placed block ----
    // The shoulders wind away and then drive through, the hips follow part of the way, the head stays on the target; the weight goes onto the
    // front foot (the left one steps in as the right arm swings) and the body comes forward and sinks a little into the blow.
    if (sw.lunge > 0 || sw.twist !== 0) {
      this.torso.rotation.y += sw.twist;
      this.root.rotation.y += sw.twist * 0.3;
      this.headPivot.rotation.y -= sw.twist * 0.3;
      this.armR.rotation.z += sw.out;
      this.armL.rotation.x -= sw.arm * 0.22 * (1 - this.raise);
      this.armL.rotation.z -= sw.arm * 0.06 * (1 - this.raise);
      this.root.position.y -= 0.035 * sw.lunge * (1 - air);
      this.legL.rotation.x += 0.4 * sw.lunge * (1 - air);
      this.legR.rotation.x -= 0.25 * sw.lunge * (1 - air);
    }
    this.root.position.z = -0.08 * sw.lunge * (1 - air);

    // ---- the feet ----
    // The leg that swings forward is picked up; in a run both are splayed a little and the stride is higher.
    // (The foot that swings is lifted by the gait, a long step in a run, a soft one in a walk; going sideways the legs step across.)
    const flight = 1 - air;
    const splay = g.spread * a;
    const sideSwing = g.stride * 0.6 * this.amp;
    // (The knee folds the leg up; the foot is lifted off the ground by a third of what it was before the knees bent.)
    this.legR.position.y = Character.HIP + lg.liftR * flight * KNEE_LIFT;
    this.legL.position.y = Character.HIP + lg.liftL * flight * KNEE_LIFT;
    this.legR.rotation.z = splay + (Math.abs(this.mr) > 0.02 ? Math.asin(Math.min(0.9, Math.sin(sideSwing) * lg.xr * this.mr)) * flight : 0);
    this.legL.rotation.z = -splay + (Math.abs(this.mr) > 0.02 ? Math.asin(Math.min(0.9, Math.sin(sideSwing) * lg.xl * this.mr)) * flight : 0);
    if (air > 0) {
      // The jump, in the style it was taken in (see `jumpShape`): the legs and the arms go to its pose as far as the air pose has come in.
      const p = this.jp;
      const lead = this.legDir > 0 ? this.legR : this.legL;
      const trail = this.legDir > 0 ? this.legL : this.legR;
      // Leaving the ground the legs are driven straight down and a little back (the toes push off) before they come up into the pose.
      const push = this.airT < 0.18 ? 1 - this.airT / 0.18 : 0;
      lead.rotation.x += (p.lead - 0.3 * push - lead.rotation.x) * air;
      trail.rotation.x += (p.trail - 0.3 * push - trail.rotation.x) * air;
      lead.position.y += air * p.leadLift * (1 - push);
      trail.position.y += air * p.trailLift * (1 - push);
      this.legL.rotation.z -= air * (0.05 + p.legSpread);
      this.legR.rotation.z += air * (0.05 + p.legSpread);
      // Going to a side, the legs step out that way (the leg on that side reaches furthest, the other crosses under it) and the arms swing with them.
      const sd = this.airS;
      this.legR.rotation.z += air * sd * (sd > 0 ? 0.5 : 0.22);
      this.legL.rotation.z += air * sd * (sd < 0 ? 0.5 : 0.22);
      // The shoulders lead into a turn (the legs come round after them).
      this.torso.rotation.y += air * Math.max(-0.35, Math.min(0.35, this.turnNow * 0.05));
      // The arms: the one opposite the leading leg goes with it (as in a stride), the other against it; a bent arm in hand is left to its weapon.
      const armLead = this.legDir > 0 ? this.armL : this.armR;
      const armTrail = this.legDir > 0 ? this.armR : this.armL;
      const wLead = this.legDir > 0 ? wL : wR;
      const wTrail = this.legDir > 0 ? wR : wL;
      armLead.rotation.x += (p.armLead + 0.5 * push - armLead.rotation.x) * wLead;
      armTrail.rotation.x += (p.armTrail + 0.5 * push - armTrail.rotation.x) * wTrail;
      this.armL.rotation.z += (-p.spread - this.armL.rotation.z) * wL;
      this.armR.rotation.z += (p.spread - this.armR.rotation.z) * wR;
      this.armL.rotation.z += sd * 0.25 * wL;
      this.armR.rotation.z += sd * 0.25 * wR;
      // The shoulders turn against the leading leg.
      this.torso.rotation.y += this.legDir * p.twist * air;
      if (this.carry === 'hang') this.heldMount.rotation.x = -this.armR.rotation.x;
    }
    // Into a landing the knees bend: the legs come forward a little under the lowered hips.
    if (crouch > 0) {
      this.legL.rotation.x += 0.35 * crouch * (1 - air);
      this.legR.rotation.x += 0.35 * crouch * (1 - air);
    }

    // ---- the knees ----
    // The leg in the air folds up as it comes through and opens to land; the one on the ground gives as it takes the weight. (The foot is lifted by the fold,
    // as a foot is: what is left of the lift of the gait is a hair, so the toe does not drag.)
    {
      const free = flight * (1 - this.swimW) * (1 - this.wingW);
      let kR = lg.kneeR * flight;
      let kL = lg.kneeL * flight;
      if (air > 0) {
        // In the air the knees bend with the pose of the jump: the leg that is tucked up, the leg that reaches.
        const p = this.jp;
        const lead = Math.min(1.5, p.leadLift * 6) * air;
        const trail = Math.min(1.5, p.trailLift * 6) * air;
        if (this.legDir > 0) { kR += lead; kL += trail; } else { kL += lead; kR += trail; }
      }
      this.legR.bend(kR * free);
      this.legL.bend(kL * free);
    }

    // ---- the arms, in a run ----
    // They are pumped higher (the elbows come forward) and held in toward the body.
    if (air === 0) {
      // (The class says how far forward the arms are carried when it moves: the sprint of a Ranger has them pumping, a Warrior's has them driving.)
      const pump = g.armPump * a;
      this.armL.rotation.x += pump + Math.max(0, this.armL.rotation.x) * run * 0.2;
      this.armR.rotation.x += (this.heldId ? 0.2 : 1) * (pump + Math.max(0, this.armR.rotation.x) * run * 0.2);
      this.armL.rotation.z *= 1 - 0.5 * run;
      this.armR.rotation.z *= 1 - 0.5 * run;
    }

    // ---- standing: the class's own way, in a fight or not ----
    // The body is never quite still: it breathes, the weight shifts, the head looks about now and then and the hands move; and the class stands as it does
    // (feet wide, knees soft, a hand ready to channel...). In a fight it stands to fight. See `ClassMotion`.
    this.classLayer(eatK, run, air);
    if (this.idleW.sit + this.idleW.stretch + this.idleW.look > 0.002) this.idlePose();
    this.plantFeet(air, crouch);
    if (slam > 0.002) this.slamPose();
    if (this.bashK.back + this.bashK.push > 0.002) this.bashPose();
    if (this.chargeW > 0.002) this.chargePose();
    // (the stone in the hand heats up from the middle as the cast goes on)
    this.heat.apply(this.heldObj, this.heldId === I.EMBERSTONE ? this.casting : 0);
    if (this.castW > 0.002) this.castPose();
    this.stabAge += dt;
    if (this.stabAge < STAB_TIME) this.stabPose();
    this.aimPose(dt);
    this.looseArms(dt);
    this.aimHeld();
    this.spineStep(dt, a, air);
    this.elbows(a, air, eatK);
    this.trail(dt, air);
  }

  /** How far the spine leans to a side (radians, a spring: the chest follows the hips a beat late and overshoots a little). */
  private readonly spineRoll = { x: 0, v: 0 };

  /**
   * The spine and the shoulders in a stride. The chest, head and arms tip about the hip towards the foot that takes the weight, a beat behind the hips,
   * so one shoulder is higher than the other and the body is seen to flow from the legs up instead of being carried on them; the head stays level against
   * it; and each shoulder rises a little as its arm swings forward. Nothing here when the body is in the air, flying or swimming.
   */
  private spineStep(dt: number, a: number, air: number): void {
    const g = this.motion.gait;
    const live = a * (1 - air) * (1 - this.wingW) * (1 - this.swimW);
    const drive = Math.cos(this.gait) * g.spineRoll * live;
    if (dt > 0) this.spring(this.spineRoll, drive, dt, 13, 0.5);
    else this.spineRoll.x = drive;
    const rz = this.spineRoll.x;
    if (Math.abs(rz) > 1e-4) {
      const hip = Character.HIP;
      this.upper.rotation.z = rz;
      this.upper.position.set(hip * Math.sin(rz), hip * (1 - Math.cos(rz)), 0);
      this.headPivot.rotation.z -= rz * g.headStab;
    }
    const lift = g.shrug * live * (1 - this.motion.combatArms);
    if (lift > 1e-4) {
      this.armL.position.y += Math.max(-1.2, Math.min(1.2, this.armL.rotation.x)) * lift;
      this.armR.position.y += Math.max(-1.2, Math.min(1.2, this.armR.rotation.x)) * lift;
    }
  }

  /** True while the right arm makes a blow, a stroke of mining, a placed block (set by `pose`): the elbow is left to the swing. */
  private armStruck = false;

  /**
   * The elbows: an arm in a walk is a little bent and comes up as it swings forward; in a run the forearms are held up and pumped. An arm that is doing
   * something else (a blow, a bow drawn, a shield raised, a staff, a bite, the pose of a fight) is left as that has it. What is in the hand keeps the way
   * it points (the wrist turns against the elbow) and goes where the hand goes.
   */
  private elbows(a: number, air: number, eatK: number): void {
    const g = this.motion.gait;
    const loose = (1 - this.swimW) * (1 - this.wingW) * (1 - this.motion.combatArms * 0.9);
    const rest = 0.09 * (1 - a);
    const flexOf = (arm: Limb): number => {
      const swing = Math.max(0, arm.rotation.x);
      const walking = (g.elbow + g.elbowSwing * Math.min(1.4, swing)) * a * (1 - 0.5 * air);
      return (walking + rest) * loose;
    };
    const keepsHand = this.carry === 'staff' || this.carry === 'wand' || this.carry === 'hang';
    const aiming = this.aimKind !== null && this.aimDraw > 0.02;
    const rightFree = this.armStruck || aiming || this.stabAge < STAB_TIME || keepsHand ? 0 : 1 - eatK;
    const leftFree = this.shieldObj && this.shieldIsShield ? 0 : 1 - this.raise;
    // (A blow swung with a blade or a tool folds the forearm for the wind-up and straightens it for the strike.)
    const fR = flexOf(this.armR) * rightFree * (this.heldId ? 0.75 : 1) + (this.armStruck ? this.sw.elbow : 0);
    const os = this.offSpec;
    const carryW = os ? (1 - this.wingW) * (1 - this.swimW) * (1 - 0.5 * this.motion.combatArms) : 0;
    const fL = flexOf(this.armL) * leftFree * (1 - 0.5 * carryW) + (os ? os.elbow * carryW : 0);
    this.armR.bend(fR);
    this.armL.bend(fL);
    // The hand turns back as the forearm comes up: the weapon points as it did.
    if (this.heldId) this.heldMount.rotation.x -= fR;
    // (A thing carried is held as its kind asks: the turn of the forearm is taken back, so a torch stays upright however the arm swings.)
    if (os) {
      this.armL.rotation.z += os.inward * carryW;
      this.offMount.rotation.z = os.roll * carryW;
      this.offMount.rotation.x = -(this.armL.rotation.x + fL) * os.keep * carryW + os.lean * carryW;
    } else this.offMount.rotation.x -= fL;
  }

  /** The length of a leg of the figure (its own units: the hip is where the leg begins). */
  private static readonly LEG = 0.75;

  /**
   * The class's stance over the stride: what it does standing (see `ClassMotion.idle`), and the pose of a fight as far as the body is in it: the legs
   * (only where the body is not striding: they are the stance of a standing fighter, and give way to the gait as it moves), the hips and shoulders turned
   * to the enemy, the head on it, the hands where the fight has them. The arms themselves are brought to it in `pose`.
   */
  private classLayer(eatK: number, run: number, air: number): void {
    const mo = this.motion;
    const i = mo.idle;
    const cp = mo.pose;
    const calm = 1 - eatK;
    this.root.position.x += i.rootX;
    this.root.rotation.z += i.rootRoll;
    this.legL.rotation.x += i.legLx;
    this.legR.rotation.x += i.legRx;
    this.legL.rotation.z += i.legLz;
    this.legR.rotation.z += i.legRz;
    this.headPivot.rotation.y += i.headY * calm;
    this.headPivot.rotation.x += i.headX * calm;
    this.headPivot.rotation.z += i.headZ * calm;
    this.torso.rotation.y += i.torsoYaw;
    this.shoulderTwist += i.torsoYaw;
    this.armL.rotation.x += i.armLx * calm * (1 - this.raise);
    this.armR.rotation.x += i.armRx * calm * (this.heldId ? 0.5 : 1);
    this.armL.rotation.z += i.armLz * calm;
    this.armR.rotation.z += i.armRz * calm;
    // The fight: the legs (while they are not striding), the hips and shoulders turned, the head on the enemy.
    const wL = mo.combatLegs;
    if (wL > 0) {
      this.legL.rotation.x += (cp.legLx - this.legL.rotation.x) * wL;
      this.legR.rotation.x += (cp.legRx - this.legR.rotation.x) * wL;
      this.legL.rotation.z += (cp.legLz - this.legL.rotation.z) * wL;
      this.legR.rotation.z += (cp.legRz - this.legR.rotation.z) * wL;
    }
    const wB = mo.combat * (1 - 0.6 * run) * (1 - air) * (1 - this.idleW.stretch);
    if (wB > 0) {
      this.root.rotation.y += cp.hipYaw * wB;
      this.headPivot.rotation.y -= cp.hipYaw * wB;
      this.torso.rotation.y += cp.torsoYaw * wB;
      this.shoulderTwist += cp.torsoYaw * wB;
      this.headPivot.rotation.x += cp.headX * wB;
      this.headPivot.rotation.z += cp.headZ * wB;
    }
  }

  /**
   * Feet on the floor: the hips are lowered by as much as the legs, as they stand (apart, one ahead of the other, in a stride), would otherwise hold
   * the lowest foot above it. A stride takes only the share the class asks (a Warrior's steps land with weight; a Ranger's body stays level while a foot is
   * a hair off the ground at the ends of a step). Standing, it takes all, so a wide stance is a lower one and the feet are never in the air.
   */
  private plantFeet(air: number, crouch: number): void {
    const g = this.motion.gait;
    const k = (1 - this.amp * (1 - g.plant)) * (1 - air) * (1 - this.idleW.sit) * (1 - Math.min(1, crouch * 3)) * (1 - this.chargeW * 0.5);
    if (k <= 0.001) return;
    const L = Character.LEG;
    // (The foot is at the end of the thigh and then of the shin, which is turned back by the bend of the knee.)
    const foot = (leg: Limb): number => leg.position.y - Character.HIP + L - (0.5 * L * (Math.cos(leg.rotation.x) + Math.cos(leg.rotation.x + leg.shin.rotation.x)) * Math.cos(leg.rotation.z));
    const low = Math.min(foot(this.legL), foot(this.legR));
    if (low > 0) this.root.position.y -= low * k * this.root.scale.y;
  }

  /**
   * What trails the body, last, over everything: the legs of a robe (they follow the stride a beat late), a weapon in the hand (it tips as the body speeds up
   * and rolls as it turns) and the shoulders (the arms go round with them, to the angle the stride, the stance and the stretch have turned them to).
   */
  private trail(dt: number, air: number): void {
    const mo = this.motion;
    const g = mo.gait;
    const lag = g.legLag * (1 - air) * (1 - this.idleW.sit);
    for (const [leg, sp] of [[this.legL, this.legSpringL], [this.legR, this.legSpringR]] as const) {
      const target = leg.rotation.x;
      if (lag < 0.01 || !(dt > 0)) {
        sp.x = target;
        sp.v = 0;
      } else {
        this.spring(sp, target, dt, 20, 0.6);
        leg.rotation.x = target + (sp.x - target) * lag;
      }
    }
    if (this.heldObj && !this.aimKind && this.carry !== 'hang') {
      // (A staff or a wand sways with the body, a blade less, it being held in the fist: it is left alone in a blow.)
      const k = (1 - Math.min(1, this.sw.arm * 2)) * (this.carry === 'hand' ? 0.6 : 1);
      this.heldMount.rotation.x += mo.second.weaponX * k;
      this.heldMount.rotation.z = mo.second.weaponZ * k;
    } else this.heldMount.rotation.z = 0;
    // The shoulders: the arms turn about the spine with the chest (the chest block has its own turn, `torso.rotation.y`).
    const th = this.shoulderTwist;
    if (Math.abs(th) > 1e-4 && !this.riding) {
      const c = Math.cos(th);
      const sn = Math.sin(th);
      const q = Character.twistQ.setFromAxisAngle(Character.TWIST_AXIS, th);
      for (const [arm, sx] of [[this.armL, -0.375], [this.armR, 0.375]] as const) {
        const z0 = arm.position.z;
        arm.position.x = sx * c + z0 * sn;
        arm.position.z = -sx * sn + z0 * c;
        arm.quaternion.premultiply(q);
      }
    }
  }

  /** Seconds each of the idle things takes (sitting goes on until something else happens). */
  private static readonly STRETCH_TIME = 4.2;
  private static readonly LOOK_TIME = 6.5;

  /** Start one of the idle things now (1 sit, 2 stretch, 3 look around); 0 ends it. */
  playIdle(kind: number): void {
    this.idleKind = kind;
    this.idleLast = kind || this.idleLast;
    this.idleClock = 0;
    this.idleT = Math.max(this.idleT, this.idleAfter);
  }

  /**
   * The figure cut into cubes of 2 pixels (an eighth of a block), as it stands this moment (a pose included): only the cubes of the
   * outside, each in the colour of the skin where it sits (the outer layer over the base). Placed from the figure's feet in the space
   * of whatever holds it, facing -z, in blocks.
   */
  voxels(): SkinVoxel[] {
    const out: SkinVoxel[] = [];
    const g = this.skinCanvas.getContext('2d')!;
    const px = g.getImageData(0, 0, SKIN_SIZE, SKIN_SIZE).data;
    const mix = (a: Rect, b: Rect, x: number, y: number, o: [number, number, number, number]): void => {
      // Average the 2x2 pixels of the cube: the outer layer over the base where it is there.
      let r = 0;
      let gg = 0;
      let bb = 0;
      for (let k = 0; k < 4; k++) {
        const ix = (k & 1) + x * 2;
        const iy = (k >> 1) + y * 2;
        const at = ((a.y + iy) * SKIN_SIZE + a.x + ix) * 4;
        const bt = ((b.y + iy) * SKIN_SIZE + b.x + ix) * 4;
        const al = px[bt + 3] / 255 > 0.5 ? 1 : 0;
        r += al ? px[bt] : px[at];
        gg += al ? px[bt + 1] : px[at + 1];
        bb += al ? px[bt + 2] : px[at + 2];
      }
      o[0] = r / 1020;
      o[1] = gg / 1020;
      o[2] = bb / 1020;
    };
    const rgb: [number, number, number, number] = [0, 0, 0, 0];
    const v = new THREE.Vector3();
    this.root.updateMatrix();
    this.upper.updateMatrix();
    const parts: { part: PartName; group: THREE.Group; y: number }[] = [
      { part: 'head', group: this.headPivot, y: 0.1 },
      { part: 'body', group: this.torso, y: 1.125 },
      { part: 'armL', group: this.armL, y: -0.375 },
      { part: 'armR', group: this.armR, y: -0.375 },
      { part: 'legL', group: this.legL, y: -0.375 },
      { part: 'legR', group: this.legR, y: -0.375 },
    ];
    for (const { part, group, y } of parts) {
      const s = PARTS[part];
      const base = partRects(part, 'base');
      const over = partRects(part, 'over');
      const nx = s.w / 2;
      const ny = s.h / 2;
      const nz = s.d / 2;
      group.updateMatrix();
      for (let iy = 0; iy < ny; iy++)
        for (let iz = 0; iz < nz; iz++)
          for (let ix = 0; ix < nx; ix++) {
            const shell = ix === 0 || ix === nx - 1 || iy === 0 || iy === ny - 1 || iz === 0 || iz === nz - 1;
            if (!shell) continue;
            // The face the colour comes from (the figure's front is -z and its right is +x). Rows count down from the top, columns as seen from outside.
            let face: FaceName;
            let col: number;
            let row: number;
            if (iz === 0) {
              face = 'front';
              col = nx - 1 - ix;
              row = ny - 1 - iy;
            } else if (iz === nz - 1) {
              face = 'back';
              col = ix;
              row = ny - 1 - iy;
            } else if (iy === ny - 1) {
              face = 'top';
              col = nx - 1 - ix;
              row = nz - 1 - iz;
            } else if (iy === 0) {
              face = 'bottom';
              col = nx - 1 - ix;
              row = iz;
            } else if (ix === nx - 1) {
              face = 'right';
              col = nz - 1 - iz;
              row = ny - 1 - iy;
            } else {
              face = 'left';
              col = iz;
              row = ny - 1 - iy;
            }
            mix(base[face], over[face], col, row, rgb);
            // The middle of the cube, in the part's own space, then out through the pivots.
            v.set(((ix + 0.5) / nx - 0.5) * (s.w / 16), y + ((iy + 0.5) / ny - 0.5) * (s.h / 16), ((iz + 0.5) / nz - 0.5) * (s.d / 16));
            v.applyMatrix4(group.matrix);
            if (group !== this.legL && group !== this.legR) v.applyMatrix4(this.upper.matrix);
            v.applyMatrix4(this.root.matrix);
            out.push({ x: v.x, y: v.y, z: v.z, r: rgb[0], g: rgb[1], b: rgb[2] });
          }
    }
    return out;
  }

  /** Whether the figure is doing one of the idle things (or coming out of it). */
  get idling(): boolean {
    return this.idleKind !== 0 || this.idleW.sit + this.idleW.stretch + this.idleW.look > 0.002;
  }

  /** The idle timer: still for long enough starts one; anything the figure does ends it; each one eases in and out. */
  private idleStep(dt: number, speed: number, turn: number, attack: number, blocking: boolean, airborne: boolean, eating: boolean): void {
    const busy = speed > 0.3 || airborne || attack < 1 || blocking || eating || this.slamPhase !== 0 || Math.abs(turn) > 0.6 || this.riding;
    if (busy) {
      this.idleT = 0;
      this.idleKind = 0;
      this.idleWait = 0;
    } else this.idleT += dt;
    if (!busy && this.idleKind === 0 && this.idleT >= this.idleAfter) {
      if (this.idleWait > 0) this.idleWait -= dt;
      else {
        // Not the same one twice in a row.
        let kind = 1 + Math.floor(Math.random() * 3);
        // (A figure with a class of its own stretches more than it sits or looks about.)
        if (this.motion.stretchSeconds > 0) {
          const roll = Math.random();
          kind = roll < 0.55 ? 2 : roll < 0.8 ? 3 : 1;
          if (kind === this.idleLast) kind = kind === 2 ? 3 : 2;
        } else if (kind === this.idleLast) kind = (kind % 3) + 1;
        this.idleKind = this.idleLast = kind;
        this.idleClock = 0;
      }
    }
    if (this.idleKind !== 0) {
      this.idleClock += dt;
      const len = this.idleKind === 2 ? this.motion.stretchSeconds || Character.STRETCH_TIME : this.idleKind === 3 ? Character.LOOK_TIME : Infinity;
      if (this.idleClock >= len) {
        this.idleKind = 0;
        this.idleWait = 8 + 7 * Math.random();
      }
    }
    const kind = this.idleKind;
    const u = this.idleClock / Character.STRETCH_TIME;
    const sm = (x: number): number => x * x * (3 - 2 * x);
    // A stretch comes up slowly, is held, and is let go.
    const own = this.motion.stretchSeconds > 0;
    const stretch = own ? (kind === 2 ? 1 : 0) : kind === 2 ? (u < 0.3 ? sm(clamp01(u / 0.3)) : u < 0.7 ? 1 : sm(clamp01((1 - u) / 0.3))) : 0;
    const w = this.idleW;
    const to = (v: number, target: number, rin: number, rout: number): number => v + (target - v) * (1 - Math.exp(-dt * (target > v ? rin : rout)));
    w.sit = to(w.sit, kind === 1 ? 1 : 0, 2.6, 6);
    // (A stretch of its own is made of keys that begin and end at rest: it comes in and goes out over the class's time, and at once when the body has to move.)
    w.stretch = own ? to(w.stretch, stretch, 10, busy ? 14 : 3 / Math.max(0.15, this.motion.profileNow.transitions.fromStretch)) : to(w.stretch, stretch, 14, 8);
    w.look = to(w.look, kind === 3 ? 1 : 0, 5, 6);
    if (w.sit < 0.002) w.sit = 0;
    if (w.stretch < 0.002) w.stretch = 0;
    if (w.look < 0.002) w.look = 0;
  }

  /**
   * The idle things over the standing pose. Sitting: down on the ground, the legs out in front and a little apart, the hands beside the hips,
   * the head looking about slowly. A stretch: up on the toes, both arms up and a little apart, the back arched and the head tipped back, with a
   * tremble at the top. Looking around: the head turns slowly one way, holds, then the other (the shoulders follow a little).
   */
  private idlePose(): void {
    const w = this.idleW;
    const t = this.idleClock;
    const mix = (o: THREE.Object3D, axis: 'x' | 'z', to: number, k: number): void => {
      if (k > 0) o.rotation[axis] += (to - o.rotation[axis]) * k;
    };
    const holds = this.heldId !== 0;
    if (w.sit > 0) {
      const k = w.sit;
      // Lowered onto the ground, the hips between the legs, which come out in front.
      this.root.position.y -= 0.58 * k;
      mix(this.legL, 'x', 1.48, k);
      mix(this.legR, 'x', 1.4, k);
      mix(this.legL, 'z', -0.12, k);
      mix(this.legR, 'z', 0.12, k);
      this.legL.position.y = Character.HIP;
      this.legR.position.y = Character.HIP;
      const breathe = Math.sin(this.clock * 1.9) * 0.02;
      mix(this.armL, 'x', -0.22 + breathe, k);
      mix(this.armR, 'x', (holds ? 0.08 : -0.22) + breathe, k);
      mix(this.armL, 'z', -0.17, k);
      mix(this.armR, 'z', 0.17, k);
      this.headPivot.rotation.y += (Math.sin(t * 0.45) + Math.sin(t * 0.17 + 1) * 0.6) * 0.16 * k;
      this.headPivot.rotation.x += (0.06 + Math.sin(t * 0.3) * 0.05) * k;
      this.root.rotation.z += Math.sin(t * 0.4) * 0.012 * k;
    }
    if (w.stretch > 0 && this.motion.stretchSeconds > 0) this.classStretch(w.stretch);
    else if (w.stretch > 0) {
      const k = w.stretch;
      const shake = Math.sin(this.clock * 26) * 0.012 * k;
      mix(this.armL, 'x', 3.0 + shake, k);
      mix(this.armR, 'x', 2.95 + shake, k);
      mix(this.armL, 'z', -0.3, k);
      mix(this.armR, 'z', 0.3, k);
      // The weapon points up with the arm, not back over the shoulder.
      if (holds && this.carry !== 'hang') {
        const staff = this.carry === 'staff' || this.carry === 'wand';
        const want = staff ? -2.95 - STAFF_LEAN : 0.55 - 2.95;
        this.heldMount.rotation.x += (want - this.heldMount.rotation.x) * k;
      }
      this.headPivot.rotation.x += -0.42 * k;
      this.root.position.y += 0.03 * k;
      this.torso.rotation.y += shake * 2;
    }
    if (w.look > 0) {
      const k = w.look;
      // Left, hold, right, hold, back: eased between.
      const keys = [0, -0.95, -0.95, 0.05, 1.0, 1.0, 0];
      const at = (t / Character.LOOK_TIME) * (keys.length - 1);
      const i = Math.min(keys.length - 2, Math.max(0, Math.floor(at)));
      const f = at - i;
      const yaw = keys[i] + (keys[i + 1] - keys[i]) * f * f * (3 - 2 * f);
      this.headPivot.rotation.y += yaw * k;
      this.headPivot.rotation.x += (-0.05 + Math.sin(at * 2.1) * 0.05) * k;
      this.torso.rotation.y += yaw * 0.22 * k;
      this.root.rotation.y += yaw * 0.12 * k;
      this.headPivot.rotation.y -= yaw * 0.12 * k;
    }
  }

  /**
   * The stretch of the class over the standing body (see `STRETCHES`): the arms go to where the key puts them, the head, the shoulders and the back move
   * with them, the weapon in the hand stays pointing up and forward and does not follow the arm into the body, and for a stretch of the knees the legs
   * bend (they come forward and out and the feet are kept on the floor by `plantFeet`).
   */
  private classStretch(k: number): void {
    const sk = this.sk;
    const t = this.idleClock;
    const mage = this.motion.classId === 'mage';
    // Rolling the wrists: the hands turn over about the arms while they are held out in front.
    let rollL = 0;
    let rollR = 0;
    if (mage && t > 2.9 && t < 4.0) {
      const env = easeStep((t - 2.9) / 0.25) * easeStep((4.0 - t) / 0.25);
      rollL = Math.sin(t * 11) * 0.6 * env;
      rollR = -rollL;
    }
    this.armL.rotation.x += (sk.armLx - this.armL.rotation.x) * k;
    this.armR.rotation.x += (sk.armRx - this.armR.rotation.x) * k;
    this.armL.rotation.z += (sk.armLz - this.armL.rotation.z) * k;
    this.armR.rotation.z += (sk.armRz - this.armR.rotation.z) * k;
    this.armL.rotation.y += (sk.armLy + rollL - this.armL.rotation.y) * k;
    this.armR.rotation.y += (sk.armRy + rollR - this.armR.rotation.y) * k;
    if (this.heldId && this.carry !== 'hang') {
      const staff = this.carry === 'staff' || this.carry === 'wand';
      const want = (staff ? -STAFF_LEAN : 0.55) - sk.armRx;
      this.heldMount.rotation.x += (want - this.heldMount.rotation.x) * k;
    }
    this.headPivot.rotation.x += sk.headX * k;
    this.headPivot.rotation.y += sk.headY * k;
    this.headPivot.rotation.z += sk.headZ * k;
    this.torso.rotation.y += sk.torsoYaw * k;
    this.shoulderTwist += sk.torsoYaw * k;
    this.root.position.y += sk.rise * k;
    if (sk.bend > 0.001) {
      const b = sk.bend * k;
      this.legL.rotation.x += 0.42 * b;
      this.legR.rotation.x += 0.42 * b;
      this.legL.rotation.z += -0.2 * b;
      this.legR.rotation.z += 0.2 * b;
    }
  }

  /** The arm that holds a bow or a crossbow is level when it is aimed (the arm's own angle: 0 hangs down, 1.57 points ahead). */
  private static readonly AIM_ARM = 1.5;

  /** Seconds since the shot, how far it was drawn, and what the bow is doing this frame (shared by the arms and the string). */
  private aimNow = { pull: 0, arrow: false };

  /**
   * Aiming a bow or a crossbow: the weapon arm comes up level and the other hand reaches for the string; a bow is drawn by bringing that hand
   * back to the chest, a crossbow is held at the shoulder in both hands. Letting go snaps the string, kicks the weapon arm and the hand falls away.
   */
  private aimPose(dt: number): void {
    const kind = this.aimKind;
    if (!kind) {
      this.aimW = 0;
      this.aimPrev = 0;
      return;
    }
    const cross = kind === 'crossbow';
    const d = this.aimDraw;
    // Let go of a draw that would shoot (a crossbow only when it was wound all the way).
    if (this.aimPrev >= (cross ? 0.999 : 0.15) && d <= 0.001) {
      this.shotAge = 0;
      this.shotPull = this.aimPrev;
    }
    this.aimPrev = d;
    this.shotAge += dt;
    const t = this.shotAge;
    const firing = t < 0.55;
    const want = d > 0.02 || t < 0.5 ? 1 : 0;
    this.aimW += (want - this.aimW) * (1 - Math.exp(-dt * (want ? 16 : 7)));
    if (this.aimW < 0.003) this.aimW = 0;
    const w = this.aimW;
    const e = d * d * (3 - 2 * d);
    const kick = firing ? this.shotPull * Math.exp(-t * 9) : 0;
    // The string (see `aimHeld`): a bow's rings out after the shot, a crossbow's goes slack.
    this.aimNow.pull = firing ? (cross ? 0 : this.shotPull * Math.exp(-t * 14) * Math.cos(t * 48)) : d;
    this.aimNow.arrow = firing ? false : cross ? d >= 0.35 : d > 0.03;
    if (w <= 0) return;
    const pitch = Math.max(-1, Math.min(1, this.aimPitch)) * 0.9;
    const up = Character.AIM_ARM + pitch;
    // The weapon arm.
    this.armR.rotation.x += (up + 0.1 * kick - this.armR.rotation.x) * w;
    this.armR.rotation.z += (-0.05 - this.armR.rotation.z) * w;
    // The other hand: on the weapon (a crossbow), or on the string, brought back to the chest as the bow is drawn and falling away at the shot.
    const back = firing ? this.shotPull * Math.exp(-t * 12) : e;
    const lx = cross ? up - 0.08 : up - 0.35 * back;
    const lz = cross ? 0.42 : 0.45 + 0.45 * back;
    this.armL.rotation.x += (lx - this.armL.rotation.x) * w;
    this.armL.rotation.z += (lz - this.armL.rotation.z) * w;
    // The shoulders give a little with the draw and the kick.
    this.torso.rotation.y += (0.12 * (cross ? 0.5 : e) - 0.05 * kick) * w;
  }

  /** The weapon keeps its aim whatever the arm is doing (upright for a bow, flat for a crossbow: see `FIGURE_AIM`), and its string follows the draw. */
  private aimHeld(): void {
    if (!this.aimKind) return;
    this.heldMount.rotation.x = Character.AIM_ARM + Math.max(-1, Math.min(1, this.aimPitch)) * 0.9 * this.aimW - this.armR.rotation.x;
    const rig = this.heldObj?.userData.rig as ((pull: number, arrow: boolean) => void) | undefined;
    rig?.(this.aimNow.pull, this.aimNow.arrow);
  }

  /**
   * A stab of the left hand (the dagger of a ranger with the bow put away): the hand comes back a little, then the arm is driven straight out
   * ahead with the shoulders turning into it, and it comes home. (The arm's angle: 0 hangs down, 1.57 points ahead.)
   */
  private stabPose(): void {
    const u = this.stabAge / STAB_TIME;
    // wind-up (0..0.3), thrust (0.3..0.5), hold and recover (0.5..1)
    const wind = Math.sin(Math.min(1, u / 0.3) * Math.PI * 0.5);
    const thrust = u < 0.3 ? 0 : Math.min(1, (u - 0.3) / 0.2);
    const home = u < 0.5 ? 0 : (u - 0.5) / 0.5;
    const out = thrust * (1 - home * home);
    const back = wind * (1 - thrust);
    // (it eases in from whatever the arm was doing and back out to it)
    const env = Math.min(1, u / 0.12) * Math.min(1, (1 - u) / 0.15);
    this.armL.rotation.x += (0.6 - 0.5 * back + out * 0.95 - this.armL.rotation.x) * env;
    this.armL.rotation.z += (0.12 * out - this.armL.rotation.z) * env;
    this.torso.rotation.y += (-0.18 * back + 0.3 * out) * env;
    this.root.rotation.y += 0.1 * out * env;
    this.root.position.z -= 0.05 * out * env;
  }

  /** The arms hang loose from the shoulders: they follow where the pose puts them as springs do, so a start, a stop, a jump or a blow whips through them. */
  private armsLoose = false;
  private readonly armSpringL = { x: 0, v: 0 };
  private readonly armSpringR = { x: 0, v: 0 };
  private looseArms(dt: number): void {
    for (const [arm, sp] of [[this.armL, this.armSpringL], [this.armR, this.armSpringR]] as const) {
      const target = arm.rotation.x;
      if (!this.armsLoose || !(dt > 0)) {
        sp.x = target;
        sp.v = 0;
      } else this.spring(sp, target, dt, 24, 0.6);
      arm.rotation.x = target + (sp.x - target) * 0.7;
    }
    this.armsLoose = true;
  }

  /**
   * The Ground Slam over whatever the body was doing. Arms are given as the angle they make in the world (0 hangs down, 1.57 points ahead, 3.14
   * straight up; the arms hang from the root, so these are the arms' own angles). The weapon arm goes back in the crouch, up to the sky on the
   * rise (the weapon pointing at it) and comes down again with the fall, while the body drops on the shield arm, which leads the dive and is planted in the blow.
   */
  private slamPose(): void {
    const k = this.slamW;
    const ease = (o: THREE.Object3D, axis: 'x' | 'z', to: number, w: number): void => {
      if (w > 0) o.rotation[axis] += (to - o.rotation[axis]) * w;
    };
    // The weapon points where the arm's angle `world` and the extra turn of the held item put it (0.78 in all is straight up).
    const weapon = (world: number, tip: number, w: number): void => {
      if (w <= 0 || !this.heldId || this.carry === 'hang') return;
      const staff = this.carry === 'staff' || this.carry === 'wand';
      const want = staff ? -world - STAFF_LEAN : tip - world;
      this.heldMount.rotation.x += (want - this.heldMount.rotation.x) * w;
    };
    const sT = this.slamT;
    // The crouch: knees bent and apart, the weapon arm wound back further as it goes (the chest turning away with it), the shield arm in front.
    const depth = clamp01(sT / 0.2);
    ease(this.armR, 'x', -0.7 - 0.5 * depth, k.wind);
    ease(this.armR, 'z', 0.25 + 0.1 * depth, k.wind);
    ease(this.armL, 'x', 0.9 + 0.15 * depth, k.wind);
    ease(this.armL, 'z', -0.15, k.wind);
    this.torso.rotation.y -= 0.3 * depth * k.wind;
    // (on the move the legs keep their stride and the body does not sink: the crouch is in the arms and the lean)
    const still = k.wind * (1 - Math.min(1, this.spd / 2));
    ease(this.legL, 'x', 0.5, still);
    ease(this.legR, 'x', 0.4, still);
    ease(this.legL, 'z', -0.14, still);
    ease(this.legR, 'z', 0.14, still);
    weapon(-0.8, 0.5, k.wind);
    // The rise: the weapon arm straight up with its tip to the sky, the shield held in front, the legs together and trailing.
    ease(this.armR, 'x', 2.95, k.up);
    ease(this.armR, 'z', 0.1, k.up);
    ease(this.armL, 'x', 1.2, k.up);
    ease(this.armL, 'z', -0.12, k.up);
    ease(this.legL, 'x', 0.15, k.up);
    ease(this.legR, 'x', -0.25, k.up);
    ease(this.legL, 'z', -0.04, k.up);
    ease(this.legR, 'z', 0.04, k.up);
    weapon(2.95, 0.55, k.up);
    // The chest drives through the wound-up turn as the arm goes up, and the whole body is stretched long by the spring.
    this.torso.rotation.y += 0.22 * k.up * (1 - clamp01(sT / 0.3));
    this.root.scale.y *= 1 + 0.05 * k.up;
    this.root.scale.x *= 1 - 0.02 * k.up;
    this.root.scale.z *= 1 - 0.02 * k.up;
    // The dive: the weapon arm comes down (out and back, for balance), the shield arm leads and the body goes down over it.
    ease(this.armR, 'x', -0.35, k.fall);
    ease(this.armR, 'z', 0.45, k.fall);
    ease(this.armL, 'x', 0.55, k.fall);
    ease(this.armL, 'z', -0.1, k.fall);
    ease(this.legL, 'x', 0.55, k.fall);
    ease(this.legR, 'x', -0.5, k.fall);
    ease(this.legL, 'z', -0.1, k.fall);
    ease(this.legR, 'z', 0.1, k.fall);
    weapon(-0.35, 3.4, k.fall);
    // The blow: a deep lunge over the shield planted at the ground, the weapon arm out to the side.
    // The first instant of it is the hardest: the body is crushed down and squashed wide, the shield arm driven right to the ground, then it all
    // settles back a little.
    const bump = clamp01(1 - sT / 0.14);
    this.root.position.y -= (0.18 + 0.04 * bump) * k.hit;
    this.root.scale.x *= 1 + 0.05 * k.hit * (0.35 + 0.65 * bump);
    this.root.scale.z *= 1 + 0.05 * k.hit * (0.35 + 0.65 * bump);
    this.root.scale.y *= 1 - 0.06 * k.hit * (0.35 + 0.65 * bump);
    this.headPivot.position.y -= 0.03 * bump * k.hit;
    ease(this.armR, 'x', -0.4, k.hit);
    ease(this.armR, 'z', 0.5, k.hit);
    ease(this.armL, 'x', 0.3 - 0.15 * bump, k.hit);
    ease(this.armL, 'z', -0.15, k.hit);
    ease(this.legL, 'x', 0.8, k.hit);
    ease(this.legR, 'x', -0.65, k.hit);
    weapon(-0.4, 3.3, k.hit);
    ease(this.legL, 'z', -0.1, k.hit);
    ease(this.legR, 'z', 0.1, k.hit);
    // The dive and the crouch sink the body a little too.
    this.root.position.y -= 0.1 * still + 0.03 * k.fall;
    // The head looks ahead, not at the ground the body is going over.
    this.headPivot.rotation.x += 0.25 * (k.fall + k.hit);
    // The cape hangs in the crouch, trails below the body on the rise, is thrown up over the back in the dive and flung out by the blow.
    const total = clamp01(k.wind + k.up + k.fall + k.hit);
    const want = -(0.07 + 0.08 * k.wind + 0.1 * k.up + 0.95 * k.fall + 0.6 * bump * k.hit);
    this.setCape(this.capeA + (want - this.capeA) * total);
  }

  /**
   * The Shield Bash over whatever the body was doing: the shield arm (the left) is pulled back to the chest with the shoulder turned away, then
   * driven straight ahead as the body lunges after it (the shield side's foot steps in, the weight goes forward), and the first instant of
   * the blow squashes the body; the weapon arm swings back for balance. The shield is the one raised in front for it (see `pose`).
   */
  private bashPose(): void {
    const { back, push, bump } = this.bashK;
    const w = clamp01(back + push);
    const both = back + push;
    /** Move `o` towards what it should be at the moment: `a` while drawn back, `b` while driven forward. */
    const to = (o: THREE.Object3D, axis: 'x' | 'z', a: number, b: number): void => {
      o.rotation[axis] += ((a * back + b * push) / both - o.rotation[axis]) * w;
    };
    to(this.armL, 'x', 0.55, 1.62);
    to(this.armL, 'z', -0.12, -0.05);
    to(this.armR, 'x', -0.5, -0.3);
    to(this.armR, 'z', 0.3, 0.4);
    to(this.legL, 'x', 0.15, 0.7);
    to(this.legR, 'x', -0.1, -0.5);
    to(this.legL, 'z', -0.05, -0.1);
    to(this.legR, 'z', 0.05, 0.1);
    // The shoulders turn the shield side away, then drive it through; the head stays on the target.
    const twist = 0.3 * back - 0.32 * push;
    this.torso.rotation.y += twist;
    this.headPivot.rotation.y -= twist * 0.7;
    // The body goes forward with the shield and sinks into it; the blow squashes it for an instant.
    this.root.position.z -= 0.22 * push;
    this.root.position.y -= 0.06 * push + 0.03 * back;
    this.root.scale.x *= 1 + 0.04 * bump;
    this.root.scale.z *= 1 + 0.04 * bump;
    this.root.scale.y *= 1 - 0.05 * bump;
    // The cape streams out behind as the body drives forward.
    this.setCape(this.capeA + (-0.55 - this.capeA) * 0.7 * push);
  }

  /**
   * A Charge over the run: the shield arm is out in front like a ram and shudders with every stride, the weapon arm is swept right back
   * (the weapon pointing behind it), the shoulder leads and the head stays up, looking where it is going; the body sits lower and the
   * cape streams out flat. The legs keep the stride they have (the run is already at full speed).
   */
  private chargePose(): void {
    const w = this.chargeW;
    const to = (o: THREE.Object3D, axis: 'x' | 'z', v: number): void => {
      o.rotation[axis] += (v - o.rotation[axis]) * w;
    };
    to(this.armL, 'x', 1.5 + Math.sin(this.clock * 55) * 0.035);
    to(this.armL, 'z', -0.08);
    to(this.armR, 'x', -1.05);
    to(this.armR, 'z', 0.3);
    if (this.heldId && this.carry !== 'hang') {
      const staff = this.carry === 'staff' || this.carry === 'wand';
      const want = staff ? 1.05 - STAFF_LEAN : 0.5 + 1.05;
      this.heldMount.rotation.x += (want - this.heldMount.rotation.x) * w;
    }
    // the stride is kept but shorter: at this speed it would otherwise throw the legs wide apart
    this.legL.rotation.x *= 1 - 0.3 * w;
    this.legR.rotation.x *= 1 - 0.3 * w;
    this.torso.rotation.y -= 0.2 * w;
    this.headPivot.rotation.y += 0.14 * w;
    this.headPivot.rotation.x += 0.3 * w;
    this.root.position.y -= 0.06 * w;
    this.setCape(this.capeA + (-1.0 - this.capeA) * 0.85 * w);
  }

  /**
   * The Emberstone's cast over the stance: the weapon arm lifts the stone out in front and slowly up, higher and shakier as the cast goes
   * on, the other hand opens out to the side, the head tips back to watch it, and the body stretches up onto its toes while the cape
   * lifts with the rising embers. The legs are left as they are (it is cast standing still).
   */
  private castPose(): void {
    const w = this.castW;
    const p = clamp01(this.casting);
    const to = (o: THREE.Object3D, axis: 'x' | 'z', v: number): void => {
      o.rotation[axis] += (v - o.rotation[axis]) * w;
    };
    const breath = Math.sin(this.castT * 2.4);
    // the stone: out in front at the chest, rising to over the head
    const lift = 1.9 + 0.95 * Math.min(1, this.castT / 1.2) * (0.6 + 0.4 * p);
    const tremble = Math.sin(this.castT * 38) * 0.025 * p * p;
    to(this.armR, 'x', lift + breath * 0.03 + tremble);
    to(this.armR, 'z', 0.12);
    // the open hand, out to the side and a little forward, as if feeling the warmth
    to(this.armL, 'x', 0.55 + breath * 0.04);
    to(this.armL, 'z', -0.55 - 0.1 * p);
    if (this.heldId && this.carry !== 'hang') {
      const staff = this.carry === 'staff' || this.carry === 'wand';
      const want = staff ? -lift - STAFF_LEAN : 0.8 - lift;
      this.heldMount.rotation.x += (want - this.heldMount.rotation.x) * w;
    }
    // the head tips back to look at it
    this.headPivot.rotation.x += 0.32 * w;
    this.torso.rotation.y += 0.05 * Math.sin(this.castT * 1.3) * w;
    // up on the toes a little more as it builds
    this.root.position.y += (0.025 + 0.05 * p) * w;
    this.legL.rotation.x += (0.08 - this.legL.rotation.x) * w * 0.5;
    this.legR.rotation.x += (-0.08 - this.legR.rotation.x) * w * 0.5;
    this.setCape(this.capeA + (-(0.2 + 0.35 * p) - this.capeA) * 0.8 * w);
  }

  /** Whether the figure sits astride a mount (the legs hang down its sides, the hands hold the mane). */
  private riding = false;

  /** Sit astride a mount (or get off). The caller puts the figure on the saddle: the hips are 0.75 above the figure's origin. */
  setRiding(on: boolean): void {
    if (on === this.riding) return;
    this.riding = on;
    this.legL.rotation.set(0, 0, 0);
    this.legR.rotation.set(0, 0, 0);
    this.armL.rotation.set(0, 0, 0);
    this.armR.rotation.set(0, 0, 0);
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.torso.rotation.y = 0;
    this.torso.rotation.x = 0;
    this.restPose();
    this.setCape(-0.07);
  }

  get isRiding(): boolean {
    return this.riding;
  }

  /** The seated pose over the walk cycle: knees out and a little forward, leaning into the speed, the arms on the reins. */
  private sit(spd: number, attack: number, holding: boolean, rise: number, air: number): void {
    const k = Math.min(1, spd / 9);
    this.legL.rotation.set(0.28 + 0.1 * air, 0, -0.5);
    this.legR.rotation.set(0.28 + 0.1 * air, 0, 0.5);
    this.root.position.y = 0;
    this.root.scale.setScalar(BODY_SCALE);
    this.root.rotation.x = -0.05 - 0.14 * k + 0.05 * Math.max(0, rise) * air;
    this.root.rotation.z = 0;
    this.torso.rotation.y = 0;
    const hands = 0.95 + 0.2 * k;
    this.armL.rotation.set(hands, 0, -0.08);
    let right = hands + (holding ? 0.1 : 0);
    if (attack > 0 && attack < 1) right += Math.sin(Math.sqrt(attack) * Math.PI) * 1.2;
    this.armR.rotation.set(right, 0, 0.08);
    // The staff rests across the mount's flank, its head forward, instead of standing on the ground it is nowhere near.
    if (this.carry === 'staff') this.heldMount.rotation.x = -right - 0.6;
    this.setCape(-(0.07 + k * 0.6));
  }

  /** Stand quite still and level (a figure laid in a bed), forgetting any stride. */
  settle(): void {
    this.amp = 0;
    this.spd = 0;
    this.air = 0;
    this.wasAir = false;
    this.landT = 9;
    this.lean = 0;
    this.bank = 0;
    this.root.scale.setScalar(BODY_SCALE);
    this.root.position.y = 0;
    this.root.rotation.set(0, 0, 0);
    this.torso.rotation.y = 0;
    this.torso.rotation.x = 0;
    this.armL.rotation.z = 0;
    this.armR.rotation.z = 0;
    this.headPivot.rotation.z = 0;
    this.restPose();
    this.lastSpd = 0;
    this.accel = 0;
    this.momentum = 0;
    this.waist.x = this.waist.v = this.neck.x = this.neck.v = 0;
    this.armsLoose = false;
    this.liftAccel = 0;
  }

  dispose(): void {
    this.dressed?.rig.dispose();
    this.wingRig?.dispose();
    for (const geo of this.classGeos) geo.dispose();
    for (const geo of this.hairGeos) geo.dispose();
    for (const geo of this.armorGeos) geo.dispose();
    for (const geo of this.armorGlowGeos) geo.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.textures) t.dispose();
    for (const g of this.geos) g.dispose();
  }
}

/** Armor textures are shared between characters; free them when the game ends. */
/** Where a figure lying in a bed has its feet, measured back from the pillow end (the bed cell's centre). */
const LYING_BACK = 1.4;
/** How far the lying body's middle sits above the mattress. */
const LYING_LIFT = 0.22;

/**
 * Lay a figure on its back in a bed. (x, y, z) is where the sleeper's body is: the middle of the head
 * cell, at the top of the mattress; `sleeping` is 1 + the way the bed points (see `BED_DIRS`).
 */
export function layDown(group: THREE.Object3D, x: number, y: number, z: number, sleeping: number): void {
  const [dx, dz] = BED_DIRS[sleeping - 1];
  group.rotation.order = 'YXZ';
  group.rotation.set(Math.PI / 2, Math.atan2(dx, dz), 0);
  group.position.set(x - dx * LYING_BACK, y + LYING_LIFT, z - dz * LYING_BACK);
  group.scale.y = 1;
}

/** Undo `layDown`: upright again (the caller then sets the position and heading as usual). */
export function standUp(group: THREE.Object3D): void {
  group.rotation.order = 'YXZ';
  group.rotation.x = 0;
}

export function disposeCharacterAssets(): void {
  for (const t of textureCache.values()) t.dispose();
  textureCache.clear();
  for (const m of armorMaterials.values()) m.dispose();
  armorMaterials.clear();
  for (const t of helmetAtlases.values()) t.dispose();
  helmetAtlases.clear();
  disposeMageGear();
  disposeClassGear();
  disposeSetGear();
}
