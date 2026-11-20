/**
 * The rest of the rocks: the stones of The World Beyond (limestone, slate, marble, basalt...), each drawn on its own for the look of
 * that rock, in the colours the game's data gives it (`beyondBlocks.ts`). Like the common stones in heroStone.ts, they are fields: laid
 * over the world with no seams, two pictures per block that the world drifts between.
 */
import { beyondTiles } from '@solrift/shared';
import { cells, fbm, h2, mix, ramp, ridge, shade, vn, type RGB } from './heroKit';
import { crack, lightOf, pair } from './heroStone';

const tile = (name: string): { base: RGB; acc: RGB } => {
  const t = beyondTiles()[name];
  return { base: t.rgb as RGB, acc: (t.accent ?? t.rgb) as RGB };
};
const scale = (c: RGB, ks: number[]): RGB[] => ks.map((k) => shade(c, k));
const clampc = (c: RGB): RGB => [Math.min(255, c[0]), Math.min(255, c[1]), Math.min(255, c[2])];
const smooth = (a: number, b: number, t: number): number => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** The height of a rock's grain (lumpy), for light and shade. */
const grain = (s: number, periods: number[] = [32, 16, 8, 4]) => (px: number, py: number): number => fbm(px, py, s, periods);

// ---- limestone: pale layers laid down in the sea, with pits and the odd shell ----
function limestone(x: number, y: number, v: number): RGB {
  const { base } = tile('limestone');
  const s = 1000 + v * 67;
  const yy = y + (vn(x, y, 32, s + 1) - 0.5) * 6;
  const h = grain(s, [32, 16, 8, 4]);
  const layer = h2(0, Math.floor(yy / 3), s + 2) * 0.5 + vn(0, yy, 8, s + 3) * 0.5;
  let c = ramp(scale(base, [0.8, 0.9, 1, 1.05]), (h(x, y) - 0.5) * 1.3 + (layer - 0.5) * 1.1 + 0.5);
  c = shade(c, 1 + lightOf(h, x, y) * 1.2);
  // The line between two layers: a faint shadow, broken.
  if (Math.floor(yy) % 9 === 0 && vn(x, y, 8, s + 4) > 0.35) c = shade(c, 0.88);
  const pit = cells(x, y, 18, s + 5, 0.7);
  if (h2(pit.id, 5, s + 6) > 0.82) c = shade(c, pit.d1 < 1.6 ? 0.78 : pit.d1 < 2.4 ? 0.94 : 1);
  if (h2(x, y, s + 7) > 0.992) c = shade(c, 1.1);
  return c;
}

// ---- basalt: dark columns with fine crystals that glint ----
function basalt(x: number, y: number, v: number): RGB {
  const { base } = tile('basalt');
  const s = 1100 + v * 71;
  const h = grain(s);
  let c = ramp(scale(base, [0.62, 0.84, 1.04, 1.34]), (h(x, y) - 0.5) * 1.6 + 0.5);
  c = shade(c, 1 + lightOf(h, x, y) * 1.6);
  // Columns: thin lines running down, wavering, with a lit side.
  const col = (x + (vn(x, y, 32, s + 1) - 0.5) * 7 + 64) % 11;
  if (col < 0.9 && vn(x, y, 8, s + 2) > 0.3) c = shade(c, 0.66);
  else if (col < 1.9 && vn(x, y, 8, s + 2) > 0.3) c = shade(c, 1.12);
  if (h2(x, y, s + 3) > 0.985) c = shade(c, 1.7);
  return c;
}

