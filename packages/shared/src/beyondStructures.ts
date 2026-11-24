import { BEYOND_BIOMES, type BiomeRarity, type StructureKey } from './beyondBiomes';
import type { Column } from './biomes';
import { B, BB, BLOCKS, IS_LEAVES, IS_LIQUID, IS_LOG, IS_SOLID } from './blocks';
import { CHUNK_SIZE, SEA_LEVEL, WORLD_HEIGHT, blockIndex } from './chunk';
import type { LootTableName } from './loot';
import { hash2, mulberry32 } from './noise';
import { cellKey, keepRooted } from './support';

/**
 * The places of the Beyond: camps, standing stones, villages, crypts, temples, fortresses, libraries, statues, wrecks, reefs
 * and the bones of dragons. They are laid on a grid per rarity (a cell is much larger for the rarer kinds), each cell holding
 * at most one; what a cell holds depends on the biome at the spot it picks, so a desert temple is only ever in a desert.
 * Everything about a place is a pure function of the seed and its cell, and a place is drawn by every chunk it touches,
 * so a ruin that crosses a chunk border comes out whole whichever chunk is made first.
 */

export type Archetype =
  | 'stones' | 'monolith' | 'shrine' | 'tower' | 'lighthouse' | 'camp' | 'hut' | 'village' | 'crypt' | 'graves' | 'temple' | 'fortress' | 'library'
  | 'monastery' | 'battlefield' | 'bridge' | 'harbor' | 'skeleton' | 'wreck' | 'treasure' | 'reef' | 'sunken' | 'statue' | 'cairn' | 'nest';

interface Palette {
  wall: number;
  wall2: number;
  floor: number;
  trim: number;
  roof: number;
  light: number;
  accent: number;
}

const STONE: Palette = { wall: B.STONE_BRICKS, wall2: B.MOSSY_COBBLE, floor: B.COBBLE, trim: BB.limestone, roof: BB.slate, light: B.LANTERN, accent: BB.carved_ancient_stone };
const ANCIENT: Palette = { wall: BB.ancient_bricks, wall2: BB.mossy_ancient_bricks, floor: BB.carved_ancient_stone, trim: BB.limestone, roof: BB.ancient_bricks, light: B.LANTERN, accent: BB.carved_ancient_stone };
const MARBLE: Palette = { wall: BB.marble_bricks, wall2: BB.marble, floor: BB.polished_marble, trim: BB.polished_marble, roof: BB.marble, light: B.LANTERN, accent: BB.azure_crystal };
const WOOD: Palette = { wall: B.PLANKS, wall2: B.LOG, floor: B.PLANKS, trim: B.LOG, roof: BB.redwood_planks, light: B.TORCH, accent: B.BOOKSHELF };
const SAND: Palette = { wall: B.SANDSTONE, wall2: B.CHISELED_SANDSTONE, floor: B.SANDSTONE, trim: B.CHISELED_SANDSTONE, roof: B.SANDSTONE, light: B.LANTERN, accent: BB.azure_crystal };
const JUNGLE: Palette = { wall: BB.mossy_ancient_bricks, wall2: BB.ancient_bricks, floor: BB.carved_ancient_stone, trim: BB.carved_ancient_stone, roof: BB.mossy_ancient_bricks, light: B.TORCH, accent: BB.jade };
const OBSIDIAN: Palette = { wall: BB.obsidian_bricks, wall2: BB.basalt, floor: BB.volcanic_rock, trim: BB.weathered_obsidian, roof: BB.basalt, light: B.GLOWSTONE, accent: BB.cinnabar_ore };
const FROST: Palette = { wall: BB.frosted_stone, wall2: B.PACKED_ICE, floor: BB.frosted_stone, trim: BB.blue_ice, roof: B.PACKED_ICE, light: B.LANTERN, accent: BB.blue_ice };
const SKY: Palette = { wall: BB.skystone, wall2: BB.marble, floor: BB.polished_marble, trim: BB.marble_bricks, roof: BB.skystone, light: B.LANTERN, accent: BB.azure_crystal };
const CRYSTAL: Palette = { wall: BB.marble, wall2: BB.polished_marble, floor: BB.polished_marble, trim: BB.amber_crystal, roof: BB.rose_crystal, light: B.GLOWSTONE, accent: BB.azure_crystal };
const SEAWORN: Palette = { wall: BB.limestone, wall2: BB.mossy_stone, floor: BB.marble, trim: BB.marble_bricks, roof: BB.limestone, light: B.GLOWSTONE, accent: BB.coral_block_pink };
const BONE: Palette = { wall: BB.bone_block, wall2: BB.fossil_rock, floor: BB.white_sand, trim: BB.bone_block, roof: BB.bone_block, light: B.TORCH, accent: BB.fossil_rock };

export interface StructureInfo {
  key: StructureKey;
  name: string;
  /** How scarce it is: which grid it is laid on. */
  rarity: BiomeRarity;
  arche: Archetype;
  palette: Palette;
  /** Where it stands: on dry land, on the sea floor, or on a shore (land with the sea near). */
  site: 'land' | 'sea' | 'shore';
  /** Loot of its chests. */
  loot: LootTableName;
  /** Half the side of the ground it covers. */
  radius: number;
  /** How ruined it is (0 whole .. 0.5 rubble). */
  decay: number;
}

const I = (key: StructureKey, name: string, rarity: BiomeRarity, arche: Archetype, palette: Palette, site: StructureInfo['site'], loot: LootTableName, radius: number, decay = 0.2): StructureInfo => ({
  key, name, rarity, arche, palette, site, loot, radius, decay,
});

export const STRUCTURES: Record<StructureKey, StructureInfo> = {
  standing_stones: I('standing_stones', 'Standing Stones', 'common', 'stones', ANCIENT, 'land', 'ruin', 14, 0.1),
  hunters_camp: I('hunters_camp', "Hunter's Camp", 'common', 'camp', WOOD, 'land', 'ruin', 8, 0.05),
  ruined_watchtower: I('ruined_watchtower', 'Ruined Watchtower', 'common', 'tower', STONE, 'land', 'ruin', 8, 0.3),
  shrine: I('shrine', 'Wayside Shrine', 'common', 'shrine', ANCIENT, 'land', 'ruin', 8, 0.15),
  shipwreck: I('shipwreck', 'Shipwreck', 'common', 'wreck', WOOD, 'sea', 'ruin', 12, 0.3),
  ice_cairn: I('ice_cairn', 'Ice Cairn', 'common', 'cairn', FROST, 'land', 'ruin', 6, 0.05),
  witch_hut: I('witch_hut', "Witch's Hut", 'uncommon', 'hut', WOOD, 'land', 'ruin', 8, 0.1),
  abandoned_village: I('abandoned_village', 'Abandoned Village', 'uncommon', 'village', STONE, 'land', 'ruin', 26, 0.38),
  crypt: I('crypt', 'Crypt', 'uncommon', 'crypt', ANCIENT, 'land', 'ruin', 10, 0.1),
  burial_ground: I('burial_ground', 'Burial Ground', 'uncommon', 'graves', ANCIENT, 'land', 'ruin', 18, 0.2),
  fishing_village: I('fishing_village', 'Fishing Village', 'uncommon', 'village', WOOD, 'shore', 'ruin', 26, 0.08),
  lighthouse: I('lighthouse', 'Lighthouse', 'uncommon', 'lighthouse', MARBLE, 'shore', 'ruin', 7, 0.1),
  oasis_camp: I('oasis_camp', 'Oasis Camp', 'uncommon', 'camp', SAND, 'land', 'ruin', 9, 0.05),
  coral_reef: I('coral_reef', 'Great Reef', 'uncommon', 'reef', SEAWORN, 'sea', 'ruin', 16, 0),
  bridge: I('bridge', 'Old Bridge', 'uncommon', 'bridge', STONE, 'land', 'ruin', 20, 0.15),
  harbor: I('harbor', 'Harbour', 'uncommon', 'harbor', WOOD, 'shore', 'ruin', 16, 0.1),
  buried_treasure: I('buried_treasure', 'Buried Treasure', 'uncommon', 'treasure', STONE, 'shore', 'relic', 3, 0),
  nest: I('nest', 'Giant Nest', 'uncommon', 'nest', WOOD, 'land', 'ruin', 8, 0),
  fossil: I('fossil', 'Fossil Bed', 'uncommon', 'skeleton', BONE, 'land', 'ruin', 14, 0.1),
  battlefield: I('battlefield', 'Old Battlefield', 'uncommon', 'battlefield', STONE, 'land', 'ruin', 22, 0.4),
  ruined_monastery: I('ruined_monastery', 'Ruined Monastery', 'rare', 'monastery', STONE, 'land', 'ruin', 18, 0.28),
  jungle_temple: I('jungle_temple', 'Jungle Temple', 'rare', 'temple', JUNGLE, 'land', 'relic', 12, 0.15),
  desert_temple: I('desert_temple', 'Desert Temple', 'rare', 'temple', SAND, 'land', 'relic', 12, 0.1),
  mountain_hold: I('mountain_hold', 'Mountain Hold', 'rare', 'fortress', STONE, 'land', 'relic', 16, 0.2),
  ruined_fortress: I('ruined_fortress', 'Ruined Fortress', 'rare', 'fortress', ANCIENT, 'land', 'relic', 16, 0.32),
  tree_village: I('tree_village', 'Tree Village', 'rare', 'village', WOOD, 'land', 'ruin', 24, 0.1),
  sunken_ruins: I('sunken_ruins', 'Sunken Ruins', 'rare', 'sunken', SEAWORN, 'sea', 'relic', 14, 0.3),
  monolith: I('monolith', 'Monolith', 'rare', 'monolith', ANCIENT, 'land', 'relic', 6, 0.02),
  ancient_library: I('ancient_library', 'Ancient Library', 'very_rare', 'library', MARBLE, 'land', 'relic', 14, 0.25),
  sky_temple: I('sky_temple', 'Sky Temple', 'very_rare', 'temple', SKY, 'land', 'relic', 12, 0.08),
  volcanic_fortress: I('volcanic_fortress', 'Volcanic Fortress', 'very_rare', 'fortress', OBSIDIAN, 'land', 'relic', 16, 0.15),
  sunken_temple: I('sunken_temple', 'Sunken Temple', 'very_rare', 'temple', SEAWORN, 'sea', 'relic', 12, 0.12),
  crystal_sanctuary: I('crystal_sanctuary', 'Crystal Sanctuary', 'very_rare', 'temple', CRYSTAL, 'land', 'relic', 12, 0.05),
  dragon_skeleton: I('dragon_skeleton', 'Dragon Skeleton', 'very_rare', 'skeleton', BONE, 'land', 'relic', 28, 0.05),
  giant_statue: I('giant_statue', 'Giant Statue', 'very_rare', 'statue', MARBLE, 'sea', 'relic', 12, 0.18),
};

