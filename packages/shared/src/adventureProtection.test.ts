import { describe, expect, it } from 'vitest';
import {
  ADVENTURE_SEED,
  B,
  DUNGEON_MIN_LEVEL,
  GameSession,
  HeadlessWorld,
  I,
  NPCS,
  NPC_LEASH,
  makeGenerator,
  makeStack,
  mulberry32,
  totalForLevel,
  type AdventureWorldGenerator,
  type InputFrame,
  type Mob,
} from './index';

const idle = (over: Partial<InputFrame> = {}): InputFrame => ({ t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false, ...over });

const generator = makeGenerator(ADVENTURE_SEED, 'adventure') as AdventureWorldGenerator;

function make(seed = 5) {
  const world = new HeadlessWorld(generator);
  const s = new GameSession({ seed: ADVENTURE_SEED, world, generator, naturalSpawning: false, rand: mulberry32(seed) });
  s.finishLoading();
  return { s, world };
}

const run = (s: GameSession, seconds: number): void => {
  for (let i = 0; i < Math.round(seconds * 20); i++) s.tick(idle());
};

const toasts = (s: GameSession): string[] => s.drainEvents().flatMap((e) => (e.t === 'toast' ? [e.text] : []));

const Y = generator.hubY;

/** A column of the paved Landing, where there is nothing but paving. */
const LX = 0;
const LZ = 25;
const topOf = (world: HeadlessWorld): number => {
  let y = Y + 4;
  while (y > 0 && world.getBlock(LX, y, LZ) === B.AIR) y--;
  return y;
};

describe('the protected places of Adventure', () => {
  it('cover the village (bedrock to sky), the chapel and the Hollow Cellar, and nothing of the wilderness', () => {
    expect(generator.isProtected(0, Y - 1, 0)).toBe(true);
    expect(generator.isProtected(0, 2, 0)).toBe(true);
    expect(generator.isProtected(-38, Y, 37)).toBe(true);
    expect(generator.isProtected(37, 200, -38)).toBe(true);
    expect(generator.isProtected(38, Y - 1, 0)).toBe(false); // the skirt around the village
    expect(generator.isProtected(-39, Y, 0)).toBe(false);
    expect(generator.isProtected(60, Y, 60)).toBe(false);
    // The chapel, with its portal, and every copy of the dungeon.
    expect(generator.isProtected(92, generator.ruinY, 0)).toBe(true);
    expect(generator.isProtected(92, generator.ruinY + 2, 0)).toBe(true);
    for (const slot of [0, 5, 47]) for (const c of generator.instanceCages(slot)) expect(generator.isProtected(c.x, c.y, c.z)).toBe(true);
    expect(generator.isProtected(generator.cellarEnd, generator.cellarY + 2, generator.roomZ)).toBe(true);
    // The land under the old cellar's place is plain land now, and free.
    expect(generator.isProtected(generator.roomX + 10, generator.cellarY + 2, 0)).toBe(false);
  });

  it('are the same in an ordinary world: nothing is', () => {
    expect(makeGenerator(7, 'overworld').isProtected(0, 70, 0)).toBe(false);
  });
});

