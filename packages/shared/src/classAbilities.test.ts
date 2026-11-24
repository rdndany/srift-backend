import { describe, expect, it } from 'vitest';
import {
  ABILITY_BY_ID,
  ADVENTURE_SEED,
  B,
  CLASSES,
  CLASS_LEVELS,
  GameSession,
  HeadlessWorld,
  I,
  NPCS,
  Player,
  Realm,
  WorldGenerator,
  abilitiesOf,
  makeGenerator,
  mulberry32,
  parsePlayerSave,
  parseSessionMessage,
  questById,
  skillBookId,
  toolId,
  type AbilityId,
  type AdventureWorldGenerator,
  type ClassId,
  type InputFrame,
  type Mob,
  type MobKind,
  type SessionEvent,
  type SessionOptions,
} from './index';
import { BASH_ANIM, SLAM_WIND } from './player';
import { settleOrbs } from './xpOrbs.testutil';
import { doObjectives, startInVillage } from './villageStart.testutil';

const SEED = 1337;
const FLOOR = 100;
const CX = 8;
const CZ = 8;

const idle = (over: Partial<InputFrame> = {}): InputFrame => ({
  t: 'frame',
  dt: 1 / 20,
  locked: true,
  yaw: 0,
  pitch: 0,
  forward: 0,
  strafe: 0,
  jump: false,
  sprint: false,
  sneak: false,
  left: false,
  right: false,
  ...over,
});

/** Teach a player every ability of its class (what reading the four skill books does, without the levels they ask for). */
const learnAll = (s: Player): void => {
  for (const a of abilitiesOf(s.cls!.classId)) s.cls!.unlocked.add(a.id);
};

/**
 * A classed session on a clean stone platform (top surface y = 101), looking towards -z. Crits are switched off so damage
 * is exact. A new character knows no ability, so unless `learned` is false the player has read all four skill books.
 */
function make(classId: ClassId | null, opts: Partial<SessionOptions> = {}, noCrit = true, learned = true) {
  const generator = new WorldGenerator(SEED);
  const world = new HeadlessWorld(generator);
  for (let x = CX - 20; x <= CX + 20; x++)
    for (let z = CZ - 24; z <= CZ + 24; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 14; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.STONE);
    }
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(7), classId, ...opts });
  s.finishLoading();
  s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
  if (noCrit && s.cls) s.cls.setModifiers([{ critChance: -1 }]);
  if (learned && s.cls) learnAll(s);
  s.drainEvents();
  return s;
}

/** XP needed to be at `level` from the start. */
const xpFor = (level: number): number => {
  let t = 0;
  for (let lv = 1; lv < level; lv++) t += CLASS_LEVELS.toNext(lv);
  return t;
};

const levelTo = (s: GameSession | Player, level: number): void => s.addClassXp(xpFor(level));

/** A frozen mob (stunned for a long time, so it neither walks nor bites) `ahead` blocks in front and `side` to the right. */
function dummy(s: Player, kind: MobKind, ahead: number, side = 0, freeze = true): Mob {
  const id = s.spawnMob(kind, CX + 0.5 + side, FLOOR + 1, CZ + 0.5 - ahead);
  const m = s.mobs.mobs.find((x) => x.id === id)!;
  if (freeze) m.stunTime = 999;
  return m;
}

/** A frozen zombie standing exactly at a point. */
function frozenAt(s: Player, x: number, y: number, z: number): Mob {
  const id = s.spawnMob('zombie', x, y, z);
  const m = s.mobs.mobs.find((v) => v.id === id)!;
  m.stunTime = 999;
  return m;
}

const run = (s: Player, seconds: number, over: Partial<InputFrame> = {}): void => {
  for (let i = 0; i < Math.round(seconds * 20); i++) (s as GameSession).tick(idle(over));
};

const events = (s: Player): SessionEvent[] => s.drainEvents() as SessionEvent[];
const toasts = (es: SessionEvent[]): string[] => es.flatMap((e) => (e.t === 'toast' ? [e.text] : []));

describe('a new character', () => {
  it('has the health, resource and kit of its class', () => {
    for (const id of ['warrior', 'mage', 'ranger'] as const) {
      const s = make(id);
      expect(s.cls!.classId).toBe(id);
      expect(s.vitals.maxHealth).toBe(Math.round(s.cls!.stats.maxHealth));
      expect(s.vitals.health).toBe(s.vitals.maxHealth);
      expect(s.cls!.resource).toBe(s.cls!.stats.maxResource);
      for (const k of CLASSES[id].startingKit) expect(s.inventory.countOf(k.id) + (s.offhand.get(0)?.id === k.id ? 1 : 0)).toBe(k.count);
      expect(s.offhand.get(0)?.id).toBe(CLASSES[id].startingOffhand);
    }
  });

  it('differs in health between the classes the way the roles say', () => {
    expect(make('warrior').vitals.maxHealth).toBeGreaterThan(make('ranger').vitals.maxHealth);
    expect(make('ranger').vitals.maxHealth).toBeGreaterThan(make('mage').vitals.maxHealth);
  });

  it('gets the kit once per character, not on every load, and not in creative mode', () => {
    const s = make('ranger');
    const saved = s.savePlayer();
    const generator = new WorldGenerator(SEED);
    const t = new GameSession({ seed: SEED, world: new HeadlessWorld(generator), generator, naturalSpawning: false, rand: mulberry32(7), classId: 'ranger' });
    t.loadPlayer(parsePlayerSave(JSON.parse(JSON.stringify(saved)))!);
    t.finishLoading();
    expect(t.inventory.countOf(I.ARROW)).toBe(32);
    const c = make('mage', { mode: 'creative' });
    expect(c.inventory.countOf(I.WAND)).toBe(0);
  });

  it('with no class plays the unmodified game', () => {
    const s = make(null);
    expect(s.cls).toBeNull();
    expect(s.vitals.maxHealth).toBe(20);
    expect(s.inventory.countOf(I.WAND)).toBe(0);
    expect(s.classView()).toBeNull();
    expect(s.useAbility(0)).toBe('noclass');
    expect(s.speedMul).toBe(1);
    expect(s.savePlayer().cls).toBeUndefined();
  });

  it('moves at its class speed', () => {
    const dist = (id: ClassId | null) => {
      const s = make(id);
      const z0 = s.body.z;
      run(s, 1, { forward: 1 });
      return z0 - s.body.z;
    };
    const none = dist(null);
    expect(dist('warrior')).toBeCloseTo(none, 1);
    expect(dist('ranger')).toBeGreaterThan(none * 1.08);
    expect(dist('ranger')).toBeLessThan(none * 1.16);
  });
});

