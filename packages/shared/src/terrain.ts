import { Biome, type BiomeId } from './biomes';
import { SEA_LEVEL, WORLD_HEIGHT } from './chunk';
import { Simplex } from './noise';

/**
 * The shape of the land and the biome map: a pure function of the seed and a column (x, z).
 *
 * It follows the way the original game builds a world (the 1.18 "multi-noise" generator) in a simpler form. A handful of slow
 * noise fields describe the planet:
 *
 *  - continentalness: deep ocean, shelf, coast, inland;
 *  - erosion: flat plains .. rugged hills;
 *  - ridges: where the mountain crests run;
 *  - temperature and humidity, each cut into bands (frozen..hot, dry..wet).
 *
 * Heights come from a spline of continentalness, with hills of the size erosion allows, and mountains that rise only far
 * from the sea and only where erosion is low. Rivers are cut where a slow field crosses zero; lakes sit in the low ground;
 * swamps flatten the wet lowlands to the sea; badlands step into terraces; deserts roll in dunes; lonely islands in the
 * deepest ocean grow a mushroom field. The biome is then read from climate and shape together.
 *
 * All the weights are smooth, so a biome's special terrain fades into its neighbours instead of ending in a cliff.
 */

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** The height of land (before hills) at a continentalness, as a spline through these points. */
const SPLINE: readonly (readonly [number, number])[] = [
  [-1, 24],
  [-0.62, 34],
  [-0.4, 46],
  [-0.22, 56],
  [-0.1, 61],
  [-0.045, 63.2],
  [0.0, 64.6],
  [0.1, 66.6],
  [0.35, 70.5],
  [1, 77],
];

function spline(c: number): number {
  if (c <= SPLINE[0][0]) return SPLINE[0][1];
  for (let i = 1; i < SPLINE.length; i++) {
    const [x1, y1] = SPLINE[i];
    if (c <= x1) {
      const [x0, y0] = SPLINE[i - 1];
      return lerp(y0, y1, (c - x0) / (x1 - x0));
    }
  }
  return SPLINE[SPLINE.length - 1][1];
}

/** Temperature band edges (0..1): frozen, cold, temperate, warm, hot. */
export const HEAT_EDGES = [0.2, 0.36, 0.66, 0.8] as const;
/** Humidity band edges (0..1): dry, neutral, humid, wet. */
export const WET_EDGES = [0.3, 0.5, 0.7] as const;

export const heatBand = (t: number): number => (t < HEAT_EDGES[0] ? 0 : t < HEAT_EDGES[1] ? 1 : t < HEAT_EDGES[2] ? 2 : t < HEAT_EDGES[3] ? 3 : 4);
export const wetBand = (h: number): number => (h < WET_EDGES[0] ? 0 : h < WET_EDGES[1] ? 1 : h < WET_EDGES[2] ? 2 : 3);

/**
 * Where snow lies on a slope, by temperature (0..1): everywhere in the frozen band, high up in the cold, only on the very
 * crests in the temperate and not at all in the warm. A smooth function of the climate, so the snow line climbs gently away
 * from the cold instead of jumping.
 */
export function snowLine(t: number): number {
  const pts: readonly (readonly [number, number])[] = [
    [0, 48],
    [0.2, 70],
    [0.4, 104],
    [0.52, 148],
    [0.6, 205],
    [0.66, 400],
  ];
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], (t - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]));
  }
  return 400;
}

export interface ColumnData {
  height: number;
  biome: BiomeId;
  heat: number;
  wet: number;
  /** Climate, 0..1 (cold..hot, dry..wet). */
  t: number;
  h: number;
  /** How much of a river this column is (0 none, 1 the middle of the channel). */
  river: number;
  /** Mountain weight 0..1. */
  mm: number;
}

export function newColumnData(): ColumnData {
  return { height: 0, biome: Biome.PLAINS, heat: 2, wet: 1, t: 0.5, h: 0.5, river: 0, mm: 0 };
}

export class Terrain {
  private nWarpX: Simplex;
  private nWarpZ: Simplex;
  private nCont: Simplex;
  private nEro: Simplex;
  private nRidge: Simplex;
  private nHill: Simplex;
  private nRoll: Simplex;
  private nJag: Simplex;
  private nTemp: Simplex;
  private nWet: Simplex;
  private nRiver: Simplex;
  private nLake: Simplex;
  private nDune: Simplex;
  private nMesa: Simplex;
  private nSwamp: Simplex;
  private nIsland: Simplex;
  private nSub: Simplex;
  private nSub2: Simplex;
  private nIce: Simplex;
  private nSea: Simplex;

