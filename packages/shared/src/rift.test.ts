import { describe, expect, it } from 'vitest';
import { B, GameSession, HeadlessWorld, MOBS, Mob, WorldGenerator, mulberry32, type InputFrame } from './index';
import { RIFT_ABANDON, RIFT_AFTER, RIFT_FIRST, RIFT_GRADES, RIFT_GRADE_DEFS, RIFT_OMEN, RIFT_PAUSE, RIFT_PRESENCE, RIFT_SIGHT, RiftDirector, compass, type RiftEventKind, type RiftGrade, type RiftHost, type RiftPlayer } from './rift';

interface Said {
  what: RiftEventKind;
  text: string;
}

/** A flat, empty world to run the director in: everything is ground, nothing is forbidden. */
function fake(players: RiftPlayer[]) {
  const said: Said[] = [];
  const paid: { player: RiftPlayer; rank: number; helpers: number }[] = [];
  const mobs: Mob[] = [];
  const removed: Mob[] = [];
  const host: RiftHost = {
    players: () => players,
    groundAt: () => 64,
    standable: () => true,
    allowed: () => true,
    spawn: (kind, x, y, z) => {
      const m = new Mob(mobs.length + 1, kind, x, y, z, mulberry32(mobs.length + 1));
      mobs.push(m);
      return m;
    },
    remove: (m) => removed.push(m),
    announce: (what, _grade, text) => said.push({ what, text }),
    reward: (player, _grade, rank, helpers) => paid.push({ player, rank, helpers }),
  };
  return { host, said, paid, mobs, removed };
}

const at = (x: number, z: number): RiftPlayer => ({ ref: {}, x, y: 65, z });

/** Run the director for this many seconds in half-second steps. */
function run(d: RiftDirector, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.5) d.update(0.5);
}

function killWave(d: RiftDirector, mobs: Mob[], near: RiftPlayer[]): void {
  for (const m of mobs) {
    if (m.dead || m.rift === 0) continue;
    m.dead = true;
    d.onKill(m, near);
  }
}

describe('the rift tables', () => {
  it('only name monsters that exist, and escalate: more waves, a warden last, better pay', () => {
    let waves = 0;
    let xp = 0;
    for (const g of RIFT_GRADES) {
      const def = RIFT_GRADE_DEFS[g];
      for (const w of def.waves) for (const s of w) expect(MOBS[s.kind], `${g} ${s.kind}`).toBeDefined();
      expect(def.waves.length).toBeGreaterThan(waves);
      expect(def.reward.xp).toBeGreaterThan(xp);
      expect(def.waves[def.waves.length - 1].some((s) => s.elite)).toBe(true);
      waves = def.waves.length;
      xp = def.reward.xp;
    }
  });

  it('gives a compass point for a direction (north is toward -z)', () => {
    expect(compass(0, -10)).toBe('N');
    expect(compass(10, 0)).toBe('E');
    expect(compass(0, 10)).toBe('S');
    expect(compass(-10, 0)).toBe('W');
    expect(compass(10, -10)).toBe('NE');
  });
});

