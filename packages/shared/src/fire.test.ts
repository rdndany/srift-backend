import { describe, expect, it } from 'vitest';
import {
  B,
  BLOCKS,
  BURN_ODDS,
  CHUNK_BYTES,
  FireSim,
  GameSession,
  HeadlessWorld,
  I,
  IGNITE_ODDS,
  NO_ITEM_BLOCKS,
  RECIPES,
  WorldGenerator,
  blockDrops,
  canStayAt,
  decodeChunk,
  encodeChunk,
  gateId,
  gateInfo,
  isFlammable,
  makeStack,
  mulberry32,
  woolId,
  type FireHost,
  type InputFrame,
} from './index';

const SEED = 4242;
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

/** A flat stone floor under open air; the player stands at the middle looking toward -z. */
function make(mode: 'survival' | 'creative' = 'survival') {
  const generator = new WorldGenerator(SEED);
  const world = new HeadlessWorld(generator);
  for (let x = CX - 14; x <= CX + 14; x++)
    for (let z = CZ - 14; z <= CZ + 14; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 14; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.STONE);
    }
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(11), mode });
  s.finishLoading();
  s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
  return { s, world };
}

/** Count blocks of one id in a box. */
function count(world: HeadlessWorld, id: number, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): number {
  let n = 0;
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) if (world.getBlock(x, y, z) === id) n++;
  return n;
}

describe('what burns', () => {
  it('wood, leaves, wool, plants and books burn; stone, dirt and sand do not', () => {
    for (const id of [B.PLANKS, B.LOG, B.BIRCH_LOG, B.LEAVES, B.WOOL, woolId(5), B.TALL_GRASS, B.BOOKSHELF, B.FENCE, B.GATE_BASE]) {
      expect(isFlammable(id), BLOCKS[id].name).toBe(true);
      expect(BURN_ODDS[id]).toBeGreaterThan(0);
    }
    for (const id of [B.STONE, B.DIRT, B.SAND, B.COBBLE, B.GLASS, B.OBSIDIAN, B.AIR, B.WATER, B.CRAFTING_TABLE]) expect(IGNITE_ODDS[id], BLOCKS[id].name).toBe(0);
  });

  it('leaves and grass go faster than logs, as in the original', () => {
    expect(IGNITE_ODDS[B.LEAVES]).toBeGreaterThan(IGNITE_ODDS[B.LOG]);
    expect(BURN_ODDS[B.TALL_GRASS]).toBeGreaterThan(BURN_ODDS[B.LOG]);
  });
});

describe('the fire block', () => {
  it('is not an item, gives no light-weight drop and gives off light', () => {
    expect(NO_ITEM_BLOCKS.has(B.FIRE)).toBe(true);
    expect(blockDrops(BLOCKS[B.FIRE], null, () => 0.5)).toEqual([]);
    expect(BLOCKS[B.FIRE].light).toBe(15);
    expect(BLOCKS[B.FIRE].solid).toBe(false);
    expect(BLOCKS[B.FIRE].replaceable).toBe(true);
  });

  it('needs a floor or something to burn beside it', () => {
    const { world } = make();
    expect(canStayAt(B.FIRE, world, CX + 3, FLOOR + 1, CZ)).toBe(true); // on the stone floor
    expect(canStayAt(B.FIRE, world, CX + 3, FLOOR + 6, CZ)).toBe(false); // in mid-air
    world.setBlock(CX + 4, FLOOR + 6, CZ, B.PLANKS);
    expect(canStayAt(B.FIRE, world, CX + 3, FLOOR + 6, CZ)).toBe(true); // clinging to a plank
  });

  it('does not collide with the gate ids it took over', () => {
    expect(gateInfo(B.FIRE)).toBeNull();
    for (let f = 0; f < 4; f++) {
      expect(gateInfo(gateId(false, f))!.open).toBe(false);
      expect(gateInfo(gateId(true, f))!.open).toBe(true);
      expect(gateId(true, f)).toBeLessThan(B.FIRE);
    }
  });
});

