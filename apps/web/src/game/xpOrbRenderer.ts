import * as THREE from 'three';
import { xpOrbSize } from '@solrift/shared';
import type { XpOrbLike } from './clientSession';

const MAX = 256;
const MAX_SPARKS = 480;

/** The edge of the orb's cube at each of its eleven sizes (blocks): a drop of one point is a speck, a big one a chunky gem. */
const edgeOf = (size: number): number => 0.15 + size * 0.03;

/** Orbs this near the eye are being drawn in and shrink away; sparks mark the pickup. */
const ABSORB_NEAR = 3.4;
const PULL_REACH = 8.6;

interface Eye {
  x: number;
  y: number;
  z: number;
}

/** A soft round glow, white at the middle, for the halo behind each orb. */
function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.4)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The face of the voxel gem: a 4x4 grid of hard pixels, deep at the rim and white-hot in the middle, so that it reads as a lit
 * cube of the game's own pixel look. The colour pulse is applied on top of this as the instance colour.
 */
function faceTexture(): THREE.CanvasTexture {
  const N = 4;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  const px = [
    [150, 190, 190, 150],
    [190, 255, 255, 190],
    [190, 255, 255, 190],
    [150, 190, 190, 150],
  ];
  // A little unevenness so the faces are not all the same.
  px[0][2] = 215;
  px[2][0] = 215;
  px[3][1] = 170;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const v = px[y][x];
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, y, 1, 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

interface Spark {
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
 * Experience orbs, in the game's voxel style: small glowing cubes, pale green-yellow that pulses, tumbling about their upright axis
 * and bobbing a little as they lie about. Each has a soft halo behind it. They are fully bright whatever the hour, like a torch flame.
 *
 * Flying in to the player they leave a trail of tiny glowing cubes, shrink away as they enter the body and burst into sparks.
 */
export class XpOrbRenderer {
  readonly group = new THREE.Group();
  private readonly balls: THREE.InstancedMesh;
  private readonly halos: THREE.InstancedMesh;
  private readonly sparkMesh: THREE.InstancedMesh;
  private readonly face = faceTexture();
  private readonly glow = glowTexture();
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly qy = new THREE.Quaternion();
  private readonly qTilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.62, 0, 0.5));
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly col = new THREE.Color();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly sparks: Spark[] = [];
  private readonly last = new Map<number, { x: number; y: number; z: number; value: number; hue: number }>();
  private clock = performance.now();
  private eye: Eye = { x: 0, y: 0, z: 0 };

  constructor() {
    // A cube shaded by which way each face looks (light above), so that the tumble shows its facets.
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const shade = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const ny = nor.getY(i);
      const k = ny > 0.5 ? 1 : ny < -0.5 ? 0.62 : 0.8;
      shade[i * 3] = shade[i * 3 + 1] = shade[i * 3 + 2] = k;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(shade, 3));
    this.balls = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: this.face, vertexColors: true }), MAX);
    this.balls.frustumCulled = false;
    this.balls.count = 0;
    this.balls.setColorAt(0, this.col.setRGB(1, 1, 1));

    this.halos = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
      MAX,
    );
    this.halos.frustumCulled = false;
    this.halos.count = 0;
    this.halos.renderOrder = 4;
    this.halos.setColorAt(0, this.col.setRGB(1, 1, 1));

    this.sparkMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
      MAX_SPARKS,
    );
    this.sparkMesh.frustumCulled = false;
    this.sparkMesh.count = 0;
    this.sparkMesh.renderOrder = 5;
    this.sparkMesh.setColorAt(0, this.col.setRGB(1, 1, 1));
    this.group.add(this.balls, this.halos, this.sparkMesh);
  }

  /** The colour of the pulse at this moment: lime swinging to gold. */
  private pulse(f: number, out: THREE.Color): THREE.Color {
    const red = (Math.sin(f) + 1) * 0.5;
    const blue = (Math.sin(f + (4 * Math.PI) / 3) + 1) * 0.1;
    return out.setRGB(0.15 + 0.85 * red, 1, blue, THREE.SRGBColorSpace);
  }

  private spark(x: number, y: number, z: number, spread: number, up: number, size: number, life: number, hue: number): void {
    if (this.sparks.length >= MAX_SPARKS) this.sparks.shift();
    this.pulse(hue, this.col);
    // Pushed toward white so the sparks read as hot.
    this.sparks.push({
      x,
      y,
      z,
      vx: (Math.random() - 0.5) * spread,
      vy: (Math.random() - 0.3) * spread + up,
      vz: (Math.random() - 0.5) * spread,
      life,
      max: life,
      size,
      r: Math.min(1, this.col.r * 0.7 + 0.45),
      g: Math.min(1, this.col.g * 0.7 + 0.45),
      b: Math.min(1, this.col.b * 0.7 + 0.35),
    });
  }

  /**
   * Make the cubes match the session's orbs. `camera` turns the halos to face the eye; `eye` is where the player takes orbs in.
   */
  sync(orbs: readonly XpOrbLike[], camera: THREE.Camera, eye: Eye): void {
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - this.clock) / 1000));
    this.clock = now;
    this.eye = eye;

    const n = Math.min(MAX, orbs.length);
    this.balls.count = n;
    this.halos.count = n;
    const seen = new Set<number>();
    for (let i = 0; i < n; i++) {
      const o = orbs[i];
      seen.add(o.id);
      const size = xpOrbSize(o.value);
      // It swells out of nothing when it appears.
      const born = Math.min(1, o.age / 0.18);
      let edge = edgeOf(size) * (1 - (1 - born) * (1 - born));
      const f = o.age * 10 + o.phase * 3;

      // What is drawn follows what the session says a little behind it, so that the jumps between a server's updates (and a slow
      // frame) do not show as stutter while the orb flies fast.
      const prev = this.last.get(o.id);
      let sx = o.x;
      let sy = o.y;
      let sz = o.z;
      if (prev) {
        const gap = Math.hypot(o.x - prev.x, o.y - prev.y, o.z - prev.z);
        if (gap < 4) {
          const a = 1 - Math.exp(-dt * 38);
          sx = prev.x + (o.x - prev.x) * a;
          sy = prev.y + (o.y - prev.y) * a;
          sz = prev.z + (o.z - prev.z) * a;
        }
      }
      const dx = eye.x - sx;
      const dy = eye.y - 0.3 - sy;
      const dz = eye.z - sz;
      const d = Math.hypot(dx, dy, dz);
      // Close to the body it shrinks as it is taken in.
      if (d < ABSORB_NEAR) {
        const t = Math.max(0, (d - 0.35) / (ABSORB_NEAR - 0.35));
        edge *= 0.12 + 0.88 * t * t * (3 - 2 * t);
      }

      const moved = prev ? Math.hypot(sx - prev.x, sy - prev.y, sz - prev.z) : 0;
      // Flying in: a trail of tiny cubes left behind it.
      if (prev && moved > 0.004 && d < PULL_REACH && o.age > 0.4 && Math.random() < 0.7) {
        this.spark(sx, sy, sz, 0.5, 0.15, 0.04 + size * 0.005, 0.32 + Math.random() * 0.2, f);
      }
      this.last.set(o.id, { x: sx, y: sy, z: sz, value: o.value, hue: f });

      // It bobs only while it lies about.
      const bob = d < PULL_REACH ? 0 : 0.05 * Math.sin(o.age * 3.2 + o.phase);
      this.p.set(sx, sy + bob, sz);
      this.pulse(f, this.col);
      this.balls.setColorAt(i, this.col);

      this.qy.setFromAxisAngle(this.up, o.age * 2.6 + o.phase).multiply(this.qTilt);
      this.s.setScalar(edge);
      this.m4.compose(this.p, this.qy, this.s);
      this.balls.setMatrixAt(i, this.m4);

      // The halo: bigger for a bigger orb, breathing with the colour.
      const hr = (edge * 2.4 + 0.1) * (0.9 + 0.1 * Math.sin(f * 0.5));
      this.q.copy(camera.quaternion);
      this.s.setScalar(hr);
      this.m4.compose(this.p, this.q, this.s);
      this.halos.setMatrixAt(i, this.m4);
      this.halos.setColorAt(i, this.col);
    }
    this.balls.instanceMatrix.needsUpdate = true;
    this.halos.instanceMatrix.needsUpdate = true;
    if (this.balls.instanceColor) this.balls.instanceColor.needsUpdate = true;
    if (this.halos.instanceColor) this.halos.instanceColor.needsUpdate = true;

    // An orb that was close to the player and is gone has been taken: a burst of sparks where it went in.
    for (const [id, l] of this.last) {
      if (seen.has(id)) continue;
      this.last.delete(id);
      const d = Math.hypot(eye.x - l.x, eye.y - 0.3 - l.y, eye.z - l.z);
      if (d > 3) continue;
      const k = 6 + Math.min(8, xpOrbSize(l.value));
      for (let j = 0; j < k; j++) this.spark(l.x, l.y, l.z, 2.4, 0.9, 0.03 + Math.random() * 0.04, 0.28 + Math.random() * 0.22, l.hue + j);
    }

    this.stepSparks(dt);
  }

  private stepSparks(dt: number): void {
    let n = 0;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.sparks.splice(i, 1);
      }
    }
    for (const s of this.sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      s.vx *= 0.9;
      s.vz *= 0.9;
      s.vy = s.vy * 0.9 - 1.2 * dt;
      const k = s.life / s.max;
      this.p.set(s.x, s.y, s.z);
      this.q.identity();
      // Right at the eye a spark would be a huge white block on the screen: it thins out there.
      const near = Math.min(1, Math.max(0, (Math.hypot(s.x - this.eye.x, s.y - this.eye.y, s.z - this.eye.z) - 0.5) / 1.1));
      this.s.setScalar(s.size * (0.3 + 0.7 * k) * near);
      this.m4.compose(this.p, this.q, this.s);
      this.sparkMesh.setMatrixAt(n, this.m4);
      // Additive blending: fading to black is fading out.
      this.col.setRGB(s.r * k, s.g * k, s.b * k);
      this.sparkMesh.setColorAt(n, this.col);
      n++;
    }
    this.sparkMesh.count = n;
    this.sparkMesh.instanceMatrix.needsUpdate = true;
    if (this.sparkMesh.instanceColor) this.sparkMesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.balls.geometry.dispose();
    (this.balls.material as THREE.Material).dispose();
    this.halos.geometry.dispose();
    (this.halos.material as THREE.Material).dispose();
    this.sparkMesh.geometry.dispose();
    (this.sparkMesh.material as THREE.Material).dispose();
    this.face.dispose();
    this.glow.dispose();
    this.balls.dispose();
    this.halos.dispose();
    this.sparkMesh.dispose();
  }
}
