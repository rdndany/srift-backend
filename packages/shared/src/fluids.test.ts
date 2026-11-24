import { describe, expect, it } from 'vitest';
import {
  B,
  BLOCKS,
  FALL,
  FLUID_LAVA,
  FLUID_LEVEL,
  FLUID_WATER,
  FluidSim,
  I,
  fluidId,
  fluidSurface,
  isFluid,
  isFluidSource,
  isLavaId,
  isWaterId,
  type FluidHost,
} from './index';

/** A bare world: stone below y = 1, air above, plus whatever the test puts down. */
function rig() {
  const cells = new Map<string, number>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const washed: number[] = [];
  let hisses = 0;
  const host: FluidHost = {
    getBlock: (x, y, z) => cells.get(key(x, y, z)) ?? (y < 1 ? B.STONE : B.AIR),
    setBlock: (x, y, z, id) => {
      cells.set(key(x, y, z), id);
      return true;
    },
    washAway: (_x, _y, _z, id) => void washed.push(id),
    hiss: () => void hisses++,
  };
  const sim = new FluidSim(host);
  const put = (x: number, y: number, z: number, id: number) => {
    host.setBlock(x, y, z, id);
    sim.notify(x, y, z);
  };
  return { host, sim, put, washed, get: host.getBlock, hisses: () => hisses, cells };
}

describe('fluid blocks', () => {
  it('have one id per level, and every one is a liquid you can walk into', () => {
    for (let level = 0; level <= 7; level++) {
      const id = fluidId(FLUID_WATER, level);
      expect(isWaterId(id)).toBe(true);
      expect(FLUID_LEVEL[id]).toBe(level);
      expect(BLOCKS[id].liquid).toBe(true);
      expect(BLOCKS[id].solid).toBe(false);
    }
    for (let level = 0; level <= 3; level++) {
      const id = fluidId(FLUID_LAVA, level);
      expect(isLavaId(id)).toBe(true);
      expect(BLOCKS[id].light).toBeGreaterThan(0);
    }
    expect(isFluid(B.WATER_FALL) && isFluid(B.LAVA_FALL)).toBe(true);
    expect(isFluid(B.STONE)).toBe(false);
  });

  it('only level zero is a source', () => {
    expect(isFluidSource(B.WATER)).toBe(true);
    expect(isFluidSource(B.LAVA)).toBe(true);
    expect(isFluidSource(B.WATER_1)).toBe(false);
    expect(isFluidSource(B.WATER_FALL)).toBe(false);
  });

  it('get lower the further they have flowed', () => {
    const heights = [0, 1, 2, 3, 4, 5, 6, 7].map((l) => fluidSurface(fluidId(FLUID_WATER, l)));
    for (let i = 1; i < heights.length; i++) expect(heights[i]).toBeLessThan(heights[i - 1]);
    expect(fluidSurface(B.WATER_FALL)).toBe(16);
    expect(fluidSurface(B.LAVA)).toBeLessThan(16);
    expect(fluidSurface(B.LAVA_3)).toBeLessThan(fluidSurface(B.LAVA));
  });
});

