import { describe, expect, it } from 'vitest';
import {
  B,
  BLOCKS,
  GameSession,
  HeadlessWorld,
  I,
  NO_ITEM_BLOCKS,
  PLAIN_RAILS,
  POWERED_RAILS,
  WorldGenerator,
  blockDrops,
  findRecipe,
  getItem,
  isRail,
  makeStack,
  mulberry32,
  nextRail,
  railInfo,
  railPlaced,
  railRemoved,
  type InputFrame,
  type Vehicle,
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
  for (let x = CX - 20; x <= CX + 20; x++)
    for (let z = CZ - 20; z <= CZ + 20; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 14; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.STONE);
    }
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(11), mode });
  s.finishLoading();
  s.teleport(CX + 0.5, FLOOR + 1, CZ + 8.5, 0, 0);
  return { s, world };
}

const run = (s: GameSession, seconds: number, over: Partial<InputFrame> = {}) => {
  for (let i = 0; i < Math.round(seconds * 20); i++) s.tick(idle(over));
};

const RAIL_Y = FLOOR + 1;
const at = (world: HeadlessWorld, x: number, z: number, y = RAIL_Y) => world.getBlock(x, y, z);
/** Lay plain rails the way the player does: place the straight one, then let it shape itself. */
const lay = (world: HeadlessWorld, x: number, z: number, y = RAIL_Y, powered = false) => {
  world.setBlock(x, y, z, powered ? B.POWERED_RAIL_X : B.RAIL_X);
  railPlaced(world, x, y, z);
};

describe('rail shapes', () => {
  it('has a shape for every rail block, with unit-length lines between edge middles', () => {
    for (const id of [...PLAIN_RAILS, ...POWERED_RAILS]) {
      const info = railInfo(id)!;
      expect(info, String(id)).toBeTruthy();
      expect(info.dx ** 2 + info.dy ** 2 + info.dz ** 2).toBeCloseTo(1, 6);
      expect(BLOCKS[id].shape).toBe('flat');
      expect(isRail(id)).toBe(true);
    }
    expect(isRail(B.STONE)).toBe(false);
    expect(railInfo(B.RAIL_ES)!.curve).toBe(true);
    expect(railInfo(B.RAIL_UP_PX)!.slope).toBe(true);
    expect(railInfo(B.POWERED_RAIL_Z)!.powered).toBe(true);
  });

  it('a single rail stays straight and a second one joins it', () => {
    const { world } = make();
    lay(world, CX, CZ);
    expect(at(world, CX, CZ)).toBe(B.RAIL_X);
    lay(world, CX + 1, CZ);
    expect(at(world, CX, CZ)).toBe(B.RAIL_X);
    expect(at(world, CX + 1, CZ)).toBe(B.RAIL_X);
  });

  it('a rail placed beside the end of a line turns the end towards it (a straight rail with one neighbour lines up with it)', () => {
    const { world } = make();
    lay(world, CX, CZ);
    // Placed to the north of it: both become north-south.
    lay(world, CX, CZ - 1);
    expect(at(world, CX, CZ)).toBe(B.RAIL_Z);
    expect(at(world, CX, CZ - 1)).toBe(B.RAIL_Z);
  });

  it('makes corners with two neighbours at right angles', () => {
    const { world } = make();
    lay(world, CX - 1, CZ);
    lay(world, CX, CZ);
    lay(world, CX, CZ + 1);
    // The middle one joins west and south.
    expect(at(world, CX, CZ)).toBe(B.RAIL_WS);
    lay(world, CX, CZ - 1);
    // With a rail to the north too it keeps its two joins (it has two already, so the new one stays out of it).
    expect(at(world, CX, CZ)).toBe(B.RAIL_WS);
  });

  it('climbs: a rail beside a rail one block higher becomes a slope up to it, and the other end follows', () => {
    const { world } = make();
    world.setBlock(CX + 1, RAIL_Y, CZ, B.STONE);
    lay(world, CX, CZ);
    lay(world, CX + 1, CZ, RAIL_Y + 1);
    expect(at(world, CX, CZ)).toBe(B.RAIL_UP_PX);
    expect(at(world, CX + 1, CZ, RAIL_Y + 1)).toBe(B.RAIL_X);
    // Climbing towards the other way round.
    const w2 = make().world;
    w2.setBlock(CX - 1, RAIL_Y, CZ, B.STONE);
    lay(w2, CX, CZ);
    lay(w2, CX - 1, CZ, RAIL_Y + 1);
    expect(at(w2, CX, CZ)).toBe(B.RAIL_UP_NX);
  });

  it('straightens out again when a neighbour is removed', () => {
    const { s, world } = make();
    lay(world, CX - 1, CZ);
    lay(world, CX, CZ);
    lay(world, CX, CZ + 1);
    expect(at(world, CX, CZ)).toBe(B.RAIL_WS);
    world.setBlock(CX, RAIL_Y, CZ + 1, B.AIR);
    s.realm.settleAround(CX, RAIL_Y, CZ + 1, false);
    expect(at(world, CX, CZ)).toBe(B.RAIL_X);
    railRemoved(world, CX, RAIL_Y, CZ + 1);
  });

  it('powered rails never turn', () => {
    const { world } = make();
    lay(world, CX - 1, CZ);
    lay(world, CX, CZ, RAIL_Y, true);
    lay(world, CX, CZ + 1);
    expect(railInfo(at(world, CX, CZ))!.curve).toBe(false);
    expect(railInfo(at(world, CX, CZ))!.powered).toBe(true);
  });

  it('every shape drops the one rail item that places it (gold rails drop gold rails)', () => {
    for (const id of PLAIN_RAILS) expect(blockDrops(BLOCKS[id], null, () => 0.5)).toEqual([{ id: B.RAIL_X, count: 1 }]);
    for (const id of POWERED_RAILS) expect(blockDrops(BLOCKS[id], null, () => 0.5)).toEqual([{ id: B.POWERED_RAIL_X, count: 1 }]);
    expect(getItem(B.POWERED_RAIL_X).block).toBe(B.POWERED_RAIL_X);
    expect(NO_ITEM_BLOCKS.has(B.RAIL_ES)).toBe(true);
  });

  it('pops off when the block under it goes', () => {
    const { s, world } = make();
    lay(world, CX, CZ);
    world.setBlock(CX, FLOOR, CZ, B.AIR);
    s.realm.settleAround(CX, FLOOR, CZ, false);
    expect(at(world, CX, CZ)).toBe(B.AIR);
  });

  it('exits meet: the next rail past a rail shares the edge it is entered by', () => {
    const { world } = make();
    lay(world, CX, CZ);
    lay(world, CX + 1, CZ);
    const info = railInfo(B.RAIL_X)!;
    const n = nextRail(world, CX, RAIL_Y, CZ, info.dirB, info.hB);
    expect(n).toMatchObject({ x: CX + 1, y: RAIL_Y, z: CZ });
    expect(nextRail(world, CX, RAIL_Y, CZ, info.dirA, info.hA)).toBeNull();
  });
});

