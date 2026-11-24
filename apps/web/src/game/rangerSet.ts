import * as THREE from 'three';
import type { OutfitDef } from '@solrift/shared';
import { DEG, SetBuilder, hex, jitter, lerp, lit, noise, paint16, rgbs, scale, trimTexture, type OrbiterSpec, type SetCtx, type SetRig, type SparkKind, type V3 } from './setKit';

/**
 * The Ranger's sets: stitched leathers with a bandolier and a belt of pouches, a hood, a cap, a headdress of antlers or feathers, a mantle of fur or
 * feathers, a cloak that streams behind when the hero runs, a quiver of glowing arrows, and wings of feather, leaf or branch. Over it, the wild: light
 * that wanders like fireflies, falls like petals, climbs in a spiral, or flashes like a storm.
 */

type Head = 'hood' | 'antlers' | 'cap' | 'crest' | 'crescent' | 'bloom';
type Mantle = 'none' | 'fur' | 'feathers' | 'leaves' | 'scarf';
type Cloak = 'none' | 'short' | 'long' | 'ribbons';
type WingKind = 'feather' | 'leaf' | 'branch';

interface WingDef {
  kind: WingKind;
  blades: number;
  len: number;
  curl: number;
  spread: [number, number];
  width: number;
  /** Lights the tip of every feather (a burning wing, a storm). */
  lit?: boolean;
}

interface Style {
  head: Head;
  /** A mask over the nose and mouth. */
  mask?: boolean;
  /** A hooked beak on the brow. */
  beak?: boolean;
  /** Long feathers of a plume on the hood or cap. */
  plume?: number;
  headSize: number;
  mantle: Mantle;
  cloak: Cloak;
  quiver: boolean;
  wings: WingDef[];
  orbit?: OrbiterSpec;
  sparks: SparkKind;
  count: number;
  halo: number;
  height: number;
  extent: number;
}

const STYLES: Record<string, Style> = {
  greenwarden: {
    head: 'hood', plume: 1, headSize: 1, mantle: 'none', cloak: 'short', quiver: true, wings: [],
    sparks: 'leaves', count: 18, halo: 0.22, height: 0.6, extent: 0.5,
  },
  duskstalker: {
    head: 'hood', mask: true, headSize: 1, mantle: 'none', cloak: 'long', quiver: true, wings: [],
    sparks: 'fireflies', count: 16, halo: 0.25, height: 0.5, extent: 0.6,
  },
  sandrunner: {
    head: 'cap', plume: 2, headSize: 1, mantle: 'scarf', cloak: 'short', quiver: true, wings: [],
    sparks: 'rise', count: 20, halo: 0.22, height: 0.65, extent: 0.5,
  },
  wildheart: {
    head: 'antlers', headSize: 1, mantle: 'fur', cloak: 'none', quiver: false,
    wings: [{ kind: 'feather', blades: 3, len: 0.95, curl: 0.2, spread: [34, 86], width: 0.17 }],
    sparks: 'fireflies', count: 24, halo: 0.3, height: 0.95, extent: 0.85,
  },
  stormfeather: {
    head: 'crest', headSize: 1, mantle: 'feathers', cloak: 'none', quiver: false,
    wings: [{ kind: 'feather', blades: 4, len: 1.55, curl: 0.16, spread: [24, 92], width: 0.2, lit: true }],
    sparks: 'arcs', count: 22, halo: 0.32, height: 0.75, extent: 1.3,
  },
  emberhawk: {
    head: 'cap', beak: true, plume: 3, headSize: 1, mantle: 'feathers', cloak: 'none', quiver: false,
    wings: [{ kind: 'feather', blades: 4, len: 1.45, curl: 0.2, spread: [26, 90], width: 0.2, lit: true }],
    sparks: 'flames', count: 28, halo: 0.32, height: 0.75, extent: 1.25,
  },
  moonshadow: {
    head: 'crescent', headSize: 1, mantle: 'feathers', cloak: 'ribbons', quiver: false,
    wings: [{ kind: 'feather', blades: 5, len: 1.75, curl: 0.2, spread: [22, 96], width: 0.22, lit: true }],
    orbit: { count: 3, radius: 0.95, y: 1.4, size: 0.1, speed: 0.7, bob: 0.15, tilt: 0.3 },
    sparks: 'petals', count: 34, halo: 0.46, height: 1.1, extent: 1.5,
  },
  worldroot: {
    head: 'bloom', headSize: 1.2, mantle: 'leaves', cloak: 'long', quiver: false,
    wings: [
      { kind: 'branch', blades: 5, len: 1.6, curl: 0.24, spread: [22, 96], width: 0.15 },
      { kind: 'leaf', blades: 4, len: 1.05, curl: 0.18, spread: [40, 80], width: 0.26 },
    ],
    orbit: { count: 5, radius: 0.85, y: 1.2, size: 0.065, speed: -0.55, bob: 0.22, tilt: 0.2 },
    sparks: 'spiral', count: 42, halo: 0.46, height: 1.2, extent: 1.5,
  },
};

