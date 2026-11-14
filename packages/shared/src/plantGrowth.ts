import { B } from './blocks';
import { CHUNK_SIZE } from './chunk';
import { CROP_STAGE_SECONDS } from './plants';
import { SAPLING_GROW_SECONDS, growTree, isSapling, type TreeEditor } from './trees';

export interface PlantChunk {
  cx: number;
  cz: number;
  data: Uint16Array;
  /** Plants only exist where a player edited the world, so unedited chunks are skipped. */
  modified: boolean;
}

/**
 * Random growth of wheat and saplings. Call every couple of seconds with the elapsed time.
 * Returns how many plants advanced. Shared by the browser world and the headless/server world.
 * onFire hears about every fire block found on the way (fires saved in a chunk start burning again).
 */
export function growPlants(chunks: Iterable<PlantChunk>, world: TreeEditor, dt: number, rand: () => number = Math.random, onFire?: (x: number, y: number, z: number) => void): number {
  const p = 1 - Math.exp(-dt / CROP_STAGE_SECONDS);
  const pTree = 1 - Math.exp(-dt / SAPLING_GROW_SECONDS);
  let grown = 0;
  const pending: [number, number, number, number][] = [];
  const saplings: [number, number, number][] = [];
  for (const c of chunks) {
    if (!c.modified) continue;
    const data = c.data;
    for (let i = 0; i < data.length; i++) {
      const id = data[i];
      if (id === B.FIRE && onFire) {
        onFire(c.cx * CHUNK_SIZE + (i & 15), i >> 8, c.cz * CHUNK_SIZE + ((i >> 4) & 15));
        continue;
      }
      if (!isSapling(id) && (id < B.WHEAT_0 || id >= B.WHEAT_3)) continue;
      // blockIndex layout: (y * 16 + z) * 16 + x
      const x = c.cx * CHUNK_SIZE + (i & 15);
      const y = i >> 8;
      const z = c.cz * CHUNK_SIZE + ((i >> 4) & 15);
      if (isSapling(id)) {
        if (rand() < pTree) saplings.push([x, y, z]);
      } else if (rand() < p) {
        pending.push([x, y, z, id + 1]);
      }
    }
  }
  for (const [x, y, z, id] of pending) if (world.setBlock(x, y, z, id)) grown++;
  for (const [x, y, z] of saplings) if (growTree(world, x, y, z, rand)) grown++;
  return grown;
}
