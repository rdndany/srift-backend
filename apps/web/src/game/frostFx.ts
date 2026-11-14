import type * as THREE from 'three';
import type { Fx } from '@solrift/shared';
import { clamp01, easeOut, type FxEntry, type SpellKit } from './spellFx';
import { Cubes, GRID, between, drawChunks, drawPuffs, makeChunks, makePuffs, pal, seeded, snap, steps, voxelMaterial, type Rng } from './voxelFx';

/**
 * The Mage's Frost Nova, built of cubes like the Warrior's skills: a flash of ice where the mage stands, a shell of ice cubes sweeping
 * out over a dome, two rings of low cubes racing over the ground, and behind them the ground freezing over (flat pale cubes with a
 * snowflake of six branching arms in them, white at first and then cooling to blue), crystals of stacked cubes thrust up in three rings
 * that sink again as the frost goes, a cold mist rolling out, shards of ice thrown up, sparkles, and snow drifting down. Nothing is soft
 * or round and nothing turns: every piece is a block on the grid of the world. The server decides when and where (a `frost_nova` mark
 * whose radius is the radius of the blast); this only draws it, from the age of the mark alone.
 */

/** Ice, from white to deep blue. */
const ICE = pal(0xffffff, 0xe4f8ff, 0xbfeaff, 0x8fd8ff, 0x5fb4f0, 0x3a82d0);
/** The frozen ground: pale, and a little bluer here and there. */
const GROUND = pal(0xcfeeff, 0xa8def4, 0x93d0ee, 0x7cc0e6);
const MIST = pal(0xf4fcff, 0xdcf1ff, 0xbfe3f6, 0xa6d2ea);
const SHARDS = pal(0xffffff, 0xcff4ff, 0x9fe0ff, 0x6cc4f6);
const SPARKLE = pal(0xffffff, 0xcff4ff);
const FINE = 0.0625;
const FLAT = 0.06;
const CELL = 0.5;
const cool = (palette: readonly THREE.Color[], k: number): THREE.Color => palette[Math.min(palette.length - 1, Math.floor(clamp01(k) * palette.length))];

/** A ring of low cubes racing out over the ground: white at first, then ice, then blue. */
function drawIceRing(cubes: Cubes, n: number, luck: readonly number[], age: number, delay: number, reach: number, runTime: number, lifeTime: number, wide: number, tall: number): void {
  const t = age - delay;
  const k = t / lifeTime;
  if (t <= 0 || k >= 1) return;
  const run = easeOut(t / runTime);
  const color = k < 0.2 ? ICE[0] : k < 0.45 ? ICE[1] : k < 0.7 ? ICE[2] : ICE[3];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const R = reach * (0.12 + 0.88 * run) + (luck[i] - 0.5) * 0.3;
    const h = (0.08 + tall * Math.pow(1 - k, 1.5) * (0.55 + 0.45 * luck[(i * 7) % n])) * (1 + 0.6 * (1 - run));
    const w = wide * steps(1 - k * k);
    cubes.put(snap(Math.cos(a) * R, 0.125), h / 2, snap(Math.sin(a) * R, 0.125), w, h, w, color);
  }
}

/** A flat cube of the frozen ground (or of a snowflake arm): how far from the middle, where, and what it is. */
interface Cell {
  x: number;
  z: number;
  /** When the front of the frost reaches it. */
  born: number;
  /** Which shade of the ground it settles into. */
  tone: number;
  /** An arm of the snowflake (it stays bright), or a plain cell. */
  arm: boolean;
  w: number;
}

/** The frozen ground: cells of the grid inside a ragged circle, and a six-armed snowflake of brighter cubes lying on it. */
function makeFrost(rng: Rng, r: number): Cell[] {
  const cells: Cell[] = [];
  const noise = Array.from({ length: 18 }, () => 0.84 + rng() * 0.18);
  const n = Math.ceil((r * 1.05) / CELL);
  for (let gx = -n; gx <= n; gx++) {
    for (let gz = -n; gz <= n; gz++) {
      const x = gx * CELL;
      const z = gz * CELL;
      const d = Math.hypot(x, z);
      const a = (Math.atan2(z, x) / (Math.PI * 2) + 1) % 1;
      if (d > r * noise[Math.floor(a * 18) % 18] || rng() > 0.8) continue;
      cells.push({ x, z, born: 0.38 * (d / r), tone: Math.floor(rng() * 4), arm: false, w: CELL * 0.94 });
    }
  }
  const seen = new Set<string>();
  const add = (x: number, z: number, w: number): void => {
    const gx = snap(x);
    const gz = snap(z);
    const key = `${gx},${gz}`;
    if (seen.has(key)) return;
    seen.add(key);
    const d = Math.hypot(gx, gz);
    cells.push({ x: gx, z: gz, born: 0.38 * (d / r), tone: 0, arm: true, w });
  };
  const spin = rng() * 0.5;
  for (let arm = 0; arm < 6; arm++) {
    const a = spin + (arm / 6) * Math.PI * 2;
    for (let d = 0.35; d <= r * 0.96; d += GRID * 0.6) add(Math.cos(a) * d, Math.sin(a) * d, 0.27 * (1 - 0.2 * (d / r)));
    // two pairs of twigs, or three on a big one, each a quarter as long as the arm
    for (const at of r > 3 ? [0.3, 0.52, 0.74] : [0.4, 0.7]) {
      const sx = Math.cos(a) * r * at;
      const sz = Math.sin(a) * r * at;
      for (const side of [-1, 1]) {
        const b = a + side * 1.05;
        for (let d = GRID; d <= r * 0.2 * (1.2 - at * 0.5); d += GRID * 0.6) add(sx + Math.cos(b) * d, sz + Math.sin(b) * d, 0.24);
      }
    }
  }
  return cells;
}

