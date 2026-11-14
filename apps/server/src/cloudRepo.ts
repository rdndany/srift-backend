import type { DatabaseSync } from 'node:sqlite';

/** One cloud-saved world. The chunks live in their own table; this row is the manifest. */
export interface CloudWorld {
  accountId: string;
  worldId: string;
  seed: number;
  /** Bumped by every committed push. A push based on an older number is a conflict. */
  revision: number;
  createdAt: number;
  updatedAt: number;
  leaseHolder: string | null;
  leaseUntil: number;
  /** PlayerSave and WorldState as JSON text (already validated by the service). */
  player: string | null;
  world: string | null;
  metaBytes: number;
  chunkCount: number;
  chunkBytes: number;
}

export interface StoredChunk {
  cx: number;
  cz: number;
  data: Uint8Array;
}

export interface StoredBackup {
  id: number;
  revision: number;
  createdAt: number;
  kind: string;
  bytes: number;
}

export interface WorldPatch {
  revision: number;
  updatedAt: number;
  player?: string | null;
  world?: string | null;
  metaBytes?: number;
  leaseHolder?: string | null;
  leaseUntil?: number;
}

/**
 * Persistence contract for cloud saves. SQLite (blobs in the database) serves development and tests.
 * Production keeps this interface and moves chunk and backup blobs to S3/R2 with Postgres rows.
 */
export interface CloudRepo {
  /** Run `fn` atomically: everything it writes commits together or not at all. Not re-entrant. */
  transaction<T>(fn: () => T): T;
  getWorld(accountId: string, worldId: string): CloudWorld | null;
  listWorlds(accountId: string): CloudWorld[];
  /** Live bytes (chunks plus player/world JSON) across all of an account's worlds. */
  accountBytes(accountId: string): number;
  insertWorld(w: { accountId: string; worldId: string; seed: number; now: number; leaseHolder: string | null; leaseUntil: number }): void;
  updateWorld(accountId: string, worldId: string, patch: WorldPatch): void;
  deleteWorld(accountId: string, worldId: string): void;
  deleteChunks(accountId: string, worldId: string): void;
  putChunks(accountId: string, worldId: string, chunks: StoredChunk[]): void;
  getChunks(accountId: string, worldId: string): StoredChunk[];
  addBackup(accountId: string, worldId: string, b: { revision: number; createdAt: number; kind: string; data: Uint8Array }): number;
  listBackups(accountId: string, worldId: string): StoredBackup[];
  getBackup(accountId: string, worldId: string, id: number): (StoredBackup & { data: Uint8Array }) | null;
  /** Keep the newest `keep` backups and delete the rest. */
  pruneBackups(accountId: string, worldId: string, keep: number): void;
}

interface WorldRow {
  account_id: string;
  world_id: string;
  seed: number;
  revision: number;
  created_at: number;
  updated_at: number;
  lease_holder: string | null;
  lease_until: number;
  player: string | null;
  world: string | null;
  meta_bytes: number;
  chunk_count: number;
  chunk_bytes: number;
}

const toWorld = (r: WorldRow): CloudWorld => ({
  accountId: r.account_id,
  worldId: r.world_id,
  seed: r.seed,
  revision: r.revision,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  leaseHolder: r.lease_holder,
  leaseUntil: r.lease_until,
  player: r.player,
  world: r.world,
  metaBytes: r.meta_bytes,
  chunkCount: r.chunk_count,
  chunkBytes: r.chunk_bytes,
});

const WORLD_SELECT = `
  SELECT w.*,
         (SELECT COUNT(*) FROM cloud_chunks c WHERE c.account_id = w.account_id AND c.world_id = w.world_id) AS chunk_count,
         (SELECT COALESCE(SUM(c.bytes), 0) FROM cloud_chunks c WHERE c.account_id = w.account_id AND c.world_id = w.world_id) AS chunk_bytes
    FROM cloud_worlds w`;

export class SqliteCloud implements CloudRepo {
  private inTransaction = false;

