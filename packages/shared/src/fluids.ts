import { B, BLOCKS, BLOCK_COUNT, IS_SOLID, isMetalFitting } from './blocks';

/**
 * Flowing water and lava, the way Minecraft does it.
 *
 * The sea, a river, a cave pool and a bucket are the same water. Digging the ocean floor opens a
 * cave, and the water already there pours in; there is no second kind of water for underground.
 *
 * A source holds eight ninths of a block. Each block it travels, water loses one ninth and lava
 * two, so water reaches seven blocks and lava three. A cell with water above it is a fall: full,
 * and it drops straight down. It only spreads sideways once it has landed, unless three sources
 * stand beside the block that is pouring (the lip of a wide pool). On the ground, each side is
 * scored by how soon the water could fall again, up to four blocks for water and two for lava.
 * The nearest drop wins, and a flat floor with no drop lets the water go every way. Two sources
 * with a solid floor, or another source, under the gap make a third source.
 *
 * A cell holds one block id. Level 0 is a source (WATER, LAVA). Levels 1–7 are flowing water,
 * thinner as the number rises (WATER_1 … WATER_7). Level 8 is a fall (WATER_FALL), a full column
 * dropping until it lands. Lava only flows to level 3. A bucket picks up a source and places a
 * source; flowing water is not a source, so a bucket leaves it.
 *
 * The current in a cell points toward lower fluid and toward a hole beside it (`fluidCurrent`).
 * Bodies and dropped items add that vector to their motion. Still water in a pool has no current.
 *
 * A fence, stair, slab, gate, pane, wall or trapdoor can share a cell with a water source
 * (`isWaterloggable`). Chunks store one id per cell and ids only use 0–4095 of the 16-bit word,
 * so the spare high bit (0x8000) is the place to mark "this shape also holds a source". Reads
 * that mask the bit still see the fence; the fluid sim treats the cell as a source. Until that
 * bit is masked at every raw chunk read, those shapes stay solid and water flows around them.
 */

export const FLUID_NONE = 0;
export const FLUID_WATER = 1;
export const FLUID_LAVA = 2;

/** Level of water or lava that is falling. */
export const FALL = 8;

/** No drop found within the search. Far enough that every side ties, and the fluid goes all ways. */
const NO_DROP = 1000;

/** Ids by level (index 0..8); `-1` where a fluid has no such level. */
const WATER_IDS = [B.WATER, B.WATER_1, B.WATER_2, B.WATER_3, B.WATER_4, B.WATER_5, B.WATER_6, B.WATER_7, B.WATER_FALL];
const LAVA_IDS = [B.LAVA, B.LAVA_1, B.LAVA_2, B.LAVA_3, -1, -1, -1, -1, B.LAVA_FALL];

export const FLUID_KIND = new Uint8Array(BLOCK_COUNT);
export const FLUID_LEVEL = new Uint8Array(BLOCK_COUNT);
WATER_IDS.forEach((id, level) => {
  FLUID_KIND[id] = FLUID_WATER;
  FLUID_LEVEL[id] = level;
});
LAVA_IDS.forEach((id, level) => {
  if (id < 0) return;
  FLUID_KIND[id] = FLUID_LAVA;
  FLUID_LEVEL[id] = level;
});

/** How many blocks from a source the flow still exists. Lava's steps are two ninths each, so three blocks. */
export const MAX_FLOW: Record<number, number> = { [FLUID_WATER]: 7, [FLUID_LAVA]: 3 };
/** Ninths lost per block. Lava in the overworld loses two, which is why it only creeps three blocks. */
const DROP: Record<number, number> = { [FLUID_WATER]: 1, [FLUID_LAVA]: 2 };
/** How far to look for a place to fall. Water looks four blocks ahead, lava two. */
const SLOPE: Record<number, number> = { [FLUID_WATER]: 4, [FLUID_LAVA]: 2 };
/** Seconds between a fluid cell's updates: water is five ticks, lava thirty. */
const DELAY: Record<number, number> = { [FLUID_WATER]: 0.25, [FLUID_LAVA]: 1.5 };
/** Cell updates handled per `update`, so a flood cannot stall a frame. */
const MAX_PER_UPDATE = 700;

export function fluidId(kind: number, level: number): number {
  return (kind === FLUID_WATER ? WATER_IDS : LAVA_IDS)[level] ?? -1;
}

