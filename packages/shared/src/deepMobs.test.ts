import { describe, expect, it } from 'vitest';
import { B, IS_SOLID } from './blocks';
import {
  HOLLOW_DEEP_KINDS,
  KNIGHT_BLOCK,
  KNIGHT_COOLDOWN,
  KNIGHT_SLAM_DAMAGE,
  LURKER_AMBUSH,
  MOBS,
  MobManager,
  MobSpawner,
  PRIEST_CALLS,
  PUFF_FUSE,
  SHADE_BLINK_COOLDOWN,
  WRAITH_BALL_DAMAGE,
  isHollowDeepKind,
  type Mob,
  type MobEffect,
  type MobEnv,
  type MobEvents,
  type MobFx,
  type MobKind,
} from './mobs';
import { mulberry32 } from './noise';
import type { BlockReader } from './physics';
import { GameSession, HeadlessWorld, makeGenerator, type InputFrame } from './index';

/** A flat stone floor at y = 0 (the standing level is y = 1) under open air, with optional per-cell edits. */
function flat(edits: Record<string, number> = {}) {
  const m = new Map(Object.entries(edits));
  return {
    getBlock: (x: number, y: number, z: number) => m.get(`${x},${y},${z}`) ?? (y <= 0 ? B.STONE : B.AIR),
    set: (x: number, y: number, z: number, id: number) => void m.set(`${x},${y},${z}`, id),
  } satisfies BlockReader & { set: (x: number, y: number, z: number, id: number) => void };
}

interface Afflicted {
  effect: MobEffect;
  seconds: number;
  power?: number;
}

function harness(opts: { world?: BlockReader & { set?: (x: number, y: number, z: number, id: number) => void }; seed?: number; yaw?: number } = {}) {
  const world = opts.world ?? flat();
  const player = { x: 0.5, y: 1, z: 0.5, alive: true, invulnerable: false, yaw: opts.yaw as number | undefined, pitch: undefined as number | undefined };
  const rand = mulberry32(opts.seed ?? 7);
  const env: MobEnv = { world, player, daylight: 0, rand };
  const log = {
    hits: [] as { amount: number; source: string; effect?: unknown; kx: number; kz: number }[],
    afflicted: [] as Afflicted[],
    explosions: 0,
    fx: [] as { kind: MobFx; x: number; y: number; z: number }[],
    ignited: [] as [number, number, number][],
    sounds: [] as string[],
    drops: [] as { id: number; count: number }[],
    killed: [] as MobKind[],
  };
  const events: MobEvents = {
    hurtPlayer: (amount, kx, kz, source, _t, effect) => log.hits.push({ amount, source, effect, kx, kz }),
    afflict: (_t, effect, seconds, power) => log.afflicted.push({ effect, seconds, power }),
    explode: () => void log.explosions++,
    sound: (kind, mob) => log.sounds.push(`${mob.kind}:${kind}`),
    drop: (d) => log.drops.push(d),
    fx: (kind, x, y, z) => log.fx.push({ kind, x, y, z }),
    ignite: (x, y, z) => {
      log.ignited.push([x, y, z]);
      return true;
    },
    killed: (m) => log.killed.push(m.kind),
  };
  const mgr = new MobManager(rand);
  const run = (seconds: number, dt = 1 / 30, each?: () => void) => {
    for (let t = 0; t < seconds; t += dt) {
      mgr.update(dt, env, events);
      each?.();
    }
  };
  /** Runs until `done` or the time runs out; true if it was done. */
  const until = (done: () => boolean, seconds: number, dt = 1 / 30): boolean => {
    for (let t = 0; t < seconds; t += dt) {
      mgr.update(dt, env, events);
      if (done()) return true;
    }
    return false;
  };
  const put = (kind: MobKind, x: number, z: number): Mob => {
    const m = mgr.spawn(kind, x, 1, z);
    return m;
  };
  return { world, player, env, events, log, mgr, run, until, put, rand };
}

const idle = (): InputFrame => ({ t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false });
const run = (s: GameSession, seconds: number): void => {
  for (let i = 0; i < Math.round(seconds * 20); i++) s.tick(idle());
};
function makeSession() {
  const generator = makeGenerator(5); // (not the adventure world: its hub is a place no monster may enter)
  const world = new HeadlessWorld(generator);
  const s = new GameSession({ seed: 5, world, generator, naturalSpawning: false, rand: mulberry32(9) });
  s.finishLoading();
  return { s, world, realm: s.realm };
}

