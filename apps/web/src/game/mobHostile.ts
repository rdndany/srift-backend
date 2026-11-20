import { hash, jit, mix, mul, plain, rect, type Painter, type Part, type RGB } from './mobPaint';

/**
 * The monsters of the dark: the zombie, the husk and the drowned (one body, three coats), the creeper, the spiders, the slime,
 * the enderman and the bat. Each has painted skins (16x16, lit from the top left, worn, stained and torn where it is cloth) and a
 * rig of boxes with jointed limbs (a limb can hang from another: `of`; a knee folds as the leg swings: `bend`).
 * The skeleton and the stray live in mobRenderer.ts.
 */

/** Light from the top left corner: a gentle gradient across a 16x16 skin. */
const lit = (x: number, y: number, k = 0.16): number => 1.05 - ((x + y) / 30) * k;

// ---- the undead: zombie, husk, drowned ---------------------------------------------------------------------------

interface Undead {
  skin: RGB;
  dark: RGB;
  shirt: RGB;
  pants: RGB;
  shoe: RGB;
  /** Eyes: the iris pixel. */
  iris: RGB;
  tooth: RGB;
  blood: RGB;
  /** Hair on the head (none: bald, or wrapped). */
  hair?: RGB;
  seed: number;
}

const UNDEAD: Record<string, Undead> = {
  zombie: { skin: [92, 140, 88], dark: [54, 92, 62], shirt: [46, 132, 168], pants: [48, 50, 140], shoe: [62, 48, 42], iris: [196, 206, 110], tooth: [206, 204, 168], blood: [120, 28, 26], hair: [48, 38, 30], seed: 50 },
  husk: { skin: [170, 150, 102], dark: [120, 98, 62], shirt: [152, 120, 82], pants: [114, 94, 66], shoe: [84, 66, 46], iris: [70, 50, 24], tooth: [226, 214, 176], blood: [112, 60, 32], seed: 70 },
  drowned: { skin: [92, 154, 148], dark: [48, 100, 108], shirt: [52, 112, 128], pants: [44, 68, 112], shoe: [40, 54, 70], iris: [96, 250, 236], tooth: [196, 214, 200], blood: [40, 78, 70], hair: [34, 70, 70], seed: 90 },
};

/** A hem or a sleeve end cut raggedly: the row where the cloth stops, which differs from column to column. */
const cutRow = (x: number, seed: number, from: number, spread: number): number => from + Math.floor(hash(x, 7, seed) * spread);

