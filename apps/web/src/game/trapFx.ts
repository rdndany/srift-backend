import * as THREE from 'three';
import type { Fx } from '@solrift/shared';
import { clamp01, easeOut, type FxEntry, type SpellKit } from './spellFx';
import { Cubes, DUST, SPARKS, STONE, drawChunks, drawPuffs, makeChunks, makePuffs, pal, seeded, snap, srgb, steps, voxelMaterial } from './voxelFx';

/**
 * The Ranger's Bear Trap, built of cubes: two half-rings of steel cubes, set with light teeth, hinged on a bar, round a plate of wood.
 *  - `buildBearTrapSet`: the trap is thrown (shut tight, tumbling along an arc from the thrower's hand), bites into the ground with a puff
 *    of earth and its jaws spring open, then lies in wait; now and then a ring of small green cubes spreads out from it to show how far it reaches.
 *  - `buildBearTrapSnap`: the jaws slam shut on whoever stepped in (a clang of sparks, a jolt of dust, a ring over the ground) and hold on.
 * Open the jaws lie flat on the ground; shut they stand up and meet over the bar.
 */

const STEEL = [srgb(0x4c5058), srgb(0x2e3036)];
const TOOTH = srgb(0xd6dae2);
const BAR = srgb(0x2e3036);
const PLATE = srgb(0x8a6a3a);
const GREEN = srgb(0x7fd35a);
const WHITE = srgb(0xffffff);
const DIRT = pal(0x86633f, 0x6e5232, 0x59412a);
const FINE = 0.0625;
/** How many cubes make a jaw and how many teeth it has. */
const JAW = 9;
const TEETH = 6;
/** The most the jaws close (a little short of standing straight up, so they never fall through each other). */
const SHUT = 1.45;

/** A part of the trap, relative to its middle, a block big when the trap is scale 1. */
interface Part {
  x: number;
  y: number;
  z: number;
  size: number;
  color: THREE.Color;
}

/** The trap's cubes with its jaws `c` shut (0 lying flat and open, 1 standing up and shut). */
function trapParts(c: number): Part[] {
  const out: Part[] = [];
  const th = c * SHUT;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  for (const s of [1, -1]) {
    // jaw `s`: it turns about the bar (the x axis), upwards and towards the middle
    const turn = (x: number, y: number, z: number): [number, number, number] => [x, y * cos + z * s * sin, -y * s * sin + z * cos];
    for (let i = 0; i < JAW; i++) {
      const a = (i / (JAW - 1)) * Math.PI;
      const [x, y, z] = turn(Math.cos(a) * 0.9, 0.08, Math.sin(a) * 0.9 * s);
      out.push({ x, y, z, size: 0.17, color: STEEL[i % 2] });
    }
    for (let i = 0; i < TEETH; i++) {
      const a = ((i + 0.5) / TEETH) * Math.PI;
      const [x, y, z] = turn(Math.cos(a) * 0.74, 0.2, Math.sin(a) * 0.74 * s);
      out.push({ x, y, z, size: 0.1, color: TOOTH });
    }
  }
  for (let x = -0.9; x <= 0.91; x += 0.225) out.push({ x, y: 0.07, z: 0, size: 0.12, color: BAR });
  if (c < 0.5) for (const [x, z] of [[0, 0], [0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2]]) out.push({ x, y: 0.05, z, size: 0.16, color: PLATE });
  return out;
}

const euler = new THREE.Euler();
const v = new THREE.Vector3();

/** Draw a trap: its middle at (ox, oy, oz), `scale` times as big, turned about the x axis and then the y axis. */
function drawTrap(cubes: Cubes, parts: readonly Part[], ox: number, oy: number, oz: number, scale: number, spinX = 0, spinY = 0): void {
  euler.set(spinX, spinY, 0);
  for (const p of parts) {
    v.set(p.x, p.y, p.z).multiplyScalar(scale);
    if (spinX !== 0 || spinY !== 0) v.applyEuler(euler);
    const s = p.size * scale;
    cubes.put(snap(ox + v.x, FINE), snap(oy + v.y, FINE), snap(oz + v.z, FINE), s, s, s, p.color);
  }
}

/**
 * A trap thrown and lying in wait: it tumbles through the air in an arc from the thrower's hand (the mark's far end) to where it lands,
 * bites into the ground with a puff of earth and its jaws spring open, then rests there; a ring of small cubes now and then shows its reach.
 */
