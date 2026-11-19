/**
 * Nothing in the world may hang in the air. These helpers keep whatever a generator draws attached to the ground: a list of
 * blocks is cut down to the ones that touch (by a face, an edge or a corner) a block that is rooted, and the rest is dropped.
 * They are pure functions of the blocks given, so every chunk that draws the same tree or building reaches the same answer.
 */

import { B, IS_LIQUID } from './blocks';
import { CHUNK_SIZE, SEA_LEVEL } from './chunk';

export interface Cell {
  x: number;
  y: number;
  z: number;
}

const OFFSETS: readonly (readonly [number, number, number])[] = (() => {
  const out: [number, number, number][] = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) if (dx || dy || dz) out.push([dx, dy, dz]);
  return out;
})();

/** A number for a cell (the coordinates stay within +-8192 and y within 0..1023). */
export const cellKey = (x: number, y: number, z: number): number => ((x + 8192) * 16384 + (z + 8192)) * 1024 + y;

/**
 * The blocks that are connected to the ground: those for which `rooted` is true, and everything that touches a kept block
 * (26 neighbours: leaves meeting at a corner still hold). Order is kept.
 */
export function keepRooted<T extends Cell>(blocks: readonly T[], rooted: (b: T) => boolean): T[] {
  if (blocks.length === 0) return [];
  const byCell = new Map<number, number[]>();
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const k = cellKey(b.x, b.y, b.z);
    const list = byCell.get(k);
    if (list) list.push(i);
    else byCell.set(k, [i]);
  }
  const keep = new Uint8Array(blocks.length);
  const stack: number[] = [];
  for (let i = 0; i < blocks.length; i++) {
    if (rooted(blocks[i])) {
      keep[i] = 1;
      stack.push(i);
    }
  }
  while (stack.length > 0) {
    const i = stack.pop()!;
    const b = blocks[i];
    for (const [dx, dy, dz] of OFFSETS) {
      const list = byCell.get(cellKey(b.x + dx, b.y + dy, b.z + dz));
      if (!list) continue;
      for (const j of list) {
        if (!keep[j]) {
          keep[j] = 1;
          stack.push(j);
        }
      }
    }
    // A leaf drawn on top of a log in the same cell is the same spot.
    const same = byCell.get(cellKey(b.x, b.y, b.z));
    if (same) {
      for (const j of same) {
        if (!keep[j]) {
          keep[j] = 1;
          stack.push(j);
        }
      }
    }
  }
  const out: T[] = [];
  for (let i = 0; i < blocks.length; i++) if (keep[i]) out.push(blocks[i]);
  return out;
}

/**
 * Take the small pieces that hang in a chunk's air out of it: a block (or a handful) left over where a cave, a ravine or a
 * building cut away what held it. The ground is the bottom of the chunk and every cell on its four sides (the next chunk
 * decides about what goes on there, and a piece that runs over the edge is the next chunk's to keep or to cut); whatever
 * touches the ground by a face, an edge or a corner, through blocks or water, stays. A piece that is left, and no bigger than
 * `maxSize`, is dropped. Returns how many blocks went.
 */
export function dropHovering(blocks: Uint16Array, maxSize: number): number {
  const S = CHUNK_SIZE;
  const layer = S * S;
  // The highest block there is, to keep the work to the part of the chunk that is built.
  let top = 0;
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i] !== 0) {
      top = Math.floor(i / layer);
      break;
    }
  }
  const total = (top + 1) * layer;
  const seen = new Uint8Array(total);
  const stack = new Int32Array(total);
  let sp = 0;
  const push = (i: number): void => {
    if (blocks[i] !== 0 && !IS_LIQUID[blocks[i]] && !seen[i]) {
      seen[i] = 1;
      stack[sp++] = i;
    }
  };
  const flood = (): void => {
    while (sp > 0) {
      const i = stack[--sp];
      const x = i % S;
      const z = Math.floor(i / S) % S;
      const y = Math.floor(i / layer);
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny > top) continue;
        for (let dz = -1; dz <= 1; dz++) {
          const nz = z + dz;
          if (nz < 0 || nz >= S) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= S) continue;
            push((ny * S + nz) * S + nx);
          }
        }
      }
    }
  };
  for (let i = 0; i < layer; i++) push(i);
  for (let y = 1; y <= top; y++) {
    for (let k = 0; k < S; k++) {
      push((y * S + 0) * S + k);
      push((y * S + (S - 1)) * S + k);
      push((y * S + k) * S + 0);
      push((y * S + k) * S + (S - 1));
    }
  }
  // Floating on the sea (a lily pad, a sheet of ice) is held by the water, but water holds nothing in a cave.
  for (let i = layer; i < total; i++) {
    const y = Math.floor(i / layer);
    if (y >= SEA_LEVEL && y <= SEA_LEVEL + 1 && blocks[i] !== 0 && !IS_LIQUID[blocks[i]] && blocks[i - layer] === B.WATER) push(i);
  }
  flood();
  let dropped = 0;
  const piece: number[] = [];
  for (let i = layer; i < total; i++) {
    if (blocks[i] === 0 || IS_LIQUID[blocks[i]] || seen[i]) continue;
    // A piece nobody holds: take it whole, then keep it (it is bigger than a fragment) or drop it.
    piece.length = 0;
    seen[i] = 1;
    stack[sp++] = i;
    while (sp > 0) {
      const j = stack[--sp];
      piece.push(j);
      const x = j % S;
      const z = Math.floor(j / S) % S;
      const y = Math.floor(j / layer);
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny > top) continue;
        for (let dz = -1; dz <= 1; dz++) {
          const nz = z + dz;
          if (nz < 0 || nz >= S) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= S) continue;
            push((ny * S + nz) * S + nx);
          }
        }
      }
    }
    if (piece.length > maxSize) continue;
    // Where the piece was in a liquid it leaves liquid, not an air bubble.
    const fills: number[] = [];
    for (const j of piece) {
      let fill = 0;
      for (const n of [j - 1, j + 1, j - S, j + S, j - layer, j + layer]) {
        if (n >= 0 && n < blocks.length && IS_LIQUID[blocks[n]]) {
          fill = blocks[n];
          break;
        }
      }
      fills.push(fill);
    }
    for (let k = 0; k < piece.length; k++) blocks[piece[k]] = fills[k];
    dropped += piece.length;
  }
  return dropped;
}