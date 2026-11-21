import { describe, expect, it } from 'vitest';
import {
  ADVENTURE_SEED,
  B,
  BossBrain,
  DUNGEON_MIN_LEVEL,
  GameSession,
  HeadlessWorld,
  I,
  INSTANCE_STRIDE,
  KING,
  KING_STRIDE,
  MOBS,
  Mob,
  Player,
  makeGenerator,
  makeStack,
  mulberry32,
  totalForLevel,
  type AdventureWorldGenerator,
  type BossArenaDef,
  type BossTarget,
  type BossFx,
  type BossWorld,
  type FxKind,
  type InputFrame,
} from './index';

const idle = (): InputFrame => ({ t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false });

const generator = makeGenerator(ADVENTURE_SEED, 'adventure') as AdventureWorldGenerator;

function make(seed = 9) {
  const world = new HeadlessWorld(generator);
  const s = new GameSession({ seed: ADVENTURE_SEED, world, generator, naturalSpawning: true, rand: mulberry32(seed) });
  s.finishLoading();
  s.xp.add(totalForLevel(DUNGEON_MIN_LEVEL));
  s.inventory.collect(makeStack(I.HOLLOW_SIGIL, 8));
  return { s, world, realm: s.realm };
}

const run = (s: GameSession, seconds: number): void => {
  for (let i = 0; i < Math.round(seconds * 20); i++) s.tick(idle());
};

/** Everybody here is a spectator of the world: the player stands where they are put and nothing hurts them. */
function inCopy(s: GameSession): number {
  s.realm.usePortal(s);
  return s.realm.copyAt(s);
}

