import * as THREE from 'three';
import type { OutfitDef } from '@solrift/shared';
import { DEG, SetBuilder, hex, jitter, lerp, lit, noise, paint16, rgbs, scale, trimTexture, type OrbiterSpec, type RGB, type SetCtx, type SetRig, type SparkKind } from './setKit';

/**
 * The Mage's sets: long robes in cloth that has stars, flames or runes worked into it, with a sash, a hem of light and sleeves that open like bells; a
 * hat, hood, circlet or crown; a collar, a cloak or a mantle; and, over it all, the magic: balls of light that float round
 * it, fire, and light that rises, falls or is drawn in.
 */

type Hat = 'witch' | 'mitre' | 'hood' | 'circlet' | 'skull';
type Pattern = 'stars' | 'flames' | 'runes' | 'frost' | 'bands' | 'veins' | 'cosmos';
type Mantle = 'none' | 'cape' | 'blades' | 'tatter';

interface Style {
  hat: Hat;
  /** Horns that sweep back from the hat or the hood. */
  horns?: number;
  /** A crest of flame (hood). */
  flames?: boolean;
  /** 1 is the usual size of the hat. */
  hatSize: number;
  /** 0: none, 1: a collar behind the neck, 2: a tall one with a lit edge. */
  collar: 0 | 1 | 2;
  mantle: Mantle;
  pattern: Pattern;
  orbit?: OrbiterSpec;
  /** A second set of floating shapes (a crown of shards above the head). */
  orbit2?: OrbiterSpec;
  sparks: SparkKind;
  count: number;
  halo: number;
  height: number;
  extent: number;
}


const STYLES: Record<string, Style> = {
  starweaver: {
    hat: 'witch', hatSize: 1, collar: 0, mantle: 'cape', pattern: 'stars',
    orbit: { count: 5, radius: 0.72, y: 1.2, size: 0.07, speed: 0.9, bob: 0.1 },
    sparks: 'orbit', count: 14, halo: 0.25, height: 0.85, extent: 0.7,
  },
  emberrobe: {
    hat: 'hood', flames: true, hatSize: 1, collar: 1, mantle: 'none', pattern: 'flames',
    orbit: { count: 3, radius: 0.7, y: 1.1, size: 0.075, speed: 1.1, bob: 0.12 },
    sparks: 'flames', count: 24, halo: 0.3, height: 0.85, extent: 0.6,
  },
  wintermoon: {
    hat: 'circlet', hatSize: 1, collar: 1, mantle: 'cape', pattern: 'frost',
    sparks: 'snow', count: 20, halo: 0.25, height: 0.5, extent: 0.9,
  },
  stormcaller: {
    hat: 'hood', horns: 1, hatSize: 1, collar: 2, mantle: 'none', pattern: 'bands',
    orbit: { count: 4, radius: 0.85, y: 1.3, size: 0.08, speed: -1.0, bob: 0.14 },
    sparks: 'arcs', count: 22, halo: 0.32, height: 0.9, extent: 1.0,
  },
  runekeeper: {
    hat: 'mitre', hatSize: 1, collar: 2, mantle: 'cape', pattern: 'runes',
    sparks: 'rise', count: 28, halo: 0.34, height: 1.1, extent: 1.1,
  },
  sanguine: {
    hat: 'witch', horns: 1, hatSize: 1.1, collar: 1, mantle: 'blades', pattern: 'veins',
    sparks: 'petals', count: 28, halo: 0.3, height: 1.0, extent: 1.0,
  },
  aetherlord: {
    hat: 'circlet', hatSize: 1, collar: 2, mantle: 'cape', pattern: 'cosmos',
    orbit: { count: 7, radius: 0.4, y: 2.3, size: 0.075, speed: 0.8, bob: 0.06 },
    orbit2: { count: 4, radius: 0.95, y: 1.3, size: 0.07, speed: -0.6, bob: 0.2, tilt: 0.4 },
    sparks: 'inward', count: 44, halo: 0.46, height: 1.25, extent: 1.3,
  },
  'lich-sovereign': {
    hat: 'skull', horns: 2, hatSize: 1.2, collar: 2, mantle: 'tatter', pattern: 'veins',
    orbit: { count: 5, radius: 0.9, y: 1.1, size: 0.085, speed: 0.7, bob: 0.2 },
    sparks: 'flames', count: 46, halo: 0.4, height: 1.1, extent: 1.2,
  },
};

