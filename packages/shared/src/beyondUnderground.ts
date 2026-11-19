import { BEYOND_BIOMES, type BiomeFamily } from './beyondBiomes';
import type { Column } from './biomes';
import { B, BB, IS_SOLID } from './blocks';
import { CHUNK_SIZE, WORLD_HEIGHT, blockIndex } from './chunk';
import { Simplex, hash2, mulberry32 } from './noise';

/**
 * The underground of the Beyond, in layers. The overworld's carvers cut the caves; this pass gives them countries:
 *
 *  - upper caves (just under the surface, y 40..70): ordinary stone, roots and moss, now and then a chamber of a rarer kind;
 *  - deep caves (y 14..40): the big halls, where the ecosystems below are common: glowing mushroom caverns, crystal
 *    caverns, ruins of an older people, bone beds, and flooded halls (underground lakes);
 *  - the deepest rock (y < 14): crystal ore, basalt and the lava the overworld already pours;
 *  - the deep dark and the lush and dripstone caves of the overworld stay as they are.
 *
 * The rock itself changes with the country above: limestone under coasts and jungles, slate under mountains, basalt under
 * volcanoes, salt under deserts, frozen ground under the cold. Every roll is a pure function of the world position, so
 * a cave seen from two chunks is the same cave.
 */

export type CaveEco = 'none' | 'glow' | 'crystal' | 'ancient' | 'bone' | 'flooded';

export const CAVE_ECO_NAMES: Record<CaveEco, string> = {
  none: 'Caves',
  glow: 'Glowing Mushroom Cavern',
  crystal: 'Crystal Cavern',
  ancient: 'Ancient Hall',
  bone: 'Bone Beds',
  flooded: 'Flooded Cavern',
};

/** The y of the water in a flooded cavern: every hall of that kind fills to here. */
export const FLOOD_LEVEL = 36;

interface Geology {
  id: number;
  minY: number;
  maxY: number;
  count: number;
  radius: number;
  chance: number;
}

/** What the rock is made of under each family of biome. */
const GEOLOGY: Partial<Record<BiomeFamily, Geology[]>> = {
  plains: [{ id: BB.limestone, minY: 30, maxY: 80, count: 2, radius: 6, chance: 0.5 }],
  forest: [{ id: BB.limestone, minY: 30, maxY: 80, count: 1, radius: 5, chance: 0.4 }, { id: BB.mossy_stone, minY: 30, maxY: 70, count: 1, radius: 4, chance: 0.3 }],
  tropical: [{ id: BB.limestone, minY: 30, maxY: 80, count: 3, radius: 7, chance: 0.7 }, { id: BB.mossy_stone, minY: 30, maxY: 70, count: 1, radius: 4, chance: 0.4 }],
  desert: [{ id: B.SANDSTONE, minY: 40, maxY: 90, count: 3, radius: 7, chance: 0.8 }, { id: BB.salt_block, minY: 40, maxY: 80, count: 1, radius: 4, chance: 0.3 }, { id: BB.fossil_rock, minY: 30, maxY: 70, count: 1, radius: 3, chance: 0.2 }],
  mountain: [{ id: BB.slate, minY: 30, maxY: 140, count: 3, radius: 7, chance: 0.9 }, { id: BB.marble, minY: 40, maxY: 120, count: 1, radius: 6, chance: 0.25 }, { id: BB.basalt, minY: 8, maxY: 40, count: 1, radius: 5, chance: 0.3 }],
  cold: [{ id: BB.permafrost, minY: 50, maxY: 100, count: 2, radius: 5, chance: 0.7 }, { id: BB.frosted_stone, minY: 40, maxY: 100, count: 1, radius: 5, chance: 0.4 }, { id: BB.blue_ice, minY: 50, maxY: 100, count: 1, radius: 3, chance: 0.2 }],
  wetland: [{ id: BB.peat, minY: 52, maxY: 66, count: 2, radius: 4, chance: 0.5 }, { id: B.CLAY, minY: 40, maxY: 62, count: 1, radius: 4, chance: 0.5 }],
  ocean: [{ id: BB.limestone, minY: 20, maxY: 60, count: 1, radius: 5, chance: 0.4 }, { id: BB.basalt, minY: 8, maxY: 40, count: 1, radius: 5, chance: 0.3 }],
  fantasy: [{ id: BB.marble, minY: 30, maxY: 80, count: 1, radius: 5, chance: 0.4 }],
  signature: [{ id: BB.basalt, minY: 8, maxY: 80, count: 2, radius: 6, chance: 0.5 }],
};

