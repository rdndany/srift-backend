import { describe, expect, it } from 'vitest';
import {
  ADVENTURE_SEED,
  BAGS,
  BAG_MAX,
  BAG_MENU_SLOTS,
  BAG_PRICES,
  BAG_SLOTS,
  CraftingMenu,
  GameSession,
  HOTBAR_SLOTS,
  HeadlessWorld,
  I,
  INVENTORY_SLOTS,
  NPCS,
  PLAYER_SLOTS,
  QUESTS,
  RECIPES,
  TILE_NAMES,
  bagCapacity,
  bagDrop,
  bagDropChance,
  bagId,
  bagOf,
  bagPrice,
  bagRoom,
  bagSlotsOf,
  bagStock,
  findRecipe,
  getItem,
  makeGenerator,
  makeStack,
  mulberry32,
  parsePlayerSave,
  rewardItems,
  sellPrice,
  shopOf,
  tooltipLines,
  tooltipName,
  type AdventureWorldGenerator,
  type InputFrame,
  type ItemStack,
} from './index';

const generator = makeGenerator(ADVENTURE_SEED, 'adventure') as AdventureWorldGenerator;
const idle = (): InputFrame => ({ t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: -1.4, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false });

function make(seed = 5) {
  const world = new HeadlessWorld(generator);
  const s = new GameSession({ seed: ADVENTURE_SEED, world, generator, naturalSpawning: false, rand: mulberry32(seed), classId: 'warrior', mode: 'survival' });
  s.finishLoading();
  s.clearInventory();
  s.drainEvents();
  return s;
}

/** Open the inventory screen and hand back its menu. */
function openInventory(s: GameSession): CraftingMenu {
  s.apply({ t: 'inventory' });
  const menu = s.menu;
  if (!(menu instanceof CraftingMenu)) throw new Error('no inventory screen');
  return menu;
}

/** Fill the hotbar and the whole backpack with something that cannot merge. */
function fillBackpack(s: GameSession, id: number = I.GREATSWORD): void {
  for (let i = 0; i < PLAYER_SLOTS; i++) s.inventory.set(i, makeStack(id, 1));
}

const sample = (id: number, count = 1): ItemStack => makeStack(id, count);

/** Stand in front of a person of the village and speak to them. */
function talkTo(s: GameSession, id: string): void {
  const n = NPCS.find((x) => x.id === id)!;
  s.teleport(n.x, generator.hubY + 1, n.z + 2, 0, 0);
  for (let i = 0; i < 4; i++) s.tick(idle());
  const v = NPCS.findIndex((x) => x.id === id);
  const m = s.mobs.mobs.find((x) => x.kind === 'npc' && x.variant === v)!;
  expect(s.talkNpc(m)).toBe(true);
}

describe('the bags', () => {
  it('are six, from 6 to 16 slots, each with a picture and a name', () => {
    expect(BAGS.map((b) => b.slots)).toEqual([6, 8, 10, 12, 14, 16]);
    BAGS.forEach((b, i) => {
      const item = getItem(bagId(i));
      expect(item.name).toBe(b.name);
      expect(item.maxStack).toBe(1);
      expect(bagSlotsOf(bagId(i))).toBe(b.slots);
      expect(TILE_NAMES).toContain(`bag_${i + 1}`);
    });
    expect(bagSlotsOf(I.BREAD)).toBe(0);
    expect(bagSlotsOf(I.SKILL_BOOK_BASE)).toBe(0);
  });

  it('fit in the room set aside for them: four bag slots of the biggest bag each', () => {
    expect(BAG_SLOTS).toBe(4);
    expect(BAG_MAX).toBe(16);
    expect(INVENTORY_SLOTS).toBe(PLAYER_SLOTS + 64);
    expect(BAG_MENU_SLOTS).toBe(4 + 64);
    expect(bagRoom(0)).toBe(PLAYER_SLOTS);
    expect(bagRoom(3)).toBe(PLAYER_SLOTS + 48);
    expect(bagOf(5)).toBeNull();
    expect(bagOf(PLAYER_SLOTS)).toEqual({ bag: 0, offset: 0 });
    expect(bagOf(PLAYER_SLOTS + 17)).toEqual({ bag: 1, offset: 1 });
    expect(bagOf(INVENTORY_SLOTS)).toBeNull();
  });

  it('are named and described on their tooltip', () => {
    const stack = makeStack(bagId(2), 1);
    expect(tooltipName(stack)).toBe('Traveler Pack');
    const lines = tooltipLines(stack);
    expect(lines.map((l) => l.text)).toContain('10 Slot Bag');
    expect(lines[1].text).toBe('Bag');
    // The bigger, the rarer it looks.
    expect(tooltipLines(makeStack(bagId(0), 1))[0].color).toBe('name');
    expect(tooltipLines(makeStack(bagId(5), 1))[0].color).toBe('kind');
  });
});

