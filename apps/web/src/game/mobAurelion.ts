import { hash, plain, type Painter, type Part, type RGB } from './mobPaint';
import { Sculpt } from './mobVoxel';

/**
 * King Aurelion, the boss of the Gilded Tide: a short, wide, heavily armoured demon (a chunky figurine, not a man) sculpted from small cubes
 * (a tenth of a block each; see mobVoxel.ts), about 70 cubes from his boots to the tips of his horns.
 *
 * The proportions come from the picture he was drawn from: the head and horns are half of him, the torso a fifth and the legs the rest;
 * the shoulders reach a good way past the helmet, the legs are short and thick, and the boots are huge. Black plate is the main colour,
 * with orange and gold laid over it in layers (plates, rims, studs) and dark gaps left between the pieces.
 *
 *   y   0..21 legs (boots 0..6, shins 6..13, knees about 13, thighs 13..21)
 *   y  21..37 hips, belt, belly and chest, with the collar above
 *   y  38..71 helmet, face, spikes and the two great horns
 *   x   +-17  the pauldrons.   He faces -z; the sword is in his hand on the +x side and the shield on the -x arm.
 *
 * Every limb is one mesh with the joint it turns about, so the walk, the strike and the spell all play as for any mob.
 */

const COLORS = {
  ch0: [23, 23, 25], // deep black armour       #171719
  ch1: [38, 38, 42], // charcoal armour          #26262A
  ch2: [56, 54, 56], // dark grey armour         #383638
  orB: [168, 59, 8], // deep burnt orange        #A83B08
  or: [217, 87, 6], // dark orange              #D95706
  orBr: [255, 121, 0], // bright orange            #FF7900
  fire: [255, 153, 0], // fiery orange             #FF9900
  gold: [255, 193, 42], // golden yellow            #FFC12A
  yel: [255, 227, 71], // bright yellow            #FFE347
  eye: [255, 244, 49], // the glow of the eyes     #FFF431
  fang: [242, 238, 227], // teeth                    #F2EEE3
  mouth: [9, 4, 5], // the dark of the mouth
  gum: [64, 14, 8], // its dark red walls
  hot: [255, 246, 190], // the white-hot heart of the blade
} satisfies Record<string, RGB>;
type Tone = keyof typeof COLORS;
const TONES = Object.keys(COLORS) as Tone[];
/** Each tone's number: what the cubes carry (an index into `brickSkins`). */
const T = Object.fromEntries(TONES.map((n, i) => [n, i])) as Record<Tone, number>;
const BRICK_SKINS = TONES.map((n) => `au_${n}`);
/** The skins of the cubes: flat colours with the faintest grain (the variety comes from each cube's own shade). */
export const AURELION_SKINS: Record<string, Painter> = Object.fromEntries(TONES.map((n, i) => [`au_${n}`, plain(COLORS[n], 3, 600 + i)]));

type V3 = [number, number, number];

/**
 * How big he is next to a player. He was sculpted at 6.2 blocks (3.4 players); he stands about 1.8 times a player now (a player is 1.8 blocks), so
 * the whole sculpture, its joints and the cubes it is made of, is scaled down by this when the rig is made. The numbers in the sculpting below are
 * in the sculpture's own size and are not changed.
 */
export const AURELION_SCALE = 3.3 / 6.2;

/** How the sword arm stands at rest: the shoulder hangs almost straight, the elbow is bent a little (radians, about x). */
const SWORD_ARM_X = 0.08;
const SWORD_ELBOW_X = 0.22;
/** Where the sword's origin is in the forearm's frame (blocks, in the sculpture's own size): the middle of its handle, which is the middle of the fist. */
const SWORD_GRIP: V3 = [-0.0052, -0.9748, 0.0657];

export function aurelionRig(): Part[] {
  const k = AURELION_SCALE;
  return sculptedRig().map((p) => ({
    ...p,
    at: [p.at[0] * k, p.at[1] * k, p.at[2] * k],
    size: [p.size[0] * k, p.size[1] * k, p.size[2] * k],
    wrist: p.wrist && ([p.wrist[0] * k, p.wrist[1] * k, p.wrist[2] * k] as [number, number, number]),
    bricks: p.bricks?.map((b) => [b[0] * k, b[1] * k, b[2] * k, b[3] * k, b[4] * k, b[5] * k, ...b.slice(6)] as typeof b),
  }));
}