/** A crystal: a column of stacked cubes, each smaller than the one under it, leaning a little; the top is the whitest. */
interface Crystal {
  x: number;
  z: number;
  delay: number;
  size: number;
  levels: number;
  tone: number;
  lean: [number, number];
}

function makeCrystals(rng: Rng, r: number): Crystal[] {
  const out: Crystal[] = [];
  const k = Math.min(1.6, Math.max(0.6, r / 5));
  for (const [frac, n] of [
    [0.3, 9],
    [0.62, 16],
    [0.93, 23],
  ] as const) {
    const count = Math.round(n * k);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + between(rng, -0.12, 0.12) + frac * 2;
      const rad = r * frac * between(rng, 0.9, 1.05);
      // most are short, a few tall ones stand out in the outer rings
      const tall = frac > 0.5 && rng() < 0.25;
      const levels = tall ? 5 + Math.floor(rng() * 2) : 2 + Math.floor(rng() * 3);
      out.push({
        x: snap(Math.cos(a) * rad),
        z: snap(Math.sin(a) * rad),
        delay: (rad / r) * 0.3 + rng() * 0.06,
        size: between(rng, 0.34, 0.5) * Math.sqrt(k),
        levels,
        tone: Math.floor(rng() * 2),
        lean: [Math.round(between(rng, -1, 1)) * FINE * 2, Math.round(between(rng, -1, 1)) * FINE * 2],
      });
    }
  }
  return out;
}

function drawCrystals(cubes: Cubes, list: readonly Crystal[], age: number, sinkStart: number): void {
  const sink = 1 - easeOut((age - sinkStart) / 0.5);
  for (const c of list) {
    const up = easeOut((age - c.delay) / 0.17) * sink;
    if (up <= 0.02) continue;
    let total = 0;
    for (let j = 0; j < c.levels; j++) total += c.size * Math.max(0.3, 1 - j * 0.17);
    let y = 0;
    for (let j = 0; j < c.levels; j++) {
      const s = c.size * Math.max(0.3, 1 - j * 0.17);
      // the whole crystal slides up out of the ground (what is still under the ground is hidden by it)
      const cy = y + s / 2 - (1 - up) * total;
      y += s;
      if (cy + s / 2 < 0.03) continue;
      cubes.put(c.x + c.lean[0] * j, cy, c.z + c.lean[1] * j, s, s, s, ICE[Math.max(0, Math.min(5, 3 + c.tone - j))]);
    }
  }
}

/**
 * The Frost Nova: the mark is where the mage stood, `f.r` the radius of the blast. It lasts a little over two seconds (the frost stays
 * on the ground, the crystals sink into it as it melts).
 */
