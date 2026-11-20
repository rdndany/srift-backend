/**
 * The natural stones, drawn by hand at 64 x 64 and shown by the terrain shader laid over the world, not block by block (see
 * heroTiles.ts: "field" tiles). Each has two pictures; the shader drifts between them across the world, so a cliff of stone is one
 * piece of rock, with no seams where blocks meet, no square to be found, and no repeat to spot.
 *
 * The relief is painted in: every stone has a little height field, lit from the upper left, so its blotches, cracks and grains are
 * lumps and hollows and not just colours.
 */
import { cells, fbm, h2, mix, ramp, ridge, shade, vn, type HeroPainter, type HeroPixel, type RGB } from './heroKit';

type Field = (x: number, y: number, v: number) => RGB;

/** The two pictures of a field tile. */
export function pair(tile: string, paint: Field): { key: string; tile: string; paint: HeroPainter }[] {
  return [0, 1].map((v) => ({ key: `${tile}_${v}`, tile, paint: (x: number, y: number): HeroPixel => {
    const c = paint(x, y, v);
    return [c[0], c[1], c[2], 255];
  } }));
}

/** How much a height field slopes towards the light (the upper left): positive is lit, negative shaded. */
export const lightOf = (h: (x: number, y: number) => number, x: number, y: number): number => h(x - 1, y - 1) - h(x + 1, y + 1);

/** A crack: 1 along its thin line, a lit lip of 0.45 beside it, 0 away; it wanders and breaks off here and there. */
export function crack(x: number, y: number, seed: number, width = 0.6): number {
  if (vn(x, y, 8, seed + 1) < 0.38) return 0;
  const r = ridge(x, y, 16, seed);
  return r < width ? 1 : r < width * 2.3 ? 0.45 : 0;
}
// ---- stone ----
const STONE: RGB[] = [[88, 90, 96], [108, 110, 114], [128, 129, 131], [148, 147, 145], [166, 163, 159]];
/**
 * A mass of rock: broad slabs (each a little different in tone and tilted a little to the light) with faint fracture lines between
 * them, soft grain over all, and drifts of warm and cool grey. Low contrast, so it reads as one rock and not as a pattern.
 */
function stone(x: number, y: number, v: number): RGB {
  const s = 100 + v * 29;
  const slab = cells(x, y, 6, s, 0.85);
  const h = (px: number, py: number): number => fbm(px, py, s + 11, [16, 8, 4]);
  const tone = h2(slab.id, 1, s + 2) * 0.4 + fbm(x, y, s + 3, [32, 16]) * 0.7;
  let c = ramp(STONE, (tone - 0.5) * 1.5 + 0.5);
  const d = vn(x, y, 32, s + 40) - 0.5;
  c = mix(c, d > 0 ? [156, 142, 124] : [110, 120, 138], Math.abs(d) * 0.45);
  // Each slab is tilted a little towards the light, and the grain of the rock is lumpy.
  c = shade(c, 1 - (slab.dx + slab.dy) * 0.009 + lightOf(h, x, y) * 1.1);
  // A faint fracture where slabs meet, broken here and there; a darker hairline crack now and then.
  const gap = slab.d2 - slab.d1 + (vn(x, y, 8, s + 4) - 0.5) * 1.4;
  if (gap < 0.8 && vn(x, y, 16, s + 5) > 0.4) c = shade(c, slab.dx + slab.dy > 0 ? 0.84 : 1.06);
  const k = crack(x, y, s + 3);
  if (k === 1) c = shade(c, 0.68);
  const f = h2(x, y, s + 5);
  if (f > 0.99) c = shade(c, 1.2);
  else if (f < 0.012) c = shade(c, 0.74);
  return c;
}
/** The plain stone's first picture, for the pictures that are stone with something in it (see heroOre.ts). */
export const stoneBase = (x: number, y: number): RGB => stone(x, y, 0);
// ---- granite ----
const GRANITE: RGB[] = [[128, 90, 82], [148, 106, 92], [164, 122, 106], [178, 136, 120]];
function granite(x: number, y: number, v: number): RGB {
  const s = 200 + v * 31;
  const h = (px: number, py: number): number => fbm(px, py, s, [32, 16, 8]);
  let c = ramp(GRANITE, (h(x, y) - 0.5) * 1.7 + 0.5);
  c = shade(c, 1 + lightOf(h, x, y) * 0.9);
  // Grains of two or three pixels: dark mica, pale quartz, and rosy feldspar.
  const g = h2(x >> 1, y >> 1, s + 2) * 0.7 + vn(x, y, 4, s + 3) * 0.3;
  if (g > 0.82) c = mix(c, [90, 52, 48], 0.75);
  else if (g < 0.1) c = mix(c, [216, 188, 172], 0.7);
  else if (g > 0.7 && h2(x, y, s + 4) > 0.5) c = mix(c, [196, 118, 104], 0.4);
  if (h2(x, y, s + 6) > 0.992) c = [236, 224, 214];
  return c;
}