describe('the rift director', () => {
  it('waits for a player, then opens the first rift after its time and announces it', () => {
    const f = fake([]);
    const d = new RiftDirector(f.host, 1);
    run(d, RIFT_FIRST * 2);
    expect(d.current).toBeNull();
    const p = at(0, 0);
    const g = fake([p]);
    const d2 = new RiftDirector(g.host, 1);
    run(d2, RIFT_FIRST - 5);
    expect(d2.current).toBeNull();
    run(d2, 10);
    expect(d2.current?.phase).toBe('omen');
    expect(g.said.map((s) => s.what)).toEqual(['omen']);
    // 45..80 blocks from the player
    const r = d2.current!;
    const dist = Math.hypot(r.x - p.x, r.z - p.z);
    expect(dist).toBeGreaterThanOrEqual(44);
    expect(dist).toBeLessThanOrEqual(81);
  });

  it('rolls the same rift for the same seed, whatever else is rolled', () => {
    const a = fake([at(0, 0)]);
    const b = fake([at(0, 0)]);
    const da = new RiftDirector(a.host, 77);
    const db = new RiftDirector(b.host, 77);
    da.open(a.host.players());
    db.open(b.host.players());
    expect([da.current!.grade, da.current!.x, da.current!.z]).toEqual([db.current!.grade, db.current!.x, db.current!.z]);
  });

  it('opens after the omen and sends the first wave, bound to its post, with a warden in the last', () => {
    const p = at(0, 0);
    const f = fake([p]);
    const d = new RiftDirector(f.host, 3);
    d.open([p], 'rare');
    const r = d.current!;
    p.x = r.x;
    p.z = r.z;
    run(d, RIFT_OMEN - 1);
    expect(r.phase).toBe('omen');
    expect(f.mobs).toHaveLength(0);
    run(d, 2);
    expect(r.phase).toBe('fighting');
    const first = RIFT_GRADE_DEFS.rare.waves[0].reduce((n, s) => n + s.count, 0);
    expect(f.mobs).toHaveLength(first);
    for (const m of f.mobs) {
      expect(m.rift).toBe(r.id);
      expect(m.bound && m.guard).toBe(true);
      expect(m.homeX).toBe(r.x);
      expect(Math.hypot(m.body.x - r.x, m.body.z - r.z)).toBeLessThanOrEqual(11);
    }
    // the last wave brings the warden
    for (let i = 0; i < RIFT_GRADE_DEFS.rare.waves.length - 1; i++) {
      killWave(d, f.mobs, [p]);
      run(d, RIFT_PAUSE + 1);
    }
    const warden = f.mobs.filter((m) => m.elite);
    expect(warden).toHaveLength(1);
    expect(warden[0].maxHealth).toBeGreaterThan(MOBS[warden[0].kind].health * 3);
    expect(warden[0].health).toBe(warden[0].maxHealth);
    expect(f.said.some((s) => s.text.includes('warden'))).toBe(true);
  });

  it('sends bigger waves when more players are at the rift', () => {
    const sizes: number[] = [];
    for (const n of [1, 3]) {
      const ps = Array.from({ length: n }, () => at(0, 0));
      const f = fake(ps);
      const d = new RiftDirector(f.host, 5);
      d.open(ps, 'uncommon');
      for (const p of ps) {
        p.x = d.current!.x;
        p.z = d.current!.z;
      }
      run(d, RIFT_OMEN + 1);
      sizes.push(f.mobs.length);
    }
    expect(sizes[1]).toBeGreaterThan(sizes[0]);
  });

  it('seals when the last wave falls and pays only those who fought, the best first', () => {
    const [a, b, lazy, far] = [at(0, 0), at(0, 0), at(0, 0), at(0, 0)];
    const f = fake([a, b, lazy, far]);
    const d = new RiftDirector(f.host, 9);
    d.open([a, b, lazy, far], 'uncommon');
    const r = d.current!;
    for (const p of [a, b, lazy]) {
      p.x = r.x + 2;
      p.z = r.z;
    }
    far.x = r.x + 4000;
    far.z = r.z;
    // (the one far away does not hold the rift open: the others finish it)
    run(d, RIFT_OMEN + 0.5);
    const waves = RIFT_GRADE_DEFS.uncommon.waves.length;
    for (let i = 0; i < waves; i++) {
      // `a` does the most of the killing, `b` some; `lazy` only stands there for a moment
      const alive = f.mobs.filter((m) => !m.dead);
      alive.forEach((m, k) => {
        m.dead = true;
        d.onKill(m, k % 3 === 0 ? [b] : [a]);
      });
      run(d, RIFT_PAUSE + 0.5);
    }
    expect(r.phase).toBe('sealed');
    expect(f.said.at(-1)?.what).toBe('sealed');
    // `lazy` was there long enough to be counted too, but far was not
    expect(f.paid.map((x) => x.player)).toContain(a);
    expect(f.paid.map((x) => x.player)).toContain(b);
    expect(f.paid.map((x) => x.player)).not.toContain(far);
    expect(f.paid[0].player).toBe(a);
    expect(f.paid[0].rank).toBe(1);
    expect(f.paid[0].helpers).toBe(f.paid.length);
  });

  it('does not pay someone who only walked by', () => {
    const [a, passer] = [at(0, 0), at(0, 0)];
    const f = fake([a, passer]);
    const d = new RiftDirector(f.host, 11);
    d.open([a, passer], 'uncommon');
    const r = d.current!;
    a.x = r.x;
    a.z = r.z;
    passer.x = r.x + 300;
    passer.z = r.z;
    run(d, RIFT_OMEN + 0.5);
    // the passer comes for a few seconds only, after the last wave has begun
    for (let i = 0; i < RIFT_GRADE_DEFS.uncommon.waves.length; i++) {
      if (i === RIFT_GRADE_DEFS.uncommon.waves.length - 1) {
        passer.x = r.x;
        run(d, RIFT_PRESENCE / 4);
        passer.x = r.x + 300;
      }
      killWave(d, f.mobs, [a]);
      run(d, RIFT_PAUSE + 0.5);
    }
    expect(f.paid.map((x) => x.player)).toEqual([a]);
  });

  it('collapses when it takes too long, taking its monsters with it, then lets the next one come', () => {
    const p = at(0, 0);
    const f = fake([p]);
    const d = new RiftDirector(f.host, 13);
    d.open([p], 'uncommon');
    const r = d.current!;
    p.x = r.x;
    p.z = r.z;
    run(d, RIFT_OMEN + 1);
    expect(f.mobs.length).toBeGreaterThan(0);
    run(d, RIFT_GRADE_DEFS.uncommon.seconds + 5);
    expect(r.phase).toBe('collapsed');
    expect(f.removed.length).toBe(f.mobs.length);
    expect(f.paid).toHaveLength(0);
    expect(f.said.at(-1)?.what).toBe('collapsed');
    run(d, RIFT_AFTER + 1);
    expect(d.current).toBeNull();
    expect(d.next).toBeGreaterThan(800);
  });

  it('collapses when everyone has left it', () => {
    const p = at(0, 0);
    const f = fake([p]);
    const d = new RiftDirector(f.host, 15);
    d.open([p], 'rare');
    const r = d.current!;
    p.x = r.x;
    p.z = r.z;
    run(d, RIFT_OMEN + 1);
    p.x = r.x + 500;
    run(d, RIFT_ABANDON - 5);
    expect(r.phase).toBe('fighting');
    run(d, 10);
    expect(r.phase).toBe('collapsed');
  });

  it('tells a player of it only when it is in sight, with the wave and the monsters left', () => {
    const p = at(0, 0);
    const f = fake([p]);
    const d = new RiftDirector(f.host, 17);
    expect(d.viewFor(p)).toBeNull();
    d.open([p], 'epic');
    const r = d.current!;
    const omen = d.viewFor(p)!;
    expect(omen.phase).toBe('omen');
    expect(omen.seconds).toBe(RIFT_OMEN);
    expect(omen.name).toBe(RIFT_GRADE_DEFS.epic.name);
    expect(omen.waves).toBe(RIFT_GRADE_DEFS.epic.waves.length);
    p.x = r.x;
    p.z = r.z;
    run(d, RIFT_OMEN + 0.5);
    const v = d.viewFor(p)!;
    expect(v.phase).toBe('fighting');
    expect(v.wave).toBe(1);
    expect(v.left).toBe(f.mobs.length);
    expect(v.seconds).toBeLessThanOrEqual(RIFT_GRADE_DEFS.epic.seconds);
    expect(d.viewFor({ ref: {}, x: r.x + RIFT_SIGHT + 10, y: 0, z: r.z })).toBeNull();
  });

  it('finds no place on bad ground and tries again soon', () => {
    const p = at(0, 0);
    const f = fake([p]);
    f.host.standable = () => false;
    const d = new RiftDirector(f.host, 19);
    expect(d.open([p])).toBe(false);
    expect(d.current).toBeNull();
    expect(d.next).toBeLessThan(60);
  });
});