describe('flint and steel', () => {
  it('is made from an iron ingot and a flint', () => {
    const r = RECIPES.find((x) => x.result.id === I.FLINT_AND_STEEL);
    expect(r?.shapeless?.slice().sort()).toEqual([I.IRON_INGOT, I.FLINT].sort());
  });

  it('lights a fire on the face you click, and wears down', () => {
    const { s, world } = make();
    s.inventory.set(0, makeStack(I.FLINT_AND_STEEL, 1));
    s.selected = 0;
    expect(s.useHeldOn({ x: CX + 2, y: FLOOR, z: CZ, id: B.STONE, nx: 0, ny: 1, nz: 0 })).toBe(true);
    expect(world.getBlock(CX + 2, FLOOR + 1, CZ)).toBe(B.FIRE);
    expect(s.realm.fire.count).toBe(1);
    expect(s.inventory.get(0)!.damage).toBe(1);
    // Not on a flame, and not into a solid block.
    expect(s.useHeldOn({ x: CX + 2, y: FLOOR + 1, z: CZ, id: B.FIRE, nx: 0, ny: 1, nz: 0 })).toBe(false);
    expect(s.useHeldOn({ x: CX + 2, y: FLOOR, z: CZ, id: B.STONE, nx: 0, ny: -1, nz: 0 })).toBe(false);
  });

  it('is not used up in creative mode, and creative players do not burn', () => {
    const { s, world } = make('creative');
    s.inventory.set(0, makeStack(I.FLINT_AND_STEEL, 1));
    s.selected = 0;
    expect(s.useHeldOn({ x: CX + 2, y: FLOOR, z: CZ, id: B.STONE, nx: 0, ny: 1, nz: 0 })).toBe(true);
    expect(s.inventory.get(0)!.damage).toBe(0);
    world.setBlock(CX, FLOOR + 1, CZ, B.FIRE);
    for (let i = 0; i < 40; i++) s.tick(idle());
    expect(s.onFire).toBe(0);
  });

  it('lights tall grass where it stands', () => {
    const { s, world } = make();
    world.setBlock(CX + 2, FLOOR, CZ, B.DIRT);
    world.setBlock(CX + 2, FLOOR + 1, CZ, B.TALL_GRASS);
    s.inventory.set(0, makeStack(I.FLINT_AND_STEEL, 1));
    s.selected = 0;
    expect(s.useHeldOn({ x: CX + 2, y: FLOOR + 1, z: CZ, id: B.TALL_GRASS, nx: 0, ny: 1, nz: 0 })).toBe(true);
    expect(world.getBlock(CX + 2, FLOOR + 1, CZ)).toBe(B.FIRE);
  });
});

describe('a fire burns, spreads and goes out', () => {
  it('dies on bare ground within seconds', () => {
    const { s, world } = make();
    expect(s.realm.fire.ignite(CX + 3, FLOOR + 1, CZ)).toBe(true);
    s.realm.fire.run(40);
    expect(world.getBlock(CX + 3, FLOOR + 1, CZ)).toBe(B.AIR);
    expect(s.realm.fire.count).toBe(0);
  });

  it('cannot be lit where nothing holds it', () => {
    const { s, world } = make();
    expect(s.realm.fire.ignite(CX + 3, FLOOR + 8, CZ)).toBe(false);
    expect(world.getBlock(CX + 3, FLOOR + 8, CZ)).toBe(B.AIR);
    expect(s.realm.fire.ignite(CX + 3, FLOOR, CZ)).toBe(false); // the cell is stone
  });

  it('runs through a wooden floor and eats it', () => {
    const { s, world } = make();
    for (let x = CX + 2; x <= CX + 9; x++) for (let z = CZ - 4; z <= CZ + 4; z++) world.setBlock(x, FLOOR, z, B.PLANKS);
    const before = count(world, B.PLANKS, CX + 2, CX + 9, FLOOR, FLOOR, CZ - 4, CZ + 4);
    expect(before).toBe(8 * 9);
    expect(s.realm.fire.ignite(CX + 5, FLOOR + 1, CZ)).toBe(true);
    s.realm.fire.run(240);
    const after = count(world, B.PLANKS, CX + 2, CX + 9, FLOOR, FLOOR, CZ - 4, CZ + 4);
    expect(after).toBeLessThan(before - 10);
  });

  it('eats leaves and grass much faster than logs', () => {
    const { s, world } = make();
    // Two columns of fuel, side by side, lit at the same time.
    for (let y = FLOOR + 1; y <= FLOOR + 5; y++) {
      world.setBlock(CX + 3, y, CZ - 6, B.LOG);
      world.setBlock(CX + 3, y, CZ + 6, B.LEAVES);
    }
    s.realm.fire.ignite(CX + 2, FLOOR + 1, CZ - 6);
    s.realm.fire.ignite(CX + 2, FLOOR + 1, CZ + 6);
    s.realm.fire.run(30);
    const logs = count(world, B.LOG, CX + 3, CX + 3, FLOOR + 1, FLOOR + 5, CZ - 6, CZ - 6);
    const leaves = count(world, B.LEAVES, CX + 3, CX + 3, FLOOR + 1, FLOOR + 5, CZ + 6, CZ + 6);
    expect(leaves).toBeLessThanOrEqual(logs);
  });

  it('goes out in the rain (but not under a roof)', () => {
    const { s, world } = make();
    for (let x = CX + 2; x <= CX + 6; x++) world.setBlock(x, FLOOR, CZ, B.PLANKS);
    world.setBlock(CX + 8, FLOOR, CZ, B.PLANKS);
    // A roof over the second fire.
    for (let x = CX + 7; x <= CX + 9; x++) for (let z = CZ - 1; z <= CZ + 1; z++) world.setBlock(x, FLOOR + 3, z, B.STONE);
    s.realm.fire.ignite(CX + 4, FLOOR + 1, CZ);
    s.realm.fire.ignite(CX + 8, FLOOR + 1, CZ);
    s.realm.weather.set('rain');
    s.realm.fire.run(8);
    expect(world.getBlock(CX + 4, FLOOR + 1, CZ)).toBe(B.AIR);
    expect(world.getBlock(CX + 8, FLOOR + 1, CZ)).toBe(B.FIRE);
  });

  it('stands still when nobody is near', () => {
    const { s, world } = make();
    s.realm.fire.ignite(CX + 3, FLOOR + 1, CZ);
    s.teleport(CX + 500.5, FLOOR + 1, CZ + 0.5);
    s.realm.fire.run(60);
    expect(world.getBlock(CX + 3, FLOOR + 1, CZ)).toBe(B.FIRE);
  });

  it('picks up fires that were saved in the world', () => {
    const { s, world } = make();
    world.setBlock(CX + 3, FLOOR + 1, CZ, B.FIRE); // as if loaded from a chunk
    expect(s.realm.fire.count).toBe(0);
    s.realm.world.growCrops(2, s.realm.rand, (x, y, z) => s.realm.fire.adopt(x, y, z));
    expect(s.realm.fire.count).toBe(1);
  });

  it('is put out by punching it, with nothing dropped', () => {
    const { s, world } = make();
    s.realm.fire.ignite(CX + 3, FLOOR + 1, CZ);
    s.breakBlock(CX + 3, FLOOR + 1, CZ);
    expect(world.getBlock(CX + 3, FLOOR + 1, CZ)).toBe(B.AIR);
    expect(s.realm.fire.count).toBe(0);
    expect(s.realm.drops.drops.length).toBe(0);
  });

  it('is washed away by water', () => {
    const { s, world } = make();
    s.realm.fire.ignite(CX + 3, FLOOR + 1, CZ);
    world.setBlock(CX + 3, FLOOR + 2, CZ, B.WATER);
    s.realm.fluids.notify(CX + 3, FLOOR + 2, CZ);
    s.realm.fluids.settle();
    expect(world.getBlock(CX + 3, FLOOR + 1, CZ)).not.toBe(B.FIRE);
  });
});

