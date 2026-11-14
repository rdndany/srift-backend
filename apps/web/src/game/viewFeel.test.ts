import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { THIRD_PERSON_FOV_TRIM } from './selfView';
import { ViewFeel, type FeelFrame } from './viewFeel';

const still = (over: Partial<FeelFrame> = {}): FeelFrame => ({
  dt: 1 / 60,
  ready: true,
  firstPerson: true,
  body: { onGround: true, vx: 0, vy: 0, vz: 0 },
  yaw: 0,
  bowDraw: 0,
  rush: null,
  slam: 0,
  ...over,
});

/** A camera standing where the player looks from, as the frame leaves it before the feel is laid on. */
const placed = (camera: THREE.PerspectiveCamera): THREE.PerspectiveCamera => {
  camera.position.set(0, 10, 0);
  camera.rotation.set(0, 0, 0);
  return camera;
};

/** One frame: the camera is placed, then jolted and carried. */
const frame = (feel: ViewFeel, camera: THREE.PerspectiveCamera, f: FeelFrame): { wind: number; lateral: number } => {
  feel.fade(f.dt);
  feel.jolt(placed(camera), f);
  return feel.carry(camera, f);
};

describe('the feel of the view', () => {
  it('leaves a camera alone when nothing happens', () => {
    const feel = new ViewFeel();
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 600);
    for (let i = 0; i < 60; i++) expect(frame(feel, camera, still())).toEqual({ wind: 0, lateral: 0 });
    expect(camera.position.toArray()).toEqual([0, 10, 0]);
    expect([camera.rotation.x, camera.rotation.y, camera.rotation.z]).toEqual([0, 0, 0]);
    expect(camera.fov).toBe(75);
  });

  it('shakes when the ground is hit, and stops again', () => {
    const feel = new ViewFeel();
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 600);
    feel.impact(5); // (never more than all the way)
    let moved = 0;
    for (let i = 0; i < 20; i++) {
      frame(feel, camera, still());
      moved = Math.max(moved, Math.abs(camera.rotation.x) + Math.abs(camera.rotation.y) + Math.abs(camera.rotation.z));
    }
    expect(moved).toBeGreaterThan(0.005);
    expect(moved).toBeLessThan(0.15);
    for (let i = 0; i < 60; i++) frame(feel, camera, still());
    expect([camera.rotation.x, camera.rotation.y, camera.rotation.z]).toEqual([0, 0, 0]);
    expect(camera.position.y).toBe(10);
  });

  it('holds the hand for a moment when a blow lands, longer for a critical one', () => {
    const feel = new ViewFeel();
    feel.blow(false);
    expect(feel.hitStop).toBeCloseTo(0.045);
    feel.blow(true);
    expect(feel.hitStop).toBeCloseTo(0.085);
    feel.fade(0.05);
    expect(feel.hitStop).toBeCloseTo(0.035);
    feel.fade(0.05);
    expect(feel.hitStop).toBe(0);
  });

  it('dips on a hard landing, more from the eyes than from behind, and not on a soft one', () => {
    const dipOf = (fallSpeed: number, firstPerson: boolean): number => {
      const feel = new ViewFeel();
      const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 600);
      frame(feel, camera, still({ firstPerson, body: { onGround: false, vx: 0, vy: -fallSpeed, vz: 0 } }));
      frame(feel, camera, still({ firstPerson }));
      return 10 - camera.position.y;
    };
    expect(dipOf(21, true)).toBeGreaterThan(0.2);
    expect(dipOf(21, false)).toBeGreaterThan(0.05);
    expect(dipOf(21, false)).toBeLessThan(dipOf(21, true));
    expect(dipOf(6, true)).toBe(0);
  });

  it('widens for a charge and narrows for a drawn bow', () => {
    const feel = new ViewFeel();
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 600);
    let dash = { wind: 0, lateral: 0 };
    for (let i = 0; i < 90; i++) dash = frame(feel, camera, still({ rush: { yaw: 0 } }));
    expect(camera.fov).toBeGreaterThan(75 + 15);
    expect(dash.wind).toBe(0.85);
    const bow = new ViewFeel();
    for (let i = 0; i < 10; i++) frame(bow, camera, still({ bowDraw: 1 }));
    expect(camera.fov).toBeCloseTo(66);
  });

  it('leans into an Evasive Roll, toward the side the player looks from it', () => {
    const feel = new ViewFeel();
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 600);
    let dash = { wind: 0, lateral: 0 };
    for (let i = 0; i < 30; i++) dash = frame(feel, camera, still({ yaw: Math.PI / 2, rush: { yaw: 0, roll: true } }));
    expect(dash.wind).toBe(1);
    expect(dash.lateral).toBeCloseTo(1);
    expect(camera.rotation.z).toBeLessThan(-0.1);
    expect(camera.position.y).toBeLessThan(9.85);
  });

  it('sees less from behind, and a little more when running', () => {
    const feel = new ViewFeel();
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 600);
    for (let i = 0; i < 10; i++) frame(feel, camera, still({ firstPerson: false }));
    expect(camera.fov).toBeCloseTo(75 - THIRD_PERSON_FOV_TRIM);
    for (let i = 0; i < 300; i++) frame(feel, camera, still({ firstPerson: false, body: { onGround: true, vx: 8, vy: 0, vz: 0 } }));
    expect(camera.fov).toBeCloseTo(75 - THIRD_PERSON_FOV_TRIM + 5, 1);
  });
});
