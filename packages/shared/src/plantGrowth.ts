import { B, GROVE } from './blocks';
import { CHUNK_SIZE } from './chunk';
import { BAMBOO_GROW_SECONDS, CANE_GROW_SECONDS, FRUIT_GROW_SECONDS, cropGrowthSeconds, growColumn, growFruit, growVine, isKelp } from './plants';
import { SAPLING_GROW_SECONDS, growTree, isSapling, type TreeEditor } from './trees';

export interface PlantChunk {
  cx: number;
  cz: number;
  data: Uint16Array;
  /** Plants only exist where a player edited the world, so unedited chunks are skipped. */
  modified: boolean;
}

// What a block does when time passes. Looked up once per block of every edited chunk, so it is a table.
const NONE = 0;
const COLUMN = 1;
const SAPLING = 2;
const YOUNG = 3;
const RIPE_STEM = 4;
const VINE = 5;
const FIRE = 6;

let growth: Uint8Array | null = null;

/** Cave vines keep the pace they had. Seeds and saplings follow Minecraft's random tick. */
const VINE_GROW_SECONDS = 45;

function due(dt: number, mean: number, rand: () => number): boolean {
  return rand() < 1 - Math.exp(-dt / mean);
}

function growthKind(id: number): number {
  if (id === B.FIRE) return FIRE;
  if (id === B.CACTUS || id === B.SUGAR_CANE || id === GROVE.bamboo || isKelp(id)) return COLUMN;
  // An azalea is a sapling to bone meal, but it does not grow into a tree by itself (nor turn into another block).
  if (id === GROVE.azalea || id === B.FLOWERING_AZALEA) return NONE;
  if (isSapling(id)) return SAPLING;
  if (
    (id >= B.WHEAT_0 && id < B.WHEAT_3) ||
    (id >= B.POTATO_0 && id < B.POTATO_3) ||
    (id >= B.CARROT_0 && id < B.CARROT_3) ||
    (id >= B.MELON_STEM_0 && id < B.MELON_STEM_3) ||
    (id >= B.PUMPKIN_STEM_0 && id < B.PUMPKIN_STEM_3) ||
    (id >= B.BEETROOT_0 && id < B.BEETROOT_3) ||
    (id >= B.SWEET_BERRY_0 && id < B.SWEET_BERRY_3) ||
    (id >= B.COCOA_BASE && id < B.COCOA_BASE + 12 && (id - B.COCOA_BASE) % 3 < 2)
  ) {
    return YOUNG;
  }
  if (id === B.MELON_STEM_3 || id === B.PUMPKIN_STEM_3) return RIPE_STEM;
  if (id === B.CAVE_VINES || id === B.CAVE_VINES_BERRIES) return VINE;
  return NONE;
}

function growthTable(): Uint8Array {
  if (!growth) {
    growth = new Uint8Array(65536);
    for (let id = 0; id < growth.length; id++) growth[id] = growthKind(id);
  }
  return growth;
}

/**
 * Random growth of crops, cactus, sugar cane and saplings. Call every couple of seconds with the elapsed time.
 * Returns how many plants advanced. The browser and the server both use this, so every mode waits the same.
 * onFire hears about every fire block found on the way (fires saved in a chunk start burning again).
 */
export function growPlants(chunks: Iterable<PlantChunk>, world: TreeEditor, dt: number, rand: () => number = Math.random, onFire?: (x: number, y: number, z: number) => void): number {
  const kinds = growthTable();
  let grown = 0;
  const pending: [number, number, number, number][] = [];
  const fruits: [number, number, number, number][] = [];
  const saplings: [number, number, number][] = [];
  const columns: [number, number, number, number][] = [];
  const vines: [number, number, number, number][] = [];
  for (const c of chunks) {
    if (!c.modified) continue;
    const data = c.data;
    for (let i = 0; i < data.length; i++) {
      const id = data[i];
      const kind = kinds[id];
      if (kind === NONE) continue;
      // blockIndex layout: (y * 16 + z) * 16 + x
      const x = c.cx * CHUNK_SIZE + (i & 15);
      const y = i >> 8;
      const z = c.cz * CHUNK_SIZE + ((i >> 4) & 15);
      if (kind === FIRE) {
        if (onFire) onFire(x, y, z);
      } else if (kind === COLUMN) {
        const mean = id === GROVE.bamboo ? BAMBOO_GROW_SECONDS : CANE_GROW_SECONDS;
        if (due(dt, mean, rand)) columns.push([x, y, z, id]);
      } else if (kind === SAPLING) {
        if (due(dt, SAPLING_GROW_SECONDS, rand)) saplings.push([x, y, z]);
      } else if (kind === RIPE_STEM) {
        if (due(dt, FRUIT_GROW_SECONDS, rand)) fruits.push([x, y, z, id]);
      } else if (kind === VINE) {
        if (due(dt, VINE_GROW_SECONDS, rand)) vines.push([x, y, z, id]);
      } else if (due(dt, cropGrowthSeconds(world, x, y, z, id), rand)) {
        pending.push([x, y, z, id + 1]);
      }
    }
  }
  for (const [x, y, z, id] of pending) if (world.setBlock(x, y, z, id)) grown++;
  for (const [x, y, z, id] of fruits) if (growFruit(world, x, y, z, id, rand)) grown++;
  for (const [x, y, z, id] of columns) if (growColumn(world, x, y, z, id)) grown++;
  for (const [x, y, z, id] of vines) if (growVine(world, x, y, z, id)) grown++;
  for (const [x, y, z] of saplings) if (growTree(world, x, y, z, rand)) grown++;
  return grown;
}
