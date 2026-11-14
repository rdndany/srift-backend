import { describe, expect, it } from 'vitest';
import {
  ARMOR_SLOTS,
  B,
  CLASS_IDS,
  GameSession,
  HeadlessWorld,
  OUTFIT_CLASSES,
  WorldGenerator,
  armorId,
  getItem,
  makeStack,
  mulberry32,
  outfitId,
  outfitItems,
  outfitOfItem,
  parsePlayerSave,
  reduceDamage,
  tooltipLines,
  type ClassId,
} from './index';

const SEED = 1337;

function session(classId: ClassId | null, mode: 'survival' | 'creative' = 'survival') {
  const generator = new WorldGenerator(SEED);
  const world = new HeadlessWorld(generator);
  for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) world.setBlock(x, 100, z, B.STONE);
  const s = new GameSession({ seed: SEED, world, generator, naturalSpawning: false, rand: mulberry32(7), mode, classId });
  s.finishLoading();
  return { s, generator };
}

describe('the clothes of the classes', () => {
  it('are four items for each class, in the armor slots', () => {
    expect(OUTFIT_CLASSES).toEqual(CLASS_IDS);
    const seen = new Set<number>();
    for (const cls of OUTFIT_CLASSES) {
      const ids = outfitItems(cls);
      expect(ids).toHaveLength(ARMOR_SLOTS.length);
      ids.forEach((id, slot) => {
        const def = getItem(id);
        expect(def.armor?.slotIndex).toBe(slot);
        expect(def.armor?.outfit).toBe(cls);
        expect(def.maxStack).toBe(1);
        expect(outfitOfItem(id)).toBe(cls);
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      });
    }
    expect(outfitOfItem(armorId(0, 'iron'))).toBeNull();
  });

  it('protect nothing and never wear out', () => {
    for (const cls of OUTFIT_CLASSES) {
      for (const id of outfitItems(cls)) {
        const a = getItem(id).armor!;
        expect(a.defense).toBe(0);
        expect(a.toughness).toBe(0);
        expect(getItem(id).durability).toBe(0);
      }
    }
    expect(reduceDamage(10, 0)).toBe(10);
  });

  it('are worn by a new character of the class, in every mode', () => {
    for (const cls of OUTFIT_CLASSES) {
      for (const mode of ['survival', 'creative'] as const) {
        const { s } = session(cls, mode);
        expect(s.armorIds()).toEqual(outfitItems(cls));
        expect(s.defense).toBe(0);
      }
    }
  });

  it('are not given to a player without a class', () => {
    const { s } = session(null);
    expect(s.armorIds()).toEqual([0, 0, 0, 0]);
  });

  it('can be taken off, and stay off after saving and loading', () => {
    const { s } = session('warrior');
    // Take the helm and the boots off into the bag.
    const helm = s.armor.get(0)!;
    s.armor.set(0, null);
    s.armor.set(3, null);
    expect(s.inventory.add(helm)).toBeNull();
    expect(s.armorIds()).toEqual([0, outfitId('warrior', 1), outfitId('warrior', 2), 0]);
    const saved = parsePlayerSave(JSON.parse(JSON.stringify(s.savePlayer())))!;
    expect(saved.of).toBe(true);

    const generator = new WorldGenerator(SEED);
    const t = new GameSession({ seed: SEED, world: new HeadlessWorld(generator), generator, naturalSpawning: false, rand: mulberry32(7), classId: 'warrior' });
    t.loadPlayer(saved);
    expect(t.armorIds()).toEqual([0, outfitId('warrior', 1), outfitId('warrior', 2), 0]);
    expect(t.inventory.countOf(helm.id)).toBe(1);
  });

  it('are put on a character saved before they were items, once', () => {
    const { s } = session('mage');
    const old = JSON.parse(JSON.stringify(s.savePlayer()));
    delete old.of;
    old.armor = undefined;
    const generator = new WorldGenerator(SEED);
    const t = new GameSession({ seed: SEED, world: new HeadlessWorld(generator), generator, naturalSpawning: false, rand: mulberry32(7), classId: 'mage' });
    t.loadPlayer(parsePlayerSave(old)!);
    expect(t.armorIds()).toEqual(outfitItems('mage'));
    expect(t.savePlayer().of).toBe(true);
  });

  it('give way to real armor, and come back to the bag', () => {
    const { s } = session('ranger');
    s.inventory.set(0, makeStack(armorId(1, 'iron'), 1));
    s.selected = 0;
    expect(s.equipHeld()).toBe(true);
    expect(s.armor.get(1)!.id).toBe(armorId(1, 'iron'));
    // The jerkin is back in the bag, where it can be worn again.
    expect(s.inventory.countOf(outfitId('ranger', 1))).toBe(1);
    expect(s.defense).toBe(6);
  });

  it('say whose clothes they are in the tooltip', () => {
    const lines = tooltipLines(makeStack(outfitId('mage', 0), 1));
    expect(lines.some((l) => /Mage clothes/.test(l.text))).toBe(true);
    expect(lines.some((l) => /Armor$/.test(l.text))).toBe(false);
  });
});
