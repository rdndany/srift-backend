import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { MobLike } from './clientSession';
import { mobTargetView, pickMob, rayBox } from './mobTargeting';

const mob = (id: number, x: number, z: number, extra: Partial<MobLike> = {}): MobLike => ({
  id,
  kind: 'zombie',
  body: { x, y: 64, z },
  yaw: 0,
  walkPhase: 0,
  speedNow: 0,
  hurtTime: 0,
  dead: false,
  deathTime: 0,
  burning: false,
  fuse: 0,
  fuseFraction: 0,
  size: 1,
  variant: 0,
  ...extra,
});

const eye = new THREE.Vector3(0, 65.6, 0);
const ahead = new THREE.Vector3(0, 0, -1);
const free = (): boolean => false;

describe('picking a creature with the crosshair', () => {
  it('finds a box the ray crosses, and misses one beside it', () => {
    const t = rayBox(eye, ahead, new THREE.Vector3(-0.3, 64, -10.3), new THREE.Vector3(0.3, 65.8, -9.7), 32);
    expect(t).toBeCloseTo(9.7, 1);
    expect(rayBox(eye, ahead, new THREE.Vector3(2, 64, -10.3), new THREE.Vector3(3, 65.8, -9.7), 32)).toBeNull();
  });

  it('takes the nearest one in the line, not the far one behind it', () => {
    const near = mob(1, 0, -5);
    const far = mob(2, 0, -12);
    expect(pickMob(eye, ahead, [far, near], 32, free)?.id).toBe(1);
  });

  it('skips a dead one and one out of range', () => {
    expect(pickMob(eye, ahead, [mob(1, 0, -5, { dead: true })], 32, free)).toBeNull();
    expect(pickMob(eye, ahead, [mob(1, 0, -40)], 32, free)).toBeNull();
  });

  it('skips one behind a wall', () => {
    expect(pickMob(eye, ahead, [mob(1, 0, -9)], 32, (d) => d > 4)).toBeNull();
    expect(pickMob(eye, ahead, [mob(1, 0, -9)], 32, (d) => d > 20)?.id).toBe(1);
  });
});

describe('what the frame shows', () => {
  it('shows full health for a creature the server has not said is hurt', () => {
    const v = mobTargetView(mob(1, 0, 0));
    expect(v.hp).toBe(v.max);
    expect(v.max).toBeGreaterThan(0);
    expect(v.level).toBeGreaterThanOrEqual(1);
    expect(v.aggro).toBe(false);
  });

  it('shows the health and the most it was sent, and clamps them', () => {
    const v = mobTargetView(mob(1, 0, 0, { health: 30, maxHealth: 100, elite: true }));
    expect(v).toMatchObject({ hp: 30, max: 100, elite: true, aggro: false });
    expect(mobTargetView(mob(1, 0, 0, { aggro: true })).aggro).toBe(true);
    expect(mobTargetView(mob(1, 0, 0, { health: -5, maxHealth: 100 })).hp).toBe(0);
  });
});
