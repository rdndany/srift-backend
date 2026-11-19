import { MAX_COINS, stackSellPrice } from './economy';
import { cloneStack, Container, makeStack, type ItemStack, type SerializedStack } from './inventory';
import { I, getItem, isUndroppable } from './items';
import { B } from './blocks';
import { tooltipName } from './tooltip';

/**
 * The Auction House of Dawnwatch, after the one of World of Warcraft: players put what they have found or made up for sale with a
 * starting bid and (if they like) a buyout, others bid on it or buy it out, and what is not sold comes back by mail.
 *
 *  - Posting costs a deposit (paid at once, given back when the item sells, lost when it does not).
 *  - A sale pays the seller the price less the house's cut; the winner is mailed the item.
 *  - A new bid has to beat the old one by at least 5%; the player who was outbid is mailed their coins back.
 *  - A buyout ends the auction at once.
 *  - Everything that is owed (items, coins) waits in the owner's mail until they collect it at the Auctioneer, so nothing is
 *    lost when a bag is full or the owner is away.
 *
 * This file is only the rules and the ledger. Who may do what, where, and with whose coins and bags is the `Player`'s to check;
 * the shared server keeps one house for the realm and stores it (see `AuctionHouse.toJSON`).
 */

/** The id of the NPC that runs the house (an entry of `NPCS`). */
export const AUCTIONEER = 'auctioneer';

export type AuctionHours = 12 | 24 | 48;
export const AUCTION_HOURS: readonly AuctionHours[] = [12, 24, 48];

export const AUCTION_RULES = {
  /** The house keeps this share of every sale. */
  cut: 0.05,
  /** The deposit is this share of what the item would sell for at a merchant, per 12 hours. */
  deposit: 0.15,
  /** A bid must beat the one before it by this share (at least 1). */
  raise: 0.05,
  /** How many auctions one account can have up at once. */
  maxListings: 30,
  /** Rows to a page of results. */
  pageSize: 12,
  /** The most mail an account is shown (everything stays safe: older letters appear as these are collected). */
  maxMail: 60,
} as const;

/** The seller of the stock the house itself puts up (it has no mail). */
export const HOUSE_ACCOUNT = 'house';
export const HOUSE_NAME = 'Dawnwatch Trading Co.';

export type AuctionCategory = 'all' | 'weapon' | 'armor' | 'tool' | 'food' | 'jewel' | 'book' | 'bag' | 'block' | 'other';

export const AUCTION_CATEGORIES: readonly { id: AuctionCategory; name: string }[] = [
  { id: 'all', name: 'All' },
  { id: 'weapon', name: 'Weapons' },
  { id: 'armor', name: 'Armor' },
  { id: 'tool', name: 'Tools' },
  { id: 'food', name: 'Food' },
  { id: 'jewel', name: 'Jewels' },
  { id: 'book', name: 'Books' },
  { id: 'bag', name: 'Bags & Mounts' },
  { id: 'block', name: 'Blocks' },
  { id: 'other', name: 'Materials & Other' },
];

/** The shelf of the house an item is on. */
export function categoryOf(stack: ItemStack): AuctionCategory {
  const item = getItem(stack.id);
  if (item.kind === 'Jewel') return 'jewel';
  if (item.kind === 'Skill Book' || item.kind === 'Enchanted Book') return 'book';
  if (item.kind === 'Bag' || item.kind === 'Mount') return 'bag';
  if (item.weapon || item.tool?.kind === 'sword' || item.use === 'bow' || item.use === 'crossbow') return 'weapon';
  if (item.armor || item.shield) return 'armor';
  if (item.tool) return 'tool';
  if (item.food) return 'food';
  if (item.block !== null) return 'block';
  return 'other';
}

export type AuctionSort = 'ending' | 'bid' | 'buyout' | 'name';
export const AUCTION_SORTS: readonly AuctionSort[] = ['ending', 'bid', 'buyout', 'name'];

