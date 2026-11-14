import { CLASS_LEVELS, clampClassLevel, computeStats, damageAfterDefense, isClassId, type ClassId, type ClassStats, type DamageKind, type StatModifier } from './classes';
import { I } from './items';

/**
 * Class abilities: what each ability is (data, below) and the per-player state that gates them (`ClassState`:
 * level, resource, cooldowns, temporary defenses). Nothing here touches the world; `Player.useAbility` runs the
 * effect, and the server is the only place that does, so a client can ask for a slot and nothing else.
 *
 * A character starts with no ability at all. Each ability is taught by a skill book (one item per ability, see
 * `skillBookId`; they drop from monsters, are quest rewards and are sold by the merchants) that is learned by
 * right-clicking it, as in World of Warcraft: it has to be the book of your own class, and your level has to reach the
 * ability's `unlockLevel`. `ClassState.unlocked` is the saved list of what has been learned; the level never adds to it.
 *
 * Adding an ability is adding an entry to `ABILITIES` and its book to `SKILL_BOOKS` (items.ts).
 */

export type AbilityId =
  | 'ground_slam'
  | 'shield_bash'
  | 'charge'
  | 'iron_defense'
  | 'fireball'
  | 'meteor'
  | 'frost_nova'
  | 'arcane_shield'
  | 'rain_of_arrows'
  | 'piercing_shot'
  | 'evasive_roll'
  | 'bear_trap';

/** The four buttons of the ability bar. */
export const ABILITY_SLOTS = 4;

/** What an ability does when it is cast. A new kind of effect is a new member here and a case in `Player.useAbility`. */
export type AbilityEffect =
  /** Everything within `radius` of the caster. With `leap` the caster first jumps (`up` is the take-off speed, `forward` how fast they are thrown ahead) and the blast comes where they land. */
  | { t: 'nova'; radius: number; damage: number; stun?: number; slow?: { mult: number; seconds: number }; knock?: number; lift?: number; leap?: { up: number; forward: number } }
  /** Everything in a cone in front of the caster. */
  | { t: 'cone'; range: number; arc: number; damage: number; stun?: number; knock?: number; lift?: number }
  /** A rush of `distance` blocks along the look direction (or the way the player moves), hitting what it passes. Without `speed` it is instant; with it the player runs the distance at that many blocks a second. */
  | { t: 'dash'; distance: number; direction: 'look' | 'move'; hit?: { radius: number; damage: number; knock?: number; lift?: number }; immune?: number; speed?: number }
  /** A projectile that bursts on the first thing it meets (`radius` > 0: it hurts everything near the burst). */
  | { t: 'bolt'; speed: number; damage: number; burn?: number; radius?: number }
  /** A place on the ground you look at (up to `reach` away), hit after `delay` seconds, `waves` times if more than one. */
  | { t: 'zone'; reach: number; delay: number; radius: number; damage: number; waves?: number; interval?: number }
  /** An instant line of `range` blocks that hits everything on it. */
  | { t: 'pierce'; range: number; width: number; damage: number }
  /** A temporary defense: a share of damage taken, and/or a pool of damage absorbed. */
  | { t: 'guard'; seconds: number; reduction?: number; absorb?: number }
  /** A trap thrown to the ground the crosshair points at (up to `reach` blocks away: aiming at a far mountain top puts it at the foot of it); the first mob to step in is rooted and hurt. */
  | { t: 'trap'; damage: number; root: number; ttl: number; radius: number; max: number; reach: number };

export interface AbilityDef {
  id: AbilityId;
  classId: ClassId;
  /** Which button (0..3). */
  slot: number;
  name: string;
  description: string;
  /** The character level its skill book can be learned at (the book says "Requires level N"). */
  unlockLevel: number;
  /** Seconds before it can be used again. */
  cooldown: number;
  /** Resource it costs (the class's own: mana, stamina or focus). */
  cost: number;
  /** The kind of damage it deals, so the class multiplier for that kind applies. */
  kind: DamageKind;
  /** An item whose picture stands for it on the bar. */
  icon: number;
  effect: AbilityEffect;
}

