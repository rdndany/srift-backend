import { B, IS_LIQUID, IS_PARTIAL, IS_SOLID, ladderInfo } from './blocks';
import { collisionBoxes, isTallShape, seatDrop, seatedBox } from './shapes';
import { FLUID_KIND, FLUID_WATER, isLavaId } from './fluids';

export interface BlockReader {
  getBlock(x: number, y: number, z: number): number;
}

export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE = 1.62;

const EPS = 1e-5;

export interface Body {
  /** Feet position (bottom centre of the AABB). */
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  onGround: boolean;
  inWater: boolean;
  eyeInWater: boolean;
  /** Feet are in lava (which also counts as inWater for swimming). */
  inLava?: boolean;
  /** Stuck in a cobweb: slow, and falling does not build up damage. */
  inWeb?: boolean;
  /** On a ladder: climbs with forward or jump, and does not build up fall damage. */
  onLadder?: boolean;
  eyeInLava?: boolean;
  /** Collision box size; defaults to the player's. Lets mobs reuse the same physics. */
  width?: number;
  height?: number;
}

/** Something solid that bodies cannot walk through (a monster, a person): an upright cylinder, x, y, z at its feet. */
export interface Solid {
  x: number;
  y: number;
  z: number;
  /** Radius. */
  r: number;
  /** Height. */
  h: number;
}

export interface MoveInput {
  /** -1..1 */
  forward: number;
  /** -1..1 (right positive) */
  strafe: number;
  jump: boolean;
  sprint: boolean;
  sneak: boolean;
  fly: boolean;
  flyDown: boolean;
  yaw: number;
  /** Overrides the walking speed (blocks/s); used by mobs. */
  speed?: number;
  /** Multiplies whatever the speed is (a class that runs faster, a mob that is slowed). */
  speedMul?: number;
  /** Overrides the jump velocity; used by mobs. */
  jumpVelocity?: number;
  /** Overrides how quickly horizontal velocity follows the target (0 = keep momentum, e.g. knockback). */
  accel?: number;
  /** Pass through blocks (spectators). */
  noclip?: boolean;
  /** Overrides how high a step the body walks up without jumping (a mount walks up a whole block). */
  stepHeight?: number;
  /** Characters in the way: the body is pushed out of each of them (never into a wall), so nobody walks through anybody. */
  solids?: readonly Solid[];
}

export function createBody(x: number, y: number, z: number): Body {
  return { x, y, z, vx: 0, vy: 0, vz: 0, onGround: false, inWater: false, eyeInWater: false };
}

/**
 * Does a body whose feet are at (x, y, z) overlap anything solid? `fullOnly` ignores blocks that fill
 * only part of their cell (slabs, stairs, fences...), so a full-block hit can be told apart.
 */
export function collides(
  world: BlockReader,
  x: number,
  y: number,
  z: number,
  width = PLAYER_WIDTH,
  height = PLAYER_HEIGHT,
  fullOnly = false,
): boolean {
  const HW = width / 2;
  const x0 = Math.floor(x - HW + EPS);
  const x1 = Math.floor(x + HW - EPS);
  const y0 = Math.floor(y + EPS);
  const y1 = Math.floor(y + height - EPS);
  const z0 = Math.floor(z - HW + EPS);
  const z1 = Math.floor(z + HW - EPS);
  // Fences stand 1.5 blocks tall, so the layer under the feet can matter too.
  const yStart = fullOnly ? y0 : y0 - 1;
  for (let by = yStart; by <= y1; by++) {
    for (let bz = z0; bz <= z1; bz++) {
      for (let bx = x0; bx <= x1; bx++) {
        const id = world.getBlock(bx, by, bz);
        const hits = (ox: number, oy: number, oz: number, q: readonly number[]): boolean =>
          ox + q[0] < x + HW - EPS &&
          ox + q[3] > x - HW + EPS &&
          oy + q[1] < y + height - EPS &&
          oy + q[4] > y + EPS &&
          oz + q[2] < z + HW - EPS &&
          oz + q[5] > z - HW + EPS;
        // A cube standing on a short block hangs down into this cell. Test it even when this cell is air.
        const above = world.getBlock(bx, by + 1, bz);
        const aboveDrop = seatDrop(above, (dy) => world.getBlock(bx, by + 1 - dy, bz));
        // A lowered cube is not a full cell: its top sits partway up, so a full-cell snap would throw the body up.
        if (aboveDrop > 0 && !fullOnly && hits(bx, by + 1, bz, seatedBox(aboveDrop))) return true;
        if (!IS_SOLID[id]) continue;
        if (!IS_PARTIAL[id]) {
          const drop = seatDrop(id, (dy) => world.getBlock(bx, by - dy, bz));
          if (drop > 0) {
            if (!fullOnly && hits(bx, by, bz, seatedBox(drop))) return true;
            continue;
          }
          if (by >= y0) return true;
          continue;
        }
        if (fullOnly) continue;
        if (by < y0 && !isTallShape(id)) continue;
        const boxes = collisionBoxes(
          id,
          (dx, dz) => world.getBlock(bx + dx, by, bz + dz),
          (dx, dy, dz) => world.getBlock(bx + dx, by + dy, bz + dz),
        );
        for (const q of boxes) {
          if (hits(bx, by, bz, q)) return true;
        }
      }
    }
  }
  return false;
}

