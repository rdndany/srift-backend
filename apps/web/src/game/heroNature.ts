/**
 * Glowing stone, mushroom caps and stems, and the five corals, drawn by hand at 64 x 64 and shown by the terrain shader laid over the
 * world (see heroTiles.ts: "field" tiles), so a mushroom cap or a reef is one skin with no seams where blocks meet, its spots and
 * hollows running on from block to block.
 *
 * Caps: a glossy dome of colour with soft round spots lit from the upper left. Corals, one pattern to each: brain (meandering
 * ridges), fire (branching ridges), tube (round mouths), horn (honeycomb), bubble (domed bubbles).
 */
import { beyondTiles } from '@solrift/shared';
import { cells, fbm, h2, mix, ramp, ridge, shade, vn, type RGB } from './heroKit';
import { lightOf, pair } from './heroStone';

const TAU = Math.PI * 2;
const tonesOf = (c: RGB, ks: number[]): RGB[] => ks.map((k) => shade(c, k));
const bt = (name: string): { base: RGB; acc: RGB } => {
  const t = beyondTiles()[name];
  return { base: t.rgb as RGB, acc: (t.accent ?? t.rgb) as RGB };
};
type Field = (x: number, y: number, v: number) => RGB;
const out: ReturnType<typeof pair> = [];
const add = (tile: string, paint: Field): void => {
  out.push(...pair(tile, paint));
};

// ============================ glowing stone ============================
/** Facets of a glowing mineral: each cell bright at its heart and dimmer to its rim, with a thin dark seam between. */
function glow(tones: RGB[], seam: RGB, seed: number, count: number, spark: RGB): Field {
  return (x, y, v) => {
    const s = seed + v * 61;
    const cell = cells(x, y, count, s, 0.9);
    const heart = 1 - Math.min(1, cell.d1 / (64 / count) / 0.75);
    let c = ramp(tones, 0.25 + heart * 0.55 + (h2(cell.id, 1, s + 1) - 0.5) * 0.3 + (fbm(x, y, s + 2, [16, 8]) - 0.5) * 0.3);
    c = shade(c, 1 + (cell.dx * 0.5 + cell.dy * 0.5) * -0.006);
    const edge = cell.d2 - cell.d1;
    if (edge < 0.9) c = mix(c, seam, 0.85 * (1 - edge / 0.9));
    if (h2(x, y, s + 3) > 0.988) c = mix(c, spark, 0.85);
    return c;
  };
}
add('glowstone', glow([[190, 108, 36], [226, 150, 54], [250, 194, 92], [255, 232, 160]], [140, 70, 24], 17000, 4, [255, 250, 210]));
add('redstone_block', glow([[96, 6, 6], [150, 12, 12], [200, 26, 20], [240, 64, 46]], [58, 2, 4], 17100, 4, [255, 140, 110]));
add('redstone_lamp', glow([[74, 46, 28], [98, 64, 40], [126, 86, 52], [152, 108, 68]], [44, 26, 16], 17200, 3, [190, 150, 110]));
add('redstone_lamp_on', glow([[226, 154, 62], [246, 188, 88], [255, 220, 130], [255, 244, 196]], [190, 108, 40], 17300, 3, [255, 255, 235]));

