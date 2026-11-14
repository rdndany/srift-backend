import type { DamageKind } from './classes';
import type { Mob, MobManager } from './mobs';
import type { MountId } from './mounts';

/**
 * What class abilities leave in the world after the moment of casting: a meteor on its way down, volleys of
 * arrows, a trap waiting for a foot, and the short-lived marks every nearby player is shown (`Fx`). It lives in the
 * `Realm`, so everyone in the realm shares it, and only the server's simulation ever changes it.
 */

/** Something that casts: it deals the hits (so crits, class multipliers and kill credit stay in one place). */
export interface EffectOwner {
  /** Still in the realm and alive: a dead caster's pending effects are dropped. */
  alive(): boolean;
  /** One hit on a mob, worked out by the caster's class (see `Player.strikeMob`). */
  strike(mob: Mob, damage: number, kind: DamageKind, from: { x: number; z: number }, knock?: number): void;
}

/** What a mark looks like (the client decides how: particles, rings, a column of light). */
export type FxKind =
  | 'slam'
  | 'leap'
  | 'bash'
  | 'charge'
  | 'frost_nova'
  | 'fireball_burst'
  | 'meteor_warn'
  | 'meteor_hit'
  | 'rain_mark'
  | 'rain_hit'
  | 'pierce'
  | 'roll'
  | 'trap_set'
  | 'trap_snap'
  /** An arrow of a bow that stuck in a wall or the ground: where it hit (`x2..z2` is the point it was flying to, so the way it points). */
  | 'arrow_stick'
  | 'guard_iron'
  | 'guard_arcane'
  | 'bolt'
  /** Where a wand's bolt burst (the wand has its own look, built of cubes; the staff and the spellbook still use 'bolt'). */
  | 'wand_hit'
  /** Where a staff's bolt burst (also with its own look of cubes). */
  | 'staff_hit'
  /** A mount's: the bite (a line from the mount to the far end of its reach), and the ground a Thunder Howl will strike and has struck. */
  | 'fang'
  | 'thunder_warn'
  | 'thunder_hit'
  /** A player went up a level: a column of light stands round them (the client draws it on the player, which moves). */
  | 'level_up';

/** A short-lived mark in the world. `x2..z2` is the far end of a line (a pierce, a charge). */
export interface Fx {
  id: number;
  k: FxKind;
  x: number;
  y: number;
  z: number;
  x2?: number;
  y2?: number;
  z2?: number;
  /** Radius, for the ones that have an area. */
  r: number;
  /** Seconds since it began, and how long it lasts. */
  age: number;
  ttl: number;
  /** The caster's name, so a client can colour it and tell its own from others'. */
  by: string;
  /** The mount it comes from, for the marks of a mount's skills (the lightning takes its colour). */
  mount?: MountId;
}

interface Zone {
  owner: EffectOwner;
  by: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  damage: number;
  kind: DamageKind;
  /** Seconds until the next hit. */
  wait: number;
  /** Hits still to land, and the gap between them. */
  waves: number;
  interval: number;
  /** The mark a hit leaves. */
  hit: FxKind;
  /** Knockback of each hit (a meteor shoves, a volley of arrows barely does). */
  knock: number;
  mount?: MountId;
}

interface Trap {
  owner: EffectOwner;
  by: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  damage: number;
  root: number;
  kind: DamageKind;
  ttl: number;
  /** Its mark stays on the ground for as long as the trap does. */
  mark: Fx;
}

/** Marks are never kept longer than this, whatever asked for. */
const MAX_FX = 400;
const MAX_ZONES = 200;
const MAX_TRAPS = 120;

export class EffectField {
  readonly fx: Fx[] = [];
  private readonly zones: Zone[] = [];
  private readonly traps: Trap[] = [];
  private nextId = 1;

  /** Show a mark to everyone nearby. */
  mark(k: FxKind, by: string, x: number, y: number, z: number, r = 0, ttl = 0.8, to?: { x: number; y: number; z: number }): Fx {
    if (this.fx.length >= MAX_FX) this.fx.shift();
    const f: Fx = { id: this.nextId++, k, x, y, z, ...(to ? { x2: to.x, y2: to.y, z2: to.z } : {}), r, age: 0, ttl, by };
    this.fx.push(f);
    return f;
  }

  /** A trap is gone (sprung, expired, or its owner left): its mark goes with it. */
  private removeTrap(i: number): void {
    const t = this.traps[i];
    t.mark.ttl = 0;
    this.traps.splice(i, 1);
  }

