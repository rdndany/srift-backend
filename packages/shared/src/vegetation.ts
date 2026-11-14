import { Biome, type Column } from './biomes';
import { B, IS_LEAVES, IS_LOG, IS_SOLID } from './blocks';
import { CHUNK_SIZE, SEA_LEVEL, WORLD_HEIGHT, blockIndex } from './chunk';
import { Simplex, hash2, mulberry32 } from './noise';
import { SOILS, type Ground, type SurfaceRules } from './surface';
import { snowLine } from './terrain';
import { isGiant, trunkHeight, treeBlocks, type TreeKind } from './trees';

/**
 * Everything that grows or lies on the ground of the new world: the trees of each climate, flowers and ferns and
 * tall grass, mushrooms, reeds and lily pads, cacti, bushes, boulders, pumpkin and melon patches, giant mushrooms and
 * spikes of ice. A chunk writes only its own cells, but asks for every candidate near it (a tree is rooted up to a
 * few blocks outside), so what crosses a chunk border comes out whole whichever chunk is made first.
 */

export interface VegetationHost {
  readonly seed: number;
  readonly rules: SurfaceRules;
  columnAt(wx: number, wz: number): Column;
  inLake(wx: number, wz: number, pad?: number): boolean;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Flowers of the open country, one kind to a patch. */
const MEADOW_FLOWERS = [B.DANDELION, B.OXEYE_DAISY, B.CORNFLOWER, B.AZURE_BLUET, B.ALLIUM, B.TULIP_WHITE, B.ROSE];
const PLAINS_FLOWERS = [B.DANDELION, B.ROSE, B.OXEYE_DAISY, B.CORNFLOWER, B.AZURE_BLUET, B.TULIP_RED, B.TULIP_ORANGE, B.TULIP_WHITE, B.TULIP_PINK];
const ALL_FLOWERS = [B.DANDELION, B.ROSE, B.OXEYE_DAISY, B.CORNFLOWER, B.AZURE_BLUET, B.ALLIUM, B.TULIP_RED, B.TULIP_ORANGE, B.TULIP_WHITE, B.TULIP_PINK, B.BLUE_ORCHID];
const CHERRY_FLOWERS = [B.TULIP_PINK, B.ALLIUM, B.AZURE_BLUET, B.PINK_PETALS, B.PINK_PETALS];

const pick = <T>(list: readonly T[], u: number): T => list[Math.min(list.length - 1, Math.floor(u * list.length))];

export class Vegetation {
  private nTrees: Simplex;
  private nBirch: Simplex;

  constructor(
    private readonly host: VegetationHost,
    seed: number,
  ) {
    this.nTrees = new Simplex(seed * 17 + 5001);
    this.nBirch = new Simplex(seed * 17 + 5002);
  }

  private get seed(): number {
    return this.host.seed;
  }

  /** The ground of a column, as `SurfaceRules` makes it (the top block decides where a tree or a boulder may stand). */
  groundOf(wx: number, wz: number, col: Column): Ground {
    const h = col.height;
    const hn = this.host.columnAt(wx, wz - 1).height;
    const hs = this.host.columnAt(wx, wz + 1).height;
    const he = this.host.columnAt(wx + 1, wz).height;
    const hw = this.host.columnAt(wx - 1, wz).height;
    const slope = Math.max(Math.abs(h - hn), Math.abs(h - hs), Math.abs(h - he), Math.abs(h - hw));
    const shore = h <= SEA_LEVEL + 1 && (hn < SEA_LEVEL || hs < SEA_LEVEL || he < SEA_LEVEL || hw < SEA_LEVEL);
    return this.host.rules.ground(col.biome, wx, wz, h, slope, shore, col.t ?? 0.5);
  }

  // ---- trees --------------------------------------------------------------------------------

