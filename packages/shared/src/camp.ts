import type { AuctionRow, MailRow } from './auction';
import type { ClassId } from './classes';
import type { GuildRank } from './guild';
import type { ItemStack } from './inventory';
import { dayOf } from './bounties';
import { I } from './items';
import { mulberry32 } from './noise';
import type { StashView } from './stash';

/**
 * What a hero can do from a phone or a tablet, without being in the game (the website's /farm page: the daily check-in and the offline farm).
 * Pure rules and data. The server keeps the state, checks everything, and applies the results to the saved hero.
 *
 * Two small things live here that only the Camp has:
 *   - the daily check-in: a few Auren once a (UTC) day, more for every day in a row
 *   - expeditions: send the hero (and its companion) on a timed trip and collect what it found
 *
 * Nothing here pays $SOLRIFT, gives experience or gives gear, so the Camp is no way around the game's own rewards and its
 * achievements: it is Auren and common materials, a little at a time.
 */

// ---- the daily check-in --------------------------------------------------------------------------------------------

/** Auren for the first day, what each further day in a row adds, and the day after which it stops growing. */
export const DAILY_BASE = 60;
export const DAILY_STEP = 40;
export const DAILY_CAP_DAYS = 7;

/** What a check-in pays on the `streak`-th day in a row (1 is the first). */
export const dailyCoins = (streak: number): number => DAILY_BASE + DAILY_STEP * (Math.min(Math.max(1, Math.floor(streak)), DAILY_CAP_DAYS) - 1);

/** A gift on top of the Auren every seventh day: a few of a good material. */
export function dailyGift(streak: number): { id: number; count: number } | null {
  const s = Math.floor(streak);
  return s > 0 && s % DAILY_CAP_DAYS === 0 ? { id: I.GOLD_INGOT, count: 3 } : null;
}

/** The streak a check-in made on `today` would be, given the last one (a day number, or -1 for never) and the streak it ended with. */
export function streakOn(today: number, lastDay: number, streak: number): number {
  if (lastDay === today) return streak;
  return lastDay === today - 1 ? streak + 1 : 1;
}

// ---- expeditions -----------------------------------------------------------------------------------------------------

export interface ExpeditionLoot {
  item: number;
  min: number;
  max: number;
  /** The chance (0..1) that it is found at all. */
  chance: number;
}

export interface ExpeditionDef {
  id: string;
  name: string;
  blurb: string;
  /** How long it takes, in minutes. */
  minutes: number;
  /** The level the hero has to have. */
  level: number;
  coins: readonly [number, number];
  loot: readonly ExpeditionLoot[];
}

export const EXPEDITIONS: readonly ExpeditionDef[] = [
  {
    id: 'meadow',
    name: 'Forage the Meadows',
    blurb: 'A short walk around Dawnwatch for berries, feathers and whatever the farmers dropped.',
    minutes: 15,
    level: 1,
    coins: [25, 50],
    loot: [
      { item: I.BREAD, min: 2, max: 5, chance: 1 },
      { item: I.FEATHER, min: 2, max: 6, chance: 0.6 },
      { item: I.STRING, min: 1, max: 4, chance: 0.5 },
    ],
  },
  {
    id: 'quarry',
    name: 'Raid the Old Quarry',
    blurb: 'Rubble, coal and iron left behind by the miners who never came back.',
    minutes: 60,
    level: 3,
    coins: [80, 160],
    loot: [
      { item: I.COAL, min: 6, max: 14, chance: 1 },
      { item: I.RAW_IRON, min: 3, max: 8, chance: 0.8 },
      { item: I.LEATHER, min: 2, max: 5, chance: 0.6 },
    ],
  },
  {
    id: 'hollow',
    name: 'Search the Hollow',
    blurb: 'Deeper tunnels with gold, lapis and the odd glint of redstone.',
    minutes: 240,
    level: 6,
    coins: [260, 480],
    loot: [
      { item: I.IRON_INGOT, min: 3, max: 7, chance: 1 },
      { item: I.GOLD_INGOT, min: 2, max: 5, chance: 0.7 },
      { item: I.LAPIS_LAZULI, min: 3, max: 8, chance: 0.6 },
      { item: I.REDSTONE, min: 3, max: 8, chance: 0.5 },
    ],
  },
  {
    id: 'deep',
    name: 'Delve the Deep',
    blurb: 'A whole night in the dark under the Hollow King. Dangerous, and worth it.',
    minutes: 480,
    level: 10,
    coins: [600, 1000],
    loot: [
      { item: I.DIAMOND, min: 1, max: 3, chance: 0.8 },
      { item: I.EMERALD, min: 1, max: 3, chance: 0.6 },
      { item: I.GUNPOWDER, min: 4, max: 10, chance: 0.9 },
      { item: I.BONE, min: 4, max: 10, chance: 0.9 },
    ],
  },
];

