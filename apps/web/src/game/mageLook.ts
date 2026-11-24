import type { GearCtx, MageRig } from './mageGear';
import type { Brick } from './mobPaint';
import { Sculpt } from './mobVoxel';
import { assemble, defineGlow, disc, dome, ease, frontK, Palette, pick, slab, stack, U, wrap, type Piece, type Round } from './sculptGear';

/**
 * What a Mage wears, sculpted from small cubes (half a pixel of the skin, like King Aurelion): an archmage of the night. A tall wizard's hat
 * with a wide bending brim, a gold crescent and stars on the crown and a tassel at the drooping tip; a midnight robe with silk lapels, a
 * gold-seamed yoke, a jewelled belt with a grimoire on one hip and a glowing vial on the other; wide bell sleeves lined in lilac with glowing
 * runes at the cuff; shoulder mantles that rise into gold horns; a long skirt that falls over the boots in flared, layered panels with a
 * pointed hem and runes of light; and a long three-piece cape with a glowing gold crescent and constellations. Built once; each figure gets
 * its own copy of the shapes.
 *
 * Coordinates are in cubes (`U`) round the pivot of the part: +x right, +y up, +z the back. A cube spans i..i+1, so a box from -9 to 9 is
 * 18 cubes wide and centred. The hat sits on the head's top at 11 cubes, the torso spans 23..48, the skirt hangs from the hip.
 */

defineGlow('gem', 0xb48cff);
defineGlow('vial', 0xd4b0ff);
defineGlow('hatStar', 0xeedaff);
defineGlow('rune', 0xd6bcff);
defineGlow('capeStar', 0xeedaff);
defineGlow('capeSpeck', 0xcfc0ff);
defineGlow('edge', 0x9c7cff);

const P = new Palette();
const ROBE = P.ramp([54, 14, 104], [156, 66, 226], 6);
const SILK = P.ramp([150, 56, 214], [236, 150, 255], 5);
const CAPE = P.ramp([38, 10, 80], [118, 44, 190], 5);
const HAT = P.ramp([66, 20, 122], [144, 62, 216], 5);
const LINING = P.ramp([140, 62, 206], [236, 150, 255], 4);
const GOLD = P.ramp([100, 56, 176], [228, 198, 255], 5);
const LEATHER = P.ramp([26, 10, 52], [100, 52, 164], 4);
const TRIM = P.ramp([120, 52, 204], [214, 156, 255], 4);
const BAND = P.ramp([84, 30, 150], [176, 104, 244], 3);
const BOOK = P.ramp([30, 12, 56], [84, 42, 136], 3);
const DARK = P.add([30, 10, 52]);
const GEM = P.add([196, 160, 255], 'gem');
const VIAL = P.add([212, 176, 255], 'vial');
const HAT_STAR = P.add([238, 218, 255], 'hatStar');
const RUNE = P.add([220, 200, 255], 'rune');
const CAPE_STAR = P.add([238, 218, 255], 'capeStar');
const SPECK = P.add([214, 202, 255], 'capeSpeck');
const EDGE = P.add([168, 140, 255], 'edge');

/** Midnight silk: folds a dark crease and then lighter toward the next, every four cubes, with a few arcane glints. */
const robeAt = (i: number, j: number, k: number): number => {
  return pick(ROBE, [2, 3, 4, 3][wrap(i + k * 2, 4)]!, i, j, k, 3);
};
const silkAt = (): number => SILK[2]!;
const hatAt = (i: number, j: number): number => (j % 5 === 0 ? HAT[1]! : HAT[2]!);
const capeAt = (i: number, j: number, k: number): number => pick(CAPE, [0, 1, 3, 2][wrap(i, 4)]!, i, j, k, 8);
const liningAt = (i: number, j: number, k: number): number => pick(LINING, [0, 1, 2, 3][wrap(i, 4)]!, i, j, k, 9);
const trimAt = (): number => TRIM[2]!;
const goldAt = (): number => GOLD[3]!;
const leatherAt = (): number => LEATHER[2]!;
const yokeAt = (): number => ROBE[3]!;
const bookAt = (): number => BOOK[1]!;

/** A crescent moon in the plane facing the viewer: `put(i, j)` is called for each cube of it, centred on (cx, cy), `r` across, open to the right. */
function crescent(cx: number, cy: number, r: number, put: (i: number, j: number) => void): void {
  for (let j = Math.floor(cy - r); j <= Math.ceil(cy + r); j++)
    for (let i = Math.floor(cx - r); i <= Math.ceil(cx + r); i++) {
      const inOuter = Math.hypot(i + 0.5 - cx, j + 0.5 - cy) <= r;
      const inCut = Math.hypot(i + 0.5 - cx - r * 0.45, j + 0.5 - cy - r * 0.15) <= r * 0.82;
      if (inOuter && !inCut) put(i, j);
    }
}

