import type { DatabaseSync } from 'node:sqlite';

/**
 * The $SOLRIFT ledger. Every row is one movement of a wallet's in-game balance, in whole tokens:
 *   - a `reward` is credited (positive) once per (wallet, ref), where `ref` is the achievement won, so no deed pays twice;
 *   - a `withdraw` is a debit (negative) that starts `pending`, becomes `done` when the transfer is confirmed on chain, or
 *     `failed` when it is known not to have happened (a failed row no longer counts, so the balance is back, atomically);
 *   - a `spend` is a debit (negative) for something bought in the game. It is final at once (`ok`). The tokens are not burned:
 *     they were already in the treasury, backing the balance, and they stay there to fund later rewards;
 *   - a `trade` is a movement between players at the Auction House: a bid or buyout (negative), a refund of an outbid bid or the
 *     proceeds of a sale (positive); a `fee` is the house's cut of a sale, credited to the ledger account `house`. The rows of
 *     one sale add up to nothing, and the house's account is what the treasury keeps.
 * A wallet's balance is the sum of its rows that are not `failed`. Nothing here talks to the chain.
 */
export type LedgerKind = 'reward' | 'withdraw' | 'spend' | 'trade' | 'fee';

/** The perk a hero slot is stored as (`wallet_perks`): how many extra character slots a wallet has bought. */
export const PERK_HERO_SLOT = 'hero-slot';
/** Outfits are items (they go to the stash): the perk row only counts how many of a set a wallet has bought, which numbers its spend rows (`outfit-item:<id>:<n>`). */
export const PERK_OUTFIT_PREFIX = 'outfit-item:';
export const PERK_STASH_TAB = 'stash-tab';
/** A key to the Hollow Deep: bought one at a time, used up when a party goes in. */
export const PERK_HOLLOW_KEY = 'hollow-key';

export type PurchaseResult = 'ok' | 'broke' | 'maxed';
export type LedgerStatus = 'ok' | 'pending' | 'done' | 'failed';

