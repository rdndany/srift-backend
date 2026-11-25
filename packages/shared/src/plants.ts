import {
  B,
  BB,
  GROVE,
  CORAL_FAN_YELLOW,
  CORAL_FAN_RED,
  BUBBLE_BLOOM,
  BED_DIRS,
  BLOCKS,
  IS_LIQUID,
  IS_OPAQUE,
  IS_PARTIAL,
  IS_SOLID,
  bedId,
  bedInfo,
  buttonBase,
  buttonInfo,
  cakeInfo,
  campfireId,
  campfireInfo,
  chestId,
  isChest,
  cocoaId,
  cocoaInfo,
  doorInfo,
  gateId,
  gateInfo,
  gateKind,
  ladderId,
  ladderInfo,
  lanternId,
  lanternInfo,
  leverInfo,
  mountSupport,
  mountedId,
  plateInfo,
  rtorchInfo,
  slabId,
  slabInfo,
  stairId,
  stairInfo,
  trapdoorId,
  trapdoorInfo,
  trapdoorKind,
  bannerId,
  bannerInfo,
  candleInfo,
  potInfo,
  signId,
  signInfo,
  pillarFor,
} from './blocks';
import { isWaterId } from './fluids';
import { canFireStay } from './fire';
import type { BlockReader } from './physics';

/**
 * Rules for blocks that need something to stand on or hang from: torches,
 * flowers, grass and crops. Pure functions so the future server can validate
 * placement and run the same "does it pop off?" checks.
 */

export function isTorch(id: number): boolean {
  return id >= B.TORCH && id <= B.TORCH_NZ;
}

export function isCrop(id: number): boolean {
  return (id >= B.WHEAT_0 && id <= B.WHEAT_3) || (id >= B.POTATO_0 && id <= B.POTATO_3) || (id >= B.CARROT_0 && id <= B.CARROT_3) || (id >= B.MELON_STEM_0 && id <= B.PUMPKIN_STEM_3) || (id >= B.BEETROOT_0 && id <= B.BEETROOT_3);
}

/** A crop that still has a stage left to grow into. */
export function isYoungCrop(id: number): boolean {
  const pod = cocoaInfo(id);
  if (pod) return pod.stage < 2;
  return (
    (id >= B.WHEAT_0 && id < B.WHEAT_3) ||
    (id >= B.POTATO_0 && id < B.POTATO_3) ||
    (id >= B.CARROT_0 && id < B.CARROT_3) ||
    (id >= B.MELON_STEM_0 && id < B.MELON_STEM_3) ||
    (id >= B.PUMPKIN_STEM_0 && id < B.PUMPKIN_STEM_3) ||
    (id >= B.BEETROOT_0 && id < B.BEETROOT_3) ||
    (id >= B.SWEET_BERRY_0 && id < B.SWEET_BERRY_3)
  );
}

/** The fully grown stage of this crop. */
export function ripeCrop(id: number): number {
  const pod = cocoaInfo(id);
  if (pod) return cocoaId(pod.facing, 2);
  if (id >= B.POTATO_0 && id <= B.POTATO_3) return B.POTATO_3;
  if (id >= B.CARROT_0 && id <= B.CARROT_3) return B.CARROT_3;
  if (id >= B.MELON_STEM_0 && id <= B.MELON_STEM_3) return B.MELON_STEM_3;
  if (id >= B.PUMPKIN_STEM_0 && id <= B.PUMPKIN_STEM_3) return B.PUMPKIN_STEM_3;
  if (id >= B.BEETROOT_0 && id <= B.BEETROOT_3) return B.BEETROOT_3;
  if (id >= B.SWEET_BERRY_0 && id <= B.SWEET_BERRY_3) return B.SWEET_BERRY_3;
  return B.WHEAT_3;
}

/** The fruit a melon or pumpkin stem grows, or 0 when this block is not one. */
export function stemFruit(id: number): number {
  if (id >= B.MELON_STEM_0 && id <= B.MELON_STEM_3) return B.MELON;
  if (id >= B.PUMPKIN_STEM_0 && id <= B.PUMPKIN_STEM_3) return B.PUMPKIN;
  return 0;
}