/** Grid cell size per rarity of structure, in blocks. */
export const STRUCTURE_CELL: Record<BiomeRarity, number> = { common: 120, uncommon: 220, rare: 420, very_rare: 760, legendary: 1500 };
/** Share of cells that hold a structure at all. */
const CELL_CHANCE: Record<BiomeRarity, number> = { common: 0.55, uncommon: 0.5, rare: 0.45, very_rare: 0.4, legendary: 0.4 };
/** Places that must stay scattered even though their grid is dense. */
const SHARE: Partial<Record<StructureKey, number>> = { shipwreck: 0.12, ice_cairn: 0.5, hunters_camp: 0.6 };
const RARITIES: readonly BiomeRarity[] = ['common', 'uncommon', 'rare', 'very_rare'];

export interface StructurePlace {
  key: StructureKey;
  info: StructureInfo;
  /** Centre, and y of the ground (or of the sea floor). */
  x: number;
  z: number;
  y: number;
  rot: number;
  seed: number;
  /** Chests, by position, with their tables. */
  chests: Map<string, LootTableName>;
  /** Whether chests is complete (the loot lookup draws the whole place once into a scratch buffer). */
  registered: boolean;
  /** Cells of blocks that would hang in the air (found by drawing the whole place once); null until then. */
  floating: Set<number> | null;
  /** Blocks added under what would stop short of the ground: [x, y, z, id, ...] (known with `floating`). */
  extra: number[];
  /** How many blocks the whole place is made of (known with loating). */
  drawn: number;
}

export interface StructureHost {
  readonly seed: number;
  columnAt(wx: number, wz: number): Column;
  nearestVillage(x: number, z: number): { x: number; z: number } | null;
  /** The ground the castles take (a centre and a half side) near a point. */
  castlesNear?(x: number, z: number, reach: number): readonly { x: number; z: number; r: number }[];
}

const posKey = (x: number, y: number, z: number): string => `${x},${y},${z}`;

/** A drawing surface for one chunk, in the local frame of one place (u right, v forward, y up from the ground). */
class Site {
  readonly chests: Map<string, LootTableName>;
  constructor(
    private readonly blocks: Uint16Array,
    private readonly ox: number,
    private readonly oz: number,
    private readonly place: StructurePlace,
    private readonly host: StructureHost,
    private readonly decay: number,
    private readonly pal: Palette,
    /** Blocks of the place that would hang in the air: they are left out. */
    private readonly skip: ReadonlySet<number> | null = null,
    /** When set, level notes the top of the ground it leaves in each column (the drawing is being studied, not made). */
    private readonly leveled: Map<number, number> | null = null,
  ) {
    this.chests = place.chests;
  }

  /** Ground y of the place. */
  get g(): number {
    return this.place.y;
  }

  wx(u: number, v: number): number {
    switch (this.place.rot) {
      case 0: return this.place.x + u;
      case 1: return this.place.x - v;
      case 2: return this.place.x - u;
      default: return this.place.x + v;
    }
  }

  wz(u: number, v: number): number {
    switch (this.place.rot) {
      case 0: return this.place.z + v;
      case 1: return this.place.z + u;
      case 2: return this.place.z - v;
      default: return this.place.z - u;
    }
  }

  private raw(wx: number, y: number, wz: number, id: number): void {
    const lx = wx - this.ox;
    const lz = wz - this.oz;
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < 1 || y >= WORLD_HEIGHT) return;
    if (this.skip !== null && id !== B.AIR && id !== B.WATER && this.skip.has(cellKey(wx, y, wz))) return;
    this.blocks[blockIndex(lx, y, lz)] = id;
  }

  /** One block; `ruin` lets decay eat it. */
  put(u: number, y: number, v: number, id: number, ruin = true): void {
    const wx = this.wx(u, v);
    const wz = this.wz(u, v);
    if (ruin && this.decay > 0 && y >= 2 && hash2(this.place.seed + 31, wx * 131 + y, wz) < this.decay * (0.25 + Math.min(1.5, y / 9))) return;
    this.raw(wx, this.g + y, wz, id);
  }

  /** The chunk's share of an axis-aligned box in the place's frame. */
  box(u0: number, y0: number, v0: number, u1: number, y1: number, v1: number, id: number, ruin = true): void {
    const xa = this.wx(u0, v0);
    const xb = this.wx(u1, v1);
    const za = this.wz(u0, v0);
    const zb = this.wz(u1, v1);
    const x0 = Math.max(Math.min(xa, xb), this.ox);
    const x1 = Math.min(Math.max(xa, xb), this.ox + CHUNK_SIZE - 1);
    const z0 = Math.max(Math.min(za, zb), this.oz);
    const z1 = Math.min(Math.max(za, zb), this.oz + CHUNK_SIZE - 1);
    if (x0 > x1 || z0 > z1) return;
    const ya = Math.min(y0, y1);
    const yb = Math.max(y0, y1);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        for (let y = ya; y <= yb; y++) {
          if (ruin && this.decay > 0 && y >= 2 && hash2(this.place.seed + 31, x * 131 + y, z) < this.decay * (0.25 + Math.min(1.5, y / 9))) continue;
          this.raw(x, this.g + y, z, id);
        }
      }
    }
  }

  /** Walls and floor (and optionally a roof) of a room: hollow inside. */
  room(u0: number, v0: number, u1: number, v1: number, h: number, wall: number, floor: number, roof: number | null = null, y0 = 0): void {
    this.box(u0, y0, v0, u1, y0, v1, floor, false);
    this.box(u0, y0 + 1, v0, u1, y0 + h, v1, wall);
    this.box(u0 + 1, y0 + 1, v0 + 1, u1 - 1, y0 + h, v1 - 1, B.AIR, false);
    if (roof !== null) this.box(u0, y0 + h + 1, v0, u1, y0 + h + 1, v1, roof);
  }

  /** Fill from the ground down to the terrain under a rectangle, and clear a volume over it. */
  level(u0: number, v0: number, u1: number, v1: number, fill: number, clearTo = 26, clearFrom = 0): void {
    const xa = this.wx(u0, v0);
    const xb = this.wx(u1, v1);
    const za = this.wz(u0, v0);
    const zb = this.wz(u1, v1);
    const x0 = Math.max(Math.min(xa, xb), this.ox);
    const x1 = Math.min(Math.max(xa, xb), this.ox + CHUNK_SIZE - 1);
    const z0 = Math.max(Math.min(za, zb), this.oz);
    const z1 = Math.min(Math.max(za, zb), this.oz + CHUNK_SIZE - 1);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const h = this.host.columnAt(x, z).height;
        this.leveled?.set(x * 65536 + z, this.g + clearFrom - 1);
        for (let y = h; y < this.g + clearFrom; y++) this.raw(x, y, z, y >= this.g - 1 ? fill : B.STONE);
        for (let y = this.g + clearFrom; y <= this.g + clearTo; y++) {
          if (y <= SEA_LEVEL && y > h && this.place.info.site === 'sea') continue;
          this.raw(x, y, z, y <= SEA_LEVEL && this.g < SEA_LEVEL ? B.WATER : B.AIR);
        }
        // A tall plant, a trunk or a crown that reaches over the cleared volume is cleared as well: no top is left hanging.
        const lx = x - this.ox;
        const lz = z - this.oz;
        for (let y = this.g + clearTo + 1; y < WORLD_HEIGHT && this.leveled === null; y++) {
          const id = this.blocks[blockIndex(lx, y, lz)];
          if (id === B.AIR || IS_LIQUID[id] || (IS_SOLID[id] && !IS_LEAVES[id] && !IS_LOG[id])) break;
          this.blocks[blockIndex(lx, y, lz)] = B.AIR;
        }
      }
    }
  }

  /** A filled cylinder (or an ellipse) of one block. */
  disc(u: number, y: number, v: number, r: number, id: number, ruin = true): void {
    const R = Math.ceil(r);
    for (let du = -R; du <= R; du++) for (let dv = -R; dv <= R; dv++) if (du * du + dv * dv <= r * r + 0.3) this.put(u + du, y, v + dv, id, ruin);
  }

  chest(u: number, y: number, v: number, table?: LootTableName): void {
    const wx = this.wx(u, v);
    const wz = this.wz(u, v);
    if (wx < this.ox || wx >= this.ox + CHUNK_SIZE || wz < this.oz || wz >= this.oz + CHUNK_SIZE) return;
    this.raw(wx, this.g + y, wz, B.CHEST);
    this.chests.set(posKey(wx, this.g + y, wz), table ?? this.place.info.loot);
  }

  /** The chests of a place are known without drawing it (the loot lookup asks); this registers one without a chunk. */
  registerChest(u: number, y: number, v: number, table?: LootTableName): void {
    this.chests.set(posKey(this.wx(u, v), this.g + y, this.wz(u, v)), table ?? this.place.info.loot);
  }

  /** Does the terrain at a place's local point stand above or below the place's ground? */
  heightAt(u: number, v: number): number {
    return this.host.columnAt(this.wx(u, v), this.wz(u, v)).height;
  }

  get p(): Palette {
    return this.pal;
  }

  get seed(): number {
    return this.place.seed;
  }
}

