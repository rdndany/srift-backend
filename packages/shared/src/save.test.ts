import { describe, expect, it } from 'vitest';
import { B } from './blocks';
import {
  CHUNK_BYTES,
  SAVE_VERSION,
  SaveError,
  crc32,
  decodeChunk,
  decodeWorldFile,
  encodeChunk,
  encodeWorldFile,
  migrateLegacySave,
  parsePlayerSave,
  parseWorldState,
  type WorldFile,
} from './save';
import { mulberry32 } from './noise';

function terrain(seed = 1): Uint16Array {
  const rand = mulberry32(seed);
  const d = new Uint16Array(CHUNK_BYTES);
  for (let i = 0; i < d.length; i++) d[i] = i < d.length / 2 ? B.STONE : B.AIR;
  for (let i = 0; i < 300; i++) d[Math.floor(rand() * d.length)] = B.LOG;
  return d;
}

const player = { v: 1 as const, x: 1.5, y: 70, z: -3, yaw: 0.5, pitch: -0.2, mode: 'creative' as const, selected: 4, inv: [[1, 2, 0]], vitals: { health: 20 }, mobs: [], xp: { l: 5, p: 3 } };

describe('chunk compression', () => {
  it('round-trips and is much smaller than raw terrain', () => {
    const raw = terrain();
    const enc = encodeChunk(raw);
    expect(decodeChunk(enc)).toEqual(raw);
    expect(enc.length).toBeLessThan(raw.length / 10);
  });

  it('handles uniform, alternating (worst case) and random chunks', () => {
    const uniform = new Uint16Array(CHUNK_BYTES).fill(7);
    expect(encodeChunk(uniform).length).toBeLessThan(10);
    expect(decodeChunk(encodeChunk(uniform))).toEqual(uniform);

    const alt = new Uint16Array(CHUNK_BYTES).map((_, i) => i & 1);
    expect(decodeChunk(encodeChunk(alt))).toEqual(alt);

    const rand = mulberry32(5);
    const noise = new Uint16Array(CHUNK_BYTES).map(() => Math.floor(rand() * 256));
    expect(decodeChunk(encodeChunk(noise))).toEqual(noise);
  });

  it('rejects wrong sizes and malformed data', () => {
    expect(() => encodeChunk(new Uint16Array(10))).toThrow(SaveError);
    const enc = encodeChunk(terrain());
    expect(() => decodeChunk(enc.slice(0, enc.length - 2))).toThrow(SaveError); // too short
    expect(() => decodeChunk(new Uint8Array([2, 1, 1]))).toThrow(SaveError); // unknown format
    expect(() => decodeChunk(new Uint8Array([1, 5, 0]))).toThrow(SaveError); // zero run
    expect(() => decodeChunk(new Uint8Array([1, 5, 0xff, 0xff, 0xff, 0xff, 0x7f]))).toThrow(SaveError); // huge varint
    expect(() => decodeChunk(new Uint8Array([1, 5, 0xff, 0xff, 0x7f]))).toThrow(SaveError); // run overflows the chunk
  });
});

describe('player and world records', () => {
  it('accepts a current record and clamps bad values', () => {
    const p = parsePlayerSave({ ...player, pitch: 99, selected: 99, mode: 'weird' })!;
    expect(p.v).toBe(SAVE_VERSION);
    expect(p.pitch).toBeLessThan(1.6);
    expect(p.selected).toBe(8);
    expect(p.mode).toBe('survival');
    expect(p.inv).toEqual([[1, 2, 0]]);
  });

  it('treats unusable records as a new player', () => {
    for (const bad of [null, undefined, 5, 'x', [], {}, { x: 'a', y: 1, z: 1 }, { x: NaN, y: 1, z: 1 }]) {
      expect(parsePlayerSave(bad)).toBeNull();
    }
  });

  it('refuses saves from a newer game', () => {
    expect(() => parsePlayerSave({ ...player, v: 99 })).toThrow(SaveError);
    expect(() => parseWorldState({ v: 99 })).toThrow(SaveError);
    expect(() => parsePlayerSave({ ...player, v: -1 })).toThrow(SaveError);
  });

  it('upgrades the legacy unversioned blob and splits world state from the player', () => {
    const legacy = { x: 10, y: 64, z: 10, yaw: 1, pitch: 0, time: 0.6, weather: { kind: 'rain', timer: 99 }, mobs: [{ kind: 'pig' }], inv: [], vitals: null, mode: 'creative', selected: 2 };
    const out = migrateLegacySave(legacy, { chests: [] });
    expect(out.player).toMatchObject({ v: 1, x: 10, mode: 'creative', selected: 2 });
    expect(out.world).toEqual({ v: 1, time: 0.6, weather: { kind: 'rain', timer: 99 }, blockEntities: { chests: [] } });
    expect(migrateLegacySave(null, null)).toEqual({ player: null, world: null });
    expect(migrateLegacySave(null, { a: 1 }).world?.blockEntities).toEqual({ a: 1 });
  });
});

