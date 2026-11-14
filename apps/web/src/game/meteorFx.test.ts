import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { Fx } from '@solrift/shared';
import { buildMeteorHit, buildMeteorWarn } from './meteorFx';
import type { FxEntry, SpellKit } from './spellFx';

const voxel = new THREE.BoxGeometry(1, 1, 1);

const makeKit = () => {
  const impact = vi.fn();
  return { kit: { voxel, viewer: null, impact } as unknown as SpellKit, impact };
};
const warnMark = (over: Partial<Fx> = {}): Fx => ({ id: 1, k: 'meteor_warn', x: 0, y: 0, z: 0, r: 4, age: 0, ttl: 1.7, by: 'me', ...over });
const hitMark = (over: Partial<Fx> = {}): Fx => ({ id: 2, k: 'meteor_hit', x: 0, y: 0, z: 0, r: 4, age: 0, ttl: 1.8, by: 'me', ...over });
const entry = (ttl: number): FxEntry => ({ group: new THREE.Group(), age: 0, ttl, materials: [], extra: [], animate: () => undefined });
const cubesOf = (e: FxEntry): THREE.InstancedMesh => e.group.children[0] as THREE.InstancedMesh;
/** Where every cube drawn is, as [x, y, z]. */
const spots = (e: FxEntry): number[][] => {
  const mesh = cubesOf(e);
  const out: number[][] = [];
  for (let i = 0; i < mesh.count; i++) out.push([mesh.instanceMatrix.array[i * 16 + 12], mesh.instanceMatrix.array[i * 16 + 13], mesh.instanceMatrix.array[i * 16 + 14]]);
  return out;
};
const top = (e: FxEntry): number[] => spots(e).reduce((a, b) => (b[1] > a[1] ? b : a), [0, -Infinity, 0]);

describe('the meteor on its way down', () => {
  it('has the rock high up on the slant at the start, and over the target when it lands', () => {
    const e = buildMeteorWarn(warnMark(), entry(1.7), makeKit().kit);
    e.animate(0.06, 0.1, 0.016);
    const [x, y, z] = top(e);
    // it comes from high up, to one side and behind
    expect(y).toBeGreaterThan(20);
    expect(x).toBeGreaterThan(5);
    expect(z).toBeGreaterThan(2);
    // a moment before it lands the rock itself (big cubes, not the tail or the ground) is low, right over the mark
    e.animate(0.75, 1.28, 0.016);
    const mesh = cubesOf(e);
    const heads = spots(e).filter((s, i) => s[1] > 0.5 && mesh.instanceMatrix.array[i * 16] > 0.3 && Math.hypot(s[0] - 0.3, s[1] - 1.3, s[2] - 0.2) < 2);
    expect(heads.length).toBeGreaterThan(5);
    e.dispose?.();
  });

  it('is only the mark on the ground once it has landed, and nothing at the end', () => {
    const e = buildMeteorWarn(warnMark(), entry(1.7), makeKit().kit);
    e.animate(0.8, 1.35, 0.016);
    // nothing of the rock, its tail or its sparks is left: what stands above the ground is a few embers
    expect(top(e)[1]).toBeLessThan(3);
    expect(cubesOf(e).count).toBeGreaterThan(50);
    e.animate(1, 1.7, 0.016);
    expect(cubesOf(e).count).toBe(0);
    e.dispose?.();
  });

  it('heats up: the floor of the mark fills in as the rock comes down', () => {
    const e = buildMeteorWarn(warnMark(), entry(1.7), makeKit().kit);
    e.animate(0.1, 0.15, 0.016);
    const early = spots(e).filter((s) => s[1] < 0.08 && s[1] > 0.04).length;
    e.animate(0.7, 1.2, 0.016);
    const late = spots(e).filter((s) => s[1] < 0.08 && s[1] > 0.04).length;
    expect(late).toBeGreaterThan(early + 30);
    e.dispose?.();
  });

  it('stays within its cap, at any moment and for a big mark', () => {
    for (const r of [1, 4, 8]) {
      const e = buildMeteorWarn(warnMark({ r }), entry(1.7), makeKit().kit);
      for (let age = 0; age <= 1.7; age += 0.05) {
        e.animate(age / 1.7, age, 0.05);
        const mesh = cubesOf(e);
        expect(mesh.count).toBeLessThanOrEqual(mesh.instanceMatrix.count);
      }
      e.dispose?.();
    }
  });
});

describe('the meteor landing', () => {
  it('knocks the screen once, hard, and only when fresh', () => {
    const fresh = makeKit();
    buildMeteorHit(hitMark(), entry(1.8), fresh.kit).dispose?.();
    expect(fresh.impact).toHaveBeenCalledTimes(1);
    expect(fresh.impact.mock.calls[0][3]).toBeGreaterThan(0.9);
    const late = makeKit();
    buildMeteorHit(hitMark({ age: 1 }), entry(1.8), late.kit).dispose?.();
    expect(late.impact).not.toHaveBeenCalled();
  });

  it('throws a pillar of fire up, leaves a crater and a cloud, and clears away by the end of the mark', () => {
    const e = buildMeteorHit(hitMark(), entry(1.8), makeKit().kit);
    e.animate(0.1, 0.18, 0.016);
    // a pillar of cubes more than a couple of blocks high
    expect(top(e)[1]).toBeGreaterThan(3);
    // the crater: many flat cubes lying on the ground, still there when the fire is out
    e.animate(0.6, 1.1, 0.016);
    const flat = spots(e).filter((s) => s[1] < 0.08).length;
    expect(flat).toBeGreaterThan(100);
    // some cloud drifts above it
    expect(top(e)[1]).toBeGreaterThan(1.5);
    e.animate(1, 1.8, 0.016);
    expect(cubesOf(e).count).toBe(0);
    e.dispose?.();
  });

  it('is as wide as the blast: the rings and the crater reach the radius and not far past it', () => {
    const e = buildMeteorHit(hitMark(), entry(1.8), makeKit().kit);
    e.animate(0.3, 0.55, 0.016);
    const flat = spots(e).filter((s) => s[1] < 0.5 && s[1] > 0);
    const reach = Math.max(...flat.map((s) => Math.hypot(s[0], s[2])));
    expect(reach).toBeGreaterThan(3);
    // the dust may be thrown out further than the rings, but the crater itself stops at the edge
    e.animate(0.7, 1.4, 0.016);
    const crater = spots(e).filter((s) => s[1] > 0.03 && s[1] < 0.05);
    expect(crater.length).toBeGreaterThan(80);
    expect(Math.max(...crater.map((s) => Math.hypot(s[0], s[2])))).toBeLessThan(4.6);
    e.dispose?.();
  });

  it('stays within its cap, and ends cleanly even when the mark is shorter than it should be', () => {
    for (const ttl of [0.6, 1.3, 1.8]) {
      const e = buildMeteorHit(hitMark({ ttl, r: 6 }), entry(ttl), makeKit().kit);
      for (let age = 0; age <= ttl; age += 0.05) {
        e.animate(age / ttl, age, 0.05);
        const mesh = cubesOf(e);
        expect(mesh.count).toBeLessThanOrEqual(mesh.instanceMatrix.count);
      }
      e.animate(1, ttl, 0);
      expect(cubesOf(e).count).toBe(0);
      e.dispose?.();
    }
  });
});
