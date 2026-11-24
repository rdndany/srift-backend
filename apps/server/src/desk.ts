import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomInt } from 'node:crypto';
import {
  AUCTIONEER,
  BAG_SLOTS,
  COMPANION_LOOT_BONUS,
  Container,
  STASHKEEPER,
  WORN_PLACES,
  bagInventory,
  campView,
  cloneStack,
  companionOfItem,
  dailyCoins,
  dailyGift,
  dayOf,
  expeditionById,
  makeStack,
  parseCamp,
  parseNetClientMessage,
  sheetOfSave,
  startTrip,
  streakOn,
  tripBlocker,
  tripResult,
  wingOfItem,
  type DeskAct,
  type DeskView,
  type NetClientMessage,
  type PlayerSave,
  type WebChatLine,
  type WornPlace,
} from '@solrift/shared';
import { AuthError, SESSION_COOKIE, json, readBody, readCookie, type AuthService } from './auth';
import type { Account } from './db';
import type { DeskResult, GameRoom } from './room';
import type { RoomStore } from './roomStore';

/**
 * The desk's server side (the website's /farm page and the Play page, see camp.ts): what a hero can do from a phone, with no game running. Everything the page
 * asks is validated here and done to the saved hero by `GameRoom.withSavedHero`; the page only draws what it is sent.
 */

const fail = (error: string): DeskResult => ({ ok: false, error });
const ok = (message: string): DeskResult => ({ ok: true, message });

export class Desk {
  constructor(
    private readonly room: GameRoom,
    private readonly store: RoomStore | null,
    private readonly now: () => number = Date.now,
  ) {}

  private campKey(wallet: string): string {
    return `camp:${wallet}`;
  }

  private loadCamp(wallet: string) {
    return parseCamp(this.store?.getJson(this.campKey(wallet)));
  }

  /** What the Camp page shows of the account's hero: null when the hero has never been played (nothing is saved yet). */
  view(account: Account): DeskView | null {
    const save = this.room.characterSave(account.id);
    if (!save) return null;
    return this.viewOf(account, save);
  }

  private viewOf(account: Account, save: PlayerSave): DeskView {
    const sheet = sheetOfSave(save, account.class);
    const bags = new Container(BAG_SLOTS);
    bags.loadJSON(save.bags);
    const inv = bagInventory(bags);
    inv.loadJSON(save.inv);
    const slots: DeskView['slots'] = [];
    for (let i = 0; i < inv.size; i++) if (inv.isUsable(i)) slots.push({ slot: i, item: inv.get(i) ? cloneStack(inv.get(i)!) : null });
    const market = this.room.market({}, account.id);
    const now = this.now();
    return {
      hero: { id: account.id, name: account.displayName, class: account.class, level: sheet.level, coins: sheet.coins },
      inGame: this.room.hasAccount(account.id),
      slots,
      bags: Array.from({ length: BAG_SLOTS }, (_, b) => (bags.get(b) ? cloneStack(bags.get(b)!) : null)),
      worn: {
        helmet: sheet.armor[0] ?? null,
        chestplate: sheet.armor[1] ?? null,
        leggings: sheet.armor[2] ?? null,
        boots: sheet.armor[3] ?? null,
        offhand: sheet.offhand,
        mount: sheet.mount,
        outfit: sheet.outfit,
        companion: sheet.companion,
        wings: sheet.wings,
        ring1: sheet.rings[0] ?? null,
        ring2: sheet.rings[1] ?? null,
        necklace: sheet.necklace,
      },
      stash: this.room.stashOf(account.wallet),
      auctions: { mine: market.mine, bids: market.bids, mail: market.mail },
      camp: campView(this.loadCamp(account.wallet), account.id, now),
      guild: this.room.guildCard(account.id),
    };
  }

  /** Do what the page asked for a hero. The answer says what happened, and carries the hero as it is now. */
  act(account: Account, raw: unknown): { ok: true; message: string; view: DeskView | null } | { ok: false; error: string; view: DeskView | null } {
    const result = this.run(account, raw);
    const view = this.view(account);
    return result.ok ? { ok: true, message: result.message, view } : { ok: false, error: result.error, view };
  }

  private hero(account: Account) {
    return { id: account.id, wallet: account.wallet, name: account.displayName, cls: account.class };
  }