describe('room for items', () => {
  it('there is none in the bags until a bag is worn', () => {
    const s = make();
    fillBackpack(s);
    expect(s.inventory.canFit(sample(I.APPLE))).toBe(false);
    expect(s.inventory.collect(sample(I.APPLE))).not.toBeNull();
    expect(s.inventory.add(sample(I.APPLE))).not.toBeNull();
    for (let i = PLAYER_SLOTS; i < INVENTORY_SLOTS; i++) expect(s.inventory.isUsable(i)).toBe(false);
  });

  it('a worn bag opens its slots, and only those', () => {
    const s = make();
    s.bags.set(1, makeStack(bagId(1), 1)); // 8 slots, in the second bag slot
    expect(bagCapacity(s.bags)).toBe(8);
    for (let k = 0; k < BAG_MAX; k++) expect(s.inventory.isUsable(bagRoom(1) + k), `slot ${k}`).toBe(k < 8);
    for (let k = 0; k < BAG_MAX; k++) expect(s.inventory.isUsable(bagRoom(0) + k)).toBe(false);
  });

  it('what is picked up when the backpack is full goes into the bags', () => {
    const s = make();
    s.bags.set(0, makeStack(bagId(0), 1)); // 6 slots
    fillBackpack(s);
    for (let n = 0; n < 6; n++) expect(s.inventory.collect(sample(I.APPLE, 64)), `stack ${n}`).toBeNull();
    // The seventh finds no room.
    expect(s.inventory.canFit(sample(I.APPLE, 1))).toBe(false);
    expect(s.inventory.collect(sample(I.APPLE, 64))).not.toBeNull();
    expect(s.inventory.countOf(I.APPLE)).toBe(6 * 64);
    for (let k = 0; k < 6; k++) expect(s.inventory.get(bagRoom(0) + k)?.id).toBe(I.APPLE);
    expect(s.inventory.get(bagRoom(0) + 6)).toBeNull();
  });

  it('crafting, selling and quests see what is in a bag', () => {
    const s = make();
    s.bags.set(2, makeStack(bagId(3), 1));
    s.inventory.set(bagRoom(2) + 3, makeStack(I.IRON_INGOT, 5));
    expect(s.inventory.countOf(I.IRON_INGOT)).toBe(5);
    expect(s.inventory.remove(I.IRON_INGOT, 3)).toBe(true);
    expect(s.inventory.get(bagRoom(2) + 3)?.count).toBe(2);
  });
});

