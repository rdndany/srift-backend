import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RGB, V3 } from './voxels';

/**
 * The smooth half of the sculpting kit (the other half, `voxels.ts`, pours tiny cubes): ellipsoids, rods bent along a curve
 * (horns, claws, blades, spikes, the tail) and rings (the gold edging of a plate). Their light is baked into the vertex colours,
 * with a glint for metal, so they sit beside the cubes in the same material.
 */

/** A colour, or one chosen for each bit of surface from where it is and which way it faces. */
export type Coat = RGB | ((p: V3, n: V3) => RGB);

export interface SmoothOpts {
  /** The surface glows (it is meshed apart, to be drawn without the light). */
  glow?: boolean;
  /** How much of a metal glint it has (0..1). */
  shine?: number;
  /** Turned about x, y and z (radians, z applied first). */
  rot?: V3;
}

/** Where the light comes from, for the shading baked into the colours. */
const SUN = new THREE.Vector3(0.36, 0.84, 0.4).normalize();
const HALF = new THREE.Vector3().copy(SUN).add(new THREE.Vector3(0, 0.25, 1)).normalize();

const lin = (c: RGB): [number, number, number] => {
  const col = new THREE.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
  return [col.r, col.g, col.b];
};

export class Smooth {
  private readonly lit = { pos: [] as number[], col: [] as number[], idx: [] as number[] };
  private readonly glowing = { pos: [] as number[], col: [] as number[], idx: [] as number[] };

  get count(): number {
    return this.lit.idx.length / 3 + this.glowing.idx.length / 3;
  }

  /** Bake the light into a finished piece of surface and keep it. */
  private keep(geo: THREE.BufferGeometry, coat: Coat, o: SmoothOpts): void {
    this.faceOut(geo);
    geo.computeVertexNormals();
    const pos = geo.getAttribute('position');
    const nor = geo.getAttribute('normal');
    const into = o.glow ? this.glowing : this.lit;
    const base = into.pos.length / 3;
    const n = new THREE.Vector3();
    const cache = new Map<string, [number, number, number]>();
    for (let i = 0; i < pos.count; i++) {
      n.set(nor.getX(i), nor.getY(i), nor.getZ(i));
      const p: V3 = [pos.getX(i), pos.getY(i), pos.getZ(i)];
      const rgb = typeof coat === 'function' ? coat(p, [n.x, n.y, n.z]) : coat;
      const ck = rgb.join();
      let l = cache.get(ck);
      if (!l) {
        l = lin(rgb);
        cache.set(ck, l);
      }
      let k = 1;
      let glint = 0;
      if (!o.glow) {
        const d = n.dot(SUN);
        // A little ambient from above and a darker underside: the sky, and the ground it stands on.
        k = 0.5 + 0.5 * Math.pow(Math.max(0, d * 0.5 + 0.5), 1.4) - 0.1 * Math.max(0, -n.y);
        glint = (o.shine ?? 0) * 0.45 * Math.pow(Math.max(0, n.dot(HALF)), 18);
      }
      into.pos.push(p[0], p[1], p[2]);
      into.col.push(Math.min(1, l[0] * k + glint), Math.min(1, l[1] * k + glint), Math.min(1, l[2] * k + glint));
    }
    const index = geo.getIndex();
    if (index) for (let i = 0; i < index.count; i++) into.idx.push(base + index.getX(i));
    else for (let i = 0; i < pos.count; i++) into.idx.push(base + i);
    geo.dispose();
  }

