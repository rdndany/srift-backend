/**
 * The small tools the mob skins and rigs are made with: a 16x16 painter is a function of the pixel, a rig is a list of boxes.
 * (Shared by mobRenderer.ts and the hostile mobs' own file, mobHostile.ts.)
 */
export type RGB = [number, number, number];
export type Painter = (x: number, y: number) => RGB;
export type Feature = [number, number, number, number, RGB];

export function hash(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const jit = (c: RGB, amt: number, x: number, y: number, s: number): RGB => {
  const d = (hash(x, y, s) - 0.5) * 2 * amt;
  return [c[0] + d, c[1] + d, c[2] + d];
};

export const rect = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

export const mul = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export const plain = (c: RGB, amt: number, s: number): Painter => (x, y) => jit(c, amt, x, y, s);
export const withFeatures = (base: Painter, feats: Feature[]): Painter => (x, y) => {
  for (const [a, b, c, d, col] of feats) if (rect(x, y, a, b, c, d)) return col;
  return base(x, y);
};
export const eyes = (y0: number, y1: number, col: RGB, x0 = 3, x1 = 5): Feature[] => [
  [x0, y0, x1, y1, col],
  [15 - x1, y0, 15 - x0, y1, col],
];

export interface Part {
  /** Box size (w, h, d). */
  size: [number, number, number];
  /** Joint position in model space; the box hangs from here by `hang` (down) or is centered when hang is false. */
  at: [number, number, number];
  skin: string;
  /** Face texture for the -Z side (the front). */
  front?: string;
  /** The box pivots at its top (limbs) instead of its centre. */
  hang?: boolean;
  /** Walk-cycle swing: amplitude sign (+1 / -1), or 0 for none. */
  swing?: number;
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  isHead?: boolean;
  /** Wing flap: rotation about Z swings by this much (radians) around rotZ. */
  flap?: number;
  /** Walk swing applied about Y instead of X (spider legs). */
  swingY?: number;
  /** Translucent shell opacity. */
  alpha?: number;
  /** An arm that comes down in the mob's melee swing (this much of the swing; see `strikeArm`). */
  strike?: number;
  /** Index (in the rig) of the part this one is fastened to: `at` is then from that part's joint, and it moves with it. */
  of?: number;
  /** Euler order, for arms that are turned about the up axis after they are raised. */
  order?: 'YXZ';
  /** A part of an archer's arms, posed every frame (see `drawArm`): the bow arm and the string arm, each upper and fore. */
  arm?: 'bow' | 'draw' | 'drawFore';
  /** Shown only while the string is drawn (the arrow on the bow). */
  nock?: boolean;
  /** One plain material (not a shade for every side): a small detail that is not worth six draw calls. */
  flat?: boolean;
  /** A knee or an elbow: with `of` a swinging limb, it folds back this much (radians per radian) while that limb swings back. */
  bend?: number;
  /** Shines by itself (eyes in the dark): not shaded by the light around the mob. */
  glow?: boolean;
  /** A boss's arm (or what it holds) while the boss gathers a spell: turned this much more (radians) as the spell builds. */
  raise?: number;
  /**
   * An arm that carries a weapon: its blow is the weapon's overhead chop worked by the shoulder, the elbow (`elbow`) and the wrist (`grip`), not
   * the arm turning as one stiff piece (see `bladeSwing` in creatureRig.ts).
   */
  armed?: boolean;
  /** The forearm of an armed arm (`of` the arm): the elbow it bends at. */
  elbow?: boolean;
  /** What an armed arm holds (`of` the forearm). Its place is the grip: the part's origin is the middle of the handle, which is in the middle of the fist; the wrist turns it. */
  grip?: boolean;
  /** For a grip part: where the wrist is, in the forearm's frame (the middle of the fist). The weapon turns about this point, so the grip stays in the hand. */
  wrist?: [number, number, number];
  /** Lit from within (a block of lava stone): at least this bright (0..1) whatever light falls on it, shaded by side. */
  selfLit?: number;
  /**
   * A cluster of many small cubes drawn as ONE mesh (one draw call): each is [x, y, z, w, h, d, shade, skin], placed from the part's joint
   * (so with `hang` the limb runs down from it), `shade` a brightness (about 0.6..1.3, baked into the cube) and `skin` an index into
   * `brickSkins`. The part's own `size` and `skin` are then unused for the shape. Used for the Hollow King (see mobBoss.ts).
   */
  bricks?: Brick[];
  /** The skins (see SKINS in mobRenderer.ts) the cubes of `bricks` are painted with. */
  brickSkins?: string[];
  /**
   * A flame, like the fire of a flint and steel (block B.FIRE, see atlas.ts `fire_0`..`fire_3`): three crossed upright panes `size[0]` wide
   * and `size[1]` high standing on the point `at`, flickering through the four frames of the fire tile. It stays upright whatever the
   * part it is fastened to (`of`) does, is not lit or shaded, casts no shadow and shows no hurt flash. The number is its phase.
   */
  flame?: number;
  /** A glowing part that breathes: its brightness swells and fades by this much (0..1) at a pace of its own. */
  pulse?: number;
}

/**
 * One cube of a cluster: x, y, z, w, h, d, shade, skin (see `Part.bricks`), and optionally a mask of the sides that are drawn
 * (bit 0..5 = +x, -x, +y, -y, +z, -z; all six when it is left out): a voxel sculpture leaves out the sides that touch another cube.
 */
export type Brick = [number, number, number, number, number, number, number, number, number?];
