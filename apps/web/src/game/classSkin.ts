import { partRects, SKIN_SIZE, type FaceName, type PartName, type RGB } from './skin';

/**
 * Clothes that are painted on the skin, not built over it: a class outfit changes the colours of the body (its plates, cloth, belt, seams) and
 * leaves the shape of the character alone. Only what stands out from the body (a helm's crest, a pauldron, a cape) is a block of its own
 * (see `warriorLook.ts`). Each painter writes into a copy of the skin picture (RGBA bytes), for the slots (helmet, chest, legs, boots) that wear it.
 */

/** The class that is worn in each armor slot (helmet, chestplate, leggings, boots), or null. */
export type SlotClass = string | null;

type Paint = (x: number, y: number) => RGB | null;

const SIDES: readonly FaceName[] = ['front', 'back', 'right', 'left'];

/** Paint the rows y0..y1 (end exclusive) of one face; (0, 0) is the top left as the viewer sees it, a side face has its front at the right. */
export function face(data: Uint8ClampedArray, part: PartName, layer: 'base' | 'over', name: FaceName, y0: number, y1: number, fn: Paint | null): void {
  const r = partRects(part, layer)[name];
  const flip = name === 'left';
  for (let y = y0; y < Math.min(y1, r.h); y++)
    for (let x = 0; x < r.w; x++) {
      const c = fn ? fn(x, y) : null;
      const at = ((r.y + y) * SKIN_SIZE + r.x + (flip ? r.w - 1 - x : x)) * 4;
      if (fn && !c) continue;
      data[at] = c ? c[0] : 0;
      data[at + 1] = c ? c[1] : 0;
      data[at + 2] = c ? c[2] : 0;
      data[at + 3] = c ? 255 : 0;
    }
}

/** Paint the rows of all four sides of a part's base layer, and clear the same rows of its outer layer (hair, belt, gloves). */
export function sides(data: Uint8ClampedArray, part: PartName, y0: number, y1: number, fn: (name: FaceName, x: number, y: number) => RGB | null): void {
  for (const name of SIDES) {
    face(data, part, 'base', name, y0, y1, (x, y) => fn(name, x, y));
    face(data, part, 'over', name, y0, y1, null);
  }
}

export function cap(data: Uint8ClampedArray, part: PartName, name: 'top' | 'bottom', c: RGB): void {
  face(data, part, 'base', name, 0, 99, () => c);
  face(data, part, 'over', name, 0, 99, null);
}

// ---- the Warrior: gray steel over a cloth coat -----------------------------------------------------------------------------
const DEEP: RGB = [52, 55, 66];
const DARK: RGB = [86, 91, 104];
const MID: RGB = [134, 140, 153];
const LIGHT: RGB = [182, 188, 200];
const HI: RGB = [220, 224, 232];
const CLOTH: RGB = [72, 76, 88];

/** The cuirass, belt and tassets on the body: plates with a ridge down the middle, lames across the belly, a belt, a cloth skirt. */
function warriorBody(data: Uint8ClampedArray): void {
  sides(data, 'body', 0, 12, (name, x, y) => {
    const front = name === 'front';
    const back = name === 'back';
    const wide = front || back;
    const edge = wide ? x === 0 || x === 7 : x === 0 || x === 3;
    if (y === 0) return LIGHT;
    if (y === 1) return DARK;
    if (y === 9) return wide && front && (x === 3 || x === 4) ? HI : DEEP;
    if (y === 10) return wide && (x === 3 || x === 4) ? DARK : CLOTH;
    if (y === 11) return DEEP;
    if (y === 8) return DARK;
    if (edge) return DARK;
    if (wide && (x === 3 || x === 4)) return front ? LIGHT : MID;
    if (y === 2 && front) return LIGHT;
    if (y === 5) return DARK;
    return MID;
  });
  cap(data, 'body', 'top', LIGHT);
  cap(data, 'body', 'bottom', DEEP);
}

