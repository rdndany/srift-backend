import { describe, expect, it } from 'vitest';
import {
  AUCTION_RULES,
  AuctionHouse,
  DEFAULT_AUCTION_QUERY,
  HOUSE_ACCOUNT,
  HOUSE_WALLET,
  I,
  MAX_COINS,
  categoryOf,
  cleanQuery,
  depositFor,
  houseCut,
  makeStack,
  mulberry32,
  nextBid,
  parseSessionMessage,
  timeLeftLabel,
} from './index';

const HOUR = 3_600_000;
const HOUSE_STOCK_TARGET = 16;

function make() {
  const clock = { t: 1_000_000 };
  const house = new AuctionHouse({ now: () => clock.t });
  const told: string[] = [];
  house.notify = (owner, text) => told.push(`${owner}: ${text}`);
  return { house, clock, told };
}

const put = (house: AuctionHouse, over: Partial<Parameters<AuctionHouse['post']>[0]> = {}) => {
  const res = house.post({ seller: 'ann', sellerName: 'Ann', item: makeStack(I.IRON_INGOT, 4), bid: 100, buyout: 300, hours: 12, deposit: 10, ...over });
  if (!res.ok) throw new Error(res.error);
  return res.auction;
};

describe('the money of the house', () => {
  it('keeps five in a hundred of a sale, whole coins only', () => {
    expect(houseCut(100)).toBe(5);
    expect(houseCut(19)).toBe(0);
    expect(houseCut(1_000_000)).toBe(50_000);
  });

  it('asks a deposit that grows with the worth of the stack and the days it is up, and at least a coin', () => {
    const iron = makeStack(I.IRON_INGOT, 10); // sells for 14 each at a merchant
    const d12 = depositFor(iron, 12);
    expect(d12).toBe(Math.ceil(140 * AUCTION_RULES.deposit));
    expect(depositFor(iron, 24)).toBe(d12 * 2);
    expect(depositFor(iron, 48)).toBeGreaterThan(depositFor(iron, 24));
    // what no merchant buys still costs a little to put up
    expect(depositFor(makeStack(I.BOW, 1), 12)).toBeGreaterThanOrEqual(1);
    expect(depositFor(makeStack(I.COAL, 1), 12)).toBe(1);
  });

  it('wants a new bid to beat the old one by five in a hundred, and a coin at the least', () => {
    expect(nextBid(100, 0)).toBe(100);
    expect(nextBid(100, 100)).toBe(105);
    expect(nextBid(1, 1)).toBe(2);
    expect(nextBid(100, 1000)).toBe(1050);
  });

  it('tells the time left in the four words of the old Auction House', () => {
    expect(timeLeftLabel(10 * 60)).toBe('Short');
    expect(timeLeftLabel(3600)).toBe('Medium');
    expect(timeLeftLabel(6 * 3600)).toBe('Long');
    expect(timeLeftLabel(30 * 3600)).toBe('Very Long');
  });
});

describe('putting an item up', () => {
  it('lists it, with an end of its own and a copy of the stack', () => {
    const { house, clock } = make();
    const item = makeStack(I.COAL, 12);
    const a = put(house, { item, hours: 24 });
    item.count = 1;
    expect(a.item.count).toBe(12);
    expect(a.end).toBe(clock.t + 24 * HOUR);
    expect(house.size).toBe(1);
  });

  it('refuses nonsense: no bid, a buyout under the bid, a made-up duration, what cannot be sold, too many at once', () => {
    const { house } = make();
    const post = (over: object) => house.post({ seller: 'ann', sellerName: 'Ann', item: makeStack(I.COAL, 1), bid: 5, buyout: 0, hours: 12, deposit: 1, ...over });
    expect(post({ bid: 0 }).ok).toBe(false);
    expect(post({ bid: 1.5 }).ok).toBe(false);
    expect(post({ bid: MAX_COINS + 1 }).ok).toBe(false);
    expect(post({ buyout: 4 }).ok).toBe(false);
    expect(post({ hours: 5 }).ok).toBe(false);
    expect(post({ item: makeStack(I.MAP, 1) }).ok).toBe(false);
    for (let i = 0; i < AUCTION_RULES.maxListings; i++) expect(post({}).ok).toBe(true);
    expect(post({}).ok).toBe(false);
    // the house itself is not held to the limit
    expect(post({ seller: HOUSE_ACCOUNT }).ok).toBe(true);
  });
});

