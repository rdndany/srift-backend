import { BOSS_ANIM, BOSS_WINDUP } from '@solrift/shared';
import type { Part } from './mobPaint';
import { legPose, legWave, type Archetype, type BodyInfo, type LegOut, type Pose, type Profile } from './creatureMotion';

/**
 * What each part of a creature's model is for, found from the model itself (so every model, and every model that is added, is moved with no list
 * of parts to keep), and what a `Pose` does to each of them. The meshes are only written to, through the small `MeshLike`, so that this can be tested
 * on plain objects (see `creatureRig.test.ts`).
 *
 * How a part is told what it is: a head is `isHead`; a wing has a `flap`; a spider's leg turns about y (`swingY`); a knee or an elbow hangs from a limb
 * (`of`) and has a `bend`; an arm is a limb that swings and strikes (`strike`, `raise`) or hangs above the ground; a leg is one that swings and reaches the
 * ground, or has a knee. A squid's arms are tentacles, a fish's last part is its tail, a turtle's flat flippers are flippers.
 */

export type Role = 'none' | 'head' | 'leg' | 'knee' | 'arm' | 'elbow' | 'weapon' | 'wing' | 'tentacle' | 'tail' | 'spider' | 'flipper';

export interface PartRole {
  role: Role;
  /** -1 on the left (x below 0 in the model), +1 on the right, 0 in the middle. */
  side: number;
  /** For a leg: -1 for the front pair, +1 for the rear, 0 for a pair that stands alone. */
  row: number;
  /** The phase (cycles) a leg or an arm is at, and the move it makes into a trot. */
  walk: number;
  trot: number;
  /** For a leg: its length (blocks), the knee included. */
  len: number;
  /** For a knee: the part it hangs from. For a tentacle or a spider's leg: its number. */
  parent: number;
  index: number;
  /** A leg that has a knee (so it is not made shorter), an arm that has an elbow. */
  kneed: boolean;
}

export interface RigInfo {
  roles: PartRole[];
  body: BodyInfo;
  /** The head's biggest side (blocks): what a thrust or a drop of the head is measured in. */
  headSize: number;
  counts: { legs: number; arms: number; wings: number; spiders: number; tentacles: number; heads: number };
}

const none = (): PartRole => ({ role: 'none', side: 0, row: 0, walk: 0, trot: 0, len: 0, parent: -1, index: 0, kneed: false });
const sign = (v: number): number => (v < 0 ? -1 : v > 0 ? 1 : 0);

/** A part's size in its own frame: [width, height, depth, how far it reaches below its joint]. Parts made of bricks (the bosses') have a placeholder `size`. */
function extent(p: Part): [number, number, number, number] {
  if (p.bricks && p.bricks.length > 0) {
    let lo = [Infinity, Infinity, Infinity];
    let hi = [-Infinity, -Infinity, -Infinity];
    for (const [x, y, z, w, h, d] of p.bricks) {
      lo = [Math.min(lo[0]!, x - w / 2), Math.min(lo[1]!, y - h / 2), Math.min(lo[2]!, z - d / 2)];
      hi = [Math.max(hi[0]!, x + w / 2), Math.max(hi[1]!, y + h / 2), Math.max(hi[2]!, z + d / 2)];
    }
    return [hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!, Math.max(0, -lo[1]!)];
  }
  const [w, h, d] = p.size;
  return [w, h, d, p.hang ? h : h / 2];
}

/** How far a limb reaches below its joint, with whatever hangs from it (a shin, a foot). */
function reach(parts: readonly Part[], i: number, depth = 0): number {
  let r = extent(parts[i]!)[3];
  if (depth > 6) return r;
  parts.forEach((c, j) => {
    if (c.of === i && j !== i) r = Math.max(r, -c.at[1] + reach(parts, j, depth + 1));
  });
  return r;
}

/**
 * Sort a model's parts into what they do. `arch` is the shape of the body (it decides what a limb is: a squid has tentacles, not legs), `height` how
 * tall the creature is (what is "on the ground" is relative to it).
 */
