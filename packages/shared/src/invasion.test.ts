import { describe, expect, it } from 'vitest';
import {
  B,
  GameSession,
  GILDED_KINDS,
  HeadlessWorld,
  I,
  MOBS,
  Mob,
  MobManager,
  WorldGenerator,
  getItem,
  isGildedKind,
  makeStack,
  mobLevel,
  mulberry32,
  type InputFrame,
  type MobEnv,
  type MobEvents,
  type RiftPlayer,
} from './index';
import {
  INVASION_ABANDON,
  INVASION_CAP,
  INVASION_CHUNKS_PER_MOB,
  INVASION_KEEP_AWAY,
  INVASION_MIN,
  INVASION_MIX,
  INVASION_PERIOD,
  INVASION_SECONDS,
  INVASION_SPACING,
  InvasionDirector,
  invasionCount,
  invasionKinds,
  nextInvasionAt,
  whereIs,
  type InvasionEventKind,
  type InvasionHost,
} from './invasion';
import { gearUsable } from './gear';

// ---- the monsters and their one drop ---------------------------------------------------------------------------------

describe('the monsters of the Gilded Tide', () => {
  it('are four shy kinds, none of them a boss, none of them born by the spawner', () => {
    expect([...GILDED_KINDS]).toEqual(['gilt_imp', 'gilt_hound', 'gilt_drake', 'gilt_colossus']);
    for (const k of GILDED_KINDS) {
      expect(MOBS[k].hostile).toBe(false);
      expect(MOBS[k].detect).toBe(0);
      expect(MOBS[k].melee).toBeNull();
      expect(MOBS[k].kind).toBe(k);
      expect(isGildedKind(k)).toBe(true);
      expect(mobLevel(k)).toBeGreaterThan(5);
    }
    expect(GILDED_KINDS.filter((k) => MOBS[k].boss)).toEqual([]);
    expect(isGildedKind('zombie')).toBe(false);
    expect(isGildedKind('aurelion')).toBe(false);
    // they get tougher as they get bigger
    const order = ['gilt_imp', 'gilt_hound', 'gilt_drake', 'gilt_colossus'] as const;
    for (let i = 1; i < order.length; i++) {
      expect(MOBS[order[i]].health).toBeGreaterThan(MOBS[order[i - 1]].health);
    }
  });

  it('are named unlike the monsters of the old games, and so is their book', () => {
    const names = GILDED_KINDS.map((k) => MOBS[k].name.toLowerCase()).join(' ');
    for (const old of ['goblin', 'lizard', 'titan', 'vepar', 'kundun']) expect(names).not.toContain(old);
    expect(I.AURELION_CODEX).toBeGreaterThan(0);
  });

  it('drop nothing but the Codex of Aurelion, in numbers that grow with the monster', () => {
    const rand = mulberry32(11);
    const total: Record<string, number> = {};
    for (const k of GILDED_KINDS) {
      total[k] = 0;
      for (let i = 0; i < 400; i++) {
        for (const d of MOBS[k].drops(rand)) {
          expect(d.id, k).toBe(I.AURELION_CODEX);
          total[k] += d.count;
        }
      }
    }
    // an imp leaves one now and then; a colossus always leaves one at least
    expect(total.gilt_imp).toBeGreaterThan(0);
    expect(total.gilt_imp).toBeLessThan(400);
    expect(total.gilt_colossus).toBeGreaterThanOrEqual(400);
    expect(total.gilt_hound).toBeGreaterThan(total.gilt_imp);
    expect(total.gilt_drake).toBeGreaterThan(total.gilt_hound);
  });

  it('leave no coins, no loot, and nothing but the codex when they die', () => {
    const world = { getBlock: (_x: number, y: number) => (y < 0 ? B.STONE : y === 0 ? B.GRASS : B.AIR) };
    const rand = mulberry32(3);
    const env: MobEnv = { world, player: { x: 0.5, y: 1, z: 0.5, alive: true, invulnerable: false }, daylight: 0, rand };
    const log = { drops: [] as { id: number; count: number }[], coins: 0, loot: 0, xp: 0 };
    const events: MobEvents = {
      hurtPlayer: () => {},
      explode: () => {},
      sound: () => {},
      drop: (d) => log.drops.push(d),
      coins: (n) => (log.coins += n),
      loot: () => log.loot++,
      xp: (n) => (log.xp += n),
    };
    const mgr = new MobManager(rand);
    for (const k of GILDED_KINDS) {
      const m = mgr.spawn(k, 20.5, 1, 20.5);
      m.sincePlayerHit = 0;
      mgr.damage(m, 1e9, 1, 0, events, true, false, true);
      expect(m.dead).toBe(true);
    }
    expect(log.coins).toBe(0);
    expect(log.loot).toBe(0);
    expect(log.xp).toBeGreaterThan(0);
    expect(log.drops.length).toBeGreaterThan(0);
    expect(log.drops.every((d) => d.id === I.AURELION_CODEX)).toBe(true);
  });

  it('are not kept in a save', () => {
    const mgr = new MobManager(mulberry32(1));
    const imp = mgr.spawn('gilt_imp', 4.5, 1, 4.5);
    const zombie = mgr.spawn('zombie', 6.5, 1, 6.5);
    imp.bound = true;
    const saved = mgr.toJSON(5, 5, 100);
    expect(saved.map((m) => m.kind)).toEqual(['zombie']);
    expect(zombie.dead).toBe(false);
    const again = new MobManager(mulberry32(1));
    again.loadJSON([{ kind: 'gilt_hound', x: 1, y: 1, z: 1, health: 5 } as never]);
    expect(again.mobs).toHaveLength(0);
  });
});

