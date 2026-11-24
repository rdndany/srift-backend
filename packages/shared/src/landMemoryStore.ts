import type { LedgerDrain, ModEntry } from './landLedger';
import { modKey } from './landLedger';
import type { AdminLogRecord, ClaimRecord, LandStore, RecoveryRecord, TxnRecord } from './landService';

/**
 * A `LandStore` in memory: for tests and for a room that has no database (nothing survives it, like the rest of such a room). It copies on
 * the way in and the way out, so what it holds can never be changed by reaching into an object it handed out, the way a real database
 * could not be.
 */
export class MemoryLandStore implements LandStore {
  readonly claims = new Map<string, ClaimRecord>();
  readonly mods = new Map<string, Map<number, ModEntry>>();
  readonly txns = new Map<string, TxnRecord>();
  readonly recovery = new Map<string, RecoveryRecord>();
  readonly meta = new Map<string, string>();
  readonly logs: AdminLogRecord[] = [];
  /** The kv of the room's players, for `commitTxn` (a stand-in for the room's store). */
  readonly kv = new Map<string, string>();
  /** Tests make the next write of this kind fail: 'commit' for `commitTxn`, 'mods' for `writeMods`. */
  failNext: 'commit' | 'mods' | null = null;

  private modsOf(world: string): Map<number, ModEntry> {
    let m = this.mods.get(world);
    if (!m) this.mods.set(world, (m = new Map()));
    return m;
  }

  loadClaims(world: string): ClaimRecord[] {
    return [...this.claims.values()].filter((c) => c.world === world).map((c) => structuredClone(c));
  }

  saveClaim(rec: ClaimRecord): void {
    this.claims.set(rec.id, structuredClone(rec));
  }

  loadMods(world: string): ModEntry[] {
    return [...this.modsOf(world).values()].map((e) => ({ ...e }));
  }

  writeMods(world: string, d: LedgerDrain): void {
    if (this.failNext === 'mods') {
      this.failNext = null;
      throw new Error('disk full');
    }
    const m = this.modsOf(world);
    for (const e of d.upserts) m.set(modKey(e.x, e.y, e.z), { ...e });
    for (const k of d.deletes) m.delete(k);
  }

  clearWild(world: string): void {
    const m = this.modsOf(world);
    for (const [k, e] of [...m]) if (e.cls === 'wild') m.delete(k);
  }

  txnByIdem(world: string, playerKey: string, idem: string): TxnRecord | null {
    for (const t of this.txns.values()) if (t.world === world && t.playerKey === playerKey && t.idem === idem) return { ...t };
    return null;
  }

  txnById(world: string, id: string): TxnRecord | null {
    const t = this.txns.get(id);
    return t && t.world === world ? { ...t } : null;
  }

  beginTxn(t: TxnRecord): void {
    for (const o of this.txns.values()) if (o.world === t.world && o.playerKey === t.playerKey && o.idem === t.idem) throw new Error('duplicate idempotency key');
    this.txns.set(t.id, { ...t });
  }

  commitTxn(c: { txn: TxnRecord; claim: ClaimRecord; player: [string, unknown] | null }): void {
    if (this.failNext === 'commit') {
      this.failNext = null;
      throw new Error('disk full');
    }
    // Everything or nothing: what can fail is done first.
    const player = c.player ? JSON.stringify(c.player[1]) : null;
    this.txns.set(c.txn.id, { ...c.txn });
    this.claims.set(c.claim.id, structuredClone(c.claim));
    if (c.player && player !== null) this.kv.set(c.player[0], player);
  }

  endTxn(world: string, id: string, state: 'failed' | 'aborted' | 'committed', note: string, at: number): void {
    const t = this.txns.get(id);
    if (t && t.world === world) this.txns.set(id, { ...t, state, note, updatedAt: at });
  }

  pendingTxns(world: string): TxnRecord[] {
    return [...this.txns.values()].filter((t) => t.world === world && t.state === 'pending').map((t) => ({ ...t }));
  }

  recentTxns(world: string, limit: number, playerKey?: string): TxnRecord[] {
    return [...this.txns.values()]
      .filter((t) => t.world === world && (!playerKey || t.playerKey === playerKey))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((t) => ({ ...t }));
  }

  addRecovery(r: RecoveryRecord): void {
    this.recovery.set(r.id, structuredClone(r));
  }

  recoveryOf(world: string, ownerKey: string): RecoveryRecord[] {
    return [...this.recovery.values()].filter((r) => r.world === world && r.ownerKey === ownerKey).map((r) => structuredClone(r));
  }

  deleteRecovery(world: string, id: string): void {
    const r = this.recovery.get(id);
    if (r && r.world === world) this.recovery.delete(id);
  }

  getMeta(world: string, key: string): unknown | null {
    const v = this.meta.get(`${world}|${key}`);
    return v === undefined ? null : JSON.parse(v);
  }

  setMeta(world: string, key: string, value: unknown): void {
    this.meta.set(`${world}|${key}`, JSON.stringify(value));
  }

  log(r: AdminLogRecord): void {
    this.logs.push({ ...r });
  }

  adminLog(world: string, limit: number): AdminLogRecord[] {
    return this.logs.filter((l) => l.world === world).slice(-limit).reverse();
  }
}
