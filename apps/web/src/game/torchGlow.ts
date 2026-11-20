import * as THREE from 'three';
import { B, isLantern, lanternInfo } from '@solrift/shared';

/**
 * A warm halo around the lanterns nearest the player (a bare torch has none). A fixed pool of additive sprites (never more than 24), re-aimed a
 * couple of times a second from a small scan of the blocks around the camera, so the cost does not grow with how many
 * torches there are in the world. The ground's own torch light comes from the baked block light; this is the glow in the air.
 */
const MAX = 24;
const RANGE_XZ = 18;
const RANGE_Y = 8;
const SCAN_EVERY = 0.8;
const FADE_NEAR = 12;
const FADE_FAR = 22;

interface Spot {
  x: number;
  y: number;
  z: number;
  d: number;
  /** A soul lantern: blue rather than orange. */
  soul: boolean;
  /** A lantern: its cage is seen, so the bloom sits behind it and is smaller and thinner than a bare flame's. */
  cage: boolean;
}

function glowTexture(soul = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  // A bloom: a white-hot core that melts into a bright yellow glow (cool white into blue for a soul flame), round and soft at the edge.
  const stops: [number, string][] = soul
    ? [
        [0, 'rgba(245,255,255,1)'],
        [0.1, 'rgba(215,248,255,0.96)'],
        [0.26, 'rgba(120,210,255,0.62)'],
        [0.5, 'rgba(50,140,255,0.2)'],
        [0.75, 'rgba(30,100,255,0.05)'],
        [1, 'rgba(20,80,255,0)'],
      ]
    : [
        [0, 'rgba(255,255,236,1)'],
        [0.1, 'rgba(255,248,196,0.96)'],
        [0.26, 'rgba(255,222,110,0.62)'],
        [0.5, 'rgba(255,180,50,0.2)'],
        [0.75, 'rgba(255,150,20,0.05)'],
        [1, 'rgba(255,130,0,0)'],
      ];
  for (const [at, col] of stops) grad.addColorStop(at, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class TorchGlow {
  readonly group = new THREE.Group();
  private readonly sprites: THREE.Sprite[] = [];
  private readonly texture = glowTexture();
  private readonly soulTexture = glowTexture(true);
  private spots: Spot[] = [];
  /** The spots that get a halo: only the lanterns (a bare torch has none; its light is the ground's own and the block draws the flame). */
  private halos: Spot[] = [];
  /** The nearest soul lanterns, whether or not they made the pool of halos. */
  private souls: Spot[] = [];
  private scanTimer = 0;
  private lastX = NaN;
  private lastY = NaN;
  private lastZ = NaN;

  constructor() {
    this.group.renderOrder = 4;
    for (let i = 0; i < MAX; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.texture,
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      });
      const s = new THREE.Sprite(mat);
      s.visible = false;
      s.renderOrder = 4;
      this.group.add(s);
      this.sprites.push(s);
    }
  }

  /** `brightness` is the daylight level (0..1): the halos are subtle in sun and strong in the dark. */
  update(dt: number, eye: THREE.Vector3, getBlock: (x: number, y: number, z: number) => number, brightness: number, time: number, enabled: boolean): void {
    if (!enabled) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    this.scanTimer -= dt;
    const moved = Math.abs(eye.x - this.lastX) > 3 || Math.abs(eye.z - this.lastZ) > 3 || Math.abs(eye.y - this.lastY) > 3;
    if (this.scanTimer <= 0 || moved) {
      this.scanTimer = SCAN_EVERY;
      this.lastX = eye.x;
      this.lastZ = eye.z;
      this.lastY = eye.y;
      this.scan(eye, getBlock);
    }
    // The bloom is seen by day too (a flame is bright against the sun), only less so.
    const strength = 0.5 + 0.5 * (1 - Math.min(1, brightness * 1.1));
    for (let i = 0; i < MAX; i++) {
      const s = this.sprites[i];
      const spot = this.halos[i];
      if (!spot) {
        s.visible = false;
        continue;
      }
      const dx = spot.x - eye.x;
      const dy = spot.y - eye.y;
      const dz = spot.z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      const fade = 1 - Math.min(1, Math.max(0, (d - FADE_NEAR) / (FADE_FAR - FADE_NEAR)));
      // Close up the halo shrinks away so it never smothers the flame you are looking at.
      const near = 0.45 + 0.55 * Math.min(1, Math.max(0, (d - 0.8) / 2.2));
      const flick = 1 + 0.08 * Math.sin(time * 9 + spot.x * 1.7 + spot.z * 2.3) + 0.05 * Math.sin(time * 15.3 + spot.y * 3.1);
      const mat = s.material as THREE.SpriteMaterial;
      mat.map = spot.soul ? this.soulTexture : this.texture;
      mat.opacity = Math.min(1, strength * fade * near * (spot.cage ? 0.55 : 1.1) * flick);
      s.visible = mat.opacity > 0.01;
      // A bare flame's bloom is pulled a little toward the eye (so the torch's own stick does not cut it off). A lantern's is put behind
      // its cage instead, so the cage keeps its colours from every side and the light shines out through the windows.
      const pull = d > 0.9 ? (spot.cage ? -0.3 : 0.32) / d : 0;
      s.position.set(spot.x - dx * pull, spot.y - dy * pull, spot.z - dz * pull);
      const size = (1.7 + 0.06 * d) * (spot.cage ? 0.9 : 1) * flick;
      s.scale.set(size, size, 1);
    }
  }

  private scan(eye: THREE.Vector3, getBlock: (x: number, y: number, z: number) => number): void {
    const cx = Math.floor(eye.x);
    const cy = Math.floor(eye.y);
    const cz = Math.floor(eye.z);
    const found: Spot[] = [];
    for (let y = cy - RANGE_Y; y <= cy + RANGE_Y; y++) {
      for (let z = cz - RANGE_XZ; z <= cz + RANGE_XZ; z++) {
        for (let x = cx - RANGE_XZ; x <= cx + RANGE_XZ; x++) {
          const id = getBlock(x, y, z);
          const lantern = isLantern(id);
          if (!lantern && (id < B.TORCH || id > B.TORCH_NZ)) continue;
          // A standing torch's flame is at the top of the cell's centre; a wall torch leans out from the wall it hangs on.
          let px = x + 0.5;
          let pz = z + 0.5;
          let py = y + 0.72;
          if (lantern) {
            // The flame is in the middle of the cage.
            py = y + (lanternInfo(id)!.hanging ? 0.34 : 0.22);
          } else if (id !== B.TORCH) {
            py = y + 0.85;
            if (id === B.TORCH_PX) px = x + 0.75;
            else if (id === B.TORCH_NX) px = x + 0.25;
            else if (id === B.TORCH_PZ) pz = z + 0.75;
            else pz = z + 0.25;
          }
          const d = Math.hypot(px - eye.x, py - eye.y, pz - eye.z);
          found.push({ x: px, y: py, z: pz, d, soul: lantern && lanternInfo(id)!.soul, cage: lantern });
        }
      }
    }
    found.sort((a, b) => a.d - b.d);
    this.spots = found.slice(0, MAX);
    this.halos = found.filter((f) => f.cage).slice(0, MAX);
    this.souls = found.filter((f) => f.soul).slice(0, 6);
  }

  /** 0..1 of warm torch light at a point, from the torches found around the player (used to light mobs and players). */
  lightAt(x: number, y: number, z: number): number {
    let t = 0;
    for (const s of this.spots) {
      const d = Math.hypot(s.x - x, s.y - y, s.z - z);
      if (d < 9) {
        const k = 1 - d / 9;
        t += k * k;
      }
    }
    return Math.min(1, t);
  }

  /** The nearest soul lanterns (the pool is sorted by distance), as x, y, z and the reach of their light, for the ground's blue tint. */
  soulLights(out: THREE.Vector4[], reach: number): void {
    let n = 0;
    for (const s of this.souls) {
      if (n >= out.length) break;
      out[n++].set(s.x, s.y, s.z, reach);
    }
    for (; n < out.length; n++) out[n].set(0, 0, 0, 0);
  }

  /** How many halos are showing (for the debug hook). */
  get visibleCount(): number {
    return this.sprites.filter((s) => s.visible).length;
  }

  dispose(): void {
    for (const s of this.sprites) (s.material as THREE.SpriteMaterial).dispose();
    this.texture.dispose();
    this.soulTexture.dispose();
  }
}