interface OreSpec {
  id: number;
  minY: number;
  maxY: number;
  veins: number;
  size: number;
  chance: number;
  /** Families that make it more common (x3). */
  rich?: BiomeFamily[];
}

/** Minerals that exist only in the Beyond. */
const ORES: OreSpec[] = [
  { id: BB.malachite, minY: 20, maxY: 64, veins: 2, size: 5, chance: 0.5, rich: ['tropical', 'plains'] },
  { id: BB.azurite, minY: 10, maxY: 56, veins: 2, size: 5, chance: 0.4, rich: ['mountain', 'cold'] },
  { id: BB.cinnabar_ore, minY: 4, maxY: 32, veins: 2, size: 4, chance: 0.3, rich: ['signature', 'desert'] },
  { id: BB.sulfur_ore, minY: 4, maxY: 30, veins: 2, size: 4, chance: 0.3, rich: ['signature', 'wetland'] },
  { id: BB.jade, minY: 18, maxY: 62, veins: 1, size: 4, chance: 0.2, rich: ['tropical', 'forest'] },
  { id: BB.crystal_ore, minY: 4, maxY: 26, veins: 1, size: 3, chance: 0.22, rich: ['fantasy', 'mountain'] },
];

const FACES: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export interface UndergroundHost {
  readonly seed: number;
  columnAt(wx: number, wz: number): Column;
}

export class BeyondUnderground {
  private readonly nA: Simplex;
  private readonly nB: Simplex;
  private readonly nC: Simplex;

  constructor(private readonly host: UndergroundHost) {
    const s = host.seed;
    this.nA = new Simplex(s * 19 + 6101);
    this.nB = new Simplex(s * 19 + 6102);
    this.nC = new Simplex(s * 19 + 6103);
  }

  /** Which ecosystem a cave cell belongs to. Halls at depth are much likelier to hold one. */
  ecoAt(wx: number, y: number, wz: number): CaveEco {
    if (y < 6 || y > 72) return 'none';
    const a = this.nA.noise3(wx / 140, y / 70, wz / 140);
    const b = this.nB.noise3(wx / 120 + 50, y / 60, wz / 120);
    // Deep halls are claimed more often than the shallow ones.
    const gate = 0.5 - smooth(48, 14, y) * 0.22;
    if (a > gate) return b > 0 ? 'glow' : 'crystal';
    if (a < -gate) return b > 0 ? 'ancient' : 'bone';
    if (y <= FLOOD_LEVEL && this.nC.noise3(wx / 160, y / 40, wz / 160) > 0.46) return 'flooded';
    return 'none';
  }

  apply(blocks: Uint16Array, heights: Int16Array, cx: number, cz: number): void {
    this.geology(blocks, cx, cz);
    this.ores(blocks, cx, cz);
    this.ecosystems(blocks, heights, cx, cz);
  }

  private familyOf(cx: number, cz: number): BiomeFamily {
    const col = this.host.columnAt(cx * CHUNK_SIZE + 8, cz * CHUNK_SIZE + 8);
    return BEYOND_BIOMES[col.sub || 1].family;
  }

  private geology(blocks: Uint16Array, cx: number, cz: number): void {
    const list = GEOLOGY[this.familyOf(cx, cz)];
    if (!list) return;
    const rand = mulberry32(Math.imul(cx, 31337) ^ Math.imul(cz, 92821) ^ (this.host.seed + 6201));
    for (const g of list) {
      for (let n = 0; n < g.count; n++) {
        if (rand() >= g.chance) continue;
        const bx = Math.floor(rand() * CHUNK_SIZE);
        const bz = Math.floor(rand() * CHUNK_SIZE);
        const by = g.minY + Math.floor(rand() * (g.maxY - g.minY));
        const r = 2 + rand() * (g.radius - 1);
        const ry = r * (0.45 + rand() * 0.4);
        for (let y = Math.floor(by - ry); y <= Math.ceil(by + ry); y++) {
          if (y < 5 || y >= WORLD_HEIGHT) continue;
          for (let z = Math.max(0, Math.floor(bz - r)); z <= Math.min(CHUNK_SIZE - 1, Math.ceil(bz + r)); z++) {
            for (let x = Math.max(0, Math.floor(bx - r)); x <= Math.min(CHUNK_SIZE - 1, Math.ceil(bx + r)); x++) {
              const d = ((x - bx) / r) ** 2 + ((y - by) / ry) ** 2 + ((z - bz) / r) ** 2;
              if (d > 1 || rand() < 0.08) continue;
              const idx = blockIndex(x, y, z);
              if (blocks[idx] === B.STONE || blocks[idx] === B.DEEPSLATE) blocks[idx] = g.id;
            }
          }
        }
      }
    }
  }

