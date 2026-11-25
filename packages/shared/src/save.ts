import { B, BLOCK_COUNT } from './blocks';
import { CHUNK_SIZE, WORLD_HEIGHT } from './chunk';
import { MAX_COINS } from './economy';
import { EMBER_COOLDOWN } from './emberstone';
import { OXYGEN_SECONDS } from './items';

/**
 * Save formats. Pure TypeScript with no browser APIs, so the same code validates saves in the
 * client, in tests and (Phase 3.3) on the server. Every persisted record carries a version, and
 * everything read from storage or a file is treated as untrusted input.
 */

export const SAVE_VERSION = 1;
export const CHUNK_BYTES = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;
/** Size of a chunk from before the world was made taller; still readable, padded with air. */
export const LEGACY_CHUNK_BYTES = CHUNK_SIZE * CHUNK_SIZE * 128;
/** The generator that produced unedited terrain. Bump if worldgen output ever changes. */
export const GENERATOR_VERSION = 4;

export class SaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveError';
  }
}

export type SaveMode = 'survival' | 'creative';

/** Everything about one player in one world. `inv`/`vitals`/`mobs` are validated by their owners' `loadJSON`. */
export interface PlayerSave {
  v: 1;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  mode: SaveMode;
  selected: number;
  inv: unknown;
  vitals: unknown;
  mobs: unknown;
  /** Experience: { l: level, p: points into the level }. Absent in older saves. */
  xp?: unknown;
  /** Seconds left in the open oxygen bottle. Absent when none is open. */
  ox?: number;
  /** Isle survival: the day this character had reached. Absent in every other world. */
  dy?: number;
  /** Coins carried (absent: none). */
  coins?: number;
  /** Worn armor: four stacks like the inventory's. Absent in older saves. */
  armor?: unknown;
  /** The off-hand slot (a shield): one stack like the inventory's. Absent in older saves. */
  offhand?: unknown;
  /** The bags worn: four stacks like the inventory's, whose slots (after the backpack's) hold what the bags carry. Absent when none is worn and in older saves. */
  bags?: unknown;
  /** Seconds the Emberstone still needs to rest before it can be used again. Absent when it is ready. */
  hs?: number;
  /** The mount slot: the horn of the mount the mount key summons, a stack like the inventory's. Absent when empty and in older saves. */
  mountSlot?: unknown;
  /** The outfit slot: the glowing set the hero wears (what others see it in), a stack like the inventory's. Absent when empty and in older saves. */
  outfitSlot?: unknown;
  /** The companion slot: the companion that follows the hero, a stack like the inventory's. Absent when empty and in older saves. */
  companionSlot?: unknown;
  /** The wing slot: the wings the hero wears, a stack like the inventory's. Absent when empty and in older saves. */
  wingSlot?: unknown;
  /** The rings and the necklace worn (slots 0 and 1: rings, slot 2: necklace), stacks like the inventory's. Absent when none is worn and in older saves. */
  accessories?: unknown;
  /** The bed (its head block) the player respawns at. Absent when none was ever used. */
  spawn?: { x: number; y: number; z: number };
  /** Hardcore world: one life, hard difficulty. Absent (false) in older saves. */
  hardcore?: boolean;
  /** Hardcore only: the player has died, so this world can no longer be played. */
  gameOver?: boolean;
  /** Hardcore only: after dying the player floats through the world and can only look. */
  spectating?: boolean;
  /** Adventure mode: the quest log (see QuestLog.toJSON). Absent when there is nothing in it. */
  quests?: unknown;
  /** The achievements: the counts of the deeds and the ones won (see AchievementBook.toJSON). Absent when there is nothing in it. */
  ach?: unknown;
  /** Today's daily bounties: what was done towards each and which are finished (see BountyBook.toJSON). Absent when nothing is. */
  bounty?: unknown;
  /** The character's class progress (see ClassState.toJSON): class, class level, experience and unlocked abilities. Absent without a class and in older saves. */
  cls?: unknown;
  /** The character has been given the clothes of its class (they are armor from then on, and may be taken off for good). Absent in older saves. */
  of?: boolean;
  /** When this was saved (ms since 1970), for the list of worlds. */
  savedAt?: number;
}

