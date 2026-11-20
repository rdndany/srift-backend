import { describe, expect, it } from 'vitest';
import { B, BAG_SLOTS, bagId, bagInventory, bagRoom, Container, HOTBAR_SLOTS, I, makeStack, organizeInventory, parseSessionMessage, PLAYER_SLOTS, toolId } from './index';

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

  it('treats the backpack and the bags as one store: a log in each becomes two logs', () => {
    const { bags, inv } = worn(0, 1);
    inv.set(12, makeStack(B.LOG, 1));
    inv.set(bagRoom(1) + 3, makeStack(B.LOG, 1));
    expect(organizeInventory(inv)).toBe(true);
    expect(inv.get(HOTBAR_SLOTS)).toMatchObject({ id: B.LOG, count: 2 });
    expect(inv.countOf(B.LOG)).toBe(2);
    expect(inv.get(bagRoom(1) + 3)).toBeNull();
    expect(bags.get(0)!.id).toBe(bagId(0));
    expect(bags.get(1)!.id).toBe(bagId(1));
  });

  it('merges across the bags into full stacks, and fills the backpack before the bags', () => {
    const { inv } = worn(0, 1);
    inv.set(bagRoom(0), makeStack(I.GOLD_INGOT, 40));
    inv.set(bagRoom(1) + 5, makeStack(I.GOLD_INGOT, 40));
    inv.set(HOTBAR_SLOTS + 2, makeStack(I.GOLD_INGOT, 30));
    organizeInventory(inv);
    expect(inv.get(HOTBAR_SLOTS)).toMatchObject({ id: I.GOLD_INGOT, count: 64 });
    expect(inv.get(HOTBAR_SLOTS + 1)).toMatchObject({ id: I.GOLD_INGOT, count: 46 });
    expect(inv.get(HOTBAR_SLOTS + 2)).toBeNull();
    expect(inv.countOf(I.GOLD_INGOT)).toBe(110);
    expect(inv.get(bagRoom(0))).toBeNull();
    expect(inv.get(bagRoom(1) + 5)).toBeNull();
  });

  it('spills into the bags, in order, once the backpack is full', () => {
    const { inv } = worn(0);
    // 27 tools of different wear fill the backpack; two more sit in the bag.
    for (let i = HOTBAR_SLOTS; i < PLAYER_SLOTS; i++) inv.set(i, makeStack(SWORD, 1, i));
    inv.set(bagRoom(0) + 3, makeStack(I.APPLE, 5));
    inv.set(bagRoom(0) + 1, makeStack(PICK, 1));
    organizeInventory(inv);
    for (let i = HOTBAR_SLOTS; i < PLAYER_SLOTS; i++) expect(inv.get(i)).not.toBeNull();
    // 28 equipment pieces and an apple stack: the backpack holds 27 of the 28 pieces first, then the bag begins with the last one.
    expect(inv.get(bagRoom(0))).not.toBeNull();
    expect(inv.countOf(I.APPLE)).toBe(5);
    expect(inv.countOf(SWORD) + inv.countOf(PICK)).toBe(28);
  });
  it('never moves anything into a slot of a bag that is not worn', () => {
    const { inv } = worn(0);
    inv.set(bagRoom(0) + 4, makeStack(I.APPLE, 1));
    organizeInventory(inv);
    for (let b = 1; b < BAG_SLOTS; b++) for (let k = 0; k < 4; k++) expect(inv.slots[bagRoom(b) + k]).toBeNull();
    expect(inv.countOf(I.APPLE)).toBe(1);
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
