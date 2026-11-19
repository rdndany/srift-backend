import { describe, expect, it } from 'vitest';
import { B } from './blocks';
import { I } from './items';
import {
  ATTACK_ANIM,
  CREEPER_FUSE,
  MobManager,
  MobSpawner,
  isExposedToSky,
  nearLight,
  rayAabb,
  type MobEnv,
  type MobEvents,
  type MobKind,
} from './mobs';
import { mulberry32 } from './noise';
import type { BlockReader } from './physics';
import { Vitals } from './survival';

/** Flat grass world: solid up to y=0 (grass on top), air above. */
function flat(edits: Record<string, number> = {}) {
  const m = new Map(Object.entries(edits));
  return {
    getBlock: (x: number, y: number, z: number) => m.get(`${x},${y},${z}`) ?? (y < 0 ? B.STONE : y === 0 ? B.GRASS : B.AIR),
    set: (x: number, y: number, z: number, id: number) => void m.set(`${x},${y},${z}`, id),
  } satisfies BlockReader & { set: (x: number, y: number, z: number, id: number) => void };
}

function harness(opts: { daylight?: number; invulnerable?: boolean; world?: ReturnType<typeof flat>; seed?: number } = {}) {
  const world = opts.world ?? flat();
  const player = { x: 0.5, y: 1, z: 0.5, alive: true, invulnerable: opts.invulnerable ?? false };
  const rand = mulberry32(opts.seed ?? 7);
  const env: MobEnv = { world, player, daylight: opts.daylight ?? 0, rand };
  const log = {
    hits: [] as { amount: number; source: string; kx: number; kz: number }[],
    explosions: [] as { x: number; y: number; z: number; radius: number }[],
    sounds: [] as string[],
    drops: [] as { id: number; count: number }[],
  };
  const events: MobEvents = {
    hurtPlayer: (amount, kx, kz, source) => log.hits.push({ amount, source, kx, kz }),
    explode: (x, y, z, radius) => log.explosions.push({ x, y, z, radius }),
    sound: (kind) => log.sounds.push(kind),
    drop: (d) => log.drops.push(d),
  };
  const mgr = new MobManager(rand);
  const run = (seconds: number, dt = 1 / 30) => {
    for (let t = 0; t < seconds; t += dt) mgr.update(dt, env, events);
  };
  return { world, player, env, events, log, mgr, run, rand };
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe('zombie', () => {
  it('chases the player and hits them', () => {
    const h = harness();
    const z = h.mgr.spawn('zombie', 10.5, 1, 0.5);
    h.run(8);
    expect(dist(z.body, h.player)).toBeLessThan(1.6);
    expect(h.log.hits.length).toBeGreaterThanOrEqual(1);
    expect(h.log.hits[0]).toMatchObject({ amount: 3, source: 'zombie' });
    // Knockback points from the zombie toward the player (the player is at lower x).
    expect(h.log.hits[0].kx).toBeLessThan(0);
  });

  it('attacks no faster than once per second', () => {
    const h = harness();
    h.mgr.spawn('zombie', 2.5, 1, 0.5);
    h.run(5);
    expect(h.log.hits.length).toBeLessThanOrEqual(5);
    expect(h.log.hits.length).toBeGreaterThanOrEqual(3);
  });

  it('swings at each attack (for the picture), and only while it is swinging, whether or not the blow does damage', () => {
    for (const kind of ['zombie', 'husk', 'drowned', 'spider', 'cave_spider'] as const) {
      const h = harness();
      // A hit that a raised shield stops: the game still hears of it, and the mob has swung all the same.
      h.events.hurtPlayer = () => undefined;
      const m = h.mgr.spawn(kind, 2.5, 1, 0.5);
      expect(m.attackTime).toBeGreaterThanOrEqual(ATTACK_ANIM); // not swinging at rest
      let swings = 0;
      let was = m.attackTime;
      for (let t = 0; t < 6; t += 1 / 30) {
        h.mgr.update(1 / 30, h.env, h.events);
        if (m.attackTime < was) swings++;
        was = m.attackTime;
      }
      expect(swings, kind).toBeGreaterThanOrEqual(3);
      expect(swings, kind).toBeLessThanOrEqual(7); // no faster than its cooldown
    }
  });

  it('paths around a wall', () => {
    const w = flat();
    for (let z = -4; z <= 4; z++) for (let y = 1; y <= 3; y++) w.set(4, y, z, B.STONE);
    const h = harness({ world: w });
    const z = h.mgr.spawn('zombie', 8.5, 1, 0.5);
    h.run(14);
    expect(dist(z.body, h.player)).toBeLessThan(1.8);
  });

  it('climbs a one-block step', () => {
    const w = flat();
    for (let zz = -6; zz <= 6; zz++) w.set(4, 1, zz, B.STONE);
    const h = harness({ world: w });
    const z = h.mgr.spawn('zombie', 8.5, 1, 0.5);
    h.run(8);
    expect(dist(z.body, h.player)).toBeLessThan(1.8);
  });

  it('ignores creative-mode players and players out of range', () => {
    const h = harness({ invulnerable: true });
    h.mgr.spawn('zombie', 3.5, 1, 0.5);
    h.run(6);
    expect(h.log.hits).toHaveLength(0);

    const far = harness();
    const z = far.mgr.spawn('zombie', 40.5, 1, 0.5);
    far.run(3);
    expect(dist(z.body, far.player)).toBeGreaterThan(30);
  });

  it('burns in daylight, but not at night or under a roof', () => {
    const day = harness({ daylight: 1 });
    const z = day.mgr.spawn('zombie', 30.5, 1, 30.5);
    z.exposed = true;
    day.run(5);
    expect(z.health).toBeLessThan(20);
    expect(z.burning).toBe(true);

    const night = harness({ daylight: 0.1 });
    const n = night.mgr.spawn('zombie', 30.5, 1, 30.5);
    night.run(5);
    expect(n.health).toBe(20);

    const w = flat();
    for (let x = 28; x <= 33; x++) for (let zz = 28; zz <= 33; zz++) w.set(x, 4, zz, B.STONE);
    const roof = harness({ daylight: 1, world: w });
    const r = roof.mgr.spawn('zombie', 30.5, 1, 30.5);
    roof.run(5);
    expect(r.health).toBe(20);
  });
});

describe('passive mobs', () => {
  it('wander slowly and stay on the ground', () => {
    const h = harness({ daylight: 1 });
    const pig = h.mgr.spawn('pig', 20.5, 1, 20.5);
    h.run(20);
    expect(pig.body.y).toBeCloseTo(1, 1);
    expect(dist(pig.body, { x: 20.5, z: 20.5 })).toBeGreaterThan(0.5);
    expect(h.log.hits).toHaveLength(0);
  });

  it('do not walk off cliffs', () => {
    const w = flat();
    // A 10x10 plateau four blocks up surrounded by a drop.
    for (let x = 20; x < 30; x++)
      for (let z = 20; z < 30; z++) for (let y = 1; y <= 4; y++) w.set(x, y, z, B.STONE);
    const h = harness({ world: w, daylight: 1, seed: 3 });
    const pig = h.mgr.spawn('pig', 25.5, 5, 25.5);
    h.run(60);
    expect(pig.body.y).toBeGreaterThan(4.5);
  });

  it('flee from whoever hurt them', () => {
    const h = harness({ daylight: 1 });
    const cow = h.mgr.spawn('cow', 10.5, 1, 0.5);
    const before = dist(cow.body, h.player);
    h.mgr.damage(cow, 2, 1, 0, h.events); // hit from the -x side, knocked toward +x
    h.run(3);
    expect(dist(cow.body, h.player)).toBeGreaterThan(before + 2);
  });
});

describe('combat', () => {
  it('kills, drops loot once and removes the corpse after the death animation', () => {
    const h = harness();
    const pig = h.mgr.spawn('pig', 5.5, 1, 5.5);
    expect(h.mgr.damage(pig, 4, 1, 0, h.events)).toBe(false);
    expect(h.log.drops).toHaveLength(0);
    expect(h.mgr.damage(pig, 20, 1, 0, h.events)).toBe(true);
    expect(pig.dead).toBe(true);
    expect(h.log.drops).toHaveLength(1);
    expect(h.log.drops[0].id).toBe(I.RAW_MEAT);
    expect(h.log.drops[0].count).toBeGreaterThanOrEqual(1);
    expect(h.mgr.damage(pig, 5, 1, 0, h.events)).toBe(false); // already dead
    expect(h.log.drops).toHaveLength(1);
    h.run(1);
    expect(h.mgr.mobs).toHaveLength(0);
  });

  it('knocks mobs back', () => {
    const h = harness();
    const z = h.mgr.spawn('zombie', 30.5, 1, 30.5);
    h.mgr.damage(z, 1, 1, 0, h.events);
    const x0 = z.body.x;
    h.run(0.4);
    expect(z.body.x).toBeGreaterThan(x0 + 0.5);
  });

  it('zombie, skeleton and creeper loot tables', () => {
    const kinds: MobKind[] = ['zombie', 'skeleton', 'creeper'];
    const seen = new Set<number>();
    for (let seed = 1; seed < 40; seed++) {
      for (const k of kinds) {
        const h = harness({ seed });
        const m = h.mgr.spawn(k, 30.5, 1, 30.5);
        h.mgr.damage(m, 100, 1, 0, h.events);
        for (const d of h.log.drops) seen.add(d.id);
      }
    }
    const usual: number[] = [I.ROTTEN_FLESH, I.BONE, I.ARROW, I.GUNPOWDER, I.STRING];
    for (const id of usual) expect(seen.has(id)).toBe(true);
    for (const id of seen) expect(usual.includes(id) || id === I.POTATO || id === I.CARROT).toBe(true);
  });

  it('raycast finds the nearest mob in front of the player', () => {
    const h = harness();
    const near = h.mgr.spawn('pig', 3.5, 1, 0.5);
    h.mgr.spawn('cow', 6.5, 1, 0.5);
    const hit = h.mgr.raycast(0.5, 1.6, 0.5, 1, -0.05, 0, 8)!;
    expect(hit.mob).toBe(near);
    expect(hit.dist).toBeGreaterThan(2);
    expect(h.mgr.raycast(0.5, 1.6, 0.5, -1, 0, 0, 8)).toBeNull();
    expect(h.mgr.raycast(0.5, 1.6, 0.5, 1, 0, 0, 2)).toBeNull(); // out of reach
  });

  it('rayAabb handles hits, misses and parallel rays', () => {
    const box: [[number, number, number], [number, number, number]] = [[2, 0, -1], [3, 2, 1]];
    expect(rayAabb(0, 1, 0, 1, 0, 0, box[0], box[1], 10)).toBeCloseTo(2);
    expect(rayAabb(0, 5, 0, 1, 0, 0, box[0], box[1], 10)).toBeNull();
    expect(rayAabb(0, 1, 0, -1, 0, 0, box[0], box[1], 10)).toBeNull();
  });
});

describe('creeper', () => {
  it('lights its fuse when close and explodes without dropping loot', () => {
    const h = harness();
    const c = h.mgr.spawn('creeper', 6.5, 1, 0.5);
    h.run(CREEPER_FUSE + 6);
    expect(h.log.explosions).toHaveLength(1);
    expect(h.log.explosions[0].radius).toBe(3);
    expect(c.dead).toBe(true);
    expect(h.log.sounds).toContain('hiss');
    expect(h.log.drops).toHaveLength(0);
  });

  it('defuses when the player runs away', () => {
    const h = harness();
    const c = h.mgr.spawn('creeper', 2.5, 1, 0.5);
    h.run(0.8);
    expect(c.fuse).toBeGreaterThan(0);
    h.player.x = 20;
    h.run(0.5);
    expect(c.fuse).toBe(-1);
    expect(h.log.explosions).toHaveLength(0);
    expect(c.dead).toBe(false);
  });

  it('explosion damages nearby mobs', () => {
    const h = harness();
    const pig = h.mgr.spawn('pig', 5.5, 1, 0.5);
    const hp = pig.health;
    h.mgr.explosionDamage(5.5, 1, 0.5, 3, h.events);
    expect(pig.health).toBeLessThan(hp);
  });
});

describe('player arrows', () => {
  it('a fully drawn arrow hits and kills a zombie in front of the player', () => {
    const h = harness({ invulnerable: true });
    const z = h.mgr.spawn('zombie', 8.5, 1, 0.5);
    const hp = z.health;
    h.mgr.shootArrow(0.5, 1.6, 0.5, 1, 0, 0, 1);
    h.run(0.6);
    expect(z.health).toBeLessThan(hp);
    expect(h.mgr.arrows.filter((a) => a.friendly)).toHaveLength(0);
  });

  it('a weak draw does less damage than a full draw', () => {
    const dmg = (power: number) => {
      const h = harness({ invulnerable: true });
      const z = h.mgr.spawn('cow', 4.5, 1, 0.5);
      const hp = z.health;
      h.mgr.shootArrow(0.5, 1.6, 0.5, 1, 0.02, 0, power);
      h.run(0.6);
      return hp - z.health;
    };
    expect(dmg(0.2)).toBeGreaterThan(0);
    expect(dmg(1)).toBeGreaterThan(dmg(0.2));
  });

  it('player arrows never hurt the player', () => {
    const h = harness();
    h.mgr.shootArrow(0.5, 1.6, 0.5, 0, 0, 1, 1);
    h.mgr.shootArrow(3.5, 1.6, 0.5, -1, 0, 0, 1);
    h.run(1);
    expect(h.log.hits).toHaveLength(0);
  });

  it('stops against a wall', () => {
    const w = flat();
    for (let y = 1; y <= 4; y++) for (let z = -2; z <= 2; z++) w.set(3, y, z, B.STONE);
    const h = harness({ world: w, invulnerable: true });
    const z = h.mgr.spawn('cow', 8.5, 1, 0.5);
    const hp = z.health;
    h.mgr.shootArrow(0.5, 1.6, 0.5, 1, 0, 0, 1);
    h.run(0.8);
    expect(z.health).toBe(hp);
  });
});

describe('mob persistence', () => {
  it('round-trips nearby living mobs with health and facing', () => {
    const h = harness();
    const pig = h.mgr.spawn('pig', 5.5, 1, 5.5);
    pig.health = 4;
    pig.yaw = 1.25;
    h.mgr.spawn('zombie', 6.5, 1, 6.5);
    h.mgr.spawn('cow', 200.5, 1, 200.5); // too far away
    const dead = h.mgr.spawn('cow', 7.5, 1, 7.5);
    dead.dead = true;
    const save = JSON.parse(JSON.stringify(h.mgr.toJSON(0, 0, 40)));
    expect(save).toHaveLength(2);

    const fresh = harness();
    expect(fresh.mgr.loadJSON(save)).toBe(2);
    const p = fresh.mgr.mobs.find((m) => m.kind === 'pig')!;
    expect(p.health).toBe(4);
    expect(p.yaw).toBeCloseTo(1.25);
    expect(p.body.x).toBeCloseTo(5.5);
    expect(fresh.mgr.mobs.some((m) => m.kind === 'zombie')).toBe(true);
  });

  it('ignores garbage and clamps health', () => {
    const h = harness();
    expect(h.mgr.loadJSON(null)).toBe(0);
    expect(h.mgr.loadJSON([{ kind: 'dragon', x: 0, y: 1, z: 0 }, { kind: 'pig', x: 'a', y: 1, z: 0 }, 5, null])).toBe(0);
    h.mgr.loadJSON([{ kind: 'pig', x: 1, y: 1, z: 1, yaw: 0, health: 9999 }]);
    expect(h.mgr.mobs[0].health).toBe(h.mgr.mobs[0].def.health);
  });

  it('honours the limit', () => {
    const h = harness();
    for (let i = 0; i < 10; i++) h.mgr.spawn('pig', i, 1, 0);
    expect(h.mgr.toJSON(0, 0, 50, 4)).toHaveLength(4);
  });
});

describe('skeleton', () => {
  it('shoots arrows that hit the player', () => {
    const h = harness();
    h.mgr.spawn('skeleton', 9.5, 1, 0.5);
    h.run(10);
    expect(h.log.sounds).toContain('shoot');
    const arrowHits = h.log.hits.filter((x) => x.source === 'arrow');
    expect(arrowHits.length).toBeGreaterThanOrEqual(1);
    expect(arrowHits[0].amount).toBe(3);
  });

  it('does not shoot through walls', () => {
    const w = flat();
    for (let z = -6; z <= 6; z++) for (let y = 1; y <= 8; y++) w.set(4, y, z, B.STONE);
    for (let z = -6; z <= 6; z++) for (let y = 1; y <= 8; y++) w.set(5, y, z, B.STONE);
    const h = harness({ world: w });
    h.mgr.spawn('skeleton', 9.5, 1, 0.5);
    h.run(2); // before it can path around
    expect(h.log.sounds).not.toContain('shoot');
    expect(h.mgr.arrows).toHaveLength(0);
  });

  it('arrows are stopped by blocks and expire', () => {
    const w = flat();
    for (let y = 1; y <= 4; y++) w.set(6, y, 0, B.STONE);
    const h = harness({ world: w, invulnerable: true });
    const s = h.mgr.spawn('skeleton', 12.5, 1, 0.5);
    s.shootCooldown = 0;
    h.player.invulnerable = false;
    h.player.x = 0.5;
    // Skeleton can't see through the pillar only on one line; force an arrow straight at it.
    h.mgr.arrows.push({ x: 10, y: 2, z: 0.5, vx: -20, vy: 0, vz: 0, age: 0, damage: 3 } as never);
    h.run(1);
    expect(h.log.hits.filter((x) => x.source === 'arrow')).toHaveLength(0);
  });
});

describe('sky and light queries', () => {
  it('detect cover and light sources', () => {
    const w = flat();
    expect(isExposedToSky(w, 5, 1, 5)).toBe(true);
    w.set(5, 10, 5, B.STONE);
    expect(isExposedToSky(w, 5, 1, 5)).toBe(false);
    expect(nearLight(w, 5, 1, 5, 5)).toBe(false);
    w.set(7, 2, 5, B.GLOWSTONE);
    expect(nearLight(w, 5, 1, 5, 5)).toBe(true);
    expect(nearLight(w, 5, 1, 5, 1)).toBe(false);
  });
});

describe('spawner', () => {
  const spawnMany = (daylight: number, world = flat(), seconds = 120, seed = 11) => {
    const h = harness({ daylight, world, seed });
    const sp = new MobSpawner();
    for (let t = 0; t < seconds; t += 0.6) {
      sp.update(0.6, h.mgr, { world, player: h.player, daylight, rand: h.rand });
    }
    return h;
  };

  it('spawns only passive mobs, on grass, in daylight', () => {
    const h = spawnMany(1);
    expect(h.mgr.mobs.length).toBeGreaterThan(0);
    for (const m of h.mgr.mobs) {
      expect(m.def.hostile).toBe(false);
      expect(h.world.getBlock(Math.floor(m.body.x), Math.floor(m.body.y) - 1, Math.floor(m.body.z))).toBe(B.GRASS);
    }
  });

  it('spawns only hostile mobs on an exposed surface at night, at a distance', () => {
    const h = spawnMany(0.05);
    expect(h.mgr.mobs.length).toBeGreaterThan(0);
    for (const m of h.mgr.mobs) {
      expect(m.def.hostile).toBe(true);
      expect(dist(m.body, h.player)).toBeGreaterThanOrEqual(18);
    }
  });

  it('respects the caps', () => {
    const h = spawnMany(0.05, flat(), 600);
    expect(h.mgr.mobs.length).toBeLessThanOrEqual(16);
    const d = spawnMany(1, flat(), 600);
    expect(d.mgr.mobs.length).toBeLessThanOrEqual(10);
  });

  it('light sources prevent monster spawns around them', () => {
    // A field of glowstone posts every 4 blocks lights every cell within radius 5.
    const w = flat();
    for (let x = -80; x <= 80; x += 4) for (let z = -80; z <= 80; z += 4) w.set(x, 1, z, B.GLOWSTONE);
    const h = spawnMany(0.05, w, 200);
    expect(h.mgr.mobs).toHaveLength(0);
  });

  it('spawns monsters in dark caves even at midday', () => {
    const w = flat();
    // Roof the whole area so everything is underground.
    for (let x = -60; x <= 60; x++) for (let z = -60; z <= 60; z++) w.set(x, 6, z, B.STONE);
    const h = spawnMany(1, w, 200);
    const hostile = h.mgr.mobs.filter((m) => m.def.hostile);
    expect(hostile.length).toBeGreaterThan(0);
    // Only bats (ambient, they live in caves) share the dark with them; nothing grazes underground.
    expect(h.mgr.mobs.filter((m) => !m.def.hostile && !m.def.ambient)).toHaveLength(0);
  });
});

describe('player hurt cooldown', () => {
  it('ignores a second mob hit within half a second but not other damage', () => {
    const v = new Vitals();
    v.damage(3, 'mob');
    v.damage(3, 'mob');
    expect(v.health).toBe(17);
    v.damage(2, 'fall');
    expect(v.health).toBe(15);
    v.tick(0.6, { eyeInWater: false, invulnerable: false });
    v.damage(3, 'mob');
    // 15 (+ a little natural regeneration during the tick) - 3
    expect(v.health).toBeLessThanOrEqual(13);
    expect(v.health).toBeGreaterThanOrEqual(12);
  });
});
