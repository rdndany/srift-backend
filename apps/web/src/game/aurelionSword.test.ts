import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BOSS_ANIM, MOBS } from '@solrift/shared';
import { CreatureMotion, archetypeOf, type MotionInput } from './creatureMotion';
import { bladeSwing, classifyRig, poseRig, type RigPart } from './creatureRig';
import { RIGS } from './mobRenderer';
import type { Part } from './mobPaint';

/**
 * King Aurelion holds his sword like a warrior: by the handle, in his fist, with the blade coming out of the front of the fist, down and forward
 * (not along his arm), and it stays in the hand through everything the arm does. The rig is built here as three.js builds it (mobRenderer.ts `buildView`).
 */
const parts: Part[] = RIGS.aurelion;
const K = 3.3 / 6.2; // the model's scale (mobAurelion.ts)
const U = 0.1 * K; // one cube of the sculpture
const rig = classifyRig(parts, archetypeOf('aurelion')!, MOBS.aurelion.height);
const arm = parts.findIndex((p) => p.armed);
const fore = parts.findIndex((p) => p.elbow);
const sword = parts.findIndex((p) => p.grip);

function build(): { root: THREE.Group; meshes: THREE.Object3D[]; rigParts: RigPart[] } {
  const root = new THREE.Group();
  const meshes: THREE.Object3D[] = [];
  parts.forEach((d) => {
    const m = new THREE.Object3D();
    m.position.set(...d.at);
    if (d.order) m.rotation.order = d.order;
    m.rotation.set(d.rotX ?? 0, d.rotY ?? 0, d.rotZ ?? 0);
    (d.of !== undefined ? meshes[d.of]! : root).add(m);
    meshes.push(m);
  });
  root.updateMatrixWorld(true);
  return { root, meshes, rigParts: parts.map((def, i) => ({ def, mesh: meshes[i]! })) };
}

const idle = (): Parameters<typeof poseRig>[2] => new CreatureMotion('aurelion', 7, rig.body, 'biped').pose;

/** The bricks of a part as boxes in its own frame: [min x, min y, min z, max x, max y, max z]. */
const boxes = (p: Part): number[][] => (p.bricks ?? []).map((b) => [b[0] - b[3] / 2, b[1] - b[4] / 2, b[2] - b[5] / 2, b[0] + b[3] / 2, b[1] + b[4] / 2, b[2] + b[5] / 2]);
const swordBricks = (p: Part): number[][] => boxes(p);