/** Offset from a wall torch to the block it is attached to. */
export function torchSupport(id: number): [number, number, number] {
  const rt = rtorchInfo(id);
  if (rt) return mountSupport(rt.face);
  switch (id) {
    case B.TORCH_PX:
      return [1, 0, 0];
    case B.TORCH_NX:
      return [-1, 0, 0];
    case B.TORCH_PZ:
      return [0, 0, 1];
    case B.TORCH_NZ:
      return [0, 0, -1];
    default:
      return [0, -1, 0];
  }
}

const SOIL = new Set<number>([B.GRASS, B.DIRT, B.SNOW, B.FARMLAND, B.PODZOL, B.COARSE_DIRT, B.MYCELIUM, B.MUD, B.MOSS_BLOCK, GROVE.mangroveRoots, GROVE.paleMoss, GROVE.rootedDirt]);
/** Cave growths that hang from the roof instead of standing on the floor. */
const HANGING = new Set<number>([B.CAVE_VINES, B.CAVE_VINES_BERRIES, B.SPORE_BLOSSOM, B.STALACTITE_BASE, B.STALACTITE_TIP, GROVE.hangingRoots, GROVE.paleHangingMoss]);
const DESERT_SOIL = new Set<number>([B.SAND, B.DIRT, B.RED_SAND, B.COARSE_DIRT, B.TERRACOTTA, B.TERRACOTTA_ORANGE, B.TERRACOTTA_YELLOW, B.TERRACOTTA_RED, B.TERRACOTTA_WHITE, B.TERRACOTTA_BROWN, B.TERRACOTTA_LIGHT_GRAY]);
/** What reeds grow from (next to water). */
const REED_SOIL = new Set<number>([B.GRASS, B.DIRT, B.SAND, B.RED_SAND, B.PODZOL, B.COARSE_DIRT, B.MUD, B.CLAY]);
/** What kelp, seagrass and coral stand on. */
const SEA_FLOOR = new Set<number>([B.SAND, B.RED_SAND, B.GRAVEL, B.CLAY, B.DIRT, B.MUD, B.SANDSTONE, B.STONE, B.GRASS]);

/** Kelp, the one sea plant that grows up through the water. */
export function isKelp(id: number): boolean {
  return id === BB.kelp;
}

/** Kelp, seagrass, the coral fans, and the bubble bloom. They stand in the sea and you swim through them. */
export function isSeaPlant(id: number): boolean {
  return id === BB.kelp || id === BB.seagrass || id === BB.coral_fan_pink || id === BB.coral_fan_blue || id === CORAL_FAN_YELLOW || id === CORAL_FAN_RED || id === BUBBLE_BLOOM;
}

/** The sea plant whose bubbles refill your air. */
export function isBubbleBloom(id: number): boolean {
  return id === BUBBLE_BLOOM;
}
const isStillWater = (id: number): boolean => id === B.WATER;

