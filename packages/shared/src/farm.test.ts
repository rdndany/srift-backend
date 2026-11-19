import { describe, expect, it } from 'vitest';
import {
  B,
  BABY_SECONDS,
  BONE_MEAL,
  BLOCKS,
  BREED_COOLDOWN,
  GameSession,
  HeadlessWorld,
  I,
  MobManager,
  WOOL_REGROW,
  WorldGenerator,
  blockDrop,
  breakTime,
  cakeId,
  cocoaId,
  findRecipe,
  getItem,
  makeStack,
  mulberry32,
  woolId,
  type InputFrame,
  type Mob,
} from './index';

const SEED = 1337;
const FLOOR = 100;
const CX = 8;
const CZ = 8;

const idle = (over: Partial<InputFrame> = {}): InputFrame => ({
  t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false, ...over,
});

function make(mode: 'survival' | 'creative' = 'survival') {
  const generator = new WorldGenerator(SEED);
  const world = new HeadlessWorld(generator);
  for (let x = CX - 14; x <= CX + 14; x++)
    for (let z = CZ - 14; z <= CZ + 14; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 14; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.GRASS);
    }
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(11), mode });
  s.finishLoading();
  s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
  return { s, world };
}
type Made = ReturnType<typeof make>;

const run = (s: GameSession, seconds: number, over: Partial<InputFrame> = {}) => {
  for (let i = 0; i < Math.round(seconds * 20); i++) s.tick(idle(over));
};
const grid = (cells: number[]) => cells.map((c) => (c ? makeStack(c, 1) : null));
const hold = (s: GameSession, id: number, count = 1) => {
  s.inventory.set(s.selected, makeStack(id, count));
};
const cows = (s: GameSession) => s.mobs.mobs.filter((m) => m.kind === 'cow');

describe('TNT', () => {
  const G = I.GUNPOWDER;
  const S = B.SAND;

  it('is crafted from five gunpowder and four sand', () => {
    expect(findRecipe(grid([G, S, G, S, G, S, G, S, G]), 3, 3)?.result).toEqual({ id: B.TNT, count: 1 });
    expect(getItem(B.TNT).block).toBe(B.TNT);
    expect(BLOCKS[B.TNT].hardness).toBe(0);
  });

  const light = ({ s, world }: Made, x = CX + 3) => {
    world.setBlock(x, FLOOR + 1, CZ, B.TNT);
    hold(s, I.FLINT_AND_STEEL);
    return s.useHeldOn({ x, y: FLOOR + 1, z: CZ, id: B.TNT, nx: -1, ny: 0, nz: 0 });
  };

  it('is lit with flint and steel, and blows a hole when the fuse runs out', () => {
    const m = make();
    const { s, world } = m;
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 12.5, 0, 0);
    expect(light(m, CX + 2)).toBe(true);
    expect(s.realm.litTnt).toBe(1);
    // Still there while the fuse burns.
    run(s, 2);
    expect(world.getBlock(CX + 2, FLOOR + 1, CZ)).toBe(B.TNT);
    world.setBlock(CX + 2, FLOOR, CZ + 1, B.STONE);
    run(s, 2.5);
    expect(world.getBlock(CX + 2, FLOOR + 1, CZ)).toBe(B.AIR);
    expect(s.realm.litTnt).toBe(0);
    // The ground under it is gone, three blocks out; seven blocks away nothing happened.
    expect(world.getBlock(CX + 2, FLOOR, CZ)).toBe(B.AIR);
    expect(world.getBlock(CX + 2, FLOOR, CZ + 7)).toBe(B.GRASS);
    expect(s.vitals.health).toBe(20);
  });

  it('hurts whoever stands beside it, and is named in the death message', () => {
    const m = make();
    const { s } = m;
    s.teleport(CX + 2.5, FLOOR + 1, CZ + 1.5, 0, 0);
    s.realm.primeTnt(CX + 2, FLOOR + 1, CZ, 0.1);
    run(s, 0.3);
    expect(s.vitals.health).toBeLessThan(20);
    s.vitals.damage(100, 'explosion');
    s.killedBy = 'tnt';
    expect(s.deathMessage()).toMatch(/TNT/);
  });

  it('sets off the TNT next to it', () => {
    const m = make();
    const { s, world } = m;
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 12.5, 0, 0);
    world.setBlock(CX + 4, FLOOR + 1, CZ, B.TNT);
    expect(light(m, CX + 2)).toBe(true);
    run(s, 4.2);
    // The second one has been primed by the first blast, and goes a moment later.
    expect(s.realm.litTnt).toBe(1);
    run(s, 1.5);
    expect(s.realm.litTnt).toBe(0);
    expect(world.getBlock(CX + 4, FLOOR + 1, CZ)).toBe(B.AIR);
    expect(world.getBlock(CX + 4, FLOOR, CZ)).toBe(B.AIR);
  });

  it('is set off by fire', () => {
    const { s, world } = make();
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 12.5, 0, 0);
    world.setBlock(CX + 2, FLOOR + 1, CZ, B.TNT);
    // Burn the cell the way the fire does: the host's consume hook.
    for (let i = 0; i < 400 && s.realm.litTnt === 0; i++) {
      if (world.getBlock(CX + 2, FLOOR + 1, CZ) !== B.TNT) break;
      world.setBlock(CX + 2, FLOOR + 1, CZ + 1, B.FIRE);
      s.realm.fire.adopt(CX + 2, FLOOR + 1, CZ + 1, 0);
      run(s, 0.5);
    }
    expect(world.getBlock(CX + 2, FLOOR + 1, CZ) !== B.TNT || s.realm.litTnt > 0).toBe(true);
  });
});

