import type { Fx } from '@solrift/shared';
import { easeOut, type FxEntry, type SpellKit } from './spellFx';
import { Cubes, drawChunks, drawPuffs, makeChunks, makePuffs, pal, seeded, snap, srgb, steps, voxelMaterial } from './voxelFx';

/**
 * The Warrior's Shield Bash, built entirely of cubes: a shield made of cubes (a picture of pixels with a cross on it) is driven out in
 * front with two fainter echoes behind it, rings of cubes roll forward standing upright, three waves of low cubes spread over the ground
 * in the cone that was hit, and sparks (cubes) and dust (cubes) fly ahead. The mark's far end says which way the blow went; the mark is
 * at the height of the chest, so the ground is `GROUND` below it. Drawn from the mark's age alone (see voxelFx.ts).
 */

/** The shield, as a picture of cubes, from the top: `r` the rim, `b` the body, `c` the cross, `.` nothing. */
const SHIELD = ['rrrrrrrrr', 'rbbbcbbbr', 'rbbbcbbbr', 'rcccccccr', 'rbbbcbbbr', '.rbbcbbr.', '.rbbcbbr.', '..rbcbr..', '...rcr...', '....r....'];
const SHIELD_W = 9;
const SHIELD_H = SHIELD.length;
/** One cube of the picture. */
const CELL = 0.22;

/** How far the chest is above the ground. */
const GROUND = -0.9;

/** The shield and its two echoes: when each leaves, how solid it is, how big, and the colours of its rim, body and cross. */
const COPIES = [
  { delay: 0, strength: 1, size: 0.78, rim: srgb(0xeaf4ff), body: srgb(0x86aee0), cross: srgb(0xf4c542) },
  { delay: 0.06, strength: 0.55, size: 0.9, rim: srgb(0x9cc8ff), body: srgb(0x5f86c8), cross: srgb(0x9cc8ff) },
  { delay: 0.12, strength: 0.3, size: 1.02, rim: srgb(0x6a9cff), body: srgb(0x4a6cb0), cross: srgb(0x6a9cff) },
] as const;
const WAVES = [
  { delay: 0, color: srgb(0xf2f8ff) },
  { delay: 0.05, color: srgb(0x9cc8ff) },
  { delay: 0.1, color: srgb(0x9cc8ff) },
] as const;
const RINGS = [
  { delay: 0.03, color: srgb(0xe4f2ff) },
  { delay: 0.1, color: srgb(0xa8d0ff) },
] as const;
const FLASH_COLORS = pal(0xf2f8ff, 0xb8d8ff);
const SPARK_COLORS = pal(0xfff0b0, 0xffc050, 0xffffff, 0xcfe4ff);

/** A number in 0..1 from a cube's number (the same cube gets the same luck every frame). */
const luckOf = (i: number): number => {
  const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
};