// ---- charred stone: burnt black, ash-grey where the fire licked it, a last ember or two ----
function charred(x: number, y: number, v: number): RGB {
  const { base } = tile('charred_stone');
  const s = 1200 + v * 73;
  const h = grain(s);
  let c = ramp(scale(base, [0.62, 0.86, 1.1, 1.5]), (h(x, y) - 0.5) * 1.7 + 0.5);
  c = shade(c, 1 + lightOf(h, x, y) * 1.8);
  const ash = smooth(0.58, 0.8, vn(x, y, 8, s + 1) * 0.6 + vn(x, y, 16, s + 2) * 0.4);
  c = mix(c, [86, 80, 80], ash * 0.65);
  const k = crack(x, y, s + 3, 0.5);
  if (k === 1) c = mix(c, [24, 22, 24], 0.8);
  if (h2(x, y, s + 4) > 0.9985) c = [214, 96, 34];
  return c;
}

// ---- skystone: pale blue-white, with silver glints and thin blue veins ----
function skystone(x: number, y: number, v: number): RGB {
  const { base } = tile('skystone');
  const s = 1300 + v * 79;
  const h = grain(s);
  let c = ramp(scale(base, [0.8, 0.9, 1, 1.07]), (h(x, y) - 0.5) * 1.5 + 0.5);
  c = shade(c, 1 + lightOf(h, x, y) * 1.4);
  if (ridge(x, y, 16, s + 1) < 0.7) c = mix(c, [132, 170, 228], 0.55);
  const facet = cells(x, y, 9, s + 2, 0.85);
  if (facet.d2 - facet.d1 < 0.55) c = shade(c, 0.95);
  if (h2(x, y, s + 3) > 0.985) c = [250, 252, 255];
  return c;
}

// ---- slate: thin plates, each its own shade, split along flat planes ----
function slate(x: number, y: number, v: number): RGB {
  const { base, acc } = tile('slate');
  const s = 1400 + v * 83;
  const yy = y + (vn(x, y, 32, s + 1) - 0.5) * 5;
  const plate = Math.floor(yy / 5);
  const h = (px: number, py: number): number => fbm(px, py, s + 3, [32, 16, 8]) * 0.5 + h2(0, Math.floor((py + (vn(px, py, 32, s + 1) - 0.5) * 5) / 5), s + 2) * 0.5;
  let c = mix(acc, base, h2(0, plate, s + 2) * 0.8 + 0.2);
  c = shade(c, 0.9 + (h(x, y) - 0.4) * 0.5);
  // Each plate is lit on its upper edge, shaded at its foot.
  const t = ((yy % 5) + 5) % 5;
  if (t < 1) c = shade(c, 1.2);
  else if (t >= 4) c = shade(c, 0.78);
  // Flakes that catch the light.
  if (h2(x >> 1, Math.floor(yy), s + 4) > 0.94) c = shade(c, 1.22);
  if (h2(x, y, s + 5) > 0.99) c = shade(c, 1.35);
  return c;
}

// ---- marble: smooth, pale, with long soft veins ----
function marble(x: number, y: number, v: number): RGB {
  const { base, acc } = tile('marble');
  const s = 1500 + v * 89;
  const h = grain(s, [32, 16, 8]);
  let c = ramp(scale(base, [0.9, 0.95, 1, 1.03]), (h(x, y) - 0.5) * 1.2 + 0.5);
  // A soft sheen across the polish.
  const sheen = Math.max(0, 1 - Math.abs(((x + y + (vn(x, y, 32, s + 1) - 0.5) * 20) % 64) - 32) / 9);
  c = shade(c, 1 + sheen * 0.04);
  // Veins: long wavering lines across the stone, each a faint haze round a thin line, in two directions, only in places.
  for (const [seed, ka, kb, weight] of [[s + 2, 1, 2, 1], [s + 3, 2, -1, 0.7]] as const) {
    const phase = (2 * Math.PI * (ka * x + kb * y)) / 64 + (fbm(x, y, seed + 9, [32, 16, 8]) - 0.5) * 9;
    const d = Math.abs(Math.sin(phase)) * 5;
    const here = smooth(0.42, 0.6, vn(x, y, 32, seed + 5));
    if (d < 1.8) c = mix(c, acc, (0.12 + 0.75 * smooth(0.7, 0, d)) * weight * here);
  }  c = shade(c, 1 + lightOf(h, x, y) * 0.5);
  return c;
}

