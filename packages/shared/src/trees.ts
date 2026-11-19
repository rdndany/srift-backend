import { B, GROVE, IS_LEAVES, IS_SOLID } from './blocks';
import type { BlockReader } from './physics';

/**
 * Tree shapes, used by world generation and by sapling growth. Driven by an injected random source
 * so the same tree comes out of the same seed on the client, on the server and in tests.
 *
 * Oak, birch, spruce, acacia, jungle, dark oak and cherry, plus mangrove (roots and a low crown), pale oak
 * and the azalea tree a bush grows into. `big` makes the
 * rare giant of a kind: a fancy oak with branches, a tall birch, a mighty spruce, a jungle giant with a trunk two blocks wide,
 * a dark oak whose trunk is 2 x 2 too. Giants are only grown by world generation; a sapling always makes the ordinary tree.
 */

export type TreeKind = 'oak' | 'birch' | 'spruce' | 'acacia' | 'jungle' | 'dark_oak' | 'cherry' | 'mangrove' | 'pale_oak' | 'azalea';

export interface TreeBlock {
  x: number;
  y: number;
  z: number;
  id: number;
  /** Leaves never replace solid blocks; the trunk always wins. */
  leaf: boolean;
}

/** Seconds a sapling needs, on average, before it grows into a tree. */
export const SAPLING_GROW_SECONDS = 80;

const LOG: Record<TreeKind, number> = {
  oak: B.LOG,
  birch: B.BIRCH_LOG,
  spruce: B.SPRUCE_LOG,
  acacia: B.ACACIA_LOG,
  jungle: B.JUNGLE_LOG,
  dark_oak: B.DARK_OAK_LOG,
  cherry: B.CHERRY_LOG,
  mangrove: GROVE.mangrove.log,
  pale_oak: GROVE.paleOak.log,
  azalea: B.LOG,
};
const LEAVES: Record<TreeKind, number> = {
  oak: B.LEAVES,
  birch: B.BIRCH_LEAVES,
  spruce: B.SPRUCE_LEAVES,
  acacia: B.ACACIA_LEAVES,
  jungle: B.JUNGLE_LEAVES,
  dark_oak: B.DARK_OAK_LEAVES,
  cherry: B.CHERRY_LEAVES,
  mangrove: GROVE.mangrove.leaves,
  pale_oak: GROVE.paleOak.leaves,
  azalea: GROVE.azaleaLeaves,
};

/** Trunk heights: oaks are short and round, birches taller, spruces tallest, jungle trees tower. */
export function trunkHeight(kind: TreeKind, rand: () => number, big = false): number {
  switch (kind) {
    case 'spruce':
      return big ? 12 + Math.floor(rand() * 7) : 6 + Math.floor(rand() * 4);
    case 'birch':
      return big ? 8 + Math.floor(rand() * 4) : 5 + Math.floor(rand() * 3);
    case 'acacia':
      return 5 + Math.floor(rand() * 3);
    case 'jungle':
      return big ? 18 + Math.floor(rand() * 9) : 7 + Math.floor(rand() * 6);
    case 'dark_oak':
      return big ? 6 + Math.floor(rand() * 3) : 4 + Math.floor(rand() * 2);
    case 'cherry':
      return 5 + Math.floor(rand() * 3);
    case 'mangrove':
      return 5 + Math.floor(rand() * 3);
    case 'pale_oak':
      return 4 + Math.floor(rand() * 3);
    case 'azalea':
      return 3 + Math.floor(rand() * 2);
    default:
      return big ? 7 + Math.floor(rand() * 4) : 4 + Math.floor(rand() * 3);
  }
}

export function treeKindOfSapling(id: number): TreeKind | null {
  if (id === B.SAPLING) return 'oak';
  if (id === B.BIRCH_SAPLING) return 'birch';
  if (id === B.SPRUCE_SAPLING) return 'spruce';
  if (id === B.ACACIA_SAPLING) return 'acacia';
  if (id === B.JUNGLE_SAPLING) return 'jungle';
  if (id === B.DARK_OAK_SAPLING) return 'dark_oak';
  if (id === B.CHERRY_SAPLING) return 'cherry';
  if (id === GROVE.mangrove.sapling) return 'mangrove';
  if (id === GROVE.paleOak.sapling) return 'pale_oak';
  if (id === GROVE.azalea || id === B.FLOWERING_AZALEA) return 'azalea';
  return null;
}