function undeadSkins(p: string, o: Undead): Record<string, Painter> {
  const s = o.seed;
  const skin: Painter = (x, y) => {
    const blot = hash(x >> 1, y >> 1, s);
    let c = o.skin;
    if (blot > 0.74) c = mix(c, o.dark, 0.7);
    else if (blot < 0.1) c = mix(c, [226, 214, 170], 0.18);
    if (hash(x, y >> 2, s + 2) > 0.93) c = mix(c, o.dark, 0.5); // a vein or a crack
    return jit(mul(c, lit(x, y)), 8, x, y, s + 1);
  };
  const cloth = (c: RGB, cutFrom: number, under: RGB, seedAdd: number): Painter => (x, y) => {
    if (y > cutRow(x, s + seedAdd, cutFrom, 4)) return jit(mul(under, lit(x, y)), 7, x, y, s + seedAdd);
    let col = mul(c, ((x + y) % 2 === 0 ? 1 : 0.94) * lit(x, y, 0.12));
    if (x % 5 === 0 && y > 1) col = mul(col, 0.86); // a fold
    if (hash(x >> 1, y >> 1, s + seedAdd + 1) > 0.9) col = mix(col, o.blood, 0.5); // a stain
    if (y > 3 && hash(x >> 1, y >> 1, s + seedAdd + 2) > 0.93) return mul(o.dark, 0.9); // a hole to the skin
    return jit(col, 6, x, y, s + seedAdd + 3);
  };
  const pantsLeg = cloth(o.pants, 15, o.skin, 45);
  const face: Painter = (x, y) => {
    if (o.hair && (y <= 1 || (y === 2 && hash(x, y, s + 9) > 0.45) || ((x <= 1 || x >= 14) && y <= 4 && hash(x, y, s + 10) > 0.4))) return jit(o.hair, 8, x, y, s + 11);
    if (rect(x, y, 2, 4, 6, 4) || rect(x, y, 9, 4, 13, 4)) return mul(o.dark, 0.72); // brows
    if (rect(x, y, 3, 5, 5, 7) || rect(x, y, 10, 5, 12, 7)) return (x === 4 || x === 11) && y === 6 ? o.iris : [16, 18, 22];
    if (rect(x, y, 3, 8, 5, 8) || rect(x, y, 10, 8, 12, 8)) return mul(o.dark, 0.88); // bags
    if (rect(x, y, 7, 8, 8, 10)) return y === 10 ? mul(o.dark, 0.5) : mul(o.skin, 0.82); // the nose
    if (rect(x, y, 4, 12, 11, 13)) return y === 12 && x % 2 === 0 ? o.tooth : [44, 14, 16]; // the mouth, a few teeth
    if ((x === 3 || x === 12) && y === 12) return [44, 14, 16];
    if (x === 10 && (y === 14 || (y === 15 && hash(x, y, s + 13) > 0.3))) return o.blood;
    if (rect(x, y, 11, 9, 13, 10) && hash(x, y, s + 12) > 0.25) return mix(o.dark, o.blood, 0.55); // a sore
    return skin(x, y);
  };
  return {
    [`${p}_skin`]: skin,
    [`${p}_face`]: face,
    [`${p}_shirt`]: cloth(o.shirt, 11, o.pants, 20),
    // A sleeve ends in a ragged cuff, and the arm below it is bare.
    [`${p}_sleeve`]: cloth(o.shirt, 10, o.skin, 30),
    // The trouser leg is torn at the knee and ends frayed above the bare shin.
    [`${p}_pants`]: cloth(o.pants, 15, o.skin, 40),
    [`${p}_shin`]: (x, y) => (y > cutRow(x, s + 45, 3, 4) ? skin(x, y) : pantsLeg(x, y)),
    [`${p}_shoe`]: (x, y) => jit(mul(o.shoe, lit(x, y) * (y > 12 ? 0.7 : 1)), 8, x, y, s + 50),
    [`${p}_hair`]: (x, y) => jit(o.hair ? mul(o.hair, 0.8 + 0.4 * hash(x >> 1, y, s + 51)) : o.dark, 8, x, y, s + 52),
    [`${p}_wrap`]: (x, y) => jit(mul([206, 190, 146], (y % 5 === 0 ? 0.78 : 1) * lit(x, y, 0.1)), 9, x, y, s + 53),
    [`${p}_weed`]: (x, y) => jit(mul([54, 112, 54], (x % 3 === 0 ? 0.7 : 1) * lit(x, y, 0.2)), 12, x, y, s + 54),
    [`${p}_barnacle`]: (x, y) => jit(hash(x >> 1, y >> 1, s + 55) > 0.5 ? [196, 196, 180] : [150, 150, 138], 10, x, y, s + 56),
    [`${p}_rope`]: (x, y) => jit(mul([150, 120, 74], y % 3 === 0 ? 0.76 : 1), 8, x, y, s + 57),
  };
}

interface UndeadLook {
  /** Skin name prefix: zombie, husk, drowned. */
  p: string;
  /** Hair, a head wrap (husk), weed (drowned). */
  hair?: boolean;
  wrap?: boolean;
  weed?: boolean;
  /** Eyes that shine in the dark. */
  glow?: string;
}

/**
 * A shambling body: a head, a torn shirt with ragged hems, arms stretched out in front (a sleeve, a bare forearm, a hand),
 * and legs with a knee that folds, a frayed trouser, a bare shin and a shoe.
 */