/** What a search of the house asks for. */
export interface AuctionQuery {
  q: string;
  cat: AuctionCategory;
  sort: AuctionSort;
  desc: boolean;
  page: number;
}

export const DEFAULT_AUCTION_QUERY: AuctionQuery = { q: '', cat: 'all', sort: 'ending', desc: false, page: 0 };

/** What the Auctioneer takes off a client: anything not on the list is made safe, never trusted. */
export function cleanQuery(raw: Partial<AuctionQuery>): AuctionQuery {
  const q = typeof raw.q === 'string' ? raw.q.trim().slice(0, 40) : '';
  const cat = AUCTION_CATEGORIES.some((c) => c.id === raw.cat) ? (raw.cat as AuctionCategory) : 'all';
  const sort = AUCTION_SORTS.includes(raw.sort as AuctionSort) ? (raw.sort as AuctionSort) : 'ending';
  const page = typeof raw.page === 'number' && Number.isInteger(raw.page) && raw.page >= 0 && raw.page < 10_000 ? raw.page : 0;
  return { q, cat, sort, desc: raw.desc === true, page };
}

/** One auction up for sale. */
export interface Auction {
  id: number;
  /** The account of the seller, and the name they sell under. */
  seller: string;
  sellerName: string;
  item: ItemStack;
  /** The starting bid. */
  bid: number;
  /** The price that ends it at once (0: none). */
  buyout: number;
  /** The highest bid so far (0: none) and who made it. */
  top: number;
  bidder: string | null;
  bidderName: string | null;
  /** Coins paid to post it. */
  deposit: number;
  /** When it ends (ms). */
  end: number;
}

export type MailKind = 'sold' | 'won' | 'outbid' | 'expired' | 'cancelled';

/** A letter from the house: something owed to its owner, waiting to be collected. */
export interface Mail {
  id: number;
  kind: MailKind;
  subject: string;
  item: ItemStack | null;
  coins: number;
}

/** One row of a list, as a client draws it. */
export interface AuctionRow {
  id: number;
  item: ItemStack;
  name: string;
  seller: string;
  /** You put this one up. */
  yours: boolean;
  /** You hold the highest bid. */
  leading: boolean;
  bid: number;
  buyout: number;
  top: number;
  /** The lowest bid that is taken now. */
  next: number;
  /** Seconds left. */
  left: number;
  /** The coins it takes to buy it out (what you owe if you hold the highest bid is already counted). */
  pay: number;
}

export interface MailRow {
  id: number;
  kind: MailKind;
  subject: string;
  item: ItemStack | null;
  coins: number;
}

/** Everything the window of the Auctioneer shows. */
export interface AuctionView {
  query: AuctionQuery;
  rows: AuctionRow[];
  total: number;
  pages: number;
  mine: AuctionRow[];
  bids: AuctionRow[];
  mail: MailRow[];
  /** The player may sell and bid (an account), or can only look. */
  member: boolean;
}

/** What a command to the house can ask for (the `auction` command of a session). */
export type AuctionCommand =
  | { a: 'search'; q: string; cat: AuctionCategory; sort: AuctionSort; desc: boolean; page: number }
  | { a: 'post'; slot: number; count: number; bid: number; buyout: number; hours: AuctionHours }
  | { a: 'bid'; id: number; amount: number }
  | { a: 'buyout'; id: number }
  | { a: 'cancel'; id: number }
  /** Collect a letter (`id`), or all of them (0). */
  | { a: 'take'; id: number };

/** Deposit for posting a stack for this long. */
export function depositFor(stack: ItemStack, hours: number): number {
  const value = stackSellPrice(stack) * stack.count;
  return Math.min(MAX_COINS, Math.max(hours / 12, Math.ceil((value * AUCTION_RULES.deposit * hours) / 12)));
}

/** What the house keeps of a sale at `price`. */
export const houseCut = (price: number): number => Math.floor(price * AUCTION_RULES.cut);

