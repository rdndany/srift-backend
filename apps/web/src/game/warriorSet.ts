import * as THREE from 'three';
import type { OutfitDef } from '@solrift/shared';
import { DEG, SetBuilder, hex, jitter, lerp, lit, paint16, rgbs, trimTexture, type RGB, type SetCtx, type SetRig, type SparkKind, type V3 } from './setKit';

/**
 * The Warrior's sets, in the manner of the glowing sets of MU Online. Each is a full suit of plate built from blocks at the scale of the skin (see
 * `mageGear.ts`): a helm with horns, antlers, a crown or a spire, pauldrons with spikes, a breastplate with a gem and glowing seams, a belt and faulds,
 * bracers, greaves and boots, and on the back curved blades like wings. Over it lives its light (see `setKit.ts`).
 */

type Helm = 'horns' | 'antlers' | 'crown' | 'spire' | 'fins' | 'halo';

interface Style {
  /** The plate: its lights and its shadows. */
  metal: [RGB, RGB];
  helm: Helm;
  /** 1 is the usual size of the helm's crest. */
  helmSize: number;
  /** Spikes on each pauldron, and the length of the longest (blocks). */
  spikes: number;
  spikeLen: number;
  /** Blades of the wings on each side, the length of the longest (blocks) and how far they curl. */
  blades: number;
  bladeLen: number;
  curl: number;
  sparks: SparkKind;
  count: number;
  /** Rings of runes on the ground. */
  /** How strong the halo behind the figure is (0..1). */
  halo: number;
  height: number;
  extent: number;
}

const STYLES: Record<string, Style> = {
  mossback: { metal: [[172, 144, 88], [60, 76, 44]], helm: 'antlers', helmSize: 1, spikes: 2, spikeLen: 0.22, blades: 2, bladeLen: 0.81, curl: 0.2, sparks: 'leaves', count: 16, halo: 0.22, height: 0.55, extent: 0.5 },
  'dusk-wanderer': { metal: [[182, 166, 220], [58, 46, 98]], helm: 'spire', helmSize: 1, spikes: 1, spikeLen: 0.3, blades: 2, bladeLen: 0.86, curl: 0.22, sparks: 'orbit', count: 16, halo: 0.25, height: 0.7, extent: 0.55 },
  frostbound: { metal: [[230, 244, 252], [92, 126, 162]], helm: 'crown', helmSize: 1, spikes: 3, spikeLen: 0.2, blades: 2, bladeLen: 0.78, curl: 0.18, sparks: 'snow', count: 18, halo: 0.25, height: 0.5, extent: 0.5 },
  'crimson-warden': { metal: [[172, 174, 186], [46, 40, 54]], helm: 'horns', helmSize: 0.9, spikes: 3, spikeLen: 0.3, blades: 3, bladeLen: 1.19, curl: 0.26, sparks: 'flames', count: 26, halo: 0.32, height: 0.8, extent: 0.85 },
  sunforged: { metal: [[255, 228, 134], [150, 100, 30]], helm: 'halo', helmSize: 1, spikes: 3, spikeLen: 0.3, blades: 3, bladeLen: 1.24, curl: 0.2, sparks: 'rise', count: 26, halo: 0.36, height: 0.85, extent: 0.9 },
  tidecaller: { metal: [[222, 246, 240], [38, 108, 120]], helm: 'fins', helmSize: 1, spikes: 2, spikeLen: 0.26, blades: 3, bladeLen: 1.16, curl: 0.3, sparks: 'bubbles', count: 24, halo: 0.32, height: 0.7, extent: 0.85 },
  voidwalker: { metal: [[124, 98, 156], [24, 16, 38]], helm: 'horns', helmSize: 1.25, spikes: 4, spikeLen: 0.4, blades: 5, bladeLen: 1.59, curl: 0.3, sparks: 'inward', count: 40, halo: 0.46, height: 1.1, extent: 1.2 },
  'hollow-livery': { metal: [[242, 234, 216], [98, 90, 80]], helm: 'crown', helmSize: 1.4, spikes: 4, spikeLen: 0.38, blades: 5, bladeLen: 1.51, curl: 0.25, sparks: 'flames', count: 44, halo: 0.46, height: 1.05, extent: 1.15 },
};

