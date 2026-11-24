import * as THREE from 'three';
import type { ItemDef } from '@solrift/shared';
import { OFF_HELD_DIAGONAL } from './basic';
import type { HandFrame, HeldKit, HeldView } from './view';
/**
 * The Land Surveyor in the first-person hand: a staff with a gem that glows the colour of the verdict (green: it can be bought, amber: a
 * warning, red: refused), that sways while it is held, leans out toward the crosshair while a shape is being marked, is driven into the
 * ground at each corner, plucked up when a corner is taken back, spun when the shape is closed, and raised high at the purchase.
 *
 * What the land is doing reaches the hand through `SurveyorSignals` (see landClient.ts, which writes it, and `HeldItem.surveyor`).
 */

export type SurveyorEvent = 'plant' | 'pluck' | 'seal' | 'claim';
export type SurveyorTone = 'idle' | 'good' | 'warn' | 'bad';

/** What the land tells the hand: whether a shape is being marked, how it looks, and what just happened (a short queue of moments to play). */
export class SurveyorSignals {
  surveying = false;
  tone: SurveyorTone = 'idle';
  private readonly queue: SurveyorEvent[] = [];

  push(e: SurveyorEvent): void {
    // The purchase is the one that matters: it goes before whatever waits. For the rest, a few at most (a hand that is busy does not store up a minute of clicks).
    if (e === 'claim') this.queue.length = 0;
    if (this.queue.length < 3) this.queue.push(e);
  }

  peek(): SurveyorEvent | undefined {
    return this.queue[0];
  }

  take(): SurveyorEvent | undefined {
    return this.queue.shift();
  }

  clear(): void {
    this.queue.length = 0;
  }

  get pending(): number {
    return this.queue.length;
  }
}

/** How a moment moves the hand: how high it lifts (0..1), how far it is thrust down into the ground, how far round it has turned (turns), and the flash of the gem. */
export interface SurveyorMove {
  lift: number;
  thrust: number;
  spin: number;
  flash: number;
}

type Key = readonly [u: number, lift: number, thrust: number, spin: number, flash: number];

const MOMENTS: Record<SurveyorEvent, { dur: number; keys: readonly Key[] }> = {
  // Up and back, then driven down hard: the flash is the stake going in.
  plant: {
    dur: 0.46,
    keys: [
      [0, 0, 0, 0, 0],
      [0.3, 0.6, 0, 0, 0.1],
      [0.5, 0, 1, 0, 1],
      [0.64, 0, 0.8, 0, 0.45],
      [1, 0, 0, 0, 0],
    ],
  },
  // A quick tug upward, the stake coming out.
  pluck: {
    dur: 0.32,
    keys: [
      [0, 0, 0.35, 0, 0],
      [0.35, 1, 0, 0, 0.3],
      [1, 0, 0, 0, 0],
    ],
  },
  // The staff turns once, rising a little, the gem flaring as the shape closes.
  seal: {
    dur: 0.62,
    keys: [
      [0, 0, 0, 0, 0],
      [0.5, 0.45, 0, 0.55, 0.9],
      [1, 0, 0, 1, 0],
    ],
  },
  // The purchase: raised high, turning twice in a gold light, then brought down on the ground like a seal.
  claim: {
    dur: 1.9,
    keys: [
      [0, 0, 0, 0, 0],
      [0.2, 1, 0, 0.3, 0.7],
      [0.7, 1, 0, 1.7, 1],
      [0.84, 0, 1, 2, 1.2],
      [0.93, 0, 0.7, 2, 0.5],
      [1, 0, 0, 2, 0],
    ],
  },
};

export const surveyorMomentLength = (e: SurveyorEvent): number => MOMENTS[e].dur;

const smooth = (x: number): number => x * x * (3 - 2 * x);

/** The moment `e` at `t` seconds in (0 before it starts and after it ends). */
export function surveyorMove(e: SurveyorEvent, t: number): SurveyorMove {
  const m = MOMENTS[e];
  const u = Math.max(0, Math.min(1, t / m.dur));
  const k = m.keys;
  for (let i = 1; i < k.length; i++) {
    if (u > k[i][0] && i < k.length - 1) continue;
    const a = k[i - 1];
    const b = k[i];
    const f = b[0] === a[0] ? 1 : smooth(Math.max(0, Math.min(1, (u - a[0]) / (b[0] - a[0]))));
    return { lift: a[1] + (b[1] - a[1]) * f, thrust: a[2] + (b[2] - a[2]) * f, spin: a[3] + (b[3] - a[3]) * f, flash: a[4] + (b[4] - a[4]) * f };
  }
  return { lift: 0, thrust: 0, spin: 0, flash: 0 };
}

const TONE_COLOR: Record<SurveyorTone | 'gem' | 'gold', THREE.Color> = {
  gem: new THREE.Color(0x70e878),
  idle: new THREE.Color(0xbfe9ff),
  good: new THREE.Color(0x4dff8f),
  warn: new THREE.Color(0xffc04a),
  bad: new THREE.Color(0xff4a4a),
  gold: new THREE.Color(0xffd86a),
};

