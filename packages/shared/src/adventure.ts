import { B, IS_LIQUID, IS_SOLID, LEAF_BLOCKS, LOG_BLOCKS, bedId, doorId, slabId, stairId, woolId } from './blocks';
import { CHUNK_SIZE, SEA_LEVEL, WORLD_HEIGHT, blockIndex } from './chunk';
import type { LootTableName } from './loot';
import type { MobKind } from './mobs';
import { hash2 } from './noise';
import { NPCS, type DummyStation, type NpcStation } from './quests';
import { Lot, farm, house, lampPost, stall, styleFor, tower, waystone, well } from './villageBuilders';
import { banner, bench, cart, crates, fencedRing, flowerGarden, fountain, hayBale, obelisk, shelter, tree } from './villageDecor';
import { buildWall } from './villageWall';
import { WorldGenerator, type Column, type InstanceRequirement } from './worldgen';

/**
 * The world of the Adventure mode. It is the ordinary generated world with two made places set into it
 * at fixed spots, the same for every player:
 *
 *  - Dawnwatch, a small village on a levelled square around the origin, where the quest givers stand (the paved
 *    Landing is where you come back to after a death), and under it the Undercroft, a cave where every new
 *    character wakes, with a stair up to the village;
 *  - the Hollow Cellar, a dungeon a little way east along a gravel road: a ruined chapel on the surface with a
 *    portal in it. The dungeon itself is not under the chapel but in a separate map, far from the land: three
 *    rooms, each with a monster cage, and a vault of treasure at the back. Every player gets a copy of their own
 *    (an "instance", see `instanceAt`), so nobody waits for anybody and nobody can spoil it for anyone.
 *
 * Like all generation this is a pure function of the seed (the mode uses `ADVENTURE_SEED`), so the client,
 * the server and the tests all see the same places.
 */

/** The seed of the Adventure world: a fixed one, so that everybody finds the same village and the same dungeon. */
export const ADVENTURE_SEED = 2026;
/**
 * Which version of the made places (the village, the Undercroft, the chapel) the generator makes. A saved world keeps the
 * chunks that were ever changed, as they were; a server that finds it saved an older version puts the protected places
 * back (see `WorldGenerator.mendProtected`). Raise it whenever those places are rebuilt.
 */
export const ADVENTURE_LAYOUT = 6;
/** How far the land is slid under the made places (found by a search for good ground; see the generator). */
export const ADVENTURE_OFFSET_X = -1536;
export const ADVENTURE_OFFSET_Z = -832;

/** Dawnwatch is levelled over x and z from -HUB_HALF up to HUB_HALF - 1, with a skirt that eases it into the land. */
export const HUB_HALF = 38;
/** The training yard (in blocks, inclusive): a fenced sand floor in the north-east of the village, gate to the south, three dummies at the back. */
export const YARD = { x0: 16, z0: -22, x1: 26, z1: -12 } as const;
export const DUMMY_SPOTS: readonly { x: number; z: number }[] = [
  { x: 18.5, z: -19.5 },
  { x: 21.5, z: -19.5 },
  { x: 24.5, z: -19.5 },
];
const HUB_SKIRT = 10;
/** The Landing, where everybody arrives: a SPAWN_SIZE x SPAWN_SIZE square of paving, from (x0, z0). */
export const SPAWN_SIZE = 12;
export const SPAWN_X0 = -6;
export const SPAWN_Z0 = 20;
/** The dungeon's chapel stands here; the road from the village ends at its gate. */
export const DUNGEON_X = 92;
export const DUNGEON_Z = 0;
const RUIN_HALF = 6;
const RUIN_SKIRT = 6;
/**
 * The Undercroft: a cave under Dawnwatch where every new character wakes (the hunters found them half dead in the forest and
 * carried them down here). Its floor lies this far under the village's ground; a long stair climbs from its west end to a
 * stone house in the south-west of the village.
 */
export const UNDERCROFT_DEPTH = 17;
/** The chambers of the cave: ellipses (middle and radii, in blocks), whose roofs arch from 3 up to 7 blocks above the floor. */
const CAVE_BLOBS: readonly { x: number; z: number; rx: number; rz: number }[] = [
  { x: -4, z: 12, rx: 10, rz: 7 },
  { x: 2, z: 22, rx: 7, rz: 6 },
  { x: 10, z: 10, rx: 6, rz: 5 },
];
/** Where the stair meets the cave: a short hall, flat and 4 high. */
const CAVE_HALL = { x0: -16, x1: -12, z0: 11, z1: 13 };
/** The cave lies inside this box (x and z, inclusive). */
const CAVE_BOX = { x0: -17, x1: 17, z0: 4, z1: 29 };
/** The cellar house over the stair: its outer walls (inclusive). The stair runs east to west under it, three wide (z 11..13), one step down for every block. */
export const CELLAR_HOUSE = { x0: -35, x1: -28, z0: 9, z1: 15 } as const;
/** The block where the stair starts (x of its first step) and the z of its middle. */
const STAIR_X0 = CELLAR_HOUSE.x0 + 2;
const STAIR_Z = 12;
/** Twelve places to wake up on, in front of the healer. */
export const UNDERCROFT_SPAWNS: readonly { x: number; z: number }[] = [-6.5, -4.5, -2.5, -0.5].flatMap((x) => [10.5, 12.5, 14.5].map((z) => ({ x, z })));
/** The experience level the Hollow Cellar asks for. */
export const DUNGEON_MIN_LEVEL = 5;

/**
 * The dungeon copies lie in a field of their own, far east of the land, one after the other along z. Every copy is
 * the same rooms, shifted by `INSTANCE_STRIDE` blocks of z; each is cut in solid rock under a sealed sky, so that
 * nothing wanders in from outside and nothing in one can be seen from the next.
 */
export const INSTANCE_X0 = 4096;
export const INSTANCE_Z0 = 4096;
export const INSTANCE_LENGTH = 64;
export const INSTANCE_STRIDE = 48;
export const INSTANCE_SLOTS = 48;

/** The ground a dungeon copy covers (x0..x1, z0..z1, inclusive) when (x, z) is inside one; every copy has the same shape, INSTANCE_STRIDE blocks apart. */
export function instanceFootprint(x: number, z: number): { x0: number; z0: number; x1: number; z1: number } | null {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  if (bx < INSTANCE_X0 || bx >= INSTANCE_X0 + INSTANCE_LENGTH || bz < INSTANCE_Z0) return null;
  const slot = Math.floor((bz - INSTANCE_Z0) / INSTANCE_STRIDE);
  if (slot >= INSTANCE_SLOTS) return null;
  const z0 = INSTANCE_Z0 + slot * INSTANCE_STRIDE;
  return { x0: INSTANCE_X0, z0, x1: INSTANCE_X0 + INSTANCE_LENGTH - 1, z1: z0 + INSTANCE_STRIDE - 1 };
}
/** The floor of the rooms. */
export const INSTANCE_FLOOR = 60;
/** The portal in the chapel stands here (its centre), facing along x. */
const PORTAL_X = DUNGEON_X;

/** Which way things face, as in `BED_DIRS`: 0 = +x, 1 = -x, 2 = +z, 3 = -z. */
const DIRS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** A made place that levels the ground under it. */
interface Plot {
  cx: number;
  cz: number;
  half: number;
  skirt: number;
  g: number;
}

