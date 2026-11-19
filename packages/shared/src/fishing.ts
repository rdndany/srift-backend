import { B, BLOCKS } from './blocks';
import { ENCH, levelOf, randomEnchantedBook, rollEnchants, withEnchants } from './enchant';
import { fluidSurface, isLavaId, isWaterId } from './fluids';
import { makeStack, type ItemStack } from './inventory';
import { FISHING_ROD_DURABILITY, I, armorId, getItem } from './items';
import type { Mob } from './mobs';

/**
 * Fishing, as in the original: a fishing rod is cast with the use button and the bobber flies out and lands. In water it
 * floats, and after a while of nothing a fish takes notice (bubbles gather), then bites (the bobber is pulled under with a
 * splash). Reel in while it is under and the fish is yours; reel in too early or too late and nothing comes of it. What
 * comes up is mostly fish, now and then a bit of junk, and rarely a treasure (only from open water). Lure makes the fish
 * quicker to come and Luck of the Sea makes junk rarer and treasure likelier. A bobber that hits a creature hooks it, and
 * reeling in pulls it towards you.
 *
 * Nothing here touches graphics: the renderer draws `FishingWorld.bobbers`.
 */

/** How far (blocks) the bobber can be from whoever cast it before the line goes slack and it is lost. */
export const BOBBER_LEASH = 20;
/** The speed (blocks per second) a cast throws the bobber at. */
export const CAST_SPEED = 20;
const GRAVITY = 12;
/** What a tick of flight keeps of the speed (the original's 0.92 of a twentieth of a second). */
const AIR_DRAG = 0.92;
/** The longest a bobber flies before it is given up (seconds). */
const FLIGHT_LIMIT = 8;
/** Seconds a fish takes to come to a bobber that nothing helps (lowest, highest). */
export const FISH_WAIT: readonly [number, number] = [5, 30];
/** Each level of Lure takes this many seconds off the wait. */
export const LURE_SECONDS = 5;
/** The wait is never shorter than this (seconds). */
export const FISH_WAIT_MIN = 1;
/** Seconds a fish takes to swim up to the bobber once it has noticed it. */
export const FISH_APPROACH: readonly [number, number] = [1, 4];
/** Seconds the bobber stays under for, while the fish bites (the time you have to reel in). */
export const FISH_BITE: readonly [number, number] = [1.2, 2.2];
/** The wait goes by this much faster in the rain, under the open sky. */
export const RAIN_SPEED_UP = 1.25;

/** What the line is doing, for the renderer: 0 flying, 1 floating, 2 a fish is coming (bubbles), 3 a fish bites (under), 4 lying on the ground, 5 hooked on a creature. */
export type BobberMode = 0 | 1 | 2 | 3 | 4 | 5;

export interface Bobber {
  id: number;
  /** Who cast it (an opaque handle: the `Player`). */
  owner: unknown;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  state: 'flying' | 'floating' | 'resting' | 'hooked';
  /** While floating: waiting for a fish, a fish is coming, or it is biting. */
  phase: 'wait' | 'lured' | 'bite';
  /** Seconds left of the phase. */
  timer: number;
  /** Seconds since it was cast. */
  age: number;
  /** The levels of Lure and Luck of the Sea the rod had when it was cast. */
  lure: number;
  luck: number;
  /** The creature it is hooked on. */
  hook: Mob | null;
}

/** A bobber as the renderer draws it: where the float is, what the line is doing, and whose hand the line comes out of (`own`: yours; otherwise `owner`). */
export interface BobberDraw {
  id: number;
  x: number;
  y: number;
  z: number;
  mode: BobberMode;
  own: boolean;
  owner: { x: number; y: number; z: number; yaw: number } | null;
}

/** What the world is told of a bobber's doings (the realm turns them into sounds and splashes). */
export interface FishingEvents {
  /** It came down on the water. */
  splash(b: Bobber): void;
  /** A fish noticed it: bubbles. */
  lured(b: Bobber): void;
  /** The fish bites: reel in! */
  bite(b: Bobber): void;
  /** The fish got away. */
  escaped(b: Bobber): void;
  /** It came down on something that is not water: it is taken back. */
  dry(b: Bobber): void;
}