/**
 * Every ability. Damage here is before the class: a Warrior's `melee` 1.25 makes Ground Slam hit for 12.5 at level one.
 * For scale: a zombie has 20 health, a skeleton 20, a spider 16.
 */
export const ABILITIES: readonly AbilityDef[] = [
  // ---- Warrior -------------------------------------------------------------------------------
  {
    id: 'ground_slam',
    classId: 'warrior',
    slot: 0,
    name: 'Ground Slam',
    description: 'Leap high into the air and crash down: the shockwave where you land hurts every enemy around you, throws them into the air and stuns them.',
    unlockLevel: 1,
    cooldown: 7,
    cost: 25,
    kind: 'melee',
    icon: I.GREATSWORD,
    effect: { t: 'nova', radius: 3.8, damage: 14, knock: 3, lift: 13, stun: 1.6, leap: { up: 14, forward: 5 } },
  },
  {
    id: 'shield_bash',
    classId: 'warrior',
    slot: 1,
    name: 'Shield Bash',
    description: 'Slam your shield into the enemies in front of you: damage, a stun, and they are thrown back through the air.',
    unlockLevel: 1,
    cooldown: 9,
    cost: 20,
    kind: 'melee',
    icon: I.SHIELD,
    effect: { t: 'cone', range: 3.2, arc: Math.PI * 0.6, damage: 8, stun: 1.8, knock: 2.6, lift: 8 },
  },
  {
    id: 'charge',
    classId: 'warrior',
    slot: 2,
    name: 'Charge',
    description: 'Rush forward, damaging whatever is in the way and flinging it aside.',
    unlockLevel: 3,
    cooldown: 11,
    cost: 25,
    kind: 'melee',
    icon: I.STICK,
    effect: { t: 'dash', distance: 8, speed: 22, direction: 'look', hit: { radius: 1.8, damage: 9, knock: 2.8, lift: 10 } },
  },
  {
    id: 'iron_defense',
    classId: 'warrior',
    slot: 3,
    name: 'Iron Defense',
    description: 'Harden yourself: take half damage for a few seconds.',
    unlockLevel: 5,
    cooldown: 22,
    cost: 30,
    kind: 'melee',
    icon: I.IRON_INGOT,
    effect: { t: 'guard', seconds: 6, reduction: 0.5 },
  },

  // ---- Mage ----------------------------------------------------------------------------------
  {
    id: 'fireball',
    classId: 'mage',
    slot: 0,
    name: 'Fireball',
    description: 'Hurl a ball of fire that bursts on impact and sets enemies alight.',
    unlockLevel: 1,
    cooldown: 2.5,
    cost: 14,
    kind: 'spell',
    icon: I.FLINT_AND_STEEL,
    effect: { t: 'bolt', speed: 22, damage: 8, burn: 4, radius: 2 },
  },
  {
    id: 'frost_nova',
    classId: 'mage',
    slot: 1,
    name: 'Frost Nova',
    description: 'A wave of cold that damages and slows everything around you.',
    unlockLevel: 1,
    cooldown: 11,
    cost: 30,
    kind: 'spell',
    icon: I.DIAMOND,
    effect: { t: 'nova', radius: 5, damage: 5, slow: { mult: 0.4, seconds: 4 } },
  },
  {
    id: 'meteor',
    classId: 'mage',
    slot: 2,
    name: 'Meteor',
    description: 'Call down a meteor on the spot you are looking at. It lands after a moment.',
    unlockLevel: 3,
    cooldown: 18,
    cost: 50,
    kind: 'spell',
    icon: I.COAL,
    effect: { t: 'zone', reach: 28, delay: 1.3, radius: 4, damage: 15 },
  },
  {
    id: 'arcane_shield',
    classId: 'mage',
    slot: 3,
    name: 'Arcane Shield',
    description: 'Wrap yourself in energy that soaks up damage for a few seconds.',
    unlockLevel: 5,
    cooldown: 24,
    cost: 35,
    kind: 'spell',
    icon: I.ENCHANTED_BOOK,
    effect: { t: 'guard', seconds: 8, absorb: 12 },
  },

  // ---- Ranger --------------------------------------------------------------------------------
  {
    id: 'piercing_shot',
    classId: 'ranger',
    slot: 0,
    name: 'Piercing Shot',
    description: 'Loose an arrow that passes through every enemy in a line.',
    unlockLevel: 1,
    cooldown: 5,
    cost: 20,
    kind: 'ranged',
    icon: I.ARROW,
    effect: { t: 'pierce', range: 32, width: 0.9, damage: 8 },
  },
  {
    id: 'evasive_roll',
    classId: 'ranger',
    slot: 1,
    name: 'Evasive Roll',
    description: 'Dash in the direction you are moving (backwards if you stand still), in a blur of wind. You cannot be hurt while rolling.',
    unlockLevel: 1,
    cooldown: 8,
    cost: 15,
    kind: 'ranged',
    icon: I.FEATHER,
    effect: { t: 'dash', distance: 6.5, speed: 18, direction: 'move', immune: 0.55 },
  },
  {
    id: 'bear_trap',
    classId: 'ranger',
    slot: 2,
    name: 'Bear Trap',
    description: 'Throw a trap onto the ground you are looking at (up to 14 blocks away). The first enemy to step in is rooted and hurt.',
    unlockLevel: 3,
    cooldown: 14,
    cost: 25,
    kind: 'ranged',
    icon: I.IRON_INGOT,
    effect: { t: 'trap', damage: 6, root: 4, ttl: 90, radius: 1.3, max: 2, reach: 14 },
  },
  {
    id: 'rain_of_arrows',
    classId: 'ranger',
    slot: 3,
    name: 'Rain of Arrows',
    description: 'Mark the ground you are looking at: arrows fall on it in volleys.',
    unlockLevel: 5,
    cooldown: 16,
    cost: 40,
    kind: 'ranged',
    icon: I.BOW,
    effect: { t: 'zone', reach: 24, delay: 0.6, radius: 4, damage: 3.5, waves: 6, interval: 0.5 },
  },
];