export function classifyRig(parts: readonly Part[], arch: Archetype, height: number): RigInfo {
  const roles = parts.map(none);
  const knee: boolean[] = parts.map(() => false);
  parts.forEach((p) => {
    if (p.of !== undefined && p.bend !== undefined) knee[p.of] = true;
  });
  const tol = 0.15 + 0.06 * height;
  const counts = { legs: 0, arms: 0, wings: 0, spiders: 0, tentacles: 0, heads: 0 };
  let head = -1;
  parts.forEach((p, i) => {
    const r = roles[i]!;
    if (p.flame !== undefined) return;
    if (p.isHead) {
      r.role = 'head';
      counts.heads++;
      if (head < 0) head = i;
    } else if (p.flap !== undefined) {
      r.role = 'wing';
      r.side = sign(p.flap) || sign(p.at[0]);
      counts.wings++;
    } else if (p.swingY !== undefined) {
      r.role = 'spider';
      r.side = sign(p.at[0]);
      r.index = counts.spiders++;
      r.walk = sign(p.swingY) * r.side < 0 ? 0.5 : 0;
    } else if (p.of !== undefined && p.elbow) {
      // The forearm of an arm that carries a weapon.
      r.role = 'elbow';
      r.parent = p.of;
    } else if (p.of !== undefined && p.grip) {
      // What the arm holds: it turns at the wrist, which is its parent's end.
      r.role = 'weapon';
      r.parent = p.of;
    } else if (p.of !== undefined && p.bend !== undefined) {
      r.role = 'knee';
      r.parent = p.of;
    } else if (p.strike !== undefined || p.raise !== undefined) {
      // A limb that strikes or is raised (a boss's arm, a priest's staff arm, wherever it hangs from).
      r.role = 'arm';
      r.side = sign(p.at[0]) || sign(p.swing ?? 0);
      r.kneed = knee[i]!;
      counts.arms++;
    } else if (p.hang && p.swing) {
      r.side = sign(p.at[0]) || sign(p.swing);
      if (arch === 'cephalopod') {
        r.role = 'tentacle';
        r.index = counts.tentacles++;
      } else if (knee[i] || (p.of === undefined && p.at[1] - reach(parts, i) <= tol)) {
        r.role = 'leg';
        r.kneed = knee[i]!;
        counts.legs++;
      } else {
        r.role = 'arm';
        r.kneed = knee[i]!;
        counts.arms++;
      }
    } else if (!p.hang && p.swing) {
      r.role = 'flipper';
      r.side = sign(p.at[0]) || sign(p.swing);
      r.index = counts.legs++;
    }
  });

  // Legs: their lengths (the knee's shin counts), then their places in the gait.
  const legIdx: number[] = [];
  roles.forEach((r, i) => {
    if (r.role === 'leg' || r.role === 'flipper') legIdx.push(i);
  });
  roles.forEach((r, i) => {
    if (r.role === 'leg') r.len = reach(parts, i);
  });
  const zs = legIdx.map((i) => parts[i]!.at[2]).sort((a, b) => a - b);
  const zMid = zs.length ? (zs[0]! + zs[zs.length - 1]!) / 2 : 0;
  const quad = legIdx.length === 4;
  let side0 = 1;
  let first = true;
  legIdx.forEach((i, n) => {
    const r = roles[i]!;
    const p = parts[i]!;
    r.side = sign(p.at[0]) || r.side;
    if (quad) {
      // The walk of four feet in turn: hind and fore on a side, then the other side; and, as it quickens, the diagonal pairs come together (a trot).
      r.row = p.at[2] < zMid ? -1 : 1;
      const left = r.side < 0;
      r.walk = r.row > 0 ? (left ? 0 : 0.5) : left ? 0.25 : 0.75;
      r.trot = r.row < 0 ? 0.125 : -0.125;
    } else {
      // Two feet (or any other number), the sign the model gave the leg says which is first.
      r.walk = (p.swing ?? 0) < 0 ? 0.5 : legIdx.length === 2 ? 0 : n % 2 === 0 ? 0 : 0.5;
    }
    if (first && r.walk === 0) {
      side0 = r.side || 1;
      first = false;
    }
  });
  // Arms swing against the leg on their side.
  for (const r of roles) {
    if (r.role !== 'arm') continue;
    const mate = legIdx.find((j) => roles[j]!.side === r.side && roles[j]!.role === 'leg');
    r.walk = (mate !== undefined ? roles[mate]!.walk : r.side > 0 ? 0 : 0.5) + 0.5;
  }

  let legLen = 0;
  const lens = legIdx.map((i) => roles[i]!.len || extent(parts[i]!)[1]).sort((a, b) => a - b);
  if (lens.length) legLen = lens[Math.floor(lens.length / 2)]!;
  if (counts.spiders) legLen = Math.max(...parts.filter((p) => p.swingY !== undefined).map((p) => extent(p)[1])) * 0.6;
  if (legLen <= 0) legLen = Math.max(0.2, height * 0.4);

  // A fish's tail: what is behind its head.
  if (arch === 'swimmer' && head >= 0) {
    const hz = parts[head]!.at[2];
    const hs = extent(parts[head]!)[2];
    parts.forEach((p, i) => {
      if (roles[i]!.role === 'none' && i !== head && p.of === undefined && p.at[2] > hz + hs * 0.5) roles[i]!.role = 'tail';
    });
  }
  const h = head >= 0 ? parts[head]! : null;
  const headY = h ? Math.min(height, h.at[1] + (h.of !== undefined ? parts[h.of]!.at[1] : 0)) : height * 0.8;
  const headSize = h ? Math.min(3, Math.max(0.15, Math.max(...extent(h).slice(0, 3)))) : 0.4;
  return { roles, body: { legLen, side0, headY }, headSize, counts };
}

