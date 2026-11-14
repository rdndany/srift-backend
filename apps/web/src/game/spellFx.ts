import * as THREE from 'three';
import type { Fx } from '@solrift/shared';
import { softBall, type FireParticles } from './fireFx';

/**
 * How the Mage's big spells look: the Frost Nova (a dome of cold, crystals erupting out of the ground, frost that stays),
 * the Meteor (a targeting circle, a flaming rock coming down at a slant, a crater of fire and smoke) and the Arcane Shield
 * (a bubble of energy that follows its owner, with a magic circle under their feet). The Warrior's skills are built of cubes
 * (slamFx.ts, bashFx.ts, chargeFx.ts, guardFx.ts). The server decides what happened
 * and sends each mark; this only draws them. Nothing here affects the game.
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
  /** A quarter of a ring, for the arcs of a targeting circle. */
  readonly arc = new THREE.RingGeometry(0.9, 1, 24, 1, 0, 1.25).rotateX(-Math.PI / 2);
  /** A crystal: a five-sided spike standing on the ground, one block tall. */
  readonly spike = new THREE.ConeGeometry(0.5, 1, 5).translate(0, 0.5, 0);
  /** A short bar of the cross-hair of a targeting circle, pointing out from the middle. */
  readonly bar = new THREE.PlaneGeometry(0.06, 0.34).rotateX(-Math.PI / 2).translate(0, 0, -0.86);
  readonly rock: THREE.BufferGeometry;
  /** A ring standing up (facing +z), thick enough to read at a distance: a pressure wave rolling forward. */
  readonly pressure = new THREE.RingGeometry(0.86, 1, 56);
  /** A fan of a ring flat on the ground, pointing along -z: the cone a Shield Bash hits. */
  readonly fan = new THREE.RingGeometry(0.84, 1, 40, 1, Math.PI / 2 - 0.95, 1.9).rotateX(-Math.PI / 2);
  /** A picture plane (2 x 2, facing +z), for the ghost of a shield. */
  readonly card = new THREE.PlaneGeometry(2, 2);
  /** A unit cube with each face its own shade (vertex colours), for effects built of blocks. */
  readonly voxel: THREE.BufferGeometry;
  /** A unit box. */
  readonly box = new THREE.BoxGeometry(1, 1, 1);
  /** A tapered beam along +z from 0 to 1: a thin point at the start, wide (radius 1) at the far end. */
  readonly beam = new THREE.CylinderGeometry(1, 0.12, 1, 10, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
  /** An arrow of the Ranger's: tip at the origin, the shaft behind it along -y (one block long), fletching at the tail; each part its own colour. */
  readonly arrow: THREE.BufferGeometry;
  /** The same arrow pointing along +z (tip at the origin, shaft along -z). */
  readonly arrowZ: THREE.BufferGeometry;
  /** A streak of light behind a falling arrow: a point at the origin, a block long along -y, widening backwards. */
  readonly streak = new THREE.CylinderGeometry(0.0, 0.035, 1, 5, 1, true).translate(0, -0.5, 0);
  /** A steel jaw of a bear trap: half a ring in the xy plane (the y > 0 side), hinged on the x axis. */
  readonly jaw = new THREE.RingGeometry(0.7, 1, 28, 1, 0, Math.PI);
  /** A tooth of a trap's jaw, one unit long, base at the origin, pointing along +z. */
  readonly tooth = new THREE.ConeGeometry(0.5, 1, 4).rotateX(Math.PI / 2).translate(0, 0, 0.5);
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
    this.arrow = coloredArrow();
    this.arrowZ = this.arrow.clone().rotateX(Math.PI / 2);
  }

  dispose(): void {
    for (const g of [this.thin, this.ring, this.disc, this.plane, this.upright, this.arc, this.spike, this.bar, this.rock, this.voxel, this.pressure, this.fan, this.card, this.box, this.beam, this.arrow, this.arrowZ, this.streak, this.jaw, this.tooth]) g.dispose();
  }
}