export const ABILITY_BY_ID: ReadonlyMap<AbilityId, AbilityDef> = new Map(ABILITIES.map((a) => [a.id, a]));

/** A class's abilities in button order. */
export const abilitiesOf = (classId: ClassId): AbilityDef[] => ABILITIES.filter((a) => a.classId === classId).sort((a, b) => a.slot - b.slot);

/** The ability on a button of a class, or null. */
export const abilityAt = (classId: ClassId, slot: number): AbilityDef | null => ABILITIES.find((a) => a.classId === classId && a.slot === slot) ?? null;

/** Why a cast is refused (and so what the player is told), or null when it can go ahead. */
export type CastBlock = 'locked' | 'cooldown' | 'resource';

/** What reading a skill book did: the ability was learned, it was known already, the book is another class's, or the level is too low. */
export type LearnResult = 'learned' | 'known' | 'class' | 'level';

/** What is kept of a character's class between sessions. Contains no balances of any kind. */
export interface ClassSave {
  v: 1;
  id: ClassId;
  lvl: number;
  xp: number;
  unlocked: AbilityId[];
}

/** Read what was saved for a class. Anything malformed, or saved for another class, is ignored (null). */
export function parseClassSave(raw: unknown, classId: ClassId): ClassSave | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.id !== classId || !isClassId(r.id)) return null;
  const lvl = typeof r.lvl === 'number' && Number.isFinite(r.lvl) ? clampClassLevel(r.lvl) : 1;
  const xp = typeof r.xp === 'number' && Number.isFinite(r.xp) && r.xp >= 0 ? Math.floor(r.xp) : 0;
  const unlocked = Array.isArray(r.unlocked) ? r.unlocked.filter((a): a is AbilityId => typeof a === 'string' && ABILITY_BY_ID.get(a as AbilityId)?.classId === classId) : [];
  return { v: 1, id: classId, lvl, xp, unlocked };
}

const MAX_ABSORB = 200;

/**
 * A classed player's combat state: level, resource, cooldowns and temporary defenses. Time only moves by `tick`,
 * which the server calls from its own fixed simulation step, so none of it can be sped up from a client.
 */