/** The shape of a body that nothing has said anything of: four legs are a quadruped, eight a spider, wings and no legs a flier, the rest walk upright. */
export function guessArchetype(parts: readonly Part[], height: number): Archetype {
  const c = classifyRig(parts, 'biped', height).counts;
  if (c.spiders >= 6) return 'arachnid';
  if (c.legs === 4) return 'quad';
  if (c.legs === 0 && c.wings >= 2) return 'flyer';
  if (c.legs === 0 && c.arms === 0 && c.tentacles === 0) return 'hover';
  return 'biped';
}

// ---- what a pose does to the parts ---------------------------------------------------------------------------------------------------------

interface V3 {
  x: number;
  y: number;
  z: number;
}
/** The little of a three.js mesh that is written to. */
export interface MeshLike {
  rotation: V3;
  position: V3;
  scale: V3;
}

export interface RigPart {
  mesh: MeshLike;
  def: Part;
}

/** How far a limb goes out in a strike (0..1) at a point in the swing: the same shape as the lunge. */
export function strikeCurve(k: number): number {
  if (k < 0) return 0;
  if (k < 0.3) return 1 - (1 - k / 0.3) ** 2;
  const t = Math.min(1, (k - 0.3) / 0.7);
  return 1 - t * t * (3 - 2 * t);
}

/** What a wing does in one beat: the downstroke is quicker than the upstroke. */
export const wingBeat = (phase: number): number => Math.sin(2 * Math.PI * phase) + 0.28 * Math.sin(4 * Math.PI * phase);

/**
 * The blow of an armed boss: what the shoulder, the elbow and the wrist each turn (radians, from how they stand at rest; + raises the blade, - brings
 * it down) at a point `k` (0..1) through the swing. The sword is raised slowly overhead, so that a player sees it coming (the elbow folds and the wrist
 * cocks it back), then is brought down in front as the blow lands (the arm drives forward, the elbow straightens and the wrist snaps last, so that
 * the point leads), held in the ground a moment and lifted back to rest.
 */
export function bladeSwing(k: number): { sh: number; el: number; wr: number } {
  const out = { sh: 0, el: 0, wr: 0 };
  if (k <= 0 || k >= 1) return out;
  const hit = BOSS_WINDUP / BOSS_ANIM;
  const a1 = hit - 0.07;
  const a2 = hit + 0.03;
  const ease = (t: number): number => t * t * (3 - 2 * t);
  if (k < a1) {
    const t = k / a1;
    const up = 1 - (1 - t) ** 2;
    out.sh = SWORD_UP * up;
    out.el = SWORD_ELBOW * up;
    out.wr = SWORD_COCK * ease(t);
  } else if (k < a2) {
    const t = (k - a1) / (a2 - a1);
    const e = ease(t);
    out.sh = SWORD_UP + (SWORD_HIT - SWORD_UP) * e;
    out.el = SWORD_ELBOW + (SWORD_EXTEND - SWORD_ELBOW) * e;
    out.wr = SWORD_COCK + (SWORD_SNAP - SWORD_COCK) * t * t;
  } else {
    const u = Math.min(1, Math.max(0, ((k - a2) / (1 - a2) - 0.25) / 0.75));
    const back = 1 - ease(u);
    out.sh = SWORD_HIT * back;
    out.el = SWORD_EXTEND * back;
    out.wr = SWORD_SNAP * back;
  }
  return out;
}
const SWORD_UP = 1.8;
const SWORD_ELBOW = 0.5;
const SWORD_COCK = 0.25;
const SWORD_HIT = 0.45;
const SWORD_EXTEND = -0.1;
const SWORD_SNAP = -0.6;
const armElbow: number[] = [];
const armWrist: number[] = [];