export const MAGE_STYLE_IDS: readonly string[] = Object.keys(STYLES);

// ---- pictures ---------------------------------------------------------------------------------------------------------------

/** The robe: folds in the set's main colour, with a pattern worked into it. */
function robeTexture(def: OutfitDef, pattern: Pattern): THREE.CanvasTexture {
  const base = hex(def.shirt);
  const glow = hex(def.glow);
  const trim = hex(def.trim);
  return paint16(`robe:${def.id}`, (x, y) => {
    const f = [0, 0.3, 0.62, 0.92][x % 4];
    let c = lerp(scale(base, 0.45), scale(base, 1.2), f);
    if ((x + y) % 2 === 0) c = lerp(c, [0, 0, 0], 0.05);
    c = jitter(c, x, y, 51, 6);
    const star = (cx: number, cy: number, col: RGB): void => {
      if (x === cx && y === cy) c = col;
      else if ((Math.abs(x - cx) === 1 && y === cy) || (Math.abs(y - cy) === 1 && x === cx)) c = lerp(c, col, 0.5);
    };
    switch (pattern) {
      case 'stars':
        star(3, 3, trim);
        star(11, 9, trim);
        if (x === 7 && y === 14) c = lerp(c, trim, 0.9);
        if (x === 14 && y === 2) c = lerp(c, trim, 0.8);
        break;
      case 'flames':
        // Tongues of fire licking up from the hem of every block.
        if (y > 12 - ((x * 5) % 4)) c = lerp(c, y > 14 ? [255, 235, 150] : glow, 0.78);
        else if (y > 10 - ((x * 3) % 3)) c = lerp(c, glow, 0.25);
        break;
      case 'runes':
        if ((y === 4 && x % 8 >= 2 && x % 8 <= 5) || (x % 8 === 3 && y >= 4 && y <= 8) || (y === 8 && x % 8 >= 3 && x % 8 <= 5)) c = lerp(c, glow, 0.85);
        if (y === 13 && x % 4 !== 0) c = lerp(c, trim, 0.6);
        break;
      case 'frost':
        if ((x * 5 + y * 7) % 11 === 0) c = lerp(c, [255, 255, 255], 0.85);
        if (x % 8 === 0) c = lerp(c, [255, 255, 255], 0.25);
        break;
      case 'bands':
        if (y === 5 || y === 11) c = lerp(c, glow, 0.8);
        else if (y === 4 || y === 6 || y === 10 || y === 12) c = lerp(c, glow, 0.18);
        break;
      case 'veins':
        if ((x + y * 2) % 9 === 0 || (x * 2 + y) % 13 === 0) c = lerp(c, glow, 0.7);
        break;
      case 'cosmos': {
        c = lerp(c, [8, 6, 30], 0.35);
        const n = noise(x, y, 61);
        if (n > 0.9) c = lerp(c, [255, 255, 255], 0.9);
        else if (n > 0.8) c = lerp(c, glow, 0.7);
        if (y > 12) c = lerp(c, glow, 0.2 * (y - 12));
        break;
      }
    }
    return rgbs(c);
  });
}

/** The second cloth: the lining, the mantle, the inside of the sleeves. */
function liningTexture(def: OutfitDef): THREE.CanvasTexture {
  const base = hex(def.pants);
  return paint16(`lining:${def.id}`, (x, y) => {
    const f = [0, 0.3, 0.6, 0.9][x % 4];
    let c = lerp(scale(base, 0.5), scale(base, 1.5), f);
    if (y % 8 === 7) c = lerp(c, [0, 0, 0], 0.3);
    return rgbs(jitter(c, x, y, 53, 6));
  });
}

// ---- the set ----------------------------------------------------------------------------------------------------------------

export type MagePattern = Pattern;