/** The lowest bid that is taken on an auction that has `top` as its highest (0 for no bid yet) and starts at `start`. */
export const nextBid = (start: number, top: number): number => (top > 0 ? top + Math.max(1, Math.ceil(top * AUCTION_RULES.raise)) : start);

/** WoW's way of telling the time left: short, medium, long and very long. */
export function timeLeftLabel(seconds: number): string {
  if (seconds < 30 * 60) return 'Short';
  if (seconds < 2 * 3600) return 'Medium';
  if (seconds < 12 * 3600) return 'Long';
  return 'Very Long';
}

/** Why a stack cannot be put up (null: it can). */
export function sellBlocker(stack: ItemStack | null): string | null {
  if (!stack) return 'There is nothing there.';
  if (isUndroppable(stack.id)) return 'That cannot be sold.';
  return null;
}

export type Outcome<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

interface SavedAuction {
  id: number;
  seller: string;
  sellerName: string;
  item: SerializedStack;
  bid: number;
  buyout: number;
  top: number;
  bidder: string | null;
  bidderName: string | null;
  deposit: number;
  end: number;
}

interface SavedMail {
  id: number;
  kind: MailKind;
  subject: string;
  item: SerializedStack;
  coins: number;
}

export interface AuctionHouseJSON {
  next: number;
  auctions: SavedAuction[];
  mail: Record<string, SavedMail[]>;
}

const stackJson = (s: ItemStack): SerializedStack => {
  const c = new Container(1);
  c.set(0, cloneStack(s));
  return c.toJSON()[0];
};

const stackFrom = (e: unknown): ItemStack | null => {
  const c = new Container(1);
  c.loadJSON([e]);
  return c.get(0);
};

const isMailKind = (k: unknown): k is MailKind => k === 'sold' || k === 'won' || k === 'outbid' || k === 'expired' || k === 'cancelled';
const whole = (v: unknown, max = MAX_COINS): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);

export interface AuctionHouseOptions {
  /** The clock (ms); a test sets its own. */
  now?: () => number;
  /** How long an hour of an auction is, in ms (a test makes it short). */
  hourMs?: number;
}

/** Stock the house puts up itself, so that the shelves are never bare (single player has no other sellers). */
const HOUSE_STOCK: readonly { id: number; count: number }[] = [
  { id: I.COAL, count: 16 },
  { id: I.IRON_INGOT, count: 8 },
  { id: I.GOLD_INGOT, count: 4 },
  { id: I.DIAMOND, count: 1 },
  { id: I.EMERALD, count: 2 },
  { id: I.LEATHER, count: 8 },
  { id: I.BREAD, count: 12 },
  { id: I.COOKED_MEAT, count: 8 },
  { id: I.ARROW, count: 32 },
  { id: I.BOOK, count: 4 },
  { id: I.JEWEL_DAWN, count: 1 },
  { id: I.JEWEL_RIFT, count: 1 },
  { id: I.JEWEL_BLOOM, count: 1 },
  { id: I.EXPERIENCE_BOTTLE, count: 3 },
  { id: B.LOG, count: 32 },
  { id: I.SLIMEBALL, count: 4 },
  { id: I.GUNPOWDER, count: 6 },
  { id: I.ENDER_PEARL, count: 1 },
];

/** How many auctions the house keeps up for itself when it is set to (see `restock`). */
const HOUSE_TARGET = 16;

/**
 * Every auction of a realm and every letter owed. Pure bookkeeping: it moves nothing between a player and the world, it only says
 * what is owed to whom. The caller takes what the result says is to be paid and puts back what it took when the result is a refusal.
 */
export class AuctionHouse {
  private readonly auctions = new Map<number, Auction>();
  private readonly mailbox = new Map<string, Mail[]>();
  private next = 1;
  private readonly now: () => number;
  private readonly hourMs: number;
  /** Something changed since it was last written down. */
  dirty = false;
  /** Called with an account and a line to tell them (when they are in the game; the caller finds them). */
  notify: ((owner: string, text: string) => void) | null = null;