describe('a dungeon stays cleared', () => {
  const posted = (realm: ReturnType<typeof make>['realm']) => realm.mobs.mobs.filter((m) => !m.dead && m.guard && generator.instanceAt(m.body.x, m.body.z) === 0);

  it('stands its monsters in their places once, and never makes another', () => {
    const { s, realm } = make();
    const slot = inCopy(s);
    expect(slot).toBe(0);
    const all = posted(realm);
    expect(all.length).toBe(generator.instanceMobs(0).length);
    for (const m of all) expect(m.bound).toBe(true);

    // Kill every one of them and wait: nothing comes back, and not when the portal is used again either (the copy is still open).
    for (const m of all) realm.mobs.damage(m, 9999, 0, 0, realm.mobEvents, false);
    run(s, 60);
    realm.usePortal(s); // out
    s.portalCooldown = 0;
    realm.usePortal(s); // and in again
    expect(realm.copyAt(s)).toBe(0);
    run(s, 40);
    expect(realm.mobs.mobs.filter((m) => !m.dead && generator.instanceAt(m.body.x, m.body.z) === 0 && m.kind !== 'hollow_king' && m.kind !== 'npc').length).toBe(0);
  });

  it('walks its monsters round their posts, 4 to 8 blocks, and no further, until they see somebody', () => {
    const { s, realm } = make();
    inCopy(s);
    const walkers = posted(realm).filter((m) => m.def.hostile && !m.def.flying && m.patrol > 0);
    expect(walkers.length).toBeGreaterThan(70);
    for (const m of posted(realm)) expect(m.patrol, `${m.kind}`).toBeGreaterThan(0);
    for (const m of walkers) {
      expect(m.patrol).toBeGreaterThanOrEqual(4);
      expect(m.patrol).toBeLessThanOrEqual(8);
    }
    // The player stands (out of their sight, behind rock, far from most) while one skeleton or zombie walks its beat.
    const first = walkers.find((m) => m.kind === 'zombie' && Math.hypot(m.homeX - generator.instanceEntry(0)!.x, m.homeZ - generator.instanceEntry(0)!.z) < 45)!;
    expect(first).toBeDefined();
    s.teleport(first.homeX, first.body.y + 30, first.homeZ);
    let far = 0;
    let moved = 0;
    const x0 = first.body.x;
    const z0 = first.body.z;
    for (let i = 0; i < 20 * 60; i++) {
      s.tick(idle());
      if (first.aggro) break;
      far = Math.max(far, Math.hypot(first.body.x - first.homeX, first.body.z - first.homeZ));
      moved = Math.max(moved, Math.hypot(first.body.x - x0, first.body.z - z0));
    }
    expect(moved).toBeGreaterThan(0.5);
    expect(far).toBeLessThanOrEqual(first.patrol + 2);
  });
  it('is given back when the copy is wiped and a new player opens it', () => {
    const { s, realm } = make();
    inCopy(s);
    for (const m of posted(realm)) realm.mobs.damage(m, 9999, 0, 0, realm.mobEvents, false);
    s.teleport(0.5, generator.hubY + 1, 20.5);
    run(s, 100);
    expect(realm.copiesInUse).toBe(0);
    expect(posted(realm).length).toBe(0);
    // A new copy, the same dungeon: all of it is there again.
    inCopy(s);
    expect(posted(realm).length).toBe(generator.instanceMobs(0).length);
  });
});
describe('the Hollow King in his copy', () => {
  it('sits on his throne, once for each copy, and asleep until somebody comes near', () => {
    const { s, realm } = make();
    inCopy(s);
    const kings = realm.mobs.mobs.filter((m) => m.kind === 'hollow_king');
    expect(kings.length).toBe(1);
    const spec = generator.instanceBoss(0)!;
    expect(kings[0].body.x).toBeCloseTo(spec.x, 1);
    expect(kings[0].body.z).toBeCloseTo(spec.z, 1);
    expect(kings[0].def.boss).toBe(true);
    expect(kings[0].bound).toBe(true);
    run(s, 6);
    expect(realm.bossViewFor(s)).toBeNull();
    expect(kings[0].health).toBe(kings[0].maxHealth);
    // Opening the same copy again does not make a second king.
    inCopy(s);
    expect(realm.mobs.mobs.filter((m) => m.kind === 'hollow_king').length).toBe(1);
  });

  it('wakes when somebody enters his hall, and shows the fight on that player\'s boss frame', () => {
    const { s, realm } = make();
    inCopy(s);
    const spec = generator.instanceBoss(0)!;
    s.teleport(spec.arena.x0 + 3.5, spec.y, spec.z, -Math.PI / 2, 0);
    run(s, 2);
    const view = realm.bossViewFor(s);
    expect(view).not.toBeNull();
    expect(view!.name).toBe('The Hollow King');
    expect(view!.phase).toBe(1);
    expect(view!.hp).toBe(1);
    expect(view!.marks.length).toBe(3);
    expect(s.bossView()).toEqual(view);
  });

  it('is a boss: no push, no stun, never wanders off, and leaves a piece of gear for each who fought him', () => {
    const { s, realm } = make();
    inCopy(s);
    const spec = generator.instanceBoss(0)!;
    s.teleport(spec.arena.x0 + 3.5, spec.y, spec.z, -Math.PI / 2, 0);
    run(s, 2);
    const king = realm.mobs.mobs.find((m) => m.kind === 'hollow_king')!;
    const x0 = king.body.x;
    realm.mobs.damage(king, 1, 3, 0, realm.mobEvents, true, true, true);
    expect(king.knockTime).toBe(0);
    king.stunTime = 0;
    realm.mobs.applyStatus(king, { stun: 5, root: 5, slow: { mult: 0.1, seconds: 5 } });
    expect(king.stunTime).toBe(0);
    expect(king.rootTime).toBe(0);
    expect(king.slowTime).toBe(0);
    expect(Math.abs(king.body.x - x0)).toBeLessThan(1);

    const before = realm.drops.drops.length;
    realm.mobs.damage(king, 99999, 0, 0, realm.mobEvents, true, false, true);
    expect(king.dead).toBe(true);
    const gear = realm.drops.drops.slice(before).filter((d) => d.stack.gear && d.stack.gear.r >= 2);
    expect(gear.length).toBeGreaterThanOrEqual(1);
    // He is not made again in this copy.
    run(s, 10);
    expect(realm.mobs.mobs.filter((m) => m.kind === 'hollow_king' && !m.dead).length).toBe(0);
  });

  it('opens a portal out of the dungeon where he fell, which takes the player back to the land, and the tracker shows it', () => {
    const { s, realm } = make();
    inCopy(s);
    const spec = generator.instanceBoss(0)!;
    expect(realm.dungeonViewFor(s)).toMatchObject({ cages: 0, cagesTotal: 3, gates: 0, gatesTotal: 2, boss: 'dormant' });
    s.teleport(spec.arena.x0 + 3.5, spec.y, spec.z, -Math.PI / 2, 0);
    run(s, 2);
    const exit = spec.exit!;
    expect(realm.world.getBlock(exit.x, exit.y, exit.z)).toBe(B.AIR);
    const king = realm.mobs.mobs.find((m) => m.kind === 'hollow_king')!;
    realm.mobs.damage(king, 99999, 0, 0, realm.mobEvents, true, false, true);
    run(s, 4);
    expect(realm.dungeonViewFor(s)!.boss).toBe('dead');
    for (let dz = -1; dz <= 1; dz++) for (let dy = 0; dy <= 2; dy++) expect(realm.world.getBlock(exit.x, exit.y + dy, exit.z + dz), `portal ${dz},${dy}`).toBe(B.PORTAL);
    expect(realm.world.getBlock(exit.x, exit.y - 1, exit.z)).toBe(B.OBSIDIAN);
    // Step into it.
    s.portalCooldown = 0;
    s.teleport(exit.x + 0.5, exit.y, exit.z + 0.5, -Math.PI / 2, 0);
    run(s, 2);
    expect(realm.copyAt(s)).toBe(-1);
    expect(realm.dungeonViewFor(s)).toBeNull();
  });
  it('gives each copy its own king', () => {
    const { s, realm } = make();
    inCopy(s);
    const other = new Player(realm, { mode: 'survival', name: 'Ada' });
    other.finishLoading();
    other.xp.add(totalForLevel(DUNGEON_MIN_LEVEL));
    other.inventory.collect(makeStack(I.HOLLOW_SIGIL, 1));
    realm.usePortal(other);
    expect(realm.copyAt(other)).toBe(1);
    const kings = realm.mobs.mobs.filter((m) => m.kind === 'hollow_king');
    expect(kings.length).toBe(2);
    expect(generator.instanceAt(kings[0].body.x, kings[0].body.z)).not.toBe(generator.instanceAt(kings[1].body.x, kings[1].body.z));
    expect(generator.instanceBoss(0)!.z + INSTANCE_STRIDE).toBeCloseTo(generator.instanceBoss(1)!.z, 5);
  });
});

