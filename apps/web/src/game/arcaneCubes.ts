import * as THREE from 'three';
import type { Fx } from '@solrift/shared';
import type { Projectile, SpellView } from './fireFx';
import { clamp01, easeOut, type FxEntry, type SpellKit } from './spellFx';
import { Cubes, drawChunks, makeChunks, snap, steps, voxelMaterial, seeded } from './voxelFx';

/**
 * The bolts of the Mage's weapons, built of cubes (a white cube with a star of small ones blinking round it and some circling it, a
 * trail of cubes on the grid of the world that cool and shrink away in steps, sparks, the flash of leaving the weapon, and the pop
 * where it bursts: a shell of cubes flying out). One machine draws them all and a `BoltStyle` and a `HitStyle` say how each weapon's
 * looks: the wand's (wandFx.ts) is light and quick, the staff's (staffFx.ts) heavy and slow. The server decides when and where (the
 * bolt is a spell in flight, the burst a mark); this only draws them. The pieces shared with the Warrior's effects are in voxelFx.ts.
 */

/** How a weapon's bolt looks in flight. */
export interface BoltStyle {
  /** From white-hot to dark: the colours a cube cools through (six steps). */
  palette: readonly THREE.Color[];
  /** The sparks. */
  spark: readonly THREE.Color[];
  /** The size of the white cube in the middle (it jumps a little on every beat). */
  core: number;
  /** The star that blinks round it: the six faces (how far out, how big) and the eight corners. */
  face: { reach: number; size: number };
  corner: { reach: number; size: number };
  /** How many times a second the star changes between its two forms. */
  beat: number;
  /** The cubes circling the line of flight. */
  orbit: { count: number; radius: number; size: number; speed: number };
  /** The trail: a cube every `step` blocks, alternately `big` and `small`, each lasting `life` seconds, at most `max` at once; with `rise` the cubes drift up as they age, faster and faster (blocks a second at the end of their life), like flames: the ones just behind the head stay level with it, so from behind the head is never buried under its own trail. */
  trail: { step: number; big: number; small: number; life: number; max: number; rise?: number };
  /** The sparks: how many fall off for each block travelled, the most at once, how long each lasts and how big it is; with `lift` they are thrown up (blocks a second) and so rise before they fall. */
  sparks: { perBlock: number; max: number; life: [number, number]; size: [number, number]; lift?: number };
  /** The flash of leaving the weapon: a block of this size for this long, with a spoke of cubes out of each face. */
  flash: { size: number; life: number; spoke: number; reach: number };
  /** How many cubes are thrown out of the tip. */
  puffs: number;
}

/** How a weapon's bolt bursts. */
export interface HitStyle {
  palette: readonly THREE.Color[];
  spark: readonly THREE.Color[];
  /** A multiple of the size of the burst (on top of the mark's radius). */
  scale: number;
  /** How hard the screen is knocked (0..1). */
  shake: number;
  /** The cubes of the shell: the faces', the corners' and the edges' (0: no edges). */
  shell: { face: number; corner: number; edge: number };
  /** How many sparks are thrown out, and how many cubes float up. */
  sparks: number;
  motes: number;
  /** A second, larger shell that follows the first. */
  echo: boolean;
  /** A body of fire: this many cubes scattered through the blast, swelling out with it and shrinking away over `life` seconds. */
  blob?: { count: number; life: number };
  /** How fast the floating cubes rise, as a multiple (flames rise quickly). */
  moteRise?: number;
  /** Dark cubes that swell out of the middle after the blast and drift up: how many, their colours, and how long the biggest lasts (it is cut to what the mark has). */
  smoke?: { count: number; colors: readonly THREE.Color[]; life: number };
}