  private ores(blocks: Uint16Array, cx: number, cz: number): void {
    const family = this.familyOf(cx, cz);
    const rand = mulberry32(Math.imul(cx, 70001) ^ Math.imul(cz, 12011) ^ (this.host.seed + 6301));
    for (const ore of ORES) {
      const k = ore.rich?.includes(family) ? 3 : 1;
      for (let v = 0; v < ore.veins; v++) {
        if (rand() >= Math.min(0.95, ore.chance * k)) continue;
        let x = Math.floor(rand() * CHUNK_SIZE);
        let z = Math.floor(rand() * CHUNK_SIZE);
        let y = ore.minY + Math.floor(rand() * (ore.maxY - ore.minY));
        const size = Math.max(2, Math.floor(ore.size * (0.5 + rand())));
        for (let i = 0; i < size; i++) {
          const idx = blockIndex(x, y, z);
          if (blocks[idx] === B.STONE || blocks[idx] === B.DEEPSLATE || blocks[idx] === BB.limestone || blocks[idx] === BB.slate || blocks[idx] === BB.basalt) blocks[idx] = ore.id;
          const axis = Math.floor(rand() * 3);
          const dir = rand() < 0.5 ? -1 : 1;
          if (axis === 0) x = Math.min(CHUNK_SIZE - 1, Math.max(0, x + dir));
          else if (axis === 1) y = Math.min(WORLD_HEIGHT - 1, Math.max(1, y + dir));
          else z = Math.min(CHUNK_SIZE - 1, Math.max(0, z + dir));
        }
      }
    }
  }