  constructor(opts: AuctionHouseOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.hourMs = opts.hourMs ?? 3_600_000;
  }

  get size(): number {
    return this.auctions.size;
  }

  get(id: number): Auction | null {
    return this.auctions.get(id) ?? null;
  }

  // ---- the ledger ---------------------------------------------------------------------

  private mailTo(owner: string, kind: MailKind, subject: string, item: ItemStack | null, coins: number): void {
    if (owner === HOUSE_ACCOUNT || (!item && coins <= 0)) return;
    const list = this.mailbox.get(owner) ?? [];
    list.push({ id: this.next++, kind, subject, item: item ? cloneStack(item) : null, coins: Math.max(0, Math.floor(coins)) });
    this.mailbox.set(owner, list);
    this.dirty = true;
  }

  private tell(owner: string, text: string): void {
    if (owner !== HOUSE_ACCOUNT) this.notify?.(owner, text);
  }

  private nameOf(a: Auction): string {
    const n = tooltipName(a.item);
    return a.item.count > 1 ? `${n} x${a.item.count}` : n;
  }

  /** The sale is made at `price`: the seller is paid and the winner mailed the item. */
  private settle(a: Auction, price: number): void {
    const cut = houseCut(price);
    const name = this.nameOf(a);
    this.mailTo(a.seller, 'sold', `Auction successful: ${name}`, null, price - cut + a.deposit);
    if (a.bidder) this.mailTo(a.bidder, 'won', `Auction won: ${name}`, a.item, 0);
    this.auctions.delete(a.id);
    this.dirty = true;
    this.tell(a.seller, `Your auction of ${name} sold for ${price} Auren.`);
    if (a.bidder) this.tell(a.bidder, `You won the auction for ${name}.`);
  }

  // ---- what players do -----------------------------------------------------------------

  /** Put an item up. The deposit is the caller's to take (it has checked the coins); `deposit` is what it took. */
  post(p: { seller: string; sellerName: string; item: ItemStack; bid: number; buyout: number; hours: number; deposit: number }): Outcome<{ auction: Auction }> {
    const blocked = sellBlocker(p.item);
    if (blocked) return fail(blocked);
    if (!AUCTION_HOURS.includes(p.hours as AuctionHours)) return fail('Choose how long it runs.');
    if (!Number.isInteger(p.bid) || p.bid < 1 || p.bid > MAX_COINS) return fail('Set a starting bid of at least 1.');
    if (!Number.isInteger(p.buyout) || p.buyout < 0 || p.buyout > MAX_COINS || (p.buyout > 0 && p.buyout < p.bid)) return fail('The buyout cannot be less than the starting bid.');
    let mine = 0;
    for (const a of this.auctions.values()) if (a.seller === p.seller) mine++;
    if (p.seller !== HOUSE_ACCOUNT && mine >= AUCTION_RULES.maxListings) return fail(`You can have only ${AUCTION_RULES.maxListings} auctions up at once.`);
    const auction: Auction = {
      id: this.next++,
      seller: p.seller,
      sellerName: p.sellerName,
      item: cloneStack(p.item),
      bid: p.bid,
      buyout: p.buyout,
      top: 0,
      bidder: null,
      bidderName: null,
      deposit: p.deposit,
      end: this.now() + p.hours * this.hourMs,
    };
    this.auctions.set(auction.id, auction);
    this.dirty = true;
    return { ok: true, auction };
  }

  /** The coins `who` would pay to buy out `a` now. */
  private buyoutPay(a: Auction, who: string): number {
    return a.buyout - (a.bidder === who ? a.top : 0);
  }