// ---- volcanic rock: black pumice with glowing cracks and ember flecks ----
function volcanic(x: number, y: number, v: number): RGB {
  const { base, acc } = tile('volcanic_rock');
  const s = 1600 + v * 97;
  const h = grain(s);
  let c = ramp(scale(base, [0.62, 0.85, 1.06, 1.4]), (h(x, y) - 0.5) * 1.7 + 0.5);
  c = shade(c, 1 + lightOf(h, x, y) * 1.8);
  const pit = cells(x, y, 14, s + 1, 0.7);
  if (h2(pit.id, 1, s + 2) > 0.7 && pit.d1 < 1.4) c = shade(c, 0.62);
  // Glowing cracks: a dull red haze, an orange line, a bright core.
  const d = ridge(x, y, 16, s + 3);
  const live = smooth(0.4, 0.55, vn(x, y, 8, s + 4));
  if (d < 2.4 && live > 0) {
    const glow = smooth(2.4, 0, d) * live;
    c = mix(c, mix(acc, [255, 190, 90], smooth(0.9, 0, d)), Math.min(1, glow * 1.1));
  }  if (h2(x, y, s + 5) > 0.997) c = [255, 150, 60];
  return c;
}

// ---- frosted stone: grey-blue rock furred with rime ----
function frosted(x: number, y: number, v: number): RGB {
  const { base, acc } = tile('frosted_stone');
  const s = 1700 + v * 101;
  const h = grain(s);
  let c = ramp(scale(base, [0.72, 0.88, 1, 1.1]), (h(x, y) - 0.5) * 1.5 + 0.5);
  c = shade(c, 1 + lightOf(h, x, y) * 1.4);
  const rime = smooth(0.55, 0.72, fbm(x, y, s + 1, [16, 8, 4]) + (h2(x, y, s + 2) - 0.5) * 0.25);
  c = mix(c, acc, rime * 0.8);
  if (h2(x, y, s + 3) > 0.99) c = [255, 255, 255];
  return c;
}

// ---- mossy stone: grey rock with soft moss growing in drifts ----
const MOSS_TONES: RGB[] = [[42, 84, 36], [62, 112, 44], [84, 138, 54], [112, 164, 68]];
function mossy(x: number, y: number, v: number): RGB {
  const { base, acc } = tile('mossy_stone');
  const s = 1800 + v * 103;
  const h = grain(s);
  let c = ramp(scale(base, [0.75, 0.9, 1, 1.12]), (h(x, y) - 0.5) * 1.5 + 0.5);
  c = shade(c, 1 + lightOf(h, x, y) * 1.3);
  const k = crack(x, y, s + 1, 0.5);
  if (k === 1) c = shade(c, 0.7);
  const m = fbm(x, y, s + 2, [32, 16, 8, 4]) + (h2(x >> 1, y >> 1, s + 3) - 0.5) * 0.25;
  const cover = smooth(0.52, 0.64, m);
  if (cover > 0) {
    const tone = ramp(MOSS_TONES.map((t) => mix(t, acc, 0.25)), h2(x, y, s + 4) * 0.5 + (h(x, y) - 0.4) * 0.9 + (1 - cover) * 0.2);
    c = mix(c, tone, cover * 0.95);
  }
  return c;
}

// ---- stormstone: dark blue rock cracked with forked lightning (it glows in the game) ----
function stormstone(x: number, y: number, v: number): RGB {
  const { base, acc } = tile('stormstone');
  const s = 1900 + v * 107;
  const h = grain(s);
  let c = ramp(scale(base, [0.55, 0.78, 1, 1.25]), (h(x, y) - 0.5) * 1.6 + 0.5);
  c = shade(c, 1 + lightOf(h, x, y) * 1.4);
  const wob = (vn(x, y, 8, s + 1) - 0.5) * 6;
  for (const [seed, period] of [[s + 2, 16], [s + 3, 32]] as const) {
    const d = ridge(x + wob, y, period, seed);
    const live = smooth(0.35, 0.5, vn(x, y, 8, seed + 5));
    if (d < 2.2 && live > 0) {
      c = mix(c, acc, Math.min(1, smooth(2.2, 0, d) * 0.9 * live));
      if (d < 0.6) c = mix(c, [236, 248, 255], live);
    }
  }
  if (h2(x, y, s + 4) > 0.993) c = mix(c, acc, 0.9);
  return c;
}

