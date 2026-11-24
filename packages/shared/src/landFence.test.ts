import { describe, expect, it } from 'vitest';
import { B, gateInfo, signInfo } from './blocks';
import { boundaryCells, fenceHeight, ownerSignLines, planFence } from './landFence';
import { landKit, type Kit } from './landTestKit';
import type { LandClaim } from './landClaims';
import type { Polygon } from './landGeometry';

const ME = 'acct-me';
const FOE = 'acct-foe';

function buy(k: Kit, x: number, z: number, size = 20, reach?: { x: number; z: number }, who = ME): LandClaim {
  const r = k.land.purchase({ account: who, ownerName: 'Ilia', name: 'Home', vertices: k.rect(x, z, x + size - 1, z + size - 1), idem: `idem-${who}-${x}-${z}`, carries: true, ...(reach ? { reach } : {}) }, k.buyer(1_000_000));
  if (!r.ok) throw new Error(`${r.code} ${r.text}`);
  return k.land.index.get(r.claim!.id)!;
}

/** A shape given by its blocks: the polygon a claim of that shape would have (box, mask, area). */
function shape(rows: string[]): Polygon {
  const h = rows.length;
  const w = rows[0].length;
  const mask = new Uint8Array(w * h);
  let area = 0;
  rows.forEach((row, z) => [...row].forEach((c, x) => {
    if (c === '#') {
      mask[z * w + x] = 1;
      area++;
    }
  }));
  return { pts: [], box: { x0: 0, z0: 0, x1: w - 1, z1: h - 1 }, w, h, mask, area } as Polygon;
}

/** True when nobody can walk from outside into the claim without crossing the fence (the gate counts as a way through only for its owner: it is on the line). */
function sealed(poly: Polygon, line: Set<string>): boolean {
  const inside = (x: number, z: number) => x >= 0 && z >= 0 && x < poly.w && z < poly.h && poly.mask[z * poly.w + x] === 1;
  const seen = new Set<string>();
  const stack: [number, number][] = [[-1, -1]];
  while (stack.length) {
    const [x, z] = stack.pop()!;
    const k = `${x},${z}`;
    if (seen.has(k) || line.has(k) || x < -1 || z < -1 || x > poly.w || z > poly.h) continue;
    if (inside(x, z)) return false;
    seen.add(k);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) stack.push([x + dx, z + dz]);
  }
  return true;
}

describe('the ring round a claim', () => {
  it('is the blocks along the edge of a rectangle, and nothing inside', () => {
    const ring = boundaryCells(shape(['######', '######', '######', '######']));
    expect(ring).toHaveLength(16);
    expect(ring.some(([x, z]) => x > 0 && x < 5 && z > 0 && z < 3)).toBe(false);
  });

  it('has no gap in an L, a diamond or a ragged shape', () => {
    for (const rows of [
      ['####....', '####....', '########', '########'],
      ['...##...', '..####..', '.######.', '########', '.######.', '..####..', '...##...'],
      ['###.###', '#######', '.#####.', '..###..', '...#...'],
    ]) {
      const poly = shape(rows);
      const plan = planFence(poly, { x: 0, z: 0 });
      const line = new Set(boundaryCells(poly).map(([x, z]) => `${x},${z}`));
      expect(sealed(poly, line)).toBe(true);
      // Fence, gate and sign together are the ring.
      expect(plan.cells.length + (plan.gate ? 1 : 0) + (plan.sign ? 1 : 0)).toBe(line.size);
    }
  });

  it('puts the gate on a straight stretch near the buyer, the sign beside it with its writing outward', () => {
    const poly = shape(['##########', '##########', '##########', '##########', '##########', '##########']);
    const plan = planFence(poly, { x: 5, z: 10 });
    expect(plan.gate).not.toBeNull();
    expect(plan.sign).not.toBeNull();
    // The buyer is south of the claim (z 10), so the gate is on its south edge.
    expect(plan.gate!.at[1]).toBe(5);
    expect(Math.abs(plan.gate!.at[0] - 5)).toBeLessThanOrEqual(1);
    expect(plan.gate!.facing).toBe(2);
    expect(plan.sign!.at[1]).toBe(5);
    expect(Math.abs(plan.sign!.at[0] - plan.gate!.at[0])).toBe(1);
  });

  it('writes whose it is, and the name of the claim when it was given one', () => {
    expect(ownerSignLines('Ilia', 'Home', 'Ilia\u2019s Land')).toEqual(['Property of', 'Ilia', '', 'Home']);
    expect(ownerSignLines('Ilia', 'Ilia\u2019s Land', 'Ilia\u2019s Land')).toEqual(['Property of', 'Ilia', '', '']);
    expect(ownerSignLines('A very long name of a player', '', 'x')[1]).toHaveLength(15);
  });
});

