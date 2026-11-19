import { describe, expect, it } from 'vitest';
import {
  B,
  BED_DIRS,
  BlockEntities,
  ChestMenu,
  GameSession,
  HeadlessWorld,
  PLAYER_SLOTS,
  Player,
  WorldGenerator,
  chestInfo,
  isChest,
  makeStack,
  mulberry32,
} from './index';

const SEED = 1337;
const FLOOR = 80;
const CX = 8;
const CZ = 8;

function make() {
  const generator = new WorldGenerator(SEED);
  const world = new HeadlessWorld(generator);
  for (let x = CX - 16; x <= CX + 16; x++)
    for (let z = CZ - 16; z <= CZ + 16; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 8; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.STONE);
    }
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(5), mode: 'survival' });
  s.finishLoading();
  s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
  return { s, world };
}

function countDrops(s: GameSession, id: number): number {
  return s.drops.drops.filter((d) => d.stack.id === id).reduce((n, d) => n + d.stack.count, 0);
}

describe('chests', () => {
  it('is one 27-slot chest until another sits beside it, and then both halves open the same 54', () => {
    const { s, world } = make();
    const x = CX + 3;
    const y = FLOOR + 1;
    s.inventory.set(0, makeStack(B.CHEST, 2));
    expect(s.useOn(x, FLOOR, CZ, 0, 1, 0)).toBe(true);
    const single = world.getBlock(x, y, CZ);
    expect(isChest(single)).toBe(true);
    expect(chestInfo(single)).toEqual({ dir: 2, half: 0 });
    const lone = s.blockEntities.chest(x, y, CZ);
    expect(lone.size).toBe(27);
    lone.set(3, makeStack(B.DIRT, 7));

    expect(s.useOn(x, y, CZ, 1, 0, 0)).toBe(true);
    // Facing +z, the latch toward the player: the block on the player's left is the left half.
    const a = chestInfo(world.getBlock(x, y, CZ))!;
    const b = chestInfo(world.getBlock(x + 1, y, CZ))!;
    expect(a).toEqual({ dir: 2, half: 1 });
    expect(b).toEqual({ dir: 2, half: 2 });
    const shared = s.blockEntities.chest(x, y, CZ);
    expect(shared.size).toBe(54);
    expect(s.blockEntities.chest(x + 1, y, CZ)).toBe(shared);
    expect(shared).not.toBe(lone);
    expect(lone.isEmpty()).toBe(true);
    expect(shared.get(27 + 3)?.count).toBe(7);

    shared.set(0, makeStack(B.DIRT, 3));
    shared.set(40, makeStack(B.STONE, 2));
    expect(s.useBlock(x, y, CZ)).toBe(true);
    expect(s.menu).toBeInstanceOf(ChestMenu);
    expect((s.menu as ChestMenu).chest).toBe(shared);
    expect((s.menu as ChestMenu).slots.length).toBeGreaterThanOrEqual(PLAYER_SLOTS + 54);
    s.closeMenu();
    expect(s.useBlock(x + 1, y, CZ)).toBe(true);
    expect((s.menu as ChestMenu).chest).toBe(shared);
    expect((s.menu as ChestMenu).chest.get(0)?.count).toBe(3);
    expect((s.menu as ChestMenu).chest.get(40)?.count).toBe(2);
  });

  it('joins on every side, and not diagonally, vertically, or onto a chest that is already double', () => {
    const { s, world } = make();
    const y = FLOOR + 1;
    BED_DIRS.forEach(([dx, dz], i) => {
      const x = CX - 12 + i * 6;
      const z = CZ;
      s.teleport(x + 0.5, FLOOR + 1, z + 2.5, 0, 0);
      s.inventory.set(0, makeStack(B.CHEST, 2));
      expect(s.useOn(x, FLOOR, z, 0, 1, 0)).toBe(true);
      expect(s.useOn(x, y, z, dx, 0, dz)).toBe(true);
      expect(chestInfo(world.getBlock(x, y, z))!.half).not.toBe(0);
      expect(s.blockEntities.chest(x, y, z).size).toBe(54);
    });

    const x = CX + 12;
    s.teleport(x + 0.5, FLOOR + 1, CZ + 2.5, 0, 0);
    s.inventory.set(0, makeStack(B.CHEST, 5));
    expect(s.useOn(x, FLOOR, CZ, 0, 1, 0)).toBe(true);
    expect(s.useOn(x + 1, FLOOR, CZ + 1, 0, 1, 0)).toBe(true);
    expect(chestInfo(world.getBlock(x, y, CZ))!.half).toBe(0);
    expect(chestInfo(world.getBlock(x + 1, y, CZ + 1))!.half).toBe(0);
    expect(s.blockEntities.chest(x, y, CZ).size).toBe(27);

    expect(s.useOn(x, y, CZ, 0, 1, 0)).toBe(true);
    expect(chestInfo(world.getBlock(x, y + 1, CZ))!.half).toBe(0);
    expect(s.blockEntities.chest(x, y + 1, CZ).size).toBe(27);

    expect(s.useOn(x, y, CZ, 1, 0, 0)).toBe(true);
    expect(s.blockEntities.chest(x, y, CZ).size).toBe(54);
    expect(s.useOn(x + 1, y, CZ, 1, 0, 0)).toBe(true);
    expect(chestInfo(world.getBlock(x + 2, y, CZ))!.half).toBe(0);
    expect(s.blockEntities.chest(x + 2, y, CZ).size).toBe(27);
  });

  it('drops a single chest and everything inside it, scattered', () => {
    const { s, world } = make();
    const x = CX + 3;
    const y = FLOOR + 1;
    s.inventory.set(0, makeStack(B.CHEST, 1));
    s.useOn(x, FLOOR, CZ, 0, 1, 0);
    const box = s.blockEntities.chest(x, y, CZ);
    box.set(0, makeStack(B.DIRT, 5));
    box.set(4, makeStack(B.COBBLE, 2));
    s.drainEvents();
    s.breakBlock(x, y, CZ);
    const broken = s.drainEvents();
    expect(broken.some((e) => e.t === 'sound' && e.action === 'break' && e.sound === 'wood')).toBe(true);
    expect(broken.some((e) => e.t === 'burst' && e.count === 32 && e.soft !== true)).toBe(true);
    expect(world.getBlock(x, y, CZ)).toBe(B.AIR);
    expect(countDrops(s, B.DIRT)).toBe(5);
    expect(countDrops(s, B.COBBLE)).toBe(2);
    expect(countDrops(s, B.CHEST)).toBe(1);
    expect(s.drops.drops.every((d) => Math.hypot(d.vx, d.vy, d.vz) > 0)).toBe(true);
    expect(s.blockEntities.chest(x, y, CZ).isEmpty()).toBe(true);
    expect(s.blockEntities.chest(x, y, CZ).size).toBe(27);
  });

  it('drops a double chest once, and the half that remains is an empty single chest', () => {
    const { s, world } = make();
    const x = CX + 3;
    const y = FLOOR + 1;
    s.inventory.set(0, makeStack(B.CHEST, 2));
    s.useOn(x, FLOOR, CZ, 0, 1, 0);
    s.useOn(x, y, CZ, 1, 0, 0);
    const shared = s.blockEntities.chest(x, y, CZ);
    shared.set(0, makeStack(B.DIRT, 3));
    shared.set(40, makeStack(B.STONE, 2));
    const before = s.drops.drops.length;
    s.breakBlock(x, y, CZ);
    expect(world.getBlock(x, y, CZ)).toBe(B.AIR);
    expect(chestInfo(world.getBlock(x + 1, y, CZ))!.half).toBe(0);
    expect(countDrops(s, B.DIRT)).toBe(3);
    expect(countDrops(s, B.STONE)).toBe(2);
    expect(countDrops(s, B.CHEST)).toBe(1);
    const left = s.blockEntities.chest(x + 1, y, CZ);
    expect(left.size).toBe(27);
    expect(left.isEmpty()).toBe(true);
    expect(left).not.toBe(shared);

    s.breakBlock(x + 1, y, CZ);
    expect(countDrops(s, B.DIRT)).toBe(3);
    expect(countDrops(s, B.STONE)).toBe(2);
    expect(countDrops(s, B.CHEST)).toBe(2);
    expect(s.drops.drops.length).toBe(before + 4);
  });

  it('keeps one inventory between two players, and a break does not copy it', () => {
    const { s, world } = make();
    const other = new Player(s.realm, { mode: 'survival', name: 'Other' });
    other.teleport(CX + 1, FLOOR + 1, CZ + 0.5, 0, 0);
    const x = CX + 3;
    const y = FLOOR + 1;
    s.inventory.set(0, makeStack(B.CHEST, 2));
    s.useOn(x, FLOOR, CZ, 0, 1, 0);
    s.useOn(x, y, CZ, 1, 0, 0);
    const shared = s.blockEntities.chest(x, y, CZ);
    shared.set(0, makeStack(B.DIRT, 4));
    expect(s.useBlock(x, y, CZ)).toBe(true);
    expect(other.useBlock(x + 1, y, CZ)).toBe(true);
    expect((other.menu as ChestMenu).chest).toBe(shared);
    s.drainEvents();
    other.apply({ t: 'click', slot: PLAYER_SLOTS, button: 0 });
    expect(shared.get(0)).toBeNull();
    expect(other.menu!.cursor?.id).toBe(B.DIRT);
    expect(other.menu!.cursor?.count).toBe(4);
    expect(s.drainEvents().some((e) => e.t === 'inv')).toBe(true);

    const saved = JSON.parse(JSON.stringify(s.blockEntities.toJSON()));
    const loaded = new BlockEntities();
    loaded.loadJSON(saved);
    expect(loaded.chest(x, y, CZ)).toBe(loaded.chest(x + 1, y, CZ));
    expect(loaded.chest(x, y, CZ).size).toBe(54);
    expect(loaded.chest(x, y, CZ).isEmpty()).toBe(true);

    s.breakBlock(x, y, CZ);
    expect(countDrops(s, B.DIRT)).toBe(0);
    expect(world.getBlock(x + 1, y, CZ)).not.toBe(0);
    expect(chestInfo(world.getBlock(x + 1, y, CZ))!.half).toBe(0);
    expect(other.menu).toBeNull();
  });
});