describe('rifts in the realm', () => {
  const SEED = 1337;
  const FLOOR = 100;
  const frame = (): InputFrame => ({ t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false });

  function make(rifts: boolean) {
    const generator = new WorldGenerator(SEED);
    const world = new HeadlessWorld(generator);
    // a flat stone yard round the player, wide enough for a rift to open on it
    for (let x = -110; x <= 110; x++) {
      for (let z = -110; z <= 110; z++) {
        for (let y = FLOOR - 1; y <= FLOOR + 4; y++) world.setBlock(x, y, z, y < FLOOR ? B.STONE : B.AIR);
      }
    }
    const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rifts, rand: mulberry32(5), mode: 'survival' });
    s.finishLoading();
    s.teleport(0.5, FLOOR + 1, 0.5, 0, 0);
    s.tick(frame());
    s.drainEvents();
    return s;
  }

  it('has none unless it is switched on', () => {
    const s = make(false);
    expect(s.realm.rifts).toBeNull();
    expect(s.realm.startRift('rare')).toBe(false);
    expect(s.riftView()).toBeNull();
  });

  it('opens one near the player, fills it with monsters that stay at their post, and pays when it is sealed', () => {
    const s = make(true);
    expect(s.realm.startRift('uncommon')).toBe(true);
    const v0 = s.riftView()!;
    expect(v0.phase).toBe('omen');
    expect(s.drainEvents().some((e) => e.t === 'rift' && e.what === 'omen' && e.text.includes('blocks'))).toBe(true);
    // go to it
    s.teleport(v0.x, FLOOR + 1, v0.z, 0, 0);
    const rifts = s.realm.rifts!;
    for (let t = 0; t < RIFT_OMEN + 1; t += 0.5) rifts.update(0.5);
    const mine = () => s.mobs.mobs.filter((m) => m.rift !== 0 && !m.dead);
    expect(mine().length).toBeGreaterThan(0);
    expect(s.riftView()!.left).toBe(mine().length);
    // the sun does not burn them
    expect(mine().every((m) => !m.burning)).toBe(true);
    // they are never put in a save
    expect(s.mobs.toJSON(v0.x, v0.z, 200).every((m) => !mine().some((q) => q.kind === m.kind && Math.abs(q.body.x - m.x) < 0.01 && Math.abs(q.body.z - m.z) < 0.01))).toBe(true);

    const xp0 = s.xp.total;
    const coins0 = s.coins;
    const waves = RIFT_GRADE_DEFS.uncommon.waves.length;
    for (let i = 0; i < waves; i++) {
      for (const m of mine()) {
        m.sincePlayerHit = 0;
        s.mobs.damage(m, 99999, 0, 0, s.realm.mobEvents, true, false, true);
      }
      for (let t = 0; t < RIFT_PAUSE + 1; t += 0.5) rifts.update(0.5);
    }
    expect(rifts.current?.phase).toBe('sealed');
    const events = s.drainEvents();
    expect(events.some((e) => e.t === 'rift' && e.what === 'sealed')).toBe(true);
    expect(events.some((e) => e.t === 'toast' && e.text.includes(RIFT_GRADE_DEFS.uncommon.name))).toBe(true);
    // the kills paid, and so did the rift (at least its xp and coins)
    expect(s.xp.total - xp0).toBeGreaterThanOrEqual(RIFT_GRADE_DEFS.uncommon.reward.xp);
    expect(s.coins - coins0).toBeGreaterThanOrEqual(RIFT_GRADE_DEFS.uncommon.reward.coins);
    expect(s.riftView()!.phase).toBe('sealed');
  });

  it('does not open a rift on a player in creative mode', () => {
    const s = make(true);
    s.setMode('creative');
    expect(s.realm.startRift('rare')).toBe(false);
  });

  it('every grade can be rolled', () => {
    const seen = new Set<RiftGrade>();
    for (let seed = 0; seed < 200 && seen.size < 3; seed++) {
      const p = at(0, 0);
      const f = fake([p]);
      const d = new RiftDirector(f.host, seed);
      d.open([p]);
      seen.add(d.current!.grade);
    }
    expect(seen.size).toBe(3);
  });
});
