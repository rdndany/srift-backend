import * as THREE from 'three';
import { spriteData, type SpriteData } from './models';

/** How many steps the heat spreads in over the cast (the cast takes five seconds: a step every 0.7 of one). */
const STEPS = 7;

const hex = (h: number): THREE.Color => new THREE.Color().setHex(h, THREE.SRGBColorSpace);
const YELLOW = hex(0xffe060);
const ORANGE = hex(0xff7a12);
const RED = hex(0xd2381c);

const luckOf = (x: number, y: number): number => {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/**
 * The Emberstone heating up while it is cast. The stone is a little voxel model coloured pixel by pixel (see `ItemModels.sprite`); as the
 * cast goes on the glow spreads out from the middle of it, step by step: a core of yellow that grows, then orange, then a red edge in front
 * of it, taking over the grey rock until the whole stone is red and orange. Each hand and each figure that casts gets a copy of the stone's
 * geometry to colour (the original is shared by every stone in the game), given back when the cast ends.
 */
export class StoneHeat {
  private root: THREE.Object3D | null = null;
  private mesh: THREE.Mesh | null = null;
  private orig: THREE.BufferGeometry | null = null;
  private own: THREE.BufferGeometry | null = null;
  private data: SpriteData | null = null;
  private step = 0;
  private cx = 0;
  private cy = 0;
  private reach = 1;

  /** `root` is the item in the hand (the stone, or whatever else: nothing happens to it); `progress` how far into the cast, 0 when not casting. */
  apply(root: THREE.Object3D | null, progress: number): void {
    if (root !== this.root) {
      this.release();
      this.root = root;
      this.find();
    }
    if (!this.mesh || !this.orig || !this.data) return;
    const step = progress > 0 ? Math.min(STEPS, Math.floor(progress * STEPS)) : 0;
    if (step === 0) {
      this.release();
      return;
    }
    if (!this.own) {
      this.own = this.orig.clone();
      this.mesh.geometry = this.own;
      this.step = -1;
    }
    if (step !== this.step) {
      this.step = step;
      this.paint(Math.min(1, step / (STEPS - 1)));
    }
  }

  /** The stone's own mesh in `root`: the first one built from a picture. */
  private find(): void {
    this.mesh = null;
    this.orig = null;
    this.data = null;
    this.root?.traverse((o) => {
      if (this.mesh || !(o instanceof THREE.Mesh)) return;
      const d = spriteData.get(o.geometry);
      if (!d) return;
      this.mesh = o;
      this.orig = o.geometry;
      this.data = d;
    });
    const data = this.data as SpriteData | null;
    if (!data) return;
    // the middle of the picture, and how far the furthest pixel of it is
    const seen = new Set<number>();
    let sx = 0;
    let sy = 0;
    const px = data.pix;
    for (let q = 0; q < px.length / 2; q++) {
      const key = px[q * 2] * 256 + px[q * 2 + 1];
      if (seen.has(key)) continue;
      seen.add(key);
      sx += px[q * 2];
      sy += px[q * 2 + 1];
    }
    this.cx = sx / seen.size;
    this.cy = sy / seen.size;
    let far = 1;
    for (let q = 0; q < px.length / 2; q++) far = Math.max(far, Math.hypot(px[q * 2] - this.cx, px[q * 2 + 1] - this.cy));
    this.reach = far;
  }

  /** `f` 0..1 of the way through the spread. */
  private paint(f: number): void {
    const own = this.own;
    const data = this.data;
    if (!own || !data) return;
    const attr = own.getAttribute('color') as THREE.BufferAttribute;
    const out = attr.array as Float32Array;
    const front = f * (this.reach + 1.2);
    const core = this.reach * (0.12 + 0.28 * f);
    const n = data.pix.length / 2;
    for (let q = 0; q < n; q++) {
      const gx = data.pix[q * 2];
      const gy = data.pix[q * 2 + 1];
      let r = data.base[q * 3];
      let g = data.base[q * 3 + 1];
      let b = data.base[q * 3 + 2];
      const d = Math.hypot(gx - this.cx, gy - this.cy);
      if (d < front) {
        const c = d < core ? YELLOW : d < front - 1.3 ? ORANGE : RED;
        const l = 0.9 + 0.2 * luckOf(gx, gy);
        r = Math.min(1, c.r * l);
        g = Math.min(1, c.g * l);
        b = Math.min(1, c.b * l);
      }
      const s = data.shade[q];
      for (let k = 0; k < 4; k++) {
        const o = (q * 4 + k) * 3;
        out[o] = r * s;
        out[o + 1] = g * s;
        out[o + 2] = b * s;
      }
    }
    attr.needsUpdate = true;
  }

  /** Give the shared stone back (the colours go with the copy). */
  private release(): void {
    if (this.own && this.mesh && this.orig) {
      this.mesh.geometry = this.orig;
      this.own.dispose();
    }
    this.own = null;
    this.step = 0;
  }
}
