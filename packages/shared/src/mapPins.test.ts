import { describe, expect, it } from 'vitest';
import { ADVENTURE_SEED, GameSession, HeadlessWorld, Player, makeGenerator, mulberry32, type AdventureWorldGenerator, type InputFrame, type SessionEvent } from './index';

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

type Pins = Extract<SessionEvent, { t: 'pins' }>;

const run = (s: GameSession, seconds: number): SessionEvent[] => {
  for (let i = 0; i < Math.round(seconds * 20); i++) s.tick(idle());
  return s.drainEvents() as SessionEvent[];
};

const lastPins = (es: SessionEvent[]): Pins | undefined => es.filter((e): e is Pins => e.t === 'pins').pop();
describe('party members on the map', () => {
  const generator = makeGenerator(ADVENTURE_SEED, 'adventure') as AdventureWorldGenerator;

  function pair() {
    const world = new HeadlessWorld(generator);
    const s = new GameSession({ seed: ADVENTURE_SEED, world, generator, naturalSpawning: false, rand: mulberry32(4) });
    s.finishLoading();
    const a = new Player(s.realm, { mode: 'survival', name: 'Ada' });
    const b = new Player(s.realm, { mode: 'survival', name: 'Bob' });
    a.finishLoading();
    b.finishLoading();
    s.realm.parties.invite(a, 'Bob');
    s.realm.parties.accept(b);
    return { realm: s.realm, a, b };
  }

  it('are sent to their party, wherever they are, and not to themselves', () => {
    const { a, b } = pair();
    a.teleport(10.2, generator.hubY + 1, 5.8);
    b.teleport(-60.4, generator.hubY + 1, 30.6);
    a.drainEvents();
    b.drainEvents();
    a.postRealm(0.3);
    b.postRealm(0.3);
    const forA = lastPins(a.drainEvents() as SessionEvent[]);
    const forB = lastPins(b.drainEvents() as SessionEvent[]);
    expect(forA?.party).toEqual([{ name: 'Bob', x: -60, z: 31 }]);
    expect(forB?.party).toEqual([{ name: 'Ada', x: 10, z: 6 }]);
  });

  it('follow them when they move, and are not repeated when they stand still', () => {
    const { a, b } = pair();
    b.teleport(0.5, generator.hubY + 1, 0.5);
    a.postRealm(0.3);
    a.drainEvents();
    a.postRealm(0.3);
    expect((a.drainEvents() as SessionEvent[]).filter((e) => e.t === 'pins').length).toBe(0);
    b.teleport(12.5, generator.hubY + 1, 3.5);
    a.postRealm(0.3);
    expect(lastPins(a.drainEvents() as SessionEvent[])?.party).toEqual([{ name: 'Bob', x: 13, z: 4 }]);
  });

  it('are gone from the map when the party is left', () => {
    const { realm, a, b } = pair();
    a.postRealm(0.3);
    expect(lastPins(a.drainEvents() as SessionEvent[])?.party.length).toBe(1);
    realm.parties.leave(b);
    a.postRealm(0.3);
    expect(lastPins(a.drainEvents() as SessionEvent[])?.party).toEqual([]);
  });

  it('are not sent to somebody who has no party', () => {
    const world = new HeadlessWorld(generator);
    const s = new GameSession({ seed: ADVENTURE_SEED, world, generator, naturalSpawning: false, rand: mulberry32(4) });
    s.finishLoading();
    s.drainEvents();
    run(s, 1);
    expect(s.drainEvents().some((e) => e.t === 'pins')).toBe(false);
  });
});
