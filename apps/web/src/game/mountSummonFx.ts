import * as THREE from 'three';
import { MOUNT_CAST, type MountId } from '@solrift/shared';
import type { AbilitySound } from './abilitySounds';
import { mountLook } from './mountFx';
import { clamp01, easeOut, type FxEntry, type SpellKit } from './spellFx';
import { Cubes, drawChunks, makeChunks, seeded, steps } from './voxelFx';
import { stage, tonesOf, type Tones } from './voxelLight';

/**
 * A mount being called, in cubes, in the light of the mount you get off (see `mountLook`): as light and airy as the dismount's ring and burst of
 * cubes (a few small, a little see-through cubes, no heavy blocks), but it gathers instead of scattering. Every mount is called and arrives in the same way, only the colour is its own.
 *  - The call (`MOUNT_CAST` seconds): a ring of rune cubes is drawn on the ground round the caster and turns, faster and faster, a second ring
 *    turning against it; cubes of light fall in from far out, spiralling toward the middle; a hollow column of cubes builds up from the ground
 *    with a lit band climbing it. A call that is lost sputters out in a few dim cubes (`buildSummonFizzle`).
 *  - The arrival: the column bursts outward, every cube of it flying off and shrinking away, a white pillar of cubes stands a moment where the
 *    beast is, two stepped shock rings run out over the ground, the rings of runes flash white and sparks are thrown up.
 * Everything is laid out from the age of the effect alone. Nothing here affects the game.
 */

/** The rings of runes: how far out (blocks) and how many cubes. */
/** The reach of the call: where the first sparks fly out to (there is no ring out there). */
const REACH = 1.9;
const INNER = { r: 1.2, n: 20 };
/** The column: a ring of cubes snapped to a grid (so its section is a stepped circle), this many levels high. */
const COL_CUBE = 0.25;
const COL_LEVELS = 14;
const COL_R = 0.95;
/** The cubes of light that fall in toward the caster. */
const MOTES = 26;

export type SummonSound = (sound: AbilitySound, x: number, y: number, z: number, seconds: number) => void;