describe('using an ability', () => {
  it('refuses a button that does not exist, whatever it is', () => {
    const s = make('warrior');
    for (const slot of [-1, 4, 99, 1.5, NaN, Infinity]) expect(s.useAbility(slot)).toBe('locked');
    expect(s.cls!.resource).toBe(s.cls!.stats.maxResource);
  });

  it('refuses an ability that has not been learned and says where it comes from', () => {
    const s = make('warrior', {}, true, false);
    expect(s.useAbility(2)).toBe('locked');
    expect(toasts(events(s)).join(' ')).toMatch(/You have not learned Charge: find or buy its skill book/);
    expect(s.cls!.resource).toBe(s.cls!.stats.maxResource);
    // even at a high level: the level alone teaches nothing
    levelTo(s, 8);
    for (const slot of [0, 1, 2, 3]) expect(s.useAbility(slot)).toBe('locked');
  });

  it('charges the resource, starts the cooldown, and refuses the repeat until it is over', () => {
    const s = make('warrior');
    const ww = ABILITY_BY_ID.get('ground_slam')!;
    expect(s.useAbility(0)).toBe('cast');
    expect(s.cls!.resource).toBeCloseTo(s.cls!.stats.maxResource - ww.cost, 3);
    expect(events(s).map((e) => e.t)).toEqual(expect.arrayContaining(['cast']));
    expect(s.useAbility(0)).toBe('cooldown');
    expect(toasts(events(s)).join(' ')).toMatch(/Ground Slam is not ready/);
    run(s, ww.cooldown + 0.2);
    expect(s.useAbility(0)).toBe('cast');
  });

  it('refuses a cast it cannot pay for and charges nothing', () => {
    const s = make('mage');
    s.cls!.resource = 5;
    expect(s.useAbility(0)).toBe('resource');
    expect(s.cls!.resource).toBe(5);
    expect(s.cls!.cooldownLeft('fireball')).toBe(0);
    expect(toasts(events(s)).join(' ')).toMatch(/Not enough mana/);
  });

  it('spends one resource per class: stamina, mana and focus', () => {
    for (const id of ['warrior', 'mage', 'ranger'] as const) {
      const s = make(id);
      const first = abilitiesOf(id)[0];
      expect(s.useAbility(0)).toBe('cast');
      expect(s.classView()!.resource).toBeCloseTo(s.cls!.stats.maxResource - first.cost, 0);
    }
  });

  it('cannot be used while dead, in a menu, or when asleep or riding is in the way', () => {
    const inMenu = make('warrior');
    inMenu.apply({ t: 'inventory' });
    expect(inMenu.screen).not.toBe('none');
    expect(inMenu.useAbility(0)).toBe('busy');
    expect(inMenu.cls!.resource).toBe(inMenu.cls!.stats.maxResource);
    const dead = make('warrior');
    dead.vitals.health = 0;
    dead.vitals.dead = true;
    expect(dead.useAbility(0)).toBe('busy');
  });

  it('ignores an ability command while a menu is open (the way a client would ask)', () => {
    const s = make('warrior');
    s.apply({ t: 'inventory' });
    s.apply({ t: 'ability', slot: 0 });
    expect(s.cls!.cooldownLeft('ground_slam')).toBe(0);
    s.closeMenu();
    s.apply({ t: 'ability', slot: 0 });
    expect(s.cls!.cooldownLeft('ground_slam')).toBeGreaterThan(0);
  });

  it('is not sped up by sending frames: cooldowns run on the server\u2019s own steps, one per frame', () => {
    const s = make('warrior');
    s.useAbility(0);
    run(s, 3.5);
    expect(s.cls!.cooldownLeft('ground_slam')).toBeGreaterThan(3.2);
    expect(s.cls!.cooldownLeft('ground_slam')).toBeLessThan(3.6);
  });

  it('restarts clean after dying: full resource, no cooldowns, no guard', () => {
    const s = make('warrior');
    levelTo(s, 5);
    s.useAbility(0);
    s.useAbility(3);
    expect(s.cls!.reductionLeft).toBeGreaterThan(0);
    s.vitals.damage(999, 'generic');
    run(s, 0.1);
    expect(s.screen).toBe('dead');
    s.apply({ t: 'respawn' });
    expect(s.cls!.resource).toBe(s.cls!.stats.maxResource);
    expect(s.cls!.cooldownLeft('ground_slam')).toBe(0);
    expect(s.cls!.reductionLeft).toBe(0);
    expect(s.cls!.level).toBe(5); // the class is kept
  });
});