describe('flowing water', () => {
  it('spreads from a source in falling levels and stops after seven blocks', () => {
    const r = rig();
    r.put(0, 1, 0, B.WATER);
    r.sim.settle();
    for (let d = 1; d <= 7; d++) {
      expect(r.get(d, 1, 0), `east ${d}`).toBe(fluidId(FLUID_WATER, d));
      expect(r.get(-d, 1, 0), `west ${d}`).toBe(fluidId(FLUID_WATER, d));
      expect(r.get(0, 1, d), `south ${d}`).toBe(fluidId(FLUID_WATER, d));
    }
    expect(r.get(8, 1, 0)).toBe(B.AIR);
    expect(r.get(0, 1, 0)).toBe(B.WATER);
    // It makes a diamond: a block two over and two across is four steps from the source.
    expect(r.get(2, 1, 2)).toBe(fluidId(FLUID_WATER, 4));
  });

  it('dries up when the source is taken away', () => {
    const r = rig();
    r.put(0, 1, 0, B.WATER);
    r.sim.settle();
    r.put(0, 1, 0, B.AIR);
    r.sim.settle();
    for (let d = -8; d <= 8; d++) expect(r.get(d, 1, 0), `x=${d}`).toBe(B.AIR);
  });

  it('keeps flowing while another source feeds it', () => {
    const r = rig();
    r.put(0, 1, 0, B.WATER);
    r.put(5, 1, 0, B.WATER);
    r.sim.settle();
    r.put(0, 1, 0, B.AIR);
    r.sim.settle();
    expect(r.get(3, 1, 0)).toBe(fluidId(FLUID_WATER, 2));
    expect(r.get(-1, 1, 0)).toBe(fluidId(FLUID_WATER, 6)); // 5 -> 4 -> ... -> 6 blocks from the second source
    expect(r.get(-3, 1, 0)).toBe(B.AIR);
  });

  it('falls before it spreads, and fills the floor where it lands', () => {
    const r = rig();
    // A platform with a hole in it, and a source above the hole.
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) r.cells.set(`${x},6,${z}`, B.STONE);
    r.cells.set('0,6,0', B.AIR);
    r.put(0, 7, 0, B.WATER);
    r.sim.settle();
    for (let y = 1; y <= 6; y++) expect(r.get(0, y, 0), `y=${y}`).toBe(B.WATER_FALL);
    // Nothing leaks sideways on the way down.
    expect(r.get(1, 4, 0)).toBe(B.AIR);
    // The pool at the bottom starts one level in from the fall.
    expect(r.get(1, 1, 0)).toBe(B.WATER_1);
    expect(r.get(2, 1, 0)).toBe(B.WATER_2);
  });

  it('runs off a ledge: a fall at the edge and a pool below', () => {
    const r = rig();
    for (let x = -3; x <= 0; x++) for (let y = 1; y <= 3; y++) r.cells.set(`${x},${y},0`, B.STONE);
    r.put(0, 4, 0, B.WATER);
    r.sim.settle();
    expect(r.get(1, 4, 0)).toBe(B.WATER_1);
    expect(r.get(1, 3, 0)).toBe(B.WATER_FALL);
    expect(r.get(1, 1, 0)).toBe(B.WATER_FALL);
    expect(r.get(2, 1, 0)).toBe(B.WATER_1);
  });

  it('makes a new source between two sources (infinite water)', () => {
    const r = rig();
    r.put(-1, 1, 0, B.WATER);
    r.put(1, 1, 0, B.WATER);
    r.sim.settle();
    expect(r.get(0, 1, 0)).toBe(B.WATER);
    // ...so taking one away does not drain the middle.
    r.put(-1, 1, 0, B.AIR);
    r.sim.settle();
    expect(r.get(0, 1, 0)).toBe(B.WATER);
  });

  it('does not make a source over thin air', () => {
    const r = rig();
    // A one-block-wide gap in the floor under the middle cell.
    r.cells.set('0,0,0', B.AIR);
    r.put(-1, 1, 0, B.WATER);
    r.put(1, 1, 0, B.WATER);
    r.sim.settle();
    expect(r.get(0, 1, 0)).not.toBe(B.WATER);
  });

  it('washes away plants and torches, dropping them', () => {
    const r = rig();
    r.cells.set('2,1,0', B.TALL_GRASS);
    r.cells.set('3,1,0', B.TORCH);
    r.put(0, 1, 0, B.WATER);
    r.sim.settle();
    expect(r.washed).toContain(B.TALL_GRASS);
    expect(r.washed).toContain(B.TORCH);
    expect(isWaterId(r.get(2, 1, 0))).toBe(true);
  });

  it('is stopped by solid blocks and does not climb', () => {
    const r = rig();
    for (let y = 1; y <= 3; y++) r.cells.set(`2,${y},0`, B.STONE);
    r.put(0, 1, 0, B.WATER);
    r.sim.settle();
    expect(r.get(1, 1, 0)).toBe(B.WATER_1);
    expect(r.get(2, 1, 0)).toBe(B.STONE);
    expect(r.get(0, 2, 0)).toBe(B.AIR);
    expect(r.get(1, 2, 0)).toBe(B.AIR);
  });

  it('is slower than nothing, but quicker than lava', () => {
    const w = rig();
    w.put(0, 1, 0, B.WATER);
    w.sim.update(0.3);
    expect(w.get(1, 1, 0)).toBe(B.WATER_1);
    expect(w.get(2, 1, 0)).toBe(B.AIR); // one step per tick, not instant

    const l = rig();
    l.put(0, 1, 0, B.LAVA);
    l.sim.update(0.3);
    expect(l.get(1, 1, 0)).toBe(B.AIR);
    l.sim.update(1);
    expect(l.get(1, 1, 0)).toBe(B.LAVA_1);
  });
});

