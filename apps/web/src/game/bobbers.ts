import * as THREE from 'three';
import type { BobberDraw } from '@solrift/shared';

/** Where the fishing line is held, in the view of the player that is looking (first person) or in the world (a body seen from outside). */
export interface BobberView {
  camera: THREE.Camera;
  /** Whether the camera is in the player's own head: the line then comes from the rod as it shows in the hand. */
  firstPerson: boolean;
  /** The player's own body, for the line when they are seen from outside. */
  self: { x: number; y: number; z: number; yaw: number };
  /** 0..1, how light it is (the float is dimmed at night). */
  brightness: number;
}

/** Where on the screen (-1..1 across and up) the tip of the rod in the hand is, and how far ahead of the eye the line starts (blocks). */
export const ROD_TIP_SCREEN = { x: 0.66, y: -0.1, depth: 0.9 };

const SEGMENTS = 18;
const FLOAT_SIZE = 0.3;
const BUBBLES = 6;
const RING_PERIOD = 1.15;

/** The float, 8x8: red above and white below, with a dark edge. */
function floatTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const g = c.getContext('2d')!;
  const px = (x: number, y: number, color: string) => {
    g.fillStyle = color;
    g.fillRect(x, y, 1, 1);
  };
  const rows = ['..kkkk..', '.krrrrk.', 'krRrrrrk', 'krrrrrrk', 'kwwwwwwk', 'kwwwwWwk', '.kwwwwk.', '..kkkk..'];
  const colors: Record<string, string> = { k: '#221a1a', r: '#d42828', R: '#ff7468', w: '#f2f2f2', W: '#cfd6e0' };
  rows.forEach((row, y) => {
    for (let x = 0; x < 8; x++) if (colors[row[x]]) px(x, y, colors[row[x]]);
  });
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Line {
  id: number;
  float: THREE.Sprite;
  cord: THREE.Line;
  ring: THREE.Mesh;
  bubbles: THREE.Sprite[];
  x: number;
  y: number;
  z: number;
  seen: boolean;
}

/**
 * Fishing lines: a red and white float and the line from the rod's tip to it, for every bobber about (yours and other players'). The float
 * bobs on the water, gets pulled under when a fish bites, rings the water while a fish is near, and the line sags between hand and float.
 */
export class BobberRenderer {
  readonly group = new THREE.Group();
  private readonly tex = floatTexture();
  private readonly floatMat = new THREE.SpriteMaterial({ map: this.tex, alphaTest: 0.5, transparent: false });
  private readonly bubbleMat = new THREE.SpriteMaterial({ color: 0xd8f0ff, transparent: true, opacity: 0.8, depthWrite: false });
  private readonly cordMat = new THREE.LineBasicMaterial({ color: 0x1a1a1a });
  private readonly ringGeo = new THREE.RingGeometry(0.82, 1, 20).rotateX(-Math.PI / 2);
  private readonly lines = new Map<number, Line>();
  private clock = 0;
  private readonly tip = new THREE.Vector3();
  private readonly end = new THREE.Vector3();