// ============================ mushroom caps ============================
interface CapSpec {
  tones: RGB[];
  spot: RGB;
  /** Spots per row in the tile, chance a cell has one, and their size. */
  count: number;
  chance: number;
  size: number;
  seed: number;
  /** The spots themselves glow a little more. */
  /** Soft blotches of the spot colour instead of round spots. */
  blotch?: boolean;
}
function cap(spec: CapSpec): Field {
  return (x, y, v) => {
    const s = spec.seed + v * 67;
    const h = (px: number, py: number): number => fbm(px, py, s, [32, 16, 8]);
    let c = ramp(spec.tones, 0.45 + (h(x, y) - 0.5) * 1.1);
    c = shade(c, 1 + lightOf(h, x, y) * 0.9);
    // Gloss: a broad pale sweep that drifts over the dome.
    const g = 0.5 + 0.5 * Math.sin(((x + y) / 64) * TAU + (vn(x, y, 32, s + 1) - 0.5) * 2.4);
    c = shade(c, 1 + (g - 0.5) * 0.12);
    if (spec.blotch) {
      const b = fbm(x, y, s + 8, [32, 16, 8]) + (vn(x, y, 4, s + 9) - 0.5) * 0.15;
      const k = Math.min(1, Math.max(0, (b - 0.54) / 0.1));
      if (k > 0) c = mix(c, shade(spec.spot, 0.9 + (h(x, y) - 0.5) * 0.3), k * 0.8);
    }
    // Spots: soft round blots, lit on their upper left, with a shadow ring on the lower right.
    const cell = cells(x, y, spec.count, s + 2, 0.5);
    if (h2(cell.id, 3, s + 3) < spec.chance) {
      const r = (64 / spec.count) * spec.size * (0.55 + 0.45 * h2(cell.id, 4, s + 4)) * 0.5;
      const d = cell.d1 + (vn(x, y, 8, s + 5) - 0.5) * 1.8;
      if (d < r) {
        const lit = 0.5 - (cell.dx + cell.dy) / (3 * r);
        c = mix(c, shade(spec.spot, 0.82 + 0.3 * lit + (h(x, y) - 0.5) * 0.1), 0.96);
      } else if (d < r + 1.6 && cell.dx + cell.dy > 0) c = shade(c, 0.8);
    }
    return c;
  };
}
add('red_mushroom_block', cap({ tones: [[140, 20, 22], [178, 32, 30], [208, 50, 42], [230, 82, 64]], spot: [246, 238, 226], count: 5, chance: 0.8, size: 0.92, seed: 17400 }));
add('brown_mushroom_block', cap({ tones: [[92, 60, 38], [118, 80, 52], [144, 104, 68], [168, 128, 90]], spot: [210, 186, 150], count: 4, chance: 0, size: 1, seed: 17500, blotch: true }));
const gcap = bt('glowshroom_cap');
add('glowshroom_cap', cap({ tones: tonesOf(gcap.base, [0.6, 0.82, 1, 1.18]), spot: gcap.acc, count: 5, chance: 0.8, size: 0.92, seed: 17600 }));
const scap = bt('spore_cap');
add('spore_cap', cap({ tones: tonesOf(scap.base, [0.6, 0.82, 1, 1.18]), spot: scap.acc, count: 5, chance: 0.8, size: 0.92, seed: 17700 }));

/** Stems: pale fibres running down, wavering, with a few darker bruises. */
function stem(tones: RGB[], bruise: RGB, seed: number): Field {
  return (x, y, v) => {
    const s = seed + v * 71;
    const warp = (vn(x, y, 32, s + 1) - 0.5) * 5 + (vn(x, y, 16, s + 2) - 0.5) * 2;
    const t = Math.sin(((x + warp) / 64) * TAU * 9) * 0.5 + 0.5;
    const u = Math.sin(((x + warp) / 64) * TAU * 5 + 1.7) * 0.5 + 0.5;
    let c = ramp(tones, 0.2 + t * 0.35 + u * 0.2 + (fbm(x, y, s + 3, [32, 16]) - 0.5) * 0.4);
    const f = Math.abs(Math.sin(((x + warp) / 64) * TAU * 4.5));
    if (f < 0.1 && vn(x, y, 16, s + 4) > 0.35) c = shade(c, 0.86);
    const b = fbm(x, y, s + 5, [16, 8]);
    if (b > 0.68) c = mix(c, bruise, Math.min(0.3, (b - 0.68) * 3));
    return shade(c, 1 + (h2(x, y, s + 6) - 0.5) * 0.04);
  };
}
add('mushroom_stem', stem([[190, 180, 154], [208, 198, 172], [224, 216, 192], [238, 232, 212]], [150, 124, 92], 17800));
const gst = bt('glowshroom_stem');
add('glowshroom_stem', stem(tonesOf(gst.base, [0.82, 0.92, 1, 1.07]), gst.acc, 17900));