/** Where the six faces, the eight corners and the twelve edges of a cube point (the last two as unit vectors). */
const AXES: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
const unit = (x: number, y: number, z: number): readonly [number, number, number] => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l] as const;
};
const CORNERS = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => unit(x, y, z))));
const EDGES = [-1, 1].flatMap((a) => [-1, 1].flatMap((b) => [unit(a, b, 0), unit(a, 0, b), unit(0, a, b)]));

/** The grid the sparks sit on (a sixteenth of a block, as the small cubes of the world's effects). */
const FINE = 0.0625;
/** The trail's cubes sit on a coarser grid, so a line of them reads as steps. */
const TRAIL_GRID = 0.125;

/** The colour of a cube `k` (0..1) of the way through its life. */
const cool = (palette: readonly THREE.Color[], k: number): THREE.Color => palette[Math.min(palette.length - 1, Math.floor(clamp01(k) * palette.length))];

// ---- the bolt in flight ----------------------------------------------------------------------------------------------

/** The most cubes a bolt draws at once (head, trail, sparks and the flash it was born with). */
const BOLT_CAP = 260;

/** One cube of the trail, where it was left (in the world). */
interface Trace {
  x: number;
  y: number;
  z: number;
  born: number;
  size: number;
}

/** One spark thrown off the bolt. */
interface Spark {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  born: number;
  life: number;
  size: number;
  tone: number;
}

/** One cube thrown from the tip of the weapon as the bolt leaves. */
interface Puff {
  vx: number;
  vy: number;
  vz: number;
  size: number;
  life: number;
  tone: number;
}

/**
 * A bolt in flight. `material` is the cubes' (see `voxelMaterial`); it belongs to whoever draws the bolts, and is shared by all of them.
 * `dispose` frees what the bolt itself made.
 */
export class CubeBoltView implements SpellView {
  readonly group = new THREE.Group();
  private readonly cubes: Cubes;
  private age = 0;
  private lastX: number;
  private lastY: number;
  private lastZ: number;
  /** How far the bolt has gone since it left the last cube of the trail. */
  private carry = 0;
  private made = 0;
  private sparkAcc = 0;
  private readonly trail: Trace[] = [];
  private readonly sparks: Spark[] = [];
  /** What it was thrown from, and the cubes thrown out of the weapon's tip with it. */
  private readonly origin: THREE.Vector3;
  private readonly puffs: Puff[] = [];
  private readonly seed = Math.random() * 100;
  private readonly dir = new THREE.Vector3();
  private readonly u = new THREE.Vector3();
  private readonly v = new THREE.Vector3();

  constructor(
    kit: Pick<SpellKit, 'voxel' | 'viewer'>,
    material: THREE.Material,
    p: Projectile,
    private readonly style: BoltStyle,
  ) {
    this.cubes = new Cubes(kit, material, BOLT_CAP, this.group.position);
    this.group.add(this.cubes.mesh);
    // a bolt gives light, it casts no shadow (see `SunShadows.scan`: drawn into the map of figures it would build a shader in mid-game)
    this.cubes.mesh.userData.noShadow = true;
    this.lastX = p.x;
    this.lastY = p.y;
    this.lastZ = p.z;
    this.origin = new THREE.Vector3(p.x, p.y, p.z);
    const len = Math.hypot(p.vx, p.vy, p.vz) || 1;
    const rng = seeded(Math.floor(Math.random() * 1e9));
    // a cone of cubes out of the tip, mostly the way the bolt goes
    for (let i = 0; i < style.puffs; i++) {
      const sp = 1.6 + rng() * 4.4;
      this.puffs.push({
        vx: (p.vx / len) * sp + (rng() - 0.5) * 3,
        vy: (p.vy / len) * sp + (rng() - 0.5) * 3,
        vz: (p.vz / len) * sp + (rng() - 0.5) * 3,
        size: 0.05 + rng() * 0.06,
        life: 0.25 + rng() * 0.3,
        tone: Math.floor(rng() * style.spark.length),
      });
    }
    this.update(p, 0, 0);
  }

