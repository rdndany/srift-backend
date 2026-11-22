import * as THREE from 'three';
import { COMPANIONS, type CompanionDef } from '@solrift/shared';

/**
 * The companions that follow their owners (see companions.ts in the shared package): a Cinder Imp that cackles at the left shoulder and a Dawn
 * Seraph that keeps the right one. Each is a little figure of blocks that glows (it does not take the daylight: it is a light of its own), bobs
 * on the air, beats its wings and trails a few sparks, and it follows its owner a step behind: drawn by the position the owner is drawn at, eased,
 * so it lags in a run and settles in a stand. Nothing here is sent over the wire but which companion a player has (`pt`).
 */

/** One owner that has a companion: where they stand (their feet) and the way they face. */
export interface PetOwner {
  /** Whatever tells the owners apart (a player id, or 0 for yourself). */
  key: number;
  /** 1 + the place in COMPANIONS. */
  pet: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** How much higher they are carried (a rider on a mount). */
  lift?: number;
}

interface Rig {
  root: THREE.Group;
  /** `t` is a clock in seconds, `dt` the seconds since the last call, `speed` how fast it is being carried (blocks a second). */
  update(t: number, dt: number, speed: number): void;
  dispose(): void;
}

interface Follower {
  pet: number;
  rig: Rig;
  /** Where it is now (it eases toward where it should be). */
  pos: THREE.Vector3;
  yaw: number;
  fresh: boolean;
  /** How far round its owner's shoulder it keeps: -1 the left, 1 the right. */
  side: number;
}

const css = (c: string): THREE.Color => new THREE.Color(c);

let glowTex: THREE.Texture | null = null;
/** A soft round light, white (tinted by the sprite's colour). */
function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

/** What a model is made of, so that it can be thrown away whole. */
class Kit {
  readonly geos: THREE.BufferGeometry[] = [];
  readonly mats: THREE.Material[] = [];
  mat(color: string, k = 1): THREE.MeshBasicMaterial {
    const m = new THREE.MeshBasicMaterial({ color: css(color).multiplyScalar(k) });
    this.mats.push(m);
    return m;
  }
  box(parent: THREE.Object3D, m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, h, d);
    this.geos.push(geo);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  /** A ball of light, drawn on top of what is behind it. */
  light(parent: THREE.Object3D, color: string, size: number, opacity: number, x = 0, y = 0, z = 0): THREE.Sprite {
    const m = new THREE.SpriteMaterial({ map: glowTexture(), color: css(color), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.mats.push(m);
    const s = new THREE.Sprite(m);
    s.scale.setScalar(size);
    s.position.set(x, y, z);
    parent.add(s);
    return s;
  }
  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}

/** A few points of light that rise from a spot and fade: for the trail of the imp and the shimmer of the seraph. */
function sparks(kit: Kit, parent: THREE.Object3D, color: string, count: number, rise: number, spread: number): (t: number) => void {
  const items: { s: THREE.Sprite; seed: number }[] = [];
  for (let i = 0; i < count; i++) {
    const s = kit.light(parent, color, 0.07, 0.9);
    items.push({ s, seed: i / count });
  }
  return (t) => {
    for (const { s, seed } of items) {
      const life = (seed + t * 0.5 + Math.sin(seed * 40) * 0.1) % 1;
      s.position.set(Math.sin(seed * 97 + t * 0.7) * spread * (0.4 + life), -0.1 + life * rise, Math.cos(seed * 53 + t * 0.6) * spread * (0.4 + life));
      (s.material as THREE.SpriteMaterial).opacity = Math.sin(life * Math.PI) * 0.9;
    }
  };
}

/** The Cinder Imp: red, with horns, yellow eyes, bat wings that beat fast, a tail with a flame at its tip, and a trail of embers. */
function buildImp(def: CompanionDef): Rig {
  const kit = new Kit();
  const root = new THREE.Group();
  const body = kit.mat(def.body);
  const dark = kit.mat(def.body, 0.62);
  const trim = kit.mat(def.trim);
  const eye = kit.mat('#fff2a0');
  const fang = kit.mat('#fff6e6');
  const inner = new THREE.Group();
  root.add(inner);
  kit.box(inner, body, 0.2, 0.24, 0.14, 0, 0, 0);
  kit.box(inner, dark, 0.2, 0.05, 0.14, 0, -0.1, 0); // the belly band
  const head = new THREE.Group();
  head.position.set(0, 0.25, 0);
  inner.add(head);
  kit.box(head, body, 0.27, 0.23, 0.23, 0, 0, 0);
  for (const s of [-1, 1]) {
    const horn = kit.box(head, trim, 0.05, 0.14, 0.05, s * 0.1, 0.17, 0);
    horn.rotation.z = -s * 0.35;
    kit.box(head, kit.mat(def.glow), 0.04, 0.04, 0.04, s * 0.14, 0.25, 0); // the hot tip
    kit.box(head, eye, 0.06, 0.045, 0.02, s * 0.06, 0.03, -0.118);
    kit.box(head, fang, 0.025, 0.04, 0.02, s * 0.04, -0.07, -0.118);
    kit.box(head, dark, 0.06, 0.07, 0.05, s * 0.155, 0.0, 0.0); // ears
  }
  kit.box(head, dark, 0.14, 0.03, 0.02, 0, -0.045, -0.118); // the grin
  const arms: THREE.Mesh[] = [];
  for (const s of [-1, 1]) arms.push(kit.box(inner, dark, 0.05, 0.16, 0.05, s * 0.13, 0.0, -0.02));
  // Bat wings: a flat membrane on two bones, hinged at the back.
  const wings: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(s * 0.08, 0.06, 0.08);
    const bone = kit.box(w, dark, 0.3, 0.025, 0.025, s * 0.15, 0.04, 0);
    bone.rotation.z = s * 0.25;
    const skin = kit.box(w, kit.mat(def.body, 0.8), 0.28, 0.2, 0.012, s * 0.15, -0.04, 0);
    skin.rotation.z = s * 0.12;
    kit.box(w, trim, 0.03, 0.03, 0.03, s * 0.3, 0.1, 0);
    inner.add(w);
    wings.push(w);
  }
  // A tail that hangs below and sways, with a flame at its tip.
  const tail = new THREE.Group();
  tail.position.set(0, -0.12, 0.07);
  inner.add(tail);
  const segs: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) segs.push(kit.box(tail, dark, 0.04, 0.09, 0.04, 0, -0.05 - i * 0.085, i * 0.03));
  const flame = kit.light(tail, def.glow, 0.2, 0.95, 0, -0.33, 0.09);
  kit.light(root, def.glow, 0.7, 0.35, 0, 0.1, 0);
  const trail = sparks(kit, root, '#ffb040', 7, 0.5, 0.18);
  return {
    root,
    update: (t, _dt, speed) => {
      const lean = Math.min(0.5, speed * 0.08);
      inner.rotation.x = lean;
      const beat = Math.sin(t * 17);
      wings.forEach((w, i) => (w.rotation.y = (i === 0 ? -1 : 1) * (0.7 + 0.45 * beat)));
      arms.forEach((a, i) => (a.rotation.x = Math.sin(t * 4 + i * Math.PI) * 0.4));
      head.rotation.z = Math.sin(t * 2.3) * 0.08;
      segs.forEach((s, i) => (s.position.x = Math.sin(t * 5 - i * 0.9) * 0.03 * (i + 1)));
      flame.position.x = Math.sin(t * 5 - 2.7) * 0.1;
      flame.scale.setScalar(0.2 + Math.sin(t * 21) * 0.03);
      trail(t);
    },
    dispose: () => kit.dispose(),
  };
}