/** World-wide state that is not a block: clock, weather, chests and furnaces. */
export interface WorldState {
  v: 1;
  time: number;
  weather: unknown;
  blockEntities: unknown;
  /** The villagers of the villages the players have visited (see villagerFolk.ts). */
  villagers?: unknown;
  /** Minecarts and boats: kind, position and heading. */
  vehicles?: unknown;
  redstone?: unknown;
  /** Isle survival: the day count and the morning roll. Absent in every other world. */
  isle?: unknown;
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const finite = (x: unknown, fallback: number): number => (typeof x === 'number' && Number.isFinite(x) ? x : fallback);

function checkVersion(raw: Record<string, unknown>): void {
  if (raw.v === undefined) return; // legacy, pre-versioning
  if (typeof raw.v !== 'number' || !Number.isInteger(raw.v) || raw.v < 0) throw new SaveError('bad save version');
  if (raw.v > SAVE_VERSION) throw new SaveError(`save is from a newer game version (${raw.v} > ${SAVE_VERSION})`);
}

/**
 * Validate and upgrade a stored player record (legacy v0 or current v1). Returns null when there is
 * no usable position (a brand new player), and throws SaveError for saves from the future.
 */
function parseSpawn(raw: unknown): { x: number; y: number; z: number } | null {
  if (!isObject(raw)) return null;
  const { x, y, z } = raw;
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && Math.abs(n) < 1e8;
  return ok(x) && ok(y) && ok(z) ? { x, y, z } : null;
}

export function parsePlayerSave(raw: unknown): PlayerSave | null {
  if (!isObject(raw)) return null;
  checkVersion(raw);
  if (![raw.x, raw.y, raw.z].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const mode: SaveMode = raw.mode === 'creative' ? 'creative' : 'survival';
  return {
    v: 1,
    x: raw.x as number,
    y: raw.y as number,
    z: raw.z as number,
    yaw: finite(raw.yaw, 0),
    pitch: Math.max(-1.5707, Math.min(1.5707, finite(raw.pitch, 0))),
    mode,
    selected: Math.max(0, Math.min(8, Math.floor(finite(raw.selected, 0)))),
    inv: raw.inv ?? null,
    vitals: raw.vitals ?? null,
    mobs: raw.mobs ?? null,
    ...(raw.xp != null ? { xp: raw.xp } : {}),
    ...(typeof raw.coins === 'number' && Number.isFinite(raw.coins) && raw.coins > 0 ? { coins: Math.min(MAX_COINS, Math.floor(raw.coins)) } : {}),
    ...(typeof raw.ox === 'number' && Number.isFinite(raw.ox) && raw.ox > 0 ? { ox: Math.min(OXYGEN_SECONDS, raw.ox) } : {}),
    ...(Number.isInteger(raw.dy) && (raw.dy as number) >= 1 ? { dy: raw.dy as number } : {}),
    ...(Number.isInteger(raw.es) && (raw.es as number) > 0 ? { es: raw.es as number } : {}),
    ...(raw.armor != null ? { armor: raw.armor } : {}),
    ...(raw.offhand != null ? { offhand: raw.offhand } : {}),
    ...(raw.bags != null ? { bags: raw.bags } : {}),
    ...(typeof raw.hs === 'number' && Number.isFinite(raw.hs) && raw.hs > 0 ? { hs: Math.min(EMBER_COOLDOWN, raw.hs) } : {}),
    ...(raw.mountSlot != null ? { mountSlot: raw.mountSlot } : {}),
    ...(raw.outfitSlot != null ? { outfitSlot: raw.outfitSlot } : {}),
    ...(raw.companionSlot != null ? { companionSlot: raw.companionSlot } : {}),
    ...(raw.wingSlot != null ? { wingSlot: raw.wingSlot } : {}),
    ...(raw.accessories != null ? { accessories: raw.accessories } : {}),
    ...(parseSpawn(raw.spawn) ? { spawn: parseSpawn(raw.spawn)! } : {}),
    ...(raw.hardcore === true ? { hardcore: true } : {}),
    ...(raw.hardcore === true && raw.gameOver === true ? { gameOver: true } : {}),
    ...(raw.hardcore === true && raw.gameOver === true && raw.spectating === true ? { spectating: true } : {}),
    ...(isObject(raw.quests) ? { quests: raw.quests } : {}),
    ...(isObject(raw.ach) ? { ach: raw.ach } : {}),
    ...(isObject(raw.bounty) ? { bounty: raw.bounty } : {}),
    ...(isObject(raw.cls) ? { cls: raw.cls } : {}),
    ...(raw.of === true ? { of: true } : {}),
    ...(typeof raw.savedAt === 'number' && Number.isFinite(raw.savedAt) ? { savedAt: raw.savedAt } : {}),
  };
}

export function parseWorldState(raw: unknown): WorldState | null {
  if (!isObject(raw)) return null;
  checkVersion(raw);
  return {
    v: 1,
    time: finite(raw.time, 0.2),
    weather: raw.weather ?? null,
    blockEntities: raw.blockEntities ?? null,
    ...(raw.villagers != null ? { villagers: raw.villagers } : {}),
    ...(Array.isArray(raw.vehicles) ? { vehicles: raw.vehicles } : {}),
    ...(raw.redstone && typeof raw.redstone === 'object' ? { redstone: raw.redstone } : {}),
    ...(isObject(raw.isle) ? { isle: raw.isle } : {}),
  };
}

/**
 * The first public builds stored one unversioned player blob (position, inventory, clock, weather,
 * mobs) plus a separate block-entity blob. Split them into the current records.
 */
export function migrateLegacySave(player: unknown, blockEntities: unknown): { player: PlayerSave | null; world: WorldState | null } {
  const p = parsePlayerSave(player);
  const legacy = isObject(player) ? player : {};
  if (!p && blockEntities == null) return { player: null, world: null };
  return {
    player: p,
    world: {
      v: 1,
      time: finite(legacy.time, 0.2),
      weather: legacy.weather ?? null,
      blockEntities: blockEntities ?? null,
    },
  };
}

// ---- chunk compression --------------------------------------------------------------------------

/**
 * Format 4 writes block ids as variable-length numbers (one byte below 128, two below 16384) so ids can go past 255.
 * Formats 1 to 3 wrote one byte per id, and are renumbered as they are read: fence gates went from eight ids (167..174:
 * closed and open, four facings each) to six, to make room for fire (format 1 to 2), and then to four (closed and open,
 * one per axis: an open gate no longer remembers which way it swings) to make room for the chipped and damaged anvil
 * and the grindstone (format 2 to 3). Format 3 needs no renumbering.
 */
const RLE_FORMAT = 4;
const RLE_FORMAT_V3 = 3;
const RLE_FORMAT_V2 = 2;
const RLE_FORMAT_V1 = 1;

/** Format 1 numbering to format 2: eight gate ids became six. */
const V1_TO_V2 = new Uint8Array(256).map((_, i) => i);
for (let i = 0; i < 8; i++) {
  const facing = i & 3;
  V1_TO_V2[B.GATE_BASE + i] = i < 4 ? B.GATE_BASE + (facing >> 1) : B.GATE_BASE + 2 + facing;
}
/** Format 2 numbering to format 3: an open gate's four swing facings became one id per axis. */
const V2_TO_V3 = new Uint8Array(256).map((_, i) => i);
for (let i = 2; i < 6; i++) V2_TO_V3[B.GATE_BASE + i] = B.GATE_BASE + 2 + ((i - 2) >> 1);
const V1_IDS = new Uint8Array(256).map((_, i) => V2_TO_V3[V1_TO_V2[i]]);
const V2_IDS = V2_TO_V3;

/** Largest block id a chunk may hold. */
const MAX_ID = BLOCK_COUNT - 1;

/** Run-length encode one chunk of block ids. Terrain is mostly long runs, so this is typically 10-30x smaller. */
export function encodeChunk(data: Uint16Array): Uint8Array {
  if (data.length !== CHUNK_BYTES) throw new SaveError(`chunk must be ${CHUNK_BYTES} blocks, got ${data.length}`);
  const out = new Uint8Array(data.length * 3 + 1);
  let o = 0;
  out[o++] = RLE_FORMAT;
  let i = 0;
  while (i < data.length) {
    let v = data[i];
    if (v > MAX_ID) v = 0; // never write an id the game does not know
    let j = i + 1;
    while (j < data.length && data[j] === data[i]) j++;
    let run = j - i;
    while (v >= 0x80) {
      out[o++] = (v & 0x7f) | 0x80;
      v >>>= 7;
    }
    out[o++] = v;
    while (run >= 0x80) {
      out[o++] = (run & 0x7f) | 0x80;
      run >>>= 7;
    }
    out[o++] = run;
    i = j;
  }
  return out.slice(0, o);
}

/** Inverse of `encodeChunk`. Throws SaveError for anything that is not exactly one valid chunk. */
export function decodeChunk(bytes: Uint8Array): Uint16Array {
  const format = bytes[0];
  if (bytes.length < 3 || (format !== RLE_FORMAT && format !== RLE_FORMAT_V3 && format !== RLE_FORMAT_V2 && format !== RLE_FORMAT_V1)) throw new SaveError('unknown chunk encoding');
  const renumber = format === RLE_FORMAT_V1 ? V1_IDS : format === RLE_FORMAT_V2 ? V2_IDS : null;
  const wide = format === RLE_FORMAT;
  const out = new Uint16Array(CHUNK_BYTES);
  let o = 0;
  let i = 1;
  while (i < bytes.length) {
    let v = 0;
    if (wide) {
      let shift = 0;
      for (;;) {
        if (i >= bytes.length || shift > 7) throw new SaveError('truncated chunk block id');
        const b = bytes[i++];
        v |= (b & 0x7f) << shift;
        if (b < 0x80) break;
        shift += 7;
      }
      if (v > MAX_ID) throw new SaveError('chunk block id out of range');
    } else {
      v = renumber ? renumber[bytes[i]] : bytes[i];
      i++;
    }
    let run = 0;
    let shift = 0;
    for (;;) {
      if (i >= bytes.length || shift > 14) throw new SaveError('truncated chunk run');
      const b = bytes[i++];
      run |= (b & 0x7f) << shift;
      if (b < 0x80) break;
      shift += 7;
    }
    if (run === 0 || o + run > CHUNK_BYTES) throw new SaveError('chunk run out of range');
    out.fill(v, o, o + run);
    o += run;
  }
  // Chunks saved when the world was 128 blocks tall: the same columns, with open sky added above.
  if (o !== CHUNK_BYTES && o !== LEGACY_CHUNK_BYTES) throw new SaveError('chunk is too short');
  return out;
}

// ---- world file (.solrift) ---------------------------------------------------------------------

export interface EncodedChunk {
  cx: number;
  cz: number;
  /** `encodeChunk` output; kept compressed so big worlds do not need gigabytes of RAM. */
  encoded: Uint8Array;
}

export interface WorldFile {
  seed: number;
  created: number;
  player: PlayerSave | null;
  world: WorldState | null;
  chunks: EncodedChunk[];
}

const MAGIC = [0x53, 0x43, 0x57, 0x31]; // "SCW1"
const MAX_HEADER_BYTES = 8 * 1024 * 1024;
const MAX_CHUNKS = 400_000;
const MAX_CHUNK_ENCODED = CHUNK_BYTES * 3 + 1;
const MAX_COORD = 2_000_000;

let crcTable: Uint32Array | null = null;
export function crc32(bytes: Uint8Array, end = bytes.length): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < end; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function encodeWorldFile(file: WorldFile): Uint8Array {
  const header = new TextEncoder().encode(
    JSON.stringify({
      v: SAVE_VERSION,
      generator: GENERATOR_VERSION,
      seed: file.seed,
      created: file.created,
      player: file.player,
      world: file.world,
    }),
  );
  if (header.length > MAX_HEADER_BYTES) throw new SaveError('world header too large');
  let size = 4 + 4 + header.length + 4 + 4;
  for (const c of file.chunks) size += 12 + c.encoded.length;
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  out.set(MAGIC, 0);
  let o = 4;
  dv.setUint32(o, header.length);
  o += 4;
  out.set(header, o);
  o += header.length;
  dv.setUint32(o, file.chunks.length);
  o += 4;
  for (const c of file.chunks) {
    dv.setInt32(o, c.cx);
    dv.setInt32(o + 4, c.cz);
    dv.setUint32(o + 8, c.encoded.length);
    out.set(c.encoded, o + 12);
    o += 12 + c.encoded.length;
  }
  dv.setUint32(o, crc32(out, o));
  return out;
}

/** Parse and fully validate a world file. Never throws anything but SaveError, whatever the input. */
export function decodeWorldFile(bytes: Uint8Array): WorldFile {
  try {
    return decodeUnsafe(bytes);
  } catch (err) {
    if (err instanceof SaveError) throw err;
    throw new SaveError('corrupt world file');
  }
}

function decodeUnsafe(bytes: Uint8Array): WorldFile {
  if (bytes.length < 20) throw new SaveError('file too small to be a world');
  if (MAGIC.some((b, i) => bytes[i] !== b)) throw new SaveError('not a SolRift world file');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const crcAt = bytes.length - 4;
  if (crc32(bytes, crcAt) !== dv.getUint32(crcAt)) throw new SaveError('world file is damaged (checksum mismatch)');

  let o = 4;
  const headerLen = dv.getUint32(o);
  o += 4;
  if (headerLen > MAX_HEADER_BYTES || o + headerLen + 4 > crcAt) throw new SaveError('bad header size');
  let header: unknown;
  try {
    header = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(o, o + headerLen)));
  } catch {
    throw new SaveError('unreadable world header');
  }
  o += headerLen;
  if (!isObject(header)) throw new SaveError('bad world header');
  checkVersion(header);
  if (header.v === undefined) throw new SaveError('missing world version');
  const seed = header.seed;
  if (typeof seed !== 'number' || !Number.isInteger(seed) || Math.abs(seed) > 2 ** 31) throw new SaveError('bad world seed');

