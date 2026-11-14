import { INSPECT_SLOTS, memberOf, type ClassId, type GuildData, type GuildMemberView, type GuildView, type InspectView, type ItemStack, type ItemView, type OnlineView, type Player, type SocialBook, type SocialEntry, type SocialView } from '@solrift/shared';

/** What the social features need to know about somebody in the room. */
export interface SocialMember {
  id: number;
  name: string;
  /** The account, or null for a guest. */
  key: string | null;
  player: Player;
  book: SocialBook;
  /** Who whispered them last (`/r` answers them). */
  replyTo: number | null;
}

/** Most names the window lists as online (a full room is 120). */
const MAX_ONLINE = 200;

export const entryOf = (m: SocialMember): SocialEntry => ({ key: m.key, name: m.name });

/** The member with this name (any case), if they are in the room. */
export function findMember<M extends SocialMember>(members: Iterable<M>, name: string): M | null {
  const want = name.trim().toLowerCase();
  if (!want) return null;
  for (const m of members) if (m.name.toLowerCase() === want) return m;
  return null;
}

/**
 * Split "ann smith hello there" into the member and what is said to them. Names can hold spaces, so the longest name that the
 * text begins with (and a space follows) wins.
 */
export function splitTarget<M extends SocialMember>(members: Iterable<M>, text: string): { target: M; text: string } | null {
  const lower = text.toLowerCase();
  let best: M | null = null;
  for (const m of members) {
    const n = m.name.toLowerCase();
    if ((lower === n || lower.startsWith(`${n} `)) && (!best || n.length > best.name.length)) best = m;
  }
  return best ? { target: best, text: text.slice(best.name.length).trim() } : null;
}

const classOf = (m: SocialMember): { cls?: ClassId; level?: number } => {
  const c = m.player.cls;
  return c ? { cls: c.classId, level: c.level } : {};
};

/** The lists a player's social window shows. `guild` is the one they are in and `invite` one they have been asked to join. */
export function socialView(members: readonly SocialMember[], me: SocialMember, guild: GuildData | null = null, invite: { guild: string; from: string } | null = null): SocialView {
  const byKey = new Map<string, SocialMember>();
  for (const m of members) if (m.key) byKey.set(m.key, m);
  const friends = me.book.friends.map((e) => {
    const on = e.key ? byKey.get(e.key) : undefined;
    return on ? { name: on.name, online: true, ...classOf(on) } : { name: e.name, online: false };
  });
  friends.sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  const online: OnlineView[] = members.slice(0, MAX_ONLINE).map((m) => ({
    name: m.name,
    ...classOf(m),
    friend: me.book.isFriend(entryOf(m)),
    ignored: me.book.isIgnored(entryOf(m)),
    you: m === me,
  }));
  online.sort((a, b) => Number(b.you) - Number(a.you) || Number(b.friend) - Number(a.friend) || a.name.localeCompare(b.name));
  return { friends, ignored: me.book.ignored.map((e) => e.name), online, guild: guild ? guildView(guild, byKey, me.key) : null, guildInvite: invite };
}

/** Your guild: the leader first, then officers, then members, the ones who are online before the others. */
function guildView(g: GuildData, byKey: Map<string, SocialMember>, myKey: string | null): GuildView {
  const members: GuildMemberView[] = g.members.map((m) => {
    const on = byKey.get(m.key);
    return on ? { name: on.name, rank: m.rank, online: true, ...classOf(on) } : { name: m.name, rank: m.rank, online: false };
  });
  members.sort((a, b) => a.rank - b.rank || Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  return { name: g.name, tag: g.tag, motd: g.motd, rank: (myKey ? memberOf(g, myKey)?.rank : undefined) ?? 2, members };
}
/** What a player has on, in the order of `INSPECT_SLOTS`. */
export function inspectView(m: SocialMember, view: (s: ItemStack | null) => ItemView | null): InspectView {
  const p = m.player;
  const slots: (ItemStack | null)[] = [p.held, p.offhand.get(0), p.armor.get(0), p.armor.get(1), p.armor.get(2), p.armor.get(3)];
  return { name: m.name, ...classOf(m), items: INSPECT_SLOTS.map((_, i) => view(slots[i] ?? null)) };
}
