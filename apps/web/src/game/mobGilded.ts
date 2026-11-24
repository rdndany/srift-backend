import type { GildedKind } from '@solrift/shared';
import { AURELION_SKINS, aurelionRig } from './mobAurelion';
import { eyes, hash, jit, mul, plain, withFeatures, type Painter, type Part, type RGB } from './mobPaint';

/**
 * The five monsters of the Gilded Tide (see invasion.ts in the shared package): their skins (16x16 painters) and their rigs (lists of boxes).
 * All of them are gold: bright, bevelled plates over dark bronze, with eyes that shine by themselves, so a tide of them reads from afar.
 *
 *   gilt_imp       a small hunched goblin with big ears, a sack of coins on its back and a grin full of fangs
 *   gilt_hound     a lean, long-legged hound with a golden mane of spikes down its back
 *   gilt_drake     an upright lizard with a crest, a long tail, a row of spines and claws
 *   gilt_colossus  a towering golem of gold plate, crowned, with a glowing coin-heart and fists like anvils
 *
 * King Aurelion is still drawn (see mobAurelion.ts) but the Tide no longer brings him.
 */

const patchy =
  (a: RGB, b: RGB, seed: number, sh = 1, thr = 0.5, amt = 8): Painter =>
  (x, y) =>
    jit(hash(x >> sh, y >> sh, seed) > thr ? a : b, amt, x, y, seed + 1);

/** A lit top-left edge and a shaded bottom-right one, so that a box reads as a block. */
const bevel =
  (p: Painter, k = 0.2): Painter =>
  (x, y) =>
    mul(p(x, y), x === 0 || y === 0 ? 1 + k : x === 15 || y === 15 ? 1 - k : 1);

const GILD: Record<string, Painter> = {};

GILD.gd_gold = bevel(patchy([240, 196, 66], [212, 164, 44], 501), 0.2);
GILD.gd_gold2 = bevel(patchy([252, 224, 112], [236, 198, 82], 503), 0.16);
GILD.gd_bronze = bevel(patchy([124, 86, 40], [94, 64, 32], 505), 0.18);
GILD.gd_dark = bevel(patchy([56, 42, 38], [40, 30, 28], 507, 1, 0.5, 5), 0.15);
GILD.gd_crimson = (x, y) => mul(jit([128, 24, 46], 8, x, y, 509), x % 5 === 0 ? 0.78 : 1);
GILD.gd_ivory = plain([236, 226, 196], 8, 511);
GILD.gd_sack = bevel(patchy([156, 108, 62], [128, 88, 50], 513), 0.14);
GILD.gd_eye = (x, y) => jit(Math.hypot(x - 7.5, y - 7.5) < 4 ? [255, 250, 190] : [255, 214, 80], 8, x, y, 515);
GILD.gd_gem = (x, y) => jit(Math.hypot(x - 7.5, y - 7.5) < 4.5 ? [255, 120, 120] : [200, 36, 60], 8, x, y, 517);
GILD.gd_orb = (x, y) => {
  const d = Math.hypot(x - 7.5, y - 7.5) / 8;
  return jit(d < 0.45 ? [255, 250, 200] : d < 0.8 ? [255, 214, 90] : [236, 150, 40], 8, x, y, 519);
};
GILD.gd_coin = (x, y) => {
  const d = Math.hypot(x - 7.5, y - 7.5);
  if (d > 7.4) return jit([150, 108, 30], 6, x, y, 521);
  if (d > 5.6) return jit([252, 220, 100], 6, x, y, 522);
  if (Math.abs(x - 7.5) < 1.2 && Math.abs(y - 7.5) < 4) return jit([176, 124, 30], 6, x, y, 523);
  return jit([238, 192, 60], 8, x, y, 524);
};
GILD.gd_cloth = (x, y) => (hash(x >> 1, y, 525) > 0.85 ? jit([86, 14, 32], 8, x, y, 526) : jit([128, 24, 46], 10, x, y, 527));

const GRIN: [number, number, number, number, RGB][] = [
  [4, 11, 11, 12, [40, 20, 12]],
  [5, 12, 5, 13, [236, 226, 196]],
  [8, 12, 8, 13, [236, 226, 196]],
  [10, 12, 10, 13, [236, 226, 196]],
];
const EYE: RGB = [255, 250, 170];

