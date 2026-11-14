import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ArcSet } from './arcs';

/** A set with bolts that always strike between the same two points, a block apart, and the widest ring across any of them. */
function strike(viewer: THREE.Vector3 | null, near: readonly [number, number], thin = 1): number {
  const parent = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial();
  const set = new ArcSet(parent, mat, mat, {
    slots: 2,
    rate: 1e6,
    life: [10, 10],
    radius: 0.1,
    jag: 0,
    pick: (from, to) => {
      from.set(0, 0, 0);
      to.set(1, 0, 0);
    },
  });
  set.setView(viewer, near, thin);
  set.update(0.1, 1); // the bolts strike
  set.update(0.1, 1); // and are drawn
  let widest = 0;
  for (const m of set.group.children as THREE.Mesh[]) {
    if (!m.visible) continue;
    const p = m.geometry.getAttribute('position');
    // The middle of the bolt: its three corners are the width of the tube (index 5 of 12 points, 3 sides each).
    const a = new THREE.Vector3().fromBufferAttribute(p, 5 * 3);
    const b = new THREE.Vector3().fromBufferAttribute(p, 5 * 3 + 1);
    widest = Math.max(widest, a.distanceTo(b));
  }
  set.dispose();
  return widest;
}

describe('lightning arcs', () => {
  it('are drawn in full when nobody is near', () => {
    expect(strike(null, [0, 0])).toBeGreaterThan(0.05);
    expect(strike(new THREE.Vector3(50, 0, 0), [1, 4])).toBeGreaterThan(0.05);
  });

  it('vanish when right at the camera, and thin out on the way', () => {
    const full = strike(new THREE.Vector3(50, 0, 0), [1, 4]);
    expect(strike(new THREE.Vector3(0.5, 0, 0), [1, 4])).toBeCloseTo(0, 6); // closer than the near edge
    const between = strike(new THREE.Vector3(3.5, 0, 0), [1, 4]);
    expect(between).toBeGreaterThan(0);
    expect(between).toBeLessThan(full);
  });

  it('can be drawn thinner for the rider', () => {
    const full = strike(null, [0, 0], 1);
    expect(strike(null, [0, 0], 0.5)).toBeCloseTo(full * 0.5, 5);
  });
});