const hostile = (m: Mob) => ({ x: m.body.x, z: m.body.z });
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe('the monsters of the Hollow Deep: definitions', () => {
  it('are six hostile monsters, listed in one place', () => {
    expect([...HOLLOW_DEEP_KINDS]).toEqual(['moss_lurker', 'spore_puff', 'ember_wraith', 'ashen_knight', 'hollow_priest', 'shade']);
    for (const k of HOLLOW_DEEP_KINDS) {
      const d = MOBS[k];
      expect(d.kind).toBe(k);
      expect(d.hostile).toBe(true);
      expect(d.burnsInDaylight).toBe(false);
      expect(d.health).toBeGreaterThan(0);
      expect(d.xp(() => 0.5, { size: 1, variant: 0 })).toBeGreaterThan(0);
      expect(isHollowDeepKind(k)).toBe(true);
    }
    expect(isHollowDeepKind('zombie')).toBe(false);
    expect(isHollowDeepKind('hollow_king')).toBe(false);
  });

  it('are tuned for a dungeon of zombie-level monsters (players of level 5-10)', () => {
    // Nothing is a pushover or a wall: between a bit more than a zombie and about three times its health.
    for (const k of HOLLOW_DEEP_KINDS) {
      expect(MOBS[k].health).toBeLessThanOrEqual(MOBS.zombie.health * 4);
    }
    expect(MOBS.ashen_knight.health).toBeGreaterThan(MOBS.zombie.health * 2.5);
    expect(MOBS.spore_puff.health).toBeLessThan(MOBS.zombie.health / 2);
    expect(MOBS.shade.health).toBeLessThan(MOBS.zombie.health);
    expect(MOBS.shade.runSpeed / MOBS.zombie.runSpeed).toBeGreaterThan(1.4);
    expect(MOBS.moss_lurker.speed).toBeLessThan(MOBS.zombie.speed);
    expect(MOBS.ember_wraith.flying && MOBS.spore_puff.flying).toBeTruthy();
    for (const k of HOLLOW_DEEP_KINDS) {
      if (!MOBS[k].melee) continue;
      expect(MOBS[k].melee!.damage).toBeGreaterThan(0);
      expect(MOBS[k].melee!.damage).toBeLessThanOrEqual(8);
    }
  });

  it('drop things that fit them and can be killed for quests', () => {
    for (const k of HOLLOW_DEEP_KINDS) {
      let any = false;
      for (const r of [0.01, 0.5, 0.99]) any ||= MOBS[k].drops(() => r, { size: 1, variant: 0 }).length > 0;
      expect(any).toBe(true);
    }
    const h = harness();
    const m = h.put('shade', 10.5, 0.5);
    h.player.invulnerable = true;
    h.mgr.damage(m, 1000, 1, 0, h.events, true, true, true);
    expect(h.log.killed).toEqual(['shade']);
  });

  it('never spawn by themselves, and are not saved with the world', () => {
    const rand = mulberry32(5);
    const seen = new Set<MobKind>();
    const cave = { getBlock: (x: number, y: number, z: number) => (y <= 19 || y >= 26 ? B.STONE : B.AIR) } as BlockReader;
    for (const world of [flat(), cave]) {
      for (const daylight of [0, 1]) {
        const mgr = new MobManager(rand);
        const sp = new MobSpawner();
        for (let i = 0; i < 400; i++) {
          mgr.mobs.length = 0;
          for (const m of sp.update(1, mgr, { world, player: { x: 0.5, y: world === cave ? 20 : 1, z: 0.5 }, daylight, rand })) seen.add(m.kind);
        }
      }
    }
    for (const k of HOLLOW_DEEP_KINDS) expect(seen.has(k)).toBe(false);
    const h = harness();
    for (const k of HOLLOW_DEEP_KINDS) h.put(k, 20.5, 20.5);
    h.put('zombie', 22.5, 20.5);
    const saved = JSON.stringify(h.mgr.toJSON(20, 20, 50));
    for (const k of HOLLOW_DEEP_KINDS) expect(saved).not.toContain(k);
    expect(saved).toContain('zombie');
  });
});

