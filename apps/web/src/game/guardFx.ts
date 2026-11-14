import * as THREE from 'three';
import type { Fx } from '@solrift/shared';
import { clamp01, type FxEntry, type SpellKit } from './spellFx';
import { Cubes, seeded, srgb, steps, voxelMaterial } from './voxelFx';

/**
 * The Warrior's Iron Defense (half the damage taken while it lasts), kept as plain as a buff can be.
 *  - Seen from outside (someone else, or yourself in third person): small cubes of blue and white climb the body in a slow spiral from the
 *    feet, one after another, and are gone over the head; that is all. They start in turn when it goes up, and when it ends they simply
 *    stop starting again (the last ones finish their climb), so nothing has to shrink away. The cubes are placed from where the figure is
 *    drawn this frame (see `SpellKit.locate`), so they never trail behind it.
 *  - Seen from inside (first person): none of that, but a bluish mask of cubes that rises over the edges of the view from the bottom,
 *    stays there while the guard lasts, and goes down again as it ends (`GuardVeil`, drawn in front of everything by the game).
 */

const BLUES = [srgb(0x5f9bff), srgb(0x86aee0), srgb(0xa8d0ff)];
const WHITE = srgb(0xeaf4ff);
const RISERS = 16;
/** Climbs a second: one takes between 0.62 and 0.83 of a second. */
const RATE = [1.2, 1.6];

export function buildIronDefense(f: Fx, e: FxEntry, kit: SpellKit): FxEntry {
  const g = e.group;
  g.position.set(f.x, f.y, f.z);
  const cubes = new Cubes(kit, voxelMaterial(e), 40, g.position);
  g.add(cubes.mesh);
  e.dispose = () => cubes.dispose();
  const rng = seeded(f.id * 40503 + 3);
  // Round the body evenly (a golden angle apart), each starting a little after the one before, so the first moment climbs from the feet.
  const risers = Array.from({ length: RISERS }, (_, i) => ({
    a: i * 2.399963,
    r: 0.5 + rng() * 0.15,
    rate: RATE[0] + rng() * (RATE[1] - RATE[0]),
    start: i * 0.035,
    size: 0.12 + rng() * 0.08,
    tone: Math.floor(rng() * 3),
  }));
  /** The last time a climb may begin: every one that has begun is over before the mark is. */
  const lastStart = e.ttl - 0.85;

  const target = new THREE.Vector3(f.x, f.y, f.z);
  const eye = new THREE.Vector3();
  e.update = (m) => {
    target.set(m.x, m.y, m.z);
  };
  /** The camera is inside it (your own first-person view): it is not drawn there, the mask is. */
  const inside = (): boolean => {
    if (!kit.viewer) return false;
    eye.set(g.position.x, g.position.y + 1.2, g.position.z);
    return eye.distanceTo(kit.viewer) < 2.2;
  };

  e.animate = (_t, age, dt) => {
    // where the figure is drawn now; if it cannot be found, where the server last said
    const at = kit.locate(f.by);
    if (at) g.position.set(at.x, at.y, at.z);
    else if (g.position.distanceToSquared(target) > 16) g.position.copy(target);
    else if (dt > 0) g.position.lerp(target, 1 - Math.exp(-dt * 22));
    cubes.reset();
    if (!inside()) {
      for (const r of risers) {
        const t = age - r.start;
        if (t < 0) continue;
        const n = Math.floor(t * r.rate);
        if (r.start + n / r.rate > lastStart) continue;
        const ph = t * r.rate - n;
        const size = r.size * steps(Math.sin(ph * Math.PI) * 1.6, 3);
        if (size <= 0) continue;
        const a = r.a + ph * 2.2;
        cubes.put(Math.cos(a) * r.r, 0.1 + ph * 2.1, Math.sin(a) * r.r, size, size, size, r.tone === 2 ? WHITE : BLUES[r.tone], a);
      }
    }
    cubes.done();
  };
  return e;
}

// ---- The mask over the first-person view ----------------------------------------------------------------------------------

const VEIL = [srgb(0x5f9bff), srgb(0x86aee0), srgb(0xa8d0ff)];
/** How far in front of the camera the cubes sit, and how many rows of them fill the height of the view. */
const DEPTH = 0.5;
const ROWS = 16;

