import { describe, expect, it } from 'vitest';
import { B, BLOCKS } from './blocks';
import { findRecipe } from './crafting';
import { I, blockDrop, blockDrops, getItem } from './items';
import { canGrowTree, growTree, treeBlocks } from './trees';
import { canStayAt } from './plants';
import { mulberry32 } from './noise';
import { makeStack, type ItemStack } from './inventory';

function sandbox(edits: Record<string, number> = {}) {
  const m = new Map(Object.entries(edits));
  return {
    getBlock: (x: number, y: number, z: number) => m.get(`${x},${y},${z}`) ?? (y < 0 ? B.STONE : y === 0 ? B.GRASS : B.AIR),
    setBlock(x: number, y: number, z: number, id: number) {
      m.set(`${x},${y},${z}`, id);
      return true;
    },
    map: m,
  };
}

const grid = (cells: (number | null)[]): (ItemStack | null)[] => cells.map((c) => (c ? makeStack(c) : null));

describe('saplings and trees', () => {
  it('a sapling needs soil and blocks nothing but a column', () => {
    const w = sandbox({ '0,1,0': B.SAPLING });
    expect(canStayAt(B.SAPLING, w, 0, 1, 0)).toBe(true);
    w.setBlock(0, 0, 0, B.STONE);
    expect(canStayAt(B.SAPLING, w, 0, 1, 0)).toBe(false);
  });

  it('grows into a tree: trunk of logs topped with leaves', () => {
    const w = sandbox({ '0,1,0': B.SAPLING });
    expect(growTree(w, 0, 1, 0, mulberry32(3))).toBe(true);
    let logs = 0;
    let leaves = 0;
    for (const id of w.map.values()) {
      if (id === B.LOG) logs++;
      if (id === B.LEAVES) leaves++;
    }
    expect(logs).toBeGreaterThanOrEqual(4);
    expect(logs).toBeLessThanOrEqual(6);
    expect(leaves).toBeGreaterThan(15);
    expect(w.getBlock(0, 1, 0)).toBe(B.LOG);
    expect(w.getBlock(0, 1 + logs, 0)).toBe(B.LEAVES);
  });

  it('does not grow when a solid block is in the way, or when it is not a sapling', () => {
    const w = sandbox({ '0,1,0': B.SAPLING, '0,5,0': B.STONE, '0,6,0': B.STONE, '0,7,0': B.STONE });
    expect(growTree(w, 0, 1, 0, mulberry32(1))).toBe(false);
    expect(w.getBlock(0, 1, 0)).toBe(B.SAPLING);
    expect(growTree(sandbox(), 0, 1, 0, mulberry32(1))).toBe(false);
  });

  it('does not grow on sand', () => {
    const w = sandbox({ '0,1,0': B.SAPLING, '0,0,0': B.SAND });
    expect(canGrowTree(w, 0, 1, 0, 4)).toBe(false);
  });

  it('leaves never replace existing solid blocks', () => {
    const w = sandbox({ '0,1,0': B.SAPLING, '2,5,0': B.STONE });
    growTree(w, 0, 1, 0, () => 0.1);
    expect(w.getBlock(2, 5, 0)).toBe(B.STONE);
  });

  it('tree shape has a log column and no leaf corners at the top', () => {
    const blocks = treeBlocks(0, 1, 0, 5, () => 0.9);
    expect(blocks.filter((b) => !b.leaf)).toHaveLength(5);
    expect(blocks.some((b) => b.leaf && b.y === 6 && Math.abs(b.x) === 1 && Math.abs(b.z) === 1)).toBe(false);
  });
});

describe('bow items', () => {
  it('crafts a bow from sticks and string', () => {
    const r = findRecipe(grid([null, I.STICK, I.STRING, I.STICK, null, I.STRING, null, I.STICK, I.STRING]), 3, 3)!;
    expect(r.result).toEqual({ id: I.BOW, count: 1 });
  });

  it('crafts four arrows from flint, a stick and a feather substitute (bone)', () => {
    const r = findRecipe(grid([null, I.FLINT, null, null, I.STICK, null, null, I.BONE, null]), 3, 3)!;
    expect(r.result).toEqual({ id: I.ARROW, count: 4 });
  });

  it('the bow is a single, wearable item', () => {
    const bow = getItem(I.BOW);
    expect(bow.maxStack).toBe(1);
    expect(bow.durability).toBeGreaterThan(0);
    expect(getItem(B.SAPLING).durability).toBe(0);
  });

  it('leaves sometimes drop saplings and apples; gravel sometimes flint', () => {
    const leaf = BLOCKS[B.LEAVES];
    expect(blockDrop(leaf, null, () => 0.01)).toEqual({ id: I.APPLE, count: 1 });
    expect(blockDrop(leaf, null, () => 0.08)).toEqual({ id: B.SAPLING, count: 1 });
    expect(blockDrop(leaf, null, () => 0.9)).toBeNull();
    const gravel = BLOCKS[B.GRAVEL];
    expect(blockDrop(gravel, null, () => 0.05)).toEqual({ id: I.FLINT, count: 1 });
    expect(blockDrop(gravel, null, () => 0.5)).toEqual({ id: B.GRAVEL, count: 1 });
    expect(blockDrops(BLOCKS[B.LEAVES], null, () => 0.08)[0].id).toBe(B.SAPLING);
  });
});
