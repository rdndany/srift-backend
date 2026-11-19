import { describe, expect, it } from 'vitest';
import { B, DRESS, GROVE, MAX_SEAT_PILE, bedId, cakeId, campfireId, collides, createBody, raycast, seatDrop, slabId, stepPlayer, trapdoorId } from './index';

/** A few cells in an otherwise empty world. */
function world(cells: Record<string, number>): { getBlock(x: number, y: number, z: number): number } {
  return {
    getBlock(x, y, z) {
      return cells[`${x},${y},${z}`] ?? 0;
    },
  };
}

const SLAB = slabId(4, false);
const TOP = slabId(4, true);

describe('ground above a buried carpet', () => {
  it('stays where it is: only a short pile of cubes sits on a short block', () => {
    const cells: Record<string, number> = { '0,0,0': GROVE.mossCarpet };
    for (let y = 1; y <= 40; y++) cells[`0,${y},0`] = B.STONE;
    const column = world(cells);
    const at = (y: number): number => seatDrop(B.STONE, (dy) => column.getBlock(0, y - dy, 0));
    expect(at(1)).toBeCloseTo(15 / 16);
    expect(at(MAX_SEAT_PILE)).toBeCloseTo(15 / 16);
    expect(at(MAX_SEAT_PILE + 1)).toBe(0);
    expect(at(40)).toBe(0);
    // A body standing on the surface 40 blocks up is not sunk into the ground.
    expect(collides(column, 0.5, 41, 0.5)).toBe(false);
    expect(collides(column, 0.5, 40.5, 0.5, 0.3, 0.3, true)).toBe(true);
  });
});

