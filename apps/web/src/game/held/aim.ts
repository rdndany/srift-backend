import * as THREE from 'three';
import { I, TILE_PX, tileIndex, type ItemDef } from '@solrift/shared';
import { SLAB } from './models';
import { AXIS_X, AXIS_Y, AXIS_Z, DEG, type HandFrame, type HeldBuilder, type HeldKit, type HeldView } from './view';

/**
 * The bow and the crossbow. Each is drawn without its string: the hand adds one that moves (two thin segments meeting at the nock)
 * and an arrow (a bolt), so they can be drawn back, shot and settle.
 */

/** Tile pixel (continuous, y down) to the sprite's local space (tile = 1 unit, y up). */
const tl = (x: number, y: number): [number, number] => [x / TILE_PX - 0.5, 0.5 - y / TILE_PX];

/**
 * What moves on a bow or a crossbow: the string runs from tip `a` to tip `b` and is drawn back along `dir` (up to `max`),
 * and the arrow (a bolt) lies along `dir` reversed, `len` long, its tail in the string's nock.
 */
interface AimDef {
  a: [number, number];
  b: [number, number];
  /** Unit vector the string is pulled along (local space). */
  dir: [number, number];
  max: number;
  len: number;
  crossbow: boolean;
}
const BOW: AimDef = { a: tl(2.5, 14.5), b: tl(13.5, 2.5), dir: [0.74, -0.67], max: 0.3, len: 0.7, crossbow: false };
const CROSSBOW: AimDef = { a: tl(6.5, 3.5), b: tl(14.5, 11.5), dir: [-0.707, -0.707], max: 0.22, len: 0.34, crossbow: true };

const S2 = Math.SQRT1_2;
const basis = (x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3): THREE.Quaternion => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));

/**
 * The crossbow's picture laid flat for the first-person hand: its stock (the picture's lower left to upper right, where it shoots) points away
 * into the view, the prod runs across, and the picture's face is up; `tilt` raises the muzzle.
 */
function crossbowAim(tilt: number, yaw: number): THREE.Quaternion {
  const q = basis(new THREE.Vector3(S2, 0, -S2), new THREE.Vector3(-S2, 0, -S2), new THREE.Vector3(0, 1, 0));
  // (the hand itself is turned a little to the left by `baseYaw`: the yaw here turns it back, so the muzzle points at the middle of the view)
  return new THREE.Quaternion().setFromAxisAngle(AXIS_Y, yaw).multiply(new THREE.Quaternion().setFromAxisAngle(AXIS_X, tilt)).multiply(q);
}

/**
 * How a figure holds them, in the space of its hand with the arm out in front (the arm's own hanging direction, -y, points ahead; -z is up):
 * the bow upright with its belly forward and the string toward the archer, the crossbow flat with its muzzle ahead. Each also gives the point
 * of its picture (a tile pixel) that sits in the hand, and the turn the picture takes first (the bow's chord is rolled upright).
 */
export const FIGURE_AIM = {
  bow: { q: basis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0)), roll: 0.74, grip: tl(3.1, 3.6), scale: 0.95 },
  crossbow: { q: basis(new THREE.Vector3(S2, -S2, 0), new THREE.Vector3(-S2, -S2, 0), new THREE.Vector3(0, 0, -1)), roll: 0, grip: tl(6, 11), scale: 0.8 },
};

/** The shot just let go, which the bow and the crossbow of one hand share: seconds into the follow-through as 0..1 (1 = none), how far it was drawn, and a crossbow just wound all the way (0..1, 1 = long ago). */
interface Shot {
  t: number;
  pull: number;
  ready: number;
}

const Q = new THREE.Quaternion();
const V_A = new THREE.Vector3();
const V_B = new THREE.Vector3();
const V_C = new THREE.Vector3();

class AimView implements HeldView {
  readonly object = new THREE.Group();
  readonly rest: THREE.Vector3;
  /** The string (two bars that `seg` stretches between two points) and the arrow. */
  private readonly root = new THREE.Group();
  private readonly s1: THREE.Mesh;
  private readonly s2: THREE.Mesh;
  private readonly arrow = new THREE.Group();
  /** The arrow this frame: shown, how far back it is nocked (0..1), seconds in flight (-1 = nocked). */
  private arrowOn = false;
  private nock = 0;
  private flyT = -1;

