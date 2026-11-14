import type { Player } from './player';
import type { Realm } from './realm';
import type { PartyMemberView } from './sessionProtocol';

/**
 * Parties: up to four players who share one copy of a dungeon (see `Realm.usePortal`). A party is made when the
 * first invitation is accepted, the one who invited being its leader; only the leader invites and removes
 * people. When the leader goes the next player takes over. A party has no life of its own: it lasts as long as
 * it has somebody in it.
 *
 * The party answers to the dungeon with its key (`keyOf`), so everyone in it walks into the same copy. A player
 * who is inside a copy that is no longer theirs (they left or were removed) is put out by the realm.
 */

/** Most players in a party. */
export const MAX_PARTY = 4;
/** Seconds an invitation stays open. */
export const INVITE_SECONDS = 60;

export interface Party {
  readonly id: number;
  /** The members, the leader first. */
  readonly members: Player[];
}

interface Invite {
  from: Player;
  expires: number;
}

export class Parties {
  private nextId = 1;
  private readonly of = new Map<Player, Party>();
  private readonly invites = new Map<Player, Invite>();
  private clock = 0;

  constructor(private readonly realm: Realm) {}

  partyOf(p: Player): Party | null {
    return this.of.get(p) ?? null;
  }

  /** The dungeon key the party shares (null for a player on their own). */
  keyOf(p: Player): string | null {
    const party = this.of.get(p);
    return party ? `party:${party.id}` : null;
  }

  /** Everybody in the player's party, the player included (just them when alone). */
  membersOf(p: Player): readonly Player[] {
    return this.of.get(p)?.members ?? [p];
  }

  /** Is this the leader of a party? */
  isLeader(p: Player): boolean {
    return this.of.get(p)?.members[0] === p;
  }

  private find(name: string): Player | null {
    const n = name.toLowerCase();
    return this.realm.players.find((x) => x.name.toLowerCase() === n) ?? null;
  }

  private tellAll(party: Party, text: string, except?: Player): void {
    for (const m of party.members) if (m !== except) m.emit({ t: 'toast', text });
  }

  /** Invite a player (by name). Returns what to tell the one who asked. */
  invite(from: Player, name: string | undefined): string {
    if (!name) return 'Usage: /party invite <player>';
    const to = this.find(name);
    if (!to) return `Nobody called ${name} is here.`;
    if (to === from) return 'You cannot invite yourself.';
    const mine = this.of.get(from);
    if (mine && mine.members[0] !== from) return 'Only the party leader can invite.';
    if (mine && mine.members.length >= MAX_PARTY) return `The party is full (${MAX_PARTY}).`;
    if (this.of.has(to)) return mine && this.of.get(to) === mine ? `${to.name} is already in your party.` : `${to.name} is already in a party.`;
    this.invites.set(to, { from, expires: this.clock + INVITE_SECONDS });
    to.emit({ t: 'toast', text: `${from.name} invites you to a party. Press Y to accept or N to decline.` });
    return `Invited ${to.name}. The invitation lasts ${INVITE_SECONDS} seconds.`;
  }

  accept(p: Player): string {
    const inv = this.invites.get(p);
    if (!inv || inv.expires < this.clock) {
      this.invites.delete(p);
      return 'You have no invitation.';
    }
    this.invites.delete(p);
    const from = inv.from;
    if (!this.realm.players.includes(from)) return 'They have left the game.';
    if (this.of.has(p)) return 'You are already in a party. Leave it first (/party leave).';
    let party = this.of.get(from);
    if (party && party.members[0] !== from) return `${from.name} is no longer the leader.`;
    if (party && party.members.length >= MAX_PARTY) return `${from.name}'s party is full (${MAX_PARTY}).`;
    if (!party) {
      // A new party takes over the dungeon its leader already has open, so nothing is lost by forming it.
      const solo = from.instanceKey();
      party = { id: this.nextId++, members: [from] };
      this.of.set(from, party);
      this.realm.rekeyCopy(solo, `party:${party.id}`);
    }
    party.members.push(p);
    this.of.set(p, party);
    this.tellAll(party, `${p.name} joined the party.`, p);
    return `You joined ${from.name}'s party: ${this.names(party)}.`;
  }

  decline(p: Player): string {
    const inv = this.invites.get(p);
    this.invites.delete(p);
    if (!inv) return 'You have no invitation.';
    inv.from.emit({ t: 'toast', text: `${p.name} declined the party invitation.` });
    return 'Invitation declined.';
  }

  leave(p: Player): string {
    const party = this.of.get(p);
    if (!party) return 'You are not in a party.';
    this.remove(p, `${p.name} left the party.`);
    return 'You left the party.';
  }

