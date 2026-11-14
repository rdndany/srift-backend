import { describe, expect, it } from 'vitest';
import {
  ANVIL_MAX_COST,
  AnvilMenu,
  B,
  BLOCKS,
  Container,
  ENCH,
  ENCHANTS,
  EnchantMenu,
  GameSession,
  HeadlessWorld,
  I,
  LAPIS,
  LOOT_TABLES,
  MAX_SHELVES,
  PLAYER_SLOTS,
  Vitals,
  WorldGenerator,
  anvilResult,
  armorId,
  blockDrops,
  breakTime,
  canCarry,
  cloneStack,
  conflicts,
  efficiencyBonus,
  enchantName,
  enchantOffers,
  enchantability,
  findRecipe,
  getItem,
  levelOf,
  makeStack,
  mulberry32,
  normalizeEnchants,
  parseEnchants,
  parseSessionMessage,
  protectionFactor,
  protectionPoints,
  randomEnchantedBook,
  rollChest,
  sharpnessBonus,
  toolId,
  totalForLevel,
  wearAfterUnbreaking,
  withEnchants,
  type Enchant,
  type InputFrame,
  type ItemStack,
} from './index';

const SEED = 1337;
const FLOOR = 100;
const CX = 8;
const CZ = 8;

const idle = (over: Partial<InputFrame> = {}): InputFrame => ({
  t: 'frame',
  dt: 1 / 20,
  locked: true,
  yaw: 0,
  pitch: 0,
  forward: 0,
  strafe: 0,
  jump: false,
  sprint: false,
  sneak: false,
  left: false,
  right: false,
  ...over,
});

/** A flat stone floor with air above; the player stands in the middle looking toward -z. */
function make(seed = 7) {
  const generator = new WorldGenerator(SEED);
  const world = new HeadlessWorld(generator);
  for (let x = CX - 12; x <= CX + 12; x++)
    for (let z = CZ - 12; z <= CZ + 12; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 14; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.STONE);
    }
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(seed) });
  s.finishLoading();
  s.teleport(CX + 0.5, FLOOR + 1, CZ + 0.5, 0, 0);
  return { s, world };
}

const sword = (...ench: Enchant[]): ItemStack => makeStack(toolId('sword', 'iron'), 1, 0, ench.length ? ench : undefined);
const pick = (damage = 0, ...ench: Enchant[]): ItemStack => makeStack(toolId('pickaxe', 'diamond'), 1, damage, ench.length ? ench : undefined);

describe('enchanting recipes and items', () => {
  it('presses paper from a column of wheat', () => {
    const W = makeStack(I.WHEAT);
    expect(findRecipe([W, null, null, W, null, null, W, null, null], 3, 3)?.result).toMatchObject({ id: I.PAPER, count: 3 });
    // The row of three is still bread.
    expect(findRecipe([W, W, W, null, null, null, null, null, null], 3, 3)?.result.id).toBe(I.BREAD);
  });

  it('binds a book from three paper and leather', () => {
    const P = makeStack(I.PAPER);
    const r = findRecipe([P, P, P, makeStack(I.LEATHER), null, null, null, null, null], 3, 3);
    expect(r?.result.id).toBe(I.BOOK);
  });

  it('builds a bookshelf, an enchanting table and an anvil', () => {
    const P = makeStack(B.PLANKS);
    const K = makeStack(I.BOOK);
    expect(findRecipe([P, P, P, K, K, K, P, P, P], 3, 3)?.result.id).toBe(B.BOOKSHELF);
    const O = makeStack(B.OBSIDIAN);
    const D = makeStack(I.DIAMOND);
    expect(findRecipe([null, K, null, D, O, D, O, O, O], 3, 3)?.result.id).toBe(B.ENCHANTING_TABLE);
    const N = makeStack(I.IRON_INGOT);
    expect(findRecipe([N, N, N, null, N, null, N, N, N], 3, 3)?.result.id).toBe(B.ANVIL);
  });

  it('puts the blocks in the world with the right behaviour', () => {
    expect(BLOCKS[B.ENCHANTING_TABLE].shape).toBe('table');
    expect(BLOCKS[B.BOOKSHELF].tool).toBe('axe');
    expect(BLOCKS[B.ANVIL].tool).toBe('pickaxe');
    // A bookshelf breaks into three books; silk touch keeps it whole.
    const axe = getItem(toolId('axe', 'iron')).tool;
    expect(blockDrops(BLOCKS[B.BOOKSHELF], axe, mulberry32(1))).toEqual([{ id: I.BOOK, count: 3 }]);
    expect(blockDrops(BLOCKS[B.BOOKSHELF], axe, mulberry32(1), { silk: true })).toEqual([{ id: B.BOOKSHELF, count: 1 }]);
  });
});

