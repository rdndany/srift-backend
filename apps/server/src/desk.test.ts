import { describe, expect, it } from 'vitest';
import { ADVENTURE_SEED, COMPANIONS, COMPANION_LOOT_BONUS, DAY_MS, EXPEDITIONS, I, WINGS, WINGS_TIME_BONUS, allItems, companionItemId, dailyCoins, makeGenerator, makeStack, mulberry32, tripResult, wingItemId, type AdventureWorldGenerator, type DeskView, type NetServerMessage } from '@solrift/shared';
import { Desk, parseAct } from './desk';
import type { Account } from './db';
import { GameRoom } from './room';
import { MemoryRoomStore } from './roomStore';

makeGenerator(ADVENTURE_SEED, 'adventure') as AdventureWorldGenerator;

const open = (store: MemoryRoomStore) => new GameRoom({ seed: 1, kind: 'adventure', naturalSpawning: false, rand: mulberry32(3), store });

const account = (id: string, wallet = 'wallet-one', name = id): Account => ({ id, wallet, displayName: name, look: null, class: 'warrior', createdAt: 0, lastLoginAt: 0 });

/** Play a hero for a moment (so that it has a saved record), give it things, and send it away again. */
function made(room: GameRoom, a: Account, setup: (p: NonNullable<ReturnType<GameRoom['player']>>) => void = () => {}): void {
  const messages: NetServerMessage[] = [];
  const id = room.join({ send: (m) => messages.push(m), close: () => {} }, a.displayName, a.id, null, a.class, a.wallet);
  if (id === null) throw new Error('join refused');
  setup(room.player(id)!);
  room.leave(id);
}

const setup = () => {
  const store = new MemoryRoomStore();
  const room = open(store);
  let now = 10 * DAY_MS + 3_600_000;
  const desk = new Desk(room, store, () => now);
  return { store, room, desk, clock: { set: (t: number) => (now = t), get: () => now } };
};

const must = (v: DeskView | null): DeskView => {
  expect(v).not.toBeNull();
  return v!;
};

