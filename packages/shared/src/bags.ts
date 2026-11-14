import { Container, PLAYER_SLOTS } from './inventory';
import { BAGS, bagId, bagSlotsOf } from './items';
import type { MobKind } from './mobs';

/**
 * Bags, as in World of Warcraft: the backpack (the hotbar and its 27 slots) never changes, and a character wears up to
 * four bags in the bag slots of the inventory screen, each holding that many more items. Bags are bought from
 * merchants, found on monsters, handed out by quests and crafted from leather.
 *
 * In the inventory (`Player.inventory`) each bag slot owns a fixed stretch of `BAG_MAX` slots after the backpack: bag
 * slot 0 the first stretch, bag slot 1 the next, and so on. The slots of a bag that is not worn are shut (`bagGate`):
 * they are always empty and nothing is put into them, so everything that walks the inventory (crafting, selling,
 * quests, saving) sees the items in the bags without knowing about them. A bag cannot be taken off (or swapped for a
 * smaller one) while an item still sits in the room it would take away, as in the original.
 *
 * Pure data and rules, no world: the dice come in from the caller, so the server's own random source decides.
 */

/** How many bags a character wears. */
export const BAG_SLOTS = 4;
/** The most slots a bag can have (the biggest bag in `BAGS`): the room set aside in the inventory for each bag slot. */
export const BAG_MAX = BAGS.reduce((m, b) => Math.max(m, b.slots), 0);
/** The inventory holds the backpack and the room for four of the biggest bags. */
export const INVENTORY_SLOTS = PLAYER_SLOTS + BAG_SLOTS * BAG_MAX;

/** What a screen adds at its end for the bags: the slots they are worn in, then the room of each (see `Menu.attachBags`). */
export const BAG_MENU_SLOTS = BAG_SLOTS + BAG_SLOTS * BAG_MAX;

/** The inventory slot where the room of the bag in bag slot `b` begins. */
export const bagRoom = (b: number): number => PLAYER_SLOTS + b * BAG_MAX;

/** Which bag slot an inventory slot belongs to and how far into the bag it is, or null for the backpack and the hotbar. */
export function bagOf(i: number): { bag: number; offset: number } | null {
  if (!Number.isInteger(i) || i < PLAYER_SLOTS || i >= INVENTORY_SLOTS) return null;
  const r = i - PLAYER_SLOTS;
  return { bag: Math.floor(r / BAG_MAX), offset: r % BAG_MAX };
}

/** How many slots the worn bags add in all. */
export function bagCapacity(bags: Container): number {
  let n = 0;
  for (let b = 0; b < BAG_SLOTS; b++) {
    const s = bags.get(b);
    if (s) n += bagSlotsOf(s.id);
  }
  return n;
}

/** The test that opens only the slots of the worn bags (for `Container.usable`). */
export function bagGate(bags: Container): (i: number) => boolean {
  return (i) => {
    const at = bagOf(i);
    if (!at) return true;
    const s = bags.get(at.bag);
    return !!s && at.offset < bagSlotsOf(s.id);
  };
}

/** A new inventory with its bag slots tied to these worn bags. */
export function bagInventory(bags: Container): Container {
  const inv = new Container(INVENTORY_SLOTS);
  inv.usable = bagGate(bags);
  return inv;
}

/** Would bag slot `b` lose nothing if it held a bag of `slots` slots instead (0: no bag)? True when every item in it sits in the room that stays. */
export function bagFits(inventory: Container, b: number, slots: number): boolean {
  for (let k = slots; k < BAG_MAX; k++) if (inventory.get(bagRoom(b) + k)) return false;
  return true;
}

/** Items that sit in a shut slot (a save that lost its bag): they would be out of reach, so the player takes them back. */
export function strandedSlots(inventory: Container): number[] {
  const out: number[] = [];
  for (let i = PLAYER_SLOTS; i < inventory.size; i++) if (inventory.get(i) && !inventory.isUsable(i)) out.push(i);
  return out;
}

// ---- where bags come from ---------------------------------------------------------------------------------------

/** What a merchant asks for each bag, smallest first: more than the bag saves in a few trips, so crafting is the cheap way. */
export const BAG_PRICES: readonly number[] = [40, 110, 240, 480, 900, 1600];

/** The price of a bag (by its item id), or 0 for anything else. */
export const bagPrice = (id: number): number => BAG_PRICES[id - bagId(0)] ?? 0;

/** One purchase gives one bag; the merchant lists these bags (by their place in `BAGS`). */
export const bagStock = (tiers: readonly number[]): { id: number; count: number; price: number }[] => tiers.map((t) => ({ id: bagId(t), count: 1, price: BAG_PRICES[t] }));

/** The chance that a monster killed by a player leaves a bag behind (monsters that are no danger leave none). */
const BAG_DROP_CHANCE: Partial<Record<MobKind, number>> = {
  zombie: 0.03,
  husk: 0.035,
  drowned: 0.03,
  skeleton: 0.03,
  stray: 0.035,
  spider: 0.03,
  cave_spider: 0.025,
  creeper: 0.03,
  enderman: 0.12,
};

/** The smallest bag a kind leaves: an enderman carries nothing as poor as a small pouch. */
const BAG_DROP_FLOOR: Partial<Record<MobKind, number>> = { enderman: 2 };

/** How likely each bag is to be the one that drops (smallest first): the big ones are rare. */
const BAG_DROP_WEIGHT: readonly number[] = [12, 8, 5, 3, 1.2, 0.4];

/** The chance a kill of this kind drops a bag (before choosing which). */
export const bagDropChance = (kind: MobKind): number => BAG_DROP_CHANCE[kind] ?? 0;

/** What a monster that has just been killed leaves behind: the item id of a bag, or null. */
export function bagDrop(kind: MobKind, rand: () => number): number | null {
  const chance = BAG_DROP_CHANCE[kind];
  if (!chance || rand() >= chance) return null;
  const floor = BAG_DROP_FLOOR[kind] ?? 0;
  let total = 0;
  for (let t = floor; t < BAGS.length; t++) total += BAG_DROP_WEIGHT[t];
  let pick = rand() * total;
  for (let t = floor; t < BAGS.length; t++) {
    pick -= BAG_DROP_WEIGHT[t];
    if (pick < 0) return bagId(t);
  }
  return bagId(BAGS.length - 1);
}