  const count = dv.getUint32(o);
  o += 4;
  if (count > MAX_CHUNKS) throw new SaveError('too many chunks');
  const chunks: EncodedChunk[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < count; i++) {
    if (o + 12 > crcAt) throw new SaveError('truncated chunk table');
    const cx = dv.getInt32(o);
    const cz = dv.getInt32(o + 4);
    const len = dv.getUint32(o + 8);
    o += 12;
    if (Math.abs(cx) > MAX_COORD || Math.abs(cz) > MAX_COORD) throw new SaveError('chunk coordinates out of range');
    if (len > MAX_CHUNK_ENCODED || o + len > crcAt) throw new SaveError('bad chunk size');
    const key = `${cx},${cz}`;
    if (seen.has(key)) throw new SaveError('duplicate chunk');
    seen.add(key);
    const encoded = bytes.slice(o, o + len);
    decodeChunk(encoded); // proves it is valid; the result is dropped to keep memory flat
    chunks.push({ cx, cz, encoded });
    o += len;
  }
  if (o !== crcAt) throw new SaveError('unexpected trailing data');

  return {
    seed,
    created: finite(header.created, 0),
    player: parsePlayerSave(header.player),
    world: parseWorldState(header.world),
    chunks,
  };
}

// ---- storage interface --------------------------------------------------------------------------

/**
 * One world's persistent storage. The browser implements it on IndexedDB (and later a cloud-synced
 * variant); the server implements it on SQLite/Postgres + blob storage.
 */
export interface SaveStore {
  loadPlayer(): Promise<PlayerSave | null>;
  savePlayer(save: PlayerSave): Promise<void>;
  loadWorldState(): Promise<WorldState | null>;
  saveWorldState(state: WorldState): Promise<void>;
  /** Edited chunks as raw block ids, keyed "cx,cz". */
  loadChunks(): Promise<Map<string, Uint16Array>>;
  saveChunks(chunks: Iterable<[number, number, Uint16Array]>): Promise<void>;
  /** Everything needed to write a `.solrift` file. */
  readWorldFile(seed: number): Promise<WorldFile>;
  /** Atomically replace the whole world (used by import). */
  replaceWorld(file: WorldFile): Promise<void>;
  clear(): Promise<void>;
}
