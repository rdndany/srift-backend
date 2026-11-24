import { describe, expect, it } from 'vitest';
import { I, mulberry32, parseNetClientMessage, type NetServerMessage } from '@solrift/shared';
import { isAdminIdentity, parseIdList, type AdminEvent } from './admin';
import { GameRoom, type RoomOptions } from './room';
import { MemoryRoomStore } from './roomStore';

const OWNER_WALLET = 'OwnerWallet1111111111111111111111111111111';
const OTHER_WALLET = 'OtherWallet1111111111111111111111111111111';

class Client {
  messages: NetServerMessage[] = [];
  closed: string | null = null;
  id: number | null = null;
  conn = {
    send: (m: NetServerMessage) => this.messages.push(m),
    close: (r: string) => (this.closed = r),
  };
  constructor(readonly room: GameRoom) {}
  /** Joins like a signed-in character (an account id and the wallet that signed), or as a guest when both are null. */
  join(name: string, accountId: string | null = null, wallet: string | null = null): number | null {
    this.id = this.room.join(this.conn, name, accountId, null, null, wallet);
    return this.id;
  }
  /** Says it after a pause long enough for the room's chat limit to allow it. */
  say(text: string): void {
    for (let i = 0; i < 40; i++) this.room.tick();
    const msg = parseNetClientMessage({ t: 'chat', text });
    if (!msg) throw new Error('bad chat');
    this.room.receive(this.id!, msg);
  }
  notices(): string[] {
    return this.messages.filter((m): m is Extract<NetServerMessage, { t: 'notice' }> => m.t === 'notice').map((m) => m.text);
  }
  chats(): string[] {
    return this.messages.filter((m): m is Extract<NetServerMessage, { t: 'chat' }> => m.t === 'chat').map((m) => m.text);
  }
  last(): string {
    return this.notices().at(-1) ?? '';
  }
}

function setup(opts: Partial<RoomOptions> = {}) {
  const events: AdminEvent[] = [];
  const room = new GameRoom({
    seed: 1337,
    naturalSpawning: false,
    rand: mulberry32(5),
    store: new MemoryRoomStore(),
    admins: { wallets: [OWNER_WALLET] },
    onAdmin: (e) => events.push(e),
    ...opts,
  });
  const owner = new Client(room);
  owner.join('boss', 'acct-owner', OWNER_WALLET);
  return { room, events, owner };
}

describe('who may be an admin', () => {
  it('is decided by the signed-in wallet or character, never by a guest', () => {
    const opts = { wallets: ['W1'], accounts: ['ABC-1'] };
    expect(isAdminIdentity(opts, 'x', 'W1')).toBe(true);
    expect(isAdminIdentity(opts, 'abc-1', 'other')).toBe(true);
    expect(isAdminIdentity(opts, 'x', 'w1')).toBe(false);
    expect(isAdminIdentity(opts, null, null)).toBe(false);
    expect(isAdminIdentity(undefined, 'abc-1', 'W1')).toBe(false);
    expect(isAdminIdentity({}, 'abc-1', 'W1')).toBe(false);
    expect(parseIdList(' a, b  c,,')).toEqual(['a', 'b', 'c']);
    expect(parseIdList(undefined)).toEqual([]);
  });
});

