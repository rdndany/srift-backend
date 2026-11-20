import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

// The merge is watched, so each mesh can be traced back to the blocks it was made of.
const merges: { inputs: THREE.BufferGeometry[]; output: THREE.BufferGeometry }[] = [];
vi.mock('three/examples/jsm/utils/BufferGeometryUtils.js', async () => {
  const real = await vi.importActual<typeof import('three/examples/jsm/utils/BufferGeometryUtils.js')>('three/examples/jsm/utils/BufferGeometryUtils.js');
  return {
    ...real,
    mergeGeometries: (inputs: THREE.BufferGeometry[], groups?: boolean) => {
      const output = real.mergeGeometries(inputs, groups)!;
      merges.push({ inputs: inputs.map((g) => g.clone()), output });
      return output;
    },
  };
});

import { dressRanger, dressWarrior } from './classGear';
import type { GearCtx } from './mageGear';

interface Block {
  parent: THREE.Object3D;
  min: THREE.Vector3;
  max: THREE.Vector3;
  mat: string;
  mesh: THREE.Object3D;
}

/** Dress a class on a bare skeleton of pivots and list every block it is made of, in the space of the part it hangs on. */
function blocksOf(dress: (ctx: GearCtx) => unknown): Block[] {
  (globalThis as { document?: unknown }).document ??= {
    createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillStyle: '', fillRect: () => undefined }) }),
  };
  merges.length = 0;
  const part = (name: string): THREE.Object3D => Object.assign(new THREE.Group(), { name });
  const ctx: GearCtx = {
    box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
    add: (parent, geo, mat) => {
      const mesh = new THREE.Mesh(geo, mat);
      parent.add(mesh);
      return mesh;
    },
    head: part('head'),
    torso: part('torso'),
    armL: part('armL'),
    armR: part('armR'),
    legL: part('legL'),
    legR: part('legR'),
  };
  const out: Block[] = [];
  const add = ctx.add;
  ctx.add = (parent, geo, mat) => {
    const mesh = add(parent, geo, mat);
    const m = merges.find((x) => x.output === geo);
    for (const g of m ? m.inputs : [geo]) {
      g.computeBoundingBox();
      const b = g.boundingBox!;
      // Only blocks that sit still on their part: a cape's own pivot is another space.
      out.push({ parent, min: b.min.clone(), max: b.max.clone(), mat: Array.isArray(mat) ? mat[0].uuid : mat.uuid, mesh });
    }
    return mesh;
  };
  dress(ctx);
  // Pieces a class moved after adding them (a quiver's rim) are seen where they ended up.
  for (const b of out) {
    b.min.add(b.mesh.position);
    b.max.add(b.mesh.position);
  }
  return out;
}

const AXES = [0, 1, 2] as const;
const key = (v: THREE.Vector3, a: number): number => (a === 0 ? v.x : a === 1 ? v.y : v.z);

/**
 * Two faces of the same direction on (almost) the same plane that overlap are drawn on top of each other, and which one wins
 * changes with the view: it flickers. A face buried inside another block is never seen, so it does not count.
 */
function fighting(blocks: Block[], gap: number): string[] {
  const found: string[] = [];
  const inside = (b: Block, p: THREE.Vector3): boolean => AXES.every((k) => p.getComponent(k) > key(b.min, k) + 1e-6 && p.getComponent(k) < key(b.max, k) - 1e-6);
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i];
      const b = blocks[j];
      if (a.parent !== b.parent) continue;
      for (const ax of AXES) {
        const [u, v] = AXES.filter((k) => k !== ax);
        const u0 = Math.max(key(a.min, u), key(b.min, u));
        const u1 = Math.min(key(a.max, u), key(b.max, u));
        const v0 = Math.max(key(a.min, v), key(b.min, v));
        const v1 = Math.min(key(a.max, v), key(b.max, v));
        if (u1 - u0 <= 0.004 || v1 - v0 <= 0.004) continue;
        for (const sign of [1, -1]) {
          const pa = sign > 0 ? key(a.max, ax) : key(a.min, ax);
          const pb = sign > 0 ? key(b.max, ax) : key(b.min, ax);
          if (Math.abs(pa - pb) > gap) continue;
          // Is any part of the shared patch out in the open (in front of it nothing else stands)?
          let open = false;
          for (let su = 0; su < 4 && !open; su++) {
            for (let sv = 0; sv < 4 && !open; sv++) {
              const p = new THREE.Vector3();
              p.setComponent(ax, (sign > 0 ? Math.max(pa, pb) : Math.min(pa, pb)) + sign * 1e-4);
              p.setComponent(u, u0 + ((su + 0.5) / 4) * (u1 - u0));
              p.setComponent(v, v0 + ((sv + 0.5) / 4) * (v1 - v0));
              if (!blocks.some((o) => o !== a && o !== b && o.parent === a.parent && inside(o, p)) && !inside(a, p) && !inside(b, p)) open = true;
            }
          }
          if (!open) continue;
          const f = (n: THREE.Vector3): string => n.toArray().map((x) => x.toFixed(3)).join(',');
          found.push(`${a.parent.name} ${'xyz'[ax]}${sign > 0 ? '+' : '-'} @${pa.toFixed(3)}/${pb.toFixed(3)}: [${f(a.min)}]..[${f(a.max)}] vs [${f(b.min)}]..[${f(b.max)}]`);
        }
      }
    }
  }
  return found;
}

describe('what a class wears does not flicker', () => {
  it('the Warrior has no faces laid on top of each other', () => {
    const found = fighting(blocksOf(dressWarrior), 0.0012);
    expect(found, found.join('\n')).toEqual([]);
  });
  it('the Ranger has no faces laid on top of each other', () => {
    const found = fighting(blocksOf(dressRanger), 0.0012);
    expect(found, found.join('\n')).toEqual([]);
  });
});