describe('fire hurts', () => {
  it('a player standing in flames takes damage and is set alight, until water puts it out', () => {
    const { s, world } = make();
    world.setBlock(CX, FLOOR + 1, CZ, B.FIRE);
    let low = s.vitals.health;
    for (let i = 0; i < 30; i++) {
      s.tick(idle());
      low = Math.min(low, s.vitals.health);
    }
    expect(low).toBeLessThan(20);
    expect(s.onFire).toBeGreaterThan(0);
    expect(s.burning).toBe(true);
    // Step out; it keeps burning for a while, then water ends it at once.
    world.setBlock(CX, FLOOR + 1, CZ, B.AIR);
    s.teleport(CX + 4.5, FLOOR + 1, CZ + 0.5);
    for (let i = 0; i < 10; i++) s.tick(idle());
    expect(s.onFire).toBeGreaterThan(0);
    world.setBlock(CX + 4, FLOOR + 1, CZ, B.WATER);
    world.setBlock(CX + 4, FLOOR + 2, CZ, B.WATER);
    for (let i = 0; i < 10; i++) s.tick(idle());
    expect(s.onFire).toBe(0);
  });

  it('a player who burns to death is told so', () => {
    const { s, world } = make();
    world.setBlock(CX, FLOOR + 1, CZ, B.FIRE);
    s.vitals.health = 2;
    // Hungry enough that natural regeneration does not outpace the flames.
    s.vitals.hunger = 10;
    for (let i = 0; i < 80 && !s.vitals.dead; i++) s.tick(idle());
    expect(s.vitals.dead).toBe(true);
    expect(s.deathMessage()).toBe('You burned to death');
  });

  it('a mob that walks into flames burns, and drops cooked meat if it dies burning', () => {
    const { s, world } = make();
    world.setBlock(CX + 6, FLOOR + 1, CZ, B.FIRE);
    const cow = s.realm.mobs.spawn('cow', CX + 6.5, FLOOR + 1, CZ + 0.5);
    for (let i = 0; i < 30; i++) s.realm.mobs.update(0.05, { world: s.realm.world.physicsReader, player: { x: CX + 0.5, y: FLOOR + 1, z: CZ + 0.5, alive: true, invulnerable: true, yaw: 0, pitch: 0 }, daylight: 1, rand: mulberry32(5) }, s.realm.mobEvents);
    expect(cow.onFire).toBeGreaterThan(0);
    s.realm.mobs.damage(cow, 100, 0, 0, s.realm.mobEvents, true, false);
    const dropped = s.realm.drops.drops.map((d) => d.stack.id);
    expect(dropped).toContain(I.COOKED_MEAT);
    expect(dropped).not.toContain(I.RAW_MEAT);
  });

  it('items that fall into flames are lost', () => {
    const { s, world } = make();
    world.setBlock(CX + 3, FLOOR + 1, CZ, B.FIRE);
    s.realm.drops.spawn(makeStack(B.DIRT, 1), CX + 3.5, FLOOR + 1.5, CZ + 0.5, 0, 0, 0, 0);
    for (let i = 0; i < 20; i++) s.tick(idle());
    expect(s.realm.drops.drops.length).toBe(0);
  });
});

