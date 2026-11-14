import * as THREE from 'three';
import type { Fx } from '@solrift/shared';
import { clamp01, easeOut, type FxEntry, type SpellKit } from './spellFx';
import { Cubes, EARTH, FLASH, PALE, SPARKS, STONE, between, drawChunks, drawPuffs, makeChunks, makePuffs, pal, seeded, snap, steps, voxelMaterial } from './voxelFx';

/**
 * The Mage's Meteor, built of cubes like the Warrior's skills.
 *
 * The warning (`meteor_warn`): a targeting circle of flat cubes on the ground, with arcs of cubes turning inside it, a second ring that
 * closes in on the middle, a cross-hair, a floor of cubes that heats up from dark red to orange as the rock comes down, and embers
 * lifting off it. In the sky a boulder of cubes (it tumbles in steps, white-hot on the side it falls with, black behind) comes in at a
 * slant with a tail of cubes that cools from white to dark, throwing off sparks.
 *
 * The blast (`meteor_hit`): a flash with a pillar of fire cubes thrown up, a ball of fire made of cubes, two rings of low cubes
 * running over the ground, a crater of flat cubes (some of them glowing, cooling to black) with a rim of rubble, rocks and burning
 * pieces flung up, dust, and a cloud of grey cubes that swells and drifts up as the fire goes out.
 *
 * The server decides when and where; this only draws it from the age of the mark, so a mark that arrives late is in the right place
 * of its life. Nothing here affects the game.
 */

/** Fire from white-hot to dark. */
const FIRE = pal(0xfff6c8, 0xffd860, 0xff9a2a, 0xe0561a, 0x9a2a12, 0x4a1c14);
/** The glow of the ground: hot to cold. */
const HEAT = pal(0xffd070, 0xff8a2a, 0xc2411a, 0x5a2414, 0x2a1b15);
const SMOKE = pal(0x80726a, 0x63564f, 0x4a403c, 0x332b29);
const CHAR = pal(0x241a15, 0x1b1410, 0x2e211a);
const FINE = 0.0625;
const cool = (palette: readonly THREE.Color[], k: number): THREE.Color => palette[Math.min(palette.length - 1, Math.floor(clamp01(k) * palette.length))];

/** Where a meteor starts, relative to where it lands: it comes in at a slant from high up. */
const METEOR_FROM = new THREE.Vector3(11, 28, 6);
const FROM_LEN = METEOR_FROM.length();
/** The way the rock goes (down the slant). */
const GOES = METEOR_FROM.clone().negate().normalize();

/** The cubes of a lump of rock: 3 x 3 x 3, each with a place in it. */
const LUMP: [number, number, number][] = [];
for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) LUMP.push([x, y, z]);

/** A flat cube lying on the ground. */
const FLAT = 0.06;