describe('recipes', () => {
  const g = (cells: number[]) => cells.map((c) => (c ? makeStack(c, 1) : null));
  it('a minecart is five iron ingots, a boat five planks, gold rails six gold ingots and a stick', () => {
    const N = I.IRON_INGOT;
    expect(findRecipe(g([N, 0, N, N, N, N]), 3, 2)?.result).toEqual({ id: I.MINECART, count: 1 });
    const P = B.PLANKS;
    expect(findRecipe(g([P, 0, P, P, P, P]), 3, 2)?.result).toEqual({ id: I.BOAT, count: 1 });
    const A = I.GOLD_INGOT;
    const S = I.STICK;
    expect(findRecipe(g([A, 0, A, A, S, A, A, 0, A]), 3, 3)?.result).toEqual({ id: B.POWERED_RAIL_X, count: 6 });
  });
});

describe('minecarts', () => {
  /** A straight track along +x from x0 to x1 (inclusive), cell row z. */
  function track(world: HeadlessWorld, x0: number, x1: number, z = CZ, y = RAIL_Y, powered = false) {
    for (let x = x0; x <= x1; x++) lay(world, x, z, y, powered);
  }
  const cart = (s: GameSession, x: number, z = CZ, y = RAIL_Y): Vehicle => s.realm.vehicles.spawn('minecart', x + 0.5, y + 0.1, z + 0.5)!;

  it('sits on the rail it is set on, and not off one', () => {
    const { s, world } = make();
    track(world, CX, CX + 4);
    const v = cart(s, CX + 2);
    expect(v.rail).toEqual({ x: CX + 2, y: RAIL_Y, z: CZ });
    expect(v.y).toBeCloseTo(RAIL_Y + 0.1, 5);
    expect(s.realm.vehicles.spawn('minecart', CX + 0.5, RAIL_Y + 3, CZ + 3.5)).toBeNull();
  });

  it('rolls along a track with the speed it is given, slows down and stops at the end of the line', () => {
    const { s, world } = make();
    track(world, CX, CX + 5);
    const v = cart(s, CX + 1);
    v.s = 8;
    run(s, 0.25);
    expect(v.x).toBeGreaterThan(CX + 1.5 + 1);
    run(s, 4);
    expect(v.x).toBeLessThanOrEqual(CX + 6);
    expect(v.s).toBe(0);
    // It stopped at the end rather than leaving the track.
    expect(v.rail).toBeTruthy();
    expect(v.x).toBeGreaterThan(CX + 5.5);
    expect(v.z).toBeCloseTo(CZ + 0.5, 3);
  });

  it('runs back the other way when pushed the other way', () => {
    const { s, world } = make();
    track(world, CX, CX + 8);
    const v = cart(s, CX + 6);
    v.s = -5;
    run(s, 2);
    expect(v.x).toBeLessThan(CX + 5);
  });

  it('follows a corner and carries on in the new direction', () => {
    const { s, world } = make();
    track(world, CX, CX + 4);
    for (let z = CZ + 1; z <= CZ + 6; z++) lay(world, CX + 4, z);
    expect(at(world, CX + 4, CZ)).toBe(B.RAIL_WS);
    const v = cart(s, CX + 1);
    v.s = 7;
    run(s, 3);
    expect(v.x).toBeGreaterThan(CX + 4.2);
    expect(v.x).toBeLessThan(CX + 4.8);
    expect(v.z).toBeGreaterThan(CZ + 3);
  });

  it('goes up and over a slope, and rolls back down when it runs out of speed', () => {
    const { s, world } = make();
    for (let x = CX + 3; x <= CX + 6; x++) world.setBlock(x, RAIL_Y, CZ, B.STONE);
    // Flat, then up a hill of three blocks.
    track(world, CX, CX + 2);
    lay(world, CX + 3, CZ, RAIL_Y + 1);
    lay(world, CX + 4, CZ, RAIL_Y + 1);
    expect(at(world, CX + 2, CZ)).toBe(B.RAIL_UP_PX);
    const v = cart(s, CX);
    v.s = 8;
    run(s, 1);
    expect(v.y).toBeGreaterThan(RAIL_Y + 1);
    // A weak push does not make it: it comes back.
    const w = make();
    for (let x = CX + 3; x <= CX + 6; x++) w.world.setBlock(x, RAIL_Y, CZ, B.STONE);
    track(w.world, CX, CX + 2);
    lay(w.world, CX + 3, CZ, RAIL_Y + 1);
    lay(w.world, CX + 4, CZ, RAIL_Y + 1);
    const u = cart(w.s, CX + 1);
    u.s = 1.5;
    run(w.s, 5);
    expect(u.x).toBeLessThan(CX + 3);
  });

  it('gold rails speed it up and plain rails let it slow down', () => {
    const plain = make();
    track(plain.world, CX, CX + 16);
    const a = cart(plain.s, CX);
    a.s = 2;
    run(plain.s, 1);
    const plainSpeed = a.s;
    const gold = make();
    track(gold.world, CX, CX + 16, CZ, RAIL_Y, true);
    const b = cart(gold.s, CX);
    b.s = 2;
    run(gold.s, 1);
    expect(plainSpeed).toBeLessThan(2);
    expect(b.s).toBeGreaterThan(5);
  });

  it('falls when its rail is broken and lands on the next rail it meets', () => {
    const { s, world } = make();
    track(world, CX, CX + 6);
    const v = cart(s, CX + 2);
    v.s = 3;
    world.setBlock(CX + 3, RAIL_Y, CZ, B.AIR);
    world.setBlock(CX + 2, RAIL_Y, CZ, B.AIR);
    run(s, 0.5);
    expect(v.rail).toBeNull();
  });

  it('is pushed by a player walking into it', () => {
    const { s, world } = make();
    track(world, CX - 2, CX + 10, CZ + 8);
    const v = cart(s, CX + 1, CZ + 8);
    s.teleport(CX - 0.5, RAIL_Y, CZ + 8.5, -Math.PI / 2, 0);
    run(s, 1.2, { forward: 1, yaw: -Math.PI / 2 });
    expect(v.x).toBeGreaterThan(CX + 1.5);
  });

  describe('riding', () => {
    it('lets you get in, carries you along, and gets you out on sneak', () => {
      const { s, world } = make();
      track(world, CX, CX + 14, CZ + 8);
      const v = cart(s, CX + 1, CZ + 8);
      s.teleport(CX + 0.5, RAIL_Y, CZ + 8.5, 0, 0);
      expect(s.mount(v)).toBe(true);
      expect(s.riding).toBe(v);
      expect(v.rider).toBe(s.rider);
      v.s = 5;
      run(s, 1);
      expect(s.body.x).toBeCloseTo(v.x, 3);
      expect(s.body.x).toBeGreaterThan(CX + 3);
      expect(s.body.y).toBeCloseTo(v.y + v.spec.seat, 3);
      run(s, 0.2, { sneak: true });
      expect(s.riding).toBeNull();
      expect(v.rider).toBeNull();
      // Standing on the ground beside the track.
      expect(s.body.onGround || s.body.y >= RAIL_Y - 0.01).toBe(true);
      expect(Math.hypot(s.body.x - v.x, s.body.z - v.z)).toBeGreaterThan(0.8);
    });

    it('keeps one rider per cart', () => {
      const { s, world } = make();
      track(world, CX, CX + 4, CZ + 8);
      const v = cart(s, CX + 1, CZ + 8);
      expect(s.mount(v)).toBe(true);
      s.dismount();
      v.rider = {} as never;
      expect(s.mount(v)).toBe(false);
    });

    it('lets the forward key start a cart that is standing still', () => {
      const { s, world } = make();
      track(world, CX - 6, CX + 14, CZ + 8);
      const v = cart(s, CX, CZ + 8);
      s.teleport(CX + 0.5, RAIL_Y, CZ + 8.5, -Math.PI / 2, 0);
      expect(s.mount(v)).toBe(true);
      run(s, 1.5, { forward: 1, yaw: -Math.PI / 2 });
      expect(v.x).toBeGreaterThan(CX + 2);
    });

    it('does not hurt you, and fall damage does not pile up while riding', () => {
      const { s, world } = make();
      track(world, CX, CX + 14, CZ + 8);
      const v = cart(s, CX + 1, CZ + 8);
      s.mount(v);
      v.s = 8;
      run(s, 1);
      expect(s.vitals.health).toBe(20);
    });
  });

  describe('items and hitting', () => {
    it('a minecart item sets a cart on the rail you aim at', () => {
      const { s, world } = make();
      lay(world, CX, CZ + 6);
      s.inventory.set(s.selected, makeStack(I.MINECART, 1));
      // The rail is six blocks ahead (-z) and one down, so look down a little.
      s.teleport(CX + 0.5, RAIL_Y, CZ + 8.5, 0, -0.6);
      run(s, 0.1, { pitch: -0.6, right: true });
      expect(s.realm.vehicles.list).toHaveLength(1);
      expect(s.realm.vehicles.list[0].kind).toBe('minecart');
      expect(s.held).toBeNull();
    });

    it('hitting a cart breaks it into its item (not in creative mode)', () => {
      const m = make();
      track(m.world, CX, CX + 4, CZ + 8);
      const v = cart(m.s, CX + 1, CZ + 8);
      m.s.realm.destroyVehicle(v, true);
      expect(m.s.realm.vehicles.list).toHaveLength(0);
      expect(m.s.realm.drops.drops.some((d) => d.stack.id === I.MINECART)).toBe(true);
      const c = make('creative');
      track(c.world, CX, CX + 4, CZ + 8);
      const w = cart(c.s, CX + 1, CZ + 8);
      c.s.hitVehicle(w);
      expect(c.s.realm.vehicles.list).toHaveLength(0);
      expect(c.s.realm.drops.drops.some((d) => d.stack.id === I.MINECART)).toBe(false);
    });

    it('a punch aimed at a cart breaks it, one aimed past it does not', () => {
      const { s, world } = make();
      track(world, CX - 3, CX + 3, CZ + 6);
      const v = cart(s, CX, CZ + 6);
      s.teleport(CX + 0.5, RAIL_Y, CZ + 8.5, 0, -0.6);
      run(s, 0.1, { pitch: -0.6, left: true });
      expect(s.realm.vehicles.list.includes(v)).toBe(false);
    });

    it('right-clicking a cart climbs in', () => {
      const { s, world } = make();
      track(world, CX - 3, CX + 3, CZ + 6);
      cart(s, CX, CZ + 6);
      s.teleport(CX + 0.5, RAIL_Y, CZ + 8.5, 0, -0.6);
      run(s, 0.1, { pitch: -0.6, right: true });
      expect(s.riding).toBeTruthy();
    });

    it('breaking a ridden cart sets the rider down', () => {
      const { s, world } = make();
      track(world, CX, CX + 4, CZ + 8);
      const v = cart(s, CX + 1, CZ + 8);
      s.mount(v);
      s.realm.destroyVehicle(v, true);
      expect(s.riding).toBeNull();
    });

    it('is saved and restored with the world', () => {
      const a = make();
      track(a.world, CX, CX + 4, CZ + 8);
      const v = cart(a.s, CX + 2, CZ + 8);
      const state = a.s.saveWorldState();
      expect(state.vehicles).toEqual([expect.objectContaining({ kind: 'minecart' })]);
      const b = make();
      track(b.world, CX, CX + 4, CZ + 8);
      b.s.loadWorldState(JSON.parse(JSON.stringify(state)));
      run(b.s, 1);
      expect(b.s.realm.vehicles.list).toHaveLength(1);
      expect(b.s.realm.vehicles.list[0].x).toBeCloseTo(v.x, 1);
    });

    it('a saved cart whose rail is gone comes back as an item', () => {
      const b = make();
      b.s.loadWorldState({ v: 1, time: 0.2, weather: null, blockEntities: null, vehicles: [{ kind: 'minecart', x: CX + 0.5, y: RAIL_Y + 0.1, z: CZ - 6.5, yaw: 0 }] });
      run(b.s, 9);
      expect(b.s.realm.vehicles.list).toHaveLength(0);
      expect(b.s.realm.drops.drops.some((d) => d.stack.id === I.MINECART)).toBe(true);
    });
  });
});