  constructor(seed: number) {
    const s = (k: number): Simplex => new Simplex(seed * 7 + 9000 + k * 131);
    this.nWarpX = s(1);
    this.nWarpZ = s(2);
    this.nCont = s(3);
    this.nEro = s(4);
    this.nRidge = s(5);
    this.nHill = s(6);
    this.nRoll = s(7);
    this.nJag = s(8);
    this.nTemp = s(9);
    this.nWet = s(10);
    this.nRiver = s(11);
    this.nLake = s(12);
    this.nDune = s(13);
    this.nMesa = s(14);
    this.nSwamp = s(15);
    this.nIsland = s(16);
    this.nSub = s(17);
    this.nSub2 = s(18);
    this.nIce = s(19);
    this.nSea = s(20);
  }

  /** Temperature and humidity (0..1) of a column, from the warped coordinates so that the biome borders wander. */
  climate(wx: number, wz: number, out: { t: number; h: number }): void {
    const wxw = wx + 80 * this.nWarpX.fbm2(wx / 340, wz / 340, 2);
    const wzw = wz + 80 * this.nWarpZ.fbm2(wx / 340 + 31.7, wz / 340 - 17.3, 2);
    out.t = clamp(0.5 + 1.0 * this.nTemp.fbm2(wxw / 2100, wzw / 2100, 3), 0, 1);
    out.h = clamp(0.5 + 1.25 * this.nWet.fbm2(wxw / 1150, wzw / 1150, 3), 0, 1);
  }

  private readonly cl = { t: 0.5, h: 0.5 };