// ---- weathered obsidian: glassy black gone dull, pitted, with violet in its cracks ----
function weathered(x: number, y: number, v: number): RGB {
  const { base, acc } = tile('weathered_obsidian');
  const s = 2000 + v * 109;
  const h = grain(s);
  let c = ramp(scale(base, [0.45, 0.7, 1, 1.4]), (h(x, y) - 0.5) * 1.7 + 0.5);
  c = shade(c, 1 + lightOf(h, x, y) * 2);
  const patina = smooth(0.58, 0.78, fbm(x, y, s + 1, [16, 8, 4]));
  c = mix(c, [96, 84, 120], patina * 0.4);
  const d = ridge(x, y, 16, s + 2);
  const live = smooth(0.4, 0.55, vn(x, y, 8, s + 3));
  if (d < 1.6 && live > 0) c = mix(c, acc, smooth(1.6, 0, d) * live);
  if (h2(x, y, s + 4) > 0.993) c = mix(c, acc, 0.8);
  return c;
}

// ---- fossil rock: tan sandstone with the shells and ribs of old animals pressed in ----
const FOSSILS: [number, number, number][] = [[14, 16, 0], [46, 14, 1], [30, 46, 1]];
function fossil(x: number, y: number, v: number): RGB {
  const { base, acc } = tile('fossil_rock');
  const s = 2100 + v * 113;
  const h = grain(s);
  let c = ramp(scale(base, [0.76, 0.9, 1, 1.08]), (h(x, y) - 0.5) * 1.5 + 0.5);
  const yy = y + (vn(x, y, 32, s + 1) - 0.5) * 4;
  c = shade(c, 0.95 + (h2(0, Math.floor(yy / 2), s + 2) - 0.5) * 0.1 + lightOf(h, x, y) * 1.2);
  // The fossils: an ammonite (a spiral) or a rib (a pale curved bar), at places that differ from one picture to the other.
  for (const [fx0, fy0, kind] of FOSSILS) {
    const fx = fx0 + (v ? 9 : 0) * (kind ? -1 : 1);
    const fy = fy0 + (v ? 7 : 0);
    const dx = ((x - fx + 96) % 64) - 32;
    const dy = ((y - fy + 96) % 64) - 32;
    const d = Math.hypot(dx, dy);
    if (kind === 0) {
      if (d < 9.5) {
        const phase = d / 2.4 + Math.atan2(dy, dx) / (2 * Math.PI);
        const line = ((phase % 1) + 1) % 1;
        c = line < 0.55 ? mix(c, acc, 0.85 - d * 0.02) : shade(mix(c, acc, 0.25), 0.82);
      }
    } else {
      const arc = Math.abs(Math.hypot(dx * 0.7, dy + 9) - 10);
      if (arc < 1.5 && dy < 4 && Math.abs(dx) < 11) c = mix(c, acc, 0.9);
      else if (arc < 2.4 && dy < 4 && Math.abs(dx) < 11) c = shade(c, 0.85);
    }
  }
  if (h2(x, y, s + 3) > 0.99) c = shade(c, 1.12);
  return c;
}

