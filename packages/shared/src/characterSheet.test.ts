import { describe, expect, it } from 'vitest';
import { B, CLASSES, GameSession, HeadlessWorld, MAX_LEVEL, WorldGenerator, briefOfSheet, mulberry32, newCharacterSheet, sheetOfSave } from './index';

function mage() {
  const generator = new WorldGenerator(1337);
  const world = new HeadlessWorld(generator);
  for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) world.setBlock(x, 100, z, B.STONE);
  const s = new GameSession({ seed: 1337, world, generator, naturalSpawning: false, rand: mulberry32(7), mode: 'survival', classId: 'mage' });
  s.finishLoading();
  return s;
}

describe('sheetOfSave', () => {
  it('reads the record a fresh mage was saved with', () => {
    const sheet = sheetOfSave({ ...mage().savePlayer(), xp: { l: 3, p: 4 }, coins: 37 }, 'mage');
    expect(sheet.cls?.id).toBe('mage');
    expect(sheet.level).toBe(sheet.cls?.level);
    expect(sheet.xp).toMatchObject({ level: 3, points: 4 });
    expect(sheet.coins).toBe(37);
    expect(sheet.armor.every((a) => a !== null)).toBe(true);
    expect(sheet.hotbar).toHaveLength(9);
    expect(sheet.backpack).toHaveLength(27);
    expect(sheet.hotbar.some((s) => s?.id === CLASSES.mage.startingWeapon)).toBe(true);
    expect(sheet.itemCount).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(sheet))).toEqual(sheet);
  });

  it('survives rubbish', () => {
    const sheet = sheetOfSave({ v: 1, x: 1.5, y: 2, z: 3, yaw: 0, pitch: 0, mode: 'survival', selected: 0, inv: 'no', vitals: { h: 'x' }, mobs: [], xp: { l: 1e9 }, bags: [[999999, 5, 0]], quests: { d: [1, 'nope'], a: [['x', 5]] } });
    expect(sheet.cls).toBeNull();
    expect(sheet.xp.level).toBe(MAX_LEVEL);
    expect(sheet.level).toBe(MAX_LEVEL);
    expect(sheet.health).toBe(20);
    expect(sheet.quests.done).toBe(0);
    expect(sheet.quests.active).toEqual([]);
  });
});

describe('briefOfSheet', () => {
  it('adds up what a character carries, worn and in the pack together, and nothing else', () => {
    const sheet = sheetOfSave({ ...mage().savePlayer(), coins: 12 }, 'mage');
    const brief = briefOfSheet('c1', sheet);
    expect(brief).toMatchObject({ id: 'c1', level: sheet.level, coins: 12 });
    const held = new Map(brief.holds);
    expect(held.get(CLASSES.mage.startingWeapon)).toBeGreaterThan(0);
    const worn = sheet.armor.flatMap((a) => (a ? [a.id] : []));
    expect(worn.length).toBeGreaterThan(0);
    for (const id of worn) expect(held.has(id)).toBe(true);
    expect([...held.values()].reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(sheet.itemCount - 0);
    expect(JSON.parse(JSON.stringify(brief))).toEqual(brief);
  });
});

describe('newCharacterSheet', () => {
  it('is what a fresh character of the class is saved with', () => {
    const s = mage();
    const real = sheetOfSave(s.savePlayer(), 'mage');
    const fresh = newCharacterSheet('mage');
    const ids = (a: ({ id: number } | null)[]) => a.map((x) => x?.id ?? null);
    expect(ids(fresh.hotbar)).toEqual(ids(real.hotbar));
    expect(ids(fresh.backpack)).toEqual(ids(real.backpack));
    expect(ids(fresh.armor)).toEqual(ids(real.armor));
    expect(fresh.offhand?.id).toBe(real.offhand?.id);
    expect(fresh.cls).toEqual(real.cls);
    expect(fresh.level).toBe(real.level);
    expect(fresh.maxHealth).toBe(real.maxHealth);
  });

  it('has the clothes and a weapon for every class', () => {
    for (const id of ['warrior', 'mage', 'ranger'] as const) {
      const sheet = newCharacterSheet(id);
      expect(sheet.armor.every((a) => a !== null), id).toBe(true);
      expect(sheet.hotbar.some((x) => x?.id === CLASSES[id].startingWeapon), id).toBe(true);
    }
  });
});