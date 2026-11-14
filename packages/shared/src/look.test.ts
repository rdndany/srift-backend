import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, LOOK_COUNT, LOOK_SIZES, cleanPlayerName, lookCode, lookFromName, normalizeLook, parseLookCode, playerNameProblem, randomLook, sameLook } from './look';

describe('look codes', () => {
  it('round-trip every look', () => {
    for (let code = 0; code < LOOK_COUNT; code += 7) expect(lookCode(parseLookCode(code)!)).toBe(code);
    expect(lookCode(parseLookCode(LOOK_COUNT - 1)!)).toBe(LOOK_COUNT - 1);
  });

  it('keep the default look at a stable code', () => {
    expect(parseLookCode(lookCode(DEFAULT_LOOK))).toEqual(DEFAULT_LOOK);
  });

  it('reject anything that is not a code', () => {
    for (const bad of [-1, 1.5, LOOK_COUNT, Number.NaN, Infinity, '5', null, undefined, {}]) expect(parseLookCode(bad)).toBeNull();
  });

  it('force picks into their lists', () => {
    const look = normalizeLook({ skin: 99, hair: -4, style: 1.9, eyes: Number.NaN });
    expect(look.skin).toBe(LOOK_SIZES.skin - 1);
    expect(look.hair).toBe(0);
    expect(look.style).toBe(1);
    expect(look.eyes).toBe(DEFAULT_LOOK.eyes);
  });

  it('draw a random look inside the lists', () => {
    for (let i = 0; i < 50; i++) {
      const l = randomLook();
      expect(parseLookCode(lookCode(l))).toEqual(l);
    }
  });

  it('give the same stranger for the same name, and different ones for different names', () => {
    expect(sameLook(lookFromName('alice'), lookFromName('alice'))).toBe(true);
    const codes = new Set(['alice', 'bob', 'carol', 'dave', 'erin', 'frank', 'grace', 'heidi'].map((n) => lookCode(lookFromName(n))));
    expect(codes.size).toBeGreaterThan(5);
  });
});

describe('player names', () => {
  it('are cleaned', () => {
    expect(cleanPlayerName('  Al<b>ice!!  ')).toBe('Albice');
    expect(cleanPlayerName('a    b')).toBe('a b');
    expect(cleanPlayerName('x'.repeat(40))).toHaveLength(16);
  });

  it('are checked', () => {
    expect(playerNameProblem('Alice')).toBeNull();
    expect(playerNameProblem('Sir Bob_2')).toBeNull();
    expect(playerNameProblem('ab')).not.toBeNull();
    expect(playerNameProblem('a<b>c')).not.toBeNull();
    expect(playerNameProblem('..._')).not.toBeNull();
    expect(playerNameProblem('x'.repeat(30))).not.toBeNull();
  });
});
