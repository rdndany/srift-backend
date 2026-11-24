import { describe, expect, it } from 'vitest';
import { ATTACK_ANIM, BOSS_ANIM, MOBS, type MobKind } from '@solrift/shared';
import { CreatureMotion, angleDiff, archetypeOf, legPose, legWave, profileFor, type LegOut, type MotionInput } from './creatureMotion';
import { classifyRig, guessArchetype, poseRig, strikeCurve, wingBeat, type MeshLike, type RigPart } from './creatureRig';
import { RIGS } from './mobRenderer';

const KINDS = Object.keys(RIGS) as MobKind[];

function make(kind: MobKind, id = 7): { m: CreatureMotion; parts: RigPart[]; rig: ReturnType<typeof classifyRig>; height: number } {
  const def = MOBS[kind];
  const parts = RIGS[kind];
  const arch = archetypeOf(kind) ?? guessArchetype(parts, def.height);
  const rig = classifyRig(parts, arch, def.height);
  const meshes: RigPart[] = parts.map((p) => ({ def: p, mesh: mesh(p) }));
  return { m: new CreatureMotion(kind, id, rig.body, arch), parts: meshes, rig, height: def.height };
}
function mesh(p: { at: [number, number, number]; rotX?: number; rotY?: number; rotZ?: number }): MeshLike {
  return { position: { x: p.at[0], y: p.at[1], z: p.at[2] }, rotation: { x: p.rotX ?? 0, y: p.rotY ?? 0, z: p.rotZ ?? 0 }, scale: { x: 1, y: 1, z: 1 } };
}

const base = (o: Partial<MotionInput> = {}): MotionInput => ({
  x: 0, y: 0, z: 0, yaw: 0, dt: 1 / 60, time: 0, dead: false, deathTime: 0, hurtTime: 99, attackTime: 99, casting: 0, focus: null, height: 1.5, width: 0.8, scale: 1, ...o,
});

/** Walk the creature straight ahead (it faces -z at yaw 0) at `speed` for `seconds`, calling `each` after each frame. */
function walk(m: CreatureMotion, speed: number, seconds: number, each: (t: number, z: number) => void, o: Partial<MotionInput> = {}, fps = 120): number {
  const dt = 1 / fps;
  let z = 0;
  let t = 0;
  for (let n = 0; n < seconds * fps; n++) {
    t += dt;
    z -= speed * dt;
    m.update(base({ z, dt, time: t, ...o }));
    each(t, z);
  }
  return z;
}

describe('the leg of a walking creature', () => {
  it('stands still on the ground while it is on the ground, and is picked up in the air', () => {
    const out: LegOut = { angle: 0, scale: 1, knee: 0, lift: 0, air: false, foot: 0 };
    const g = { phase: 0, duty: 0.6, sinTheta: 0.5, run: 0, mov: 1, plant: 0.7, stride: 1 };
    // On the ground the foot's place in front of the hip goes back at an even rate: a body going forward at a steady pace leaves it where it is.
    const feet: number[] = [];
    for (let p = 0; p < 0.6; p += 0.01) {
      g.phase = p;
      feet.push(legPose(g, 0, false, out).foot);
    }
    const steps = feet.slice(1).map((v, i) => v - feet[i]!);
    for (const s of steps) expect(s).toBeCloseTo(steps[0]!, 6);
    g.phase = 0.8;
    expect(legPose(g, 0, false, out).lift).toBeGreaterThan(0.5);
    expect(legWave(0, 0.6).a).toBeCloseTo(1, 6);
    expect(legWave(0.6, 0.6).a).toBeCloseTo(-1, 6);
    expect(legWave(0.9999, 0.6).a).toBeCloseTo(1, 2);
  });
});