type Rand = () => number;

// ---- archetype builders ------------------------------------------------------------------------------------------

function buildStones(s: Site, rand: Rand): void {
  const r = 7 + Math.floor(rand() * 3);
  const n = 8 + Math.floor(rand() * 4);
  s.level(-r - 2, -r - 2, r + 2, r + 2, B.GRASS, 12);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const u = Math.round(Math.cos(a) * r);
    const v = Math.round(Math.sin(a) * r);
    const h = 3 + Math.floor(rand() * 4);
    const id = rand() < 0.4 ? s.p.wall2 : s.p.wall;
    s.box(u, 1, v, u, h, v, id);
    if (rand() < 0.5) s.box(u + 1, 1, v, u + 1, h - 1, v, id);
    if (i % 3 === 0 && rand() < 0.7) s.box(u, h + 1, v, u, h + 1, v, id);
  }
  s.box(-1, 0, -1, 1, 0, 1, s.p.floor, false);
  s.box(-1, 1, -1, 1, 1, 1, s.p.accent, false);
  s.put(0, 2, 0, s.p.light, false);
  if (rand() < 0.5) s.chest(0, 1, 0);
}

function buildMonolith(s: Site, rand: Rand): void {
  s.level(-5, -5, 5, 5, B.GRASS, 30);
  s.box(-3, 0, -3, 3, 0, 3, s.p.floor, false);
  s.box(-2, 1, -2, 2, 1, 2, s.p.trim, false);
  const h = 15 + Math.floor(rand() * 6);
  for (let y = 2; y <= h; y++) {
    const w = y > h - 3 ? 0 : 1;
    s.box(-w, y, -w, w, y, w, y % 4 === 0 ? s.p.accent : y > h - 5 ? BB.weathered_obsidian : s.p.wall, false);
  }
  s.put(0, h + 1, 0, BB.stormstone, false);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    s.box(Math.round(Math.cos(a) * 5), 1, Math.round(Math.sin(a) * 5), Math.round(Math.cos(a) * 5), 2 + (i % 2), Math.round(Math.sin(a) * 5), s.p.wall2);
  }
  s.chest(0, 2, 2, 'relic');
}

function buildShrine(s: Site, rand: Rand): void {
  s.level(-5, -5, 5, 5, B.GRASS, 12);
  s.box(-4, 0, -4, 4, 0, 4, s.p.floor, false);
  s.box(-3, 1, -3, 3, 1, 3, s.p.trim, false);
  for (const [u, v] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) s.box(u, 2, v, u, 5, v, s.p.wall);
  s.box(-3, 6, -3, 3, 6, 3, s.p.roof);
  s.box(-2, 6, -2, 2, 6, 2, s.p.trim);
  s.box(-1, 2, -1, 1, 2, 1, s.p.accent, false);
  s.put(0, 3, 0, rand() < 0.5 ? BB.moonpetal : BB.glow_bloom, false);
  s.put(0, 5, 0, s.p.light, false);
  if (rand() < 0.6) s.chest(2, 2, 2);
}

function buildTower(s: Site, rand: Rand): void {
  const w = 3;
  const h = 11 + Math.floor(rand() * 5);
  s.level(-w - 2, -w - 2, w + 2, w + 2, B.COBBLE, h + 6);
  s.box(-w, 0, -w, w, 0, w, s.p.floor, false);
  s.box(-w, 1, -w, w, h, w, s.p.wall);
  s.box(-w + 1, 1, -w + 1, w - 1, h, w - 1, B.AIR, false);
  // Arrow slits and a doorway.
  for (let y = 3; y <= h - 1; y += 3) for (const [u, v] of [[0, -w], [0, w], [-w, 0], [w, 0]]) s.put(u, y, v, B.AIR, false);
  s.box(0, 1, -w, 0, 2, -w, B.AIR, false);
  // Crenellations.
  for (let u = -w; u <= w; u += 2) for (const v of [-w, w]) s.put(u, h + 1, v, s.p.wall);
  for (let v = -w; v <= w; v += 2) for (const u of [-w, w]) s.put(u, h + 1, v, s.p.wall);
  // A stair of single blocks round the inside wall.
  const ring: [number, number][] = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
  for (let y = 1; y <= h - 1; y++) {
    const [u, v] = ring[(y - 1) % 8];
    s.box(u, y, v, u, y, v, s.p.floor, false);
  }
  s.box(-1, h - 1, -1, 1, h - 1, 1, s.p.floor, false);
  s.put(0, h, 0, s.p.light, false);
  s.chest(1, h, 1);
}

function buildLighthouse(s: Site, rand: Rand): void {
  const h = 22 + Math.floor(rand() * 6);
  s.level(-6, -6, 6, 6, BB.limestone, h + 8);
  s.box(-5, 0, -5, 5, 1, 5, BB.limestone, false);
  for (let y = 2; y <= h; y++) {
    const r = Math.max(2, 4 - Math.floor(y / 9));
    const stripe = Math.floor(y / 3) % 2 === 0;
    for (let u = -r; u <= r; u++) {
      for (let v = -r; v <= r; v++) {
        const d = u * u + v * v;
        if (d > r * r + 1) continue;
        const wall = d >= (r - 1) * (r - 1);
        s.put(u, y, v, wall ? (stripe ? BB.marble : BB.coral_block_red) : B.AIR, false);
      }
    }
  }
  s.box(-1, 1, -1, 1, 1, 1, s.p.floor, false);
  s.box(0, 2, -4, 0, 3, -3, B.AIR, false);
  const r = 3;
  for (let u = -r; u <= r; u++) for (let v = -r; v <= r; v++) {
    const d = u * u + v * v;
    if (d > r * r + 1) continue;
    s.put(u, h + 1, v, BB.limestone, false);
    if (d >= (r - 1) * (r - 1)) { s.put(u, h + 2, v, B.GLASS, false); s.put(u, h + 3, v, B.GLASS, false); }
  }
  s.box(-1, h + 2, -1, 1, h + 3, 1, B.GLOWSTONE, false);
  s.box(-r, h + 4, -r, r, h + 4, r, BB.slate, false);
  s.put(0, h + 5, 0, BB.slate, false);
  s.chest(2, 2, 2);
}

