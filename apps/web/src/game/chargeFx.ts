import * as THREE from 'three';
import type { Fx } from '@solrift/shared';
import { clamp01, type FxEntry, type SpellKit } from './spellFx';
import { Cubes, drawChunks, drawPuffs, EARTH, makeChunks, makePuffs, pal, seeded, srgb, steps, voxelMaterial, type Chunk, type Puff } from './voxelFx';

/**
 * The Warrior's Charge, built entirely of cubes. The mark follows the charger, so (unlike the other cube effects) the pieces that stay
 * behind are given a place in the world when they are born: dust and stones kicked up at the feet, a wall of them thrown back where the
 * run starts, and a skid of them where it stops. Round the body, as long as it runs: long thin bars of light stream back from it, rings
 * of cubes stand upright and rush past, and a chevron of low cubes is pushed along the ground in front of the shield.
 *
 * Everything is placed relative to where the mark was first seen (the group stays there); the charger is `cur` from that point.
 */

const STREAKS = pal(0xfff4d6, 0xffd98a, 0xffffff, 0xffb347);
const WIND = pal(0xfff8ea, 0xffe9bd);
const BOW = pal(0xfff4d6, 0xe6d8b4);
const STONES = EARTH;
const SPARK = srgb(0xffd98a);

/** How much trail is kept (the oldest goes first). */
const MAX_PUFFS = 220;
const MAX_CHUNKS = 90;