  /** Which tree (if any) is rooted at this column: a density per biome, in clumps, and a kind chosen by a second hash. */
  private treeAt(wx: number, wz: number, col: Column): { kind: TreeKind; big: boolean } | null {
    const r = hash2(this.seed + 77, wx, wz);
    if (r >= 0.11) return null;
    const biome = col.biome;
    if (col.height <= SEA_LEVEL + (biome === Biome.SWAMP ? 0 : 1)) return null;
    const n = this.nTrees.fbm2(wx / 55, wz / 55, 2);
    const clump = Math.min(1.5, Math.max(0.05, 0.5 + n * 1.6));
    let d = 0;
    let kind: TreeKind = 'oak';
    let big = false;
    // Chosen after the tree is known to stand here: uniform in [0, 1) and independent of the density test.
    const pickAt = (density: number): number => r / density;
    switch (biome) {
      case Biome.PLAINS: {
        d = 0.0015 + 0.032 * smooth(0.26, 0.42, n);
        const u = pickAt(d);
        kind = hash2(this.seed + 79, wx, wz) < 0.18 ? 'birch' : 'oak';
        big = kind === 'oak' && u < 0.1;
        break;
      }
      case Biome.FOREST: {
        d = 0.055 * clump;
        const patch = this.nBirch.fbm2(wx / 70, wz / 70, 2);
        kind = hash2(this.seed + 79, wx, wz) < (patch > 0.1 ? 0.8 : 0.08) ? 'birch' : 'oak';
        big = kind === 'oak' && pickAt(d) < 0.08;
        break;
      }
      case Biome.BIRCH_FOREST: {
        d = 0.062 * clump;
        kind = hash2(this.seed + 79, wx, wz) < 0.92 ? 'birch' : 'oak';
        big = kind === 'birch' && pickAt(d) < 0.3;
        break;
      }
      case Biome.FLOWER_FOREST: {
        d = 0.03 * clump;
        kind = hash2(this.seed + 79, wx, wz) < 0.45 ? 'birch' : 'oak';
        big = kind === 'oak' && pickAt(d) < 0.1;
        break;
      }
      case Biome.DARK_FOREST: {
        d = 0.05 * clump;
        const u = pickAt(d);
        if (u < 0.62) {
          kind = 'dark_oak';
          big = true;
        } else {
          kind = u < 0.9 ? 'dark_oak' : 'oak';
        }
        break;
      }
      case Biome.TAIGA:
        d = 0.05 * clump;
        kind = 'spruce';
        big = pickAt(d) < 0.07;
        break;
      case Biome.OLD_TAIGA:
        d = 0.075 * clump;
        kind = 'spruce';
        big = pickAt(d) < 0.32;
        break;
      case Biome.SNOWY_TAIGA:
        d = 0.042 * clump;
        kind = 'spruce';
        big = pickAt(d) < 0.05;
        break;
      case Biome.SNOW:
        d = 0.004 + 0.018 * smooth(0.3, 0.5, n);
        kind = 'spruce';
        break;
      case Biome.SAVANNA: {
        d = 0.004 + 0.034 * smooth(0.08, 0.36, n);
        kind = hash2(this.seed + 79, wx, wz) < 0.8 ? 'acacia' : 'oak';
        break;
      }
      case Biome.JUNGLE: {
        d = 0.1 * clump;
        const u = pickAt(d);
        if (u < 0.86) {
          kind = 'jungle';
          big = u < 0.14;
        } else {
          kind = 'oak';
        }
        break;
      }
      case Biome.SWAMP:
        d = 0.034 * clump;
        kind = 'oak';
        break;
      case Biome.MEADOW:
        d = 0.0035;
        kind = hash2(this.seed + 79, wx, wz) < 0.5 ? 'birch' : 'oak';
        break;
      case Biome.CHERRY_GROVE:
        d = 0.04 * clump;
        kind = 'cherry';
        break;
      case Biome.WINDSWEPT_HILLS:
        d = 0.014 * clump;
        kind = hash2(this.seed + 79, wx, wz) < 0.65 ? 'spruce' : 'oak';
        break;
      case Biome.MOUNTAIN:
        d = col.height < snowLine(col.t ?? 0.5) - 10 ? 0.016 * clump : 0;
        kind = 'spruce';
        break;
      default:
        return null;
    }
    if (r >= d) return null;
    return { kind, big };
  }

