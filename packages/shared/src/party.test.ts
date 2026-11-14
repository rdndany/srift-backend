import { describe, expect, it } from 'vitest';
import {
  ADVENTURE_SEED,
  DUNGEON_MIN_LEVEL,
  GameSession,
  HeadlessWorld,
  INSTANCE_SLOTS,
  INSTANCE_STRIDE,
  MAX_PARTY,
  Player,
  Realm,
  makeGenerator,
  mulberry32,
  parseSessionMessage,
  totalForLevel,
  type AdventureWorldGenerator,
  type SessionEvent,
} from './index';

const generator = makeGenerator(ADVENTURE_SEED, 'adventure') as AdventureWorldGenerator;

function make() {
  const world = new HeadlessWorld(generator);
  const s = new GameSession({ seed: ADVENTURE_SEED, world, generator, naturalSpawning: false, rand: mulberry32(4) });
  s.finishLoading();
  return s.realm;
}

function person(realm: Realm, name: string): Player {
  const p = new Player(realm, { mode: 'survival', name });
  p.finishLoading();
  p.xp.add(totalForLevel(DUNGEON_MIN_LEVEL));
  return p;
}

const toasts = (p: Player): string[] => (p.drainEvents() as SessionEvent[]).flatMap((e) => (e.t === 'toast' ? [e.text] : []));