/** The sword in the world: the point at the middle of the handle, the way the blade points (unit), the tip, and the points along the blade past the guard. */
function swordWorld(meshes: THREE.Object3D[]): { grip: THREE.Vector3; dir: THREE.Vector3; tip: THREE.Vector3; blade: THREE.Vector3[] } {
  const m = meshes[sword]!.matrixWorld;
  const grip = new THREE.Vector3(0, -1 * U, 0).applyMatrix4(m);
  const tip = new THREE.Vector3(0, -34 * U, 0).applyMatrix4(m);
  const blade: THREE.Vector3[] = [];
  for (const b of swordBricks(parts[sword]!)) if (b[4] < -9.5 * U) blade.push(new THREE.Vector3((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2).applyMatrix4(m));
  return { grip, dir: tip.clone().sub(grip).normalize(), tip, blade };
}
const elevation = (d: THREE.Vector3): number => (Math.asin(d.y) * 180) / Math.PI;

/** Does any of the points lie in a brick of a part that is not the arm's (the body, the legs, the head, the other arm)? */
function intersects(meshes: THREE.Object3D[], points: THREE.Vector3[]): string | null {
  const own = new Set([arm, fore, sword]);
  for (let i = 0; i < parts.length; i++) {
    if (own.has(i) || !parts[i]!.bricks || parts[i]!.glow) continue;
    const inv = new THREE.Matrix4().copy(meshes[i]!.matrixWorld).invert();
    const bx = boxes(parts[i]!);
    for (const p of points) {
      const q = p.clone().applyMatrix4(inv);
      if (bx.some((b) => q.x > b[0] && q.x < b[3] && q.y > b[1] && q.y < b[4] && q.z > b[2] && q.z < b[5])) return `part ${i}`;
    }
  }
  return null;
}

describe('the grip', () => {
  it('is an armed arm, a forearm that bends and a weapon that turns at the wrist', () => {
    expect(arm).toBeGreaterThanOrEqual(0);
    expect(rig.roles[arm]!.role).toBe('arm');
    expect(rig.roles[fore]!.role).toBe('elbow');
    expect(rig.roles[fore]!.parent).toBe(arm);
    expect(rig.roles[sword]!.role).toBe('weapon');
    expect(rig.roles[sword]!.parent).toBe(fore);
    expect(parts[sword]!.of).toBe(fore);
  });

  it('holds the sword by the middle of its handle, in the middle of the fist', () => {
    const { meshes } = build();
    const w = swordWorld(meshes);
    // The fist's own box (in the forearm's frame): the bricks that are the fist (below the gauntlet, 11..18 up from the elbow in the sculpture's cubes).
    const fist = new THREE.Vector3(0, -10.5 * U, 0).applyMatrix4(meshes[fore]!.matrixWorld);
    expect(w.grip.distanceTo(fist)).toBeLessThan(0.01);
    const inFore = w.grip.clone().applyMatrix4(new THREE.Matrix4().copy(meshes[fore]!.matrixWorld).invert());
    expect(Math.abs(inFore.x)).toBeLessThan(4 * U);
    expect(inFore.y).toBeGreaterThan(-14 * U);
    expect(inFore.y).toBeLessThan(-7 * U);
    expect(Math.abs(inFore.z)).toBeLessThan(5 * U);
  });

  it('has the blade come out of the fist: the blade is clear of the fist, the handle is in it', () => {
    const { meshes } = build();
    const inv = new THREE.Matrix4().copy(meshes[fore]!.matrixWorld).invert();
    const inFist = (p: THREE.Vector3): boolean => {
      const q = p.clone().applyMatrix4(inv);
      return Math.abs(q.x) < 4 * U && q.y > -14 * U && q.y < -7 * U && Math.abs(q.z) < 5 * U;
    };
    const m = meshes[sword]!.matrixWorld;
    // (The handle: SW y from -6 to 4 cubes; the middle of it is in the fist, and so are points a little to each side.)
    for (const y of [-3, -1, 1]) expect(inFist(new THREE.Vector3(0, y * U, 0).applyMatrix4(m))).toBe(true);
    // The blade, from where its edges start, is out of the hand.
    for (const y of [-12, -16, -20, -26, -32]) expect(inFist(new THREE.Vector3(0, y * U, 0).applyMatrix4(m))).toBe(false);
  });
});

describe('the sword at rest', () => {
  it('points down and forward, and not along the forearm', () => {
    const { meshes } = build();
    const w = swordWorld(meshes);
    const e = elevation(w.dir);
    expect(e).toBeLessThan(-20);
    expect(e).toBeGreaterThan(-45);
    // Forward is -z; the sword hand is on the +x side, and the blade goes a little out, not across the body.
    expect(w.dir.z).toBeLessThan(-0.6);
    expect(w.dir.x).toBeGreaterThan(0);
    expect(w.dir.x).toBeLessThan(0.35);
    const forearm = new THREE.Vector3(0, -1, 0).applyQuaternion(meshes[fore]!.getWorldQuaternion(new THREE.Quaternion()));
    const apart = (Math.acos(forearm.dot(w.dir)) * 180) / Math.PI;
    expect(apart).toBeGreaterThan(35);
    expect(apart).toBeLessThan(75);
    // The arm hangs: the forearm is nearly down, bent a little forward at the elbow.
    expect(forearm.y).toBeLessThan(-0.85);
    expect(forearm.z).toBeLessThan(0);
  });

  it('is above the ground and clear of the body and the legs', () => {
    const { meshes } = build();
    const w = swordWorld(meshes);
    expect(w.tip.y).toBeGreaterThan(0.1);
    for (const p of w.blade) expect(p.y).toBeGreaterThan(0.02);
    expect(intersects(meshes, w.blade)).toBeNull();
    // The crossguard is sideways across the blade: its long side is the model's x, not along or against the blade's way.
    const m = meshes[sword]!.matrixWorld;
    const guardAxis = new THREE.Vector3(0, 0, 1).transformDirection(m);
    expect(Math.abs(guardAxis.x)).toBeGreaterThan(0.8);
    // The broad edges are up and down.
    const width = new THREE.Vector3(1, 0, 0).transformDirection(m);
    expect(Math.abs(width.y)).toBeGreaterThan(0.6);
  });

  it('is the same sword turned with the boss when he turns', () => {
    const a = build();
    const b = build();
    b.root.rotation.y = 1.1;
    b.root.updateMatrixWorld(true);
    const wa = swordWorld(a.meshes);
    const wb = swordWorld(b.meshes);
    const turned = wa.tip.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 1.1);
    expect(wb.tip.distanceTo(turned)).toBeLessThan(1e-5);
    expect(wb.dir.y).toBeCloseTo(wa.dir.y, 6);
  });
});