/** A soft round glow, as pixels (no canvas: the same everywhere, and nothing to draw first). */
function haloTexture(): THREE.DataTexture {
  const n = 32;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - (n - 1) / 2, y - (n - 1) / 2) / (n / 2);
      const a = Math.max(0, 1 - d);
      const v = Math.round(255 * a * a);
      const o = (y * n + x) * 4;
      data[o] = 255;
      data[o + 1] = 255;
      data[o + 2] = 255;
      data[o + 3] = v;
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Where the gem is in the picture (centred on the tile): the middle of the head, a little in front of it. */
const GEM = new THREE.Vector3(6.5 / 16 - 0.5, 0.5 - 3.5 / 16, 0.16);
const SCALE = 0.7;
const REST_LEAN = 0.1;

const Q = new THREE.Quaternion();

export class SurveyorView implements HeldView {
  readonly object = new THREE.Group();
  readonly rest = new THREE.Vector3(0.6, -0.25, -0.85);
  readonly off = OFF_HELD_DIAGONAL;
  private readonly sprite: THREE.Mesh;
  private readonly halo: THREE.Mesh;
  private readonly haloMat: THREE.MeshBasicMaterial;
  private readonly signals: SurveyorSignals;
  private clock = 0;
  private aim = 0;
  private act: { kind: SurveyorEvent; t: number } | null = null;
  private flashing = 0;

  constructor(item: ItemDef, kit: HeldKit) {
    this.signals = kit.surveyor;
    this.sprite = kit.models.sprite(item.tile);
    this.object.add(this.sprite);
    const tex = haloTexture();
    this.haloMat = kit.models.track(new THREE.MeshBasicMaterial({ map: tex, color: TONE_COLOR.gem.clone(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 }));
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.haloMat);
    this.halo.position.copy(GEM);
    this.halo.frustumCulled = false;
    this.halo.renderOrder = 5;
    this.object.add(this.halo);
    this.plain();
  }

  /** The picture as the other hand and a figure carry it: small, still, and with no glow of its own. */
  private plain(): void {
    this.object.scale.setScalar(0.4);
    this.object.rotation.set(0.05, 0.3, 0);
    this.object.position.set(0, 0, 0);
    this.halo.visible = false;
  }

  forFigure(): void {
    this.plain();
  }

  leave(): void {
    this.plain();
    this.act = null;
    this.flashing = 0;
    this.aim = 0;
  }

  /** The moment in progress (for tests and the debug readout). */
  get playing(): SurveyorEvent | null {
    return this.act?.kind ?? null;
  }

  pose(f: HandFrame): void {
    const dt = Math.min(f.dt, 0.1);
    this.clock += dt;
    const s = this.signals;
    this.aim += ((s.surveying ? 1 : 0) - this.aim) * (1 - Math.exp(-dt * 6));

    // The next moment waits for the one in progress (a claim cuts in at once: it is the one that matters).
    if (this.act && s.pending > 0 && this.act.kind !== 'claim' && (s.peek() === 'claim' || this.act.t > MOMENTS[this.act.kind].dur * 0.7)) this.act = null;
    if (!this.act) {
      const e = s.take();
      if (e) this.act = { kind: e, t: 0 };
    }
    let mv: SurveyorMove = { lift: 0, thrust: 0, spin: 0, flash: 0 };
    if (this.act) {
      this.act.t += dt;
      mv = surveyorMove(this.act.kind, this.act.t);
      if (this.act.t >= MOMENTS[this.act.kind].dur) this.act = null;
    }

    const o = this.object;
    const sway = Math.sin(this.clock * 1.6);
    o.scale.setScalar(SCALE);
    o.rotation.set(
      sway * 0.012 - this.aim * 0.3 - mv.thrust * 0.5 + mv.lift * 0.18,
      0.5 + mv.spin * Math.PI * 2,
      REST_LEAN + Math.sin(this.clock * 1.1) * 0.018 - mv.lift * 0.06,
    );
    o.position.set(0, 0, 0);
    const p = f.pivot.position;
    p.x += -this.aim * 0.07 - mv.thrust * 0.05;
    p.y += Math.sin(this.clock * 2.1) * 0.006 + this.aim * 0.04 + mv.lift * 0.14 - mv.thrust * 0.26;
    p.z += -this.aim * 0.04 - mv.thrust * 0.16;

    // The gem: a soft glow in the colour of the verdict, gold at the purchase, flaring with each moment.
    this.flashing = Math.max(mv.flash, this.flashing * Math.exp(-dt * 7));
    const claiming = this.act?.kind === 'claim';
    const target = claiming ? TONE_COLOR.gold : s.surveying ? TONE_COLOR[s.tone] : TONE_COLOR.gem;
    this.haloMat.color.lerp(target, 1 - Math.exp(-dt * 10));
    let glow = 0.55 + 0.17 * Math.sin(this.clock * 2.6) + this.aim * 0.14;
    // A refused shape does not pulse, it stutters.
    if (s.surveying && s.tone === 'bad' && !claiming) glow *= Math.sin(this.clock * 21) > 0.2 ? 1 : 0.55;
    this.haloMat.opacity = Math.max(0, Math.min(1, glow + this.flashing * 0.7));
    this.halo.visible = true;
    this.halo.scale.setScalar(0.5 * (1 + 0.1 * Math.sin(this.clock * 3.1) + this.flashing * 1.1));
  }

  /** After everything has moved the hand: the glow faces the camera whatever way the staff is turned. */
  late(f: HandFrame): void {
    if (!this.halo.visible) return;
    const parent = this.object.parent;
    Q.copy(f.pivot.quaternion);
    if (parent) Q.multiply(parent.quaternion);
    Q.multiply(this.object.quaternion);
    this.halo.quaternion.copy(Q).invert();
  }
}