describe('the walk', () => {
  /** The metres a stance foot moves over the ground, and how high it floats, while a creature walks at a steady pace. */
  function feet(kind: MobKind, speed: number): { slide: number; float: number; sink: number } {
    const { m, rig } = make(kind);
    const legs = rig.roles.map((r, i) => ({ r, i })).filter((x) => x.r.role === 'leg');
    const len = rig.body.legLen;
    const out: LegOut = { angle: 0, scale: 1, knee: 0, lift: 0, air: false, foot: 0 };
    const prev = new Map<number, number>();
    let slide = 0;
    let n = 0;
    let float = 0;
    let sink = 0;
    const dt = 1 / 120;
    walk(m, speed, 7, (t, z) => {
      if (t < 3) return;
      const p = m.pose;
      for (const { r, i } of legs) {
        legPose(p.gait, r.walk + r.trot * p.trot, r.kneed, out);
        // The foot's place along the way it goes (forward is -z), and its height over the ground.
        const reach = len * (r.kneed ? 1 : out.scale);
        const fwd = -z + reach * Math.sin(out.angle);
        const height = p.lift + len - reach * Math.cos(out.angle);
        const before = prev.get(i);
        prev.set(i, fwd);
        if (before === undefined || out.air || out.lift > 0) continue;
        slide += Math.abs((fwd - before) / dt) / speed;
        n++;
        float = Math.max(float, height / len);
        sink = Math.max(sink, -height / len);
      }
    });
    return { slide: slide / Math.max(1, n), float, sink };
  }

  it.each([
    ['pig', 1.5],
    ['cow', 1.3],
    ['wolf', 1.7],
    ['wolf', 4.2],
    ['horse', 1.7],
    ['horse', 4.6],
    ['sheep', 1.3],
    ['chicken', 1.2],
    ['creeper', 1.4],
    ['gilt_hound', 2.6],
  ] as [MobKind, number][])('keeps the feet of a %s at %s blocks/s on the ground (no skating)', (kind, speed) => {
    const f = feet(kind, speed);
    // The foot stays where it was put (a foot that skated would move at the speed of the body), and it neither floats nor sinks much.
    expect(f.slide).toBeLessThan(0.25);
    expect(f.float).toBeLessThan(0.16);
    expect(f.sink).toBeLessThan(0.12);
  });

  it.each([
    ['zombie', 1.4],
    ['zombie', 3.2],
    ['villager', 1.3],
    ['aurelion', 1.8],
    ['hollow_king', 2.1],
    ['enderman', 1.6],
  ] as [MobKind, number][])('moves the legs of a %s at %s blocks/s at a rate that suits them, and the feet touch down on beat', (kind, speed) => {
    const { m, rig } = make(kind);
    let steps = 0;
    let last = 0;
    walk(m, speed, 8, () => {
      const ph = m.pose.gait.phase;
      if (ph < last - 0.5) steps++;
      last = ph;
    });
    // Cycles per second stay in what a walk can be.
    const hz = steps / 8;
    expect(hz).toBeGreaterThan(profileFor(kind, m.profile.archetype).cadence[0] * 0.9);
    expect(hz).toBeLessThan(profileFor(kind, m.profile.archetype).cadence[1] * 1.1);
    expect(rig.counts.legs).toBe(2);
  });

  it('brings the legs to rest when it stops', () => {
    const { m, parts, rig } = make('pig');
    const z = walk(m, 1.5, 3, () => undefined);
    for (let n = 0; n < 120; n++) m.update(base({ z, time: 3 + n / 60 }));
    poseRig(rig, parts, m.pose, m.profile, 0, 0, 0, 1);
    for (const p of parts) if (p.def.hang && p.def.swing) expect(Math.abs(p.mesh.rotation.x)).toBeLessThan(0.05);
  });

  it('walks the legs backwards when it is thrown back', () => {
    const { m } = make('zombie');
    let z = 0;
    let t = 0;
    let moved = 0;
    let prev = m.pose.gait.phase;
    for (let n = 0; n < 240; n++) {
      t += 1 / 120;
      z += 2 / 120; // backwards: it faces -z
      m.update(base({ z, time: t, dt: 1 / 120 }));
      if (n > 60) {
        let d = m.pose.gait.phase - prev;
        if (d > 0.5) d -= 1;
        if (d < -0.5) d += 1;
        moved += d;
      }
      prev = m.pose.gait.phase;
    }
    expect(moved).toBeLessThan(-0.5);
  });

  it('is the same whether the position comes every frame or in steps (a snapshot twenty times a second, smoothed)', () => {
    const a = make('pig').m;
    const b = make('pig').m;
    let tz = 0;
    let sz = 0;
    let t = 0;
    for (let n = 0; n < 600; n++) {
      t += 1 / 60;
      tz -= 1.5 / 60;
      a.update(base({ z: tz, time: t }));
      // The other is only told every third frame, and eases to it (as remote.ts does).
      if (n % 3 === 0) sz = tz;
      b.update(base({ z: sz, time: t }));
    }
    expect(Math.abs(a.pose.speed - b.pose.speed)).toBeLessThan(0.6);
  });
});

