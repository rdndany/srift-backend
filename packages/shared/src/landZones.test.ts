import { describe, expect, it } from 'vitest';
import { HUB_HALF, OUTPOSTS, parseLandCommand } from './index';
import { landKit } from './landTestKit';

describe("the server's own territory, as it is told to a client", () => {
  it('lists the made places round a player by name, with their corners, and agrees with what is protected', () => {
    const k = landKit({}, 'adventure');
    const g = k.land.protectedNear(0, 0, 120);
    const town = g.find((z) => z.name === 'Dawnwatch');
    expect(town).toBeDefined();
    expect(town!.kind).toBe('town');
    expect(town!.box).toEqual([-HUB_HALF, -HUB_HALF, HUB_HALF - 1, HUB_HALF - 1]);
    expect(town!.vertices).toHaveLength(4);
    // The chapel is within reach too; the outposts far away are not.
    expect(g.some((z) => z.name === 'The Chapel Ruin')).toBe(true);
    expect(g.some((z) => z.name === 'Greykeep')).toBe(false);
    // Every corner of what is listed is ground the generator really protects, and just outside is not (for the town).
    const gen = (k.land as unknown as { o: { generator: { isProtected(x: number, y: number, z: number): boolean } } }).o.generator;
    for (const [x, z] of town!.vertices) expect(gen.isProtected(x, 60, z)).toBe(true);
    expect(gen.isProtected(-HUB_HALF - 1, 60, 0)).toBe(false);
    expect(gen.isProtected(HUB_HALF, 60, 0)).toBe(false);
  });

  it('has every outpost and vault, from the far side of the map', () => {
    const k = landKit({}, 'adventure');
    const all = k.land.protectedNear(0, 0, 1000);
    for (const o of OUTPOSTS) expect(all.some((z) => z.name === o.name)).toBe(true);
    for (const n of ['The Reed Grotto', 'The Sand Crypt', 'The Frost Vault']) expect(all.some((z) => z.name === n)).toBe(true);
    // The list is short enough to send and every id is its own.
    expect(all.length).toBeLessThanOrEqual(24);
    expect(new Set(all.map((z) => z.id)).size).toBe(all.length);
  });

  it('adds the places an administrator reserved, and leaves the old builds that are only kept free for their builders out', () => {
    const k = landKit();
    expect(k.land.protectedNear(500, 500, 100)).toHaveLength(0);
    k.land.reserve('boss', 'Market', { x0: 480, z0: 480, x1: 520, z1: 520 });
    const z = k.land.protectedNear(500, 500, 100);
    expect(z).toHaveLength(1);
    expect(z[0]).toMatchObject({ name: 'Market', kind: 'reserved', box: [480, 480, 520, 520] });
    k.land.reserve('boss', 'Old house', { x0: 600, z0: 600, x1: 610, z1: 610 }, true);
    expect(k.land.protectedNear(600, 600, 50).some((x) => x.name === 'Old house')).toBe(false);
    // Far away it is not in the list.
    expect(k.land.protectedNear(5000, 5000, 100)).toHaveLength(0);
  });

  it('is nothing in a world with no such places, and a client cannot ask for more than its own surroundings', () => {
    const k = landKit();
    expect(k.land.protectedNear(0, 0, 500)).toHaveLength(0);
    expect(parseLandCommand({ a: 'zones' })).toBeNull();
  });
});
