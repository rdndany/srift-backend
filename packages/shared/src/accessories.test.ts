import { describe, expect, it } from 'vitest';
import {
  ACCESSORY_KINDS,
  ACCESSORY_MATERIALS,
  ACCESSORY_STATS,
  ADVENTURE_SEED,
  CraftingMenu,
  GameSession,
  HeadlessWorld,
  I,
  RECIPES,
  STAT_INFO,
  TILE_NAMES,
  accessoryOfItem,
  categoryOf,
  findRecipe,
  getItem,
  makeGenerator,
  makeStack,
  mulberry32,
  necklaceId,
  parsePlayerSave,
  ringId,
  sheetOfSave,
  tooltipLines,
  type InputFrame,
  type ItemStack,
} from './index';

const generator = makeGenerator(ADVENTURE_SEED, 'adventure');
const idle = (over: Partial<InputFrame> = {}): InputFrame => ({ t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: -1.4, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false, ...over });

function make(classId: 'warrior' | 'mage' | 'ranger' = 'warrior') {
  const world = new HeadlessWorld(generator);
  const s = new GameSession({ seed: ADVENTURE_SEED, world, generator, naturalSpawning: false, rand: mulberry32(5), classId, mode: 'survival' });
  s.finishLoading();
  s.clearInventory();
  s.drainEvents();
  return s;
}

const slotAt = (s: GameSession, i: number) => s.menu!.slots.findIndex((x) => x.container === s.inventory && x.index === i && x.kind === 'normal');
const grid = (ids: (number | null)[]): (ItemStack | null)[] => ids.map((id) => (id ? makeStack(id, 1) : null));

describe('rings and necklaces are items', () => {
  it('have a ring and a necklace of each material, with a picture of their own', () => {
    expect(ACCESSORY_MATERIALS).toEqual(['leather', 'iron', 'gold', 'diamond']);
    const seen = new Set<number>();
    for (const kind of ACCESSORY_KINDS) {
      ACCESSORY_MATERIALS.forEach((material, i) => {
        const id = kind === 'ring' ? ringId(material) : necklaceId(material);
        expect(id).toBe((kind === 'ring' ? I.RING_BASE : I.NECKLACE_BASE) + i);
        expect(seen.has(id)).toBe(false);
        seen.add(id);
        const def = accessoryOfItem(id);
        expect(def).toMatchObject({ kind, material });
        const item = getItem(id);
        expect(item.maxStack).toBe(1);
        expect(item.use).toBe('accessory');
        expect(item.kind).toBe(kind === 'ring' ? 'Ring' : 'Necklace');
        expect(TILE_NAMES[item.tile]).toBe(`${material}_${kind}`);
        expect(categoryOf(makeStack(id, 1))).toBe('armor');
      });
    }
    expect(accessoryOfItem(I.RING_BASE + ACCESSORY_MATERIALS.length)).toBeNull();
    expect(accessoryOfItem(I.BREAD)).toBeNull();
  });

  it('grow stronger with the material and stay under the cap of every stat', () => {
    for (const kind of ACCESSORY_KINDS) {
      const total = ACCESSORY_MATERIALS.map((m) => ACCESSORY_STATS[kind][m].reduce((n, [, v]) => n + v, 0));
      for (let i = 1; i < total.length; i++) expect(total[i]).toBeGreaterThan(total[i - 1]);
      for (const m of ACCESSORY_MATERIALS) for (const [stat, v] of ACCESSORY_STATS[kind][m]) expect(v).toBeLessThanOrEqual(STAT_INFO[stat].cap);
    }
  });

  it('say what they give in the tooltip', () => {
    const lines = tooltipLines(makeStack(ringId('iron'), 1), 'warrior').map((l) => l.text);
    expect(lines[0]).toBe('Iron Ring');
    expect(lines[1]).toBe('Ring');
    expect(lines.join('\n')).toContain('+6 Health');
    expect(lines.join('\n')).toContain('-2% Damage Taken');
    const neck = tooltipLines(makeStack(necklaceId('gold'), 1), 'mage').map((l) => l.text).join('\n');
    expect(neck).toContain('Maximum Mana');
  });
});

