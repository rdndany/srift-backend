import * as THREE from 'three';
import type { Fx } from '@solrift/shared';
import { easeOut, type FxEntry, type SpellKit } from './spellFx';
import { Cubes, drawChunks, makeChunks, pal, seeded, snap, srgb, steps, voxelMaterial } from './voxelFx';

/**
 * The Ranger's Piercing Shot, built of cubes. The server sends one mark for the whole line (from the bow to where it ended).
 *  - The arrow races down the line in a blink (a bright tip, a wooden shaft, green fletching), leaving a tracer of small green cubes behind
 *    it that goes out from the bow end first, in steps.
 *  - Square rings of cubes open round the line where it passed (not near the bow, so they do not fill the archer's view).
 *  - If it struck something (it did not run its whole length) a flash and a few sparks jump from the end.
 * The cubes are laid out from the age alone, along the line, whatever way it points.
 */

const GREEN = pal(0xeaffd8, 0xb8ff8a, 0x7fd35a, 0x4fd04a);
const SPARK = pal(0xffffff, 0xd8ffb8, 0x9aff70);
const WHITE = srgb(0xffffff);
const WOOD = srgb(0xb08a55);
const FLETCH = srgb(0x59c24a);
const FINE = 0.0625;
/** How long the arrow takes down the line. */
const TRAVEL = 0.09;
/** The gap between cubes of the tracer, and how far from the bow it starts. */
const GAP = 0.32;
const SKIP = 2;
const RINGS = 5;
const RING_LIFE = 0.35;

export function buildPiercingShot(f: Fx, e: FxEntry, kit: SpellKit): FxEntry {
  const g = e.group;
  if (f.x2 === undefined || f.y2 === undefined || f.z2 === undefined) return e;
  const from = new THREE.Vector3(f.x, f.y, f.z);
  const to = new THREE.Vector3(f.x2, f.y2, f.z2);
  const len = from.distanceTo(to);
  if (len < 0.05) return e;
  g.position.copy(from);
  const dir = to.clone().sub(from).normalize();
  // two ways across the line, for the rings
  const side = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) > 0.98 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
  const upv = new THREE.Vector3().crossVectors(side, dir).normalize();

  const cubes = new Cubes(kit, voxelMaterial(e), 220, g.position);
  g.add(cubes.mesh);
  e.dispose = () => cubes.dispose();
  const rng = seeded(f.id * 7919 + 5);

  // the tracer: a cube every GAP along the line, from where it leaves the bow
  const tracer: { d: number; born: number; off: number; size: number; tone: number }[] = [];
  for (let d = SKIP, i = 0; d < len; d += GAP, i++) {
    tracer.push({ d, born: (d / len) * TRAVEL, off: 0.08 + 0.26 * (d / len), size: i % 3 === 0 ? 0.14 : 0.1, tone: 2 + (i % 2) });
  }
  // what is thrown where it struck
  const struck = len < 31.5;
  const sparks = struck ? makeChunks(rng, { count: 14, radius: 0.15, speed: [1, 3.5], up: [1.5, 4], size: [0.05, 0.1], life: [0.3, 0.5], delay: [TRAVEL, TRAVEL + 0.03], colors: SPARK, y0: 0, floor: to.y - from.y - 0.3, from: [to.x - from.x, to.z - from.z] }) : [];

  /** A cube `d` along the line and `a`/`b` across it. */
  const at = (d: number, a: number, b: number, size: number, color: THREE.Color): void => {
    cubes.put(snap(dir.x * d + side.x * a + upv.x * b, FINE), snap(dir.y * d + side.y * a + upv.y * b, FINE), snap(dir.z * d + side.z * a + upv.z * b, FINE), size, size, size, color);
  };

  e.animate = (_t, age) => {
    cubes.reset();
    if (age >= e.ttl) {
      cubes.done();
      return;
    }
    // the tracer
    for (const c of tracer) {
      if (age < c.born) continue;
      const k = age < c.off ? 1 : steps((c.off + 0.14 - age) / 0.14, 3);
      if (k <= 0) continue;
      at(c.d, 0, 0, c.size * k, age < c.born + 0.1 ? WHITE : GREEN[c.tone]);
    }
    // the arrow itself at the head of it
    const head = age / TRAVEL;
    if (head < 1) {
      const d = len * head;
      at(d, 0, 0, 0.24, WHITE);
      for (const back of [0.22, 0.4, 0.58]) at(d - back, 0, 0, 0.11, WOOD);
      at(d - 0.76, 0, 0, 0.18, FLETCH);
    }
    // rings opening where it passed
    for (let i = 1; i <= RINGS; i++) {
      const d = (len * i) / (RINGS + 1);
      if (d < 5) continue;
      const a = age - (d / len) * TRAVEL;
      if (a < 0 || a >= RING_LIFE) continue;
      const r = 0.2 + 0.7 * easeOut(a / RING_LIFE);
      const s = 0.1 * steps(1 - a / RING_LIFE, 3);
      for (let j = 0; j < 8; j++) {
        const t = (j / 8) * Math.PI * 2 + i;
        at(d, Math.cos(t) * r, Math.sin(t) * r, s, GREEN[1]);
      }
    }
    // where it struck
    if (struck) {
      const since = age - TRAVEL;
      if (since >= 0 && since < 0.15) {
        const s = 0.4 * steps(1 - since / 0.15, 3);
        cubes.put(snap(to.x - from.x, FINE), snap(to.y - from.y, FINE), snap(to.z - from.z, FINE), s, s, s, since < 0.07 ? WHITE : GREEN[0]);
      }
      drawChunks(cubes, sparks, age);
    }
    cubes.done();
  };
  return e;
}
