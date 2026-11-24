import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { isClassId, type ClassId, type LandStore } from '@solrift/shared';
import { SqliteLandStore } from './landStore';
import { SqliteCloud, type CloudRepo } from './cloudRepo';
import { SqliteRoomStore, type RoomStore } from './roomStore';
import { PERK_HERO_SLOT, SqliteTokenRepo, type TokenRepo } from './tokenRepo';

/** Characters every wallet can have. Hero slots bought with $SOLRIFT add to it (`Repo.maxCharacters`). */
export const MAX_CHARACTERS = 3;

/**
 * One character of a wallet. Every character is its own `accounts` row: it owns its progress (room save, cloud
 * worlds) and a session points at the character being played. Several rows share a wallet; a row without a
 * `look` is a wallet that has not made a character yet.
 */
export interface Account {
  id: string;
  wallet: string;
  displayName: string;
  /** The character they made (a `lookCode`), or null until they do. */
  look: number | null;
  /** The class they chose with it (permanent, like the look). Null for a character from before classes, and for an empty account. */
  class: ClassId | null;
  createdAt: number;
  lastLoginAt: number;
}

export interface SessionInfo {
  account: Account;
  expiresAt: number;
  lastSeen: number;
}

/**
 * Persistence contract for accounts and sessions. SQLite implements it for development and tests
 * (no Docker needed); production gets a Postgres implementation that passes the same tests.
 */
export interface Repo {
  /** Cloud saves (worlds, chunks, backups). */
  readonly cloud: CloudRepo;
  /** The multiplayer room's world and player progress. */
  readonly room: RoomStore;
  /** Land claims, the record of what was changed in the wild, and the receipts of land purchases. */
  readonly land?: LandStore;
  /** The $SOLRIFT ledger (rewards and withdrawals, per wallet). */
  readonly tokens: TokenRepo;
  /** Log a wallet in: the character it played last, or a fresh one on first login. Refreshes `lastLoginAt`. */
  upsertAccount(wallet: string, now: number): Account;
  getAccount(id: string): Account | null;
  /** The wallet's characters (the ones that have a look), oldest first. */
  listCharacters(wallet: string): Account[];
  /** How many characters this wallet may have: `MAX_CHARACTERS` and the hero slots it has bought. */
  maxCharacters(wallet: string): number;
  /**
   * Make a character (name and look) for the wallet that `fromId` belongs to. It fills the wallet's empty account
   * when there is one, otherwise it becomes a new account of the wallet. Returns the character, or null when
   * `fromId` is unknown. Throws `CharacterLimitError` (already `maxCharacters`) or `NameTakenError`. A character
   * cannot be edited or renamed afterwards.
   */
  createCharacter(fromId: string, character: { displayName: string; look: number; class: ClassId }, now: number): Account | null;
  /**
   * Delete the character and everything that came with it (room progress, cloud worlds). Sessions that were playing it
   * move to another character of the wallet; with none left the account starts over empty with a new default name.
   * Returns the character now active, or null when `id` is unknown.
   */
  deleteCharacter(id: string, now: number): Account | null;
  /** Point a session at another character of the same wallet (it becomes the one played last). */
  setSessionAccount(tokenHash: string, accountId: string, now: number): void;
  createSession(accountId: string, tokenHash: string, now: number, expiresAt: number): void;
  getSession(tokenHash: string, now: number): SessionInfo | null;
  touchSession(tokenHash: string, now: number, expiresAt: number): void;
  deleteSession(tokenHash: string): void;
  deleteExpiredSessions(now: number): number;
  close(): void;
}

export class NameTakenError extends Error {
  constructor() {
    super('that name is taken');
  }
}

export class CharacterLimitError extends Error {
  constructor(readonly max: number = MAX_CHARACTERS) {
    super(`a wallet can have ${max} characters`);
  }
}

interface AccountRow {
  id: string;
  wallet: string;
  display_name: string;
  look: number | null;
  class: string | null;
  created_at: number;
  last_login_at: number;
}

const toAccount = (r: AccountRow): Account => ({
  id: r.id,
  wallet: r.wallet,
  displayName: r.display_name,
  look: r.look ?? null,
  class: isClassId(r.class) ? r.class : null,
  createdAt: r.created_at,
  lastLoginAt: r.last_login_at,
});

