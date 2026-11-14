import type { ClassId } from './classes';

/** The ranks of a guild, highest first: the leader (one), officers, members. */
export type GuildRank = 0 | 1 | 2;
export const GUILD_RANKS = ['Leader', 'Officer', 'Member'] as const;
export const RANK_LEADER: GuildRank = 0;
export const RANK_OFFICER: GuildRank = 1;
export const RANK_MEMBER: GuildRank = 2;

export const MAX_GUILD_MEMBERS = 50;
/** What it costs to found one (a coin sink; the purse is the player's). */
export const GUILD_COST = 100;
export const GUILD_NAME_MIN = 3;
export const GUILD_NAME_MAX = 20;
export const GUILD_TAG_MIN = 2;
export const GUILD_TAG_MAX = 4;
export const MAX_MOTD = 120;
/** Seconds an invitation to a guild stays open. */
export const GUILD_INVITE_SECONDS = 60;

export interface GuildMember {
  /** The account: only accounts can be in a guild. */
  key: string;
  /** The name they last played under. */
  name: string;
  rank: GuildRank;
}

/** A guild as it is kept. */
export interface GuildData {
  id: string;
  name: string;
  tag: string;
  motd: string;
  members: GuildMember[];
}

// ---- names ----------------------------------------------------------------------------------------------------------