describe('the Camp: looking after a hero from the website', () => {
  it('shows a saved hero, and nothing for one that never played', () => {
    const { room, desk } = setup();
    const a = account('hero-a');
    expect(desk.view(a)).toBeNull();
    made(room, a, (p) => p.giveItem(I.BREAD, 5));
    const v = must(desk.view(a));
    expect(v.hero.name).toBe('hero-a');
    expect(v.inGame).toBe(false);
    expect(v.slots.length).toBeGreaterThanOrEqual(36);
    expect(v.slots.some((s) => s.item?.id === I.BREAD && s.item.count === 5)).toBe(true);
  });

  it('puts armor on and takes it off, and swaps and merges stacks', () => {
    const { room, desk } = setup();
    const a = account('hero-a');
    const helmet = allItems().find((i) => i.armor?.slotIndex === 0)!.id;
    made(room, a, (p) => {
      p.clearInventory();
      p.giveItem(helmet, 1);
      p.giveItem(I.BREAD, 10);
    });
    let v = must(desk.view(a));
    const at = v.slots.find((s) => s.item?.id === helmet)!;
    const r1 = desk.act(a, { a: 'equip', slot: at.slot });
    expect(r1.ok, JSON.stringify(r1)).toBe(true);
    v = must(r1.view);
    expect(v.worn.helmet?.id).toBe(helmet);
    expect(v.slots.some((s) => s.item?.id === helmet)).toBe(false);
    const r2 = desk.act(a, { a: 'unequip', where: 'helmet' });
    expect(r2.ok).toBe(true);
    v = must(r2.view);
    expect(v.worn.helmet).toBeNull();
    expect(v.slots.some((s) => s.item?.id === helmet)).toBe(true);
    // what is not wearable is refused, and nothing is lost
    const bread = v.slots.find((s) => s.item?.id === I.BREAD)!;
    const r3 = desk.act(a, { a: 'equip', slot: bread.slot });
    expect(r3.ok).toBe(false);
    expect(must(r3.view).slots.some((s) => s.item?.id === I.BREAD && s.item.count === 10)).toBe(true);
    // a swap moves a stack to an empty slot
    const empty = v.slots.find((s) => !s.item)!;
    const r4 = desk.act(a, { a: 'swap', from: bread.slot, to: empty.slot });
    expect(r4.ok).toBe(true);
    expect(must(r4.view).slots.find((s) => s.slot === empty.slot)?.item?.id).toBe(I.BREAD);
  });

  it('refuses to change a hero that is in the game', () => {
    const { room, desk } = setup();
    const a = account('hero-a');
    made(room, a, (p) => p.giveItem(I.BREAD, 5));
    const id = room.join({ send: () => {}, close: () => {} }, 'hero-a', a.id, null, 'warrior', a.wallet)!;
    expect(id).toBeTruthy();
    const r = desk.act(a, { a: 'swap', from: 0, to: 1 });
    expect(r.ok).toBe(false);
    expect(must(r.view).inGame).toBe(true);
    // another hero of the same wallet is also kept away from the wallet's Stash
    const b = account('hero-b', a.wallet);
    made(room, b);
    const stash = desk.act(b, { a: 'stash', c: { a: 'put', slot: 0, count: 1 } });
    expect(stash.ok).toBe(false);
    room.leave(id);
    expect(desk.act(a, { a: 'swap', from: 0, to: 1 }).ok).toBe(true);
  });

  it('moves items to and from the wallet Stash, shared by its heroes', () => {
    const { room, desk } = setup();
    const a = account('hero-a');
    const b = account('hero-b', a.wallet);
    made(room, a, (p) => {
      p.clearInventory();
      p.giveItem(I.BREAD, 20);
    });
    made(room, b);
    const slot = must(desk.view(a)).slots.find((s) => s.item?.id === I.BREAD)!.slot;
    const put = desk.act(a, { a: 'stash', c: { a: 'put', slot, count: 8 } });
    expect(put.ok, JSON.stringify(put)).toBe(true);
    expect(must(put.view).slots.find((s) => s.slot === slot)?.item?.count).toBe(12);
    expect(must(put.view).stash.slots.find((s) => s?.id === I.BREAD)?.count).toBe(8);
    // the other hero of the wallet takes it out
    const at = must(desk.view(b)).stash.slots.findIndex((s) => s?.id === I.BREAD);
    const take = desk.act(b, { a: 'stash', c: { a: 'take', slot: at, count: 8 } });
    expect(take.ok, JSON.stringify(take)).toBe(true);
    expect(must(take.view).slots.some((s) => s.item?.id === I.BREAD && s.item.count === 8)).toBe(true);
    // numbers that make no sense are refused
    expect(desk.act(a, { a: 'stash', c: { a: 'put', slot: -1, count: 1 } }).ok).toBe(false);
    expect(desk.act(a, { a: 'stash', c: { a: 'put', slot: 1, count: 1000 } }).ok).toBe(false);
  });

  it('trades at the Auction House: post, buy out, collect the mail', () => {
    const { room, desk } = setup();
    const seller = account('seller', 'wallet-s');
    const buyer = account('buyer', 'wallet-b');
    made(room, seller, (p) => {
      p.clearInventory();
      p.giveItem(I.IRON_INGOT, 10);
      p.addCoins(500);
    });
    made(room, buyer, (p) => p.addCoins(1000));
    const slot = must(desk.view(seller)).slots.find((s) => s.item?.id === I.IRON_INGOT)!.slot;
    const post = desk.act(seller, { a: 'auction', c: { a: 'post', slot, count: 10, bid: 100, buyout: 200, hours: 24 } });
    expect(post.ok, JSON.stringify(post)).toBe(true);
    const mine = must(post.view).auctions.mine;
    expect(mine).toHaveLength(1);
    expect(must(post.view).hero.coins).toBeLessThan(500); // the deposit
    expect(must(post.view).slots.some((s) => s.item?.id === I.IRON_INGOT)).toBe(false);

    const buy = desk.act(buyer, { a: 'auction', c: { a: 'buyout', id: mine[0].id } });
    expect(buy.ok, JSON.stringify(buy)).toBe(true);
    expect(must(buy.view).hero.coins).toBe(800);
    const won = desk.act(buyer, { a: 'auction', c: { a: 'take', id: 0 } });
    expect(won.ok).toBe(true);
    expect(must(won.view).slots.some((s) => s.item?.id === I.IRON_INGOT && s.item.count === 10)).toBe(true);

    const paid = desk.act(seller, { a: 'auction', c: { a: 'take', id: 0 } });
    expect(paid.ok).toBe(true);
    expect(must(paid.view).hero.coins).toBeGreaterThan(500 - 50); // the sale, less the house's cut, plus what is left of the coins
    // you cannot buy your own, bid beyond your purse, or search from here
    expect(desk.act(buyer, { a: 'auction', c: { a: 'bid', id: 999, amount: 5 } }).ok).toBe(false);
    expect(desk.act(buyer, { a: 'auction', c: { a: 'search', q: '', cat: 'all', sort: 'ending', desc: false, page: 0 } }).ok).toBe(false);
    // $SOLRIFT auctions need the game
    expect(desk.act(seller, { a: 'auction', c: { a: 'post', slot: 0, count: 1, bid: 1, buyout: 0, hours: 12, token: true } }).ok).toBe(false);
  });

  it('keeps what it does with the hero across a restart', () => {
    const { store, room, desk } = setup();
    const a = account('hero-a');
    made(room, a, (p) => {
      p.clearInventory();
      p.giveItem(I.BREAD, 3);
    });
    const slot = must(desk.view(a)).slots.find((s) => s.item?.id === I.BREAD)!.slot;
    expect(desk.act(a, { a: 'stash', c: { a: 'put', slot, count: 3 } }).ok).toBe(true);
    const again = open(store);
    const desk2 = new Desk(again, store);
    const v = must(desk2.view(a));
    expect(v.slots.some((s) => s.item?.id === I.BREAD)).toBe(false);
    expect(v.stash.slots.some((s) => s?.id === I.BREAD && s.count === 3)).toBe(true);
  });
});

