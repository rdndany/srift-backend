import type { DatabaseSync } from 'node:sqlite';
import { unKey } from '@solrift/shared';
import type { AdminLogRecord, ClaimRecord, Grant, LandStore, LedgerDrain, ModEntry, Perms, RecoveryRecord, TxnRecord } from '@solrift/shared';

/**
 * Land in SQLite. Tables:
 *
 *   land_claims          one row per claim (the polygon, the original ground, what was paid, its status)
 *   claim_permissions    one row per invited player or guild
 *   world_modifications  one row per changed block: what the generator made, what is there now, who changed it and when it is due
 *   restoration_jobs     one row per region of temporary changes, with its due time (what the admin tools and the clock look at)
 *   claim_transactions   every purchase, expansion and refund, and whether it completed; the idempotency keys live here
 *   land_recovery        things taken out of containers the wilderness took back
 *   land_meta, land_admin_log
 *
 * A purchase is one SQL transaction (`commitTxn`): the Auren, the deed and the receipt are written together or not at all.
 */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS land_claims (
    id TEXT PRIMARY KEY,
    world TEXT NOT NULL,
    owner_type TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    name TEXT NOT NULL,
    vertices TEXT NOT NULL,
    depth INTEGER NOT NULL,
    height INTEGER NOT NULL,
    ground TEXT NOT NULL,
    price INTEGER NOT NULL,
    paid INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    status TEXT NOT NULL,
    release_at INTEGER,
    rev INTEGER NOT NULL,
    public_perms TEXT NOT NULL,
    guild_role TEXT NOT NULL,
    last_active INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS land_claims_world ON land_claims(world, status);
  CREATE INDEX IF NOT EXISTS land_claims_owner ON land_claims(world, owner_type, owner_id);
  CREATE TABLE IF NOT EXISTS claim_permissions (
    claim_id TEXT NOT NULL REFERENCES land_claims(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    overrides TEXT,
    PRIMARY KEY (claim_id, kind, subject_id)
  );
  CREATE INDEX IF NOT EXISTS claim_permissions_subject ON claim_permissions(kind, subject_id);
  CREATE TABLE IF NOT EXISTS world_modifications (
    world TEXT NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    z INTEGER NOT NULL,
    cx INTEGER NOT NULL,
    cz INTEGER NOT NULL,
    base INTEGER NOT NULL,
    cur INTEGER NOT NULL,
    cls TEXT NOT NULL,
    claim_id TEXT,
    region INTEGER NOT NULL,
    by_account TEXT,
    first_at INTEGER NOT NULL,
    changed_at INTEGER NOT NULL,
    due INTEGER NOT NULL,
    cat TEXT NOT NULL,
    rev INTEGER NOT NULL,
    PRIMARY KEY (world, x, y, z)
  ) WITHOUT ROWID;
  CREATE INDEX IF NOT EXISTS world_modifications_chunk ON world_modifications(world, cx, cz);
  CREATE INDEX IF NOT EXISTS world_modifications_due ON world_modifications(world, cls, due);
  CREATE INDEX IF NOT EXISTS world_modifications_claim ON world_modifications(world, claim_id);
  CREATE INDEX IF NOT EXISTS world_modifications_region ON world_modifications(world, region);
  CREATE TABLE IF NOT EXISTS restoration_jobs (
    world TEXT NOT NULL,
    region INTEGER NOT NULL,
    due INTEGER NOT NULL,
    blocks INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (world, region)
  ) WITHOUT ROWID;
  CREATE INDEX IF NOT EXISTS restoration_jobs_due ON restoration_jobs(world, due);
  CREATE TABLE IF NOT EXISTS claim_transactions (
    id TEXT PRIMARY KEY,
    world TEXT NOT NULL,
    player_key TEXT NOT NULL,
    claim_id TEXT,
    kind TEXT NOT NULL,
    amount INTEGER NOT NULL,
    idem TEXT NOT NULL,
    state TEXT NOT NULL,
    note TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS claim_transactions_idem ON claim_transactions(world, player_key, idem);
  CREATE INDEX IF NOT EXISTS claim_transactions_state ON claim_transactions(world, state);
  CREATE INDEX IF NOT EXISTS claim_transactions_player ON claim_transactions(world, player_key, created_at);
  CREATE TABLE IF NOT EXISTS land_recovery (
    id TEXT PRIMARY KEY,
    world TEXT NOT NULL,
    owner_key TEXT NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    z INTEGER NOT NULL,
    items TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS land_recovery_owner ON land_recovery(world, owner_key);
  CREATE TABLE IF NOT EXISTS land_meta (
    world TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (world, key)
  ) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS land_admin_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    world TEXT NOT NULL,
    admin TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS land_admin_log_world ON land_admin_log(world, at);
`;

type Row = Record<string, unknown>;

export class SqliteLandStore implements LandStore {
  constructor(private readonly db: DatabaseSync) {
    this.db.exec(SCHEMA);
  }

  /** Run `fn` as one transaction (nested use joins the outer one). */
  private tx<T>(fn: () => T): T {
    if (this.db.isTransaction) return fn();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const r = fn();
      this.db.exec('COMMIT');
      return r;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  // ---- claims ----

  private writeClaim(c: ClaimRecord): void {
    this.db
      .prepare(
        `INSERT INTO land_claims (id, world, owner_type, owner_id, owner_name, name, vertices, depth, height, ground, price, paid, created_at, updated_at, status, release_at, rev, public_perms, guild_role, last_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET owner_type = excluded.owner_type, owner_id = excluded.owner_id, owner_name = excluded.owner_name, name = excluded.name,
           vertices = excluded.vertices, depth = excluded.depth, height = excluded.height, ground = excluded.ground, price = excluded.price, paid = excluded.paid,
           updated_at = excluded.updated_at, status = excluded.status, release_at = excluded.release_at, rev = excluded.rev, public_perms = excluded.public_perms,
           guild_role = excluded.guild_role, last_active = excluded.last_active`,
      )
      .run(
        c.id, c.world, c.ownerType, c.ownerId, c.ownerName, c.name, JSON.stringify(c.vertices), c.depth, c.height, c.ground, c.price, c.paid,
        c.createdAt, c.updatedAt, c.status, c.releaseAt, c.rev, JSON.stringify(c.publicPerms), c.guildRole, c.lastActive,
      );
    this.db.prepare('DELETE FROM claim_permissions WHERE claim_id = ?').run(c.id);
    const ins = this.db.prepare('INSERT INTO claim_permissions (claim_id, kind, subject_id, name, role, overrides) VALUES (?, ?, ?, ?, ?, ?)');
    for (const g of c.grants) ins.run(c.id, g.kind, g.id, g.name, g.role, g.overrides ? JSON.stringify(g.overrides) : null);
  }

  saveClaim(rec: ClaimRecord): void {
    this.tx(() => this.writeClaim(rec));
  }

  loadClaims(world: string): ClaimRecord[] {
    const rows = this.db.prepare('SELECT * FROM land_claims WHERE world = ?').all(world) as Row[];
    const grants = this.db
      .prepare('SELECT p.* FROM claim_permissions p JOIN land_claims c ON c.id = p.claim_id WHERE c.world = ?')
      .all(world) as Row[];
    const byClaim = new Map<string, Grant[]>();
    for (const g of grants) {
      const list = byClaim.get(g.claim_id as string) ?? [];
      list.push({
        kind: g.kind as Grant['kind'],
        id: g.subject_id as string,
        name: g.name as string,
        role: g.role as Grant['role'],
        ...(g.overrides ? { overrides: JSON.parse(g.overrides as string) as Partial<Perms> } : {}),
      });
      byClaim.set(g.claim_id as string, list);
    }
    const out: ClaimRecord[] = [];
    for (const r of rows) {
      try {
        out.push({
          id: r.id as string,
          world: r.world as string,
          ownerType: r.owner_type as ClaimRecord['ownerType'],
          ownerId: r.owner_id as string,
          ownerName: r.owner_name as string,
          name: r.name as string,
          vertices: JSON.parse(r.vertices as string) as [number, number][],
          depth: r.depth as number,
          height: r.height as number,
          ground: r.ground as string,
          price: r.price as number,
          paid: r.paid as number,
          createdAt: r.created_at as number,
          updatedAt: r.updated_at as number,
          status: r.status as ClaimRecord['status'],
          releaseAt: (r.release_at as number | null) ?? null,
          rev: r.rev as number,
          grants: byClaim.get(r.id as string) ?? [],
          publicPerms: JSON.parse(r.public_perms as string) as Perms,
          guildRole: r.guild_role as ClaimRecord['guildRole'],
          lastActive: r.last_active as number,
        });
      } catch {
        console.warn(`[solrift] skipping unreadable claim ${String(r.id)}`);
      }
    }
    return out;
  }

  // ---- modifications ----

  loadMods(world: string): ModEntry[] {
    const rows = this.db.prepare('SELECT * FROM world_modifications WHERE world = ?').all(world) as Row[];
    return rows.map((r) => ({
      x: r.x as number,
      y: r.y as number,
      z: r.z as number,
      base: r.base as number,
      cur: r.cur as number,
      cls: r.cls as ModEntry['cls'],
      claimId: (r.claim_id as string | null) ?? null,
      region: r.region as number,
      by: (r.by_account as string | null) ?? null,
      first: r.first_at as number,
      t: r.changed_at as number,
      due: r.due as number,
      cat: r.cat as ModEntry['cat'],
      rev: r.rev as number,
    }));
  }

  writeMods(world: string, d: LedgerDrain): void {
    if (d.upserts.length === 0 && d.deletes.length === 0) return;
    this.tx(() => {
      const up = this.db.prepare(
        `INSERT INTO world_modifications (world, x, y, z, cx, cz, base, cur, cls, claim_id, region, by_account, first_at, changed_at, due, cat, rev)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(world, x, y, z) DO UPDATE SET base = excluded.base, cur = excluded.cur, cls = excluded.cls, claim_id = excluded.claim_id, region = excluded.region,
           by_account = excluded.by_account, first_at = excluded.first_at, changed_at = excluded.changed_at, due = excluded.due, cat = excluded.cat, rev = excluded.rev`,
      );
      const regions = new Set<number>();
      for (const e of d.upserts) {
        up.run(world, e.x, e.y, e.z, e.x >> 4, e.z >> 4, e.base, e.cur, e.cls, e.claimId, e.region, e.by, e.first, e.t, e.due, e.cat, e.rev);
        if (e.cls === 'wild' && e.region > 0) regions.add(e.region);
      }
      if (d.deletes.length > 0) {
        const del = this.db.prepare('DELETE FROM world_modifications WHERE world = ? AND x = ? AND y = ? AND z = ?');
        for (const k of d.deletes) {
          const [x, y, z] = unKey(k);
          del.run(world, x, y, z);
        }
      }
      // The job table is a summary of the entries: a region's due time is when its last change comes due, and its size is how much is left.
      const sum = this.db.prepare(
        `INSERT INTO restoration_jobs (world, region, due, blocks, updated_at)
         SELECT world, region, MAX(due), COUNT(*), ? FROM world_modifications WHERE world = ? AND region = ? AND cls = 'wild' GROUP BY world, region
         ON CONFLICT(world, region) DO UPDATE SET due = excluded.due, blocks = excluded.blocks, updated_at = excluded.updated_at`,
      );
      const now = Date.now();
      for (const region of regions) sum.run(now, world, region);
      // Regions that lost entries (restored, claimed or merged away) and have none left have no job.
      this.db.prepare('DELETE FROM restoration_jobs WHERE world = ? AND region NOT IN (SELECT DISTINCT region FROM world_modifications WHERE world = ? AND cls = \'wild\')').run(world, world);
    });
  }

  clearWild(world: string): void {
    this.tx(() => {
      this.db.prepare("DELETE FROM world_modifications WHERE world = ? AND cls = 'wild'").run(world);
      this.db.prepare('DELETE FROM restoration_jobs WHERE world = ?').run(world);
    });
  }

  // ---- transactions ----

  private txnOf(r: Row | undefined): TxnRecord | null {
    if (!r) return null;
    return {
      id: r.id as string,
      world: r.world as string,
      playerKey: r.player_key as string,
      claimId: (r.claim_id as string | null) ?? null,
      kind: r.kind as TxnRecord['kind'],
      amount: r.amount as number,
      idem: r.idem as string,
      state: r.state as TxnRecord['state'],
      note: r.note as string,
      createdAt: r.created_at as number,
      updatedAt: r.updated_at as number,
    };
  }

  txnByIdem(world: string, playerKey: string, idem: string): TxnRecord | null {
    return this.txnOf(this.db.prepare('SELECT * FROM claim_transactions WHERE world = ? AND player_key = ? AND idem = ?').get(world, playerKey, idem) as Row | undefined);
  }

  txnById(world: string, id: string): TxnRecord | null {
    return this.txnOf(this.db.prepare('SELECT * FROM claim_transactions WHERE world = ? AND id = ?').get(world, id) as Row | undefined);
  }

  beginTxn(t: TxnRecord): void {
    this.db
      .prepare('INSERT INTO claim_transactions (id, world, player_key, claim_id, kind, amount, idem, state, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(t.id, t.world, t.playerKey, t.claimId, t.kind, t.amount, t.idem, t.state, t.note, t.createdAt, t.updatedAt);
  }

  commitTxn(c: { txn: TxnRecord; claim: ClaimRecord; player: [string, unknown] | null }): void {
    // Everything that can throw for a reason of data (the JSON) is done before the transaction opens.
    const player = c.player ? JSON.stringify(c.player[1]) : null;
    this.tx(() => {
      this.writeClaim(c.claim);
      if (c.player && player !== null) {
        this.db.prepare('INSERT INTO room_kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(c.player[0], player);
      }
      const t = c.txn;
      const upd = this.db
        .prepare('UPDATE claim_transactions SET state = ?, note = ?, claim_id = ?, amount = ?, updated_at = ? WHERE id = ?')
        .run(t.state, t.note, t.claimId, t.amount, t.updatedAt, t.id);
      if (Number(upd.changes) === 0) this.beginTxn(t);
    });
  }

  endTxn(world: string, id: string, state: 'failed' | 'aborted' | 'committed', note: string, at: number): void {
    this.db.prepare('UPDATE claim_transactions SET state = ?, note = ?, updated_at = ? WHERE world = ? AND id = ?').run(state, note, at, world, id);
  }

  pendingTxns(world: string): TxnRecord[] {
    return (this.db.prepare("SELECT * FROM claim_transactions WHERE world = ? AND state = 'pending'").all(world) as Row[]).map((r) => this.txnOf(r)!);
  }

  recentTxns(world: string, limit: number, playerKey?: string): TxnRecord[] {
    const rows = playerKey
      ? (this.db.prepare('SELECT * FROM claim_transactions WHERE world = ? AND player_key = ? ORDER BY created_at DESC LIMIT ?').all(world, playerKey, limit) as Row[])
      : (this.db.prepare('SELECT * FROM claim_transactions WHERE world = ? ORDER BY created_at DESC LIMIT ?').all(world, limit) as Row[]);
    return rows.map((r) => this.txnOf(r)!);
  }

  // ---- recovery, meta, log ----

  addRecovery(r: RecoveryRecord): void {
    this.db
      .prepare('INSERT INTO land_recovery (id, world, owner_key, x, y, z, items, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(r.id, r.world, r.ownerKey, r.x, r.y, r.z, JSON.stringify(r.items), r.createdAt);
  }

  recoveryOf(world: string, ownerKey: string): RecoveryRecord[] {
    return (this.db.prepare('SELECT * FROM land_recovery WHERE world = ? AND owner_key = ? ORDER BY created_at').all(world, ownerKey) as Row[]).map((r) => ({
      id: r.id as string,
      world: r.world as string,
      ownerKey: r.owner_key as string,
      x: r.x as number,
      y: r.y as number,
      z: r.z as number,
      items: JSON.parse(r.items as string) as unknown,
      createdAt: r.created_at as number,
    }));
  }

  deleteRecovery(world: string, id: string): void {
    this.db.prepare('DELETE FROM land_recovery WHERE world = ? AND id = ?').run(world, id);
  }

  getMeta(world: string, key: string): unknown | null {
    const r = this.db.prepare('SELECT value FROM land_meta WHERE world = ? AND key = ?').get(world, key) as Row | undefined;
    if (!r) return null;
    try {
      return JSON.parse(r.value as string);
    } catch {
      return null;
    }
  }

  setMeta(world: string, key: string, value: unknown): void {
    this.db.prepare('INSERT INTO land_meta (world, key, value) VALUES (?, ?, ?) ON CONFLICT(world, key) DO UPDATE SET value = excluded.value').run(world, key, JSON.stringify(value));
  }

  log(r: AdminLogRecord): void {
    this.db.prepare('INSERT INTO land_admin_log (at, world, admin, action, detail) VALUES (?, ?, ?, ?, ?)').run(r.at, r.world, r.admin, r.action, r.detail);
  }

  adminLog(world: string, limit: number): AdminLogRecord[] {
    return (this.db.prepare('SELECT * FROM land_admin_log WHERE world = ? ORDER BY id DESC LIMIT ?').all(world, limit) as Row[]).map((r) => ({
      at: r.at as number,
      world: r.world as string,
      admin: r.admin as string,
      action: r.action as string,
      detail: r.detail as string,
    }));
  }

  /** A consistent copy of the database, to take before anything that rewrites many claims (the admin's adoption of legacy land). */
  backupTo(file: string): void {
    this.db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  }
}