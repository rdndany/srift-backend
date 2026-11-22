import type { Mob, MobKind } from './mobs';

/**
 * Rifts: a tear in the world opens now and then near the players, and a few waves of monsters come out of it (stronger and stronger,
 * the last with a warden). Everybody who helps close it is paid. It is the world's own event: nobody starts it, it announces itself with
 * a beam of light over the place, and it ends sealed (the waves are beaten) or collapsed (too long, or nobody was near).
 *
 * The rules live here and know nothing of the realm: `RiftDirector` is driven by a host (the realm; a test makes its own) that finds the
 * ground, makes the monsters and carries the words to the players. It rolls its own dice (a small generator of its own, not the realm's),
 * so a seeded world does not change what it rolls whether or not rifts are on.
 */

export type RiftGrade = 'uncommon' | 'rare' | 'epic';
export const RIFT_GRADES: readonly RiftGrade[] = ['uncommon', 'rare', 'epic'];

/** What a wave is made of: a kind, how many, and (the warden) how many times the health of its kind it has. */
export interface RiftSpawn {
  kind: MobKind;
  count: number;
  /** A strong one: its health is this many times its kind's, it hits harder, and it shows a tier higher (see `Mob.elite`). */
  elite?: number;
}

export interface RiftGradeDef {
  name: string;
  /** The colour of its beam and its name (the item rarities' colours). */
  color: string;
  /** How likely it is to be the next one, among the others. */
  weight: number;
  waves: readonly (readonly RiftSpawn[])[];
  /** Seconds it stays open at most. */
  seconds: number;
  /** What sealing it pays each helper. */
  reward: {
    xp: number;
    coins: number;
    /** The level range of the piece of gear, and the weights of its uncommon, rare and epic rarity. */
    gearLevel: readonly [number, number];
    gearRarity: readonly [number, number, number];
    /** The chance of a Glyph Tome as well. */
    tome: number;
  };
}

export const RIFT_GRADE_DEFS: Record<RiftGrade, RiftGradeDef> = {
  uncommon: {
    name: 'Faint Rift',
    color: '#6bff8a',
    weight: 60,
    seconds: 420,
    waves: [
      [{ kind: 'zombie', count: 4 }, { kind: 'skeleton', count: 2 }],
      [{ kind: 'zombie', count: 4 }, { kind: 'spider', count: 3 }, { kind: 'skeleton', count: 3 }],
      [{ kind: 'husk', count: 3 }, { kind: 'zombie', count: 1, elite: 4 }],
    ],
    reward: { xp: 120, coins: 60, gearLevel: [2, 6], gearRarity: [75, 22, 3], tome: 0.15 },
  },
  rare: {
    name: 'Unstable Rift',
    color: '#5aa8ff',
    weight: 30,
    seconds: 540,
    waves: [
      [{ kind: 'zombie', count: 4 }, { kind: 'skeleton', count: 3 }, { kind: 'spider', count: 3 }],
      [{ kind: 'husk', count: 3 }, { kind: 'stray', count: 3 }, { kind: 'creeper', count: 2 }],
      [{ kind: 'enderman', count: 2 }, { kind: 'cave_spider', count: 4 }, { kind: 'creeper', count: 2 }],
      [{ kind: 'shade', count: 2 }, { kind: 'moss_lurker', count: 1, elite: 4 }],
    ],
    reward: { xp: 320, coins: 160, gearLevel: [5, 10], gearRarity: [45, 42, 13], tome: 0.35 },
  },
  epic: {
    name: 'Raging Rift',
    color: '#c77dff',
    weight: 10,
    seconds: 660,
    waves: [
      [{ kind: 'skeleton', count: 4 }, { kind: 'zombie', count: 4 }, { kind: 'creeper', count: 2 }],
      [{ kind: 'moss_lurker', count: 2 }, { kind: 'spore_puff', count: 2 }, { kind: 'stray', count: 3 }],
      [{ kind: 'ember_wraith', count: 2 }, { kind: 'shade', count: 2 }, { kind: 'enderman', count: 1 }],
      [{ kind: 'ashen_knight', count: 2 }, { kind: 'hollow_priest', count: 1 }],
      [{ kind: 'shade', count: 2 }, { kind: 'ashen_knight', count: 1, elite: 5 }, { kind: 'hollow_priest', count: 1, elite: 3 }],
    ],
    reward: { xp: 800, coins: 400, gearLevel: [8, 14], gearRarity: [10, 50, 40], tome: 0.6 },
  },
};

