import type { Mob, MobKind } from './mobs';
import type { RiftPlayer } from './rift';
import { compass } from './rift';

/**
 * The Gilded Tide: every half hour (on the hour and at half past, by the wall clock, the same for every world and every player)
 * golden creatures (gilt imps, hounds, drakes and the rare colossus) appear all over the land, not round the players: one here, one there,
 * each on its own stretch of ground, none of them in a pack and none of them near anybody. They are shy: they never attack, and a hit
 * sends them running. Finding them is the game. They leave nothing but the Codex of Aurelion (see `MobManager.kill`), and a codex opens
 * into one piece of Epic gear (see `Player.openCodex`).
 *
 * The rules live here and know nothing of the realm: `InvasionDirector` is driven by a host (the realm; a test makes its own) that finds
 * the ground, makes the monsters, tells the time and carries the words to the players. Like the rifts, it rolls its own dice.
 */

/** How often it comes (milliseconds): on the wall clock, at :00 and :30. */
export const INVASION_PERIOD = 30 * 60 * 1000;
/** The warnings before it, in seconds before it begins (the first when the clock passes it, so a world that starts late still warns once). */
export const INVASION_WARNINGS: readonly number[] = [300, 60];
/** Seconds it lasts at most; after that what is left fades away. */
export const INVASION_SECONDS = 15 * 60;
/** With nobody in the world for this long it ends quietly. */
export const INVASION_ABANDON = 60;
/** The most golden creatures alive at once. */
export const INVASION_CAP = 48;
/** The fewest it hides in a world, however small the explored land is. */
export const INVASION_MIN = 6;
/** One creature for this many chunks of land, and one more for every player (the land is the same land for everybody, and big lands hide more). */
export const INVASION_CHUNKS_PER_MOB = 16;
export const INVASION_PER_PLAYER = 1;
/** No creature is put closer than this to a player (blocks): finding them is the point. */
export const INVASION_KEEP_AWAY = 64;
/** No two creatures are put closer than this to each other (blocks): they are never a pack. */
export const INVASION_SPACING = 48;

/** What kinds hide in the land, and how many of each for every 17 (the colossus is the rare one: there is one, at least, whenever there are enough). */
export const INVASION_MIX: readonly { kind: MobKind; weight: number }[] = [
  { kind: 'gilt_imp', weight: 8 },
  { kind: 'gilt_hound', weight: 5 },
  { kind: 'gilt_drake', weight: 3 },
  { kind: 'gilt_colossus', weight: 1 },
];

export type InvasionEventKind = 'omen' | 'open' | 'slain' | 'faded';

/** What a player's interface can show of the invasion. */
export interface InvasionView {
  /** Golden creatures still alive. */
  left: number;
  /** Seconds before it fades if it is not beaten. */
  seconds: number;
}

/** A chunk of the land (its coordinates, not blocks). */
export interface InvasionChunk {
  cx: number;
  cz: number;
}

/** What the director needs of the world around it. */
export interface InvasionHost {
  /** The wall clock (milliseconds since 1970). */
  now(): number;
  /** The players the tide can come for: alive, not spectating, not inside a dungeon (creative is fine: the Tide is a hunt, not a fight). */
  players(): RiftPlayer[];
  /** The chunks of the land that exist (the explored world). May be empty: the director then looks in a ring round the players, far enough off. */
  chunks(): readonly InvasionChunk[];
  /** The y of the ground at a column (the top of its highest solid block), or -1 when the column is not there yet. */
  groundAt(x: number, z: number): number;
  /** Is there room for a monster to stand with its feet at y (two cells of air over a solid, dry floor)? */
  standable(x: number, y: number, z: number): boolean;
  /** May a monster of the tide stand here (not a village's safe ground, not a dungeon)? */
  allowed(x: number, z: number): boolean;
  /** Make a monster at a place. */
  spawn(kind: MobKind, x: number, y: number, z: number): Mob;
  /** Is this monster still in the world (a village's safe ground takes monsters away without killing them)? */
  present(mob: Mob): boolean;
  /** Take a monster away (a fading tide's). */
  remove(mob: Mob): void;
  /** Say something to everybody (`what` is the kind of event the client plays a sound for). Where a place is given, each player is told how far and which way. */
  announce(what: InvasionEventKind, text: string, x?: number, z?: number): void;
  /** A puff where a monster that was taken away stood. */
  puff?(x: number, y: number, z: number): void;
}

