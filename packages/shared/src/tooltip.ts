import { B, BLOCKS, SOUL_WARD_RADIUS, campfireId, lanternInfo } from './blocks';
import { ELEMENTS, ENCHANTS, enchantBaseName, enchantName, glyphSockets } from './enchant';
import type { ItemStack } from './inventory';
import { ABILITY_BY_ID } from './abilities';
import { companionBonusText } from './companions';
import { wingBonusText } from './wings';
import { CLASSES, offhandModifier, type ClassId } from './classes';
import { formatEmberTime, EMBER_CAST, EMBER_COOLDOWN } from './emberstone';
import { gearSuffix, glyphLine, optionStat, rarityDef, resourceNameOf, rolledStats, statLine } from './gear';
import { forgeHint, jewelDef, jewelKind } from './jewels';
import { BOTTLE_XP_MAX, BOTTLE_XP_MIN, I, PEARL_TRIP_DAMAGE, bagSlotsOf, getItem, isUndroppable, companionOfItem, wingOfItem, accessoryOfItem, mountOfItem, outfitSetOfItem, skillBookAbility, type ItemKind } from './items';
import { MOUNT_CAST, mountDef, mountSpeedText } from './mounts';
import { abilityCost, castCost, scaled } from './tuning';

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

/**
 * What an item with a use of its own does, in words: the use itself in green ("Use: ..."), then how, in grey. The ones with
 * a tooltip of their own above (the map, the compass, the Emberstone, a fishing rod, a bottle o' enchanting, horns, bags,
 * jewels, skill books) are not here. Anything that is only an ingredient or that is eaten, worn or placed says so elsewhere.
 */
function useHelp(id: number, item: ReturnType<typeof getItem>): TipLine[] {
  const use = (text: string, ...more: string[]): TipLine[] => [{ text: `Use: ${text}`, color: 'good' }, ...more.map((m): TipLine => ({ text: m, color: 'dim' }))];
  switch (item.use) {
    case 'pearl':
      return use('throw it, and you are carried to where it lands', `The trip costs ${PEARL_TRIP_DAMAGE} health (nothing in creative)`, 'It does nothing if there is no room to stand where it lands', 'Right-click to throw it');
    case 'bucket':
      if (id === I.WATER_BUCKET) return use('pour out water, which spreads out from where you put it', 'Right-click a block to pour; right-click a lit campfire to put it out');
      if (id === I.LAVA_BUCKET) return use('pour out lava, which spreads out from where you put it', 'Right-click a block to pour; stay well clear: it burns');
      return use('scoop up the water or lava you point at', 'Right-click the source block of a pool to fill it');
    case 'vehicle':
      return id === I.BOAT
        ? use('set it on the water, then right-click it to get in and ride')
        : use('set it on a rail, then right-click it to get in and ride');
    case 'armor_stand':
      return use('set it down, then right-click it with a piece of armor to dress it', 'Right-click with an empty hand to take a piece back; sneak and right-click to change its pose');
    case 'flint':
      return use('right-click a block to light a fire on it', 'It also lights a campfire, and sets TNT off', 'Wears out a little with every use');
    case 'bone_meal':
      return use('right-click a crop or a plant to make it grow at once');
    case 'bed':
      return use('place it, then right-click it', 'It sets where you come back after a death, and where the Emberstone takes you', 'You can only sleep at night or in a thunderstorm: sleeping skips it');
    case 'door':
      return use('place it, then right-click it to open and close it');
    default:
  }
  if (item.shears) return use('right-click a sheep to shear its wool', 'Cuts leaves, wool and cobwebs quickly, and they drop whole');
  if (id === I.ARROW) return [{ text: 'Ammunition for a bow or a crossbow', color: 'dim' }, { text: 'Keep it in your inventory: every shot uses one', color: 'dim' }];
  return [];
}