describe('the daily check-in', () => {
  it('pays once a day, more for every day in a row, and starts over after a missed one', () => {
    const { room, desk, clock } = setup();
    const a = account('hero-a');
    made(room, a, (p) => p.addCoins(10));
    const day0 = clock.get();
    expect(must(desk.view(a)).camp.daily.can).toBe(true);
    const first = desk.act(a, { a: 'daily' });
    expect(first.ok, JSON.stringify(first)).toBe(true);
    expect(must(first.view).hero.coins).toBe(10 + dailyCoins(1));
    expect(must(first.view).camp.daily.can).toBe(false);
    expect(desk.act(a, { a: 'daily' }).ok).toBe(false); // the same day
    clock.set(day0 + DAY_MS);
    const second = desk.act(a, { a: 'daily' });
    expect(must(second.view).hero.coins).toBe(10 + dailyCoins(1) + dailyCoins(2));
    expect(must(second.view).camp.daily.streak).toBe(2);
    clock.set(day0 + 4 * DAY_MS); // two days missed
    expect(must(desk.view(a)).camp.daily.coins).toBe(dailyCoins(1));
    const third = desk.act(a, { a: 'daily' });
    expect(must(third.view).camp.daily.streak).toBe(1);
  });

  it('is shared by the heroes of a wallet: one check-in a day per wallet', () => {
    const { room, desk } = setup();
    const a = account('hero-a');
    const b = account('hero-b', a.wallet);
    made(room, a);
    made(room, b);
    expect(desk.act(a, { a: 'daily' }).ok).toBe(true);
    expect(desk.act(b, { a: 'daily' }).ok).toBe(false);
  });

  it('gives a gift on the seventh day, and waits for room in the bags', () => {
    const { room, desk, clock } = setup();
    const a = account('hero-a');
    made(room, a);
    const day0 = clock.get();
    for (let d = 0; d < 6; d++) {
      clock.set(day0 + d * DAY_MS);
      expect(desk.act(a, { a: 'daily' }).ok).toBe(true);
    }
    clock.set(day0 + 6 * DAY_MS);
    const seventh = desk.act(a, { a: 'daily' });
    expect(seventh.ok).toBe(true);
    expect(must(seventh.view).slots.some((s) => s.item?.id === I.GOLD_INGOT && s.item.count === 3)).toBe(true);
  });
});