  constructor(
    private readonly def: AimDef,
    private readonly kit: HeldKit,
    private readonly shot: Shot,
  ) {
    const group = this.object;
    const sprite = kit.models.sprite(tileIndex(def.crossbow ? 'crossbow_frame' : 'bow_frame'));
    group.add(sprite);
    if (def.crossbow) {
      // Held out in front, flat: the stock points away into the view, the prod across it, seen from a little above and behind.
      group.scale.setScalar(0.55);
      group.quaternion.copy(crossbowAim(0.3, 0.45));
      this.rest = new THREE.Vector3(0.1, -0.2, -0.85);
    } else {
      // Held upright in the left of the grip like the original: big, limb vertical, facing forward.
      // The sprite's chord is turned upright and its belly faces away, so the player sees the bow from the side.
      group.scale.setScalar(0.55);
      group.rotation.set(0, -0.8, 0.74);
      this.rest = new THREE.Vector3(0.46, -0.1, -0.9);
    }
    // The string and the arrow sit on the sprite's origin, so tile pixels map straight onto them.
    this.root.position.copy(sprite.position);
    this.s1 = this.bar();
    this.s2 = this.bar();
    this.fillArrow(this.arrow);
    this.arrow.visible = false;
    this.root.add(this.s1, this.s2);
    // The arrow lives in the scene, not on the bow, so it can leave along the line of sight (see `late`).
    kit.scene.add(this.arrow);
    this.string(0);
    group.add(this.root);
  }

  /** The string is a unit-long bar along x that `seg` stretches between two points. */
  private bar(): THREE.Mesh {
    return new THREE.Mesh(this.kit.models.colorBox(1, SLAB * 0.55 * 0.5, SLAB * 0.55, 0xe6e6e6, 0.5), this.kit.models.flat());
  }

  /** The arrow (a bolt for the crossbow): a shaft, a head and fletching, lying along x with its tail at the origin. */
  private fillArrow(into: THREE.Object3D): void {
    const mat = this.kit.models.flat();
    const thick = SLAB * 0.55;
    const L = this.def.len;
    const shaft = this.def.crossbow ? 0x6b4a2a : 0xc8a06a;
    const part = (len: number, h: number, hex: number, at: number): void => {
      const m = new THREE.Mesh(this.kit.models.colorBox(len, h, h * 1.1, hex, len / 2), mat);
      m.position.x = at;
      into.add(m);
    };
    part(L, thick * 0.55, shaft, 0);
    part(L * 0.14, thick * 1.5, 0x9aa0ac, L * 0.9); // the head
    part(L * 0.2, thick * 1.5, this.def.crossbow ? 0xc8463c : 0xe8e8e8, 0); // the fletching
  }

  /**
   * The string and the arrow of a figure's copy of the model (`inner`, a clone of `object`: the picture, then the group of the two bars of the string):
   * returns what draws the string back by `pull` (0..1, may overshoot) and shows or hides the arrow nocked in it.
   */
  rigFigure(inner: THREE.Object3D): (pull: number, arrow: boolean) => void {
    const root = inner.children[1];
    const bars = root ? (root.children as THREE.Mesh[]) : [];
    const arrow = new THREE.Group();
    this.fillArrow(arrow);
    arrow.visible = false;
    root?.add(arrow);
    const { a, b, dir, max } = this.def;
    return (pull, on) => {
      const n: [number, number] = [(a[0] + b[0]) / 2 + dir[0] * max * pull, (a[1] + b[1]) / 2 + dir[1] * max * pull];
      if (bars.length >= 2) {
        this.seg(bars[0], a, n);
        this.seg(bars[1], n, b);
      }
      arrow.visible = on;
      if (on) {
        arrow.position.set(n[0], n[1], 0);
        arrow.rotation.z = Math.atan2(-dir[1], -dir[0]);
      }
    };
  }

  private seg(m: THREE.Mesh, p: [number, number], q: [number, number]): void {
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    m.position.set(p[0], p[1], 0);
    m.rotation.z = Math.atan2(dy, dx);
    m.scale.x = Math.hypot(dx, dy);
  }

  /** The string drawn back by `pull` (0..1, may overshoot). */
  private string(pull: number): void {
    const { a, b, dir, max } = this.def;
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const n: [number, number] = [mx + dir[0] * max * pull, my + dir[1] * max * pull];
    this.seg(this.s1, a, n);
    this.seg(this.s2, n, b);
  }

  /** A figure's bow hangs relaxed and its crossbow is cocked, whatever the first-person one is doing just now. */
  forFigure(): void {
    this.string(this.def.crossbow ? 1 : 0);
  }

  /** Letting go of a draw that would shoot snaps the string, kicks the weapon and sends the arrow off (a crossbow is wound to 1 and then waits). */
  drawn(prev: number, now: number, switching: boolean): void {
    const crossbow = this.def.crossbow;
    if (!switching && now <= 0.001 && prev >= (crossbow ? 0.999 : 0.15)) {
      this.shot.t = 0;
      this.shot.pull = prev;
    }
    if (crossbow && prev < 0.999 && now >= 0.999) this.shot.ready = 0;
  }