// ---- the hat ----------------------------------------------------------------------------------------------------------
function hat(): Sculpt {
  const s = new Sculpt([0, 0, 0], U, 11);
  // The brim: a wide round sheet that dips at the front and lifts at the back and the sides, edged in a darker rim.
  const R = 20;
  const liftAt = (i: number, k: number): number => {
    const x = i + 0.5;
    const z = k + 0.5;
    return Math.round(2.6 * (x / R) ** 2 + (z > 0 ? 3.2 * (z / R) ** 2 : z < -13 ? -1 : 0));
  };
  for (let i = -R; i < R; i++)
    for (let k = -R; k < R; k++) {
      const d = Math.hypot(i + 0.5, k + 0.5);
      if (d > R || d < 8) continue;
      const lift = liftAt(i, k);
      // Every column reaches down to its lowest neighbour, so the brim is one unbroken sheet however it bends.
      const low = Math.min(lift, liftAt(i - 1, k), liftAt(i + 1, k), liftAt(i, k - 1), liftAt(i, k + 1));
      for (let j = low; j <= lift; j++) s.set(i, 11 + j, k, d > R - 1.4 ? HAT[0]! : d > R - 2.6 ? HAT[1]! : hatAt(i, 3));
    }
  // The crown's foot and the band round it: orange leather with a darker edge, a gold buckle at the front.
  disc(s, 11, 15, 8.8, hatAt);
  disc(s, 12, 15, 9.8, (i, j) => BAND[j === 12 ? 0 : j === 13 ? 1 : 2]!);
  s.box(-3, 12, -11, 3, 15, -10, goldAt);
  s.box(-1, 13, -11, 1, 14, -10, HAT_STAR);
  // The crown: a tall cone that narrows and leans back as it climbs, then bends over and droops down the back.
  const TOP = 38;
  const crown = (j: number): { r: number; cz: number } => {
    const t = (j - 15) / (TOP - 15);
    return { r: 9 * (1 - t) ** 1.15 + 1.5 * t, cz: 11 * t ** 2.2 };
  };
  for (let j = 15; j <= TOP; j++) {
    const { r, cz } = crown(j);
    disc(s, j, j + 1, r, hatAt, 0, cz);
  }
  s.stroke([[0, TOP, 11, 4, 3, 4], [0, TOP, 14, 4, 3, 4], [0, TOP - 3, 17, 3, 3, 3], [0, TOP - 7, 18, 2, 3, 2], [0, TOP - 11, 18, 2, 3, 2]], hatAt);
  // A gold bell with a tassel of light at the tip.
  s.box(-1, TOP - 15, 17, 1, TOP - 12, 19, goldAt);
  s.box(0, TOP - 17, 17, 1, TOP - 15, 18, HAT_STAR);
  const front = (j: number): number => {
    const { r, cz } = crown(j);
    for (let k = -24; k < 24; k++) if (0.25 + (k + 0.5 - cz) ** 2 <= r * r) return k;
    return 0;
  };
  // A gold crescent moon on the front of the crown, with a star of light inside its horns.
  crescent(-1, 25, 5, (i, j) => s.set(i, j, front(j), goldAt()));
  for (const [i, j] of [[0, 25], [1, 25], [0, 26], [0, 24]] as const) s.set(i, j, front(j), HAT_STAR);
  // Specks of light scattered round the crown, each found on the outside of the cone.
  for (const [j, a] of [[17, 0.9], [18, 4.1], [21, 2.3], [22, 5.6], [27, 3.4], [29, 5.9], [31, 1.1], [20, 3.9], [26, 0.4], [33, 4.6]] as const) {
    const { r, cz } = crown(j);
    for (let rr = r + 1; rr > 0; rr -= 0.5) {
      const i = Math.floor(rr * Math.cos(a));
      const k = Math.floor(cz + rr * Math.sin(a));
      if (s.has(i, j, k)) {
        s.set(i, j, k, HAT_STAR);
        break;
      }
    }
  }
  return s;
}

// ---- what stands out from the painted robe ---------------------------------------------------------------------------------
// The robe, the sleeves, the hem and the boots are painted on the skin (see `classSkin.ts`): only the hat, a thin mantle with a horn, a wide cuff, what
// hangs from the belt, and the cape are built.
function torso(): Sculpt {
  const s = new Sculpt([0, 0, 0], U, 21);
  // A jewel on the buckle of the belt (the belt is row 9 of the body, a little above the hip), and a pendant on the breast.
  s.box(-1, 28, -5, 1, 30, -4, GEM);
  s.box(-1, 38, -5, 1, 40, -4, GEM);
  // A grimoire hanging on the right hip, with a rune on its cover, and a glowing vial on the left.
  s.box(3, 21, -6, 8, 29, -4, bookAt);
  s.box(3, 21, -6, 4, 29, -4, trimAt);
  s.box(5, 24, -7, 7, 26, -6, RUNE);
  s.box(-8, 22, -6, -6, 28, -4, VIAL);
  s.box(-8, 28, -6, -6, 29, -4, trimAt);
  return s;
}

