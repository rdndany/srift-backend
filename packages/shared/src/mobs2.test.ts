import { describe, expect, it } from 'vitest';
import { B } from './blocks';
import { I } from './items';
import { MOBS, MobManager, MobSpawner, SLIME_SIZES, isOpenToSky, type MobEnv, type MobEvents, type MobKind } from './mobs';
import { mulberry32 } from './noise';
import type { BlockReader } from './physics';

/** Flat grass world with optional per-cell edits. */
function flat(ground: number = B.GRASS, edits: Record<string, number> = {}) {
  const m = new Map(Object.entries(edits));
  return {
    getBlock: (x: number, y: number, z: number) => m.get(`${x},${y},${z}`) ?? (y < 0 ? B.STONE : y === 0 ? ground : B.AIR),
    set: (x: number, y: number, z: number, id: number) => void m.set(`${x},${y},${z}`, id),
  } satisfies BlockReader & { set: (x: number, y: number, z: number, id: number) => void };
}

function harness(opts: { daylight?: number; invulnerable?: boolean; world?: BlockReader; seed?: number } = {}) {
  const world = opts.world ?? flat();
  const player = { x: 0.5, y: 1, z: 0.5, alive: true, invulnerable: opts.invulnerable ?? false, yaw: undefined as number | undefined, pitch: undefined as number | undefined };
  const rand = mulberry32(opts.seed ?? 7);
  const env: MobEnv = { world, player, daylight: opts.daylight ?? 0, rand };
  const log = {
    hits: [] as { amount: number; source: string; effect?: string | readonly string[] }[],
    sounds: [] as string[],
    drops: [] as { id: number; count: number }[],
  };
  const events: MobEvents = {
    hurtPlayer: (amount, _kx, _kz, source, _t, effect) => log.hits.push({ amount, source, effect }),
    explode: () => {},
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
const fixed = (v: number) => () => v;
const high = (extra: (x: number, y: number, z: number) => number | null = () => null): BlockReader => ({
  getBlock: (x, y, z) => extra(x, y, z) ?? (y <= 19 ? B.STONE : B.AIR),
});
const blinksOf = (h: { log: { sounds: string[] } }) => h.log.sounds.filter((s) => s === 'teleport').length;

describe('drops and experience', () => {
  it('sheep give wool and mutton, chickens meat and feathers, rabbits meat, squid ink', () => {
    const sheep = MOBS.sheep.drops(fixed(0.5));
    expect(sheep.some((d) => d.id === B.WOOL)).toBe(true);
    expect(sheep.some((d) => d.id === I.MUTTON)).toBe(true);
    const chicken = MOBS.chicken.drops(fixed(0.99));
    expect(chicken.some((d) => d.id === I.CHICKEN)).toBe(true);
    expect(chicken.some((d) => d.id === I.FEATHER)).toBe(true);
    expect(MOBS.rabbit.drops(fixed(0.1)).some((d) => d.id === I.RABBIT)).toBe(true);
    expect(MOBS.squid.drops(fixed(0.5)).every((d) => d.id === I.INK_SAC && d.count >= 1)).toBe(true);
  });

  it('spiders give string and sometimes an eye; endermen sometimes a pearl', () => {
    for (const k of ['spider', 'cave_spider'] as const) {
      const d = MOBS[k].drops(fixed(0.99));
      expect(d.some((x) => x.id === I.STRING)).toBe(true);
      expect(d.some((x) => x.id === I.SPIDER_EYE)).toBe(false);
      expect(MOBS[k].drops(fixed(0.01)).some((x) => x.id === I.SPIDER_EYE)).toBe(true);
    }
    expect(MOBS.enderman.drops(fixed(0.1))).toEqual([{ id: I.ENDER_PEARL, count: 1 }]);
    expect(MOBS.enderman.drops(fixed(0.9))).toEqual([]);
  });

  it('only the smallest slimes drop slimeballs, and every size pays its size in experience', () => {
    expect(MOBS.slime.drops(fixed(0.99), { size: 1, variant: 0 }).every((d) => d.id === I.SLIMEBALL)).toBe(true);
    expect(MOBS.slime.drops(fixed(0.99), { size: 1, variant: 0 }).length).toBe(1);
    expect(MOBS.slime.drops(fixed(0.99), { size: 2, variant: 0 })).toEqual([]);
    expect(MOBS.slime.drops(fixed(0.99), { size: 4, variant: 0 })).toEqual([]);
    for (const s of SLIME_SIZES) expect(MOBS.slime.xp(fixed(0), { size: s, variant: 0 })).toBe(s);
  });

  it('husks and drowned drop rotten flesh, strays bones and arrows, bats nothing', () => {
    expect(MOBS.husk.drops(fixed(0.99)).every((d) => d.id === I.ROTTEN_FLESH)).toBe(true);
    expect(MOBS.drowned.drops(fixed(0.99)).some((d) => d.id === I.ROTTEN_FLESH)).toBe(true);
    const stray = MOBS.stray.drops(fixed(0.99));
    expect(stray.some((d) => d.id === I.BONE)).toBe(true);
    expect(stray.some((d) => d.id === I.ARROW)).toBe(true);
    expect(MOBS.bat.drops(fixed(0.5))).toEqual([]);
    expect(MOBS.bat.xp(fixed(0.5))).toBe(0);
  });

  it('every dropped id is a real item or block', () => {
    for (const kind of Object.keys(MOBS) as MobKind[]) {
      for (const r of [0.01, 0.5, 0.99]) {
        for (const d of MOBS[kind].drops(fixed(r), { size: 1, variant: 0 })) {
          expect(d.id, `${kind}`).toBeGreaterThan(0);
          expect(d.count).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('spiders', () => {
  it('climb a wall that blocks the way', () => {
    const w = flat();
    for (let z = -60; z <= 60; z++) for (let y = 1; y <= 3; y++) w.set(4, y, z, B.STONE);
    const h = harness({ world: w });
    const s = h.mgr.spawn('spider', 8.5, 1, 0.5);
    h.run(14);
    expect(s.body.x).toBeLessThan(4);
    expect(dist(s.body, h.player)).toBeLessThan(2.2);
  });

  it('a zombie cannot cross that wall', () => {
    const w = flat();
    for (let z = -60; z <= 60; z++) for (let y = 1; y <= 3; y++) w.set(4, y, z, B.STONE);
    const h = harness({ world: w });
    const z = h.mgr.spawn('zombie', 8.5, 1, 0.5);
    h.run(14);
    expect(z.body.x).toBeGreaterThan(4);
  });

  it('are calm in daylight until hurt, and hunt at night', () => {
    const day = harness({ daylight: 1 });
    day.mgr.spawn('spider', 4.5, 1, 0.5);
    day.run(6);
    expect(day.log.hits).toHaveLength(0);

    const night = harness({ daylight: 0 });
    night.mgr.spawn('spider', 4.5, 1, 0.5);
    night.run(6);
    expect(night.log.hits.length).toBeGreaterThan(0);
    expect(night.log.hits[0].effect).toBeUndefined();
  });

  it('an angry spider hunts even in the sun', () => {
    const h = harness({ daylight: 1 });
    const s = h.mgr.spawn('spider', 5.5, 1, 0.5);
    h.mgr.damage(s, 1, 1, 0, h.events, true, false, true);
    h.run(6);
    expect(h.log.hits.length).toBeGreaterThan(0);
  });

  it('cave spiders poison, and do it even by day', () => {
    const h = harness({ daylight: 1 });
    h.mgr.spawn('cave_spider', 3.5, 1, 0.5);
    h.run(6);
    expect(h.log.hits.length).toBeGreaterThan(0);
    expect(h.log.hits.every((x) => x.effect === 'poison' && x.source === 'cave_spider')).toBe(true);
  });
});

describe('slimes', () => {
  it('burst into smaller slimes, down to the smallest', () => {
    const h = harness({ invulnerable: true });
    const big = h.mgr.spawn('slime', 5.5, 1, 0.5, { size: 4 });
    expect(big.size).toBe(4);
    h.mgr.damage(big, 99, 1, 0, h.events, true, false, true);
    const kids = h.mgr.mobs.filter((m) => m.kind === 'slime' && !m.dead);
    expect(kids.length).toBeGreaterThanOrEqual(2);
    expect(kids.length).toBeLessThanOrEqual(4);
    expect(kids.every((m) => m.size === 2)).toBe(true);
    for (const k of kids) h.mgr.damage(k, 99, 1, 0, h.events, true, false, true);
    const tiny = h.mgr.mobs.filter((m) => m.kind === 'slime' && !m.dead);
    expect(tiny.length).toBeGreaterThanOrEqual(4);
    expect(tiny.every((m) => m.size === 1)).toBe(true);
    for (const t of tiny) h.mgr.damage(t, 99, 1, 0, h.events, true, false, true);
    expect(h.mgr.mobs.filter((m) => m.kind === 'slime' && !m.dead)).toHaveLength(0);
  });

  it('hop towards the player rather than walking', () => {
    const h = harness();
    const s = h.mgr.spawn('slime', 8.5, 1, 0.5, { size: 2 });
    let airborne = 0;
    let frames = 0;
    for (let t = 0; t < 6; t += 1 / 30) {
      h.mgr.update(1 / 30, h.env, h.events);
      frames++;
      if (!s.body.onGround) airborne++;
    }
    expect(airborne).toBeGreaterThan(frames * 0.1);
    expect(airborne).toBeLessThan(frames * 0.9);
    expect(s.body.x).toBeLessThan(8);
  });

  it('survive a round trip through a save with their size', () => {
    const h = harness();
    h.mgr.spawn('slime', 5.5, 1, 0.5, { size: 4 });
    const saved = h.mgr.toJSON(5, 5, 20);
    const other = new MobManager(mulberry32(1));
    expect(other.loadJSON(saved)).toBe(1);
    expect(other.mobs[0].size).toBe(4);
  });
});

describe('endermen', () => {
  it('ignore a player who does not look at them', () => {
    const h = harness();
    h.player.yaw = Math.PI; // facing +z, away from the enderman
    h.player.pitch = 0;
    h.mgr.spawn('enderman', 0.5, 1, -8.5);
    h.run(8);
    expect(h.log.hits).toHaveLength(0);
  });

  it('go for a player who stares at them', () => {
    const h = harness();
    h.player.yaw = 0; // yaw 0 faces -z
    h.player.pitch = Math.atan2(3.47 - 2.62, 9);
    const e = h.mgr.spawn('enderman', 0.5, 1, -8.5);
    h.run(0.5);
    expect(e.aggro).toBe(true);
    h.run(8);
    expect(h.log.hits.length).toBeGreaterThan(0);
    expect(h.log.hits[0]).toMatchObject({ amount: 7, source: 'enderman' });
  });

  it('cannot be stared at through a wall', () => {
    const w = flat();
    for (let y = 1; y <= 4; y++) for (let x = -2; x <= 2; x++) w.set(x, y, -4, B.STONE);
    const h = harness({ world: w });
    h.player.yaw = 0;
    h.player.pitch = Math.atan2(3.47 - 2.62, 9);
    const e = h.mgr.spawn('enderman', 0.5, 1, -8.5);
    h.run(1);
    expect(e.aggro).toBe(false);
  });

  // Blinking looks for ground below a few blocks above, so the floor must be well clear of the world's bottom (see high).
  const blinks = (h: ReturnType<typeof harness>) => h.log.sounds.filter((s) => s === 'teleport').length;

  it('stand and fight when hit: a sword does not make them blink away', () => {
    const h = harness({ world: high() });
    h.player.y = 20;
    const e = h.mgr.spawn('enderman', 2.5, 20, 0.5);
    for (let i = 0; i < 6; i++) {
      h.mgr.damage(e, 1, 1, 0, h.events, true, true, true);
      h.run(0.5);
    }
    expect(blinks(h)).toBe(0);
    expect(e.aggro).toBe(true);
    expect(e.dead).toBe(false);
    // And while the fight is on they do not wander off on their own either.
    h.run(20);
    expect(blinks(h)).toBe(0);
    expect(dist(e.body, h.player)).toBeLessThan(6);
  });

  it('blink toward a hunted player who is far away, but only then', () => {
    const h = harness({ invulnerable: false, world: high() });
    h.player.y = 20;
    const e = h.mgr.spawn('enderman', 36.5, 20, 0.5);
    e.aggro = true;
    e.teleportTimer = 0; // ready to blink
    h.run(0.5);
    expect(blinks(h)).toBe(1);
    expect(dist(e.body, h.player)).toBeLessThan(10);
  });

  it('blink out of the way of arrows (almost always, taking no damage) and then hunt the archer', () => {
    const h = harness({ invulnerable: true, world: high() });
    h.player.y = 20;
    const e = h.mgr.spawn('enderman', 6.5, 20, 0.5);
    let dodged = 0;
    for (let n = 0; n < 12; n++) {
      const before = blinks(h);
      const hp = e.health;
      h.mgr.shootArrow(0.5, 21.2, 0.5, 1, 0, 0, 1);
      h.run(0.25);
      if (blinks(h) > before && e.health === hp) dodged++;
      e.body.x = 6.5;
      e.body.z = 0.5;
      e.body.y = 20;
    }
    expect(dodged).toBeGreaterThanOrEqual(8);
    expect(e.aggro).toBe(true);
  });

  it('blink away from water', () => {
    const lake = high((x, y, z) => (y >= 20 && y <= 22 && Math.abs(x - 20) <= 3 && Math.abs(z) <= 3 ? B.WATER : null));
    const h = harness({ invulnerable: true, world: lake });
    h.player.y = 20;
    const e = h.mgr.spawn('enderman', 20.5, 20, 0.5);
    for (let i = 0; i < 40 && blinks(h) === 0; i++) h.run(0.2);
    expect(blinks(h)).toBeGreaterThan(0);
    expect(e.dead).toBe(false);
  });

  it('by day an enderman in the open slips off to cover, and one that finds none leaves', () => {
    // A big roof of stone over a field to the east.
    const roofed = high((x, y, z) => (y === 25 && x >= 8 && x <= 40 && Math.abs(z) <= 16 ? B.STONE : null));
    const h = harness({ invulnerable: true, world: roofed, daylight: 1 });
    h.player.y = 20;
    const e = h.mgr.spawn('enderman', 0.5, 20, 0.5);
    h.run(25);
    expect(blinks(h)).toBeGreaterThan(0);
    expect(isOpenToSky(roofed, e.body.x, e.body.y + e.height, e.body.z)).toBe(false);

    const bare = harness({ invulnerable: true, world: high(), daylight: 1 });
    bare.player.y = 20;
    const lost = bare.mgr.spawn('enderman', 40.5, 20, 0.5); // far from the player, nowhere to hide
    bare.run(60);
    expect(bare.mgr.mobs.includes(lost)).toBe(false);

    // Leaves are not cover from the daylight, but at night nothing sends it away.
    const night = harness({ invulnerable: true, world: high(), daylight: 0 });
    night.player.y = 20;
    night.mgr.spawn('enderman', 40.5, 20, 0.5);
    night.run(30);
    expect(night.mgr.mobs.length).toBe(1);
  });
});

describe('being hit', () => {
  it('only endermen ever jump about; nobody else is moved by more than a knockback', () => {
    for (const kind of Object.keys(MOBS) as MobKind[]) {
      const world = high();
      const h = harness({ invulnerable: true, world });
      h.player.y = 20;
      const m = h.mgr.spawn(kind, 4.5, kind === 'squid' || kind === 'bat' ? 20 : 20, 0.5, kind === 'slime' ? { size: 2 } : {});
      if (kind === 'squid') continue; // lives in water only
      let worst = 0;
      for (let i = 0; i < 8; i++) {
        h.mgr.damage(m, 0.5, 1, 0, h.events, true, true, true);
        for (let s = 0; s < 8; s++) {
          const x = m.body.x;
          const y = m.body.y;
          const z = m.body.z;
          h.run(1 / 30);
          worst = Math.max(worst, Math.hypot(m.body.x - x, m.body.y - y, m.body.z - z));
        }
        if (m.dead) break;
      }
      expect(worst, kind).toBeLessThan(1.2);
      expect(blinksOf(h), kind).toBe(0);
    }
  });
});
describe('creatures of the air, the sea and the sun', () => {
  it('a bat flutters about in the air without falling', () => {
    const h = harness({ invulnerable: true });
    const b = h.mgr.spawn('bat', 5.5, 6, 5.5);
    const seen = new Set<string>();
    for (let t = 0; t < 8; t += 0.25) {
      h.run(0.25);
      seen.add(`${Math.round(b.body.x)},${Math.round(b.body.z)}`);
    }
    expect(b.dead).toBe(false);
    expect(b.body.y).toBeGreaterThan(1.2);
    expect(seen.size).toBeGreaterThan(2);
  });

  it('a squid keeps to the water it was born in', () => {
    const world: BlockReader = {
      getBlock: (x, y, z) => (y < 0 ? B.STONE : y <= 6 && Math.abs(x) <= 10 && Math.abs(z) <= 10 ? B.WATER : B.AIR),
    };
    const h = harness({ world, invulnerable: true });
    h.player.x = 40;
    const s = h.mgr.spawn('squid', 0.5, 3, 0.5);
    let moved = 0;
    for (let t = 0; t < 20; t += 0.25) {
      const x = s.body.x;
      const z = s.body.z;
      h.run(0.25);
      moved += Math.hypot(s.body.x - x, s.body.z - z);
      expect(world.getBlock(Math.floor(s.body.x), Math.floor(s.body.y + 0.4), Math.floor(s.body.z)), `t=${t}`).toBe(B.WATER);
    }
    expect(moved).toBeGreaterThan(1);
  });

  it('a chicken floats down instead of dropping', () => {
    const h = harness({ invulnerable: true });
    const c = h.mgr.spawn('chicken', 5.5, 30, 5.5);
    const p = h.mgr.spawn('pig', 8.5, 30, 5.5);
    let cMin = 0;
    let pMin = 0;
    for (let t = 0; t < 1.2; t += 1 / 30) {
      h.mgr.update(1 / 30, h.env, h.events);
      cMin = Math.min(cMin, c.body.vy);
      pMin = Math.min(pMin, p.body.vy);
    }
    expect(cMin).toBeGreaterThan(pMin * 0.6);
    expect(cMin).toBeGreaterThan(-6);
    h.run(10);
    expect(c.body.y).toBeLessThan(2);
    expect(c.dead).toBe(false);
  });

  it('husks shrug off the sun that burns zombies', () => {
    const h = harness({ daylight: 1, invulnerable: true });
    const husk = h.mgr.spawn('husk', 10.5, 1, 0.5);
    const zombie = h.mgr.spawn('zombie', -10.5, 1, 0.5);
    h.run(30);
    expect(husk.health).toBe(husk.maxHealth);
    expect(zombie.dead || zombie.health < zombie.maxHealth).toBe(true);
  });

  it('husks and drowned hit like zombies; strays shoot like skeletons', () => {
    const a = harness();
    a.mgr.spawn('husk', 5.5, 1, 0.5);
    a.run(6);
    expect(a.log.hits[0]).toMatchObject({ amount: 3, source: 'husk' });

    const b = harness();
    b.mgr.spawn('drowned', 5.5, 1, 0.5);
    b.run(6);
    expect(b.log.hits[0]).toMatchObject({ amount: 3, source: 'drowned' });

    const c = harness();
    c.mgr.spawn('stray', 9.5, 1, 0.5);
    c.run(6);
    expect(c.log.sounds).toContain('shoot');
  });
});

describe('rabbits', () => {
  it('survive a save with their coat', () => {
    const h = harness();
    h.mgr.spawn('rabbit', 5.5, 1, 5.5, { variant: 2 });
    const other = new MobManager(mulberry32(1));
    other.loadJSON(h.mgr.toJSON(5, 5, 20));
    expect(other.mobs[0].variant).toBe(2);
  });

  it('run from a hit', () => {
    const h = harness({ invulnerable: true });
    const r = h.mgr.spawn('rabbit', 3.5, 1, 0.5);
    h.mgr.damage(r, 1, 1, 0, h.events, true, true, true);
    h.run(3);
    expect(dist(r.body, h.player)).toBeGreaterThan(5);
  });
});

describe('who spawns where', () => {
  /** Draw many spawns on one kind of ground; the mob list is cleared between attempts so the caps never bite. */
  function census(opts: { ground?: BlockReader; daylight: number; world?: BlockReader; slime?: boolean; tries?: number; y?: number }) {
    const world = opts.world ?? opts.ground ?? flat();
    const rand = mulberry32(11);
    const mgr = new MobManager(rand);
    const sp = new MobSpawner();
    const counts = new Map<MobKind, number>();
    const variants = new Map<number, number>();
    const player = { x: 0.5, y: opts.y ?? 1, z: 0.5 };
    for (let i = 0; i < (opts.tries ?? 500); i++) {
      mgr.mobs.length = 0;
      const out = sp.update(1, mgr, { world, player, daylight: opts.daylight, rand, slimeChunk: opts.slime ? () => true : undefined });
      for (const m of out) {
        counts.set(m.kind, (counts.get(m.kind) ?? 0) + 1);
        if (m.kind === 'rabbit') variants.set(m.variant, (variants.get(m.variant) ?? 0) + 1);
      }
    }
    return { counts, variants, kinds: new Set(counts.keys()) };
  }

  const wide = (ground: number) => flat(ground) as BlockReader;

  it('husks, not zombies, on desert sand at night', () => {
    const c = census({ ground: wide(B.SAND), daylight: 0 });
    expect(c.kinds.has('husk')).toBe(true);
    expect(c.kinds.has('zombie')).toBe(false);
    expect(c.kinds.has('stray')).toBe(false);
  });

  it('strays, not zombies, on snow at night', () => {
    const c = census({ ground: wide(B.SNOW), daylight: 0 });
    expect(c.kinds.has('stray')).toBe(true);
    expect(c.kinds.has('husk')).toBe(false);
  });

  it('zombies, spiders and the odd enderman on grass at night; no husks or strays', () => {
    const c = census({ ground: wide(B.GRASS), daylight: 0, tries: 800 });
    for (const k of ['zombie', 'skeleton', 'creeper', 'spider'] as const) expect(c.kinds.has(k), k).toBe(true);
    expect(c.kinds.has('husk')).toBe(false);
    expect(c.kinds.has('stray')).toBe(false);
    expect(c.kinds.has('slime')).toBe(false);
  });

  it('farm animals graze on grass by day, with rabbits in the mix', () => {
    const c = census({ ground: wide(B.GRASS), daylight: 1, tries: 800 });
    for (const k of ['pig', 'cow', 'sheep', 'chicken', 'rabbit', 'horse', 'fox'] as const) expect(c.kinds.has(k), k).toBe(true);
    expect(c.variants.get(0)).toBeGreaterThan(0);
  });

  it('mooshrooms graze a mushroom field', () => {
    const c = census({ ground: wide(B.MYCELIUM), daylight: 1, tries: 200 });
    expect(c.kinds.has('mooshroom')).toBe(true);
    expect(c.kinds.has('pig')).toBe(false);
  });

  it('a forest floor is daylight: nothing hostile spawns under thin leaves by day, animals do', () => {
    const canopy = (layers: number): BlockReader => {
      const w = flat();
      return { getBlock: (x, y, z) => (y >= 6 && y < 6 + layers ? B.LEAVES : w.getBlock(x, y, z)) };
    };
    const thin = census({ world: canopy(2), daylight: 1, tries: 800, y: 1 });
    for (const k of ['zombie', 'skeleton', 'creeper', 'spider', 'enderman'] as const) expect(thin.kinds.has(k), k).toBe(false);
    expect(thin.kinds.has('cow') || thin.kinds.has('sheep') || thin.kinds.has('pig')).toBe(true);
    // Under a deep canopy (eight leaves or more) it really is dark.
    const deep = census({ world: canopy(9), daylight: 1, tries: 800, y: 1 });
    expect(deep.kinds.has('zombie') || deep.kinds.has('skeleton') || deep.kinds.has('spider')).toBe(true);
    // And at night the same thin forest does spawn them.
    const night = census({ world: canopy(2), daylight: 0, tries: 800, y: 1 });
    expect(night.kinds.has('zombie')).toBe(true);
  });

  it('endermen come out only in the dark: never on open ground by day', () => {
    const day = census({ ground: wide(B.GRASS), daylight: 1, tries: 3000 });
    expect(day.kinds.has('enderman')).toBe(false);
    const dusk = census({ ground: wide(B.SNOW), daylight: 0.3, tries: 3000 });
    // Dusk still counts as dark enough; this only checks the spawner does not break on it.
    expect([...dusk.kinds].every((k) => k !== 'husk')).toBe(true);
  });
  it('white rabbits on snow, sandy ones on sand, and no pigs on either', () => {
    const snow = census({ ground: wide(B.SNOW), daylight: 1, tries: 800 });
    expect([...snow.variants.keys()]).toEqual([1]);
    expect(snow.kinds.has('pig')).toBe(false);
    const sand = census({ ground: wide(B.SAND), daylight: 1, tries: 1200 });
    expect([...sand.variants.keys()]).toEqual([2]);
    expect(sand.kinds.has('cow')).toBe(false);
  });

  it('only slime chunks breed slimes, and only deep underground', () => {
    // A cave 3 blocks high, 90 across, sealed in stone.
    const cave: BlockReader = {
      getBlock: (x, y, z) => (y >= 1 && y <= 3 && Math.abs(x) <= 45 && Math.abs(z) <= 45 ? B.AIR : B.STONE),
    };
    const yes = census({ world: cave, daylight: 0, slime: true, tries: 600 });
    expect(yes.kinds.has('slime')).toBe(true);
    const no = census({ world: cave, daylight: 0, slime: false, tries: 600 });
    expect(no.kinds.has('slime')).toBe(false);
    // The same chunk on the surface stays slime-free.
    const sky = census({ ground: wide(B.GRASS), daylight: 0, slime: true, tries: 400 });
    expect(sky.kinds.has('slime')).toBe(false);
  });

  it('squid in deep water, drowned on the shore after dark, none in a puddle', () => {
    // Open sea on the west, a grass bank on the east. The bank top sits at the waterline.
    const sea: BlockReader = { getBlock: (x, y) => (y <= 10 ? B.STONE : x >= 0 ? (y <= 30 ? B.GRASS : B.AIR) : y <= 30 ? B.WATER : B.AIR) };
    const player = { x: 2.5, y: 31, z: 0.5 };
    const run = (daylight: number, world: BlockReader) => {
      const rand = mulberry32(3);
      const mgr = new MobManager(rand);
      const sp = new MobSpawner();
      const kinds = new Set<MobKind>();
      const drowned: { x: number; y: number; z: number }[] = [];
      for (let i = 0; i < 500; i++) {
        mgr.mobs.length = 0;
        for (const m of sp.update(1, mgr, { world, player, daylight, rand })) {
          kinds.add(m.kind);
          if (m.kind === 'drowned') drowned.push({ x: m.body.x, y: m.body.y, z: m.body.z });
        }
      }
      return { kinds, drowned };
    };
    const day = run(1, sea);
    expect(day.kinds.has('squid')).toBe(true);
    expect(day.kinds.has('cod') || day.kinds.has('salmon')).toBe(true);
    expect(day.kinds.has('drowned')).toBe(false);
    const night = run(0, sea);
    expect(night.kinds.has('squid')).toBe(true);
    expect(night.drowned.length).toBeGreaterThan(0);
    for (const d of night.drowned) {
      const bx = Math.floor(d.x);
      const by = Math.floor(d.y);
      expect(sea.getBlock(bx, by, Math.floor(d.z))).toBe(B.AIR);
      expect(sea.getBlock(bx, by - 1, Math.floor(d.z))).toBe(B.GRASS);
    }
    for (const k of ['cow', 'pig', 'sheep'] as const) expect(night.kinds.has(k), k).toBe(false);

    const puddle: BlockReader = { getBlock: (x, y) => (y <= 10 ? B.STONE : y <= 11 ? B.WATER : B.AIR) };
    const dry = run(0, puddle);
    expect(dry.kinds.has('squid')).toBe(false);
    expect(dry.kinds.has('drowned')).toBe(false);
  });

  it('bats only in dark, covered air', () => {
    const cave: BlockReader = {
      getBlock: (x, y, z) => (y >= 5 && y <= 12 && Math.abs(x) <= 45 && Math.abs(z) <= 45 ? B.AIR : B.STONE),
    };
    const c = census({ world: cave, daylight: 0, y: 6, tries: 400 });
    expect(c.kinds.has('bat')).toBe(true);
    const open = census({ ground: wide(B.GRASS), daylight: 0, y: 6, tries: 400 });
    expect(open.kinds.has('bat')).toBe(false);
  });
});

describe('leaving the water', () => {
  /** A pool (water up to y 4) beside a bank whose top is at y 5, with the player on the bank. */
  const pool: BlockReader = { getBlock: (x, y) => (y <= 0 ? B.STONE : x >= 1 ? (y < 5 ? B.STONE : B.AIR) : y <= 3 ? B.WATER : B.AIR) };

  it.each(['zombie', 'husk', 'spider', 'drowned'] as const)('a %s hunting from the water climbs onto the bank', (kind) => {
    const h = harness({ world: pool, invulnerable: false });
    h.player.x = 4.5;
    h.player.y = 5;
    const m = h.mgr.spawn(kind, -4.5, 1, 0.5);
    h.run(14);
    expect(m.body.x, kind).toBeGreaterThan(1);
    expect(m.body.y, kind).toBeGreaterThanOrEqual(4.9);
  });

  it('a pig or chicken that swims into the sea comes back onto the bank', () => {
    const sea: BlockReader = { getBlock: (x, y) => (y <= 0 ? B.STONE : x >= 0 ? (y < 5 ? B.STONE : B.AIR) : y <= 4 ? B.WATER : B.AIR) };
    const h = harness({ world: sea, invulnerable: true });
    h.player.x = 30;
    const pig = h.mgr.spawn('pig', -4.5, 2, 0.5);
    const chicken = h.mgr.spawn('chicken', -4.5, 2, 3.5);
    h.run(25);
    for (const m of [pig, chicken]) {
      expect(m.body.x, m.kind).toBeGreaterThan(0);
      expect(m.body.y, m.kind).toBeGreaterThanOrEqual(4.9);
    }
  });

  it('a wandering pig or sheep also finds its way out of a pond', () => {
    const small: BlockReader = { getBlock: (x, y, z) => (y <= 0 ? B.STONE : Math.abs(x) <= 2 && Math.abs(z) <= 2 ? (y <= 3 ? B.WATER : B.AIR) : y < 5 ? B.STONE : B.AIR) };
    const h = harness({ world: small, invulnerable: true });
    h.player.x = 40;
    const pig = h.mgr.spawn('pig', 0.5, 1, 0.5);
    const sheep = h.mgr.spawn('sheep', -0.5, 1, 0.5);
    h.run(60);
    for (const m of [pig, sheep]) expect(m.body.y, m.kind).toBeGreaterThanOrEqual(4.9);
  });
});