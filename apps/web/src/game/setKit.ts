import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { OutfitDef } from '@solrift/shared';
import { jitter, lerp, noise, rgbs, tileUv, type GearCtx, type RGB, type V3 } from './mageGear';

/**
 * The parts every set of armor is made from, whatever the class (see `warriorSet.ts`, `mageSet.ts`, `rangerSet.ts`): the pictures and the lights, the
 * way blocks are put on the figure and merged into a few meshes, curved blades and feathers, hinged cloth that streams when the hero runs, and what
 * stands clear of the body: a halo, balls of light that float round it, tongues of fire, and sparks of a dozen kinds. Nothing solid and nothing
 * round and flat: only light that drifts, rises and flickers. A `SetBuilder` holds one set while it is made and gives back its `SetRig`.
 */

export type { RGB, V3 };
export const DEG = Math.PI / 180;

export interface SetCtx extends GearCtx {
  /** The root of the figure: what stands clear of the body (the wings' glow, the halo, the ring, the sparks) hangs from it. */
  root: THREE.Object3D;
}

export interface SetRig {
  /** The glow behind the figure: on a see-through canvas (a menu) its edge shows against the page, so a menu may leave it off. */
  halo: THREE.Object3D;
  /** What stands clear of the body and is only for show: hidden for the arm in the first-person hand. */
  effects: THREE.Group;
  /** How far the set reaches above the head, in blocks (the name tag and the camera make room for it). */
  height: number;
  /** How much wider than a figure the set is: the camera of a preview stands back for it. */
  extent: number;
  /** Move the lights and the wings: `t` is a clock in seconds, `dt` the seconds since the last call, `lift` how hard the figure is moving (0..1). */
  update(t: number, dt: number, lift: number): void;
  /** Take what stands clear of the body off the figure (the blocks of the suit are taken off by the figure, which made them). */
  dispose(): void;
}

export type SparkKind = 'rise' | 'embers' | 'snow' | 'orbit' | 'inward' | 'bubbles' | 'leaves' | 'petals' | 'fireflies' | 'spiral' | 'arcs' | 'flames';

export const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const css = (c: RGB, a = 1): string => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
export const scale = (c: RGB, k: number): RGB => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];

// ---- pictures and materials -------------------------------------------------------------------------------------------------

const textures = new Map<string, THREE.Texture>();
const materials = new Map<string, THREE.Material>();
/** Lights that breathe: the colour they have at rest, and where in the breath each is. */
const glows: { mat: THREE.MeshBasicMaterial; base: THREE.Color; phase: number; depth: number }[] = [];

/** A picture one block wide (16 pixels), painted pixel by pixel, that repeats. */
export function paint16(key: string, paint: (x: number, y: number) => string): THREE.CanvasTexture {
  let t = textures.get(key) as THREE.CanvasTexture | undefined;
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      g.fillStyle = paint(x, y);
      g.fillRect(x, y, 1, 1);
    }
  }
  t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  textures.set(key, t);
  return t;
}

/** The set's own metal for edges and settings (gold, silver, bone): engraved lines every four pixels and glints. */
export function trimTexture(def: OutfitDef): THREE.CanvasTexture {
  const t = hex(def.trim);
  return paint16(`trim:${def.id}`, (x, y) => {
    let c: RGB = t;
    if (x % 4 === 0) c = lerp(t, [0, 0, 0], 0.32);
    else if (x % 4 === 1) c = lerp(t, [255, 255, 255], 0.25);
    if ((x * 3 + y * 5) % 11 === 0) c = lerp(t, [255, 255, 255], 0.7);
    return rgbs(jitter(c, x, y, 47, 8));
  });
}

/**
 * A soft picture of light drawn by a canvas (the halo, a spark, the ring), freed with the rest. A canvas keeps its pictures with the colour multiplied by
 * the see-through-ness, so where the picture is nearly clear the colour is mostly lost, and comes back as stray bright greens and whites that make a
 * hard edge round a soft glow. Those are given the colour `base` again, and the picture is kept as plain data.
 */
