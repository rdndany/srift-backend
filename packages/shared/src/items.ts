import type { AbilityId } from './abilities';
import { MOUNTS, type MountId } from './mounts';
import { ARMOR_MATERIALS, ARMOR_SLOTS, OUTFIT_CLASSES, armorDef, outfitDef, type ArmorDef, type ArmorMaterial, type OutfitClass } from './armor';
import {
  B,
  BED_RED,
  BLOCKS,
  BUILDING_ITEM,
  DYE_NAMES,
  LANTERN_LIGHT,
  LEAF_BLOCKS,
  SOUL_LANTERN_LIGHT,
  bedInfo,
  NO_ITEM_BLOCKS,
  doorInfo,
  gateId,
  lanternInfo,
  slabId,
  stairId,
  trapdoorId,
  ladderId,
  wireId,
  TOOL_KINDS,
  TOOL_MATERIALS,
  tileIndex,
  type BlockDef,
  type ToolKind,
  type ToolMaterial,
} from './blocks';

/**
 * Items. Ids 1..255 and 1000 and up are block items (item id === block id). Ids 256..999 are
 * non-block items (materials, food, tools).
 */

export const I = {
  STICK: 256,
  COAL: 257,
  IRON_INGOT: 258,
  GOLD_INGOT: 259,
  DIAMOND: 260,
  APPLE: 261,
  RAW_MEAT: 262,
  COOKED_MEAT: 263,
  ROTTEN_FLESH: 264,
  BONE: 265,
  ARROW: 266,
  GUNPOWDER: 267,
  WHEAT_SEEDS: 268,
  WHEAT: 269,
  FLINT: 301,
  STRING: 302,
  BOW: 303,
  /** Placed after the tool id range (270..294). */
  BREAD: 300,
  LEATHER: 304,
  /** What iron and gold ore drop; the furnace turns them into ingots. */
  RAW_IRON: 305,
  RAW_GOLD: 306,
  BUCKET: 330,
  WATER_BUCKET: 331,
  LAVA_BUCKET: 332,
  FEATHER: 333,
  MUTTON: 334,
  COOKED_MUTTON: 335,
  CHICKEN: 336,
  COOKED_CHICKEN: 337,
  RABBIT: 338,
  COOKED_RABBIT: 339,
  INK_SAC: 340,
  SLIMEBALL: 341,
  ENDER_PEARL: 342,
  SPIDER_EYE: 343,
  SHIELD: 344,
  BED: 345,
  DOOR: 346,
  /** Sixteen dyes: `dyeId(colour)` (see `DYE_NAMES`). */
  DYE_BASE: 347,
  /** Beds of the colours other than red (red is `I.BED`): `bedItemId(colour)`. */
  BED_COLOR_BASE: 363,
  /** The currency of the villagers (363 + 15 is the last bed). */
  EMERALD: 379,
  /** Paper (pressed from wheat), the book made of it, and the book once it is enchanted (the enchantments live on the stack). */
  PAPER: 380,
  BOOK: 381,
  ENCHANTED_BOOK: 382,
  /** Lights fire where you click (64 uses). */
  FLINT_AND_STEEL: 383,
  /** Lapis lazuli: what lapis ore drops and an enchanting table is paid in; it also grinds into blue dye (see crafting.ts). */
  LAPIS_LAZULI: 384,
  /** A bottle that bursts into experience when thrown; never made, only found. */
  EXPERIENCE_BOTTLE: 385,
  /** Two iron ingots: shear a sheep for wool without hurting it, and cut leaves and cobwebs whole. */
  SHEARS: 386,
  /** Right-click on a rail to set it down; right-click the cart to get in. */
  MINECART: 387,
  REDSTONE: 389,
  /** Right-click on water to launch it. */
  BOAT: 388,
  /** A map of the lands around: hold it, right-click to open it up and read it (the picture is drawn by the client). */
  MAP: 390,
  /** Class weapons (see `ItemDef.weapon`): anyone may carry them, a class is simply better with its own kind. */
  GREATSWORD: 391,
  DAGGER: 392,
  STAFF: 393,
  WAND: 394,
  SPELLBOOK: 395,
  CROSSBOW: 396,
  /** The Mage's off-hand item: a focus that sharpens spells (see offhandModifier). */
  ORB: 397,
  /** Skill books, one per ability (400 + its place in `SKILL_BOOKS`): right-click one to learn the ability. */
  SKILL_BOOK_BASE: 400,
  /** Bags, smallest first (420 + its place in `BAGS`): worn in a bag slot, each adds room for more items. */
  BAG_BASE: 420,
  /** Hold the right button on it and stand still: it takes you to your bed (see emberstone.ts). Every new character carries one. */
  EMBERSTONE: 430,
  /** The jewels (see jewels.ts): pick one up in the inventory screen and click a piece of equipment with it. */
  JEWEL_DAWN: 431,
  JEWEL_RIFT: 432,
  JEWEL_BLOOM: 433,
  /** Hold it and its needle (a sprite with `COMPASS_FRAMES` pictures) swings to point north. */
  COMPASS: 434,
  /** The mount horns (440 + the mount's place in `MOUNTS`): right-click one to put it in the mount slot, and summon it with the mount key. */
  MOUNT_BASE: 440,
  /** The clothes of the classes (460 + class * 4 + slot, see `outfitId`): worn in the armor slots, and taken off like armor. */
  OUTFIT_BASE: 460,
} as const;

/** The classes a skill book can be for (the same ids as `ClassId`, written out so that this file need not import classes). */
type BookClass = 'warrior' | 'mage' | 'ranger';