describe('wearing bags on the inventory screen', () => {
  it('every screen carries the bag slots after its own', () => {
    const s = make();
    const menu = openInventory(s);
    expect(menu.bagStart).toBe(menu.slots.length - BAG_MENU_SLOTS);
    expect(menu.slots.slice(menu.bagStart, menu.bagStart + BAG_SLOTS).every((slot) => slot.container === s.bags)).toBe(true);
    expect(menu.slots[menu.bagStart + BAG_SLOTS].container).toBe(s.inventory);
    expect(menu.slots[menu.bagStart + BAG_SLOTS].index).toBe(PLAYER_SLOTS);
  });

  it('a bag is worn by a click on a bag slot, and the room opens at once', () => {
    const s = make();
    s.inventory.set(0, makeStack(bagId(0), 1));
    const menu = openInventory(s);
    menu.click(0, 0);
    expect(menu.cursor?.id).toBe(bagId(0));
    menu.click(menu.bagStart + 2, 0);
    expect(menu.cursor).toBeNull();
    expect(s.bags.get(2)?.id).toBe(bagId(0));
    expect(s.inventory.isUsable(bagRoom(2))).toBe(true);
    // Something can now be put in it.
    s.inventory.set(0, makeStack(I.APPLE, 3));
    menu.click(0, 0);
    menu.click(menu.bagStart + BAG_SLOTS + 2 * BAG_MAX, 0);
    expect(s.inventory.get(bagRoom(2))?.id).toBe(I.APPLE);
  });

  it('nothing can be put into the room of a bag that is not worn', () => {
    const s = make();
    s.inventory.set(0, makeStack(I.APPLE, 3));
    const menu = openInventory(s);
    menu.click(0, 0);
    menu.click(menu.bagStart + BAG_SLOTS, 0); // the first slot of bag slot 0, which holds no bag
    expect(menu.cursor?.id).toBe(I.APPLE);
    expect(s.inventory.get(bagRoom(0))).toBeNull();
  });

  it('only a bag fits a bag slot', () => {
    const s = make();
    s.inventory.set(0, makeStack(I.APPLE, 1));
    const menu = openInventory(s);
    menu.click(0, 0);
    menu.click(menu.bagStart, 0);
    expect(s.bags.get(0)).toBeNull();
    expect(menu.cursor?.id).toBe(I.APPLE);
  });

  it('shift-click wears a bag in the first free bag slot, and takes it off again', () => {
    const s = make();
    s.bags.set(0, makeStack(bagId(1), 1));
    s.inventory.set(0, makeStack(bagId(0), 1));
    const menu = openInventory(s);
    menu.shiftClick(0);
    expect(s.inventory.get(0)).toBeNull();
    expect(s.bags.get(1)?.id).toBe(bagId(0));
    menu.shiftClick(menu.bagStart + 1);
    expect(s.bags.get(1)).toBeNull();
    expect(s.inventory.countOf(bagId(0))).toBe(1);
  });

  it('a bag that still holds something cannot be taken off', () => {
    const s = make();
    s.bags.set(0, makeStack(bagId(0), 1));
    s.inventory.set(bagRoom(0) + 4, makeStack(I.APPLE, 2));
    const menu = openInventory(s);
    menu.click(menu.bagStart, 0);
    expect(menu.cursor).toBeNull();
    expect(s.bags.get(0)?.id).toBe(bagId(0));
    menu.shiftClick(menu.bagStart);
    expect(s.bags.get(0)?.id).toBe(bagId(0));
    // Empty, it comes off.
    s.inventory.set(bagRoom(0) + 4, null);
    menu.click(menu.bagStart, 0);
    expect(menu.cursor?.id).toBe(bagId(0));
    expect(s.bags.get(0)).toBeNull();
  });

  it('a bag is swapped for a bigger one with its items inside, but not for one too small to hold them', () => {
    const s = make();
    s.bags.set(0, makeStack(bagId(2), 1)); // 10 slots
    s.inventory.set(bagRoom(0) + 8, makeStack(I.APPLE, 2));
    s.inventory.set(0, makeStack(bagId(0), 1)); // 6 slots: too small for the item in slot 9
    s.inventory.set(1, makeStack(bagId(4), 1)); // 14 slots
    const menu = openInventory(s);
    menu.click(0, 0);
    menu.click(menu.bagStart, 0);
    expect(s.bags.get(0)?.id).toBe(bagId(2));
    expect(menu.cursor?.id).toBe(bagId(0));
    menu.click(0, 0); // put the small one back
    menu.click(1, 0);
    menu.click(menu.bagStart, 0);
    expect(s.bags.get(0)?.id).toBe(bagId(4));
    expect(menu.cursor?.id).toBe(bagId(2));
    expect(s.inventory.get(bagRoom(0) + 8)?.id).toBe(I.APPLE);
  });

  it('shift-click moves a stack on into the bags when the backpack is full, and from a bag back into the backpack', () => {
    const s = make();
    s.bags.set(0, makeStack(bagId(0), 1));
    fillBackpack(s);
    s.inventory.set(0, makeStack(I.APPLE, 5));
    const menu = openInventory(s);
    // The hotbar and the backpack are full of swords: the apples go into the bag.
    menu.shiftClick(0);
    expect(s.inventory.get(0)).toBeNull();
    expect(s.inventory.get(bagRoom(0))?.id).toBe(I.APPLE);
    // And back: from a bag the stack goes to the hotbar (the free slot).
    menu.shiftClick(menu.bagStart + BAG_SLOTS);
    expect(s.inventory.get(bagRoom(0))).toBeNull();
    expect(s.inventory.get(0)?.id).toBe(I.APPLE);
  });

  it('wearing and removing bags keeps every item', () => {
    const s = make();
    s.inventory.set(0, makeStack(bagId(3), 1));
    s.inventory.set(1, makeStack(I.APPLE, 7));
    const menu = openInventory(s);
    const before = s.inventory.totalItems() + s.bags.totalItems();
    menu.shiftClick(0);
    menu.shiftClick(1); // goes to the hotbar
    expect(s.inventory.totalItems() + s.bags.totalItems()).toBe(before);
  });
});