/** `set` writes everywhere, `solid` only over solid blocks, `fill` only over blocks that are not solid (air, water: it walls a cut in with rock). */
type OpMode = 'set' | 'solid' | 'fill';
interface Op {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  id: number;
  mode: OpMode;
}

const key = (x: number, z: number): string => `${x},${z}`;
const chunkOf = (x: number, z: number): string => `${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`;
const smooth = (t: number): number => t * t * (3 - 2 * t);

const WOODY = new Set<number>([...LEAF_BLOCKS, ...LOG_BLOCKS]);

export class AdventureWorldGenerator extends WorldGenerator {
  override readonly kind = 'adventure' as const;

  /** The height of the village's ground. */
  readonly hubY: number;
  /** The height of the ground around the chapel. */
  readonly ruinY: number;
  /** The floor of the Undercroft (the block under your feet). */
  readonly undercroftY: number;
  /** The floor of the dungeon rooms. */
  readonly cellarY = INSTANCE_FLOOR;
  /** Where the first room starts (x), and where the last one ends. The first copy of the dungeon is described; the others are shifted in z. */
  readonly roomX = INSTANCE_X0 + 4;
  readonly cellarEnd = INSTANCE_X0 + 55;
  /** The middle of the first copy, along z. */
  readonly roomZ = INSTANCE_Z0 + INSTANCE_STRIDE / 2;
  /** Where the monster cages of the first copy are. */
  readonly cages: readonly { x: number; y: number; z: number }[];
  private readonly plots: Plot[];
  private readonly paint = new Map<string, number>();
  private readonly voxels = new Map<string, number[]>();
  private readonly ops: Op[] = [];
  /** What the dungeon is made of (for the first copy). */
  private readonly instanceOps: Op[] = [];
  /** Where `box` writes: the land, or the dungeon while it is being planned. */
  private sink: Op[] = this.ops;
  private readonly chests = new Map<string, LootTableName>();

  /** How far the land under this world is slid: the village stands where the generated land is good, not at the origin. */
  readonly offsetX: number;
  readonly offsetZ: number;

  constructor(seed: number, offsetX = ADVENTURE_OFFSET_X, offsetZ = ADVENTURE_OFFSET_Z) {
    super(seed);
    this.offsetX = offsetX;
    this.offsetZ = offsetZ;
    // No wandering villages near the made ones: their land is spoken for.
    const v = this.villages;
    const natural = v.siteInRegion.bind(v);
    // Nor beside the dungeon field, whose people would otherwise be heard through the rock.
    const R = 96;
    const nearField = (rx: number, rz: number): boolean =>
      (rx + 1) * R > INSTANCE_X0 - 140 && rx * R < INSTANCE_X0 + INSTANCE_LENGTH + 140 && (rz + 1) * R > INSTANCE_Z0 - 140 && rz * R < INSTANCE_Z0 + INSTANCE_SLOTS * INSTANCE_STRIDE + 140;
    v.siteInRegion = (rx, rz) => ((rx >= -1 && rx <= 1 && rz >= -1 && rz <= 1) || nearField(rx, rz) ? null : natural(rx, rz));

    const heights = (xs: number[], zs: number[]): number[] => zs.flatMap((z) => xs.map((x) => this.columnAt(x, z).height));
    const median = (a: number[]): number => [...a].sort((p, q) => p - q)[a.length >> 1];
    const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

    this.hubY = clamp(median(heights([-30, -15, 0, 15, 30], [-30, -15, 0, 15, 30])), SEA_LEVEL + 2, SEA_LEVEL + 22);
    this.ruinY = clamp(median(heights([DUNGEON_X - 4, DUNGEON_X, DUNGEON_X + 4], [DUNGEON_Z - 4, DUNGEON_Z, DUNGEON_Z + 4])), SEA_LEVEL + 2, SEA_LEVEL + 40);
    // The village is never lower than SEA_LEVEL + 2, so the floor never comes near the bedrock.
    this.undercroftY = this.hubY - UNDERCROFT_DEPTH;
    this.plots = [
      { cx: 0, cz: 0, half: HUB_HALF, skirt: HUB_SKIRT, g: this.hubY },
      { cx: DUNGEON_X, cz: DUNGEON_Z, half: RUIN_HALF + 3, skirt: RUIN_SKIRT, g: this.ruinY },
    ];

    this.cages = [
      { x: this.roomX + 5, y: this.cellarY + 1, z: this.roomZ },
      { x: this.roomX + 25, y: this.cellarY + 1, z: this.roomZ },
      { x: this.roomX + 45, y: this.cellarY + 1, z: this.roomZ },
    ];

    this.buildVillage();
    this.buildCellarHouse();
    this.buildUndercroft();
    this.scatterGreens();
    this.buildRuin();
    this.sink = this.instanceOps;
    this.buildCellar();
    this.sink = this.ops;
  }

  // ---- the world --------------------------------------------------------------------------------

  /**
   * The land (heights, biomes, climate) is the generated world slid by the offset, so that the origin, where
   * every seed has a river, is a good place for a village. Everything else in the generator asks these two.
   */
  override columnAt(wx: number, wz: number): Column {
    return super.columnAt(wx + this.offsetX, wz + this.offsetZ);
  }

  override climateAt(wx: number, wz: number): { t: number; h: number } {
    return super.climateAt(wx + this.offsetX, wz + this.offsetZ);
  }

  override generateChunk(cx: number, cz: number): Uint16Array {
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    if (this.instanceAt(ox, oz) >= 0) return this.instanceChunk(this.instanceAt(ox, oz), ox, oz);
    const blocks = super.generateChunk(cx, cz);
    for (const plot of this.plots) this.level(blocks, plot, ox, oz);
    this.carveUndercroft(blocks, ox, oz);
    const vox = this.voxels.get(`${cx},${cz}`);
    if (vox) {
      for (let i = 0; i < vox.length; i += 4) {
        const y = vox[i + 1];
        if (y >= 1 && y < WORLD_HEIGHT) blocks[blockIndex(vox[i] - ox, y, vox[i + 2] - oz)] = vox[i + 3];
      }
    }
    this.road(blocks, ox, oz);
    for (const op of this.ops) this.write(blocks, op, ox, oz);
    return blocks;
  }

  override findSpawn(): { x: number; y: number; z: number } {
    return this.spawnFor(0);
  }

  /**
   * Everyone arrives on the Landing, a paved square, each on a different block: the slot is the n-th arrival,
   * and the steps of 37 visit all 144 blocks (37 and 144 share no factor) before any is used twice.
   */
  override spawnFor(slot: number): { x: number; y: number; z: number } {
    const cell = ((Math.floor(slot) % (SPAWN_SIZE * SPAWN_SIZE)) * 37 + 5) % (SPAWN_SIZE * SPAWN_SIZE);
    return { x: SPAWN_X0 + (cell % SPAWN_SIZE) + 0.5, y: this.hubY + 1, z: SPAWN_Z0 + Math.floor(cell / SPAWN_SIZE) + 0.5 };
  }

  /**
   * A new character does not arrive at the Landing: they wake in the Undercroft, the cave under the village, in front of
   * its healer, each on a spot of their own (the steps of 5 visit all twelve before any is used twice).
   */
  override startFor(slot: number): { x: number; y: number; z: number } {
    const spot = UNDERCROFT_SPAWNS[(Math.floor(slot) * 5) % UNDERCROFT_SPAWNS.length];
    return { x: spot.x, y: this.undercroftY + 1, z: spot.z };
  }

