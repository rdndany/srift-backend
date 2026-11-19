/**
 * Friendly addresses.
 *
 * Two hosts: the website (`solrift.io`, `www.solrift.io`: the front page, the Market, the World Beyond, the classes) and
 * the game (`play.solrift.io`: the character lobby at `/`, and the online realm at `/<uid>`). Anywhere else (a local
 * machine, a preview deploy) one host does both, and the same pages live at `/`, `/game` and `/play/<uid>`.
 *
 * The game itself reads its settings from query parameters (`?online&name=Alice`, `?seed=`, `?debug` ...), so the path
 * is turned into the same parameters here; the old long form and `/play/Alice` keep working.
 */

/** Longest player name the realm takes. */
export const MAX_NAME = 16;

/** The website's host without `www.` (the game is on `play.` + this). Set at build time with `NEXT_PUBLIC_SITE_HOST`. */
export const SITE_HOST: string = process.env.NEXT_PUBLIC_SITE_HOST || 'solrift.io';

export type Where = 'site' | 'play' | 'local';

/** Which of the hosts is this hostname? */
export function whereIs(hostname: string, root: string = SITE_HOST): Where {
  const h = hostname.toLowerCase();
  if (h === `play.${root}`) return 'play';
  if (h === root || h === `www.${root}`) return 'site';
  return 'local';
}

/** Which host the page is on right now (`local` outside the browser). */
export const whereAmI = (): Where => (typeof location === 'undefined' ? 'local' : whereIs(location.hostname));

/** An id in an address: the character's id (a UUID), which the server never takes for anything but a label. */
const UID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUid = (s: string): boolean => UID.test(s);

/** A fresh id for a guest (a guest has no character to take it from). */
export function newUid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const hex = (n: number): string => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}

/** The id in a play address (`/<uid>` on the game's host, `/play/<uid>` anywhere), or null. */
export function uidFromPath(pathname: string, where: Where = whereAmI()): string | null {
  const m = /^\/play\/([^/]+)\/?$/.exec(pathname) ?? (where === 'play' ? /^\/([^/]+)\/?$/.exec(pathname) : null);
  return m && isUid(m[1]) ? m[1].toLowerCase() : null;
}

/** The name in a player's address (`/play/Alice`), cleaned the way the title screen cleans it, or null. */
export function nameFromPath(pathname: string): string | null {
  const m = /^\/play\/([^/]+)\/?$/.exec(pathname);
  if (!m) return null;
  let raw = m[1];
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (isUid(raw)) return null;
  const clean = raw.replace(/[^\w -]/g, '').trim().slice(0, MAX_NAME);
  return clean || null;
}

/** Is this address one of the friendly play addresses? */
export const isPlayPath = (pathname: string, where: Where = whereAmI()): boolean =>
  /^\/play(\/[^/]*)?\/?$/.test(pathname) || (where === 'play' && uidFromPath(pathname, where) !== null);

/**
 * The character lobby: where PLAY on the front page leads: one page to choose how to play and who plays, then start.
 * It is `/` on the game's host and `/game` elsewhere. Plain, it is that page; with the game's own parameters
 * (`?seed=` ...) it starts the game.
 */
export const isGamePath = (pathname: string, where: Where = whereAmI()): boolean => /^\/game\/?$/.test(pathname) || (where === 'play' && /^\/?$/.test(pathname));

/** The address PLAY goes to: the lobby, with the other parameters of the address it was opened with (`?home&debug` ...). */
export function gamePath(search = '', where: Where = whereAmI()): string {
  const q = search && search !== '?' ? search : '';
  return where === 'play' ? `/${q}` : `/game${q}`;
}

/** The website's address for a page (`/market`), from anywhere. */
export function siteUrl(path = '/', where: Where = whereAmI(), root: string = SITE_HOST): string {
  return where === 'local' ? path : `https://${root}${path}`;
}

/** What the website hands to the lobby on the game's host (the session does not cross hosts): the way, the mode, the world. */
export const HANDOFF_KEYS = ['way', 'mode', 'world', 'to'] as const;

/** The game's lobby, from anywhere; `handoff` is what to play (see HANDOFF_KEYS), which the lobby reads and then hides. */
export function lobbyUrl(handoff: Record<string, string> = {}, where: Where = whereAmI(), root: string = SITE_HOST): string {
  if (where === 'local') return '/game';
  const q = new URLSearchParams(handoff).toString();
  return `https://play.${root}/${q ? `?${q}` : ''}`;
}

/** Where "back to the title screen" goes: the front page, whatever address the game was opened on. */
export function titleAddress(pathname: string, where: Where = whereAmI(), root: string = SITE_HOST): string {
  if (where === 'play') return `https://${root}/`;
  return isPlayPath(pathname, where) || isGamePath(pathname, where) ? '/' : pathname;
}

/**
 * An id address is not a door of its own: the realm is entered from the lobby (sign in or guest, a character, Play).
 * Play leaves this mark in the tab's session; an id address opened without it (a pasted link, a fresh private window)
 * goes to the lobby instead. A reload in the same tab keeps the mark.
 */
const ENTRY_KEY = 'solrift-entered';
export function markEntry(uid: string): void {
  try {
    sessionStorage.setItem(ENTRY_KEY, uid.toLowerCase());
  } catch {
    /* no storage: the id address will lead back to the lobby */
  }
}
export function entryAllowed(pathname: string, where: Where = whereAmI()): boolean {
  const uid = uidFromPath(pathname, where);
  if (!uid) return true; // (`/play/Alice` and `?online` are the old, direct ways in, for tests and developers)
  try {
    return sessionStorage.getItem(ENTRY_KEY) === uid;
  } catch {
    return false;
  }
}

/** The address of the online realm for a character: its id, on the game's host `/<uid>`. */
export const realmPath = (uid: string, where: Where = whereAmI()): string => (where === 'play' ? `/${uid}` : `/play/${uid}`);

/** The address of the online realm for a name (empty for a name chosen at random on arrival). */
export function playPath(name: string): string {
  const clean = name.replace(/[^\w -]/g, '').trim().slice(0, MAX_NAME);
  return clean ? `/play/${encodeURIComponent(clean)}` : '/play';
}

/** The parameters of an address, with `/play[/name]` and `/<uid>` counted as `?online[&name=...]`. */
export function paramsFor(loc: { pathname: string; search: string }, where: Where = whereAmI()): URLSearchParams {
  const params = new URLSearchParams(loc.search);
  if (isPlayPath(loc.pathname, where)) {
    params.set('online', '');
    const name = nameFromPath(loc.pathname);
    if (name && !params.has('name')) params.set('name', name);
  }
  return params;
}

/** The nice form of an old-style address (`/?online&name=Alice`), or null when it should stay as it is. */
export function prettyAddress(loc: { pathname: string; search: string }, where: Where = whereAmI()): string | null {
  if (isPlayPath(loc.pathname, where)) return null;
  const params = new URLSearchParams(loc.search);
  const keys = [...params.keys()];
  if (!params.has('online') || keys.some((k) => k !== 'online' && k !== 'name')) return null;
  return playPath(params.get('name') ?? '');
}