describe('the sword in the swing', () => {
  const inputBase = (o: Partial<MotionInput>): MotionInput => ({
    x: 0, y: 0, z: 0, yaw: 0, dt: 1 / 60, time: 0, dead: false, deathTime: 0, hurtTime: 99, attackTime: 99, casting: 0, focus: null,
    height: MOBS.aurelion.height, width: MOBS.aurelion.width, scale: 1, ...o,
  });

  /** The sword's place when the boss is `k` through the swing (0..1), with the real poses. */
  function at(k: number, castK = 0): ReturnType<typeof swordWorld> & { fist: THREE.Vector3; meshes: THREE.Object3D[] } {
    const { root, meshes, rigParts } = build();
    const m = new CreatureMotion('aurelion', 7, rig.body, 'biped');
    for (let n = 0; n < 30; n++) m.update(inputBase({ time: n / 60 }));
    m.update(inputBase({ time: 0.6, attackTime: k * BOSS_ANIM }));
    poseRig(rig, rigParts, m.pose, m.profile, 0, castK, 0, 7);
    root.updateMatrixWorld(true);
    const fist = new THREE.Vector3(0, -10.5 * U, 0).applyMatrix4(meshes[fore]!.matrixWorld);
    return { ...swordWorld(meshes), fist, meshes };
  }

  it('is raised overhead in the wind-up, with the blade up', () => {
    const top = at(0.5);
    expect(elevation(top.dir)).toBeGreaterThan(60);
    // (And above his head: the tip is higher than the top of the helmet.)
    expect(top.tip.y).toBeGreaterThan(MOBS.aurelion.height * 0.9);
    expect(at(0.25).tip.y).toBeGreaterThan(at(0.05).tip.y);
  });

  it('comes down in front of him as the blow lands: the point down and forward, in the ground and not through it', () => {
    const hit = at(0.62);
    expect(elevation(hit.dir)).toBeLessThan(-25);
    expect(hit.dir.z).toBeLessThan(-0.3);
    expect(hit.tip.z).toBeLessThan(-0.5);
    expect(hit.tip.y).toBeGreaterThan(-0.2);
    for (let k = 0.55; k <= 1; k += 0.01) expect(at(k).tip.y).toBeGreaterThan(-0.25);
  });

  it('stays in the fist through the whole swing, a spell, and every point of it', () => {
    const rest = at(0);
    const restX = rest.dir.clone().transformDirection(new THREE.Matrix4().copy(rest.meshes[fore]!.matrixWorld).invert()).x;
    for (const castK of [0, 1]) {
      for (let k = 0; k <= 1.0001; k += 0.025) {
        const s = at(Math.min(k, 0.999), castK);
        expect(s.grip.distanceTo(s.fist)).toBeLessThan(0.01);
        // (The handle's own axis does not shift in the hand: the blade's direction is the same in the forearm's frame but for the wrist's one turn.)
        const d = s.dir.clone().transformDirection(new THREE.Matrix4().copy(s.meshes[fore]!.matrixWorld).invert());
        expect(d.x).toBeCloseTo(restX, 5);
      }
    }
  });

  it('is brought back to rest, and the wrist snaps after the shoulder', () => {
    const end = bladeSwing(0.999);
    expect(Math.abs(end.sh) + Math.abs(end.el) + Math.abs(end.wr)).toBeLessThan(0.01);
    expect(bladeSwing(0)).toEqual({ sh: 0, el: 0, wr: 0 });
    // The wrist is still cocked when the shoulder has come most of the way, then goes the other way.
    const mid = bladeSwing(0.58);
    expect(mid.wr).toBeGreaterThan(-0.2);
    expect(bladeSwing(0.63).wr).toBeLessThan(-0.4);
    expect(bladeSwing(0.5).el).toBeGreaterThan(0.3);
    expect(bladeSwing(0.7).el).toBeLessThan(0);
  });

  it('is clear of the ground and the body when he walks, and when he runs', () => {
    for (const speed of [MOBS.aurelion.speed, MOBS.aurelion.runSpeed]) {
      const { root, meshes, rigParts } = build();
      const m = new CreatureMotion('aurelion', 7, rig.body, 'biped');
      let z = 0;
      let low = 9;
      let hit: string | null = null;
      for (let n = 0; n < 60 * 5; n++) {
        z -= speed / 60;
        m.update(inputBase({ z, time: n / 60 }));
        poseRig(rig, rigParts, m.pose, m.profile, 0, 0, n / 60, 7);
        if (n < 150) continue;
        root.rotation.set(m.pose.pitch, 0, m.pose.roll);
        root.position.y = m.pose.lift;
        root.updateMatrixWorld(true);
        const w = swordWorld(meshes);
        low = Math.min(low, w.tip.y);
        if (n % 5 === 0) hit ??= intersects(meshes, w.blade);
      }
      expect(low).toBeGreaterThan(0);
      expect(hit).toBeNull();
    }
  });
});