export function canvasTex(key: string, size: number, base: RGB, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.Texture {
  let t = textures.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  draw(g, size);
  const px = g.getImageData(0, 0, size, size).data;
  const data = new Uint8Array(px.length);
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    const keep = Math.min(1, a / 160); // the colour the picture really has, where it has enough of it to be sure
    data[i] = Math.round(base[0] + (px[i] - base[0]) * keep);
    data[i + 1] = Math.round(base[1] + (px[i + 1] - base[1]) * keep);
    data[i + 2] = Math.round(base[2] + (px[i + 2] - base[2]) * keep);
    data[i + 3] = a;
  }
  t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  textures.set(key, t);
  return t;
}

/** A lit material (vertex colours carry the sun) with a picture, made once per key. */
export function lit(key: string, tex: () => THREE.Texture): THREE.MeshBasicMaterial {
  let m = materials.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    // The metal of the trim sits on the cloth, plate or leather it edges: where their faces share a plane (a band round a hat, a rim on a plate) the trim
    // is drawn in front, so the two never fight.
    m = new THREE.MeshBasicMaterial({ map: tex(), vertexColors: true, ...(key.startsWith('trim:') ? { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 } : {}) });
    materials.set(key, m);
  }
  return m;
}

/**
 * Light that shines by itself. `power` above 1 puts it over the threshold of the glow of the picture, so it blooms; `soft` is the translucent kind
 * (the edge of a blade) that adds its light to what is behind it.
 */
export function light(key: string, color: RGB, power: number, soft: boolean, depth = 0.12): THREE.MeshBasicMaterial {
  let m = materials.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    const base = new THREE.Color().setRGB((color[0] / 255) * power, (color[1] / 255) * power, (color[2] / 255) * power, THREE.SRGBColorSpace);
    // Light is drawn in front of whatever it lies on (the seam of light in a plate, the lit edge of a blade): a bias in depth, so it never fights it for the pixel.
    const front = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
    m = new THREE.MeshBasicMaterial(soft ? { color: base, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, ...front } : { color: base, ...front });
    materials.set(key, m);
    glows.push({ mat: m, base: base.clone(), phase: glows.length * 0.9, depth });
  }
  return m;
}

/** Make the lights of the sets breathe (cheap, and the same however many figures ask: they all want the same value for the same time). */
function breathe(t: number): void {
  for (const g of glows) g.mat.color.copy(g.base).multiplyScalar(1 - g.depth * 0.5 + g.depth * 0.5 * Math.sin(t * 2.4 + g.phase));
}

export function disposeSetKit(): void {
  for (const m of materials.values()) m.dispose();
  materials.clear();
  glows.length = 0;
  for (const t of textures.values()) t.dispose();
  textures.clear();
}

