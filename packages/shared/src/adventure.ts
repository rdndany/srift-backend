import { B, IS_LIQUID, IS_SOLID, LEAF_BLOCKS, LOG_BLOCKS, bedId, chestId, doorId, slabId, stairId, woolId } from './blocks';
import { buildCastle } from './castle';
import { CHUNK_SIZE, SEA_LEVEL, WORLD_HEIGHT, blockIndex } from './chunk';
import type { LootTableName } from './loot';
import type { MobKind } from './mobs';
import { hash2 } from './noise';
import { NPCS, type DummyStation, type NpcStation } from './quests';
import { Lot, type Put, auctionHouse, farm, house, lampPost, stall, stashHouse, styleFor, tower, waystone, well } from './villageBuilders';
import { banner, bench, cart, crates, fencedRing, flowerGarden, fountain, hayBale, obelisk, shelter, tree } from './villageDecor';
import { buildWall } from './villageWall';
import { I } from './items';
import { DEEP_U, DEEP_V, DEEP_V0, buildHollowDeep, type DeepModel } from './hollowDeep';
import { BeyondWorldGenerator } from './beyondWorld';
import { ASHBROOK_GREEN, ASHBROOK_ROAD_TURN_X, CLEARING, GREYKEEP_SHIFT_Z, OUTPOSTS, UNDERCROFT_ORIGIN, VAULTS, VAULT_HALF, WORKSHOPS, WORKSHOP_BENCH, outpostById, type OutpostDef, type VaultDef, type WorkshopSpot } from './outposts';
import type { RealmMap, RealmSite } from './beyondRealms';
import { type Column, type InstanceBoss, type InstanceGate, type InstanceMob, type InstanceRequirement, type ProtectedArea } from './worldgen';

/**
 * The world of the Adventure mode. It is the ordinary generated world with two made places set into it
 * at fixed spots, the same for every player:
 *
 *  - Dawnwatch, a small village on a levelled square around the origin, where the quest givers stand (the paved
 *    Landing is where you come back to after a death), and under it the Undercroft, a cave where every new
 *    character wakes, with a stair up to the village;
 *  - the Hollow Cellar, a dungeon a little way east along a gravel road: a ruined chapel on the surface with a
 *    portal in it. The dungeon itself is not under the chapel but in a separate map, far from the land: a gatehall
 *    with a warden in it, a great nave with a wing of rooms to each side, a court and an armoury behind an iron gate,
 *    and the Hollow King's throne hall behind another. Its monsters stand where they were put; three cages are the
 *    locks of its gates. Every player gets a copy of their own (an "instance", see `instanceAt`), so nobody waits for
 *    anybody and nobody can spoil it for anyone.
 *
 * Like all generation this is a pure function of the seed (the mode uses `ADVENTURE_SEED`), so the client,
 * the server and the tests all see the same places.
 */

/** The seed of the Adventure world: a fixed one, so that everybody finds the same village and the same dungeon. */
export const ADVENTURE_SEED = 2036;
/**
 * Which version of the made places (the village, the Undercroft, the chapel) the generator makes. (Version 14 put the Undercroft and the first quests in Ashbrook, a small village of its own, and left Dawnwatch the big city. Version 13 moved the whole Adventure onto the World Beyond, with outposts, vaults and Greykeep out in it; version 12 took Greykeep away: it stands in the
 * castle world now, see castleWorld.ts, and a saved world has its old ground put back, see `mendProtected`.) A saved world keeps the
 * chunks that were ever changed, as they were; a server that finds it saved an older version puts the protected places
 * back (see `WorldGenerator.mendProtected`). Raise it whenever those places are rebuilt.
 */
export const ADVENTURE_LAYOUT = 14;
/** How far the land is slid under the made places (found by a search for good ground; see the generator). */
export const ADVENTURE_OFFSET_X = -20;
export const ADVENTURE_OFFSET_Z = 236;

/** Where Greykeep stood, with the flat ground and the skirt that eased it into the land (x and z, inclusive): see `mendProtected`. */
const FORMER_CASTLE = { x0: -40, x1: 40, z0: -118, z1: -38 } as const;

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
const VAULT_NAMES: Record<VaultDef['id'], string> = { reed_grotto: 'The Reed Grotto', sand_crypt: 'The Sand Crypt', frost_vault: 'The Frost Vault' };
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
 * The Undercroft: a cave under Ashbrook, the small village where every new character wakes (the hunters found them half dead in the
 * forest and carried them down here). Its floor lies this far under the village's ground; a long stair climbs from its west end to a
 * stone house in the south-west of the village. The points below are drawn round `UNDERCROFT_ORIGIN`.
 */
const UX = UNDERCROFT_ORIGIN.x;
const UZ = UNDERCROFT_ORIGIN.z;
export const UNDERCROFT_DEPTH = 17;
/** The chambers of the cave: ellipses (middle and radii, in blocks), whose roofs arch from 3 up to 7 blocks above the floor. */
const CAVE_BLOBS: readonly { x: number; z: number; rx: number; rz: number }[] = [
  { x: UX - 4, z: UZ + 12, rx: 10, rz: 7 },
  { x: UX + 2, z: UZ + 22, rx: 7, rz: 6 },
  { x: UX + 10, z: UZ + 10, rx: 6, rz: 5 },
];
/** Where the stair meets the cave: a short hall, flat and 4 high. */
const CAVE_HALL = { x0: UX - 16, x1: UX - 12, z0: UZ + 11, z1: UZ + 13 };
/** The cave lies inside this box (x and z, inclusive). */
const CAVE_BOX = { x0: UX - 17, x1: UX + 17, z0: UZ + 4, z1: UZ + 29 };
/** The cellar house over the stair: its outer walls (inclusive). The stair runs east to west under it, three wide (z 11..13), one step down for every block. */
export const CELLAR_HOUSE = { x0: UX - 35, x1: UX - 28, z0: UZ + 9, z1: UZ + 15 } as const;
/** The block where the stair starts (x of its first step) and the z of its middle. */
const STAIR_X0 = CELLAR_HOUSE.x0 + 2;
const STAIR_Z = UZ + 12;
/** Twelve places to wake up on, in front of the healer. */
export const UNDERCROFT_SPAWNS: readonly { x: number; z: number }[] = [-6.5, -4.5, -2.5, -0.5].flatMap((x) => [10.5, 12.5, 14.5].map((z) => ({ x: UX + x, z: UZ + z })));
/** The experience level the Hollow Cellar asks for. */
export const DUNGEON_MIN_LEVEL = 5;