describe('bags are kept with the character', () => {
  it('are saved with the inventory and come back with their items', () => {
    const s = make();
    s.bags.set(0, makeStack(bagId(1), 1));
    s.bags.set(3, makeStack(bagId(5), 1));
    s.inventory.set(bagRoom(0) + 2, makeStack(I.APPLE, 9));
    s.inventory.set(bagRoom(3) + 15, makeStack(I.GREATSWORD, 1));
    const save = JSON.parse(JSON.stringify(s.savePlayer()));
    expect(save.bags).toBeDefined();

    const t = make(6);
    t.loadPlayer(parsePlayerSave(save)!);
    expect(t.bags.get(0)?.id).toBe(bagId(1));
    expect(t.bags.get(3)?.id).toBe(bagId(5));
    expect(t.inventory.get(bagRoom(0) + 2)?.count).toBe(9);
    expect(t.inventory.get(bagRoom(3) + 15)?.id).toBe(I.GREATSWORD);
  });

  it('are left out of a save that wears none, and an old save loads as before', () => {
    const s = make();
    s.inventory.set(4, makeStack(I.APPLE, 2));
    const save = JSON.parse(JSON.stringify(s.savePlayer()));
    expect(save.bags).toBeUndefined();
    const t = make(7);
    t.loadPlayer(parsePlayerSave(save)!);
    expect(t.inventory.get(4)?.count).toBe(2);
    expect(t.bags.isEmpty()).toBe(true);
  });

  it('give back what a save left in a bag that is gone, and wear nothing but bags', () => {
    const s = make();
    s.bags.set(0, makeStack(bagId(0), 1));
    s.inventory.set(bagRoom(0) + 1, makeStack(I.APPLE, 4));
    const save = JSON.parse(JSON.stringify(s.savePlayer()));
    save.bags = [[I.APPLE, 1, 0], null, null, null]; // an apple is no bag
    const t = make(8);
    t.loadPlayer(parsePlayerSave(save)!);
    expect(t.bags.isEmpty()).toBe(true);
    // The apples that lay in the bag's room are back in reach.
    expect(t.inventory.countOf(I.APPLE)).toBe(4);
    for (let i = PLAYER_SLOTS; i < INVENTORY_SLOTS; i++) expect(t.inventory.get(i)).toBeNull();
  });
});

