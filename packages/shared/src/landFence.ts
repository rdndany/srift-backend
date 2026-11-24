import { B, BED_DIRS, BLOCKS, IS_LEAVES, IS_LOG, IS_SOLID, gateId, gateInfo, signId, signInfo } from './blocks';
import type { Polygon } from './landGeometry';
import { fitSignLine } from './signText';
import { WORLD_HEIGHT } from './chunk';

/**
 * The fence round a claim, built for the buyer the moment the deed is signed: a fence on the ground along the whole boundary, a gate where
 * the buyer stands (so the way in is theirs), and next to it a sign with the owner's name. It is only blocks: the ones that are built belong
 * to the claim (they are the owner's to keep or to take down, and the wilderness takes them with the claim when it is let go).
 */

export type FenceCell = readonly [number, number];

/** What the boundary is made of, and where the gate and the sign go. */
export interface FencePlan {
  /** Every block of the fence, the gate and the sign's place not included. */
  cells: FenceCell[];
  /** The gate: its block, and the axis it blocks (`facing` as `gateId` takes it). Null when no stretch of the boundary is straight enough. */
  gate: { at: FenceCell; facing: 0 | 2 } | null;
  /** The sign: its block and which way it faces (a BED_DIRS index: the way the back is turned, so the writing faces outward). Null when there is no room. */
  sign: { at: FenceCell; facing: number } | null;
}