/** One arrow, as a single mesh: a steel head, a wooden shaft and green-and-white fletching, tip at the origin and the shaft along -y. */
function coloredArrow(): THREE.BufferGeometry {
  const parts: { geo: THREE.BufferGeometry; color: [number, number, number] }[] = [
    { geo: new THREE.ConeGeometry(0.075, 0.24, 5).rotateX(0).translate(0, -0.12, 0), color: [0.78, 0.82, 0.86] },
    { geo: new THREE.CylinderGeometry(0.022, 0.022, 0.78, 5).translate(0, -0.63, 0), color: [0.62, 0.45, 0.25] },
    { geo: new THREE.PlaneGeometry(0.16, 0.22).translate(0, -0.9, 0), color: [0.35, 0.82, 0.3] },
    { geo: new THREE.PlaneGeometry(0.16, 0.22).rotateY(Math.PI / 2).translate(0, -0.9, 0), color: [0.92, 0.95, 0.9] },
  ];
  const pos: number[] = [];
  const col: number[] = [];
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    const a = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < a.count; i++) {
      pos.push(a.getX(i), a.getY(i), a.getZ(i));
      col.push(p.color[0], p.color[1], p.color[2]);
    }
    g.dispose();
    if (g !== p.geo) p.geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

/** An additive material for a part of an effect, registered with the entry so it is freed with it. */
export function glowMat(e: FxEntry, color: number, opacity: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  e.materials.push(m);
  return m;
}

/** A material for a flat picture (a magic circle, frost), tinted by `color`. */
function pictureMat(e: FxEntry, map: THREE.Texture, color: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
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

// ---- Frost Nova -------------------------------------------------------------------------------------------------------

interface Crystal {
  mesh: THREE.Mesh;
  x: number;
  z: number;
  delay: number;
  height: number;
  width: number;
  popped: boolean;
}

export function buildFrostNova(f: Fx, e: FxEntry, kit: SpellKit): FxEntry {
  const r = Math.max(1, f.r);
  const g = e.group;
  if (f.age < 0.25) kit.fire.frostBurst(f.x, f.y, f.z, r);

  // The wave: a dome of cold that sweeps out, bright at its rim, and a pale flash at its heart.
  const dome = softMesh(e, kit, 0x9fe8ff, 1, 2.2, 0.04, true);
  const fill = softMesh(e, kit, 0xbfeaff, 0.45, 1.3, 0, false);
  const flash = glowSprite(e, kit, 0xcff4ff, 1);
  flash.position.y = 0.7;
  // Frost on the ground: it spreads with the wave and stays after it.
  const decalMat = pictureMat(e, kit.fire.frost, 0xcdf2ff);
  const decal = new THREE.Mesh(kit.plane, decalMat);
  decal.position.y = 0.05;
  const ringA = new THREE.Mesh(kit.thin, glowMat(e, 0xe4f8ff, 1));
  const ringB = new THREE.Mesh(kit.ring, glowMat(e, 0x7fd0ff, 0.7));
  ringA.position.y = ringB.position.y = 0.12;
  g.add(decal, ringA, ringB, dome.mesh, fill.mesh, flash);

  // Ice crystals thrust out of the ground in three rings, the outer ones a moment after the inner.
  const spikeMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false });
  e.materials.push(spikeMat);
  const crystals: Crystal[] = [];
  for (const [frac, n] of [
    [0.3, 9],
    [0.62, 16],
    [0.93, 23],
  ] as const) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(-0.12, 0.12) + frac * 2;
      const rad = r * frac * rnd(0.9, 1.05);
      const mesh = new THREE.Mesh(kit.spike, spikeMat);
      const lean = rnd(0.05, 0.3);
      mesh.rotation.set(Math.sin(a) * lean, rnd(0, 6), -Math.cos(a) * lean);
      mesh.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad);
      mesh.visible = false;
      g.add(mesh);
      crystals.push({ mesh, x: mesh.position.x, z: mesh.position.z, delay: (rad / r) * 0.3 + rnd(0, 0.06), height: rnd(0.55, 1.3) * (0.7 + 0.5 * frac), width: rnd(0.14, 0.26), popped: false });
    }
  }

  const fadeStart = Math.max(0.5, e.ttl - 0.7);
  e.animate = (_t, age, dt) => {
    const out = easeOut(age / 0.42);
    const alive = 1 - clamp01((age - fadeStart) / (e.ttl - fadeStart));
    // the dome sweeps out and thins
    const dOp = clamp01(1 - (age - 0.12) / 0.55);
    dome.mesh.scale.set(Math.max(0.05, r * 1.02 * out), Math.max(0.05, r * 0.55 * out), Math.max(0.05, r * 1.02 * out));
    setOp(dome.mat, 1.5 * dOp);
    fill.mesh.scale.copy(dome.mesh.scale).multiplyScalar(0.97);
    setOp(fill.mat, 0.5 * dOp * dOp);
    flash.scale.setScalar(r * (0.4 + 1.1 * out));
    flash.material.opacity = 0.6 * clamp01(1 - age / 0.35);
    // the rings
    ringA.scale.setScalar(Math.max(0.05, r * (0.1 + 0.95 * out)));
    glowOpacity(e, ringA, clamp01(1 - age / 0.6));
    ringB.scale.setScalar(Math.max(0.05, r * (0.05 + 0.8 * easeOut(age / 0.55))));
    glowOpacity(e, ringB, 0.7 * clamp01(1 - age / 0.7));
    // the frost on the ground
    decal.scale.setScalar(r * (0.4 + 0.72 * out));
    decal.rotation.y = age * 0.09;
    decalMat.opacity = clamp01(age / 0.18) * 0.9 * alive;
    // the crystals
    spikeMat.opacity = 0.85 * (0.35 + 0.65 * alive);
    for (const c of crystals) {
      const grow = easeOut((age - c.delay) / 0.17);
      const shrink = 1 - easeOut((age - fadeStart) / 0.6);
      const h = c.height * grow * shrink;
      c.mesh.visible = h > 0.02;
      c.mesh.scale.set(c.width * (0.6 + 0.4 * grow), h, c.width * (0.6 + 0.4 * grow));
      if (!c.popped && age >= c.delay) {
        c.popped = true;
        kit.fire.frostEdge(f.x + c.x, f.y, f.z + c.z, 0.15, 2);
      }
    }
    // sparkles along the front of the wave while it spreads
    if (age < 0.5 && dt > 0) kit.fire.frostEdge(f.x, f.y, f.z, r * out, Math.max(1, Math.round(dt * 150)));
  };
  return e;
}

