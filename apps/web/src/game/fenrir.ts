import * as THREE from 'three';
import { MOUNT_BODY_LIFT, MOUNT_MODEL, mountDef, type MountId } from '@solrift/shared';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Smooth } from './smooth';
import { Voxels, type RGB, type Spot, type V3 } from './voxels';
import { ArcSet, pickAmong } from './arcs';

/**
 * Fenrir, the great wolf of MU Online, built from blocks like everything else in the game: a rust-red wolf with a pale belly
 * and a huge white mane, dark plates edged in bone on the shoulders and hips, a row of curved spikes down the spine, a furred
 * wolf's head with a long muzzle, a plate on the brow, pointed ears and a great swept-back horn on each side, four thick furred
 * legs with a bracer each and a long bushy tail with a pale tip. It faces -z, stands on y = 0 and the rider sits on the saddle at `SEAT_Y`.
 *
 * It is sculpted from little cubes (a twentieth of a block when shown, see voxels.ts): ellipsoids and rods poured into a grid
 * and meshed with their hidden faces left out. The body is a handful of rigid parts (the torso with the saddle and the plates,
 * the neck, the head, the jaw, twelve leg bones and five tail segments), each one a single merged mesh with its colours baked
 * into the vertices, so a mount is about forty draw calls. Light is the one colour on the material (`setTint`), like the figures of the other players.
 */

/** What colours a Fenrir wears. */
interface Palette {
  /** The plates (shoulders, hips, brow, bracers), and the shade of them in the hollows. */
  armor: RGB;
  dark: RGB;
  /** The edging of the plates and the colour of the horns and spikes: bone on the red one. */
  trim: RGB;
  fur: RGB;
  furDark: RGB;
  /** The pale fur: the mane, the ruff, the belly, the tip of the tail. */
  pad: RGB;
  /** The saddle and the leather straps. */
  saddle: RGB;
  leather: RGB;
  /** The eyes (they glow whatever the light) and the teeth. */
  eye: RGB;
  tooth: RGB;
  /** The lightning that crackles over it: the colour of the glow (the core is nearly white). */
  arc: RGB;
}

const PALETTES: Record<MountId, Palette> = {
  // The one from MU: a rust-red wolf with a white mane, bone horns and dark plates.
  fenrir: { armor: [86, 48, 40], dark: [44, 24, 22], trim: [236, 222, 186], fur: [172, 66, 38], furDark: [102, 38, 28], pad: [240, 232, 218], saddle: [92, 28, 32], leather: [112, 70, 42], eye: [214, 96, 255], tooth: [244, 236, 220], arc: [150, 130, 255] },
  fenrir_black: { armor: [40, 38, 46], dark: [18, 16, 22], trim: [214, 204, 190], fur: [52, 50, 60], furDark: [26, 25, 32], pad: [150, 146, 158], saddle: [60, 20, 22], leather: [80, 54, 38], eye: [255, 70, 50], tooth: [226, 218, 206], arc: [255, 90, 60] },
  fenrir_blue: { armor: [34, 54, 110], dark: [18, 30, 70], trim: [214, 232, 252], fur: [58, 108, 200], furDark: [30, 56, 134], pad: [226, 238, 252], saddle: [30, 44, 104], leather: [96, 80, 64], eye: [96, 236, 255], tooth: [240, 244, 250], arc: [90, 200, 255] },
  fenrir_gold: { armor: [140, 92, 34], dark: [88, 56, 22], trim: [255, 242, 176], fur: [226, 170, 56], furDark: [158, 102, 32], pad: [255, 246, 222], saddle: [150, 60, 28], leather: [136, 88, 44], eye: [255, 255, 190], tooth: [255, 250, 232], arc: [255, 220, 90] },
};

/** The colour (0..1) of the lightning of a mount: the skills' effects are drawn in it, so a gold Fenrir's storm is gold. */
export function mountArc(id: MountId): [number, number, number] {
  const a = PALETTES[id]?.arc ?? PALETTES.fenrir.arc;
  return [a[0] / 255, a[1] / 255, a[2] / 255];
}

/** What sets one Fenrir apart from the others besides its colours. */
interface Style {
  /** The shape of the horns: swept back (the wolf of MU), a crown of prongs, tall antlers, or a curled ram's horn. */
  horn: 'sweep' | 'crown' | 'antler' | 'ram';
  /** How many lames the guards on the shoulders and the haunches have, and the size of the horns on them (1 = the usual). */
  lames: number;
  spikeK: number;
  /** Shards of crystal on the shoulders in place of the horns. */
  crystals: boolean;
  /** A collar of bone round the neck, and a crest of spikes on the head. */
  collar: boolean;
  /** A row of spikes down the tail. */
  tailSpikes: boolean;
  /** How many rows of strands the mane has down the neck. */
  maneRows: number;
}

const STYLES: Record<MountId, Style> = {
  fenrir: { horn: 'sweep', lames: 2, spikeK: 1, crystals: false, collar: false, tailSpikes: false, maneRows: 3 },
  fenrir_black: { horn: 'crown', lames: 3, spikeK: 1.3, crystals: false, collar: false, tailSpikes: true, maneRows: 2 },
  fenrir_blue: { horn: 'antler', lames: 1, spikeK: 1, crystals: true, collar: false, tailSpikes: false, maneRows: 4 },
  fenrir_gold: { horn: 'ram', lames: 2, spikeK: 1, crystals: false, collar: true, tailSpikes: false, maneRows: 3 },
};

/**
 * A paw came down: where (world space; y is the ground under the mount), how hard (0..1, a landing from a jump is more than 1) and the way the
 * mount is going (a unit vector on the ground), so the dust can be thrown back.
 */
export type StepHandler = (x: number, y: number, z: number, power: number, dx: number, dz: number) => void;

/** The model is built at this size and shown this much bigger: a mount is larger than the person on it, but not a house. */
export const MOUNT_SCALE = MOUNT_MODEL.scale;
/** The height of the rider's seat above the ground (before MOUNT_SCALE): the top of the saddle. */
export const SEAT_Y = 1.19;
/** How far behind the middle of the body the rider sits. */
export const SEAT_Z = 0.1;
/** The legs are this much longer (before MOUNT_SCALE) than they once were, and the body rides this much higher on them. */
export const LEG_LIFT = MOUNT_MODEL.legLift;
/** The same in the world's blocks: how high the body is carried above where it once was. */
export const BODY_LIFT = MOUNT_BODY_LIFT;
/** The edge of the little cubes the model is poured from (before MOUNT_SCALE): a twentieth of a block when shown. */
const CUBE = 0.033;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---- the model ----------------------------------------------------------------------------------------------------

/** The bones of one leg. */
interface Leg {
  up: THREE.Group;
  low: THREE.Group;
  paw: THREE.Group;
  /**
   * Where in the stride this leg is, walking (four beats: a hind leg, then the fore leg on its side, then the other hind, then
   * the other fore) and trotting (diagonal pairs, the hinds a little behind the fores, so the paws never land all at once).
   */
  walk: number;
  trot: number;
  front: boolean;
  /** `cos` of the stride a frame ago: a paw lands when it turns from lifted to down. */
  last: number;
}

/** How far behind the fore legs the hind ones come down in a trot (radians of the stride). */
const TROT_LAG = 0.4;