describe('moss lurker', () => {
  it('lies still in the moss until somebody is almost on top of it', () => {
    const h = harness();
    const m = h.put('moss_lurker', 8.5, 0.5);
    const start = hostile(m);
    h.run(6);
    expect(dist(hostile(m), start)).toBeLessThan(0.3);
    expect(h.log.hits).toEqual([]);
    expect(LURKER_AMBUSH).toBeLessThan(MOBS.moss_lurker.detect);
  });

  it('roots and poisons the one it strikes', () => {
    const h = harness();
    const m = h.put('moss_lurker', 3.5, 0.5);
    expect(h.until(() => h.log.hits.length > 0, 8)).toBe(true);
    const hit = h.log.hits[0]!;
    expect(hit.source).toBe('moss_lurker');
    expect(hit.effect).toEqual(['root', 'poison']);
    expect(hit.amount).toBeCloseTo(MOBS.moss_lurker.melee!.damage * m.damageMul, 5);
  });

  it('leaves a real player rooted and poisoned, who then cannot walk until it wears off', () => {
    const { s } = makeSession();
    run(s, 2); // settle on the ground
    const walk = (ticks: number): number => {
      const x0 = s.body.x;
      const z0 = s.body.z;
      for (let i = 0; i < ticks; i++) s.tick({ ...idle(), forward: 1 });
      return Math.hypot(s.body.x - x0, s.body.z - z0);
    };
    expect(walk(10)).toBeGreaterThan(0.8);
    run(s, 1); // come to a stop (a root holds the player, it does not stop one who is running)
    s.afflict('root', 1.2);
    s.afflict('poison', 3);
    expect(s.moveMul).toBe(0);
    expect(walk(10)).toBeLessThan(0.05);
    expect(s.poison).toBeGreaterThan(2);
    run(s, 1.5);
    expect(s.rootTime).toBe(0);
    expect(s.moveMul).toBe(1);
    expect(walk(10)).toBeGreaterThan(0.8);
  });

  it('a slowed player walks at the slow\'s share of the speed, and weakness wears off', () => {
    const { s } = makeSession();
    run(s, 2);
    const walk = (ticks: number): number => {
      const x0 = s.body.x;
      const z0 = s.body.z;
      for (let i = 0; i < ticks; i++) s.tick({ ...idle(), forward: 1 });
      return Math.hypot(s.body.x - x0, s.body.z - z0);
    };
    const free = walk(20);
    s.afflict('slow', 2, 0.5);
    s.afflict('weak', 1);
    expect(s.moveMul).toBe(0.5);
    expect(s.weakTime).toBeGreaterThan(0.9);
    const slowed = walk(20);
    expect(slowed).toBeLessThan(free * 0.7);
    run(s, 2.5);
    expect(s.moveMul).toBe(1);
    expect(s.weakTime).toBe(0);
  });
});

describe('spore puff', () => {
  it('drifts at the player, swells and bursts into spores: poisoned and slowed, and no block is touched', () => {
    const h = harness();
    const m = h.put('spore_puff', 7.5, 0.5);
    expect(h.until(() => m.dead, 12)).toBe(true);
    expect(h.log.explosions).toBe(0);
    expect(h.log.fx.some((f) => f.kind === 'spores')).toBe(true);
    const kinds = h.log.afflicted.map((a) => a.effect);
    expect(kinds).toContain('poison');
    expect(kinds).toContain('slow');
    // It leaves nothing but the cloud, which keeps on poisoning for a few seconds.
    expect(h.log.drops).toEqual([]);
    const before = h.log.afflicted.length;
    h.run(1.5);
    expect(h.log.afflicted.length).toBeGreaterThan(before);
    h.run(6);
    const after = h.log.afflicted.length;
    h.run(2);
    expect(h.log.afflicted.length).toBe(after);
  });

  it('gives a warning before it goes off, and deflates if the player gets away', () => {
    const h = harness();
    const m = h.put('spore_puff', 2.5, 0.5);
    h.run(0.3);
    expect(m.casting).toBe(1);
    expect(h.log.sounds).toContain('spore_puff:hiss');
    h.player.x = 40;
    h.run(PUFF_FUSE + 0.5);
    expect(m.dead).toBe(false);
    expect(m.casting).toBe(0);
  });

  it('floats: it is not stopped by an air gap and does not fall', () => {
    const world = flat();
    const h = harness({ world });
    const m = h.mgr.spawn('spore_puff', 9.5, 4, 0.5);
    h.run(0.8);
    expect(m.body.y).toBeGreaterThan(2);
  });
});