/** Does the player's AABB overlap the given block cell? Used to prevent placing blocks inside oneself. */
export function bodyOverlapsBlock(b: Body, bx: number, by: number, bz: number): boolean {
  const HW = (b.width ?? PLAYER_WIDTH) / 2;
  const H = b.height ?? PLAYER_HEIGHT;
  return (
    b.x + HW > bx &&
    b.x - HW < bx + 1 &&
    b.y + H > by &&
    b.y < by + 1 &&
    b.z + HW > bz &&
    b.z - HW < bz + 1
  );
}

type Axis = 'x' | 'y' | 'z';

/** Binary search along one axis for the farthest point before a hit: (from → from + delta). Returns the fraction. */
function furthestFree(free: (t: number) => boolean): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (free(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** The highest step a walking body climbs without jumping: stairs, slabs, beds, closed trapdoors. */
const STEP_HEIGHT = 0.6;

function moveAxis(world: BlockReader, b: Body, axis: Axis, delta: number, sneakGuard: boolean, grounded = false, stepHeight = STEP_HEIGHT): void {
  if (delta === 0) return;
  const HW = (b.width ?? PLAYER_WIDTH) / 2;
  const H = b.height ?? PLAYER_HEIGHT;
  const hit = (x: number, y: number, z: number) => collides(world, x, y, z, HW * 2, H);
  const hitFull = (x: number, y: number, z: number) => collides(world, x, y, z, HW * 2, H, true);
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / 0.25));
  const d = delta / steps;
  for (let i = 0; i < steps; i++) {
    const px = b.x;
    const py = b.y;
    const pz = b.z;
    if (axis === 'x') b.x += d;
    else if (axis === 'y') b.y += d;
    else b.z += d;

    if (!hit(b.x, b.y, b.z)) {
      if (sneakGuard && axis !== 'y' && !hit(b.x, b.y - 0.6, b.z)) {
        b.x = px;
        b.z = pz;
        if (axis === 'x') b.vx = 0;
        else b.vz = 0;
        return;
      }
      continue;
    }

    // Walking into something low (a slab, a stair, a bed): step up onto it, if there is room above.
    if (axis !== 'y' && grounded && !hit(b.x, py + stepHeight, b.z)) {
      b.y = py + stepHeight * (1 - furthestFree((t) => !hit(b.x, py + stepHeight * (1 - t), b.z)));
      b.onGround = true;
      continue;
    }

    const full = hitFull(b.x, b.y, b.z);
    // Snap flush against the block face that was hit.
    if (axis === 'x') {
      if (full) b.x = d > 0 ? Math.floor(b.x + HW - EPS) - HW : Math.floor(b.x - HW + EPS) + 1 + HW;
      if (!full || hit(b.x, b.y, b.z)) b.x = px + d * furthestFree((t) => !hit(px + d * t, b.y, b.z));
      b.vx = 0;
    } else if (axis === 'z') {
      if (full) b.z = d > 0 ? Math.floor(b.z + HW - EPS) - HW : Math.floor(b.z - HW + EPS) + 1 + HW;
      if (!full || hit(b.x, b.y, b.z)) b.z = pz + d * furthestFree((t) => !hit(b.x, b.y, pz + d * t));
      b.vz = 0;
    } else {
      if (full) b.y = d > 0 ? Math.floor(b.y + H - EPS) - H : Math.floor(b.y + EPS) + 1;
      if (!full || hit(b.x, b.y, b.z)) b.y = py + d * furthestFree((t) => !hit(b.x, py + d * t, b.z));
      if (d < 0) b.onGround = true;
      b.vy = 0;
    }
    return;
  }
}

