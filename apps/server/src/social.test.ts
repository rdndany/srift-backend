import { describe, expect, it } from 'vitest';
import { armorId, makeStack, outfitId, mulberry32, parseNetClientMessage, type NetServerMessage } from '@solrift/shared';
import { GameRoom } from './room';
import { MemoryRoomStore } from './roomStore';

class Client {
  messages: NetServerMessage[] = [];
  id = 0;
  conn = { send: (m: NetServerMessage) => this.messages.push(m), close: () => {} };
  constructor(readonly room: GameRoom) {}
  join(name: string, account: string | null = null, cls: 'warrior' | 'mage' | 'ranger' | null = null): this {
    const id = this.room.join(this.conn, name, account, null, cls);
    if (id === null) throw new Error('join refused');
    this.id = id;
    return this;
  }
  say(text: string): void {
    this.room.receive(this.id, { t: 'chat', text });
  }
  chats() {
    return this.messages.flatMap((m) => (m.t === 'chat' ? [m] : []));
  }
  notices(): string[] {
    return this.messages.flatMap((m) => (m.t === 'notice' ? [m.text] : []));
  }
  last<T extends NetServerMessage['t']>(t: T): Extract<NetServerMessage, { t: T }> | undefined {
    return this.messages.filter((m) => m.t === t).pop() as Extract<NetServerMessage, { t: T }> | undefined;
  }
}

const make = (store = new MemoryRoomStore()) => new GameRoom({ seed: 7, naturalSpawning: false, rand: mulberry32(1), store });
const tick = (room: GameRoom, n = 1): void => {
  for (let i = 0; i < n; i++) room.tick();
};

describe('chat channels', () => {
  it('says plain chat to everyone, tagged as said', () => {
    const room = make();
    const a = new Client(room).join('ann');
    const b = new Client(room).join('bob');
    a.say('hello');
    expect(b.chats().pop()).toMatchObject({ from: 'ann', text: 'hello', ch: 'say' });
    expect(a.chats().pop()).toMatchObject({ from: 'ann', text: 'hello' });
  });

  it('whispers to one player, and the sender sees what they sent', () => {
    const room = make();
    const a = new Client(room).join('ann');
    const b = new Client(room).join('bob');
    const c = new Client(room).join('cy');
    a.say('/w bob psst, come here');
    expect(b.chats().pop()).toMatchObject({ from: 'ann', text: 'psst, come here', ch: 'whisper' });
    expect(a.chats().pop()).toMatchObject({ from: 'ann', to: 'bob', text: 'psst, come here', ch: 'whisper' });
    expect(c.chats()).toHaveLength(0);
  });

  it('answers the last whisper with /r, and says so when there is nobody to answer', () => {
    const room = make();
    const a = new Client(room).join('ann');
    const b = new Client(room).join('bob');
    b.say('/r anyone?');
    expect(b.notices().pop()).toBe('Nobody has whispered you yet.');
    a.say('/w bob hi');
    b.say('/r hi back');
    expect(a.chats().pop()).toMatchObject({ from: 'bob', text: 'hi back', ch: 'whisper' });
    room.leave(a.id);
    b.say('/r still there?');
    expect(b.notices().pop()).toBe('That player is no longer online.');
  });

  it('finds a whisper target whose name has a space in it, and refuses the ones that are not here', () => {
    const room = make();
    const a = new Client(room).join('ann');
    const b = new Client(room).join('big bob');
    a.say('/w big bob it works');
    expect(b.chats().pop()).toMatchObject({ text: 'it works', ch: 'whisper' });
    a.say('/w nobody hello');
    expect(a.notices().pop()).toContain('is online');
    a.say('/w ann me');
    expect(a.notices().pop()).toBe('You cannot whisper to yourself.');
  });

  it('has emotes', () => {
    const room = make();
    const a = new Client(room).join('ann');
    const b = new Client(room).join('bob');
    a.say('/me waves');
    expect(b.chats().pop()).toMatchObject({ from: 'ann', text: 'waves', ch: 'emote' });
  });
});

describe('ignoring', () => {
  it('hides everything somebody says, whispers included, without telling them', () => {
    const room = make();
    const a = new Client(room).join('ann');
    const b = new Client(room).join('bob');
    b.say('/ignore ann');
    expect(b.notices().pop()).toBe('You ignore ann.');
    a.say('can you hear me');
    a.say('/w bob please');
    expect(b.chats().filter((m) => m.from === 'ann')).toHaveLength(0);
    // ann is not told: her whisper looks sent, and bob cannot answer into the void either
    expect(a.chats().pop()).toMatchObject({ ch: 'whisper', to: 'bob' });
    b.say('/unignore ann');
    a.say('now?');
    expect(b.chats().pop()).toMatchObject({ from: 'ann', text: 'now?' });
  });

  it('lists the ignored, and ignoring a friend ends the friendship', () => {
    const room = make();
    const a = new Client(room).join('ann', 'acct-a');
    const b = new Client(room).join('bob', 'acct-b');
    a.say('/friend add bob');
    a.say('/ignore bob');
    expect(a.last('social')!.view.friends).toEqual([]);
    expect(a.last('social')!.view.ignored).toEqual(['bob']);
    a.say('/ignore');
    expect(a.notices().pop()).toBe('Ignored: bob');
    void b;
  });
});