describe('ember wraith', () => {
  it('keeps its distance and throws slow fireballs that set the player alight and burn the ground', () => {
    const h = harness();
    const m = h.mgr.spawn('ember_wraith', 9.5, 2, 0.5);
    expect(h.until(() => h.mgr.arrows.some((a) => a.source === 'ember_wraith'), 8)).toBe(true);
    const ball = h.mgr.arrows.find((a) => a.source === 'ember_wraith')!;
    expect(ball.spell).toBe(1);
    expect(ball.effect).toBe('burn');
    expect(Math.hypot(ball.vx, ball.vy, ball.vz)).toBeLessThan(12);
    expect(ball.damage).toBeCloseTo(WRAITH_BALL_DAMAGE * m.damageMul, 5);
    // It lands (the player stands still): a burn, and fire where the ball came down.
    expect(h.until(() => h.log.hits.length > 0 || h.log.ignited.length > 0, 4)).toBe(true);
    h.run(4);
    expect(h.log.hits.every((x) => x.source === 'ember_wraith' && x.effect === 'burn')).toBe(true);
    expect(h.log.ignited.length).toBeGreaterThan(0);
    for (const [x, y, z] of h.log.ignited) {
      // On the floor (a solid block below), in an open cell.
      expect(IS_SOLID[h.world.getBlock(x, y - 1, z)]).toBe(1);
      expect(h.world.getBlock(x, y, z)).toBe(B.AIR);
    }
    // It stays away: never closer than the near limit for long, and it does not walk on the ground.
    h.player.invulnerable = true;
    let closest = 99;
    h.run(10, 1 / 30, () => (closest = Math.min(closest, Math.hypot(m.body.x - 0.5, m.body.z - 0.5))));
    expect(closest).toBeGreaterThan(3);
  });

  it('is not harmed by fire or lava', () => {
    const h = harness();
    const m = h.mgr.spawn('ember_wraith', 9.5, 2, 0.5);
    h.player.alive = false;
    m.onFire = 5;
    const health = m.health;
    h.run(3);
    expect(m.health).toBe(health);
  });

  it('lights no ground fire where fire may not burn (the realm refuses)', () => {
    const h = harness();
    h.events.ignite = () => false;
    h.mgr.spawn('ember_wraith', 9.5, 2, 0.5);
    h.run(10);
    expect(h.log.fx.some((f) => f.kind === 'ignite')).toBe(false);
  });
});

