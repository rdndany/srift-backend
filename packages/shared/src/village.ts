import { B } from './blocks';
import { CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL, blockIndex } from './chunk';
import { hash2, mulberry32 } from './noise';
import { Lot, farm, house, lampPost, stall, styleFor, tower, well, type HouseKind, type StyleName } from './villageBuilders';

/**
 * Villages: a well in a paved plaza, four roads, and houses, farms, a smithy, market stalls and a
 * watchtower along them, in the materials of the local biome (see `villageBuilders.ts`).
 *
 * Like everything in world generation this is a pure function of the seed. The world is cut into
 * square regions; each region may hold one village at a hashed spot. A chunk asks the (up to
 * nine) regions near it for their plans and writes only the cells that fall inside itself, so
 * villages that cross chunk borders come out whole whichever chunk is generated first.
 *
 * There are no villagers and no loot: the buildings are for the player to use and to copy.
 */

/** Side of a region; each holds at most one village. */
export const VILLAGE_REGION = 96;
/** The village centre keeps this far from its region's edge, so neighbours never overlap. */
const MARGIN = 30;
/** Nothing is built farther than this from the centre. */
export const VILLAGE_EXTENT = 28;
/** Share of regions that try to hold a village (some are then rejected for bad terrain). */
const CHANCE = 0.6;
/** How far the ground may vary across the village for it to be a site. */
const MAX_SLOPE = 5;
/** The ground is eased back into the landscape over this many blocks around everything levelled. */
const SKIRT = 5;

export interface VillageSite {
  /** Centre (the well). */
  x: number;
  z: number;
  /** Height of the ground everything is levelled to. */
  groundY: number;
  biome: number;
}

export interface VillageTerrain {
  columnAt(x: number, z: number): { height: number; biome: number };
}

export interface VillageOptions {
  seed: number;
  /** Biome ids a village may stand in. */
  biomes: readonly number[];
  /** Block ids for the ground of a biome. */
  ground(biome: number): { top: number; sub: number };
  /** How the buildings of a biome are made (default: oak and cobblestone). */
  style?(biome: number): StyleName;
}

interface ColumnCell {
  x: number;
  z: number;
  road: boolean;
  /** The block of the ground surface when it is not the biome's (paving, paths). */
  block?: number;
  /** Ground height of a skirt cell (the village's own height when absent). */
  g?: number;
}

/** A place where a villager lives: a free cell on the floor of a building (y is the standing height). */
export interface VillageHome {
  x: number;
  y: number;
  z: number;
  kind: 'small' | 'large' | 'smithy' | 'farm' | 'tower' | 'stall';
}

interface Plan {
  site: VillageSite;
  columns: Map<string, ColumnCell[]>;
  /** Flat [x, y, z, id, x, y, z, id, ...] per chunk, in the order they must be written. */
  voxels: Map<string, number[]>;
  houses: number;
  farms: number;
  smithies: number;
  towers: number;
  stalls: number;
  /** Where the villagers live, in the order the buildings were made. */
  homes: VillageHome[];
  /** Chests ("x,y,z") that come with the village and roll the village loot table. */
  chests: Set<string>;
}

const DIRS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

type Kind = HouseKind | 'farm' | 'tower' | 'stall';
const SIZE: Record<Kind, [number, number]> = {
  small: [5, 5],
  large: [7, 6],
  farm: [9, 7],
  smithy: [7, 5],
  tower: [5, 5],
  stall: [5, 3],
};
/** Distances along a road at which buildings are tried. */
const ALONG = [9, 16, 23];
const dirIndex = (vx: number, vz: number): number => (vx !== 0 ? (vx > 0 ? 0 : 1) : vz > 0 ? 2 : 3);

interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const overlaps = (a: Rect, b: Rect): boolean => a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1;
const chunkKey = (x: number, z: number): string => `${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`;

export class VillageGenerator {
  private sites = new Map<string, VillageSite | null>();
  private plans = new Map<string, Plan>();

  constructor(
    private terrain: VillageTerrain,
    private opts: VillageOptions,
  ) {}

  /** The village of one region, or null when the region has none. */
  siteInRegion(rx: number, rz: number): VillageSite | null {
    const key = `${rx},${rz}`;
    const cached = this.sites.get(key);
    if (cached !== undefined) return cached;
    const site = this.findSite(rx, rz);
    this.sites.set(key, site);
    return site;
  }