export function isSapling(id: number): boolean {
  return treeKindOfSapling(id) !== null;
}

/** Leaf layer radii of a spruce, from the tip downwards: a narrow cone with every other layer wider. */
const SPRUCE_RADII = [0, 1, 1, 2, 1, 2, 3, 2, 3, 3];
/** The mighty spruce: a longer, broader cone. */
const BIG_SPRUCE_RADII = [0, 1, 1, 2, 1, 2, 3, 2, 3, 4, 3, 4, 4, 3, 4, 4];

/** Does a trunk of this kind and size stand 2 x 2? */
export function isGiant(kind: TreeKind, big: boolean): boolean {
  return big && (kind === 'jungle' || kind === 'dark_oak');
}

export function treeBlocks(x: number, y: number, z: number, trunk: number, rand: () => number, kind: TreeKind = 'oak', big = false): TreeBlock[] {
  const out: TreeBlock[] = [];
  const topY = y + trunk;
  const leaves = LEAVES[kind];
  const log = LOG[kind];
  const leaf = (lx: number, ly: number, lz: number): void => {
    const id = kind === 'azalea' && rand() < 0.22 ? GROVE.floweringAzaleaLeaves : leaves;
    out.push({ x: lx, y: ly, z: lz, id, leaf: true });
  };
  const wood = (lx: number, ly: number, lz: number): void => {
    out.push({ x: lx, y: ly, z: lz, id: log, leaf: false });
  };
  /** A round disc of leaves around (cx, cz) (a half-block centre for the giants), with a ragged rim. */
  const disc = (cx: number, ly: number, cz: number, radius: number, hole = 0.08): void => {
    const r = Math.ceil(radius);
    const fx = cx - Math.floor(cx);
    const fz = cz - Math.floor(cz);
    for (let dx = -r - 1; dx <= r + 1; dx++) {
      for (let dz = -r - 1; dz <= r + 1; dz++) {
        const d2 = (dx - fx) ** 2 + (dz - fz) ** 2;
        if (d2 > radius * radius + 0.6) continue;
        // The rim loses a few leaves; the middle never has holes (the trunk must stay covered).
        if (d2 > (radius - 1) * (radius - 1) && rand() < hole) continue;
        leaf(Math.floor(cx) + dx, ly, Math.floor(cz) + dz);
      }
    }
  };

  if (kind === 'spruce') {
    // The cone starts two blocks up the trunk and ends in a single leaf above it.
    const layers = trunk - 1;
    const radii = big ? BIG_SPRUCE_RADII : SPRUCE_RADII;
    for (let j = 0; j < layers; j++) {
      const dy = topY + 1 - j;
      const radius = radii[Math.min(j, radii.length - 1)];
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const corner = Math.abs(dx) === radius && Math.abs(dz) === radius;
          if (corner && radius >= 1 && (radius >= 2 || rand() < 0.5)) continue;
          leaf(x + dx, dy, z + dz);
        }
      }
    }
  } else if (kind === 'acacia') {
    // Straight up, then one step to the side and on: a crooked trunk under a flat umbrella of leaves; now and then a second arm.
    const dir = Math.floor(rand() * 4);
    const [dx, dz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][dir];
    const bend = y + 2 + Math.floor(rand() * 2);
    let tx = x;
    let tz = z;
    for (let ty = y; ty < topY; ty++) {
      if (ty === bend) {
        tx += dx;
        tz += dz;
      }
      wood(tx, ty, tz);
    }
    disc(tx, topY, tz, 3, 0.18);
    disc(tx, topY + 1, tz, 1.4, 0);
    if (rand() < 0.55) {
      // The second arm leaves the trunk at the bend, the other way, and carries a smaller umbrella.
      const arm = 2 + Math.floor(rand() * 2);
      for (let k = 1; k <= arm; k++) {
        wood(x - dx * k, bend - 1 + k, z - dz * k);
        if (k > 1) wood(x - dx * k, bend - 2 + k, z - dz * k);
      }
      disc(x - dx * arm, bend + arm, z - dz * arm, 2.2, 0.15);
    }
  } else if (kind === 'jungle') {
    if (isGiant(kind, big)) {
      for (let ty = y; ty < topY; ty++) for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) wood(x + ox, ty, z + oz);
      const cx = x + 0.5;
      const cz = z + 0.5;
      // A broad crown, and leafy branches reaching out of the upper trunk.
      disc(cx, topY - 1, cz, 4.5, 0.12);
      disc(cx, topY, cz, 5.5, 0.12);
      disc(cx, topY + 1, cz, 4.2, 0.1);
      disc(cx, topY + 2, cz, 2.6, 0);
      const arms = 3 + Math.floor(rand() * 2);
      for (let a = 0; a < arms; a++) {
        const ang = rand() * Math.PI * 2;
        const ay = y + Math.floor(trunk * (0.5 + rand() * 0.3));
        const ex = Math.round(cx + Math.cos(ang) * 3);
        const ez = Math.round(cz + Math.sin(ang) * 3);
        wood(Math.round(cx + Math.cos(ang) * 1.5 - 0.5), ay, Math.round(cz + Math.sin(ang) * 1.5 - 0.5));
        wood(ex, ay + 1, ez);
        disc(ex, ay + 1, ez, 2.2, 0.15);
        disc(ex, ay + 2, ez, 1.4, 0);
      }
    } else {
      for (let ty = y; ty < topY; ty++) wood(x, ty, z);
      disc(x, topY - 2, z, 2.4, 0.15);
      disc(x, topY - 1, z, 3, 0.15);
      disc(x, topY, z, 2.2, 0.1);
      disc(x, topY + 1, z, 1.2, 0);
    }
  } else if (kind === 'dark_oak') {
    if (isGiant(kind, big)) {
      for (let ty = y; ty < topY; ty++) for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) wood(x + ox, ty, z + oz);
      const cx = x + 0.5;
      const cz = z + 0.5;
      // A great flat dome that droops at the rim.
      disc(cx, topY - 3, cz, 4.4, 0.35);
      disc(cx, topY - 2, cz, 5.2, 0.15);
      disc(cx, topY - 1, cz, 5.2, 0.1);
      disc(cx, topY, cz, 4.2, 0.08);
      disc(cx, topY + 1, cz, 2.6, 0);
      // A root flare and a couple of stubs make the trunk look old.
      for (const [ox, oz] of [[-1, 0], [2, 1], [0, 2], [1, -1]]) if (rand() < 0.5) wood(x + ox, y, z + oz);
    } else {
      for (let ty = y; ty < topY; ty++) wood(x, ty, z);
      disc(x, topY - 2, z, 2.4, 0.25);
      disc(x, topY - 1, z, 3.2, 0.12);
      disc(x, topY, z, 2.8, 0.1);
      disc(x, topY + 1, z, 1.4, 0);
    }
  } else if (kind === 'cherry') {
    // A short, thick trunk that forks: two branches lean out and each carries a puffy blossom crown of its own.
    for (let ty = y; ty < topY; ty++) wood(x, ty, z);
    const dir = Math.floor(rand() * 4);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const first = dirs[dir];
    const second = dirs[dir ^ 1];
    const fork = topY - 2;
    for (const [bx, bz] of [first, second]) {
      const len = 2 + Math.floor(rand() * 2);
      for (let k = 1; k <= len; k++) wood(x + bx * k, fork + Math.floor(k / 2), z + bz * k);
      disc(x + bx * len, fork + Math.floor(len / 2) + 1, z + bz * len, 2.7, 0.12);
      disc(x + bx * len, fork + Math.floor(len / 2) + 2, z + bz * len, 1.8, 0.08);
    }
    disc(x, topY - 1, z, 3.3, 0.14);
    disc(x, topY, z, 3.3, 0.1);
    disc(x, topY + 1, z, 2, 0.05);
  } else if (kind === 'oak' && big) {
    // The fancy oak: a tall trunk, a round crown and a few branches that carry crowns of their own.
    for (let ty = y; ty < topY; ty++) wood(x, ty, z);
    for (let dy = -3; dy <= 3; dy++) {
      const r = Math.sqrt(Math.max(0, 1 - (dy / 3.6) ** 2)) * 4.2;
      disc(x, topY - 1 + dy, z, Math.max(1, r), 0.1);
    }
    const arms = 2 + Math.floor(rand() * 2);
    for (let a = 0; a < arms; a++) {
      const ang = rand() * Math.PI * 2;
      const ay = y + Math.floor(trunk * (0.55 + rand() * 0.25));
      const len = 3 + Math.floor(rand() * 2);
      for (let k = 1; k <= len; k++) wood(Math.round(x + Math.cos(ang) * k), ay + Math.floor(k / 2), Math.round(z + Math.sin(ang) * k));
      const ex = Math.round(x + Math.cos(ang) * len);
      const ez = Math.round(z + Math.sin(ang) * len);
      disc(ex, ay + Math.floor(len / 2) + 1, ez, 2.4, 0.12);
      disc(ex, ay + Math.floor(len / 2) + 2, ez, 1.4, 0);
    }
  } else if (kind === 'birch' && big) {
    // A tall birch: a slim crown held high.
    for (let ty = y; ty < topY; ty++) wood(x, ty, z);
    disc(x, topY - 3, z, 1.8, 0.2);
    disc(x, topY - 2, z, 2.4, 0.15);
    disc(x, topY - 1, z, 2.4, 0.12);
    disc(x, topY, z, 1.6, 0.05);
    disc(x, topY + 1, z, 1, 0);
  } else {
    for (let dy = topY - 3; dy <= topY; dy++) {
      const radius = dy >= topY - 1 ? 1 : 2;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const corner = Math.abs(dx) === radius && Math.abs(dz) === radius;
          if (corner && (radius === 1 || rand() < 0.5)) continue;
          leaf(x + dx, dy, z + dz);
        }
      }
    }
  }
  if (kind === 'oak' && !big) for (let ty = y; ty < topY; ty++) wood(x, ty, z);
  else if (kind === 'birch' && !big) for (let ty = y; ty < topY; ty++) wood(x, ty, z);
  else if (kind === 'spruce') for (let ty = y; ty < topY; ty++) wood(x, ty, z);
  else if (kind === 'pale_oak' || kind === 'azalea') for (let ty = y; ty < topY; ty++) wood(x, ty, z);
  else if (kind === 'mangrove') {
    out.push({ x, y, z, id: GROVE.mangroveRoots, leaf: false });
    for (let ty = y + 1; ty < topY; ty++) wood(x, ty, z);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (rand() < 0.65) out.push({ x: x + dx, y, z: z + dz, id: GROVE.mangroveRoots, leaf: false });
    }
  }
  return out;
}

