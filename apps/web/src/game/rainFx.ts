import * as THREE from 'three';
import { ABILITY_BY_ID, type Fx } from '@solrift/shared';
import { clamp01, easeOut, type FxEntry, type SpellKit } from './spellFx';
import { Cubes, drawChunks, makeChunks, pal, seeded, snap, srgb, steps, voxelMaterial } from './voxelFx';

/**
 * The Ranger's Rain of Arrows, built of cubes.
 *  - `buildRainMark`: a ring of green cubes on the ground that sweeps round as it opens, four short arcs turning slowly outside it, and the
 *    arrows themselves: real ones (a light tip, a wooden shaft, green fletching) that fall out of the sky in volleys, each landing as the
 *    server's hit of that volley happens, and stay stuck in the ground, standing a little aslant, until the mark goes. The volleys are timed
 *    from the ability's own table (`delay`, `interval`, `waves`), so the picture and the damage keep step.
 *  - `buildRainHit`: a volley landing on the whole circle at once: a ripple of cubes out across the ground and a few leaves thrown up.
 */

const GREEN = [srgb(0x7fd35a), srgb(0x9be86f)];
const BRIGHT = srgb(0xeaffd8);
const TIP = srgb(0xe6ecf2);
const WOOD = srgb(0xb08a55);
const FLETCH = [srgb(0x59c24a), srgb(0xeef2e8)];
const STREAK = srgb(0xd8ffb0);
const LEAF = pal(0xeaffd8, 0xb8ff8a, 0x7fd35a, 0x4a9e3a);
const FINE = 0.0625;
/** How long an arrow falls, and from how far up it comes. */
const FALL = 0.36;
const DIST = 22;

export function buildRainMark(f: Fx, e: FxEntry, kit: SpellKit): FxEntry {
  const g = e.group;
  const r = Math.max(1.5, f.r);
  const eff = ABILITY_BY_ID.get('rain_of_arrows')?.effect;
  const zone = eff && eff.t === 'zone' ? eff : null;
  const delay = zone?.delay ?? 0.6;
  const interval = zone?.interval ?? 0.5;
  const waves = Math.max(1, Math.min(12, Math.round((e.ttl - 0.4 - delay) / interval + 1)));
  const rng = seeded(f.id * 3571 + 13);

  // for each volley a bunch of arrows, each with where it lands and when
  const PER = Math.max(8, Math.round(r * 3.5));
  const N = waves * PER;
  const arrows = Array.from({ length: N }, (_, i) => {
    const v = Math.floor(i / PER);
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * r * 0.95;
    // the way it comes down, aslant: it stays like that in the ground
    const dir = new THREE.Vector3(0.22 + (rng() - 0.5) * 0.08, -1, 0.12 + (rng() - 0.5) * 0.08).normalize();
    return { lx: Math.cos(a) * d, lz: Math.sin(a) * d, when: delay + v * interval - rng() * 0.1, dir, tone: i % 3 === 0 ? 1 : 0 };
  });
  const ringN = Math.max(24, Math.round((Math.PI * 2 * r) / 0.5));
  const cubes = new Cubes(kit, voxelMaterial(e), 900, g.position);
  g.add(cubes.mesh);
  e.dispose = () => cubes.dispose();

  e.animate = (_t, age) => {
    cubes.reset();
    if (age >= e.ttl) {
      cubes.done();
      return;
    }
    const open = easeOut(age / 0.25);
    const left = steps((e.ttl - age) / 0.4, 3);
    // a flash of the ring at each volley
    let pulse = 0;
    if (age >= delay) {
      const v = Math.min(waves - 1, Math.floor((age - delay) / interval));
      pulse = Math.exp(-(age - delay - v * interval) * 9);
    }
    // the ring, sweeping round as it opens
    const shown = Math.ceil(open * ringN);
    const s = 0.16 * (1 + 0.5 * pulse) * left;
    for (let i = 0; i < shown; i++) {
      const a = (i / ringN) * Math.PI * 2;
      cubes.put(snap(Math.cos(a) * r, FINE), 0.07, snap(Math.sin(a) * r, FINE), s, s * 0.5, s, pulse > 0.5 ? BRIGHT : GREEN[i % 2]);
    }
    // four short arcs turning outside it
    if (open >= 1) {
      const t = 0.12 * left;
      for (let k = 0; k < 4; k++) {
        for (let j = -2; j <= 2; j++) {
          const a = (k * Math.PI) / 2 + age * 0.9 + j * 0.1;
          cubes.put(snap(Math.cos(a) * r * 1.08, FINE), 0.08, snap(Math.sin(a) * r * 1.08, FINE), t, t * 0.5, t, BRIGHT);
        }
      }
    }
    for (const ar of arrows) {
      const L = ar.when;
      if (age < L - FALL) continue;
      const d = ar.dir;
      if (age < L) {
        const u = (age - (L - FALL)) / FALL;
        const back = DIST * (1 - u);
        // the tip is `back` blocks up the way it came from, measured from where it will land
        const tx = ar.lx - d.x * back;
        const ty = -d.y * back;
        const tz = ar.lz - d.z * back;
        cubes.put(tx, ty, tz, 0.11, 0.11, 0.11, TIP);
        for (const k of [0.22, 0.42]) cubes.put(tx - d.x * k, ty - d.y * k, tz - d.z * k, 0.06, 0.2, 0.06, WOOD);
        cubes.put(tx - d.x * 0.62, ty - d.y * 0.62, tz - d.z * 0.62, 0.11, 0.11, 0.11, FLETCH[ar.tone]);
        // a streak of pale cubes behind it
        for (const k of [1, 1.9]) cubes.put(tx - d.x * k, ty - d.y * k, tz - d.z * k, 0.05, 0.5, 0.05, STREAK);
        continue;
      }
      // stuck in the ground: a bit of shaft and the fletching standing out of it, shivering for a moment
      const since = age - L;
      const shake = 0.07 * Math.exp(-since * 9) * Math.sin(since * 55);
      const bx = ar.lx;
      const bz = ar.lz;
      for (const k of [0.14, 0.34]) cubes.put(snap(bx - d.x * k, FINE), k * -d.y, snap(bz - d.z * k, FINE), 0.055 * left, 0.2 * left, 0.055 * left, WOOD);
      cubes.put(snap(bx - d.x * 0.54 + shake, FINE), -d.y * 0.54, snap(bz - d.z * 0.54, FINE), 0.1 * left, 0.1 * left, 0.1 * left, FLETCH[ar.tone]);
    }
    cubes.done();
  };
  return e;
}