export interface FishingTick {
  /** How hard it rains (0..1). */
  rain: number;
  events: FishingEvents;
  /** Whether the line of this owner still holds: they are alive, near and have the rod in hand. */
  valid(owner: unknown): boolean;
}

/** The mode of a bobber, as the renderer wants it. */
export function bobberMode(b: Bobber): BobberMode {
  switch (b.state) {
    case 'flying':
      return 0;
    case 'resting':
      return 4;
    case 'hooked':
      return 5;
    default:
      return b.phase === 'bite' ? 3 : b.phase === 'lured' ? 2 : 1;
  }
}

export class FishingWorld {
  readonly bobbers: Bobber[] = [];
  private nextId = 1;

  constructor(
    private readonly blockAt: (x: number, y: number, z: number) => number,
    private readonly rand: () => number,
    private readonly mobs: () => readonly Mob[],
  ) {}

  /** The bobber somebody has out, if any. */
  of(owner: unknown): Bobber | null {
    return this.bobbers.find((b) => b.owner === owner) ?? null;
  }

  /** Cast a bobber from (x, y, z) along a direction. Whatever the owner had out is taken in first. */
  cast(owner: unknown, x: number, y: number, z: number, dx: number, dy: number, dz: number, lure = 0, luck = 0): Bobber {
    this.take(owner);
    const len = Math.hypot(dx, dy, dz) || 1;
    // A little scatter, so that no two casts land on exactly the same spot.
    const jitter = () => (this.rand() - 0.5) * 0.9;
    const b: Bobber = {
      id: this.nextId++,
      owner,
      x,
      y,
      z,
      vx: (dx / len) * CAST_SPEED + jitter(),
      vy: (dy / len) * CAST_SPEED + jitter(),
      vz: (dz / len) * CAST_SPEED + jitter(),
      state: 'flying',
      phase: 'wait',
      timer: 0,
      age: 0,
      lure: Math.max(0, lure),
      luck: Math.max(0, luck),
      hook: null,
    };
    this.bobbers.push(b);
    return b;
  }

  /** Take somebody's bobber out of the world and hand it back (null when there was none). */
  take(owner: unknown): Bobber | null {
    const i = this.bobbers.findIndex((b) => b.owner === owner);
    if (i < 0) return null;
    return this.bobbers.splice(i, 1)[0];
  }

  clear(): void {
    this.bobbers.length = 0;
  }

  private solid(x: number, y: number, z: number): boolean {
    return BLOCKS[this.blockAt(Math.floor(x), Math.floor(y), Math.floor(z))].solid;
  }

  /** How long the next wait for a fish is. */
  private wait(b: Bobber): number {
    const [lo, hi] = FISH_WAIT;
    return Math.max(FISH_WAIT_MIN, lo + this.rand() * (hi - lo) - b.lure * LURE_SECONDS);
  }

  /** The height of the water's surface over (x, y, z), or null when there is no water there. */
  private surfaceAt(x: number, y: number, z: number): number | null {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    let cy = Math.floor(y);
    if (!isWaterId(this.blockAt(bx, cy, bz))) {
      if (!isWaterId(this.blockAt(bx, cy - 1, bz))) return null;
      cy -= 1;
    }
    for (let i = 0; i < 8 && isWaterId(this.blockAt(bx, cy + 1, bz)); i++) cy++;
    return cy + fluidSurface(this.blockAt(bx, cy, bz)) / 16;
  }

  /** Is the sky open over this point (no roof of any kind)? */
  private sky(x: number, y: number, z: number): boolean {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    for (let cy = Math.floor(y) + 1; cy < Math.floor(y) + 48; cy++) if (BLOCKS[this.blockAt(bx, cy, bz)].solid) return false;
    return true;
  }