describe('weight and turning', () => {
  it('turns no faster than its body can, the heavy slowest', () => {
    const rate = (kind: MobKind): number => {
      const { m } = make(kind);
      m.update(base({ yaw: 0 }));
      let worst = 0;
      let prev = 0;
      for (let n = 0; n < 120; n++) {
        const y = m.update(base({ yaw: 3, time: n / 60 })).yaw;
        worst = Math.max(worst, Math.abs(angleDiff(y, prev)) * 60);
        prev = y;
      }
      return worst;
    };
    const rabbit = rate('rabbit');
    const cow = rate('cow');
    const king = rate('aurelion');
    expect(king).toBeLessThan(cow);
    expect(cow).toBeLessThan(rabbit);
    expect(king).toBeLessThanOrEqual(profileFor('aurelion', 'biped').turn + 0.01);
  });

  it('leads a turn with the head and banks into it', () => {
    const { m } = make('wolf');
    let z = 0;
    let maxHead = 0;
    let maxRoll = 0;
    for (let n = 0; n < 240; n++) {
      z -= 3 / 60;
      const p = m.update(base({ z, yaw: n < 40 ? 0 : 1.3, time: n / 60 }));
      if (n > 40) {
        maxHead = Math.max(maxHead, Math.abs(p.head.yaw));
        maxRoll = Math.max(maxRoll, Math.abs(p.roll));
      }
    }
    expect(maxHead).toBeGreaterThan(0.2);
    expect(maxRoll).toBeGreaterThan(0.03);
  });

  it('rides over a step instead of snapping up it', () => {
    const { m } = make('zombie');
    m.update(base());
    m.update(base({ y: 1 }));
    expect(m.pose.lift).toBeLessThan(-0.6);
    for (let n = 0; n < 90; n++) m.update(base({ y: 1, time: n / 60 }));
    expect(Math.abs(m.pose.lift)).toBeLessThan(0.15);
  });

  it('does not smooth away a long drop or a teleport', () => {
    const { m } = make('pig');
    m.update(base({ y: 5 }));
    m.update(base({ y: 2 }));
    expect(m.pose.lift).toBeGreaterThan(-0.2);
    m.update(base({ x: 50, y: 2 }));
    expect(Math.abs(m.pose.lift)).toBeLessThan(0.3);
    expect(Number.isFinite(m.pose.speed)).toBe(true);
  });

});

