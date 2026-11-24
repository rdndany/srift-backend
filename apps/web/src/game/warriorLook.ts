import type { GearCtx, MageRig } from './mageGear';
import { Sculpt } from './mobVoxel';
import { assemble, dome, ease, hoop, Palette, slab, stack, wrap, type Piece } from './sculptGear';

/**
 * What a Warrior wears, apart from what is painted on the skin (see classSkin.ts: the cuirass, belt, sleeves, tassets, greaves and boots, all steel gray).
 * Only what stands out from the body is built from small cubes (half a pixel of the skin, like King Aurelion): a steel helm with a nose guard, swept
 * fins and a plume, a thin pauldron with a spike on each shoulder, a knee guard each, and a long cape that ripples. Kept thin on purpose.
 * Built once; each figure gets its own copy. Coordinates are in cubes (U) round the pivot of the part: +x right, +y up, +z the back.
 */

const P = new Palette();
const STEEL = P.ramp([52, 56, 66], [214, 218, 226], 6);
const CLOTH = P.ramp([40, 43, 52], [132, 138, 150], 5);
const TRIM = P.ramp([112, 118, 130], [240, 242, 248], 5);
const DARK = P.ramp([24, 25, 30], [70, 73, 84], 3);
/** The ridge and the plume of the helm are the colour of the figure's hair (tones of it: see Palette.hair). */
const HAIR = P.hair(3);

// One colour, a few tones: plates mid-gray, the shadow parts darker, the edges and studs lighter.
const steelAt = (): number => STEEL[3]!;
const steelDarkAt = (): number => STEEL[1]!;
const steelLightAt = (): number => STEEL[4]!;
const trimAt = (): number => TRIM[3]!;
const darkAt = (): number => DARK[1]!;

// ---- the helm -----------------------------------------------------------------------------------------------------------
function helm(): Sculpt {
  const s = new Sculpt([0, 0, 0], 1 / 32, 71);
  // The head itself is painted (see `classSkin.ts`: steel over the top, back and sides, the face left open): only thin steel stands out from it.
  // A cap over the top of the head that rises to a low dome, with a lighter rim, and a band across the brow.
  hoop(s, 11, steelAt);
  hoop(s, 12, steelLightAt);
  hoop(s, 6, steelLightAt);
  hoop(s, 7, steelLightAt);
  stack(s, 13, 17, (j) => ({ hx: ease(8.4, 5.4, (j - 13) / 4), hz: ease(8.4, 5.4, (j - 13) / 4) }), steelAt, 2.4);
  // A nose guard and a plate over each ear.
  s.box(-1, -2, -9, 1, 6, -8, steelLightAt);
  s.both(() => s.box(8, -4, -4, 9, 5, 4, steelAt));
  // The crest and the plume of hair riding it down the back.
  s.box(-1, 17, -7, 1, 19, 9, () => HAIR[2]!);
  s.stroke([[0, 22, -6, 4, 4, 4], [0, 24, -1, 6, 5, 6], [0, 24, 5, 6, 5, 6], [0, 21, 10, 6, 5, 5], [0, 16, 14, 6, 5, 5], [0, 10, 16, 4, 5, 4], [0, 4, 17, 4, 5, 4], [0, -1, 17, 2, 4, 3]], () => HAIR[1]!);
  // Fins swept back from each side.
  s.both(() => {
    s.stroke([[9, 8, -3, 2, 3, 6], [11, 9, 2, 2, 3, 6], [13, 10, 7, 2, 3, 5], [14, 11, 11, 2, 2, 3]], steelAt);
    s.stroke([[9, 10, -3, 1, 1, 6], [11, 11, 2, 1, 1, 6], [13, 12, 7, 1, 1, 5]], steelLightAt);
  });
  return s;
}

