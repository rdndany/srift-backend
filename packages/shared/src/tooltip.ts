import { BLOCKS, SOUL_WARD_RADIUS, campfireId, lanternInfo } from './blocks';
import { enchantBaseName, enchantName } from './enchant';
import type { ItemStack } from './inventory';
import { ABILITY_BY_ID } from './abilities';
import { CLASSES, offhandModifier, type ClassId } from './classes';
import { formatEmberTime, EMBER_CAST, EMBER_COOLDOWN } from './emberstone';
import { gearSuffix, optionStat, rarityDef, resourceNameOf, rolledStats, statLine } from './gear';
import { forgeHint, jewelDef, jewelKind } from './jewels';
import { BOTTLE_XP_MAX, BOTTLE_XP_MIN, I, bagSlotsOf, getItem, isUndroppable, mountOfItem, skillBookAbility, type ItemKind } from './items';
import { MOUNT_CAST, mountDef, mountSpeedText } from './mounts';

/**
 * What the hover tooltip of an item says, as plain data (the web client colours and draws it): the name, what
 * kind of thing it is, its numbers (damage, armor, mining speed, hunger, hardness...), its enchantments and
 * how much wear is left.
 */
export type TipColor = 'name' | 'rare' | 'kind' | 'stat' | 'good' | 'dim' | 'ench' | 'warn' | 'uncommon' | 'superior' | 'epic' | 'jewel';

/** The colour of a name by rarity of found gear: green, blue, purple. */
export const rarityTone = (r: number): TipColor => (r >= 3 ? 'epic' : r === 2 ? 'superior' : 'uncommon');

export interface TipLine {
  text: string;
  color: TipColor;
  /** A name an anvil gave the item is shown in italics. */
  italic?: boolean;
}

const title = (s: string): string => s.replace(/_/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** "6" for whole numbers, "1.5" for halves; never a long fraction. */
const num = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ''));

/**
 * Blocks that are put down and used rather than built with (as in Minecraft's tools and utilities): torches, lanterns,
 * chains, ladders, rails, switches. (The things of that sort that are not blocks say so on their own row of the items table.)
 */
const PLACED_SHAPES = new Set(['torch', 'lantern', 'chain', 'ladder', 'lever', 'button', 'plate']);
const PLACED_NAMES = new Set(['rail', 'powered_rail']);
function isPlacedBlock(block: number): boolean {
  const def = BLOCKS[block];
  if (!def) return false;
  return lanternInfo(block) !== null || PLACED_NAMES.has(def.name) || PLACED_SHAPES.has(def.shape ?? '');
}

/** Plants and the other things that grow or hang in the wild: flowers, saplings, leaves, mushrooms, vines, cactus, melons, dripstones. */
const NATURE_SHAPES = new Set(['cross', 'crop', 'cocoa']);
const NATURE_NAMES = new Set(['cactus', 'pumpkin', 'melon', 'moss_block', 'lily_pad', 'pink_petals', 'glow_lichen', 'mushroom_stem', 'red_mushroom_block', 'brown_mushroom_block']);
function isNatureBlock(block: number): boolean {
  const def = BLOCKS[block];
  if (!def) return false;
  return NATURE_SHAPES.has(def.shape ?? '') || NATURE_NAMES.has(def.name) || def.name.endsWith('_leaves') || def.name === 'leaves';
}

/**
 * The kind of thing an item is, shown under its name. A row of the items table that knows better says so itself
 * (`kind`); the rest follows from what the item is: gear, food, a block of some sort, or a material.
 */
export function itemKind(id: number): ItemKind {
  const item = getItem(id);
  if (item.kind) return item.kind;
  if (item.tool || item.armor || item.shield || item.weapon || item.offhand) return 'Equipment';
  if (item.food) return 'Food';
  if (item.block === null) return 'Material';
  if (isPlacedBlock(item.block)) return 'Item';
  return isNatureBlock(item.block) ? 'Nature' : 'Block';
}

/** The colour a bag's name has: the bigger the bag, the rarer it looks (white, green, blue, purple). */
function bagTone(id: number): TipColor {
  const slots = bagSlotsOf(id);
  return slots >= 16 ? 'kind' : slots >= 14 ? 'rare' : slots >= 10 ? 'good' : 'name';
}

