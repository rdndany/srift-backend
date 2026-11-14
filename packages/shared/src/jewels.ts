import { PLUS_MAX, UPGRADE_MAX, canRollGear, cloneGear, rollOption, statLine, type GearRoll, type GearStat } from './gear';
import { cloneStack, type ItemStack } from './inventory';
import { I, getItem } from './items';
import type { MobKind } from './mobs';

/**
 * The three jewels: pick one up in the inventory screen and click a piece of equipment with it.
 *
 *  - The Jewel of Dawn raises a piece from +0 to +6, one step at a time, and never fails.
 *  - The Jewel of the Rift raises it on to +9 (and works from +0 as well): sure up to +6, then three in four, and from +7 a failure costs a step.
 *  - Past +9 the crafting grid forges it, with a Rift and a Dawn for every step above +9: one in four, and a failure costs a step.
 *  - The Jewel of Bloom gives it one more attribute, a stat it does not have, and may fail too. A piece takes only one.
 *
 * They work on anything that can carry gear stats (armor, shields, swords, bows and the class weapons), found or plain.
 * Pure rules: the dice come in from the caller, so the server's random source decides.
 */

export type JewelKind = 'dawn' | 'rift' | 'bloom';

export interface JewelDef {
  kind: JewelKind;
  id: number;
  /** The name shown (the item's own name is lower-case with underscores). */
  name: string;
  /** What it does, in one line, for the tooltip. */
  blurb: string;
}

export const JEWELS: readonly JewelDef[] = [
  { kind: 'dawn', id: I.JEWEL_DAWN, name: 'Jewel of Dawn', blurb: `Raises a piece of equipment from +0 to +6. It never fails.` },
  { kind: 'rift', id: I.JEWEL_RIFT, name: 'Jewel of the Rift', blurb: `Raises a piece of equipment up to +${PLUS_MAX}. Sure up to +6, then 75% a step; from +7 a failure costs a step.` },
  { kind: 'bloom', id: I.JEWEL_BLOOM, name: 'Jewel of Bloom', blurb: 'Gives a piece of equipment one more attribute. It can fail. A piece takes one.' },
];

/** Which jewel an item is, or null. */
export const jewelKind = (id: number): JewelKind | null => JEWELS.find((j) => j.id === id)?.kind ?? null;
export const jewelDef = (kind: JewelKind): JewelDef => JEWELS.find((j) => j.kind === kind)!;

/** The highest level a Jewel of Dawn takes a piece to. */
export const DAWN_MAX = 6;

/** The chance the Jewel of the Rift works on a piece of this upgrade (index: the level it has now, +0 to +8): +0 to +6 is sure, then 75%. */
export const RIFT_CHANCE: readonly number[] = [1, 1, 1, 1, 1, 1, 0.75, 0.75, 0.75];

/** The chance the forge in the crafting grid takes a piece one step past +9 (the jewels are used up either way). */
export const FORGE_CHANCE = 0.25;
/** How long the forging takes, in seconds: the animation in the crafting window, and then the piece is there. */
export const FORGE_TIME = 2.4;

/** The chance the Jewel of Bloom adds its attribute. */
export const BLOOM_CHANCE = 0.7;

export interface JewelResult {
  /** The jewel was used up (a refusal, which changes nothing, does not use it). */
  used: boolean;
  /** The piece as it is now (a new stack), or null when it is unchanged. */
  stack: ItemStack | null;
  /** What happened, for the player. */
  text: string;
  /** It worked. */
  ok: boolean;
  /** The short result floated above the piece: "+3", "Failed", "+4 Haste". Empty for a refusal. */
  label: string;
  /** A second, smaller line ("+7 > +6", "Unchanged"), or empty. */
  detail: string;
}

const refuse = (text: string): JewelResult => ({ used: false, stack: null, text, ok: false, label: '', detail: '' });

/** The piece with the jewels' part of its roll replaced (a new stack; the rest of it is as it was). */
function withJewelRoll(target: ItemStack, change: { u?: number; o?: [GearStat, number] }): ItemStack {
  const out = cloneStack(target);
  const old = cloneGear(target.gear);
  const next: GearRoll = old ?? { r: 0, l: 1, s: [] };
  if (change.u !== undefined) {
    if (change.u > 0) next.u = change.u;
    else delete next.u;
  }
  if (change.o) next.o = change.o;
  if (!next.u && !next.o && next.r === 0) delete out.gear;
  else out.gear = next;
  return out;
}