  /** Fill `o` with everything about the column (wx, wz). */
  sample(wx: number, wz: number, o: ColumnData): void {
    const cl = this.cl;
    this.climate(wx, wz, cl);
    const temp = cl.t;
    const humid = cl.h;

    const c = clamp(0.2 + 1.6 * this.nCont.fbm2(wx / 1900, wz / 1900, 5, 2, 0.45), -1, 1);
    const e = clamp(1.7 * this.nEro.fbm2(wx / 900, wz / 900, 3), -1, 1);
    const rn = this.nRidge.fbm2(wx / 400, wz / 400, 4);
    const crest = 1 - Math.min(1, Math.abs(rn) * 2.6);
    const peaks = crest * crest;

    const landW = smooth(-0.1, 0.12, c);
    const flat = smooth(-0.55, 0.6, e);
    const mm = smooth(0.18, 0.62, c) * (1 - smooth(-0.55, 0.15, e));

    // The deserts lie flat: broad, gentle dunes instead of hills.
    const dry = smooth(0.66, 0.78, temp) * (1 - smooth(0.34, 0.44, humid)) * landW;
    const calm = 1 - 0.78 * dry;

    let h = spline(c);
    h += this.nHill.fbm2(wx / 95, wz / 95, 4) * lerp(26, 5, flat) * landW * calm;
    h += this.nRoll.fbm2(wx / 260, wz / 260, 3) * lerp(22, 4, flat) * landW * calm;
    h += this.nSea.fbm2(wx / 70, wz / 70, 3) * 6 * (1 - landW);
    h += mm * (20 + 104 * peaks);
    h += mm * peaks * this.nJag.fbm2(wx / 20, wz / 20, 2) * 9;

    // Dunes in the dry heat.
    if (dry > 0) h += dry * (this.nDune.fbm2(wx / 70, wz / 70, 3) * 5.5 + 2);

    // Badlands: the plateaus step down in terraces with steep risers.
    const bad = smooth(0.74, 0.8, temp) * smooth(0.4, 0.48, humid) * landW * (1 - mm);
    if (bad > 0) {
      const m = clamp(this.nMesa.fbm2(wx / 150, wz / 150, 3) * 1.5 + 0.5, 0, 0.999);
      const steps = m * 6;
      const k = Math.floor(steps);
      const f = steps - k;
      const terraced = SEA_LEVEL + 3 + ((k + smooth(0.55, 0.92, f)) / 6) * 42;
      h = lerp(h, terraced, bad);
    }

    // Rivers: valleys where a slow field crosses zero. Floodplain first, then the channel, cut to below the sea.
    const rv = Math.abs(this.nRiver.fbm2(wx / 560, wz / 560, 2));
    const cutMask = (1 - mm * 0.85) * smooth(-0.1, 0.0, c) * (1 - smooth(SEA_LEVEL + 22, SEA_LEVEL + 48, h));
    let river = 0;
    if (cutMask > 0) {
      const bank = (1 - smooth(0.05, 0.16, rv)) * cutMask;
      if (bank > 0 && h > SEA_LEVEL + 2) h = lerp(h, SEA_LEVEL + 2 + (h - SEA_LEVEL - 2) * 0.4, bank);
      river = (1 - smooth(0.014, 0.05, rv)) * cutMask;
      if (river > 0) h = lerp(h, SEA_LEVEL - 3.6, river);
    }

    // Lakes in the low ground.
    const lk = this.nLake.fbm2(wx / 150, wz / 150, 3);
    const lowland = (1 - smooth(SEA_LEVEL + 5, SEA_LEVEL + 13, h)) * landW * (1 - mm);
    const basin = smooth(0.36, 0.5, lk) * lowland;
    if (basin > 0) h = lerp(h, SEA_LEVEL - 2.6 - (lk - 0.4) * 14, basin);

    // Swamps: wet, mild lowlands become flat, shallow and full of pools.
    const wetland = smooth(0.58, 0.68, humid) * smooth(0.3, 0.4, temp) * (1 - smooth(0.78, 0.88, temp)) * (1 - smooth(SEA_LEVEL + 3, SEA_LEVEL + 9, h)) * smooth(SEA_LEVEL - 5, SEA_LEVEL - 1, h) * landW;
    if (wetland > 0) h = lerp(h, SEA_LEVEL + 0.9 + this.nSwamp.fbm2(wx / 36, wz / 36, 2) * 4.2, wetland);

    // Mushroom islands: a rare hump of land in the deepest ocean.
    const isle = this.nIsland.fbm2(wx / 300, wz / 300, 3);
    const islandW = smooth(0.46, 0.58, isle) * (1 - smooth(-0.5, -0.36, c));
    if (islandW > 0) h = lerp(h, SEA_LEVEL - 4 + smooth(0.5, 0.85, isle) * 17 + this.nHill.fbm2(wx / 40, wz / 40, 2) * 2, islandW);

    h = Math.floor(clamp(h, 4, WORLD_HEIGHT - 8));

    // ---- the biome ----
    const heat = heatBand(temp);
    const wet = wetBand(humid);
    let biome: BiomeId;
    if (islandW > 0.5 && h >= SEA_LEVEL - 9) {
      biome = Biome.MUSHROOM_FIELDS;
    } else if (h < SEA_LEVEL) {
      if (river > 0.4 && c > -0.1) biome = heat === 0 ? Biome.FROZEN_RIVER : Biome.RIVER;
      else if (heat === 0) biome = Biome.FROZEN_OCEAN;
      else if (h < SEA_LEVEL - 22) biome = Biome.DEEP_OCEAN;
      else if (heat >= 3) biome = Biome.WARM_OCEAN;
      else biome = Biome.OCEAN;
    } else if (wetland > 0.5) {
      biome = Biome.SWAMP;
    } else if (h <= SEA_LEVEL + 2 && c < 0.05 && river < 0.4) {
      biome = heat === 0 ? Biome.SNOWY_BEACH : heat === 1 ? Biome.STONY_SHORE : Biome.BEACH;
    } else if (mm > 0.3 && h > SEA_LEVEL + 38) {
      biome = heat >= 3 ? Biome.STONY_PEAKS : Biome.MOUNTAIN;
    } else if (mm > 0.13 && h > SEA_LEVEL + 20 && heat >= 1 && heat <= 3) {
      biome = Biome.WINDSWEPT_HILLS;
    } else if (mm > 0.13 && h > SEA_LEVEL + 20 && heat === 0) {
      biome = Biome.MOUNTAIN;
    } else if (heat === 2 && mm > 0.008 && mm <= 0.3 && h > SEA_LEVEL + 12 && h < SEA_LEVEL + 50) {
      biome = wet <= 1 ? Biome.MEADOW : Biome.CHERRY_GROVE;
    } else {
      const sub = this.nSub.fbm2(wx / 330, wz / 330, 2);
      const sub2 = this.nSub2.fbm2(wx / 260, wz / 260, 2);
      switch (heat) {
        case 0:
          if (this.nIce.fbm2(wx / 170, wz / 170, 2) > 0.34 && h > SEA_LEVEL + 3 && wet <= 1) biome = Biome.ICE_SPIKES;
          else biome = wet >= 2 ? Biome.SNOWY_TAIGA : Biome.SNOW;
          break;
        case 1:
          biome = wet === 3 ? Biome.OLD_TAIGA : Biome.TAIGA;
          break;
        case 2:
          if (wet === 0) biome = Biome.PLAINS;
          else if (wet === 1) biome = sub2 > 0.34 ? Biome.FLOWER_FOREST : sub > 0.02 ? Biome.FOREST : Biome.PLAINS;
          else if (wet === 2) biome = sub > 0.12 ? Biome.BIRCH_FOREST : Biome.FOREST;
          else biome = sub > -0.2 ? Biome.DARK_FOREST : Biome.FOREST;
          break;
        case 3:
          if (wet <= 1) biome = Biome.SAVANNA;
          else if (wet === 2) biome = sub > 0.05 ? Biome.JUNGLE : Biome.FOREST;
          else biome = Biome.JUNGLE;
          break;
        default:
          biome = wet <= 1 ? Biome.DESERT : Biome.BADLANDS;
      }
    }

    o.height = h;
    o.biome = biome;
    o.heat = heat;
    o.wet = wet;
    o.t = temp;
    o.h = humid;
    o.river = river;
    o.mm = mm;
  }
}