function arm(side: 1 | -1): Sculpt {
  const s = new Sculpt([0, 0, 0], U, side === 1 ? 31 : 32).side(side);
  // A mantle over the shoulder: a thin dome of robe on a ring of light violet, a horn rising from it with a gem at its root.
  slab(s, -5, 5.6, 5.4, trimAt, 1.2, 0, 2.3);
  dome(s, -4, 6, 5.4, 5.2, 1.2, robeAt);
  s.stroke([[6, 2, 0, 3, 2, 3], [8, 4, 0, 2, 2, 2], [9, 6, 0, 2, 2, 2]], trimAt);
  s.box(5, -1, -6, 7, 1, -5, GEM);
  // The cuff opens a little round the wrist: a bell of robe with a ring of runes of light, the hand left bare below it.
  stack(s, -20, -14, (j) => ({ hx: ease(5.8, 4.7, (j + 20) / 6), hz: ease(5.8, 4.7, (j + 20) / 6) }), robeAt, 2.3, 0.06, 7);
  slab(s, -20, 5.9, 5.9, trimAt, 0, 0, 2.3);
  for (let i = -5; i <= 4; i += 3) s.set(i, -18, frontK(s, i, -18)! - 1, RUNE);
  return s;
}
// ---- the cape -----------------------------------------------------------------------------------------------------------
const CAPE_PIECES: [number, number][] = [[20, 15], [22, 14], [24, 13]];
/** The cape ripples: a column stands out a cube or two from the body, in waves. */
const wave = (i: number, n: number): number => Math.round(1 + Math.sin(i * 0.55 + n * 2.1) * 0.9);

function capePiece(n: number): Sculpt {
  const [w, h] = CAPE_PIECES[n]!;
  const hw = w / 2;
  const s = new Sculpt([0, 0, 0], U, 60 + n);
  for (let i = -hw; i < hw; i++) {
    const edge = i === -hw || i === hw - 1;
    const k = edge ? 1 : wave(i, n);
    s.box(i, -h, k, i + 1, 0, k + 1, edge ? trimAt : liningAt);
    s.box(i, -h, k + 1, i + 1, 0, k + 2, edge ? trimAt : capeAt);
  }
  if (n === 0) {
    for (let i = -hw; i < hw; i++) s.box(i, -2, wave(i, n), i + 1, 0, wave(i, n) + 2, trimAt);
    // A glowing crescent moon, with a star in it.
    crescent(-1, -8, 5, (i, j) => s.set(i, j, wave(i, n) + 2, CAPE_STAR));
    s.set(1, -8, wave(1, n) + 2, SPECK);
  }
  if (n === 1) {
    for (let j = -9; j < -3; j++) for (const i of [-1, 0]) s.set(i, j, wave(i, n) + 2, CAPE_STAR);
    for (let i = -3; i < 3; i++) for (const j of [-7, -6]) s.set(i, j, wave(i, n) + 2, CAPE_STAR);
  }
  if (n === 2) {
    // A hem cut into long points.
    for (let i = -hw; i < hw; i++) s.box(i, -h, wave(i, n), i + 1, -h + 2, wave(i, n) + 2, trimAt);
    for (let i = -hw + 1; i < hw - 1; i++) {
      const depth = Math.round((Math.abs(wrap(i, 6) - 2.5) / 2.5) * 4);
      if (depth > 0) s.carve(i, -h, 0, i + 1, -h + depth, 4);
    }
  }
  const specks: [number, number][][] = [[[-7, -4], [7, -11], [-3, -13], [6, -3]], [[-9, -3], [9, -10], [-6, -11], [5, -12]], [[-9, -4], [6, -6], [-3, -9], [9, -10], [0, -7]]];
  for (const [x, y] of specks[n]!) s.set(x, y, wave(x, n) + 2, SPECK);
  return s;
}
let built: Piece[] | null = null;
export function mageLook(): Piece[] {
  if (built) return built;
  built = [
    { slot: 'head', part: 'head', bricks: hat().bricks() },
    { slot: 'chest', part: 'torso', bricks: torso().bricks() },
    { slot: 'chest', part: 'armL', bricks: arm(-1).bricks() },
    { slot: 'chest', part: 'armR', bricks: arm(1).bricks() },
    { slot: 'cape', part: 0, bricks: capePiece(0).bricks() },
    { slot: 'cape', part: 1, bricks: capePiece(1).bricks() },
    { slot: 'cape', part: 2, bricks: capePiece(2).bricks() },
  ];
  return built;
}

/** How many cubes the Mage's clothes are made of (for the tests). */
export function mageCubes(): number {
  return mageLook().reduce((n, p) => n + p.bricks.length, 0);
}

export function dressMageSculpt(ctx: GearCtx): MageRig {
  return assemble(ctx, mageLook(), P.skins, CAPE_PIECES.map(([, h]) => h));
}