/**
 * Every skill book: which ability it teaches and whose it is (it names the class, so the picture is the class's). The
 * position is the item id (`skillBookId`), so new books go on the end. abilities.test.ts checks that this lists every
 * ability exactly once.
 */
export const SKILL_BOOKS: readonly { ability: AbilityId; classId: BookClass }[] = [
  { ability: 'ground_slam', classId: 'warrior' },
  { ability: 'shield_bash', classId: 'warrior' },
  { ability: 'charge', classId: 'warrior' },
  { ability: 'iron_defense', classId: 'warrior' },
  { ability: 'fireball', classId: 'mage' },
  { ability: 'frost_nova', classId: 'mage' },
  { ability: 'meteor', classId: 'mage' },
  { ability: 'arcane_shield', classId: 'mage' },
  { ability: 'piercing_shot', classId: 'ranger' },
  { ability: 'evasive_roll', classId: 'ranger' },
  { ability: 'bear_trap', classId: 'ranger' },
  { ability: 'rain_of_arrows', classId: 'ranger' },
];

/** The skill book that teaches an ability. */
export function skillBookId(ability: AbilityId): number {
  const i = SKILL_BOOKS.findIndex((b) => b.ability === ability);
  if (i < 0) throw new Error(`no skill book for ${ability}`);
  return I.SKILL_BOOK_BASE + i;
}

/** The ability a skill book teaches, or null for anything else. */
export function skillBookAbility(id: number): AbilityId | null {
  const i = id - I.SKILL_BOOK_BASE;
  return Number.isInteger(i) && i >= 0 && i < SKILL_BOOKS.length ? SKILL_BOOKS[i].ability : null;
}

/** The horn that teaches a mount. */
export function mountItemId(id: MountId): number {
  const i = MOUNTS.findIndex((m) => m.id === id);
  if (i < 0) throw new Error(`no horn for ${id}`);
  return I.MOUNT_BASE + i;
}

/** The mount a horn teaches, or null for anything else. */
export function mountOfItem(id: number): MountId | null {
  const i = id - I.MOUNT_BASE;
  return Number.isInteger(i) && i >= 0 && i < MOUNTS.length ? MOUNTS[i].id : null;
}

/**
 * The bags, smallest first: the position is the item id (`I.BAG_BASE + i`), so new bags go on the end. A character
 * wears up to four, and each holds this many more items (see bags.ts for the rules, where they come from, and the price).
 */
export const BAGS: readonly { name: string; slots: number }[] = [
  { name: 'small_pouch', slots: 6 },
  { name: 'leather_satchel', slots: 8 },
  { name: 'traveler_pack', slots: 10 },
  { name: 'adventurer_pack', slots: 12 },
  { name: 'explorer_pack', slots: 14 },
  { name: 'rift_satchel', slots: 16 },
];

/** How many slots a bag adds, or 0 for an item that is not a bag. */
export function bagSlotsOf(id: number): number {
  const i = id - I.BAG_BASE;
  return Number.isInteger(i) && i >= 0 && i < BAGS.length ? BAGS[i].slots : 0;
}

/** A bag's place in `BAGS` (0 is the smallest), or -1 for an item that is not a bag. */
export const bagTier = (id: number): number => (bagSlotsOf(id) > 0 ? id - I.BAG_BASE : -1);

/** The item id of the bag at this place in `BAGS` (0 is the smallest). */
export const bagId = (tier: number): number => I.BAG_BASE + tier;

/** Armor pieces take ids 310..325: ARMOR_BASE + material * 4 + slot. */
const ARMOR_BASE = 310;

/** The bed item of a colour (0..15, see `DYE_NAMES`; red is the original `I.BED`). */
export function bedItemId(color: number): number {
  return color === BED_RED ? I.BED : I.BED_COLOR_BASE + color;
}

/** The colour (0..15) of a bed item, or -1 for anything else. */
export function bedItemColor(id: number): number {
  if (id === I.BED) return BED_RED;
  const c = id - I.BED_COLOR_BASE;
  return c >= 0 && c < DYE_NAMES.length && c !== BED_RED ? c : -1;
}

/** The dye item of a colour (0..15, see `DYE_NAMES`). */
export function dyeId(color: number): number {
  return I.DYE_BASE + color;
}

/** The colour (0..15) of a dye item, or -1 for anything else. */
export function dyeColor(id: number): number {
  const c = id - I.DYE_BASE;
  return c >= 0 && c < DYE_NAMES.length ? c : -1;
}

/** Bone meal is white dye, as in the original: it makes crops, saplings and grass grow. */
export const BONE_MEAL = dyeId(DYE_NAMES.indexOf('white'));

/** The clothes of a class: the item of each armor slot (helmet, chestplate, leggings, boots). */
export function outfitId(classId: OutfitClass, slotIndex: number): number {
  return I.OUTFIT_BASE + OUTFIT_CLASSES.indexOf(classId) * ARMOR_SLOTS.length + slotIndex;
}

/** All four pieces of a class's clothes, in slot order. */
export function outfitItems(classId: OutfitClass): number[] {
  return ARMOR_SLOTS.map((_, i) => outfitId(classId, i));
}

/** The class a piece of clothes belongs to, or null for anything else. */
export function outfitOfItem(id: number): OutfitClass | null {
  const i = id - I.OUTFIT_BASE;
  return Number.isInteger(i) && i >= 0 && i < OUTFIT_CLASSES.length * ARMOR_SLOTS.length ? OUTFIT_CLASSES[Math.floor(i / ARMOR_SLOTS.length)] : null;
}

