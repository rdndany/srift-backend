import { cloneStack, type ItemStack } from './inventory';
import { MAX_COINS } from './economy';
import { isUndroppable } from './items';
import type { Player } from './player';

/**
 * Trading between two players: each puts items and coins on their side of the table, both say they accept, and
 * what is on the table changes hands in one step (or not at all). Everything is checked here, on the server, against
 * what the players really carry: the client only asks.
 *
 * The offered items stay in the offerer's bags until the trade settles (the table holds a copy of what was put on
 * it); an offer that no longer matches its slot (the item was dropped, used, moved) is taken off the table, and
 * anything that changes on the table cancels both acceptances so nobody accepts something that was swapped.
 */

/** Item places on one side of the table. */
export const TRADE_SLOTS = 6;
/** How near (in blocks) the players must be to start a trade, and how far they may drift apart before it is called off. */
export const TRADE_RANGE = 10;
export const TRADE_LEAVE = 16;
/** Seconds a request to trade stays open. */
export const TRADE_ASK_SECONDS = 30;

export interface TradeOffer {
  /** The slot of the inventory it lies in. */
  slot: number;
  /** What was put on the table (a copy, with the count offered). */
  stack: ItemStack;
  /** What the item is apart from its count: if the slot's item stops matching this, the offer lapses. */
  key: string;
}

export interface TradeSide {
  player: Player;
  offers: TradeOffer[];
  coins: number;
  ready: boolean;
}

/** An item without its count: two stacks with the same key are the same kind of thing. */
export const tradeKey = (s: ItemStack): string => JSON.stringify([s.id, s.damage, s.ench ?? null, s.name ?? null, s.rc ?? 0, s.gear ?? null]);

/** May these two players trade at all (and if not, why)? Distance and who they are, not what they offer. */
export function tradeBlocker(a: Player, b: Player): string | null {
  if (a.vitals.dead || b.vitals.dead) return 'A dead player cannot trade.';
  if (a.mode === 'creative' || b.mode === 'creative') return 'Nobody trades in creative mode.';
  if (a.spectating || b.spectating) return 'A spectator cannot trade.';
  const dx = a.body.x - b.body.x;
  const dy = a.body.y - b.body.y;
  const dz = a.body.z - b.body.z;
  if (Math.hypot(dx, dy, dz) > TRADE_RANGE) return 'You are too far apart to trade.';
  return null;
}

export class Trade {
  readonly sides: [TradeSide, TradeSide];

  constructor(a: Player, b: Player) {
    this.sides = [
      { player: a, offers: [], coins: 0, ready: false },
      { player: b, offers: [], coins: 0, ready: false },
    ];
  }

  sideOf(p: Player): TradeSide | null {
    return this.sides.find((s) => s.player === p) ?? null;
  }

  otherOf(p: Player): TradeSide | null {
    return this.sides.find((s) => s.player !== p) ?? null;
  }

  private reset(): void {
    for (const s of this.sides) s.ready = false;
  }

  /** Put the stack in `slot` on the table, `count` of it (all of it by default). Putting it again changes the count. Returns what went wrong. */
  put(p: Player, slot: number, count = Infinity): string | null {
    const side = this.sideOf(p);
    if (!side) return 'You are not in this trade.';
    if (!Number.isInteger(slot) || slot < 0 || slot >= p.inventory.size || !p.inventory.isUsable(slot)) return 'There is nothing there.';
    const held = p.inventory.get(slot);
    if (!held) return 'There is nothing there.';
    if (isUndroppable(held.id)) return 'That cannot be traded.'; // what cannot be dropped cannot be handed over either
    const n = Math.max(1, Math.min(held.count, Math.floor(Number.isFinite(count) ? count : held.count)));
    const known = side.offers.find((o) => o.slot === slot);
    if (!known && side.offers.length >= TRADE_SLOTS) return 'The table has room for only ' + TRADE_SLOTS + ' items from you.';
    const stack = cloneStack({ ...held, count: n });
    const offer: TradeOffer = { slot, stack, key: tradeKey(held) };
    if (known) Object.assign(known, offer);
    else side.offers.push(offer);
    this.reset();
    return null;
  }

  /** Take the offer at table place `i` back. */
  take(p: Player, i: number): boolean {
    const side = this.sideOf(p);
    if (!side || !Number.isInteger(i) || i < 0 || i >= side.offers.length) return false;
    side.offers.splice(i, 1);
    this.reset();
    return true;
  }

