/**
 * Ground and soft things, drawn by hand at 64 x 64 as fields (laid over the world with no seams, two pictures per block, see
 * heroTiles.ts): the sands with their wind ripples, gravel, snow and ice, clays and muds, soils, mosses and turf.
 */
import { beyondTiles } from '@solrift/shared';
import { cells, fbm, h2, mix, ramp, ridge, shade, vn, type RGB } from './heroKit';
import { lightOf, pair } from './heroStone';

const tile = (name: string): { base: RGB; acc: RGB } => {
  const t = beyondTiles()[name];
  return { base: t.rgb as RGB, acc: (t.accent ?? t.rgb) as RGB };
};
const scale = (c: RGB, ks: number[]): RGB[] => ks.map((k) => shade(c, k));
const smooth = (a: number, b: number, t: number): number => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const grain = (s: number, periods: number[] = [32, 16, 8, 4]) => (px: number, py: number): number => fbm(px, py, s, periods);
const PI2 = Math.PI * 2;

/**
 * Sand: broad drifts of tone, wind ripples (long wavering ridges, lit on one slope) and a fine grain, a few darker grains among
 * them. `ka`, `kb` set the direction and spacing of the ripples (whole numbers, so they wrap).
 */
function dunes(pal: RGB[], s: number, ka: number, kb: number, ripple: number, v: number) {
  return (x: number, y: number): RGB => {
    const h = grain(s + v * 17, [32, 16, 8]);
    const phase = (PI2 * (ka * x + kb * y)) / 64 + (fbm(x, y, s + v * 17 + 5, [32, 16, 8]) - 0.5) * 7;
    let c = ramp(pal, (h(x, y) - 0.5) * 1.3 + 0.5 + Math.sin(phase) * ripple);
    // The side of a ripple that faces the sun is lit, the other shaded.
    c = shade(c, 1 + Math.cos(phase) * ripple * 0.34 + lightOf(h, x, y) * 0.9);
    const g = h2(x, y, s + v * 17 + 7);
    c = shade(c, 1 + (g - 0.5) * 0.07);
    if (g > 0.94) c = shade(c, 0.9);
    else if (g < 0.02) c = shade(c, 1.07);
    return c;
  };
}

const sand = (v: number) => dunes([[198, 180, 130], [212, 196, 146], [226, 212, 162], [238, 224, 176]], 3000, 3, 5, 0.18, v);
function sandPic(x: number, y: number, v: number): RGB {
  const c = sand(v)(x, y);
  if (h2(x, y, 3001 + v) > 0.9985) return [232, 204, 180]; // a bit of shell
  return c;
}
const redSand = (x: number, y: number, v: number): RGB => dunes([[170, 86, 40], [186, 98, 46], [202, 112, 54], [214, 126, 66]], 3100, 3, 5, 0.18, v)(x, y);
function whiteSand(x: number, y: number, v: number): RGB {
  const { base } = tile('white_sand');
  return dunes(scale(base, [0.84, 0.92, 1, 1.05]), 3200, 2, 5, 0.14, v)(x, y);
}
function blackSand(x: number, y: number, v: number): RGB {
  const { base } = tile('black_sand');
  const c = dunes(scale(base, [0.7, 0.9, 1.1, 1.4]), 3300, 3, 4, 0.2, v)(x, y);
  // Glinting grains of the volcanic glass.
  return h2(x, y, 3301 + v) > 0.985 ? [150, 150, 164] : c;
}
function crystalSand(x: number, y: number, v: number): RGB {
  const { base, acc } = tile('crystal_sand');
  let c = dunes(scale(base, [0.84, 0.93, 1, 1.06]), 3400, 3, 5, 0.12, v)(x, y);
  // Glass fused in streaks across the sand, bright where the sun finds it.
  const streak = Math.abs(((x * 2 + y * 3 + (vn(x, y, 32, 3401) - 0.5) * 22) % 46) - 23);
  if (streak < 1.1 && vn(x, y, 8, 3402 + v) > 0.4) c = mix(c, acc, 0.85);
  if (h2(x, y, 3403 + v) > 0.985) c = [255, 252, 232];
  return c;
}
/** Sandstone and its red kin as a flat top: the same sands with the ripples pressed nearly flat, and a faint cracked grain. */
function sandstoneTop(x: number, y: number, v: number): RGB {
  let c = dunes([[204, 188, 138], [216, 202, 152], [226, 212, 164], [234, 220, 174]], 3500, 2, 3, 0.05, v)(x, y);
  const f = cells(x, y, 4, 3501 + v, 0.85);
  if (f.d2 - f.d1 < 0.7) c = shade(c, 0.94);
  return c;
}
function redSandstoneTop(x: number, y: number, v: number): RGB {
  let c = dunes([[170, 86, 42], [182, 94, 46], [192, 102, 50], [200, 110, 58]], 3600, 2, 3, 0.05, v)(x, y);
  const f = cells(x, y, 4, 3601 + v, 0.85);
  if (f.d2 - f.d1 < 0.7) c = shade(c, 0.93);
  return c;
}

