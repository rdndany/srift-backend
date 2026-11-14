import { describe, expect, it } from 'vitest';
import { BEHIND_DISTANCE, HEAD_TURN_LIMIT, SHOULDER_SIDE, SHOULDER_UP, THIRD_PERSON_DISTANCE, cameraPose, followBodyYaw, wrapAngle } from './selfView';

const eye = { x: 10.5, y: 41.62, z: 10.5 };
const open = (): boolean => false;
const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe('cameraPose', () => {
  it('first person stays on the eye', () => {
    const p = cameraPose(0, eye, 1.2, 0.3, () => true);
    expect(p).toEqual({ x: eye.x, y: eye.y, z: eye.z, yaw: 1.2, pitch: 0.3 });
  });

  it('first person on a mount is the eye itself: the camera and the aim start from the same point', () => {
    const p = cameraPose(0, eye, 1.2, 0.3, () => true, undefined, true);
    expect(p).toEqual({ x: eye.x, y: eye.y, z: eye.z, yaw: 1.2, pitch: 0.3 });
  });

  it('third person from behind sits behind and over the right shoulder of a player looking along -z', () => {
    const p = cameraPose(1, eye, 0, 0, open);
    expect(p.x).toBeCloseTo(eye.x + SHOULDER_SIDE); // right of a player facing -z = +x
    expect(p.y).toBeCloseTo(eye.y + SHOULDER_UP);
    expect(p.z).toBeCloseTo(eye.z + BEHIND_DISTANCE); // behind = +z
    // It looks the way the player does: the game works out what the crosshair is on (see `aimThroughCrosshair`).
    expect(p.yaw).toBeCloseTo(0);
    expect(p.pitch).toBeCloseTo(0);
  });

  it('looks along the player yaw and pitch, whichever way they look', () => {
    for (const yaw of [0, 1, 2.5, -1.7]) {
      for (const pitch of [-1, -0.3, 0, 0.6, 1.2]) {
        const p = cameraPose(1, eye, yaw, pitch, open);
        expect(p.yaw).toBeCloseTo(yaw, 8);
        expect(p.pitch).toBeCloseTo(pitch, 8);
      }
    }
  });

  it('keeps the distance in front of the player whichever way they look', () => {
    for (const yaw of [0, 1, 2.5, -1.7]) {
      for (const pitch of [-1, -0.3, 0, 0.6, 1.2]) {
        const p = cameraPose(2, eye, yaw, pitch, open);
        expect(dist(p, eye)).toBeCloseTo(THIRD_PERSON_DISTANCE, 5);
      }
    }
  });

  it('looking up puts the camera below and behind the head', () => {
    const p = cameraPose(1, eye, 0, 0.8, open);
    expect(p.y).toBeLessThan(eye.y + SHOULDER_UP);
    expect(p.z).toBeGreaterThan(eye.z);
  });

  it('the front view is on the other side and looks back at the player', () => {
    const p = cameraPose(2, eye, 0, 0.4, open);
    expect(p.z).toBeLessThan(eye.z); // in front of a player facing -z
    expect(p.y).toBeGreaterThan(eye.y); // looking up: the front camera is above
    expect(p.yaw).toBeCloseTo(Math.PI);
    expect(p.pitch).toBeCloseTo(-0.4);
    // And the camera really faces the head: the way it looks, from where it is, ends at the eye.
    const cp = Math.cos(p.pitch);
    const f = { x: -Math.sin(p.yaw) * cp, y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * cp };
    const back = { x: p.x + f.x * THIRD_PERSON_DISTANCE, y: p.y + f.y * THIRD_PERSON_DISTANCE, z: p.z + f.z * THIRD_PERSON_DISTANCE };
    expect(dist(back, eye)).toBeLessThan(1e-6);
  });

  it('is pulled in by a wall behind the player and never ends inside it', () => {
    // A wall of blocks at z >= 12 (the camera would be at z = 14.5).
    const solid = (_x: number, _y: number, z: number): boolean => z >= 12;
    const p = cameraPose(1, eye, 0, 0, solid);
    expect(p.z).toBeLessThan(12);
    expect(p.z).toBeGreaterThan(eye.z);
    expect(p.z).toBeLessThan(eye.z + BEHIND_DISTANCE);
    expect(solid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))).toBe(false);
  });

  it('collapses onto the head when boxed in', () => {
    const p = cameraPose(1, eye, 0, 0, () => true);
    expect(dist(p, eye)).toBeCloseTo(0, 5);
    expect(p.yaw).toBeCloseTo(0, 5);
  });

  it('keeps the shoulder step out of a wall at the player side (it goes over to the other shoulder)', () => {
    const solid = (x: number): boolean => x >= 11; // a wall right of the player (x = 10.5)
    const p = cameraPose(1, eye, 0, 0, solid);
    expect(p.x).toBeLessThan(11);
    expect(p.x).toBeLessThan(eye.x);
  });

  it('is not blocked by walls on the far side', () => {
    const solid = (_x: number, _y: number, z: number): boolean => z < 5;
    const p = cameraPose(1, eye, 0, 0, solid);
    expect(p.z).toBeCloseTo(eye.z + BEHIND_DISTANCE);
  });
});

describe('body turning', () => {
  it('wraps angles into -PI..PI', () => {
    expect(wrapAngle(0)).toBeCloseTo(0);
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(-Math.PI, 5);
    expect(wrapAngle(-Math.PI * 2.5)).toBeCloseTo(-Math.PI / 2);
    expect(wrapAngle(7)).toBeCloseTo(7 - Math.PI * 2);
  });

  it('standing still, a small head turn leaves the body where it is', () => {
    expect(followBodyYaw(0, 0.5, false, 0.016)).toBe(0);
    expect(followBodyYaw(0, -0.5, false, 0.016)).toBe(0);
  });

  it('standing still, a big head turn drags the body along', () => {
    let b = 0;
    let c = 0;
    for (let i = 0; i < 120; i++) {
      b = followBodyYaw(b, 2, false, 1 / 60);
      c = followBodyYaw(c, -2, false, 1 / 60);
    }
    expect(b).toBeCloseTo(2 - HEAD_TURN_LIMIT, 1);
    expect(c).toBeCloseTo(-2 + HEAD_TURN_LIMIT, 1);
  });

  it('the body eases round: one frame moves it only part of the way', () => {
    const b = followBodyYaw(0, 2, false, 1 / 60);
    expect(b).toBeGreaterThan(0);
    expect(b).toBeLessThan(2 - HEAD_TURN_LIMIT);
    const w = followBodyYaw(0, 1, true, 1 / 60);
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThan(1);
  });

  it('walking turns the body toward where the head looks', () => {
    let body = 0;
    for (let i = 0; i < 60; i++) body = followBodyYaw(body, 1.5, true, 1 / 60);
    expect(body).toBeCloseTo(1.5, 1);
  });

  it('takes the short way round the circle', () => {
    // Head at -3, body at 3: the short way is across +-PI, a difference of about 0.28.
    const b = followBodyYaw(3, -3, true, 0.016);
    expect(Math.abs(wrapAngle(-3 - b))).toBeLessThan(Math.abs(wrapAngle(-3 - 3)));
  });
});