/** Pauldron cap, cloth sleeve, elbow, vambrace and gauntlet. */
function warriorArm(data: Uint8ClampedArray, part: 'armL' | 'armR'): void {
  sides(data, part, 0, 12, (name, x, y) => {
    const edge = name === 'front' || name === 'back' ? x === 0 || x === 3 : x === 0 || x === 3;
    if (y === 0) return LIGHT;
    if (y <= 2) return MID;
    if (y === 3) return DEEP;
    if (y === 4) return CLOTH;
    if (y === 5) return LIGHT;
    if (y === 6) return DARK;
    if (y <= 8) return edge ? DARK : name === 'front' && (x === 1 || x === 2) ? LIGHT : MID;
    if (y === 9) return LIGHT;
    if (y === 10) return DARK;
    return DEEP;
  });
  cap(data, part, 'top', MID);
  cap(data, part, 'bottom', DEEP);
}

/** The thighs (tassets over the cloth) and the knees, rows 0..6, or the greaves and boots, rows 7..11. */
function warriorLeg(data: Uint8ClampedArray, part: 'legL' | 'legR', rows: 'upper' | 'lower'): void {
  const upper = rows === 'upper';
  sides(data, part, upper ? 0 : 7, upper ? 7 : 12, (name, x, y) => {
    const front = name === 'front';
    const edge = x === 0 || x === 3;
    if (y === 0) return LIGHT;
    if (y <= 2) return edge ? DARK : MID;
    if (y === 3) return DARK;
    if (y === 4) return CLOTH;
    if (y === 5) return front ? (edge ? MID : HI) : LIGHT;
    if (y === 6) return front && !edge ? LIGHT : DARK;
    if (y === 7) return DARK;
    if (y <= 9) return edge ? DARK : front && (x === 1 || x === 2) ? LIGHT : MID;
    if (y === 10) return front && !edge ? MID : DARK;
    return DEEP;
  });
  if (upper) cap(data, part, 'top', MID);
  else cap(data, part, 'bottom', DEEP);
}

// ---- the Mage: a violet robe -------------------------------------------------------------------------------------------------
const M_DEEP: RGB = [34, 12, 62];
const M_DARK: RGB = [70, 28, 122];
const M_MID: RGB = [112, 48, 184];
const M_LIGHT: RGB = [150, 80, 220];
const M_TRIM: RGB = [196, 142, 255];
const M_HI: RGB = [232, 200, 255];

/** Clear the outer layer (hair, belt, gloves) on the rows y0..y1 of the four sides. */
export function clearOver(data: Uint8ClampedArray, part: PartName, y0: number, y1: number): void {
  for (const name of SIDES) face(data, part, 'over', name, y0, y1, null);
}

/** The robe: pale lapels meeting at the breast over a darker chest, a jewelled belt, hips in robe, and a hem of light violet. */
function mageBody(data: Uint8ClampedArray): void {
  sides(data, 'body', 0, 12, (name, x, y) => {
    const front = name === 'front';
    const back = name === 'back';
    const wide = front || back;
    if (y === 0) return M_TRIM;
    if (y === 11) return M_TRIM;
    if (y === 9) return front && (x === 3 || x === 4) ? M_HI : M_DEEP;
    if (y === 10) return M_DARK;
    if (wide ? x === 0 || x === 7 : x === 0 || x === 3) return M_DARK;
    if (front) {
      if (y <= 5 && (x === 2 || x === 5)) return M_TRIM; // the lapels
      if (y <= 3 && (x === 3 || x === 4)) return M_DEEP; // the chest under them
      if (x === 3 || x === 4) return M_LIGHT; // the closing of the robe
      if (y === 1 && (x === 1 || x === 6)) return M_LIGHT;
    }
    if (back && y >= 1 && y <= 3) return x === 3 || x === 4 ? M_DARK : M_LIGHT; // the yoke
    if (back && (x === 3 || x === 4)) return M_DARK; // the seam
    return M_MID;
  });
  cap(data, 'body', 'top', M_LIGHT);
  cap(data, 'body', 'bottom', M_DEEP);
}

/** A sleeve of robe with a wide cuff of lilac lining; the hand (rows 10 and 11) stays bare. */
function mageArm(data: Uint8ClampedArray, part: 'armL' | 'armR'): void {
  sides(data, part, 0, 10, (_name, x, y) => {
    if (y === 0) return M_LIGHT;
    if (y <= 2) return M_MID;
    if (y === 3) return M_DARK;
    if (y === 8) return M_TRIM;
    if (y === 9) return M_HI;
    return x === 0 || x === 3 ? M_DARK : M_MID;
  });
  clearOver(data, part, 10, 12);
  cap(data, part, 'top', M_LIGHT);
}