/** A volley landing on the whole circle at once: a ripple out across the ground and a few leaves thrown up. */
export function buildRainHit(f: Fx, e: FxEntry, kit: SpellKit): FxEntry {
  const g = e.group;
  const r = Math.max(1.5, f.r);
  const cubes = new Cubes(kit, voxelMaterial(e), 160, g.position);
  g.add(cubes.mesh);
  e.dispose = () => cubes.dispose();
  const rng = seeded(f.id * 1291 + 3);
  const leaves = makeChunks(rng, { count: Math.round(8 + r * 3), radius: r * 0.9, speed: [0.2, 0.8], up: [1.5, 3.5], size: [0.05, 0.1], life: [0.35, 0.6], colors: LEAF, y0: 0.1 });
  const ringN = Math.max(24, Math.round((Math.PI * 2 * r * 0.7) / 0.4));
  if (f.age < 0.25) kit.impact(f.x, f.y, f.z, 0.05);

  e.animate = (t, age) => {
    cubes.reset();
    if (age >= e.ttl) {
      cubes.done();
      return;
    }
    const k = clamp01(t);
    const rr = Math.max(0.1, r * (0.25 + 0.8 * easeOut(k)));
    const s = 0.15 * steps(1 - k, 3);
    for (let i = 0; i < ringN; i++) {
      const a = (i / ringN) * Math.PI * 2;
      cubes.put(snap(Math.cos(a) * rr, FINE), 0.1, snap(Math.sin(a) * rr, FINE), s, s * 0.5, s, k < 0.3 ? BRIGHT : GREEN[i % 2]);
    }
    drawChunks(cubes, leaves, age);
    cubes.done();
  };
  return e;
}