  update(p: Projectile, time: number, dt: number): void {
    this.age += dt;
    this.group.position.set(p.x, p.y, p.z);
    const len = Math.hypot(p.vx, p.vy, p.vz) || 1;
    this.dir.set(p.vx / len, p.vy / len, p.vz / len);

    // A slot handed to a different bolt (or a lag spike) jumps far: start the trail afresh rather than draw a line across.
    const dx = p.x - this.lastX;
    const dy = p.y - this.lastY;
    const dz = p.z - this.lastZ;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > 4) {
      this.lastX = p.x;
      this.lastY = p.y;
      this.lastZ = p.z;
      this.carry = 0;
    } else if (dt > 0 && dist > 0) {
      this.leave(dx, dy, dz, dist);
    }
    if (dt > 0) this.shed(p, dist < 4 ? dist : 0);
    this.lastX = p.x;
    this.lastY = p.y;
    this.lastZ = p.z;

    this.draw(p, time);
  }

  /** Lay the cubes of the trail along the way gone since the last frame, one every `step`, on the grid of the world. */
  private leave(dx: number, dy: number, dz: number, dist: number): void {
    const t = this.style.trail;
    this.carry += dist;
    while (this.carry >= t.step) {
      this.carry -= t.step;
      const k = clamp01(1 - this.carry / dist);
      const x = snap(this.lastX + dx * k, TRAIL_GRID);
      const y = snap(this.lastY + dy * k, TRAIL_GRID);
      const z = snap(this.lastZ + dz * k, TRAIL_GRID);
      const last = this.trail[this.trail.length - 1];
      if (last && last.x === x && last.y === y && last.z === z) continue;
      this.trail.push({ x, y, z, born: this.age, size: this.made++ % 2 ? t.small : t.big });
      if (this.trail.length > t.max) this.trail.shift();
    }
  }

  /** Sparks drop off the bolt as it goes and fall away. */
  private shed(p: Projectile, travelled: number): void {
    const s = this.style.sparks;
    this.sparkAcc += travelled * s.perBlock;
    const n = Math.floor(this.sparkAcc);
    this.sparkAcc -= n;
    for (let i = 0; i < n && this.sparks.length < s.max; i++) {
      const k = Math.random();
      this.sparks.push({
        x: this.lastX + (p.x - this.lastX) * k + (Math.random() - 0.5) * 0.2,
        y: this.lastY + (p.y - this.lastY) * k + (Math.random() - 0.5) * 0.2,
        z: this.lastZ + (p.z - this.lastZ) * k + (Math.random() - 0.5) * 0.2,
        vx: (Math.random() - 0.5) * 1.4,
        vy: Math.random() * 0.6 + (s.lift ?? 0),
        vz: (Math.random() - 0.5) * 1.4,
        born: this.age,
        life: s.life[0] + Math.random() * (s.life[1] - s.life[0]),
        size: s.size[0] + Math.random() * (s.size[1] - s.size[0]),
        tone: Math.floor(Math.random() * this.style.spark.length),
      });
    }
  }

  private draw(p: Projectile, time: number): void {
    const st = this.style;
    const pal = st.palette;
    const c = this.cubes;
    const at = this.group.position;
    c.reset();

    // the flash of leaving the weapon: a block and a spoke out of each face, in the place it was cast (the bolt leaves it behind)
    const ox = this.origin.x - at.x;
    const oy = this.origin.y - at.y;
    const oz = this.origin.z - at.z;
    if (this.age < st.flash.life) {
      const k = this.age / st.flash.life;
      const s = steps(1 - k, 3);
      const b = st.flash.size * s;
      c.put(ox, oy, oz, b, b, b, k < 0.5 ? pal[0] : pal[1]);
      const w = st.flash.spoke * s;
      for (const [ax, ay, az] of AXES) {
        const r = st.flash.spoke + st.flash.reach * easeOut(k);
        c.put(ox + ax * r, oy + ay * r, oz + az * r, w, w, w, pal[2]);
      }
    }
    // the cubes thrown out of the tip: they slow down at once and drop a little, and shrink away in steps
    for (const f of this.puffs) {
      const t = this.age;
      if (t >= f.life) continue;
      const slide = (1 - Math.exp(-3 * t)) / 3;
      const s = f.size * steps(1 - t / f.life, 3);
      c.put(ox + f.vx * slide, oy + f.vy * slide - 2 * t * t, oz + f.vz * slide, s, s, s, st.spark[f.tone]);
    }

    // the trail: the older, the smaller and the darker
    let w = 0;
    for (const t of this.trail) {
      const age = this.age - t.born;
      if (age >= st.trail.life) continue;
      this.trail[w++] = t;
      const k = age / st.trail.life;
      const s = t.size * steps(1 - k, 4);
      // the colour cools quickly (white only in the first moments), the cube shrinks over the whole life
      c.put(t.x - at.x, t.y + (st.trail.rise ?? 0) * age * k - at.y, t.z - at.z, s, s, s, cool(pal, Math.pow(k, 0.55)));
    }
    this.trail.length = w;

    // the sparks
    w = 0;
    for (const sp of this.sparks) {
      const t = this.age - sp.born;
      if (t >= sp.life) continue;
      this.sparks[w++] = sp;
      const s = sp.size * steps(1 - t / sp.life, 3);
      c.put(snap(sp.x + sp.vx * t, FINE) - at.x, snap(sp.y + sp.vy * t - 1.5 * t * t, FINE) - at.y, snap(sp.z + sp.vz * t, FINE) - at.z, s, s, s, st.spark[sp.tone]);
    }
    this.sparks.length = w;

    // the head: a white cube that jumps a little, with a star of small cubes blinking round it (the six faces, then the eight corners)
    const beat = Math.floor(time * st.beat) % 2;
    const core = st.core * (1 + 0.14 * beat);
    c.put(0, 0, 0, core, core, core, pal[0]);
    if (beat === 0) {
      for (const [ax, ay, az] of AXES) c.put(ax * st.face.reach, ay * st.face.reach, az * st.face.reach, st.face.size, st.face.size, st.face.size, pal[2]);
    } else {
      for (const [cx, cy, cz] of CORNERS) c.put(cx * st.corner.reach, cy * st.corner.reach, cz * st.corner.reach, st.corner.size, st.corner.size, st.corner.size, pal[3]);
    }
    // cubes circle the line of flight, evenly spread
    const up = Math.abs(this.dir.y) > 0.95 ? this.u.set(1, 0, 0) : this.u.set(0, 1, 0);
    this.v.crossVectors(this.dir, up).normalize();
    this.u.crossVectors(this.v, this.dir).normalize();
    const spin = time * st.orbit.speed + this.seed;
    for (let i = 0; i < st.orbit.count; i++) {
      const a = spin + (i * Math.PI * 2) / st.orbit.count;
      const ca = Math.cos(a) * st.orbit.radius;
      const sa = Math.sin(a) * st.orbit.radius;
      const x = this.u.x * ca + this.v.x * sa;
      const y = this.u.y * ca + this.v.y * sa;
      const z = this.u.z * ca + this.v.z * sa;
      c.put(snap(p.x + x, FINE) - at.x, snap(p.y + y, FINE) - at.y, snap(p.z + z, FINE) - at.z, st.orbit.size, st.orbit.size, st.orbit.size, pal[1]);
    }
    c.done();
  }

  dispose(): void {
    this.cubes.dispose();
  }
}