/** Set the opacity of an additive material that belongs to a mesh. */
function glowOpacity(_e: FxEntry, mesh: THREE.Mesh, v: number): void {
  (mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, v);
}

// ---- Meteor ----------------------------------------------------------------------------------------------------------

/** Where a meteor starts, relative to where it lands: it comes in at a slant from high up. */
const METEOR_FROM = new THREE.Vector3(11, 28, 6);

export function buildMeteorWarn(f: Fx, e: FxEntry, kit: SpellKit): FxEntry {
  const r = Math.max(1, f.r);
  const g = e.group;
  const rockSize = 0.8 + r * 0.12;

  // The mark on the ground: a ring, three turning arcs, an inner ring that closes in, a glowing floor and a cross-hair.
  const outer = new THREE.Mesh(kit.thin, glowMat(e, 0xff7a2a, 0.9));
  const inner = new THREE.Mesh(kit.thin, glowMat(e, 0xffb050, 0.7));
  const fill = new THREE.Mesh(kit.disc, glowMat(e, 0xff4a10, 0.1));
  const arcs = new THREE.Group();
  const arcMat = glowMat(e, 0xffd08a, 0.95);
  for (let i = 0; i < 3; i++) {
    const a = new THREE.Mesh(kit.arc, arcMat);
    a.rotation.y = (i / 3) * Math.PI * 2;
    arcs.add(a);
  }
  const bars = new THREE.Group();
  const barMat = glowMat(e, 0xff9a40, 0.6);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(kit.bar, barMat);
    b.rotation.y = (i / 4) * Math.PI * 2;
    bars.add(b);
  }
  const spot = glowSprite(e, kit, 0xff5a1a, 0.3);
  spot.position.y = 0.35;
  for (const m of [outer, inner, fill, arcs, bars]) m.position.y = 0.12;
  g.add(fill, outer, inner, arcs, bars, spot);

  // The meteor: a lump of rock in a shell of heat, with a tail of fire stretched out behind it.
  const sky = new THREE.Group();
  const rockMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x8a6a58 });
  e.extra.push(rockMat);
  const rock = new THREE.Mesh(kit.rock, rockMat);
  rock.scale.set(rockSize, rockSize * 0.9, rockSize * 1.05);
  const heat = softMesh(e, kit, 0xff6a14, 1.1, 1.0, 0.1, true);
  const glow = glowSprite(e, kit, 0xff8a2a, 0.95);
  const halo = glowSprite(e, kit, 0xff3a08, 0.5);
  const aim = new THREE.Group();
  const dir = METEOR_FROM.clone().negate().normalize();
  aim.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  const tail = softMesh(e, kit, 0xff6a10, 0.9, 1.3, 0.15);
  const tailHeart = softMesh(e, kit, 0xffd070, 1.0, 1.1, 0.1);
  tail.mesh.position.z = -rockSize * 3.6;
  tail.mesh.scale.set(rockSize * 0.9, rockSize * 0.9, rockSize * 4);
  tailHeart.mesh.position.z = -rockSize * 1.9;
  tailHeart.mesh.scale.set(rockSize * 0.5, rockSize * 0.5, rockSize * 2.4);
  aim.add(tail.mesh, tailHeart.mesh);
  heat.mesh.scale.setScalar(rockSize * 1.6);
  glow.scale.setScalar(rockSize * 6.5);
  halo.scale.setScalar(rockSize * 12);
  sky.add(halo, glow, aim, heat.mesh, rock);
  g.add(sky);

  const fall = Math.max(0.2, e.ttl - 0.4);
  const last = new THREE.Vector3();
  let first = true;
  e.animate = (_t, age, dt) => {
    const u = clamp01(age / fall);
    const q = 1 - u * u;
    const landed = age >= fall;
    const mark = landed ? clamp01(1 - (age - fall) / 0.4) : 1;
    // the mark on the ground
    arcs.rotation.y = -age * 1.9;
    bars.rotation.y = age * 0.6;
    outer.scale.setScalar(r * (1.04 - 0.04 * Math.sin(age * 10)));
    inner.scale.setScalar(Math.max(0.1, r * (0.95 - 0.5 * u)));
    arcs.scale.setScalar(r * 0.78);
    bars.scale.setScalar(r);
    fill.scale.setScalar(r);
    (outer.material as THREE.MeshBasicMaterial).opacity = 0.9 * mark;
    (inner.material as THREE.MeshBasicMaterial).opacity = (0.5 + 0.4 * u) * mark;
    (fill.material as THREE.MeshBasicMaterial).opacity = (0.08 + 0.34 * u * u) * mark;
    arcMat.opacity = 0.95 * mark;
    barMat.opacity = 0.6 * mark;
    spot.scale.setScalar(r * (1.2 + 1.4 * u));
    spot.material.opacity = (0.25 + 0.5 * u) * mark;
    // the meteor
    sky.visible = !landed;
    const px = METEOR_FROM.x * q;
    const py = METEOR_FROM.y * q + 0.5;
    const pz = METEOR_FROM.z * q;
    sky.position.set(px, py, pz);
    rock.rotation.set(age * 2.6, age * 3.7, age * 1.9);
    const flick = 1 + 0.08 * Math.sin(age * 40) + 0.05 * Math.sin(age * 71);
    glow.scale.setScalar(rockSize * 6.5 * flick);
    heat.mesh.scale.setScalar(rockSize * 1.6 * flick);
    // the fire it throws off, from where it was to where it is
    if (!landed) {
      if (first) {
        last.set(f.x + px, f.y + py, f.z + pz);
        first = false;
      }
      const cx = f.x + px;
      const cy = f.y + py;
      const cz = f.z + pz;
      if (dt > 0) {
        kit.fire.blaze(last.x, last.y, last.z, cx, cy, cz, dir.x, dir.y, dir.z, Math.round(dt * 220), Math.round(dt * 50), Math.round(dt * 45), rockSize * 0.95);
      }
      last.set(cx, cy, cz);
    }
    // embers lifting off the target ground, more of them as it gets close
    if (!landed && dt > 0) kit.fire.groundEmbers(f.x, f.y, f.z, r * 0.9, Math.round(dt * (14 + 60 * u)));
  };
  return e;
}

