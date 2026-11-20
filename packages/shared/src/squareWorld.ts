import { AdventureWorldGenerator } from './adventure';
import { BeyondWorldGenerator } from './beyondWorld';
import { B } from './blocks';
import { CHUNK_SIZE, CHUNK_VOLUME, SEA_LEVEL, blockIndex } from './chunk';
import { ShowcaseWorldGenerator } from './showcaseWorld';
import { Biome, WorldGenerator, type Column } from './worldgen';

/** The kinds of world a save can be: the generated one, the flat square platform, the quest world and the planet beyond. */
export type WorldKind = 'overworld' | 'square' | 'adventure' | 'beyond' | 'showcase';

export const WORLD_KINDS: readonly WorldKind[] = ['overworld', 'square', 'adventure', 'beyond', 'showcase'];

export const isWorldKind = (v: unknown): v is WorldKind => v === 'overworld' || v === 'square' || v === 'adventure' || v === 'beyond' || v === 'showcase';

/** Half the side of the square platform: it spans x and z from -SQUARE_HALF up to SQUARE_HALF - 1. */
export const SQUARE_HALF = 32;
/** The y of the platform's walking surface. */
export const SQUARE_TOP = SEA_LEVEL;

/** Whether a block column lies on the square platform. */
export const onSquare = (x: number, z: number): boolean => x >= -SQUARE_HALF && x < SQUARE_HALF && z >= -SQUARE_HALF && z < SQUARE_HALF;

/**
 * The second world: a 64 x 64 square of stone floating in the void, ringed by a stone-brick border.
 * It is a placeholder for a real second world that comes later; for now it is a blank, safe place
 * to build in (nothing beyond its edge, so step off and you fall out of the world). Everything
 * else about it is the ordinary game: its blocks are saved apart from the overworld's.
 */
export class SquareWorldGenerator extends WorldGenerator {
  override readonly kind: WorldKind = 'square';

  override generateChunk(cx: number, cz: number): Uint16Array {
    const blocks = new Uint16Array(CHUNK_VOLUME);
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = cx * CHUNK_SIZE + lx;
        const wz = cz * CHUNK_SIZE + lz;
        if (!onSquare(wx, wz)) continue;
        const edge = wx === -SQUARE_HALF || wx === SQUARE_HALF - 1 || wz === -SQUARE_HALF || wz === SQUARE_HALF - 1;
        blocks[blockIndex(lx, 0, lz)] = B.BEDROCK;
        for (let y = 1; y < SQUARE_TOP; y++) blocks[blockIndex(lx, y, lz)] = B.STONE;
        blocks[blockIndex(lx, SQUARE_TOP, lz)] = edge ? B.STONE_BRICKS : B.STONE;
      }
    }
    return blocks;
  }

  override columnAt(wx: number, wz: number): Column {
    return { height: onSquare(wx, wz) ? SQUARE_TOP : 0, biome: Biome.PLAINS };
  }

  override findSpawn(): { x: number; y: number; z: number } {
    return { x: 0.5, y: SQUARE_TOP + 1, z: 0.5 };
  }
}

/** The generator for a kind of world. */
export function makeGenerator(seed: number, kind: WorldKind = 'overworld'): WorldGenerator {
  if (kind === 'adventure') return new AdventureWorldGenerator(seed);
  if (kind === 'beyond') return new BeyondWorldGenerator(seed);
  if (kind === 'showcase') return new ShowcaseWorldGenerator(seed);
  return kind === 'square' ? new SquareWorldGenerator(seed) : new WorldGenerator(seed);
}
