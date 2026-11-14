import { Biome, FROZEN_BIOMES, VILLAGE_BIOMES, WATER_BIOMES, type BiomeId, type Column } from './biomes';
import { B, IS_SOLID } from './blocks';
import { CaveCarver } from './caves';
import { CaveDecor, CaveZone } from './caveDecor';
import type { LootTableName } from './loot';
import type { MobKind } from './mobs';
import type { DummyStation, NpcStation } from './quests';
import { StructureGenerator, type StructureKind, type StructurePlan } from './structures';
import { CHUNK_SIZE, CHUNK_VOLUME, SEA_LEVEL, WORLD_HEIGHT, blockIndex } from './chunk';
import { Simplex, hash2, mulberry32 } from './noise';
import { SurfaceRules, strataAt } from './surface';
import { Terrain, newColumnData } from './terrain';
import { Vegetation } from './vegetation';
import { VillageGenerator, type VillageSite } from './village';

export { BIOME_NAMES, Biome, FROZEN_BIOMES, HOT_BIOMES, VILLAGE_BIOMES, WATER_BIOMES, type BiomeId, type Column } from './biomes';

/** What the generator keeps of the columns of one chunk (the land is asked about far more often than it changes). */
interface ColumnChunk {
  height: Int16Array;
  biome: Uint8Array;
  heat: Uint8Array;
  t: Uint8Array;
  h: Uint8Array;
}

/** Biomes a pond may lie in: open, fresh, level country. */
const POND_BIOMES: ReadonlySet<number> = new Set<number>([
  Biome.PLAINS, Biome.FOREST, Biome.BIRCH_FOREST, Biome.FLOWER_FOREST, Biome.DARK_FOREST, Biome.TAIGA, Biome.OLD_TAIGA, Biome.SNOWY_TAIGA, Biome.SNOW,
  Biome.MEADOW, Biome.CHERRY_GROVE, Biome.SAVANNA, Biome.JUNGLE,
]);

/** Where a first spawn may stand: not on mountains, in the swamp, the jungle, the badlands or on an island of mushrooms. */
const NO_SPAWN: ReadonlySet<number> = new Set<number>([
  ...WATER_BIOMES, Biome.BEACH, Biome.SNOWY_BEACH, Biome.STONY_SHORE, Biome.MOUNTAIN, Biome.STONY_PEAKS, Biome.WINDSWEPT_HILLS, Biome.SWAMP, Biome.JUNGLE,
  Biome.BADLANDS, Biome.MUSHROOM_FIELDS, Biome.ICE_SPIKES,
]);

/** A pond: where, how big, and the height of its surface. */
interface LakePlan {
  x: number;
  z: number;
  rx: number;
  rz: number;
  level: number;
  ice: boolean;
}
/** Share of chunks that try to hold a pond (most fail the flat-ground test). */
const LAKE_CHANCE = 0.22;

interface OreDef {
  id: number;
  minY: number;
  maxY: number;
  veins: number;
  size: number;
  /** Share of chunks that get the vein (default: all). */
  chance?: number;
}

/**
 * Ore veins per chunk. Coal is everywhere, iron in the middle, gold and diamond deep, as in the
 * original; the lava lakes below `LAVA_LEVEL` sit in the same layers as the diamonds.
 */
const ORES: OreDef[] = [
  { id: B.GRAVEL, minY: 4, maxY: 120, veins: 5, size: 10 },
  { id: B.COAL_ORE, minY: 5, maxY: 128, veins: 18, size: 8 },
  { id: B.IRON_ORE, minY: 5, maxY: 80, veins: 12, size: 6 },
  { id: B.GOLD_ORE, minY: 4, maxY: 30, veins: 3, size: 5 },
  { id: B.DIAMOND_ORE, minY: 4, maxY: 16, veins: 2, size: 4 },
  { id: B.LAPIS_ORE, minY: 4, maxY: 32, veins: 2, size: 5 },
  // Rare, and last in the list so the other ores fall where they always did.
  { id: B.EMERALD_ORE, minY: 4, maxY: 48, veins: 1, size: 2, chance: 0.35 },
  { id: B.REDSTONE_ORE, minY: 2, maxY: 16, veins: 3, size: 5 },
];

/** Big blobs of plain stone variants and soil inside the rock. */
const BLOBS: { id: number; minY: number; maxY: number; count: number; radius: number }[] = [
  { id: B.DIRT, minY: 20, maxY: 120, count: 3, radius: 4 },
  { id: B.GRANITE, minY: 8, maxY: 110, count: 2, radius: 5 },
  { id: B.DIORITE, minY: 8, maxY: 110, count: 2, radius: 5 },
  { id: B.ANDESITE, minY: 8, maxY: 110, count: 2, radius: 5 },
  // Tuff seams in the deep, where the deepslate begins.
  { id: B.TUFF, minY: 4, maxY: 44, count: 2, radius: 6 },
  { id: B.CLAY, minY: 40, maxY: 62, count: 1, radius: 4 },
];