/** The Dawn Seraph: pale, a ring of light over its head, wings of feathers that beat slowly, and light that shimmers down from it. */
function buildSeraph(def: CompanionDef): Rig {
  const kit = new Kit();
  const root = new THREE.Group();
  const robe = kit.mat(def.body);
  const shade = kit.mat(def.body, 0.82);
  const gold = kit.mat(def.trim);
  const skin = kit.mat('#fbe3cf');
  const eye = kit.mat('#6a5030');
  const inner = new THREE.Group();
  root.add(inner);
  kit.box(inner, robe, 0.2, 0.26, 0.14, 0, -0.01, 0);
  kit.box(inner, shade, 0.26, 0.09, 0.2, 0, -0.17, 0); // the hem flares
  kit.box(inner, gold, 0.2, 0.025, 0.145, 0, -0.1, 0); // a gold sash
  const head = new THREE.Group();
  head.position.set(0, 0.26, 0);
  inner.add(head);
  kit.box(head, skin, 0.24, 0.22, 0.22, 0, 0, 0);
  kit.box(head, kit.mat('#f3d27a'), 0.26, 0.08, 0.24, 0, 0.12, 0.01); // golden hair
  for (const s of [-1, 1]) {
    kit.box(head, eye, 0.05, 0.02, 0.02, s * 0.06, 0.01, -0.118);
    kit.box(head, kit.mat('#f6b7a8'), 0.035, 0.025, 0.02, s * 0.085, -0.04, -0.118);
  }
  // The halo: a ring that turns slowly above the head, with a light in it.
  const haloGeo = new THREE.TorusGeometry(0.13, 0.014, 6, 24);
  kit.geos.push(haloGeo);
  const haloMat = new THREE.MeshBasicMaterial({ color: css(def.glow).multiplyScalar(1.3) });
  kit.mats.push(haloMat);
  const halo = new THREE.Mesh(haloGeo, haloMat);
  halo.rotation.x = Math.PI / 2 - 0.2;
  halo.position.set(0, 0.27, 0);
  head.add(halo);
  kit.light(head, def.glow, 0.32, 0.8, 0, 0.27, 0);
  const arms: THREE.Mesh[] = [];
  for (const s of [-1, 1]) arms.push(kit.box(inner, skin, 0.045, 0.14, 0.045, s * 0.125, -0.02, -0.03));
  // Wings: feathers fanned from the shoulder blade, longest at the top.
  const wings: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(s * 0.07, 0.08, 0.08);
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Group();
      f.rotation.z = -s * (0.15 + i * 0.3);
      const len = 0.34 - i * 0.03;
      kit.box(f, i % 2 === 0 ? robe : shade, 0.06, len, 0.014, 0, len / 2, 0);
      kit.box(f, gold, 0.06, 0.04, 0.016, 0, len, 0);
      w.add(f);
    }
    inner.add(w);
    wings.push(w);
  }
  kit.light(root, def.glow, 0.8, 0.16, 0, 0.1, 0);
  const shimmer = sparks(kit, root, '#fff3b8', 8, 0.4, 0.2);
  return {
    root,
    update: (t, _dt, speed) => {
      inner.rotation.x = Math.min(0.4, speed * 0.06);
      const beat = Math.sin(t * 5.5);
      wings.forEach((w, i) => (w.rotation.y = (i === 0 ? -1 : 1) * (0.55 + 0.3 * beat)));
      arms.forEach((a, i) => (a.rotation.z = (i === 0 ? 1 : -1) * (0.08 + Math.sin(t * 2) * 0.05)));
      halo.rotation.z = t * 1.2;
      head.rotation.z = Math.sin(t * 1.7) * 0.05;
      shimmer(t);
    },
    dispose: () => kit.dispose(),
  };
}

