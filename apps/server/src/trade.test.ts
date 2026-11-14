import { describe, expect, it } from 'vitest';
import { I, TRADE_ASK_SECONDS, TRADE_LEAVE, mulberry32, parseNetClientMessage, type NetServerMessage, type TradeAct, type TradeView } from '@solrift/shared';
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
  get player() {
    return this.room.player(this.id)!;
  }
  /** One click at the trade table, with time for the rate limit between. */
  act(a: TradeAct): void {
    for (let i = 0; i < 4; i++) this.room.tick();
    this.room.receive(this.id, { t: 'trade', act: a });
  }
  notices(): string[] {
    return this.messages.flatMap((m) => (m.t === 'notice' ? [m.text] : []));
  }
  /** The table as it was last sent (null when it is closed). */
  table(): TradeView | null {
    const last = this.messages.filter((m) => m.t === 'trade').pop() as Extract<NetServerMessage, { t: 'trade' }> | undefined;
    return last?.view ?? null;
  }
  asks(): (string | null)[] {
    return this.messages.flatMap((m) => (m.t === 'tradeAsk' ? [m.from] : []));
  }
  /** The slot of the inventory that holds this item. */
  slotOf(id: number): number {
    for (let i = 0; i < this.player.inventory.size; i++) if (this.player.inventory.get(i)?.id === id) return i;
    return -1;
  }
}

const make = () => new GameRoom({ seed: 7, naturalSpawning: false, rand: mulberry32(1), store: new MemoryRoomStore() });

/** ann and bob, side by side; ann has 5 diamonds and 50 coins, bob 20 coal and 10 coins. */
function pair() {
  const room = make();
  const ann = new Client(room).join('ann', 'acct-ann');
  const bob = new Client(room).join('bob', 'acct-bob');
  ann.player.clearInventory();
  bob.player.clearInventory();
  ann.player.giveItem(I.DIAMOND, 5);
  ann.player.addCoins(50);
  bob.player.giveItem(I.COAL, 20);
  bob.player.addCoins(10);
  bob.player.teleport(ann.player.body.x + 1, ann.player.body.y, ann.player.body.z);
  return { room, ann, bob };
}

/** ann asked, bob accepted: the table is open. */
function trading() {
  const t = pair();
  t.ann.act({ a: 'ask', name: 'bob' });
  t.bob.act({ a: 'accept' });
  return t;
}

const count = (c: Client, id: number): number => c.player.inventory.countOf(id);

describe('asking to trade', () => {
  it('shows the request to the other player, and opens a table when they accept', () => {
    const { ann, bob } = pair();
    ann.act({ a: 'ask', name: 'bob' });
    expect(bob.asks().pop()).toBe('ann');
    expect(ann.notices().pop()).toBe('Asked bob to trade.');
    expect(ann.table()).toBeNull();
    bob.act({ a: 'accept' });
    expect(bob.asks().pop()).toBeNull();
    expect(ann.table()).toMatchObject({ with: 'bob', mine: { offers: [], coins: 0, ready: false } });
    expect(bob.table()).toMatchObject({ with: 'ann' });
  });

  it('is turned down, or lapses, without a table', () => {
    const { room, ann, bob } = pair();
    ann.act({ a: 'ask', name: 'bob' });
    bob.act({ a: 'decline' });
    expect(ann.notices().pop()).toBe('bob turned down the trade.');
    expect(bob.table()).toBeNull();
    ann.act({ a: 'ask', name: 'bob' });
    for (let i = 0; i < (TRADE_ASK_SECONDS + 1) * room.tickHz; i++) room.tick();
    expect(bob.asks().pop()).toBeNull();
    bob.act({ a: 'accept' });
    expect(bob.notices().pop()).toBe('Nobody is asking you to trade.');
  });

  it('starts at once when both ask each other', () => {
    const { ann, bob } = pair();
    ann.act({ a: 'ask', name: 'bob' });
    bob.act({ a: 'ask', name: 'ann' });
    expect(ann.table()?.with).toBe('bob');
    expect(bob.table()?.with).toBe('ann');
  });

  it('is refused for yourself, somebody far away, somebody busy, and in creative mode', () => {
    const { room, ann, bob } = pair();
    ann.act({ a: 'ask', name: 'ann' });
    expect(ann.notices().pop()).toBe('You cannot trade with yourself.');
    ann.act({ a: 'ask', name: 'nobody' });
    expect(ann.notices().pop()).toBe('nobody is not online.');
    const cy = new Client(room).join('cy', 'acct-cy');
    cy.player.teleport(ann.player.body.x + 200, ann.player.body.y, ann.player.body.z);
    ann.act({ a: 'ask', name: 'cy' });
    expect(ann.notices().pop()).toBe('You are too far apart to trade.');
    ann.act({ a: 'ask', name: 'bob' });
    bob.act({ a: 'accept' });
    cy.player.teleport(ann.player.body.x + 1, ann.player.body.y, ann.player.body.z);
    cy.act({ a: 'ask', name: 'ann' });
    expect(cy.notices().pop()).toBe('ann is busy trading.');
  });

  it('does not tell somebody who ignores you', () => {
    const { ann, bob } = pair();
    bob.room.receive(bob.id, { t: 'socialAct', a: 'ignore', name: 'ann' });
    ann.act({ a: 'ask', name: 'bob' });
    expect(ann.notices().pop()).toBe('Asked bob to trade.');
    expect(bob.asks()).toEqual([]);
  });

  it('understands /trade', () => {
    const { room, ann, bob } = pair();
    for (let i = 0; i < 45; i++) room.tick();
    room.receive(ann.id, { t: 'chat', text: '/trade bob' });
    expect(bob.asks().pop()).toBe('ann');
    for (let i = 0; i < 45; i++) room.tick();
    room.receive(bob.id, { t: 'chat', text: '/trade accept' });
    expect(ann.table()?.with).toBe('bob');
  });
});

