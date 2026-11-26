import { B, IS_LIQUID, IS_PARTIAL, IS_SOLID, ladderInfo } from './blocks';
import { collisionBoxes, isTallShape, seatDrop, seatedBox } from './shapes';
import { FLUID_KIND, FLUID_WATER, fluidCurrent, isLavaId } from './fluids';
import { isSeaPlant } from './plants';

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

/** A box of a creature's shape, in the creature's own frame (x right, y up, the front at -z): [centre x, centre y, centre z, size x, size y, size z]. */
export type SolidBox = readonly [number, number, number, number, number, number];

/**
 * Something solid that bodies cannot walk through (a monster, a person), x, y, z at its feet: an upright cylinder and, when it has `boxes`,
 * the thick parts of the shape it is drawn in that stick out of it (its head, a giant's arms, the shield and the sword it holds), turned the way it faces. A body cannot walk into the
 * arm of a giant, but walks under a raised sword.
 */
export interface Solid {
  x: number;
  y: number;
  z: number;
  /** Radius of the cylinder (the body, with or without `boxes`). */
  r: number;
  /** Height. */
  h: number;
  /** The shape, in the creature's frame, and the way it faces (as `Mob.yaw`: the front is (-sin yaw, -cos yaw)) and how big it is next to the boxes (1: as given). */
  boxes?: readonly SolidBox[];
  yaw?: number;
  scale?: number;
  /** How far from x, z any of the boxes reaches (at their size in the world). */
  reach?: number;
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
  /** Flying with wings: how many times the walking speed the body flies at (creative flight: 2.2), and how fast it climbs and sinks (creative flight: 11). */
  flyBoost?: number;
  flyRise?: number;
  /**
   * Flying with wings is helped past what is in the way: a body that meets a ledge, a lintel or the frame of a door that it would just miss by
   * a little is carried up or down the little that clears it (up to a block up and half a block down), and under a low roof, indoors, it flies at
   * little more than a walk. Without this a flier would have to hit a two-block doorway to the half-block.
   */
  flyAssist?: boolean;
  /** Characters in the way: the body is pushed out of each of them (never into a wall), so nobody walks through anybody. */
  solids?: readonly Solid[];
  /**
   * The shape of the body itself (a monster's arms and head, see `Solid.boxes`): it is pushed away from a character that comes into any of it, as
   * a character is pushed out of it. Both give way, so a monster stops an arm's length from you instead of walking on into you and shoving you
   * along in front of it.
   */
  shape?: { boxes: readonly SolidBox[]; yaw: number; scale: number };
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

/** How far a flier is moved, up and down, to clear what it has run into (the smallest first). */
const ASSIST = [0.1, -0.1, 0.2, -0.2, 0.3, -0.3, 0.4, -0.4, 0.5, -0.5, 0.6, 0.8, 1];

function moveAxis(world: BlockReader, b: Body, axis: Axis, delta: number, sneakGuard: boolean, grounded = false, stepHeight = STEP_HEIGHT, assist = false): void {
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
    // In water a full block is a step too, so a stair is climbed by swimming onto it, not by a jump that throws the body up.
    const rise = axis === 'y' ? 0 : b.inWater && b.inLava !== true ? Math.max(stepHeight, 1.01) : grounded ? stepHeight : 0;
    if (rise > 0 && !hit(b.x, py + rise, b.z)) {
      b.y = py + rise * (1 - furthestFree((t) => !hit(b.x, py + rise * (1 - t), b.z)));
      if (grounded) b.onGround = true;
      continue;
    }

    // A flier meets a ledge or a lintel it would clear by a little: it is lifted or lowered the little that frees it, and goes on.
    if (axis !== 'y' && assist) {
      const dy = ASSIST.find((o) => !hit(b.x, py + o, b.z));
      if (dy !== undefined) {
        b.y = py + dy;
        continue;
      }
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

/** How many blocks of free air there are over the head of `b` before something solid (4 or more: none close). */
export function roofGap(world: BlockReader, b: Body): number {
  const top = b.y + (b.height ?? PLAYER_HEIGHT);
  const bx = Math.floor(b.x);
  const bz = Math.floor(b.z);
  for (let by = Math.floor(top - EPS); by <= Math.floor(top) + 4; by++) {
    if (IS_SOLID[world.getBlock(bx, by, bz)]) return Math.max(0, by - top);
  }
  return 4;
}

/**
 * A swimmer pressed into a shore. Puts the feet on top of that lip when it is only a block or so above
 * the water, and steps inland so a short or wide body does not rise in place and fall back. A sea wall
 * is not a ladder.
 */
function climbShore(world: BlockReader, b: Body, dirX: number, dirZ: number): boolean {
  const w = b.width ?? PLAYER_WIDTH;
  const h = b.height ?? PLAYER_HEIGHT;
  const px = b.x + dirX * 0.2;
  const pz = b.z + dirZ * 0.2;
  if (!collides(world, px, b.y, pz, w, h)) return false;
  const ax = Math.floor(b.x + dirX * (w * 0.5 + 0.02));
  const az = Math.floor(b.z + dirZ * (w * 0.5 + 0.02));
  let top = Math.floor(b.y + 0.02);
  const limit = top + 3;
  while (top < limit) {
    const id = world.getBlock(ax, top, az);
    if (IS_SOLID[id] !== 1 || IS_LIQUID[id] === 1) break;
    top++;
  }
  if (top === limit || top - b.y > 2.05 || top <= b.y + 0.05) return false;
  // One block is a step. Swimming onto it is the move; placing the body on top would teleport it.
  if (top - b.y <= 1.05) return false;
  const spots: ReadonlyArray<readonly [number, number]> = [
    [ax + 0.5, az + 0.5],
    [b.x + dirX * (w * 0.5 + 0.08), b.z + dirZ * (w * 0.5 + 0.08)],
  ];
  for (const [nx, nz] of spots) {
    if (collides(world, nx, top, nz, w, h)) continue;
    const under = world.getBlock(Math.floor(nx), top - 1, Math.floor(nz));
    if (IS_SOLID[under] !== 1 || IS_LIQUID[under] === 1) continue;
    b.x = nx;
    b.y = top;
    b.z = nz;
    b.vy = 0;
    return true;
  }
  return false;
}

/** Advance the player body by dt seconds. Fixed-timestep friendly. */
export function stepPlayer(world: BlockReader, b: Body, input: MoveInput, dt: number): void {
  const feetBlock = world.getBlock(Math.floor(b.x), Math.floor(b.y + 0.4), Math.floor(b.z));
  // Lava is checked at the feet and the hips, so bobbing at its surface still counts as being in it.
  const hipsBlock = world.getBlock(Math.floor(b.x), Math.floor(b.y + 0.1), Math.floor(b.z));
  const headBlock = world.getBlock(Math.floor(b.x), Math.floor(b.y + 0.9), Math.floor(b.z));
  b.inLava = isLavaId(feetBlock) || isLavaId(hipsBlock) || isLavaId(headBlock);
  b.inWeb = feetBlock === B.COBWEB || hipsBlock === B.COBWEB || headBlock === B.COBWEB;
  b.inWater = IS_LIQUID[feetBlock] === 1 || b.inLava || cellCountsAsWater(world, Math.floor(b.x), Math.floor(b.y + 0.4), Math.floor(b.z));
  // Only the cell the feet are in counts, so climbing ends as the feet reach the top of the ladder.
  const ladderY = Math.floor(b.y + 0.05);
  b.onLadder = ladderInfo(world.getBlock(Math.floor(b.x), ladderY, Math.floor(b.z))) !== null;
  const eye = b.height === undefined ? PLAYER_EYE : b.height * 0.9;
  const eyeY = Math.floor(b.y + eye);
  const eyeBlock = world.getBlock(Math.floor(b.x), eyeY, Math.floor(b.z));
  b.eyeInWater = IS_LIQUID[eyeBlock] === 1 || cellCountsAsWater(world, Math.floor(b.x), eyeY, Math.floor(b.z));
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
    let boost = input.flyBoost ?? 2.2;
    // Indoors (a roof close over the head) a flier slows to little more than a walk, and the lower the roof the slower: it can turn in a room and
    // find the door.
    if (input.flyAssist) {
      const gap = roofGap(world, b);
      if (gap < 4) boost = 1 + (boost - 1) * (0.2 + 0.8 * Math.max(0, Math.min(1, (gap - 0.3) / 3)));
    }
    targetX *= boost;
    targetZ *= boost;
    accel = 8;
    const rise = input.flyRise ?? FLY;
    const targetY = (input.jump ? rise : 0) + (input.flyDown ? -rise : 0);
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
    if (!thick) {
      // Flowing water pushes with the current. A slope of one level is a gentle drift; a hole beside
      // the cell pulls harder. A fall drags downward on top of the sink already applied below.
      const flow = fluidCurrent(world.getBlock.bind(world), Math.floor(b.x), Math.floor(b.y + 0.4), Math.floor(b.z));
      targetX += flow.x * 3.2;
      targetZ += flow.z * 3.2;
      if (flow.y < 0) b.vy -= 6 * dt;
    }
    b.vy -= (thick ? 5 : 6) * dt;
    if (input.jump) b.vy += (thick ? 14 : 20) * dt;
    b.vy = Math.max(thick ? -1.6 : -3, Math.min(b.vy, thick ? 2.2 : 3.4));
    // Climbing out. A body already touching the bank cannot rise: the face overhead cancels the jump and
    // it stays draped on the lip. Step it onto a lip that is only a block or so above the water. A high
    // wall is left alone, and so is a swimmer who is not trying to climb.
    const push = Math.hypot(wx, wz);
    if (input.jump && push > 0.05) {
      const dirX = wx / push;
      const dirZ = wz / push;
      const placed = !thick && climbShore(world, b, dirX, dirZ);
      if (!placed) {
        const px = b.x + dirX * 0.12;
        const pz = b.z + dirZ * 0.12;
        const w = b.width ?? PLAYER_WIDTH;
        const h = b.height ?? PLAYER_HEIGHT;
        // A lip taller than one block (the shore) needs a push, or a swimmer bobs at the surface
        // and never reaches it. A single step does not: that push was throwing the body up the stair.
        const into = collides(world, px, b.y, pz, w, h);
        const aboveStep = collides(world, px, b.y + 0.9, pz, w, h);
        const tooHigh = collides(world, px, b.y + 2.1, pz, w, h);
        if (into && aboveStep && !tooHigh) b.vy = Math.max(b.vy, thick ? 8 : 9.6);
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
  const assist = !!input.flyAssist && input.fly;
  moveAxis(world, b, 'x', b.vx * dt, guard, wasOnGround, input.stepHeight, assist);
  moveAxis(world, b, 'z', b.vz * dt, guard, wasOnGround, input.stepHeight, assist);
  moveAxis(world, b, 'y', b.vy * dt, false);
  if (input.solids && input.solids.length > 0) pushOut(world, b, input.solids, input.shape);
}

/**
 * Push a body out of the characters it overlaps: sideways, along the line between the two, and only as far as there is room
 * (a body against a wall is not pushed into it). A body that is above the top of one (a jump over it) is not touched.
 */
/** The most a body gives way to a character in its own shape in one step (blocks). */
const SHAPE_GIVE = 0.2;

function pushOut(world: BlockReader, b: Body, solids: readonly Solid[], shape?: MoveInput['shape']): void {
  const hw = (b.width ?? PLAYER_WIDTH) / 2;
  const bh = b.height ?? PLAYER_HEIGHT;
  if (shape) {
    // The body's own boxes against each character (a circle of its radius): the body gives way.
    const sc = shape.scale;
    const c = Math.cos(shape.yaw);
    const sn = Math.sin(shape.yaw);
    // (It gives way gradually, not all at once: a monster that finds a character in its arms, or is made beside one, eases off at a walking
    // pace and is not thrown across the room.)
    let budget = SHAPE_GIVE;
    for (const s of solids) {
      if (s.boxes) continue;
      for (let pass = 0; pass < 2 && budget > 1e-4; pass++) {
        let any = false;
        for (const [cx, cy, cz, sx, sy, sz] of shape.boxes) {
          if (budget <= 1e-4) break;
          const y0 = b.y + (cy - sy / 2) * sc;
          const y1 = b.y + (cy + sy / 2) * sc;
          if (s.y >= y1 - 0.25 || s.y + s.h <= y0 + 0.1) continue;
          const rx = s.x - b.x;
          const rz = s.z - b.z;
          const lx = rx * c - rz * sn;
          const lz = rx * sn + rz * c;
          const mx = cx * sc;
          const mz = cz * sc;
          const hx = (sx * sc) / 2;
          const hz = (sz * sc) / 2;
          const ex = lx - Math.min(mx + hx, Math.max(mx - hx, lx));
          const ez = lz - Math.min(mz + hz, Math.max(mz - hz, lz));
          const d = Math.hypot(ex, ez);
          if (d >= s.r) continue;
          let nx: number;
          let nz: number;
          let push: number;
          if (d > 1e-4) {
            nx = ex / d;
            nz = ez / d;
            push = s.r - d + 0.001;
          } else {
            const px = hx - Math.abs(lx - mx);
            const pz = hz - Math.abs(lz - mz);
            if (px < pz) {
              nx = lx >= mx ? 1 : -1;
              nz = 0;
              push = px + s.r + 0.001;
            } else {
              nx = 0;
              nz = lz >= mz ? 1 : -1;
              push = pz + s.r + 0.001;
            }
          }
          // (The normal points from the box to the character: the body goes the other way.)
          push = Math.min(push, budget);
          if (shove(world, b, -(nx * c + nz * sn), -(-nx * sn + nz * c), push)) {
            any = true;
            budget -= push;
          }
        }
        if (!any) break;
      }
    }
  }
  for (const s of solids) {
    if (s.boxes) {
      // Its shape: each box is a wall of its own, so a head, an arm or a shield is as solid as the body between them. Twice round, so that
      // being pushed out of one box into the next (the corner between an arm and the body) is put right as well.
      const sc = s.scale ?? 1;
      const c = Math.cos(s.yaw ?? 0);
      const sn = Math.sin(s.yaw ?? 0);
      if (Math.hypot(b.x - s.x, b.z - s.z) < hw + Math.max(s.r, s.reach ?? 0)) for (let pass = 0; pass < 2; pass++) {
        let any = false;
        for (const [cx, cy, cz, sx, sy, sz] of s.boxes) {
          const y0 = s.y + (cy - sy / 2) * sc;
          const y1 = s.y + (cy + sy / 2) * sc;
          if (b.y >= y1 - 0.25 || b.y + bh <= y0 + 0.1) continue;
          // The body in the frame of the creature (it faces (-sin yaw, -cos yaw)).
          const rx = b.x - s.x;
          const rz = b.z - s.z;
          const lx = rx * c - rz * sn;
          const lz = rx * sn + rz * c;
          const mx = cx * sc;
          const mz = cz * sc;
          const hx = (sx * sc) / 2;
          const hz = (sz * sc) / 2;
          const ex = lx - Math.min(mx + hx, Math.max(mx - hx, lx));
          const ez = lz - Math.min(mz + hz, Math.max(mz - hz, lz));
          const d = Math.hypot(ex, ez);
          if (d >= hw) continue;
          let nx: number;
          let nz: number;
          let push: number;
          if (d > 1e-4) {
            nx = ex / d;
            nz = ez / d;
            push = hw - d + 0.001;
          } else {
            // The middle of the body is inside the box: out through the nearest side.
            const px = hx - Math.abs(lx - mx);
            const pz = hz - Math.abs(lz - mz);
            if (px < pz) {
              nx = lx >= mx ? 1 : -1;
              nz = 0;
              push = px + hw + 0.001;
            } else {
              nx = 0;
              nz = lz >= mz ? 1 : -1;
              push = pz + hw + 0.001;
            }
          }
          // Back into the world's frame.
          if (shove(world, b, nx * c + nz * sn, -nx * sn + nz * c, push)) any = true;
        }
        if (!any) break;
      }
    }
    // (The cylinder is the body, with or without the boxes.)
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
    shove(world, b, dx, dz, min - Math.max(d, 0) + 0.001);
  }
}

/** Moves a body `push` blocks along (dx, dz) (a unit direction), or along one of its axes when a wall is in the way; it loses the speed it had towards what pushed. Whether it moved. */
function shove(world: BlockReader, b: Body, dx: number, dz: number, push: number): boolean {
  let moved = false;
  for (const [mx, mz] of [[dx, dz], [dx, 0], [0, dz]] as const) {
    if (mx === 0 && mz === 0) continue;
    const nx = b.x + mx * push;
    const nz = b.z + mz * push;
    if (!collides(world, nx, b.y, nz, b.width, b.height)) {
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
  return moved;
}

export function isWaterBlock(id: number): boolean {
  return FLUID_KIND[id] === FLUID_WATER;
}

/**
 * Water, or kelp, seagrass or a coral fan that the sea still covers. The plant takes the cell, so without
 * this a swimmer inside a stalk leaves the water: the sky turns to air and the swim stops.
 */
export function cellCountsAsWater(world: BlockReader, x: number, y: number, z: number): boolean {
  const id = world.getBlock(x, y, z);
  if (FLUID_KIND[id] === FLUID_WATER) return true;
  if (!isSeaPlant(id)) return false;
  for (let i = 1; i <= 16; i++) {
    const above = world.getBlock(x, y + i, z);
    if (FLUID_KIND[above] === FLUID_WATER) return true;
    if (!isSeaPlant(above)) break;
  }
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    if (FLUID_KIND[world.getBlock(x + dx, y, z + dz)] === FLUID_WATER) return true;
  }
  return false;
}