interface Cell {
  col: number;
  row: number;
  /** 0..1, fixed for the cell: how far the mask reaches here, when it shows, which blue it starts on. */
  luck: number;
  luck2: number;
}

/**
 * A mask of cubes over the edges of the first-person view while the guard is up. It lies in the scene right in front of the camera
 * (its cubes are laid out in the camera's own space, whatever the field of view and the shape of the window) and is drawn over everything:
 * it rises from the bottom as it goes up, stays, and goes down as it ends. The middle of the view is left clear.
 */
export class GuardVeil {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.36, depthTest: false, depthWrite: false });
  private readonly geometry: THREE.BufferGeometry;
  private readonly cap = 420;
  private cells: Cell[] = [];
  private cols = 0;
  private rows = 0;
  private k = 0;
  private clock = 0;
  private readonly matrix = new THREE.Matrix4();

  constructor() {
    const v = new THREE.BoxGeometry(1, 1, 1);
    const shades = [0.8, 0.7, 1, 0.5, 0.9, 0.75];
    const vc = new Float32Array(v.attributes.position.count * 3);
    for (let i = 0; i < v.attributes.position.count; i++) vc.fill(shades[Math.floor(i / 4)], i * 3, i * 3 + 3);
    v.setAttribute('color', new THREE.BufferAttribute(vc, 3));
    this.geometry = v;
    this.mesh = new THREE.InstancedMesh(v, this.material, this.cap);
    this.mesh.setColorAt(0, VEIL[0]);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 998;
    this.mesh.count = 0;
    this.group.add(this.mesh);
    this.group.visible = false;
  }

  /** Which cells make the mask for a view `cols` cells wide: along the bottom and up the sides, a little over the top. */
  private layout(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    const rng = seeded(7);
    this.cells = [];
    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        const x = Math.abs((col + 0.5) / cols * 2 - 1); // 0 in the middle, 1 at the edge
        const y = (row + 0.5) / rows; // 0 at the bottom
        const luck = rng();
        const bottom = 0.1 + 0.07 * luck;
        const side = 0.07 + 0.05 * luck;
        const top = 0.06 * luck;
        const inMask = y < bottom + 0.22 * Math.max(0, x - 0.55) || 1 - x < side + (1 - y) * 0.05 || 1 - y < top;
        if (inMask && this.cells.length < this.cap) this.cells.push({ col, row, luck, luck2: rng() });
      }
    }
  }

  /** `active`: the guard is up and the view is first person. */
  update(dt: number, active: boolean, camera: THREE.Camera): void {
    this.k = clamp01(this.k + (active ? dt / 0.7 : -dt / 0.5));
    this.group.visible = this.k > 0.001;
    if (!this.group.visible) return;
    this.clock += dt;
    const cam = camera as THREE.PerspectiveCamera;
    const hh = DEPTH * Math.tan(THREE.MathUtils.degToRad((cam.fov ?? 70) / 2));
    const hw = hh * (cam.aspect ?? 1.6);
    const cell = (hh * 2) / ROWS;
    const cols = Math.max(4, Math.ceil((hw * 2) / cell));
    if (cols !== this.cols || ROWS !== this.rows) this.layout(cols, ROWS);
    this.group.position.copy(camera.position);
    this.group.quaternion.copy(camera.quaternion);
    // the cubes fit the width of the view exactly
    const cw = (hw * 2) / cols;
    const p = this.k;
    let n = 0;
    for (const c of this.cells) {
      const y = (c.row + 0.5) / ROWS;
      // it rises: a cell is there once the front of the rise has passed it (and goes in the order of rising when it falls)
      const reach = clamp01((p * 1.35 - y - c.luck2 * 0.12) / 0.18);
      const grow = steps(reach, 3);
      if (grow <= 0) continue;
      const x = -hw + (c.col + 0.5) * cw;
      const yy = -hh + (c.row + 0.5) * cell;
      this.matrix.makeScale(cw * 0.94 * grow, cell * 0.94 * grow, cell * 0.4 * grow);
      this.matrix.setPosition(x, yy, -DEPTH);
      this.mesh.setMatrixAt(n, this.matrix);
      // a slow wave of lighter blue climbing the mask
      this.mesh.setColorAt(n, VEIL[(Math.floor(this.clock * 1.6 - y * 5 + c.luck * 3) % 3 + 3) % 3]);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
