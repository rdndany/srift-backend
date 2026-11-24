import type { FxKind } from './abilityEffects';
import type { Mob } from './mobs';
import type { BossFx } from './sessionProtocol';

/**
 * Boss fights, scripted the way an old MMO does it. A boss is not an ordinary monster that walks at you and hits: it has a
 * script (what it does, in what order, how often), phases that begin at fixed shares of its health, spells that it announces
 * with a cast bar and a mark on the ground (so that a player who watches can always get out of the way), and helpers it calls.
 *
 * The brain here is plain logic over a `Mob`: the realm gives it the players who are in the room, a way to leave marks, to
 * speak and to call helpers (`BossWorld`), and steps it every tick. It moves nothing by itself: while the king gathers a
 * spell the mob is held still (its `stunTime`), and between spells the ordinary monster behaviour walks him to the player
 * and swings (a boss is a zombie that is very large; see `MOBS.hollow_king`).
 */

/** The people in the room, as the boss sees them. */
export interface BossTarget {
  x: number;
  y: number;
  z: number;
  /** Hurt this person (the damage is before armor and the class's toughness, as a monster's blow is). `kx, kz` is the way it pushes. */
  hurt(amount: number, kx: number, kz: number): void;
}

/** What the realm lets a boss do. */
export interface BossWorld {
  /** Everybody alive in the boss's room. */
  targets(): BossTarget[];
  /** A helper: put a monster at a place. It is kept by the dungeon and comes at the players. */
  spawnAdd(kind: 'zombie' | 'skeleton', x: number, y: number, z: number): Mob;
  /** Let a helper go (the fight was reset): it is taken out of the world. */
  removeMob(m: Mob): void;
  /** A mark on the ground or in the air that everyone nearby sees (see `FxKind`). */
  mark(kind: FxKind, x: number, y: number, z: number, r: number, ttl: number): void;
  /** The boss speaks (`yell`) or the raid is warned (`warn`): shown to everybody in the room. */
  say(text: string, kind: 'yell' | 'warn'): void;
  /** The fight is over: the boss is dead (loot and credit are the realm's). */
  defeated(): void;
  /** The sound of the fight (see the `bossFx` event): heard by everybody in the copy. Optional: a world with no ears may leave it out. */
  fx?(e: BossFx): void;
  rand(): number;
}

/** The boss's room (x0..x1, z0..z1 inclusive, over a floor at `y`) and where it stands when asleep. */
export interface BossArenaDef {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  y: number;
  home: { x: number; y: number; z: number; yaw: number };
}

/** What the boss's own health bar shows (and what the interface of everybody in the fight draws). */
export interface BossView {
  name: string;
  /** The level its skull shows. */
  level: number;
  /** Health, 0..1, and in the game's own units (as the damage numbers are). */
  hp: number;
  health: number;
  max: number;
  /** Which phase of the fight it is in (1-based), and where the next ones begin (shares of health, falling). */
  phase: number;
  marks: number[];
  /** A spell being gathered: its name, how far along it is (0..1) and how long it takes. Left out when idle. */
  cast?: { name: string; t: number; seconds: number };
  /** Shielded by its helpers: most of what hits it is undone while any of them lives. */
  shield?: 1;
  /** Enraged: it hits harder and moves faster. */
  enraged?: 1;
  /** How many helpers are alive. */
  adds: number;
}

export type BossState = 'dormant' | 'fighting' | 'dead';