export function isFluid(id: number): boolean {
  return FLUID_KIND[id] !== FLUID_NONE;
}
export function isWaterId(id: number): boolean {
  return FLUID_KIND[id] === FLUID_WATER;
}
export function isLavaId(id: number): boolean {
  return FLUID_KIND[id] === FLUID_LAVA;
}
export function isFluidSource(id: number): boolean {
  return FLUID_KIND[id] !== FLUID_NONE && FLUID_LEVEL[id] === 0;
}

/**
 * How full the cell is, in ninths. A source and a fall are eight. Flowing water steps down by one
 * (level 1 is seven, level 7 is one). Flowing lava steps down by two (level 1 is six, level 3 is two).
 */
function amountOf(id: number): number {
  const level = FLUID_LEVEL[id];
  if (level === 0 || level === FALL) return 8;
  return FLUID_KIND[id] === FLUID_LAVA ? 8 - level * 2 : 8 - level;
}

/** Height of a fluid's surface in sixteenths. Minecraft uses ninths (a source is 8/9); this is that, to the nearest sixteenth. */
export function fluidSurface(id: number): number {
  const level = FLUID_LEVEL[id];
  if (level === FALL) return 16;
  if (FLUID_KIND[id] === FLUID_LAVA) return [14, 11, 7, 4][level] ?? 0;
  return [14, 12, 11, 9, 7, 5, 4, 2][level] ?? 0;
}

/** How full the surface is, from 0 to 1. A source and a fall are full. */
function flowHeight(id: number): number {
  if (FLUID_KIND[id] === FLUID_NONE) return 0;
  const level = FLUID_LEVEL[id];
  if (level === 0 || level === FALL) return 1;
  return amountOf(id) / 8;
}

/**
 * The current in one fluid cell. Points sideways toward thinner fluid and toward a drop beside
 * the cell, and straight down in a fall. A pool of sources returns a zero vector.
 */
export function fluidCurrent(
  getBlock: (x: number, y: number, z: number) => number,
  x: number,
  y: number,
  z: number,
): { x: number; y: number; z: number } {
  const id = getBlock(x, y, z);
  const kind = FLUID_KIND[id];
  if (kind === FLUID_NONE) return { x: 0, y: 0, z: 0 };
  const own = flowHeight(id);
  let sx = 0;
  let sz = 0;
  for (const [dx, dz] of HORIZONTAL) {
    const nid = getBlock(x + dx, y, z + dz);
    if (FLUID_KIND[nid] === kind) {
      sx += dx * (own - flowHeight(nid));
      sz += dz * (own - flowHeight(nid));
      continue;
    }
    if (IS_SOLID[nid]) continue;
    const below = getBlock(x + dx, y - 1, z + dz);
    if (FLUID_KIND[below] === kind) {
      const drop = own - (flowHeight(below) - 0.888);
      sx += dx * drop;
      sz += dz * drop;
    }
  }
  return { x: sx, y: FLUID_LEVEL[id] === FALL ? -1 : 0, z: sz };
}

/** Shapes that can share their cell with a water source. See the note at the top of this file. */
const WATERLOG_SHAPES = new Set<string>(['fence', 'stair', 'slab', 'gate', 'pane', 'wall', 'trapdoor']);

export function isWaterloggable(id: number): boolean {
  return WATERLOG_SHAPES.has(BLOCKS[id].shape);
}

export interface FluidHost {
  getBlock(x: number, y: number, z: number): number;
  setBlock(x: number, y: number, z: number, id: number): boolean;
  /** A plant, torch or other soft block is about to be washed away (drops, particles). */
  washAway(x: number, y: number, z: number, id: number): void;
  /** Water and lava met: a hiss of steam. */
  hiss(x: number, y: number, z: number): void;
  /** Cells fluid may never enter (a protected village, say). */
  isProtected?(x: number, y: number, z: number): boolean;
  /** Is a flow from the first cell into the second not allowed (it would run into land that is not the source's own)? */
  crossBlocked?(fx: number, fy: number, fz: number, tx: number, ty: number, tz: number): boolean;
}

const HORIZONTAL: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const NEIGHBOURS: readonly [number, number, number][] = [
  [0, 1, 0],
  [0, -1, 0],
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
];

const keyOf = (x: number, y: number, z: number): string => `${x},${y},${z}`;

/** Things water pushes aside and destroys: plants, torches, rails, webs, crops. */
function washable(id: number): boolean {
  if (id === B.AIR) return true;
  // Lanterns and chains are metal: the water flows round them.
  if (isMetalFitting(id)) return false;
  const d = BLOCKS[id];
  return !d.solid && !d.liquid;
}

export class FluidSim {
  private due = new Map<string, { x: number; y: number; z: number; at: number }>();
  private clock = 0;

