import { describe, expect, it } from 'vitest';
import { B, GameSession, HeadlessWorld, I, WorldGenerator, makeStack, mulberry32, type InputFrame } from './index';

const SEED = 1337;
const FLOOR = 100;
const CX = 8;
const CZ = 8;

const idle = (over: Partial<InputFrame> = {}): InputFrame => ({
  t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false, ...over,
});

function make() {
  const generator = new WorldGenerator(SEED);
  const world = new HeadlessWorld(generator);
  for (let x = CX - 14; x <= CX + 14; x++)
    for (let z = CZ - 14; z <= CZ + 14; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 14; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.STONE);
    }
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(7) });
  s.finishLoading();
  s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
  return { s, world };
}

const run = (s: GameSession, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 20); i++) s.tick(idle());
};

describe('ender pearls', () => {
  const wall = (world: HeadlessWorld, z: number) => {
    for (let x = CX - 6; x <= CX + 6; x++) for (let y = FLOOR + 1; y <= FLOOR + 6; y++) world.setBlock(x, y, z, B.STONE);
  };

  it('carry the thrower to where they land, for five points of damage', () => {
    const { s, world } = make();
    wall(world, CZ - 10);
    s.inventory.set(0, makeStack(I.ENDER_PEARL, 3));
    const z0 = s.body.z;
    s.tick(idle({ right: true }));
    s.tick(idle());
    expect(s.inventory.get(0)?.count).toBe(2);
    expect(s.mobs.arrows.length).toBe(1);
    expect(s.mobs.arrows[0].pearl).toBe(s);
    run(s, 1);
    expect(s.mobs.arrows.length).toBe(0);
    expect(z0 - s.body.z).toBeGreaterThan(6);
    expect(s.body.z).toBeGreaterThan(CZ - 10);
    expect(s.vitals.health).toBeLessThanOrEqual(16);
    // Standing on the floor, not inside it.
    expect(s.body.y).toBeCloseTo(FLOOR + 1, 0);
  });

  it('cost nothing and hurt nobody in creative', () => {
    const { s, world } = make();
    s.setMode('creative');
    wall(world, CZ - 8);
    s.inventory.set(0, makeStack(I.ENDER_PEARL, 1));
    s.tick(idle({ right: true }));
    s.tick(idle());
    run(s, 3);
    expect(s.inventory.get(0)?.count).toBe(1);
    expect(s.body.z).toBeLessThan(CZ);
    expect(s.vitals.health).toBe(20);
  });

  it('take you to a mob they hit, and do it no harm', () => {
    const { s } = make();
    const m = s.mobs.spawn('cow', CX + 0.5, FLOOR + 1, CZ - 6.5);
    const h = m.health;
    s.inventory.set(0, makeStack(I.ENDER_PEARL, 1));
    s.tick(idle({ right: true }));
    s.tick(idle());
    run(s, 2);
    expect(m.health).toBe(h);
    expect(s.body.z).toBeLessThan(CZ - 3);
  });

  it('do nothing for the dead, and nothing when there is no room to stand', () => {
    const { s, world } = make();
    // The pearl lands in a one-block gap under a low ceiling: there is nowhere to put a person.
    for (let x = CX - 3; x <= CX + 3; x++) for (let z = CZ - 12; z <= CZ - 4; z++) for (let y = FLOOR + 2; y <= FLOOR + 3; y++) world.setBlock(x, y, z, B.STONE);
    s.pearlLand(CX + 0.5, FLOOR + 1.5, CZ - 8.5);
    expect(s.body.z).toBeCloseTo(CZ + 0.5, 1);
    expect(s.vitals.health).toBe(20);
  });
});