export const WARRIOR_STYLE_IDS: readonly string[] = Object.keys(STYLES);

/** Plate: panels eight pixels across lit from the top left, a bevel, rivets, and in every other panel a groove of the set's own light. */
function plateTexture(def: OutfitDef, st: Style): THREE.CanvasTexture {
  const [light, dark] = st.metal;
  const glow = hex(def.glow);
  return paint16(`plate:${def.id}`, (x, y) => {
    const px = x % 8;
    const py = y % 8;
    let c = lerp(light, dark, 0.15 + 0.5 * Math.pow((px + py) / 14, 1.2));
    c = jitter(c, x, y, 41, 5);
    if (px === 0 || py === 0) c = lerp(c, [255, 252, 244], 0.18);
    else if (px === 7 || py === 7) c = lerp(c, [16, 14, 30], 0.26);
    if (px === 2 && py === 2 && ((x >> 3) + (y >> 3)) % 2 === 0) c = lerp(light, [255, 255, 255], 0.7);
    // The groove: a line of light through the middle of every other panel.
    if (((x >> 3) + (y >> 3)) % 2 === 1 && py === 4 && px > 0 && px < 7) c = lerp(c, glow, 0.85);
    else if (((x >> 3) + (y >> 3)) % 2 === 1 && (py === 3 || py === 5) && px > 1 && px < 6) c = lerp(c, glow, 0.25);
    return rgbs(c);
  });
}

/** Cloth under the plate (the tabard, the hem): folds in the set's own colour. */
function clothTexture(def: OutfitDef): THREE.CanvasTexture {
  const base = hex(def.shirt);
  return paint16(`cloth:${def.id}`, (x, y) => {
    const f = [0, 0.3, 0.62, 0.92][x % 4];
    let c = lerp([base[0] * 0.42, base[1] * 0.42, base[2] * 0.42], [Math.min(255, base[0] * 1.15), Math.min(255, base[1] * 1.15), Math.min(255, base[2] * 1.15)], f);
    if ((x + y) % 2 === 0) c = lerp(c, [0, 0, 0], 0.06);
    return rgbs(jitter(c, x, y, 43, 8));
  });
}

/** What the skin needs to know of a set: the metal its plate is painted in. */
export function warriorLook(id: string): { metal: [RGB, RGB] } {
  return { metal: (STYLES[id] ?? STYLES.mossback).metal };
}

/**
 * The suit is painted on the body (see `outfitSkin.ts`): plate, belt, tabard, greaves are the colours of the skin. What is built of blocks is only what
 * stands clear of it, and every one of those rests on the body with its back flat against it (a face that looks into the body is never drawn, so it cannot
 * fight another for the same pixels): the gems and buckle, the lights at the wrists and ankles, the tabard on the thighs, the pauldrons, the crest of the
 * helm, the wings.
 */