export function buildMeteorWarn(f: Fx, e: FxEntry, kit: SpellKit): FxEntry {
  const r = Math.max(1, f.r);
  const rock = (0.8 + r * 0.12) * 1.3;
  const rng = seeded(f.id * 48271 + 5);
  const cubes = new Cubes(kit, voxelMaterial(e), 1500, e.group.position);
  e.group.add(cubes.mesh);
  e.dispose = () => cubes.dispose();

  // the floor: cells of the grid inside the circle, the ones near the middle heat first
  const floor: { x: number; z: number; th: number; jit: number }[] = [];
  const CELL = 0.5;
  const n = Math.ceil(r / CELL);
  for (let gx = -n; gx <= n; gx++) {
    for (let gz = -n; gz <= n; gz++) {
      const d = Math.hypot(gx * CELL, gz * CELL);
      if (d > r * 0.92) continue;
      floor.push({ x: gx * CELL, z: gz * CELL, th: (d / r) * 0.6 + rng() * 0.4, jit: (rng() - 0.5) * 0.3 });
    }
  }
  const embers = Array.from({ length: Math.round(18 + 5 * r) }, () => {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * r * 0.9;
    return { x: Math.cos(a) * d, z: Math.sin(a) * d, phase: rng(), speed: 0.8 + rng() * 1, th: rng(), size: 0.07 + rng() * 0.05, tone: 2 + Math.floor(rng() * 2) };
  });
  // the rock tumbles in steps: four ways to be, each a lump with different cubes missing
  const shapes = Array.from({ length: 4 }, () => LUMP.map(([x, y, z]) => {
    const corner = Math.abs(x) + Math.abs(y) + Math.abs(z) === 3;
    const edge = Math.abs(x) + Math.abs(y) + Math.abs(z) === 2;
    return rng() > (corner ? 0.45 : edge ? 0.12 : 0);
  }));
  const luck = Array.from({ length: 64 }, () => [rng() - 0.5, rng() - 0.5, rng() - 0.5] as const);
  // sparks that come off it on the way down: when, where and where to
  const sparks = Array.from({ length: 70 }, () => ({
    at: rng(),
    o: [(rng() - 0.5) * rock * 0.8, (rng() - 0.5) * rock * 0.8, (rng() - 0.5) * rock * 0.8] as const,
    v: [(rng() - 0.5) * 3, rng() * 1.5, (rng() - 0.5) * 3] as const,
    life: 0.45 + rng() * 0.5,
    size: 0.07 + rng() * 0.08,
    tone: Math.floor(rng() * SPARKS.length),
  }));

  const fall = Math.max(0.2, e.ttl - 0.4);
  const cell = rock / 3;
  const L = rock * 7;
  const step = rock * 0.27;
  const N = Math.ceil(L / step);
  const path = (q: number): [number, number, number] => [METEOR_FROM.x * q, METEOR_FROM.y * q + 0.5, METEOR_FROM.z * q];

  e.animate = (_t, age) => {
    cubes.reset();
    const u = clamp01(age / fall);
    const landed = age >= fall;
    const mark = landed ? clamp01(1 - (age - fall) / 0.4) : 1;
    const keep = steps(mark, 3);

    // the targeting circle
    const ringN = Math.max(24, Math.round((Math.PI * 2 * r) / 0.3));
    const beat = Math.floor(age * 10);
    for (let i = 0; i < ringN; i++) {
      const a = (i / ringN) * Math.PI * 2;
      const R = r * (1.02 + 0.03 * Math.sin(age * 10));
      const lit = (i + beat) % 5 === 0;
      const w = (lit ? 0.26 : 0.2) * keep;
      cubes.put(snap(Math.cos(a) * R, 0.125), 0.1, snap(Math.sin(a) * R, 0.125), w, FLAT, w, lit ? FIRE[1] : FIRE[2]);
    }
    // the arcs turning inside it
    for (let k = 0; k < 3; k++) {
      for (let j = 0; j < 9; j++) {
        const a = (k / 3) * Math.PI * 2 - age * 1.9 + (j / 8) * 0.75;
        const w = 0.23 * keep;
        cubes.put(snap(Math.cos(a) * r * 0.78, 0.125), 0.11, snap(Math.sin(a) * r * 0.78, 0.125), w, FLAT, w, FIRE[1]);
      }
    }
    // the ring that closes in as the rock gets near
    const R2 = Math.max(0.5, r * (0.95 - 0.5 * u));
    const n2 = Math.max(14, Math.round((Math.PI * 2 * R2) / 0.34));
    for (let i = 0; i < n2; i++) {
      const a = (i / n2) * Math.PI * 2 + age * 0.4;
      const w = 0.18 * keep;
      cubes.put(snap(Math.cos(a) * R2, 0.125), 0.1, snap(Math.sin(a) * R2, 0.125), w, FLAT, w, i % 2 ? HEAT[0] : FIRE[1]);
    }
    // the cross-hair
    for (let b = 0; b < 4; b++) {
      const a = (b / 4) * Math.PI * 2 + age * 0.6;
      for (let j = 0; j < 3; j++) {
        const d = r * (0.12 + 0.1 * j);
        const w = 0.16 * keep;
        cubes.put(snap(Math.cos(a) * d, 0.125), 0.1, snap(Math.sin(a) * d, 0.125), w, FLAT, w, FIRE[2]);
      }
    }
    // the floor heats up
    for (const c of floor) {
      if (u < c.th * 0.9) continue;
      const hot = u + c.jit;
      const w = CELL * 0.9 * keep;
      cubes.put(c.x, 0.06, c.z, w, 0.05, w, hot > 0.8 ? HEAT[1] : hot > 0.5 ? HEAT[2] : HEAT[3]);
    }
    // embers lifting off it, more of them as the rock gets close
    for (const m of embers) {
      if (m.th > 0.12 + 0.88 * u) continue;
      const k = (age * m.speed + m.phase) % 1;
      const s = m.size * steps(1 - k, 3) * keep;
      cubes.put(snap(m.x, FINE), 0.15 + k * 1.6, snap(m.z, FINE), s, s, s, FIRE[m.tone]);
    }

    if (!landed) {
      const q = 1 - u * u;
      // the rock: a lump of cubes turning in steps, white-hot where it leads and black where it trails
      const [px, py, pz] = path(q);
      const yaw = (Math.floor(age * 6) % 4) * (Math.PI / 8);
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      const shape = shapes[Math.floor(age * 7) % 4];
      LUMP.forEach(([x, y, z], i) => {
        if (!shape[i]) return;
        const len = Math.hypot(x, y, z) || 1;
        const lead = (x * GOES.x + y * GOES.y + z * GOES.z) / len;
        const col = lead > 0.4 ? ((i + beat) % 2 ? HEAT[0] : HEAT[1]) : lead > -0.1 ? (i % 2 ? HEAT[2] : STONE[2]) : STONE[1 + (i % 3)];
        // the lump turns about the upright axis (the cubes with it)
        const rx = x * c + z * s;
        const rz = -x * s + z * c;
        cubes.put(snap(px + rx * cell, FINE), snap(py + y * cell, FINE), snap(pz + rz * cell, FINE), cell * 1.04, cell * 1.04, cell * 1.04, col, yaw);
      });
      // flames licking round it
      for (let i = 0; i < 9; i++) {
        const l = luck[(i * 5 + beat) % 64];
        const sz = rock * (0.2 + 0.18 * (l[0] + 0.5));
        cubes.put(snap(px + l[0] * rock * 1.9 + GOES.x * rock * 0.5, FINE), snap(py + l[1] * rock * 1.9 + GOES.y * rock * 0.5, FINE), snap(pz + l[2] * rock * 1.9 + GOES.z * rock * 0.5, FINE), sz, sz, sz, i % 3 ? FIRE[2] : FIRE[1]);
      }
      // the tail: cubes laid back up the way it came, each smaller and colder than the one before
      for (let j = 1; j <= N; j++) {
        const qj = q + (j * step) / FROM_LEN;
        if (qj > 1) break;
        const frac = j / N;
        const l = luck[(j * 3 + beat) % 64];
        const jitter = rock * 0.35 * (0.3 + frac);
        const [tx, ty, tz] = path(qj);
        const sz = rock * (0.12 + 0.62 * Math.pow(1 - frac, 0.8)) * (0.85 + 0.3 * (l[0] + 0.5));
        cubes.put(snap(tx + l[0] * jitter, FINE), snap(ty + l[1] * jitter, FINE), snap(tz + l[2] * jitter, FINE), sz, sz, sz, cool(FIRE, 0.08 + frac * 0.92));
      }
      // sparks thrown off along the way
      for (const sp of sparks) {
        const te = sp.at * fall;
        const t = age - te;
        if (t <= 0 || t >= sp.life) continue;
        const [ox, oy, oz] = path(1 - (te / fall) * (te / fall));
        const z = steps(1 - t / sp.life, 3) * sp.size;
        cubes.put(snap(ox + sp.o[0] + sp.v[0] * t, FINE), snap(oy + sp.o[1] + sp.v[1] * t - 4 * t * t, FINE), snap(oz + sp.o[2] + sp.v[2] * t, FINE), z, z, z, SPARKS[sp.tone]);
      }
    }
    cubes.done();
  };
  return e;
}