  private make(id: number): Line {
    const float = new THREE.Sprite(this.floatMat);
    float.scale.setScalar(FLOAT_SIZE);
    float.frustumCulled = false;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEGMENTS + 1) * 3), 3));
    const cord = new THREE.Line(geo, this.cordMat);
    cord.frustumCulled = false;
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    ring.visible = false;
    ring.renderOrder = 3;
    const bubbles: THREE.Sprite[] = [];
    for (let i = 0; i < BUBBLES; i++) {
      const b = new THREE.Sprite(this.bubbleMat);
      b.visible = false;
      bubbles.push(b);
      this.group.add(b);
    }
    this.group.add(float, cord, ring);
    return { id, float, cord, ring, bubbles, x: 0, y: 0, z: 0, seen: true };
  }

  private drop(l: Line): void {
    this.group.remove(l.float, l.cord, l.ring, ...l.bubbles);
    l.cord.geometry.dispose();
    (l.ring.material as THREE.Material).dispose();
    this.lines.delete(l.id);
  }

  /** Make what is drawn match the bobbers (smoothed a little, so that a server's steps do not show). */
  sync(bobbers: readonly BobberDraw[], dt: number, view: BobberView): void {
    this.clock += dt;
    for (const l of this.lines.values()) l.seen = false;
    const tint = 0.4 + 0.6 * view.brightness;
    this.floatMat.color.setScalar(tint);

    for (const b of bobbers) {
      let l = this.lines.get(b.id);
      if (!l) {
        l = this.make(b.id);
        l.x = b.x;
        l.y = b.y;
        l.z = b.z;
        this.lines.set(b.id, l);
      }
      l.seen = true;
      const gap = Math.hypot(b.x - l.x, b.y - l.y, b.z - l.z);
      const k = gap > 4 ? 1 : 1 - Math.exp(-dt * 34);
      l.x += (b.x - l.x) * k;
      l.y += (b.y - l.y) * k;
      l.z += (b.z - l.z) * k;

      const wave = this.clock * 2.3 + b.id * 1.7;
      // Pulled under by a bite: the float dips and shakes; on calm water it rocks a little; in the air it is just where it is.
      let dy = b.mode === 1 ? Math.sin(wave) * 0.012 : b.mode === 2 ? Math.sin(wave * 3.1) * 0.02 : 0;
      if (b.mode === 3) dy = -0.16 + Math.sin(this.clock * 46) * 0.025;
      const fx = l.x + (b.mode === 3 ? Math.sin(this.clock * 52) * 0.012 : 0);
      l.float.position.set(fx, l.y + FLOAT_SIZE * 0.32 + dy, l.z);

      this.showWater(l, b);
      this.stringUp(l, b, view);
    }
    for (const l of [...this.lines.values()]) if (!l.seen) this.drop(l);
  }

  /** The rings on the water while a fish is near or biting, and the bubbles of one coming. */
  private showWater(l: Line, b: BobberDraw): void {
    const ringing = b.mode === 2 || b.mode === 3;
    l.ring.visible = ringing;
    if (ringing) {
      const t = ((this.clock + l.id * 0.37) % RING_PERIOD) / RING_PERIOD;
      l.ring.position.set(l.x, l.y + 0.02, l.z);
      l.ring.scale.setScalar(0.12 + t * (b.mode === 3 ? 0.9 : 0.6));
      (l.ring.material as THREE.MeshBasicMaterial).opacity = (1 - t) * (b.mode === 3 ? 0.7 : 0.4);
    }
    for (let i = 0; i < BUBBLES; i++) {
      const bub = l.bubbles[i];
      bub.visible = b.mode === 2;
      if (!bub.visible) continue;
      const t = (this.clock * 0.9 + i / BUBBLES) % 1;
      const a = i * 2.4 + l.id;
      const r = 0.1 + 0.16 * ((i * 37) % 10) / 10 + t * 0.1;
      bub.position.set(l.x + Math.cos(a) * r, l.y - 0.22 + t * 0.24, l.z + Math.sin(a) * r);
      bub.scale.setScalar(0.07 * (1 - t * t * t) + 0.01);
    }
  }

  /** The line from the rod's tip to the float, sagging between. */
  private stringUp(l: Line, b: BobberDraw, view: BobberView): void {
    if (!b.own && !b.owner) {
      l.cord.visible = false;
      return;
    }
    l.cord.visible = true;
    if (b.own && view.firstPerson) {
      view.camera.updateMatrixWorld();
      this.tip.set(ROD_TIP_SCREEN.x, ROD_TIP_SCREEN.y, 0.5).unproject(view.camera);
      this.tip.sub(view.camera.position).setLength(ROD_TIP_SCREEN.depth).add(view.camera.position);
    } else {
      const who = b.own ? view.self : b.owner!;
      const sin = Math.sin(who.yaw);
      const cos = Math.cos(who.yaw);
      // The rod points out ahead and up from the right hand: forward is (-sin, -cos), right is (cos, -sin).
      this.tip.set(who.x - sin * 1.15 + cos * 0.35, who.y + 1.55, who.z - cos * 1.15 - sin * 0.35);
    }
    this.end.copy(l.float.position);
    this.end.y += FLOAT_SIZE * 0.4;
    const d = this.tip.distanceTo(this.end);
    // Flying it hangs only a little; lying on the water it droops further in the middle.
    const sag = Math.min(1.4, d * (b.mode === 0 ? 0.06 : 0.14));
    const pos = l.cord.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS;
      pos.setXYZ(i, this.tip.x + (this.end.x - this.tip.x) * t, this.tip.y + (this.end.y - this.tip.y) * t - sag * 4 * t * (1 - t), this.tip.z + (this.end.z - this.tip.z) * t);
    }
    pos.needsUpdate = true;
  }

  /** One line with all of its parts showing, for the loading screen to draw once (see `FigureWarm`): the first cast would build their shaders. */
  warm(): { group: THREE.Group; free: () => void } {
    const l = this.make(-1);
    this.group.remove(l.float, l.cord, l.ring, ...l.bubbles);
    const group = new THREE.Group();
    group.add(l.float, l.cord, l.ring, ...l.bubbles);
    l.ring.visible = true;
    (l.ring.material as THREE.MeshBasicMaterial).opacity = 0.4;
    l.bubbles.forEach((bub, i) => {
      bub.visible = true;
      bub.position.set(0.1 * i, -0.2, 0);
      bub.scale.setScalar(0.07);
    });
    const pos = l.cord.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i <= SEGMENTS; i++) pos.setXYZ(i, i * 0.1, Math.sin(i) * 0.1, 0);
    pos.needsUpdate = true;
    return {
      group,
      free: () => {
        l.cord.geometry.dispose();
        (l.ring.material as THREE.Material).dispose();
      },
    };
  }

  dispose(): void {
    for (const l of [...this.lines.values()]) this.drop(l);
    this.tex.dispose();
    this.floatMat.dispose();
    this.bubbleMat.dispose();
    this.cordMat.dispose();
    this.ringGeo.dispose();
  }
}