describe('/admin', () => {
  it('turns admin mode on and off for a listed wallet, and starts off on every join', () => {
    const { room, owner, events } = setup();
    owner.say('/admin');
    expect(owner.last()).toBe('Admin mode is off.');
    owner.say('/admin on');
    expect(owner.last()).toContain('Admin mode ON');
    owner.say('/admin on');
    expect(owner.last()).toBe('Admin mode is already on.');
    owner.say('/admin off');
    expect(owner.last()).toBe('Admin mode OFF.');
    expect(events.map((e) => e.action)).toEqual(['on', 'off']);
    // The client is told, so it can show the block panel while admin mode is on.
    expect(owner.messages.filter((m) => m.t === 'admin')).toEqual([{ t: 'admin', on: true }, { t: 'admin', on: false }]);
    owner.say('/admin on');
    // A new connection is a new session: the powers are off again.
    const again = new Client(room);
    again.join('boss', 'acct-owner', OWNER_WALLET);
    again.say('/kick nobody');
    expect(again.last()).toBe('Admin mode is off. Type /admin on.');
  });

  it('does not exist for anyone else: a guest, another wallet, or a stranger who knows the name', () => {
    const { room, events } = setup();
    const guest = new Client(room);
    guest.join('boss');
    guest.say('/admin on');
    expect(guest.last()).toBe('Unknown command: /admin');
    const other = new Client(room);
    other.join('mallory', 'acct-other', OTHER_WALLET);
    other.say('/admin on');
    other.say('/give diamond 64');
    other.say('/time day');
    expect(other.notices()).toEqual(['Unknown command: /admin', 'Unknown command: /give', 'Cheats are off on this server']);
    expect(events.filter((e) => e.action === 'refused')).toHaveLength(3);
    expect(events.some((e) => e.action === 'on')).toBe(false);
  });

  it('gives the cheat commands only while admin mode is on, and takes creative mode away when it ends', () => {
    const { room, owner } = setup();
    owner.say('/time night');
    expect(owner.last()).toBe('Cheats are off on this server');
    owner.say('/admin on');
    owner.say('/time night');
    expect(owner.last()).toBe('Time set to night');
    owner.say('/gamemode creative');
    expect(room.player(owner.id!)!.mode).toBe('creative');
    owner.say('/admin off');
    expect(room.player(owner.id!)!.mode).toBe('survival');
    owner.say('/time day');
    expect(owner.last()).toBe('Cheats are off on this server');
  });

  it('lets a single listed character in by account id', () => {
    const { room } = setup({ admins: { accounts: ['acct-me'] } });
    const me = new Client(room);
    me.join('me', 'acct-me', OTHER_WALLET);
    me.say('/admin on');
    expect(me.last()).toContain('Admin mode ON');
    const sibling = new Client(room);
    sibling.join('sibling', 'acct-sibling', OTHER_WALLET);
    sibling.say('/admin on');
    expect(sibling.last()).toBe('Unknown command: /admin');
  });

  it('is not there at all when nobody is listed', () => {
    const { room } = setup({ admins: undefined });
    const c = new Client(room);
    c.join('boss', 'acct-owner', OWNER_WALLET);
    c.say('/admin on');
    expect(c.last()).toBe('Unknown command: /admin');
  });
});