// ---- the script, on its own ------------------------------------------------------------------------------------------

interface Hit {
  amount: number;
  kx: number;
  kz: number;
}

function fight(players = 1) {
  const arena: BossArenaDef = { x0: 0, z0: -10, x1: 26, z1: 10, y: 64, home: { x: 20.5, y: 64, z: 0.5, yaw: 0 } };
  const mob = new Mob(1, 'hollow_king', 20.5, 64, 0.5);
  const targets: (BossTarget & { hits: Hit[] })[] = [];
  for (let i = 0; i < players; i++) {
    const hits: Hit[] = [];
    targets.push({ x: 10 + i * 3, y: 64, z: i, hits, hurt: (amount, kx, kz) => hits.push({ amount, kx, kz }) });
  }
  const said: { text: string; kind: string }[] = [];
  const marks: { kind: FxKind; r: number; ttl: number }[] = [];
  const adds: Mob[] = [];
  const sounds: BossFx[] = [];
  let removed = 0;
  let defeated = false;
  let r = 0.5;
  const world: BossWorld = {
    targets: () => targets,
    spawnAdd: (kind, x, y, z) => {
      const m = new Mob(100 + adds.length, kind, x, y, z);
      adds.push(m);
      return m;
    },
    removeMob: () => void removed++,
    mark: (kind, _x, _y, _z, rad, ttl) => void marks.push({ kind, r: rad, ttl }),
    say: (text, kind) => void said.push({ text, kind }),
    defeated: () => void (defeated = true),
    fx: (e) => void sounds.push(e),
    rand: () => (r = (r * 9301 + 49297) % 233280 / 233280),
  };
  const brain = new BossBrain(mob, arena, world);
  const step = (seconds: number): void => {
    for (let i = 0; i < Math.round(seconds * 20); i++) brain.update(1 / 20);
  };
  const hurtTo = (share: number): void => {
    mob.health = mob.maxHealth * share;
  };
  return { brain, mob, targets, said, marks, adds, sounds, step, hurtTo, removed: () => removed, defeated: () => defeated };
}

