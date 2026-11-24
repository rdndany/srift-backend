import type * as THREE from 'three';
import type { HollowDeepKind } from '@solrift/shared';
import { hash, jit, mix, mul, plain, rect, withFeatures, type Painter, type Part, type RGB } from './mobPaint';

/**
 * The six monsters of the Hollow Deep (they live nowhere else): their skins (16x16 painters), their rigs (lists of boxes) and the
 * poses that are not a walk or a swing (`poseDeep`, run by the renderer after its own pass over the parts).
 *
 *   moss_lurker   a hunched lump of moss, vines and leaves with two yellow-green eyes
 *   spore_puff    a small floating mushroom: a glowing cap, a little face, dangling tendrils; it swells before it bursts
 *   ember_wraith  a ragged hooded cloak of dark cubes with a face of fire, flames in its sleeves and under its hem
 *   ashen_knight  scorched plate armour, a horned helm with glowing slits, a tattered cape, a tower shield and a sword
 *   hollow_priest tattered robes, a hood with violet eyes, a skull-topped staff and a halo of bones turning over its head
 *   shade         a thin, tall, near-black figure of cubes with a few white eyes and fragments trailing behind it
 *
 * The server's `casting` number (see `Mob.casting` in the shared mobs.ts) says what a monster is in the middle of: for the lurker 1 is
 * rising out of the moss; for the puff 1 is swelling; for the wraith 1 gathers a fireball and 3 throws it; for the knight 1 is the
 * wind-up of the charge, 2 the dash and 3 the stagger after it; for the priest 1 is a curse and 2 a healing or a call; for the shade 2
 * is the flicker as it steps out behind its prey.
 */

// ---- skins ---------------------------------------------------------------------------------------------------------------

/** Two colours in patches of a few pixels (`sh` is the size of a patch as a shift), each pixel a little different. */
const patchy =
  (a: RGB, b: RGB, seed: number, sh = 1, thr = 0.5, amt = 8): Painter =>
  (x, y) =>
    jit(hash(x >> sh, y >> sh, seed) > thr ? a : b, amt, x, y, seed + 1);

/** A lit top-left edge and a shaded bottom-right one, so that a box reads as a block. */
const bevel =
  (p: Painter, k = 0.2): Painter =>
  (x, y) => mul(p(x, y), x === 0 || y === 0 ? 1 + k : x === 15 || y === 15 ? 1 - k : 1);

const DEEP_PAINT: Record<string, Painter> = {};

// -- the moss lurker
const moss: Painter = (x, y) => {
  const n = hash(x >> 1, y >> 1, 301) * 0.6 + hash(x, y, 302) * 0.4;
  if (n > 0.78) return jit([126, 192, 84], 8, x, y, 303);
  if (n < 0.26) return jit([30, 74, 38], 6, x, y, 304);
  return jit([58, 122, 50], 10, x, y, 305);
};
const moss2: Painter = (x, y) => {
  const n = hash(x >> 1, y >> 1, 311) * 0.6 + hash(x, y, 312) * 0.4;
  if (hash(x, y >> 2, 313) > 0.93) return jit([96, 68, 44], 8, x, y, 314); // a rootlet
  if (n > 0.8) return jit([84, 150, 66], 8, x, y, 315);
  return jit([36, 84, 44], 8, x, y, 316);
};
Object.assign(DEEP_PAINT, {
  lk_moss: bevel(moss, 0.16),
  lk_moss2: bevel(moss2, 0.16),
  lk_leaf: (x: number, y: number): RGB => {
    const rib = x === 7 || x === 8;
    const vein = (Math.abs(x - 7.5) * 1.3 + y * 0.5) % 4 < 0.9;
    if (rib) return jit([172, 222, 110], 8, x, y, 321);
    if (vein) return jit([46, 120, 52], 8, x, y, 322);
    return mul(jit([78, 170, 66], 12, x, y, 323), y < 2 || y > 13 ? 0.78 : 1);
  },
  lk_vine: (x: number, y: number): RGB => (hash(x, y >> 1, 324) > 0.8 ? jit([112, 178, 78], 8, x, y, 325) : jit([36, 88, 40], 8, x, y, 326)),
  lk_root: patchy([84, 60, 40], [56, 40, 30], 327, 1, 0.5, 8),
  lk_claw: plain([204, 194, 154], 10, 328),
  lk_eye: (x: number, y: number): RGB => {
    const d = Math.hypot(x - 7.5, y - 7.5);
    return d < 4.2 ? jit([240, 255, 120], 6, x, y, 329) : jit([150, 214, 56], 10, x, y, 330);
  },
});
DEEP_PAINT.lk_face = withFeatures(DEEP_PAINT.lk_moss!, [
  [1, 4, 14, 5, [20, 44, 26]], // the brow
  [2, 5, 6, 8, [10, 22, 14]], // sockets for the eyes
  [9, 5, 13, 8, [10, 22, 14]],
  [4, 11, 11, 12, [22, 40, 26]], // a mouth like a crack
]);