export function undeadRig(look: UndeadLook): Part[] {
  const { p } = look;
  const rig: Part[] = [];
  const add = (part: Part): number => rig.push(part) - 1;
  const head = add({ size: [0.5, 0.5, 0.5], at: [0, 1.58, 0], skin: `${p}_skin`, front: `${p}_face`, isHead: true });
  if (look.hair) {
    add({ size: [0.53, 0.08, 0.53], at: [0, 0.27, 0], skin: `${p}_hair`, of: head, flat: true });
    add({ size: [0.53, 0.3, 0.06], at: [0, -0.02, 0.255], skin: `${p}_hair`, of: head, flat: true });
    add({ size: [0.06, 0.2, 0.2], at: [-0.255, 0.1, 0.1], skin: `${p}_hair`, of: head, flat: true });
    add({ size: [0.06, 0.2, 0.2], at: [0.255, 0.1, 0.1], skin: `${p}_hair`, of: head, flat: true });
  }
  if (look.wrap) {
    // A cloth wound round the skull, its tail hanging down the back.
    add({ size: [0.54, 0.14, 0.54], at: [0, 0.22, 0], skin: `${p}_wrap`, of: head, flat: true });
    add({ size: [0.54, 0.08, 0.54], at: [0, 0.1, 0], skin: `${p}_wrap`, of: head, flat: true });
    add({ size: [0.12, 0.34, 0.04], at: [0.12, -0.08, 0.28], skin: `${p}_wrap`, of: head, flat: true, rotX: 0.12 });
  }
  if (look.weed) {
    add({ size: [0.1, 0.34, 0.05], at: [-0.14, 0.04, 0.27], skin: `${p}_weed`, of: head, flat: true });
    add({ size: [0.12, 0.42, 0.05], at: [0.1, 0.0, 0.27], skin: `${p}_weed`, of: head, flat: true, rotZ: 0.08 });
    add({ size: [0.09, 0.22, 0.05], at: [0.27, 0.12, -0.04], skin: `${p}_weed`, of: head, flat: true });
    add({ size: [0.3, 0.07, 0.3], at: [0, 0.28, -0.05], skin: `${p}_weed`, of: head, flat: true });
  }
  if (look.glow) {
    for (const s of [-1, 1]) add({ size: [0.1, 0.07, 0.015], at: [s * 0.109, 0.047, -0.256], skin: look.glow, of: head, flat: true, glow: true });
  }
  // The torso with a ragged hem: three shreds hanging below it.
  add({ size: [0.5, 0.75, 0.25], at: [0, 1.15, 0], skin: `${p}_shirt` });
  [[-0.17, 0.15], [0.02, 0.22], [0.18, 0.12]].forEach(([x, h]) => add({ size: [0.14, h, 0.27], at: [x, 0.78 - h / 2, 0], skin: `${p}_shirt`, flat: true }));
  if (look.wrap) add({ size: [0.54, 0.09, 0.29], at: [0, 0.86, 0], skin: `${p}_rope`, flat: true });
  if (look.weed) add({ size: [0.14, 0.5, 0.04], at: [0.14, 1.2, -0.14], skin: `${p}_weed`, flat: true, rotZ: 0.12 });
  // Arms: sleeve, bare forearm, hand. They reach out in front.
  for (const s of [-1, 1]) {
    const arm = add({ size: [0.25, 0.4, 0.25], at: [s * 0.375, 1.5, 0], skin: `${p}_sleeve`, hang: true, swing: s * 0.5, rotX: Math.PI / 2.1, strike: 1 });
    const fore = add({ size: [0.22, 0.4, 0.22], at: [0, -0.4, 0], skin: `${p}_skin`, hang: true, of: arm, rotX: -0.22 });
    add({ size: [0.2, 0.12, 0.2], at: [0, -0.4, 0], skin: `${p}_skin`, hang: true, of: fore, flat: true });
    if (look.wrap) add({ size: [0.25, 0.1, 0.25], at: [0, -0.2, 0], skin: `${p}_wrap`, hang: true, of: fore, flat: true });
    if (look.weed && s === 1) add({ size: [0.07, 0.07, 0.07], at: [0.1, -0.14, -0.08], skin: `${p}_barnacle`, hang: true, of: fore, flat: true });
  }
  // Legs: thigh, a knee that folds when the leg swings back, shin, shoe.
  for (const s of [-1, 1]) {
    const thigh = add({ size: [0.25, 0.4, 0.25], at: [s * 0.125, 0.75, 0], skin: `${p}_pants`, hang: true, swing: s });
    const shin = add({ size: [0.23, 0.35, 0.23], at: [0, -0.4, 0], skin: `${p}_shin`, hang: true, of: thigh, bend: 0.9 });
    add({ size: [0.25, 0.12, 0.34], at: [0, -0.3, -0.045], skin: `${p}_shoe`, hang: true, of: shin, flat: true });
  }
  return rig;
}

