import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WingDef } from '@solrift/shared';

/**
 * The wings on a hero's back (see wings.ts): a pair, each a group hinged at the shoulder blade that opens and closes with the clock, and beats hard
 * while the wearer flies. Three kinds are drawn: the long feathers of a bird (laid like the rows of a real wing: coverts, secondaries and the long
 * primaries), the glassy blades of an insect, and a bat's skin stretched on bone. They are solid and lit like the armor, with a bright tip
 * on the second wings, and nothing floats off them.
 */

type V3 = [number, number, number];
const DEG = Math.PI / 180;

/** What the rig needs of its figure: the part of the body it hangs from. */
export interface WingRig {
  /** The geometries to light (they carry vertex colours, painted by the figure like the rest of its blocks). */
  geos: THREE.BufferGeometry[];
  /** `flying`: the wings beat; `lift` (0..1) how hard the figure is moving. */
  update(t: number, dt: number, flying: boolean, lift: number): void;
  dispose(): void;
}

function boxGeo(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(24 * 3).fill(1), 3));
  return g;
}

const shade = (hex: string, k: number): THREE.Color => {
  const c = new THREE.Color(hex);
  return k >= 0 ? c.lerp(new THREE.Color(1, 1, 1), k) : c.multiplyScalar(1 + k);
};

/** The blocks of one wing, collected by material and joined into one mesh each at the end. */
class Batch {
  private readonly by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(mat: THREE.Material, geo: THREE.BufferGeometry): void {
    const list = this.by.get(mat);
    if (list) list.push(geo);
    else this.by.set(mat, [geo]);
  }

  /**
   * A blade of `segs` blocks laid end to end from `at`, pointing `angle` radians up from the outward direction (+x), leaning back by `lean`, each block turned
   * `curl` more than the one before (negative: drooping) and as wide as `width(i, n)` says. `edge` puts a narrow strip of another material along its upper edge.
   */
  blade(mat: THREE.Material | THREE.Material[], edge: THREE.Material | null, at: V3, angle: number, lean: number, len: number, segs: number, width: (i: number, n: number) => number, depth: number, curl: number, tip?: THREE.Material): void {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(lean, 0, angle - Math.PI / 2)), new THREE.Vector3(1, 1, 1));
    const step = new THREE.Matrix4();
    const turn = new THREE.Matrix4();
    const h = len / segs;
    for (let i = 0; i < segs; i++) {
      const w = width(i, segs);
      const place = (size: V3, shift: V3, material: THREE.Material): void => {
        const geo = boxGeo(...size);
        geo.translate(...shift);
        geo.applyMatrix4(m);
        this.add(material, geo);
      };
      const last = i === segs - 1;
      // (A list of materials is a ramp from the root of the blade to its tip.)
      const here = Array.isArray(mat) ? mat[Math.min(mat.length - 1, Math.floor((i / segs) * mat.length))] : mat;
      place([w, h * 1.03, depth], [0, h / 2, 0], last && tip ? tip : here);
      if (edge && !last) place([Math.max(0.014, w * 0.2), h * 1.05, depth * 1.4], [-(w / 2 - w * 0.1), h / 2, 0], edge);
      m.multiply(step.makeTranslation(0, h, 0)).multiply(turn.makeRotationZ(curl));
    }
  }

  /** A flat triangle fan (a membrane), the same on both faces. `pts` go round its edge; the fan runs from the first. */
  fan(mat: THREE.Material, pts: V3[]): void {
    const pos: number[] = [];
    for (let i = 1; i < pts.length - 1; i++) pos.push(...pts[0], ...pts[i], ...pts[i + 1]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const n = pos.length / 3;
    const nor: number[] = [];
    for (let i = 0; i < n; i++) nor.push(0, 0, 1);
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    this.add(mat, geo);
  }

  /** Join the blocks of each material and hang them on `parent`; returns the joined geometries. */
  flush(parent: THREE.Object3D, geos: THREE.BufferGeometry[]): void {
    for (const [mat, list] of this.by) {
      // (The parts of a fan have no index and those of a box have: they are made alike before they are joined.)
      const same = list.map((g) => (g.index ? g.toNonIndexed() : g));
      const merged = mergeGeometries(same);
      for (const g of list) g.dispose();
      for (const g of same) if (!list.includes(g)) g.dispose();
      if (!merged) continue;
      parent.add(new THREE.Mesh(merged, mat));
      geos.push(merged);
    }
    this.by.clear();
  }
}

type Mats = { bodyG: THREE.Material[]; deepG: THREE.Material[]; body: THREE.Material; deep: THREE.Material; edge: THREE.Material; light: THREE.Material; pale: THREE.Material };

