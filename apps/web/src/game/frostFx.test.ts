import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { Fx } from '@solrift/shared';
import { buildFrostNova } from './frostFx';
import type { FxEntry, SpellKit } from './spellFx';

const voxel = new THREE.BoxGeometry(1, 1, 1);

const makeKit = () => {
  const impact = vi.fn();
  return { kit: { voxel, viewer: null, impact } as unknown as SpellKit, impact };
};
const mark = (over: Partial<Fx> = {}): Fx => ({ id: 1, k: 'frost_nova', x: 0, y: 0, z: 0, r: 5, age: 0, ttl: 2.5, by: 'me', ...over });
const entry = (ttl = 2.5): FxEntry => ({ group: new THREE.Group(), age: 0, ttl, materials: [], extra: [], animate: () => undefined });
const cubesOf = (e: FxEntry): THREE.InstancedMesh => e.group.children[0] as THREE.InstancedMesh;
interface Cube {
  x: number;
  y: number;
  z: number;
  r: number;
}
/** Every cube drawn: where it is and its red (the ground's blues are less red than the white of an arm). */
const cubes = (e: FxEntry): Cube[] => {
  const mesh = cubesOf(e);
  const c = new THREE.Color();
  const out: Cube[] = [];
  for (let i = 0; i < mesh.count; i++) {
    mesh.getColorAt(i, c);
    out.push({ x: mesh.instanceMatrix.array[i * 16 + 12], y: mesh.instanceMatrix.array[i * 16 + 13], z: mesh.instanceMatrix.array[i * 16 + 14], r: c.r });
  }
  return out;
};
const play = (r: number, age: number, ttl = 2.5): FxEntry => {
  const e = buildFrostNova(mark({ r, ttl }), entry(ttl), makeKit().kit);
  e.animate(age / ttl, age, 0.016);
  return e;
};
const flat = (list: Cube[]): Cube[] => list.filter((c) => c.y > 0.02 && c.y < 0.06);
const arms = (list: Cube[]): Cube[] => list.filter((c) => c.y > 0.08 && c.y < 0.1);

describe('the frost nova', () => {
  it('knocks the screen a little, once, and only when fresh', () => {
    const fresh = makeKit();
    buildFrostNova(mark(), entry(), fresh.kit).dispose?.();
    expect(fresh.impact).toHaveBeenCalledTimes(1);
    expect(fresh.impact.mock.calls[0][3]).toBeGreaterThan(0);
    expect(fresh.impact.mock.calls[0][3]).toBeLessThan(0.6);
    const late = makeKit();
    buildFrostNova(mark({ age: 1 }), entry(), late.kit).dispose?.();
    expect(late.impact).not.toHaveBeenCalled();
  });

  it('sweeps out as a shell of ice and freezes the ground behind its front', () => {
    const early = play(5, 0.12);
    const later = play(5, 0.6);
    const frozenEarly = flat(cubes(early)).length;
    const frozenLater = flat(cubes(later)).length;
    expect(frozenLater).toBeGreaterThan(frozenEarly + 100);
    // the shell reaches about the blast's radius, not far past it
    const mid = play(5, 0.4);
    const reach = Math.max(...cubes(mid).filter((c) => c.y < 0.5).map((c) => Math.hypot(c.x, c.z)));
    expect(reach).toBeGreaterThan(3);
    expect(reach).toBeLessThan(8);
    for (const e of [early, later, mid]) e.dispose?.();
  });

  it('thrusts crystals up, leaves a snowflake of white cubes on the frozen ground, and sinks them away at the end', () => {
    const e = play(5, 1.3);
    const all = cubes(e);
    expect(Math.max(...all.map((c) => c.y))).toBeGreaterThan(0.9);
    const white = arms(all);
    const plain = flat(all);
    expect(white.length).toBeGreaterThan(30);
    expect(plain.length).toBeGreaterThan(100);
    // the arms are whiter than the ground they lie on
    const mean = (l: Cube[]): number => l.reduce((s, c) => s + c.r, 0) / l.length;
    expect(mean(white)).toBeGreaterThan(mean(plain) + 0.1);
    // the crystals are gone before the frost is
    const end = play(5, 2.45);
    expect(Math.max(0, ...cubes(end).filter((c) => c.y > 0.3).map((c) => c.y))).toBeLessThan(1);
    e.dispose?.();
    end.dispose?.();
  });

  it('stays within its cap, at any moment and for any radius', () => {
    for (const r of [1, 5, 10]) {
      const e = buildFrostNova(mark({ r }), entry(), makeKit().kit);
      for (let age = 0; age <= 2.5; age += 0.1) {
        e.animate(age / 2.5, age, 0.1);
        const mesh = cubesOf(e);
        expect(mesh.count).toBeLessThanOrEqual(mesh.instanceMatrix.count);
      }
      e.dispose?.();
    }
  });

  it('is gone when the mark ends, even if an older server made it shorter', () => {
    for (const ttl of [0.8, 1.6, 2.5]) {
      const e = play(5, ttl, ttl);
      e.animate(1, ttl, 0);
      expect(cubesOf(e).count).toBe(0);
      e.dispose?.();
    }
  });
});
