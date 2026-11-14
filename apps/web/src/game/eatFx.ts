import * as THREE from 'three';

const MAX = 160;

interface Crumb {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  r: number;
  g: number;
  b: number;
}

/**
 * The crumbs that fall from the mouth while something is eaten: small cubes in the colours of the food, flung out a little and pulled
 * down, each one a pixel of the item's own picture.
 */
export class EatFx {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly crumbs: Crumb[] = [];
  private readonly m4 = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly col = new THREE.Color();

  constructor() {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ fog: false }), MAX);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, this.col.setRGB(1, 1, 1));
    this.group.add(this.mesh);
  }

  /** Let `n` crumbs fall from a point; `colors` are sRGB values (0xRRGGBB) of the food, each crumb takes one of them. `fx, fz` is the way the face looks. */
  burst(x: number, y: number, z: number, fx: number, fz: number, colors: readonly number[], n: number): void {
    if (colors.length === 0) return;
    for (let i = 0; i < n; i++) {
      if (this.crumbs.length >= MAX) this.crumbs.shift();
      this.col.setHex(colors[Math.floor(Math.random() * colors.length)], THREE.SRGBColorSpace);
      const out = 0.2 + Math.random() * 0.6;
      this.crumbs.push({
        x: x + (Math.random() - 0.5) * 0.06,
        y: y + (Math.random() - 0.5) * 0.03,
        z: z + (Math.random() - 0.5) * 0.06,
        vx: fx * out + (Math.random() - 0.5) * 0.7,
        vy: 0.3 + Math.random() * 0.8,
        vz: fz * out + (Math.random() - 0.5) * 0.7,
        life: 0.55 + Math.random() * 0.35,
        max: 0.9,
        size: 0.016 + Math.random() * 0.022,
        r: this.col.r,
        g: this.col.g,
        b: this.col.b,
      });
    }
  }

  update(dt: number): void {
    const step = Math.min(dt, 0.05);
    for (let i = this.crumbs.length - 1; i >= 0; i--) {
      const c = this.crumbs[i];
      c.life -= step;
      if (c.life <= 0) this.crumbs.splice(i, 1);
    }
    let n = 0;
    for (const c of this.crumbs) {
      c.vy -= 9 * step;
      c.x += c.vx * step;
      c.y += c.vy * step;
      c.z += c.vz * step;
      const k = Math.min(1, c.life / 0.25);
      this.p.set(c.x, c.y, c.z);
      this.s.setScalar(c.size * (0.4 + 0.6 * k));
      this.m4.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(n, this.m4);
      this.col.setRGB(c.r, c.g, c.b);
      this.mesh.setColorAt(n, this.col);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
