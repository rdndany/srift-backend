import { describe, expect, it } from 'vitest';
import {
  B,
  BLOCKS,
  BUILD_MATERIALS,
  CONNECT,
  GROVE,
  BUILDING_ITEM,
  GameSession,
  HeadlessWorld,
  I,
  ITEMS,
  NO_ITEM_BLOCKS,
  RECIPES,
  WorldGenerator,
  arms,
  blockDrops,
  canStayAt,
  collides,
  collisionBoxes,
  doorHinge,
  doorId,
  doorInfo,
  findRecipe,
  gateId,
  gateInfo,
  getItem,
  isInteractive,
  ladderId,
  ladderInfo,
  makeStack,
  meshBoxes,
  Player,
  mulberry32,
  placementFor,
  raycast,
  slabId,
  slabInfo,
  stairId,
  stairInfo,
  toolId,
  trapdoorId,
  trapdoorInfo,
  type InputFrame,
} from './index';

const SEED = 1337;
const FLOOR = 100;
const CX = 8;
const CZ = 8;

const idle = (over: Partial<InputFrame> = {}): InputFrame => ({
  t: 'frame',
  dt: 1 / 20,
  locked: true,
  yaw: 0,
  pitch: 0,
  forward: 0,
  strafe: 0,
  jump: false,
  sprint: false,
  sneak: false,
  left: false,
  right: false,
  ...over,
});

/** A flat stone floor; the player stands at the middle looking toward -z (yaw 0). */
function make(mode: 'survival' | 'creative' = 'survival') {
  const generator = new WorldGenerator(SEED);
  const world = new HeadlessWorld(generator);
  for (let x = CX - 12; x <= CX + 12; x++)
    for (let z = CZ - 12; z <= CZ + 12; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 14; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.STONE);
    }
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(3), mode });
  s.finishLoading();
  s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
  return { s, world };
}

const PLANKS_SLAB = slabId(0, false);
const STONE_MAT = BUILD_MATERIALS.findIndex((m) => m.name === 'stone');
const EAST = -Math.PI / 2; // yaw that looks toward +x
const SOUTH = Math.PI;

/** Walk for `n` ticks in the direction of `yaw`. */
function walk(s: GameSession, yaw: number, n: number, over: Partial<InputFrame> = {}): void {
  for (let i = 0; i < n; i++) s.tick(idle({ yaw, forward: 1, ...over }));
}

