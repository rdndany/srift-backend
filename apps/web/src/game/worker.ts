import { makeGenerator, type WorldGenerator, type WorldKind } from '@solrift/shared';
import { assembleRegion, meshChunk, type MeshResult } from './mesher';

export type WorkerRequest =
  | { type: 'init'; seed: number; kind?: WorldKind }
  | { type: 'gen'; cx: number; cz: number }
  /** `chunks` are the block data of the 3x3 chunks around (cx, cz), row by row (z first): the worker puts them together, off the game's thread. */
  | { type: 'mesh'; cx: number; cz: number; chunks: Uint16Array[] };

export type WorkerResponse =
  | { type: 'chunk'; cx: number; cz: number; data: Uint16Array }
  | { type: 'mesh'; cx: number; cz: number; result: MeshResult; ms: number };

let generator: WorldGenerator | null = null;
const ctx = self as unknown as {
  postMessage(msg: WorkerResponse, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
};

ctx.onmessage = (e) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init':
      generator = makeGenerator(msg.seed, msg.kind);
      break;
    case 'gen': {
      if (!generator) return;
      const data = generator.generateChunk(msg.cx, msg.cz);
      ctx.postMessage({ type: 'chunk', cx: msg.cx, cz: msg.cz, data }, [data.buffer]);
      break;
    }
    case 'mesh': {
      const t0 = performance.now();
      const region = assembleRegion((x, z) => msg.chunks[(z - msg.cz + 1) * 3 + (x - msg.cx + 1)], msg.cx, msg.cz);
      const result = meshChunk(region, generator?.tintGrid(msg.cx, msg.cz));
      const transfer: Transferable[] = [];
      for (const m of [result.opaque, result.translucent]) {
        if (!m) continue;
        transfer.push(m.positions.buffer, m.uvs.buffer, m.tiles.buffer, m.light.buffer, m.indices.buffer);
      }
      ctx.postMessage({ type: 'mesh', cx: msg.cx, cz: msg.cz, result, ms: performance.now() - t0 }, transfer);
      break;
    }
  }
};