  private findSite(rx: number, rz: number): VillageSite | null {
    const seed = this.opts.seed;
    if (hash2(seed + 600, rx, rz) >= CHANCE) return null;
    const span = VILLAGE_REGION - 2 * MARGIN;
    const x = rx * VILLAGE_REGION + MARGIN + Math.floor(hash2(seed + 601, rx, rz) * span);
    const z = rz * VILLAGE_REGION + MARGIN + Math.floor(hash2(seed + 602, rx, rz) * span);

    const heights: number[] = [];
    for (const dz of [-14, 0, 14]) {
      for (const dx of [-14, 0, 14]) {
        const col = this.terrain.columnAt(x + dx, z + dz);
        if (!this.opts.biomes.includes(col.biome) || col.height <= SEA_LEVEL + 1) return null;
        heights.push(col.height);
      }
    }
    const sorted = [...heights].sort((a, b) => a - b);
    if (sorted[sorted.length - 1] - sorted[0] > MAX_SLOPE) return null;
    const centre = this.terrain.columnAt(x, z);
    return { x, z, groundY: sorted[4], biome: centre.biome };
  }

  /** Every village whose region touches the box (inclusive block coordinates). */
  sitesNear(minX: number, minZ: number, maxX: number, maxZ: number): VillageSite[] {
    const out: VillageSite[] = [];
    const r0x = Math.floor(minX / VILLAGE_REGION);
    const r1x = Math.floor(maxX / VILLAGE_REGION);
    const r0z = Math.floor(minZ / VILLAGE_REGION);
    const r1z = Math.floor(maxZ / VILLAGE_REGION);
    for (let rz = r0z; rz <= r1z; rz++) {
      for (let rx = r0x; rx <= r1x; rx++) {
        const s = this.siteInRegion(rx, rz);
        if (s) out.push(s);
      }
    }
    return out;
  }