interface Invasion {
  /** Seconds since it began. */
  t: number;
  mobs: Mob[];
  /** Seconds with nobody in the world. */
  lonely: number;
  /** Seconds since the monsters were last counted. */
  count: number;
}

interface Place {
  x: number;
  y: number;
  z: number;
}

/** When the next slot is: the next multiple of the period after `now`. */
export const nextInvasionAt = (now: number): number => (Math.floor(now / INVASION_PERIOD) + 1) * INVASION_PERIOD;

/** How many creatures the land hides, for this much explored land (in chunks; 0 when it is not known) and this many players. */
export function invasionCount(chunks: number, players: number): number {
  return Math.max(INVASION_MIN, Math.min(INVASION_CAP, Math.round(chunks / INVASION_CHUNKS_PER_MOB) + players * INVASION_PER_PLAYER));
}

/** The kinds for `n` creatures, in the proportions of `INVASION_MIX`, with a colossus whenever there are enough to spare one. */
export function invasionKinds(n: number): MobKind[] {
  const total = INVASION_MIX.reduce((s, m) => s + m.weight, 0);
  const counts = INVASION_MIX.map((m) => Math.floor((n * m.weight) / total));
  const last = INVASION_MIX.length - 1;
  if (n >= INVASION_MIN && counts[last] === 0) counts[last] = 1;
  // What the rounding left over goes to the most common kinds first.
  let rest = n - counts.reduce((s, c) => s + c, 0);
  for (let i = 0; rest > 0; i = (i + 1) % last) {
    counts[i]++;
    rest--;
  }
  const out: MobKind[] = [];
  INVASION_MIX.forEach((m, i) => {
    for (let k = 0; k < counts[i]; k++) out.push(m.kind);
  });
  return out.slice(0, n);
}

export class InvasionDirector {
  current: Invasion | null = null;
  /** The wall-clock time (ms) the next one begins. */
  nextAt: number;
  /** How many of the warnings of the slot have been given. */
  private warned = 0;
  private state: number;

  constructor(
    private readonly host: InvasionHost,
    seed = 0x6117,
  ) {
    this.state = (seed ^ 0x7f4a7c15) >>> 0;
    this.nextAt = nextInvasionAt(host.now());
  }

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

  /** Wait for the next slot (the one after now). */
  private schedule(): void {
    this.nextAt = nextInvasionAt(this.host.now());
    this.warned = 0;
  }

  /** Move on by `dt` seconds. */
  update(dt: number): void {
    const players = this.host.players();
    const inv = this.current;
    if (!inv) {
      const left = (this.nextAt - this.host.now()) / 1000;
      if (left > 0) {
        if (players.length === 0) return;
        const passed = INVASION_WARNINGS.filter((w) => left <= w).length;
        if (passed > this.warned) {
          const first = this.warned === 0;
          this.warned = passed;
          const when = left > 90 ? `${Math.round(left / 60)} minutes` : `${Math.max(1, Math.round(left / 10) * 10)} seconds`;
          this.host.announce(
            'omen',
            first ? `The Gilded Tide is coming in ${when}! Golden creatures will hide all over the land...` : `The Gilded Tide is coming in ${when}!`,
          );
        }
        return;
      }
      // Its time: with nobody about it passes (the next is half an hour on).
      if (players.length === 0 || !this.open(players)) this.schedule();
      return;
    }

    inv.t += dt;
    inv.lonely = players.length === 0 ? inv.lonely + dt : 0;
    if (inv.lonely > INVASION_ABANDON) return this.end(inv, null);

    // Count what is left (a monster a village took away is not left).
    inv.count += dt;
    if (inv.count >= 1) {
      inv.count = 0;
      inv.mobs = inv.mobs.filter((m) => !m.dead && this.host.present(m));
      // Every one found: it is over.
      if (inv.mobs.length === 0) return this.end(inv, 'slain');
    }
    if (inv.t >= INVASION_SECONDS) this.end(inv, 'faded');
  }