// -- the spore puff
DEEP_PAINT.sp_cap = (x, y) => {
  if (hash(x >> 2, y >> 2, 341) > 0.8) return jit([236, 242, 176], 8, x, y, 342); // a pale spot
  return mul(jit([86, 178, 138], 10, x, y, 343), y > 12 ? 0.8 : 1);
};
DEEP_PAINT.sp_cap_top = (x, y) => (hash(x >> 2, y >> 2, 344) > 0.82 ? jit([240, 246, 184], 8, x, y, 345) : jit([116, 204, 156], 10, x, y, 346));
DEEP_PAINT.sp_stem = plain([228, 232, 198], 8, 347);
DEEP_PAINT.sp_face = withFeatures(DEEP_PAINT.sp_stem!, [
  [3, 4, 5, 8, [34, 40, 40]],
  [10, 4, 12, 8, [34, 40, 40]],
  [4, 5, 4, 6, [210, 250, 190]],
  [11, 5, 11, 6, [210, 250, 190]],
  [6, 11, 9, 12, [96, 74, 74]],
]);
DEEP_PAINT.sp_spot = (x, y) => (Math.hypot(x - 7.5, y - 7.5) < 5 ? jit([240, 255, 170], 6, x, y, 348) : jit([190, 240, 140], 8, x, y, 349));
DEEP_PAINT.sp_tendril = plain([142, 214, 150], 12, 350);
DEEP_PAINT.sp_gill = (x, y) => (x % 3 === 0 ? jit([56, 112, 88], 6, x, y, 351) : jit([84, 150, 116], 8, x, y, 352));

// -- the ember wraith
DEEP_PAINT.ew_cloak = (x, y) => {
  if (hash(x, y, 361) > 0.965) return jit([170, 64, 22], 10, x, y, 362); // a live spark in the cloth
  return mul(patchy([34, 28, 34], [22, 18, 24], 363, 1, 0.5, 6)(x, y), x === 0 || y === 0 ? 1.25 : x === 15 || y === 15 ? 0.8 : 1);
};
DEEP_PAINT.ew_rag = (x, y) => {
  const base = DEEP_PAINT.ew_cloak!(x, y);
  return y > 9 ? mix(base, [236, 100, 26], Math.min(1, (y - 9) / 6) * 0.85) : base;
};
DEEP_PAINT.ew_hood = withFeatures(DEEP_PAINT.ew_cloak, [[3, 3, 12, 13, [8, 5, 8]]]);
DEEP_PAINT.ew_flame = (x, y) => {
  if (rect(x, y, 3, 6, 6, 8) || rect(x, y, 9, 6, 12, 8)) return [34, 6, 4]; // eyes: dark slits in the fire
  if (rect(x, y, 5, 11, 10, 12)) return [40, 8, 4];
  const d = Math.hypot(x - 7.5, y - 7.5) / 8;
  return jit(mix([255, 226, 130], [255, 110, 20], Math.min(1, d * d * 1.2)), 10, x, y, 364);
};
DEEP_PAINT.ew_ember = (x, y) => jit(hash(x >> 1, y >> 1, 365) > 0.5 ? [255, 150, 44] : [255, 100, 24], 12, x, y, 366);

// -- the ashen knight
const plate: Painter = (x, y) => {
  if (hash(x, y, 371) > 0.97) return jit([110, 70, 40], 8, x, y, 372); // rust
  if (hash(x >> 2, y >> 2, 373) > 0.72) return jit([32, 28, 30], 6, x, y, 374); // soot
  const e = Math.min(x, y, 15 - x, 15 - y);
  return jit(e === 0 ? [96, 92, 100] : [58, 56, 62], 6, x, y, 375);
};
Object.assign(DEEP_PAINT, {
  ak_plate: bevel(plate, 0.18),
  ak_dark: bevel(patchy([40, 38, 44], [28, 26, 30], 376, 1, 0.5, 5), 0.15),
  ak_cape: (x: number, y: number): RGB => (hash(x >> 1, y, 377) > 0.84 ? jit([70, 66, 64], 8, x, y, 378) : jit([100, 38, 32], 12, x, y, 379)),
  ak_horn: (x: number, y: number): RGB => mul(jit([204, 192, 164], 8, x, y, 380), y < 6 ? 0.55 : 1),
  ak_blade: (x: number, y: number): RGB => (x === 7 || x === 8 ? jit([206, 208, 220], 6, x, y, 381) : hash(x, y, 382) > 0.93 ? jit([220, 120, 50], 8, x, y, 383) : jit([138, 140, 154], 8, x, y, 384)),
  ak_slit: (x: number, y: number): RGB => jit([255, 176, 64], 8, x, y, 385),
  ak_shield: (x: number, y: number): RGB => {
    const e = Math.min(x, y, 15 - x, 15 - y);
    if (e <= 1) return jit([100, 98, 108], 6, x, y, 386);
    const d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
    if (d > 3 && d < 5.5) return jit([150, 66, 30], 10, x, y, 387); // a scorched device
    if (hash(x >> 2, y >> 2, 388) > 0.7) return jit([30, 28, 30], 6, x, y, 389);
    return jit([52, 50, 58], 6, x, y, 390);
  },
});
DEEP_PAINT.ak_visor = withFeatures(DEEP_PAINT.ak_plate!, [
  [2, 5, 13, 9, [12, 10, 14]],
  [2, 7, 13, 7, [40, 20, 14]],
]);

// -- the hollow priest
Object.assign(DEEP_PAINT, {
  hp_robe: (x: number, y: number): RGB => mul(jit([46, 32, 64], 8, x, y, 391), x % 5 === 0 ? 0.78 : 1),
  hp_robe2: (x: number, y: number): RGB => mul(jit([60, 40, 84], 8, x, y, 392), x % 4 === 0 ? 0.8 : 1),
  hp_trim: (x: number, y: number): RGB => (hash(x >> 1, y, 393) > 0.8 ? jit([70, 44, 100], 8, x, y, 394) : jit([188, 174, 138], 10, x, y, 395)),
  hp_bone: plain([224, 216, 192], 10, 396),
  hp_staff: patchy([62, 44, 36], [44, 32, 28], 397, 1, 0.5, 6),
  hp_eye: (x: number, y: number): RGB => jit(Math.hypot(x - 7.5, y - 7.5) < 4 ? [238, 190, 255] : [180, 100, 255], 8, x, y, 398),
});
DEEP_PAINT.hp_hood = withFeatures(DEEP_PAINT.hp_robe!, [[3, 3, 12, 13, [8, 5, 14]]]);
DEEP_PAINT.hp_skull_face = withFeatures(DEEP_PAINT.hp_bone!, [
  [2, 4, 5, 8, [26, 16, 36]],
  [10, 4, 13, 8, [26, 16, 36]],
  [7, 9, 8, 10, [34, 24, 40]],
  [4, 12, 11, 13, [60, 50, 60]],
  [6, 12, 6, 13, [224, 216, 192]],
  [9, 12, 9, 13, [224, 216, 192]],
]);

