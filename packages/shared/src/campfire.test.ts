import { describe, expect, it } from 'vitest';
import {
  B,
  BLOCKS,
  CAMPFIRE_COOK_SECONDS,
  GameSession,
  HeadlessWorld,
  I,
  WorldGenerator,
  campfireFood,
  campfireId,
  campfireInfo,
  canStayAt,
  findRecipe,
  makeStack,
  mulberry32,
  placementFor,
  toolId,
  tooltipLines,
  type InputFrame,
} from './index';

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
      world.setBlock(x, FLOOR, z, B.GRASS);
    }
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(11), mode: 'survival' });
  s.finishLoading();
  s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
  return { s, world };
}

const run = (s: GameSession, seconds: number, over: Partial<InputFrame> = {}) => {
  for (let i = 0; i < Math.round(seconds * 20); i++) s.tick(idle(over));
};

const grid = (cells: (number | null)[]) => cells.map((c) => (c ? makeStack(c, 1) : null));

function countOf(s: GameSession, id: number): number {
  let n = 0;
  for (let i = 0; i < s.inventory.size; i++) {
    const st = s.inventory.get(i);
    if (st?.id === id) n += st.count;
  }
  for (const d of s.drops.drops) if (d.stack.id === id) n += d.stack.count;
  return n;
}

describe('campfire', () => {
  const item = campfireId(0, true);

  it('is made from sticks, coal and any logs, and is placed burning, facing you', () => {
    const S = I.STICK;
    const C = I.COAL;
    const L = B.LOG;
    expect(findRecipe(grid([S, S, S, null, C, null, L, L, L]), 3, 3)?.result).toEqual({ id: item, count: 1 });
    expect(findRecipe(grid([S, S, S, null, C, null, B.BIRCH_LOG, B.BIRCH_LOG, B.BIRCH_LOG]), 3, 3)?.result.id).toBe(item);
    expect(findRecipe(grid([S, S, S, null, C, null, B.PLANKS, B.PLANKS, B.PLANKS]), 3, 3)).toBeNull();
    expect(BLOCKS[item].light).toBe(15);
    expect(BLOCKS[campfireId(1, false)].light).toBe(0);
    expect(BLOCKS[item].hardness).toBe(2);
    // yaw 0 looks toward -z, which is facing 3.
    expect(placementFor(item, 0, 1, 0, 0)).toBe(campfireId(3, true));
    const { world } = make();
    expect(canStayAt(item, world, CX, FLOOR + 1, CZ)).toBe(true);
    world.setBlock(CX, FLOOR + 1, CZ, item);
    expect(canStayAt(item, world, CX, FLOOR + 2, CZ)).toBe(false);
  });

  it('hurts whoever stands on it, and stops when the fire is out', () => {
    const { s, world } = make();
    world.setBlock(CX, FLOOR + 1, CZ, item);
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
    const before = s.vitals.health;
    s.tick(idle());
    expect(s.vitals.health).toBeLessThan(before);
    expect(s.vitals.lastDamage).toBe('campfire');
    expect(s.onFire).toBe(0);
    world.setBlock(CX, FLOOR + 1, CZ, campfireId(0, false));
    const held = s.vitals.health;
    s.tick(idle());
    expect(s.vitals.health).toBe(held);
  });

  it('cooks four foods in half a minute and pops the result off', () => {
    const { s, world } = make();
    const x = CX;
    const y = FLOOR + 1;
    const z = CZ - 3;
    world.setBlock(x, y, z, campfireId(3, true));
    const fire = s.blockEntities.campfire(x, y, z);
    expect(campfireFood(I.RAW_MEAT)).toBe(I.COOKED_MEAT);
    expect(campfireFood(I.POTATO)).toBe(I.BAKED_POTATO);
    expect(campfireFood(I.RAW_IRON)).toBeNull();
    expect(fire.add(I.RAW_MEAT)).toBe(true);
    expect(fire.add(I.MUTTON)).toBe(true);
    expect(fire.add(I.CHICKEN)).toBe(true);
    expect(fire.add(I.RABBIT)).toBe(true);
    expect(fire.add(I.POTATO)).toBe(false);
    run(s, CAMPFIRE_COOK_SECONDS + 1);
    expect(countOf(s, I.COOKED_MEAT)).toBe(1);
    expect(countOf(s, I.COOKED_MUTTON)).toBe(1);
    expect(countOf(s, I.COOKED_CHICKEN)).toBe(1);
    expect(countOf(s, I.COOKED_RABBIT)).toBe(1);
    expect(s.blockEntities.campfire(x, y, z).busy).toBe(false);
  });

  it('pauses while it is out, and a shovel, water or flint changes that', () => {
    const { s, world } = make();
    const x = CX;
    const y = FLOOR + 1;
    const z = CZ - 2;
    world.setBlock(x, y, z, campfireId(3, true));
    const look = { yaw: 0, pitch: -0.7 };
    s.inventory.set(0, makeStack(I.RAW_MEAT, 1));
    s.tick(idle({ ...look, right: true }));
    expect(s.blockEntities.campfire(x, y, z).busy).toBe(true);
    expect(s.blockEntities.foods()).toEqual([{ x, y, z, slots: [I.RAW_MEAT, 0, 0, 0] }]);
    s.inventory.set(0, makeStack(toolId('shovel', 'wood'), 1));
    s.tick(idle());
    s.tick(idle({ ...look, right: true }));
    expect(campfireInfo(world.getBlock(x, y, z))?.lit).toBe(false);
    run(s, 5);
    expect(countOf(s, I.COOKED_MEAT)).toBe(0);
    s.inventory.set(0, makeStack(I.FLINT_AND_STEEL, 1));
    s.tick(idle());
    s.tick(idle({ ...look, right: true }));
    expect(campfireInfo(world.getBlock(x, y, z))?.lit).toBe(true);
    s.inventory.set(0, makeStack(I.WATER_BUCKET, 1));
    s.tick(idle());
    s.tick(idle({ ...look, right: true }));
    expect(campfireInfo(world.getBlock(x, y, z))?.lit).toBe(false);
    expect(s.inventory.get(0)?.id).toBe(I.BUCKET);
  });

  it('drops the campfire and the raw food when it is broken', () => {
    const { s, world } = make();
    world.setBlock(CX, FLOOR + 1, CZ - 2, item);
    s.blockEntities.campfire(CX, FLOOR + 1, CZ - 2).add(I.RAW_MEAT);
    s.breakBlock(CX, FLOOR + 1, CZ - 2);
    const ids = s.drops.drops.map((d) => d.stack.id);
    expect(ids).toContain(item);
    expect(ids).toContain(I.RAW_MEAT);
    expect(world.getBlock(CX, FLOOR + 1, CZ - 2)).toBe(B.AIR);
  });

  it('says it cooks food', () => {
    const lines = tooltipLines(makeStack(item)).map((l) => l.text);
    expect(lines).toContain('Cooks food, four pieces at a time');
    expect(lines).toContain('A shovel puts the fire out');
  });
});
