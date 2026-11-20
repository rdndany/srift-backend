import { allItems, type ItemDef } from '@solrift/shared';

/**
 * Who may be an admin. Never anything a client says: it is the wallet that signed in (its signature was checked when the session
 * began) or the id of the character being played, matched against what the server's owner wrote in `ADMIN_WALLETS` /
 * `ADMIN_ACCOUNTS`. A guest has neither, so a guest can never be one. Being on the list only makes `/admin on` possible; the
 * powers stay off until the player turns them on, and are off again whenever they reconnect.
 */
export interface AdminOptions {
  /** Wallet addresses (all of their characters may be admins). */
  wallets?: readonly string[];
  /** Ids of single characters (the id in `/auth/me`). */
  accounts?: readonly string[];
}

/** A comma- or space-separated list from an environment variable. */
export function parseIdList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAdminIdentity(opts: AdminOptions | undefined, accountId: string | null, wallet: string | null): boolean {
  if (!opts) return false;
  if (wallet && opts.wallets?.some((w) => w === wallet)) return true;
  if (accountId && opts.accounts?.some((a) => a.toLowerCase() === accountId.toLowerCase())) return true;
  return false;
}

/** What the audit log is told about every admin act. */
export interface AdminEvent {
  /** The admin's character name and account id. */
  name: string;
  account: string | null;
  /** What they did (`on`, `off`, `kick`, `ban`, `give` ...) and the details. */
  action: string;
  detail: string;
}

/** Accounts that may not play. Kept in the room's store, by account id. */
export const BANS_KEY = 'admin:bans';
export interface BanEntry {
  name: string;
  by: string;
  reason: string;
  at: number;
}
export type Bans = Record<string, BanEntry>;

export function parseBans(v: unknown): Bans {
  const out: Bans = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, e] of Object.entries(v as Record<string, unknown>)) {
    const b = e as Partial<BanEntry> | null;
    if (b && typeof b.name === 'string') out[k] = { name: b.name, by: String(b.by ?? ''), reason: String(b.reason ?? ''), at: Number(b.at) || 0 };
  }
  return out;
}

const norm = (s: string): string => s.trim().toLowerCase().replace(/[\s-]+/g, '_');

/** An item by its name (`diamond_sword`, `Diamond Sword`), else the only one whose name holds the words. */
export function findItem(query: string): ItemDef | null {
  const q = norm(query);
  if (!q) return null;
  const all = allItems().filter((i) => i.id !== 0);
  const exact = all.find((i) => norm(i.name) === q);
  if (exact) return exact;
  const some = all.filter((i) => norm(i.name).includes(q));
  return some.length === 1 ? some[0] : null;
}

/** The names that hold the words, for a message when more than one does. */
export function itemMatches(query: string, limit = 8): string[] {
  const q = norm(query);
  if (!q) return [];
  return allItems()
    .filter((i) => i.id !== 0 && norm(i.name).includes(q))
    .slice(0, limit)
    .map((i) => i.name);
}