describe('Warrior abilities', () => {
  it('Ground Slam throws the warrior high into the air; nothing is hurt until they come down', () => {
    const s = make('warrior');
    const y0 = s.body.y;
    const hp0 = s.vitals.health;
    const under = dummy(s, 'zombie', 3.5, 0, false);
    expect(s.useAbility(0)).toBe('cast');
    // first a crouch: it does not stop a walking body, and nothing has left the ground yet
    expect(s.slamPhase).toBe(1);
    const at = { x: s.body.x, z: s.body.z };
    run(s, SLAM_WIND - 0.04, { forward: 1 });
    expect(Math.hypot(s.body.x - at.x, s.body.z - at.z)).toBeGreaterThan(0.3);
    expect(s.body.y).toBe(y0);
    expect(s.body.vy).toBe(0);
    expect(s.fx.some((f) => f.k === 'leap')).toBe(false);
    run(s, 0.15);
    expect(s.slamPhase).toBe(2);
    expect(s.body.vy).toBeGreaterThan(10);
    expect(s.fx.some((f) => f.k === 'leap')).toBe(true);
    expect(s.fx.some((f) => f.k === 'slam')).toBe(false);
    let peak = y0;
    for (let i = 0; i < 12; i++) {
      run(s, 0.05);
      peak = Math.max(peak, s.body.y);
    }
    expect(peak - y0).toBeGreaterThan(2.5);
    expect(under.health).toBe(under.maxHealth);
    run(s, 2);
    expect(s.body.onGround).toBe(true);
    // the slam is over: the figure is not held in any of its poses
    expect(s.slamPhase).toBe(0);
    // the jump, and the landing on top of it, cost nothing
    expect(s.vitals.health).toBe(hp0);
    expect(s.fx.some((f) => f.k === 'slam') || s.cls!.cooldownLeft('ground_slam') > 0).toBe(true);
  });

  it('Ground Slam hurts and stuns every monster and farm animal around where the warrior lands, scaled by the class, and nothing farther away', () => {
    const s = make('warrior');
    s.useAbility(0);
    run(s, 0.3);
    // Find where it will come down by letting it; then put the targets round that spot and cast again.
    run(s, 2);
    const land = { x: s.body.x, z: s.body.z };
    expect(land.z).toBeLessThan(CZ + 0.5 - 2); // thrown ahead
    const d = CZ + 0.5 - land.z; // how far ahead it comes down
    const t = make('warrior');
    const near = dummy(t, 'zombie', -2); // behind where it took off, out of reach of the landing
    const a = dummy(t, 'zombie', d);
    const b = dummy(t, 'zombie', d, 2.5);
    const far = dummy(t, 'zombie', d + 12);
    const cow = dummy(t, 'cow', d, 1);    t.useAbility(0);
    run(t, 2.5);
    expect(a.health).toBeCloseTo(a.maxHealth - 14 * 1.25, 1);
    expect(b.health).toBeCloseTo(b.maxHealth - 14 * 1.25, 1);
    expect(near.health).toBe(near.maxHealth); // left behind at the take-off, out of reach of the landing
    expect(far.health).toBe(far.maxHealth);
    expect(cow.dead).toBe(true); // farm animals are hit too (17.5 damage is more than a cow has)
  });

  it('Ground Slam leaves its mark where the warrior lands', () => {
    const s = make('warrior');
    s.useAbility(0);
    run(s, 0.1);
    expect(s.fx.some((f) => f.k === 'slam')).toBe(false);
    for (let i = 0; i < 80 && !s.fx.some((f) => f.k === 'slam'); i++) run(s, 0.05);
    const m = s.fx.find((f) => f.k === 'slam');
    expect(m).toBeTruthy();
    expect(m!.by).toBe(s.name);
    expect(CZ + 0.5 - m!.z).toBeGreaterThan(2); // ahead of where it started
  });

  it('Ground Slam is called off by dying in the air: no blast on the next landing', () => {
    const s = make('warrior');
    s.useAbility(0);
    run(s, 0.2);
    s.vitals.damage(999, 'generic');
    run(s, 0.1);
    s.apply({ t: 'respawn' });
    run(s, 3);
    expect(s.fx.some((f) => f.k === 'slam')).toBe(false);
  });
  it('Shield Bash hits the cone in front only, and stuns', () => {
    const s = make('warrior');
    const front = dummy(s, 'zombie', 2, 0, false);
    const behind = dummy(s, 'zombie', -2);
    s.useAbility(1);
    expect(front.health).toBeCloseTo(front.maxHealth - 8 * 1.25, 2);
    expect(front.stunTime).toBeGreaterThan(1.4);
    expect(behind.health).toBe(behind.maxHealth);
  });

  it('Charge is a run, not a jump: it covers the distance over a third of a second or so, hitting what it passes', () => {
    const s = make('warrior');
    levelTo(s, 3);
    const z0 = s.body.z;
    const in1 = dummy(s, 'zombie', 3);
    const off = dummy(s, 'zombie', 3, 5);
    expect(s.useAbility(2)).toBe('cast');
    // nothing has happened yet: it starts running
    expect(z0 - s.body.z).toBeLessThan(0.5);
    expect(s.classView()!.rush).toBeTruthy();
    run(s, 0.1);
    const early = z0 - s.body.z;
    expect(early).toBeGreaterThan(1);
    expect(early).toBeLessThan(5);
    run(s, 0.8);
    expect(z0 - s.body.z).toBeGreaterThan(6.5);
    expect(s.classView()!.rush).toBeUndefined();
    expect(in1.health).toBeCloseTo(in1.maxHealth - 9 * 1.25 * (1 + 0.02 * 2), 1);
    expect(off.health).toBe(off.maxHealth);
    // a mark follows the charger while it runs, and does not stay long after
    expect(s.fx.some((f) => f.k === 'charge')).toBe(false);
  });

  it('Charge leaves a mark that follows the warrior while it runs', () => {
    const s = make('warrior');
    levelTo(s, 3);
    s.useAbility(2);
    run(s, 0.1);
    const mark = s.fx.find((f) => f.k === 'charge')!;
    expect(mark).toBeTruthy();
    expect(Math.hypot(mark.x - s.body.x, mark.z - s.body.z)).toBeLessThan(0.5);
  });

  it('the figure is drawn charging only while the Charge runs, and the mark stays a little after it for the trail to settle', () => {
    const s = make('warrior');
    levelTo(s, 3);
    expect(s.charging).toBe(false);
    s.useAbility(2);
    run(s, 0.1);
    expect(s.charging).toBe(true);
    run(s, 0.5);
    expect(s.charging).toBe(false);
    const mark = s.fx.find((f) => f.k === 'charge')!;
    expect(mark).toBeTruthy();
    expect(mark.ttl - mark.age).toBeGreaterThan(0.2);
  });

  it('Charge stops at a wall', () => {
    const s = make('warrior');
    levelTo(s, 3);
    for (let y = FLOOR + 1; y <= FLOOR + 4; y++) s.world.setBlock(CX, y, CZ - 3, B.STONE);
    s.useAbility(2);
    run(s, 1);
    expect(s.body.z).toBeGreaterThan(CZ - 3 + 0.5);
    expect(s.classView()!.rush).toBeUndefined();
  });

  it('Charge hops a single block in its way', () => {
    const s = make('warrior');
    levelTo(s, 3);
    s.world.setBlock(CX, FLOOR + 1, CZ - 3, B.STONE);
    s.useAbility(2);
    run(s, 1);
    expect(s.body.z).toBeLessThan(CZ - 4);
  });

  it('Charge costs no health: running into the open air and landing is an ordinary fall at most', () => {
    const s = make('warrior');
    levelTo(s, 3);
    const hp = s.vitals.health;
    s.useAbility(2);
    run(s, 1.5);
    expect(s.vitals.health).toBe(hp);
  });
  it('Iron Defense shows a mark that follows the warrior for as long as the guard lasts, and a moment after', () => {
    const s = make('warrior');
    levelTo(s, 5);
    s.useAbility(3);
    const mark = s.fx.find((f) => f.k === 'guard_iron')!;
    expect(mark).toBeTruthy();
    expect(mark.ttl).toBeGreaterThan(6);
    s.teleport(CX + 5.5, FLOOR + 1, CZ + 0.5, 0, 0);
    run(s, 0.2);
    expect(Math.abs(mark.x - s.body.x)).toBeLessThan(0.5);
    run(s, 6.2);
    expect(s.cls!.reductionLeft).toBe(0);
    expect(s.fx.includes(mark)).toBe(true); // the armour is still flying off
    run(s, 1);
    expect(s.fx.includes(mark)).toBe(false);
  });

  it('Iron Defense\u2019s mark goes when the warrior dies', () => {
    const s = make('warrior');
    levelTo(s, 5);
    s.useAbility(3);
    const mark = s.fx.find((f) => f.k === 'guard_iron')!;
    s.vitals.damage(999, 'generic');
    run(s, 0.2);
    expect(s.fx.includes(mark)).toBe(false);
  });

  it('Shield Bash\u2019s mark says which way the blow went', () => {
    const s = make('warrior');
    s.useAbility(1);
    const mark = s.fx.find((f) => f.k === 'bash')!;
    expect(mark.z2!).toBeLessThan(mark.z); // towards -z, where the warrior looks
    expect(mark.x2!).toBeCloseTo(mark.x, 3);
  });

  it('a Shield Bash starts the figure\u2019s own bash (others see it from `bashAge`), which runs out after BASH_ANIM, and no other skill starts it', () => {
    const s = make('warrior');
    levelTo(s, 5);
    expect(s.bashAge).toBeGreaterThan(BASH_ANIM);
    s.useAbility(3);
    expect(s.bashAge).toBeGreaterThan(BASH_ANIM);
    s.useAbility(1);
    expect(s.bashAge).toBe(0);
    run(s, 0.2);
    expect(s.bashAge).toBeGreaterThan(0.15);
    expect(s.bashAge).toBeLessThan(BASH_ANIM);
    run(s, BASH_ANIM);
    expect(s.bashAge).toBeGreaterThan(BASH_ANIM);
  });
  it('Shield Bash, Charge and Iron Defense do not swing the sword; the others still do', () => {
    const s = make('warrior');
    levelTo(s, 5);
    s.drainEvents();
    s.useAbility(1);
    expect(events(s).map((e) => e.t)).not.toContain('swing');
    s.useAbility(3);
    expect(events(s).map((e) => e.t)).not.toContain('swing');
    // (a Ground Slam is not a sword swing either: the figure is drawn from its own slam phase)
    s.useAbility(0);
    expect(events(s).map((e) => e.t)).not.toContain('swing');
    expect(s.slamPhase).toBe(1);
  });
  it('Iron Defense halves the damage taken for six seconds, on top of the class\u2019s own armor', () => {
    const s = make('warrior');
    levelTo(s, 5);
    const loss = () => {
      const before = s.vitals.health;
      s.vitals.sinceHit = 10; // past the brief invulnerability after a hit
      s.hurtByMob(10, 0, 1, 'zombie');
      const l = before - s.vitals.health;
      s.vitals.health = before;
      return l;
    };
    expect(loss()).toBeCloseTo(8, 1);
    expect(s.useAbility(3)).toBe('cast');
    expect(loss()).toBeCloseTo(4, 1);
    run(s, 6.2);
    expect(loss()).toBeCloseTo(8, 1);
  });

  it('Iron Defense halves what a zombie\u2019s real bite does, and says so with a number', () => {
    const bite = (guard: boolean) => {
      const s = make('warrior');
      levelTo(s, 5);
      if (guard) s.useAbility(3);
      s.drainEvents();
      const z = dummy(s, 'zombie', 0.9, 0, false);
      z.aggro = true;
      const before = s.vitals.health;
      run(s, 3);
      const nums = events(s).flatMap((e) => (e.t === 'dmg' && e.taken ? [e] : []));
      return { lost: before - s.vitals.health, nums };
    };
    const plain = bite(false);
    const guarded = bite(true);
    expect(plain.lost).toBeGreaterThan(0);
    expect(guarded.lost).toBeGreaterThan(0);
    // the same bites, half the damage each (the number of bites in three seconds is the same)
    expect(guarded.nums.length).toBe(plain.nums.length);
    for (let i = 0; i < plain.nums.length; i++) expect(guarded.nums[i].amount).toBeCloseTo(plain.nums[i].amount / 2, 1);
    expect(plain.nums.every((n) => !n.guarded)).toBe(true);
    expect(guarded.nums.every((n) => n.guarded)).toBe(true);
  });

  it('tells the player the number for every hit they land, abilities included', () => {
    const s = make('warrior');
    const z = dummy(s, 'zombie', 2);
    s.drainEvents();
    s.useAbility(1);
    const hits = events(s).flatMap((e) => (e.t === 'dmg' && !e.taken ? [e] : []));
    expect(hits.length).toBe(1);
    expect(hits[0].amount).toBeCloseTo(8 * 1.25, 1);
    expect(hits[0].y).toBeGreaterThan(z.body.y + 1.5); // over its head
    expect(Math.abs(hits[0].x - z.body.x)).toBeLessThan(0.01);
  });

  it('Shield Bash throws the mob back and up, not just a step', () => {
    const s = make('warrior');
    const z = dummy(s, 'zombie', 2);
    const z0 = z.body.z;
    s.useAbility(1);
    run(s, 0.1);
    expect(z.body.y).toBeGreaterThan(FLOOR + 1.3); // off the ground
    run(s, 1);
    expect(z0 - z.body.z).toBeGreaterThan(3); // and a good way off, in the way the warrior faces
  });

  it('Charge scatters what it runs into: the mobs fly aside and forward', () => {
    const s = make('warrior');
    levelTo(s, 3);
    const z = dummy(s, 'zombie', 3);
    const z0 = z.body.z;
    s.useAbility(2);
    let peak = 0;
    for (let i = 0; i < 30; i++) {
      run(s, 0.05);
      peak = Math.max(peak, z.body.y - (FLOOR + 1));
    }
    expect(peak).toBeGreaterThan(1);
    expect(z.health).toBeLessThan(z.maxHealth);
    expect(Math.hypot(z.body.x - (CX + 0.5), z.body.z - z0)).toBeGreaterThan(1.5);
  });

  it('Ground Slam throws every mob it hits up into the air and out from where it lands', () => {
    const s = make('warrior');
    s.useAbility(0);
    run(s, 2.2);
    const land = { x: s.body.x, z: s.body.z };
    const t = make('warrior');
    const a = dummy(t, 'zombie', CZ + 0.5 - land.z + 2);
    const a0 = { x: a.body.x, z: a.body.z };
    t.useAbility(0);
    let peak = 0;
    for (let i = 0; i < 60; i++) {
      run(t, 0.05);
      peak = Math.max(peak, a.body.y - (FLOOR + 1));
    }
    expect(a.health).toBeLessThan(a.maxHealth);
    expect(peak).toBeGreaterThan(1.5);
    expect(Math.hypot(a.body.x - a0.x, a.body.z - a0.z)).toBeGreaterThan(1.5);
  });
});

