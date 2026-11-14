import { B, BLOCK_COUNT, BUILD_MATERIALS, DYE_COUNT, IS_SOLID, LEAF_BLOCKS, LOG_BLOCKS, slabId, stairId, woolId } from './blocks';

/**
 * Fire, with the numbers of the original game.
 *
 * Fire is a block (`B.FIRE`). It lives while it has something to burn: every block has an "encouragement"
 * (how readily fire spreads to the air next to it) and a "burn" chance (how readily it is eaten when fire
 * touches it). Wood, leaves, wool, plants and books burn; stone, dirt and sand do not, so a fire lit on
 * bare ground sputters out after a few seconds, and one lit in a forest runs through it.
 *
 * Every fire is looked at every one and a half to two seconds. It ages; it may burn up the blocks around
 * it (turning them into more fire, or into nothing); it may jump into nearby air (further and less often
 * as it goes up, the way flames climb); and it dies when it has no fuel, when it has no floor to stand
 * on, or when rain falls on it. Water washes it away (see fluids.ts).
 */

/** Chance weights per block id: how readily fire jumps into air next to the block. */
export const IGNITE_ODDS = new Uint8Array(BLOCK_COUNT);
/** How readily fire eats the block itself. */
export const BURN_ODDS = new Uint8Array(BLOCK_COUNT);

function flammable(ids: readonly number[], ignite: number, burn: number): void {
  for (const id of ids) {
    IGNITE_ODDS[id] = ignite;
    BURN_ODDS[id] = burn;
  }
}

const GATES = [0, 1, 2, 3, 4, 5].map((i) => B.GATE_BASE + i);
const WOODEN = BUILD_MATERIALS.findIndex((m) => m.block === B.PLANKS);
const WOODEN_SLABS = [slabId(WOODEN, false), slabId(WOODEN, true)];
const WOODEN_STAIRS = [false, true].flatMap((top) => [0, 1, 2, 3].map((d) => stairId(WOODEN, top, d)));
const WOOLS = Array.from({ length: DYE_COUNT }, (_, c) => woolId(c));

flammable([B.PLANKS, B.FENCE, ...WOODEN_SLABS, ...WOODEN_STAIRS, ...GATES], 5, 20);
flammable(LOG_BLOCKS, 5, 5);
flammable(LEAF_BLOCKS, 30, 60);
flammable(WOOLS, 30, 60);
flammable(
  [
    B.TALL_GRASS, B.ROSE, B.DANDELION, B.DEAD_BUSH, B.SAPLING, B.BIRCH_SAPLING, B.SPRUCE_SAPLING, B.ACACIA_SAPLING, B.JUNGLE_SAPLING, B.DARK_OAK_SAPLING, B.CHERRY_SAPLING,
    B.FERN, B.TULIP_RED, B.TULIP_ORANGE, B.TULIP_WHITE, B.TULIP_PINK, B.OXEYE_DAISY, B.CORNFLOWER, B.ALLIUM, B.AZURE_BLUET, B.BLUE_ORCHID, B.SUGAR_CANE, B.PINK_PETALS,
  ],
  60,
  100,
);
flammable([B.BOOKSHELF], 30, 20);
// Fire sets TNT off (the realm turns it into a lit fuse rather than ash).
flammable([B.TNT], 15, 100);

/** Can fire eat or climb this block? */
export const isFlammable = (id: number): boolean => IGNITE_ODDS[id] > 0;