  /**
   * The string comes back as the draw grows, the arrow follows it, the weapon trembles at full draw; letting go snaps the string
   * (it rings out), sends the arrow off and kicks the weapon back.
   */
  pose(f: HandFrame): void {
    this.arrowOn = false;
    if (f.switching) return;
    const shot = this.shot;
    const crossbow = this.def.crossbow;
    shot.t = Math.min(1, shot.t + f.dt / 0.55);
    shot.ready = Math.min(1, shot.ready + f.dt / 0.3);
    const t = shot.t * 0.55; // seconds since the shot
    const firing = shot.t < 1;
    const d = f.draw;
    const e = d * d * (3 - 2 * d);
    const kick = firing ? shot.pull * Math.exp(-t * 9) : 0;
    const ready = crossbow && shot.ready < 1 ? Math.sin(shot.ready * Math.PI) : 0;

    // String and arrow.
    let pull = d;
    let arrowOn = crossbow ? d >= 0.35 : d > 0.03;
    if (firing) {
      pull = shot.pull * Math.exp(-t * 14) * Math.cos(t * 48);
      arrowOn = false; // it has left the string: from here on it is the arrow of the world (see MobRenderer), flying the real arc
    }
    this.string(pull);
    this.arrowOn = arrowOn;
    this.nock = firing ? shot.pull : d;
    this.flyT = firing ? t : -1;

    // The weapon itself: drawn in toward the middle with a growing tremble, then thrown back by the shot.
    const shake = d > 0.9 && !crossbow ? Math.sin(f.shakeT) * 0.004 + Math.sin(f.shakeT * 0.37) * 0.003 : 0;
    const pose = crossbow
      ? { x: -0.08 * e, y: 0.03 * e + ready * 0.015, z: 0.03 * e, yaw: 0.1 * e, zk: 0.1, yk: 0.07, pk: 0.22 }
      : { x: -0.2 * e, y: 0.06 * e, z: 0.03 * e, yaw: 0.12 * e, zk: 0.08, yk: 0.03, pk: 0.12 };
    // A left click still swings it (the plain arc, laid over this pose).
    f.pivot.position.set(
      f.rest.x + f.bx + pose.x + shake - kick * 0.02 - f.root * 0.4,
      f.rest.y - f.by - f.down + pose.y + kick * pose.yk + f.lift * 0.2,
      f.rest.z + pose.z + kick * pose.zk - f.lin * 0.2,
    );
    f.pivot.quaternion
      .setFromAxisAngle(AXIS_Y, f.baseYaw + pose.yaw - kick * 0.1 - f.sq * 20 * DEG)
      .multiply(Q.setFromAxisAngle(AXIS_Z, -0.05 * e - f.root * 20 * DEG))
      .multiply(Q.setFromAxisAngle(AXIS_X, kick * pose.pk + (crossbow ? 0 : Math.sin(f.shakeT * 0.5) * 0.004 * e) - f.root * 80 * DEG));
    f.scale = 1 + ready * 0.06;
  }

  /**
   * The arrow, in scene (view) space. Nocked, it lies in the string and points at where the shot will land (the middle of the view).
   * Shot, it leaves for that point along the real flight path (the line of sight, which the game's arrow follows from just in front
   * of the eye), so it flies off into the distance toward the crosshair.
   */
  late(f: HandFrame): void {
    if (!this.arrowOn || f.switching) {
      this.arrow.visible = false;
      return;
    }
    const { a, b, dir, max } = this.def;
    f.pivot.updateMatrixWorld(true);
    this.root.getWorldScale(V_A);
    const size = V_A.x;
    const p = this.nock;
    V_A.set((a[0] + b[0]) / 2 + dir[0] * max * p, (a[1] + b[1]) / 2 + dir[1] * max * p, 0);
    this.root.localToWorld(V_A); // where the string holds the arrow's tail
    const at = (tau: number, out: THREE.Vector3): THREE.Vector3 => {
      const k = 1 - Math.exp(-tau * 9);
      return out.set(V_A.x * (1 - k), V_A.y + (-0.04 - V_A.y) * k, V_A.z - 22 * tau);
    };
    const fly = this.flyT;
    if (fly < 0) {
      V_B.set(0, -0.04, -6).sub(V_A).normalize();
      this.arrow.position.copy(V_A);
    } else {
      at(fly, this.arrow.position);
      V_B.copy(at(fly + 0.01, V_C)).sub(this.arrow.position).normalize();
    }
    this.arrow.quaternion.setFromUnitVectors(AXIS_X, V_B);
    this.arrow.scale.setScalar(size);
    this.arrow.visible = true;
  }

  leave(): void {
    this.arrow.visible = false;
  }

  dispose(): void {
    this.arrow.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
}

/** The builders of the bow and the crossbow of one hand, by item id. */
export function aimBuilders(): Record<number, HeldBuilder> {
  const shot: Shot = { t: 1, pull: 0, ready: 1 };
  return {
    [I.BOW]: (_item: ItemDef, kit: HeldKit) => new AimView(BOW, kit, shot),
    [I.CROSSBOW]: (_item: ItemDef, kit: HeldKit) => new AimView(CROSSBOW, kit, shot),
  };
}
