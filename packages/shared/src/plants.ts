import {
  B,
  BED_DIRS,
  BLOCKS,
  IS_LIQUID,
  IS_OPAQUE,
  IS_PARTIAL,
  IS_SOLID,
  bedId,
  bedInfo,
  buttonInfo,
  doorInfo,
  gateId,
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
} from './blocks';
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
  return id >= B.WHEAT_0 && id <= B.WHEAT_3;
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

const SOIL = new Set<number>([B.GRASS, B.DIRT, B.SNOW, B.FARMLAND, B.PODZOL, B.COARSE_DIRT, B.MYCELIUM, B.MUD, B.MOSS_BLOCK]);
/** Cave growths that hang from the roof instead of standing on the floor. */
const HANGING = new Set<number>([B.CAVE_VINES, B.CAVE_VINES_BERRIES, B.SPORE_BLOSSOM, B.STALACTITE_BASE, B.STALACTITE_TIP]);
const DESERT_SOIL = new Set<number>([B.SAND, B.DIRT, B.RED_SAND, B.COARSE_DIRT, B.TERRACOTTA, B.TERRACOTTA_ORANGE, B.TERRACOTTA_YELLOW, B.TERRACOTTA_RED, B.TERRACOTTA_WHITE, B.TERRACOTTA_BROWN, B.TERRACOTTA_LIGHT_GRAY]);
/** What reeds grow from (next to water). */
const REED_SOIL = new Set<number>([B.GRASS, B.DIRT, B.SAND, B.RED_SAND, B.PODZOL, B.COARSE_DIRT, B.MUD, B.CLAY]);
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
  if (isCrop(id)) return world.getBlock(x, y - 1, z) === B.FARMLAND;
  if (id === B.DEAD_BUSH) return DESERT_SOIL.has(world.getBlock(x, y - 1, z));
  if (id === B.CACTUS) {
    // Grows from sand (or on another cactus) and pops off if anything solid touches its sides.
    const below = world.getBlock(x, y - 1, z);
    if (below !== B.SAND && below !== B.RED_SAND && below !== B.CACTUS) return false;
    return !(IS_SOLID[world.getBlock(x + 1, y, z)] || IS_SOLID[world.getBlock(x - 1, y, z)] || IS_SOLID[world.getBlock(x, y, z + 1)] || IS_SOLID[world.getBlock(x, y, z - 1)]);
  }
  if (id === B.COBWEB) return true;
  if (id === B.SUGAR_CANE) {
    // Reeds stand on soil with water at its foot (or on another reed).
    const below = world.getBlock(x, y - 1, z);
    if (below === B.SUGAR_CANE) return true;
    if (!REED_SOIL.has(below)) return false;
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => IS_LIQUID[world.getBlock(x + dx, y - 1, z + dz)] === 1);
  }
  if (id === B.LILY_PAD) return isStillWater(world.getBlock(x, y - 1, z));
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
  if (BLOCKS[id].shape === 'flat') return IS_SOLID[world.getBlock(x, y - 1, z)] === 1;
  if (BLOCKS[id].shape === 'cross') return SOIL.has(world.getBlock(x, y - 1, z));
  return true;
}

/**
 * The block that actually gets placed when the player uses `block` on the face
 * of another block with the given normal (null = cannot be placed there).
 */
export function placementFor(block: number, nx: number, ny: number, nz: number, yaw = 0, fy = 0.5): number | null {
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
    const base = rtorchInfo(block) ? B.RTORCH_BASE : leverInfo(block) ? B.LEVER_BASE : B.BUTTON_BASE;
    const lit = !!rtorchInfo(block);
    return mountedId(base, ny > 0 ? 0 : dirOf(-nx, -nz) + 1, lit);
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
  const upper = ny < 0 || (ny === 0 && fy > 0.5);
  const slab = slabInfo(block);
  if (slab) return slabId(slab.mat, upper);
  const stair = stairInfo(block);
  if (stair) return stairId(stair.mat, upper, look);
  if (trapdoorInfoOf(block)) return trapdoorId(upper, false, ny === 0 ? dirOf(-nx, -nz) : look);
  if (ladderInfo(block)) return ny === 0 ? ladderId(dirOf(-nx, -nz)) : null;
  if (block === gateId(false, 0)) return gateId(false, look);
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
  return block === trapdoorId(false, false, 0);
}

/** Soil a hoe can till. */
export function isTillable(id: number): boolean {
  return id === B.GRASS || id === B.DIRT || id === B.SNOW || id === B.PODZOL || id === B.COARSE_DIRT;
}

/** Mean seconds for a crop to advance one growth stage. */
export const CROP_STAGE_SECONDS = 45;
