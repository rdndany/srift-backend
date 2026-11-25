import type { IncomingMessage, ServerResponse } from 'node:http';
import { CLASSES, parsePlayerSave, sheetOfSave, type ClassId } from '@solrift/shared';
import { AuthError, SESSION_COOKIE, json, readBody, readCookie, type AuthService } from './auth';
import { BOARD_LIMIT, MAX_ISLE_DAYS, type Account, type Repo } from './db';
import type { RoomStore } from './roomStore';

/** One row of the Survival Island board. */
export interface IsleRank {
  rank: number;
  name: string;
  days: number;
}

/** One row of the realm board: the character's class level. */
export interface LevelRank {
  rank: number;
  name: string;
  level: number;
  /** The class they play, or null for a character from before classes. */
  class: string | null;
}

const className = (id: ClassId | null): string | null => (id ? CLASSES[id].name : null);

/**
 * The realm board. Level is the class level when the character has a class, otherwise the experience level:
 * the same number the lobby shows. Highest first. A tie is alphabetical.
 */
export function levelBoard(store: RoomStore, accountOf: (id: string) => Account | null, limit = BOARD_LIMIT): LevelRank[] {
  const rows: { name: string; level: number; class: string | null }[] = [];
  for (const { key, value } of store.listJson('player:')) {
    const id = key.slice('player:'.length);
    if (!id) continue;
    const account = accountOf(id);
    if (!account || account.look === null) continue;
    const save = parsePlayerSave(value);
    if (!save) continue;
    const level = sheetOfSave(save, account.class).level;
    if (!Number.isFinite(level) || level < 1) continue;
    rows.push({ name: account.displayName, level, class: className(account.class) });
  }
  rows.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
  return rows.slice(0, limit).map((row, i) => ({ rank: i + 1, ...row }));
}

/**
 * Serves the public boards and the island-day report.
 * `GET /leaderboard` needs no account. `POST /leaderboard/isle` keeps a signed-in character's best day.
 */
export function createLeaderboardRouter(auth: AuthService, repo: Repo, store: RoomStore, opts: { trustProxy: boolean }) {
  const hits = new Map<string, { count: number; reset: number }>();
  const limited = (key: string, max: number): boolean => {
    const t = Date.now();
    const h = hits.get(key);
    if (!h || h.reset <= t) {
      if (hits.size > 5000) hits.clear();
      hits.set(key, { count: 1, reset: t + 60_000 });
      return false;
    }
    return ++h.count > max;
  };
  const ipOf = (req: IncomingMessage): string => {
    const fwd = opts.trustProxy ? req.headers['x-forwarded-for'] : undefined;
    const first = typeof fwd === 'string' ? fwd.split(',')[0].trim() : '';
    return first || req.socket.remoteAddress || 'unknown';
  };

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname !== '/leaderboard' && url.pathname !== '/leaderboard/isle') return false;
    try {
      if (req.method === 'GET' && url.pathname === '/leaderboard') {
        if (limited(`g:${ipOf(req)}`, 60)) throw new AuthError(429, 'too many requests');
        const origin = req.headers.origin;
        const account = origin === undefined || auth.isAllowedOrigin(origin) ? auth.resolve(readCookie(req.headers.cookie, SESSION_COOKIE)) : null;
        const isle = repo.isleBoard(BOARD_LIMIT).map((row, i) => ({ rank: i + 1, name: row.name, days: row.days }));
        json(res, 200, { isle, levels: levelBoard(store, (id) => repo.getAccount(id)), you: account?.displayName ?? null }, { 'cache-control': 'no-store' });
        return true;
      }
      if (req.method === 'POST' && url.pathname === '/leaderboard/isle') {
        const origin = req.headers.origin;
        if (!auth.isAllowedOrigin(origin)) throw new AuthError(403, 'origin not allowed');
        if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) throw new AuthError(415, 'expected application/json');
        const account = auth.resolve(readCookie(req.headers.cookie, SESSION_COOKIE));
        if (!account || account.look === null) throw new AuthError(401, 'sign in first');
        if (limited(`p:${account.id}`, 30)) throw new AuthError(429, 'too many requests');
        const body = (await readBody(req)) as { days?: unknown };
        const days = body?.days;
        if (!Number.isInteger(days) || (days as number) < 1 || (days as number) > MAX_ISLE_DAYS) throw new AuthError(400, 'that is not a day count');
        const kept = repo.noteIsleDays(account.id, days as number, Date.now());
        json(res, 200, { ok: true, days: kept });
        return true;
      }
      throw new AuthError(405, 'method not allowed');
    } catch (err) {
      if (err instanceof AuthError) json(res, err.status, { error: err.message });
      else {
        console.error('[leaderboard] unexpected error', err);
        json(res, 500, { error: 'internal error' });
      }
      return true;
    }
  };
}