/** The soils a sapling may be planted in. */
const SAPLING_SOIL = new Set<number>([B.GRASS, B.DIRT, B.SNOW, B.PODZOL, B.COARSE_DIRT, B.MYCELIUM, B.MUD]);

/** Is there room (and soil) for a tree whose trunk starts at the sapling cell? */
export function canGrowTree(world: BlockReader, x: number, y: number, z: number, trunk: number): boolean {
  const soil = world.getBlock(x, y - 1, z);
  if (!SAPLING_SOIL.has(soil)) return false;
  // The column must be clear: only air, plants and leaves may be in the way.
  for (let ty = y + 1; ty <= y + trunk + 1; ty++) {
    const id = world.getBlock(x, ty, z);
    if (id !== B.AIR && !IS_LEAVES[id] && IS_SOLID[id]) return false;
  }
  return true;
}

export interface TreeEditor extends BlockReader {
  setBlock(x: number, y: number, z: number, id: number): boolean;
}

/** Replace the sapling at (x, y, z) by a tree of its kind. Returns false (and changes nothing) when blocked. */
export function growTree(world: TreeEditor, x: number, y: number, z: number, rand: () => number): boolean {
  const kind = treeKindOfSapling(world.getBlock(x, y, z));
  if (!kind) return false;
  const trunk = trunkHeight(kind, rand);
  if (!canGrowTree(world, x, y, z, trunk)) return false;
  for (const b of treeBlocks(x, y, z, trunk, rand, kind)) {
    if (b.leaf) {
      const here = world.getBlock(b.x, b.y, b.z);
      // Leaves may overwrite plants and other leaves, nothing else non-air.
      if (here !== B.AIR && IS_SOLID[here]) continue;
    }
    world.setBlock(b.x, b.y, b.z, b.id);
  }
  return true;
}