/** The robe falls over the legs to the boots: a pale panel down the front, a hem. Rows 0..8; the boots take 9..11. */
function mageLeg(data: Uint8ClampedArray, part: 'legL' | 'legR', rows: 'robe' | 'boots'): void {
  const robe = rows === 'robe';
  sides(data, part, robe ? 0 : 9, robe ? 9 : 12, (name, x, y) => {
    const front = name === 'front';
    if (robe) {
      if (y === 8) return M_TRIM;
      if (front && (x === 1 || x === 2)) return y === 7 ? M_TRIM : M_LIGHT;
      if (x === 0 || x === 3) return M_DARK;
      return y === 0 ? M_LIGHT : M_MID;
    }
    if (y === 9) return M_TRIM;
    if (y === 10) return front && (x === 1 || x === 2) ? M_DARK : M_DEEP;
    return M_DEEP;
  });
  if (robe) cap(data, part, 'top', M_MID);
  else cap(data, part, 'bottom', M_DEEP);
}

// ---- the Ranger: a forest-green hood and jerkin -----------------------------------------------------------------------------
const R_DEEP: RGB = [14, 36, 22];
const R_DARK: RGB = [32, 72, 42];
const R_MID: RGB = [60, 118, 70];
const R_LIGHT: RGB = [100, 160, 92];
const R_LEATHER: RGB = [30, 66, 38];
const R_FUR: RGB = [196, 220, 176];

/** The jerkin: a fur collar, a laced front, a bandolier across the chest (front and back), a belt, a scalloped tunic. */
function rangerBody(data: Uint8ClampedArray): void {
  sides(data, 'body', 0, 12, (name, x, y) => {
    const front = name === 'front';
    const back = name === 'back';
    const wide = front || back;
    if (y === 0 || y === 1) return R_FUR;
    if (y === 9) return front && (x === 3 || x === 4) ? R_FUR : R_DEEP;
    if (y === 10) return R_DARK;
    if (y === 11) return wide ? (x % 2 === 0 ? R_MID : R_DARK) : R_MID;
    if (wide) {
      // the bandolier: a strap from one shoulder to the opposite hip, on the front and on the back
      const bx = front ? x : 7 - x;
      if (y >= 2 && y <= 8 && y === bx + 1) return R_LEATHER;
      if (front && y <= 7 && (x === 3 || x === 4)) return y % 2 === 0 ? R_FUR : R_DARK; // the laces
    }
    if (wide ? x === 0 || x === 7 : x === 0 || x === 3) return R_DARK;
    return R_MID;
  });
  cap(data, 'body', 'top', R_FUR);
  cap(data, 'body', 'bottom', R_DEEP);
}

/** A sleeve of jerkin and a leather bracer laced up the front; the hand stays bare. */
function rangerArm(data: Uint8ClampedArray, part: 'armL' | 'armR'): void {
  sides(data, part, 0, 10, (name, x, y) => {
    if (y === 0) return R_LIGHT;
    if (y <= 2) return R_MID;
    if (y === 3) return R_DARK;
    if (y <= 5) return R_MID;
    if (y === 6) return R_DEEP;
    if (name === 'front' && (x === 1 || x === 2) && (y === 7 || y === 9)) return R_FUR;
    return y === 9 ? R_DEEP : R_LEATHER;
  });
  clearOver(data, part, 10, 12);
  cap(data, part, 'top', R_LIGHT);
}

/** Trousers (rows 0..7, with a patch on the knee) and boots turned down in fur (rows 8..11). */
function rangerLeg(data: Uint8ClampedArray, part: 'legL' | 'legR', rows: 'trousers' | 'boots'): void {
  const trousers = rows === 'trousers';
  sides(data, part, trousers ? 0 : 8, trousers ? 8 : 12, (name, x, y) => {
    const front = name === 'front';
    if (trousers) {
      if (front && (x === 1 || x === 2) && (y === 4 || y === 5)) return R_LIGHT;
      if (x === 0 || x === 3) return R_DARK;
      return y === 0 ? R_LIGHT : R_MID;
    }
    if (y === 8) return R_FUR;
    if (front && x === 1 && (y === 9 || y === 10)) return R_FUR;
    return y === 11 ? R_DEEP : R_LEATHER;
  });
  if (trousers) cap(data, part, 'top', R_MID);
  else cap(data, part, 'bottom', R_DEEP);
}

