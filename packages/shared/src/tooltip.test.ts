import { describe, expect, it } from 'vitest';
import { ENCH, I, makeStack, toolId, armorId, tooltipLines } from './index';

const text = (id: number) => tooltipLines(makeStack(id, 1)).map((l) => l.text);

describe('item tooltips', () => {
  it('an iron sword matches the original: name, kind, attack damage', () => {
    const lines = tooltipLines(makeStack(toolId('sword', 'iron'), 1));
    expect(lines[0]).toEqual({ text: 'Iron Sword', color: 'name' });
    expect(lines[1]).toEqual({ text: 'Equipment', color: 'kind' });
    expect(lines[2]).toEqual({ text: '+6 Attack Damage', color: 'stat' });
  });

  it('tools list mining speed, armor lists defense, food lists hunger', () => {
    expect(text(toolId('pickaxe', 'diamond'))).toContain('8 Mining Speed');
    expect(text(armorId(1, 'diamond'))).toContain('+8 Armor');
    expect(text(armorId(1, 'diamond'))).toContain('+2 Armor Toughness');
    expect(text(I.BREAD).some((t) => /Restores \d+ Hunger/.test(t))).toBe(true);
  });

  it('an enchanted book is named for what it holds', () => {
    const one = tooltipLines({ id: I.ENCHANTED_BOOK, count: 1, damage: 0, ench: [[ENCH.SHARPNESS, 1]] });
    expect(one[0]).toEqual({ text: 'Book of Sharpness', color: 'rare' });
    expect(one[1].text).toBe('Enchanted Book');
    expect(one[2].text).toBe('Sharpness I');
    const two = tooltipLines({ id: I.ENCHANTED_BOOK, count: 1, damage: 0, ench: [[ENCH.SHARPNESS, 1], [ENCH.UNBREAKING, 2]] });
    expect(two[0].text).toBe('Book of Sharpness & Unbreaking');
    const three = tooltipLines({ id: I.ENCHANTED_BOOK, count: 1, damage: 0, ench: [[ENCH.SHARPNESS, 1], [ENCH.UNBREAKING, 2], [ENCH.MENDING, 1]] });
    expect(three[0].text).toBe('Book of Sharpness +2');
  });

  it('shows durability left and enchantments, and colours enchanted items', () => {
    const s = makeStack(toolId('sword', 'iron'), 1);
    s.damage = 50;
    s.ench = [[1, 3]];
    const lines = tooltipLines(s);
    expect(lines[0].color).toBe('rare');
    expect(lines.some((l) => l.color === 'ench')).toBe(true);
    expect(lines[lines.length - 1].text).toBe('Durability: 200 / 250');
  });

  it("a bottle o' enchanting says to throw it for experience", () => {
    const lines = text(I.EXPERIENCE_BOTTLE);
    expect(lines[0]).toBe("Bottle o' Enchanting");
    expect(lines[1]).toBe('Item');
    expect(lines).toContain('Breaks into 3 to 11 experience');
    expect(lines).toContain('Right-click to throw it');
  });

  it('names poison and hunger sickness as status effects, and milk clears them', () => {
    expect(text(I.SPIDER_EYE)).toContain('100% chance of the Poison status effect (4s)');
    expect(text(I.ROTTEN_FLESH)).toContain('80% chance of the Hunger sickness status effect (30s)');
    expect(text(I.CHICKEN)).toContain('30% chance of the Hunger sickness status effect (30s)');
    expect(text(I.MILK_BUCKET)).toContain('Clears status effects');
  });

  it('plain blocks and materials get a kind line and nothing is empty', () => {
    expect(text(I.STICK)[1]).toBe('Material');
    expect(tooltipLines(null)).toEqual([]);
    for (const id of [I.ENCHANTED_BOOK, I.BOW, I.BED_COLOR_BASE + 1]) for (const l of text(id)) expect(l.length).toBeGreaterThan(0);
  });
});
