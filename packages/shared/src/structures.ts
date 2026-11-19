import { B, IS_SOLID, ladderId, woolId } from './blocks';
import { Biome } from './biomes';
import { CHUNK_SIZE, SEA_LEVEL, WORLD_HEIGHT, blockIndex } from './chunk';
import type { LootTableName } from './loot';
import { hash2, mulberry32 } from './noise';

/**
 * Underground structures: monster rooms (dungeons) with a spawner and chests, and abandoned
 * mineshafts with timber supports, torches and supply chests.
 *
 * Like villages, every structure is a plan that depends only on the seed: a list of box operations
 * and the positions of its chests. A chunk being generated writes the parts of nearby plans that fall
 * inside it, so a structure that crosses chunk borders comes out whole. Chest contents are not part of
 * the plan: it only names a loot table (see `loot.ts`), and the items are rolled when the chest is
 * first opened.
 */

/** How an operation treats the cells it covers. */
type OpMode =
  /** Overwrite everything. */
  | 'set'
  /** Only replace solid cells, so that a wall leaves gaps where it meets caves. */
  | 'solid'
  /** Only fill cells that are not solid: bridges floors over gaps, lava and water. */
  | 'open';

interface Op {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  id: number;
  mode: OpMode;
}

export type StructureKind = 'dungeon' | 'mineshaft' | 'temple' | 'castle';

/** What a generated spawner cage makes, when it is not the usual zombie / skeleton cage. */
export type SpawnerMob = 'cave_spider';

export interface StructurePlan {
  kind: StructureKind;
  /** A point inside the structure: the dungeon's spawner, or the mineshaft's first corridor. */
  x: number;
  y: number;
  z: number;
  ops: Op[];
  /** Chest positions ("x,y,z") and the loot table each one rolls. */
  chests: Map<string, LootTableName>;
  /** Spawner cages that make something special (the rest are decided by `spawnerKind`). */
  spawners: Map<string, SpawnerMob>;
  /** Horizontal bounds of everything the plan writes. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface StructureTerrain {
  columnAt(x: number, z: number): { height: number; biome: number };
}

const DUNGEON_CHANCE = 0.3;
const MINE_REGION = 128;
const MINE_CHANCE = 0.55;
const TEMPLE_REGION = 192;
const TEMPLE_CHANCE = 0.5;
export const CASTLE_REGION = 320;
const CASTLE_CHANCE = 0.6;
/** Where a castle may stand: open or wooded country, hills, not shores, swamps, deserts or the high bare mountains. */
const CASTLE_BIOMES: ReadonlySet<number> = new Set([
  Biome.PLAINS,
  Biome.FOREST,
  Biome.BIRCH_FOREST,
  Biome.DARK_FOREST,
  Biome.FLOWER_FOREST,
  Biome.TAIGA,
  Biome.SNOWY_TAIGA,
  Biome.OLD_TAIGA,
  Biome.SNOW,
  Biome.MEADOW,
  Biome.CHERRY_GROVE,
  Biome.SAVANNA,
  Biome.WINDSWEPT_HILLS,
]);
/** Plans are rebuilt on demand, so a long session only ever keeps this many of each. */
const PLAN_CACHE_LIMIT = 6000;

const posKey = (x: number, y: number, z: number): string => `${x},${y},${z}`;

class PlanBuilder {
  readonly ops: Op[] = [];
  readonly chests = new Map<string, LootTableName>();
  readonly spawners = new Map<string, SpawnerMob>();
  minX = Infinity;
  maxX = -Infinity;
  minZ = Infinity;
  maxZ = -Infinity;

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number, mode: OpMode = 'set'): void {
    const op = {
      x0: Math.min(x0, x1),
      x1: Math.max(x0, x1),
      y0: Math.min(y0, y1),
      y1: Math.max(y0, y1),
      z0: Math.min(z0, z1),
      z1: Math.max(z0, z1),
      id,
      mode,
    };
    this.ops.push(op);
    this.minX = Math.min(this.minX, op.x0);
    this.maxX = Math.max(this.maxX, op.x1);
    this.minZ = Math.min(this.minZ, op.z0);
    this.maxZ = Math.max(this.maxZ, op.z1);
  }

  block(x: number, y: number, z: number, id: number): void {
    this.box(x, y, z, x, y, z, id);
  }

  chest(x: number, y: number, z: number, table: LootTableName): void {
    this.block(x, y, z, B.CHEST);
    this.chests.set(posKey(x, y, z), table);
  }

  spawner(x: number, y: number, z: number, mob: SpawnerMob): void {
    this.block(x, y, z, B.SPAWNER);
    this.spawners.set(posKey(x, y, z), mob);
  }