// ---- gravel: a bed of pebbles, big and small, each its own colour, lit on the upper left ----
const PEBBLES: RGB[] = [[148, 142, 136], [124, 120, 118], [158, 146, 130], [110, 114, 122], [136, 130, 124], [170, 160, 146]];
function gravel(x: number, y: number, v: number): RGB {
  const s = 3700 + v * 19;
  const big = cells(x, y, 8, s, 0.85, 1.1);
  const small = cells(x, y, 17, s + 3, 0.85);
  // The small ones fill the gaps between the big ones.
  const useBig = big.d2 - big.d1 + (vn(x, y, 8, s + 6) - 0.5) * 1.2 > 1.6;
  const stoneCell = useBig ? big : small;
  const r = useBig ? 7 : 3.4;
  let c = mix(PEBBLES[Math.floor(h2(stoneCell.id, useBig ? 1 : 2, s + 1) * PEBBLES.length)], [140, 126, 112], 0.15 * h2(stoneCell.id, 5, s + 8));
  // Domed: bright on the upper left, dark on the lower right.
  const dome = (stoneCell.dx + stoneCell.dy) / r;
  c = shade(c, 0.98 - dome * 0.26 + (fbm(x, y, s + 4, [8, 4]) - 0.5) * 0.18);
  const gap = stoneCell.d2 - stoneCell.d1 + (vn(x, y, 4, s + 5) - 0.5) * 0.8;
  if (gap < 1.1) c = shade(c, 0.62 + gap * 0.3);
  if (h2(x, y, s + 7) > 0.97) c = shade(c, 0.86);
  return c;
}

// ---- snow: soft drifts, blue in the hollows, a glitter on top ----
const SNOW: RGB[] = [[204, 218, 238], [220, 232, 248], [236, 244, 254], [250, 252, 255]];
function snow(x: number, y: number, v: number): RGB {
  const s = 3800 + v * 23;
  const h = grain(s, [32, 16, 8]);
  let c = ramp(SNOW, (h(x, y) - 0.5) * 1.5 + 0.55);
  c = shade(c, 1 + lightOf(h, x, y) * 2.2);
  const g = h2(x, y, s + 1);
  if (g > 0.992) c = [255, 255, 255];
  else if (g < 0.01) c = shade(c, 0.94);
  return c;
}

// ---- packed ice: pale blue, frosted, with long streaks and fractures ----
function packedIce(x: number, y: number, v: number): RGB {
  const s = 3900 + v * 29;
  const h = grain(s, [32, 16, 8]);
  let c = ramp([[116, 152, 222], [134, 170, 234], [152, 186, 242], [172, 204, 250]], (h(x, y) - 0.5) * 1.5 + 0.5);
  c = shade(c, 1 + lightOf(h, x, y) * 1.6);
  const streak = Math.abs(((x * 2 + y * 3 + (vn(x, y, 32, s + 1) - 0.5) * 20) % 43) - 21.5);
  if (streak < 2) c = mix(c, [226, 240, 255], 0.45 * (1 - streak / 2));
  const frost = smooth(0.62, 0.8, fbm(x, y, s + 2, [16, 8, 4]));
  c = mix(c, [214, 232, 252], frost * 0.55);
  if (ridge(x, y, 16, s + 3) < 0.6 && vn(x, y, 8, s + 4) > 0.58) c = shade(c, 0.78);
  return c;
}

