import { BAG_MAX, BAG_SLOTS, bagRoom } from './bags';
import { canMerge, cloneStack, Container, HOTBAR_SLOTS, maxStackOf, PLAYER_SLOTS, type ItemStack } from './inventory';
import { itemKind } from './tooltip';

/**
 * The Organize button of the inventory: the backpack and every worn bag are taken as one store, merged into full stacks (a log
 * in the backpack and a log in a bag become two logs) and laid out by kind (equipment, bags, books, food, blocks, dyes,
 * materials), then by item, from the first slot of the backpack on, into the bags when it is full. The hotbar is left as the
 * player arranged it, and nothing is lost: the stacks only get fewer, so they always fit.
 */

const KIND_ORDER = ['Equipment', 'Bag', 'Special', 'Skill Book', 'Glyph Tome', 'Food', 'Item', 'Nature', 'Block', 'Dye', 'Material'];

const rank = (s: ItemStack): number => {
  const r = KIND_ORDER.indexOf(itemKind(s.id));
  return r < 0 ? KIND_ORDER.length : r;
};

/** The slots of the backpack Organize works in: the 27 after the hotbar, which is left as it is. */
export function organizeSlots(): number[] {
  const out: number[] = [];
  for (let i = HOTBAR_SLOTS; i < PLAYER_SLOTS; i++) out.push(i);
  return out;
}

/** Every slot Organize works in, in the order it fills them: the backpack, then the open slots of each worn bag. */
export function organizeGroups(inventory: Container): number[][] {
  const all = organizeSlots();
  for (let b = 0; b < BAG_SLOTS; b++) for (let k = 0; k < BAG_MAX; k++) if (inventory.isUsable(bagRoom(b) + k)) all.push(bagRoom(b) + k);
  return [all];
}

/** The order of two stacks in the organized bags: kind, then item, then the fuller and the less worn first, then by name. */
export function compareStacks(a: ItemStack, b: ItemStack): number {
  return (
    rank(a) - rank(b) ||
    a.id - b.id ||
    b.count - a.count ||
    a.damage - b.damage ||
    (b.ench?.length ?? 0) - (a.ench?.length ?? 0) ||
    (a.name ?? '').localeCompare(b.name ?? '')
  );
}

/** Merge and sort the backpack and the worn bags in place. Returns false when nothing moved. */
export function organizeInventory(inventory: Container): boolean {
  let changed = false;
  for (const slots of organizeGroups(inventory)) if (organizeSlotsOf(inventory, slots)) changed = true;
  return changed;
}

function organizeSlotsOf(inventory: Container, slots: number[]): boolean {
  const before = slots.map((i) => inventory.get(i));
  const merged: ItemStack[] = [];
  for (const s of before) {
    if (!s) continue;
    const left = cloneStack(s);
    for (const m of merged) {
      if (left.count <= 0) break;
      if (canMerge(m, left) && m.count < maxStackOf(m)) {
        const n = Math.min(maxStackOf(m) - m.count, left.count);
        m.count += n;
        left.count -= n;
      }
    }
    if (left.count > 0) merged.push(left);
  }
  merged.sort(compareStacks);
  let changed = false;
  slots.forEach((i, k) => {
    const next = merged[k] ?? null;
    const was = before[k];
    if (JSON.stringify(was) !== JSON.stringify(next)) changed = true;
    inventory.set(i, next);
  });
  return changed;
}