  constructor(private readonly host: FluidHost) {}

  get pending(): number {
    return this.due.size;
  }

  /** Something changed at (x, y, z): every fluid cell touching it has to look again. */
  notify(x: number, y: number, z: number): void {
    this.schedule(x, y, z);
    for (const [dx, dy, dz] of NEIGHBOURS) this.schedule(x + dx, y + dy, z + dz);
    // A block broken under water would sit empty until the next flow tick. The water is already
    // against that cell, so it fills now. Further spreading still waits.
    this.fillNow(x, y, z);
  }

  /** True while a hole is being filled, so the water that lands there does not flood onward in the same moment. */
  private filling = false;

  /** An empty cell with water already on it takes that water at once. */
  private fillNow(x: number, y: number, z: number): void {
    if (this.filling) return;
    const id = this.host.getBlock(x, y, z);
    if (FLUID_KIND[id] !== FLUID_NONE || !washable(id)) return;
    if (!this.waterReaches(x, y, z)) return;
    this.filling = true;
    try {
      this.place(x, y, z, FLUID_WATER);
    } finally {
      this.filling = false;
    }
  }

  /** Water above falls in. Water beside flows in only when that neighbor is spreading sideways. */
  private waterReaches(x: number, y: number, z: number): boolean {
    const above = this.host.getBlock(x, y + 1, z);
    if (FLUID_KIND[above] === FLUID_WATER && this.canReceive(x, y, z, FLUID_WATER, x, y + 1, z)) return true;
    for (const [dx, dz] of HORIZONTAL) {
      const nx = x + dx;
      const nz = z + dz;
      const nid = this.host.getBlock(nx, y, nz);
      if (FLUID_KIND[nid] !== FLUID_WATER) continue;
      if (!this.canReceive(x, y, z, FLUID_WATER, nx, y, nz)) continue;
      if (this.poursSideways(nx, y, nz)) return true;
    }
    return false;
  }

  /** The same sideways rule as `spread`: a fall goes down, and a source on a lip only pushes out with three others. */
  private poursSideways(x: number, y: number, z: number): boolean {
    const id = this.host.getBlock(x, y, z);
    const level = FLUID_LEVEL[id];
    const budget = level === FALL ? 7 : (level === 0 ? 8 : amountOf(id)) - DROP[FLUID_WATER]!;
    if (budget <= 0) return false;
    const falls = !this.sameFluid(x, y - 1, z, FLUID_WATER) && this.canReceive(x, y - 1, z, FLUID_WATER, x, y, z);
    if (falls) return this.sourcesAround(x, y, z, FLUID_WATER) >= 3;
    return level === 0 || !this.isHole(x, y, z, FLUID_WATER);
  }

  private schedule(x: number, y: number, z: number): void {
    const kind = FLUID_KIND[this.host.getBlock(x, y, z)];
    if (kind === FLUID_NONE) return;
    const k = keyOf(x, y, z);
    if (!this.due.has(k)) this.due.set(k, { x, y, z, at: this.clock + DELAY[kind]! });
  }

  update(dt: number): void {
    if (this.due.size === 0) return;
    this.clock += dt;
    const ready: { x: number; y: number; z: number }[] = [];
    for (const [k, c] of this.due) {
      if (c.at > this.clock) continue;
      ready.push(c);
      this.due.delete(k);
      if (ready.length >= MAX_PER_UPDATE) break;
    }
    for (const c of ready) this.step(c.x, c.y, c.z);
  }

  /** Run every pending update to completion (tests). Returns how many rounds it took. */
  settle(maxRounds = 400): number {
    let rounds = 0;
    while (this.due.size > 0 && rounds < maxRounds) {
      this.update(DELAY[FLUID_LAVA]!);
      rounds++;
    }
    return rounds;
  }

  // ---- one cell -------------------------------------------------------------