GILD.gd_imp_face = withFeatures(GILD.gd_gold!, [...eyes(5, 7, EYE, 3, 5), [4, 4, 5, 4, [60, 34, 12]], [10, 4, 11, 4, [60, 34, 12]], ...GRIN]);
GILD.gd_hound_face = withFeatures(GILD.gd_gold!, [...eyes(4, 6, EYE, 3, 5), [6, 9, 9, 11, [40, 24, 14]]]);
GILD.gd_drake_face = withFeatures(GILD.gd_gold!, [...eyes(4, 6, EYE, 2, 5), [5, 11, 10, 11, [40, 24, 14]], [5, 12, 5, 13, [236, 226, 196]], [10, 12, 10, 13, [236, 226, 196]]]);
GILD.gd_golem_face = withFeatures(GILD.gd_gold2!, [[2, 4, 6, 7, [40, 30, 20]], [9, 4, 13, 7, [40, 30, 20]], [3, 5, 5, 6, EYE], [10, 5, 12, 6, EYE], [5, 11, 10, 12, [50, 36, 24]]]);

export const GILDED_SKINS: Record<string, Painter> = { ...GILD, ...AURELION_SKINS };

// ---- rigs ----------------------------------------------------------------------------------------------------------------

/** A small goblin: it runs hunched with its fists up. */
function impRig(): Part[] {
  const p: Part[] = [];
  for (const s of [-1, 1]) p.push({ size: [0.16, 0.4, 0.18], at: [s * 0.12, 0.4, 0], skin: 'gd_bronze', hang: true, swing: s });
  p.push({ size: [0.4, 0.4, 0.28], at: [0, 0.62, 0], skin: 'gd_gold', rotX: 0.15 });
  p.push({ size: [0.44, 0.1, 0.3], at: [0, 0.44, 0], skin: 'gd_dark', flat: true }); // a belt
  // The sack of coins on its back, with a coin showing.
  p.push({ size: [0.3, 0.3, 0.2], at: [0, 0.7, 0.24], skin: 'gd_sack', rotX: 0.15 });
  p.push({ size: [0.12, 0.12, 0.04], at: [0.04, 0.82, 0.35], skin: 'gd_coin', flat: true });
  const head = p.push({ size: [0.46, 0.4, 0.4], at: [0, 0.98, -0.06], skin: 'gd_gold', front: 'gd_imp_face', isHead: true }) - 1;
  // Big pointed ears.
  for (const s of [-1, 1]) p.push({ size: [0.22, 0.1, 0.06], at: [s * 0.3, 0.06, 0.02], skin: 'gd_gold2', of: head, flat: true, rotZ: -s * 0.45 });
  for (const s of [-1, 1]) {
    const arm = p.push({ size: [0.12, 0.34, 0.12], at: [s * 0.27, 0.8, -0.02], skin: 'gd_bronze', hang: true, swing: s * 0.6, rotX: 0.5, strike: 1 }) - 1;
    p.push({ size: [0.16, 0.14, 0.16], at: [0, -0.3, 0], skin: 'gd_gold2', hang: true, of: arm, flat: true });
  }
  return p;
}

/** A lean hound on four long legs, with a mane of golden spikes. */
function houndRig(): Part[] {
  const p: Part[] = [];
  const legs: [number, number, number][] = [[-0.16, -0.32, 1], [0.16, -0.32, -1], [-0.16, 0.34, -1], [0.16, 0.34, 1]];
  for (const [x, z, s] of legs) p.push({ size: [0.14, 0.46, 0.14], at: [x, 0.46, z], skin: 'gd_bronze', hang: true, swing: s });
  p.push({ size: [0.42, 0.4, 0.98], at: [0, 0.64, 0], skin: 'gd_gold' });
  p.push({ size: [0.44, 0.16, 0.5], at: [0, 0.5, 0.2], skin: 'gd_dark', flat: true });
  // The mane: spikes down the spine.
  for (let i = 0; i < 5; i++) p.push({ size: [0.08, 0.2, 0.1], at: [0, 0.92, -0.36 + i * 0.2], skin: 'gd_gold2', flat: true, rotX: 0.25 });
  const head = p.push({ size: [0.38, 0.36, 0.4], at: [0, 0.82, -0.56], skin: 'gd_gold', front: 'gd_hound_face', isHead: true }) - 1;
  p.push({ size: [0.2, 0.16, 0.26], at: [0, -0.08, -0.3], skin: 'gd_gold2', of: head, flat: true }); // the snout
  for (const s of [-1, 1]) p.push({ size: [0.1, 0.18, 0.06], at: [s * 0.14, 0.26, 0.04], skin: 'gd_gold2', of: head, flat: true, rotZ: -s * 0.2 });
  p.push({ size: [0.1, 0.1, 0.5], at: [0, 0.8, 0.56], skin: 'gd_gold', flat: true, rotX: -0.7 }); // the tail
  p.push({ size: [0.14, 0.14, 0.14], at: [0, 1.04, 0.84], skin: 'gd_orb', flat: true, glow: true, pulse: 0.3 });
  return p;
}