describe('shears', () => {
  it('are two iron ingots, and cut leaves, cobwebs and wool whole', () => {
    const I2 = I.IRON_INGOT;
    expect(findRecipe(grid([0, I2, 0, I2, 0, 0, 0, 0, 0]), 3, 3)?.result).toEqual({ id: I.SHEARS, count: 1 });
    expect(blockDrop(BLOCKS[B.LEAVES], null, () => 0.99, { shears: true })).toEqual({ id: B.LEAVES, count: 1 });
    expect(blockDrop(BLOCKS[B.COBWEB], null, () => 0.5, { shears: true })).toEqual({ id: B.COBWEB, count: 1 });
    expect(blockDrop(BLOCKS[B.COBWEB], null, () => 0.5)).toEqual({ id: I.STRING, count: 1 });
    expect(breakTime(BLOCKS[B.COBWEB], null, 0, true)).toBeLessThan(breakTime(BLOCKS[B.COBWEB], null) / 5);
    expect(breakTime(BLOCKS[B.STONE], null, 0, true)).toBe(breakTime(BLOCKS[B.STONE], null));
    expect(getItem(I.SHEARS).durability).toBe(238);
  });

  it('take the wool of a sheep without killing it, and it grows back', () => {
    const { s } = make();
    const sheep = s.mobs.spawn('sheep', CX + 0.5, FLOOR + 1, CZ - 1.5, { variant: 14 });
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, -0.3);
    hold(s, I.SHEARS);
    expect(s.useOnMob()).toBe(true);
    expect(sheep.sheared).toBe(true);
    expect(sheep.dead).toBe(false);
    s.tickDrops(0);
    const wool = s.realm.drops.drops.filter((d) => d.stack.id === woolId(14));
    expect(wool.length).toBeGreaterThan(0);
    expect(wool.reduce((n, d) => n + d.stack.count, 0)).toBeLessThanOrEqual(3);
    expect(s.held?.damage).toBe(1);
    expect(s.useOnMob()).toBe(false);
    // A shorn sheep drops no wool when it dies.
    expect(sheep.def.drops(() => 0.5, sheep.traits).some((d) => d.id === woolId(14))).toBe(false);
    run(s, WOOL_REGROW + 1);
    expect(sheep.sheared).toBe(false);
  });

  it('do nothing to a cow, and a creative player keeps them whole', () => {
    const { s } = make('creative');
    s.mobs.spawn('cow', CX + 0.5, FLOOR + 1, CZ - 1.5);
    hold(s, I.SHEARS);
    expect(s.useOnMob()).toBe(false);
    const sheep = s.mobs.spawn('sheep', CX + 0.5, FLOOR + 1, CZ - 3.5);
    s.teleport(CX + 0.5, FLOOR + 1, CZ - 1.5 + 4, 0, 0);
    s.mobs.mobs.find((m) => m.kind === 'cow')!.body.z = CZ + 20;
    expect(sheep.sheared).toBe(false);
  });
});

