import { describe, expect, it } from 'vitest';
import {
  B,
  GameSession,
  HeadlessWorld,
  I,
  RECIPES,
  WorldGenerator,
  blockDrops,
  BLOCKS,
  buttonInfo,
  canStayAt,
  doorId,
  doorInfo,
  gateId,
  gateInfo,
  getItem,
  leverInfo,
  makeStack,
  mountedId,
  mulberry32,
  placementFor,
  toolId,
  plateInfo,
  rtorchInfo,
  trapdoorId,
  trapdoorInfo,
  wireArms,
  wireId,
  wirePower,
  isConductor,
} from './index';

const SEED = 1337;
const FLOOR = 100;
const X0 = 0;
const Z0 = 0;

function make() {
  const generator = new WorldGenerator(SEED);
  const world = new HeadlessWorld(generator);
  for (let x = X0 - 6; x <= X0 + 30; x++)
    for (let z = Z0 - 8; z <= Z0 + 8; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 10; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.STONE);
    }
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(5) });
  s.finishLoading();
  // Stay out of the way (and off any plate).
  s.teleport(X0 + 0.5, FLOOR + 1, Z0 + 6.5, 0, 0);
  return { s, world, rs: s.realm.redstone };
}

type Rig = ReturnType<typeof make>;
const Y = FLOOR + 1;
const run = (r: Rig, ticks: number) => {
  for (let i = 0; i < ticks; i++) r.rs.tick();
};
const power = (r: Rig, x: number, z: number, y = Y) => wirePower(r.world.getBlock(x, y, z));
/** A line of dust along x from x0 to x1 at z = 0, with a lever of the given state at x0 - 1 stuck on the floor. */
function line(r: Rig, x0: number, x1: number) {
  for (let x = x0; x <= x1; x++) r.world.setBlock(x, Y, 0, wireId(0));
}
const lever = (r: Rig, x: number, z: number, on = false) => r.world.setBlock(x, Y, z, mountedId(B.LEVER_BASE, 0, on));

