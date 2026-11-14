import { describe, expect, it } from 'vitest';
import {
  ADVENTURE_SEED,
  CLASS_LEVELS,
  CREATIVE_TABS,
  CreativeMenu,
  GameSession,
  HeadlessWorld,
  I,
  UPGRADE_MAX,
  allItems,
  canRollGear,
  creativeCount,
  creativeGear,
  creativeIndices,
  creativeShelf,
  gearBases,
  getItem,
  makeGenerator,
  mulberry32,
  parseSessionMessage,
  toolId,
  validGearSpec,
  type GearSpec,
} from './index';

const generator = makeGenerator(ADVENTURE_SEED, 'adventure');

function make(mode: 'creative' | 'survival' = 'creative') {
  const world = new HeadlessWorld(generator);
  const s = new GameSession({ seed: ADVENTURE_SEED, world, generator, naturalSpawning: false, rand: mulberry32(3), classId: 'warrior', mode });
  s.finishLoading();
  s.clearInventory();
  s.drainEvents();
  return s;
}

const spec = (over: Partial<GearSpec> = {}): GearSpec => ({ id: toolId('sword', 'diamond'), rarity: 3, level: 12, cls: null, plus: 11, bloom: false, ...over });

describe('the shelves of the creative inventory', () => {
  it('put every item on exactly one shelf', () => {
    const shelves = CREATIVE_TABS.filter((t) => t.id !== 'all' && t.id !== 'gear');
    const total = shelves.reduce((n, t) => n + creativeCount(t.id), 0);
    expect(total).toBe(allItems().length);
    expect(creativeCount('all')).toBe(allItems().length);
    expect(creativeIndices('all', '')).toHaveLength(allItems().length);
  });

  it('sort things by what they are', () => {
    expect(creativeShelf(getItem(I.JEWEL_RIFT))).toBe('jewels');
    expect(creativeShelf(getItem(I.APPLE))).toBe('food');
    expect(creativeShelf(getItem(toolId('pickaxe', 'iron')))).toBe('tools');
    expect(creativeShelf(getItem(toolId('sword', 'iron')))).toBe('weapons');
    expect(creativeShelf(getItem(I.IRON_INGOT))).toBe('materials');
  });

  it('search by every word of the name, and the gear shelf lists no palette slots', () => {
    const names = (q: string) => creativeIndices('all', q).map((i) => allItems()[i].name);
    expect(names('iron pick')).toContain('iron_pickaxe');
    expect(names('iron pick').every((n) => n.includes('iron') && n.includes('pick'))).toBe(true);
    expect(names('jewel').length).toBeGreaterThanOrEqual(3);
    expect(names('zzzz')).toEqual([]);
    expect(creativeIndices('gear', '')).toEqual([]);
    expect(creativeIndices('food', 'apple').length).toBeGreaterThan(0);
  });
});