export function buildMeteorHit(f: Fx, e: FxEntry, kit: SpellKit): FxEntry {
  const r = Math.max(1, f.r);
  const g = e.group;
  if (f.age < 0.3) {
    kit.fire.meteorImpact(f.x, f.y, f.z, r);
    kit.impact(f.x, f.y, f.z, 0.95);
  }

  const ball = softMesh(e, kit, 0xff6a10, 1.2, 1.1, 0.22);
  const core = softMesh(e, kit, 0xffe6a0, 1.8, 0.9, 0.12);
  const halo = glowSprite(e, kit, 0xff6a1a, 0.9);
  halo.position.y = 0.6;
  const wave = new THREE.Mesh(kit.thin, glowMat(e, 0xffc070, 0.95));
  const wave2 = new THREE.Mesh(kit.ring, glowMat(e, 0xff5a10, 0.7));
  wave.position.y = wave2.position.y = 0.15;
  // The scorched ground left behind: a dark patch that fades slowly.
  const scorchMat = new THREE.MeshBasicMaterial({ color: 0x0a0604, transparent: true, opacity: 0, depthWrite: false });
  e.extra.push(scorchMat);
  const scorch = new THREE.Mesh(kit.disc, scorchMat);
  scorch.position.y = 0.04;
  // A glowing crater floor that cools.
  const embers = new THREE.Mesh(kit.disc, glowMat(e, 0xff4a0a, 0.5));
  embers.position.y = 0.07;
  g.add(scorch, embers, wave, wave2, ball.mesh, core.mesh, halo);

  e.animate = (_t, age, dt) => {
    const out = easeOut(age / 0.5);
    const fade = clamp01(1 - age / 0.8);
    ball.mesh.position.y = 0.6 + 0.9 * out;
    ball.mesh.scale.setScalar(Math.max(0.05, r * 1.05 * (0.25 + 0.75 * out)));
    setOp(ball.mat, 1.3 * Math.pow(fade, 1.4));
    core.mesh.position.y = 0.5 + 0.6 * out;
    core.mesh.scale.setScalar(Math.max(0.05, r * 0.62 * (0.2 + 0.8 * Math.sqrt(clamp01(age / 0.6)))));
    setOp(core.mat, Math.max(0, 1.9 * (1 - age / 0.35)));
    wave.scale.setScalar(Math.max(0.05, r * (0.2 + 2.1 * easeOut(age / 0.55))));
    glowOpacity(e, wave, 0.95 * clamp01(1 - age / 0.65));
    wave2.scale.setScalar(Math.max(0.05, r * (0.1 + 1.3 * easeOut(age / 0.45))));
    glowOpacity(e, wave2, 0.7 * clamp01(1 - age / 0.5));
    halo.scale.setScalar(r * (3 + 5 * out));
    halo.material.opacity = 0.9 * Math.pow(clamp01(1 - age / 0.75), 1.6);
    scorch.scale.setScalar(r * (0.55 + 0.45 * out));
    scorchMat.opacity = 0.55 * clamp01(age / 0.15) * clamp01(1 - (age - 0.7) / (e.ttl - 0.7));
    embers.scale.setScalar(r * (0.5 + 0.4 * out));
    glowOpacity(e, embers, 0.5 * clamp01(1 - age / (e.ttl * 0.8)) * (0.8 + 0.2 * Math.sin(age * 30)));
    // fire still licks up from the crater while it cools
    if (dt > 0 && age < e.ttl * 0.7) kit.fire.groundEmbers(f.x, f.y, f.z, r * 0.7, Math.max(0, Math.round(dt * 30 * (1 - age / e.ttl))));
  };
  return e;
}

