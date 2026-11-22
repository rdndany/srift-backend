import { describe, expect, it } from 'vitest';
import {
  B,
  CLASS_IDS,
  CraftingMenu,
  GameSession,
  HeadlessWorld,
  I,
  OUTFITS,
  TILE_NAMES,
  WorldGenerator,
  categoryOf,
  getItem,
  isUndroppable,
  makeStack,
  mulberry32,
  outfitSetFits,
  outfitSetItemId,
  outfitSetOfItem,
  parsePlayerSave,
  tooltipLines,
  tooltipName,
  type ClassId,
  type InputFrame,
  type SessionEvent,
} from './index';

const idle = (over: Partial<InputFrame> = {}): InputFrame => ({ t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false, ...over });

function make(classId: ClassId | null = 'mage') {
  const generator = new WorldGenerator(1337);
  const world = new HeadlessWorld(generator);
  for (let x = -32; x <= 48; x++)
    for (let z = -32; z <= 48; z++) {
      for (let y = 101; y < 120; y++) world.setBlock(x, y, z, B.AIR);
      world.setBlock(x, 100, z, B.STONE);
    }
  const s = new GameSession({ seed: 1337, world, generator, naturalSpawning: false, rand: mulberry32(5), mode: 'survival', classId });
  s.finishLoading();
  s.teleport(8.5, 101, 8.5, 0, 0);
  s.drainEvents();
  return s;
}

const toasts = (s: GameSession): string[] => s.drainEvents().flatMap((e: SessionEvent) => (e.t === 'toast' ? [e.text] : []));
const slotAt = (s: GameSession, i: number) => s.menu!.slots.findIndex((x) => x.container === s.inventory && x.index === i && x.kind === 'normal');

describe('the sets of the token shop are items', () => {
  it('have an item each, in the order of the list, with a picture of their own and a kind', () => {
    const ids = new Set(OUTFITS.map((o) => outfitSetItemId(o.id)));
    expect(ids.size).toBe(OUTFITS.length);
    OUTFITS.forEach((o, i) => {
      const id = outfitSetItemId(o.id);
      expect(id).toBe(I.OUTFIT_SET_BASE + i);
      expect(outfitSetOfItem(id)?.id).toBe(o.id);
      const item = getItem(id);
      expect(item.id).toBe(id);
      expect(item.maxStack).toBe(1);
      expect(item.use).toBe('outfit');
      expect(item.kind).toBe('Outfit');
      expect(TILE_NAMES[item.tile]).toBe(`outfit_set_${o.id}`);
      expect(categoryOf(makeStack(id, 1))).toBe('armor');
    });
    expect(outfitSetOfItem(I.OUTFIT_SET_BASE + OUTFITS.length)).toBeNull();
    expect(outfitSetOfItem(I.BREAD)).toBeNull();
    expect(() => outfitSetItemId('nope')).toThrow();
  });

  it('may be stored and traded: they are not kept for good', () => {
    for (const o of OUTFITS) expect(isUndroppable(outfitSetItemId(o.id))).toBe(false);
  });

  it('are worn by the class they are for, and a hero with no class wears any', () => {
    for (const o of OUTFITS) {
      const id = outfitSetItemId(o.id);
      for (const c of CLASS_IDS) expect(outfitSetFits(id, c)).toBe(c === o.cls);
      expect(outfitSetFits(id, null)).toBe(true);
    }
    expect(outfitSetFits(I.BREAD, 'mage')).toBe(false);
  });

  it('say what they are on the tooltip: the name, the class, the tier, and what a right-click does', () => {
    const id = outfitSetItemId('stormcaller');
    expect(tooltipName(makeStack(id, 1))).toBe('Stormcaller');
    const own = tooltipLines(makeStack(id, 1), 'mage').map((l) => l.text);
    expect(own[1]).toBe('Outfit');
    expect(own.join('|')).toContain('For the Mage');
    expect(own.join('|')).toContain('Rare set');
    expect(own.join('|')).toContain('Right-click to put it in the outfit slot');
    const wrong = tooltipLines(makeStack(id, 1), 'warrior');
    expect(wrong.find((l) => l.text.startsWith('For the Mage'))).toMatchObject({ color: 'warn' });
    expect(wrong.find((l) => l.text.startsWith('For the Mage'))!.text).toContain('Warrior cannot wear it');
  });
});