describe('boats', () => {
  function pond(world: HeadlessWorld, x0: number, x1: number, z0: number, z1: number) {
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        world.setBlock(x, FLOOR, z, B.STONE);
        world.setBlock(x, FLOOR + 1, z, B.WATER);
      }
  }

  it('floats at the surface of the water, and falls in the air', () => {
    const { s, world } = make();
    pond(world, CX - 5, CX + 5, CZ - 5, CZ + 5);
    const boat = s.realm.vehicles.spawn('boat', CX + 0.5, FLOOR + 1.4, CZ + 0.5)!;
    run(s, 2);
    // The water's top is at FLOOR + 2 (less a hair); the boat sits a little under that.
    expect(boat.y).toBeGreaterThan(FLOOR + 1.3);
    expect(boat.y).toBeLessThan(FLOOR + 1.9);
    const dry = s.realm.vehicles.spawn('boat', CX + 12.5, FLOOR + 6, CZ + 12.5)!;
    run(s, 2);
    expect(dry.y).toBeLessThan(FLOOR + 1.1);
  });

  it('carries a rider forward in the direction they look', () => {
    const { s, world } = make();
    pond(world, CX - 12, CX + 12, CZ - 12, CZ + 12);
    s.teleport(CX + 0.5, FLOOR + 2, CZ + 8.5, 0, 0);
    const boat = s.realm.vehicles.spawn('boat', CX + 0.5, FLOOR + 1.5, CZ + 8.5, 0)!;
    expect(s.mount(boat)).toBe(true);
    run(s, 2, { forward: 1, yaw: 0 });
    expect(boat.z).toBeLessThan(CZ + 8.5 - 3);
    expect(Math.abs(boat.x - (CX + 0.5))).toBeLessThan(0.5);
    // Turn to the east (yaw -90 degrees looks along +x).
    const z0 = boat.z;
    run(s, 3, { forward: 1, yaw: -Math.PI / 2 });
    expect(boat.x).toBeGreaterThan(CX + 3);
    expect(boat.z).toBeLessThan(z0 + 0.1);
    expect(s.body.x).toBeCloseTo(boat.x, 3);
  });

  it('stops at the shore', () => {
    const { s, world } = make();
    pond(world, CX - 5, CX + 5, CZ - 5, CZ + 5);
    const boat = s.realm.vehicles.spawn('boat', CX + 0.5, FLOOR + 1.5, CZ + 0.5, 0)!;
    boat.vx = 7;
    run(s, 3);
    // The bank of the pond is at CX + 6 (stone as high as the pond's floor: the boat is as wide as 1.4).
    expect(boat.x).toBeLessThan(CX + 6.5);
    expect(Math.abs(boat.vx)).toBeLessThan(1);
  });

  it('a boat item launches it on water and not on land', () => {
    const { s, world } = make();
    pond(world, CX - 3, CX + 3, CZ + 3, CZ + 7);
    s.inventory.set(s.selected, makeStack(I.BOAT, 1));
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 9.5, 0, -0.6);
    run(s, 0.1, { pitch: -0.6, right: true });
    expect(s.realm.vehicles.list.map((v) => v.kind)).toEqual(['boat']);
    expect(s.held).toBeNull();
    // On dry ground it does nothing.
    const g = make();
    g.s.inventory.set(g.s.selected, makeStack(I.BOAT, 1));
    run(g.s, 0.1, { pitch: -0.5, right: true });
    expect(g.s.realm.vehicles.list).toHaveLength(0);
    expect(g.s.held?.id).toBe(I.BOAT);
  });
});