describe('bidding', () => {
  it('takes the starting bid, then only bids that beat the last by five in a hundred, and sends the coins of the outbid back by mail', () => {
    const { house, told } = make();
    const a = put(house);
    expect(house.bid(a.id, 'bob', 'Bob', 99, 1000)).toMatchObject({ ok: false });
    expect(house.bid(a.id, 'bob', 'Bob', 100, 1000)).toEqual({ ok: true, pay: 100, bought: false, token: false });
    expect(house.bid(a.id, 'cat', 'Cat', 104, 1000)).toMatchObject({ ok: false });
    expect(house.bid(a.id, 'cat', 'Cat', 105, 1000)).toMatchObject({ ok: true, pay: 105 });
    expect(house.mailOf('bob').map((m) => [m.kind, m.coins])).toEqual([['outbid', 100]]);
    expect(told.some((t) => t.startsWith('bob:') && t.includes('outbid'))).toBe(true);
    expect(house.get(a.id)).toMatchObject({ top: 105, bidder: 'cat', bidderName: 'Cat' });
  });

  it('refuses a bid you cannot pay, one on your own auction, one over your own lead, and an auction that is over', () => {
    const { house, clock } = make();
    const a = put(house);
    expect(house.bid(a.id, 'bob', 'Bob', 100, 99)).toMatchObject({ ok: false, error: 'Not enough coins.' });
    expect(house.bid(a.id, 'ann', 'Ann', 100, 1000)).toMatchObject({ ok: false });
    expect(house.bid(a.id, null, 'guest', 100, 1000)).toMatchObject({ ok: false });
    house.bid(a.id, 'bob', 'Bob', 100, 1000);
    expect(house.bid(a.id, 'bob', 'Bob', 200, 1000)).toMatchObject({ ok: false });
    expect(house.bid(999, 'cat', 'Cat', 100, 1000)).toMatchObject({ ok: false });
    clock.t += 13 * HOUR;
    expect(house.bid(a.id, 'cat', 'Cat', 500, 1000)).toMatchObject({ ok: false });
  });

  it('ends at once on a buyout, and a bid at the buyout is a buyout', () => {
    const { house } = make();
    const a = put(house);
    house.bid(a.id, 'bob', 'Bob', 100, 1000);
    // the leading bidder pays only what is left of the buyout
    expect(house.buyout(a.id, 'bob', 'Bob', 200)).toEqual({ ok: true, pay: 200, bought: true, token: false });
    expect(house.get(a.id)).toBeNull();
    expect(house.mailOf('bob').map((m) => m.kind)).toEqual(['won']);
    expect(house.mailOf('bob')[0].item).toMatchObject({ id: I.IRON_INGOT, count: 4 });
    // sold for 300, the house keeps 15, the 10-coin deposit comes back
    expect(house.mailOf('ann').map((m) => [m.kind, m.coins])).toEqual([['sold', 300 - 15 + 10]]);

    const b = put(house);
    expect(house.bid(b.id, 'cat', 'Cat', 500, 1000)).toEqual({ ok: true, pay: 300, bought: true, token: false });
    const none = put(house, { buyout: 0 });
    expect(house.buyout(none.id, 'cat', 'Cat', 1000)).toMatchObject({ ok: false });
  });

  it('sends the coins of an outbid player back when somebody else buys it out', () => {
    const { house } = make();
    const a = put(house);
    house.bid(a.id, 'bob', 'Bob', 120, 1000);
    expect(house.buyout(a.id, 'cat', 'Cat', 1000)).toMatchObject({ ok: true, pay: 300 });
    expect(house.mailOf('bob').map((m) => [m.kind, m.coins])).toEqual([['outbid', 120]]);
  });
});