  /** Dress every cave floor, ceiling and hall by its ecosystem. */
  private ecosystems(blocks: Uint16Array, heights: Int16Array, cx: number, cz: number): void {
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    const seed = this.host.seed;
    const PAD = CHUNK_SIZE + 2;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx;
        const wz = oz + lz;
        const top = Math.min(72, heights[(lz + 1) * PAD + lx + 1] - 4);
        for (let y = 6; y <= top; y++) {
          const here = blocks[blockIndex(lx, y, lz)];
          if (here !== B.AIR) continue;
          const below = blocks[blockIndex(lx, y - 1, lz)];
          const above = y + 1 < WORLD_HEIGHT ? blocks[blockIndex(lx, y + 1, lz)] : B.STONE;
          const floor = IS_SOLID[below] === 1 && below !== B.BEDROCK;
          const ceil = IS_SOLID[above] === 1 && above !== B.BEDROCK && above !== B.WATER;
          if (!floor && !ceil) continue;
          const eco = this.ecoAt(wx, y, wz);
          if (eco === 'none') continue;
          const r = hash2(seed + 6401 + y, wx, wz);
          const idxF = blockIndex(lx, y - 1, lz);
          switch (eco) {
            case 'glow':
              if (floor) {
                if (r < 0.5 && (below === B.STONE || below === B.DEEPSLATE || below === B.DIRT || below === BB.limestone)) blocks[idxF] = r < 0.2 ? BB.luminous_moss : B.MOSS_BLOCK;
                if (r < 0.1) blocks[blockIndex(lx, y, lz)] = BB.glowshroom;
                else if (r < 0.16) blocks[blockIndex(lx, y, lz)] = BB.luminous_fern;
                else if (r > 0.992 && y + 5 < WORLD_HEIGHT) {
                  // A small glowing mushroom tree.
                  const h = 3 + Math.floor((r - 0.992) * 600);
                  for (let k = 0; k < h; k++) if (blocks[blockIndex(lx, y + k, lz)] === B.AIR) blocks[blockIndex(lx, y + k, lz)] = BB.glowshroom_stem;
                  if (blocks[blockIndex(lx, y + h, lz)] === B.AIR) blocks[blockIndex(lx, y + h, lz)] = BB.glowshroom_cap;
                  for (const [dx, dz] of FACES) {
                    const nx = lx + dx;
                    const nz = lz + dz;
                    if (nx >= 0 && nx < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE && blocks[blockIndex(nx, y + h - 1, nz)] === B.AIR) blocks[blockIndex(nx, y + h - 1, nz)] = BB.glowshroom_cap;
                  }
                }
              }
              if (ceil && r > 0.9) blocks[blockIndex(lx, y, lz)] = r > 0.96 ? B.SPORE_BLOSSOM : B.GLOW_LICHEN;
              break;
            case 'crystal':
              if (floor) {
                if (r < 0.04) blocks[blockIndex(lx, y, lz)] = BB.azure_cluster;
                else if (r < 0.07) blocks[blockIndex(lx, y, lz)] = BB.rose_cluster;
                else if (r < 0.085) {
                  const mat = hash2(seed + 6501, wx >> 4, wz >> 4) < 0.5 ? BB.azure_crystal : BB.rose_crystal;
                  const h = 1 + Math.floor((r - 0.07) * 200);
                  for (let k = 0; k < h; k++) if (blocks[blockIndex(lx, y + k, lz)] === B.AIR) blocks[blockIndex(lx, y + k, lz)] = mat;
                }
                if (r > 0.93 && (below === B.STONE || below === B.DEEPSLATE)) blocks[idxF] = r > 0.97 ? B.CALCITE : BB.marble;
              }
              if (ceil && r > 0.93) {
                const len = 1 + Math.floor((r - 0.93) * 40);
                const mat = hash2(seed + 6502, wx >> 4, wz >> 4) < 0.5 ? BB.verdant_crystal : BB.amber_crystal;
                for (let k = 0; k < len; k++) if (blocks[blockIndex(lx, y - k, lz)] === B.AIR) blocks[blockIndex(lx, y - k, lz)] = mat;
              }
              break;
            case 'ancient':
              if (floor && (below === B.STONE || below === B.DEEPSLATE || below === BB.limestone || below === B.DIRT)) {
                const tile = ((wx >> 1) + (wz >> 1)) & 1;
                blocks[idxF] = r < 0.12 ? BB.cracked_ancient_bricks : r < 0.3 ? BB.mossy_ancient_bricks : tile ? BB.ancient_bricks : BB.carved_ancient_stone;
              }
              // Pillars from floor to ceiling on a loose grid, where the hall is not too tall.
              if (floor && wx % 6 === 0 && wz % 6 === 0 && hash2(seed + 6601, wx, wz) < 0.7) {
                let h = 0;
                while (y + h < WORLD_HEIGHT - 1 && h < 9 && blocks[blockIndex(lx, y + h, lz)] === B.AIR) h++;
                if (h < 9) for (let k = 0; k < h; k++) blocks[blockIndex(lx, y + k, lz)] = k === 0 || k === h - 1 ? BB.carved_ancient_stone : BB.ancient_bricks;
              }
              if (floor && r > 0.985) blocks[blockIndex(lx, y, lz)] = B.TORCH;
              if (ceil && r > 0.9) blocks[blockIndex(lx, y, lz)] = BB.vines;
              break;
            case 'bone':
              if (floor) {
                if (r < 0.25 && (below === B.STONE || below === B.DEEPSLATE)) blocks[idxF] = r < 0.08 ? BB.bone_block : BB.fossil_rock;
                if (r > 0.97) {
                  const h = 1 + Math.floor((r - 0.97) * 100);
                  for (let k = 0; k < h; k++) if (blocks[blockIndex(lx, y + k, lz)] === B.AIR) blocks[blockIndex(lx, y + k, lz)] = BB.bone_block;
                }
              }
              if (ceil && r > 0.95) blocks[blockIndex(lx, y, lz)] = B.COBWEB;
              break;
            case 'flooded':
              if (y <= FLOOD_LEVEL) {
                blocks[blockIndex(lx, y, lz)] = B.WATER;
                if (floor && r < 0.2) blocks[idxF] = r < 0.1 ? B.CLAY : B.GRAVEL;
                if (floor && r > 0.9 && y + 1 <= FLOOD_LEVEL) blocks[blockIndex(lx, y, lz)] = BB.seagrass;
              }
              break;
            default:
          }
        }
      }
    }
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
