import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Fx } from '@solrift/shared';
import { buildArrowStick } from './arrowFx';
import type { FxEntry, SpellKit } from './spellFx';

const voxel = new THREE.BoxGeometry(1, 1, 1);
const kit = { voxel, viewer: null, impact: () => undefined, locate: () => null } as unknown as SpellKit;
const TTL = 5;
const stick = (over: Partial<Fx> = {}): Fx => ({ id: 3, k: 'arrow_stick', x: 0, y: 0, z: 0, x2: 0, y2: 0, z2: -1, r: 0, age: 0, ttl: TTL, by: 'me', ...over }) as Fx;
const play = (f: Fx, age: number): FxEntry => {
  const e = buildArrowStick(f, { group: new THREE.Group(), age: 0, ttl: TTL, materials: [], extra: [], animate: () => undefined }, kit);
  e.animate(age / TTL, age, 0.016);
  return e;
};
const mesh = (e: FxEntry): THREE.InstancedMesh => e.group.children[0] as THREE.InstancedMesh;
const cubes = (e: FxEntry) => {
  const m = mesh(e).instanceMatrix.array;
  return Array.from({ length: mesh(e).count }, (_, i) => ({ x: m[i * 16 + 12], y: m[i * 16 + 13], z: m[i * 16 + 14], size: m[i * 16] }));
};

describe('an arrow stuck in a wall', () => {
  it('stands out of the surface, back along the way it was flying', () => {
    // flying towards -z: the shaft and fletching are on the +z side of where it went in
    const list = cubes(play(stick(), 1)).filter((c) => c.size > 0.05 && c.size < 0.12);
    expect(list.length).toBeGreaterThanOrEqual(5);
    expect(Math.max(...list.map((c) => c.z))).toBeGreaterThan(0.4);
    expect(Math.min(...list.map((c) => c.z))).toBeGreaterThan(-0.05);
  });

  it('points along any way: down into the ground it stands up out of it', () => {
    const list = cubes(play(stick({ x2: 0, y2: -1, z2: 0 }), 1)).filter((c) => c.size > 0.05 && c.size < 0.12);
    expect(Math.max(...list.map((c) => c.y))).toBeGreaterThan(0.4);
    expect(Math.min(...list.map((c) => c.y))).toBeGreaterThan(-0.05);
  });

  it('shivers as it lands and is still after', () => {
    // flying towards -z: the shaking is across it (x), and the far end of the shaft, the fletching, moves most
    const end = (age: number): number => Math.max(...cubes(play(stick(), age)).filter((c) => c.z > 0.45 && c.size > 0.06).map((c) => c.x));
    const spread = (age: number): number => {
      const xs = [0, 0.005, 0.01, 0.015, 0.02, 0.025, 0.03, 0.035].map((d) => end(age + d));
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(spread(0.03)).toBeGreaterThan(0.02);
    expect(spread(2)).toBeLessThan(0.001);
  });

  it('kicks up a little dust and crumbs at first, and none later', () => {
    const early = cubes(play(stick(), 0.12)).length;
    const later = cubes(play(stick(), 1)).length;
    expect(early).toBeGreaterThan(later);
  });

  it('shrinks away at the end and is gone when the mark is', () => {
    const sizes = (age: number): number => Math.max(0, ...cubes(play(stick(), age)).filter((c) => c.size < 0.12).map((c) => c.size));
    expect(sizes(TTL - 0.1)).toBeLessThan(sizes(2));
    expect(mesh(play(stick(), TTL)).count).toBe(0);
  });

  it('does not fall over when the mark has no direction', () => {
    expect(() => play(stick({ x2: undefined, y2: undefined, z2: undefined }), 0.5)).not.toThrow();
  });
});