/** Where in its life a rift is: tearing open, fighting, sealed (won) or collapsed (lost). The last two stay a moment, then it is gone. */
export type RiftPhase = 'omen' | 'fighting' | 'sealed' | 'collapsed';

/** What a player's interface shows of the rift (see `RiftDirector.viewFor`). */
export interface RiftView {
  grade: RiftGrade;
  name: string;
  phase: RiftPhase;
  /** The wave now (1-based; 0 before the first) and how many there are. */
  wave: number;
  waves: number;
  /** Monsters of the wave still standing. */
  left: number;
  /** Seconds before it opens (in the omen), or before it collapses. */
  seconds: number;
  /** Where it is. */
  x: number;
  y: number;
  z: number;
  /** What this player has done toward it (kills, the warden counting more). */
  score: number;
}

/** What the director needs of the world around it. */
export interface RiftHost {
  /** The players who can be in a rift: alive, not creative, not spectating, not inside a dungeon. */
  players(): RiftPlayer[];
  /** The y of the ground at a column (the top of its highest solid block), or -1 when the column is not there yet. */
  groundAt(x: number, z: number): number;
  /** Is there room for a monster to stand with its feet at y (two cells of air over a solid, dry floor)? */
  standable(x: number, y: number, z: number): boolean;
  /** May a rift open here (not a village's safe ground, not a dungeon)? */
  allowed(x: number, z: number): boolean;
  /** Make a monster at a place. */
  spawn(kind: MobKind, x: number, y: number, z: number): Mob;
  /** Take a monster away (a collapsing rift's). */
  remove(mob: Mob): void;
  /** Say something to everybody (`what` is the kind of event the client plays a sound for). */
  announce(what: RiftEventKind, grade: RiftGrade, text: string, x: number, z: number): void;
  /** Pay a helper (what, and how well they did: 1 is the best). */
  reward(player: RiftPlayer, grade: RiftGrade, rank: number, helpers: number): void;
  /** A puff where a monster of a collapsing rift was taken away. */
  puff?(x: number, y: number, z: number): void;
}

export type RiftEventKind = 'omen' | 'open' | 'wave' | 'sealed' | 'collapsed';

export interface RiftPlayer {
  /** What tells this player from the others (an object key: the player itself). */
  readonly ref: object;
  x: number;
  y: number;
  z: number;
}

/** How near a player counts as being at the rift, and how far it can be seen on the interface. */
export const RIFT_RADIUS = 48;
export const RIFT_SIGHT = 600;
/** How long after the omen the first wave comes, how long between waves, and how long a sealed or collapsed rift stays. */
export const RIFT_OMEN = 30;
export const RIFT_PAUSE = 8;
export const RIFT_AFTER = 25;
/** A rift with nobody near it for this long collapses. */
export const RIFT_ABANDON = 60;
/** The first one opens this long after the first player is about, and the next ones this far apart (seconds; the later one is rolled in the range). */
export const RIFT_FIRST = 300;
export const RIFT_GAP: readonly [number, number] = [900, 1500];
/** A helper needs this many seconds at the rift, or a kill, to be paid. */
export const RIFT_PRESENCE = 20;

interface Rift {
  id: number;
  grade: RiftGrade;
  x: number;
  y: number;
  z: number;
  phase: RiftPhase;
  /** The wave that is out (index; -1 before the first) and the monsters of it. */
  wave: number;
  mobs: Mob[];
  /** Seconds in the phase, and since it opened (the clock that collapses it). */
  t: number;
  age: number;
  /** Seconds with nobody near. */
  lonely: number;
  /** Seconds the wave has been all beaten (the breath before the next). */
  calm: number;
  score: Map<object, number>;
  present: Map<object, number>;
}

/** The compass point (N, NE, E...) of a direction on the map (north is toward -z), for the words that tell a player where it is. */
export function compass(dx: number, dz: number): string {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const a = Math.atan2(dx, -dz);
  return names[(Math.round(a / (Math.PI / 4)) + 8) % 8];
}

export class RiftDirector {
  current: Rift | null = null;
  /** Seconds until the next rift opens (counted while somebody is about). */
  next = RIFT_FIRST;
  private id = 0;
  private state: number;

