import { describe, expect, it } from 'vitest';
import { LANTERN_LIGHT } from './blocks';
import { B, CraftingMenu, GameSession, HeadlessWorld, I, WorldGenerator, getItem, holdsInOffhand, makeStack, mulberry32, type InputFrame } from './index';

const SEED = 1337;
const FLOOR = 100;
const CX = 8;
const CZ = 8;

const idle = (over: Partial<InputFrame> = {}): InputFrame => ({
  t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false, ...over,
});
const seconds = (s: GameSession, n: number, over: Partial<InputFrame> = {}): void => {
  for (let i = 0; i < Math.round(n * 20); i++) s.tick(idle(over));
};
const isTorch = (id: number): boolean => id >= B.TORCH && id <= B.TORCH_NZ;

/** A flat floor with a stone wall straight ahead of the player at eye height. */
function make(mode: 'survival' | 'creative' = 'survival') {
  const generator = new WorldGenerator(SEED);
  const world = new HeadlessWorld(generator);
  for (let x = CX - 14; x <= CX + 14; x++)
    for (let z = CZ - 14; z <= CZ + 14; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 14; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.STONE);
    }
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(5), mode });
  s.finishLoading();
  s.teleport(CX - 8 + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
  const wall: [number, number, number] = [CX - 8, FLOOR + 2, CZ - 2];
  world.setBlock(wall[0], wall[1], wall[2], B.STONE);
  return { s, world, spot: [wall[0], wall[1], wall[2] + 1] as [number, number, number] };
}

describe('the torch in the hand', () => {
  it('gives light, a little less than a lantern, and the warm torch colour', () => {
    const light = getItem(B.TORCH).heldLight;
    expect(light).not.toBeNull();
    expect(light!.level).toBeGreaterThan(10);
    expect(light!.level).toBeLessThan(LANTERN_LIGHT);
    expect(light!.r).toBeGreaterThan(light!.b);
  });
});

describe('the torch in the off hand', () => {
  it('is something the off hand takes, as a stack', () => {
    expect(holdsInOffhand(B.TORCH)).toBe(true);
    expect(holdsInOffhand(B.STONE)).toBe(false);
    const { s } = make();
    s.inventory.set(0, makeStack(B.TORCH, 20));
    s.apply({ t: 'select', slot: 0 });
    s.swapHands();
    expect(s.offhand.get(0)).toMatchObject({ id: B.TORCH, count: 20 });
    expect(s.held).toBeNull();
  });

  it('is not what shift-click sends there (it stays among the items)', () => {
    const { s } = make();
    s.inventory.set(4, makeStack(B.TORCH, 8));
    s.apply({ t: 'inventory' });
    const menu = s.menu as CraftingMenu;
    menu.shiftClick(menu.slots.findIndex((sl) => sl.container === s.inventory && sl.index === 4));
    expect(s.offhand.get(0)).toBeNull();
  });

  it('is set down by the use button when the hand is empty, and the stack goes down by one', () => {
    const { s, world, spot } = make();
    s.offhand.set(0, makeStack(B.TORCH, 5));
    s.apply({ t: 'select', slot: 8 });
    expect(s.held).toBeNull();
    seconds(s, 0.3, { right: true });
    expect(isTorch(world.getBlock(...spot))).toBe(true);
    expect(s.offhand.get(0)!.count).toBeLessThan(5);
    expect(s.held).toBeNull(); // the hand is as it was
  });

  it('is set down while a sword is in the hand, which has no use for the button', () => {
    const { s, world, spot } = make();
    s.inventory.set(0, makeStack(I.GREATSWORD, 1));
    s.apply({ t: 'select', slot: 0 });
    s.offhand.set(0, makeStack(B.TORCH, 3));
    seconds(s, 0.1, { right: true });
    expect(isTorch(world.getBlock(...spot))).toBe(true);
    expect(s.held?.id).toBe(I.GREATSWORD);
  });

  it('gives way to the hand: blocks in the hand are placed first, the torches stay', () => {
    const { s, world, spot } = make();
    s.inventory.set(0, makeStack(B.DIRT, 10));
    s.apply({ t: 'select', slot: 0 });
    s.offhand.set(0, makeStack(B.TORCH, 4));
    seconds(s, 0.1, { right: true });
    expect(world.getBlock(...spot)).toBe(B.DIRT);
    expect(s.offhand.get(0)!.count).toBe(4);
  });

  it('runs out: the last torch leaves the off hand empty', () => {
    const { s, world } = make();
    s.offhand.set(0, makeStack(B.TORCH, 1));
    s.apply({ t: 'select', slot: 8 });
    seconds(s, 0.3, { right: true });
    expect(s.offhand.get(0)).toBeNull();
    expect(world.getBlock(CX - 8, FLOOR + 2, CZ - 1)).not.toBe(B.AIR);
  });
});
