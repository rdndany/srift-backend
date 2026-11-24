import { describe, expect, it } from 'vitest';
import { ADVENTURE_SEED, GameSession, HUB_HALF, HeadlessWorld, SAFE_BUFFER, WorldGenerator, makeGenerator, mulberry32, type AdventureWorldGenerator, type InputFrame } from './index';

const idle = (): InputFrame => ({ t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false });

const generator = makeGenerator(ADVENTURE_SEED, 'adventure') as AdventureWorldGenerator;

function make(spawning: boolean) {
  const world = new HeadlessWorld(generator);
  const s = new GameSession({ seed: ADVENTURE_SEED, world, generator, naturalSpawning: spawning, rand: mulberry32(11) });
  s.finishLoading();
  // A new character wakes in the wilds; these tests are about the village, so start on its Landing.
  const land = generator.landingFor(0);
  s.teleport(land.x, land.y, land.z, 0, 0);
  return s;
}

const hostiles = (s: GameSession) => s.realm.mobs.mobs.filter((m) => m.def.hostile && !m.dead);

describe('the village is safe from monsters', () => {
  it('knows its edge, and the ground around it where nothing is born', () => {
    expect(generator.safeFromMonsters(0, 0)).toBe(true);
    expect(generator.safeFromMonsters(HUB_HALF - 1, -HUB_HALF)).toBe(true);
    expect(generator.safeFromMonsters(HUB_HALF, 0)).toBe(false);
    expect(generator.safeFromMonsters(HUB_HALF + 5, 0, SAFE_BUFFER)).toBe(true);
    expect(generator.safeFromMonsters(HUB_HALF + SAFE_BUFFER, 0, SAFE_BUFFER)).toBe(false);
    expect(generator.safeFromMonsters(0, 0, 0)).toBe(true);
    // An ordinary world has no such place.
    expect(new WorldGenerator(1).safeFromMonsters(0, 0, 100)).toBe(false);
  });

  it('sends away a monster that walks in, and leaves the ones outside and the animals alone', () => {
    const s = make(false);
    const mobs = s.realm.mobs;
    const gy = s.world.surfaceY(0, 0) + 1;
    const inside = mobs.spawn('zombie', 5.5, gy, 5.5);
    const sheep = mobs.spawn('sheep', 8.5, gy, 8.5);
    const outsideX = HUB_HALF + 3.5;
    const outside = mobs.spawn('zombie', outsideX, s.world.surfaceY(outsideX, 0) + 1, 0.5);
    for (let i = 0; i < 10; i++) s.tick(idle());
    expect(mobs.mobs.includes(inside)).toBe(false);
    expect(mobs.mobs.includes(sheep)).toBe(true);
    expect(mobs.mobs.includes(outside)).toBe(true);
  });

  it('does not let a monster in after somebody standing at the gate', () => {
    const s = make(false);
    const mobs = s.realm.mobs;
    // The player stands in the village just inside its edge, and a zombie comes at them from the wilderness.
    const px = HUB_HALF - 3;
    s.teleport(px + 0.5, s.world.surfaceY(px, 0) + 1, 0.5, Math.PI / 2, 0);
    const zx = HUB_HALF + 8.5;
    const z = mobs.spawn('zombie', zx, s.world.surfaceY(zx, 0) + 1, 0.5);
    s.realm.time = 0.75;
    let deepest = zx;
    for (let i = 0; i < 400 && mobs.mobs.includes(z); i++) {
      s.tick(idle());
      deepest = Math.min(deepest, z.body.x);
    }
    expect(deepest).toBeGreaterThanOrEqual(HUB_HALF - 1);
  });

  it('is not the place where night monsters are born', () => {
    const s = make(true);
    // Stand just outside the buffer-free ground, at night, and let the world spawn for two minutes.
    const px = HUB_HALF + SAFE_BUFFER + 12;
    s.teleport(px + 0.5, s.world.surfaceY(px, 0) + 1, 0.5, 0, 0);
    s.realm.time = 0.75;
    let seen = 0;
    for (let i = 0; i < 20 * 120; i++) {
      s.realm.time = 0.75;
      s.tick(idle());
      if (i % 20 !== 0) continue;
      for (const m of hostiles(s)) {
        seen++;
        expect(generator.safeFromMonsters(m.body.x, m.body.z), `${m.kind} in the village at ${m.body.x.toFixed(1)}, ${m.body.z.toFixed(1)}`).toBe(false);
      }
    }
    expect(seen, 'monsters were around to be checked').toBeGreaterThan(0);
  }, 120000);

  it('spawns nothing within the buffer of the village, however long it waits', () => {
    const s = make(true);
    const px = HUB_HALF + 6;
    s.teleport(px + 0.5, s.world.surfaceY(px, 0) + 1, 0.5, 0, 0);
    const born = new Set<unknown>();
    const where: { x: number; z: number }[] = [];
    for (let i = 0; i < 20 * 120; i++) {
      s.realm.time = 0.75;
      s.tick(idle());
      for (const m of hostiles(s)) {
        if (born.has(m)) continue;
        born.add(m);
        where.push({ x: m.body.x, z: m.body.z });
      }
    }
    // Where they were first seen is where they were born (give or take a tick of walking).
    expect(born.size, 'the night produced monsters at all').toBeGreaterThan(0);
    const near = where.filter((w) => generator.safeFromMonsters(w.x, w.z, SAFE_BUFFER - 3));
    expect(near).toEqual([]);
  }, 120000);
});
