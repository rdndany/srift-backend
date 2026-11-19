import { makeStack, type ItemStack } from './inventory';
import { getItem } from './items';
import { SMELTING } from './smelting';

/** How many foods a campfire cooks at once. */
export const CAMPFIRE_SLOTS = 4;

/** Food sitting on one campfire, for drawing it. `slots` is four item ids, 0 when that place is empty. */
export interface CampfireFoodView {
  x: number;
  y: number;
  z: number;
  slots: number[];
}
/** A campfire cooks three times as slowly as a furnace. */
export const CAMPFIRE_COOK_SECONDS = 30;

/**
 * What a campfire turns this item into, or null. Only food that a furnace can cook: meat, potato and the like.
 * Ore, sand and cactus stay in the furnace.
 */
export function campfireFood(id: number): number | null {
  const out = SMELTING.get(id);
  if (out === undefined || !getItem(id).food) return null;
  return out;
}

/** One campfire's four cooking places. Each place holds one item and how long it has been cooking. */
export class Campfire {
  private slots: ({ id: number; cook: number } | null)[] = Array.from({ length: CAMPFIRE_SLOTS }, () => null);

  get busy(): boolean {
    return this.slots.some((s) => s !== null);
  }

  /** The items sitting on the fire, empty places included, for drawing them. */
  cooking(): readonly (number | null)[] {
    return this.slots.map((s) => s?.id ?? null);
  }

  /** Put one item on a free place. False when it is not campfire food or every place is taken. */
  add(id: number): boolean {
    if (campfireFood(id) === null) return false;
    const i = this.slots.findIndex((s) => s === null);
    if (i < 0) return false;
    this.slots[i] = { id, cook: 0 };
    return true;
  }

  /**
   * Advance cooking. An unlit campfire holds its place. Returns the cooked items that are ready to pop off.
   */
  tick(dt: number, lit: boolean): number[] {
    if (!lit) return [];
    const done: number[] = [];
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (!s) continue;
      s.cook += dt;
      if (s.cook < CAMPFIRE_COOK_SECONDS) continue;
      const out = campfireFood(s.id);
      this.slots[i] = null;
      if (out !== null) done.push(out);
    }
    return done;
  }

  /** The raw items still cooking, and clear the fire. */
  drain(): ItemStack[] {
    const out: ItemStack[] = [];
    for (const s of this.slots) if (s) out.push(makeStack(s.id, 1));
    this.slots = Array.from({ length: CAMPFIRE_SLOTS }, () => null);
    return out;
  }

  toJSON(): (readonly [number, number] | null)[] {
    return this.slots.map((s) => (s ? [s.id, Math.round(s.cook * 100) / 100] : null));
  }

  loadJSON(data: unknown): void {
    if (!Array.isArray(data)) return;
    this.slots = Array.from({ length: CAMPFIRE_SLOTS }, (_, i) => {
      const s = data[i];
      if (!Array.isArray(s) || s.length < 2) return null;
      const id = s[0];
      const cook = s[1];
      if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) return null;
      if (typeof cook !== 'number' || !Number.isFinite(cook) || cook < 0) return null;
      return { id, cook: Math.min(cook, CAMPFIRE_COOK_SECONDS) };
    });
  }
}