describe('an Adventure player in a protected place', () => {
  it('cannot break its blocks, and is told why', () => {
    const { s, world } = make();
    s.teleport(LX + 0.5, Y + 1, LZ + 0.5, 0, 0);
    run(s, 0.2);
    s.drainEvents();
    const top = topOf(world);
    const floor = world.getBlock(LX, top, LZ);
    expect(floor).not.toBe(B.AIR);
    s.breakBlock(LX, top, LZ);
    expect(world.getBlock(LX, top, LZ)).toBe(floor);
    expect(toasts(s).join(' ')).toMatch(/protected/);
  });

  it('cannot place blocks, pour water or light fires there', () => {
    const { s, world } = make();
    s.teleport(LX + 0.5, Y + 1, LZ + 0.5, 0, 0);
    run(s, 0.2);
    const top = topOf(world);
    s.inventory.set(0, makeStack(B.STONE, 8));
    s.inventory.set(1, makeStack(I.FLINT_AND_STEEL, 1));
    s.selected = 0;
    const t = { x: LX, y: top, z: LZ, id: world.getBlock(LX, top, LZ), nx: 0, ny: 1, nz: 0 };
    expect(s.useHeldOn(t)).toBe(false);
    expect(world.getBlock(LX, top + 1, LZ)).toBe(B.AIR);
    s.selected = 1;
    expect(s.useHeldOn(t)).toBe(false);
    expect(world.getBlock(LX, top + 1, LZ)).toBe(B.AIR);
    // The fluid itself: a bucket aimed at the ground.
    s.inventory.set(2, makeStack(I.WATER_BUCKET, 1));
    s.selected = 2;
    s.teleport(LX + 0.5, top + 1, LZ + 0.5, 0, -Math.PI / 2 + 0.01);
    run(s, 0.1);
    expect(s.useBucket()).toBe(false);
    expect(s.held?.id).toBe(I.WATER_BUCKET);
    expect(world.getBlock(LX, top + 1, LZ)).toBe(B.AIR);
  });

  it('can build and mine outside it, right up to its edge', () => {
    const { s, world } = make();
    s.teleport(50.5, Y + 20, 0.5, 0, 0);
    run(s, 0.2);
    let gy = world.surfaceY(50, 0) + 3;
    while (gy > 1 && world.getBlock(50, gy - 1, 0) === B.AIR) gy--; // gy: the first air above the ground
    s.teleport(50.5, gy + 1, 2.5, 0, 0);
    run(s, 0.2);
    s.inventory.set(0, makeStack(B.STONE, 8));
    s.selected = 0;
    const id = world.getBlock(50, gy - 1, 0);
    expect(s.useHeldOn({ x: 50, y: gy - 1, z: 0, id, nx: 0, ny: 1, nz: 0 })).toBe(true);
    expect(world.getBlock(50, gy, 0)).toBe(B.STONE);
    s.breakBlock(50, gy, 0);
    expect(world.getBlock(50, gy, 0)).toBe(B.AIR);
  });

  it('may still mine a spawner of the cellar, which is what the quests ask for', () => {
    const { s, world } = make();
    s.xp.add(totalForLevel(DUNGEON_MIN_LEVEL));
    s.realm.usePortal(s);
    run(s, 0.2);
    const c = generator.instanceCages(s.realm.copyAt(s))[0];
    expect(world.getBlock(c.x, c.y, c.z)).toBe(B.SPAWNER);
    s.breakBlock(c.x, c.y, c.z);
    expect(world.getBlock(c.x, c.y, c.z)).toBe(B.AIR);
    // ... but not the wall beside it.
    const wall = world.getBlock(c.x, c.y - 1, c.z);
    s.breakBlock(c.x, c.y - 1, c.z);
    expect(world.getBlock(c.x, c.y - 1, c.z)).toBe(wall);
  });

  it('can change everything in creative mode (an operator online)', () => {
    const { s, world } = make();
    s.teleport(LX + 0.5, Y + 1, LZ + 0.5, 0, 0);
    run(s, 0.2);
    s.setMode('creative');
    const top = topOf(world);
    s.breakBlock(LX, top, LZ);
    expect(world.getBlock(LX, top, LZ)).toBe(B.AIR);
  });
});