describe('the table', () => {
  it('shows what each side puts on it, and takes it back off', () => {
    const { ann, bob } = trading();
    ann.act({ a: 'put', slot: ann.slotOf(I.DIAMOND) });
    expect(ann.table()!.mine.offers).toMatchObject([{ item: { id: I.DIAMOND, count: 5 } }]);
    expect(bob.table()!.theirs.offers).toMatchObject([{ item: { id: I.DIAMOND, count: 5 } }]);
    ann.act({ a: 'put', slot: ann.slotOf(I.DIAMOND), count: 2 });
    expect(bob.table()!.theirs.offers).toMatchObject([{ item: { count: 2 } }]);
    ann.act({ a: 'take', i: 0 });
    expect(bob.table()!.theirs.offers).toEqual([]);
    // The goods stayed in the bags all along.
    expect(count(ann, I.DIAMOND)).toBe(5);
  });

  it('holds only what you carry: coins are capped, empty slots refused', () => {
    const { ann } = trading();
    ann.act({ a: 'coins', n: 5000 });
    expect(ann.table()!.mine.coins).toBe(50);
    ann.act({ a: 'put', slot: 30 });
    expect(ann.notices().pop()).toBe('There is nothing there.');
  });

  it('refuses what cannot be dropped, like the emberstone', () => {
    const { ann } = trading();
    ann.player.inventory.set(0, { id: I.EMBERSTONE, count: 1, damage: 0 });
    ann.act({ a: 'put', slot: 0 });
    expect(ann.notices().pop()).toBe('That cannot be traded.');
    expect(ann.table()!.mine.offers).toEqual([]);
  });

  it('has room for six items from you', () => {
    const { ann } = trading();
    ann.player.clearInventory();
    for (let k = 0; k < 7; k++) ann.player.inventory.set(k, { id: I.DIAMOND + (k % 2), count: 1, damage: 0, name: `n${k}` });
    for (let k = 0; k < 7; k++) ann.act({ a: 'put', slot: k });
    expect(ann.table()!.mine.offers).toHaveLength(6);
    expect(ann.notices().pop()).toContain('room for only 6');
  });

  it('takes back both acceptances whenever the table changes', () => {
    const { ann, bob } = trading();
    ann.act({ a: 'put', slot: ann.slotOf(I.DIAMOND) });
    ann.act({ a: 'ready', on: true });
    expect(bob.table()!.theirs.ready).toBe(true);
    bob.act({ a: 'coins', n: 3 });
    expect(bob.table()!.theirs.ready).toBe(false);
    expect(ann.table()!.mine.ready).toBe(false);
  });

  it('will not be accepted empty', () => {
    const { ann } = trading();
    ann.act({ a: 'ready', on: true });
    expect(ann.table()!.mine.ready).toBe(false);
    expect(ann.notices().pop()).toBe('There is nothing on the table.');
  });
});

