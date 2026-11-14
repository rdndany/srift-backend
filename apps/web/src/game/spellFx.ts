import * as THREE from 'three';
import type { Fx } from '@solrift/shared';
import { softBall, type FireParticles } from './fireFx';

/**
 * The shared parts of the effects of the big spells (the entry that plays one, the kit of shapes, a few materials) and the speed lines. The Warrior's
 * skills, the Meteor, the Frost Nova and the Arcane Shield are built of cubes (slamFx.ts, bashFx.ts, chargeFx.ts, guardFx.ts, meteorFx.ts, frostFx.ts, arcaneShieldFx.ts).
 * The server decides what happened and sends each mark; this only draws them. Nothing here affects the game.
 */

/** One effect being played: its parts, its age, and how to move them. */
export interface FxEntry {
  group: THREE.Group;
  age: number;
  ttl: number;
  materials: THREE.MeshBasicMaterial[];
  /** Other materials the effect made (sprites, shaders), freed with it. */
  extra: THREE.Material[];
  /** Move the parts for a point in the effect's life (`t` 0..1 of `ttl`), `age` seconds in, `dt` since the last call. */
  animate(t: number, age: number, dt: number): void;
  /** The mark as the server last sent it (its position changes for a shield that follows someone). */
  update?(f: Fx): void;
  /** The effect is over; `early` when the server ended it before its time. */
  onEnd?(early: boolean): void;
  /** Frees what the materials do not (the buffers of an instanced mesh), when the effect is gone. */
  dispose?(): void;
}

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
export const easeOut = (v: number): number => 1 - Math.pow(1 - clamp01(v), 3);
export const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

/** The shapes the big spells share. */
export class SpellKit {
  readonly thin = new THREE.RingGeometry(0.95, 1, 72).rotateX(-Math.PI / 2);
  readonly ring = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
  readonly disc = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
  readonly plane = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  /** A ring standing up (facing +z), for the orbits around a shield. */
  readonly upright = new THREE.RingGeometry(0.97, 1, 72);
  /** A crystal: a five-sided spike standing on the ground, one block tall. */
  readonly spike = new THREE.ConeGeometry(0.5, 1, 5).translate(0, 0.5, 0);
  /** A short bar of the cross-hair of a targeting circle, pointing out from the middle. */
  readonly bar = new THREE.PlaneGeometry(0.06, 0.34).rotateX(-Math.PI / 2).translate(0, 0, -0.86);
  readonly rock: THREE.BufferGeometry;
  /** A fan of a ring flat on the ground, pointing along -z: the cone a Shield Bash hits. */
  readonly fan = new THREE.RingGeometry(0.84, 1, 40, 1, Math.PI / 2 - 0.95, 1.9).rotateX(-Math.PI / 2);
  /** A picture plane (2 x 2, facing +z), for the ghost of a shield. */
  readonly card = new THREE.PlaneGeometry(2, 2);
  /** A unit cube with each face its own shade (vertex colours), for effects built of blocks. */
  readonly voxel: THREE.BufferGeometry;
  /** A unit box. */
  readonly box = new THREE.BoxGeometry(1, 1, 1);
  /** Told when something hits the ground hard, so the screen can shake: where, and how hard (0..1). Set by whoever draws the effects. */
  impact: (x: number, y: number, z: number, strength: number) => void = () => undefined;
  /** Where a player (by name) is drawn this frame, so an effect that stays on someone can be placed on the figure itself and not on the last news of it. Set by whoever draws the effects. */
  locate: (who: string) => { x: number; y: number; z: number } | null = () => null;
  /** Where the camera is, so an effect round the player can get out of their way. */
  viewer: THREE.Vector3 | null = null;

