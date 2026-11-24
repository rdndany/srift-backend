import { B } from './blocks';
import { GREYKEEP, buildCastle } from './castle';
import { CHUNK_SIZE, CHUNK_VOLUME, SEA_LEVEL, blockIndex } from './chunk';
import type { LootTableName } from './loot';
import type { WorldKind } from './squareWorld';
import { Biome, WorldGenerator, type Column } from './worldgen';

/** The y of the ground the castle stands on (the grass block under your feet). */
export const CASTLE_GROUND = SEA_LEVEL + 4;
/** Where you arrive: on the grass in front of the bridge, a little south of it (the castle faces south). */
export const CASTLE_SPAWN = { x: 0.5, z: GREYKEEP.z1 + 14 } as const;

interface Op {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  id: number;
}

/**
 * Greykeep on its own: a flat green plain with the castle on it, for the people who make the game to look at, walk through and
 * rebuild (`?world=castle`, or `/world castle` in creative mode). It used to stand north of Dawnwatch in the Adventure world; the
 * town has no castle now, and this is where the castle lives. The plain is endless and free to change, and nothing hostile is born on it.
 */
export class CastleWorldGenerator extends WorldGenerator {
  override readonly kind: WorldKind = 'castle';

  /** The castle's boxes, kept in the order they were drawn (later ones cut into earlier ones) and by chunk, since most chunks touch none of them. */
  private readonly ops = new Map<string, Op[]>();
  private readonly chests = new Map<string, LootTableName>();

  constructor(seed: number) {
    super(seed);
    const put = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number): void => {
      const op: Op = { x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1), id };
      for (let cz = Math.floor(op.z0 / CHUNK_SIZE); cz <= Math.floor(op.z1 / CHUNK_SIZE); cz++) {
        for (let cx = Math.floor(op.x0 / CHUNK_SIZE); cx <= Math.floor(op.x1 / CHUNK_SIZE); cx++) {
          const k = `${cx},${cz}`;
          let list = this.ops.get(k);
          if (!list) this.ops.set(k, (list = []));
          list.push(op);
        }
      }
    };
    buildCastle(CASTLE_GROUND, put, (x, y, z, id, table) => {
      put(x, y, z, x, y, z, id);
      this.chests.set(`${x},${y},${z}`, table);
    });
  }

  override generateChunk(cx: number, cz: number): Uint16Array {
    const blocks = new Uint16Array(CHUNK_VOLUME);
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        blocks[blockIndex(lx, 0, lz)] = B.BEDROCK;
        for (let y = 1; y < CASTLE_GROUND - 3; y++) blocks[blockIndex(lx, y, lz)] = B.STONE;
        for (let y = CASTLE_GROUND - 3; y < CASTLE_GROUND; y++) blocks[blockIndex(lx, y, lz)] = B.DIRT;
        blocks[blockIndex(lx, CASTLE_GROUND, lz)] = B.GRASS;
      }
    }
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    for (const op of this.ops.get(`${cx},${cz}`) ?? []) {
      const x0 = Math.max(op.x0, ox);
      const x1 = Math.min(op.x1, ox + CHUNK_SIZE - 1);
      const z0 = Math.max(op.z0, oz);
      const z1 = Math.min(op.z1, oz + CHUNK_SIZE - 1);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) for (let y = Math.max(1, op.y0); y <= op.y1; y++) blocks[blockIndex(x - ox, y, z - oz)] = op.id;
    }
    return blocks;
  }

  override columnAt(): Column {
    return { height: CASTLE_GROUND, biome: Biome.PLAINS };
  }

  override findSpawn(): { x: number; y: number; z: number } {
    return { x: CASTLE_SPAWN.x, y: CASTLE_GROUND + 1, z: CASTLE_SPAWN.z };
  }

  override zoneAt(x: number, _y: number, z: number): string | null {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    return bx >= GREYKEEP.x0 && bx <= GREYKEEP.x1 && bz >= GREYKEEP.z0 && bz <= GREYKEEP.z1 ? 'greykeep' : null;
  }

  /** A place to look at, not to fight in. */
  override safeFromMonsters(): boolean {
    return true;
  }

  override lootAt(x: number, y: number, z: number): LootTableName | null {
    return this.chests.get(`${x},${y},${z}`) ?? super.lootAt(x, y, z);
  }
}
