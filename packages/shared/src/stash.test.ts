import { describe, expect, it } from 'vitest';
import { I, STASH_SLOTS, StashVault, makeStack, parseNetClientMessage, stashBlocker } from './index';

describe('the stash vault', () => {
  it('keeps one stash for each owner, and nobody sees another owner\u2019s', () => {
    const v = new StashVault();
    expect(v.put('a', makeStack(I.DIAMOND, 5), 5)).toBe(5);
    expect(v.view('a').slots[0]).toMatchObject({ id: I.DIAMOND, count: 5 });
    expect(v.view('b').slots.every((s) => s === null)).toBe(true);
    expect(v.dirty.has('a')).toBe(true);
    expect(v.dirty.has('b')).toBe(false);
  });

  it('merges stacks, moves only as many as asked and only as many as fit', () => {
    const v = new StashVault();
    v.put('a', makeStack(I.DIAMOND, 10), 10);
    expect(v.put('a', makeStack(I.DIAMOND, 10), 4)).toBe(4);
    expect(v.peek('a', 0)?.count).toBe(14);
    v.remove('a', 0, 5);
    expect(v.peek('a', 0)?.count).toBe(9);
    v.remove('a', 0, 100);
    expect(v.peek('a', 0)).toBeNull();
    // a full stash (unmergeable stacks) takes nothing more
    for (let i = 0; i < STASH_SLOTS; i++) v.of('a').set(i, makeStack(I.DIAMOND, 1, i + 1));
    expect(v.put('a', makeStack(I.IRON_INGOT, 1), 1)).toBe(0);
  });

  it('round-trips through its saved form', () => {
    const v = new StashVault();
    v.put('a', { ...makeStack(I.DIAMOND, 3), name: 'Lucky' }, 3);
    const w = new StashVault();
    w.load('a', JSON.parse(JSON.stringify(v.toJSON('a'))));
    expect(w.view('a').slots[0]).toMatchObject({ id: I.DIAMOND, count: 3, name: 'Lucky' });
    // a stash that is already here is the newer one: a late load does not overwrite it
    w.put('a', makeStack(I.IRON_INGOT, 1), 1);
    w.load('a', []);
    expect(w.view('a').slots.some((s) => s?.id === I.IRON_INGOT)).toBe(true);
  });

  it('refuses what cannot be dropped', () => {
    expect(stashBlocker(null)).not.toBeNull();
    expect(stashBlocker(makeStack(I.DIAMOND, 1))).toBeNull();
  });
});

describe('the stash commands', () => {
  it('accept whole numbers in range and nothing else', () => {
    expect(parseNetClientMessage({ t: 'cmd', c: { t: 'stash', a: 'put', slot: 3, count: 10 } })).toBeTruthy();
    for (const bad of [{ a: 'put', slot: -1, count: 1 }, { a: 'put', slot: 1.5, count: 1 }, { a: 'take', slot: STASH_SLOTS, count: 1 }, { a: 'take', slot: 0, count: 0 }, { a: 'take', slot: 0, count: 65 }, { a: 'steal', slot: 0, count: 1 }, { a: 'put', slot: 0 }]) {
      expect(parseNetClientMessage({ t: 'cmd', c: { t: 'stash', ...bad } }), JSON.stringify(bad)).toBeNull();
    }
  });
});