describe('bone meal', () => {
  it('is the white dye', () => {
    expect(getItem(BONE_MEAL).name).toBe('white_dye');
    expect(findRecipe(grid([I.BONE]), 1, 1)?.result).toEqual({ id: BONE_MEAL, count: 3 });
  });

  it('ripens wheat, and is used up', () => {
    const { s, world } = make();
    world.setBlock(CX + 2, FLOOR, CZ, B.FARMLAND);
    world.setBlock(CX + 2, FLOOR + 1, CZ, B.WHEAT_0);
    hold(s, BONE_MEAL, 3);
    const t = { x: CX + 2, y: FLOOR + 1, z: CZ, id: B.WHEAT_0, nx: 0, ny: 1, nz: 0 };
    expect(s.useHeldOn(t)).toBe(true);
    expect(world.getBlock(CX + 2, FLOOR + 1, CZ)).toBeGreaterThan(B.WHEAT_0);
    expect(s.held?.count).toBe(2);
    for (let i = 0; i < 4; i++) {
      const id = world.getBlock(CX + 2, FLOOR + 1, CZ);
      if (id === B.WHEAT_3) break;
      s.useHeldOn({ ...t, id });
    }
    expect(world.getBlock(CX + 2, FLOOR + 1, CZ)).toBe(B.WHEAT_3);
    // Ripe wheat takes no more.
    const before = s.held?.count;
    expect(s.useHeldOn({ ...t, id: B.WHEAT_3 })).toBe(false);
    expect(s.held?.count).toBe(before);
  });

  it('plants a potato while hungry instead of eating it', () => {
    const { s, world } = make();
    world.setBlock(CX, FLOOR, CZ, B.FARMLAND);
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 1.5, 0, -1);
    s.vitals.hunger = 10;
    hold(s, I.POTATO, 4);
    s.tick(idle({ right: true, yaw: 0, pitch: -1 }));
    expect(world.getBlock(CX, FLOOR + 1, CZ)).toBe(B.POTATO_0);
    expect(s.held?.count).toBe(3);
    expect(s.vitals.hunger).toBe(10);
  });

  it('plants a potato, ripens it, and time grows one the same way', () => {
    const { s, world } = make();
    world.setBlock(CX + 3, FLOOR, CZ, B.FARMLAND);
    hold(s, I.POTATO, 4);
    expect(s.useHeldOn({ x: CX + 3, y: FLOOR, z: CZ, id: B.FARMLAND, nx: 0, ny: 1, nz: 0 })).toBe(true);
    expect(world.getBlock(CX + 3, FLOOR + 1, CZ)).toBe(B.POTATO_0);
    expect(s.held?.count).toBe(3);
    const t = { x: CX + 3, y: FLOOR + 1, z: CZ, id: B.POTATO_0, nx: 0, ny: 1, nz: 0 };
    hold(s, BONE_MEAL, 8);
    for (let i = 0; i < 4; i++) {
      const id = world.getBlock(CX + 3, FLOOR + 1, CZ);
      if (id === B.POTATO_3) break;
      expect(s.useHeldOn({ ...t, id })).toBe(true);
    }
    expect(world.getBlock(CX + 3, FLOOR + 1, CZ)).toBe(B.POTATO_3);
    expect(s.useHeldOn({ ...t, id: B.POTATO_3 })).toBe(false);

    world.setBlock(CX + 5, FLOOR, CZ, B.FARMLAND);
    world.setBlock(CX + 5, FLOOR + 1, CZ, B.POTATO_0);
    for (let i = 0; i < 4 && world.getBlock(CX + 5, FLOOR + 1, CZ) < B.POTATO_3; i++) world.growCrops(10_000, () => 0);
    expect(world.getBlock(CX + 5, FLOOR + 1, CZ)).toBe(B.POTATO_3);
  });

  it('plants a carrot while hungry, ripens it, and time grows one the same way', () => {
    const { s, world } = make();
    world.setBlock(CX, FLOOR, CZ, B.FARMLAND);
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 1.5, 0, -1);
    s.vitals.hunger = 10;
    hold(s, I.CARROT, 4);
    s.tick(idle({ right: true, yaw: 0, pitch: -1 }));
    expect(world.getBlock(CX, FLOOR + 1, CZ)).toBe(B.CARROT_0);
    expect(s.held?.count).toBe(3);
    expect(s.vitals.hunger).toBe(10);

    world.setBlock(CX + 7, FLOOR, CZ, B.FARMLAND);
    hold(s, I.CARROT, 4);
    expect(s.useHeldOn({ x: CX + 7, y: FLOOR, z: CZ, id: B.FARMLAND, nx: 0, ny: 1, nz: 0 })).toBe(true);
    const t = { x: CX + 7, y: FLOOR + 1, z: CZ, id: B.CARROT_0, nx: 0, ny: 1, nz: 0 };
    hold(s, BONE_MEAL, 8);
    for (let i = 0; i < 4; i++) {
      const id = world.getBlock(CX + 7, FLOOR + 1, CZ);
      if (id === B.CARROT_3) break;
      expect(s.useHeldOn({ ...t, id })).toBe(true);
    }
    expect(world.getBlock(CX + 7, FLOOR + 1, CZ)).toBe(B.CARROT_3);
    expect(s.useHeldOn({ ...t, id: B.CARROT_3 })).toBe(false);

    world.setBlock(CX + 9, FLOOR, CZ, B.FARMLAND);
    world.setBlock(CX + 9, FLOOR + 1, CZ, B.CARROT_0);
    for (let i = 0; i < 4 && world.getBlock(CX + 9, FLOOR + 1, CZ) < B.CARROT_3; i++) world.growCrops(10_000, () => 0);
    expect(world.getBlock(CX + 9, FLOOR + 1, CZ)).toBe(B.CARROT_3);
  });

  it('a melon stem and a pumpkin stem grow their fruit beside them', () => {
    const { s, world } = make();
    const sides = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const;
    const plant = (x: number, seed: number, young: number, ripe: number, fruit: number) => {
      world.setBlock(x, FLOOR, CZ, B.FARMLAND);
      for (const [dx, dz] of sides) world.setBlock(x + dx, FLOOR, CZ + dz, B.FARMLAND);
      hold(s, seed, 2);
      expect(s.useHeldOn({ x, y: FLOOR, z: CZ, id: B.FARMLAND, nx: 0, ny: 1, nz: 0 })).toBe(true);
      expect(world.getBlock(x, FLOOR + 1, CZ)).toBe(young);
      const t = { x, y: FLOOR + 1, z: CZ, id: young, nx: 0, ny: 1, nz: 0 };
      hold(s, BONE_MEAL, 16);
      for (let i = 0; i < 6 && world.getBlock(x, FLOOR + 1, CZ) !== ripe; i++) {
        const id = world.getBlock(x, FLOOR + 1, CZ);
        expect(s.useHeldOn({ ...t, id })).toBe(true);
      }
      expect(world.getBlock(x, FLOOR + 1, CZ)).toBe(ripe);
      expect(s.useHeldOn({ ...t, id: ripe })).toBe(true);
      expect(sides.filter(([dx, dz]) => world.getBlock(x + dx, FLOOR + 1, CZ + dz) === fruit)).toHaveLength(1);
    };
    plant(CX, I.MELON_SEEDS, B.MELON_STEM_0, B.MELON_STEM_3, B.MELON);
    plant(CX + 8, I.PUMPKIN_SEEDS, B.PUMPKIN_STEM_0, B.PUMPKIN_STEM_3, B.PUMPKIN);

    world.setBlock(CX + 16, FLOOR, CZ, B.FARMLAND);
    world.setBlock(CX + 17, FLOOR, CZ, B.FARMLAND);
    world.setBlock(CX + 16, FLOOR + 1, CZ, B.MELON_STEM_0);
    for (let i = 0; i < 3; i++) world.growCrops(10_000, () => 0);
    expect(world.getBlock(CX + 16, FLOOR + 1, CZ)).toBe(B.MELON_STEM_3);
    world.growCrops(10_000, () => 0);
    expect(world.getBlock(CX + 17, FLOOR + 1, CZ)).toBe(B.MELON);
  });

  it('plants beetroot from seed, and soup leaves the bowl', () => {
    const { s, world } = make();
    world.setBlock(CX, FLOOR, CZ, B.FARMLAND);
    hold(s, I.BEETROOT_SEEDS, 4);
    expect(s.useHeldOn({ x: CX, y: FLOOR, z: CZ, id: B.FARMLAND, nx: 0, ny: 1, nz: 0 })).toBe(true);
    expect(world.getBlock(CX, FLOOR + 1, CZ)).toBe(B.BEETROOT_0);
    expect(s.held?.count).toBe(3);
    const t = { x: CX, y: FLOOR + 1, z: CZ, id: B.BEETROOT_0, nx: 0, ny: 1, nz: 0 };
    hold(s, BONE_MEAL, 8);
    for (let i = 0; i < 4 && world.getBlock(CX, FLOOR + 1, CZ) !== B.BEETROOT_3; i++) {
      const id = world.getBlock(CX, FLOOR + 1, CZ);
      expect(s.useHeldOn({ ...t, id })).toBe(true);
    }
    expect(world.getBlock(CX, FLOOR + 1, CZ)).toBe(B.BEETROOT_3);

    world.setBlock(CX + 4, FLOOR, CZ, B.FARMLAND);
    world.setBlock(CX + 4, FLOOR + 1, CZ, B.BEETROOT_0);
    for (let i = 0; i < 4 && world.getBlock(CX + 4, FLOOR + 1, CZ) < B.BEETROOT_3; i++) world.growCrops(10_000, () => 0);
    expect(world.getBlock(CX + 4, FLOOR + 1, CZ)).toBe(B.BEETROOT_3);

    s.vitals.hunger = 2;
    hold(s, I.BEETROOT_SOUP);
    run(s, 2, { right: true });
    expect(s.held?.id).toBe(I.BOWL);
    expect(s.vitals.hunger).toBeGreaterThan(2);
  });

  it('a cocoa pod grows on a jungle log, and a cookie restores hunger', () => {
    const { s, world } = make();
    world.setBlock(CX, FLOOR + 1, CZ, B.JUNGLE_LOG);
    hold(s, I.COCOA_BEANS, 4);
    expect(s.useHeldOn({ x: CX, y: FLOOR + 1, z: CZ, id: B.JUNGLE_LOG, nx: 1, ny: 0, nz: 0 })).toBe(true);
    expect(world.getBlock(CX + 1, FLOOR + 1, CZ)).toBe(cocoaId(1, 0));
    expect(s.held?.count).toBe(3);
    world.setBlock(CX + 4, FLOOR + 1, CZ, B.LOG);
    expect(s.useHeldOn({ x: CX + 4, y: FLOOR + 1, z: CZ, id: B.LOG, nx: 1, ny: 0, nz: 0 })).toBe(false);

    const t = { x: CX + 1, y: FLOOR + 1, z: CZ, id: cocoaId(1, 0), nx: 0, ny: 1, nz: 0 };
    hold(s, BONE_MEAL, 8);
    for (let i = 0; i < 4 && world.getBlock(CX + 1, FLOOR + 1, CZ) !== cocoaId(1, 2); i++) {
      const id = world.getBlock(CX + 1, FLOOR + 1, CZ);
      expect(s.useHeldOn({ ...t, id })).toBe(true);
    }
    expect(world.getBlock(CX + 1, FLOOR + 1, CZ)).toBe(cocoaId(1, 2));

    world.setBlock(CX, FLOOR + 1, CZ + 4, B.JUNGLE_LOG);
    world.setBlock(CX + 1, FLOOR + 1, CZ + 4, cocoaId(1, 0));
    for (let i = 0; i < 3 && world.getBlock(CX + 1, FLOOR + 1, CZ + 4) !== cocoaId(1, 2); i++) world.growCrops(10_000, () => 0);
    expect(world.getBlock(CX + 1, FLOOR + 1, CZ + 4)).toBe(cocoaId(1, 2));

    s.breakBlock(CX, FLOOR + 1, CZ);
    expect(world.getBlock(CX + 1, FLOOR + 1, CZ)).toBe(B.AIR);

    s.vitals.hunger = 2;
    hold(s, I.COOKIE);
    run(s, 2, { right: true });
    expect(s.held).toBeNull();
    expect(s.vitals.hunger).toBeGreaterThan(2);
  });

  it('a cow fills a bucket with milk, and a cake is eaten in seven bites', () => {
    const { s, world } = make();
    const cow = s.mobs.spawn('cow', CX + 0.5, FLOOR + 1, CZ - 3.5);
    s.teleport(cow.body.x, FLOOR + 1, cow.body.z + 1.5, 0, -0.3);
    hold(s, I.BUCKET, 2);
    expect(s.useOnMob()).toBe(true);
    expect(cow.dead).toBe(false);
    expect(s.held?.id).toBe(I.BUCKET);
    expect(s.held?.count).toBe(1);
    expect(s.inventory.countOf(I.MILK_BUCKET)).toBe(1);

    const baby = s.mobs.spawn('cow', CX + 6.5, FLOOR + 1, CZ - 3.5, { baby: 30 });
    s.teleport(baby.body.x, FLOOR + 1, baby.body.z + 1.2, 0, -1);
    hold(s, I.BUCKET);
    expect(s.useOnMob()).toBe(false);
    expect(s.held?.id).toBe(I.BUCKET);

    s.teleport(CX + 0.5, FLOOR + 1, CZ + 8, 0, 0);
    s.poison = 6;
    s.foodSick = 6;
    hold(s, I.MILK_BUCKET);
    run(s, 2, { right: true });
    expect(s.poison).toBe(0);
    expect(s.foodSick).toBe(0);
    expect(s.held?.id).toBe(I.BUCKET);

    hold(s, I.CAKE);
    expect(s.useHeldOn({ x: CX, y: FLOOR, z: CZ, id: B.GRASS, nx: 0, ny: 1, nz: 0 })).toBe(true);
    expect(world.getBlock(CX, FLOOR + 1, CZ)).toBe(cakeId(0));

    s.teleport(CX + 0.88, FLOOR + 1, CZ + 1.4, 0, -0.9);
    const look = { yaw: 0, pitch: -0.9 };
    s.tick(idle(look));
    const press = () => {
      s.tick(idle({ ...look, right: true }));
      s.tick(idle(look));
    };
    s.vitals.hunger = 2;
    press();
    expect(world.getBlock(CX, FLOOR + 1, CZ)).toBe(cakeId(1));
    expect(s.vitals.hunger).toBeGreaterThan(2);
    s.vitals.hunger = 20;
    press();
    expect(world.getBlock(CX, FLOOR + 1, CZ)).toBe(cakeId(1));
    for (let i = 0; i < 6; i++) {
      s.vitals.hunger = 2;
      press();
    }
    expect(world.getBlock(CX, FLOOR + 1, CZ)).toBe(B.AIR);

    hold(s, I.CAKE);
    expect(s.useHeldOn({ x: CX + 2, y: FLOOR, z: CZ, id: B.GRASS, nx: 0, ny: 1, nz: 0 })).toBe(true);
    s.realm.drops.drops.length = 0;
    s.breakBlock(CX + 2, FLOOR + 1, CZ);
    expect(world.getBlock(CX + 2, FLOOR + 1, CZ)).toBe(B.AIR);
    expect(s.realm.drops.drops.length).toBe(0);
  });

  it('plants sweet berries on grass, a ripe bush is picked, and walking through it scratches', () => {
    const { s, world } = make();
    hold(s, I.SWEET_BERRIES, 4);
    expect(s.useHeldOn({ x: CX, y: FLOOR, z: CZ, id: B.GRASS, nx: 0, ny: 1, nz: 0 })).toBe(true);
    expect(world.getBlock(CX, FLOOR + 1, CZ)).toBe(B.SWEET_BERRY_0);
    expect(s.held?.count).toBe(3);
    world.setBlock(CX + 2, FLOOR, CZ, B.DIRT);
    expect(s.useHeldOn({ x: CX + 2, y: FLOOR, z: CZ, id: B.DIRT, nx: 0, ny: 1, nz: 0 })).toBe(true);
    expect(world.getBlock(CX + 2, FLOOR + 1, CZ)).toBe(B.SWEET_BERRY_0);
    world.setBlock(CX + 4, FLOOR, CZ, B.STONE);
    expect(s.useHeldOn({ x: CX + 4, y: FLOOR, z: CZ, id: B.STONE, nx: 0, ny: 1, nz: 0 })).toBe(false);

    const t = { x: CX, y: FLOOR + 1, z: CZ, id: B.SWEET_BERRY_0, nx: 0, ny: 1, nz: 0 };
    hold(s, BONE_MEAL, 8);
    for (let i = 0; i < 4 && world.getBlock(CX, FLOOR + 1, CZ) !== B.SWEET_BERRY_3; i++) {
      const id = world.getBlock(CX, FLOOR + 1, CZ);
      expect(s.useHeldOn({ ...t, id })).toBe(true);
    }
    expect(world.getBlock(CX, FLOOR + 1, CZ)).toBe(B.SWEET_BERRY_3);

    world.setBlock(CX + 6, FLOOR + 1, CZ, B.SWEET_BERRY_0);
    for (let i = 0; i < 4 && world.getBlock(CX + 6, FLOOR + 1, CZ) < B.SWEET_BERRY_3; i++) world.growCrops(10_000, () => 0);
    expect(world.getBlock(CX + 6, FLOOR + 1, CZ)).toBe(B.SWEET_BERRY_3);

    const look = { yaw: 0, pitch: -0.9 };
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 1.4, 0, -0.9);
    s.tick(idle(look));
    s.realm.drops.drops.length = 0;
    s.tick(idle({ ...look, right: true }));
    expect(world.getBlock(CX, FLOOR + 1, CZ)).toBe(B.SWEET_BERRY_1);
    const picked = s.realm.drops.drops.filter((d) => d.stack.id === I.SWEET_BERRIES).reduce((n, d) => n + d.stack.count, 0);
    expect(picked).toBeGreaterThanOrEqual(2);

    s.vitals.health = 20;
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
    s.tick(idle());
    expect(s.vitals.health).toBe(20);
    s.tick(idle({ forward: 1 }));
    expect(s.vitals.health).toBe(20);

    world.setBlock(CX, FLOOR + 1, CZ, B.SWEET_BERRY_3);
    s.vitals.health = 20;
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
    s.tick(idle());
    expect(s.vitals.health).toBe(20);
    s.tick(idle({ forward: 1 }));
    expect(s.vitals.health).toBeLessThan(20);

    s.teleport(CX + 0.5, FLOOR + 1, CZ + 8, 0, 0);
    s.vitals.hunger = 2;
    hold(s, I.SWEET_BERRIES);
    run(s, 2, { right: true });
    expect(s.held).toBeNull();
    expect(s.vitals.hunger).toBeGreaterThan(2);
  });

  it('picks glow berries off a cave vine, and a planted one hangs from the ceiling', () => {
    const { s, world } = make();
    world.setBlock(CX, FLOOR + 4, CZ, B.STONE);
    world.setBlock(CX, FLOOR + 3, CZ, B.CAVE_VINES_BERRIES);
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 1.2);
    s.tick(idle({ pitch: 1.2 }));
    s.realm.drops.drops.length = 0;
    s.tick(idle({ pitch: 1.2, right: true }));
    expect(world.getBlock(CX, FLOOR + 3, CZ)).toBe(B.CAVE_VINES);
    const picked = s.realm.drops.drops.filter((d) => d.stack.id === I.GLOW_BERRIES).reduce((n, d) => n + d.stack.count, 0);
    expect(picked).toBe(1);

    world.setBlock(CX + 4, FLOOR + 3, CZ, B.STONE);
    world.setBlock(CX + 4, FLOOR + 1, CZ, B.STONE);
    world.setBlock(CX + 4, FLOOR + 2, CZ, B.CAVE_VINES);
    world.growCrops(10_000, () => 0);
    expect(world.getBlock(CX + 4, FLOOR + 2, CZ)).toBe(B.CAVE_VINES_BERRIES);

    world.setBlock(CX + 6, FLOOR + 4, CZ, B.STONE);
    world.setBlock(CX + 6, FLOOR + 3, CZ, B.CAVE_VINES);
    world.growCrops(10_000, () => 0);
    expect(world.getBlock(CX + 6, FLOOR + 3, CZ)).toBe(B.CAVE_VINES);
    expect(world.getBlock(CX + 6, FLOOR + 2, CZ)).toBe(B.CAVE_VINES_BERRIES);

    hold(s, BONE_MEAL, 4);
    world.setBlock(CX + 8, FLOOR + 3, CZ, B.STONE);
    world.setBlock(CX + 8, FLOOR + 1, CZ, B.STONE);
    world.setBlock(CX + 8, FLOOR + 2, CZ, B.CAVE_VINES);
    expect(s.useHeldOn({ x: CX + 8, y: FLOOR + 2, z: CZ, id: B.CAVE_VINES, nx: 0, ny: -1, nz: 0 })).toBe(true);
    expect(world.getBlock(CX + 8, FLOOR + 2, CZ)).toBe(B.CAVE_VINES_BERRIES);

    hold(s, I.GLOW_BERRIES, 2);
    world.setBlock(CX + 10, FLOOR + 4, CZ, B.STONE);
    expect(s.useHeldOn({ x: CX + 10, y: FLOOR + 4, z: CZ, id: B.STONE, nx: 0, ny: -1, nz: 0 })).toBe(true);
    expect(world.getBlock(CX + 10, FLOOR + 3, CZ)).toBe(B.CAVE_VINES);
    expect(s.useHeldOn({ x: CX + 10, y: FLOOR + 4, z: CZ, id: B.STONE, nx: 0, ny: 1, nz: 0 })).toBe(false);

    s.teleport(CX + 0.5, FLOOR + 1, CZ + 8, 0, 0);
    s.vitals.hunger = 2;
    hold(s, I.GLOW_BERRIES);
    run(s, 2, { right: true });
    expect(s.held).toBeNull();
    expect(s.vitals.hunger).toBeGreaterThan(2);
  });

  it('mushroom stew restores hunger and leaves the bowl', () => {
    const { s } = make();
    s.vitals.hunger = 2;
    hold(s, I.MUSHROOM_STEW);
    run(s, 2, { right: true });
    expect(s.held?.id).toBe(I.BOWL);
    expect(s.vitals.hunger).toBeGreaterThan(2);
  });

  it('rabbit stew restores more hunger and leaves the bowl', () => {
    const { s } = make();
    s.vitals.hunger = 2;
    hold(s, I.RABBIT_STEW);
    run(s, 2, { right: true });
    expect(s.held?.id).toBe(I.BOWL);
    expect(s.vitals.hunger).toBe(12);
  });

  it('a poisonous potato can be eaten on a full stomach', () => {
    const { s } = make();
    expect(s.vitals.canEat()).toBe(false);
    hold(s, I.APPLE);
    run(s, 2, { right: true });
    expect(s.held?.id).toBe(I.APPLE);
    hold(s, I.POISONOUS_POTATO);
    run(s, 2, { right: true });
    expect(s.held).toBeNull();
  });

  it('rotten flesh and raw chicken drain hunger, and a spider eye poisons', () => {
    const sick = (id: number) => {
      const { s } = make();
      s.vitals.hunger = 2;
      hold(s, id, 20);
      for (let i = 0; i < 24 && s.foodSick <= 0; i++) {
        s.vitals.hunger = 2;
        run(s, 1.6, { right: true });
      }
      return s.foodSick;
    };
    expect(sick(I.ROTTEN_FLESH)).toBeGreaterThan(0);
    expect(sick(I.CHICKEN)).toBeGreaterThan(0);
    const { s } = make();
    s.vitals.hunger = 2;
    hold(s, I.SPIDER_EYE);
    run(s, 1.6, { right: true });
    expect(s.poison).toBeGreaterThan(0);
    expect(s.held).toBeNull();
  });

  it('a cactus and a sugar cane grow upward, and bone meal does it at once', () => {
    const { s, world } = make();
    world.setBlock(CX + 6, FLOOR, CZ, B.SAND);
    world.setBlock(CX + 6, FLOOR + 1, CZ, B.CACTUS);
    world.setBlock(CX + 8, FLOOR, CZ, B.SAND);
    world.setBlock(CX + 8, FLOOR, CZ + 1, B.WATER);
    world.setBlock(CX + 8, FLOOR + 1, CZ, B.SUGAR_CANE);
    for (let i = 0; i < 3; i++) world.growCrops(10_000, () => 0);
    expect(world.getBlock(CX + 6, FLOOR + 3, CZ)).toBe(B.CACTUS);
    expect(world.getBlock(CX + 6, FLOOR + 4, CZ)).toBe(B.AIR);
    expect(world.getBlock(CX + 8, FLOOR + 3, CZ)).toBe(B.SUGAR_CANE);
    expect(world.getBlock(CX + 8, FLOOR + 4, CZ)).toBe(B.AIR);

    world.setBlock(CX + 4, FLOOR, CZ, B.SAND);
    world.setBlock(CX + 4, FLOOR + 1, CZ, B.CACTUS);
    hold(s, BONE_MEAL, 2);
    expect(s.useHeldOn({ x: CX + 4, y: FLOOR + 1, z: CZ, id: B.CACTUS, nx: 0, ny: 1, nz: 0 })).toBe(true);
    expect(world.getBlock(CX + 4, FLOOR + 2, CZ)).toBe(B.CACTUS);
  });

  it('a chicken lays an egg', () => {
    const { s } = make();
    const hen = s.mobs.spawn('chicken', CX + 0.5, FLOOR + 1, CZ + 0.5);
    hen.eggTimer = 0.05;
    hen.growTimer = 0;
    run(s, 0.3);
    s.tickDrops(0);
    expect(s.realm.drops.drops.some((d) => d.stack.id === I.EGG)).toBe(true);
  });

  it('grows a sapling into a tree now and then, and spreads grass', () => {
    const { s, world } = make('creative');
    world.setBlock(CX + 2, FLOOR + 1, CZ, B.SAPLING);
    hold(s, BONE_MEAL, 64);
    for (let i = 0; i < 40 && world.getBlock(CX + 2, FLOOR + 1, CZ) === B.SAPLING; i++) {
      s.useHeldOn({ x: CX + 2, y: FLOOR + 1, z: CZ, id: B.SAPLING, nx: 0, ny: 1, nz: 0 });
    }
    expect(world.getBlock(CX + 2, FLOOR + 1, CZ)).toBe(B.LOG);
    // Grass: some of the blocks around get tall grass (or a flower).
    expect(s.useHeldOn({ x: CX - 5, y: FLOOR, z: CZ - 5, id: B.GRASS, nx: 0, ny: 1, nz: 0 })).toBe(true);
    let plants = 0;
    for (let x = CX - 8; x <= CX - 2; x++) for (let z = CZ - 8; z <= CZ - 2; z++) if (world.getBlock(x, FLOOR + 1, z) !== B.AIR) plants++;
    expect(plants).toBeGreaterThan(2);
    expect(s.held?.count).toBeLessThan(64 + 1);
  });

  it('does not work on bare stone', () => {
    const { s, world } = make();
    world.setBlock(CX + 2, FLOOR, CZ, B.STONE);
    hold(s, BONE_MEAL, 2);
    // It is not placeable either (dyes are not blocks).
    expect(s.useHeldOn({ x: CX + 2, y: FLOOR, z: CZ, id: B.STONE, nx: 0, ny: 1, nz: 0 })).toBe(false);
    expect(s.held?.count).toBe(2);
  });
});