  finish(kind: StructureKind, x: number, y: number, z: number): StructurePlan {
    return { kind, x, y, z, ops: this.ops, chests: this.chests, spawners: this.spawners, minX: this.minX, maxX: this.maxX, minZ: this.minZ, maxZ: this.maxZ };
  }
}

export class StructureGenerator {
  private dungeons = new Map<string, StructurePlan | null>();
  private mines = new Map<string, StructurePlan | null>();
  private temples = new Map<string, StructurePlan | null>();
  private castles = new Map<string, StructurePlan | null>();
  /** A world that has its own buildings can keep a castle from a spot (a village is already there, say). */
  vetoCastle: ((x: number, z: number) => boolean) | null = null;

  constructor(
    private readonly seed: number,
    private readonly terrain: StructureTerrain,
  ) {}

  // ---- queries ---------------------------------------------------------------

  /** The monster room that starts in a chunk, if any. */
  dungeonInChunk(cx: number, cz: number): StructurePlan | null {
    const key = `${cx},${cz}`;
    let p = this.dungeons.get(key);
    if (p === undefined) {
      p = this.buildDungeon(cx, cz);
      if (this.dungeons.size >= PLAN_CACHE_LIMIT) this.dungeons.clear();
      this.dungeons.set(key, p);
    }
    return p;
  }

  /** The mineshaft of one 128-block region, if it has one. */
  mineshaftInRegion(rx: number, rz: number): StructurePlan | null {
    const key = `${rx},${rz}`;
    let p = this.mines.get(key);
    if (p === undefined) {
      p = this.buildMineshaft(rx, rz);
      if (this.mines.size >= PLAN_CACHE_LIMIT) this.mines.clear();
      this.mines.set(key, p);
    }
    return p;
  }

  /** The desert temple of one region, if it has one. */
  templeInRegion(rx: number, rz: number): StructurePlan | null {
    const key = `${rx},${rz}`;
    let p = this.temples.get(key);
    if (p === undefined) {
      p = this.buildTemple(rx, rz);
      if (this.temples.size >= PLAN_CACHE_LIMIT) this.temples.clear();
      this.temples.set(key, p);
    }
    return p;
  }

  /** The castle of one 320-block region, if it has one. */
  castleInRegion(rx: number, rz: number): StructurePlan | null {
    const key = `${rx},${rz}`;
    let p = this.castles.get(key);
    if (p === undefined) {
      p = this.buildCastle(rx, rz);
      if (this.castles.size >= PLAN_CACHE_LIMIT) this.castles.clear();
      this.castles.set(key, p);
    }
    return p;
  }