  private run(account: Account, raw: unknown): DeskResult {
    const act = parseAct(raw);
    if (!act) return fail('That is not something the Camp can do.');
    const hero = this.hero(account);
    switch (act.a) {
      case 'equip':
        return this.room.withSavedHero(hero, (p) => {
          const e = p.deskEquip(act.slot);
          return e ? fail(e) : ok('Done.');
        });
      case 'unequip':
        return this.room.withSavedHero(hero, (p) => {
          const e = p.deskUnequip(act.where);
          return e ? fail(e) : ok('Taken off.');
        });
      case 'swap':
        return this.room.withSavedHero(hero, (p) => {
          const e = p.deskSwap(act.from, act.to);
          return e ? fail(e) : ok('Moved.');
        });
      case 'stash': {
        const cmd = command({ t: 'stash', ...(act.c as object) });
        if (!cmd) return fail('That is not a move the Stash knows.');
        return this.room.withSavedHero(hero, (p) => {
          p.atCounter(STASHKEEPER);
          p.drainEvents();
          p.apply(cmd);
          const said = toasts(p);
          return p.stashTouched ? ok('Moved.') : fail(said ?? 'Nothing was moved.');
        });
      }
      case 'auction': {
        const cmd = command({ t: 'auction', ...(act.c as object) });
        if (!cmd || (cmd.t === 'auction' && cmd.a === 'search')) return fail('That is not something the Auction House does here.');
        return this.room.withSavedHero(hero, (p) => {
          p.atCounter(AUCTIONEER);
          p.drainEvents();
          p.apply(cmd);
          const said = toasts(p);
          return p.auctionTouched ? ok(said ?? 'Done.') : fail(said ?? 'Nothing happened.');
        });
      }
      case 'daily':
        return this.daily(account);
      case 'trip':
        return act.op === 'start' ? this.startTrip(account, act.id) : this.claimTrip(account);
    }
  }

  // ---- the daily check-in ------------------------------------------------------------------------------------------

  private daily(account: Account): DeskResult {
    const state = this.loadCamp(account.wallet);
    const now = this.now();
    const today = dayOf(now);
    if (state.lastDay === today) return fail('You have checked in today. Come back tomorrow.');
    const streak = streakOn(today, state.lastDay, state.streak);
    const coins = dailyCoins(streak);
    const gift = dailyGift(streak);
    const res = this.room.withSavedHero(this.hero(account), (p) => {
      if (gift && p.inventory.collect(makeStack(gift.id, gift.count))) return fail('Make room in your bags for the gift, then check in.');
      p.addCoins(coins);
      return ok(`Checked in: day ${streak}. +${coins} Auren${gift ? ' and a gift of gold ingots' : ''}.`);
    });
    if (res.ok) this.store?.setJson(this.campKey(account.wallet), { ...state, lastDay: today, streak });
    return res;
  }

  // ---- expeditions -------------------------------------------------------------------------------------------------