// ---- the creeper -------------------------------------------------------------------------------------------------

const MOSS = (x: number, y: number): RGB => {
  const n = hash(x >> 1, y >> 1, 12);
  const m = hash(x, y, 13);
  let c: RGB = n > 0.62 ? [38, 112, 44] : n < 0.2 ? [100, 198, 86] : [66, 160, 60];
  if (m > 0.93) c = [124, 216, 100];
  else if (m < 0.05) c = [24, 78, 30];
  return jit(mul(c, lit(x, y, 0.2)), 5, x, y, 14);
};

/** The creeper's face: two square eyes and the frown, a darker shade round them so they sink in. */
const creeperBlack = (x: number, y: number): boolean =>
  rect(x, y, 3, 4, 5, 6) || rect(x, y, 10, 4, 12, 6) || rect(x, y, 6, 7, 9, 9) || rect(x, y, 5, 10, 6, 13) || rect(x, y, 9, 10, 10, 13);

const CREEPER_SKINS: Record<string, Painter> = {
  creeper_skin: MOSS,
  creeper_face: (x, y) => {
    if (creeperBlack(x, y)) return (x === 3 || x === 10) && y === 4 ? [30, 44, 30] : [10, 16, 10];
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1]] as const) if (creeperBlack(x + dx, y + dy)) return mul(MOSS(x, y), 0.62);
    return MOSS(x, y);
  },
  // A leg is darker towards the ground, as if the moss gave out.
  creeper_leg: (x, y) => mul(MOSS(x, y), y > 11 ? 0.62 : y > 9 ? 0.82 : 1),
  creeper_foot: (x, y) => jit(mul([58, 86, 50], lit(x, y)), 8, x, y, 15),
  creeper_crest: (x, y) => mul(MOSS(x, y), 0.7),
};

export function creeperRig(): Part[] {
  const rig: Part[] = [];
  const add = (part: Part): number => rig.push(part) - 1;
  const head = add({ size: [0.5, 0.5, 0.5], at: [0, 1.45, 0], skin: 'creeper_skin', front: 'creeper_face', isHead: true });
  add({ size: [0.52, 0.05, 0.52], at: [0, 0.27, 0], skin: 'creeper_crest', of: head, flat: true });
  add({ size: [0.5, 0.75, 0.25], at: [0, 0.82, 0], skin: 'creeper_skin' });
  for (const [x, z, sw] of [[-0.13, -0.2, 1], [0.13, -0.2, -1], [-0.13, 0.2, -1], [0.13, 0.2, 1]] as const) {
    const leg = add({ size: [0.25, 0.45, 0.25], at: [x, 0.45, z], skin: 'creeper_leg', hang: true, swing: sw });
    add({ size: [0.27, 0.06, 0.29], at: [0, -0.45, -0.01], skin: 'creeper_foot', hang: true, of: leg, flat: true });
  }
  return rig;
}

// ---- the spiders -------------------------------------------------------------------------------------------------

interface SpiderLook {
  body: RGB;
  hair: RGB;
  /** Eyes, and the markings on the back. */
  eye: RGB;
  mark: RGB;
  seed: number;
}