describe('the gear forge of the creative inventory', () => {
  it('makes a piece at the chosen upgrade, with the bloom attribute when asked', () => {
    const r = mulberry32(9);
    const plain = creativeGear(spec({ rarity: 0, plus: 13 }), r)!;
    expect(plain.gear).toMatchObject({ r: 0, s: [], u: 13 });
    const epic = creativeGear(spec({ cls: 'mage', bloom: true }), r)!;
    expect(epic.gear).toMatchObject({ r: 3, l: 12, c: 'mage', u: 11 });
    expect(epic.gear?.s.length).toBe(3);
    expect(epic.gear?.o).toBeDefined();
    expect(creativeGear(spec({ plus: 0 }), r)!.gear?.u).toBeUndefined();
    expect(creativeGear(spec({ id: I.APPLE }), r)).toBeNull();
  });

  it('only accepts specs it can make', () => {
    expect(validGearSpec(spec())).toBe(true);
    expect(validGearSpec(spec({ id: I.APPLE }))).toBe(false);
    expect(validGearSpec(spec({ plus: UPGRADE_MAX + 1 }))).toBe(false);
    expect(validGearSpec(spec({ plus: -1 }))).toBe(false);
    expect(validGearSpec(spec({ level: CLASS_LEVELS.max + 1 }))).toBe(false);
    expect(validGearSpec(spec({ rarity: 4 as never }))).toBe(false);
    expect(validGearSpec(spec({ cls: 'wizard' as never }))).toBe(false);
    expect(gearBases().every(canRollGear)).toBe(true);
  });

  it('is asked for with a command that is checked', () => {
    expect(parseSessionMessage({ t: 'creativeAmount', n: 16 })).toEqual({ t: 'creativeAmount', n: 16 });
    expect(parseSessionMessage({ t: 'creativeAmount', n: 7 })).toBeNull();
    expect(parseSessionMessage({ t: 'creativeClear' })).toEqual({ t: 'creativeClear' });
    expect(parseSessionMessage({ t: 'creativeGear', spec: spec() })).toEqual({ t: 'creativeGear', spec: spec() });
    expect(parseSessionMessage({ t: 'creativeGear', spec: { ...spec(), plus: 99 } })).toBeNull();
    expect(parseSessionMessage({ t: 'creativeGear' })).toBeNull();
  });
});

describe('the creative inventory in a session', () => {
  it('hands out the chosen amount on a click, a full stack on shift', () => {
    const s = make();
    s.apply({ t: 'inventory' });
    const m = s.menu as CreativeMenu;
    expect(m).toBeInstanceOf(CreativeMenu);
    const slotOf = (id: number) => m.paletteStart + allItems().findIndex((it) => it.id === id);
    s.apply({ t: 'creativeAmount', n: 16 });
    expect(m.palette.get(slotOf(I.APPLE) - m.paletteStart)?.count).toBe(16);
    s.apply({ t: 'click', slot: slotOf(I.APPLE), button: 0 });
    expect(m.cursor).toMatchObject({ id: I.APPLE, count: 16 });
    s.apply({ t: 'click', slot: slotOf(I.APPLE), button: 0 });
    expect(m.cursor).toBeNull();
    s.apply({ t: 'creativeAmount', n: 1 });
    s.apply({ t: 'click', slot: slotOf(I.APPLE), button: 0 });
    expect(m.cursor).toMatchObject({ id: I.APPLE, count: 1 });
    s.apply({ t: 'click', slot: slotOf(I.APPLE), button: 0 });
    // what does not stack gives the one it is
    s.apply({ t: 'creativeAmount', n: 64 });
    s.apply({ t: 'click', slot: slotOf(toolId('sword', 'iron')), button: 0 });
    expect(m.cursor?.count).toBe(1);
  });

  it('puts a forged piece on the cursor, then in the bag, and clears everything', () => {
    const s = make();
    s.apply({ t: 'inventory' });
    const m = s.menu as CreativeMenu;
    s.apply({ t: 'creativeGear', spec: spec() });
    expect(m.cursor?.gear?.u).toBe(11);
    s.apply({ t: 'creativeGear', spec: spec({ plus: 5 }) });
    expect(m.cursor?.gear?.u).toBe(11);
    expect(m.player.totalItems()).toBe(1);
    expect(m.player.slots.find((x) => x)?.gear?.u).toBe(5);
    s.apply({ t: 'creativeClear' });
    expect(m.cursor).toBeNull();
    expect(m.player.totalItems()).toBe(0);
  });

  it('does nothing outside the creative inventory', () => {
    const s = make('survival');
    s.apply({ t: 'creativeGear', spec: spec() });
    s.apply({ t: 'creativeClear' });
    expect(s.menu).toBeNull();
    s.apply({ t: 'inventory' });
    s.apply({ t: 'creativeGear', spec: spec() });
    expect(s.menu?.cursor ?? null).toBeNull();
  });
});