// ---- clay: smooth and cool, finger-marked, with the odd pit ----
function clay(x: number, y: number, v: number): RGB {
  const s = 4000 + v * 31;
  const h = grain(s, [32, 16, 8]);
  let c = ramp([[142, 148, 166], [156, 162, 178], [168, 174, 190], [178, 184, 198]], (h(x, y) - 0.5) * 1.4 + 0.5);
  c = shade(c, 1 + lightOf(h, x, y) * 1.8 + (h2(x, y, s + 1) - 0.5) * 0.03);
  // Smears where a hand pulled the clay.
  const smear = Math.abs(((x * 3 - y * 2 + (vn(x, y, 16, s + 2) - 0.5) * 12) % 29) - 14.5);
  if (smear < 0.9) c = shade(c, 1.05);
  const pit = cells(x, y, 14, s + 3, 0.7);
  if (h2(pit.id, 3, s + 4) > 0.86 && pit.d1 < 1.5) c = shade(c, 0.82);
  return c;
}

// ---- mud: dark, wet, glossy where it is smooth ----
function mud(x: number, y: number, v: number): RGB {
  const s = 4100 + v * 37;
  const h = grain(s, [32, 16, 8]);
  let c = ramp([[48, 36, 30], [62, 48, 38], [78, 62, 48], [92, 74, 58]], (h(x, y) - 0.5) * 1.6 + 0.5);
  c = shade(c, 1 + lightOf(h, x, y) * 2);
  const wet = smooth(0.58, 0.72, fbm(x, y, s + 1, [16, 8]));
  c = mix(c, [124, 112, 100], wet * 0.4);
  if (wet > 0.7 && h2(x, y, s + 2) > 0.94) c = mix(c, [176, 166, 154], 0.6);
  return c;
}

// ---- packed mud: dried to a pale brown, in cracked plates ----
function packedMud(x: number, y: number, v: number): RGB {
  const s = 4200 + v * 41;
  const plate = cells(x, y, 5, s, 0.85);
  const h = grain(s + 1, [16, 8, 4]);
  let c = ramp([[116, 86, 62], [132, 98, 70], [148, 112, 80], [160, 124, 90]], h2(plate.id, 1, s + 2) * 0.5 + (h(x, y) - 0.5) * 0.9 + 0.3);
  c = shade(c, 1 - (plate.dx + plate.dy) * 0.012 + lightOf(h, x, y) * 1.4);
  const gap = plate.d2 - plate.d1 + (vn(x, y, 8, s + 3) - 0.5) * 1.1;
  if (gap < 0.6) c = shade(c, 0.6);
  else if (gap < 1.4) c = shade(c, plate.dx + plate.dy < 0 ? 1.05 : 0.9);
  return c;
}

// ---- coarse dirt: stony soil with pale pebbles pressed in ----
const SOIL: RGB[] = [[112, 76, 50], [126, 86, 58], [140, 98, 66], [154, 110, 76]];
function coarseDirt(x: number, y: number, v: number): RGB {
  const s = 4300 + v * 43;
  const h = grain(s);
  let c = ramp(SOIL, (h(x, y) - 0.5) * 1.6 + 0.5);
  c = shade(c, 1 + lightOf(h, x, y) * 1.8);
  const peb = cells(x, y, 12, s + 1, 0.8);
  if (h2(peb.id, 1, s + 2) > 0.5 && peb.d1 < 2.1) {
    const dome = (peb.dx + peb.dy) / 2.2;
    c = shade(mix(c, [168, 158, 146], 0.9), 0.96 - dome * 0.22);
  }
  return c;
}

