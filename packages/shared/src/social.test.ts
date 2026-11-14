import { describe, expect, it } from 'vitest';
import { MAX_FRIENDS, MAX_IGNORED, SocialBook, parseSocialBook } from './index';

const who = (name: string, key: string | null = name) => ({ key, name });

describe('the friends and ignore lists', () => {
  it('add, find and remove by account (a rename is the same friend)', () => {
    const b = new SocialBook();
    expect(b.add('friends', who('ann', 'a1'))).toBe('added');
    expect(b.isFriend(who('annie', 'a1'))).toBe(true);
    expect(b.add('friends', who('annie', 'a1'))).toBe('exists');
    expect(b.friends).toEqual([{ key: 'a1', name: 'annie' }]);
    expect(b.remove('friends', who('x', 'a1'))).toBe('removed');
    expect(b.remove('friends', who('x', 'a1'))).toBe('missing');
  });

  it('tell guests apart by name, in any case', () => {
    const b = new SocialBook();
    b.add('ignored', who('Troll', null));
    expect(b.isIgnored(who('troll', null))).toBe(true);
    expect(b.isIgnored(who('troll', 'acct'))).toBe(true);
    expect(b.isIgnored(who('other', null))).toBe(false);
  });

  it('keep a name on one list only', () => {
    const b = new SocialBook();
    b.add('friends', who('ann', 'a1'));
    b.add('ignored', who('ann', 'a1'));
    expect(b.friends).toEqual([]);
    expect(b.ignored).toHaveLength(1);
    b.add('friends', who('ann', 'a1'));
    expect(b.ignored).toEqual([]);
  });

  it('are full at their limits', () => {
    const b = new SocialBook();
    for (let i = 0; i < MAX_FRIENDS; i++) expect(b.add('friends', who(`f${i}`, `k${i}`))).toBe('added');
    expect(b.add('friends', who('one more', 'k-more'))).toBe('full');
    for (let i = 0; i < MAX_IGNORED; i++) b.add('ignored', who(`i${i}`, `ik${i}`));
    expect(b.add('ignored', who('one more', 'ik-more'))).toBe('full');
  });

  it('are saved without guests among the friends, and read back safely', () => {
    const b = new SocialBook();
    b.add('friends', who('ann', 'a1'));
    b.add('ignored', who('troll', null));
    const back = parseSocialBook(JSON.parse(JSON.stringify(b.toJSON())));
    expect(back.friends).toEqual(b.friends);
    expect(back.ignored).toEqual(b.ignored);
    expect(parseSocialBook(null).friends).toEqual([]);
    const junk = parseSocialBook({ friends: [{ n: 'no key' }, { k: 'k', n: 'ok' }, { k: 'k', n: 'dup' }, 5, null], ignored: 'x' });
    expect(junk.friends).toEqual([{ key: 'k', name: 'ok' }]);
    expect(junk.ignored).toEqual([]);
  });
});