  override npcStations(): readonly NpcStation[] {
    return NPCS.map((npc, index) => ({ npc, index, x: npc.x, y: (npc.cellar ? this.undercroftY : this.hubY) + 1, z: npc.z }));
  }

  override dummyStations(): readonly DummyStation[] {
    return DUMMY_SPOTS.map((s, index) => ({ index, x: s.x, y: this.hubY + 1, z: s.z, yaw: Math.PI }));
  }

  override zoneAt(x: number, y: number, z: number): string | null {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    if (this.instanceAt(bx, bz) >= 0) return 'hollow_cellar';
    const inVillage = bx >= -HUB_HALF && bx < HUB_HALF && bz >= -HUB_HALF && bz < HUB_HALF;
    // Below the village's ground (the cave and the stair down to it): the first step on the stair is already in the village.
    if (inVillage && y < this.hubY + 0.75) return 'undercroft';
    if (bx >= YARD.x0 && bx <= YARD.x1 && bz >= YARD.z0 && bz <= YARD.z1) return 'training_yard';
    if (inVillage) return 'dawnwatch';
    return null;
  }

  // ---- the dungeon copies ---------------------------------------------------------------------

  override instanceCount(): number {
    return INSTANCE_SLOTS;
  }

  override instanceAt(x: number, z: number): number {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    if (bx < INSTANCE_X0 || bx >= INSTANCE_X0 + INSTANCE_LENGTH || bz < INSTANCE_Z0) return -1;
    const slot = Math.floor((bz - INSTANCE_Z0) / INSTANCE_STRIDE);
    return slot < INSTANCE_SLOTS ? slot : -1;
  }

  override instanceBounds(slot: number): { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number } | null {
    if (!(slot >= 0 && slot < INSTANCE_SLOTS)) return null;
    const z0 = INSTANCE_Z0 + slot * INSTANCE_STRIDE;
    return { x0: INSTANCE_X0, y0: 1, z0, x1: INSTANCE_X0 + INSTANCE_LENGTH - 1, y1: WORLD_HEIGHT - 1, z1: z0 + INSTANCE_STRIDE - 1 };
  }

  /** Dawnwatch is safe: no monster is born in it or within `SAFE_BUFFER` blocks of it, and none that wanders in stays. */
  override safeFromMonsters(x: number, z: number, margin = 0): boolean {
    const h = HUB_HALF + margin;
    return x >= -h && x < h && z >= -h && z < h;
  }

  /** The Hollow Cellar is not for beginners. */
  override instanceRequirement(): InstanceRequirement {
    return { name: 'The Hollow Cellar', level: DUNGEON_MIN_LEVEL };
  }

  /** The gatehall, two steps in front of the way out, facing the rooms (+x). */
  override instanceEntry(slot: number): { x: number; y: number; z: number; yaw: number } | null {
    if (!(slot >= 0 && slot < INSTANCE_SLOTS)) return null;
    return { x: this.roomX + 2.5, y: this.cellarY + 1, z: this.roomZ + slot * INSTANCE_STRIDE + 0.5, yaw: -Math.PI / 2 };
  }

  /** Just outside the chapel's portal, facing back down the road (-x). */
  override instanceExit(): { x: number; y: number; z: number; yaw: number } {
    return { x: PORTAL_X - 3.5, y: this.ruinY + 1, z: DUNGEON_Z + 0.5, yaw: Math.PI / 2 };
  }

  /** The cages of a copy. */
  instanceCages(slot: number): { x: number; y: number; z: number }[] {
    return this.cages.map((c) => ({ x: c.x, y: c.y, z: c.z + slot * INSTANCE_STRIDE }));
  }

  /** The gatehall's cage makes the dead, the crypt's the bones, and the vault's both. */
  override spawnerAt(x: number, y: number, z: number): MobKind | null {
    const slot = this.instanceAt(x, z);
    if (slot < 0) return super.spawnerAt(x, y, z);
    const i = this.instanceCages(slot).findIndex((c) => c.x === Math.floor(x) && c.y === Math.floor(y) && c.z === Math.floor(z));
    return i < 0 ? null : (['zombie', 'skeleton', i % 2 === 0 ? 'zombie' : 'skeleton'] as const)[i];
  }

  /** One copy of the dungeon: solid rock all the way up, and the rooms cut in it. */
  private instanceChunk(slot: number, ox: number, oz: number): Uint16Array {
    const blocks = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    blocks.fill(B.STONE, blockIndex(0, 1, 0));
    blocks.fill(B.BEDROCK, 0, blockIndex(0, 1, 0));
    const dz = slot * INSTANCE_STRIDE;
    for (const op of this.instanceOps) this.write(blocks, dz === 0 ? op : { ...op, z0: op.z0 + dz, z1: op.z1 + dz }, ox, oz);
    return blocks;
  }

  /**
   * What players may not change: the whole of Dawnwatch (from bedrock to sky, so nobody digs a hole under a quest
   * giver or tunnels below the houses), the chapel ruin, and the Hollow Cellar with its stairs. Like a WoW town,
   * the land around stays free to build and mine in.
   */
  override isProtected(x: number, y: number, z: number): boolean {
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    if (bx >= -HUB_HALF && bx < HUB_HALF && bz >= -HUB_HALF && bz < HUB_HALF) return true;
    // The chapel: its ring and the portal in it, from bedrock to sky.
    if (Math.abs(bx - DUNGEON_X) <= RUIN_HALF && Math.abs(bz - DUNGEON_Z) <= RUIN_HALF) return true;
    // Every copy of the dungeon, whole.
    return by >= 0 && this.instanceAt(bx, bz) >= 0;
  }

  override lootAt(x: number, y: number, z: number): LootTableName | null {
    const slot = this.instanceAt(x, z);
    // The chests of every copy are the first copy's, shifted: they hold the same kind of loot.
    const key = slot > 0 ? `${x},${y},${z - slot * INSTANCE_STRIDE}` : `${x},${y},${z}`;
    return this.chests.get(key) ?? super.lootAt(x, y, z);
  }

  // ---- levelling --------------------------------------------------------------------------------