const leg: LegOut = { angle: 0, scale: 1, knee: 0, lift: 0, air: false, foot: 0 };
const legOuts: LegOut[] = [];

/**
 * Pose the parts of a creature (a model classified by `classifyRig`). `armTurn` is how far the arms that strike come down (radians, from the swing),
 * `castK` how far a boss's arms are raised by a spell, `time` and `id` give the small breathing of an arm. Parts that nothing here moves are put back
 * where the model has them (so that a pose that was set by something else last frame does not stay).
 */
export function poseRig(rig: RigInfo, parts: readonly RigPart[], pose: Pose, prof: Profile, armTurn: number, castK: number, time: number, id: number): void {
  const g = pose.gait;
  const theta = Math.asin(Math.min(0.999, Math.max(0, g.sinTheta)));
  const roles = rig.roles;
  const hop = prof.archetype === 'hopper';
  const trot = pose.trot;
  const head = pose.head;
  const k = pose.strike;
  const out = strikeCurve(k);
  const limp = pose.limp;
  const still = 1 - g.mov;
  while (legOuts.length < parts.length) legOuts.push({ angle: 0, scale: 1, knee: 0, lift: 0, air: false, foot: 0 });
  for (let n = 0; n < parts.length; n++) {
    const { mesh, def } = parts[n]!;
    if (def.flame !== undefined) continue;
    const r = roles[n]!;
    mesh.position.y = def.at[1];
    switch (r.role) {
      case 'head': {
        mesh.position.z = def.at[2] - head.thrust * rig.headSize * 2.2;
        mesh.position.y = def.at[1] - head.drop * rig.headSize;
        mesh.rotation.x = (def.rotX ?? 0) + head.pitch;
        mesh.rotation.y = (def.rotY ?? 0) + head.yaw;
        mesh.rotation.z = (def.rotZ ?? 0) + head.roll;
        break;
      }
      case 'leg': {
        const o = legOuts[n]!;
        let angle: number;
        let scale = 1;
        if (hop) {
          // A hop has no stride: the hind legs push off and trail, the fore tuck, and all of them reach for the ground on the way down.
          const up = Math.max(0, pose.air);
          const down = Math.max(0, -pose.air);
          angle = r.row > 0 ? -0.9 * up + 0.55 * down : 0.5 * up + 0.6 * down;
          scale = 1 - 0.22 * (up + down) * 0.6;
          o.angle = angle;
          o.scale = scale;
          o.knee = Math.max(up, down);
        } else {
          legPose(g, r.walk + r.trot * trot, r.kneed, leg);
          angle = leg.angle;
          scale = leg.scale;
          o.angle = angle;
          o.scale = scale;
          o.knee = leg.knee;
          // Quadrupeds that fight with their forepaws.
          if (prof.paw && r.row < 0 && k >= 0) angle += prof.paw * out * 1.1;
        }
        mesh.rotation.x = (def.rotX ?? 0) + angle * (1 - limp * 0.7) + limp * -0.1 * r.row;
        mesh.rotation.z = (def.rotZ ?? 0) + r.side * limp * 0.25;
        mesh.scale.y = r.kneed ? 1 : scale;
        break;
      }
      case 'knee': {
        const parent = legOuts[r.parent]!;
        const pr = roles[r.parent]!;
        const bend = (def.bend ?? 0.9) / 0.9;
        if (pr.role === 'leg') mesh.rotation.x = (def.rotX ?? 0) - bend * parent.knee * (0.5 + 0.55 * g.run) * (1 - limp * 0.5) - limp * 0.15;
        else {
          // An elbow folds as the arm comes forward.
          const arm = parts[r.parent]!.mesh.rotation.x - (parts[r.parent]!.def.rotX ?? 0);
          mesh.rotation.x = (def.rotX ?? 0) - bend * Math.max(0, arm) * 0.8;
        }
        break;
      }
      case 'arm': {
        const swing = def.swing ? Math.cos(2 * Math.PI * (g.phase + r.walk)) * theta * Math.min(1, Math.max(0.35, Math.abs(def.swing))) * 0.9 : 0;
        const breath = Math.sin(time * 1.4 + id) * 0.035 * still;
        if (def.armed) {
          // An arm that carries a weapon: the shoulder, the elbow and the wrist each do their share. The weight on the end swings the arm less when
          // walking, and the wrist takes up most of what the arm does, so that the blade does not whip about.
          const b = bladeSwing(k);
          const sw = swing * 0.7;
          mesh.rotation.x = ((def.rotX ?? 0) + sw + breath + b.sh + castK * (def.raise ?? 0)) * (1 - limp * 0.4);
          // (Running, the elbow folds and the sword is carried up and back, as a runner carries one, and the point does not dig in at each footfall.)
          const run = g.run * g.mov;
          armElbow[n] = b.el + 0.5 * Math.max(0, sw) + 0.3 * castK + 0.5 * run;
          armWrist[n] = b.wr - 0.8 * sw - 0.5 * breath + 0.15 * castK + 0.15 * run;
          break;
        }
        let x = (def.rotX ?? 0) + swing + breath;
        if (def.strike) x += armTurn * def.strike;
        if (def.raise) x += castK * def.raise;
        mesh.rotation.x = x * (1 - limp * 0.4);
        break;
      }
      case 'elbow': {
        // The forearm bends at the elbow about the same axis as the shoulder turns.
        mesh.rotation.x = (def.rotX ?? 0) + (armElbow[r.parent] ?? 0);
        break;
      }
      case 'weapon': {
        // The wrist turns the weapon about the forearm's own x axis (the last turn of its Euler, so it is added to rotation.x); the grip does not move.
        const arm = roles[r.parent]!.parent;
        const turn = armWrist[arm] ?? 0;
        mesh.rotation.x = (def.rotX ?? 0) + turn;
        if (def.wrist) {
          // ... about the wrist (the middle of the fist), not about the elbow: the grip stays in the hand and the blade turns about it.
          const [, py, pz] = def.wrist;
          const dy = def.at[1] - py;
          const dz = def.at[2] - pz;
          mesh.position.y = py + dy * Math.cos(turn) - dz * Math.sin(turn);
          mesh.position.z = pz + dy * Math.sin(turn) + dz * Math.cos(turn);
        }
        break;
      }
      case 'wing': {
        const amp = prof.archetype === 'flyer' || prof.archetype === 'hover' ? 1 : 2.4;
        const beat = wingBeat(pose.wingPhase) * pose.flapAmt * amp;
        mesh.rotation.z = (def.rotZ ?? 0) + (def.flap ?? 0) * (beat - 0.5 * limp);
        break;
      }
      case 'spider': {
        // A leg turns about the up axis to step; its foot goes back on the ground and comes forward in the air.
        const w = legWave(g.phase + r.walk, g.duty);
        mesh.rotation.y = (def.rotY ?? 0) + r.side * Math.asin(Math.max(-1, Math.min(1, w.a * g.sinTheta))) * 1.1;
        mesh.rotation.z = (def.rotZ ?? 0) + r.side * (0.3 * w.lift * g.mov + limp * 0.4);
        break;
      }
      case 'flipper': {
        legPose(g, r.walk + r.trot * trot, false, leg);
        mesh.rotation.x = (def.rotX ?? 0) + Math.asin(Math.max(-1, Math.min(1, leg.foot))) * 0.9;
        mesh.position.y = def.at[1] + leg.lift * 0.05 * g.mov;
        break;
      }
      case 'tentacle': {
        const wob = Math.sin(2 * Math.PI * (pose.wingPhase - r.index * 0.11));
        mesh.rotation.x = (def.rotX ?? 0) - 0.4 * pose.effort - 0.1 + wob * 0.16 * (0.5 + pose.effort);
        mesh.rotation.z = (def.rotZ ?? 0) + Math.cos(2 * Math.PI * (pose.wingPhase * 0.7 + r.index * 0.17)) * 0.12 + (r.index % 2 ? 0.1 : -0.1) * pose.effort;
        break;
      }
      case 'tail': {
        mesh.rotation.y = (def.rotY ?? 0) + Math.sin(2 * Math.PI * (pose.wingPhase - 0.35)) * 0.6 * (0.3 + 0.7 * pose.effort);
        break;
      }
      default:
        break;
    }
  }
}
