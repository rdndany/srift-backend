import { type GroundKey } from './beyondBiomes';
import { B, BB } from './blocks';
import { SEA_LEVEL } from './chunk';
import { Simplex, hash2 } from './noise';
import { strataAt, type Ground } from './surface';
import { snowLine } from './terrain';

/**
 * What the ground of every Beyond biome is made of: the top block, the filler under it, whether sand lies in layers, and
 * the coloured strata of the badlands. Like the overworld's rules, most grounds mix a few blocks in patches (`p` is a
 * fine noise, `p2` a broad one, `r` a per-column hash) so that no country is one flat colour.
 */

const cache = new Map<string, Ground>();
function g(top: number, sub: number, sandy = false, strata = false, sandTop?: number, sandRock?: number): Ground {
  const key = `${top},${sub},${sandy ? 1 : 0},${strata ? 1 : 0},${sandTop ?? 0},${sandRock ?? 0}`;
  let v = cache.get(key);
  if (!v) cache.set(key, (v = { top, sub, sandy, strata, sandTop, sandRock }));
  return v;
}

/** What the rules are told about a column. */
export interface GroundCtx {
  h: number;
  /** The biggest height difference to a neighbour. */
  slope: number;
  /** Touches water at its own level. */
  shore: boolean;
  /** Temperature, 0..1. */
  t: number;
  p: number;
  p2: number;
  r: number;
}

/** Grounds snow never settles on whatever the height: water, the warm and the strange. */
const NO_SNOW: ReadonlySet<GroundKey> = new Set<GroundKey>([
  'sand', 'red_sand', 'rock_desert', 'badlands', 'salt', 'glass_sand', 'ash', 'bone', 'swamp', 'bog', 'toxic', 'marsh', 'mangrove', 'crystal',
  'volcanic', 'mushroom', 'fairy', 'dream', 'moonlit', 'luminous', 'sea_sand', 'sea_gravel', 'sea_clay', 'sea_coral', 'sea_rock', 'sea_kelp',
  'sea_ice', 'sea_volcanic', 'sea_crystal', 'abyss', 'river_bed', 'beach', 'shingle', 'worldroot', 'night', 'sky', 'pale', 'hollow', 'drowned',
  'jungle', 'ice', 'polar',
]);

/** The soils on which a tree, a flower or a tuft of grass may stand. */
export function isBeyondSoil(id: number): boolean {
  return BEYOND_SOILS.has(id);
}

const BEYOND_SOILS: ReadonlySet<number> = new Set<number>([
  B.GRASS, B.DIRT, B.SNOW, B.PODZOL, B.COARSE_DIRT, B.MYCELIUM, B.MUD,
  BB.golden_grass_block, BB.dead_grass_block, BB.tundra_turf, BB.luminous_moss, BB.peat, B.MOSS_BLOCK,
]);

/** The ground of one biome. `key` is its `ground`. */
export function beyondGroundOf(key: GroundKey, c: GroundCtx): Ground {
  const { h, slope, shore, t, p, p2, r } = c;
  const depth = SEA_LEVEL - h;
  const base = baseGround(key, h, slope, shore, t, p, p2, r, depth);
  if (h > SEA_LEVEL + 8 && !NO_SNOW.has(key)) {
    const sl = snowLine(t);
    if (sl < 380 && h + p * 6 + p2 * 3 >= sl) {
      const earth = base.sub === B.DIRT && slope < 3 && base.top !== B.STONE && base.top !== B.GRAVEL;
      if (earth) return g(B.SNOW, B.DIRT);
      return g(B.SNOW_BLOCK, B.STONE);
    }
  }
  return base;
}