// ---- the leather set: brown leather with brass --------------------------------------------------------------------------------
const L_DEEP: RGB = [58, 36, 22];
const L_DARK: RGB = [100, 62, 38];
const L_MID: RGB = [148, 94, 58];
const L_LIGHT: RGB = [182, 124, 76];
const L_STITCH: RGB = [214, 168, 116];
const L_BRASS: RGB = [214, 172, 72];

/** A cap over the top of the head: its band at the brow, flaps over the ears, a button on the crown. Hair shows below it, the face is open. */
function leatherHead(data: Uint8ClampedArray): void {
  face(data, 'head', 'base', 'front', 0, 2, (_x, y) => (y === 0 ? L_LIGHT : L_DARK));
  face(data, 'head', 'over', 'front', 0, 3, null);
  for (const name of ['right', 'left'] as const) {
    face(data, 'head', 'base', name, 0, 6, (x, y) => {
      if (y <= 2) return y === 2 ? L_DARK : L_MID;
      return x >= 3 && x <= 5 ? (y === 5 || x === 3 ? L_DARK : L_MID) : null; // the flap over the ear
    });
    face(data, 'head', 'over', name, 0, 6, null);
  }
  face(data, 'head', 'base', 'back', 0, 3, (_x, y) => (y === 2 ? L_DARK : L_MID));
  face(data, 'head', 'over', 'back', 0, 4, null);
  face(data, 'head', 'base', 'top', 0, 8, (x, y) => (x >= 3 && x <= 4 && y >= 3 && y <= 4 ? L_LIGHT : x === 0 || x === 7 || y === 0 || y === 7 ? L_DARK : L_MID));
  face(data, 'head', 'over', 'top', 0, 8, null);
}

/** A leather vest laced up the front, with a belt and a brass buckle and a skirt of tabs; the collar and straps over the shoulders. */
function leatherBody(data: Uint8ClampedArray): void {
  sides(data, 'body', 0, 12, (name, x, y) => {
    const front = name === 'front';
    const wide = front || name === 'back';
    if (y === 0) return L_LIGHT;
    if (y === 1) return L_DARK;
    if (y === 9) return front && (x === 3 || x === 4) ? L_BRASS : L_DEEP;
    if (y === 10) return L_MID;
    if (y === 11) return wide && x % 2 === 0 ? L_DARK : L_DEEP;
    if (wide ? x === 0 || x === 7 : x === 0 || x === 3) return L_DARK;
    if (front && (x === 3 || x === 4)) return y % 2 === 0 ? L_STITCH : L_DARK; // the lacing
    if (wide && (x === 1 || x === 6) && y <= 4) return L_LIGHT; // the straps
    if (!front && wide && (x === 3 || x === 4)) return L_DARK; // the seam
    return L_MID;
  });
  cap(data, 'body', 'top', L_LIGHT);
  cap(data, 'body', 'bottom', L_DEEP);
}

/** Leather sleeves with a stitched seam and a strap at the wrist; the hand stays bare. */
function leatherArm(data: Uint8ClampedArray, part: 'armL' | 'armR'): void {
  sides(data, part, 0, 10, (name, x, y) => {
    if (y === 0) return L_LIGHT;
    if (y <= 2) return L_MID;
    if (y === 3) return L_DARK;
    if (y === 7) return L_STITCH;
    if (y === 8) return L_DARK;
    if (y === 9) return name === 'back' && (x === 1 || x === 2) ? L_BRASS : L_DEEP;
    return x === 0 || x === 3 ? L_DARK : L_MID;
  });
  clearOver(data, part, 10, 12);
  cap(data, part, 'top', L_LIGHT);
}