  private check(a: Auction | null, who: string | null): Outcome<{ auction: Auction }> {
    if (!who) return fail('Sign in to bid or sell.');
    if (!a || a.end <= this.now()) return fail('That auction is over.');
    if (a.seller === who) return fail('You cannot bid on your own auction.');
    return { ok: true, auction: a };
  }

  /** Bid `amount` (every coin of it paid now). A bid at or over the buyout buys it. `coins` are what the bidder has: the call refuses what they cannot pay. */
  bid(id: number, who: string | null, name: string, amount: number, coins: number): Outcome<{ pay: number; bought: boolean }> {
    const c = this.check(this.auctions.get(id) ?? null, who);
    if (!c.ok || !who) return c.ok ? fail('Sign in to bid or sell.') : c;
    const a = c.auction;
    if (a.buyout > 0 && amount >= a.buyout) return this.buyout(id, who, name, coins);
    if (!Number.isInteger(amount) || amount > MAX_COINS) return fail('That is not a bid.');
    if (a.bidder === who) return fail('You already hold the highest bid.');
    if (amount < nextBid(a.bid, a.top)) return fail(`The lowest bid is ${nextBid(a.bid, a.top)}.`);
    if (coins < amount) return fail('Not enough coins.');
    if (a.bidder) {
      this.mailTo(a.bidder, 'outbid', `Outbid: ${this.nameOf(a)}`, null, a.top);
      this.tell(a.bidder, `You were outbid on ${this.nameOf(a)}.`);
    }
    a.top = amount;
    a.bidder = who;
    a.bidderName = name;
    this.dirty = true;
    return { ok: true, pay: amount, bought: false };
  }

  /** Buy it out now. */
  buyout(id: number, who: string | null, name: string, coins: number): Outcome<{ pay: number; bought: boolean }> {
    const c = this.check(this.auctions.get(id) ?? null, who);
    if (!c.ok || !who) return c.ok ? fail('Sign in to bid or sell.') : c;
    const a = c.auction;
    if (a.buyout <= 0) return fail('There is no buyout on that.');
    const pay = this.buyoutPay(a, who);
    if (coins < pay) return fail('Not enough coins.');
    if (a.bidder && a.bidder !== who) {
      this.mailTo(a.bidder, 'outbid', `Outbid: ${this.nameOf(a)}`, null, a.top);
      this.tell(a.bidder, `You were outbid on ${this.nameOf(a)}.`);
    }
    a.bidder = who;
    a.bidderName = name;
    a.top = a.buyout;
    this.settle(a, a.buyout);
    return { ok: true, pay, bought: true };
  }

  /** Take an auction down: only the seller can, and only while nobody has bid. The item comes back by mail, and the deposit is lost. */
  cancel(id: number, who: string | null): Outcome {
    const a = this.auctions.get(id);
    if (!a || !who || a.seller !== who) return fail('That is not your auction.');
    if (a.bidder) return fail('Somebody has bid on it: it cannot be taken down.');
    this.mailTo(a.seller, 'cancelled', `Auction cancelled: ${this.nameOf(a)}`, a.item, 0);
    this.auctions.delete(id);
    this.dirty = true;
    return { ok: true };
  }

  /** Close the auctions whose time is up. Returns how many ended. */
  update(): number {
    const t = this.now();
    let n = 0;
    for (const a of [...this.auctions.values()]) {
      if (a.end > t) continue;
      n++;
      if (a.bidder) this.settle(a, a.top);
      else {
        this.mailTo(a.seller, 'expired', `Auction expired: ${this.nameOf(a)}`, a.item, 0);
        this.auctions.delete(a.id);
        this.dirty = true;
        this.tell(a.seller, `Your auction of ${this.nameOf(a)} expired; it is in your mail.`);
      }
    }
    return n;
  }

  // ---- mail ---------------------------------------------------------------------------

  mailOf(owner: string | null): readonly Mail[] {
    return (owner ? this.mailbox.get(owner) : null) ?? [];
  }

