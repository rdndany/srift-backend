import { describe, expect, it } from 'vitest';
import {
  B,
  CAMERA_MAX_OFFSET,
  GameSession,
  HeadlessWorld,
  PLAYER_EYE,
  WorldGenerator,
  aimThroughCrosshair,
  lookVector,
  mulberry32,
  parseNetInput,
  parseSessionMessage,
  sanitizeCamera,
  type InputFrame,
} from './index';

const SEED = 1337;
const FLOOR = 100;
const CX = 8;
const CZ = 8;

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

/** A flat stone floor under open sky, with the player in the middle of it (the same as the mount tests). */
function make() {
  const generator = new WorldGenerator(SEED);
  const world = new HeadlessWorld(generator);
  for (let x = CX - 40; x <= CX + 40; x++)
    for (let z = CZ - 40; z <= CZ + 40; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 20; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.STONE);
    }
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(5), mode: 'survival', classId: null });
  s.finishLoading();
  s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
  s.drainEvents();
  return { s, world };
}

const eye = { x: CX + 0.5, y: FLOOR + 1 + PLAYER_EYE, z: CZ + 0.5 };
/** The camera of a player facing -z: over the right shoulder (+x), a little up, and behind (+z). */
const cam = { x: eye.x + 1.8, y: eye.y + 0.7, z: eye.z + 5.6 };

describe('aimThroughCrosshair', () => {
  it('with the camera on the eyes it is the look of the head', () => {
    const { world } = make();
    for (const [yaw, pitch] of [
      [0, 0],
      [1.3, -0.4],
      [-2, 0.7],
    ]) {
      const d = aimThroughCrosshair(world, null, eye, eye, yaw, pitch);
      const l = lookVector(yaw, pitch);
      expect(d.x).toBeCloseTo(l.x, 6);
      expect(d.y).toBeCloseTo(l.y, 6);
      expect(d.z).toBeCloseTo(l.z, 6);
    }
  });

  it('goes toward the block the crosshair is on, not along the head', () => {
    const { world } = make();
    world.setBlock(CX + 2, FLOOR + 1, CZ - 4, B.STONE);
    // The camera looks down a little, at that block (to the right of the head).
    const pitch = -0.187;
    const d = aimThroughCrosshair(world, null, eye, cam, 0, pitch);
    expect(d.x).toBeGreaterThan(0.2); // to the right: the head alone would look straight ahead
    // And from the eyes, along d, the block is what is struck first.
    let hit = false;
    for (let t = 0; t < 8 && !hit; t += 0.05) {
      const x = Math.floor(eye.x + d.x * t);
      const y = Math.floor(eye.y + d.y * t);
      const z = Math.floor(eye.z + d.z * t);
      if (world.getBlock(x, y, z) !== B.AIR) {
        expect([x, y, z]).toEqual([CX + 2, FLOOR + 1, CZ - 4]);
        hit = true;
      }
    }
    expect(hit).toBe(true);
  });

  it('on open ground far ahead it runs almost parallel to the camera (little parallax)', () => {
    const { world } = make();
    const d = aimThroughCrosshair(world, null, eye, cam, 0, 0.3); // up into the sky: nothing to hit
    const l = lookVector(0, 0.3);
    expect(d.x * l.x + d.y * l.y + d.z * l.z).toBeGreaterThan(0.99);
  });

  it('ignores what lies between the camera and the player (a pillar the camera peeks round)', () => {
    const { world } = make();
    // A pillar behind the player, on the camera's ray: it is not what the player aims at.
    for (let y = FLOOR + 1; y < FLOOR + 8; y++) world.setBlock(CX + 2, y, CZ + 3, B.STONE);
    const d = aimThroughCrosshair(world, null, eye, cam, 0, 0);
    expect(d.z).toBeLessThan(-0.9); // straight ahead, as with nothing there
  });

  it('a mob under the crosshair is what the aim goes to', () => {
    const { world } = make();
    const mob = { raycast: () => ({ dist: 8 }) };
    const near = aimThroughCrosshair(world, mob, eye, cam, 0, 0);
    const far = aimThroughCrosshair(world, null, eye, cam, 0, 0);
    // The mob is hit at 8 blocks from where the ray passes the eyes: the aim bends toward it, off the far, parallel one.
    expect(near.x).toBeGreaterThan(far.x + 0.05);
  });
});

