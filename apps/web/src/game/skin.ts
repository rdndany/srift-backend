/**
 * The skin of the player model: one 64x64 picture, laid out like the one other block games use, so that
 * custom skins can be dropped in later without touching the model. Every body part has a base layer and
 * an outer layer (hair, belt, gloves, trouser folds) drawn a hair's breadth away from it; whatever is
 * transparent in the outer layer shows the base.
 *
 * Nothing here needs a browser: the painter fills a plain RGBA byte array, which the model turns into a
 * texture (and the tests read back). All art is original and drawn from the look of the player.
 */

export type RGB = [number, number, number];

export const SKIN_SIZE = 64;

/** What a player looks like. Everything else on the default skin (details, shading) follows from these. */
export interface Look {
  shirt: RGB;
  pants: RGB;
  skin: RGB;
  hair: RGB;
  eyes: RGB;
  /** 0 short, 1 messy, 2 long. */
  style: number;
  /** Varies the noise (fabric weave, hair strands) between players. */
  seed: number;
}

export const HAIR_STYLES = 3;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type FaceName = 'right' | 'left' | 'top' | 'bottom' | 'back' | 'front';

/**
 * The faces of a box with sides w x h x d whose unfolded net starts at (u, v) in the picture:
 *
 *            top   bottom
 *     right  front left   back
 *
 * Seen from outside, the figure's right side is the one on the +x side (the figure faces -z).
 */
export function boxRects(u: number, v: number, w: number, h: number, d: number): Record<FaceName, Rect> {
  return {
    top: { x: u + d, y: v, w, h: d },
    bottom: { x: u + d + w, y: v, w, h: d },
    right: { x: u, y: v + d, w: d, h },
    front: { x: u + d, y: v + d, w, h },
    left: { x: u + d + w, y: v + d, w: d, h },
    back: { x: u + 2 * d + w, y: v + d, w, h },
  };
}

/** The faces in the order three.js numbers the faces of a box: +x, -x, +y, -y, +z, -z. */
export const THREE_FACE_ORDER: readonly FaceName[] = ['right', 'left', 'top', 'bottom', 'back', 'front'];

export type PartName = 'head' | 'body' | 'armR' | 'armL' | 'legR' | 'legL';

export interface PartSpec {
  /** Size in pixels (and 1/16 of a block: the model is 32 pixels tall). */
  w: number;
  h: number;
  d: number;
  /** Where the net of the base layer and of the outer layer start. */
  base: [number, number];
  over: [number, number];
}

export const PARTS: Record<PartName, PartSpec> = {
  head: { w: 8, h: 8, d: 8, base: [0, 0], over: [32, 0] },
  body: { w: 8, h: 12, d: 4, base: [16, 16], over: [16, 32] },
  armR: { w: 4, h: 12, d: 4, base: [40, 16], over: [40, 32] },
  armL: { w: 4, h: 12, d: 4, base: [32, 48], over: [48, 48] },
  legR: { w: 4, h: 12, d: 4, base: [0, 16], over: [0, 32] },
  legL: { w: 4, h: 12, d: 4, base: [16, 48], over: [0, 48] },
};

export const PART_NAMES = Object.keys(PARTS) as PartName[];

export function partRects(part: PartName, layer: 'base' | 'over'): Record<FaceName, Rect> {
  const s = PARTS[part];
  const [u, v] = layer === 'base' ? s.base : s.over;
  return boxRects(u, v, s.w, s.h, s.d);
}

/** Skins come as 64x64, or in the older 64x32 layout that has only the right arm and leg. */
export function isSkinSize(w: number, h: number): boolean {
  return w === 64 && (h === 64 || h === 32);
}

/**
 * Turn an old 64x32 skin into a 64x64 one: the left arm and leg become mirror images of the right ones,
 * and the outer layers of the body, arms and legs stay empty.
 */
