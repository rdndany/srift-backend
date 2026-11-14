import { describe, expect, it } from 'vitest';
import { ADVENTURE_SEED, GameSession, HeadlessWorld, I, makeGenerator, makeStack, mulberry32, skillBookId, type AdventureWorldGenerator, type InputFrame, type SessionEvent } from './index';

const generator = makeGenerator(ADVENTURE_SEED, 'adventure') as AdventureWorldGenerator;
const idle = (): InputFrame => ({ t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: -1.4, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false });

function make() {
  const world = new HeadlessWorld(generator);
  const s = new GameSession({ seed: ADVENTURE_SEED, world, generator, naturalSpawning: false, rand: mulberry32(4), classId: 'warrior', mode: 'survival' });
  s.finishLoading();
  s.teleport(5.5, generator.hubY + 1, 8.5);
  for (let i = 0; i < 4; i++) s.tick(idle());
  s.drainEvents();
  return s;
}

const lie = (s: GameSession, stack: ReturnType<typeof makeStack>): void => s.realm.drops.spawn(stack, 5.5, generator.hubY + 1, 8.5, 0, 0, 0, 0);
const pickups = (events: SessionEvent[]) => events.filter((e): e is Extract<SessionEvent, { t: 'pickup' }> => e.t === 'pickup');
const settle = (s: GameSession): SessionEvent[] => {
  const out: SessionEvent[] = [];
  for (let i = 0; i < 10; i++) {
    s.tick(idle());
    out.push(...s.drainEvents());
  }
  return out;
};

describe('the pickup feed', () => {
  it('tells what was picked up, how many, and how many the bag holds now', () => {
    const s = make();
    lie(s, makeStack(I.STICK, 3));
    const got = pickups(settle(s));
    expect(got).toEqual([{ t: 'pickup', id: I.STICK, count: 3, total: 3 }]);
  });

  it('counts the stack the bag already holds in its total', () => {
    const s = make();
    s.inventory.set(0, makeStack(I.STICK, 10));
    lie(s, makeStack(I.STICK, 4));
    const got = pickups(settle(s));
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ count: 4, total: 14 });
  });

  it('merges stacks of one kind picked up together and keeps different kinds apart', () => {
    const s = make();
    lie(s, makeStack(I.STICK, 2));
    lie(s, makeStack(I.STICK, 5));
    lie(s, makeStack(skillBookId('fireball'), 1));
    const got = pickups(settle(s));
    expect(got.find((g) => g.id === I.STICK)).toMatchObject({ count: 7, total: 7 });
    expect(got.find((g) => g.id === skillBookId('fireball'))).toMatchObject({ count: 1 });
    expect(got).toHaveLength(2);
  });

  it('carries the name and enchantments of what was picked up', () => {
    const s = make();
    const sword = makeStack(I.GREATSWORD, 1, 0, [[0, 2]]);
    sword.name = 'Sting';
    lie(s, sword);
    const got = pickups(settle(s));
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ id: I.GREATSWORD, name: 'Sting', ench: [[0, 2]] });
  });

  it('only counts what fit when the bag is nearly full', () => {
    const s = make();
    for (let i = 0; i < s.inventory.size; i++) s.inventory.set(i, makeStack(I.GREATSWORD, 1));
    s.inventory.set(5, makeStack(I.STICK, 60));
    lie(s, makeStack(I.STICK, 10));
    const got = pickups(settle(s));
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ id: I.STICK, count: 4, total: 64 });
  });

  it('says nothing when nothing was picked up', () => {
    const s = make();
    expect(pickups(settle(s))).toEqual([]);
  });
});