function buildCamp(s: Site, rand: Rand): void {
  s.level(-6, -6, 6, 6, B.GRASS, 8);
  // A lean-to of planks against a log frame, with the fire before it.
  for (let u = -2; u <= 2; u++) {
    s.box(u, 1, 2, u, 1, 2, s.p.trim, false);
    s.box(u, 2, 1, u, 2, 2, s.p.wall, false);
    s.box(u, 3, 0, u, 3, 1, s.p.wall, false);
    s.box(u, 4, -1, u, 4, 0, s.p.wall, false);
  }
  s.box(-2, 1, 3, -2, 3, 3, s.p.trim, false);
  s.box(2, 1, 3, 2, 3, 3, s.p.trim, false);
  s.box(-1, 1, 0, 1, 1, 1, B.AIR, false);
  s.chest(-1, 1, 1);
  for (const [u, v] of [[-1, -3], [0, -4], [1, -3], [-2, -4], [2, -4]]) s.put(u, 0, v, B.COBBLE, false);
  s.put(0, 0, -3, B.GLOWSTONE, false);
  s.put(0, 1, -3, B.LANTERN, false);
  s.box(-3, 1, -3, -3, 1, -3, B.LOG, false);
  s.box(3, 1, -3, 3, 1, -3, B.LOG, false);
  void rand;
}

function buildHut(s: Site, rand: Rand): void {
  s.level(-5, -5, 5, 5, B.GRASS, 10);
  for (const [u, v] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) s.box(u, 0, v, u, 3, v, s.p.trim, false);
  s.room(-3, -3, 3, 3, 3, s.p.wall, s.p.floor, null, 3);
  for (let i = 0; i <= 2; i++) s.box(-3 + i, 7 + i, -3 + i, 3 - i, 7 + i, 3 - i, s.p.roof);
  s.box(0, 4, -3, 0, 5, -3, B.AIR, false);
  s.box(-3, 5, 0, -3, 5, 0, B.GLASS, false);
  s.put(0, 4, -4, B.AIR, false);
  s.chest(2, 4, 2);
  s.box(-2, 4, 2, -2, 5, 2, B.BOOKSHELF, false);
  s.put(2, 5, -2, B.LANTERN, false);
  void rand;
}

function cottage(s: Site, u: number, v: number, w: number, d: number, h: number, rand: Rand, stilts = 0): void {
  s.level(u - 1, v - 1, u + w + 1, v + d + 1, B.GRASS, h + 8, stilts);
  if (stilts > 0) for (const [pu, pv] of [[u, v], [u + w, v], [u, v + d], [u + w, v + d]]) s.box(pu, 0, pv, pu, stilts - 1, pv, s.p.trim, false);
  s.room(u, v, u + w, v + d, h, s.p.wall, s.p.floor, null, stilts);
  s.box(u, stilts + 1, v, u, stilts + h, v, s.p.trim);
  s.box(u + w, stilts + 1, v, u + w, stilts + h, v, s.p.trim);
  s.box(u, stilts + 1, v + d, u, stilts + h, v + d, s.p.trim);
  s.box(u + w, stilts + 1, v + d, u + w, stilts + h, v + d, s.p.trim);
  // A gabled roof along the long side.
  const half = Math.ceil((d + 1) / 2);
  for (let i = 0; i < half; i++) s.box(u - 1, stilts + h + 1 + i, v + i - 1, u + w + 1, stilts + h + 1 + i, v + i - 1, s.p.roof);
  for (let i = 0; i < half; i++) s.box(u - 1, stilts + h + 1 + i, v + d - i + 1, u + w + 1, stilts + h + 1 + i, v + d - i + 1, s.p.roof);
  const mid = Math.floor(w / 2);
  s.box(u + mid, stilts + 1, v, u + mid, stilts + 2, v, B.AIR, false);
  s.box(u + 1, stilts + 2, v + d, u + 1, stilts + 2, v + d, B.GLASS, false);
  s.box(u + w - 1, stilts + 2, v + d, u + w - 1, stilts + 2, v + d, B.GLASS, false);
  s.chest(u + w - 1, stilts + 1, v + d - 1);
  void rand;
}

function buildVillage(s: Site, rand: Rand, info: StructureInfo): void {
  const n = 4 + Math.floor(rand() * 3);
  const stilts = info.key === 'tree_village' ? 6 : 0;
  const pier = info.key === 'fishing_village';
  s.level(-3, -3, 3, 3, B.GRASS, 6);
  // A well-like square in the middle.
  s.box(-1, 0, -1, 1, 0, 1, s.p.floor, false);
  s.box(-1, 1, -1, 1, 1, 1, s.p.trim, false);
  s.box(0, 1, 0, 0, 1, 0, B.WATER, false);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.4;
    const dist = 11 + Math.floor(rand() * 7);
    const u = Math.round(Math.cos(a) * dist) - 3;
    const v = Math.round(Math.sin(a) * dist) - 2;
    cottage(s, u, v, 5 + Math.floor(rand() * 3), 4 + Math.floor(rand() * 2), 3 + (rand() < 0.3 ? 1 : 0), rand, stilts);
    if (stilts > 0) {
      // A plank walk between the stilted houses and the middle.
      const steps = Math.round(Math.hypot(u, v));
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        s.put(Math.round(u * t), stilts, Math.round(v * t), BB.palm_planks, false);
      }
    }
  }
  if (pier) {
    s.box(-1, 0, 8, 1, 0, 26, BB.palm_planks, false);
    for (let k = 8; k <= 26; k += 4) { s.box(-2, -3, k, -2, 1, k, B.LOG, false); s.box(2, -3, k, 2, 1, k, B.LOG, false); }
  }
}

function buildCrypt(s: Site, rand: Rand): void {
  s.level(-8, -8, 8, 8, B.GRASS, 14);
  // A mound over a chamber, and a stair down on the front.
  for (let y = 0; y <= 4; y++) s.disc(0, y, 0, 7 - y * 1.4, y === 4 ? B.GRASS : B.DIRT, false);
  const floorY = -6;
  s.box(-4, floorY - 1, -4, 4, floorY - 1, 4, s.p.floor, false);
  s.box(-4, floorY, -4, 4, floorY + 4, 4, B.AIR, false);
  for (const [u, v] of [[-4, -4], [4, -4], [-4, 4], [4, 4], [-4, 0], [4, 0], [0, 4]]) s.box(u, floorY, v, u, floorY + 3, v, s.p.wall, false);
  s.box(-4, floorY + 4, -4, 4, floorY + 4, 4, s.p.wall, false);
  for (let k = 0; k <= 6; k++) s.box(-1, floorY + k, -5 - (6 - k), 1, floorY + 3 + k, -5 - (6 - k), B.AIR, false);
  for (let k = 0; k <= 6; k++) s.box(-1, floorY - 1 + k, -5 - (6 - k), 1, floorY - 1 + k, -5 - (6 - k), s.p.wall2, false);
  // Sarcophagi along the sides, cobwebs, and a chest at the end.
  for (const v of [-2, 1]) { s.box(-3, floorY, v, -2, floorY, v + 1, s.p.accent, false); s.box(2, floorY, v, 3, floorY, v + 1, s.p.accent, false); }
  s.put(0, floorY + 3, 0, B.COBWEB, false);
  s.put(-3, floorY + 3, 3, B.COBWEB, false);
  s.put(0, floorY + 1, 3, B.TORCH, false);
  s.chest(0, floorY, 2);
  if (rand() < 0.5) s.chest(1, floorY, 2);
}

function buildGraves(s: Site, rand: Rand): void {
  s.level(-14, -14, 14, 14, B.PODZOL, 10);
  for (let u = -12; u <= 12; u += 4) {
    for (let v = -12; v <= 12; v += 3) {
      if (hash2(s.seed + 7, u * 17, v) < 0.35 || (Math.abs(u) < 4 && Math.abs(v) < 4)) continue;
      s.box(u, 1, v, u, 2 + (rand() < 0.3 ? 1 : 0), v, BB.slate);
      s.box(u - 1, 2, v, u + 1, 2, v, BB.slate);
      s.box(u, 0, v + 1, u, 0, v + 2, B.COARSE_DIRT, false);
    }
  }
  s.box(-1, 0, -1, 1, 0, 1, s.p.floor, false);
  s.box(0, 1, 0, 0, 5, 0, BB.petrified_log, false);
  s.chest(2, 1, 2);
}