export class ClassState {
  level = 1;
  /** Points towards the next level. */
  xp = 0;
  resource: number;
  /** Abilities the character can use. */
  readonly unlocked = new Set<AbilityId>();
  /** Seconds left before each ability is ready again. */
  private readonly cooldowns = new Map<AbilityId, number>();
  /** Damage taken is multiplied by `mult` for `left` more seconds. */
  private reduction = { mult: 1, left: 0 };
  /** A pool that soaks up damage before health does, for `left` more seconds. */
  private absorb = { amount: 0, left: 0 };
  /** Nothing hurts for `left` more seconds (a roll). */
  private immune = 0;
  private mods: StatModifier[] = [];
  /** What the item in the off hand adds, kept apart from the other sources so that changing one never drops the other. */
  private offhandMod: StatModifier | null = null;
  /** What the worn and held gear adds (see gear.ts), kept apart from the other sources for the same reason. */
  private gearMods: StatModifier[] = [];
  private cached: ClassStats;

  constructor(readonly classId: ClassId) {
    this.cached = computeStats(classId, 1);
    this.resource = this.cached.maxResource;
  }

  get stats(): ClassStats {
    return this.cached;
  }

  /** Replace the outside sources of stats (gear, specializations) and recompute. */
  setModifiers(mods: readonly StatModifier[]): void {
    this.mods = [...mods];
    this.recompute();
  }

  /** Set what the gear adds and recompute. */
  setGearModifiers(mods: readonly StatModifier[]): void {
    this.gearMods = [...mods];
    this.recompute();
  }

  /** Set what the off-hand item adds (null: nothing) and recompute. */
  setOffhandModifier(mod: StatModifier | null): void {
    this.offhandMod = mod;
    this.recompute();
  }

  private recompute(): void {
    this.cached = computeStats(this.classId, this.level, [...this.mods, ...this.gearMods, ...(this.offhandMod ? [this.offhandMod] : [])]);
    this.resource = Math.min(this.resource, this.cached.maxResource);
  }

  /**
   * Learn an ability from its skill book. The book must be of this class and the level must be high enough; a known
   * ability is not learned twice (so the book is not wasted). Returns what happened: only 'learned' changes anything.
   */
  learn(id: AbilityId): LearnResult {
    const def = ABILITY_BY_ID.get(id);
    if (!def || def.classId !== this.classId) return 'class';
    if (this.unlocked.has(id)) return 'known';
    if (this.level < def.unlockLevel) return 'level';
    this.unlocked.add(id);
    return 'learned';
  }

  /** Points needed to leave the current level (0 at the cap). */
  get xpToNext(): number {
    return this.level >= CLASS_LEVELS.max ? 0 : CLASS_LEVELS.toNext(this.level);
  }

  /** Add experience; returns how many levels it gave. */
  addXp(amount: number): { levels: number } {
    const out = { levels: 0 };
    if (!Number.isFinite(amount) || amount <= 0 || this.level >= CLASS_LEVELS.max) return out;
    this.xp += Math.floor(amount);
    while (this.level < CLASS_LEVELS.max && this.xp >= CLASS_LEVELS.toNext(this.level)) {
      this.xp -= CLASS_LEVELS.toNext(this.level);
      this.level += 1;
      out.levels += 1;
    }
    if (this.level >= CLASS_LEVELS.max) this.xp = 0;
    if (out.levels > 0) this.recompute();
    return out;
  }

  /**
   * The character reached level (what its experience adds up to): the class catches up to it, never going back down
   * (spending experience levels at an enchanting table or losing some on death costs nothing here). Returns how many levels
   * that gave. Abilities are not part of it: they come from skill books.
   */
  raiseLevel(level: number): { levels: number } {
    const target = clampClassLevel(level);
    const out = { levels: 0 };
    if (target <= this.level) return out;
    out.levels = target - this.level;
    this.level = target;
    this.xp = 0;
    this.recompute();
    return out;
  }
  /** How full the experience bar is (0..1). */
  get xpProgress(): number {
    const need = this.xpToNext;
    return need > 0 ? Math.min(1, this.xp / need) : 1;
  }

  /** Seconds left on an ability's cooldown (0 = ready). */
  cooldownLeft(id: AbilityId): number {
    return this.cooldowns.get(id) ?? 0;
  }