describe('a party', () => {
  it('is made by an invitation that is accepted, and its leader is the one who asked', () => {
    const realm = make();
    const a = person(realm, 'Ada');
    const b = person(realm, 'Bob');
    expect(realm.parties.invite(a, 'bob')).toMatch(/Invited Bob/);
    expect(toasts(b).join(' ')).toMatch(/Ada invites you/);
    expect(realm.parties.partyOf(a)).toBeNull();
    expect(realm.parties.accept(b)).toMatch(/joined Ada's party/);
    expect(realm.parties.membersOf(a).map((m) => m.name)).toEqual(['Ada', 'Bob']);
    expect(realm.parties.isLeader(a)).toBe(true);
    expect(realm.parties.isLeader(b)).toBe(false);
    expect(a.instanceKey()).toBe(b.instanceKey());
    expect(realm.parties.describe(b)).toBe('Party (2/4): Ada (leader), Bob');
  });

  it('holds four at most, and only the leader invites', () => {
    const realm = make();
    const names = ['Ada', 'Bob', 'Cy', 'Di', 'Ed'];
    const [a, b, c, d, e] = names.map((n) => person(realm, n));
    for (const p of [b, c, d]) {
      realm.parties.invite(a, p.name);
      realm.parties.accept(p);
    }
    expect(realm.parties.membersOf(a).length).toBe(MAX_PARTY);
    expect(realm.parties.invite(a, 'Ed')).toMatch(/full/);
    expect(realm.parties.invite(b, 'Ed')).toMatch(/Only the party leader/);
    expect(realm.parties.accept(e)).toBe('You have no invitation.');
  });

  it('says no to what makes no sense', () => {
    const realm = make();
    const a = person(realm, 'Ada');
    const b = person(realm, 'Bob');
    const c = person(realm, 'Cy');
    expect(realm.parties.invite(a, undefined)).toMatch(/Usage/);
    expect(realm.parties.invite(a, 'nobody')).toMatch(/Nobody called/);
    expect(realm.parties.invite(a, 'ada')).toMatch(/yourself/);
    realm.parties.invite(a, 'Bob');
    realm.parties.accept(b);
    expect(realm.parties.invite(a, 'Bob')).toMatch(/already in your party/);
    // Somebody who is in a party has to leave it before taking another invitation.
    realm.parties.invite(c, 'Bob');
    expect(realm.parties.invite(c, 'Bob')).toMatch(/already in a party/);
    expect(realm.parties.leave(c)).toBe('You are not in a party.');
    expect(realm.parties.kick(b, 'Ada')).toMatch(/Only the party leader/);
  });

  it('lets an invitation lapse, or be declined', () => {
    const realm = make();
    const a = person(realm, 'Ada');
    const b = person(realm, 'Bob');
    realm.parties.invite(a, 'Bob');
    realm.parties.update(61);
    expect(realm.parties.accept(b)).toBe('You have no invitation.');
    realm.parties.invite(a, 'Bob');
    expect(realm.parties.decline(b)).toBe('Invitation declined.');
    expect(toasts(a).join(' ')).toMatch(/Bob declined/);
    expect(realm.parties.accept(b)).toBe('You have no invitation.');
  });

  it('passes the lead on when the leader goes, and is gone when the last one has', () => {
    const realm = make();
    const a = person(realm, 'Ada');
    const b = person(realm, 'Bob');
    const c = person(realm, 'Cy');
    for (const p of [b, c]) {
      realm.parties.invite(a, p.name);
      realm.parties.accept(p);
    }
    toasts(b);
    realm.parties.leave(a);
    expect(realm.parties.partyOf(a)).toBeNull();
    expect(realm.parties.isLeader(b)).toBe(true);
    expect(toasts(c).join(' ')).toMatch(/Bob is now the party leader/);
    // A player who disconnects leaves the party too.
    c.leave();
    expect(realm.parties.membersOf(b).map((m) => m.name)).toEqual(['Bob']);
    realm.parties.leave(b);
    expect(realm.parties.partyOf(b)).toBeNull();
  });

  it('lets the leader remove a member and hand over the lead', () => {
    const realm = make();
    const a = person(realm, 'Ada');
    const b = person(realm, 'Bob');
    const c = person(realm, 'Cy');
    for (const p of [b, c]) {
      realm.parties.invite(a, p.name);
      realm.parties.accept(p);
    }
    expect(realm.parties.promote(a, 'Cy')).toMatch(/Cy leads/);
    expect(realm.parties.isLeader(c)).toBe(true);
    expect(realm.parties.kick(a, 'Bob')).toMatch(/Only the party leader/);
    expect(realm.parties.kick(c, 'Bob')).toBe('Removed Bob.');
    expect(toasts(b).join(' ')).toMatch(/You were removed/);
    expect(realm.parties.membersOf(b).length).toBe(1);
  });
});

describe('a party in the dungeon', () => {
  const party = (realm: Realm, ...names: string[]): Player[] => {
    const people = names.map((n) => person(realm, n));
    for (const p of people.slice(1)) {
      realm.parties.invite(people[0], p.name);
      realm.parties.accept(p);
    }
    return people;
  };

  it('goes into one copy together, and a stranger gets another', () => {
    const realm = make();
    const [a, b, c] = party(realm, 'Ada', 'Bob', 'Cy');
    const loner = person(realm, 'Lou');
    realm.usePortal(a);
    realm.usePortal(b);
    realm.usePortal(c);
    realm.usePortal(loner);
    expect(realm.copyAt(a)).toBe(0);
    expect(realm.copyAt(b)).toBe(0);
    expect(realm.copyAt(c)).toBe(0);
    expect(realm.copyAt(loner)).toBe(1);
    expect(loner.body.z - a.body.z).toBeCloseTo(INSTANCE_STRIDE, 3);
    expect(realm.copiesInUse).toBe(2);
    expect(realm.copyOwner(0)).toBe(a.instanceKey());
  });

  it('keeps a copy that the leader already had open when the party is formed', () => {
    const realm = make();
    const a = person(realm, 'Ada');
    const b = person(realm, 'Bob');
    realm.usePortal(a);
    expect(realm.copyAt(a)).toBe(0);
    // Ada leaves and forms a party; her copy goes with her.
    realm.usePortal(a);
    realm.parties.invite(a, 'Bob');
    realm.parties.accept(b);
    expect(realm.copyOwner(0)).toBe(a.instanceKey());
    expect(a.instanceKey()).toMatch(/^party:/);
    a.portalCooldown = 0;
    realm.usePortal(b);
    expect(realm.copyAt(b)).toBe(0);
    expect(realm.copiesInUse).toBe(1);
  });

  it('puts out whoever leaves the party while inside', () => {
    const realm = make();
    const [a, b] = party(realm, 'Ada', 'Bob');
    realm.usePortal(a);
    realm.usePortal(b);
    expect(realm.copyAt(b)).toBe(0);
    realm.parties.leave(b);
    for (let i = 0; i < 40; i++) realm.update(1 / 20, realm.players);
    expect(realm.copyAt(b)).toBe(-1);
    expect(realm.copyAt(a)).toBe(0);
  });

  it('still asks each member for the level', () => {
    const realm = make();
    const a = person(realm, 'Ada');
    const kid = new Player(realm, { mode: 'survival', name: 'Kid' });
    kid.finishLoading();
    realm.parties.invite(a, 'Kid');
    realm.parties.accept(kid);
    realm.usePortal(a);
    realm.usePortal(kid);
    expect(realm.copyAt(a)).toBe(0);
    expect(realm.copyAt(kid)).toBe(-1);
    expect(toasts(kid).join(' ')).toMatch(/level 5 and up/);
  });

  it('takes one copy for all four, however many the dungeon has', () => {
    const realm = make();
    expect(INSTANCE_SLOTS).toBeGreaterThanOrEqual(MAX_PARTY);
    const people = party(realm, 'Ada', 'Bob', 'Cy', 'Di');
    for (const p of people) realm.usePortal(p);
    expect(realm.copiesInUse).toBe(1);
    expect(people.every((p) => realm.copyAt(p) === 0)).toBe(true);
  });
});

describe('the party on screen', () => {
  const partyEvents = (p: Player) => (p.drainEvents() as SessionEvent[]).flatMap((e) => (e.t === 'party' ? [e] : []));

  it('tells the one invited who is asking, and takes the answer from a button', () => {
    const realm = make();
    const a = person(realm, 'Ada');
    const b = person(realm, 'Bob');
    a.apply({ t: 'party', a: 'invite', name: 'Bob' });
    realm.update(1 / 20, realm.players);
    expect(partyEvents(b).pop()).toEqual({ t: 'party', members: [], invite: 'Ada' });
    // Nothing changed: nothing is said again.
    realm.update(1 / 20, realm.players);
    expect(partyEvents(b)).toEqual([]);
    b.apply({ t: 'party', a: 'accept' });
    realm.update(1 / 20, realm.players);
    const forBob = partyEvents(b).pop()!;
    expect(forBob.invite).toBeNull();
    expect(forBob.members.map((m) => [m.name, m.lead, m.you])).toEqual([
      ['Ada', true, false],
      ['Bob', false, true],
    ]);
    expect(partyEvents(a).pop()!.members.map((m) => m.you)).toEqual([true, false]);
  });

  it('keeps the health of the others up to date, and clears the party when you leave', () => {
    const realm = make();
    const a = person(realm, 'Ada');
    const b = person(realm, 'Bob');
    a.apply({ t: 'party', a: 'invite', name: 'Bob' });
    b.apply({ t: 'party', a: 'accept' });
    realm.update(1 / 20, realm.players);
    partyEvents(a);
    b.vitals.health = 7;
    realm.update(1 / 20, realm.players);
    expect(partyEvents(a).pop()!.members.find((m) => m.name === 'Bob')!.hp).toBe(7);
    b.apply({ t: 'party', a: 'leave' });
    realm.update(1 / 20, realm.players);
    expect(partyEvents(b).pop()).toEqual({ t: 'party', members: [], invite: null });
    expect(partyEvents(a).pop()!.members.length).toBe(1);
  });

  it('forgets an invitation that ran out, and says nothing to people with no party', () => {
    const realm = make();
    const a = person(realm, 'Ada');
    const b = person(realm, 'Bob');
    const c = person(realm, 'Cy');
    a.apply({ t: 'party', a: 'invite', name: 'Bob' });
    realm.update(1 / 20, realm.players);
    partyEvents(b);
    realm.update(61, realm.players);
    expect(partyEvents(b).pop()).toEqual({ t: 'party', members: [], invite: null });
    expect(partyEvents(c)).toEqual([]);
  });

  it('only accepts well-formed party messages from the network', () => {
    expect(parseSessionMessage({ t: 'party', a: 'accept' })).toEqual({ t: 'party', a: 'accept' });
    expect(parseSessionMessage({ t: 'party', a: 'invite', name: 'Bob' })).toEqual({ t: 'party', a: 'invite', name: 'Bob' });
    expect(parseSessionMessage({ t: 'party', a: 'explode' })).toBeNull();
    expect(parseSessionMessage({ t: 'party', a: 'kick', name: 5 })).toBeNull();
    expect(parseSessionMessage({ t: 'party', a: 'kick', name: 'x'.repeat(40) })).toBeNull();
  });
});