/** The name of a piece for the messages. */
const nameOf = (stack: ItemStack): string => stack.name ?? getItem(stack.id).name.replace(/_/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** Use a jewel on a piece. The caller removes the jewel from the player's hand when `used`, and puts `stack` in the slot when given. */
export function useJewel(kind: JewelKind, target: ItemStack, rand: () => number): JewelResult {
  if (!canRollGear(target.id) || target.count !== 1) return refuse(`${jewelDef(kind).name} works on armor, shields and weapons.`);
  const plus = target.gear?.u ?? 0;
  const name = nameOf(target);
  if (kind === 'dawn') {
    if (plus >= DAWN_MAX) return refuse(plus >= PLUS_MAX ? `${name} is at +${plus}. Craft it with jewels in the crafting grid to go further.` : `${jewelDef('dawn').name} only takes a piece to +${DAWN_MAX}. Use the Jewel of the Rift.`);
    return { used: true, ok: true, stack: withJewelRoll(target, { u: plus + 1 }), text: `${name} is now +${plus + 1}.`, label: `+${plus + 1}`, detail: 'Upgraded' };
  }
  if (kind === 'rift') {
    if (plus >= UPGRADE_MAX) return refuse(`${name} cannot be raised any higher.`);
    if (plus >= PLUS_MAX) return refuse(`${name} is at +${plus}, as far as a jewel takes it. Craft it with jewels in the crafting grid to go further.`);
    if (rand() < RIFT_CHANCE[plus]) {
      return { used: true, ok: true, stack: withJewelRoll(target, { u: plus + 1 }), text: `${name} is now +${plus + 1}.`, label: `+${plus + 1}`, detail: 'Upgraded' };
    }
    if (plus >= 7) return { used: true, ok: false, stack: withJewelRoll(target, { u: plus - 1 }), text: `The jewel shatters. ${name} drops to +${plus - 1}.`, label: 'Failed', detail: `+${plus} > +${plus - 1}` };
    return { used: true, ok: false, stack: null, text: `The jewel shatters. ${name} is unchanged.`, label: 'Failed', detail: 'Unchanged' };
  }
  // bloom
  if (target.gear?.o) return refuse(`${name} already has an extra attribute.`);
  const option = rollOption(target.id, target.gear, rand);
  if (!option) return refuse(`${name} has nothing left to gain.`);
  if (rand() < BLOOM_CHANCE) return { used: true, ok: true, stack: withJewelRoll(target, { o: option }), text: `${name} blooms with a new attribute.`, label: statLine(option[0], option[1]), detail: 'New attribute' };
  return { used: true, ok: false, stack: null, text: `The jewel withers. ${name} is unchanged.`, label: 'Failed', detail: 'Unchanged' };
}

// ---- going past +9: the crafting grid -------------------------------------------------------------------------------

/**
 * What it takes to raise a piece that is at +`plus` (9 or more) one more step in the crafting grid: as many Jewels of the Rift
 * and as many Jewels of Dawn as the step is above +9 (+10: one of each, +11: two, +12: three, +13: four). Null when it cannot
 * be done (a piece below +9 is raised with the jewels themselves, and +13 is the end).
 */
export function forgeCost(plus: number): number | null {
  return plus >= PLUS_MAX && plus < UPGRADE_MAX ? plus + 1 - PLUS_MAX : null;
}

/**
 * The crafting grid as the forge sees it: a piece at +9 or more together with its Jewels of the Rift and of Dawn, in as many
 * cells as you like (a stack counts for all its jewels), and nothing else. The piece in it and its level, or null when the grid is not that.
 * (Jewels stack, so even the 2x2 grid of the inventory takes the piece and a stack of each.)
 */
export function forgePiece(grid: readonly (ItemStack | null)[]): { piece: ItemStack; plus: number } | null {
  let piece: ItemStack | null = null;
  let rift = 0;
  let dawn = 0;
  for (const cell of grid) {
    if (!cell) continue;
    const kind = jewelKind(cell.id);
    if (kind === 'rift') rift += cell.count;
    else if (kind === 'dawn') dawn += cell.count;
    else if (!piece && canRollGear(cell.id) && cell.count === 1) piece = cell;
    else return null;
  }
  const plus = piece?.gear?.u ?? 0;
  const cost = forgeCost(plus);
  if (!piece || cost === null || rift !== cost || dawn !== cost) return null;
  return { piece, plus };
}

/** The piece the grid would forge, one step higher (what it becomes when the forge takes), or null when the grid is not ready. */
export function forgeUpgrade(grid: readonly (ItemStack | null)[]): ItemStack | null {
  const f = forgePiece(grid);
  return f ? withJewelRoll(f.piece, { u: f.plus + 1 }) : null;
}

export interface ForgeOutcome {
  ok: boolean;
  /** The piece as it comes out: a step higher, or (when the forge failed) a step lower. */
  stack: ItemStack;
  text: string;
  label: string;
  detail: string;
}

/** Roll the forge for the grid: one in four takes, and a failure costs the piece a step (the jewels are gone either way). Null when the grid is not ready. */
export function forgeOutcome(grid: readonly (ItemStack | null)[], rand: () => number): ForgeOutcome | null {
  const f = forgePiece(grid);
  if (!f) return null;
  const name = nameOf(f.piece);
  if (rand() < FORGE_CHANCE) {
    return { ok: true, stack: withJewelRoll(f.piece, { u: f.plus + 1 }), text: `The forge takes. ${name} is now +${f.plus + 1}.`, label: `+${f.plus + 1}`, detail: 'Forged' };
  }
  return { ok: false, stack: withJewelRoll(f.piece, { u: f.plus - 1 }), text: `The jewels are lost. ${name} drops to +${f.plus - 1}.`, label: 'Failed', detail: `+${f.plus} > +${f.plus - 1}` };
}

/** The recipe book lists the four steps past +9 after its recipes: step `target` (10..13) is entry `FORGE_BASE + target - 10`. */
export const FORGE_BASE = 4000;
export const FORGE_TARGETS: readonly number[] = [10, 11, 12, 13];
export const forgeIndex = (target: number): number => FORGE_BASE + target - 10;
/** The step an entry of the recipe book is (10..13), or null when it is an ordinary recipe. */
export const forgeTarget = (index: number): number | null => (index >= FORGE_BASE && index < FORGE_BASE + FORGE_TARGETS.length ? index - FORGE_BASE + 10 : null);

/** How many cells of the grid the step to `target` takes: the piece, and a Jewel of the Rift and of Dawn for every step above +9. */
export const forgeCells = (target: number): number => 1 + 2 * (target - PLUS_MAX);

/**
 * The jewels laid out in the grid for the step to `target`, as item ids by cell (0: nothing): the piece takes the first cell, then
 * the Jewels of the Rift, then those of Dawn. This is what the recipe book shows as ghosts. Null when the grid is too small.
 */
export function forgeLayout(target: number, cells: number): number[] | null {
  const n = target - PLUS_MAX;
  if (!FORGE_TARGETS.includes(target) || forgeCells(target) > cells) return null;
  return Array.from({ length: cells }, (_, i) => (i >= 1 && i <= n ? I.JEWEL_RIFT : i > n && i <= 2 * n ? I.JEWEL_DAWN : 0));
}

/** Ghosts in the grid: the item id shown in each cell (0: none), and how many of it go there. */
export interface ForgeGhosts {
  ids: number[];
  counts: number[];
}

/**
 * The ghosts for the step to `target` as the recipe book previews it: one jewel to a cell where they fit, and where they do not
 * (the 2x2 grid of the inventory) a stack of each Rift and Dawn in the cells after the piece's. Null when even that does not fit.
 */
export function forgeGhostLayout(target: number, cells: number): ForgeGhosts | null {
  const one = forgeLayout(target, cells);
  if (one) return { ids: one, counts: one.map(() => 1) };
  if (!FORGE_TARGETS.includes(target) || cells < 3) return null;
  const n = target - PLUS_MAX;
  const ids = Array.from({ length: cells }, (_, i) => (i === 1 ? I.JEWEL_RIFT : i === 2 ? I.JEWEL_DAWN : 0));
  return { ids, counts: ids.map((id) => (id ? n : 1)) };
}

/**
 * The ghosts for a grid that holds a piece ready for the forge: the cells that are still empty show which jewel goes in them (the
 * Rifts first, then Dawn), counting the jewels that are in the grid already. Where there are not enough empty cells for one jewel
 * to a cell, a single cell shows the Rifts that are missing (with their number) and the next one the Dawns. Null when there is no
 * such piece, when the grid has something else in it, or when even that does not fit.
 */
export function forgeGhostPlan(grid: readonly (ItemStack | null)[]): ForgeGhosts | null {
  let piece = -1;
  let rift = 0;
  let dawn = 0;
  for (let i = 0; i < grid.length; i++) {
    const cell = grid[i];
    if (!cell) continue;
    const kind = jewelKind(cell.id);
    if (kind === 'rift') rift += cell.count;
    else if (kind === 'dawn') dawn += cell.count;
    else if (piece < 0 && canRollGear(cell.id) && cell.count === 1 && forgeCost(cell.gear?.u ?? 0) !== null) piece = i;
    else return null;
  }
  const cost = piece >= 0 ? forgeCost(grid[piece]?.gear?.u ?? 0) : null;
  if (cost === null) return null;
  const needRift = Math.max(0, cost - rift);
  const needDawn = Math.max(0, cost - dawn);
  const ids = grid.map(() => 0);
  const counts = grid.map(() => 1);
  const free = grid.flatMap((cell, i) => (cell ? [] : [i]));
  if (needRift + needDawn <= free.length) {
    // One jewel to a cell, the Rifts first.
    free.forEach((cellAt, k) => {
      if (k < needRift) ids[cellAt] = I.JEWEL_RIFT;
      else if (k < needRift + needDawn) ids[cellAt] = I.JEWEL_DAWN;
    });
    return { ids, counts };
  }
  // A stack of each in a cell of its own.
  let k = 0;
  if (needRift > 0) {
    if (k >= free.length) return null;
    ids[free[k]] = I.JEWEL_RIFT;
    counts[free[k++]] = needRift;
  }
  if (needDawn > 0) {
    if (k >= free.length) return null;
    ids[free[k]] = I.JEWEL_DAWN;
    counts[free[k]] = needDawn;
  }
  return { ids, counts };
}

/** The ids of `forgeGhostPlan`: which jewel is ghosted in which cell. */
export const forgeGhosts = (grid: readonly (ItemStack | null)[]): number[] | null => forgeGhostPlan(grid)?.ids ?? null;
/** Does the player have what the step to `target` takes: a piece at +(target-1) and the jewels (counting what is in `places`)? */
export function canForge(target: number, places: readonly { slots: readonly (ItemStack | null)[]; countOf(id: number): number }[]): boolean {
  const cost = forgeCost(target - 1);
  if (cost === null) return false;
  const count = (id: number): number => places.reduce((sum, p) => sum + p.countOf(id), 0);
  if (count(I.JEWEL_RIFT) < cost || count(I.JEWEL_DAWN) < cost) return false;
  return places.some((p) => p.slots.some((s) => !!s && canRollGear(s.id) && s.count === 1 && (s.gear?.u ?? 0) === target - 1));
}

/** What the grid with this piece in it still needs to go further, for its tooltip ("3 Jewels of the Rift and 3 of Dawn"); null if it is no piece for the forge. */
export function forgeHint(piece: ItemStack): string | null {
  const plus = piece.gear?.u ?? 0;
  const cost = forgeCost(plus);
  if (cost === null || !canRollGear(piece.id)) return null;
  const s = cost === 1 ? '' : 's';
  return `To +${plus + 1}: the piece, ${cost} Jewel${s} of the Rift and ${cost} Jewel${s} of Dawn in the crafting grid (${Math.round(FORGE_CHANCE * 100)}%)`;
}

// ---- where they are found -------------------------------------------------------------------------------------------

/** The chance a kill of this kind drops a jewel (before choosing which). */
const JEWEL_DROP_CHANCE: Partial<Record<MobKind, number>> = {
  zombie: 0.012,
  husk: 0.014,
  drowned: 0.012,
  skeleton: 0.014,
  stray: 0.016,
  spider: 0.01,
  cave_spider: 0.012,
  creeper: 0.014,
  enderman: 0.06,
};

/** How likely each jewel is to be the one that drops: Dawn is common, Bloom rare. */
const JEWEL_DROP_WEIGHT: Record<JewelKind, number> = { dawn: 60, rift: 30, bloom: 10 };

export const jewelDropChance = (kind: MobKind): number => JEWEL_DROP_CHANCE[kind] ?? 0;

/** What a monster that has just been killed leaves behind: the item id of a jewel, or null. */
export function jewelDrop(kind: MobKind, rand: () => number): number | null {
  const chance = JEWEL_DROP_CHANCE[kind];
  if (!chance || rand() >= chance) return null;
  let pick = rand() * JEWELS.reduce((sum, j) => sum + JEWEL_DROP_WEIGHT[j.kind], 0);
  for (const j of JEWELS) {
    pick -= JEWEL_DROP_WEIGHT[j.kind];
    if (pick < 0) return j.id;
  }
  return I.JEWEL_BLOOM;
}
