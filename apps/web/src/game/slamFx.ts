import type { Fx } from '@solrift/shared';
import { easeOut, type FxEntry, type SpellKit } from './spellFx';
import { Cubes, DUST, EARTH, FLASH, GRID, PALE, SPARKS, STONE, between, drawChunks, drawPuffs, makeChunks, makePuffs, pal, seeded, snap, steps, voxelMaterial, type Rng } from './voxelFx';

/**
 * The Warrior's Ground Slam and the leap that starts it, built entirely of cubes: a flash of blocks at the landing, rings of low
 * cubes running over the ground, cracks of flat cubes that glow and go dark, stone columns of stacked cubes thrust up out of the
 * ground, dust and earth thrown up as cubes that shrink away in steps. Nothing is soft or round, and nothing turns: every piece is
 * a block on the grid of the world. The server decides when and where (a `slam` and a `leap` mark); this only draws them, and
 * draws them from the mark's age alone, so a mark that arrives late is in the right place of its life. (The pieces they share with
 * the Shield Bash are in voxelFx.ts.)
 */

/** The cracks, from white-hot to cold: the colour they have at each step of their cooling. */
const HEAT = pal(0xffd070, 0xff8a2a, 0x6b2f16, 0x2a1e16, 0x1b1410);

/** A ring of low cubes, standing on the ground: the shock wave. */
interface Ring {
  delay: number;
  tone: number;
}

/**
 * Lay out a ring of cubes that runs out to `reach` and lies down again. `n` cubes, each at a slightly different distance (so the
 * edge is rough), on the grid of the ground.
 */
function drawRing(cubes: Cubes, ring: Ring, n: number, age: number, reach: number, runTime: number, lifeTime: number, wide: number, tall: number, luck: readonly number[]): void {
  const t = age - ring.delay;
  const k = t / lifeTime;
  if (t <= 0 || k >= 1) return;
  const run = easeOut(t / runTime);
  const color = k < 0.25 ? (ring.tone === 0 ? PALE : DUST[0]) : k < 0.55 ? DUST[0] : DUST[2];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const R = reach * (0.12 + 0.88 * run) + (luck[i] - 0.5) * 0.3;
    const h = (0.08 + tall * Math.pow(1 - k, 1.6) * (0.55 + 0.45 * luck[(i * 7) % n])) * (1 + 0.6 * (1 - run));
    const w = wide * steps(1 - k * k);
    cubes.put(snap(Math.cos(a) * R, 0.125), h / 2, snap(Math.sin(a) * R, 0.125), w, h, w, color);
  }
}

/** A flat cube of a crack in the ground: how far from the middle it is, how wide, and where. */
interface CrackCell {
  x: number;
  z: number;
  d: number;
  w: number;
}

/** The cracks: lines that wander out of the middle (and branch now and then), one cube of the grid at a time. */
function makeCracks(rng: Rng, r: number, lines: number): CrackCell[] {
  const cells: CrackCell[] = [];
  const seen = new Set<string>();
  const add = (x: number, z: number, w: number): void => {
    const gx = snap(x);
    const gz = snap(z);
    const key = `${gx},${gz}`;
    if (seen.has(key)) return;
    seen.add(key);
    cells.push({ x: gx, z: gz, d: Math.hypot(gx, gz), w });
  };
  const walk = (x: number, z: number, angle: number, length: number, w: number, branches: number): void => {
    let a = angle;
    let px = x;
    let pz = z;
    for (let done = 0; done < length; done += GRID) {
      a += (rng() - 0.5) * 0.8;
      px += Math.cos(a) * GRID;
      pz += Math.sin(a) * GRID;
      add(px, pz, w * (1 - 0.35 * (done / length)));
      if (branches > 0 && rng() < 0.16) walk(px, pz, a + (rng() < 0.5 ? -1 : 1) * between(rng, 0.6, 1.2), length * between(rng, 0.25, 0.4), w * 0.8, branches - 1);
    }
  };
  // a crushed patch where the shield came down
  for (let gx = -4; gx <= 4; gx++) {
    for (let gz = -4; gz <= 4; gz++) if (Math.hypot(gx, gz) <= 3.4 && rng() < 0.8) add(gx * GRID, gz * GRID, 0.3);
  }
  for (let i = 0; i < lines; i++) walk(0, 0, (i / lines) * Math.PI * 2 + (rng() - 0.5) * 0.5, r * between(rng, 0.55, 1.02), 0.24, 1);
  return cells;
}