describe('building block ids', () => {
  it('decode back to what they were made from', () => {
    for (let m = 0; m < BUILD_MATERIALS.length; m++) {
      for (const top of [false, true]) {
        expect(slabInfo(slabId(m, top))).toEqual({ mat: m, top });
        for (let d = 0; d < 4; d++) expect(stairInfo(stairId(m, top, d))).toEqual({ mat: m, top, dir: d });
      }
    }
    for (const upper of [false, true])
      for (const open of [false, true])
        for (let f = 0; f < 4; f++) {
          expect(doorInfo(doorId(upper, open, f))).toEqual({ upper, open, facing: f });
          expect(trapdoorInfo(trapdoorId(upper, open, f))).toEqual({ top: upper, open, facing: f });
        }
    for (let f = 0; f < 4; f++) {
      expect(ladderInfo(ladderId(f))).toEqual({ facing: f });
      // A gate only knows its axis (0 or 2); open leaves always swing to the same side.
      expect(gateInfo(gateId(false, f))).toEqual({ open: false, facing: f & 2 });
      expect(gateInfo(gateId(true, f))).toEqual({ open: true, facing: f & 2 });
    }
    expect(slabInfo(B.STONE)).toBeNull();
    expect(doorInfo(B.PLANKS)).toBeNull();
  });

  it('are all defined, distinct and fit in a byte', () => {
    const ids = new Set<number>();
    const check = (id: number, shape: string) => {
      expect(id).toBeLessThan(256);
      expect(ids.has(id), `id ${id} used twice`).toBe(false);
      ids.add(id);
      expect(BLOCKS[id].shape, `block ${id}`).toBe(shape);
    };
    for (let m = 0; m < BUILD_MATERIALS.length; m++) for (const top of [false, true]) check(slabId(m, top), 'slab');
    for (let m = 0; m < BUILD_MATERIALS.length; m++)
      for (const top of [false, true]) for (let d = 0; d < 4; d++) check(stairId(m, top, d), 'stair');
    for (const u of [false, true]) for (const o of [false, true]) for (let f = 0; f < 4; f++) check(doorId(u, o, f), 'door');
    for (const u of [false, true]) for (const o of [false, true]) for (let f = 0; f < 4; f++) check(trapdoorId(u, o, f), 'trapdoor');
    for (let f = 0; f < 4; f++) check(ladderId(f), 'ladder');
    check(B.FENCE, 'fence');
    for (let i = 0; i < 4; i++) check(B.GATE_BASE + i, 'gate');
    expect(gateInfo(B.GATE_BASE + 4)).toBeNull();
    expect(gateInfo(B.FIRE)).toBeNull();
    check(B.PANE, 'pane');
    check(B.STONE_BRICKS, 'cube');
    // They do not collide with anything older (beds sit at 72..79, tall grass etc. below).
    for (let id = 0; id < B.SLAB_BASE; id++) expect(ids.has(id)).toBe(false);
  });

  it('give one item per kind, whichever way up or open the block is', () => {
    for (const id of NO_ITEM_BLOCKS) expect(ITEMS.has(id), `${BLOCKS[id].name} ${id}`).toBe(false);
    expect(ITEMS.has(slabId(0, false))).toBe(true);
    expect(ITEMS.has(slabId(0, true))).toBe(false);
    expect(ITEMS.has(I.DOOR)).toBe(true);
    for (const id of [slabId(2, true), stairId(1, true, 3), trapdoorId(true, true, 2), ladderId(3), gateId(true, 1)]) {
      const d = blockDrops(BLOCKS[id], getItem(toolId('pickaxe', 'diamond')).tool, () => 0);
      expect(d).toEqual([{ id: BUILDING_ITEM[id], count: 1 }]);
      expect(ITEMS.has(d[0].id)).toBe(true);
    }
    expect(blockDrops(BLOCKS[doorId(false, true, 2)], null, () => 0)).toEqual([{ id: I.DOOR, count: 1 }]);
    expect(blockDrops(BLOCKS[doorId(true, false, 0)], null, () => 0)).toEqual([]);
  });

  it('can be crafted', () => {
    const grid = (cells: (number | null)[]) => cells.map((c) => (c === null ? null : makeStack(c)));
    const P = B.PLANKS;
    const S = I.STICK;
    expect(findRecipe(grid([P, P, P, null, null, null, null, null, null]), 3, 3)?.result).toEqual({ id: slabId(0, false), count: 6 });
    expect(findRecipe(grid([P, null, null, P, P, null, P, P, P]), 3, 3)?.result).toEqual({ id: stairId(0, false, 0), count: 4 });
    expect(findRecipe(grid([null, null, P, null, P, P, P, P, P]), 3, 3)?.result).toEqual({ id: stairId(0, false, 0), count: 4 });
    expect(findRecipe(grid([P, P, null, P, P, null, P, P, null]), 3, 3)?.result).toEqual({ id: I.DOOR, count: 3 });
    expect(findRecipe(grid([P, P, P, P, P, P, null, null, null]), 3, 3)?.result).toEqual({ id: trapdoorId(false, false, 0), count: 2 });
    expect(findRecipe(grid([P, S, P, P, S, P, null, null, null]), 3, 3)?.result).toEqual({ id: B.FENCE, count: 2 });
    expect(findRecipe(grid([S, P, S, S, P, S, null, null, null]), 3, 3)?.result).toEqual({ id: gateId(false, 0), count: 1 });
    expect(findRecipe(grid([S, null, S, S, S, S, S, null, S]), 3, 3)?.result).toEqual({ id: ladderId(0), count: 3 });
    expect(findRecipe(grid([B.GLASS, B.GLASS, B.GLASS, B.GLASS, B.GLASS, B.GLASS, null, null, null]), 3, 3)?.result).toEqual({ id: B.PANE, count: 16 });
    expect(findRecipe(grid([B.STONE, B.STONE, null, B.STONE, B.STONE, null, null, null, null]), 3, 3)?.result).toEqual({ id: B.STONE_BRICKS, count: 4 });
    for (const r of RECIPES) expect(ITEMS.has(r.result.id), `recipe result ${r.result.id}`).toBe(true);
  });

  it('count as interactive only when they can be opened', () => {
    expect(isInteractive(doorId(false, false, 0))).toBe(true);
    expect(isInteractive(trapdoorId(false, false, 0))).toBe(true);
    expect(isInteractive(gateId(false, 0))).toBe(true);
    expect(isInteractive(slabId(0, false))).toBe(false);
    expect(isInteractive(B.FENCE)).toBe(false);
  });
});