// ---- Arcane Shield ---------------------------------------------------------------------------------------------------

export function buildArcaneShield(f: Fx, e: FxEntry, kit: SpellKit): FxEntry {
  const g = e.group;
  const fire = kit.fire;
  if (f.age < 0.3) fire.shieldPop(f.x, f.y, f.z);

  // The bubble: bright at its rim, clear in the middle, rippling; and a faint body of light inside it.
  const bubble = softMesh(e, kit, 0x8a7bff, 1, 1.8, 0.035, true);
  const skin = softMesh(e, kit, 0xc8d0ff, 0.5, 3.2, 0.02, true);
  const body = softMesh(e, kit, 0x6a5cff, 0.12, 1, 0.03, false);
  for (const m of [bubble.mesh, skin.mesh, body.mesh]) m.position.y = 0.9;
  // Two rings in orbit, turning against each other, each with a light riding on it.
  const orbitMat = glowMat(e, 0xbfc8ff, 0.55);
  const ringA = new THREE.Mesh(kit.upright, orbitMat);
  const ringB = new THREE.Mesh(kit.upright, orbitMat);
  const tiltA = new THREE.Group();
  const tiltB = new THREE.Group();
  tiltA.add(ringA);
  tiltB.add(ringB);
  tiltA.position.y = tiltB.position.y = 0.9;
  tiltA.rotation.set(1.2, 0, 0.4);
  tiltB.rotation.set(-1.15, 0, -0.5);
  const lights: THREE.Sprite[] = [];
  for (let i = 0; i < 4; i++) {
    const s = glowSprite(e, kit, i % 2 ? 0xffffff : 0xb4a8ff, 1);
    lights.push(s);
    (i < 2 ? ringA : ringB).add(s);
  }
  // A magic circle under their feet.
  const sigilMat = pictureMat(e, fire.rune, 0xa898ff);
  const sigil = new THREE.Mesh(kit.plane, sigilMat);
  sigil.position.y = 0.06;
  const floor = new THREE.Mesh(kit.thin, glowMat(e, 0xcfd6ff, 0.8));
  floor.position.y = 0.08;
  const burst = new THREE.Mesh(kit.thin, glowMat(e, 0xdde4ff, 0.9));
  burst.position.y = 0.9;
  burst.rotation.x = Math.PI / 2;
  g.add(sigil, floor, burst, bubble.mesh, skin.mesh, body.mesh, tiltA, tiltB);
  g.position.set(f.x, f.y, f.z);

  const target = new THREE.Vector3(f.x, f.y, f.z);
  const fadeIn = 0.3;
  const fadeOut = 0.6;
  e.update = (m) => {
    target.set(m.x, m.y, m.z);
  };
  e.animate = (_t, age, dt) => {
    // follow the owner: snap when far (a teleport), glide otherwise so a 20 Hz mark does not stutter
    if (g.position.distanceToSquared(target) > 16) g.position.copy(target);
    else if (dt > 0) g.position.lerp(target, 1 - Math.exp(-dt * 22));
    const inK = easeOut(age / fadeIn);
    const outK = clamp01((e.ttl - age) / fadeOut);
    const k = inK * outK;
    const pulse = 0.85 + 0.15 * Math.sin(age * 5.5);
    const grow = 0.55 + 0.45 * inK + 0.03 * Math.sin(age * 4);
    // the bubble: a little taller than a person
    bubble.mesh.scale.set(1.0 * grow, 1.3 * grow, 1.0 * grow);
    setOp(bubble.mat, 1.15 * k * pulse);
    skin.mesh.scale.set(0.97 * grow, 1.27 * grow, 0.97 * grow);
    skin.mesh.rotation.y = age * 0.8;
    setOp(skin.mat, 0.6 * k);
    body.mesh.scale.set(0.95 * grow, 1.25 * grow, 0.95 * grow);
    setOp(body.mat, 0.2 * k * pulse);
    // the orbits
    ringA.rotation.z = age * 1.7;
    ringB.rotation.z = -age * 2.2;
    tiltA.scale.setScalar(1.12 * grow);
    tiltB.scale.setScalar(1.12 * grow);
    orbitMat.opacity = 0.55 * k;
    lights.forEach((s, i) => {
      const a = (i % 2) * Math.PI;
      s.position.set(Math.cos(a), Math.sin(a), 0);
      s.scale.setScalar(0.3 * (1 + 0.25 * Math.sin(age * 12 + i * 2)));
      s.material.opacity = k;
    });
    // the circle on the ground turns slowly
    sigil.scale.setScalar(1.55 * (0.5 + 0.5 * inK));
    sigil.rotation.y = -age * 0.7;
    sigilMat.opacity = 0.85 * k * (0.8 + 0.2 * Math.sin(age * 3));
    floor.scale.setScalar(1.5 * (0.5 + 0.5 * inK));
    glowOpacity(e, floor, 0.7 * k);
    // the ring thrown out when it goes up
    burst.scale.setScalar(Math.max(0.05, 0.6 + 2.2 * easeOut(age / 0.5)));
    glowOpacity(e, burst, 0.9 * clamp01(1 - age / 0.55));
    // motes shining off its skin
    if (dt > 0 && k > 0.5) {
      const n = Math.round(dt * 45);
      for (let i = 0; i < n; i++) fire.shieldMote(g.position.x, g.position.y, g.position.z, 1);
    }
  };
  e.onEnd = (early) => {
    // Soaked up or gone: it shatters into light. Running out quietly just fades.
    if (early) {
      fire.shieldPop(g.position.x, g.position.y, g.position.z, 70, true);
    }
  };
  return e;
}

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