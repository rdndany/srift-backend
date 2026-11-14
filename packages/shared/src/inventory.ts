import { cleanName, cloneEnchants, parseEnchants, parsePenalty, sameEnchants, type Enchant } from './enchant';
import { cloneGear, parseGear, type GearRoll } from './gear';
import { getItem } from './items';

export interface ItemStack {
  id: number;
  count: number;
  /** Tool wear (0 = new). */
  damage: number;
  /** Enchantments, as sorted [id, level] pairs (see enchant.ts). Treated as read-only: replace, never edit. */
  ench?: Enchant[];
  /** A name given at an anvil (shown instead of the item's own). */
  name?: string;
  /** The anvil's prior-work penalty: 1, 3, 7, 15... (each trip through an anvil doubles it and adds one). */
  rc?: number;
  /** What a piece of found gear rolled: its rarity, level, class and bonus stats (see gear.ts). Read-only: replace, never edit. */
  gear?: GearRoll;
}

export function makeStack(id: number, count = 1, damage = 0, ench?: Enchant[]): ItemStack {
  const s: ItemStack = { id, count, damage };
  if (ench && ench.length > 0) s.ench = ench;
  return s;
}

export function cloneStack(s: ItemStack): ItemStack {
  const c: ItemStack = { id: s.id, count: s.count, damage: s.damage };
  const ench = cloneEnchants(s.ench);
  if (ench) c.ench = ench;
  if (s.name) c.name = s.name;
  if (s.rc) c.rc = s.rc;
  const gear = cloneGear(s.gear);
  if (gear) c.gear = gear;
  return c;
}

export function maxStackOf(s: ItemStack): number {
  return getItem(s.id).maxStack;
}

export function canMerge(a: ItemStack, b: ItemStack): boolean {
  return a.id === b.id && a.damage === b.damage && maxStackOf(a) > 1 && sameEnchants(a.ench, b.ench) && a.name === b.name && (a.rc ?? 0) === (b.rc ?? 0);
}

export type SerializedStack = [id: number, count: number, damage: number, ench?: Enchant[] | null, meta?: { n?: string; r?: number; g?: GearRoll }] | null;

/** A fixed-size list of item slots (player inventory, chest, furnace, crafting grid...). */
export class Container {
  readonly slots: (ItemStack | null)[];
  /**
   * Which slots may take items (every one when this is null). The player's inventory shuts the slots of a bag that is not
   * worn (see bags.ts): they stay empty, and nothing is put into them, but code that walks every slot needs no change.
   */
  usable: ((i: number) => boolean) | null = null;

  constructor(public readonly size: number) {
    this.slots = Array.from({ length: size }, () => null);
  }

  get(i: number): ItemStack | null {
    return this.slots[i] ?? null;
  }

  /** May slot `i` take an item? (False for the slots of a bag that is not worn.) */
  isUsable(i: number): boolean {
    return i >= 0 && i < this.size && (!this.usable || this.usable(i));
  }

  set(i: number, s: ItemStack | null): void {
    this.slots[i] = s && s.count > 0 ? s : null;
  }

  /**
   * Insert a stack into slots [from, to): merge into matching stacks first, then fill empty slots.
   * Mutates `stack.count` down to what could not fit; returns the leftover (or null).
   */
  add(stack: ItemStack, from = 0, to = this.size): ItemStack | null {
    const max = maxStackOf(stack);
    for (let i = from; i < to && stack.count > 0; i++) {
      const s = this.slots[i];
      if (s && canMerge(s, stack) && s.count < max) {
        const n = Math.min(max - s.count, stack.count);
        s.count += n;
        stack.count -= n;
      }
    }
    for (let i = from; i < to && stack.count > 0; i++) {
      if (!this.slots[i] && this.isUsable(i)) {
        const n = Math.min(max, stack.count);
        this.slots[i] = cloneStack({ ...stack, count: n });
        stack.count -= n;
      }
    }
    return stack.count > 0 ? stack : null;
  }