describe('placing', () => {
  it('puts a slab in the half you click, and stairs rising away from you', () => {
    const { s, world } = make();
    s.inventory.set(0, makeStack(PLANKS_SLAB, 20));
    // On top of a block: bottom half.
    expect(s.useOn(CX + 3, FLOOR, CZ, 0, 1, 0)).toBe(true);
    expect(world.getBlock(CX + 3, FLOOR + 1, CZ)).toBe(slabId(0, false));
    // Underside of a block: top half.
    world.setBlock(CX + 5, FLOOR + 3, CZ, B.STONE);
    expect(s.useOn(CX + 5, FLOOR + 3, CZ, 0, -1, 0)).toBe(true);
    expect(world.getBlock(CX + 5, FLOOR + 2, CZ)).toBe(slabId(0, true));
    // The side of a wall: the half under the cursor.
    world.setBlock(CX - 3, FLOOR + 1, CZ, B.STONE);
    expect(s.useOn(CX - 3, FLOOR + 1, CZ, 1, 0, 0, 0.8)).toBe(true);
    expect(world.getBlock(CX - 2, FLOOR + 1, CZ)).toBe(slabId(0, true));
    expect(s.useOn(CX - 3, FLOOR + 1, CZ + 0, 0, 0, 1, 0.2)).toBe(true);
    expect(world.getBlock(CX - 3, FLOOR + 1, CZ + 1)).toBe(slabId(0, false));

    const stairs = stairId(0, false, 0);
    expect(placementFor(stairs, 0, 1, 0, 0)).toBe(stairId(0, false, 3)); // looking toward -z
    expect(placementFor(stairs, 0, 1, 0, EAST)).toBe(stairId(0, false, 0));
    expect(placementFor(stairs, 0, 1, 0, SOUTH)).toBe(stairId(0, false, 2));
    expect(placementFor(stairs, 0, -1, 0, EAST)).toBe(stairId(0, true, 0));
    expect(placementFor(stairs, 1, 0, 0, EAST, 0.9)).toBe(stairId(0, true, 0));
  });

  it('places pale oak stairs, and every other stair, upside down from the upper half', () => {
    const kinds = [stairId(0, false, 0), stairId(4, false, 0), GROVE.paleOak.stair, GROVE.mangrove.stair, CONNECT.netherStair, CONNECT.quartzStair];
    for (const item of kinds) {
      const info = stairInfo(item);
      expect(info).not.toBeNull();
      const mat = info!.mat;
      expect(stairInfo(placementFor(item, 1, 0, 0, EAST, 0.8)!)).toEqual({ mat, top: true, dir: 0 });
      expect(stairInfo(placementFor(item, 1, 0, 0, EAST, 0.2)!)).toEqual({ mat, top: false, dir: 0 });
      expect(stairInfo(placementFor(item, 0, -1, 0, SOUTH)!)).toEqual({ mat, top: true, dir: 2 });
      expect(stairInfo(placementFor(item, 0, 1, 0, EAST)!)).toEqual({ mat, top: false, dir: 0 });
    }

    // The block on the slab hangs down, so the upper half of what you see is still below the middle of its cell.
    const { s, world } = make();
    const x = CX + 4;
    const y = FLOOR + 1;
    world.setBlock(x, y, CZ, slabId(4, false));
    world.setBlock(x, y + 1, CZ, B.STONE_BRICKS);
    s.inventory.set(0, makeStack(GROVE.paleOak.stair, 20));
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, EAST, 0);
    const high = raycast(world, x - 2, y + 1.25, CZ + 0.5, 1, 0, 0, 6)!;
    expect(high.fy).toBeLessThan(0.5);
    expect(s.useOn(high.x, high.y, high.z, high.nx, high.ny, high.nz, high.fy)).toBe(true);
    expect(stairInfo(world.getBlock(x - 1, y + 1, CZ))).toMatchObject({ top: true, dir: 0 });
    const low = raycast(world, x + 2, y + 0.7, CZ + 0.5, -1, 0, 0, 6)!;
    expect(s.useOn(low.x, low.y, low.z, low.nx, low.ny, low.nz, low.fy)).toBe(true);
    expect(stairInfo(world.getBlock(x + 1, y + 1, CZ))).toMatchObject({ top: false, dir: 0 });
  });

  it('turns two slabs of one kind into a full block, but not different kinds', () => {
    const { s, world } = make();
    s.inventory.set(0, makeStack(PLANKS_SLAB, 20));
    s.useOn(CX + 3, FLOOR, CZ, 0, 1, 0);
    expect(s.inventory.get(0)?.count).toBe(19);
    // The top of a bottom slab: merges into the slab's own cell.
    expect(s.useOn(CX + 3, FLOOR + 1, CZ, 0, 1, 0)).toBe(true);
    expect(world.getBlock(CX + 3, FLOOR + 1, CZ)).toBe(B.PLANKS);
    expect(world.getBlock(CX + 3, FLOOR + 2, CZ)).toBe(B.AIR);
    expect(s.inventory.get(0)?.count).toBe(18);
    // A top slab, joined from beside it by a bottom one.
    world.setBlock(CX + 5, FLOOR + 1, CZ, slabId(0, true));
    world.setBlock(CX + 6, FLOOR + 1, CZ, B.STONE);
    expect(s.useOn(CX + 6, FLOOR + 1, CZ, -1, 0, 0, 0.2)).toBe(true);
    expect(world.getBlock(CX + 5, FLOOR + 1, CZ)).toBe(B.PLANKS);
    // Another material: the click lands on top instead.
    world.setBlock(CX - 4, FLOOR + 1, CZ, slabId(STONE_MAT, false));
    expect(s.useOn(CX - 4, FLOOR + 1, CZ, 0, 1, 0)).toBe(true);
    expect(world.getBlock(CX - 4, FLOOR + 1, CZ)).toBe(slabId(STONE_MAT, false));
    expect(world.getBlock(CX - 4, FLOOR + 2, CZ)).toBe(PLANKS_SLAB);
  });

  it('does not merge a slab into a block someone stands in', () => {
    const { s, world } = make();
    s.inventory.set(0, makeStack(PLANKS_SLAB, 4));
    world.setBlock(CX, FLOOR + 1, CZ, slabId(0, false));
    s.teleport(CX + 0.5, FLOOR + 1 + 0.5, CZ + 0.5, 0, 0); // standing on the slab
    expect(s.useOn(CX, FLOOR + 1, CZ, 0, 1, 0)).toBe(false);
    expect(world.getBlock(CX, FLOOR + 1, CZ)).toBe(slabId(0, false));
  });

  it('places a door as two blocks standing on a solid floor, and gives it back when broken', () => {
    const { s, world } = make();
    s.inventory.set(0, makeStack(I.DOOR, 2));
    expect(s.useOn(CX + 3, FLOOR, CZ, 0, 1, 0)).toBe(true);
    const lower = doorInfo(world.getBlock(CX + 3, FLOOR + 1, CZ))!;
    const upper = doorInfo(world.getBlock(CX + 3, FLOOR + 2, CZ))!;
    expect(lower).toMatchObject({ upper: false, open: false });
    expect(upper).toMatchObject({ upper: true, open: false, facing: lower.facing });
    expect(s.inventory.get(0)?.count).toBe(1);
    // No room above, or nothing to stand on: no door.
    world.setBlock(CX + 5, FLOOR + 2, CZ, B.STONE);
    expect(s.useOn(CX + 5, FLOOR, CZ, 0, 1, 0)).toBe(false);
    expect(s.useOn(CX + 7, FLOOR + 6, CZ, 0, 1, 0)).toBe(false);
    expect(s.inventory.get(0)?.count).toBe(1);

    s.breakBlock(CX + 3, FLOOR + 2, CZ);
    expect(world.getBlock(CX + 3, FLOOR + 1, CZ)).toBe(B.AIR); // the lower half cannot stay alone
    s.teleport(CX + 3.5, FLOOR + 1, CZ + 0.5, 0, 0);
    s.tickDrops(2);
    expect(s.inventory.countOf(I.DOOR)).toBe(2);
  });

  it('hinges a door on the left of whoever placed it, and opens it toward that side', () => {
    const none = () => B.AIR;
    // Placed looking east: the door stands on the west edge (the near one) and swings to the north (their left).
    const { s, world } = make();
    s.inventory.set(0, makeStack(I.DOOR, 1));
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, EAST, 0);
    s.useOn(CX + 2, FLOOR, CZ, 0, 1, 0);
    const placed = world.getBlock(CX + 2, FLOOR + 1, CZ);
    expect(doorInfo(placed)!.facing).toBe(1);
    expect(collisionBoxes(placed, none)).toEqual([[0, 0, 0, 3 / 16, 1, 1]]);
    const opened = doorId(false, true, 1);
    expect(collisionBoxes(opened, none)).toEqual([[0, 0, 0, 1, 1, 3 / 16]]);
    // The hinge is at the north end of the closed panel and at the west end of the open one.
    expect(doorHinge(placed)).toEqual({ alongZ: true, hingeAtOne: false });
    expect(doorHinge(opened)).toEqual({ alongZ: false, hingeAtOne: false });
    expect(doorHinge(B.STONE)).toBeNull();
  });

  it('hangs a ladder on a wall, never on a floor, and pops it off when the wall goes', () => {
    const { s, world } = make();
    s.inventory.set(0, makeStack(ladderId(0), 5));
    world.setBlock(CX + 3, FLOOR + 1, CZ, B.STONE);
    expect(s.useOn(CX + 3, FLOOR + 1, CZ, 0, 1, 0)).toBe(false);
    // Clicking the west face of the wall puts a ladder west of it, fixed to the wall (to its east).
    expect(s.useOn(CX + 3, FLOOR + 1, CZ, -1, 0, 0)).toBe(true);
    expect(ladderInfo(world.getBlock(CX + 2, FLOOR + 1, CZ))).toEqual({ facing: 0 });
    expect(s.useOn(CX + 3, FLOOR + 1, CZ, 0, 0, -1)).toBe(true);
    expect(ladderInfo(world.getBlock(CX + 3, FLOOR + 1, CZ - 1))).toEqual({ facing: 2 });
    // A ladder needs a solid wall; glass will not do.
    world.setBlock(CX - 3, FLOOR + 1, CZ, B.GLASS);
    expect(s.useOn(CX - 3, FLOOR + 1, CZ, 1, 0, 0)).toBe(false);

    s.breakBlock(CX + 3, FLOOR + 1, CZ);
    expect(world.getBlock(CX + 2, FLOOR + 1, CZ)).toBe(B.AIR);
    expect(canStayAt(ladderId(0), world, CX + 2, FLOOR + 1, CZ)).toBe(false);
  });

  it('puts a gate across the way you look and a trapdoor against the wall you click', () => {
    const { s, world } = make();
    s.inventory.set(0, makeStack(gateId(false, 0), 2));
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, EAST, 0);
    s.useOn(CX + 3, FLOOR, CZ, 0, 1, 0);
    expect(gateInfo(world.getBlock(CX + 3, FLOOR + 1, CZ))).toEqual({ open: false, facing: 0 });
    expect(placementFor(trapdoorId(false, false, 0), -1, 0, 0, 0, 0.9)).toBe(trapdoorId(true, false, 0));
    expect(placementFor(trapdoorId(false, false, 0), 0, 1, 0, 0)).toBe(trapdoorId(false, false, 3));
  });
});