describe('redstone blocks and items', () => {
  it('has ids that fit and do not clash', () => {
    const ids = new Set<number>();
    const all: number[] = [B.REDSTONE_ORE, B.REDSTONE_BLOCK, B.LAMP, B.LAMP_ON];
    for (let i = 0; i < 16; i++) all.push(B.WIRE_BASE + i);
    for (let i = 0; i < 10; i++) all.push(B.LEVER_BASE + i, B.BUTTON_BASE + i, B.RTORCH_BASE + i);
    all.push(B.PLATE_STONE, B.PLATE_STONE_ON, B.PLATE_WOOD, B.PLATE_WOOD_ON);
    for (const id of all) {
      expect(ids.has(id), `id ${id} is used twice`).toBe(false);
      ids.add(id);
      expect(BLOCKS[id]?.id, `block ${id}`).toBe(id);
    }
  });

  it('describes levers, buttons, plates and torches by their id', () => {
    expect(leverInfo(mountedId(B.LEVER_BASE, 3, true))).toEqual({ face: 3, on: true });
    expect(buttonInfo(mountedId(B.BUTTON_BASE, 0, false))).toEqual({ face: 0, on: false });
    expect(rtorchInfo(mountedId(B.RTORCH_BASE, 2, true))).toEqual({ face: 2, on: true });
    expect(plateInfo(B.PLATE_WOOD_ON)).toEqual({ wood: true, on: true });
    expect(plateInfo(B.PLATE_STONE)).toEqual({ wood: false, on: false });
    expect(leverInfo(B.STONE)).toBeNull();
    expect(wirePower(wireId(7))).toBe(7);
    expect(wirePower(B.STONE)).toBe(-1);
  });

  it('is crafted from dust, and dust comes from the ore', () => {
    const makes = (id: number) => RECIPES.some((r) => r.result.id === id);
    for (const id of [B.REDSTONE_BLOCK, B.RTORCH_BASE + 1, B.LEVER_BASE, B.BUTTON_BASE, B.PLATE_STONE, B.PLATE_WOOD, B.LAMP, I.REDSTONE]) expect(makes(id), `recipe for ${id}`).toBe(true);
    const drops = blockDrops(BLOCKS[B.REDSTONE_ORE], getItem(toolId('pickaxe', 'iron')).tool, () => 0.5);
    expect(drops[0].id).toBe(I.REDSTONE);
    expect(drops[0].count).toBeGreaterThanOrEqual(4);
    expect(drops[0].count).toBeLessThanOrEqual(5);
    // The ore needs an iron pickaxe.
    expect(blockDrops(BLOCKS[B.REDSTONE_ORE], null, () => 0.5)).toEqual([]);
  });

  it('drops one item whatever the state', () => {
    const one = (id: number) => blockDrops(BLOCKS[id], null, () => 0.5).map((d) => d.id);
    expect(one(wireId(9))).toEqual([I.REDSTONE]);
    expect(one(mountedId(B.LEVER_BASE, 2, true))).toEqual([B.LEVER_BASE]);
    expect(one(mountedId(B.BUTTON_BASE, 4, true))).toEqual([B.BUTTON_BASE]);
    expect(one(mountedId(B.RTORCH_BASE, 0, false))).toEqual([B.RTORCH_BASE + 1]);
    expect(one(B.PLATE_STONE_ON)).toEqual([B.PLATE_STONE]);
    expect(one(B.LAMP_ON)).toEqual([B.LAMP]);
  });

  it('places levers, buttons and torches on the floor or a wall, never a ceiling', () => {
    expect(placementFor(B.LEVER_BASE, 0, 1, 0)).toBe(mountedId(B.LEVER_BASE, 0, false));
    expect(placementFor(B.LEVER_BASE, 0, -1, 0)).toBeNull();
    // Clicking the +x side of a block puts it on that block's +x side: the block holding it is at -x (dir 1).
    expect(placementFor(B.LEVER_BASE, 1, 0, 0)).toBe(mountedId(B.LEVER_BASE, 2, false));
    expect(placementFor(B.BUTTON_BASE, 0, 0, -1)).toBe(mountedId(B.BUTTON_BASE, 3, false));
    expect(placementFor(B.RTORCH_BASE + 1, 0, 1, 0)).toBe(mountedId(B.RTORCH_BASE, 0, true));
    expect(placementFor(B.RTORCH_BASE + 1, -1, 0, 0)).toBe(mountedId(B.RTORCH_BASE, 1, true));
  });

  it('needs something to hold it up', () => {
    const { world } = make();
    expect(canStayAt(wireId(0), world, 3, Y, 0)).toBe(true);
    expect(canStayAt(wireId(0), world, 3, Y + 3, 0)).toBe(false);
    expect(canStayAt(mountedId(B.LEVER_BASE, 1, false), world, 3, Y, 0)).toBe(false);
    world.setBlock(2, Y, 0, B.STONE);
    expect(canStayAt(mountedId(B.LEVER_BASE, 2, false), world, 3, Y, 0)).toBe(true); // face 2 is dir 1 (-x): the stone at x = 2 holds it
    expect(canStayAt(mountedId(B.LEVER_BASE, 2, false), world, 1, Y, 0)).toBe(false);
    expect(canStayAt(B.PLATE_STONE, world, 3, Y, 0)).toBe(true);
    expect(canStayAt(B.PLATE_STONE, world, 3, Y + 4, 0)).toBe(false);
  });
});

