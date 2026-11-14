/**
 * Friendly addresses. `/play` joins the online realm, and `/play/Alice` joins it as Alice. The game itself reads
 * its settings from query parameters (`?online&name=Alice`, `?seed=`, `?debug` ...), so the path is turned into
 * the same parameters here; the old long form keeps working.
 */

/** Longest player name the realm takes. */
export const MAX_NAME = 16;

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
  const clean = raw.replace(/[^\w -]/g, '').trim().slice(0, MAX_NAME);
  return clean || null;
}

/** Is this address one of the friendly play addresses? */
export const isPlayPath = (pathname: string): boolean => /^\/play(\/[^/]*)?\/?$/.test(pathname);

/** Where "back to the title screen" goes: the front page, whatever address the game was opened on. */
export const titleAddress = (pathname: string): string => (isPlayPath(pathname) ? '/' : pathname);

/** The address of the online realm for a name (empty for a name chosen at random on arrival). */
export function playPath(name: string): string {
  const clean = name.replace(/[^\w -]/g, '').trim().slice(0, MAX_NAME);
  return clean ? `/play/${encodeURIComponent(clean)}` : '/play';
}

/** The parameters of an address, with `/play[/name]` counted as `?online[&name=...]`. */
export function paramsFor(loc: { pathname: string; search: string }): URLSearchParams {
  const params = new URLSearchParams(loc.search);
  if (isPlayPath(loc.pathname)) {
    params.set('online', '');
    const name = nameFromPath(loc.pathname);
    if (name && !params.has('name')) params.set('name', name);
  }
  return params;
}

/** The nice form of an old-style address (`/?online&name=Alice`), or null when it should stay as it is. */
export function prettyAddress(loc: { pathname: string; search: string }): string | null {
  if (isPlayPath(loc.pathname)) return null;
  const params = new URLSearchParams(loc.search);
  const keys = [...params.keys()];
  if (!params.has('online') || keys.some((k) => k !== 'online' && k !== 'name')) return null;
  return playPath(params.get('name') ?? '');
}