const key = (x: number, z: number): string => `${x},${z}`;
const D4: readonly FenceCell[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const D8: readonly FenceCell[] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

/** The blocks along the edge of the claim: each block of it with a block outside beside it, joined so that no gap lets anybody through. */
export function boundaryCells(poly: Polygon): FenceCell[] {
  const inside = (x: number, z: number): boolean => {
    const ix = x - poly.box.x0;
    const iz = z - poly.box.z0;
    return ix >= 0 && iz >= 0 && ix < poly.w && iz < poly.h && poly.mask[iz * poly.w + ix] === 1;
  };
  const ring = new Map<string, FenceCell>();
  for (let z = poly.box.z0; z <= poly.box.z1; z++) {
    for (let x = poly.box.x0; x <= poly.box.x1; x++) {
      if (!inside(x, z)) continue;
      if (D4.some(([dx, dz]) => !inside(x + dx, z + dz))) ring.set(key(x, z), [x, z]);
    }
  }
  // Two blocks that only touch at a corner leave a gap a person can slip through: one of the blocks beside both is added.
  const extra: FenceCell[] = [];
  for (const [x, z] of ring.values()) {
    for (const [dx, dz] of D8) {
      if (!ring.has(key(x + dx, z + dz))) continue;
      if (ring.has(key(x + dx, z)) || ring.has(key(x, z + dz))) continue;
      const pick = inside(x + dx, z) ? ([x + dx, z] as FenceCell) : inside(x, z + dz) ? ([x, z + dz] as FenceCell) : null;
      if (pick) extra.push(pick);
    }
  }
  for (const c of extra) ring.set(key(c[0], c[1]), c);
  return [...ring.values()].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

/**
 * Where the fence, the gate and the sign go. The gate is on the straight stretch of boundary nearest to `reach` (where the buyer stands)
 * that has room for the sign beside it; the sign stands in the line of the fence, its writing turned outward.
 */
export function planFence(poly: Polygon, reach?: { x: number; z: number }): FencePlan {
  const cells = boundaryCells(poly);
  const ring = new Set(cells.map(([x, z]) => key(x, z)));
  const inside = (x: number, z: number): boolean => {
    const ix = x - poly.box.x0;
    const iz = z - poly.box.z0;
    return ix >= 0 && iz >= 0 && ix < poly.w && iz < poly.h && poly.mask[iz * poly.w + ix] === 1;
  };
  /** A block on a straight stretch: boundary on both sides along one axis, none along the other, and the outside on exactly one side of it. */
  const straight = (x: number, z: number): { axis: 'x' | 'z'; out: FenceCell } | null => {
    const alongX = ring.has(key(x - 1, z)) && ring.has(key(x + 1, z)) && !ring.has(key(x, z - 1)) && !ring.has(key(x, z + 1));
    const alongZ = ring.has(key(x, z - 1)) && ring.has(key(x, z + 1)) && !ring.has(key(x - 1, z)) && !ring.has(key(x + 1, z));
    if (alongX === alongZ) return null;
    const sides: FenceCell[] = alongX ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
    const outs = sides.filter(([dx, dz]) => !inside(x + dx, z + dz));
    return outs.length === 1 ? { axis: alongX ? 'x' : 'z', out: outs[0] } : null;
  };
  const rx = reach?.x ?? poly.box.x0;
  const rz = reach?.z ?? poly.box.z0;
  const candidates = cells
    .filter(([x, z]) => straight(x, z) !== null)
    .sort((a, b) => Math.hypot(a[0] + 0.5 - rx, a[1] + 0.5 - rz) - Math.hypot(b[0] + 0.5 - rx, b[1] + 0.5 - rz));
  let gate: FencePlan['gate'] = null;
  let sign: FencePlan['sign'] = null;
  for (const [x, z] of candidates) {
    const s = straight(x, z)!;
    // The sign goes on the next block of the same stretch (the one nearer the buyer first).
    const step: FenceCell = s.axis === 'x' ? [1, 0] : [0, 1];
    const sides: FenceCell[] = [[x + step[0], z + step[1]] as FenceCell, [x - step[0], z - step[1]] as FenceCell].sort((a, b) => Math.hypot(a[0] + 0.5 - rx, a[1] + 0.5 - rz) - Math.hypot(b[0] + 0.5 - rx, b[1] + 0.5 - rz));
    const beside = sides.find(([sx, sz]) => straight(sx, sz)?.axis === s.axis);
    if (!beside) continue;
    // The writing faces out, so the sign's back is turned to the inside: its facing is the way in.
    const inward = [-s.out[0], -s.out[1]];
    const facing = BED_DIRS.findIndex(([dx, dz]) => dx === inward[0] && dz === inward[1]);
    gate = { at: [x, z], facing: s.axis === 'x' ? 2 : 0 };
    sign = { at: beside, facing };
    break;
  }
  const taken = new Set<string>();
  if (gate) taken.add(key(gate.at[0], gate.at[1]));
  if (sign) taken.add(key(sign.at[0], sign.at[1]));
  return { cells: cells.filter(([x, z]) => !taken.has(key(x, z))), gate, sign };
}

/** What a build of the fence needs of the world. */
export interface FenceWorld {
  getBlock(x: number, y: number, z: number): number;
  setBlock(x: number, y: number, z: number, id: number): boolean;
  /** The ground the claim was measured on, at a block (the generator's height), so the fence stays near it. */
  groundAt(x: number, z: number): number;
}

/** Blocks a fence may take the place of: nothing, plants, snow, leaves. */
const replaceable = (id: number): boolean => id === B.AIR || (BLOCKS[id].replaceable && !BLOCKS[id].liquid) || IS_LEAVES[id] === 1;

/**
 * Where a fence stands in a column: on the highest solid block within a few blocks of the ground the claim was measured on (never on the top of a
 * tree), or -1 where it cannot stand (water, or something solid already in the way, which is a barrier of its own).
 */
export function fenceHeight(w: FenceWorld, x: number, z: number): number {
  const g = w.groundAt(x, z);
  for (let y = Math.min(WORLD_HEIGHT - 2, g + 4); y >= Math.max(1, g - 4); y--) {
    const id = w.getBlock(x, y, z);
    if (id === B.AIR || replaceable(id) || IS_LEAVES[id] === 1) continue;
    if (BLOCKS[id].liquid) return -1;
    if (IS_LOG[id] === 1 || IS_SOLID[id] !== 1) continue;
    return replaceable(w.getBlock(x, y + 1, z)) ? y + 1 : -1;
  }
  return -1;
}

export interface FenceResult {
  fences: number;
  gate: boolean;
  sign: boolean;
}

/** The lines a claim's sign says: whose it is, on four lines of a board. */
export function ownerSignLines(owner: string, claimName: string, defaultName: string): string[] {
  const named = claimName.trim() !== '' && claimName !== defaultName;
  return ['Property of', fitSignLine(owner), '', named ? fitSignLine(claimName) : ''];
}

/** Build the fence of a plan. Each block is put on the ground of its own column; the gate and the sign make a gap in nothing. */
export function buildFence(w: FenceWorld, plan: FencePlan, lines: string[], writeSign: (x: number, y: number, z: number, lines: string[]) => void): FenceResult {
  const out: FenceResult = { fences: 0, gate: false, sign: false };
  for (const [x, z] of plan.cells) {
    const y = fenceHeight(w, x, z);
    if (y < 0) continue;
    if (w.setBlock(x, y, z, B.FENCE)) out.fences++;
  }
  if (plan.gate) {
    const [x, z] = plan.gate.at;
    const y = fenceHeight(w, x, z);
    if (y >= 0 && w.setBlock(x, y, z, gateId(false, plan.gate.facing))) out.gate = true;
  }
  if (plan.sign) {
    const [x, z] = plan.sign.at;
    const y = fenceHeight(w, x, z);
    // (An oak sign: the first of the signs.)
    if (y >= 0 && w.setBlock(x, y, z, signId(0, plan.sign.facing, false))) {
      writeSign(x, y, z, lines);
      out.sign = true;
    }
  }
  return out;
}

/** Take down what was built for a boundary (before a bigger one is built): the blocks that are still the fence, gate or sign put there. */
export function removeFence(w: FenceWorld, poly: Polygon, forget: (x: number, y: number, z: number) => void): number {
  let n = 0;
  const plan = planFence(poly);
  const all: FenceCell[] = [...plan.cells, ...(plan.gate ? [plan.gate.at] : []), ...(plan.sign ? [plan.sign.at] : [])];
  for (const [x, z] of all) {
    const g = w.groundAt(x, z);
    for (let y = Math.max(1, g - 4); y <= Math.min(WORLD_HEIGHT - 2, g + 6); y++) {
      const id = w.getBlock(x, y, z);
      // Only what the fence is made of: an oak fence, an oak gate, an oak sign. (Anything else on the boundary is somebody's own.)
      if (id === B.FENCE || gateInfo(id) !== null || signInfo(id)?.wood === 0) {
        if (w.setBlock(x, y, z, B.AIR)) {
          n++;
          forget(x, y, z);
        }
        break;
      }
    }
  }
  return n;
}
