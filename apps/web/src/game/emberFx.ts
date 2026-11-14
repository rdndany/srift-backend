import * as THREE from 'three';
import { EMBER_CAST } from '@solrift/shared';
import type { AbilitySound } from './abilitySounds';

/**
 * What the Emberstone looks like (the sounds are in abilitySounds.ts). While it is cast, a ring of runes turns on the
 * ground under the caster, a column of light rises around them and square embers spiral up it, faster and denser as the cast
 * goes on. When it takes hold the embers rush up the column and the caster is gone; at the bed a flash of light and a burst
 * of sparks marks the arrival. A lost cast gutters out. Everyone near sees it, the caster's own view included.
 *
 * Everything is built of cubes, flat-lit, like the rest of the game: the embers are small cubes, the column is a ring of
 * stacked cubes with runs of light climbing it and gaps between them, and the runes are drawn in a 32 x 32 texture that is
 * not smoothed.
 */

const MAX = 480;

/** The column: a ring of cubes snapped to a grid (so its section is a stepped circle), COL_LEVELS high. */
const COL_CUBE = 0.2;
const COL_LEVELS = 17;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const hash = (a: number, b: number): number => {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return v - Math.floor(v);
};
const COL_CELLS: { x: number; z: number; luck: number }[] = (() => {
  const out: { x: number; z: number; luck: number }[] = [];
  const seen = new Set<string>();
  const R = 0.85;
  const n = Math.round((Math.PI * 2 * R) / (COL_CUBE * 0.8));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const gx = Math.round((Math.cos(a) * R) / COL_CUBE);
    const gz = Math.round((Math.sin(a) * R) / COL_CUBE);
    const key = `${gx},${gz}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ x: gx * COL_CUBE, z: gz * COL_CUBE, luck: hash(gx, gz) });
  }
  return out;
})();

type RGB = readonly [number, number, number];

/** What the light looks like and sounds like: the Emberstone's is warm, a mount's is violet. */
export interface FxLook {
  /** The sparks, dimmest to brightest. */
  palette: readonly RGB[];
  /** The sparks of a lost cast. */
  dim: RGB;
  /** The column of light (its brightest colour). */
  column: RGB;
  /** The runes: their colour where they are faint and where they are bright (0..255). */
  runeLo: RGB;
  runeHi: RGB;
  /** If given, the light heats up over the cast, step by step, through these colours (yellow first, red last). */
  heat?: readonly RGB[];
  /** How long the cast takes, seconds. */
  castTime: number;
  sounds: { tick: AbilitySound; fizzle: AbilitySound; depart: AbilitySound; arrive: AbilitySound; puff: AbilitySound };
}

/** The Emberstone: warm orange sparks, from a deep orange to near white. */
export const EMBER_LOOK: FxLook = {
  palette: [
    [1, 0.5, 0.12],
    [1, 0.72, 0.2],
    [1, 0.9, 0.5],
    [1, 0.97, 0.82],
  ],
  dim: [0.55, 0.25, 0.12],
  column: [1, 0.62, 0.25],
  runeLo: [255, 190, 90],
  runeHi: [255, 230, 160],
  // The stone in the hand goes yellow, orange, red (held/heat.ts); the light round the caster does the same.
  heat: [
    [1, 0.8, 0.15],
    [0.95, 0.3, 0.04],
    [0.7, 0.05, 0.02],
  ],
  castTime: EMBER_CAST,
  sounds: { tick: 'ember_tick', fizzle: 'ember_fizzle', depart: 'ember_depart', arrive: 'ember_arrive', puff: 'ember_arrive' },
};

/** How many steps the heat goes up in over a cast. */
const HEAT_STEPS = 7;

/** A spiralling ember is placed by an angle, a radius and a height round a centre; a free one just flies. */
const SPIRAL = 0;
const FREE = 1;

interface Cast {
  x: number;
  y: number;
  z: number;
  t: number;
  pulse: number;
  spawn: number;
  column: THREE.InstancedMesh;
  ring: THREE.Mesh;
}

interface Flash {
  x: number;
  y: number;
  z: number;
  t: number;
  life: number;
  grow: number;
  /** How hot its light is (see `update`), -1 for the plain colours. */
  heat: number;
  /** The colours it is in (a mount's own, or the one this was made with). */
  look: FxLook;
  column: THREE.InstancedMesh;
  ring: THREE.Mesh;
}

/** The runes: an outer ring, an inner ring, eight spokes and four diamonds, on a 32 x 32 grid. */
function runeTexture(lo: RGB, hi: RGB): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const img = g.createImageData(32, 32);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const dx = x - 15.5;
      const dy = y - 15.5;
      const d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const spoke = Math.abs(((a + Math.PI * 2) % (Math.PI / 4)) - Math.PI / 8) > Math.PI / 8 - 0.09 && d > 9.4 && d < 12.6;
      const diamond = Math.abs(dx) + Math.abs(dy) < 4.2 && Math.abs(dx) + Math.abs(dy) > 2.2;
      let v = 0;
      if (d > 13.2 && d < 15.4) v = 1;
      else if (d > 8.2 && d < 9.4) v = 0.7;
      else if (spoke) v = 0.85;
      else if (diamond) v = 0.9;
      else if (d > 15.4 && d < 16 && (x + y) % 2 === 0) v = 0.3;
      const o = (y * 32 + x) * 4;
      img.data[o] = Math.round(lo[0] + v * (hi[0] - lo[0]));
      img.data[o + 1] = Math.round(lo[1] + v * (hi[1] - lo[1]));
      img.data[o + 2] = Math.round(lo[2] + v * (hi[2] - lo[2]));
      img.data[o + 3] = Math.round(v * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class EmberFx {
  readonly group = new THREE.Group();
  /** Where the sounds go: the sound, where it is made and (for `ember_tick`) how far the cast has got. */
  onSound: ((sound: AbilitySound, x: number, y: number, z: number, progress: number) => void) | null = null;

  private readonly casts: Cast[] = [];
  private readonly flashes: Flash[] = [];
  /** Where the camera is (the cubes of the column that come near it make way). */
  viewer: THREE.Vector3 | null = null;
  private readonly sparks: THREE.InstancedMesh;
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v3 = new THREE.Vector3();
  private readonly s3 = new THREE.Vector3();
  private readonly tint = new THREE.Color();
  private readonly pos = new Float32Array(MAX * 3);
  private readonly col = new Float32Array(MAX * 3);
  private readonly kind = new Uint8Array(MAX);
  private readonly cx = new Float32Array(MAX);
  private readonly cy = new Float32Array(MAX);
  private readonly cz = new Float32Array(MAX);
  private readonly ang = new Float32Array(MAX);
  private readonly rad = new Float32Array(MAX);
  private readonly h = new Float32Array(MAX);
  private readonly omega = new Float32Array(MAX);
  private readonly dr = new Float32Array(MAX);
  private readonly vx = new Float32Array(MAX);
  private readonly vy = new Float32Array(MAX);
  private readonly vz = new Float32Array(MAX);
  private readonly life = new Float32Array(MAX);
  private readonly maxLife = new Float32Array(MAX);
  private readonly base = new Float32Array(MAX * 3);
  private next = 0;

  private readonly cubeGeo = new THREE.BoxGeometry(1, 1, 1);
  private readonly ringGeo: THREE.PlaneGeometry;
  private readonly runes: THREE.CanvasTexture;
  /** The runes of the other looks asked for (a mount's own colour), made when first needed. */
  private readonly otherRunes = new Map<FxLook, THREE.CanvasTexture>();

  constructor(private readonly look: FxLook = EMBER_LOOK) {
    // The embers: cubes added to the view, so dark is clear (all hidden until one is lit).
    const mat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.sparks = new THREE.InstancedMesh(this.cubeGeo, mat, MAX);
    this.sparks.frustumCulled = false;
    this.sparks.renderOrder = 12;
    this.s3.setScalar(0);
    this.m4.compose(this.v3.set(0, -1e4, 0), this.q, this.s3);
    for (let i = 0; i < MAX; i++) {
      this.pos[i * 3 + 1] = -1e4;
      this.sparks.setMatrixAt(i, this.m4);
      this.sparks.setColorAt(i, this.tint.setRGB(0, 0, 0));
    }
    this.group.add(this.sparks);
    this.ringGeo = new THREE.PlaneGeometry(1, 1);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.runes = runeTexture(this.look.runeLo, this.look.runeHi);
  }

  // ---- what the session tells us -------------------------------------------------------------------------------

  start(x: number, y: number, z: number): void {
    const column = this.makeColumn();
    const ring = this.makeRing();
    column.position.set(x, y, z);
    ring.position.set(x, y + 0.06, z);
    this.casts.push({ x, y, z, t: 0, pulse: 0, spawn: 0, column, ring });
  }

  /** A cast was lost where this is: it gutters out. */
  stop(x: number, y: number, z: number): void {
    const c = this.take(x, y, z);
    if (!c) return;
    this.free(c.column, c.ring);
    this.onSound?.(this.look.sounds.fizzle, x, y, z, 0);
    for (let i = 0; i < 22; i++) this.free1(x + (Math.random() - 0.5) * 1.2, y + 0.1 + Math.random() * 1.2, z + (Math.random() - 0.5) * 1.2, this.look.dim, 0.5, 0.7);
  }

  /** A cast that finished (what it was for has happened): its light is taken away without a sound. */
  end(x: number, y: number, z: number): void {
    const c = this.take(x, y, z);
    if (c) this.free(c.column, c.ring);
  }

  /** The caster is gone: the embers rush up the column and a flash is left where they stood. */
  depart(x: number, y: number, z: number): void {
    const c = this.take(x, y, z);
    if (c) this.free(c.column, c.ring);
    const hot = this.look.heat ? 1 : -1;
    for (let i = 0; i < 70; i++) this.spiral(x, y, z, 0.7 + Math.random() * 0.5, 6 + Math.random() * 6, 5 + Math.random() * 5, -0.5, 0.5 + Math.random() * 0.45, hot >= 0 ? this.heatColour(hot, 0.4) : undefined);
    this.flash(x, y, z, 0.55, 1.4, 4, hot);
    this.onSound?.(this.look.sounds.depart, x, y, z, 0);
  }

  /** Someone came home here: a flash of light, a ring running out over the ground and sparks thrown up. */
  arrive(x: number, y: number, z: number): void {
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.2 + Math.random() * 3.2;
      this.free1(x, y + 0.2 + Math.random() * 1.6, z, this.look.palette[(Math.random() * this.look.palette.length) | 0], 0.7 + Math.random() * 0.7, 1, Math.cos(a) * s, 0.8 + Math.random() * 3, Math.sin(a) * s);
    }
    this.flash(x, y, z, 0.8, 2.2, 5.5);
    this.onSound?.(this.look.sounds.arrive, x, y, z, 0);
  }

  /** Something light happened here (a rider got off): a small ring and a few sparks. */
  puff(x: number, y: number, z: number, look: FxLook = this.look): void {
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.8 + Math.random() * 1.6;
      this.free1(x + Math.cos(a) * 0.5, y + 0.15 + Math.random() * 0.8, z + Math.sin(a) * 0.5, look.palette[(Math.random() * look.palette.length) | 0], 0.45 + Math.random() * 0.4, 1.4, Math.cos(a) * s, 0.4 + Math.random() * 1.2, Math.sin(a) * s);
    }
    this.flash(x, y, z, 0.4, 1.2, 1.8, -1, look);
    this.onSound?.(look.sounds.puff, x, y, z, 0);
  }

  // ---- the frame ------------------------------------------------------------------------------------------------

  update(dt: number, time: number): void {
    for (let i = this.casts.length - 1; i >= 0; i--) {
      const c = this.casts[i];
      c.t += dt;
      const k = Math.min(1, c.t / this.look.castTime);
      if (c.t > this.look.castTime + 0.8) {
        this.free(c.column, c.ring);
        this.casts.splice(i, 1);
        continue;
      }
      // How hot the light is, in steps: 0 (yellow) .. 1 (red); -1 for a light that does not heat up.
      const heat = this.look.heat ? Math.min(HEAT_STEPS - 1, Math.floor(k * HEAT_STEPS)) / (HEAT_STEPS - 1) : -1;
      // The ring turns faster and the column brightens as the cast goes on.
      c.ring.rotation.y = time * (0.8 + k * 3.6);
      c.ring.scale.setScalar(2.5 + Math.sin(time * 5) * 0.06 + k * 0.4);
      (c.ring.material as THREE.MeshBasicMaterial).opacity = Math.min(1, 0.3 + k * 0.7);
      if (heat >= 0) (c.ring.material as THREE.MeshBasicMaterial).color.setRGB(...this.heatColour(heat, 0));
      // The column fills with light as the cast goes on: more of its cubes lit, and narrowing a little.
      this.layoutColumn(c.column, time, 0.1 + k * 0.5, heat);
      c.column.scale.set(1 - k * 0.25, 0.7 + k * 0.45, 1 - k * 0.25);
      c.spawn += dt * (10 + k * 34);
      while (c.spawn >= 1) {
        c.spawn -= 1;
        this.spiral(c.x, c.y, c.z, 1.15 + Math.random() * 0.35, 1.2 + Math.random() * 1.2 + k * 1.2, 2.4 + k * 3.2, -0.22, 1.1 + Math.random() * 0.7, heat >= 0 ? this.heatColour(heat, 0.3) : undefined);
      }
      c.pulse -= dt;
      if (c.pulse <= 0 && k < 1) {
        c.pulse += 0.5;
        this.onSound?.(this.look.sounds.tick, c.x, c.y, c.z, k);
      }
    }

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) {
        this.free(f.column, f.ring);
        this.flashes.splice(i, 1);
        continue;
      }
      const fade = (1 - k) * (1 - k);
      this.layoutColumn(f.column, time, 0.75 * fade, f.heat, f.look);
      f.column.scale.set(1 + k * 0.6, 1.6 - k * 0.9, 1 + k * 0.6);
      (f.ring.material as THREE.MeshBasicMaterial).opacity = fade;
      f.ring.scale.setScalar(1.6 + k * f.grow);
      f.ring.rotation.y += dt * 4;
    }

    this.stepEmbers(dt);
  }

  destroy(): void {
    for (const c of this.casts) this.free(c.column, c.ring);
    for (const f of this.flashes) this.free(f.column, f.ring);
    this.casts.length = 0;
    this.flashes.length = 0;
    (this.sparks.material as THREE.Material).dispose();
    this.sparks.dispose();
    this.cubeGeo.dispose();
    this.ringGeo.dispose();
    this.runes.dispose();
    for (const t of this.otherRunes.values()) t.dispose();
    this.otherRunes.clear();
    this.group.removeFromParent();
  }

  /** How many casts are being shown (the debug hook and the tests). */
  get active(): number {
    return this.casts.length + this.flashes.length;
  }

  // ---- parts -----------------------------------------------------------------------------------------------------

  private makeColumn(): THREE.InstancedMesh {
    // Solid (not added) cubes, a little see-through, so the light does not turn pale against the sky.
    const m = new THREE.InstancedMesh(this.cubeGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false }), COL_CELLS.length * COL_LEVELS);
    m.frustumCulled = false;
    m.count = 0;
    m.renderOrder = 10;
    m.setColorAt(0, this.tint.setRGB(1, 1, 1));
    this.group.add(m);
    return m;
  }

  /** Lay out the cubes of a column: runs of light that climb its sides with dark gaps between them (`density`: how much of it is lit), pale at the foot and deep at the top. */
  private layoutColumn(m: THREE.InstancedMesh, time: number, density: number, heat = -1, look: FxLook = this.look): void {
    const pal = look.palette;
    const v = this.viewer;
    let n = 0;
    COL_CELLS.forEach((c, ci) => {
      for (let j = 0; j < COL_LEVELS; j++) {
        const u = j / (COL_LEVELS - 1);
        const run = Math.floor(j / 2 - time * (3 + c.luck * 3));
        if (hash(ci * 7.1, run) >= density * (1 - 0.55 * u)) continue;
        // A cube between the camera and the caster would be a great block over the view: the nearer to the camera, the smaller.
        const wx = m.position.x + c.x * m.scale.x;
        const wy = m.position.y + (j * COL_CUBE + COL_CUBE * 0.5) * m.scale.y;
        const wz = m.position.z + c.z * m.scale.z;
        const near = v ? clamp01((Math.hypot(wx - v.x, wy - v.y, wz - v.z) - 0.9) / 1.3) : 1;
        if (near <= 0.01) continue;
        const size = COL_CUBE * near * (0.55 + 0.45 * hash(ci, j + 9)) * (u > 0.75 ? 1 - (u - 0.75) * 2.4 : 1);
        this.m4.compose(this.v3.set(c.x, j * COL_CUBE + COL_CUBE * 0.5, c.z), this.q, this.s3.setScalar(size));
        m.setMatrixAt(n, this.m4);
        // Orange for most of it, pale only at the foot.
        // (A heating light is hotter at the foot than at the top, in steps.)
        const col = heat >= 0 ? this.heatColour(Math.round(clamp01(heat * 1.25 - u * 0.25) * (HEAT_STEPS - 1)) / (HEAT_STEPS - 1), 0) : pal[Math.min(2, Math.floor((1 - u) * 3))];
        m.setColorAt(n, this.tint.setRGB(col[0], col[1], col[2]));
        n++;
      }
    });
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  private runesOf(look: FxLook): THREE.CanvasTexture {
    if (look === this.look) return this.runes;
    let t = this.otherRunes.get(look);
    if (!t) {
      t = runeTexture(look.runeLo, look.runeHi);
      this.otherRunes.set(look, t);
    }
    return t;
  }

  private makeRing(look: FxLook = this.look): THREE.Mesh {
    // (A light that heats up has solid runes: added to green ground, red would turn yellow.)
    const blending = look.heat ? THREE.NormalBlending : THREE.AdditiveBlending;
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ map: this.runesOf(look), transparent: true, opacity: 0, blending, depthWrite: false }));
    m.frustumCulled = false;
    this.group.add(m);
    return m;
  }

  private free(...meshes: THREE.Mesh[]): void {
    for (const m of meshes) {
      m.removeFromParent();
      (m.material as THREE.Material).dispose();
      if (m instanceof THREE.InstancedMesh) m.dispose();
    }
  }

  private flash(x: number, y: number, z: number, life: number, start: number, grow: number, heat = -1, look: FxLook = this.look): void {
    const column = this.makeColumn();
    const ring = this.makeRing(look);
    column.position.set(x, y, z);
    ring.position.set(x, y + 0.06, z);
    ring.scale.setScalar(start);
    if (heat >= 0) (ring.material as THREE.MeshBasicMaterial).color.setRGB(...this.heatColour(heat, 0));
    this.flashes.push({ x, y, z, t: 0, life, grow, heat, look, column, ring });
  }

  /** The cast nearest to a point (within two blocks), taken out of the list. */
  private take(x: number, y: number, z: number): Cast | null {
    let best = -1;
    let bestD = 2.5;
    this.casts.forEach((c, i) => {
      const d = Math.hypot(c.x - x, c.y - y, c.z - z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best < 0 ? null : this.casts.splice(best, 1)[0];
  }

  private slot(): number {
    return this.next++ % MAX;
  }

  private colour(i: number, c: readonly [number, number, number]): void {
    this.base[i * 3] = c[0];
    this.base[i * 3 + 1] = c[1];
    this.base[i * 3 + 2] = c[2];
  }

  /** An ember that circles a point, climbing and drawing in (a negative `dr`), or spreading (a positive one). */
  private spiral(x: number, y: number, z: number, radius: number, rise: number, omega: number, dr: number, life: number, colour?: RGB): void {
    const i = this.slot();
    this.kind[i] = SPIRAL;
    this.cx[i] = x;
    this.cy[i] = y;
    this.cz[i] = z;
    this.ang[i] = Math.random() * Math.PI * 2;
    this.rad[i] = radius;
    this.h[i] = Math.random() * 0.25;
    this.omega[i] = omega;
    this.dr[i] = dr;
    this.vy[i] = rise;
    this.maxLife[i] = this.life[i] = life;
    this.colour(i, colour ?? this.look.palette[(Math.random() * this.look.palette.length) | 0]);
  }

  /** The colour of the light at `heat` 0 (yellow) .. 1 (red), a little off by chance (`spread`) so a crowd of embers is not one colour. */
  private heatColour(heat: number, spread: number): [number, number, number] {
    const stops = this.look.heat ?? this.look.palette;
    const at = clamp01(heat + (Math.random() - 0.5) * spread) * (stops.length - 1);
    const a = stops[Math.min(stops.length - 1, Math.floor(at))];
    const b = stops[Math.min(stops.length - 1, Math.floor(at) + 1)];
    const t = at - Math.floor(at);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  /** An ember that flies free and slows down. */
  private free1(x: number, y: number, z: number, c: readonly [number, number, number], life: number, drag: number, vx = (Math.random() - 0.5) * 0.8, vy = 0.6 + Math.random() * 1.2, vz = (Math.random() - 0.5) * 0.8): void {
    const i = this.slot();
    this.kind[i] = FREE;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.dr[i] = drag;
    this.maxLife[i] = this.life[i] = life;
    this.colour(i, c);
  }

  private stepEmbers(dt: number): void {
    let any = false;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) {
        if (this.pos[i * 3 + 1] > -1e3) this.hide(i);
        continue;
      }
      any = true;
      this.life[i] -= dt;
      if (this.kind[i] === SPIRAL) {
        this.ang[i] += this.omega[i] * dt;
        this.h[i] += this.vy[i] * dt;
        this.rad[i] = Math.max(0.05, this.rad[i] + this.dr[i] * dt);
        this.pos[i * 3] = this.cx[i] + Math.cos(this.ang[i]) * this.rad[i];
        this.pos[i * 3 + 1] = this.cy[i] + this.h[i];
        this.pos[i * 3 + 2] = this.cz[i] + Math.sin(this.ang[i]) * this.rad[i];
      } else {
        const damp = Math.max(0, 1 - this.dr[i] * dt);
        this.vx[i] *= damp;
        this.vz[i] *= damp;
        this.vy[i] = this.vy[i] * damp - 1.2 * dt;
        this.pos[i * 3] += this.vx[i] * dt;
        this.pos[i * 3 + 1] += this.vy[i] * dt;
        this.pos[i * 3 + 2] += this.vz[i] * dt;
      }
      // Additive: fading to black is fading away.
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const glow = Math.min(1, k * 2.2);
      this.col[i * 3] = this.base[i * 3] * glow;
      this.col[i * 3 + 1] = this.base[i * 3 + 1] * glow;
      this.col[i * 3 + 2] = this.base[i * 3 + 2] * glow;
      if (this.life[i] <= 0) {
        this.hide(i);
        continue;
      }
      // A cube of a few set sizes (a pixel picture has no half pixels), shrinking as it goes out.
      const v = this.viewer;
      const near = v ? clamp01((Math.hypot(this.pos[i * 3] - v.x, this.pos[i * 3 + 1] - v.y, this.pos[i * 3 + 2] - v.z) - 0.6) / 1.0) : 1;
      const size = (this.kind[i] === SPIRAL ? 0.1 : 0.085) * (0.45 + 0.55 * glow) * near;
      this.m4.compose(this.v3.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]), this.q, this.s3.setScalar(size));
      this.sparks.setMatrixAt(i, this.m4);
      this.sparks.setColorAt(i, this.tint.setRGB(this.col[i * 3], this.col[i * 3 + 1], this.col[i * 3 + 2]));
    }
    if (any) {
      this.sparks.instanceMatrix.needsUpdate = true;
      if (this.sparks.instanceColor) this.sparks.instanceColor.needsUpdate = true;
    }
  }

  /** Put an ember out of sight. */
  private hide(i: number): void {
    this.pos[i * 3 + 1] = -1e4;
    this.m4.compose(this.v3.set(0, -1e4, 0), this.q, this.s3.setScalar(0));
    this.sparks.setMatrixAt(i, this.m4);
  }
}