// ---- diorite ----
const DIORITE: RGB[] = [[150, 150, 154], [182, 182, 186], [206, 206, 206], [226, 225, 221]];
function diorite(x: number, y: number, v: number): RGB {
  const s = 300 + v * 37;
  const h = (px: number, py: number): number => fbm(px, py, s, [32, 16, 8]);
  let c = ramp(DIORITE, (h(x, y) - 0.5) * 1.6 + 0.5);
  c = shade(c, 1 + lightOf(h, x, y) * 1.4);
  // Black speck clusters: little irregular groups, with a ring of grey round them.
  const cl = cells(x, y, 11, s + 1, 0.8);
  const pick = h2(cl.id, 1, s + 2);
  if (pick > 0.5) {
    const w = (vn(x, y, 4, s + 3) - 0.5) * 1.1;
    if (cl.d1 + w < 1.5) c = mix(c, [62, 62, 68], 0.9);
    else if (cl.d1 + w < 2.6) c = mix(c, [122, 122, 128], 0.5);
  }
  if (h2(x, y, s + 4) > 0.985) c = mix(c, [96, 96, 102], 0.7);
  return c;
}

// ---- andesite ----
const ANDESITE: RGB[] = [[106, 106, 110], [124, 124, 127], [140, 140, 142], [156, 156, 156]];
function andesite(x: number, y: number, v: number): RGB {
  const s = 400 + v * 41;
  const h = (px: number, py: number): number => fbm(px, py, s, [32, 16, 8, 4]);
  let c = ramp(ANDESITE, (h(x, y) - 0.5) * 1.8 + 0.5);
  c = shade(c, 1 + lightOf(h, x, y) * 2);
  // Soft dark blotches and fine freckles.
  const b = cells(x, y, 10, s + 2, 0.8);
  if (h2(b.id, 2, s + 3) > 0.45) {
    const w = (vn(x, y, 8, s + 4) - 0.5) * 1.8;
    if (b.d1 + w < 2.2) c = shade(mix(c, [96, 96, 102], 0.55), 0.96);
  }
  if (h2(x, y, s + 5) > 0.975) c = shade(c, 0.78);
  else if (h2(x, y, s + 6) < 0.02) c = shade(c, 1.16);
  return c;
}

// ---- deepslate ----
const DEEP: RGB[] = [[40, 41, 52], [54, 55, 66], [70, 71, 82], [88, 89, 100]];
function deepslate(x: number, y: number, v: number): RGB {
  const s = 500 + v * 43;
  // Strata: every row of the rock has its own darkness, and the rows wander a little.
  const yy = y + (vn(x, y, 32, s + 1) - 0.5) * 5;
  const strata = vn(0, yy, 16, s + 2) * 0.5 + h2(0, Math.floor(yy / 2), s + 3) * 0.5;
  const h = (px: number, py: number): number => fbm(px, py, s + 9, [32, 16, 8]) * 0.5 + (h2(0, Math.floor((py + (vn(px, py, 32, s + 1) - 0.5) * 5) / 2), s + 3) * 0.5) * 0.5;
  let c = ramp(DEEP, strata * 0.65 + fbm(x, y, s + 4, [32, 16, 8]) * 0.45);
  c = shade(c, 1 + lightOf(h, x, y) * 1.3);
  // Long pale streaks along the strata, and the odd crack straight across them.
  if (h2(x >> 2, Math.floor(yy), s + 5) > 0.93) c = shade(c, 1.28);
  const k = crack(x, y, s + 6, 0.5);
  if (k === 1) c = shade(c, 0.66);
  return c;
}

