import { describe, expect, it } from 'vitest';
import { B, BB, BUBBLE_BLOOM, GameSession, HeadlessWorld, I, OXYGEN_SECONDS, SEA_LEVEL, findRecipe, makeGenerator, makeStack, mulberry32, raycast, type InputFrame } from './index';
import { isWaterId } from './fluids';

const idle = (): InputFrame => ({ t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false });

function diver() {
  const generator = makeGenerator(3, 'isle');
  const world = new HeadlessWorld(generator);
  const s = new GameSession({ seed: 3, world, generator, naturalSpawning: false, rand: mulberry32(1), mode: 'survival', classId: null });
  s.finishLoading();
  s.clearInventory();
  s.drainEvents();
  return { s, world };
}

/** A shaft of water with a stone lid, so a swimmer stays under. */
function cage(world: HeadlessWorld, x: number, z: number): number {
  const floor = SEA_LEVEL - 12;
  for (let y = floor; y <= floor + 5; y++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const edge = Math.abs(dx) === 1 || Math.abs(dz) === 1 || y === floor || y === floor + 5;
        world.setBlock(x + dx, y, z + dz, edge ? B.STONE : B.WATER);
      }
    }
  }
  return floor;
}

function seconds(s: GameSession, n: number): void {
  for (let i = 0; i < n * 20; i++) s.tick(idle());
}

describe('diving helmet and oxygen', () => {
  it('is crafted from what the island gives, and oxygen stacks like an apple', () => {
    const helm = findRecipe(
      [makeStack(I.IRON_INGOT), null, makeStack(I.IRON_INGOT), makeStack(I.IRON_INGOT), makeStack(B.GLASS), makeStack(I.IRON_INGOT)],
      3,
      2,
    );
    expect(helm?.result).toEqual({ id: I.DIVER_HELM, count: 1 });
    const air = findRecipe([makeStack(BB.kelp), makeStack(B.GLASS)], 1, 2);
    expect(air?.result).toEqual({ id: I.OXYGEN, count: 4 });
    expect(I.OXYGEN).not.toBe(I.APPLE);
    const bottle = makeStack(I.OXYGEN, 64);
    expect(bottle.count).toBe(64);
  });

  it('breathes under water while oxygen is in the inventory, one bottle at a time', () => {
    const { s, world } = diver();
    const x = 80;
    const z = 4;
    const floor = cage(world, x, z);
    s.armor.set(0, makeStack(I.DIVER_HELM));
    s.inventory.set(0, makeStack(I.OXYGEN, 2));
    s.teleport(x + 0.5, floor + 1, z + 0.5, 0, 0);
    seconds(s, 2);
    expect(s.body.eyeInWater).toBe(true);
    expect(s.vitals.health).toBe(20);
    expect(s.inventory.countOf(I.OXYGEN)).toBe(1);
    seconds(s, OXYGEN_SECONDS + 2);
    expect(s.vitals.health).toBe(20);
    expect(s.inventory.countOf(I.OXYGEN)).toBe(0);
    seconds(s, OXYGEN_SECONDS + 2);
    expect(s.vitals.health).toBeLessThan(20);
  });

  it('drowns in the helmet once the oxygen is gone, and without the helmet the bottles stay unused', () => {
    const bare = diver();
    const floor = cage(bare.world, 80, 8);
    bare.s.inventory.set(0, makeStack(I.OXYGEN, 2));
    bare.s.teleport(80.5, floor + 1, 8.5, 0, 0);
    seconds(bare.s, 2);
    expect(bare.s.inventory.countOf(I.OXYGEN)).toBe(2);
    expect(bare.s.vitals.health).toBe(20);
    expect(bare.s.vitals.air).toBeLessThan(15);

    const empty = diver();
    const low = cage(empty.world, 80, 12);
    empty.s.armor.set(0, makeStack(I.DIVER_HELM));
    empty.s.teleport(80.5, low + 1, 12.5, 0, 0);
    seconds(empty.s, 2);
    expect(empty.s.vitals.health).toBeLessThan(20);
  });

  it('refills air from a bubble bloom and does not burn oxygen', () => {
    const { s, world } = diver();
    const x = 80;
    const z = 16;
    const floor = cage(world, x, z);
    world.setBlock(x, floor + 1, z, BUBBLE_BLOOM);
    s.inventory.set(0, makeStack(I.OXYGEN, 1));
    s.teleport(x + 0.5, floor + 2, z + 0.5, 0, 0);
    seconds(s, 3);
    expect(s.body.eyeInWater).toBe(true);
    expect(s.vitals.health).toBe(20);
    expect(s.vitals.air).toBeGreaterThan(12);
    expect(s.inventory.countOf(I.OXYGEN)).toBe(1);
  });

  it('fills bottles from glass while standing in a bubble bloom', () => {
    const { s, world } = diver();
    const x = 80;
    const z = 20;
    const floor = cage(world, x, z);
    world.setBlock(x, floor + 1, z, BUBBLE_BLOOM);
    s.inventory.set(0, makeStack(B.GLASS, 1));
    s.teleport(x + 0.5, floor + 2, z + 0.5, 0, 0);
    seconds(s, 1);
    expect(s.inventory.countOf(B.GLASS)).toBe(1);
    seconds(s, 3);
    expect(s.inventory.countOf(B.GLASS)).toBe(0);
    expect(s.inventory.countOf(I.OXYGEN)).toBe(4);
    expect(s.vitals.health).toBe(20);
  });

  it('does not drop a bloom when the block under it breaks, and water fills the hole', () => {
    const { s, world } = diver();
    const x = 80;
    const z = 28;
    const floor = cage(world, x, z);
    world.setBlock(x, floor + 1, z, BUBBLE_BLOOM);
    s.teleport(x + 0.5, floor + 8, z + 0.5, 0, 0);
    s.breakBlock(x, floor, z);
    expect(world.getBlock(x, floor + 1, z)).toBe(B.WATER);
    expect(s.drops.drops.some((d) => d.stack.id === BUBBLE_BLOOM)).toBe(false);
    seconds(s, 2);
    expect(isWaterId(world.getBlock(x, floor, z))).toBe(true);
    s.teleport(x + 0.5, floor + 1, z + 0.5, 0, 0);
    seconds(s, 2);
    expect(s.body.eyeInWater).toBe(true);
    expect(s.vitals.air).toBeLessThan(15);
  });

  it('lets you break kelp, and water fills the space under it', () => {
    const { s, world } = diver();
    const x = 80;
    const z = 32;
    const floor = cage(world, x, z);
    world.setBlock(x, floor + 1, z, BB.kelp);
    world.setBlock(x, floor + 2, z, BB.kelp);
    expect(raycast(world, x + 0.2, floor + 1.2, z + 0.2, 1, 0, 0, 2)?.id).toBe(BB.kelp);
    const bloom = cage(world, x, z + 8);
    world.setBlock(x, bloom + 1, z + 8, BUBBLE_BLOOM);
    expect(raycast(world, x + 0.2, bloom + 1.2, z + 8.2, 1, 0, 0, 2)?.id).not.toBe(BUBBLE_BLOOM);
    s.breakBlock(x, floor + 1, z);
    expect(world.getBlock(x, floor + 1, z)).toBe(B.WATER);
    expect(world.getBlock(x, floor + 2, z)).toBe(B.WATER);
    expect(s.drops.drops.filter((d) => d.stack.id === BB.kelp).reduce((n, d) => n + d.stack.count, 0)).toBe(2);
    s.breakBlock(x, floor, z);
    seconds(s, 2);
    expect(isWaterId(world.getBlock(x, floor, z))).toBe(true);
  });
});