const WALK = 4.3;
const SPRINT = 5.9;
const SNEAK = 1.8;
const FLY = 11;
const GRAVITY = 28;
const JUMP_VELOCITY = 8.6;
const TERMINAL = 55;
const CLIMB = 3;
const SLIDE = 3;

/** Advance the player body by dt seconds. Fixed-timestep friendly. */
export function stepPlayer(world: BlockReader, b: Body, input: MoveInput, dt: number): void {
  const feetBlock = world.getBlock(Math.floor(b.x), Math.floor(b.y + 0.4), Math.floor(b.z));
  // Lava is checked at the feet and the hips, so bobbing at its surface still counts as being in it.
  const hipsBlock = world.getBlock(Math.floor(b.x), Math.floor(b.y + 0.1), Math.floor(b.z));
  const headBlock = world.getBlock(Math.floor(b.x), Math.floor(b.y + 0.9), Math.floor(b.z));
  b.inLava = isLavaId(feetBlock) || isLavaId(hipsBlock) || isLavaId(headBlock);
  b.inWeb = feetBlock === B.COBWEB || hipsBlock === B.COBWEB || headBlock === B.COBWEB;
  b.inWater = IS_LIQUID[feetBlock] === 1 || b.inLava;
  // Only the cell the feet are in counts, so climbing ends as the feet reach the top of the ladder.
  const ladderY = Math.floor(b.y + 0.05);
  b.onLadder = ladderInfo(world.getBlock(Math.floor(b.x), ladderY, Math.floor(b.z))) !== null;
  const eye = b.height === undefined ? PLAYER_EYE : b.height * 0.9;
  const eyeBlock = world.getBlock(Math.floor(b.x), Math.floor(b.y + eye), Math.floor(b.z));
  b.eyeInWater = IS_LIQUID[eyeBlock] === 1;
  b.eyeInLava = isLavaId(eyeBlock);

  const speed = (input.speed ?? (input.sneak ? SNEAK : input.sprint ? SPRINT : WALK)) * (input.speedMul ?? 1);
  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);
  // yaw 0 faces -Z; forward = (-sin, -cos), right = (cos, -sin)
  let wx = -sin * input.forward + cos * input.strafe;
  let wz = -cos * input.forward - sin * input.strafe;
  const len = Math.hypot(wx, wz);
  if (len > 1) {
    wx /= len;
    wz /= len;
  }

  const slow = b.inWeb ? 0.2 : 1;
  let targetX = wx * speed * slow;
  let targetZ = wz * speed * slow;
  let accel = input.accel ?? (b.onGround ? 14 : 3.5);

  if (input.fly) {
    targetX *= 2.2;
    targetZ *= 2.2;
    accel = 8;
    const targetY = (input.jump ? FLY : 0) + (input.flyDown ? -FLY : 0);
    b.vy += (targetY - b.vy) * Math.min(1, 10 * dt);
  } else if (b.onLadder && !b.inWater) {
    // Hold forward (or jump) to climb, sneak to hang on, otherwise slide down slowly.
    targetX *= 0.5;
    targetZ *= 0.5;
    if (input.jump || input.forward > 0) {
      b.vy = CLIMB;
      // In the top cell of the ladder, vault out over the edge instead of hovering at it.
      const topCell = ladderInfo(world.getBlock(Math.floor(b.x), ladderY + 1, Math.floor(b.z))) === null;
      if (topCell && b.y + 0.05 - ladderY > 0.5) b.vy = CLIMB + 2.5;
    }
    else if (input.sneak) b.vy = 0;
    else b.vy = Math.max(-SLIDE, b.vy - GRAVITY * dt);
  } else if (b.inWater) {
    // Lava is thick: slower to wade through and to climb out of.
    const thick = b.inLava === true;
    targetX *= thick ? 0.25 : 0.55;
    targetZ *= thick ? 0.25 : 0.55;
    accel = thick ? 4 : 6;
    b.vy -= (thick ? 5 : 6) * dt;
    if (input.jump) b.vy += (thick ? 14 : 20) * dt;
    b.vy = Math.max(thick ? -1.6 : -3, Math.min(b.vy, thick ? 2.2 : 3.4));
    // Climbing out: pressed against a bank a block above the surface, with room on top, a swimmer who
    // keeps jumping gets a heave that carries them up and over (swimming speed alone never reaches it).
    const push = Math.hypot(wx, wz);
    if (input.jump && push > 0.05) {
      const px = b.x + (wx / push) * 0.12;
      const pz = b.z + (wz / push) * 0.12;
      if (collides(world, px, b.y, pz, b.width, b.height) && !collides(world, px, b.y + 1.5, pz, b.width, b.height)) {
        b.vy = Math.max(b.vy, thick ? 8 : 9.6);
      }
    }
  } else {
    b.vy = Math.max(-TERMINAL, b.vy - GRAVITY * dt);
    if (input.jump && b.onGround) b.vy = input.jumpVelocity ?? JUMP_VELOCITY;
    if (b.inWeb) b.vy = Math.max(-0.8, Math.min(b.vy, 1.2));
  }

  const k = Math.min(1, accel * dt);
  b.vx += (targetX - b.vx) * k;
  b.vz += (targetZ - b.vz) * k;

  if (input.noclip) {
    b.onGround = false;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    return;
  }

  const wasOnGround = b.onGround;
  b.onGround = false;
  const guard = input.sneak && wasOnGround && !input.fly;
  moveAxis(world, b, 'x', b.vx * dt, guard, wasOnGround, input.stepHeight);
  moveAxis(world, b, 'z', b.vz * dt, guard, wasOnGround, input.stepHeight);
  moveAxis(world, b, 'y', b.vy * dt, false);
  if (input.solids && input.solids.length > 0) pushOut(world, b, input.solids);
}

