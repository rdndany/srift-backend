import * as THREE from 'three';
import type { SolidBox } from '@solrift/shared';
import type { Part } from './mobPaint';

/**
 * What a creature has besides its cylinder (its width and height, which is the body that walks and is hit), for a body that walks into it: a
 * box for each part of its model, as it stands at rest, that is thick enough to be a wall (a head, a giant's arm, a shield, a sword, the long
 * body of a horse) and sticks out of the cylinder. A part that is turned (a sword held up and out) is cut along its length and each piece
 * boxed, so that it is not one big block of the corner it leans into. Thin parts are not walls (the arms a zombie holds out in front of it would
 * catch a body between them and sweep it round as the zombie turns), and boxes inside others are left out. See `Solid` in physics.ts, and
 * `mobSolids.test.ts`, which keeps what is in the shared package the same as what this makes.
 */

/** A part has to be this thick (its smallest side, in the model's frame) to be a wall: below it, it is a limb or a detail. */
const MIN_THICK = 0.3;
const round = (n: number): number => Math.round(n * 100) / 100;

/** The box of a part in its own frame: [min x, min y, min z, max x, max y, max z]. */
function localBounds(p: Part): [number, number, number, number, number, number] | null {
  if (p.bricks && p.bricks.length > 0) {
    let b: [number, number, number, number, number, number] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const [x, y, z, w, h, d] of p.bricks) b = [Math.min(b[0], x - w / 2), Math.min(b[1], y - h / 2), Math.min(b[2], z - d / 2), Math.max(b[3], x + w / 2), Math.max(b[4], y + h / 2), Math.max(b[5], z + d / 2)];
    return b;
  }
  const [w, h, d] = p.size;
  // (A limb hangs from its joint; any other box is centred on it.)
  return p.hang ? [-w / 2, -h, -d / 2, w / 2, 0, d / 2] : [-w / 2, -h / 2, -d / 2, w / 2, h / 2, d / 2];
}

/** The boxes that stand for a model. */
export function solidBoxes(rig: readonly Part[], width: number): SolidBox[] {
  const world: THREE.Matrix4[] = [];
  const out: [number, number, number, number, number, number][] = [];
  rig.forEach((p, i) => {
    const local = new THREE.Matrix4().compose(new THREE.Vector3(...p.at), new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rotX ?? 0, p.rotY ?? 0, p.rotZ ?? 0, p.order ?? 'XYZ')), new THREE.Vector3(1, 1, 1));
    const m = p.of !== undefined && world[p.of] ? world[p.of].clone().multiply(local) : local;
    world[i] = m;
    if (p.flame !== undefined) return;
    const lb = localBounds(p);
    if (!lb) return;
    const size = [lb[3] - lb[0], lb[4] - lb[1], lb[5] - lb[2]];
    // Cut along the longest side: a part that is not square to the model is boxed in pieces about as long as it is thick.
    const axis = size.indexOf(Math.max(...size));
    const smallest = Math.min(...size.filter((s) => s > 0.05));
    if (!(smallest >= MIN_THICK)) return;
    const thin = smallest;
    const e = m.elements;
    // (Square to the model: the turned frame's axes are along the model's axes.)
    const square = [0, 1, 2].every((c) => [0, 1, 2].filter((r) => Math.abs(e[c * 4 + r]) > 0.02).length === 1);
    const pieces = square ? 1 : Math.max(1, Math.min(8, Math.round(size[axis] / (thin * 1.5))));
    for (let k = 0; k < pieces; k++) {
      const lo = [lb[0], lb[1], lb[2]];
      const hi = [lb[3], lb[4], lb[5]];
      hi[axis] = lb[axis] + ((k + 1) * size[axis]) / pieces;
      lo[axis] = lb[axis] + (k * size[axis]) / pieces;
      let b: [number, number, number, number, number, number] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) {
        const v = new THREE.Vector3(x, y, z).applyMatrix4(m);
        b = [Math.min(b[0], v.x), Math.min(b[1], v.y), Math.min(b[2], v.z), Math.max(b[3], v.x), Math.max(b[4], v.y), Math.max(b[5], v.z)];
      }
      out.push(b);
    }
  });
  // Boxes inside others add nothing.
  const inside = (a: number[], b: number[]): boolean => [0, 1, 2].every((i) => a[i] >= b[i] - 0.01 && a[i + 3] <= b[i + 3] + 0.01);
  const kept = out.filter((a, i) => !out.some((b, j) => j !== i && inside(a, b) && (!inside(b, a) || j < i)));
  // The cylinder is the body: a box wholly within it (the torso, a leg, a head on the shoulders) is the cylinder again.
  const r = width / 2 + 0.05;
  const beyond = (b: number[]): boolean => Math.max(Math.abs(b[0]), Math.abs(b[3])) > r || Math.max(Math.abs(b[2]), Math.abs(b[5])) > r;
  // (And not a flat or thin sliver of a turned part.)
  const solid = (b: number[]): boolean => Math.min(b[3] - b[0], b[4] - b[1], b[5] - b[2]) >= 0.15;
  return kept.filter((b) => beyond(b) && solid(b)).map((b) => [round((b[0] + b[3]) / 2), round((b[1] + b[4]) / 2), round((b[2] + b[5]) / 2), round(b[3] - b[0]), round(b[4] - b[1]), round(b[5] - b[2])] as const);
}