/** A point `u` (0..1) of the way along a polyline. */
function along(pts: V3[], u: number): { at: V3; dir: number } {
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    lens.push(l);
    total += l;
  }
  let d = Math.min(0.9999, Math.max(0, u)) * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const f = d / lens[i];
      const a = pts[i];
      const b = pts[i + 1];
      return { at: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, 0], dir: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    }
    d -= lens[i];
  }
  return { at: pts[0], dir: 0 };
}

/** A bone from `from` to `to` (in the plane of the wing), `w` thick. */
function bone(batch: Batch, mat: THREE.Material, from: V3, to: V3, w: number, z = 0.01): void {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  batch.blade(mat, null, [from[0], from[1], z], Math.atan2(dy, dx), 0, Math.hypot(dx, dy), 2, () => w, 0.045, 0);
}

/**
 * One wing, on the right side (+x outward, +y up, +z behind), its shoulder at the origin. It is built on an arm that rises from the shoulder and
 * bends out and down to the tip (the shape of an angel's wing, a dragon's, an insect's): feathers, blades or the fingers of a bat hang from the arm
 * and fan out, the short ones by the shoulder and the longest at the tip, so that their ends make the long curve of the lower edge.
 */
function buildWing(def: WingDef, mats: Mats, batch: Batch): void {
  const t2 = def.tier === 2;
  const { body, deep, edge, light, pale } = mats;
  // The size of the wing (blocks from the shoulder to the tip): the second wings are half as big again.
  const S = t2 ? 1.3 : 0.95;
  // The arm: up and out from the shoulder, over the top, and down toward the tip.
  const arm: V3[] = [[0, 0, 0], [0.14 * S, 0.22 * S, 0], [0.36 * S, 0.34 * S, 0], [0.66 * S, 0.36 * S, 0], [0.95 * S, 0.26 * S, 0], [1.12 * S, 0.1 * S, 0]];

  if (def.shape === 'bat') {
    // Skin on bone: an arm with a wrist, fingers that spread from it, and the skin sagging between the fingers in panels of two shades.
    const wrist = arm[4];
    const tips: V3[] = (t2 ? [[-2, 0.95], [-22, 1.0], [-42, 0.95], [-62, 0.82], [-82, 0.64]] : [[-6, 0.9], [-34, 0.9], [-62, 0.75], [-86, 0.58]]).map(([a, l]) => [wrist[0] + Math.cos(a * DEG) * l * S, wrist[1] + Math.sin(a * DEG) * l * S, 0] as V3);
    const mid = (p: V3, q: V3): V3 => {
      const mx = (p[0] + q[0]) / 2;
      const my = (p[1] + q[1]) / 2;
      return [mx + (wrist[0] - mx) * 0.3, my + (wrist[1] - my) * 0.3, 0];
    };
    const body0: V3 = [0.02, -0.5 * S * 0.55, 0];
    batch.fan(deep, [arm[0], arm[1], arm[2], arm[3], wrist]); // the skin under the arm
    for (let i = 0; i < tips.length - 1; i++) batch.fan(i % 2 ? deep : body, [wrist, tips[i], mid(tips[i], tips[i + 1]), tips[i + 1]]);
    batch.fan(body, [arm[0], wrist, tips[tips.length - 1], body0]);
    for (let i = 1; i < arm.length; i++) bone(batch, edge, arm[i - 1], arm[i], 0.1 - i * 0.012);
    for (const tip of tips) {
      bone(batch, edge, wrist, tip, 0.055);
      // A hook at the end of each finger.
      batch.blade(t2 ? light : edge, null, [tip[0], tip[1], 0.01], Math.atan2(tip[1] - wrist[1], tip[0] - wrist[0]) - 0.5, 0, 0.16 * S * 0.7, 2, (i, n) => 0.06 * (1 - i / n), 0.045, 0.5);
    }
    batch.blade(edge, null, [wrist[0], wrist[1], 0.01], 95 * DEG, 0, 0.3, 3, (i, n) => 0.09 * (1 - i / n), 0.05, 0.3); // the claw at the wrist
    if (t2) for (const tip of tips) bone(batch, light, [wrist[0] + (tip[0] - wrist[0]) * 0.25, wrist[1] + (tip[1] - wrist[1]) * 0.25, 0], [wrist[0] + (tip[0] - wrist[0]) * 0.92, wrist[1] + (tip[1] - wrist[1]) * 0.92, 0], 0.025, 0.035);
    return;
  }

  const bulge = (w: number) => (i: number, n: number): number => w * (0.28 + 0.72 * Math.sin(Math.PI * (0.1 + 0.82 * ((i + 0.5) / n))));
  // A feather (or a blade of glass) hangs from `u` of the way along the arm, pointing `a` degrees from outward (negative: down), `len` long.
  const hang = (u: number, a: number, len: number, w: number, mat: THREE.Material | THREE.Material[], z: number, tip: THREE.Material | null, rim: THREE.Material | null, curl: number): void => {
    const p = along(arm, u);
    const segs = Math.max(4, Math.round(len * 8));
    batch.blade(mat, rim, [p.at[0], p.at[1], z], a * DEG, 0.12, len, segs, def.shape === 'feather' ? bulge(w) : (i, n) => w * (0.3 + 0.7 * Math.sin(((i + 0.55) / (n + 0.1)) * Math.PI)), 0.035, curl, tip ?? undefined);
  };
  const rows = t2 ? 14 : 10;
  const feather = def.shape === 'feather';
  for (let i = 0; i < rows; i++) {
    const f = i / (rows - 1);
    // Near the shoulder the feathers point down, near the tip they point out and a little down; the tip ones are the longest.
    const a = -88 + f * 62;
    const long = S * (0.44 + 0.62 * Math.pow(f, 0.8));
    const u = 0.14 + f * 0.86;
    // The row behind (shorter, darker) shows between the long ones, and the coverts (pale, short) close the arm.
    hang(u - 0.04, a - 6, long * 0.78, 0.2 * S, mats.deepG, -0.025, null, null, -0.06);
    hang(u, a, long, (feather ? 0.22 : 0.26) * S, mats.bodyG, 0.0 + i * 0.002, t2 ? (feather ? pale : light) : edge, edge, -0.07);
    if (!feather) hang(u, a, long * 0.84, 0.03 * S, light, 0.03 + i * 0.002, null, null, -0.07); // the vein of a blade
    hang(u + 0.02, a + 3, long * 0.36, 0.17 * S, pale, 0.03 + i * 0.002, null, null, -0.04);
  }
  for (let i = 1; i < arm.length; i++) bone(batch, edge, arm[i - 1], arm[i], 0.09 - i * 0.012, 0.045);
  if (t2) for (const p of [arm[3], arm[4]]) batch.blade(light, null, [p[0], p[1] + 0.02, 0.05], 85 * DEG, 0, 0.22, 2, (i, n) => 0.07 * (1 - i / n), 0.05, 0.2);
}