describe('ashen knight', () => {
  it('winds up and charges in a straight line when the player is 5 to 12 blocks away, then slams', () => {
    const h = harness();
    const m = h.put('ashen_knight', 9.5, 0.5);
    expect(h.until(() => m.casting === 1, 3)).toBe(true);
    const aimed = m.yaw;
    expect(h.until(() => m.casting === 2, 3)).toBe(true);
    // It dashes: much faster than its walk, and along the way it was aimed.
    let top = 0;
    h.until(() => {
      top = Math.max(top, m.speedNow);
      return m.casting !== 2;
    }, 3);
    expect(top).toBeGreaterThan(MOBS.ashen_knight.runSpeed * 2);
    expect(Math.abs(Math.atan2(Math.sin(m.yaw - aimed), Math.cos(m.yaw - aimed)))).toBeLessThan(0.2);
    const slam = h.log.hits.find((x) => x.amount > MOBS.ashen_knight.melee!.damage * m.damageMul * 1.2);
    expect(slam).toBeTruthy();
    expect(slam!.amount).toBeCloseTo(KNIGHT_SLAM_DAMAGE * m.damageMul, 5);
    // The slam throws the player back.
    expect(Math.hypot(slam!.kx, slam!.kz)).toBeGreaterThan(1);
    expect(h.log.fx.some((f) => f.kind === 'slam')).toBe(true);
  });

  it('a step aside beats the charge, and it cannot charge again for a while', () => {
    const h = harness();
    const m = h.put('ashen_knight', 9.5, 0.5);
    expect(h.until(() => m.casting === 2, 4)).toBe(true);
    h.player.z = 6.5; // out of the line of the dash
    h.until(() => m.casting === 3, 3);
    expect(h.log.hits.filter((x) => x.amount >= KNIGHT_SLAM_DAMAGE * m.damageMul * 0.99)).toEqual([]);
    expect(m.skillCd).toBeGreaterThan(KNIGHT_COOLDOWN - 2);
    // For the next seconds it does not wind up again.
    h.player.z = 0.5;
    h.player.x = 10.5;
    m.body.x = 0.5;
    m.body.z = 0.5;
    let again = false;
    h.run(2, 1 / 30, () => (again ||= m.casting === 1));
    expect(again).toBe(false);
  });

  it('takes a blow from the front on its shield, and a blow from behind in full', () => {
    const h = harness();
    const m = h.put('ashen_knight', 3.5, 0.5);
    h.player.invulnerable = true;
    m.yaw = Math.atan2(-(0.5 - 3.5), 0); // faces -x ... toward the player at the origin
    const front = m.health;
    // The knockback direction is away from the attacker: the attacker stands at the front, so the push is away from the front.
    h.mgr.damage(m, 4, Math.sin(m.yaw) * 0 + -Math.sin(m.yaw) * -1, -Math.cos(m.yaw) * -1, h.events, true, true, true);
    const tookFront = front - m.health;
    m.health = front;
    // From behind: knock direction points along the way it faces.
    h.mgr.damage(m, 4, -Math.sin(m.yaw), -Math.cos(m.yaw), h.events, true, true, true);
    const tookBack = front - m.health;
    expect(tookBack).toBeGreaterThan(0);
    expect(tookFront).toBeCloseTo(tookBack * KNIGHT_BLOCK, 4);
    expect(h.log.fx.some((f) => f.kind === 'block')).toBe(true);
  });
});

describe('hollow priest', () => {
  it('heals the hostile monsters around it, with a beam', () => {
    const h = harness();
    const priest = h.put('hollow_priest', 12.5, 0.5);
    const zombie = h.put('zombie', 15.5, 2.5);
    zombie.health = zombie.maxHealth * 0.3;
    const before = zombie.health;
    expect(h.until(() => zombie.health > before, 6)).toBe(true);
    expect(h.log.fx.some((f) => f.kind === 'heal')).toBe(true);
    expect(priest.casting === 2 || h.log.sounds.includes('hollow_priest:yes')).toBe(true);
    // Not past full health, and not beyond its reach.
    h.run(30);
    expect(zombie.health).toBeLessThanOrEqual(zombie.maxHealth);
  });

  it('does not heal a monster far out of its range', () => {
    const h = harness();
    h.put('hollow_priest', 12.5, 0.5);
    const far = h.put('zombie', 12.5, 30.5);
    far.health = far.maxHealth * 0.3;
    const before = far.health;
    h.run(6);
    expect(far.health).toBeLessThanOrEqual(before + 0.0001);
  });

  it('fires a dark bolt that hurts and leaves the target weak and slow', () => {
    const h = harness();
    h.put('hollow_priest', 12.5, 0.5);
    expect(h.until(() => h.mgr.arrows.some((a) => a.source === 'hollow_priest'), 6)).toBe(true);
    const bolt = h.mgr.arrows.find((a) => a.source === 'hollow_priest')!;
    expect(bolt.effect).toEqual(['weak', 'slow']);
    expect(h.until(() => h.log.hits.length > 0, 4)).toBe(true);
    expect(h.log.hits[0]!.effect).toEqual(['weak', 'slow']);
  });

  it('calls two skeletons (bound to the dungeon, leaving nothing) once, when it is under half its health', () => {
    const h = harness();
    const priest = h.put('hollow_priest', 12.5, 0.5);
    h.run(1);
    expect(h.mgr.mobs.filter((m) => m.kind === 'skeleton')).toHaveLength(0);
    priest.health = priest.maxHealth * 0.45;
    h.run(1);
    const skeletons = h.mgr.mobs.filter((m) => m.kind === 'skeleton');
    expect(skeletons).toHaveLength(PRIEST_CALLS);
    for (const s of skeletons) {
      expect(s.bound).toBe(true);
      expect(s.noDrops).toBe(true);
      expect(s.aggro).toBe(true);
    }
    expect(h.log.fx.filter((f) => f.kind === 'summon')).toHaveLength(PRIEST_CALLS);
    h.run(5);
    expect(h.mgr.mobs.filter((m) => m.kind === 'skeleton')).toHaveLength(PRIEST_CALLS);
  });
});