export function legacyToModern(src: Uint8ClampedArray): Uint8ClampedArray {
  if (src.length !== 64 * 32 * 4) throw new Error('not a 64x32 skin');
  const out = new Uint8ClampedArray(64 * 64 * 4);
  out.set(src);
  const mirror = (from: [number, number], to: [number, number]): void => {
    const a = boxRects(from[0], from[1], 4, 12, 4);
    const b = boxRects(to[0], to[1], 4, 12, 4);
    const pairs: [FaceName, FaceName][] = [
      ['right', 'left'],
      ['left', 'right'],
      ['front', 'front'],
      ['back', 'back'],
      ['top', 'top'],
      ['bottom', 'bottom'],
    ];
    for (const [f, t] of pairs) {
      const s = a[f];
      const d = b[t];
      for (let y = 0; y < s.h; y++) {
        for (let x = 0; x < s.w; x++) {
          const i = ((s.y + y) * 64 + s.x + (s.w - 1 - x)) * 4;
          const o = ((d.y + y) * 64 + d.x + x) * 4;
          for (let k = 0; k < 4; k++) out[o + k] = src[i + k];
        }
      }
    }
  };
  mirror(PARTS.legR.base, PARTS.legL.base);
  mirror(PARTS.armR.base, PARTS.armL.base);
  return out;
}

// ---- painting ---------------------------------------------------------------------------------

function noise(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
/** The colour with `d` added to every channel. */
const tone = (c: RGB, d: number): RGB => [clamp(c[0] + d), clamp(c[1] + d), clamp(c[2] + d)];
/** The colour with every channel multiplied. */
const dim = (c: RGB, f: number): RGB => [clamp(c[0] * f), clamp(c[1] * f), clamp(c[2] * f)];
const mix = (a: RGB, b: RGB, t: number): RGB => [clamp(a[0] + (b[0] - a[0]) * t), clamp(a[1] + (b[1] - a[1]) * t), clamp(a[2] + (b[2] - a[2]) * t)];

const LEATHER: RGB = [96, 62, 40];
const LEATHER_DARK: RGB = [58, 38, 28];
const LEATHER_LIGHT: RGB = [128, 88, 56];
const BRASS: RGB = [232, 190, 74];
const CREAM: RGB = [236, 228, 204];

class Sheet {
  readonly data = new Uint8ClampedArray(SKIN_SIZE * SKIN_SIZE * 4);
  set(x: number, y: number, c: RGB, a = 255): void {
    if (x < 0 || y < 0 || x >= SKIN_SIZE || y >= SKIN_SIZE) return;
    const i = (y * SKIN_SIZE + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = a;
  }
}

/** Draws inside one face of a box; (0, 0) is its top left corner as the viewer sees it from outside. */
class Pen {
  constructor(
    private readonly sheet: Sheet,
    readonly r: Rect,
    /** Mirror left and right, so the code can always draw "front at the right" for the side faces. */
    private readonly flip = false,
  ) {}
  get w(): number {
    return this.r.w;
  }
  get h(): number {
    return this.r.h;
  }
  px(x: number, y: number, c: RGB, a = 255): void {
    if (x < 0 || y < 0 || x >= this.r.w || y >= this.r.h) return;
    this.sheet.set(this.r.x + (this.flip ? this.r.w - 1 - x : x), this.r.y + y, c, a);
  }
  fill(x: number, y: number, w: number, h: number, c: RGB, a = 255): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c, a);
  }
  each(fn: (x: number, y: number) => RGB | null): void {
    for (let y = 0; y < this.r.h; y++) {
      for (let x = 0; x < this.r.w; x++) {
        const c = fn(x, y);
        if (c) this.px(x, y, c);
      }
    }
  }
}

/** Cloth: the colour with a fine grain and a faint weave, a little lighter at the top. */
function cloth(c: RGB, x: number, y: number, h: number, seed: number, grain = 7): RGB {
  const weave = (x + y) % 2 === 0 ? 2 : -2;
  const fall = 5 - (10 * y) / Math.max(1, h - 1);
  return tone(c, (noise(x, y, seed) - 0.5) * 2 * grain + weave + fall);
}

function skinTone(c: RGB, x: number, y: number, seed: number): RGB {
  return tone(c, (noise(x, y, seed) - 0.5) * 12);
}