  placeTrees(blocks: Uint16Array, cx: number, cz: number): void {
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    const seed = this.seed;
    const REACH = 7;

    const set = (wx: number, y: number, wz: number, id: number, onlyAir: boolean): void => {
      const lx = wx - ox;
      const lz = wz - oz;
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return;
      const idx = blockIndex(lx, y, lz);
      if (onlyAir && blocks[idx] !== B.AIR) return;
      blocks[idx] = id;
    };

    for (let tx = ox - REACH; tx < ox + CHUNK_SIZE + REACH; tx++) {
      for (let tz = oz - REACH; tz < oz + CHUNK_SIZE + REACH; tz++) {
        if (hash2(seed + 77, tx, tz) >= 0.11) continue;
        const col = this.host.columnAt(tx, tz);
        const choice = this.treeAt(tx, tz, col);
        if (!choice) continue;
        if (this.host.inLake(tx, tz, 1.6)) continue;
        const ground = this.groundOf(tx, tz, col);
        if (!SOILS.has(ground.top) || ground.top === B.MYCELIUM) continue;
        // Trees are tall; a root deep in the snow line or on a cliff would hang in the air.
        const { kind } = choice;
        let { big } = choice;
        if (isGiant(kind, big)) {
          const base = col.height;
          for (const [dx, dz] of [[1, 0], [0, 1], [1, 1]]) {
            const c2 = this.host.columnAt(tx + dx, tz + dz);
            if (Math.abs(c2.height - base) > 1 || c2.height <= SEA_LEVEL) big = false;
          }
        }
        const rand = mulberry32(Math.floor(hash2(seed + 78, tx, tz) * 4294967296) | 0);
        const trunk = trunkHeight(kind, rand, big);
        for (const b of treeBlocks(tx, col.height + 1, tz, trunk, rand, kind, big)) set(b.x, b.y, b.z, b.id, b.leaf);
      }
    }
  }

  // ---- ground cover ---------------------------------------------------------------------------

  /** The height of the ground surface in a chunk's column (the first solid, non-leaf block near the biome's own height). */
  private groundY(blocks: Uint16Array, lx: number, lz: number, h: number): number {
    for (let y = Math.min(WORLD_HEIGHT - 3, h + 3); y >= Math.max(1, h - 3); y--) {
      const id = blocks[blockIndex(lx, y, lz)];
      if (id === B.AIR || IS_LEAVES[id] || !IS_SOLID[id]) continue;
      if (IS_LOG[id]) continue;
      return y;
    }
    return -1;
  }

