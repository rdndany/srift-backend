import { describe, expect, it } from 'vitest';
import { GUILD_COST, mulberry32, type NetServerMessage } from '@solrift/shared';
import { GameRoom } from './room';
import { MemoryRoomStore } from './roomStore';

class Client {
  messages: NetServerMessage[] = [];
  id = 0;
  conn = { send: (m: NetServerMessage) => this.messages.push(m), close: () => {} };
  constructor(readonly room: GameRoom) {}
  join(name: string, account: string | null = null): this {
    const id = this.room.join(this.conn, name, account);
    if (id === null) throw new Error('join refused');
    this.id = id;
    return this;
  }
  /** Run a guild line (as the window sends it), with time for the rate limit between. */
  g(line: string): void {
    for (let i = 0; i < 16; i++) this.room.tick();
    this.room.receive(this.id, { t: 'guild', line });
  }
  say(text: string): void {
    for (let i = 0; i < 45; i++) this.room.tick();
    this.room.receive(this.id, { t: 'chat', text });
  }
  notices(): string[] {
    return this.messages.flatMap((m) => (m.t === 'notice' ? [m.text] : []));
  }
  chats() {
    return this.messages.flatMap((m) => (m.t === 'chat' ? [m] : []));
  }
  view() {
    return (this.messages.filter((m) => m.t === 'social').pop() as Extract<NetServerMessage, { t: 'social' }> | undefined)?.view;
  }
  coins(n: number): this {
    this.room.player(this.id)!.addCoins(n);
    return this;
  }
}

const make = (store = new MemoryRoomStore()) => new GameRoom({ seed: 7, naturalSpawning: false, rand: mulberry32(1), store });

/** A room with a guild, "Dawn Riders", led by ann, with bob and cy in it. */
function founded() {
  const store = new MemoryRoomStore();
  const room = make(store);
  const ann = new Client(room).join('ann', 'acct-ann').coins(500);
  const bob = new Client(room).join('bob', 'acct-bob');
  const cy = new Client(room).join('cy', 'acct-cy');
  ann.g('create Dawn Riders DAWN');
  ann.g('invite bob');
  bob.g('accept');
  ann.g('invite cy');
  cy.g('accept');
  return { store, room, ann, bob, cy };
}

describe('founding a guild', () => {
  it('costs coins, makes you its leader, and puts its tag on your name plate', () => {
    const room = make();
    const ann = new Client(room).join('ann', 'acct-ann').coins(150);
    ann.g('create Dawn Riders dawn');
    expect(ann.notices().pop()).toBe('You founded Dawn Riders <DAWN>.');
    expect(room.player(ann.id)!.coins).toBe(150 - GUILD_COST);
    expect(ann.view()!.guild).toMatchObject({ name: 'Dawn Riders', tag: 'DAWN', rank: 0 });
    room.tick();
    const seen = new Client(room).join('dee');
    room.tick();
    const snap = seen.messages.filter((m) => m.t === 'snap').pop() as Extract<NetServerMessage, { t: 'snap' }>;
    expect(snap.players.find((p) => p.name === 'ann')?.gt).toBe('DAWN');
  });

  it('is refused without the coins, without an account, with a taken name, or when you already have one', () => {
    const room = make();
    const poor = new Client(room).join('poor', 'acct-poor');
    poor.g('create Poor Folk POOR');
    expect(poor.notices().pop()).toContain(`costs ${GUILD_COST} coins`);
    const guest = new Client(room).join('guest').coins(500);
    guest.g('create Guest Club GUST');
    expect(guest.notices().pop()).toContain('account');
    const ann = new Client(room).join('ann', 'acct-ann').coins(500);
    ann.g('create Dawn Riders DAWN');
    const bob = new Client(room).join('bob', 'acct-bob').coins(500);
    bob.g('create dawn riders OTHR');
    expect(bob.notices().pop()).toBe('A guild with that name already exists.');
    bob.g('create Other Folk dawn');
    expect(bob.notices().pop()).toBe('A guild with that tag already exists.');
    expect(room.player(bob.id)!.coins).toBe(500);
    ann.g('create Second One TWO');
    expect(ann.notices().pop()).toContain('already in Dawn Riders');
    bob.g('create X Y');
    expect(bob.notices().pop()).toContain('at least 3');
  });
});