  /** Make the ground under a plot flat, easing it back into the land over its skirt. */
  private level(blocks: Uint16Array, plot: Plot, ox: number, oz: number): void {
    const reach = plot.half + plot.skirt;
    if (ox + CHUNK_SIZE <= plot.cx - reach || ox > plot.cx + reach - 1 || oz + CHUNK_SIZE <= plot.cz - reach || oz > plot.cz + reach - 1) return;
    const g0 = plot.g;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx;
        const wz = oz + lz;
        const dx = Math.max(plot.cx - plot.half - wx, wx - (plot.cx + plot.half - 1), 0);
        const dz = Math.max(plot.cz - plot.half - wz, wz - (plot.cz + plot.half - 1), 0);
        const d = Math.max(dx, dz);
        if (d > plot.skirt) continue;
        const natural = this.columnAt(wx, wz).height;
        const t = d / (plot.skirt + 1);
        const g = d === 0 ? g0 : Math.round(g0 + (natural - g0) * smooth(t));
        // A skirt that would dip into the sea leaves the shore as it is.
        if (d > 0 && g <= SEA_LEVEL) continue;
        for (let y = Math.max(1, Math.min(natural, g - 3) + 1); y < g; y++) blocks[blockIndex(lx, y, lz)] = B.DIRT;
        blocks[blockIndex(lx, g, lz)] = (d === 0 ? this.paint.get(key(wx, wz)) : undefined) ?? B.GRASS;
        const top = Math.min(WORLD_HEIGHT - 1, Math.max(natural, g) + 14);
        for (let y = g + 1; y <= top; y++) blocks[blockIndex(lx, y, lz)] = B.AIR;
      }
    }
  }

  /** The gravel road from the village to the chapel: whatever the land is there, a three-wide strip of gravel with the trees cleared. */
  private road(blocks: Uint16Array, ox: number, oz: number): void {
    this.strip(blocks, ox, oz, HUB_HALF, DUNGEON_X - RUIN_HALF - 1, DUNGEON_Z - 1, DUNGEON_Z + 1);
  }

  /** A strip of gravel over the rectangle [x0..x1] x [z0..z1]: whatever the land is there, with the trees cleared. */
  private strip(blocks: Uint16Array, ox: number, oz: number, x0: number, x1: number, z0: number, z1: number): void {
    if (ox + CHUNK_SIZE <= x0 || ox > x1 || oz + CHUNK_SIZE <= z0 || oz > z1) return;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wz = oz + lz;
      if (wz < z0 || wz > z1) continue;
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx;
        if (wx < x0 || wx > x1) continue;
        let y = WORLD_HEIGHT - 1;
        for (; y > 0; y--) {
          const id = blocks[blockIndex(lx, y, lz)];
          if (id === B.AIR || WOODY.has(id)) continue;
          if (IS_LIQUID[id]) y = 0;
          else if (!IS_SOLID[id]) continue;
          break;
        }
        if (y <= 0) continue;
        blocks[blockIndex(lx, y, lz)] = hash2(this.seed + 41, wx, wz) < 0.12 ? B.COBBLE : B.GRAVEL;
        for (let k = y + 1; k <= Math.min(WORLD_HEIGHT - 1, y + 9); k++) blocks[blockIndex(lx, k, lz)] = B.AIR;
      }
    }
  }

  private write(blocks: Uint16Array, op: Op, ox: number, oz: number): void {
    const x0 = Math.max(op.x0, ox);
    const x1 = Math.min(op.x1, ox + CHUNK_SIZE - 1);
    const z0 = Math.max(op.z0, oz);
    const z1 = Math.min(op.z1, oz + CHUNK_SIZE - 1);
    const y0 = Math.max(op.y0, 1);
    const y1 = Math.min(op.y1, WORLD_HEIGHT - 1);
    if (x0 > x1 || z0 > z1 || y0 > y1) return;
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const i = blockIndex(x - ox, y, z - oz);
          if (blocks[i] === B.BEDROCK) continue;
          if (op.mode === 'solid' && !IS_SOLID[blocks[i]]) continue;
          if (op.mode === 'fill' && IS_SOLID[blocks[i]]) continue;
          blocks[i] = op.id;
        }
      }
    }
  }

  // ---- plans ------------------------------------------------------------------------------------

  private box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number, mode: OpMode = 'set'): void {
    this.sink.push({ x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1), id, mode });
  }

  private chest(x: number, y: number, z: number, table: LootTableName): void {
    this.box(x, y, z, x, y, z, B.CHEST);
    this.chests.set(`${x},${y},${z}`, table);
  }

  private vox(base: number): (x: number, dy: number, z: number, id: number) => void {
    return (x, dy, z, id) => {
      const k = chunkOf(x, z);
      let list = this.voxels.get(k);
      if (!list) this.voxels.set(k, (list = []));
      list.push(x, base + dy, z, id);
    };
  }

  /** A lot whose door faces `front` (a direction index), over the rectangle [x0..x1] x [z0..z1]. */
  private lot(x0: number, z0: number, x1: number, z1: number, front: number, put: (x: number, dy: number, z: number, id: number) => void): Lot {
    const jDir = front ^ 1;
    const iDir = front < 2 ? 2 : 0;
    const [ix, iz] = DIRS[iDir];
    const [jx, jz] = DIRS[jDir];
    const w = ix !== 0 ? x1 - x0 + 1 : z1 - z0 + 1;
    const d = jx !== 0 ? x1 - x0 + 1 : z1 - z0 + 1;
    const ox = ix > 0 || jx > 0 ? x0 : x1;
    const oz = iz > 0 || jz > 0 ? z0 : z1;
    return new Lot(w, d, iDir, jDir, (i, j) => [ox + ix * i + jx * j, oz + iz * i + jz * j], put);
  }

  private pave(x0: number, z0: number, x1: number, z1: number, block: number | (() => number)): void {
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.paint.set(key(x, z), typeof block === 'number' ? block : block());
    }
  }

  /** Dawnwatch: a waystone in a plaza, two roads, a hall, a forge, a lodge, a guard tower, an inn, a cottage, a farm and market stalls. */
  private buildVillage(): void {
    const put = this.vox(this.hubY);
    let n = 0;
    const road = (): number => (hash2(this.seed + 40, n++, 7) < 0.12 ? B.COBBLE : B.GRAVEL);

    // The roads: north to the hall, south to the Landing, and east and west through the plaza.
    this.pave(-1, -11, 1, 19, road);
    this.pave(-HUB_HALF + 1, -1, HUB_HALF - 1, 1, road);
    // The plaza, in rings of stone brick and cobblestone, with the waystone in the middle.
    for (let r = 0; r <= 4; r++) {
      for (let z = -r; z <= r; z++) {
        for (let x = -r; x <= r; x++) if (Math.max(Math.abs(x), Math.abs(z)) === r) this.paint.set(key(x, z), r === 4 ? B.STONE_BRICKS : B.COBBLE);
      }
    }
    waystone(put);
    // The Landing: stone brick with a border of cobblestone.
    for (let z = SPAWN_Z0; z < SPAWN_Z0 + SPAWN_SIZE; z++) {
      for (let x = SPAWN_X0; x < SPAWN_X0 + SPAWN_SIZE; x++) {
        const edge = x === SPAWN_X0 || x === SPAWN_X0 + SPAWN_SIZE - 1 || z === SPAWN_Z0 || z === SPAWN_Z0 + SPAWN_SIZE - 1;
        this.paint.set(key(x, z), edge ? B.COBBLE : (x + z) % 2 === 0 ? B.STONE_BRICKS : B.STONE);
      }
    }
    for (const [x, z] of [[SPAWN_X0 - 1, SPAWN_Z0 - 1], [SPAWN_X0 + SPAWN_SIZE, SPAWN_Z0 - 1], [SPAWN_X0 - 1, SPAWN_Z0 + SPAWN_SIZE], [SPAWN_X0 + SPAWN_SIZE, SPAWN_Z0 + SPAWN_SIZE]]) lampPost(put, x, z);

    const rand = (salt: number): (() => number) => {
      let i = 0;
      return () => hash2(this.seed + salt, i++, salt);
    };
    // North side of the east-west road: the doors face south (+z), and a path runs from each down to the road.
    const northPath = (xa: number, xb: number, zFront: number): void => this.pave(xa + ((xb - xa) >> 1), zFront + 1, xa + ((xb - xa) >> 1), -2, B.GRAVEL);
    northPath(8, 14, -6);
    northPath(-13, -9, -5);
    northPath(24, 28, -4);
    northPath(-27, -19, -7);
    house(this.lot(-3, -17, 3, -12, 2, put), 'large', styleFor('oak', rand(1)), rand(2));
    house(this.lot(8, -10, 14, -6, 2, put), 'smithy', styleFor('oak', rand(3)), rand(4));
    house(this.lot(-13, -9, -9, -5, 2, put), 'small', styleFor('oak', rand(5)), rand(6));
    tower(this.lot(24, -8, 28, -4, 2, put));
    farm(this.lot(-27, -13, -19, -7, 2, put), rand(11));
    // South side: the doors face north (-z).
    const southPath = (xa: number, xb: number, zFront: number): void => this.pave(xa + ((xb - xa) >> 1), 2, xa + ((xb - xa) >> 1), zFront - 1, B.GRAVEL);
    southPath(8, 14, 4);
    southPath(-13, -9, 4);
    house(this.lot(8, 4, 14, 9, 3, put), 'large', styleFor('oak', rand(7)), rand(8));
    house(this.lot(-13, 4, -9, 8, 3, put), 'small', styleFor('oak', rand(9)), rand(10));
    stall(this.lot(17, 4, 21, 6, 3, put), rand(12));
    stall(this.lot(-21, 4, -17, 6, 3, put), rand(13));
    // More stalls for the other merchants: weapons on the north side of the road, bows and wands on the south.
    stall(this.lot(24, 4, 28, 6, 3, put), rand(14));
    stall(this.lot(-28, 4, -24, 6, 3, put), rand(15));
    stall(this.lot(15, -8, 19, -6, 2, put), rand(16));

    this.buildYard(put);

    // Lamp posts along the roads.
    for (const z of [-6, 9, 14]) {
      lampPost(put, -2, z);
      lampPost(put, 2, z);
    }
    for (const x of [-30, -22, -16, 6, 16, 22, 32]) {
      lampPost(put, x, -2);
      lampPost(put, x, 2);
    }

    this.buildDistricts(put, rand, road);
    buildWall(put, (x, z) => hash2(this.seed + 95, x, z));
  }

  /**
   * What fills the ground between the first buildings, in the way of an MMO's starting town: the Elder's garden behind the
   * hall (fountain, flower beds, benches) up to the sealed north gate; an orchard in the north-west; a lane of houses and the
   * Watch road in the north-east; a market square with a well in the south-east, a paddock and a field below it; and a pond
   * with flower beds in the south-west. The ground that is left over is dressed by `scatterGreens`.
   */
  private buildDistricts(put: (x: number, dy: number, z: number, id: number) => void, rand: (salt: number) => () => number, road: () => number): void {
    let n = 0;
    const mix = (): number => (hash2(this.seed + 96, n++, 3) < 0.45 ? B.COBBLE : B.STONE_BRICKS);
    const wood = (salt: number): (() => number) => rand(salt);

    // ---- the Elder's garden: from the hall's back to the north gate -----------------------------------
    this.pave(-1, -35, 1, -18, mix);
    this.pave(-4, -32, 4, -24, mix);
    fountain(put, 0, -28);
    // Four flower beds in hedges, benches facing the fountain, birches, lamps and braziers.
    flowerGarden(put, -9, -34, -5, -30, 'E', wood(21));
    flowerGarden(put, 5, -34, 9, -30, 'W', wood(22));
    flowerGarden(put, -9, -26, -5, -22, 'E', wood(23));
    flowerGarden(put, 5, -26, 9, -22, 'W', wood(24));
    for (const z of [-31, -26]) {
      bench(put, -4, z, 1, false);
      bench(put, 4, z, 0, false);
    }
    for (const [x, z] of [[-12, -33], [12, -33], [-12, -22], [12, -22]]) tree(put, x, z, 'birch', 5);
    for (const [x, z] of [[-3, -34], [3, -34], [-3, -22], [3, -22]]) lampPost(put, x, z);
    obelisk(put, -4, -36);
    obelisk(put, 4, -36);
    // ---- the orchard (north-west), fenced, with a path through it --------------------------------------
    const O = { x0: -33, z0: -33, x1: -14, z1: -16 };
    fencedRing(put, O.x0, O.z0, O.x1, O.z1, [{ x: O.x1, z: -28 }]);
    this.pave(-24, -32, -24, -17, B.GRAVEL);
    this.pave(O.x0 + 1, -28, -5, -28, B.GRAVEL);
    let t = 0;
    for (const z of [-31, -23, -19]) {
      for (const x of [-30, -27, -21, -18]) {
        const h = hash2(this.seed + 97, x, z);
        tree(put, x + (z === -23 ? 1 : 0), z, h < 0.8 ? 'oak' : 'birch', 4 + (t++ % 2));
      }
    }
    bench(put, -23, -30, 2, true);
    bench(put, -29, -25, 3, true);

    // ---- the lane and the Watch road (north-east) ---------------------------------------------------------
    this.pave(4, -27, 34, -25, road);
    this.pave(29, -24, 31, -2, road);
    house(this.lot(13, -34, 19, -29, 2, put), 'large', styleFor('spruce', rand(31)), rand(32));
    house(this.lot(21, -33, 25, -29, 2, put), 'small', styleFor('oak', rand(33)), rand(34));
    house(this.lot(27, -33, 31, -29, 2, put), 'small', styleFor('spruce', rand(35)), rand(36));
    for (const x of [16, 23, 29]) this.pave(x, -28, x, -28, B.GRAVEL);
    for (const x of [8, 17, 26]) lampPost(put, x, -24);
    for (const z of [-8, -16, -22]) lampPost(put, 32, z);
    for (const z of [-14, -20]) lampPost(put, 28, z);
    hayBale(put, 12, -23, 2);
    hayBale(put, 13, -23);
    crates(put, 32, -23, 2);
    crates(put, 33, -23, 1);

    // ---- the market square (south-east) --------------------------------------------------------------------
    this.pave(2, 15, 9, 17, road);
    for (let z = 11; z <= 19; z++) {
      for (let x = 10; x <= 31; x++) {
        const edge = x === 10 || x === 31 || z === 11 || z === 19;
        this.paint.set(key(x, z), edge ? B.STONE_BRICKS : (x + z) % 3 === 0 ? B.COBBLE : road());
      }
    }
    well(this.lot(19, 14, 21, 16, 2, put));
    stall(this.lot(11, 11, 15, 13, 2, put), rand(41));
    stall(this.lot(26, 11, 30, 13, 2, put), rand(42));
    stall(this.lot(11, 17, 15, 19, 3, put), rand(43));
    stall(this.lot(26, 17, 30, 19, 3, put), rand(44));
    cart(put, 23, 15, true);
    crates(put, 17, 17, 2);
    crates(put, 16, 17, 1);
    hayBale(put, 24, 18, 2);
    hayBale(put, 25, 18);
    banner(put, 10, 15, 14);
    banner(put, 31, 15, 11);
    for (const [x, z] of [[17, 14], [23, 18], [17, 18]]) lampPost(put, x, z);

    // ---- the paddock and the field (south) -----------------------------------------------------------------
    this.pave(17, 20, 17, 22, B.GRAVEL);
    fencedRing(put, 12, 23, 22, 33, [{ x: 17, z: 23 }]);
    shelter(put, 13, 28, 18, 32);
    hayBale(put, 20, 31, 2);
    hayBale(put, 21, 31);
    hayBale(put, 20, 25);
    this.pave(29, 20, 29, 23, B.GRAVEL);
    farm(this.lot(25, 24, 33, 32, 3, put), rand(51));
    lampPost(put, 16, 22);
    lampPost(put, 18, 22);
    lampPost(put, 28, 22);
    lampPost(put, 30, 22);

    // ---- the pond and its beds (south-west) ------------------------------------------------------------------
    const PX = -25;
    const PZ = 28;
    for (let z = PZ - 7; z <= PZ + 7; z++) {
      for (let x = PX - 10; x <= PX + 10; x++) {
        const d = Math.hypot((x + 0.5 - PX) / 6.5, (z + 0.5 - PZ) / 4.5);
        if (d < 1) {
          this.paint.set(key(x, z), B.SAND);
          put(x, 0, z, B.WATER);
          put(x, -1, z, B.WATER);
          put(x, -2, z, B.SAND);
        } else if (d < 1.35 && hash2(this.seed + 98, x, z) < 0.85) this.paint.set(key(x, z), B.SAND);
      }
    }
    this.pave(-16, 25, -7, 26, road);
    flowerGarden(put, -26, 11, -22, 15, 'S', wood(61));
    flowerGarden(put, -19, 11, -15, 15, 'S', wood(62));
    bench(put, -18, 27, 0, false);
    bench(put, -32, 27, 1, false);
    bench(put, -25, 21, 3, true);
    tree(put, -33, 22, 'oak', 5);
    tree(put, -31, 34, 'oak', 5);
    tree(put, -16, 33, 'birch', 5);
    tree(put, -17, 21, 'oak', 4);
    lampPost(put, -17, 24);
    lampPost(put, -17, 27);

    // ---- the gates: a paved way through each, and an apron inside ------------------------------------------
    this.pave(-1, SPAWN_Z0 + SPAWN_SIZE, 1, HUB_HALF - 1, road);
    this.pave(-3, HUB_HALF - 4, 3, HUB_HALF - 1, mix);
    this.pave(HUB_HALF - 7, -2, HUB_HALF - 1, 2, mix);
    this.pave(-HUB_HALF, -2, -HUB_HALF + 6, 2, mix);
    this.pave(-1, -HUB_HALF, 1, -HUB_HALF + 2, mix);
  }

  /**
   * The ground nobody built on: bare patches and worn edges along the paths, flowers, tall grass, shrubs, rocks and a few
   * trees, scattered by a hash. It keeps clear of everything made (so doors, NPCs, the Landing and the dummies stay as they
   * were) and is why the village's grass is no longer one flat green.
   */
  private scatterGreens(): void {
    const put = this.vox(this.hubY);
    const taken = new Set<string>();
    for (const list of this.voxels.values()) {
      for (let i = 0; i < list.length; i += 4) if (list[i + 1] >= this.hubY) taken.add(key(list[i], list[i + 2]));
    }
    for (const k of this.paint.keys()) taken.add(k);
    const reserve = (x: number, z: number, r: number): void => {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) taken.add(key(Math.round(x) + dx, Math.round(z) + dz));
    };
    for (const npc of NPCS) if (!npc.cellar) reserve(Math.floor(npc.x), Math.floor(npc.z), 2);
    for (const d of DUMMY_SPOTS) reserve(Math.floor(d.x), Math.floor(d.z), 2);
    // The Landing is the spawn: keep its surroundings plain.
    for (let z = SPAWN_Z0 - 2; z < SPAWN_Z0 + SPAWN_SIZE + 2; z++) for (let x = SPAWN_X0 - 2; x < SPAWN_X0 + SPAWN_SIZE + 2; x++) taken.add(key(x, z));

    const smooth = (t: number): number => t * t * (3 - 2 * t);
    const noise = (x: number, z: number, scale: number, salt: number): number => {
      const fx = x / scale;
      const fz = z / scale;
      const ix = Math.floor(fx);
      const iz = Math.floor(fz);
      const tx = smooth(fx - ix);
      const tz = smooth(fz - iz);
      const a = hash2(this.seed + salt, ix, iz);
      const b = hash2(this.seed + salt, ix + 1, iz);
      const c = hash2(this.seed + salt, ix, iz + 1);
      const d = hash2(this.seed + salt, ix + 1, iz + 1);
      return a + (b - a) * tx + (c - a + (a - b - c + d) * tx) * tz;
    };
    const paved = new Set(this.paint.keys());
    const free = (x: number, z: number): boolean => !taken.has(key(x, z));

    const lim = HUB_HALF - 4;
    for (let z = -lim; z <= lim; z++) {
      for (let x = -lim; x <= lim; x++) {
        if (!free(x, z)) continue;
        const r = hash2(this.seed + 90, x, z);
        const nearPath = paved.has(key(x + 1, z)) || paved.has(key(x - 1, z)) || paved.has(key(x, z + 1)) || paved.has(key(x, z - 1));
        // Bare earth: wide soft patches, and a worn edge to the paths.
        if (noise(x, z, 7, 91) > 0.7 || (nearPath && r < 0.3)) {
          this.paint.set(key(x, z), noise(x, z, 3, 92) > 0.6 ? B.GRAVEL : B.DIRT);
          if (r > 0.9) put(x, 1, z, B.COBBLE);
          continue;
        }
        // Meadows of flowers, where a second noise is high.
        const meadow = noise(x, z, 9, 93);
        if (r < 0.04 + (meadow > 0.62 ? 0.22 : 0)) put(x, 1, z, hash2(this.seed + 94, x, z) < 0.5 ? B.ROSE : B.DANDELION);
        else if (r < 0.2 + (meadow < 0.35 ? 0.1 : 0)) put(x, 1, z, B.TALL_GRASS);
        else if (r < 0.215) {
          put(x, 1, z, B.LEAVES);
          if (hash2(this.seed + 99, x, z) < 0.35) put(x, 2, z, B.LEAVES);
        } else if (r < 0.225) put(x, 1, z, hash2(this.seed + 99, z, x) < 0.4 ? B.MOSSY_COBBLE : B.COBBLE);
      }
    }
    // A few trees on the open ground, away from everything.
    for (let z = -lim; z <= lim; z++) {
      for (let x = -lim; x <= lim; x++) {
        if (hash2(this.seed + 100, x, z) > 0.0045) continue;
        let clear = true;
        for (let dz = -3; dz <= 3 && clear; dz++) for (let dx = -3; dx <= 3; dx++) if (!free(x + dx, z + dz) || this.paint.has(key(x + dx, z + dz))) { clear = false; break; }
        if (!clear) continue;
        tree(put, x, z, hash2(this.seed + 101, x, z) < 0.7 ? 'oak' : 'birch', 4 + (hash2(this.seed + 102, x, z) < 0.5 ? 1 : 0));
        reserve(x, z, 4);
      }
    }
  }

  /**
   * The training yard: a sandstone floor inside a fence, a gate on the south side that opens on a gravel path down to the
   * road, and posts with torches at the corners and the gate. Coloured wool on the floor and on the path marks 5, 10 and
   * 15 blocks from the dummies, to try the reach of a bow or a spell.
   */
  private buildYard(put: (x: number, dy: number, z: number, id: number) => void): void {
    const { x0, z0, x1, z1 } = YARD;
    const cx = Math.floor((x0 + x1) / 2);
    this.pave(x0, z0, x1, z1, B.COBBLE);
    this.pave(x0 + 1, z0 + 1, x1 - 1, z1 - 1, B.SANDSTONE);
    this.pave(cx, z1 + 1, cx, -2, B.GRAVEL);
    const posts = [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [cx - 2, z1], [cx + 2, z1]];
    const isPost = (x: number, z: number): boolean => posts.some(([px, pz]) => px === x && pz === z);
    const fence = (x: number, z: number): void => {
      if (!isPost(x, z)) put(x, 1, z, B.FENCE);
    };
    for (let x = x0; x <= x1; x++) {
      fence(x, z0);
      if (Math.abs(x - cx) > 1) fence(x, z1);
    }
    for (let z = z0; z <= z1; z++) {
      fence(x0, z);
      fence(x1, z);
    }
    for (const [x, z] of posts) {
      for (let y = 1; y <= 3; y++) put(x, y, z, B.LOG);
      put(x, 4, z, B.TORCH);
    }    // How far from the dummies (they stand on z = -19.5): a stripe of wool across the floor, then on the path.
    const row = DUMMY_SPOTS[0].z;
    const mark = (d: number, color: number): void => {
      const z = Math.floor(row + d);
      const wide = z < z1;
      for (let x = wide ? cx - 1 : cx; x <= (wide ? cx + 1 : cx); x++) this.paint.set(key(x, z), woolId(color));
      if (!wide) {
        put(cx - 1, 1, z, B.FENCE);
        put(cx - 1, 2, z, woolId(color));
      }
    };
    mark(5, 4);
    mark(10, 5);
    mark(15, 14);
  }

  // ---- the Undercroft ---------------------------------------------------------------------------

  /** The cellar house, a small stone house in the south-west of the village: its door faces the road, and a stair goes down through its floor. */
  private buildCellarHouse(): void {
    const put = this.vox(this.hubY);
    const { x0, x1, z0, z1 } = CELLAR_HOUSE;
    const doorX = x0 + 1;
    this.pave(doorX, 2, doorX, z0 - 1, B.GRAVEL);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const edge = x === x0 || x === x1 || z === z0 || z === z1;
        const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
        put(x, 0, z, B.STONE_BRICKS);
        if (edge) for (let dy = 1; dy <= 3; dy++) put(x, dy, z, corner ? B.LOG : dy === 1 ? B.STONE_BRICKS : B.COBBLE);
        put(x, 4, z, B.STONE_BRICKS);
        if (edge) put(x, 5, z, slabId(1, false));
      }
    }
    put(doorX, 1, z0, doorId(false, false, 3));
    put(doorX, 2, z0, doorId(true, false, 3));
    // Torches on the long walls, inside, and a lamp post on each side of the door.
    for (const x of [x0 + 3, x0 + 6]) {
      put(x, 2, z0 + 1, B.TORCH_NZ);
      put(x, 2, z1 - 1, B.TORCH_PZ);
    }
    lampPost(put, doorX - 1, z0 - 1);
    lampPost(put, doorX + 1, z0 - 1);
  }

  /**
   * The stair from the cellar house down to the Undercroft, cut in the rock: three wide, a stone-brick step for every block
   * it goes west to east, four blocks of headroom, and a torch on a post every fourth step. (The cave itself is carved by
   * `carveUndercroft`, chunk by chunk; what stands in it is planned here.)
   */
  private buildUndercroft(): void {
    const hy = this.hubY;
    const fy = this.undercroftY;
    const step = stairId(4, false, 1);
    for (let k = 0; k < UNDERCROFT_DEPTH; k++) {
      const x = STAIR_X0 + k;
      const y = hy - k;
      // Rock round the cut (only where there is none), the air in it, and the step: the first five lie under the house, whose floor is open there.
      this.box(x, y - 1, STAIR_Z - 2, x, Math.min(y + 5, hy - 1), STAIR_Z + 2, B.STONE, 'fill');
      const top = k < 5 ? hy : y + 4;
      if (y + 1 <= top) this.box(x, y + 1, STAIR_Z - 1, x, top, STAIR_Z + 1, B.AIR);
      this.box(x, y, STAIR_Z - 1, x, y, STAIR_Z + 1, step);
      if (k >= 6 && k % 4 === 3) {
        const z = STAIR_Z + (k % 8 === 3 ? -1 : 1);
        this.box(x, y + 1, z, x, y + 1, z, B.COBBLE);
        this.box(x, y + 2, z, x, y + 2, z, B.TORCH);
      }
    }

    // What stands in the cave (always inside it: see `caveTop`).
    const put = this.vox(fy);
    const inside = (x: number, z: number, height = 3): boolean => this.caveTop(x, z) >= height;
    // Three cots along the north wall, their heads to it.
    for (const x of [-8, -5, -2]) {
      if (inside(x, 7) && inside(x, 8)) {
        put(x, 1, 8, bedId(false, 3));
        put(x, 1, 7, bedId(true, 3));
      }
    }
    // The healer's shelves and workbench against the south side.
    for (const x of [-8, -7, -6, -5]) {
      for (const dy of [1, 2]) if (inside(x, 17)) put(x, dy, 17, B.BOOKSHELF);
    }
    put(-4, 1, 17, B.CRAFTING_TABLE);
    put(-3, 1, 17, B.FURNACE);
    // Lamps: a cobblestone post with a torch on it.
    for (const [x, z] of [[-12, 8], [-12, 16], [0, 7], [1, 16], [2, 22], [-3, 24], [8, 12], [12, 13], [5, 20]]) {
      if (inside(x, z)) {
        put(x, 1, z, B.COBBLE);
        put(x, 2, z, B.TORCH);
      }
    }
    // A few stalagmites in the far chambers (the near one stays clear, where people wake up).
    for (let z = CAVE_BOX.z0; z <= CAVE_BOX.z1; z++) {
      for (let x = CAVE_BOX.x0; x <= CAVE_BOX.x1; x++) {
        if (x <= 2 && z >= 6 && z <= 19) continue;
        const h = hash2(this.seed + 81, x, z);
        if (h < 0.03 && inside(x, z, 4)) for (let dy = 1; dy <= 1 + Math.floor(h * 100) % 2; dy++) put(x, dy, z, B.MOSSY_COBBLE);
      }
    }
  }

  /** How many blocks of air there are over the floor of the cave in this column (0: solid rock). */
  private caveTop(x: number, z: number): number {
    let top = 0;
    for (const b of CAVE_BLOBS) {
      const dx = (x + 0.5 - b.x) / b.rx;
      const dz = (z + 0.5 - b.z) / b.rz;
      const d2 = dx * dx + dz * dz;
      if (d2 < 1) top = Math.max(top, 3 + Math.floor(3.5 * (1 - d2) + hash2(this.seed + 80, x, z) * 0.9));
    }
    if (x >= CAVE_HALL.x0 && x <= CAVE_HALL.x1 && z >= CAVE_HALL.z0 && z <= CAVE_HALL.z1) top = Math.max(top, 4);
    return top;
  }

  /** Cut the cave into the rock of a chunk: air over a floor of mossy stone, rock all round it, and now and then a glowing stone in the roof. */
  private carveUndercroft(blocks: Uint16Array, ox: number, oz: number): void {
    if (ox + CHUNK_SIZE <= CAVE_BOX.x0 || ox > CAVE_BOX.x1 || oz + CHUNK_SIZE <= CAVE_BOX.z0 || oz > CAVE_BOX.z1) return;
    const fy = this.undercroftY;
    const rock = (lx: number, y: number, lz: number): void => {
      const i = blockIndex(lx, y, lz);
      if (!IS_SOLID[blocks[i]]) blocks[i] = B.STONE;
    };
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx;
        const wz = oz + lz;
        if (wx < CAVE_BOX.x0 || wx > CAVE_BOX.x1 || wz < CAVE_BOX.z0 || wz > CAVE_BOX.z1) continue;
        const top = this.caveTop(wx, wz);
        // The tallest roof of the columns round this one (and its own): the rock must close every air block of theirs.
        let near = top;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) near = Math.max(near, this.caveTop(wx + dx, wz + dz));
        if (top > 0) {
          rock(lx, fy - 1, lz);
          const roll = hash2(this.seed + 82, wx, wz);
          blocks[blockIndex(lx, fy, lz)] = roll < 0.3 ? B.COBBLE : roll < 0.55 ? B.MOSSY_COBBLE : roll < 0.7 ? B.GRAVEL : B.STONE;
          for (let y = fy + 1; y <= fy + top; y++) blocks[blockIndex(lx, y, lz)] = B.AIR;
          if (hash2(this.seed + 83, wx, wz) < 0.015) blocks[blockIndex(lx, fy + top + 1, lz)] = B.GLOWSTONE;
          for (let y = fy + top + 1; y <= fy + near + 1; y++) rock(lx, y, lz);
          continue;
        }
        for (let y = fy; near > 0 && y <= fy + near + 1; y++) rock(lx, y, lz);
      }
    }
  }

  /** The chapel on the surface: a broken ring of stone brick round a portal to the dungeon. */
  private buildRuin(): void {
    const g = this.ruinY;
    const put = this.vox(g);
    const cx = DUNGEON_X;
    const cz = DUNGEON_Z;
    const h = RUIN_HALF;
    for (let dz = -h; dz <= h; dz++) {
      for (let dx = -h; dx <= h; dx++) {
        const x = cx + dx;
        const z = cz + dz;
        const r = Math.max(Math.abs(dx), Math.abs(dz));
        const roll = hash2(this.seed + 50, x, z);
        put(x, 0, z, r === h ? B.STONE_BRICKS : roll < 0.45 ? B.MOSSY_COBBLE : roll < 0.8 ? B.COBBLE : B.STONE_BRICKS);
        if (r === h) {
          const gate = dx === -h && Math.abs(dz) <= 1;
          const corner = Math.abs(dx) === h && Math.abs(dz) === h;
          const tall = corner ? 5 : Math.abs(dx) === h && Math.abs(dz) === 2 ? 4 : 1 + Math.floor(hash2(this.seed + 51, x, z) * 3);
          if (!gate) for (let y = 1; y <= tall; y++) put(x, y, z, y > 1 && hash2(this.seed + 52, x + y, z) < 0.25 ? B.MOSSY_COBBLE : B.STONE_BRICKS);
          if (corner) put(x, 6, z, B.TORCH);
        } else if (roll > 0.93) {
          put(x, 1, z, B.COBBLE);
        }
      }
    }
    // The gate: a lintel over the way in, with a torch on each post.
    for (const dz of [-2, 2]) put(cx - h, 5, cz + dz, B.TORCH);
    for (let dz = -2; dz <= 2; dz++) put(cx - h, 4, cz + dz, B.STONE_BRICKS);
    // The portal in the middle: a frame of obsidian, 3 wide and 3 high inside, across the way in (the gate is west).
    for (const dz of [-3, 3]) put(cx, 0, cz + dz, B.STONE_BRICKS);
    for (let dz = -2; dz <= 2; dz++) {
      const post = Math.abs(dz) === 2;
      put(cx, 0, cz + dz, B.OBSIDIAN);
      for (let y = 1; y <= 3; y++) put(cx, y, cz + dz, post ? B.OBSIDIAN : B.PORTAL);
      put(cx, 4, cz + dz, B.OBSIDIAN);
    }
    for (const dz of [-3, 3]) put(cx - 1, 1, cz + dz, B.TORCH);
  }

  /**
   * The Hollow Cellar (the first copy of it; the others are this shifted along z): a gatehall with the way out in its
   * west wall, a crypt and a vault, joined by passages, all cut in solid rock.
   */
  private buildCellar(): void {
    const fy = this.cellarY;
    const z = this.roomZ;
    const rx = this.roomX;

    const room = (x0: number, x1: number, hz: number, floor: (x: number, zz: number) => number): void => {
      this.box(x0 - 1, fy - 1, z - hz - 1, x1 + 1, fy + 7, z + hz + 1, B.STONE_BRICKS, 'set');
      this.box(x0, fy + 1, z - hz, x1, fy + 5, z + hz, B.AIR);
      for (let zz = z - hz; zz <= z + hz; zz++) for (let x = x0; x <= x1; x++) this.box(x, fy, zz, x, fy, zz, floor(x, zz));
    };
    const mossy = (x: number, zz: number): number => {
      const r = hash2(this.seed + 60, x, zz);
      return r < 0.45 ? B.MOSSY_COBBLE : r < 0.75 ? B.COBBLE : B.STONE_BRICKS;
    };
    const pillar = (x: number, zz: number, tall: number): void => {
      this.box(x, fy + 1, zz, x, fy + tall, zz, B.STONE_BRICKS);
    };
    const lamp = (x: number, zz: number): void => {
      this.box(x, fy + 1, zz, x, fy + 1, zz, B.COBBLE);
      this.box(x, fy + 2, zz, x, fy + 2, zz, B.TORCH);
    };
    const passage = (x0: number, x1: number): void => {
      this.box(x0, fy - 1, z - 2, x1, fy + 6, z + 2, B.STONE_BRICKS, 'set');
      this.box(x0, fy + 1, z - 1, x1, fy + 4, z + 1, B.AIR);
      this.box(x0, fy, z - 1, x1, fy, z + 1, B.COBBLE);
    };
    const cage = (i: number): void => {
      const c = this.cages[i];
      this.box(c.x, c.y, c.z, c.x, c.y, c.z, B.SPAWNER);
    };

    // The gatehall.
    room(rx, rx + 10, 5, mossy);
    lamp(rx + 1, z - 4);
    lamp(rx + 1, z + 4);
    lamp(rx + 9, z - 4);
    lamp(rx + 9, z + 4);
    cage(0);
    this.chest(rx + 9, fy + 1, z - 3, 'dungeon');
    // The crypt: pillars, and a cage in the middle.
    const bx = rx + 19;
    room(bx, bx + 12, 6, mossy);
    for (const dx of [3, 9]) for (const dz of [-3, 3]) pillar(bx + dx, z + dz, 5);
    lamp(bx + 1, z - 5);
    lamp(bx + 1, z + 5);
    lamp(bx + 11, z - 5);
    lamp(bx + 11, z + 5);
    cage(1);
    this.chest(bx + 11, fy + 1, z + 5, 'dungeon');
    // The vault: a cage, and the treasure at the back.
    const cx = bx + 21;
    room(cx, cx + 10, 5, (x, zz) => (Math.abs(zz - z) <= 1 && x >= cx + 7 ? B.STONE_BRICKS : mossy(x, zz)));
    lamp(cx + 1, z - 4);
    lamp(cx + 1, z + 4);
    cage(2);
    this.chest(cx + 9, fy + 1, z - 1, 'temple');
    this.chest(cx + 9, fy + 1, z + 1, 'temple');
    // The passages between the rooms (cut last, so that a room's wall does not close them).
    passage(rx + 11, rx + 18);
    passage(bx + 13, bx + 20);
    // The way out: a portal in the west wall of the gatehall, in a frame of obsidian, with a torch on each side.
    this.box(rx - 1, fy, z - 2, rx - 1, fy + 4, z + 2, B.OBSIDIAN);
    this.box(rx - 1, fy + 1, z - 1, rx - 1, fy + 3, z + 1, B.PORTAL);
    lamp(rx, z - 3);
    lamp(rx, z + 3);
  }
}
