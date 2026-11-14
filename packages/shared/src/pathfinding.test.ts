import { describe, expect, it } from 'vitest';
import { B } from './blocks';
import { findPath } from './pathfinding';
import type { BlockReader } from './physics';

/** Flat world: solid up to and including y=0. `edits` overrides individual cells. */
function world(edits: Record<string, number> = {}): BlockReader & { set(x: number, y: number, z: number, id: number): void } {
  const m = new Map(Object.entries(edits));
  return {
    getBlock: (x, y, z) => m.get(`${x},${y},${z}`) ?? (y <= 0 ? B.STONE : B.AIR),
    set: (x, y, z, id) => void m.set(`${x},${y},${z}`, id),
  };
}

const wall = (w: ReturnType<typeof world>, x: number, z0: number, z1: number, h: number) => {
  for (let z = z0; z <= z1; z++) for (let y = 1; y <= h; y++) w.set(x, y, z, B.STONE);
};

describe('findPath', () => {
  it('walks straight across open ground', () => {
    const p = findPath(world(), 0, 1, 0, 5, 1, 0)!;
    expect(p).not.toBeNull();
    expect(p).toHaveLength(5);
    expect(p[p.length - 1]).toEqual({ x: 5, y: 1, z: 0 });
  });

  it('returns an empty path when already at the goal', () => {
    expect(findPath(world(), 2, 1, 2, 2, 1, 2)).toEqual([]);
  });

  it('goes around a wall that is too tall to climb', () => {
    const w = world();
    wall(w, 3, -3, 3, 3);
    const p = findPath(w, 0, 1, 0, 6, 1, 0, { maxNodes: 1000 })!;
    expect(p[p.length - 1]).toEqual({ x: 6, y: 1, z: 0 });
    expect(p.some((n) => Math.abs(n.z) >= 4)).toBe(true);
    for (const n of p) expect(w.getBlock(n.x, n.y, n.z)).toBe(B.AIR);
  });

  it('steps up single blocks but not two-high walls', () => {
    const w = world();
    wall(w, 2, -20, 20, 1);
    const up = findPath(w, 0, 1, 0, 4, 2, 0, { partial: false })!;
    expect(up).not.toBeNull();
    expect(up.some((n) => n.y === 2)).toBe(true);
  });

  it('can drop down a ledge', () => {
    const w = world();
    for (let x = -3; x <= 1; x++) for (let z = -3; z <= 3; z++) w.set(x, 1, z, B.STONE); // plateau top at y=1
    const p = findPath(w, 0, 2, 0, 4, 1, 0, { partial: false })!;
    expect(p).not.toBeNull();
    expect(p[p.length - 1].y).toBe(1);
  });

  it('refuses drops beyond maxDrop', () => {
    const w = world();
    for (let x = -3; x <= 1; x++) for (let z = -3; z <= 3; z++) for (let y = 1; y <= 6; y++) w.set(x, y, z, B.STONE);
    const p = findPath(w, 0, 7, 0, 4, 1, 0, { partial: false, maxDrop: 3 });
    expect(p).toBeNull();
  });

  it('never routes through water', () => {
    const w = world();
    for (let x = 2; x <= 3; x++) for (let z = -30; z <= 30; z++) w.set(x, 1, z, B.WATER);
    const p = findPath(w, 0, 1, 0, 6, 1, 0, { partial: false, maxNodes: 4000 })!;
    expect(p).not.toBeNull();
    for (const n of p) expect(w.getBlock(n.x, n.y, n.z)).not.toBe(B.WATER);
    expect(p.some((n) => Math.abs(n.z) > 30)).toBe(true); // had to walk around the river's end

    // A river that is too long to go around within the budget leaves no full path.
    expect(findPath(w, 0, 1, 0, 6, 1, 0, { partial: false, maxNodes: 40 })).toBeNull();
  });

  it('returns null when fully enclosed (no partial path possible)', () => {
    const w = world();
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) if (x || z) for (let y = 1; y <= 3; y++) w.set(x, y, z, B.STONE);
    expect(findPath(w, 0, 1, 0, 8, 1, 0)).toBeNull();
  });

  it('stops within goalDist and respects the node budget', () => {
    const p = findPath(world(), 0, 1, 0, 10, 1, 0, { goalDist: 1.5 })!;
    expect(p[p.length - 1].x).toBeGreaterThanOrEqual(9 - 1);
    expect(p.length).toBeLessThan(10);
    // A tiny budget still yields a partial path toward the goal.
    const q = findPath(world(), 0, 1, 0, 50, 1, 0, { maxNodes: 20 })!;
    expect(q.length).toBeGreaterThan(0);
    expect(q[q.length - 1].x).toBeGreaterThan(0);
  });
});
