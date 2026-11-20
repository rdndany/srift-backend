import { describe, expect, it } from 'vitest';
import {
  B,
  CLASSES,
  Container,
  CraftingMenu,
  GameSession,
  HeadlessWorld,
  I,
  WorldGenerator,
  computeStats,
  findRecipe,
  getItem,
  makeStack,
  mulberry32,
  offhandModifier,
  shopOf,
  tooltipLines,
  toolId,
  type ClassId,
  type InputFrame,
} from './index';

const SEED = 1337;
const FLOOR = 100;

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

function make(classId: ClassId | null) {
  const generator = new WorldGenerator(SEED);
  const world = new HeadlessWorld(generator);
  for (let x = -4; x <= 20; x++)
    for (let z = -4; z <= 20; z++) {
      for (let y = FLOOR + 1; y < FLOOR + 10; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, FLOOR, z, B.STONE);
    }
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(7), classId });
  s.finishLoading();
  s.teleport(8.5, FLOOR + 1, 8.5, 0, 0);
  s.drainEvents();
  return s;
}

describe('the orb', () => {
  it('is an off-hand item that is only held (no weapon, no armor, no shield, never worn out)', () => {
    const orb = getItem(I.ORB);
    expect(orb.name).toBe('orb');
    expect(orb.offhand).toBe(true);
    expect(orb.shield).toBe(false);
    expect(orb.weapon).toBeNull();
    expect(orb.armor).toBeNull();
    expect(orb.maxStack).toBe(1);
    expect(orb.durability).toBe(0);
  });

  it('is made from lapis around an ender pearl and sold by the Arcanist', () => {
    const grid = [0, I.LAPIS_LAZULI, 0, I.LAPIS_LAZULI, I.ENDER_PEARL, I.LAPIS_LAZULI, 0, I.LAPIS_LAZULI, 0].map((id) => (id ? makeStack(id) : null));
    expect(findRecipe(grid, 3, 3)?.result.id).toBe(I.ORB);
    expect(shopOf('lysa')!.stock.some((w) => w.id === I.ORB)).toBe(true);
  });
});

describe('what the off hand takes', () => {
  it('is a shield, an orb or a dagger, and nothing else', () => {
    for (const id of [I.SHIELD, I.ORB, I.DAGGER]) expect(getItem(id).offhand).toBe(true);
    for (const id of [toolId('sword', 'iron'), I.WAND, I.BOW, I.DIAMOND, I.SPELLBOOK]) expect(getItem(id).offhand).toBe(false);
  });

  it('is a slot on the inventory screen that accepts them, with shift-click to fill it', () => {
    const inv = new Container(36);
    const off = new Container(1);
    const menu = new CraftingMenu(inv, 2, new Container(4), off);
    menu.cursor = makeStack(I.WAND);
    menu.click(menu.offhandSlot, 0);
    expect(off.get(0)).toBeNull();
    menu.cursor = null;
    inv.set(2, makeStack(I.ORB));
    menu.shiftClick(2);
    expect(off.get(0)?.id).toBe(I.ORB);
    expect(inv.get(2)).toBeNull();
    menu.cursor = makeStack(I.DAGGER);
    menu.click(menu.offhandSlot, 0);
    // A click swaps them: the dagger goes in and the orb is on the cursor.
    expect(off.get(0)?.id).toBe(I.DAGGER);
    expect(menu.cursor?.id).toBe(I.ORB);
  });

  it('is filled by the swap key from the hand, for an orb and a dagger as well as a shield', () => {
    const s = make(null);
    s.inventory.set(s.selected, makeStack(I.ORB));
    s.apply({ t: 'swap' });
    expect(s.offhand.get(0)?.id).toBe(I.ORB);
    s.apply({ t: 'swap' });
    s.inventory.set(s.selected, makeStack(I.DAGGER));
    s.apply({ t: 'swap' });
    expect(s.offhand.get(0)?.id).toBe(I.DAGGER);
    s.apply({ t: 'swap' });
    s.inventory.set(s.selected, makeStack(I.WAND));
    s.apply({ t: 'swap' });
    expect(s.inventory.get(s.selected)?.id).toBe(I.WAND);
  });
});