describe('the end of an auction', () => {
  it('sells to the highest bidder when the time is up', () => {
    const { house, clock, told } = make();
    const a = put(house, { buyout: 0 });
    house.bid(a.id, 'bob', 'Bob', 400, 1000);
    clock.t += 11 * HOUR;
    expect(house.update()).toBe(0);
    clock.t += 2 * HOUR;
    expect(house.update()).toBe(1);
    expect(house.size).toBe(0);
    expect(house.mailOf('ann').map((m) => [m.kind, m.coins])).toEqual([['sold', 400 - 20 + 10]]);
    expect(house.mailOf('bob').map((m) => m.kind)).toEqual(['won']);
    expect(told.length).toBe(2);
  });

  it('gives an item nobody bid on back to its owner, and keeps the deposit', () => {
    const { house, clock } = make();
    put(house);
    clock.t += 13 * HOUR;
    house.update();
    expect(house.mailOf('ann').map((m) => [m.kind, m.coins])).toEqual([['expired', 0]]);
    expect(house.mailOf('ann')[0].item).toMatchObject({ id: I.IRON_INGOT, count: 4 });
  });

  it('lets the seller take it down until somebody bids, and then not', () => {
    const { house } = make();
    const a = put(house);
    expect(house.cancel(a.id, 'bob')).toMatchObject({ ok: false });
    const b = put(house);
    house.bid(b.id, 'bob', 'Bob', 100, 1000);
    expect(house.cancel(b.id, 'ann')).toMatchObject({ ok: false });
    expect(house.cancel(a.id, 'ann')).toEqual({ ok: true });
    expect(house.mailOf('ann').map((m) => m.kind)).toEqual(['cancelled']);
    expect(house.size).toBe(1);
  });

  it('keeps no mail for the house itself', () => {
    const { house, clock } = make();
    put(house, { seller: HOUSE_ACCOUNT, sellerName: 'House' });
    clock.t += 13 * HOUR;
    house.update();
    expect(house.mailOf(HOUSE_ACCOUNT)).toEqual([]);
  });

  it('hands a letter over once', () => {
    const { house, clock } = make();
    put(house);
    clock.t += 13 * HOUR;
    house.update();
    const id = house.mailOf('ann')[0].id;
    expect(house.takeMail('bob', id)).toBeNull();
    expect(house.takeMail('ann', id)).not.toBeNull();
    expect(house.takeMail('ann', id)).toBeNull();
    expect(house.mailOf('ann')).toEqual([]);
  });
});

describe('looking through the house', () => {
  const stock = () => {
    const { house, clock } = make();
    put(house, { item: makeStack(I.DIAMOND, 1), bid: 900, buyout: 1500, hours: 48 });
    put(house, { item: makeStack(I.COAL, 20), bid: 30, buyout: 0, hours: 12 });
    put(house, { item: makeStack(I.BREAD, 5), bid: 20, buyout: 50, hours: 24 });
    put(house, { item: makeStack(I.IRON_INGOT, 2), bid: 10, buyout: 40, hours: 24, seller: 'bob', sellerName: 'Bob' });
    return { house, clock };
  };

  it('finds items by name and shelf', () => {
    const { house } = stock();
    expect(house.search({ ...DEFAULT_AUCTION_QUERY, q: 'dia' }, 'ann').rows.map((r) => r.name)).toEqual(['Diamond']);
    expect(house.search({ ...DEFAULT_AUCTION_QUERY, cat: 'food' }, 'ann').rows.map((r) => r.item.id)).toEqual([I.BREAD]);
    expect(house.search({ ...DEFAULT_AUCTION_QUERY, q: 'nothing like this' }, 'ann').total).toBe(0);
    expect(categoryOf(makeStack(I.DIAMOND))).toBe('other');
    expect(categoryOf(makeStack(I.JEWEL_DAWN))).toBe('jewel');
    expect(categoryOf(makeStack(I.BOW))).toBe('weapon');
  });

  it('sorts by the end, the bid, the buyout or the name, up or down', () => {
    const { house } = stock();
    const ids = (sort: 'ending' | 'bid' | 'buyout' | 'name', desc = false) => house.search({ ...DEFAULT_AUCTION_QUERY, sort, desc }, 'ann').rows.map((r) => r.item.id);
    expect(ids('ending')[0]).toBe(I.COAL);
    expect(ids('bid')).toEqual([I.IRON_INGOT, I.BREAD, I.COAL, I.DIAMOND]);
    expect(ids('bid', true)).toEqual([I.DIAMOND, I.COAL, I.BREAD, I.IRON_INGOT]);
    // with no buyout, last
    expect(ids('buyout')).toEqual([I.IRON_INGOT, I.BREAD, I.DIAMOND, I.COAL]);
    expect(ids('name')).toEqual([I.BREAD, I.COAL, I.DIAMOND, I.IRON_INGOT]);
  });

  it('pages the results and clamps a page that is past the end', () => {
    const { house } = make();
    for (let i = 0; i < 30; i++) put(house, { seller: i % 2 ? 'ann' : 'bob', item: makeStack(I.COAL, 1 + i) });
    const first = house.search(DEFAULT_AUCTION_QUERY, 'zed');
    expect(first.rows.length).toBe(AUCTION_RULES.pageSize);
    expect(first.total).toBe(30);
    expect(first.pages).toBe(3);
    expect(house.search({ ...DEFAULT_AUCTION_QUERY, page: 2 }, 'zed').rows.length).toBe(30 - 2 * AUCTION_RULES.pageSize);
    expect(house.search({ ...DEFAULT_AUCTION_QUERY, page: 99 }, 'zed').page).toBe(2);
  });

  it('tells each viewer which auctions are theirs, which they lead, and what they would pay', () => {
    const { house } = stock();
    const bob = house.view(DEFAULT_AUCTION_QUERY, 'bob');
    expect(bob.mine.map((r) => r.item.id)).toEqual([I.IRON_INGOT]);
    expect(bob.rows.filter((r) => r.yours).length).toBe(1);
    const diamond = house.search({ ...DEFAULT_AUCTION_QUERY, q: 'diamond' }, 'bob').rows[0];
    house.bid(diamond.id, 'bob', 'Bob', 900, 5000);
    const after = house.view(DEFAULT_AUCTION_QUERY, 'bob');
    expect(after.bids.map((r) => r.id)).toEqual([diamond.id]);
    expect(after.rows.find((r) => r.id === diamond.id)).toMatchObject({ leading: true, top: 900, next: 945, pay: 600 });
    const guest = house.view(DEFAULT_AUCTION_QUERY, null);
    expect(guest).toMatchObject({ member: false, mine: [], bids: [], mail: [] });
  });

  it('cleans what a client asks for', () => {
    expect(cleanQuery({ q: '  iron  ', cat: 'nope' as never, sort: 'weird' as never, page: -3 })).toEqual({ q: 'iron', cat: 'all', sort: 'ending', desc: false, page: 0 });
    expect(cleanQuery({ q: 'x'.repeat(500) }).q.length).toBe(40);
  });
});