describe('dust', () => {
  it('carries a lever through a line and loses one level per block', () => {
    const r = make();
    lever(r, 0, 0);
    line(r, 1, 6);
    r.rs.notify(1, Y, 0);
    run(r, 3);
    for (let x = 1; x <= 6; x++) expect(power(r, x, 0)).toBe(0);
    r.rs.toggleLever(0, Y, 0);
    run(r, 3);
    for (let x = 1; x <= 6; x++) expect(power(r, x, 0), `x ${x}`).toBe(16 - x);
    r.rs.toggleLever(0, Y, 0);
    run(r, 3);
    for (let x = 1; x <= 6; x++) expect(power(r, x, 0)).toBe(0);
  });

  it('fades out after fifteen blocks', () => {
    const r = make();
    lever(r, 0, 0, true);
    line(r, 1, 20);
    r.rs.notify(1, Y, 0);
    run(r, 3);
    expect(power(r, 15, 0)).toBe(1);
    expect(power(r, 16, 0)).toBe(0);
    expect(power(r, 20, 0)).toBe(0);
  });

  it('reaches both ways round a corner and through a branch from the strongest side', () => {
    const r = make();
    r.world.setBlock(5, Y, 0, B.REDSTONE_BLOCK);
    for (const [x, z] of [[4, 0], [3, 0], [3, 1], [3, 2], [6, 0], [7, 0]]) r.world.setBlock(x, Y, z, wireId(0));
    r.rs.notify(5, Y, 0);
    run(r, 3);
    expect(power(r, 4, 0)).toBe(15);
    expect(power(r, 3, 0)).toBe(14);
    expect(power(r, 3, 2)).toBe(12);
    expect(power(r, 7, 0)).toBe(14);
  });

  it('climbs a block and comes down again', () => {
    const r = make();
    r.world.setBlock(5, Y, 0, B.REDSTONE_BLOCK);
    r.world.setBlock(6, Y, 0, wireId(0));
    r.world.setBlock(7, Y, 0, B.STONE);
    r.world.setBlock(7, Y + 1, 0, wireId(0));
    r.world.setBlock(8, Y + 1, 0, wireId(0));
    r.rs.notify(5, Y, 0);
    run(r, 3);
    expect(power(r, 6, 0)).toBe(15);
    expect(power(r, 7, 0, Y + 1)).toBe(14);
    expect(power(r, 8, 0, Y + 1)).toBe(13);
    // The arms record the climb for the mesher.
    expect(wireArms((x, y, z) => r.world.getBlock(x, y, z), 6, Y, 0) & 0xf0).toBe(16);
  });

  it('is cut by a solid block on top of the wire', () => {
    const r = make();
    r.world.setBlock(5, Y, 0, B.REDSTONE_BLOCK);
    r.world.setBlock(6, Y, 0, wireId(0));
    r.world.setBlock(6, Y + 1, 0, B.STONE);
    r.world.setBlock(7, Y + 1, 0, wireId(0));
    r.rs.notify(5, Y, 0);
    run(r, 3);
    expect(power(r, 6, 0)).toBe(15);
    expect(power(r, 7, 0, Y + 1)).toBe(0);
  });

  it('is removed with the block under it, giving dust back', () => {
    const r = make();
    r.world.setBlock(4, Y, 0, B.STONE);
    r.world.setBlock(4, Y + 1, 0, wireId(0));
    r.s.breakBlock(4, Y, 0);
    expect(r.world.getBlock(4, Y + 1, 0)).toBe(B.AIR);
  });

  it('draws an arm only to what it connects to', () => {
    const r = make();
    const get = (x: number, y: number, z: number) => r.world.getBlock(x, y, z);
    r.world.setBlock(5, Y, 0, wireId(0));
    expect(wireArms(get, 5, Y, 0)).toBe(0);
    r.world.setBlock(6, Y, 0, wireId(0));
    expect(wireArms(get, 5, Y, 0) & 15).toBe(1);
    r.world.setBlock(5, Y, 1, mountedId(B.LEVER_BASE, 0, false));
    expect(wireArms(get, 5, Y, 0) & 15).toBe(1 | 4);
  });
});