describe('the Hollow King\'s script', () => {
  it('is made as a boss, large and slow to come to a fight, with a health of its own', () => {
    expect(MOBS.hollow_king.boss).toBe(true);
    expect(MOBS.hollow_king.height).toBeGreaterThan(3);
    expect(MOBS.hollow_king.health).toBeGreaterThan(MOBS.zombie.health * 10);
  });

  it('sleeps until somebody comes within his reach, then speaks', () => {
    const f = fight();
    f.targets[0].x = 100;
    f.step(5);
    expect(f.brain.state).toBe('dormant');
    f.targets[0].x = 20.5 - KING.wake + 1;
    f.step(0.2);
    expect(f.brain.state).toBe('fighting');
    expect(f.said[0].kind).toBe('yell');
  });

  it('is woken by being hurt from afar', () => {
    const f = fight();
    f.targets[0].x = 100;
    f.mob.health -= 5;
    f.step(0.1);
    expect(f.brain.state).toBe('fighting');
  });

  it('gathers Ember Slam in view of everybody and then hits what stands near him, and only them', () => {
    const f = fight(2);
    f.targets[0].x = 20.5 - 3; // close
    f.targets[1].x = 20.5 - 15; // far
    f.step(KING.slamFirst + 0.3);
    // A cast is under way: named, with its time, and a mark on the ground of the size it will hit.
    expect(f.brain.view().cast?.name).toBe('Ember Slam');
    expect(f.mob.casting).toBe(1);
    const warn = f.marks.find((m) => m.kind === 'boss_warn');
    expect(warn?.r).toBe(KING.slam.radius);
    f.step(KING.slam.cast + 0.2);
    expect(f.mob.casting).toBe(0);
    expect(f.targets[0].hits.length).toBe(1);
    expect(f.targets[0].hits[0].amount).toBeCloseTo(KING.slam.damage, 5);
    expect(f.targets[1].hits.length).toBe(0);
    expect(f.marks.some((m) => m.kind === 'boss_blast')).toBe(true);
  });

  it('holds still while he gathers a spell', () => {
    const f = fight();
    f.step(KING.slamFirst + 0.5);
    expect(f.brain.cast).not.toBeNull();
    expect(f.mob.stunTime).toBeGreaterThan(0);
  });

  it('drops Molten Pillars on where people stood, and they can walk out before they land', () => {
    const f = fight(2);
    f.step(KING.pillarFirst + 0.2);
    // Run until pillars have been cast (Slam goes first; skip through it).
    for (let i = 0; i < 400 && !f.marks.some((m) => m.r === KING.pillars.radius); i++) f.step(0.1);
    expect(f.marks.filter((m) => m.kind === 'boss_warn' && m.r === KING.pillars.radius).length).toBeGreaterThanOrEqual(2);
    // The first player walks out of it; the second stays.
    f.targets[0].x = 100;
    f.targets[0].hits.length = 0;
    f.targets[1].hits.length = 0;
    f.step(KING.pillars.delay + 0.3);
    expect(f.targets[0].hits.length).toBe(0);
    expect(f.targets[1].hits.length).toBeGreaterThanOrEqual(1);
  });

  it('begins the second phase at seventy per cent: he calls his court and is warded while it stands', () => {
    const f = fight();
    f.step(1);
    f.hurtTo(0.69);
    f.step(KING.court.cast + 0.5);
    expect(f.brain.phase).toBe(2);
    expect(f.adds.length).toBe(5);
    expect(f.mob.ward).toBeCloseTo(KING.shield, 5);
    expect(f.brain.view().shield).toBe(1);
    expect(f.brain.view().adds).toBe(5);
    // The ward really takes most of a blow away.
    const hp = f.mob.health;
    f.mob.health -= 10 * (1 - f.mob.ward);
    expect(hp - f.mob.health).toBeCloseTo(10 * (1 - KING.shield), 5);
    // Put the court down and the ward is gone.
    for (const a of f.adds) a.dead = true;
    f.step(0.2);
    expect(f.mob.ward).toBe(0);
    expect(f.brain.view().shield).toBeUndefined();
  });

  it('enrages at forty per cent: harder blows and a quicker stride, and a rain of cinders', () => {
    const f = fight();
    f.step(1);
    f.hurtTo(0.69);
    f.step(KING.court.cast + 0.5);
    for (const a of f.adds) a.dead = true;
    f.hurtTo(0.39);
    f.step(KING.unbound.cast + 4);
    expect(f.brain.phase).toBe(3);
    expect(f.mob.damageMul).toBeGreaterThan(1);
    expect(f.mob.hasteMul).toBeGreaterThan(1);
    expect(f.brain.view().enraged).toBe(1);
    for (let i = 0; i < 600 && !f.marks.some((m) => m.r === KING.rain.radius); i++) {
      f.step(0.1);
      f.mob.health = Math.max(f.mob.health, f.mob.maxHealth * 0.35);
    }
    expect(f.marks.some((m) => m.kind === 'boss_warn' && m.r === KING.rain.radius)).toBe(true);
  });

  it('starts over, whole and asleep, when everybody has left or died', () => {
    const f = fight();
    f.step(1);
    f.hurtTo(0.5);
    f.step(KING.court.cast + 0.5);
    expect(f.adds.length).toBeGreaterThan(0);
    f.mob.body.x = 5;
    f.targets.length = 0;
    f.step(KING.leash + 1);
    expect(f.brain.state).toBe('dormant');
    expect(f.mob.health).toBe(f.mob.maxHealth);
    expect(f.mob.body.x).toBeCloseTo(20.5, 5);
    expect(f.mob.damageMul).toBe(1);
    expect(f.mob.ward).toBe(0);
    expect(f.brain.phase).toBe(1);
    expect(f.removed()).toBe(f.adds.length);
  });

  it('ends the fight with his death, and his court falls with him', () => {
    const f = fight();
    f.step(1);
    f.hurtTo(0.5);
    f.step(KING.court.cast + 0.5);
    f.mob.health = 0;
    f.mob.dead = true;
    f.step(0.1);
    expect(f.brain.state).toBe('dead');
    expect(f.defeated()).toBe(true);
    expect(f.adds.every((a) => a.dead)).toBe(true);
    // Nothing happens after that.
    const spoke = f.said.length;
    f.step(30);
    expect(f.said.length).toBe(spoke);
  });

  it('forces an end to the fight: after a long time he stops waiting', () => {
    const f = fight();
    f.step(KING.hardEnrage + 1);
    for (let i = 0; i < 20; i++) {
      f.step(1);
      f.mob.health = f.mob.maxHealth;
    }
    expect(f.mob.damageMul).toBeGreaterThan(KING.unbound.damageMul);
  });
});