/** A column of stacked cubes (a stone thrust up out of the broken ground), each cube smaller than the one under it. */
interface Column {
  x: number;
  z: number;
  delay: number;
  size: number;
  levels: number;
  tone: number;
  /** How far each cube sits off the one below it, a few steps of the grid. */
  lean: [number, number][];
}

function makeColumns(rng: Rng, r: number): Column[] {
  const out: Column[] = [];
  for (const [frac, n] of [
    [0.5, 6],
    [0.78, 10],
    [1, 14],
  ] as const) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + between(rng, -0.15, 0.15) + frac * 3;
      const rad = r * frac * between(rng, 0.88, 1.04);
      const levels = 2 + Math.floor(rng() * (frac < 0.9 ? 3 : 2));
      out.push({
        x: snap(Math.cos(a) * rad),
        z: snap(Math.sin(a) * rad),
        delay: (rad / r) * 0.2 + rng() * 0.05,
        size: between(rng, 0.42, 0.6),
        levels,
        tone: Math.floor(rng() * 3),
        lean: Array.from({ length: levels }, () => [Math.round(between(rng, -1, 1)) * 0.0625 * 2, Math.round(between(rng, -1, 1)) * 0.0625 * 2] as [number, number]),
      });
    }
  }
  return out;
}

function drawColumns(cubes: Cubes, list: readonly Column[], age: number, sinkStart: number): void {
  const sink = 1 - easeOut((age - sinkStart) / 0.5);
  for (const c of list) {
    const up = easeOut((age - c.delay) / 0.16) * sink;
    if (up <= 0.02) continue;
    let total = 0;
    for (let j = 0; j < c.levels; j++) total += c.size * (1 - j * 0.2);
    let y = 0;
    for (let j = 0; j < c.levels; j++) {
      const s = c.size * (1 - j * 0.2);
      // The whole column slides up out of the ground (what is still under the ground is hidden by it).
      const cy = y + s / 2 - (1 - up) * total;
      y += s;
      if (cy + s / 2 < 0.03) continue;
      cubes.put(c.x + c.lean[j][0], cy, c.z + c.lean[j][1], s, s, s, STONE[Math.min(3, c.tone + (j === c.levels - 1 ? 0 : 1))]);
    }
  }
}

/**
 * The Ground Slam, where the warrior lands after the leap: a flash of cubes, two rings of cubes racing out over the ground, cracks
 * of flat cubes that run out white-hot and cool to dark scars, columns of stone thrust up and sinking again, dust and thrown earth
 * as cubes, and a knock on the screen.
 */