const OUTFIT_NAMES: Record<OutfitClass, readonly [string, string, string, string]> = {
  warrior: ['warrior_helm', 'warrior_cuirass', 'warrior_greaves', 'warrior_boots'],
  mage: ['mage_hat', 'mage_robe', 'mage_skirt', 'mage_boots'],
  ranger: ['ranger_hood', 'ranger_jerkin', 'ranger_trousers', 'ranger_boots'],
};

export function armorId(slotIndex: number, material: ArmorMaterial): number {
  return ARMOR_BASE + ARMOR_MATERIALS.indexOf(material) * ARMOR_SLOTS.length + slotIndex;
}

/** Hits a shield takes before it breaks (each block costs one plus the damage it stopped). */
export const SHIELD_DURABILITY = 336;

const TOOL_BASE = 270;

export function toolId(kind: ToolKind, material: ToolMaterial): number {
  return TOOL_BASE + TOOL_KINDS.indexOf(kind) * TOOL_MATERIALS.length + TOOL_MATERIALS.indexOf(material);
}

export interface ToolDef {
  kind: ToolKind;
  material: ToolMaterial;
  /** Harvest level compared against a block's `harvest` requirement. */
  harvest: number;
  /** Mining speed multiplier on blocks this tool is effective against. */
  speed: number;
  durability: number;
  /** Melee damage in half-hearts. */
  damage: number;
}

/** What a weapon does beyond what the tool system says (the swords and axes keep using `tool`). */
export interface WeaponDef {
  /** The kind of damage it deals, which the class multiplies. */
  kind: 'melee' | 'ranged' | 'spell';
  /** Damage of one hit, shot or cast, before the class (half-hearts). */
  damage: number;
  /** Seconds between uses, before the class's attack speed. */
  cooldown: number;
  /** Resource one use costs (spell weapons: mana and the like); 0 = free. */
  cost: number;
  /** Spell weapons: how fast the bolt flies (blocks per second). */
  speed?: number;
  /** Spell weapons: the burst of the bolt also hurts hostile mobs this close to where it ends (0 or absent: only what it hits). */
  radius?: number;
}

export interface FoodDef {
  hunger: number;
  saturation: number;
}

/**
 * What the use button does with an item that has a use of its own. Food is eaten, armor is put on, a shield is raised, a spell
 * weapon casts and a block is placed without one: those follow from the other properties of the item. `Player` has the code for each.
 */
export type ItemUse =
  // In the hand:
  | 'bucket' // scoops up water or lava, or pours it out
  | 'xp_bottle' // thrown: it breaks into experience
  | 'pearl' // thrown: you go where it lands
  | 'vehicle' // put on a rail or on the water, to ride
  | 'emberstone' // held: it takes you home
  | 'bow' // held to draw, let go to shoot
  | 'crossbow' // held to wind, shoots when it is wound all the way
  | 'skill_book' // teaches its ability
  | 'horn' // goes in the mount slot
  | 'map' // read: the hand that holds it does nothing else (it does not hit, dig, build or use), and the off hand takes it too
  // On the block the crosshair is on:
  | 'flint' // lights a fire
  | 'bone_meal' // makes it grow
  | 'bed' // laid down
  | 'door'; // hung

/** How a figure carries an item in its hand: held in the fist, hanging from it (a lantern), or the two ways of the Mage (a staff stood by the foot, a wand cast with its tip). */
export type Carry = 'hand' | 'hang' | 'staff' | 'wand';

/** Light from an item in the hand: its colour (0..1 each) and how strong it is at the hand, on the scale of block light. */
export interface HeldLight {
  r: number;
  g: number;
  b: number;
  level: number;
}

/** What the tooltip calls an item under its name (see `itemKind` in tooltip.ts). */
export type ItemKind = 'Enchanted Book' | 'Skill Book' | 'Mount' | 'Bag' | 'Special' | 'Jewel' | 'Equipment' | 'Food' | 'Item' | 'Nature' | 'Block' | 'Dye' | 'Material';

export interface ItemDef {
  id: number;
  name: string;
  maxStack: number;
  /** Atlas tile used for the item icon (side texture for block items). */
  tile: number;
  /** Block placed when used, if any. */
  block: number | null;
  tool: ToolDef | null;
  food: FoodDef | null;
  /** Seconds of furnace burn time (0 = not a fuel). */
  fuel: number;
  /** Uses before the item breaks (0 = does not wear). Tools, the bow and armor. */
  durability: number;
  /** Set for armor pieces: which slot they go in and what they protect. */
  armor: ArmorDef | null;
  /** Raised with the use button to block hits from the front (see `Player.blocking`). */
  shield: boolean;
  /** Set for the class weapons: how they hit (null for everything else). */
  weapon: WeaponDef | null;
  /** Can sit in the off-hand slot: a shield, an orb or a dagger. */
  offhand: boolean;
  /** What the use button does with it, if it has a use of its own (see `ItemUse`). */
  use: ItemUse | null;
  /** How a figure carries it. */
  carry: Carry;
  /** The light it gives while it is in a hand (null: none). */
  heldLight: HeldLight | null;
  /** Cuts like shears: leaves, wool and webs come away quickly and whole, and a sheep is shorn with it. */
  shears: boolean;
  /** Kept for good: it cannot be thrown on the ground or traded away (the Emberstone and the map). */
  undroppable: boolean;
  /** Its enchantments are stored in it, not at work: an enchanted book, which does nothing in the hand and is read at an anvil. */
  storesEnchants: boolean;
  /** What kind of thing the tooltip calls it, where that does not follow from the rest (null: see `itemKind`). */
  kind: ItemKind | null;
}

