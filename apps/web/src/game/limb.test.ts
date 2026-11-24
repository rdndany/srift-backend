import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { JOINT_Y, Limb, addToLimb, splitAtJoint } from './limb';

const boxAt = (y: number, h = 0.1): THREE.BufferGeometry => {
  const g = new THREE.BoxGeometry(0.3, h, 0.3);
  g.translate(0, y, 0);
  return g;
};
const world = (o: THREE.Object3D, v: THREE.Vector3): THREE.Vector3 => {
  o.updateWorldMatrix(true, false);
  return v.applyMatrix4(o.matrixWorld);
};

describe('a limb that bends', () => {
  it('takes what is put on it above the joint as it is, and what is below it into the lower part, in the same place', () => {
    const leg = new Limb(-0.125);
    const thigh = new THREE.Mesh(boxAt(0, 0.1));
    thigh.position.set(0, -0.2, 0);
    const boot = new THREE.Mesh(boxAt(0, 0.1));
    boot.position.set(0.01, -0.62, -0.03);
    leg.add(thigh, boot);
    expect(thigh.parent).toBe(leg);
    expect(boot.parent).toBe(leg.shin);
    // (Straight, the boot is where it was put.)
    const at = world(boot, new THREE.Vector3());
    expect(at.x).toBeCloseTo(0.01, 6);
    expect(at.y).toBeCloseTo(-0.62, 6);
    expect(at.z).toBeCloseTo(-0.03, 6);
  });

  it('takes things off again from either part', () => {
    const arm = new Limb(0.125);
    const a = new THREE.Mesh(boxAt(0));
    a.position.y = -0.1;
    const b = new THREE.Mesh(boxAt(0));
    b.position.y = -0.6;
    arm.add(a, b);
    arm.remove(a, b);
    expect(a.parent).toBeNull();
    expect(b.parent).toBeNull();
  });

  it('bends a knee back and an elbow forward, the foot and the hand moving as they should', () => {
    const leg = new Limb(-0.125);
    const arm = new Limb(0.125);
    const foot = new THREE.Object3D();
    foot.position.set(0, -0.75, 0);
    const hand = new THREE.Object3D();
    hand.position.set(0, -0.75, 0);
    leg.add(foot);
    arm.add(hand);
    leg.bend(1);
    arm.bend(1);
    // The figure faces -z: a shin folds back (+z) and the foot comes up; a forearm comes forward (-z) and the hand comes up.
    const f = world(foot, new THREE.Vector3());
    const h = world(hand, new THREE.Vector3());
    expect(f.z).toBeGreaterThan(0.2);
    expect(f.y).toBeGreaterThan(-0.75);
    expect(h.z).toBeLessThan(-0.2);
    expect(h.y).toBeGreaterThan(-0.75);
    // A bend of nothing is the straight limb.
    leg.bend(0);
    expect(world(foot, new THREE.Vector3()).y).toBeCloseTo(-0.75, 6);
  });

  it('keeps the front of the knee and the back of the elbow shut as it bends', () => {
    // The corner of the lower part at the hinge stays where it was.
    const leg = new Limb(-0.125);
    const corner = new THREE.Object3D();
    corner.position.set(0.1, JOINT_Y, -0.125);
    leg.add(corner); // (on the joint: the upper part)
    const lower = new THREE.Object3D();
    lower.position.set(0.1, JOINT_Y - 0.05, -0.125);
    leg.add(lower);
    const before = world(lower, new THREE.Vector3());
    leg.bend(0.9);
    const after = world(lower, new THREE.Vector3());
    // (Straight below the hinge edge, a point of that edge only slides along it: it is on the axis in x and z.)
    expect(after.z).toBeGreaterThan(before.z - 1e-6);
    expect(after.x).toBeCloseTo(before.x, 6);
  });
});

describe('cutting a shape of blocks at the joint', () => {
  const leg = (): Limb => new Limb(-0.125);

  it('gives every block to the side its middle is on, and keeps every vertex', () => {
    const blocks = [boxAt(-0.1), boxAt(-0.2), boxAt(-0.55), boxAt(-0.65)];
    const merged = mergeGeometries(blocks, false)!;
    const total = merged.getAttribute('position').count;
    const { upper, lower } = splitAtJoint(leg(), merged);
    expect(upper!.getAttribute('position').count).toBe(48);
    expect(lower!.getAttribute('position').count).toBe(48);
    expect(upper!.getAttribute('position').count + lower!.getAttribute('position').count).toBe(total);
    // The upper keeps its place; the lower is in the space of the joint, so its middle is about -0.075 to -0.275 below it.
    upper!.computeBoundingBox();
    lower!.computeBoundingBox();
    expect(upper!.boundingBox!.max.y).toBeCloseTo(-0.05, 6);
    expect(lower!.boundingBox!.min.y).toBeCloseTo(-0.7 - JOINT_Y, 6);
    expect(lower!.boundingBox!.max.z).toBeCloseTo(0.15 + 0.125, 6);
    // The shapes keep every attribute and are indexed to match.
    expect(lower!.getAttribute('uv').count).toBe(48);
    expect(lower!.getAttribute('normal').count).toBe(48);
    expect(lower!.index!.count).toBe(72);
  });

  it('leaves a shape that is all on one side whole', () => {
    const geo = mergeGeometries([boxAt(-0.1), boxAt(-0.3)], false)!;
    const { upper, lower } = splitAtJoint(leg(), geo);
    expect(upper).toBe(geo);
    expect(lower).toBeNull();
  });

  it('puts a piece on a limb as two meshes, the lower the twin of the upper, and as one anywhere else', () => {
    const made: THREE.Mesh[] = [];
    const geos: THREE.BufferGeometry[] = [];
    const rec = (m: THREE.Mesh, g: THREE.BufferGeometry): void => {
      made.push(m);
      geos.push(g);
    };
    const mat = new THREE.MeshBasicMaterial();
    const l = leg();
    const upper = addToLimb(l, mergeGeometries([boxAt(-0.1), boxAt(-0.6)], false)!, mat, rec);
    expect(made).toHaveLength(2);
    expect(upper.parent).toBe(l);
    const twin = upper.userData.twin as THREE.Mesh;
    expect(twin.parent).toBe(l.shin);
    const torso = new THREE.Group();
    const whole = addToLimb(torso, mergeGeometries([boxAt(-0.1), boxAt(-0.6)], false)!, mat, rec);
    expect(made).toHaveLength(3);
    expect(whole.parent).toBe(torso);
    expect(whole.userData.twin).toBeUndefined();
  });
});