/**
 * The dungeon copies lie in a field of their own, far east of the land, one after the other along z. Every copy is
 * the same rooms, shifted by `INSTANCE_STRIDE` blocks of z; each is cut in solid rock under a sealed sky, so that
 * nothing wanders in from outside and nothing in one can be seen from the next.
 */
export const INSTANCE_X0 = 4096;
export const INSTANCE_Z0 = 4096;
export const INSTANCE_LENGTH = DEEP_U;
export const INSTANCE_STRIDE = DEEP_V;
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
/** The floor of the camp at the top of the dungeon (the caves go down from it). */
export const INSTANCE_FLOOR = 150;
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
  /** How much air to clear above the levelled ground. The castle needs more than a house. */
  air?: number;
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

export class AdventureWorldGenerator extends BeyondWorldGenerator {
  override readonly kind = 'adventure' as const;

  /** The height of the village's ground. */
  readonly hubY: number;
  /** The height of the ground around the chapel. */
  readonly ruinY: number;
  /** The floor of the Undercroft (the block under your feet). */
  readonly undercroftY: number;
  /** The floor of the dungeon's camp, at the top of the caves. */
  readonly cellarY = INSTANCE_FLOOR;
  /** The middle of the first copy, along z (the copies are this shifted by `INSTANCE_STRIDE`). */
  readonly roomZ = INSTANCE_Z0 - DEEP_V0;
  /** The first copy of the dungeon, a cave system (see hollowDeep.ts). */
  readonly deep: DeepModel;
  private readonly plots: Plot[];
  private readonly paint = new Map<string, number>();
  private readonly voxels = new Map<string, number[]>();
  /** The boxes, in the order they were drawn (later ones cut into earlier ones), kept by chunk since most chunks touch none of them. */
  private readonly ops = new Map<string, Op[]>();
  /** The ground of each outpost, of each vault and of the clearing. */
  private readonly outpostY = new Map<string, number>();
  private readonly vaultY = new Map<string, number>();
  private clearingY = 0;
  private readonly outpostPlots = new Map<string, Plot>();
  private readonly vaultPlots: Plot[] = [];
  /** What each vault cage makes, by the cage block. */
  private readonly vaultSpawners = new Map<string, MobKind>();
  private readonly chests = new Map<string, LootTableName>();

  /** How far the land under this world is slid: the village stands where the generated land is good, not at the origin. */
  readonly offsetX = ADVENTURE_OFFSET_X;
  readonly offsetZ = ADVENTURE_OFFSET_Z;

  /** The realms, slid with the land: what the realm features draw must lie where the land says the realm is. */
  protected override realmHost(): Pick<RealmMap, 'at' | 'nearby'> {
    const real = this.land.realms;
    const slide = (s: RealmSite): RealmSite => ({ ...s, cx: s.cx - ADVENTURE_OFFSET_X, cz: s.cz - ADVENTURE_OFFSET_Z });
    return {
      at: (x, z) => {
        const hit = real.at(x + ADVENTURE_OFFSET_X, z + ADVENTURE_OFFSET_Z);
        return hit ? { ...hit, site: slide(hit.site) } : null;
      },
      nearby: (x, z, rings) => real.nearby(x + ADVENTURE_OFFSET_X, z + ADVENTURE_OFFSET_Z, rings).map(slide),
    };
  }

  constructor(seed: number) {
    super(seed);
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
    this.plots = [
      { cx: 0, cz: 0, half: HUB_HALF, skirt: HUB_SKIRT, g: this.hubY },
      { cx: DUNGEON_X, cz: DUNGEON_Z, half: RUIN_HALF + 3, skirt: RUIN_SKIRT, g: this.ruinY },
    ];
    // The outposts, the vaults and the clearing: each is levelled at the median height of the land it covers.
    const spread = (cx: number, cz: number, half: number): number[] => [-0.6, -0.3, 0, 0.3, 0.6].map((t) => Math.round(t * half));
    const groundOf = (cx: number, cz: number, half: number, lo: number, hi: number): number => {
      const s = spread(cx, cz, half);
      return clamp(median(heights(s.map((d) => cx + d), s.map((d) => cz + d))), lo, hi);
    };
    for (const o of OUTPOSTS) {
      const grey = o.id === 'greykeep';
      const pcz = grey ? o.z - 20 : o.z;
      const g = groundOf(o.x, pcz, o.half, SEA_LEVEL + 2, SEA_LEVEL + 30);
      const plot: Plot = { cx: o.x, cz: pcz, half: o.half, skirt: 8, g, ...(grey ? { air: 46 } : {}) };
      this.outpostY.set(o.id, g);
      this.outpostPlots.set(o.id, plot);
      this.plots.push(plot);
    }
    // Ashbrook is never lower than SEA_LEVEL + 2, so the floor of the cave under it never comes near the bedrock.
    this.undercroftY = (this.outpostY.get('ashbrook') ?? this.hubY) - UNDERCROFT_DEPTH;
    for (const v of VAULTS) {
      const g = groundOf(v.x, v.z, VAULT_HALF, SEA_LEVEL + 3, SEA_LEVEL + 30);
      const plot: Plot = { cx: v.x, cz: v.z, half: VAULT_HALF, skirt: 6, g };
      this.vaultY.set(v.id, g);
      this.vaultPlots.push(plot);
      this.plots.push(plot);
    }
    this.clearingY = groundOf(CLEARING.x, CLEARING.z, CLEARING.r, SEA_LEVEL + 2, SEA_LEVEL + 40);
    this.plots.push({ cx: CLEARING.x, cz: CLEARING.z, half: CLEARING.r, skirt: 6, g: this.clearingY });

    this.buildVillage();
    this.buildCellarHouse();
    this.buildUndercroft();
    this.scatterGreens();
    this.buildRuin();
    this.buildOutposts();
    // The dungeon: a cave system, built once and copied into every instance's chunks.
    this.deep = buildHollowDeep(seed, INSTANCE_FLOOR);
    for (const c of this.deep.chests) this.chests.set(`${INSTANCE_X0 + c.u},${c.y},${this.roomZ + c.v}`, c.table);
  }

  // ---- the world --------------------------------------------------------------------------------

  /**
   * The land (heights, biomes, climate) is the generated world slid by the offset, so that the origin, where
   * every seed has a river, is a good place for a village. Everything else in the generator asks these two.
   */
  override columnAt(wx: number, wz: number): Column {
    return super.columnAt(wx + ADVENTURE_OFFSET_X, wz + ADVENTURE_OFFSET_Z);
  }