/** Is the item used on the block the crosshair is on: built with, or a hoe, a light, something that makes it grow, a bed, a door? */
export function usedOnBlock(item: ItemDef): boolean {
  return item.tool?.kind === 'hoe' || item.block != null || item.use === 'bed' || item.use === 'door' || item.use === 'flint' || item.use === 'bone_meal';
}

const MATERIAL_STATS: Record<ToolMaterial, { harvest: number; speed: number; durability: number; bonus: number }> = {
  wood: { harvest: 1, speed: 2, durability: 59, bonus: 0 },
  stone: { harvest: 2, speed: 4, durability: 131, bonus: 1 },
  iron: { harvest: 3, speed: 6, durability: 250, bonus: 2 },
  gold: { harvest: 1, speed: 12, durability: 32, bonus: 0 },
  diamond: { harvest: 4, speed: 8, durability: 1561, bonus: 3 },
};

const BASE_DAMAGE: Record<ToolKind, number> = { sword: 4, axe: 3, pickaxe: 2, shovel: 1, hoe: 1 };

export const ITEMS = new Map<number, ItemDef>();

function add(def: Partial<ItemDef> & Pick<ItemDef, 'id' | 'name' | 'tile'>): void {
  ITEMS.set(def.id, { maxStack: 64, block: null, tool: null, food: null, fuel: 0, armor: null, shield: false, weapon: null, offhand: false, use: null, carry: 'hand', heldLight: null, shears: false, undroppable: false, storesEnchants: false, kind: null, durability: def.tool?.durability ?? def.armor?.durability ?? 0, ...def });
}


// Block items (everything placeable). Snowy grass is a worldgen variant that drops dirt.
const NOT_ITEMS = new Set<number>([
  B.AIR,
  B.WATER,
  B.LAVA,
  B.WATER_1,
  B.WATER_2,
  B.WATER_3,
  B.WATER_4,
  B.WATER_5,
  B.WATER_6,
  B.WATER_7,
  B.WATER_FALL,
  B.LAVA_1,
  B.LAVA_2,
  B.LAVA_3,
  B.LAVA_FALL,
  B.RAIL_Z,
  B.SPAWNER,
  B.DEAD_BUSH,
  B.BEDROCK,
  B.PORTAL,
  B.WAYSTONE,
  B.SNOW,
  B.BED_FOOT_PX,
  B.BED_FOOT_NX,
  B.BED_FOOT_PZ,
  B.BED_FOOT_NZ,
  B.BED_HEAD_PX,
  B.BED_HEAD_NX,
  B.BED_HEAD_PZ,
  B.BED_HEAD_NZ,
  B.TALL_GRASS,
  B.FARMLAND,
  B.TORCH_PX,
  B.TORCH_NX,
  B.TORCH_PZ,
  B.TORCH_NZ,
  B.WHEAT_0,
  B.WHEAT_1,
  B.WHEAT_2,
  B.WHEAT_3,
]);
/** Blocks whose item looks different from their side texture (fences would just be a plank). */
const ITEM_ICON: Record<number, number> = {
  [B.FENCE]: tileIndex('fence'),
  [gateId(false, 0)]: tileIndex('fence_gate'),
  [B.LANTERN]: tileIndex('lantern_item'),
  [B.SOUL_LANTERN]: tileIndex('soul_lantern_item'),
  [B.CHAIN]: tileIndex('chain_item'),
};
const WOODEN_FUEL = [slabId(0, false), stairId(0, false, 0), trapdoorId(false, false, 0), B.FENCE, gateId(false, 0)];
const BLOCK_FUEL: Record<number, number> = {
  ...Object.fromEntries(WOODEN_FUEL.map((id) => [id, 15])),
  [ladderId(0)]: 5, [B.LOG]: 15, [B.BIRCH_LOG]: 15, [B.SPRUCE_LOG]: 15, [B.ACACIA_LOG]: 15, [B.JUNGLE_LOG]: 15, [B.DARK_OAK_LOG]: 15, [B.CHERRY_LOG]: 15, [B.PLANKS]: 15, [B.CRAFTING_TABLE]: 15, [B.CHEST]: 15 };
for (const b of BLOCKS) {
  if (!b || NOT_ITEMS.has(b.id) || NO_ITEM_BLOCKS.has(b.id) || b.id === 0 || ITEMS.has(b.id)) continue;
  // A lantern is carried by its ring and lights the way: warm, or the blue of a soul lantern (a little weaker in the hand than set down).
  const lantern = lanternInfo(b.id);
  const carried: Partial<ItemDef> = lantern ? { carry: 'hang', heldLight: lantern.soul ? { r: 0.3, g: 0.62, b: 1, level: SOUL_LANTERN_LIGHT - 0.5 } : { r: 1, g: 0.7, b: 0.38, level: LANTERN_LIGHT - 1 } } : {};
  add({ id: b.id, name: b.name, tile: ITEM_ICON[b.id] ?? b.tiles.side, block: b.id, fuel: BLOCK_FUEL[b.id] ?? 0, ...carried });
}