  /**
   * Is the bobber in open water? The original asks for a stretch of water about it with nothing built over it, and only
   * there does a treasure come up. Here: nearly every column of the five by five about it is water with free air above.
   */
  openWater(b: Pick<Bobber, 'x' | 'y' | 'z'>): boolean {
    const top = this.surfaceAt(b.x, b.y, b.z);
    if (top === null) return false;
    const cy = Math.floor(top - 0.01);
    const bx = Math.floor(b.x);
    const bz = Math.floor(b.z);
    let n = 0;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        if (!isWaterId(this.blockAt(bx + dx, cy, bz + dz))) continue;
        if (this.solid(bx + dx, cy + 1, bz + dz) || this.solid(bx + dx, cy + 2, bz + dz) || this.solid(bx + dx, cy + 3, bz + dz)) continue;
        n++;
      }
    }
    return n >= 20;
  }

  /** A creature the bobber touches at (x, y, z), if any (not the owner's own kind of trouble: the dead, the still and the dressed). */
  private hookable(x: number, y: number, z: number): Mob | null {
    for (const m of this.mobs()) {
      if (m.dead || m.def.invulnerable || m.kind === 'armor_stand') continue;
      const hw = (m.body.width ?? m.def.width) / 2 + 0.12;
      const h = (m.body.height ?? m.def.height) + 0.12;
      if (Math.abs(x - m.body.x) <= hw && Math.abs(z - m.body.z) <= hw && y >= m.body.y - 0.12 && y <= m.body.y + h) return m;
    }
    return null;
  }

  /** One short step of a bobber that is in the air. */
  private fly(b: Bobber, h: number, tick: FishingTick): boolean {
    b.vy -= GRAVITY * h;
    const drag = Math.pow(AIR_DRAG, h * 20);
    b.vx *= drag;
    b.vy *= drag;
    b.vz *= drag;
    const nx = b.x + b.vx * h;
    const ny = b.y + b.vy * h;
    const nz = b.z + b.vz * h;

    const mob = b.age > 0.04 ? this.hookable(nx, ny, nz) : null;
    if (mob) {
      b.state = 'hooked';
      b.hook = mob;
      b.vx = b.vy = b.vz = 0;
      return true;
    }

    const id = this.blockAt(Math.floor(nx), Math.floor(ny), Math.floor(nz));
    if (isLavaId(id) || id === B.FIRE) return false;
    if (isWaterId(id)) {
      const top = this.surfaceAt(nx, ny, nz);
      if (top !== null && ny <= top) {
        b.x = nx;
        b.y = ny;
        b.z = nz;
        b.state = 'floating';
        b.phase = 'wait';
        b.timer = this.wait(b);
        b.vx *= 0.15;
        b.vz *= 0.15;
        b.vy = Math.max(-2, b.vy * 0.2);
        tick.events.splash(b);
        return true;
      }
    }
    if (BLOCKS[id].solid) {
      // Only water holds a bobber: what it hits on the way (or the ground it comes down on) gives it back to the fisher.
      tick.events.dry(b);
      return false;
    }
    b.x = nx;
    b.y = ny;
    b.z = nz;
    return true;
  }

  /** One short step of a bobber on the water. */
  private float(b: Bobber, h: number): boolean {
    const top = this.surfaceAt(b.x, b.y, b.z);
    if (top === null) {
      // The water went (or was never under it): it falls again.
      b.state = 'flying';
      b.age = Math.max(b.age, 0.2);
      return true;
    }
    // It rides a little under the surface, and is pulled further down for as long as a fish has it.
    const rest = top - 0.1 - (b.phase === 'bite' ? 0.28 : 0);
    b.vy += ((rest - b.y) * 70 - b.vy * 9) * h;
    b.vx *= Math.pow(0.85, h * 20);
    b.vz *= Math.pow(0.85, h * 20);
    b.x += b.vx * h;
    b.z += b.vz * h;
    b.y += b.vy * h;
    return true;
  }

  /** Move every bobber on by `dt` seconds. */
  update(dt: number, tick: FishingTick): void {
    if (this.bobbers.length === 0) return;
    const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
    const h = dt / steps;
    for (let i = this.bobbers.length - 1; i >= 0; i--) {
      const b = this.bobbers[i];
      const owner = tick.valid(b.owner);
      let keep = owner;
      if (keep) {
        b.age += dt;
        if (b.state === 'flying' && b.age > FLIGHT_LIMIT) keep = false;
        for (let s = 0; keep && s < steps && b.state === 'flying'; s++) keep = this.fly(b, h, tick);
        if (keep && b.state === 'floating') {
          for (let s = 0; s < steps && b.state === 'floating'; s++) this.float(b, h);
          if (b.state === 'floating') this.fish(b, dt, tick);
        } else if (keep && b.state === 'hooked') keep = this.follow(b);
      }
      if (!keep) this.bobbers.splice(i, 1);
    }
  }

  /** The fish: they notice the bobber after a while, come to it, and bite. */
  private fish(b: Bobber, dt: number, tick: FishingTick): void {
    if (b.phase === 'wait') {
      b.timer -= dt * (tick.rain > 0.3 && this.sky(b.x, b.y, b.z) ? RAIN_SPEED_UP : 1);
      if (b.timer <= 0) {
        b.phase = 'lured';
        b.timer = FISH_APPROACH[0] + this.rand() * (FISH_APPROACH[1] - FISH_APPROACH[0]);
        tick.events.lured(b);
      }
    } else if (b.phase === 'lured') {
      b.timer -= dt;
      if (b.timer <= 0) {
        b.phase = 'bite';
        b.timer = FISH_BITE[0] + this.rand() * (FISH_BITE[1] - FISH_BITE[0]);
        b.vy -= 3.2;
        tick.events.bite(b);
      }
    } else {
      b.timer -= dt;
      if (b.timer <= 0) {
        b.phase = 'wait';
        b.timer = this.wait(b);
        tick.events.escaped(b);
      }
    }
  }

  /** A hooked bobber rides its creature; one whose creature is gone falls. */
  private follow(b: Bobber): boolean {
    const m = b.hook;
    if (!m || m.dead || !this.mobs().includes(m)) {
      b.hook = null;
      b.state = 'flying';
      b.age = Math.max(b.age, 0.2);
      return true;
    }
    b.x = m.body.x;
    b.y = m.body.y + (m.body.height ?? m.def.height) * 0.6;
    b.z = m.body.z;
    return true;
  }
}