const build = (pet: number): Rig => (COMPANIONS[pet - 1].id === 'cinder-imp' ? buildImp(COMPANIONS[pet - 1]) : buildSeraph(COMPANIONS[pet - 1]));

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** Every companion in view. */
export class CompanionFollowers {
  readonly group = new THREE.Group();
  private readonly figs = new Map<number, Follower>();
  private time = 0;

  /**
   * Place the companions of `owners` (whoever is in view and has one) one step behind their shoulders, ease them there and animate them. A
   * companion whose owner is gone from the list, or has swapped it for another, is taken away.
   */
  sync(owners: Iterable<PetOwner>, dt: number): void {
    this.time += dt;
    const seen = new Set<number>();
    for (const o of owners) {
      if (!(o.pet >= 1 && o.pet <= COMPANIONS.length)) continue;
      seen.add(o.key);
      let f = this.figs.get(o.key);
      if (f && f.pet !== o.pet) {
        this.drop(o.key);
        f = undefined;
      }
      if (!f) {
        const rig = build(o.pet);
        rig.root.scale.setScalar(1.3);
        this.group.add(rig.root);
        f = { pet: o.pet, rig, pos: new THREE.Vector3(), yaw: o.yaw, fresh: true, side: o.pet % 2 === 1 ? -1 : 1 };
        this.figs.set(o.key, f);
      }
      // Beside the shoulder, a little ahead and above the head; it rocks about there as if on a slow current.
      const sin = Math.sin(o.yaw);
      const cos = Math.cos(o.yaw);
      const side = f.side * (0.85 + Math.sin(this.time * 0.9 + o.key) * 0.06);
      const ahead = 0.25 + Math.cos(this.time * 0.7 + o.key) * 0.08;
      const tx = o.x + cos * side - sin * ahead;
      const tz = o.z - sin * side - cos * ahead;
      const ty = o.y + 1.85 + (o.lift ?? 0) + Math.sin(this.time * 2.1 + o.key * 1.7) * 0.07;
      if (f.fresh || Math.hypot(tx - f.pos.x, tz - f.pos.z) > 10 || Math.abs(ty - f.pos.y) > 10) {
        f.pos.set(tx, ty, tz);
        f.fresh = false;
      }
      const before = f.pos.clone();
      const k = 1 - Math.exp(-dt * 6);
      f.pos.x += (tx - f.pos.x) * k;
      f.pos.y += (ty - f.pos.y) * k;
      f.pos.z += (tz - f.pos.z) * k;
      const speed = dt > 0 ? before.distanceTo(f.pos) / dt : 0;
      f.yaw += wrap(o.yaw - f.yaw) * (1 - Math.exp(-dt * 5));
      f.rig.root.position.copy(f.pos);
      f.rig.root.rotation.y = f.yaw;
      f.rig.update(this.time, dt, speed);
    }
    for (const key of [...this.figs.keys()]) if (!seen.has(key)) this.drop(key);
  }

  private drop(key: number): void {
    const f = this.figs.get(key);
    if (!f) return;
    this.group.remove(f.rig.root);
    f.rig.dispose();
    this.figs.delete(key);
  }

  dispose(): void {
    for (const key of [...this.figs.keys()]) this.drop(key);
    glowTex?.dispose();
    glowTex = null;
  }
}
