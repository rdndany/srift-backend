import { describe, expect, it } from 'vitest';
import { B, GameSession, HeadlessWorld, WorldGenerator, mulberry32, type InputFrame } from './index';

const FLOOR = 100;

const frame = (dt: number): InputFrame => ({
  t: 'frame',
  dt,
  locked: true,
  yaw: 0,
  pitch: 0,
  forward: 1,
  strafe: 0,
  jump: false,
  sprint: false,
  sneak: false,
  left: false,
  right: false,
});

describe('viewPos: the body as drawn, between physics steps', () => {
  it('moves in step with the clock, while the body itself moves in jumps', () => {
    const generator = new WorldGenerator(1337);
    const world = new HeadlessWorld(generator);
    for (let x = -40; x <= 56; x++)
      for (let z = -60; z <= 40; z++) {
        for (let y = FLOOR + 1; y < FLOOR + 14; y++) world.setBlock(x, y, z, B.AIR);
        world.setBlock(x, FLOOR, z, B.STONE);
      }
    const s = new GameSession({ seed: 1337, world, generator, naturalSpawning: false, rand: mulberry32(7), classId: null });
    s.finishLoading();
    s.teleport(8.5, FLOOR + 1, 30.5, 0, 0);

    // Frame lengths of a screen that is not quite 60 Hz, with an occasional long one.
    const dts = [0.0166, 0.0171, 0.0158, 0.0183, 0.0149, 0.0167, 0.0166, 0.0251, 0.0166, 0.0142, 0.0188, 0.0166];
    for (let i = 0; i < 40; i++) s.advance(frame(dts[i % dts.length]));

    const drawn: number[] = [];
    const body: number[] = [];
    const speeds: number[] = [];
    let last = s.viewPos().z;
    let lastBody = s.body.z;
    for (let i = 0; i < 120; i++) {
      const dt = dts[i % dts.length];
      s.advance(frame(dt));
      const v = s.viewPos();
      drawn.push(Math.abs(v.z - last) / dt);
      body.push(Math.abs(s.body.z - lastBody) / dt);
      speeds.push(Math.abs(v.z - last));
      last = v.z;
      lastBody = s.body.z;
    }
    const spread = (a: number[]) => {
      const m = a.reduce((x, y) => x + y, 0) / a.length;
      return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / a.length) / m;
    };
    expect(spread(drawn)).toBeLessThan(0.02);
    expect(spread(body)).toBeGreaterThan(0.2);
    // It never runs ahead of the body, and never more than a step behind.
    // (Walking is about 4.3 blocks a second: a step is 0.072 of a block.)
    expect(s.viewPos().z - s.body.z).toBeGreaterThanOrEqual(-1e-9);
    expect(s.viewPos().z - s.body.z).toBeLessThan(0.08);
  });

  it('snaps to the body after a teleport', () => {
    const generator = new WorldGenerator(1337);
    const s = new GameSession({ seed: 1337, world: new HeadlessWorld(generator), generator, naturalSpawning: false, rand: mulberry32(7), classId: null });
    s.finishLoading();
    s.teleport(8.5, FLOOR + 1, 8.5, 0, 0);
    s.advance(frame(0.016));
    s.teleport(200.5, FLOOR + 1, 200.5, 0, 0);
    expect(Math.hypot(s.viewPos().x - 200.5, s.viewPos().z - 200.5)).toBeLessThan(0.5);
  });
});