/** What the skin needs to know of a set: the pattern of its robe, and whether its head is in a hood (painted, and over the hair). */
export function mageLook(id: string): { pattern: MagePattern; hood: boolean } {
  const st = STYLES[id] ?? STYLES.starweaver;
  return { pattern: st.pattern, hood: st.hat === 'hood' };
}

/**
 * The robe is painted on the body (see `outfitSkin.ts`): the bodice, the neckline, the sash, the sleeves and the cloth of the legs are the colours of
 * the skin. What is built of blocks is only what stands clear of it: the pieces of the skirt that hang on the legs (so they move with the stride and never
 * into the other leg), the bells of the sleeves, the caps on the shoulders, the collar, the cloak (kept narrower than the body, so an arm never swings
 * through it), the hat, the hood, the horns, and the magic.
 */
export function dressMageSet(ctx: SetCtx, def: OutfitDef): SetRig {
  const st = STYLES[def.id] ?? STYLES.starweaver;
  const b = new SetBuilder(ctx, def);
  const { core, edge, gem, t, head } = b;
  const robe = lit(`robe:${def.id}`, () => robeTexture(def, st.pattern));
  const lining = lit(`lining:${def.id}`, () => liningTexture(def));
  const trim = lit(`trim:${def.id}`, () => trimTexture(def));
  const put = b.put.bind(b);
  const chain = b.chain.bind(b);
  const hs = st.hatSize;

  // ---- the sash: a buckle with a gem where the painted one is, and a gem between the shoulder blades.
  put(t, trim, [0.15, 0.12, 0.02], [0, 0.906, -0.135]);
  put(t, gem, [0.07, 0.07, 0.03], [0, 0.906, -0.16]);
  put(t, gem, [0.06, 0.06, 0.03], [0, 1.2, 0.14]);

  // ---- the skirt: each leg wears a front and a back of the robe, to the painted hem, with a hem of metal and light. They hang on the leg, so they stir
  // with the stride and, being no wider than the leg, never meet.
  for (const leg of [ctx.legL, ctx.legR]) {
    for (const side of [-1, 1]) {
      put(leg, robe, [0.245, 0.54, 0.036], [0, -0.27, side * 0.143]);
      put(leg, trim, [0.245, 0.03, 0.04], [0, -0.545, side * 0.145]);
      put(leg, edge, [0.245, 0.012, 0.046], [0, -0.564, side * 0.145]);
    }
    put(leg, gem, [0.05, 0.05, 0.02], [0, -0.27, -0.168]);
  }

  // ---- sleeves that open like bells (the bell grows outward, away from the body), a cuff with a lit edge, and a cap on the shoulder.
  for (const [arm, s] of [[ctx.armL, -1], [ctx.armR, 1]] as const) {
    put(arm, robe, [0.33, 0.12, 0.33], [s * 0.05, -0.56, 0]);
    put(arm, trim, [0.34, 0.028, 0.34], [s * 0.05, -0.63, 0]);
    put(arm, edge, [0.35, 0.012, 0.35], [s * 0.05, -0.65, 0]);
    put(arm, robe, [0.34, 0.07, 0.34], [s * 0.05, 0.035, 0]);
    put(arm, trim, [0.35, 0.02, 0.35], [s * 0.05, 0, 0]);
  }

  // ---- the collar: stands up behind the neck and fans out; in the tall kind the edge is lit.
  if (st.collar > 0) {
    const tall = st.collar === 2;
    put(t, lining, [0.5, tall ? 0.46 : 0.28, 0.05], [0, tall ? 1.74 : 1.64, 0.3], [-0.2, 0, 0]);
    put(t, trim, [0.52, 0.03, 0.07], [0, tall ? 1.96 : 1.78, 0.355], [-0.2, 0, 0]);
    for (const s of [-1, 1]) {
      chain(t, lining, tall ? edge : null, [s * 0.2, 1.56, 0.28], [-0.2, 0, -s * 38 * DEG], tall ? 3 : 2, tall ? 0.44 : 0.26, 0.14, 0.05, 0.05, [0, 0, s * 10 * DEG], s);
    }
  }

  // ---- the mantle: what hangs or rises from the shoulders.
  if (st.mantle === 'cape') {
    // A cloak down the back in three hinged pieces with a lit hem. No wider than the body: an arm that swings back passes beside it, not through it.
    b.hang(t, [0, 1.46, 0.17], 3, 0.34, (g, i) => {
      const w = 0.46 + i * 0.02;
      put(g, lining, [w, 0.35, 0.04], [0, -0.17, 0]);
      put(g, robe, [w - 0.1, 0.33, 0.05], [0, -0.17, 0.012]);
      if (i === 2) {
        put(g, trim, [w + 0.01, 0.035, 0.06], [0, -0.35, 0]);
        put(g, edge, [w + 0.01, 0.015, 0.067], [0, -0.365, 0]);
        put(g, gem, [0.07, 0.07, 0.04], [0, -0.18, 0.04]);
      }
    }, 0.7, 0.07, 1);
  } else if (st.mantle === 'blades') {
    // Blades of the metal rise from each shoulder like the points of a collar.
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const f = i / 2;
        chain(t, trim, edge, [s * (0.32 + f * 0.1), 1.52, 0.02 + f * 0.08], [0.1 - f * 0.3, 0, -s * (20 + f * 45) * DEG], 4, 0.4 + (1 - f) * 0.15, 0.1, 0.02, 0.07, [0, 0, s * 8 * DEG], s);
      }
    }
  } else if (st.mantle === 'tatter') {
    // Ragged strips of grave-cloth from the shoulders and the back, each of a different length.
    for (let k = 0; k < 5; k++) {
      const x = (k - 2) * 0.1;
      const len = 3 + (k % 3);
      b.hang(t, [x, 1.44, 0.17], len, 0.24, (g) => {
        put(g, robe, [0.09, 0.25, 0.03], [0, -0.12, 0]);
        put(g, edge, [0.02, 0.25, 0.036], [0.035, -0.12, 0]);
      }, 0.8, 0.09, k * 0.9);
    }
  }

  // ---- what the head wears. (The top of the head is at 0.5 and the blocks that stand on it keep off that height: a face of a block exactly there fights the head's.)
  if (st.hat === 'witch') {
    // A brim cut like a disc from three slabs, each a hair higher than the last, a band, and the cone.
    put(head, robe, [0.98 * hs, 0.04, 0.62 * hs], [0, 0.43, 0]);
    put(head, robe, [0.62 * hs, 0.04, 0.98 * hs], [0, 0.435, 0]);
    put(head, robe, [0.78 * hs, 0.04, 0.78 * hs], [0, 0.44, 0], [0, Math.PI / 4, 0]);
    put(head, trim, [0.6, 0.1, 0.6], [0, 0.51, 0]);
    put(head, gem, [0.08, 0.08, 0.03], [0, 0.51, -0.31]);
    chain(head, robe, core, [0, 0.54, 0.02], [-0.18, 0, 0], 7, 0.95 * hs, 0.5, 0.05, 0.5, [0.1, 0, 0], 1, undefined, true);
  } else if (st.hat === 'mitre') {
    put(head, trim, [0.62, 0.1, 0.62], [0, 0.46, 0]);
    put(head, robe, [0.58, 0.12, 0.58], [0, 0.57, 0]);
    chain(head, robe, edge, [0, 0.63, -0.22], [0.2, 0, 0], 5, 0.72 * hs, 0.5, 0.1, 0.06, [0.07, 0, 0]);
    chain(head, robe, edge, [0, 0.63, 0.22], [-0.2, 0, 0], 5, 0.72 * hs, 0.5, 0.1, 0.06, [-0.07, 0, 0]);
    put(head, trim, [0.56, 0.04, 0.5], [0, 0.65, 0]);
    put(head, gem, [0.09, 0.14, 0.04], [0, 0.62, -0.285]);
    put(head, core, [0.03, 0.4, 0.02], [0, 0.88, -0.25], [0.12, 0, 0]);
    for (const s of [-1, 1]) put(head, lining, [0.05, 0.4, 0.14], [s * 0.285, 0.12, 0.18]); // two bands that fall behind the ears
  } else if (st.hat === 'hood') {
    // The hood is painted on the head; its thickness is a lining on the sides and the back, a slab on top, a band at the brow, and the point behind.
    for (const s of [-1, 1]) put(head, robe, [0.03, 0.46, 0.5], [s * 0.265, 0.25, 0.04]);
    put(head, robe, [0.5, 0.46, 0.03], [0, 0.25, 0.265]);
    put(head, robe, [0.56, 0.03, 0.58], [0, 0.515, 0.015]);
    put(head, trim, [0.56, 0.05, 0.02], [0, 0.345, -0.26]);
    put(head, gem, [0.06, 0.06, 0.02], [0, 0.345, -0.278]);
    chain(head, robe, null, [0, 0.52, 0.14], [-0.5, 0, 0], 4, 0.5, 0.34, 0.05, 0.34, [-0.12, 0, 0], 1, undefined, true); // the point of the hood
    if (st.flames) {
      // A crest of flame: tongues of light that lick up from the crown of the hood.
      for (let i = 0; i < 5; i++) {
        const f = i / 4;
        chain(head, trim, core, [(f - 0.5) * 0.4, 0.53, -0.1 + Math.abs(f - 0.5) * 0.1], [-0.15 + (Math.abs(f - 0.5)) * 0.1, 0, -(f - 0.5) * 0.7], 4, 0.4 + (1 - Math.abs(f - 0.5) * 2) * 0.28, 0.1, 0.02, 0.06, [0.03, 0, (f - 0.5) * 0.3], 1);
      }
    }
  } else if (st.hat === 'circlet') {
    put(head, trim, [0.58, 0.06, 0.58], [0, 0.365, 0]);
    put(head, edge, [0.585, 0.012, 0.585], [0, 0.325, 0]);
    put(head, gem, [0.1, 0.1, 0.03], [0, 0.365, -0.3]);
    // Two horns that rise from the brow and curve toward each other: a crescent, with a gem in the middle.
    for (const s of [-1, 1]) {
      chain(head, trim, edge, [s * 0.05, 0.4, -0.29], [0, 0, -s * 24 * DEG], 6, 0.5 * hs, 0.1, 0.025, 0.06, [0, 0, s * 14 * DEG], s);
    }
    for (const s of [-1, 1]) chain(head, trim, core, [s * 0.28, 0.4, 0], [-0.1, 0, -s * 8 * DEG], 3, 0.24 * hs, 0.05, 0.02, 0.05, [0, 0, s * 8 * DEG], s);
  } else if (st.hat === 'skull') {
    put(head, trim, [0.58, 0.07, 0.58], [0, 0.37, 0]);
    // A skull on the brow with lit eyes, and a ring of bone spikes round the crown.
    put(head, trim, [0.24, 0.2, 0.06], [0, 0.5, -0.28]);
    put(head, trim, [0.16, 0.1, 0.06], [0, 0.37, -0.28]);
    put(head, core, [0.05, 0.06, 0.02], [-0.06, 0.52, -0.32]);
    put(head, core, [0.05, 0.06, 0.02], [0.06, 0.52, -0.32]);
    put(head, lining, [0.025, 0.05, 0.02], [0, 0.43, -0.32]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const px = Math.sin(a) * 0.27;
      const pz = Math.cos(a) * 0.27;
      if (pz < -0.2) continue;
      chain(head, trim, core, [px, 0.47, pz], [Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25], 3, (0.28 + (i % 2) * 0.16) * hs, 0.09, 0.02, 0.09, [0, 0, 0]);
    }
  }
  if (st.horns) {
    // Horns that grow from the temples, sweep out and back and curl up.
    for (const s of [-1, 1]) {
      for (let k = 0; k < st.horns; k++) {
        chain(head, trim, edge, [s * 0.27, 0.44 - k * 0.12, 0.02], [0.45, 0, -s * (58 + k * 24) * DEG], 6, (0.62 - k * 0.14) * hs, 0.13, 0.025, 0.1, [0.03, 0, s * (15 - k * 3) * DEG], s);
      }
    }
  }

  // ---- the light and the magic.
  b.halo(st.halo);
  if (st.orbit) b.orbiters(st.orbit);
  if (st.orbit2) b.orbiters(st.orbit2);
  b.sparks(st.sparks, st.count);
  return b.finish(st.height, st.extent);
}
