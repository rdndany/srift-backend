import {
  CHUNK_BYTES,
  LEGACY_CHUNK_BYTES,
  decodeChunk,
  encodeChunk,
  migrateLegacySave,
  parseIsleSave,
  parsePlayerSave,
  parseWorldState,
  type PlayerSave,
  type SaveStore,
  type WorldFile,
  type WorldState,
} from '@solrift/shared';

/**
 * Browser save storage on IndexedDB (single database, one record set per world id).
 *
 *  - `chunks`:  `${worldId}:${cx},${cz}` -> RLE-encoded chunk (edited chunks only)
 *  - `players`: worldId -> PlayerSave
 *  - `worlds`:  worldId -> WorldState (clock, weather, chests)
 *  - `sync`:    worldId -> SyncRecord (cloud sync choice, last cloud revision, what changed since)
 *
 * Version 1 of the database held raw chunks only; the upgrade re-encodes them in place. Version 3 added sync.
 */

const DB_NAME = 'solrift';
/** Island survival always uses this database, whichever character is signed in. */
const ISLE_DB = `${DB_NAME}-isle`;
const DB_VERSION = 3;
const CHUNKS = 'chunks';
const PLAYERS = 'players';
const WORLDS = 'worlds';
const SYNC = 'sync';

/**
 * Cloud sync bookkeeping for one world on this device. A record exists once the player decided
 * (even "not now"); `dirty` maps what changed locally to a sequence number so an upload can tell
 * which changes it covered and which arrived while it was running.
 */
export interface SyncRecord {
  /** The signed-in account this record belongs to; another account starts fresh. */
  accountId: string;
  enabled: boolean;
  /** Last cloud revision merged into this device, or null when it was never uploaded. */
  revision: number | null;
  seq: number;
  /** "cx,cz" and META -> sequence number of the last local write. */
  dirty: Record<string, number>;
  /** The next upload replaces the whole cloud world (after an import or "keep this device"). */
  full: boolean;
}

/** `dirty` key for the player record and the world state (clock, weather, chests). */
export const META = '#meta';

function parseSync(raw: unknown): SyncRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.accountId !== 'string') return null;
  const dirty: Record<string, number> = {};
  if (typeof r.dirty === 'object' && r.dirty !== null) {
    for (const [k, v] of Object.entries(r.dirty)) if (typeof v === 'number' && Number.isFinite(v)) dirty[k] = v;
  }
  return {
    accountId: r.accountId,
    enabled: r.enabled === true,
    revision: typeof r.revision === 'number' && Number.isInteger(r.revision) && r.revision >= 0 ? r.revision : null,
    seq: typeof r.seq === 'number' && Number.isFinite(r.seq) ? r.seq : 0,
    dirty,
    full: r.full === true,
  };
}

/** Inside a write transaction that also opened SYNC: note that these keys changed (only while syncing). */
function markDirty(tx: IDBTransaction, worldId: string, keys: string[]): void {
  if (keys.length === 0) return;
  const store = tx.objectStore(SYNC);
  const req = store.get(worldId);
  req.onsuccess = () => {
    const rec = parseSync(req.result);
    if (!rec || !rec.enabled) return;
    rec.seq += 1;
    for (const k of keys) rec.dirty[k] = rec.seq;
    store.put(rec, worldId);
  };
}
/** The database's name before the game was renamed; worlds saved under it are copied over once. */
const LEGACY_DB_NAME = 'sol' + 'craft';

/**
 * Whose saves this device is reading: the id of the wallet character being played, or null (the plain database, used
 * before characters existed and by pages that start a game without signing in). Every character has a database of its
 * own, so a second character starts with no worlds, and deleting one wipes only its own.
 */
let scope: string | null = null;
const scopedName = (): string => (scope ? `${DB_NAME}-${scope}` : DB_NAME);

let legacyChecked: Promise<void> | null = null;