describe('opening and closing', () => {
  it('opens and shuts both halves of a door together, from either half', () => {
    const { s, world } = make();
    world.setBlock(CX + 3, FLOOR + 1, CZ, doorId(false, false, 0));
    world.setBlock(CX + 3, FLOOR + 2, CZ, doorId(true, false, 0));
    expect(s.useBlock(CX + 3, FLOOR + 2, CZ)).toBe(true);
    expect(doorInfo(world.getBlock(CX + 3, FLOOR + 1, CZ))).toEqual({ upper: false, open: true, facing: 0 });
    expect(doorInfo(world.getBlock(CX + 3, FLOOR + 2, CZ))).toEqual({ upper: true, open: true, facing: 0 });
    s.useBlock(CX + 3, FLOOR + 1, CZ);
    expect(doorInfo(world.getBlock(CX + 3, FLOOR + 1, CZ))!.open).toBe(false);
    expect(doorInfo(world.getBlock(CX + 3, FLOOR + 2, CZ))!.open).toBe(false);
  });

  it('flips trapdoors and gates, and ignores plain blocks', () => {
    const { s, world } = make();
    world.setBlock(CX + 3, FLOOR + 1, CZ, trapdoorId(false, false, 1));
    world.setBlock(CX + 4, FLOOR + 1, CZ, gateId(false, 2));
    s.useBlock(CX + 3, FLOOR + 1, CZ);
    s.useBlock(CX + 4, FLOOR + 1, CZ);
    expect(trapdoorInfo(world.getBlock(CX + 3, FLOOR + 1, CZ))).toEqual({ top: false, open: true, facing: 1 });
    // It blocked walking along z, so its leaves swing along z, away from whoever opened it.
    expect(gateInfo(world.getBlock(CX + 4, FLOOR + 1, CZ))).toEqual({ open: true, facing: 2 });
    s.useBlock(CX + 4, FLOOR + 1, CZ);
    expect(gateInfo(world.getBlock(CX + 4, FLOOR + 1, CZ))).toEqual({ open: false, facing: 2 });
    expect(s.useBlock(CX, FLOOR, CZ)).toBe(false);
  });

  it('will not shut a door on someone standing in the doorway', () => {
    const { s, world } = make();
    world.setBlock(CX + 3, FLOOR + 1, CZ, doorId(false, true, 0));
    world.setBlock(CX + 3, FLOOR + 2, CZ, doorId(true, true, 0));
    // Closed, facing 0 lies on the +x edge of the cell; stand there.
    s.teleport(CX + 3.9, FLOOR + 1, CZ + 0.5, 0, 0);
    s.useBlock(CX + 3, FLOOR + 1, CZ);
    expect(doorInfo(world.getBlock(CX + 3, FLOOR + 1, CZ))!.open).toBe(true);
  });

  it('opens with a right-click even while holding a block', () => {
    const { s, world } = make();
    world.setBlock(CX, FLOOR + 1, CZ - 2, doorId(false, false, 3));
    world.setBlock(CX, FLOOR + 2, CZ - 2, doorId(true, false, 3));
    s.inventory.set(0, makeStack(B.PLANKS, 4));
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
    s.tick(idle({ pitch: 0, right: true }));
    expect(doorInfo(world.getBlock(CX, FLOOR + 1, CZ - 2))!.open).toBe(true);
    expect(s.inventory.get(0)?.count).toBe(4);
  });
});

