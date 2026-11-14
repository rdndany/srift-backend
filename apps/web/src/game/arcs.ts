import * as THREE from 'three';
import type { V3 } from './voxels';

/**
 * Lightning for a model: a small pool of bolts that flash into being between two points, crackle (the zigzag is thrown again
 * every few hundredths of a second) and die. Each bolt is a thin three-sided tube, so it shows from every side (a GL line is one
 * pixel wide and is lost against a bright sky), with a pale core inside a wider glow. The materials are plain colour that the light
 * does not touch: lightning shines in the dark. All of a set's bolts hang from one bone, so they follow it as it moves.
 */

/** Points along a bolt, and the sides of its tube. */
const POINTS = 12;
const SIDES = 3;
const VERTS = POINTS * SIDES;

export interface ArcOpts {
  /** How many bolts can be alight at once. */
  slots: number;
  /** How often an idle slot tries to strike, per second, at intensity 1. */
  rate: number;
  /** How long a bolt lives (seconds). */
  life: readonly [number, number];
  /** The radius of the glow around a bolt (the core is a little over a third of it). */
  radius: number;
  /** How far the zigzag strays from a straight line, as a fraction of the bolt's length. */
  jag: number;
  /** Chooses the two ends of a new bolt, in the parent bone's space. */
  pick: (from: THREE.Vector3, to: THREE.Vector3) => void;
}

const tmpDir = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const tmpN1 = new THREE.Vector3();
const tmpN2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);

class Bolt {
  readonly mesh: THREE.Mesh;
  readonly geo = new THREE.BufferGeometry();
  private readonly pos = new Float32Array(VERTS * 2 * 3);
  private readonly pts: THREE.Vector3[] = Array.from({ length: POINTS }, () => new THREE.Vector3());
  readonly from = new THREE.Vector3();
  readonly to = new THREE.Vector3();
  active = false;
  age = 0;
  life = 0;
  /** Time until the zigzag is thrown again. */
  redraw = 0;

  constructor(outer: THREE.Material, core: THREE.Material) {
    const attr = new THREE.BufferAttribute(this.pos, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', attr);
    const idx: number[] = [];
    for (const base of [0, VERTS])
      for (let i = 0; i < POINTS - 1; i++)
        for (let k = 0; k < SIDES; k++) {
          const a = base + i * SIDES + k;
          const b = base + i * SIDES + ((k + 1) % SIDES);
          const c = base + (i + 1) * SIDES + k;
          const d = base + (i + 1) * SIDES + ((k + 1) % SIDES);
          idx.push(a, b, c, b, d, c);
        }
    this.geo.setIndex(idx);
    const per = (POINTS - 1) * SIDES * 6;
    this.geo.addGroup(0, per, 0);
    this.geo.addGroup(per, per, 1);
    this.mesh = new THREE.Mesh(this.geo, [outer, core]);
    // The bolt moves about faster than its bounding sphere is kept up to date.
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** Throw the zigzag again between the two ends, `fade` (0..1) of full thickness. */
  reshape(radius: number, jag: number, fade: number): void {
    const { pts, pos } = this;
    tmpDir.subVectors(this.to, this.from);
    const len = tmpDir.length();
    tmpDir.multiplyScalar(1 / Math.max(1e-6, len));
    tmpU.crossVectors(tmpDir, Math.abs(tmpDir.y) < 0.9 ? UP : RIGHT).normalize();
    tmpV.crossVectors(tmpDir, tmpU);
    for (let i = 0; i < POINTS; i++) {
      const t = i / (POINTS - 1);
      // The ends stay where they are; the middle is thrown aside, most in the middle.
      const swing = Math.pow(Math.sin(Math.PI * t), 0.7) * len * jag;
      const ru = (Math.random() * 2 - 1) * swing;
      const rv = (Math.random() * 2 - 1) * swing;
      pts[i].copy(this.from).addScaledVector(tmpDir, len * t).addScaledVector(tmpU, ru).addScaledVector(tmpV, rv);
    }
    for (let i = 0; i < POINTS; i++) {
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(POINTS - 1, i + 1)];
      tmpDir.subVectors(next, prev).normalize();
      tmpN1.crossVectors(tmpDir, Math.abs(tmpDir.y) < 0.9 ? UP : RIGHT).normalize();
      tmpN2.crossVectors(tmpDir, tmpN1);
      // Thick in the middle and drawn to a point at both ends.
      const shape = Math.pow(Math.sin(Math.PI * (i / (POINTS - 1))), 0.6) * fade;
      for (let layer = 0; layer < 2; layer++) {
        const r = radius * shape * (layer === 0 ? 1 : 0.38);
        for (let k = 0; k < SIDES; k++) {
          const ang = (k / SIDES) * Math.PI * 2;
          const c = Math.cos(ang) * r;
          const s = Math.sin(ang) * r;
          const o = ((layer * POINTS + i) * SIDES + k) * 3;
          pos[o] = pts[i].x + tmpN1.x * c + tmpN2.x * s;
          pos[o + 1] = pts[i].y + tmpN1.y * c + tmpN2.y * s;
          pos[o + 2] = pts[i].z + tmpN1.z * c + tmpN2.z * s;
        }
      }
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}

const tmpMid = new THREE.Vector3();

/** 0 up to `a`, 1 from `b` on, smooth between. */
const ramp = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / Math.max(1e-6, b - a)));
  return t * t * (3 - 2 * t);
};