describe('the class kits', () => {
  it('start the Warrior with a shield, the Mage with an orb and the Ranger with a dagger in the off hand', () => {
    expect(CLASSES.warrior.startingOffhand).toBe(I.SHIELD);
    expect(CLASSES.mage.startingOffhand).toBe(I.ORB);
    expect(CLASSES.ranger.startingOffhand).toBe(I.DAGGER);
    for (const id of ['warrior', 'mage', 'ranger'] as const) {
      const s = make(id);
      expect(s.offhand.get(0)?.id).toBe(CLASSES[id].startingOffhand);
      // It is in the off hand and no longer taking a place in the bags.
      expect(s.inventory.countOf(CLASSES[id].startingOffhand)).toBe(0);
      expect(CLASSES[id].startingKit.some((k) => k.id === CLASSES[id].startingOffhand)).toBe(true);
    }
  });

  it('start a classless character with an empty off hand', () => {
    expect(make(null).offhand.get(0)).toBeNull();
  });
});

describe('what the off hand adds to a class', () => {
  it('is a stronger spell and a deeper mana pool from the orb, and more critical hits from the dagger', () => {
    const orb = offhandModifier(I.ORB)!;
    const dagger = offhandModifier(I.DAGGER)!;
    expect(offhandModifier(I.SHIELD)).toBeNull();
    expect(offhandModifier(0)).toBeNull();
    const base = computeStats('mage', 1);
    const geared = computeStats('mage', 1, [orb]);
    expect(geared.damage.spell).toBeGreaterThan(base.damage.spell);
    expect(geared.maxResource).toBeGreaterThan(base.maxResource);
    expect(geared.damage.melee).toBe(base.damage.melee);
    const r = computeStats('ranger', 1);
    const rd = computeStats('ranger', 1, [dagger]);
    expect(rd.critChance).toBeGreaterThan(r.critChance);
    expect(rd.critDamage).toBeGreaterThan(r.critDamage);
  });

  it('follows the item: taking the orb out of the off hand takes its bonus away, and putting it back brings it back', () => {
    const s = make('mage');
    s.tick(idle());
    const withOrb = s.cls!.stats;
    expect(withOrb.damage.spell).toBe(computeStats('mage', 1, [offhandModifier(I.ORB)!]).damage.spell);
    expect(withOrb.maxResource).toBe(computeStats('mage', 1).maxResource + 20);
    const orb = s.offhand.get(0);
    s.offhand.set(0, null);
    s.tick(idle());
    expect(s.cls!.stats.damage.spell).toBe(computeStats('mage', 1).damage.spell);
    expect(s.cls!.stats.maxResource).toBe(computeStats('mage', 1).maxResource);
    s.offhand.set(0, orb);
    s.tick(idle());
    expect(s.cls!.stats.damage.spell).toBe(withOrb.damage.spell);
  });

  it('is kept when the character is saved and loaded', () => {
    const s = make('ranger');
    const t = make('ranger');
    t.offhand.set(0, null);
    t.loadPlayer(JSON.parse(JSON.stringify(s.savePlayer())));
    t.tick(idle());
    expect(t.offhand.get(0)?.id).toBe(I.DAGGER);
    expect(t.cls!.stats.critChance).toBeGreaterThan(computeStats('ranger', 1).critChance);
  });
});

describe('tooltips', () => {
  it('call the orb, the dagger and the class weapons Equipment, like the shield, and list what they do', () => {
    const kind = (id: number) => tooltipLines(makeStack(id))[1];
    for (const id of [I.SHIELD, I.ORB, I.DAGGER, I.WAND, I.STAFF, I.SPELLBOOK, I.GREATSWORD, I.CROSSBOW]) expect(kind(id)).toMatchObject({ text: 'Equipment' });
    const orb = tooltipLines(makeStack(I.ORB)).map((l) => l.text);
    expect(orb).toContain('+12% Spell Damage');
    expect(orb).toContain('Held in the off hand');
    expect(orb).not.toContain('Material');
    expect(tooltipLines(makeStack(I.WAND)).map((l) => l.text)).toContain('1.6 Spell Damage');
    expect(tooltipLines(makeStack(I.DAGGER)).map((l) => l.text)).toContain('+5% Critical Chance');
    expect(kind(I.DIAMOND)).toMatchObject({ text: 'Material' });
  });
});