  override climateAt(wx: number, wz: number): { t: number; h: number } {
    return super.climateAt(wx + ADVENTURE_OFFSET_X, wz + ADVENTURE_OFFSET_Z);
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
    this.ashbrookRoad(blocks, ox, oz);
    for (const op of this.ops.get(`${cx},${cz}`) ?? []) this.write(blocks, op, ox, oz);
    return blocks;
  }

  override findSpawn(): { x: number; y: number; z: number } {
    return this.spawnFor(0);
  }

  /**
   * Whoever comes back to life (and anybody who arrives without a story: a creative character) is put on the green of Ashbrook, each on a
   * different block: the slot is the n-th arrival, and the steps of 37 visit all 144 blocks (37 and 144 share no factor) before any is used twice.
   * (Dawnwatch has a Landing of its own, a paved square that nobody is born on: see `landingFor`.)
   */
  override spawnFor(slot: number): { x: number; y: number; z: number } {
    const o = outpostById('ashbrook')!;
    const n = ASHBROOK_GREEN.size;
    const cell = ((Math.floor(slot) % (n * n)) * 37 + 5) % (n * n);
    return { x: o.x + ASHBROOK_GREEN.x0 + (cell % n) + 0.5, y: this.startY + 1, z: o.z + ASHBROOK_GREEN.z0 + Math.floor(cell / n) + 0.5 };
  }

  /** The n-th spot on the Landing, the paved square at the south gate of Dawnwatch where the road from the south comes in (see `SPAWN_X0`). */
  landingFor(slot: number): { x: number; y: number; z: number } {
    const cell = ((Math.floor(slot) % (SPAWN_SIZE * SPAWN_SIZE)) * 37 + 5) % (SPAWN_SIZE * SPAWN_SIZE);
    return { x: SPAWN_X0 + (cell % SPAWN_SIZE) + 0.5, y: this.hubY + 1, z: SPAWN_Z0 + Math.floor(cell / SPAWN_SIZE) + 0.5 };
  }

  /** The ground of Ashbrook, the village where the story starts. */
  get startY(): number {
    return this.outpostY.get('ashbrook') ?? this.hubY;
  }

  /**
   * A new character does not arrive on the green: they wake in the Undercroft, the cave under Ashbrook, in front of
   * its healer, each on a spot of their own (the steps of 5 visit all twelve before any is used twice).
   */
  override startFor(slot: number): { x: number; y: number; z: number } {
    const spot = UNDERCROFT_SPAWNS[(Math.floor(slot) * 5) % UNDERCROFT_SPAWNS.length];
    return { x: spot.x, y: this.undercroftY + 1, z: spot.z };
  }

  override npcStations(): readonly NpcStation[] {
    const made = NPCS.flatMap((npc, index): NpcStation[] => {
      if (npc.dungeon) return [];
      // The people of the outposts stand on the ground of their own place (their x and z are already the world's).
      if (npc.place) return [{ npc, index, x: npc.x, y: (npc.cellar ? this.undercroftY : (this.outpostY.get(npc.place) ?? this.hubY)) + 1, z: npc.z }];
      return [{ npc, index, x: npc.x, y: (npc.cellar ? this.undercroftY : this.hubY) + 1, z: npc.z }];
    });
    // A dungeon's person stands in every copy of it, at the same spot.
    const inCopies = NPCS.flatMap((npc, index): NpcStation[] =>
      npc.dungeon ? Array.from({ length: INSTANCE_SLOTS }, (_, slot) => ({ npc, index, key: 1000 + index * INSTANCE_SLOTS + slot, x: npc.x, y: this.cellarY + 1, z: npc.z + slot * INSTANCE_STRIDE })) : [],
    );
    return [...made, ...inCopies];
  }

  override dummyStations(): readonly DummyStation[] {
    return DUMMY_SPOTS.map((s, index) => ({ index, x: s.x, y: this.hubY + 1, z: s.z, yaw: Math.PI }));
  }