// ---- where it bursts -------------------------------------------------------------------------------------------------

/** The most cubes a burst draws at once. */
const HIT_CAP = 260;
const HIT_LIFE = 0.45;

/**
 * The pop of a bolt: a block of light with a cube out of each face, a shell of cubes (the faces and corners of a cube, and with a big
 * style its edges) that flies out and shrinks away cooling from white, a smaller shell behind it, sparks thrown out and falling, and a
 * few cubes that float up. The burst has no direction (the bolt may have hit a wall, the ground or a creature), so it is round like a
 * cube is: the same from everywhere.
 */
export function buildCubeHit(f: Fx, e: FxEntry, kit: SpellKit, st: HitStyle): FxEntry {
  const size = Math.min(2, Math.max(0.8, f.r / 0.8)) * st.scale;
  if (f.age < 0.25) kit.impact(f.x, f.y, f.z, st.shake);
  const rng = seeded(f.id * 2654435 + 29);
  const cubes = new Cubes(kit, voxelMaterial(e), HIT_CAP, e.group.position);
  e.group.add(cubes.mesh);
  e.dispose = () => cubes.dispose();
  const pal = st.palette;

  // thrown out of the middle and falling (there is no ground to land on: the floor is far below)
  const sparks = makeChunks(rng, { count: st.sparks, radius: 0.12 * st.scale, speed: [1.2 * size, 4.2 * size], up: [0.6, 4], size: [0.05, 0.1], life: [0.35, 0.6], colors: st.spark, y0: 3, floor: -3 });
  // floating up and shrinking
  const motes = Array.from({ length: st.motes }, () => ({
    x: (rng() - 0.5) * 0.7 * size,
    z: (rng() - 0.5) * 0.7 * size,
    y: (rng() - 0.3) * 0.3,
    rise: (0.5 + rng() * 0.7) * (st.moteRise ?? 1),
    delay: 0.03 + rng() * 0.05,
    life: 0.25 + rng() * 0.2,
    size: 0.07 + rng() * 0.04,
    tone: 1 + Math.floor(rng() * 3),
  }));
  // the smoke: grey-brown cubes that start inside the blast, swell and drift up and out
  const smoke = Array.from({ length: st.smoke?.count ?? 0 }, () => ({
    x: (rng() - 0.5) * 1.1 * size,
    y: (rng() - 0.4) * 0.8 * size,
    z: (rng() - 0.5) * 1.1 * size,
    dx: (rng() - 0.5) * 0.9,
    dz: (rng() - 0.5) * 0.9,
    rise: 0.5 + rng() * 0.7,
    delay: 0.1 + rng() * 0.2,
    size: (0.13 + rng() * 0.14) * Math.sqrt(st.scale),
    tone: Math.floor(rng() * (st.smoke?.colors.length ?? 1)),
  }));
  // the body of fire: points scattered through a ball, so the blast has a middle and not only a shell
  const blob = Array.from({ length: st.blob?.count ?? 0 }, () => {
    let x: number, y: number, z: number;
    do {
      x = rng() * 2 - 1;
      y = rng() * 2 - 1;
      z = rng() * 2 - 1;
    } while (x * x + y * y + z * z > 1);
    return { x, y, z, size: 0.2 + rng() * 0.26, life: (st.blob?.life ?? 0) * (0.6 + 0.4 * rng()), heat: rng() };
  });
  const smokeLife = Math.max(0.2, Math.min(st.smoke?.life ?? 0, e.ttl - 0.35));

  e.animate = (_t, age) => {
    cubes.reset();
    if (age < 0.14) {
      const k = age / 0.14;
      const s = steps(1 - k, 3);
      const b = 0.5 * size * s;
      cubes.put(0, 0, 0, b, b, b, k < 0.5 ? pal[0] : pal[1]);
      const reach = (0.15 + 0.7 * easeOut(k)) * size;
      const w = 0.16 * s * st.scale;
      for (const [ax, ay, az] of AXES) cubes.put(ax * reach, ay * reach, az * reach, w, w, w, pal[2]);
    }
    // the shell: faces first, corners a touch behind them, edges behind those
    if (age < HIT_LIFE) {
      const k = age / HIT_LIFE;
      const reach = (0.2 + 0.85 * easeOut(k)) * size;
      const s = st.shell.face * steps(1 - k, 4);
      for (const [ax, ay, az] of AXES) cubes.put(snap(ax * reach, FINE), snap(ay * reach, FINE), snap(az * reach, FINE), s, s, s, cool(pal, k));
      const kc = clamp01((age - 0.03) / HIT_LIFE);
      const rc = (0.2 + 0.85 * easeOut(kc)) * size * 1.3;
      const sc = st.shell.corner * steps(1 - kc, 4);
      for (const [cx, cy, cz] of CORNERS) cubes.put(snap(cx * rc, FINE), snap(cy * rc, FINE), snap(cz * rc, FINE), sc, sc, sc, cool(pal, kc));
      if (st.shell.edge > 0) {
        const ke = clamp01((age - 0.06) / HIT_LIFE);
        const re = (0.2 + 0.85 * easeOut(ke)) * size * 1.15;
        const se = st.shell.edge * steps(1 - ke, 4);
        for (const [ex, ey, ez] of EDGES) cubes.put(snap(ex * re, FINE), snap(ey * re, FINE), snap(ez * re, FINE), se, se, se, cool(pal, ke));
      }
    }
    const ki = clamp01((age - 0.07) / 0.35);
    if (age > 0.07 && ki < 1) {
      const ri = (0.1 + 0.5 * easeOut(ki)) * size;
      const si = 0.14 * steps(1 - ki, 3) * st.scale;
      for (const [ax, ay, az] of AXES) cubes.put(ax * ri, ay * ri, az * ri, si, si, si, cool(pal, ki + 0.25));
    }
    // the echo: a second, wider shell of the faces and corners that follows after a moment
    const ke2 = clamp01((age - 0.12) / 0.38);
    if (st.echo && age > 0.12 && ke2 < 1) {
      const r2 = (0.3 + 1.1 * easeOut(ke2)) * size;
      const s2 = 0.15 * steps(1 - ke2, 4);
      for (const [cx, cy, cz] of CORNERS) cubes.put(snap(cx * r2, FINE), snap(cy * r2, FINE), snap(cz * r2, FINE), s2, s2, s2, cool(pal, ke2 + 0.2));
    }
    drawChunks(cubes, sparks, age);
    for (const b of blob) {
      if (age >= b.life) continue;
      const k = age / b.life;
      const out = (0.3 + 0.7 * easeOut(Math.min(1, age / 0.22))) * 0.85 * size;
      const s = b.size * Math.sqrt(st.scale) * steps(1 - k, 4);
      cubes.put(snap(b.x * out, FINE), snap(b.y * out + 0.5 * age, FINE), snap(b.z * out, FINE), s, s, s, cool(pal, clamp01(k * 0.75 + b.heat * 0.3)));
    }
    for (const m of motes) {
      const t = age - m.delay;
      if (t <= 0 || t >= m.life) continue;
      const s = m.size * steps(1 - t / m.life, 3);
      cubes.put(snap(m.x, FINE), snap(m.y + m.rise * t, FINE), snap(m.z, FINE), s, s, s, pal[m.tone]);
    }
    if (st.smoke) {
      for (const m of smoke) {
        const t = age - m.delay;
        const life = smokeLife - m.delay * 0.5;
        if (t <= 0 || t >= life) continue;
        const k = t / life;
        // it swells while it is young and shrinks away in steps at the end
        const s = m.size * (0.6 + 0.8 * easeOut(Math.min(1, t / 0.25))) * steps(1 - k * k * k, 4);
        cubes.put(snap(m.x + m.dx * t, FINE), snap(m.y + m.rise * t, FINE), snap(m.z + m.dz * t, FINE), s, s, s, st.smoke.colors[m.tone]);
      }
    }
    cubes.done();
  };
  return e;
}