describe('attention', () => {
  const near = (x: number, z: number) => ({ x, y: 0, z });

  it('looks at a player who comes near, after a moment, with the head turned toward them', () => {
    // (A cat, which looks and does not turn its body: a villager turns to face the visitor, and its head then looks straight ahead.)
    const { m } = make('cat');
    let t = 0;
    let most = 0;
    for (let n = 0; n < 150; n++) {
      t += 1 / 60;
      // The player stands to the cat's left (it faces -z; its left is -x) and a little ahead.
      const yaw = m.update(base({ time: t, focus: near(-3, -3) })).head.yaw;
      if (n === 3) expect(Math.abs(yaw)).toBeLessThan(0.3);
      most = Math.max(most, yaw);
    }
    expect(most).toBeGreaterThan(0.2);
  });

  it('turns a person to face a visitor, and a creature of the wild does not', () => {
    const villager = make('villager').m;
    const pig = make('pig').m;
    let v = 0;
    let p = 0;
    for (let n = 0; n < 300; n++) {
      v = villager.update(base({ time: n / 60, focus: near(5, 0) })).yaw;
      p = pig.update(base({ time: n / 60, focus: near(5, 0) })).yaw;
    }
    // The visitor stands at +x: facing there is a yaw of -pi/2.
    expect(Math.abs(angleDiff(v, -Math.PI / 2))).toBeLessThan(0.15);
    expect(Math.abs(p)).toBeLessThan(0.05);
  });

  it('does not look at a player who is behind it, or far away, or if it pays no mind', () => {
    const a = make('villager').m;
    const b = make('villager').m;
    const c = make('bat').m;
    for (let n = 0; n < 300; n++) {
      a.update(base({ time: n / 60, focus: near(0, 5) })); // behind
      b.update(base({ time: n / 60, focus: near(0, -60) })); // far
      c.update(base({ time: n / 60, focus: near(0, -2) })); // a bat does not care
    }
    // (They glance about on their own; none of them is staring at the player.)
    expect(Math.abs(a.pose.head.pitch)).toBeLessThan(0.6);
    expect(c.pose.alert).toBe(0);
    expect(b.pose.alert).toBe(0);
  });

  it('a shy animal freezes alert when you come close, and relaxes when you leave', () => {
    const { m } = make('rabbit');
    for (let n = 0; n < 200; n++) m.update(base({ time: n / 60, focus: near(0, -3) }));
    expect(m.pose.alert).toBeGreaterThan(0.6);
    for (let n = 0; n < 400; n++) m.update(base({ time: 4 + n / 60, focus: near(0, -40) }));
    expect(m.pose.alert).toBeLessThan(0.1);
  });

  it('curious animals lose interest and look away for a while', () => {
    const { m } = make('cat');
    let looking = 0;
    let away = 0;
    for (let n = 0; n < 60 * 40; n++) {
      const p = m.update(base({ time: n / 60, focus: near(-2, -4) }));
      if (n > 60 * 2) {
        if (Math.abs(p.head.yaw - angleDiff(Math.atan2(2, 4), 0)) < 0.35) looking++;
        else away++;
      }
    }
    expect(looking).toBeGreaterThan(60 * 5);
    expect(away).toBeGreaterThan(60 * 2);
  });

  it('a hunter keeps its eyes on you', () => {
    const { m } = make('zombie');
    let off = 0;
    for (let n = 0; n < 600; n++) {
      const p = m.update(base({ time: n / 60, focus: near(0, -6) }));
      if (n > 120 && Math.abs(p.head.yaw) > 0.4) off++;
    }
    expect(off).toBeLessThan(60);
  });
});

