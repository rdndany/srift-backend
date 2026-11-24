import { B, IS_LEAVES, IS_SOLID } from './blocks';
import { CHUNK_SIZE, WORLD_HEIGHT, blockIndex, chunkKey } from './chunk';
import type { BlockReader } from './physics';
import { growPlants, type PlantChunk } from './plantGrowth';
import type { TreeEditor } from './trees';
import { WorldGenerator } from './worldgen';

/**
 * What the game simulation needs from a world. The browser's streaming, meshing `World` implements
 * it, and so does `HeadlessWorld` (tests, and the authoritative server in Phase 3.5).
 */
export interface WorldAccess extends TreeEditor {
  /** Place a block. Returns false when nothing changed (same block, out of range or not loaded). */
  setBlock(x: number, y: number, z: number, id: number): boolean;
  /** Highest solid, non-leaf block at (x, z), or -1 when the column is not loaded. */
  surfaceY(x: number, z: number): number;
  /** Block reader for physics: terrain that is not loaded yet counts as solid. */
  readonly physicsReader: BlockReader;
  /** Has this chunk been made (or loaded)? Worlds that do not say are taken to have it. */
  hasChunk?(cx: number, cz: number): boolean;
  /** Let go of a chunk that is back to its generated state; it is made again from the generator if it is needed. */
  forgetChunk?(cx: number, cz: number): void;
  /** The chunks that are here now (the Gilded Tide hides its creatures over the land that exists). Worlds that do not say have none to list. */
  chunkCoords?(): { cx: number; cz: number }[];
  growCrops(dt: number, rand?: () => number, onFire?: (x: number, y: number, z: number) => void): number;
}

interface Chunk extends PlantChunk {}

/** A world with no rendering: chunks are generated on demand, synchronously. */
export class HeadlessWorld implements WorldAccess {
  private readonly chunks = new Map<number, Chunk>();

  /** Called for every block that changes (the server turns these into network messages). */
  onChange: ((x: number, y: number, z: number, id: number) => void) | null = null;

  constructor(readonly generator: WorldGenerator) {}

  private chunk(cx: number, cz: number): Chunk {
    const key = chunkKey(cx, cz);
    let c = this.chunks.get(key);
    if (!c) {
      c = { cx, cz, data: this.generator.generateChunk(cx, cz), modified: false };
      this.chunks.set(key, c);
    }
    return c;
  }

  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return B.BEDROCK;
    if (y >= WORLD_HEIGHT) return B.AIR;
    return this.chunk(x >> 4, z >> 4).data[blockIndex(x & 15, y, z & 15)];
  }

  readonly physicsReader: BlockReader = this;

  setBlock(x: number, y: number, z: number, id: number): boolean {
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    const c = this.chunk(x >> 4, z >> 4);
    const idx = blockIndex(x & 15, y, z & 15);
    if (c.data[idx] === id) return false;
    c.data[idx] = id;
    c.modified = true;
    this.onChange?.(x, y, z, id);
    return true;
  }

  surfaceY(x: number, z: number): number {
    const c = this.chunk(x >> 4, z >> 4);
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      const id = c.data[blockIndex(x & 15, y, z & 15)];
      if (IS_SOLID[id] && !IS_LEAVES[id]) return y;
    }
    return 0;
  }

  growCrops(dt: number, rand: () => number = Math.random, onFire?: (x: number, y: number, z: number) => void): number {
    return growPlants(this.chunks.values(), this, dt, rand, onFire);
  }

  hasChunk(cx: number, cz: number): boolean {
    return this.chunks.has(chunkKey(cx, cz));
  }

  forgetChunk(cx: number, cz: number): void {
    this.chunks.delete(chunkKey(cx, cz));
  }

  chunkCoords(): { cx: number; cz: number }[] {
    const out: { cx: number; cz: number }[] = [];
    for (const c of this.chunks.values()) if (this.generator.instanceAt(c.cx * CHUNK_SIZE, c.cz * CHUNK_SIZE) < 0) out.push({ cx: c.cx, cz: c.cz });
    return out;
  }

  /** Chunks that differ from the generator's output, as raw block ids (not the ones of dungeon copies: those are never kept). */
  editedChunks(): { cx: number; cz: number; data: Uint16Array }[] {
    const out: { cx: number; cz: number; data: Uint16Array }[] = [];
    for (const c of this.chunks.values()) if (c.modified && this.generator.instanceAt(c.cx * CHUNK_SIZE, c.cz * CHUNK_SIZE) < 0) out.push({ cx: c.cx, cz: c.cz, data: c.data });
    return out;
  }

  /**
   * Every block that differs from the generated terrain, as [x, y, z, id, ...]. A client that can
   * generate the same terrain from the seed only needs this to see the same world.
   */
  diffAgainstTerrain(): number[] {
    const out: number[] = [];
    for (const c of this.chunks.values()) {
      if (!c.modified) continue;
      const base = this.generator.generateChunk(c.cx, c.cz);
      for (let i = 0; i < c.data.length; i++) {
        if (c.data[i] === base[i]) continue;
        // blockIndex layout: (y * 16 + z) * 16 + x
        out.push(c.cx * CHUNK_SIZE + (i & 15), i >> 8, c.cz * CHUNK_SIZE + ((i >> 4) & 15), c.data[i]);
      }
    }
    return out;
  }

  /** Restore saved edits (raw block ids per chunk). */
  loadEdited(chunks: Iterable<{ cx: number; cz: number; data: Uint16Array }>): void {
    for (const c of chunks) {
      if (c.data.length !== CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT) continue;
      if (this.generator.instanceAt(c.cx * CHUNK_SIZE, c.cz * CHUNK_SIZE) >= 0) continue; // a dungeon copy left over from an earlier run
      this.chunks.set(chunkKey(c.cx, c.cz), { cx: c.cx, cz: c.cz, data: c.data, modified: true });
    }
  }
}