/**
 * Push a body out of the characters it overlaps: sideways, along the line between the two, and only as far as there is room
 * (a body against a wall is not pushed into it). A body that is above the top of one (a jump over it) is not touched.
 */
function pushOut(world: BlockReader, b: Body, solids: readonly Solid[]): void {
  const hw = (b.width ?? PLAYER_WIDTH) / 2;
  const bh = b.height ?? PLAYER_HEIGHT;
  for (const s of solids) {
    if (b.y >= s.y + s.h - 0.25 || b.y + bh <= s.y + 0.1) continue;
    const min = hw + s.r;
    let dx = b.x - s.x;
    let dz = b.z - s.z;
    const d = Math.hypot(dx, dz);
    if (d >= min) continue;
    if (d < 1e-4) {
      dx = 1;
      dz = 0;
    } else {
      dx /= d;
      dz /= d;
    }
    const push = min - Math.max(d, 0) + 0.001;
    const w = b.width;
    const h = b.height;
    let moved = false;
    for (const [mx, mz] of [[dx, dz], [dx, 0], [0, dz]] as const) {
      if (mx === 0 && mz === 0) continue;
      const k = push * Math.hypot(mx, mz) > 0 ? push : 0;
      const nx = b.x + mx * k;
      const nz = b.z + mz * k;
      if (!collides(world, nx, b.y, nz, w, h)) {
        b.x = nx;
        b.z = nz;
        moved = true;
        break;
      }
    }
    // Whoever pushed into it loses the speed they had towards it.
    const vn = b.vx * dx + b.vz * dz;
    if (moved && vn < 0) {
      b.vx -= vn * dx;
      b.vz -= vn * dz;
    }
  }
}

export function isWaterBlock(id: number): boolean {
  return FLUID_KIND[id] === FLUID_WATER;
}