describe('a full block sits on a slab', () => {
  const floor = world({ '0,1,0': SLAB, '0,2,0': B.STONE_BRICKS });

  it('drops onto a bottom slab and leaves a top slab alone', () => {
    expect(seatDrop(B.STONE_BRICKS, (dy) => floor.getBlock(0, 2 - dy, 0))).toBeCloseTo(0.5);
    expect(seatDrop(B.STONE_BRICKS, (dy) => (dy === 1 ? TOP : 0))).toBe(0);
    expect(seatDrop(B.STONE_BRICKS, (dy) => (dy === 1 ? B.STONE : 0))).toBe(0);
    const stack = world({ '0,1,0': SLAB, '0,2,0': B.STONE_BRICKS, '0,3,0': B.STONE_BRICKS });
    expect(seatDrop(B.STONE_BRICKS, (dy) => stack.getBlock(0, 3 - dy, 0))).toBeCloseTo(0.5);
  });

  it('fills the gap, so the pile is a slab plus one block and nothing above that is solid', () => {
    // The old gap was the band from 1.5 to 2. A body there now meets the block.
    expect(collides(floor, 0.5, 1.6, 0.5, 0.2, 0.2)).toBe(true);
    // The block's top is at 2.5. The upper half of its cell is empty.
    expect(collides(floor, 0.5, 2.6, 0.5, 0.2, 0.2)).toBe(false);
    // Standing on that top does not count as being inside it.
    expect(collides(floor, 0.5, 2.5, 0.5)).toBe(false);
  });

  it('keeps a second block flush on the first', () => {
    const stack = world({ '0,1,0': SLAB, '0,2,0': B.STONE_BRICKS, '0,3,0': B.STONE_BRICKS });
    expect(collides(stack, 0.5, 2.6, 0.5, 0.2, 0.2)).toBe(true);
    expect(collides(stack, 0.5, 3.6, 0.5, 0.2, 0.2)).toBe(false);
  });

  it('is aimed at the top of the block, half a block below the cell top', () => {
    const hit = raycast(floor, 0.5, 4, 0.5, 0, -1, 0, 8);
    expect(hit).toMatchObject({ x: 0, y: 2, z: 0, ny: 1, id: B.STONE_BRICKS });
    expect(hit?.fy).toBeCloseTo(0.5);
    const side = raycast(floor, -2, 1.7, 0.5, 1, 0, 0, 8);
    expect(side).toMatchObject({ x: 0, y: 2, z: 0, nx: -1, id: B.STONE_BRICKS });
  });

  it('sits on a carpet, and on the other short floors, and stays put on a full block', () => {
    const on = (under: number): number => seatDrop(B.STONE_BRICKS, (dy) => (dy === 1 ? under : 0));
    expect(on(DRESS.carpet)).toBeCloseTo(15 / 16);
    expect(on(GROVE.mossCarpet)).toBeCloseTo(15 / 16);
    expect(on(B.LILY_PAD)).toBeCloseTo(15 / 16);
    expect(on(B.PLATE_STONE)).toBeCloseTo(15 / 16);
    expect(on(B.PLATE_WOOD_ON)).toBeCloseTo(15.5 / 16);
    expect(on(trapdoorId(false, false, 0))).toBeCloseTo(13 / 16);
    expect(on(trapdoorId(true, false, 0))).toBe(0);
    expect(on(cakeId(0))).toBeCloseTo(8 / 16);
    expect(on(campfireId(0, true))).toBeCloseTo(9 / 16);
    expect(on(bedId(false, 0, 0))).toBeCloseTo(7 / 16);
    expect(on(B.ENCHANTING_TABLE)).toBeCloseTo(4 / 16);
    expect(on(B.GRINDSTONE)).toBeCloseTo(3 / 16);
    expect(on(DRESS.pot)).toBeCloseTo(8 / 16);
    expect(on(B.RAIL_X)).toBe(0);
    expect(on(B.TORCH)).toBe(0);
    expect(on(B.FARMLAND)).toBe(0);
    expect(on(B.ANVIL)).toBe(0);
    const carpet = world({ '0,1,0': DRESS.carpet, '0,2,0': B.STONE_BRICKS });
    expect(collides(carpet, 0.5, 1.2, 0.5, 0.2, 0.2)).toBe(true);
    expect(collides(carpet, 0.5, 2.1, 0.5, 0.2, 0.2)).toBe(false);
    const hit = raycast(carpet, 0.5, 4, 0.5, 0, -1, 0, 8);
    expect(hit).toMatchObject({ y: 2, ny: 1, id: B.STONE_BRICKS });
    expect(hit?.fy).toBeCloseTo(1 / 16);
  });

  it('lets a character stand on the lowered block without being thrown up', () => {
    // Overlapping the lowered block is a real hit, but not a full-cell hit, so the body is not snapped to the cell top.
    expect(collides(floor, 0.5, 2.2, 0.5, 0.2, 0.2)).toBe(true);
    expect(collides(floor, 0.5, 2.2, 0.5, 0.2, 0.2, true)).toBe(false);
    const stone = world({ '0,1,0': B.STONE, '0,2,0': B.STONE_BRICKS });
    expect(collides(stone, 0.5, 2.2, 0.5, 0.2, 0.2, true)).toBe(true);

    const still = { forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, fly: false, flyDown: false, yaw: 0 };
    const dropped = createBody(0.5, 4, 0.5);
    for (let i = 0; i < 90; i++) stepPlayer(floor, dropped, still, 1 / 20);
    expect(dropped.onGround).toBe(true);
    expect(dropped.y).toBeCloseTo(2.5, 2);
    for (let i = 0; i < 20; i++) stepPlayer(floor, dropped, still, 1 / 20);
    expect(dropped.y).toBeCloseTo(2.5, 2);

    const normal = createBody(0.5, 4, 0.5);
    for (let i = 0; i < 90; i++) stepPlayer(stone, normal, still, 1 / 20);
    expect(normal.onGround).toBe(true);
    expect(normal.y).toBeCloseTo(3, 2);
  });

  it('stays on the lowered block while walking, and does not step up it from the slab', () => {
    const still = { forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, fly: false, flyDown: false, yaw: 0 };
    const cells: Record<string, number> = {};
    for (let x = -1; x <= 1; x++) {
      for (let z = -8; z <= 1; z++) {
        cells[`${x},1,${z}`] = SLAB;
        cells[`${x},2,${z}`] = B.STONE_BRICKS;
      }
    }
    const road = world(cells);
    const walker = createBody(0.5, 2.5, 0.5);
    walker.onGround = true;
    let highest = walker.y;
    for (let i = 0; i < 20; i++) {
      stepPlayer(road, walker, { ...still, forward: 1 }, 1 / 20);
      if (walker.y > highest) highest = walker.y;
    }
    expect(walker.onGround).toBe(true);
    expect(walker.y).toBeCloseTo(2.5, 2);
    expect(highest).toBeLessThan(2.6);

    // The block rises a full block above the slab, so walking into it stops you there.
    const ledge = world({ '0,1,0': SLAB, '0,2,0': B.STONE_BRICKS, '1,1,0': SLAB });
    const step = createBody(1.5, 1.5, 0.5);
    step.onGround = true;
    for (let i = 0; i < 15; i++) stepPlayer(ledge, step, { ...still, yaw: Math.PI / 2, forward: 1 }, 1 / 20);
    expect(step.y).toBeLessThan(1.8);
    expect(step.x).toBeGreaterThan(1);

    const carpet = world({ '0,1,0': DRESS.carpet, '0,2,0': B.STONE_BRICKS });
    const onCarpet = createBody(0.5, 4, 0.5);
    for (let i = 0; i < 90; i++) stepPlayer(carpet, onCarpet, still, 1 / 20);
    expect(onCarpet.onGround).toBe(true);
    expect(onCarpet.y).toBeCloseTo(2 + 1 / 16, 2);
  });
});
