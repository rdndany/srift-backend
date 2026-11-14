import * as THREE from 'three';
import type { Fx } from '@solrift/shared';
import type { FxEntry, SpellKit } from './spellFx';
import { Cubes, DUST, drawPuffs, makePuffs, pal, seeded, snap, steps, voxelMaterial, type Puff } from './voxelFx';

/**
 * The Ranger's Evasive Roll, built of cubes. The server sends one mark for the whole way (from where the roll began to where it ended).
 *  - Leaves and specks of green are shaken loose along the way: each appears where the ranger passes, drifts up and a little aside, and
 *    shrinks away in steps.
 *  - A few long thin streaks of wind hang beside the way, one after another, and go out.
 *  - Dust kicked up where the roll began and where it ended.
 * The cubes that would be in front of the camera are made smaller by `Cubes`, so the roller's own view stays clear.
 */

const LEAF = pal(0xeaffd8, 0xb8ff8a, 0x7fd35a, 0x4a9e3a);
const WIND = pal(0xffffff, 0xeaffd8);
const FINE = 0.0625;
/** The roll's own speed (see the ability's table): it takes about len / SPEED seconds. */
const SPEED = 18;
const LEAF_LIFE = 0.5;
const STREAK_LIFE = 0.3;

export function buildEvasiveRoll(f: Fx, e: FxEntry, kit: SpellKit): FxEntry {
  const g = e.group;
  if (f.x2 === undefined || f.y2 === undefined || f.z2 === undefined) return e;
  const dx = f.x2 - f.x;
  const dz = f.z2 - f.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.3) return e;
  const dir = new THREE.Vector3(dx / len, 0, dz / len);
  const right = new THREE.Vector3(-dir.z, 0, dir.x);
  const yaw = Math.atan2(dir.x, dir.z);
  const rise = f.y2 - f.y;
  // the effect stands on the ground where the roll began (the mark is at the height of the body)
  g.position.set(f.x, f.y - 0.9, f.z);
  const cubes = new Cubes(kit, voxelMaterial(e), 160, g.position);
  g.add(cubes.mesh);
  e.dispose = () => cubes.dispose();
  const rng = seeded(f.id * 6151 + 9);

  const M = Math.max(10, Math.min(56, Math.round(len * 7)));
  const leaves = Array.from({ length: M }, (_, i) => {
    const d = (len * (i + rng())) / M;
    return { d, side: (rng() * 2 - 1) * 0.5, h: 0.15 + rng() * 1.15, drift: (rng() * 2 - 1) * 0.5, size: 0.1 + rng() * 0.08, tone: Math.floor(rng() * 4), born: d / SPEED };
  });
  const streaks = Array.from({ length: 6 }, (_, i) => ({
    d: len * (0.25 + 0.12 * i + rng() * 0.05),
    side: (rng() < 0.5 ? -1 : 1) * (0.35 + rng() * 0.3),
    h: 0.3 + rng() * 1,
    l: 0.9 + rng() * 0.5,
    born: 0,
  }));
  for (const s of streaks) s.born = s.d / SPEED;
  const dust: Puff[] = [
    ...makePuffs(rng, { count: 10, spread: 0.4, speed: [1.2, 3], up: [0.6, 1.4], size: [0.1, 0.2], life: [0.4, 0.7], delay: [0, 0.05] }),
    ...makePuffs(rng, { count: 10, spread: 0.4, speed: [1.2, 3], up: [0.6, 1.4], size: [0.1, 0.2], life: [0.4, 0.7], delay: [len / SPEED, len / SPEED + 0.05], from: [dx, dz], y0: rise }),
  ];

  e.animate = (_t, age) => {
    cubes.reset();
    if (age >= e.ttl) {
      cubes.done();
      return;
    }
    drawPuffs(cubes, dust, age, DUST);
    const h = (d: number): number => rise * (d / len);
    for (const l of leaves) {
      const t = age - l.born;
      if (t < 0 || t >= LEAF_LIFE) continue;
      const k = t / LEAF_LIFE;
      const s = l.size * steps(1 - k * k, 3);
      const side = l.side + l.drift * k;
      cubes.put(snap(dir.x * l.d + right.x * side, FINE), snap(h(l.d) + l.h + 0.45 * k, FINE), snap(dir.z * l.d + right.z * side, FINE), s, s, s, LEAF[l.tone], l.d * 3);
    }
    for (const w of streaks) {
      const t = age - w.born;
      if (t < 0 || t >= STREAK_LIFE) continue;
      const k = steps(1 - t / STREAK_LIFE, 3);
      cubes.put(snap(dir.x * w.d + right.x * w.side, FINE), snap(h(w.d) + w.h, FINE), snap(dir.z * w.d + right.z * w.side, FINE), 0.06 * k, 0.06 * k, w.l * k, WIND[t < 0.08 ? 0 : 1], yaw);
    }
    cubes.done();
  };
  return e;
}