export const RANGER_STYLE_IDS: readonly string[] = Object.keys(STYLES);

// ---- pictures ---------------------------------------------------------------------------------------------------------------

/** Stitched leather: panels eight pixels across, seams and a line of stitches, scuffs. */
function leatherTexture(def: OutfitDef, key: 'leather' | 'leatherDark'): THREE.CanvasTexture {
  const base = key === 'leather' ? hex(def.shirt) : scale(hex(def.pants), 1.5);
  return paint16(`${key}:${def.id}`, (x, y) => {
    const px = x % 8;
    const py = y % 8;
    let c = lerp(scale(base, 0.72), scale(base, 1.18), 0.5 + 0.5 * Math.sin((x + y * 0.6) * 0.5));
    c = jitter(c, x, y, key === 'leather' ? 71 : 73, 9);
    if (px === 0 || py === 0) c = lerp(c, [0, 0, 0], 0.32);
    else if (py === 1 && x % 2 === 0) c = lerp(c, [255, 240, 210], 0.28); // the stitches along the seam
    if ((x * 7 + y * 13) % 29 === 0) c = lerp(c, [255, 250, 235], 0.25); // a scuff
    return rgbs(c);
  });
}

/** Fur: strands of two lights and a dark, as they fall. */
function furTexture(def: OutfitDef): THREE.CanvasTexture {
  const base = lerp(hex(def.trim), hex(def.shirt), 0.22);
  return paint16(`fur:${def.id}`, (x, y) => {
    const n = noise(x, Math.floor(y / 2), 77);
    let c = lerp(scale(base, 0.55), scale(base, 1.15), n);
    if ((x * 3 + y) % 5 === 0) c = lerp(c, [255, 255, 255], 0.3);
    if (y % 4 === 3) c = lerp(c, [0, 0, 0], 0.18);
    return rgbs(jitter(c, x, y, 78, 6));
  });
}

/** Cloth of the cloak: folds in the second colour, and a pale stitched hem every eight rows. */
function cloakTexture(def: OutfitDef): THREE.CanvasTexture {
  const base = hex(def.pants);
  const hem = hex(def.trim);
  return paint16(`cloak:${def.id}`, (x, y) => {
    const f = [0, 0.32, 0.64, 0.92][x % 4];
    let c = lerp(scale(base, 0.6), scale(base, 1.7), f);
    if (y % 8 === 7) c = lerp(c, hem, 0.45);
    return rgbs(jitter(c, x, y, 79, 6));
  });
}