/** What an off-hand item adds to a class, as lines ("+12% Spell Damage"). */
function offhandBonusLines(id: number): string[] {
  const m = offhandModifier(id);
  if (!m) return [];
  const out: string[] = [];
  for (const [kind, mul] of Object.entries(m.damage ?? {})) if (mul && mul !== 1) out.push(`${mul > 1 ? '+' : '-'}${Math.round(Math.abs(mul - 1) * 100)}% ${title(kind)} Damage`);
  if (m.critChance) out.push(`+${Math.round(m.critChance * 100)}% Critical Chance`);
  if (m.critDamage) out.push(`+${num(m.critDamage)} Critical Damage`);
  if (m.resource) out.push(`+${num(m.resource)} Class Resource`);
  if (m.resourceRegen) out.push(`+${num(m.resourceRegen)} Resource per second`);
  return out;
}

/** The name an item shows: the one an anvil gave it, or for an enchanted book what it holds ("Book of Sharpness"). */
export function tooltipName(stack: ItemStack): string {
  const item = getItem(stack.id);
  const plus = stack.gear?.u ? ` +${stack.gear.u}` : '';
  if (stack.name) return stack.name + plus;
  if (stack.gear) return `${title(item.name)} ${gearSuffix(stack.gear)}`.trim() + plus;
  const jewel = jewelKind(stack.id);
  if (jewel) return jewelDef(jewel).name;
  const mount = mountDef(mountOfItem(stack.id));
  if (mount) return mount.horn;
  const taught = skillBookAbility(stack.id);
  if (taught) return `Skill Book: ${ABILITY_BY_ID.get(taught)?.name ?? title(item.name)}`;
  if (stack.id === I.EXPERIENCE_BOTTLE) return "Bottle o' Enchanting";
  if (!item.storesEnchants) return title(item.name);
  const names = (stack.ench ?? []).map(([id]) => enchantBaseName(id)).filter(Boolean);
  if (names.length === 0) return title(item.name);
  if (names.length <= 2) return `Book of ${names.join(' & ')}`;
  return `Book of ${names[0]} +${names.length - 1}`;
}

/**
 * `viewerClass` is the class of the player looking at the item (null for a classless player; leave it out when it is

 * not known): a skill book of another class is then marked in red, as it cannot be learned. `viewerLevel` is the viewer's
 * class level, the same way for gear that asks for a higher one.
 */
