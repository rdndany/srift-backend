import { describe, expect, it } from 'vitest';
import { B, CLASSES, Container, GameSession, HeadlessWorld, I, MAX_LEVEL, WorldGenerator, armorId, briefOfSheet, lobbyStats, makeStack, mulberry32, newCharacterSheet, sheetOfSave, wornDefense } from './index';

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

  it('the numbers follow the off hand and the armor', () => {
    const base = { v: 1 as const, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, mode: 'survival' as const, selected: 0, inv: [], vitals: null, mobs: [], cls: { v: 1 as const, id: 'mage' as const, lvl: 1, xp: 0, unlocked: [] }, of: true };
    const plain = sheetOfSave(base, 'mage');
    const off = new Container(1);
    off.set(0, makeStack(I.ORB, 1));
    const withOrb = sheetOfSave({ ...base, offhand: off.toJSON() }, 'mage');
    expect(lobbyStats(withOrb)!.maxResource).toBe(lobbyStats(plain)!.maxResource + 20);
    expect(lobbyStats(withOrb)!.damage.spell).toBeGreaterThan(lobbyStats(plain)!.damage.spell);
    expect(withOrb.maxHealth).toBe(plain.maxHealth);
    const armor = new Container(4);
    armor.set(1, makeStack(armorId(1, 'iron'), 1));
    const plated = sheetOfSave({ ...base, armor: armor.toJSON() }, 'mage');
    expect(wornDefense(plated.armor)).toBeGreaterThan(wornDefense(plain.armor));
  });

  it('has the clothes and a weapon for every class', () => {
    for (const id of ['warrior', 'mage', 'ranger'] as const) {
      const sheet = newCharacterSheet(id);
      expect(sheet.armor.every((a) => a !== null), id).toBe(true);
      expect(sheet.hotbar.some((x) => x?.id === CLASSES[id].startingWeapon), id).toBe(true);
    }
  });
});
describe('achievements on the sheet', () => {
  it('shows what a saved character has won and counted, and nothing for a new one', () => {
    const save = { ...mage().savePlayer(), ach: { s: { kills: 120, level: 6 }, d: ['lvl-5', 'kill-25'] } };
    const sheet = sheetOfSave(save, 'mage');
    expect(sheet.ach.stats.kills).toBe(120);
    // (the counts earn what the list says, so "kill-100" is won too, as it is in the game)
    expect(sheet.ach.done).toEqual(expect.arrayContaining(['lvl-5', 'kill-25', 'kill-100']));
    expect(sheet.ach.done).not.toContain('kill-500');
    expect(JSON.parse(JSON.stringify(sheet))).toEqual(sheet);

    expect(newCharacterSheet('mage').ach.done).toEqual([]);
    const rubbish = sheetOfSave({ ...mage().savePlayer(), ach: { s: { kills: 'many' }, d: [5, 'nope'] } as never }, 'mage');
    expect(rubbish.ach.done).toEqual([]);
  });

  it('reads an island save as the island list', () => {
    const save = { ...mage().savePlayer(), ach: { s: { days: 8, kills: 500 }, d: ['isle-day-2', 'lvl-5', 'kill-25'] } };
    const sheet = sheetOfSave(save, null, undefined, 'isle');
    expect(sheet.ach.done).toEqual(expect.arrayContaining(['isle-day-2', 'isle-day-5', 'isle-day-8']));
    expect(sheet.ach.done).not.toContain('lvl-5');
    expect(sheet.ach.done).not.toContain('kill-25');
    expect(sheet.ach.stats.days).toBe(8);
  });
});