export function buildFrostNova(f: Fx, e: FxEntry, kit: SpellKit): FxEntry {
  const r = Math.max(1, f.r);
  const sc = r / 5;
  if (f.age < 0.25) kit.impact(f.x, f.y, f.z, 0.3);
  const rng = seeded(f.id * 6151 + 17);
  const cubes = new Cubes(kit, voxelMaterial(e), 2600, e.group.position);
  e.group.add(cubes.mesh);
  e.dispose = () => cubes.dispose();
  const ttl = e.ttl;

  const ringN = Math.max(24, Math.round((Math.PI * 2 * r) / 0.27));
  const luck = Array.from({ length: ringN }, () => rng());
  const frost = makeFrost(rng, r);
  const crystals = makeCrystals(rng, r);
  // the dome: points spread evenly over a half sphere, each a cube of the shell that sweeps out
  const domeN = Math.round(70 + 12 * r);
  const dome = Array.from({ length: domeN }, (_, i) => {
    const yy = (i + 0.5) / domeN;
    const rad = Math.sqrt(1 - yy * yy);
    const th = i * 2.399963;
    return { x: Math.cos(th) * rad, y: yy, z: Math.sin(th) * rad, size: 0.2 + 0.08 * (i % 3), delay: (i % 5) * 0.012 };
  });
  const mist = makePuffs(rng, { count: 90, spread: 0.6, speed: [r * 1.6, r * 3.4], up: [0.4, 1.6], size: [0.3, 0.6], life: [0.9, 1.5], delay: [0, 0.1], y0: 0.1 });
  const shards = makeChunks(rng, { count: 50, radius: r * 0.25, speed: [2 * sc, 6 * sc], up: [3.5, 8], size: [0.08, 0.2], life: [0.9, Math.max(1, ttl - 0.4)], colors: SHARDS });
  const sparkle = makeChunks(rng, { count: 40, radius: r * 0.4, speed: [0.5 * sc, 3.5 * sc], up: [1, 3.5], size: [0.04, 0.08], life: [0.5, 0.95], colors: SPARKLE });
  // snow drifting down over the whole area for a while after the wave
  const snow = Array.from({ length: Math.round(14 + 5 * r) }, () => {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * r;
    return { x: Math.cos(a) * d, z: Math.sin(a) * d, y: 1 + rng() * 2.4, fall: 0.5 + rng() * 0.6, delay: 0.15 + rng() * 0.6, life: 0.8 + rng() * 0.6, size: 0.05 + rng() * 0.05, sway: rng() * 6, tone: Math.floor(rng() * 2) };
  });

  const fadeStart = Math.max(0.2, ttl - 0.7);
  e.animate = (_t, age) => {
    cubes.reset();
    // whatever the mark's length, nothing outlives it (an older server sends a shorter one)
    if (age >= ttl) {
      cubes.done();
      return;
    }
    const fade = age > fadeStart ? steps(1 - (age - fadeStart) / (ttl - fadeStart), 4) : 1;

    // the flash: a block of ice where the mage stands, with spokes thrown out of it
    if (age < 0.2) {
      const k = age / 0.2;
      const s = steps(1 - k, 3);
      const b = 0.9 * sc * s;
      cubes.put(0, 0.45 * b + 0.05, 0, b, b, b, k < 0.5 ? ICE[0] : ICE[1]);
      const reach = (0.7 + 2.4 * easeOut(k)) * sc;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + (i % 2 ? 0.2 : 0);
        const w = (i % 2 ? 0.24 : 0.36) * s;
        cubes.put(snap(Math.cos(a) * reach, 0.125), 0.2, snap(Math.sin(a) * reach, 0.125), w, w, w, i % 2 ? ICE[2] : ICE[0]);
      }
    }

    // the wave: a shell of ice cubes sweeping out over a dome, cooling from white to blue and shrinking away in steps
    const kd = age / 0.5;
    if (kd < 1) {
      const R = r * (0.12 + 0.95 * easeOut(kd));
      for (const p of dome) {
        const k = clamp01((age - p.delay) / 0.5);
        if (k >= 1) continue;
        const s = p.size * Math.sqrt(sc) * steps(1 - k, 4);
        cubes.put(snap(p.x * R, FINE), snap(Math.max(s / 2 + 0.05, p.y * R * 0.6), FINE), snap(p.z * R, FINE), s, s, s, cool(ICE, k * 0.85));
      }
    }
    // the rings racing over the ground
    drawIceRing(cubes, ringN, luck, age, 0, r * 1.08, 0.4, 0.8, 0.28, 0.36);
    drawIceRing(cubes, ringN, luck, age, 0.08, r * 1.08, 0.4, 0.8, 0.28, 0.36);

    // the ground freezing over behind the front of the wave: white first, then it settles into pale blues (and the arms stay bright)
    for (const c of frost) {
      if (age < c.born) continue;
      const since = age - c.born;
      const col = c.arm ? (since < 0.6 ? ICE[0] : ICE[1]) : since < 0.1 ? ICE[0] : since < 0.3 ? GROUND[0] : GROUND[c.tone];
      const w = c.w * fade;
      cubes.put(c.x, c.arm ? 0.09 : 0.04, c.z, w, c.arm ? 0.07 : FLAT, w, col);
    }

    // the crystals
    drawCrystals(cubes, crystals, age, fadeStart);

    // the mist, the shards, the sparkles
    drawPuffs(cubes, mist, age, MIST);
    drawChunks(cubes, shards, age);
    drawChunks(cubes, sparkle, age);
    // the snow
    for (const s of snow) {
      const t = age - s.delay;
      if (t <= 0 || t >= s.life) continue;
      const w = s.size * steps(1 - t / s.life, 3);
      cubes.put(snap(s.x + Math.sin(s.sway + t * 2) * 0.15, FINE), snap(Math.max(0.1, s.y - s.fall * t), FINE), snap(s.z + Math.cos(s.sway + t * 1.7) * 0.15, FINE), w, w, w, ICE[s.tone]);
    }
    cubes.done();
  };
  return e;
}