function buildTemple(s: Site, rand: Rand, info: StructureInfo): void {
  const layers = info.key === 'desert_temple' ? 6 : 8;
  const base = info.key === 'sunken_temple' ? 12 : 11;
  const pal = s.p;
  s.level(-base - 2, -base - 2, base + 2, base + 2, pal.floor, layers * 2 + 14);
  for (let i = 0; i < layers; i++) {
    const w = base - i;
    s.box(-w, i, -w, w, i, w, i % 2 ? pal.wall : pal.wall2, false);
    if (i === 0) s.box(-w, 0, -w, w, 0, w, pal.floor, false);
  }
  // The stair up the front and the hall inside.
  for (let i = 0; i < layers; i++) s.box(-1, i, -base + i - 1, 1, i, -base + i - 1, pal.trim, false);
  const hall = 4;
  s.box(-hall, 1, -hall, hall, 5, hall, B.AIR, false);
  s.box(-hall, 0, -hall, hall, 0, hall, pal.floor, false);
  s.box(-1, 1, -base + 1, 1, 3, -hall, B.AIR, false);
  for (const [u, v] of [[-hall, -hall], [hall, -hall], [-hall, hall], [hall, hall]]) s.box(u, 1, v, u, 4, v, pal.trim, false);
  s.box(-1, 1, hall - 1, 1, 1, hall - 1, pal.accent, false);
  s.put(0, 4, 0, pal.light, false);
  s.chest(0, 1, hall - 2);
  if (rand() < 0.7) s.chest(-2, 1, hall - 2);
  // Pillars at the corners of the top, with the accent block as the crown.
  const topW = base - layers + 1;
  for (const [u, v] of [[-topW, -topW], [topW, -topW], [-topW, topW], [topW, topW]]) s.box(u, layers, v, u, layers + 3, v, pal.trim);
  s.box(-1, layers, -1, 1, layers, 1, pal.accent, false);
  if (info.key === 'crystal_sanctuary') {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const u = Math.round(Math.cos(a) * (base + 3));
      const v = Math.round(Math.sin(a) * (base + 3));
      const h = 6 + Math.floor(rand() * 8);
      for (let y = 0; y < h; y++) s.box(u, y, v, u, y, v, k % 2 ? BB.rose_crystal : BB.azure_crystal, false);
    }
  }
}

function buildFortress(s: Site, rand: Rand, info: StructureInfo): void {
  const hw = 12;
  const wallH = 6;
  const pal = s.p;
  s.level(-hw - 4, -hw - 4, hw + 4, hw + 4, B.COBBLE, 24);
  const moat = info.key === 'volcanic_fortress';
  if (moat) {
    for (let y = -2; y <= 0; y++) {
      s.box(-hw - 4, y, -hw - 4, hw + 4, y, -hw - 3, y === 0 ? B.LAVA : BB.basalt, false);
      s.box(-hw - 4, y, hw + 3, hw + 4, y, hw + 4, y === 0 ? B.LAVA : BB.basalt, false);
      s.box(-hw - 4, y, -hw - 4, -hw - 3, y, hw + 4, y === 0 ? B.LAVA : BB.basalt, false);
      s.box(hw + 3, y, -hw - 4, hw + 4, y, hw + 4, y === 0 ? B.LAVA : BB.basalt, false);
    }
  }
  s.box(-hw, 0, -hw, hw, 0, hw, pal.floor, false);
  // Curtain wall.
  s.box(-hw, 1, -hw, hw, wallH, -hw, pal.wall);
  s.box(-hw, 1, hw, hw, wallH, hw, pal.wall);
  s.box(-hw, 1, -hw, -hw, wallH, hw, pal.wall);
  s.box(hw, 1, -hw, hw, wallH, hw, pal.wall);
  for (let k = -hw; k <= hw; k += 2) for (const [u, v] of [[k, -hw], [k, hw], [-hw, k], [hw, k]]) s.put(u, wallH + 1, v, pal.wall);
  // A gate in the front.
  s.box(-2, 1, -hw, 2, 4, -hw, B.AIR, false);
  s.box(-3, 1, -hw, -3, 5, -hw, pal.trim);
  s.box(3, 1, -hw, 3, 5, -hw, pal.trim);
  // Corner towers.
  for (const [u, v] of [[-hw, -hw], [hw, -hw], [-hw, hw], [hw, hw]]) {
    s.box(u - 2, 1, v - 2, u + 2, 10, v + 2, pal.wall2);
    s.box(u - 1, 1, v - 1, u + 1, 9, v + 1, B.AIR, false);
    s.box(u - 2, 11, v - 2, u + 2, 11, v + 2, pal.roof);
    s.put(u, 5, v - 2, B.AIR, false);
    s.put(u, 5, v + 2, B.AIR, false);
  }
  // The keep.
  s.room(-5, -4, 5, 6, 9, pal.wall, pal.floor, pal.roof);
  s.box(-5, 5, -4, 5, 5, 6, pal.floor, false);
  s.box(-1, 1, -4, 1, 3, -4, B.AIR, false);
  s.box(0, 1, 5, 0, 4, 5, B.AIR, false);
  s.put(0, 3, 0, pal.light, false);
  s.chest(0, 1, 5);
  s.chest(-3, 6, 4);
  if (rand() < 0.6) s.chest(3, 6, 4);
  s.box(-4, 1, 3, -4, 2, 3, B.BOOKSHELF, false);
}

function buildLibrary(s: Site, rand: Rand): void {
  const pal = s.p;
  const hw = 8;
  s.level(-hw - 3, -hw - 3, hw + 3, hw + 3, pal.floor, 20);
  s.box(-hw - 2, 0, -hw - 2, hw + 2, 1, hw + 2, pal.trim, false);
  s.room(-hw, -hw, hw, hw, 9, pal.wall, pal.floor, pal.roof, 1);
  s.box(-1, 2, -hw, 1, 5, -hw, B.AIR, false);
  for (let v = -hw + 2; v <= hw - 2; v += 3) {
    s.box(-hw + 1, 2, v, -hw + 1, 6, v + 1, B.BOOKSHELF, false);
    s.box(hw - 1, 2, v, hw - 1, 6, v + 1, B.BOOKSHELF, false);
  }
  for (let v = -hw + 3; v <= hw - 3; v += 4) for (const u of [-4, 4]) s.box(u, 2, v, u, 9, v, pal.trim);
  s.box(-1, 2, 0, 1, 2, 0, pal.accent, false);
  s.put(0, 3, 0, pal.light, false);
  s.chest(0, 2, hw - 2, 'relic');
  s.chest(-3, 2, hw - 2);
  for (let k = 0; k < 4; k++) s.put(Math.floor(rand() * 13) - 6, 2, Math.floor(rand() * 13) - 6, B.COBWEB, false);
}

function buildMonastery(s: Site, rand: Rand): void {
  const pal = s.p;
  s.level(-16, -14, 16, 16, B.GRASS, 20);
  // A cloister around a court, with a chapel at the back.
  s.box(-12, 0, -12, 12, 0, 12, pal.floor, false);
  for (let k = -12; k <= 12; k += 3) {
    for (const [u, v] of [[k, -12], [k, 12], [-12, k], [12, k]]) s.box(u, 1, v, u, 5, v, pal.wall);
  }
  s.box(-12, 6, -12, 12, 6, -12, pal.roof);
  s.box(-12, 6, 12, 12, 6, 12, pal.roof);
  s.box(-12, 6, -12, -12, 6, 12, pal.roof);
  s.box(12, 6, -12, 12, 6, 12, pal.roof);
  s.room(-6, 6, 6, 16, 9, pal.wall, pal.floor, pal.roof);
  s.box(-1, 1, 6, 1, 4, 6, B.AIR, false);
  s.box(-1, 1, 15, 1, 2, 15, pal.accent, false);
  s.put(0, 3, 14, pal.light, false);
  s.chest(0, 1, 14);
  // A well in the court.
  s.box(-1, 1, -1, 1, 1, 1, pal.trim, false);
  s.put(0, 1, 0, B.WATER, false);
  void rand;
}

