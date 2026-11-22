import type { Mob, MobKind } from './mobs';
import type { RiftPlayer } from './rift';
import { compass } from './rift';

/**
 * The Gilded Tide: every half hour (on the hour and at half past, by the wall clock, the same for every world and every player)
 * a golden invasion sweeps over the land. Gilt imps, hounds, drakes and colossi spawn round every group of players and hunt them from far
 * off; two minutes in, their master, Aurelion the Hoard King, rises as well. They leave nothing but the Codex of Aurelion (see
 * `MobManager.kill`), and a codex opens into one piece of Epic gear (see `Player.openCodex`).
 *
 * The rules live here and know nothing of the realm: `InvasionDirector` is driven by a host (the realm; a test makes its own) that finds
 * the ground, makes the monsters, tells the time and carries the words to the players. Like the rifts, it rolls its own dice.
 */

/** How often it comes (milliseconds): on the wall clock, at :00 and :30. */
export const INVASION_PERIOD = 30 * 60 * 1000;
/** The warnings before it, in seconds before it begins (the first when the clock passes it, so a world that starts late still warns once). */
export const INVASION_WARNINGS: readonly number[] = [300, 60];
/** Seconds after it begins that Aurelion rises. */
export const INVASION_BOSS_AT = 120;
/** Seconds it lasts at most; after that what is left fades away. */
export const INVASION_SECONDS = 15 * 60;
/** Seconds the stragglers stay once Aurelion has fallen. */
export const INVASION_AFTER = 30;
/** With nobody in the world for this long it ends quietly. */
export const INVASION_ABANDON = 60;
/** How far apart two players can be and still be one group (a tide is sent to each group). */
export const INVASION_GROUP = 80;
/** The most gilded monsters alive at once (the swarm is cut back to this). */
export const INVASION_CAP = 72;

/** What one group of players meets: the swarm, for a lone player. More players in the group make it bigger (see `scaleFor`). */
export const INVASION_SWARM: readonly { kind: MobKind; count: number }[] = [
  { kind: 'gilt_imp', count: 8 },
  { kind: 'gilt_hound', count: 5 },
  { kind: 'gilt_drake', count: 3 },
  { kind: 'gilt_colossus', count: 1 },
];
/** What comes with Aurelion. */
export const INVASION_ESCORT: readonly { kind: MobKind; count: number }[] = [
  { kind: 'gilt_colossus', count: 1 },
  { kind: 'gilt_drake', count: 2 },
];

export const scaleFor = (players: number): number => Math.min(2.5, 1 + 0.35 * Math.max(0, players - 1));

export type InvasionEventKind = 'omen' | 'open' | 'boss' | 'slain' | 'faded';

/** What a player's interface can show of the invasion. */
export interface InvasionView {
  /** Fighting, or the stragglers' last half minute once Aurelion is down. */
  phase: 'fighting' | 'ending';
  /** Gilded monsters still alive (the boss counts). */
  left: number;
  /** Seconds before Aurelion rises (0 once he has). */
  bossIn: number;
  boss: 'coming' | 'alive' | 'slain';
  /** Seconds before it fades if it is not beaten. */
  seconds: number;
}

/** What the director needs of the world around it. */
export interface InvasionHost {
  /** The wall clock (milliseconds since 1970). */
  now(): number;
  /** The players the tide can come for: alive, not creative, not spectating, not inside a dungeon. */
  players(): RiftPlayer[];
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
  phase: 'fighting' | 'ending';
  /** Seconds since it began; and in the ending, seconds since Aurelion fell. */
  t: number;
  mobs: Mob[];
  boss: Mob | null;
  bossSpawned: boolean;
  /** Seconds with nobody in the world. */
  lonely: number;
  /** Seconds since the monsters were last counted. */
  count: number;
}

