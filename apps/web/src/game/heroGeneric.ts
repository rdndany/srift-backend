/**
 * Every other full block (stone, sand, snow, the stones and woods and bricks, ores, wool...) gets the same treatment as the hero tiles,
 * without a hand-painted picture each: its 16 x 16 tile is redrawn at 64 x 64 (`upscaleTile`), smoothed and re-sharpened so it has no
 * pixel grid, and shown by the terrain shader without the dark creases between blocks.
 *
 * The "field" blocks (earth, sand, snow, stone... anything that is a mass of noise) are also laid over the world and not block by
 * block (as the leaves are): the picture is two blocks wide, made to wrap, and drifted by a slow warp, so a wall of stone is one
 * piece of rock with no edges and no repeats you can find. The rest (bricks, ores, logs, planks...) stay block by block.
 */

export const GENERIC_PX = 64;
const N = GENERIC_PX;
const S = 16;
const K = N / S;

/** Every tile that gets the generic treatment, in the order of their pictures in the strip (after the hand-painted ones). */
export const HERO_GENERIC: string[] = [
  'stone', 'sand', 'log_top', 'log_side', 'bedrock', 'snow', 'snow_side', 'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore',
  'gravel', 'glowstone', 'crafting_top', 'crafting_side', 'furnace_top', 'furnace_side', 'cactus_top', 'cactus_side',
  'sandstone_top', 'sandstone_side', 'granite', 'diorite', 'andesite', 'obsidian', 'birch_log_top', 'birch_log_side',
  'spruce_log_top', 'spruce_log_side', 'wool', 'chiseled_sandstone', 'stone_bricks', 'lapis_ore', 'wool_orange', 'wool_magenta',
  'wool_light_blue', 'wool_yellow', 'wool_lime', 'wool_pink', 'wool_gray', 'wool_light_gray', 'wool_cyan', 'wool_purple',
  'wool_blue', 'wool_brown', 'wool_green', 'wool_red', 'wool_black', 'emerald_ore', 'bookshelf', 'tnt_top', 'tnt_bottom',
  'tnt_side', 'redstone_ore', 'redstone_block', 'redstone_lamp', 'redstone_lamp_on', 'waystone_top', 'waystone_side',
  'coarse_dirt', 'podzol_top', 'podzol_side', 'mud', 'clay', 'red_sand', 'red_sandstone_top', 'red_sandstone_side', 'packed_ice',
  'deepslate', 'tuff', 'mycelium_top', 'mycelium_side', 'mushroom_stem', 'red_mushroom_block', 'brown_mushroom_block',
  'terracotta', 'terracotta_orange', 'terracotta_yellow', 'terracotta_red', 'terracotta_white', 'terracotta_brown',
  'terracotta_light_gray', 'pumpkin_top', 'pumpkin_side', 'melon_top', 'melon_side', 'acacia_log_top', 'acacia_log_side',
  'jungle_log_top', 'jungle_log_side', 'dark_oak_log_top', 'dark_oak_log_side', 'cherry_log_top', 'cherry_log_side',
  'moss_block', 'dripstone_block', 'amethyst_block', 'budding_amethyst', 'calcite', 'smooth_basalt', 'sculk', 'birch_planks',
  'spruce_planks', 'jungle_planks', 'acacia_planks', 'dark_oak_planks', 'cherry_planks', 'poplar_planks', 'bricks',
  'mossy_stone_bricks', 'polished_deepslate', 'deepslate_bricks', 'deepslate_tiles', 'polished_tuff', 'tuff_bricks',
  'polished_andesite', 'polished_diorite', 'polished_granite', 'cut_sandstone', 'cut_red_sandstone', 'smooth_stone', 'cinnabar',
  'polished_cinnabar', 'cinnabar_bricks', 'sulfur', 'polished_sulfur', 'sulfur_bricks', 'resin_bricks', 'red_nether_bricks',
  'poplar_log_top', 'poplar_bark', 'crimson_stem_top', 'crimson_stem_side', 'stripped_crimson', 'warped_stem_top',
  'warped_stem_side', 'stripped_warped', 'oak_stripped', 'birch_stripped', 'spruce_stripped', 'jungle_stripped',
  'acacia_stripped', 'dark_oak_stripped', 'cherry_stripped', 'poplar_stripped', 'rooted_dirt', 'packed_mud', 'mud_bricks',
  'mangrove_roots', 'muddy_mangrove_roots', 'pale_moss_block', 'mangrove_log_top', 'mangrove_bark', 'mangrove_stripped',
  'mangrove_planks', 'pale_oak_log_top', 'pale_oak_bark', 'pale_oak_stripped', 'pale_oak_planks', 'bamboo_block',
  'bamboo_stripped', 'bamboo_planks', 'bamboo_mosaic', 'cracked_stone_bricks', 'chiseled_stone_bricks',
  'cracked_deepslate_bricks', 'chiseled_deepslate', 'concrete_white', 'concrete_orange', 'concrete_magenta',
  'concrete_light_blue', 'concrete_yellow', 'concrete_lime', 'concrete_pink', 'concrete_gray', 'concrete_light_gray',
  'concrete_cyan', 'concrete_purple', 'concrete_blue', 'concrete_brown', 'concrete_green', 'concrete_red', 'concrete_black',
  'terracotta_magenta', 'terracotta_light_blue', 'terracotta_lime', 'terracotta_pink', 'terracotta_gray', 'terracotta_cyan',
  'terracotta_purple', 'terracotta_blue', 'terracotta_green', 'terracotta_black', 'glazed_white', 'glazed_orange',
  'glazed_magenta', 'glazed_light_blue', 'glazed_yellow', 'glazed_lime', 'glazed_pink', 'glazed_gray', 'glazed_light_gray',
  'glazed_cyan', 'glazed_purple', 'glazed_blue', 'glazed_brown', 'glazed_green', 'glazed_red', 'glazed_black', 'nether_bricks',
  'quartz_block', 'quartz_pillar', 'limestone', 'slate', 'marble', 'basalt', 'volcanic_rock', 'charred_stone', 'frosted_stone',
  'mossy_stone', 'ancient_bricks', 'mossy_ancient_bricks', 'cracked_ancient_bricks', 'carved_ancient_stone', 'polished_marble',
  'marble_bricks', 'obsidian_bricks', 'weathered_obsidian', 'petrified_log_top', 'petrified_log_side', 'skystone', 'stormstone',
  'fossil_rock', 'bone_block', 'salt_block', 'blue_ice', 'permafrost', 'ash_block', 'white_sand', 'black_sand', 'crystal_sand',
  'peat', 'golden_grass_block_top', 'golden_grass_block_side', 'dead_grass_block_top', 'dead_grass_block_side',
  'tundra_turf_top', 'tundra_turf_side', 'luminous_moss', 'crystal_ore', 'malachite', 'cinnabar_ore', 'azurite', 'sulfur_ore',
  'jade', 'coral_block_pink', 'coral_block_red', 'coral_block_blue', 'coral_block_yellow', 'coral_block_purple',
  'dead_coral_block', 'redwood_log_top', 'redwood_log_side', 'redwood_planks', 'palm_log_top', 'palm_log_side', 'palm_planks',
  'ebon_log_top', 'ebon_log_side', 'worldroot_log_top', 'worldroot_log_side', 'glowshroom_cap', 'glowshroom_stem', 'spore_cap',
];