/** How hard a creature that is reeled in is pulled (blocks per second, at most) and how long the pull lasts. */
const PULL_SPEED = 14;

/** Reel a hooked creature in: it is flung towards (x, y, z), arcing a little, as the original does. */
export function pullMob(m: Mob, x: number, y: number, z: number): void {
  const dx = x - m.body.x;
  const dz = z - m.body.z;
  const dy = y - m.body.y;
  const dist = Math.hypot(dx, dz) || 1;
  const speed = Math.min(PULL_SPEED, 3 + dist * 2);
  m.kbx = (dx / dist) * speed;
  m.kbz = (dz / dist) * speed;
  m.knockTime = Math.min(0.9, Math.max(0.25, dist / speed + 0.1));
  m.body.vy = Math.max(4.5, 2 + Math.max(0, dy) * 1.6 + Math.sqrt(dist) * 1.6);
}

// ---- what comes up ------------------------------------------------------------------------------------------------

export type CatchKind = 'fish' | 'junk' | 'treasure';

export interface Catch {
  kind: CatchKind;
  stack: ItemStack;
}

/** The chances of the three kinds, before Luck of the Sea (the original's): a treasure only in open water. */
export const CATCH_CHANCE = { junk: 0.1, treasure: 0.05 } as const;

const FISH: readonly [number, number][] = [
  [I.RAW_COD, 60],
  [I.RAW_SALMON, 25],
  [I.PUFFERFISH, 13],
  [I.TROPICAL_FISH, 2],
];