  /** The closest village to a point, searching outwards a few rings of regions. */
  nearest(x: number, z: number, rings = 8): VillageSite | null {
    const rx = Math.floor(x / VILLAGE_REGION);
    const rz = Math.floor(z / VILLAGE_REGION);
    let best: VillageSite | null = null;
    let bestD = Infinity;
    for (let ring = 0; ring <= rings; ring++) {
      // Anything in a farther ring is at least (ring - 1) regions away: stop once we have better.
      if (best && Math.max(0, ring - 1) * VILLAGE_REGION > Math.sqrt(bestD)) break;
      for (let dz = -ring; dz <= ring; dz++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const s = this.siteInRegion(rx + dx, rz + dz);
          if (!s) continue;
          const d = (s.x - x) ** 2 + (s.z - z) ** 2;
          if (d < bestD) {
            bestD = d;
            best = s;
          }
        }
      }
    }
    return best;
  }

  /** Is there a village chest here? Its contents are rolled from the village loot table. */
  hasChestAt(x: number, y: number, z: number): boolean {
    for (const site of this.sitesNear(x - 1, z - 1, x + 1, z + 1)) {
      if (this.planFor(site).chests.has(`${x},${y},${z}`)) return true;
    }
    // A village's region need not contain the whole village, so also try the sites whose extent reaches here.
    for (const site of this.sitesNear(x - VILLAGE_EXTENT, z - VILLAGE_EXTENT, x + VILLAGE_EXTENT, z + VILLAGE_EXTENT)) {
      if (this.planFor(site).chests.has(`${x},${y},${z}`)) return true;
    }
    return false;
  }

  /** The places where a village's villagers live (a house or two per building, see VillageHome). */
  homesOf(site: VillageSite): readonly VillageHome[] {
    return this.planFor(site).homes;
  }

  /** What a village contains (for tests and the debug hook). */
  describe(site: VillageSite): { houses: number; farms: number; smithies: number; towers: number; stalls: number } {
    const p = this.planFor(site);
    return { houses: p.houses, farms: p.farms, smithies: p.smithies, towers: p.towers, stalls: p.stalls };
  }

  /** Write the parts of every nearby village that lie inside chunk (cx, cz). */
  apply(blocks: Uint16Array, cx: number, cz: number): void {
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    const reach = VILLAGE_EXTENT + SKIRT + 1;
    const sites = this.sitesNear(ox - reach, oz - reach, ox + CHUNK_SIZE - 1 + reach, oz + CHUNK_SIZE - 1 + reach);
    const key = `${cx},${cz}`;
    for (const site of sites) {
      const plan = this.planFor(site);
      const ground = this.opts.ground(site.biome);
      for (const c of plan.columns.get(key) ?? []) {
        const g = c.g ?? site.groundY;
        const lx = c.x - ox;
        const lz = c.z - oz;
        const natural = this.terrain.columnAt(c.x, c.z).height;
        const sub = ground.sub;
        // Fill or cut down to the village's ground level, then clear everything above it.
        for (let y = Math.max(1, Math.min(natural, g - 3) + 1); y < g; y++) blocks[blockIndex(lx, y, lz)] = sub;
        blocks[blockIndex(lx, g, lz)] = c.block ?? (c.road ? B.GRAVEL : ground.top);
        const top = Math.min(WORLD_HEIGHT - 1, Math.max(natural, g) + 14);
        for (let y = g + 1; y <= top; y++) blocks[blockIndex(lx, y, lz)] = B.AIR;
      }
      const v = plan.voxels.get(key);
      if (v) {
        for (let i = 0; i < v.length; i += 4) {
          if (v[i + 1] < 1 || v[i + 1] >= WORLD_HEIGHT) continue;
          blocks[blockIndex(v[i] - ox, v[i + 1], v[i + 2] - oz)] = v[i + 3];
        }
      }
    }
  }

  private planFor(site: VillageSite): Plan {
    const key = `${site.x},${site.z}`;
    let plan = this.plans.get(key);
    if (!plan) {
      plan = this.buildPlan(site);
      this.plans.set(key, plan);
    }
    return plan;
  }

  private buildPlan(site: VillageSite): Plan {
    const rand = mulberry32(Math.floor(hash2(this.opts.seed + 603, site.x, site.z) * 2147483647));
    const g = site.groundY;
    const cols = new Map<string, ColumnCell>();
    const flat: number[] = [];
    const plan: Plan = { site, columns: new Map(), voxels: new Map(), houses: 0, farms: 0, smithies: 0, towers: 0, stalls: 0, homes: [], chests: new Set() };
    const styleName: StyleName = this.opts.style?.(site.biome) ?? 'oak';

    const column = (x: number, z: number, road: boolean, block?: number): void => {
      const k = `${x},${z}`;
      const old = cols.get(k);
      if (old) {
        old.road = old.road || road;
        if (old.block === undefined) old.block = block;
      } else cols.set(k, { x, z, road, block });
    };
    /** dy is relative to the village ground. */
    const put = (x: number, dy: number, z: number, id: number): void => {
      if (id === B.CHEST) plan.chests.add(`${x},${g + dy},${z}`);
      flat.push(x, g + dy, z, id);
    };
    /** Worn gravel for the roads. */
    const pathBlock = (): number => (rand() < 0.12 ? B.COBBLE : B.GRAVEL);

    // The plaza: rings of stone bricks and cobblestone around the well.
    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -3; dx <= 3; dx++) {
        const r = Math.max(Math.abs(dx), Math.abs(dz));
        column(site.x + dx, site.z + dz, true, r === 3 ? B.STONE_BRICKS : B.COBBLE);
      }
    }
    well(new Lot(3, 3, 0, 2, (i, j) => [site.x - 1 + i, site.z - 1 + j], put));

    // Four roads.
    const placed: Rect[] = [{ x0: site.x - 4, x1: site.x + 4, z0: site.z - 4, z1: site.z + 4 }];
    const buildings: Rect[] = [];
    const arms: { dir: [number, number]; len: number }[] = DIRS.map((dir) => ({ dir, len: 17 + Math.floor(rand() * 9) }));
    for (const { dir, len } of arms) {
      const [ax, az] = dir;
      for (let t = 0; t <= len; t++) {
        for (let l = -1; l <= 1; l++) column(site.x + ax * t - az * l, site.z + az * t + ax * l, true, pathBlock());
      }
      placed.push(this.rectOf(site, dir, 1, 0, len, -1, 1));
    }

    // Lamp posts at the plaza corners.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) lampPost(put, site.x + 3 * sx, site.z + 3 * sz);
    }

    // Buildings along the roads.
    const forced = new Set(['0,1,9', '0,-1,9', '2,1,9', '2,-1,9']);
    for (let ai = 0; ai < arms.length; ai++) {
      const { dir, len } = arms[ai];
      for (const side of [1, -1]) {
        for (const along of ALONG) {
          if (along > len) continue;
          const must = forced.has(`${ai},${side},${along}`);
          if (!must && rand() > 0.75) continue;
          const roll = rand();
          let kind: Kind =
            roll < 0.16 ? 'farm' : roll < 0.24 && plan.smithies === 0 ? 'smithy' : roll < 0.32 && plan.towers === 0 ? 'tower' : roll < 0.42 ? 'stall' : roll < 0.68 ? 'small' : 'large';
          if (must && (kind === 'farm' || kind === 'tower' || kind === 'stall')) kind = 'small';
          const [w, d] = SIZE[kind];
          const a = along + Math.floor(rand() * 3) - 1;
          // The footprint plus a one block margin must stay clear of everything placed so far.
          const rect = this.rectOf(site, dir, a - Math.floor(w / 2) - 1, 2, a - Math.floor(w / 2) + w, 3 + d, side);
          if (placed.some((r) => overlaps(r, rect))) continue;
          const extent = Math.max(Math.abs(rect.x0 - site.x), Math.abs(rect.x1 - site.x), Math.abs(rect.z0 - site.z), Math.abs(rect.z1 - site.z));
          if (extent > VILLAGE_EXTENT) continue;
          placed.push(rect);
          buildings.push(rect);

          const toWorld = (i: number, j: number): [number, number] => {
            const along2 = a - Math.floor(w / 2) + i;
            const lat = 3 + j;
            return [site.x + dir[0] * along2 + -dir[1] * side * lat, site.z + dir[1] * along2 + dir[0] * side * lat];
          };
          // Ground to level: the footprint plus a ring around it, and a path to the road.
          for (let j = -1; j <= d; j++) for (let i = -1; i <= w; i++) column(...toWorld(i, j), false);
          const door = Math.floor(w / 2);
          column(...toWorld(door, -1), true, pathBlock());
          column(...toWorld(door, -2), true, pathBlock());

          const lot = new Lot(w, d, dirIndex(dir[0], dir[1]), dirIndex(-dir[1] * side, dir[0] * side), toWorld, put);
          const home = (i: number, j: number): void => {
            const [hx, hz] = toWorld(i, j);
            plan.homes.push({ x: hx, y: g + 1, z: hz, kind });
          };
          const style = styleFor(styleName, rand);
          if (kind === 'farm') {
            farm(lot, rand);
            plan.farms++;
            home(door, -1);
          } else if (kind === 'tower') {
            tower(lot);
            plan.towers++;
            home(door, 1);
          } else if (kind === 'stall') {
            stall(lot, rand);
            plan.stalls++;
            home(w >> 1, d - 2);
          } else {
            house(lot, kind, style, rand);
            if (kind === 'smithy') plan.smithies++;
            else plan.houses++;
            home(door, 1);
            if (kind === 'large') home(door + 1, 1);
          }
          // A garden around the walls.
          if (kind !== 'farm' && kind !== 'stall' && style.garden !== 'none') {
            for (let j = -1; j <= d; j++) {
              for (let i = -1; i <= w; i++) {
                if (i >= 0 && i < w && j >= 0 && j < d) continue;
                if (j === -1 && Math.abs(i - door) <= 1) continue;
                const r = rand();
                if (style.garden === 'flowers' && r < 0.3) lot.set(i, 1, j, r < 0.15 ? B.ROSE : B.DANDELION);
                else if (style.garden === 'bush' && r < 0.1) lot.set(i, 1, j, B.DEAD_BUSH);
              }
            }
          }
        }
      }
    }

    // Lamp posts along the roads, between the buildings.
    for (const { dir, len } of arms) {
      let side = 1;
      for (let t = 5; t < len; t += 6, side = -side) {
        const x = site.x + dir[0] * t - dir[1] * 2 * side;
        const z = site.z + dir[1] * t + dir[0] * 2 * side;
        const cell: Rect = { x0: x, x1: x, z0: z, z1: z };
        if (buildings.some((r) => overlaps(r, cell))) continue;
        column(x, z, false);
        lampPost(put, x, z);
      }
    }

    // Ease the levelled ground back into the landscape: heights blend from the village's to the natural
    // ones over `SKIRT` blocks, so the village does not sit in a pit or on a plinth.
    let frontier: [number, number][] = [...cols.values()].map((c) => [c.x, c.z]);
    const seen = new Set<string>(cols.keys());
    for (let step = 1; step <= SKIRT; step++) {
      const next: [number, number][] = [];
      for (const [x, z] of frontier) {
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const nz = z + dz;
            const k = `${nx},${nz}`;
            if (seen.has(k)) continue;
            seen.add(k);
            next.push([nx, nz]);
            const natural = this.terrain.columnAt(nx, nz).height;
            if (natural <= SEA_LEVEL) continue;
            cols.set(k, { x: nx, z: nz, road: false, g: Math.round(g + ((natural - g) * step) / (SKIRT + 1)) });
          }
        }
      }
      frontier = next;
    }

    // Bucket by chunk.
    for (const c of cols.values()) {
      const k = chunkKey(c.x, c.z);
      const list = plan.columns.get(k);
      if (list) list.push(c);
      else plan.columns.set(k, [c]);
    }
    for (let i = 0; i < flat.length; i += 4) {
      const k = chunkKey(flat[i], flat[i + 2]);
      const list = plan.voxels.get(k);
      if (list) list.push(flat[i], flat[i + 1], flat[i + 2], flat[i + 3]);
      else plan.voxels.set(k, [flat[i], flat[i + 1], flat[i + 2], flat[i + 3]]);
    }
    return plan;
  }

  /** World bounding box of an area given as (along, lateral) ranges from the centre along an arm. */
  private rectOf(site: VillageSite, dir: [number, number], a0: number, l0: number, a1: number, l1: number, side = 1): Rect {
    const p = (along: number, lat: number): [number, number] => [
      site.x + dir[0] * along + -dir[1] * side * lat,
      site.z + dir[1] * along + dir[0] * side * lat,
    ];
    const [x0, z0] = p(a0, l0);
    const [x1, z1] = p(a1, l1);
    return { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) };
  }
}