// -- the shade
const shadeBody: Painter = (x, y) => {
  const e = Math.min(x, y, 15 - x, 15 - y);
  if (e === 0) return jit([72, 62, 114], 6, x, y, 401); // a faint violet rim, so the cube reads in the dark
  if (hash(x >> 2, y, 402) > 0.86) return jit([26, 22, 40], 4, x, y, 403);
  return jit([12, 10, 18], 4, x, y, 404);
};
DEEP_PAINT.sh_body = shadeBody;
DEEP_PAINT.sh_face = shadeBody;
DEEP_PAINT.sh_eye = plain([246, 246, 255], 6, 405);
DEEP_PAINT.sh_wisp = (x, y) => (hash(x, y, 406) > 0.8 ? jit([40, 34, 62], 6, x, y, 407) : jit([18, 14, 28], 5, x, y, 408));

/** Registered with the renderer's skins (`Object.assign(SKINS, DEEP_SKINS)`). */
export const DEEP_SKINS: Record<string, Painter> = DEEP_PAINT;

// ---- rigs ----------------------------------------------------------------------------------------------------------------

/** The indexes of the tagged parts of each rig, to pose them (a part's index is its place in the rig, which is its place in a view's `parts`). */
const TAGS: Record<string, Record<string, number[]>> = {};

class Rig {
  readonly parts: Part[] = [];
  readonly tags: Record<string, number[]> = {};
  constructor(kind: string) {
    TAGS[kind] = this.tags;
  }
  add(part: Part, tag?: string): number {
    const i = this.parts.push(part) - 1;
    if (tag) (this.tags[tag] ??= []).push(i);
    return i;
  }
}

function mossLurkerRig(): Part[] {
  const r = new Rig('moss_lurker');
  for (const s of [-1, 1]) {
    const leg = r.add({ size: [0.4, 0.5, 0.42], at: [s * 0.3, 0.5, 0.02], skin: 'lk_root', hang: true, swing: s * 0.7 });
    r.add({ size: [0.46, 0.14, 0.54], at: [0, -0.4, -0.05], skin: 'lk_moss2', hang: true, of: leg, flat: true });
  }
  const body = r.add({ size: [1.0, 0.75, 0.8], at: [0, 0.88, 0.08], skin: 'lk_moss', rotX: 0.18 }, 'body');
  r.add({ size: [0.78, 0.5, 0.55], at: [0, 1.32, 0.28], skin: 'lk_moss2', rotX: 0.3 }, 'body');
  // Clumps of leaves growing on its back and shoulders.
  const leaves: [number, number, number, number, number, number][] = [
    [-0.3, 0.42, 0.05, 0.3, 0.2, 0.3],
    [0.3, 0.4, -0.1, -0.35, 0.1, 0.25],
    [0.0, 0.44, 0.3, 0.1, 0.0, -0.4],
    [-0.52, 0.12, 0.0, 1.2, 0.0, 0.0],
    [0.5, 0.0, 0.1, -1.1, 0.0, 0.2],
    [-0.2, 0.2, 0.42, 0.0, 0.2, 0.9],
  ];
  for (const [x, y, z, rz, rx, ry] of leaves) r.add({ size: [0.34, 0.06, 0.26], at: [x, y, z], skin: 'lk_leaf', of: body, flat: true, rotZ: rz, rotX: rx, rotY: ry }, 'leaf');
  const head = r.add({ size: [0.62, 0.46, 0.56], at: [0, 1.16, -0.5], skin: 'lk_moss', front: 'lk_face', isHead: true }, 'head');
  r.add({ size: [0.52, 0.14, 0.48], at: [0, 0.28, 0.02], skin: 'lk_moss2', of: head, flat: true });
  for (const [x, z, rz] of [[-0.18, -0.1, 0.5], [0.16, 0.08, -0.45], [0.0, 0.18, 0.1]] as const) {
    r.add({ size: [0.3, 0.05, 0.2], at: [x, 0.36, z], skin: 'lk_leaf', of: head, flat: true, rotZ: rz }, 'leaf');
  }
  for (const s of [-1, 1]) {
    // Eyes: two yellow-green lamps sunk under the brow.
    r.add({ size: [0.13, 0.1, 0.03], at: [s * 0.15, 0.03, -0.285], skin: 'lk_eye', of: head, flat: true, glow: true, pulse: 0.25 });
    r.add({ size: [0.06, 0.45, 0.06], at: [s * 0.24, 0.0, -0.22], skin: 'lk_vine', hang: true, of: head, flat: true, rotZ: s * 0.12 }, 'vine');
    const arm = r.add({ size: [0.34, 0.75, 0.36], at: [s * 0.66, 1.3, -0.05], skin: 'lk_moss2', hang: true, swing: s * 0.5, rotX: 0.45, strike: 1, raise: 1.0 });
    const fore = r.add({ size: [0.3, 0.55, 0.32], at: [0, -0.7, 0], skin: 'lk_root', hang: true, of: arm, rotX: -0.3 });
    for (const c of [-1, 0, 1]) r.add({ size: [0.07, 0.2, 0.07], at: [c * 0.09, -0.5, -0.1], skin: 'lk_claw', hang: true, of: fore, flat: true, rotX: -0.2 });
    r.add({ size: [0.06, 0.6, 0.06], at: [s * 0.18, -0.2, -0.12], skin: 'lk_vine', hang: true, of: arm, flat: true }, 'vine');
    r.add({ size: [0.3, 0.06, 0.26], at: [0, 0.0, 0.0], skin: 'lk_leaf', of: arm, flat: true, rotZ: s * 0.5 }, 'leaf');
  }
  for (const x of [-0.25, 0.05, 0.3]) r.add({ size: [0.06, 0.7, 0.06], at: [x, 1.45, 0.52], skin: 'lk_vine', hang: true, flat: true, rotX: -0.1 }, 'vine');
  return r.parts;
}