describe('the outfit slot', () => {
  it('takes a set of the hero\'s class from the hotbar with a right-click, and the set shows as worn', () => {
    const s = make('mage');
    const id = outfitSetItemId('starweaver');
    s.inventory.set(0, makeStack(id, 1));
    s.apply({ t: 'select', slot: 0 });
    s.drainEvents();
    s.tick(idle({ right: true }));
    s.tick(idle());
    expect(s.outfitSlot.get(0)?.id).toBe(id);
    expect(s.inventory.get(0)).toBeNull();
    expect(s.wornOutfit).toBe('starweaver');
    expect(toasts(s).join(' ')).toContain('Starweaver');
  });

  it('takes it from the bags with a right-click and gives back the set that was there', () => {
    const s = make('mage');
    s.outfitSlot.set(0, makeStack(outfitSetItemId('starweaver'), 1));
    s.inventory.set(15, makeStack(outfitSetItemId('emberrobe'), 1));
    s.apply({ t: 'inventory' });
    s.apply({ t: 'click', slot: slotAt(s, 15), button: 1 });
    expect(s.wornOutfit).toBe('emberrobe');
    expect(s.inventory.get(15)?.id).toBe(outfitSetItemId('starweaver'));
    expect(s.menu!.cursor).toBeNull();
  });

  it('is a slot of the inventory window, right after the mount slot, that takes the sets of the hero\'s class and nothing else', () => {
    const s = make('ranger');
    s.inventory.set(0, makeStack(outfitSetItemId('greenwarden'), 1));
    s.inventory.set(1, makeStack(outfitSetItemId('starweaver'), 1)); // a Mage's
    s.inventory.set(2, makeStack(I.BREAD, 1));
    s.apply({ t: 'inventory' });
    const menu = s.menu as CraftingMenu;
    expect(menu.outfitSlot).toBe(menu.mountSlot + 1);
    for (const wrong of [1, 2]) {
      s.apply({ t: 'click', slot: slotAt(s, wrong), button: 0 });
      s.apply({ t: 'click', slot: menu.outfitSlot, button: 0 });
      expect(s.outfitSlot.get(0)).toBeNull();
      s.apply({ t: 'click', slot: slotAt(s, wrong), button: 0 }); // (put it back down)
    }
    s.apply({ t: 'click', slot: slotAt(s, 0), button: 0 });
    s.apply({ t: 'click', slot: menu.outfitSlot, button: 0 });
    expect(s.wornOutfit).toBe('greenwarden');
    // And taking it off: pick it up out of the slot and put it down in the bags.
    s.apply({ t: 'click', slot: menu.outfitSlot, button: 0 });
    s.apply({ t: 'click', slot: slotAt(s, 5), button: 0 });
    expect(s.wornOutfit).toBeNull();
    expect(s.inventory.get(5)?.id).toBe(outfitSetItemId('greenwarden'));
  });

  it('is filled by a shift-click on a set of the hero\'s class only', () => {
    const s = make('warrior');
    s.inventory.set(20, makeStack(outfitSetItemId('sunforged'), 1));
    s.inventory.set(21, makeStack(outfitSetItemId('wildheart'), 1)); // a Ranger's
    s.apply({ t: 'inventory' });
    s.apply({ t: 'shift', slot: slotAt(s, 21) });
    expect(s.outfitSlot.get(0)).toBeNull();
    s.apply({ t: 'shift', slot: slotAt(s, 20) });
    expect(s.wornOutfit).toBe('sunforged');
  });

  it('keeps a set of another class in the bags when it is right-clicked, and says why', () => {
    const s = make('warrior');
    s.inventory.set(0, makeStack(outfitSetItemId('starweaver'), 1));
    s.apply({ t: 'select', slot: 0 });
    s.drainEvents();
    s.tick(idle({ right: true }));
    s.tick(idle());
    expect(s.outfitSlot.get(0)).toBeNull();
    expect(s.inventory.get(0)?.id).toBe(outfitSetItemId('starweaver'));
    expect(toasts(s).join(' ')).toMatch(/set for the Mage/);
  });

  it('is saved with the hero, and an old save has none', () => {
    const s = make('mage');
    expect('outfitSlot' in s.savePlayer()).toBe(false);
    s.outfitSlot.set(0, makeStack(outfitSetItemId('aetherlord'), 1));
    const saved = parsePlayerSave(JSON.parse(JSON.stringify(s.savePlayer())))!;
    expect(saved.outfitSlot).toBeDefined();
    const again = make('mage');
    again.loadPlayer(saved);
    expect(again.wornOutfit).toBe('aetherlord');
    const fresh = make('mage');
    fresh.loadPlayer(parsePlayerSave(JSON.parse(JSON.stringify(make('mage').savePlayer())))!);
    expect(fresh.wornOutfit).toBeNull();
  });

  it('drops anything in the slot of a save that is not a set, and shows no set that is not of the hero\'s class', () => {
    const s = make('mage');
    const raw = { ...JSON.parse(JSON.stringify(s.savePlayer())), outfitSlot: [{ id: I.BREAD, count: 5, damage: 0 }] };
    const again = make('mage');
    again.loadPlayer(parsePlayerSave(raw)!);
    expect(again.outfitSlot.get(0)).toBeNull();
    // A set of another class in the slot of a hostile save is carried but never worn.
    const hostile = { ...JSON.parse(JSON.stringify(s.savePlayer())), outfitSlot: [[outfitSetItemId('mossback'), 3, 0]] };
    const other = make('mage');
    other.loadPlayer(parsePlayerSave(hostile)!);
    expect(other.outfitSlot.get(0)?.count).toBe(1);
    expect(other.wornOutfit).toBeNull();
  });
});