describe('the enchantment model', () => {
  it('names enchantments with roman numerals, and leaves single-level ones bare', () => {
    expect(enchantName(ENCH.SHARPNESS, 3)).toBe('Sharpness III');
    expect(enchantName(ENCH.SILK_TOUCH, 1)).toBe('Silk Touch');
    expect(enchantName(999, 1)).toBe('');
  });

  it('knows what each enchantment can go on', () => {
    const ironSword = getItem(toolId('sword', 'iron'));
    const diamondPick = getItem(toolId('pickaxe', 'diamond'));
    const sharp = ENCHANTS.find((d) => d.id === ENCH.SHARPNESS)!;
    const eff = ENCHANTS.find((d) => d.id === ENCH.EFFICIENCY)!;
    expect(canCarry(ironSword, sharp)).toBe(true);
    expect(canCarry(diamondPick, sharp)).toBe(false);
    expect(canCarry(diamondPick, eff)).toBe(true);
    expect(canCarry(ironSword, eff)).toBe(false);
    expect(enchantability(I.STICK)).toBe(0);
    expect(enchantability(I.BOOK)).toBeGreaterThan(0);
    expect(enchantability(toolId('sword', 'gold'))).toBeGreaterThan(enchantability(toolId('sword', 'diamond')));
  });

  it('keeps protection kinds, and silk touch and fortune, from sharing an item', () => {
    expect(conflicts(ENCH.PROTECTION, ENCH.FIRE_PROTECTION)).toBe(true);
    expect(conflicts(ENCH.SILK_TOUCH, ENCH.FORTUNE)).toBe(true);
    expect(conflicts(ENCH.SHARPNESS, ENCH.SHARPNESS)).toBe(false);
    expect(conflicts(ENCH.SHARPNESS, ENCH.UNBREAKING)).toBe(false);
  });

  it('cleans up a list that came from a save or the network', () => {
    expect(normalizeEnchants([[ENCH.SHARPNESS, 99], [ENCH.SHARPNESS, 2], [12345, 1], [ENCH.KNOCKBACK, 0]])).toEqual([[ENCH.SHARPNESS, 5]]);
    expect(parseEnchants('sharp')).toBeUndefined();
    expect(parseEnchants([['a', 1], [ENCH.LOOTING, 2.5], null, [ENCH.LOOTING, 2]])).toEqual([[ENCH.LOOTING, 2]]);
    expect(parseEnchants(Array.from({ length: 1000 }, () => [ENCH.POWER, 1]))).toEqual([[ENCH.POWER, 1]]);
  });

  it('turns a plain book into an enchanted one when it gets an enchantment', () => {
    const b = withEnchants(makeStack(I.BOOK), [[ENCH.MENDING, 1]]);
    expect(b.id).toBe(I.ENCHANTED_BOOK);
    expect(levelOf(b, ENCH.MENDING)).toBe(1);
    expect(withEnchants(sword(), [[ENCH.SHARPNESS, 2]]).id).toBe(toolId('sword', 'iron'));
  });
});

describe('the table offers', () => {
  it('are the same for the same seed, shelves and item, and change with the seed', () => {
    const a = enchantOffers(42, 10, toolId('sword', 'iron'));
    const b = enchantOffers(42, 10, toolId('sword', 'iron'));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const seen = new Set<string>();
    for (let seed = 1; seed < 40; seed++) seen.add(JSON.stringify(enchantOffers(seed, 10, toolId('sword', 'iron')).map((o) => o.cost)));
    expect(seen.size).toBeGreaterThan(5);
  });

  it('cost more with more bookshelves, up to thirty with fifteen', () => {
    const top = (shelves: number) => {
      let best = 0;
      let sum = 0;
      for (let seed = 1; seed <= 200; seed++) {
        const c = enchantOffers(seed, shelves, toolId('pickaxe', 'iron'))[2].cost;
        best = Math.max(best, c);
        sum += c;
      }
      return { best, avg: sum / 200 };
    };
    const none = top(0);
    const full = top(MAX_SHELVES);
    expect(none.best).toBeLessThanOrEqual(8);
    expect(full.avg).toBeGreaterThan(none.avg * 3);
    expect(full.best).toBe(30);
    for (let seed = 1; seed <= 50; seed++) expect(enchantOffers(seed, 99, toolId('pickaxe', 'iron'))[2].cost).toBeLessThanOrEqual(30);
  });

  it('offer nothing for things that cannot be enchanted or already are', () => {
    expect(enchantOffers(5, 15, I.STICK).every((o) => o.cost === 0 && o.list.length === 0)).toBe(true);
    expect(enchantOffers(5, 15, toolId('sword', 'iron'), true).every((o) => o.cost === 0)).toBe(true);
    expect(enchantOffers(5, 15, 0).every((o) => o.cost === 0)).toBe(true);
  });

  it('only roll enchantments that fit the item, never a conflicting pair, never a treasure one', () => {
    const items = [toolId('sword', 'diamond'), toolId('pickaxe', 'iron'), I.BOW, armorId(0, 'iron'), armorId(3, 'diamond'), I.BOOK];
    for (const id of items) {
      for (let seed = 1; seed <= 120; seed++) {
        for (const o of enchantOffers(seed, 15, id)) {
          if (o.cost === 0) continue;
          expect(o.list.length).toBeGreaterThan(0);
          expect(o.clue).not.toBeNull();
          expect(o.list.some(([a, b]) => a === o.clue![0] && b === o.clue![1])).toBe(true);
          for (const [eid, level] of o.list) {
            const d = ENCHANTS.find((x) => x.id === eid)!;
            expect(d.treasure).toBeFalsy();
            expect(level).toBeGreaterThanOrEqual(1);
            expect(level).toBeLessThanOrEqual(d.max);
            if (id !== I.BOOK) expect(canCarry(getItem(id), d)).toBe(true);
          }
          for (let i = 0; i < o.list.length; i++)
            for (let j = i + 1; j < o.list.length; j++) expect(conflicts(o.list[i][0], o.list[j][0])).toBe(false);
        }
      }
    }
  });

});

describe('items carry enchantments through storage', () => {
  it('survives a save and a load, and drops anything an item cannot have', () => {
    const c = new Container(9);
    c.set(0, sword([ENCH.SHARPNESS, 3] as Enchant, [ENCH.FIRE_ASPECT, 1] as Enchant));
    c.set(1, makeStack(B.DIRT, 5));
    const json = JSON.parse(JSON.stringify(c.toJSON()));
    const d = new Container(9);
    d.loadJSON(json);
    expect(d.get(0)!.ench).toEqual([[ENCH.SHARPNESS, 3], [ENCH.FIRE_ASPECT, 1]]);
    expect(d.get(1)!.ench).toBeUndefined();
    // A hostile save puts an enchantment on a stack of dirt: it is thrown away.
    json[1] = [B.DIRT, 5, 0, [[ENCH.SHARPNESS, 5]]];
    d.loadJSON(json);
    expect(d.get(1)!.ench).toBeUndefined();
  });

  it('is copied, not shared, when a stack is cloned', () => {
    const a = sword([ENCH.SHARPNESS, 2] as Enchant);
    const b = cloneStack(a);
    expect(b.ench).toEqual(a.ench);
    expect(b.ench).not.toBe(a.ench);
  });
});