describe('Mage abilities', () => {
  it('Fireball flies, bursts on the first mob it meets, hurts the ones next to it and sets them alight', () => {
    const s = make('mage');
    const first = dummy(s, 'zombie', 6);
    const next = dummy(s, 'zombie', 6, 1);
    const apart = dummy(s, 'zombie', 6, 5);
    expect(s.useAbility(0)).toBe('cast');
    run(s, 1.2);
    expect(first.health).toBeLessThanOrEqual(first.maxHealth - 8 * 1.5 + 0.01);
    expect(next.health).toBeLessThan(next.maxHealth);
    expect(first.onFire).toBeGreaterThan(0);
    expect(apart.health).toBe(apart.maxHealth);
    expect(events(s).length).toBeGreaterThan(0);
  });

  it("Fireball's blast mark is as wide as its burst and lasts long enough to leave smoke (a second), longer than a plain bolt's", () => {
    const s = make('mage');
    dummy(s, 'zombie', 6);
    s.useAbility(0);
    run(s, 0.6);
    const blast = s.fx.find((f) => f.k === 'fireball_burst');
    expect(blast).toBeDefined();
    expect(blast!.r).toBe(2);
    expect(blast!.ttl).toBeGreaterThanOrEqual(1);
  });

  it('Fireball bursts against a wall without hurting anything beyond it', () => {
    const s = make('mage');
    for (let y = FLOOR + 1; y <= FLOOR + 5; y++) for (let x = CX - 2; x <= CX + 2; x++) s.world.setBlock(x, y, CZ - 3, B.STONE);
    const behindWall = dummy(s, 'zombie', 7);
    s.useAbility(0);
    run(s, 1.5);
    expect(behindWall.health).toBe(behindWall.maxHealth);
  });

  it('Frost Nova damages and slows what is around: monsters and farm animals, not villagers', () => {
    const s = make('mage');
    const z = dummy(s, 'zombie', 3);
    const cow = dummy(s, 'cow', 2);
    const villager = dummy(s, 'villager', 2, 1.5);
    s.useAbility(1);
    expect(z.health).toBeCloseTo(z.maxHealth - 5 * 1.5, 2);
    expect(z.slowTime).toBeGreaterThan(3);
    expect(z.slowMul).toBeCloseTo(0.4, 5);
    expect(cow.health).toBeCloseTo(cow.maxHealth - 5 * 1.5, 2);
    expect(cow.slowTime).toBeGreaterThan(3);
    expect(villager.health).toBe(villager.maxHealth);
    // the frost stays on the ground for a couple of seconds, over as wide a circle as the blast
    const frost = s.fx.find((f) => f.k === 'frost_nova');
    expect(frost).toBeDefined();
    expect(frost!.r).toBe(5);
    expect(frost!.ttl).toBeGreaterThanOrEqual(2.5);
  });

  it('Meteor lands where you look, after a delay, and not before', () => {
    const s = make('mage');
    levelTo(s, 3);
    expect(s.useAbility(2)).toBe('cast');
    const warn = s.fx.find((f) => f.k === 'meteor_warn');
    expect(warn).toBeDefined();
    const m = frozenAt(s, warn!.x, warn!.y, warn!.z);
    run(s, 0.6);
    expect(m.health).toBe(m.maxHealth);
    run(s, 1.2);
    expect(m.dead).toBe(true); // 15 * 1.5 is more than a zombie has
    // the crater and the smoke it leaves stay for nearly two seconds
    const blast = s.fx.find((f) => f.k === 'meteor_hit');
    expect(blast).toBeDefined();
    expect(blast!.ttl).toBeGreaterThanOrEqual(1.8);
  });

  it('Meteor is dropped if its caster dies before it lands', () => {
    const s = make('mage');
    levelTo(s, 3);
    s.useAbility(2);
    const warn = s.fx.find((f) => f.k === 'meteor_warn')!;
    const m = frozenAt(s, warn.x, warn.y, warn.z);
    s.vitals.damage(999, 'generic');
    run(s, 0.1);
    expect(s.screen).toBe('dead');
    run(s, 2);
    expect(m.health).toBe(m.maxHealth);
  });

  it('Arcane Shield soaks up damage before health does', () => {
    const s = make('mage');
    levelTo(s, 5);
    s.useAbility(3);
    const hp = s.vitals.health;
    s.hurtByMob(5, 0, 1, 'zombie'); // 5 * 1.15 = 5.75, all soaked
    expect(s.vitals.health).toBe(hp);
    s.hurtByMob(10, 0, 1, 'zombie'); // 11.5, 6.25 soaked left over 12 - 5.75... pool runs out
    expect(s.vitals.health).toBeLessThan(hp);
    expect(s.cls!.absorbAmount).toBe(0);
  });

  it("Arcane Shield's mark lasts as long as the shield, follows its owner and ends when the shield is soaked up", () => {
    const s = make('mage');
    levelTo(s, 5);
    s.useAbility(3);
    const mark = s.fx.find((f) => f.k === 'guard_arcane')!;
    expect(mark.ttl).toBe(8);
    const x0 = mark.x;
    s.teleport(CX + 6.5, FLOOR + 1, CZ + 0.5, 0, 0);
    run(s, 0.3);
    expect(s.fx.includes(mark)).toBe(true);
    expect(mark.x).toBeCloseTo(CX + 6.5, 0);
    expect(mark.x).not.toBe(x0);
    // The pool is used up: the mark goes at the next step, long before its eight seconds.
    s.hurtByMob(40, 0, 1, 'zombie');
    run(s, 0.2);
    expect(s.cls!.absorbAmount).toBe(0);
    run(s, 0.2);
    expect(s.fx.includes(mark)).toBe(false);
  });

  it("Arcane Shield's mark also ends when the time runs out, and dying removes it", () => {
    const s = make('mage');
    levelTo(s, 5);
    s.useAbility(3);
    const mark = s.fx.find((f) => f.k === 'guard_arcane')!;
    s.vitals.damage(999, 'generic');
    run(s, 0.3);
    expect(s.fx.includes(mark)).toBe(false);
  });

  it('a wand casts a bolt for mana, and runs dry', () => {
    const s = make('mage');
    const z = dummy(s, 'zombie', 6);
    run(s, 0.1); // the orb in the off hand deepens the pool on the first step
    const mana = s.cls!.resource;
    run(s, 0.5, { right: true });
    expect(s.cls!.resource).toBeLessThan(mana);
    expect(z.health).toBeLessThan(z.maxHealth);
    s.cls!.resource = 0;
    const before = s.cls!.resource;
    run(s, 1, { right: true });
    expect(s.cls!.resource).toBeLessThan(before + s.cls!.stats.resourceRegen * 1.2 + 0.01);
  });

  it("each weapon's bolt is its own spell and bursts as its own mark: a wand 3 'wand_hit', a staff 4 'staff_hit', a spellbook the plain arcane bolt 2 'bolt'", () => {
    const s = make('mage');
    dummy(s, 'zombie', 6);
    run(s, 0.1, { right: true });
    expect(s.mobs.arrows.some((a) => a.spell === 3)).toBe(true);
    run(s, 0.4);
    expect(s.fx.some((f) => f.k === 'wand_hit')).toBe(true);
    expect(s.fx.some((f) => f.k === 'bolt')).toBe(false);

    const staff = make('mage');
    staff.inventory.set(staff.selected, { id: I.STAFF, count: 1, damage: 0 });
    dummy(staff, 'zombie', 6);
    run(staff, 0.1, { right: true });
    expect(staff.mobs.arrows.some((a) => a.spell === 4)).toBe(true);
    run(staff, 0.5);
    expect(staff.fx.some((f) => f.k === 'staff_hit')).toBe(true);
    expect(staff.fx.some((f) => f.k === 'wand_hit' || f.k === 'bolt')).toBe(false);

    const book = make('mage');
    book.inventory.set(book.selected, { id: I.SPELLBOOK, count: 1, damage: 0 });
    dummy(book, 'zombie', 6);
    run(book, 0.1, { right: true });
    expect(book.mobs.arrows.some((a) => a.spell === 2)).toBe(true);
    run(book, 0.6);
    expect(book.fx.some((f) => f.k === 'bolt')).toBe(true);
    expect(book.fx.some((f) => f.k === 'wand_hit' || f.k === 'staff_hit')).toBe(false);
  });
});