/** Copy every saved world from one database into another (created if needed), then delete the source. */
async function moveDb(fromName: string, toName: string): Promise<void> {
  const from = await openDb(fromName);
  try {
    const stores = [CHUNKS, PLAYERS, WORLDS, SYNC].filter((s) => from.objectStoreNames.contains(s));
    const rtx = from.transaction(stores);
    const data = await Promise.all(
      stores.map(async (s) => {
        const store = rtx.objectStore(s);
        const [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll())]);
        return { s, keys, values };
      }),
    );
    const to = await openDb(toName);
    try {
      const wtx = to.transaction(stores, 'readwrite');
      for (const { s, keys, values } of data) {
        const store = wtx.objectStore(s);
        keys.forEach((k, i) => store.put(values[i], k));
      }
      await done(wtx);
    } catch (err) {
      // Leave no half-filled copy behind: the next start tries again from the old database.
      to.close();
      indexedDB.deleteDatabase(toName);
      throw err;
    } finally {
      to.close();
    }
  } finally {
    from.close();
  }
  await new Promise<void>((resolve) => {
    const del = indexedDB.deleteDatabase(fromName);
    del.onsuccess = del.onerror = del.onblocked = () => resolve();
  });
}

/** Copy every saved world from the pre-rename database into the current one, then delete the old one. */
async function migrateLegacyDb(): Promise<void> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return;
  const names = (await indexedDB.databases()).map((d) => d.name);
  if (!names.includes(LEGACY_DB_NAME) || names.includes(DB_NAME)) return;
  await moveDb(LEGACY_DB_NAME, DB_NAME);
}

/**
 * Worlds saved on this device before characters existed sit in the plain database. The first character that opens the
 * saves takes them over (and the plain database is removed), so nothing a player had is lost in the move.
 */
async function claimPlainDb(name: string): Promise<void> {
  if (name === DB_NAME || typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return;
  const names = (await indexedDB.databases()).map((d) => d.name);
  if (!names.includes(DB_NAME) || names.includes(name)) return;
  await moveDb(DB_NAME, name);
}

function open(name = scopedName()): Promise<IDBDatabase> {
  legacyChecked ??= migrateLegacyDb().catch((err) => console.warn('could not move the old saves over', err));
  return legacyChecked
    .then(() => claimPlainDb(name))
    .catch((err) => console.warn('could not move the saves over to the character', err))
    .then(() => openDb(name));
}
function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CHUNKS)) db.createObjectStore(CHUNKS);
      if (!db.objectStoreNames.contains(PLAYERS)) db.createObjectStore(PLAYERS);
      if (!db.objectStoreNames.contains(WORLDS)) db.createObjectStore(WORLDS);
      if (!db.objectStoreNames.contains(SYNC)) db.createObjectStore(SYNC);
      if (ev.oldVersion === 1) {
        // v1 -> v2: compress every stored chunk. Runs inside the upgrade transaction, so it is all-or-nothing.
        const cursorReq = req.transaction!.objectStore(CHUNKS).openCursor();
        cursorReq.onsuccess = () => {
          const cur = cursorReq.result;
          if (!cur) return;
          const v = cur.value as Uint8Array;
          if (v instanceof Uint8Array && v.length === CHUNK_BYTES) cur.update(encodeChunk(Uint16Array.from(v)));
          else if (v instanceof Uint8Array && v.length === LEGACY_CHUNK_BYTES) {
            // From when the world was 128 tall: same columns, open sky added above.
            const padded = new Uint16Array(CHUNK_BYTES);
            padded.set(v);
            cur.update(encodeChunk(padded));
          } else cur.delete(); // not a chunk we can understand: it will regenerate
          cur.continue();
        };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('close other SolRift tabs to upgrade the save database'));
  });
}

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
  });

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/** One saved world as the title screen lists it. */
export interface SavedWorld {
  seed: number;
  player: PlayerSave;
  /** Isle survival: the day reached, from this same save. */
  day?: number;
}

interface IsleHit {
  name: string;
  seed: number;
  player: PlayerSave;
  day: number;
  at: number;
}

/** Save databases already on this device. Opening a name that is not here would create an empty one. */
async function listedSaveDatabases(): Promise<Set<string>> {
  const names = new Set<string>();
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return names;
  for (const d of await indexedDB.databases()) {
    if (d.name && (d.name === DB_NAME || d.name.startsWith(`${DB_NAME}-`))) names.add(d.name);
  }
  return names;
}