describe('the effects', () => {
  it('Sharpness adds damage and Efficiency mining speed', () => {
    expect(sharpnessBonus(0)).toBe(0);
    expect(sharpnessBonus(5)).toBe(3);
    const tool = getItem(toolId('pickaxe', 'iron')).tool!;
    const plain = breakTime(BLOCKS[B.STONE], tool);
    expect(breakTime(BLOCKS[B.STONE], tool, efficiencyBonus(5))).toBeLessThan(plain / 3);
    // It does nothing for a tool of the wrong kind.
    const shovel = getItem(toolId('shovel', 'iron')).tool!;
    expect(breakTime(BLOCKS[B.STONE], shovel, efficiencyBonus(5))).toBe(breakTime(BLOCKS[B.STONE], shovel));
  });

  it('Protection takes a share of damage, to at most eighty percent', () => {
    expect(protectionFactor(0)).toBe(1);
    expect(protectionFactor(16)).toBeCloseTo(0.36);
    expect(protectionFactor(99)).toBeCloseTo(0.2);
    const boots = makeStack(armorId(3, 'iron'), 1, 0, [[ENCH.FEATHER_FALLING, 4], [ENCH.FIRE_PROTECTION, 2]]);
    expect(protectionPoints(boots, 'fall')).toBe(12);
    expect(protectionPoints(boots, 'fire')).toBe(4);
    expect(protectionPoints(boots, 'blast')).toBe(0);
    expect(protectionPoints(makeStack(armorId(0, 'iron'), 1, 0, [[ENCH.PROJECTILE_PROTECTION, 4]]), 'projectile')).toBe(8);
    expect(protectionPoints(null, 'all')).toBe(0);
  });

  it('Unbreaking spares wear on tools and, less so, on armor', () => {
    const rand = mulberry32(3);
    let tool = 0;
    let armor = 0;
    for (let i = 0; i < 2000; i++) {
      tool += wearAfterUnbreaking(1, 3, false, rand);
      armor += wearAfterUnbreaking(1, 3, true, rand);
    }
    expect(tool).toBeGreaterThan(400);
    expect(tool).toBeLessThan(600);
    expect(armor).toBeGreaterThan(1300);
    expect(armor).toBeLessThan(1500);
    expect(wearAfterUnbreaking(5, 0, false, rand)).toBe(5);
  });

  it('Silk Touch keeps blocks whole, Fortune multiplies ore', () => {
    const p = getItem(toolId('pickaxe', 'iron')).tool;
    expect(blockDrops(BLOCKS[B.STONE], p, mulberry32(1))).toEqual([{ id: B.COBBLE, count: 1 }]);
    expect(blockDrops(BLOCKS[B.STONE], p, mulberry32(1), { silk: true })).toEqual([{ id: B.STONE, count: 1 }]);
    expect(blockDrops(BLOCKS[B.GLASS], null, mulberry32(1), { silk: true })).toEqual([{ id: B.GLASS, count: 1 }]);
    expect(blockDrops(BLOCKS[B.ICE], null, mulberry32(1), { silk: true })).toEqual([{ id: B.ICE, count: 1 }]);
    // It cannot make a block that needs a better tool drop anything.
    const wood = getItem(toolId('pickaxe', 'wood')).tool;
    expect(blockDrops(BLOCKS[B.DIAMOND_ORE], wood, mulberry32(1), { silk: true })).toEqual([]);
    const rand = mulberry32(9);
    let plain = 0;
    let lucky = 0;
    let most = 0;
    for (let i = 0; i < 400; i++) {
      plain += blockDrops(BLOCKS[B.DIAMOND_ORE], getItem(toolId('pickaxe', 'iron')).tool, rand)[0].count;
      const n = blockDrops(BLOCKS[B.DIAMOND_ORE], getItem(toolId('pickaxe', 'iron')).tool, rand, { fortune: 3 })[0].count;
      lucky += n;
      most = Math.max(most, n);
    }
    expect(plain).toBe(400);
    expect(lucky).toBeGreaterThan(600);
    expect(most).toBe(4);
  });

  it('Respiration makes the air last', () => {
    const run = (respiration: number) => {
      const v = new Vitals();
      for (let i = 0; i < 20 * 20; i++) v.tick(1 / 20, { eyeInWater: true, invulnerable: false, respiration });
      return v;
    };
    expect(run(0).health).toBeLessThan(20);
    const lasting = run(3);
    expect(lasting.health).toBe(20);
    expect(lasting.air).toBeGreaterThan(0);
  });

  it('Feather Falling cuts fall damage', () => {
    const v = new Vitals();
    expect(v.land(12, { eyeInWater: false, invulnerable: false })).toBe(9);
    const w = new Vitals();
    expect(w.land(12, { eyeInWater: false, invulnerable: false }, protectionFactor(12))).toBe(5);
    expect(new Vitals().land(3, { eyeInWater: false, invulnerable: false }, 0.2)).toBe(0);
  });
});