/** A public name that says nothing about the wallet (the address would reveal holdings). */
const defaultName = (): string => `Player${randomUUID().replace(/-/g, '').slice(0, 6)}`;

export class SqliteRepo implements Repo {
  private readonly db: DatabaseSync;
  readonly cloud: CloudRepo;
  readonly room: RoomStore;
  readonly land: SqliteLandStore;
  readonly tokens: TokenRepo;

  constructor(file: string = ':memory:') {
    if (file !== ':memory:') mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        wallet TEXT NOT NULL,
        display_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_login_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_account ON sessions(account_id);
      CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    `);
    // Accounts made before characters existed have no `look` column yet.
    const cols = this.db.prepare('PRAGMA table_info(accounts)').all() as unknown as { name: string }[];
    if (!cols.some((c) => c.name === 'look')) this.db.exec('ALTER TABLE accounts ADD COLUMN look INTEGER');
    this.allowSeveralCharactersPerWallet();
    // Characters made before classes existed have no class (they play the unmodified game).
    if (!(this.db.prepare('PRAGMA table_info(accounts)').all() as unknown as { name: string }[]).some((c) => c.name === 'class')) this.db.exec('ALTER TABLE accounts ADD COLUMN class TEXT');
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS accounts_wallet ON accounts(wallet);
      CREATE INDEX IF NOT EXISTS accounts_name ON accounts(lower(display_name));
    `);
    this.cloud = new SqliteCloud(this.db);
    this.room = new SqliteRoomStore(this.db);
    this.land = new SqliteLandStore(this.db);
    this.tokens = new SqliteTokenRepo(this.db);
  }

  /**
   * Accounts used to be one per wallet (`wallet UNIQUE`). A wallet now has up to MAX_CHARACTERS rows, so a database
   * made earlier is rebuilt without that constraint (ids, sessions and cloud worlds stay as they are).
   */
  private allowSeveralCharactersPerWallet(): void {
    const sql = (this.db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'accounts'").get() as unknown as { sql: string }).sql;
    if (!/wallet\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(sql)) return;
    this.db.exec('PRAGMA foreign_keys = OFF');
    try {
      this.db.exec(`
        BEGIN;
        CREATE TABLE accounts_new (
          id TEXT PRIMARY KEY,
          wallet TEXT NOT NULL,
          display_name TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          last_login_at INTEGER NOT NULL,
          look INTEGER
        );
        INSERT INTO accounts_new (id, wallet, display_name, created_at, last_login_at, look)
          SELECT id, wallet, display_name, created_at, last_login_at, look FROM accounts;
        DROP TABLE accounts;
        ALTER TABLE accounts_new RENAME TO accounts;
        COMMIT;
      `);
    } finally {
      this.db.exec('PRAGMA foreign_keys = ON');
    }
  }

  upsertAccount(wallet: string, now: number): Account {
    // The character played last; a wallet seen for the first time gets an empty account to make one in.
    const last = this.db.prepare('SELECT id FROM accounts WHERE wallet = ? ORDER BY last_login_at DESC, created_at DESC LIMIT 1').get(wallet) as unknown as { id: string } | undefined;
    if (last) this.db.prepare('UPDATE accounts SET last_login_at = ? WHERE id = ?').run(now, last.id);
    else this.db.prepare('INSERT INTO accounts (id, wallet, display_name, created_at, last_login_at) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), wallet, defaultName(), now, now);
    return toAccount(this.db.prepare('SELECT * FROM accounts WHERE wallet = ? ORDER BY last_login_at DESC, created_at DESC LIMIT 1').get(wallet) as unknown as AccountRow);
  }

  getAccount(id: string): Account | null {
    const row = this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as unknown as AccountRow | undefined;
    return row ? toAccount(row) : null;
  }

  listCharacters(wallet: string): Account[] {
    const rows = this.db.prepare('SELECT * FROM accounts WHERE wallet = ? AND look IS NOT NULL ORDER BY created_at, id').all(wallet) as unknown as AccountRow[];
    return rows.map(toAccount);
  }

  maxCharacters(wallet: string): number {
    return MAX_CHARACTERS + this.tokens.perkCount(wallet, PERK_HERO_SLOT);
  }

  createCharacter(fromId: string, character: { displayName: string; look: number; class: ClassId }, now: number): Account | null {
    const from = this.getAccount(fromId);
    if (!from) return null;
    const mine = this.listCharacters(from.wallet);
    const max = this.maxCharacters(from.wallet);
    if (mine.length >= max) throw new CharacterLimitError(max);
    // Names are unique across everyone (case-insensitive); the empty account's own placeholder name does not count.
    const emptyRow = from.look === null ? { id: from.id } : (this.db.prepare('SELECT id FROM accounts WHERE wallet = ? AND look IS NULL').get(from.wallet) as unknown as { id: string } | undefined);
    const emptyId = emptyRow?.id ?? null;
    const clash = this.db.prepare('SELECT id FROM accounts WHERE lower(display_name) = lower(?) AND id IS NOT ?').get(character.displayName, emptyId);
    if (clash) throw new NameTakenError();
    if (emptyId) {
      this.db.prepare('UPDATE accounts SET display_name = ?, look = ?, class = ?, last_login_at = ? WHERE id = ? AND look IS NULL').run(character.displayName, character.look, character.class, now, emptyId);
      return this.getAccount(emptyId);
    }
    const id = randomUUID();
    this.db.prepare('INSERT INTO accounts (id, wallet, display_name, look, class, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, from.wallet, character.displayName, character.look, character.class, now, now);
    return this.getAccount(id);
  }

  deleteCharacter(id: string, now: number): Account | null {
    const gone = this.getAccount(id);
    if (!gone) return null;
    let active: string = id;
    this.cloud.transaction(() => {
      for (const w of this.cloud.listWorlds(id)) this.cloud.deleteWorld(id, w.worldId);
      this.room.deleteJson(`player:${id}`);
      const others = this.listCharacters(gone.wallet).filter((c) => c.id !== id);
      if (others.length === 0) {
        // The wallet's last character: the account stays, empty, and the name is free.
        this.db.prepare('UPDATE accounts SET display_name = ?, look = NULL, class = NULL WHERE id = ?').run(defaultName(), id);
        return;
      }
      // Another character takes over the sessions (deleting the row would sign them out), then this one goes.
      const next = [...others].sort((a, b) => b.lastLoginAt - a.lastLoginAt)[0];
      active = next.id;
      this.db.prepare('UPDATE sessions SET account_id = ? WHERE account_id = ?').run(next.id, id);
      this.db.prepare('UPDATE accounts SET last_login_at = ? WHERE id = ?').run(now, next.id);
      this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
    });
    return this.getAccount(active);
  }

  setSessionAccount(tokenHash: string, accountId: string, now: number): void {
    this.db.prepare('UPDATE sessions SET account_id = ? WHERE token_hash = ?').run(accountId, tokenHash);
    this.db.prepare('UPDATE accounts SET last_login_at = ? WHERE id = ?').run(now, accountId);
  }

  createSession(accountId: string, tokenHash: string, now: number, expiresAt: number): void {
    this.db.prepare('INSERT INTO sessions (token_hash, account_id, created_at, last_seen, expires_at) VALUES (?, ?, ?, ?, ?)').run(tokenHash, accountId, now, now, expiresAt);
  }

  getSession(tokenHash: string, now: number): SessionInfo | null {
    const row = this.db
      .prepare(
        `SELECT a.*, s.expires_at AS expires_at, s.last_seen AS last_seen
           FROM sessions s JOIN accounts a ON a.id = s.account_id
          WHERE s.token_hash = ? AND s.expires_at > ?`,
      )
      .get(tokenHash, now) as unknown as (AccountRow & { expires_at: number; last_seen: number }) | undefined;
    return row ? { account: toAccount(row), expiresAt: row.expires_at, lastSeen: row.last_seen } : null;
  }

  touchSession(tokenHash: string, now: number, expiresAt: number): void {
    this.db.prepare('UPDATE sessions SET last_seen = ?, expires_at = ? WHERE token_hash = ?').run(now, expiresAt, tokenHash);
  }

  deleteSession(tokenHash: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }

  deleteExpiredSessions(now: number): number {
    return Number(this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now).changes);
  }

  close(): void {
    this.db.close();
  }
}