const SPIDER_LOOKS: Record<string, SpiderLook> = {
  spider: { body: [42, 34, 32], hair: [84, 62, 46], eye: [214, 26, 26], mark: [150, 28, 28], seed: 35 },
  cave_spider: { body: [18, 66, 76], hair: [40, 120, 126], eye: [240, 44, 44], mark: [70, 230, 206], seed: 37 },
};

function spiderSkins(p: string, o: SpiderLook): Record<string, Painter> {
  const s = o.seed;
  const fur: Painter = (x, y) => {
    let c = o.body;
    if (hash(x, y >> 1, s) > 0.78) c = mix(c, o.hair, 0.7); // bristles
    return jit(mul(c, lit(x, y, 0.22)), 7, x, y, s + 1);
  };
  const eyeAt = (x: number, y: number): RGB | null => {
    // Eight eyes: a big pair, a pair above, two small ones either side, and two on top.
    const big = rect(x, y, 3, 6, 4, 7) || rect(x, y, 11, 6, 12, 7);
    if (big) return (x === 3 || x === 11) && y === 6 ? [255, 160, 150] : o.eye;
    if ((x === 6 && y === 4) || (x === 9 && y === 4)) return o.eye;
    if ((x === 2 && y === 4) || (x === 13 && y === 4) || (x === 5 && y === 5) || (x === 10 && y === 5)) return mul(o.eye, 0.7);
    return null;
  };
  return {
    [`${p}_body`]: fur,
    [`${p}_face`]: (x, y) => {
      const e = eyeAt(x, y);
      if (e) return e;
      if (rect(x, y, 5, 10, 10, 12)) return mul(o.body, 0.4); // the jaws
      if (rect(x, y, 6, 8, 9, 9)) return mul(o.body, 0.7);
      return fur(x, y);
    },
    // The back: a pattern in the colour of the markings, an hourglass or a spray of venom spots.
    [`${p}_abdomen`]: (x, y) => {
      const w = Math.abs(y - 8) / 8;
      const mid = Math.abs(x - 7.5) < 1 + 2.4 * w && y > 2 && y < 14;
      if (mid && (x + y) % 3 !== 0) return jit(mul(o.mark, 0.8 + 0.3 * hash(x, y, s + 3)), 8, x, y, s + 4);
      return fur(x, y);
    },
    [`${p}_leg`]: (x, y) => jit(mul(y % 8 < 2 ? mix(o.body, o.hair, 0.6) : o.body, lit(x, y, 0.2)), 6, x, y, s + 5),
    [`${p}_fang`]: (x, y) => jit(y > 9 ? [214, 204, 170] : mul(o.body, 1.2), 8, x, y, s + 6),
    [`${p}_glow`]: plain(o.eye, 6, s + 7),
  };
}

export function spiderRig(p: string): Part[] {
  const rig: Part[] = [];
  const add = (part: Part): number => rig.push(part) - 1;
  const head = add({ size: [0.45, 0.4, 0.45], at: [0, 0.5, -0.55], skin: `${p}_body`, front: `${p}_face`, isHead: true });
  // Two big eyes that shine, fangs and palps.
  for (const s of [-1, 1]) {
    add({ size: [0.09, 0.09, 0.015], at: [s * 0.1, 0.01, -0.229], skin: `${p}_glow`, of: head, flat: true, glow: true });
    add({ size: [0.075, 0.2, 0.075], at: [s * 0.09, -0.24, -0.2], skin: `${p}_fang`, of: head, flat: true, rotX: 0.2 });
    add({ size: [0.08, 0.08, 0.26], at: [s * 0.2, -0.13, -0.3], skin: `${p}_leg`, of: head, flat: true });
  }
  add({ size: [0.4, 0.35, 0.4], at: [0, 0.5, -0.15], skin: `${p}_body` });
  const abdomen = add({ size: [0.65, 0.5, 0.75], at: [0, 0.56, 0.42], skin: `${p}_abdomen`, rotX: -0.12 });
  add({ size: [0.2, 0.16, 0.16], at: [0, -0.06, 0.42], skin: `${p}_body`, of: abdomen, flat: true });
  // Eight legs, each of two bones: out and a little up from the body, then down to the ground; they fan forwards and back.
  const fan = [0.65, 0.22, -0.22, -0.65];
  for (let i = 0; i < 4; i++)
    for (const s of [-1, 1]) {
      const upper = add({
        size: [0.07, 0.5, 0.07],
        at: [s * 0.2, 0.5, -0.32 + i * 0.2],
        skin: `${p}_leg`,
        hang: true,
        flat: true,
        order: 'YXZ',
        rotZ: s * 1.95,
        rotY: s * fan[i]!,
        swingY: (i % 2 === 0 ? 1 : -1) * s * 0.35,
      });
      add({ size: [0.055, 0.78, 0.055], at: [0, -0.5, 0], skin: `${p}_leg`, hang: true, flat: true, of: upper, rotZ: s * -1.35 });
    }
  return rig;
}