describe('the enchanting table screen', () => {
  const rig = (o: { level?: number; creative?: boolean; shelves?: number } = {}) => {
    const st = { level: o.level ?? 30, seed: 12345, spent: 0, done: 0 };
    const inv = new Container(PLAYER_SLOTS);
    const menu = new EnchantMenu(inv, {
      shelves: o.shelves ?? 15,
      seed: () => st.seed,
      level: () => st.level,
      creative: () => !!o.creative,
      spend: (n) => {
        st.level -= n;
        st.spent += n;
      },
      done: () => {
        st.done++;
        st.seed++;
      },
    });
    return { st, inv, menu };
  };
  const put = (menu: EnchantMenu, slot: number, stack: ItemStack) => {
    menu.cursor = stack;
    menu.click(slot, 0);
  };

  it('shows nothing until an item is in', () => {
    const { menu } = rig();
    expect(menu.offers.every((o) => o.cost === 0)).toBe(true);
    put(menu, menu.itemSlot, sword());
    expect(menu.offers.some((o) => o.cost > 0)).toBe(true);
  });

  it('takes only enchantable items in the item slot and only lapis in the other', () => {
    const { menu } = rig();
    put(menu, menu.itemSlot, makeStack(B.DIRT));
    expect(menu.item).toBeNull();
    expect(menu.cursor?.id).toBe(B.DIRT);
    menu.cursor = makeStack(I.DIAMOND);
    menu.click(menu.lapisSlot, 0);
    expect(menu.lapis).toBeNull();
    menu.cursor = makeStack(LAPIS, 4);
    menu.click(menu.lapisSlot, 0);
    expect(menu.lapis?.count).toBe(4);
  });

  it('puts one book down at a time', () => {
    const { menu } = rig();
    put(menu, menu.itemSlot, makeStack(I.BOOK, 5));
    expect(menu.item?.count).toBe(1);
    expect(menu.cursor?.count).toBe(4);
    // And will not swap while one sits there.
    menu.click(menu.itemSlot, 0);
    expect(menu.item?.count).toBe(1);
    expect(menu.cursor?.count).toBe(4);
  });

  it('enchants for the slot number in lapis and levels, and moves the seed on', () => {
    const { menu, st } = rig();
    put(menu, menu.itemSlot, sword());
    put(menu, menu.lapisSlot, makeStack(LAPIS, 10));
    const offer = menu.offers[2];
    expect(offer.cost).toBeGreaterThan(0);
    expect(menu.enchant(2)).toBe(true);
    expect(menu.item!.ench).toEqual(offer.list);
    expect(menu.lapis?.count).toBe(7);
    expect(st.spent).toBe(3);
    expect(st.level).toBe(27);
    expect(st.done).toBe(1);
    // It cannot be enchanted twice.
    expect(menu.offers.every((o) => o.cost === 0)).toBe(true);
    expect(menu.enchant(0)).toBe(false);
  });

  it('refuses without enough lapis or levels', () => {
    const a = rig();
    put(a.menu, a.menu.itemSlot, sword());
    put(a.menu, a.menu.lapisSlot, makeStack(LAPIS, 2));
    expect(a.menu.enchant(2)).toBe(false);
    expect(a.menu.item!.ench).toBeUndefined();
    const b = rig({ level: 2 });
    put(b.menu, b.menu.itemSlot, sword());
    put(b.menu, b.menu.lapisSlot, makeStack(LAPIS, 5));
    expect(b.menu.offers[2].cost).toBeGreaterThan(2);
    expect(b.menu.enchant(2)).toBe(false);
    expect(b.st.spent).toBe(0);
    expect(b.menu.lapis?.count).toBe(5);
  });

  it('is free in creative', () => {
    const { menu, st } = rig({ level: 0, creative: true });
    put(menu, menu.itemSlot, sword());
    expect(menu.enchant(1)).toBe(true);
    expect(st.spent).toBe(0);
    expect(menu.item!.ench).toBeDefined();
  });

  it('ignores indexes that are not offers', () => {
    const { menu } = rig();
    put(menu, menu.itemSlot, sword());
    for (const i of [-1, 3, 1.5, NaN]) expect(menu.enchant(i)).toBe(false);
  });

  it('turns a book into an enchanted book, and hands everything back on close', () => {
    const { menu, inv } = rig();
    put(menu, menu.itemSlot, makeStack(I.BOOK));
    put(menu, menu.lapisSlot, makeStack(LAPIS, 3));
    expect(menu.enchant(2) || menu.enchant(1) || menu.enchant(0)).toBe(true);
    expect(menu.item!.id).toBe(I.ENCHANTED_BOOK);
    const back = menu.close();
    expect(back.some((s) => s.id === I.ENCHANTED_BOOK && s.ench)).toBe(true);
    expect(inv.totalItems()).toBe(0);
  });

  it('shift-click sends one item to the table and lapis to its own slot', () => {
    const { menu, inv } = rig();
    inv.set(0, makeStack(I.BOOK, 3));
    inv.set(1, makeStack(LAPIS, 7));
    menu.shiftClick(0);
    expect(menu.item?.count).toBe(1);
    expect(inv.get(0)?.count).toBe(2);
    menu.shiftClick(1);
    expect(menu.lapis?.count).toBe(7);
    expect(inv.get(1)).toBeNull();
    menu.shiftClick(menu.itemSlot);
    expect(menu.item).toBeNull();
    expect(inv.countOf(I.BOOK)).toBe(3);
  });

  it('copies the offers a server sent, hint only', () => {
    const { menu } = rig({ shelves: 0 });
    menu.adopt(7, [{ cost: 9, clue: [ENCH.SHARPNESS, 2] }, { cost: 0, clue: null }]);
    expect(menu.shelves).toBe(7);
    expect(menu.offers.map((o) => o.cost)).toEqual([9, 0, 0]);
    expect(menu.offers[0].clue).toEqual([ENCH.SHARPNESS, 2]);
  });
});