describe('keeping the house between visits', () => {
  it('writes down and reads back every auction and every letter, with gear and enchantments intact', () => {
    const { house, clock } = make();
    const sword = makeStack(I.BOW, 1, 7, [[1, 3]]);
    sword.name = 'Dawnbringer';
    const a = put(house, { item: sword });
    house.bid(a.id, 'bob', 'Bob', 100, 1000);
    const b = put(house, { item: makeStack(I.COAL, 9), buyout: 0 });
    clock.t += 13 * HOUR;
    house.update(); // a sells, b comes back
    put(house, { item: makeStack(I.BREAD, 3) });
    const json = JSON.parse(JSON.stringify(house.toJSON()));
    const copy = new AuctionHouse({ now: () => clock.t });
    copy.load(json);
    expect(copy.toJSON()).toEqual(house.toJSON());
    expect(copy.mailOf('bob')[0].item).toMatchObject({ name: 'Dawnbringer', damage: 7, ench: [[1, 3]] });
    expect(copy.mailOf('ann').map((m) => m.kind).sort()).toEqual(['expired', 'sold']);
    expect(copy.size).toBe(1);
    // an id is never used twice
    const c = copy.post({ seller: 'ann', sellerName: 'Ann', item: makeStack(I.COAL, 1), bid: 1, buyout: 0, hours: 12, deposit: 1 });
    expect(c.ok && c.auction.id).toBeGreaterThan(Math.max(a.id, b.id));
  });

  it('shrugs at a damaged save', () => {
    const house = new AuctionHouse();
    for (const junk of [null, 5, 'x', [], { auctions: 'no', mail: 7 }, { auctions: [null, 3, { id: 'a' }, { id: 1, seller: 'ann', item: [99999, 1, 0] }], mail: { ann: [{ id: 1, kind: 'bogus', coins: 5 }, null] } }]) house.load(junk);
    expect(house.size).toBe(0);
    expect(house.mailOf('ann')).toEqual([]);
  });
});

describe("the house's own stock", () => {
  it('keeps about sixteen auctions on the shelves, at prices above what a merchant pays, and never mails itself', () => {
    const { house } = make();
    house.restock(mulberry32(4));
    expect(house.size).toBe(HOUSE_STOCK_TARGET);
    const rows = house.search({ ...DEFAULT_AUCTION_QUERY }, 'ann').rows;
    expect(rows.length).toBe(AUCTION_RULES.pageSize);
    for (const r of rows) {
      expect(r.seller).toBe('Dawnwatch Trading Co.');
      expect(r.buyout).toBeGreaterThanOrEqual(r.bid);
      expect(r.left).toBeGreaterThan(0);
    }
    house.restock(mulberry32(5));
    expect(house.size).toBe(HOUSE_STOCK_TARGET);
  });
});