/** Can `id` exist at (x, y, z) given its surroundings? */
export function canStayAt(id: number, world: BlockReader, x: number, y: number, z: number): boolean {
  if (isTorch(id)) {
    const [dx, dy, dz] = torchSupport(id);
    return IS_SOLID[world.getBlock(x + dx, y + dy, z + dz)] === 1;
  }
  const rt = rtorchInfo(id) ?? leverInfo(id) ?? buttonInfo(id);
  if (rt) {
    const [dx, dy, dz] = mountSupport(rt.face);
    return IS_SOLID[world.getBlock(x + dx, y + dy, z + dz)] === 1;
  }
  if (plateInfo(id)) return IS_SOLID[world.getBlock(x, y - 1, z)] === 1;
  const lantern = lanternInfo(id);
  if (lantern) {
    // Standing: on a solid block. Hanging: from a solid block or a chain above it.
    if (!lantern.hanging) return IS_SOLID[world.getBlock(x, y - 1, z)] === 1;
    const above = world.getBlock(x, y + 1, z);
    return IS_SOLID[above] === 1 || above === B.CHAIN;
  }
  if (id === B.CHAIN) {
    // Hung from a solid block or from the chain above it; one link can also stand on the floor.
    const above = world.getBlock(x, y + 1, z);
    return IS_SOLID[above] === 1 || above === B.CHAIN || IS_SOLID[world.getBlock(x, y - 1, z)] === 1;
  }
  const bed = bedInfo(id);
  if (bed) {
    // A bed is two blocks; if one half goes, the other falls apart.
    const sign = bed.head ? -1 : 1;
    const other = world.getBlock(x + sign * bed.dx, y, z + sign * bed.dz);
    if (bed.head) {
      const foot = bedInfo(other);
      return !!foot && !foot.head && foot.dir === bed.dir;
    }
    return other === bedId(true, bed.dir);
  }
  const pod = cocoaInfo(id);
  if (pod) {
    const [dx, dz] = BED_DIRS[pod.facing];
    return world.getBlock(x + dx, y, z + dz) === B.JUNGLE_LOG;
  }
  if (cakeInfo(id)) {
    const below = world.getBlock(x, y - 1, z);
    return IS_SOLID[below] === 1 && cakeInfo(below) === null;
  }
  if (campfireInfo(id)) {
    const below = world.getBlock(x, y - 1, z);
    return IS_SOLID[below] === 1 && campfireInfo(below) === null;
  }
  const ladder = ladderInfo(id);
  if (ladder) {
    // A ladder hangs on the side of a solid block: the wall is on the side it faces.
    const n = world.getBlock(x + BED_DIRS[ladder.facing][0], y, z + BED_DIRS[ladder.facing][1]);
    return IS_OPAQUE[n] === 1 && IS_PARTIAL[n] === 0;
  }
  const door = doorInfo(id);
  if (door) {
    // A door is two blocks stacked: the lower half stands on something, the upper half on the lower.
    if (door.upper) {
      const below = doorInfo(world.getBlock(x, y - 1, z));
      return !!below && !below.upper && below.facing === door.facing;
    }
    const above = doorInfo(world.getBlock(x, y + 1, z));
    return IS_SOLID[world.getBlock(x, y - 1, z)] === 1 && !!above && above.upper && above.facing === door.facing;
  }
  if (id === B.FIRE) return canFireStay((a, b, c) => world.getBlock(a, b, c), x, y, z);
  if (id >= B.SWEET_BERRY_0 && id <= B.SWEET_BERRY_3) {
    const below = world.getBlock(x, y - 1, z);
    return below === B.GRASS || below === B.DIRT || below === B.FARMLAND;
  }
  if (isCrop(id)) return world.getBlock(x, y - 1, z) === B.FARMLAND;
  if (id === B.DEAD_BUSH) return DESERT_SOIL.has(world.getBlock(x, y - 1, z));
  if (id === B.CACTUS) {
    // Grows from sand (or on another cactus) and pops off if anything solid touches its sides.
    const below = world.getBlock(x, y - 1, z);
    if (below !== B.SAND && below !== B.RED_SAND && below !== B.CACTUS) return false;
    return !(IS_SOLID[world.getBlock(x + 1, y, z)] || IS_SOLID[world.getBlock(x - 1, y, z)] || IS_SOLID[world.getBlock(x, y, z + 1)] || IS_SOLID[world.getBlock(x, y, z - 1)]);
  }
  if (id === B.COBWEB) return true;
  if (id === GROVE.bamboo) {
    const below = world.getBlock(x, y - 1, z);
    if (below === GROVE.bamboo) return true;
    return below === B.GRASS || below === B.DIRT || below === B.SAND || below === B.RED_SAND || below === B.PODZOL || below === B.COARSE_DIRT || below === B.MUD || below === B.GRAVEL || below === B.MOSS_BLOCK || below === GROVE.rootedDirt;
  }
  if (id === B.SUGAR_CANE) {
    // Reeds stand on soil with water at its foot (or on another reed).
    const below = world.getBlock(x, y - 1, z);
    if (below === B.SUGAR_CANE) return true;
    if (!REED_SOIL.has(below)) return false;
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => IS_LIQUID[world.getBlock(x + dx, y - 1, z + dz)] === 1);
  }
  if (id === B.LILY_PAD) return isStillWater(world.getBlock(x, y - 1, z));
  if (isSeaPlant(id)) {
    const below = world.getBlock(x, y - 1, z);
    if (isKelp(id)) {
      if (below !== BB.kelp && !SEA_FLOOR.has(below)) return false;
    } else if (isBubbleBloom(id)) {
      if (IS_SOLID[below] !== 1 || IS_LIQUID[below] === 1) return false;
    } else if (!SEA_FLOOR.has(below)) return false;
    const above = world.getBlock(x, y + 1, z);
    if (isWaterId(above)) return true;
    if (isKelp(id) && above === BB.kelp) return true;
    if (above !== B.AIR) return false;
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => isWaterId(world.getBlock(x + dx, y, z + dz)));
  }
  if (id === B.BROWN_MUSHROOM || id === B.RED_MUSHROOM) {
    const below = world.getBlock(x, y - 1, z);
    return IS_SOLID[below] === 1 && IS_LIQUID[below] === 0;
  }
  if (HANGING.has(id)) {
    // Vines, stalactites and spore blossoms hang from rock above (a vine or a stalactite may hang from its own kind).
    const above = world.getBlock(x, y + 1, z);
    if (IS_SOLID[above] === 1) return true;
    if (id === B.CAVE_VINES || id === B.CAVE_VINES_BERRIES) return above === B.CAVE_VINES || above === B.CAVE_VINES_BERRIES;
    if (id === B.STALACTITE_BASE || id === B.STALACTITE_TIP) return above === B.STALACTITE_BASE;
    return false;
  }
  if (id === B.STALAGMITE_BASE || id === B.STALAGMITE_TIP || id === B.AMETHYST_CLUSTER) {
    const below = world.getBlock(x, y - 1, z);
    return IS_SOLID[below] === 1 || (id !== B.AMETHYST_CLUSTER && below === B.STALAGMITE_BASE);
  }
  if (candleInfo(id) || potInfo(id)) return IS_SOLID[world.getBlock(x, y - 1, z)] === 1;
  const hung = bannerInfo(id) ?? signInfo(id);
  if (hung) {
    if (!hung.wall) return IS_SOLID[world.getBlock(x, y - 1, z)] === 1;
    const [dx, dz] = BED_DIRS[hung.facing];
    return IS_SOLID[world.getBlock(x + dx, y, z + dz)] === 1;
  }
  if (BLOCKS[id].shape === 'flat') return IS_SOLID[world.getBlock(x, y - 1, z)] === 1;
  if (BLOCKS[id].shape === 'cross') return SOIL.has(world.getBlock(x, y - 1, z));
  return true;
}

