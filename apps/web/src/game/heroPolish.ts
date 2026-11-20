/**
 * Smooth and layered stone, drawn by hand at 64 x 64 and, like the natural stones, shown by the terrain shader laid over the world
 * (see heroTiles.ts: "field" tiles), so a polished hall or a sandstone cliff is one surface with no seams where blocks meet.
 *
 * Polished stone: soft clouds of tone, a faint sheen sweeping across it, and the marks of the stone itself (granite's grains,
 * marble's veins, diorite's flecks). Sandstone: strata, wavering, each a little different, with a thin dark line where one
 * settles on the next. Minerals: facets that catch the light, each tilted a little differently.
 */
import { beyondTiles } from '@solrift/shared';
import { cells, fbm, h2, mix, ramp, shade, vn, type HeroPainter, type RGB } from './heroKit';
import { lightOf, pair } from './heroStone';

const TAU = Math.PI * 2;
const tonesOf = (c: RGB, ks: number[]): RGB[] => ks.map((k) => shade(c, k));
const bt = (name: string): { base: RGB; acc: RGB } => {
  const t = beyondTiles()[name];
  return { base: t.rgb as RGB, acc: (t.accent ?? t.rgb) as RGB };
};

interface PolishSpec {
  /** Darkest first. */
  tones: RGB[];
  seed: number;
  /** How strongly the clouds of tone show. */
  cloud?: number;
  /** The sheen across the stone. */
  gloss?: number;
  /** Veins: waves across the tile, colour and how thick. */
  veins?: { color: RGB; width: number; amount: number; waves?: [number, number]; warp?: number };
  /** Flecks: soft round dots, one in a cell of cell pixels with the given chance,  pixels wide. */
  flecks?: { color: RGB; chance: number; cell: number; r: number }[];
  /** Fine layers running across (horizontal lines of faint tone). */
  layers?: number;
}

function polished(spec: PolishSpec): (x: number, y: number, v: number) => RGB {
  return (x, y, v) => {
    const s = spec.seed + v * 53;
    const cloud = spec.cloud ?? 1;
    const h = (qx: number, qy: number): number => fbm(qx, qy, s, [32, 16, 8]);
    let c = ramp(spec.tones, 0.5 + (h(x, y) - 0.5) * 1.5 * cloud + (vn(x, y, 4, s + 2) - 0.5) * 0.1);
    c = shade(c, 1 + lightOf((qx, qy) => fbm(qx, qy, s + 1, [32, 16]), x, y) * 0.5);
    // Sheen: a soft broad band running up and to the right, which drifts over the stone.
    const g = 0.5 + 0.5 * Math.sin(((x * 1 + y * 1) / 64) * TAU + (vn(x, y, 32, s + 3) - 0.5) * 2.2 + v * 1.7);
    c = shade(c, 1 + (g - 0.5) * (spec.gloss ?? 0.1));
    if (spec.layers) {
      const l = 0.5 + 0.5 * Math.sin((((y + (vn(x, y, 32, s + 4) - 0.5) * 6) * spec.layers) / 64) * TAU);
      c = shade(c, 1 + (l - 0.5) * 0.08);
    }
    if (spec.veins) {
      const [a, b] = spec.veins.waves ?? [1, 2];
      const phase = ((a * x + b * y) / 64) * TAU + (fbm(x, y, s + 5, [32, 16]) - 0.5) * (spec.veins.warp ?? 12);
      const d = Math.abs(Math.sin(phase * 0.5));
      // Veins show only where a slower noise lets them (so they come and go) and are thicker in places.
      const amount = spec.veins.amount * (0.55 + 0.9 * vn(x, y, 32, s + 6));
      const w = spec.veins.width * (0.6 + 0.8 * vn(x, y, 16, s + 7));
      if (d < w && vn(x, y, 16, s + 8) < 0.5 + amount) c = mix(c, spec.veins.color, Math.pow(1 - d / w, 0.8) * 0.85);
    }
    for (const [i, f] of (spec.flecks ?? []).entries()) {
      const cl = cells(x, y, f.cell, s + 20 + i, 0.9);
      if (h2(cl.id, 7, s + 30 + i) > f.chance) continue;
      const rad = f.r * (0.6 + 0.8 * h2(cl.id, 8, s + 40 + i)) + (vn(x, y, 4, s + 50 + i) - 0.5) * 0.8;
      if (cl.d1 < rad) c = mix(c, f.color, 0.85);
      else if (cl.d1 < rad + 0.9) c = mix(c, f.color, 0.3);
    }    return c;
  };
}