function sporePuffRig(): Part[] {
  const r = new Rig('spore_puff');
  r.add({ size: [0.34, 0.34, 0.34], at: [0, 0.28, 0], skin: 'sp_stem', front: 'sp_face', selfLit: 0.45 });
  r.add({ size: [0.62, 0.05, 0.62], at: [0, 0.44, 0], skin: 'sp_gill', flat: true, selfLit: 0.4 });
  const cap = r.add({ size: [0.72, 0.26, 0.72], at: [0, 0.58, 0], skin: 'sp_cap', selfLit: 0.6 }, 'cap');
  const top = r.add({ size: [0.5, 0.16, 0.5], at: [0, 0.21, 0], skin: 'sp_cap_top', of: cap, selfLit: 0.7 });
  for (const [x, z] of [[-0.14, -0.1], [0.12, -0.14], [0.1, 0.12], [-0.12, 0.14]] as const) {
    r.add({ size: [0.14, 0.02, 0.14], at: [x, 0.09, z], skin: 'sp_spot', of: top, flat: true, glow: true, pulse: 0.3 });
  }
  for (const [x, y, z, w, d] of [[0.0, 0.02, -0.365, 0.12, 0.02], [0.0, 0.02, 0.365, 0.12, 0.02], [-0.365, 0.02, 0.0, 0.02, 0.12], [0.365, 0.02, 0.0, 0.02, 0.12]] as const) {
    r.add({ size: [w + 0.04, 0.1, d + 0.04], at: [x, y, z], skin: 'sp_spot', of: cap, flat: true, glow: true, pulse: 0.3 });
  }
  // Tendrils dangle from under the cap like a jellyfish's: a ring of long thin ones round the stem, and a few short ones in front of it.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    const len = 0.34 + hash(i, 3, 351) * 0.2;
    const t = r.add({ size: [0.04, len, 0.04], at: [Math.cos(a) * 0.27, 0.44, Math.sin(a) * 0.27], skin: 'sp_tendril', hang: true, flat: true, selfLit: 0.5 }, 'tend');
    r.add({ size: [0.07, 0.07, 0.07], at: [0, -len + 0.02, 0], skin: 'sp_spot', hang: true, of: t, flat: true, glow: true, pulse: 0.3 });
  }
  return r.parts;
}

function emberWraithRig(): Part[] {
  const r = new Rig('ember_wraith');
  const lit = 0.3;
  r.add({ size: [0.62, 0.55, 0.42], at: [0, 0.42, 0], skin: 'ew_cloak', selfLit: lit });
  r.add({ size: [0.58, 0.6, 0.38], at: [0, 0.93, 0], skin: 'ew_cloak', selfLit: lit });
  r.add({ size: [0.64, 0.46, 0.4], at: [0, 1.4, 0], skin: 'ew_cloak', selfLit: lit });
  // A ragged hem: strips of cloth, their ends burning, trailing behind it as it flies.
  const hem: [number, number, number][] = [[-0.25, -0.2, 0.34], [-0.08, -0.22, 0.4], [0.1, -0.2, 0.3], [0.26, -0.2, 0.38], [-0.31, 0.0, 0.3], [0.31, 0.0, 0.26], [0.0, 0.2, 0.28], [-0.18, 0.2, 0.22], [0.17, 0.2, 0.3]];
  for (const [x, z, h] of hem) r.add({ size: [0.13, h, 0.1], at: [x, 0.16, z], skin: 'ew_rag', hang: true, flat: true, selfLit: 0.5 }, 'rag');
  r.add({ size: [0.55, 0.65, 0.55], at: [0, -0.05, 0], skin: 'ew_ember', flat: true, flame: 1.3 });
  r.add({ size: [0.4, 0.5, 0.4], at: [-0.22, 0.0, 0.1], skin: 'ew_ember', flat: true, flame: 2.1 });
  const hood = r.add({ size: [0.5, 0.5, 0.5], at: [0, 1.78, 0], skin: 'ew_cloak', front: 'ew_hood', isHead: true, selfLit: lit }, 'head');
  r.add({ size: [0.36, 0.2, 0.36], at: [0, 0.3, 0.1], skin: 'ew_cloak', of: hood, flat: true, rotX: 0.4, selfLit: lit });
  r.add({ size: [0.32, 0.32, 0.05], at: [0, -0.02, -0.255], skin: 'ew_flame', of: hood, flat: true, glow: true, pulse: 0.2 });
  r.add({ size: [0.46, 0.6, 0.46], at: [0, 0.18, 0.04], skin: 'ew_ember', of: hood, flat: true, flame: 0.3 });
  for (const s of [-1, 1]) {
    const arm = r.add({ size: [0.22, 0.55, 0.22], at: [s * 0.42, 1.55, 0], skin: 'ew_cloak', hang: true, swing: s * 0.3, rotX: 0.7, rotZ: s * 0.1, strike: 1, raise: 0.6, selfLit: lit });
    r.add({ size: [0.3, 0.2, 0.3], at: [0, -0.4, 0], skin: 'ew_rag', hang: true, of: arm, flat: true, selfLit: 0.5 });
    r.add({ size: [0.14, 0.14, 0.14], at: [0, -0.5, 0], skin: 'ew_ember', hang: true, of: arm, flat: true, glow: true, pulse: 0.2 });
    r.add({ size: [0.36, 0.6, 0.36], at: [0, -0.48, -0.04], skin: 'ew_ember', of: arm, flat: true, flame: 3 + s }, 'hand');
  }
  return r.parts;
}