/** Segments of the tail: length and the width at the root. */
const TAIL = [
  { len: 0.4, w: 0.3 },
  { len: 0.38, w: 0.38 },
  { len: 0.36, w: 0.4 },
  { len: 0.34, w: 0.36 },
  { len: 0.36, w: 0.26 },
] as const;
const TAIL_BASE = [-0.3, -0.08, 0.1, 0.2, 0.24] as const;

/**
 * The pivot of the neck (on the body), and the pivot of the head and of the jaw (on the neck and the head). Where the neck and the head
 * are comes from `MOUNT_MODEL` in the shared rules, which read the mouth's place from the same numbers.
 *
 * A long neck that runs forward from the withers, a little below level (radians; the neck is modelled standing up along +y, and
 * `NECK_TILT` lays it down, positive = head up). The head is carried low, so it does not tower over the rider's view. It sits on the
 * end of the neck and turns back against it (`HEAD_TILT`), to look a little nose-down along the way the beast goes.
 */
const NECK_AT: V3 = [...MOUNT_MODEL.neckAt];
const NECK_TILT = MOUNT_MODEL.neckTilt;
const HEAD_TILT = MOUNT_MODEL.headTilt;
const NECK_LEN = MOUNT_MODEL.neckLen;
const HEAD_AT: V3 = [...MOUNT_MODEL.headAt];
const JAW_AT: V3 = [0, -0.1, -0.12];
/** How far a howl throws the neck and the head up (radians): where the mouth is then is `mountMouthAt(ROAR_NECK, ROAR_HEAD)`. */
export const ROAR_NECK = 0.4;
export const ROAR_HEAD = 0.45;

/**
 * The shapes of the pieces of every mount made so far, by mount and piece: kept for good and shared by every mount of the kind (they are
 * small), so that the next one that comes costs nothing but its bones. `Fenrir.prepare` makes them ahead of time.
 */
const SHAPES = new Map<string, { geo: THREE.BufferGeometry; glow: boolean }[]>();

/** A shape that takes everything it is told and does nothing with it. */
function idle<T extends object>(shape: T): T {
  for (const name of ['ellipsoid', 'rod', 'slab', 'tube', 'ring', 'trim', 'recolor']) {
    if (name in shape) (shape as Record<string, unknown>)[name] = function (this: T): T {
      return this;
    };
  }
  return shape;
}

export class Fenrir {
  /** Pours the shapes of a mount (the part of making one that takes the time) so that the first one that is made is quick. */
  static prepare(id: MountId): void {
    new Fenrir(id).dispose();
  }

