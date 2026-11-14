import { describe, expect, it } from 'vitest';
import {
  B,
  BLOCKS,
  BUILDING_ITEM,
  FluidSim,
  GameSession,
  HeadlessWorld,
  I,
  ITEMS,
  LIGHT_EMIT,
  NO_ITEM_BLOCKS,
  RECIPES,
  WorldGenerator,
  blockDrops,
  canStayAt,
  findRecipe,
  getItem,
  isInteractive,
  isLantern,
  lanternId,
  lanternInfo,
  makeStack,
  meshBoxes,
  mulberry32,
  placementFor,
  raycast,
  type InputFrame,
} from './index';

const SEED = 1337;
const FLOOR = 100;
const CX = 8;
const CZ = 8;

function make() {
  const generator = new WorldGenerator(SEED);
  const world = new HeadlessWorld(generator);
  for (let x = CX - 12; x <= CX + 12; x++)
    for (let z = CZ - 12; z <= CZ + 12; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 14; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.STONE);
    }
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(3), mode: 'survival' });
  s.finishLoading();
  s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
  return { s, world };
}

const none = () => B.AIR;

describe('lanterns', () => {
  it('are two kinds, each standing or hanging, and only the standing one is an item', () => {
    for (const soul of [false, true]) {
      for (const hanging of [false, true]) {
        const id = lanternId(soul, hanging);
        expect(lanternInfo(id)).toEqual({ soul, hanging });
        expect(isLantern(id)).toBe(true);
        expect(BLOCKS[id].shape).toBe('lantern');
      }
      expect(ITEMS.has(lanternId(soul, false))).toBe(true);
      expect(ITEMS.has(lanternId(soul, true))).toBe(false);
      expect(NO_ITEM_BLOCKS.has(lanternId(soul, true))).toBe(true);
      expect(BUILDING_ITEM[lanternId(soul, true)]).toBe(lanternId(soul, false));
    }
    expect(lanternInfo(B.TORCH)).toBeNull();
    expect(lanternInfo(B.CHAIN)).toBeNull();
    expect(ITEMS.has(B.CHAIN)).toBe(true);
  });

  it('shine at the original levels (15 and 10) and never need fuel', () => {
    expect(LIGHT_EMIT[B.LANTERN]).toBe(15);
    expect(LIGHT_EMIT[B.LANTERN_HANG]).toBe(15);
    expect(LIGHT_EMIT[B.SOUL_LANTERN]).toBe(10);
    expect(LIGHT_EMIT[B.SOUL_LANTERN_HANG]).toBe(10);
    expect(LIGHT_EMIT[B.CHAIN]).toBe(0);
    expect(getItem(B.LANTERN).fuel ?? 0).toBe(0);
    expect(getItem(B.LANTERN).block).toBe(B.LANTERN);
  });

  it('can be walked through, and so can a chain', () => {
    for (const id of [B.LANTERN, B.LANTERN_HANG, B.SOUL_LANTERN, B.SOUL_LANTERN_HANG, B.CHAIN]) {
      expect(BLOCKS[id].solid).toBe(false);
      expect(BLOCKS[id].opaque).toBe(false);
      expect(meshBoxes(id, none).length).toBeGreaterThan(0);
    }
  });

  it('are crafted from a torch in an iron cage; a drop of lapis makes the flame blue', () => {
    const I_ = I.IRON_INGOT;
    const grid = (cells: (number | null)[]) => cells.map((c) => (c === null ? null : makeStack(c)));
    expect(findRecipe(grid([null, I_, null, I_, B.TORCH, I_, null, I_, null]), 3, 3)?.result).toEqual({ id: B.LANTERN, count: 1 });
    expect(findRecipe(grid([B.LANTERN, I.LAPIS_LAZULI]), 2, 1)?.result).toEqual({ id: B.SOUL_LANTERN, count: 1 });
    expect(findRecipe(grid([I_, I_, I_]), 1, 3)?.result).toEqual({ id: B.CHAIN, count: 3 });
    for (const r of RECIPES) expect(ITEMS.has(r.result.id), `recipe result ${r.result.id}`).toBe(true);
  });

  it('hang from the underside of a block and stand on the top of one', () => {
    expect(placementFor(B.LANTERN, 0, 1, 0)).toBe(B.LANTERN);
    expect(placementFor(B.LANTERN, 0, -1, 0)).toBe(B.LANTERN_HANG);
    expect(placementFor(B.SOUL_LANTERN, 0, -1, 0)).toBe(B.SOUL_LANTERN_HANG);
    expect(placementFor(B.SOUL_LANTERN, 0, 1, 0)).toBe(B.SOUL_LANTERN);
    const { s, world } = make();
    s.inventory.set(0, makeStack(B.LANTERN, 4));
    // On the floor.
    expect(s.useOn(CX + 3, FLOOR, CZ, 0, 1, 0)).toBe(true);
    expect(world.getBlock(CX + 3, FLOOR + 1, CZ)).toBe(B.LANTERN);
    // Under a block.
    world.setBlock(CX - 3, FLOOR + 4, CZ, B.STONE);
    expect(s.useOn(CX - 3, FLOOR + 4, CZ, 0, -1, 0)).toBe(true);
    expect(world.getBlock(CX - 3, FLOOR + 3, CZ)).toBe(B.LANTERN_HANG);
    expect(s.inventory.get(0)?.count).toBe(2);
  });

  it('turn to hang when the side of a block is clicked and there is only a ceiling to use', () => {
    const { s, world } = make();
    s.inventory.set(0, makeStack(B.SOUL_LANTERN, 4));
    // The spot west of the wall block has air below it but a roof above it: the lantern hangs.
    world.setBlock(CX + 4, FLOOR + 3, CZ, B.STONE);
    world.setBlock(CX + 3, FLOOR + 4, CZ, B.STONE);
    expect(s.useOn(CX + 4, FLOOR + 3, CZ, -1, 0, 0)).toBe(true);
    expect(world.getBlock(CX + 3, FLOOR + 3, CZ)).toBe(B.SOUL_LANTERN_HANG);
    // With a floor under the spot it stands.
    world.setBlock(CX - 4, FLOOR + 1, CZ, B.STONE);
    expect(s.useOn(CX - 4, FLOOR + 1, CZ, 1, 0, 0)).toBe(true);
    expect(world.getBlock(CX - 3, FLOOR + 1, CZ)).toBe(B.SOUL_LANTERN);
  });

  it('cannot float: not placed without a floor or a ceiling, and dropped when the support goes', () => {
    const { s, world } = make();
    s.inventory.set(0, makeStack(B.LANTERN, 4));
    // The side of a high block over nothing: no floor below the spot and nothing above it.
    world.setBlock(CX + 3, FLOOR + 6, CZ, B.STONE);
    expect(s.useOn(CX + 3, FLOOR + 6, CZ, -1, 0, 0)).toBe(false);
    expect(s.inventory.get(0)?.count).toBe(4);
    // Break the floor under a standing one.
    expect(s.useOn(CX + 3, FLOOR, CZ, 0, 1, 0)).toBe(true);
    expect(s.inventory.get(0)?.count).toBe(3);
    s.breakBlock(CX + 3, FLOOR, CZ);
    expect(world.getBlock(CX + 3, FLOOR + 1, CZ)).toBe(B.AIR);
    s.teleport(CX + 3.5, FLOOR + 1, CZ + 0.5, 0, 0);
    s.tickDrops(2);
    expect(s.inventory.countOf(B.LANTERN)).toBe(4);
  });

  it('give back the standing item whichever way they were hung', () => {
    const d = blockDrops(BLOCKS[B.SOUL_LANTERN_HANG], null, () => 0);
    expect(d).toEqual([{ id: B.SOUL_LANTERN, count: 1 }]);
    expect(blockDrops(BLOCKS[B.CHAIN], null, () => 0)).toEqual([{ id: B.CHAIN, count: 1 }]);
  });

  it('hang from a chain, and the chain from the block above', () => {
    const { world } = make();
    world.setBlock(CX, FLOOR + 6, CZ, B.STONE);
    expect(canStayAt(B.CHAIN, world, CX, FLOOR + 5, CZ)).toBe(true);
    world.setBlock(CX, FLOOR + 5, CZ, B.CHAIN);
    expect(canStayAt(B.CHAIN, world, CX, FLOOR + 4, CZ)).toBe(true);
    world.setBlock(CX, FLOOR + 4, CZ, B.CHAIN);
    expect(canStayAt(B.LANTERN_HANG, world, CX, FLOOR + 3, CZ)).toBe(true);
    expect(canStayAt(B.LANTERN, world, CX, FLOOR + 3, CZ)).toBe(false); // nothing to stand on
    // A chain with nothing above it and nothing below falls.
    expect(canStayAt(B.CHAIN, world, CX + 5, FLOOR + 5, CZ)).toBe(false);
  });

  it('bring the whole hanging string down when the ceiling is mined', () => {
    const { s, world } = make();
    world.setBlock(CX + 3, FLOOR + 6, CZ, B.STONE);
    world.setBlock(CX + 3, FLOOR + 5, CZ, B.CHAIN);
    world.setBlock(CX + 3, FLOOR + 4, CZ, B.CHAIN);
    world.setBlock(CX + 3, FLOOR + 3, CZ, B.SOUL_LANTERN_HANG);
    s.breakBlock(CX + 3, FLOOR + 6, CZ);
    expect(world.getBlock(CX + 3, FLOOR + 5, CZ)).toBe(B.AIR);
    expect(world.getBlock(CX + 3, FLOOR + 4, CZ)).toBe(B.AIR);
    expect(world.getBlock(CX + 3, FLOOR + 3, CZ)).toBe(B.AIR);
  });

  it('are hit where they are, so a ray passes a chain beside the line of sight', () => {
    const { world } = make();
    world.setBlock(CX + 3, FLOOR + 1, CZ, B.CHAIN);
    world.setBlock(CX + 6, FLOOR + 1, CZ, B.STONE);
    // Through the middle of the cell: the chain is hit.
    const mid = raycast(world, CX + 0.5, FLOOR + 1.5, CZ + 0.5, 1, 0, 0, 10);
    expect(mid?.id).toBe(B.CHAIN);
    // Through the corner of the cell: the ray goes by and reaches the stone.
    const edge = raycast(world, CX + 0.5, FLOOR + 1.5, CZ + 0.1, 1, 0, 0, 10);
    expect(edge?.id).toBe(B.STONE);
  });

  it('are not washed away by water', () => {
    const { world } = make();
    world.setBlock(CX + 2, FLOOR + 1, CZ, B.WATER);
    world.setBlock(CX + 3, FLOOR + 1, CZ, B.LANTERN);
    world.setBlock(CX + 2, FLOOR + 1, CZ + 1, B.TORCH);
    const washed: number[] = [];
    const sim = new FluidSim({
      getBlock: (x, y, z) => world.getBlock(x, y, z),
      setBlock: (x, y, z, id) => world.setBlock(x, y, z, id),
      washAway: (_x, _y, _z, id) => washed.push(id),
      hiss: () => undefined,
    });
    sim.notify(CX + 2, FLOOR + 1, CZ);
    sim.settle();
    expect(world.getBlock(CX + 3, FLOOR + 1, CZ)).toBe(B.LANTERN);
    expect(washed).not.toContain(B.LANTERN);
    // The water did flow: a torch beside the source was washed away.
    expect(washed).toContain(B.TORCH);
  });

  it('are not something you open', () => {
    expect(isInteractive(B.LANTERN)).toBe(false);
    expect(isInteractive(B.CHAIN)).toBe(false);
  });
});