function ashenKnightRig(): Part[] {
  const r = new Rig('ashen_knight');
  for (const s of [-1, 1]) {
    const thigh = r.add({ size: [0.3, 0.5, 0.32], at: [s * 0.17, 0.9, 0], skin: 'ak_plate', hang: true, swing: s });
    const shin = r.add({ size: [0.27, 0.44, 0.3], at: [0, -0.48, 0], skin: 'ak_dark', hang: true, of: thigh, bend: 0.9 });
    r.add({ size: [0.29, 0.15, 0.42], at: [0, -0.4, -0.06], skin: 'ak_plate', hang: true, of: shin, flat: true });
    r.add({ size: [0.16, 0.16, 0.1], at: [0, -0.04, -0.17], skin: 'ak_plate', of: thigh, flat: true }); // the kneecap
  }
  r.add({ size: [0.7, 0.28, 0.42], at: [0, 0.92, 0], skin: 'ak_dark' }); // the tassets
  r.add({ size: [0.62, 0.8, 0.38], at: [0, 1.28, 0], skin: 'ak_plate' }, 'torso');
  r.add({ size: [0.4, 0.4, 0.06], at: [0, 1.36, -0.2], skin: 'ak_dark', flat: true });
  // The cape: torn at its hem, hanging from the shoulders and streaming back when it runs.
  const cape = r.add({ size: [0.62, 0.95, 0.05], at: [0, 1.62, 0.22], skin: 'ak_cape', hang: true, flat: true, rotX: -0.1 }, 'cape');
  for (const [x, h] of [[-0.2, 0.3], [0.0, 0.42], [0.21, 0.26]] as const) r.add({ size: [0.17, h, 0.05], at: [x, -0.92, 0], skin: 'ak_cape', hang: true, of: cape, flat: true }, 'rag');
  const head = r.add({ size: [0.52, 0.52, 0.52], at: [0, 1.88, 0], skin: 'ak_plate', front: 'ak_visor', isHead: true }, 'head');
  r.add({ size: [0.56, 0.1, 0.56], at: [0, 0.2, 0], skin: 'ak_dark', of: head, flat: true });
  r.add({ size: [0.32, 0.07, 0.02], at: [0, 0.0, -0.265], skin: 'ak_slit', of: head, flat: true, glow: true, pulse: 0.15 });
  for (const s of [-1, 1]) {
    // Horns, curving up and out.
    const horn = r.add({ size: [0.11, 0.3, 0.11], at: [s * 0.3, 0.2, 0], skin: 'ak_horn', of: head, flat: true, rotZ: -s * 0.55 });
    r.add({ size: [0.08, 0.22, 0.08], at: [0, 0.24, 0], skin: 'ak_horn', of: horn, flat: true, rotZ: -s * 0.55 });
    r.add({ size: [0.34, 0.2, 0.4], at: [s * 0.5, 1.64, 0], skin: 'ak_plate', flat: true, rotZ: s * 0.15 }); // pauldron
  }
  // The right arm and its sword, the left arm and its tower shield.
  const sword = r.add({ size: [0.24, 0.46, 0.26], at: [0.46, 1.58, 0], skin: 'ak_plate', hang: true, swing: 0.5, rotX: 0.6, strike: 1, raise: 0.5 }, 'swordArm');
  const swordFore = r.add({ size: [0.22, 0.42, 0.24], at: [0, -0.44, 0], skin: 'ak_dark', hang: true, of: sword, rotX: -0.2 });
  r.add({ size: [0.2, 0.14, 0.2], at: [0, -0.38, 0], skin: 'ak_plate', hang: true, of: swordFore, flat: true });
  r.add({ size: [0.34, 0.06, 0.1], at: [0, -0.52, -0.02], skin: 'ak_dark', of: swordFore, flat: true });
  r.add({ size: [0.05, 0.11, 0.95], at: [0, -0.52, -0.5], skin: 'ak_blade', of: swordFore, flat: true }); // the blade points the way the fist does
  const shield = r.add({ size: [0.24, 0.46, 0.26], at: [-0.46, 1.58, 0], skin: 'ak_plate', hang: true, swing: 0.15, rotX: 0.55, strike: 0.4, raise: 0.5 }, 'shieldArm');
  r.add({ size: [0.62, 1.1, 0.09], at: [-0.1, -0.52, -0.22], skin: 'ak_shield', of: shield, flat: true, rotY: 0.18 });
  return r.parts;
}