  private step(x: number, y: number, z: number): void {
    const host = this.host;
    const id = host.getBlock(x, y, z);
    const kind = FLUID_KIND[id];
    if (kind === FLUID_NONE) return;
    let level = FLUID_LEVEL[id];

    // Water beside or above lava: a source becomes obsidian, a flow becomes cobblestone.
    if (kind === FLUID_LAVA && this.touchesWater(x, y, z)) {
      host.setBlock(x, y, z, level === 0 ? B.OBSIDIAN : B.COBBLE);
      host.hiss(x, y, z);
      this.notify(x, y, z);
      return;
    }

    // A source never changes. Everything else asks what its neighbours make it now.
    if (level !== 0) {
      const want = this.desired(x, y, z, kind);
      if (want < 0) {
        host.setBlock(x, y, z, B.AIR);
        this.notify(x, y, z);
        return;
      }
      if (want !== level) {
        host.setBlock(x, y, z, fluidId(kind, want));
        level = want;
        this.notify(x, y, z);
      }
    }

    // Lava on ice melts it. The meltwater touches the lava, so a source becomes obsidian and a flow becomes cobblestone.
    if (kind === FLUID_LAVA && this.meltIce(x, y - 1, z) && isWaterId(host.getBlock(x, y - 1, z))) {
      host.setBlock(x, y, z, level === 0 ? B.OBSIDIAN : B.COBBLE);
      host.hiss(x, y, z);
      this.notify(x, y, z);
      return;
    }

    this.spread(x, y, z, kind, level);
  }

  /**
   * The ice under a lava cell. It becomes water (the sea under it stays, and ice on solid ground melts into water).
   * Ice over open air is simply gone. Returns whether a block of ice was melted.
   */
  private meltIce(x: number, y: number, z: number): boolean {
    const host = this.host;
    if (host.getBlock(x, y, z) !== B.ICE) return false;
    const below = host.getBlock(x, y - 1, z);
    host.setBlock(x, y, z, below !== B.AIR ? B.WATER : B.AIR);
    this.notify(x, y, z);
    return true;
  }

  private touchesWater(x: number, y: number, z: number): boolean {
    const host = this.host;
    if (isWaterId(host.getBlock(x, y + 1, z))) return true;
    for (const [dx, dz] of HORIZONTAL) if (isWaterId(host.getBlock(x + dx, y, z + dz))) return true;
    return false;
  }

  /**
   * What this cell should hold: a source, a fall, a flowing level, or -1 for air.
   * Asked of flowing cells, and of every empty cell a flow is about to enter.
   */
  private desired(x: number, y: number, z: number, kind: number): number {
    const host = this.host;
    let best = 0;
    let sources = 0;
    for (const [dx, dz] of HORIZONTAL) {
      const nx = x + dx;
      const nz = z + dz;
      if (this.fenced(nx, y, nz, x, y, z)) continue;
      const nid = host.getBlock(nx, y, nz);
      if (FLUID_KIND[nid] !== kind) continue;
      if (FLUID_LEVEL[nid] === 0) sources++;
      const amount = amountOf(nid);
      if (amount > best) best = amount;
    }

    // Two sources and a floor: the gap becomes a source. Asked before the fall, so water overhead does not stop it.
    if (kind === FLUID_WATER && sources >= 2) {
      const below = host.getBlock(x, y - 1, z);
      const floor = IS_SOLID[below] === 1 || (isFluidSource(below) && FLUID_KIND[below] === FLUID_WATER && !this.fenced(x, y - 1, z, x, y, z));
      if (floor) return 0;
    }

    if (!this.fenced(x, y + 1, z, x, y, z) && FLUID_KIND[host.getBlock(x, y + 1, z)] === kind) return FALL;

    const next = best - DROP[kind]!;
    if (next <= 0) return -1;
    return kind === FLUID_LAVA ? (8 - next) / 2 : 8 - next;
  }

  /** Down first. Sideways only when the fluid has landed, or three sources are pouring with it. */
  private spread(x: number, y: number, z: number, kind: number, level: number): void {
    if (!this.sameFluid(x, y - 1, z, kind) && this.canReceive(x, y - 1, z, kind, x, y, z)) {
      this.place(x, y - 1, z, kind);
      if (this.sourcesAround(x, y, z, kind) >= 3) this.spreadSides(x, y, z, kind, level);
      return;
    }
    // A fall held up by more of itself waits. A source still spreads, and so does anything standing on solid ground.
    if (level === 0 || !this.isHole(x, y, z, kind)) this.spreadSides(x, y, z, kind, level);
  }

  /** The sides that lead to the nearest drop. On a flat floor every open side ties and all of them win. */
  private spreadSides(x: number, y: number, z: number, kind: number, level: number): void {
    const budget = level === FALL ? 7 : (level === 0 ? 8 : amountOf(this.host.getBlock(x, y, z))) - DROP[kind]!;
    if (budget <= 0) return;
    let best = NO_DROP;
    const chosen: [number, number][] = [];
    for (const [dx, dz] of HORIZONTAL) {
      const nx = x + dx;
      const nz = z + dz;
      if (!this.passable(nx, y, nz, kind, x, y, z)) continue;
      const replace = this.canReceive(nx, y, nz, kind, x, y, z);
      const dist = this.isHole(nx, y, nz, kind) ? 0 : this.slope(nx, y, nz, 1, -dx, -dz, kind);
      if (dist < best) {
        best = dist;
        chosen.length = 0;
      }
      // A side that is already this fluid still votes, and a nearer one clears the rest, but it is not overwritten.
      if (replace && dist === best) chosen.push([dx, dz]);
    }
    for (const [dx, dz] of chosen) this.place(x + dx, y, z + dz, kind);
  }