/** A ring of low cubes racing over the ground, from white to red to dark. */
function drawFireRing(cubes: Cubes, n: number, luck: readonly number[], age: number, delay: number, reach: number, runTime: number, lifeTime: number, wide: number, tall: number): void {
  const t = age - delay;
  const k = t / lifeTime;
  if (t <= 0 || k >= 1) return;
  const run = easeOut(t / runTime);
  const color = k < 0.2 ? PALE : k < 0.4 ? FIRE[1] : k < 0.65 ? FIRE[2] : k < 0.85 ? FIRE[3] : FIRE[4];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const R = reach * (0.12 + 0.88 * run) + (luck[i] - 0.5) * 0.3;
    const h = (0.08 + tall * Math.pow(1 - k, 1.4) * (0.55 + 0.45 * luck[(i * 7) % n])) * (1 + 0.6 * (1 - run));
    const w = wide * steps(1 - k * k);
    cubes.put(snap(Math.cos(a) * R, 0.125), h / 2, snap(Math.sin(a) * R, 0.125), w, h, w, color);
  }
}

export function buildMeteorHit(f: Fx, e: FxEntry, kit: SpellKit): FxEntry {
  const r = Math.max(1, f.r);
  const sc = r / 4;
  if (f.age < 0.3) kit.impact(f.x, f.y, f.z, 0.95);
  const rng = seeded(f.id * 7727 + 31);
  const cubes = new Cubes(kit, voxelMaterial(e), 1800, e.group.position);
  e.group.add(cubes.mesh);
  e.dispose = () => cubes.dispose();
  const ttl = e.ttl;

  const ringN = Math.max(24, Math.round((Math.PI * 2 * r) / 0.27));
  const luck = Array.from({ length: ringN }, () => rng());

  // the crater: flat cubes of the grid with a ragged edge; some of them glow and cool, the rest go black at once
  const noise = Array.from({ length: 16 }, () => 0.82 + rng() * 0.2);
  const crater: { x: number; z: number; born: number; hot: boolean; tone: number }[] = [];
  const CELL = 0.5;
  const n = Math.ceil((r * 1.05) / CELL);
  for (let gx = -n; gx <= n; gx++) {
    for (let gz = -n; gz <= n; gz++) {
      const x = gx * CELL;
      const z = gz * CELL;
      const d = Math.hypot(x, z);
      const a = (Math.atan2(z, x) / (Math.PI * 2) + 1) % 1;
      if (d > r * noise[Math.floor(a * 16) % 16]) continue;
      crater.push({ x, z, born: 0.2 * (d / r), hot: rng() < 0.3, tone: Math.floor(rng() * CHAR.length) });
    }
  }
  // the rim: rubble pushed up round the edge
  const rimN = Math.round(r * 8.5);
  const rim = Array.from({ length: rimN }, (_, i) => {
    const a = (i / rimN) * Math.PI * 2 + between(rng, -0.08, 0.08);
    const d = r * between(rng, 0.92, 1.08);
    return { x: snap(Math.cos(a) * d, 0.125), z: snap(Math.sin(a) * d, 0.125), size: between(rng, 0.25, 0.45) * Math.sqrt(sc), delay: 0.02 + rng() * 0.1, tone: Math.floor(rng() * 4) };
  });
  // the pillar of fire thrown up, and the ball of fire that fills the blast
  const H = Math.ceil((r * 2.4) / 0.5);
  const pillar = Array.from({ length: H }, () => ({ x: (rng() - 0.5) * 0.6 * sc, z: (rng() - 0.5) * 0.6 * sc, life: 0.55 + rng() * 0.1, jit: rng() }));
  const blob = Array.from({ length: Math.round(18 * r) }, () => {
    let x: number, y: number, z: number;
    do {
      x = rng() * 2 - 1;
      y = rng() * 2 - 1;
      z = rng() * 2 - 1;
    } while (x * x + y * y + z * z > 1);
    return { x, y, z, size: (0.3 + rng() * 0.4) * Math.sqrt(sc), life: 0.45 + rng() * 0.4, heat: rng() };
  });
  const dust = makePuffs(rng, { count: 90, spread: 0.6, speed: [r * 2.4, r * 4.4], up: [1.2, 4], size: [0.26, 0.55], life: [0.7, 1.3], delay: [0, 0.08], y0: 0.1 });
  const rocks = makeChunks(rng, { count: 60, radius: r * 0.35, speed: [2 * sc, 7 * sc], up: [8, 16], size: [0.15, 0.4], life: [1.1, Math.min(1.7, ttl - 0.1)], colors: [...STONE, ...EARTH] });
  const burning = makeChunks(rng, { count: 30, radius: r * 0.3, speed: [2 * sc, 8 * sc], up: [6, 13], size: [0.12, 0.26], life: [0.8, 1.3], colors: [...SPARKS, HEAT[1], HEAT[2]] });
  const sparks = makeChunks(rng, { count: 50, radius: 0.4, speed: [3, 11], up: [5, 12], size: [0.05, 0.1], life: [0.35, 0.7], colors: SPARKS });
  const smoke = Array.from({ length: 30 }, () => ({
    x: (rng() - 0.5) * r * 0.7,
    z: (rng() - 0.5) * r * 0.7,
    y: rng() * 0.3 * r,
    rise: 1.2 + rng() * 1.4,
    dx: (rng() - 0.5) * 2.4,
    dz: (rng() - 0.5) * 2.4,
    delay: 0.12 + rng() * 0.35,
    size: (0.35 + rng() * 0.4) * sc,
    tone: Math.floor(rng() * SMOKE.length),
  }));

  const fadeFrom = Math.max(0.1, ttl - 0.5);
  e.animate = (_t, age) => {
    cubes.reset();
    // whatever the mark's length, nothing outlives it (an older server sends a shorter one)
    if (age >= ttl) {
      cubes.done();
      return;
    }
    const fade = age > fadeFrom ? steps(1 - (age - fadeFrom) / (ttl - fadeFrom), 4) : 1;

    // the flash
    if (age < 0.2) {
      const k = age / 0.2;
      const s = steps(1 - k, 3);
      const b = 1.7 * sc * s;
      cubes.put(0, 0.5 * b, 0, b, b, b, k < 0.5 ? PALE : FIRE[1]);
      const reach = (0.8 + 2.4 * easeOut(k)) * sc;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + (i % 2 ? 0.2 : 0);
        const w = (i % 2 ? 0.28 : 0.4) * s;
        cubes.put(snap(Math.cos(a) * reach, 0.125), 0.2, snap(Math.sin(a) * reach, 0.125), w, w, w, i % 2 ? FLASH : PALE);
      }
    }

    // the pillar: it shoots up, each cube born a moment after the one below, and burns out from white to dark
    pillar.forEach((p, i) => {
      const t = age - i * 0.015;
      if (t <= 0 || t >= p.life) return;
      const k = t / p.life;
      const h = (i + 0.5) * 0.5 * (0.8 + 0.2 * easeOut(t / 0.12));
      const w = (1.25 - 0.7 * (i / H)) * sc * (0.85 + 0.3 * p.jit) * steps(1 - k * k, 4);
      cubes.put(snap(p.x, FINE), snap(h, FINE), snap(p.z, FINE), w, w, w, cool(FIRE, clamp01(k * 0.8 + (i / H) * 0.3)));
    });
    // the ball of fire
    for (const b of blob) {
      if (age >= b.life) continue;
      const k = age / b.life;
      const out = (0.3 + 0.7 * easeOut(Math.min(1, age / 0.3))) * 0.8 * r;
      const s = b.size * steps(1 - k, 4);
      cubes.put(snap(b.x * out, FINE), snap(Math.max(s / 2 + 0.04, 0.35 * r + b.y * out * 0.8 + 0.6 * age), FINE), snap(b.z * out, FINE), s, s, s, cool(FIRE, clamp01(k * 0.75 + b.heat * 0.3)));
    }

    // the shock waves
    drawFireRing(cubes, ringN, luck, age, 0, r * 1.15, 0.36, 0.8, 0.3, 0.42);
    drawFireRing(cubes, ringN, luck, age, 0.07, r * 1.15, 0.36, 0.8, 0.3, 0.42);

    // the crater: it glows where the fire passed, and cools to black
    for (const c of crater) {
      if (age < c.born) continue;
      const since = age - c.born;
      const col = c.hot ? (since < 0.1 ? HEAT[0] : since < 0.4 ? HEAT[1] : since < 0.9 ? HEAT[2] : since < 1.3 ? HEAT[3] : CHAR[c.tone]) : since < 0.15 ? HEAT[2] : since < 0.4 ? HEAT[3] : CHAR[c.tone];
      const w = CELL * 0.96 * fade;
      cubes.put(c.x, 0.04, c.z, w, FLAT, w, col);
    }
    // the rim of rubble
    for (const m of rim) {
      const up = easeOut((age - m.delay) / 0.14);
      if (up <= 0.02) continue;
      const s = m.size * fade;
      cubes.put(m.x, (s / 2) * up, m.z, s, s, s, m.tone < 3 ? STONE[m.tone] : EARTH[0]);
    }

    // what is thrown up, and the dust
    drawPuffs(cubes, dust, age);
    drawChunks(cubes, rocks, age);
    drawChunks(cubes, burning, age);
    drawChunks(cubes, sparks, age);

    // the smoke: it starts inside the fire, swells and drifts up and out
    for (const m of smoke) {
      const t = age - m.delay;
      const life = Math.min(1.6, ttl - m.delay - 0.05);
      if (t <= 0 || t >= life) continue;
      const k = t / life;
      const s = m.size * (0.55 + 0.9 * easeOut(Math.min(1, t / 0.35))) * steps(1 - k * k * k, 4);
      const tone = k < 0.3 ? Math.max(2, m.tone) : m.tone;
      cubes.put(snap(m.x + m.dx * t * 0.6, FINE), snap(m.y + m.rise * t * (1 - 0.3 * k) + s / 2, FINE), snap(m.z + m.dz * t * 0.6, FINE), s, s, s, SMOKE[tone]);
    }
    cubes.done();
  };
  return e;
}