  /** Take a letter out of the box (the caller has put what is in it into the owner's hands). */
  takeMail(owner: string, id: number): Mail | null {
    const list = this.mailbox.get(owner);
    const i = list ? list.findIndex((m) => m.id === id) : -1;
    if (!list || i < 0) return null;
    const [m] = list.splice(i, 1);
    if (list.length === 0) this.mailbox.delete(owner);
    this.dirty = true;
    return m;
  }

  // ---- looking ------------------------------------------------------------------------

  private row(a: Auction, viewer: string | null): AuctionRow {
    const yours = viewer !== null && a.seller === viewer;
    const leading = viewer !== null && a.bidder === viewer;
    return {
      id: a.id,
      item: cloneStack(a.item),
      name: tooltipName(a.item),
      seller: a.sellerName,
      yours,
      leading,
      bid: a.bid,
      buyout: a.buyout,
      top: a.top,
      next: nextBid(a.bid, a.top),
      left: Math.max(0, Math.round((a.end - this.now()) / 1000)),
      pay: a.buyout > 0 ? this.buyoutPay(a, viewer ?? '') : 0,
    };
  }

  /** The auctions that match, in the order asked for, one page of them. */
  search(query: AuctionQuery, viewer: string | null): { rows: AuctionRow[]; total: number; pages: number; page: number } {
    const needle = query.q.toLowerCase();
    const t = this.now();
    const found = [...this.auctions.values()].filter((a) => a.end > t && (query.cat === 'all' || categoryOf(a.item) === query.cat) && (!needle || tooltipName(a.item).toLowerCase().includes(needle)));
    const price = (a: Auction): number => (a.top > 0 ? a.top : a.bid);
    const key = (a: Auction): number | string => (query.sort === 'ending' ? a.end : query.sort === 'bid' ? price(a) : query.sort === 'buyout' ? (a.buyout > 0 ? a.buyout : Infinity) : tooltipName(a.item).toLowerCase());
    found.sort((x, y) => {
      const a = key(x);
      const b = key(y);
      const d = typeof a === 'string' ? a.localeCompare(b as string) : a === b ? 0 : a < (b as number) ? -1 : 1;
      return (query.desc ? -d : d) || x.id - y.id;
    });
    const pages = Math.max(1, Math.ceil(found.length / AUCTION_RULES.pageSize));
    const page = Math.min(query.page, pages - 1);
    return { rows: found.slice(page * AUCTION_RULES.pageSize, (page + 1) * AUCTION_RULES.pageSize).map((a) => this.row(a, viewer)), total: found.length, pages, page };
  }

  /** What the Auctioneer's window shows `viewer`. */
  view(query: AuctionQuery, viewer: string | null): AuctionView {
    const s = this.search(query, viewer);
    const all = [...this.auctions.values()].filter((a) => a.end > this.now());
    const byEnd = (x: Auction, y: Auction): number => x.end - y.end;
    return {
      query: { ...query, page: s.page },
      rows: s.rows,
      total: s.total,
      pages: s.pages,
      mine: viewer ? all.filter((a) => a.seller === viewer).sort(byEnd).map((a) => this.row(a, viewer)) : [],
      bids: viewer ? all.filter((a) => a.bidder === viewer).sort(byEnd).map((a) => this.row(a, viewer)) : [],
      mail: this.mailOf(viewer)
        .slice(0, AUCTION_RULES.maxMail)
        .map((m) => ({ id: m.id, kind: m.kind, subject: m.subject, item: m.item ? cloneStack(m.item) : null, coins: m.coins })),
      member: viewer !== null,
    };
  }

  // ---- the house's own stock ----------------------------------------------------------------------

