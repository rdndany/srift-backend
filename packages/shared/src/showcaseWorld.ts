import { B, BLOCKS } from './blocks';
import { CHUNK_SIZE, CHUNK_VOLUME, SEA_LEVEL, blockIndex } from './chunk';
import type { WorldKind } from './squareWorld';
import { Biome, WorldGenerator, type Column } from './worldgen';

/** Every box is this many blocks on a side (and `SHOWCASE_HEIGHT` tall), with `SHOWCASE_GAP` of floor between boxes. */
export const SHOWCASE_BOX = 10;
export const SHOWCASE_HEIGHT = 4;
export const SHOWCASE_GAP = 3;
const PITCH = SHOWCASE_BOX + SHOWCASE_GAP;
/** The y of the floor the boxes stand on. */
export const SHOWCASE_FLOOR = SEA_LEVEL;

export interface ShowcaseBox {
  id: number;
  name: string;
  /** The corner of the box with the lowest x and z. */
  x: number;
  z: number;
}

let layout: ShowcaseBox[] | null = null;
let side = 0;

/**
 * Every ordinary full block of the game, one per box, in the order of their ids, in rows from the corner of the world: a quick way
 * to look at them all (`?world=showcase`). Plants, slabs, doors and the like are not here, nor liquids: only blocks that are cubes.
 */
export function showcaseLayout(): readonly ShowcaseBox[] {
  if (layout) return layout;
  const ids: number[] = [];
  for (let id = 1; id < BLOCKS.length; id++) {
    const b = BLOCKS[id];
    if (b.id === id && b.name !== 'air' && b.shape === 'cube' && !b.liquid) ids.push(id);
  }
  const cols = Math.ceil(Math.sqrt(ids.length));
  side = SHOWCASE_GAP + cols * PITCH;
  layout = ids.map((id, i) => ({ id, name: BLOCKS[id].name, x: SHOWCASE_GAP + (i % cols) * PITCH, z: SHOWCASE_GAP + Math.floor(i / cols) * PITCH }));
  return layout;
}

/** The box with this name (or whose name contains it), if there is one. */
export function showcaseFind(query: string): ShowcaseBox | null {
  const q = query.trim().toLowerCase().replace(/\s+/g, '_');
  const all = showcaseLayout();
  return all.find((b) => b.name === q) ?? all.find((b) => b.name.includes(q)) ?? null;
}

/**
 * A big flat square of stone in the void with every full block in a box of its own: ten by ten blocks wide, four tall, so each one
 * can be looked at from above and from the side, side by side with the rest. Made to check how the blocks look.
 */
export class ShowcaseWorldGenerator extends WorldGenerator {
  override readonly kind: WorldKind = 'showcase';
  private readonly boxes = new Map<number, ShowcaseBox>();

  constructor(seed: number) {
    super(seed);
    for (const b of showcaseLayout()) this.boxes.set(Math.floor(b.z / PITCH) * 4096 + Math.floor(b.x / PITCH), b);
  }

  private onFloor(wx: number, wz: number): boolean {
    return wx >= 0 && wz >= 0 && wx < side && wz < side;
  }

  /** The box standing on a column, if any. */
  private boxAt(wx: number, wz: number): ShowcaseBox | undefined {
    if (!this.onFloor(wx, wz)) return undefined;
    const b = this.boxes.get(Math.floor(wz / PITCH) * 4096 + Math.floor(wx / PITCH));
    return b && wx >= b.x && wx < b.x + SHOWCASE_BOX && wz >= b.z && wz < b.z + SHOWCASE_BOX ? b : undefined;
  }

  override generateChunk(cx: number, cz: number): Uint16Array {
    const blocks = new Uint16Array(CHUNK_VOLUME);
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = cx * CHUNK_SIZE + lx;
        const wz = cz * CHUNK_SIZE + lz;
        if (!this.onFloor(wx, wz)) continue;
        blocks[blockIndex(lx, 0, lz)] = B.BEDROCK;
        for (let y = 1; y <= SHOWCASE_FLOOR; y++) blocks[blockIndex(lx, y, lz)] = B.STONE;
        const box = this.boxAt(wx, wz);
        if (box) for (let y = SHOWCASE_FLOOR + 1; y <= SHOWCASE_FLOOR + SHOWCASE_HEIGHT; y++) blocks[blockIndex(lx, y, lz)] = box.id;
      }
    }
    return blocks;
  }

  override columnAt(wx: number, wz: number): Column {
    return { height: this.onFloor(wx, wz) ? SHOWCASE_FLOOR + (this.boxAt(wx, wz) ? SHOWCASE_HEIGHT : 0) : 0, biome: Biome.PLAINS };
  }

  override findSpawn(): { x: number; y: number; z: number } {
    return { x: 1.5, y: SHOWCASE_FLOOR + 1, z: 1.5 };
  }
}