  constructor(
    private readonly host: RiftHost,
    seed = 0x51f7,
  ) {
    this.state = (seed ^ 0x9e3779b9) >>> 0;
  }

  /** The director's own dice (a mulberry32: well mixed even for seeds that follow one another). */
  private rand(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private between(lo: number, hi: number): number {
    return lo + this.rand() * (hi - lo);
  }

  /** Move on by `dt` seconds. */
  update(dt: number): void {
    const players = this.host.players();
    const r = this.current;
    if (!r) {
      if (players.length === 0) return;
      this.next -= dt;
      if (this.next <= 0) this.open(players);
      return;
    }
    r.t += dt;
    r.age += dt;
    // Who is at the rift: they are counted for the time they spend there.
    let near = 0;
    for (const p of players) {
      if (Math.hypot(p.x - r.x, p.z - r.z) <= RIFT_RADIUS) {
        near++;
        if (r.phase === 'fighting') r.present.set(p.ref, (r.present.get(p.ref) ?? 0) + dt);
      }
    }
    r.lonely = near > 0 ? 0 : r.lonely + dt;
    switch (r.phase) {
      case 'omen':
        if (r.t >= RIFT_OMEN) {
          r.phase = 'fighting';
          r.t = 0;
          this.host.announce('open', r.grade, `${RIFT_GRADE_DEFS[r.grade].name} opens!`, r.x, r.z);
          this.sendWave(r, players.length);
        }
        return;
      case 'fighting': {
        r.mobs = r.mobs.filter((m) => !m.dead);
        const def = RIFT_GRADE_DEFS[r.grade];
        if (r.age - RIFT_OMEN > def.seconds || r.lonely > RIFT_ABANDON) return this.collapse(r);
        if (r.mobs.length === 0) {
          // The next wave comes after a breath; the last one beaten seals it.
          if (r.wave >= def.waves.length - 1) return this.seal(r, players);
          r.calm += dt;
          if (r.calm >= RIFT_PAUSE) this.sendWave(r, near);
        }
        return;
      }
      default:
        if (r.t >= RIFT_AFTER) {
          this.current = null;
          this.next = this.between(RIFT_GAP[0], RIFT_GAP[1]);
        }
    }
  }

  /** Open a rift now, of a grade (a random one when not said), near a player. Returns false when no place was found. */
  open(players: readonly RiftPlayer[], grade?: RiftGrade): boolean {
    if (this.current || players.length === 0) return false;
    const g = grade ?? this.pickGrade();
    for (let attempt = 0; attempt < 14; attempt++) {
      const p = players[Math.floor(this.rand() * players.length)];
      const a = this.rand() * Math.PI * 2;
      const d = this.between(45, 80);
      const x = Math.floor(p.x + Math.cos(a) * d) + 0.5;
      const z = Math.floor(p.z + Math.sin(a) * d) + 0.5;
      if (!this.host.allowed(x, z)) continue;
      const y = this.host.groundAt(x, z);
      if (y < 0 || !this.host.standable(x, y + 1, z)) continue;
      this.current = { id: ++this.id, grade: g, x, y: y + 1, z, phase: 'omen', wave: -1, mobs: [], t: 0, age: 0, lonely: 0, calm: 0, score: new Map(), present: new Map() };
      this.host.announce('omen', g, `A rift is tearing open: ${RIFT_GRADE_DEFS[g].name}`, x, z);
      return true;
    }
    // (no good ground this time: try again soon)
    this.next = 20;
    return false;
  }

  private pickGrade(): RiftGrade {
    const total = RIFT_GRADES.reduce((s, g) => s + RIFT_GRADE_DEFS[g].weight, 0);
    let x = this.rand() * total;
    for (const g of RIFT_GRADES) {
      x -= RIFT_GRADE_DEFS[g].weight;
      if (x < 0) return g;
    }
    return 'uncommon';
  }

  /** Bring out the next wave round the rift: more of them when more players are about. */
  private sendWave(r: Rift, players: number): void {
    r.wave++;
    r.t = 0;
    r.calm = 0;
    const def = RIFT_GRADE_DEFS[r.grade];
    const wave = def.waves[r.wave];
    const scale = Math.min(2.5, 1 + 0.4 * Math.max(0, players - 1));
    for (const s of wave) {
      const n = s.elite ? s.count : Math.ceil(s.count * scale);
      for (let i = 0; i < n; i++) {
        const spot = this.spot(r);
        const m = this.host.spawn(s.kind, spot.x, spot.y, spot.z);
        m.rift = r.id;
        m.bound = true;
        m.guard = true;
        m.patrol = 6;
        m.homeX = r.x;
        m.homeZ = r.z;
        if (s.elite) {
          m.elite = true;
          m.maxHealth *= s.elite;
          m.health = m.maxHealth;
          m.damageMul = 1 + (s.elite - 1) * 0.25;
        }
        r.mobs.push(m);
      }
    }
    const last = r.wave === def.waves.length - 1;
    if (r.wave > 0) this.host.announce('wave', r.grade, last ? 'The warden comes!' : `Wave ${r.wave + 1} of ${def.waves.length}`, r.x, r.z);
  }

  /** A place on the ground round the rift (the middle itself when none is found). */
  private spot(r: Rift): { x: number; y: number; z: number } {
    for (let i = 0; i < 10; i++) {
      const a = this.rand() * Math.PI * 2;
      const d = this.between(5, 10);
      const x = Math.floor(r.x + Math.cos(a) * d) + 0.5;
      const z = Math.floor(r.z + Math.sin(a) * d) + 0.5;
      const g = this.host.groundAt(x, z);
      if (g < 0 || Math.abs(g + 1 - r.y) > 6 || !this.host.standable(x, g + 1, z)) continue;
      return { x, y: g + 1, z };
    }
    return { x: r.x, y: r.y, z: r.z };
  }

  /** A monster died (the realm calls this for every kill): the players near it who were in the fight get the credit. */
  onKill(mob: Mob, nearby: readonly RiftPlayer[]): void {
    const r = this.current;
    if (!r || mob.rift !== r.id) return;
    const worth = mob.elite ? 3 : 1;
    for (const p of nearby) r.score.set(p.ref, (r.score.get(p.ref) ?? 0) + worth);
  }

  private seal(r: Rift, players: readonly RiftPlayer[]): void {
    r.phase = 'sealed';
    r.t = 0;
    this.host.announce('sealed', r.grade, `${RIFT_GRADE_DEFS[r.grade].name} sealed!`, r.x, r.z);
    // Whoever fought (a kill, or time at the rift) and is still near is paid, the best of them first.
    const helpers = players
      .filter((p) => Math.hypot(p.x - r.x, p.z - r.z) <= RIFT_RADIUS * 2 && ((r.score.get(p.ref) ?? 0) > 0 || (r.present.get(p.ref) ?? 0) >= RIFT_PRESENCE))
      .sort((a, b) => (r.score.get(b.ref) ?? 0) - (r.score.get(a.ref) ?? 0));
    helpers.forEach((p, i) => this.host.reward(p, r.grade, i + 1, helpers.length));
  }

  private collapse(r: Rift): void {
    r.phase = 'collapsed';
    r.t = 0;
    for (const m of r.mobs) {
      if (m.dead) continue;
      this.host.puff?.(m.body.x, m.body.y + 0.5, m.body.z);
      this.host.remove(m);
    }
    r.mobs = [];
    this.host.announce('collapsed', r.grade, `${RIFT_GRADE_DEFS[r.grade].name} collapsed...`, r.x, r.z);
  }

  /** What this player's interface shows (null when there is no rift, or it is too far to know of). */
  viewFor(p: RiftPlayer): RiftView | null {
    const r = this.current;
    if (!r || Math.hypot(p.x - r.x, p.z - r.z) > RIFT_SIGHT) return null;
    const def = RIFT_GRADE_DEFS[r.grade];
    const seconds = r.phase === 'omen' ? RIFT_OMEN - r.t : r.phase === 'fighting' ? Math.max(0, def.seconds - (r.age - RIFT_OMEN)) : 0;
    return {
      grade: r.grade,
      name: def.name,
      phase: r.phase,
      wave: r.wave + 1,
      waves: def.waves.length,
      left: r.mobs.filter((m) => !m.dead).length,
      seconds: Math.ceil(seconds),
      x: r.x,
      y: r.y,
      z: r.z,
      score: r.score.get(p.ref) ?? 0,
    };
  }
}