  /** A place that will be hit `waves` times, the first after `delay` seconds. */
  addZone(z: { owner: EffectOwner; by: string; x: number; y: number; z: number; radius: number; damage: number; kind: DamageKind; delay: number; waves?: number; interval?: number; warn: FxKind; hit: FxKind; knock?: number; mount?: MountId }): void {
    if (this.zones.length >= MAX_ZONES) return;
    this.zones.push({ owner: z.owner, by: z.by, x: z.x, y: z.y, z: z.z, radius: z.radius, damage: z.damage, kind: z.kind, wait: z.delay, waves: Math.max(1, z.waves ?? 1), interval: z.interval ?? 0.5, hit: z.hit, knock: z.knock ?? 0.8, mount: z.mount });
    const total = z.delay + ((z.waves ?? 1) - 1) * (z.interval ?? 0.5);
    const warn = this.mark(z.warn, z.by, z.x, z.y, z.z, z.radius, total + 0.4);
    if (z.mount) warn.mount = z.mount;
  }

  /** A trap on the ground. An owner keeps at most `max` of them: the oldest goes when another is set. */
  addTrap(t: { owner: EffectOwner; by: string; x: number; y: number; z: number; radius: number; damage: number; root: number; kind: DamageKind; ttl: number; max: number; from?: { x: number; y: number; z: number } }): void {
    const mine = this.traps.filter((x) => x.owner === t.owner);
    while (mine.length >= Math.max(1, t.max)) {
      const old = mine.shift()!;
      this.removeTrap(this.traps.indexOf(old));
    }
    if (this.traps.length >= MAX_TRAPS) this.removeTrap(0);
    this.traps.push({ owner: t.owner, by: t.by, x: t.x, y: t.y, z: t.z, radius: t.radius, damage: t.damage, root: t.root, kind: t.kind, ttl: t.ttl, mark: this.mark('trap_set', t.by, t.x, t.y, t.z, t.radius, t.ttl, t.from) });
  }

  /** Everything a caster has pending goes (it left, or died). */
  dropOwner(owner: EffectOwner): void {
    for (let i = this.zones.length - 1; i >= 0; i--) if (this.zones[i].owner === owner) this.zones.splice(i, 1);
    for (let i = this.traps.length - 1; i >= 0; i--) if (this.traps[i].owner === owner) this.removeTrap(i);
  }

  /** Traps and falling hits that are waiting (for the tests, and for stats). */
  get pending(): { zones: number; traps: number } {
    return { zones: this.zones.length, traps: this.traps.length };
  }

  update(dt: number, mobs: MobManager): void {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.age += dt;
      if (f.age >= f.ttl) this.fx.splice(i, 1);
    }
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (!z.owner.alive()) {
        this.zones.splice(i, 1);
        continue;
      }
      z.wait -= dt;
      while (z.wait <= 0 && z.waves > 0) {
        this.hitZone(z, mobs);
        z.waves -= 1;
        z.wait += z.interval;
      }
      if (z.waves <= 0) this.zones.splice(i, 1);
    }
    for (let i = this.traps.length - 1; i >= 0; i--) {
      const t = this.traps[i];
      t.ttl -= dt;
      if (t.ttl <= 0 || !t.owner.alive()) {
        this.removeTrap(i);
        continue;
      }
      const victim = mobs.mobs.find((m) => !m.dead && (m.def.hostile || !m.def.ambient) && !m.def.invulnerable && Math.hypot(m.body.x - t.x, m.body.z - t.z) <= t.radius && Math.abs(m.body.y - t.y) <= 2);
      if (!victim) continue;
      this.removeTrap(i);
      mobs.applyStatus(victim, { root: t.root });
      t.owner.strike(victim, t.damage, t.kind, { x: t.x, z: t.z }, 0);
      this.mark('trap_snap', t.by, t.x, t.y, t.z, t.radius, 0.8);
    }
  }

  private hitZone(z: Zone, mobs: MobManager): void {
    // A meteor leaves its crater and smoke about for a while; an arrow volley is over quickly.
    const mark = this.mark(z.hit, z.by, z.x, z.y, z.z, z.radius, z.hit === 'meteor_hit' ? 1.8 : z.hit === 'thunder_hit' ? 1.1 : 0.7);
    if (z.mount) mark.mount = z.mount;
    for (const m of mobs.mobs) {
      if (m.dead || (!m.def.hostile && m.def.ambient) || m.def.invulnerable) continue;
      if (Math.hypot(m.body.x - z.x, m.body.z - z.z) > z.radius || Math.abs(m.body.y - z.y) > 4) continue;
      z.owner.strike(m, z.damage, z.kind, { x: z.x, z: z.z }, z.knock);
    }
  }
}