/** What a spell does. Damage is in the same units as a monster's blow (see `Mob`). */
export const KING = {
  name: 'The Hollow King',
  level: 8,
  /** How close a player must come to wake him. */
  wake: 17,
  /** The shares of health at which the second and third phases begin, and at which the second court is called. */
  phases: [0.7, 0.4] as readonly number[],
  court2: 0.22,
  /** Nobody in the room for this long and the fight starts over. */
  leash: 7,
  /** After this many seconds of fighting he stops waiting. */
  hardEnrage: 420,
  /** Most of what hits him is undone while his court lives. */
  shield: 0.65,
  /** The least time between one spell and the next. */
  gap: 1.8,
  slam: { name: 'Ember Slam', cast: 1.8, radius: 6.5, damage: 8, push: 9 },
  pillars: { name: 'Molten Pillars', cast: 1.3, delay: 2.3, radius: 2.5, damage: 7 },
  court: { name: 'Rise, My Court', cast: 2.6 },
  rain: { name: 'Cinder Rain', cast: 1, channel: 4.6, every: 0.42, delay: 1.35, radius: 2.1, damage: 4.5 },
  unbound: { name: 'Embers Unbound', cast: 2.2, damageMul: 1.4, haste: 1.22 },
  /** Seconds between each spell, by phase (the first is how long after the fight begins). */
  slamEvery: [16, 13, 10] as readonly number[],
  slamFirst: 10,
  pillarEvery: [24, 18, 14] as readonly number[],
  pillarFirst: 17,
  rainEvery: 21,
  rainFirst: 8,
} as const;

interface Strike {
  x: number;
  y: number;
  z: number;
  r: number;
  damage: number;
  wait: number;
  /** Which spell it came from (the sound of its landing). */
  spell: 'pillars' | 'rain';
}

/** How far the king walks between two of his footfalls (blocks). */
export const KING_STRIDE = 2.8;

interface Cast {
  id: 'slam' | 'pillars' | 'court' | 'rain' | 'unbound';
  name: string;
  total: number;
  left: number;
  /** Rain is channelled: strikes fall for as long as it lasts. */
  strikeIn: number;
}

const horizontal = (ax: number, az: number, bx: number, bz: number): number => Math.hypot(ax - bx, az - bz);

export class BossBrain {
  state: BossState = 'dormant';
  phase = 1;
  /** Seconds since the fight began. */
  time = 0;
  cast: Cast | null = null;
  adds: Mob[] = [];
  private pending: Strike[] = [];
  private nextSlam = 0;
  private nextPillars = 0;
  private nextRain = 0;
  private gap = 0;
  private alone = 0;
  private enraged = false;
  private courtsCalled = 0;
  private hardEnraged = false;
  private slamYelled = false;
  /** For the sound of him walking and swinging: where he stood at the last look, how far he has gone since his last footfall, and the last `attackTime` seen. */
  private lastX = Number.NaN;
  private lastZ = 0;
  private stride = 0;
  private lastAttack = 99;