describe('sanitizeCamera', () => {
  it('keeps a near camera, pulls a far one in, drops one that is not a number', () => {
    expect(sanitizeCamera(eye, cam)).toEqual(cam);
    const far = sanitizeCamera(eye, { x: eye.x + 500, y: eye.y, z: eye.z });
    expect(far).not.toBeNull();
    expect(Math.hypot(far!.x - eye.x, far!.y - eye.y, far!.z - eye.z)).toBeCloseTo(CAMERA_MAX_OFFSET, 6);
    expect(sanitizeCamera(eye, { x: NaN, y: 0, z: 0 })).toBeNull();
    expect(sanitizeCamera(eye, null)).toBeNull();
  });
});

describe('a player with a camera aims at what the crosshair shows', () => {
  it('hits the mob the crosshair is on (and not without the camera)', () => {
    const { s } = make();
    // 1.8 to the right and 3 ahead: the head, looking straight on, passes it by.
    const z = s.mobs.spawn('zombie', CX + 0.5 + 1.8, FLOOR + 1, CZ + 0.5 - 3);
    expect(z).toBeTruthy();
    const pitch = -0.152; // the camera looks down at its middle
    s.tick(idle({ pitch }));
    expect(s.aimedMob()).toBeNull();
    s.tick(idle({ pitch, cam: [cam.x, cam.y, cam.z] }));
    expect(s.aimedMob()?.mob).toBe(z);
  });

  it('the block that is mined and highlighted is the one the crosshair is on', () => {
    const { s, world } = make();
    world.setBlock(CX + 2, FLOOR + 1, CZ - 4, B.STONE);
    const pitch = -0.187;
    s.tick(idle({ pitch }));
    expect(s.target).toBeNull();
    s.tick(idle({ pitch, cam: [cam.x, cam.y, cam.z] }));
    expect(s.target && [s.target.x, s.target.y, s.target.z]).toEqual([CX + 2, FLOOR + 1, CZ - 4]);
  });

  it('first person again as soon as a frame has no camera', () => {
    const { s } = make();
    s.tick(idle({ cam: [cam.x, cam.y, cam.z] }));
    s.tick(idle());
    const l = s.look();
    expect(l.x).toBeCloseTo(0, 6);
    expect(l.z).toBeCloseTo(-1, 6);
  });
});

describe('the camera on the wire', () => {
  const raw = { t: 'frame', dt: 0.016, locked: true, yaw: 1, pitch: 0.2, forward: 1, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false };

  it('a frame carries the camera, and a bad one is dropped without losing the frame', () => {
    const ok = parseSessionMessage({ ...raw, cam: [1, 2, 3] });
    expect(ok && ok.t === 'frame' ? ok.cam : null).toEqual([1, 2, 3]);
    for (const bad of [[1, 2], [1, 2, NaN], 'x', [1, 2, 3, 4], [1e9, 0, 0]]) {
      const m = parseSessionMessage({ ...raw, cam: bad });
      expect(m && m.t === 'frame').toBe(true);
      expect(m && m.t === 'frame' ? m.cam : 'no').toBeUndefined();
    }
  });

  it('so does a networked input', () => {
    const base = { seq: 3, yaw: 1, pitch: 0.2, forward: 1, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false };
    expect(parseNetInput({ ...base, cam: [4, 5, 6] })?.cam).toEqual([4, 5, 6]);
    expect(parseNetInput({ ...base, cam: [4, 5] })?.cam).toBeUndefined();
    expect(parseNetInput(base)).not.toBeNull();
  });
});
