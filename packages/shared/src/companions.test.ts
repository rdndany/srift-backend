import { describe, expect, it } from 'vitest';
import {
  B,
  COMPANIONS,
  CraftingMenu,
  GameSession,
  HeadlessWorld,
  I,
  RECIPES,
  TILE_NAMES,
  WorldGenerator,
  categoryOf,
  companionBonusText,
  companionItemId,
  companionOfItem,
  findRecipe,
  getItem,
  isUndroppable,
  makeStack,
  mulberry32,
  parsePlayerSave,
  tooltipLines,
  tooltipName,
  sheetOfSave,
  type InputFrame,
  type ItemStack,
  type SessionEvent,
} from './index';

const idle = (over: Partial<InputFrame> = {}): InputFrame => ({ t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false, ...over });

function make() {
  const generator = new WorldGenerator(1337);
  const world = new HeadlessWorld(generator);
  for (let x = -32; x <= 48; x++)
    for (let z = -32; z <= 48; z++) {
      for (let y = 101; y < 120; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, 100, z, B.STONE);
    }
  const s = new GameSession({ seed: 1337, world, generator, naturalSpawning: false, rand: mulberry32(5), mode: 'survival', classId: 'mage' });
  s.finishLoading();
  s.cls!.level = 10;
  s.teleport(8.5, 101, 8.5, 0, 0);
  s.drainEvents();
  return s;
}

const toasts = (s: GameSession): string[] => s.drainEvents().flatMap((e: SessionEvent) => (e.t === 'toast' ? [e.text] : []));
const slotAt = (s: GameSession, i: number) => s.menu!.slots.findIndex((x) => x.container === s.inventory && x.index === i && x.kind === 'normal');
const grid = (ids: (number | null)[]): (ItemStack | null)[] => ids.map((id) => (id ? makeStack(id, 1) : null));
const p = (s: GameSession) => s as unknown as { afterArmor(n: number): number; companionMight: number; companionNumber: number };

describe('the companions are items', () => {
  it('have an item each, in the order of the list, with a picture of their own', () => {
    expect(COMPANIONS.map((c) => c.id)).toEqual(['cinder-imp', 'dawn-seraph']);
    COMPANIONS.forEach((c, i) => {
      const id = companionItemId(c.id);
      expect(id).toBe(I.COMPANION_BASE + i);
      expect(companionOfItem(id)?.id).toBe(c.id);
      const item = getItem(id);
      expect(item.maxStack).toBe(1);
      expect(item.use).toBe('companion');
      expect(item.kind).toBe('Companion');
      expect(TILE_NAMES[item.tile]).toBe(`companion_${c.id}`);
      expect(categoryOf(makeStack(id, 1))).toBe('bag');
      expect(isUndroppable(id)).toBe(false);
    });
    expect(companionOfItem(I.COMPANION_BASE + COMPANIONS.length)).toBeNull();
    expect(companionOfItem(I.BREAD)).toBeNull();
    expect(() => companionItemId('nope')).toThrow();
  });

  it('say what they give on the tooltip', () => {
    const imp = companionItemId('cinder-imp');
    expect(tooltipName(makeStack(imp, 1))).toBe('Cinder Imp');
    const lines = tooltipLines(makeStack(imp, 1)).map((l) => l.text);
    expect(lines[1]).toBe('Companion');
    expect(lines).toContain('+10% damage dealt');
    expect(lines).toContain('Right-click to put it in the companion slot');
    expect(companionBonusText(COMPANIONS[1])).toBe('-10% damage taken');
  });

  it('use pictures that exist for their parts too', () => {
    for (const id of [I.IMP_HORN, I.CINDER_HEART, I.SERAPH_FEATHER, I.HALO_RING]) {
      const item = getItem(id);
      expect(item.kind).toBe('Material');
      expect(TILE_NAMES[item.tile]).toBe(item.name);
    }
  });
});

describe('crafting them', () => {
  it('makes the parts from what is gathered', () => {
    expect(findRecipe(grid([I.BONE, I.BONE, I.GUNPOWDER, I.FLINT]), 2, 2)).toMatchObject({ result: { id: I.IMP_HORN, count: 2 } });
    expect(findRecipe(grid([I.REDSTONE, I.COAL, I.REDSTONE, I.COAL, I.GOLD_INGOT, I.COAL, I.REDSTONE, I.COAL, I.REDSTONE]), 3, 3)?.result.id).toBe(I.CINDER_HEART);
    expect(findRecipe(grid([I.FEATHER, I.FEATHER, I.FEATHER, B.GLOWSTONE]), 2, 2)).toMatchObject({ result: { id: I.SERAPH_FEATHER, count: 2 } });
    expect(findRecipe(grid([null, I.GOLD_INGOT, null, I.GOLD_INGOT, null, I.GOLD_INGOT, null, I.GOLD_INGOT, null]), 3, 3)?.result.id).toBe(I.HALO_RING);
  });

  it('makes each companion from its parts, a jewel and diamonds, at a crafting table', () => {
    const imp = findRecipe(grid([I.IMP_HORN, null, I.IMP_HORN, I.DIAMOND, I.CINDER_HEART, I.DIAMOND, null, I.JEWEL_RIFT, null]), 3, 3);
    expect(imp?.result.id).toBe(companionItemId('cinder-imp'));
    const seraph = findRecipe(grid([null, I.HALO_RING, null, I.SERAPH_FEATHER, I.JEWEL_DAWN, I.SERAPH_FEATHER, I.DIAMOND, null, I.DIAMOND]), 3, 3);
    expect(seraph?.result.id).toBe(companionItemId('dawn-seraph'));
    // Not out of the wrong jewel.
    expect(findRecipe(grid([I.IMP_HORN, null, I.IMP_HORN, I.DIAMOND, I.CINDER_HEART, I.DIAMOND, null, I.JEWEL_DAWN, null]), 3, 3)).toBeNull();
  });

  it('has one recipe for each part and companion', () => {
    for (const id of [I.IMP_HORN, I.CINDER_HEART, I.SERAPH_FEATHER, I.HALO_RING, ...COMPANIONS.map((c) => companionItemId(c.id))]) {
      expect(RECIPES.filter((r) => r.result.id === id)).toHaveLength(1);
    }
  });
});