/** When the next slot is: the next multiple of the period after `now`. */
export const nextInvasionAt = (now: number): number => (Math.floor(now / INVASION_PERIOD) + 1) * INVASION_PERIOD;

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
          this.warned = passed;
          const when = left > 90 ? `${Math.round(left / 60)} minutes` : `${Math.max(1, Math.round(left / 10) * 10)} seconds`;
          this.host.announce('omen', `The Gilded Tide is coming in ${when}! Gold glints on the horizon...`);
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
    }

    if (inv.phase === 'ending') {
      if (inv.t >= INVASION_AFTER || inv.mobs.length === 0) this.end(inv, 'slain');
      return;
    }

    if (!inv.bossSpawned && inv.t >= INVASION_BOSS_AT) this.risen(inv, players);
    if (inv.boss && inv.boss.dead) {
      // Aurelion is down: the tide recedes (the stragglers have a moment to be hunted).
      inv.phase = 'ending';
      inv.t = 0;
      this.host.announce('slain', 'Aurelion, the Hoard King, has fallen! The Gilded Tide is breaking up. Open your codices!');
      return;
    }
    if (inv.bossSpawned && inv.boss && !this.host.present(inv.boss)) return this.end(inv, 'faded');
    if (inv.t >= INVASION_SECONDS) this.end(inv, 'faded');
  }

  /** Begin it now (a cheat, a test, the clock). Returns false when there is nobody about or no ground for any of it. */
  open(players: readonly RiftPlayer[]): boolean {
    if (this.current || players.length === 0) return false;
    const inv: Invasion = { phase: 'fighting', t: 0, mobs: [], boss: null, bossSpawned: false, lonely: 0, count: 0 };
    for (const group of this.groups(players)) {
      const site = this.site(group);
      if (!site) continue;
      const scale = scaleFor(group.length);
      for (const s of INVASION_SWARM) {
        const n = Math.ceil(s.count * scale);
        for (let i = 0; i < n && inv.mobs.length < INVASION_CAP; i++) inv.mobs.push(this.make(s.kind, site));
      }
    }
    if (inv.mobs.length === 0) return false;
    this.current = inv;
    this.warned = INVASION_WARNINGS.length;
    this.host.announce('open', 'The Gilded Tide has broken over the land! Gilt imps, hounds, drakes and colossi are hunting you. Aurelion follows...');
    return true;
  }

  /** Players in clusters: each is put with the first group that has somebody within `INVASION_GROUP` of them. */
  private groups(players: readonly RiftPlayer[]): RiftPlayer[][] {
    const groups: RiftPlayer[][] = [];
    for (const p of players) {
      const g = groups.find((members) => members.some((q) => Math.hypot(q.x - p.x, q.z - p.z) <= INVASION_GROUP));
      if (g) g.push(p);
      else groups.push([p]);
    }
    return groups;
  }

  /** A place on the ground 38 to 58 blocks from the middle of a group of players (null when none is found). */
  private site(group: readonly RiftPlayer[]): { x: number; y: number; z: number } | null {
    const cx = group.reduce((s, p) => s + p.x, 0) / group.length;
    const cz = group.reduce((s, p) => s + p.z, 0) / group.length;
    for (let attempt = 0; attempt < 16; attempt++) {
      const a = this.rand() * Math.PI * 2;
      const d = this.between(38, 58);
      const x = Math.floor(cx + Math.cos(a) * d) + 0.5;
      const z = Math.floor(cz + Math.sin(a) * d) + 0.5;
      if (!this.host.allowed(x, z)) continue;
      const y = this.host.groundAt(x, z);
      if (y < 0 || !this.host.standable(x, y + 1, z)) continue;
      return { x, y: y + 1, z };
    }
    return null;
  }

  /** A place on the ground round a site (the site itself when none is found). */
  private spot(site: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    for (let i = 0; i < 10; i++) {
      const a = this.rand() * Math.PI * 2;
      const d = this.between(2, 9);
      const x = Math.floor(site.x + Math.cos(a) * d) + 0.5;
      const z = Math.floor(site.z + Math.sin(a) * d) + 0.5;
      const g = this.host.groundAt(x, z);
      if (g < 0 || Math.abs(g + 1 - site.y) > 6 || !this.host.standable(x, g + 1, z)) continue;
      return { x, y: g + 1, z };
    }
    return site;
  }

  private make(kind: MobKind, site: { x: number; y: number; z: number }): Mob {
    const at = this.spot(site);
    const m = this.host.spawn(kind, at.x, at.y, at.z);
    // Kept by the tide (never despawned by distance); they hunt on their own, from far off.
    m.bound = true;
    return m;
  }

  /** Aurelion rises, with his escort, near the biggest group. */
  private risen(inv: Invasion, players: readonly RiftPlayer[]): void {
    const groups = this.groups(players).sort((a, b) => b.length - a.length);
    for (const group of groups) {
      const site = this.site(group);
      if (!site) continue;
      inv.boss = this.make('aurelion', site);
      inv.mobs.push(inv.boss);
      for (const s of INVASION_ESCORT) for (let i = 0; i < s.count && inv.mobs.length < INVASION_CAP + 4; i++) inv.mobs.push(this.make(s.kind, site));
      inv.bossSpawned = true;
      this.host.announce('boss', 'Aurelion, the Hoard King, has risen!', site.x, site.z);
      return;
    }
    // (no ground this time: try again in a moment)
    inv.t -= 5;
  }

  private end(inv: Invasion, how: 'slain' | 'faded' | null): void {
    for (const m of inv.mobs) {
      if (m.dead || !this.host.present(m)) continue;
      this.host.puff?.(m.body.x, m.body.y + 0.5, m.body.z);
      this.host.remove(m);
    }
    inv.mobs = [];
    if (how === 'faded') this.host.announce('faded', 'The Gilded Tide fades away...');
    this.current = null;
    this.schedule();
  }

  /** What the interface shows (null when there is no invasion). */
  view(): InvasionView | null {
    const inv = this.current;
    if (!inv) return null;
    return {
      phase: inv.phase,
      left: inv.mobs.filter((m) => !m.dead).length,
      bossIn: inv.bossSpawned || inv.phase === 'ending' ? 0 : Math.max(0, Math.ceil(INVASION_BOSS_AT - inv.t)),
      boss: inv.phase === 'ending' ? 'slain' : inv.bossSpawned ? 'alive' : 'coming',
      seconds: Math.max(0, Math.ceil(INVASION_SECONDS - inv.t)),
    };
  }
}

/** The words that tell a player where a thing is: how far and which way from them. */
export function whereIs(fromX: number, fromZ: number, x: number, z: number): string {
  return `${Math.round(Math.hypot(x - fromX, z - fromZ))} blocks ${compass(x - fromX, z - fromZ)}`;
}