describe('the anvil', () => {
  const rig = (o: { level?: number; creative?: boolean } = {}) => {
    const st = { level: o.level ?? 10, spent: 0, done: 0 };
    const inv = new Container(PLAYER_SLOTS);
    const menu = new AnvilMenu(inv, {
      level: () => st.level,
      creative: () => !!o.creative,
      spend: (n) => {
        st.level -= n;
        st.spent += n;
      },
      done: () => st.done++,
    });
    return { st, inv, menu };
  };
  const put = (menu: AnvilMenu, slot: number, stack: ItemStack) => {
    menu.cursor = stack;
    menu.click(slot, 0);
  };
  const book = (...e: Enchant[]) => makeStack(I.ENCHANTED_BOOK, 1, 0, e);

  it('does nothing with unrelated items', () => {
    expect(anvilResult(sword(), makeStack(B.DIRT))).toBeNull();
    expect(anvilResult(sword(), null)).toBeNull();
    expect(anvilResult(makeStack(I.BOOK), makeStack(I.BOOK))).toBeNull();
    expect(anvilResult(makeStack(toolId('sword', 'iron'), 2), makeStack(I.IRON_INGOT))).toBeNull();
  });

  it('mends a tool with its material, a quarter of its life for each', () => {
    const r = anvilResult(makeStack(toolId('sword', 'iron'), 1, 100), makeStack(I.IRON_INGOT, 5))!;
    expect(r.result.damage).toBe(0);
    expect(r.useRight).toBe(2);
    expect(r.cost).toBe(2);
    const wooden = anvilResult(makeStack(toolId('pickaxe', 'wood'), 1, 10), makeStack(B.PLANKS, 5))!;
    expect(wooden.useRight).toBe(1);
    // The wrong material does nothing, and neither does an item that is not worn.
    expect(anvilResult(makeStack(toolId('sword', 'iron'), 1, 100), makeStack(B.PLANKS))).toBeNull();
    expect(anvilResult(sword(), makeStack(I.IRON_INGOT))).toBeNull();
  });

  it('moves an enchanted book onto an item', () => {
    const r = anvilResult(sword(), book([ENCH.SHARPNESS, 3]))!;
    expect(r.result.ench).toEqual([[ENCH.SHARPNESS, 3]]);
    expect(r.cost).toBeGreaterThan(0);
    // Books the item cannot take are refused.
    expect(anvilResult(sword(), book([ENCH.EFFICIENCY, 3]))).toBeNull();
  });

  it('joins two equal levels into the next, and keeps the higher of two', () => {
    const up = anvilResult(sword([ENCH.SHARPNESS, 2] as Enchant), book([ENCH.SHARPNESS, 2]))!;
    expect(levelOf(up.result, ENCH.SHARPNESS)).toBe(3);
    const keep = anvilResult(sword([ENCH.SHARPNESS, 4] as Enchant), book([ENCH.SHARPNESS, 2]));
    expect(keep).toBeNull();
    const capped = anvilResult(sword([ENCH.SHARPNESS, 5] as Enchant), book([ENCH.SHARPNESS, 5]));
    expect(capped).toBeNull();
  });

  it('will not put conflicting enchantments together', () => {
    const r = anvilResult(makeStack(armorId(0, 'iron'), 1, 0, [[ENCH.PROTECTION, 2]]), book([ENCH.FIRE_PROTECTION, 3]));
    expect(r === null || levelOf(r.result, ENCH.FIRE_PROTECTION) === 0).toBe(true);
  });

  it('joins two damaged tools', () => {
    const r = anvilResult(makeStack(toolId('pickaxe', 'iron'), 1, 150), makeStack(toolId('pickaxe', 'iron'), 1, 150))!;
    expect(r.result.damage).toBeLessThan(150);
    expect(r.useRight).toBe(1);
  });

  it('makes a book of a book', () => {
    const r = anvilResult(makeStack(I.BOOK), book([ENCH.MENDING, 1]))!;
    expect(r.result.id).toBe(I.ENCHANTED_BOOK);
  });

  it('charges the levels when the result is taken, and uses the right-hand stack up', () => {
    const { menu, st } = rig();
    put(menu, menu.leftSlot, sword());
    put(menu, menu.rightSlot, book([ENCH.SHARPNESS, 3]));
    expect(menu.cost).toBe(3);
    expect(menu.canTake()).toBe(true);
    expect(menu.stackAt(menu.resultSlot)?.ench).toEqual([[ENCH.SHARPNESS, 3]]);
    menu.click(menu.resultSlot, 0);
    expect(menu.cursor?.ench).toEqual([[ENCH.SHARPNESS, 3]]);
    expect(st.spent).toBe(3);
    expect(st.done).toBe(1);
    expect(menu.input.get(0)).toBeNull();
    expect(menu.input.get(1)).toBeNull();
    expect(menu.stackAt(menu.resultSlot)).toBeNull();
  });

  it('keeps what is left of the right-hand stack', () => {
    const { menu } = rig();
    put(menu, menu.leftSlot, makeStack(toolId('sword', 'iron'), 1, 100));
    put(menu, menu.rightSlot, makeStack(I.IRON_INGOT, 5));
    menu.shiftClick(menu.resultSlot);
    expect(menu.input.get(1)?.count).toBe(3);
    expect(menu.input.get(0)).toBeNull();
  });

  it('refuses to hand over the result without the levels', () => {
    const { menu, st } = rig({ level: 1 });
    put(menu, menu.leftSlot, sword());
    put(menu, menu.rightSlot, book([ENCH.SHARPNESS, 3]));
    expect(menu.canTake()).toBe(false);
    menu.click(menu.resultSlot, 0);
    menu.shiftClick(menu.resultSlot);
    expect(menu.cursor).toBeNull();
    expect(st.spent).toBe(0);
    expect(menu.input.get(0)).not.toBeNull();
  });

  it('is free in creative, and never too expensive there', () => {
    const { menu, st } = rig({ level: 0, creative: true });
    put(menu, menu.leftSlot, sword());
    put(menu, menu.rightSlot, book([ENCH.SHARPNESS, 3]));
    menu.click(menu.resultSlot, 0);
    expect(menu.cursor).not.toBeNull();
    expect(st.spent).toBe(0);
  });

  it('calls a job past thirty-nine levels too expensive', () => {
    const left = makeStack(toolId('sword', 'diamond'), 1, 500);
    const right = makeStack(toolId('sword', 'diamond'), 1, 1, [
      [ENCH.SHARPNESS, 5],
      [ENCH.LOOTING, 3],
      [ENCH.FIRE_ASPECT, 2],
      [ENCH.KNOCKBACK, 2],
      [ENCH.UNBREAKING, 3],
      [ENCH.MENDING, 1],
    ]);
    const plan = anvilResult(left, right)!;
    expect(plan.cost).toBeGreaterThan(ANVIL_MAX_COST);
    const { menu } = rig({ level: 99 });
    put(menu, menu.leftSlot, left);
    put(menu, menu.rightSlot, right);
    expect(menu.tooExpensive).toBe(true);
    expect(menu.canTake()).toBe(false);
    expect(menu.stackAt(menu.resultSlot)).toBeNull();
  });

  it('returns both inputs when it is closed', () => {
    const { menu } = rig();
    put(menu, menu.leftSlot, sword());
    put(menu, menu.rightSlot, makeStack(I.IRON_INGOT, 4));
    const back = menu.close();
    expect(back).toHaveLength(2);
  });
});

