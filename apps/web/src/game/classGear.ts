import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { jitter, lerp, noise, rgbs, snap, tileUv, type GearCtx, type GearSlot, type MageRig, type RGB, type V3 } from './mageGear';

/**
 * What a Warrior and a Ranger wear, built the way the Mage's robes are (see `mageGear.ts`): blocks at the scale of the skin, painted from small
 * pictures one block wide, the static blocks of a part merged into one mesh per look. Looks only, no items.
 *
 *  - The Warrior: a steel helm with a nose guard, cheek plates and a crimson plume; a breastplate with a gold cross, lames and a belt over crimson
 *    sleeves; layered pauldrons, vambraces, tassets, knee guards and greaves; a lined crimson cape in three hinged pieces with a gold hem.
 *  - The Ranger: a hood of forest-green leather with a peak and a feather; a laced jerkin with a bandolier of studs, a belt with a pouch and a
 *    sheathed knife; a fur-trimmed shoulder, laced bracers, turned-down boots; a short cloak, and a quiver of arrows on the back.
 *
 * The pieces that armor takes the place of are in slots (`head`, `chest`, `legs`, `feet`): see `Character.fitGear`.
 */

// ---- pictures ---------------------------------------------------------------------------------------------------------

type TexKey = 'steel' | 'mail' | 'crimson' | 'crimsonLining' | 'trim' | 'jerkin' | 'leather' | 'leatherDark' | 'cloak' | 'cloakLining' | 'fur';