// ---- tuff ----
const TUFF: RGB[] = [[84, 82, 72], [104, 102, 90], [122, 120, 106], [140, 136, 122]];
function tuff(x: number, y: number, v: number): RGB {
  const s = 600 + v * 47;
  const h = (px: number, py: number): number => fbm(px, py, s, [32, 16, 8, 4]);
  let c = ramp(TUFF, (h(x, y) - 0.5) * 1.8 + 0.5);
  c = shade(c, 1 + lightOf(h, x, y) * 2);
  // Ash banding: greenish-grey and pale drifts in soft rounded patches.
  const m = vn(x, y, 8, s + 2);
  if (m > 0.66) c = mix(c, [96, 110, 88], (m - 0.66) * 2.4);
  else if (m < 0.3) c = mix(c, [150, 144, 128], (0.3 - m) * 1.8);
  // Little pits where gas bubbled out.
  const pit = cells(x, y, 16, s + 3, 0.7);
  if (h2(pit.id, 3, s + 4) > 0.8) c = shade(c, pit.d1 < 1.3 ? 0.7 : pit.d1 < 2.1 ? 0.9 : 1);
  return c;
}

// ---- calcite ----
const CALCITE: RGB[] = [[196, 194, 184], [216, 214, 204], [232, 230, 222], [244, 242, 236]];
function calcite(x: number, y: number, v: number): RGB {
  const s = 700 + v * 53;
  const h = (px: number, py: number): number => fbm(px, py, s, [32, 16, 8]);
  let c = ramp(CALCITE, (h(x, y) - 0.4) * 1.4 + 0.4);
  c = shade(c, 1 + lightOf(h, x, y) * 1.2);
  // Crystal facets: faint lines between them, and a few soft grey veins.
  const f = cells(x, y, 6, s + 2, 0.85);
  if (f.d2 - f.d1 < 0.6) c = shade(c, 0.97);
  if (ridge(x, y, 16, s + 3) < 0.7) c = mix(c, [172, 170, 162], 0.4);
  if (h2(x, y, s + 4) > 0.99) c = [255, 254, 250];
  return c;
}

// ---- obsidian ----
const OBSIDIAN: RGB[] = [[10, 6, 20], [20, 12, 36], [32, 18, 56], [48, 28, 80]];
function obsidian(x: number, y: number, v: number): RGB {
  const s = 800 + v * 59;
  const h = (px: number, py: number): number => fbm(px, py, s, [32, 16, 8]);
  let c = ramp(OBSIDIAN, (h(x, y) - 0.45) * 1.7 + 0.45);
  c = shade(c, 1 + lightOf(h, x, y) * 2.4);
  // A soft glassy sheen along a diagonal, and veins of violet light.
  const sheen = Math.max(0, 1 - Math.abs(((x + y + (vn(x, y, 32, s + 1) - 0.5) * 18) % 48) - 24) / 5);
  c = mix(c, [118, 92, 176], sheen * 0.22);
  const vein = ridge(x, y, 16, s + 2);
  const seen = Math.min(1, Math.max(0, (vn(x, y, 8, s + 6) - 0.45) * 8));
  if (vein < 0.6) c = mix(c, [150, 84, 238], 0.9 * seen);
  else if (vein < 1.5) c = mix(c, [76, 40, 140], 0.6 * seen);
  if (h2(x, y, s + 3) > 0.994) c = [190, 160, 255];
  return c;
}

// ---- bedrock ----
const BEDROCK: RGB[] = [[22, 22, 25], [40, 40, 45], [60, 60, 66], [34, 34, 38]];
function bedrock(x: number, y: number, v: number): RGB {
  const s = 900 + v * 61;
  const c1 = cells(x, y, 8, s, 0.85);
  let c = BEDROCK[Math.floor(h2(c1.id, 2, s + 1) * BEDROCK.length)];
  // Jagged chunks, each lit on its upper left and dark in the crevices between.
  const gap = c1.d2 - c1.d1 + (vn(x, y, 8, s + 2) - 0.5) * 1.6;
  c = shade(c, 0.85 + 0.3 * (0.5 - (c1.dx + c1.dy) * 0.04));
  if (gap < 0.9) c = shade(c, 0.45);
  else if (gap < 1.8) c = shade(c, c1.dx + c1.dy < 0 ? 1.15 : 0.8);
  c = shade(c, 1 + (h2(x, y, s + 3) - 0.5) * 0.18 + (vn(x, y, 4, s + 4) - 0.5) * 0.2);
  return c;
}

export const STONE_PICS = [
  ...pair('stone', stone),
  ...pair('granite', granite),
  ...pair('diorite', diorite),
  ...pair('andesite', andesite),
  ...pair('deepslate', deepslate),
  ...pair('tuff', tuff),
  ...pair('calcite', calcite),
  ...pair('obsidian', obsidian),
  ...pair('bedrock', bedrock),
];