/** A seed always has the same spawn point, so it is only searched for once per process. */
const SPAWN_CACHE = new Map<number, { x: number; y: number; z: number }>();

/** Carved-out cells at or below this height fill with lava. */
export const LAVA_LEVEL = 10;

/** How far outside a monster-free place (a village) no monster is born. */
export const SAFE_BUFFER = 24;

/** What a dungeon asks of whoever walks into its portal. */
export interface InstanceRequirement {
  /** The dungeon's name, for the messages. */
  name: string;
  /** Experience level needed (survival players; creative bypasses all of it). */
  level?: number;
  /** An item that must be carried (a key). */
  item?: number;
  /** The key is used up when a new copy is opened (walking back into a copy you already have costs nothing). */
  consume?: boolean;
}

/**
 * Deterministic world generator. The same seed always produces the same chunk,
 * on the client (worker) and on the server.
 */
export class WorldGenerator {
  private terrain: Terrain;
  private nCave1: Simplex;
  private nCave2: Simplex;
  private nCavern: Simplex;
  private nWide: Simplex;
  private nNoodleA: Simplex;
  private nNoodleB: Simplex;
  private nAquifer: Simplex;
  private nTint: Simplex;
  private lakes = new Map<string, LakePlan | null>();
  private columns = new Map<number, ColumnChunk>();
  private touched = new Map<number, number>();
  private sampleOut = newColumnData();
  private carver: CaveCarver;
  /** The country of the caves (lush, dripstone, deep dark), the geodes, and the walls of rubble across tunnels. */
  private decor: CaveDecor;
  /** What the ground is made of, biome by biome. */
  readonly rules: SurfaceRules;
  private readonly vegetation: Vegetation;
  /** Dungeons and mineshafts. */
  readonly structures: StructureGenerator;
  /** Villages: where they are and what they look like. */
  readonly villages: VillageGenerator;
  /** Which kind of world this makes ('square' is the flat platform of squareWorld.ts, 'adventure' the quest world of adventure.ts). */
  readonly kind: 'overworld' | 'square' | 'adventure' = 'overworld';

  constructor(public readonly seed: number) {
    this.terrain = new Terrain(seed);
    this.nCave1 = new Simplex(seed + 7);
    this.nCave2 = new Simplex(seed + 8);
    this.nCavern = new Simplex(seed + 9);
    this.nWide = new Simplex(seed + 26);
    this.nNoodleA = new Simplex(seed + 27);
    this.nNoodleB = new Simplex(seed + 28);
    this.nAquifer = new Simplex(seed + 11);
    this.nTint = new Simplex(seed + 13);
    this.rules = new SurfaceRules(seed);
    this.vegetation = new Vegetation(this, seed);
    this.carver = new CaveCarver(seed);
    this.decor = new CaveDecor(seed, this.carver, (x, z) => this.columnAt(x, z).height);
    this.structures = new StructureGenerator(seed, this);
    this.villages = new VillageGenerator(this, {
      seed,
      biomes: VILLAGE_BIOMES,
      ground: (biome) =>
        biome === Biome.DESERT
          ? { top: B.SAND, sub: B.SAND }
          : biome === Biome.SNOW
            ? { top: B.SNOW, sub: B.DIRT }
            : { top: B.GRASS, sub: B.DIRT },
      style: (biome) => (biome === Biome.DESERT ? 'desert' : biome === Biome.SNOW || biome === Biome.TAIGA ? 'spruce' : 'oak'),
    });
  }

  /** The closest village to a point (null when none is within a few hundred blocks). */
  nearestVillage(x: number, z: number): VillageSite | null {
    return this.villages.nearest(x, z);
  }

  /** The loot table of a generated chest (dungeon, mineshaft, village), or null for an ordinary chest. */
  lootAt(x: number, y: number, z: number): LootTableName | null {
    return this.structures.lootAt(x, y, z) ?? (this.villages.hasChestAt(x, y, z) ? 'village' : this.carver.cacheAt(x, y, z) ? 'cache' : null);
  }

  /** The kind of cave a cell lies in: plain, lush, dripstone or deep dark (debug hooks and tests). */
  caveKindAt(x: number, y: number, z: number): 'plain' | 'lush' | 'dripstone' | 'deep_dark' {
    return this.decor.kindAt(x, y, z);
  }

  /** The walls of ore-studded rubble across the tunnels that start in a chunk, with where each one's cache is (debug hooks and tests). */
  caveSeals(cx: number, cz: number): ReturnType<CaveCarver['seals']> {
    return this.carver.seals(cx, cz);
  }

  /** The nearest dungeon or mineshaft to a point (tests and debug hooks). */
  nearestStructure(kind: StructureKind, x: number, z: number): StructurePlan | null {
    return this.structures.nearest(kind, x, z);
  }