/** An upright lizard: crest, spines, a long tail and claws. */
function drakeRig(): Part[] {
  const p: Part[] = [];
  for (const s of [-1, 1]) {
    const thigh = p.push({ size: [0.26, 0.5, 0.3], at: [s * 0.22, 0.94, 0.04], skin: 'gd_gold', hang: true, swing: s }) - 1;
    const shin = p.push({ size: [0.2, 0.46, 0.24], at: [0, -0.46, 0.04], skin: 'gd_bronze', hang: true, of: thigh, bend: 0.8 }) - 1;
    p.push({ size: [0.26, 0.1, 0.4], at: [0, -0.4, -0.1], skin: 'gd_dark', hang: true, of: shin, flat: true });
  }
  p.push({ size: [0.7, 0.5, 0.5], at: [0, 1.1, 0.04], skin: 'gd_gold', rotX: 0.2 });
  p.push({ size: [0.64, 0.5, 0.46], at: [0, 1.5, -0.04], skin: 'gd_gold2', rotX: 0.28 });
  p.push({ size: [0.5, 0.36, 0.06], at: [0, 1.44, -0.3], skin: 'gd_bronze', flat: true, rotX: 0.28 }); // the belly plates
  // The tail: three tapering boxes behind it.
  p.push({ size: [0.3, 0.28, 0.5], at: [0, 1.0, 0.5], skin: 'gd_gold', rotX: -0.12 });
  p.push({ size: [0.22, 0.2, 0.5], at: [0, 0.94, 0.95], skin: 'gd_bronze', rotX: -0.05 });
  p.push({ size: [0.14, 0.14, 0.45], at: [0, 0.9, 1.36], skin: 'gd_gold2', flat: true });
  // Spines down the back.
  for (let i = 0; i < 4; i++) p.push({ size: [0.07, 0.22, 0.09], at: [0, 1.5 - i * 0.14 + (i > 1 ? 0.0 : 0.1), 0.2 + i * 0.1], skin: 'gd_gold2', flat: true, rotX: -0.3 });
  const head = p.push({ size: [0.4, 0.38, 0.42], at: [0, 1.88, -0.26], skin: 'gd_gold', front: 'gd_drake_face', isHead: true }) - 1;
  p.push({ size: [0.28, 0.2, 0.34], at: [0, -0.1, -0.34], skin: 'gd_gold2', of: head, flat: true }); // the snout
  for (const s of [-1, 1]) p.push({ size: [0.06, 0.3, 0.06], at: [s * 0.14, 0.3, 0.08], skin: 'gd_ivory', of: head, flat: true, rotX: -0.5 }); // a crest of horns
  p.push({ size: [0.08, 0.26, 0.08], at: [0, 0.3, 0.1], skin: 'gd_gold2', of: head, flat: true, rotX: -0.4 });
  for (const s of [-1, 1]) {
    const arm = p.push({ size: [0.18, 0.5, 0.2], at: [s * 0.46, 1.7, -0.06], skin: 'gd_gold', hang: true, swing: s * 0.4, rotX: 0.7, strike: 1, raise: 0.5 }) - 1;
    for (const c of [-1, 0, 1]) p.push({ size: [0.05, 0.22, 0.05], at: [c * 0.06, -0.46, -0.06], skin: 'gd_ivory', hang: true, of: arm, flat: true, rotX: -0.3 });
  }
  return p;
}

/**
 * A towering golem of gold plate: thick legs, a coin-studded chest with a glowing heart, heavy pauldrons, a crowned head and anvils for fists.
 * Tall enough to read from afar as the rare prize of the Tide.
 */
