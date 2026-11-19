import type { DatabaseSync } from 'node:sqlite';
import { decodeChunk, encodeChunk } from '@solrift/shared';

/** What the multiplayer room persists: the edited chunks of its world, and small JSON records. */
export interface RoomStore {
  /** Edited chunks of the world with this seed (a different seed is a different world). */
  loadChunks(seed: number): { cx: number; cz: number; data: Uint16Array }[];
  saveChunks(seed: number, chunks: { cx: number; cz: number; data: Uint16Array }[]): void;
  /** Forget every edited chunk of the world with this seed (its terrain was regenerated, so they no longer fit). */
  /** Forget every edited chunk of the world with this seed (its terrain was regenerated, so they no longer fit). */
  clearChunks(seed: number): void;
  getJson(key: string): unknown | null;
  setJson(key: string, value: unknown): void;
  deleteJson(key: string): void;
  /** Write several records as one: all of them are kept or none (an item that moves between a player and a stash must not be lost or made twice). */
  setJsonBatch?(entries: [key: string, value: unknown][]): void;
}

export class MemoryRoomStore implements RoomStore {
  private readonly chunks = new Map<string, Uint8Array>();
  private readonly kv = new Map<string, string>();

  loadChunks(seed: number): { cx: number; cz: number; data: Uint16Array }[] {
    const out: { cx: number; cz: number; data: Uint16Array }[] = [];
    for (const [k, v] of this.chunks) {
      const [s, cx, cz] = k.split(',').map(Number);
      if (s === seed) out.push({ cx, cz, data: decodeChunk(v) });
    }
    return out;
  }

  saveChunks(seed: number, chunks: { cx: number; cz: number; data: Uint16Array }[]): void {
    for (const c of chunks) this.chunks.set(`${seed},${c.cx},${c.cz}`, encodeChunk(c.data));
  }

  clearChunks(seed: number): void {
    for (const k of [...this.chunks.keys()]) if (k.startsWith(`${seed},`)) this.chunks.delete(k);
  }

  getJson(key: string): unknown | null {
    const v = this.kv.get(key);
    return v === undefined ? null : JSON.parse(v);
  }

  setJson(key: string, value: unknown): void {
    this.kv.set(key, JSON.stringify(value));
  }

  deleteJson(key: string): void {
    this.kv.delete(key);
  }

  setJsonBatch(entries: [string, unknown][]): void {
    const text = entries.map(([k, v]) => [k, JSON.stringify(v)] as const);
    for (const [k, v] of text) this.kv.set(k, v);
  }
}

export class SqliteRoomStore implements RoomStore {
  constructor(private readonly db: DatabaseSync) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS room_chunks (
        seed INTEGER NOT NULL,
        cx INTEGER NOT NULL,
        cz INTEGER NOT NULL,
        data BLOB NOT NULL,
        PRIMARY KEY (seed, cx, cz)
      );
      CREATE TABLE IF NOT EXISTS room_kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  loadChunks(seed: number): { cx: number; cz: number; data: Uint16Array }[] {
    const rows = this.db.prepare('SELECT cx, cz, data FROM room_chunks WHERE seed = ?').all(seed) as unknown as { cx: number; cz: number; data: Uint16Array }[];
    const out: { cx: number; cz: number; data: Uint16Array }[] = [];
    for (const r of rows) {
      try {
        out.push({ cx: r.cx, cz: r.cz, data: decodeChunk(new Uint8Array(r.data)) });
      } catch {
        console.warn(`[solrift] skipping unreadable chunk ${r.cx},${r.cz}`);
      }
    }
    return out;
  }

  saveChunks(seed: number, chunks: { cx: number; cz: number; data: Uint16Array }[]): void {
    if (chunks.length === 0) return;
    const stmt = this.db.prepare('INSERT INTO room_chunks (seed, cx, cz, data) VALUES (?, ?, ?, ?) ON CONFLICT(seed, cx, cz) DO UPDATE SET data = excluded.data');
    this.db.exec('BEGIN');
    try {
      for (const c of chunks) stmt.run(seed, c.cx, c.cz, encodeChunk(c.data));
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  clearChunks(seed: number): void {
    this.db.prepare('DELETE FROM room_chunks WHERE seed = ?').run(seed);
  }

  getJson(key: string): unknown | null {
    const row = this.db.prepare('SELECT value FROM room_kv WHERE key = ?').get(key) as unknown as { value: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.value);
    } catch {
      return null;
    }
  }

  setJson(key: string, value: unknown): void {
    this.db.prepare('INSERT INTO room_kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
  }

  deleteJson(key: string): void {
    this.db.prepare('DELETE FROM room_kv WHERE key = ?').run(key);
  }

  setJsonBatch(entries: [string, unknown][]): void {
    const stmt = this.db.prepare('INSERT INTO room_kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    const text = entries.map(([k, v]) => [k, JSON.stringify(v)] as const);
    this.db.exec('BEGIN');
    try {
      for (const [k, v] of text) stmt.run(k, v);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}