/** The name an item shows: the one an anvil gave it, or for a Glyph Tome what it holds ("Tome of Keen Edge"). */
export function tooltipName(stack: ItemStack): string {
  const item = getItem(stack.id);
  const plus = stack.gear?.u ? ` +${stack.gear.u}` : '';
  if (stack.name) return stack.name + plus;
  if (stack.gear) return `${title(item.name)} ${gearSuffix(stack.gear)}`.trim() + plus;
  const jewel = jewelKind(stack.id);
  if (jewel) return jewelDef(jewel).name;
  const mount = mountDef(mountOfItem(stack.id));
  if (mount) return mount.horn;
  const set = outfitSetOfItem(stack.id);
  if (set) return set.name;
  const pal = companionOfItem(stack.id);
  if (pal) return pal.name;
  const wg = wingOfItem(stack.id);
  if (wg) return wg.name;
  const taught = skillBookAbility(stack.id);
  if (taught) return `Skill Book: ${ABILITY_BY_ID.get(taught)?.name ?? title(item.name)}`;
  if (stack.id === I.EXPERIENCE_BOTTLE) return "Bottle o' Enchanting";
  if (stack.id === B.ENCHANTING_TABLE) return 'Runic Altar';
  if (!item.storesEnchants) return title(item.name);
  const names = (stack.ench ?? []).map(([id]) => enchantBaseName(id)).filter(Boolean);
  if (names.length === 0) return 'Glyph Tome';
  if (names.length <= 2) return `Tome of ${names.join(' & ')}`;
  return `Tome of ${names[0]} +${names.length - 1}`;
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
  const setOf = outfitSetOfItem(stack.id);
  const palOf = companionOfItem(stack.id);
  const wingsOf = wingOfItem(stack.id);
  const jewelryOf = accessoryOfItem(stack.id);
  const nameColor: TipColor = jewelryOf ? (jewelryOf.material === 'diamond' ? 'epic' : jewelryOf.material === 'gold' ? 'rare' : jewelryOf.material === 'iron' ? 'good' : 'name') : wingsOf ? (wingsOf.tier === 2 ? 'epic' : 'superior') : palOf ? 'epic' : setOf ? (setOf.tier === 'epic' ? 'epic' : setOf.tier === 'rare' ? 'superior' : 'uncommon') : hornOf ? (hornOf.speed >= 2 ? 'epic' : hornOf.speed > 1.6 ? 'superior' : 'uncommon') : bagSlots > 0 ? bagTone(stack.id) : rolled ? rarityTone(rolled.r) : stack.gear || jewels ? 'jewel' : enchanted || item.storesEnchants ? 'rare' : 'name';
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

  if (setOf) {
    const wrong = !!viewerClass && viewerClass !== setOf.cls;
    lines.push({ text: `For the ${CLASSES[setOf.cls].name}${wrong ? `: your ${CLASSES[viewerClass!].name} cannot wear it` : ''}`, color: wrong ? 'warn' : 'stat' });
    lines.push({ text: `${setOf.tier[0].toUpperCase()}${setOf.tier.slice(1)} set: a glowing outfit with a light of its own`, color: 'stat' });
    lines.push({ text: setOf.blurb, color: 'dim' });
    lines.push({ text: 'It changes how you look and nothing else: the armor you wear still counts, it is only not seen', color: 'dim' });
    lines.push({ text: 'Right-click to put it in the outfit slot', color: 'good' });
  }

  if (palOf) {
    lines.push({ text: companionBonusText(palOf), color: 'good' });
    lines.push({ text: palOf.blurb, color: 'dim' });
    lines.push({ text: 'It follows you while it is in the companion slot of the inventory screen', color: 'dim' });
    lines.push({ text: 'Right-click to put it in the companion slot', color: 'good' });
  }

  if (wingsOf) {
    lines.push({ text: wingBonusText(wingsOf), color: 'good' });
    lines.push({ text: `${wingsOf.tier === 1 ? 'First' : 'Second'} wings: double-tap jump to fly (jump climbs, sneak sinks), at ${wingsOf.fly}x your walking speed`, color: 'stat' });
    lines.push({ text: wingsOf.blurb, color: 'dim' });
    lines.push({ text: 'Flying burns hunger, no fall damage while they are worn, and they fold when you are starving', color: 'dim' });
    lines.push({ text: 'Right-click to put them in the wing slot', color: 'good' });
  }

  if (jewelryOf) {
    for (const [stat, v] of jewelryOf.stats) lines.push({ text: statLine(stat, v, viewerClass ? CLASSES[viewerClass].resource.name : 'Resource'), color: 'stat' });
    lines.push({ text: jewelryOf.kind === 'ring' ? 'Worn on a finger: you may wear two rings' : 'Worn around the neck: you may wear one necklace', color: 'dim' });
    lines.push({ text: 'The bonuses work for every class and need no level', color: 'dim' });
    lines.push({ text: jewelryOf.kind === 'ring' ? 'Right-click to wear it (the inventory screen has two ring slots)' : 'Right-click to wear it (the inventory screen has a necklace slot)', color: 'good' });
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
  if (stack.id === I.HOLLOW_SIGIL) {
    lines.push({ text: 'Opens the Hollow Cellar, once', color: 'good' });
    lines.push({ text: 'A new dungeon uses it up; coming back to one that is still open does not', color: 'dim' });
    lines.push({ text: 'Made from a Warden Scroll and a Hollow Bone', color: 'dim' });
  }
  if (stack.id === I.WARDEN_SCROLL || stack.id === I.HOLLOW_BONE) {
    lines.push({ text: 'Half of a Hollow Sigil: put it in a crafting grid with the other half', color: 'dim' });
  }
  if (item.tool) {
    lines.push({ text: `+${num(scaled(item.tool.damage))} Attack Damage`, color: 'stat' });
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
    lines.push({ text: `${abilityCost(ability.cost)} ${cls.resource.name.toLowerCase()} - ${num(ability.cooldown)}s cooldown`, color: 'dim' });
    lines.push({ text: 'Right-click to learn this ability', color: 'good' });
  }
  if (item.shield) lines.push({ text: 'Blocks hits from the front', color: 'stat' });
  if (item.weapon) {
    lines.push({ text: `${num(scaled(item.weapon.damage))} ${title(item.weapon.kind)} Damage`, color: 'stat' });
    if (item.weapon.cost > 0) lines.push({ text: `Costs ${num(viewerClass ? castCost(item.weapon.cost) : item.weapon.cost)} per cast`, color: 'dim' });
  }
  if (item.offhand && !item.shield) {
    lines.push({ text: 'Held in the off hand', color: 'dim' });
    for (const t of offhandBonusLines(stack.id)) lines.push({ text: t, color: 'good' });
  }
  if (item.use === 'bow') {
    lines.push({ text: 'Hold to draw, release to fire: a longer draw hits harder and flies farther', color: 'dim' });
    lines.push({ text: 'Uses one arrow from your inventory for every shot', color: 'dim' });
  }
  if (item.use === 'crossbow') {
    lines.push({ text: 'Hold to wind it all the way: it shoots when it is wound', color: 'dim' });
    lines.push({ text: 'Uses one arrow from your inventory for every shot', color: 'dim' });
  }
  for (const help of useHelp(stack.id, item)) lines.push(help);
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

  // The glyphs: what each is and does, and how many sockets are left (a Glyph Tome holds them without them acting).
  if (stack.ench && stack.ench.length > 0) {
    if (!item.storesEnchants) lines.push({ text: `Glyph sockets: ${stack.ench.length} / ${Math.max(glyphSockets(stack), stack.ench.length)}`, color: 'dim' });
    const resource = resourceNameOf(stack.gear?.c ?? (viewerClass ?? undefined));
    for (const [id, level] of stack.ench) {
      const name = enchantName(id, level);
      if (!name) continue;
      const el = ENCHANTS.find((d) => d.id === id)?.element;
      lines.push({ text: el ? `${name} (${ELEMENTS[el].name})` : name, color: 'ench' });
      const what = glyphLine(id, level, resource);
      if (what) lines.push({ text: what, color: 'stat' });
    }
    if (item.storesEnchants) lines.push({ text: 'At an anvil, put a piece with this tome to move its glyphs onto it', color: 'dim' });
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
