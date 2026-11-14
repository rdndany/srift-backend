/**
 * Biome tinting. Grass, leaves, tall grass and water are painted in one neutral colour in the texture
 * atlas and multiplied by a colour that depends on the local climate: temperature (cold .. hot) and
 * humidity (dry .. wet), each quantised to 8 steps. The mesher puts a palette index on every tinted
 * face and the shader looks the colour up (as a ratio to the atlas base colour), so nothing is remeshed
 * when the sky changes.
 *
 * A column's packed climate is `temperature * 8 + humidity + 64 * kind`, where the kind is 0 for the plain
 * country, 1 for a swamp (murky water, dull olive foliage), 2 for a warm sea (clear turquoise) and 3 for frozen
 * water (cold, pale blue).
 *
 * Palette layout (index 0 means "not tinted"):
 *   1 .. 64    grass and foliage, 1 + temperature * 8 + humidity
 *   65 .. 96   water, 65 + kind * 8 + temperature
 *   97 .. 104  swamp foliage, 97 + temperature
 */

export type RGB = [number, number, number];

/** The colours the atlas paints, i.e. what a multiplier of 1 gives. */
export const GRASS_BASE: RGB = [92, 158, 52];
export const WATER_BASE: RGB = [40, 90, 205];

export const TINT_GRASS_BASE = 1;
export const TINT_WATER_BASE = 65;
/** Water indices run up to (but not including) this one; from here on the palette is foliage again. */
export const TINT_WATER_END = 97;
export const TINT_SWAMP_BASE = 97;
export const TINT_STEPS = 8;

export const WATER_KIND_PLAIN = 0;
export const WATER_KIND_SWAMP = 1;
export const WATER_KIND_WARM = 2;
export const WATER_KIND_FROZEN = 3;

const lerp = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Colour of grass at a climate. Cold is blue-green, hot and dry is straw, hot and wet is lush. */
export function grassColor(t: number, h: number): RGB {
  const cold: RGB = [112, 178, 146];
  const mild: RGB = [92, 158, 52];
  const hot: RGB = [172, 172, 70];
  let c = t < 0.5 ? lerp(cold, mild, t * 2) : lerp(mild, hot, (t - 0.5) * 2);
  const dry = clamp01((0.42 - h) / 0.42) * clamp01(t * 1.6);
  if (dry > 0) c = lerp(c, [196, 180, 84], dry);
  const wet = clamp01((h - 0.55) / 0.45) * 0.7;
  if (wet > 0) c = lerp(c, [64, 160, 44], wet);
  return c;
}

/** Foliage of a swamp: a dull, dark olive that only warms a little with the heat. */
export function swampColor(t: number): RGB {
  return lerp([84, 104, 62], [108, 118, 52], clamp01(t));
}

/** Colour of water: grey-blue where it is cold, turquoise where it is warm; murky in a swamp, clear in a warm sea, pale where frozen. */
export function waterColor(t: number, kind = WATER_KIND_PLAIN): RGB {
  const cold: RGB = [70, 92, 200];
  const mild: RGB = [40, 90, 205];
  const warm: RGB = [28, 168, 226];
  const plain = t < 0.5 ? lerp(cold, mild, t * 2) : lerp(mild, warm, (t - 0.5) * 2);
  if (kind === WATER_KIND_SWAMP) return lerp([62, 96, 88], [74, 102, 64], clamp01(t));
  if (kind === WATER_KIND_WARM) return lerp(plain, [22, 196, 214], 0.75);
  if (kind === WATER_KIND_FROZEN) return lerp(plain, [92, 118, 214], 0.6);
  return plain;
}

/** Colour of palette entry `index` (0 = untinted): what a tinted pixel of the atlas base colour becomes. */
export function paletteColor(index: number): RGB {
  if (index >= TINT_SWAMP_BASE) return swampColor(((index - TINT_SWAMP_BASE) % TINT_STEPS + 0.5) / TINT_STEPS);
  if (index >= TINT_WATER_BASE) {
    const k = index - TINT_WATER_BASE;
    return waterColor(((k % TINT_STEPS) + 0.5) / TINT_STEPS, Math.floor(k / TINT_STEPS));
  }
  if (index >= TINT_GRASS_BASE) {
    const k = index - TINT_GRASS_BASE;
    return grassColor((Math.floor(k / TINT_STEPS) + 0.5) / TINT_STEPS, ((k % TINT_STEPS) + 0.5) / TINT_STEPS);
  }
  return [255, 255, 255];
}

/** The grass / foliage palette index of a column's packed climate (a swamp has foliage of its own). */
export const grassTint = (packed: number): number =>
  packed >> 6 === WATER_KIND_SWAMP ? TINT_SWAMP_BASE + ((packed >> 3) & 7) : TINT_GRASS_BASE + (packed & 63);
/** The water palette index of a column's packed climate. */
/**
 * Water carries how deep it is in the same byte as its palette index: 128 + (index - TINT_WATER_BASE) + 32 * depth class,
 * where the class is 0 for a single block of water, 1 for 2-3, 2 for 4-7 and 3 for 8 or more. The shader unpacks it
 * to darken the deep, show the sand through the shallows and soften the shores.
 */
export const WATER_DEPTH_FLAG = 128;
export const WATER_DEPTH_STRIDE = 32;
export const waterDepthClass = (blocks: number): number => (blocks <= 1 ? 0 : blocks <= 3 ? 1 : blocks <= 7 ? 2 : 3);
export const packWaterDepth = (index: number, depthClass: number): number => WATER_DEPTH_FLAG + (index - TINT_WATER_BASE) + WATER_DEPTH_STRIDE * depthClass;

export const waterTint = (packed: number): number => TINT_WATER_BASE + (packed >> 6) * TINT_STEPS + ((packed >> 3) & 7);