type Junk = (rand: () => number) => ItemStack;
const damaged = (id: number, rand: () => number, most: number): ItemStack => {
  const s = makeStack(id, 1);
  s.damage = Math.floor(rand() * getItem(id).durability * most);
  return s;
};
const JUNK: readonly [Junk, number][] = [
  [() => makeStack(B.LILY_PAD, 1), 17],
  [() => makeStack(I.BOWL, 1), 10],
  [(r) => damaged(I.FISHING_ROD, r, 0.9), 2],
  [() => makeStack(I.LEATHER, 1), 10],
  [(r) => damaged(armorId(3, 'leather'), r, 0.9), 10],
  [() => makeStack(I.ROTTEN_FLESH, 1), 10],
  [() => makeStack(I.STICK, 1), 5],
  [() => makeStack(I.STRING, 1), 5],
  [() => makeStack(I.BONE, 1), 10],
  [() => makeStack(I.INK_SAC, 10), 1],
];

const enchanted = (id: number, rand: () => number, damage = 0): ItemStack => {
  const s = makeStack(id, 1);
  s.damage = damage;
  const list = rollEnchants(id, 30, rand);
  return list.length > 0 ? withEnchants(s, list) : s;
};
const TREASURE: readonly Junk[] = [
  (r) => enchanted(I.BOW, r, Math.floor(r() * getItem(I.BOW).durability * 0.25)),
  (r) => {
    const book = withEnchants(makeStack(I.BOOK, 1), rollEnchants(I.BOOK, 30, r));
    return book.id === I.ENCHANTED_BOOK ? book : randomEnchantedBook(r);
  },
  (r) => enchanted(I.FISHING_ROD, r, Math.floor(r() * FISHING_ROD_DURABILITY * 0.25)),
  (r) => makeStack(I.EMERALD, 2 + Math.floor(r() * 3)),
];

function pick<T>(list: readonly [T, number][], rand: () => number): T {
  let total = 0;
  for (const [, w] of list) total += w;
  let at = rand() * total;
  for (const [v, w] of list) {
    at -= w;
    if (at < 0) return v;
  }
  return list[list.length - 1][0];
}

/** The chances of fish, junk and treasure with a level of Luck of the Sea, in open water or not. */
export function catchChances(luck: number, open: boolean): { fish: number; junk: number; treasure: number } {
  const treasure = open ? Math.min(0.5, CATCH_CHANCE.treasure + 0.01 * luck) : 0;
  const junk = Math.max(0, CATCH_CHANCE.junk - 0.02 * luck);
  return { fish: 1 - junk - treasure, junk, treasure };
}

/** What a bite brings up. */
export function rollCatch(rand: () => number, luck = 0, open = false): Catch {
  const c = catchChances(luck, open);
  const r = rand();
  if (r < c.treasure) return { kind: 'treasure', stack: TREASURE[Math.floor(rand() * TREASURE.length)](rand) };
  if (r < c.treasure + c.junk) return { kind: 'junk', stack: pick(JUNK, rand)(rand) };
  return { kind: 'fish', stack: makeStack(pick(FISH, rand), 1) };
}

/** The levels of Lure and Luck of the Sea on a rod. */
export function rodEnchants(rod: ItemStack | null): { lure: number; luck: number } {
  return { lure: levelOf(rod, ENCH.LURE), luck: levelOf(rod, ENCH.LUCK_OF_THE_SEA) };
}

/** Experience a catch is worth (1 to 6, as in the original). */
export function catchXp(rand: () => number): number {
  return 1 + Math.floor(rand() * 6);
}

/** Wear a rod takes: a fish, a bit of junk or a treasure 1; a creature pulled in 3. */
export const ROD_WEAR = { catch: 1, mob: 3 } as const;

/** Is this a fishing rod? */
export const isFishingRod = (id: number | undefined): boolean => id !== undefined && id > 0 && getItem(id).use === 'fishing_rod';
