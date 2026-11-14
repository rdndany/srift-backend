import { describe, expect, it } from 'vitest';
import { B, GameSession, HeadlessWorld, I, WorldGenerator, mulberry32, type InputFrame, type Mob, type SessionEvent } from './index';

/**
 * What the ranger's weapons tell the player: an arrow that hits gives a number (a headshot hits half as hard again), an arrow that
 * strikes a wall stands in it, and the dagger in the off hand stabs while a bow is in the main hand, the third stab in a row going deeper.
 */

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

const generator = new WorldGenerator(SEED);
const world = new HeadlessWorld(generator);

/** A ranger on a clean stone platform looking towards -z, a bow and arrows in the hand and, when asked, a dagger in the off hand. */
function make(dagger: boolean, held: number = I.BOW) {
  for (let x = CX - 20; x <= CX + 20; x++)
    for (let z = CZ - 24; z <= CZ + 24; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 14; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.STONE);
    }
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(7), classId: 'ranger' });
  s.finishLoading();
  s.cls!.setModifiers([{ critChance: -1 }]);
  s.clearInventory();
  s.giveItem(held, 1);
  s.giveItem(I.ARROW, 16);
  s.selectSlot(0);
  s.offhand.set(0, dagger ? { id: I.DAGGER, count: 1, damage: 0 } : null);
  s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
  s.drainEvents();
  return s;
}

function zombie(s: GameSession, ahead: number): Mob {
  const id = s.spawnMob('zombie', CX + 0.5, FLOOR + 1, CZ + 0.5 - ahead);
  const m = s.mobs.mobs.find((v) => v.id === id)!;
  m.stunTime = 999;
  return m;
}

/** Draw the bow all the way, let go, and let the arrow fly. */
function shoot(s: GameSession, pitch = 0): SessionEvent[] {
  s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, pitch);
  s.drainEvents();
  const out: SessionEvent[] = [];
  for (let i = 0; i < 24; i++) s.tick(idle({ right: true, pitch }));
  s.tick(idle({ pitch }));
  for (let i = 0; i < 30; i++) {
    s.tick(idle({ pitch }));
    out.push(...(s.drainEvents() as SessionEvent[]));
  }
  return out;
}

const dealt = (es: SessionEvent[]) => es.flatMap((e) => (e.t === 'dmg' && !e.taken ? [e] : []));

describe('an arrow that finds its mark', () => {
  it('tells the archer what it did, and a headshot hits half as hard again', () => {
    const body = make(false);
    const z1 = zombie(body, 8);
    // aimed at the chest: the eye is at 1.62 and the zombie is 1.95 tall, so the crosshair on its chest is below the line
    const chest = dealt(shoot(body, -Math.atan2(1.62 - 1.0, 8)));
    expect(chest.length).toBe(1);
    expect(chest[0].arrow).toBe(true);
    expect(chest[0].head).toBeUndefined();
    expect(z1.health).toBeLessThan(z1.maxHealth);

    const aimed = make(false);
    zombie(aimed, 8);
    const head = dealt(shoot(aimed, -Math.atan2(1.62 - 1.85, 8)));
    expect(head.length).toBe(1);
    expect(head[0].head).toBe(true);
    expect(head[0].crit).toBe(true);
    expect(head[0].amount).toBeCloseTo(chest[0].amount * 1.5, 0);
  });

  it('a stuck arrow is left standing in the wall, pointing the way it flew', () => {
    const s = make(false);
    for (let y = FLOOR + 1; y <= FLOOR + 5; y++) for (let x = CX - 3; x <= CX + 3; x++) s.world.setBlock(x, y, CZ - 6, B.STONE);
    shoot(s, 0.02);
    const mark = s.fx.find((f) => f.k === 'arrow_stick');
    expect(mark).toBeTruthy();
    // where it went in: on the face of the wall that looks at the player (z = CZ - 5), not in the air before it
    expect(mark!.z).toBeGreaterThan(CZ - 5 - 0.01);
    expect(mark!.z).toBeLessThan(CZ - 5 + 0.3);
    expect(mark!.z2!).toBeLessThan(mark!.z);
    expect(mark!.ttl).toBeGreaterThan(2);
  });

  it('an arrow that hits a mob leaves no mark in the wall', () => {
    const s = make(false);
    zombie(s, 8);
    shoot(s, -Math.atan2(1.62 - 1.0, 8));
    expect(s.fx.some((f) => f.k === 'arrow_stick')).toBe(false);
  });
});