/**
 * The top half of a stair, slab or trapdoor. The underside of a block is always the top half. A side is the top
 * half when the cursor is above the middle of the block you see. `drop` is how far that block hangs below its cell.
 */
export function placesUpper(ny: number, fy = 0.5, drop = 0): boolean {
  return ny < 0 || (ny === 0 && fy + drop > 0.5);
}

/**
 * The block that actually gets placed when the player uses `block` on the face
 * of another block with the given normal (null = cannot be placed there).
 */
export function placementFor(block: number, nx: number, ny: number, nz: number, yaw = 0, fy = 0.5, drop = 0): number | null {
  // A bubble bloom grows in the sea. It is not a plant you can carry and set down again.
  if (block === BUBBLE_BLOOM) return null;
  if (block === B.RAIL_X || block === B.RAIL_Z) {
    // Rails lie on a block's top; clicking the side of a block puts one beside it (it needs a floor
    // there, which `canStayAt` checks). Never on a ceiling.
    if (ny < 0) return null;
    return Math.abs(Math.sin(yaw)) > Math.abs(Math.cos(yaw)) ? B.RAIL_X : B.RAIL_Z;
  }
  if (block === B.POWERED_RAIL_X) {
    if (ny < 0) return null;
    return Math.abs(Math.sin(yaw)) > Math.abs(Math.cos(yaw)) ? B.POWERED_RAIL_X : B.POWERED_RAIL_Z;
  }
  if (rtorchInfo(block) || leverInfo(block) || buttonInfo(block)) {
    // Stuck to the floor or to the side of a block; never to a ceiling.
    if (ny < 0) return null;
    const base = rtorchInfo(block) ? B.RTORCH_BASE : leverInfo(block) ? B.LEVER_BASE : buttonBase(block);
    const lit = !!rtorchInfo(block);
    return mountedId(base, ny > 0 ? 0 : dirOf(-nx, -nz) + 1, lit);
  }
  if (block === B.CAVE_VINES) {
    if (ny >= 0) return null;
    return B.CAVE_VINES;
  }
  if (block === cocoaId(0, 0)) {
    if (ny !== 0) return null;
    return cocoaId(dirOf(-nx, -nz), 0);
  }
  if (isTorch(block)) {
    if (ny > 0) return B.TORCH;
    if (ny < 0) return null;
    // The face normal points away from the supporting block.
    if (nx > 0) return B.TORCH_NX;
    if (nx < 0) return B.TORCH_PX;
    if (nz > 0) return B.TORCH_NZ;
    return B.TORCH_PZ;
  }
  const lantern = lanternInfo(block);
  if (lantern) {
    // Clicking the underside of a block hangs the lantern from it; any other face stands it (the player code
    // tries the hanging kind when there is no floor to stand on).
    return lanternId(lantern.soul, ny < 0);
  }
  // Building blocks take their orientation from where you click and which way you look.
  const look = lookDir(yaw);
  if (isChest(block)) return chestId(look ^ 1, 0);
  const upper = placesUpper(ny, fy, drop);
  const slab = slabInfo(block);
  if (slab) return slabId(slab.mat, upper);
  const stair = stairInfo(block);
  if (stair) return stairId(stair.mat, upper, look);
  if (trapdoorInfoOf(block)) return trapdoorId(upper, false, ny === 0 ? dirOf(-nx, -nz) : look, trapdoorKind(block));
  if (ladderInfo(block)) return ny === 0 ? ladderId(dirOf(-nx, -nz)) : null;
  const gate = gateInfo(block);
  if (gate && !gate.open && gate.facing === 0) return gateId(false, look, gateKind(block));
  if (campfireInfo(block)) return campfireId(look, true);
  const banner = bannerInfo(block);
  if (banner && !banner.wall && banner.facing === 0) {
    if (ny < 0) return null;
    return bannerId(banner.color, ny === 0 ? dirOf(-nx, -nz) : look, ny === 0);
  }
  const sign = signInfo(block);
  if (sign && !sign.wall && sign.facing === 0) {
    if (ny < 0) return null;
    return signId(sign.wood, ny === 0 ? dirOf(-nx, -nz) : look, ny === 0);
  }
  // Logs and pillars take the axis of the face they were placed on. The top and the bottom leave them upright.
  const turned = pillarFor(block, nx, ny, nz);
  if (turned) return turned;
  return block;
}