describe('what it does while it stands', () => {
  function seen(kind: MobKind, seconds: number, pick: (m: CreatureMotion) => number): { min: number; max: number } {
    const { m } = make(kind, 11);
    let min = Infinity;
    let max = -Infinity;
    for (let n = 0; n < seconds * 60; n++) {
      m.update(base({ time: n / 60 }));
      const v = pick(m);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    return { min, max };
  }

  it('a cow lowers its head to graze, a chicken pecks, a wolf sniffs', () => {
    expect(seen('cow', 90, (m) => m.pose.head.pitch).min).toBeLessThan(-0.5);
    expect(seen('chicken', 60, (m) => m.pose.head.pitch).min).toBeLessThan(-0.5);
    expect(seen('wolf', 90, (m) => m.pose.head.pitch).min).toBeLessThan(-0.25);
  });

  it('a villager glances about and shifts its weight, and does not graze', () => {
    const y = seen('villager', 90, (m) => m.pose.head.yaw);
    expect(y.max).toBeGreaterThan(0.15);
    expect(y.min).toBeLessThan(-0.15);
    expect(seen('villager', 90, (m) => m.pose.head.pitch).min).toBeGreaterThan(-0.4);
    expect(seen('villager', 90, (m) => Math.abs(m.pose.roll)).max).toBeGreaterThan(0.01);
  });

  it('nothing moves in step, and nothing twitches when it is meant to be still', () => {
    const a = make('cow', 1).m;
    const b = make('cow', 2).m;
    let differs = 0;
    for (let n = 0; n < 60 * 30; n++) {
      a.update(base({ time: n / 60 }));
      b.update(base({ time: n / 60 }));
      if (Math.abs(a.pose.head.pitch - b.pose.head.pitch) > 0.2) differs++;
    }
    expect(differs).toBeGreaterThan(60);
    // A dummy that has not been hit is still.
    const d = make('dummy').m;
    for (let n = 0; n < 600; n++) d.update(base({ time: n / 60, hurtTime: 99 }));
    expect(d.pose.roll).toBe(0);
    expect(d.pose.pitch).toBe(0);
  });

  it('a dummy rocks on its post when it is hit and settles', () => {
    const d = make('dummy').m;
    let peak = 0;
    for (let n = 0; n < 240; n++) peak = Math.max(peak, Math.abs(d.update(base({ time: n / 60, hurtTime: n / 60 })).roll));
    expect(peak).toBeGreaterThan(0.08);
    expect(Math.abs(d.pose.roll)).toBeLessThan(0.01);
  });
});

describe('fighting, being hurt, dying', () => {
  it('a zombie snaps forward as its swing begins and is back where it was when it ends', () => {
    const { m } = make('zombie');
    let peak = 0;
    let at = 0;
    for (let n = 0; n <= 60; n++) {
      const t = n / 120;
      const p = m.update(base({ time: t, attackTime: t, dt: 1 / 120, focus: { x: 0, y: 0, z: -1 } }));
      if (p.fwd > peak) {
        peak = p.fwd;
        at = t / ATTACK_ANIM;
      }
    }
    expect(peak).toBeGreaterThan(0.2);
    expect(at).toBeLessThan(0.45);
    for (let n = 0; n < 120; n++) m.update(base({ time: 1 + n / 60, attackTime: 99, focus: { x: 0, y: 0, z: -1 } }));
    expect(Math.abs(m.pose.fwd)).toBeLessThan(0.001);
  });

  it('a boss rears back through its wind-up and slams as it ends', () => {
    const { m } = make('aurelion');
    let rear = 0;
    let slam = 0;
    let slamAt = 0;
    for (let n = 0; n <= 180; n++) {
      const t = (n / 180) * BOSS_ANIM;
      const p = m.update(base({ time: t, attackTime: t, dt: 1 / 120, height: 6.2, width: 2.6 }));
      rear = Math.max(rear, p.pitch);
      if (p.fwd > slam) {
        slam = p.fwd;
        slamAt = t;
      }
    }
    expect(rear).toBeGreaterThan(0.1);
    expect(slam).toBeGreaterThan(0.3);
    expect(slamAt).toBeGreaterThan(0.8);
  });

  it('an archer does not step into its shot', () => {
    const { m } = make('skeleton');
    let peak = 0;
    for (let n = 0; n <= 40; n++) peak = Math.max(peak, m.update(base({ time: n / 100, attackTime: n / 100, dt: 1 / 100 })).fwd);
    expect(peak).toBe(0);
  });

  it('a blow throws the head back, the light more than the heavy', () => {
    const recoil = (kind: MobKind): number => {
      const { m } = make(kind);
      let peak = 0;
      for (let n = 0; n < 60; n++) peak = Math.max(peak, m.update(base({ time: n / 120, hurtTime: n / 120, dt: 1 / 120 })).pitch);
      return peak;
    };
    expect(recoil('zombie')).toBeGreaterThan(0.1);
    expect(recoil('aurelion')).toBeLessThan(recoil('zombie'));
  });

  it.each(KINDS.filter((k) => k !== 'dummy' && k !== 'armor_stand').map((k) => [k]))('%s falls, settles, and stays down', (kind) => {
    const { m } = make(kind as MobKind, 3);
    for (let n = 0; n < 30; n++) m.update(base({ time: n / 60, height: MOBS[kind as MobKind].height, width: MOBS[kind as MobKind].width }));
    let p = m.pose;
    let lowest = Infinity;
    for (let n = 0; n <= 42; n++) {
      p = m.update(base({ time: 1 + n / 60, dead: true, deathTime: n / 60, height: MOBS[kind as MobKind].height, width: MOBS[kind as MobKind].width }));
      lowest = Math.min(lowest, p.lift);
      for (const v of [p.lift, p.pitch, p.roll, p.sx, p.sy, p.sz]) expect(Number.isFinite(v)).toBe(true);
    }
    // At the end of the death it is lying, or has gone slack: it is not standing as it was.
    const fell = Math.abs(p.pitch) + Math.abs(p.roll);
    const flat = p.sy < 0.6;
    const sank = p.lift < -0.05;
    expect(fell > 0.8 || flat || sank).toBe(true);
    // (And it does not tip it under the ground by more than its own thickness.)
    expect(lowest).toBeGreaterThan(-MOBS[kind as MobKind].height);
  });

  it('a fall takes time: it is not over in the first moment, and it speeds up', () => {
    const { m } = make('cow', 4);
    const angle = (t: number): number => {
      const p = m.update(base({ time: t, dead: true, deathTime: t, height: 1.4, width: 0.9 }));
      return Math.abs(p.roll) + Math.abs(p.pitch);
    };
    const a = angle(0.1);
    const b = angle(0.3);
    const c = angle(0.62);
    expect(a).toBeLessThan(0.3);
    expect(c).toBeGreaterThan(1.2);
    expect(c - b).toBeGreaterThan(b - a);
  });
});

describe('wings, tails and arms', () => {
  it('a bat beats its wings; a chicken folds them until it falls', () => {
    const bat = make('bat');
    walk(bat.m, 2.5, 2, () => undefined);
    const chicken = make('chicken');
    walk(chicken.m, 0, 2, () => undefined);
    expect(bat.m.pose.flapAmt).toBeGreaterThan(0.8);
    expect(chicken.m.pose.flapAmt).toBeLessThan(0.05);
    // Falling out of the air it flaps.
    let y = 5;
    let amt = 0;
    for (let n = 0; n < 60; n++) {
      y -= 6 / 60;
      amt = Math.max(amt, chicken.m.update(base({ y, time: 2 + n / 60 })).flapAmt);
    }
    expect(amt).toBeGreaterThan(0.6);
    expect(wingBeat(0.25)).toBeGreaterThan(wingBeat(0.75) * -1 - 0.01);
  });

  it('wing, tail and arm parts are written, and a part that is not moved is put back where the model had it', () => {
    const { m, parts, rig } = make('bat');
    const wings = parts.filter((p) => p.def.flap !== undefined);
    expect(wings.length).toBeGreaterThanOrEqual(4);
    let most = 0;
    walk(m, 2.5, 2, () => {
      for (const p of parts) p.mesh.position.y = 99;
      poseRig(rig, parts, m.pose, m.profile, 0, 0, 0, 1);
      parts.forEach((p) => expect(p.mesh.position.y).toBeCloseTo(p.def.at[1], 6));
      for (const w of wings) most = Math.max(most, Math.abs(w.mesh.rotation.z - (w.def.rotZ ?? 0)));
    });
    expect(most).toBeGreaterThan(0.1);
  });

  it('a fish swims by bending: its tail beats, faster as it goes', () => {
    const { m, parts, rig } = make('salmon');
    expect(rig.roles.some((r) => r.role === 'tail')).toBe(true);
    const tail = parts.find((_, i) => rig.roles[i]!.role === 'tail')!;
    const swing = (speed: number): number => {
      let peak = 0;
      walk(m, speed, 2, () => {
        poseRig(rig, parts, m.pose, m.profile, 0, 0, 0, 1);
        peak = Math.max(peak, Math.abs(tail.mesh.rotation.y));
      });
      return peak;
    };
    const rate = (speed: number): number => {
      let flips = 0;
      let last = 0;
      walk(m, speed, 4, () => {
        const s = Math.sin(2 * Math.PI * m.pose.wingPhase);
        if (last < 0 && s >= 0) flips++;
        last = s;
      });
      return flips / 4;
    };
    expect(swing(1.3)).toBeGreaterThan(0.2);
    expect(rate(2.8)).toBeGreaterThan(rate(0.2));
  });

  it('a spider steps with its legs in alternating groups, and a squid jets', () => {
    const spider = make('spider');
    const legs = spider.rig.roles.filter((r) => r.role === 'spider');
    expect(legs.length).toBe(8);
    expect(new Set(legs.map((l) => l.walk)).size).toBe(2);
    const squid = make('squid');
    let squash = 1;
    let stretch = 1;
    walk(squid.m, 1, 5, () => {
      squash = Math.min(squash, squid.m.pose.sx);
      stretch = Math.max(stretch, squid.m.pose.sy);
    });
    expect(squash).toBeLessThan(0.95);
    expect(stretch).toBeGreaterThan(1.05);
  });

  it('a zombie swings its arms against its legs, a villager with folded arms does not', () => {
    const z = make('zombie');
    walk(z.m, 1.4, 4, () => undefined);
    const arms = z.rig.roles.map((r, i) => ({ r, i })).filter((x) => x.r.role === 'arm');
    expect(arms.length).toBe(2);
    const seen: number[][] = [[], []];
    for (let n = 0; n < 120; n++) {
      z.m.update(base({ z: -100 - n * 0.02, time: 10 + n / 60 }));
      poseRig(z.rig, z.parts, z.m.pose, z.m.profile, 0, 0, 0, 1);
      arms.forEach((a, k) => seen[k]!.push(z.parts[a.i]!.mesh.rotation.x - (z.parts[a.i]!.def.rotX ?? 0)));
    }
    expect(Math.max(...seen[0]!) - Math.min(...seen[0]!)).toBeGreaterThan(0.1);
    // The two arms are in opposite phases.
    const dot = seen[0]!.reduce((s, v, i) => s + v * seen[1]![i]!, 0);
    expect(dot).toBeLessThan(0);
    expect(make('villager').rig.counts.arms).toBe(0);
  });

  it('strikes with the arms at the swing and nothing at rest', () => {
    const { m, parts, rig } = make('zombie');
    m.update(base());
    poseRig(rig, parts, m.pose, m.profile, 0, 0, 0, 1);
    const arm = parts[rig.roles.findIndex((r) => r.role === 'arm')]!;
    const rest = arm.mesh.rotation.x;
    poseRig(rig, parts, m.pose, m.profile, -1, 0, 0, 1);
    expect(arm.mesh.rotation.x).toBeLessThan(rest - 0.5);
    expect(strikeCurve(0.3)).toBeCloseTo(1, 6);
    expect(strikeCurve(-1)).toBe(0);
  });
});

describe('the models', () => {
  it('every kind has a shape and a temper, and nothing in its profile is out of range', () => {
    for (const kind of KINDS) {
      const arch = archetypeOf(kind) ?? guessArchetype(RIGS[kind], MOBS[kind].height);
      const p = profileFor(kind, arch);
      expect(p.weight).toBeGreaterThanOrEqual(0);
      expect(p.weight).toBeLessThanOrEqual(1);
      expect(p.cadence[0]).toBeLessThanOrEqual(p.cadence[1]);
      expect(p.walk).toBeGreaterThan(0);
      expect(p.run).toBeGreaterThanOrEqual(p.walk);
      expect(p.stride[0]).toBeGreaterThan(0);
      expect(p.duty[0]).toBeGreaterThan(0.3);
    }
  });

  it('the shape of every walking model is what its legs say', () => {
    const count = (kind: MobKind) => classifyRig(RIGS[kind], archetypeOf(kind) ?? guessArchetype(RIGS[kind], MOBS[kind].height), MOBS[kind].height).counts;
    for (const k of ['pig', 'cow', 'sheep', 'wolf', 'fox', 'cat', 'horse', 'llama', 'camel', 'panda', 'creeper', 'gilt_hound', 'rabbit', 'frog'] as MobKind[]) expect(count(k).legs).toBe(4);
    for (const k of ['zombie', 'skeleton', 'husk', 'drowned', 'stray', 'enderman', 'villager', 'chicken', 'parrot', 'gilt_imp', 'gilt_drake', 'gilt_colossus', 'aurelion', 'hollow_king', 'ashen_knight'] as MobKind[]) expect(count(k).legs).toBe(2);
    expect(count('spider').spiders).toBe(8);
    expect(count('cave_spider').spiders).toBe(8);
    expect(count('squid').tentacles).toBe(8);
    expect(count('bat').wings).toBeGreaterThanOrEqual(2);
    expect(count('turtle').legs).toBe(4);
  });

  it('a boss has two legs with knees, two arms that strike, and a head', () => {
    for (const k of ['aurelion', 'hollow_king'] as MobKind[]) {
      const { rig } = make(k);
      expect(rig.counts.heads).toBeGreaterThanOrEqual(1);
      expect(rig.counts.arms).toBeGreaterThanOrEqual(2);
      expect(rig.roles.filter((r) => r.role === 'leg' && r.kneed).length).toBe(2);
      expect(rig.roles.some((r) => r.role === 'knee')).toBe(true);
      expect(rig.body.legLen).toBeGreaterThan(1.0);
    }
  });

  it('a model that nothing names is moved by its shape', () => {
    // Four legs on a body: a quadruped, whatever it is called.
    const quad = [
      { size: [0.5, 0.5, 0.5], at: [0, 0.68, -0.55], skin: 'a', isHead: true },
      { size: [0.6, 0.5, 0.9], at: [0, 0.58, 0], skin: 'a' },
      ...[-1, 1].flatMap((s) => [-0.3, 0.4].map((z) => ({ size: [0.2, 0.4, 0.2], at: [s * 0.2, 0.4, z], skin: 'a', hang: true, swing: s }))),
    ] as Parameters<typeof classifyRig>[0];
    expect(guessArchetype(quad, 1)).toBe('quad');
    const wings = [
      { size: [0.3, 0.3, 0.3], at: [0, 0.4, 0], skin: 'a', isHead: true },
      { size: [0.3, 0.2, 0.05], at: [-0.3, 0.4, 0], skin: 'a', flap: 0.8 },
      { size: [0.3, 0.2, 0.05], at: [0.3, 0.4, 0], skin: 'a', flap: -0.8 },
    ] as Parameters<typeof classifyRig>[0];
    expect(guessArchetype(wings, 1)).toBe('flyer');
    expect(archetypeOf('some_new_creature')).toBeNull();
    expect(profileFor('some_new_creature', 'quad').turn).toBeGreaterThan(0);
  });

  it('every model, in every state, gives numbers (nothing is NaN, nothing is blown up)', () => {
    let seed = 12345;
    const rnd = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (const kind of KINDS) {
      const { m, parts, rig } = make(kind, 5);
      const def = MOBS[kind];
      let x = 0;
      let z = 0;
      let y = 0;
      let yaw = 0;
      let dead = false;
      let deadFor = 0;
      for (let n = 0; n < 1500; n++) {
        const dt = rnd() < 0.05 ? 0.09 : 1 / 60;
        if (rnd() < 0.02) yaw = rnd() * 12 - 6;
        const sp = rnd() < 0.5 ? 0 : rnd() * def.runSpeed * 1.2;
        x += Math.sin(yaw) * -sp * dt;
        z += Math.cos(yaw) * -sp * dt;
        y += rnd() < 0.05 ? (rnd() - 0.4) * 1.5 : 0;
        if (rnd() < 0.002) dead = !dead;
        deadFor = dead ? deadFor + dt : 0;
        const p = m.update(base({
          x, y, z, yaw, dt, time: n / 60, dead, deathTime: deadFor, hurtTime: rnd() < 0.1 ? 0 : 9, attackTime: rnd() < 0.05 ? 0 : n % 90 < 40 ? (n % 90) / 100 : 99,
          casting: rnd() < 0.3 ? 1 : 0, focus: rnd() < 0.7 ? { x: x + rnd() * 10 - 5, y, z: z + rnd() * 10 - 5 } : null, height: def.height, width: def.width, scale: 1,
        }));
        poseRig(rig, parts, p, m.profile, rnd() - 0.5, rnd(), n / 60, 5);
        for (const v of [p.yaw, p.lift, p.fwd, p.pitch, p.roll, p.sx, p.sy, p.sz, p.head.yaw, p.head.pitch, p.head.roll, p.head.drop, p.head.thrust, p.gait.phase, p.gait.sinTheta]) {
          if (!Number.isFinite(v)) throw new Error(`${kind} frame ${n}: a pose is not finite`);
        }
        expect(Math.abs(p.pitch)).toBeLessThan(3.4);
        expect(Math.abs(p.roll)).toBeLessThan(3.4);
        expect(p.sx).toBeGreaterThan(0.1);
        expect(p.sy).toBeGreaterThan(0.1);
        for (const part of parts) {
          for (const v of [part.mesh.rotation.x, part.mesh.rotation.y, part.mesh.rotation.z, part.mesh.position.x, part.mesh.position.y, part.mesh.position.z, part.mesh.scale.y]) {
            if (!Number.isFinite(v)) throw new Error(`${kind} frame ${n}: a part is not finite`);
          }
        }
      }
    }
  });
});