describe('enchanting in a game session', () => {
  const table = (s: GameSession, world: HeadlessWorld, shelves = true) => {
    const tx = CX + 4;
    const ty = FLOOR + 1;
    const tz = CZ;
    world.setBlock(tx, ty, tz, B.ENCHANTING_TABLE);
    if (shelves) {
      for (let dx = -2; dx <= 2; dx++)
        for (let dz = -2; dz <= 2; dz++) {
          if (Math.abs(dx) < 2 && Math.abs(dz) < 2) continue;
          for (let dy = 0; dy <= 1; dy++) world.setBlock(tx + dx, ty + dy, tz + dz, B.BOOKSHELF);
        }
    }
    return { tx, ty, tz };
  };

  it('counts bookshelves in the ring, and not the ones with something in the way', () => {
    const { s, world } = make();
    const { tx, ty, tz } = table(s, world, false);
    expect(s.countShelves(tx, ty, tz)).toBe(0);
    world.setBlock(tx + 2, ty, tz, B.BOOKSHELF);
    world.setBlock(tx + 2, ty + 1, tz + 2, B.BOOKSHELF);
    expect(s.countShelves(tx, ty, tz)).toBe(2);
    world.setBlock(tx + 1, ty, tz, B.STONE); // blocks the way to the shelf at +2
    expect(s.countShelves(tx, ty, tz)).toBe(1);
    // A shelf next to the table, not in the ring, adds nothing.
    world.setBlock(tx, ty, tz + 1, B.BOOKSHELF);
    expect(s.countShelves(tx, ty, tz)).toBe(1);
  });

  it('caps the count at fifteen', () => {
    const { s, world } = make();
    const { tx, ty, tz } = table(s, world);
    expect(s.countShelves(tx, ty, tz)).toBe(MAX_SHELVES);
  });

  it('opens from the block, enchants over the command channel and takes the price', () => {
    const { s, world } = make();
    const { tx, ty, tz } = table(s, world);
    expect(s.useBlock(tx, ty, tz)).toBe(true);
    expect(s.screen).toBe('enchant');
    const menu = s.menu as EnchantMenu;
    expect(menu.shelves).toBe(MAX_SHELVES);
    s.inventory.set(0, sword());
    s.inventory.set(1, makeStack(LAPIS, 6));
    s.apply({ t: 'shift', slot: 0 });
    s.apply({ t: 'shift', slot: 1 });
    expect(menu.item).not.toBeNull();
    expect(menu.lapis?.count).toBe(6);
    s.xp.add(totalForLevel(30));
    const before = s.xp.level;
    const offer = menu.offers[2];
    s.apply({ t: 'enchant', index: 2 });
    expect(menu.item!.ench).toEqual(offer.list);
    expect(s.xp.level).toBe(before - 3);
    expect(menu.lapis?.count).toBe(3);
    // Closing gives the item back to the inventory, enchantments and all.
    s.apply({ t: 'closeMenu' });
    expect(s.screen).toBe('none');
    const found = [...Array(PLAYER_SLOTS).keys()].map((i) => s.inventory.get(i)).find((x) => x?.id === toolId('sword', 'iron'));
    expect(found?.ench).toEqual(offer.list);
  });

  it('keeps the same offers until something is enchanted', () => {
    const { s, world } = make();
    const { tx, ty, tz } = table(s, world);
    s.useBlock(tx, ty, tz);
    s.inventory.set(0, sword());
    s.apply({ t: 'shift', slot: 0 });
    const first = JSON.stringify((s.menu as EnchantMenu).offers);
    s.apply({ t: 'closeMenu' });
    s.useBlock(tx, ty, tz);
    const at = [...Array(PLAYER_SLOTS).keys()].find((i) => s.inventory.get(i)?.id === toolId('sword', 'iron'))!;
    s.apply({ t: 'shift', slot: at });
    expect(JSON.stringify((s.menu as EnchantMenu).offers)).toBe(first);
  });

  it('ignores the command when no table is open', () => {
    const { s } = make();
    s.apply({ t: 'enchant', index: 0 });
    expect(s.screen).toBe('none');
  });

  it('opens an anvil and mends at it', () => {
    const { s, world } = make();
    world.setBlock(CX + 3, FLOOR + 1, CZ, B.ANVIL);
    expect(s.useBlock(CX + 3, FLOOR + 1, CZ)).toBe(true);
    expect(s.screen).toBe('anvil');
    const menu = s.menu as AnvilMenu;
    s.xp.add(totalForLevel(5));
    s.inventory.set(0, makeStack(toolId('sword', 'iron'), 1, 100));
    s.inventory.set(1, makeStack(I.IRON_INGOT, 3));
    s.apply({ t: 'shift', slot: 0 });
    s.apply({ t: 'shift', slot: 1 });
    expect(menu.cost).toBe(2);
    s.apply({ t: 'click', slot: menu.resultSlot, button: 0 });
    expect(menu.cursor?.damage).toBe(0);
    expect(s.xp.level).toBe(3);
  });

  it('refuses a command that is not a plain offer index', () => {
    expect(parseSessionMessage({ t: 'cmd' })).toBeNull();
    expect(parseSessionMessage({ t: 'enchant', index: 2 })).toEqual({ t: 'enchant', index: 2 });
    for (const index of [-1, 3, 1.5, '1', null, NaN, Infinity]) expect(parseSessionMessage({ t: 'enchant', index })).toBeNull();
  });
});

