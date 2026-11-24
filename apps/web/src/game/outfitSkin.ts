import type { OutfitDef } from '@solrift/shared';
import type { RGB } from './skin';
import { cap, clearOver, face, ironArm, ironBody, ironHead, ironLeg, sides, type Plate } from './classSkin';
import { mageLook, type MagePattern } from './mageSet';
import { rangerLook } from './rangerSet';
import { hex, lerp, noise, scale } from './setKit';
import { warriorLook } from './warriorSet';

/**
 * The token outfits, painted on the skin: the plate, the robe or the leathers of a set are the colours of the body (as the class clothes are, see
 * `classSkin.ts`), cut from the colours of the set itself. Only what stands clear of the body (a horn, a pauldron, a hem that hangs, a wing) is made of
 * blocks (see `warriorSet.ts`, `mageSet.ts`, `rangerSet.ts`), so there is no block over the body to fight it for the same pixels or to cut through it.
 */

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [10, 8, 18];

/** What a hero's head wears that the skin has to know of: a helm and a hood hide the hair (and are painted over it); a hat stands on it. */
export type OutfitHead = 'helm' | 'hood' | null;

export function outfitHead(def: OutfitDef): OutfitHead {
  if (def.cls === 'warrior') return 'helm';
  if (def.cls === 'mage') return mageLook(def.id).hood ? 'hood' : null;
  return rangerLook(def.id).hood ? 'hood' : null;
}

// ---- the Warrior: plate of the set's metal, its glow in the seams ----------------------------------------------------------------

function platesOf(def: OutfitDef): Plate {
  const [light, dark] = warriorLook(def.id).metal;
  return {
    deep: lerp(dark, BLACK, 0.5),
    dark: lerp(light, dark, 0.72),
    mid: lerp(light, dark, 0.38),
    light: lerp(light, WHITE, 0.08),
    hi: lerp(light, WHITE, 0.6),
    buckle: hex(def.trim),
    jewel: hex(def.glow),
    seam: lerp(hex(def.glow), WHITE, 0.2),
    cloth: lerp(hex(def.shirt), BLACK, 0.12),
  };
}

// ---- the Mage: a robe in the main cloth with its pattern worked in --------------------------------------------------------------

interface Cloth {
  deep: RGB;
  dark: RGB;
  mid: RGB;
  light: RGB;
  hi: RGB;
  lining: RGB;
  trim: RGB;
  glow: RGB;
}

function clothOf(def: OutfitDef): Cloth {
  const shirt = hex(def.shirt);
  const lining = hex(def.pants);
  return {
    deep: scale(shirt, 0.3),
    dark: scale(shirt, 0.58),
    mid: shirt,
    light: lerp(shirt, WHITE, 0.2),
    hi: lerp(shirt, WHITE, 0.55),
    lining: lerp(scale(lining, 1.6), shirt, 0.15),
    trim: hex(def.trim),
    glow: hex(def.glow),
  };
}

/** The pattern of a robe, over the cloth of a pixel (or nothing: the cloth as it is). `salt` tells the faces apart so they do not all have the same stars. */
function weave(pattern: MagePattern, c: Cloth, x: number, y: number, salt: number, rows: number): RGB | null {
  const n = noise(x + salt * 17, y + salt * 5, 61);
  switch (pattern) {
    case 'stars':
      if (n > 0.9) return c.trim;
      if (n > 0.8) return lerp(c.mid, c.trim, 0.4);
      return null;
    case 'flames':
      if (y >= rows - 1) return [255, 235, 160];
      if (y >= rows - 3 - ((x * 5 + salt) % 3)) return c.glow;
      if (y >= rows - 5 - ((x * 3 + salt) % 3)) return lerp(c.mid, c.glow, 0.3);
      return null;
    case 'runes':
      if ((y === 4 && x % 4 >= 1 && x % 4 <= 2) || (x % 4 === 1 && y >= 4 && y <= 7) || (y === 7 && x % 4 === 2)) return c.glow;
      return null;
    case 'frost':
      if ((x * 5 + y * 7) % 11 === 0) return WHITE;
      if (x % 4 === 0 && y % 3 === 0) return c.light;
      return null;
    case 'bands':
      if (y === 4 || y === 8) return c.glow;
      if (y === 3 || y === 5 || y === 7 || y === 9) return lerp(c.mid, c.glow, 0.18);
      return null;
    case 'veins':
      if ((x + y * 2 + salt) % 9 === 0 || (x * 2 + y + salt) % 13 === 0) return c.glow;
      return null;
    case 'cosmos':
      if (n > 0.9) return WHITE;
      if (n > 0.8) return c.glow;
      if (y >= rows - 2) return lerp(c.dark, c.glow, 0.5);
      return lerp(c.mid, c.deep, 0.35);
    default:
      return null;
  }
}

