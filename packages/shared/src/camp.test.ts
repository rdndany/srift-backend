import { describe, expect, it } from 'vitest';
import { DAILY_BASE, DAILY_CAP_DAYS, DAILY_STEP, EXPEDITIONS, WINGS_TIME_BONUS, campView, dailyCoins, dailyGift, emptyCamp, expeditionById, parseCamp, startTrip, streakOn, tripBlocker, tripMs, tripResult } from './camp';
import { DAY_MS } from './bounties';

describe('the Camp rules', () => {
  it('pays more for each day in a row, up to a cap, with a gift every seventh day', () => {
    expect(dailyCoins(1)).toBe(DAILY_BASE);
    expect(dailyCoins(2)).toBe(DAILY_BASE + DAILY_STEP);
    expect(dailyCoins(DAILY_CAP_DAYS)).toBe(DAILY_BASE + DAILY_STEP * (DAILY_CAP_DAYS - 1));
    expect(dailyCoins(50)).toBe(dailyCoins(DAILY_CAP_DAYS));
    expect(dailyCoins(-3)).toBe(DAILY_BASE);
    expect(dailyGift(6)).toBeNull();
    expect(dailyGift(7)).not.toBeNull();
    expect(dailyGift(14)).not.toBeNull();
    expect(dailyGift(0)).toBeNull();
  });

  it('keeps a streak going only when the last check-in was yesterday', () => {
    expect(streakOn(10, -1, 0)).toBe(1);
    expect(streakOn(10, 9, 3)).toBe(4);
    expect(streakOn(10, 8, 3)).toBe(1);
    expect(streakOn(10, 10, 3)).toBe(3);
  });

  it('makes a trip shorter with wings, and gives the same result for the same trip every time', () => {
    for (const e of EXPEDITIONS) expect(tripMs(e, true)).toBeLessThan(tripMs(e, false));
    expect(tripMs(EXPEDITIONS[0], true)).toBe(Math.round(EXPEDITIONS[0].minutes * 60_000 * (1 - WINGS_TIME_BONUS)));
    const trip = { id: EXPEDITIONS[1].id, start: 0, end: 1, seed: 99, pet: false };
    expect(tripResult(EXPEDITIONS[1], trip)).toEqual(tripResult(EXPEDITIONS[1], trip));
    const r = tripResult(EXPEDITIONS[1], trip);
    expect(r.coins).toBeGreaterThanOrEqual(EXPEDITIONS[1].coins[0]);
    expect(r.coins).toBeLessThanOrEqual(Math.ceil(EXPEDITIONS[1].coins[1] * 1.5));
  });

  it('refuses a trip that cannot be made', () => {
    const def = expeditionById('hollow');
    expect(tripBlocker(def, 1, null)).toMatch(/level/);
    expect(tripBlocker(def, 99, null)).toBeNull();
    expect(tripBlocker(undefined, 99, null)).toMatch(/no such/);
    const t = startTrip(EXPEDITIONS[0], 0, false, false, 5);
    expect(tripBlocker(EXPEDITIONS[0], 99, t)).toMatch(/already/);
  });

  it('reads a damaged saved state as an empty one, and never trusts its numbers', () => {
    expect(parseCamp(null)).toEqual(emptyCamp());
    expect(parseCamp('nonsense')).toEqual(emptyCamp());
    const bad = parseCamp({ v: 1, lastDay: 'x', streak: -5, trips: { a: { id: 'nope', start: 1, end: 2, seed: 1, pet: true }, b: 7 } });
    expect(bad.lastDay).toBeLessThan(0);
    expect(bad.streak).toBe(0);
    expect(Object.keys(bad.trips)).not.toContain('b');
  });

  it('shows what a check-in would be, and a finished trip with its result', () => {
    const now = 20 * DAY_MS + 5000;
    const fresh = campView(emptyCamp(), 'h', now);
    expect(fresh.daily.can).toBe(true);
    expect(fresh.daily.coins).toBe(DAILY_BASE);
    expect(fresh.trip).toBeNull();
    const s = emptyCamp();
    s.trips.h = startTrip(EXPEDITIONS[0], now - 3_600_000, false, false, 5);
    const done = campView(s, 'h', now);
    expect(done.trip?.done).toBe(true);
    expect(done.trip?.result).not.toBeNull();
    const s2 = emptyCamp();
    s2.trips.h = startTrip(EXPEDITIONS[0], now, false, false, 5);
    const going = campView(s2, 'h', now);
    expect(going.trip?.done).toBe(false);
    expect(going.trip?.result).toBeNull();
  });
});