describe('walking around building blocks', () => {
  it('steps up onto a slab and stands at its top', () => {
    const { s, world } = make();
    world.setBlock(CX + 2, FLOOR + 1, CZ, slabId(0, false));
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, EAST, 0);
    for (let i = 0; i < 40 && s.body.x < CX + 2.7; i++) s.tick(idle({ yaw: EAST, forward: 1 }));
    expect(s.body.x).toBeGreaterThan(CX + 2.2);
    expect(s.body.y).toBeCloseTo(FLOOR + 1.5, 2);
    expect(s.body.onGround).toBe(true);
  });

  it('lands on a slab at half height and on a top slab at the cell top', () => {
    const { s, world } = make();
    world.setBlock(CX + 2, FLOOR + 1, CZ, slabId(0, false));
    world.setBlock(CX - 2, FLOOR + 1, CZ, slabId(0, true));
    s.teleport(CX + 2.5, FLOOR + 5, CZ + 0.5, 0, 0);
    for (let i = 0; i < 40; i++) s.tick(idle());
    expect(s.body.y).toBeCloseTo(FLOOR + 1.5, 2);
    s.teleport(CX - 1.5, FLOOR + 5, CZ + 0.5, 0, 0);
    for (let i = 0; i < 40; i++) s.tick(idle());
    expect(s.body.y).toBeCloseTo(FLOOR + 2, 2);
  });

  it('walks up a flight of stairs without jumping', () => {
    const { s, world } = make();
    // Four steps rising toward +x: stairs at floor level, then each step a block higher.
    for (let i = 0; i < 4; i++) {
      for (let y = FLOOR + 1; y <= FLOOR + i; y++) world.setBlock(CX + 2 + i, y, CZ, B.STONE);
      world.setBlock(CX + 2 + i, FLOOR + 1 + i, CZ, stairId(STONE_MAT, false, 0));
    }
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, EAST, 0);
    for (let i = 0; i < 120 && s.body.x < CX + 5.8; i++) s.tick(idle({ yaw: EAST, forward: 1 }));
    // On the high half of the top stair, four blocks up.
    expect(s.body.x).toBeGreaterThan(CX + 5.7);
    expect(s.body.y).toBeCloseTo(FLOOR + 1 + 3 + 1, 1);
  });

  it('cannot walk or jump over a fence, but passes an open gate', () => {
    const { s, world } = make();
    world.setBlock(CX + 2, FLOOR + 1, CZ, B.FENCE);
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, EAST, 0);
    walk(s, EAST, 40);
    expect(s.body.x).toBeLessThan(CX + 2.1);
    walk(s, EAST, 80, { jump: true });
    expect(s.body.x).toBeLessThan(CX + 2.1);

    world.setBlock(CX + 2, FLOOR + 1, CZ + 3, gateId(false, 0));
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 3.5, EAST, 0);
    walk(s, EAST, 40);
    expect(s.body.x).toBeLessThan(CX + 2.2);
    s.useBlock(CX + 2, FLOOR + 1, CZ + 3);
    walk(s, EAST, 40);
    expect(s.body.x).toBeGreaterThan(CX + 3);
  });

  it('is stopped by a closed door and walks through an open one', () => {
    const { s, world } = make();
    world.setBlock(CX + 3, FLOOR + 1, CZ, doorId(false, false, 0));
    world.setBlock(CX + 3, FLOOR + 2, CZ, doorId(true, false, 0));
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, EAST, 0);
    walk(s, EAST, 40);
    expect(s.body.x).toBeLessThan(CX + 3.6);
    s.useBlock(CX + 3, FLOOR + 1, CZ);
    walk(s, EAST, 30);
    expect(s.body.x).toBeGreaterThan(CX + 4);
  });

  it('steps over a closed trapdoor and drops through an open one', () => {
    const { s, world } = make();
    world.setBlock(CX + 2, FLOOR + 1, CZ, trapdoorId(false, false, 0));
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, EAST, 0);
    for (let i = 0; i < 40 && s.body.x < CX + 2.7; i++) s.tick(idle({ yaw: EAST, forward: 1 }));
    expect(s.body.x).toBeGreaterThan(CX + 2.2);
    expect(s.body.y).toBeCloseTo(FLOOR + 1 + 3 / 16, 2);
  });

  it('climbs a ladder with forward, holds with sneak and slides down without hurting', () => {
    const { s, world } = make();
    for (let y = FLOOR + 1; y <= FLOOR + 12; y++) {
      world.setBlock(CX + 3, y, CZ, B.STONE);
      world.setBlock(CX + 2, y, CZ, ladderId(0));
    }
    s.teleport(CX + 2.5, FLOOR + 1, CZ + 0.5, EAST, 0);
    walk(s, EAST, 60);
    expect(s.body.onLadder).toBe(true);
    expect(s.body.y).toBeGreaterThan(FLOOR + 4);
    const held = s.body.y;
    for (let i = 0; i < 20; i++) s.tick(idle({ yaw: EAST, sneak: true }));
    expect(Math.abs(s.body.y - held)).toBeLessThan(0.05);
    // Let go from the top: a controlled slide, no fall damage.
    s.teleport(CX + 2.5, FLOOR + 12, CZ + 0.5, EAST, 0);
    const health = s.vitals.health;
    for (let i = 0; i < 120; i++) s.tick(idle({ yaw: EAST }));
    expect(s.body.y).toBeCloseTo(FLOOR + 1, 1);
    expect(s.vitals.health).toBe(health);
  });
  it('climbs off the top of a ladder onto the wall it hangs on', () => {
    const { s, world } = make();
    for (let y = FLOOR + 1; y <= FLOOR + 5; y++) {
      world.setBlock(CX + 3, y, CZ, B.STONE);
      if (y <= FLOOR + 5) world.setBlock(CX + 2, y, CZ, ladderId(0));
    }
    s.teleport(CX + 2.5, FLOOR + 1, CZ + 0.5, EAST, 0);
    for (let i = 0; i < 160 && s.body.x < CX + 3.4; i++) s.tick(idle({ yaw: EAST, forward: 1 }));
    // Standing on top of the wall, not stuck at the top of the ladder.
    expect(s.body.x).toBeGreaterThan(CX + 3.1);
    expect(s.body.y).toBeCloseTo(FLOOR + 6, 1);
    expect(s.body.onGround).toBe(true);
    expect(s.body.onLadder).toBe(false);
  });
});