/** Leggings (rows 0..7, a patch on the knee) and boots with a turned cuff (rows 8..11). */
function leatherLeg(data: Uint8ClampedArray, part: 'legL' | 'legR', rows: 'leggings' | 'boots'): void {
  const leggings = rows === 'leggings';
  sides(data, part, leggings ? 0 : 8, leggings ? 8 : 12, (name, x, y) => {
    const front = name === 'front';
    if (leggings) {
      if (y === 0) return L_DARK;
      if (front && (x === 1 || x === 2) && (y === 4 || y === 5)) return L_LIGHT;
      if (y === 7) return L_DARK;
      return x === 0 || x === 3 ? L_DARK : L_MID;
    }
    if (y === 8) return L_LIGHT;
    if (y === 9) return L_MID;
    if (y === 10) return front && (x === 1 || x === 2) ? L_MID : L_DARK;
    return L_DEEP;
  });
  if (leggings) cap(data, part, 'top', L_MID);
  else cap(data, part, 'bottom', L_DEEP);
}

// ---- the iron set: bright steel plates with rivets and a gold buckle ------------------------------------------------------------
const I_DEEP: RGB = [48, 54, 68];
const I_DARK: RGB = [98, 106, 124];
const I_MID: RGB = [148, 156, 172];
const I_LIGHT: RGB = [190, 198, 212];
const I_HI: RGB = [238, 242, 250];
const I_GOLD: RGB = [236, 190, 70];

/** The colours of a set of plate (iron and gold are cut from the same pattern). jewel is set into the breast of the gold. */
export interface Plate {
  deep: RGB;
  dark: RGB;
  mid: RGB;
  light: RGB;
  hi: RGB;
  buckle: RGB;
  jewel?: RGB;
  /** Cut like a gem: the plates of the breast alternate between two lights. */
  facet?: boolean;
  /** The light that runs in the seams (an outfit's glow): the seam down the middle of the plates and the rings at the wrist and the ankle. */
  seam?: RGB;
  /** The cloth under the plate (an outfit's tabard): the skirt row below the belt. */
  cloth?: RGB;
}
const IRON: Plate = { deep: I_DEEP, dark: I_DARK, mid: I_MID, light: I_LIGHT, hi: I_HI, buckle: I_GOLD };
const GOLD: Plate = { deep: [104, 64, 16], dark: [184, 132, 34], mid: [226, 170, 40], light: [248, 208, 54], hi: [255, 245, 176], buckle: [92, 228, 214], jewel: [92, 228, 214] };
const DIAMOND: Plate = { deep: [12, 66, 84], dark: [28, 138, 160], mid: [64, 196, 202], light: [112, 236, 222], hi: [226, 255, 250], buckle: [236, 190, 70], facet: true };
const PLATES: Readonly<Record<string, Plate>> = { iron: IRON, gold: GOLD, diamond: DIAMOND };


/** A kettle helm's skull: a band at the brow, plates over the ears and a guard behind the neck, a crown seam on top. The face is open. */
export function ironHead(data: Uint8ClampedArray, pal: Plate): void {
  const { deep: I_DEEP, dark: I_DARK, mid: I_MID, light: I_LIGHT, hi: I_HI, buckle: I_GOLD } = pal;
  face(data, 'head', 'base', 'front', 0, 2, (_x, y) => (y === 0 ? I_LIGHT : I_DARK));
  face(data, 'head', 'over', 'front', 0, 3, null);
  for (const name of ['right', 'left'] as const) {
    face(data, 'head', 'base', name, 0, 6, (x, y) => {
      if (y <= 2) return y === 2 ? I_DARK : y === 0 ? I_LIGHT : I_MID;
      return x >= 3 && x <= 5 ? (y === 5 || x === 3 ? I_DARK : x === 4 && y === 4 ? I_HI : I_MID) : null; // the plate over the ear
    });
    face(data, 'head', 'over', name, 0, 6, null);
  }
  face(data, 'head', 'base', 'back', 0, 5, (_x, y) => (y === 0 ? I_LIGHT : y === 4 ? I_DARK : I_MID));
  face(data, 'head', 'over', 'back', 0, 5, null);
  face(data, 'head', 'base', 'top', 0, 8, (x, y) => (x === 3 || x === 4 ? I_DARK : x === 0 || x === 7 || y === 0 || y === 7 ? I_MID : I_LIGHT));
  face(data, 'head', 'over', 'top', 0, 8, null);
}