describe('shade', () => {
  it('blinks behind the player on first sight and every few seconds, and hits fast', () => {
    const h = harness({ yaw: 0 }); // the player looks toward -z (so "behind" is +z)
    const m = h.put('shade', 10.5, 0.5);
    h.run(0.1);
    expect(h.log.sounds.filter((s) => s === 'shade:teleport')).toHaveLength(1);
    expect(dist(hostile(m), h.player)).toBeLessThan(3);
    // Behind: on the side opposite to the way the player looks.
    expect(m.body.z).toBeGreaterThan(h.player.z);
    const count = () => h.log.sounds.filter((s) => s === 'shade:teleport').length;
    h.run(SHADE_BLINK_COOLDOWN * 3 + 3);
    const blinks = count() - 1;
    expect(blinks).toBeGreaterThanOrEqual(2);
    expect(blinks).toBeLessThanOrEqual(5);
  });

  it('only ever lands on a free floor cell, never in rock or over a gap', () => {
    // A cave with pillars, holes and a low ceiling in places, the player turning every which way.
    const edits: Record<string, number> = {};
    for (let x = -6; x <= 6; x++)
      for (let z = -6; z <= 6; z++) {
        const hash = (x * 73856093) ^ (z * 19349663);
        if (Math.abs(hash) % 7 === 0 && (x !== 0 || z !== 0)) for (let y = 1; y <= 6; y++) edits[`${x},${y},${z}`] = B.STONE; // pillars
        else if (Math.abs(hash) % 11 === 1) edits[`${x},0,${z}`] = B.AIR; // holes
        if (Math.abs(hash) % 13 === 2) edits[`${x},2,${z}`] = B.STONE; // low roof
      }
    const world = flat(edits);
    let tried = 0;
    let landed = 0;
    for (let i = 0; i < 400; i++) {
      const h = harness({ world, seed: i + 1 });
      h.player.yaw = (i / 400) * Math.PI * 2;
      h.player.x = ((i * 7) % 9) - 4 + 0.5;
      h.player.z = ((i * 5) % 9) - 4 + 0.5;
      if (IS_SOLID[world.getBlock(Math.floor(h.player.x), 1, Math.floor(h.player.z))] === 1) continue;
      if (IS_SOLID[world.getBlock(Math.floor(h.player.x), 0, Math.floor(h.player.z))] !== 1) continue;
      const m = h.put('shade', h.player.x + 9, h.player.z);
      void m;
      tried++;
      const spot = h.mgr.blinkSpot(h.env);
      if (!spot) continue;
      landed++;
      const bx = Math.floor(spot.x);
      const bz = Math.floor(spot.z);
      const by = Math.floor(spot.y);
      expect(IS_SOLID[world.getBlock(bx, by - 1, bz)]).toBe(1); // floor under it
      expect(IS_SOLID[world.getBlock(bx, by, bz)]).not.toBe(1); // room for its body
      expect(IS_SOLID[world.getBlock(bx, by + 1, bz)]).not.toBe(1);
      expect(Math.hypot(spot.x - h.player.x, spot.z - h.player.z)).toBeLessThan(3.1);
    }
    expect(tried).toBeGreaterThan(100);
    expect(landed).toBeGreaterThan(tried * 0.5);
  });

  it('does not blink at all when there is nowhere to land (a one-block shaft)', () => {
    const edits: Record<string, number> = {};
    for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) for (let y = 1; y <= 4; y++) if (x !== 0 || z !== 0) edits[`${x},${y},${z}`] = B.STONE;
    const h = harness({ world: flat(edits), yaw: 1 });
    expect(h.mgr.blinkSpot(h.env)).toBeNull();
  });

  it('hits harder against somebody in the dark', () => {
    const lit = flat({ '1,1,0': B.TORCH });
    const dark = harness({ yaw: 0 });
    const light = harness({ world: lit, yaw: 0 });
    for (const h of [dark, light]) {
      h.put('shade', 2.5, 0.5);
      h.until(() => h.log.hits.length > 0, 4);
    }
    expect(dark.log.hits[0]!.amount).toBeGreaterThan(light.log.hits[0]!.amount * 1.2);
  });
});