  /** Begin it now (a cheat, a test, the clock). Returns false when there is nobody about or no ground for any of it. */
  open(players: readonly RiftPlayer[]): boolean {
    if (this.current || players.length === 0) return false;
    const places = this.places(players);
    if (places.length === 0) return false;
    const kinds = invasionKinds(places.length);
    // The rare ones are not always in the same part of the land.
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
    }
    const inv: Invasion = { t: 0, mobs: [], lonely: 0, count: 0 };
    places.forEach((at, i) => {
      const m = this.host.spawn(kinds[i], at.x, at.y, at.z);
      // Kept by the tide (never despawned by distance, however far from everybody).
      m.bound = true;
      inv.mobs.push(m);
    });
    this.current = inv;
    this.warned = INVASION_WARNINGS.length;
    this.host.announce('open', 'The Gilded Tide has broken over the land! Golden creatures are hiding all over the world, shy and far from you. Find them all...');
    return true;
  }

  /**
   * Where the creatures go: a place on the ground in as many different chunks of the land as there are creatures, none near a player, none near
   * another. The chunks are the ones the world has (the explored land, all of it). When the world does not say, a ring round each player is used.
   */
  private places(players: readonly RiftPlayer[]): Place[] {
    let chunks = this.host.chunks().slice();
    const known = chunks.length;
    if (known < 4) {
      const seen = new Set<number>();
      chunks = [];
      for (const p of players) {
        for (let i = 0; i < 80; i++) {
          const a = this.rand() * Math.PI * 2;
          const d = this.between(INVASION_KEEP_AWAY + 12, 150);
          const cx = Math.floor((p.x + Math.cos(a) * d) / 16);
          const cz = Math.floor((p.z + Math.sin(a) * d) / 16);
          const key = cx * 65536 + cz;
          if (seen.has(key)) continue;
          seen.add(key);
          chunks.push({ cx, cz });
        }
      }
    }
    for (let i = chunks.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [chunks[i], chunks[j]] = [chunks[j], chunks[i]];
    }
    const want = invasionCount(known < 4 ? 0 : known, players.length);
    const out: Place[] = [];
    for (const c of chunks) {
      if (out.length >= want) break;
      for (let attempt = 0; attempt < 3; attempt++) {
        const x = c.cx * 16 + 1 + Math.floor(this.rand() * 14) + 0.5;
        const z = c.cz * 16 + 1 + Math.floor(this.rand() * 14) + 0.5;
        if (players.some((p) => Math.hypot(p.x - x, p.z - z) < INVASION_KEEP_AWAY)) continue;
        if (out.some((o) => Math.hypot(o.x - x, o.z - z) < INVASION_SPACING)) continue;
        if (!this.host.allowed(x, z)) continue;
        const y = this.host.groundAt(x, z);
        if (y < 0 || !this.host.standable(x, y + 1, z)) continue;
        out.push({ x, y: y + 1, z });
        break;
      }
    }
    return out;
  }

  private end(inv: Invasion, how: 'slain' | 'faded' | null): void {
    for (const m of inv.mobs) {
      if (m.dead || !this.host.present(m)) continue;
      this.host.puff?.(m.body.x, m.body.y + 0.5, m.body.z);
      this.host.remove(m);
    }
    inv.mobs = [];
    if (how === 'slain') this.host.announce('slain', 'Every golden creature has been found! The Gilded Tide is over. Open your codices!');
    if (how === 'faded') this.host.announce('faded', 'The Gilded Tide fades away...');
    this.current = null;
    this.schedule();
  }

  /** What the interface shows (null when there is no invasion). */
  view(): InvasionView | null {
    const inv = this.current;
    if (!inv) return null;
    return {
      left: inv.mobs.filter((m) => !m.dead).length,
      seconds: Math.max(0, Math.ceil(INVASION_SECONDS - inv.t)),
    };
  }
}

/** The words that tell a player where a thing is: how far and which way from them. */
export function whereIs(fromX: number, fromZ: number, x: number, z: number): string {
  return `${Math.round(Math.hypot(x - fromX, z - fromZ))} blocks ${compass(x - fromX, z - fromZ)}`;
}