function colossusRig(): Part[] {
  const p: Part[] = [];
  for (const s of [-1, 1]) {
    const leg = p.push({ size: [0.78, 1.55, 0.8], at: [s * 0.5, 1.55, 0], skin: 'gd_gold', hang: true, swing: s * 0.8 }) - 1;
    p.push({ size: [0.9, 0.34, 1.0], at: [0, -1.4, -0.04], skin: 'gd_bronze', hang: true, of: leg, flat: true }); // the foot
    p.push({ size: [0.86, 0.14, 0.86], at: [0, -0.55, 0], skin: 'gd_gold2', hang: true, of: leg, flat: true }); // a shin band
    p.push({ size: [0.55, 0.5, 0.06], at: [0, -0.4, -0.42], skin: 'gd_dark', of: leg, flat: true });
  }
  p.push({ size: [1.65, 0.55, 0.95], at: [0, 1.75, 0], skin: 'gd_bronze' }); // the hips
  p.push({ size: [1.85, 1.7, 1.1], at: [0, 2.75, 0], skin: 'gd_gold' }); // the chest
  p.push({ size: [1.15, 1.05, 0.1], at: [0, 2.85, -0.58], skin: 'gd_gold2', flat: true }); // a plate on the chest
  // A mosaic of coins across the breastplate.
  for (const [x, y] of [
    [-0.38, 3.2],
    [0.38, 3.2],
    [0, 2.95],
    [-0.38, 2.7],
    [0.38, 2.7],
    [0, 2.45],
    [-0.2, 3.4],
    [0.2, 3.4],
  ] as const)
    p.push({ size: [0.28, 0.28, 0.05], at: [x, y, -0.64], skin: 'gd_coin', flat: true });
  // The glowing heart of the Tide: a coin-orb set in the chest.
  p.push({ size: [0.42, 0.42, 0.12], at: [0, 2.85, -0.66], skin: 'gd_orb', flat: true, glow: true, pulse: 0.45 });
  p.push({ size: [1.0, 1.0, 0.1], at: [0, 2.85, 0.58], skin: 'gd_dark', flat: true });
  // A short crimson sash under the plate.
  p.push({ size: [0.7, 0.55, 0.08], at: [0, 2.05, -0.58], skin: 'gd_cloth', flat: true });
  const head = p.push({ size: [0.78, 0.76, 0.78], at: [0, 3.85, -0.04], skin: 'gd_gold2', front: 'gd_golem_face', isHead: true }) - 1;
  p.push({ size: [0.9, 0.14, 0.9], at: [0, 0.42, 0], skin: 'gd_bronze', of: head, flat: true }); // a brow ridge
  // A crown of gold spikes.
  for (const s of [-1, 0, 1]) p.push({ size: [0.1, 0.32 + (s === 0 ? 0.1 : 0), 0.1], at: [s * 0.22, 0.55, -0.1], skin: 'gd_gold2', of: head, flat: true });
  for (const s of [-1, 1]) p.push({ size: [0.1, 0.22, 0.1], at: [s * 0.34, 0.5, 0.1], skin: 'gd_gold2', of: head, flat: true });
  // A floating gold orb above the crown (reads from afar).
  p.push({ size: [0.22, 0.22, 0.22], at: [0, 0.9, 0], skin: 'gd_orb', of: head, flat: true, glow: true, pulse: 0.55 });
  for (const s of [-1, 1]) {
    p.push({ size: [0.78, 0.58, 0.95], at: [s * 1.18, 3.5, 0], skin: 'gd_gold2', flat: true, rotZ: s * 0.18 }); // pauldron
    p.push({ size: [0.35, 0.2, 0.55], at: [s * 1.45, 3.7, 0], skin: 'gd_bronze', flat: true, rotZ: s * 0.25 }); // a horn of the pauldron
    const arm = p.push({ size: [0.66, 1.6, 0.66], at: [s * 1.22, 3.3, 0], skin: 'gd_gold', hang: true, swing: s * 0.6, rotX: 0.18, strike: 1, raise: 0.6 }) - 1;
    p.push({ size: [0.72, 0.14, 0.72], at: [0, -0.7, 0], skin: 'gd_gold2', hang: true, of: arm, flat: true }); // a cuff
    p.push({ size: [0.92, 0.88, 0.92], at: [0, -1.55, -0.02], skin: 'gd_bronze', hang: true, of: arm }); // the fist
    p.push({ size: [0.98, 0.14, 0.98], at: [0, -1.12, 0], skin: 'gd_gold2', hang: true, of: arm, flat: true });
    p.push({ size: [0.2, 0.2, 0.2], at: [0, -1.7, -0.4], skin: 'gd_gem', hang: true, of: arm, flat: true, glow: true }); // a gem in the knuckles
  }
  return p;
}

export const GILDED_RIGS: Record<GildedKind, Part[]> = {
  gilt_imp: impRig(),
  gilt_hound: houndRig(),
  gilt_drake: drakeRig(),
  gilt_colossus: colossusRig(),
};

/** King Aurelion's rig, kept for admin spawns and tests (the Tide no longer brings him). */
export const AURELION_RIG = aurelionRig();