/** The vanes of a feather, the leaves of a leaf, the grain of a branch. */
function wingTexture(def: OutfitDef, kind: WingKind): THREE.CanvasTexture {
  const glow = hex(def.glow);
  const trim = hex(def.trim);
  const shirt = hex(def.shirt);
  return paint16(`wing:${kind}:${def.id}`, (x, y) => {
    if (kind === 'feather') {
      const base = lerp(shirt, trim, 0.6);
      let c = lerp(scale(base, 0.62), scale(base, 1.12), [0.1, 0.4, 0.7, 0.95][(x + (y >> 1)) % 4]);
      if (x % 8 === 4) c = lerp(c, [255, 255, 255], 0.5); // the shaft
      if (y > 12) c = lerp(c, glow, 0.15 * (y - 12));
      return rgbs(jitter(c, x, y, 81, 6));
    }
    if (kind === 'leaf') {
      const base = scale(lerp(glow, [40, 120, 40], 0.5), 0.85);
      let c = lerp(scale(base, 0.5), scale(base, 1.15), [0.2, 0.55, 0.8, 0.45][(x + y) % 4]);
      if (x % 8 === 4 || Math.abs((x % 8) - 4) === Math.abs((y % 8) - 4)) c = lerp(c, [230, 255, 190], 0.45); // the veins
      return rgbs(jitter(c, x, y, 83, 6));
    }
    const base = scale(hex(def.pants), 1.9);
    let c = lerp(scale(base, 0.5), scale(base, 1.15), [0.1, 0.5, 0.85, 0.3][(x + (y >> 2)) % 4]);
    if ((x * 5 + y * 3) % 17 === 0) c = lerp(c, glow, 0.6); // a bud
    return rgbs(jitter(c, x, y, 85, 8));
  });
}

// ---- the set ----------------------------------------------------------------------------------------------------------------

/** What the skin needs to know of a set: whether its head is in a hood (painted, and over the hair). */
export function rangerLook(id: string): { hood: boolean } {
  return { hood: (STYLES[id] ?? STYLES.greenwarden).head === 'hood' };
}

/**
 * The leathers are painted on the body (see `outfitSkin.ts`): the jerkin with its lacing and its bandolier, the belt, the bracers, the trousers and the
 * boots are the colours of the skin. What is built of blocks is only what stands clear of it: the pouches, the sheath and the pieces of the tassets that
 * hang on the legs (so they move with the stride), the fur on the shoulders, the cloak and the quiver (kept within the width of the body, so an arm never
 * swings through them), the head's gear, and the wings.
 */