describe('how many and which kinds', () => {
  it('scales with the land and the players, never beyond its cap', () => {
    expect(invasionCount(0, 1)).toBe(INVASION_MIN);
    expect(invasionCount(INVASION_CHUNKS_PER_MOB * 20, 2)).toBeGreaterThan(INVASION_MIN);
    expect(invasionCount(10_000, 40)).toBe(INVASION_CAP);
  });

  it('always brings a colossus when there are enough, and never Aurelion', () => {
    const kinds = invasionKinds(INVASION_MIN);
    expect(kinds).toContain('gilt_colossus');
    expect(kinds).not.toContain('aurelion');
    expect(kinds.every((k) => INVASION_MIX.some((m) => m.kind === k))).toBe(true);
    expect(kinds).toHaveLength(INVASION_MIN);
  });
});

// ---- the director ----------------------------------------------------------------------------------------------------

interface Said {
  what: InvasionEventKind;
  text: string;
  at?: [number, number];
}

const at = (x: number, z: number): RiftPlayer => ({ ref: {}, x, y: 65, z });

/** A flat, empty world with a clock of its own: everything is ground, nothing is forbidden. */
function fake(players: RiftPlayer[], start = Date.UTC(2026, 0, 1, 10, 0, 0), chunkN = 80) {
  const clock = { now: start };
  const said: Said[] = [];
  const mobs: Mob[] = [];
  const gone = new Set<Mob>();
  const puffs: number[] = [];
  // A grid of explored chunks far from the origin so the Tide can hide across the land.
  const chunks = Array.from({ length: chunkN }, (_, i) => {
    const ring = Math.floor(i / 8) + 6;
    const a = ((i % 8) / 8) * Math.PI * 2;
    return { cx: Math.round(Math.cos(a) * ring), cz: Math.round(Math.sin(a) * ring) };
  });
  const host: InvasionHost = {
    now: () => clock.now,
    players: () => players,
    chunks: () => chunks,
    groundAt: () => 64,
    standable: () => true,
    allowed: () => true,
    spawn: (kind, x, y, z) => {
      const m = new Mob(mobs.length + 1, kind, x, y, z, mulberry32(mobs.length + 1));
      mobs.push(m);
      return m;
    },
    present: (m) => !gone.has(m),
    remove: (m) => gone.add(m),
    announce: (what, text, x, z) => said.push({ what, text, ...(x !== undefined && z !== undefined ? { at: [x, z] as [number, number] } : {}) }),
    puff: () => puffs.push(1),
  };
  /** Run for this many seconds in half-second steps, the clock going with it. */
  const run = (d: InvasionDirector, seconds: number): void => {
    for (let t = 0; t < seconds; t += 0.5) {
      clock.now += 500;
      d.update(0.5);
    }
  };
  const alive = () => mobs.filter((m) => !m.dead && !gone.has(m));
  return { host, clock, said, mobs, gone, puffs, run, alive, chunks };
}

