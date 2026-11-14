import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { Fx } from '@solrift/shared';
import type { FxEntry, SpellKit } from './spellFx';
import { WandBoltView, buildWandHit } from './wandFx';

const voxel = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshBasicMaterial({ vertexColors: true });

/** What the effects take of the kit: the cube, the camera (none here) and the screen shake. */
const makeKit = () => {
  const impact = vi.fn();
  return { kit: { voxel, viewer: null, impact } as unknown as SpellKit, impact };
};

const mark = (over: Partial<Fx> = {}): Fx => ({ id: 1, k: 'wand_hit', x: 0, y: 0, z: 0, r: 0.8, age: 0, ttl: 0.6, by: 'me', ...over });
const entry = (): FxEntry => ({ group: new THREE.Group(), age: 0, ttl: 0.6, materials: [], extra: [], animate: () => undefined });
const cubesOf = (g: THREE.Group): THREE.InstancedMesh => g.children[0] as THREE.InstancedMesh;

describe("the wand's bolt in flight", () => {
  const SPEED = 28;
  const fly = (view: WandBoltView, p: { x: number; y: number; z: number; vx: number; vy: number; vz: number }, seconds: number, move = true): void => {
    for (let t = 0; t < seconds - 1e-9; t += 1 / 60) {
      if (move) p.z -= SPEED / 60;
      view.update(p, t, 1 / 60);
    }
  };

  it('is a head and a trail of cubes that grows as it flies and never passes its cap', () => {
    const p = { x: 0, y: 1.5, z: 0, vx: 0, vy: 0, vz: -SPEED };
    const view = new WandBoltView(makeKit().kit, material, p);
    const mesh = cubesOf(view.group);
    const first = mesh.count;
    expect(first).toBeGreaterThan(8);
    fly(view, p, 0.25);
    expect(mesh.count).toBeGreaterThan(first);
    fly(view, p, 3);
    expect(mesh.count).toBeLessThanOrEqual(mesh.instanceMatrix.count);
    view.dispose();
  });

  it('leaves nothing behind once it stops: the trail, the sparks and the flash all shrink away, the head stays', () => {
    const p = { x: 0, y: 1.5, z: 0, vx: 0, vy: 0, vz: -SPEED };
    const view = new WandBoltView(makeKit().kit, material, p);
    fly(view, p, 0.5);
    const flying = cubesOf(view.group).count;
    fly(view, p, 1.2, false);
    const resting = cubesOf(view.group).count;
    expect(resting).toBeLessThan(flying);
    expect(resting).toBeLessThanOrEqual(11); // the core, a star of six or eight, two circling cubes
    expect(resting).toBeGreaterThanOrEqual(9);
    view.dispose();
  });

  it('does not draw a line across a jump (a slot handed to another bolt)', () => {
    const p = { x: 0, y: 1.5, z: 0, vx: 0, vy: 0, vz: -SPEED };
    const view = new WandBoltView(makeKit().kit, material, p);
    fly(view, p, 0.3);
    p.x += 200;
    view.update(p, 1, 1 / 60);
    const mesh = cubesOf(view.group);
    const m = mesh.instanceMatrix.array;
    for (let i = 0; i < mesh.count; i++) {
      // each cube sits near the bolt (positions are relative to it), except the ones left where the bolt was before it jumped, which are the old trail and no longer connected to anything new
      const near = Math.hypot(m[i * 16 + 12], m[i * 16 + 13], m[i * 16 + 14]) < 6;
      const old = Math.abs(m[i * 16 + 12]) > 150;
      expect(near || old).toBe(true);
    }
    // and no new cube was laid along the 200 blocks of the jump
    expect(mesh.count).toBeLessThan(120);
    view.dispose();
  });
});

describe("the burst of a wand's bolt", () => {
  it('pops at once, flies out as cubes and is gone when the mark ends', () => {
    const { kit, impact } = makeKit();
    const e = buildWandHit(mark(), entry(), kit);
    const mesh = cubesOf(e.group);
    e.animate(0.05 / 0.6, 0.05, 0);
    expect(mesh.count).toBeGreaterThan(10);
    e.animate(0.3 / 0.6, 0.3, 0);
    expect(mesh.count).toBeGreaterThan(0);
    expect(mesh.count).toBeLessThanOrEqual(mesh.instanceMatrix.count);
    e.animate(1, 0.6, 0);
    expect(mesh.count).toBe(0);
    expect(impact).toHaveBeenCalledTimes(1);
    e.dispose?.();
  });

  it('shakes the screen only when it is fresh (a mark that arrives late is not replayed)', () => {
    const { kit, impact } = makeKit();
    buildWandHit(mark({ age: 0.5 }), entry(), kit).dispose?.();
    expect(impact).not.toHaveBeenCalled();
  });

  it('is bigger for a bigger blast', () => {
    const small = buildWandHit(mark({ r: 0.8 }), entry(), makeKit().kit);
    const big = buildWandHit(mark({ id: 2, r: 1.6 }), entry(), makeKit().kit);
    small.animate(0.2 / 0.6, 0.2, 0);
    big.animate(0.2 / 0.6, 0.2, 0);
    const spread = (e: FxEntry): number => {
      const mesh = cubesOf(e.group);
      let far = 0;
      for (let i = 0; i < mesh.count; i++) far = Math.max(far, Math.hypot(mesh.instanceMatrix.array[i * 16 + 12], mesh.instanceMatrix.array[i * 16 + 13], mesh.instanceMatrix.array[i * 16 + 14]));
      return far;
    };
    expect(spread(big)).toBeGreaterThan(spread(small));
    small.dispose?.();
    big.dispose?.();
  });
});
