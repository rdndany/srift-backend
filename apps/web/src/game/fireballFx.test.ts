import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { Fx } from '@solrift/shared';
import { FireballBoltView, buildFireballHit } from './fireballFx';
import type { FxEntry, SpellKit } from './spellFx';
import { StaffBoltView, buildStaffHit } from './staffFx';

const voxel = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshBasicMaterial({ vertexColors: true });

const makeKit = () => {
  const impact = vi.fn();
  return { kit: { voxel, viewer: null, impact } as unknown as SpellKit, impact };
};
const mark = (over: Partial<Fx> = {}): Fx => ({ id: 1, k: 'fireball_burst', x: 0, y: 0, z: 0, r: 2, age: 0, ttl: 1, by: 'me', ...over });
const entry = (ttl = 1): FxEntry => ({ group: new THREE.Group(), age: 0, ttl, materials: [], extra: [], animate: () => undefined });
const cubesOf = (g: THREE.Group): THREE.InstancedMesh => g.children[0] as THREE.InstancedMesh;
const reach = (e: FxEntry): number => {
  const mesh = cubesOf(e.group);
  let far = 0;
  for (let i = 0; i < mesh.count; i++) far = Math.max(far, Math.hypot(mesh.instanceMatrix.array[i * 16 + 12], mesh.instanceMatrix.array[i * 16 + 13], mesh.instanceMatrix.array[i * 16 + 14]));
  return far;
};
/** The colour of every cube drawn, as [r, g, b]. */
const colours = (g: THREE.Group): number[][] => {
  const mesh = cubesOf(g);
  const out: number[][] = [];
  for (let i = 0; i < mesh.count; i++) {
    const c = new THREE.Color();
    mesh.getColorAt(i, c);
    out.push([c.r, c.g, c.b]);
  }
  return out;
};

describe('the fireball in flight', () => {
  const SPEED = 22;
  const bolt = () => ({ x: 0, y: 1.5, z: 0, vx: 0, vy: 0, vz: -SPEED });
  const fly = (view: FireballBoltView | StaffBoltView, p: ReturnType<typeof bolt>, seconds: number, move = true): void => {
    for (let t = 0; t < seconds - 1e-9; t += 1 / 60) {
      if (move) p.z -= SPEED / 60;
      view.update(p, t, 1 / 60);
    }
  };

  it('stays within its cap, however long it flies', () => {
    const p = bolt();
    const view = new FireballBoltView(makeKit().kit, material, p);
    fly(view, p, 4);
    const mesh = cubesOf(view.group);
    expect(mesh.count).toBeGreaterThan(20);
    expect(mesh.count).toBeLessThanOrEqual(mesh.instanceMatrix.count);
    view.dispose();
  });

  it('is left with only its head when it stops: a core, a star of six or eight, three circling cubes', () => {
    const p = bolt();
    const view = new FireballBoltView(makeKit().kit, material, p);
    fly(view, p, 0.6);
    fly(view, p, 1.5, false);
    const n = cubesOf(view.group).count;
    expect(n).toBeGreaterThanOrEqual(10);
    expect(n).toBeLessThanOrEqual(12);
    view.dispose();
  });

  it('leaves a trail that drifts up as it burns out', () => {
    const p = bolt();
    const view = new FireballBoltView(makeKit().kit, material, p);
    fly(view, p, 0.5);
    // the flames of the trail sit higher the older they are: the tail end is above where the ball flew
    const mesh = cubesOf(view.group);
    let top = -Infinity;
    for (let i = 0; i < mesh.count; i++) top = Math.max(top, mesh.instanceMatrix.array[i * 16 + 13]);
    expect(top).toBeGreaterThan(0.25);
    view.dispose();
  });

  it('casts no shadow: its cubes are kept out of the map of figures, whose shader for an instanced mesh would be built at the first fireball', () => {
    const view = new FireballBoltView(makeKit().kit, material, bolt());
    expect(view.group.children.every((c) => c.userData.noShadow === true)).toBe(true);
    expect(view.group.children.length).toBeGreaterThan(0);
    view.dispose();
  });

  it('is drawn in fire colours, not violet', () => {
    const pf = bolt();
    const ps = bolt();
    const fire = new FireballBoltView(makeKit().kit, material, pf);
    const staff = new StaffBoltView(makeKit().kit, material, ps);
    fly(fire, pf, 0.3);
    fly(staff, ps, 0.3);
    const warm = colours(fire.group).filter(([r, , b]) => r > b + 0.2).length;
    expect(warm).toBeGreaterThan(colours(fire.group).length * 0.7);
    fire.dispose();
    staff.dispose();
  });
});

describe("the fireball's blast", () => {
  it('shakes the screen once, hard, and only when fresh', () => {
    const fire = makeKit();
    const staff = makeKit();
    buildFireballHit(mark(), entry(), fire.kit).dispose?.();
    buildStaffHit(mark({ k: 'staff_hit' }), entry(0.6), staff.kit).dispose?.();
    expect(fire.impact).toHaveBeenCalledTimes(1);
    expect(fire.impact.mock.calls[0][3]).toBeGreaterThan(staff.impact.mock.calls[0][3]);
    const late = makeKit();
    buildFireballHit(mark({ age: 0.6 }), entry(), late.kit).dispose?.();
    expect(late.impact).not.toHaveBeenCalled();
  });

  it('fills the blast (it is as wide as the burst the server hurts in), then leaves smoke, then nothing', () => {
    const hit = buildFireballHit(mark(), entry(), makeKit().kit);
    hit.animate(0.15, 0.15, 0);
    const mesh = cubesOf(hit.group);
    expect(mesh.count).toBeGreaterThan(60);
    expect(mesh.count).toBeLessThanOrEqual(mesh.instanceMatrix.count);
    expect(reach(hit)).toBeGreaterThan(1.2);
    expect(reach(hit)).toBeLessThan(4);
    // at 0.6 s the fire is out and what is left is smoke: grey cubes, none of them red-hot
    hit.animate(0.6, 0.6, 0);
    expect(mesh.count).toBeGreaterThan(0);
    for (const [r, , b] of colours(hit.group)) expect(r - b).toBeLessThan(0.3);
    hit.animate(1, 1, 0);
    expect(mesh.count).toBe(0);
    hit.dispose?.();
  });

  it('keeps its smoke inside the mark: nothing is drawn once the mark has ended, even for a short one', () => {
    const hit = buildFireballHit(mark({ ttl: 0.6 }), entry(0.6), makeKit().kit);
    hit.animate(1, 0.6, 0);
    expect(cubesOf(hit.group).count).toBe(0);
    hit.dispose?.();
  });
});