const PAINT: Record<TexKey, (x: number, y: number) => string> = {
  // Plate: panels 8 pixels across, each lit from its top left (pale and warm where the light lands, cool blue in its shade), a bright bevel on the
  // top and left, a dark one on the bottom and right, a rivet in the corner of every other panel; a few scratches.
  steel: (x, y) => {
    const px = x % 8;
    const py = y % 8;
    let c = lerp([176, 186, 204], [98, 112, 142], Math.pow((px + py) / 14, 0.9));
    c = jitter(c, x, y, 21, 7);
    if (px === 0 || py === 0) c = lerp(c, [240, 238, 232], 0.3);
    else if (px === 7 || py === 7) c = lerp(c, [46, 56, 88], 0.34);
    if (px === 2 && py === 2 && ((x >> 3) + (y >> 3)) % 2 === 0) c = [250, 246, 232];
    else if (px === 3 && py === 3 && ((x >> 3) + (y >> 3)) % 2 === 0) c = lerp(c, [30, 38, 70], 0.55);
    if ((x * 5 + y * 3) % 13 === 0 && px > 1 && px < 6) c = lerp(c, [250, 250, 255], 0.35);
    else if ((x * 7 + y * 11) % 19 === 0 && py > 1 && py < 6) c = lerp(c, [30, 38, 70], 0.3);
    return rgbs(c);
  },
  // Mail: rings four pixels across, every other row of them slid half a ring; the light catches the top and left of each, the hole is dark.
  mail: (x, y) => {
    const row = y & 3;
    const cell = (x + (((y >> 2) & 1) === 1 ? 2 : 0)) & 3;
    if ((row === 1 || row === 2) && (cell === 1 || cell === 2)) return rgbs([40, 46, 62]);
    const lit = row === 0 || cell === 0;
    const shade = row === 3 || cell === 3;
    return rgbs(jitter(lit && !shade ? [196, 204, 220] : shade && !lit ? [84, 94, 120] : [134, 144, 166], x, y, 25, 8));
  },
  // Crimson cloth: folds a dark crease and then lighter and lighter toward the next, shadows toward wine and lights toward orange, a fine weave.
  crimson: (x, y) => {
    const f = [0, 0.26, 0.6, 0.9][x % 4];
    let c = lerp([112, 16, 38], [216, 68, 56], f);
    if ((x + y) % 2 === 0) c = lerp(c, [60, 6, 24], 0.07);
    return rgbs(jitter(c, x, y, 23, 7));
  },
  crimsonLining: (x, y) => {
    const f = [0, 0.3, 0.62, 0.9][x % 4];
    let c = lerp([62, 10, 28], [146, 36, 50], f);
    if (y % 8 === 7) c = lerp(c, [30, 4, 16], 0.4);
    return rgbs(jitter(c, x, y, 24, 6));
  },
  // Gold: engraved lines every four pixels in a deep amber, glints in a pale yellow.
  trim: (x, y) => {
    let c: RGB = [232, 186, 70];
    if (x % 4 === 0) c = [196, 136, 44];
    else if (x % 4 === 1) c = [246, 206, 96];
    if ((x * 3 + y * 5) % 11 === 0) c = [255, 238, 156];
    return rgbs(jitter(c, x, y, 11, 8));
  },
  // Green leather: seams every 8 pixels with a row of stitches beside them, a dapple of lighter and darker patches like leaves in shade.
  jerkin: (x, y) => {
    let c = lerp([54, 102, 56], [70, 120, 62], noise(x >> 1, y >> 1, 30));
    if (x % 8 === 0) c = lerp(c, [16, 40, 24], 0.6);
    else if (x % 8 === 1 && y % 4 < 2) c = lerp(c, [196, 214, 140], 0.4);
    if ((x + y * 2) % 9 === 0) c = lerp(c, [20, 48, 30], 0.25);
    return rgbs(jitter(c, x, y, 31, 6));
  },
  // Brown leather: seams across every 8 pixels with stitches under them, warm lights and deep brown shadows.
  leather: (x, y) => {
    let c = lerp([96, 60, 34], [136, 92, 54], noise(x >> 1, y >> 1, 32));
    if (y % 8 === 0) c = lerp(c, [36, 22, 14], 0.6);
    else if (y % 8 === 1 && x % 4 < 2) c = lerp(c, [214, 170, 110], 0.4);
    if ((x * 3 + y) % 10 === 0) c = lerp(c, [50, 30, 18], 0.3);
    return rgbs(jitter(c, x, y, 33, 8));
  },
  // A soldier's leather: darker and drier, seams every 8 pixels and a stitched row beside them.
  leatherDark: (x, y) => {
    let c: RGB = [98, 62, 40];
    if (y % 8 === 0) c = [46, 28, 20];
    else if (y % 8 === 1 && x % 4 < 2) c = [132, 88, 58];
    else if ((x * 3 + y) % 10 === 0) c = [70, 44, 30];
    return rgbs(jitter(c, x, y, 34, 12));
  },
  // The cloak: deep forest green in folds, with leaf-shaped lights that glint where the sun finds it.
  cloak: (x, y) => {
    const f = [0, 0.3, 0.62, 0.9][x % 4];
    let c = lerp([16, 44, 32], [74, 128, 72], f);
    if ((x * 5 + y * 3) % 17 === 0 || (x * 5 + y * 3) % 17 === 1) c = lerp(c, [150, 196, 96], 0.45);
    else if ((x * 3 + y * 7) % 13 === 0) c = lerp(c, [10, 28, 22], 0.4);
    return rgbs(jitter(c, x, y, 35, 7));
  },
  cloakLining: (x, y) => {
    const f = [0, 0.3, 0.62, 0.9][x % 4];
    let c = lerp([84, 108, 58], [168, 188, 108], f);
    if (y % 8 === 7) c = lerp(c, [50, 70, 38], 0.35);
    return rgbs(jitter(c, x, y, 36, 8));
  },
  // Fur: cream with a few darker guard hairs and a grey-brown undercoat in the gaps.
  fur: (x, y) => {
    let c = lerp([206, 192, 162], [244, 236, 214], noise(x, y >> 1, 37));
    if (noise(x * 3, y, 38) > 0.8) c = lerp(c, [112, 88, 64], 0.55);
    else if ((x + y * 2) % 7 === 0) c = lerp(c, [150, 134, 108], 0.4);
    return rgbs(c);
  },
};

const textures = new Map<TexKey, THREE.CanvasTexture>();
const materials = new Map<string, THREE.MeshBasicMaterial>();

function texture(key: TexKey): THREE.CanvasTexture {
  let t = textures.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      g.fillStyle = PAINT[key](x, y);
      g.fillRect(x, y, 1, 1);
    }
  }
  t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  // Crisp up close, mip-mapped far off (a figure in the distance would shimmer), and clear when seen at a slant.
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  textures.set(key, t);
  return t;
}

function cloth(key: TexKey): THREE.MeshBasicMaterial {
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ map: texture(key), vertexColors: true });
    materials.set(key, m);
  }
  return m;
}

function flat(name: string, color: number): THREE.MeshBasicMaterial {
  let m = materials.get(name);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, vertexColors: true });
    materials.set(name, m);
  }
  return m;
}