add({ id: I.STICK, name: 'stick', tile: tileIndex('stick'), fuel: 5 });
add({ id: I.COAL, name: 'coal', tile: tileIndex('coal'), fuel: 80 });
add({ id: I.IRON_INGOT, name: 'iron_ingot', tile: tileIndex('iron_ingot') });
add({ id: I.GOLD_INGOT, name: 'gold_ingot', tile: tileIndex('gold_ingot') });
add({ id: I.DIAMOND, name: 'diamond', tile: tileIndex('diamond') });
add({ id: I.APPLE, name: 'apple', tile: tileIndex('apple'), food: { hunger: 4, saturation: 2.4 } });
add({ id: I.RAW_MEAT, name: 'raw_meat', tile: tileIndex('raw_meat'), food: { hunger: 3, saturation: 1.8 } });
add({ id: I.COOKED_MEAT, name: 'cooked_meat', tile: tileIndex('cooked_meat'), food: { hunger: 8, saturation: 12.8 } });
add({ id: I.ROTTEN_FLESH, name: 'rotten_flesh', tile: tileIndex('rotten_flesh'), food: { hunger: 4, saturation: 0.8 } });
add({ id: I.BONE, name: 'bone', tile: tileIndex('bone') });
add({ id: I.ARROW, name: 'arrow', tile: tileIndex('arrow') });
add({ id: I.GUNPOWDER, name: 'gunpowder', tile: tileIndex('gunpowder') });
add({ id: I.WHEAT_SEEDS, name: 'wheat_seeds', tile: tileIndex('wheat_seeds'), block: B.WHEAT_0 });
add({ id: I.WHEAT, name: 'wheat', tile: tileIndex('wheat') });
add({ id: I.FLINT, name: 'flint', tile: tileIndex('flint') });
add({ id: I.STRING, name: 'string', tile: tileIndex('string') });
add({ id: I.BOW, name: 'bow', tile: tileIndex('bow'), maxStack: 1, durability: 385, fuel: 15, use: 'bow', kind: 'Equipment' });
add({ id: I.BREAD, name: 'bread', tile: tileIndex('bread'), food: { hunger: 5, saturation: 6 } });

add({ id: I.LEATHER, name: 'leather', tile: tileIndex('leather') });
add({ id: I.RAW_IRON, name: 'raw_iron', tile: tileIndex('raw_iron') });
add({ id: I.RAW_GOLD, name: 'raw_gold', tile: tileIndex('raw_gold') });
add({ id: I.BUCKET, name: 'bucket', tile: tileIndex('bucket'), maxStack: 16, use: 'bucket', kind: 'Item' });
add({ id: I.WATER_BUCKET, name: 'water_bucket', tile: tileIndex('water_bucket'), maxStack: 1, use: 'bucket', kind: 'Item' });
add({ id: I.LAVA_BUCKET, name: 'lava_bucket', tile: tileIndex('lava_bucket'), maxStack: 1, use: 'bucket', kind: 'Item' });
add({ id: I.FEATHER, name: 'feather', tile: tileIndex('feather') });
add({ id: I.MUTTON, name: 'mutton', tile: tileIndex('mutton'), food: { hunger: 2, saturation: 1.2 } });
add({ id: I.COOKED_MUTTON, name: 'cooked_mutton', tile: tileIndex('cooked_mutton'), food: { hunger: 6, saturation: 9.6 } });
add({ id: I.CHICKEN, name: 'chicken', tile: tileIndex('chicken'), food: { hunger: 2, saturation: 1.2 } });
add({ id: I.COOKED_CHICKEN, name: 'cooked_chicken', tile: tileIndex('cooked_chicken'), food: { hunger: 6, saturation: 7.2 } });
add({ id: I.RABBIT, name: 'rabbit', tile: tileIndex('rabbit'), food: { hunger: 3, saturation: 1.8 } });
add({ id: I.COOKED_RABBIT, name: 'cooked_rabbit', tile: tileIndex('cooked_rabbit'), food: { hunger: 5, saturation: 6 } });
add({ id: I.INK_SAC, name: 'ink_sac', tile: tileIndex('ink_sac') });
add({ id: I.SLIMEBALL, name: 'slimeball', tile: tileIndex('slimeball') });
add({ id: I.ENDER_PEARL, name: 'ender_pearl', tile: tileIndex('ender_pearl'), maxStack: 16, use: 'pearl' });
add({ id: I.SPIDER_EYE, name: 'spider_eye', tile: tileIndex('spider_eye'), food: { hunger: 2, saturation: 3.2 } });
add({ id: I.SHIELD, name: 'shield', tile: tileIndex('shield'), maxStack: 1, durability: SHIELD_DURABILITY, shield: true, offhand: true });
DYE_NAMES.forEach((n, c) => add({ id: bedItemId(c), name: c === BED_RED ? 'bed' : `${n}_bed`, tile: tileIndex(c === BED_RED ? 'bed' : `bed_${n}`), maxStack: 1, fuel: 15, use: 'bed', kind: 'Item' }));
add({ id: I.DOOR, name: 'wooden_door', tile: tileIndex('door'), fuel: 10, use: 'door', kind: 'Item' });
// (white dye is bone meal)
DYE_NAMES.forEach((n, c) => add({ id: dyeId(c), name: `${n}_dye`, tile: tileIndex(`dye_${n}`), use: dyeId(c) === BONE_MEAL ? 'bone_meal' : null, kind: 'Dye' }));
add({ id: I.EMERALD, name: 'emerald', tile: tileIndex('emerald') });
add({ id: I.PAPER, name: 'paper', tile: tileIndex('paper') });
add({ id: I.BOOK, name: 'book', tile: tileIndex('book') });
add({ id: I.ENCHANTED_BOOK, name: 'enchanted_book', tile: tileIndex('enchanted_book'), maxStack: 1, storesEnchants: true, kind: 'Enchanted Book' });
add({ id: I.FLINT_AND_STEEL, name: 'flint_and_steel', tile: tileIndex('flint_and_steel'), maxStack: 1, durability: 64, use: 'flint', kind: 'Item' });
add({ id: I.LAPIS_LAZULI, name: 'lapis_lazuli', tile: tileIndex('lapis_lazuli') });
add({ id: I.EXPERIENCE_BOTTLE, name: 'bottle_o_enchanting', tile: tileIndex('experience_bottle'), use: 'xp_bottle' });
add({ id: I.SHEARS, name: 'shears', tile: tileIndex('shears'), maxStack: 1, durability: 238, shears: true, kind: 'Item' });
add({ id: I.REDSTONE, name: 'redstone', tile: tileIndex('redstone'), block: wireId(0), kind: 'Material' }); // (the dust is laid down, but it is an ingredient first)
add({ id: I.MINECART, name: 'minecart', tile: tileIndex('minecart'), maxStack: 1, use: 'vehicle', kind: 'Item' });
add({ id: I.BOAT, name: 'boat', tile: tileIndex('boat'), maxStack: 1, fuel: 60, use: 'vehicle', kind: 'Item' });
add({ id: I.MAP, name: 'map', tile: tileIndex('map'), maxStack: 1, use: 'map', undroppable: true, kind: 'Special' });
/** Items a character keeps for good: they cannot be thrown on the ground (the Emberstone and the map). */
export const isUndroppable = (id: number): boolean => getItem(id).undroppable;
/** What the off hand takes: a shield, an orb, a dagger, and the map (held open in that hand, so it can be read at a glance). */
export const holdsInOffhand = (id: number): boolean => getItem(id).offhand || getItem(id).use === 'map';

