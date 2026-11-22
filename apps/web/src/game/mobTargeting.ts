import * as THREE from 'three';
import { MOBS, mobLevel, mobMaxHealth } from '@solrift/shared';
import { useUi, type MobTargetView } from '../ui/store';
import type { ClientSession, MobLike } from './clientSession';
import type { Input } from './input';

/** How far (in blocks) the crosshair picks a creature, and how long it stays the target after looking away (and the frame stays as long as it is near). */
export const MOB_TARGET_RANGE = 32;
export const MOB_TARGET_KEEP_MS = 6000;

/** Where along a ray (a unit direction) it first enters a box, or null when it misses or the box is beyond `limit`. */
export function rayBox(o: THREE.Vector3, d: THREE.Vector3, min: THREE.Vector3, max: THREE.Vector3, limit: number): number | null {
  let t0 = 0;
  let t1 = limit;
  for (const axis of ['x', 'y', 'z'] as const) {
    const p = o[axis];
    const dir = d[axis];
    if (Math.abs(dir) < 1e-6) {
      if (p < min[axis] || p > max[axis]) return null;
      continue;
    }
    let a = (min[axis] - p) / dir;
    let b = (max[axis] - p) / dir;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return t0;
}

const lo = new THREE.Vector3();
const hi = new THREE.Vector3();

/**
 * The creature the ray rests on: the nearest one whose box it crosses (not a dead one, not one behind a wall: `blocked(distance)` says whether
 * something solid lies on the ray that far along).
 */
export function pickMob(origin: THREE.Vector3, dir: THREE.Vector3, mobs: readonly MobLike[], range: number, blocked: (distance: number) => boolean): MobLike | null {
  let best: MobLike | null = null;
  let bestT = range;
  for (const m of mobs) {
    if (m.dead) continue;
    const def = MOBS[m.kind];
    if (!def) continue;
    const scale = (m.kind === 'slime' ? m.size : 1) * (m.baby ? 0.5 : 1);
    const hw = (def.width * scale) / 2 + 0.1;
    const h = def.height * scale + 0.1;
    lo.set(m.body.x - hw, m.body.y - 0.05, m.body.z - hw);
    hi.set(m.body.x + hw, m.body.y + h, m.body.z + hw);
    const t = rayBox(origin, dir, lo, hi, bestT);
    if (t !== null && t < bestT && !blocked(t)) {
      best = m;
      bestT = t;
    }
  }
  return best;
}

/** What the frame shows for this creature (its health is its most while the server has not said it is hurt). */
export function mobTargetView(m: MobLike): MobTargetView {
  const max = m.maxHealth ?? mobMaxHealth(m.kind, m.size);
  return {
    id: m.id,
    kind: m.kind,
    variant: m.variant,
    level: mobLevel(m.kind, m.size),
    hp: Math.max(0, Math.min(max, m.health ?? max)),
    max,
    elite: !!m.elite,
  };
}

/**
 * The target frame of a creature (an animal, a monster, a person): the one the crosshair rests on is the target, and it stays a few
 * seconds after looking away while it is in sight. Hitting something needs the crosshair on it, so a hit keeps it as the target too.
 * The frame itself is drawn from the store (`mobTarget`); a player under the crosshair has the frame instead (see `TargetPicker`).
 */
export class MobTargetPicker {
  private id: number | null = null;
  private seen = 0;
  private readonly aim = new THREE.Vector3();
  private readonly from = new THREE.Vector3();

  constructor(
    private readonly session: ClientSession,
    private readonly input: Input,
    private readonly camera: THREE.Camera,
    /** Is there something solid at this block? */
    private readonly solidAt: (x: number, y: number, z: number) => boolean,
  ) {}

  /** Is anything solid on the ray, `distance` blocks along it? (Stepped at half a block: a thin fence post may slip through, a wall never.) */
  private blocked = (distance: number): boolean => {
    for (let s = 0.5; s < distance - 0.3; s += 0.5) {
      if (this.solidAt(Math.floor(this.from.x + this.aim.x * s), Math.floor(this.from.y + this.aim.y * s), Math.floor(this.from.z + this.aim.z * s))) return true;
    }
    return false;
  };

  /** Once a frame: which creature is under the crosshair now, and what the frame should show. */
  update(): void {
    const now = performance.now();
    let hit: MobLike | null = null;
    if (this.input.locked && this.session.screen === 'none' && !this.session.spectating) {
      this.camera.getWorldDirection(this.aim);
      this.from.copy(this.camera.position);
      hit = pickMob(this.from, this.aim, this.session.mobs.mobs, MOB_TARGET_RANGE, this.blocked);
    }
    if (hit) {
      this.id = hit.id;
      this.seen = now;
    } else if (this.id !== null && now - this.seen > MOB_TARGET_KEEP_MS) this.id = null;
    const m = this.id === null ? undefined : this.session.mobs.mobs.find((o) => o.id === this.id);
    const near = !!m && !m.dead && Math.hypot(m.body.x - this.session.body.x, m.body.z - this.session.body.z) <= MOB_TARGET_RANGE * 2;
    if (!m || !near) this.id = null;
    const next = m && near ? mobTargetView(m) : null;
    const cur = useUi.getState().mobTarget;
    if (JSON.stringify(cur) !== JSON.stringify(next)) useUi.setState({ mobTarget: next });
  }

  /** Let go of the target (the game ended, or a menu opened). */
  clear(): void {
    this.id = null;
    if (useUi.getState().mobTarget) useUi.setState({ mobTarget: null });
  }
}