export function disposeClassGear(): void {
  for (const m of materials.values()) m.dispose();
  materials.clear();
  for (const t of textures.values()) t.dispose();
  textures.clear();
}

// ---- building ---------------------------------------------------------------------------------------------------------

/** A trim is one band of the picture (not a stripe of it): slide it so it shows the plain gold. */
const GOLD: [number, number] = [0.25, 0.4];

interface Outfit {
  /** Which piece of armor takes the place of what is put on from now on. */
  slot(s: GearSlot): void;
  /** A block of the outfit: it joins the others of its slot, part and look into one mesh. */
  put(parent: THREE.Object3D, mat: THREE.Material, size: V3, at: V3, off?: [number, number]): void;
  /** Merge the blocks into meshes. */
  finish(): MageRig['slots'];
}

/** How far a face is drawn back from another one it would lie on: far enough that the depth buffer never mixes them up, too little to see. */
const SETBACK = 0.003;

/**
 * Two blocks of a part with a face each on the same plane, facing the same way, are drawn on top of each other, and which one wins changes
 * with the view: the armor flickers. So a block that would do that is drawn back by a hair on that face (inward, so it can never poke through
 * a block it sits inside), and the block that was there first keeps the plane.
 */
function settle(size: V3, at: V3, placed: { lo: V3; hi: V3 }[]): { size: V3; at: V3 } {
  const lo: V3 = [at[0] - size[0] / 2, at[1] - size[1] / 2, at[2] - size[2] / 2];
  const hi: V3 = [at[0] + size[0] / 2, at[1] + size[1] / 2, at[2] + size[2] / 2];
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    for (const o of placed) {
      for (let a = 0; a < 3; a++) {
        const u = (a + 1) % 3;
        const v = (a + 2) % 3;
        if (Math.min(hi[u], o.hi[u]) - Math.max(lo[u], o.lo[u]) <= 0.004 || Math.min(hi[v], o.hi[v]) - Math.max(lo[v], o.lo[v]) <= 0.004) continue;
        if (Math.abs(hi[a] - o.hi[a]) < 0.0012 && hi[a] - lo[a] > SETBACK * 3) { hi[a] -= SETBACK; moved = true; }
        if (Math.abs(lo[a] - o.lo[a]) < 0.0012 && hi[a] - lo[a] > SETBACK * 3) { lo[a] += SETBACK; moved = true; }
      }
    }
    if (!moved) break;
  }
  return { size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]], at: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2] };
}