  /** Stands on the ground at y = 0; turned to the way the mount faces. */
  readonly root = new THREE.Group();
  /** The part that rocks and bobs: the rider is carried by it. */
  private readonly body = new THREE.Group();
  private readonly neck = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly jaw = new THREE.Group();
  private readonly tail: THREE.Group[] = [];
  private readonly legs: Leg[] = [];
  private mats: THREE.MeshBasicMaterial[] = [];
  /** The number of the piece the model is making now (the key of its shapes in `SHAPES`). */
  private piece = 0;
  private id: MountId;
  private readonly lit = new THREE.MeshBasicMaterial({ vertexColors: true });
  private readonly glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  /** The lightning: a wide glow with a pale core, neither touched by the light, drawn over what is behind them. */
  private readonly arcGlow = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide, fog: false });
  private readonly arcCore = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: false });
  private arcs: ArcSet[] = [];
  /** The set of bolts that break out around the mount while it howls. */
  private storm: ArcSet | null = null;
  /** The sets that crackle over it all the time (how busy they are depends on how it moves: see `update`). */
  private crackle: { head: ArcSet | null; body: ArcSet | null; tail: ArcSet | null } = { head: null, body: null, tail: null };

  // Animation state.
  private gait = 0;
  private spd = 0;
  private amp = 0;
  private air = 0;
  private clock = Math.random() * 10;
  private bank = 0;
  /** How far the neck is turned into a turn (it eases after the body). */
  private look = 0;
  private biteT = 1;
  private roarT = 1;
  /** 0..1: how far into the pop that greets a new mount (it grows out of the ground). */
  private pop = 1;
  /** Where the eye that looks at it is (world space), and whether that eye is the rider's own, in first person. */
  private viewer: THREE.Vector3 | null = null;
  private rider = false;
  /** What the rider needs to follow the body: how high it rides, how far it is pitched and rolled. */
  bob = 0;
  pitch = 0;
  roll = 0;
  /** How far the rider leans over what the body does (radians): forward as it speeds up and in a climb, back in a drop, into a turn. */
  leanPitch = 0;
  leanRoll = 0;
  /** The game makes the thud and the dust of each paw that comes down (see `StepHandler`). */
  onStep: StepHandler | null = null;
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly tmp3 = new THREE.Vector3();
  private wasAir = false;

  constructor(id: MountId = 'fenrir') {
    this.id = id;
    this.mats.push(this.lit, this.glow, this.arcGlow, this.arcCore);
    this.root.add(this.body);
    this.body.scale.setScalar(MOUNT_SCALE);
    this.build(id);
  }

  get mountId(): MountId {
    return this.id;
  }

  /** Wear the colours of another mount. */
  setMount(id: MountId): void {
    if (id === this.id) return;
    this.id = id;
    this.clearParts();
    this.build(id);
  }

  /** Say where the camera is, so the lightning can keep off it; `rider` is true when it is the rider's own first-person eye. */
  setViewer(viewer: THREE.Vector3 | null, rider: boolean): void {
    this.viewer = viewer;
    this.rider = rider;
  }

  /** The bite: the neck lunges forward and down and the jaw snaps. */
  lunge(): void {
    this.biteT = 0;
  }

  /** The howl: the head throws up and the jaw opens wide. */
  roar(): void {
    this.roarT = 0;
  }

  /** Tell the game a paw (or, for a landing, the whole beast) came down. */
  private step(on: THREE.Object3D, power: number): void {
    if (!this.onStep) return;
    on.getWorldPosition(this.tmp);
    this.root.getWorldPosition(this.tmp2);
    // The mount faces -z; `getWorldDirection` gives +z.
    this.root.getWorldDirection(this.tmp3);
    const h = Math.hypot(this.tmp3.x, this.tmp3.z) || 1;
    this.onStep(this.tmp.x, this.tmp2.y, this.tmp.z, power, -this.tmp3.x / h, -this.tmp3.z / h);
  }

  /** Where the nose is in the world now (the head and the neck move, so it moves with them). */
  mouth(out = new THREE.Vector3()): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.head.localToWorld(out.set(...MOUNT_MODEL.nose));
  }

  /** Start from the ground up (a mount that has just been summoned). */
  appear(): void {
    this.pop = 0;
  }

  private clearParts(): void {
    for (const a of this.arcs) a.dispose();
    this.arcs = [];
    this.storm = null;
    this.crackle = { head: null, body: null, tail: null };
    this.body.clear();
    this.neck.clear();
    this.head.clear();
    this.jaw.clear();
    this.tail.length = 0;
    this.legs.length = 0;
  }

  /** Hang the pieces on a bone: the part that is lit, and the part that glows (the eyes). */
  private mesh(parent: THREE.Object3D, ...parts: (Voxels | Smooth)[]): void {
    const key = `${this.id}:${this.piece++}`;
    let made = SHAPES.get(key);
    if (!made) {
      made = [];
      for (const glow of [false, true]) {
        const geos = parts.map((p) => p.build(glow)).filter((g): g is THREE.BufferGeometry => g !== null);
        if (geos.length === 0) continue;
        const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false)!;
        if (geos.length > 1) for (const g of geos) g.dispose();
        made.push({ geo: merged, glow });
      }
      SHAPES.set(key, made);
    }
    for (const { geo, glow } of made) parent.add(new THREE.Mesh(geo, glow ? this.glow : this.lit));
  }

  /**
   * A shape to pour a piece of the model from. Pouring the cubes is most of the time it takes to make a mount (a good tenth of a second), and the
   * same mount is always the same: the pieces of one are made once (see `SHAPES`), and when they are there already the shape is a dummy that
   * takes what it is told and does nothing with it.
   */
  private voxels(cube: number, seed: number): Voxels {
    return this.cached() ? idle(new Voxels(cube, seed)) : new Voxels(cube, seed);
  }

  private smooth(): Smooth {
    return this.cached() ? idle(new Smooth()) : new Smooth();
  }

  /** Whether the piece that is being made now is in `SHAPES` already. */
  private cached(): boolean {
    return SHAPES.has(`${this.id}:${this.piece}`);
  }

  private build(id: MountId): void {
    this.piece = 0;
    const P = PALETTES[id];
    const style = STYLES[id];
    const seed = id.length * 977 + 11;
    const { body, neck, head } = this;
    const bone = P.trim;
    const PI = Math.PI;
    const smooth = (a: number, b: number, x: number): number => {
      const t = clamp((x - a) / (b - a), 0, 1);
      return t * t * (3 - 2 * t);
    };

    // ---- the paints ----------------------------------------------------------------------------------------------------------------
    // Fur of cubes: rust-red, flecked, darker along the back; the outermost cubes are frosted with the pale of the mane and the belly is pale.
    const fur =
      (dark = 0, belly = false): ((s: Spot) => RGB) =>
      (s) => {
        const fleck = Math.sin(s.p[0] * 61 + s.p[1] * 97 + s.p[2] * 43) * Math.sin(s.p[2] * 71 - s.p[1] * 53);
        let c = mix(P.fur, P.furDark, clamp(dark + fleck * 0.28 + (s.p[1] > 1.0 ? 0.15 : 0), 0, 1));
        c = mix(c, P.fur, smooth(0.78, 1, s.d) * 0.2);
        if (belly) c = mix(c, P.pad, smooth(0.62, 0.46, s.p[1]) * 0.85);
        return c;
      };
    // The mane and the ruffs: white at the tips, a warm grey deep inside (not the red of the fur, which would turn it pink).
    const maneDeep = mix(P.pad, [118, 114, 110], 0.26);
    const mane = (s: Spot): RGB => {
      const fleck = Math.sin(s.p[0] * 53 + s.p[1] * 89 + s.p[2] * 47) * Math.sin(s.p[2] * 67 - s.p[1] * 59);
      return mix(maneDeep, P.pad, clamp(0.55 + s.d * 0.4 + fleck * 0.2, 0, 1));
    };
    // The same fur on a smooth skin: streaks along the body, darker on the back, pale under the belly.
    const skin = (p: V3, n: V3): RGB => {
      const base = mix(P.fur, P.furDark, clamp(0.1 + Math.max(0, n[1]) * 0.35 + Math.sin(p[2] * 38 + p[0] * 13) * 0.1, 0, 1));
      return mix(base, P.pad, smooth(0.66, 0.5, p[1]) * 0.85);
    };
    // The fur of a leg: darker lower down.
    const limb = (p: V3, n: V3): RGB => mix(P.fur, P.furDark, clamp(0.12 - p[1] * 0.5 + Math.sin(p[1] * 40 + p[0] * 17) * 0.08 + (n[1] < 0 ? 0.1 : 0), 0, 1));
    // Dark plate, darker where it faces down. A plate is edged in bone where its surface turns away (`axis`: the way it faces).
    const plate = (_p: V3, n: V3): RGB => mix(P.armor, P.dark, clamp(0.15 - n[1] * 0.7, 0, 1));
    const edged =
      (axis: 0 | 1 | 2, w = 0.36) =>
      (p: V3, n: V3): RGB =>
        Math.abs(n[axis]) < w ? bone : plate(p, n);
    const leather = (_p: V3, n: V3): RGB => mix(P.saddle, P.dark, clamp(-n[1] * 0.6, 0, 1));
    const glint = { shine: 0.9 };
    // For shapes of cubes: which way the surface of a cube faces (up = 1), from where it sits in its shape.
    const facing = (s: Spot): number => {
      const l = Math.hypot(s.q[0], s.q[1], s.q[2]);
      return l > 1e-6 ? s.q[1] / l : 0;
    };
    // Bone, darker on the undersides.
    const boneV = (s: Spot): RGB => mix(bone, P.armor, clamp(0.25 - facing(s) * 0.5, 0, 0.7));
    // A horn or a spike of cubes: two rods, curved at the middle point `m`, thick at the root `a` and ending in a point at `b`.
    const vspike = (v: Voxels, a: V3, m: V3, b: V3, r: number, paint: (s: Spot) => RGB = boneV): void => {
      v.rod(a, m, r, r * 0.68, paint, {});
      v.rod(m, b, r * 0.68, Math.max(0.026, r * 0.15), paint, {});
    };

    // ---- the torso: a great wolf's body in rust-red fur, a pale belly, a white ruff on the chest, dark plates at the shoulders and hips, a row of spikes down the spine ----
    const t = this.voxels(CUBE, seed);
    for (const s of [-1, 1]) {
      // Muscle under the fur on the shoulders and the haunches, and a fringe along the belly.
      t.ellipsoid([s * 0.3, 0.76, -0.46], [0.14, 0.28, 0.29], fur(0.05), { rough: 0.07 });
      t.ellipsoid([s * 0.31, 0.74, 0.52], [0.15, 0.29, 0.31], fur(0.1), { rough: 0.07 });
      t.ellipsoid([s * 0.2, 0.55, 0.0], [0.14, 0.1, 0.5], fur(0.0, true), { rough: 0.1 });
    }
    t.ellipsoid([0, 0.64, -0.7], [0.3, 0.33, 0.29], mane, { rough: 0.1 });
    t.ellipsoid([0, 0.5, 0.0], [0.22, 0.08, 0.52], fur(0.1, true), { rough: 0.08 });
    t.ellipsoid([0, 1.02, -0.5], [0.2, 0.1, 0.26], mane, { rough: 0.1 });
    t.ellipsoid([0, 0.88, 0.86], [0.2, 0.2, 0.16], fur(0.15), { rough: 0.08 });
    const ts = this.smooth();
    ts.ellipsoid([0, 0.86, -0.34], [0.37, 0.41, 0.5], skin, { segs: [22, 14] });
    ts.ellipsoid([0, 0.82, 0.1], [0.32, 0.35, 0.46], skin, { segs: [22, 14] });
    ts.ellipsoid([0, 0.83, 0.5], [0.34, 0.37, 0.38], skin, { segs: [22, 14] });
    // The spikes down the spine, each one on a small plate and curved back, tall at the withers and shrinking to the rump.
    const SPINE: readonly (readonly [number, number, number])[] = [
      [-0.62, 1.17, 0.2],
      [-0.48, 1.24, 0.27],
      [-0.34, 1.27, 0.32],
      [0.42, 1.2, 0.3],
      [0.57, 1.19, 0.35],
      [0.72, 1.13, 0.3],
      [0.86, 1.03, 0.24],
    ];
    for (const [z, y, h] of SPINE) {
      ts.ellipsoid([0, y, z], [0.13, 0.05, 0.1], edged(1, 0.4), glint);
      vspike(t, [0, y, z + 0.02], [0, y + h * 0.6, z + 0.07], [0, y + h, z + 0.2], 0.045 + h * 0.06);
    }
    for (const s of [-1, 1]) {
      // The shoulder guards: lames of dark plate edged in bone, a horn sweeping up and back from them (or, on the frost one, shards of crystal).
      for (let k = 0; k < style.lames; k++)
        ts.ellipsoid([s * (0.37 + 0.03 * k), 1.08 - 0.14 * k, -0.46 - 0.02 * k], [0.06, 0.12, 0.3 - 0.04 * k], edged(0, 0.42), { rot: [0, 0, s * (0.3 + 0.12 * k)], ...glint });
      // The same horn, grown by `k` from its root.
      const grow = (a: V3, m: V3, b: V3, r: number): void => {
        const k = style.spikeK;
        vspike(t, a, [a[0] + (m[0] - a[0]) * k, a[1] + (m[1] - a[1]) * k, a[2] + (m[2] - a[2]) * k], [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k], r * (0.8 + 0.2 * k));
      };
      if (style.crystals) {
        vspike(t, [s * 0.36, 1.12, -0.5], [s * 0.38, 1.32, -0.5], [s * 0.4, 1.58, -0.52], 0.07);
        vspike(t, [s * 0.3, 1.14, -0.44], [s * 0.28, 1.3, -0.44], [s * 0.26, 1.48, -0.42], 0.05);
        vspike(t, [s * 0.44, 1.1, -0.54], [s * 0.5, 1.24, -0.56], [s * 0.58, 1.4, -0.6], 0.05);
      } else grow([s * 0.38, 1.14, -0.6], [s * 0.44, 1.28, -0.52], [s * 0.52, 1.42, -0.34], 0.06);
      // The same on the haunch, the horn pointing back.
      for (let k = 0; k < style.lames; k++)
        ts.ellipsoid([s * (0.38 + 0.03 * k), 1.02 - 0.14 * k, 0.52 + 0.02 * k], [0.06, 0.12, 0.3 - 0.04 * k], edged(0, 0.42), { rot: [0, 0, s * (0.3 + 0.12 * k)], ...glint });
      grow([s * 0.36, 1.04, 0.7], [s * 0.43, 1.14, 0.88], [s * 0.5, 1.26, 1.1], 0.055);
    }
    // The saddle: a maroon seat with a pommel and a cantle edged in bone, a blanket under it and straps with stirrups.
    ts.ellipsoid([0, 1.14, SEAT_Z], [0.22, 0.05, 0.29], (p, n) => (Math.abs(n[1]) < 0.3 ? bone : leather(p, n)), glint);
    ts.ellipsoid([0, 1.2, SEAT_Z - 0.28], [0.15, 0.08, 0.05], leather);
    ts.ellipsoid([0, 1.23, SEAT_Z + 0.3], [0.19, 0.1, 0.05], leather);
    ts.ellipsoid([0, 1.09, SEAT_Z], [0.28, 0.045, 0.33], P.leather);
    for (const s of [-1, 1]) {
      ts.ellipsoid([s * 0.32, 0.88, SEAT_Z], [0.03, 0.25, 0.31], leather);
      ts.tube([[s * 0.33, 1.05, SEAT_Z], [s * 0.36, 0.84, SEAT_Z], [s * 0.37, 0.64, SEAT_Z]], [0.022, 0.022, 0.022], P.leather, { sides: 6 });
      ts.ring([s * 0.37, 0.6, SEAT_Z], 0.05, 0.06, 0.014, bone, { rot: [0, 0, PI / 2], shine: 0.9 });
    }
    this.mesh(body, t, ts);

    // ---- the neck: a thick mane that streams back over the shoulders, a ridge of spikes ---------------------------------------------------
    neck.position.set(NECK_AT[0], NECK_AT[1], NECK_AT[2]);
    neck.rotation.x = NECK_TILT;
    // The neck is modelled standing up along +y, from the shoulders (0) to the head (NECK_LEN); +z is the top of it once it is laid forward.
    const n = this.voxels(CUBE, seed + 1);
    const radiusAt = (y: number): number => 0.31 - 0.11 * (y / NECK_LEN);
    // The neck itself: thick, furred, and thinner toward the head.
    n.rod([0, 0, 0.02], [0, NECK_LEN, -0.02], 0.31, 0.2, fur(0.15), { rough: 0.05 });
    // The mane: a few long pale strands that stand off the crest and the sides of the neck and sweep back toward the shoulders
    // (the underside gets a short beard of them). Each row starts further up the neck, so they overlap like a mane.
    const maneMid = mix(P.pad, [118, 114, 110], 0.12);
    const rows = style.maneRows;
    for (let row = 0; row < rows; row++) {
      const y0 = NECK_LEN - 0.04 - (row * (NECK_LEN - 0.3)) / Math.max(1, rows - 1);
      const run = 0.38 + 0.08 * (rows - row);
      const angles = row === 0 ? [30, 60, 90, 120, 150, 250, 290] : [20, 55, 90, 125, 160, 270];
      angles.forEach((deg, j) => {
        const a = (deg * Math.PI) / 180;
        const r = radiusAt(y0) * 0.9;
        const flare = deg > 180 ? 0.07 : 0.15;
        const c = (row + j) % 3 === 0 ? P.pad : (row + j) % 3 === 1 ? maneMid : maneDeep;
        n.rod([Math.cos(a) * r, y0, Math.sin(a) * r], [Math.cos(a) * (r + flare), y0 - run, Math.sin(a) * (r + flare)], 0.05, 0.022, c, {});
      });
    }
    const ns = this.smooth();
    const neckFur = mix(P.fur, P.furDark, 0.2);
    ns.tube([[0, 0, 0.02], [0, NECK_LEN * 0.5, 0], [0, NECK_LEN, -0.02]], [0.28, 0.23, 0.18], neckFur, { sides: 16, samples: 6 });
    // A ridge of spikes down the top of the neck, curved back.
    for (let i = 0; i < 3; i++) {
      const y = 0.4 + 0.15 * i;
      const r = radiusAt(y) * 0.92;
      vspike(n, [0, y, r], [0, y - 0.04, r + 0.06], [0, y - 0.12, r + 0.1], 0.036);
    }
    if (style.collar) {
      // A collar of bone: two bands round the neck.
      for (const y of [0.42, 0.52]) ns.ring([0, y, 0], radiusAt(y) + 0.03, radiusAt(y) + 0.03, 0.028, bone, { shine: 0.9 });
    }
    this.mesh(neck, n, ns);
    body.add(neck);

    // ---- the head: a wolf's, in fur, with a long muzzle, a heavy snarl, a plate on the brow, pointed ears and one great horn on each side swept back ----------
    head.position.set(HEAD_AT[0], HEAD_AT[1], HEAD_AT[2]);
    head.rotation.x = HEAD_TILT;
    // A little narrower and a good deal longer than it is modelled: a wolf's long snout.
    head.scale.set(...MOUNT_MODEL.headScale);
    // The head is poured from the same cubes as the body (`hv`); only what is too small for a cube stays smooth (`hs`): the red of the mouth, the teeth.
    const hs = this.smooth();
    const hv = this.voxels(CUBE, seed + 2);
    const gum: RGB = [128, 22, 30];
    const maw: RGB = [70, 10, 16];
    const darkFur = mix(P.fur, P.furDark, 0.45);
    // The fur of the head: the body's fur, a touch darker on top. The muzzle is paler under the chin (only a little: red fading to cream would pass through pink).
    const furBody = fur(0.05);
    const furH = (s: Spot): RGB => mix(furBody(s), P.furDark, clamp(Math.max(0, facing(s)) * 0.2, 0, 1));
    const snout = (s: Spot): RGB => mix(furH(s), P.pad, clamp(-facing(s) * 0.9 - 0.1, 0, 0.6));
    // A plate of dark armour edged in bone where its surface turns away.
    const plateV = (s: Spot): RGB => (Math.abs(facing(s)) < 0.5 ? bone : mix(P.armor, P.dark, clamp(0.15 - facing(s) * 0.7, 0, 1)));
    const horn = (s: Spot): RGB => {
      const band = Math.max(0, Math.sin(s.p[2] * 52 + s.p[1] * 24) - 0.6);
      return mix(mix(mix(P.armor, bone, 0.65), bone, smooth(-0.1, 0.2, s.p[2])), P.dark, band * 0.3);
    };
    // The skull, and a long muzzle that runs on from the brow in one line and drops a little to the nose.
    hv.ellipsoid([0, 0.01, -0.14], [0.215, 0.18, 0.27], furH, { rough: 0.04 });
    hv.rod([0, 0.02, -0.26], [0, -0.01, -0.46], 0.125, 0.093, snout, { rough: 0.03 });
    hv.rod([0, -0.01, -0.46], [0, -0.05, -0.7], 0.093, 0.056, snout, { rough: 0.03 });
    // The bridge of the nose stands up in a ridge, and the flews (the loose upper lips) hang full at the sides over the teeth.
    hv.rod([0, 0.12, -0.24], [0, 0.085, -0.46], 0.05, 0.04, furH, {});
    hv.rod([0, 0.085, -0.46], [0, 0.04, -0.68], 0.04, 0.032, furH, {});
    for (const s of [-1, 1]) {
      hv.ellipsoid([s * 0.085, -0.075, -0.46], [0.05, 0.05, 0.2], snout, { rot: [0.05, s * -0.05, 0] });
      hv.ellipsoid([s * 0.1, -0.06, -0.26], [0.1, 0.085, 0.11], furH, { rough: 0.04 });
    }
    hs.tube([[0, -0.115, -0.3], [0, -0.12, -0.5], [0, -0.115, -0.68]], [0.08, 0.064, 0.046], maw, { sides: 10 });
    // The nose: a black pad that sits on the end of the muzzle, flat and a little wider than it is tall.
      hv.ellipsoid([...MOUNT_MODEL.nose], [0.05, 0.034, 0.036], [26, 16, 18], { rot: [-0.25, 0, 0] });
    // A shield of dark plate on the forehead, edged in bone, with a short horn rising behind it.
    hv.ellipsoid([0, 0.165, -0.11], [0.075, 0.04, 0.1], plateV, { rot: [0.3, 0, 0] });
    vspike(hv, [0, 0.18, -0.03], [0, 0.26, 0.02], [0, 0.31, 0.13], 0.04);
    // A crest of spikes along the top of the head behind it.
    if (style.collar) for (const z of [0.08, 0.17]) vspike(hv, [0, 0.17, z], [0, 0.25, z + 0.05], [0, 0.3, z + 0.15], 0.036);
    for (const s of [-1, 1]) {
      // A heavy brow of fur drawn down toward the nose; the eye burns narrow and slanted in its shadow.
      hv.ellipsoid([s * 0.115, 0.085, -0.36], [0.115, 0.04, 0.085], darkFur, { rot: [0.2, 0, s * 0.5] });
      hv.ellipsoid([s * 0.124, 0.04, -0.35], [0.08, 0.042, 0.04], maw, { rot: [0, 0, s * 0.45] });
      hv.ellipsoid([s * 0.128, 0.04, -0.365], [0.058, 0.026, 0.03], P.eye, { glow: true, rot: [0, 0, s * 0.45] });
      // The horn: one great horn from a collar of plate, narrow, sweeping up and back over the head with its tip hooking down, dark at the root and bone at the tip.
      hv.ellipsoid([s * 0.125, 0.155, -0.1], [0.1, 0.05, 0.1], plateV, { rot: [0, 0, s * 0.3] });
      const chain = (pts: V3[], radii: number[]): void => {
        for (let i = 0; i < pts.length - 1; i++) hv.rod(pts[i], pts[i + 1], radii[i], radii[i + 1], horn, {});
      };
      if (style.horn === 'crown') {
        // Shadow: a shorter horn swept straight back, and two more prongs that fan out of the collar like a crown.
        chain([[s * 0.12, 0.16, -0.1], [s * 0.17, 0.3, -0.04], [s * 0.21, 0.4, 0.12], [s * 0.24, 0.42, 0.32]], [0.085, 0.072, 0.054, 0.03]);
        vspike(hv, [s * 0.15, 0.2, -0.09], [s * 0.28, 0.3, -0.1], [s * 0.42, 0.42, -0.05], 0.05, horn);
        vspike(hv, [s * 0.13, 0.21, -0.04], [s * 0.17, 0.42, -0.02], [s * 0.14, 0.58, 0.06], 0.045, horn);
      } else if (style.horn === 'antler') {
        // Frost: tall antlers, a beam going straight up with tines branching off it.
        chain([[s * 0.12, 0.16, -0.1], [s * 0.16, 0.34, -0.08], [s * 0.19, 0.5, -0.02], [s * 0.2, 0.68, 0.06]], [0.075, 0.062, 0.047, 0.028]);
        vspike(hv, [s * 0.16, 0.34, -0.08], [s * 0.26, 0.42, -0.1], [s * 0.36, 0.56, -0.1], 0.04, horn);
        vspike(hv, [s * 0.19, 0.5, -0.02], [s * 0.27, 0.6, 0], [s * 0.34, 0.76, 0.04], 0.035, horn);
        vspike(hv, [s * 0.18, 0.42, -0.05], [s * 0.19, 0.5, 0.12], [s * 0.2, 0.6, 0.24], 0.035, horn);
      } else if (style.horn === 'ram') {
        // Sunfire: a great ram's horn that curls round beside the head.
        chain([[s * 0.12, 0.16, -0.1], [s * 0.21, 0.27, -0.02], [s * 0.31, 0.29, 0.12], [s * 0.37, 0.19, 0.22], [s * 0.35, 0.07, 0.14], [s * 0.29, 0.05, 0.02]], [0.09, 0.085, 0.072, 0.056, 0.04, 0.028]);
      } else {
        // The wolf of MU: one great horn swept back over the head, its tip hooking down.
        chain([[s * 0.12, 0.16, -0.1], [s * 0.16, 0.31, -0.04], [s * 0.2, 0.42, 0.1], [s * 0.25, 0.45, 0.28], [s * 0.3, 0.4, 0.44]], [0.085, 0.075, 0.057, 0.04, 0.026]);
      }
      // A short spike on the brow and one under the cheek.
      vspike(hv, [s * 0.17, 0.1, -0.24], [s * 0.2, 0.17, -0.2], [s * 0.24, 0.24, -0.12], 0.034);
      vspike(hv, [s * 0.15, -0.12, -0.22], [s * 0.22, -0.15, -0.06], [s * 0.3, -0.17, 0.1], 0.036);
      // The ears: pointed, flat and wide, a dark hollow in the front of each.
      hv.slab([s * 0.13, 0.235, 0.085], [0.075, 0.14, 0.035], furH, { rot: [0.18, 0, -s * 0.22], taper: [0.08, 0.5] });
      hv.slab([s * 0.13, 0.225, 0.055], [0.045, 0.1, 0.012], P.dark, { rot: [0.18, 0, -s * 0.22], taper: [0.08, 0.5] });
      // The lip curled up off red gums, a row of teeth along it and a long fang that curves back.
      hs.tube([[s * 0.085, -0.105, -0.28], [s * 0.08, -0.115, -0.48], [s * 0.06, -0.11, -0.67]], [0.026, 0.026, 0.018], gum, { sides: 6 });
      for (let k = 0; k < 5; k++) {
        const z = -0.3 - 0.07 * k;
        if (k === 3) continue;
        const x = s * (0.082 - 0.005 * k);
        hs.tube([[x, -0.115, z], [x, -0.145, z], [x, -0.18, z - 0.005]], [0.02, 0.013, 0], P.tooth, { sides: 5 });
      }
      hs.tube([[s * 0.075, -0.11, -0.53], [s * 0.08, -0.2, -0.535], [s * 0.07, -0.31, -0.5]], [0.036, 0.024, 0], P.tooth, { sides: 6, shine: 0.6 });
      hs.tube([[s * 0.03, -0.11, -0.66], [s * 0.03, -0.13, -0.665], [s * 0.028, -0.15, -0.66]], [0.012, 0.008, 0], P.tooth, { sides: 5 });
    }
    // Fur: tufts of cubes over the brows and the cheeks to match the body, and the pale ruff that streams back from the cheeks and the throat.
    for (const s of [-1, 1]) {
      hv.rod([s * 0.1, 0.1, -0.2], [s * 0.15, 0.1, 0.06], 0.055, 0.03, fur(0.1), { rough: 0.1 });
      hv.ellipsoid([s * 0.15, -0.04, -0.12], [0.08, 0.08, 0.14], fur(0.05), { rough: 0.1 });
      hv.rod([s * 0.16, -0.08, -0.1], [s * 0.38, -0.2, 0.28], 0.1, 0.01, mane, { rough: 0.06 });
      hv.rod([s * 0.13, -0.14, -0.04], [s * 0.24, -0.34, 0.26], 0.085, 0.01, mane, {});
      hv.rod([s * 0.09, -0.17, -0.1], [s * 0.1, -0.38, 0.06], 0.07, 0.01, mane, {});
    }
    this.mesh(head, hs, hv);
    neck.add(head);
    // The lower jaw hangs on a hinge under the snout, and opens for a bite or a cast.
    const jaw = this.jaw;
    jaw.position.set(JAW_AT[0], JAW_AT[1], JAW_AT[2]);
    const js = this.smooth();
    // A deep lower jaw in the dark fur, narrowing to a blunt chin.
    const jv = this.voxels(CUBE, seed + 3);
    const jawFur = fur(0.4);
    jv.rod([0, -0.02, -0.05], [0, -0.04, -0.28], 0.105, 0.066, jawFur, { rough: 0.03 });
    jv.rod([0, -0.04, -0.28], [0, -0.04, -0.54], 0.066, 0.036, jawFur, { rough: 0.03 });
    jv.ellipsoid([0, -0.04, -0.55], [0.04, 0.036, 0.044], jawFur, {});
    for (const s of [-1, 1]) jv.ellipsoid([s * 0.06, -0.035, -0.3], [0.045, 0.045, 0.16], jawFur, {});
    // The red of the mouth and a tongue, seen when it opens.
    js.ellipsoid([0, 0.035, -0.28], [0.068, 0.024, 0.21], [150, 34, 44]);
    js.ellipsoid([0, 0.01, -0.22], [0.082, 0.03, 0.2], [70, 10, 16]);
    for (const s of [-1, 1]) {
      js.tube([[s * 0.06, 0.0, -0.48], [s * 0.065, 0.08, -0.485], [s * 0.058, 0.17, -0.5]], [0.03, 0.02, 0], P.tooth, { sides: 6, shine: 0.6 });
      for (let k = 0; k < 4; k++) {
        const z = -0.18 - 0.07 * k;
        const x = s * (0.072 - 0.004 * k);
        js.tube([[x, 0.0, z], [x, 0.035, z], [x, 0.07, z]], [0.02, 0.012, 0], P.tooth, { sides: 5 });
      }
    }
    this.mesh(jaw, js, jv);
    head.add(jaw);

    // ---- the legs: thick furred limbs, a dark bracer on each, big paws with bone claws ---------------------------------------------------
    const leg = (x: number, z: number, front: boolean, walk: number, trot: number): void => {
      const s = Math.sign(x);
      const up = new THREE.Group();
      const low = new THREE.Group();
      const paw = new THREE.Group();
      up.position.set(x, front ? 0.6 : 0.58, z);
      // Long legs under a long body: a wolf that can run. (The body is carried LEG_LIFT higher; the legs make up the difference.)
      const upLen = (front ? 0.27 : 0.29) + LEG_LIFT * 0.55;
      const lowLen = (front ? 0.26 : 0.27) + LEG_LIFT * 0.45;
      low.position.set(0, -upLen, 0);
      paw.position.set(0, -lowLen, 0);
      const k = seed + 10 + (front ? 0 : 5) + (s > 0 ? 1 : 0);
      const w = front ? 0.135 : 0.155;
      const us = this.smooth();
      us.tube([[0, 0.1, 0], [0, -upLen / 2, 0], [0, -upLen + 0.02, 0]], [w, w * 0.88, w * 0.74], limb, { sides: 12 });
      const u = this.voxels(CUBE, k);
      u.rod([0, 0.06, 0], [0, -upLen + 0.04, 0], w + 0.02, w * 0.78 + 0.02, fur(0.1), { rough: 0.07 });
      this.mesh(up, us, u);
      const ls = this.smooth();
      ls.tube([[0, 0.01, 0], [0, -lowLen / 2, 0], [0, -lowLen, 0]], [0.1, 0.092, 0.084], limb, { sides: 14 });
      ls.tube([[0, -0.01, 0], [0, -lowLen * 0.28, 0], [0, -lowLen * 0.56, 0]], [0.118, 0.113, 0.108], plate, { sides: 14, ...glint });
      ls.ring([0, -0.005, 0], 0.12, 0.12, 0.016, bone, { shine: 0.9 });
      ls.ring([0, -lowLen * 0.56, 0], 0.11, 0.11, 0.014, bone, { shine: 0.9 });
      ls.ellipsoid([0, 0.0, front ? -0.1 : 0.1], [0.045, 0.06, 0.045], edged(1), glint);
      this.mesh(low, ls);
      const pv = this.voxels(CUBE, k + 20);
      pv.ellipsoid([0, -0.04, -0.08], [0.14, 0.08, 0.2], fur(0.25), { rough: 0.05 });
      pv.ellipsoid([0, -0.105, -0.07], [0.12, 0.02, 0.17], P.furDark, {});
      const ps = this.smooth();
      for (const dx of [-0.07, 0, 0.07]) ps.tube([[dx, -0.05, -0.22], [dx, -0.075, -0.29], [dx, -0.11, -0.35]], [0.034, 0.022, 0], P.tooth, { sides: 5, shine: 0.4 });
      this.mesh(paw, pv, ps);
      body.add(up);
      up.add(low);
      low.add(paw);
      this.legs.push({ up, low, paw, walk, trot, front, last: 1 });
    };
    // Left hind, left fore, right hind, right fore, a quarter of a stride apart; and the diagonal pairs of a trot.
    leg(-0.24, -0.5, true, PI * 0.5, 0);
    leg(0.24, -0.5, true, PI * 1.5, PI);
    leg(-0.26, 0.54, false, 0, PI + TROT_LAG);
    leg(0.26, 0.54, false, PI, TROT_LAG);

    // ---- the tail: five segments of thick fur, bushy in the middle and pale at the tip --------------------------------------------------------
    // Each segment is a single rod of cubes, thick at its root and thinner at its end. Where two segments meet they would share the same round
    // surface and flicker against each other as the tail sways, so a segment starts a little narrower than the one before it ends: its joint
    // is hidden inside the last one's end.
    let parent: THREE.Object3D = body;
    TAIL.forEach((seg, i) => {
      const g = new THREE.Group();
      g.position.set(0, i === 0 ? 1.0 : 0, i === 0 ? 0.82 : TAIL[i - 1].len);
      const last = i === TAIL.length - 1;
      const r0 = seg.w * 0.55 * (i === 0 ? 1 : 0.9);
      const r1 = last ? 0.012 : TAIL[i + 1].w * 0.55;
      // How far toward the pale tip a point of this segment is: the last stretch of the tail turns cream-white fairly quickly (a slow fade would pass through pink).
      const tip = (z: number): number => smooth(3.55, 4.1, i + z / seg.len);
      const paint = (s: Spot): RGB => {
        const fleck = Math.sin(s.p[0] * 61 + s.p[1] * 97 + s.p[2] * 43) * Math.sin(s.p[2] * 71 - s.p[1] * 53);
        const base = mix(P.fur, P.furDark, clamp(0.12 + fleck * 0.25 + (s.p[1] > 0 ? 0.1 : 0), 0, 1));
        return mix(base, P.pad, tip(s.p[2]));
      };
      const tv = this.voxels(CUBE, seed + 30 + i);
      // The last one runs on into a long, pointed tuft.
      tv.rod([0, 0, 0], [0, last ? -0.02 : 0, seg.len + (last ? 0.26 : 0)], r0, r1, paint, { rough: 0.1 });
      // The shadow one has a row of bone spikes down its tail, curved back.
      if (style.tailSpikes && i >= 1 && i <= 3) vspike(tv, [0, r0 * 0.8, seg.len * 0.3], [0, r0 + 0.1, seg.len * 0.55], [0, r0 + 0.2, seg.len * 0.95], 0.04);
      this.mesh(g, tv);
      parent.add(g);
      parent = g;
      this.tail.push(g);
    });

    // ---- the lightning: it crackles between the horns, the ears and the spikes all the time, and the storm breaks out around it when it howls ------------
    this.arcGlow.color.setRGB(P.arc[0] / 255, P.arc[1] / 255, P.arc[2] / 255, THREE.SRGBColorSpace);
    const hot = mix(P.arc, [255, 255, 255], 0.82);
    this.arcCore.color.setRGB(hot[0] / 255, hot[1] / 255, hot[2] / 255, THREE.SRGBColorSpace);
    const both = (x: number, y: number, z: number): V3[] => [[-x, y, z], [x, y, z]];
    // The tips of the spikes on the body, and of the horns, ears and brow spikes on the head (the spaces of their bones).
    const bodyTips: V3[] = [...SPINE.map(([z, y, h]): V3 => [0, y + h, z + 0.2]), ...both(0.52, 1.42, -0.34), ...both(0.5, 1.26, 1.1)];
    const headTips: V3[] = [...both(0.3, 0.4, 0.44), ...both(0.2, 0.42, 0.1), ...both(0.24, 0.24, -0.12), [0, 0.31, 0.13], ...both(0.16, 0.37, 0.11)];
    const lastLen = TAIL[TAIL.length - 1].len;
    const tailTips: V3[] = [[0, -0.02, lastLen + 0.26], [0, 0, lastLen * 0.6], [0, 0, 0.1]];
    const mk = (parent: THREE.Object3D, o: ConstructorParameters<typeof ArcSet>[3]): ArcSet => {
      const set = new ArcSet(parent, this.arcGlow, this.arcCore, o);
      this.arcs.push(set);
      return set;
    };
    this.crackle.body = mk(body, { slots: 8, rate: 3, life: [0.08, 0.2], radius: 0.034, jag: 0.1, pick: pickAmong(bodyTips, 1.3, 0.85, 0.45, 0.35) });
    this.crackle.head = mk(head, { slots: 5, rate: 3, life: [0.07, 0.18], radius: 0.026, jag: 0.1, pick: pickAmong(headTips, 0.9, 0.6, 0.45, 0.25) });
    this.crackle.tail = mk(this.tail[this.tail.length - 1], { slots: 3, rate: 2, life: [0.07, 0.18], radius: 0.028, jag: 0.12, pick: pickAmong(tailTips, 0.2, 0.6, 1) });
    // The storm that answers the howl: bolts from the spikes to the ground all around, and from the sky down onto the spikes.
    this.storm = mk(body, {
      slots: 10,
      rate: 6,
      life: [0.08, 0.2],
      radius: 0.048,
      jag: 0.16,
      pick: (from, to) => {
        const p = bodyTips[Math.floor(Math.random() * bodyTips.length)];
        if (Math.random() < 0.65) {
          const a = Math.random() * Math.PI * 2;
          const r = 0.8 + Math.random() * 1.7;
          from.set(p[0], p[1], p[2]);
          to.set(Math.cos(a) * r, 0.02, Math.sin(a) * r);
        } else {
          from.set(p[0] + (Math.random() - 0.5) * 0.8, 3.2 + Math.random() * 0.6, p[2] + (Math.random() - 0.5) * 0.8);
          to.set(p[0], p[1], p[2]);
        }
      },
    });
  }

  /** The light that falls on the mount (the same colour for all of it). */
  setTint(c: THREE.Color): void {
    this.lit.color.copy(c);
    // The eyes burn: a dark cave does not put them out.
    this.glow.color.setRGB(Math.max(0.75, c.r), Math.max(0.75, c.g), Math.max(0.75, c.b));
  }

  /**
   * One frame: `speed` is blocks per second over the ground, `turn` radians per second (positive to the left), `vy` the
   * vertical speed and `airborne` whether the feet are off the ground.
   */
  update(dt0: number, speed: number, turn: number, vy: number, airborne: boolean): void {
    const dt = Math.min(dt0, 0.05);
    const ease = (rate: number): number => 1 - Math.exp(-dt * rate);
    this.spd += (speed - this.spd) * ease(8);
    const spd = this.spd < 0.05 ? 0 : this.spd;
    const k = clamp(spd / 8.6, 0, 1);
    this.amp += (clamp(spd / 2.5, 0, 1) - this.amp) * ease(7);
    if (this.amp < 0.002) this.amp = 0;
    this.clock += dt;
    if (this.amp > 0) this.gait += Math.PI * 2 * (0.55 + 0.3 * Math.min(spd, 9)) * dt;
    this.air += ((airborne ? 1 : 0) - this.air) * ease(airborne ? 14 : 10);
    if (this.air < 0.002) this.air = 0;
    // Coming down from a jump: all four paws at once, hard.
    if (this.air > 0.6) this.wasAir = true;
    else if (this.wasAir && this.air < 0.35) {
      this.wasAir = false;
      this.step(this.root, 1.3);
    }
    if (this.pop < 1) this.pop = Math.min(1, this.pop + dt / 0.4);
    const a = this.amp * (1 - this.air);
    const air = this.air;
    const t = this.clock;

    // The legs: a walk in four beats that turns into a trot as it speeds up (diagonal pairs, the hinds a little behind the fores), the stride longer
    // and the knees higher the faster it goes; in the air the front ones reach, the hind ones trail.
    const swingA = 0.3 + 0.5 * k;
    const lift = 0.2 + 0.8 * k;
    const trot = clamp((spd - 2.8) / 4, 0, 1);
    for (const l of this.legs) {
      const phi = this.gait + l.walk + (l.trot - l.walk) * trot;
      const s = Math.sin(phi);
      const c = Math.cos(phi);
      // A paw comes down as the leg stops reaching and starts to push back: the cosine turns from positive to negative.
      if (l.last > 0 && c <= 0 && a > 0.3 && air < 0.3) this.step(l.paw, 0.35 + 0.65 * k);
      l.last = c;
      let up = swingA * a * s;
      let low = -lift * a * Math.max(0, c) * 0.9;
      let paw = -(up + low) * 0.55 + 0.18 * a * c;
      if (!l.front) {
        // A hind leg stands with the knee forward and the hock back.
        up += 0.32;
        low += -0.62;
        paw += 0.3;
      }
      const upAir = l.front ? 0.95 : -0.65;
      const lowAir = l.front ? -0.45 : -0.3;
      const pawAir = l.front ? 0.2 : 0.75;
      l.up.rotation.x = up * (1 - air) + upAir * air;
      l.low.rotation.x = low * (1 - air) + lowAir * air;
      l.paw.rotation.x = paw * (1 - air) + pawAir * air;
    }

    // The body: bobs with each stride, leans forward as it speeds up, rocks with the gait, noses up and down in a jump, banks into a turn.
    const breath = Math.sin(t * 1.8) * 0.006 * (1 - a);
    this.bob = BODY_LIFT + 0.045 * k * a * Math.abs(Math.sin(this.gait)) - 0.015 * a + breath + 0.04 * air;
    this.body.position.y = this.bob;
    const rise = clamp(vy / 9, -1, 1);
    this.pitch = -0.05 * k * a + Math.sin(this.gait * 2) * 0.03 * k * a + rise * 0.22 * air;
    this.body.rotation.x = this.pitch;
    this.bank += (clamp(turn * 0.05, -0.16, 0.16) * (0.4 + 0.6 * a) - this.bank) * ease(5);
    this.roll = this.bank * (1 - air) + Math.sin(this.gait) * 0.018 * k * a;
    this.root.rotation.z = this.roll;
    this.body.scale.set(MOUNT_SCALE, MOUNT_SCALE * (1 + breath * 1.4), MOUNT_SCALE);

    // The neck and head nod against the body; the tail streams out behind and sways.
    this.neck.rotation.x = NECK_TILT + 0.05 * Math.sin(this.gait * 2 + 1) * k * a - 0.1 * air * rise - this.pitch * 0.5;
    this.head.rotation.x = HEAD_TILT + 0.1 * Math.sin(this.gait * 2 - 0.4) * k * a;
    this.head.rotation.y = Math.sin(t * 0.7) * 0.05 * (1 - a);
    // The neck and the head lead into a turn and swing a little with each stride (about the body's upright, which is the neck's own z once it is laid forward);
    // the head follows the neck a beat later, so the two do not move as one rod.
    this.look += (this.bank * 2 - this.look) * ease(6);
    this.neck.rotation.z = this.look + 0.05 * Math.sin(this.gait) * k * a;
    this.head.rotation.z = this.bank * 0.9 + 0.04 * Math.sin(this.gait - 0.9) * k * a;
    // The rider leans over what the body does: forward as it speeds up and in a climb, back in a drop, into a turn.
    this.leanPitch += (-0.14 * k * a - 0.2 * air * rise - this.leanPitch) * ease(5);
    this.leanRoll += (this.bank * 0.8 + Math.sin(this.gait) * 0.012 * k * a - this.leanRoll) * ease(7);
    // A bite throws the neck forward and down while the jaw snaps shut on it; the howl lifts the head and opens the jaw wide.
    this.biteT = Math.min(1, this.biteT + dt / 0.4);
    this.roarT = Math.min(1, this.roarT + dt / 0.9);
    const lunge = Math.sin(Math.PI * Math.pow(this.biteT, 0.7));
    const roar = Math.sin(Math.PI * Math.pow(this.roarT, 0.6));
    this.neck.rotation.x += -0.5 * lunge + ROAR_NECK * roar;
    this.neck.position.z = NECK_AT[2] - 0.28 * lunge;
    this.head.rotation.x += -0.2 * lunge + ROAR_HEAD * roar;
    this.jaw.rotation.x = -0.24 - 0.08 * Math.sin(t * 1.3) * (1 - a) - 0.75 * Math.sin(Math.PI * Math.min(1, this.biteT * 1.3)) * (this.biteT < 1 ? 1 : 0) - 0.65 * roar;
    const stream = clamp(k * a + air * 0.4, 0, 1);
    this.tail.forEach((g, i) => {
      const wave = Math.sin(t * (2.1 + 2.2 * k) - i * 0.8);
      g.rotation.x = TAIL_BASE[i] + (i === 0 ? 0.4 : 0.04) * stream + wave * (0.05 + 0.05 * k) * (i + 1) * 0.5;
      g.rotation.y = Math.sin(t * 1.4 - i * 0.9) * (0.1 + 0.1 * (1 - k)) * (0.5 + 0.2 * i) - this.bank * 2.4;
    });

    // The lightning: a steady crackle that grows busier at a run, sparks at the head on a bite and breaks out all around in the howl's storm.
    const { body: crackleBody, head: crackleHead, tail: crackleTail } = this.crackle;
    // Lightning is kept off the eye: it thins out as it comes near the camera. The rider (first person) sits in the middle of it, so for
    // them it fades over a longer way and is drawn thinner, and what is left is the crackle out on the head and the shoulders ahead.
    const near: readonly [number, number] = this.rider ? [2.5, 6] : [0.6, 2];
    const thin = this.rider ? 0.5 : 1;
    for (const set of [crackleBody, crackleHead, crackleTail]) set?.setView(this.viewer, near, thin);
    this.storm?.setView(this.viewer, this.rider ? [1.5, 4] : near, this.rider ? 0.6 : 1);
    crackleBody?.update(dt, 1 + 1.5 * stream + 3 * roar);
    crackleHead?.update(dt, 1 + 0.8 * stream + 3 * lunge + 3 * roar);
    crackleTail?.update(dt, 0.8 + stream + 2 * roar);
    this.storm?.update(dt, roar > 0.05 ? roar * 1.2 : 0);

    // A new mount grows out of the ground with a little overshoot.
    const p = this.pop;
    const grow = p >= 1 ? 1 : 1 + 2.2 * Math.pow(p - 1, 3) + 1.2 * Math.pow(p - 1, 2);
    this.root.scale.setScalar(Math.max(0.01, grow));
  }

  dispose(): void {
    for (const a of this.arcs) a.dispose();
    this.arcs = [];
    for (const m of this.mats) m.dispose();
  }
}

/** What a mount is called: the name of its definition. */
export const mountName = (id: MountId): string => mountDef(id)?.name ?? 'Fenrir';