  override zoneAt(x: number, y: number, z: number): string | null {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    if (this.instanceAt(bx, bz) >= 0) return 'hollow_cellar';
    const inVillage = bx >= -HUB_HALF && bx < HUB_HALF && bz >= -HUB_HALF && bz < HUB_HALF;
    // Ashbrook: below its ground (the cave and the stair down to it; the first step on the stair is already in the village) is the Undercroft.
    const ash = this.outpostPlots.get('ashbrook');
    if (ash && this.inPlot(ash, bx, bz, 4)) return y < ash.g + 0.75 ? 'undercroft' : 'ashbrook';
    if (bx >= YARD.x0 && bx <= YARD.x1 && bz >= YARD.z0 && bz <= YARD.z1) return 'training_yard';
    if (inVillage) return 'dawnwatch';
    for (const v of VAULTS) if (this.inVault(v, bx, y, bz)) return v.id;
    for (const o of OUTPOSTS) {
      const p = this.outpostPlots.get(o.id);
      if (p && this.inPlot(p, bx, bz, 4)) return o.id;
    }
    if (Math.hypot(bx + 0.5 - CLEARING.x, bz + 0.5 - CLEARING.z) <= CLEARING.r) return 'whisper_clearing';
    if (Math.abs(bx - DUNGEON_X) <= RUIN_HALF + 4 && Math.abs(bz - DUNGEON_Z) <= RUIN_HALF + 4) return 'chapel_ruin';
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

  /** Dawnwatch is safe: no monster is born in it or within `SAFE_BUFFER` blocks, and none that wanders in stays. */
  override safeFromMonsters(x: number, z: number, margin = 0): boolean {
    const h = HUB_HALF + margin;
    if (x >= -h && x < h && z >= -h && z < h) return true;
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    for (const p of this.outpostPlots.values()) if (this.inPlot(p, bx, bz, margin)) return true;
    return false;
  }

  /** The Hollow Cellar is not for beginners, and its portal opens only for a Hollow Sigil (a Warden Scroll joined to a Hollow Bone), which a new copy uses up. */
  override instanceRequirement(): InstanceRequirement {
    return { name: 'The Hollow Cellar', level: DUNGEON_MIN_LEVEL, item: I.HOLLOW_SIGIL, consume: true };
  }

  /** The camp at the top of the caves, a few steps in front of the way out, facing the caves (+x). */
  override instanceEntry(slot: number): { x: number; y: number; z: number; yaw: number } | null {
    if (!(slot >= 0 && slot < INSTANCE_SLOTS)) return null;
    const e = this.deep.entry;
    return { x: INSTANCE_X0 + e.u + 0.5, y: e.y, z: this.roomZ + slot * INSTANCE_STRIDE + e.v + 0.5, yaw: e.yaw };
  }

  /** Just outside the chapel's portal, facing back down the road (-x). */
  override instanceExit(): { x: number; y: number; z: number; yaw: number } {
    return { x: PORTAL_X - 3.5, y: this.ruinY + 1, z: DUNGEON_Z + 0.5, yaw: Math.PI / 2 };
  }

  /** The Hollow King waits in the Molten Heart, the lowest cavern, in front of his obsidian throne, facing the way in (+x). */
  override instanceBoss(slot: number): InstanceBoss | null {
    if (!(slot >= 0 && slot < INSTANCE_SLOTS)) return null;
    const dz = this.roomZ + slot * INSTANCE_STRIDE;
    const b = this.deep.boss;
    const a = this.deep.arena;
    const e = this.deep.exitPortal;
    return { x: INSTANCE_X0 + b.u + 0.5, y: b.y, z: dz + b.v + 0.5, yaw: b.yaw, arena: { x0: INSTANCE_X0 + a.u0, z0: dz + a.v0, x1: INSTANCE_X0 + a.u1, z1: dz + a.v1 }, exit: { x: INSTANCE_X0 + e.u, y: e.y, z: dz + e.v } };
  }

  /** The cages of a copy (the cage blocks stand on the floor of a grotto each). */
  instanceCages(slot: number): { x: number; y: number; z: number }[] {
    return this.deep.cages.map((c) => ({ x: INSTANCE_X0 + c.u, y: c.y, z: this.roomZ + slot * INSTANCE_STRIDE + c.v }));
  }

  /** The cages of a copy make nothing: they are locks (see `instanceGates`). */
  override spawnerAt(x: number, y: number, z: number): MobKind | null {
    return this.vaultSpawners.get(`${x},${y},${z}`) ?? (this.instanceAt(x, z) < 0 ? super.spawnerAt(x, y, z) : null);
  }

  /** The dungeon's monsters, each put at its post, one or two of a kind and a few strong ones (elites) by the cages. They stand until they see somebody (see `Mob.guard`). */
  override instanceMobs(slot: number): readonly InstanceMob[] {
    if (!(slot >= 0 && slot < INSTANCE_SLOTS)) return [];
    const dz = this.roomZ + slot * INSTANCE_STRIDE;
    return this.deep.posts.map((p) => ({
      kind: p.kind,
      x: INSTANCE_X0 + p.u + 0.5,
      y: p.y,
      z: dz + p.v + 0.5,
      yaw: hash2(this.seed + 63, p.u, p.v) * Math.PI * 2,
      ...(p.elite ? { elite: p.elite } : {}),
    }));
  }

  /** Two iron gates, straight corridors of the caves: the first under the lush cave (shut until the first two cages are broken) and the second before the Molten Heart (until the third is). */
  override instanceGates(slot: number): readonly InstanceGate[] {
    if (!(slot >= 0 && slot < INSTANCE_SLOTS)) return [];
    const dz = this.roomZ + slot * INSTANCE_STRIDE;
    const cages = this.instanceCages(slot);
    return this.deep.gates.map((g) => ({
      id: g.id,
      name: g.name,
      cages: g.cages.map((i) => cages[i]),
      boxes: [{ x0: INSTANCE_X0 + g.u, x1: INSTANCE_X0 + g.u, y0: g.y0, y1: g.y1, z0: dz + g.v0, z1: dz + g.v1 }],
    }));
  }

  /** One copy of the dungeon: solid rock all the way up, and the caves cut in it. */
  private instanceChunk(slot: number, ox: number, oz: number): Uint16Array {
    const blocks = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    blocks.fill(B.STONE, blockIndex(0, 1, 0));
    blocks.fill(B.BEDROCK, 0, blockIndex(0, 1, 0));
    this.deep.fillChunk(blocks, ox, oz, INSTANCE_X0, INSTANCE_Z0 + slot * INSTANCE_STRIDE, blockIndex);
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
    // The outposts and the vaults, from bedrock to sky: nobody tears down a village or breaks a cage.
    for (const p of this.outpostPlots.values()) if (this.inPlot(p, bx, bz)) return true;
    for (const p of this.vaultPlots) if (this.inPlot(p, bx, bz)) return true;
    // The chapel: its ring and the portal in it, from bedrock to sky.
    if (Math.abs(bx - DUNGEON_X) <= RUIN_HALF && Math.abs(bz - DUNGEON_Z) <= RUIN_HALF) return true;
    // The dungeon is free to dig and build in (its walls and seals are bedrock): only the bars of its gates and the portal back stay.
    const slot = this.instanceAt(bx, bz);
    if (slot < 0) return false;
    return this.deep.protectedAt(bx - INSTANCE_X0, by, bz - (INSTANCE_Z0 + slot * INSTANCE_STRIDE - DEEP_V0));
  }

  /** The protected places of `isProtected` that are square (the town, the outposts, the vaults, the chapel), named, for those touching the box. */
  override protectedAreas(x0: number, z0: number, x1: number, z1: number): readonly ProtectedArea[] {
    const out: ProtectedArea[] = [];
    const add = (name: string, a0: number, b0: number, a1: number, b1: number): void => {
      if (a1 >= x0 && a0 <= x1 && b1 >= z0 && b0 <= z1) out.push({ name, x0: a0, z0: b0, x1: a1, z1: b1 });
    };
    add('Dawnwatch', -HUB_HALF, -HUB_HALF, HUB_HALF - 1, HUB_HALF - 1);
    for (const o of OUTPOSTS) {
      const p = this.outpostPlots.get(o.id);
      if (p) add(o.name, p.cx - p.half, p.cz - p.half, p.cx + p.half - 1, p.cz + p.half - 1);
    }
    this.vaultPlots.forEach((p, i) => add(VAULTS[i] ? VAULT_NAMES[VAULTS[i].id] : 'Vault', p.cx - p.half, p.cz - p.half, p.cx + p.half - 1, p.cz + p.half - 1));
    add('The Chapel Ruin', DUNGEON_X - RUIN_HALF, DUNGEON_Z - RUIN_HALF, DUNGEON_X + RUIN_HALF, DUNGEON_Z + RUIN_HALF);
    return out;
  }

  /**
   * Besides the protected places: the ground Greykeep stood on (the castle and the flat land and skirt round it) goes back to the land as
   * it is now, in a world that was saved while the castle was there. Nobody could change the castle, so only the plain round it can lose a build.
   */
  override mendProtected(cx: number, cz: number, data: Uint16Array): boolean {
    let mended = super.mendProtected(cx, cz, data);
    let fresh: Uint16Array | null = null;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = cx * CHUNK_SIZE + lx;
        const z = cz * CHUNK_SIZE + lz;
        if (x < FORMER_CASTLE.x0 || x > FORMER_CASTLE.x1 || z < FORMER_CASTLE.z0 || z > FORMER_CASTLE.z1) continue;
        fresh ??= this.generateChunk(cx, cz);
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          const i = blockIndex(lx, y, lz);
          if (data[i] !== fresh[i]) {
            data[i] = fresh[i];
            mended = true;
          }
        }
      }
    }
    return mended;
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
        const top = Math.min(WORLD_HEIGHT - 1, Math.max(natural, g) + (plot.air ?? 14));
        for (let y = g + 1; y <= top; y++) blocks[blockIndex(lx, y, lz)] = B.AIR;
      }
    }
  }

  /** The gravel road from the village to the chapel: whatever the land is there, a three-wide strip of gravel with the trees cleared. */
  private road(blocks: Uint16Array, ox: number, oz: number): void {
    this.strip(blocks, ox, oz, HUB_HALF, DUNGEON_X - RUIN_HALF - 1, DUNGEON_Z - 1, DUNGEON_Z + 1);
  }

  /** The gravel road from Ashbrook to the west gate of Dawnwatch: east along the village's road, north, and east again (three wide, over whatever the land is). */
  private ashbrookRoad(blocks: Uint16Array, ox: number, oz: number): void {
    const o = outpostById('ashbrook')!;
    const east = o.x + o.half;
    const tx = ASHBROOK_ROAD_TURN_X;
    this.strip(blocks, ox, oz, east - 1, tx + 1, o.z - 1, o.z + 1);
    this.strip(blocks, ox, oz, tx - 1, tx + 1, 0 - 1, o.z + 1);
    this.strip(blocks, ox, oz, tx - 1, -HUB_HALF, -1, 1);
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
    const op: Op = { x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1), id, mode };
    for (let cz = Math.floor(op.z0 / CHUNK_SIZE); cz <= Math.floor(op.z1 / CHUNK_SIZE); cz++) {
      for (let cx = Math.floor(op.x0 / CHUNK_SIZE); cx <= Math.floor(op.x1 / CHUNK_SIZE); cx++) {
        const k = `${cx},${cz}`;
        let list = this.ops.get(k);
        if (!list) this.ops.set(k, (list = []));
        list.push(op);
      }
    }
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
    this.workshop(WORKSHOPS.dawnwatch, put, (x0, z0, x1, z1, b) => this.pave(x0, z0, x1, z1, b));
  }

  /**
   * A workshop: eight benches in a row (crafting tables and furnaces, see `WORKSHOP_BENCH`) under a plank roof on four posts, on a cobblestone pad
   * with a gravel path to the road. Every village and town has one, so the quests never ask anybody to make a table or a furnace of their own.
   * (`put` and `pv` are in the same frame as the spot: the plaza's middle, or the world's origin for Dawnwatch.)
   */
  private workshop(w: WorkshopSpot, put: Put, pv: (x0: number, z0: number, x1: number, z1: number, b: number) => void): void {
    const { x0, zb, dir } = w;
    const zf = zb + dir * 2;
    const zlo = Math.min(zb, zf);
    const zhi = Math.max(zb, zf);
    pv(x0 - 1, zlo, x0 + 8, zhi, B.COBBLE);
    const toRoad = dir > 0 ? -2 : 2;
    pv(x0 + 3, Math.min(zf + dir, toRoad), x0 + 3, Math.max(zf + dir, toRoad), B.GRAVEL);
    WORKSHOP_BENCH.forEach((kind, i) => put(x0 + i, 1, zb, kind === 'table' ? B.CRAFTING_TABLE : B.FURNACE));
    for (const x of [x0, x0 + 7]) {
      for (let dy = 2; dy <= 3; dy++) put(x, dy, zb, B.FENCE);
      for (let dy = 1; dy <= 3; dy++) put(x, dy, zf, B.FENCE);
    }
    for (let z = zlo; z <= zhi; z++) for (let x = x0 - 1; x <= x0 + 8; x++) put(x, 4, z, B.PLANKS);
    for (const x of [x0 - 1, x0 + 8]) for (const z of [zlo, zhi]) put(x, 5, z, B.TORCH);
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
    // The Auction House: the south-east stall, wider than the others (its Auctioneer is in NPCS).
    auctionHouse(this.lot(24, 17, 30, 19, 3, put), rand(44));
    // The Stash: the stall in the middle of the north side (its Stashkeeper is in NPCS).
    stashHouse(this.lot(17, 11, 21, 13, 2, put), rand(45));
    cart(put, 23, 15, true);
    crates(put, 17, 17, 2);
    crates(put, 16, 17, 1);
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
    for (const npc of NPCS) if (!npc.cellar && !npc.place && !npc.dungeon) reserve(Math.floor(npc.x), Math.floor(npc.z), 2);
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

  /** The cellar house, a small stone house in the south-west of Ashbrook: its door faces the road, and a stair goes down through its floor. */
  private buildCellarHouse(): void {
    const put = this.vox(this.startY);
    const { x0, x1, z0, z1 } = CELLAR_HOUSE;
    const doorX = x0 + 1;
    this.pave(doorX, UZ + 2, doorX, z0 - 1, B.GRAVEL);
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
    const hy = this.startY;
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

    // What stands in the cave (always inside it: see `caveTop`). Its places are written from the middle of the Undercroft's own frame (UX, UZ).
    const base = this.vox(fy);
    const put = (x: number, dy: number, z: number, id: number): void => base(UX + x, dy, UZ + z, id);
    const inside = (x: number, z: number, height = 3): boolean => this.caveTop(UX + x, UZ + z) >= height;
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
    for (let z = CAVE_BOX.z0 - UZ; z <= CAVE_BOX.z1 - UZ; z++) {
      for (let x = CAVE_BOX.x0 - UX; x <= CAVE_BOX.x1 - UX; x++) {
        if (x <= 2 && z >= 6 && z <= 19) continue;
        const h = hash2(this.seed + 81, UX + x, UZ + z);
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
        } else if (roll > 0.93 && !(dx < 0 && Math.abs(dz) <= 1)) {
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

  // ---- the outposts, the vaults and the clearing -------------------------------------------------

  /** Is the block inside this plot's square, widened by `margin`? */
  private inPlot(p: Plot, x: number, z: number, margin = 0): boolean {
    return x >= p.cx - p.half - margin && x < p.cx + p.half + margin && z >= p.cz - p.half - margin && z < p.cz + p.half + margin;
  }

  /** Is this (block x, y, z) in the chamber of a vault, or on its ramp, under the ground? */
  private inVault(v: VaultDef, bx: number, y: number, bz: number): boolean {
    const g = this.vaultY.get(v.id) ?? 0;
    const dx = bx - v.x;
    const dz = bz - v.z;
    const inside = (Math.abs(dx) <= 8 && dz >= 0 && dz <= 11) || (Math.abs(dx) <= 2 && dz >= -11 && dz < 0);
    return inside && y < g - 2;
  }

  /** The height of the ground (the block under your feet) at an outpost or a vault, or null. */
  groundAt(id: string): number | null {
    return id === 'clearing' ? this.clearingY : (this.outpostY.get(id) ?? this.vaultY.get(id) ?? null);
  }

  private buildOutposts(): void {
    for (const o of OUTPOSTS) this.buildOutpost(o);
    for (const v of VAULTS) this.buildVault(v);
    this.buildClearing();
  }

  /**
   * An outpost: a plaza with a waystone, two roads through it and what its people need. Reedhollow has ponds and reeds, Sandmere a well and
   * cacti on sand, Frostgate a palisade and a tower in the snow, Highmarket a palisade wall with gates and a lane of houses, and Greykeep the
   * castle behind its bridge. (Their people stand in `NPCS`, measured from the middle of the plaza.)
   */
  private buildOutpost(o: OutpostDef): void {
    const g = this.outpostY.get(o.id) ?? this.hubY;
    const base = this.vox(g);
    const { x: cx, z: cz } = o;
    const put: Put = (x, dy, z, id) => base(cx + x, dy, cz + z, id);
    const pv = (x0: number, z0: number, x1: number, z1: number, b: number | (() => number)): void => this.pave(cx + x0, cz + z0, cx + x1, cz + z1, b);
    const lot = (x0: number, z0: number, x1: number, z1: number, front: number): Lot => this.lot(cx + x0, cz + z0, cx + x1, cz + z1, front, base);
    let salt = 0;
    const rand = (): (() => number) => {
      const s = ++salt * 31 + cx;
      let i = 0;
      return () => hash2(this.seed + s, i++, cz + s);
    };
    const grey = o.id === 'greykeep';

    // The ground: every kind of country has its own earth.
    if (!grey) {
      for (let z = -o.half; z < o.half; z++) {
        for (let x = -o.half; x < o.half; x++) {
          const r = hash2(this.seed + 120, cx + x, cz + z);
          const b = o.ground === 'peat' ? (r < 0.2 ? B.PODZOL : r < 0.3 ? B.COARSE_DIRT : 0) : o.ground === 'sand' ? (r < 0.12 ? B.SANDSTONE : B.SAND) : o.ground === 'snow' ? (r < 0.12 ? B.SNOW_BLOCK : B.SNOW) : 0;
          if (b) this.paint.set(key(cx + x, cz + z), b);
        }
      }
    }
    // The roads.
    let n = 0;
    const road = (): number => (hash2(this.seed + 121, n++, cx) < 0.12 ? B.COBBLE : B.GRAVEL);
    if (grey) {
      pv(-16, -1, 16, 1, road);
      pv(-1, -6, 1, 16, road);
    } else {
      const reach = o.id === 'highmarket' ? 37 : o.half - 1;
      pv(-reach, -1, reach, 1, road);
      pv(-1, -reach, 1, reach, road);
    }
    // The plaza, in rings of stone brick and cobblestone, with the waystone in the middle.
    for (let r = 0; r <= 4; r++) {
      for (let z = -r; z <= r; z++) {
        for (let x = -r; x <= r; x++) if (Math.max(Math.abs(x), Math.abs(z)) === r) this.paint.set(key(cx + x, cz + z), r === 4 ? B.STONE_BRICKS : B.COBBLE);
      }
    }
    waystone(put);
    for (const [x, z] of [[-7, -2], [7, -2], [-7, 2], [7, 2]]) lampPost(put, x, z);

    const north = (x0: number, z0: number, x1: number, z1: number, kind: 'large' | 'small' | 'smithy'): void => {
      const mid = x0 + ((x1 - x0) >> 1);
      pv(mid, z1 + 1, mid, -2, B.GRAVEL);
      house(lot(x0, z0, x1, z1, 2), kind, styleFor(o.style, rand()), rand());
    };
    const south = (x0: number, z0: number, x1: number, z1: number, kind: 'large' | 'small' | 'smithy'): void => {
      const mid = x0 + ((x1 - x0) >> 1);
      pv(mid, 2, mid, z0 - 1, B.GRAVEL);
      house(lot(x0, z0, x1, z1, 3), kind, styleFor(o.style, rand()), rand());
    };
    const pond = (px: number, pz: number, rx: number, rz: number, bed: number, rim: number): void => {
      for (let z = Math.floor(pz - rz - 3); z <= pz + rz + 3; z++) {
        for (let x = Math.floor(px - rx - 3); x <= px + rx + 3; x++) {
          const d = Math.hypot((x + 0.5 - px) / rx, (z + 0.5 - pz) / rz);
          const r = hash2(this.seed + 122, cx + x, cz + z);
          if (d < 1) {
            this.paint.set(key(cx + x, cz + z), bed);
            put(x, 0, z, B.WATER);
            put(x, -1, z, B.WATER);
            put(x, -2, z, B.CLAY);
            if (d < 0.8 && r < 0.12) put(x, 1, z, B.LILY_PAD);
          } else if (d < 1.3 && r < 0.85) {
            this.paint.set(key(cx + x, cz + z), rim);
            if (d < 1.15 && r < 0.3 && o.id === 'reedhollow') for (let dy = 1; dy <= 2 + (r < 0.1 ? 1 : 0); dy++) put(x, dy, z, B.SUGAR_CANE);
          }
        }
      }
    };

    if (grey) {
      // The castle: drawn where it was designed, shifted so that its bridge ends at the plaza.
      const dz = cz + GREYKEEP_SHIFT_Z;
      buildCastle(
        g,
        (x0, y0, z0, x1, y1, z1, id) => this.box(x0 + cx, y0, z0 + dz, x1 + cx, y1, z1 + dz, id),
        (x, y, z, id, table) => {
          this.box(x + cx, y, z + dz, x + cx, y, z + dz, id);
          this.chests.set(`${x + cx},${y},${z + dz}`, table);
        },
      );
      this.workshop(WORKSHOPS.greykeep, put, pv);
      return;
    }

    if (o.id === 'ashbrook') {
      // The reeve's hall and the smithy north of the road, the inn and a cottage south of it, a farm, and the green. (The cellar house is built apart: see buildCellarHouse.)
      north(-14, -12, -8, -7, 'large');
      north(6, -11, 12, -7, 'smithy');
      south(8, 5, 14, 10, 'large');
      south(-13, 5, -9, 9, 'small');
      farm(lot(-27, -13, -19, -7, 2), rand());
      pv(-23, -6, -23, -2, B.GRAVEL);
      hayBale(put, 17, -6, 2);
      crates(put, 17, 4, 2);
      cart(put, 22, -9, false);
      for (const [x, z] of [[-27, 21], [25, -14], [26, 18], [-27, -20], [14, 22]]) tree(put, x, z, 'oak', 4 + (Math.abs(x + z) % 2));
      for (const x of [-28, 22, 16, -16]) {
        lampPost(put, x, -2);
        lampPost(put, x, 2);
      }
      // The green: a border of cobblestone round the grass where somebody who falls is put back on their feet.
      const { x0, z0, size } = ASHBROOK_GREEN;
      for (let i = 0; i < size; i++) {
        for (const [x, z] of [[x0 + i, z0], [x0 + i, z0 + size - 1], [x0, z0 + i], [x0 + size - 1, z0 + i]]) {
          if (!this.paint.has(key(cx + x, cz + z))) this.paint.set(key(cx + x, cz + z), B.COBBLE);
        }
      }
      this.workshop(WORKSHOPS.ashbrook, put, pv);
      return;
    }

    // Four houses round the plaza and two stalls, as in every village.
    north(-14, -12, -8, -7, 'large');
    north(7, -11, 11, -7, 'small');
    south(8, 5, 14, 10, 'large');
    south(-13, 5, -9, 9, 'small');
    stall(lot(-20, 5, -16, 7, 3), rand());
    stall(lot(14, -8, 18, -6, 2), rand());
    for (const x of [-30, -22, -16, 16, 22, 30]) {
      if (Math.abs(x) >= o.half - 1) continue;
      lampPost(put, x, -2);
      lampPost(put, x, 2);
    }

    if (o.id === 'reedhollow') {
      // Reeds and two ponds, the water that gives the village its name.
      pond(-14, 16, 6.5, 4.5, B.COARSE_DIRT, B.PODZOL);
      pond(15, -17, 5.5, 3.5, B.COARSE_DIRT, B.PODZOL);
      for (const [x, z] of [[-20, -12], [20, 12], [-19, -19], [19, 19]]) tree(put, x, z, 'oak', 5);
      hayBale(put, 18, 4, 2);
      crates(put, -6, 8, 1);
    } else if (o.id === 'sandmere') {
      // A well at the edge of the plaza, a caravan and cacti on the sand.
      well(lot(-19, -12, -17, -10, 2));
      cart(put, 19, -12, true);
      crates(put, 20, 6, 2);
      crates(put, 21, 6, 1);
      hayBale(put, -6, 9, 2);
      for (const [x, z] of [[-20, -16], [20, 14], [-21, 12], [14, 19], [19, -20]]) {
        for (let dy = 1; dy <= 2 + (Math.abs(x + z) % 2); dy++) put(x, dy, z, B.CACTUS);
      }
      for (const [x, z] of [[-18, 16], [-4, 18], [6, -16], [18, 16]]) put(x, 1, z, B.DEAD_BUSH);
    } else if (o.id === 'frostgate') {
      // A palisade of spruce logs with a gate on each side, and a watch tower inside it.
      tower(lot(-18, -18, -14, -14, 2));
      pv(-16, -13, -16, -2, B.GRAVEL);
      const H = 20;
      for (let u = -H; u <= H; u++) {
        for (const [x, z] of [[u, -H], [u, H], [-H, u], [H, u]]) {
          if (Math.abs(u) <= 1) continue;
          const corner = Math.abs(x) === H && Math.abs(z) === H;
          put(x, 0, z, B.COBBLE);
          for (let y = 1; y <= 3; y++) put(x, y, z, B.SPRUCE_LOG);
          put(x, 4, z, B.FENCE);
          if (corner) put(x, 5, z, B.TORCH);
        }
      }
      for (const [x, z] of [[-2, -H], [2, -H], [-2, H], [2, H], [-H, -2], [-H, 2], [H, -2], [H, 2]]) lampPost(put, x, z);
      pond(-12, 14, 5, 3.5, B.PACKED_ICE, B.SNOW_BLOCK);
      crates(put, -6, 8, 2);
    } else if (o.id === 'highmarket') {
      // The town: a wall with gates, a lane of houses on each side and a market of stalls.
      buildWall(put, (x, z) => hash2(this.seed + 95, x, z));
      north(-32, -14, -26, -9, 'large');
      north(15, -12, 21, -7, 'large');
      north(24, -11, 28, -7, 'small');
      south(-32, 5, -26, 10, 'large');
      south(18, 5, 22, 9, 'small');
      south(26, 5, 30, 9, 'small');
      stall(lot(-26, -8, -22, -6, 2), rand());
      stall(lot(-26, 5, -22, 7, 3), rand());
      stall(lot(-6, -8, -2, -6, 2), rand());
      stall(lot(2, 12, 6, 14, 3), rand());
      stall(lot(-6, 12, -2, 14, 3), rand());
      fountain(put, 0, -14);
      pv(-5, -17, 5, -11, B.STONE_BRICKS);
      for (const [x, z] of [[-4, -12], [4, -12], [-4, -16], [4, -16]]) lampPost(put, x, z);
      banner(put, -33, -3, 14);
      banner(put, 33, -3, 14);
    }
    this.workshop(WORKSHOPS[o.id], put, pv);
  }

  /**
   * A vault: a chamber cut in the rock under a levelled square, with a ramp down to it from the square's north side, two cages that keep
   * making monsters while someone is near, a chest and an altar at the back. Flooded (the Reed Grotto), dry and sandy (the Sand Crypt), or ice.
   */
  private buildVault(v: VaultDef): void {
    const g = this.vaultY.get(v.id) ?? this.hubY;
    const { x: vx, z: vz } = v;
    const wall = v.theme === 'crypt' ? B.SANDSTONE : v.theme === 'frozen' ? B.PACKED_ICE : B.STONE_BRICKS;
    const pillar = v.theme === 'crypt' ? B.CHISELED_SANDSTONE : v.theme === 'frozen' ? B.ICE : B.MOSSY_COBBLE;
    const floorAt = (x: number, z: number): number => {
      const r = hash2(this.seed + 130, x, z);
      if (v.theme === 'crypt') return (x + z) % 2 === 0 ? B.SANDSTONE : B.CHISELED_SANDSTONE;
      if (v.theme === 'frozen') return r < 0.5 ? B.PACKED_ICE : B.STONE_BRICKS;
      return r < 0.4 ? B.MOSSY_COBBLE : r < 0.7 ? B.COBBLE : B.STONE_BRICKS;
    };
    // Rock all round (it closes any cave of the land that the cut would open), then the walls, floor and roof, then the air.
    this.box(vx - 9, g - 14, vz - 1, vx + 9, g - 1, vz + 12, B.STONE, 'fill');
    this.box(vx - 8, g - 12, vz, vx + 8, g - 5, vz + 11, wall);
    this.box(vx - 7, g - 11, vz + 1, vx + 7, g - 7, vz + 10, B.AIR);
    for (let z = vz + 1; z <= vz + 10; z++) for (let x = vx - 7; x <= vx + 7; x++) this.box(x, g - 12, z, x, g - 12, z, floorAt(x, z));
    // The ramp: three wide, a stair step for every block, walled in stone brick, four blocks of headroom.
    for (let k = 0; k <= 11; k++) {
      const z = vz - 11 + k;
      const y = g - k;
      this.box(vx - 2, y - 1, z, vx + 2, y - 1, z, B.STONE, 'fill');
      this.box(vx - 2, y, z, vx - 2, g, z, B.STONE_BRICKS);
      this.box(vx + 2, y, z, vx + 2, g, z, B.STONE_BRICKS);
      this.box(vx - 1, y + 1, z, vx + 1, y + 4, z, B.AIR);
      this.box(vx - 1, y, z, vx + 1, y, z, stairId(4, false, 3));
    }
    // A gate of stone brick over the top of the ramp, with a torch on each post.
    for (const dx of [-2, 2]) {
      this.box(vx + dx, g + 1, vz - 11, vx + dx, g + 4, vz - 11, B.STONE_BRICKS);
      this.box(vx + dx, g + 6, vz - 11, vx + dx, g + 6, vz - 11, B.TORCH);
    }
    this.box(vx - 2, g + 5, vz - 11, vx + 2, g + 5, vz - 11, B.STONE_BRICKS);
    this.pave(vx - 3, vz - 12, vx + 3, vz - 9, B.COBBLE);

    // Pillars with a torch on each, and what the place is: a black pool with a causeway, a row of tombs, or ice.
    for (const px of [vx - 7, vx + 7]) {
      for (const pz of [vz + 2, vz + 9]) {
        this.box(px, g - 11, pz, px, g - 8, pz, pillar);
        this.box(px, g - 7, pz, px, g - 7, pz, B.TORCH);
      }
    }
    if (v.theme === 'flooded') {
      this.box(vx - 5, g - 13, vz + 4, vx + 5, g - 12, vz + 7, B.WATER);
      this.box(vx - 1, g - 12, vz + 4, vx + 1, g - 12, vz + 7, B.STONE_BRICKS);
      for (let z = vz + 4; z <= vz + 7; z++) for (let x = vx - 5; x <= vx + 5; x++) if (Math.abs(x - vx) > 1 && hash2(this.seed + 131, x, z) < 0.25) this.box(x, g - 11, z, x, g - 11, z, B.LILY_PAD);
    } else {
      for (const side of [-1, 1]) {
        for (const tz of [vz + 3, vz + 7]) {
          const x0 = vx + side * 4;
          const x1 = vx + side * 6;
          this.box(x0, g - 11, tz, x1, g - 11, tz, wall);
          if (v.theme === 'crypt') this.box(x0, g - 10, tz, x1, g - 10, tz, B.CHISELED_SANDSTONE, 'set');
          else this.box(x0 + (side < 0 ? 1 : 0), g - 10, tz, x1 - (side > 0 ? 1 : 0), g - 10, tz, B.ICE);
        }
      }
    }
    // The altar at the back, and a chest.
    this.box(vx - 1, g - 11, vz + 9, vx + 1, g - 11, vz + 9, B.OBSIDIAN);
    this.box(vx, g - 10, vz + 9, vx, g - 10, vz + 9, B.GLOWSTONE);
    const cy = g - 11;
    this.box(vx + 5, cy, vz + 10, vx + 5, cy, vz + 10, chestId(3, 0));
    this.chests.set(`${vx + 5},${cy},${vz + 10}`, 'ruin');
    // The cages.
    v.mobs.forEach((kind, i) => {
      const sx = vx + (i === 0 ? -5 : 5);
      const sz = vz + 5;
      this.box(sx, g - 11, sz, sx, g - 11, sz, B.SPAWNER);
      this.vaultSpawners.set(`${sx},${g - 11},${sz}`, kind);
    });
  }

  /** The clearing in the woods: a ring of mossy stones round a cold fire pit, on bare earth. */
  private buildClearing(): void {
    const base = this.vox(this.clearingY);
    const { x: cx, z: cz, r } = CLEARING;
    for (let z = -r; z <= r; z++) {
      for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x + 0.5, z + 0.5);
        const roll = hash2(this.seed + 140, cx + x, cz + z);
        if (d <= r - 1) this.paint.set(key(cx + x, cz + z), d < 2.4 ? B.GRAVEL : roll < 0.5 ? B.COARSE_DIRT : B.PODZOL);
        if (d >= 6.6 && d <= 7.6 && roll < 0.6) base(cx + x, 1, cz + z, B.MOSSY_COBBLE);
        if (d >= 1.2 && d <= 1.9) base(cx + x, 1, cz + z, B.COBBLE);
      }
    }
    for (const [x, z] of [[7, 0], [-7, 0], [0, 7], [0, -7]]) {
      base(cx + x, 1, cz + z, B.MOSSY_COBBLE);
      base(cx + x, 2, cz + z, B.TORCH);
    }
    for (let x = -4; x <= -2; x++) base(cx + x, 1, cz + 4, B.LOG);
  }
}