  constructor(readonly fire: FireParticles) {
    // A rough lump: the icosphere pushed in and out by a smooth pattern, each face its own shade of stone.
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const k = 1 + 0.22 * Math.sin(x * 4.1 + 1) * Math.sin(y * 3.7 + 2) * Math.sin(z * 4.9 + 3) + 0.08 * Math.sin(x * 9 + y * 7);
      p.setXYZ(i, x * k, y * k, z * k);
    }
    const colors = new Float32Array(p.count * 3);
    for (let f = 0; f < p.count / 3; f++) {
      const noise = (((Math.sin(f * 12.9898) * 43758.5453) % 1) + 1) % 1;
      const shade = 0.55 + noise * 0.45;
      for (let v = 0; v < 3; v++) {
        colors[(f * 3 + v) * 3] = shade;
        colors[(f * 3 + v) * 3 + 1] = shade * 0.92;
        colors[(f * 3 + v) * 3 + 2] = shade * 0.85;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.rock = g;
    // The crystals shade from deep blue at the root to white at the tip.
    const sp = this.spike.attributes.position as THREE.BufferAttribute;
    const sc = new Float32Array(sp.count * 3);
    for (let i = 0; i < sp.count; i++) {
      const h = Math.min(1, Math.max(0, sp.getY(i)));
      sc[i * 3] = 0.3 + 0.65 * h;
      sc[i * 3 + 1] = 0.62 + 0.38 * h;
      sc[i * 3 + 2] = 0.95 + 0.05 * h;
    }
    this.spike.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    // The cube of the ground effects (see slamFx.ts): each face its own shade, as in the world, so a block reads as a block.
    const v = new THREE.BoxGeometry(1, 1, 1);
    const shades = [0.8, 0.7, 1, 0.5, 0.9, 0.75]; // +x, -x, +y, -y, +z, -z
    const vc = new Float32Array(v.attributes.position.count * 3);
    for (let i = 0; i < v.attributes.position.count; i++) vc.fill(shades[Math.floor(i / 4)], i * 3, i * 3 + 3);
    v.setAttribute('color', new THREE.BufferAttribute(vc, 3));
    this.voxel = v;
  }

  dispose(): void {
    for (const g of [this.thin, this.ring, this.disc, this.plane, this.upright, this.spike, this.bar, this.rock, this.voxel, this.fan, this.card, this.box]) g.dispose();
  }
}

/** An additive material for a part of an effect, registered with the entry so it is freed with it. */
export function glowMat(e: FxEntry, color: number, opacity: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  e.materials.push(m);
  return m;
}

/** A glowing point that always faces the camera. */
export function glowSprite(e: FxEntry, kit: SpellKit, color: number, opacity = 1): THREE.Sprite {
  const m = new THREE.SpriteMaterial({ map: kit.fire.glow, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, fog: false });
  e.extra.push(m);
  const s = new THREE.Sprite(m);
  s.renderOrder = 6;
  return s;
}

export function softMesh(e: FxEntry, kit: SpellKit, color: number, opacity: number, power: number, wobble: number, invert = false): { mesh: THREE.Mesh; mat: THREE.ShaderMaterial } {
  const mat = softBall(color, opacity, power, wobble, invert);
  e.extra.push(mat);
  return { mesh: new THREE.Mesh(kit.fire.sphere, mat), mat };
}

export const setOp = (m: THREE.ShaderMaterial, v: number): void => {
  m.uniforms.uOpacity.value = v;
};

// ---- Speed lines -----------------------------------------------------------------------------------------------------

/** Streaks of light rushing past the camera while its owner charges: thin bars round the edge of the view, flying back. */
export class RushLines {
  readonly group = new THREE.Group();
  private readonly bars: { mesh: THREE.Mesh; phase: number; angle: number; radius: number; speed: number }[] = [];
  private readonly material = new THREE.MeshBasicMaterial({ color: 0xfff4de, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  private readonly geometry = new THREE.BoxGeometry(0.014, 0.014, 1);
  private k = 0;
  private readonly fwd = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();

  constructor() {
    for (let i = 0; i < 34; i++) {
      const mesh = new THREE.Mesh(this.geometry, this.material);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.bars.push({ mesh, phase: Math.random(), angle: rnd(0, Math.PI * 2), radius: rnd(0.55, 2.1), speed: rnd(2.2, 3.4) });
    }
    this.group.visible = false;
  }

  update(dt: number, active: boolean, camera: THREE.Camera): void {
    this.k += ((active ? 1 : 0) - this.k) * Math.min(1, dt * 9);
    this.group.visible = this.k > 0.03;
    if (!this.group.visible) return;
    this.fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    this.material.opacity = 0.42 * this.k;
    for (const b of this.bars) {
      b.phase = (b.phase + dt * b.speed) % 1;
      const dist = 8 * (1 - b.phase) - 1.5;
      b.mesh.position.copy(camera.position).addScaledVector(this.fwd, dist).addScaledVector(this.right, Math.cos(b.angle) * b.radius).addScaledVector(this.up, Math.sin(b.angle) * b.radius * 0.7);
      b.mesh.quaternion.copy(camera.quaternion);
      const fade = Math.sin(b.phase * Math.PI);
      b.mesh.scale.set(1, 1, (1.2 + 1.8 * (1 - b.phase)) * fade + 0.01);
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}