describe('what reads power', () => {
  it('lights a lamp and puts it out', () => {
    const r = make();
    lever(r, 0, 0);
    line(r, 1, 3);
    r.world.setBlock(4, Y, 0, B.LAMP);
    r.rs.notify(0, Y, 0);
    run(r, 2);
    expect(r.world.getBlock(4, Y, 0)).toBe(B.LAMP);
    r.rs.toggleLever(0, Y, 0);
    run(r, 3);
    expect(r.world.getBlock(4, Y, 0)).toBe(B.LAMP_ON);
    expect(BLOCKS[B.LAMP_ON].light).toBe(15);
    r.rs.toggleLever(0, Y, 0);
    run(r, 3);
    expect(r.world.getBlock(4, Y, 0)).toBe(B.LAMP);
  });

  it('powers a block a lever is fixed to, and what touches that', () => {
    const r = make();
    r.world.setBlock(5, Y, 0, B.STONE);
    // A lever on the -x side of the stone: its face index is the way to the support (+x = dir 0, so face 1).
    r.world.setBlock(4, Y, 0, mountedId(B.LEVER_BASE, 1, true));
    r.world.setBlock(6, Y, 0, B.LAMP); // next to the stone: lit through it
    r.world.setBlock(4, Y + 2, 0, B.LAMP); // diagonal to the lever: not
    r.rs.notify(4, Y, 0);
    run(r, 3);
    expect(r.world.getBlock(6, Y, 0)).toBe(B.LAMP_ON);
    expect(r.world.getBlock(4, Y + 2, 0)).toBe(B.LAMP);
    expect(isConductor(B.STONE)).toBe(true);
    expect(isConductor(B.GLASS)).toBe(false);
  });

  it('does not light a lamp across an unrelated lever without a block between', () => {
    const r = make();
    lever(r, 0, 0, true);
    r.world.setBlock(2, Y, 0, B.LAMP);
    r.rs.notify(0, Y, 0);
    run(r, 3);
    expect(r.world.getBlock(2, Y, 0)).toBe(B.LAMP);
    // Right beside it, it does.
    r.world.setBlock(1, Y, 0, B.LAMP);
    r.rs.notify(1, Y, 0);
    run(r, 3);
    expect(r.world.getBlock(1, Y, 0)).toBe(B.LAMP_ON);
  });

  it('opens and shuts a door, a trapdoor and a gate, and leaves a hand-opened one alone', () => {
    const r = make();
    r.world.setBlock(2, Y, 0, doorId(false, false, 0));
    r.world.setBlock(2, Y + 1, 0, doorId(true, false, 0));
    r.world.setBlock(2, Y, 3, trapdoorId(false, false, 0));
    r.world.setBlock(2, Y, 5, gateId(false, 0));
    r.world.setBlock(1, Y, 0, B.REDSTONE_BLOCK);
    r.world.setBlock(1, Y, 3, B.REDSTONE_BLOCK);
    r.world.setBlock(1, Y, 5, B.REDSTONE_BLOCK);
    for (const z of [0, 3, 5]) r.rs.notify(1, Y, z);
    run(r, 2);
    expect(doorInfo(r.world.getBlock(2, Y, 0))?.open).toBe(true);
    expect(doorInfo(r.world.getBlock(2, Y + 1, 0))?.open).toBe(true);
    expect(trapdoorInfo(r.world.getBlock(2, Y, 3))?.open).toBe(true);
    expect(gateInfo(r.world.getBlock(2, Y, 5))?.open).toBe(true);
    for (const z of [0, 3, 5]) r.world.setBlock(1, Y, z, B.AIR);
    for (const z of [0, 3, 5]) r.rs.notify(1, Y, z);
    run(r, 2);
    expect(doorInfo(r.world.getBlock(2, Y, 0))?.open).toBe(false);
    expect(trapdoorInfo(r.world.getBlock(2, Y, 3))?.open).toBe(false);
    expect(gateInfo(r.world.getBlock(2, Y, 5))?.open).toBe(false);
    // A door the player opened stays open when something unrelated changes beside it.
    r.s.useBlock(2, Y, 0);
    expect(doorInfo(r.world.getBlock(2, Y, 0))?.open).toBe(true);
    r.world.setBlock(3, Y, 1, B.STONE);
    r.rs.notify(3, Y, 1);
    run(r, 3);
    expect(doorInfo(r.world.getBlock(2, Y, 0))?.open).toBe(true);
  });

  it('lights the fuse of TNT', () => {
    const r = make();
    r.world.setBlock(3, Y, 0, B.TNT);
    r.world.setBlock(2, Y, 0, B.REDSTONE_BLOCK);
    r.rs.notify(2, Y, 0);
    run(r, 2);
    expect(r.s.realm.litTnt).toBe(1);
  });
});