/** A cuirass: gorget, a breastplate in two plates with a seam down the middle and rivets, a belt with a gold buckle, tassets. */
export function ironBody(data: Uint8ClampedArray, pal: Plate): void {
  const { deep: I_DEEP, dark: I_DARK, mid: I_MID, light: I_LIGHT, hi: I_HI, buckle: I_GOLD } = pal;
  sides(data, 'body', 0, 12, (name, x, y) => {
    const front = name === 'front';
    const back = name === 'back';
    const wide = front || back;
    if (y === 0) return I_LIGHT;
    if (y === 1) return I_DARK;
    if (y === 9) return front && (x === 3 || x === 4) ? I_GOLD : I_DEEP;
    if (y === 10) return wide && (x === 3 || x === 4) ? I_DARK : pal.cloth ?? I_LIGHT;
    if (y === 11) return I_DARK;
    if (wide ? x === 0 || x === 7 : x === 0 || x === 3) return I_DARK;
    if (wide && (x === 1 || x === 6) && (y === 3 || y === 7)) return I_HI; // rivets
    if (front && pal.jewel && (x === 3 || x === 4) && (y === 3 || y === 4)) return pal.jewel; // a stone in the breast
    if (wide && x === 3) return pal.seam ?? I_DARK; // the seam
    if (wide && x === 4) return I_HI;
    if (y === 5) return I_DARK; // the groove between the plates
    if (pal.facet) return ((x >> 1) + (y >> 1)) % 2 ? I_LIGHT : I_MID;
    return y < 5 ? I_LIGHT : I_MID;
  });
  cap(data, 'body', 'top', I_LIGHT);
  cap(data, 'body', 'bottom', I_DEEP);
}

/** Plate down the arm: a shoulder, the upper arm, a bright elbow with a rivet, a vambrace; the hand stays bare. */
export function ironArm(data: Uint8ClampedArray, part: 'armL' | 'armR', pal: Plate): void {
  const { deep: I_DEEP, dark: I_DARK, mid: I_MID, light: I_LIGHT, hi: I_HI, buckle: I_GOLD } = pal;
  sides(data, part, 0, 10, (name, x, y) => {
    if (y === 0) return I_HI;
    if (y === 1) return I_LIGHT;
    if (y === 2) return name === 'front' && x === 1 ? I_HI : I_MID;
    if (y === 3) return I_DARK;
    if (y <= 5) return x === 0 || x === 3 ? I_DARK : I_MID;
    if (y === 6) return name === 'front' && x === 1 ? I_HI : I_LIGHT;
    if (y === 7) return I_DARK;
    if (y === 9) return pal.seam ?? I_DEEP;
    return x === 0 || x === 3 ? I_DARK : I_LIGHT;
  });
  clearOver(data, part, 10, 12);
  cap(data, part, 'top', I_LIGHT);
}

/** Cuisses (rows 0..7: a bright knee cop with a rivet) and greaves (rows 8..11). */
export function ironLeg(data: Uint8ClampedArray, part: 'legL' | 'legR', rows: 'cuisses' | 'greaves', pal: Plate): void {
  const { deep: I_DEEP, dark: I_DARK, mid: I_MID, light: I_LIGHT, hi: I_HI, buckle: I_GOLD } = pal;
  const cuisses = rows === 'cuisses';
  sides(data, part, cuisses ? 0 : 8, cuisses ? 8 : 12, (name, x, y) => {
    const front = name === 'front';
    if (cuisses) {
      if (y === 0) return I_DARK;
      if (y === 4) return front && x === 2 ? I_HI : I_LIGHT;
      if (y === 5) return I_DARK;
      if (y === 7) return I_DARK;
      return x === 0 || x === 3 ? I_DARK : y < 4 ? I_MID : I_LIGHT;
    }
    if (y === 8) return pal.seam ?? I_LIGHT;
    if (y === 9) return x === 0 || x === 3 ? I_DARK : I_MID;
    if (y === 10) return front && (x === 1 || x === 2) ? I_MID : I_DARK;
    return I_DEEP;
  });
  if (cuisses) cap(data, part, 'top', I_MID);
  else cap(data, part, 'bottom', I_DEEP);
}