/** A pool of bolts hanging from one bone. */
export class ArcSet {
  readonly group = new THREE.Group();
  private readonly bolts: Bolt[] = [];
  /** Where the eye that looks at it is (world space), or null. Bolts that come close to it thin out and vanish (see `setView`). */
  private viewer: THREE.Vector3 | null = null;
  private near: readonly [number, number] = [0, 0];
  /** How thick the bolts are drawn, as a fraction of `radius`. */
  private thin = 1;

  constructor(
    parent: THREE.Object3D,
    private readonly outer: THREE.Material,
    private readonly core: THREE.Material,
    private readonly o: ArcOpts,
  ) {
    for (let i = 0; i < o.slots; i++) {
      const b = new Bolt(outer, core);
      this.bolts.push(b);
      this.group.add(b.mesh);
    }
    parent.add(this.group);
  }

  /**
   * How the lightning is seen. A bolt nearer than `near[0]` to the `viewer` is not drawn, one further than `near[1]` is drawn in
   * full, and in between it is thinner (so lightning does not slash across a lens it is right in front of, or across the view of
   * the rider it crackles round). `thin` draws every bolt thinner still. Pass a null viewer for no fading by distance.
   */
  setView(viewer: THREE.Vector3 | null, near: readonly [number, number] = [0, 0], thin = 1): void {
    this.viewer = viewer;
    this.near = near;
    this.thin = thin;
  }

  /** How much of its thickness a bolt keeps, by how near to the viewer any part of it is (0..1). */
  private seen(b: Bolt): number {
    if (!this.viewer || this.near[1] <= 0) return 1;
    const g = this.group;
    let d = Infinity;
    for (let i = 0; i < 3; i++) {
      if (i === 0) tmpMid.copy(b.from);
      else if (i === 1) tmpMid.copy(b.from).add(b.to).multiplyScalar(0.5);
      else tmpMid.copy(b.to);
      g.localToWorld(tmpMid);
      d = Math.min(d, tmpMid.distanceTo(this.viewer));
    }
    return ramp(this.near[0], this.near[1], d);
  }

  /** One frame. `intensity` is how busy the lightning is: 0 is none, 1 a steady crackle, more a storm. */
  update(dt: number, intensity: number): void {
    const o = this.o;
    for (const b of this.bolts) {
      if (!b.active) {
        if (intensity > 0.01 && Math.random() < o.rate * intensity * dt) {
          o.pick(b.from, b.to);
          b.active = true;
          b.age = 0;
          b.life = o.life[0] + Math.random() * (o.life[1] - o.life[0]);
          b.redraw = 0;
          b.mesh.visible = true;
        }
        continue;
      }
      b.age += dt;
      if (b.age >= b.life) {
        b.active = false;
        b.mesh.visible = false;
        continue;
      }
      b.redraw -= dt;
      if (b.redraw <= 0) {
        // It crackles: a new zigzag every 30 to 50 thousandths of a second, thinning as it dies.
        b.redraw = 0.03 + Math.random() * 0.02;
        const left = 1 - b.age / b.life;
        b.reshape(o.radius * this.thin, o.jag, (0.55 + 0.45 * Math.min(1, left * 2.5)) * this.seen(b));
      }
    }
  }

  dispose(): void {
    for (const b of this.bolts) b.geo.dispose();
    this.group.removeFromParent();
  }
}

/**
 * Where a set's bolts go, for anything with fixed points to strike between: from a point to another one between `minLink` and
 * `link` away (a bolt between two points a hand apart is only a scribble), or, now and then, from a point out into the air
 * (up to `reach` long).
 */
export function pickAmong(points: readonly V3[], link: number, reach: number, stray = 0.4, minLink = 0): ArcOpts['pick'] {
  const near = points.map((p, i) =>
    points.flatMap((q, j) => {
      const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      return j !== i && d >= minLink && d < link ? [j] : [];
    }),
  );
  return (from, to) => {
    const i = Math.floor(Math.random() * points.length);
    const p = points[i];
    from.set(p[0], p[1], p[2]);
    const friends = near[i];
    if (friends.length > 0 && Math.random() > stray) {
      const q = points[friends[Math.floor(Math.random() * friends.length)]];
      to.set(q[0], q[1], q[2]);
      return;
    }
    // Out into the air, leaning up (lightning leaps off the high points).
    const a = Math.random() * Math.PI * 2;
    const up = 0.2 + Math.random() * 0.8;
    const len = reach * (0.45 + Math.random() * 0.55);
    const h = Math.sqrt(1 - up * up * 0.5);
    to.set(p[0] + Math.cos(a) * h * len, p[1] + up * len, p[2] + Math.sin(a) * h * len);
  };
}