// ---- rooted dirt: soil threaded with pale roots ----
function rootedDirt(x: number, y: number, v: number): RGB {
  const s = 4400 + v * 47;
  const h = grain(s);
  let c = ramp([[118, 80, 54], [132, 92, 62], [146, 104, 70], [158, 116, 82]], (h(x, y) - 0.5) * 1.6 + 0.5);
  c = shade(c, 1 + lightOf(h, x, y) * 1.6);
  const root = ridge(x, y, 16, s + 1);
  const live = vn(x, y, 8, s + 2) > 0.55;
  if (root < 0.7 && live) c = mix(c, [200, 178, 138], 0.85);
  else if (root < 1.5 && live) c = shade(c, 0.8);
  return c;
}

// ---- podzol: dark forest floor under a litter of needles ----
function podzol(x: number, y: number, v: number): RGB {
  const s = 4500 + v * 53;
  const h = grain(s);
  let c = ramp([[66, 44, 26], [84, 56, 30], [102, 68, 34], [122, 82, 40]], (h(x, y) - 0.5) * 1.5 + 0.5);
  c = shade(c, 1 + lightOf(h, x, y) * 1.4);
  // Needles: short strokes, all leaning the same way.
  const ox = x + (y >> 1);
  const needle = h2(ox >> 1, y, s + 1);
  if (needle > 0.88) c = mix(c, [176, 126, 62], 0.8);
  else if (needle < 0.07) c = shade(c, 0.6);
  if (h2(x, y, s + 2) > 0.995) c = [196, 70, 50];
  return c;
}

// ---- mycelium: purple-grey felt with white spore dust ----
function mycelium(x: number, y: number, v: number): RGB {
  const s = 4600 + v * 59;
  const h = grain(s);
  let c = ramp([[78, 66, 90], [94, 80, 106], [110, 94, 122], [128, 110, 138]], (h(x, y) - 0.5) * 1.6 + 0.5);
  c = shade(c, 1 + lightOf(h, x, y) * 1.6);
  const tuft = smooth(0.6, 0.78, fbm(x, y, s + 1, [16, 8, 4]));
  c = mix(c, [176, 156, 188], tuft * 0.6);
  const sp = h2(x, y, s + 2);
  if (sp > 0.985) c = [236, 226, 240];
  else if (sp < 0.03) c = shade(c, 0.74);
  return c;
}

// ---- peat: black-brown fibres packed in rows ----
function peat(x: number, y: number, v: number): RGB {
  const { base, acc } = tile('peat');
  const s = 4700 + v * 61;
  const h = grain(s, [32, 16, 8]);
  let c = ramp([shade(acc, 0.9), acc, base, shade(base, 1.35)], (h(x, y) - 0.5) * 1.6 + 0.5);
  // Fibres: short runs along the rows.
  const row = y + (vn(x, y, 32, s + 1) - 0.5) * 4;
  const fib = h2(x >> 2, Math.floor(row), s + 2);
  if (fib > 0.78) c = shade(c, 1.28);
  else if (fib < 0.16) c = shade(c, 0.7);
  c = shade(c, 1 + lightOf(h, x, y) * 1.4);
  return c;
}

// ---- permafrost: frozen brown-grey earth shot through with ice ----
function permafrost(x: number, y: number, v: number): RGB {
  const { base, acc } = tile('permafrost');
  const s = 4800 + v * 67;
  const h = grain(s);
  let c = ramp(scale(base, [0.74, 0.9, 1.04, 1.18]), (h(x, y) - 0.5) * 1.6 + 0.5);
  c = shade(c, 1 + lightOf(h, x, y) * 1.5);
  const ice = cells(x, y, 10, s + 1, 0.8);
  const w = (vn(x, y, 4, s + 2) - 0.5) * 1.6;
  if (h2(ice.id, 1, s + 3) > 0.6 && ice.d1 + w < 2.6) c = mix(c, acc, ice.d1 + w < 1.6 ? 0.8 : 0.35);
  if (h2(x, y, s + 4) > 0.99) c = [244, 252, 255];
  return c;
}