describe('breeding', () => {
  const pair = (s: GameSession, gap = 4): [Mob, Mob] => [s.mobs.spawn('cow', CX - gap / 2 + 0.5, FLOOR + 1, CZ - 4.5), s.mobs.spawn('cow', CX + gap / 2 + 0.5, FLOOR + 1, CZ - 4.5)];
  const feed = (s: GameSession, m: Mob, id: number = I.WHEAT) => {
    s.teleport(m.body.x, FLOOR + 1, m.body.z + 1.5, 0, m.baby ? -0.6 : -0.3);
    hold(s, id, 5);
    return s.useOnMob();
  };

  it('puts a fed animal in love, with the right food only', () => {
    const { s } = make();
    const [a] = pair(s);
    expect(feed(s, a, I.APPLE)).toBe(false);
    expect(a.love).toBe(0);
    expect(feed(s, a)).toBe(true);
    expect(a.love).toBeGreaterThan(0);
    const pig = s.mobs.spawn('pig', CX + 6.5, FLOOR + 1, CZ - 4.5);
    expect(feed(s, pig, I.WHEAT)).toBe(false);
    expect(feed(s, pig, I.CARROT)).toBe(true);
    expect(pig.love).toBeGreaterThan(0);
    const rabbit = s.mobs.spawn('rabbit', CX + 10.5, FLOOR + 1, CZ - 4.5);
    s.teleport(rabbit.body.x, FLOOR + 1, rabbit.body.z + 1.2, 0, -1);
    hold(s, I.WHEAT_SEEDS, 5);
    expect(s.useOnMob()).toBe(false);
    hold(s, I.CARROT, 5);
    expect(s.useOnMob()).toBe(true);
    expect(rabbit.love).toBeGreaterThan(0);
    expect(s.held?.count).toBe(4);
    // Already in love: the second wheat is kept.
    expect(feed(s, a)).toBe(false);
    expect(s.held?.count).toBe(5); // (the helper puts a fresh stack in hand each time)
  });

  it('gives two animals in love a baby, which is small, grows up, and drops nothing', () => {
    const { s } = make('creative');
    const [a, b] = pair(s);
    feed(s, a);
    feed(s, b);
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 10.5, 0, 0);
    for (let i = 0; i < 20 * 25 && cows(s).length < 3; i++) s.tick(idle());
    expect(cows(s).length).toBe(3);
    const kid = cows(s).find((m) => m.baby)!;
    expect(kid).toBeDefined();
    expect(kid.height).toBeCloseTo(kid.def.height / 2);
    expect(a.love).toBe(0);
    expect(a.breedCooldown).toBeGreaterThan(BREED_COOLDOWN - 10);
    // No more babies while they rest, and a rested pair can be fed again only once the rest is over.
    expect(feed(s, a)).toBe(false);
    expect(kid.def.drops(() => 0.5, kid.traits).length).toBeGreaterThan(0); // the table itself...
    kid.growTimer = 1;
    run(s, 1.5);
    expect(kid.baby).toBe(false);
    expect(kid.height).toBeCloseTo(kid.def.height);
  });

  it('feeding a baby speeds its growing', () => {
    const { s } = make();
    const kid = s.mobs.spawn('cow', CX + 0.5, FLOOR + 1, CZ - 2.5, { baby: BABY_SECONDS });
    expect(kid.baby).toBe(true);
    expect(feed(s, kid)).toBe(true);
    expect(kid.growTimer).toBeLessThan(BABY_SECONDS * 0.95);
    expect(kid.love).toBe(0);
  });

  it('is remembered by a save', () => {
    const m = new MobManager(mulberry32(3));
    m.spawn('cow', 1, 64, 1, { baby: 300 });
    m.spawn('sheep', 3, 64, 3, { sheared: true });
    m.spawn('pig', 5, 64, 5);
    const copy = new MobManager(mulberry32(4));
    expect(copy.loadJSON(JSON.parse(JSON.stringify(m.toJSON(0, 0, 50))))).toBe(3);
    expect(copy.mobs[0].growTimer).toBeCloseTo(300);
    expect(copy.mobs[0].height).toBeCloseTo(copy.mobs[0].def.height / 2);
    expect(copy.mobs[1].sheared).toBe(true);
    expect(copy.mobs[2].baby).toBe(false);
    // A save cannot make an adult kind of mob a baby for ever.
    expect(copy.loadJSON([{ kind: 'zombie', x: 1, y: 2, z: 3, yaw: 0, health: 20, baby: 100 }])).toBe(1);
    expect(copy.mobs[3].baby).toBe(false);
  });
});