describe('settling', () => {
  it('swaps goods and coins when both accept', () => {
    const { ann, bob } = trading();
    ann.act({ a: 'put', slot: ann.slotOf(I.DIAMOND), count: 3 });
    ann.act({ a: 'coins', n: 20 });
    bob.act({ a: 'put', slot: bob.slotOf(I.COAL) });
    ann.act({ a: 'ready', on: true });
    expect(ann.table()).not.toBeNull();
    bob.act({ a: 'ready', on: true });
    expect(ann.table()).toBeNull();
    expect(bob.table()).toBeNull();
    expect(ann.notices().pop()).toBe('The trade is complete.');
    expect([count(ann, I.DIAMOND), count(ann, I.COAL), ann.player.coins]).toEqual([2, 20, 30]);
    expect([count(bob, I.DIAMOND), count(bob, I.COAL), bob.player.coins]).toEqual([3, 0, 30]);
  });

  it('keeps every item: nothing is made or lost', () => {
    const { ann, bob } = trading();
    ann.act({ a: 'put', slot: ann.slotOf(I.DIAMOND) });
    bob.act({ a: 'put', slot: bob.slotOf(I.COAL), count: 7 });
    ann.act({ a: 'ready', on: true });
    bob.act({ a: 'ready', on: true });
    expect(count(ann, I.DIAMOND) + count(bob, I.DIAMOND)).toBe(5);
    expect(count(ann, I.COAL) + count(bob, I.COAL)).toBe(20);
    expect(ann.player.coins + bob.player.coins).toBe(60);
  });

  it('keeps what makes an item itself: enchantments, names and gear come across', () => {
    const { ann, bob } = trading();
    ann.player.clearInventory();
    ann.player.inventory.set(0, { id: I.DIAMOND, count: 1, damage: 0, name: 'Dawn', rc: 1 });
    ann.act({ a: 'put', slot: 0 });
    ann.act({ a: 'ready', on: true });
    bob.act({ a: 'ready', on: true });
    const got = bob.player.inventory.slots.find((s) => s?.id === I.DIAMOND);
    expect(got).toMatchObject({ name: 'Dawn', rc: 1 });
  });

  it('is called off whole when the receiver has no room, and both bags stay as they were', () => {
    const { ann, bob } = trading();
    // bob's bags are full of things that do not stack.
    bob.player.clearInventory();
    for (let i = 0; i < bob.player.inventory.size; i++) if (bob.player.inventory.isUsable(i)) bob.player.inventory.set(i, { id: I.STICK, count: 1, damage: 1 + (i % 50), name: `junk${i}` });
    ann.act({ a: 'put', slot: ann.slotOf(I.DIAMOND) });
    ann.act({ a: 'coins', n: 10 });
    ann.act({ a: 'ready', on: true });
    bob.act({ a: 'ready', on: true });
    expect(ann.notices().pop()).toBe('bob does not have the room in their bags.');
    expect(ann.table()).not.toBeNull();
    expect(ann.table()!.mine.ready).toBe(false);
    expect([count(ann, I.DIAMOND), ann.player.coins, bob.player.coins]).toEqual([5, 50, 10]);
    expect(count(bob, I.STICK)).toBe(bob.player.inventory.slots.filter(Boolean).length);
  });

  it('lets the freed room be used: swapping two full bags works', () => {
    const { ann, bob } = trading();
    for (const c of [ann, bob]) {
      c.player.clearInventory();
      for (let i = 0; i < c.player.inventory.size; i++) if (c.player.inventory.isUsable(i)) c.player.inventory.set(i, { id: I.STICK, count: 1, damage: 1 + (i % 50), name: `${c.player.name}${i}` });
    }
    ann.act({ a: 'put', slot: 0 });
    bob.act({ a: 'put', slot: 0 });
    ann.act({ a: 'ready', on: true });
    bob.act({ a: 'ready', on: true });
    expect(ann.table()).toBeNull();
    expect(ann.player.inventory.get(0)?.name).toBe('bob0'); // it took the place that was freed
    expect(ann.player.inventory.slots.some((s) => s?.name === 'bob0')).toBe(true);
  });

  it('drops an offer whose item is no longer there, and cancels the acceptance', () => {
    const { room, ann, bob } = trading();
    ann.act({ a: 'put', slot: ann.slotOf(I.DIAMOND) });
    bob.act({ a: 'ready', on: true });
    ann.player.clearInventory();
    room.tick();
    expect(bob.table()!.theirs.offers).toEqual([]);
    expect(bob.table()!.mine.ready).toBe(false);
  });

  it('cannot be done with more coins than you carry, even if you spend them after offering', () => {
    const { ann, bob } = trading();
    ann.act({ a: 'coins', n: 50 });
    ann.player.spendCoins(40);
    bob.act({ a: 'put', slot: bob.slotOf(I.COAL) });
    ann.room.tick();
    expect(ann.table()!.mine.coins).toBe(10);
    ann.act({ a: 'ready', on: true });
    bob.act({ a: 'ready', on: true });
    expect([ann.player.coins, bob.player.coins]).toEqual([0, 20]);
  });
});