function hollowPriestRig(): Part[] {
  const r = new Rig('hollow_priest');
  for (const s of [-1, 1]) r.add({ size: [0.14, 0.14, 0.24], at: [s * 0.14, 0.14, -0.06], skin: 'hp_bone', hang: true, swing: s * 0.8, flat: true }); // bony feet below the hem
  r.add({ size: [0.64, 0.9, 0.44], at: [0, 0.58, 0], skin: 'hp_robe' });
  r.add({ size: [0.68, 0.08, 0.48], at: [0, 0.2, 0], skin: 'hp_trim', flat: true });
  for (const [x, h] of [[-0.24, 0.3], [-0.08, 0.38], [0.1, 0.28], [0.26, 0.34]] as const) r.add({ size: [0.14, h, 0.05], at: [x, 0.2, 0.25], skin: 'hp_robe', hang: true, flat: true }, 'rag');
  for (const [x, h] of [[-0.3, 0.26], [0.3, 0.3]] as const) r.add({ size: [0.14, h, 0.05], at: [x, 0.2, -0.24], skin: 'hp_robe2', hang: true, flat: true }, 'rag');
  r.add({ size: [0.52, 0.66, 0.32], at: [0, 1.2, 0], skin: 'hp_robe2' });
  r.add({ size: [0.2, 0.55, 0.04], at: [0, 1.12, -0.18], skin: 'hp_trim', flat: true });
  r.add({ size: [0.74, 0.2, 0.44], at: [0, 1.55, 0], skin: 'hp_robe' });
  const hood = r.add({ size: [0.5, 0.52, 0.5], at: [0, 1.76, 0], skin: 'hp_robe', front: 'hp_hood', isHead: true }, 'head');
  r.add({ size: [0.36, 0.22, 0.36], at: [0, 0.3, 0.1], skin: 'hp_robe', of: hood, flat: true, rotX: 0.4 });
  for (const s of [-1, 1]) {
    r.add({ size: [0.09, 0.05, 0.02], at: [s * 0.1, 0.0, -0.257], skin: 'hp_eye', of: hood, flat: true, glow: true, pulse: 0.25 });
    // The left arm (the free one) rises when it calls on the dark.
    if (s === -1) {
      const arm = r.add({ size: [0.2, 0.55, 0.2], at: [-0.38, 1.5, 0], skin: 'hp_robe', hang: true, swing: 0.3, rotX: 0.3, strike: 1, raise: 1.5 });
      r.add({ size: [0.3, 0.16, 0.3], at: [0, -0.42, 0], skin: 'hp_trim', hang: true, of: arm, flat: true });
      r.add({ size: [0.09, 0.12, 0.09], at: [0, -0.5, 0], skin: 'hp_bone', hang: true, of: arm, flat: true });
    }
  }
  // The right arm holds a staff; the staff keeps upright (see `poseDeep`) whatever the arm does.
  const staffArm = r.add({ size: [0.2, 0.55, 0.2], at: [0.38, 1.5, 0], skin: 'hp_robe', hang: true, rotX: 0.9, strike: 1, raise: 0.5 }, 'staffArm');
  r.add({ size: [0.3, 0.16, 0.3], at: [0, -0.42, 0], skin: 'hp_trim', hang: true, of: staffArm, flat: true });
  const pivot = r.add({ size: [0.02, 0.02, 0.02], at: [0, -0.52, -0.02], skin: 'hp_bone', of: staffArm, flat: true }, 'pivot');
  r.add({ size: [0.11, 0.11, 0.11], at: [0, 0, 0], skin: 'hp_bone', of: pivot, flat: true });
  r.add({ size: [0.07, 1.7, 0.07], at: [0, 0.2, 0], skin: 'hp_staff', of: pivot, flat: true });
  r.add({ size: [0.15, 0.05, 0.15], at: [0, 0.93, 0], skin: 'hp_bone', of: pivot, flat: true });
  const skull = r.add({ size: [0.24, 0.26, 0.24], at: [0, 1.1, 0], skin: 'hp_bone', front: 'hp_skull_face', of: pivot });
  for (const s of [-1, 1]) r.add({ size: [0.05, 0.05, 0.02], at: [s * 0.062, 0.02, -0.125], skin: 'hp_eye', of: skull, flat: true, glow: true, pulse: 0.3 });
  // The halo: eight bones floating in a ring over the head, which turns (the pivot) and bobs (each bone).
  const halo = r.add({ size: [0.02, 0.02, 0.02], at: [0, 2.2, 0], skin: 'hp_bone', flat: true }, 'halo');
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    r.add({ size: [0.16, 0.06, 0.07], at: [Math.cos(a) * 0.36, 0, Math.sin(a) * 0.36], skin: 'hp_bone', of: halo, flat: true, rotY: -a, selfLit: 0.55 }, 'bone');
  }
  for (const a of [0.4, 2.0, 3.6, 5.2]) r.add({ size: [0.06, 0.06, 0.06], at: [Math.cos(a) * 0.36, 0.1, Math.sin(a) * 0.36], skin: 'hp_eye', of: halo, flat: true, glow: true, pulse: 0.3 });
  return r.parts;
}

