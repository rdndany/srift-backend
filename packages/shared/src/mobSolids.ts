import type { Solid, SolidBox } from './physics';
import { MOB_SOLID_BOXES } from './mobSolidsData';

export { MOB_SOLID_BOXES };

/**
 * What a creature is to a body that walks into it: its cylinder (its width and height) and, besides it, the thick parts of the shape it is drawn in that stick out of it (the head, a giant's arms, the shield and the sword), so that a player cannot step into the arm of a giant or the head of a horse that stands out beyond its body.
 * The boxes are made from the models themselves (see `mobSolidsBuild.ts` in the web app; `mobSolids.test.ts` there says when they are out of date).
 */

/** How far from its middle (x, z) any box of a kind reaches, at the size of the boxes. */
const REACH = new Map<string, number>();
export function mobReach(kind: string): number {
  let r = REACH.get(kind);
  if (r === undefined) {
    r = 0;
    for (const [cx, , cz, sx, , sz] of MOB_SOLID_BOXES[kind] ?? []) r = Math.max(r, Math.hypot(Math.abs(cx) + sx / 2, Math.abs(cz) + sz / 2));
    REACH.set(kind, r);
  }
  return r;
}

/**
 * How far from a creature's middle a body can be and still be touched by it: the cylinder it has, or the reach of its boxes (a creature's own
 * `width` is what the physics of its walking uses and stays as it is).
 */
export function mobTouch(kind: string, scale: number, width: number): number {
  return Math.max(width / 2, mobReach(kind) * scale);
}

/** The solid a creature is, standing at x, y, z (its feet), facing `yaw`, `scale` times the size of its model, `width` and `height` as it is in the world. */
export function mobSolid(kind: string, x: number, y: number, z: number, yaw: number, scale: number, width: number, height: number): Solid {
  const boxes: readonly SolidBox[] | undefined = MOB_SOLID_BOXES[kind];
  if (!boxes || boxes.length === 0) return { x, y, z, r: width / 2, h: height };
  return { x, y, z, r: width / 2, h: height, boxes, yaw, scale, reach: mobReach(kind) * scale };
}
