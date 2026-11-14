import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PLEAT, noise, snap, tileUv, tone, type GearCtx, type GearSlot, type MageRig, type RGB, type V3 } from './mageGear';

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

type TexKey = 'steel' | 'crimson' | 'crimsonLining' | 'trim' | 'jerkin' | 'leather' | 'cloak' | 'cloakLining' | 'fur';

const PAINT: Record<TexKey, (x: number, y: number) => string> = {
  // Plate: panels 8 pixels across with a bright top-left edge, a dark bottom-right one and a rivet in two corners; a few scratches.
  steel: (x, y) => {
    const base: RGB = [150, 158, 172];
    const px = x % 8;
    const py = y % 8;
    let d = (noise(x, y, 21) - 0.5) * 10;
    if (px === 0 || py === 0) d += 24;
    else if (px === 7 || py === 7) d -= 30;
    if ((px === 2 || px === 5) && (py === 2 || py === 5) && ((x >> 3) + (y >> 3)) % 2 === 0) d += 40;
    if ((x * 5 + y * 3) % 13 === 0) d += 16;
    return tone(base, d);
  },
  crimson: (x, y) => {
    const base: RGB = [174, 36, 44];
    return tone(base, PLEAT[x % 4] * 1.1 + (noise(x, y, 23) - 0.5) * 9);
  },
  crimsonLining: (x, y) => {
    const base: RGB = [104, 24, 34];
    return tone(base, PLEAT[x % 4] * 0.7 + (noise(x, y, 24) - 0.5) * 8 + (y % 8 === 7 ? -8 : 0));
  },
  trim: (x, y) => {
    const base: RGB = [226, 180, 64];
    let d = (noise(x, y, 11) - 0.5) * 10;
    if (x % 4 === 0) d -= 24;
    if ((x * 3 + y * 5) % 11 === 0) d += 28;
    return tone(base, d);
  },
  // Green leather: seams every 8 pixels with a row of stitches beside them.
  jerkin: (x, y) => {
    const base: RGB = [64, 112, 56];
    let d = (noise(x, y, 31) - 0.5) * 12;
    if (x % 8 === 0) d -= 24;
    else if (x % 8 === 1 && y % 4 < 2) d += 14;
    if ((x + y * 2) % 9 === 0) d -= 8;
    return tone(base, d);
  },
  leather: (x, y) => {
    const base: RGB = [112, 72, 42];
    let d = (noise(x, y, 33) - 0.5) * 12;
    if (y % 8 === 0) d -= 22;
    else if (y % 8 === 1 && x % 4 < 2) d += 14;
    if ((x * 3 + y) % 10 === 0) d -= 8;
    return tone(base, d);
  },
  cloak: (x, y) => {
    const base: RGB = [42, 84, 48];
    return tone(base, PLEAT[x % 4] * 1.1 + (noise(x, y, 35) - 0.5) * 9 + ((x + y * 3) % 11 === 0 ? 6 : 0));
  },
  cloakLining: (x, y) => {
    const base: RGB = [118, 140, 78];
    return tone(base, ((x + y) % 6 === 0 ? 10 : 0) + (noise(x, y, 36) - 0.5) * 8 - (y % 8 === 7 ? 8 : 0));
  },
  fur: (x, y) => {
    const base: RGB = [228, 216, 190];
    let d = (noise(x, y, 37) - 0.5) * 22;
    if (noise(x * 3, y, 38) > 0.82) d -= 34;
    return tone(base, d);
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

function outfit(ctx: GearCtx): Outfit {
  const batches = new Map<string, { slot: GearSlot; parent: THREE.Object3D; mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
  let cur: GearSlot = 'head';
  return {
    slot: (s) => void (cur = s),
    put(parent, mat, size, at, off) {
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
  const crimson = cloth('crimson');
  const trim = cloth('trim');
  const leather = flat('wLeather', 0x4a2e1e);
  const dark = flat('wDark', 0x22202a);
  const lining = cloth('crimsonLining');
  const steelDark = flat('wSteelDark', 0x5a6272);

  // ---- the helm: a band round the brow and over the crown, cheek plates, a nose guard, a crest with a plume that falls to the back.
  o.slot('head');
  const h = ctx.head;
  put(h, steel, [0.57, 0.25, 0.57], [0, 0.25, 0]);
  put(h, steelDark, [0.575, 0.04, 0.575], [0, 0.145, 0]); // the rim
  put(h, steel, [0.04, 0.22, 0.34], [-0.287, 0.035, 0.03]);
  put(h, steel, [0.04, 0.22, 0.34], [0.287, 0.035, 0.03]);
  put(h, steel, [0.07, 0.24, 0.045], [0, 0.11, -0.275]); // the nose guard
  put(h, trim, [0.075, 0.04, 0.05], [0, 0.23, -0.28], GOLD); // a gold stud above it
  put(h, steelDark, [0.1, 0.07, 0.6], [0, 0.4, 0]); // the crest
  put(h, steel, [0.58, 0.04, 0.16], [0, 0.385, -0.2]); // the visor lip above the eyes
  put(h, crimson, [0.09, 0.11, 0.16], [0, 0.47, -0.08]);
  put(h, crimson, [0.09, 0.13, 0.15], [0, 0.48, 0.07]);
  put(h, crimson, [0.09, 0.13, 0.14], [0, 0.45, 0.2]);
  put(h, crimson, [0.09, 0.14, 0.12], [0, 0.39, 0.31]);
  put(h, crimson, [0.09, 0.14, 0.1], [0, 0.29, 0.37]);

  // ---- the body: a breastplate with a ridge and a gold cross, a gorget, lames over the belly, a belt with a gold buckle; crimson sleeves
  // under layered pauldrons, an elbow guard, a vambrace with a gold cuff and a leather glove.
  o.slot('chest');
  const t = ctx.torso;
  put(t, steel, [0.58, 0.46, 0.31], [0, 1.26, 0]);
  put(t, steelDark, [0.57, 0.3, 0.3], [0, 0.96, 0]); // what the lames cover
  put(t, steel, [0.58, 0.085, 0.315], [0, 1.0, 0]);
  put(t, steel, [0.575, 0.085, 0.31], [0, 0.92, 0]);
  put(t, steel, [0.1, 0.4, 0.035], [0, 1.27, -0.172]); // the ridge down the front
  put(t, trim, [0.045, 0.2, 0.02], [0, 1.31, -0.19], GOLD);
  put(t, trim, [0.15, 0.045, 0.02], [0, 1.35, -0.19], GOLD);
  put(t, steel, [0.48, 0.1, 0.33], [0, 1.495, 0]); // the gorget
  put(t, trim, [0.5, 0.025, 0.34], [0, 1.445, 0], GOLD);
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
    put(arm, steelDark, [0.29, 0.06, 0.29], [0, -0.33, 0]);
    put(arm, steel, [0.31, 0.26, 0.31], [0, -0.5, 0]); // the vambrace
    put(arm, trim, [0.32, 0.03, 0.32], [0, -0.385, 0], GOLD);
    put(arm, leather, [0.27, 0.12, 0.27], [0, -0.69, 0]); // the glove
  }

  // ---- the thighs: a tasset on each leg over dark cloth, with a knee guard and a gold stud.
  o.slot('legs');
  for (const [leg, d] of [[ctx.legL, 0], [ctx.legR, 0.002]] as const) {
    put(leg, steel, [0.295, 0.2, 0.325 + d], [0, -0.07, 0]);
    put(leg, trim, [0.3, 0.024, 0.33 + d], [0, -0.17, 0], GOLD);
    put(leg, lining, [0.265, 0.26, 0.27], [0, -0.3, 0]);
    put(leg, steel, [0.295, 0.13, 0.31 + d], [0, -0.43, 0]);
    put(leg, trim, [0.055, 0.055, 0.02], [0, -0.43, -0.16 - d], GOLD);
  }

  // ---- the shins and feet: greaves, and boots with a steel toe.
  o.slot('feet');
  for (const [leg, d] of [[ctx.legL, 0], [ctx.legR, 0.002]] as const) {
    put(leg, steel, [0.285, 0.15, 0.3 + d], [0, -0.55, 0]);
    put(leg, steelDark, [0.29, 0.03, 0.305 + d], [0, -0.64, 0]);
    put(leg, leather, [0.28, 0.1, 0.3 + d], [0, -0.7, 0]);
    put(leg, steel, [0.26, 0.06, 0.07], [0, -0.72, -0.18]);
  }

  const slots = o.finish();
  const cape = capeOf(ctx, [[0.56, 0.4], [0.62, 0.34], [0.68, 0.3]], crimson, cloth('crimsonLining'), trim);
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
    }
  }

  // ---- the legs: trousers, and boots with a turned-down tan cuff.
  o.slot('legs');
  for (const [leg, d] of [[ctx.legL, 0], [ctx.legR, 0.002]] as const) {
    put(leg, leather, [0.265, 0.46, 0.275 + d], [0, -0.23, 0]);
    put(leg, dark, [0.27, 0.025, 0.28 + d], [0, -0.14, 0]);
  }
  o.slot('feet');
  for (const [leg, d] of [[ctx.legL, 0], [ctx.legR, 0.002]] as const) {
    put(leg, flat('rBoot', 0x4a2f1a), [0.29, 0.27, 0.3 + d], [0, -0.615, 0]);
    put(leg, fur, [0.315, 0.06, 0.325 + d], [0, -0.5, 0]);
    put(leg, flat('rBootTop', 0x7b5230), [0.25, 0.07, 0.07], [0, -0.715, -0.18]);
  }

  const slots = o.finish();
  // A short cloak of two pieces, and over it the quiver of arrows (its strap is the bandolier on the chest).
  const cape = capeOf(ctx, [[0.58, 0.34], [0.64, 0.28]], cloth('cloak'), cloth('cloakLining'), null);
  const q = flat('rQuiver', 0x74492a);
  const quiver = ctx.add(ctx.torso, ctx.box(0.17, 0.52, 0.17), q);
  quiver.position.set(0.13, 1.2, 0.33);
  quiver.rotation.z = -0.28;
  const shaft = flat('rShaft', 0xd9c9a0);
  for (const [dx, tilt] of [[-0.04, -0.12], [0.02, -0.28], [0.08, -0.44]] as const) {
    const x = 0.13 + dx + 0.07;
    const a = ctx.add(ctx.torso, ctx.box(0.03, 0.24, 0.03), shaft);
    a.position.set(x, 1.5 + (dx + 0.04) * 0.2, 0.33);
    a.rotation.z = tilt;
    const f = ctx.add(ctx.torso, ctx.box(0.07, 0.07, 0.07), feather);
    f.position.set(x + tilt * -0.12, 1.64 + (dx + 0.04) * 0.2, 0.33);
    f.rotation.z = tilt;
  }
  return { cape, slots };
}
