import { B, BLOCKS } from './blocks';
import { isLavaId } from './fluids';

/**
 * Experience orbs: small glowing spheres that come out of a dying mob, a mined ore, a furnace or a bottle. They are not items:
 * they take no room in the bag. A kill's orbs drift to the player who earned them. Any other orb drifts to whoever is close, and once it touches them it turns into experience.
 */
export interface XpOrb {
  id: number;
  /** The experience it is worth (the size it is drawn at follows from this). */
  value: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  /** Seconds before it can be taken (a moment to be seen and to fall out). */
  delay: number;
  /** Random offset for the spin and the bob. */
  phase: number;
  /** It is flying in to a player (not lying about). */
  flying?: boolean;
  /**
   * Who a kill's experience belongs to. Set for orbs from a mob a player killed. Unset for an ore, a furnace,
   * a bottle or a trade. Only that player sees them, and only they are drawn in.
   */
  owner?: unknown;
}

/** A player that can absorb orbs. */
export interface XpCollector {
  x: number;
  y: number;
  z: number;
  /** A dead or spectating player draws nothing in. */
  alive: boolean;
  /** An orb reached the player: this much experience. */
  take(value: number): void;
  /** The player this is, so a kill's experience can be kept for them. */
  ref?: unknown;
}

/** The values an orb is worth at each of its eleven sizes (size 0 is the smallest), as in the original. */
export const XP_ORB_VALUES = [1, 3, 7, 17, 37, 73, 149, 307, 617, 1237, 2477] as const;
/** Orbs live this long (seconds) in the world. */
export const XP_ORB_LIFETIME = 300;
/** How far away a player pulls orbs in (blocks). */
export const XP_ORB_PULL_RANGE = 8;
/** An orb this close to a player is taken. */
export const XP_ORB_TAKE_RANGE = 1.1;
export const MAX_XP_ORBS = 220;
const GRAVITY = 16;

/** The size (0..10) an orb of this value is drawn at. */
export function xpOrbSize(value: number): number {
  let size = 0;
  for (let i = 0; i < XP_ORB_VALUES.length; i++) if (value >= XP_ORB_VALUES[i]) size = i;
  return size;
}

/** Split an amount of experience into orb values, the biggest sizes first: 7 is one orb of 7, 10 is 7 + 3, 100 is 73 + 17 + 7 + 3. */
export function splitXp(amount: number): number[] {
  let left = Math.floor(amount);
  const out: number[] = [];
  for (let i = XP_ORB_VALUES.length - 1; i >= 0 && left > 0; i--) {
    const v = XP_ORB_VALUES[i];
    while (left >= v && out.length < 40) {
      out.push(v);
      left -= v;
    }
  }
  // (More than forty orbs' worth at once: the rest rides along on the last one, so nothing is lost.)
  if (left > 0 && out.length > 0) out[out.length - 1] += left;
  return out;
}

/** The orbs lying and flying about a realm. The renderer draws `orbs`; nothing here touches graphics. */
export class XpOrbWorld {
  readonly orbs: XpOrb[] = [];
  private nextId = 1;

  constructor(
    private readonly blockAt: (x: number, y: number, z: number) => number,
    private readonly rand: () => number = Math.random,
  ) {}

  get count(): number {
    return this.orbs.length;
  }

  private solid(x: number, y: number, z: number): boolean {
    return BLOCKS[this.blockAt(Math.floor(x), Math.floor(y), Math.floor(z))].solid;
  }

  /** Let this much experience out at a place, as one orb or several, flung a little in every direction. */
  spawn(amount: number, x: number, y: number, z: number, owner?: unknown): void {
    for (const value of splitXp(amount)) {
      const a = this.rand() * Math.PI * 2;
      const sp = 0.6 + this.rand() * 1.6;
      this.orbs.push({
        id: this.nextId++,
        value,
        x: x + (this.rand() - 0.5) * 0.3,
        y,
        z: z + (this.rand() - 0.5) * 0.3,
        vx: Math.cos(a) * sp,
        vy: 2.2 + this.rand() * 2,
        vz: Math.sin(a) * sp,
        age: 0,
        delay: 0.35,
        phase: this.rand() * Math.PI * 2,
        ...(owner != null ? { owner } : {}),
      });
      if (this.orbs.length > MAX_XP_ORBS) {
        // Too many about: the oldest melts into the newest of the same owner, so the experience is kept.
        const old = this.orbs.shift()!;
        const pile = this.orbs[this.orbs.length - 1];
        if (pile.owner === old.owner) pile.value += old.value;
      }
    }
  }