  /** The leader removes a member. */
  kick(leader: Player, name: string | undefined): string {
    const party = this.of.get(leader);
    if (!party) return 'You are not in a party.';
    if (party.members[0] !== leader) return 'Only the party leader can remove players.';
    if (!name) return 'Usage: /party kick <player>';
    const who = party.members.find((m) => m.name.toLowerCase() === name.toLowerCase());
    if (!who) return `${name} is not in your party.`;
    if (who === leader) return 'Use /party leave to leave the party.';
    this.remove(who, `${who.name} was removed from the party.`);
    who.emit({ t: 'toast', text: 'You were removed from the party.' });
    return `Removed ${who.name}.`;
  }

  /** Hand the lead to another member. */
  promote(leader: Player, name: string | undefined): string {
    const party = this.of.get(leader);
    if (!party) return 'You are not in a party.';
    if (party.members[0] !== leader) return 'Only the party leader can do that.';
    const who = party.members.find((m) => m.name.toLowerCase() === (name ?? '').toLowerCase());
    if (!who || who === leader) return 'Usage: /party leader <player in your party>';
    party.members.splice(party.members.indexOf(who), 1);
    party.members.unshift(who);
    this.tellAll(party, `${who.name} is now the party leader.`);
    return `${who.name} leads the party now.`;
  }

  describe(p: Player): string {
    const party = this.of.get(p);
    return party ? `Party (${party.members.length}/${MAX_PARTY}): ${this.names(party)}` : 'You are not in a party. Use /party invite <player>.';
  }

  private names(party: Party): string {
    return party.members.map((m, i) => (i === 0 ? `${m.name} (leader)` : m.name)).join(', ');
  }

  private remove(p: Player, text: string): void {
    const party = this.of.get(p);
    if (!party) return;
    const wasLeader = party.members[0] === p;
    this.of.delete(p);
    party.members.splice(party.members.indexOf(p), 1);
    for (const [to, inv] of [...this.invites]) if (inv.from === p || to === p) this.invites.delete(to);
    if (party.members.length === 0) return;
    this.tellAll(party, text);
    // The next in line takes over when the leader goes.
    if (wasLeader) this.tellAll(party, `${party.members[0].name} is now the party leader.`);
    if (party.members.length === 1) this.tellAll(party, 'You are the only one left in the party.');
  }

  /** A player left the game. */
  onLeave(p: Player): void {
    this.remove(p, `${p.name} left the game and the party.`);
    this.invites.delete(p);
    for (const [to, inv] of [...this.invites]) if (inv.from === p) this.invites.delete(to);
  }

  /** Do one party action for a player (a chat command or a button) and return what to tell them. */
  run(p: Player, action: string | undefined, name?: string): string {
    switch ((action ?? 'list').toLowerCase()) {
      case 'invite':
        return this.invite(p, name);
      case 'accept':
        return this.accept(p);
      case 'decline':
        return this.decline(p);
      case 'leave':
        return this.leave(p);
      case 'kick':
        return this.kick(p, name);
      case 'leader':
        return this.promote(p, name);
      case 'list':
        return this.describe(p);
      default:
        return 'Usage: /party invite <player> | accept | decline | leave | kick <player> | leader <player> | list';
    }
  }

  /** Who is inviting this player right now, if anyone. */
  inviteFor(p: Player): string | null {
    const inv = this.invites.get(p);
    return inv && inv.expires >= this.clock && this.realm.players.includes(inv.from) ? inv.from.name : null;
  }

  /** What the interface shows for this player. */
  viewOf(p: Player): { members: PartyMemberView[]; invite: string | null } {
    const party = this.of.get(p);
    const members = party
      ? party.members.map((m, i) => ({ name: m.name, lead: i === 0, you: m === p, hp: Math.max(0, Math.round(m.vitals.health)), level: m.xp.level }))
      : [];
    return { members, invite: this.inviteFor(p) };
  }

  /** Tell every player whose party or invitation has changed since they were last told. Cheap for those who have neither. */
  sync(): void {
    for (const p of this.realm.players) {
      if (!this.of.has(p) && p.partyView === '' && !this.invites.has(p)) continue; // nothing now, nothing before
      const view = this.viewOf(p);
      const key = view.members.length === 0 && view.invite === null ? '' : JSON.stringify(view);
      if (key === p.partyView) continue;
      p.partyView = key;
      p.emit({ t: 'party', members: view.members, invite: view.invite });
    }
  }

  update(dt: number): void {
    this.clock += dt;
  }
}