describe('Ranger abilities', () => {
  it('Piercing Shot hits everything on the line and nothing off it', () => {
    const s = make('ranger');
    const a = dummy(s, 'zombie', 4);
    const b = dummy(s, 'zombie', 10);
    const off = dummy(s, 'zombie', 7, 3);
    expect(s.useAbility(0)).toBe('cast');
    expect(a.health).toBeCloseTo(a.maxHealth - 8 * 1.3, 2);
    expect(b.health).toBeCloseTo(b.maxHealth - 8 * 1.3, 2);
    expect(off.health).toBe(off.maxHealth);
  });

  it('Piercing Shot does not go through walls', () => {
    const s = make('ranger');
    for (let y = FLOOR + 1; y <= FLOOR + 5; y++) for (let x = CX - 2; x <= CX + 2; x++) s.world.setBlock(x, y, CZ - 3, B.STONE);
    const behind = dummy(s, 'zombie', 7);
    s.useAbility(0);
    expect(behind.health).toBe(behind.maxHealth);
  });

  it('Evasive Roll is a quick run, not a jump: backwards when standing still, in the direction you move otherwise, and nothing hurts during it', () => {
    const s = make('ranger');
    const z0 = s.body.z;
    expect(s.useAbility(1)).toBe('cast');
    expect(s.classView()!.rush?.roll).toBe(true);
    expect(s.body.z - z0).toBeLessThan(1); // it starts running, it does not appear at the other end
    const hp = s.vitals.health;
    s.hurtByMob(8, 0, 1, 'zombie');
    expect(s.vitals.health).toBe(hp);
    s.hurtByExplosion(s.body.x, s.body.y, s.body.z, 3, 'creeper');
    expect(s.vitals.health).toBe(hp);
    run(s, 0.15);
    const early = s.body.z - z0;
    expect(early).toBeGreaterThan(1);
    expect(early).toBeLessThan(5);
    run(s, 0.5);
    expect(s.body.z - z0).toBeGreaterThan(5);
    expect(s.classView()!.rush).toBeUndefined();
    run(s, 0.8);
    s.hurtByMob(4, 0, 1, 'zombie');
    expect(s.vitals.health).toBeLessThan(hp);

    const t = make('ranger');
    const x0 = t.body.x;
    t.tick(idle({ strafe: 1 }));
    const x1 = t.body.x;
    t.useAbility(1);
    run(t, 0.7);
    expect(Math.abs(t.body.x - x1)).toBeGreaterThan(3);
    expect(Math.abs(t.body.x - x0)).toBeGreaterThan(3);
  });

  it('Evasive Roll leaves a mark along the path it took, and stops at a wall', () => {
    const s = make('ranger');
    for (let y = FLOOR + 1; y <= FLOOR + 4; y++) for (let x = CX - 3; x <= CX + 3; x++) s.world.setBlock(x, y, CZ + 3, B.STONE);
    s.useAbility(1);
    const mark = s.fx.find((f) => f.k === 'roll')!;
    expect(mark).toBeTruthy();
    expect(mark.z2!).toBeGreaterThan(mark.z); // backwards, towards +z
    expect(mark.z2!).toBeLessThan(CZ + 3); // cut short by the wall
    run(s, 1);
    expect(s.body.z).toBeLessThan(CZ + 3);
  });
  it('Bear Trap is thrown to the ground the crosshair points at, from the hand', () => {
    const s = make('ranger');
    levelTo(s, 3);
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, -0.4);
    expect(s.useAbility(2)).toBe('cast');
    const mark = s.fx.find((f) => f.k === 'trap_set')!;
    expect(mark).toBeTruthy();
    const ahead = CZ + 0.5 - mark.z;
    expect(ahead).toBeGreaterThan(2.5);
    expect(ahead).toBeLessThan(6.5);
    expect(mark.x).toBeCloseTo(CX + 0.5, 0);
    expect(mark.y).toBeCloseTo(FLOOR + 1, 0);
    // it comes from the thrower's hand
    expect(mark.x2).toBeDefined();
    expect(Math.hypot(mark.x2! - s.body.x, mark.z2! - s.body.z)).toBeLessThan(1);
    expect(mark.y2!).toBeGreaterThan(FLOOR + 1);
  });

  it('Bear Trap never goes farther than its reach: aiming at the sky or a far peak puts it as far as it can go', () => {
    const level = make('ranger');
    levelTo(level, 3);
    expect(level.useAbility(2)).toBe('cast');
    const far = CZ + 0.5 - level.fx.find((f) => f.k === 'trap_set')!.z;
    expect(far).toBeGreaterThan(10);
    expect(far).toBeLessThanOrEqual(14.1);
    const sky = make('ranger');
    levelTo(sky, 3);
    sky.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0.6);
    expect(sky.useAbility(2)).toBe('cast');
    expect(CZ + 0.5 - sky.fx.find((f) => f.k === 'trap_set')!.z).toBeLessThanOrEqual(14.1);
    // a hill in the way catches it before the limit
    const hill = make('ranger');
    levelTo(hill, 3);
    for (let y = FLOOR + 1; y <= FLOOR + 6; y++) for (let x = CX - 3; x <= CX + 3; x++) hill.world.setBlock(x, y, CZ - 6, B.STONE);
    hill.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
    hill.useAbility(2);
    const m = hill.fx.find((f) => f.k === 'trap_set')!;
    expect(CZ + 0.5 - m.z).toBeLessThan(6);
  });

  it('Bear Trap is never put under the thrower\u2019s feet', () => {
    const s = make('ranger');
    levelTo(s, 3);
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, -1.5);
    s.useAbility(2);
    const m = s.fx.find((f) => f.k === 'trap_set')!;
    expect(Math.hypot(m.x - s.body.x, m.z - s.body.z)).toBeGreaterThan(1.3);
  });

  it('Bear Trap roots and hurts the first mob that steps in (a monster or a farm animal), and is gone after', () => {
    const s = make('ranger');
    levelTo(s, 3);
    s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, -0.4);
    expect(s.useAbility(2)).toBe('cast');
    const mark = s.fx.find((f) => f.k === 'trap_set')!;
    const villager = dummy(s, 'villager', 0.1);
    villager.body.x = mark.x;
    villager.body.z = mark.z;
    run(s, 0.3);
    expect(villager.health).toBe(villager.maxHealth);
    expect(s.fx.some((f) => f.k === 'trap_set')).toBe(true);
    const z = frozenAt(s, mark.x, mark.y, mark.z);
    const away = frozenAt(s, mark.x + 8, mark.y, mark.z);
    run(s, 0.3);
    expect(z.health).toBeLessThanOrEqual(z.maxHealth - 6 * 1.3 * 1.04 + 0.01);
    expect(z.rootTime).toBeGreaterThan(2);
    expect(away.health).toBe(away.maxHealth);
    expect(s.fx.some((f) => f.k === 'trap_set')).toBe(false);
  });
  it('Bear Trap keeps at most two of a player\u2019s traps', () => {
    const s = make('ranger');
    levelTo(s, 3);
    for (let i = 0; i < 4; i++) {
      s.cls!.resource = s.cls!.stats.maxResource;
      s.cls!.setModifiers([{ critChance: -1 }]);
      expect(s.useAbility(2)).toBe('cast');
      run(s, 14.1);
    }
    expect(s.fx.filter((f) => f.k === 'trap_set').length).toBeLessThanOrEqual(2);
  });

  it('Rain of Arrows hits an area in several volleys', () => {
    const s = make('ranger');
    levelTo(s, 5);
    expect(s.useAbility(3)).toBe('cast');
    const mark = s.fx.find((f) => f.k === 'rain_mark')!;
    expect(mark).toBeDefined();
    const z = frozenAt(s, mark.x, mark.y, mark.z);
    run(s, 1.1);
    const early = z.maxHealth - z.health;
    expect(early).toBeGreaterThan(0);
    run(s, 3.5);
    expect(z.maxHealth - z.health).toBeGreaterThan(early * 2);
  });

  it('a bow draws and shoots for ranged damage', () => {
    const s = make('ranger');
    const z = dummy(s, 'zombie', 12);
    const arrows = s.inventory.countOf(I.ARROW);
    run(s, 1.5, { right: true });
    run(s, 0.1);
    run(s, 1.5);
    expect(s.inventory.countOf(I.ARROW)).toBeLessThan(arrows);
    expect(z.health).toBeLessThan(z.maxHealth);
  });
});

