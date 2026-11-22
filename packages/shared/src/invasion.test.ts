import { describe, expect, it } from 'vitest';
import { B, GameSession, GILDED_KINDS, HeadlessWorld, I, MOBS, Mob, MobManager, WorldGenerator, isGildedKind, makeStack, mobLevel, mulberry32, type InputFrame, type MobEnv, type MobEvents, type RiftPlayer } from './index';
import {
  INVASION_ABANDON,
  INVASION_AFTER,
  INVASION_BOSS_AT,
  INVASION_CAP,
  INVASION_PERIOD,
  INVASION_SECONDS,
  INVASION_SWARM,
  InvasionDirector,
  nextInvasionAt,
  scaleFor,
  whereIs,
  type InvasionEventKind,
  type InvasionHost,
} from './invasion';
import { gearUsable } from './gear';

// ---- the monsters and their one drop ---------------------------------------------------------------------------------

describe('the monsters of the Gilded Tide', () => {
  it('are five hostile kinds, one of them a boss, none of them born by the spawner', () => {
    expect([...GILDED_KINDS]).toEqual(['gilt_imp', 'gilt_hound', 'gilt_drake', 'gilt_colossus', 'aurelion']);
    for (const k of GILDED_KINDS) {
      expect(MOBS[k].hostile).toBe(true);
      expect(MOBS[k].kind).toBe(k);
      expect(isGildedKind(k)).toBe(true);
      expect(mobLevel(k)).toBeGreaterThan(5);
    }
    expect(MOBS.aurelion.boss).toBe(true);
    expect(GILDED_KINDS.filter((k) => MOBS[k].boss)).toEqual(['aurelion']);
    expect(isGildedKind('zombie')).toBe(false);
    // they get tougher and hit harder as they get bigger
    const order = ['gilt_imp', 'gilt_hound', 'gilt_drake', 'gilt_colossus', 'aurelion'] as const;
    for (let i = 1; i < order.length; i++) {
      expect(MOBS[order[i]].health).toBeGreaterThan(MOBS[order[i - 1]].health);
      expect(MOBS[order[i]].melee!.damage).toBeGreaterThan(MOBS[order[i - 1]].melee!.damage);
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
    // an imp leaves one now and then; a colossus always leaves one at least; the king leaves a hoard
    expect(total.gilt_imp).toBeGreaterThan(0);
    expect(total.gilt_imp).toBeLessThan(400);
    expect(total.gilt_colossus).toBeGreaterThanOrEqual(400);
    expect(total.aurelion).toBeGreaterThanOrEqual(400 * 6);
    expect(total.aurelion).toBeLessThanOrEqual(400 * 9);
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

// ---- the director ----------------------------------------------------------------------------------------------------

interface Said {
  what: InvasionEventKind;
  text: string;
  at?: [number, number];
}

const at = (x: number, z: number): RiftPlayer => ({ ref: {}, x, y: 65, z });

/** A flat, empty world with a clock of its own: everything is ground, nothing is forbidden. */
function fake(players: RiftPlayer[], start = Date.UTC(2026, 0, 1, 10, 0, 0)) {
  const clock = { now: start };
  const said: Said[] = [];
  const mobs: Mob[] = [];
  const gone = new Set<Mob>();
  const puffs: number[] = [];
  const host: InvasionHost = {
    now: () => clock.now,
    players: () => players,
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
  return { host, clock, said, mobs, gone, puffs, run, alive };
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

  it('begins on the half hour, with the swarm round the players and a call to everybody', () => {
    const p = at(0, 0);
    const f = fake([p], Date.UTC(2026, 0, 1, 10, 29, 50));
    const d = new InvasionDirector(f.host, 5);
    f.run(d, 5);
    expect(d.current).toBeNull();
    f.run(d, 10);
    expect(d.current).not.toBeNull();
    expect(f.said.some((s) => s.what === 'open')).toBe(true);
    const swarm = INVASION_SWARM.reduce((n, s) => n + s.count, 0);
    expect(f.mobs).toHaveLength(swarm);
    for (const m of f.mobs) {
      expect(isGildedKind(m.kind)).toBe(true);
      expect(m.kind).not.toBe('aurelion');
      expect(m.bound).toBe(true);
      expect(m.guard).toBe(false);
      // out of sight but within the reach of their noses: 38 to 58 blocks off, and a few more for the spread
      const dist = Math.hypot(m.body.x - p.x, m.body.z - p.z);
      expect(dist).toBeGreaterThan(28);
      expect(dist).toBeLessThan(70);
      expect(dist).toBeLessThan(MOBS[m.kind].detect);
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

  it('is bigger for a bigger group, never beyond its cap, and sent to each group of players alone', () => {
    expect(scaleFor(1)).toBe(1);
    expect(scaleFor(3)).toBeGreaterThan(scaleFor(2));
    expect(scaleFor(40)).toBe(2.5);
    const solo = begin([at(0, 0)]).f.mobs.length;
    const trio = begin([at(0, 0), at(3, 3), at(-2, 4)]).f.mobs.length;
    expect(trio).toBeGreaterThan(solo);
    // two groups far apart each get a swarm of their own
    const far = begin([at(0, 0), at(1000, 1000)]);
    expect(far.f.mobs).toHaveLength(solo * 2);
    const near = far.f.mobs.filter((m) => Math.hypot(m.body.x, m.body.z) < 100).length;
    expect(near).toBe(solo);
    const crowd = begin(Array.from({ length: 30 }, () => at(0, 0)));
    expect(crowd.f.mobs.length).toBeLessThanOrEqual(INVASION_CAP);
  });

  it('brings Aurelion in after two minutes, with an escort, and tells everybody where', () => {
    const p = at(0, 0);
    const { f, d } = begin([p]);
    const before = f.mobs.length;
    f.run(d, INVASION_BOSS_AT - 5);
    expect(f.mobs.some((m) => m.kind === 'aurelion')).toBe(false);
    expect(d.view()!.boss).toBe('coming');
    expect(d.view()!.bossIn).toBeGreaterThan(0);
    f.run(d, 10);
    const kings = f.mobs.filter((m) => m.kind === 'aurelion');
    expect(kings).toHaveLength(1);
    expect(f.mobs.length).toBeGreaterThan(before + 1);
    expect(kings[0].bound).toBe(true);
    const said = f.said.find((s) => s.what === 'boss')!;
    expect(said.at).toBeDefined();
    expect(Math.hypot(said.at![0] - p.x, said.at![1] - p.z)).toBeGreaterThan(30);
    expect(d.view()).toMatchObject({ phase: 'fighting', boss: 'alive', bossIn: 0 });
    f.run(d, 60); // he comes only once
    expect(f.mobs.filter((m) => m.kind === 'aurelion')).toHaveLength(1);
  });

  it('ends when Aurelion falls: the stragglers have a little longer, then the tide breaks up', () => {
    const { f, d } = begin([at(0, 0)]);
    f.run(d, INVASION_BOSS_AT + 5);
    const king = f.mobs.find((m) => m.kind === 'aurelion')!;
    king.dead = true;
    f.run(d, 1);
    expect(f.said.some((s) => s.what === 'slain')).toBe(true);
    expect(d.view()).toMatchObject({ phase: 'ending', boss: 'slain' });
    const stragglers = f.alive().length;
    expect(stragglers).toBeGreaterThan(0);
    f.run(d, INVASION_AFTER - 5);
    expect(d.current).not.toBeNull();
    f.run(d, 10);
    expect(d.current).toBeNull();
    expect(f.alive()).toHaveLength(0);
    expect(f.puffs.length).toBe(stragglers);
    // the next one is on the next half hour, not sooner
    expect(d.nextAt).toBe(Date.UTC(2026, 0, 1, 11, 0, 0));
    expect(f.said.some((s) => s.what === 'faded')).toBe(false);
  });

  it('ends at once when everything has been killed after he fell', () => {
    const { f, d } = begin([at(0, 0)]);
    f.run(d, INVASION_BOSS_AT + 5);
    for (const m of f.mobs) m.dead = true;
    f.run(d, 2);
    expect(d.current).toBeNull();
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
    // and the world is quiet until the half hour
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
    for (let x = -110; x <= 110; x++) {
      for (let z = -110; z <= 110; z++) {
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
    expect(s.realm.invasionViewFor(s)).toMatchObject({ phase: 'fighting', boss: 'coming' });
  });

  it('fills the world with hunting monsters that die into nothing but codices, and pays xp but no coins', () => {
    const { s } = make(true);
    expect(s.realm.startInvasion()).toBe(true);
    expect(s.realm.startInvasion()).toBe(false);
    const gilded = () => s.mobs.mobs.filter((m) => isGildedKind(m.kind) && !m.dead);
    expect(gilded().length).toBeGreaterThan(10);
    expect(gilded().every((m) => m.bound && m.def.hostile)).toBe(true);
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
  });

  it('hunts the player down from where it spawned', () => {
    const { s } = make(true);
    expect(s.realm.startInvasion()).toBe(true);
    const gilded = () => s.mobs.mobs.filter((m) => isGildedKind(m.kind) && !m.dead);
    const nearest = () => Math.min(...gilded().map((m) => Math.hypot(m.body.x - s.body.x, m.body.z - s.body.z)));
    const start = nearest();
    expect(start).toBeGreaterThan(28);
    for (let i = 0; i < 20 * 25; i++) s.tick(frame());
    // after 25 seconds something has reached the player (or the player has already been brought down by it)
    expect(s.vitals.dead || nearest() < 6).toBe(true);
    expect(gilded().length).toBeGreaterThan(10);
  });

  it('gives the king a hoard of codices and nothing else, boss or not', () => {
    const { s } = make(true);
    expect(s.realm.startInvasion()).toBe(true);
    const inv = s.realm.invasions!;
    for (let t = 0; t < INVASION_BOSS_AT + 2; t += 0.5) inv.update(0.5);
    const king = s.mobs.mobs.find((m) => m.kind === 'aurelion')!;
    expect(king).toBeDefined();
    const before = s.realm.drops.drops.length;
    king.sincePlayerHit = 0;
    s.mobs.damage(king, 1e9, 0, 0, s.realm.mobEvents, true, false, true);
    const fresh = s.realm.drops.drops.slice(before).map((d) => d.stack);
    const codices = fresh.reduce((n, st) => n + st.count, 0);
    expect(codices).toBeGreaterThanOrEqual(6);
    expect(fresh.every((st) => st.id === I.AURELION_CODEX && !st.gear)).toBe(true);
    inv.update(1);
    expect(s.realm.invasionViewFor(s)).toMatchObject({ phase: 'ending', boss: 'slain' });
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
    expect(getItemUse()).toBe('codex');
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
    // near the level of the character, and usable by a character of that class and level
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

import { getItem } from './index';
function getItemUse(): string | undefined {
  return getItem(I.AURELION_CODEX).use ?? undefined;
}