  /** Keep about sixteen auctions of the house's own on the shelves (single player: there are no other sellers). */
  restock(rand: () => number): void {
    let own = 0;
    for (const a of this.auctions.values()) if (a.seller === HOUSE_ACCOUNT) own++;
    for (; own < HOUSE_TARGET; own++) {
      const pick = HOUSE_STOCK[Math.floor(rand() * HOUSE_STOCK.length)];
      const count = Math.max(1, Math.round(pick.count * (0.5 + rand())));
      const item = makeStack(pick.id, Math.min(count, getItem(pick.id).maxStack));
      const worth = Math.max(2, stackSellPrice(item) * item.count);
      const hours = AUCTION_HOURS[Math.floor(rand() * AUCTION_HOURS.length)];
      const res = this.post({ seller: HOUSE_ACCOUNT, sellerName: HOUSE_NAME, item, bid: Math.ceil(worth * (1.5 + rand() * 0.4)), buyout: Math.ceil(worth * (2.4 + rand() * 0.8)), hours, deposit: 0 });
      // (they are not all put up for the full time: the shelves turn over)
      if (res.ok) res.auction.end -= Math.floor(rand() * hours * 0.8 * this.hourMs);
    }
  }

  // ---- saving ---------------------------------------------------------------------------------------

  toJSON(): AuctionHouseJSON {
    const mail: Record<string, SavedMail[]> = {};
    for (const [owner, list] of this.mailbox) mail[owner] = list.map((m) => ({ id: m.id, kind: m.kind, subject: m.subject, item: m.item ? stackJson(m.item) : null, coins: m.coins }));
    return {
      next: this.next,
      auctions: [...this.auctions.values()].map((a) => ({ id: a.id, seller: a.seller, sellerName: a.sellerName, item: stackJson(a.item), bid: a.bid, buyout: a.buyout, top: a.top, bidder: a.bidder, bidderName: a.bidderName, deposit: a.deposit, end: a.end })),
      mail,
    };
  }

  /** Read a saved house (anything that does not make sense is left out). */
  load(data: unknown): void {
    if (!data || typeof data !== 'object') return;
    const d = data as Partial<AuctionHouseJSON>;
    let top = 1;
    for (const s of Array.isArray(d.auctions) ? d.auctions : []) {
      const item = s && typeof s === 'object' ? stackFrom(s.item) : null;
      if (!item || typeof s.seller !== 'string' || typeof s.id !== 'number' || !Number.isInteger(s.id)) continue;
      const a: Auction = {
        id: s.id,
        seller: s.seller,
        sellerName: typeof s.sellerName === 'string' ? s.sellerName.slice(0, 32) : s.seller,
        item,
        bid: Math.max(1, whole(s.bid)),
        buyout: whole(s.buyout),
        top: whole(s.top),
        bidder: typeof s.bidder === 'string' && whole(s.top) > 0 ? s.bidder : null,
        bidderName: typeof s.bidderName === 'string' ? s.bidderName.slice(0, 32) : null,
        deposit: whole(s.deposit),
        end: typeof s.end === 'number' && Number.isFinite(s.end) ? s.end : 0,
      };
      if (!a.bidder) a.top = 0;
      this.auctions.set(a.id, a);
      top = Math.max(top, a.id + 1);
    }
    for (const [owner, list] of Object.entries(d.mail && typeof d.mail === 'object' ? d.mail : {})) {
      if (!Array.isArray(list)) continue;
      const kept: Mail[] = [];
      for (const m of list) {
        if (!m || typeof m !== 'object' || !isMailKind(m.kind) || typeof m.id !== 'number' || !Number.isInteger(m.id)) continue;
        const item = m.item ? stackFrom(m.item) : null;
        const coins = whole(m.coins);
        if (!item && coins <= 0) continue;
        kept.push({ id: m.id, kind: m.kind, subject: typeof m.subject === 'string' ? m.subject.slice(0, 120) : '', item, coins });
        top = Math.max(top, m.id + 1);
      }
      if (kept.length > 0) this.mailbox.set(owner, kept);
    }
    this.next = Math.max(top, typeof d.next === 'number' && Number.isInteger(d.next) ? d.next : 1);
  }
}
