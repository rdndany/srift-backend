import { B, BLOCKS, BLOCK_COUNT, IS_SOLID, isMetalFitting } from './blocks';

/**
 * Flowing water and lava.
 *
 * A fluid cell is one of a family of block ids, one per "level": level 0 is a source, 1..max are
 * flowing cells that get thinner the further they are from a source, and level 8 ("falling") is
 * fluid dropping straight down. The simulation is a set of scheduled cell updates (a cell looks at
 * its neighbours, settles on a level, then spreads), so the water of a bucket runs down a hill,
 * pools, and dries up again when the source is taken away, and water meeting lava makes stone.
 */

export const FLUID_NONE = 0;
export const FLUID_WATER = 1;
export const FLUID_LAVA = 2;

/** Level of water or lava that is falling. */
export const FALL = 8;

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

export const MAX_FLOW: Record<number, number> = { [FLUID_WATER]: 7, [FLUID_LAVA]: 3 };
/** Seconds between a fluid cell's updates: water is quick, lava is sluggish. */
const DELAY: Record<number, number> = { [FLUID_WATER]: 0.25, [FLUID_LAVA]: 1.2 };
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

/** Height of a fluid's surface within its cell, in sixteenths (16 = full block). */
export function fluidSurface(id: number): number {
  const level = FLUID_LEVEL[id];
  if (level === FALL) return 16;
  return FLUID_KIND[id] === FLUID_LAVA ? [14, 11, 8, 5][level] : [14, 12, 11, 9, 7, 5, 3, 2][level];
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
}

const HORIZONTAL: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const NEIGHBOURS: [number, number, number][] = [
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
  }

  private schedule(x: number, y: number, z: number): void {
    const kind = FLUID_KIND[this.host.getBlock(x, y, z)];
    if (kind === FLUID_NONE) return;
    const k = keyOf(x, y, z);
    if (!this.due.has(k)) this.due.set(k, { x, y, z, at: this.clock + DELAY[kind] });
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
      this.update(DELAY[FLUID_LAVA]);
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

    // Water and lava cannot share a corner: a lava source turns to obsidian, flowing lava to cobblestone.
    if (kind === FLUID_LAVA && this.touchesWater(x, y, z)) {
      host.setBlock(x, y, z, level === 0 ? B.OBSIDIAN : B.COBBLE);
      host.hiss(x, y, z);
      this.notify(x, y, z);
      return;
    }

    if (level !== 0) {
      const want = this.desiredLevel(x, y, z, kind);
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

    // Fall first; only fluid that has landed (or is held up by fluid) spreads sideways.
    if (this.canFlowInto(x, y - 1, z, kind, FALL)) {
      this.flowInto(x, y - 1, z, kind, FALL);
      return;
    }
    // Held up by its own fluid (the next cell down is already wet): it feeds that one instead of spreading.
    // Sources always spread, as in the original.
    if (level !== 0 && FLUID_KIND[host.getBlock(x, y - 1, z)] === kind) return;
    const next = level === FALL ? 1 : level + 1;
    if (next > MAX_FLOW[kind]) return;
    for (const [dx, dz] of HORIZONTAL) {
      if (this.canFlowInto(x + dx, y, z + dz, kind, next)) this.flowInto(x + dx, y, z + dz, kind, next);
    }
  }

  private touchesWater(x: number, y: number, z: number): boolean {
    const host = this.host;
    if (FLUID_KIND[host.getBlock(x, y + 1, z)] === FLUID_WATER) return true;
    for (const [dx, dz] of HORIZONTAL) if (FLUID_KIND[host.getBlock(x + dx, y, z + dz)] === FLUID_WATER) return true;
    return false;
  }

  /** The level this flowing cell should have, or -1 when nothing feeds it any more. */
  private desiredLevel(x: number, y: number, z: number, kind: number): number {
    const host = this.host;
    if (FLUID_KIND[host.getBlock(x, y + 1, z)] === kind) return FALL;
    let best = 99;
    let sources = 0;
    for (const [dx, dz] of HORIZONTAL) {
      const nid = host.getBlock(x + dx, y, z + dz);
      if (FLUID_KIND[nid] !== kind) continue;
      const nl = FLUID_LEVEL[nid];
      if (nl === 0) sources++;
      if (nl === FALL) {
        // Falling fluid feeds its sides only once it has landed.
        if (IS_SOLID[host.getBlock(x + dx, y - 1, z + dz)]) best = Math.min(best, 1);
        continue;
      }
      best = Math.min(best, nl + 1);
    }
    if (kind === FLUID_WATER && sources >= 2) {
      const below = host.getBlock(x, y - 1, z);
      if (IS_SOLID[below] || (FLUID_KIND[below] === FLUID_WATER && FLUID_LEVEL[below] === 0)) return 0;
    }
    return best > MAX_FLOW[kind] ? -1 : best;
  }

  /** Can fluid of `kind` arriving at `level` take this cell over? */
  private canFlowInto(x: number, y: number, z: number, kind: number, level: number): boolean {
    if (this.host.isProtected?.(x, y, z)) return false;
    const id = this.host.getBlock(x, y, z);
    if (washable(id)) return true;
    const k = FLUID_KIND[id];
    if (k === FLUID_NONE) return false;
    if (k === kind) {
      const cur = FLUID_LEVEL[id];
      if (cur === 0 || cur === FALL) return false;
      return level === FALL || cur > level;
    }
    // Lava running into water leaves stone; water meeting lava is handled by the lava cell.
    return kind === FLUID_LAVA;
  }

  private flowInto(x: number, y: number, z: number, kind: number, level: number): void {
    const host = this.host;
    const id = host.getBlock(x, y, z);
    if (id !== B.AIR && FLUID_KIND[id] === FLUID_NONE) host.washAway(x, y, z, id);
    if (FLUID_KIND[id] !== FLUID_NONE && FLUID_KIND[id] !== kind) {
      host.setBlock(x, y, z, B.STONE);
      host.hiss(x, y, z);
    } else {
      host.setBlock(x, y, z, fluidId(kind, level));
    }
    this.notify(x, y, z);
  }
}