function buildBattlefield(s: Site, rand: Rand): void {
  s.level(-20, -20, 20, 20, B.COARSE_DIRT, 10);
  for (let i = 0; i < 26; i++) {
    const u = Math.floor((rand() - 0.5) * 38);
    const v = Math.floor((rand() - 0.5) * 38);
    const kind = rand();
    if (kind < 0.35) s.box(u, 1, v, u + Math.floor(rand() * 4), 1 + Math.floor(rand() * 3), v, s.p.wall);
    else if (kind < 0.6) s.box(u, 1, v, u, 1 + Math.floor(rand() * 2), v + Math.floor(rand() * 4), s.p.wall2);
    else if (kind < 0.85) { s.put(u, 1, v, BB.bone_block, false); s.put(u + 1, 1, v, BB.fossil_rock, false); if (rand() < 0.5) s.put(u, 2, v, B.COBWEB, false); }
    else s.box(u, 1, v, u, 4, v, B.LOG);
  }
  s.chest(Math.floor((rand() - 0.5) * 10), 1, Math.floor((rand() - 0.5) * 10));
  s.chest(Math.floor((rand() - 0.5) * 30), 1, Math.floor((rand() - 0.5) * 30));
}

function buildBridge(s: Site, rand: Rand): void {
  const len = 22 + Math.floor(rand() * 8);
  const y = 5;
  s.level(-len - 2, -3, len + 2, 3, B.GRASS, 12, 0);
  for (let u = -len; u <= len; u++) {
    const arch = Math.round(Math.sqrt(Math.max(0, len * len - u * u)) / len * 2);
    s.box(u, y + arch, -2, u, y + arch, 2, s.p.wall, false);
    s.box(u, y + arch + 1, -2, u, y + arch + 1, -2, s.p.trim, false);
    s.box(u, y + arch + 1, 2, u, y + arch + 1, 2, s.p.trim, false);
    if (u % 6 === 0) s.box(u, 0, -1, u, y + arch - 1, 1, s.p.wall2, false);
  }
  s.box(-len - 3, 0, -2, -len - 1, y, 2, s.p.wall2, false);
  s.box(len + 1, 0, -2, len + 3, y, 2, s.p.wall2, false);
  s.put(0, y + 3, 0, B.LANTERN, false);
}

function buildHarbor(s: Site, rand: Rand): void {
  s.level(-8, -4, 8, 4, B.COBBLE, 8);
  s.box(-6, 1, -2, 6, 1, 20, BB.palm_planks, false);
  for (let k = 0; k <= 20; k += 4) { s.box(-6, -4, k, -6, 2, k, B.LOG, false); s.box(6, -4, k, 6, 2, k, B.LOG, false); }
  s.box(-1, 1, 6, 1, 1, 20, BB.palm_planks, false);
  s.room(-6, -4, -2, 0, 3, s.p.wall, s.p.floor, s.p.roof, 1);
  s.box(-4, 2, 0, -4, 3, 0, B.AIR, false);
  s.chest(-5, 2, -3);
  // Two small boats moored along the pier.
  for (const u of [-4, 4]) {
    s.box(u - 1, 0, 8, u + 1, 0, 14, s.p.wall2, false);
    s.box(u - 2, 1, 8, u - 2, 1, 14, s.p.wall2, false);
    s.box(u + 2, 1, 8, u + 2, 1, 14, s.p.wall2, false);
  }
  void rand;
}

function buildSkeleton(s: Site, rand: Rand, info: StructureInfo): void {
  const dragon = info.key === 'dragon_skeleton';
  const len = dragon ? 40 : 16;
  const mat = dragon ? BB.bone_block : BB.fossil_rock;
  s.level(-len / 2 - 4, -10, len / 2 + 6, 10, B.SAND, 24);
  const sink = dragon ? 0 : -1;
  for (let u = -len / 2; u <= len / 2; u++) {
    const lift = dragon ? Math.round(Math.sin(((u + len / 2) / len) * Math.PI) * 2) : 0;
    s.box(u, 1 + lift + sink, 0, u, 1 + lift + sink, 0, mat, false);
    if (u % 2 === 0) s.put(u, 2 + lift + sink, 0, BB.bone_block, false);
    if (u % 3 === 0 && u > -len / 4 && u < len / 3) {
      const r = (dragon ? 8 : 4) * Math.sqrt(Math.max(0, 1 - ((u - len / 12) * 2 / len) ** 2));
      for (let a = 0; a <= r; a++) {
        const up = Math.round(Math.sqrt(Math.max(0, r * r - a * a)) * (dragon ? 0.9 : 0.6));
        s.put(u, 1 + up + sink + lift, a, BB.bone_block, false);
        s.put(u, 1 + up + sink + lift, -a, BB.bone_block, false);
      }
    }
  }
  if (dragon) {
    // The skull at the head end, jaws agape.
    const hu = len / 2 + 1;
    s.box(hu, 1, -2, hu + 4, 3, 2, BB.bone_block, false);
    s.box(hu + 4, 1, -1, hu + 4, 2, 1, B.AIR, false);
    s.put(hu + 3, 3, -2, B.AIR, false);
    s.put(hu + 3, 3, 2, B.AIR, false);
    for (let k = -1; k <= 1; k++) s.put(hu + 4, 1, k * 1, B.COBWEB, false);
    s.put(hu + 2, 4, -1, BB.bone_block, false);
    s.put(hu + 2, 4, 1, BB.bone_block, false);
    s.chest(-len / 2 + 3, 1, 2, 'relic');
  } else if (rand() < 0.5) {
    s.chest(0, 0, 2);
  }
}

function buildWreck(s: Site, rand: Rand): void {
  const len = 17;
  s.level(-4, -len, 4, len, BB.white_sand, 14);
  const pal = s.p;
  for (let v = -len / 2; v <= len / 2; v++) {
    const w = Math.max(1, Math.round(3.4 * Math.sqrt(Math.max(0, 1 - (v / (len / 2 + 1)) ** 2)) + 0.4));
    s.box(-w, 1, v, w, 1, v, pal.floor, false);
    s.put(-w, 2, v, pal.wall2, false);
    s.put(w, 2, v, pal.wall2, false);
    if (Math.abs(v) < len / 2 - 2) { s.put(-w, 3, v, pal.wall2); s.put(w, 3, v, pal.wall2); }
  }
  s.box(0, 2, -3, 0, 9 + Math.floor(rand() * 3), -3, B.LOG);
  s.box(-1, 5, -3, 1, 5, -3, pal.wall);
  s.box(-1, 2, 3, 1, 3, 6, pal.wall);
  s.chest(0, 2, 4);
  s.chest(0, 2, -6);
}

function buildTreasure(s: Site): void {
  s.box(-1, 0, -1, 1, 0, 1, B.SAND, false);
  s.chest(0, -3, 0, 'relic');
  // A cairn of three stones marks the spot.
  s.box(0, 1, 0, 0, 2, 0, B.COBBLE, false);
  s.put(1, 1, 0, B.COBBLE, false);
  s.put(0, 3, 0, BB.bone_block, false);
}

function buildReef(s: Site, rand: Rand): void {
  const colours = [BB.coral_block_pink, BB.coral_block_red, BB.coral_block_blue, BB.coral_block_yellow, BB.coral_block_purple];
  for (let i = 0; i < 16; i++) {
    const u = Math.floor((rand() - 0.5) * 28);
    const v = Math.floor((rand() - 0.5) * 28);
    const h = 2 + Math.floor(rand() * 7);
    const c = colours[Math.floor(rand() * colours.length)];
    const r = 1 + Math.floor(rand() * 2);
    for (let y = 1; y <= h; y++) s.disc(u, y, v, Math.max(0.6, r * (1 - y / (h + 2))), rand() < 0.08 ? BB.dead_coral_block : c, false);
    s.put(u, h + 1, v, rand() < 0.5 ? BB.coral_fan_pink : BB.coral_fan_blue, false);
  }
}

function buildSunken(s: Site, rand: Rand): void {
  const pal = s.p;
  for (let i = 0; i < 9; i++) {
    const u = Math.floor((rand() - 0.5) * 24);
    const v = Math.floor((rand() - 0.5) * 24);
    const h = 3 + Math.floor(rand() * 8);
    s.box(u, 1, v, u, h, v, rand() < 0.5 ? pal.wall : pal.wall2);
    s.put(u, h + 1, v, pal.trim);
  }
  s.box(-5, 1, -5, 5, 1, 5, pal.floor, false);
  s.box(-5, 2, -5, -5, 5, 5, pal.wall);
  s.box(-5, 2, -5, 5, 5, -5, pal.wall);
  s.box(-1, 2, -5, 1, 4, -5, B.AIR, false);
  s.chest(0, 2, 3);
  s.put(0, 2, 0, pal.light, false);
}