  constructor(private readonly db: DatabaseSync) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cloud_worlds (
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        world_id TEXT NOT NULL,
        seed INTEGER NOT NULL,
        revision INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        lease_holder TEXT,
        lease_until INTEGER NOT NULL DEFAULT 0,
        player TEXT,
        world TEXT,
        meta_bytes INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (account_id, world_id)
      );
      CREATE TABLE IF NOT EXISTS cloud_chunks (
        account_id TEXT NOT NULL,
        world_id TEXT NOT NULL,
        cx INTEGER NOT NULL,
        cz INTEGER NOT NULL,
        data BLOB NOT NULL,
        bytes INTEGER NOT NULL,
        PRIMARY KEY (account_id, world_id, cx, cz),
        FOREIGN KEY (account_id, world_id) REFERENCES cloud_worlds(account_id, world_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS cloud_backups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id TEXT NOT NULL,
        world_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        kind TEXT NOT NULL,
        bytes INTEGER NOT NULL,
        data BLOB NOT NULL,
        FOREIGN KEY (account_id, world_id) REFERENCES cloud_worlds(account_id, world_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS cloud_backups_world ON cloud_backups(account_id, world_id, id);
    `);
  }

  transaction<T>(fn: () => T): T {
    if (this.inTransaction) throw new Error('nested transactions are not supported');
    this.db.exec('BEGIN IMMEDIATE');
    this.inTransaction = true;
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    } finally {
      this.inTransaction = false;
    }
  }

  getWorld(accountId: string, worldId: string): CloudWorld | null {
    const row = this.db.prepare(`${WORLD_SELECT} WHERE w.account_id = ? AND w.world_id = ?`).get(accountId, worldId) as unknown as WorldRow | undefined;
    return row ? toWorld(row) : null;
  }

  listWorlds(accountId: string): CloudWorld[] {
    const rows = this.db.prepare(`${WORLD_SELECT} WHERE w.account_id = ? ORDER BY w.updated_at DESC`).all(accountId) as unknown as WorldRow[];
    return rows.map(toWorld);
  }

  accountBytes(accountId: string): number {
    const chunks = this.db.prepare('SELECT COALESCE(SUM(bytes), 0) AS n FROM cloud_chunks WHERE account_id = ?').get(accountId) as unknown as { n: number };
    const meta = this.db.prepare('SELECT COALESCE(SUM(meta_bytes), 0) AS n FROM cloud_worlds WHERE account_id = ?').get(accountId) as unknown as { n: number };
    return Number(chunks.n) + Number(meta.n);
  }

  insertWorld(w: { accountId: string; worldId: string; seed: number; now: number; leaseHolder: string | null; leaseUntil: number }): void {
    this.db
      .prepare('INSERT INTO cloud_worlds (account_id, world_id, seed, revision, created_at, updated_at, lease_holder, lease_until) VALUES (?, ?, ?, 0, ?, ?, ?, ?)')
      .run(w.accountId, w.worldId, w.seed, w.now, w.now, w.leaseHolder, w.leaseUntil);
  }

  updateWorld(accountId: string, worldId: string, p: WorldPatch): void {
    const sets = ['revision = ?', 'updated_at = ?'];
    const args: (string | number | null)[] = [p.revision, p.updatedAt];
    if (p.player !== undefined) (sets.push('player = ?'), args.push(p.player));
    if (p.world !== undefined) (sets.push('world = ?'), args.push(p.world));
    if (p.metaBytes !== undefined) (sets.push('meta_bytes = ?'), args.push(p.metaBytes));
    if (p.leaseHolder !== undefined) (sets.push('lease_holder = ?'), args.push(p.leaseHolder));
    if (p.leaseUntil !== undefined) (sets.push('lease_until = ?'), args.push(p.leaseUntil));
    this.db.prepare(`UPDATE cloud_worlds SET ${sets.join(', ')} WHERE account_id = ? AND world_id = ?`).run(...args, accountId, worldId);
  }

  deleteWorld(accountId: string, worldId: string): void {
    // Chunks and backups follow through ON DELETE CASCADE.
    this.db.prepare('DELETE FROM cloud_worlds WHERE account_id = ? AND world_id = ?').run(accountId, worldId);
  }

  deleteChunks(accountId: string, worldId: string): void {
    this.db.prepare('DELETE FROM cloud_chunks WHERE account_id = ? AND world_id = ?').run(accountId, worldId);
  }

  putChunks(accountId: string, worldId: string, chunks: StoredChunk[]): void {
    const stmt = this.db.prepare(
      `INSERT INTO cloud_chunks (account_id, world_id, cx, cz, data, bytes) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id, world_id, cx, cz) DO UPDATE SET data = excluded.data, bytes = excluded.bytes`,
    );
    for (const c of chunks) stmt.run(accountId, worldId, c.cx, c.cz, c.data, c.data.length);
  }

  getChunks(accountId: string, worldId: string): StoredChunk[] {
    const rows = this.db.prepare('SELECT cx, cz, data FROM cloud_chunks WHERE account_id = ? AND world_id = ? ORDER BY cx, cz').all(accountId, worldId) as unknown as {
      cx: number;
      cz: number;
      data: Uint8Array;
    }[];
    return rows.map((r) => ({ cx: r.cx, cz: r.cz, data: new Uint8Array(r.data) }));
  }

  addBackup(accountId: string, worldId: string, b: { revision: number; createdAt: number; kind: string; data: Uint8Array }): number {
    const res = this.db
      .prepare('INSERT INTO cloud_backups (account_id, world_id, revision, created_at, kind, bytes, data) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(accountId, worldId, b.revision, b.createdAt, b.kind, b.data.length, b.data);
    return Number(res.lastInsertRowid);
  }

  listBackups(accountId: string, worldId: string): StoredBackup[] {
    const rows = this.db
      .prepare('SELECT id, revision, created_at, kind, bytes FROM cloud_backups WHERE account_id = ? AND world_id = ? ORDER BY id DESC')
      .all(accountId, worldId) as unknown as { id: number; revision: number; created_at: number; kind: string; bytes: number }[];
    return rows.map((r) => ({ id: r.id, revision: r.revision, createdAt: r.created_at, kind: r.kind, bytes: r.bytes }));
  }

  getBackup(accountId: string, worldId: string, id: number): (StoredBackup & { data: Uint8Array }) | null {
    const r = this.db
      .prepare('SELECT id, revision, created_at, kind, bytes, data FROM cloud_backups WHERE account_id = ? AND world_id = ? AND id = ?')
      .get(accountId, worldId, id) as unknown as { id: number; revision: number; created_at: number; kind: string; bytes: number; data: Uint8Array } | undefined;
    return r ? { id: r.id, revision: r.revision, createdAt: r.created_at, kind: r.kind, bytes: r.bytes, data: new Uint8Array(r.data) } : null;
  }

  pruneBackups(accountId: string, worldId: string, keep: number): void {
    this.db
      .prepare(
        `DELETE FROM cloud_backups WHERE account_id = ? AND world_id = ?
           AND id NOT IN (SELECT id FROM cloud_backups WHERE account_id = ? AND world_id = ? ORDER BY id DESC LIMIT ?)`,
      )
      .run(accountId, worldId, accountId, worldId, keep);
  }
}
