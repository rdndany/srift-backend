import { describe, expect, it } from 'vitest';
import {
  B,
  DropWorld,
  GameSession,
  HeadlessWorld,
  MAX_XP_ORBS,
  WorldGenerator,
  XP_ORB_LIFETIME,
  XP_ORB_VALUES,
  XpOrbWorld,
  makeStack,
  mulberry32,
  splitXp,
  toolId,
  xpOrbSize,
  type XpCollector,
} from './index';
import { settleOrbs } from './xpOrbs.testutil';

const SEED = 1337;
const FLOOR = 100;
const CX = 8;
const CZ = 8;

const floor = (x: number, y: number, z: number) => (y <= FLOOR ? B.STONE : B.AIR);

function player(x: number, y: number, z: number, alive = true): XpCollector & { got: number } {
  const p = { x, y, z, alive, got: 0, take: (v: number) => void (p.got += v) };
  return p;
}

function make() {
  const generator = new WorldGenerator(SEED);
  const world = new HeadlessWorld(generator);
  for (let x = CX - 20; x <= CX + 20; x++)
    for (let z = CZ - 20; z <= CZ + 20; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 14; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.STONE);
    }
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(5), mode: 'survival', classId: null });
  s.finishLoading();
  s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
  return { s, world };
}

describe('experience orbs', () => {
  it('are drawn at eleven sizes by what they are worth', () => {
    expect(XP_ORB_VALUES.length).toBe(11);
    expect([1, 2, 3, 6, 7, 16, 17, 36, 37, 72, 73, 148, 149, 306, 307, 616, 617, 1236, 1237, 2476, 2477, 9999].map(xpOrbSize)).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10,
    ]);
  });

  it('split an amount into orbs, the biggest first, and keep every point', () => {
    expect(splitXp(5)).toEqual([3, 1, 1]);
    expect(splitXp(7)).toEqual([7]);
    expect(splitXp(100)).toEqual([73, 17, 7, 3]);
    expect(splitXp(0)).toEqual([]);
    for (const n of [1, 2, 4, 9, 37, 120, 999, 5000, 123456]) expect(splitXp(n).reduce((a, b) => a + b, 0)).toBe(n);
  });

  it('are let out at a place, fall to the ground and lie still', () => {
    const w = new XpOrbWorld(floor, mulberry32(1));
    w.spawn(7, 3.5, FLOOR + 1.5, 3.5);
    expect(w.count).toBe(1);
    for (let i = 0; i < 100; i++) w.update(0.05, []);
    const o = w.orbs[0];
    expect(o.y).toBeGreaterThan(FLOOR + 1);
    expect(o.y).toBeLessThan(FLOOR + 1.5);
    expect(Math.hypot(o.vx, o.vz)).toBeLessThan(0.05);
  });

  it('drift toward a player within eight blocks and turn into experience on touch', () => {
    const w = new XpOrbWorld(floor, mulberry32(2));
    const p = player(3.5, FLOOR + 1, 3.5);
    w.spawn(10, 9.5, FLOOR + 1.2, 3.5);
    const start = Math.hypot(w.orbs[0].x - p.x, w.orbs[0].z - p.z);
    for (let i = 0; i < 12; i++) w.update(0.05, [p]);
    expect(Math.hypot(w.orbs[0].x - p.x, w.orbs[0].z - p.z)).toBeLessThan(start);
    for (let i = 0; i < 120; i++) w.update(0.05, [p]);
    expect(w.count).toBe(0);
    expect(p.got).toBe(10);
  });

  it('fly in through the air to a player rather than rolling over the ground', () => {
    const w = new XpOrbWorld(floor, mulberry32(9));
    const p = player(3.5, FLOOR + 1, 3.5);
    w.spawn(3, 10.5, FLOOR + 1.2, 3.5);
    for (let i = 0; i < 20; i++) w.update(0.05, []); // settle on the floor first
    const o = w.orbs[0];
    expect(o.y).toBeLessThan(FLOOR + 1.25);
    let aloft = 0;
    let steps = 0;
    while (w.count > 0 && steps++ < 400) {
      w.update(0.05, [p]);
      if (w.count > 0 && Math.hypot(o.x - p.x, o.z - p.z) < 5 && Math.hypot(o.x - p.x, o.z - p.z) > 1.5) {
        if (o.y > FLOOR + 1.6) aloft++;
        else aloft--;
      }
    }
    expect(w.count).toBe(0);
    expect(aloft).toBeGreaterThan(0);
  });

  it('catch a player who is running, without swinging past and circling', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const w = new XpOrbWorld(floor, mulberry32(seed));
      const p = player(3.5, FLOOR + 1, 3.5);
      w.spawn(37, 9.5, FLOOR + 1.2, 6.5);
      let t = 0;
      while (w.count > 0 && t < 4) {
        p.z += 4.3 * 0.05; // a sprint across its path
        w.update(0.05, [p]);
        t += 0.05;
      }
      expect(w.count).toBe(0);
    }
  });

  it('are left alone by a player too far away, or one who is dead', () => {
    const w = new XpOrbWorld(floor, mulberry32(3));
    w.spawn(3, 3.5, FLOOR + 1.2, 3.5);
    for (let i = 0; i < 100; i++) w.update(0.05, [player(20, FLOOR + 1, 3.5), player(3.5, FLOOR + 1, 4.5, false)]);
    expect(w.count).toBe(1);
  });

  it('go to the nearer of two players', () => {
    const w = new XpOrbWorld(floor, mulberry32(4));
    const a = player(0.5, FLOOR + 1, 3.5);
    const b = player(6.5, FLOOR + 1, 3.5);
    w.spawn(3, 5.5, FLOOR + 1.2, 3.5);
    for (let i = 0; i < 100; i++) w.update(0.05, [a, b]);
    expect(b.got).toBe(3);
    expect(a.got).toBe(0);
  });

  it('wait a little before they can be taken, and go after five minutes', () => {
    const w = new XpOrbWorld(floor, mulberry32(5));
    const p = player(3.5, FLOOR + 1, 3.5);
    w.spawn(1, 3.5, FLOOR + 1.2, 3.5);
    w.update(0.05, [p]);
    expect(p.got).toBe(0);
    const lone = new XpOrbWorld(floor, mulberry32(5));
    lone.spawn(1, 3.5, FLOOR + 1.2, 3.5);
    for (let t = 0; t < XP_ORB_LIFETIME + 1; t += 0.5) lone.update(0.5, []);
    expect(lone.count).toBe(0);
  });

  it('never pile up past the limit, and lose no experience doing so', () => {
    const w = new XpOrbWorld(floor, mulberry32(6));
    for (let i = 0; i < MAX_XP_ORBS + 40; i++) w.spawn(1, 3.5, FLOOR + 1.5, 3.5);
    expect(w.count).toBe(MAX_XP_ORBS);
    expect(w.orbs.reduce((a, o) => a + o.value, 0)).toBe(MAX_XP_ORBS + 40);
  });

  it('burn up in lava', () => {
    const w = new XpOrbWorld((x, y, z) => (y <= FLOOR ? B.STONE : y === FLOOR + 1 ? B.LAVA : B.AIR), mulberry32(7));
    w.spawn(3, 3.5, FLOOR + 1.5, 3.5);
    for (let i = 0; i < 40; i++) w.update(0.05, []);
    expect(w.count).toBe(0);
  });
});