function buildStatue(s: Site, rand: Rand): void {
  const pal = s.p;
  s.level(-9, -9, 9, 9, pal.floor, 40);
  s.box(-8, 0, -8, 8, 2, 8, pal.trim, false);
  s.box(-6, 3, -6, 6, 3, 6, pal.floor, false);
  // Legs, torso, arms, head and a crown.
  s.box(-3, 4, -2, -1, 14, 2, pal.wall);
  s.box(1, 4, -2, 3, 14, 2, pal.wall);
  s.box(-4, 4, -3, -1, 4, 3, pal.trim);
  s.box(1, 4, -3, 4, 4, 3, pal.trim);
  s.box(-4, 15, -3, 4, 26, 3, pal.wall);
  s.box(-6, 17, -2, -5, 25, 2, pal.wall);
  s.box(5, 17, -2, 6, 25, 2, pal.wall);
  s.box(-6, 14, -2, -5, 16, 2, pal.wall);
  s.box(5, 14, -2, 6, 16, 2, pal.wall);
  s.box(-3, 27, -3, 3, 33, 3, pal.wall2);
  s.box(-3, 34, -3, 3, 34, 3, pal.trim);
  for (let u = -3; u <= 3; u += 2) s.put(u, 35, -3, pal.trim);
  s.put(-1, 30, -3, B.AIR, false);
  s.put(1, 30, -3, B.AIR, false);
  s.put(0, 29, -4, pal.trim);
  s.put(-2, 30, -3, B.GLOWSTONE, false);
  s.put(2, 30, -3, B.GLOWSTONE, false);
  s.box(-1, 4, -3, 1, 8, -3, B.AIR, false);
  s.chest(0, 4, 0, 'relic');
  void rand;
}

function buildCairn(s: Site, rand: Rand): void {
  s.level(-4, -4, 4, 4, B.SNOW_BLOCK, 12);
  for (let y = 0; y < 6; y++) s.disc(0, 1 + y, 0, 3.2 - y * 0.5, y % 2 ? BB.frosted_stone : B.PACKED_ICE, false);
  s.put(0, 7, 0, BB.blue_ice, false);
  s.box(0, -2, 0, 0, -2, 0, B.CHEST, false);
  s.chest(0, -2, 0);
  void rand;
}

function buildNest(s: Site, rand: Rand): void {
  s.level(-8, -8, 8, 8, B.COARSE_DIRT, 12);
  for (let y = 0; y < 3; y++) s.disc(0, y + 1, 0, 7 - y * 1.4, y === 0 ? B.LOG : B.COARSE_DIRT, false);
  s.disc(0, 4, 0, 3.5, B.AIR, false);
  s.disc(0, 3, 0, 3.4, B.COARSE_DIRT, false);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + rand();
    const u = Math.round(Math.cos(a) * 1.8);
    const v = Math.round(Math.sin(a) * 1.8);
    s.box(u, 4, v, u, 6, v, BB.marble, false);
    s.put(u, 7, v, BB.polished_marble, false);
  }
  s.chest(0, 4, 0);
}

function build(info: StructureInfo, s: Site, rand: Rand): void {
  switch (info.arche) {
    case 'stones': return buildStones(s, rand);
    case 'monolith': return buildMonolith(s, rand);
    case 'shrine': return buildShrine(s, rand);
    case 'tower': return buildTower(s, rand);
    case 'lighthouse': return buildLighthouse(s, rand);
    case 'camp': return buildCamp(s, rand);
    case 'hut': return buildHut(s, rand);
    case 'village': return buildVillage(s, rand, info);
    case 'crypt': return buildCrypt(s, rand);
    case 'graves': return buildGraves(s, rand);
    case 'temple': return buildTemple(s, rand, info);
    case 'fortress': return buildFortress(s, rand, info);
    case 'library': return buildLibrary(s, rand);
    case 'monastery': return buildMonastery(s, rand);
    case 'battlefield': return buildBattlefield(s, rand);
    case 'bridge': return buildBridge(s, rand);
    case 'harbor': return buildHarbor(s, rand);
    case 'skeleton': return buildSkeleton(s, rand, info);
    case 'wreck': return buildWreck(s, rand);
    case 'treasure': return buildTreasure(s);
    case 'reef': return buildReef(s, rand);
    case 'sunken': return buildSunken(s, rand);
    case 'statue': return buildStatue(s, rand);
    case 'cairn': return buildCairn(s, rand);
    case 'nest': return buildNest(s, rand);
    default:
  }
}

export class BeyondStructures {
  private readonly cache = new Map<string, StructurePlace | null>();

  constructor(private readonly host: StructureHost) {}