export function buildShieldBash(f: Fx, e: FxEntry, kit: SpellKit): FxEntry {
  const reach = Math.max(1.5, f.r * 2);
  let dx = (f.x2 ?? f.x) - f.x;
  let dz = (f.z2 ?? f.z) - f.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.01) {
    dx = 0;
    dz = -1;
  } else {
    dx /= len;
    dz /= len;
  }
  if (f.age < 0.25) kit.impact(f.x, f.y, f.z, 0.4);
  /** A place `fwd` ahead, `side` to the right and `up` above the mark, in the world's directions. */
  const at = (fwd: number, side: number, up: number): [number, number, number] => [dx * fwd - dz * side, up, dz * fwd + dx * side];
  // The turn of a piece that faces the way of the blow (its front is the way it goes).
  const yaw = Math.atan2(-dx, -dz);
  const way = Math.atan2(dz, dx);

  const rng = seeded(f.id * 15485863 + 5);
  const cubes = new Cubes(kit, voxelMaterial(e), 700, e.group.position);
  e.group.add(cubes.mesh);
  e.dispose = () => cubes.dispose();

  const [fx0, , fz0] = at(0.4, 0, 0);
  const sparks = makeChunks(rng, { count: 44, radius: 0.25, speed: [5, 14], up: [-1, 3.5], size: [0.05, 0.1], life: [0.3, 0.6], colors: SPARK_COLORS, floor: GROUND, y0: 0.9, from: [fx0, fz0], way: [way, 0.6] });
  const [dx0, , dz0] = at(0.3, 0, 0);
  const dust = makePuffs(rng, { count: 26, spread: 0.5, speed: [8, 18], up: [1.2, 3.5], size: [0.2, 0.42], life: [0.45, 0.65], delay: [0, 0.05], y0: GROUND, from: [dx0, dz0], way: [way, 0.7] });

  e.animate = (_t, age) => {
    cubes.reset();

    // the flash where the shield hit: a block of light with a star of cubes round it, facing the way of the blow
    if (age < 0.16) {
      const k = age / 0.16;
      const s = steps(1 - k, 3);
      const [cx, cy, cz] = at(1, 0, 0);
      cubes.put(cx, cy, cz, 0.8 * s, 0.8 * s, 0.8 * s, FLASH_COLORS[0]);
      const spread = 0.35 + 1.1 * easeOut(k);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const [x, y, z] = at(1 + (i % 2 ? 0.25 : 0), Math.cos(a) * spread, Math.sin(a) * spread);
        const w = (i % 2 ? 0.2 : 0.28) * s;
        cubes.put(x, y, z, w, w, w, FLASH_COLORS[i % 2], yaw);
      }
    }

    // the shield, driven out, and the echoes of it a moment behind (they come apart as they go)
    COPIES.forEach((copy, ci) => {
      const a = age - copy.delay;
      if (a <= 0 || a >= 0.55) return;
      const out = easeOut(a / 0.22);
      const s = copy.size * (0.55 + 0.4 * easeOut(a / 0.12));
      const fwd = 0.25 + reach * 0.4 * out;
      const left = steps(1 - (a - 0.14) / 0.4, 4);
      const cell = CELL * s;
      for (let row = 0; row < SHIELD_H; row++) {
        for (let col = 0; col < SHIELD_W; col++) {
          const ch = SHIELD[row][col];
          if (ch === '.') continue;
          if (ci > 0 && luckOf(row * 11 + col + ci * 97) > copy.strength + 0.25) continue;
          const [x, y, z] = at(fwd - (ch === 'r' ? 0 : cell * 0.5), (col - (SHIELD_W - 1) / 2) * cell, ((SHIELD_H - 1) / 2 - row) * cell);
          const size = cell * left;
          cubes.put(x, y, z, size, size, size * (ch === 'r' ? 1.25 : 1), ch === 'r' ? copy.rim : ch === 'c' ? copy.cross : copy.body, yaw);
        }
      }
    });

    // rings standing upright, rolling forward
    for (const ring of RINGS) {
      const a = age - ring.delay;
      if (a <= 0 || a >= 0.5) continue;
      const out = easeOut(a / 0.35);
      const R = 0.35 + 1.15 * out;
      const w = 0.13 * steps(1 - a / 0.45);
      for (let i = 0; i < 26; i++) {
        const t = (i / 26) * Math.PI * 2;
        const up = Math.sin(t) * R;
        if (up - w / 2 < GROUND + 0.02) continue;
        const [x, y, z] = at(0.4 + reach * 0.75 * out, Math.cos(t) * R, up);
        cubes.put(x, y, z, w, w, w, ring.color, yaw);
      }
    }

    // the cone on the ground, in three waves
    const half = 0.94;
    for (const wave of WAVES) {
      const a = age - wave.delay;
      if (a <= 0 || a >= 0.5) continue;
      const R = Math.max(0.2, reach * (0.25 + 0.85 * easeOut(a / 0.3)));
      const n = Math.ceil((R * half * 2) / 0.27) + 1;
      const h = 0.05 + 0.1 * (1 - a / 0.5);
      const w = 0.26 * steps(1 - (a / 0.5) * (a / 0.5));
      for (let i = 0; i < n; i++) {
        const t = -half + (2 * half * i) / Math.max(1, n - 1);
        const [x, , z] = at(Math.cos(t) * R, Math.sin(t) * R, 0);
        cubes.put(snap(x, 0.125), GROUND + h / 2 + 0.01, snap(z, 0.125), w, h, w, wave.color);
      }
    }

    drawChunks(cubes, sparks, age);
    drawPuffs(cubes, dust, age);
    cubes.done();
  };
  return e;
}