function hairTone(look: Look, x: number, y: number, over: boolean, seed: number): RGB {
  const strand = (x + seed) % 3 === 0 ? -9 : 0;
  const top = y === 0 ? 8 : 0;
  return tone(look.hair, (noise(x, y, look.seed + seed) - 0.5) * 24 + strand + top + (over ? 10 : 0));
}

/** How many rows of hair there are at each column (from the top) on the front of the head. */
function frontHair(style: number): number[] {
  if (style === 2) return [8, 3, 2, 2, 2, 2, 3, 8];
  if (style === 1) return [4, 2, 3, 2, 2, 3, 2, 4];
  return [3, 2, 2, 2, 2, 2, 2, 3];
}
/** On a side face; column 7 is next to the face, column 0 at the back of the head. */
function sideHair(style: number): number[] {
  if (style === 2) return [8, 8, 8, 8, 3, 3, 2, 2];
  if (style === 1) return [6, 5, 5, 3, 3, 3, 3, 2];
  return [5, 5, 4, 3, 3, 3, 2, 2];
}
function backHair(style: number): number[] {
  if (style === 2) return [8, 7, 8, 8, 7, 8, 8, 8];
  if (style === 1) return [6, 5, 6, 5, 5, 6, 5, 6];
  return [5, 5, 5, 5, 5, 5, 5, 5];
}

/** The outer layer grows hair a row longer here and there: tufts and loose ends. */
function tufts(base: number[], cap: number[], seed: number): number[] {
  return base.map((h, x) => Math.min(cap[x], h + (noise(x, 3, seed) > 0.5 ? 1 : 0)));
}

function hairRows(pen: Pen, heights: number[], look: Look, over: boolean, seed: number): void {
  for (let x = 0; x < heights.length; x++) for (let y = 0; y < heights[x]; y++) pen.px(x, y, hairTone(look, x, y, over, seed));
}

function paintHead(sheet: Sheet, look: Look): void {
  const b = partRects('head', 'base');
  const o = partRects('head', 'over');
  const { skin, hair, eyes, style, seed } = look;
  const face = (r: Rect, s: number, flip = false): Pen => {
    const p = new Pen(sheet, r, flip);
    p.each((x, y) => skinTone(skin, x, y, seed + s));
    return p;
  };

  // Front: brows, eyes with a shadow below them, nose, mouth and a little colour in the cheeks.
  const f = face(b.front, 1);
  const brow = dim(hair, 0.8);
  f.fill(1, 3, 2, 1, brow);
  f.fill(5, 3, 2, 1, brow);
  f.px(1, 4, [238, 238, 244]);
  f.px(2, 4, eyes);
  f.px(5, 4, eyes);
  f.px(6, 4, [238, 238, 244]);
  f.px(2, 4, dim(eyes, 0.85));
  f.px(5, 4, dim(eyes, 0.85));
  for (const x of [1, 2, 5, 6]) f.px(x, 5, tone(skin, -9));
  const blush = mix(skin, [226, 112, 112], 0.28);
  f.px(1, 5, blush);
  f.px(6, 5, blush);
  f.px(3, 4, tone(skin, 8));
  f.px(4, 4, tone(skin, 8));
  f.px(3, 5, tone(skin, -22));
  f.px(4, 5, tone(skin, -16));
  f.px(3, 6, mix(skin, [172, 72, 72], 0.55));
  f.px(4, 6, mix(skin, [172, 72, 72], 0.55));
  f.px(2, 6, tone(skin, -26));
  f.px(5, 6, tone(skin, -26));
  f.fill(0, 7, 8, 1, tone(skin, -14));
  f.fill(0, 0, 1, 8, tone(skin, -5));
  f.fill(7, 0, 1, 8, tone(skin, -5));
  const fh = frontHair(style);
  hairRows(f, fh, look, false, 11);

  // Sides: an ear, the hair over the temple and down the back.
  for (const left of [false, true]) {
    const r = left ? b.left : b.right;
    const s = face(r, 2, left);
    const earSkin = mix(skin, [150, 80, 70], 0.22);
    s.fill(4, 4, 2, 2, earSkin);
    s.px(4, 4, tone(earSkin, -18));
    s.px(5, 5, tone(earSkin, -10));
    hairRows(s, sideHair(style), look, false, 13);
  }

  // Top: all hair, parted a little off centre. The front edge of the head is the bottom of the picture.
  const t = new Pen(sheet, b.top);
  t.each((x, y) => hairTone(look, x, y, false, 17));
  for (let y = 4; y < 8; y++) t.px(2, y, dim(hair, 0.65));
  // Bottom: the chin and neck.
  new Pen(sheet, b.bottom).each((x, y) => tone(skin, -34 + (noise(x, y, seed) - 0.5) * 8));
  // Back: the nape shows under short hair.
  const k = face(b.back, 3);
  k.fill(0, 7, 8, 1, tone(skin, -16));
  hairRows(k, backHair(style), look, false, 19);

  // Outer layer: the same hair, a little fuller.
  const capFront = fh.map((h, x) => (h >= 8 ? 8 : x === 0 || x === 7 ? h + 1 : Math.max(h, 3)));
  hairRows(new Pen(sheet, o.front), tufts(fh, capFront, seed + 31), look, true, 23);
  for (const left of [false, true]) {
    const base = sideHair(style);
    hairRows(new Pen(sheet, left ? o.left : o.right, left), tufts(base, base.map((h) => Math.min(8, h + 1)), seed + 37), look, true, 29);
  }
  new Pen(sheet, o.top).each((x, y) => (noise(x, y, seed + 41) > 0.08 ? hairTone(look, x, y, true, 43) : null));
  const bh = backHair(style);
  hairRows(new Pen(sheet, o.back), tufts(bh, bh.map((h) => Math.min(8, h + 1)), seed + 47), look, true, 53);
}