export function dressWarrior(ctx: SetCtx, def: OutfitDef): SetRig {
  const st = STYLES[def.id] ?? STYLES.mossback;
  const b = new SetBuilder(ctx, def);
  const { core, edge, gem, t, head } = b;
  const plate = lit(`plate:${def.id}`, () => plateTexture(def, st));
  const cloth = lit(`cloth:${def.id}`, () => clothTexture(def));
  const trim = lit(`trim:${def.id}`, () => trimTexture(def));
  const { put, chain } = { put: b.put.bind(b), chain: b.chain.bind(b) };

  // ---- the breast: a gem in a gold setting where the painted stone is, and a gem on the back; the buckle of the belt.
  put(t, trim, [0.15, 0.15, 0.016], [0, 1.25, -0.133]);
  put(t, gem, [0.09, 0.09, 0.03], [0, 1.25, -0.156]);
  put(t, trim, [0.15, 0.1, 0.02], [0, 0.906, -0.135]);
  put(t, gem, [0.06, 0.06, 0.03], [0, 0.906, -0.16]);
  put(t, gem, [0.07, 0.07, 0.03], [0, 1.28, 0.14]);

  // ---- the tabard: cloth that hangs from the belt, in front and behind, a piece on each leg so it moves with the leg and never goes into it.
  for (const leg of [ctx.legL, ctx.legR]) {
    put(leg, cloth, [0.245, 0.22, 0.036], [0, -0.11, -0.143]);
    put(leg, trim, [0.245, 0.024, 0.04], [0, -0.232, -0.145]);
    put(leg, cloth, [0.245, 0.26, 0.036], [0, -0.13, 0.143]);
    // The knee: a cop with a spike, and the light of the greave.
    put(leg, plate, [0.23, 0.11, 0.036], [0, -0.285, -0.143]);
    chain(leg, plate, core, [0, -0.285, -0.16], [-1.45, 0, 0], 2, 0.13, 0.08, 0.02, 0.07, [0.1, 0, 0]);
    put(leg, edge, [0.262, 0.026, 0.262], [0, -0.531, 0]);
  }

  // ---- the helm: painted on the head; a gem at the brow and a cheek-light, and its crest.
  put(head, trim, [0.12, 0.07, 0.016], [0, 0.344, -0.258]);
  put(head, gem, [0.06, 0.06, 0.02], [0, 0.344, -0.274]);
  const hs = st.helmSize;
  if (st.helm === 'horns' || st.helm === 'antlers') {
    for (const s of [-1, 1]) {
      const root: V3 = [s * 0.27, 0.4, 0];
      if (st.helm === 'horns') {
        // A great horn sweeps out, up and then in, and a short one grows from under it.
        chain(head, plate, edge, root, [0, 0, -s * 62 * DEG], 6, 0.62 * hs, 0.13, 0.03, 0.1, [0, 0, s * 17 * DEG], s);
        chain(head, plate, null, [s * 0.27, 0.3, -0.02], [0.3, 0, -s * 100 * DEG], 3, 0.24 * hs, 0.08, 0.03, 0.08, [0, 0, s * 14 * DEG]);
      } else {
        // An antler: a beam that rises and bends, and three tines off it.
        chain(head, plate, null, root, [-0.12, 0, -s * 20 * DEG], 5, 0.6, 0.08, 0.035, 0.08, [0.05, 0, s * 9 * DEG], s);
        chain(head, plate, core, [s * 0.32, 0.6, -0.02], [-0.2, 0, -s * 62 * DEG], 3, 0.26, 0.05, 0.02, 0.06, [0, 0, s * 8 * DEG], s);
        chain(head, plate, core, [s * 0.38, 0.74, 0.02], [-0.1, 0, -s * 56 * DEG], 3, 0.3, 0.05, 0.02, 0.06, [0, 0, s * 8 * DEG], s);
        chain(head, plate, core, [s * 0.34, 0.5, 0.0], [0.15, 0, -s * 78 * DEG], 3, 0.2, 0.05, 0.02, 0.06, [0, 0, s * 8 * DEG], s);
      }
    }
    // A crest down the middle, between the horns: a comb of plates that stand on the crown.
    if (st.helm === 'horns') for (let i = 0; i < 4; i++) put(head, plate, [0.06, 0.1 + 0.05 * (i === 1 || i === 2 ? 1 : 0), 0.1], [0, 0.55 + 0.02 * i, -0.18 + i * 0.12]);
  } else if (st.helm === 'crown') {
    const n = hs > 1.2 ? 7 : 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = Math.sin(a) * 0.26;
      const pz = Math.cos(a) * 0.26;
      const tall = (0.2 + (i % 2 === 0 ? 0.16 : 0)) * hs;
      chain(head, trim, core, [px, 0.5, pz], [Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3], 3, tall, 0.1, 0.02, 0.1, [0, 0, 0], 1);
    }
    put(head, trim, [0.58, 0.05, 0.58], [0, 0.505, 0]);
    put(head, gem, [0.07, 0.07, 0.04], [0, 0.505, -0.3]);
  } else if (st.helm === 'spire') {
    chain(head, plate, core, [0, 0.5, 0.02], [-0.2, 0, 0], 6, 0.62, 0.2, 0.025, 0.12, [0.07, 0, 0], 1);
    for (const s of [-1, 1]) chain(head, plate, edge, [s * 0.26, 0.46, 0.1], [0.2, 0, -s * 32 * DEG], 4, 0.34, 0.1, 0.02, 0.06, [0, 0, s * 7 * DEG], s);
  } else if (st.helm === 'fins') {
    // A fin along the top, tall at the front and falling to the back, and a pair of wide ones at the temples.
    for (let i = 0; i < 6; i++) put(head, plate, [0.05, 0.34 * (1 - i * 0.13), 0.12], [0, 0.5 + 0.17 * (1 - i * 0.13), -0.22 + i * 0.1]);
    for (const s of [-1, 1]) {
      chain(head, plate, edge, [s * 0.27, 0.3, 0.05], [0.1, 0, -s * 70 * DEG], 4, 0.4, 0.14, 0.04, 0.04, [0, 0, s * 10 * DEG], s);
      chain(head, plate, edge, [s * 0.27, 0.2, 0.08], [0.25, 0, -s * 95 * DEG], 3, 0.3, 0.1, 0.03, 0.04, [0, 0, s * 10 * DEG], s);
    }
  } else if (st.helm === 'halo') {
    // A crown of rays and, above the head, a ring of light that turns.
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      chain(head, trim, core, [Math.sin(a) * 0.27, 0.5, Math.cos(a) * 0.27], [Math.cos(a) * 0.45, 0, -Math.sin(a) * 0.45], 3, 0.22, 0.07, 0.02, 0.07, [0, 0, 0], 1);
    }
    put(head, trim, [0.58, 0.05, 0.58], [0, 0.505, 0]);
  }

  // ---- the pauldrons: stacked plates that narrow toward the neck (the inner edge stays outside the shoulder, clear of the neck and the helm), a gold rim, a
  // plate that hangs on the outside, and spikes that fan out and up; at the wrists a ring of light.
  for (const [arm, s] of [[ctx.armL, -1], [ctx.armR, 1]] as const) {
    put(arm, plate, [0.3, 0.075, 0.34], [s * 0.06, 0.0375, 0]);
    put(arm, plate, [0.26, 0.06, 0.3], [s * 0.075, 0.105, 0]);
    put(arm, plate, [0.22, 0.05, 0.26], [s * 0.09, 0.16, 0]);
    put(arm, trim, [0.31, 0.02, 0.35], [s * 0.06, 0, 0]);
    put(arm, plate, [0.04, 0.22, 0.3], [s * 0.145, -0.1, 0]);
    put(arm, edge, [0.012, 0.17, 0.25], [s * 0.1675, -0.1, 0]);
    for (let i = 0; i < st.spikes; i++) {
      const f = st.spikes === 1 ? 0.5 : i / (st.spikes - 1);
      const z = -0.12 + f * 0.24;
      const lean = 18 + f * 40;
      const len = st.spikeLen * (0.7 + 0.3 * Math.sin(f * Math.PI));
      chain(arm, plate, core, [s * 0.1, 0.17, z], [(f - 0.5) * 0.9, 0, -s * lean * DEG], 3, len, 0.09, 0.02, 0.09, [0, 0, s * 9 * DEG], s);
    }
    put(arm, edge, [0.262, 0.026, 0.262], [0, -0.594, 0]);
  }

  // ---- the wings: curved blades fanned out from the shoulder blades, each with a lit edge; they open and close a little with the clock.
  if (st.blades > 0) {
    b.wings({ at: [0.1, 1.38, 0.15], blades: st.blades, len: st.bladeLen, curl: st.curl, spread: [28 + (st.blades > 3 ? 8 : 0), 90 + (st.blades > 3 ? 8 : 0)], sweep: [0.5 * (st.blades > 3 ? 1 : 1.1), 0.28 * (st.blades > 3 ? 1 : 1.1)], mat: plate, base: trim, edge, spine: core, width: 0.15 });
  }

  b.halo(st.halo);
  b.sparks(st.sparks, st.count);
  return b.finish(st.height, st.extent);
}