const FIELD_RE =
  /^(stone|coarse_dirt|rooted_dirt|sand|red_sand|white_sand|black_sand|crystal_sand|gravel|snow|packed_ice|blue_ice|clay|mud|packed_mud|granite|diorite|andesite|deepslate|tuff|calcite|smooth_basalt|basalt|volcanic_rock|limestone|slate|marble|charred_stone|frosted_stone|mossy_stone|skystone|stormstone|fossil_rock|salt_block|permafrost|ash_block|peat|moss_block|pale_moss_block|dripstone_block|sculk|bedrock|obsidian|weathered_obsidian|smooth_stone|terracotta(_.*)?|concrete_.*|wool(_.*)?|podzol_top|mycelium_top|golden_grass_block_top|dead_grass_block_top|tundra_turf_top|luminous_moss|coral_block_.*|dead_coral_block|jade|malachite|azurite|cinnabar|sulfur|amethyst_block|red_sandstone_top|sandstone_top|polished_(andesite|diorite|granite|marble|tuff|deepslate|cinnabar|sulfur))$/;

/** A tile that is laid over the world (see above). */
export const isFieldTile = (name: string): boolean => FIELD_RE.test(name);

const wrap = (v: number, n = N): number => ((v % n) + n) % n;

function h2(x: number, y: number, seed: number): number {
  let h = Math.imul(wrap(x), 374761393) ^ Math.imul(wrap(y), 668265263) ^ Math.imul(seed + 1, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth noise in 0..1 that repeats every tile (`period` divides the tile). */
function vn(x: number, y: number, period: number, seed: number): number {
  const cells = N / period;
  const fx = wrap(x) / period;
  const fy = wrap(y) / period;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const sx = fx - x0;
  const sy = fy - y0;
  const tx = sx * sx * (3 - 2 * sx);
  const ty = sy * sy * (3 - 2 * sy);
  const g = (i: number, j: number): number => h2((i % cells) * period, (j % cells) * period, seed);
  const a = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * tx;
  const b = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * tx;
  return a + (b - a) * ty;
}

/** Catmull-Rom weights for a fraction t between the middle two of four samples. */
function cubic(t: number): [number, number, number, number] {
  const t2 = t * t;
  const t3 = t2 * t;
  return [(-t3 + 2 * t2 - t) / 2, (3 * t3 - 5 * t2 + 2) / 2, (-3 * t3 + 4 * t2 + t) / 2, (t3 - t2) / 2];
}

/** Does the 16 x 16 tile already run on across its edge (are its edge pixels as alike as any two neighbours)? */
function wraps(src: Float32Array): boolean {
  let edge = 0;
  let inner = 0;
  let ne = 0;
  let ni = 0;
  const lum = (x: number, y: number): number => {
    const o = (wrap(y, S) * S + wrap(x, S)) * 3;
    return src[o] * 0.3 + src[o + 1] * 0.59 + src[o + 2] * 0.11;
  };
  for (let i = 0; i < S; i++) {
    edge += Math.abs(lum(S - 1, i) - lum(0, i)) + Math.abs(lum(i, S - 1) - lum(i, 0));
    ne += 2;
    for (let j = 0; j < S - 1; j++) {
      inner += Math.abs(lum(j, i) - lum(j + 1, i)) + Math.abs(lum(i, j) - lum(i, j + 1));
      ni += 2;
    }
  }
  return edge / ne <= (inner / ni) * 1.3;
}

/**
 * The tile at 64 x 64 (rgba, top row first) from its 16 x 16 pixels. Colours are interpolated smoothly (so there is no grid of big
 * pixels) round a slow wobble (so straight edges are not ruler-straight), sharpened a little, and given a fine grain. A field tile
 * that does not wrap is blended with a copy of itself shifted by half a tile, so it does wrap. Alpha is kept as it was.
 */
export function upscaleTile(src16: ArrayLike<number>, seed: number, field: boolean): Uint8ClampedArray {
  // The colours (transparent texels take the average of the rest so they do not darken their neighbours).
  const col = new Float32Array(S * S * 3);
  let ar = 0;
  let ag = 0;
  let ab = 0;
  let an = 0;
  for (let i = 0; i < S * S; i++) {
    if (src16[i * 4 + 3] === 0) continue;
    ar += src16[i * 4];
    ag += src16[i * 4 + 1];
    ab += src16[i * 4 + 2];
    an++;
  }
  for (let i = 0; i < S * S; i++) {
    const clear = src16[i * 4 + 3] === 0 || an === 0;
    col[i * 3] = clear ? ar / Math.max(1, an) : src16[i * 4];
    col[i * 3 + 1] = clear ? ag / Math.max(1, an) : src16[i * 4 + 1];
    col[i * 3 + 2] = clear ? ab / Math.max(1, an) : src16[i * 4 + 2];
  }
  const warpAmount = field ? 0.9 : 0.4;
  const big = new Float32Array(N * N * 3);
  const alpha = new Uint8ClampedArray(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const wx = (vn(x, y, 16, seed + 1) - 0.5) * warpAmount * 2;
      const wy = (vn(x, y, 16, seed + 2) - 0.5) * warpAmount * 2;
      const sx = (x + 0.5) / K - 0.5 + wx;
      const sy = (y + 0.5) / K - 0.5 + wy;
      const ix = Math.floor(sx);
      const iy = Math.floor(sy);
      const wX = cubic(sx - ix);
      const wY = cubic(sy - iy);
      const o = (y * N + x) * 3;
      for (let c = 0; c < 3; c++) {
        let v = 0;
        for (let j = 0; j < 4; j++) {
          let row = 0;
          for (let i = 0; i < 4; i++) row += col[(wrap(iy + j - 1, S) * S + wrap(ix + i - 1, S)) * 3 + c] * wX[i];
          v += row * wY[j];
        }
        big[o + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
      alpha[y * N + x] = src16[(wrap(Math.floor(sy + 0.5), S) * S + wrap(Math.floor(sx + 0.5), S)) * 4 + 3];
    }
  }
  // A little sharpening (the smooth interpolation softens: take back a part of what a blur removes).
  const sharp = new Float32Array(N * N * 3);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      for (let c = 0; c < 3; c++) {
        const at = (i: number, j: number): number => big[(wrap(y + j) * N + wrap(x + i)) * 3 + c];
        const blur = (at(0, 0) * 4 + at(-1, 0) * 2 + at(1, 0) * 2 + at(0, -1) * 2 + at(0, 1) * 2 + at(-1, -1) + at(1, -1) + at(-1, 1) + at(1, 1)) / 16;
        const v = at(0, 0) + (at(0, 0) - blur) * 1.1;
        sharp[(y * N + x) * 3 + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
  }
  // A field that does not wrap: cross-fade towards a copy shifted by half a tile, fully at the edges, not at all in the middle.
  let pic = sharp;
  if (field && !wraps(col)) {
    pic = new Float32Array(N * N * 3);
    const ramp = (t: number): number => {
      const k = Math.min(1, Math.max(0, (Math.abs(t / N - 0.5) * 2 - 0.4) / 0.6));
      return k * k * (3 - 2 * k);
    };
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const mx = ramp(x + 0.5);
        const my = ramp(y + 0.5);
        const m = mx + my - mx * my;
        const o = (y * N + x) * 3;
        const p = (wrap(y + N / 2) * N + wrap(x + N / 2)) * 3;
        for (let c = 0; c < 3; c++) pic[o + c] = sharp[o + c] * (1 - m) + sharp[p + c] * m;
      }
    }
  }
  const out = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // Fine grain, and (on a field) broad drifts of light and dark so the mass is never flat.
      const g = 1 + (h2(x, y, seed + 3) - 0.5) * 0.05 + (vn(x, y, 4, seed + 4) - 0.5) * 0.07 + (field ? (vn(x, y, 16, seed + 5) - 0.5) * 0.1 : 0);
      const o = (y * N + x) * 3;
      const d = (y * N + x) * 4;
      out[d] = pic[o] * g;
      out[d + 1] = pic[o + 1] * g;
      out[d + 2] = pic[o + 2] * g;
      out[d + 3] = alpha[y * N + x];
    }
  }
  return out;
}