function shadeRig(): Part[] {
  const r = new Rig('shade');
  const A = 0.99; // all of it can be faded (see poseDeep), so it is drawn see-through, though it is not
  for (const s of [-1, 1]) r.add({ size: [0.13, 0.9, 0.13], at: [s * 0.1, 0.92, 0], skin: 'sh_body', hang: true, swing: s, alpha: A });
  r.add({ size: [0.24, 0.2, 0.15], at: [0, 0.96, 0], skin: 'sh_body', alpha: A });
  r.add({ size: [0.32, 0.62, 0.18], at: [0, 1.28, 0], skin: 'sh_body', alpha: A });
  r.add({ size: [0.54, 0.12, 0.2], at: [0, 1.6, 0], skin: 'sh_body', alpha: A });
  const head = r.add({ size: [0.34, 0.4, 0.34], at: [0, 1.82, 0], skin: 'sh_body', front: 'sh_face', isHead: true, alpha: A }, 'head');
  for (const [x, y, w] of [[-0.08, 0.04, 0.07], [0.08, 0.04, 0.07], [0.0, 0.14, 0.05]] as const) {
    r.add({ size: [w, w * 0.8, 0.02], at: [x, y, -0.175], skin: 'sh_eye', of: head, flat: true, glow: true, pulse: 0.2, alpha: 0.99 }, 'eye');
  }
  for (const s of [-1, 1]) {
    r.add({ size: [0.05, 0.24, 0.05], at: [s * 0.1, 0.3, 0.02], skin: 'sh_body', of: head, flat: true, rotZ: -s * 0.3, alpha: A });
    const arm = r.add({ size: [0.1, 0.85, 0.1], at: [s * 0.31, 1.6, 0], skin: 'sh_body', hang: true, swing: s * 0.6, rotX: 0.25, strike: 1, alpha: A });
    const fore = r.add({ size: [0.08, 0.6, 0.08], at: [0, -0.82, 0], skin: 'sh_body', hang: true, of: arm, rotX: -0.3, alpha: A });
    for (const c of [-1, 0, 1]) r.add({ size: [0.025, 0.3, 0.025], at: [c * 0.03, -0.58, -0.02], skin: 'sh_body', hang: true, of: fore, flat: true, rotX: -0.15, alpha: A });
  }
  // Tatters of shadow trailing from the shoulders.
  for (const [x, h] of [[-0.2, 0.7], [0.0, 0.9], [0.2, 0.62]] as const) r.add({ size: [0.09, h, 0.03], at: [x, 1.56, 0.12], skin: 'sh_wisp', hang: true, flat: true, alpha: 0.65 }, 'tatter');
  // Fragments that drift about it and stay behind when it moves.
  const wisps: [number, number, number, number][] = [[-0.5, 1.3, 0.2, 0.1], [0.5, 1.6, 0.0, 0.12], [-0.4, 0.7, -0.2, 0.08], [0.45, 0.9, 0.25, 0.1], [0.0, 2.2, 0.1, 0.07], [-0.2, 0.3, 0.3, 0.09], [0.25, 0.4, -0.2, 0.07], [0.05, 1.1, 0.5, 0.11]];
  for (const [x, y, z, s] of wisps) r.add({ size: [s, s, s], at: [x, y, z], skin: 'sh_wisp', flat: true, alpha: 0.6, rotY: x * 3, rotX: z * 2 }, 'wisp');
  return r.parts;
}

export const DEEP_RIGS: Record<HollowDeepKind, Part[]> = {
  moss_lurker: mossLurkerRig(),
  spore_puff: sporePuffRig(),
  ember_wraith: emberWraithRig(),
  ashen_knight: ashenKnightRig(),
  hollow_priest: hollowPriestRig(),
  shade: shadeRig(),
};

// ---- poses ---------------------------------------------------------------------------------------------------------------

/** What `poseDeep` needs to know of a mob and of its view. */
export interface DeepMob {
  id: number;
  casting?: number;
  speedNow: number;
  dead: boolean;
  deathTime: number;
  hurtTime: number;
}
export interface DeepPart {
  mesh: THREE.Mesh;
  def: Part;
  mats: THREE.Material[];
}

const lerp = (a: number, b: number, k: number): number => a + (b - a) * Math.min(1, Math.max(0, k));

/** Whether this is one of the six (the renderer asks before it calls `poseDeep`). */
export const isDeepKind = (kind: string): kind is HollowDeepKind => kind in DEEP_RIGS;

/**
 * Poses a deep monster after the renderer's walk and swing: `g` is its group, `parts` the view's parts (in the order of the rig), `k` how
 * far into a `casting` pose it is (0..1, eased), `t` the time and `dt` the frame.
 */