describe('the schedule', () => {
  it('is every half hour on the wall clock: on the hour and at half past', () => {
    expect(INVASION_PERIOD).toBe(30 * 60 * 1000);
    expect(nextInvasionAt(Date.UTC(2026, 0, 1, 10, 0, 0))).toBe(Date.UTC(2026, 0, 1, 10, 30, 0));
    expect(nextInvasionAt(Date.UTC(2026, 0, 1, 10, 12, 0))).toBe(Date.UTC(2026, 0, 1, 10, 30, 0));
    expect(nextInvasionAt(Date.UTC(2026, 0, 1, 10, 29, 59, 999))).toBe(Date.UTC(2026, 0, 1, 10, 30, 0));
    expect(nextInvasionAt(Date.UTC(2026, 0, 1, 10, 30, 0))).toBe(Date.UTC(2026, 0, 1, 11, 0, 0));
    expect(nextInvasionAt(Date.UTC(2026, 0, 1, 23, 45, 0))).toBe(Date.UTC(2026, 0, 2, 0, 0, 0));
  });

  it('warns five minutes and one minute ahead, once each, and only when somebody is there to hear', () => {
    const f = fake([at(0, 0)], Date.UTC(2026, 0, 1, 10, 0, 1));
    const d = new InvasionDirector(f.host, 1);
    f.run(d, 24 * 60); // 10:24:01
    expect(f.said).toHaveLength(0);
    f.run(d, 90); // past 10:25
    expect(f.said.map((s) => s.what)).toEqual(['omen']);
    expect(f.said[0].text).toContain('5 minutes');
    f.run(d, 3 * 60); // 10:28:31: nothing more yet
    expect(f.said).toHaveLength(1);
    f.run(d, 60); // past 10:29
    expect(f.said.map((s) => s.what)).toEqual(['omen', 'omen']);
    expect(f.said[1].text).toMatch(/seconds/);
    expect(d.current).toBeNull();

    const empty = fake([], Date.UTC(2026, 0, 1, 10, 0, 1));
    const d2 = new InvasionDirector(empty.host, 1);
    empty.run(d2, 29 * 60);
    expect(empty.said).toHaveLength(0);
  });

  it('warns a world that starts late once, with the time it really has left', () => {
    const f = fake([at(0, 0)], Date.UTC(2026, 0, 1, 10, 26, 30));
    const d = new InvasionDirector(f.host, 1);
    f.run(d, 5);
    expect(f.said).toHaveLength(1);
    expect(f.said[0].text).toContain('3 minutes');
    f.run(d, 20);
    expect(f.said).toHaveLength(1);
  });

  it('begins on the half hour, with shy creatures scattered over the land, none near the players', () => {
    const p = at(0, 0);
    const f = fake([p], Date.UTC(2026, 0, 1, 10, 29, 50));
    const d = new InvasionDirector(f.host, 5);
    f.run(d, 5);
    expect(d.current).toBeNull();
    f.run(d, 10);
    expect(d.current).not.toBeNull();
    expect(f.said.some((s) => s.what === 'open')).toBe(true);
    expect(f.mobs.length).toBeGreaterThanOrEqual(INVASION_MIN);
    expect(f.mobs.some((m) => m.kind === 'gilt_colossus')).toBe(true);
    expect(f.mobs.some((m) => m.kind === 'aurelion')).toBe(false);
    for (const m of f.mobs) {
      expect(isGildedKind(m.kind)).toBe(true);
      expect(m.bound).toBe(true);
      const dist = Math.hypot(m.body.x - p.x, m.body.z - p.z);
      expect(dist).toBeGreaterThanOrEqual(INVASION_KEEP_AWAY - 0.5);
    }
    // Never a pack: each is well apart from the others.
    for (let i = 0; i < f.mobs.length; i++) {
      for (let j = i + 1; j < f.mobs.length; j++) {
        const a = f.mobs[i].body;
        const b = f.mobs[j].body;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(INVASION_SPACING - 0.5);
      }
    }
  });

  it('lets a slot pass when nobody is in the world, and waits for the next one', () => {
    const players: RiftPlayer[] = [];
    const f = fake(players, Date.UTC(2026, 0, 1, 10, 29, 55));
    const d = new InvasionDirector(f.host, 5);
    f.run(d, 10);
    expect(d.current).toBeNull();
    expect(d.nextAt).toBe(Date.UTC(2026, 0, 1, 11, 0, 0));
    players.push(at(0, 0));
    f.run(d, 60);
    expect(d.current).toBeNull();
  });

  it('tries the next slot when there is no ground to stand on', () => {
    const p = at(0, 0);
    const f = fake([p], Date.UTC(2026, 0, 1, 10, 29, 55));
    f.host.standable = () => false;
    const d = new InvasionDirector(f.host, 5);
    f.run(d, 10);
    expect(d.current).toBeNull();
    expect(f.mobs).toHaveLength(0);
    expect(d.nextAt).toBe(Date.UTC(2026, 0, 1, 11, 0, 0));
  });
});