describe('calling it off', () => {
  it('cancel closes the table for both, with their goods untouched', () => {
    const { ann, bob } = trading();
    ann.act({ a: 'put', slot: ann.slotOf(I.DIAMOND) });
    bob.act({ a: 'cancel' });
    expect(ann.table()).toBeNull();
    expect(bob.table()).toBeNull();
    expect(ann.notices().pop()).toBe('bob called off the trade.');
    expect(count(ann, I.DIAMOND)).toBe(5);
  });

  it('happens when one leaves, or when they walk too far apart', () => {
    const a = trading();
    a.room.receive(a.bob.id, { t: 'leave' });
    expect(a.ann.table()).toBeNull();
    expect(a.ann.notices()).toContain('bob left: the trade was called off.');
    const b = trading();
    b.bob.player.teleport(b.ann.player.body.x + TRADE_LEAVE + 4, b.ann.player.body.y, b.ann.player.body.z);
    b.room.tick();
    expect(b.ann.table()).toBeNull();
    expect(b.ann.notices().pop()).toContain('too far apart');
    // Once it is over the table can no longer be used.
    b.ann.act({ a: 'put', slot: 0 });
    expect(b.ann.notices().pop()).toBe('You are not trading.');
  });

  it('happens when somebody dies', () => {
    const { room, ann, bob } = trading();
    bob.player.vitals.dead = true;
    room.tick();
    expect(ann.table()).toBeNull();
  });
});

describe('abuse', () => {
  it('a flood of clicks is slowed and counts as misbehaviour', () => {
    const { room, ann } = trading();
    for (let i = 0; i < 200; i++) room.receive(ann.id, { t: 'trade', act: { a: 'coins', n: i % 50 } });
    const strikes = room.stats().strikes;
    expect(strikes).toBeGreaterThan(0);
  });

  it('parses only well-formed acts', () => {
    const ok = (act: unknown) => parseNetClientMessage({ t: 'trade', act });
    expect(ok({ a: 'ask', name: 'bob' })).toEqual({ t: 'trade', act: { a: 'ask', name: 'bob' } });
    expect(ok({ a: 'put', slot: 3 })).toEqual({ t: 'trade', act: { a: 'put', slot: 3 } });
    expect(ok({ a: 'put', slot: 3, count: 2 })).toEqual({ t: 'trade', act: { a: 'put', slot: 3, count: 2 } });
    expect(ok({ a: 'ready', on: true })).toEqual({ t: 'trade', act: { a: 'ready', on: true } });
    for (const bad of [null, 5, {}, { a: 'steal' }, { a: 'put', slot: -1 }, { a: 'put', slot: 1.5 }, { a: 'put', slot: 1, count: 0 }, { a: 'put', slot: 1, count: 999 }, { a: 'coins', n: -3 }, { a: 'coins', n: 'x' }, { a: 'take', i: 99 }, { a: 'ready' }, { a: 'ask', name: 5 }]) {
      expect(ok(bad)).toBeNull();
    }
  });
});