// ---- ash: a soft grey powder in drifts ----
function ash(x: number, y: number, v: number): RGB {
  const { base } = tile('ash_block');
  const s = 4900 + v * 71;
  const h = grain(s, [32, 16, 8]);
  let c = ramp(scale(base, [0.72, 0.9, 1.06, 1.26]), (h(x, y) - 0.5) * 1.7 + 0.5);
  c = shade(c, 1 + lightOf(h, x, y) * 1.8 + (h2(x, y, s + 1) - 0.5) * 0.06);
  if (h2(x, y, s + 2) > 0.99) c = shade(c, 1.4);
  else if (h2(x, y, s + 3) < 0.012) c = shade(c, 0.6);
  return c;
}

// ---- moss: a lush green pile, in tufts ----
function mossBlock(x: number, y: number, v: number): RGB {
  const s = 5000 + v * 73;
  const h = grain(s);
  let c = ramp([[50, 78, 28], [66, 98, 34], [86, 124, 42], [112, 150, 58]], (h(x, y) - 0.5) * 1.6 + 0.5);
  c = shade(c, 1 + lightOf(h, x, y) * 2);
  // Tufts: short bright strokes with a dark shadow under each.
  const t = h2(x >> 1, y >> 1, s + 1);
  if (t > 0.86) c = shade(c, 1.28);
  else if (t < 0.1) c = shade(c, 0.7);
  return c;
}
function paleMoss(x: number, y: number, v: number): RGB {
  const s = 5100 + v * 79;
  const h = grain(s);
  let c = ramp([[104, 114, 90], [122, 132, 104], [140, 150, 120], [158, 168, 136]], (h(x, y) - 0.5) * 1.6 + 0.5);
  c = shade(c, 1 + lightOf(h, x, y) * 1.8);
  const t = h2(x >> 1, y >> 1, s + 1);
  if (t > 0.86) c = shade(c, 1.22);
  else if (t < 0.1) c = shade(c, 0.74);
  return c;
}
function luminousMoss(x: number, y: number, v: number): RGB {
  const { base, acc } = tile('luminous_moss');
  const s = 5200 + v * 83;
  const h = grain(s);
  let c = ramp(scale(base, [0.6, 0.8, 1, 1.2]), (h(x, y) - 0.5) * 1.6 + 0.5);
  c = shade(c, 1 + lightOf(h, x, y) * 1.8);
  const t = h2(x >> 1, y >> 1, s + 1);
  if (t > 0.88) c = shade(c, 1.25);
  const glow = h2(x, y, s + 2);
  if (glow > 0.97) c = mix(c, acc, 0.9);
  else if (glow > 0.93) c = mix(c, acc, 0.35);
  return c;
}

// ---- dripstone: brown rock with pale streaks where the water ran ----
function dripstone(x: number, y: number, v: number): RGB {
  const s = 5300 + v * 89;
  const h = grain(s);
  const yy = y + (vn(x, y, 32, s + 1) - 0.5) * 4;
  let c = ramp([[108, 88, 74], [122, 100, 84], [136, 112, 94], [150, 124, 104]], (h(x, y) - 0.5) * 1.5 + 0.5 + (h2(0, Math.floor(yy / 2), s + 2) - 0.5) * 0.3);
  c = shade(c, 1 + lightOf(h, x, y) * 1.4);
  // Streaks running down.
  const col = vn(x, 0, 4, s + 3);
  if (col > 0.62 && ((y + col * 60) % 23) < 15) c = shade(c, 1.12);
  if (h2(x, y, s + 4) > 0.97) c = shade(c, 0.82);
  return c;
}

// ---- sculk: near-black with glowing teal tendrils ----
function sculk(x: number, y: number, v: number): RGB {
  const s = 5400 + v * 97;
  const h = grain(s, [16, 8, 4]);
  let c = ramp([[8, 16, 22], [14, 24, 32], [20, 34, 44], [28, 46, 58]], (h(x, y) - 0.5) * 1.5 + 0.5);
  c = shade(c, 1 + lightOf(h, x, y) * 1.4);
  for (const [seed, period] of [[s + 1, 16]] as const) {
    const d = ridge(x, y, period, seed);
    if (d < 2) c = mix(c, [24, 120, 120], smooth(2, 0.6, d) * 0.9);
    if (d < 0.6) c = mix(c, [60, 230, 208], 1);
  }
  if (h2(x, y, s + 3) > 0.985) c = [90, 240, 220];
  return c;
}