describe('friends', () => {
  it('are kept with the account, and show online or not', () => {
    const store = new MemoryRoomStore();
    const room = make(store);
    const a = new Client(room).join('ann', 'acct-a');
    const b = new Client(room).join('bob', 'acct-b', 'warrior');
    a.say('/friend add bob');
    expect(a.notices().pop()).toBe('bob is now your friend.');
    let view = a.last('social')!.view;
    expect(view.friends).toEqual([{ name: 'bob', online: true, cls: 'warrior', level: expect.any(Number) }]);
    expect(view.online.map((o) => [o.name, o.friend, o.you])).toEqual([
      ['ann', false, true],
      ['bob', true, false],
    ]);
    room.leave(b.id);
    expect(a.notices().pop()).toBe('bob went offline.');
    a.say('/friend');
    expect(a.notices().pop()).toBe('Friends: bob (offline)');
    // a new visit finds the list again, and the friend coming back is announced
    room.leave(a.id);
    const a2 = new Client(room).join('ann', 'acct-a');
    const b2 = new Client(room).join('robert', 'acct-b');
    expect(a2.notices().pop()).toBe('robert is online.');
    a2.room.receive(a2.id, { t: 'social' });
    view = a2.last('social')!.view;
    expect(view.friends[0]).toMatchObject({ name: 'robert', online: true });
    void b2;
  });

  it('cannot be a guest, yourself, nobody, or the same player twice', () => {
    const room = make();
    const a = new Client(room).join('ann', 'acct-a');
    new Client(room).join('guest');
    new Client(room).join('bob', 'acct-b');
    tick(room, 45);
    a.say('/friend add guest');
    expect(a.notices().pop()).toContain('guest');
    tick(room, 45);
    a.say('/friend add ann');
    expect(a.notices().pop()).toBe('You cannot be your own friend.');
    tick(room, 45);
    a.say('/friend add ghost');
    expect(a.notices().pop()).toBe('ghost is not online.');
    tick(room, 45);
    a.say('/friend add bob');
    tick(room, 45);
    a.say('/friend add bob');
    expect(a.notices().pop()).toBe('bob is already your friend.');
    tick(room, 45);
    a.say('/friend remove bob');
    expect(a.notices().pop()).toBe('bob is no longer your friend.');
    tick(room, 45);
    a.say('/friend remove bob');
    expect(a.notices().pop()).toContain('not on your friends list');
  });

  it('are asked for and changed by the social window', () => {
    const room = make();
    const a = new Client(room).join('ann', 'acct-a');
    new Client(room).join('bob', 'acct-b');
    room.receive(a.id, { t: 'socialAct', a: 'friend', name: 'bob' });
    expect(a.last('social')!.view.friends.map((f) => f.name)).toEqual(['bob']);
    room.receive(a.id, { t: 'socialAct', a: 'unfriend', name: 'bob' });
    expect(a.last('social')!.view.friends).toEqual([]);
  });
});

describe('inspecting', () => {
  it('shows the class, the level and what is worn', () => {
    const room = make();
    const a = new Client(room).join('ann');
    const b = new Client(room).join('bob', null, 'warrior');
    const p = room.player(b.id)!;
    p.armor.set(1, makeStack(armorId(1, 'iron'), 1));
    room.receive(a.id, { t: 'inspect', name: 'bob' });
    const view = a.last('inspected')!.view!;
    expect(view).toMatchObject({ name: 'bob', cls: 'warrior' });
    expect(view.items).toHaveLength(6);
    expect(view.items[3]).toMatchObject({ id: armorId(1, 'iron') });
    // (The helmet is the Warrior's own, put on with the class.)
    expect(view.items[2]).toMatchObject({ id: outfitId('warrior', 0) });
    a.say('/inspect bob');
    expect(a.messages.filter((m) => m.t === 'inspected')).toHaveLength(2);
  });

  it('says so when the player is not here', () => {
    const room = make();
    const a = new Client(room).join('ann');
    room.receive(a.id, { t: 'inspect', name: 'ghost' });
    expect(a.last('inspected')).toEqual({ t: 'inspected', name: 'ghost', view: null });
  });
});

describe('limits', () => {
  it('lets the window be polled only so fast', () => {
    const room = make();
    const a = new Client(room).join('ann');
    for (let i = 0; i < 40; i++) room.receive(a.id, { t: 'social' });
    expect(a.messages.filter((m) => m.t === 'social').length).toBeLessThanOrEqual(8);
    tick(room, 60);
    const before = a.messages.filter((m) => m.t === 'social').length;
    room.receive(a.id, { t: 'social' });
    expect(a.messages.filter((m) => m.t === 'social').length).toBe(before + 1);
  });

  it('only takes well-formed social messages', () => {
    expect(parseNetClientMessage({ t: 'social' })).toEqual({ t: 'social' });
    expect(parseNetClientMessage({ t: 'socialAct', a: 'friend', name: ' bob ' })).toEqual({ t: 'socialAct', a: 'friend', name: 'bob' });
    expect(parseNetClientMessage({ t: 'socialAct', a: 'marry', name: 'bob' })).toBeNull();
    expect(parseNetClientMessage({ t: 'socialAct', a: 'friend', name: '<>' })).toBeNull();
    expect(parseNetClientMessage({ t: 'inspect', name: 'bob' })).toEqual({ t: 'inspect', name: 'bob' });
    expect(parseNetClientMessage({ t: 'inspect', name: 5 })).toBeNull();
  });
});
