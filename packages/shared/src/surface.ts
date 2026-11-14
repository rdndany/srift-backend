import { Biome } from './biomes';
import { B } from './blocks';
import { SEA_LEVEL } from './chunk';
import { Simplex, hash2 } from './noise';
import { snowLine } from './terrain';

/**
 * What the ground of a column is made of: the block on top and the filler under it. Each biome has its own rules, and
 * most of them mix several blocks in patches (grass with podzol and coarse dirt, plains with bare earth, mountains with
 * gravel and stone) so that no land is one flat colour of block. Snow lies by altitude and temperature (`snowLine`), so it
 * fades in from the rock above the trees and never touches the warm lands.
 */

export interface Ground {
  top: number;
  sub: number;
  /** Several layers of loose sand over sandstone, as in a desert. */
  sandy: boolean;
  /** Layers of coloured clay below the top (the badlands). */
  strata: boolean;
}

const cache = new Map<string, Ground>();
function g(top: number, sub: number, sandy = false, strata = false): Ground {
  const key = `${top},${sub},${sandy ? 1 : 0},${strata ? 1 : 0}`;
  let v = cache.get(key);
  if (!v) cache.set(key, (v = { top, sub, sandy, strata }));
  return v;
}

/** The soils a tree or a flower can stand on. */
export const SOILS: ReadonlySet<number> = new Set<number>([B.GRASS, B.DIRT, B.SNOW, B.PODZOL, B.COARSE_DIRT, B.MYCELIUM, B.MUD]);

/** The coloured clays of the badlands, in layers 1 to 3 blocks thick, from bedrock to sky. Fixed: every world has the same strata. */
const STRATA: number[] = (() => {
  const palette = [
    B.TERRACOTTA, B.TERRACOTTA_ORANGE, B.TERRACOTTA, B.TERRACOTTA_YELLOW, B.TERRACOTTA_ORANGE, B.TERRACOTTA_WHITE, B.TERRACOTTA,
    B.TERRACOTTA_RED, B.TERRACOTTA_ORANGE, B.TERRACOTTA_BROWN, B.TERRACOTTA, B.TERRACOTTA_LIGHT_GRAY, B.TERRACOTTA_ORANGE, B.TERRACOTTA_YELLOW,
  ];
  const out: number[] = [];
  let k = 0;
  while (out.length < 256) {
    const colour = palette[Math.floor(hash2(9001, k, 7) * palette.length)];
    const thick = 1 + Math.floor(hash2(9002, k, 7) * 3);
    for (let i = 0; i < thick; i++) out.push(colour);
    k++;
  }
  return out;
})();
export const strataAt = (y: number): number => STRATA[y & 255];

/** Biomes snow does not settle on whatever the height: water, the warm lands. */
const NO_SNOW = new Set<number>([
  Biome.OCEAN, Biome.DEEP_OCEAN, Biome.FROZEN_OCEAN, Biome.WARM_OCEAN, Biome.RIVER, Biome.FROZEN_RIVER, Biome.MUSHROOM_FIELDS, Biome.SWAMP,
  Biome.DESERT, Biome.BADLANDS, Biome.JUNGLE, Biome.BEACH,
]);

export class SurfaceRules {
  private nPatch: Simplex;
  private nPatch2: Simplex;

  constructor(private readonly seed: number) {
    this.nPatch = new Simplex(seed * 13 + 4001);
    this.nPatch2 = new Simplex(seed * 13 + 4002);
  }

  /**
   * The ground of column (wx, wz) of height `h` in `biome`. `slope` is the biggest height difference to a neighbour,
   * `shore` says the column touches water at its own level, `t` is the temperature (0..1, for the snow line).
   */
  ground(biome: number, wx: number, wz: number, h: number, slope: number, shore: boolean, t: number): Ground {
    const p = this.nPatch.noise2(wx / 11, wz / 11);
    const p2 = this.nPatch2.noise2(wx / 33 + 100, wz / 33);
    const r = hash2(this.seed + 301, wx, wz);
    const base = this.base(biome, wx, wz, h, slope, shore, t, p, p2, r);
    if (h > SEA_LEVEL + 8 && !NO_SNOW.has(biome)) {
      const sl = snowLine(t);
      if (sl < 380 && h + p * 6 + p2 * 3 >= sl) {
        const earth = base.sub === B.DIRT && slope < 3 && base.top !== B.STONE && base.top !== B.GRAVEL && base.top !== B.ANDESITE;
        if (earth) return g(B.SNOW, B.DIRT);
        return g(B.SNOW_BLOCK, B.STONE);
      }
    }
    return base;
  }

