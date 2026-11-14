import { CLASS_IDS, CLASS_LEVELS, type ClassId } from './classes';
import { canRollGear, rollGear, rollOption, UPGRADE_MAX, type GearRoll, type Rarity } from './gear';
import { makeStack, type ItemStack } from './inventory';
import { allItems, I, ITEMS, type ItemDef } from './items';
import { jewelKind } from './jewels';

/** The shelves of the creative inventory. */
export type CreativeShelf = 'blocks' | 'tools' | 'weapons' | 'armor' | 'food' | 'jewels' | 'materials';
export type CreativeTab = 'all' | CreativeShelf | 'gear';

export const CREATIVE_TABS: readonly { id: CreativeTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'blocks', label: 'Blocks' },
  { id: 'tools', label: 'Tools' },
  { id: 'weapons', label: 'Weapons' },
  { id: 'armor', label: 'Armor' },
  { id: 'food', label: 'Food' },
  { id: 'jewels', label: 'Jewels' },
  { id: 'materials', label: 'Materials' },
  { id: 'gear', label: 'Gear Forge' },
];

/** The amounts a click on the palette can hand out (what does not stack that far gives what it does). */
export const CREATIVE_AMOUNTS = [1, 16, 64] as const;
export type CreativeAmount = (typeof CREATIVE_AMOUNTS)[number];
export const isCreativeAmount = (n: unknown): n is CreativeAmount => (CREATIVE_AMOUNTS as readonly unknown[]).includes(n);

/** Which shelf an item sits on. */
export function creativeShelf(def: ItemDef): CreativeShelf {
  if (jewelKind(def.id)) return 'jewels';
  if (def.armor) return 'armor';
  if (def.weapon || def.shield || def.offhand || def.tool?.kind === 'sword' || def.use === 'bow' || def.id === I.ARROW) return 'weapons';
  if (def.tool) return 'tools';
  if (def.food) return 'food';
  if (def.block !== null) return 'blocks';
  return 'materials';
}

let shelved: { def: ItemDef; shelf: CreativeShelf; name: string }[] | null = null;

/** Every item of the palette, in the order of its slots (the palette is built from the same list). */
function shelves() {
  return (shelved ??= allItems().map((def) => ({ def, shelf: creativeShelf(def), name: def.name.replace(/_/g, ' ').toLowerCase() })));
}

/**
 * The palette slots a tab and a search show. Every word of the search has to be in the name (or be what shelf the item is on),
 * so "iron pick" finds the iron pickaxe and "food apple" the apples. Both sides get the same answer: it only depends on the items.
 */
export function creativeIndices(tab: CreativeTab, query: string): number[] {
  if (tab === 'gear') return [];
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const out: number[] = [];
  shelves().forEach((e, i) => {
    if (tab !== 'all' && e.shelf !== tab) return;
    if (words.every((w) => e.name.includes(w) || e.shelf.startsWith(w))) out.push(i);
  });
  return out;
}

/** How many items a tab holds (for the number beside its name). */
export function creativeCount(tab: CreativeTab): number {
  return tab === 'gear' ? gearBases().length : tab === 'all' ? shelves().length : shelves().filter((e) => e.shelf === tab).length;
}

// ---- the gear forge ------------------------------------------------------------------------------------------------

/** What the gear forge of the creative inventory makes. */
export interface GearSpec {
  id: number;
  /** 0 is a plain piece, with no stats of its own (only what the upgrade gives). */
  rarity: 0 | Rarity;
  level: number;
  /** The class it is made for (null: anyone). */
  cls: ClassId | null;
  /** The upgrade, +0 to +13. */
  plus: number;
  /** A Jewel of Bloom's extra attribute on top. */
  bloom: boolean;
}

/** Every piece that can carry gear stats, in the order of the palette. */
export function gearBases(): number[] {
  return shelves()
    .filter((e) => canRollGear(e.def.id))
    .map((e) => e.def.id);
}

/** Is it a gear spec the forge can make? */
export function validGearSpec(raw: GearSpec): boolean {
  return (
    Number.isInteger(raw.id) &&
    ITEMS.has(raw.id) &&
    canRollGear(raw.id) &&
    Number.isInteger(raw.rarity) &&
    raw.rarity >= 0 &&
    raw.rarity <= 3 &&
    Number.isInteger(raw.level) &&
    raw.level >= 1 &&
    raw.level <= CLASS_LEVELS.max &&
    (raw.cls === null || (CLASS_IDS as readonly string[]).includes(raw.cls)) &&
    Number.isInteger(raw.plus) &&
    raw.plus >= 0 &&
    raw.plus <= UPGRADE_MAX &&
    typeof raw.bloom === 'boolean'
  );
}

/** The piece for a spec, its stats rolled with `rand` (null when it cannot carry gear). */
export function creativeGear(spec: GearSpec, rand: () => number): ItemStack | null {
  if (!canRollGear(spec.id)) return null;
  const stack = makeStack(spec.id, 1);
  const rolled: GearRoll | null =
    spec.rarity === 0 ? { r: 0, l: 1, s: [] } : rollGear(spec.id, spec.level, spec.rarity, spec.cls ?? undefined, rand);
  if (!rolled) return null;
  const gear: GearRoll = { ...rolled, ...(spec.plus > 0 ? { u: spec.plus } : {}) };
  if (spec.bloom) {
    const o = rollOption(spec.id, gear, rand);
    if (o) gear.o = o;
  }
  stack.gear = gear;
  return stack;
}