function mageHeadPaint(data: Uint8ClampedArray, c: Cloth): void {
  face(data, 'head', 'base', 'front', 0, 8, (x, y) => {
    if (y === 0) return c.light;
    if (y === 1) return c.mid;
    if (y === 2) return x === 0 || x === 7 ? c.dark : c.trim;
    if (x === 0 || x === 7) return y === 7 ? c.deep : c.dark;
    return null;
  });
  face(data, 'head', 'over', 'front', 0, 8, null);
  for (const name of ['right', 'left'] as const) {
    face(data, 'head', 'base', name, 0, 8, (x, y) => (y === 0 ? c.light : y === 2 ? c.trim : x === 0 ? c.dark : y === 7 ? c.deep : c.mid));
    face(data, 'head', 'over', name, 0, 8, null);
  }
  face(data, 'head', 'base', 'back', 0, 8, (_x, y) => (y === 0 ? c.light : y === 7 ? c.deep : c.mid));
  face(data, 'head', 'over', 'back', 0, 8, null);
  face(data, 'head', 'base', 'top', 0, 8, (x, y) => (x === 3 || x === 4 ? c.light : x === 0 || x === 7 || y === 0 || y === 7 ? c.dark : c.mid));
  face(data, 'head', 'over', 'top', 0, 8, null);
}

function mageBodyPaint(data: Uint8ClampedArray, c: Cloth, pattern: MagePattern): void {
  sides(data, 'body', 0, 12, (name, x, y) => {
    const front = name === 'front';
    const back = name === 'back';
    const wide = front || back;
    if (y === 0 || y === 11) return c.trim;
    if (y === 9) return front && (x === 3 || x === 4) ? c.glow : c.deep;
    if (y === 10) return c.dark;
    if (wide ? x === 0 || x === 7 : x === 0 || x === 3) return c.dark;
    if (front) {
      if (y <= 5 && (x === 2 || x === 5)) return c.trim; // the edge of the neckline
      if (y <= 3 && (x === 3 || x === 4)) return c.lining; // what shows in it
      if ((x === 3 || x === 4) && pattern !== 'cosmos') return c.light;
    }
    if (back && y >= 1 && y <= 3) return x === 3 || x === 4 ? c.dark : c.light; // the yoke
    return weave(pattern, c, x, y, front ? 1 : back ? 2 : 3, 9) ?? c.mid;
  });
  cap(data, 'body', 'top', c.light);
  cap(data, 'body', 'bottom', c.deep);
}

function mageArmPaint(data: Uint8ClampedArray, part: 'armL' | 'armR', c: Cloth, pattern: MagePattern): void {
  sides(data, part, 0, 10, (name, x, y) => {
    if (y === 0) return c.light;
    if (y === 3) return c.dark;
    if (y === 8) return c.trim;
    if (y === 9) return c.lining;
    return weave(pattern, c, x, y, name === 'front' ? 4 : name === 'back' ? 5 : 6, 8) ?? (x === 0 || x === 3 ? c.dark : c.mid);
  });
  clearOver(data, part, 10, 12);
  cap(data, part, 'top', c.light);
}

function mageLegPaint(data: Uint8ClampedArray, part: 'legL' | 'legR', c: Cloth, pattern: MagePattern): void {
  sides(data, part, 0, 12, (name, x, y) => {
    const front = name === 'front';
    if (y === 8) return c.trim; // the hem of the robe
    if (y > 8) return y === 9 ? c.dark : y === 11 ? c.deep : front && (x === 1 || x === 2) ? c.dark : c.deep; // the boots under it
    if (front && (x === 1 || x === 2) && y === 7) return c.trim;
    return weave(pattern, c, x, y, name === 'front' ? 7 : name === 'back' ? 8 : 9, 8) ?? (x === 0 || x === 3 ? c.dark : y === 0 ? c.light : c.mid);
  });
  cap(data, part, 'top', c.mid);
  cap(data, part, 'bottom', c.deep);
}

// ---- the Ranger: stitched leathers, a fur collar, a bandolier -----------------------------------------------------------------

interface Hide {
  deep: RGB;
  dark: RGB;
  mid: RGB;
  light: RGB;
  strap: RGB;
  fur: RGB;
  trim: RGB;
  glow: RGB;
}

function hideOf(def: OutfitDef): Hide {
  const shirt = hex(def.shirt);
  return {
    deep: scale(shirt, 0.3),
    dark: scale(shirt, 0.58),
    mid: shirt,
    light: lerp(shirt, WHITE, 0.25),
    strap: lerp(scale(hex(def.pants), 1.5), BLACK, 0.2),
    fur: lerp(lerp(hex(def.trim), shirt, 0.22), WHITE, 0.25),
    trim: hex(def.trim),
    glow: hex(def.glow),
  };
}

