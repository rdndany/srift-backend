import { describe, expect, it } from 'vitest';
import { AdventureWorldGenerator, BIOME_NAMES, WorldGenerator, caveKindHere, placeNameAt } from './index';

const gen = new WorldGenerator(1337);

/** Some column of the world and the natural height of its ground. */
function column(x = 300, z = 200) {
  return { x, z, h: gen.columnAt(x, z).height, biome: gen.columnAt(x, z).biome };
}

describe('the name of a place', () => {
  it('is the biome on the ground', () => {
    const c = column();
    expect(placeNameAt(gen, c.x + 0.5, c.h + 1, c.z + 0.5)).toBe(BIOME_NAMES[c.biome]);
  });

  it('does not take a room on the ground for a cave, however tall', () => {
    // Searching for a column in lush country is not needed: a spot at the ground, or any height above it, is never a cave.
    for (let dx = 0; dx < 800; dx += 37) {
      const c = column(dx, dx * 2 - 300);
      for (const above of [0, 1, 3, 8]) expect(caveKindHere(gen, c.x, c.h + above, c.z)).toBe('plain');
    }
  });

  it('is a kind of cave well under the ground, and "Caves" in a plain one', () => {
    let lush = 0;
    let dripstone = 0;
    let plain = 0;
    for (let x = -600; x < 600 && lush * dripstone === 0; x += 23) {
      for (let z = -600; z < 600; z += 41) {
        const h = gen.columnAt(x, z).height;
        const y = Math.max(8, h - 20);
        const kind = caveKindHere(gen, x, y, z);
        const name = placeNameAt(gen, x, y, z);
        if (kind === 'lush') {
          lush++;
          expect(name).toBe('Lush Cave');
        } else if (kind === 'dripstone') {
          dripstone++;
          expect(name).toBe('Dripstone Cave');
        } else if (kind === 'plain') {
          plain++;
          expect(['Caves', 'The Deep Dark']).toContain(name);
        }
      }
    }
    expect(plain + lush + dripstone).toBeGreaterThan(0);
  });

  it('is the place of the Adventure world where it has one, and never a cave there', () => {
    const adv = new AdventureWorldGenerator(1337);
    const y = adv.columnAt(0, 0).height;
    expect(caveKindHere(adv, 0, y - 30, 0, true)).toBe('plain');
    expect(placeNameAt(adv, 0, y + 1, 0, true)).toMatch(/Dawnwatch|The Undercroft|Training Yard/);
  });
});