/** Strata: bands across, each different, wavering, with a thin dark seam between some. */
interface StrataSpec {
  tones: RGB[];
  seed: number;
  /** Strata per tile (the main one). */
  bands: number;
  seams?: number;
  grain?: number;
  /** How much the strata differ in tone. */
  contrast?: number;
}
function strata(spec: StrataSpec): (x: number, y: number, v: number) => RGB {
  return (x, y, v) => {
    const s = spec.seed + v * 47;
    const wob = (vn(x, y, 32, s + 1) - 0.5) * 7 + (vn(x, y, 16, s + 2) - 0.5) * 2.4;
    const yy = y + wob;
    const p1 = (yy * spec.bands) / 64;
    const p2 = (yy * (spec.bands + 3)) / 64;
    const band = Math.floor(p1 + 64);
    const tone = h2(band % 64, 3, s + 3) * 0.55 + (Math.sin(p2 * TAU) * 0.5 + 0.5) * 0.25 + fbm(x, y, s + 4, [32, 16]) * 0.35;
    let c = ramp(spec.tones, 0.5 + (tone - 0.55) * 1.4 * (spec.contrast ?? 1));
    c = shade(c, 1 + lightOf((qx, qy) => fbm(qx, qy, s + 5, [16, 8, 4]), x, y) * 0.9);
    // Where one stratum settles on the next: a thin darker line, and a lit lip below it.
    const f = p1 - Math.floor(p1);
    if (spec.seams !== 0 && h2(band % 64, 4, s + 6) < (spec.seams ?? 0.5)) {
      if (f < 0.07) c = shade(c, 0.8);
      else if (f < 0.15) c = shade(c, 1.07);
    }
    const g = h2(x, y, s + 7);
    const grain = spec.grain ?? 1;
    if (g > 0.985) c = shade(c, 1 + 0.12 * grain);
    else if (g < 0.02) c = shade(c, 1 - 0.14 * grain);
    return c;
  };
}

/** Facets of a mineral: broad cells, each tilted, so the block glitters in the light of the sun. */
interface FacetSpec {
  tones: RGB[];
  seed: number;
  size: number;
  /** A colour lit into the lit side of each facet. */
  sparkle?: RGB;
  /** The dark between facets. */
  dark?: number;
}
function facets(spec: FacetSpec): (x: number, y: number, v: number) => RGB {
  return (x, y, v) => {
    const s = spec.seed + v * 59;
    const cell = cells(x, y, spec.size, s, 0.9);
    const tone = h2(cell.id, 1, s + 1) * 0.7 + fbm(x, y, s + 2, [32, 16]) * 0.45;
    let c = ramp(spec.tones, (tone - 0.35) * 1.5 + 0.2);
    // Each facet slopes towards or away from the light.
    const tilt = (cell.dx * 0.5 + cell.dy * 0.5) * 0.02 + (h2(cell.id, 2, s + 3) - 0.5) * 0.22;
    c = shade(c, 1 + tilt);
    const edge = cell.d2 - cell.d1;
    if (edge < 0.55) c = shade(c, 1 - (spec.dark ?? 0.28) * (1 - edge / 0.55));
    else if (edge < 1.1 && cell.dx + cell.dy < 0) c = shade(c, 1.1);
    if (spec.sparkle && h2(x, y, s + 4) > 0.985) c = mix(c, spec.sparkle, 0.8);
    return c;
  };
}

const out: { key: string; tile: string; paint: HeroPainter }[] = [];
const add = (tile: string, paint: (x: number, y: number, v: number) => RGB): void => {
  out.push(...pair(tile, paint));
};