describe('the invasion', () => {
  const begin = (players: RiftPlayer[]) => {
    const f = fake(players, Date.UTC(2026, 0, 1, 10, 29, 59));
    const d = new InvasionDirector(f.host, 9);
    f.run(d, 2);
    expect(d.current).not.toBeNull();
    return { f, d };
  };

  it('is bigger for a bigger explored land, never beyond its cap', () => {
    const solo = begin([at(0, 0)]).f.mobs.length;
    expect(solo).toBeGreaterThanOrEqual(INVASION_MIN);
    expect(solo).toBeLessThanOrEqual(INVASION_CAP);
    const crowded = begin(Array.from({ length: 12 }, () => at(0, 0)));
    expect(crowded.f.mobs.length).toBeLessThanOrEqual(INVASION_CAP);
    expect(crowded.f.mobs.length).toBeGreaterThanOrEqual(solo);
  });

  it('ends when every golden creature is found', () => {
    const { f, d } = begin([at(0, 0)]);
    for (const m of f.mobs) m.dead = true;
    f.run(d, 2);
    expect(f.said.some((s) => s.what === 'slain')).toBe(true);
    expect(d.current).toBeNull();
    expect(d.nextAt).toBe(Date.UTC(2026, 0, 1, 11, 0, 0));
  });

  it('fades away after fifteen minutes if it is not beaten', () => {
    const { f, d } = begin([at(0, 0)]);
    f.run(d, INVASION_SECONDS - 10);
    expect(d.current).not.toBeNull();
    expect(f.alive().length).toBeGreaterThan(0);
    f.run(d, 20);
    expect(d.current).toBeNull();
    expect(f.alive()).toHaveLength(0);
    expect(f.said.at(-1)!.what).toBe('faded');
    expect(f.clock.now).toBeLessThan(d.nextAt);
  });

  it('ends quietly when everybody has gone', () => {
    const players = [at(0, 0)];
    const { f, d } = begin(players);
    players.length = 0;
    f.run(d, INVASION_ABANDON - 5);
    expect(d.current).not.toBeNull();
    f.run(d, 10);
    expect(d.current).toBeNull();
    expect(f.alive()).toHaveLength(0);
    expect(f.said.some((s) => s.what === 'faded')).toBe(false);
  });

  it('does not count a monster that a village took away as left', () => {
    const { f, d } = begin([at(0, 0)]);
    const total = d.view()!.left;
    f.gone.add(f.mobs[0]);
    f.gone.add(f.mobs[1]);
    f.run(d, 2);
    expect(d.view()!.left).toBe(total - 2);
  });

  it('starts when asked, once at a time', () => {
    const p = at(0, 0);
    const f = fake([p]);
    const d = new InvasionDirector(f.host, 3);
    expect(d.open([])).toBe(false);
    expect(d.open([p])).toBe(true);
    expect(d.open([p])).toBe(false);
  });

  it('rolls the same tide for the same seed', () => {
    const run = (seed: number) => {
      const f = fake([at(0, 0)]);
      const d = new InvasionDirector(f.host, seed);
      d.open([at(0, 0)]);
      return f.mobs.map((m) => `${m.kind}@${m.body.x},${m.body.z}`).join(';');
    };
    expect(run(21)).toBe(run(21));
    expect(run(21)).not.toBe(run(22));
  });

  it('says how far and which way', () => {
    expect(whereIs(0, 0, 0, -100)).toBe('100 blocks N');
    expect(whereIs(0, 0, 50, 0)).toBe('50 blocks E');
  });
});