  /** The special mob a generated spawner makes, or null for an ordinary (or no) spawner. */
  spawnerAt(x: number, y: number, z: number): SpawnerMob | null {
    const key = posKey(x, y, z);
    const rx = Math.floor(x / MINE_REGION);
    const rz = Math.floor(z / MINE_REGION);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const m = this.mineshaftInRegion(rx + dx, rz + dz);
        const s = m?.spawners.get(key);
        if (s) return s;
      }
    }
    return null;
  }

  /** The loot table of the generated chest at a position, or null for any other chest. */
  lootAt(x: number, y: number, z: number): LootTableName | null {
    const key = posKey(x, y, z);
    const d = this.dungeonInChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    const fromDungeon = d?.chests.get(key);
    if (fromDungeon) return fromDungeon;
    const rx = Math.floor(x / MINE_REGION);
    const rz = Math.floor(z / MINE_REGION);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const m = this.mineshaftInRegion(rx + dx, rz + dz);
        const t = m?.chests.get(key);
        if (t) return t;
      }
    }
    const tx = Math.floor(x / TEMPLE_REGION);
    const tz = Math.floor(z / TEMPLE_REGION);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const t = this.templeInRegion(tx + dx, tz + dz)?.chests.get(key);
        if (t) return t;
      }
    }
    const kx = Math.floor(x / CASTLE_REGION);
    const kz = Math.floor(z / CASTLE_REGION);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const t = this.castleInRegion(kx + dx, kz + dz)?.chests.get(key);
        if (t) return t;
      }
    }
    return null;
  }

  /** Spiral outwards from a point for the nearest structure of a kind (tests and the debug hooks). */
  nearest(kind: StructureKind, x: number, z: number, rings = 14): StructurePlan | null {
    let best: StructurePlan | null = null;
    let bestD = Infinity;
    if (kind === 'dungeon') {
      const cx = Math.floor(x / CHUNK_SIZE);
      const cz = Math.floor(z / CHUNK_SIZE);
      for (let r = 0; r <= rings; r++) {
        if (best && Math.max(0, r - 1) * CHUNK_SIZE > Math.sqrt(bestD)) break;
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            const p = this.dungeonInChunk(cx + dx, cz + dz);
            if (!p) continue;
            const d = (p.x - x) ** 2 + (p.z - z) ** 2;
            if (d < bestD) {
              bestD = d;
              best = p;
            }
          }
        }
      }
      return best;
    }
    const size = kind === 'castle' ? CASTLE_REGION : kind === 'temple' ? TEMPLE_REGION : MINE_REGION;
    const sparse = kind === 'temple' || kind === 'castle';
    const rx = Math.floor(x / size);
    const rz = Math.floor(z / size);
    for (let r = 0; r <= Math.ceil(rings / (sparse ? 2 : 4)); r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const p =
            kind === 'castle'
              ? this.castleInRegion(rx + dx, rz + dz)
              : kind === 'temple'
                ? this.templeInRegion(rx + dx, rz + dz)
                : this.mineshaftInRegion(rx + dx, rz + dz);
          if (!p) continue;
          const d = (p.x - x) ** 2 + (p.z - z) ** 2;
          if (d < bestD) {
            bestD = d;
            best = p;
          }
        }
      }
      if (best && (r >= 1 || sparse)) break;
    }
    return best;
  }

  // ---- generation --------------------------------------------------------------

  /** Write every part of a nearby structure that lies inside chunk (cx, cz). */
  apply(blocks: Uint16Array, cx: number, cz: number): void {
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    const d = this.dungeonInChunk(cx, cz);
    if (d) this.write(blocks, d, ox, oz);
    const rx = Math.floor(ox / MINE_REGION);
    const rz = Math.floor(oz / MINE_REGION);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const m = this.mineshaftInRegion(rx + dx, rz + dz);
        if (m && m.maxX >= ox && m.minX < ox + CHUNK_SIZE && m.maxZ >= oz && m.minZ < oz + CHUNK_SIZE) this.write(blocks, m, ox, oz);
      }
    }
    const tx = Math.floor(ox / TEMPLE_REGION);
    const tz = Math.floor(oz / TEMPLE_REGION);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const t = this.templeInRegion(tx + dx, tz + dz);
        if (t && t.maxX >= ox && t.minX < ox + CHUNK_SIZE && t.maxZ >= oz && t.minZ < oz + CHUNK_SIZE) this.write(blocks, t, ox, oz);
      }
    }
  }

  /**
   * Write the castles that reach into chunk (cx, cz). Done after trees and villages, so nothing
   * grows through the walls and the castle clears its own ground.
   */
  applyCastles(blocks: Uint16Array, cx: number, cz: number): void {
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    const kx = Math.floor(ox / CASTLE_REGION);
    const kz = Math.floor(oz / CASTLE_REGION);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.castleInRegion(kx + dx, kz + dz);
        if (c && c.maxX >= ox && c.minX < ox + CHUNK_SIZE && c.maxZ >= oz && c.minZ < oz + CHUNK_SIZE) this.write(blocks, c, ox, oz);
      }
    }
  }

  private write(blocks: Uint16Array, plan: StructurePlan, ox: number, oz: number): void {
    for (const op of plan.ops) {
      const x0 = Math.max(op.x0, ox);
      const x1 = Math.min(op.x1, ox + CHUNK_SIZE - 1);
      const z0 = Math.max(op.z0, oz);
      const z1 = Math.min(op.z1, oz + CHUNK_SIZE - 1);
      const y0 = Math.max(op.y0, 1);
      const y1 = Math.min(op.y1, WORLD_HEIGHT - 1);
      if (x0 > x1 || z0 > z1 || y0 > y1) continue;
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          for (let x = x0; x <= x1; x++) {
            const i = blockIndex(x - ox, y, z - oz);
            const cur = blocks[i];
            if (cur === B.BEDROCK) continue;
            if (op.mode === 'solid' && !IS_SOLID[cur]) continue;
            if (op.mode === 'open' && IS_SOLID[cur]) continue;
            // Never cut a hole into the bottom of a sea or a lake.
            if (op.id === B.AIR && y < WORLD_HEIGHT - 1 && blocks[i + CHUNK_SIZE * CHUNK_SIZE] === B.WATER) continue;
            blocks[i] = op.id;
          }
        }
      }
    }
  }

  // ---- dungeons ------------------------------------------------------------------

  private buildDungeon(cx: number, cz: number): StructurePlan | null {
    const rand = mulberry32(Math.floor(hash2(this.seed + 710, cx, cz) * 2147483647));
    if (rand() >= DUNGEON_CHANCE) return null;
    // The centre is kept 4..11 blocks into the chunk so the whole room (and its walls) stays inside it.
    const hx = 2 + Math.floor(rand() * 2);
    const hz = 2 + Math.floor(rand() * 2);
    const x = cx * CHUNK_SIZE + 4 + Math.floor(rand() * 8);
    const z = cz * CHUNK_SIZE + 4 + Math.floor(rand() * 8);
    const y = 12 + Math.floor(rand() * 38);

    // Under dry land with plenty of rock overhead.
    for (const [dx, dz] of [[0, 0], [-hx - 1, -hz - 1], [hx + 1, -hz - 1], [-hx - 1, hz + 1], [hx + 1, hz + 1]]) {
      const h = this.terrain.columnAt(x + dx, z + dz).height;
      if (h < y + 8 || h <= SEA_LEVEL + 2) return null;
    }

    const b = new PlanBuilder();
    const x0 = x - hx;
    const x1 = x + hx;
    const z0 = z - hz;
    const z1 = z + hz;
    // Walls and ceiling only replace rock: where a cave runs past, the room opens into it.
    b.box(x0 - 1, y - 1, z0 - 1, x1 + 1, y + 4, z1 + 1, B.COBBLE, 'solid');
    b.box(x0, y, z0, x1, y + 3, z1, B.AIR);
    for (let fz = z0; fz <= z1; fz++) {
      for (let fx = x0; fx <= x1; fx++) b.block(fx, y - 1, fz, rand() < 0.7 ? B.MOSSY_COBBLE : B.COBBLE);
    }
    b.block(x, y, z, B.SPAWNER);

    // Two chests, each tried a few times, against a wall and not in a corner.
    for (let c = 0; c < 2; c++) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const side = Math.floor(rand() * 4);
        const cxp = side < 2 ? (side === 0 ? x0 : x1) : x0 + 1 + Math.floor(rand() * (x1 - x0 - 1));
        const czp = side >= 2 ? (side === 2 ? z0 : z1) : z0 + 1 + Math.floor(rand() * (z1 - z0 - 1));
        if (b.chests.has(posKey(cxp, y, czp))) continue;
        b.chest(cxp, y, czp, 'dungeon');
        break;
      }
    }
    return b.finish('dungeon', x, y, z);
  }

  // ---- desert temples ----------------------------------------------------------------

  /** A sandstone pyramid on flat desert: a hall, two towers, and a sealed chamber of chests underneath. */
  private buildTemple(rx: number, rz: number): StructurePlan | null {
    const rand = mulberry32(Math.floor(hash2(this.seed + 730, rx, rz) * 2147483647));
    if (rand() >= TEMPLE_CHANCE) return null;
    const half = 7;
    const cx = rx * TEMPLE_REGION + 24 + Math.floor(rand() * (TEMPLE_REGION - 48));
    const cz = rz * TEMPLE_REGION + 24 + Math.floor(rand() * (TEMPLE_REGION - 48));
    let lo = Infinity;
    let hi = -Infinity;
    for (const dx of [-half, 0, half]) {
      for (const dz of [-half, 0, half]) {
        const c = this.terrain.columnAt(cx + dx, cz + dz);
        if (c.biome !== Biome.DESERT) return null;
        lo = Math.min(lo, c.height);
        hi = Math.max(hi, c.height);
      }
    }
    if (hi - lo > 6 || lo <= SEA_LEVEL + 2) return null;

    const g = hi;
    const x0 = cx - half;
    const x1 = cx + half;
    const z0 = cz - half;
    const z1 = cz + half;
    const b = new PlanBuilder();
    // A solid base, so the pyramid never hangs over a dip.
    b.box(x0, lo - 4, z0, x1, g - 1, z1, B.SANDSTONE);
    // The stepped pyramid: one flat plate per level.
    for (let k = 0; k <= half; k++) b.box(x0 + k, g + k, z0 + k, x1 - k, g + k, z1 - k, B.SANDSTONE);
    // Bands of carved stone round the middle.
    for (const k of [2, 4]) {
      b.box(x0 + k, g + k, z0 + k, x1 - k, g + k, z0 + k, B.CHISELED_SANDSTONE);
      b.box(x0 + k, g + k, z1 - k, x1 - k, g + k, z1 - k, B.CHISELED_SANDSTONE);
    }
    // Towers at the front corners.
    for (const tx0 of [x0, x1 - 2]) {
      b.box(tx0, g + 1, z0, tx0 + 2, g + 5, z0 + 2, B.SANDSTONE);
      b.box(tx0, g + 5, z0, tx0 + 2, g + 5, z0 + 2, B.CHISELED_SANDSTONE);
    }
    // The hall and the way in.
    b.box(x0 + 4, g + 1, z0 + 4, x1 - 4, g + 3, z1 - 4, B.AIR);
    b.box(cx - 1, g + 1, z0 + 1, cx + 1, g + 2, z0 + 4, B.AIR);
    b.box(cx - 2, g + 1, z0 + 1, cx - 2, g + 2, z0 + 1, B.CHISELED_SANDSTONE);
    b.box(cx + 2, g + 1, z0 + 1, cx + 2, g + 2, z0 + 1, B.CHISELED_SANDSTONE);
    b.block(cx, g + 3, z0 + 4, B.CHISELED_SANDSTONE);
    // A marked slab in the middle of the floor: the secret is underneath.
    b.box(cx - 1, g, cz - 1, cx + 1, g, cz + 1, B.CHISELED_SANDSTONE);
    b.block(cx, g, cz, B.SANDSTONE);
    // The sealed chamber, four chests, and nothing to say how to get in but the marking above.
    b.box(cx - 3, g - 9, cz - 3, cx + 3, g - 4, cz + 3, B.SANDSTONE);
    b.box(cx - 2, g - 8, cz - 2, cx + 2, g - 5, cz + 2, B.AIR);
    b.chest(cx - 2, g - 8, cz, 'temple');
    b.chest(cx + 2, g - 8, cz, 'temple');
    b.chest(cx, g - 8, cz - 2, 'temple');
    b.chest(cx, g - 8, cz + 2, 'temple');
    return b.finish('temple', cx, g, cz);
  }

  // ---- castles ---------------------------------------------------------------------

  /**
   * A walled castle on a grassy mound: a gate in the curtain wall, four corner towers with
   * coloured roofs, and a three-storey keep with a lookout tower. Built in local coordinates
   * (x, z from the centre, y up from the courtyard) and turned to one of four ways.
   */
  private buildCastle(rx: number, rz: number): StructurePlan | null {
    const rand = mulberry32(Math.floor(hash2(this.seed + 750, rx, rz) * 2147483647));
    if (rand() >= CASTLE_CHANCE) return null;
    const cx = rx * CASTLE_REGION + 40 + Math.floor(rand() * (CASTLE_REGION - 80));
    const cz = rz * CASTLE_REGION + 40 + Math.floor(rand() * (CASTLE_REGION - 80));
    const turn = Math.floor(rand() * 4);

    // Fairly level, dry, wooded or open ground under the whole mound.
    let lo = Infinity;
    let hi = -Infinity;
    for (let dz = -16; dz <= 16; dz += 4) {
      for (let dx = -16; dx <= 16; dx += 4) {
        const c = this.terrain.columnAt(cx + dx, cz + dz);
        if (!CASTLE_BIOMES.has(c.biome)) return null;
        lo = Math.min(lo, c.height);
        hi = Math.max(hi, c.height);
      }
    }
    if (lo <= SEA_LEVEL + 2 || hi - lo > 9) return null;
    if (this.vetoCastle?.(cx, cz)) return null;

    /** The level people stand on in the courtyard; the grass of the mound is the layer below. */
    const g = hi + 1;
    const b = new PlanBuilder();
    const rot = (lx: number, lz: number): [number, number] =>
      turn === 0 ? [lx, lz] : turn === 1 ? [-lz, lx] : turn === 2 ? [-lx, -lz] : [lz, -lx];
    const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number, mode: OpMode = 'set'): void => {
      const [ax, az] = rot(x0, z0);
      const [bx, bz] = rot(x1, z1);
      b.box(cx + ax, g + y0, cz + az, cx + bx, g + y1, cz + bz, id, mode);
    };
    const put = (x: number, y: number, z: number, id: number): void => box(x, y, z, x, y, z, id);
    const chest = (x: number, y: number, z: number, table: LootTableName): void => {
      const [ax, az] = rot(x, z);
      b.chest(cx + ax, g + y, cz + az, table);
    };
    /** The ladder index of a ladder whose wall is the local direction (dx, dz). */
    const ladderFor = (dx: number, dz: number): number => {
      const [wx, wz] = rot(dx, dz);
      return ladderId(wx > 0 ? 0 : wx < 0 ? 1 : wz > 0 ? 2 : 3);
    };
    const STONE = B.STONE_BRICKS;
    const RED = woolId(14);
    const BLUE = woolId(11);
    const PURPLE = woolId(10);

    // The mound: a stepped, widening foundation down to the lowest ground, grass on top.
    for (let y = g - 1; y >= lo - 3; y--) {
      const ext = 16 + Math.floor((g - 1 - y) * 0.7);
      box(-ext, y - g, -ext, ext, y - g, ext, y === g - 1 ? B.GRASS : B.DIRT);
    }
    // Everything above it, trees and hills included, is cleared out of the way.
    box(-22, 0, -22, 22, 36, 22, B.AIR);

    // The curtain wall: two thick, seven high, a walkway on top and merlons on the outer edge.
    box(-13, 0, -13, 13, 6, 13, STONE);
    box(-11, 0, -11, 11, 6, 11, B.AIR);
    for (let i = -13; i <= 13; i += 2) {
      put(i, 7, -13, STONE);
      put(i, 7, 13, STONE);
      put(-13, 7, i, STONE);
      put(13, 7, i, STONE);
    }
    // Weathering: moss and cracked stone scattered over the wall faces.
    for (let n = 0; n < 160; n++) {
      const along = Math.floor(rand() * 27) - 13;
      const y = Math.floor(rand() * 8);
      const side = Math.floor(rand() * 4);
      const id = rand() < 0.6 ? B.MOSSY_COBBLE : B.COBBLE;
      if (side === 0) put(along, y, -13, id);
      else if (side === 1) put(along, y, 13, id);
      else if (side === 2) put(-13, y, along, id);
      else put(13, y, along, id);
    }
    // The gate: a tall arch in the wall, a path leading in and a lamp each side.
    box(-1, 0, -13, 1, 3, -12, B.AIR);
    put(-2, 0, -14, B.TORCH);
    put(2, 0, -14, B.TORCH);
    box(-1, -1, -16, 1, -1, -7, B.COBBLE);
    box(-2, 4, -14, 2, 5, -14, RED);

    // The four corner towers.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const tx = 13 * sx;
        const tz = 13 * sz;
        const ix = -sx;
        const iz = -sz;
        box(tx - 3, 0, tz - 3, tx + 3, 14, tz + 3, STONE);
        box(tx - 2, 0, tz - 2, tx + 2, 13, tz + 2, B.AIR);
        box(tx - 2, -1, tz - 2, tx + 2, -1, tz + 2, B.PLANKS);
        box(tx - 2, 6, tz - 2, tx + 2, 6, tz + 2, B.PLANKS);
        for (let n = 0; n < 24; n++) {
          const along = Math.floor(rand() * 7) - 3;
          const y = Math.floor(rand() * 14);
          const id = rand() < 0.5 ? B.MOSSY_COBBLE : B.COBBLE;
          if (rand() < 0.5) put(tx + 3 * (rand() < 0.5 ? 1 : -1), y, tz + along, id);
          else put(tx + along, y, tz + 3 * (rand() < 0.5 ? 1 : -1), id);
        }
        // A ladder up against the outer wall of the tower, through the middle floor.
        box(tx - ix * 2, 0, tz, tx - ix * 2, 12, tz, ladderFor(-ix, 0));
        // A door onto the courtyard, and two openings onto the wall walkway.
        box(tx + ix * 3, 0, tz + iz * 2, tx + ix * 3, 1, tz + iz * 2, B.AIR);
        box(tx + ix * 3, 7, tz + iz, tx + ix * 3, 8, tz + iz, B.AIR);
        box(tx + ix, 7, tz + iz * 3, tx + ix, 8, tz + iz * 3, B.AIR);
        // Arrow slits on the outside, torches inside.
        for (const [wx, wz] of [[tx - ix * 3, tz], [tx, tz - iz * 3]]) {
          box(wx, 9, wz, wx, 10, wz, B.AIR);
          box(wx, 2, wz, wx, 3, wz, B.AIR);
        }
        put(tx + ix, 0, tz + iz, B.TORCH);
        put(tx + ix, 7, tz + iz, B.TORCH);
        // A stepped roof of blue wool, a mast and a red pennant.
        for (let r = 4; r >= 0; r--) box(tx - r, 14 + (4 - r), tz - r, tx + r, 14 + (4 - r), tz + r, BLUE);
        box(tx, 19, tz, tx, 22, tz, B.FENCE);
        box(tx + ix, 21, tz, tx + 2 * ix, 22, tz, RED);
      }
    }

    // The keep.
    box(-6, 0, -6, 6, 14, 6, STONE);
    box(-5, 0, -5, 5, 13, 5, B.AIR);
    box(-5, -1, -5, 5, -1, 5, B.PLANKS);
    box(-5, 5, -5, 5, 5, 5, B.PLANKS);
    box(-5, 10, -5, 5, 10, 5, B.PLANKS);
    for (let n = 0; n < 60; n++) {
      const along = Math.floor(rand() * 13) - 6;
      const y = Math.floor(rand() * 15);
      const id = rand() < 0.6 ? B.MOSSY_COBBLE : B.COBBLE;
      const side = Math.floor(rand() * 4);
      if (side === 0) put(along, y, -6, id);
      else if (side === 1) put(along, y, 6, id);
      else if (side === 2) put(-6, y, along, id);
      else put(6, y, along, id);
    }
    // Merlons round the roof.
    for (let i = -6; i <= 6; i += 2) {
      put(i, 15, -6, STONE);
      put(i, 15, 6, STONE);
      put(-6, 15, i, STONE);
      put(6, 15, i, STONE);
    }
    // The door, with banners either side.
    box(-1, 0, -6, 1, 2, -6, B.AIR);
    box(-2, 3, -7, -2, 8, -7, RED);
    box(2, 3, -7, 2, 8, -7, RED);
    // Tall windows on every side, on each of the three floors.
    for (const y of [2, 7, 11]) {
      for (const along of [-3, 3]) {
        box(along, y, -6, along, y + 1, -6, B.GLASS);
        box(along, y, 6, along, y + 1, 6, B.GLASS);
        box(-6, y, along, -6, y + 1, along, B.GLASS);
        box(6, y, along, 6, y + 1, along, B.GLASS);
      }
    }
    box(0, 7, 6, 0, 8, 6, B.GLASS);
    box(0, 7, -6, 0, 8, -6, B.GLASS);
    // A ladder in the back-left corner, up through both floors and out onto the roof.
    box(-5, 5, 4, -5, 5, 4, B.AIR);
    box(-5, 10, 4, -5, 10, 4, B.AIR);
    box(-5, 14, 4, -5, 14, 4, B.AIR);
    box(-5, 0, 4, -5, 14, 4, ladderFor(-1, 0));
    // Rooms: a library below, a hall with a spare chest, a treasury on top.
    box(2, 0, 5, 5, 1, 5, B.BOOKSHELF);
    box(5, 0, 2, 5, 1, 4, B.BOOKSHELF);
    box(-5, 0, -5, -5, 1, -2, B.BOOKSHELF);
    box(-5, 6, -5, -5, 7, -3, B.BOOKSHELF);
    box(1, 6, 5, 5, 7, 5, B.BOOKSHELF);
    for (const y of [0, 6, 11]) {
      put(-4, y, -4, B.TORCH);
      put(4, y, -4, B.TORCH);
      put(4, y, 4, B.TORCH);
      put(0, y, 4, B.TORCH);
    }
    chest(4, 0, 0, 'dungeon');
    chest(-4, 6, 0, 'dungeon');
    chest(0, 11, -4, 'temple');
    chest(0, 11, 0, 'temple');

    // The lookout: a small tower on the keep's roof, with a ladder, a top room and a purple spire.
    box(-3, 15, -3, 3, 24, 3, STONE);
    box(-2, 15, -2, 2, 23, 2, B.AIR);
    box(-2, 20, -2, 2, 20, 2, B.PLANKS);
    box(0, 15, 3, 0, 16, 3, B.AIR);
    box(-2, 20, 0, -2, 20, 0, B.AIR);
    box(-2, 15, 0, -2, 20, 0, ladderFor(-1, 0));
    for (const y of [17, 22]) {
      box(0, y, -3, 0, y + 1, -3, B.GLASS);
      box(0, y, 3, 0, y + 1, 3, B.GLASS);
      box(-3, y, 0, -3, y + 1, 0, B.GLASS);
      box(3, y, 0, 3, y + 1, 0, B.GLASS);
    }
    put(1, 21, 1, B.TORCH);
    put(-1, 21, -1, B.TORCH);
    for (let r = 4; r >= 0; r--) box(-r, 25 + (4 - r), -r, r, 25 + (4 - r), r, PURPLE);
    box(0, 30, 0, 0, 33, 0, B.FENCE);
    box(1, 32, 0, 3, 33, 0, RED);

    // Lamps along the courtyard's inner wall.
    for (const t of [-8, 0, 8]) {
      put(-10, 0, t, B.TORCH);
      put(10, 0, t, B.TORCH);
    }
    put(0, 0, 10, B.TORCH);
    // A well to one side of the courtyard.
    box(8, 0, -10, 10, 0, -8, B.COBBLE);
    put(9, 0, -9, B.WATER);
    for (const [px, pz] of [[8, -10], [10, -10], [8, -8], [10, -8]]) box(px, 1, pz, px, 2, pz, B.FENCE);
    box(8, 3, -10, 10, 3, -8, B.PLANKS);
    return b.finish('castle', cx, g, cz);
  }

  // ---- mineshafts ------------------------------------------------------------------

  private buildMineshaft(rx: number, rz: number): StructurePlan | null {
    const rand = mulberry32(Math.floor(hash2(this.seed + 720, rx, rz) * 2147483647));
    if (rand() >= MINE_CHANCE) return null;
    const ox = rx * MINE_REGION + 24 + Math.floor(rand() * (MINE_REGION - 48));
    const oz = rz * MINE_REGION + 24 + Math.floor(rand() * (MINE_REGION - 48));
    const y = 14 + Math.floor(rand() * 24);

    // Keep it under land, with solid ground overhead everywhere it can reach.
    for (const [dx, dz] of [[0, 0], [-30, 0], [30, 0], [0, -30], [0, 30]]) {
      const h = this.terrain.columnAt(ox + dx, oz + dz).height;
      if (h < y + 7 || h <= SEA_LEVEL + 1) return null;
    }

    const b = new PlanBuilder();
    const alongX = rand() < 0.5;
    const [dx, dz] = alongX ? [1, 0] : [0, 1];
    const half = 14 + Math.floor(rand() * 10);
    const len = half + 18 + Math.floor(rand() * 18);
    this.corridor(b, rand, ox - dx * half, y, oz - dz * half, dx, dz, len, 0);
    return b.finish('mineshaft', ox, y, oz);
  }

  /** A three-wide, three-tall passage with timber frames every four blocks, and side passages. */
  private corridor(b: PlanBuilder, rand: () => number, x: number, y: number, z: number, dx: number, dz: number, len: number, depth: number): void {
    const ex = x + dx * len;
    const ez = z + dz * len;
    // Perpendicular unit vector.
    const px = dz;
    const pz = dx;
    b.box(x - px, y, z - pz, ex + px, y + 2, ez + pz, B.AIR);
    b.box(x - px, y - 1, z - pz, ex + px, y - 1, ez + pz, B.PLANKS, 'open');

    for (let i = 2; i < len; i += 4) {
      const cx = x + dx * i;
      const cz = z + dz * i;
      b.box(cx - px, y, cz - pz, cx - px, y + 1, cz - pz, B.LOG);
      b.box(cx + px, y, cz + pz, cx + px, y + 1, cz + pz, B.LOG);
      b.box(cx - px, y + 2, cz - pz, cx + px, y + 2, cz + pz, B.PLANKS);
    }
    for (let i = 5; i < len; i += 8) b.block(x + dx * i - px, y, z + dz * i - pz, B.TORCH);

    // A track down the middle, with a gap here and there where it rotted away.
    const rail = dx !== 0 ? B.RAIL_X : B.RAIL_Z;
    for (let i = 0; i <= len; i++) {
      if (rand() < 0.07) continue;
      b.box(x + dx * i, y, z + dz * i, x + dx * i, y, z + dz * i, rail, 'open');
    }
    // Cobwebs hang in the corners and across the passage.
    for (let i = 1; i < len; i++) {
      if (rand() >= 0.16) continue;
      const side = Math.floor(rand() * 3) - 1;
      const up = rand() < 0.6 ? 2 : 1 + Math.floor(rand() * 2);
      b.box(x + dx * i + px * side, y + up, z + dz * i + pz * side, x + dx * i + px * side, y + up, z + dz * i + pz * side, B.COBWEB, 'open');
    }

    if (depth === 0 || rand() < 0.4) {
      const i = 4 * (1 + Math.floor(rand() * Math.max(1, Math.floor((len - 2) / 4))));
      if (i < len) b.chest(x + dx * i + px, y, z + dz * i + pz, 'mineshaft');
    }

    if (depth < 2) {
      for (let i = 10; i < len - 8; i += 8 + Math.floor(rand() * 8)) {
        if (rand() < 0.55) {
          const sign = rand() < 0.5 ? 1 : -1;
          this.corridor(b, rand, x + dx * i, y, z + dz * i, px * sign, pz * sign, 10 + Math.floor(rand() * 14), depth + 1);
        }
      }
    }

    // A wider chamber at the far end, now and then.
    if (rand() < 0.55) {
      b.box(ex - 3, y, ez - 3, ex + 3, y + 3, ez + 3, B.AIR);
      b.box(ex - 3, y - 1, ez - 3, ex + 3, y - 1, ez + 3, B.PLANKS, 'open');
      b.block(ex - 3, y + 3, ez - 3, B.LOG);
      if (rand() < 0.5) {
        // A spider's nest: webs all over the room and a cage that keeps making cave spiders.
        for (let wy = y; wy <= y + 3; wy++) {
          for (let wz = ez - 3; wz <= ez + 3; wz++) {
            for (let wx = ex - 3; wx <= ex + 3; wx++) {
              if (rand() < 0.3) b.box(wx, wy, wz, wx, wy, wz, B.COBWEB, 'open');
            }
          }
        }
        b.spawner(ex, y, ez, 'cave_spider');
      }
      if (rand() < 0.6) b.chest(ex - 2 + Math.floor(rand() * 5), y, ez + (rand() < 0.5 ? -3 : 3), 'mineshaft');
    }
  }
}
