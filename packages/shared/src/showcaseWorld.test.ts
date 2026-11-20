import { describe, expect, it } from 'vitest';
import { B, BLOCKS, CHUNK_SIZE, SHOWCASE_BOX, SHOWCASE_FLOOR, SHOWCASE_HEIGHT, blockIndex, isWorldKind, makeGenerator, showcaseFind, showcaseLayout } from './index';

describe('the block showcase', () => {
  const gen = makeGenerator(1, 'showcase');
  const at = (x: number, y: number, z: number): number => {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    return gen.generateChunk(cx, cz)[blockIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)];
  };

  it('is a world kind of its own', () => {
    expect(isWorldKind('showcase')).toBe(true);
    expect(gen.kind).toBe('showcase');
  });

  it('has one box of every full block, and nothing else of the kind is missing', () => {
    const boxes = showcaseLayout();
    expect(new Set(boxes.map((b) => b.id)).size).toBe(boxes.length);
    expect(boxes.length).toBeGreaterThan(50);
    for (const b of boxes) {
      expect(BLOCKS[b.id].shape).toBe('cube');
      expect(BLOCKS[b.id].liquid).toBe(false);
    }
    expect(showcaseFind('grass')?.id).toBe(B.GRASS);
  });

  it('fills each box, ten wide and ten long and four high, with its own block, and leaves the gaps empty', () => {
    for (const b of showcaseLayout().slice(0, 12)) {
      const top = SHOWCASE_FLOOR + SHOWCASE_HEIGHT;
      for (const [dx, dz] of [[0, 0], [SHOWCASE_BOX - 1, 0], [0, SHOWCASE_BOX - 1], [SHOWCASE_BOX - 1, SHOWCASE_BOX - 1], [4, 5]]) {
        expect(at(b.x + dx, SHOWCASE_FLOOR + 1, b.z + dz)).toBe(b.id);
        expect(at(b.x + dx, top, b.z + dz)).toBe(b.id);
        expect(at(b.x + dx, top + 1, b.z + dz)).toBe(B.AIR);
      }
      expect(at(b.x + SHOWCASE_BOX, SHOWCASE_FLOOR + 1, b.z)).toBe(B.AIR);
      expect(at(b.x + SHOWCASE_BOX, SHOWCASE_FLOOR, b.z)).toBe(B.STONE);
    }
  });

  it('has a spawn on the floor and void beyond it', () => {
    const s = gen.findSpawn();
    expect(at(Math.floor(s.x), Math.floor(s.y) - 1, Math.floor(s.z))).toBe(B.STONE);
    expect(at(-1, SHOWCASE_FLOOR, 0)).toBe(B.AIR);
  });
});