describe('crafting them', () => {
  it('makes a ring from four pieces of the material around a thread, and a necklace from four strings and one piece', () => {
    const mats = { leather: I.LEATHER, iron: I.IRON_INGOT, gold: I.GOLD_INGOT, diamond: I.DIAMOND };
    for (const m of ACCESSORY_MATERIALS) {
      const x = mats[m];
      expect(findRecipe(grid([null, x, null, x, I.STRING, x, null, x, null]), 3, 3)?.result.id).toBe(ringId(m));
      expect(findRecipe(grid([I.STRING, null, I.STRING, I.STRING, null, I.STRING, null, x, null]), 3, 3)?.result.id).toBe(necklaceId(m));
      expect(RECIPES.filter((r) => r.result.id === ringId(m))).toHaveLength(1);
      expect(RECIPES.filter((r) => r.result.id === necklaceId(m))).toHaveLength(1);
    }
  });
});

describe('the jewelry slots', () => {
  it('put a ring on with a right-click in the bags: the first free ring slot, then the first one is swapped', () => {
    const s = make();
    s.inventory.set(0, makeStack(ringId('leather'), 1));
    s.inventory.set(1, makeStack(ringId('iron'), 1));
    s.inventory.set(2, makeStack(ringId('gold'), 1));
    s.apply({ t: 'inventory' });
    s.apply({ t: 'click', slot: slotAt(s, 0), button: 1 });
    expect(s.accessories.get(0)?.id).toBe(ringId('leather'));
    expect(s.accessories.get(1)).toBeNull();
    s.apply({ t: 'click', slot: slotAt(s, 1), button: 1 });
    expect(s.accessories.get(1)?.id).toBe(ringId('iron'));
    s.apply({ t: 'click', slot: slotAt(s, 2), button: 1 });
    expect(s.accessories.get(0)?.id).toBe(ringId('gold'));
    expect(s.accessories.get(1)?.id).toBe(ringId('iron'));
    expect(s.inventory.get(2)?.id).toBe(ringId('leather'));
  });

  it('wear a ring from the hotbar with a right-click, and a necklace into its own slot', () => {
    const s = make();
    s.inventory.set(0, makeStack(necklaceId('iron'), 1));
    s.apply({ t: 'select', slot: 0 });
    s.drainEvents();
    s.tick(idle({ right: true }));
    s.tick(idle());
    expect(s.accessories.get(2)?.id).toBe(necklaceId('iron'));
    expect(s.accessories.get(0)).toBeNull();
    expect(s.inventory.get(0)).toBeNull();
  });

  it('are three slots of the inventory window after the wing slot, each taking its own kind, and shift-click fills them', () => {
    const s = make();
    s.inventory.set(0, makeStack(I.BREAD, 1));
    s.inventory.set(1, makeStack(ringId('diamond'), 1));
    s.inventory.set(2, makeStack(necklaceId('diamond'), 1));
    s.inventory.set(3, makeStack(ringId('gold'), 1));
    s.apply({ t: 'inventory' });
    const menu = s.menu as CraftingMenu;
    expect(menu.accessoryStart).toBe(menu.wingSlot + 1);
    // Bread on the cursor goes into none of them; a necklace does not go into a ring slot.
    s.apply({ t: 'click', slot: slotAt(s, 0), button: 0 });
    for (let i = 0; i < 3; i++) s.apply({ t: 'click', slot: menu.accessoryStart + i, button: 0 });
    expect(s.accessories.isEmpty()).toBe(true);
    s.apply({ t: 'click', slot: slotAt(s, 0), button: 0 });
    s.apply({ t: 'click', slot: slotAt(s, 2), button: 0 });
    s.apply({ t: 'click', slot: menu.accessoryStart, button: 0 });
    expect(s.accessories.get(0)).toBeNull();
    s.apply({ t: 'click', slot: menu.accessoryStart + 2, button: 0 });
    expect(s.accessories.get(2)?.id).toBe(necklaceId('diamond'));
    s.apply({ t: 'shift', slot: slotAt(s, 1) });
    s.apply({ t: 'shift', slot: slotAt(s, 3) });
    expect(s.accessories.get(0)?.id).toBe(ringId('diamond'));
    expect(s.accessories.get(1)?.id).toBe(ringId('gold'));
  });

  it('are not on a crafting table', () => {
    const s = make();
    expect(new CraftingMenu(s.inventory, 3).accessoryStart).toBe(-1);
  });
});