// ---- the slime ---------------------------------------------------------------------------------------------------

const SLIME_SKINS: Record<string, Painter> = {
  slime_core: (x, y) => jit(mul([58, 134, 52], lit(x, y, 0.2) * (hash(x >> 1, y >> 1, 39) > 0.7 ? 0.82 : 1)), 8, x, y, 39),
  slime_face: (x, y) => {
    if (rect(x, y, 3, 5, 5, 8) || rect(x, y, 10, 5, 12, 8)) return (x === 3 || x === 10) && y === 5 ? [220, 255, 210] : [14, 40, 18];
    if (rect(x, y, 6, 11, 9, 12)) return [14, 40, 18];
    if (rect(x, y, 2, 10, 3, 10) || rect(x, y, 12, 10, 13, 10)) return [118, 196, 100]; // cheeks
    return jit(mul([58, 134, 52], lit(x, y, 0.2)), 8, x, y, 39);
  },
  // The gel: clear and bright, its edges brighter, a glint on the top left.
  slime_outer: (x, y) => {
    const edge = x === 0 || y === 0 || x === 15 || y === 15;
    if (rect(x, y, 2, 2, 4, 3) && !(x === 4 && y === 3)) return [226, 255, 220];
    return jit(mul([112, 204, 100], edge ? 1.12 : 0.94 + 0.1 * hash(x >> 2, y >> 2, 40)), 9, x, y, 40);
  },
  slime_bubble: plain([170, 240, 150], 10, 41),
};

export const slimeRig = (): Part[] => [
  { size: [0.3, 0.3, 0.3], at: [0, 0.2, 0], skin: 'slime_core', front: 'slime_face', isHead: true },
  { size: [0.07, 0.07, 0.07], at: [0.12, 0.33, 0.1], skin: 'slime_bubble', flat: true },
  { size: [0.06, 0.06, 0.06], at: [-0.13, 0.1, 0.12], skin: 'slime_bubble', flat: true },
  { size: [0.05, 0.05, 0.05], at: [0.1, 0.1, -0.16], skin: 'slime_bubble', flat: true },
  { size: [0.5, 0.5, 0.5], at: [0, 0.25, 0], skin: 'slime_outer', alpha: 0.55 },
  { size: [0.58, 0.07, 0.58], at: [0, 0.035, 0], skin: 'slime_outer', alpha: 0.5, flat: true },
];

// ---- the enderman ------------------------------------------------------------------------------------------------