// ---- in the realm ----------------------------------------------------------------------------------------------------

describe('the Gilded Tide in the realm', () => {
  const SEED = 1337;
  const FLOOR = 100;
  const frame = (): InputFrame => ({ t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false });

  function make(invasions: boolean, classId: 'warrior' | 'mage' | 'ranger' | null = 'mage') {
    const generator = new WorldGenerator(SEED);
    const world = new HeadlessWorld(generator);
    for (let x = -160; x <= 160; x++) {
      for (let z = -160; z <= 160; z++) {
        for (let y = FLOOR - 1; y <= FLOOR + 4; y++) world.setBlock(x, y, z, y < FLOOR ? B.STONE : B.AIR);
      }
    }
    const clock = { now: Date.UTC(2026, 0, 1, 10, 0, 0) };
    const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, invasions, clock: () => clock.now, rand: mulberry32(5), mode: 'survival', classId });
    s.finishLoading();
    s.teleport(0.5, FLOOR + 1, 0.5, 0, 0);
    s.tick(frame());
    s.drainEvents();
    return { s, clock };
  }

  it('has none unless it is switched on', () => {
    const { s } = make(false);
    expect(s.realm.invasions).toBeNull();
    expect(s.realm.startInvasion()).toBe(false);
    expect(s.realm.invasionViewFor(s)).toBeNull();
  });

  it('comes on the half hour by the realm clock, with a warning before it', () => {
    const { s, clock } = make(true);
    const inv = s.realm.invasions!;
    clock.now = Date.UTC(2026, 0, 1, 10, 25, 1);
    s.tick(frame());
    expect(s.drainEvents().some((e) => e.t === 'invasion' && e.what === 'omen')).toBe(true);
    expect(inv.current).toBeNull();
    clock.now = Date.UTC(2026, 0, 1, 10, 30, 1);
    s.tick(frame());
    expect(inv.current).not.toBeNull();
    const events = s.drainEvents();
    expect(events.some((e) => e.t === 'invasion' && e.what === 'open')).toBe(true);
    expect(s.realm.invasionViewFor(s)).toMatchObject({ left: expect.any(Number), seconds: expect.any(Number) });
  });

  it('hides shy golden creatures far from the player, that die into nothing but codices', () => {
    const { s } = make(true);
    expect(s.realm.startInvasion()).toBe(true);
    expect(s.realm.startInvasion()).toBe(false);
    const gilded = () => s.mobs.mobs.filter((m) => isGildedKind(m.kind) && !m.dead);
    expect(gilded().length).toBeGreaterThanOrEqual(INVASION_MIN);
    expect(gilded().every((m) => m.bound && !m.def.hostile && m.def.detect === 0)).toBe(true);
    expect(gilded().every((m) => Math.hypot(m.body.x - s.body.x, m.body.z - s.body.z) >= INVASION_KEEP_AWAY - 1)).toBe(true);
    expect(s.mobs.toJSON(0, 0, 500).some((m) => isGildedKind(m.kind))).toBe(false);

    const coins0 = s.coins;
    for (const m of gilded()) {
      m.sincePlayerHit = 0;
      s.mobs.damage(m, 99999, 0, 0, s.realm.mobEvents, true, false, true);
    }
    expect(s.coins).toBe(coins0);
    const dropped = s.realm.drops.drops.map((d) => d.stack);
    expect(dropped.length).toBeGreaterThan(0);
    expect(dropped.every((st) => st.id === I.AURELION_CODEX)).toBe(true);
    // All found: the Tide is over.
    s.realm.invasions!.update(1);
    expect(s.realm.invasions!.current).toBeNull();
  });

  it('never brings King Aurelion', () => {
    const { s } = make(true);
    expect(s.realm.startInvasion()).toBe(true);
    expect(s.mobs.mobs.some((m) => m.kind === 'aurelion')).toBe(false);
  });

  it('starts for a player in creative mode (the Tide is a hunt, not a fight)', () => {
    const { s } = make(true);
    s.setMode('creative');
    expect(s.mode).toBe('creative');
    expect(s.realm.startInvasion()).toBe(true);
    expect(s.realm.invasions?.current).not.toBeNull();
    expect(s.mobs.mobs.some((m) => isGildedKind(m.kind))).toBe(true);
  });
});