function sculptedRig(): Part[] {
  const rig: Part[] = [];
  const add = (p: Part): number => rig.push(p) - 1;
  let seed = 1;
  const limb = (sc: Sculpt, at: V3, extra: Partial<Part> = {}): number => add({ size: [0.1, 0.1, 0.1], at, skin: 'au_ch1', bricks: sc.bricks(), brickSkins: BRICK_SKINS, flat: true, selfLit: 0.3, ...extra });
  const sculpt = (joint: V3): Sculpt => new Sculpt(joint, 0.1, seed++);
  const stripes = (a: Tone, b: Tone, from: number, every: number) => (_i: number, _j: number, k: number): number => (Math.floor((k - from) / every) % 2 === 0 ? T[a] : T[b]);

  // ---- the legs: short, thick, plated; the boots huge, banded orange and gold, with segmented toes ----
  for (const s of [1, -1] as const) {
    const hip: V3 = [9 * s, 26, 0]; // the hip joint sits 5 units above where the old thigh ended: the legs are longer, as in the picture
    const knee: V3 = [9 * s, 13, 0];
    const th = sculpt(hip).side(s);
    th.box(4, 13, -5, 14, 21, 5, T.ch1);
    th.box(4, 13, -5, 14, 14, 5, T.ch0); // the dark joint above the knee
    th.box(4, 21, -5, 14, 26, 5, T.ch1); // the upper thigh, the extra length
    th.box(14, 14, -4, 16, 24, 4, T.ch2); // a plate on the outer thigh
    th.box(14, 22, -4, 16, 23, 4, T.orB);
    th.box(15, 17, -2, 16, 21, 2, T.gold);
    th.box(5, 15, -7, 13, 25, -5, T.ch2); // the front plates, one over the other
    th.box(5, 19, -7, 13, 20, -5, T.ch0);
    th.box(5, 23, -7, 13, 24, -5, T.ch0);
    th.box(6, 16, -8, 12, 19, -7, T.ch1);
    th.box(6, 20, -8, 12, 23, -7, T.ch1);
    th.box(7, 17, -8, 11, 18, -7, T.orB); // thin seams of lava
    th.box(7, 21, -8, 11, 22, -7, T.orB);
    th.box(8, 17, -9, 10, 18, -8, T.gold);
    th.box(5, 15, 5, 13, 25, 6, T.ch2); // and one behind
    th.box(3, 15, -4, 4, 25, 4, T.ch2); // inner side
    const thigh = limb(th, [9 * s * 0.1, 2.6, 0], { hang: true, swing: s * 0.7 });

    const sh = sculpt(knee).side(s);
    sh.box(4, 6, -4, 14, 13, 5, T.ch1); // the shin
    sh.box(4, 12, -4, 14, 13, 5, T.ch0);
    sh.box(5, 6, -6, 13, 12, -4, T.ch2); // the greave
    sh.box(5, 8, -7, 13, 9, -6, T.orB);
    sh.box(5, 10, -7, 13, 11, -6, T.ch0);
    sh.box(14, 7, -3, 15, 13, 4, T.ch2);
    sh.box(15, 8, -2, 16, 12, 3, T.gold);
    sh.box(3, 7, -3, 4, 12, 4, T.ch2);
    sh.box(5, 11, -9, 13, 16, -5, T.or); // the knee: a stepped orange guard with a spike
    sh.box(6, 16, -9, 12, 17, -6, T.gold);
    sh.box(6, 10, -8, 12, 11, -5, T.orB);
    sh.box(7, 12, -11, 11, 15, -9, T.orBr);
    sh.box(8, 13, -12, 10, 14, -11, T.yel);
    sh.box(3, 5, -6, 15, 8, 6, T.ch0); // the ankle, ringed in orange
    sh.box(3, 7, -6, 15, 8, 6, T.orB);
    sh.box(2, 0, -12, 16, 1, 6, T.ch0); // the sole
    sh.box(2, 1, -12, 16, 6, 0, stripes('gold', 'or', -12, 3)); // the toe, banded
    sh.box(2, 1, 0, 16, 6, 6, T.orB); // the heel
    sh.box(2, 5, 0, 16, 6, 6, T.or);
    sh.box(2, 1, -13, 6, 5, -12, T.gold); // three toes
    sh.box(6, 1, -14, 12, 5, -12, T.yel);
    sh.box(12, 1, -13, 16, 5, -12, T.gold);
    sh.box(6, 5, -12, 12, 6, -8, T.orBr);
    limb(sh, [0, -1.3, 0], { hang: true, of: thigh, bend: 0.9 });
  }

  // ---- the hips, belly, chest, collar, back and the pauldrons: one solid piece that does not move ----
  const body = sculpt([0, 0, 0]);
  body.box(-8, 21, -5, 8, 26, 5, T.ch1); // the hips
  body.box(-9, 24, -6, 9, 27, 6, T.ch0); // the belt
  body.both(() => {
    for (const x of [2, 5, 8]) body.box(x, 25, -7, x + 1, 26, -6, T.or);
  });
  const buckle: [number, number, number][] = [[-1, 1, 27], [-2, 2, 26], [-3, 3, 25], [-2, 2, 24], [-1, 1, 23]]; // the gold ornament, a stepped diamond
  for (const [a, b, y] of buckle) body.box(a, y, -9, b, y + 1, -6, T.gold);
  body.box(-1, 25, -10, 1, 26, -9, T.orBr);
  body.box(-3, 15, -8, 3, 23, -6, T.ch2); // hanging plates under the belt
  body.box(-3, 15, -8, 3, 16, -6, T.gold);
  body.box(-2, 18, -9, 2, 20, -8, T.orB);
  body.box(-4, 15, 5, 4, 23, 7, T.ch1);
  body.box(-4, 15, 5, 4, 16, 7, T.gold);
  // the belly: layered rows with dark gaps between
  body.box(-8, 27, -5, 8, 31, 5, T.ch1);
  body.box(-7, 27, -7, 7, 28, -5, T.ch2);
  body.box(-6, 28, -6, 6, 29, -5, T.ch0);
  body.box(-6, 29, -7, 6, 30, -5, T.ch2);
  body.box(-5, 30, -6, 5, 31, -5, T.ch0);
  // a V of lava glowing under the chest, the only orange in the belly
  body.box(-4, 30, -7, 4, 31, -5, T.orB);
  body.box(-2, 29, -7, 2, 30, -5, T.orB);
  body.box(-1, 28, -7, 1, 29, -6, T.orBr);
  for (let x = -6; x < 6; x++) if (hash(x, 29, 21) > 0.62) body.set(x, 28, -7, hash(x, 28, 5) > 0.5 ? T.ch2 : T.ch0);
  body.both(() => {
    body.box(8, 27, -4, 9, 31, 4, T.ch2);
    body.box(8, 28, -3, 9, 29, 3, T.orB);
  });
  // the chest: a vast block, big orange plates with gold between them, a dark seam down the middle
  body.box(-10, 31, -6, 10, 37, 6, T.ch1);
  body.both(() => {
    body.box(1, 31, -8, 9, 35, -6, T.ch2);
    body.box(2, 35, -8, 10, 37, -6, T.ch1);
    body.box(1, 34, -9, 9, 35, -8, T.gold); // the broad gold bar across the chest, with taller end blocks
    body.box(8, 33, -9, 10, 36, -8, T.gold);
    body.box(9, 35, -9, 10, 37, -8, T.yel);
    body.box(2, 33, -9, 5, 34, -8, T.ch0); // dark plate under it
    body.box(6, 32, -9, 8, 34, -8, T.ch1);
    body.box(2, 31, -9, 4, 32, -8, T.orB); // lava seams
    body.box(6, 31, -9, 8, 32, -8, T.orB);
    body.box(3, 36, -9, 6, 37, -8, T.orB);
    body.box(4, 35, -9, 6, 36, -8, T.orBr);
    body.box(3, 35, -9, 4, 36, -8, T.ch0);
    body.box(1, 32, -9, 2, 33, -8, T.orB);
    body.carve(9, 36, -8, 10, 37, -6);
    body.box(10, 31, -5, 11, 36, 5, T.ch2);
    body.box(10, 33, -4, 11, 34, 4, T.or);
  });
  // irregular raised plates over the chest, different on each side, so that the front is a jumble of armour and not a pattern
  for (let x = -9; x < 9; x++) {
    if (x >= -1 && x < 1) continue;
    for (const y of [32, 33, 35, 36]) {
      const r = hash(x + 40, y, 31);
      if (r < 0.7) continue;
      body.box(x, y, -10, x + 1, y + 1, -8, r > 0.88 ? T.ch0 : r > 0.8 ? T.ch1 : T.ch2);
    }
  }
  body.box(-1, 30, -8, 1, 37, -5, T.ch0);
  body.box(-1, 33, -8, 1, 35, -7, T.orBr);
  body.box(-1, 34, -9, 1, 35, -8, T.hot);
  // the collar: a thick ring round the neck (its top is where the jaw begins), with heavy plates over the collar bones
  body.box(-8, 37, -7, 8, 38, 7, T.ch2);
  body.box(-8, 37, -8, 8, 38, -7, T.or);
  body.both(() => {
    body.box(8, 36, -6, 12, 39, 6, T.ch1);
    body.box(8, 38, -7, 12, 39, 7, T.ch2);
    body.box(8, 36, -7, 12, 37, -6, T.orB);
  });
  // the back: a plate with orange vents, a dark spine and a row of black spikes
  body.box(-8, 29, 6, 8, 36, 8, T.ch2);
  for (const y of [30, 32, 34]) body.box(-6, y, 8, 6, y + 1, 9, T.orB);
  body.box(-1, 28, 8, 1, 39, 10, T.ch0);
  body.both(() => {
    for (const [x, h] of [[3, 5], [6, 4]] as const) {
      body.box(x, 36, 6, x + 2, 36 + h, 8, T.ch0);
      body.box(x, 36 + h, 6, x + 1, 37 + h, 8, T.ch0);
    }
  });
  // the pauldrons: tiers of orange over a black dome, a sweep of gold flaring up and out, spikes on the rim
  body.both(() => {
    body.box(9, 30, -6, 17, 38, 6, T.ch1);
    body.box(11, 27, -4, 16, 28, 4, T.ch0);
    body.box(10, 28, -5, 17, 31, 5, T.ch2);
    body.box(10, 30, -6, 17, 31, -5, T.orB);
    body.box(10, 31, -8, 18, 34, 8, T.ch2);
    body.box(10, 31, -9, 18, 32, -8, T.ch0);
    body.box(10, 33, -9, 18, 34, -8, T.gold);
    body.box(10, 31, -9, 12, 33, -8, T.orBr);
    // the top of the pauldron: a stepped black slab, with a raised block on it
    body.box(11, 34, -7, 18, 38, 7, T.ch2);
    body.box(11, 38, -5, 18, 40, 5, T.ch1);
    body.box(13, 40, -3, 18, 41, 3, T.ch2);
    body.box(11, 36, -8, 14, 38, -7, T.orB);
    body.box(13, 37, 6, 17, 40, 9, T.ch2);
    body.box(14, 40, 7, 16, 42, 9, T.ch0);
    // the great gold blade of the pauldron: sweeps up and out from the shoulder
    body.stroke(
      [
        [11.5, 36, -0.5, 3, 2, 12],
        [14, 38, -0.5, 3, 2, 12],
        [17, 40, -0.5, 3, 2, 10],
        [20, 42, -0.5, 3, 2, 8],
      ],
      (_i, j, k) => (k < -3 || j % 2 === 0 ? T.gold : T.yel),
    );
  });
  // the two shoulders are not the same: the sword side has a gold hook and a black horn out to the side; the shield side a tall black spike and the blade carried on
  body.side(1);
  body.box(18, 31, -7, 20, 38, -5, T.gold);
  body.box(19, 38, -7, 21, 40, -5, T.yel);
  body.box(18, 34, -3, 22, 36, 3, T.ch0);
  body.box(22, 35, -2, 24, 36, 2, T.ch0);
  body.side(-1);
  body.stroke(
    [
      [22.5, 44, -0.5, 3, 2, 6],
      [24.5, 46, -0.5, 2, 2, 4],
      [26, 48, -0.5, 1, 2, 2],
    ],
    (_i, j, k) => (k < -2 || j % 2 === 0 ? T.gold : T.yel),
  );
  body.box(13, 39, -3, 18, 42, 3, T.ch0);
  body.box(15, 42, -2, 18, 44, 2, T.ch0);
  body.box(16, 44, -1, 18, 46, 1, T.ch0);
  body.side(1);
  limb(body, [0, 0.5, 0], { skin: 'au_ch1' }); // everything above the legs is lifted 5 units onto the longer legs

  // ---- STAGE 1: the head. A big black helmet, a scowling face with a real hollow mouth and four standing fangs, tusk cheeks and four horns ----
  const headJoint: V3 = [0, 38, 0];
  const H = sculpt(headJoint);
  // the mass of the skull: cranium, wider temples, jaw, and the face plate in front
  H.box(-9, 41, -8, 9, 57, 8, T.ch1);
  H.box(-10, 44, -7, 10, 56, 7, T.ch1);
  H.box(-7, 38, -8, 7, 41, 6, T.ch1);
  H.box(-8, 38, -9, 8, 57, -8, T.ch1);
  H.box(-11, 40, -7, 11, 48, -2, T.ch2); // the face is wider at the cheeks than the skull above it
  // the openings come first: one wide black mouth and two eye sockets that run into it
  H.carve(-7, 42, -10, 7, 47, -3);
  H.both(() => H.carve(1, 47, -10, 6, 51, -7));
  H.paint(-8, 41, -10, 8, 48, -2, T.mouth);
  H.both(() => {
    H.paint(0, 46, -10, 7, 52, -6, T.mouth);
    H.paint(1, 47, -7, 6, 51, -6, T.orB); // the glow round each eye, on the back wall of its socket
  });
  // the lower jaw: a stepped orange lip the fangs stand on, a chin block jutting forward, jaw plates at the sides
  H.box(-8, 41, -10, 8, 42, -8, T.or);
  H.box(-8, 40, -10, 8, 41, -8, T.orB);
  H.box(-5, 40, -11, 5, 41, -10, T.orBr);
  H.box(-2, 38, -12, 2, 41, -9, (_i, j) => (j === 40 ? T.fire : T.orBr));
  H.both(() => {
    H.box(6, 39, -10, 10, 41, -7, T.orB);
    H.box(7, 38, -9, 11, 40, -6, T.or);
  });
  // the teeth, each one its own voxel shape: two tall square-cut ones at the corners, two short pyramids between them
  H.both(() => {
    H.box(5, 42, -9, 7, 46, -7, T.fang);
    H.box(1, 42, -9, 4, 43, -7, T.fang);
    H.box(2, 43, -9, 3, 45, -8, T.fang);
  });
  // the cheeks: an orange tusk standing at each side of the mouth, a pointed cap, and gold slabs on the jaw
  H.both(() => {
    H.box(7, 41, -11, 9, 47, -8, (_i, j) => (j === 46 ? T.fire : T.orBr));
    H.box(8, 47, -11, 9, 49, -9, T.fire);
    H.box(9, 42, -9, 10, 48, -6, T.orB);
    H.box(10, 44, -8, 13, 46, -6, T.gold);
    H.box(11, 45, -7, 13, 46, -5, T.yel);
  });
  // the forehead: a stack of plates in the middle with a pyramid spike on top
  H.box(-3, 50, -10, 3, 57, -8, T.ch2);
  H.box(-2, 52, -11, 2, 55, -10, T.ch1);
  H.box(-1, 55, -11, 1, 57, -10, T.ch2);
  H.box(-2, 57, -8, 2, 58, -3, T.ch0);
  H.box(-1, 58, -7, 1, 59, -4, T.ch0);
  H.box(-1, 59, -6, 1, 60, -5, T.ch0);
  // the brow: an orange chevron, its wings rising up and outward from a V that points down between the eyes
  H.box(-2, 48, -10, 2, 50, -8, T.orBr);
  H.box(-1, 47, -10, 1, 48, -9, T.fire);
  H.both(() => {
    for (let x = 1; x < 10; x++) {
      const y0 = 50 + (((x - 1) * 5) >> 3);
      H.box(x, y0, -11, x + 1, y0 + 3, -8, (_i, j) => (j === y0 + 2 ? T.fire : T.orBr));
    }
  });
  // the top and back of the helmet: stepped plates
  H.box(-8, 57, -7, 8, 58, 7, T.ch2);
  H.box(-6, 58, 0, 6, 59, 6, T.ch1);
  H.box(-8, 44, 7, 8, 56, 9, T.ch2);
  // the back is built from the same plates: a raised ridge down the middle, layered panels each side, a few thin lava seams
  H.box(-6, 46, 9, 6, 55, 10, T.ch1);
  H.box(-2, 44, 10, 2, 58, 12, T.ch2);
  H.box(-1, 58, 10, 1, 62, 12, T.ch0);
  H.box(-1, 62, 10, 1, 64, 11, T.ch0);
  H.box(-5, 49, 10, -2, 50, 11, T.orB);
  H.box(2, 49, 10, 5, 50, 11, T.orB);
  H.box(-5, 53, 10, -2, 54, 11, T.orB);
  H.box(2, 53, 10, 5, 54, 11, T.orB);
  H.box(-7, 56, 8, 7, 58, 10, T.ch2);
  H.box(-4, 45, 9, 4, 46, 11, T.orB);
  H.both(() => {
    // the sides: stacked blocks, dark layers on dark
    H.box(10, 44, -6, 12, 56, 6, T.ch2);
    H.box(12, 47, -3, 13, 53, 3, T.ch1);
    H.box(3, 57, -8, 7, 59, -2, T.ch2);
    H.box(6, 58, -6, 10, 60, 2, T.ch1);
    // a tall black spike stands up on each side of the helmet, between the inner horn and the great horn
    H.box(6, 58, -3, 10, 61, 1, T.ch0);
    H.box(7, 61, -2, 9, 64, 0, T.ch0);
    H.box(7, 64, -1, 9, 66, 0, T.ch0);
    H.box(8, 66, -1, 9, 67, 0, T.ch0);
    // the two inner horns: tall, fat at the base, tapering, upright, bright on the front and darker at the base
    H.stroke(
      [
        [4.5, 55, -1.5, 4, 4, 5],
        [4.5, 58, -1.5, 4, 3, 4],
        [4.6, 61, -1.5, 3, 3, 4],
        [4.8, 63.5, -1.5, 3, 2, 3],
        [5, 65, -1.5, 2, 2, 2],
        [5, 66.5, -1.5, 1, 1, 1],
      ],
      (_i, j, k) => (k < -3 ? (j > 60 ? T.fire : T.orBr) : j < 57 ? T.orB : T.or),
    );
    // the ear fins: wings of orange sweeping out and up, thin enough to read as a diagonal blade, clear of the horn above them
    H.stroke(
      [
        [10.5, 45, 0, 3, 3, 6],
        [12, 47.5, 0, 3, 3, 6],
        [13.5, 50, 0, 3, 3, 5],
        [15, 52.5, 0, 3, 3, 4],
        [16.5, 55, 0, 2, 3, 3],
        [17.5, 57, 0, 1, 2, 2],
      ],
      (_i, j, k) => (j > 51 || k < -1 ? T.fire : T.orBr),
    );
    // the great horn: a fat stepped block on top of the temple, a thick shaft that rises almost straight, then curls inward to a stepped point
    const horn = (i: number, j: number, k: number): number => (k < -1 ? (j < 61 ? T.orBr : T.fire) : i > 11 ? T.or : T.orBr);
    H.box(9, 56, -4, 14, 61, 4, horn);
    H.box(9, 61, -3, 13, 64, 3, horn);
    H.stroke(
      [
        [11.3, 64, 0, 5, 3, 5],
        [11.2, 66.5, 0, 5, 3, 5],
        [10.6, 69, 0, 4, 3, 4],
        [9.4, 71, 0, 4, 3, 4],
        [7.8, 72.5, 0, 3, 2, 3],
        [6.4, 73.5, 0, 3, 2, 2],
        [5.4, 74.5, 0, 2, 2, 2],
      ],
      horn,
    );
    H.box(9, 61, -6, 11, 64, -4, T.or);
    H.box(12, 58, 4, 14, 62, 6, T.orB);
  });
  const head = limb(H, [0, 4.3, 0], { isHead: true });
  // the eyes: two big bright rectangles, the inner top corner cut off so that they glare; they shine by themselves
  const E = sculpt(headJoint);
  E.both(() => {
    E.box(2, 47, -9, 6, 49, -8, T.eye);
    E.box(3, 49, -9, 6, 50, -8, T.eye);
  });
  limb(E, [0, 0, 0], { of: head, glow: true, pulse: 0.2 });

  // ---- the arms: thick, short, layered, each ending in a big gauntlet ----
  for (const s of [1, -1] as const) {
    const shoulder: V3 = [15 * s, 34, 0];
    const elbow: V3 = [15 * s, 25, 0];
    const strikeArm = s === 1; // the sword arm (+x) comes down in the blow
    const up = sculpt(shoulder).side(s);
    up.box(11, 25, -4, 19, 34, 4, T.ch1);
    up.box(12, 29, -5, 18, 33, -4, T.ch2);
    up.box(13, 30, -6, 17, 31, -5, T.gold);
    up.box(19, 27, -3, 20, 33, 3, T.orB);
    up.box(10, 31, -4, 11, 34, 4, T.ch2);
    up.box(10, 25, -5, 20, 27, 5, T.gold);
    up.box(11, 26, -6, 19, 27, -5, T.or);
    const arm = limb(up, [15 * s * 0.1, 3.9, 0], { hang: true, swing: -s * 0.45, rotX: strikeArm ? SWORD_ARM_X : 0.25, rotZ: s * 0.22, strike: strikeArm ? 1 : 0.4, raise: 1, armed: strikeArm });

    const fa = sculpt(elbow).side(s);
    fa.box(11, 14, -4, 19, 25, 4, T.ch1); // forearm
    fa.box(10, 18, -5, 20, 25, 5, T.ch2); // the gauntlet
    fa.box(10, 23, -6, 20, 24, 6, T.or);
    fa.box(9, 24, -6, 21, 26, 6, T.gold);
    fa.box(12, 19, -7, 18, 23, -5, T.ch1);
    fa.box(13, 20, -8, 17, 22, -7, T.gold);
    fa.box(14, 21, -9, 16, 22, -8, T.orBr);
    fa.box(20, 17, -3, 22, 24, 3, T.ch1);
    fa.box(21, 22, -3, 22, 23, 3, T.or);
    fa.box(22, 20, -2, 24, 22, 2, T.ch0);
    fa.box(10, 19, -4, 11, 24, 4, T.ch0);
    fa.box(11, 11, -5, 19, 18, 5, T.ch0); // the fist
    fa.box(12, 12, -7, 18, 17, -5, T.ch1);
    fa.box(11, 17, -6, 19, 18, -5, T.gold);
    for (const x of [12, 14, 16]) fa.box(x, 14, -8, x + 2, 16, -7, T.orB);
    const fore = limb(fa, [0, -0.9, 0], { of: arm, rotX: strikeArm ? SWORD_ELBOW_X : 0.5, elbow: strikeArm });

    if (strikeArm) {
      // the sword: a thick blade of molten metal, jagged along both edges, dark orange at the hilt, yellow at the edge and tip
      const SW = sculpt([0, 0, 0]);
      const sb = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, skin: number): Sculpt => SW.box(y0, z0, x0, y1, z1, x1, skin); // the blade is drawn along z (z < 0 is the tip) but built hanging down along -y, its flat face to the front, so that it can be swung outward in the plane of the picture
      sb(-1, -1, -6, 1, 1, 4, T.ch0); // the grip
      sb(-1, 0, 2, 1, 1, 3, T.ch2);
      sb(-6, -2, -9, 6, 2, -6, T.gold); // the guard, its ends turned up
      sb(-7, 2, -9, -5, 4, -7, T.yel);
      sb(5, 2, -9, 7, 4, -7, T.yel);
      sb(-7, -3, -8, -6, -2, -7, T.orB);
      sb(6, -3, -8, 7, -2, -7, T.orB);
      sb(-2, -2, 4, 2, 2, 6, T.gold); // the pommel
      sb(-1, -1, 6, 1, 1, 7, T.orBr);
      for (let d = 9; d <= 32; d++) {
        const half = d < 25 ? 4.8 - (d - 9) * 0.03 : 4.4 * ((33 - d) / 8);
        const hh = Math.max(1, Math.round(half));
        const top = hh + (d > 12 && d < 29 && hash(d, 1, 21) > 0.45 ? (hash(d, 3, 21) > 0.7 ? 2 : 1) : 0);
        const bot = hh + (d > 12 && d < 29 && hash(d, 2, 21) > 0.45 ? (hash(d, 4, 21) > 0.7 ? 2 : 1) : 0);
        for (let j = -bot; j < top; j++) {
          const edge = j === top - 1 || j === -bot;
          const skin = edge ? (d > 28 ? T.hot : T.yel) : Math.abs(j) < 1 && d > 16 ? T.hot : d < 15 ? T.orB : Math.abs(j) < 2 ? T.orBr : T.or;
          sb(-3, j, -d, 3, j + 1, -d + 1, skin);
        }
      }
      sb(-1, -1, -34, 1, 1, -32, T.hot);
      // The sword is held by its handle: its origin (the middle of the handle) is the middle of the fist, and it is turned so that the blade comes out of the front of the fist, pointing down and forward and a little out (about 30 degrees below the horizontal, 40 from the forearm), the crossguard sideways across the blade and the broad edges up and down. These numbers are solved from that (see urelionSword.test.ts, which holds them to it); the wrist (grip) turns it about the forearm's x axis from here.
      limb(SW, SWORD_GRIP, { of: fore, glow: true, pulse: 0.12, grip: true, wrist: [0, -1.05, 0], rotX: 0.51, rotY: 1.384, rotZ: 0.283 });
    } else {
      // the shield: tall and angular, a black body in a thick raised gold border, an orange sun at its heart, rivets, a boss that stands out
      const SH = new Sculpt([0, 0, 0], 0.1, seed++);
      const hw = (j: number): number => (j >= 12 ? 5 : j >= 11 ? 6 : j >= -3 ? 7 : Math.max(2, Math.round(7 - (-3 - j) * 0.5)));
      for (let j = -14; j < 14; j++) {
        const w = hw(j);
        for (let x = -w; x < w; x++) {
          if (j === 13 && Math.abs(x + 0.5) < 2) continue; // a notch in the crown of the shield
          const dx = Math.min(x + w, w - 1 - x);
          const dt = 13 - j;
          const edge = Math.min(dx, dt);
          SH.box(x, j, 2, x + 1, j + 1, 5, T.ch1);
          if (edge === 0) SH.box(x, j, -2, x + 1, j + 1, 2, T.gold);
          else if (edge === 1) SH.box(x, j, -1, x + 1, j + 1, 2, T.gold);
          else if (edge === 2) SH.box(x, j, 0, x + 1, j + 1, 2, T.orB);
          else SH.box(x, j, 0, x + 1, j + 1, 2, (Math.abs(x + 0.5) + j) % 5 < 1 ? T.ch1 : T.ch2);
          const cx = x + 0.5;
          const cy = j - 3 + 0.5;
          const r = Math.hypot(cx, cy);
          if (edge >= 3 && r < 2.2) SH.box(x, j, -3, x + 1, j + 1, 0, T.yel);
          else if (edge >= 3 && r < 3.6) SH.box(x, j, -2, x + 1, j + 1, 0, r < 2.9 ? T.orBr : T.orB);
          else if (edge >= 3 && Math.abs(cx) < 0.8 && r < 8) SH.box(x, j, -1, x + 1, j + 1, 0, T.orB);
          else if (edge >= 3 && Math.abs(cy) < 0.8 && Math.abs(cx) < 6 && r >= 4.6) SH.box(x, j, -1, x + 1, j + 1, 0, T.orB);
        }
      }
      for (const [x, y] of [[-5, 10], [4, 10], [-3, -7], [2, -7]] as const) SH.box(x, y, -3, x + 1, y + 1, -1, T.gold);
      SH.box(-1, 2, -5, 1, 4, -3, T.hot);
      limb(SH, [-0.95, -0.5, -0.3], { of: fore, rotX: -0.55, rotY: 0.3, skin: 'au_ch1' });
    }
  }
  return rig;
}