describe('experience in a session', () => {
  it('comes out of a mob as orbs, is not taken at once and is the same amount when it is', () => {
    const { s } = make();
    const id = s.spawnMob('zombie', CX + 3.5, FLOOR + 1, CZ + 0.5);
    s.damageMob(id, 100);
    s.realm.update(0.05, [s]);
    expect(s.xpOrbs.count).toBeGreaterThan(0);
    expect(s.xp.total).toBe(0);
    settleOrbs(s);
    expect(s.xpOrbs.count).toBe(0);
    expect(s.xp.total).toBe(5);
  });

  it('a mined ore lets out orbs where it stood', () => {
    const { s, world } = make();
    world.setBlock(CX + 5, FLOOR + 1, CZ, B.DIAMOND_ORE);
    s.clearInventory();
    s.giveItem(toolId('pickaxe', 'iron'), 1);
    s.selectSlot(0);
    s.breakBlock(CX + 5, FLOOR + 1, CZ);
    expect(s.xpOrbs.count).toBeGreaterThan(0);
    expect(s.xpOrbs.orbs.every((o) => Math.abs(o.x - (CX + 5.5)) < 0.3 && Math.abs(o.z - (CZ + 0.5)) < 0.3)).toBe(true);
    expect(s.xp.total).toBe(0);
    settleOrbs(s);
    expect(s.xp.total).toBeGreaterThanOrEqual(3);
  });
});

describe('dropped items are not drawn to the player', () => {
  it('lie where they fell when the player stands a little way off, and are taken when walked onto', () => {
    const w = new DropWorld(floor, mulberry32(8));
    w.spawn(makeStack(B.DIRT, 3), 3.5, FLOOR + 1.1, 3.5, 0, 0, 0, 0);
    const taken: number[] = [];
    const near = { x: 5.4, y: FLOOR + 1, z: 3.5, canFit: () => true, collect: (s: { count: number }) => (taken.push(s.count), null), picked: 0 };
    for (let i = 0; i < 100; i++) w.updateMany(0.05, [near]);
    expect(taken).toEqual([]);
    expect(w.count).toBe(1);
    expect(Math.abs(w.drops[0].x - 3.5)).toBeLessThan(0.05);
    const on = { ...near, x: 3.5 };
    w.updateMany(0.05, [on]);
    expect(taken).toEqual([3]);
    expect(w.count).toBe(0);
  });
});