function baseGround(key: GroundKey, h: number, slope: number, shore: boolean, t: number, p: number, p2: number, r: number, depth: number): Ground {
  switch (key) {
    // ---- grass and forest
    case 'grass':
      if (shore) return t < 0.36 ? g(B.GRAVEL, B.DIRT) : g(B.SAND, B.SAND, true);
      if (p2 > 0.66 && p > 0.1) return g(B.COARSE_DIRT, B.DIRT);
      return g(B.GRASS, B.DIRT);
    case 'meadow':
      if (shore) return g(B.GRAVEL, B.DIRT);
      return p2 > 0.7 ? g(B.COARSE_DIRT, B.DIRT) : g(B.GRASS, B.DIRT);
    case 'golden':
      if (shore) return g(B.SAND, B.SAND, true);
      return p2 > 0.5 ? g(B.COARSE_DIRT, B.DIRT) : g(BB.golden_grass_block, B.DIRT);
    case 'steppe':
      if (slope >= 3) return p > 0 ? g(B.GRAVEL, B.STONE) : g(B.STONE, B.STONE);
      if (p2 > 0.3) return g(B.COARSE_DIRT, B.DIRT);
      return p > 0.45 ? g(B.GRAVEL, B.DIRT) : g(BB.golden_grass_block, B.DIRT);
    case 'highland':
      if (slope >= 3 || p > 0.32) return p2 > 0.2 ? g(B.GRAVEL, B.STONE) : g(B.STONE, B.STONE);
      return p < -0.4 ? g(B.COARSE_DIRT, B.DIRT) : g(B.GRASS, B.DIRT);
    case 'podzol':
      return p2 > 0.45 ? g(B.GRASS, B.DIRT) : g(B.PODZOL, B.DIRT);
    case 'mossy':
      return p2 > 0.35 ? g(B.MOSS_BLOCK, B.DIRT) : p2 < -0.4 ? g(B.GRASS, B.DIRT) : g(B.PODZOL, B.DIRT);
    case 'jungle':
      if (shore) return g(B.SAND, B.SAND, true);
      return p2 > 0.62 ? g(B.PODZOL, B.DIRT) : p < -0.5 ? g(B.MUD, B.DIRT) : g(B.GRASS, B.DIRT);
    case 'autumn':
      return p2 > 0.4 ? g(B.GRASS, B.DIRT) : g(B.PODZOL, B.DIRT);
    case 'dead':
      return p2 > 0.3 ? g(B.COARSE_DIRT, B.DIRT) : g(BB.dead_grass_block, B.DIRT);
    case 'petrified':
      if (slope >= 2 || p > 0.3) return g(BB.limestone, BB.limestone);
      return p2 > 0 ? g(B.COARSE_DIRT, B.DIRT) : g(BB.dead_grass_block, B.DIRT);
    // ---- deserts
    case 'sand':
      if (slope >= 3 && p > 0.1) return g(B.SANDSTONE, B.SANDSTONE);
      return g(B.SAND, B.SAND, true);
    case 'red_sand':
      if (slope >= 3 && p > 0.1) return g(B.RED_SANDSTONE, B.RED_SANDSTONE);
      return g(B.RED_SAND, B.RED_SANDSTONE, true);
    case 'rock_desert':
      if (slope >= 2 || p > 0.2) return p2 > 0.2 ? g(B.GRAVEL, B.STONE) : g(B.ANDESITE, B.STONE);
      return p < -0.3 ? g(B.SANDSTONE, B.SANDSTONE) : g(B.SAND, B.SAND, true);
    case 'badlands':
      if (slope >= 2) return g(strataAt(h), B.TERRACOTTA, false, true);
      if (h > SEA_LEVEL + 22 && p2 > 0.1) return g(strataAt(h), B.TERRACOTTA, false, true);
      return p > 0.5 ? g(B.COARSE_DIRT, B.TERRACOTTA, false, true) : g(B.RED_SAND, B.RED_SANDSTONE, true, true);
    case 'salt':
      return p2 > 0.4 ? g(B.SAND, BB.salt_block, true) : g(BB.salt_block, BB.salt_block);
    case 'glass_sand':
      return p > 0.45 ? g(B.GLASS, BB.crystal_sand) : g(BB.crystal_sand, BB.crystal_sand, true, false, BB.crystal_sand, B.SANDSTONE);
    case 'ash':
      if (slope >= 3) return g(BB.charred_stone, BB.basalt);
      return p2 > 0.2 ? g(BB.ash_block, BB.charred_stone) : g(BB.ash_block, BB.ash_block);
    case 'bone':
      if (slope >= 3 && p > 0) return g(BB.fossil_rock, BB.limestone);
      return p > 0.5 ? g(BB.bone_block, BB.white_sand) : g(BB.white_sand, BB.white_sand, true, false, BB.white_sand, BB.limestone);
    // ---- mountains and cold
    case 'mountain':
      if (slope <= 1 && h < SEA_LEVEL + 90 && p2 > -0.2) return p2 > 0.3 ? g(B.PODZOL, B.DIRT) : g(B.GRASS, B.DIRT);
      if (slope >= 4) return p > 0.2 ? g(B.TUFF, B.STONE) : g(BB.slate, B.STONE);
      if (p > 0.34) return g(B.GRAVEL, B.STONE);
      if (p < -0.42) return g(B.ANDESITE, B.STONE);
      return g(B.STONE, B.STONE);
    case 'snow_rock':
      if (slope >= 3) return g(B.STONE, B.STONE);
      return p > 0.2 ? g(B.SNOW_BLOCK, B.STONE) : g(BB.frosted_stone, B.STONE);
    case 'alpine':
      if (slope >= 3) return p > 0.3 ? g(B.GRAVEL, B.STONE) : g(B.STONE, B.STONE);
      return p2 > 0.5 ? g(B.COARSE_DIRT, B.DIRT) : g(B.GRASS, B.DIRT);
    case 'ice':
      return p > 0.2 ? g(BB.blue_ice, B.PACKED_ICE) : g(B.PACKED_ICE, B.SNOW_BLOCK);
    case 'frost':
      if (shore) return g(B.GRAVEL, B.DIRT);
      return p2 > 0.55 && r < 0.4 ? g(B.SNOW_BLOCK, B.DIRT) : g(B.SNOW, B.DIRT);
    case 'tundra':
      if (shore) return g(B.GRAVEL, BB.permafrost);
      return p2 > 0.4 ? g(B.COARSE_DIRT, BB.permafrost) : p < -0.3 ? g(B.SNOW, BB.permafrost) : g(BB.tundra_turf, BB.permafrost);
    case 'polar':
      return p > 0.4 ? g(B.GRAVEL, BB.permafrost) : g(B.SNOW_BLOCK, BB.permafrost);
    // ---- wet
    case 'swamp':
      if (h <= SEA_LEVEL - 1) return p > 0.1 ? g(B.CLAY, B.MUD) : g(B.MUD, B.MUD);
      return p2 > 0.28 ? g(B.MUD, B.MUD) : g(B.GRASS, B.DIRT);
    case 'bog':
      if (h <= SEA_LEVEL - 1) return g(B.MUD, B.MUD);
      return p2 > -0.1 ? g(BB.peat, BB.peat) : g(B.MUD, B.MUD);
    case 'toxic':
      if (p > 0.45) return g(BB.sulfur_ore, B.MUD);
      return h <= SEA_LEVEL - 1 ? g(B.MUD, B.MUD) : p2 > 0 ? g(B.MUD, B.MUD) : g(B.COARSE_DIRT, B.DIRT);
    case 'marsh':
      if (h <= SEA_LEVEL - 1) return p > 0.1 ? g(B.CLAY, B.MUD) : g(B.MUD, B.MUD);
      return p2 > 0.3 ? g(B.MUD, B.MUD) : g(B.GRASS, B.DIRT);
    case 'mangrove':
      return h <= SEA_LEVEL ? g(B.MUD, B.MUD) : p2 > 0.2 ? g(B.MUD, B.MUD) : g(B.GRASS, B.DIRT);
    // ---- fantasy
    case 'crystal':
      if (slope >= 3 || p > 0.4) return g(BB.marble, B.STONE);
      return p2 > 0.2 ? g(BB.limestone, B.STONE) : g(B.STONE, B.STONE);
    case 'volcanic':
      if (slope >= 4) return g(BB.volcanic_rock, BB.basalt);
      return p > 0.3 ? g(BB.volcanic_rock, BB.basalt) : p2 > 0.1 ? g(BB.ash_block, BB.basalt) : g(BB.basalt, BB.basalt);
    case 'mushroom':
      return h >= SEA_LEVEL - 1 ? (p2 > 0.5 ? g(B.PODZOL, B.DIRT) : g(B.MYCELIUM, B.DIRT)) : g(B.GRAVEL, B.DIRT);
    case 'fairy':
      return p2 > 0.45 ? g(BB.luminous_moss, B.DIRT) : g(B.GRASS, B.DIRT);
    case 'dream':
      return p2 > 0.3 ? g(BB.luminous_moss, B.DIRT) : p < -0.3 ? g(B.PODZOL, B.DIRT) : g(B.GRASS, B.DIRT);
    case 'moonlit':
      return p2 > 0.2 ? g(B.MOSS_BLOCK, B.DIRT) : g(B.GRASS, B.DIRT);
    case 'luminous':
      return p2 > -0.1 ? g(BB.luminous_moss, B.DIRT) : g(B.MOSS_BLOCK, B.DIRT);
    // ---- water floors
    case 'sea_sand':
      return depth > 4 && p2 > 0.5 ? g(B.CLAY, B.CLAY) : g(B.SAND, B.SAND, true);
    case 'sea_gravel':
      if (depth > 22) return p2 > 0.45 ? g(B.STONE, B.STONE) : g(B.GRAVEL, B.GRAVEL);
      if (p2 > 0.42 && depth >= 2) return g(B.CLAY, B.CLAY);
      return depth > 12 ? (p > 0 ? g(B.GRAVEL, B.GRAVEL) : g(B.SAND, B.SAND)) : g(B.SAND, B.SAND, true);
    case 'sea_clay':
      return p2 > 0 ? g(B.CLAY, B.CLAY) : g(B.SAND, B.CLAY);
    case 'sea_coral':
      return p2 > 0.3 ? g(BB.white_sand, BB.white_sand, true, false, BB.white_sand, B.SANDSTONE) : g(B.SAND, B.SAND, true);
    case 'sea_rock':
      return p > 0.2 ? g(B.COBBLE, B.STONE) : p < -0.25 ? g(B.GRAVEL, B.STONE) : g(B.STONE, B.STONE);
    case 'sea_kelp':
      return p2 > 0.3 ? g(B.GRAVEL, B.GRAVEL) : p > 0.2 ? g(B.CLAY, B.CLAY) : g(B.SAND, B.SAND);
    case 'sea_ice':
      return depth > 6 ? g(B.GRAVEL, B.GRAVEL) : p > 0.2 ? g(B.GRAVEL, B.SAND) : g(B.SAND, B.SAND);
    case 'sea_volcanic':
      return p > 0.4 ? g(BB.volcanic_rock, BB.basalt) : p2 > 0 ? g(BB.black_sand, BB.basalt, true, false, BB.black_sand, BB.basalt) : g(BB.basalt, BB.basalt);
    case 'sea_crystal':
      return p > 0.35 ? g(BB.crystal_sand, BB.crystal_sand) : g(BB.white_sand, BB.white_sand, true, false, BB.white_sand, B.SANDSTONE);
    case 'abyss':
      return p > 0.3 ? g(BB.basalt, BB.basalt) : p2 > 0.2 ? g(B.GRAVEL, B.STONE) : g(BB.slate, B.STONE);
    case 'river_bed':
      return p2 > 0.3 && depth >= 1 ? g(B.CLAY, B.SAND) : p < -0.25 ? g(B.GRAVEL, B.GRAVEL) : g(B.SAND, B.SAND);
    case 'beach':
      return t < 0.3 ? g(B.GRAVEL, B.SAND) : h <= SEA_LEVEL + 1 && t > 0.7 && p2 > 0.5 ? g(BB.white_sand, BB.white_sand, true, false, BB.white_sand, B.SANDSTONE) : g(B.SAND, B.SAND, true);
    case 'shingle':
      return p > 0.2 ? g(B.COBBLE, B.STONE) : p < -0.25 ? g(B.GRAVEL, B.STONE) : g(B.STONE, B.STONE);
    case 'cliff':
      return slope >= 3 || p > 0.2 ? (p2 > 0.2 ? g(BB.slate, B.STONE) : g(B.STONE, B.STONE)) : p < -0.3 ? g(B.GRAVEL, B.STONE) : g(B.ANDESITE, B.STONE);
    case 'floodplain':
      return p2 > 0.3 ? g(B.CLAY, B.DIRT) : p < -0.3 ? g(B.COARSE_DIRT, B.DIRT) : g(B.GRASS, B.DIRT);
    // ---- the realms
    case 'ancient':
      return p2 > 0.62 ? g(B.COARSE_DIRT, B.DIRT) : p2 < -0.6 ? g(BB.limestone, B.STONE) : g(B.GRASS, B.DIRT);
    case 'worldroot':
      return p2 > 0.1 ? g(B.MOSS_BLOCK, B.DIRT) : p < -0.3 ? g(BB.luminous_moss, B.DIRT) : g(B.GRASS, B.DIRT);
    case 'night':
      return p2 > 0.2 ? g(B.PODZOL, B.DIRT) : p > 0.5 ? g(BB.luminous_moss, B.DIRT) : g(B.MOSS_BLOCK, B.DIRT);
    case 'sky':
      return slope >= 3 ? g(BB.skystone, B.STONE) : p2 > 0.4 ? g(BB.skystone, B.STONE) : g(B.GRASS, B.DIRT);
    case 'pale':
      return p > 0.4 ? g(BB.limestone, BB.limestone) : p2 > 0 ? g(BB.white_sand, BB.limestone, true, false, BB.white_sand, BB.limestone) : g(BB.bone_block, BB.limestone);
    case 'hollow':
      return p2 > 0.3 ? g(BB.luminous_moss, B.DIRT) : g(B.MOSS_BLOCK, B.DIRT);
    case 'drowned':
      return p > 0.3 ? g(BB.limestone, BB.limestone) : p2 > 0.2 ? g(B.CLAY, B.CLAY) : g(B.SAND, B.SAND);
    default:
      return g(B.GRASS, B.DIRT);
  }
}

/** The fine and broad patch noises the generator hands to `beyondGroundOf` (one pair per seed). */
export class GroundNoise {
  private readonly a: Simplex;
  private readonly b: Simplex;

  constructor(private readonly seed: number) {
    this.a = new Simplex(seed * 13 + 4101);
    this.b = new Simplex(seed * 13 + 4102);
  }

  ctx(wx: number, wz: number, h: number, slope: number, shore: boolean, t: number): GroundCtx {
    return { h, slope, shore, t, p: this.a.noise2(wx / 11, wz / 11), p2: this.b.noise2(wx / 33 + 100, wz / 33), r: hash2(this.seed + 301, wx, wz) };
  }
}