  /** The place of a grid cell, or null. */
  placeOf(rarity: BiomeRarity, ix: number, iz: number): StructurePlace | null {
    const key = `${rarity}:${ix},${iz}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const place = this.plan(rarity, ix, iz);
    if (this.cache.size > 6000) this.cache.clear();
    this.cache.set(key, place);
    return place;
  }

  private plan(rarity: BiomeRarity, ix: number, iz: number): StructurePlace | null {
    const seed = this.host.seed + 7100 + RARITIES.indexOf(rarity) * 17;
    if (hash2(seed, ix, iz) >= CELL_CHANCE[rarity]) return null;
    const cell = STRUCTURE_CELL[rarity];
    const pad = 36;
    for (let attempt = 0; attempt < 5; attempt++) {
      const x = ix * cell + pad + Math.floor(hash2(seed + 1 + attempt * 7, ix, iz) * (cell - pad * 2));
      const z = iz * cell + pad + Math.floor(hash2(seed + 2 + attempt * 7, ix, iz) * (cell - pad * 2));
      const col = this.host.columnAt(x, z);
      const biome = BEYOND_BIOMES[col.sub || 1];
      const candidates = biome.structures.filter((k) => STRUCTURES[k].rarity === rarity);
      if (candidates.length === 0) continue;
      const key = candidates[Math.min(candidates.length - 1, Math.floor(hash2(seed + 3 + attempt, ix, iz) * candidates.length))];
      const info = STRUCTURES[key];
      // Wide, empty biomes (the open sea) would otherwise be crowded with their one common place.
      if (hash2(seed + 9 + attempt, ix, iz) >= (SHARE[key] ?? 1)) continue;
      const y = this.siteY(info, x, z, col);
      if (y === null) continue;
      const v = this.host.nearestVillage(x, z);
      if (v && Math.hypot(v.x - x, v.z - z) < 90 + info.radius) continue;
      if (Math.hypot(x, z) < 70 && info.radius > 8) continue;
      if (this.crowded(rarity, info.radius, x, z)) continue;
      return { key, info, x, z, y, rot: Math.floor(hash2(seed + 5, ix, iz) * 4), seed: Math.floor(hash2(seed + 6, ix, iz) * 1e9), chests: new Map(), registered: false, floating: null, extra: [], drawn: 0 };
    }
    return null;
  }

  /** Does a place of a rarer kind stand so near that the two would run into each other? The rarer one keeps its ground. */
  private crowded(rarity: BiomeRarity, radius: number, x: number, z: number): boolean {
    for (const other of RARITIES.slice(RARITIES.indexOf(rarity) + 1)) {
      const cell = STRUCTURE_CELL[other];
      const reach = radius + 40;
      for (let iz = Math.floor((z - reach) / cell); iz <= Math.floor((z + reach) / cell); iz++) {
        for (let ix = Math.floor((x - reach) / cell); ix <= Math.floor((x + reach) / cell); ix++) {
          const p = this.placeOf(other, ix, iz);
          if (p && Math.max(Math.abs(p.x - x), Math.abs(p.z - z)) < radius + p.info.radius + 10) return true;
        }
      }
    }
    for (const c of this.host.castlesNear?.(x, z, radius + 60) ?? []) if (Math.max(Math.abs(c.x - x), Math.abs(c.z - z)) < radius + c.r + 6) return true;
    return false;
  }

  /** The y a place stands at, or null when the spot does not suit it. */
  private siteY(info: StructureInfo, x: number, z: number, col: Column): number | null {
    const h = col.height;
    const r = Math.min(info.radius, 10);
    let lo = h;
    let hi = h;
    let wet = 0;
    for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r]]) {
      const c = this.host.columnAt(x + dx, z + dz).height;
      lo = Math.min(lo, c);
      hi = Math.max(hi, c);
      if (c < SEA_LEVEL) wet++;
    }
    if (info.site === 'sea') return h < SEA_LEVEL - 3 && hi < SEA_LEVEL - 1 && hi - lo <= 8 ? h : null;
    if (h <= SEA_LEVEL + 1) return null;
    if (info.site === 'shore') {
      if (wet === 0 || h > SEA_LEVEL + 6) return null;
      return Math.max(SEA_LEVEL + 1, h);
    }
    if (info.arche === 'bridge') return hi - lo >= 2 || wet > 0 ? Math.max(lo, SEA_LEVEL + 1) : null;
    const slack = info.radius > 14 ? 7 : 5;
    if (hi - lo > slack + (info.arche === 'temple' || info.arche === 'statue' ? 4 : 0)) return null;
    if (wet > 1) return null;
    return Math.round((lo + hi) / 2);
  }

  /** Draw every place that reaches a chunk. */
  apply(blocks: Uint16Array, cx: number, cz: number): void {
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    for (const rarity of RARITIES) {
      const cell = STRUCTURE_CELL[rarity];
      const reach = 48;
      const ix0 = Math.floor((ox - reach) / cell);
      const ix1 = Math.floor((ox + CHUNK_SIZE + reach) / cell);
      const iz0 = Math.floor((oz - reach) / cell);
      const iz1 = Math.floor((oz + CHUNK_SIZE + reach) / cell);
      for (let iz = iz0; iz <= iz1; iz++) {
        for (let ix = ix0; ix <= ix1; ix++) {
          const place = this.placeOf(rarity, ix, iz);
          if (!place) continue;
          const r = place.info.radius + 6;
          if (place.x + r < ox || place.x - r >= ox + CHUNK_SIZE || place.z + r < oz || place.z - r >= oz + CHUNK_SIZE) continue;
          const rand = mulberry32(place.seed | 0);
          if (!place.floating) this.analyse(place);
          const site = new Site(blocks, ox, oz, place, this.host, place.info.decay, place.info.palette, place.floating);
          build(place.info, site, rand);
          for (let i = 0; i < place.extra.length; i += 4) {
            const lx = place.extra[i] - ox;
            const lz = place.extra[i + 2] - oz;
            const y = place.extra[i + 1];
            if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) blocks[blockIndex(lx, y, lz)] = place.extra[i + 3];
          }
        }
      }
    }
  }

  /** The ground the places take (a square of half side `radius + 3 + pad` round each) that reaches a square of the world. */
  claims(ox: number, oz: number, size: number, pad: number): { x: number; z: number; r: number }[] {
    const out: { x: number; z: number; r: number }[] = [];
    for (const rarity of RARITIES) {
      const cell = STRUCTURE_CELL[rarity];
      const reach = 40 + pad;
      for (let iz = Math.floor((oz - reach) / cell); iz <= Math.floor((oz + size + reach) / cell); iz++) {
        for (let ix = Math.floor((ox - reach) / cell); ix <= Math.floor((ox + size + reach) / cell); ix++) {
          const place = this.placeOf(rarity, ix, iz);
          if (!place) continue;
          const r = place.info.radius + 3 + pad;
          if (place.x + r < ox || place.x - r >= ox + size || place.z + r < oz || place.z - r >= oz + size) continue;
          out.push({ x: place.x, z: place.z, r });
        }
      }
    }
    return out;
  }

  /** The loot table of a chest a place made, or null. */
  lootAt(x: number, y: number, z: number): LootTableName | null {
    for (const rarity of RARITIES) {
      const cell = STRUCTURE_CELL[rarity];
      const ix = Math.floor(x / cell);
      const iz = Math.floor(z / cell);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const place = this.placeOf(rarity, ix + dx, iz + dz);
          if (!place || Math.abs(place.x - x) > place.info.radius + 8 || Math.abs(place.z - z) > place.info.radius + 8) continue;
          if (!place.floating) this.analyse(place);
          const t = place.chests.get(posKey(x, y, z));
          if (t) return t;
        }
      }
    }
    return null;
  }

  /**
   * Draw a place whole into scratch buffers, once. Its chests become known (the loot lookup asks for them) and the blocks that
   * would hang in the air (a ruin's decay can cut a wall off from the ground) are found; every drawing then leaves those out.
   */
  private analyse(place: StructurePlace): void {
    const r = place.info.radius + 8;
    const cx0 = Math.floor((place.x - r) / CHUNK_SIZE);
    const cx1 = Math.floor((place.x + r) / CHUNK_SIZE);
    const cz0 = Math.floor((place.z - r) / CHUNK_SIZE);
    const cz1 = Math.floor((place.z + r) / CHUNK_SIZE);
    place.chests.clear();
    const leveled = new Map<number, number>();
    const parts: { ox: number; oz: number; blocks: Uint16Array }[] = [];
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const blocks = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
        const site = new Site(blocks, cx * CHUNK_SIZE, cz * CHUNK_SIZE, place, this.host, place.info.decay, place.info.palette, null, leveled);
        build(place.info, site, mulberry32(place.seed | 0));
        parts.push({ ox: cx * CHUNK_SIZE, oz: cz * CHUNK_SIZE, blocks });
      }
    }
    const heights = new Map<number, number>();
    const hAt = (x: number, z: number): number => {
      const k = x * 65536 + z;
      let h = heights.get(k);
      if (h === undefined) heights.set(k, (h = leveled.get(k) ?? this.host.columnAt(x, z).height));
      return h;
    };
    // A block is on the ground when the terrain is under it or beside it (any of the eight columns round it).
    const groundNear = (x: number, z: number): number => {
      let m = 0;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) m = Math.max(m, hAt(x + dx, z + dz));
      return m;
    };
    const top = Math.min(WORLD_HEIGHT - 1, place.y + 80);
    const cells: { x: number; y: number; z: number; id: number }[] = [];
    for (const part of parts) {
      for (let y = 1; y <= top; y++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            const id = part.blocks[blockIndex(lx, y, lz)];
            if (id === B.AIR || BLOCKS[id].liquid) continue;
            cells.push({ x: part.ox + lx, y, z: part.oz + lz, id });
          }
        }
      }
    }
    // A wall, post or pillar that stops a block or two short of the ground is carried down to it (nothing is built hovering).
    const lowest = new Map<number, { x: number; y: number; z: number; id: number }>();
    for (const c of cells) {
      // Only what stands over the ground counts (the pad a building levels, and what is buried, is the ground).
      if (c.y <= hAt(c.x, c.z)) continue;
      const k = c.x * 65536 + c.z;
      const cur = lowest.get(k);
      if (!cur || c.y < cur.y) lowest.set(k, c);
    }
    const extra: number[] = [];
    for (const c of lowest.values()) {
      const ground = hAt(c.x, c.z);
      const gap = c.y - ground - 1;
      if (gap < 1 || gap > 2 || !BLOCKS[c.id].solid) continue;
      for (let y = ground + 1; y < c.y; y++) {
        extra.push(c.x, y, c.z, c.id);
        cells.push({ x: c.x, y, z: c.z, id: c.id });
      }
    }
    const kept = keepRooted(cells, (c) => c.y <= groundNear(c.x, c.z) + 1);
    const floating = new Set<number>();
    if (kept.length < cells.length) {
      const keptKeys = new Set<number>();
      for (const c of kept) keptKeys.add(cellKey(c.x, c.y, c.z));
      for (const c of cells) {
        const k = cellKey(c.x, c.y, c.z);
        if (!keptKeys.has(k)) floating.add(k);
      }
      for (const key of [...place.chests.keys()]) {
        const [x, y, z] = key.split(',').map(Number);
        if (floating.has(cellKey(x, y, z))) place.chests.delete(key);
      }
    }
    place.floating = floating;
    place.extra = extra;
    place.drawn = cells.length;
    place.registered = true;
  }
  /** A place with its drawing studied (the blocks that would hang in the air are known): for tests and tools. */
  settle(place: StructurePlace): StructurePlace {
    if (!place.floating) this.analyse(place);
    return place;
  }
  /** Every place within `radius` of a point, nearest first (tests, the debug hooks and the map). */
  near(x: number, z: number, radius: number, key?: StructureKey): StructurePlace[] {
    const out: StructurePlace[] = [];
    for (const rarity of RARITIES) {
      const cell = STRUCTURE_CELL[rarity];
      for (let iz = Math.floor((z - radius) / cell); iz <= Math.floor((z + radius) / cell); iz++) {
        for (let ix = Math.floor((x - radius) / cell); ix <= Math.floor((x + radius) / cell); ix++) {
          const place = this.placeOf(rarity, ix, iz);
          if (place && (!key || place.key === key) && Math.hypot(place.x - x, place.z - z) <= radius) out.push(place);
        }
      }
    }
    return out.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
  }
}