describe('world file', () => {
  const file = (): WorldFile => ({
    seed: 1337,
    created: 1_700_000_000_000,
    player,
    world: { v: 1, time: 0.3, weather: { kind: 'clear', timer: 10 }, blockEntities: null },
    chunks: [
      { cx: 0, cz: 0, encoded: encodeChunk(terrain(1)) },
      { cx: -3, cz: 7, encoded: encodeChunk(terrain(2)) },
    ],
  });

  it('round-trips a world', () => {
    const bytes = encodeWorldFile(file());
    const back = decodeWorldFile(bytes);
    expect(back.seed).toBe(1337);
    expect(back.player).toEqual(player);
    expect(back.world?.time).toBe(0.3);
    expect(back.chunks).toHaveLength(2);
    expect(decodeChunk(back.chunks[1].encoded)).toEqual(terrain(2));
    expect(back.chunks[1]).toMatchObject({ cx: -3, cz: 7 });
  });

  it('supports an empty world', () => {
    const back = decodeWorldFile(encodeWorldFile({ seed: 5, created: 0, player: null, world: null, chunks: [] }));
    expect(back).toMatchObject({ seed: 5, player: null, world: null, chunks: [] });
  });

  it('detects any single flipped bit', () => {
    const bytes = encodeWorldFile(file());
    const rand = mulberry32(3);
    for (let n = 0; n < 60; n++) {
      const copy = bytes.slice();
      copy[Math.floor(rand() * copy.length)] ^= 1 << Math.floor(rand() * 8);
      expect(() => decodeWorldFile(copy)).toThrow(SaveError);
    }
  });

  it('rejects every truncation without throwing anything else', () => {
    const bytes = encodeWorldFile({ ...file(), chunks: [file().chunks[0]] });
    for (let len = 0; len < bytes.length; len += 97) expect(() => decodeWorldFile(bytes.slice(0, len))).toThrow(SaveError);
    expect(() => decodeWorldFile(bytes.slice(0, bytes.length - 1))).toThrow(SaveError);
  });

  it('never crashes on random garbage', () => {
    const rand = mulberry32(11);
    for (let n = 0; n < 200; n++) {
      const junk = new Uint8Array(Math.floor(rand() * 300)).map(() => Math.floor(rand() * 256));
      expect(() => decodeWorldFile(junk)).toThrow(SaveError);
    }
    // Right magic but garbage after it.
    for (let n = 0; n < 100; n++) {
      const junk = new Uint8Array(40).map(() => Math.floor(rand() * 256));
      junk.set([0x53, 0x43, 0x57, 0x31], 0);
      expect(() => decodeWorldFile(junk)).toThrow(SaveError);
    }
  });

  // Craft files with a valid checksum but hostile content, which is what a malicious save would be.
  const sign = (body: number[]): Uint8Array => {
    const arr = new Uint8Array(body.length + 4);
    arr.set(body);
    new DataView(arr.buffer).setUint32(body.length, crc32(arr, body.length));
    return arr;
  };
  const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const enc = (s: string) => Array.from(new TextEncoder().encode(s));

  it('rejects hostile headers and chunk tables even with a valid checksum', () => {
    const magic = [0x53, 0x43, 0x57, 0x31];
    const hdr = (obj: unknown) => {
      const h = enc(JSON.stringify(obj));
      return [...magic, ...u32(h.length), ...h];
    };
    expect(() => decodeWorldFile(sign([...hdr({ v: 1, seed: 1 }), ...u32(5_000_000)]))).toThrow(SaveError); // chunk count
    expect(() => decodeWorldFile(sign([...hdr({ v: 99, seed: 1 }), ...u32(0)]))).toThrow(SaveError); // future version
    expect(() => decodeWorldFile(sign([...hdr({ seed: 1 }), ...u32(0)]))).toThrow(SaveError); // no version
    expect(() => decodeWorldFile(sign([...hdr({ v: 1, seed: 'x' }), ...u32(0)]))).toThrow(SaveError); // bad seed
    expect(() => decodeWorldFile(sign([...magic, ...u32(1_000_000_000)]))).toThrow(SaveError); // header larger than the file
    expect(() => decodeWorldFile(sign([...magic, ...u32(3), 0x7b, 0x7b, 0x7b, ...u32(0)]))).toThrow(SaveError); // not JSON
    // One chunk with a huge declared length.
    expect(() => decodeWorldFile(sign([...hdr({ v: 1, seed: 1 }), ...u32(1), ...u32(0), ...u32(0), ...u32(0x7fffffff)]))).toThrow(SaveError);
    // Chunk coordinates far outside the world.
    const good = Array.from(encodeChunk(terrain()));
    expect(() => decodeWorldFile(sign([...hdr({ v: 1, seed: 1 }), ...u32(1), ...u32(0x7fffffff), ...u32(0), ...u32(good.length), ...good]))).toThrow(SaveError);
    // A chunk whose payload is not valid RLE.
    expect(() => decodeWorldFile(sign([...hdr({ v: 1, seed: 1 }), ...u32(1), ...u32(0), ...u32(0), ...u32(3), 1, 5, 0]))).toThrow(SaveError);
    // Duplicate chunks.
    const dup = [...u32(0), ...u32(0), ...u32(good.length), ...good];
    expect(() => decodeWorldFile(sign([...hdr({ v: 1, seed: 1 }), ...u32(2), ...dup, ...dup]))).toThrow(SaveError);
  });

  it('crc32 matches the known check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});
