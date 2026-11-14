import * as THREE from 'three';
import { MOUNT_HOWL, type Fx } from '@solrift/shared';
import { mountLook } from './mountFx';
import { clamp01, easeOut, type FxEntry, type SpellKit } from './spellFx';
import { makeChunks, drawChunks, seeded, steps } from './voxelFx';
import { drawBolt, drawPatch, drawStreak, drawWave, makeBolt, makePatch, stage, tonesOf, type Bolt, type Tones } from './voxelLight';

/**
 * What a Fenrir's two skills look like, in cubes like the rest of the cube effects and in the colours of the mount's own light (see `mountLook`; the
 * black one's is red, the blue one's cold blue, the gold one's gold). A Fenrir is a wolf of lightning, so neither is a ball of magic: the Rending
 * Bite (left button) is a set of jaws of cubes that slam shut in front of it, lightning leaping between the teeth and a fan of cubes laid over the
 * ground ahead of it; the Thunder Howl (right button) is only ever seen on its target: the ground it will strike is ringed with cubes that close in
 * and static that jumps up from it, and then bolts of cubes come down, with a flash, shock rings, scorched earth and sparks. The server decides what
 * happened and sends each mark; this only draws them. Nothing here affects the game.
 */

const toneOf = (f: Fx): Tones => tonesOf(mountLook(f.mount ?? 'fenrir'));