export function buildBearTrapSet(f: Fx, e: FxEntry, kit: SpellKit): FxEntry {
  const g = e.group;
  const r = Math.max(0.8, f.r);
  const cubes = new Cubes(kit, voxelMaterial(e), 200, g.position);
  g.add(cubes.mesh);
  e.dispose = () => cubes.dispose();
  const rng = seeded(f.id * 4177 + 1);
  const base = r * 0.7;
  const from = f.x2 === undefined || f.y2 === undefined || f.z2 === undefined ? null : new THREE.Vector3(f.x2 - f.x, f.y2 - f.y, f.z2 - f.z);
  const dist = from ? from.length() : 0;
  const flight = from ? Math.min(0.5, Math.max(0.2, 0.16 + dist * 0.02)) : 0;
  const lob = Math.min(3, 0.5 + dist * 0.14);
  let landed = flight === 0 || f.age >= flight;
  const dirt = makePuffs(rng, { count: 8, spread: r * 0.4, speed: [0.8, 2], up: [0.4, 1], size: [0.1, 0.2], life: [0.4, 0.7], delay: [flight, flight + 0.04] });
  const bits = makeChunks(rng, { count: 8, radius: r * 0.3, speed: [0.8, 2.2], up: [2, 4], size: [0.06, 0.12], life: [0.4, 0.7], delay: [flight, flight + 0.04], colors: DIRT });
  const open = trapParts(0);
  const shut = trapParts(1);
  const ringN = 16;

  e.animate = (_t, age) => {
    cubes.reset();
    if (age >= e.ttl) {
      cubes.done();
      return;
    }
    const left = Math.max(0, e.ttl - age);
    const grow = steps(left / 2, 4);
    if (age < flight && from) {
      // in the air: tumbling, shut tight, along an arc
      const u = age / flight;
      drawTrap(cubes, shut, from.x * (1 - u), from.y * (1 - u) + Math.sin(Math.PI * u) * lob + 0.2 * u, from.z * (1 - u), base, u * Math.PI * 5, u * Math.PI * 2);
      cubes.done();
      return;
    }
    if (!landed) {
      landed = true;
      kit.impact(f.x, f.y, f.z, 0.06);
    }
    // the jaws spring open as it lands, with a little overshoot
    const since = age - flight;
    const opening = easeOut(since / 0.2);
    const c = Math.max(0, 1 - opening) + (since > 0.2 ? 0 : 0.05 * Math.sin(opening * Math.PI));
    drawTrap(cubes, c <= 0.001 ? open : trapParts(c), 0, 0.06, 0, base * (1 + 0.12 * Math.exp(-since * 14)) * grow);
    drawPuffs(cubes, dirt, since, DUST);
    drawChunks(cubes, bits, since);
    // a ring of small cubes spreading out now and then, to show how far it reaches
    const k = (since % 2.4) / 1.2;
    if (since > 0.25 && k < 1) {
      const s = 0.09 * steps(1 - k, 3) * grow;
      const rr = r * (0.4 + 0.6 * k);
      for (let i = 0; i < ringN; i++) {
        const a = (i / ringN) * Math.PI * 2 + k;
        cubes.put(snap(Math.cos(a) * rr, FINE), 0.08, snap(Math.sin(a) * rr, FINE), s, s * 0.5, s, GREEN);
      }
    }
    cubes.done();
  };
  return e;
}

/** A trap springing: the jaws slam shut with a clang of sparks and a jolt of dust, and hold on for a moment. */
export function buildBearTrapSnap(f: Fx, e: FxEntry, kit: SpellKit): FxEntry {
  const g = e.group;
  const r = Math.max(0.8, f.r);
  const cubes = new Cubes(kit, voxelMaterial(e), 160, g.position);
  g.add(cubes.mesh);
  e.dispose = () => cubes.dispose();
  const rng = seeded(f.id * 2113 + 7);
  const scale = r * 0.7;
  const clang = 0.1;
  const sparks = makeChunks(rng, { count: 14, radius: 0.3, speed: [1.5, 4], up: [2, 5], size: [0.05, 0.1], life: [0.3, 0.6], delay: [clang, clang + 0.03], colors: SPARKS, y0: 0.3 });
  const dust = makePuffs(rng, { count: 10, spread: r * 0.4, speed: [1, 2.6], up: [0.5, 1.2], size: [0.1, 0.22], life: [0.4, 0.7], delay: [clang, clang + 0.05] });
  const stones = makeChunks(rng, { count: 6, radius: r * 0.3, speed: [0.8, 2], up: [1.5, 3], size: [0.06, 0.11], life: [0.4, 0.7], delay: [clang, clang + 0.05], colors: STONE });
  let clanged = false;
  const ringN = 24;

  e.animate = (_t, age) => {
    cubes.reset();
    if (age >= e.ttl) {
      cubes.done();
      return;
    }
    const c = clamp01(age / clang);
    // it slams shut, and the jaws jump a little as they meet
    const closed = c * c + (age > clang ? 0.04 * Math.exp(-(age - clang) * 14) * Math.sin((age - clang) * 60) : 0);
    const fade = steps((e.ttl - age) / 0.3, 3);
    drawTrap(cubes, trapParts(clamp01(closed)), 0, 0.06, 0, scale * fade);
    if (c >= 1 && !clanged) {
      clanged = true;
      if (age < 0.4) kit.impact(f.x, f.y, f.z, 0.12);
    }
    const since = age - clang;
    drawPuffs(cubes, dust, age, DUST);
    drawChunks(cubes, sparks, age);
    drawChunks(cubes, stones, age);
    // a ring racing out over the ground
    if (since >= 0 && since < 0.35) {
      const k = since / 0.35;
      const rr = r * (0.3 + 0.9 * easeOut(k));
      const s = 0.16 * steps(1 - k * k, 3);
      for (let i = 0; i < ringN; i++) {
        const a = (i / ringN) * Math.PI * 2;
        cubes.put(snap(Math.cos(a) * rr, FINE), 0.1, snap(Math.sin(a) * rr, FINE), s, s * 0.5, s, k < 0.3 ? WHITE : TOOTH);
      }
    }
    cubes.done();
  };
  return e;
}