describe('shapes', () => {
  it('joins fences and panes to each other and to solid blocks', () => {
    const at = (map: Record<string, number>) => (dx: number, dz: number) => map[`${dx},${dz}`] ?? B.AIR;
    expect(arms(B.FENCE, at({}))).toEqual([false, false, false, false]);
    expect(arms(B.FENCE, at({ '1,0': B.FENCE, '0,-1': B.STONE, '-1,0': B.GLASS }))).toEqual([true, false, false, true]);
    expect(arms(B.FENCE, at({ '0,1': slabId(0, false) }))).toEqual([false, false, false, false]);
    // A fence joins a gate only along the gate's panel.
    expect(arms(B.FENCE, at({ '1,0': gateId(false, 2), '0,1': gateId(false, 2) }))).toEqual([true, false, false, false]);
    expect(arms(B.PANE, at({ '0,1': B.PANE, '-1,0': B.STONE }))).toEqual([false, true, true, false]);
  });

  it('makes fences 1.5 tall to bump into but 15/16 to look at', () => {
    const none = () => B.AIR;
    const top = (boxes: readonly (readonly number[])[]) => Math.max(...boxes.map((b) => b[4]));
    expect(top(collisionBoxes(B.FENCE, none))).toBe(1.5);
    expect(top(meshBoxes(B.FENCE, none))).toBe(1);
    expect(collisionBoxes(gateId(true, 0), none)).toEqual([]);
    expect(collisionBoxes(gateId(false, 0), none).length).toBeGreaterThan(0);
    expect(collisionBoxes(ladderId(0), none)).toEqual([]);
    expect(collisionBoxes(B.STONE, none)).toEqual([]);
    // An isolated pane shows a cross; one with a neighbour only reaches toward it.
    expect(meshBoxes(B.PANE, none).length).toBe(5);
    expect(meshBoxes(B.PANE, (dx) => (dx === 1 ? B.PANE : B.AIR)).length).toBe(2);
  });

  it('sees through the gaps of a fence but hits its post', () => {
    const { world } = make();
    world.setBlock(CX + 2, FLOOR + 1, CZ, B.FENCE);
    const y = FLOOR + 1.5;
    expect(raycast(world, CX + 2.1, y, CZ - 3, 0, 0, 1, 8)).toBeNull();
    const hit = raycast(world, CX + 2.5, y, CZ - 3, 0, 0, 1, 8);
    expect(hit).toMatchObject({ x: CX + 2, y: FLOOR + 1, z: CZ, id: B.FENCE, nz: -1 });
  });

  it('reports which half of a slab was struck', () => {
    const { world } = make();
    world.setBlock(CX + 2, FLOOR + 1, CZ, slabId(0, false));
    const hit = raycast(world, CX + 2.5, FLOOR + 4, CZ + 0.5, 0, -1, 0, 8)!;
    expect(hit).toMatchObject({ x: CX + 2, y: FLOOR + 1, ny: 1 });
    expect(hit.fy).toBeCloseTo(0.5, 5);
    // Skimming over the empty half of a bottom slab hits what is behind it.
    expect(raycast(world, CX + 2.5, FLOOR + 1.75, CZ - 3, 0, 0, 1, 8)).toBeNull();
  });

  it('counts the layer below for tall shapes in collision tests', () => {
    const { world } = make();
    world.setBlock(CX + 2, FLOOR + 1, CZ, B.FENCE);
    expect(collides(world, CX + 2.5, FLOOR + 2.3, CZ + 0.5)).toBe(true); // 1.3 above the floor: still inside the fence
    expect(collides(world, CX + 2.5, FLOOR + 2.6, CZ + 0.5)).toBe(false);
  });

  it('puffs a broken block and a placed one, and a neighbour sees both', () => {
    const { s, world } = make('creative');
    const near = new Player(s.realm, { mode: 'creative', name: 'Near' });
    const far = new Player(s.realm, { mode: 'creative', name: 'Far' });
    near.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
    far.teleport(CX + 80, FLOOR + 1, CZ, 0, 0);
    const x = CX + 3;
    const y = FLOOR + 2;
    world.setBlock(x, y, CZ, B.STONE);
    s.drainEvents();
    near.drainEvents();
    far.drainEvents();
    s.breakBlock(x, y, CZ);
    expect(world.getBlock(x, y, CZ)).toBe(B.AIR);
    const broke = s.drainEvents();
    expect(broke.find((e) => e.t === 'burst')).toMatchObject({ id: B.STONE, x, y, z: CZ, count: 32 });
    expect(broke.some((e) => e.t === 'sound' && e.action === 'break' && e.sound === 'stone')).toBe(true);
    expect(near.drainEvents().some((e) => e.t === 'burst' && e.id === B.STONE)).toBe(true);
    expect(far.drainEvents().some((e) => e.t === 'burst')).toBe(false);

    for (const id of [B.DIRT, GROVE.paleOak.planks, B.GLASS, B.CHEST]) {
      s.inventory.set(0, makeStack(id, 1));
      world.setBlock(x, y - 1, CZ, B.STONE);
      world.setBlock(x, y, CZ, B.AIR);
      s.drainEvents();
      near.drainEvents();
      expect(s.useOn(x, y - 1, CZ, 0, 1, 0)).toBe(true);
      const got = world.getBlock(x, y, CZ);
      if (id === B.CHEST) expect(BLOCKS[got].shape).toBe('chest');
      else expect(got).toBe(id);
      const placed = s.drainEvents();
      expect(placed.find((e) => e.t === 'burst')).toMatchObject({ id: got, x, y, z: CZ, count: 8, soft: true });
      expect(placed.some((e) => e.t === 'sound' && e.action === 'place' && e.sound === BLOCKS[got].sound)).toBe(true);
      expect(near.drainEvents().some((e) => e.t === 'burst' && e.soft === true && e.id === got)).toBe(true);
    }
  });
});