describe('after a purchase', () => {
  const lines = new Map<string, string[]>();
  const signs = {
    setSign: (x: number, y: number, z: number, l: string[]) => void lines.set(`${x},${y},${z}`, l),
    forgetSign: (x: number, y: number, z: number) => void lines.delete(`${x},${y},${z}`),
  };

  it('fences the whole boundary on the ground, with a gate and a sign that names the owner', () => {
    lines.clear();
    const k = landKit({ fenceOnBuy: true });
    k.restart(signs);
    const c = buy(k, 500, 500, 20, { x: 510, z: 530 });
    const plan = planFence(c.polygon, { x: 510, z: 530 });
    const ring = boundaryCells(c.polygon);
    let fenced = 0;
    for (const [x, z] of plan.cells) {
      const g = c.ground[(z - c.polygon.box.z0) * c.polygon.w + (x - c.polygon.box.x0)];
      let found = false;
      for (let y = g - 4; y <= g + 6; y++) if (k.world.getBlock(x, y, z) === B.FENCE) found = true;
      if (found) fenced++;
    }
    // Everywhere a fence can stand (not in a lake) there is one.
    expect(fenced).toBeGreaterThanOrEqual(Math.floor(plan.cells.length * 0.85));
    expect(ring.length).toBe(plan.cells.length + 2);
    // The gate is closed, and across the line of the fence.
    const [gx, gz] = plan.gate!.at;
    const gy = fenceHeight({ getBlock: (x, y, z) => k.world.getBlock(x, y, z), setBlock: () => false, groundAt: () => c.ground[(gz - c.polygon.box.z0) * c.polygon.w + (gx - c.polygon.box.x0)] }, gx, gz);
    let gate = -1;
    let sign = -1;
    for (let y = 1; y < 200; y++) {
      if (gateInfo(k.world.getBlock(gx, y, gz))) gate = y;
      if (signInfo(k.world.getBlock(plan.sign!.at[0], y, plan.sign!.at[1]))) sign = y;
    }
    expect(gy).toBeGreaterThan(0); // (the gate itself stands where this finds the ground, one block lower)
    expect(gate).toBe(gy - 1);
    {
      expect(gateInfo(k.world.getBlock(gx, gate, gz))).toEqual({ open: false, facing: plan.gate!.facing });
      expect(sign).toBeGreaterThan(0);
      const info = signInfo(k.world.getBlock(plan.sign!.at[0], sign, plan.sign!.at[1]))!;
      expect(info.wall).toBe(false);
      expect(lines.get(`${plan.sign!.at[0]},${sign},${plan.sign!.at[1]}`)).toEqual(['Property of', 'Ilia', '', 'Home']);
    }
  });

  it('keeps the fence as the owner’s: a stranger cannot take it down, the owner can, and the land remembers it', () => {
    const k = landKit({ fenceOnBuy: true });
    const c = buy(k, 500, 500, 20, { x: 510, z: 530 });
    const plan = planFence(c.polygon);
    let at: [number, number, number] | null = null;
    for (const [x, z] of plan.cells) {
      for (let y = 1; y < 200 && !at; y++) if (k.world.getBlock(x, y, z) === B.FENCE) at = [x, y, z];
      if (at) break;
    }
    expect(at).not.toBeNull();
    const [x, y, z] = at!;
    expect(k.edit(FOE, x, y, z, 0)).toBe(false);
    expect(k.world.getBlock(x, y, z)).toBe(B.FENCE);
    expect(k.land.ledger.claimedCount).toBeGreaterThan(0);
    expect(k.edit(ME, x, y, z, 0)).toBe(true);
    expect(k.world.getBlock(x, y, z)).toBe(B.AIR);
  });

  it('builds nothing when the fence is off', () => {
    const k = landKit({ fenceOnBuy: false });
    const c = buy(k, 500, 500);
    expect(k.land.ledger.claimedCount).toBe(0);
    for (const [x, z] of boundaryCells(c.polygon)) for (let y = 1; y < 200; y++) expect(k.world.getBlock(x, y, z)).not.toBe(B.FENCE);
  });

  it('does not touch the buyer’s money or the deed if the world refuses a block', () => {
    const k = landKit({ fenceOnBuy: true });
    k.restart({ setBlock: () => { throw new Error('no'); } });
    const quiet = console.error;
    console.error = () => undefined;
    try {
      const b = k.buyer(1_000_000);
      const r = k.land.purchase({ account: ME, ownerName: 'Ilia', name: 'Home', vertices: k.rect(500, 500, 519, 519), idem: 'idem-fence-fail', carries: true }, b);
      expect(r.ok).toBe(true);
      expect(k.land.index.size).toBe(1);
    } finally {
      console.error = quiet;
    }
  });

  it('takes the old fence down and puts a new one round a claim that grew', () => {
    const k = landKit({ fenceOnBuy: true });
    const c = buy(k, 500, 500, 20, { x: 510, z: 530 });
    const oldRing = boundaryCells(c.polygon);
    const east = oldRing.find(([x, z]) => x === 519 && z === 510)!;
    const hasFence = (x: number, z: number, g: number) => { for (let y = g - 4; y <= g + 6; y++) if (k.world.getBlock(x, y, z) === B.FENCE) return true; return false; };
    const gAt = (cl: LandClaim, x: number, z: number) => cl.ground[(z - cl.polygon.box.z0) * cl.polygon.w + (x - cl.polygon.box.x0)];
    expect(hasFence(east[0], east[1], gAt(c, east[0], east[1]))).toBe(true);
    const r = k.land.expand({ account: ME, id: c.id, vertices: k.rect(500, 500, 539, 519), idem: 'idem-expand-1', carries: true, reach: { x: 520, z: 530 } }, k.buyer(1_000_000));
    expect(r.ok).toBe(true);
    const grown = k.land.index.get(c.id)!;
    // The old east edge is inside now: no fence stands there, and there is one on the new edge.
    expect(hasFence(519, 510, gAt(grown, 519, 510))).toBe(false);
    expect(hasFence(539, 510, gAt(grown, 539, 510))).toBe(true);
  });
});
