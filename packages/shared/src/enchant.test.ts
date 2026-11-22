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
  canInscribe,
  glyphLore,
  glyphOptions,
  glyphPrice,
  glyphSockets,
  inscribed,
  erased,
  glyphModifiers,
  wildGlyphs,
  dominantElement,
  glowCode,
  glowColor,
  inscribeChance,
  failedPrice,
  ELEMENTS,
  ELEMENT_LIST,
  siphonShare,
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
  type AltarContext,
  type Enchant,
  type InputFrame,
  type ItemStack,
  tomeBlocked,
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
function make(seed = 7, rand: () => number = mulberry32(seed)) {
  const generator = new WorldGenerator(SEED);
  const world = new HeadlessWorld(generator);
  for (let x = CX - 12; x <= CX + 12; x++)
    for (let z = CZ - 12; z <= CZ + 12; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 14; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.STONE);
    }
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand });
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
    expect(enchantName(ENCH.SHARPNESS, 3)).toBe('Keen Edge III');
    expect(enchantName(ENCH.SILK_TOUCH, 1)).toBe('Gentle Hand');
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
    expect(canInscribe(I.STICK)).toBe(false);
    expect(canInscribe(I.BOOK)).toBe(true);
    expect(canInscribe(toolId('sword', 'gold'))).toBe(true);
    // The class weapons and the off hand take glyphs now too: a staff the spells ones, a shield the worn ones.
    const staff = getItem(I.STAFF);
    expect(canCarry(staff, ENCHANTS.find((d) => d.id === ENCH.SORCERY)!)).toBe(true);
    expect(canCarry(staff, sharp)).toBe(false);
    expect(canCarry(getItem(I.SHIELD), ENCHANTS.find((d) => d.id === ENCH.VIGOR)!)).toBe(true);
    expect(canCarry(getItem(I.SHIELD), ENCHANTS.find((d) => d.id === ENCH.UNBREAKING)!)).toBe(true);
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

