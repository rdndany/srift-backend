import { describe, expect, it } from 'vitest';
import {
  B,
  BUILD_MATERIALS,
  GameSession,
  HeadlessWorld,
  I,
  MASONRY,
  MobManager,
  WorldGenerator,
  armorId,
  findRecipe,
  makeStack,
  mulberry32,
  slabId,
  type InputFrame,
} from './index';

/**
 * An armor stand is set on the ground, dressed, posed, and broken for its pieces back.
 * The craft is six sticks and one smooth stone slab.
 */

const SEED = 1337;
const FLOOR = 100;
const CX = 8;
const CZ = 8;

const frame = (over: Partial<InputFrame> = {}): InputFrame => ({
  t: 'frame',
  dt: 1 / 20,
  locked: true,
  yaw: 0,
  pitch: -0.6,
  forward: 0,
  strafe: 0,
  jump: false,
  sprint: false,
  sneak: false,
  left: false,
  right: false,
  ...over,
});

describe('armor stands', () => {
  const stone = BUILD_MATERIALS.length + MASONRY.findIndex((row) => row.spec.name === 'smooth_stone');
  const slab = slabId(stone, false);
  const stick = makeStack(I.STICK, 1);
  const helm = armorId(0, 'iron');

  it('is made from six sticks and a smooth stone slab', () => {
    const grid = [stick, stick, stick, null, stick, null, stick, makeStack(slab, 1), stick];
    expect(findRecipe(grid, 3, 3)?.result).toEqual({ id: I.ARMOR_STAND, count: 1 });
  });

  it('is placed, dressed, posed, emptied, saved, and broken for what it wore', () => {
    const generator = new WorldGenerator(SEED);
    const world = new HeadlessWorld(generator);
    for (let x = CX - 6; x <= CX + 6; x++) {
      for (let z = CZ - 2; z <= CZ + 8; z++) {
        for (let y = FLOOR; y < FLOOR + 6; y++) world.setBlock(x, y, z, y === FLOOR ? B.STONE : B.AIR);
      }
    }
    const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(5) });
    s.finishLoading();
    s.clearInventory();
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 3.5, 0, -0.6);
    s.giveItem(I.ARMOR_STAND, 2);
    s.selectSlot(0);

    const stands = () => s.mobs.mobs.filter((m) => m.kind === 'armor_stand' && !m.dead);
    s.tick(frame());
    s.tick(frame({ right: true }));
    s.tick(frame());
    expect(stands()).toHaveLength(1);
    expect(s.inventory.countOf(I.ARMOR_STAND)).toBe(1);
    const stand = stands()[0]!;
    expect(stand.yaw).toBe(0);

    s.giveItem(helm, 1);
    const worn = s.inventory.get(1)!;
    worn.damage = 4;
    worn.name = 'Old Helm';
    s.selectSlot(1);
    s.tick(frame());
    s.tick(frame({ right: true }));
    expect(stand.gear).toEqual([helm, 0, 0, 0, 0]);
    expect(stand.standGear?.[0]?.damage).toBe(4);
    expect(stand.standGear?.[0]?.name).toBe('Old Helm');
    expect(s.inventory.countOf(helm)).toBe(0);

    s.tick(frame());
    s.tick(frame({ right: true, sneak: true }));
    expect(stand.variant).toBe(1);
    expect(stand.gear?.[0]).toBe(helm);

    const saved = s.mobs.toJSON(CX + 0.5, CZ + 3.5, 40);
    const fresh = new MobManager(() => 0);
    expect(fresh.loadJSON(saved)).toBe(1);
    const back = fresh.mobs[0]!;
    expect(back.kind).toBe('armor_stand');
    expect(back.variant).toBe(1);
    expect(back.homeYaw).toBe(stand.yaw);
    expect(back.gear).toEqual([helm, 0, 0, 0, 0]);
    expect(back.standGear?.[0]?.damage).toBe(4);
    expect(back.standGear?.[0]?.name).toBe('Old Helm');

    s.selectSlot(2);
    s.tick(frame());
    s.tick(frame({ right: true }));
    expect(stand.gear).toEqual([0, 0, 0, 0, 0]);
    expect(s.inventory.countOf(helm)).toBe(1);

    s.selectSlot(1);
    s.tick(frame());
    s.tick(frame({ right: true }));
    expect(stand.gear?.[0]).toBe(helm);

    for (let i = 0; i < 40 && !stand.dead; i++) s.tick(frame({ left: i % 12 === 0 }));
    expect(stand.dead).toBe(true);
    const dropped = s.realm.drops.drops.map((d) => d.stack.id);
    expect(dropped).toContain(I.ARMOR_STAND);
    expect(dropped).toContain(helm);
  });
});