describe('joining and leaving', () => {
  it('works by invitation, which can be declined, and the guild hears of it', () => {
    const { ann, bob, cy, room } = founded();
    expect(bob.notices().some((n) => n.includes('invites you to join Dawn Riders'))).toBe(true);
    expect(ann.notices().pop()).toBe('cy joined the guild.');
    expect(bob.view()!.guild!.members.map((m) => [m.name, m.rank])).toEqual([['ann', 0], ['bob', 2], ['cy', 2]]);
    const dee = new Client(room).join('dee', 'acct-dee');
    ann.g('invite dee');
    expect(dee.view()!.guildInvite).toEqual({ guild: 'Dawn Riders', from: 'ann' });
    dee.g('decline');
    expect(dee.view()!.guildInvite).toBeNull();
    dee.g('accept');
    expect(dee.notices().pop()).toBe('You have no guild invitation.');
    expect(cy.view()!.guild!.members).toHaveLength(3);
  });

  it('lets only officers invite, and not a guest, a member of another guild, or nobody', () => {
    const { ann, bob, room } = founded();
    const dee = new Client(room).join('dee', 'acct-dee');
    bob.g('invite dee');
    expect(bob.notices().pop()).toContain('Only officers');
    new Client(room).join('gus');
    ann.g('invite gus');
    expect(ann.notices().pop()).toContain('guest');
    ann.g('invite ghost');
    expect(ann.notices().pop()).toBe('ghost is not online.');
    ann.g('invite bob');
    expect(ann.notices().pop()).toContain('already in a guild');
    void dee;
  });

  it('lets an invitation lapse', () => {
    const { ann, room } = founded();
    const dee = new Client(room).join('dee', 'acct-dee');
    ann.g('invite dee');
    for (let i = 0; i < 70 * room.tickHz; i++) room.tick();
    dee.g('accept');
    expect(dee.notices().pop()).toBe('You have no guild invitation.');
  });

  it('lets a member leave, but not a leader who has people to look after', () => {
    const { ann, bob, cy } = founded();
    bob.g('leave');
    expect(bob.view()!.guild).toBeNull();
    expect(ann.notices().pop()).toBe('bob left the guild.');
    ann.g('leave');
    expect(ann.notices().pop()).toContain('Hand over');
    ann.g('leader cy');
    ann.g('leave');
    expect(cy.view()!.guild!.members.map((m) => m.name)).toEqual(['cy']);
    cy.g('leave');
    expect(cy.notices().pop()).toBe('You left Dawn Riders, and it is gone.');
  });
});

describe('running a guild', () => {
  it('lets the leader promote, demote and hand over, and officers remove members', () => {
    const { ann, bob, cy } = founded();
    bob.g('promote cy');
    expect(bob.notices().pop()).toContain('Only the guild leader');
    ann.g('promote bob');
    expect(cy.view()!.guild!.members.find((m) => m.name === 'bob')!.rank).toBe(1);
    bob.g('kick cy');
    expect(cy.notices().pop()).toBe('You were removed from Dawn Riders.');
    expect(cy.view()!.guild).toBeNull();
    bob.g('kick ann');
    expect(bob.notices().pop()).toContain('below you');
    ann.g('demote bob');
    ann.g('leader bob');
    expect(bob.view()!.guild!.rank).toBe(0);
    expect(ann.view()!.guild!.rank).toBe(1);
  });

  it('has a message of the day that officers set and everyone is shown when they arrive', () => {
    const { store, ann, bob, room } = founded();
    bob.g('motd Hello');
    expect(bob.notices().pop()).toContain('officers');
    ann.g('motd Raid at dusk');
    expect(bob.notices().pop()).toBe('Guild message: Raid at dusk');
    room.leave(bob.id);
    const bob2 = new Client(room).join('bob', 'acct-bob');
    expect(bob2.notices()).toContain('Guild <DAWN>: Raid at dusk');
    expect(ann.notices()).toContain('bob has come online.');
    void store;
  });

  it('can be disbanded by the leader alone', () => {
    const { ann, bob } = founded();
    bob.g('disband');
    expect(bob.notices().pop()).toContain('leader');
    ann.g('disband');
    expect(bob.notices().pop()).toBe('Dawn Riders was disbanded.');
    expect(bob.view()!.guild).toBeNull();
    expect(ann.view()!.guild).toBeNull();
  });
});

describe('guild chat', () => {
  it('reaches the guild only, and not those who ignore the speaker', () => {
    const { ann, bob, cy, room } = founded();
    const dee = new Client(room).join('dee', 'acct-dee');
    ann.say('/g form up');
    expect(bob.chats().pop()).toMatchObject({ from: 'ann', text: 'form up', ch: 'guild' });
    expect(dee.chats().some((m) => m.text === 'form up')).toBe(false);
    cy.say('/ignore ann');
    ann.say('/g again');
    expect(cy.chats().some((m) => m.text === 'again')).toBe(false);
    expect(bob.chats().pop()).toMatchObject({ text: 'again' });
    dee.say('/g hello?');
    expect(dee.notices().pop()).toBe('You are not in a guild.');
  });

  it('answers /guild typed in chat as it does the window', () => {
    const { ann } = founded();
    ann.say('/guild info');
    expect(ann.notices().pop()).toBe('Dawn Riders <DAWN>: 3 members, 3 online.');
  });
});

describe('keeping guilds', () => {
  it('finds the guild again after the room restarts, with its ranks and message', () => {
    const { store, ann, room } = founded();
    ann.g('motd Welcome');
    ann.g('promote bob');
    room.leave(ann.id);
    const room2 = make(store);
    const ann2 = new Client(room2).join('ann', 'acct-ann');
    ann2.g('info');
    const view = ann2.view()!.guild!;
    expect(view).toMatchObject({ name: 'Dawn Riders', tag: 'DAWN', motd: 'Welcome', rank: 0 });
    expect(view.members.map((m) => [m.name, m.rank, m.online])).toEqual([
      ['ann', 0, true],
      ['bob', 1, false],
      ['cy', 2, false],
    ]);
    // a disbanded guild is gone for good, and its name is free again
    ann2.g('kick cy');
    ann2.g('kick bob');
    ann2.g('leave');
    const room3 = make(store);
    expect(room3.guilds.taken('Dawn Riders', 'DAWN')).toBeNull();
  });

  it('updates a member who plays under another name', () => {
    const { store, bob, room } = founded();
    room.leave(bob.id);
    const room2 = make(store);
    const robert = new Client(room2).join('robert', 'acct-bob');
    robert.g('info');
    expect(robert.view()!.guild!.members.map((m) => m.name)).toContain('robert');
  });
});
