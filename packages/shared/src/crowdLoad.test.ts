import { describe, expect, it } from 'vitest';
import {
  ADVENTURE_SEED,
  B,
  GameSession,
  HeadlessWorld,
  Player,
  Realm,
  STEP_RANGE,
  STEP_SOUNDS_PER_TICK,
  makeGenerator,
  mulberry32,
  type AdventureWorldGenerator,
  type SessionEvent,
} from './index';

// What keeps a crowd in one place from costing the server more than it must (see `Realm.emitNear` and `Realm.scanWards`).

const generator = makeGenerator(ADVENTURE_SEED, 'adventure') as AdventureWorldGenerator;

function make(): Realm {
  const world = new HeadlessWorld(generator);
  const s = new GameSession({ seed: ADVENTURE_SEED, world, generator, naturalSpawning: false, rand: mulberry32(4) });
  s.finishLoading();
  return s.realm;
}

function person(realm: Realm, name: string, dx: number): Player {
  const p = new Player(realm, { mode: 'survival', name });
  p.finishLoading();
  p.teleport(realm.players[0].body.x + dx, realm.players[0].body.y, realm.players[0].body.z);
  return p;
}

/** The sounds a player was told of since they last looked, by what made them. */
const heard = (p: Player): Record<string, number> => {
  const by: Record<string, number> = {};
  for (const e of p.drainEvents() as SessionEvent[]) if (e.t === 'sound') by[e.action] = (by[e.action] ?? 0) + 1;
  return by;
};

describe('the sounds of a crowd', () => {
  it('footsteps carry a short way, other sounds as far as before', () => {
    const realm = make();
    const a = realm.players[0];
    const near = person(realm, 'Near', STEP_RANGE - 4);
    const far = person(realm, 'Far', STEP_RANGE + 8);
    for (const p of [a, near, far]) p.drainEvents();
    const { x, y, z } = a.body;
    realm.emitNear(x, y, z, { t: 'sound', sound: 'stone', action: 'step', vol: 1 });
    realm.emitNear(x, y, z, { t: 'sound', sound: 'stone', action: 'break', vol: 1 });
    expect(heard(a).step).toBe(1);
    expect(heard(near).step).toBe(1);
    const farHeard = heard(far);
    expect(farHeard.step).toBeUndefined();
    // (the far one is within the old 48 blocks: a block breaking is still heard there)
    expect(farHeard.break).toBe(1);
  });

  it('a player is told of a few footsteps in a tick, and always of their own', () => {
    const realm = make();
    const a = realm.players[0];
    const b = person(realm, 'Bob', 3);
    a.drainEvents();
    b.drainEvents();
    const { x, y, z } = a.body;
    // A crowd: fifty steps by others at once, and a step of Bob's own.
    for (let i = 0; i < 50; i++) realm.emitNear(x - 5, y, z, { t: 'sound', sound: 'stone', action: 'step', vol: 1 });
    realm.emitNear(b.body.x, b.body.y, b.body.z, { t: 'sound', sound: 'stone', action: 'step', vol: 1 });
    // (Ada hears six of them; Bob's own step came last, so it is the one she is not told of)
    expect(heard(a).step).toBe(STEP_SOUNDS_PER_TICK);
    // (Bob: his share of the crowd's, and his own step on top)
    expect(heard(b).step).toBe(STEP_SOUNDS_PER_TICK + 1);
    // The next tick counts anew.
    realm.update(0.05, realm.players);
    a.drainEvents();
    realm.emitNear(x + 2, y, z, { t: 'sound', sound: 'stone', action: 'step', vol: 1 });
    expect(heard(a).step).toBe(1);
  });
});

describe('the soul lantern scan', () => {
  const seconds = (realm: Realm, s: number): void => {
    for (let i = 0; i < Math.round(s * 20); i++) realm.update(0.05, realm.players);
  };

  it('finds a lantern near a player, and one that was removed is gone after the next scan', () => {
    const realm = make();
    const a = realm.players[0];
    const lx = Math.floor(a.body.x) + 20;
    const ly = Math.floor(a.body.y) + 3;
    const lz = Math.floor(a.body.z) - 17;
    realm.world.setBlock(lx, ly, lz, B.SOUL_LANTERN);
    seconds(realm, 5);
    expect(realm.wardAt(lx + 0.5, ly + 0.5, lz + 0.5)).not.toBeNull();
    realm.world.setBlock(lx, ly, lz, B.AIR);
    seconds(realm, 5);
    expect(realm.wardAt(lx + 0.5, ly + 0.5, lz + 0.5)).toBeNull();
  });

  it('looks at a place once however many players stand there', () => {
    const count = (players: number): number => {
      const realm = make();
      for (let i = 1; i < players; i++) person(realm, `P${i}`, i % 3);
      let reads = 0;
      const get = realm.world.getBlock.bind(realm.world);
      realm.world.getBlock = (x: number, y: number, z: number) => {
        reads++;
        return get(x, y, z);
      };
      seconds(realm, 5);
      return reads;
    };
    // (the same ground is read for the physics and the mobs too, so this is only a bound: the scan alone would be thirty times more)
    const one = count(1);
    const many = count(30);
    expect(many).toBeLessThan(one * 3);
  });
});