describe('the altar offers', () => {
  const ctx: AltarContext = { shelves: 15, lapis: 99, auren: 99999 };
  const opt = (item: ItemStack, id: number, c = ctx) => glyphOptions(item, c).find((o) => o.def.id === id)!;

  it('lists every glyph that fits the piece, and nothing for what cannot take one', () => {
    expect(glyphOptions(null, ctx)).toEqual([]);
    expect(glyphOptions(makeStack(B.DIRT), ctx)).toEqual([]);
    expect(glyphOptions(makeStack(I.STICK), ctx)).toEqual([]);
    expect(glyphOptions(makeStack(toolId('sword', 'iron'), 2), ctx)).toEqual([]); // one piece at a time
    const names = glyphOptions(sword(), ctx).map((o) => o.def.id);
    expect(names).toContain(ENCH.SHARPNESS);
    expect(names).toContain(ENCH.SIPHON);
    expect(names).toContain(ENCH.MIGHT);
    expect(names).not.toContain(ENCH.EFFICIENCY);
    expect(names).not.toContain(ENCH.MENDING); // a treasure: found, never inscribed
  });

  it('shows the same offers every time: nothing is rolled', () => {
    expect(JSON.stringify(glyphOptions(sword(), ctx))).toBe(JSON.stringify(glyphOptions(sword(), ctx)));
  });

  it('prices a glyph by tier and rank, in lapis and Auren, and asks lore for the high ranks', () => {
    const keen = ENCHANTS.find((d) => d.id === ENCH.SHARPNESS)!;
    expect(glyphPrice(keen, 1)).toEqual({ auren: 30, lapis: 1 });
    expect(glyphPrice(keen, 5).auren).toBeGreaterThan(glyphPrice(keen, 4).auren);
    expect(glyphPrice(keen, 3).lapis).toBe(3);
    const brand = ENCHANTS.find((d) => d.id === ENCH.FIRE_ASPECT)!;
    expect(glyphPrice(brand, 1).auren).toBeGreaterThan(glyphPrice(keen, 1).auren);
    expect(glyphLore(keen, 1)).toBe(0);
    expect(glyphLore(keen, 5)).toBeGreaterThan(glyphLore(keen, 2));
    expect(glyphLore(brand, 1)).toBeGreaterThan(glyphLore(keen, 1));
    for (const d of ENCHANTS) for (let r = 1; r <= d.max; r++) expect(glyphLore(d, r)).toBeLessThanOrEqual(MAX_SHELVES);
  });

  it('says what stands in the way, first reason first', () => {
    const base = sword();
    expect(opt(base, ENCH.SHARPNESS).state).toBe('ok');
    expect(opt(base, ENCH.SHARPNESS, { ...ctx, lapis: 0 }).state).toBe('lapis');
    expect(opt(base, ENCH.SHARPNESS, { ...ctx, auren: 0 }).state).toBe('auren');
    expect(opt(base, ENCH.FIRE_ASPECT, { ...ctx, shelves: 0 }).state).toBe('lore');
    expect(opt(base, ENCH.SHARPNESS, { shelves: 0, lapis: 0, auren: 0, creative: true }).state).toBe('ok');
    // An item holds one glyph per socket; one that is on it can still be raised.
    const full = sword([ENCH.SHARPNESS, 2]);
    expect(glyphSockets(full)).toBe(1);
    expect(opt(full, ENCH.KNOCKBACK).state).toBe('sockets');
    expect(opt(full, ENCH.SHARPNESS)).toMatchObject({ state: 'ok', have: 2, rank: 3 });
    expect(opt(sword([ENCH.SHARPNESS, 5]), ENCH.SHARPNESS).state).toBe('maxed');
  });

  it('keeps the protections apart, and says which glyph is in the way', () => {
    const helm = makeStack(armorId(0, 'iron'), 1, 0, [[ENCH.PROTECTION, 2]]);
    const gear = { ...helm, gear: { r: 3 as const, l: 1, s: [['vit', 3] as ['vit', number]] } };
    const o = opt(gear, ENCH.FIRE_PROTECTION);
    expect(o.state).toBe('conflict');
    expect(o.blockedBy).toBe(ENCH.PROTECTION);
  });

  it('puts the best options first: what can be done now, then what is short of something', () => {
    const list = glyphOptions(sword(), { shelves: 0, lapis: 0, auren: 0 });
    const states = list.map((o) => o.state);
    expect(states.every((st) => st !== 'ok')).toBe(true);
    const rich = glyphOptions(sword(), ctx).map((o) => o.state);
    expect(rich[0]).toBe('ok');
  });

  it('gives rarer pieces more sockets', () => {
    expect(glyphSockets(sword())).toBe(1);
    for (const r of [1, 2, 3] as const) expect(glyphSockets({ ...sword(), gear: { r, l: 1, s: [['might', 3]] } })).toBe(1 + r);
    expect(glyphSockets(makeStack(I.BOOK))).toBe(1);
    expect(glyphSockets(null)).toBe(0);
  });

  it('inscribes one rank at a time, and a plain book becomes a Glyph Tome', () => {
    let s = inscribed(sword(), ENCH.SHARPNESS)!;
    expect(s.ench).toEqual([[ENCH.SHARPNESS, 1]]);
    s = inscribed(s, ENCH.SHARPNESS)!;
    expect(levelOf(s, ENCH.SHARPNESS)).toBe(2);
    expect(inscribed(s, ENCH.KNOCKBACK)).toBeNull(); // no socket
    expect(inscribed(sword(), ENCH.EFFICIENCY)).toBeNull(); // does not fit
    expect(inscribed(sword(), ENCH.MENDING)).toBeNull(); // a treasure
    const tome = inscribed(makeStack(I.BOOK), ENCH.SIPHON)!;
    expect(tome.id).toBe(I.ENCHANTED_BOOK);
    expect(erased(tome, ENCH.SIPHON)!.id).toBe(I.BOOK);
  });

  it('keeps everything a piece rolled when a glyph goes on or off: rarity, +upgrade, Bloom attribute, name', () => {
    const rolled: ItemStack = { ...sword(), name: 'Dawn Edge', rc: 3, gear: { r: 2, l: 5, s: [['might', 6]], u: 9, o: ['crit', 4] } };
    const on = inscribed(rolled, ENCH.SHARPNESS)!;
    expect(on.ench).toEqual([[ENCH.SHARPNESS, 1]]);
    expect(on.gear).toEqual(rolled.gear);
    expect(on.gear).not.toBe(rolled.gear); // a copy, not shared
    expect(on.name).toBe('Dawn Edge');
    expect(on.rc).toBe(3);
    const off = erased(on, ENCH.SHARPNESS)!;
    expect(off.ench).toBeUndefined();
    expect(off.gear).toEqual(rolled.gear);
    expect(withEnchants(rolled, [[ENCH.SHARPNESS, 2]]).gear).toEqual(rolled.gear);
  });

  it('erases a glyph, all of its ranks', () => {
    const s = erased(sword([ENCH.SHARPNESS, 3]), ENCH.SHARPNESS)!;
    expect(s.ench).toBeUndefined();
    expect(erased(sword(), ENCH.SHARPNESS)).toBeNull();
  });

  it('sends glyphs found in the wild only where they fit, one at a time', () => {
    for (let seed = 1; seed < 60; seed++) {
      for (const id of [toolId('sword', 'diamond'), I.BOW, armorId(1, 'iron'), I.FISHING_ROD, I.BOOK]) {
        const list = wildGlyphs(id, mulberry32(seed), 2);
        for (const [gid, rank] of list) {
          const d = ENCHANTS.find((x) => x.id === gid)!;
          expect(d.treasure).toBeFalsy();
          expect(rank).toBeGreaterThanOrEqual(1);
          expect(rank).toBeLessThanOrEqual(d.max);
          if (id !== I.BOOK) expect(canCarry(getItem(id), d)).toBe(true);
        }
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) expect(conflicts(list[i][0], list[j][0])).toBe(false);
      }
    }
  });

  it('works out the chance of a glyph: rarer and higher ranks fail more, spare lore helps, always within 15 to 95', () => {
    const d = (id: number) => ENCHANTS.find((x) => x.id === id)!;
    const sharp = d(ENCH.SHARPNESS);
    const rare = ENCHANTS.filter((x) => x.tier === 4)[0];
    expect(inscribeChance(sharp, 1, 15)).toBeGreaterThan(inscribeChance(rare, 1, 15));
    expect(inscribeChance(sharp, 1, 15)).toBeGreaterThan(inscribeChance(sharp, sharp.max, 15));
    expect(inscribeChance(sharp, 1, 15)).toBeGreaterThan(inscribeChance(sharp, 1, 2));
    for (const x of ENCHANTS) for (let r = 1; r <= x.max; r++) for (const sh of [0, 2, 8, 15, 40]) {
      const c = inscribeChance(x, r, sh);
      expect(c).toBeGreaterThanOrEqual(15);
      expect(c).toBeLessThanOrEqual(95);
    }
    expect(failedPrice({ auren: 335, lapis: 4 })).toEqual({ auren: 168, lapis: 4 });
  });

  it('knows each glyph by element, and the one a piece glows with', () => {
    expect(dominantElement(sword())).toBeNull();
    expect(dominantElement(sword([ENCH.FIRE_ASPECT, 2]))).toBe('ember');
    expect(dominantElement(makeStack(I.BOW, 1, 0, [[ENCH.POWER, 3], [ENCH.FLAME, 1]]))).toBe('storm');
  });

  it('sends the glow of a piece as a small code, and turns it back into the colour', () => {
    expect(glowCode(sword())).toBe(0);
    expect(glowCode(null)).toBe(0);
    expect(glowColor(0)).toBeNull();
    expect(glowColor(undefined)).toBeNull();
    expect(glowColor(99)).toBeNull();
    const fire = sword([ENCH.FIRE_ASPECT, 2]);
    expect(glowColor(glowCode(fire))).toBe(ELEMENTS.ember.color);
    // every element has its own code, and each one maps back to its own colour
    ELEMENT_LIST.forEach((el, i) => expect(glowColor(i + 1)).toBe(ELEMENTS[el].color));
    expect(new Set(ELEMENT_LIST.map((_, i) => glowColor(i + 1))).size).toBe(ELEMENT_LIST.length);
  });

  it('adds the stats of the glyphs of a stat to the class, for a wearer who may use the piece', () => {
    const who = { id: 'warrior' as const, level: 1 };
    expect(glyphModifiers([sword([ENCH.MIGHT, 2])], who)).toHaveLength(1);
    expect(glyphModifiers([sword([ENCH.SHARPNESS, 2])], who)).toHaveLength(0); // a mechanic, not a stat
    expect(glyphModifiers([sword([ENCH.MIGHT, 2])], null)).toHaveLength(0);
    expect(glyphModifiers([makeStack(I.ENCHANTED_BOOK, 1, 0, [[ENCH.MIGHT, 2]])], who)).toHaveLength(0); // a tome does nothing
    // A found piece for a higher level adds nothing until it is reached.
    const high = { ...sword([ENCH.MIGHT, 2]), gear: { r: 1 as const, l: 12, s: [['might', 3] as ['might', number]] } };
    expect(glyphModifiers([high], who)).toHaveLength(0);
    expect(glyphModifiers([high], { id: 'warrior', level: 12 })).toHaveLength(1);
  });

  it('Siphon gives back a share of the blow', () => {
    expect(siphonShare(0)).toBe(0);
    expect(siphonShare(3)).toBeCloseTo(0.12);
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

  it('Aegis takes a share of damage, three percent a point, to at most sixty percent', () => {
    expect(protectionFactor(0)).toBe(1);
    expect(protectionFactor(16)).toBeCloseTo(0.52);
    expect(protectionFactor(99)).toBeCloseTo(0.4);
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
    expect(w.land(12, { eyeInWater: false, invulnerable: false }, protectionFactor(12))).toBe(6);
    expect(new Vitals().land(3, { eyeInWater: false, invulnerable: false }, 0.2)).toBe(0);
  });
});

describe('the Runic Altar screen', () => {
  const rig = (o: { auren?: number; creative?: boolean; shelves?: number; roll?: number } = {}) => {
    const st = { auren: o.auren ?? 5000, spent: 0, done: 0, last: null as null | { glyph: number; rank: number; erase: boolean; fail?: boolean } };
    const inv = new Container(PLAYER_SLOTS);
    const menu = new EnchantMenu(inv, {
      shelves: o.shelves ?? 15,
      creative: () => !!o.creative,
      coins: () => st.auren,
      spend: (n) => {
        st.auren -= n;
        st.spent += n;
      },
      rand: () => o.roll ?? 0,
      done: (w) => {
        st.done++;
        st.last = w;
      },
    });
    return { st, inv, menu };
  };
  const put = (menu: EnchantMenu, slot: number, stack: ItemStack) => {
    menu.cursor = stack;
    menu.click(slot, 0);
  };

  it('offers nothing until a piece is in', () => {
    const { menu } = rig();
    expect(menu.options()).toEqual([]);
    put(menu, menu.itemSlot, sword());
    expect(menu.options().length).toBeGreaterThan(5);
  });

  it('takes only what can carry a glyph', () => {
    const { menu } = rig();
    put(menu, menu.itemSlot, makeStack(B.DIRT));
    expect(menu.item).toBeNull();
    expect(menu.cursor?.id).toBe(B.DIRT);
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

  it('fails by chance: the lapis and half the Auren are gone, the piece is as it was', () => {
    const { menu, inv, st } = rig({ roll: 0.99 });
    inv.set(0, makeStack(LAPIS, 10));
    put(menu, menu.itemSlot, sword());
    const o = menu.options().find((x) => x.def.id === ENCH.SHARPNESS)!;
    expect(o.chance).toBeLessThan(100);
    expect(menu.inscribe(ENCH.SHARPNESS)).toBe(true); // true: the attempt was made and paid
    expect(menu.item!.ench).toBeUndefined();
    expect(menu.lapis).toBe(10 - o.price.lapis);
    expect(st.spent).toBe(failedPrice(o.price).auren);
    expect(st.spent).toBeLessThan(o.price.auren);
    expect(st.last).toEqual({ glyph: ENCH.SHARPNESS, rank: 0, erase: false, fail: true });
    // It can be tried again at the same price, and a roll that takes writes the glyph.
    expect(menu.options().find((x) => x.def.id === ENCH.SHARPNESS)!.state).toBe('ok');
  });

  it('takes when the roll is under the chance, and fails at the chance and above', () => {
    for (const [roll, takes] of [[0, true], [0.5, true], [0.999, false]] as const) {
      const { menu, inv } = rig({ roll });
      inv.set(0, makeStack(LAPIS, 10));
      put(menu, menu.itemSlot, sword());
      const chance = menu.options().find((x) => x.def.id === ENCH.SHARPNESS)!.chance;
      menu.inscribe(ENCH.SHARPNESS);
      expect(!!menu.item!.ench).toBe(roll * 100 < chance);
      expect(!!menu.item!.ench).toBe(takes);
    }
  });

  it('never fails in creative, and a failure of a rank-up keeps the rank', () => {
    const c = rig({ creative: true, roll: 0.999 });
    put(c.menu, c.menu.itemSlot, sword());
    expect(c.menu.options().every((o) => o.chance === 100)).toBe(true);
    c.menu.inscribe(ENCH.SHARPNESS);
    expect(c.menu.item!.ench).toEqual([[ENCH.SHARPNESS, 1]]);
    const { menu, inv, st } = rig({ roll: 0.9999 });
    inv.set(0, makeStack(LAPIS, 20));
    put(menu, menu.itemSlot, sword([ENCH.SHARPNESS, 2]));
    menu.inscribe(ENCH.SHARPNESS);
    expect(menu.item!.ench).toEqual([[ENCH.SHARPNESS, 2]]);
    expect(st.last).toMatchObject({ rank: 2, fail: true });
  });

  it('inscribes for its lapis (from the bags) and its Auren, and says so', () => {
    const { menu, inv, st } = rig();
    inv.set(0, makeStack(LAPIS, 10));
    put(menu, menu.itemSlot, sword());
    const o = menu.options().find((x) => x.def.id === ENCH.SHARPNESS)!;
    expect(o.state).toBe('ok');
    expect(menu.inscribe(ENCH.SHARPNESS)).toBe(true);
    expect(menu.item!.ench).toEqual([[ENCH.SHARPNESS, 1]]);
    expect(menu.lapis).toBe(10 - o.price.lapis);
    expect(st.spent).toBe(o.price.auren);
    expect(st.done).toBe(1);
    // The same glyph again is a rank up, and costs the dearer price.
    const o2 = menu.options().find((x) => x.def.id === ENCH.SHARPNESS)!;
    expect(o2).toMatchObject({ have: 1, rank: 2, state: 'ok' });
    expect(o2.price.auren).toBeGreaterThan(o.price.auren);
    expect(menu.inscribe(ENCH.SHARPNESS)).toBe(true);
    expect(levelOf(menu.item, ENCH.SHARPNESS)).toBe(2);
  });

  it('refuses without the lapis, the Auren, the lore, a socket or a fitting piece, and takes nothing', () => {
    const noLapis = rig();
    put(noLapis.menu, noLapis.menu.itemSlot, sword());
    expect(noLapis.menu.inscribe(ENCH.SHARPNESS)).toBe(false);
    const poor = rig({ auren: 3 });
    poor.inv.set(0, makeStack(LAPIS, 10));
    put(poor.menu, poor.menu.itemSlot, sword());
    expect(poor.menu.inscribe(ENCH.SHARPNESS)).toBe(false);
    expect(poor.menu.lapis).toBe(10);
    const bare = rig({ shelves: 0 });
    bare.inv.set(0, makeStack(LAPIS, 10));
    put(bare.menu, bare.menu.itemSlot, sword());
    expect(bare.menu.inscribe(ENCH.FIRE_ASPECT)).toBe(false); // wants lore
    expect(bare.menu.inscribe(ENCH.EFFICIENCY)).toBe(false); // does not fit
    expect(bare.menu.inscribe(ENCH.MENDING)).toBe(false); // a treasure
    for (const id of [-1, 0, 1.5, NaN, 9999]) expect(bare.menu.inscribe(id)).toBe(false);
    expect(bare.menu.inscribe(ENCH.SHARPNESS)).toBe(true);
    expect(bare.menu.inscribe(ENCH.KNOCKBACK)).toBe(false); // no socket left
    expect(bare.menu.item!.ench).toEqual([[ENCH.SHARPNESS, 1]]);
  });

  it('is free in creative', () => {
    const { menu, st } = rig({ auren: 0, creative: true, shelves: 0 });
    put(menu, menu.itemSlot, sword());
    expect(menu.inscribe(ENCH.SHARPNESS)).toBe(true);
    expect(st.spent).toBe(0);
  });

  it('erases a glyph for nothing, freeing its socket', () => {
    const { menu, inv } = rig();
    inv.set(0, makeStack(LAPIS, 10));
    put(menu, menu.itemSlot, sword([ENCH.SHARPNESS, 2]));
    expect(menu.inscribe(ENCH.KNOCKBACK)).toBe(false);
    expect(menu.erase(ENCH.SHARPNESS)).toBe(true);
    expect(menu.item!.ench).toBeUndefined();
    expect(menu.erase(ENCH.SHARPNESS)).toBe(false);
    expect(menu.inscribe(ENCH.KNOCKBACK)).toBe(true);
  });

  it('turns a book into a Glyph Tome, and hands everything back on close', () => {
    const { menu, inv } = rig();
    inv.set(0, makeStack(LAPIS, 3));
    put(menu, menu.itemSlot, makeStack(I.BOOK));
    expect(menu.inscribe(ENCH.PROTECTION)).toBe(true);
    expect(menu.item!.id).toBe(I.ENCHANTED_BOOK);
    const back = menu.close();
    expect(back.some((s) => s.id === I.ENCHANTED_BOOK && s.ench)).toBe(true);
    expect(inv.countOf(LAPIS)).toBe(2);
  });

  it('shift-click sends one item to the altar and back', () => {
    const { menu, inv } = rig();
    inv.set(0, makeStack(I.BOOK, 3));
    menu.shiftClick(0);
    expect(menu.item?.count).toBe(1);
    expect(inv.get(0)?.count).toBe(2);
    menu.shiftClick(menu.itemSlot);
    expect(menu.item).toBeNull();
    expect(inv.countOf(I.BOOK)).toBe(3);
  });

  it('takes the shelves a server counted', () => {
    const { menu } = rig({ shelves: 0 });
    menu.adopt(7);
    expect(menu.shelves).toBe(7);
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
    const left: ItemStack = { ...makeStack(toolId('sword', 'diamond'), 1, 500), gear: { r: 3, l: 1, s: [['might', 3]] } };
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

  it('opens from the block, inscribes over the command channel and takes the price', () => {
    const { s, world } = make(7, () => 0); // a roll that always takes
    const { tx, ty, tz } = table(s, world);
    expect(s.useBlock(tx, ty, tz)).toBe(true);
    expect(s.screen).toBe('enchant');
    const menu = s.menu as EnchantMenu;
    expect(menu.shelves).toBe(MAX_SHELVES);
    s.inventory.set(0, sword());
    s.inventory.set(1, makeStack(LAPIS, 6));
    s.apply({ t: 'shift', slot: 0 });
    expect(menu.item).not.toBeNull();
    s.addCoins(500);
    const o = menu.options().find((x) => x.def.id === ENCH.SHARPNESS)!;
    s.apply({ t: 'enchant', id: ENCH.SHARPNESS });
    expect(menu.item!.ench).toEqual([[ENCH.SHARPNESS, 1]]);
    expect(s.coins).toBe(500 - o.price.auren);
    expect(s.inventory.countOf(LAPIS)).toBe(6 - o.price.lapis);
    // Closing gives the item back to the inventory, glyph and all.
    s.apply({ t: 'closeMenu' });
    expect(s.screen).toBe('none');
    const found = [...Array(PLAYER_SLOTS).keys()].map((i) => s.inventory.get(i)).find((x) => x?.id === toolId('sword', 'iron'));
    expect(found?.ench).toEqual([[ENCH.SHARPNESS, 1]]);
  });

  it('will not take a price that is not there, and erases for nothing', () => {
    const { s, world } = make(7, () => 0); // a roll that always takes
    const { tx, ty, tz } = table(s, world);
    s.useBlock(tx, ty, tz);
    const menu = s.menu as EnchantMenu;
    s.inventory.set(0, sword());
    s.apply({ t: 'shift', slot: 0 });
    s.apply({ t: 'enchant', id: ENCH.SHARPNESS });
    expect(menu.item!.ench).toBeUndefined(); // no lapis, no coins
    s.inventory.set(1, makeStack(LAPIS, 6));
    s.addCoins(500);
    s.apply({ t: 'enchant', id: ENCH.SHARPNESS });
    expect(menu.item!.ench).toBeDefined();
    const coins = s.coins;
    s.apply({ t: 'enchant', id: ENCH.SHARPNESS, erase: true });
    expect(menu.item!.ench).toBeUndefined();
    expect(s.coins).toBe(coins);
  });

  it('tells what was inscribed or erased, for the sound of it', () => {
    const { s, world } = make(7, () => 0); // a roll that always takes
    const { tx, ty, tz } = table(s, world);
    s.useBlock(tx, ty, tz);
    s.inventory.set(0, sword());
    s.inventory.set(1, makeStack(LAPIS, 20));
    s.apply({ t: 'shift', slot: 0 });
    s.addCoins(2000);
    s.drainEvents();
    s.apply({ t: 'enchant', id: ENCH.SHARPNESS });
    s.apply({ t: 'enchant', id: ENCH.SHARPNESS });
    s.apply({ t: 'enchant', id: ENCH.SHARPNESS, erase: true });
    expect(s.drainEvents().filter((e) => e.t === 'enchant')).toEqual([
      { t: 'enchant', glyph: ENCH.SHARPNESS, rank: 1 },
      { t: 'enchant', glyph: ENCH.SHARPNESS, rank: 2 },
      { t: 'enchant', glyph: ENCH.SHARPNESS, rank: 0, erase: true },
    ]);
  });

  it('ignores the command when no altar is open', () => {
    const { s } = make();
    s.apply({ t: 'enchant', id: ENCH.SHARPNESS });
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

  it('refuses a command that is not a glyph id', () => {
    expect(parseSessionMessage({ t: 'cmd' })).toBeNull();
    expect(parseSessionMessage({ t: 'enchant', id: 7 })).toEqual({ t: 'enchant', id: 7 });
    expect(parseSessionMessage({ t: 'enchant', id: 7, erase: true })).toEqual({ t: 'enchant', id: 7, erase: true });
    for (const id of [-1, 0, 256, 1.5, '1', null, NaN, Infinity]) expect(parseSessionMessage({ t: 'enchant', id })).toBeNull();
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

  it('can be Renewal, which no altar offers', () => {
    const seen = new Set<number>();
    const rand = mulberry32(2);
    for (let i = 0; i < 1500; i++) seen.add(randomEnchantedBook(rand).ench![0][0]);
    expect(seen.has(ENCH.MENDING)).toBe(true);
    for (const o of glyphOptions(makeStack(toolId('pickaxe', 'diamond')), { shelves: 15, lapis: 99, auren: 99999 })) expect(o.def.id).not.toBe(ENCH.MENDING);
  });

  it('moves a tomes Temper onto a shield, and explains when a tome cannot be used', () => {
    const tome: ItemStack = { id: I.ENCHANTED_BOOK, count: 1, damage: 0, ench: [[ENCH.UNBREAKING, 1]] };
    const shield: ItemStack = { id: I.SHIELD, count: 1, damage: 0 };
    expect(anvilResult(shield, tome)?.result.ench).toEqual([[ENCH.UNBREAKING, 1]]);
    expect(tomeBlocked(shield, tome)).toBeNull();
    const sharp: ItemStack = { id: I.ENCHANTED_BOOK, count: 1, damage: 0, ench: [[ENCH.SHARPNESS, 1]] };
    expect(anvilResult(shield, sharp)).toBeNull();
    expect(tomeBlocked(shield, sharp)).toMatch(/None of this tome/);
    const full: ItemStack = { ...shield, ench: [[ENCH.VIGOR, 1]] };
    expect(tomeBlocked(full, tome)).toMatch(/no free glyph socket/);
  });
});