// ---- bone block: smooth ivory with long fibres and a few pores ----
function bone(x: number, y: number, v: number): RGB {
  const { base, acc } = tile('bone_block');
  const s = 2200 + v * 127;
  const h = grain(s, [32, 16, 8]);
  let c = ramp(scale(base, [0.88, 0.95, 1, 1.04]), (h(x, y) - 0.5) * 1.2 + 0.5);
  // Fibres running down the bone.
  const fib = h2(x >> 1, Math.floor((y + vn(x, y, 32, s + 1) * 12) / 6), s + 2);
  c = mix(c, acc, fib > 0.7 ? (fib - 0.7) * 1.4 : 0);
  c = shade(c, 1 + lightOf(h, x, y) * 0.9);
  const pore = cells(x, y, 12, s + 3, 0.8);
  if (h2(pore.id, 3, s + 4) > 0.8 && pore.d1 < 1.3) c = mix(c, acc, 0.6);
  return clampc(c);
}

// ---- salt: white crystals, pinkish in the hollows, sparkling ----
function salt(x: number, y: number, v: number): RGB {
  const { base, acc } = tile('salt_block');
  const s = 2300 + v * 131;
  const crystal = cells(x, y, 9, s, 0.85);
  let c = mix(acc, base, 0.35 + 0.65 * h2(crystal.id, 1, s + 1));
  c = shade(c, 1 - (crystal.dx + crystal.dy) * 0.012 + (fbm(x, y, s + 2, [16, 8]) - 0.5) * 0.12);
  if (crystal.d2 - crystal.d1 < 0.7) c = shade(mix(c, [226, 210, 210], 0.3), 0.9);
  if (h2(x, y, s + 3) > 0.985) c = [255, 255, 255];
  return clampc(c);
}

// ---- blue ice: deep blue, clear, with bright streaks and cracks running through ----
function blueIce(x: number, y: number, v: number): RGB {
  const { base, acc } = tile('blue_ice');
  const s = 2400 + v * 137;
  const h = grain(s, [32, 16, 8]);
  let c = ramp([shade(base, 0.7), shade(base, 0.9), base, mix(base, acc, 0.45)], (h(x, y) - 0.5) * 1.5 + 0.5);
  c = shade(c, 1 + lightOf(h, x, y) * 1.6);
  const streak = Math.abs(((x * 2 + y + (vn(x, y, 32, s + 1) - 0.5) * 24) % 40) - 20);
  if (streak < 1.4) c = mix(c, acc, 0.4 * (1 - streak / 1.4));
  if (ridge(x, y, 16, s + 2) < 0.6 && vn(x, y, 8, s + 3) > 0.4) c = mix(c, [236, 248, 255], 0.75);
  if (h2(x, y, s + 4) > 0.99) c = [240, 250, 255];
  return clampc(c);
}

// ---- smooth stone: ground flat, close to uniform, with a sheen and the faintest grain ----
function smoothStone(x: number, y: number, v: number): RGB {
  const s = 2500 + v * 139;
  const h = grain(s, [32, 16, 8]);
  let c = ramp([[118, 120, 124], [134, 136, 139], [148, 149, 150], [158, 158, 158]], (h(x, y) - 0.5) * 1.3 + 0.5);
  c = shade(c, 1 + lightOf(h, x, y) * 0.8 + (h2(x, y, s + 1) - 0.5) * 0.04);
  const sheen = Math.max(0, 1 - Math.abs(((x + y + (vn(x, y, 32, s + 2) - 0.5) * 16) % 64) - 32) / 12);
  return shade(c, 1 + sheen * 0.05);
}

export const ROCK_PICS = [
  ...pair('smooth_stone', smoothStone),
  ...pair('limestone', limestone),
  ...pair('basalt', basalt),
  ...pair('charred_stone', charred),
  ...pair('skystone', skystone),
  ...pair('slate', slate),
  ...pair('marble', marble),
  ...pair('volcanic_rock', volcanic),
  ...pair('frosted_stone', frosted),
  ...pair('mossy_stone', mossy),
  ...pair('stormstone', stormstone),
  ...pair('weathered_obsidian', weathered),
  ...pair('fossil_rock', fossil),
  ...pair('bone_block', bone),
  ...pair('salt_block', salt),
  ...pair('blue_ice', blueIce),
];