  constructor(
    readonly mob: Mob,
    readonly arena: BossArenaDef,
    private readonly world: BossWorld,
  ) {
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  /** Is anything of his court still standing? */
  get shielded(): boolean {
    return this.adds.some((a) => !a.dead);
  }

  /** What the health bar shows. */
  view(): BossView {
    const m = this.mob;
    const k = KING;
    const display = (n: number): number => Math.max(0, Math.round(n));
    return {
      name: k.name,
      level: k.level,
      hp: Math.max(0, Math.min(1, m.health / m.maxHealth)),
      health: display(m.health),
      max: display(m.maxHealth),
      phase: this.phase,
      marks: [...k.phases, k.court2],
      ...(this.cast ? { cast: { name: this.cast.name, t: Math.max(0, Math.min(1, 1 - this.cast.left / this.cast.total)), seconds: this.cast.total } } : {}),
      ...(this.shielded ? { shield: 1 as const } : {}),
      ...(this.enraged ? { enraged: 1 as const } : {}),
      adds: this.adds.filter((a) => !a.dead).length,
    };
  }

  update(dt: number): void {
    const m = this.mob;
    if (this.state === 'dead') return;
    if (m.dead) {
      this.die();
      return;
    }
    const targets = this.world.targets();
    if (this.state === 'dormant') {
      // Asleep on his feet: he does nothing until somebody comes close (or hurts him from afar).
      m.stunTime = Math.max(m.stunTime, 0.5);
      const woken = m.health < m.maxHealth - 1e-6 || targets.some((t) => horizontal(t.x, t.z, m.body.x, m.body.z) <= KING.wake);
      if (woken) this.begin();
      return;
    }

    // Nobody left to fight: after a moment he goes back to his throne, whole, and the room is as it was.
    if (targets.length === 0) {
      this.alone += dt;
      if (this.alone >= KING.leash) this.reset();
      this.tickStrikes(dt, targets);
      return;
    }
    this.alone = 0;
    this.time += dt;
    this.listen();

    // His court shields him: most of what lands is undone while any of them stands.
    this.adds = this.adds.filter((a) => !a.dead);
    m.ward = this.adds.length > 0 ? KING.shield : 0;

    this.tickStrikes(dt, targets);
    this.advancePhase();

    if (this.cast) {
      this.stepCast(dt, targets);
      return;
    }
    this.gap -= dt;
    if (this.gap > 0 || m.stunTime > 0.05) return;
    this.chooseCast(targets);
  }

  // ---- the script ------------------------------------------------------------------------------------------

  /** Tell the realm of a sound of the fight, at the king's feet unless it says otherwise. */
  private sound(e: BossFx): void {
    const b = this.mob.body;
    this.world.fx?.({ x: b.x, y: b.y, z: b.z, ...e });
  }

  /** His footfalls (one every `KING_STRIDE` blocks walked) and his swings (the mob's `attackTime` starting over), for the sound of them. */
  private listen(): void {
    const m = this.mob;
    if (!Number.isNaN(this.lastX)) {
      const d = horizontal(m.body.x, m.body.z, this.lastX, this.lastZ);
      // (A jump of a few blocks in one look is a move of his own making, not a stride.)
      if (d < 2 && m.body.onGround) {
        this.stride += d;
        if (this.stride >= KING_STRIDE) {
          this.stride -= KING_STRIDE;
          this.sound({ what: 'step' });
        }
      }
    }
    this.lastX = m.body.x;
    this.lastZ = m.body.z;
    if (m.attackTime < this.lastAttack && m.attackTime < 1) this.sound({ what: 'swing' });
    this.lastAttack = m.attackTime;
  }

  private begin(): void {
    this.state = 'fighting';
    this.time = 0;
    this.phase = 1;
    this.lastX = Number.NaN;
    this.stride = 0;
    this.lastAttack = this.mob.attackTime;
    this.sound({ what: 'wake' });
    this.nextSlam = KING.slamFirst;
    this.nextPillars = KING.pillarFirst;
    this.nextRain = Infinity;
    this.gap = 1.5;
    this.mob.stunTime = 0;
    this.mob.aggro = true;
    this.world.say('Who dares wake the Hollow King? Kneel, or burn!', 'yell');
  }

  /** The phases begin at fixed shares of his health, and the courts at the thresholds set for them. */
  private advancePhase(): void {
    const hp = this.mob.health / this.mob.maxHealth;
    if (this.phase === 1 && hp <= KING.phases[0]) {
      this.phase = 2;
      this.sound({ what: 'phase', phase: 2 });
      this.nextSlam = this.time + 6;
      this.nextPillars = this.time + 12;
      this.queue('court');
      this.world.say('Rise, my court! Let the dead remember who rules them!', 'yell');
    }
    if (this.phase === 2 && hp <= KING.phases[1]) {
      this.phase = 3;
      this.sound({ what: 'phase', phase: 3 });
      this.nextSlam = this.time + 7;
      this.nextPillars = this.time + 11;
      this.nextRain = this.time + KING.rainFirst;
      this.queue('unbound');
      this.world.say('Embers... unbound! Burn with me!', 'yell');
    }
    if (this.phase === 3 && this.courtsCalled < 2 && hp <= KING.court2) this.queue('court');
    if (!this.hardEnraged && this.time >= KING.hardEnrage) {
      this.hardEnraged = true;
      this.setEnraged(KING.unbound.damageMul * 1.6, KING.unbound.haste * 1.15);
      this.world.say('My patience is ended!', 'warn');
    }
  }

  private forced: Cast['id'] | null = null;
  private queue(id: Cast['id']): void {
    this.forced = id;
    this.gap = Math.min(this.gap, 0);
  }

  private chooseCast(targets: BossTarget[]): void {
    const m = this.mob;
    const phase = this.phase;
    let id: Cast['id'] | null = null;
    if (this.forced) {
      id = this.forced;
      this.forced = null;
    } else if (this.time >= this.nextSlam) id = 'slam';
    else if (this.time >= this.nextPillars) id = 'pillars';
    else if (phase >= 3 && this.time >= this.nextRain) id = 'rain';
    if (!id) return;
    const spec =
      id === 'slam' ? KING.slam : id === 'pillars' ? KING.pillars : id === 'court' ? KING.court : id === 'rain' ? KING.rain : KING.unbound;
    if (id === 'slam') this.nextSlam = this.time + KING.slamEvery[phase - 1] + spec.cast;
    if (id === 'pillars') this.nextPillars = this.time + KING.pillarEvery[phase - 1] + spec.cast;
    if (id === 'rain') this.nextRain = this.time + KING.rainEvery + KING.rain.channel;
    const total = id === 'rain' ? KING.rain.cast + KING.rain.channel : spec.cast;
    this.cast = { id, name: spec.name, total, left: total, strikeIn: id === 'rain' ? KING.rain.cast : 0 };
    m.casting = 1;
    // He stands and faces whoever is nearest while he gathers it.
    let best: BossTarget | null = null;
    let bestD = Infinity;
    for (const t of targets) {
      const d = horizontal(t.x, t.z, m.body.x, m.body.z);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (best) m.yaw = Math.atan2(-(best.x - m.body.x), -(best.z - m.body.z));
    m.stunTime = total + 0.05;
    this.sound({ what: 'cast', spell: id, seconds: total });
    if (id === 'slam') {
      this.world.mark('boss_warn', m.body.x, m.body.y, m.body.z, KING.slam.radius, total + 0.1);
      if (!this.slamYelled) {
        this.slamYelled = true;
        this.world.say('Kneel!', 'yell');
      }
    }
    if (id === 'pillars') this.world.say('Molten Pillars: do not stand still!', 'warn');
    if (id === 'rain') this.world.say('Cinder Rain: keep moving!', 'warn');
  }

  private stepCast(dt: number, targets: BossTarget[]): void {
    const c = this.cast!;
    const m = this.mob;
    m.stunTime = Math.max(m.stunTime, dt + 0.05);
    c.left -= dt;
    if (c.id === 'rain' && c.left < c.total - KING.rain.cast) {
      c.strikeIn -= dt;
      while (c.strikeIn <= 0) {
        c.strikeIn += KING.rain.every;
        this.rainDrop(targets);
      }
    }
    if (c.left > 0) return;
    this.cast = null;
    m.casting = 0;
    m.stunTime = 0;
    this.gap = KING.gap;
    if (c.id === 'slam') this.slam(targets);
    else if (c.id === 'pillars') this.pillars(targets);
    else if (c.id === 'court') {
      this.sound({ what: 'release', spell: 'court' });
      this.court();
    } else if (c.id === 'unbound') {
      this.sound({ what: 'release', spell: 'unbound' });
      this.setEnraged(KING.unbound.damageMul, KING.unbound.haste);
    }
  }

  private slam(targets: BossTarget[]): void {
    const m = this.mob;
    const s = KING.slam;
    this.world.mark('boss_blast', m.body.x, m.body.y, m.body.z, s.radius, 0.9);
    this.sound({ what: 'release', spell: 'slam' });
    for (const t of targets) {
      const d = horizontal(t.x, t.z, m.body.x, m.body.z);
      if (d > s.radius || Math.abs(t.y - m.body.y) > 3.2) continue;
      const len = d || 1;
      t.hurt(s.damage * m.damageMul, (t.x - m.body.x) / len, (t.z - m.body.z) / len);
    }
  }

  /** One pillar on each person's feet (and one more where nobody stands, from the second phase), to fall after a moment. */
  private pillars(targets: BossTarget[]): void {
    const p = KING.pillars;
    const spots = targets.slice(0, 4).map((t) => ({ x: t.x, y: t.y, z: t.z }));
    if (this.phase >= 2) spots.push(this.randomSpot());
    for (const s of spots) this.strikeAt(s.x, s.y, s.z, p.radius, p.damage, p.delay, 'pillars');
  }

  private rainDrop(targets: BossTarget[]): void {
    const r = KING.rain;
    const t = targets[Math.floor(this.world.rand() * targets.length)];
    const spot = t ? { x: t.x + (this.world.rand() - 0.5) * 3, y: t.y, z: t.z + (this.world.rand() - 0.5) * 3 } : this.randomSpot();
    this.strikeAt(spot.x, spot.y, spot.z, r.radius, r.damage, r.delay, 'rain');
  }

  private randomSpot(): { x: number; y: number; z: number } {
    const a = this.arena;
    return {
      x: a.x0 + 2 + this.world.rand() * (a.x1 - a.x0 - 4),
      y: a.y,
      z: a.z0 + 2 + this.world.rand() * (a.z1 - a.z0 - 4),
    };
  }

  private strikeAt(x: number, y: number, z: number, r: number, damage: number, delay: number, spell: Strike['spell']): void {
    this.pending.push({ x, y, z, r, damage, wait: delay, spell });
    this.world.mark('boss_warn', x, y, z, r, delay + 0.1);
  }

  private tickStrikes(dt: number, targets: BossTarget[]): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const s = this.pending[i];
      s.wait -= dt;
      if (s.wait > 0) continue;
      this.pending.splice(i, 1);
      this.world.mark('boss_blast', s.x, s.y, s.z, s.r, 0.8);
      this.sound({ what: 'release', spell: s.spell, x: s.x, y: s.y, z: s.z });
      for (const t of targets) {
        if (horizontal(t.x, t.z, s.x, s.z) > s.r || Math.abs(t.y - s.y) > 3) continue;
        const len = horizontal(t.x, t.z, s.x, s.z) || 1;
        t.hurt(s.damage * this.mob.damageMul, (t.x - s.x) / len, (t.z - s.z) / len);
      }
    }
  }