const ENDER_SKINS: Record<string, Painter> = {
  ender_skin: (x, y) => {
    if (hash(x, y, 41) > 0.965) return [78, 38, 110]; // a speck of the other world
    return jit(mul([22, 18, 28], lit(x, y, 0.5)), 4, x, y, 42);
  },
  ender_torso: (x, y) => {
    if (y % 4 === 1 && x > 1 && x < 14) return [34, 28, 44]; // the ribs show through the dark
    return jit(mul([22, 18, 28], lit(x, y, 0.5)), 4, x, y, 43);
  },
  ender_face: (x, y) => {
    if (rect(x, y, 2, 5, 13, 5)) return [34, 28, 44]; // the brow
    if (rect(x, y, 4, 11, 11, 12)) return (x + y) % 2 === 0 ? [3, 2, 6] : [12, 8, 18]; // a mouth of teeth-like dark
    return jit(mul([22, 18, 28], lit(x, y, 0.5)), 4, x, y, 44);
  },
  ender_eye: (x) => {
    const d = Math.abs(x - 7.5) / 7.5;
    return mix([252, 226, 255], [186, 56, 250], Math.min(1, d * 1.2));
  },
};

export function endermanRig(): Part[] {
  const rig: Part[] = [];
  const add = (part: Part): number => rig.push(part) - 1;
  const head = add({ size: [0.5, 0.5, 0.5], at: [0, 2.65, 0], skin: 'ender_skin', front: 'ender_face', isHead: true });
  for (const s of [-1, 1]) add({ size: [0.17, 0.055, 0.015], at: [s * 0.135, -0.03, -0.256], skin: 'ender_eye', of: head, flat: true, glow: true });
  add({ size: [0.5, 0.9, 0.25], at: [0, 1.9, 0], skin: 'ender_torso' });
  add({ size: [0.44, 0.14, 0.22], at: [0, 1.5, 0], skin: 'ender_skin', flat: true });
  // Arms, longer than the legs are tall: upper arm, forearm, a long hand.
  for (const s of [-1, 1]) {
    const arm = add({ size: [0.13, 0.66, 0.13], at: [s * 0.34, 2.3, 0], skin: 'ender_skin', hang: true, swing: s * 0.5, strike: 1 });
    const fore = add({ size: [0.12, 0.62, 0.12], at: [0, -0.66, 0], skin: 'ender_skin', hang: true, of: arm, rotX: -0.12 });
    add({ size: [0.11, 0.2, 0.11], at: [0, -0.62, 0], skin: 'ender_skin', hang: true, of: fore, flat: true });
  }
  // Legs: thigh, a knee that folds, shin, foot.
  for (const s of [-1, 1]) {
    const thigh = add({ size: [0.17, 0.74, 0.17], at: [s * 0.11, 1.45, 0], skin: 'ender_skin', hang: true, swing: s });
    const shin = add({ size: [0.15, 0.71, 0.15], at: [0, -0.74, 0], skin: 'ender_skin', hang: true, of: thigh, bend: 0.8 });
    add({ size: [0.17, 0.07, 0.27], at: [0, -0.68, -0.04], skin: 'ender_skin', hang: true, of: shin, flat: true });
  }
  return rig;
}

// ---- the bat -----------------------------------------------------------------------------------------------------

const BAT_FUR: RGB = [84, 62, 46];
const BAT_SKINS: Record<string, Painter> = {
  bat_fur: (x, y) => jit(mul(hash(x, y >> 1, 33) > 0.8 ? mul(BAT_FUR, 1.3) : BAT_FUR, lit(x, y, 0.3)), 8, x, y, 33),
  bat_belly: (x, y) => jit(mul([128, 104, 82], lit(x, y, 0.2)), 8, x, y, 34),
  bat_face: (x, y) => {
    if (rect(x, y, 3, 5, 4, 6) || rect(x, y, 11, 5, 12, 6)) return (x === 4 || x === 11) && y === 5 ? [236, 70, 56] : [8, 4, 4];
    if (rect(x, y, 6, 8, 9, 9)) return [78, 40, 48]; // the nose
    if (rect(x, y, 5, 11, 10, 11)) return [24, 12, 14];
    if ((x === 6 || x === 9) && y === 12) return [236, 232, 220]; // fangs
    return jit(mul(BAT_FUR, lit(x, y, 0.3) * 1.1), 8, x, y, 35);
  },
  bat_ear: (x, y) => (rect(x, y, 5, 3, 10, 13) ? jit([138, 84, 92], 8, x, y, 36) : jit(mul(BAT_FUR, 0.9), 8, x, y, 36)),
  bat_bone: (x, y) => jit(mul([64, 48, 38], lit(x, y, 0.2)), 6, x, y, 37),
  // The skin of a wing: thin and dark, with the fingers showing as lines that fan out.
  bat_wing: (x, y) => {
    const finger = (x + y * 2) % 7 === 0 || (x * 2 - y) % 9 === 0;
    return jit(finger ? [96, 72, 56] : mul([58, 42, 40], 0.9 + 0.2 * hash(x >> 1, y >> 1, 38)), 6, x, y, 39);
  },
};