export interface LedgerEntry {
  id: number;
  wallet: string;
  accountId: string | null;
  kind: LedgerKind;
  /** What the row is for: the achievement id of a reward, a random id for a withdrawal, `<perk>:<n>` for the n-th purchase of a perk. */
  ref: string;
  /** Whole tokens: positive for a reward, negative for a withdrawal or a purchase. */
  amount: number;
  status: LedgerStatus;
  /** The Solana transaction signature of a withdrawal (written before it is sent). */
  signature: string | null;
  /** The last block height at which the withdrawal transaction can still land (after it, it never will). */
  lastValid: number | null;
  note: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TokenRepo {
  /** Credit a reward. False when this wallet was already paid for `ref`. */
  insertReward(e: { wallet: string; accountId: string | null; ref: string; amount: number; now: number }): boolean;
  /** Debit a pending withdrawal; returns its row id. The caller has already checked the balance (nothing awaits in between). */
  insertWithdraw(e: { wallet: string; accountId: string | null; ref: string; amount: number; now: number }): number;
  /**
   * Buy one more of a perk, all or nothing, in one transaction: the balance is checked, the debit written (`spend`, ref
   * `<perk>:<n>`, with `label` as its note) and the perk's count raised. `'broke'`: the balance is under `price`; `'maxed'`: the
   * wallet already has `max`. The unique (wallet, ref) of a spend is what stops two purchases both becoming the n-th one.
   * A `consumable` perk is used up again (see `takePerk`), so its count goes down and cannot number the purchases: `n` is then how many
   * times the wallet has bought it, from the ledger, and `max` is how many it may hold at once.
   */
  purchase(e: { wallet: string; accountId: string | null; perk: string; label: string; price: number; max: number; consumable?: boolean; now: number }): PurchaseResult;
  /** How many of a perk the wallet has bought (for a consumable: how many it holds now). */
  perkCount(wallet: string, perk: string): number;
  /**
   * Use up one of a consumable perk the wallet holds, in one statement (two uses at once can never take the same one). Returns how many
   * are left, or -1 when it had none.
   */
  takePerk(wallet: string, perk: string): number;
  /**
   * Write one Auction House movement (see `LedgerKind`). Each `ref` is written once per wallet: a move sent again (a retry, a restart)
   * returns false and changes nothing. The balance is not checked here: the house checked it when the bid was made.
   */
  insertTrade(e: { wallet: string; ref: string; kind: 'trade' | 'fee'; amount: number; note: string; now: number }): boolean;
  /** Run `fn` as one transaction (and whatever else is written to the same database inside it): all of it is kept or none. */
  atomic<T>(fn: () => T): T;

  updateWithdraw(id: number, patch: { status?: LedgerStatus; signature?: string; lastValid?: number; note?: string }, now: number): void;
  get(id: number): LedgerEntry | null;
  /** The wallet's balance in whole tokens. */
  balance(wallet: string): number;
  /** Whole tokens rewarded (`reward`) or asked to be withdrawn and not failed (`withdraw`) since `since`, for a wallet or for everyone. */
  sumSince(kind: LedgerKind, since: number, wallet?: string): number;
  /** Whole tokens, ever. */
  total(kind: LedgerKind): number;
  /** How many rewards the wallet has been paid whose `ref` starts with `prefix` (the repeatable ones: "clear:2026-11-21:0", "clear:2026-11-21:1" ...). */
  countRewards(wallet: string, prefix: string): number;
  pendingFor(wallet: string): LedgerEntry | null;
  /** Every withdrawal still waiting for the chain. */
  listPending(): LedgerEntry[];
  /** The wallet's latest movements, newest first. */
  history(wallet: string, limit: number): LedgerEntry[];
  /**
   * The ledger since `since`, grouped by UTC day (`day` = ms / 86,400,000), kind and a `sub` that tells what it was (a reward: `achievement`,
   * `clear` or `bounty`; a spend: what was bought; a trade: `sale` for a seller's proceeds, else `other`): how many rows, the tokens moved (absolute) and
   * how many different wallets. For the economy page: nothing in it names a wallet.
   */
  daily(since: number): EconomyRow[];
  /** What the players hold: every balance but the house's own (what the treasury owes them), and how many wallets hold any. */
  held(): { tokens: number; wallets: number };
  /** How many different wallets earned a reward since `since`. */
  earners(since: number): number;
  /** How many different wallets earned a reward on each UTC day since `since` (`day` = ms / 86,400,000). */
  earnersByDay(since: number): Map<number, number>;
}

export interface EconomyRow {
  day: number;
  kind: LedgerKind;
  sub: string;
  n: number;
  sum: number;
  wallets: number;
}

interface Row {
  id: number;
  wallet: string;
  account_id: string | null;
  kind: string;
  ref: string;
  amount: number;
  status: string;
  signature: string | null;
  last_valid: number | null;
  note: string | null;
  created_at: number;
  updated_at: number;
}

const toEntry = (r: Row): LedgerEntry => ({
  id: r.id,
  wallet: r.wallet,
  accountId: r.account_id,
  kind: r.kind as LedgerKind,
  ref: r.ref,
  amount: r.amount,
  status: r.status as LedgerStatus,
  signature: r.signature,
  lastValid: r.last_valid,
  note: r.note,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export class SqliteTokenRepo implements TokenRepo {
  constructor(private readonly db: DatabaseSync) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS token_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet TEXT NOT NULL,
        account_id TEXT,
        kind TEXT NOT NULL,
        ref TEXT NOT NULL,
        amount INTEGER NOT NULL,
        status TEXT NOT NULL,
        signature TEXT,
        last_valid INTEGER,
        note TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS token_reward_once ON token_ledger(wallet, ref) WHERE kind = 'reward';
      CREATE UNIQUE INDEX IF NOT EXISTS token_spend_once ON token_ledger(wallet, ref) WHERE kind = 'spend';
      CREATE UNIQUE INDEX IF NOT EXISTS token_trade_once ON token_ledger(wallet, ref) WHERE kind IN ('trade', 'fee');
      CREATE TABLE IF NOT EXISTS wallet_perks (
        wallet TEXT NOT NULL,
        perk TEXT NOT NULL,
        count INTEGER NOT NULL,
        PRIMARY KEY (wallet, perk)
      );
      CREATE INDEX IF NOT EXISTS token_ledger_wallet ON token_ledger(wallet, id);
      CREATE INDEX IF NOT EXISTS token_ledger_pending ON token_ledger(status) WHERE status = 'pending';
    `);
  }

  insertReward(e: { wallet: string; accountId: string | null; ref: string; amount: number; now: number }): boolean {
    const r = this.db
      .prepare("INSERT OR IGNORE INTO token_ledger (wallet, account_id, kind, ref, amount, status, created_at, updated_at) VALUES (?, ?, 'reward', ?, ?, 'ok', ?, ?)")
      .run(e.wallet, e.accountId, e.ref, e.amount, e.now, e.now);
    return Number(r.changes) > 0;
  }

  insertWithdraw(e: { wallet: string; accountId: string | null; ref: string; amount: number; now: number }): number {
    const r = this.db
      .prepare("INSERT INTO token_ledger (wallet, account_id, kind, ref, amount, status, created_at, updated_at) VALUES (?, ?, 'withdraw', ?, ?, 'pending', ?, ?)")
      .run(e.wallet, e.accountId, e.ref, -Math.abs(e.amount), e.now, e.now);
    return Number(r.lastInsertRowid);
  }

  purchase(e: { wallet: string; accountId: string | null; perk: string; label: string; price: number; max: number; consumable?: boolean; now: number }): PurchaseResult {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const have = this.perkCount(e.wallet, e.perk);
      const bought = e.consumable ? this.boughtCount(e.wallet, e.perk) : have;
      if (have >= e.max) {
        this.db.exec('ROLLBACK');
        return 'maxed';
      }
      if (this.balance(e.wallet) < e.price) {
        this.db.exec('ROLLBACK');
        return 'broke';
      }
      this.db
        .prepare("INSERT INTO token_ledger (wallet, account_id, kind, ref, amount, status, note, created_at, updated_at) VALUES (?, ?, 'spend', ?, ?, 'ok', ?, ?, ?)")
        .run(e.wallet, e.accountId, `${e.perk}:${bought}`, -Math.abs(e.price), e.label, e.now, e.now);
      this.db.prepare('INSERT INTO wallet_perks (wallet, perk, count) VALUES (?, ?, 1) ON CONFLICT(wallet, perk) DO UPDATE SET count = count + 1').run(e.wallet, e.perk);
      this.db.exec('COMMIT');
      return 'ok';
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // (already rolled back)
      }
      throw err;
    }
  }

  /** How many times the wallet has bought a perk, ever (its spend rows). */
  private boughtCount(wallet: string, perk: string): number {
    const prefix = `${perk}:`;
    const r = this.db.prepare("SELECT COUNT(*) AS n FROM token_ledger WHERE wallet = ? AND kind = 'spend' AND substr(ref, 1, ?) = ?").get(wallet, prefix.length, prefix) as unknown as { n: number };
    return Number(r.n);
  }

  takePerk(wallet: string, perk: string): number {
    const r = this.db.prepare('UPDATE wallet_perks SET count = count - 1 WHERE wallet = ? AND perk = ? AND count > 0').run(wallet, perk);
    return Number(r.changes) > 0 ? this.perkCount(wallet, perk) : -1;
  }

  insertTrade(e: { wallet: string; ref: string; kind: 'trade' | 'fee'; amount: number; note: string; now: number }): boolean {
    const r = this.db
      .prepare("INSERT OR IGNORE INTO token_ledger (wallet, account_id, kind, ref, amount, status, note, created_at, updated_at) VALUES (?, NULL, ?, ?, ?, 'ok', ?, ?, ?)")
      .run(e.wallet, e.kind, e.ref, e.amount, e.note, e.now, e.now);
    return Number(r.changes) > 0;
  }

  atomic<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // (already rolled back)
      }
      throw err;
    }
  }

  perkCount(wallet: string, perk: string): number {
    const r = this.db.prepare('SELECT count FROM wallet_perks WHERE wallet = ? AND perk = ?').get(wallet, perk) as unknown as { count: number } | undefined;
    return r?.count ?? 0;
  }

  updateWithdraw(id: number, patch: { status?: LedgerStatus; signature?: string; lastValid?: number; note?: string }, now: number): void {
    this.db
      .prepare('UPDATE token_ledger SET status = COALESCE(?, status), signature = COALESCE(?, signature), last_valid = COALESCE(?, last_valid), note = COALESCE(?, note), updated_at = ? WHERE id = ? AND kind = ?')
      .run(patch.status ?? null, patch.signature ?? null, patch.lastValid ?? null, patch.note ?? null, now, id, 'withdraw');
  }

  get(id: number): LedgerEntry | null {
    const r = this.db.prepare('SELECT * FROM token_ledger WHERE id = ?').get(id) as unknown as Row | undefined;
    return r ? toEntry(r) : null;
  }

  balance(wallet: string): number {
    const r = this.db.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM token_ledger WHERE wallet = ? AND status != 'failed'").get(wallet) as unknown as { n: number };
    return r.n;
  }

  sumSince(kind: LedgerKind, since: number, wallet?: string): number {
    const sql = `SELECT COALESCE(SUM(ABS(amount)), 0) AS n FROM token_ledger WHERE kind = ? AND status != 'failed' AND created_at >= ?${wallet ? ' AND wallet = ?' : ''}`;
    const args: (string | number)[] = wallet ? [kind, since, wallet] : [kind, since];
    return (this.db.prepare(sql).get(...args) as unknown as { n: number }).n;
  }

  total(kind: LedgerKind): number {
    const r = this.db.prepare("SELECT COALESCE(SUM(ABS(amount)), 0) AS n FROM token_ledger WHERE kind = ? AND status != 'failed'").get(kind) as unknown as { n: number };
    return r.n;
  }

  countRewards(wallet: string, prefix: string): number {
    // (substr, not LIKE: a prefix is plain text and must not be read as a pattern)
    const r = this.db.prepare("SELECT COUNT(*) AS n FROM token_ledger WHERE wallet = ? AND kind = 'reward' AND status != 'failed' AND substr(ref, 1, ?) = ?").get(wallet, prefix.length, prefix) as unknown as { n: number };
    return r.n;
  }

  pendingFor(wallet: string): LedgerEntry | null {
    const r = this.db.prepare("SELECT * FROM token_ledger WHERE wallet = ? AND kind = 'withdraw' AND status = 'pending' ORDER BY id LIMIT 1").get(wallet) as unknown as Row | undefined;
    return r ? toEntry(r) : null;
  }

  listPending(): LedgerEntry[] {
    return (this.db.prepare("SELECT * FROM token_ledger WHERE kind = 'withdraw' AND status = 'pending' ORDER BY id").all() as unknown as Row[]).map(toEntry);
  }

  history(wallet: string, limit: number): LedgerEntry[] {
    return (this.db.prepare('SELECT * FROM token_ledger WHERE wallet = ? ORDER BY id DESC LIMIT ?').all(wallet, limit) as unknown as Row[]).map(toEntry);
  }

  daily(since: number): EconomyRow[] {
    const rows = this.db
      .prepare(
        `SELECT created_at / 86400000 AS day, kind,
           CASE kind
             WHEN 'reward' THEN CASE WHEN substr(ref, 1, 6) = 'clear:' THEN 'clear' WHEN substr(ref, 1, 7) = 'bounty:' THEN 'bounty' ELSE 'achievement' END
             WHEN 'spend' THEN COALESCE(note, 'Purchase')
             WHEN 'trade' THEN CASE WHEN substr(note, 1, 6) = 'Sold: ' THEN 'sale' ELSE 'other' END
             ELSE '' END AS sub,
           COUNT(*) AS n, SUM(ABS(amount)) AS sum, COUNT(DISTINCT wallet) AS wallets
         FROM token_ledger WHERE status != 'failed' AND created_at >= ?
         GROUP BY day, kind, sub ORDER BY day, kind, sub`,
      )
      .all(since) as unknown as EconomyRow[];
    return rows.map((r) => ({ day: Number(r.day), kind: r.kind, sub: r.sub, n: Number(r.n), sum: Number(r.sum), wallets: Number(r.wallets) }));
  }

  held(): { tokens: number; wallets: number } {
    const r = this.db
      .prepare("SELECT COALESCE(SUM(b), 0) AS tokens, COUNT(*) AS wallets FROM (SELECT SUM(amount) AS b FROM token_ledger WHERE status != 'failed' AND wallet != 'house' GROUP BY wallet HAVING b > 0)")
      .get() as unknown as { tokens: number; wallets: number };
    return { tokens: Number(r.tokens), wallets: Number(r.wallets) };
  }

  earnersByDay(since: number): Map<number, number> {
    const rows = this.db
      .prepare("SELECT created_at / 86400000 AS day, COUNT(DISTINCT wallet) AS n FROM token_ledger WHERE kind = 'reward' AND status != 'failed' AND created_at >= ? GROUP BY day")
      .all(since) as unknown as { day: number; n: number }[];
    return new Map(rows.map((r) => [Number(r.day), Number(r.n)]));
  }

  earners(since: number): number {
    const r = this.db.prepare("SELECT COUNT(DISTINCT wallet) AS n FROM token_ledger WHERE kind = 'reward' AND status != 'failed' AND created_at >= ?").get(since) as unknown as { n: number };
    return Number(r.n);
  }
}