add({ id: I.COMPASS, name: 'compass', tile: tileIndex('compass'), maxStack: 1, kind: 'Special' });
add({ id: I.EMBERSTONE, name: 'emberstone', tile: tileIndex('emberstone'), maxStack: 1, use: 'emberstone', undroppable: true, kind: 'Special' });
add({ id: I.JEWEL_DAWN, name: 'jewel_of_dawn', tile: tileIndex('jewel_dawn'), maxStack: 64, kind: 'Jewel' });
add({ id: I.JEWEL_RIFT, name: 'jewel_of_the_rift', tile: tileIndex('jewel_rift'), maxStack: 64, kind: 'Jewel' });
add({ id: I.JEWEL_BLOOM, name: 'jewel_of_bloom', tile: tileIndex('jewel_bloom'), maxStack: 64, kind: 'Jewel' });
// Class weapons. Melee ones swing like a sword, the crossbow shoots arrows, wands, staves and books cast with the class resource.
add({ id: I.GREATSWORD, name: 'greatsword', tile: tileIndex('greatsword'), maxStack: 1, durability: 500, weapon: { kind: 'melee', damage: 8, cooldown: 0.85, cost: 0 } });
add({ id: I.DAGGER, name: 'dagger', tile: tileIndex('dagger'), maxStack: 1, durability: 200, offhand: true, weapon: { kind: 'melee', damage: 3, cooldown: 0.3, cost: 0 } });
add({ id: I.STAFF, name: 'staff', tile: tileIndex('staff'), maxStack: 1, durability: 300, fuel: 15, carry: 'staff', weapon: { kind: 'spell', damage: 5, cooldown: 0.9, cost: 8, speed: 24 } });
add({ id: I.WAND, name: 'wand', tile: tileIndex('wand'), maxStack: 1, durability: 200, fuel: 8, carry: 'wand', weapon: { kind: 'spell', damage: 3, cooldown: 0.45, cost: 4, speed: 28 } });
add({ id: I.SPELLBOOK, name: 'spellbook', tile: tileIndex('spellbook'), maxStack: 1, weapon: { kind: 'spell', damage: 3, cooldown: 2, cost: 10, speed: 18, radius: 2.5 } });
add({ id: I.CROSSBOW, name: 'crossbow', tile: tileIndex('crossbow'), maxStack: 1, durability: 465, fuel: 15, use: 'crossbow', weapon: { kind: 'ranged', damage: 11, cooldown: 0.8, cost: 0 } });
// The orb is only held: it sits in the off hand and adds to the spells of whoever carries it.
add({ id: I.ORB, name: 'orb', tile: tileIndex('orb'), maxStack: 1, offhand: true });
// Skill books: right-click to learn the ability (see `Player.learnFromBook`). One book, one ability, one class.
SKILL_BOOKS.forEach((b, i) => add({ id: I.SKILL_BOOK_BASE + i, name: `skill_book_${b.ability}`, tile: tileIndex(`skillbook_${b.classId}`), maxStack: 1, use: 'skill_book', kind: 'Skill Book' }));
// Mount horns: right-click to put the horn in the mount slot (see `Player.equipHorn`). One horn, one mount.
MOUNTS.forEach((m, i) => add({ id: I.MOUNT_BASE + i, name: m.id === 'fenrir' ? 'horn_of_fenrir' : `horn_of_${m.id}`, tile: tileIndex(`horn_${m.id}`), maxStack: 1, use: 'horn', kind: 'Mount' }));
// Bags: worn in a bag slot of the inventory screen, never stacked.
BAGS.forEach((b, i) => add({ id: I.BAG_BASE + i, name: b.name, tile: tileIndex(`bag_${i + 1}`), maxStack: 1, kind: 'Bag' }));

for (const material of ARMOR_MATERIALS) {
  ARMOR_SLOTS.forEach((slot, slotIndex) => {
    const armor = armorDef(slotIndex, material);
    add({ id: armorId(slotIndex, material), name: `${material}_${slot}`, tile: tileIndex(`${material}_${slot}`), maxStack: 1, armor });
  });
}