function paintBody(sheet: Sheet, look: Look): void {
  const b = partRects('body', 'base');
  const o = partRects('body', 'over');
  const { shirt, skin, seed } = look;
  const hem = (p: Pen): void => {
    for (let x = 0; x < p.w; x++) {
      p.px(x, 10, tone(shirt, -34));
      p.px(x, 11, cloth(tone(shirt, x % 2 ? -22 : -34), x, 11, 12, seed + 5, 3));
    }
  };

  // Front: a hoodie with a hood around the neck, drawstrings, a pocket and a golden mark.
  const f = new Pen(sheet, b.front);
  f.each((x, y) => cloth(shirt, x, y, 12, seed + 1));
  f.fill(0, 0, 8, 1, tone(shirt, 14));
  f.fill(2, 0, 4, 1, tone(skin, -40)); // neck
  f.fill(0, 1, 8, 1, tone(shirt, -24)); // the rim of the hood
  f.px(1, 1, tone(shirt, -8));
  f.px(6, 1, tone(shirt, -8));
  for (let y = 1; y <= 4; y++) f.px(3, y, y === 4 ? tone(CREAM, -40) : CREAM);
  for (let y = 1; y <= 3; y++) f.px(4, y, y === 3 ? tone(CREAM, -40) : tone(CREAM, -8));
  for (const [x, y] of [
    [6, 2],
    [5, 3],
    [6, 3],
    [7, 3],
    [6, 4],
  ]) f.px(x, y, x === 6 && y === 3 ? tone(BRASS, 20) : BRASS);
  f.fill(1, 5, 6, 1, tone(shirt, 16)); // the top edge of the pocket catches the light
  f.fill(1, 6, 6, 3, tone(shirt, -9));
  f.fill(1, 5, 1, 4, tone(shirt, -30));
  f.fill(6, 5, 1, 4, tone(shirt, -30));
  f.fill(1, 8, 6, 1, tone(shirt, -32));
  f.px(1, 5, tone(shirt, -2));
  f.px(6, 5, tone(shirt, -2));
  f.fill(0, 2, 1, 8, tone(shirt, -9));
  f.fill(7, 2, 1, 8, tone(shirt, -9));
  hem(f);

  // Back: the hood hangs down between the shoulders.
  const k = new Pen(sheet, b.back);
  k.each((x, y) => cloth(shirt, x, y, 12, seed + 2));
  k.fill(0, 0, 8, 1, tone(shirt, 12));
  k.fill(1, 1, 6, 4, tone(shirt, -14));
  k.fill(1, 1, 6, 1, tone(shirt, -30));
  k.fill(1, 1, 1, 4, tone(shirt, -30));
  k.fill(6, 1, 1, 4, tone(shirt, -30));
  k.fill(1, 4, 6, 1, tone(shirt, -36));
  k.fill(3, 2, 2, 2, tone(shirt, -24));
  k.fill(0, 5, 1, 5, tone(shirt, -9));
  k.fill(7, 5, 1, 5, tone(shirt, -9));
  hem(k);

  for (const left of [false, true]) {
    const s = new Pen(sheet, left ? b.left : b.right, left);
    s.each((x, y) => cloth(shirt, x, y, 12, seed + 3));
    s.fill(1, 1, 1, 9, tone(shirt, -14)); // side seam
    s.fill(0, 0, 4, 1, tone(shirt, 10));
    hem(s);
  }
  new Pen(sheet, b.top).each((x, y) => cloth(tone(shirt, 8), x, y, 4, seed + 4));
  new Pen(sheet, b.bottom).each((x, y) => cloth(tone(shirt, -44), x, y, 4, seed + 6));

  // Outer layer: a leather belt with a brass buckle, and a pouch on the right hip.
  const belt = (p: Pen): void => {
    for (let x = 0; x < p.w; x++) {
      p.px(x, 9, tone(LEATHER, (noise(x, 9, seed) - 0.5) * 14));
      if (x % 3 === 1) p.px(x, 9, tone(LEATHER_DARK, 6));
    }
  };
  const of = new Pen(sheet, o.front);
  belt(of);
  of.fill(3, 9, 2, 1, BRASS);
  of.px(3, 9, tone(BRASS, 26));
  of.px(4, 9, tone(BRASS, -34));
  belt(new Pen(sheet, o.back));
  belt(new Pen(sheet, o.left, true));
  const or = new Pen(sheet, o.right);
  belt(or);
  or.fill(1, 10, 2, 2, LEATHER);
  or.fill(1, 10, 2, 1, LEATHER_DARK);
  or.px(1, 11, tone(LEATHER, -16));
  or.px(2, 10, BRASS);
}