  /**
   * A spot to stand in a roomy cave ('cave': solid floor, open air around and above), or a lava
   * cell with air over it ('lava'). Searches chunks outwards from (x, z); used by tests and debug hooks.
   */
  findCavePoint(kind: 'cave' | 'lava', x: number, z: number, rings = 10): { x: number; y: number; z: number } | null {
    const ccx = Math.floor(x / CHUNK_SIZE);
    const ccz = Math.floor(z / CHUNK_SIZE);
    for (let r = 0; r <= rings; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const cx = ccx + dx;
          const cz = ccz + dz;
          const a = this.generateChunk(cx, cz);
          const at = (lx: number, y: number, lz: number): number => (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT ? B.STONE : a[blockIndex(lx, y, lz)]);
          for (let y = kind === 'lava' ? 5 : 14; y <= (kind === 'lava' ? 10 : 56); y++) {
            for (let lz = 3; lz < CHUNK_SIZE - 3; lz++) {
              for (let lx = 3; lx < CHUNK_SIZE - 3; lx++) {
                if (kind === 'lava') {
                  if (at(lx, y, lz) === B.LAVA && at(lx, y + 1, lz) === B.AIR && at(lx + 1, y, lz) === B.LAVA && at(lx, y, lz + 1) === B.LAVA) {
                    return { x: cx * CHUNK_SIZE + lx, y, z: cz * CHUNK_SIZE + lz };
                  }
                  continue;
                }
                if (at(lx, y, lz) !== B.AIR || !IS_SOLID[at(lx, y - 1, lz)]) continue;
                let open = 0;
                for (let k = 0; k < 3; k++) for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (at(lx + i, y + k, lz + j) === B.AIR) open++;
                if (open >= 70) return { x: cx * CHUNK_SIZE + lx, y, z: cz * CHUNK_SIZE + lz };
              }
            }
          }
        }
      }
    }
    return null;
  }

  /**
   * The land at a column: its height and biome (and the temperature band and climate that tinted the grass). Heights come
   * from `terrain.ts`; the columns of a chunk are worked out together and remembered, since a chunk asks about its
   * neighbours' columns many times (trees, ponds, villages).
   */
  columnAt(wx: number, wz: number): Column {
    const x = Math.floor(wx);
    const z = Math.floor(wz);
    const cx = x >> 4;
    const cz = z >> 4;
    const key = (cx + 32768) * 65536 + (cz + 32768);
    let cc = this.columns.get(key);
    if (!cc) {
      // A lone question about a far-off chunk (a village site, a temple) is answered for that column alone; a chunk that
      // keeps being asked about is worked out whole. Both give exactly the same numbers.
      const n = (this.touched.get(key) ?? 0) + 1;
      if (n < 6) {
        if (this.touched.size > 20000) this.touched.clear();
        this.touched.set(key, n);
        const o = this.sampleOut;
        this.terrain.sample(x, z, o);
        return { height: o.height, biome: o.biome as BiomeId, heat: o.heat, t: Math.round(o.t * 255) / 255, h: Math.round(o.h * 255) / 255 };
      }
      cc = this.columnChunk(cx, cz);
    }
    const i = (z & 15) * CHUNK_SIZE + (x & 15);
    return { height: cc.height[i], biome: cc.biome[i] as BiomeId, heat: cc.heat[i], t: cc.t[i] / 255, h: cc.h[i] / 255 };
  }

  private columnChunk(cx: number, cz: number): ColumnChunk {
    const key = (cx + 32768) * 65536 + (cz + 32768);
    let cc = this.columns.get(key);
    if (cc) return cc;
    cc = {
      height: new Int16Array(CHUNK_SIZE * CHUNK_SIZE),
      biome: new Uint8Array(CHUNK_SIZE * CHUNK_SIZE),
      heat: new Uint8Array(CHUNK_SIZE * CHUNK_SIZE),
      t: new Uint8Array(CHUNK_SIZE * CHUNK_SIZE),
      h: new Uint8Array(CHUNK_SIZE * CHUNK_SIZE),
    };
    const o = newColumnData();
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        this.terrain.sample(cx * CHUNK_SIZE + lx, cz * CHUNK_SIZE + lz, o);
        const i = lz * CHUNK_SIZE + lx;
        cc.height[i] = o.height;
        cc.biome[i] = o.biome;
        cc.heat[i] = o.heat;
        cc.t[i] = Math.round(o.t * 255);
        cc.h[i] = Math.round(o.h * 255);
      }
    }
    if (this.columns.size > 3000) this.columns.clear();
    this.columns.set(key, cc);
    return cc;
  }

  /** Solid, dry ground under (x, y + 1) with room above, even where a cave breaks through the surface. */
  protected isSafeSpot(x: number, y: number, z: number): boolean {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const a = this.generateChunk(cx, cz);
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    if (lx < 2 || lx >= CHUNK_SIZE - 2 || lz < 2 || lz >= CHUNK_SIZE - 2) return false;
    // Firm footing, and open sky around (no tree, no cave mouth, no rock face) within two blocks.
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1 && !IS_SOLID[a[blockIndex(lx + dx, y, lz + dz)]]) return false;
        for (let k = 1; k <= 3; k++) if (a[blockIndex(lx + dx, y + k, lz + dz)] !== B.AIR) return false;
      }
    }
    return true;
  }

  /** Finds a dry-land spawn point by spiralling out from the origin. */
  findSpawn(): { x: number; y: number; z: number } {
    const known = SPAWN_CACHE.get(this.seed);
    if (known) return { ...known };
    const found = this.searchSpawn();
    if (SPAWN_CACHE.size > 64) SPAWN_CACHE.clear();
    SPAWN_CACHE.set(this.seed, found);
    return { ...found };
  }

  /**
   * Where the n-th player to arrive starts. An ordinary world has one spawn for all; the Adventure world has a
   * paved square where everybody arrives, each on a block of their own.
   */
  spawnFor(_slot: number): { x: number; y: number; z: number } {
    return this.findSpawn();
  }

  /** Where a brand-new character is put down: the same as `spawnFor`, except in the Adventure world (which wakes them in the cave under the village). */
  startFor(slot: number): { x: number; y: number; z: number } {
    return this.spawnFor(slot);
  }

  /** The made people of this world and where they stand (none in an ordinary one). */
  npcStations(): readonly NpcStation[] {
    return [];
  }

  /** The training dummies of this world (none in an ordinary one). */
  dummyStations(): readonly DummyStation[] {
    return [];
  }

  /** The id of the named place (see `ZONES`) a point is in, if any. */
  zoneAt(_x: number, _y: number, _z: number): string | null {
    return null;
  }

  /**
   * Is this column in a place that monsters keep out of (a village)? With a margin, the ground around it as well,
   * where none are born. No such place in an ordinary world.
   */
  safeFromMonsters(_x: number, _z: number, _margin = 0): boolean {
    return false;
  }

  // ---- instanced places --------------------------------------------------------------------------
  // A world can hold copies of a made place far from the land (a dungeon), one for each player or group that
  // goes in. Copy number `slot` is generated like any other part of the world, so clients and the server agree
  // on it; the realm hands the copies out, empties them when their people have gone, and the world never saves
  // them. An ordinary world has none.

  /** How many copies the world has room for. */
  instanceCount(): number {
    return 0;
  }

  /** The copy that holds this column, or -1 (the open land). */
  instanceAt(_x: number, _z: number): number {
    return -1;
  }

  /**
   * What a player needs to go into the dungeon: a minimum level, and/or an item (a key dropped by a monster, say)
   * that is used up when a new copy is opened. None means anybody may enter.
   */
  instanceRequirement(): InstanceRequirement | null {
    return null;
  }

  /** Where a player arrives in a copy. */
  instanceEntry(_slot: number): { x: number; y: number; z: number; yaw: number } | null {
    return null;
  }

  /** Where a player who leaves a copy by its portal comes out, in the open land. */
  instanceExit(): { x: number; y: number; z: number; yaw: number } | null {
    return null;
  }

  /** The region of the world a copy takes up, as block coordinates (x1, z1 and y1 are inclusive). */
  instanceBounds(_slot: number): { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number } | null {
    return null;
  }

  /** What a monster cage makes (the cages of a copy are all told apart here); null leaves it to the usual rules. */
  spawnerAt(x: number, y: number, z: number): MobKind | null {
    return this.structures.spawnerAt(x, y, z);
  }

  /**
   * Is this block part of a place that players may not change (a village, a dungeon)? Only creative-mode players
   * (operators, online) can edit it; explosions, fire and flowing water leave it alone too. None in an ordinary world.
   */
  isProtected(_x: number, _y: number, _z: number): boolean {
    return false;
  }

  /**
   * Put the protected places back as the generator makes them, in a saved chunk (`data`, changed in place): a world that was
   * saved before a made place was rebuilt (a village that got a cave under it) would otherwise keep the old one for ever.
   * Returns whether anything was replaced.
   */
  mendProtected(cx: number, cz: number, data: Uint16Array): boolean {
    let fresh: Uint16Array | null = null;
    let mended = false;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        if (!this.isProtected(cx * CHUNK_SIZE + lx, 1, cz * CHUNK_SIZE + lz)) continue;
        fresh ??= this.generateChunk(cx, cz);
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          const i = blockIndex(lx, y, lz);
          if (data[i] !== fresh[i]) {
            data[i] = fresh[i];
            mended = true;
          }
        }
      }
    }
    return mended;
  }

  private searchSpawn(): { x: number; y: number; z: number } {
    for (let r = 0; r < 4000; r += 8) {
      const steps = Math.max(1, Math.floor((r * 2 * Math.PI) / 8));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const x = Math.round(Math.cos(a) * r);
        const z = Math.round(Math.sin(a) * r);
        const col = this.columnAt(x, z);
        if (col.height <= SEA_LEVEL + 2 || NO_SPAWN.has(col.biome)) continue;
        // Cheap look at the surroundings first: building a chunk to test every candidate is slow.
        let flat = true;
        for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, -2]]) {
          if (Math.abs(this.columnAt(x + dx, z + dz).height - col.height) > 1) {
            flat = false;
            break;
          }
        }
        if (flat && this.isSafeSpot(x, col.height, z)) {
          return { x: x + 0.5, y: col.height + 1, z: z + 0.5 };
        }
      }
    }
    return { x: 0.5, y: SEA_LEVEL + 10, z: 0.5 };
  }

  /** What fills a cell that was cut out of the rock: lava deep down, water in flooded caves, else air. */
  private caveFluid(wx: number, y: number, wz: number): number {
    if (y <= LAVA_LEVEL) return B.LAVA;
    const n = this.nAquifer.noise2(wx / 70, wz / 70);
    if (n > 0.3 && y <= 14 + Math.floor((n - 0.3) * 40)) return B.WATER;
    return B.AIR;
  }

  /**
   * The caves of the noise, three kinds of them as in the original's 1.18: "spaghetti" (two fields both near zero make a tube,
   * wider in some places than in others), "noodles" (the same idea on a finer grain: passages a block or two wide that wind
   * about between the rooms), and "cheese" (one field very high makes a hall; halls are larger in the lush and dripstone
   * country, where there is something to see in them).
   */
  private noiseCave(wx: number, y: number, wz: number, cheese: number): boolean {
    const c1 = this.nCave1.noise3(wx * 0.035, y * 0.055, wz * 0.035);
    const a1 = Math.abs(c1);
    if (a1 < 0.1) {
      const c2 = this.nCave2.noise3(wx * 0.035 + 100, y * 0.055, wz * 0.035 + 100);
      const w = 0.045 + 0.05 * (0.5 + 0.5 * this.nWide.noise3(wx * 0.02, y * 0.03, wz * 0.02));
      if (a1 < w && Math.abs(c2) < w) return true;
    }
    if (y < 72) {
      const n1 = this.nNoodleA.noise3(wx * 0.07, y * 0.07, wz * 0.07);
      if (Math.abs(n1) < 0.04 && Math.abs(this.nNoodleB.noise3(wx * 0.07 + 200, y * 0.07, wz * 0.07 + 200)) < 0.04) return true;
    }
    return y < 80 && this.nCavern.noise3(wx * 0.02, y * 0.035, wz * 0.02) > cheese;
  }

  /** Stone, or deepslate in the depths (with a ragged border between the two). */
  private rock(y: number, wx: number, wz: number): number {
    if (y >= 24) return B.STONE;
    if (y <= 6) return B.DEEPSLATE;
    return hash2(this.seed + 55 + y, wx, wz) < (24 - y) / 18 ? B.DEEPSLATE : B.STONE;
  }

  generateChunk(cx: number, cz: number): Uint16Array {
    const blocks = new Uint16Array(CHUNK_VOLUME);
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    const seed = this.seed;
    // The columns of the chunk and a one block ring around it (for the carvers and for the slope of the ground).
    const PAD = CHUNK_SIZE + 2;
    const heights = new Int16Array(PAD * PAD);
    const cols: Column[] = new Array(PAD * PAD);
    for (let lz = -1; lz <= CHUNK_SIZE; lz++) {
      for (let lx = -1; lx <= CHUNK_SIZE; lx++) {
        const col = this.columnAt(ox + lx, oz + lz);
        heights[(lz + 1) * PAD + lx + 1] = col.height;
        cols[(lz + 1) * PAD + lx + 1] = col;
      }
    }

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx;
        const wz = oz + lz;
        const at = (lz + 1) * PAD + lx + 1;
        const col = cols[at];
        const h = col.height;
        const hn = heights[at - PAD];
        const hs = heights[at + PAD];
        const hw = heights[at - 1];
        const he = heights[at + 1];
        const slope = Math.max(Math.abs(h - hn), Math.abs(h - hs), Math.abs(h - hw), Math.abs(h - he));
        const shore = h <= SEA_LEVEL + 1 && (hn < SEA_LEVEL || hs < SEA_LEVEL || hw < SEA_LEVEL || he < SEA_LEVEL);
        const ground = this.rules.ground(col.biome, wx, wz, h, slope, shore, col.t ?? 0.5);
        const sandTop = ground.top === B.RED_SAND ? B.RED_SAND : B.SAND;
        const sandRock = ground.top === B.RED_SAND ? B.RED_SANDSTONE : B.SANDSTONE;
        // Under lush and dripstone country the halls grow bigger.
        const cheese = this.decor.zoneAt(wx, wz) === CaveZone.PLAIN ? 0.62 : 0.54;

        for (let y = 0; y <= h; y++) {
          let id: number;
          if (y === 0) {
            id = B.BEDROCK;
          } else if (y <= 3 && hash2(seed + y, wx, wz) < (4 - y) / 4) {
            id = B.BEDROCK;
          } else if (y === h) {
            id = ground.top;
          } else if (ground.sandy && y > h - 3) {
            id = sandTop;
          } else if (ground.strata && y > h - 40 && y >= SEA_LEVEL - 8) {
            id = strataAt(y);
          } else if (ground.sandy && y > h - 8) {
            id = sandRock;
          } else if (y > h - 4) {
            id = ground.sub;
          } else {
            id = this.rock(y, wx, wz);
          }

          // Noise caves stay below the surface; the worm carvers below are the ones that breach it.
          if (id !== B.BEDROCK && y > 4 && y < h - 3 && this.noiseCave(wx, y, wz, cheese)) id = this.caveFluid(wx, y, wz);
          blocks[blockIndex(lx, y, lz)] = id;
        }

        for (let y = h + 1; y <= SEA_LEVEL; y++) {
          blocks[blockIndex(lx, y, lz)] = B.WATER;
        }
        // The frozen seas and rivers wear a sheet of ice with a few cracks and floes of packed ice.
        if (h < SEA_LEVEL && (col.biome === Biome.FROZEN_OCEAN || col.biome === Biome.FROZEN_RIVER)) {
          const floe = hash2(seed + 312, wx >> 2, wz >> 2) < 0.1;
          if (hash2(seed + 313, wx, wz) < 0.96) blocks[blockIndex(lx, SEA_LEVEL, lz)] = floe ? B.PACKED_ICE : B.ICE;
        }
      }
    }

    this.carve(blocks, heights, cx, cz);
    this.decor.seal(blocks, cx, cz);
    this.placeOres(blocks, cx, cz);
    this.placeBlobs(blocks, cx, cz);
    this.decor.placeGeodes(blocks, cx, cz);
    // The monster rooms and mineshafts go in before the caves are dressed, so that nothing is left hanging over a room that cut it.
    this.structures.apply(blocks, cx, cz);
    this.decor.decorate(blocks, heights, cx, cz);
    this.decor.caches(blocks, cx, cz);
    this.placeLakes(blocks, cx, cz);
    this.vegetation.placeTrees(blocks, cx, cz);
    this.vegetation.placeFeatures(blocks, cx, cz);
    this.vegetation.placePlants(blocks, cx, cz);
    this.villages.apply(blocks, cx, cz);
    // Castles last: they clear their own ground, so no tree or house is left standing through them.
    this.structures.applyCastles(blocks, cx, cz);
    return blocks;
  }

  /**
   * Cut the winding tunnels, rooms and ravines out of the rock. Nothing is cut next to open water
   * (there is no flowing water, so a hole would leave a wall of it hanging in the air), and the top
   * block under a possible tree is spared so trees never float over an entrance.
   */
  private carve(blocks: Uint16Array, heights: Int16Array, cx: number, cz: number): void {
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    const PAD = CHUNK_SIZE + 2;
    const seed = this.seed;
    const wet = (lx: number, lz: number, y: number): boolean => {
      if (y > SEA_LEVEL) return false;
      const h = heights[(lz + 1) * PAD + lx + 1];
      return h < SEA_LEVEL && y > h;
    };
    for (const s of this.carver.spheresFor(cx, cz)) {
      const x0 = Math.max(0, Math.floor(s.x - s.rh) - ox);
      const x1 = Math.min(CHUNK_SIZE - 1, Math.ceil(s.x + s.rh) - ox);
      const z0 = Math.max(0, Math.floor(s.z - s.rh) - oz);
      const z1 = Math.min(CHUNK_SIZE - 1, Math.ceil(s.z + s.rh) - oz);
      const y0 = Math.max(5, Math.floor(s.y - s.rv));
      const y1 = Math.min(WORLD_HEIGHT - 2, Math.ceil(s.y + s.rv));
      for (let lz = z0; lz <= z1; lz++) {
        const dz = (oz + lz + 0.5 - s.z) / s.rh;
        for (let lx = x0; lx <= x1; lx++) {
          const dx = (ox + lx + 0.5 - s.x) / s.rh;
          const flat = dx * dx + dz * dz;
          if (flat >= 1) continue;
          const h = heights[(lz + 1) * PAD + lx + 1];
          for (let y = y0; y <= y1; y++) {
            const dy = (y + 0.5 - s.y) / s.rv;
            // The floor is kept flat: nothing is cut far below the middle of the ellipsoid.
            if (dy <= -0.7 || flat + dy * dy >= 1) continue;
            const i = blockIndex(lx, y, lz);
            const cur = blocks[i];
            if (cur === B.AIR || cur === B.BEDROCK || cur === B.WATER || cur === B.LAVA) continue;
            if (y > h) continue;
            if (y === h && hash2(seed + 77, ox + lx, oz + lz) < 0.04) continue;
            if (y < WORLD_HEIGHT - 1 && blocks[blockIndex(lx, y + 1, lz)] === B.WATER) continue;
            if (wet(lx - 1, lz, y) || wet(lx + 1, lz, y) || wet(lx, lz - 1, y) || wet(lx, lz + 1, y)) continue;
            blocks[i] = this.caveFluid(ox + lx, y, oz + lz);
          }
        }
      }
    }
  }

  /** Round lumps of dirt, granite, diorite, andesite and (deep down) tuff replace stone. */
  private placeBlobs(blocks: Uint16Array, cx: number, cz: number): void {
    const rand = mulberry32(Math.imul(cx, 83492791) ^ Math.imul(cz, 41729957) ^ (this.seed + 5));
    for (const blob of BLOBS) {
      for (let n = 0; n < blob.count; n++) {
        const bx = Math.floor(rand() * CHUNK_SIZE);
        const bz = Math.floor(rand() * CHUNK_SIZE);
        const by = blob.minY + Math.floor(rand() * (blob.maxY - blob.minY));
        const r = 2 + rand() * (blob.radius - 1);
        const ry = r * (0.5 + rand() * 0.4);
        for (let y = Math.floor(by - ry); y <= Math.ceil(by + ry); y++) {
          if (y < 1 || y >= WORLD_HEIGHT) continue;
          for (let z = Math.floor(bz - r); z <= Math.ceil(bz + r); z++) {
            for (let x = Math.floor(bx - r); x <= Math.ceil(bx + r); x++) {
              if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) continue;
              const d = ((x - bx) / r) ** 2 + ((y - by) / ry) ** 2 + ((z - bz) / r) ** 2;
              if (d > 1 || rand() < 0.1) continue;
              const idx = blockIndex(x, y, z);
              const here = blocks[idx];
              if (here === B.STONE || (here === B.DEEPSLATE && blob.id !== B.DIRT)) blocks[idx] = blob.id;
            }
          }
        }
      }
    }
  }

  private placeOres(blocks: Uint16Array, cx: number, cz: number): void {
    const rand = mulberry32(Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ this.seed);
    for (const ore of ORES) {
      for (let v = 0; v < ore.veins; v++) {
        if (ore.chance !== undefined && rand() >= ore.chance) continue;
        let x = Math.floor(rand() * CHUNK_SIZE);
        let z = Math.floor(rand() * CHUNK_SIZE);
        let y = ore.minY + Math.floor(rand() * (ore.maxY - ore.minY));
        const size = Math.max(2, Math.floor(ore.size * (0.5 + rand())));
        for (let i = 0; i < size; i++) {
          const idx = blockIndex(x, y, z);
          if (blocks[idx] === B.STONE || blocks[idx] === B.DEEPSLATE) blocks[idx] = ore.id;
          const axis = Math.floor(rand() * 3);
          const dir = rand() < 0.5 ? -1 : 1;
          if (axis === 0) x = Math.min(CHUNK_SIZE - 1, Math.max(0, x + dir));
          else if (axis === 1) y = Math.min(WORLD_HEIGHT - 1, Math.max(1, y + dir));
          else z = Math.min(CHUNK_SIZE - 1, Math.max(0, z + dir));
        }
      }
    }
  }

  // ---- climate and tint ----------------------------------------------------------------------

  /** Temperature and humidity of a column, each 0..1 (cold/dry .. hot/wet). */
  climateAt(wx: number, wz: number): { t: number; h: number } {
    const out = { t: 0.5, h: 0.5 };
    this.terrain.climate(wx, wz, out);
    return out;
  }

  /**
   * For every column of a chunk (z * 16 + x), what the biome tint needs: the climate packed as temperature * 8 + humidity
   * (a little patchy, so that grass is not one green over a whole country), plus 64 * the water and foliage kind
   * (1 swamp, 2 warm sea, 3 frozen water).
   */
  tintGrid(cx: number, cz: number): Uint8Array {
    const out = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = cx * CHUNK_SIZE + lx;
        const wz = cz * CHUNK_SIZE + lz;
        const { t, h } = this.climateAt(wx, wz);
        const biome = this.columnAt(wx, wz).biome;
        const tt = Math.min(1, Math.max(0, t + this.nTint.noise2(wx / 47 + 71, wz / 47 - 29) * 0.05));
        const hh = Math.min(1, Math.max(0, h + this.nTint.noise2(wx / 19, wz / 19) * 0.16));
        const kind =
          biome === Biome.SWAMP ? 1 : biome === Biome.WARM_OCEAN ? 2 : biome === Biome.FROZEN_OCEAN || biome === Biome.FROZEN_RIVER ? 3 : 0;
        out[lz * CHUNK_SIZE + lx] = Math.min(7, Math.floor(tt * 8)) * 8 + Math.min(7, Math.floor(hh * 8)) + kind * 64;
      }
    }
    return out;
  }

  // ---- lakes -----------------------------------------------------------------------------------

  /**
   * A pond on dry ground: only on flat enough land, never against a drop, so the still water has
   * banks all round. The plan depends on the seed alone, so neighbouring chunks agree on it.
   */
  private lakeInChunk(cx: number, cz: number): LakePlan | null {
    const key = `${cx},${cz}`;
    let p = this.lakes.get(key);
    if (p !== undefined) return p;
    p = this.buildLake(cx, cz);
    if (this.lakes.size > 4000) this.lakes.clear();
    this.lakes.set(key, p);
    return p;
  }

  private buildLake(cx: number, cz: number): LakePlan | null {
    const rand = mulberry32(Math.floor(hash2(this.seed + 740, cx, cz) * 4294967296) | 0);
    if (rand() >= LAKE_CHANCE) return null;
    const x = cx * CHUNK_SIZE + 4 + Math.floor(rand() * 8);
    const z = cz * CHUNK_SIZE + 4 + Math.floor(rand() * 8);
    const rx = 3 + rand() * 3.2;
    const rz = 3 + rand() * 3.2;
    const reach = Math.ceil(Math.max(rx, rz)) + 2;
    const middle = this.columnAt(x, z);
    if (!POND_BIOMES.has(middle.biome)) return null;
    let lo = Infinity;
    let hi = -Infinity;
    for (let dz = -reach; dz <= reach; dz += 1) {
      for (let dx = -reach; dx <= reach; dx += 1) {
        const c = this.columnAt(x + dx, z + dz);
        if (!POND_BIOMES.has(c.biome)) return null;
        lo = Math.min(lo, c.height);
        hi = Math.max(hi, c.height);
      }
    }
    if (lo <= SEA_LEVEL + 2 || hi - lo > 2) return null;
    return { x, z, rx, rz, level: lo, ice: FROZEN_BIOMES.has(middle.biome) };
  }

  /** How far inside the pond a column is: below 1 is water, a little above is its bank. */
  private lakeDepthAt(p: LakePlan, wx: number, wz: number): number {
    const d = ((wx + 0.5 - p.x) / p.rx) ** 2 + ((wz + 0.5 - p.z) / p.rz) ** 2;
    const ragged = 1 + (hash2(this.seed + 741, wx, wz) - 0.5) * 0.4;
    return d / ragged;
  }

  /** Is this column part of a pond (or within `pad` of its edge, in units of the pond's radius)? */
  inLake(wx: number, wz: number, pad = 1): boolean {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const p = this.lakeInChunk(cx + dx, cz + dz);
        if (p && this.lakeDepthAt(p, wx, wz) < pad) return true;
      }
    }
    return false;
  }

  /** The pond closest to a point within `rings` chunks (centre, radii, water level, frozen or not), or null. */
  nearestLake(x: number, z: number, rings = 12): { x: number; z: number; rx: number; rz: number; level: number; ice: boolean } | null {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    let best: LakePlan | null = null;
    let bestD = Infinity;
    for (let r = 0; r <= rings; r++) {
      if (best && Math.max(0, r - 1) * CHUNK_SIZE > Math.sqrt(bestD)) break;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const p = this.lakeInChunk(cx + dx, cz + dz);
          if (!p) continue;
          const d = (p.x - x) ** 2 + (p.z - z) ** 2;
          if (d < bestD) {
            best = p;
            bestD = d;
          }
        }
      }
    }
    return best && { ...best };
  }

  private placeLakes(blocks: Uint16Array, cx: number, cz: number): void {
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const p = this.lakeInChunk(cx + dx, cz + dz);
        if (!p) continue;
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            const wx = ox + lx;
            const wz = oz + lz;
            const depth = this.lakeDepthAt(p, wx, wz);
            if (depth >= 1) {
              // The bank: plug whatever a cave opened beside the water, so the pond never leaks.
              if (depth < 1.7) {
                for (let y = p.level - 3; y <= p.level; y++) {
                  const i = blockIndex(lx, y, lz);
                  if (blocks[i] === B.AIR || blocks[i] === B.LAVA) blocks[i] = y >= p.level - 1 ? B.DIRT : B.STONE;
                }
              }
              continue;
            }
            const h = this.columnAt(wx, wz).height;
            // Clear everything above the water, down to the surface and any tree-free headroom.
            for (let y = p.level + 1; y <= h + 1 && y < WORLD_HEIGHT; y++) blocks[blockIndex(lx, y, lz)] = B.AIR;
            for (let y = p.level - 2; y <= p.level; y++) blocks[blockIndex(lx, y, lz)] = y === p.level && p.ice ? B.ICE : B.WATER;
            // A sealed bed: sand or gravel, whatever a cave left underneath.
            blocks[blockIndex(lx, p.level - 3, lz)] = hash2(this.seed + 742, wx, wz) < 0.3 ? B.GRAVEL : B.SAND;
          }
        }
      }
    }
  }
}