// The clothes of the classes: armor slots, no defense, no wear (see ArmorDef.outfit).
for (const cls of OUTFIT_CLASSES) {
  ARMOR_SLOTS.forEach((slot, slotIndex) => {
    add({ id: outfitId(cls, slotIndex), name: OUTFIT_NAMES[cls][slotIndex], tile: tileIndex(`outfit_${cls}_${slot}`), maxStack: 1, armor: outfitDef(slotIndex, cls) });
  });
}

for (const kind of TOOL_KINDS) {
  for (const material of TOOL_MATERIALS) {
    const s = MATERIAL_STATS[material];
    add({
      id: toolId(kind, material),
      name: `${material}_${kind}`,
      tile: tileIndex(`${material}_${kind}`),
      maxStack: 1,
      fuel: material === 'wood' ? 10 : 0,
      tool: {
        kind,
        material,
        harvest: s.harvest,
        speed: s.speed,
        durability: s.durability,
        damage: BASE_DAMAGE[kind] + s.bonus,
      },
    });
  }
}

const UNKNOWN: ItemDef = { id: 0, name: 'unknown', maxStack: 64, tile: 0, block: null, tool: null, food: null, fuel: 0, durability: 0, armor: null, shield: false, weapon: null, offhand: false, use: null, carry: 'hand', heldLight: null, shears: false, undroppable: false, storesEnchants: false, kind: null };

export function getItem(id: number): ItemDef {
  return ITEMS.get(id) ?? UNKNOWN;
}

/** Every item in a stable display order (for the creative palette). */
export function allItems(): ItemDef[] {
  return [...ITEMS.values()].sort((a, b) => a.id - b.id);
}

// ---- mining rules ----------------------------------------------------------

/** Can this tool (or bare hand when null) get a drop from the block? */
export function canHarvest(block: BlockDef, tool: ToolDef | null): boolean {
  if (block.harvest === 0) return true;
  return !!tool && tool.kind === block.tool && tool.harvest >= block.harvest;
}

const HARVEST_TIERS = ['', 'a wooden', 'a stone', 'an iron', 'a diamond'];

/** "Needs an iron pickaxe or better" when this tool would break the block but drop nothing, else null. */
export function harvestHint(block: BlockDef, tool: ToolDef | null): string | null {
  if (canHarvest(block, tool) || !block.tool) return null;
  return `Needs ${HARVEST_TIERS[block.harvest] ?? 'a better'} ${block.tool} or better`;
}

/**
 * Seconds to break a block. Mirrors the original: hardness * (1.5 | 5) / speed. `efficiency` is the extra
 * speed an Efficiency enchantment adds (see `efficiencyBonus`); it only counts on blocks the tool is made for.
 */
export function breakTime(block: BlockDef, tool: ToolDef | null, efficiency = 0, shears = false): number {
  if (!Number.isFinite(block.hardness)) return Infinity;
  if (block.hardness === 0) return 0;
  if (shears && SHEARED_BLOCKS.has(block.id)) return (block.hardness * 1.5) / 15;
  const effective = !!tool && tool.kind === block.tool;
  const speed = effective ? tool!.speed + efficiency : 1;
  return (block.hardness * (canHarvest(block, tool) ? 1.5 : 5)) / speed;
}

export interface Drop {
  id: number;
  count: number;
}

/** What the tool's enchantments change about a drop. */
export interface DropEnchants {
  silk?: boolean;
  /** Cut with shears: leaves, cobwebs and wool come away whole. */
  shears?: boolean;
  fortune?: number;
}

/** Fortune: the drop is multiplied by 1 up to level + 1. */
export function fortuneMultiplier(level: number, rand: () => number): number {
  if (level <= 0) return 1;
  return Math.max(0, Math.floor(rand() * (level + 2)) - 1) + 1;
}

/** Blocks Silk Touch keeps whole, and the ores Fortune multiplies. */
const SILK_BLOCKS = new Set<number>([B.STONE, B.GRASS, B.ICE, B.GLASS, B.PANE, B.COBWEB, ...LEAF_BLOCKS, B.COAL_ORE, B.IRON_ORE, B.GOLD_ORE, B.DIAMOND_ORE, B.LAPIS_ORE, B.EMERALD_ORE, B.REDSTONE_ORE, B.LAMP_ON, B.BOOKSHELF, B.SANDSTONE, B.RED_SANDSTONE, B.PACKED_ICE, B.DEEPSLATE, B.MYCELIUM, B.MUSHROOM_STEM]);
const FORTUNE_BLOCKS = new Set<number>([B.COAL_ORE, B.IRON_ORE, B.GOLD_ORE, B.DIAMOND_ORE, B.LAPIS_ORE, B.EMERALD_ORE, B.REDSTONE_ORE]);

/** What shears cut quickly and leave whole. */
export const SHEARED_BLOCKS: ReadonlySet<number> = new Set<number>([...LEAF_BLOCKS, B.COBWEB, B.WOOL, ...DYE_NAMES.slice(1).map((_, i) => B.WOOL_COLOR_BASE + i)]);

/** Does Silk Touch make this block drop itself? */
export function silkKeeps(id: number): boolean {
  return SILK_BLOCKS.has(id) && ITEMS.has(id);
}