function rangerHeadPaint(data: Uint8ClampedArray, h: Hide): void {
  face(data, 'head', 'base', 'front', 0, 8, (x, y) => {
    if (y === 0 || y === 1) return h.mid;
    if (y === 2) return x === 0 || x === 7 ? h.dark : h.strap;
    if (x === 0 || x === 7) return y === 7 ? h.deep : h.dark;
    return null;
  });
  face(data, 'head', 'over', 'front', 0, 8, null);
  for (const name of ['right', 'left'] as const) {
    face(data, 'head', 'base', name, 0, 8, (x, y) => (y === 0 ? h.light : y === 2 ? h.strap : x === 0 ? h.dark : y === 7 ? h.deep : h.mid));
    face(data, 'head', 'over', name, 0, 8, null);
  }
  face(data, 'head', 'base', 'back', 0, 8, (_x, y) => (y === 0 ? h.light : y === 7 ? h.deep : h.mid));
  face(data, 'head', 'over', 'back', 0, 8, null);
  face(data, 'head', 'base', 'top', 0, 8, (x, y) => (x === 3 || x === 4 ? h.light : x === 0 || x === 7 || y === 0 || y === 7 ? h.dark : h.mid));
  face(data, 'head', 'over', 'top', 0, 8, null);
}

function rangerBodyPaint(data: Uint8ClampedArray, h: Hide): void {
  sides(data, 'body', 0, 12, (name, x, y) => {
    const front = name === 'front';
    const back = name === 'back';
    const wide = front || back;
    if (y === 0 || y === 1) return h.fur;
    if (y === 9) return front && (x === 3 || x === 4) ? h.trim : h.deep;
    if (y === 10) return h.dark;
    if (y === 11) return wide ? (x % 2 === 0 ? h.mid : h.dark) : h.mid;
    if (wide) {
      // the bandolier: a strap from one shoulder to the opposite hip, with a stud in it, on the front and on the back
      const bx = front ? x : 7 - x;
      if (y >= 2 && y <= 8 && y === bx + 1) return bx % 2 === 0 ? h.trim : h.strap;
      if (front && y <= 7 && (x === 3 || x === 4)) return y % 2 === 0 ? h.trim : h.dark; // the laces
    }
    if (wide ? x === 0 || x === 7 : x === 0 || x === 3) return h.dark;
    return h.mid;
  });
  cap(data, 'body', 'top', h.fur);
  cap(data, 'body', 'bottom', h.deep);
}

function rangerArmPaint(data: Uint8ClampedArray, part: 'armL' | 'armR', h: Hide): void {
  sides(data, part, 0, 10, (name, x, y) => {
    if (y === 0) return h.light;
    if (y <= 2) return h.mid;
    if (y === 3) return h.dark;
    if (y <= 5) return h.mid;
    if (y === 6) return h.deep;
    if (name === 'front' && (x === 1 || x === 2) && (y === 7 || y === 9)) return h.trim;
    return y === 9 ? h.deep : h.strap;
  });
  clearOver(data, part, 10, 12);
  cap(data, part, 'top', h.light);
}

function rangerLegPaint(data: Uint8ClampedArray, part: 'legL' | 'legR', h: Hide): void {
  sides(data, part, 0, 12, (name, x, y) => {
    const front = name === 'front';
    if (y < 8) {
      if (front && (x === 1 || x === 2) && (y === 4 || y === 5)) return h.light;
      if (x === 0 || x === 3) return h.dark;
      return y === 0 ? h.light : lerp(h.mid, h.dark, 0.3);
    }
    if (y === 8) return h.fur;
    if (front && x === 1 && (y === 9 || y === 10)) return h.fur;
    return y === 11 ? h.deep : h.strap;
  });
  cap(data, part, 'top', h.mid);
  cap(data, part, 'bottom', h.deep);
}

// ---- the whole suit ---------------------------------------------------------------------------------------------------------------

/** The skin with the outfit painted on it: a copy, the bare skin underneath left as it is. */
export function paintOutfitSkin(skin: Uint8ClampedArray, def: OutfitDef): Uint8ClampedArray<ArrayBuffer> {
  const data = new Uint8ClampedArray(new ArrayBuffer(skin.length));
  data.set(skin);
  if (def.cls === 'warrior') {
    const pal = platesOf(def);
    ironHead(data, pal);
    ironBody(data, pal);
    for (const part of ['armL', 'armR'] as const) ironArm(data, part, pal);
    for (const part of ['legL', 'legR'] as const) {
      ironLeg(data, part, 'cuisses', pal);
      ironLeg(data, part, 'greaves', pal);
    }
  } else if (def.cls === 'mage') {
    const c = clothOf(def);
    const { pattern, hood } = mageLook(def.id);
    if (hood) mageHeadPaint(data, c);
    mageBodyPaint(data, c, pattern);
    for (const part of ['armL', 'armR'] as const) mageArmPaint(data, part, c, pattern);
    for (const part of ['legL', 'legR'] as const) mageLegPaint(data, part, c, pattern);
  } else {
    const h = hideOf(def);
    if (rangerLook(def.id).hood) rangerHeadPaint(data, h);
    rangerBodyPaint(data, h);
    for (const part of ['armL', 'armR'] as const) rangerArmPaint(data, part, h);
    for (const part of ['legL', 'legR'] as const) rangerLegPaint(data, part, h);
  }
  return data;
}

/** The colour of the sole under the boots of an outfit (the same as the boots are painted: it is a block under the foot). */
export function outfitSole(def: OutfitDef): number {
  const c = def.cls === 'warrior' ? platesOf(def).deep : def.cls === 'mage' ? clothOf(def).deep : hideOf(def).deep;
  return (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]);
}
