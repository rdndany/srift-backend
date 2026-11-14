import { describe, expect, it } from 'vitest';
import { MODES, modeOfSave, parseSeed, randomSeed, startOptionsFor, timeAgo } from './modes';

describe('the game modes on the title screen', () => {
  it('are survival, creative and hardcore, with the promised taglines', () => {
    expect(MODES.map((m) => m.id)).toEqual(['survival', 'creative', 'hardcore']);
    expect(MODES.map((m) => m.tagline)).toEqual(['The classic experience', 'Unlimited building', 'Extreme difficulty']);
  });

  it('never promise things the game does not have', () => {
    const all = JSON.stringify(MODES).toLowerCase();
    expect(all).not.toContain('nether');
    expect(all).not.toContain('the end');
    expect(all).not.toContain('villager');
    expect(all).toContain('caves and villages');
  });

  it('give each card something to say in every section', () => {
    for (const m of MODES) {
      expect(m.blurb.length).toBeGreaterThan(10);
      expect(m.can.length).toBeGreaterThan(0);
      expect(m.mechanics.length).toBeGreaterThan(0);
      expect(m.bestFor.length).toBeGreaterThan(10);
    }
  });

  it('map to the engine: hardcore is survival with one life', () => {
    expect(startOptionsFor('survival')).toEqual({ mode: 'survival', hardcore: false });
    expect(startOptionsFor('creative')).toEqual({ mode: 'creative', hardcore: false });
    expect(startOptionsFor('hardcore')).toEqual({ mode: 'survival', hardcore: true });
  });

  it('tell a saved world which card it belongs on', () => {
    expect(modeOfSave({ mode: 'survival' })).toBe('survival');
    expect(modeOfSave({ mode: 'creative' })).toBe('creative');
    expect(modeOfSave({ mode: 'survival', hardcore: true })).toBe('hardcore');
  });
});

describe('seeds', () => {
  it('a number is itself', () => {
    expect(parseSeed('1337')).toBe(1337);
    expect(parseSeed('  42 ')).toBe(42);
    expect(parseSeed('-5')).toBe(-5);
  });

  it('words always give the same world', () => {
    expect(parseSeed('glacier')).toBe(parseSeed('glacier'));
    expect(parseSeed('glacier')).not.toBe(parseSeed('glaciers'));
    const n = parseSeed('a very long seed phrase that is not a number');
    expect(Number.isInteger(n) && n > 0 && n < 2 ** 31).toBe(true);
  });

  it('a number too big to be exact is treated as text, and zero is avoided', () => {
    expect(parseSeed('99999999999999999999')).toBeLessThan(2 ** 31);
    expect(parseSeed('0')).toBe(1);
  });

  it('empty means a random seed', () => {
    expect(parseSeed('', () => 0.5)).toBe(randomSeed(() => 0.5));
    const s = randomSeed();
    expect(Number.isInteger(s) && s >= 1 && s < 2 ** 31).toBe(true);
  });
});

describe('timeAgo', () => {
  const now = 1_000_000_000_000;
  it('speaks plainly', () => {
    expect(timeAgo(now - 5_000, now)).toBe('just now');
    expect(timeAgo(now - 60_000, now)).toBe('1 minute ago');
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5 minutes ago');
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe('3 hours ago');
    expect(timeAgo(now - 2 * 86_400_000, now)).toBe('2 days ago');
    expect(timeAgo(null, now)).toBe('a while ago');
  });
});