  /**
   * Insert something the player picked up or was given: onto a matching stack wherever it is, otherwise into an empty slot
   * of the hotbar (the bottom bar) first, and only when the bar is full into the rest of the backpack and the bags. Same contract
   * as `add`: mutates `stack.count` down to what could not fit; returns the leftover (or null).
   */
  collect(stack: ItemStack): ItemStack | null {
    const max = maxStackOf(stack);
    for (let i = 0; i < this.size && stack.count > 0; i++) {
      const s = this.slots[i];
      if (s && canMerge(s, stack) && s.count < max) {
        const n = Math.min(max - s.count, stack.count);
        s.count += n;
        stack.count -= n;
      }
    }
    // The slots in order: the hotbar, then the backpack, then the bags (they come after it).
    for (let i = 0; i < this.size && stack.count > 0; i++) {
      if (!this.slots[i] && this.isUsable(i)) {
        const n = Math.min(max, stack.count);
        this.slots[i] = cloneStack({ ...stack, count: n });
        stack.count -= n;
      }
    }
    return stack.count > 0 ? stack : null;
  }
  /** Would this stack fit completely? (does not mutate) */
  canFit(stack: ItemStack, from = 0, to = this.size): boolean {
    const max = maxStackOf(stack);
    let left = stack.count;
    for (let i = from; i < to && left > 0; i++) {
      const s = this.slots[i];
      if (!s) {
        if (this.isUsable(i)) left -= max;
      } else if (canMerge(s, stack)) left -= max - s.count;
    }
    return left <= 0;
  }

  countOf(id: number): number {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  /** Remove up to `count` of an item. Returns true if the full amount was removed. */
  remove(id: number, count: number): boolean {
    if (this.countOf(id) < count) return false;
    for (let i = this.size - 1; i >= 0 && count > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const n = Math.min(s.count, count);
        s.count -= n;
        count -= n;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    return true;
  }

  isEmpty(): boolean {
    return this.slots.every((s) => !s);
  }

  /** Remove and return every stack (e.g. when a chest is broken). */
  drain(): ItemStack[] {
    const out: ItemStack[] = [];
    for (let i = 0; i < this.size; i++) {
      const s = this.slots[i];
      if (s) out.push(s);
      this.slots[i] = null;
    }
    return out;
  }

  totalItems(): number {
    let n = 0;
    for (const s of this.slots) if (s) n += s.count;
    return n;
  }

  toJSON(): SerializedStack[] {
    return this.slots.map((s) => {
      if (!s) return null;
      const ench = s.ench ? s.ench.map(([a, b]) => [a, b] as Enchant) : null;
      if (s.name || s.rc || s.gear) return [s.id, s.count, s.damage, ench, { ...(s.name ? { n: s.name } : {}), ...(s.rc ? { r: s.rc } : {}), ...(s.gear ? { g: cloneGear(s.gear)! } : {}) }];
      return ench ? [s.id, s.count, s.damage, ench] : [s.id, s.count, s.damage];
    });
  }

  loadJSON(data: unknown): void {
    if (!Array.isArray(data)) return;
    for (let i = 0; i < this.size; i++) {
      const e = data[i];
      if (Array.isArray(e) && e.length >= 2 && Number.isFinite(e[0]) && Number.isFinite(e[1])) {
        const id = Number(e[0]);
        const count = Math.max(0, Math.min(Number(e[1]), getItem(id).maxStack));
        const ench = getItem(id).id === id && getItem(id).maxStack === 1 ? parseEnchants(e[3]) : undefined;
        const stack = getItem(id).id === id && count > 0 ? makeStack(id, count, Number(e[2]) || 0, ench) : null;
        if (stack && e[4] && typeof e[4] === 'object') {
          const name = cleanName((e[4] as { n?: unknown }).n);
          const rc = parsePenalty((e[4] as { r?: unknown }).r);
          if (name) stack.name = name;
          if (rc) stack.rc = rc;
          const gear = parseGear((e[4] as { g?: unknown }).g, id);
          if (gear) stack.gear = gear;
        }
        this.slots[i] = stack;
      } else {
        this.slots[i] = null;
      }
    }
  }
}

export const PLAYER_SLOTS = 36;
export const HOTBAR_SLOTS = 9;