  /** Offer this many coins (at most what the player carries). */
  setCoins(p: Player, n: number): void {
    const side = this.sideOf(p);
    if (!side) return;
    const want = Number.isFinite(n) ? Math.max(0, Math.min(MAX_COINS, Math.floor(n))) : 0;
    const coins = Math.min(want, p.coins);
    if (coins === side.coins) return;
    side.coins = coins;
    this.reset();
  }

  /** Is there anything on the table? (Nobody accepts an empty table.) */
  get empty(): boolean {
    return this.sides.every((s) => s.offers.length === 0 && s.coins === 0);
  }

  /**
   * Drop what no longer holds: offers whose slot changed, coins that were spent. Returns true when something on the
   * table changed (both acceptances are then taken back).
   */
  validate(): boolean {
    let changed = false;
    for (const s of this.sides) {
      const keep = s.offers.filter((o) => {
        const have = s.player.inventory.get(o.slot);
        return !!have && tradeKey(have) === o.key && have.count >= o.stack.count;
      });
      if (keep.length !== s.offers.length) {
        s.offers = keep;
        changed = true;
      }
      if (s.coins > s.player.coins) {
        s.coins = s.player.coins;
        changed = true;
      }
    }
    if (changed) this.reset();
    return changed;
  }

  /**
   * One side says it accepts (or takes the acceptance back). When both do, the table is settled. Returns what to tell the
   * players: `done` when the goods changed hands, an error text when they could not (the trade stays open, acceptances taken back).
   */
  setReady(p: Player, on: boolean): { done: true } | { done: false; error?: string } {
    const side = this.sideOf(p);
    if (!side) return { done: false };
    this.validate();
    if (on && this.empty) return { done: false, error: 'There is nothing on the table.' };
    side.ready = on;
    if (!this.sides.every((s) => s.ready)) return { done: false };
    const error = this.settle();
    if (error) {
      this.reset();
      return { done: false, error };
    }
    return { done: true };
  }

  /** Move everything across. All or nothing: when anything does not fit, both bags and purses stay as they were. */
  private settle(): string | null {
    const [a, b] = this.sides;
    if (a.coins > a.player.coins || b.coins > b.player.coins) return 'Somebody does not have the coins any more.';
    if (a.player.coins - a.coins + b.coins > MAX_COINS) return `${a.player.name} cannot carry that many coins.`;
    if (b.player.coins - b.coins + a.coins > MAX_COINS) return `${b.player.name} cannot carry that many coins.`;

    const before = this.sides.map((s) => s.player.inventory.slots.map((x) => (x ? cloneStack(x) : null)));
    const restore = (): void => {
      this.sides.forEach((s, k) => before[k].forEach((x, i) => s.player.inventory.set(i, x)));
    };
    // What each side gives up leaves first, so the room it frees is room for what it gets.
    for (const s of this.sides) {
      for (const o of s.offers) {
        const have = s.player.inventory.get(o.slot);
        if (!have || tradeKey(have) !== o.key || have.count < o.stack.count) {
          restore();
          return 'An offered item is not there any more.';
        }
        have.count -= o.stack.count;
        s.player.inventory.set(o.slot, have.count > 0 ? have : null);
      }
    }
    for (const [from, to] of [[a, b], [b, a]] as const) {
      for (const o of from.offers) {
        const left = to.player.inventory.collect(cloneStack(o.stack));
        if (left) {
          restore();
          return `${to.player.name} does not have the room in their bags.`;
        }
      }
    }
    a.player.spendCoins(a.coins);
    b.player.spendCoins(b.coins);
    a.player.addCoins(b.coins);
    b.player.addCoins(a.coins);
    for (const s of this.sides) s.player.inventoryChanged();
    return null;
  }

  /** Are these two still near enough, alive, and in a state to trade? Returns why not. */
  broken(): string | null {
    const [a, b] = this.sides;
    if (a.player.vitals.dead || b.player.vitals.dead) return 'The trade was called off.';
    const d = Math.hypot(a.player.body.x - b.player.body.x, a.player.body.y - b.player.body.y, a.player.body.z - b.player.body.z);
    return d > TRADE_LEAVE ? 'You moved too far apart: the trade was called off.' : null;
  }
}