describe('the admin tools', () => {
  it('kick, ban (by wallet, kept for the next visit), unban', () => {
    const { room, owner, events } = setup();
    owner.say('/admin on');
    const bad = new Client(room);
    bad.join('griefer', 'acct-bad', OTHER_WALLET);
    owner.say('/kick griefer rude');
    expect(bad.closed).toContain('kicked by an admin: rude');
    const back = new Client(room);
    back.join('griefer', 'acct-bad', OTHER_WALLET);
    owner.say('/ban griefer spam');
    expect(back.closed).toBe('banned: spam');
    // Another character of the same wallet is turned away too.
    const alt = new Client(room);
    expect(alt.join('alt', 'acct-alt', OTHER_WALLET)).toBeNull();
    expect(alt.messages.find((m) => m.t === 'kicked')).toMatchObject({ reason: 'banned: spam' });
    owner.say('/bans');
    expect(owner.last()).toContain('griefer (spam)');
    owner.say('/unban griefer');
    const welcome = new Client(room);
    expect(welcome.join('griefer', 'acct-bad', OTHER_WALLET)).not.toBeNull();
    expect(events.map((e) => e.action)).toEqual(['on', 'kick', 'ban', 'unban']);
  });

  it('cannot be turned on an admin, on oneself, or used on a guest ban', () => {
    const { room, owner } = setup({ admins: { wallets: [OWNER_WALLET, OTHER_WALLET] } });
    owner.say('/admin on');
    const peer = new Client(room);
    peer.join('peer', 'acct-peer', OTHER_WALLET);
    owner.say('/kick peer');
    expect(owner.last()).toContain('cannot do that');
    owner.say('/ban boss');
    expect(owner.last()).toContain('cannot do that');
    const guest = new Client(room);
    guest.join('visitor');
    owner.say('/ban visitor');
    expect(owner.last()).toContain('guest');
    expect(guest.closed).toBeNull();
  });

  it('mutes a player for a while', () => {
    const { room, owner } = setup();
    owner.say('/admin on');
    const talker = new Client(room);
    talker.join('talker');
    talker.say('hello');
    expect(owner.chats()).toContain('hello');
    owner.say('/mute talker 1');
    talker.say('again');
    talker.say('/me waves');
    expect(owner.chats()).not.toContain('again');
    expect(talker.notices().filter((t) => t === 'You are muted.')).toHaveLength(2);
    for (let i = 0; i < 20 * 61; i++) room.tick();
    talker.say('back');
    expect(owner.chats()).toContain('back');
    owner.say('/mute talker 5');
    owner.say('/unmute talker');
    talker.say('free');
    expect(owner.chats()).toContain('free');
  });

  it('gives items and announces', () => {
    const { room, owner } = setup();
    owner.say('/admin on');
    owner.say('/give diamond 70');
    expect(owner.last()).toContain('Given 70 diamond');
    const held = room.player(owner.id!)!.inventory;
    let diamonds = 0;
    for (let i = 0; i < held.size; i++) if (held.get(i)?.id === I.DIAMOND) diamonds += held.get(i)!.count;
    expect(diamonds).toBe(70);
    owner.say('/give zzzz');
    expect(owner.last()).toContain('No item called');
    const watcher = new Client(room);
    watcher.join('watcher');
    owner.say('/announce server restarts soon');
    expect(watcher.notices()).toContain('[Admin] server restarts soon');
  });

  it('spawns a creature by its id in front of the admin, and lists the ids', () => {
    const { room, owner, events } = setup();
    const p = room.player(owner.id!)!;
    p.teleport(10.5, 80, 10.5);
    owner.say('/spawn aurelion');
    expect(owner.last()).toBe('Admin mode is off. Type /admin on.');
    owner.say('/admin on');
    owner.say('/spawn aurelion');
    expect(owner.last()).toContain('King Aurelion (aurelion)');
    const king = p.mobs.mobs.filter((m) => m.kind === 'aurelion');
    expect(king).toHaveLength(1);
    // in front of the player (yaw 0 faces -z), a few blocks away
    expect(king[0].body.z).toBeLessThan(p.body.z - 2);
    expect(Math.abs(king[0].body.x - p.body.x)).toBeLessThan(1);
    p.yaw = Math.PI / 2; // faces -x
    owner.say('/spawn pig 3');
    const pigs = p.mobs.mobs.filter((m) => m.kind === 'pig');
    expect(pigs).toHaveLength(3);
    expect(pigs.every((m) => m.body.x < p.body.x - 2)).toBe(true);
    owner.say('/spawn nothing_like_this');
    expect(owner.last()).toContain('No mob with the id');
    owner.say('/spawn aurel');
    expect(owner.last()).toContain('Which one? aurelion');
    owner.say('/mobs aurel');
    expect(owner.last()).toContain('aurelion');
    expect(events.filter((e) => e.action === 'spawn').map((e) => e.detail)).toEqual(['aurelion x1', 'pig x3']);
    // a stranger is told the commands do not exist
    const other = new Client(room);
    other.join('stranger', null, OTHER_WALLET);
    other.say('/spawn aurelion');
    expect(other.last()).toBe('Unknown command: /spawn');
  });

  it('tpto and bring move players', () => {
    const { room, owner } = setup();
    owner.say('/admin on');
    const pal = new Client(room);
    pal.join('pal');
    room.player(pal.id!)!.teleport(50, 120, 60);
    owner.say('/tpto pal');
    expect(Math.round(room.player(owner.id!)!.body.x)).toBe(50);
    room.player(owner.id!)!.teleport(-30, 120, 5);
    owner.say('/bring pal');
    expect(Math.round(room.player(pal.id!)!.body.x)).toBe(-30);
  });
});
