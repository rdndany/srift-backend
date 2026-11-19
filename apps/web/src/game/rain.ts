import * as THREE from 'three';

const COUNT = 2200;
const RADIUS = 14;
const STREAK = 0.9;

/**
 * Rain streaks around the camera. Every drop remembers the height of the first roof above its
 * column, so rain stops at ceilings: it falls outdoors but not inside a house or cave.
 */
export class Rain {
  readonly object: THREE.LineSegments;
  private readonly pos = new Float32Array(COUNT * 6);
  private readonly x = new Float32Array(COUNT);
  private readonly y = new Float32Array(COUNT);
  private readonly z = new Float32Array(COUNT);
  private readonly top = new Float32Array(COUNT);
  private readonly speed = new Float32Array(COUNT);
  private readonly mat: THREE.LineBasicMaterial;
  /** 0 rain .. 1 snow: flakes fall slowly, drift and are short, pale and a little denser. */
  private flake = 0;
  private readonly attr: THREE.BufferAttribute;
  private seeded = false;

  constructor(private readonly roofY: (x: number, z: number) => number) {
    const geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.attr);
    this.mat = new THREE.LineBasicMaterial({ color: 0xb4ccff, transparent: true, opacity: 0.5, fog: false, depthWrite: false });
    this.object = new THREE.LineSegments(geo, this.mat);
    this.object.frustumCulled = false;
    this.object.renderOrder = 5;
    this.object.visible = false;
  }

  private respawn(i: number, cx: number, cy: number, cz: number, anywhere: boolean): void {
    this.x[i] = cx + (Math.random() * 2 - 1) * RADIUS;
    this.z[i] = cz + (Math.random() * 2 - 1) * RADIUS;
    this.top[i] = this.roofY(Math.floor(this.x[i]), Math.floor(this.z[i])) + 1;
    this.y[i] = anywhere ? cy - 8 + Math.random() * 28 : cy + 14 + Math.random() * 6;
    this.speed[i] = 17 + Math.random() * 6;
  }

  /** `amount` is the 0..1 rain intensity. Skipped entirely (hidden) when it is dry. */
  update(dt: number, amount: number, cam: THREE.Vector3, snow = false): void {
    this.object.visible = amount > 0.02;
    if (!this.object.visible) return;
    this.flake += ((snow ? 1 : 0) - this.flake) * Math.min(1, dt * 1.5);
    this.mat.color.setRGB(0.71 + 0.29 * this.flake, 0.8 + 0.2 * this.flake, 1);
    this.mat.opacity = (0.18 + 0.4 * amount) * (1 + 0.35 * this.flake);
    if (!this.seeded) {
      for (let i = 0; i < COUNT; i++) this.respawn(i, cam.x, cam.y, cam.z, true);
      this.seeded = true;
    }
    const live = Math.floor(COUNT * amount);
    const p = this.pos;
    for (let i = 0; i < COUNT; i++) {
      let y = this.y[i] - this.speed[i] * (1 - 0.88 * this.flake) * dt;
      const far = Math.abs(this.x[i] - cam.x) > RADIUS || Math.abs(this.z[i] - cam.z) > RADIUS;
      if (y < this.top[i] || y < cam.y - 10 || far) {
        this.respawn(i, cam.x, cam.y, cam.z, far);
        y = this.y[i];
      }
      this.y[i] = y;
      const o = i * 6;
      // Only drops above their roof are drawn; the rest (and the surplus when it is drizzling) collapse to a point.
      const shown = i < live && y > this.top[i];
      const len = shown ? STREAK * (1 - 0.82 * this.flake) : 0;
      p[o] = this.x[i];
      p[o + 1] = y;
      p[o + 2] = this.z[i];
      // Flakes sway as they fall.
      const sway = this.flake * Math.sin(y * 0.9 + i) * 0.35;
      p[o] = this.x[i] + sway;
      p[o + 3] = this.x[i] + sway - len * 0.08;
      p[o + 4] = y + len;
      p[o + 5] = this.z[i];
    }
    this.attr.needsUpdate = true;
  }

  /** Debug/test: how many drawn streaks lie in a box (used to prove roofs stop rain). */
  countVisible(x0: number, x1: number, z0: number, z1: number, maxY: number): number {
    let n = 0;
    for (let i = 0; i < COUNT; i++) {
      const visible = this.pos[i * 6 + 4] !== this.pos[i * 6 + 1];
      if (visible && this.x[i] >= x0 && this.x[i] <= x1 && this.z[i] >= z0 && this.z[i] <= z1 && this.y[i] <= maxY) n++;
    }
    return n;
  }

  dispose(): void {
    this.object.geometry.dispose();
    this.mat.dispose();
  }
}
