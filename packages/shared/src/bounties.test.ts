import { describe, expect, it } from 'vitest';
import { BOUNTIES, BOUNTY_TIERS, BountyBook, DAY_MS, bountiesOn, dayName, dayOf } from './index';

const D = 20_778; // 2026-11-21
const at = (day: number, hour = 12) => day * DAY_MS + hour * 3_600_000;

describe('the day', () => {
  it('is the UTC day, as a number and as a name', () => {
    expect(dayOf(at(D, 0))).toBe(D);
    expect(dayOf(at(D, 23) + 3_599_999)).toBe(D);
    expect(dayOf(at(D + 1, 0))).toBe(D + 1);
    expect(dayName(D)).toBe('2026-11-21');
  });
});

describe('the bounties of a day', () => {
  it('are three, easy then medium then hard, the same whenever and for whoever asks', () => {
    for (let d = D; d < D + 200; d++) {
      const list = bountiesOn(d);
      expect(list.map((b) => b.tier)).toEqual([...BOUNTY_TIERS]);
      expect(bountiesOn(d)).toEqual(list);
    }
  });

  it('ask for three different things, whatever the day', () => {
    for (let d = D; d < D + 500; d++) {
      const stats = bountiesOn(d).map((b) => b.stat);
      expect(new Set(stats).size).toBe(3);
    }
  });

  it('change from day to day, and over a month use most of the list', () => {
    const seen = new Set<string>();
    for (let d = D; d < D + 30; d++) for (const b of bountiesOn(d)) seen.add(b.id);
    expect(seen.size).toBeGreaterThanOrEqual(BOUNTIES.length - 2);
    const triples = new Set<string>();
    for (let d = D; d < D + 30; d++) triples.add(bountiesOn(d).map((b) => b.id).join());
    expect(triples.size).toBeGreaterThan(10);
  });

  it('only count deeds a character can do any day', () => {
    for (const b of BOUNTIES) {
      expect(['level', 'quests']).not.toContain(b.stat);
      expect(b.goal).toBeGreaterThan(0);
    }
    expect(new Set(BOUNTIES.map((b) => b.id)).size).toBe(BOUNTIES.length);
  });
});

describe('a character\'s day', () => {
  const [easy, medium, hard] = bountiesOn(D);

  it('counts deeds towards the day\'s bounties, and finishes one when its goal is met, once', () => {
    const book = new BountyBook();
    expect(book.add(D, easy.stat, easy.goal - 1)).toEqual([]);
    expect(book.view(D, at(D)).rows[0]).toMatchObject({ id: easy.id, have: easy.goal - 1, done: false });
    expect(book.add(D, easy.stat, 1).map((b) => b.id)).toContain(easy.id);
    // finished is finished: more of the same deed finishes nothing again, and the count stays at the goal
    expect(book.add(D, easy.stat, 50).map((b) => b.id)).not.toContain(easy.id);
    expect(book.view(D, at(D)).rows[0]).toMatchObject({ have: easy.goal, done: true });
  });

  it('ignores the deeds no bounty of the day asks for', () => {
    const book = new BountyBook();
    const wanted = new Set(bountiesOn(D).map((b) => b.stat));
    const other = (['kills', 'elites', 'bosses', 'dungeons', 'coins', 'minutes'] as const).find((s) => !wanted.has(s))!;
    expect(book.add(D, other, 1_000_000)).toEqual([]);
    expect(book.empty).toBe(true);
  });

  it('starts every day from nothing', () => {
    const book = new BountyBook();
    book.add(D, medium.stat, medium.goal);
    expect(book.view(D, at(D)).rows[1].done).toBe(true);
    const next = bountiesOn(D + 1);
    const view = book.view(D + 1, at(D + 1));
    expect(view.day).toBe(dayName(D + 1));
    expect(view.rows.every((r) => !r.done && r.have === 0)).toBe(true);
    expect(view.rows.map((r) => r.id)).toEqual(next.map((b) => b.id));
  });

  it('says how long the day has left', () => {
    const book = new BountyBook();
    expect(book.view(D, at(D, 23)).resetIn).toBe(3_600_000);
    expect(book.view(D, at(D, 0)).resetIn).toBe(DAY_MS);
  });

  it('is kept and read back, for the same day', () => {
    const book = new BountyBook();
    book.add(D, easy.stat, easy.goal);
    book.add(D, hard.stat, 1);
    const copy = new BountyBook();
    copy.loadJSON(JSON.parse(JSON.stringify(book.toJSON())));
    expect(copy.view(D, at(D))).toEqual(book.view(D, at(D)));
    // the finished one does not finish again after a restart
    expect(copy.add(D, easy.stat, 5).map((b) => b.id)).not.toContain(easy.id);
  });

  it('is forgotten when the save is of another day, and reads nothing it does not know', () => {
    const book = new BountyBook();
    book.add(D, easy.stat, easy.goal);
    const copy = new BountyBook();
    copy.loadJSON(book.toJSON());
    expect(copy.view(D + 1, at(D + 1)).rows.some((r) => r.done)).toBe(false);
    const junk = new BountyBook();
    for (const raw of [null, 5, 'x', { d: -3 }, { d: 1.5 }, { d: D, p: { nope: 9, [easy.id]: 'many' }, c: ['nope', 4] }]) {
      junk.loadJSON(raw);
      expect(junk.view(D, at(D)).rows.every((r) => !r.done && r.have === 0)).toBe(true);
    }
    // a count larger than the goal is cut down to it
    junk.loadJSON({ d: D, p: { [easy.id]: 10_000_000 } });
    expect(junk.view(D, at(D)).rows[0].have).toBe(easy.goal);
  });
});