/**
 * The helm: steel over the top, back and sides of the head, a band across the brow, cheek plates. The face (columns 1..6, rows 3..7 of the front, the
 * chin and the neck) is left as it is: the hair is painted over, and the blocks of the helm (see `warriorLook.ts`) only add the rim, dome and crest.
 */
function warriorHead(data: Uint8ClampedArray): void {
  face(data, 'head', 'base', 'front', 0, 8, (x, y) => {
    if (y === 0 || y === 1) return LIGHT;
    if (y === 2) return DARK;
    if (x === 0 || x === 7) return y === 7 ? DARK : MID;
    return null;
  });
  face(data, 'head', 'over', 'front', 0, 8, null);
  for (const name of ['right', 'left'] as const) {
    face(data, 'head', 'base', name, 0, 8, (x, y) => {
      if (y <= 1) return LIGHT;
      if (y === 7) return DARK;
      if (x === 3 && y >= 2) return DARK;
      return MID;
    });
    face(data, 'head', 'over', name, 0, 8, null);
  }
  face(data, 'head', 'base', 'back', 0, 8, (_x, y) => (y <= 1 ? LIGHT : y === 7 ? DARK : MID));
  face(data, 'head', 'over', 'back', 0, 8, null);
  face(data, 'head', 'base', 'top', 0, 8, (x, y) => (x === 3 || x === 4 ? LIGHT : y === 0 || y === 7 ? DARK : MID));
  face(data, 'head', 'over', 'top', 0, 8, null);
}

/** Paint what the slots wear onto the skin (a copy of it is returned only changed where an outfit is painted). The colour of the paint of each class: see above. */
export function paintClassSkin(skin: Uint8ClampedArray, slots: readonly SlotClass[]): Uint8ClampedArray<ArrayBuffer> {
  const data = new Uint8ClampedArray(new ArrayBuffer(skin.length));
  data.set(skin);
  if (slots[0] === 'warrior') warriorHead(data);
  if (slots[1] === 'warrior') {
    warriorBody(data);
    warriorArm(data, 'armL');
    warriorArm(data, 'armR');
  }
  if (slots[0] === 'leather') leatherHead(data);
  if (slots[1] === 'leather') {
    leatherBody(data);
    leatherArm(data, 'armL');
    leatherArm(data, 'armR');
  }
  const head = PLATES[slots[0] ?? ''];
  if (head) ironHead(data, head);
  const chest = PLATES[slots[1] ?? ''];
  if (chest) {
    ironBody(data, chest);
    ironArm(data, 'armL', chest);
    ironArm(data, 'armR', chest);
  }
  if (slots[1] === 'ranger') {
    rangerBody(data);
    rangerArm(data, 'armL');
    rangerArm(data, 'armR');
  }
  if (slots[1] === 'mage') {
    mageBody(data);
    mageArm(data, 'armL');
    mageArm(data, 'armR');
  }
  for (const part of ['legL', 'legR'] as const) {
    if (slots[2] === 'warrior') warriorLeg(data, part, 'upper');
    if (slots[3] === 'warrior') warriorLeg(data, part, 'lower');
    if (slots[2] === 'leather') leatherLeg(data, part, 'leggings');
    if (slots[3] === 'leather') leatherLeg(data, part, 'boots');
    const legs = PLATES[slots[2] ?? ''];
    if (legs) ironLeg(data, part, 'cuisses', legs);
    const boots = PLATES[slots[3] ?? ''];
    if (boots) ironLeg(data, part, 'greaves', boots);
    if (slots[2] === 'ranger') rangerLeg(data, part, 'trousers');
    if (slots[3] === 'ranger') rangerLeg(data, part, 'boots');
    if (slots[2] === 'mage') mageLeg(data, part, 'robe');
    if (slots[3] === 'mage') mageLeg(data, part, 'boots');
  }
  return data;
}

/** The classes whose clothes are painted on the skin (they have no blocks over the body: only the pieces that stand out). */
export const PAINTED_CLASSES: ReadonlySet<string> = new Set(['warrior', 'mage', 'ranger', 'leather', 'iron', 'gold', 'diamond', 'outfit']);