/** Index into BED_DIRS of the nearest horizontal axis direction. */
export function dirOf(dx: number, dz: number): number {
  return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 0 : 1) : dz > 0 ? 2 : 3;
}

/** The way a player with this yaw is looking, as an index into BED_DIRS. */
export function lookDir(yaw: number): number {
  return dirOf(-Math.sin(yaw), -Math.cos(yaw));
}

function trapdoorInfoOf(block: number): boolean {
  const t = trapdoorInfo(block);
  return !!t && !t.top && !t.open && t.facing === 0;
}

const FRUIT_SOIL = new Set<number>([B.FARMLAND, B.DIRT, B.GRASS]);
const FRUIT_DIRS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * A cave vine grows. The free tip lengthens by one block. A bare vine with nowhere to grow gains berries.
 * Returns whether anything changed.
 */
export function growVine(world: BlockReader & { setBlock(x: number, y: number, z: number, id: number): boolean }, x: number, y: number, z: number, id: number): boolean {
  if (id !== B.CAVE_VINES && id !== B.CAVE_VINES_BERRIES) return false;
  if (y > 1 && world.getBlock(x, y - 1, z) === B.AIR) return world.setBlock(x, y - 1, z, id === B.CAVE_VINES ? B.CAVE_VINES_BERRIES : B.CAVE_VINES);
  if (id === B.CAVE_VINES) return world.setBlock(x, y, z, B.CAVE_VINES_BERRIES);
  return false;
}

/** A ripe stem grows one fruit on a random neighbouring dirt, grass or farmland. */
export function growFruit(world: BlockReader & { setBlock(x: number, y: number, z: number, id: number): boolean }, x: number, y: number, z: number, stem: number, rand: () => number): boolean {
  const fruit = stemFruit(stem);
  if (!fruit) return false;
  const [dx, dz] = FRUIT_DIRS[Math.floor(rand() * 4)]!;
  const nx = x + dx;
  const nz = z + dz;
  if (world.getBlock(nx, y, nz) !== B.AIR) return false;
  if (!FRUIT_SOIL.has(world.getBlock(nx, y - 1, nz))) return false;
  return world.setBlock(nx, y, nz, fruit);
}

/** Soil a hoe can till. */
export function isTillable(id: number): boolean {
  return id === B.GRASS || id === B.DIRT || id === B.SNOW || id === B.PODZOL || id === B.COARSE_DIRT;
}

/**
 * Seconds between random ticks on one block, at Minecraft's default random-tick speed of 3
 * (3 picks out of 4096 blocks, 20 times a second). Saplings, seeds, cane and cactus all wait on this.
 */
export const RANDOM_TICK_SECONDS = 4096 / 60;