/** The wings of `def` on `torso`, hung on the back between the shoulder blades. */
export function buildWings(def: WingDef, torso: THREE.Object3D): WingRig {
  const root = new THREE.Group();
  root.position.set(0, 1.36, 0.16);
  root.scale.setScalar(1);
  torso.add(root);
  const mk = (color: THREE.Color, lit = true): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ vertexColors: lit, color, side: THREE.DoubleSide });
  // The colour runs from a deeper tone at the root of every feather to the colour of its light at the tip.
  const rampOf = (from: THREE.Color, to: THREE.Color, n: number, dark = 0): THREE.Material[] =>
    Array.from({ length: n }, (_, i) => mk(from.clone().lerp(to, n === 1 ? 0 : i / (n - 1)).multiplyScalar(1 - dark)));
  const tipTone = new THREE.Color(def.body).lerp(new THREE.Color(def.glow), def.shape === 'blade' ? (def.tier === 2 ? 0.6 : 0.45) : def.tier === 2 ? 0.45 : 0.32);
  const mats: Mats = {
    bodyG: rampOf(shade(def.body, -0.2), tipTone, 4),
    deepG: rampOf(shade(def.body, -0.2), tipTone, 4, 0.4),
    body: mk(shade(def.body, 0)),
    deep: mk(shade(def.body, -0.45)),
    edge: mk(shade(def.trim, 0)),
    pale: mk(shade(def.body, def.shape === 'bat' ? 0.1 : -0.06)),
    // (the light of the tips is not lit by the sun: it shines by itself)
    light: mk(shade(def.glow, 0.05), false),
  };
  const geos: THREE.BufferGeometry[] = [];
  const sides: THREE.Group[] = [];
  for (const s of [1, -1]) {
    const hinge = new THREE.Group();
    hinge.position.set(s * 0.1, 0, 0);
    // The left wing is the right one turned over (so every material is drawn on both faces).
    hinge.scale.x = s;
    const batch = new Batch();
    buildWing(def, mats, batch);
    // The shoulder plate the wing grows from.
    const plate = boxGeo(0.12, 0.2, 0.07);
    plate.translate(0.0, -0.04, 0.0);
    batch.add(mats.edge, plate);
    if (def.tier === 2) {
      const core = boxGeo(0.07, 0.1, 0.09);
      core.translate(0.0, -0.04, 0.01);
      batch.add(mats.light, core);
    }
    batch.flush(hinge, geos);
    root.add(hinge);
    sides.push(hinge);
  }
  // The light that comes off them, as the effects of the sets do (see setKit.ts): embers that rise off bat wings, motes that drift down off the
  // feathers, and sparks that glint in the glass. Each is a point of light (a pixel of it) that is born, drifts and fades out; the second wings shed more.
  const t2 = def.tier === 2;
  const COUNT = t2 ? 36 : 16;
  const S = t2 ? 1.3 : 0.95;
  const ppos = new Float32Array(COUNT * 3);
  const pcol = new Float32Array(COUNT * 4); // (red, green, blue, and how much of it shows)
  const page = new Float32Array(COUNT);
  const plife = new Float32Array(COUNT);
  const pvel = new Float32Array(COUNT * 3);
  const glow = new THREE.Color(def.glow);
  const spawn = (i: number, early: boolean): void => {
    const side = Math.random() < 0.5 ? 1 : -1;
    const lower = def.shape === 'feather' ? 0.5 : 0.35;
    ppos[i * 3] = side * (0.12 + Math.random() * S * 1.05);
    ppos[i * 3 + 1] = (Math.random() * (0.3 + lower) - lower) * S;
    ppos[i * 3 + 2] = 0.05 + Math.random() * 0.14;
    if (def.shape === 'bat') {
      pvel[i * 3] = (Math.random() - 0.5) * 0.12;
      pvel[i * 3 + 1] = 0.25 + Math.random() * 0.3; // embers rise
      pvel[i * 3 + 2] = 0.04;
      plife[i] = 0.9 + Math.random() * 0.9;
    } else if (def.shape === 'feather') {
      pvel[i * 3] = side * 0.03 + (Math.random() - 0.5) * 0.04;
      pvel[i * 3 + 1] = -0.07 - Math.random() * 0.1; // motes sink slowly
      pvel[i * 3 + 2] = 0.05;
      plife[i] = 1.6 + Math.random() * 1.6;
    } else {
      pvel[i * 3] = (Math.random() - 0.5) * 0.04;
      pvel[i * 3 + 1] = (Math.random() - 0.5) * 0.04; // sparks glint where they are
      pvel[i * 3 + 2] = 0.02;
      plife[i] = 0.5 + Math.random() * 0.8;
    }
    page[i] = early ? Math.random() * plife[i] : 0;
  };
  for (let i = 0; i < COUNT; i++) spawn(i, true);
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
  pgeo.setAttribute('color', new THREE.BufferAttribute(pcol, 4));
  const pmat = new THREE.PointsMaterial({ size: t2 ? 0.1 : 0.08, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true });
  const points = new THREE.Points(pgeo, pmat);
  points.frustumCulled = false;
  root.add(points);
  const shine = (dt: number, t: number): void => {
    for (let i = 0; i < COUNT; i++) {
      page[i] += dt;
      if (page[i] >= plife[i]) spawn(i, false);
      for (let k = 0; k < 3; k++) ppos[i * 3 + k] += pvel[i * 3 + k] * dt;
      const f = page[i] / plife[i];
      // In and out: a quick rise to full and a slow fade; the sparks of glass flicker as well.
      let a = Math.min(1, f * 5) * (1 - f) * (1 - f) * 1.6;
      if (def.shape === 'blade') a *= 0.55 + 0.45 * Math.sin(t * 17 + i * 3.1);
      a = Math.max(0, Math.min(1, a));
      pcol[i * 4] = glow.r;
      pcol[i * 4 + 1] = glow.g;
      pcol[i * 4 + 2] = glow.b;
      pcol[i * 4 + 3] = a;
    }
    pgeo.attributes.position.needsUpdate = true;
    pgeo.attributes.color.needsUpdate = true;
  };
  shine(0, 0);
  let fly = 0;
  return {
    geos,
    update(t, dt, flying, lift) {
      shine(Math.min(dt, 0.1), t);
      fly += ((flying ? 1 : 0) - fly) * Math.min(1, dt * 5);
      if (fly < 0.002) fly = 0;
      const beat = Math.sin(t * (2.1 + lift * 0.9) * Math.PI * 2);
      // At rest the wings stand a little open and breathe; on the wing they open wide and beat.
      const phi = 0.2 + lift * 0.06 + Math.sin(t * 1.7) * 0.04 * (1 - fly) + (beat * 0.55 - 0.05) * fly;
      const sweep = 0.5 - 0.22 * fly + Math.sin(t * 1.3) * 0.04 * (1 - fly) - beat * 0.08 * fly;
      sides.forEach((h, i) => {
        const s = i === 0 ? 1 : -1;
        h.rotation.z = s * phi;
        h.rotation.y = -s * sweep;
      });
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of Object.values(mats).flat()) m.dispose();
      pgeo.dispose();
      pmat.dispose();
      root.parent?.remove(root);
    },
  };
}