/** Island seeds in one database, with the day stored beside that character. */
async function isleHitsIn(db: IDBDatabase, name: string): Promise<IsleHit[]> {
  if (!db.objectStoreNames.contains(PLAYERS)) return [];
  const playerStore = db.transaction(PLAYERS).objectStore(PLAYERS);
  const [keys, values] = await Promise.all([request(playerStore.getAllKeys()), request(playerStore.getAll())]);
  const hits: IsleHit[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = String(keys[i]);
    const match = /^(-?\d+)-isle$/.exec(key);
    if (!match) continue;
    const seed = Number(match[1]);
    if (!Number.isInteger(seed) || String(seed) !== match[1]) continue;
    let player: PlayerSave | null;
    try {
      player = parsePlayerSave(values[i]);
    } catch {
      continue;
    }
    if (!player) continue;
    let day = player.dy ?? 0;
    if (db.objectStoreNames.contains(WORLDS)) {
      try {
        const state = parseWorldState(await request(db.transaction(WORLDS).objectStore(WORLDS).get(key)));
        const fromWorld = parseIsleSave(state?.isle)?.day ?? 0;
        if (fromWorld > day) day = fromWorld;
      } catch {
        // A world record from a newer game: the day saved on the character still counts.
      }
    }
    hits.push({ name, seed, player, day: day >= 1 ? day : 1, at: player.savedAt ?? 0 });
  }
  return hits;
}

/** Bring one island (its character, its clock and its edited land) into the island database. */
async function copyIsleRecord(fromName: string, seed: number): Promise<void> {
  const worldId = `${seed}-isle`;
  const prefix = `${worldId}:`;
  const from = await openDb(fromName);
  try {
    const player = await request(from.transaction(PLAYERS).objectStore(PLAYERS).get(worldId));
    const world = from.objectStoreNames.contains(WORLDS) ? await request(from.transaction(WORLDS).objectStore(WORLDS).get(worldId)) : undefined;
    const chunks: { key: IDBValidKey; value: unknown }[] = [];
    if (from.objectStoreNames.contains(CHUNKS)) {
      await new Promise<void>((resolve, reject) => {
        const req = from.transaction(CHUNKS).objectStore(CHUNKS).openCursor();
        req.onsuccess = () => {
          const cur = req.result;
          if (!cur) return resolve();
          if (String(cur.key).startsWith(prefix)) chunks.push({ key: cur.key, value: cur.value });
          cur.continue();
        };
        req.onerror = () => reject(req.error);
      });
    }
    const to = await open(ISLE_DB);
    try {
      const tx = to.transaction([PLAYERS, WORLDS, CHUNKS], 'readwrite');
      const blocks = tx.objectStore(CHUNKS);
      await new Promise<void>((resolve, reject) => {
        const req = blocks.openCursor();
        req.onsuccess = () => {
          const cur = req.result;
          if (!cur) {
            if (player !== undefined) tx.objectStore(PLAYERS).put(player, worldId);
            if (world !== undefined) tx.objectStore(WORLDS).put(world, worldId);
            for (const c of chunks) blocks.put(c.value, c.key);
            resolve();
            return;
          }
          if (String(cur.key).startsWith(prefix)) cur.delete();
          cur.continue();
        };
        req.onerror = () => reject(req.error);
      });
      await done(tx);
    } finally {
      to.close();
    }
  } finally {
    from.close();
  }
}

