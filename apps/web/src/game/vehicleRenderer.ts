import * as THREE from 'three';
import type { VehicleLike } from './clientSession';
import type { EntityLight } from './entityLight';

type RGB = [number, number, number];

function hash(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A 16x16 texture painted by a function, nearest-filtered like the rest of the game. */
function paint(fn: (x: number, y: number) => RGB): THREE.DataTexture {
  const data = new Uint8Array(16 * 16 * 4);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const [r, g, b] = fn(x, y);
      const i = (y * 16 + x) * 4;
      data[i] = Math.max(0, Math.min(255, r));
      data[i + 1] = Math.max(0, Math.min(255, g));
      data[i + 2] = Math.max(0, Math.min(255, b));
      data[i + 3] = 255;
    }
  const t = new THREE.DataTexture(data, 16, 16, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const jit = (c: RGB, amt: number, x: number, y: number, s: number): RGB => {
  const d = (hash(x, y, s) - 0.5) * 2 * amt;
  return [c[0] + d, c[1] + d, c[2] + d];
};

const TEXTURES = {
  iron: () => paint((x, y) => (x % 8 === 0 || y % 8 === 0 ? jit([112, 116, 124], 6, x, y, 1) : jit([158, 162, 170], 8, x, y, 2))),
  inside: () => paint((x, y) => jit([88, 92, 100], 8, x, y, 3)),
  wheel: () => paint((x, y) => jit([48, 50, 56], 6, x, y, 4)),
  planks: () => paint((x, y) => (y % 4 === 3 ? jit([120, 88, 50], 6, x, y, 5) : jit([166, 128, 78], 10, x, y, 6))),
  planksDark: () => paint((x, y) => (y % 4 === 3 ? jit([96, 70, 40], 6, x, y, 7) : jit([136, 102, 62], 10, x, y, 8))),
} as const;
type TextureName = keyof typeof TEXTURES;

const texCache = new Map<TextureName, THREE.DataTexture>();
function texture(name: TextureName): THREE.DataTexture {
  let t = texCache.get(name);
  if (!t) {
    t = TEXTURES[name]();
    texCache.set(name, t);
  }
  return t;
}

const geoCache = new Map<string, THREE.BoxGeometry>();
function box(w: number, h: number, d: number): THREE.BoxGeometry {
  const key = `${w},${h},${d}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    geoCache.set(key, g);
  }
  return g;
}

interface Part {
  mat: THREE.MeshBasicMaterial;
}

interface View {
  group: THREE.Group;
  parts: Part[];
}

/** Add a box (size w, h, d, centred at x, y, z) to a group. */
function addBox(view: View, tex: TextureName, w: number, h: number, d: number, x: number, y: number, z: number): void {
  const mat = new THREE.MeshBasicMaterial({ map: texture(tex) });
  const mesh = new THREE.Mesh(box(w, h, d), mat);
  mesh.position.set(x, y, z);
  view.group.add(mesh);
  view.parts.push({ mat });
}

/** A minecart: an open iron box on four small wheels, longer along its heading (-z) than wide. */
function buildCart(): View {
  const v: View = { group: new THREE.Group(), parts: [] };
  addBox(v, 'inside', 0.78, 0.06, 0.96, 0, 0.2, 0); // the floor
  addBox(v, 'iron', 0.06, 0.46, 0.96, 0.36, 0.43, 0); // sides
  addBox(v, 'iron', 0.06, 0.46, 0.96, -0.36, 0.43, 0);
  addBox(v, 'iron', 0.78, 0.46, 0.06, 0, 0.43, 0.45); // ends
  addBox(v, 'iron', 0.78, 0.46, 0.06, 0, 0.43, -0.45);
  for (const sx of [-0.3, 0.3])
    for (const sz of [-0.32, 0.32]) addBox(v, 'wheel', 0.1, 0.18, 0.18, sx, 0.09, sz);
  return v;
}

/** A boat: a plank hull with a raised bow and stern and a seat plank across the middle. */
function buildBoat(): View {
  const v: View = { group: new THREE.Group(), parts: [] };
  addBox(v, 'planks', 0.86, 0.06, 1.3, 0, 0.1, 0); // the bottom
  addBox(v, 'planksDark', 0.08, 0.34, 1.3, 0.39, 0.27, 0); // sides
  addBox(v, 'planksDark', 0.08, 0.34, 1.3, -0.39, 0.27, 0);
  addBox(v, 'planksDark', 0.86, 0.34, 0.08, 0, 0.27, -0.61); // bow
  addBox(v, 'planksDark', 0.86, 0.34, 0.08, 0, 0.27, 0.61); // stern
  addBox(v, 'planks', 0.7, 0.05, 0.14, 0, 0.3, 0.12); // the seat
  // The bow stands a little higher.
  addBox(v, 'planksDark', 0.86, 0.14, 0.08, 0, 0.51, -0.61);
  return v;
}

/** Draws minecarts and boats. */
export class VehicleRenderer {
  readonly group = new THREE.Group();
  private views = new Map<number, View & { kind: string }>();

  private env: EntityLight | null = null;
  private readonly tint = new THREE.Color();

  /** Light vehicles from the world (sky colour, caves, torches) instead of by the time of day alone. */
  setEnvironment(env: EntityLight): void {
    this.env = env;
  }

  sync(vehicles: readonly VehicleLike[], brightness: number): void {
    const flat = 0.55 + 0.45 * brightness;
    const seen = new Set<number>();
    for (const v of vehicles) {
      seen.add(v.id);
      let view = this.views.get(v.id);
      if (!view) {
        const b = v.kind === 'boat' ? buildBoat() : buildCart();
        view = { ...b, kind: v.kind };
        this.views.set(v.id, view);
        this.group.add(view.group);
      }
      view.group.position.set(v.x, v.y, v.z);
      view.group.rotation.y = v.yaw;
      // A hit makes it flash red for a moment.
      const hit = v.hurt < 0.25;
      let lr = flat;
      let lg = flat;
      let lb = flat;
      if (this.env) {
        this.env.at(v.x, v.y, v.z, this.tint);
        lr = this.tint.r;
        lg = this.tint.g;
        lb = this.tint.b;
      }
      for (const p of view.parts) p.mat.color.setRGB(hit ? lr * 1.25 : lr, hit ? lg * 0.5 : lg, hit ? lb * 0.5 : lb);
    }
    for (const [id, view] of this.views) {
      if (seen.has(id)) continue;
      this.group.remove(view.group);
      for (const p of view.parts) p.mat.dispose();
      this.views.delete(id);
    }
  }

  clear(): void {
    this.sync([], 1);
  }

  dispose(): void {
    this.clear();
  }
}

/** Releases the shared textures and geometries (call once at shutdown). */
export function disposeVehicleAssets(): void {
  for (const t of texCache.values()) t.dispose();
  texCache.clear();
  for (const g of geoCache.values()) g.dispose();
  geoCache.clear();
}