describe('the dagger', () => {
  /** Hold the attack button for a while and collect what the game said. */
  function stab(s: GameSession, ticks = 40, stay?: Mob): SessionEvent[] {
    const out: SessionEvent[] = [];
    for (let i = 0; i < ticks; i++) {
      // (a stabbed mob is pushed back: it is put back where it stood)
      if (stay) {
        stay.body.x = CX + 0.5;
        stay.body.z = CZ - 0.5;
        stay.body.vx = stay.body.vz = 0;
      }
      s.tick(idle({ left: true }));
      out.push(...(s.drainEvents() as SessionEvent[]));
    }
    return out;
  }

  it('stabs from the off hand while a bow is in the main hand, and the off hand is what swings', () => {
    const armed = make(true);
    const z = zombie(armed, 1);
    const a = stab(armed, 8);
    const hit = dealt(a)[0];
    expect(hit.blade).toBe(true);
    expect(hit.amount).toBeGreaterThan(2);
    expect(z.health).toBeLessThan(z.maxHealth);
    expect(a.some((e) => e.t === 'swing')).toBe(true);
    expect(a.filter((e) => e.t === 'swing').every((e) => e.t === 'swing' && e.off === true)).toBe(true);
  });

  it('a bow does not attack in melee: with no dagger in the off hand a left click does nothing', () => {
    for (const held of [I.BOW, I.CROSSBOW]) {
      const s = make(false, held);
      const z = zombie(s, 1);
      const es = stab(s, 20);
      expect(dealt(es).length).toBe(0);
      expect(es.some((e) => e.t === 'swing')).toBe(false);
      expect(z.health).toBe(z.maxHealth);
    }
  });

  it('the off-hand dagger is quick: three or more stabs in a second, like a dagger in the main hand', () => {
    const armed = make(true);
    const za = zombie(armed, 1);
    const main = make(false, I.DAGGER);
    const zm = zombie(main, 1);
    const off = dealt(stab(armed, 20, za)).length;
    expect(off).toBeGreaterThanOrEqual(3);
    expect(off).toBe(dealt(stab(main, 20, zm)).length);
  });

  it('the off-hand stabs make the same combo: the third in a row goes half as deep again', () => {
    const s = make(true);
    const z = zombie(s, 1);
    z.maxHealth = z.health = 1000;
    const hits = dealt(stab(s, 90, z));
    expect(hits.length).toBeGreaterThanOrEqual(6);
    expect(hits.map((h) => h.combo === true)).toEqual(hits.map((_, i) => i % 3 === 2));
    expect(hits[2].amount).toBeCloseTo(hits[0].amount * 1.5, 0);
  });

  it('goes half as deep again on the third stab in a row, and the count starts over after it', () => {
    const s = make(false, I.DAGGER);
    const z = zombie(s, 2);
    z.maxHealth = z.health = 1000;
    const hits = dealt(stab(s, 90, z));
    expect(hits.length).toBeGreaterThanOrEqual(6);
    const first = hits[0].amount;
    expect(hits.map((h) => h.combo === true)).toEqual(hits.map((_, i) => i % 3 === 2));
    expect(hits[1].amount).toBeCloseTo(first, 1);
    expect(hits[2].amount).toBeCloseTo(first * 1.5, 0);
    expect(hits[3].amount).toBeCloseTo(first, 1);
  });

  it('a slow hand loses the count: stabs more than a second apart are not a combo', () => {
    const s = make(false, I.DAGGER);
    const z = zombie(s, 2);
    z.maxHealth = z.health = 1000;
    const out: SessionEvent[] = [];
    for (let n = 0; n < 4; n++) {
      out.push(...stab(s, 2, z));
      for (let i = 0; i < 30; i++) s.tick(idle());
      out.push(...(s.drainEvents() as SessionEvent[]));
    }
    const hits = dealt(out);
    expect(hits.length).toBeGreaterThanOrEqual(3);
    expect(hits.some((h) => h.combo)).toBe(false);
  });

  it('the dagger of the off hand is short: a mob a few blocks off is out of reach, one right up against the player is not', () => {
    const far = make(true);
    const z = zombie(far, 2.5);
    expect(dealt(stab(far, 20)).length).toBe(0);
    expect(z.health).toBe(z.maxHealth);
    const near = make(true);
    zombie(near, 1);
    expect(dealt(stab(near, 20)).length).toBeGreaterThan(0);
  });

  it('a dagger in the main hand keeps the usual reach', () => {
    const s = make(false, I.DAGGER);
    zombie(s, 2.5);
    expect(dealt(stab(s, 20)).length).toBeGreaterThan(0);
  });

  /** Take `n` blows and count how many were turned aside (a parry or a dodge says so, and costs no health). */
  function blows(s: GameSession, n: number): { guards: SessionEvent[]; lost: number } {
    const guards: SessionEvent[] = [];
    let lost = 0;
    for (let i = 0; i < n; i++) {
      const before = s.vitals.health;
      s.vitals.sinceHit = 10;
      s.drainEvents();
      s.hurtByMob(1, 0, 1, 'zombie');
      guards.push(...(s.drainEvents() as SessionEvent[]).filter((e) => e.t === 'guard'));
      lost += before - s.vitals.health;
      s.vitals.health = before;
    }
    return { guards, lost };
  }

  it('while stabbing, one blow in fifty is parried or dodged', () => {
    const s = make(true);
    zombie(s, 1);
    expect(dealt(stab(s, 6)).length).toBeGreaterThan(0);
    const n = 5000;
    const { guards, lost } = blows(s, n);
    expect(guards.length).toBeGreaterThan(n * 0.01);
    expect(guards.length).toBeLessThan(n * 0.035);
    // each one that was turned aside cost nothing
    expect(lost).toBeCloseTo(n - guards.length, 0);
    const kinds = new Set(guards.map((g) => (g.t === 'guard' ? g.what : '')));
    expect(kinds.has('parry')).toBe(true);
    expect(kinds.has('dodge')).toBe(true);
  });

  it('the same with the dagger in the main hand, and never when it is not stabbing', () => {
    const main = make(false, I.DAGGER);
    zombie(main, 1);
    expect(dealt(stab(main, 6)).length).toBeGreaterThan(0);
    expect(blows(main, 3000).guards.length).toBeGreaterThan(10);

    const still = make(true);
    expect(blows(still, 3000).guards.length).toBe(0);

    // a moment after the last stab the guard is gone
    const late = make(true);
    zombie(late, 1);
    stab(late, 6);
    for (let i = 0; i < 30; i++) late.tick(idle());
    expect(blows(late, 3000).guards.length).toBe(0);
  });

  it('in the main hand it is the same quick weapon', () => {
    const s = make(false, I.DAGGER);
    zombie(s, 2);
    const es = stab(s, 20);
    const hit = dealt(es)[0];
    expect(hit.blade).toBe(true);
    expect(es.filter((e) => e.t === 'swing').every((e) => e.t === 'swing' && e.off !== true)).toBe(true);
  });
});
