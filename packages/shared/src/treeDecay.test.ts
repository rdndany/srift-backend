import { describe, expect, it } from 'vitest';
import { B, GameSession, HeadlessWorld, WorldGenerator, mulberry32, type InputFrame } from './index';

const SEED = 1337;
const FLOOR = 100;
const CX = 8;
const CZ = 8;

const idle: InputFrame = {
  t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false,
};

/** A flat floor with a small tree (a trunk of four logs under a block of leaves) at the middle. */
function make(mode: 'survival' | 'creative' = 'survival') {
  const generator = new WorldGenerator(SEED);
  const world = new HeadlessWorld(generator);
  for (let x = CX - 20; x <= CX + 20; x++)
    for (let z = CZ - 20; z <= CZ + 20; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 14; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.STONE);
    }
  const tree = (tx: number, tz: number): void => {
    for (let y = 1; y <= 4; y++) world.setBlock(tx, FLOOR + y, tz, B.LOG);
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++)
        for (let dy = 3; dy <= 6; dy++) if (world.getBlock(tx + dx, FLOOR + dy, tz + dz) === B.AIR) world.setBlock(tx + dx, FLOOR + dy, tz + dz, B.LEAVES);
  };
  tree(CX, CZ);
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(5), mode });
  s.finishLoading();
  s.teleport(CX + 8.5, FLOOR + 1, CZ + 0.5, 0, 0);
  const leaves = (tx = CX, tz = CZ): number => {
    let n = 0;
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++)
        for (let dy = 3; dy <= 6; dy++) if (world.getBlock(tx + dx, FLOOR + dy, tz + dz) === B.LEAVES) n++;
    return n;
  };
  const wait = (sec: number): void => {
    for (let i = 0; i < Math.round(sec * 20); i++) s.tick(idle);
  };
  return { s, world, tree, leaves, wait };
}

describe('felling a tree', () => {
  it('keeps the leaves while a log is still there', () => {
    const { s, leaves, wait } = make();
    s.breakBlock(CX, FLOOR + 1, CZ);
    wait(8);
    expect(leaves()).toBeGreaterThan(0);
    s.breakBlock(CX, FLOOR + 2, CZ);
    wait(8);
    expect(leaves()).toBeGreaterThan(0);
  });

  it('lets the leaves fall away once the last log is cut, with drops', () => {
    const { s, leaves, wait } = make();
    const before = leaves();
    expect(before).toBeGreaterThan(50);
    for (let y = 1; y <= 4; y++) s.breakBlock(CX, FLOOR + y, CZ);
    expect(leaves()).toBe(before);
    wait(8);
    expect(leaves()).toBe(0);
    expect(s.realm.drops.drops.length).toBeGreaterThan(0);
  });

  it('leaves another tree standing alone, and gives no drops in creative', () => {
    const { s, tree, leaves, wait } = make('creative');
    tree(CX + 12, CZ);
    for (let y = 1; y <= 4; y++) s.breakBlock(CX, FLOOR + y, CZ);
    wait(8);
    expect(leaves()).toBe(0);
    expect(leaves(CX + 12, CZ)).toBeGreaterThan(50);
    expect(s.realm.drops.drops.length).toBe(0);
  });
});
