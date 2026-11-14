import { describe, expect, it } from 'vitest';
import { Container, HOTBAR_SLOTS, PLAYER_SLOTS, makeStack } from './inventory';
import { I } from './items';

describe('collecting items', () => {
  it('puts a new item in the hotbar first, in its first free slot', () => {
    const c = new Container(PLAYER_SLOTS);
    c.set(0, makeStack(I.ORB, 1));
    expect(c.collect(makeStack(I.STICK, 3))).toBeNull();
    expect(c.get(1)?.id).toBe(I.STICK);
    for (let i = HOTBAR_SLOTS; i < PLAYER_SLOTS; i++) expect(c.get(i)).toBeNull();
  });

  it('tops up a matching stack wherever it is, even in the backpack', () => {
    const c = new Container(PLAYER_SLOTS);
    c.set(HOTBAR_SLOTS + 2, makeStack(I.STICK, 10));
    c.collect(makeStack(I.STICK, 5));
    expect(c.get(HOTBAR_SLOTS + 2)?.count).toBe(15);
    for (let i = 0; i < HOTBAR_SLOTS; i++) expect(c.get(i)).toBeNull();
  });

  it('uses the rest of the backpack once the hotbar is full, and reports what does not fit', () => {
    const c = new Container(PLAYER_SLOTS);
    for (let i = 0; i < HOTBAR_SLOTS; i++) c.set(i, makeStack(I.ORB, 1));
    expect(c.collect(makeStack(I.ORB, 1))).toBeNull();
    expect(c.get(HOTBAR_SLOTS)?.id).toBe(I.ORB);
    for (let i = HOTBAR_SLOTS + 1; i < PLAYER_SLOTS; i++) c.set(i, makeStack(I.ORB, 1));
    const left = c.collect(makeStack(I.ORB, 1));
    expect(left?.count).toBe(1);
  });
});