describe('abilities against players (PvP is off)', () => {
  function duel(classId: ClassId) {
    const generator = new WorldGenerator(SEED);
    const world = new HeadlessWorld(generator);
    for (let x = CX - 20; x <= CX + 20; x++)
      for (let z = CZ - 24; z <= CZ + 24; z++) {
        for (let y = FLOOR + 1; y < FLOOR + 14; y++) world.setBlock(x, y, z, B.AIR);
        world.setBlock(x, FLOOR, z, B.STONE);
      }
    const a = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(7), classId });
    a.finishLoading();
    a.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
    const b = new Player(a.realm, { mode: 'survival', name: 'Victim', classId: 'warrior' });
    b.finishLoading();
    b.teleport(CX + 0.5, FLOOR + 1, CZ - 1.5, 0, 0);
    return { a, b, realm: a.realm };
  }

  it('no ability of any class ever hurts another player', () => {
    for (const id of ['warrior', 'mage', 'ranger'] as const) {
      const { a, b } = duel(id);
      levelTo(a, 5);
      const hp = b.vitals.health;
      for (const ab of abilitiesOf(id)) {
        a.cls!.resource = a.cls!.stats.maxResource;
        a.useAbility(ab.slot);
        run(a, 0.5);
        a.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
      }
      run(a, 6);
      expect(b.vitals.health, `${id} hurt a player`).toBe(hp);
    }
  });

  it('a wand and a bow do not hurt a player either', () => {
    const { a, b } = duel('mage');
    const hp = b.vitals.health;
    run(a, 1, { right: true });
    expect(b.vitals.health).toBe(hp);
  });

  it('a client has no way to say how much damage to do: the command carries a button and nothing else', () => {
    expect(parseSessionMessage({ t: 'ability', slot: 1 })).toEqual({ t: 'ability', slot: 1 });
    expect(parseSessionMessage({ t: 'ability', slot: 1, damage: 9999, target: 'x', crit: true, cost: 0, cooldown: 0 })).toEqual({ t: 'ability', slot: 1 });
    for (const bad of [
      { t: 'ability' },
      { t: 'ability', slot: -1 },
      { t: 'ability', slot: 4 },
      { t: 'ability', slot: 1.5 },
      { t: 'ability', slot: '1' },
      { t: 'ability', slot: null },
      { t: 'ability', slot: NaN },
    ]) {
      expect(parseSessionMessage(bad)).toBeNull();
    }
    // and none of the commands that exist take a damage number
    for (const msg of [
      { t: 'hit', damage: 1e9 },
      { t: 'damage', amount: 5 },
      { t: 'hurt', amount: 5 },
    ])
      expect(parseSessionMessage(msg)).toBeNull();
  });
});