const NEIGHBOURS: readonly (readonly [number, number, number])[] = [
  [0, 1, 0],
  [0, -1, 0],
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/** Something to burn next to a cell (any of its six sides). */
export function hasFuelAround(get: (x: number, y: number, z: number) => number, x: number, y: number, z: number): boolean {
  for (const [dx, dy, dz] of NEIGHBOURS) if (IGNITE_ODDS[get(x + dx, y + dy, z + dz)] > 0) return true;
  return false;
}

/** Can a fire stand here? It needs a floor or something that burns beside it (the same rule keeps a placed one from floating). */
export function canFireStay(get: (x: number, y: number, z: number) => number, x: number, y: number, z: number): boolean {
  return IS_SOLID[get(x, y - 1, z)] === 1 || hasFuelAround(get, x, y, z);
}

export interface FireHost {
  getBlock(x: number, y: number, z: number): number;
  setBlock(x: number, y: number, z: number, id: number): boolean;
  /** A block was burnt away: remove it with the particles, and let whatever hung on it pop off. */
  consume(x: number, y: number, z: number): void;
  /** Is rain (or snow) falling on this cell right now? */
  rainsOn(x: number, y: number, z: number): boolean;
  /** Fire only burns near a player (everywhere else the world stands still). */
  active(x: number, y: number, z: number): boolean;
  sound(x: number, y: number, z: number, kind: 'crackle' | 'hiss'): void;
  rand(): number;
}

interface Fire {
  x: number;
  y: number;
  z: number;
  age: number;
  at: number;
}

const MAX_AGE = 15;
/** Fires handled per `update`, so a burning forest cannot stall a frame. */
const MAX_PER_UPDATE = 250;
/** Difficulty term of the original's spread odds (normal = 2, times 7). */
const DIFFICULTY = 14;

const keyOf = (x: number, y: number, z: number): string => `${x},${y},${z}`;

export class FireSim {
  private readonly fires = new Map<string, Fire>();
  private clock = 0;

  constructor(private readonly host: FireHost) {}

  /** How many fires are burning (and remembered). */
  get count(): number {
    return this.fires.size;
  }

  /** Light a fire in a cell. False when it cannot be there (occupied, nothing to stand on or to burn). */
  ignite(x: number, y: number, z: number, age = 0): boolean {
    const h = this.host;
    const there = h.getBlock(x, y, z);
    if (there !== B.AIR && there !== B.FIRE) return false;
    if (there === B.FIRE) {
      this.adopt(x, y, z, age);
      return true;
    }
    if (!canFireStay((a, b, c) => h.getBlock(a, b, c), x, y, z)) return false;
    if (!h.setBlock(x, y, z, B.FIRE)) return false;
    this.adopt(x, y, z, age);
    return true;
  }

  /** Remember a fire that is already in the world (a loaded chunk, or one just placed). */
  adopt(x: number, y: number, z: number, age = 0): void {
    const k = keyOf(x, y, z);
    if (this.fires.has(k)) return;
    this.fires.set(k, { x, y, z, age, at: this.clock + this.delay() });
  }

  /** Put a fire out (a player punched it). */
  extinguish(x: number, y: number, z: number): void {
    this.fires.delete(keyOf(x, y, z));
  }

  private delay(): number {
    return 1.5 + this.host.rand() * 0.5;
  }

  update(dt: number): void {
    if (this.fires.size === 0) return;
    this.clock += dt;
    const due: Fire[] = [];
    for (const f of this.fires.values()) {
      if (f.at > this.clock) continue;
      due.push(f);
      if (due.length >= MAX_PER_UPDATE) break;
    }
    for (const f of due) this.step(f);
  }

  /** Run the simulation for `seconds` (tests). */
  run(seconds: number, step = 0.25): void {
    for (let t = 0; t < seconds; t += step) this.update(step);
  }

  // ---- one fire --------------------------------------------------------------

  private die(f: Fire, kind?: 'hiss'): void {
    this.fires.delete(keyOf(f.x, f.y, f.z));
    this.host.setBlock(f.x, f.y, f.z, B.AIR);
    if (kind) this.host.sound(f.x, f.y, f.z, kind);
  }

  private step(f: Fire): void {
    const h = this.host;
    const { x, y, z } = f;
    if (h.getBlock(x, y, z) !== B.FIRE) {
      this.fires.delete(keyOf(x, y, z));
      return;
    }
    if (!h.active(x, y, z)) {
      f.at = this.clock + 4;
      return;
    }
    const get = (a: number, b: number, c: number) => h.getBlock(a, b, c);
    f.at = this.clock + this.delay();
    if (h.rainsOn(x, y, z)) return this.die(f, 'hiss');
    if (!canFireStay(get, x, y, z)) return this.die(f);
    if (f.age < MAX_AGE && h.rand() < 1 / 3) f.age++;
    if (h.rand() < 0.07) h.sound(x, y, z, 'crackle');

    const below = get(x, y - 1, z);
    if (!hasFuelAround(get, x, y, z)) {
      // Bare ground: a few seconds of flame, and it is gone.
      if (IS_SOLID[below] !== 1 || f.age > 3) this.die(f);
      return;
    }
    if (f.age === MAX_AGE && h.rand() < 0.25 && BURN_ODDS[below] === 0) return this.die(f);

    // The blocks touching it may burn away (or catch).
    this.burnOut(x + 1, y, z, 300, f.age);
    this.burnOut(x - 1, y, z, 300, f.age);
    this.burnOut(x, y - 1, z, 250, f.age);
    this.burnOut(x, y + 1, z, 250, f.age);
    this.burnOut(x, y, z + 1, 300, f.age);
    this.burnOut(x, y, z - 1, 300, f.age);

    // Flames jump into the air around it, less readily the higher they have to climb.
    for (let dy = -1; dy <= 4; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          const reach = 100 + (dy > 1 ? (dy - 1) * 100 : 0);
          const tx = x + dx;
          const ty = y + dy;
          const tz = z + dz;
          const odds = this.igniteOdds(tx, ty, tz);
          if (odds <= 0) continue;
          const chance = Math.floor((odds + 40 + DIFFICULTY) / (f.age + 30));
          if (chance > 0 && Math.floor(h.rand() * reach) <= chance && !h.rainsOn(tx, ty, tz)) {
            if (canFireStay(get, tx, ty, tz) && h.setBlock(tx, ty, tz, B.FIRE)) this.adopt(tx, ty, tz, Math.min(MAX_AGE, f.age + Math.floor((h.rand() * 5) / 4)));
          }
        }
      }
    }
  }

  /** The strongest "encouragement" of what surrounds an empty cell (0 when it is not empty). */
  private igniteOdds(x: number, y: number, z: number): number {
    const h = this.host;
    if (h.getBlock(x, y, z) !== B.AIR) return 0;
    let odds = 0;
    for (const [dx, dy, dz] of NEIGHBOURS) odds = Math.max(odds, IGNITE_ODDS[h.getBlock(x + dx, y + dy, z + dz)]);
    return odds;
  }

  private burnOut(x: number, y: number, z: number, chance: number, age: number): void {
    const h = this.host;
    const id = h.getBlock(x, y, z);
    const odds = BURN_ODDS[id];
    if (odds <= 0 || h.rand() * chance >= odds) return;
    if (h.rand() * (age + 10) < 5 && !h.rainsOn(x, y, z)) {
      // It catches fire where it stands.
      const next = Math.min(MAX_AGE, age + Math.floor((h.rand() * 5) / 4));
      h.consume(x, y, z);
      if (h.setBlock(x, y, z, B.FIRE)) this.adopt(x, y, z, next);
    } else {
      h.consume(x, y, z);
    }
  }
}
