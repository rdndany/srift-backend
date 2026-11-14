import type { BlockReader } from './physics';
import { raycast } from './raycast';

/**
 * Third person: the camera is not at the eyes (it hangs behind and beside the head), so the crosshair and the eyes see the world from
 * two places. What the player means is "what the crosshair is on", so the aim is worked out from that: the ray of the camera is cast
 * into the world, and the eyes then aim at the point it ends on. Everything that aims (a blow, an arrow, a spell, the block that is
 * mined) goes toward what the crosshair shows, from where the player really stands.
 */

/** The camera is never farther than this from the eyes (a client claiming more is ignored: it would aim through walls). */
export const CAMERA_MAX_OFFSET = 9;
/** The crosshair is followed this far into the world; farther than that the aim just runs parallel to the camera. */
export const CROSSHAIR_RANGE = 96;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** What can be aimed at besides blocks (the mobs). */
export interface RayTargets {
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, margin?: number): { dist: number } | null;
}

/** The unit vector for a yaw and pitch (yaw 0 faces -z, positive pitch looks up). */
export function lookVector(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

/** The camera, clamped to a sane distance from the eyes, or null when it is not believable (not finite). */
export function sanitizeCamera(eye: Vec3, cam: Vec3 | null | undefined): Vec3 | null {
  if (!cam || !Number.isFinite(cam.x) || !Number.isFinite(cam.y) || !Number.isFinite(cam.z)) return null;
  const dx = cam.x - eye.x;
  const dy = cam.y - eye.y;
  const dz = cam.z - eye.z;
  const len = Math.hypot(dx, dy, dz);
  if (len <= CAMERA_MAX_OFFSET) return cam;
  const k = CAMERA_MAX_OFFSET / len;
  return { x: eye.x + dx * k, y: eye.y + dy * k, z: eye.z + dz * k };
}

/**
 * The unit direction, from the eyes, toward what the crosshair of a camera at `cam` (looking along yaw, pitch) is on. Walls and
 * mobs are searched along the camera's ray, but only past the eyes: whatever lies between the camera and the player (a pillar
 * the camera peeks round) is not what the player is aiming at.
 */
export function aimThroughCrosshair(world: BlockReader, targets: RayTargets | null, eye: Vec3, cam: Vec3, yaw: number, pitch: number): Vec3 {
  const d = lookVector(yaw, pitch);
  // Where the camera's ray passes the plane of the eyes: it starts counting there.
  const t0 = Math.max(0, (eye.x - cam.x) * d.x + (eye.y - cam.y) * d.y + (eye.z - cam.z) * d.z);
  const ox = cam.x + d.x * t0;
  const oy = cam.y + d.y * t0;
  const oz = cam.z + d.z * t0;
  let dist = CROSSHAIR_RANGE;
  const block = raycast(world, ox, oy, oz, d.x, d.y, d.z, CROSSHAIR_RANGE);
  if (block) {
    const hx = block.x + (block.fx ?? 0.5) - ox;
    const hy = block.y + (block.fy ?? 0.5) - oy;
    const hz = block.z + (block.fz ?? 0.5) - oz;
    dist = Math.min(dist, Math.hypot(hx, hy, hz));
  }
  const mob = targets?.raycast(ox, oy, oz, d.x, d.y, d.z, dist, 0.1) ?? null;
  if (mob) dist = Math.min(dist, mob.dist);
  const px = ox + d.x * dist - eye.x;
  const py = oy + d.y * dist - eye.y;
  const pz = oz + d.z * dist - eye.z;
  const len = Math.hypot(px, py, pz);
  // Right against the eyes there is no direction to speak of: look the way the camera does.
  if (len < 0.4) return d;
  return { x: px / len, y: py / len, z: pz / len };
}