export function buildGroundSlam(f: Fx, e: FxEntry, kit: SpellKit): FxEntry {
  const r = Math.max(1, f.r);
  if (f.age < 0.25) kit.impact(f.x, f.y, f.z, 0.95);
  const rng = seeded(f.id * 7919 + 13);
  const cubes = new Cubes(kit, voxelMaterial(e), 900, e.group.position);
  e.group.add(cubes.mesh);
  e.dispose = () => cubes.dispose();

  const ringN = Math.max(24, Math.round((Math.PI * 2 * r) / 0.27));
  const luck = Array.from({ length: ringN }, () => rng());
  const rings: Ring[] = [
    { delay: 0, tone: 0 },
    { delay: 0.07, tone: 1 },
  ];
  const cracks = makeCracks(rng, r, 9);
  const columns = makeColumns(rng, r);
  const wave = makePuffs(rng, { count: 110, spread: 0.6, speed: [r * 2.4, r * 4.4], up: [1.2, 4], size: [0.26, 0.55], life: [0.7, 1.3], delay: [0, 0.07], y0: 0.1 });
  const burst = makePuffs(rng, { count: 18, spread: 0.45, speed: [0.2, 1.2], up: [4.5, 8], size: [0.3, 0.5], life: [0.55, 1], delay: [0, 0.05], y0: 0.2 });
  const earth = makeChunks(rng, { count: 56, radius: 1, speed: [1.2 * (r / 3.8), 5.2 * (r / 3.8)], up: [5, 10.5], size: [0.1, 0.22], life: [1, 1.35], colors: EARTH });
  const sparks = makeChunks(rng, { count: 26, radius: 0.3, speed: [3, 9], up: [4, 9], size: [0.05, 0.1], life: [0.35, 0.6], colors: SPARKS });

  const sinkStart = Math.max(0.6, e.ttl - 0.55);
  e.animate = (_t, age) => {
    cubes.reset();
    const scale = r / 3.8;

    // the flash: a block of light where the shield hit, with spokes of blocks thrown out of it
    if (age < 0.18) {
      const k = age / 0.18;
      const s = steps(1 - k, 3);
      cubes.put(0, 0.45 * s * scale, 0, 0.9 * s * scale, 0.9 * s * scale, 0.9 * s * scale, PALE);
      const reach = (0.7 + 2.2 * easeOut(k)) * scale;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + (i % 2 ? 0.2 : 0);
        const w = (i % 2 ? 0.26 : 0.38) * s;
        cubes.put(snap(Math.cos(a) * reach, 0.125), 0.2, snap(Math.sin(a) * reach, 0.125), w, w, w, i % 2 ? FLASH : PALE);
      }
      for (let i = 1; i <= 3; i++) {
        const w = 0.3 * s;
        cubes.put(0, 0.3 + i * 0.5 * easeOut(k) * scale, 0, w, w, w, i === 1 ? PALE : FLASH);
      }
    }

    // the shock waves
    for (const ring of rings) drawRing(cubes, ring, ringN, age, r * 1.1, 0.36, 0.78, 0.3, 0.42, luck);

    // the cracks run out white-hot and cool into scars
    const fade = steps(1 - (age - sinkStart) / (e.ttl - sinkStart), 4);
    for (const c of cracks) {
      const born = 0.22 * (c.d / (r * 1.05));
      if (age < born) continue;
      const since = age - born;
      const heat = since < 0.08 ? 0 : since < 0.25 ? 1 : since < 0.55 ? 2 : since < 0.9 ? 3 : 4;
      const w = c.w * fade;
      cubes.put(c.x, 0.03 + 0.03, c.z, w, 0.06, w, HEAT[heat]);
    }

    // the stone
    drawColumns(cubes, columns, age, sinkStart);

    // dust and earth
    drawPuffs(cubes, wave, age);
    drawPuffs(cubes, burst, age);
    drawChunks(cubes, earth, age);
    drawChunks(cubes, sparks, age);
    cubes.done();
  };
  return e;
}

/** The push-off of a Ground Slam: a ring of cubes and a puff of dust under the warrior's feet as they leave the ground, a few cubes of earth thrown after them. */
export function buildLeap(f: Fx, e: FxEntry, kit: SpellKit): FxEntry {
  const r = Math.max(1, f.r);
  if (f.age < 0.25) kit.impact(f.x, f.y, f.z, 0.3);
  const rng = seeded(f.id * 104729 + 7);
  const cubes = new Cubes(kit, voxelMaterial(e), 160, e.group.position);
  e.group.add(cubes.mesh);
  e.dispose = () => cubes.dispose();

  const ringN = Math.max(20, Math.round((Math.PI * 2 * r) / 0.27));
  const luck = Array.from({ length: ringN }, () => rng());
  const ring: Ring = { delay: 0, tone: 0 };
  const dust = makePuffs(rng, { count: 34, spread: 0.5, speed: [r * 2.4, r * 4.8], up: [1.2, 3], size: [0.2, 0.4], life: [0.4, 0.58], delay: [0, 0.04], y0: 0.05 });
  // the jet that goes up with the warrior
  const jet = makePuffs(rng, { count: 7, spread: 0.2, speed: [0, 0.4], up: [6, 9], size: [0.14, 0.24], life: [0.3, 0.55], delay: [0, 0.05], y0: 0.1 });
  const earth = makeChunks(rng, { count: 12, radius: 0.4, speed: [1.5, 3.5], up: [3.5, 6.5], size: [0.08, 0.16], life: [0.5, 0.58], colors: EARTH });
  e.animate = (_t, age) => {
    cubes.reset();
    drawRing(cubes, ring, ringN, age, r * 1.2, 0.28, 0.5, 0.26, 0.2, luck);
    drawPuffs(cubes, dust, age);
    drawPuffs(cubes, jet, age);
    drawChunks(cubes, earth, age);
    cubes.done();
  };
  return e;
}
