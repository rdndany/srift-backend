import { describe, expect, it } from 'vitest';
import {
  ARMOR_DEFENSE,
  ARMOR_MATERIALS,
  ARMOR_SLOTS,
  ATLAS_COLS,
  ATLAS_ROWS,
  B,
  Container,
  CraftingMenu,
  GameSession,
  HeadlessWorld,
  I,
  MAX_DEFENSE,
  TILE_NAMES,
  WorldGenerator,
  armorDef,
  armorId,
  armorReduction,
  armorWear,
  findRecipe,
  getItem,
  makeStack,
  mulberry32,
  parsePlayerSave,
  reduceDamage,
  type InputFrame,
  type SessionEvent,
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

const wear = (s: GameSession, material: (typeof ARMOR_MATERIALS)[number]) =>
  ARMOR_SLOTS.forEach((_, i) => s.armor.set(i, makeStack(armorId(i, material))));

describe('the armor numbers', () => {
  it('match the original: defense per piece and per set', () => {
    const total = (m: (typeof ARMOR_MATERIALS)[number]) => ARMOR_DEFENSE[m].reduce((a, b) => a + b, 0);
    expect(total('leather')).toBe(7);
    expect(total('gold')).toBe(11);
    expect(total('iron')).toBe(15);
    expect(total('diamond')).toBe(20);
    expect(total('diamond')).toBe(MAX_DEFENSE);
  });

  it('durability is the material multiplier times the slot base', () => {
    expect(armorDef(0, 'leather').durability).toBe(55);
    expect(armorDef(1, 'iron').durability).toBe(240);
    expect(armorDef(2, 'diamond').durability).toBe(495);
    expect(armorDef(3, 'gold').durability).toBe(91);
  });

  it('every piece is a one-of-a-kind item that knows its slot', () => {
    const ids = new Set<number>();
    for (const m of ARMOR_MATERIALS) {
      ARMOR_SLOTS.forEach((slot, i) => {
        const id = armorId(i, m);
        ids.add(id);
        const item = getItem(id);
        expect(item.name).toBe(`${m}_${slot}`);
        expect(item.maxStack).toBe(1);
        expect(item.armor?.slotIndex).toBe(i);
        expect(item.durability).toBe(armorDef(i, m).durability);
      });
    }
    expect(ids.size).toBe(16);
    expect(getItem(I.LEATHER).name).toBe('leather');
  });

  it('all of the art fits in the texture atlas', () => {
    expect(TILE_NAMES.length).toBeLessThanOrEqual(ATLAS_COLS * ATLAS_ROWS);
    expect(new Set(TILE_NAMES).size).toBe(TILE_NAMES.length);
  });

  it('reduces damage with the original formula', () => {
    expect(reduceDamage(5, 0)).toBe(5);
    expect(armorReduction(5, 15)).toBeCloseTo(0.5); // iron set: (15 - 5/2) / 25
    expect(reduceDamage(5, 15)).toBeCloseTo(2.5);
    expect(reduceDamage(5, 7)).toBeCloseTo(5 * (1 - 4.5 / 25)); // leather set
    expect(reduceDamage(5, 20, 8)).toBeCloseTo(1.25); // diamond set, toughness 8
    // A tiny hit is almost fully absorbed; a huge one still gets at least a fifth of the defense.
    expect(armorReduction(0.5, 20)).toBeCloseTo(19.75 / 25);
    expect(armorReduction(1000, 20, 8)).toBeCloseTo(4 / 25);
    expect(armorReduction(1, 100)).toBeLessThanOrEqual(0.8);
    expect(reduceDamage(0, 20)).toBe(0);
  });

  it('wear is a quarter of the damage, at least 1', () => {
    expect(armorWear(1)).toBe(1);
    expect(armorWear(3)).toBe(1);
    expect(armorWear(4)).toBe(1);
    expect(armorWear(8)).toBe(2);
    expect(armorWear(22)).toBe(5);
  });
});

describe('crafting armor', () => {
  const grid = (rows: string[], m: number) => rows.flatMap((r) => [...r].map((c) => (c === 'M' ? makeStack(m) : null)));
  const cases: [string[], number][] = [
    [['MMM', 'M M', '   '], 0],
    [['M M', 'MMM', 'MMM'], 1],
    [['MMM', 'M M', 'M M'], 2],
    [['   ', 'M M', 'M M'], 3],
  ];
  const stuff = { leather: I.LEATHER, gold: I.GOLD_INGOT, iron: I.IRON_INGOT, diamond: I.DIAMOND } as const;

  it('uses 5, 8, 7 and 4 pieces of the material', () => {
    for (const m of ARMOR_MATERIALS) {
      for (const [rows, slot] of cases) {
        expect(findRecipe(grid(rows, stuff[m]), 3, 3)?.result.id, `${m} ${ARMOR_SLOTS[slot]}`).toBe(armorId(slot, m));
      }
    }
  });

  it('a boots pattern also works shifted, and nonsense makes nothing', () => {
    expect(findRecipe(grid(['M M', 'M M', '   '], I.IRON_INGOT), 3, 3)?.result.id).toBe(armorId(3, 'iron'));
    expect(findRecipe(grid(['MMM', 'MMM', 'MMM'], I.IRON_INGOT), 3, 3)).toBeNull();
    expect(findRecipe(grid(['MMM', '   ', '   '], I.LEATHER), 3, 3)).toBeNull();
  });
});

describe('wearing armor', () => {
  it('right-click puts the held piece on and swaps what was there', () => {
    const { s } = make();
    s.inventory.set(0, makeStack(armorId(0, 'iron')));
    s.selectSlot(0);
    s.drainEvents();
    s.tick(idle({ right: true }));
    expect(s.armor.get(0)?.id).toBe(armorId(0, 'iron'));
    expect(s.inventory.get(0)).toBeNull();
    expect(s.defense).toBe(2);
    expect(s.drainEvents().some((e: SessionEvent) => e.t === 'equip')).toBe(true);

    // A second helmet swaps with the first.
    s.inventory.set(0, makeStack(armorId(0, 'diamond')));
    s.tick(idle({ right: false }));
    s.tick(idle({ right: true }));
    expect(s.armor.get(0)?.id).toBe(armorId(0, 'diamond'));
    expect(s.inventory.get(0)?.id).toBe(armorId(0, 'iron'));
    expect(s.defense).toBe(3);
  });

  it('keeps the wear of a piece when it goes on and comes off', () => {
    const { s } = make();
    s.inventory.set(0, makeStack(armorId(1, 'iron'), 1, 100));
    s.selectSlot(0);
    s.equipHeld();
    expect(s.armor.get(1)?.damage).toBe(100);
  });

  it('only armor can be worn', () => {
    const { s } = make();
    s.inventory.set(0, makeStack(B.DIRT, 5));
    s.selectSlot(0);
    expect(s.equipHeld()).toBe(false);
    expect(s.defense).toBe(0);
  });

  it('a full set adds up', () => {
    const { s } = make();
    wear(s, 'diamond');
    expect(s.defense).toBe(20);
    expect(s.armorIds()).toEqual(ARMOR_SLOTS.map((_, i) => armorId(i, 'diamond')));
    s.armor.set(0, null);
    expect(s.defense).toBe(17);
    expect(s.armorIds()[0]).toBe(0);
  });
});

describe('taking hits in armor', () => {
  it('an iron set halves a hit; no armor takes all of it', () => {
    const bare = make();
    bare.s.hurtByMob(6, 0, 0, 'zombie');
    expect(bare.s.vitals.health).toBeCloseTo(14);

    const iron = make();
    wear(iron.s, 'iron');
    iron.s.hurtByMob(6, 0, 0, 'zombie');
    expect(iron.s.vitals.health).toBeCloseTo(20 - reduceDamage(6, 15));
    expect(iron.s.vitals.health).toBeGreaterThan(bare.s.vitals.health);
  });

  it('wears every piece down, and a piece that is used up breaks', () => {
    const { s } = make();
    wear(s, 'leather');
    s.armor.get(0)!.damage = 54; // one hit from breaking
    s.hurtByMob(3, 0, 0, 'zombie');
    expect(s.armor.get(0)).toBeNull();
    expect(s.armor.get(1)?.damage).toBe(1);
    expect(s.armor.get(2)?.damage).toBe(1);
    expect(s.armor.get(3)?.damage).toBe(1);
    expect(s.defense).toBe(6);
  });

  it('a hit that is ignored (just hurt) does not wear armor', () => {
    const { s } = make();
    wear(s, 'iron');
    s.hurtByMob(3, 0, 0, 'zombie');
    const w = s.armor.get(1)!.damage;
    s.hurtByMob(3, 0, 0, 'zombie'); // inside the hurt cooldown
    expect(s.armor.get(1)!.damage).toBe(w);
  });

  it('explosions are softened too', () => {
    const bare = make();
    const worn = make();
    wear(worn.s, 'diamond');
    for (const { s } of [bare, worn]) s.hurtByExplosion(CX + 0.5 + 1, FLOOR + 1, CZ + 0.5, 3, 'creeper');
    expect(worn.s.vitals.health).toBeGreaterThan(bare.s.vitals.health);
    expect(worn.s.armor.get(1)!.damage).toBeGreaterThan(0);
  });

  it('falling, drowning and starving ignore armor', () => {
    const { s } = make();
    wear(s, 'diamond');
    s.vitals.damage(4, 'fall');
    expect(s.vitals.health).toBe(16);
    expect(s.armor.get(1)!.damage).toBe(0);
  });

  it('creative players take nothing and wear nothing out', () => {
    const { s } = make();
    wear(s, 'iron');
    s.setMode('creative');
    s.hurtByMob(10, 0, 0, 'zombie');
    expect(s.vitals.health).toBe(20);
    expect(s.armor.get(1)!.damage).toBe(0);
  });

  it('dying keeps the armor on, a little worn, and drops nothing', () => {
    const { s } = make();
    wear(s, 'gold');
    s.vitals.damage(100, 'generic');
    s.tick(idle());
    expect(s.screen).toBe('dead');
    for (let i = 0; i < 4; i++) {
      const piece = s.armor.get(i);
      expect(piece).not.toBeNull();
      expect(piece!.damage).toBeGreaterThan(0);
      expect(piece!.damage).toBeLessThan(getItem(piece!.id).durability);
    }
    expect(s.drops.count).toBe(0);
  });
});

describe('the inventory screen', () => {
  const make2 = () => {
    const inv = new Container(36);
    const armor = new Container(4);
    return { inv, armor, menu: new CraftingMenu(inv, 2, armor) };
  };

  it('has four armor slots after the crafting result, and none at a crafting table', () => {
    const { menu } = make2();
    expect(menu.armorStart).toBe(menu.resultSlot + 1);
    expect(menu.slots.length).toBe(36 + 4 + 1 + 4);
    expect(new CraftingMenu(new Container(36), 3).armorStart).toBe(-1);
    expect(new CraftingMenu(new Container(36), 2).armorStart).toBe(-1);
  });

  it('takes only the right piece in each slot', () => {
    const { menu, armor } = make2();
    menu.cursor = makeStack(armorId(0, 'iron'));
    menu.click(menu.armorStart + 1, 0); // chestplate slot: refused
    expect(armor.get(1)).toBeNull();
    expect(menu.cursor?.id).toBe(armorId(0, 'iron'));
    menu.click(menu.armorStart, 0);
    expect(armor.get(0)?.id).toBe(armorId(0, 'iron'));
    expect(menu.cursor).toBeNull();
    menu.cursor = makeStack(B.DIRT, 4); // dirt is not armor
    menu.click(menu.armorStart, 0);
    expect(armor.get(0)?.id).toBe(armorId(0, 'iron'));
    expect(menu.cursor?.count).toBe(4);
  });

  it('swaps a worn piece for one on the cursor', () => {
    const { menu, armor } = make2();
    armor.set(3, makeStack(armorId(3, 'leather')));
    menu.cursor = makeStack(armorId(3, 'diamond'));
    menu.click(menu.armorStart + 3, 0);
    expect(armor.get(3)?.id).toBe(armorId(3, 'diamond'));
    expect(menu.cursor?.id).toBe(armorId(3, 'leather'));
  });

  it('shift-click puts a piece on, and takes it off again', () => {
    const { menu, inv, armor } = make2();
    inv.set(12, makeStack(armorId(2, 'gold')));
    menu.shiftClick(12);
    expect(armor.get(2)?.id).toBe(armorId(2, 'gold'));
    expect(inv.get(12)).toBeNull();
    menu.shiftClick(menu.armorStart + 2);
    expect(armor.get(2)).toBeNull();
    expect(inv.countOf(armorId(2, 'gold'))).toBe(1);
  });

  it('shift-click with that slot taken moves the piece around the inventory instead', () => {
    const { menu, inv, armor } = make2();
    armor.set(0, makeStack(armorId(0, 'iron')));
    inv.set(12, makeStack(armorId(0, 'gold')));
    menu.shiftClick(12);
    expect(armor.get(0)?.id).toBe(armorId(0, 'iron'));
    expect(inv.countOf(armorId(0, 'gold'))).toBe(1);
  });

  it('conserves items however you click', () => {
    const { menu, inv, armor } = make2();
    const rand = mulberry32(99);
    inv.set(0, makeStack(armorId(0, 'iron')));
    inv.set(1, makeStack(armorId(1, 'iron')));
    inv.set(2, makeStack(armorId(2, 'iron')));
    inv.set(3, makeStack(armorId(3, 'iron')));
    inv.set(4, makeStack(B.DIRT, 30));
    const before = menu.totalItems();
    for (let i = 0; i < 600; i++) {
      const slot = Math.floor(rand() * menu.slots.length);
      if (rand() < 0.3) menu.shiftClick(slot);
      else menu.click(slot, rand() < 0.5 ? 0 : 1);
      expect(menu.totalItems()).toBe(before);
    }
    for (let i = 0; i < 4; i++) {
      const s = armor.get(i);
      if (s) expect(getItem(s.id).armor?.slotIndex).toBe(i);
    }
  });
});

describe('saving armor', () => {
  const base = { v: 1, x: 1, y: 2, z: 3, yaw: 0, pitch: 0, mode: 'survival', selected: 0, inv: null, vitals: null, mobs: null };

  it('survives a save and a load, wear included', () => {
    const { s } = make();
    wear(s, 'iron');
    s.armor.get(1)!.damage = 17;
    const saved = parsePlayerSave(JSON.parse(JSON.stringify(s.savePlayer())))!;
    const { s: t } = make();
    t.loadPlayer(saved);
    expect(t.armorIds()).toEqual(s.armorIds());
    expect(t.armor.get(1)?.damage).toBe(17);
    expect(t.defense).toBe(15);
  });

  it('an old save has no armor', () => {
    const { s } = make();
    wear(s, 'iron');
    s.loadPlayer(parsePlayerSave(base)!);
    // Loading replaces what was worn with what the save says: nothing.
    expect(s.defense).toBe(0);
  });

  it('a hostile save cannot put the wrong piece in a slot or stack armor', () => {
    const { s } = make();
    const bad = [
      [armorId(1, 'diamond'), 1, 0], // a chestplate in the helmet slot
      [armorId(1, 'diamond'), 5, 0], // a stack of five chestplates
      [B.DIRT, 1, 0], // dirt in the leggings slot
      [armorId(3, 'gold'), 9999, 0],
    ];
    s.loadPlayer(parsePlayerSave({ ...base, armor: bad })!);
    expect(s.armor.get(0)).toBeNull();
    expect(s.armor.get(1)?.count).toBe(1);
    expect(s.armor.get(2)).toBeNull();
    expect(s.armor.get(3)?.count).toBe(1);
    expect(s.defense).toBe(8 + 1);
  });
});

describe('cows', () => {
  it('can drop leather', () => {
    const { s } = make(3);
    let leather = 0;
    for (let i = 0; i < 60; i++) {
      const id = s.spawnMob('cow', CX + 3.5, FLOOR + 1, CZ + 0.5);
      s.drops.drops.length = 0;
      s.damageMob(id, 100);
      for (const d of s.drops.drops) if (d.stack.id === I.LEATHER) leather += d.stack.count;
    }
    expect(leather).toBeGreaterThan(20);
    expect(leather).toBeLessThan(100);
  });
});