export function dressRangerSet(ctx: SetCtx, def: OutfitDef): SetRig {
  const st = STYLES[def.id] ?? STYLES.greenwarden;
  const b = new SetBuilder(ctx, def);
  const { core, edge, gem, t, head } = b;
  const leather = lit(`leather:${def.id}`, () => leatherTexture(def, 'leather'));
  const dark = lit(`leatherDark:${def.id}`, () => leatherTexture(def, 'leatherDark'));
  const fur = lit(`fur:${def.id}`, () => furTexture(def));
  const cloak = lit(`cloak:${def.id}`, () => cloakTexture(def));
  const trim = lit(`trim:${def.id}`, () => trimTexture(def));
  const put = b.put.bind(b);
  const chain = b.chain.bind(b);
  const hs = st.headSize;
  const feather = lit(`wing:feather:${def.id}`, () => wingTexture(def, 'feather'));

  // ---- the belt's buckle and gem where the painted one is; at the hips, on the legs, pouches and tassets of leather that move with the stride, and a
  // sheathed knife on the left leg's back. The wrists have a lit edge.
  put(t, trim, [0.13, 0.11, 0.02], [0, 0.906, -0.135]);
  put(t, gem, [0.06, 0.06, 0.03], [0, 0.906, -0.16]);
  for (const [leg, s] of [[ctx.legL, -1], [ctx.legR, 1]] as const) {
    put(leg, leather, [0.245, 0.2, 0.036], [0, -0.1, -0.143]);
    put(leg, trim, [0.245, 0.022, 0.04], [0, -0.21, -0.145]);
    put(leg, leather, [0.245, 0.22, 0.036], [0, -0.11, 0.143]);
    put(leg, dark, [0.06, 0.14, 0.1], [s * 0.155, -0.1, -0.04]);
    put(leg, trim, [0.065, 0.025, 0.105], [s * 0.155, -0.035, -0.04]);
    // The cuff of fur turned down over the boot (one hair higher on the right leg: the two cuffs touch, and a face in the same place would fight).
    put(leg, fur, [0.27, 0.07, 0.27], [0, -0.53 - (s === 1 ? 0.004 : 0), 0]);
    put(leg, edge, [0.262, 0.014, 0.262], [0, -0.66, 0]);
  }
  put(ctx.legL, dark, [0.06, 0.32, 0.05], [0, -0.2, 0.17], [0.12, 0, 0]);
  put(ctx.legL, trim, [0.065, 0.04, 0.055], [0, -0.04, 0.165], [0.12, 0, 0]);
  for (const arm of [ctx.armL, ctx.armR]) put(arm, edge, [0.262, 0.014, 0.262], [0, -0.594, 0]);

  // ---- the mantle: a collar about the neck and a cap on each shoulder, and what hangs from them.
  const shoulders = (mat: THREE.Material): void => {
    put(t, mat, [0.56, 0.1, 0.32], [0, 1.46, 0]);
    for (const [arm, s] of [[ctx.armL, -1], [ctx.armR, 1]] as const) put(arm, mat, [0.34, 0.09, 0.34], [s * 0.05, 0.045, 0]);
  };
  if (st.mantle === 'fur') {
    shoulders(fur);
    for (let i = -1; i <= 1; i++) {
      put(t, fur, [0.12, 0.13, 0.06], [i * 0.12, 1.4, -0.19], [0, 0, i * 0.06]);
      put(t, fur, [0.12, 0.13, 0.06], [i * 0.12, 1.4, 0.19], [0, 0, i * 0.06]);
    }
    put(t, trim, [0.04, 0.1, 0.02], [0, 1.42, -0.2]); // a bone toggle
  } else if (st.mantle === 'feathers' || st.mantle === 'leaves') {
    const mat = st.mantle === 'feathers' ? feather : lit(`wing:leaf:${def.id}`, () => wingTexture(def, 'leaf'));
    shoulders(leather);
    put(t, trim, [0.58, 0.022, 0.34], [0, 1.52, 0]);
    // Two rows of feathers or leaves hang over the chest, the lower row longer, no wider than the body.
    for (let row = 0; row < 2; row++) {
      for (let k = -2; k <= 2; k++) {
        const x = k * (0.1 + row * 0.01);
        const side = k < 0 ? -1 : 1;
        const down = Math.PI - k * 0.07 + (row ? 0.05 * side : 0);
        chain(t, mat, row ? edge : null, [x, 1.42 - row * 0.05, -0.17 - row * 0.015 - (k & 1) * 0.006], [0.18, 0, down], 3, 0.3 + row * 0.1, 0.14, 0.05, 0.04, [0, 0, 0], side, st.mantle === 'leaves' ? (i, n) => 0.1 + 0.12 * Math.sin(((i + 0.6) / (n + 0.2)) * Math.PI) : undefined);
      }
    }
  } else if (st.mantle === 'scarf') {
    // A scarf wound twice about the neck, with a tail that blows back.
    put(t, cloak, [0.54, 0.14, 0.3], [0, 1.52, 0]);
    put(t, trim, [0.55, 0.022, 0.31], [0, 1.595, 0]);
    put(t, cloak, [0.54, 0.1, 0.3], [0, 1.4, 0]);
    b.hang(t, [0.18, 1.4, 0.17], 4, 0.2, (g) => {
      put(g, cloak, [0.14, 0.2, 0.03], [0, -0.1, 0]);
      put(g, trim, [0.15, 0.025, 0.035], [0, -0.2, 0]);
    }, 1.2, 0.12);
  }

  // ---- the cloak: from the shoulders, in hinged pieces that stream behind the hero, no wider than the body.
  if (st.cloak === 'short' || st.cloak === 'long') {
    const n = st.cloak === 'long' ? 4 : 2;
    b.hang(t, [0, 1.47, 0.17], n, 0.32, (g, i) => {
      const w = 0.46 + i * 0.015;
      put(g, cloak, [w, 0.33, 0.04], [0, -0.16, 0]);
      if (i === n - 1) {
        put(g, trim, [w + 0.01, 0.03, 0.05], [0, -0.33, 0]);
        // A ragged hem: teeth of cloth along the bottom.
        for (let k = 0; k < 5; k++) put(g, cloak, [0.09, 0.1 + (k % 2) * 0.06, 0.035], [(k - 2) * 0.11, -0.37 - (k % 2) * 0.03, 0]);
      }
    }, 0.75, 0.07);
  } else if (st.cloak === 'ribbons') {
    // Ribbons of moonlight, five of them, long, that stream like smoke.
    for (let k = 0; k < 5; k++) {
      b.hang(t, [(k - 2) * 0.1, 1.44, 0.17], 5, 0.27, (g) => {
        put(g, edge, [0.08, 0.28, 0.02], [0, -0.14, 0]);
        put(g, core, [0.018, 0.28, 0.032], [0, -0.142, 0]);
      }, 1.1, 0.11, k * 0.9);
    }
  }

  // ---- the quiver, slung across the back, and arrows with fletching and lit heads.
  if (st.quiver) {
    put(t, dark, [0.15, 0.52, 0.12], [0.1, 1.2, 0.2], [0, 0, 0.3]);
    put(t, trim, [0.17, 0.03, 0.14], [0.012, 1.465, 0.2], [0, 0, 0.3]);
    put(t, trim, [0.17, 0.03, 0.14], [0.185, 0.97, 0.2], [0, 0, 0.3]);
    for (let i = 0; i < 4; i++) {
      const off = (i - 1.5) * 0.035;
      put(t, trim, [0.018, 0.3, 0.018], [0.0 + off + 0.04, 1.6, 0.2 + (i % 2) * 0.025], [0, 0, 0.3]);
      put(t, gem, [0.05, 0.08, 0.012], [-0.012 + off + 0.04, 1.49, 0.2 + (i % 2) * 0.025], [0, 0, 0.3]);
    }
  }

  // ---- what the head wears. (The top of the head is at 0.5 and the blocks that stand on it keep off that height: a face of a block exactly there fights the head's.)
  const plume = (n: number, base: V3): void => {
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 0.5 : i / (n - 1);
      chain(head, feather, edge, [base[0] + (f - 0.5) * 0.06, base[1], base[2] + i * 0.005], [-0.9 - f * 0.25, 0, -0.35 + f * 0.5], 5, 0.62 - Math.abs(f - 0.5) * 0.2, 0.14, 0.02, 0.03, [-0.1, 0, 0.02], 1, (i2, n2) => 0.04 + 0.12 * Math.sin(((i2 + 0.6) / (n2 + 0.2)) * Math.PI));
    }
  };
  const hood = (): void => {
    // The hood is painted on the head; its thickness is a lining on the sides and the back, a slab on top, a band at the brow, and the point behind.
    for (const s of [-1, 1]) put(head, leather, [0.03, 0.46, 0.5], [s * 0.265, 0.25, 0.04]);
    put(head, leather, [0.5, 0.46, 0.03], [0, 0.25, 0.265]);
    put(head, leather, [0.56, 0.03, 0.58], [0, 0.515, 0.015]);
    put(head, dark, [0.56, 0.05, 0.02], [0, 0.345, -0.26]);
    put(head, gem, [0.05, 0.05, 0.02], [0, 0.345, -0.278]);
    chain(head, leather, null, [0, 0.52, 0.12], [-0.55, 0, 0], 4, 0.46, 0.32, 0.05, 0.32, [-0.12, 0, 0], 1, undefined, true);
  };
  const band = (y = 0.33): void => {
    put(head, dark, [0.58, 0.09, 0.58], [0, y, 0]);
    put(head, trim, [0.59, 0.02, 0.59], [0, y + 0.05, 0]);
    put(head, gem, [0.07, 0.07, 0.03], [0, y, -0.3]);
  };
  if (st.head === 'hood') {
    hood();
    if (st.plume) plume(st.plume, [0.2, 0.52, 0.2]);
  } else if (st.head === 'cap') {
    put(head, leather, [0.58, 0.14, 0.58], [0, 0.45, 0]);
    put(head, dark, [0.6, 0.04, 0.3], [0, 0.38, -0.42], [0.18, 0, 0]); // the peak
    band(0.33);
    put(head, leather, [0.58, 0.3, 0.05], [0, 0.18, 0.275]);
    if (st.plume) plume(st.plume, [0.24, 0.45, 0.06]);
    if (st.beak) {
      // A hawk's beak: hooked, over the nose, with a lit eye each side.
      chain(head, trim, core, [0, 0.3, -0.3], [-0.7, 0, 0], 3, 0.22, 0.12, 0.02, 0.1, [0.55, 0, 0]);
      for (const s of [-1, 1]) put(head, core, [0.04, 0.04, 0.02], [s * 0.15, 0.2, -0.3]);
    }
  } else if (st.head === 'antlers') {
    put(head, fur, [0.58, 0.1, 0.58], [0, 0.34, 0]);
    put(head, trim, [0.59, 0.02, 0.59], [0, 0.4, 0]);
    put(head, gem, [0.07, 0.07, 0.03], [0, 0.34, -0.3]);
    for (const s of [-1, 1]) {
      chain(head, trim, null, [s * 0.26, 0.4, 0], [-0.15, 0, -s * 24 * DEG], 6, 0.78 * hs, 0.09, 0.035, 0.08, [0.04, 0, s * 8 * DEG]);
      for (const [y, a, len] of [[0.6, 66, 0.3], [0.8, 58, 0.36], [0.42, 80, 0.24]] as const) {
        chain(head, trim, core, [s * (0.3 + (y - 0.4) * 0.28), y, -0.02], [-0.18, 0, -s * a * DEG], 3, len, 0.05, 0.02, 0.06, [0, 0, s * 8 * DEG], s);
      }
    }
  } else if (st.head === 'crest') {
    // A winged helm: a cap with a fan of long feathers swept back and up, and a pair of fins at the temples.
    put(head, leather, [0.58, 0.14, 0.58], [0, 0.42, 0]);
    band(0.3);
    for (const s of [-1, 1]) {
      chain(head, feather, edge, [s * 0.29, 0.36, 0], [0.2, 0, -s * 80 * DEG], 5, 0.62 * hs, 0.16, 0.03, 0.04, [0, 0, s * 10 * DEG], s, (i, n) => 0.05 + 0.14 * Math.sin(((i + 0.6) / (n + 0.2)) * Math.PI));
      chain(head, feather, null, [s * 0.29, 0.3, 0.05], [0.4, 0, -s * 105 * DEG], 4, 0.42 * hs, 0.12, 0.03, 0.04, [0, 0, s * 10 * DEG], s);
    }
    plume(5, [0, 0.49, 0.12]);
  } else if (st.head === 'crescent') {
    put(head, leather, [0.58, 0.14, 0.58], [0, 0.4, 0]);
    band(0.31);
    // A crescent over the brow, and two long feathers swept back from it.
    for (const s of [-1, 1]) {
      chain(head, trim, edge, [s * 0.04, 0.42, -0.3 - (s === 1 ? 0.004 : 0)], [0, 0, -s * 22 * DEG], 7, 0.6 * hs, 0.11, 0.025, 0.06, [0, 0, s * 13 * DEG], s);
    }
    put(head, core, [0.06, 0.06, 0.03], [0, 0.46, -0.32]);
    plume(3, [0, 0.47, 0.14]);
  } else if (st.head === 'bloom') {
    // A crown of antlers in bloom: two great beams with many tines, each tine ending in a blossom of light, and a ring of leaves.
    put(head, fur, [0.58, 0.1, 0.58], [0, 0.34, 0]);
    put(head, trim, [0.59, 0.025, 0.59], [0, 0.4, 0]);
    put(head, gem, [0.09, 0.09, 0.03], [0, 0.34, -0.3]);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (Math.cos(a) > 0.9) continue;
      chain(head, lit(`wing:leaf:${def.id}`, () => wingTexture(def, 'leaf')), null, [Math.sin(a) * 0.3, 0.38, Math.cos(a) * 0.3], [Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9], 2, 0.18, 0.12, 0.03, 0.04, [0, 0, 0]);
    }
    for (const s of [-1, 1]) {
      chain(head, trim, null, [s * 0.26, 0.42, 0], [-0.1, 0, -s * 22 * DEG], 7, 0.95 * hs, 0.1, 0.04, 0.09, [0.03, 0, s * 8 * DEG]);
      for (const [y, a, len] of [[0.62, 64, 0.34], [0.84, 56, 0.4], [1.04, 44, 0.34], [0.46, 84, 0.28]] as const) {
        const x = s * (0.3 + (y - 0.4) * 0.3);
        chain(head, trim, null, [x, y, -0.02], [-0.18, 0, -s * a * DEG], 3, len, 0.055, 0.02, 0.06, [0, 0, s * 8 * DEG], s);
        put(head, gem, [0.07, 0.07, 0.07], [x + s * Math.sin(a * DEG) * len * 0.95, y + Math.cos(a * DEG) * len * 0.95, -0.06]); // the blossom
      }
    }
  }
  if (st.mask) {
    // A mask over the nose and mouth, with a slit of light, and two fins that sweep back along the cheeks.
    put(head, dark, [0.52, 0.19, 0.04], [0, 0.1, -0.27]);
    put(head, trim, [0.5, 0.025, 0.045], [0, 0.2, -0.272]);
    put(head, edge, [0.3, 0.012, 0.05], [0, 0.1, -0.277]);
    for (const s of [-1, 1]) chain(head, dark, edge, [s * 0.26, 0.08, -0.2], [0, 0.2 * s, -s * 70 * DEG], 3, 0.24, 0.1, 0.03, 0.04, [0, 0, s * 6 * DEG], s);
  }

  // ---- the wings: of feathers, of leaves, or of branches; they open and close a little with the clock.
  for (const w of st.wings) {
    const mat = w.kind === 'feather' ? feather : lit(`wing:${w.kind}:${def.id}`, () => wingTexture(def, w.kind));
    b.wings({
      at: [0.1, 1.4, 0.15],
      blades: w.blades,
      len: w.len,
      curl: w.curl,
      spread: w.spread,
      sweep: w.kind === 'leaf' ? [0.65, 0.4] : [0.5, 0.26],
      mat,
      base: trim,
      edge: w.kind === 'leaf' || w.lit ? edge : w.kind === 'branch' ? core : null,
      spine: w.kind === 'leaf' ? null : core,
      width: w.width,
      feather: w.kind !== 'branch',
      segs: w.kind === 'leaf' ? 4 : 6,
      flap: w.kind === 'branch' ? 0.8 : 1.15,
    });
  }

  // ---- the light and the wild.
  b.halo(st.halo);
  if (st.orbit) b.orbiters(st.orbit);
  b.sparks(st.sparks, st.count);
  return b.finish(st.height, st.extent);
}