/** How many pictures a crop has here, against how many ages Minecraft uses. Wheat has 8 ages and 4 pictures. */
function stageStretch(id: number): number {
  if (id >= B.BEETROOT_0 && id <= B.BEETROOT_3) return 1;
  if (id >= B.SWEET_BERRY_0 && id <= B.SWEET_BERRY_3) return 1;
  if (id >= B.COCOA_BASE && id < B.COCOA_BASE + 12) return 1;
  return 7 / 3;
}

function cropFamily(id: number): number {
  if (id >= B.WHEAT_0 && id <= B.WHEAT_3) return 1;
  if (id >= B.POTATO_0 && id <= B.POTATO_3) return 2;
  if (id >= B.CARROT_0 && id <= B.CARROT_3) return 3;
  if (id >= B.MELON_STEM_0 && id <= B.MELON_STEM_3) return 4;
  if (id >= B.PUMPKIN_STEM_0 && id <= B.PUMPKIN_STEM_3) return 5;
  if (id >= B.BEETROOT_0 && id <= B.BEETROOT_3) return 6;
  if (id >= B.SWEET_BERRY_0 && id <= B.SWEET_BERRY_3) return 7;
  if (id >= B.COCOA_BASE && id < B.COCOA_BASE + 12) return 8;
  return 0;
}

/**
 * Mean seconds until this crop advances one picture.
 * Farmland counts as moist. A full plot of it is the fast Minecraft farm; a single block is slower.
 * A straight row of the same crop is halved, the same as Minecraft.
 */
export function cropGrowthSeconds(world: BlockReader, x: number, y: number, z: number, id: number): number {
  let speed = 1;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      let bonus = world.getBlock(x + dx, y - 1, z + dz) === B.FARMLAND ? 3 : 0;
      if (dx !== 0 || dz !== 0) bonus /= 4;
      speed += bonus;
    }
  }
  const family = cropFamily(id);
  if (family !== 0) {
    const north = cropFamily(world.getBlock(x, y, z - 1)) === family;
    const south = cropFamily(world.getBlock(x, y, z + 1)) === family;
    const east = cropFamily(world.getBlock(x + 1, y, z)) === family;
    const west = cropFamily(world.getBlock(x - 1, y, z)) === family;
    if ((north && south) || (east && west)) speed /= 2;
  }
  const attempts = Math.floor(25 / speed) + 1;
  return RANDOM_TICK_SECONDS * attempts * stageStretch(id);
}

/** Mean seconds for a cactus or a sugar cane to grow one block taller (16 random ticks in Minecraft). */
export const CANE_GROW_SECONDS = RANDOM_TICK_SECONDS * 16;
/** Bamboo tries three times as often as sugar cane. */
export const BAMBOO_GROW_SECONDS = RANDOM_TICK_SECONDS * 3;
/** A ripe melon or pumpkin stem tries to fruit on every random tick. */
export const FRUIT_GROW_SECONDS = RANDOM_TICK_SECONDS;
/** How tall a cactus or a sugar cane grows, counting the block already there. */
export const COLUMN_MAX = 3;
/** How tall kelp grows, counting the block already there. */
export const KELP_MAX = 16;

/** Grow a cactus, sugar cane or kelp one block, when there is room and it is not already full height. Kelp grows into water. */
export function growColumn(world: BlockReader & { setBlock(x: number, y: number, z: number, id: number): boolean }, x: number, y: number, z: number, id: number): boolean {
  if (isKelp(id)) {
    if (world.getBlock(x, y + 1, z) !== B.WATER) return false;
    let height = 1;
    for (let dy = 1; dy < KELP_MAX; dy++) {
      if (world.getBlock(x, y - dy, z) !== id) break;
      height++;
    }
    if (height >= KELP_MAX) return false;
    return world.setBlock(x, y + 1, z, id);
  }
  if (id !== B.CACTUS && id !== B.SUGAR_CANE && id !== GROVE.bamboo) return false;
  if (world.getBlock(x, y + 1, z) !== B.AIR) return false;
  const max = id === GROVE.bamboo ? 12 : COLUMN_MAX;
  let height = 1;
  for (let dy = 1; dy < max; dy++) {
    if (world.getBlock(x, y - dy, z) !== id) break;
    height++;
  }
  if (height >= max) return false;
  if (!canStayAt(id, world, x, y + 1, z)) return false;
  return world.setBlock(x, y + 1, z, id);
}