function paintArm(sheet: Sheet, look: Look, part: 'armR' | 'armL'): void {
  const b = partRects(part, 'base');
  const o = partRects(part, 'over');
  const { shirt, skin, seed } = look;
  const sleeve = (p: Pen, front: boolean, s: number): void => {
    p.each((x, y) => {
      if (y < 8) return cloth(shirt, x, y, 12, seed + s);
      if (y === 8) return cloth(tone(shirt, x % 2 ? -20 : -32), x, y, 12, seed + s, 3); // the cuff
      let c = skinTone(skin, x, y, seed + s + 7);
      if (y === 9) c = tone(c, -16);
      if (y === 11) c = tone(c, -20);
      return c;
    });
    p.fill(0, 3, 4, 1, tone(shirt, -13)); // the sleeve gathers at the elbow
    p.fill(0, 6, 4, 1, tone(shirt, -9));
    if (front) {
      p.px(1, 4, tone(shirt, -7));
      p.px(2, 10, tone(skin, -28));
      p.px(2, 11, tone(skin, -30));
    }
  };
  for (const [name, front, s] of [
    ['front', true, 10],
    ['back', false, 11],
    ['right', false, 12],
    ['left', false, 13],
  ] as const) sleeve(new Pen(sheet, b[name]), front, s);
  new Pen(sheet, b.top).each((x, y) => cloth(tone(shirt, 12), x, y, 4, seed + 14));
  new Pen(sheet, b.bottom).each((x, y) => tone(skin, -28 + (noise(x, y, seed) - 0.5) * 8));

  // Outer layer: fingerless leather gloves.
  for (const name of ['front', 'back', 'right', 'left'] as const) {
    const g = new Pen(sheet, o[name]);
    for (let x = 0; x < 4; x++) {
      g.px(x, 9, tone(LEATHER, (noise(x, 9, seed + 3) - 0.5) * 12));
      g.px(x, 10, x % 2 ? LEATHER_DARK : tone(LEATHER, -12));
    }
    if (name === 'back') g.fill(1, 9, 2, 1, LEATHER_LIGHT);
    g.px(0, 8, tone(LEATHER, -6)); // the strap at the wrist
    g.px(3, 8, tone(LEATHER, -6));
  }
}