export const expeditionById = (id: unknown): ExpeditionDef | undefined => EXPEDITIONS.find((e) => e.id === id);

/** What a companion adds to what an expedition finds (a share more), and what wings take off its time (a share less). */
export const COMPANION_LOOT_BONUS = 0.1;
export const WINGS_TIME_BONUS = 0.15;

/** A trip under way: what it is, when it began and ends (ms), the dice it was made with, and the helpers that went along. */
export interface Trip {
  id: string;
  start: number;
  end: number;
  seed: number;
  /** A companion is along: it finds more. */
  pet: boolean;
}

export interface TripResult {
  coins: number;
  items: { id: number; count: number }[];
}

/** How long a trip takes for a hero with or without wings, in ms. */
export function tripMs(def: ExpeditionDef, wings: boolean): number {
  return Math.round(def.minutes * 60_000 * (wings ? 1 - WINGS_TIME_BONUS : 1));
}

/** Why a hero cannot go (null: it can). */
export function tripBlocker(def: ExpeditionDef | undefined, level: number, current: Trip | null): string | null {
  if (!def) return 'There is no such expedition.';
  if (current) return 'Your hero is already out on an expedition.';
  if (level < def.level) return `That one needs a hero of level ${def.level}.`;
  return null;
}

/** Start a trip at `now`. The dice are thrown now (the seed is kept), so waiting and leaving again cannot change what is found. */
export function startTrip(def: ExpeditionDef, now: number, wings: boolean, pet: boolean, seed: number): Trip {
  return { id: def.id, start: now, end: now + tripMs(def, wings), seed: seed >>> 0, pet };
}

/** What a trip found: the same every time it is asked for, from the seed it was started with. */
export function tripResult(def: ExpeditionDef, trip: Trip): TripResult {
  const rand = mulberry32(trip.seed);
  const pick = (min: number, max: number): number => min + Math.floor(rand() * (max - min + 1));
  const more = trip.pet ? 1 + COMPANION_LOOT_BONUS : 1;
  const coins = Math.max(1, Math.round(pick(def.coins[0], def.coins[1]) * more));
  const items: { id: number; count: number }[] = [];
  for (const l of def.loot) {
    const roll = rand();
    const n = pick(l.min, l.max);
    if (roll < l.chance) items.push({ id: l.item, count: Math.max(1, Math.round(n * more)) });
  }
  return { coins, items };
}

// ---- what is kept, per wallet -----------------------------------------------------------------------------------

/** What the server keeps of a wallet's Camp: the check-in streak (shared by its heroes) and each hero's trip. */
export interface CampState {
  v: 1;
  /** The day of the last check-in (-1: never), and how many days in a row it has been. */
  lastDay: number;
  streak: number;
  /** The trip of each hero, by character id. */
  trips: Record<string, Trip>;
}

export const emptyCamp = (): CampState => ({ v: 1, lastDay: -1, streak: 0, trips: {} });

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Read a saved Camp; anything that does not fit is dropped, so a hostile or old record gives an empty one. */
export function parseCamp(raw: unknown): CampState {
  const out = emptyCamp();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  if (finite(r.lastDay) && finite(r.streak)) {
    out.lastDay = Math.floor(r.lastDay);
    out.streak = Math.max(0, Math.min(10_000, Math.floor(r.streak)));
  }
  const trips = r.trips;
  if (trips && typeof trips === 'object') {
    for (const [hero, t] of Object.entries(trips as Record<string, unknown>)) {
      if (!t || typeof t !== 'object' || hero.length > 80) continue;
      const x = t as Record<string, unknown>;
      if (!expeditionById(x.id) || !finite(x.start) || !finite(x.end) || !finite(x.seed)) continue;
      out.trips[hero] = { id: x.id as string, start: x.start, end: x.end, seed: x.seed >>> 0, pet: x.pet === true };
    }
  }
  return out;
}