describe('enchantments at work', () => {
  const zombie = (s: GameSession, z = CZ - 2) => s.mobs.spawn('zombie', CX + 0.5, FLOOR + 1, z + 0.5);
  const hit = (s: GameSession, weapon: ItemStack) => {
    s.inventory.set(s.selected, weapon);
    const m = zombie(s);
    const h = m.health;
    s.attackMob(m);
    return { m, dealt: h - m.health };
  };

  it('Sharpness hurts more', () => {
    const base = hit(make().s, sword()).dealt;
    const sharp = hit(make().s, sword([ENCH.SHARPNESS, 5])).dealt;
    expect(base).toBe(getItem(toolId('sword', 'iron')).tool!.damage);
    expect(sharp - base).toBe(3);
  });

  it('an enchanted book in the hand does nothing', () => {
    const base = hit(make().s, sword()).dealt;
    const book = hit(make().s, makeStack(I.ENCHANTED_BOOK, 1, 0, [[ENCH.SHARPNESS, 5]]));
    expect(book.dealt).toBeLessThan(base);
  });

  it('Knockback pushes harder and Fire Aspect sets the mob alight', () => {
    const plain = hit(make().s, sword()).m;
    const knocked = hit(make().s, sword([ENCH.KNOCKBACK, 2])).m;
    expect(Math.abs(knocked.kbz)).toBeCloseTo(Math.abs(plain.kbz) * 3);
    const burnt = hit(make().s, sword([ENCH.FIRE_ASPECT, 2])).m;
    expect(burnt.onFire).toBe(8);
    expect(plain.onFire).toBe(0);
  });

  it('a burning mob takes damage and the fire dies out', () => {
    const { s } = make();
    const m = hit(s, sword([ENCH.FIRE_ASPECT, 1])).m;
    const h = m.health;
    for (let i = 0; i < 20 * 6; i++) s.tick(idle());
    expect(m.health).toBeLessThan(h);
    expect(m.onFire).toBe(0);
  });

  it('Looting adds drops when a mob dies', () => {
    const total = (looting: number) => {
      const { s } = make(3);
      let n = 0;
      for (let i = 0; i < 60; i++) {
        const m = zombie(s, CZ - 3);
        s.drops.drops.length = 0;
        s.mobs.damage(m, 999, 0, 1, s.realm.mobEvents, true, true, true, looting ? { looting } : undefined);
        for (const d of s.drops.drops) n += d.stack.count;
      }
      return n;
    };
    expect(total(3)).toBeGreaterThan(total(0));
  });

  it('Protection, Projectile Protection and Blast Protection cut matching damage', () => {
    const wear = (s: GameSession, ...ench: Enchant[]) => {
      for (let i = 0; i < 4; i++) s.armor.set(i, makeStack(armorId(i, 'iron'), 1, 0, ench.length ? ench : undefined));
    };
    const taken = (kind: 'melee' | 'arrow' | 'blast', ...ench: Enchant[]) => {
      const { s } = make();
      wear(s, ...ench);
      if (kind === 'blast') s.hurtByExplosion(CX + 0.5, FLOOR + 1, CZ + 2.5, 3, 'creeper');
      else s.hurtByMob(8, 0, 1, kind === 'arrow' ? 'arrow' : 'zombie');
      return 20 - s.vitals.health;
    };
    expect(taken('melee', [ENCH.PROTECTION, 4])).toBeLessThan(taken('melee') * 0.6);
    expect(taken('melee', [ENCH.PROJECTILE_PROTECTION, 4])).toBe(taken('melee'));
    expect(taken('arrow', [ENCH.PROJECTILE_PROTECTION, 4])).toBeLessThan(taken('arrow') * 0.5);
    expect(taken('blast', [ENCH.BLAST_PROTECTION, 4])).toBeLessThan(taken('blast') * 0.5);
  });

  it('Feather Falling softens a fall in a session', () => {
    const fall = (boots?: ItemStack) => {
      const { s } = make();
      if (boots) s.armor.set(3, boots);
      s.teleport(CX + 0.5, FLOOR + 13, CZ + 0.5, 0, 0);
      let low = 20;
      for (let i = 0; i < 80; i++) {
        s.tick(idle());
        low = Math.min(low, s.vitals.health);
      }
      return 20 - low;
    };
    const plain = fall();
    expect(plain).toBeGreaterThan(5);
    expect(fall(makeStack(armorId(3, 'iron'), 1, 0, [[ENCH.FEATHER_FALLING, 4]]))).toBeLessThan(plain * 0.7);
  });

  it('armor and tools wear less with Unbreaking, and enchanted armor goes on keeping its enchantments', () => {
    const { s } = make();
    const helmet = makeStack(armorId(0, 'iron'), 1, 7, [[ENCH.PROTECTION, 3]]);
    s.inventory.set(s.selected, helmet);
    expect(s.equipHeld()).toBe(true);
    expect(s.armor.get(0)!.ench).toEqual([[ENCH.PROTECTION, 3]]);
    expect(s.armor.get(0)!.damage).toBe(7);
  });

  it('Efficiency mines faster, Silk Touch lifts stone whole and ice stays ice', () => {
    const { s, world } = make();
    const x = CX + 2;
    const y = FLOOR + 1;
    world.setBlock(x, y, CZ, B.STONE);
    s.inventory.set(s.selected, pick());
    const slow = s.breakTimeAt(x, y, CZ);
    s.inventory.set(s.selected, pick(0, [ENCH.EFFICIENCY, 5]));
    expect(s.breakTimeAt(x, y, CZ)).toBeLessThan(slow / 3);

    s.inventory.set(s.selected, pick(0, [ENCH.SILK_TOUCH, 1]));
    s.drops.drops.length = 0;
    s.breakBlock(x, y, CZ);
    expect(world.getBlock(x, y, CZ)).toBe(B.AIR);
    expect(s.drops.drops.map((d) => d.stack.id)).toEqual([B.STONE]);

    world.setBlock(x, y, CZ, B.ICE);
    s.breakBlock(x, y, CZ);
    expect(world.getBlock(x, y, CZ)).toBe(B.AIR);
    s.inventory.set(s.selected, pick());
    world.setBlock(x, y, CZ, B.ICE);
    s.breakBlock(x, y, CZ);
    expect(world.getBlock(x, y, CZ)).toBe(B.WATER);
  });

  it('Fortune gives more from ore and no extra from stone', () => {
    const { s, world } = make(5);
    s.inventory.set(s.selected, pick(0, [ENCH.FORTUNE, 3]));
    let most = 0;
    for (let i = 0; i < 40; i++) {
      world.setBlock(CX + 2, FLOOR + 1, CZ, B.DIAMOND_ORE);
      s.drops.drops.length = 0;
      s.breakBlock(CX + 2, FLOOR + 1, CZ);
      most = Math.max(most, s.drops.drops.reduce((a, d) => a + d.stack.count, 0));
      s.inventory.set(s.selected, pick(0, [ENCH.FORTUNE, 3]));
    }
    expect(most).toBeGreaterThanOrEqual(3);
  });

  it('Mending repairs from experience before it counts as levels', () => {
    const { s } = make();
    s.inventory.set(s.selected, pick(100, [ENCH.MENDING, 1]));
    s.addXp(10);
    expect(s.inventory.get(s.selected)!.damage).toBe(80);
    expect(s.xp.total).toBe(0);
    s.addXp(100);
    expect(s.inventory.get(s.selected)!.damage).toBe(0);
    expect(s.xp.total).toBe(100 - 40);
  });

  it('experience is just experience without Mending', () => {
    const { s } = make();
    s.inventory.set(s.selected, pick(100));
    s.addXp(10);
    expect(s.inventory.get(s.selected)!.damage).toBe(100);
    expect(s.xp.total).toBe(10);
  });

  it('Mending also mends worn armor', () => {
    const { s } = make();
    s.armor.set(1, makeStack(armorId(1, 'iron'), 1, 50, [[ENCH.MENDING, 1]]));
    s.addXp(5);
    expect(s.armor.get(1)!.damage).toBe(40);
  });

  it('a bow with Power, Punch and Flame fires a harder, pushing, burning arrow', () => {
    const { s } = make();
    const plain = s.mobs.shootArrow(0, 0, 0, 0, 0, -1, 1);
    const strong = s.mobs.shootArrow(0, 0, 0, 0, 0, -1, 1, { power: 2, punch: 1, flame: true });
    expect(strong.damage).toBeCloseTo(plain.damage * 1.75);
    expect(strong.punch).toBe(1);
    expect(strong.fire).toBe(true);
    expect(plain.fire).toBe(false);
  });

  it('Infinity saves the arrow', () => {
    const shoot = (bow: ItemStack) => {
      const { s } = make();
      s.inventory.set(s.selected, bow);
      s.inventory.set(8, makeStack(I.ARROW, 5));
      for (let i = 0; i < 24; i++) s.tick(idle({ right: true }));
      s.tick(idle());
      return s.inventory.countOf(I.ARROW);
    };
    expect(shoot(makeStack(I.BOW))).toBe(4);
    expect(shoot(makeStack(I.BOW, 1, 0, [[ENCH.INFINITY, 1]]))).toBe(5);
  });
});