const hash = (a: number, b: number): number => {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/** The cells of the column: the ring of cubes, each with a number that is its own (when it lights, how fast it flies off). */
const COLUMN: { x: number; z: number; luck: number; out: number }[] = (() => {
  const out: { x: number; z: number; luck: number; out: number }[] = [];
  const seen = new Set<string>();
  const n = Math.round((Math.PI * 2 * COL_R) / (COL_CUBE * 0.8));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const gx = Math.round((Math.cos(a) * COL_R) / COL_CUBE);
    const gz = Math.round((Math.sin(a) * COL_R) / COL_CUBE);
    const key = `${gx},${gz}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ x: gx * COL_CUBE, z: gz * COL_CUBE, luck: hash(gx, gz), out: Math.atan2(gz, gx) });
  }
  return out;
})();

// ---- the parts ------------------------------------------------------------------------------------------------------

/**
 * The runes as cubes: one ring that turns. `reveal` (0..1) is how much of it
 * is drawn (it is drawn on, round and round), `scale` shrinks it, `flash` makes it white.
 */
function drawRunes(cubes: Cubes, tone: Tones, age: number, k: number, reveal: number, scale: number, flash: number): void {
  if (scale <= 0 || reveal <= 0) return;
  const colour = (i: number): THREE.Color => (flash > 0.5 ? tone.pale : i % 2 === 0 ? tone.mid : tone.deep);
  const size = 0.12 * scale;
  const spinI = -age * (1.2 + k * 3);
  const shownI = Math.ceil(INNER.n * reveal);
  for (let i = 0; i < shownI; i++) {
    const a = (i / INNER.n) * Math.PI * 2 + spinI;
    cubes.put(Math.cos(a) * INNER.r, 0.07 + size / 2, Math.sin(a) * INNER.r, size, size * 0.7, size, colour(i + 1), a);
  }
}

// ---- the call -------------------------------------------------------------------------------------------------------

/**
 * The call, from its start until the beast is there (`MOUNT_CAST` seconds): `e` is the entry, positioned at the caster's feet. A cancelled call
 * (`onEnd(true)`) is followed by its own sputtering (see `AbilityFx.stopSummon`).
 */
export function buildSummonCast(id: MountId, e: FxEntry, kit: SpellKit, sound: SummonSound, x: number, y: number, z: number): FxEntry {
  const tone = tonesOf(mountLook(id));
  const cubes = stage(e, kit, 500, true);
  const T = MOUNT_CAST;
  const rng = seeded(0x5eed);
  sound('mount_gather', x, y, z, T);

  const motes = Array.from({ length: MOTES }, (_, i) => ({
    a: rng() * Math.PI * 2,
    r0: 2.4 + rng() * 1.2,
    h0: 0.2 + rng() * 2.6,
    period: 0.7 + rng() * 0.5,
    offset: rng(),
    size: 0.09 + rng() * 0.06,
    tone: Math.floor(rng() * 3),
    /** The cube takes part once the call is this far on. */
    from: (i / MOTES) * 0.7,
  }));

  e.animate = (_t, age) => {
    const k = clamp01(age / T);
    cubes.reset();
    drawRunes(cubes, tone, age, k, easeOut(age / 0.5), 1, 0);
    // The column builds up from the ground, runs of light climbing its sides with gaps between them.
    const height = 0.3 + 2.6 * easeOut(k);
    const density = 0.08 + 0.3 * k;
    COLUMN.forEach((c, ci) => {
      for (let j = 0; j < COL_LEVELS; j++) {
        const u = j / (COL_LEVELS - 1);
        const yy = j * COL_CUBE + COL_CUBE / 2;
        if (yy > height) break;
        const run = Math.floor(j / 2 - age * (3 + c.luck * 3));
        if (hash(ci * 7.1, run) >= density * (1 - 0.55 * u)) continue;
        const s = COL_CUBE * 0.75 * (0.55 + 0.45 * hash(ci, j + 9)) * (u > 0.75 ? 1 - (u - 0.75) * 2.4 : 1);
        cubes.put(c.x, yy, c.z, s, s, s, [tone.pale, tone.mid, tone.deep][Math.min(2, Math.floor(u * 3))]);
      }
    });
    // A faint band climbs the column, again and again: every other cube of a level.
    const band = Math.floor((age * 5) % COL_LEVELS);
    const bandY = band * COL_CUBE + COL_CUBE / 2;
    if (bandY < height) COLUMN.forEach((c, ci) => ci % 2 === 0 && cubes.put(c.x, bandY, c.z, COL_CUBE * 0.6, COL_CUBE * 0.6, COL_CUBE * 0.6, tone.pale));
    // Cubes of light fall in from far out, spiralling toward the middle, a few more as the call goes on.
    for (const m of motes) {
      if (k < m.from) continue;
      const ph = ((age / m.period + m.offset) % 1 + 1) % 1;
      const r = m.r0 + (0.8 - m.r0) * ph * ph;
      const a = m.a + ph * 2.6;
      const s = m.size * steps(Math.min(1, ph * 5, (1 - ph) * 3), 3);
      cubes.put(Math.cos(a) * r, 0.1 + m.h0 * (1 - ph) + 0.2 * ph, Math.sin(a) * r, s, s, s, [tone.deep, tone.mid, tone.pale][m.tone], a);
    }
    cubes.done();
  };
  // A call that is lost: the notes go flat.
  e.onEnd = (early) => {
    if (early) sound('mount_fizzle', x, y, z, 0);
  };
  return e;
}

/** A call that was lost: a few dim cubes thrown up from the ring that was being made, falling back dark. */
export function buildSummonFizzle(id: MountId, e: FxEntry, kit: SpellKit): FxEntry {
  const tone = tonesOf(mountLook(id));
  const cubes = stage(e, kit, 60, true);
  const chunks = makeChunks(seeded(0xf122), { count: 26, radius: REACH, speed: [0.4, 1.4], up: [1.2, 3.2], size: [0.08, 0.16], life: [0.5, 0.9], delay: [0, 0.12], colors: tone.dim, y0: 0.1 });
  e.animate = (_t, age) => {
    cubes.reset();
    drawChunks(cubes, chunks, age);
    cubes.done();
  };
  return e;
}

// ---- the arrival ----------------------------------------------------------------------------------------------------

/**
 * The call is answered: the column bursts, the pillar stands and the runes flash (no ring runs out over the ground). `e` is positioned where the beast
 * stands; it should live `ttl` of about 1.7 seconds.
 */
export function buildSummonArrive(id: MountId, e: FxEntry, kit: SpellKit, sound: SummonSound, x: number, y: number, z: number): FxEntry {
  const tone = tonesOf(mountLook(id));
  const cubes = stage(e, kit, 600, true);
  const rng = seeded(0xa77);
  kit.impact(x, y, z, 0.55);
  sound('mount_strike', x, y, z, 0);
  sound('mount_on', x, y, z, 0);
  const sparks = makeChunks(rng, { count: 30, radius: 0.9, speed: [1.2, 3.6], up: [2.5, 5.5], size: [0.07, 0.14], life: [0.6, 1.1], delay: [0, 0.08], colors: [tone.mid, tone.pale, tone.deep], y0: 0.3 });

  e.animate = (_t, age) => {
    cubes.reset();
    // The column bursts: every cube flies out from the middle and a little up, slowing down, and shrinks away in steps.
    COLUMN.forEach((c, ci) => {
      for (let j = 0; j < COL_LEVELS; j++) {
        if (hash(ci * 3.7, j + 40) > 0.4) continue;
        const life = 0.7 + 0.5 * hash(ci, j);
        if (age >= life) continue;
        const speed = 2.2 + 2.4 * c.luck;
        const out = (1 - Math.exp(-3 * age)) / 3;
        const rise = (1 - Math.exp(-2.5 * age)) / 2.5;
        const s = COL_CUBE * 0.7 * (0.6 + 0.4 * hash(j, ci)) * steps(1 - age / life, 3);
        const r = Math.hypot(c.x, c.z) + speed * out;
        cubes.put(Math.cos(c.out) * r, j * COL_CUBE + COL_CUBE / 2 + rise * (0.6 + 1.6 * c.luck), Math.sin(c.out) * r, s, s, s, [tone.pale, tone.mid, tone.deep][(ci + j) % 3]);
      }
    });
    // The pillar where the beast stands: a thin stack of pale cubes that goes up and shrinks in steps.
    const pillar = steps(1 - age / 0.35, 4);
    if (pillar > 0) for (let j = 0; j < 12; j++) cubes.put(0, j * 0.45 + 0.22, 0, 0.3 * pillar, 0.4, 0.3 * pillar, j % 2 === 0 ? tone.pale : tone.mid);
    // The rings of runes flash white and shrink away.
    drawRunes(cubes, tone, age, 1, 1, steps(1 - Math.max(0, age - 0.3) / 0.9, 4), age < 0.25 ? 1 : 0);
    drawChunks(cubes, sparks, age);
    cubes.done();
  };
  return e;
}