describe('torches', () => {
  /** A torch standing on the stone at x = 2 with the lever making that stone powered from x = 1... laid out per test. */
  it('turn off when the block they hang on is powered, one tick late', () => {
    const r = make();
    // A stone block with a standing torch beside a lit lever stuck to the stone's side.
    r.world.setBlock(3, Y, 0, B.STONE);
    r.world.setBlock(3, Y + 1, 0, mountedId(B.RTORCH_BASE, 0, true));
    r.world.setBlock(2, Y, 0, mountedId(B.LEVER_BASE, 1, false));
    r.rs.notify(3, Y, 0);
    run(r, 3);
    expect(rtorchInfo(r.world.getBlock(3, Y + 1, 0))?.on).toBe(true);
    r.rs.toggleLever(2, Y, 0);
    r.rs.tick();
    // The torch sees the stone powered on this tick but only the *next* change reaches what it feeds.
    run(r, 2);
    expect(rtorchInfo(r.world.getBlock(3, Y + 1, 0))?.on).toBe(false);
    r.rs.toggleLever(2, Y, 0);
    run(r, 3);
    expect(rtorchInfo(r.world.getBlock(3, Y + 1, 0))?.on).toBe(true);
  });

  it('power the block above them and the dust beside them', () => {
    const r = make();
    r.world.setBlock(3, Y, 0, mountedId(B.RTORCH_BASE, 0, true)); // stands on the floor
    r.world.setBlock(4, Y, 0, wireId(0));
    r.world.setBlock(5, Y, 0, wireId(0));
    r.world.setBlock(3, Y + 1, 0, B.STONE);
    r.world.setBlock(3, Y + 2, 0, B.LAMP);
    r.rs.notify(3, Y, 0);
    run(r, 3);
    expect(power(r, 4, 0)).toBe(15);
    expect(power(r, 5, 0)).toBe(14);
    expect(r.world.getBlock(3, Y + 2, 0)).toBe(B.LAMP_ON);
  });

  it('burn out when flipped too fast, and light again after a rest', () => {
    const r = make();
    r.world.setBlock(3, Y, 0, B.STONE);
    r.world.setBlock(3, Y + 1, 0, mountedId(B.RTORCH_BASE, 0, true));
    r.world.setBlock(2, Y, 0, mountedId(B.LEVER_BASE, 1, false));
    r.rs.notify(3, Y, 0);
    run(r, 3);
    for (let i = 0; i < 10; i++) {
      r.rs.toggleLever(2, Y, 0);
      run(r, 2);
    }
    // The lever is off again, so the torch should be lit, but it has burnt out.
    expect(leverInfo(r.world.getBlock(2, Y, 0))?.on).toBe(false);
    expect(rtorchInfo(r.world.getBlock(3, Y + 1, 0))?.on).toBe(false);
    run(r, 30);
    expect(rtorchInfo(r.world.getBlock(3, Y + 1, 0))?.on).toBe(true);
  });
});
describe('buttons and plates', () => {
  it('a button pushes in, powers its block for a second and pops out', () => {
    const r = make();
    r.world.setBlock(3, Y, 0, B.STONE);
    r.world.setBlock(2, Y, 0, mountedId(B.BUTTON_BASE, 1, false)); // on the -x side of the stone, pointing at it
    r.world.setBlock(4, Y, 0, B.LAMP);
    r.s.useBlock(2, Y, 0);
    expect(buttonInfo(r.world.getBlock(2, Y, 0))?.on).toBe(true);
    run(r, 3);
    expect(r.world.getBlock(4, Y, 0)).toBe(B.LAMP_ON);
    run(r, 5);
    expect(buttonInfo(r.world.getBlock(2, Y, 0))?.on).toBe(true);
    run(r, 4);
    expect(buttonInfo(r.world.getBlock(2, Y, 0))?.on).toBe(false);
    run(r, 3);
    expect(r.world.getBlock(4, Y, 0)).toBe(B.LAMP);
  });

  it('a lever is toggled with a right-click', () => {
    const r = make();
    lever(r, 3, 0);
    r.s.useBlock(3, Y, 0);
    expect(leverInfo(r.world.getBlock(3, Y, 0))?.on).toBe(true);
    r.s.useBlock(3, Y, 0);
    expect(leverInfo(r.world.getBlock(3, Y, 0))?.on).toBe(false);
  });

  it('a pressure plate is down while somebody stands on it and rises a second after they step off', () => {
    const r = make();
    r.world.setBlock(3, Y, 0, B.PLATE_STONE);
    r.world.setBlock(4, Y, 0, wireId(0));
    r.world.setBlock(5, Y, 0, B.LAMP);
    r.rs.notify(3, Y, 0);
    run(r, 2);
    expect(plateInfo(r.world.getBlock(3, Y, 0))?.on).toBe(false);
    r.s.teleport(3.5, Y, 0.5, 0, 0);
    run(r, 3);
    expect(plateInfo(r.world.getBlock(3, Y, 0))?.on).toBe(true);
    expect(r.world.getBlock(5, Y, 0)).toBe(B.LAMP_ON);
    r.s.teleport(8.5, Y, 6.5, 0, 0);
    run(r, 5);
    expect(plateInfo(r.world.getBlock(3, Y, 0))?.on).toBe(true);
    run(r, 8);
    expect(plateInfo(r.world.getBlock(3, Y, 0))?.on).toBe(false);
    run(r, 4);
    expect(r.world.getBlock(5, Y, 0)).toBe(B.LAMP);
  });

  it('stone plates ignore dropped items, wooden ones feel them', () => {
    const r = make();
    r.world.setBlock(3, Y, 0, B.PLATE_STONE);
    r.world.setBlock(6, Y, 0, B.PLATE_WOOD);
    r.s.realm.drops.spawn(makeStack(B.DIRT, 1), 3.5, Y + 0.3, 0.5, 0, 0, 0, 0);
    r.s.realm.drops.spawn(makeStack(B.DIRT, 1), 6.5, Y + 0.3, 0.5, 0, 0, 0, 0);
    run(r, 3);
    expect(plateInfo(r.world.getBlock(3, Y, 0))?.on).toBe(false);
    expect(plateInfo(r.world.getBlock(6, Y, 0))?.on).toBe(true);
  });

  it('keeps a running button and a pressed plate across a save', () => {
    const r = make();
    r.world.setBlock(3, Y, 0, B.STONE);
    r.world.setBlock(2, Y, 0, mountedId(B.BUTTON_BASE, 1, false));
    r.rs.pressButton(2, Y, 0);
    r.world.setBlock(8, Y, 0, B.PLATE_STONE);
    r.s.teleport(8.5, Y, 0.5, 0, 0);
    run(r, 2);
    const saved = JSON.parse(JSON.stringify(r.s.realm.saveState()));
    expect(saved.redstone.buttons).toHaveLength(1);
    expect(saved.redstone.plates).toHaveLength(1);
    const r2 = make();
    r2.world.setBlock(3, Y, 0, B.STONE);
    r2.world.setBlock(2, Y, 0, mountedId(B.BUTTON_BASE, 1, true));
    r2.world.setBlock(8, Y, 0, B.PLATE_STONE_ON);
    r2.s.realm.loadState(saved);
    run(r2, 14);
    expect(buttonInfo(r2.world.getBlock(2, Y, 0))?.on).toBe(false);
    expect(plateInfo(r2.world.getBlock(8, Y, 0))?.on).toBe(false);
  });
});
