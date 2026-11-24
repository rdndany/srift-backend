import { describe, expect, it } from 'vitest';
import { B, HOUR_MS } from './index';
import { landKit, type Kit } from './landTestKit';

const BUILDER = 'hero-builder';
const FOE = 'hero-foe';

/** Put a small house (a floor and walls, 60+ blocks) on the ground at (x, z), the way it was built before there was land: nobody told the land. */
function oldHouse(k: Kit, x: number, z: number): number {
  const hook = k.world.onChange;
  k.world.onChange = null;
  const y = k.world.surfaceY(x, z) + 1;
  for (let dx = 0; dx < 7; dx++) {
    for (let dz = 0; dz < 7; dz++) {
      k.world.setBlock(x + dx, y, z + dz, B.PLANKS);
      if (dx === 0 || dz === 0 || dx === 6 || dz === 6) {
        k.world.setBlock(x + dx, y + 1, z + dz, B.PLANKS);
        k.world.setBlock(x + dx, y + 2, z + dz, B.PLANKS);
      }
    }
  }
  k.world.onChange = hook;
  return y;
}
const scan = (k: Kit, min = 40) => k.land.scanLegacy(k.world.diffAgainstTerrain(), min);

describe('builds from before there was land', () => {
  it('are found as sites, one for each house, and not mixed up with what the land already keeps', () => {
    const k = landKit();
    oldHouse(k, 600, 600);
    oldHouse(k, 700, 600);
    // A house a player builds now, in the wilderness, is the ledger's (it regenerates), and one on a claim is its owner's: neither is old.
    const y = k.world.surfaceY(800, 800) + 1;
    for (let i = 0; i < 60; i++) expect(k.edit(FOE, 800 + (i % 8), y + Math.floor(i / 8), 800, B.STONE)).toBe(true);
    const mine = k.buyer(100_000);
    expect(k.land.purchase({ account: BUILDER, ownerName: 'b', name: 'x', vertices: k.rect(900, 900, 919, 919), idem: 'idem-legacy-0001', carries: true }, mine).ok).toBe(true);
    const yy = k.world.surfaceY(905, 905) + 1;
    for (let i = 0; i < 60; i++) k.edit(BUILDER, 905 + (i % 8), yy + Math.floor(i / 8), 905, B.PLANKS);
    // A hole is not a build.
    for (let i = 0; i < 80; i++) k.world.setBlock(1000 + (i % 9), k.world.surfaceY(1000, 1000), 1000 + Math.floor(i / 9), B.AIR);
    const sites = scan(k);
    expect(sites).toHaveLength(2);
    expect(sites.map((s) => s.blocks).sort()).toEqual([sites[0].blocks, sites[1].blocks].sort());
    const boxes = sites.map((s) => s.box).sort((a, b) => a.x0 - b.x0);
    expect(boxes[0]).toMatchObject({ x0: 600, z0: 600, x1: 606, z1: 606 });
    expect(boxes[1]).toMatchObject({ x0: 700, z0: 600, x1: 706, z1: 606 });
    expect(sites.every((s) => s.blocks >= 49 + 24 * 2)).toBe(true);
    expect(sites.map((s) => s.id).sort()).toEqual([1, 2]);
  });

  it('are never put back by the wilderness, claimed or not', () => {
    const k = landKit();
    const y = oldHouse(k, 600, 600);
    k.clock.now += 5000 * HOUR_MS;
    k.land.tick();
    for (let i = 0; i < 20; i++) k.land.step(k.clock.now);
    expect(k.world.getBlock(600, y, 600)).toBe(B.PLANKS);
    expect(k.world.getBlock(603, y, 603)).toBe(B.PLANKS);
    expect(k.world.getBlock(600, y + 2, 606)).toBe(B.PLANKS);
  });

  it('can be kept free of claims until they are adopted, and a purchase over one is refused meanwhile', () => {
    const k = landKit();
    oldHouse(k, 600, 600);
    const buyer = k.buyer(100_000);
    const ask = (idem: string) => k.land.purchase({ account: FOE, ownerName: 'foe', name: 'x', vertices: k.rect(595, 595, 614, 614), idem, carries: true }, buyer);
    // Before anything is done about it, the old house would go to whoever buys the ground.
    const sites = scan(k);
    expect(sites).toHaveLength(1);
    expect(k.land.reserveLegacy('boss')).toBe(1);
    expect(k.land.reserveLegacy('boss')).toBe(0);
    const refused = ask('idem-legacy-0002');
    expect(refused.ok).toBe(false);
    expect(refused.code).toBe('protected');
    expect(buyer.coins).toBe(100_000);
  });

  it('are handed to the one who built them: for nothing, with the blocks as they are, and nobody else may touch them after', () => {
    const k = landKit();
    const y = oldHouse(k, 600, 600);
    const [site] = scan(k);
    k.land.reserveLegacy('boss');
    const claimsBefore = k.land.index.size;
    const r = k.land.adopt('boss', { account: BUILDER, ownerName: 'Builder', name: 'The old house', vertices: rectOf(k, k.land.siteBox(site)) });
    expect(r.ok).toBe(true);
    expect(k.land.index.size).toBe(claimsBefore + 1);
    const c = k.land.index.claimAt(603, 603)!;
    expect(c.ownerId).toBe(BUILDER);
    expect(c.paid).toBe(0);
    expect(c.name).toBe('The old house');
    // The house is exactly as it was, and now it is protected.
    expect(k.world.getBlock(603, y, 603)).toBe(B.PLANKS);
    expect(k.edit(FOE, 603, y, 603, B.AIR)).toBe(false);
    expect(k.edit(BUILDER, 603, y + 5, 603, B.PLANKS)).toBe(true);
    // The place kept for it is free no more, and the list of old builds no longer has it.
    expect(k.land.reserved().filter((x) => x.legacy)).toHaveLength(0);
    expect(scan(k)).toHaveLength(0);
    // Letting it go gives nothing back (nothing was paid).
    const rel = k.land.release(BUILDER, c.id);
    expect(rel.ok).toBe(true);
    k.clock.now += 100 * HOUR_MS;
    k.land.tick();
    expect(c.status).toBe('released');
  });

  it('are recorded: a transaction of nothing, a line in the log, and a copy of the claims taken first', () => {
    const k = landKit();
    oldHouse(k, 600, 600);
    const b = k.buyer(100_000);
    expect(k.land.purchase({ account: FOE, ownerName: 'foe', name: 'x', vertices: k.rect(800, 800, 819, 819), idem: 'idem-legacy-0003', carries: true }, b).ok).toBe(true);
    const [site] = scan(k);
    const r = k.land.adopt('boss', { account: BUILDER, ownerName: 'Builder', name: 'Home', vertices: rectOf(k, k.land.siteBox(site)) });
    expect(r.ok).toBe(true);
    const tx = [...k.store.txns.values()].filter((t) => t.kind === 'adopt');
    expect(tx).toHaveLength(1);
    expect(tx[0]).toMatchObject({ amount: 0, state: 'committed', playerKey: BUILDER });
    expect(k.land.adminLog(5).some((l) => l.action === 'adopt' && l.admin === 'boss')).toBe(true);
    const backups = k.land.backups();
    expect(backups).toHaveLength(1);
    expect(backups[0].claims).toBe(1); // the claim there was before: the foe's
    k.land.flush();
    const again = k.restart();
    expect(again.index.claimAt(603, 603)?.ownerId).toBe(BUILDER);
  });

  it('are not given away over somebody else\u2019s land or the world\u2019s own places, and a bad rectangle is refused as it is for a purchase', () => {
    const k = landKit();
    oldHouse(k, 600, 600);
    const b = k.buyer(100_000);
    expect(k.land.purchase({ account: FOE, ownerName: 'foe', name: 'x', vertices: k.rect(590, 590, 609, 609), idem: 'idem-legacy-0004', carries: true }, b).ok).toBe(true);
    const [site] = scan(k, 1);
    expect(site).toBeUndefined();
    const over = k.land.adopt('boss', { account: BUILDER, ownerName: 'Builder', name: 'x', vertices: k.rect(600, 600, 620, 620) });
    expect(over.ok).toBe(false);
    expect(over.code).toBe('overlap');
    const bad = k.land.adopt('boss', { account: BUILDER, ownerName: 'Builder', name: 'x', vertices: [[0, 0], [1, 1]] });
    expect(bad.ok).toBe(false);
    expect(k.land.adopt('boss', { account: '', ownerName: 'x', name: 'x', vertices: k.rect(1500, 1500, 1520, 1520) }).ok).toBe(false);
  });
});

function rectOf(k: Kit, b: { x0: number; z0: number; x1: number; z1: number }): [number, number][] {
  return k.rect(b.x0, b.z0, b.x1, b.z1);
}
