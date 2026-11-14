import { describe, expect, it } from 'vitest';
import { BEHIND_DISTANCE, ChaseCamera, SHOULDER_SIDE, SHOULDER_UP, type Solid } from './chaseCamera';

const eye = { x: 10.5, y: 41.62, z: 10.5 };
const open: Solid = () => false;
const DT = 1 / 60;

/** A player facing -z: the right shoulder is +x, behind is +z. */
function settle(cam: ChaseCamera, solid: Solid, seconds = 2, at = eye, yaw = 0, pitch = 0) {
  let p = cam.update(0, at, yaw, pitch, solid);
  for (let i = 0; i < seconds / DT; i++) p = cam.update(DT, at, yaw, pitch, solid);
  return p;
}

describe('ChaseCamera', () => {
  it('sits over the right shoulder, behind the head, looking the way the player does', () => {
    const p = settle(new ChaseCamera(), open, 1, eye, 0.7, -0.2);
    const yaw = 0.7;
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    // Side of the head: along the view's right; how far behind: along -look.
    const off = { x: p.x - eye.x, y: p.y - eye.y, z: p.z - eye.z };
    expect(off.x * right.x + off.z * right.z).toBeCloseTo(SHOULDER_SIDE, 5);
    expect(p.yaw).toBeCloseTo(0.7, 8);
    expect(p.pitch).toBeCloseTo(-0.2, 8);
    expect(p.bodyHidden).toBe(false);
  });

  it('mouse 3: the other shoulder, eased across rather than jumped to', () => {
    const cam = new ChaseCamera();
    settle(cam, open, 1);
    cam.swapShoulder();
    const first = cam.update(DT, eye, 0, 0, open);
    expect(first.x).toBeGreaterThan(eye.x); // one frame later it is still mostly on the right
    expect(first.x).toBeLessThan(eye.x + SHOULDER_SIDE + 1e-9);
    const done = settle(cam, open, 1.5);
    expect(done.x).toBeCloseTo(eye.x - SHOULDER_SIDE, 3);
    cam.swapShoulder();
    expect(settle(cam, open, 1.5).x).toBeCloseTo(eye.x + SHOULDER_SIDE, 3);
  });

  it('comes in at once when something is in the way, and goes out slowly', () => {
    const cam = new ChaseCamera();
    let wall = true;
    const solid: Solid = (_x, _y, z) => wall && z >= 13;
    const near = settle(cam, solid, 1);
    expect(near.z).toBeLessThan(13);
    wall = false;
    const one = cam.update(DT, eye, 0, 0, solid);
    expect(one.z - near.z).toBeLessThan(0.3); // not a jump back out
    const far = settle(cam, solid, 3);
    expect(far.z).toBeCloseTo(eye.z + BEHIND_DISTANCE, 2);
  });

  it('a corner beside the line does not poke into the picture (the camera keeps off it by its width)', () => {
    // A wall along x >= 12 from z = 12 on; the camera line (x = 12.3 at the shoulder) runs beside / into it.
    const solid: Solid = (x, _y, z) => x >= 12 && z >= 12;
    const p = settle(new ChaseCamera(), solid);
    expect(solid(Math.floor(p.x - 0.2), Math.floor(p.y), Math.floor(p.z))).toBe(false);
    expect(solid(Math.floor(p.x + 0.2), Math.floor(p.y), Math.floor(p.z))).toBe(false);
  });

  it('boxed in on one side it goes over to the other shoulder, and comes back when that side is free', () => {
    const cam = new ChaseCamera();
    let wall = true;
    const solid: Solid = (x) => wall && x >= 11; // a wall right beside the right shoulder
    const left = settle(cam, solid, 2);
    expect(left.x).toBeLessThan(eye.x - 0.5); // on the left shoulder, in the open
    wall = false;
    expect(settle(cam, solid, 0.3).x).toBeLessThan(eye.x - 0.5); // not at once: it waits a moment
    expect(settle(cam, solid, 2).x).toBeGreaterThan(eye.x + 0.5);
  });

  it('a one-block tunnel: the camera stays inside it and the body is left out', () => {
    // A tunnel along z, one block wide and two high, around x = 10.5, y = 41..42.
    const solid: Solid = (x, y) => !(x === 10 && (y === 41 || y === 42));
    const at = { x: 10.5, y: 41.62, z: 10.5 };
    for (const yaw of [0, 0.3, Math.PI]) {
      const p = settle(new ChaseCamera(), solid, 2, at, yaw, 0);
      expect(solid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))).toBe(false);
      expect(Math.abs(p.x - 10.5)).toBeLessThan(0.5); // the shoulder step is given up: the camera is on the line of the tunnel
    }
    // Facing along the tunnel (yaw 0 faces -z), a dead end right behind: the camera is all but in the head, and the body is left out.
    const blocked: Solid = (x, y, z) => !(x === 10 && (y === 41 || y === 42)) || z === 11;
    const boxed = settle(new ChaseCamera(), blocked, 2, at, 0, 0);
    expect(Math.hypot(boxed.x - at.x, boxed.y - at.y, boxed.z - at.z)).toBeLessThan(1.5);
    expect(boxed.bodyHidden).toBe(true);
  });

  it('in a one-block tunnel with some room behind, the body would be over the crosshair, so it is left out; in a wide place it stays', () => {
    const tunnel: Solid = (x, y, z) => !(x === 10 && (y === 41 || y === 42)) || z >= 13;
    const at = { x: 10.5, y: 41.62, z: 10.5 };
    const p = settle(new ChaseCamera(), tunnel, 2, at, 0, 0);
    expect(Math.hypot(p.x - at.x, p.y - at.y, p.z - at.z)).toBeGreaterThan(1.6);
    expect(p.bodyHidden).toBe(true);
    // A corridor three wide, the same dead end: the camera takes a shoulder and the body is beside the crosshair, not over it.
    const wide: Solid = (x, y, z) => !(x >= 9 && x <= 11 && (y === 41 || y === 42)) || z >= 13;
    expect(settle(new ChaseCamera(), wide, 2, at, 0, 0).bodyHidden).toBe(false);
  });

  it('with a wall some way behind, the camera comes in and the body stays drawn; right against the wall the body is left out', () => {
    const some: Solid = (_x, _y, z) => z >= 13;
    expect(settle(new ChaseCamera(), some, 1).bodyHidden).toBe(false);
    const right: Solid = (_x, _y, z) => z >= 11;
    expect(settle(new ChaseCamera(), right, 1).bodyHidden).toBe(true);
  });

  it('a low ceiling and a downward look do not shrink the camera onto the head: it slides to a flatter line', () => {
    // A tunnel two high running along z, open for a long way behind the player (who faces +z, so behind is -z), looking a little down.
    const solid: Solid = (x, y) => !(x === 10 && (y === 41 || y === 42));
    const at = { x: 10.5, y: 41.62, z: 20.5 };
    const p = settle(new ChaseCamera(), solid, 3, at, Math.PI, -0.35);
    expect(Math.hypot(p.x - at.x, p.y - at.y, p.z - at.z)).toBeGreaterThan(4);
    expect(solid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))).toBe(false);
    expect(p.pitch).toBeCloseTo(-0.35, 8); // and it still looks where the player does
  });

  it('shows the body again with some margin (no flicker at the edge)', () => {
    const cam = new ChaseCamera();
    const box: Solid = (x, _y, z) => z >= 11 || x >= 11 || x <= 9; // walls all round: a pit
    expect(settle(cam, box, 1).bodyHidden).toBe(true);
    expect(settle(cam, open, 3).bodyHidden).toBe(false);
  });

  it('never ends inside a block, in a rough cave, whichever way the player turns and moves', () => {
    const hash = (x: number, y: number, z: number): number => {
      let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
      h = (h ^ (h >>> 13)) * 1274126177;
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    const solid: Solid = (x, y, z) => hash(x, y, z) < 0.3;
    let bad = 0;
    let total = 0;
    for (let trial = 0; trial < 40; trial++) {
      // A head in open air.
      let at = { x: 0.5, y: 0.5, z: 0.5 };
      for (let k = 0; k < 400; k++) {
        const c = { x: Math.floor(trial * 3.7) + (k % 20) + 0.5, y: 5.5 + (k % 7), z: Math.floor(k / 20) + 0.5 };
        if (!solid(Math.floor(c.x), Math.floor(c.y), Math.floor(c.z)) && !solid(Math.floor(c.x), Math.floor(c.y) - 1, Math.floor(c.z))) {
          at = c;
          break;
        }
      }
      const cam = new ChaseCamera();
      for (let i = 0; i < 90; i++) {
        const yaw = trial + i * 0.07;
        const pitch = Math.sin(i * 0.11) * 1.1;
        const p = cam.update(DT, at, yaw, pitch, solid);
        total++;
        if (solid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) bad++;
      }
    }
    expect(bad / total).toBeLessThan(0.02);
  });

  it('follows the height of the head smoothly: a step up does not jerk the picture', () => {
    const cam = new ChaseCamera();
    settle(cam, open, 1);
    const p = cam.update(DT, { ...eye, y: eye.y + 0.5 }, 0, 0, open);
    expect(p.y).toBeLessThan(eye.y + 0.5 + SHOULDER_UP - 0.2);
    expect(p.y).toBeGreaterThan(eye.y + SHOULDER_UP - 1e-6);
    const later = settle(cam, open, 1, { ...eye, y: eye.y + 0.5 });
    expect(later.y).toBeCloseTo(eye.y + 0.5 + SHOULDER_UP, 3);
  });

  it('drawing a bow brings the camera in', () => {
    const a = new ChaseCamera();
    const b = new ChaseCamera();
    settle(a, open, 1);
    let tight = settle(b, open, 1);
    for (let i = 0; i < 120; i++) tight = b.update(DT, eye, 0, 0, open, false, 1);
    const normal = a.update(DT, eye, 0, 0, open);
    expect(tight.z).toBeLessThan(normal.z - 1);
  });

  it('a rider keeps further back', () => {
    const foot = settle(new ChaseCamera(), open, 1);
    const cam = new ChaseCamera();
    let ride = cam.update(0, eye, 0, 0, open, true);
    for (let i = 0; i < 60; i++) ride = cam.update(DT, eye, 0, 0, open, true);
    expect(ride.z).toBeGreaterThan(foot.z + 1);
  });
});