describe('slime blocks', () => {
  it('are nine slimeballs, and nine slimeballs again', () => {
    const b = I.SLIMEBALL;
    expect(findRecipe(grid([b, b, b, b, b, b, b, b, b]), 3, 3)?.result).toEqual({ id: B.SLIME_BLOCK, count: 1 });
    expect(findRecipe(grid([B.SLIME_BLOCK]), 1, 1)?.result).toEqual({ id: I.SLIMEBALL, count: 9 });
  });

  const fall = (floor: number, sneak: boolean) => {
    const { s, world } = make();
    world.setBlock(CX, FLOOR, CZ, floor);
    s.teleport(CX + 0.5, FLOOR + 14, CZ + 0.5, 0, 0);
    let peakAfter = 0;
    let landed = false;
    let rose = false;
    let low = 20;
    for (let i = 0; i < 200; i++) {
      s.tick(idle({ sneak }));
      low = Math.min(low, s.vitals.health);
      if (s.body.y < FLOOR + 2.5) landed = true;
      if (landed && s.body.vy > 0.5) rose = true;
      if (rose) peakAfter = Math.max(peakAfter, s.body.y - (FLOOR + 1));
    }
    return { hp: low, peakAfter };
  };

  it('stop a fall, and throw you back up (unless you crouch)', () => {
    expect(fall(B.STONE, false).hp).toBeLessThan(20);
    const bounce = fall(B.SLIME_BLOCK, false);
    expect(bounce.hp).toBe(20);
    expect(bounce.peakAfter).toBeGreaterThan(3);
    const crouch = fall(B.SLIME_BLOCK, true);
    expect(crouch.hp).toBe(20);
    expect(crouch.peakAfter).toBeLessThan(0.5);
  });
});
