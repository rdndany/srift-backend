import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { Fx } from '@solrift/shared';
import type { FxEntry, SpellKit } from './spellFx';
import { StaffBoltView, buildStaffHit } from './staffFx';
import { WandBoltView, buildWandHit } from './wandFx';

const voxel = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshBasicMaterial({ vertexColors: true });

const makeKit = () => {
  const impact = vi.fn();
  return { kit: { voxel, viewer: null, impact } as unknown as SpellKit, impact };
};
const mark = (over: Partial<Fx> = {}): Fx => ({ id: 1, k: 'staff_hit', x: 0, y: 0, z: 0, r: 0.8, age: 0, ttl: 0.6, by: 'me', ...over });
const entry = (): FxEntry => ({ group: new THREE.Group(), age: 0, ttl: 0.6, materials: [], extra: [], animate: () => undefined });
const cubesOf = (g: THREE.Group): THREE.InstancedMesh => g.children[0] as THREE.InstancedMesh;
const reach = (e: FxEntry): number => {
  const mesh = cubesOf(e.group);
  let far = 0;
  for (let i = 0; i < mesh.count; i++) far = Math.max(far, Math.hypot(mesh.instanceMatrix.array[i * 16 + 12], mesh.instanceMatrix.array[i * 16 + 13], mesh.instanceMatrix.array[i * 16 + 14]));
  return far;
};
/** The biggest cube drawn (its size along x). */
const biggest = (g: THREE.Group): number => {
  const mesh = cubesOf(g);
  let big = 0;
  for (let i = 0; i < mesh.count; i++) big = Math.max(big, mesh.instanceMatrix.array[i * 16]);
  return big;
};

describe("the staff's bolt in flight", () => {
  const SPEED = 24;
  const fly = (view: StaffBoltView | WandBoltView, p: { x: number; y: number; z: number; vx: number; vy: number; vz: number }, seconds: number, move = true): void => {
    for (let t = 0; t < seconds - 1e-9; t += 1 / 60) {
      if (move) p.z -= SPEED / 60;
      view.update(p, t, 1 / 60);
    }
  };
  const bolt = () => ({ x: 0, y: 1.5, z: 0, vx: 0, vy: 0, vz: -SPEED });

  it('stays within its cap, however long it flies', () => {
    const p = bolt();
    const view = new StaffBoltView(makeKit().kit, material, p);
    fly(view, p, 4);
    const mesh = cubesOf(view.group);
    expect(mesh.count).toBeGreaterThan(20);
    expect(mesh.count).toBeLessThanOrEqual(mesh.instanceMatrix.count);
    view.dispose();
  });

  it('is left with only its head when it stops: a core, a star of six or eight, four circling cubes', () => {
    const p = bolt();
    const view = new StaffBoltView(makeKit().kit, material, p);
    fly(view, p, 0.6);
    fly(view, p, 1.5, false);
    const n = cubesOf(view.group).count;
    expect(n).toBeGreaterThanOrEqual(11);
    expect(n).toBeLessThanOrEqual(13);
    view.dispose();
  });

  it('is heavier than the wand: bigger cubes, more circling it, a trail that lasts longer', () => {
    const pw = bolt();
    const pst = bolt();
    const wand = new WandBoltView(makeKit().kit, material, pw);
    const staff = new StaffBoltView(makeKit().kit, material, pst);
    fly(wand, pw, 1);
    fly(staff, pst, 1);
    expect(biggest(staff.group)).toBeGreaterThan(biggest(wand.group));
    // stopped for half a second: the wand's trail (0.4 s) is gone, the staff's (0.6 s) is not
    fly(wand, pw, 0.5, false);
    fly(staff, pst, 0.5, false);
    expect(cubesOf(staff.group).count).toBeGreaterThan(cubesOf(wand.group).count);
    wand.dispose();
    staff.dispose();
  });
});

describe("the burst of a staff's bolt", () => {
  it('knocks the screen harder than a wand, once, and only when fresh', () => {
    const staff = makeKit();
    const wand = makeKit();
    buildStaffHit(mark(), entry(), staff.kit).dispose?.();
    buildWandHit(mark({ k: 'wand_hit' }), entry(), wand.kit).dispose?.();
    expect(staff.impact).toHaveBeenCalledTimes(1);
    expect(staff.impact.mock.calls[0][3]).toBeGreaterThan(wand.impact.mock.calls[0][3]);
    const late = makeKit();
    buildStaffHit(mark({ age: 0.5 }), entry(), late.kit).dispose?.();
    expect(late.impact).not.toHaveBeenCalled();
  });

  it('is bigger than a wand burst (with a shell of edges and an echo), and gone when the mark ends', () => {
    const staff = buildStaffHit(mark(), entry(), makeKit().kit);
    const wand = buildWandHit(mark({ k: 'wand_hit', id: 2 }), entry(), makeKit().kit);
    staff.animate(0.25 / 0.6, 0.25, 0);
    wand.animate(0.25 / 0.6, 0.25, 0);
    expect(reach(staff)).toBeGreaterThan(reach(wand));
    expect(cubesOf(staff.group).count).toBeGreaterThan(cubesOf(wand.group).count);
    expect(cubesOf(staff.group).count).toBeLessThanOrEqual(cubesOf(staff.group).instanceMatrix.count);
    staff.animate(1, 0.6, 0);
    expect(cubesOf(staff.group).count).toBe(0);
    staff.dispose?.();
    wand.dispose?.();
  });
});
