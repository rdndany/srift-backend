import { describe, expect, it } from 'vitest';
import { B, BAG_SLOTS, bagId, bagInventory, bagRoom, bagSlotsOf, Container, HOTBAR_SLOTS, I, makeStack, organizeInventory, parseSessionMessage, PLAYER_SLOTS, toolId } from './index';

const SWORD = toolId('sword', 'iron');
const PICK = toolId('pickaxe', 'iron');

function worn(...tiers: number[]) {
  const bags = new Container(BAG_SLOTS);
  tiers.forEach((t, b) => bags.set(b, makeStack(bagId(t), 1)));
  return { bags, inv: bagInventory(bags) };
}

const ids = (c: Container, from: number, to: number) => c.slots.slice(from, to).map((s) => s?.id ?? null);

describe('organize', () => {
  it('merges stacks of the same item into full stacks', () => {
    const { inv } = worn();
    inv.set(10, makeStack(I.APPLE, 20));
    inv.set(14, makeStack(I.APPLE, 30));
    inv.set(20, makeStack(I.APPLE, 40));
    expect(organizeInventory(inv)).toBe(true);
    expect(inv.get(HOTBAR_SLOTS)).toMatchObject({ id: I.APPLE, count: 64 });
    expect(inv.get(HOTBAR_SLOTS + 1)).toMatchObject({ id: I.APPLE, count: 26 });
    expect(inv.get(HOTBAR_SLOTS + 2)).toBeNull();
    expect(inv.countOf(I.APPLE)).toBe(90);
  });

  it('packs the items from the first backpack slot and groups them by kind', () => {
    const { inv } = worn();
    inv.set(30, makeStack(B.STONE, 5));
    inv.set(12, makeStack(I.APPLE, 3));
    inv.set(25, makeStack(SWORD, 1));
    organizeInventory(inv);
    expect(ids(inv, HOTBAR_SLOTS, HOTBAR_SLOTS + 4)).toEqual([SWORD, I.APPLE, B.STONE, null]);
  });

  it('leaves the hotbar alone', () => {
    const { inv } = worn();
    inv.set(0, makeStack(B.STONE, 5));
    inv.set(8, makeStack(I.APPLE, 3));
    inv.set(20, makeStack(I.APPLE, 3));
    organizeInventory(inv);
    expect(inv.get(0)).toMatchObject({ id: B.STONE, count: 5 });
    expect(inv.get(8)).toMatchObject({ id: I.APPLE, count: 3 });
  });

  it('does not touch the worn bags or what is in them', () => {
    const { bags, inv } = worn(0, 1);
    inv.set(bagRoom(0), makeStack(I.GOLD_INGOT, 10));
    inv.set(bagRoom(0) + 3, makeStack(I.GOLD_INGOT, 20));
    inv.set(bagRoom(1) + 5, makeStack(I.APPLE, 2));
    inv.set(20, makeStack(I.APPLE, 3));
    inv.set(10, makeStack(I.APPLE, 4));
    const bagSlots = [...Array(2).keys()].flatMap((b) => Array.from({ length: bagSlotsOf(bags.get(b)!.id) }, (_, k) => bagRoom(b) + k));
    const before = bagSlots.map((i) => JSON.stringify(inv.get(i)));
    organizeInventory(inv);
    expect(bagSlots.map((i) => JSON.stringify(inv.get(i)))).toEqual(before);
    expect(bags.get(0)!.id).toBe(bagId(0));
    expect(bags.get(1)!.id).toBe(bagId(1));
    // The backpack itself was merged: 3 + 4 apples are one stack, and the bag's apples are not added to it.
    expect(inv.get(HOTBAR_SLOTS)).toMatchObject({ id: I.APPLE, count: 7 });
    expect(inv.get(HOTBAR_SLOTS + 1)).toBeNull();
  });

  it('never loses an item and keeps the backpack within its 27 slots', () => {
    const { inv } = worn();
    for (let i = HOTBAR_SLOTS; i < PLAYER_SLOTS; i++) inv.set(i, makeStack(i % 2 ? SWORD : PICK, 1));
    organizeInventory(inv);
    expect(inv.countOf(SWORD) + inv.countOf(PICK)).toBe(PLAYER_SLOTS - HOTBAR_SLOTS);
    for (let i = HOTBAR_SLOTS; i < PLAYER_SLOTS; i++) expect(inv.get(i)).not.toBeNull();
  });
  it('keeps tools of different wear and enchantments apart', () => {
    const { inv } = worn();
    inv.set(10, makeStack(SWORD, 1, 0));
    inv.set(11, makeStack(SWORD, 1, 30));
    organizeInventory(inv);
    expect(inv.countOf(SWORD)).toBe(2);
    expect(inv.get(HOTBAR_SLOTS)!.damage).toBe(0);
    expect(inv.get(HOTBAR_SLOTS + 1)!.damage).toBe(30);
  });

  it('reports no change when it is already organized', () => {
    const { inv } = worn();
    inv.set(10, makeStack(I.APPLE, 3));
    organizeInventory(inv);
    expect(organizeInventory(inv)).toBe(false);
  });
});

describe('the organize command', () => {
  it('is understood by the protocol', () => {
    expect(parseSessionMessage({ t: 'organize' })).toEqual({ t: 'organize' });
  });
});