  /** Whether the ability could be cast now, and if not, why. */
  block(id: AbilityId): CastBlock | null {
    const def = ABILITY_BY_ID.get(id);
    if (!def || def.classId !== this.classId || !this.unlocked.has(id)) return 'locked';
    if (this.cooldownLeft(id) > 0) return 'cooldown';
    if (this.resource < def.cost) return 'resource';
    return null;
  }

  /** Pay for a cast and start its cooldown. Call only when `block` said yes. */
  commit(id: AbilityId): void {
    const def = ABILITY_BY_ID.get(id);
    if (!def) return;
    this.resource = Math.max(0, this.resource - def.cost);
    this.cooldowns.set(id, def.cooldown);
  }

  /** Spend resource that is not an ability's (a wand's bolt). False, and nothing spent, when there is not enough. */
  spend(amount: number): boolean {
    if (amount <= 0) return true;
    if (this.resource < amount) return false;
    this.resource -= amount;
    return true;
  }

  /** Advance every timer by `dt` seconds. */
  tick(dt: number): void {
    if (!(dt > 0)) return;
    for (const [id, left] of this.cooldowns) {
      const next = left - dt;
      if (next <= 0) this.cooldowns.delete(id);
      else this.cooldowns.set(id, next);
    }
    this.resource = Math.min(this.cached.maxResource, this.resource + this.cached.resourceRegen * dt);
    if (this.reduction.left > 0 && (this.reduction.left -= dt) <= 0) this.reduction = { mult: 1, left: 0 };
    if (this.absorb.left > 0 && (this.absorb.left -= dt) <= 0) this.absorb = { amount: 0, left: 0 };
    if (this.immune > 0) this.immune = Math.max(0, this.immune - dt);
  }

  /** A fresh start after dying: full resource, no cooldowns, no temporary defenses. */
  resetCombat(): void {
    this.resource = this.cached.maxResource;
    this.cooldowns.clear();
    this.reduction = { mult: 1, left: 0 };
    this.absorb = { amount: 0, left: 0 };
    this.immune = 0;
  }

  /** Take damage and have `seconds` of it multiplied by `mult` (Iron Defense). */
  guardReduction(mult: number, seconds: number): void {
    this.reduction = { mult: Math.min(1, Math.max(0.05, mult)), left: seconds };
  }

  /** A shield that takes `amount` damage before health does, for `seconds` (Arcane Shield). */
  guardAbsorb(amount: number, seconds: number): void {
    this.absorb = { amount: Math.min(MAX_ABSORB, Math.max(0, amount)), left: seconds };
  }

  /** Be unhurtable for `seconds` (a roll). */
  grantImmunity(seconds: number): void {
    this.immune = Math.max(this.immune, seconds);
  }

  get immuneLeft(): number {
    return this.immune;
  }
  get reductionLeft(): number {
    return this.reduction.left;
  }
  get absorbAmount(): number {
    return this.absorb.amount;
  }

  /**
   * What reaches the player's health when a hit of `amount` lands: nothing while rolling, then the class's own
   * toughness and any temporary reduction, then the shield's pool. Used for every hit on a classed player.
   */
  mitigate(amount: number): number {
    if (amount <= 0 || this.immune > 0) return 0;
    let dmg = damageAfterDefense(amount, this.cached, this.reduction.left > 0 ? this.reduction.mult : 1);
    if (this.absorb.amount > 0 && this.absorb.left > 0) {
      const soaked = Math.min(this.absorb.amount, dmg);
      this.absorb.amount -= soaked;
      dmg -= soaked;
    }
    return dmg;
  }

  toJSON(): ClassSave {
    return { v: 1, id: this.classId, lvl: this.level, xp: this.xp, unlocked: [...this.unlocked] };
  }

  /** Restore what was saved (ignored when it belongs to another class). Resource and cooldowns start fresh. */
  load(raw: unknown): void {
    const save = parseClassSave(raw, this.classId);
    if (!save) return;
    this.level = save.lvl;
    this.xp = save.lvl >= CLASS_LEVELS.max ? 0 : Math.min(save.xp, Math.max(0, CLASS_LEVELS.toNext(save.lvl) - 1));
    this.unlocked.clear();
    for (const id of save.unlocked) this.unlocked.add(id);
    this.recompute();
    this.resource = this.cached.maxResource;
  }
}