  /** Move every orb; the nearest player within reach draws it in, and one that touches a player is taken. */
  update(dt: number, collectors: readonly XpCollector[]): void {
    const step = Math.min(dt, 0.05);
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.age += dt;
      o.delay -= dt;
      if (o.age > XP_ORB_LIFETIME || o.y < -20) {
        this.orbs.splice(i, 1);
        continue;
      }
      const here = this.blockAt(Math.floor(o.x), Math.floor(o.y), Math.floor(o.z));
      if (isLavaId(here) || here === B.FIRE) {
        this.orbs.splice(i, 1);
        continue;
      }
      const inWater = BLOCKS[here].liquid;

      // The nearest living player draws it in, harder the closer it is.
      let pulled = false;
      if (o.delay <= 0) {
        let best: XpCollector | null = null;
        let bestD = XP_ORB_PULL_RANGE;
        let bx = 0;
        let by = 0;
        let bz = 0;
        for (const c of collectors) {
          if (!c.alive || (o.owner != null && c.ref !== o.owner)) continue;
          const dx = c.x - o.x;
          const dy = c.y + 0.9 - o.y;
          const dz = c.z - o.z;
          const d = Math.hypot(dx, dy, dz);
          if (d < bestD) {
            best = c;
            bestD = d;
            bx = dx;
            by = dy;
            bz = dz;
          }
        }
        if (best) {
          if (bestD < XP_ORB_TAKE_RANGE) {
            best.take(o.value);
            this.orbs.splice(i, 1);
            continue;
          }
          const k = 1 - bestD / XP_ORB_PULL_RANGE;
          // It leaps off the floor and flies, never rolling along it: it aims above the chest while far, so it comes in on an arc.
          if (!o.flying) {
            o.flying = true;
            o.vy = Math.max(o.vy, 3 + this.rand());
          }
          const lift = Math.min(1.5, bestD * 0.25);
          const ay = by + lift;
          const ad = Math.hypot(bx, ay, bz) || 1;
          const speed = 3.2 + 10 * k * k + (bestD < 2.5 ? 4 : 0);
          // It homes in harder the closer it gets, so that it never swings past a moving player and circles.
          const steer = Math.min(1, (6 + 40 * k * k) * step);
          o.vx += ((bx / ad) * speed - o.vx) * steer;
          o.vy += ((ay / ad) * speed - o.vy) * steer;
          o.vz += ((bz / ad) * speed - o.vz) * steer;
          pulled = true;
        }
      }
      if (!pulled) o.flying = false;

      // Gravity, softer in water; none at all while it flies in.
      if (!pulled) o.vy -= (inWater ? 3 : GRAVITY) * step;
      if (inWater && !pulled) {
        o.vy = Math.max(o.vy, -1.2);
        o.vx *= 0.92;
        o.vz *= 0.92;
      }

      const nx = o.x + o.vx * step;
      if (this.solid(nx, o.y, o.z)) o.vx *= -0.3;
      else o.x = nx;
      const nz = o.z + o.vz * step;
      if (this.solid(o.x, o.y, nz)) o.vz *= -0.3;
      else o.z = nz;
      const ny = o.y + o.vy * step;
      if (o.vy <= 0 && this.solid(o.x, ny - 0.15, o.z)) {
        // Lands on the floor with a little bounce, and rolls to a stop.
        o.y = Math.floor(ny - 0.15) + 1 + 0.15;
        o.vy = pulled ? 0 : Math.abs(o.vy) > 3 ? -o.vy * 0.35 : 0;
        const f = pulled ? 1 : Math.max(0, 1 - 6 * step);
        o.vx *= f;
        o.vz *= f;
      } else if (o.vy > 0 && this.solid(o.x, ny + 0.15, o.z)) {
        o.vy = 0;
      } else {
        o.y = ny;
      }
      // Buried by a placed block: pop up.
      for (let k = 0; k < 3 && this.solid(o.x, o.y, o.z); k++) o.y = Math.floor(o.y) + 1.15;
    }
  }

  clear(): void {
    this.orbs.length = 0;
  }
}