function paintLeg(sheet: Sheet, look: Look, part: 'legR' | 'legL'): void {
  const b = partRects(part, 'base');
  const o = partRects(part, 'over');
  const { pants, seed } = look;
  const boot = (p: Pen, y: number, s: number): RGB => {
    if (y === 8) return tone(LEATHER_LIGHT, (noise(y, s, seed) - 0.5) * 8);
    if (y === 11) return LEATHER_DARK;
    return tone(LEATHER, (noise(s, y, seed) - 0.5) * 14);
  };
  const side = (name: FaceName, front: boolean, s: number): void => {
    const p = new Pen(sheet, b[name], name === 'left');
    p.each((x, y) => (y < 8 ? cloth(pants, x, y, 12, seed + s, 6) : boot(p, y, s)));
    if (front) {
      p.fill(0, 4, 4, 3, mix(pants, LEATHER, 0.25)); // a knee patch
      p.fill(0, 4, 4, 1, tone(mix(pants, LEATHER, 0.25), -22));
      p.px(0, 6, tone(pants, -12));
      p.px(3, 6, tone(pants, -12));
      p.px(1, 9, CREAM); // laces
      p.px(2, 10, CREAM);
      p.px(2, 9, tone(CREAM, -55));
      p.px(1, 10, tone(CREAM, -55));
      p.fill(0, 10, 4, 1, tone(LEATHER, 8)); // the toe cap
      p.px(1, 10, CREAM);
      p.px(2, 10, CREAM);
    } else {
      p.fill(name === 'back' ? 1 : 2, 0, 1, 7, tone(pants, -13)); // seam
    }
  };
  side('front', true, 20);
  side('back', false, 21);
  side('right', false, 22);
  side('left', false, 23);
  new Pen(sheet, b.top).each((x, y) => cloth(tone(pants, -6), x, y, 4, seed + 24));
  new Pen(sheet, b.bottom).each((x, y) => tone(LEATHER_DARK, (noise(x, y, seed) - 0.5) * 8 - 8));

  // Outer layer: the trousers bag over the top of the boots; the right thigh has a strap.
  for (const name of ['front', 'back', 'right', 'left'] as const) {
    const p = new Pen(sheet, o[name], name === 'left');
    for (let x = 0; x < 4; x++) {
      if (noise(x, 7, seed + (name === 'front' ? 1 : name === 'back' ? 2 : 3)) > 0.22) p.px(x, 7, cloth(tone(pants, 6), x, 7, 12, seed + 5, 6));
      if (noise(x, 8, seed + 9) > 0.6) p.px(x, 8, tone(pants, -4));
    }
    if (part === 'legR') {
      for (let x = 0; x < 4; x++) p.px(x, 2, tone(LEATHER, (noise(x, 2, seed) - 0.5) * 10));
      if (name === 'front') {
        p.px(1, 2, BRASS);
        p.px(2, 2, tone(BRASS, -30));
      }
    }
  }
}

/**
 * The default skin of a look as RGBA bytes: a hooded top with a belt and gloves, trousers tucked into
 * boots, a face with eyes, brows and a mouth, and hair in one of three styles.
 */
export function paintSkin(look: Look): Uint8ClampedArray {
  const sheet = new Sheet();
  paintHead(sheet, look);
  paintBody(sheet, look);
  paintArm(sheet, look, 'armR');
  paintArm(sheet, look, 'armL');
  paintLeg(sheet, look, 'legR');
  paintLeg(sheet, look, 'legL');
  return sheet.data;
}