describe('expeditions', () => {
  it('sends the hero out, keeps the result fixed, and pays it out when it is back', () => {
    const { room, desk, clock } = setup();
    const a = account('hero-a');
    made(room, a, (p) => p.clearInventory());
    const def = EXPEDITIONS[0];
    // a hero of level 1 cannot go where a higher level is asked
    expect(desk.act(a, { a: 'trip', op: 'start', id: 'deep' }).ok).toBe(false);
    expect(desk.act(a, { a: 'trip', op: 'start', id: 'nowhere' }).ok).toBe(false);
    const start = desk.act(a, { a: 'trip', op: 'start', id: def.id });
    expect(start.ok, JSON.stringify(start)).toBe(true);
    const trip = must(start.view).camp.trip!;
    expect(trip.done).toBe(false);
    expect(trip.result).toBeNull(); // not told before it is back
    expect(desk.act(a, { a: 'trip', op: 'start', id: def.id }).ok).toBe(false); // already out
    expect(desk.act(a, { a: 'trip', op: 'claim' }).ok).toBe(false); // not back yet
    clock.set(trip.end + 1);
    const back = must(desk.view(a)).camp.trip!;
    expect(back.done).toBe(true);
    expect(back.result!.coins).toBeGreaterThanOrEqual(def.coins[0]);
    const before = must(desk.view(a)).hero.coins;
    const claim = desk.act(a, { a: 'trip', op: 'claim' });
    expect(claim.ok, JSON.stringify(claim)).toBe(true);
    const v = must(claim.view);
    expect(v.hero.coins).toBe(before + back.result!.coins);
    for (const i of back.result!.items) expect(v.slots.filter((s) => s.item?.id === i.id).reduce((n, s) => n + s.item!.count, 0)).toBe(i.count);
    expect(v.camp.trip).toBeNull();
    expect(desk.act(a, { a: 'trip', op: 'claim' }).ok).toBe(false); // only once
  });

  it('is not paid when the bags are too full, and can be collected later', () => {
    const { room, desk, clock } = setup();
    const a = account('hero-a');
    made(room, a, (p) => {
      p.clearInventory();
      for (let i = 0; i < p.inventory.size; i++) if (p.inventory.isUsable(i)) p.inventory.set(i, makeStack(I.STICK, 64));
    });
    const start = desk.act(a, { a: 'trip', op: 'start', id: EXPEDITIONS[0].id });
    clock.set(must(start.view).camp.trip!.end + 1);
    const coins = must(desk.view(a)).hero.coins;
    const refused = desk.act(a, { a: 'trip', op: 'claim' });
    expect(refused.ok).toBe(false);
    expect(must(refused.view).hero.coins).toBe(coins);
    expect(must(refused.view).camp.trip).not.toBeNull();
  });

  it('is shorter with wings and richer with a companion', () => {
    const base = EXPEDITIONS[0];
    const { room, desk } = setup();
    const plain = account('hero-a', 'wallet-one');
    made(room, plain);
    const t1 = must(desk.act(plain, { a: 'trip', op: 'start', id: base.id }).view).camp.trip!;
    expect(t1.end - t1.start).toBe(base.minutes * 60_000);
    expect(t1.pet).toBe(false);

    const helped = account('hero-b', 'wallet-two');
    made(room, helped, (p) => {
      p.clearInventory();
      p.giveItem(wingItemId(WINGS[0].id), 1);
      p.giveItem(companionItemId(COMPANIONS[0].id), 1);
    });
    for (const id of [wingItemId(WINGS[0].id), companionItemId(COMPANIONS[0].id)]) {
      const slot = must(desk.view(helped)).slots.find((s) => s.item?.id === id)!.slot;
      expect(desk.act(helped, { a: 'equip', slot }).ok).toBe(true);
    }
    const v = must(desk.view(helped));
    expect(v.worn.wings).not.toBeNull();
    expect(v.worn.companion).not.toBeNull();
    const t2 = must(desk.act(helped, { a: 'trip', op: 'start', id: base.id }).view).camp.trip!;
    expect(t2.end - t2.start).toBe(Math.round(base.minutes * 60_000 * (1 - WINGS_TIME_BONUS)));
    expect(t2.pet).toBe(true);
    // the same dice with and without the companion: it finds at least as much
    const trip = { id: base.id, start: 0, end: 1, seed: 1234, pet: false };
    expect(tripResult(base, { ...trip, pet: true }).coins).toBeGreaterThanOrEqual(tripResult(base, trip).coins);
    expect(COMPANION_LOOT_BONUS).toBeGreaterThan(0);
  });
});