describe('the auction commands of a session', () => {
  it('are read only when they are whole, in range and of a known kind', () => {
    expect(parseSessionMessage({ t: 'auction', a: 'search', q: 'iron', cat: 'all', sort: 'bid', desc: true, page: 2 })).toEqual({ t: 'auction', a: 'search', q: 'iron', cat: 'all', sort: 'bid', desc: true, page: 2 });
    expect(parseSessionMessage({ t: 'auction', a: 'search', q: 'iron', cat: 'bad', sort: 'bid', desc: true, page: 2 })).toBeNull();
    expect(parseSessionMessage({ t: 'auction', a: 'post', slot: 3, count: 5, bid: 10, buyout: 0, hours: 24 })).toEqual({ t: 'auction', a: 'post', slot: 3, count: 5, bid: 10, buyout: 0, hours: 24 });
    for (const bad of [{ hours: 7 }, { bid: 0 }, { bid: 1.5 }, { slot: -1 }, { count: 0 }, { buyout: -1 }, { bid: 1e12 }]) {
      expect(parseSessionMessage({ t: 'auction', a: 'post', slot: 3, count: 5, bid: 10, buyout: 0, hours: 24, ...bad })).toBeNull();
    }
    expect(parseSessionMessage({ t: 'auction', a: 'bid', id: 4, amount: 50 })).toEqual({ t: 'auction', a: 'bid', id: 4, amount: 50 });
    expect(parseSessionMessage({ t: 'auction', a: 'bid', id: 4, amount: NaN })).toBeNull();
    expect(parseSessionMessage({ t: 'auction', a: 'buyout', id: 4 })).toEqual({ t: 'auction', a: 'buyout', id: 4 });
    expect(parseSessionMessage({ t: 'auction', a: 'cancel', id: 0 })).toBeNull();
    expect(parseSessionMessage({ t: 'auction', a: 'take', id: 0 })).toEqual({ t: 'auction', a: 'take', id: 0 });
    expect(parseSessionMessage({ t: 'auction', a: 'sell everything' })).toBeNull();
  });

  it('say $SOLRIFT only with a plain yes', () => {
    const post = { t: 'auction', a: 'post', slot: 3, count: 5, bid: 10, buyout: 0, hours: 24 };
    expect(parseSessionMessage({ ...post, token: true })).toEqual({ ...post, token: true });
    expect(parseSessionMessage({ ...post, token: false })).toEqual(post);
    expect(parseSessionMessage({ ...post, token: 'yes' })).toBeNull();
    expect(parseSessionMessage({ ...post, token: 1 })).toBeNull();
  });
});

