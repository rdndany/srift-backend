import type { GearCtx, MageRig } from './mageGear';
import { Sculpt } from './mobVoxel';
import { assemble, dome, ease, frontK, hoop, Palette, slab, stack, type Piece } from './sculptGear';

/**
 * What a Ranger wears, apart from what is painted on the skin (see `classSkin.ts`: the jerkin with its fur collar, laces and bandolier, the
 * bracers, the trousers and the fur-turned boots, all forest green). Only what stands out from the body is built from small cubes (half a pixel of
 * the skin, like King Aurelion): a hat over the head with a feather (the face and the hair show), a quiver of arrows on the back, a pouch and a knife at the belt,
 * and a thin pad on each shoulder. It has no cloak, so the quiver shows. Kept thin on purpose. Built once; each figure gets its own copy.
 * Coordinates are in cubes round the pivot of the part: +x right, +y up, +z the back (see `mageLook.ts`).
 */

const P = new Palette();
const JERKIN = P.ramp([24, 58, 34], [100, 156, 82], 6);
const LEATHER = P.ramp([20, 44, 26], [84, 132, 72], 5);
const FUR = P.ramp([130, 160, 120], [226, 242, 214], 5);
const LEAF = P.ramp([54, 120, 56], [140, 200, 100], 3);

// One colour, a few tones: the jerkin mid green, the leather darker, the fur and the laces lighter.
const jerkinAt = (): number => JERKIN[3]!;
const jerkinLightAt = (): number => JERKIN[4]!;
const leatherAt = (): number => LEATHER[2]!;
const leatherDarkAt = (): number => LEATHER[1]!;
const furAt = (): number => FUR[3]!;
const studAt = (): number => FUR[4]!;
const DARK_QUIVER = (): number => LEATHER[0]!;

// ---- the hat ------------------------------------------------------------------------------------------------------------
function hat(): Sculpt {
  const s = new Sculpt([0, 0, 0], 1 / 32, 91);
  // A hat above the head and nothing else: a hoop round the crown that rises to a peak leaning back. The face and the hair stay as they are.
  hoop(s, 11, jerkinAt);
  hoop(s, 12, jerkinLightAt);
  stack(s, 13, 20, (j) => ({ hx: ease(8.4, 3.2, (j - 13) / 7), hz: ease(8.4, 3.2, (j - 13) / 7), cz: ease(0, 2.5, (j - 13) / 7) }), jerkinAt, 2.3);
  // A feather on the right, curving up and back, with a second under it.
  s.stroke([[10, 5, -3, 2, 3, 4], [12, 10, 0, 2, 3, 4], [13, 16, 5, 2, 3, 4], [12, 21, 10, 2, 3, 3]], () => LEAF[2]!);
  s.stroke([[11, 4, -1, 2, 3, 3], [13, 8, 2, 2, 3, 3], [14, 13, 6, 2, 3, 3]], () => LEAF[1]!);
  s.box(9, 4, -4, 11, 6, 0, studAt);
  return s;
}

// ---- the quiver, the pouch and the knife -------------------------------------------------------------------------------------
function torso(): Sculpt {
  const s = new Sculpt([0, 0, 0], 1 / 32, 92);
  // The quiver on the back, set diagonally from the hip on one side up to the shoulder on the other, and leaning away from the back as it climbs, with a
  // band, a stud and a dark mouth. The arrows go on along the same slant out of its mouth, all of it behind the head (the head is 8 cubes deep from the
  // middle, its hair a little more), each arrow ending in a feather: nothing of the quiver or the arrows goes into the head.
  const along = (k: number): number => Math.round(8 - k * 0.66);
  const lean = (k: number): number => 4 + Math.floor(k / 4);
  for (let k = 0; k < 18; k++) s.box(along(k) - 3, 26 + k, lean(k), along(k) + 3, 28 + k, lean(k) + 5, leatherAt);
  for (const k of [6, 7]) s.box(along(k) - 3, 26 + k, lean(k), along(k) + 3, 28 + k, lean(k) + 6, leatherDarkAt);
  s.box(along(12) - 3, 38, lean(12), along(12) + 3, 40, lean(12) + 6, leatherDarkAt);
  s.box(along(3) - 1, 29, lean(3) + 5, along(3) + 1, 31, lean(3) + 6, studAt);
  s.box(along(17) - 3, 44, lean(17), along(17) + 3, 46, lean(17) + 5, DARK_QUIVER);
  const Z = 11;
  [-2, 0, 2].forEach((dx, n) => {
    for (let k = 17; k < 29 + n; k++) s.box(along(k) + dx, 28 + k, Z, along(k) + dx + 1, 30 + k, Z + 1, () => FUR[1]!);
    const k = 29 + n;
    s.box(along(k) + dx - 1, 28 + k, Z, along(k) + dx + 2, 32 + k, Z + 1, () => LEAF[n % 3]!);
  });
  // The belt: a pouch on the right hip, and a sheathed knife on the left.
  s.box(4, 20, -6, 9, 26, -4, leatherAt);
  s.box(4, 24, -6, 9, 26, -4, leatherDarkAt);
  s.box(6, 21, -7, 7, 23, -6, studAt);
  s.box(-9, 16, -6, -7, 26, -4, leatherDarkAt);
  s.box(-9, 26, -6, -7, 30, -4, jerkinLightAt);
  return s;
}

function arm(side: 1 | -1): Sculpt {
  const s = new Sculpt([0, 0, 0], 1 / 32, side === 1 ? 93 : 94).side(side);
  // A thin pad on the shoulder: a dome of leather on a darker ring, edged in fur on the right, held by two studs on the left.
  slab(s, -5, 5.6, 5.4, leatherDarkAt, 1.2, 0, 2.3);
  dome(s, -4, 6, 5.4, 5.2, 1.2, leatherAt);
  if (side === 1) {
    stack(s, 1, 3, (j) => ({ hx: ease(4.9, 4, (j - 1) / 2), hz: ease(5, 4, (j - 1) / 2), cx: 1.5 }), furAt, 2.2, 0.08, 7);
  } else {
    for (const i of [-1, 3]) s.set(i, -1, frontK(s, i, -1)! - 1, studAt());
  }
  return s;
}

let built: Piece[] | null = null;
export function rangerLook(): Piece[] {
  if (built) return built;
  built = [
    { slot: 'head', part: 'head', bricks: hat().bricks() },
    { slot: 'chest', part: 'torso', bricks: torso().bricks() },
    { slot: 'chest', part: 'armL', bricks: arm(-1).bricks() },
    { slot: 'chest', part: 'armR', bricks: arm(1).bricks() },
  ];
  return built;
}

export function dressRangerSculpt(ctx: GearCtx): MageRig {
  return assemble(ctx, rangerLook(), P.skins, []);
}