describe('flowing lava', () => {
  it('spreads three blocks and no further', () => {
    const r = rig();
    r.put(0, 1, 0, B.LAVA);
    r.sim.settle();
    expect(r.get(1, 1, 0)).toBe(B.LAVA_1);
    expect(r.get(3, 1, 0)).toBe(B.LAVA_3);
    expect(r.get(4, 1, 0)).toBe(B.AIR);
  });

  it('falls like water does', () => {
    const r = rig();
    r.put(0, 4, 0, B.LAVA);
    r.sim.settle();
    expect(r.get(0, 1, 0)).toBe(B.LAVA_FALL);
  });

  it('turns a source into obsidian where it touches water', () => {
    const r = rig();
    r.put(0, 1, 0, B.LAVA);
    r.put(1, 1, 0, B.WATER);
    r.sim.settle();
    expect(r.get(0, 1, 0)).toBe(B.OBSIDIAN);
    expect(r.hisses()).toBeGreaterThan(0);
  });

  it('turns flowing lava into cobblestone', () => {
    const r = rig();
    r.put(0, 1, 0, B.LAVA);
    r.sim.settle();
    // Pour water on the end of the flow.
    r.put(3, 1, 0, B.WATER);
    r.sim.settle();
    expect(r.get(3, 1, 0)).toBe(B.WATER);
    expect(r.get(2, 1, 0)).toBe(B.COBBLE);
  });

  it('running down into water leaves stone', () => {
    const r = rig();
    r.put(0, 1, 0, B.WATER);
    r.put(0, 2, 0, B.LAVA);
    r.sim.settle();
    expect(r.get(0, 1, 0)).toBe(B.STONE);
  });

  it('melts the ice it sits on, and the lava becomes obsidian', () => {
    const r = rig();
    r.put(0, 1, 0, B.ICE);
    r.put(0, 2, 0, B.LAVA);
    r.sim.settle();
    expect(r.get(0, 1, 0)).toBe(B.WATER);
    expect(r.get(0, 2, 0)).toBe(B.OBSIDIAN);
    expect(r.hisses()).toBeGreaterThan(0);
  });

  it('melts ice over water and the lava becomes obsidian', () => {
    const r = rig();
    r.put(0, 1, 0, B.WATER);
    r.put(0, 2, 0, B.ICE);
    r.put(0, 3, 0, B.LAVA);
    r.sim.settle();
    expect(r.get(0, 1, 0)).toBe(B.WATER);
    expect(r.get(0, 2, 0)).toBe(B.WATER);
    expect(r.get(0, 3, 0)).toBe(B.OBSIDIAN);
    expect(r.hisses()).toBeGreaterThan(0);
  });

  it('leaves packed ice where it is', () => {
    const r = rig();
    r.put(0, 1, 0, B.PACKED_ICE);
    r.put(0, 2, 0, B.LAVA);
    r.sim.settle();
    expect(r.get(0, 1, 0)).toBe(B.PACKED_ICE);
    expect(r.get(0, 2, 0)).toBe(B.LAVA);
  });

  it('water over a lava source: the lava becomes obsidian', () => {
    const r = rig();
    r.put(0, 1, 0, B.LAVA);
    r.put(0, 2, 0, B.WATER);
    r.sim.settle();
    expect(r.get(0, 1, 0)).toBe(B.OBSIDIAN);
  });
});

describe('what the player carries', () => {
  it('a bucket is not a block, and has full and empty forms', () => {
    expect(I.BUCKET).not.toBe(I.WATER_BUCKET);
    expect(I.WATER_BUCKET).not.toBe(I.LAVA_BUCKET);
  });

  it('FALL is the largest level', () => {
    expect(FALL).toBe(8);
  });
});
