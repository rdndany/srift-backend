import * as THREE from 'three';
import { BED_DIRS, SIGN_LINES, isBlankSign, signInfo } from '@solrift/shared';
import type { EntityLight } from './entityLight';

/**
 * The writing on signs. A sign's board is a block model (see shapes.ts); the words are drawn on a small canvas and laid just in front of
 * the board on both sides, so a sign can be read from the front and the back. Only the signs near the camera are drawn.
 */

export interface SignFace {
  /** The middle of the front of the board, and the way it faces (a unit step on x and z). */
  x: number;
  y: number;
  z: number;
  nx: number;
  nz: number;
  /** The size of the board's face. */
  w: number;
  h: number;
}

/** Where the writing goes for a sign block: on the front face of the board, which looks away from the wall (or the way the post faces). */
export function signFace(id: number, bx: number, by: number, bz: number): SignFace | null {
  const info = signInfo(id);
  if (!info) return null;
  const [dx, dz] = BED_DIRS[info.facing & 3];
  // The front looks along -BED_DIRS (the back of a wall sign is on the wall side, +BED_DIRS).
  const nx = -dx;
  const nz = -dz;
  const p = 1 / 16;
  if (info.wall) {
    // The board is a plank 2/16 thick against the wall: its middle is 15/16 of the way to the wall, 4..14/16 high.
    const k = 7 * p; // from the middle of the block towards the wall
    return { x: bx + 0.5 + dx * k + nx * p, y: by + 9 * p, z: bz + 0.5 + dz * k + nz * p, nx, nz, w: 14 * p, h: 10 * p };
  }
  // A standing board is a plank 2/16 thick on a post: 7..15/16 high, in the middle of the block.
  return { x: bx + 0.5 + nx * p, y: by + 11 * p, z: bz + 0.5 + nz * p, nx, nz, w: 14 * p, h: 8 * p };
}

const CW = 280;
const CH = 160;

/** Paint the four lines on a canvas: dark letters, each line shrunk to the width of the board when it is too long. */
export function paintSign(g: CanvasRenderingContext2D, lines: readonly string[]): void {
  g.clearRect(0, 0, CW, CH);
  g.fillStyle = '#16100a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const row = CH / SIGN_LINES;
  for (let i = 0; i < SIGN_LINES; i++) {
    const text = lines[i] ?? '';
    if (!text) continue;
    g.font = `bold ${Math.floor(row * 0.8)}px 'Monocraft', 'Courier New', monospace`;
    const wide = g.measureText(text).width;
    g.save();
    g.translate(CW / 2, row * i + row / 2);
    if (wide > CW - 8) g.scale((CW - 8) / wide, 1);
    g.fillText(text, 0, 0);
    g.restore();
  }
}

interface Shown {
  key: string;
  tex: THREE.CanvasTexture;
  mat: THREE.MeshBasicMaterial;
  front: THREE.Mesh;
  back: THREE.Mesh;
}

export interface SignText {
  x: number;
  y: number;
  z: number;
  lines: readonly string[];
}

export class SignBoards {
  readonly group = new THREE.Group();
  private readonly shown = new Map<string, Shown>();
  private env: EntityLight | null = null;
  private readonly tmp = new THREE.Color();
  private readonly geo = new THREE.PlaneGeometry(1, 1);

  constructor(private readonly blockAt: (x: number, y: number, z: number) => number) {}

  setEnvironment(env: EntityLight): void {
    this.env = env;
  }

  /** Make the boards match these signs (the ones that are written on and still stand). */
  sync(signs: readonly SignText[], near: { x: number; z: number }, range: number): void {
    const live = new Set<string>();
    for (const s of signs) {
      if (Math.abs(s.x + 0.5 - near.x) > range || Math.abs(s.z + 0.5 - near.z) > range) continue;
      if (isBlankSign(s.lines as string[])) continue;
      const face = signFace(this.blockAt(s.x, s.y, s.z), s.x, s.y, s.z);
      if (!face) continue;
      const id = `${s.x},${s.y},${s.z}`;
      live.add(id);
      const key = `${s.lines.join('\n')}|${face.nx},${face.nz},${face.x},${face.z},${face.y}`;
      let m = this.shown.get(id);
      if (m && m.key !== key) {
        this.remove(id, m);
        m = undefined;
      }
      if (!m) {
        const made = this.make(key, s.lines, face);
        if (!made) continue;
        m = made;
        this.shown.set(id, m);
        this.group.add(m.front, m.back);
      }
      if (this.env) {
        this.env.at(face.x, face.y, face.z, this.tmp);
        this.tmp.setRGB(Math.min(1, Math.max(0.3, this.tmp.r)), Math.min(1, Math.max(0.3, this.tmp.g)), Math.min(1, Math.max(0.3, this.tmp.b)));
      } else this.tmp.setScalar(1);
      m.mat.color.copy(this.tmp);
    }
    for (const [id, m] of this.shown) if (!live.has(id)) this.remove(id, m);
  }

  /** How many boards are drawn (for tests and the debug hook). */
  get count(): number {
    return this.shown.size;
  }

  dispose(): void {
    for (const [id, m] of this.shown) this.remove(id, m);
    this.geo.dispose();
  }

  private make(key: string, lines: readonly string[], f: SignFace): Shown | null {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = CW;
    canvas.height = CH;
    const g = canvas.getContext('2d');
    if (!g) return null;
    paintSign(g, lines);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    // One plane for the front, one for the back, each a hair off its face (the board is 2/16 thick: the front is 1/16 from the middle).
    const front = new THREE.Mesh(this.geo, mat);
    front.scale.set(f.w * 0.94, f.h * 0.94, 1);
    front.position.set(f.x + f.nx * 0.004, f.y, f.z + f.nz * 0.004);
    front.rotation.y = Math.atan2(f.nx, f.nz);
    const back = new THREE.Mesh(this.geo, mat);
    back.scale.copy(front.scale);
    back.position.set(f.x - f.nx * (2 / 16 + 0.004), f.y, f.z - f.nz * (2 / 16 + 0.004));
    back.rotation.y = Math.atan2(-f.nx, -f.nz);
    front.renderOrder = back.renderOrder = 2;
    return { key, tex, mat, front, back };
  }

  private remove(id: string, m: Shown): void {
    this.group.remove(m.front, m.back);
    m.tex.dispose();
    m.mat.dispose();
    this.shown.delete(id);
  }
}