describe('an auction in $SOLRIFT', () => {
  const ann = { wallet: 'W-ann', tokens: 0 };
  const bob = { wallet: 'W-bob', tokens: 1_000 };
  const cat = { wallet: 'W-cat', tokens: 1_000 };
  const sellToken = (house: AuctionHouse, over: Partial<Parameters<AuctionHouse['post']>[0]> = {}) => put(house, { token: true, sellerWallet: ann.wallet, bid: 100, buyout: 400, ...over });
  /** What each wallet ends up with from the moves (the ledger's own sum). */
  const sums = (house: AuctionHouse) => {
    const out = new Map<string, number>();
    for (const m of house.moves) out.set(m.wallet, (out.get(m.wallet) ?? 0) + m.amount);
    return out;
  };

  it('needs a wallet to sell and sets its prices in whole tokens up to a million', () => {
    const { house } = make();
    expect(house.post({ seller: 'ann', sellerName: 'Ann', item: makeStack(I.IRON_INGOT, 4), bid: 100, buyout: 0, hours: 12, deposit: 10, token: true }).ok).toBe(false);
    expect(house.post({ seller: 'ann', sellerName: 'Ann', item: makeStack(I.IRON_INGOT, 4), bid: AUCTION_RULES.maxToken + 1, buyout: 0, hours: 12, deposit: 10, token: true, sellerWallet: ann.wallet }).ok).toBe(false);
    const a = sellToken(house);
    expect(a).toMatchObject({ token: true, sellerWallet: 'W-ann' });
    expect(house.view({ ...DEFAULT_AUCTION_QUERY }, 'bob').rows.find((r) => r.id === a.id)?.token).toBe(true);
  });

  it('is paid from the wallet, never from the purse, and refuses what the wallet cannot cover', () => {
    const { house } = make();
    const a = sellToken(house);
    expect(house.bid(a.id, 'bob', 'Bob', 100, 1_000_000, { wallet: null, tokens: 0 })).toMatchObject({ ok: false });
    expect(house.bid(a.id, 'bob', 'Bob', 100, 1_000_000, { wallet: bob.wallet, tokens: 50 })).toMatchObject({ ok: false, error: 'Not enough $SOLRIFT.' });
    expect(house.bid(a.id, 'bob', 'Bob', 100, 0, bob)).toMatchObject({ ok: true, pay: 100, token: true });
    expect(house.moves).toMatchObject([{ wallet: 'W-bob', amount: -100, kind: 'trade' }]);
  });

  it('cannot be bid on from the seller\'s own wallet, under another name', () => {
    const { house } = make();
    const a = sellToken(house);
    expect(house.bid(a.id, 'ann2', 'Ann II', 100, 0, { wallet: ann.wallet, tokens: 1_000 })).toMatchObject({ ok: false, error: 'You cannot bid on your own auction.' });
    expect(house.moves).toEqual([]);
  });

  it('sends the outbid wallet its tokens back at once, in the ledger and not by mail', () => {
    const { house } = make();
    const a = sellToken(house);
    house.bid(a.id, 'bob', 'Bob', 100, 0, bob);
    expect(house.bid(a.id, 'cat', 'Cat', 105, 0, cat)).toMatchObject({ ok: true });
    expect(sums(house).get('W-bob')).toBe(0);
    expect(sums(house).get('W-cat')).toBe(-105);
    expect(house.mailOf('bob')).toEqual([]);
  });

  it('pays the seller the price less the cut and the house the cut, so a sale adds up to nothing', () => {
    const { house, clock } = make();
    const a = sellToken(house);
    house.bid(a.id, 'bob', 'Bob', 200, 0, bob);
    clock.t += 13 * HOUR;
    expect(house.update()).toBe(1);
    const sum = sums(house);
    expect(sum.get('W-bob')).toBe(-200);
    expect(sum.get('W-ann')).toBe(190);
    expect(sum.get(HOUSE_WALLET)).toBe(10);
    expect([...sum.values()].reduce((x, y) => x + y, 0)).toBe(0);
    expect(house.moves.find((m) => m.wallet === HOUSE_WALLET)?.kind).toBe('fee');
    // the Auren deposit still comes back by mail, with no Auren from the sale; the winner is mailed the item
    expect(house.mailOf('ann').map((m) => [m.kind, m.coins])).toEqual([['sold', 10]]);
    expect(house.mailOf('bob').map((m) => m.kind)).toEqual(['won']);
  });

  it('is bought out whole, or by what is left of an earlier bid, and adds up to nothing too', () => {
    const { house } = make();
    const a = sellToken(house);
    house.bid(a.id, 'bob', 'Bob', 100, 0, bob);
    expect(house.buyout(a.id, 'bob', 'Bob', 0, { wallet: bob.wallet, tokens: 299 })).toMatchObject({ ok: false });
    expect(house.buyout(a.id, 'bob', 'Bob', 0, { wallet: bob.wallet, tokens: 300 })).toMatchObject({ ok: true, pay: 300, bought: true, token: true });
    expect(house.size).toBe(0);
    const sum = sums(house);
    expect([sum.get('W-bob'), sum.get('W-ann'), sum.get(HOUSE_WALLET)]).toEqual([-400, 380, 20]);
  });

  it('is not paid twice: the moves wait until the ledger has them, and then they are gone', () => {
    const { house } = make();
    const a = sellToken(house);
    house.bid(a.id, 'bob', 'Bob', 100, 0, bob);
    expect(house.pendingTokens('W-bob')).toBe(-100);
    const copy = new AuctionHouse();
    copy.load(JSON.parse(JSON.stringify(house.toJSON())));
    expect(copy.moves).toEqual(house.moves);
    expect(copy.get(a.id)).toMatchObject({ token: true, sellerWallet: 'W-ann', bidderWallet: 'W-bob', top: 100 });
    house.ackMoves(house.moves);
    expect(house.moves).toEqual([]);
    expect(house.pendingTokens('W-bob')).toBe(0);
  });

  it('is an Auren auction when it says so: no moves at all', () => {
    const { house, clock } = make();
    const a = put(house);
    house.bid(a.id, 'bob', 'Bob', 100, 1_000, bob);
    clock.t += 13 * HOUR;
    house.update();
    expect(house.moves).toEqual([]);
  });
});