describe('what they give', () => {
  it('raises the stats of the class while worn, and a second ring counts too', () => {
    const s = make('warrior');
    const plain = s.cls!.stats.maxHealth;
    s.accessories.set(0, makeStack(ringId('diamond'), 1));
    s.tick(idle());
    const one = s.cls!.stats.maxHealth;
    expect(one).toBeGreaterThan(plain);
    s.accessories.set(1, makeStack(ringId('diamond'), 1));
    s.tick(idle());
    expect(s.cls!.stats.maxHealth).toBeGreaterThan(one);
    expect(s.vitals.maxHealth).toBe(Math.round(s.cls!.stats.maxHealth));
    s.accessories.set(0, null);
    s.accessories.set(1, null);
    s.tick(idle());
    expect(s.cls!.stats.maxHealth).toBe(plain);
  });

  it('a necklace deepens the pool of the class resource', () => {
    const s = make('mage');
    const plain = s.cls!.stats.maxResource;
    s.accessories.set(2, makeStack(necklaceId('diamond'), 1));
    s.tick(idle());
    expect(s.cls!.stats.maxResource).toBeGreaterThan(plain);
    s.accessories.set(2, null);
    s.tick(idle());
    expect(s.cls!.stats.maxResource).toBe(plain);
  });
});

describe('keeping them', () => {
  it('are saved with the hero and read back to the same places', () => {
    const s = make();
    s.accessories.set(0, makeStack(ringId('leather'), 1));
    s.accessories.set(1, makeStack(ringId('gold'), 1));
    s.accessories.set(2, makeStack(necklaceId('iron'), 1));
    const saved = JSON.parse(JSON.stringify(s.savePlayer()));
    expect(saved.accessories).toBeTruthy();
    const back = make();
    back.loadPlayer(parsePlayerSave(saved)!);
    expect(back.accessories.get(0)?.id).toBe(ringId('leather'));
    expect(back.accessories.get(1)?.id).toBe(ringId('gold'));
    expect(back.accessories.get(2)?.id).toBe(necklaceId('iron'));
    const sheet = sheetOfSave(parsePlayerSave(saved)!, 'warrior');
    expect(sheet.rings.map((r) => r?.id)).toEqual([ringId('leather'), ringId('gold')]);
    expect(sheet.necklace?.id).toBe(necklaceId('iron'));
  });

  it('write nothing into the save when nothing is worn', () => {
    expect(make().savePlayer().accessories).toBeUndefined();
  });

  it('cannot be forged by a hostile save: wrong kinds, stacks and plain items are dropped', () => {
    const saved = JSON.parse(JSON.stringify(make().savePlayer()));
    const hostile = { ...saved, accessories: [[necklaceId('gold'), 1, 0], [I.BREAD, 1, 0], [ringId('iron'), 1, 0]] };
    const a = make();
    a.loadPlayer(parsePlayerSave(hostile)!);
    expect(a.accessories.get(0)).toBeNull(); // a necklace in a ring slot
    expect(a.accessories.get(1)).toBeNull(); // bread
    expect(a.accessories.get(2)).toBeNull(); // a ring in the necklace slot
    const stacked = { ...saved, accessories: [[ringId('iron'), 9, 0]] };
    const b = make();
    b.loadPlayer(parsePlayerSave(stacked)!);
    expect(b.accessories.get(0)?.count).toBe(1);
  });

  it('can be put on and taken off from the Camp', () => {
    const s = make();
    s.inventory.set(5, makeStack(ringId('iron'), 1));
    s.inventory.set(6, makeStack(necklaceId('gold'), 1));
    expect(s.deskEquip(5)).toBeNull();
    expect(s.deskEquip(6)).toBeNull();
    expect(s.accessories.get(0)?.id).toBe(ringId('iron'));
    expect(s.accessories.get(2)?.id).toBe(necklaceId('gold'));
    expect(s.deskUnequip('necklace')).toBeNull();
    expect(s.deskUnequip('ring1')).toBeNull();
    expect(s.deskUnequip('ring2')).toBe('Nothing is worn there.');
    expect(s.accessories.isEmpty()).toBe(true);
    expect(s.inventory.countOf(ringId('iron'))).toBe(1);
    expect(s.inventory.countOf(necklaceId('gold'))).toBe(1);
  });
});