// ============================ polished stone ============================
add('polished_deepslate', polished({ tones: [[56, 56, 62], [68, 68, 74], [80, 80, 86], [92, 92, 98]], seed: 13000, cloud: 0.9, gloss: 0.12, veins: { color: [112, 112, 120], width: 0.1, amount: 0.3, waves: [1, 1] } }));
add('polished_tuff', polished({ tones: [[134, 128, 108], [148, 142, 122], [162, 156, 136], [174, 168, 148]], seed: 13100, cloud: 1.1, gloss: 0.08, layers: 4, flecks: [{ color: [112, 106, 88], chance: 0.35, cell: 8, r: 1.4 }] }));
add('polished_andesite', polished({ tones: [[156, 156, 154], [170, 170, 168], [184, 184, 182], [196, 196, 194]], seed: 13200, cloud: 0.8, gloss: 0.1, flecks: [{ color: [132, 132, 132], chance: 0.5, cell: 6, r: 1 }, { color: [212, 212, 208], chance: 0.35, cell: 7, r: 1 }] }));
add('polished_diorite', polished({ tones: [[204, 204, 204], [214, 214, 214], [224, 224, 222], [234, 234, 232]], seed: 13300, cloud: 0.7, gloss: 0.08, flecks: [{ color: [92, 92, 100], chance: 0.35, cell: 7, r: 1.5 }, { color: [160, 160, 164], chance: 0.4, cell: 5, r: 1 }] }));
add('polished_granite', polished({ tones: [[140, 96, 82], [154, 108, 92], [168, 122, 106], [180, 134, 118]], seed: 13400, cloud: 0.9, gloss: 0.1, flecks: [{ color: [96, 56, 50], chance: 0.45, cell: 6, r: 1.3 }, { color: [220, 192, 176], chance: 0.35, cell: 6, r: 1.1 }, { color: [196, 118, 104], chance: 0.4, cell: 8, r: 1.8 }] }));
add('polished_cinnabar', polished({ tones: [[170, 54, 44], [184, 64, 52], [198, 76, 62], [212, 92, 76]], seed: 13500, cloud: 1.1, gloss: 0.16, veins: { color: [120, 28, 26], width: 0.11, amount: 0.45, waves: [1, 2] } }));
add('polished_sulfur', polished({ tones: [[210, 194, 70], [222, 206, 82], [232, 218, 98], [240, 228, 120]], seed: 13600, cloud: 1.1, gloss: 0.14, veins: { color: [176, 150, 36], width: 0.1, amount: 0.4, waves: [2, 1] } }));
const pm = bt('polished_marble');
add('polished_marble', polished({ tones: [shade(pm.base, 0.9), shade(pm.base, 0.95), pm.base, shade(pm.base, 1.03)], seed: 13700, cloud: 0.7, gloss: 0.1, veins: { color: shade(pm.acc, 0.85), width: 0.12, amount: 0.55, waves: [1, 2] } }));
add('quartz_block', polished({ tones: [[222, 216, 210], [232, 226, 220], [240, 234, 228], [246, 242, 236]], seed: 13800, cloud: 0.8, gloss: 0.12, veins: { color: [200, 190, 184], width: 0.08, amount: 0.3, waves: [1, 1] } }));
add('smooth_basalt', polished({ tones: [[40, 42, 48], [50, 52, 58], [60, 62, 68], [72, 74, 80]], seed: 13900, cloud: 0.9, gloss: 0.1, layers: 8 }));

// quartz pillar: long fine streaks running down.
add('quartz_pillar', (x, y, v) => {
  const s = 14000 + v * 43;
  const warp = (vn(x, y, 32, s + 1) - 0.5) * 5;
  const t = Math.sin(((x + warp) / 64) * TAU * 8) * 0.5 + 0.5;
  let c = ramp([[218, 212, 206], [230, 224, 218], [240, 234, 228], [246, 242, 236]], 0.45 + (t - 0.5) * 0.35 + (fbm(x, y, s + 2, [32, 16]) - 0.5) * 0.5);
  const l = Math.abs(Math.sin(((x + warp) / 64) * TAU * 4));
  if (l < 0.1) c = shade(c, 0.9 + 0.1 * (l / 0.1));
  return shade(c, 1 + (h2(x, y, s + 3) - 0.5) * 0.04);
});

// ============================ sandstone ============================
add('sandstone_side', strata({ tones: [[196, 180, 130], [208, 192, 142], [220, 206, 156], [232, 218, 170]], seed: 14100, bands: 8, seams: 0.55 }));
add('red_sandstone_side', strata({ tones: [[150, 74, 36], [166, 86, 44], [182, 100, 54], [198, 116, 66]], seed: 14200, bands: 8, seams: 0.55 }));
add('cut_sandstone', strata({ tones: [[206, 192, 144], [216, 202, 154], [226, 214, 166], [234, 224, 178]], seed: 14300, bands: 4, seams: 0.8, contrast: 0.6, grain: 0.5 }));
add('cut_red_sandstone', strata({ tones: [[166, 84, 42], [178, 94, 48], [190, 106, 56], [202, 120, 66]], seed: 14400, bands: 4, seams: 0.8, contrast: 0.6, grain: 0.5 }));

// ============================ minerals ============================
add('cinnabar', facets({ tones: [[120, 26, 28], [150, 38, 34], [176, 52, 42], [204, 76, 58]], seed: 14500, size: 12, sparkle: [255, 150, 130] }));
add('sulfur', facets({ tones: [[170, 150, 36], [196, 176, 48], [218, 200, 64], [238, 224, 100]], seed: 14600, size: 12, sparkle: [255, 250, 190] }));
const mal = bt('malachite');
add('malachite', polished({ tones: tonesOf(mal.base, [0.62, 0.8, 1, 1.18]), seed: 14700, cloud: 1.4, gloss: 0.14, veins: { color: shade(mal.base, 0.5), width: 0.2, amount: 0.9, waves: [2, 3] } }));
const azu = bt('azurite');
add('azurite', facets({ tones: tonesOf(azu.base, [0.6, 0.8, 1, 1.25]), seed: 14800, size: 16, sparkle: azu.acc }));
const jad = bt('jade');
add('jade', polished({ tones: tonesOf(jad.base, [0.78, 0.9, 1, 1.12]), seed: 14900, cloud: 1.2, gloss: 0.16, veins: { color: jad.acc, width: 0.1, amount: 0.7, waves: [1, 1] } }));

export const POLISH_PICS = out;
