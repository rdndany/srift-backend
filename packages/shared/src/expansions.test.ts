import { describe, expect, it } from 'vitest';
import { EXPANSIONS, GAME_TITLE, expansionById, expansionTitle, liveExpansions, nextExpansion } from './expansions';

describe('expansions', () => {
  it('starts with the core game and numbers the rest in release order', () => {
    expect(EXPANSIONS[0].id).toBe('core');
    expect(EXPANSIONS[0].subtitle).toBeNull();
    EXPANSIONS.forEach((e, i) => expect(e.order).toBe(i));
  });

  it('has unique, URL-safe ids', () => {
    const ids = EXPANSIONS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it('names every expansion after the game', () => {
    expect(GAME_TITLE).toBe('SolRift');
    expect(expansionTitle(EXPANSIONS[0])).toBe('SolRift');
    expect(expansionTitle(expansionById('hollow-king')!)).toBe('SolRift: Embers of the Hollow King');
    for (const e of EXPANSIONS) expect(e.title).toBe(GAME_TITLE);
  });

  it('never calls content playable before its expansion is live', () => {
    for (const e of EXPANSIONS) {
      if (e.status !== 'live') expect(e.content.every((c) => !c.playable)).toBe(true);
      else expect(e.content.every((c) => c.playable)).toBe(true);
    }
  });

  it('gives every expansion something to show and a colour', () => {
    for (const e of EXPANSIONS) {
      expect(e.content.length).toBeGreaterThan(0);
      expect(e.accent).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('finds what is playable and what comes next', () => {
    expect(liveExpansions().map((e) => e.id)).toEqual(['core', 'hollow-king']);
    expect(nextExpansion()?.id).toBe('drowned-throne');
    expect(expansionById('nope')).toBeUndefined();
  });
});