const luckOf = (i: number): number => {
  const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/** Drop what has run its course (the list is in order of birth). */
function prune<T extends { delay: number; life: number }>(list: T[], age: number, cap: number): void {
  let n = 0;
  for (const p of list) if (age - p.delay < p.life) list[n++] = p;
  list.length = n;
  if (list.length > cap) list.splice(0, list.length - cap);
}

export function buildCharge(f: Fx, e: FxEntry, kit: SpellKit): FxEntry {
  const g = e.group;
  // (copied: a mark that is the server's own, and moves, must not move the place the pieces are measured from)
  const ox = f.x;
  const oy = f.y;
  const oz = f.z;
  g.position.set(ox, oy, oz);
  const rng = seeded(f.id * 2654435761 + 11);
  const cubes = new Cubes(kit, voxelMaterial(e), 520, g.position);
  g.add(cubes.mesh);
  e.dispose = () => cubes.dispose();

  const target = new THREE.Vector3();
  const cur = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const prev = new THREE.Vector3();
  let dx = 0;
  let dz = -1;
  let known = false;
  let launched = false;
  let skidded = false;
  let lastMove = -1;
  /** 0..1: how much it is running now (the streaks, the rings and the bow wave follow it). */
  let active = 0;
  let puffs: Puff[] = [];
  let chunks: Chunk[] = [];

  e.update = (m) => {
    target.set(m.x - ox, m.y - oy, m.z - oz);
  };

  /** Dust and stones thrown from `from` (relative to the group) along an angle, born at `age`. */
  const kick = (age: number, from: THREE.Vector3, way: number, spread: number, nDust: number, nStones: number, force: number, own = false): void => {
    // (seen from inside the charger, the dust it throws back is smaller and fewer: it flies past the camera)
    const small = own ? 0.5 : 1;
    nDust = own ? Math.ceil(nDust * 0.6) : nDust;
    puffs.push(
      ...makePuffs(rng, { count: nDust, spread: 0.45, speed: [4 * force, 12 * force], up: [1, 3.2], size: [0.18 * small, 0.4 * small], life: [0.3, 0.55], delay: [age, age], y0: from.y, from: [from.x, from.z], way: [way, spread] }),
    );
    if (nStones > 0) {
      chunks.push(
        ...makeChunks(rng, { count: nStones, radius: 0.3, speed: [2 * force, 6 * force], up: [2.5, 5.5], size: [0.07 * small, 0.14 * small], life: [0.4, 0.6], delay: [age, age], colors: STONES, y0: 0.1, floor: from.y, from: [from.x, from.z], way: [way, spread] }),
      );
    }
  };

  e.animate = (_t, age, dt) => {
    if (cur.distanceToSquared(target) > 36) cur.copy(target);
    else if (dt > 0) cur.lerp(target, 1 - Math.exp(-dt * 30));
    // which way it is going, from where it has been
    const mx = target.x - prev.x;
    const mz = target.z - prev.z;
    const l = Math.hypot(mx, mz);
    if (l > 0.03) {
      dx = mx / l;
      dz = mz / l;
      known = true;
      prev.copy(target);
    }
    const back = Math.atan2(-dz, -dx);
    const own = !!kit.viewer && kit.viewer.distanceToSquared(eye.set(g.position.x + cur.x, g.position.y + cur.y + 1.2, g.position.z + cur.z)) < 6.8;
    const fwd = Math.atan2(dz, dx);
    const world = (): [number, number, number] => [g.position.x + cur.x, g.position.y + cur.y, g.position.z + cur.z];

    // running while the mark keeps moving; it has stopped when it has stayed where it is for a moment
    if (l > 0.03) lastMove = age;
    const running = known && age - lastMove < 0.15;
    if (dt > 0) active += ((running ? 1 : 0) - active) * Math.min(1, dt * 16);

    if (known && !launched) {
      launched = true;
      if (age < 0.35) {
        // the wall of dust thrown back where it set off
        kick(age, cur, back, 1.0, 38, 12, 2, own);
        const [wx, wy, wz] = world();
        kit.impact(wx, wy, wz, 0.3);
      }
    }
    if (known && dt > 0 && active > 0.5) {
      const n = Math.max(1, Math.round(dt * 70 * 0.18));
      const from = new THREE.Vector3(cur.x - dx * 0.2, cur.y, cur.z - dz * 0.2);
      kick(age, from, back, 0.9, n * 2, rng() < 0.3 ? 1 : 0, 1, own);
    }
    // the skid where it stops
    if (known && launched && !skidded && !running && age > 0.12) {
      skidded = true;
      active = 0;
      kick(age, cur, fwd, 0.85, 26, 8, 1.3, own);
    }
    prune(puffs, age, MAX_PUFFS);
    prune(chunks, age, MAX_CHUNKS);

    cubes.reset();
    drawPuffs(cubes, puffs, age);
    drawChunks(cubes, chunks, age);

    if (active > 0.02) {
      const yaw = Math.atan2(-dx, -dz);
      const rx = -dz;
      const rz = dx;
      const tick = Math.floor(age * 18);
      const k = active * clamp01(age / 0.06);
      const place = (ahead: number, side: number, up: number): [number, number, number] => [cur.x + dx * ahead + rx * side, cur.y + up, cur.z + dz * ahead + rz * side];

      // long thin bars of light streaming back from the body, their lengths flickering in steps
      for (let i = 0; i < 9; i++) {
        const side = ((i % 3) - 1) * 0.5 + (luckOf(i * 3.1) - 0.5) * 0.25;
        const up = 0.3 + Math.floor(i / 3) * 0.55 + luckOf(i * 7.7) * 0.15;
        const len = (0.9 + 2.1 * luckOf(i * 5.3 + tick * 13.7)) * steps(k, 3);
        const w = 0.07 * steps(k, 2);
        const [x, y, z] = place(-0.5 - len / 2, side, up);
        cubes.put(x, y, z, w, w, len, STREAKS[(i + tick) % STREAKS.length], yaw);
      }
      // rings of cubes that stand upright and rush past, growing as they go
      for (let r = 0; r < (own ? 0 : 3); r++) {
        const phase = (age * 4.5 + r / 3) % 1;
        const ahead = 2.6 - 6.2 * phase;
        const radius = 0.85 + 0.9 * phase;
        const s = 0.17 * steps(Math.sin(phase * Math.PI) * 1.3 * k, 3);
        if (s <= 0) continue;
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2 + r * 0.4;
          const up = 0.95 + Math.sin(a) * radius;
          if (up < 0.1) continue;
          const [x, y, z] = place(ahead, Math.cos(a) * radius, up);
          cubes.put(x, y, z, s, s, s, WIND[(i + r) % 2], yaw);
        }
      }
      // a chevron of low cubes pushed along the ground in front of the shield: two rows, the nearer one brighter
      for (let row = 0; row < 2; row++) {
        for (let j = 0; j < 9; j++) {
          const side = (j - 4) * 0.3;
          const s = (row === 0 ? 0.28 : 0.2) * steps(k * (0.55 + 0.45 * luckOf(j + row * 9 + tick * 5.1)), 3);
          const [x, y, z] = place(1.0 - Math.abs(side) * 0.8 - row * 0.5, side, s / 2 + 0.02);
          cubes.put(x, y, z, s, s, s, BOW[row], yaw);
        }
      }
      // a spark or two off the shield's edge
      if (launched && tick % 2 === 0) {
        const [x, y, z] = place(0.8, (luckOf(tick) - 0.5) * 1.2, 0.5 + luckOf(tick * 1.7) * 0.9);
        cubes.put(x, y, z, 0.09 * steps(k, 2), 0.09 * steps(k, 2), 0.09 * steps(k, 2), SPARK, yaw);
      }
    }
    cubes.done();
  };
  return e;
}