export function poseDeep(kind: HollowDeepKind, g: THREE.Object3D, parts: readonly DeepPart[], m: DeepMob, k: number, t: number, dt: number): void {
  const tags = TAGS[kind];
  if (!tags) return;
  const c = m.casting ?? 0;
  const moving = Math.min(1, m.speedNow / 2);
  const each = (tag: string, fn: (p: DeepPart, i: number) => void): void => (tags[tag] ?? []).forEach((idx, i) => parts[idx] && fn(parts[idx]!, i));
  const rot = (p: DeepPart, field: 'x' | 'y' | 'z', target: number, w: number): void => {
    p.mesh.rotation[field] = lerp(p.mesh.rotation[field], target, w);
  };
  const one = (tag: string): DeepPart | undefined => parts[tags[tag]?.[0] ?? -1];

  switch (kind) {
    case 'moss_lurker': {
      // It breathes under its moss; the leaves and vines stir; it rises (head up, arms out) when it wakes.
      each('body', (p) => p.mesh.scale.set(1, 1 + Math.sin(t * 1.3 + m.id) * 0.03, 1));
      each('leaf', (p, i) => rot(p, 'z', (p.def.rotZ ?? 0) + Math.sin(t * 1.4 + i * 1.7 + m.id) * 0.1, 1));
      each('vine', (p, i) => rot(p, 'x', (p.def.rotX ?? 0) + Math.sin(t * 1.1 + i * 2.1) * 0.08 - moving * 0.15, 1));
      const head = one('head');
      if (head) head.mesh.position.y += k * 0.14;
      break;
    }
    case 'spore_puff': {
      // A soft pulse; swelling and shaking faster as it is about to burst; the tendrils trail and sway; it shrinks away when it dies.
      const swell = c === 1 ? k * (0.3 + 0.08 * Math.sin(t * 22)) : 0;
      const pulse = 1 + Math.sin(t * 3 + m.id) * 0.06 + swell;
      g.scale.multiplyScalar(m.dead ? Math.max(0.05, 1 - m.deathTime * 3.5) : pulse);
      g.position.y += Math.sin(t * 2 + m.id) * 0.06;
      each('cap', (p) => p.mesh.scale.set(1 + Math.sin(t * 3 + m.id) * 0.05, 1 - Math.sin(t * 3 + m.id) * 0.1, 1 + Math.sin(t * 3 + m.id) * 0.05));
      each('tend', (p, i) => {
        p.mesh.rotation.x = Math.sin(t * 2.2 + i * 1.3 + m.id) * 0.12 + moving * 0.25;
        p.mesh.rotation.z = Math.cos(t * 1.9 + i * 1.9) * 0.12;
      });
      break;
    }
    case 'ember_wraith': {
      // It floats: bobbing, the hem and sleeves streaming out behind it; the fire in its hands flares when it gathers a fireball.
      g.position.y += Math.sin(t * 1.8 + m.id) * 0.1;
      each('rag', (p, i) => {
        p.mesh.rotation.x = -(0.12 + moving * 0.55) + Math.sin(t * 3.2 + i * 1.3 + m.id) * 0.12;
        p.mesh.rotation.z = Math.sin(t * 2.4 + i * 2.2) * 0.1;
      });
      each('hand', (p) => {
        const f = 1 + k * (c === 3 ? 0.55 : 0.4);
        p.mesh.scale.multiplyScalar(f);
      });
      break;
    }
    case 'ashen_knight': {
      // The charge: winds up (leans back, sword drawn back, shield forward), dashes (leans into it, shield and blade thrust forward),
      // staggers (shield down, head low).
      g.rotation.order = 'YXZ';
      const lean = m.dead ? 0 : c === 2 ? -0.42 : c === 1 ? 0.14 : c === 3 ? 0.16 : 0;
      const cur = (g.userData.lean as number | undefined) ?? 0;
      const next = lerp(cur, lean, dt * 9);
      g.userData.lean = next;
      g.rotation.x += next;
      const sw = one('swordArm');
      const sh = one('shieldArm');
      const w = k * (c === 2 ? 1 : 0.9);
      if (sw) rot(sw, 'x', c === 1 ? -1.2 : c === 2 ? 1.5 : 0.35, w);
      if (sh) rot(sh, 'x', c === 1 ? 1.15 : c === 2 ? 1.35 : 0.0, w);
      const cape = one('cape');
      if (cape) cape.mesh.rotation.x = -(0.1 + moving * 0.5 + (c === 2 ? 0.55 : 0) + Math.sin(t * 6 + m.id) * 0.04 * (0.4 + moving));
      each('rag', (p, i) => rot(p, 'x', Math.sin(t * 5 + i * 1.7) * 0.15 * (0.4 + moving), 1));
      break;
    }
    case 'hollow_priest': {
      // The staff stays upright whatever the arm does and tips forward at a curse; the halo turns, faster and higher when it calls on the dark.
      const arm = one('staffArm');
      const pivot = one('pivot');
      if (arm && pivot) pivot.mesh.rotation.x = -arm.mesh.rotation.x - (c === 1 ? 0.45 * k : 0.0);
      const halo = one('halo');
      if (halo) {
        const spin = ((halo.mesh.userData.spin as number | undefined) ?? 0) + dt * (1.1 + (c === 2 ? k * 5 : 0));
        halo.mesh.userData.spin = spin;
        halo.mesh.rotation.y = spin;
        halo.mesh.position.y = 2.2 + Math.sin(t * 1.6 + m.id) * 0.04 + (c === 2 ? k * 0.18 : 0);
        halo.mesh.rotation.z = Math.sin(t * 0.9 + m.id) * 0.06;
      }
      each('bone', (p, i) => (p.mesh.position.y = Math.sin(t * 2.2 + i * 0.9) * 0.05));
      each('rag', (p, i) => rot(p, 'x', -(moving * 0.3) + Math.sin(t * 2 + i * 1.6) * 0.07, 1));
      break;
    }
    case 'shade': {
      // It flickers, and more as it steps out behind its prey; its fragments drift and lag behind; it melts away when it dies.
      const flick = c === 2 ? 0.25 + 0.55 * Math.abs(Math.sin(t * 38 + m.id)) : 0.97 + Math.sin(t * 23 + m.id) * 0.03 - (hash(Math.floor(t * 12), m.id, 5) > 0.94 ? 0.55 : 0);
      const fade = m.dead ? Math.max(0, 1 - m.deathTime * 2.2) : 1;
      for (const p of parts) {
        const base = p.def.alpha ?? 1;
        for (const mat of p.mats) mat.opacity = Math.max(0, Math.min(1, base * flick * fade));
      }
      each('wisp', (p, i) => {
        const a = p.def.at;
        p.mesh.position.set(a[0] + Math.sin(t * 0.9 + i * 2.3 + m.id) * 0.1, a[1] + Math.sin(t * 1.3 + i * 1.7) * 0.12, a[2] + Math.cos(t * 0.8 + i * 1.1) * 0.1 + moving * 0.45);
        p.mesh.rotation.y += dt * (1 + i * 0.3);
      });
      each('tatter', (p, i) => rot(p, 'x', -(0.1 + moving * 0.7) + Math.sin(t * 4 + i * 1.9) * 0.1, 1));
      break;
    }
  }
}