describe('the ward of a soul lantern', () => {
  const idle = (): InputFrame => ({ t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false });
  /** A wide flat stone floor, night, the player in the middle. */
  function yard() {
    const generator = new WorldGenerator(SEED);
    const world = new HeadlessWorld(generator);
    for (let x = CX - 40; x <= CX + 40; x++)
      for (let z = CZ - 40; z <= CZ + 40; z++) {
        for (let y = FLOOR + 1; y < FLOOR + 20; y++) world.setBlock(x, y, z, B.AIR);
        world.setBlock(x, FLOOR, z, B.STONE);
      }
    const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(5), mode: 'survival', classId: null });
    s.finishLoading();
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
    s.realm.time = 0.8;
    return { s, world };
  }
  const run = (s: GameSession, seconds: number, each?: () => void) => {
    for (let i = 0; i < seconds * 20; i++) {
      s.realm.time = 0.8;
      s.tick(idle());
      each?.();
    }
  };

  it('reaches only around a soul lantern, and not once it is mined', () => {
    const { s, world } = yard();
    world.setBlock(CX + 1, FLOOR + 1, CZ, B.SOUL_LANTERN);
    world.setBlock(CX + 20, FLOOR + 1, CZ, B.LANTERN);
    run(s, 2.5);
    expect(s.realm.wardAt(CX + 5, FLOOR + 1, CZ)).not.toBeNull();
    expect(s.realm.wardAt(CX + 5, FLOOR + 1 + 12, CZ)).toBeNull(); // too high above it
    expect(s.realm.wardAt(CX + 25, FLOOR + 1, CZ)).toBeNull();
    expect(s.realm.wardAt(CX + 20, FLOOR + 1, CZ)).toBeNull(); // a plain lantern keeps nothing off
    world.setBlock(CX + 1, FLOOR + 1, CZ, B.AIR);
    expect(s.realm.wardAt(CX + 5, FLOOR + 1, CZ)).toBeNull();
  });

  it('a hanging soul lantern keeps the ward too', () => {
    const { s, world } = yard();
    world.setBlock(CX + 1, FLOOR + 3, CZ, B.SOUL_LANTERN_HANG);
    run(s, 2.5);
    expect(s.realm.wardAt(CX + 4, FLOOR + 1, CZ)).not.toBeNull();
  });

  it('no monster comes to a player standing in it (but one comes to a plain lantern)', () => {
    for (const [lantern, safe] of [
      [B.SOUL_LANTERN, true],
      [B.LANTERN, false],
    ] as const) {
      const { s, world } = yard();
      world.setBlock(CX + 1, FLOOR + 1, CZ, lantern);
      run(s, 2.5);
      const z = s.mobs.spawn('zombie', CX + 0.5, FLOOR + 1, CZ + 0.5 - 14);
      expect(z).toBeTruthy();
      let nearest = Infinity;
      run(s, 12, () => {
        nearest = Math.min(nearest, Math.hypot(z.body.x - (CX + 1.5), z.body.z - (CZ + 0.5)));
      });
      if (safe) expect(nearest).toBeGreaterThan(8.5);
      else expect(nearest).toBeLessThan(3);
    }
  });

  it('a monster that is inside it walks out', () => {
    const { s, world } = yard();
    // The lantern 10 away from the player; the zombie starts right beside it.
    world.setBlock(CX + 10, FLOOR + 1, CZ, B.SOUL_LANTERN);
    run(s, 2.5);
    const z = s.mobs.spawn('zombie', CX + 0.5 + 10, FLOOR + 1, CZ + 0.5 + 3);
    expect(z).toBeTruthy();
    run(s, 6);
    expect(Math.hypot(z.body.x - (CX + 10.5), z.body.z - (CZ + 0.5))).toBeGreaterThan(8.5);
  });
});