export function batRig(): Part[] {
  const rig: Part[] = [];
  const add = (part: Part): number => rig.push(part) - 1;
  const head = add({ size: [0.26, 0.26, 0.26], at: [0, 0.72, -0.02], skin: 'bat_fur', front: 'bat_face', isHead: true });
  for (const s of [-1, 1]) {
    add({ size: [0.09, 0.2, 0.04], at: [s * 0.09, 0.22, 0.02], skin: 'bat_ear', of: head, flat: true, rotZ: s * -0.2 });
  }
  add({ size: [0.26, 0.4, 0.22], at: [0, 0.42, 0.02], skin: 'bat_fur' });
  add({ size: [0.2, 0.3, 0.02], at: [0, 0.42, -0.095], skin: 'bat_belly', flat: true });
  for (const s of [-1, 1]) add({ size: [0.045, 0.1, 0.045], at: [s * 0.06, 0.24, 0.03], skin: 'bat_bone', hang: true, flat: true });
  // Wings: the arm from the shoulder, its hand folding out beyond the wrist, the skin between them in three panels.
  // `flap` swings each about its own joint, the hand a little further than the arm, so the tip trails.
  for (const s of [-1, 1]) {
    const root = add({ size: [0.04, 0.04, 0.04], at: [s * 0.13, 0.56, 0.05], skin: 'bat_bone', flat: true, flap: -s * 0.8, rotZ: s * 0.05 });
    add({ size: [0.32, 0.04, 0.04], at: [s * 0.16, 0, 0], skin: 'bat_bone', of: root, flat: true });
    add({ size: [0.3, 0.3, 0.02], at: [s * 0.16, -0.17, 0], skin: 'bat_wing', of: root, flat: true });
    add({ size: [0.14, 0.2, 0.02], at: [s * 0.07, -0.3, 0.0], skin: 'bat_wing', of: root, flat: true });
    const hand = add({ size: [0.04, 0.04, 0.04], at: [s * 0.32, 0, 0], skin: 'bat_bone', of: root, flat: true, flap: -s * 0.35, rotZ: s * 0.12 });
    add({ size: [0.36, 0.03, 0.03], at: [s * 0.18, 0.0, 0], skin: 'bat_bone', of: hand, flat: true });
    add({ size: [0.34, 0.28, 0.02], at: [s * 0.18, -0.15, 0], skin: 'bat_wing', of: hand, flat: true });
    add({ size: [0.16, 0.16, 0.02], at: [s * 0.27, -0.32, 0], skin: 'bat_wing', of: hand, flat: true });
  }
  return rig;
}

// ---- all the skins -----------------------------------------------------------------------------------------------

export const HOSTILE_SKINS: Record<string, Painter> = {
  ...undeadSkins('zombie', UNDEAD.zombie!),
  ...undeadSkins('husk', UNDEAD.husk!),
  ...undeadSkins('drowned', UNDEAD.drowned!),
  ...CREEPER_SKINS,
  ...spiderSkins('spider', SPIDER_LOOKS.spider!),
  ...spiderSkins('cave_spider', SPIDER_LOOKS.cave_spider!),
  ...SLIME_SKINS,
  ...ENDER_SKINS,
  ...BAT_SKINS,
  glow_cyan: plain([120, 255, 244], 8, 60),
};