  private startTrip(account: Account, id: string): DeskResult {
    const def = expeditionById(id);
    const state = this.loadCamp(account.wallet);
    const save = this.room.characterSave(account.id);
    if (!save) return fail('Play this hero once in the game first.');
    const sheet = sheetOfSave(save, account.class);
    const blocked = tripBlocker(def, sheet.level, state.trips[account.id] ?? null);
    if (blocked || !def) return fail(blocked ?? 'There is no such expedition.');
    // (the hero stays at home for this one: the dice are thrown now, and the helpers it has now are the ones that go)
    const wings = !!sheet.wings && !!wingOfItem(sheet.wings.id);
    const pet = !!sheet.companion && !!companionOfItem(sheet.companion.id);
    state.trips[account.id] = startTrip(def, this.now(), wings, pet, randomInt(1, 2 ** 31 - 1));
    this.store?.setJson(this.campKey(account.wallet), state);
    const mins = Math.round((state.trips[account.id].end - state.trips[account.id].start) / 60_000);
    return ok(`Your hero sets out: ${def.name}, back in ${mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60 ? `${mins % 60} min` : ''}`.trim() : `${mins} min`}${pet ? ` (the companion finds ${Math.round(COMPANION_LOOT_BONUS * 100)}% more)` : ''}.`);
  }

  private claimTrip(account: Account): DeskResult {
    const state = this.loadCamp(account.wallet);
    const trip = state.trips[account.id];
    const def = trip ? expeditionById(trip.id) : undefined;
    if (!trip || !def) return fail('Your hero is not out on an expedition.');
    if (this.now() < trip.end) return fail('Your hero is not back yet.');
    const result = tripResult(def, trip);
    const res = this.room.withSavedHero(this.hero(account), (p) => {
      // Everything has to fit: a trip is never half collected (a refusal throws the Player away without writing it back).
      for (const i of result.items) if (p.inventory.collect(makeStack(i.id, i.count))) return fail('Your bags are too full for what was found. Make room, then collect.');
      p.addCoins(result.coins);
      const kinds = result.items.length;
      return ok(`Back from ${def.name}: +${result.coins} Auren and ${kinds} kind${kinds === 1 ? '' : 's'} of materials.`);
    });
    if (res.ok) {
      delete state.trips[account.id];
      this.store?.setJson(this.campKey(account.wallet), state);
    }
    return res;
  }
}

/** What the page sent, if it is a thing the Camp does (the numbers inside stash and auction acts are checked by the game's own parser, below). */
export function parseAct(raw: unknown): DeskAct | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const int = (v: unknown, max: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : null);
  switch (r.a) {
    case 'equip': {
      const slot = int(r.slot, 1023);
      return slot === null ? null : { a: 'equip', slot };
    }
    case 'unequip':
      return WORN_PLACES.includes(r.where as WornPlace) ? { a: 'unequip', where: r.where as WornPlace } : null;
    case 'swap': {
      const from = int(r.from, 1023);
      const to = int(r.to, 1023);
      return from === null || to === null ? null : { a: 'swap', from, to };
    }
    case 'stash':
      return r.c && typeof r.c === 'object' ? { a: 'stash', c: r.c } : null;
    case 'auction':
      return r.c && typeof r.c === 'object' ? { a: 'auction', c: r.c } : null;
    case 'daily':
      return { a: 'daily' };
    case 'trip':
      if (r.op === 'claim') return { a: 'trip', op: 'claim' };
      return r.op === 'start' && typeof r.id === 'string' && r.id.length < 40 ? { a: 'trip', op: 'start', id: r.id } : null;
    default:
      return null;
  }
}

/** A counter's command, through the same check a client's message in the game goes through. */
function command(c: Record<string, unknown>): Extract<NetClientMessage, { t: 'cmd' }>['c'] | null {
  const msg = parseNetClientMessage({ t: 'cmd', c });
  return msg && msg.t === 'cmd' ? msg.c : null;
}

/** What the hero said (a refusal, or a result) while the command ran: the last line. */
function toasts(p: { drainEvents(): { t: string; text?: string }[] }): string | null {
  const lines = p.drainEvents().flatMap((e) => (e.t === 'toast' && e.text ? [e.text] : []));
  return lines.length ? lines[lines.length - 1] : null;
}

// ---- HTTP -------------------------------------------------------------------------------------------------------

/**
 * Serves `/desk/*` for the Camp page: `GET /desk/hero` (what the hero in play has), `POST /desk/act` (do something to it), and the
 * chat: `GET /desk/chat?since=N`, `POST /desk/chat`. Every request needs a signed-in account, and every POST a known Origin
 * (as for /auth), and nothing is done to a hero that is in the game.
 */
export function createDeskRouter(auth: AuthService, desk: Desk, room: GameRoom, opts: { trustProxy: boolean; actsPerMinute?: number }) {
  const hits = new Map<string, { count: number; reset: number }>();
  const limit = opts.actsPerMinute ?? 120;
  const limited = (req: IncomingMessage, account: Account): boolean => {
    const key = account.id;
    const t = Date.now();
    const h = hits.get(key);
    if (!h || h.reset <= t) {
      if (hits.size > 5000) hits.clear();
      hits.set(key, { count: 1, reset: t + 60_000 });
      return false;
    }
    void req;
    return ++h.count > limit;
  };

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (!url.pathname.startsWith('/desk/')) return false;
    try {
      const account = auth.resolve(readCookie(req.headers.cookie, SESSION_COOKIE));
      if (!account) throw new AuthError(401, 'sign in first');
      if (req.method === 'GET' && url.pathname === '/desk/hero') {
        if (limited(req, account)) throw new AuthError(429, 'too many requests');
        json(res, 200, { view: desk.view(account) }, { 'cache-control': 'no-store' });
        return true;
      }
      if (req.method === 'GET' && url.pathname === '/desk/chat') {
        if (limited(req, account)) throw new AuthError(429, 'too many requests');
        const since = Number(url.searchParams.get('since') ?? 0);
        const lines: WebChatLine[] = room.chatSince(Number.isFinite(since) ? Math.max(0, since) : 0);
        json(res, 200, { lines, head: room.chatHead, online: room.onlineNames(), you: account.displayName }, { 'cache-control': 'no-store' });
        return true;
      }
      if (req.method !== 'POST') throw new AuthError(405, 'method not allowed');
      const origin = req.headers.origin;
      if (!auth.isAllowedOrigin(origin)) throw new AuthError(403, 'origin not allowed');
      if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) throw new AuthError(415, 'expected application/json');
      if (limited(req, account)) throw new AuthError(429, 'too many requests');
      if (url.pathname === '/desk/act') {
        const body = await readBody(req);
        json(res, 200, desk.act(account, body));
        return true;
      }
      if (url.pathname === '/desk/chat') {
        const body = (await readBody(req)) as Record<string, unknown>;
        const error = room.webSay(account.id, account.wallet, account.displayName, typeof body?.text === 'string' ? body.text : '');
        json(res, 200, error ? { ok: false, error } : { ok: true });
        return true;
      }
      throw new AuthError(404, 'not found');
    } catch (err) {
      if (err instanceof AuthError) json(res, err.status, { error: err.message });
      else {
        console.error('[desk] unexpected error', err);
        json(res, 500, { error: 'internal error' });
      }
      return true;
    }
  };
}

export type { DeskView };