  private base(biome: number, wx: number, wz: number, h: number, slope: number, shore: boolean, t: number, p: number, p2: number, r: number): Ground {
    const depth = SEA_LEVEL - h;
    switch (biome) {
      case Biome.OCEAN:
      case Biome.DEEP_OCEAN:
        if (depth > 22) return p2 > 0.45 ? g(B.STONE, B.STONE) : g(B.GRAVEL, B.GRAVEL);
        if (p2 > 0.42 && depth >= 2) return g(B.CLAY, B.CLAY);
        if (depth > 12) return p > 0 ? g(B.GRAVEL, B.GRAVEL) : g(B.SAND, B.SAND);
        return g(B.SAND, B.SAND, true);
      case Biome.WARM_OCEAN:
        return depth > 4 && p2 > 0.5 ? g(B.CLAY, B.CLAY) : g(B.SAND, B.SAND, true);
      case Biome.FROZEN_OCEAN:
        return depth > 6 ? g(B.GRAVEL, B.GRAVEL) : p > 0.2 ? g(B.GRAVEL, B.SAND) : g(B.SAND, B.SAND);
      case Biome.RIVER:
      case Biome.FROZEN_RIVER:
        return p2 > 0.3 && depth >= 1 ? g(B.CLAY, B.SAND) : p < -0.25 ? g(B.GRAVEL, B.GRAVEL) : g(B.SAND, B.SAND);
      case Biome.BEACH:
        return g(B.SAND, B.SAND, true);
      case Biome.SNOWY_BEACH:
        return h <= SEA_LEVEL + 1 ? g(B.SAND, B.SAND, true) : g(B.SNOW_BLOCK, B.SAND);
      case Biome.STONY_SHORE:
        return p > 0.2 ? g(B.COBBLE, B.STONE) : p < -0.25 ? g(B.GRAVEL, B.STONE) : g(B.STONE, B.STONE);
      case Biome.SNOW:
        if (shore) return g(B.GRAVEL, B.DIRT);
        return p2 > 0.55 && r < 0.4 ? g(B.SNOW_BLOCK, B.DIRT) : g(B.SNOW, B.DIRT);
      case Biome.SNOWY_TAIGA:
        return p2 > 0.62 ? g(B.PODZOL, B.DIRT) : g(B.SNOW, B.DIRT);
      case Biome.ICE_SPIKES:
        return g(B.SNOW_BLOCK, B.SNOW_BLOCK);
      case Biome.DESERT:
        // Rock pokes through the dunes here and there.
        if (slope >= 3 && p > 0.1) return g(B.SANDSTONE, B.SANDSTONE);
        return g(B.SAND, B.SAND, true);
      case Biome.BADLANDS:
        // Flat floors are red sand, the risers show the coloured layers.
        if (slope >= 2) return g(strataAt(h), B.TERRACOTTA, false, true);
        if (h > SEA_LEVEL + 22 && p2 > 0.1) return g(strataAt(h), B.TERRACOTTA, false, true);
        return p > 0.5 ? g(B.COARSE_DIRT, B.TERRACOTTA, false, true) : g(B.RED_SAND, B.RED_SANDSTONE, true, true);
      case Biome.SAVANNA:
        if (shore) return g(B.SAND, B.SAND, true);
        return p2 > 0.45 ? g(B.COARSE_DIRT, B.DIRT) : g(B.GRASS, B.DIRT);
      case Biome.JUNGLE:
        if (shore) return g(B.SAND, B.SAND, true);
        return p2 > 0.7 ? g(B.PODZOL, B.DIRT) : g(B.GRASS, B.DIRT);
      case Biome.SWAMP:
        if (h <= SEA_LEVEL - 1) return p > 0.1 ? g(B.CLAY, B.MUD) : g(B.MUD, B.MUD);
        return p2 > 0.28 ? g(B.MUD, B.MUD) : g(B.GRASS, B.DIRT);
      case Biome.MUSHROOM_FIELDS:
        return h >= SEA_LEVEL - 1 ? g(B.MYCELIUM, B.DIRT) : g(B.GRAVEL, B.DIRT);
      case Biome.TAIGA:
        if (shore) return g(B.GRAVEL, B.DIRT);
        return p2 > 0.38 ? g(B.PODZOL, B.DIRT) : p2 < -0.55 ? g(B.COARSE_DIRT, B.DIRT) : g(B.GRASS, B.DIRT);
      case Biome.OLD_TAIGA:
        return p2 < -0.5 ? g(B.GRASS, B.DIRT) : p < -0.4 ? g(B.COARSE_DIRT, B.DIRT) : g(B.PODZOL, B.DIRT);
      case Biome.DARK_FOREST:
        if (shore) return g(B.SAND, B.SAND, true);
        return p2 > 0.36 ? g(B.PODZOL, B.DIRT) : g(B.GRASS, B.DIRT);
      case Biome.WINDSWEPT_HILLS:
        if (slope >= 3 || p > 0.28) return p2 > 0.2 ? g(B.GRAVEL, B.STONE) : g(B.STONE, B.STONE);
        if (p < -0.4) return g(B.COARSE_DIRT, B.DIRT);
        return g(B.GRASS, B.DIRT);
      case Biome.MOUNTAIN:
      case Biome.STONY_PEAKS: {
        // Meadow where the slope is gentle and the air thick, bare rock above and on every steep face.
        if (biome === Biome.MOUNTAIN && slope <= 1 && h < SEA_LEVEL + 70) return p2 > 0.3 ? g(B.PODZOL, B.DIRT) : g(B.GRASS, B.DIRT);
        if (slope >= 4) return p > 0.2 ? g(B.TUFF, B.STONE) : g(B.STONE, B.STONE);
        if (p > 0.34) return g(B.GRAVEL, B.STONE);
        if (p < -0.42) return g(B.ANDESITE, B.STONE);
        if (biome === Biome.STONY_PEAKS && p2 > 0.4) return g(B.COBBLE, B.STONE);
        return g(B.STONE, B.STONE);
      }
      case Biome.MEADOW:
      case Biome.CHERRY_GROVE:
        return p2 > 0.62 ? g(B.COARSE_DIRT, B.DIRT) : g(B.GRASS, B.DIRT);
      case Biome.PLAINS:
      case Biome.FOREST:
      case Biome.BIRCH_FOREST:
      case Biome.FLOWER_FOREST:
      default:
        if (shore) return t < 0.36 ? g(B.GRAVEL, B.DIRT) : g(B.SAND, B.SAND, true);
        // Bare earth in the odd patch keeps a big meadow from being one block of colour.
        if (p2 > 0.66 && p > 0.1) return g(B.COARSE_DIRT, B.DIRT);
        return g(B.GRASS, B.DIRT);
    }
  }
}