/** A guild name as it is kept: letters, numbers, single spaces and ' - only. */
export const cleanGuildName = (raw: string): string => raw.replace(/[^\p{L}\p{N} '-]/gu, '').replace(/ {2,}/g, ' ').trim().slice(0, GUILD_NAME_MAX).trim();

/** A tag is two to four letters or digits, shown in capitals beside the names of the members. */
export const cleanGuildTag = (raw: string): string => raw.replace(/[^\p{L}\p{N}]/gu, '').slice(0, GUILD_TAG_MAX).toUpperCase();

/** Why a name or tag cannot be used, or null when it can. */
export function guildNameError(name: string, tag: string): string | null {
  if (name.length < GUILD_NAME_MIN) return `A guild name has at least ${GUILD_NAME_MIN} characters.`;
  if (!/[\p{L}\p{N}]{2}/u.test(name)) return 'A guild name needs letters or digits.';
  if (tag.length < GUILD_TAG_MIN) return `A guild tag has ${GUILD_TAG_MIN} to ${GUILD_TAG_MAX} letters or digits.`;
  return null;
}

export const cleanMotd = (raw: string): string => raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_MOTD);

// ---- the rules -----------------------------------------------------------------------------------------------------------
// Each returns the reason it cannot be done, or null (and has not changed anything). `do*` functions change the guild.

export const memberOf = (g: GuildData, key: string): GuildMember | null => g.members.find((m) => m.key === key) ?? null;
export const findGuildMember = (g: GuildData, name: string): GuildMember | null => {
  const want = name.trim().toLowerCase();
  return want ? (g.members.find((m) => m.name.toLowerCase() === want) ?? null) : null;
};

/** Officers and the leader may invite and set the message of the day. */
export const canInvite = (g: GuildData, key: string): boolean => (memberOf(g, key)?.rank ?? 9) <= RANK_OFFICER;

export function inviteError(g: GuildData, actor: string): string | null {
  if (!canInvite(g, actor)) return 'Only officers and the guild leader can invite.';
  if (g.members.length >= MAX_GUILD_MEMBERS) return 'The guild is full.';
  return null;
}

/** You can remove somebody who ranks below you, and officers and the leader only. */
export function kickError(g: GuildData, actor: string, target: string): string | null {
  const a = memberOf(g, actor);
  const t = memberOf(g, target);
  if (!a || !t) return 'They are not in the guild.';
  if (a.rank > RANK_OFFICER) return 'Only officers and the guild leader can remove members.';
  if (a.key === t.key) return 'Use /guild leave to leave.';
  if (t.rank <= a.rank) return 'You can only remove members who rank below you.';
  return null;
}

/** Only the leader changes ranks: a member becomes an officer, an officer a member. */
export function rankError(g: GuildData, actor: string, target: string, up: boolean): string | null {
  const a = memberOf(g, actor);
  const t = memberOf(g, target);
  if (!a || !t) return 'They are not in the guild.';
  if (a.rank !== RANK_LEADER) return 'Only the guild leader changes ranks.';
  if (t.rank === RANK_LEADER) return 'The leader cannot be moved: hand over the guild with /guild leader <name>.';
  if (up && t.rank === RANK_OFFICER) return `${t.name} is already an officer.`;
  if (!up && t.rank === RANK_MEMBER) return `${t.name} is already a plain member.`;
  return null;
}

export function doRank(g: GuildData, target: string, up: boolean): void {
  const t = memberOf(g, target);
  if (t) t.rank = up ? RANK_OFFICER : RANK_MEMBER;
}

export function leaderError(g: GuildData, actor: string, target: string): string | null {
  const a = memberOf(g, actor);
  const t = memberOf(g, target);
  if (!a || !t) return 'They are not in the guild.';
  if (a.rank !== RANK_LEADER) return 'Only the guild leader can hand over the guild.';
  if (a.key === t.key) return 'You already lead it.';
  return null;
}

/** The old leader becomes an officer. */
export function doLeader(g: GuildData, actor: string, target: string): void {
  const a = memberOf(g, actor);
  const t = memberOf(g, target);
  if (!a || !t) return;
  a.rank = RANK_OFFICER;
  t.rank = RANK_LEADER;
}

/** The leader cannot walk away from people who still need one. */
export function leaveError(g: GuildData, key: string): string | null {
  const m = memberOf(g, key);
  if (!m) return 'You are not in a guild.';
  if (m.rank === RANK_LEADER && g.members.length > 1) return 'Hand over the guild first (/guild leader <name>), or /guild disband.';
  return null;
}

export const motdError = (g: GuildData, actor: string): string | null => (canInvite(g, actor) ? null : 'Only officers and the guild leader can set the message of the day.');

export const disbandError = (g: GuildData, actor: string): string | null => (memberOf(g, actor)?.rank === RANK_LEADER ? null : 'Only the guild leader can disband it.');

// ---- keeping it ---------------------------------------------------------------------------------------------------------

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Read a kept guild; null when it is not one (nothing is trusted). A guild without a leader is given one: the first member. */
export function parseGuild(raw: unknown): GuildData | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || typeof raw.name !== 'string' || typeof raw.tag !== 'string' || !Array.isArray(raw.members)) return null;
  const members: GuildMember[] = [];
  for (const m of raw.members) {
    if (!isObject(m) || typeof m.key !== 'string' || typeof m.name !== 'string' || !m.key) continue;
    if (members.some((x) => x.key === m.key)) continue;
    const rank: GuildRank = m.rank === 0 || m.rank === 1 ? m.rank : RANK_MEMBER;
    members.push({ key: m.key, name: m.name.slice(0, 24), rank });
    if (members.length >= MAX_GUILD_MEMBERS) break;
  }
  if (members.length === 0) return null;
  if (!members.some((m) => m.rank === RANK_LEADER)) members[0].rank = RANK_LEADER;
  // One leader only: the first stays.
  let led = false;
  for (const m of members) {
    if (m.rank !== RANK_LEADER) continue;
    if (led) m.rank = RANK_OFFICER;
    led = true;
  }
  const name = cleanGuildName(raw.name);
  const tag = cleanGuildTag(raw.tag);
  if (guildNameError(name, tag)) return null;
  return { id: raw.id, name, tag, motd: typeof raw.motd === 'string' ? cleanMotd(raw.motd) : '', members };
}

// ---- what the client is shown --------------------------------------------------------------------------------------------

export interface GuildMemberView {
  name: string;
  rank: GuildRank;
  online: boolean;
  cls?: ClassId;
  level?: number;
}

/** Your guild, in the social window. `rank` is yours. */
export interface GuildView {
  name: string;
  tag: string;
  motd: string;
  rank: GuildRank;
  members: GuildMemberView[];
}