  /** The court: dead men come out of the walls at the door end of the room. */
  private court(): void {
    const a = this.arena;
    this.courtsCalled++;
    const wave: ('zombie' | 'skeleton')[] = this.courtsCalled === 1 ? ['zombie', 'zombie', 'zombie', 'skeleton', 'skeleton'] : ['skeleton', 'skeleton', 'skeleton', 'skeleton', 'zombie', 'zombie'];
    const mid = (a.z0 + a.z1) / 2;
    wave.forEach((kind, i) => {
      const z = mid + (i - (wave.length - 1) / 2) * 2.6;
      const x = a.x0 + 3 + (i % 2) * 2;
      const add = this.world.spawnAdd(kind, x + 0.5, a.y, z + 0.5);
      this.adds.push(add);
    });
    this.world.say('His court shields him: put the dead down first!', 'warn');
  }

  private setEnraged(damageMul: number, haste: number): void {
    this.enraged = true;
    this.mob.damageMul = damageMul;
    this.mob.hasteMul = haste;
  }

  // ---- ending it -------------------------------------------------------------------------------------------

  private die(): void {
    this.state = 'dead';
    this.cast = null;
    this.mob.casting = 0;
    this.pending = [];
    this.mob.ward = 0;
    // His court falls with him.
    for (const a of this.adds) {
      if (a.dead) continue;
      a.dead = true;
      a.deathTime = 0;
      a.health = 0;
      a.noDrops = true;
    }
    this.adds = [];
    this.sound({ what: 'down' });
    this.world.say('The crown... is only ash...', 'yell');
    this.world.defeated();
  }

  /** Everyone is gone: he is well again and asleep, and what he called is sent away. */
  private reset(): void {
    const m = this.mob;
    for (const a of this.adds) this.world.removeMob(a);
    this.adds = [];
    this.pending = [];
    this.cast = null;
    m.casting = 0;
    m.health = m.maxHealth;
    m.damageMul = 1;
    m.hasteMul = 1;
    m.aggro = false;
    m.evade = false;
    m.threat.clear();
    m.tank = null;
    m.path = null;
    m.body.x = this.arena.home.x;
    m.body.y = this.arena.home.y;
    m.body.z = this.arena.home.z;
    m.body.vx = m.body.vy = m.body.vz = 0;
    m.yaw = this.arena.home.yaw;
    this.state = 'dormant';
    this.phase = 1;
    this.time = 0;
    this.alone = 0;
    this.enraged = false;
    this.hardEnraged = false;
    this.courtsCalled = 0;
    this.forced = null;
    this.slamYelled = false;
    this.lastX = Number.NaN;
    this.stride = 0;
    m.ward = 0;
    this.world.say('The dead do not rest... yet.', 'yell');
  }
}