describe('the companion slot', () => {
  it('takes a companion from the hotbar with a right-click', () => {
    const s = make();
    const id = companionItemId('cinder-imp');
    s.inventory.set(0, makeStack(id, 1));
    s.apply({ t: 'select', slot: 0 });
    s.drainEvents();
    s.tick(idle({ right: true }));
    s.tick(idle());
    expect(s.companionSlot.get(0)?.id).toBe(id);
    expect(s.inventory.get(0)).toBeNull();
    expect(p(s).companionNumber).toBe(1);
    expect(toasts(s).join(' ')).toContain('Cinder Imp follows you');
  });

  it('stays in the bag below level 10, and one already worn comes off and gives nothing', () => {
    const s = make();
    s.cls!.level = 1;
    const id = companionItemId('cinder-imp');
    s.inventory.set(0, makeStack(id, 1));
    s.apply({ t: 'select', slot: 0 });
    s.drainEvents();
    s.tick(idle({ right: true }));
    expect(s.companionSlot.get(0)).toBeNull();
    expect(s.inventory.get(0)?.id).toBe(id);
    expect(toasts(s).join(' ')).toContain('Requires level 10');
    s.companionSlot.set(0, makeStack(id, 1));
    expect(p(s).companionMight).toBe(1);
    s.tick(idle());
    expect(s.companionSlot.get(0)).toBeNull();
  });

  it('swaps with the one that is there when a right-click in the bags puts another in', () => {
    const s = make();
    s.companionSlot.set(0, makeStack(companionItemId('cinder-imp'), 1));
    s.inventory.set(15, makeStack(companionItemId('dawn-seraph'), 1));
    s.apply({ t: 'inventory' });
    s.apply({ t: 'click', slot: slotAt(s, 15), button: 1 });
    expect(p(s).companionNumber).toBe(2);
    expect(s.inventory.get(15)?.id).toBe(companionItemId('cinder-imp'));
    expect(s.menu!.cursor).toBeNull();
  });

  it('is a slot of the inventory window right after the outfit slot, that takes companions and nothing else, and shift-click fills it', () => {
    const s = make();
    s.inventory.set(0, makeStack(I.BREAD, 1));
    s.inventory.set(1, makeStack(companionItemId('dawn-seraph'), 1));
    s.apply({ t: 'inventory' });
    const menu = s.menu as CraftingMenu;
    expect(menu.companionSlot).toBe(menu.outfitSlot + 1);
    s.apply({ t: 'click', slot: slotAt(s, 0), button: 0 });
    s.apply({ t: 'click', slot: menu.companionSlot, button: 0 });
    expect(s.companionSlot.get(0)).toBeNull();
    s.apply({ t: 'click', slot: slotAt(s, 0), button: 0 }); // (put the bread back)
    s.apply({ t: 'shift', slot: slotAt(s, 1) });
    expect(p(s).companionNumber).toBe(2);
  });

  it('gives its bonus: the imp makes blows land harder and the seraph softens the ones that land on you', () => {
    const s = make();
    expect(p(s).companionMight).toBe(1);
    const bare = p(s).afterArmor(10);
    s.companionSlot.set(0, makeStack(companionItemId('cinder-imp'), 1));
    expect(p(s).companionMight).toBeCloseTo(1.1);
    expect(p(s).afterArmor(10)).toBeCloseTo(bare);
    s.companionSlot.set(0, makeStack(companionItemId('dawn-seraph'), 1));
    expect(p(s).companionMight).toBe(1);
    expect(p(s).afterArmor(10)).toBeCloseTo(bare * 0.9);
  });

  it('is saved with the hero, and a hostile save cannot put a stack or a plain item in it', () => {
    const s = make();
    s.companionSlot.set(0, makeStack(companionItemId('dawn-seraph'), 1));
    const saved = JSON.parse(JSON.stringify(s.savePlayer()));
    expect(saved.companionSlot).toBeTruthy();
    const back = make();
    back.loadPlayer(parsePlayerSave(saved)!);
    expect(p(back).companionNumber).toBe(2);
    expect(sheetOfSave(parsePlayerSave(saved)!, 'mage').companion?.id).toBe(companionItemId('dawn-seraph'));

    const stacked = { ...saved, companionSlot: [[companionItemId('cinder-imp'), 9, 0]] };
    const a = make();
    a.loadPlayer(parsePlayerSave(stacked)!);
    expect(a.companionSlot.get(0)?.count).toBe(1);
    const plain = { ...saved, companionSlot: [[I.BREAD, 1, 0]] };
    const b = make();
    b.loadPlayer(parsePlayerSave(plain)!);
    expect(b.companionSlot.get(0)).toBeNull();
    expect(p(b).companionNumber).toBe(0);
  });
});