  /**
   * Steps from a candidate toward a drop, not counting the way we arrived. A drop one step away is
   * `dist`; nothing within the slope distance is `NO_DROP`.
   */
  private slope(x: number, y: number, z: number, dist: number, backX: number, backZ: number, kind: number): number {
    let best = NO_DROP;
    for (const [dx, dz] of HORIZONTAL) {
      if (dx === backX && dz === backZ) continue;
      const nx = x + dx;
      const nz = z + dz;
      if (!this.passable(nx, y, nz, kind, x, y, z)) continue;
      if (this.isHole(nx, y, nz, kind)) return dist;
      if (dist < SLOPE[kind]!) {
        const found = this.slope(nx, y, nz, dist + 1, -dx, -dz, kind);
        if (found < best) best = found;
      }
    }
    return best;
  }

  /** A cell the fluid can fall out of: the block below will take it, or is already this fluid. */
  private isHole(x: number, y: number, z: number, kind: number): boolean {
    if (this.fenced(x, y, z, x, y - 1, z)) return false;
    if (this.sameFluid(x, y - 1, z, kind)) return true;
    return this.canReceive(x, y - 1, z, kind, x, y, z);
  }

  /** Air and soft blocks. Lava may also fall onto water, which becomes stone. */
  private canReceive(x: number, y: number, z: number, kind: number, fx: number, fy: number, fz: number): boolean {
    if (this.blocked(fx, fy, fz, x, y, z)) return false;
    const id = this.host.getBlock(x, y, z);
    if (washable(id)) return true;
    return kind === FLUID_LAVA && isWaterId(id);
  }

  /** Somewhere a search may walk: open ground, or this fluid already flowing there. Sources are walls. */
  private passable(x: number, y: number, z: number, kind: number, fx: number, fy: number, fz: number): boolean {
    if (this.blocked(fx, fy, fz, x, y, z)) return false;
    const id = this.host.getBlock(x, y, z);
    if (FLUID_KIND[id] === kind) return FLUID_LEVEL[id] !== 0;
    return washable(id);
  }

  private place(x: number, y: number, z: number, kind: number): void {
    const host = this.host;
    const id = host.getBlock(x, y, z);
    // Lava falling onto water leaves stone. Water into lava is the lava cell's own business.
    if (kind === FLUID_LAVA && isWaterId(id)) {
      host.setBlock(x, y, z, B.STONE);
      host.hiss(x, y, z);
      this.notify(x, y, z);
      return;
    }
    const want = this.desired(x, y, z, kind);
    if (want < 0) return;
    if (id !== B.AIR && FLUID_KIND[id] === FLUID_NONE) host.washAway(x, y, z, id);
    const next = fluidId(kind, want);
    if (id === next) return;
    host.setBlock(x, y, z, next);
    this.notify(x, y, z);
  }

  private sourcesAround(x: number, y: number, z: number, kind: number): number {
    let n = 0;
    for (const [dx, dz] of HORIZONTAL) {
      const nx = x + dx;
      const nz = z + dz;
      if (this.fenced(nx, y, nz, x, y, z)) continue;
      const id = this.host.getBlock(nx, y, nz);
      if (FLUID_KIND[id] === kind && FLUID_LEVEL[id] === 0) n++;
    }
    return n;
  }

  private sameFluid(x: number, y: number, z: number, kind: number): boolean {
    return FLUID_KIND[this.host.getBlock(x, y, z)] === kind;
  }

  /** The flow is not allowed to arrive here: the cell is protected, or it belongs to someone else's land. */
  private blocked(fx: number, fy: number, fz: number, tx: number, ty: number, tz: number): boolean {
    if (this.host.isProtected?.(tx, ty, tz)) return true;
    return this.fenced(fx, fy, fz, tx, ty, tz);
  }

  private fenced(fx: number, fy: number, fz: number, tx: number, ty: number, tz: number): boolean {
    return this.host.crossBlocked?.(fx, fy, fz, tx, ty, tz) ?? false;
  }
}