const sparkTex = (): THREE.Texture =>
  canvasTex('spark', 32, [255, 255, 255], (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.25, 'rgba(255,255,255,0.7)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  });

/** A tongue of fire: tall and pointed at the top, bright at the root. */
const flameTex = (): THREE.Texture =>
  canvasTex('flame', 64, [255, 255, 255], (g, s) => {
    g.filter = 'blur(2px)';
    const v = g.createLinearGradient(0, s * 0.1, 0, s * 0.9);
    v.addColorStop(0, 'rgba(255,255,255,0.35)');
    v.addColorStop(0.55, 'rgba(255,255,255,0.95)');
    v.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = v;
    g.beginPath();
    g.moveTo(s * 0.5, s * 0.06); // the tip
    g.bezierCurveTo(s * 0.62, s * 0.38, s * 0.84, s * 0.5, s * 0.74, s * 0.72);
    g.bezierCurveTo(s * 0.68, s * 0.9, s * 0.32, s * 0.9, s * 0.26, s * 0.72);
    g.bezierCurveTo(s * 0.16, s * 0.5, s * 0.38, s * 0.38, s * 0.5, s * 0.06);
    g.fill();
  });

const haloTex = (def: OutfitDef): THREE.Texture =>
  canvasTex(`halo:${def.id}`, 128, hex(def.glow), (g, s) => {
    const c = hex(def.glow);
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    // Light adds up in linear space and is shown in sRGB, which makes the faintest light the brightest-looking step: fall to nothing smoothly (a cubic).
    for (let i = 0; i <= 20; i++) {
      const u = i / 20;
      const a = Math.pow(1 - u, 3.2);
      r.addColorStop(u, css(lerp(c, [255, 255, 255], 0.5 * Math.max(0, 1 - u * 4)), 0.95 * a));
    }
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  });

// ---- the builder ------------------------------------------------------------------------------------------------------------

export interface WingSpec {
  /** Where each wing grows from, on the torso, for the right side (the left is its mirror). */
  at: V3;
  blades: number;
  /** The longest blade (blocks). */
  len: number;
  curl: number;
  /** How far the lowest and the highest blade are turned out from straight up (degrees). */
  spread: [number, number];
  /** How far the blades lean back (radians) for the highest and the lowest. */
  sweep?: [number, number];
  mat: THREE.Material;
  /** What the wings grow from, a small plate on the shoulder blade. */
  base: THREE.Material;
  edge?: THREE.Material | null;
  /** A bright line along each blade. */
  spine?: THREE.Material | null;
  /** The width of a blade at its root; it narrows to a point (a blade) or bulges and then narrows (a feather). */
  width: number;
  feather?: boolean;
  segs?: number;
  /** How much they open and flutter (1 is the usual). */
  flap?: number;
}

export interface OrbiterSpec {
  count: number;
  radius: number;
  y: number;
  size: number;
  /** Radians a second; negative turns the other way. */
  speed: number;
  /** How much each rises and falls. */
  bob?: number;
  /** Tilt of the plane they orbit in (radians). */
  tilt?: number;
}

/** How far the head blocks of a set sit lower than they are written (see `push`). */
const HEAD_DROP = -0.15;

export class SetBuilder {
  readonly glowC: RGB;
  readonly hot: RGB;
  readonly trimC: RGB;
  readonly effects = new THREE.Group();
  readonly core: THREE.MeshBasicMaterial;
  readonly edge: THREE.MeshBasicMaterial;
  readonly gem: THREE.MeshBasicMaterial;
  readonly t: THREE.Object3D;
  readonly head: THREE.Object3D;
  private readonly own: THREE.Object3D[] = [];
  private readonly anim: ((time: number, dt: number, lift: number) => void)[] = [];
  private readonly frees: (() => void)[] = [];
  private readonly batches = new Map<string, { parent: THREE.Object3D; mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
  private haloObj: THREE.Object3D | null = null;

  constructor(readonly ctx: SetCtx, readonly def: OutfitDef) {
    this.glowC = hex(def.glow);
    this.hot = lerp(this.glowC, [255, 255, 255], 0.55);
    this.trimC = hex(def.trim);
    this.core = light(`core:${def.id}`, this.hot, 2.6, false, 0.1);
    this.edge = light(`edge:${def.id}`, this.glowC, 1.9, true, 0.25);
    this.gem = light(`gem:${def.id}`, this.glowC, 2.2, false, 0.2);
    this.t = ctx.torso;
    this.head = ctx.head;
    ctx.root.add(this.effects);
    this.own.push(this.effects);
  }

  /** Blocks laid in a row (a horn, a feather, a fin) have faces in one plane where they meet and overlap, and two blocks of a set may rest on one plane by accident:
   *  the picture of both is drawn on the same pixels and flickers as the camera moves. So no two blocks that are laid one after the other sit in quite the same
   *  place: each is moved a hair (a hundredth of a pixel of the skin or so), by a different step on each axis, which puts any two of their coplanar faces apart. */
  private nudged = 0;

  private push(parent: THREE.Object3D, mat: THREE.Material, geo: THREE.BufferGeometry): void {
    const n = this.nudged++;
    const step = 0.0011;
    // The sets are laid out on a head that spans 0..0.5 from its chin; the head box really spans -0.15..0.35 about its pivot.
    if (parent === this.head) geo.translate(0, HEAD_DROP, 0);
    geo.translate(((n % 7) - 3) * step, (((n * 3) % 7) - 3) * step, (((n * 5) % 7) - 3) * step);
    const key = `${parent.id}:${mat.uuid}`;
    let b = this.batches.get(key);
    if (!b) this.batches.set(key, (b = { parent, mat, geos: [] }));
    b.geos.push(geo);
  }

  /** A block of the suit: it joins the others of its part and material into one mesh. `rot` turns it about its own middle before it is put at `at`. */
  put(parent: THREE.Object3D, mat: THREE.Material, size: V3, at: V3, rot?: V3, off?: [number, number]): void {
    const geo = this.ctx.box(...size);
    tileUv(geo, size, off ?? [Math.round((((at[0] * 7.3 + at[2] * 3.1) % 1) + 1) % 1 * 16) / 16, Math.round((((at[1] * 5.1) % 1) + 1) % 1 * 16) / 16]);
    if (rot) geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])));
    geo.translate(...at);
    this.push(parent, mat, geo);
  }

  /**
   * A curved blade (a horn, a spike, a feather of a wing): `segs` blocks laid end to end from `at`, each turned `curl` more than the one before, narrowing
   * from `w0` to `w1` (or, with `widthAt`, as it says). `side` puts the lit edge on the outside of the curve (1 or -1). With `taperDepth` it narrows front to back
   * as it narrows across (a cone, a tail of cloth) instead of keeping its `depth`.
   */
  chain(parent: THREE.Object3D, mat: THREE.Material, edgeMat: THREE.Material | null, at: V3, euler: V3, segs: number, len: number, w0: number, w1: number, depth: number, curl: V3, side = 1, widthAt?: (i: number, n: number) => number, taperDepth = false): void {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(euler[0], euler[1], euler[2])), new THREE.Vector3(1, 1, 1));
    const step = new THREE.Matrix4();
    const turn = new THREE.Matrix4();
    const h = len / segs;
    for (let i = 0; i < segs; i++) {
      const w = widthAt ? widthAt(i, segs) : w0 + (w1 - w0) * (segs === 1 ? 0 : i / (segs - 1));
      const place = (size: V3, shift: V3, material: THREE.Material): void => {
        const geo = this.ctx.box(...size);
        tileUv(geo, size, [(i * 0.31) % 1, 0]);
        geo.translate(shift[0], shift[1], shift[2]);
        geo.applyMatrix4(m);
        this.push(parent, material, geo);
      };
      const d = taperDepth ? Math.max(0.02, depth * (w / Math.max(w0, 0.001))) : depth;
      place([w, h * 1.02, d], [0, h / 2, 0], mat);
      // (The edge stands a hair out of the side it lights: its outer face in the very plane of the blade's own would fight it.)
      if (edgeMat) place([Math.max(0.012, w * 0.22), h * 1.04, d * 1.5], [side * (w / 2 - w * 0.11 + 0.003), h / 2, 0], edgeMat);
      m.multiply(step.makeTranslation(0, h, 0)).multiply(turn.makeRotationFromEuler(new THREE.Euler(curl[0], curl[1], curl[2])));
    }
  }

  /** A part of the body that moves of its own (a wing, a cloak): a group on `parent` that the figure takes off again. */
  group(parent: THREE.Object3D, at: V3): THREE.Group {
    const g = new THREE.Group();
    g.position.set(...at);
    parent.add(g);
    this.own.push(g);
    return g;
  }

  /**
   * Hinged cloth: `count` pieces hung one from the next from `at` on `parent`, `segLen` apart, each made by `make`. When the hero moves the cloth streams
   * back, the lower pieces more, and it stirs a little at rest.
   */
  hang(parent: THREE.Object3D, at: V3, count: number, segLen: number, make: (g: THREE.Group, i: number) => void, stream = 0.5, flutter = 0.06, phase = 0): THREE.Group[] {
    const gs: THREE.Group[] = [];
    let p: THREE.Object3D = parent;
    for (let i = 0; i < count; i++) {
      const g = i === 0 ? this.group(parent, at) : new THREE.Group();
      if (i > 0) {
        g.position.set(0, -segLen, 0);
        p.add(g);
      }
      make(g, i);
      gs.push(g);
      p = g;
    }
    this.anim.push((time, _dt, lift) => {
      for (let i = 0; i < gs.length; i++) {
        gs[i].rotation.x = -(0.04 + lift * stream * (0.6 + i * 0.35)) / (1 + i * 0.1) + Math.sin(time * 2.1 + i * 0.8 + phase) * flutter * (0.5 + i * 0.4);
        gs[i].rotation.z = Math.sin(time * 1.3 + i * 0.6 + phase) * flutter * 0.5;
      }
    });
    return gs;
  }

  /** Wings: blades or feathers fanned from the shoulder blades, in a group each side that opens and closes a little with the clock. */
  wings(spec: WingSpec): void {
    const gs: { group: THREE.Group; side: number }[] = [];
    const segs = spec.segs ?? 6;
    for (const s of [-1, 1]) {
      const wing = this.group(this.t, [s * spec.at[0], spec.at[1], spec.at[2]]);
      gs.push({ group: wing, side: s });
      this.put(wing, spec.base, [0.12, 0.2, 0.08], [s * 0.02, -0.02, 0.01]); // the base they grow from
      this.put(wing, this.gem, [0.06, 0.06, 0.05], [s * 0.02, -0.02, 0.05]);
      for (let k = 0; k < spec.blades; k++) {
        const f = spec.blades === 1 ? 0.5 : k / (spec.blades - 1); // 0: the lowest blade, 1: the highest
        const spread = (spec.spread[0] + f * (spec.spread[1] - spec.spread[0])) * DEG;
        const sw = spec.sweep ?? [0.5, 0.28];
        const sweep = sw[1] + (1 - f) * (sw[0] - sw[1]);
        const length = spec.len * (0.58 + 0.42 * Math.sin((0.25 + f * 0.75) * Math.PI * 0.62 + 0.4));
        const w = spec.width * (1 + 0.25 * (1 - f));
        const shape = spec.feather ? (i: number, n: number): number => w * (0.3 + 0.7 * Math.sin(((i + 0.6) / (n + 0.2)) * Math.PI)) : undefined;
        const root: V3 = [s * 0.04, 0.02 - (1 - f) * 0.04, 0];
        this.chain(wing, spec.mat, spec.edge ?? null, root, [sweep, 0, -s * spread], segs, length, w, 0.025, 0.03, [0.02, 0, s * spec.curl], s, shape);
        if (spec.spine) this.chain(wing, spec.spine, null, [root[0], root[1], 0.012], [sweep, 0, -s * spread], segs, length * 0.92, 0.014, 0.006, 0.01, [0.02, 0, s * spec.curl], s);
      }
    }
    const flap = spec.flap ?? 1;
    this.anim.push((time, _dt, lift) => {
      for (const w of gs) {
        const open = (0.05 * Math.sin(time * 1.6 + w.side) + 0.1 * lift) * flap;
        w.group.rotation.z = -w.side * open;
        w.group.rotation.y = w.side * (0.12 * Math.sin(time * 1.3) + 0.12 * lift) * flap;
      }
    });
  }

  /** Finish the blocks: one mesh per part and material. Call once, after the last `put` and `chain`. */
  flush(): void {
    for (const b of this.batches.values()) {
      const merged = mergeGeometries(b.geos);
      for (const g of b.geos) g.dispose();
      if (merged) this.ctx.add(b.parent, merged, b.mat);
    }
    this.batches.clear();
  }

  // ---- what stands clear of the body

  /** A glow behind the figure. */
  halo(strength: number): void {
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(this.def), transparent: true, opacity: 0.35 + strength, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    halo.scale.set(2.1 + strength * 2, 2.7 + strength * 2, 1);
    halo.position.set(0, 1.15, 0.05);
    this.effects.add(halo);
    this.haloObj = halo;
    this.anim.push((time) => {
      (halo.material as THREE.SpriteMaterial).opacity = 0.3 + strength + 0.1 * Math.sin(time * 1.8);
    });
    this.frees.push(() => (halo.material as THREE.Material).dispose());
  }

  /** Orbs of light that float round the hero. */
  orbiters(sp: OrbiterSpec): void {
    // Soft balls of light, not solid things: a bright core in a wide glow, both drawn as additive sprites.
    const toColor = (c: RGB, k: number): THREE.Color => new THREE.Color().setRGB((c[0] / 255) * k, (c[1] / 255) * k, (c[2] / 255) * k, THREE.SRGBColorSpace);
    const coreMat = new THREE.SpriteMaterial({ map: sparkTex(), color: toColor(this.hot, 1.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const glowMat = new THREE.SpriteMaterial({ map: sparkTex(), color: toColor(this.glowC, 1.2), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const items: THREE.Group[] = [];
    for (let i = 0; i < sp.count; i++) {
      const g = new THREE.Group();
      const glow = new THREE.Sprite(glowMat);
      glow.scale.setScalar(sp.size * 6);
      const core = new THREE.Sprite(coreMat);
      core.scale.setScalar(sp.size * 2.8);
      g.add(glow, core);
      this.effects.add(g);
      items.push(g);
    }
    const bob = sp.bob ?? 0.08;
    const tilt = sp.tilt ?? 0;
    this.anim.push((time) => {
      for (let i = 0; i < items.length; i++) {
        const a = time * sp.speed + (i / items.length) * Math.PI * 2;
        const x = Math.cos(a) * sp.radius;
        const z = Math.sin(a) * sp.radius;
        const pulse = 1 + 0.18 * Math.sin(time * 3 + i * 2.1);
        items[i].scale.setScalar(pulse);
        items[i].position.set(x, sp.y + Math.sin(time * 1.3 + i * 1.9) * bob + z * Math.sin(tilt), z * Math.cos(tilt));
      }
    });
    this.frees.push(() => {
      coreMat.dispose();
      glowMat.dispose();
    });
  }

  /** Tongues of fire that rise round the body, flicker and die out. */
  flames(count: number): void {
    const n = count;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const seed = Array.from({ length: n }, (_, i) => [noise(i, 5, 7), noise(i, 6, 7), noise(i, 7, 7), noise(i, 8, 7)] as const);
    const toColor = (c: RGB): THREE.Color => new THREE.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
    const cool = toColor(this.glowC);
    const hot = toColor(this.hot);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pm = new THREE.PointsMaterial({ map: flameTex(), size: 1.0, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false, fog: false });
    // Light added to the picture that leaves its see-through part alone (a dim flame on a menu's canvas would otherwise show as black).
    pm.blending = THREE.CustomBlending;
    pm.blendEquation = THREE.AddEquation;
    pm.blendSrc = THREE.SrcAlphaFactor;
    pm.blendDst = THREE.OneFactor;
    pm.blendSrcAlpha = THREE.ZeroFactor;
    pm.blendDstAlpha = THREE.OneFactor;
    const points = new THREE.Points(pg, pm);
    points.frustumCulled = false;
    this.effects.add(points);
    const place = (time: number): void => {
      for (let i = 0; i < n; i++) {
        const [a, b, c, d] = seed[i];
        const life = (a + time * (0.45 + b * 0.4)) % 1;
        const ang = c * Math.PI * 2 + time * 0.4 * (i % 2 === 0 ? 1 : -1);
        const r = 0.5 + d * 0.4 + Math.sin(time * 5 + i * 3) * 0.04;
        pos[i * 3] = Math.cos(ang) * r + Math.sin(time * 7 + i * 5) * 0.03;
        pos[i * 3 + 1] = 0.05 + life * (0.8 + b * 0.9);
        pos[i * 3 + 2] = Math.sin(ang) * r;
        // Hot at the root, the colour of the set higher up, and out at the tip.
        const k = Math.sin(Math.min(1, life * 1.15) * Math.PI) * 1.5;
        const m = Math.max(0, 1 - life * 1.4);
        col[i * 3] = (cool.r + (hot.r - cool.r) * m) * k;
        col[i * 3 + 1] = (cool.g + (hot.g - cool.g) * m) * k;
        col[i * 3 + 2] = (cool.b + (hot.b - cool.b) * m) * k;
      }
      (pg.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (pg.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    };
    place(0);
    this.anim.push((time) => place(time));
    this.frees.push(() => {
      pg.dispose();
      pm.dispose();
    });
  }

  /** Points of light of one kind, as many as `count`. */
  sparks(kind: SparkKind, count: number): void {
    if (kind === 'flames') {
      this.flames(Math.max(14, Math.round(count * 0.9)));
      kind = 'embers';
      count = Math.round(count * 0.5);
    }
    const n = count;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const seed = Array.from({ length: n }, (_, i) => [noise(i, 1, 7), noise(i, 2, 7), noise(i, 3, 7), noise(i, 4, 7)] as const);
    const toColor = (c: RGB): THREE.Color => new THREE.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
    const c1 = toColor(this.glowC);
    const c2 = toColor(this.hot);
    const c3 = toColor(this.trimC);
    for (let i = 0; i < n; i++) {
      const c = i % 5 === 0 ? c2 : i % 7 === 0 ? c3 : c1;
      col[i * 3] = c.r * 1.7;
      col[i * 3 + 1] = c.g * 1.7;
      col[i * 3 + 2] = c.b * 1.7;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const big = kind === 'bubbles' || kind === 'leaves' || kind === 'petals' || kind === 'fireflies';
    const pm = new THREE.PointsMaterial({ map: sparkTex(), size: big ? 0.15 : 0.1, sizeAttenuation: true, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const points = new THREE.Points(pg, pm);
    points.frustumCulled = false;
    this.effects.add(points);

    /** Where the i-th spark is at time `t`. Each has its own pace and its own height in its cycle, so they never move together. */
    const spark = (i: number, time: number, out: V3): void => {
      const [a, b, c, d] = seed[i];
      const speed = 0.16 + b * 0.22;
      const life = (a + time * speed) % 1; // 0 at the start of its climb, 1 at the end
      const ang = c * Math.PI * 2 + time * (0.5 + d * 0.9) * (i % 2 === 0 ? 1 : -1);
      switch (kind) {
        case 'rise': {
          const r = 0.4 + 0.2 * Math.sin(life * 6 + i) + d * 0.15;
          out[0] = Math.cos(ang) * r;
          out[1] = life * 2.5;
          out[2] = Math.sin(ang) * r;
          break;
        }
        case 'embers': {
          const r = 0.3 + life * 0.45 * (0.5 + d);
          out[0] = Math.cos(ang * 0.6) * r + Math.sin(time * 2 + i * 3) * 0.05;
          out[1] = 0.1 + life * 2.4;
          out[2] = Math.sin(ang * 0.6) * r + Math.cos(time * 1.7 + i * 2) * 0.05;
          break;
        }
        case 'snow': {
          out[0] = Math.cos(c * 6.28) * (0.3 + d * 0.7) + Math.sin(time * 0.8 + i) * 0.12;
          out[1] = 2.6 - life * 2.6;
          out[2] = Math.sin(c * 6.28) * (0.3 + d * 0.7) + Math.cos(time * 0.7 + i * 2) * 0.12;
          break;
        }
        case 'orbit': {
          const r = 0.55 + d * 0.4;
          out[0] = Math.cos(ang) * r;
          out[1] = 0.3 + c * 1.9 + Math.sin(time * 1.4 + i) * 0.08;
          out[2] = Math.sin(ang) * r;
          break;
        }
        case 'inward': {
          // Drawn in toward the chest from the dark: wide and high at first, narrow and low at the end.
          const r = 0.15 + (1 - life) * 1.0;
          out[0] = Math.cos(ang + life * 3) * r;
          out[1] = 1.1 + (1 - life) * (c - 0.5) * 2.2;
          out[2] = Math.sin(ang + life * 3) * r;
          break;
        }
        case 'bubbles': {
          out[0] = Math.cos(c * 6.28) * (0.3 + d * 0.5) + Math.sin(time * 1.6 + i) * 0.07;
          out[1] = life * 2.5;
          out[2] = Math.sin(c * 6.28) * (0.3 + d * 0.5) + Math.cos(time * 1.4 + i) * 0.07;
          break;
        }
        case 'leaves': {
          out[0] = Math.cos(ang) * (0.35 + d * 0.5);
          out[1] = 2.3 - life * 2.3;
          out[2] = Math.sin(ang) * (0.35 + d * 0.5);
          break;
        }
        case 'petals': {
          // Falling, and rocking from side to side as petals do.
          out[0] = Math.cos(c * 6.28) * (0.3 + d * 0.7) + Math.sin(time * 1.3 + i * 1.7) * 0.2;
          out[1] = 2.5 - life * 2.5;
          out[2] = Math.sin(c * 6.28) * (0.3 + d * 0.7) + Math.cos(time * 1.1 + i * 2.3) * 0.2;
          break;
        }
        case 'fireflies': {
          // Wandering about at no pace in particular.
          out[0] = Math.sin(time * (0.2 + b * 0.3) + a * 20) * (0.5 + d * 0.5);
          out[1] = 0.3 + (0.5 + 0.5 * Math.sin(time * (0.15 + c * 0.2) + b * 30)) * 1.9;
          out[2] = Math.cos(time * (0.23 + d * 0.3) + c * 20) * (0.5 + a * 0.4);
          break;
        }
        case 'spiral': {
          // A helix climbing the hero: the light turns as it rises.
          out[0] = Math.cos(life * 9 + c * 6.28 + time * 0.5) * (0.45 + 0.08 * Math.sin(life * 12));
          out[1] = life * 2.5;
          out[2] = Math.sin(life * 9 + c * 6.28 + time * 0.5) * (0.45 + 0.08 * Math.sin(life * 12));
          break;
        }
        case 'arcs': {
          // Flashes that jump from place to place about the hero several times a second.
          const k = Math.floor(time * 4 + i * 0.37);
          const r = 0.35 + noise(i, k, 11) * 0.6;
          const an = noise(i, k, 13) * Math.PI * 2;
          out[0] = Math.cos(an) * r;
          out[1] = 0.2 + noise(i, k, 17) * 2;
          out[2] = Math.sin(an) * r;
          break;
        }
      }
    };
    const tmp: V3 = [0, 0, 0];
    const place = (time: number): void => {
      for (let i = 0; i < n; i++) {
        spark(i, time, tmp);
        pos[i * 3] = tmp[0];
        pos[i * 3 + 1] = tmp[1];
        pos[i * 3 + 2] = tmp[2];
      }
      (pg.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    };
    place(0);
    this.anim.push((time) => place(time));
    this.frees.push(() => {
      pg.dispose();
      pm.dispose();
    });
  }

  /** Add to what moves of its own: `fn` is called with the clock, the time since the last call and how hard the figure is moving. */
  animate(fn: (time: number, dt: number, lift: number) => void): void {
    this.anim.push(fn);
  }

  /** The set is made: its rig. */
  finish(height: number, extent: number): SetRig {
    this.flush();
    if (!this.haloObj) {
      this.haloObj = new THREE.Object3D();
      this.effects.add(this.haloObj);
    }
    return {
      effects: this.effects,
      halo: this.haloObj,
      height,
      extent,
      update: (time, dt, lift) => {
        breathe(time);
        for (const fn of this.anim) fn(time, dt, lift);
      },
      dispose: () => {
        for (const o of this.own) o.parent?.remove(o);
        for (const f of this.frees) f();
      },
    };
  }
}

export { jitter, lerp, noise, rgbs, tileUv };
