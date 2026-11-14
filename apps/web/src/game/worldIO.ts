import { SaveError, decodeWorldFile, encodeWorldFile } from '@solrift/shared';
import { saveBridge } from './saveBridge';
import { LocalSaveStore } from './storage';

/**
 * World export/import (`.solrift` files): the player's escape hatch and our backup format.
 * Files are the shared binary container gzip-compressed with the browser's CompressionStream.
 */

const MAX_FILE_BYTES = 512 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 1024 * 1024 * 1024;

export const currentSeed = (): number => {
  const raw = new URLSearchParams(location.search).get('seed');
  const n = Number(raw ?? 1337);
  return Number.isFinite(n) ? n : 1337;
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit: number): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  // Do not await the write: backpressure would deadlock until the readable side is drained.
  void writer.write(bytes as BufferSource).then(() => writer.close()).catch(() => undefined);
  const reader = stream.readable.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      void reader.cancel();
      throw new SaveError('world file is too large once unpacked');
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export async function exportWorld(): Promise<string> {
  await saveBridge.flush?.();
  const seed = currentSeed();
  const store = new LocalSaveStore(String(seed));
  const file = await store.readWorldFile(seed);
  const packed = await pipe(encodeWorldFile(file), new CompressionStream('gzip'), MAX_UNPACKED_BYTES);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const name = `solrift-seed${seed}-${stamp}.solrift`;
  const url = URL.createObjectURL(new Blob([packed as BlobPart], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return name;
}

/** Validates the file completely before touching any save. Throws SaveError for bad files. */
export async function parseWorldFile(file: File) {
  if (file.size > MAX_FILE_BYTES) throw new SaveError('file is too large');
  return decodeWorldBytes(new Uint8Array(await file.arrayBuffer()));
}

/** Decode a world from a file's bytes (gzip-wrapped or raw), validating everything. */
export async function decodeWorldBytes(input: Uint8Array) {
  let bytes = input;
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    try {
      bytes = await pipe(bytes, new DecompressionStream('gzip'), MAX_UNPACKED_BYTES);
    } catch (err) {
      if (err instanceof SaveError) throw err;
      throw new SaveError('could not unpack the file');
    }
  }
  return decodeWorldFile(bytes);
}

/** Replace the world with this file's seed by the file's contents, then reload into it. */
export async function importWorld(file: File): Promise<void> {
  const world = await parseWorldFile(file);
  // Persist what the player had, then stop the running game from writing over the import.
  await saveBridge.flush?.();
  saveBridge.freeze?.();
  await new LocalSaveStore(String(world.seed)).replaceWorld(world);
  const url = new URL(location.href);
  url.searchParams.set('seed', String(world.seed));
  location.assign(url);
}
