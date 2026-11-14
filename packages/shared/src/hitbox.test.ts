import { describe, expect, it } from 'vitest';
import { Mob, type MobKind } from './mobs';

/** A mob standing at the origin facing `yaw` (it faces (-sin yaw, -cos yaw)). */
const stand = (kind: MobKind, yaw: number, traits = {}): Mob => {
  const m = new Mob(1, kind, 0, 0, 0, () => 0.5, traits);
  m.yaw = yaw;
  return m;
};
const forward = (yaw: number): [number, number] => [-Math.sin(yaw), -Math.cos(yaw)];

describe('what a blow can land on', () => {
  it('a cow is hit on the head, however it faces (the head is half a block in front of the body)', () => {
    for (let i = 0; i < 8; i++) {
      const yaw = (i * Math.PI) / 4;
      const cow = stand('cow', yaw);
      const [fx, fz] = forward(yaw);
      // Aim at the middle of the head, 0.85 in front of the middle of the cow, from 2.5 blocks out in front of it.
      const hx = fx * 0.85;
      const hz = fz * 0.85;
      const ox = fx * 3.35;
      const oz = fz * 3.35;
      const dx = hx - ox;
      const dz = hz - oz;
      const len = Math.hypot(dx, 1.2 - 1.6, dz);
      expect(cow.hitDistance(ox, 1.6, oz, dx / len, (1.2 - 1.6) / len, dz / len, 5), `yaw ${yaw}`).not.toBeNull();
    }
  });

  it('the plain box of a cow does not reach its head (which is why it has boxes of its own)', () => {
    const cow = stand('cow', 0);
    const { min } = cow.aabb();
    expect(min[2]).toBeGreaterThan(-0.5); // the head's front face is at z = -0.96
  });

  it('the cow is long: a hit along its side lands near both ends', () => {
    const cow = stand('cow', 0);
    // Shoot from the side (+x), at the tail end and at the shoulder.
    expect(cow.hitDistance(3, 1, 0.55, -1, 0, 0, 5)).not.toBeNull();
    expect(cow.hitDistance(3, 1, -0.55, -1, 0, 0, 5)).not.toBeNull();
    // ... but not far past either end.
    expect(cow.hitDistance(3, 1, 1.2, -1, 0, 0, 5)).toBeNull();
    expect(cow.hitDistance(3, 1, -1.3, -1, 0, 0, 5)).toBeNull();
  });

  it('the allowance (margin) lets a blow that is a little off still land, and only a little', () => {
    const pig = stand('pig', 0);
    expect(pig.hitDistance(3, 0.5, 0.7, -1, 0, 0, 5)).toBeNull();
    expect(pig.hitDistance(3, 0.5, 0.7, -1, 0, 0, 5, 0.15)).not.toBeNull();
    expect(pig.hitDistance(3, 0.5, 1.0, -1, 0, 0, 5, 0.15)).toBeNull();
  });

  it('a mob that is running is hit a little ahead of the picture of it, a still one is not', () => {
    const still = stand('pig', 0);
    const runner = stand('pig', 0);
    runner.body.vz = 4;
    expect(runner.hitDistance(0.62, 0.5, 3, 0, 0, -1, 5, 0.15, 0.12)).not.toBeNull(); // 0.62 > 0.32 + 0.15 but < 0.32 + 0.15 + 0.48
    expect(still.hitDistance(0.62, 0.5, 3, 0, 0, -1, 5, 0.15, 0.12)).toBeNull();
  });

  it('a baby is hit where it is drawn: half the size', () => {
    const calf = stand('cow', 0, { baby: 100 });
    expect(calf.hitDistance(3, 0.5, 0, -1, 0, 0, 5)).not.toBeNull();
    expect(calf.hitDistance(3, 1.2, 0, -1, 0, 0, 5)).toBeNull();
  });

  it('kinds without their own boxes are hit as the box of their width and height', () => {
    const zombie = stand('zombie', 1);
    expect(zombie.hitDistance(3, 1.8 - 0.05, 0, -1, 0, 0, 5)).not.toBeNull();
    expect(zombie.hitDistance(3, 2.2, 0, -1, 0, 0, 5)).toBeNull();
  });

  it('a training dummy is hit on its crossbar and hands', () => {
    const dummy = stand('dummy', 0);
    expect(dummy.hitDistance(3, 1.25, 0, -1, 0, 0, 5)).not.toBeNull();
    expect(dummy.hitDistance(0, 1.3, 3, 0, 0, -1, 5)).not.toBeNull();
  });
});