// ---- amethyst: big purple crystal facets, lit on their upper left edges ----
function amethyst(x: number, y: number, v: number): RGB {
  const s = 5500 + v * 101;
  const f = cells(x, y, 6, s, 0.9);
  const tones: RGB[] = [[112, 74, 172], [132, 92, 196], [150, 108, 214], [168, 128, 228]];
  let c = tones[Math.floor(h2(f.id, 1, s + 1) * tones.length)];
  c = shade(c, 1 - (f.dx + f.dy) * 0.022 + (fbm(x, y, s + 2, [8, 4]) - 0.5) * 0.12);
  const gap = f.d2 - f.d1;
  if (gap < 0.8) c = shade(c, 0.58);
  else if (gap < 1.8) c = shade(c, f.dx + f.dy < 0 ? 1.28 : 0.8);
  if (h2(x, y, s + 3) > 0.99) c = [226, 206, 255];
  return c;
}
function buddingAmethyst(x: number, y: number, v: number): RGB {
  const c = amethyst(x, y, v);
  const bud = cells(x, y, 8, 5600 + v * 107, 0.8);
  if (bud.d1 < 1.5) return shade([60, 34, 100], 1 + (bud.dx + bud.dy) * -0.03);
  if (bud.d1 < 2.6 && h2(bud.id, 4, 5601) > 0.3) return shade(c, 1.28);
  return c;
}

// ---- the turfs of the wild lands: the lawn's way, in each land's own colour ----
function turfOf(name: string, seed: number) {
  return (x: number, y: number, v: number): RGB => {
    const { base } = tile(name);
    const s = seed + v * 109;
    const h = grain(s, [32, 16, 8, 4]);
    let c = ramp(scale(base, [0.66, 0.82, 1, 1.14, 1.28]), (h(x, y) - 0.5) * 1.7 + 0.5);
    // Blades: dark strokes with bright tips, in short runs.
    const row = y + (x >> 1) * 7;
    if (h2(x >> 1, row >> 2, s + 1) > 0.74) c = (row & 3) === 0 ? shade(c, 1.22) : shade(c, 0.84);
    c = shade(c, 1 + lightOf(h, x, y) * 1.2);
    return c;
  };
}

export const SOIL_PICS = [
  ...pair('sand', sandPic),
  ...pair('red_sand', redSand),
  ...pair('white_sand', whiteSand),
  ...pair('black_sand', blackSand),
  ...pair('crystal_sand', crystalSand),
  ...pair('sandstone_top', sandstoneTop),
  ...pair('red_sandstone_top', redSandstoneTop),
  ...pair('gravel', gravel),
  ...pair('snow', snow),
  ...pair('packed_ice', packedIce),
  ...pair('clay', clay),
  ...pair('mud', mud),
  ...pair('packed_mud', packedMud),
  ...pair('coarse_dirt', coarseDirt),
  ...pair('rooted_dirt', rootedDirt),
  ...pair('podzol_top', podzol),
  ...pair('mycelium_top', mycelium),
  ...pair('peat', peat),
  ...pair('permafrost', permafrost),
  ...pair('ash_block', ash),
  ...pair('moss_block', mossBlock),
  ...pair('pale_moss_block', paleMoss),
  ...pair('luminous_moss', luminousMoss),
  ...pair('dripstone_block', dripstone),
  ...pair('sculk', sculk),
  ...pair('amethyst_block', amethyst),
  ...pair('budding_amethyst', buddingAmethyst),
  ...pair('golden_grass_block_top', turfOf('golden_grass_block_top', 5700)),
  ...pair('dead_grass_block_top', turfOf('dead_grass_block_top', 5800)),
  ...pair('tundra_turf_top', turfOf('tundra_turf_top', 5900)),
];