describe('the guild card', () => {
  it('shows the roster with who is in the realm, and nothing for a hero with no guild', () => {
    const { room, desk } = setup();
    const a = account('hero-a');
    const b = account('hero-b', 'wallet-two');
    made(room, a);
    made(room, b);
    expect(must(desk.view(a)).guild).toBeNull();
    const g = room.guilds.create('Night Watch', 'NW', { key: a.id, name: a.displayName });
    room.guilds.join(g, { key: b.id, name: b.displayName });
    let card = must(desk.view(a)).guild!;
    expect(card.name).toBe('Night Watch');
    expect(card.tag).toBe('NW');
    expect(card.you).toBe(0);
    expect(card.members.map((m) => m.name)).toEqual(['hero-a', 'hero-b']);
    expect(card.members.every((m) => !m.online)).toBe(true);
    const id = room.join({ send: () => {}, close: () => {} }, 'hero-b', b.id, null, 'warrior', b.wallet)!;
    expect(id).toBeTruthy();
    card = must(desk.view(a)).guild!;
    expect(card.members.find((m) => m.name === 'hero-b')?.online).toBe(true);
    expect(must(desk.view(b)).guild?.you).toBe(2);
  });
});

describe('the website chat', () => {
  it('sends a line to the game and remembers it, at a polite pace', () => {
    const { room } = setup();
    const seen: NetServerMessage[] = [];
    const id = room.join({ send: (m) => seen.push(m), close: () => {} }, 'gamer', 'gamer-id', null, 'mage', 'wallet-g')!;
    expect(id).toBeTruthy();
    const head = room.chatHead;
    expect(room.webSay('web-id', 'wallet-w', 'Phone', 'hello from the bus')).toBeNull();
    expect(seen.some((m) => m.t === 'chat' && m.from === 'Phone' && m.text === 'hello from the bus')).toBe(true);
    expect(room.chatSince(head).map((l) => `${l.from}: ${l.text}`)).toContain('Phone: hello from the bus');
    expect(room.webSay('web-id', 'wallet-w', 'Phone', 'again')).toMatch(/slow down/i);
    expect(room.webSay('other-id', 'wallet-o', 'Other', '/gamemode creative')).toMatch(/commands/i);
    expect(room.webSay('third-id', 'wallet-t', 'Third', '   ')).not.toBeNull();
    expect(room.onlineNames()).toContain('gamer');
  });

  it('logs what is said in the game', () => {
    const { room } = setup();
    const id = room.join({ send: () => {}, close: () => {} }, 'gamer', 'gamer-id', null, 'mage', 'wallet-g')!;
    const head = room.chatHead;
    room.receive(id, { t: 'chat', text: 'to everyone' });
    expect(room.chatSince(head).some((l) => l.from === 'gamer' && l.text === 'to everyone')).toBe(true);
  });
});

describe('what the Camp accepts', () => {
  it('reads only the acts it knows, with sane numbers', () => {
    expect(parseAct({ a: 'equip', slot: 3 })).toEqual({ a: 'equip', slot: 3 });
    expect(parseAct({ a: 'equip', slot: -1 })).toBeNull();
    expect(parseAct({ a: 'equip', slot: 1.5 })).toBeNull();
    expect(parseAct({ a: 'unequip', where: 'helmet' })).toEqual({ a: 'unequip', where: 'helmet' });
    expect(parseAct({ a: 'unequip', where: 'soul' })).toBeNull();
    expect(parseAct({ a: 'swap', from: 1, to: 2 })).toEqual({ a: 'swap', from: 1, to: 2 });
    expect(parseAct({ a: 'trip', op: 'claim' })).toEqual({ a: 'trip', op: 'claim' });
    expect(parseAct({ a: 'trip', op: 'start' })).toBeNull();
    expect(parseAct({ a: 'launch-missiles' })).toBeNull();
    expect(parseAct(null)).toBeNull();
    expect(parseAct('equip')).toBeNull();
  });
});
