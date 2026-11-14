import * as THREE from 'three';
import { B } from '@solrift/shared';

const RADIUS = 12;
const HEIGHT = 6;
const MAX_BOOKS = 12;
const RESCAN = 0.5;

/**
 * The book that hovers over an enchanting table: it bobs, turns slowly and its covers open and close
 * like wings. Only tables near the player are looked for (a small scan a couple of times a second).
 */
export class BookRenderer {
  readonly group = new THREE.Group();
  private books = new Map<string, Book>();
  private clock = 0;
  private sinceScan = RESCAN;
  private geo = {
    cover: new THREE.BoxGeometry(0.3, 0.02, 0.4),
    pages: new THREE.BoxGeometry(0.27, 0.035, 0.36),
    spine: new THREE.BoxGeometry(0.03, 0.05, 0.4),
  };
  private mat = {
    cover: new THREE.MeshBasicMaterial({ color: 0x6a2fa8 }),
    pages: new THREE.MeshBasicMaterial({ color: 0xf2e8c8 }),
    spine: new THREE.MeshBasicMaterial({ color: 0x4a1f78 }),
  };

  get count(): number {
    return this.books.size;
  }

  /** `blockAt` reads the world; `eye` is where the player is. */
  update(dt: number, eye: { x: number; y: number; z: number }, blockAt: (x: number, y: number, z: number) => number): void {
    this.clock += dt;
    this.sinceScan += dt;
    if (this.sinceScan >= RESCAN) {
      this.sinceScan = 0;
      this.scan(eye, blockAt);
    }
    for (const b of this.books.values()) {
      const t = this.clock + b.phase;
      b.root.position.y = b.baseY + 0.05 * Math.sin(t * 1.6);
      b.root.rotation.y = t * 0.6;
      // The covers flap between nearly closed and wide open.
      const open = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.3));
      b.left.rotation.z = open;
      b.right.rotation.z = -open;
    }
  }

  private scan(eye: { x: number; y: number; z: number }, blockAt: (x: number, y: number, z: number) => number): void {
    const cx = Math.floor(eye.x);
    const cy = Math.floor(eye.y);
    const cz = Math.floor(eye.z);
    const found = new Map<string, [number, number, number]>();
    for (let y = cy - HEIGHT; y <= cy + HEIGHT; y++) {
      for (let z = cz - RADIUS; z <= cz + RADIUS; z++) {
        for (let x = cx - RADIUS; x <= cx + RADIUS; x++) {
          if (blockAt(x, y, z) === B.ENCHANTING_TABLE) found.set(`${x},${y},${z}`, [x, y, z]);
        }
      }
    }
    for (const [key, b] of this.books) {
      if (found.has(key)) continue;
      this.group.remove(b.root);
      this.books.delete(key);
    }
    for (const [key, [x, y, z]] of found) {
      if (this.books.has(key) || this.books.size >= MAX_BOOKS) continue;
      this.books.set(key, this.make(x, y, z));
    }
  }

  private make(x: number, y: number, z: number): Book {
    const root = new THREE.Group();
    const baseY = y + 1.25;
    root.position.set(x + 0.5, baseY, z + 0.5);
    const mk = (pages: boolean): THREE.Group => {
      // Pivot on the spine: the cover and pages sit to one side of it.
      const pivot = new THREE.Group();
      const cover = new THREE.Mesh(this.geo.cover, this.mat.cover);
      cover.position.set(0.15, 0, 0);
      const leaf = new THREE.Mesh(this.geo.pages, this.mat.pages);
      leaf.position.set(0.14, 0.025, 0);
      pivot.add(cover);
      if (pages) pivot.add(leaf);
      return pivot;
    };
    const left = mk(true);
    const right = mk(true);
    right.rotation.y = Math.PI;
    const spine = new THREE.Mesh(this.geo.spine, this.mat.spine);
    // Each wing hangs from its own pivot so that the flap is mirrored.
    const lw = new THREE.Group();
    lw.add(left);
    const rw = new THREE.Group();
    rw.add(right);
    root.add(lw, rw, spine);
    this.group.add(root);
    return { root, baseY, left: lw, right: rw, phase: (x * 7 + z * 13 + y * 3) % 6.28 };
  }

  dispose(): void {
    for (const b of this.books.values()) this.group.remove(b.root);
    this.books.clear();
    for (const g of Object.values(this.geo)) g.dispose();
    for (const m of Object.values(this.mat)) m.dispose();
  }
}

interface Book {
  root: THREE.Group;
  baseY: number;
  left: THREE.Group;
  right: THREE.Group;
  phase: number;
}