  /** Make the triangles of a closed surface face outwards (the divergence theorem: the sum of normal . position is three times the volume, positive when they do). */
  private faceOut(geo: THREE.BufferGeometry): void {
    const pos = geo.getAttribute('position');
    const index = geo.getIndex();
    if (!index) return;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    let sum = 0;
    for (let i = 0; i < index.count; i += 3) {
      a.fromBufferAttribute(pos, index.getX(i));
      b.fromBufferAttribute(pos, index.getX(i + 1));
      c.fromBufferAttribute(pos, index.getX(i + 2));
      sum += a.dot(b.clone().sub(a).cross(c.clone().sub(a)));
    }
    if (sum >= 0) return;
    for (let i = 0; i < index.count; i += 3) {
      const x = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, x);
    }
  }

  private matrix(at: V3, rot: V3 | undefined, scale: V3 = [1, 1, 1]): THREE.Matrix4 {
    const q = new THREE.Quaternion();
    if (rot) q.setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'ZYX'));
    return new THREE.Matrix4().compose(new THREE.Vector3(at[0], at[1], at[2]), q, new THREE.Vector3(scale[0], scale[1], scale[2]));
  }

  /** An ellipsoid of radii `r` around `c`. */
  ellipsoid(c: V3, r: V3, coat: Coat, o: SmoothOpts & { segs?: readonly [number, number] } = {}): this {
    const [lon, lat] = o.segs ?? [16, 11];
    let g: THREE.BufferGeometry = new THREE.SphereGeometry(1, lon, lat);
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    g = mergeVertices(g, 1e-4);
    g.applyMatrix4(this.matrix(c, o.rot, r));
    this.keep(g, coat, o);
    return this;
  }

  /**
   * A rod along a curve through `points` (a smooth spline), `radii` thick at each of them (0 ends in a point). `ref` is the
   * way the rod's cross-section is squeezed by `thin` (< 1: a blade, flat across `ref`).
   */
  tube(points: readonly V3[], radii: readonly number[], coat: Coat, o: SmoothOpts & { sides?: number; samples?: number; ref?: V3; thin?: number } = {}): this {
    const sides = o.sides ?? 9;
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
      false,
      'centripetal',
    );
    const steps = Math.max(2, (points.length - 1) * (o.samples ?? 5));
    const thin = o.thin ?? 1;
    const ref = new THREE.Vector3(...(o.ref ?? [1, 0, 0]));
    const ringCount = steps + 1;
    const pos: number[] = [];
    const idx: number[] = [];
    let n1 = new THREE.Vector3();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const c = curve.getPoint(t);
      const tan = curve.getTangent(t).normalize();
      if (i === 0) n1.copy(ref).addScaledVector(tan, -ref.dot(tan));
      else n1.addScaledVector(tan, -n1.dot(tan));
      if (n1.lengthSq() < 1e-8) n1.set(0, 1, 0).addScaledVector(tan, -tan.y);
      n1.normalize();
      const n2 = new THREE.Vector3().crossVectors(tan, n1);
      const f = t * (radii.length - 1);
      const k = Math.min(radii.length - 2, Math.floor(f));
      const r = radii.length === 1 ? radii[0] : radii[k] + (radii[k + 1] - radii[k]) * (f - k);
      for (let s = 0; s < sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        pos.push(c.x + n1.x * ca * r * thin + n2.x * sa * r, c.y + n1.y * ca * r * thin + n2.y * sa * r, c.z + n1.z * ca * r * thin + n2.z * sa * r);
      }
    }
    for (let i = 0; i < ringCount - 1; i++)
      for (let s = 0; s < sides; s++) {
        const a = i * sides + s;
        const b = i * sides + ((s + 1) % sides);
        const c = (i + 1) * sides + s;
        const d = (i + 1) * sides + ((s + 1) % sides);
        idx.push(a, b, c, b, d, c);
      }
    // Cap the ends with a point on the axis.
    for (const end of [0, steps]) {
      const c = curve.getPoint(end / steps);
      const ci = pos.length / 3;
      pos.push(c.x, c.y, c.z);
      for (let s = 0; s < sides; s++) {
        const a = end * sides + s;
        const b = end * sides + ((s + 1) % sides);
        if (end === 0) idx.push(ci, b, a);
        else idx.push(ci, a, b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    this.keep(g, coat, o);
    return this;
  }

  /** A ring (a rod bent into a loop) of radii `rx` and `rz` in the local xz plane around `c`: the gold edge of a plate. */
  ring(c: V3, rx: number, rz: number, thick: number, coat: Coat, o: SmoothOpts & { sides?: number; segs?: number; arc?: readonly [number, number] } = {}): this {
    const segs = o.segs ?? 28;
    const sides = o.sides ?? 6;
    const [a0, a1] = o.arc ?? [0, Math.PI * 2];
    const full = a1 - a0 >= Math.PI * 2 - 1e-6;
    const rings = full ? segs : segs + 1;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < rings; i++) {
      const a = a0 + ((a1 - a0) * i) / segs;
      const cx = Math.cos(a) * rx;
      const cz = Math.sin(a) * rz;
      // The ring's local frame: radial (out of the plate's middle) and up.
      const radial = new THREE.Vector3(Math.cos(a) / rx, 0, Math.sin(a) / rz).normalize();
      for (let s = 0; s < sides; s++) {
        const b = (s / sides) * Math.PI * 2;
        const rr = Math.cos(b) * thick;
        const yy = Math.sin(b) * thick;
        pos.push(cx + radial.x * rr, yy, cz + radial.z * rr);
      }
    }
    for (let i = 0; i < (full ? rings : rings - 1); i++)
      for (let s = 0; s < sides; s++) {
        const a = i * sides + s;
        const b = i * sides + ((s + 1) % sides);
        const nx = ((i + 1) % rings) * sides;
        const c2 = nx + s;
        const d = nx + ((s + 1) % sides);
        idx.push(a, c2, b, b, c2, d);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.applyMatrix4(this.matrix(c, o.rot));
    this.keep(g, coat, o);
    return this;
  }

  /** The surface (`glow`: the part that glows) as geometry; null when there is none. */
  build(glow: boolean): THREE.BufferGeometry | null {
    const d = glow ? this.glowing : this.lit;
    if (d.idx.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(d.col, 3));
    g.setIndex(d.idx);
    g.computeBoundingSphere();
    return g;
  }
}