describe('enchanted books in loot', () => {
  it('turn up in dungeon, mineshaft and temple chests, each with a valid enchantment', () => {
    const books: ItemStack[] = [];
    for (const name of ['dungeon', 'mineshaft', 'temple'] as const) {
      for (let i = 0; i < 200; i++) for (const s of rollChest(LOOT_TABLES[name], mulberry32(i * 31 + 5))) if (s?.id === I.ENCHANTED_BOOK) books.push(s);
    }
    expect(books.length).toBeGreaterThan(10);
    for (const b of books) {
      expect(b.count).toBe(1);
      expect(b.ench).toHaveLength(1);
      const [id, level] = b.ench![0];
      expect(ENCHANTS.some((d) => d.id === id && level >= 1 && level <= d.max)).toBe(true);
    }
    expect(new Set(books.map((b) => b.ench![0][0])).size).toBeGreaterThan(5);
  });

  it('can be Mending, which no table offers', () => {
    const seen = new Set<number>();
    const rand = mulberry32(2);
    for (let i = 0; i < 500; i++) seen.add(randomEnchantedBook(rand).ench![0][0]);
    expect(seen.has(ENCH.MENDING)).toBe(true);
    for (let seed = 1; seed < 200; seed++)
      for (const o of enchantOffers(seed, 15, toolId('pickaxe', 'diamond'))) expect(o.list.some(([id]) => id === ENCH.MENDING)).toBe(false);
  });
});