// ============================ corals ============================
interface CoralSpec {
  base: RGB;
  acc: RGB;
  seed: number;
  kind: 'brain' | 'fire' | 'tube' | 'horn' | 'bubble';
  dead?: boolean;
}
function coral(spec: CoralSpec): Field {
  const tones = tonesOf(spec.base, spec.dead ? [0.8, 0.92, 1, 1.1] : [0.66, 0.84, 1, 1.16]);
  return (x, y, v) => {
    const s = spec.seed + v * 73;
    const h = (px: number, py: number): number => fbm(px, py, s, [32, 16, 8]);
    let c = ramp(tones, 0.45 + (h(x, y) - 0.5) * 1.0);
    if (spec.kind === 'brain') {
      // Meandering ridges: the contours of a noise, so the grooves wind and never cross.
      const n = fbm(x, y, s + 1, [32, 16, 8]) * 9 + (vn(x, y, 4, s + 2) - 0.5) * 0.5;
      const f = n - Math.floor(n);
      const groove = Math.abs(f - 0.5);
      if (groove > 0.34) c = shade(c, 0.58);
      else if (groove > 0.26) c = shade(c, 0.82);
      else if (f < 0.5 && groove < 0.12) c = mix(c, spec.acc, 0.3);
    } else if (spec.kind === 'fire') {
      // Branching ridges: thin lit lines forking over the surface, with grooves beside them.
      const r1 = ridge(x, y, 16, s + 1);
      const r2 = ridge(x, y, 8, s + 2);
      const r = Math.min(r1, r2 * 1.3);
      if (r < 1.3) c = mix(c, spec.acc, 0.7 * (1 - r / 1.3));
      else if (r < 2.6) c = shade(c, 0.74);
    } else if (spec.kind === 'tube') {
      // Round mouths: a dark hollow in a lit rim.
      const cell = cells(x, y, 7, s + 1, 0.7);
      const rad = 4.2 + h2(cell.id, 1, s + 3) * 1.6;
      const d = cell.d1 + (vn(x, y, 4, s + 4) - 0.5) * 0.8;
      if (d < rad * 0.62) c = shade(mix(c, spec.base, 0.2), 0.34 + 0.3 * (d / (rad * 0.62)));
      else if (d < rad) c = mix(c, spec.acc, cell.dx + cell.dy < 0 ? 0.55 : 0.1);
      else c = shade(c, 0.9);
    } else if (spec.kind === 'horn') {
      // Honeycomb: six-sided cells, each pitted, with a lit wall between.
      const cell = cells(x, y, 8, s + 1, 0.5);
      const wall = cell.d2 - cell.d1;
      if (wall < 1.2) c = mix(c, spec.acc, 0.6);
      else if (wall < 2.4) c = shade(c, 1.04);
      else c = shade(c, 0.78 + 0.22 * Math.min(1, cell.d1 / 3.2));
    } else {
      // Bubbles: domes of different sizes, lit on their upper left, with a dark gap between.
      const cell = cells(x, y, 6, s + 1, 0.85);
      const rad = 64 / 6 / 2 * (0.78 + 0.3 * h2(cell.id, 1, s + 2));
      const d = cell.d1;
      if (d < rad) {
        const lit = 0.5 - (cell.dx + cell.dy) / (2.6 * rad);
        c = shade(mix(c, spec.acc, Math.max(0, lit - 0.5) * 1.1), 0.78 + 0.5 * lit);
        if (Math.hypot(cell.dx + rad * 0.4, cell.dy + rad * 0.4) < 1.6) c = mix(c, [255, 255, 255], 0.7);
      } else c = shade(c, 0.5);
    }
    if (spec.dead) c = mix(c, [150, 146, 138], 0.12);
    return c;
  };
}
const corals: [string, CoralSpec['kind'], number][] = [
  ['coral_block_pink', 'brain', 18000],
  ['coral_block_red', 'fire', 18100],
  ['coral_block_blue', 'tube', 18200],
  ['coral_block_yellow', 'horn', 18300],
  ['coral_block_purple', 'bubble', 18400],
];
for (const [name, kind, seed] of corals) {
  const t = bt(name);
  add(name, coral({ base: t.base, acc: t.acc, seed, kind }));
}
const dead = bt('dead_coral_block');
add('dead_coral_block', coral({ base: dead.base, acc: dead.acc, seed: 18500, kind: 'brain', dead: true }));

export const NATURE_PICS = out;
