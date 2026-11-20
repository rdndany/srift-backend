import { describe, expect, it } from 'vitest';
import { B, DEATH_WEAR, GameSession, HeadlessWorld, I, WorldGenerator, armorId, getItem, makeStack, mulberry32, parseSessionMessage, toolId, type InputFrame } from './index';

const idle = (): InputFrame => ({ t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false });

/** A session on a clean stone platform (top surface y = 101). */
function make() {
  const generator = new WorldGenerator(1337);
  const world = new HeadlessWorld(generator);
  for (let x = -10; x <= 26; x++)
    for (let z = -10; z <= 26; z++) {
      for (let y = 101; y < 112; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, 100, z, B.STONE);
    }
  const s = new GameSession({ seed: 1337, world, generator, naturalSpawning: false, rand: mulberry32(3) });
  s.finishLoading();
  s.teleport(8.5, 101, 8.5, 0, 0);
  return s;
}

const die = (s: GameSession): void => {
  s.vitals.damage(1000, 'generic');
  s.tick(idle());
  expect(s.screen).toBe('dead');
};

describe('dying', () => {
  it('keeps everything you carry and drops nothing', () => {
    const s = make();
    s.inventory.set(0, makeStack(B.PLANKS, 5));
    s.inventory.set(1, makeStack(I.BREAD, 3));
    s.inventory.set(20, makeStack(B.COBBLE, 40));
    die(s);
    expect(s.inventory.countOf(B.PLANKS)).toBe(5);
    expect(s.inventory.countOf(I.BREAD)).toBe(3);
    expect(s.drops.count).toBe(0);
    s.apply({ t: 'respawn' });
    expect(s.inventory.countOf(B.PLANKS)).toBe(5);
  });

  it('wears the armor you wear, the shield and the tool in your hand by a fifth, and nothing else', () => {
    const s = make();
    const sword = toolId('sword', 'iron');
    const spare = toolId('pickaxe', 'iron');
    s.inventory.set(0, makeStack(sword));
    s.selectSlot(0);
    s.inventory.set(1, makeStack(spare));
    s.armor.set(0, makeStack(armorId(0, 'iron')));
    s.offhand.set(0, makeStack(I.SHIELD));
    die(s);
    const dur = (id: number): number => getItem(id).durability;
    expect(s.inventory.get(0)!.damage).toBe(Math.ceil(dur(sword) * DEATH_WEAR));
    expect(s.armor.get(0)!.damage).toBe(Math.ceil(dur(armorId(0, 'iron')) * DEATH_WEAR));
    expect(s.offhand.get(0)!.damage).toBe(Math.ceil(dur(I.SHIELD) * DEATH_WEAR));
    expect(s.inventory.get(1)!.damage).toBe(0); // in the pack, not equipped
  });

  it('never breaks anything: what is nearly gone keeps a single point', () => {
    const s = make();
    const sword = toolId('sword', 'wood');
    const dur = getItem(sword).durability;
    s.inventory.set(0, { id: sword, count: 1, damage: dur - 3 });
    s.selectSlot(0);
    die(s);
    expect(s.inventory.get(0)).not.toBeNull();
    expect(s.inventory.get(0)!.damage).toBe(dur - 1);
    s.apply({ t: 'respawn' });
    s.apply({ t: 'select', slot: 0 });
    // Dying again changes nothing more.
    die(s);
    expect(s.inventory.get(0)!.damage).toBe(dur - 1);
  });

  it('leaves what cannot wear (blocks, food, an empty hand) alone', () => {
    const s = make();
    s.inventory.set(0, makeStack(B.PLANKS, 5));
    s.selectSlot(0);
    die(s);
    expect(s.inventory.get(0)!.damage ?? 0).toBe(0);
    expect(s.inventory.get(0)!.count).toBe(5);
  });
});

describe('letting go of the cursor outside the screen', () => {
  it('drops the stack on the ground: all of it, or one at a time', () => {
    const s = make();
    s.inventory.set(0, makeStack(B.PLANKS, 10));
    s.apply({ t: 'inventory' });
    s.apply({ t: 'click', slot: s.menu!.slots.findIndex((sl) => sl.kind !== 'result' && s.menu!.stackAt(s.menu!.slots.indexOf(sl))?.id === B.PLANKS), button: 0 });
    expect(s.menu!.cursor?.count).toBe(10);
    s.apply({ t: 'dropCursor', all: false });
    expect(s.menu!.cursor?.count).toBe(9);
    expect(s.drops.count).toBe(1);
    s.apply({ t: 'dropCursor', all: true });
    expect(s.menu!.cursor).toBeNull();
    expect(s.inventory.countOf(B.PLANKS)).toBe(0);
    const dropped = s.drops.drops.reduce((n, d) => n + d.stack.count, 0);
    expect(dropped).toBe(10);
    // Nothing on the cursor: nothing happens.
    s.apply({ t: 'dropCursor', all: true });
    expect(s.drops.drops.reduce((n, d) => n + d.stack.count, 0)).toBe(10);
  });
});

describe('the trash beside the screen', () => {
  const pickUp = (s: ReturnType<typeof make>, id: number) => s.apply({ t: 'click', slot: s.menu!.slots.findIndex((sl, i) => sl.kind !== 'result' && s.menu!.stackAt(i)?.id === id), button: 0 });

  it('destroys what is on the cursor for good: one at a time, or all of it', () => {
    const s = make();
    s.inventory.set(0, makeStack(B.PLANKS, 10));
    s.apply({ t: 'inventory' });
    pickUp(s, B.PLANKS);
    expect(s.menu!.cursor?.count).toBe(10);
    s.apply({ t: 'destroyCursor', all: false });
    expect(s.menu!.cursor?.count).toBe(9);
    s.apply({ t: 'destroyCursor', all: true });
    expect(s.menu!.cursor).toBeNull();
    expect(s.inventory.countOf(B.PLANKS)).toBe(0);
    expect(s.drops.drops.length).toBe(0);
  });

  it('does nothing with an empty cursor, and the protocol understands it', () => {
    const s = make();
    s.inventory.set(0, makeStack(B.PLANKS, 3));
    s.apply({ t: 'inventory' });
    s.apply({ t: 'destroyCursor', all: true });
    expect(s.inventory.countOf(B.PLANKS)).toBe(3);
    expect(parseSessionMessage({ t: 'destroyCursor', all: true })).toEqual({ t: 'destroyCursor', all: true });
    expect(parseSessionMessage({ t: 'destroyCursor' })).toBeNull();
  });

  it('keeps what cannot be thrown away', () => {
    const s = make();
    s.inventory.set(0, makeStack(I.EMBERSTONE, 1));
    s.apply({ t: 'inventory' });
    pickUp(s, I.EMBERSTONE);
    s.apply({ t: 'destroyCursor', all: true });
    expect(s.menu!.cursor?.id).toBe(I.EMBERSTONE);
  });
});