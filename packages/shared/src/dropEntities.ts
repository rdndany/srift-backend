import { B, BLOCKS } from './blocks';
import { isLavaId } from './fluids';
import { cloneStack, type ItemStack } from './inventory';

/** A dropped item lying in the world. */
export interface DropEntity {
  id: number;
  stack: ItemStack;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  /** Seconds before it can be picked up. */
  delay: number;
  /** Random offset for the bobbing animation. */
  phase: number;
}

/** A player who can pick drops up. picked counts items taken during an update. */
export interface DropCollector {
  x: number;
  y: number;
  z: number;
  canFit(s: ItemStack): boolean;
  collect(s: ItemStack): ItemStack | null;
  picked: number;
}

export const MAX_DROPS = 160;
const LIFETIME = 300;
const GRAVITY = 20;

/** Dropped item physics and pickup. The renderer draws `drops`; nothing here touches graphics. */
export class DropWorld {
  readonly drops: DropEntity[] = [];
  private nextId = 1;

  constructor(
    private readonly blockAt: (x: number, y: number, z: number) => number,
    private readonly rand: () => number = Math.random,
  ) {}

  get count(): number {
    return this.drops.length;
  }

  private solid(x: number, y: number, z: number): boolean {
    return BLOCKS[this.blockAt(Math.floor(x), Math.floor(y), Math.floor(z))].solid;
  }

  spawn(stack: ItemStack, x: number, y: number, z: number, vx = 0, vy = 3, vz = 0, delay = 0.5): void {
    if (stack.count <= 0) return;
    this.drops.push({ id: this.nextId++, stack: cloneStack(stack), x, y, z, vx, vy, vz, age: 0, delay, phase: this.rand() * Math.PI * 2 });
    if (this.drops.length > MAX_DROPS) this.drops.splice(0, 1);
  }

  /** Scatter a stack out of a broken block. */
  spawnAtBlock(stack: ItemStack, bx: number, by: number, bz: number): void {
    const a = this.rand() * Math.PI * 2;
    this.spawn(stack, bx + 0.5, by + 0.3, bz + 0.5, Math.cos(a) * 1.2, 2.6, Math.sin(a) * 1.2, 0.4);
  }

  /**
   * Advance physics and collect drops near the player. `collect` receives the stack and returns
   * what it could not store (or null). Returns how many items were picked up.
   */
  update(
    dt: number,
    px: number,
    py: number,
    pz: number,
    canFit: (s: ItemStack) => boolean,
    collect: (s: ItemStack) => ItemStack | null,
  ): number {
    const c: DropCollector = { x: px, y: py, z: pz, canFit, collect, picked: 0 };
    this.updateMany(dt, [c]);
    return c.picked;
  }

  /** Like `update`, for several players: each drop goes to the nearest one who can take it. */
  updateMany(dt: number, collectors: readonly DropCollector[]): void {
    const step = Math.min(dt, 0.05);
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      d.delay -= dt;
      if (d.age > LIFETIME || d.y < -20) {
        this.drops.splice(i, 1);
        continue;
      }

      const here = this.blockAt(Math.floor(d.x), Math.floor(d.y + 0.2), Math.floor(d.z));
      if (isLavaId(here) || here === B.FIRE) {
        // Items that fall into lava or flames burn up.
        this.drops.splice(i, 1);
        continue;
      }
      const inWater = BLOCKS[here].liquid;
      d.vy -= (inWater ? 4 : GRAVITY) * step;
      if (inWater) {
        d.vy = Math.max(d.vy, -1.2);
        d.vx *= 0.9;
        d.vz *= 0.9;
      }

      // An item is picked up by walking onto it: it is not drawn in from a distance (orbs of experience are, items are not).
      if (d.delay <= 0 && collectors.length > 0) {
        let c = collectors[0];
        let dist = Infinity;
        for (const k of collectors) {
          const kd = Math.hypot(k.x - d.x, k.y + 0.9 - (d.y + 0.2), k.z - d.z);
          if (kd < dist) {
            c = k;
            dist = kd;
          }
        }
        if (dist < 1.2) {
          const left = c.collect(cloneStack(d.stack));
          const before = d.stack.count;
          if (!left) {
            c.picked += before;
            this.drops.splice(i, 1);
            continue;
          }
          if (left.count < before) {
            c.picked += before - left.count;
            d.stack.count = left.count;
          }
        }
      }
      // Horizontal movement (blocked by solids).
      const nx = d.x + d.vx * step;
      if (this.solid(nx, d.y + 0.1, d.z)) d.vx = 0;
      else d.x = nx;
      const nz = d.z + d.vz * step;
      if (this.solid(d.x, d.y + 0.1, nz)) d.vz = 0;
      else d.z = nz;

      // Vertical movement / ground.
      const ny = d.y + d.vy * step;
      if (d.vy <= 0 && this.solid(d.x, ny, d.z)) {
        d.y = Math.floor(ny) + 1;
        d.vy = 0;
        const f = Math.max(0, 1 - 10 * step);
        d.vx *= f;
        d.vz *= f;
      } else if (d.vy > 0 && this.solid(d.x, ny + 0.4, d.z)) {
        d.vy = 0;
      } else {
        d.y = ny;
      }
      // Buried by a placed block: pop up.
      for (let k = 0; k < 3 && this.solid(d.x, d.y + 0.05, d.z); k++) d.y = Math.floor(d.y) + 1;
    }
  }

  clear(): void {
    this.drops.length = 0;
  }
}