describe('as guards of the dungeon', () => {
  const guards = (kind: MobKind) => {
    const h = harness();
    h.player.x = 40.5; // far away: not yet seen
    const m = h.put(kind, 4.5, 4.5);
    m.bound = true;
    m.guard = true;
    m.patrol = 5;
    m.homeX = 4.5;
    m.homeZ = 4.5;
    return { h, m };
  };

  it.each(['spore_puff', 'ember_wraith', 'ashen_knight', 'hollow_priest', 'shade', 'moss_lurker'] as const)('a %s that has not seen a player stays near its post', (kind) => {
    const { h, m } = guards(kind);
    let far = 0;
    h.run(30, 1 / 30, () => (far = Math.max(far, Math.hypot(m.body.x - 4.5, m.body.z - 4.5))));
    expect(far).toBeLessThan(10);
    expect(m.dead).toBe(false);
  });

  it.each(['spore_puff', 'ember_wraith', 'ashen_knight', 'hollow_priest', 'shade', 'moss_lurker'] as const)('a %s goes for the player who comes near', (kind) => {
    const { h, m } = guards(kind);
    h.run(1);
    h.player.x = 12.5;
    h.player.z = 4.5;
    const start = dist(hostile(m), h.player);
    let nearest = start;
    h.run(8, 1 / 30, () => (nearest = Math.min(nearest, dist(hostile(m), h.player))));
    // The lurker lies in wait until somebody is on top of it; the others close in (or keep their distance and shoot).
    if (kind === 'moss_lurker') expect(nearest).toBeGreaterThanOrEqual(start - 0.5);
    else expect(h.log.hits.length + h.log.afflicted.length + h.mgr.arrows.length + h.log.sounds.length).toBeGreaterThan(0);
  });
});

describe('in the realm (the real player and the real fire)', () => {
  it('a lurker that strikes a player leaves them rooted and poisoned, and a puff that bursts poisons and slows without breaking blocks', () => {
    const { s, realm } = makeSession();
    run(s, 2);
    const x = Math.floor(s.body.x) + 0.5;
    const z = Math.floor(s.body.z) + 0.5;
    const lurker = realm.mobs.spawn('moss_lurker', x + 1.2, s.body.y, z);
    lurker.aggro = true;
    const step = (): void => {
      s.tick(idle());
      realm.update(0.05, realm.players);
    };
    for (let i = 0; i < 120 && s.rootTime <= 0; i++) step();
    expect(s.rootTime).toBeGreaterThan(0);
    expect(s.poison).toBeGreaterThan(0);
    expect(lurker.dead).toBe(false);
    realm.mobs.mobs.length = 0;
    // Away from it, a puff comes and goes off.
    s.rootTime = 0;
    s.poison = 0;
    const puff = realm.mobs.spawn('spore_puff', s.body.x + 2, s.body.y + 1, s.body.z);
    const [cx, cy, cz] = [Math.floor(s.body.x), Math.floor(s.body.y), Math.floor(s.body.z)];
    const solid = (): number => {
      let n = 0;
      for (let dx = -4; dx <= 4; dx++) for (let dy = -3; dy <= 3; dy++) for (let dz = -4; dz <= 4; dz++) n += s.realm.world.getBlock(cx + dx, cy + dy, cz + dz) === B.AIR ? 0 : 1;
      return n;
    };
    const before = solid();
    for (let i = 0; i < 200 && !puff.dead; i++) step();
    expect(puff.dead).toBe(true);
    expect(s.poison).toBeGreaterThan(0);
    expect(s.slowTime).toBeGreaterThan(0);
    expect(solid()).toBe(before);
  });
});