  placePlants(blocks: Uint16Array, cx: number, cz: number): void {
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    const seed = this.seed;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx;
        const wz = oz + lz;
        const col = this.host.columnAt(wx, wz);
        const h = col.height;
        if (h < SEA_LEVEL) {
          this.waterCover(blocks, lx, lz, wx, wz, col);
          continue;
        }
        const y = this.groundY(blocks, lx, lz, h);
        if (y < SEA_LEVEL || y >= WORLD_HEIGHT - 3) continue;
        if (blocks[blockIndex(lx, y + 1, lz)] !== B.AIR) continue;
        const ground = blocks[blockIndex(lx, y, lz)];
        const put = (id: number): void => {
          if (id !== B.AIR) blocks[blockIndex(lx, y + 1, lz)] = id;
        };

        // Hot, dry ground: cacti and dead bushes.
        if (ground === B.SAND || ground === B.RED_SAND || (ground >= B.TERRACOTTA && ground <= B.TERRACOTTA_LIGHT_GRAY) || ground === B.COARSE_DIRT) {
          if (col.biome === Biome.DESERT || col.biome === Biome.BADLANDS || (col.biome === Biome.SAVANNA && ground === B.COARSE_DIRT)) this.desertPlant(blocks, lx, y, lz, wx, wz, col);
          else if (ground === B.SAND || ground === B.RED_SAND) this.reeds(blocks, lx, y, lz, wx, wz, col);
          if (ground !== B.COARSE_DIRT) continue;
        }
        if (!SOILS.has(ground)) continue;
        if (ground === B.SNOW && col.biome !== Biome.SNOWY_TAIGA && col.biome !== Biome.TAIGA) continue;
        if (ground === B.SNOW_BLOCK) continue;

        const patch = hash2(seed + 93, wx >> 3, wz >> 3);
        const patch2 = hash2(seed + 94, wx >> 3, wz >> 3);
        const r = hash2(seed + 91, wx, wz);
        const r2 = hash2(seed + 92, wx, wz);
        const soil = ground === B.GRASS || ground === B.DIRT || ground === B.PODZOL || ground === B.COARSE_DIRT || ground === B.SNOW;
        switch (col.biome) {
          case Biome.PLAINS:
            if (patch < 0.3 && r < 0.13) put(pick(PLAINS_FLOWERS, patch2));
            else if (r > 0.7) put(B.TALL_GRASS);
            break;
          case Biome.FOREST:
            if (patch < 0.1 && r < 0.08) put(patch2 < 0.5 ? B.ROSE : B.DANDELION);
            else if (r > 0.8) put(B.TALL_GRASS);
            else if (r < 0.035) put(B.FERN);
            else if (r2 < 0.003) put(patch2 < 0.5 ? B.BROWN_MUSHROOM : B.RED_MUSHROOM);
            break;
          case Biome.BIRCH_FOREST:
            if (patch < 0.12 && r < 0.07) put(pick([B.DANDELION, B.OXEYE_DAISY, B.AZURE_BLUET], patch2));
            else if (r > 0.78) put(B.TALL_GRASS);
            else if (r < 0.025) put(B.FERN);
            break;
          case Biome.FLOWER_FOREST:
            if (patch < 0.7 && r < 0.24) put(pick(ALL_FLOWERS, hash2(seed + 95, wx >> 1, wz >> 1)));
            else if (r > 0.86) put(B.TALL_GRASS);
            break;
          case Biome.DARK_FOREST:
            if (r > 0.9) put(B.TALL_GRASS);
            else if (r < 0.1) put(B.FERN);
            else if (r2 < 0.014) put(patch2 < 0.55 ? B.BROWN_MUSHROOM : B.RED_MUSHROOM);
            break;
          case Biome.TAIGA:
          case Biome.OLD_TAIGA:
          case Biome.SNOWY_TAIGA: {
            const old = col.biome === Biome.OLD_TAIGA;
            if (r < (old ? 0.16 : 0.1)) put(B.FERN);
            else if (r > 0.92) put(B.TALL_GRASS);
            else if (old && r2 < 0.012) put(patch2 < 0.5 ? B.BROWN_MUSHROOM : B.RED_MUSHROOM);
            break;
          }
          case Biome.SAVANNA:
            if (r > 0.64) put(B.TALL_GRASS);
            else if (patch < 0.06 && r < 0.05) put(B.TULIP_ORANGE);
            break;
          case Biome.JUNGLE:
            if (r > 0.7) put(B.TALL_GRASS);
            else if (r < 0.2) put(B.FERN);
            break;
          case Biome.SWAMP:
            if (r > 0.82) put(B.TALL_GRASS);
            else if (r < 0.05 && ground !== B.MUD) put(B.BLUE_ORCHID);
            else if (r2 < 0.012) put(B.BROWN_MUSHROOM);
            else if (ground === B.GRASS || ground === B.MUD) this.reeds(blocks, lx, y, lz, wx, wz, col);
            break;
          case Biome.MEADOW:
            if (patch < 0.75 && r < 0.3) put(pick(MEADOW_FLOWERS, patch2));
            else if (r > 0.82) put(B.TALL_GRASS);
            break;
          case Biome.CHERRY_GROVE:
            if (patch < 0.5 && r < 0.18) put(pick(CHERRY_FLOWERS, patch2));
            else if (r2 < 0.07) put(B.PINK_PETALS);
            else if (r > 0.84) put(B.TALL_GRASS);
            break;
          case Biome.WINDSWEPT_HILLS:
            if (soil && r > 0.88) put(B.TALL_GRASS);
            else if (soil && r < 0.03) put(B.FERN);
            break;
          case Biome.MOUNTAIN:
            if (ground === B.GRASS && r > 0.9) put(B.TALL_GRASS);
            else if (ground === B.GRASS && patch < 0.12 && r < 0.1) put(B.OXEYE_DAISY);
            break;
          case Biome.MUSHROOM_FIELDS:
            if (r < 0.05) put(r2 < 0.5 ? B.RED_MUSHROOM : B.BROWN_MUSHROOM);
            break;
          case Biome.SNOW:
            if (r < 0.01 && ground === B.SNOW) put(B.FERN);
            break;
          default:
            if (ground === B.GRASS && r > 0.9) put(B.TALL_GRASS);
        }
      }
    }
  }

  /** Cacti stand on a spacing grid so none touch, and never next to higher ground; dead bushes dot the sand. */
  private desertPlant(blocks: Uint16Array, lx: number, y: number, lz: number, wx: number, wz: number, col: Column): void {
    const seed = this.seed;
    const badlands = col.biome === Biome.BADLANDS;
    if (wx % 3 === 0 && wz % 3 === 0 && hash2(seed + 95, wx, wz) < (badlands ? 0.03 : 0.06)) {
      const ground = blocks[blockIndex(lx, y, lz)];
      if (ground !== B.SAND && ground !== B.RED_SAND) return;
      const h = col.height;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (this.host.columnAt(wx + dx, wz + dz).height > h) return;
      }
      const height = 1 + Math.floor(hash2(seed + 96, wx, wz) * 3);
      for (let k = 1; k <= height && y + k < WORLD_HEIGHT; k++) blocks[blockIndex(lx, y + k, lz)] = B.CACTUS;
    } else if (hash2(seed + 97, wx, wz) < (badlands ? 0.04 : 0.015)) {
      blocks[blockIndex(lx, y + 1, lz)] = B.DEAD_BUSH;
    }
  }

  /** Reeds along the water's edge, where the ground is just at the sea. */
  private reeds(blocks: Uint16Array, lx: number, y: number, lz: number, wx: number, wz: number, col: Column): void {
    if (y !== SEA_LEVEL || (col.heat ?? 2) < 2) return;
    if (hash2(this.seed + 98, wx, wz) >= 0.3) return;
    let wet = false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (this.host.columnAt(wx + dx, wz + dz).height < SEA_LEVEL) wet = true;
    }
    if (!wet) return;
    const n = 1 + Math.floor(hash2(this.seed + 99, wx, wz) * 3);
    for (let k = 1; k <= n && y + k < WORLD_HEIGHT; k++) {
      if (blocks[blockIndex(lx, y + k, lz)] !== B.AIR) break;
      blocks[blockIndex(lx, y + k, lz)] = B.SUGAR_CANE;
    }
  }

  /** Lily pads on the still water of swamps and rivers. */
  private waterCover(blocks: Uint16Array, lx: number, lz: number, wx: number, wz: number, col: Column): void {
    const swamp = col.biome === Biome.SWAMP;
    if (!swamp && col.biome !== Biome.RIVER) return;
    if (col.height < SEA_LEVEL - 6) return;
    if (hash2(this.seed + 100, wx, wz) >= (swamp ? 0.1 : 0.025)) return;
    if (blocks[blockIndex(lx, SEA_LEVEL, lz)] !== B.WATER || blocks[blockIndex(lx, SEA_LEVEL + 1, lz)] !== B.AIR) return;
    blocks[blockIndex(lx, SEA_LEVEL + 1, lz)] = B.LILY_PAD;
  }

  // ---- large features: boulders, patches, giant mushrooms, ice spikes, bushes ---------------------------------------

  placeFeatures(blocks: Uint16Array, cx: number, cz: number): void {
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    const seed = this.seed;
    const REACH = 8;

    const put = (wx: number, y: number, wz: number, id: number, onlyFree: boolean): void => {
      const lx = wx - ox;
      const lz = wz - oz;
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < 1 || y >= WORLD_HEIGHT) return;
      const idx = blockIndex(lx, y, lz);
      const cur = blocks[idx];
      if (onlyFree && cur !== B.AIR && IS_SOLID[cur]) return;
      if (onlyFree && cur === B.WATER) return;
      blocks[idx] = id;
    };

    for (let x = ox - REACH; x < ox + CHUNK_SIZE + REACH; x++) {
      for (let z = oz - REACH; z < oz + CHUNK_SIZE + REACH; z++) {
        const roll = hash2(seed + 410, x, z);
        // Nothing here is common: most columns are rejected by one hash.
        if (roll >= 0.03) continue;
        const col = this.host.columnAt(x, z);
        if (col.height <= SEA_LEVEL) continue;
        const rand = mulberry32(Math.floor(hash2(seed + 411, x, z) * 4294967296) | 0);
        const h = col.height;
        switch (col.biome) {
          case Biome.OLD_TAIGA:
            if (roll < 0.011) this.boulder(put, x, h, z, rand, B.MOSSY_COBBLE);
            break;
          case Biome.TAIGA:
          case Biome.SNOWY_TAIGA:
            if (roll < 0.0016) this.boulder(put, x, h, z, rand, B.MOSSY_COBBLE);
            break;
          case Biome.WINDSWEPT_HILLS:
            if (roll < 0.0025) this.boulder(put, x, h, z, rand, B.COBBLE);
            break;
          case Biome.PLAINS:
            if (roll < 0.0012) this.patch(put, blocks, x, h, z, rand, B.PUMPKIN, 3, 7);
            else if (roll < 0.0032) this.bush(put, x, h, z, B.LOG, B.LEAVES);
            break;
          case Biome.MEADOW:
            if (roll < 0.0009) this.patch(put, blocks, x, h, z, rand, B.PUMPKIN, 2, 5);
            break;
          case Biome.SAVANNA:
            if (roll < 0.007) this.bush(put, x, h, z, B.ACACIA_LOG, B.ACACIA_LEAVES);
            break;
          case Biome.JUNGLE:
            if (roll < 0.003) this.patch(put, blocks, x, h, z, rand, B.MELON, 3, 6);
            else if (roll < 0.03) this.bush(put, x, h, z, B.JUNGLE_LOG, B.JUNGLE_LEAVES);
            break;
          case Biome.FOREST:
          case Biome.SWAMP:
            if (roll < 0.0016) this.bush(put, x, h, z, B.LOG, B.LEAVES);
            break;
          case Biome.DARK_FOREST:
            if (roll < 0.0016) this.giantMushroom(put, x, h, z, rand, rand() < 0.5);
            break;
          case Biome.MUSHROOM_FIELDS:
            if (roll < 0.014) this.giantMushroom(put, x, h, z, rand, rand() < 0.5);
            break;
          case Biome.ICE_SPIKES:
            if (roll < 0.014) this.iceSpike(put, x, h, z, rand);
            break;
          default:
        }
      }
    }
  }

  /** A rounded heap of stone half sunk in the ground. */
  private boulder(put: (x: number, y: number, z: number, id: number, free: boolean) => void, x: number, h: number, z: number, rand: () => number, id: number): void {
    const r = 1.3 + rand() * 1.4;
    const R = Math.ceil(r);
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        for (let dz = -R; dz <= R; dz++) {
          const d = dx * dx + dz * dz + dy * dy * 1.3 + (rand() - 0.5) * 0.8;
          if (d > r * r) continue;
          if (dy < 0) continue;
          put(x + dx, h + 1 + dy - (dy > 0 ? 0 : 0), z + dz, rand() < 0.2 && id === B.MOSSY_COBBLE ? B.COBBLE : id, true);
        }
      }
    }
  }

  /** A little cluster of pumpkins or melons on the ground. */
  private patch(put: (x: number, y: number, z: number, id: number, free: boolean) => void, _blocks: Uint16Array, x: number, h: number, z: number, rand: () => number, id: number, lo: number, hi: number): void {
    const n = lo + Math.floor(rand() * (hi - lo + 1));
    for (let i = 0; i < n; i++) {
      const dx = Math.floor((rand() - 0.5) * 7);
      const dz = Math.floor((rand() - 0.5) * 7);
      const c = this.host.columnAt(x + dx, z + dz);
      if (c.height <= SEA_LEVEL || Math.abs(c.height - h) > 2) continue;
      const ground = this.groundOf(x + dx, z + dz, c);
      if (ground.top !== B.GRASS && ground.top !== B.PODZOL) continue;
      put(x + dx, c.height + 1, z + dz, id, true);
    }
  }

  /** A low bush: a log stub with a ball of leaves round it. */
  private bush(put: (x: number, y: number, z: number, id: number, free: boolean) => void, x: number, h: number, z: number, log: number, leaves: number): void {
    const col = this.host.columnAt(x, z);
    const ground = this.groundOf(x, z, col);
    if (ground.top !== B.GRASS && ground.top !== B.PODZOL && ground.top !== B.COARSE_DIRT) return;
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (Math.abs(dx) + Math.abs(dz) + dy > 2) continue;
          if (dx === 0 && dz === 0 && dy === 0) continue;
          put(x + dx, h + 1 + dy + 0, z + dz, leaves, true);
        }
      }
    }
    put(x, h + 1, z, log, false);
  }

  /** A giant mushroom: a thick stem under a dome (red, tall) or a flat plate (brown, wide). */
  private giantMushroom(put: (x: number, y: number, z: number, id: number, free: boolean) => void, x: number, h: number, z: number, rand: () => number, red: boolean): void {
    const stem = 4 + Math.floor(rand() * 4);
    if (red) {
      for (let k = 1; k <= stem; k++) put(x, h + k, z, B.MUSHROOM_STEM, false);
      const top = h + stem;
      const R = 3;
      for (let dy = -1; dy <= 3; dy++) {
        const rr = dy <= 0 ? R : R - dy * 0.9;
        if (rr < 0.5 && dy !== 3) continue;
        for (let dx = -R; dx <= R; dx++) {
          for (let dz = -R; dz <= R; dz++) {
            const d = Math.hypot(dx, dz);
            if (d > rr + 0.4) continue;
            // The dome is a shell: its middle is open under the cap.
            if (dy <= 0 && d < 1.5) continue;
            if (dy === -1 && d < R - 0.6) continue;
            put(x + dx, top + dy + 1, z + dz, B.RED_MUSHROOM_BLOCK, false);
          }
        }
      }
    } else {
      const tall = 5 + Math.floor(rand() * 3);
      for (let k = 1; k <= tall; k++) put(x, h + k, z, B.MUSHROOM_STEM, false);
      const top = h + tall;
      const R = 4;
      for (let dy = 0; dy <= 1; dy++) {
        const rr = dy === 0 ? R : R - 1;
        for (let dx = -R; dx <= R; dx++) {
          for (let dz = -R; dz <= R; dz++) {
            if (Math.hypot(dx, dz) > rr + 0.3) continue;
            put(x + dx, top + 1 + dy, z + dz, B.BROWN_MUSHROOM_BLOCK, false);
          }
        }
      }
    }
  }

  /** A spire of packed ice: a thin cone, sometimes leaning, with a base of snow. */
  private iceSpike(put: (x: number, y: number, z: number, id: number, free: boolean) => void, x: number, h: number, z: number, rand: () => number): void {
    const height = 7 + Math.floor(rand() * 20);
    const r = 1.4 + rand() * 2;
    const lean = (rand() - 0.5) * 0.5;
    const lean2 = (rand() - 0.5) * 0.5;
    for (let k = -2; k < height; k++) {
      const t = 1 - Math.max(0, k) / height;
      const rr = Math.max(0, r * t * t);
      const cx = x + lean * k * 0.5;
      const cz = z + lean2 * k * 0.5;
      const fx = cx - Math.floor(cx);
      const fz = cz - Math.floor(cz);
      const R = Math.ceil(rr + 1);
      for (let dx = -R; dx <= R; dx++) {
        for (let dz = -R; dz <= R; dz++) {
          if (Math.hypot(dx - fx, dz - fz) > rr + (k === height - 1 ? 0.4 : 0.05)) continue;
          put(Math.floor(cx) + dx, h + 1 + k, Math.floor(cz) + dz, k > height * 0.55 && rand() < 0.2 ? B.ICE : B.PACKED_ICE, false);
        }
      }
    }
  }
}