describe('the world around a protected place', () => {
  it('leaves it standing when TNT goes off beside it', () => {
    const { s, world } = make();
    s.teleport(LX + 0.5, Y + 1, LZ + 6.5, 0, 0);
    run(s, 0.2);
    const top = topOf(world);
    const around: number[][] = [];
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) around.push([LX + dx, top, LZ + dz, world.getBlock(LX + dx, top, LZ + dz)]);
    s.realm.primeTnt(LX, top + 1, LZ, 0.1);
    run(s, 0.5);
    for (const [x, y, z, id] of around) expect(world.getBlock(x, y, z), `${x},${y},${z}`).toBe(id);
    // The same blast out in the wilderness does dig.
    s.teleport(60.5, Y + 20, 2.5, 0, 0);
    run(s, 0.2);
    const gy = world.surfaceY(60, 0);
    s.teleport(60.5, gy + 1, 3.5, 0, 0);
    run(s, 0.2);
    const before = world.getBlock(60, gy - 1, 0);
    s.realm.primeTnt(60, gy, 0, 0.1);
    run(s, 0.5);
    expect(world.getBlock(60, gy - 1, 0)).not.toBe(before);
  });

  it('is not flooded by water poured outside it', () => {
    const { s, world } = make();
    // Dry the cells first (the skirt may hold a pond), then pour at the edge.
    const x = 38;
    const z = -20;
    s.teleport(x + 0.5, Y + 2, z + 0.5, 0, 0);
    run(s, 0.3);
    const gy = Math.max(world.surfaceY(x, z), Y);
    for (let dx = -3; dx <= 3; dx++) world.setBlock(x + dx, gy, z, B.AIR);
    world.setBlock(x, gy, z, B.WATER);
    s.realm.blockChanged(x, gy, z);
    run(s, 4);
    expect(world.getBlock(x, gy, z) === B.WATER || world.getBlock(x + 1, gy, z) !== B.AIR).toBe(true); // outside it did flow
    expect(world.getBlock(x - 1, gy, z)).not.toBe(B.WATER);
    expect(world.getBlock(x - 2, gy, z)).toBe(B.AIR);
  });
});

describe('a quest giver', () => {
  const station = (id: string) => {
    const i = NPCS.findIndex((n) => n.id === id);
    return { i, npc: NPCS[i] };
  };
  const mobOf = (s: GameSession, i: number): Mob => {
    const m = s.mobs.mobs.find((x) => x.kind === 'npc' && x.variant === i);
    if (!m) throw new Error('no npc');
    return m;
  };

  it('is put back when something has pushed them out of place', () => {
    const { s } = make();
    const { i, npc } = station(NPCS[0].id);
    s.teleport(npc.x, Y + 1, npc.z + 3, 0, 0);
    run(s, 2);
    const m = mobOf(s, i);
    const home = { x: m.body.x, y: m.body.y, z: m.body.z };
    m.body.x += 9;
    m.body.z -= 7;
    run(s, 2);
    expect(Math.hypot(m.body.x - home.x, m.body.z - home.z)).toBeLessThanOrEqual(NPC_LEASH);
    expect(Math.abs(m.body.y - home.y)).toBeLessThanOrEqual(NPC_LEASH);
  });

  it('is freed, and gets their floor back, when someone (an operator, say) has walled them in or dug the ground away', () => {
    const { s, world } = make();
    const { i, npc } = station(NPCS[0].id);
    s.teleport(npc.x, Y + 1, npc.z + 3, 0, 0);
    run(s, 2);
    const m = mobOf(s, i);
    const x = Math.floor(m.body.x);
    const y = Math.floor(m.body.y + 0.01);
    const z = Math.floor(m.body.z);
    // A hole under them, and a roof over their head.
    world.setBlock(x, y - 1, z, B.AIR);
    world.setBlock(x, y + 1, z, B.STONE);
    world.setBlock(x, y, z, B.STONE);
    run(s, 2.5);
    expect(world.getBlock(x, y, z)).toBe(B.AIR);
    expect(world.getBlock(x, y + 1, z)).toBe(B.AIR);
    expect(world.getBlock(x, y - 1, z)).not.toBe(B.AIR);
    expect(Math.abs(m.body.y - y)).toBeLessThan(1.5);
    expect(s.mobs.mobs.includes(m)).toBe(true);
  });
});