/** What a client is shown of the Camp: its own numbers and the chances it has now. */
export interface CampView {
  /** What the check-in would pay today, whether it can be made, and the streak so far (what it will be once made, when it can). */
  daily: { can: boolean; streak: number; coins: number; gift: { id: number; count: number } | null; nextStreak: number };
  /** The hero's trip under way, with what it will find once back, or null. */
  trip: { id: string; start: number; end: number; pet: boolean; done: boolean; result: TripResult | null } | null;
  /** The server's clock (ms), so a countdown does not depend on the device's. */
  now: number;
}

export function campView(state: CampState, hero: string, now: number): CampView {
  const today = dayOf(now);
  const can = state.lastDay !== today;
  const next = streakOn(today, state.lastDay, state.streak);
  // A streak that was missed shows what it restarts at.
  const shown = can ? next : state.streak;
  const t = state.trips[hero] ?? null;
  const def = t ? expeditionById(t.id) : undefined;
  const done = !!t && now >= t.end;
  return {
    daily: { can, streak: can ? (state.lastDay === today - 1 ? state.streak : 0) : state.streak, coins: dailyCoins(shown), gift: dailyGift(shown), nextStreak: shown },
    trip: t && def ? { id: t.id, start: t.start, end: t.end, pet: t.pet, done, result: done ? tripResult(def, t) : null } : null,
    now,
  };
}

// ---- what the Camp page shows and asks ---------------------------------------------------------------------------

/** What a hero wears, by place (the places `Player.deskUnequip` knows). */
export const WORN_PLACES = ['helmet', 'chestplate', 'leggings', 'boots', 'offhand', 'mount', 'outfit', 'companion', 'wings', 'ring1', 'ring2', 'necklace'] as const;
export type WornPlace = (typeof WORN_PLACES)[number];

/** Everything the Camp page shows of the hero in play: the numbers, the bags, what is worn, the Stash, the Auction House mail and the Camp itself. */
export interface DeskView {
  hero: { id: string; name: string; class: ClassId | null; level: number; coins: number };
  /** The hero is in the game right now, so it cannot be changed from here (what is shown is the game's own copy, a moment old). */
  inGame: boolean;
  /** Every open slot of the bags (hotbar first, then the backpack, then the room of each bag) with what lies there. */
  slots: { slot: number; item: ItemStack | null }[];
  /** The four bag slots (the bags themselves). */
  bags: (ItemStack | null)[];
  worn: Record<WornPlace, ItemStack | null>;
  stash: StashView;
  /** The Auction House, for this account only: what it has on offer, what it has bid on and what waits in its mail. */
  auctions: { mine: AuctionRow[]; bids: AuctionRow[]; mail: MailRow[] };
  camp: CampView;
  /** The hero's guild as it stands (read only here: founding, inviting and the rest are done in the game), or null. */
  guild: GuildCard | null;
}

/** A guild, for the Camp page: who is in it and who is in the realm now. */
export interface GuildCard {
  name: string;
  tag: string;
  motd: string;
  /** The rank of the hero. */
  you: GuildRank;
  members: { name: string; rank: GuildRank; online: boolean }[];
}

/** A thing the Camp page asks. Every number and id in it is checked by the server again. */
export type DeskAct =
  | { a: 'equip'; slot: number }
  | { a: 'unequip'; where: WornPlace }
  | { a: 'swap'; from: number; to: number }
  | { a: 'stash'; c: unknown }
  | { a: 'auction'; c: unknown }
  | { a: 'daily' }
  | { a: 'trip'; op: 'start'; id: string }
  | { a: 'trip'; op: 'claim' };

/** One line of the chat on the website. `from` is empty for a notice ("Ann joined"). */
export interface WebChatLine {
  n: number;
  at: number;
  from: string;
  text: string;
}