describe('FireSim on its own', () => {
  /** A tiny world of a map of blocks, to check the rules without a session. */
  function mini(floor: number) {
    const blocks = new Map<string, number>();
    const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
    const get = (x: number, y: number, z: number) => (y < floor ? B.STONE : (blocks.get(key(x, y, z)) ?? B.AIR));
    const rand = mulberry32(99);
    const host: FireHost = {
      getBlock: get,
      setBlock: (x, y, z, id) => {
        if (get(x, y, z) === id) return false;
        blocks.set(key(x, y, z), id);
        return true;
      },
      consume: (x, y, z) => blocks.set(key(x, y, z), B.AIR),
      rainsOn: () => false,
      active: () => true,
      sound: () => {},
      rand,
    };
    return { sim: new FireSim(host), host, get, blocks, key };
  }

  it('does not burn a lone fire block on stone for more than a few ticks', () => {
    const { sim, get } = mini(0);
    sim.ignite(0, 0, 0);
    sim.run(30);
    expect(get(0, 0, 0)).toBe(B.AIR);
  });

  it('keeps burning while it has fuel and spreads upwards through a tower of leaves', () => {
    const { sim, host, get } = mini(0);
    for (let y = 0; y < 6; y++) host.setBlock(1, y, 0, B.LEAVES);
    sim.ignite(0, 0, 0);
    sim.run(90);
    let leaves = 0;
    for (let y = 0; y < 6; y++) if (get(1, y, 0) === B.LEAVES) leaves++;
    expect(leaves).toBeLessThan(6);
  });
});

/** A chunk as the byte-per-block formats wrote it: the given blocks first, then air. */
function oldChunk(format: number, ids: number[]): Uint8Array {
  const out: number[] = [format];
  for (const id of ids) out.push(id, 1);
  let run = CHUNK_BYTES - ids.length;
  out.push(0);
  while (run >= 0x80) {
    out.push((run & 0x7f) | 0x80);
    run >>>= 7;
  }
  out.push(run);
  return Uint8Array.from(out);
}

describe('old chunks', () => {
  it('read format 3 as it is, and format 4 with ids past a byte', () => {
    const v3 = decodeChunk(oldChunk(3, [B.FIRE, B.GRINDSTONE, B.STONE]));
    expect([v3[0], v3[1], v3[2], v3[3]]).toEqual([B.FIRE, B.GRINDSTONE, B.STONE, 0]);
    const wide = new Uint16Array(CHUNK_BYTES);
    wide[0] = 1000;
    wide[1] = 255;
    wide[2] = 127;
    wide[3] = 128;
    const back = decodeChunk(encodeChunk(wide));
    expect([back[0], back[1], back[2], back[3], back[4]]).toEqual([1000, 255, 127, 128, 0]);
    // An id the game has no room for is refused when read, and never written.
    expect(() => decodeChunk(Uint8Array.from([4, 0xff, 0x7f, 1]))).toThrow();
    const bad = new Uint16Array(CHUNK_BYTES);
    bad[0] = 60000;
    expect(decodeChunk(encodeChunk(bad))[0]).toBe(0);
  });

  it('renumber the fence gates they were saved with', () => {
    // Old layout: 167 + (open ? 4 : 0) + facing, one byte per block.
    const v1 = oldChunk(1, [167, 168, 169, 170, 171, 172, 173, 174]);
    const got = decodeChunk(v1);
    for (let f = 0; f < 4; f++) {
      const closed = gateInfo(got[f])!;
      expect(closed).toEqual({ open: false, facing: f & 2 });
      const open = gateInfo(got[4 + f])!;
      expect(open).toEqual({ open: true, facing: f & 2 });
    }
    // Chunks of the current format are left as they are (fire is id 173).
    const now = new Uint16Array(CHUNK_BYTES);
    now[0] = B.FIRE;
    now[1] = gateId(true, 3);
    const back = decodeChunk(encodeChunk(now));
    expect(back[0]).toBe(B.FIRE);
    expect(back[1]).toBe(gateId(true, 3));
  });
});