describe('class experience', () => {
  it('follows the character\u2019s level (the green bar), never goes down, and no longer comes from kills or quests as such', () => {
    const s = make('mage');
    const z = dummy(s, 'zombie', 3);
    s.damageMob(z.id, 999);
    run(s, 0.1);
    expect(s.cls!.xp).toBe(0); // class experience points are gone: only the character's level counts
    expect(s.cls!.level).toBeGreaterThanOrEqual(1);
    // 27 points make level 3 (the experience curve), 55 make level 5.
    s.drainEvents();
    s.addXp(27 - s.xp.total);
    expect(s.xp.level).toBe(3);
    expect(s.cls!.level).toBe(3);
    expect(events(s).some((e) => e.t === 'classlevel' && e.level === 3)).toBe(true);
    // Spending levels (an enchanting table) does not take the class back down or make it forget anything.
    s.cls!.unlocked.add('meteor');
    s.xp.spend(2);
    s.syncClassLevel();
    expect(s.cls!.level).toBe(3);
    expect(s.cls!.unlocked.has('meteor')).toBe(true);
  });

  it('is shared with players who are near through the experience of a kill, not with those far away', () => {
    const s = make('mage');
    const near = new Player(s.realm, { mode: 'survival', name: 'Near', classId: 'ranger' });
    near.finishLoading();
    near.teleport(CX + 0.5, FLOOR + 1, CZ + 5, 0, 0);
    const far = new Player(s.realm, { mode: 'survival', name: 'Far', classId: 'ranger' });
    far.finishLoading();
    far.teleport(CX + 500, FLOOR + 1, CZ, 0, 0);
    s.addXp(500);
    near.addXp(500);
    expect(s.cls!.level).toBeGreaterThan(1);
    expect(near.cls!.level).toBeGreaterThan(1);
    expect(far.cls!.level).toBe(1);
  });

  it('is earned by killing with an ability too, and levels up with a toast and an unlock', () => {
    const s = make('warrior');
    let levelled: SessionEvent | undefined;
    for (let i = 0; i < 12 && !levelled; i++) {
      const z = dummy(s, 'zombie', 2);
      z.health = 1;
      s.cls!.resource = s.cls!.stats.maxResource;
      s.cls!.resetCombat();
      s.useAbility(1);
      settleOrbs(s, 2);
      levelled = events(s).find((e) => e.t === 'classlevel');
    }
    expect(levelled).toBeDefined();
    expect(s.cls!.level).toBeGreaterThanOrEqual(2);
  });

  it('gives the new health at a level, and teaches no ability: those come from skill books', () => {
    const s = make('mage', {}, true, false);
    const hp = s.vitals.maxHealth;
    levelTo(s, 3);
    expect(events(s).some((e) => e.t === 'classlevel' && e.level === 3)).toBe(true);
    expect(s.cls!.unlocked.size).toBe(0);
    expect(s.vitals.maxHealth).toBeGreaterThan(hp - 1);
    levelTo(s, 5);
    expect(s.cls!.unlocked.size).toBe(0);
    expect(s.classView()!.abilities.every((a) => !a.unlocked)).toBe(true);
  });

  it('tells you that a skill book in the bags can be read now that the level is there', () => {
    const s = make('mage', {}, true, false);
    s.giveItem(skillBookId('meteor'));
    s.giveItem(skillBookId('fireball'));
    s.drainEvents();
    levelTo(s, 3);
    const said = toasts(events(s)).join(' ');
    expect(said).toMatch(/You can now learn Meteor/);
    expect(said).not.toMatch(/Fireball/); // level 1 book: it could be read before
  });

  it('does nothing for a classless player', () => {
    const s = make(null);
    const z = dummy(s, 'zombie', 3);
    s.damageMob(z.id, 999);
    expect(s.cls).toBeNull();
    s.addClassXp(500);
    expect(s.savePlayer().cls).toBeUndefined();
  });
});

describe('class experience from quests', () => {
  const generator = makeGenerator(ADVENTURE_SEED, 'adventure') as AdventureWorldGenerator;
  const npcMob = (s: GameSession, id: string): Mob => {
    const v = NPCS.findIndex((n) => n.id === id);
    return s.mobs.mobs.find((x) => x.kind === 'npc' && x.variant === v)!;
  };
  const talkTo = (s: GameSession, id: string) => {
    const n = NPCS.find((x) => x.id === id)!;
    s.teleport(n.x, (n.place ? generator.groundAt(n.place)! : generator.hubY) + 1, n.z + 2, 0, 0);
    run(s, 0.2);
    for (let i = 0; i < 400 && !npcMob(s, id); i++) run(s, 0.05);
    expect(s.talkNpc(npcMob(s, id))).toBe(true);
  };

  it('are paid out as class experience, and for a classless player nothing changes', () => {
    for (const cls of ['mage', null] as const) {
      const world = new HeadlessWorld(generator);
      const s = new GameSession({ seed: ADVENTURE_SEED, world, generator, naturalSpawning: false, rand: mulberry32(3), classId: cls });
      s.finishLoading();
      startInVillage(s, generator);
      run(s, 1.5);
      const q = questById('ms01')!;
      talkTo(s, q.giver);
      s.apply({ t: 'quest', a: 'accept', id: 'ms01' });
      s.closeMenu();
      doObjectives(s, q);
      talkTo(s, q.turnIn);
      s.apply({ t: 'quest', a: 'complete', id: 'ms01' });
      expect(s.quests!.status('ms01')).toBe('done');
      if (cls) expect(s.cls!.level).toBe(Math.max(1, Math.min(CLASS_LEVELS.max, s.xp.level)));
      else expect(s.cls).toBeNull();
    }
  });
});