// ---- the codex -------------------------------------------------------------------------------------------------------

describe('the Codex of Aurelion', () => {
  const SEED = 1337;
  function make(classId: 'warrior' | 'mage' | 'ranger' | null, mode: 'survival' | 'creative' = 'survival') {
    const generator = new WorldGenerator(SEED);
    const world = new HeadlessWorld(generator);
    const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(8), mode, classId });
    s.finishLoading();
    s.teleport(0.5, 120, 0.5, 0, 0);
    s.tick({ t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false });
    s.clearInventory();
    s.drainEvents();
    return s;
  }
  const pieces = (s: GameSession) => {
    const out = [];
    for (let i = 0; i < 64; i++) {
      const st = s.inventory.get(i);
      if (st?.gear) out.push(st);
    }
    return out;
  };

  it('is an item you right-click, and it says what it does', () => {
    expect(getItem(I.AURELION_CODEX).use).toBe('codex');
  });

  it('opens into exactly one Epic piece of gear for the class, and is used up', () => {
    for (const cls of ['warrior', 'mage', 'ranger'] as const) {
      const s = make(cls);
      s.inventory.set(0, makeStack(I.AURELION_CODEX, 3));
      expect(s.openCodex(0)).toBe(true);
      expect(s.inventory.get(0)?.count).toBe(2);
      const got = pieces(s);
      expect(got).toHaveLength(1);
      expect(got[0].gear!.r).toBe(3);
      expect(got[0].gear!.c === undefined || got[0].gear!.c === cls).toBe(true);
      expect(s.drainEvents().some((e) => e.t === 'toast' && e.text.includes('epic gear'))).toBe(true);
    }
  });

  it('only ever gives Epic gear, whoever opens it', () => {
    const s = make('mage');
    s.inventory.set(0, makeStack(I.AURELION_CODEX, 24));
    for (let i = 0; i < 24; i++) s.openCodex(0);
    for (let i = 0; i < 64; i++) expect(s.inventory.get(i)?.id).not.toBe(I.AURELION_CODEX);
    const got = pieces(s);
    expect(got).toHaveLength(24);
    expect(new Set(got.map((g) => g.gear!.r))).toEqual(new Set([3]));
    const who = { id: 'mage' as const, level: s.cls!.level };
    for (const g of got) expect(g.gear!.l).toBeLessThanOrEqual(who.level + 2);
    expect(got.some((g) => gearUsable(g, who))).toBe(true);
  });

  it('opens with a right-click in the inventory screen, and not by a left click', () => {
    const s = make('ranger');
    s.inventory.set(12, makeStack(I.AURELION_CODEX, 1));
    s.apply({ t: 'inventory' });
    const menu = s.menu!;
    const slot = menu.slots.findIndex((sl) => sl.container === s.inventory && sl.index === 12);
    s.apply({ t: 'click', slot, button: 0 });
    expect(menu.cursor?.id).toBe(I.AURELION_CODEX);
    s.apply({ t: 'click', slot, button: 0 }); // put it back
    expect(pieces(s)).toHaveLength(0);
    s.apply({ t: 'click', slot, button: 1 });
    expect(menu.cursor).toBeNull();
    expect(s.inventory.get(12)).toBeNull();
    expect(pieces(s)).toHaveLength(1);
  });

  it('is not used up in creative mode, and not opened by the dead', () => {
    const c = make('mage', 'creative');
    c.inventory.set(0, makeStack(I.AURELION_CODEX, 1));
    expect(c.openCodex(0)).toBe(true);
    expect(c.inventory.get(0)?.count).toBe(1);

    const d = make('mage');
    d.inventory.set(0, makeStack(I.AURELION_CODEX, 1));
    d.vitals.health = 0;
    d.vitals.dead = true;
    expect(d.openCodex(0)).toBe(true);
    expect(d.inventory.get(0)?.count).toBe(1);
    expect(pieces(d)).toHaveLength(0);
  });

  it('is not a codex when it is something else', () => {
    const s = make('mage');
    s.inventory.set(0, makeStack(I.BOOK, 1));
    expect(s.openCodex(0)).toBe(false);
    expect(s.openCodex(5)).toBe(false);
  });
});