export function tooltipLines(stack: ItemStack | null, viewerClass?: ClassId | null, viewerLevel?: number): TipLine[] {
  if (!stack) return [];
  const item = getItem(stack.id);
  const enchanted = !!stack.ench && stack.ench.length > 0;
  const bagSlots = bagSlotsOf(stack.id);
  const rolled = stack.gear && stack.gear.r > 0 ? stack.gear : undefined; // a plain piece with only jewels on it has no rarity
  const jewels = jewelKind(stack.id);
  const hornOf = mountDef(mountOfItem(stack.id));
  const nameColor: TipColor = hornOf ? (hornOf.speed >= 2 ? 'epic' : hornOf.speed > 1.6 ? 'superior' : 'uncommon') : bagSlots > 0 ? bagTone(stack.id) : rolled ? rarityTone(rolled.r) : stack.gear || jewels ? 'jewel' : enchanted || item.storesEnchants ? 'rare' : 'name';
  const lines: TipLine[] = [{ text: tooltipName(stack), color: nameColor, ...(stack.name ? { italic: true } : {}) }];
  lines.push({ text: rolled ? `${rarityDef(rolled.r).name} ${itemKind(stack.id)}` : itemKind(stack.id), color: rolled ? rarityTone(rolled.r) : 'kind' });

  if (jewels) {
    lines.push({ text: jewelDef(jewels).blurb, color: 'stat' });
    lines.push({ text: 'Pick it up, then click a piece of equipment with it', color: 'good' });
  }

  if (bagSlots > 0) {
    lines.push({ text: `${bagSlots} Slot Bag`, color: 'stat' });
    lines.push({ text: 'Wear it in a bag slot of the inventory screen: it adds that many slots', color: 'dim' });
    lines.push({ text: 'Shift-click to wear it', color: 'good' });
  }

  if (hornOf) {
    const low = viewerLevel !== undefined && viewerLevel < hornOf.level;
    lines.push({ text: mountSpeedText(hornOf), color: 'stat' });
    lines.push({ text: `Requires level ${hornOf.level}`, color: low ? 'warn' : 'stat' });
    lines.push({ text: hornOf.blurb, color: 'dim' });
    lines.push({ text: `Press H to summon it from the mount slot: stand still for ${MOUNT_CAST} seconds, outdoors and out of the water`, color: 'dim' });
    lines.push({ text: 'Right-click to put it in the mount slot', color: 'good' });
  }

  if (stack.id === I.COMPASS) {
    lines.push({ text: 'Always points north', color: 'good' });
    lines.push({ text: 'Hold it and turn around: the red needle shows where north is', color: 'dim' });
  }

  if (item.use === 'map') {
    lines.push({ text: 'Shows the land around you, live, in your hand', color: 'good' });
    lines.push({ text: 'In the hand: right-click (first person) to hold it open in both hands; scroll to zoom', color: 'dim' });
    lines.push({ text: 'In the hand you cannot attack or use anything', color: 'dim' });
    lines.push({ text: 'In the off hand it stays open to glance at, and the hand stays free', color: 'dim' });
  }

  if (item.use === 'xp_bottle') {
    lines.push({ text: `Breaks into ${BOTTLE_XP_MIN} to ${BOTTLE_XP_MAX} experience`, color: 'good' });
    lines.push({ text: 'Right-click to throw it', color: 'dim' });
  }
  if (item.use === 'emberstone') {
    lines.push({ text: 'Use: teleports you to your bed', color: 'good' });
    lines.push({ text: `Stand still for ${EMBER_CAST} seconds while it casts. Without a bed it takes you to the village`, color: 'dim' });
    lines.push({ text: `Cooldown: ${formatEmberTime(EMBER_COOLDOWN)}`, color: 'dim' });
    lines.push({ text: 'Hold the right mouse button to use it', color: 'good' });
  }
  if (item.tool) {
    lines.push({ text: `+${num(item.tool.damage)} Attack Damage`, color: 'stat' });
    if (item.tool.kind !== 'sword') lines.push({ text: `${num(item.tool.speed)} Mining Speed`, color: 'stat' });
    lines.push({ text: `${title(item.tool.material)} Tier`, color: 'dim' });
  }
  if (item.armor?.outfit) {
    lines.push({ text: `${title(item.armor.outfit)} clothes`, color: 'dim' });
  } else if (item.armor) {
    lines.push({ text: `+${item.armor.defense} Armor`, color: 'stat' });
    if (item.armor.toughness > 0) lines.push({ text: `+${num(item.armor.toughness)} Armor Toughness`, color: 'stat' });
  }
  const taught = skillBookAbility(stack.id);
  const ability = taught ? ABILITY_BY_ID.get(taught) : undefined;
  if (ability) {
    const cls = CLASSES[ability.classId];
    const wrongClass = viewerClass !== undefined && viewerClass !== ability.classId;
    lines.push({ text: `Class: ${cls.name}`, color: wrongClass ? 'warn' : 'stat' });
    lines.push({ text: `Requires level ${ability.unlockLevel}`, color: 'stat' });
    lines.push({ text: ability.description, color: 'dim' });
    lines.push({ text: `${ability.cost} ${cls.resource.name.toLowerCase()} - ${num(ability.cooldown)}s cooldown`, color: 'dim' });
    lines.push({ text: 'Right-click to learn this ability', color: 'good' });
  }
  if (item.shield) lines.push({ text: 'Blocks hits from the front', color: 'stat' });
  if (item.weapon) {
    lines.push({ text: `${num(item.weapon.damage)} ${title(item.weapon.kind)} Damage`, color: 'stat' });
    if (item.weapon.cost > 0) lines.push({ text: `Costs ${num(item.weapon.cost)} per cast`, color: 'dim' });
  }
  if (item.offhand && !item.shield) {
    lines.push({ text: 'Held in the off hand', color: 'dim' });
    for (const t of offhandBonusLines(stack.id)) lines.push({ text: t, color: 'good' });
  }
  if (item.use === 'bow') lines.push({ text: 'Hold to draw, release to fire', color: 'dim' });
  if (item.use === 'fishing_rod') {
    lines.push({ text: 'Right-click to cast onto the water', color: 'good' });
    lines.push({ text: 'Right-click again when the float dips to reel in what bit', color: 'dim' });
  }
  if (stack.id === I.SWEET_BERRIES) lines.push({ text: 'Plant on grass or dirt', color: 'dim' });
  if (stack.id === I.GLOW_BERRIES) lines.push({ text: 'Hang it from a ceiling', color: 'dim' });
  if (stack.id === campfireId(0, true)) {
    lines.push({ text: 'Cooks food, four pieces at a time', color: 'dim' });
    lines.push({ text: 'A shovel puts the fire out', color: 'dim' });
  }
  if (stack.id === I.CAKE) {
    lines.push({ text: 'Each bite restores 2 hunger', color: 'good' });
    lines.push({ text: 'Place it, then eat it one bite at a time', color: 'dim' });
  }
  if (item.food) {
    if (item.food.clears) lines.push({ text: 'Clears status effects', color: 'good' });
    if (item.food.hunger > 0) {
      lines.push({ text: `Restores ${item.food.hunger} Hunger`, color: 'good' });
      lines.push({ text: `${num(item.food.saturation)} Saturation`, color: 'dim' });
    }
    if (item.food.poison) lines.push({ text: `${Math.round(item.food.poison.chance * 100)}% chance of the Poison status effect (${num(item.food.poison.seconds)}s)`, color: 'warn' });
    if (item.food.sickness) lines.push({ text: `${Math.round(item.food.sickness.chance * 100)}% chance of the Hunger sickness status effect (${num(item.food.sickness.seconds)}s)`, color: 'warn' });
    if (item.food.leaves != null) lines.push({ text: `The ${getItem(item.food.leaves).name.replace(/_/g, ' ')} stays in your hand`, color: 'dim' });
  }
  if (item.block !== null && !item.armor) {
    const def = BLOCKS[item.block];
    if (def && Number.isFinite(def.hardness) && def.hardness > 0) {
      const best = def.tool ? ` (${title(def.tool)})` : '';
      lines.push({ text: `Hardness ${num(def.hardness)}${best}`, color: 'dim' });
    }
  }
  if (lanternInfo(stack.id)?.soul) lines.push({ text: 'Keeps monsters away (' + SOUL_WARD_RADIUS + ' blocks)', color: 'good' });
  if (item.fuel > 0) {
    const items = item.fuel / 10;
    lines.push({ text: `Fuel: smelts ${num(items)} ${items === 1 ? 'item' : 'items'}`, color: 'dim' });
  }

  const gear = stack.gear;
  if (gear) {
    if (gear.c) {
      const wrong = viewerClass !== undefined && viewerClass !== gear.c;
      lines.push({ text: `Class: ${CLASSES[gear.c].name}`, color: wrong ? 'warn' : 'stat' });
    }
    if (gear.r > 0) {
      const low = viewerLevel !== undefined && viewerLevel < gear.l;
      lines.push({ text: `Requires level ${gear.l}`, color: low ? 'warn' : 'stat' });
    }
    const resource = resourceNameOf(gear.c ?? (viewerClass ?? undefined));
    // The stats are shown as they are now: an upgrade (+N) has grown them in place, and they show in gold to say so.
    for (const [stat, v] of rolledStats(stack.id, gear)) lines.push({ text: statLine(stat, v, resource), color: gear.u ? 'jewel' : 'good' });
    const option = optionStat(gear);
    if (option) lines.push({ text: `Bloom: ${statLine(option[0], option[1], resource)}`, color: 'jewel' });
    // Past +9 a piece is raised in the crafting grid: say what that takes.
    const forge = forgeHint(stack);
    if (forge) lines.push({ text: forge, color: 'dim' });
  }

  for (const [id, level] of stack.ench ?? []) {
    const name = enchantName(id, level);
    if (name) lines.push({ text: name, color: 'ench' });
  }

  if (isUndroppable(stack.id)) lines.push({ text: 'Cannot be dropped', color: 'dim' });

  if (stack.rc) lines.push({ text: `Anvil penalty: +${stack.rc} levels`, color: 'dim' });

  if (item.durability > 0) {
    const left = Math.max(0, item.durability - stack.damage);
    lines.push({ text: `Durability: ${left} / ${item.durability}`, color: stack.damage > 0 && left / item.durability < 0.2 ? 'warn' : 'dim' });
  }
  return lines;
}

/** One line of text, for places that show only a name (a villager's offer). */
export const plainTip = (text: string): TipLine[] => (text ? [{ text, color: 'name' }] : []);