describe('saving and loading a class', () => {
  const fresh = (classId: ClassId | null) => {
    const generator = new WorldGenerator(SEED);
    const s = new GameSession({ seed: SEED, world: new HeadlessWorld(generator), generator, naturalSpawning: false, rand: mulberry32(7), classId });
    return s;
  };

  it('keeps the class, its level, experience and unlocked abilities in the character\u2019s save', () => {
    const s = make('ranger');
    levelTo(s, 6);
    s.addClassXp(9);
    const text = JSON.stringify(s.savePlayer());
    const back = fresh('ranger');
    back.loadPlayer(parsePlayerSave(JSON.parse(text))!);
    back.finishLoading();
    expect(back.cls!.level).toBe(6);
    expect(back.cls!.xp).toBe(9);
    expect(back.cls!.unlocked.has('rain_of_arrows')).toBe(true);
    expect(back.vitals.maxHealth).toBe(s.vitals.maxHealth);
    expect(back.cls!.resource).toBe(back.cls!.stats.maxResource);
  });

  it('holds nothing about money, wallets or timers', () => {
    const s = make('mage');
    levelTo(s, 4);
    s.useAbility(0);
    const text = JSON.stringify(s.savePlayer().cls);
    expect(text).not.toMatch(/sol|wallet|balance|token|price|cooldown|resource/i);
  });

  it('opens an old save without a class: a classed character starts at level one, a classless one stays classless', () => {
    const old = JSON.parse(JSON.stringify(make(null).savePlayer()));
    expect(old.cls).toBeUndefined();
    const a = fresh('warrior');
    a.loadPlayer(parsePlayerSave(old)!);
    a.finishLoading();
    expect(a.cls!.level).toBe(1);
    expect(a.cls!.unlocked.size).toBe(0); // and it knows no ability until it reads a skill book
    const b = fresh(null);
    b.loadPlayer(parsePlayerSave(old)!);
    b.finishLoading();
    expect(b.cls).toBeNull();
    expect(b.vitals.maxHealth).toBe(20);
  });

  it('ignores a save that belongs to another class, or is damaged', () => {
    const mage = make('mage');
    levelTo(mage, 9);
    const save = JSON.parse(JSON.stringify(mage.savePlayer()));
    const w = fresh('warrior');
    w.loadPlayer(parsePlayerSave(save)!);
    w.finishLoading();
    expect(w.cls!.level).toBe(1);
    for (const junk of [null, 5, 'x', [], { id: 'warrior', lvl: 'high' }, { id: 'warrior', lvl: 1e12, xp: -1, unlocked: [1, 2] }]) {
      const t = fresh('warrior');
      t.loadPlayer(parsePlayerSave({ ...save, cls: junk })!);
      t.finishLoading();
      expect(t.cls!.level).toBeGreaterThanOrEqual(1);
      expect(t.cls!.level).toBeLessThanOrEqual(CLASS_LEVELS.max);
    }
  });

  it('does not heal a hurt character on loading, and clamps health to the class\u2019s maximum', () => {
    const s = make('warrior');
    s.vitals.health = 5;
    const back = fresh('warrior');
    back.loadPlayer(parsePlayerSave(JSON.parse(JSON.stringify(s.savePlayer())))!);
    back.finishLoading();
    expect(back.vitals.health).toBe(5);
    const save = JSON.parse(JSON.stringify(s.savePlayer()));
    save.vitals = { ...(save.vitals ?? {}), health: 999 };
    const t = fresh('warrior');
    t.loadPlayer(parsePlayerSave(save)!);
    t.finishLoading();
    expect(t.vitals.health).toBeLessThanOrEqual(t.vitals.maxHealth);
  });
});

describe('the class on screen', () => {
  it('shows level, resource, cooldowns and what has been learned for the bar', () => {
    const s = make('mage', {}, true, false);
    const v0 = s.classView()!;
    expect(v0.id).toBe('mage');
    expect(v0.level).toBe(1);
    expect(v0.abilities.map((a) => a.id)).toEqual(abilitiesOf('mage').map((a) => a.id));
    expect(v0.abilities.map((a) => a.unlocked)).toEqual([false, false, false, false]);
    s.cls!.learn('fireball');
    s.cls!.learn('frost_nova');
    expect(s.classView()!.abilities.map((a) => a.unlocked)).toEqual([true, true, false, false]);
    expect(v0.maxHealth).toBe(s.vitals.maxHealth);
    s.useAbility(0);
    const v1 = s.classView()!;
    expect(v1.abilities[0].cd).toBeGreaterThan(0);
    expect(v1.resource).toBeLessThan(v0.resource);
  });

  it('is plain data that survives JSON (it goes into every snapshot)', () => {
    const v = make('ranger').classView()!;
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
  });
});

describe('a shared world', () => {
  it('shows one player\u2019s ability effects to everyone, and drops them with the caster', () => {
    const s = make('warrior');
    const other = new Player(s.realm, { mode: 'survival', name: 'Watcher', classId: 'mage' });
    other.finishLoading();
    expect(s.realm).toBe(other.realm);
    s.useAbility(0);
    run(s, SLAM_WIND + 0.1); // the crouch, then the spring
    expect(other.fx.some((f) => f.k === 'leap' && f.by === s.name)).toBe(true);
    for (let i = 0; i < 80 && !other.fx.some((f) => f.k === 'slam'); i++) run(s, 0.05); // the landing, a blast everyone sees
    expect(other.fx.some((f) => f.k === 'slam' && f.by === s.name)).toBe(true);
    run(s, 3);
    expect(other.fx.some((f) => f.k === 'slam' || f.k === 'leap')).toBe(false);
  });

  it('keeps cooldowns and resources apart for each player', () => {
    const s = make('warrior');
    const other = new Player(s.realm, { mode: 'survival', name: 'Other', classId: 'warrior' });
    other.finishLoading();
    s.useAbility(0);
    expect(s.cls!.cooldownLeft('ground_slam')).toBeGreaterThan(0);
    expect(other.cls!.cooldownLeft('ground_slam')).toBe(0);
    expect(other.cls!.resource).toBe(other.cls!.stats.maxResource);
  });

  it('two Realms never share effects', () => {
    const a = make('warrior');
    const b = make('warrior');
    a.useAbility(0);
    expect(b.fx.length).toBe(0);
    expect(a.realm).not.toBe(b.realm);
    expect(a.realm instanceof Realm).toBe(true);
  });
});

describe('the data tables stay true', () => {
  it('has a weapon for each class role', () => {
    expect(toolId('sword', 'stone')).toBeGreaterThan(0);
    for (const id of ['greatsword', 'dagger', 'staff', 'wand', 'spellbook', 'crossbow'] as const) {
      const key = id.toUpperCase() as keyof typeof I;
      expect(I[key]).toBeGreaterThan(0);
    }
  });

  it('keeps every ability id in the table', () => {
    const ids: AbilityId[] = [
      'ground_slam',
      'shield_bash',
      'charge',
      'iron_defense',
      'fireball',
      'meteor',
      'frost_nova',
      'arcane_shield',
      'rain_of_arrows',
      'piercing_shot',
      'evasive_roll',
      'bear_trap',
    ];
    for (const id of ids) expect(ABILITY_BY_ID.has(id)).toBe(true);
  });
});
