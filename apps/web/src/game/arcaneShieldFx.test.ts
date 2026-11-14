import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Fx } from '@solrift/shared';
import { buildArcaneShield, buildShieldShatter } from './arcaneShieldFx';
import type { FxEntry, SpellKit } from './spellFx';

const voxel = new THREE.BoxGeometry(1, 1, 1);

const makeKit = (over: Partial<SpellKit> = {}): SpellKit => ({ voxel, viewer: null, locate: () => null, impact: () => undefined, ...over }) as unknown as SpellKit;
const mark = (over: Partial<Fx> = {}): Fx => ({ id: 1, k: 'guard_arcane', x: 0, y: 0, z: 0, r: 1, age: 0, ttl: 6, by: 'me', ...over });
const entry = (ttl = 6): FxEntry => ({ group: new THREE.Group(), age: 0, ttl, materials: [], extra: [], animate: () => undefined });
const cubesOf = (e: FxEntry): THREE.InstancedMesh => e.group.children[0] as THREE.InstancedMesh;
const cubes = (e: FxEntry): { x: number; y: number; z: number; size: number }[] => {
  const mesh = cubesOf(e);
  const m = mesh.instanceMatrix.array;
  return Array.from({ length: mesh.count }, (_, i) => ({ x: m[i * 16 + 12], y: m[i * 16 + 13], z: m[i * 16 + 14], size: m[i * 16 + 5] }));
};
const shield = (age: number, ttl = 6, kit = makeKit()): FxEntry => {
  const e = buildArcaneShield(mark({ ttl }), entry(ttl), kit);
  e.animate(age / ttl, age, 0.016);
  return e;
};

describe('the arcane shield', () => {
  it('pops its cubes in one after another, two rings of six', () => {
    const early = cubes(shield(0.05));
    const full = cubes(shield(1));
    expect(early.length).toBeGreaterThan(0);
    expect(early.length).toBeLessThan(12);
    expect(full).toHaveLength(12);
  });

  it('circles the body at the hip and at the shoulder', () => {
    const list = cubes(shield(2));
    expect(list.filter((c) => c.y < 1).length).toBe(6);
    expect(list.filter((c) => c.y > 1).length).toBe(6);
    for (const c of list) expect(Math.hypot(c.x, c.z)).toBeGreaterThan(0.6);
  });

  it('turns: the same cube is somewhere else a moment later', () => {
    const a = cubes(shield(2))[0];
    const b = cubes(shield(2.4))[0];
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.2);
  });

  it('shrinks away when it runs out: nothing is left at the end', () => {
    expect(cubes(shield(5.8)).length).toBeGreaterThan(0);
    expect(cubes(shield(5.8)).every((c) => c.size < 0.2)).toBe(true);
    expect(cubes(shield(6))).toHaveLength(0);
  });

  it('is drawn where the figure is drawn, not where the server last said', () => {
    const e = shield(1, 6, makeKit({ locate: () => ({ x: 5, y: 2, z: 7 }) }));
    expect(e.group.position.toArray()).toEqual([5, 2, 7]);
  });

  it('follows the owner when the figure cannot be found', () => {
    const e = shield(1);
    e.update?.(mark({ x: 30, y: 0, z: 0 }));
    e.animate(0.2, 1.2, 0.016);
    expect(e.group.position.x).toBe(30); // far: a teleport, it snaps
  });

  it('is not drawn in the eyes of its owner in first person', () => {
    expect(cubes(shield(1, 6, makeKit({ viewer: new THREE.Vector3(0, 1.62, 0) })))).toHaveLength(0);
  });
});

describe('the breaking of the arcane shield', () => {
  const shatter = (age: number): FxEntry => {
    const e = entry(0.9);
    buildShieldShatter(e, makeKit());
    e.animate(age / 0.9, age, 0.016);
    return e;
  };

  it('throws cubes out from the body', () => {
    const reach = (age: number): number => Math.max(...cubes(shatter(age)).map((c) => Math.hypot(c.x, c.z)));
    expect(reach(0.3)).toBeGreaterThan(reach(0.02) + 0.5);
  });

  it('lets them fall and shrink away, and is gone at the end', () => {
    expect(cubes(shatter(0.7)).length).toBeLessThan(cubes(shatter(0.1)).length);
    expect(cubes(shatter(0.9))).toHaveLength(0);
  });
});
