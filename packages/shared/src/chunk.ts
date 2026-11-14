export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 256;
export const SEA_LEVEL = 63;
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;

/** Index into a chunk's block array. y-major for cache-friendly column scans. */
export function blockIndex(x: number, y: number, z: number): number {
  return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
}

export function chunkKey(cx: number, cz: number): number {
  return (((cx + 32768) & 0xffff) << 16) | ((cz + 32768) & 0xffff);
}