// ---- what stands out from the painted clothes ----------------------------------------------------------------------------
// The body, the sleeves, the trousers and the boots are painted on the skin (see `classSkin.ts`): only a thin pauldron and a knee guard stand out.
function arm(side: 1 | -1): Sculpt {
  const s = new Sculpt([0, 0, 0], 1 / 32, side === 1 ? 73 : 74).side(side);
  // A pauldron hugging the shoulder: one thin dome with a lighter rim under it and a small spike.
  slab(s, -5, 5.6, 5.4, steelLightAt, 1.2, 0, 2.3);
  dome(s, -4, 6, 5.4, 5.2, 1.2, steelAt);
  s.stroke([[6, 2, 0, 2, 2, 2], [7, 4, 0, 1, 2, 1]], steelLightAt);
  return s;
}

function knee(side: 1 | -1): Sculpt {
  const s = new Sculpt([0, 0, 0], 1 / 32, side === 1 ? 75 : 76).side(side);
  // A knee guard: a shallow cap on the front of the knee.
  stack(s, -14, -9, (j) => ({ hx: 3.4 + 0.8 * Math.sin((Math.PI * (j + 13.5)) / 5), hz: 4 + 0.9 * Math.sin((Math.PI * (j + 13.5)) / 5), cx: 0.3, cz: -0.6 }), steelAt, 2.5);
  slab(s, -9, 4.3, 4.9, steelLightAt, 0.3, -0.6, 2.5);
  return s;
}
// ---- the cape -----------------------------------------------------------------------------------------------------------
const CAPE_PIECES: [number, number][] = [[20, 15], [22, 14], [24, 13]];
/** The cape ripples: a column stands out a cube or two from the body, in waves. */
const wave = (i: number, n: number): number => Math.round(1 + Math.sin(i * 0.55 + n * 2.1) * 0.9);

function capePiece(n: number): Sculpt {
  const [w, h] = CAPE_PIECES[n]!;
  const hw = w / 2;
  const s = new Sculpt([0, 0, 0], 1 / 32, 80 + n);
  for (let i = -hw; i < hw; i++) {
    const edge = i === -hw || i === hw - 1;
    const k = edge ? 1 : wave(i, n);
    s.box(i, -h, k, i + 1, 0, k + 1, edge ? trimAt : darkAt);
    s.box(i, -h, k + 1, i + 1, 0, k + 2, edge ? trimAt : (ii) => CLOTH[wrap(ii, 4) < 2 ? 1 : 2]!);
  }
  if (n === 0) {
    for (let i = -hw; i < hw; i++) s.box(i, -2, wave(i, n), i + 1, 0, wave(i, n) + 2, trimAt);
    s.box(-4, -3, -1, 4, 1, 0, trimAt);
  }
  if (n === 1) {
    for (let j = -12; j < -3; j++) for (const i of [-1, 0]) s.set(i, j, wave(i, n) + 2, trimAt());
    for (let i = -4; i < 4; i++) for (const j of [-8, -7]) s.set(i, j, wave(i, n) + 2, trimAt());
  }
  if (n === 2) {
    for (let i = -hw; i < hw; i++) s.box(i, -h, wave(i, n), i + 1, -h + 2, wave(i, n) + 2, trimAt);
    for (let i = -hw + 1; i < hw - 1; i++) if (wrap(i, 4) < 2) s.carve(i, -h, 0, i + 1, -h + 1, 4);
  }
  return s;
}

let built: Piece[] | null = null;
export function warriorLook(): Piece[] {
  if (built) return built;
  built = [
    { slot: 'head', part: 'head', bricks: helm().bricks() },
    { slot: 'chest', part: 'armL', bricks: arm(-1).bricks() },
    { slot: 'chest', part: 'armR', bricks: arm(1).bricks() },
    { slot: 'legs', part: 'legL', bricks: knee(-1).bricks() },
    { slot: 'legs', part: 'legR', bricks: knee(1).bricks() },
    { slot: 'cape', part: 0, bricks: capePiece(0).bricks() },
    { slot: 'cape', part: 1, bricks: capePiece(1).bricks() },
    { slot: 'cape', part: 2, bricks: capePiece(2).bricks() },
  ];
  return built;
}

export function dressWarriorSculpt(ctx: GearCtx): MageRig {
  return assemble(ctx, warriorLook(), P.skins, CAPE_PIECES.map(([, h]) => h));
}
