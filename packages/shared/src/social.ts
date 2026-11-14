import type { ClassId } from './classes';
import type { GuildView } from './guild';

/** Where a line of chat was said. Plain chat is `say` (everyone in the realm hears it). */
export type ChatChannel = 'say' | 'whisper' | 'party' | 'emote' | 'guild';
export const isChatChannel = (x: unknown): x is ChatChannel => x === 'say' || x === 'whisper' || x === 'party' || x === 'emote' || x === 'guild';

/** What a player can do to their lists: add or drop a friend, ignore or hear somebody again. */
export type SocialAction = 'friend' | 'unfriend' | 'ignore' | 'unignore';
export const SOCIAL_ACTIONS: readonly SocialAction[] = ['friend', 'unfriend', 'ignore', 'unignore'];
export const isSocialAction = (x: unknown): x is SocialAction => (SOCIAL_ACTIONS as readonly unknown[]).includes(x);

export const MAX_FRIENDS = 50;
export const MAX_IGNORED = 50;

/** One name on a list. `key` is the account (null for a guest, who is only known by the name they have now). */
export interface SocialEntry {
  key: string | null;
  name: string;
}

export type SocialResult = 'added' | 'exists' | 'full' | 'removed' | 'missing';

const same = (a: SocialEntry, b: SocialEntry): boolean => (a.key !== null && b.key !== null ? a.key === b.key : a.name.toLowerCase() === b.name.toLowerCase());

/** A player's friends and the people they ignore. Kept with the account, so it follows them from one visit to the next. */
export class SocialBook {
  friends: SocialEntry[] = [];
  ignored: SocialEntry[] = [];

  isFriend(who: SocialEntry): boolean {
    return this.friends.some((e) => same(e, who));
  }

  isIgnored(who: SocialEntry): boolean {
    return this.ignored.some((e) => same(e, who));
  }

  /** Add to a list (the other one lets go of them: you do not ignore a friend). */
  add(list: 'friends' | 'ignored', who: SocialEntry): SocialResult {
    const other = list === 'friends' ? 'ignored' : 'friends';
    const here = this[list];
    const found = here.find((e) => same(e, who));
    if (found) {
      // A guest who became an account (or an account that was renamed) is known by the newer details.
      found.key = who.key ?? found.key;
      found.name = who.name;
      return 'exists';
    }
    if (here.length >= (list === 'friends' ? MAX_FRIENDS : MAX_IGNORED)) return 'full';
    this[other] = this[other].filter((e) => !same(e, who));
    here.push({ key: who.key, name: who.name });
    return 'added';
  }

  remove(list: 'friends' | 'ignored', who: SocialEntry): SocialResult {
    const before = this[list].length;
    this[list] = this[list].filter((e) => !same(e, who));
    return this[list].length < before ? 'removed' : 'missing';
  }

  /** What is kept: the guests are left out (a name is not somebody). */
  toJSON(): { friends: { k: string; n: string }[]; ignored: { k: string | null; n: string }[] } {
    return {
      friends: this.friends.flatMap((e) => (e.key ? [{ k: e.key, n: e.name }] : [])),
      ignored: this.ignored.map((e) => ({ k: e.key, n: e.name })),
    };
  }
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

function parseEntries(raw: unknown, max: number, needKey: boolean): SocialEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: SocialEntry[] = [];
  for (const e of raw) {
    if (!isObject(e) || typeof e.n !== 'string' || !e.n) continue;
    const key = typeof e.k === 'string' && e.k ? e.k : null;
    if (needKey && !key) continue;
    if (out.some((o) => same(o, { key, name: e.n as string }))) continue;
    out.push({ key, name: e.n.slice(0, 24) });
    if (out.length >= max) break;
  }
  return out;
}

/** Read a saved book; anything wrong with it is dropped rather than trusted. */
export function parseSocialBook(raw: unknown): SocialBook {
  const book = new SocialBook();
  if (!isObject(raw)) return book;
  book.friends = parseEntries(raw.friends, MAX_FRIENDS, true);
  book.ignored = parseEntries(raw.ignored, MAX_IGNORED, false);
  return book;
}

// ---- what the client is shown -----------------------------------------------------------------------------------------

export interface FriendView {
  name: string;
  online: boolean;
  cls?: ClassId;
  level?: number;
}

export interface OnlineView {
  name: string;
  cls?: ClassId;
  level?: number;
  friend: boolean;
  ignored: boolean;
  you: boolean;
}

/** The social window: the friends (online first), the people ignored, and everyone who is in the realm. */
export interface SocialView {
  friends: FriendView[];
  ignored: string[];
  online: OnlineView[];
  /** Your guild (null: you are in none) and an invitation to one that is open. */
  guild: GuildView | null;
  guildInvite: { guild: string; from: string } | null;
}

/** The slots an inspect window shows, in order: the main hand, the off-hand, then helmet to boots. */
export const INSPECT_SLOTS = ['Main hand', 'Off-hand', 'Helmet', 'Chestplate', 'Leggings', 'Boots'] as const;