describe('the sounds of the fight (bossFx)', () => {
  const kinds = (f: ReturnType<typeof fight>, what: string): BossFx[] => f.sounds.filter((e) => e.what === what);

  it('is silent while he sleeps, and a roar goes out where he stands when he wakes', () => {
    const f = fight();
    f.targets[0].x = 100;
    f.step(5);
    expect(f.sounds).toEqual([]);
    f.targets[0].x = 20.5 - KING.wake + 1;
    f.step(0.2);
    const wake = kinds(f, 'wake');
    expect(wake.length).toBe(1);
    expect(wake[0].x).toBeCloseTo(20.5, 5);
    expect(wake[0].z).toBeCloseTo(0.5, 5);
    // It came before his first words.
    expect(f.said[0].kind).toBe('yell');
  });

  it('winds a spell up (named, with how long) and lets it go at the end: the slam where he stands', () => {
    const f = fight();
    f.step(KING.slamFirst + 0.3);
    const cast = kinds(f, 'cast');
    expect(cast.length).toBe(1);
    expect(cast[0].spell).toBe('slam');
    expect(cast[0].seconds).toBeCloseTo(KING.slam.cast, 5);
    expect(kinds(f, 'release').length).toBe(0);
    f.step(KING.slam.cast + 0.2);
    const release = kinds(f, 'release');
    expect(release.length).toBe(1);
    expect(release[0].spell).toBe('slam');
    expect(release[0].x).toBeCloseTo(f.mob.body.x, 5);
    expect(f.sounds.findIndex((e) => e.what === 'cast')).toBeLessThan(f.sounds.findIndex((e) => e.what === 'release'));
  });

  it('lands Molten Pillars one by one, where each stands', () => {
    const f = fight(2);
    for (let i = 0; i < 400 && !f.sounds.some((e) => e.what === 'cast' && e.spell === 'pillars'); i++) {
      f.step(0.1);
      f.mob.health = f.mob.maxHealth;
    }
    expect(f.sounds.some((e) => e.what === 'cast' && e.spell === 'pillars')).toBe(true);
    expect(kinds(f, 'release').some((e) => e.spell === 'pillars')).toBe(false);
    f.step(KING.pillars.cast + KING.pillars.delay + 0.3);
    const crashes = kinds(f, 'release').filter((e) => e.spell === 'pillars');
    expect(crashes.length).toBeGreaterThanOrEqual(2);
    for (const c of crashes) expect(typeof c.x).toBe('number');
  });

  it('roars at each phase, then calls his court and, at forty per cent, breaks into the Embers', () => {
    const f = fight();
    f.step(1);
    f.hurtTo(0.69);
    f.step(KING.court.cast + 0.5);
    expect(kinds(f, 'phase').map((e) => e.phase)).toEqual([2]);
    expect(f.sounds.some((e) => e.what === 'cast' && e.spell === 'court')).toBe(true);
    expect(f.sounds.some((e) => e.what === 'release' && e.spell === 'court')).toBe(true);
    for (const a of f.adds) a.dead = true;
    f.hurtTo(0.39);
    f.step(KING.unbound.cast + 0.5);
    expect(kinds(f, 'phase').map((e) => e.phase)).toEqual([2, 3]);
    expect(f.sounds.some((e) => e.what === 'cast' && e.spell === 'unbound')).toBe(true);
    expect(f.sounds.some((e) => e.what === 'release' && e.spell === 'unbound')).toBe(true);
    // Cinder Rain falls drop by drop.
    for (let i = 0; i < 600 && !f.sounds.some((e) => e.what === 'release' && e.spell === 'rain'); i++) {
      f.step(0.1);
      f.mob.health = Math.max(f.mob.health, f.mob.maxHealth * 0.35);
    }
    expect(f.sounds.some((e) => e.what === 'release' && e.spell === 'rain')).toBe(true);
  });

  it('is heard walking: a footfall each stride, none while he stands or is lifted off the ground', () => {
    const f = fight();
    f.step(0.2);
    f.mob.body.onGround = true;
    f.mob.stunTime = 0;
    // (He walks by hand here: a quarter of a block a look, ten blocks in all.)
    const walk = (blocks: number): void => {
      for (let i = 0; i < blocks / 0.25; i++) {
        f.mob.body.x -= 0.25;
        f.brain.update(1 / 20);
      }
    };
    const before = kinds(f, 'step').length;
    walk(10);
    const steps = kinds(f, 'step').length - before;
    expect(steps).toBe(Math.floor(10 / KING_STRIDE));
    // Standing still, or in the air, there is no sound of feet.
    f.step(2);
    f.mob.body.onGround = false;
    const n = kinds(f, 'step').length;
    walk(8);
    expect(kinds(f, 'step').length).toBe(n);
    // A step is where he is.
    expect(kinds(f, 'step')[0].x).toBeDefined();
  });

  it('is heard swinging each time his blow starts over, once', () => {
    const f = fight();
    f.step(0.2);
    f.mob.attackTime = 3;
    f.brain.update(1 / 20);
    expect(kinds(f, 'swing').length).toBe(0);
    f.mob.attackTime = 0; // the monster brain struck
    f.brain.update(1 / 20);
    f.mob.attackTime = 0.05;
    f.brain.update(1 / 20);
    f.mob.attackTime = 0.1;
    f.brain.update(1 / 20);
    expect(kinds(f, 'swing').length).toBe(1);
    f.mob.attackTime = 0;
    f.brain.update(1 / 20);
    expect(kinds(f, 'swing').length).toBe(2);
  });

  it('goes down with a last sound, just before the fight is over', () => {
    const f = fight();
    f.step(1);
    f.mob.health = 0;
    f.mob.dead = true;
    f.step(0.1);
    const down = kinds(f, 'down');
    expect(down.length).toBe(1);
    expect(down[0].x).toBeCloseTo(f.mob.body.x, 5);
    expect(f.defeated()).toBe(true);
    f.step(5);
    expect(kinds(f, 'down').length).toBe(1);
  });

  it('works for a world with no ears (no fx handed to it)', () => {
    const arena: BossArenaDef = { x0: 0, z0: -10, x1: 26, z1: 10, y: 64, home: { x: 20.5, y: 64, z: 0.5, yaw: 0 } };
    const mob = new Mob(1, 'hollow_king', 20.5, 64, 0.5);
    const world: BossWorld = { targets: () => [{ x: 15, y: 64, z: 0, hurt: () => {} }], spawnAdd: () => new Mob(2, 'zombie', 0, 64, 0), removeMob: () => {}, mark: () => {}, say: () => {}, defeated: () => {}, rand: () => 0.5 };
    const brain = new BossBrain(mob, arena, world);
    for (let i = 0; i < 400; i++) brain.update(1 / 20);
    expect(brain.state).toBe('fighting');
  });
});

