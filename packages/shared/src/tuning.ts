/**
 * The pace of the game, in one place: how big the numbers of a fight are, how tough the creatures are, and how slowly levels come.
 *
 * - `damageScale`: every point of damage a creature takes counts this many times, and every creature has this many times
 *   the health it is defined with. The balance of a fight does not change (a zombie still takes the same swings), but the
 *   numbers that float up are in the hundreds and thousands instead of single digits. The tooltips and the class guide show
 *   the same bigger numbers (`scaled`). What the player takes and has is not touched.
 * - `mobToughness`: on top of that, creatures have this much more health than their definition says, so a fight lasts longer.
 * - `damageSpread`: a classed player's hit lands anywhere from this share below to this share above its worked-out damage (0.2: from 80% to 120%), so no two hits read the same.
 * - `xpPace`: the experience each level asks for is multiplied by `levelPace(level)`, so levels come slower.
 * - `abilityCost`: what an ability costs in the class's resource (mana, stamina, focus) is multiplied by this.
 * - `castCost`: the same for a bolt cast with a wand, a staff or a spellbook (a classless player still pays in hunger, as before).
 * - `regen`: the resource refills at this share of its worked-out rate, and `regenDelay` is how many seconds after spending any it does not refill at all,
 *   so firing a wand without a stop drains the pool and then has to wait, instead of being paid for as fast as it is spent.
 *
 * The rules and their tests are written in the plain units (one point of damage, the original curve). They run with
 * `CLASSIC_TUNING` (see `vitest.setup.ts`); the game runs with the defaults below.
 */
export interface Tuning {
  damageScale: number;
  mobToughness: number;
  damageSpread: number;
  xpPace: boolean;
  abilityCost: number;
  castCost: number;
  regen: number;
  regenDelay: number;
  castRegenDelay: number;
}

export const DEFAULT_TUNING: Readonly<Tuning> = { damageScale: 25, mobToughness: 1.5, damageSpread: 0.2, xpPace: true, abilityCost: 1.5, castCost: 0.75, regen: 0.6, regenDelay: 2, castRegenDelay: 1 };
export const CLASSIC_TUNING: Readonly<Tuning> = { damageScale: 1, mobToughness: 1, damageSpread: 0, xpPace: false, abilityCost: 1, castCost: 1, regen: 1, regenDelay: 0, castRegenDelay: 0 };

/** What is in force. Mutable only so that the tests can run in plain units (`setTuning`); nothing in the game changes it. */
export const TUNING: Tuning = { ...DEFAULT_TUNING };

export function setTuning(t: Readonly<Tuning>): void {
  TUNING.damageScale = t.damageScale;
  TUNING.mobToughness = t.mobToughness;
  TUNING.damageSpread = t.damageSpread;
  TUNING.xpPace = t.xpPace;
  TUNING.abilityCost = t.abilityCost;
  TUNING.castCost = t.castCost;
  TUNING.regen = t.regen;
  TUNING.regenDelay = t.regenDelay;
  TUNING.castRegenDelay = t.castRegenDelay;
}

/** A damage number as the player sees it (a weapon's damage in a tooltip, an ability in the class guide). */
export const scaled = (damage: number): number => damage * TUNING.damageScale;

/** How much harder than the original curve the step from `level` to the next one is: 2.1 at level 1, 3.9 at 15, 5.75 at 30. */
export const levelPace = (level: number): number => (TUNING.xpPace ? 2 + Math.max(1, level) / 8 : 1);

/** What an ability costs in the class's resource, as the game charges it and as the player reads it. */
export const abilityCost = (cost: number): number => Math.round(cost * TUNING.abilityCost);

/** What a bolt of a wand, a staff or a spellbook costs in the class's resource. */
export const castCost = (cost: number): number => Math.round(cost * TUNING.castCost);
