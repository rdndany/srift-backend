import * as THREE from 'three';

/** How long the whole thing lasts (seconds). */
const TTL = 3.2;
const MAX_SPARKS = 420;

/** Where something stands (the effect follows it); null: it is gone, the effect stays where it last was. */
export type Anchor = () => { x: number; y: number; z: number } | null;

// ---- the colours (sRGB): the same gold as before, in the steps a pixel picture would have ----
const PALE = new THREE.Color().setHex(0xfff0b8, THREE.SRGBColorSpace);
const LIGHT = new THREE.Color().setHex(0xffd45a, THREE.SRGBColorSpace);
const GOLD = new THREE.Color().setHex(0xffb21e, THREE.SRGBColorSpace);
const AMBER = new THREE.Color().setHex(0xff8a10, THREE.SRGBColorSpace);

/** A repeatable pseudo-random number in 0..1 from two numbers (so a cube's luck is the same from one frame to the next, and changes in steps). */
const hash = (a: number, b: number): number => {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return v - Math.floor(v);
};
const ease = (x: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** The step height of one cube of the tower and how many are stacked. */
const CUBE = 0.26;
const LEVELS = 22;

interface Cell {
  x: number;
  z: number;
  /** 0 = the outer wall, 1 = the inner wall. */
  ring: number;
}

/** The cells (on a grid of cubes) of the walls of the tower: two rings snapped to the grid, so that its section is stepped like a circle of blocks. */
function towerCells(): Cell[] {
  const out: Cell[] = [];
  const seen = new Set<string>();
  const rings = [1.0];
  rings.forEach((R, ring) => {
    const n = Math.round((Math.PI * 2 * R) / (CUBE * 0.8));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const gx = Math.round((Math.cos(a) * R) / CUBE);
      const gz = Math.round((Math.sin(a) * R) / CUBE);
      const key = `${gx},${gz}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ x: gx * CUBE, z: gz * CUBE, ring });
    }
  });
  return out;
}

const CELLS = towerCells();
const CORE_CELLS: [number, number][] = [];
const CORE_STEP = 0.2;

/** The cells of the glowing floor: a disc of flat cubes. */
const FLOOR_STEP = 0.3;
const FLOOR_CELLS: { x: number; z: number; r: number }[] = (() => {
  const out: { x: number; z: number; r: number }[] = [];
  for (let gx = -8; gx <= 8; gx++) {
    for (let gz = -8; gz <= 8; gz++) {
      const r = Math.hypot(gx, gz) * FLOOR_STEP;
      if (r <= 1.3) out.push({ x: gx * FLOOR_STEP, z: gz * FLOOR_STEP, r });
    }
  }
  return out;
})();

const RING_CUBES = 40;
const RAYS = 0;
const RAY_CUBES = 8;

interface Ray {
  /** The way it points, snapped to a sixteenth of a turn, and how it will turn (a sixteenth now and then, never smoothly). */
  slot: number;
  y: number;
  len: number;
  phase: number;
}

interface Burst {
  group: THREE.Group;
  anchor: Anchor;
  last: { x: number; y: number; z: number };
  age: number;
  walls: THREE.InstancedMesh;
  core: THREE.InstancedMesh;
  floor: THREE.InstancedMesh;
  rings: THREE.InstancedMesh;
  rays: THREE.InstancedMesh;
  rayDefs: Ray[];
  emit: number;
  burst: boolean;
  /** Which way the rays are turned (in sixteenths of a turn), and when they last turned. */
  turn: number;
  turned: number;
}

interface Spark {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  swirl: number;
  life: number;
  max: number;
  size: number;
  hot: number;
}

/**
 * The level-up, in the manner of World of Warcraft but built of cubes like everything else here: a tower of light made of glowing blocks
 * stands round the figure, its pixels shimmering and flickering and dissolving away from the top, a hot core of pale blocks down the middle,
 * blocky rays shooting out to the sides, a floor of flat glowing tiles with square rings spreading out of it, and cubes of light thrown out and
 * rising all the way up.
 */
export class LevelUpFx {
  readonly group = new THREE.Group();
  private readonly bursts: Burst[] = [];
  private readonly sparks: Spark[] = [];
  private readonly sparkMesh: THREE.InstancedMesh;
  private readonly cube = new THREE.BoxGeometry(1, 1, 1);
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly col = new THREE.Color();
  /** Where the camera is: the cubes that come between it and the figure make way for it. */
  viewer: THREE.Vector3 | null = null;
  /** The camera is in the middle of a burst (first person). */
  private first = false;

  constructor() {
    this.sparkMesh = this.instanced(MAX_SPARKS, 1, true, 12);
    this.group.add(this.sparkMesh);
  }

  /** A set of cubes drawn together; `opacity` below 1 lets what is behind show through (the tower must not hide the figure in it). */
  private instanced(count: number, opacity: number, additive = false, order = 10): THREE.InstancedMesh {
    const mat = new THREE.MeshBasicMaterial({ transparent: opacity < 1 || additive, opacity, depthWrite: opacity >= 1 && !additive, fog: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const mesh = new THREE.InstancedMesh(this.cube, mat, Math.max(1, count));
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.renderOrder = order;
    mesh.setColorAt(0, this.col.setRGB(1, 1, 1));
    return mesh;
  }

  /** Start the effect on something that stands at `anchor()` (and moves with it). */
  start(anchor: Anchor): void {
    const at = anchor();
    if (!at) return;
    const group = new THREE.Group();
    group.position.set(at.x, at.y, at.z);
    const walls = this.instanced(CELLS.length * LEVELS, 0.75, false, 10);
    const core = this.instanced(CORE_CELLS.length * (LEVELS + 2), 0.92, false, 11);
    const floor = this.instanced(FLOOR_CELLS.length, 0.8, false, 9);
    const rings = this.instanced(RING_CUBES * 2, 0.95, false, 9);
    const rays = this.instanced(RAYS * RAY_CUBES, 0.95, false, 11);
    group.add(floor, rings, walls, core, rays);
    const rayDefs: Ray[] = [];
    for (let i = 0; i < RAYS; i++) rayDefs.push({ slot: i, y: 0.35 + Math.floor(Math.random() * 7) * 0.27, len: 2.4 + Math.random() * 3.4, phase: Math.random() * 6 });
    this.group.add(group);
    this.bursts.push({ group, anchor, last: { x: at.x, y: at.y, z: at.z }, age: 0, walls, core, floor, rings, rays, rayDefs, emit: 0, burst: false, turn: 0, turned: 0 });
  }

  private spark(x: number, y: number, z: number, big: boolean, out = false): void {
    if (this.sparks.length >= MAX_SPARKS) this.sparks.shift();
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * (big ? 1.5 : 1.15);
    const sp = out ? 1.5 + Math.random() * 3.5 : 0;
    this.sparks.push({
      x: x + Math.cos(a) * r * (out ? 0.3 : 1),
      y: y + 0.1 + Math.random() * (out ? 1.2 : 0.4),
      z: z + Math.sin(a) * r * (out ? 0.3 : 1),
      vx: Math.cos(a) * sp,
      vy: out ? 1 + Math.random() * 3 : 1.6 + Math.random() * 3.4,
      vz: Math.sin(a) * sp,
      swirl: out ? 0 : (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 1),
      life: 0.9 + Math.random() * 1.3,
      max: 2.2,
      // Cubes of a few set sizes (a pixel picture has no half pixels).
      size: [0.05, 0.075, 0.1, 0.125][Math.floor(Math.random() * 4)],
      hot: Math.random(),
    });
  }

  /** The colour of a cube of the tower: pale at the foot, through light and gold to amber at the top, with a band of brightness running up. */
  private shade(u: number, t: number, bandy: number, out: THREE.Color): THREE.Color {
    const band = Math.max(0, Math.sin(u * 15 - t * 9)) > 0.82 ? 1 : 0;
    // Steps, not a blend: four bands of colour up the tower.
    const step = Math.floor(clamp01(u) * 4);
    out.copy(step === 0 ? LIGHT : step === 1 ? GOLD : step === 2 ? GOLD : AMBER);
    if (u < 0.12) out.copy(PALE);
    if (band) out.copy(step >= 2 ? LIGHT : PALE);
    return bandy > 0.5 ? out : out.multiplyScalar(0.88);
  }

  update(dt: number): void {
    const step = Math.min(dt, 0.05);
    // From the eyes of the one it is on (first person) the tower is all round the camera, so it is shown more to the sides and nearer.
    const v = this.viewer;
    this.first = !!v && this.bursts.some((f) => Math.hypot(v.x - f.last.x, v.y - f.last.y, v.z - f.last.z) < 2.4);
    for (let b = this.bursts.length - 1; b >= 0; b--) {
      const f = this.bursts[b];
      f.age += step;
      if (f.age >= TTL) {
        this.group.remove(f.group);
        for (const m of [f.walls, f.core, f.floor, f.rings, f.rays]) {
          (m.material as THREE.Material).dispose();
          m.dispose();
        }
        this.bursts.splice(b, 1);
        continue;
      }
      const at = f.anchor();
      if (at) f.last = at;
      f.group.position.set(f.last.x, f.last.y, f.last.z);
      this.stepBurst(f, step);
    }

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      this.sparks[i].life -= step;
      if (this.sparks[i].life <= 0) this.sparks.splice(i, 1);
    }
    const cx = this.bursts.length ? this.bursts[this.bursts.length - 1].last.x : 0;
    const cz = this.bursts.length ? this.bursts[this.bursts.length - 1].last.z : 0;
    let n = 0;
    for (const sp of this.sparks) {
      // They are thrown out, then rise and turn slowly about the column.
      const dx = sp.x - cx;
      const dz = sp.z - cz;
      sp.vx *= 1 - 2.2 * step;
      sp.vz *= 1 - 2.2 * step;
      sp.x += (sp.vx - dz * sp.swirl * 0.8) * step;
      sp.z += (sp.vz + dx * sp.swirl * 0.8) * step;
      sp.y += sp.vy * step;
      const k = sp.life / sp.max;
      // (A cube right at the eye would be a great block over the view: they thin out there.)
      const near = this.viewer ? clamp01((Math.hypot(sp.x - this.viewer.x, sp.y - this.viewer.y, sp.z - this.viewer.z) - (this.first ? 0.45 : 1.2)) / (this.first ? 0.9 : 2.0)) : 1;
      this.p.set(sp.x, sp.y, sp.z);
      this.s.setScalar(sp.size * (this.first ? 1.4 : 1) * (k > 0.25 ? 1 : k * 4) * near);
      this.m4.compose(this.p, this.q, this.s);
      this.sparkMesh.setMatrixAt(n, this.m4);
      // Added to the view, so dark is clear; in the same few steps of colour as the rest.
      const c = sp.hot > 0.66 ? PALE : sp.hot > 0.33 ? LIGHT : GOLD;
      const fadeOut = k > 0.3 ? 1 : k / 0.3;
      this.sparkMesh.setColorAt(n, this.col.copy(c).multiplyScalar(fadeOut));
      n++;
    }
    this.sparkMesh.count = n;
    this.sparkMesh.instanceMatrix.needsUpdate = true;
    if (this.sparkMesh.instanceColor) this.sparkMesh.instanceColor.needsUpdate = true;
  }

  /** One frame of one burst: lay out every cube of it. */
  private stepBurst(f: Burst, step: number): void {
    const t = f.age;
    const grow = ease(t / 0.45);
    const fadeP = t < 1.9 ? 0 : (t - 1.9) / (TTL - 1.9);
    // The pixels of the tower change in steps, twelve times a second.
    const tick = Math.floor(t * 12);
    const vx = this.viewer ? this.viewer.x - f.last.x : 1e3;
    const vy = this.viewer ? this.viewer.y - f.last.y : 1e3;
    const vz = this.viewer ? this.viewer.z - f.last.z : 1e3;

    // ---- the wall cubes ----
    let n = 0;
    CELLS.forEach((c, ci) => {
      // Cells along the outer wall gap more, those of the inner wall less: the tower is made of columns of uneven light.
      const colBase = hash(ci, 3.7);
      for (let j = 0; j < LEVELS; j++) {
        const u = j / (LEVELS - 1);
        if (u > grow) break;
        // Dissolving away from the top.
        if ((1 - u) * 0.65 + hash(ci, j) * 0.35 < fadeP) continue;
        // Streaks of light running up the columns: each column lights short runs of cubes which climb, so the tower is made of
        // rising pieces with dark gaps between them, not a solid tube.
        const run = Math.floor(j / 2 - t * (5 + colBase * 5));
        const density = 0.28 * (0.6 + 0.4 * colBase) * (1 - 0.4 * u) + 0.03;
        if (hash(ci * 7.1, run) >= density) continue;
        // Cubes that would come between the camera and the figure make way: the nearer to the camera, the smaller.
        const near = clamp01((Math.hypot(c.x - vx, j * CUBE - vy, c.z - vz) - (this.first ? 0.55 : 1.3)) / (this.first ? 1.0 : 1.8));
        if (near <= 0.01) continue;
        const taper = u > 0.7 ? 1 - (u - 0.7) * 2.4 : 1;
        this.p.set(c.x * (1 - 0.3 * u), j * CUBE + CUBE * 0.5, c.z * (1 - 0.3 * u));
        this.s.setScalar(CUBE * (this.first ? 0.65 : 0.9) * near * taper * (0.55 + 0.45 * hash(ci, j + 9)));
        this.m4.compose(this.p, this.q, this.s);
        f.walls.setMatrixAt(n, this.m4);
        f.walls.setColorAt(n, this.shade(u, t, hash(ci, j + 4), this.col));
        n++;
      }
    });
    f.walls.count = n;
    f.walls.instanceMatrix.needsUpdate = true;
    if (f.walls.instanceColor) f.walls.instanceColor.needsUpdate = true;

    // ---- the core: a few columns of pale blocks, tall and bright ----
    n = 0;
    CORE_CELLS.forEach(([gx, gz], ci) => {
      const levels = LEVELS + 2;
      for (let j = 0; j < levels; j++) {
        const u = j / (levels - 1);
        if (u > grow) break;
        if ((1 - u) * 0.75 + hash(ci + 20, j) * 0.25 < fadeP) continue;
        if (hash(ci * 5.3 + tick * 1.9, j + 50) > 0.93 - 0.15 * u) continue;
        const x = gx * CORE_STEP;
        const z = gz * CORE_STEP;
        // The centre one is the longest; the ones round it are shorter.
        if (gx !== 0 || gz !== 0) if (u > 0.78) continue;
        const near = clamp01((Math.hypot(x - vx, j * CUBE * 0.9 - vy, z - vz) - 1.0) / 1.4);
        if (near <= 0.01) continue;
        this.p.set(x, j * CUBE * 0.9 + 0.12, z);
        this.s.setScalar(CORE_STEP * 0.95 * near * (u > 0.85 ? 1 - (u - 0.85) * 4 : 1));
        this.m4.compose(this.p, this.q, this.s);
        f.core.setMatrixAt(n, this.m4);
        f.core.setColorAt(n, this.col.copy(u > 0.6 ? LIGHT : PALE));
        n++;
      }
    });
    f.core.count = n;
    f.core.instanceMatrix.needsUpdate = true;
    if (f.core.instanceColor) f.core.instanceColor.needsUpdate = true;

    // ---- the floor: flat tiles that glow and flicker, in a wave running out from the middle ----
    n = 0;
    const floorFade = Math.min(1, t / 0.15) * (1 - fadeP);
    FLOOR_CELLS.forEach((c, ci) => {
      const wave = Math.sin(c.r * 3.4 - t * 7);
      const on = hash(ci + tick * 5.1, 1.3) < 0.6 - c.r * 0.2 + 0.2 * wave;
      if (!on) return;
      const near = this.viewer ? clamp01((Math.hypot(c.x - vx, 0 - vy, c.z - vz) - 0.5) / 1.0) : 1;
      this.p.set(c.x, 0.05, c.z);
      this.s.set(FLOOR_STEP * 0.92 * floorFade * near * (c.r > 2 ? 0.7 : 1), 0.05, FLOOR_STEP * 0.92 * floorFade * near * (c.r > 2 ? 0.7 : 1));
      this.m4.compose(this.p, this.q, this.s);
      f.floor.setMatrixAt(n, this.m4);
      f.floor.setColorAt(n, this.col.copy(c.r < 0.7 ? PALE : c.r < 1.5 ? LIGHT : GOLD).multiplyScalar(wave > 0.6 ? 1 : 0.85));
      n++;
    });
    f.floor.count = n;
    f.floor.instanceMatrix.needsUpdate = true;
    if (f.floor.instanceColor) f.floor.instanceColor.needsUpdate = true;

    // ---- square rings of cubes spreading out of the middle ----
    n = 0;
    for (let k = 0; k < 1; k++) {
      const rk = clamp01((t - 0.12 * k) / 1.2);
      if (rk <= 0 || rk >= 1) continue;
      const R = 0.7 + 3.6 * ease(rk);
      const edge = 0.22 * (1 - rk * rk);
      for (let i = 0; i < RING_CUBES; i++) {
        const a = (i / RING_CUBES) * Math.PI * 2;
        // Snapped to the grid of cubes, so the ring is a stepped one.
        const x = Math.round((Math.cos(a) * R) / 0.2) * 0.2;
        const z = Math.round((Math.sin(a) * R) / 0.2) * 0.2;
        this.p.set(x, 0.12, z);
        this.s.setScalar(edge);
        this.m4.compose(this.p, this.q, this.s);
        f.rings.setMatrixAt(n, this.m4);
        f.rings.setColorAt(n, this.col.copy(k === 0 ? PALE : LIGHT));
        n++;
      }
    }
    f.rings.count = n;
    f.rings.instanceMatrix.needsUpdate = true;
    if (f.rings.instanceColor) f.rings.instanceColor.needsUpdate = true;

    // ---- rays: rows of cubes dwindling away to the sides, turned a sixteenth of a turn now and then ----
    if (t - f.turned > 0.3) {
      f.turned = t;
      f.turn += 1;
    }
    n = 0;
    const rayGrow = ease(t / 0.4);
    const rayFade = t < 2 ? 1 : Math.max(0, 1 - (t - 2) / (TTL - 2));
    for (const r of f.rayDefs) {
      const ang = ((r.slot + f.turn * 0.5) / RAYS) * Math.PI * 2;
      const dx = Math.cos(ang);
      const dz = Math.sin(ang);
      const len = r.len * rayGrow * (0.75 + 0.25 * Math.sin(t * 9 + r.phase) * Math.sin(t * 5 + r.phase));
      for (let i = 0; i < RAY_CUBES; i++) {
        const k = i / (RAY_CUBES - 1);
        const dist = 0.55 + k * len;
        const edge = 0.24 * Math.pow(1 - k, 0.9) * rayFade;
        if (edge < 0.02) continue;
        const near = this.viewer ? clamp01((Math.hypot(dx * dist - vx, r.y - vy, dz * dist - vz) - 0.5) / 1.0) : 1;
        this.p.set(Math.round((dx * dist) / 0.12) * 0.12, r.y * (0.55 + 0.45 * grow), Math.round((dz * dist) / 0.12) * 0.12);
        this.s.setScalar(edge * near);
        this.m4.compose(this.p, this.q, this.s);
        f.rays.setMatrixAt(n, this.m4);
        f.rays.setColorAt(n, this.col.copy(k < 0.3 ? PALE : k < 0.65 ? LIGHT : GOLD));
        n++;
      }
    }
    f.rays.count = n;
    f.rays.instanceMatrix.needsUpdate = true;
    if (f.rays.instanceColor) f.rays.instanceColor.needsUpdate = true;

    // ---- cubes of light thrown out at the start, and rising all the way up ----
    if (!f.burst) {
      f.burst = true;
      for (let i = 0; i < (this.first ? 36 : 10); i++) this.spark(f.last.x, f.last.y, f.last.z, true, true);
    }
    if (t < 2.1) {
      f.emit += step * (this.first ? 45 : 10);
      while (f.emit >= 1) {
        f.emit -= 1;
        this.spark(f.last.x, f.last.y, f.last.z, t < 0.5);
      }
    }
  }

  clear(): void {
    for (const f of this.bursts) {
      this.group.remove(f.group);
      for (const m of [f.walls, f.core, f.floor, f.rings, f.rays]) {
        (m.material as THREE.Material).dispose();
        m.dispose();
      }
    }
    this.bursts.length = 0;
    this.sparks.length = 0;
  }

  dispose(): void {
    this.clear();
    this.cube.dispose();
    (this.sparkMesh.material as THREE.Material).dispose();
    this.sparkMesh.dispose();
  }
}

/**
 * The banner of a level gained: the number in big gold letters at the top of the view, which swells in, holds and rises away.
 * (A plain element over the page, so it needs no setup.)
 */
export function showLevelBanner(level: number): void {
  const root = document.createElement('div');
  root.style.cssText =
    'position:fixed;left:0;right:0;top:15%;display:flex;flex-direction:column;align-items:center;pointer-events:none;z-index:60;font-family:Monocraft,"Courier New",monospace;text-align:center;opacity:0';
  const big = document.createElement('div');
  big.textContent = 'LEVEL UP!';
  big.style.cssText = 'font-size:46px;letter-spacing:4px;color:#ffd24a;text-shadow:0 0 18px #ff9a1a,0 0 6px #fff3b0,3px 3px 0 #5a2d00,-1px -1px 0 #5a2d00;';
  const small = document.createElement('div');
  small.textContent = `You have reached level ${level}`;
  small.style.cssText = 'margin-top:8px;font-size:20px;color:#fff0b8;text-shadow:2px 2px 0 #3a2000,0 0 10px #ff9a1a;';
  root.append(big, small);
  document.body.appendChild(root);
  const anim = root.animate(
    [
      { opacity: 0, transform: 'translateY(14px) scale(0.6)' },
      { opacity: 1, transform: 'translateY(0) scale(1.12)', offset: 0.12 },
      { opacity: 1, transform: 'translateY(0) scale(1)', offset: 0.22 },
      { opacity: 1, transform: 'translateY(0) scale(1)', offset: 0.72 },
      { opacity: 0, transform: 'translateY(-26px) scale(1)' },
    ],
    { duration: 3400, easing: 'ease-out', fill: 'forwards' },
  );
  anim.onfinish = () => root.remove();
}