/** What a broken block drops. `rand` is injectable for deterministic tests. */
export function blockDrop(block: BlockDef, tool: ToolDef | null, rand: () => number = Math.random, ench?: DropEnchants): Drop | null {
  if (ench?.shears && SHEARED_BLOCKS.has(block.id)) return { id: block.id, count: 1 };
  if (!canHarvest(block, tool)) return null;
  if (ench?.silk && silkKeeps(block.id)) return { id: block.id, count: 1 };
  const d = baseDrop(block, rand);
  if (d && ench?.fortune && FORTUNE_BLOCKS.has(block.id)) d.count *= fortuneMultiplier(ench.fortune, rand);
  return d;
}

function baseDrop(block: BlockDef, rand: () => number): Drop | null {
  // Slabs, stairs, trapdoors, ladders and gates drop their one item whatever way up or open they are.
  const built = BUILDING_ITEM[block.id];
  if (built) return { id: built, count: 1 };
  const door = doorInfo(block.id);
  if (door) return door.upper ? null : { id: I.DOOR, count: 1 };
  // A bed is one item and its foot half carries the colour, so breaking either half yields exactly one bed.
  const bed = bedInfo(block.id);
  if (bed) return bed.head ? null : { id: bedItemId(bed.color), count: 1 };
  switch (block.id) {
    case B.STONE:
      return { id: B.COBBLE, count: 1 };
    case B.GRASS:
    case B.SNOW:
    case B.MYCELIUM:
    case B.FARMLAND:
      return { id: B.DIRT, count: 1 };
    case B.TORCH_PX:
    case B.TORCH_NX:
    case B.TORCH_PZ:
    case B.TORCH_NZ:
      return { id: B.TORCH, count: 1 };
    case B.TALL_GRASS:
      return rand() < 0.125 ? { id: I.WHEAT_SEEDS, count: 1 } : null;
    case B.WHEAT_0:
    case B.WHEAT_1:
    case B.WHEAT_2:
      return { id: I.WHEAT_SEEDS, count: 1 };
    case B.WHEAT_3:
      return { id: I.WHEAT, count: 1 };
    case B.REDSTONE_ORE:
      return { id: I.REDSTONE, count: 4 + Math.floor(rand() * 2) };
    case B.LAPIS_ORE:
      return { id: I.LAPIS_LAZULI, count: 4 + Math.floor(rand() * 5) };
    case B.COAL_ORE:
      return { id: I.COAL, count: 1 };
    case B.IRON_ORE:
      return { id: I.RAW_IRON, count: 1 };
    case B.GOLD_ORE:
      return { id: I.RAW_GOLD, count: 1 };
    case B.DIAMOND_ORE:
      return { id: I.DIAMOND, count: 1 };
    case B.EMERALD_ORE:
      return { id: I.EMERALD, count: 1 };
    case B.LEAVES: {
      const r = rand();
      if (r < 0.06) return { id: I.APPLE, count: 1 };
      return r < 0.11 ? { id: B.SAPLING, count: 1 } : null;
    }
    case B.BIRCH_LEAVES:
      return rand() < 0.05 ? { id: B.BIRCH_SAPLING, count: 1 } : null;
    case B.SPRUCE_LEAVES:
      return rand() < 0.05 ? { id: B.SPRUCE_SAPLING, count: 1 } : null;
    case B.ACACIA_LEAVES:
      return rand() < 0.05 ? { id: B.ACACIA_SAPLING, count: 1 } : null;
    case B.JUNGLE_LEAVES:
      return rand() < 0.035 ? { id: B.JUNGLE_SAPLING, count: 1 } : null;
    case B.CHERRY_LEAVES:
      return rand() < 0.05 ? { id: B.CHERRY_SAPLING, count: 1 } : null;
    case B.DARK_OAK_LEAVES: {
      const r = rand();
      if (r < 0.05) return { id: I.APPLE, count: 1 };
      return r < 0.1 ? { id: B.DARK_OAK_SAPLING, count: 1 } : null;
    }
    case B.DEEPSLATE:
      return { id: B.COBBLED_DEEPSLATE, count: 1 };
    case B.PACKED_ICE:
      return null;
    case B.FERN:
      return rand() < 0.125 ? { id: I.WHEAT_SEEDS, count: 1 } : null;
    case B.COBWEB:
      return { id: I.STRING, count: 1 };
    case B.BOOKSHELF:
      return { id: I.BOOK, count: 3 };
    case B.RAIL_Z:
      return { id: B.RAIL_X, count: 1 };
    case B.ICE:
      return null;
    case B.GRAVEL:
      return rand() < 0.1 ? { id: I.FLINT, count: 1 } : { id: B.GRAVEL, count: 1 };
    case B.DEAD_BUSH: {
      const n = Math.floor(rand() * 3);
      return n > 0 ? { id: I.STICK, count: n } : null;
    }
    case B.GLASS:
    case B.AIR:
    case B.WATER:
    case B.LAVA:
    case B.SPAWNER:
    case B.BEDROCK:
    case B.PORTAL:
    case B.WAYSTONE:
      return null;
    default:
      return ITEMS.has(block.id) ? { id: block.id, count: 1 } : null;
  }
}

/** Like `blockDrop`, but for blocks that can drop several different items (ripe wheat). */
export function blockDrops(block: BlockDef, tool: ToolDef | null, rand: () => number = Math.random, ench?: DropEnchants): Drop[] {
  if (block.id === B.WHEAT_3) {
    return [
      { id: I.WHEAT, count: 1 },
      { id: I.WHEAT_SEEDS, count: 1 + Math.floor(rand() * 3) },
    ];
  }
  const d = blockDrop(block, tool, rand, ench);
  return d ? [d] : [];
}