describe('where bags come from', () => {
  it('are crafted from leather and string, the bigger ones with a metal or a gem', () => {
    const grid = (rows: string[], key: Record<string, number>): (ItemStack | null)[] => rows.join('').split('').map((c) => (key[c] ? sample(key[c]) : null));
    const L = I.LEATHER;
    const S = I.STRING;
    expect(findRecipe(grid([' S ', 'L L', 'LLL'], { L, S }), 3, 3)?.result.id).toBe(bagId(0));
    expect(findRecipe(grid(['LLL', 'LSL', 'LLL'], { L, S }), 3, 3)?.result.id).toBe(bagId(1));
    expect(findRecipe(grid(['LIL', 'LSL', 'LLL'], { L, S, I: I.IRON_INGOT }), 3, 3)?.result.id).toBe(bagId(2));
    expect(findRecipe(grid(['LGL', 'LSL', 'LLL'], { L, S, G: I.GOLD_INGOT }), 3, 3)?.result.id).toBe(bagId(3));
    expect(findRecipe(grid(['LDL', 'LSL', 'LLL'], { L, S, D: I.DIAMOND }), 3, 3)?.result.id).toBe(bagId(4));
    // The biggest cannot be crafted.
    expect(RECIPES.some((r) => r.result.id === bagId(5))).toBe(false);
  });

  it('are sold by Tobin (the small ones) and Hilda (the big ones), at the price the table says', () => {
    const tobin = shopOf('tobin')!.stock.filter((w) => bagSlotsOf(w.id) > 0);
    const hilda = shopOf('hilda')!.stock.filter((w) => bagSlotsOf(w.id) > 0);
    expect(tobin.map((w) => w.id)).toEqual([bagId(0), bagId(1), bagId(2)]);
    expect(hilda.map((w) => w.id)).toEqual([bagId(3), bagId(4)]);
    for (const w of [...tobin, ...hilda]) {
      expect(w.count).toBe(1);
      expect(w.price).toBe(bagPrice(w.id));
    }
    expect(BAG_PRICES).toEqual([...BAG_PRICES].sort((a, b) => a - b));
    expect(bagStock([5])).toEqual([{ id: bagId(5), count: 1, price: BAG_PRICES[5] }]);
    expect(bagPrice(I.BREAD)).toBe(0);
  });

  it('can be bought: the coins go and the bag is in the inventory, not worn', () => {
    const s = make();
    s.addCoins(500);
    talkTo(s, 'tobin');
    const tobin = shopOf('tobin')!;
    const i = tobin.stock.findIndex((w) => w.id === bagId(1));
    s.apply({ t: 'shop', a: 'buy', i, n: 1 });
    expect(s.coins).toBe(500 - bagPrice(bagId(1)));
    expect(s.inventory.countOf(bagId(1))).toBe(1);
    expect(s.bags.isEmpty()).toBe(true);
  });
  it('sell back for a quarter of the price', () => {
    expect(sellPrice(bagId(0))).toBe(10);
    expect(sellPrice(bagId(3))).toBe(120);
    expect(sellPrice(bagId(5))).toBe(400);
  });

  it('are handed out by quests: a small one early, the biggest for the last', () => {
    const rewards = QUESTS.flatMap((q) => rewardItems(q.reward, null).map((r) => r.id));
    for (const t of [0, 1, 2, 3, 5]) expect(rewards, `bag ${t}`).toContain(bagId(t));
  });

  it('drop from monsters that are a danger: the small ones often, the big ones rarely, and the best only from an enderman', () => {
    expect(bagDropChance('zombie')).toBeGreaterThan(0);
    expect(bagDropChance('enderman')).toBeGreaterThan(bagDropChance('zombie'));
    for (const kind of ['cow', 'pig', 'sheep', 'bat', 'villager', 'npc', 'dummy'] as const) expect(bagDropChance(kind), kind).toBe(0);

    const r = mulberry32(11);
    const zombie = new Map<number, number>();
    for (let i = 0; i < 100000; i++) {
      const id = bagDrop('zombie', r);
      if (id !== null) zombie.set(id, (zombie.get(id) ?? 0) + 1);
    }
    const total = [...zombie.values()].reduce((a, b) => a + b, 0);
    expect(total / 100000).toBeGreaterThan(0.025);
    expect(total / 100000).toBeLessThan(0.035);
    expect(zombie.get(bagId(0))!).toBeGreaterThan(zombie.get(bagId(3))!);
    expect(zombie.get(bagId(3))!).toBeGreaterThan(zombie.get(bagId(5)) ?? 0);
    expect(zombie.get(bagId(5)) ?? 0).toBeGreaterThan(0);

    const ender = new Set<number>();
    for (let i = 0; i < 20000; i++) {
      const id = bagDrop('enderman', r);
      if (id !== null) ender.add(id);
    }
    expect(ender.has(bagId(0))).toBe(false);
    expect(ender.has(bagId(1))).toBe(false);
    expect(ender.has(bagId(2))).toBe(true);
    expect(ender.has(bagId(5))).toBe(true);
  });

  it('lie on the ground where a monster killed by a player fell', () => {
    const s = make(31);
    s.teleport(5.5, generator.hubY + 1, 8.5);
    for (let i = 0; i < 20; i++) s.tick(idle());
    let found = 0;
    for (let i = 0; i < 1200 && found < 2; i++) {
      const id = s.spawnMob('enderman', 5.5, generator.hubY + 1, 6.5);
      s.damageMob(id, 500);
      for (const d of s.realm.drops.drops) if (bagSlotsOf(d.stack.id) > 0) found++;
      s.realm.drops.drops.length = 0;
    }
    expect(found).toBeGreaterThanOrEqual(2);
  });
});

describe('the pickup of a bag', () => {
  it('goes into a free bag slot only by the player: picking one up never wears it', () => {
    const s = make();
    s.giveItem(bagId(0), 1);
    expect(s.bags.isEmpty()).toBe(true);
    expect(s.inventory.countOf(bagId(0))).toBe(1);
    expect(HOTBAR_SLOTS).toBe(9);
  });
});