const hash = (a: number, b: number): number => {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

// ---- the Thunder Howl: the ground it will strike ----------------------------------------------------------------------

export function buildThunderWarn(f: Fx, e: FxEntry, kit: SpellKit): FxEntry {
  const r = Math.max(1.5, f.r);
  const tone = toneOf(f);
  const cubes = stage(e, kit, 760);
  // The first strike lands this long after the mark shows, and the storm goes on for the strikes after it.
  const wait = MOUNT_HOWL.delay;
  const storm = (MOUNT_HOWL.strikes - 1) * MOUNT_HOWL.interval;
  const seed = f.id * 7919 + 5;

  e.animate = (_t, age) => {
    const u = clamp01(age / wait);
    const done = age >= wait + storm ? steps(1 - (age - wait - storm) / 0.4, 3) : 1;
    cubes.reset();
    if (done > 0) {
      // The ring on the ground, breathing a little.
      const outer = r * (1.03 - 0.03 * Math.sin(age * 14));
      const nOuter = Math.max(12, Math.round((Math.PI * 2 * outer) / 0.32));
      const s = 0.2 * done;
      for (let i = 0; i < nOuter; i++) {
        const a = (i / nOuter) * Math.PI * 2;
        cubes.put(Math.cos(a) * outer, 0.1, Math.sin(a) * outer, s, s * 0.6, s, i % 2 === 0 ? tone.mid : tone.deep, a);
      }
      // A ring that closes in on the middle as the strike gets near.
      const inner = Math.max(0.3, r * (0.95 - 0.55 * u));
      const nInner = Math.max(8, Math.round((Math.PI * 2 * inner) / 0.3));
      const si = 0.16 * done;
      for (let i = 0; i < nInner; i++) {
        const a = (i / nInner) * Math.PI * 2;
        cubes.put(Math.cos(a) * inner, 0.12, Math.sin(a) * inner, si, si * 0.6, si, tone.pale, a);
      }
      // Four arcs turning against the spokes, and the spokes: a cross of rows of cubes.
      for (let arc = 0; arc < 4; arc++) {
        for (let j = 0; j < 6; j++) {
          const a = (arc / 4) * Math.PI * 2 - age * 2.2 + j * 0.09;
          cubes.put(Math.cos(a) * r * 0.8, 0.14, Math.sin(a) * r * 0.8, 0.15 * done, 0.1, 0.15 * done, tone.white, a);
        }
      }
      const perSpoke = Math.max(3, Math.round((r * 0.85) / 0.5));
      for (let sp = 0; sp < 8; sp++) {
        const a = (sp / 8) * Math.PI * 2 + age * 0.7;
        for (let j = 0; j < perSpoke; j++) {
          const d = r * (0.18 + (0.8 * j) / perSpoke);
          cubes.put(Math.cos(a) * d, 0.08, Math.sin(a) * d, 0.11 * done, 0.07, 0.11 * done, tone.deep, a);
        }
      }
      // Static jumping up off the ground: more and more of it as the strike gets near, each a short stack of cubes that shows a moment.
      const slot = Math.floor(age / 0.12);
      const jets = 2 + Math.round(5 * u);
      if ((age / 0.12) % 1 < 0.75) {
        for (let i = 0; i < jets; i++) {
          const a = hash(slot + seed, i) * Math.PI * 2;
          const d = r * Math.sqrt(hash(slot + seed, i + 9)) * 0.9;
          const height = 1.4 + 2 * hash(slot, i + 3);
          for (let j = 0; j * 0.4 < height; j++) {
            const sway = (hash(slot + i, j) - 0.5) * 0.35 * (j / 3);
            const sj = 0.1 * (1 - j * 0.08);
            cubes.put(Math.cos(a) * d + sway, 0.2 + j * 0.4, Math.sin(a) * d - sway, sj, 0.3, sj, j % 2 === 0 ? tone.white : tone.pale);
          }
        }
      }
      // Cubes standing up off the edge of the ring and climbing, and the more the nearer the strike.
      for (let i = 0; i < 30; i++) {
        if (hash(i, seed) >= 0.3 + 0.7 * u) continue;
        const ph = (age * (1.2 + u) + hash(i, 3)) % 1;
        const a = (i / 30) * Math.PI * 2;
        const m = 0.11 * steps(Math.sin(ph * Math.PI) * 1.6, 3) * done;
        cubes.put(Math.cos(a) * r * 0.97, 0.2 + ph * (1.2 + hash(i, 5) * 1.6), Math.sin(a) * r * 0.97, m, m, m, tone.mid);
      }
    }
    cubes.done();
  };
  return e;
}

// ---- the Thunder Howl: a strike -----------------------------------------------------------------------------------------

export function buildThunderHit(f: Fx, e: FxEntry, kit: SpellKit): FxEntry {
  const r = Math.max(1.5, f.r);
  const tone = toneOf(f);
  const cubes = stage(e, kit, 1000);
  const rng = seeded(f.id * 104729 + 11);
  if (f.age < 0.3) kit.impact(f.x, f.y, f.z, 0.6);

  // The bolts: one great one down the middle (it arrives a touch crooked, from high up), a pair of forks off it and a few more striking round it
  // a moment later, so a strike is a burst of lightning and not a single line.
  const bolts: Bolt[] = [makeBolt(rng, 0, 0, 13, 0.42, 0, 0.38, 1.0, [(rng() - 0.5) * 3, (rng() - 0.5) * 3])];
  for (let i = 0; i < 2; i++) {
    const a = rng() * Math.PI * 2;
    const d = r * (0.5 + rng() * 0.45);
    bolts.push(makeBolt(rng, Math.cos(a) * d, Math.sin(a) * d, 8, 0.2, 0, 0.3, 0.8, [(rng() - 0.5) * 2, (rng() - 0.5) * 2]));
  }
  for (let i = 0; i < 3; i++) {
    const a = rng() * Math.PI * 2;
    const d = r * (0.3 + rng() * 0.55);
    bolts.push(makeBolt(rng, Math.cos(a) * d, Math.sin(a) * d, 11, 0.16, 0.04 + rng() * 0.16, 0.26, 0.7, [(rng() - 0.5) * 8, (rng() - 0.5) * 8]));
  }
  const patch = makePatch(rng, r * 0.95);
  const sparks = makeChunks(rng, { count: 40, radius: r * 0.5, speed: [1.5, 4.5], up: [2.5, 6], size: [0.1, 0.2], life: [0.7, 1.2], delay: [0, 0.1], colors: [tone.mid, tone.pale, tone.white, tone.deep], y0: 0.3 });

  e.animate = (_t, age) => {
    cubes.reset();
    // The scorched earth that stays, spreading from the middle and shrinking away at the end.
    const out = easeOut(age / 0.5);
    drawPatch(cubes, patch, r * (0.45 + 0.55 * out), tone.dark, age > e.ttl - 0.4 ? steps((e.ttl - age) / 0.4, 3) : 1);
    // The flash: a white block that bursts and is gone in a quarter of a second.
    const flash = steps(1 - age / 0.25, 3);
    if (flash > 0) cubes.put(0, 0.7, 0, Math.min(1.8, r * 0.45) * flash, Math.min(1.8, r * 0.45) * flash, Math.min(1.8, r * 0.45) * flash, tone.white);
    drawWave(cubes, r * (0.2 + 1.9 * easeOut(age / 0.5)), age, 0.55, 0.32, [tone.white, tone.pale]);
    drawWave(cubes, r * (0.1 + 1.2 * easeOut(age / 0.4)), age, 0.45, 0.26, [tone.mid, tone.pale, tone.mid, tone.deep]);
    drawChunks(cubes, sparks, age);
    for (const b of bolts) drawBolt(cubes, tone, b, age);
    cubes.done();
  };
  return e;
}

// ---- the Rending Bite -------------------------------------------------------------------------------------------------

/** The teeth in each row of the jaws, and how wide the jaws open (in blocks). */
const TEETH = 7;
const GAPE = 1.0;

export function buildFang(f: Fx, e: FxEntry, kit: SpellKit): FxEntry {
  if (f.x2 === undefined || f.z2 === undefined) return e;
  const tone = toneOf(f);
  const cubes = stage(e, kit, 520);
  const range = Math.max(2, f.r);
  let dx = f.x2 - f.x;
  let dz = f.z2 - f.z;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  const yaw = Math.atan2(-dx, -dz);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  // Where the jaws shut: in front of the mount, about as high as its head is when it lunges.
  const reach = Math.min(range * 0.6, 3.6);
  const mouth = new THREE.Vector3(dx * reach, 1.15, dz * reach);
  if (f.age < 0.3) kit.impact(f.x + mouth.x, f.y, f.z + mouth.z, 0.12);
  const rng = seeded(f.id * 2654435 + 1);
  const dir = Math.atan2(dz, dx);

  // Where a tooth stands on the arc across the front of the mount (turned by the way the mount faces).
  const spot = (a: number): [number, number] => {
    const lx = Math.sin(a) * 1.2;
    const lz = -Math.cos(a) * 1.2 + 1.2;
    return [mouth.x + lx * cy + lz * sy, mouth.z - lx * sy + lz * cy];
  };
  // Three streaks of lightning fly out from the teeth, one straight ahead and one to each side, and short ones jump between the teeth as they meet.
  const kinks = (): Float32Array => Float32Array.from({ length: 16 }, () => rng() - 0.5);
  const streaks = [-0.7, 0, 0.7].map((turn) => {
    const a = yaw + turn;
    return { from: mouth.clone(), to: mouth.clone().add(new THREE.Vector3(-Math.sin(a) * range * 0.7, (rng() - 0.5) * 0.7 - 0.15, -Math.cos(a) * range * 0.7)), kinks: kinks() };
  });
  const jumps = [0, 1, 2, 3].map((i) => {
    const [px, pz] = spot(((i / 3) * 2 - 1) * 0.8);
    return { from: new THREE.Vector3(px, mouth.y + 0.7, pz), to: new THREE.Vector3(px, mouth.y - 0.7, pz), kinks: kinks() };
  });
  // Sparks thrown forward as the jaws shut.
  const sparks = makeChunks(rng, { count: 26, radius: 0.3, speed: [2, 5], up: [1, 3], size: [0.07, 0.14], life: [0.5, 0.9], delay: [0.08, 0.14], colors: [tone.mid, tone.pale, tone.white], y0: mouth.y, from: [mouth.x, mouth.z], way: [dir, 0.7] });

  e.animate = (_t, age) => {
    cubes.reset();
    // The jaws open wide, then shut hard at 0.1 s (fast at the end, like a snap), and stay a moment while they fade.
    const shut = clamp01(age / 0.1);
    const open = GAPE * (1 - shut * shut * shut);
    const fade = clamp01(1 - (age - 0.15) / (e.ttl - 0.15));
    const k = steps(Math.min(1, fade * 1.5), 3);
    if (k > 0) {
      for (const upper of [true, false]) {
        const gum = mouth.y + (upper ? 0.14 + open : -0.14 - open);
        // the lower row is shifted half a tooth, so the teeth fit between the others when the jaws shut
        for (let i = 0; i < (upper ? TEETH : TEETH - 1); i++) {
          const a = (((i + (upper ? 0 : 0.5)) / (TEETH - 1)) * 2 - 1) * 0.95;
          const [px, pz] = spot(a);
          // the ones in the middle (the fangs) are long, the ones at the corners short
          const size = 0.34 + 0.5 * Math.cos(a * 1.4) ** 2;
          const n = size > 0.7 ? 4 : size > 0.5 ? 3 : 2;
          for (let j = 0; j < n; j++) {
            const s = 0.2 * (1 - 0.2 * j) * k;
            cubes.put(px, gum + (upper ? -1 : 1) * (0.1 + j * 0.17), pz, s, 0.17 * k, s, tone.white, yaw);
          }
          // the gum between the teeth
          cubes.put(px, gum, pz, 0.2 * k, 0.1 * k, 0.2 * k, tone.deep, yaw);
        }
      }
    }
    // A fan laid on the ground the width of the bite, running out to the end of its reach.
    if (age < 0.45) {
      const sweep = easeOut(age / 0.25);
      const left = steps(1 - age / 0.45, 3);
      const size = 0.15 * left;
      [0.35, 0.65, 1].forEach((frac, row) => {
        const radius = range * frac * (0.35 + 0.65 * sweep);
        const n = Math.max(4, Math.ceil((0.95 * 2 * radius) / 0.3));
        for (let i = 0; i < n; i++) {
          const a = dir + ((i / (n - 1)) * 2 - 1) * 0.95;
          cubes.put(Math.cos(a) * radius, 0.14, Math.sin(a) * radius, size, size * 0.6, size, row === 2 ? tone.mid : row === 1 ? tone.pale : tone.deep, a);
        }
      });
    }
    // The streaks leap out from the teeth, the short ones between them, and a white block flashes where the jaws meet.
    if (age >= 0.1 && age < 0.26) {
      const left = steps((0.26 - age) / 0.1, 3);
      for (const s of streaks) drawStreak(cubes, s.from, s.to, s.kinks, (age - 0.1) / 0.06, 0.1 * left, tone.white, tone.mid);
      const flash = 0.55 * steps(1 - (age - 0.1) / 0.16, 3);
      if (flash > 0) cubes.put(mouth.x, mouth.y, mouth.z, flash, flash, flash, tone.white);
    }
    if (age >= 0.1 && age < 0.22) {
      const left = steps((0.22 - age) / 0.12, 3);
      for (const j of jumps) drawStreak(cubes, j.from, j.to, j.kinks, 1, 0.09 * left, tone.pale, tone.white);
    }
    drawChunks(cubes, sparks, age);
    cubes.done();
  };
  return e;
}