describe('the sounds of the fight, through the realm', () => {
  it('reach everybody in the copy (near or far in it), and nobody who is elsewhere', () => {
    const { s, realm } = make();
    inCopy(s);
    const other = new Player(realm, { mode: 'survival', name: 'Ada' });
    other.finishLoading();
    other.xp.add(totalForLevel(DUNGEON_MIN_LEVEL));
    other.inventory.collect(makeStack(I.HOLLOW_SIGIL, 1));
    realm.usePortal(other); // her own copy (the second one)
    const outside = new Player(realm, { mode: 'survival', name: 'Bo' });
    outside.finishLoading();
    expect(realm.copyAt(outside)).toBe(-1);
    s.drainEvents();
    other.drainEvents();
    outside.drainEvents();
    const spec = generator.instanceBoss(0)!;
    s.teleport(spec.arena.x0 + 3.5, spec.y, spec.z, -Math.PI / 2, 0);
    run(s, 2);
    const heard = s.drainEvents().filter((e) => e.t === 'bossFx' && e.what === 'wake');
    expect(heard.length).toBe(1);
    expect(heard[0]).toMatchObject({ t: 'bossFx', what: 'wake' });
    const at = heard[0] as { x: number; z: number };
    expect(at.x).toBeCloseTo(spec.x, 0);
    expect(at.z).toBeCloseTo(spec.z, 0);
    expect(other.drainEvents().filter((e) => e.t === 'bossFx').length).toBe(0);
    expect(outside.drainEvents().filter((e) => e.t === 'bossFx').length).toBe(0);
  });

  it('carry the cast and then the release of the slam to the player in the copy', () => {
    const { s, realm } = make();
    inCopy(s);
    const spec = generator.instanceBoss(0)!;
    s.teleport(spec.arena.x0 + 3.5, spec.y, spec.z, -Math.PI / 2, 0);
    const king = realm.mobs.mobs.find((m) => m.kind === 'hollow_king')!;
    const heard: string[] = [];
    for (let i = 0; i < 20 * 40 && !heard.includes('release'); i++) {
      s.tick(idle());
      king.health = king.maxHealth;
      s.vitals.health = 20;
      s.teleport(spec.arena.x0 + 8.5, spec.y, spec.z, -Math.PI / 2, 0); // (held in the room: his blows push)
      for (const e of s.drainEvents()) if (e.t === 'bossFx' && (e.what === 'cast' || e.what === 'release')) heard.push(e.what);
    }
    expect(heard.slice(0, 2)).toEqual(['cast', 'release']);
  });
});
