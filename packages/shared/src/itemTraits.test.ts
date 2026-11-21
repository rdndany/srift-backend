import { describe, expect, it } from 'vitest';
import { LANTERN_LIGHT, SOUL_LANTERN_LIGHT, B, lanternInfo } from './blocks';
import { BONE_MEAL, I, allItems, bagSlotsOf, bedItemColor, getItem, holdsInOffhand, isUndroppable, mountOfItem, skillBookAbility, usedOnBlock, type ItemKind, type ItemUse } from './items';
import { jewelKind } from './jewels';
import { itemKind } from './tooltip';

/**
 * What an item does with the use button, how it is carried and the light it gives are written in the item table (`ItemDef.use`,
 * `carry`, `heldLight`) and the game asks the table. These are the items that have each, by name: a new item with a use of its
 * own is added to the table, not to the code that asks.
 */
describe('what the item table says about each item', () => {
  const withUse = (use: ItemUse): number[] => allItems().filter((i) => i.use === use).map((i) => i.id);

  it('gives each use to the items that have it, and to no others', () => {
    expect(withUse('bucket')).toEqual([I.BUCKET, I.WATER_BUCKET, I.LAVA_BUCKET].sort((a, b) => a - b));
    expect(withUse('xp_bottle')).toEqual([I.EXPERIENCE_BOTTLE]);
    expect(withUse('pearl')).toEqual([I.ENDER_PEARL]);
    expect(withUse('vehicle')).toEqual([I.MINECART, I.BOAT].sort((a, b) => a - b));
    expect(withUse('armor_stand')).toEqual([I.ARMOR_STAND]);
    expect(withUse('emberstone')).toEqual([I.EMBERSTONE]);
    expect(withUse('bow')).toEqual([I.BOW]);
    expect(withUse('crossbow')).toEqual([I.CROSSBOW]);
    expect(withUse('flint')).toEqual([I.FLINT_AND_STEEL]);
    // Every wooden, iron and nether door is used the way the oak one is.
    expect(withUse('door')).toContain(I.DOOR);
    for (const id of withUse('door')) expect(getItem(id).name).toMatch(/door$/);
    expect(withUse('bone_meal')).toEqual([BONE_MEAL]);
    for (const item of allItems()) {
      expect(item.use === 'skill_book', item.name).toBe(skillBookAbility(item.id) !== null);
      expect(item.use === 'horn', item.name).toBe(mountOfItem(item.id) !== null);
      expect(item.use === 'bed', item.name).toBe(bedItemColor(item.id) >= 0);
    }
    expect(withUse('skill_book').length).toBeGreaterThan(0);
    expect(withUse('horn').length).toBeGreaterThan(0);
    expect(withUse('bed').length).toBe(16);
  });

  it('knows what is used on the block the crosshair is on', () => {
    for (const item of allItems()) {
      const onBlock = item.tool?.kind === 'hoe' || item.block != null || bedItemColor(item.id) >= 0 || item.use === 'door' || item.id === I.FLINT_AND_STEEL || item.id === BONE_MEAL;
      expect(usedOnBlock(item), item.name).toBe(onBlock);
    }
    expect(usedOnBlock(getItem(I.BREAD))).toBe(false);
    expect(usedOnBlock(getItem(B.STONE))).toBe(true);
  });

  it('has lanterns hang from the hand and light the way (a torch lights it too), a staff and a wand carried as the Mage carries them, and all else in the fist', () => {
    for (const item of allItems()) {
      const lantern = lanternInfo(item.id);
      const carry = lantern ? 'hang' : item.id === I.STAFF ? 'staff' : item.id === I.WAND ? 'wand' : 'hand';
      expect(item.carry, item.name).toBe(carry);
      expect(item.heldLight !== null, item.name).toBe(lantern !== null || item.id === B.TORCH); // the torch lights too, if less
    }
    expect(getItem(B.LANTERN).heldLight).toEqual({ r: 1, g: 0.7, b: 0.38, level: LANTERN_LIGHT - 1 });
    expect(getItem(B.SOUL_LANTERN).heldLight).toEqual({ r: 0.3, g: 0.62, b: 1, level: SOUL_LANTERN_LIGHT - 0.5 });
  });

  it('says nothing of an item it does not know', () => {
    const unknown = getItem(987654);
    expect(unknown.use).toBeNull();
    expect(unknown.carry).toBe('hand');
    expect(unknown.heldLight).toBeNull();
    expect([unknown.shears, unknown.undroppable, unknown.storesEnchants, unknown.kind]).toEqual([false, false, false, null]);
    expect(itemKind(987654)).toBe('Material');
  });

  it('knows the map, the shears, what is kept for good and the book that stores its enchantments', () => {
    const having = (trait: 'shears' | 'undroppable' | 'storesEnchants'): number[] => allItems().filter((i) => i[trait]).map((i) => i.id);
    expect(withUse('map')).toEqual([I.MAP]);
    expect(having('shears')).toEqual([I.SHEARS]);
    expect(having('undroppable')).toEqual([I.MAP, I.EMBERSTONE].sort((a, b) => a - b));
    expect(having('storesEnchants')).toEqual([I.ENCHANTED_BOOK]);
    for (const item of allItems()) {
      expect(isUndroppable(item.id), item.name).toBe(item.undroppable);
      expect(holdsInOffhand(item.id), item.name).toBe(item.offhand || item.id === I.MAP || item.id === B.TORCH); // the map is carried open in the off hand too, and a torch lights it
    }
  });

  it('says what kind of thing each item is', () => {
    const called = (kind: ItemKind): number[] => allItems().filter((i) => itemKind(i.id) === kind).map((i) => i.id);
    expect(called('Enchanted Book')).toEqual([I.ENCHANTED_BOOK]);
    expect(called('Special')).toEqual([I.MAP, I.COMPASS, I.EMBERSTONE, I.HOLLOW_SIGIL].sort((a, b) => a - b));
    for (const item of allItems()) {
      const kind = itemKind(item.id);
      expect(kind === 'Skill Book', item.name).toBe(skillBookAbility(item.id) !== null);
      expect(kind === 'Mount', item.name).toBe(mountOfItem(item.id) !== null);
      expect(kind === 'Bag', item.name).toBe(bagSlotsOf(item.id) > 0);
      expect(kind === 'Jewel', item.name).toBe(jewelKind(item.id) !== null);
      expect(kind === 'Dye', item.name).toBe(item.id >= I.DYE_BASE && item.id < I.DYE_BASE + 16);
      expect(kind === 'Food', item.name).toBe(item.food !== null);
      // What is worn or wielded is equipment, the bow with it (the one weapon whose strength is in the draw, not in its row).
      expect(kind === 'Equipment', item.name).toBe(!!(item.tool || item.armor || item.shield || item.weapon || item.offhand) || item.id === I.BOW);
      // Only what can be put down as a block is called a block or a growing thing.
      if (kind === 'Block' || kind === 'Nature') expect(item.block, item.name).not.toBeNull();
    }
    // Put down or used, not built with: the ones that are blocks, and the ones that are not.
    for (const id of [B.TORCH, B.RAIL_X, B.LADDER_BASE, B.CHAIN, B.LANTERN, B.SOUL_LANTERN, I.BUCKET, I.WATER_BUCKET, I.MINECART, I.BOAT, I.DOOR, I.SHEARS, I.FLINT_AND_STEEL, ...allItems().filter((i) => i.use === 'bed').map((i) => i.id)])
      expect(itemKind(id), getItem(id).name).toBe('Item');
    expect(itemKind(I.REDSTONE)).toBe('Material'); // laid down as wire, but an ingredient first
    expect(itemKind(I.STICK)).toBe('Material');
    expect(itemKind(B.STONE)).toBe('Block');
    expect(itemKind(B.LEAVES)).toBe('Nature');
  });
});