function outfit(ctx: GearCtx): Outfit {
  const batches = new Map<string, { slot: GearSlot; parent: THREE.Object3D; mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
  const placed = new Map<THREE.Object3D, { lo: V3; hi: V3 }[]>();
  let cur: GearSlot = 'head';
  return {
    slot: (s) => void (cur = s),
    put(parent, mat, wanted, wantedAt, off) {
      const list = placed.get(parent) ?? [];
      placed.set(parent, list);
      const { size, at } = settle(wanted, wantedAt, list);
      list.push({ lo: [at[0] - size[0] / 2, at[1] - size[1] / 2, at[2] - size[2] / 2], hi: [at[0] + size[0] / 2, at[1] + size[1] / 2, at[2] + size[2] / 2] });
      const geo = ctx.box(...size);
      tileUv(geo, size, off ?? [snap(at[0] * 7.3 + at[2] * 3.1), snap(at[1] * 5.1)]);
      geo.translate(...at);
      const key = `${cur}:${parent.id}:${mat.uuid}`;
      let b = batches.get(key);
      if (!b) batches.set(key, (b = { slot: cur, parent, mat, geos: [] }));
      b.geos.push(geo);
    },
    finish() {
      const slots: MageRig['slots'] = { head: [], chest: [], legs: [], feet: [] };
      for (const b of batches.values()) {
        const geo = b.geos.length > 1 ? mergeGeometries(b.geos, false)! : b.geos[0];
        if (b.geos.length > 1) for (const g of b.geos) g.dispose();
        slots[b.slot].push(ctx.add(b.parent, geo, b.mat));
      }
      return slots;
    },
  };
}

/** A cape of pieces hung from the neck, each wider than the one above; `back` outside, `lining` inside, an optional gold hem on the last. */
function capeOf(ctx: GearCtx, hems: [number, number][], back: THREE.Material, lining: THREE.Material, hem: THREE.Material | null): THREE.Group[] {
  const cape: THREE.Group[] = [];
  let top: THREE.Object3D = ctx.torso;
  let y = 1.47;
  hems.forEach(([w, ht], i) => {
    const pivot = new THREE.Group();
    pivot.position.set(0, y, i === 0 ? 0.158 : 0);
    top.add(pivot);
    const geo = ctx.box(w, ht, 0.065);
    tileUv(geo, [w, ht, 0.065], [snap(i * 0.31), snap(i * 0.43)]);
    geo.translate(0, -ht / 2, 0.0325);
    // +x, -x, +y, -y, +z (the back), -z (against the body)
    ctx.add(pivot, geo, [back, back, back, back, back, lining]);
    if (hem && i === hems.length - 1) {
      const g = ctx.box(w + 0.01, 0.05, 0.075);
      tileUv(g, [w + 0.01, 0.05, 0.075], GOLD);
      g.translate(0, -ht + 0.01, 0.0325);
      ctx.add(pivot, g, hem);
    }
    cape.push(pivot);
    top = pivot;
    y = -ht;
  });
  return cape;
}

// ---- the Warrior ------------------------------------------------------------------------------------------------------

export function dressWarrior(ctx: GearCtx): MageRig {
  const o = outfit(ctx);
  const { put } = o;
  const steel = cloth('steel');
  const mail = cloth('mail');
  const crimson = cloth('crimson');
  const trim = cloth('trim');
  const leather = cloth('leatherDark');
  const dark = flat('wDark', 0x22202a);
  const steelDark = flat('wSteelDark', 0x5a6272);

  // ---- the helm: a band round the brow and over the crown, cheek plates, a nose guard, a crest with a plume that falls to the back, a fin of
  // gold on each side, and a curtain of mail down the back of the neck.
  o.slot('head');
  const h = ctx.head;
  put(h, steel, [0.57, 0.25, 0.57], [0, 0.25, 0]);
  put(h, steelDark, [0.575, 0.04, 0.575], [0, 0.145, 0]); // the rim
  put(h, trim, [0.58, 0.022, 0.58], [0, 0.17, 0], GOLD); // a gold band above it
  put(h, steel, [0.04, 0.22, 0.34], [-0.287, 0.035, 0.03]);
  put(h, steel, [0.04, 0.22, 0.34], [0.287, 0.035, 0.03]);
  put(h, steelDark, [0.045, 0.05, 0.3], [-0.29, -0.06, 0.04]); // the lower edge of a cheek plate
  put(h, steelDark, [0.045, 0.05, 0.3], [0.29, -0.06, 0.04]);
  put(h, steel, [0.07, 0.24, 0.045], [0, 0.11, -0.275]); // the nose guard
  put(h, trim, [0.075, 0.04, 0.05], [0, 0.23, -0.28], GOLD); // a gold stud above it
  put(h, steelDark, [0.1, 0.07, 0.6], [0, 0.4, 0]); // the crest
  put(h, trim, [0.11, 0.025, 0.4], [0, 0.44, 0.02], GOLD); // a gold edge along it
  put(h, steel, [0.58, 0.04, 0.16], [0, 0.385, -0.2]); // the visor lip above the eyes
  put(h, steel, [0.04, 0.17, 0.3], [-0.31, 0.32, 0.03]); // a wing on each side, edged in gold
  put(h, steel, [0.04, 0.17, 0.3], [0.31, 0.32, 0.03]);
  put(h, trim, [0.05, 0.022, 0.31], [-0.31, 0.41, 0.03], GOLD);
  put(h, trim, [0.05, 0.022, 0.31], [0.31, 0.41, 0.03], GOLD);
  put(h, steel, [0.46, 0.035, 0.46], [0, 0.39, 0.0]); // the dome of the helm rises a step
  put(h, mail, [0.55, 0.26, 0.06], [0, -0.0, 0.3]); // the aventail
  put(h, mail, [0.05, 0.2, 0.34], [-0.285, -0.08, 0.12]);
  put(h, mail, [0.05, 0.2, 0.34], [0.285, -0.08, 0.12]);
  put(h, crimson, [0.09, 0.11, 0.16], [0, 0.47, -0.08]);
  put(h, crimson, [0.09, 0.13, 0.15], [0, 0.48, 0.07]);
  put(h, crimson, [0.09, 0.13, 0.14], [0, 0.45, 0.2]);
  put(h, crimson, [0.09, 0.14, 0.12], [0, 0.39, 0.31]);
  put(h, crimson, [0.09, 0.14, 0.1], [0, 0.29, 0.37]);
  put(h, crimson, [0.08, 0.12, 0.08], [0, 0.18, 0.4]);

  // ---- the body: a breastplate with two rounded plates, a ridge and a gold cross, a gorget over a collar of mail, lames over mail at the belly,
  // a belt with a gold buckle; crimson sleeves under layered pauldrons with a spike each, an elbow guard, a vambrace with a gold cuff and a glove.
  o.slot('chest');
  const t = ctx.torso;
  put(t, steel, [0.58, 0.46, 0.31], [0, 1.26, 0]);
  put(t, mail, [0.57, 0.3, 0.3], [0, 0.96, 0]); // what the lames cover
  put(t, steel, [0.58, 0.085, 0.315], [0, 1.0, 0]);
  put(t, steel, [0.575, 0.085, 0.31], [0, 0.92, 0]);
  put(t, trim, [0.59, 0.016, 0.32], [0, 1.05, 0], GOLD);
  put(t, steel, [0.27, 0.22, 0.04], [-0.15, 1.31, -0.17]); // the two plates of the breast, standing out
  put(t, steel, [0.27, 0.22, 0.04], [0.15, 1.31, -0.17]);
  put(t, steelDark, [0.5, 0.025, 0.04], [0, 1.185, -0.17]); // where they end
  put(t, steel, [0.1, 0.4, 0.035], [0, 1.27, -0.19]); // the ridge down the front
  put(t, trim, [0.045, 0.2, 0.02], [0, 1.31, -0.215], GOLD);
  put(t, trim, [0.15, 0.045, 0.02], [0, 1.35, -0.215], GOLD);
  put(t, mail, [0.5, 0.07, 0.33], [0, 1.455, 0]);
  put(t, steel, [0.48, 0.1, 0.33], [0, 1.52, 0]); // the gorget
  put(t, trim, [0.5, 0.025, 0.34], [0, 1.475, 0], GOLD);
  put(t, leather, [0.6, 0.075, 0.33], [0, 0.835, 0]);
  put(t, trim, [0.12, 0.1, 0.02], [0, 0.835, -0.173], GOLD);
  put(t, dark, [0.05, 0.05, 0.025], [0, 0.835, -0.178]);
  put(t, crimson, [0.2, 0.2, 0.025], [0, 0.69, -0.17]); // a crimson cloth at the belt
  put(t, trim, [0.2, 0.025, 0.03], [0, 0.585, -0.17], GOLD);
  for (const [arm, s] of [[ctx.armL, -1], [ctx.armR, 1]] as const) {
    put(arm, crimson, [0.29, 0.26, 0.29], [0, -0.17, 0]);
    put(arm, steel, [0.37, 0.095, 0.37], [s * 0.025, 0.045, 0]);
    put(arm, steel, [0.34, 0.095, 0.34], [s * 0.03, -0.045, 0]);
    put(arm, trim, [0.345, 0.02, 0.345], [s * 0.03, -0.098, 0], GOLD);
    put(arm, steel, [0.06, 0.1, 0.06], [s * 0.05, 0.14, 0]); // the spike
    put(arm, trim, [0.09, 0.025, 0.09], [s * 0.05, 0.09, 0], GOLD);
    put(arm, mail, [0.29, 0.06, 0.29], [0, -0.33, 0]);
    put(arm, steel, [0.31, 0.26, 0.31], [0, -0.5, 0]); // the vambrace
    put(arm, trim, [0.32, 0.03, 0.32], [0, -0.385, 0], GOLD);
    put(arm, trim, [0.325, 0.02, 0.325], [0, -0.62, 0], GOLD);
    put(arm, leather, [0.27, 0.13, 0.27], [0, -0.695, 0]); // the glove, a hair below the hand so the two bottoms do not share a plane
  }

  // ---- the thighs: a tasset on each leg, a crimson skirt hanging from it with a gold hem (a half to each leg, so it swings apart as they do),
  // a knee guard with a gold stud.
  o.slot('legs');
  for (const [leg, d] of [[ctx.legL, 0], [ctx.legR, 0.002]] as const) {
    put(leg, steel, [0.295, 0.2, 0.325 + d], [0, -0.07, 0]);
    put(leg, trim, [0.3, 0.024, 0.33 + d], [0, -0.17, 0], GOLD);
    put(leg, crimson, [0.29, 0.25, 0.32 + d], [0, -0.3, 0]);
    put(leg, trim, [0.295, 0.025, 0.325 + d], [0, -0.415, 0], GOLD);
    put(leg, steel, [0.295, 0.12, 0.31 + d], [0, -0.47, 0]);
    put(leg, trim, [0.055, 0.055, 0.02], [0, -0.47, -0.16 - d], GOLD);
  }

  // ---- the shins and feet: greaves, and boots with a steel toe.
  o.slot('feet');
  for (const [leg, d] of [[ctx.legL, 0], [ctx.legR, 0.002]] as const) {
    put(leg, steel, [0.285, 0.13, 0.3 + d], [0, -0.595, 0]);
    put(leg, steelDark, [0.29, 0.03, 0.305 + d], [0, -0.675, 0]);
    put(leg, leather, [0.28, 0.08, 0.3 + d], [0, -0.72, 0]);
    put(leg, steel, [0.26, 0.06, 0.07], [0, -0.72, -0.18]);
    put(leg, trim, [0.27, 0.02, 0.07], [0, -0.69, -0.18], GOLD);
  }

  const slots = o.finish();
  const cape = capeOf(ctx, [[0.56, 0.4], [0.62, 0.34], [0.68, 0.3]], crimson, cloth('crimsonLining'), trim);
  // A gold edge down each side of the cape, and a cross on the back of it.
  cape.forEach((pivot, i) => {
    const [w, ht] = [[0.56, 0.4], [0.62, 0.34], [0.68, 0.3]][i];
    for (const s of [-1, 1]) {
      const edge = ctx.box(0.025, ht - 0.006, 0.07); // a hair beyond the cape at the side and short of its ends, so no faces lie together
      tileUv(edge, [0.025, ht - 0.006, 0.07], GOLD);
      edge.translate(s * (w / 2 - 0.0125 + 0.0015), -ht / 2, 0.0325);
      ctx.add(pivot, edge, trim);
    }
    if (i === 1) {
      for (const [bw, bh, by, bd] of [[0.05, 0.24, -0.17, 0.012], [0.17, 0.05, -0.1, 0.016]] as const) {
        const g = ctx.box(bw, bh, bd); // the cross bar is a little deeper, so it does not share a face with the stem
        tileUv(g, [bw, bh, bd], GOLD);
        g.translate(0, by, 0.065 + bd / 2);
        ctx.add(pivot, g, trim);
      }
    }
  });
  // The clasp at the neck.
  const clasp = ctx.box(0.22, 0.06, 0.06);
  clasp.translate(0, 0.0, 0.0);
  const gold = ctx.add(cape[0], clasp, trim);
  gold.position.set(0, -0.01, -0.005);
  return { cape, slots };
}

// ---- the Ranger -------------------------------------------------------------------------------------------------------

export function dressRanger(ctx: GearCtx): MageRig {
  const o = outfit(ctx);
  const { put } = o;
  const jerkin = cloth('jerkin');
  const leather = cloth('leather');
  const fur = cloth('fur');
  const trim = cloth('trim');
  const dark = flat('rDark', 0x2c2014);
  const cream = flat('rCream', 0xe6d9b4);
  const feather = flat('rFeather', 0xd2382f);
  const green = flat('rFeatherGreen', 0x4e8c3a);
  const leaf = cloth('cloak');

  // ---- the hood: a roof, two sides and a back that leave the face free, a peak over the brow, a point down the back, and a feather.
  o.slot('head');
  const h = ctx.head;
  put(h, jerkin, [0.58, 0.14, 0.58], [0, 0.31, 0]);
  put(h, jerkin, [0.07, 0.42, 0.42], [-0.29, 0.14, 0.08]);
  put(h, jerkin, [0.07, 0.42, 0.42], [0.29, 0.14, 0.08]);
  put(h, jerkin, [0.58, 0.46, 0.08], [0, 0.12, 0.29]);
  put(h, jerkin, [0.5, 0.06, 0.07], [0, 0.265, -0.29]); // the peak
  put(h, jerkin, [0.22, 0.2, 0.09], [0, 0.0, 0.36]); // the point
  put(h, jerkin, [0.12, 0.12, 0.08], [0, -0.12, 0.38]);
  put(h, dark, [0.585, 0.025, 0.585], [0, 0.23, 0]); // the stitched edge at the brow
  put(h, feather, [0.05, 0.16, 0.09], [0.31, 0.37, -0.02]);
  put(h, feather, [0.05, 0.14, 0.09], [0.31, 0.47, 0.05]);
  put(h, cream, [0.05, 0.1, 0.08], [0.31, 0.55, 0.12]);
  put(h, cream, [0.05, 0.08, 0.07], [0.31, 0.62, 0.2]);
  put(h, green, [0.04, 0.1, 0.07], [0.335, 0.5, 0.05]); // a second, green feather behind it
  put(h, green, [0.04, 0.09, 0.07], [0.335, 0.58, 0.11]);
  // Fur along the edges of the hood where it frames the face, and a longer point down the back.
  put(h, fur, [0.075, 0.4, 0.055], [-0.29, 0.12, -0.14]);
  put(h, fur, [0.075, 0.4, 0.055], [0.29, 0.12, -0.14]);
  put(h, jerkin, [0.07, 0.1, 0.07], [0, -0.22, 0.385]);

  // ---- the body: a laced jerkin, a pale collar, a bandolier of studs across the chest, a belt with a pouch and a sheathed knife, a tunic hem in
  // flaps; sleeves in green, a fur-trimmed shoulder on the right, laced bracers.
  o.slot('chest');
  const t = ctx.torso;
  put(t, jerkin, [0.56, 0.58, 0.31], [0, 1.2, 0]);
  put(t, cream, [0.46, 0.1, 0.33], [0, 1.495, 0]);
  put(t, fur, [0.52, 0.05, 0.34], [0, 1.465, 0]);
  put(t, dark, [0.02, 0.4, 0.02], [0, 1.2, -0.162]); // the seam of the lacing
  for (const y of [1.38, 1.3, 1.22]) put(t, cream, [0.1, 0.016, 0.022], [0, y, -0.166]);
  for (let i = 0; i < 6; i++) put(t, leather, [0.1, 0.1, 0.022], [-0.2 + i * 0.08, 1.4 - i * 0.1, -0.168]); // the bandolier, a staircase
  for (const i of [1, 3, 5]) put(t, trim, [0.04, 0.04, 0.026], [-0.2 + i * 0.08, 1.4 - i * 0.1, -0.172], GOLD);
  put(t, leather, [0.585, 0.07, 0.325], [0, 0.9, 0]);
  put(t, trim, [0.08, 0.08, 0.02], [0, 0.9, -0.168], GOLD);
  put(t, leather, [0.13, 0.15, 0.09], [0.19, 0.8, -0.19]);
  put(t, dark, [0.14, 0.04, 0.1], [0.19, 0.865, -0.19]);
  put(t, dark, [0.055, 0.2, 0.06], [-0.2, 0.75, -0.185]); // the sheath
  put(t, leather, [0.04, 0.08, 0.04], [-0.2, 0.89, -0.185]); // the hilt
  for (const x of [-0.18, 0, 0.18]) put(t, jerkin, [0.16, 0.12, 0.33], [x, 0.78, 0]);
  for (const [arm, s] of [[ctx.armL, -1], [ctx.armR, 1]] as const) {
    put(arm, jerkin, [0.285, 0.42, 0.285], [0, -0.21, 0]);
    put(arm, leather, [0.295, 0.22, 0.295], [0, -0.52, 0]); // the bracer
    put(arm, dark, [0.3, 0.025, 0.3], [0, -0.41, 0]);
    for (const y of [-0.46, -0.52, -0.58]) put(arm, cream, [0.12, 0.016, 0.022], [0, y, -0.15]);
    if (s > 0) {
      put(arm, leather, [0.33, 0.085, 0.33], [0.02, 0.04, 0]);
      put(arm, fur, [0.35, 0.05, 0.35], [0.02, 0.1, 0]);
    } else {
      // The left shoulder has a pad of leather held by two gold studs.
      put(arm, leather, [0.33, 0.085, 0.33], [-0.02, 0.04, 0]);
      put(arm, jerkin, [0.3, 0.04, 0.3], [-0.02, 0.1, 0]);
      for (const z of [-0.09, 0.09]) put(arm, trim, [0.045, 0.045, 0.02], [-0.02, 0.04, z < 0 ? -0.17 : 0.17], GOLD);
    }
  }

  // ---- the legs: trousers, and boots with a turned-down tan cuff.
  o.slot('legs');
  for (const [leg, d] of [[ctx.legL, 0], [ctx.legR, 0.002]] as const) {
    put(leg, leather, [0.265, 0.46, 0.275 + d], [0, -0.23, 0]);
    put(leg, dark, [0.27, 0.025, 0.28 + d], [0, -0.14, 0]);
    put(leg, jerkin, [0.2, 0.12, 0.285 + d], [0, -0.3, 0]); // a patch at the knee
    put(leg, dark, [0.21, 0.016, 0.29 + d], [0, -0.36, 0]);
  }
  o.slot('feet');
  for (const [leg, d] of [[ctx.legL, 0], [ctx.legR, 0.002]] as const) {
    put(leg, flat('rBoot', 0x4a2f1a), [0.29, 0.28, 0.3 + d], [0, -0.62, 0]); // a hair below the foot
    put(leg, fur, [0.315, 0.06, 0.325 + d], [0, -0.5, 0]);
    put(leg, flat('rBootTop', 0x7b5230), [0.25, 0.07, 0.07], [0, -0.715, -0.18]);
    for (const y of [-0.58, -0.64]) put(leg, cream, [0.12, 0.016, 0.022], [0, y, -0.152 - d]); // laces
  }

  const slots = o.finish();
  // A short cloak of two pieces with a ragged hem of leaf-shaped tabs, and over it the quiver of arrows (its strap is the bandolier on the chest).
  const cape = capeOf(ctx, [[0.58, 0.34], [0.64, 0.28]], cloth('cloak'), cloth('cloakLining'), null);
  const last = cape[cape.length - 1];
  [0.1, 0.17, 0.12, 0.2, 0.12, 0.16, 0.1].forEach((len, i) => {
    const w = 0.088;
    const x = -0.28 + i * 0.0933;
    const geo = ctx.box(w, len, 0.069); // a little deeper than the cloak, so a tab does not share a face with it
    tileUv(geo, [w, len, 0.069], [snap(i * 0.19), snap(0.5 + i * 0.07)]);
    geo.translate(x, -0.28 - len / 2 + 0.01, 0.0325);
    ctx.add(last, geo, [leaf, leaf, leaf, leaf, leaf, cloth('cloakLining')]);
  });
  const quiverGeo = ctx.box(0.17, 0.52, 0.17);
  tileUv(quiverGeo, [0.17, 0.52, 0.17], [0.2, 0.1]);
  const quiver = ctx.add(ctx.torso, quiverGeo, leather);
  quiver.position.set(0.13, 1.2, 0.33);
  quiver.rotation.z = -0.28;
  const rim = ctx.add(quiver, ctx.box(0.19, 0.045, 0.19), dark);
  rim.position.y = 0.26;
  const foot = ctx.add(quiver, ctx.box(0.19, 0.05, 0.19), dark);
  foot.position.y = -0.26;
  const bandGeo = ctx.box(0.18, 0.03, 0.18);
  tileUv(bandGeo, [0.18, 0.03, 0.18], GOLD);
  ctx.add(quiver, bandGeo, trim).position.y = 0.12;
  const shaft = flat('rShaft', 0xd9c9a0);
  const fletch = [feather, cream, green, feather, cream];
  ([[-0.07, 0.0], [-0.02, -0.15], [0.03, -0.3], [0.08, -0.45], [0.13, -0.6]] as const).forEach(([dx, tilt], i) => {
    const x = 0.13 + dx + 0.07;
    const a = ctx.add(ctx.torso, ctx.box(0.03, 0.24, 0.03), shaft);
    a.position.set(x, 1.5 + (dx + 0.04) * 0.2, 0.33);
    a.rotation.z = tilt;
    const f = ctx.add(ctx.torso, ctx.box(0.07, 0.07, 0.07), fletch[i]);
    f.position.set(x + tilt * -0.12, 1.64 + (dx + 0.04) * 0.2, 0.33);
    f.rotation.z = tilt;
  });  return { cape, slots };
}