export class LocalSaveStore implements SaveStore {
  /** Every world on this device that has a player record, newest first. */
  static async listWorlds(): Promise<SavedWorld[]> {
    const db = await open();
    const store = db.transaction(PLAYERS).objectStore(PLAYERS);
    const [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll())]);
    const out: SavedWorld[] = [];
    keys.forEach((key, i) => {
      const seed = Number(key);
      if (!Number.isInteger(seed) || String(seed) !== String(key)) return;
      try {
        const player = parsePlayerSave(values[i]);
        if (player) out.push({ seed, player });
      } catch {
        // a save from a newer version: leave it out of the list, never touch it
      }
    });
    return out.sort((a, b) => (b.player.savedAt ?? 0) - (a.player.savedAt ?? 0));
  }

  /**
   * The one island on this device, or null. The newest character wins, including one that was saved
   * into a signed-in character's database. It is copied into the island database, and any older island there is removed.
   */
  static async isleWorld(): Promise<SavedWorld | null> {
    const listed = await listedSaveDatabases();
    const names = new Set(listed);
    names.add(ISLE_DB);
    const hits: IsleHit[] = [];
    for (const name of names) {
      let db: IDBDatabase;
      try {
        db = name === ISLE_DB && !listed.has(ISLE_DB) ? await open(ISLE_DB) : await openDb(name);
      } catch {
        continue;
      }
      try {
        hits.push(...(await isleHitsIn(db, name)));
      } catch {
        // This database could not be read. The others still count.
      } finally {
        db.close();
      }
    }
    hits.sort((a, b) => b.at - a.at || b.day - a.day);
    let best: IsleHit | null = hits[0] ?? null;
    if (!best) return null;
    if (best.name !== ISLE_DB) {
      try {
        await copyIsleRecord(best.name, best.seed);
      } catch (err) {
        console.warn('could not bring the island save across', err);
        best = hits.find((h) => h.name === ISLE_DB) ?? null;
      }
    }
    if (!best) return null;
    const keep = best;
    for (const extra of hits) {
      if (extra.name === ISLE_DB && extra.seed !== keep.seed) await LocalSaveStore.dropIsle(extra.seed);
    }
    return { seed: keep.seed, player: keep.player, day: keep.day };
  }

  /** Forget one island seed: its chunks, its player, and the recipe book for that seed. Scope must be 'isle'. */
  static async dropIsle(seed: number): Promise<void> {
    await new LocalSaveStore(`${seed}-isle`).clear();
    try {
      localStorage.removeItem(`solrift-recipes-${LocalSaveStore.scopeKey()}${seed}-isle`);
    } catch {
      /* storage blocked: the world itself is already gone */
    }
  }

  /** Play this wallet character's saves from now on (null: the plain database). Games and cloud syncs started after this use it. */
  static setScope(characterId: string | null): void {
    scope = characterId;
  }

  /** Prefix for per-character localStorage keys (the recipe book): empty without a character. */
  static scopeKey(): string {
    return scope ? `${scope}-` : '';
  }

  /**
   * Remove every world of the current character on this device (and each one's cloud bookkeeping and recipe book);
   * used when the character is deleted along with its progress. Other characters keep theirs.
   */
  static async clearAll(): Promise<void> {
    const name = scopedName();
    const db = await open();
    const tx = db.transaction([CHUNKS, PLAYERS, WORLDS, SYNC], 'readwrite');
    for (const s of [CHUNKS, PLAYERS, WORLDS, SYNC]) tx.objectStore(s).clear();
    await done(tx);
    db.close();
    // The emptied database of a deleted character is not needed any more (if another tab holds it open, it stays empty).
    if (name !== DB_NAME) indexedDB.deleteDatabase(name);
    try {
      const prefix = `solrift-recipes-${LocalSaveStore.scopeKey()}`;
      for (const k of Object.keys(localStorage)) {
        // Without a character (the plain book) only keys that no character owns: they have no id in front.
        if (k.startsWith(prefix) && (scope !== null || !/^solrift-recipes-[0-9a-f]{8}-/.test(k))) localStorage.removeItem(k);
      }
    } catch {
      /* storage blocked: nothing to remove */
    }
  }

  private dbp: Promise<IDBDatabase> | null = null;
  private frozen = false;
  /** Island worlds ignore the signed-in character and always use the island database. */
  private readonly dbName: string | null;

  constructor(private readonly worldId: string) {
    this.dbName = worldId.endsWith('-isle') ? ISLE_DB : null;
  }

  private db(): Promise<IDBDatabase> {
    return (this.dbp ??= open(this.dbName ?? undefined));
  }

  private chunkKey(cx: number, cz: number): string {
    return `${this.worldId}:${cx},${cz}`;
  }

  /** After this, every write is silently dropped (used while a world is being imported or is unreadable). */
  freeze(): void {
    this.frozen = true;
  }

  async loadPlayer(): Promise<PlayerSave | null> {
    const db = await this.db();
    return parsePlayerSave(await request(db.transaction(PLAYERS).objectStore(PLAYERS).get(this.worldId)));
  }

  async savePlayer(save: PlayerSave): Promise<void> {
    if (this.frozen) return;
    const db = await this.db();
    const tx = db.transaction([PLAYERS, SYNC], 'readwrite');
    tx.objectStore(PLAYERS).put({ ...save, savedAt: Date.now() }, this.worldId);
    markDirty(tx, this.worldId, [META]);
    await done(tx);
  }

  async loadWorldState(): Promise<WorldState | null> {
    const db = await this.db();
    return parseWorldState(await request(db.transaction(WORLDS).objectStore(WORLDS).get(this.worldId)));
  }

  async saveWorldState(state: WorldState): Promise<void> {
    if (this.frozen) return;
    const db = await this.db();
    const tx = db.transaction([WORLDS, SYNC], 'readwrite');
    tx.objectStore(WORLDS).put(state, this.worldId);
    markDirty(tx, this.worldId, [META]);
    await done(tx);
  }

  private async encodedChunks(): Promise<{ cx: number; cz: number; encoded: Uint8Array }[]> {
    const db = await this.db();
    const prefix = `${this.worldId}:`;
    return new Promise((resolve, reject) => {
      const out: { cx: number; cz: number; encoded: Uint8Array }[] = [];
      const req = db.transaction(CHUNKS).objectStore(CHUNKS).openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve(out);
        const k = String(cur.key);
        if (k.startsWith(prefix)) {
          const [cx, cz] = k.slice(prefix.length).split(',').map(Number);
          if (Number.isInteger(cx) && Number.isInteger(cz) && cur.value instanceof Uint8Array) out.push({ cx, cz, encoded: cur.value });
        }
        cur.continue();
      };
      req.onerror = () => reject(req.error);
    });
  }

  async loadChunks(): Promise<Map<string, Uint16Array>> {
    const out = new Map<string, Uint16Array>();
    for (const c of await this.encodedChunks()) {
      try {
        out.set(`${c.cx},${c.cz}`, decodeChunk(c.encoded));
      } catch (err) {
        console.warn(`dropping unreadable chunk ${c.cx},${c.cz}`, err);
      }
    }
    return out;
  }

  async saveChunks(chunks: Iterable<[number, number, Uint16Array]>): Promise<void> {
    if (this.frozen) return;
    const db = await this.db();
    const tx = db.transaction([CHUNKS, SYNC], 'readwrite');
    const store = tx.objectStore(CHUNKS);
    const keys: string[] = [];
    for (const [cx, cz, data] of chunks) {
      store.put(encodeChunk(data), this.chunkKey(cx, cz));
      keys.push(`${cx},${cz}`);
    }
    markDirty(tx, this.worldId, keys);
    await done(tx);
  }

  async readWorldFile(seed: number): Promise<WorldFile> {
    return {
      seed,
      created: Date.now(),
      player: await this.loadPlayer(),
      world: await this.loadWorldState(),
      chunks: await this.encodedChunks(),
    };
  }

  /**
   * Replace the whole world. With `sync` (downloading the cloud copy) that record is stored with it.
   * Without it (importing a file) a syncing world is flagged so the next upload overwrites the cloud copy.
   */
  async replaceWorld(file: WorldFile, sync?: SyncRecord): Promise<void> {
    const db = await this.db();
    const tx = db.transaction([CHUNKS, PLAYERS, WORLDS, SYNC], 'readwrite');
    const syncs = tx.objectStore(SYNC);
    if (sync) syncs.put(sync, this.worldId);
    else {
      const existing = syncs.get(this.worldId);
      existing.onsuccess = () => {
        const rec = parseSync(existing.result);
        if (rec) syncs.put({ ...rec, dirty: {}, full: true }, this.worldId);
      };
    }
    const chunks = tx.objectStore(CHUNKS);
    const prefix = `${this.worldId}:`;
    const cursorReq = chunks.openCursor();
    cursorReq.onsuccess = () => {
      const cur = cursorReq.result;
      if (cur) {
        if (String(cur.key).startsWith(prefix)) cur.delete();
        cur.continue();
        return;
      }
      for (const c of file.chunks) chunks.put(c.encoded, this.chunkKey(c.cx, c.cz));
    };
    const players = tx.objectStore(PLAYERS);
    const worlds = tx.objectStore(WORLDS);
    if (file.player) players.put(file.player, this.worldId);
    else players.delete(this.worldId);
    if (file.world) worlds.put(file.world, this.worldId);
    else worlds.delete(this.worldId);
    await done(tx);
  }

  // ---- cloud sync bookkeeping -------------------------------------------------------------------

  async getSync(): Promise<SyncRecord | null> {
    const db = await this.db();
    return parseSync(await request(db.transaction(SYNC).objectStore(SYNC).get(this.worldId)));
  }

  async putSync(rec: SyncRecord): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(SYNC, 'readwrite');
    tx.objectStore(SYNC).put(rec, this.worldId);
    await done(tx);
  }

  async clearSyncRecord(): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(SYNC, 'readwrite');
    tx.objectStore(SYNC).delete(this.worldId);
    await done(tx);
  }

  /** True when this device has anything worth keeping: a player record or any edited chunk. */
  async hasData(): Promise<boolean> {
    if (await this.loadPlayer()) return true;
    const db = await this.db();
    const prefix = `${this.worldId}:`;
    const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
    return (await request(db.transaction(CHUNKS).objectStore(CHUNKS).count(range))) > 0;
  }

  /** Every edited chunk key ("cx,cz") in this world. */
  async chunkKeys(): Promise<string[]> {
    return (await this.encodedChunks()).map((c) => `${c.cx},${c.cz}`);
  }

  /** The stored (compressed) bytes of some chunks. Chunks that no longer exist are skipped. */
  async readEncoded(keys: string[]): Promise<{ cx: number; cz: number; encoded: Uint8Array }[]> {
    const db = await this.db();
    const store = db.transaction(CHUNKS).objectStore(CHUNKS);
    const out: { cx: number; cz: number; encoded: Uint8Array }[] = [];
    await Promise.all(
      keys.map(async (k) => {
        const [cx, cz] = k.split(',').map(Number);
        if (!Number.isInteger(cx) || !Number.isInteger(cz)) return;
        const value = await request(store.get(this.chunkKey(cx, cz)));
        if (value instanceof Uint8Array) out.push({ cx, cz, encoded: value });
      }),
    );
    return out;
  }

  /**
   * Mark every chunk and the player record as changed, so the next upload sends the whole world.
   * Returns the record as stored (its `seq` is the snapshot to pass to `commitSync`).
   */
  async markAllDirty(): Promise<SyncRecord | null> {
    const rec = await this.getSync();
    if (!rec) return null;
    const keys = [...(await this.chunkKeys()), META];
    const db = await this.db();
    const tx = db.transaction(SYNC, 'readwrite');
    const store = tx.objectStore(SYNC);
    const next: SyncRecord = { ...rec, seq: rec.seq + 1, dirty: { ...rec.dirty } };
    for (const k of keys) next.dirty[k] = next.seq;
    store.put(next, this.worldId);
    await done(tx);
    return next;
  }

  /**
   * An upload succeeded: remember the new cloud revision and forget the changes it covered. Writes
   * that happened while it ran have a higher sequence number and stay dirty.
   */
  async commitSync(revision: number, sent: string[], snapshotSeq: number, clearFull: boolean): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(SYNC, 'readwrite');
    const store = tx.objectStore(SYNC);
    const req = store.get(this.worldId);
    req.onsuccess = () => {
      const rec = parseSync(req.result);
      if (!rec) return;
      for (const k of sent) if ((rec.dirty[k] ?? Infinity) <= snapshotSeq) delete rec.dirty[k];
      rec.revision = revision;
      if (clearFull) rec.full = false;
      store.put(rec, this.worldId);
    };
    await done(tx);
  }

  async clear(): Promise<void> {
    const db = await this.db();
    const tx = db.transaction([CHUNKS, PLAYERS, WORLDS, SYNC], 'readwrite');
    tx.objectStore(SYNC).delete(this.worldId);
    const prefix = `${this.worldId}:`;
    const cursorReq = tx.objectStore(CHUNKS).openCursor();
    cursorReq.onsuccess = () => {
      const cur = cursorReq.result;
      if (!cur) return;
      if (String(cur.key).startsWith(prefix)) cur.delete();
      cur.continue();
    };
    tx.objectStore(PLAYERS).delete(this.worldId);
    tx.objectStore(WORLDS).delete(this.worldId);
    await done(tx);
  }

  /**
   * Early builds kept the player and chests in localStorage under `solrift.player.<seed>` and
   * `solrift.be.<seed>`. Move them into IndexedDB once, then remove the old keys.
   */
  async importLegacy(): Promise<boolean> {
    try {
      const playerKey = `solrift.player.${this.worldId}`;
      const beKey = `solrift.be.${this.worldId}`;
      const rawPlayer = localStorage.getItem(playerKey);
      const rawBe = localStorage.getItem(beKey);
      if (rawPlayer === null && rawBe === null) return false;
      if ((await this.loadPlayer()) || (await this.loadWorldState())) {
        // Already migrated (or the player has started over); the stale copies would only confuse things.
        localStorage.removeItem(playerKey);
        localStorage.removeItem(beKey);
        return false;
      }
      const { player, world } = migrateLegacySave(rawPlayer ? JSON.parse(rawPlayer) : null, rawBe ? JSON.parse(rawBe) : null);
      if (player) await this.savePlayer(player);
      if (world) await this.saveWorldState(world);
      localStorage.removeItem(playerKey);
      localStorage.removeItem(beKey);
      return true;
    } catch (err) {
      console.warn('legacy save import failed', err);
      return false;
    }
  }
}
