import { describe, expect, it } from 'vitest';
import {
  ADVENTURE_SEED,
  B,
  BLOOM_CHANCE,
  Container,
  DAWN_MAX,
  GEAR_STATS,
  GameSession,
  HeadlessWorld,
  I,
  JEWELS,
  LOOT_TABLES,
  PLUS_MAX,
  UPGRADE_MAX,
  FORGE_BASE,
  FORGE_TARGETS,
  RECIPES,
  forgeGhosts,
  forgeGhostLayout,
  forgeGhostPlan,
  forgeIndex,
  forgeLayout,
  forgeTarget,
  forgeCost,
  forgeHint,
  forgeUpgrade,
  RIFT_CHANCE,
  CRAFT_TIME,
  FORGE_CHANCE,
  FORGE_TIME,
  forgeOutcome,
  STAT_INFO,
  UPGRADE_STEP,
  allStats,
  armorId,
  canRollGear,
  cloneGear,
  cloneStack,
  gearKey,
  gearModifiers,
  grownValue,
  getItem,
  jewelDrop,
  jewelDropChance,
  jewelKind,
  makeGenerator,
  makeStack,
  mulberry32,
  parseGear,
  plusStats,
  rollChest,
  statLine,
  rollOption,
  shopOf,
  stackSellPrice,
  toolId,
  tooltipLines,
  tooltipName,
  useJewel,
  type CraftingMenu,
  type GearRoll,
  type InputFrame,
  type ItemStack,
  type SessionEvent,
} from './index';

const generator = makeGenerator(ADVENTURE_SEED, 'adventure');
const idle = (): InputFrame => ({ t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: -1.4, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false });

function make(classId: 'warrior' | 'mage' | 'ranger' = 'warrior', seed = 5) {
  const world = new HeadlessWorld(generator);
  const s = new GameSession({ seed: ADVENTURE_SEED, world, generator, naturalSpawning: false, rand: mulberry32(seed), classId, mode: 'survival' });
  s.finishLoading();
  s.clearInventory();
  s.drainEvents();
  return s;
}

/** Dice that give these numbers in turn, then the last one for ever. */
const dice = (...v: number[]): (() => number) => {
  let i = 0;
  return () => v[Math.min(i++, v.length - 1)];
};

const sword = (): ItemStack => makeStack(toolId('sword', 'iron'), 1);
const toasts = (s: GameSession): string[] => s.drainEvents().flatMap((e: SessionEvent) => (e.t === 'toast' ? [e.text] : []));

describe('the jewels as items', () => {
  it('are three stackable items with the names of the game', () => {
    expect(JEWELS.map((j) => j.name)).toEqual(['Jewel of Dawn', 'Jewel of the Rift', 'Jewel of Bloom']);
    for (const j of JEWELS) {
      expect(getItem(j.id).maxStack).toBe(64);
      expect(jewelKind(j.id)).toBe(j.kind);
      expect(canRollGear(j.id)).toBe(false);
      expect(tooltipName(makeStack(j.id, 1))).toBe(j.name);
    }
    expect(jewelKind(I.APPLE)).toBeNull();
  });

  it('tell what they do and how to use them', () => {
    for (const j of JEWELS) {
      const text = tooltipLines(makeStack(j.id, 3)).map((l) => l.text);
      expect(text).toContain('Jewel');
      expect(text).toContain(j.blurb);
      expect(text.some((t) => t.includes('click a piece of equipment'))).toBe(true);
    }
  });
});

describe('the Jewel of Dawn', () => {
  it('raises a plain piece one step at a time to +6, and never fails', () => {
    let piece = sword();
    for (let n = 1; n <= DAWN_MAX; n++) {
      const r = useJewel('dawn', piece, () => 0.999);
      expect(r.used && r.ok).toBe(true);
      expect(r.stack?.gear?.u).toBe(n);
      piece = r.stack!;
    }
    expect(tooltipName(piece)).toBe('Iron Sword +6');
  });

  it('works on a plain piece by giving it a roll without a rarity, and leaves the original alone', () => {
    const plain = sword();
    const r = useJewel('dawn', plain, () => 0.5);
    expect(plain.gear).toBeUndefined();
    expect(r.stack!.gear).toEqual({ r: 0, l: 1, s: [], u: 1 });
    expect(r.stack!.id).toBe(plain.id);
  });

  it('refuses a piece that is +6 already, and keeps the jewel', () => {
    const piece: ItemStack = { ...sword(), gear: { r: 0, l: 1, s: [], u: 6 } };
    const r = useJewel('dawn', piece, () => 0);
    expect(r).toMatchObject({ used: false, ok: false, stack: null });
    expect(r.text).toContain('Rift');
  });

  it('keeps what a found piece rolled, and its enchantments and name', () => {
    const found: ItemStack = { id: armorId(1, 'iron'), count: 1, damage: 3, name: 'Old Faithful', ench: [[0, 2]], gear: { r: 2, l: 7, c: 'warrior', s: [['vit', 9], ['ward', 4]] } };
    const r = useJewel('dawn', found, () => 0);
    const out = r.stack!;
    expect(out.gear).toMatchObject({ r: 2, l: 7, c: 'warrior', s: [['vit', 9], ['ward', 4]], u: 1 });
    expect(out.name).toBe('Old Faithful');
    expect(out.ench).toEqual([[0, 2]]);
    expect(out.damage).toBe(3);
    expect(found.gear!.u).toBeUndefined();
  });
});

describe('the Jewel of the Rift', () => {
  it('raises a piece all the way to +9 when the dice allow', () => {
    let piece = sword();
    for (let n = 1; n <= PLUS_MAX; n++) {
      const r = useJewel('rift', piece, () => 0);
      expect(r.ok).toBe(true);
      piece = r.stack!;
      expect(piece.gear!.u).toBe(n);
    }
    expect(tooltipName(piece)).toBe('Iron Sword +9');
    expect(useJewel('rift', piece, () => 0)).toMatchObject({ used: false, stack: null });
  });

  it('is sure from +0 to +6, then three in four, and the forge past +9 is one in four', () => {
    expect(RIFT_CHANCE).toHaveLength(PLUS_MAX);
    expect(RIFT_CHANCE.slice(0, 6)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(RIFT_CHANCE.slice(6)).toEqual([0.75, 0.75, 0.75]);
    expect(FORGE_CHANCE).toBe(0.25);
    // At +5 even the worst dice work, at +6 the worst dice fail.
    expect(useJewel('rift', { ...sword(), gear: { r: 0, l: 1, s: [], u: 5 } }, () => 0.9999).ok).toBe(true);
    expect(useJewel('rift', { ...sword(), gear: { r: 0, l: 1, s: [], u: 6 } }, () => 0.7501).ok).toBe(false);
    expect(useJewel('rift', { ...sword(), gear: { r: 0, l: 1, s: [], u: 6 } }, () => 0.7499).ok).toBe(true);
  });

  it('a failure up to +6 only uses the jewel up', () => {
    const piece: ItemStack = { ...sword(), gear: { r: 0, l: 1, s: [], u: 6 } };
    const r = useJewel('rift', piece, () => 0.9999);
    expect(r).toMatchObject({ used: true, ok: false, stack: null });
  });

  it('a failure from +7 up costs a step', () => {
    for (const plus of [7, 8]) {
      const piece: ItemStack = { ...sword(), gear: { r: 0, l: 1, s: [], u: plus } };
      const r = useJewel('rift', piece, () => 0.9999);
      expect(r.used).toBe(true);
      expect(r.ok).toBe(false);
      expect(r.stack!.gear!.u).toBe(plus - 1);
    }
  });

  it('works on a plain piece from +0 too, with the first chance', () => {
    expect(useJewel('rift', sword(), () => RIFT_CHANCE[0] - 0.001).ok).toBe(true);
    expect(useJewel('rift', sword(), () => RIFT_CHANCE[0] + 0.001).ok).toBe(false);
  });
});

describe('the Jewel of Bloom', () => {
  it('adds one attribute the piece does not have yet', () => {
    const found: ItemStack = { id: I.GREATSWORD, count: 1, damage: 0, gear: { r: 2, l: 10, c: 'warrior', s: [['might', 14], ['crit', 4]] } };
    for (let seed = 1; seed <= 40; seed++) {
      const r = useJewel('bloom', found, mulberry32(seed * 977));
      if (!r.ok) continue;
      const o = r.stack!.gear!.o!;
      expect(['might', 'crit']).not.toContain(o[0]);
      expect(GEAR_STATS).toContain(o[0]);
      expect(o[1]).toBeGreaterThanOrEqual(1);
      expect(o[1]).toBeLessThanOrEqual(STAT_INFO[o[0]].cap);
    }
  });

  it('a plain piece takes it too, from the pool anyone may roll', () => {
    const r = useJewel('bloom', sword(), dice(0, 0.5, 0));
    expect(r.ok).toBe(true);
    const g = r.stack!.gear!;
    expect(g.r).toBe(0);
    expect(g.o).toBeDefined();
    expect(g.u).toBeUndefined();
    expect(tooltipName(r.stack!)).toBe('Iron Sword');
  });

  it('a piece takes only one, and keeps the jewel for another', () => {
    const once = useJewel('bloom', sword(), dice(0, 0.5, 0)).stack!;
    const again = useJewel('bloom', once, () => 0);
    expect(again).toMatchObject({ used: false, ok: false, stack: null });
    expect(again.text).toContain('already');
  });

  it('can fail, and then the jewel is gone and the piece unchanged', () => {
    const r = useJewel('bloom', sword(), dice(0, 0.5, BLOOM_CHANCE + 0.01));
    expect(r).toMatchObject({ used: true, ok: false, stack: null });
  });

  it('rolls stronger for a higher level piece', () => {
    const weak: GearRoll = { r: 1, l: 1, s: [['vit', 2]] };
    const strong: GearRoll = { r: 1, l: 20, s: [['vit', 2]] };
    const a = rollOption(armorId(1, 'iron'), weak, dice(0, 0.5))![1];
    const b = rollOption(armorId(1, 'iron'), strong, dice(0, 0.5))![1];
    expect(b).toBeGreaterThan(a);
  });

  it('keeps the rest of the piece as it was', () => {
    const found: ItemStack = { id: armorId(2, 'diamond'), count: 1, damage: 2, gear: { r: 3, l: 12, s: [['vit', 12], ['ward', 6], ['crit', 3]], u: 4 } };
    const r = useJewel('bloom', found, () => 0);
    const g = r.stack!.gear!;
    expect(g).toMatchObject({ r: 3, l: 12, u: 4, s: [['vit', 12], ['ward', 6], ['crit', 3]] });
    expect(g.o).toBeDefined();
  });
});

describe('what a jewel works on', () => {
  it('only armor, shields and weapons (not tools, food or blocks), and one piece at a time', () => {
    for (const id of [toolId('pickaxe', 'iron'), I.APPLE, I.DIAMOND]) {
      for (const kind of ['dawn', 'rift', 'bloom'] as const) expect(useJewel(kind, makeStack(id, 1), () => 0)).toMatchObject({ used: false, stack: null });
    }
    expect(useJewel('dawn', { ...sword(), count: 2 }, () => 0).used).toBe(false);
    for (const id of [I.SHIELD, I.BOW, I.ORB, I.STAFF, armorId(0, 'leather')]) expect(useJewel('dawn', makeStack(id, 1), () => 0).ok).toBe(true);
  });
});

describe('what the upgrade gives', () => {
  it('grows with the level, a weapon in its damage and armor in health and protection', () => {
    for (let u = 2; u <= PLUS_MAX; u++) {
      const w1 = plusStats(I.GREATSWORD, u - 1)[0][1];
      const w2 = plusStats(I.GREATSWORD, u)[0][1];
      expect(w2).toBeGreaterThanOrEqual(w1);
    }
    expect(plusStats(I.GREATSWORD, 5)[0][0]).toBe('might');
    expect(plusStats(I.BOW, 5)[0][0]).toBe('aim');
    expect(plusStats(I.STAFF, 5)[0][0]).toBe('arcane');
    expect(plusStats(armorId(1, 'iron'), 5).map(([s]) => s)).toEqual(['vit', 'ward']);
    expect(plusStats(armorId(1, 'iron'), 0)).toEqual([]);
    expect(plusStats(I.APPLE, 9)).toEqual([]);
  });

  it('a +9 weapon is clearly more than a +1, and gets critical chance from +7', () => {
    expect(plusStats(I.GREATSWORD, 9)[0][1]).toBeGreaterThan(plusStats(I.GREATSWORD, 1)[0][1] * 5);
    expect(plusStats(I.GREATSWORD, 6).some(([s]) => s === 'crit')).toBe(false);
    expect(plusStats(I.GREATSWORD, 9).find(([s]) => s === 'crit')?.[1]).toBe(3);
    for (let u = 1; u <= PLUS_MAX; u++) for (const [s, v] of plusStats(I.GREATSWORD, u)) expect(v).toBeLessThanOrEqual(STAT_INFO[s].cap);
  });

  it('an upgrade grows the stats the piece has, in place (no stats of their own are added)', () => {
    const g: GearRoll = { r: 2, l: 10, c: 'warrior', s: [['might', 20], ['crit', 4]], u: 3, o: ['haste', 10] };
    const stats = allStats(I.GREATSWORD, g);
    expect(stats.map(([s]) => s)).toEqual(['might', 'crit', 'haste']);
    expect(stats[0][1]).toBe(grownValue(20, 3));
    expect(stats[1][1]).toBe(grownValue(4, 3));
    expect(stats[2][1]).toBe(grownValue(10, 3)); // the Bloom attribute grows with it
    // Not upgraded: as rolled.
    expect(allStats(I.GREATSWORD, { ...g, u: undefined }).map(([, v]) => v)).toEqual([20, 4, 10]);
  });

  it('every level makes every stat bigger, by about a tenth of it and at least a point every third level', () => {
    for (const v of [1, 3, 8, 14, 30]) {
      let last = v;
      for (let u = 1; u <= PLUS_MAX; u++) {
        const now = grownValue(v, u);
        expect(now).toBeGreaterThanOrEqual(last);
        last = now;
      }
      expect(grownValue(v, PLUS_MAX)).toBeGreaterThan(v);
      expect(grownValue(v, PLUS_MAX)).toBeLessThanOrEqual(v * 2.2 + 3);
    }
    expect(grownValue(14, 0)).toBe(14);
    expect(grownValue(20, 5)).toBe(20 + Math.round(20 * UPGRADE_STEP * 5));
    expect(grownValue(14, 99)).toBe(grownValue(14, UPGRADE_MAX));
  });

  it('the grown stats are what a wearer gets', () => {
    const rolled: ItemStack = { id: I.GREATSWORD, count: 1, damage: 0, gear: { r: 2, l: 1, c: 'warrior', s: [['might', 20]] } };
    const up: ItemStack = { ...rolled, gear: { ...rolled.gear!, u: 5 } };
    const who = { id: 'warrior' as const, level: 5 };
    const melee = (st: ItemStack): number => gearModifiers([st], who)[0].damage!.melee!;
    expect(melee(rolled)).toBeCloseTo(1.2, 5);
    expect(melee(up)).toBeCloseTo(1 + grownValue(20, 5) / 100, 5);
    expect(gearModifiers([up], who)).toHaveLength(1);
  });

  it('a plain +N piece adds stats to a class, with no level or class to reach, and none to a classless player', () => {
    const piece: ItemStack = { ...makeStack(I.GREATSWORD, 1), gear: { r: 0, l: 1, s: [], u: 5 } };
    expect(gearModifiers([piece], { id: 'mage', level: 1 })).toHaveLength(plusStats(I.GREATSWORD, 5).length);
    expect(gearModifiers([piece], null)).toEqual([]);
    expect(gearModifiers([sword()], { id: 'warrior', level: 1 })).toEqual([]);
  });

  it('the key follows the upgrade and the attribute', () => {
    const who = { id: 'warrior' as const, level: 3 };
    const a: ItemStack = { ...makeStack(I.GREATSWORD, 1), gear: { r: 0, l: 1, s: [], u: 3 } };
    const b: ItemStack = { ...makeStack(I.GREATSWORD, 1), gear: { r: 0, l: 1, s: [], u: 4 } };
    const c: ItemStack = { ...makeStack(I.GREATSWORD, 1), gear: { r: 0, l: 1, s: [], u: 3, o: ['crit', 2] } };
    expect(gearKey([a], who)).not.toBe(gearKey([b], who));
    expect(gearKey([a], who)).not.toBe(gearKey([c], who));
  });

  it('a worn +9 chestplate raises the health of the wearer, and the attribute adds on top', () => {
    const s = make('warrior');
    const plain = s.cls!.stats.maxHealth;
    s.armor.set(1, { ...makeStack(armorId(1, 'iron'), 1), gear: { r: 0, l: 1, s: [], u: 9 } });
    s.tick(idle());
    const plus9 = s.cls!.stats.maxHealth;
    expect(plus9).toBeGreaterThan(plain);
    s.armor.set(1, { ...makeStack(armorId(1, 'iron'), 1), gear: { r: 0, l: 1, s: [], u: 9, o: ['vit', 12] } });
    s.tick(idle());
    expect(s.cls!.stats.maxHealth).toBeGreaterThan(plus9);
    s.armor.set(1, null);
    s.tick(idle());
    expect(s.cls!.stats.maxHealth).toBe(plain);
  });
});

describe('saving, copying and sending', () => {
  const upgraded = (): ItemStack => ({ ...makeStack(I.GREATSWORD, 1), gear: { r: 0, l: 1, s: [], u: 7, o: ['crit', 3] } });

  it('survives a save and load, and a copy', () => {
    const c = new Container(4);
    c.set(0, upgraded());
    c.set(1, { ...makeStack(armorId(1, 'iron'), 1), gear: { r: 2, l: 9, s: [['vit', 6], ['ward', 3]], u: 3 } });
    const back = new Container(4);
    back.loadJSON(JSON.parse(JSON.stringify(c.toJSON())));
    expect(back.get(0)?.gear).toEqual({ r: 0, l: 1, s: [], u: 7, o: ['crit', 3] });
    expect(back.get(1)?.gear).toEqual({ r: 2, l: 9, s: [['vit', 6], ['ward', 3]], u: 3 });
    expect(cloneStack(upgraded()).gear).toEqual(upgraded().gear);
    const copy = cloneGear(upgraded().gear)!;
    copy.o![1] = 99;
    expect(upgraded().gear!.o![1]).toBe(3);
  });

  it('parseGear takes the new fields and drops what does not add up', () => {
    expect(parseGear({ r: 0, l: 1, s: [], u: 4 }, I.GREATSWORD)).toEqual({ r: 0, l: 1, s: [], u: 4 });
    expect(parseGear({ r: 0, l: 1, s: [], u: 99 }, I.GREATSWORD)?.u).toBe(UPGRADE_MAX);
    expect(parseGear({ r: 0, l: 1, s: [], o: ['crit', 3] }, I.GREATSWORD)).toEqual({ r: 0, l: 1, s: [], o: ['crit', 3] });
    // Nothing on it, or on something that cannot carry it: gone.
    expect(parseGear({ r: 0, l: 1, s: [] }, I.GREATSWORD)).toBeUndefined();
    expect(parseGear({ r: 0, l: 1, s: [], u: 3 }, I.APPLE)).toBeUndefined();
    expect(parseGear({ r: 0, l: 1, s: [], u: 0, o: ['nonsense', 3] }, I.GREATSWORD)).toBeUndefined();
    // A rarity 0 piece cannot smuggle in stats, a class or a level.
    expect(parseGear({ r: 0, l: 20, c: 'mage', s: [['might', 40]], u: 2 }, I.GREATSWORD)).toEqual({ r: 0, l: 1, s: [], u: 2 });
    // The attribute stays within its cap.
    expect(parseGear({ r: 1, l: 2, s: [['vit', 2]], o: ['crit', 500] }, armorId(1, 'iron'))?.o).toEqual(['crit', STAT_INFO.crit.cap]);
    expect(parseGear({ r: 4, l: 2, s: [['vit', 2]] }, armorId(1, 'iron'))).toBeUndefined();
  });

  it('is not merged with a plain one', () => {
    const c = new Container(2);
    c.set(0, upgraded());
    expect(c.get(0)!.gear).toBeDefined();
  });
});

describe('what it says', () => {
  it('names the piece with its level, and shows a plain one without a rarity or a level to reach', () => {
    const piece: ItemStack = { ...sword(), gear: { r: 0, l: 1, s: [], u: 5, o: ['haste', 6] } };
    expect(tooltipName(piece)).toBe('Iron Sword +5');
    const lines = tooltipLines(piece);
    const text = lines.map((l) => l.text);
    expect(lines[0].color).toBe('jewel');
    expect(text.some((t) => t.includes('Enhancement'))).toBe(false);
    expect(text.some((t) => t.startsWith('Bloom: '))).toBe(true);
    expect(text.some((t) => t.startsWith('Requires level'))).toBe(false);
    expect(text).toContain('Equipment');
    // What the upgrade gave a plain piece shows as its own stat lines, in gold.
    for (const [stat, v] of plusStats(piece.id, 5)) expect(lines.some((l) => l.text === statLine(stat, v) && l.color === 'jewel')).toBe(true);
  });

  it('a found piece keeps its rarity and gets the level on its name', () => {
    const found: ItemStack = { id: I.GREATSWORD, count: 1, damage: 0, gear: { r: 3, l: 12, c: 'warrior', s: [['might', 20], ['crit', 5], ['haste', 6]], u: 9 } };
    expect(tooltipName(found)).toBe('Greatsword of Might +9');
    const lines = tooltipLines(found);
    expect(lines[0].color).toBe('epic');
    expect(lines[1].text).toBe('Epic Equipment');
    expect(lines.map((l) => l.text)).toContain('Requires level 12');
    const text = lines.map((l) => l.text);
    expect(text.some((t) => t.includes('Enhancement'))).toBe(false);
    // The stats it rolled are shown grown, in place, in gold; they are not listed twice.
    expect(text).toContain(statLine('might', grownValue(20, 9)));
    expect(text).toContain(statLine('crit', grownValue(5, 9)));
    expect(text).toContain(statLine('haste', grownValue(6, 9)));
    expect(text).not.toContain(statLine('might', 20));
    expect(lines.filter((l) => l.text.endsWith('% Melee Damage'))).toHaveLength(1);
    expect(lines.find((l) => l.text === statLine('might', grownValue(20, 9)))?.color).toBe('jewel');
    // Not upgraded: as it rolled, in green.
    const plain = tooltipLines({ ...found, gear: { ...found.gear!, u: undefined } });
    expect(plain.find((l) => l.text === statLine('might', 20))?.color).toBe('good');
  });

  it('an anvil name keeps the level too', () => {
    const named: ItemStack = { ...sword(), name: 'Stormcaller', gear: { r: 0, l: 1, s: [], u: 2 } };
    expect(tooltipName(named)).toBe('Stormcaller +2');
  });
});

describe('using one in the inventory screen', () => {
  function open(jewel: number, count = 2, piece: ItemStack = sword()) {
    const s = make('warrior');
    s.inventory.set(10, piece);
    s.apply({ t: 'inventory' });
    expect(s.menu).not.toBeNull();
    s.menu!.cursor = makeStack(jewel, count);
    s.drainEvents();
    return s;
  }

  it('clicking a piece with a Jewel of Dawn raises it, uses up one jewel and tells the player', () => {
    const s = open(I.JEWEL_DAWN);
    s.apply({ t: 'click', slot: 10, button: 0 });
    expect(s.inventory.get(10)?.gear?.u).toBe(1);
    expect(s.inventory.get(10)?.id).toBe(toolId('sword', 'iron'));
    expect(s.menu!.cursor?.id).toBe(I.JEWEL_DAWN);
    expect(s.menu!.cursor?.count).toBe(1);
    const events = s.drainEvents();
    expect(events).toContainEqual({ t: 'jewel', ok: true, kind: 'dawn', slot: 10, label: '+1', detail: 'Upgraded' });
    expect(events.some((e) => e.t === 'toast' && e.text.includes('+1'))).toBe(true);
    expect(events).toContainEqual({ t: 'inv' });
  });

  it('the last jewel empties the hand, and the piece can be raised again with another', () => {
    const s = open(I.JEWEL_DAWN, 1);
    s.apply({ t: 'click', slot: 10, button: 0 });
    expect(s.menu!.cursor).toBeNull();
    s.menu!.cursor = makeStack(I.JEWEL_DAWN, 1);
    s.apply({ t: 'click', slot: 10, button: 0 });
    expect(s.inventory.get(10)?.gear?.u).toBe(2);
  });

  it('a refusal keeps the jewel in the hand and the piece as it was', () => {
    const piece: ItemStack = { ...sword(), gear: { r: 0, l: 1, s: [], u: 6 } };
    const s = open(I.JEWEL_DAWN, 2, piece);
    s.apply({ t: 'click', slot: 10, button: 0 });
    expect(s.inventory.get(10)?.gear?.u).toBe(6);
    expect(s.menu!.cursor?.count).toBe(2);
    expect(toasts(s).some((t) => t.includes('Rift'))).toBe(true);
  });

  it('on an empty slot or on something that is not equipment it is put down as any item would be', () => {
    const s = open(I.JEWEL_RIFT, 1);
    s.apply({ t: 'click', slot: 11, button: 0 });
    expect(s.inventory.get(11)?.id).toBe(I.JEWEL_RIFT);
    expect(s.menu!.cursor).toBeNull();
    // A jewel dropped on food swaps with it.
    s.inventory.set(12, makeStack(I.APPLE, 3));
    s.menu!.cursor = makeStack(I.JEWEL_BLOOM, 1);
    s.apply({ t: 'click', slot: 12, button: 0 });
    expect(s.inventory.get(12)?.id).toBe(I.JEWEL_BLOOM);
    expect(s.menu!.cursor?.id).toBe(I.APPLE);
  });

  it('works on the armor being worn', () => {
    const s = make('warrior');
    s.armor.set(1, makeStack(armorId(1, 'iron'), 1));
    s.apply({ t: 'inventory' });
    const slot = s.menu!.slots.findIndex((x) => x.container === s.armor && x.index === 1);
    expect(slot).toBeGreaterThanOrEqual(0);
    s.menu!.cursor = makeStack(I.JEWEL_DAWN, 1);
    s.apply({ t: 'click', slot, button: 0 });
    expect(s.armor.get(1)?.gear?.u).toBe(1);
    expect(s.menu!.cursor).toBeNull();
  });

  it('the stats of the worn piece follow at once', () => {
    const s = make('warrior');
    s.armor.set(1, makeStack(armorId(1, 'iron'), 1));
    s.tick(idle());
    const before = s.cls!.stats.maxHealth;
    s.apply({ t: 'inventory' });
    const slot = s.menu!.slots.findIndex((x) => x.container === s.armor && x.index === 1);
    for (let i = 0; i < 6; i++) {
      s.menu!.cursor = makeStack(I.JEWEL_DAWN, 1);
      s.apply({ t: 'click', slot, button: 0 });
    }
    s.tick(idle());
    expect(s.armor.get(1)?.gear?.u).toBe(6);
    expect(s.cls!.stats.maxHealth).toBeGreaterThan(before);
  });

  it('the screen knows which pieces the jewel in hand would work on', () => {
    const s = make('warrior');
    s.inventory.set(10, sword());
    s.inventory.set(11, { ...sword(), gear: { r: 0, l: 1, s: [], u: 6 } });
    s.inventory.set(12, makeStack(I.APPLE, 3));
    s.armor.set(1, makeStack(armorId(1, 'iron'), 1));
    s.apply({ t: 'inventory' });
    const m = s.menu!;
    const armorSlot = m.slots.findIndex((x) => x.container === s.armor && x.index === 1);
    // Nothing in hand: nothing is marked.
    expect([10, 11, 12, armorSlot].some((i) => m.jewelFits(i))).toBe(false);
    m.cursor = makeStack(I.JEWEL_DAWN, 1);
    expect(m.jewelFits(10)).toBe(true);
    expect(m.jewelFits(11)).toBe(false); // +6 is as far as Dawn goes
    expect(m.jewelFits(12)).toBe(false);
    expect(m.jewelFits(13)).toBe(false); // empty
    expect(m.jewelFits(armorSlot)).toBe(true);
    m.cursor = makeStack(I.JEWEL_RIFT, 1);
    expect(m.jewelFits(11)).toBe(true);
    m.cursor = makeStack(I.APPLE, 1);
    expect(m.jewelFits(10)).toBe(false);
  });

  it('a right-click does not use it (that splits the stack as it always does)', () => {
    const s = open(I.JEWEL_DAWN, 4);
    s.apply({ t: 'click', slot: 10, button: 1 });
    expect(s.inventory.get(10)?.gear).toBeUndefined();
  });

  it('every stack in the bags that holds the same plain piece stays separate from an enhanced one', () => {
    const s = make('warrior');
    s.inventory.set(0, sword());
    s.inventory.set(1, { ...sword(), gear: { r: 0, l: 1, s: [], u: 1 } });
    expect(s.inventory.get(0)?.gear).toBeUndefined();
    expect(s.inventory.get(1)?.gear?.u).toBe(1);
  });
});

describe('going past +9 in the crafting grid', () => {
  const at = (u: number): ItemStack => ({ ...sword(), gear: { r: 0, l: 1, s: [], u } });
  const jewels = (kind: number, n: number): ItemStack[] => Array.from({ length: n }, () => makeStack(kind, 1));

  it('costs as many Jewels of the Rift and of Dawn as the step is above +9', () => {
    expect(UPGRADE_MAX).toBe(13);
    expect([9, 10, 11, 12].map(forgeCost)).toEqual([1, 2, 3, 4]);
    expect(forgeCost(8)).toBeNull();
    expect(forgeCost(UPGRADE_MAX)).toBeNull();
  });

  it('makes +10 from the piece at +9, one Rift and one Dawn, and so on up to +13 (never failing)', () => {
    for (let plus = 9; plus < UPGRADE_MAX; plus++) {
      const n = plus - 8;
      const grid = [at(plus), ...jewels(I.JEWEL_RIFT, n), ...jewels(I.JEWEL_DAWN, n)];
      const out = forgeUpgrade(grid);
      expect(out?.gear?.u, `+${plus + 1}`).toBe(plus + 1);
      expect(out?.id).toBe(toolId('sword', 'iron'));
      // Whatever order the cells are in.
      expect(forgeUpgrade([...grid].reverse())?.gear?.u).toBe(plus + 1);
    }
    expect(tooltipName(forgeUpgrade([at(9), makeStack(I.JEWEL_RIFT, 1), makeStack(I.JEWEL_DAWN, 1)])!)).toBe('Iron Sword +10');
  });

  it('keeps the rest of the piece, and leaves the one in the grid alone', () => {
    const found: ItemStack = { id: I.GREATSWORD, count: 1, damage: 4, name: 'Stormcaller', gear: { r: 3, l: 12, c: 'warrior', s: [['might', 20], ['crit', 5]], u: 9, o: ['haste', 8] } };
    const out = forgeUpgrade([found, makeStack(I.JEWEL_RIFT, 1), makeStack(I.JEWEL_DAWN, 1)])!;
    expect(out.gear).toEqual({ r: 3, l: 12, c: 'warrior', s: [['might', 20], ['crit', 5]], u: 10, o: ['haste', 8] });
    expect(out.name).toBe('Stormcaller');
    expect(out.damage).toBe(4);
    expect(found.gear!.u).toBe(9);
  });

  it('wants exactly the right grid: not too few, too many, the wrong jewel, a piece below +9, +13, or anything else in it', () => {
    const rift = makeStack(I.JEWEL_RIFT, 1);
    const dawn = makeStack(I.JEWEL_DAWN, 1);
    const bloom = makeStack(I.JEWEL_BLOOM, 1);
    expect(forgeUpgrade([at(9), rift])).toBeNull();
    expect(forgeUpgrade([at(9), rift, rift, dawn])).toBeNull();
    expect(forgeUpgrade([at(9), rift, bloom])).toBeNull();
    expect(forgeUpgrade([at(10), rift, dawn])).toBeNull(); // +11 asks for two of each
    expect(forgeUpgrade([at(8), rift, dawn])).toBeNull();
    expect(forgeUpgrade([sword(), rift, dawn])).toBeNull();
    expect(forgeUpgrade([at(UPGRADE_MAX), ...jewels(I.JEWEL_RIFT, 5), ...jewels(I.JEWEL_DAWN, 5)])).toBeNull();
    expect(forgeUpgrade([at(9), rift, dawn, makeStack(I.APPLE, 1)])).toBeNull();
    expect(forgeUpgrade([at(9), at(9), rift, dawn])).toBeNull();
    expect(forgeUpgrade([rift, dawn])).toBeNull();
    expect(forgeUpgrade([])).toBeNull();
  });

  it('the Jewels of Dawn and of the Rift stop at +9 on the piece itself and point to the crafting grid', () => {
    const r = useJewel('rift', at(9), () => 0);
    expect(r).toMatchObject({ used: false, stack: null });
    expect(r.text).toContain('crafting grid');
    expect(useJewel('dawn', at(9), () => 0).text).toContain('crafting grid');
    expect(useJewel('rift', at(UPGRADE_MAX), () => 0).text).toContain('cannot be raised');
  });

  it('is a recipe of the crafting screen: the result appears, taking it uses the jewels, and it works at the table', () => {
    const s = make('warrior');
    s.openScreen('crafting');
    const m = s.menu as CraftingMenu;
    m.grid.set(0, at(10));
    m.grid.set(1, makeStack(I.JEWEL_RIFT, 2));
    m.grid.set(2, makeStack(I.JEWEL_DAWN, 1));
    m.grid.set(3, makeStack(I.JEWEL_DAWN, 1));
    m.recalc();
    // The result is not shown ahead (it depends on the dice): the button is what starts it.
    expect(m.result.get(0)).toBeNull();
    expect(m.forgeReady()).toMatchObject({ plus: 10, chance: 0.25 });
    expect(m.startForge(() => 0)).toBe(true);
    expect(m.forging).not.toBeNull();
    // While it works the grid is locked and nothing can be started again.
    s.apply({ t: 'click', slot: m.gridStart, button: 0 });
    expect(m.cursor).toBeNull();
    expect(m.grid.get(0)?.gear?.u).toBe(10);
    expect(m.startForge(() => 0)).toBe(false);
    expect(m.stepForge(FORGE_TIME - 0.1)).toBeNull();
    const done = m.stepForge(0.2)!;
    expect(done.ok).toBe(true);
    expect(m.forging).toBeNull();
    expect(m.grid.drain()).toEqual([]);
    expect(m.result.get(0)?.gear?.u).toBe(11);
    s.apply({ t: 'click', slot: m.resultSlot, button: 0 });
    expect(m.cursor?.gear?.u).toBe(11);
    expect(m.result.get(0)).toBeNull();
  });

  it('it takes one in four, a failure costs a step, and the jewels are lost either way', () => {
    const grid = [at(9), makeStack(I.JEWEL_RIFT, 1), makeStack(I.JEWEL_DAWN, 1)];
    const ok = forgeOutcome(grid, () => FORGE_CHANCE - 0.001)!;
    expect(ok).toMatchObject({ ok: true, label: '+10' });
    expect(ok.stack.gear?.u).toBe(10);
    const bad = forgeOutcome(grid, () => FORGE_CHANCE + 0.001)!;
    expect(bad).toMatchObject({ ok: false, label: 'Failed', detail: '+9 > +8' });
    expect(bad.stack.gear?.u).toBe(8);
    expect(forgeOutcome([at(9)], () => 0)).toBeNull();
    // Through the screen: a failure leaves the lowered piece in the result slot and nothing in the grid.
    const s = make('warrior');
    s.openScreen('crafting');
    const m = s.menu as CraftingMenu;
    grid.forEach((c, i) => m.grid.set(i, c));
    m.recalc();
    expect(m.startForge(() => 0.99)).toBe(true);
    m.stepForge(FORGE_TIME + 0.1);
    expect(m.result.get(0)?.gear?.u).toBe(8);
    expect(m.grid.drain()).toEqual([]);
    // Closing the screen with the forge at work finishes it, and nothing is lost.
    const s2 = make('warrior');
    s2.openScreen('crafting');
    const m2 = s2.menu as CraftingMenu;
    grid.forEach((c, i) => m2.grid.set(i, c));
    m2.recalc();
    m2.startForge(() => 0);
    const out = m2.close();
    expect(out.map((o) => o.gear?.u)).toEqual([10]);
  });

  it('the session runs the forge in time and tells the client', () => {
    const s = make('warrior');
    s.openScreen('crafting');
    const m = s.menu as CraftingMenu;
    [at(9), makeStack(I.JEWEL_RIFT, 1), makeStack(I.JEWEL_DAWN, 1)].forEach((c, i) => m.grid.set(i, c));
    m.recalc();
    s.drainEvents();
    s.apply({ t: 'forge' });
    expect(s.drainEvents().some((e) => e.t === 'forgeStart' && !e.craft)).toBe(true);
    for (let t = 0; t < FORGE_TIME - 0.2; t += 1 / 20) s.tick(idle());
    expect(m.forging).not.toBeNull();
    for (let t = 0; t < 0.6; t += 1 / 20) s.tick(idle());
    expect(m.forging).toBeNull();
    const ev = s.drainEvents();
    expect(ev.find((e) => e.t === 'jewel')).toMatchObject({ slot: m.resultSlot });
    expect(m.result.get(0)?.gear?.u).toBeGreaterThanOrEqual(8);
  });

  it('+10 fits the 2x2 grid of the inventory, +11 needs the table', () => {
    const s = make('warrior');
    s.apply({ t: 'inventory' });
    const m = s.menu as CraftingMenu;
    expect(m.size).toBe(2);
    m.grid.set(0, at(9));
    m.grid.set(1, makeStack(I.JEWEL_RIFT, 1));
    m.grid.set(2, makeStack(I.JEWEL_DAWN, 1));
    m.recalc();
    expect(m.forgeReady()).toMatchObject({ plus: 9 });
  });

  it('says what a piece that is ready for it needs, on its tooltip', () => {
    expect(forgeHint(at(9))).toContain('1 Jewel of the Rift and 1 Jewel of Dawn');
    expect(forgeHint(at(11))).toContain('To +12');
    expect(forgeHint(at(11))).toContain('3 Jewels of the Rift and 3 Jewels of Dawn');
    expect(forgeHint(at(5))).toBeNull();
    expect(forgeHint(makeStack(I.APPLE, 1))).toBeNull();
    expect(tooltipLines(at(10)).some((l) => l.text.startsWith('To +11'))).toBe(true);
    expect(tooltipLines(at(5)).some((l) => l.text.startsWith('To +'))).toBe(false);
  });

  it('the book has the four steps, with ghosts where the jewels go', () => {
    expect(FORGE_TARGETS).toEqual([10, 11, 12, 13]);
    expect(forgeTarget(forgeIndex(12))).toBe(12);
    expect(forgeTarget(5)).toBeNull();
    expect(forgeTarget(FORGE_BASE + 4)).toBeNull();
    expect(FORGE_BASE).toBeGreaterThan(RECIPES.length);
    expect(forgeLayout(10, 9)).toEqual([0, I.JEWEL_RIFT, I.JEWEL_DAWN, 0, 0, 0, 0, 0, 0]);
    expect(forgeLayout(13, 9)).toEqual([0, ...Array(4).fill(I.JEWEL_RIFT), ...Array(4).fill(I.JEWEL_DAWN)]);
    expect(forgeLayout(11, 4)).toBeNull();
    expect(forgeLayout(10, 4)).not.toBeNull();
    // A piece in the grid ghosts the jewels still missing, the Rifts first.
    const grid = Array(9).fill(null) as (ItemStack | null)[];
    grid[4] = at(11);
    expect(forgeGhosts(grid)).toEqual([I.JEWEL_RIFT, I.JEWEL_RIFT, I.JEWEL_RIFT, I.JEWEL_DAWN, 0, I.JEWEL_DAWN, I.JEWEL_DAWN, 0, 0]);
    grid[0] = makeStack(I.JEWEL_RIFT, 1);
    expect(forgeGhosts(grid)![0]).toBe(0);
    expect(forgeGhosts(grid)!.filter((g) => g === I.JEWEL_RIFT)).toHaveLength(2);
    grid[8] = makeStack(I.APPLE, 1);
    expect(forgeGhosts(grid)).toBeNull();
    expect(forgeGhosts(Array(9).fill(null))).toBeNull();
  });

  it('a click in the book lays the piece and the jewels out in the grid', () => {
    const s = make('warrior');
    s.openScreen('crafting');
    const m = s.menu as CraftingMenu;
    expect(m.fillRecipe(forgeIndex(11), false)).toBe(false);
    s.inventory.add(at(10));
    s.inventory.add(makeStack(I.JEWEL_RIFT, 2));
    s.inventory.add(makeStack(I.JEWEL_DAWN, 1));
    expect(m.fillRecipe(forgeIndex(11), false)).toBe(false);
    expect(s.inventory.countOf(I.JEWEL_RIFT)).toBe(2);
    s.inventory.add(makeStack(I.JEWEL_DAWN, 1));
    expect(m.fillRecipe(forgeIndex(11), false)).toBe(true);
    expect(m.grid.get(0)?.gear?.u).toBe(10);
    expect(m.grid.get(1)?.id).toBe(I.JEWEL_RIFT);
    expect(m.grid.get(2)?.id).toBe(I.JEWEL_RIFT);
    expect(m.grid.get(3)?.id).toBe(I.JEWEL_DAWN);
    expect(m.grid.get(4)?.id).toBe(I.JEWEL_DAWN);
    expect(m.forgeReady()).toMatchObject({ plus: 10 });
    expect(s.inventory.countOf(I.JEWEL_RIFT)).toBe(0);
    expect(s.inventory.countOf(I.JEWEL_DAWN)).toBe(0);
    // The inventory's 2x2 grid has room for +10 only.
    const s2 = make('warrior');
    s2.apply({ t: 'inventory' });
    const small = s2.menu as CraftingMenu;
    s2.inventory.add(at(10));
    s2.inventory.add(makeStack(I.JEWEL_RIFT, 2));
    s2.inventory.add(makeStack(I.JEWEL_DAWN, 2));
    // Jewels stack, so +11 fits as the piece and a stack of each.
    expect(small.fillRecipe(forgeIndex(11), false)).toBe(true);
    expect(small.grid.get(1)).toMatchObject({ id: I.JEWEL_RIFT, count: 2 });
    expect(small.grid.get(2)).toMatchObject({ id: I.JEWEL_DAWN, count: 2 });
    expect(small.forgeReady()).toMatchObject({ plus: 10 });
  });

  it('stacks of jewels count for all their jewels', () => {
    const stacked = [at(10), makeStack(I.JEWEL_RIFT, 2), makeStack(I.JEWEL_DAWN, 2), null];
    expect(forgeUpgrade(stacked)?.gear?.u).toBe(11);
    expect(forgeUpgrade([at(10), makeStack(I.JEWEL_RIFT, 2), makeStack(I.JEWEL_DAWN, 3)])).toBeNull();
    expect(forgeUpgrade([at(12), makeStack(I.JEWEL_RIFT, 4), makeStack(I.JEWEL_DAWN, 4)])?.gear?.u).toBe(13);
    // Ghosts count them too: one Dawn is missing.
    expect(forgeGhosts([at(10), makeStack(I.JEWEL_RIFT, 2), makeStack(I.JEWEL_DAWN, 1), null])).toEqual([0, 0, 0, I.JEWEL_DAWN]);
  });

  it('in the 2x2 grid the ghosts are a stack of each, with the number', () => {
    // +11 asks for two of each: the piece and three empty cells are not enough for one to a cell.
    expect(forgeGhostPlan([at(10), null, null, null])).toEqual({ ids: [0, I.JEWEL_RIFT, I.JEWEL_DAWN, 0], counts: [1, 2, 2, 1] });
    // With one Rift in already: one more Rift, and the two Dawns as a stack.
    expect(forgeGhostPlan([at(10), makeStack(I.JEWEL_RIFT, 1), null, null])).toEqual({ ids: [0, 0, I.JEWEL_RIFT, I.JEWEL_DAWN], counts: [1, 1, 1, 2] });
    // With all the Rifts in, the two Dawns fit one to a cell.
    expect(forgeGhostPlan([at(10), makeStack(I.JEWEL_RIFT, 2), null, null])).toEqual({ ids: [0, 0, I.JEWEL_DAWN, I.JEWEL_DAWN], counts: [1, 1, 1, 1] });
    // +13 in the 2x2: four Rifts and four Dawns.
    expect(forgeGhostPlan([at(12), null, null, null])!.counts).toEqual([1, 4, 4, 1]);
    expect(forgeGhostLayout(13, 4)).toEqual({ ids: [0, I.JEWEL_RIFT, I.JEWEL_DAWN, 0], counts: [1, 4, 4, 1] });
    // On the table one to a cell, as before.
    expect(forgeGhostLayout(11, 9)!.counts.every((n) => n === 1)).toBe(true);
    expect(forgeGhostLayout(11, 2)).toBeNull();
  });

  it('the stats keep growing, and the price too', () => {
    const stats = (u: number) => allStats(I.GREATSWORD, { r: 2, l: 10, c: 'warrior', s: [['might', 20]], u })[0][1];
    for (let u = 10; u <= UPGRADE_MAX; u++) expect(stats(u)).toBeGreaterThan(stats(u - 1));
    const price = (u: number): number => stackSellPrice({ ...makeStack(toolId('sword', 'diamond'), 1), gear: { r: 0, l: 1, s: [], u } });
    for (let u = 10; u <= UPGRADE_MAX; u++) expect(price(u)).toBeGreaterThan(price(u - 1));
  });
});

describe('where they are found and sold', () => {
  it('monsters leave them now and then, Dawn most often and Bloom least', () => {
    expect(jewelDrop('cow', () => 0)).toBeNull();
    expect(jewelDropChance('cow')).toBe(0);
    expect(jewelDropChance('enderman')).toBeGreaterThan(jewelDropChance('zombie'));
    const kinds = { dawn: 0, rift: 0, bloom: 0 };
    const rand = mulberry32(99);
    let drops = 0;
    for (let i = 0; i < 40000; i++) {
      const id = jewelDrop('enderman', rand);
      if (id === null) continue;
      drops++;
      kinds[jewelKind(id)!]++;
    }
    expect(drops / 40000).toBeGreaterThan(jewelDropChance('enderman') * 0.8);
    expect(drops / 40000).toBeLessThan(jewelDropChance('enderman') * 1.2);
    expect(kinds.dawn).toBeGreaterThan(kinds.rift);
    expect(kinds.rift).toBeGreaterThan(kinds.bloom);
    expect(kinds.bloom).toBeGreaterThan(0);
  });

  it('a killed zombie leaves one on the ground once the dice say so', () => {
    const s = make('warrior');
    let found = 0;
    for (let seed = 1; seed <= 300 && found === 0; seed++) {
      const t = make('warrior', seed);
      const p = t.body;
      const mob = t.mobs.spawn('zombie', p.x + 3, p.y, p.z + 3)!;
      mob.health = 1;
      t.mobs.damage(mob, 99, 0, 0, t.realm.mobEvents, true, true, true);
      const dropped = [...t.drops.drops].filter((d) => jewelKind(d.stack.id));
      found += dropped.length;
      // The player hears it, and only when there is a jewel.
      const heard = t.drainEvents().filter((e) => e.t === 'jewelDrop');
      expect(heard.length).toBe(dropped.length);
      for (const e of heard) if (e.t === 'jewelDrop') expect(e.vol).toBeGreaterThan(0);
    }
    expect(s).toBeDefined();
    expect(found).toBeGreaterThan(0);
  });

  it('a jewel the player drops on the ground (from the hand or from the open screen) has the drop sound, other items do not', () => {
    const heard = (s: GameSession): number => s.drainEvents().filter((e) => e.t === 'jewelDrop').length;
    const s = make('warrior');
    s.inventory.set(0, makeStack(I.JEWEL_RIFT, 3));
    s.selectSlot(0);
    s.drainEvents();
    s.apply({ t: 'drop', all: false });
    expect(heard(s)).toBe(1);
    expect(s.inventory.get(0)?.count).toBe(2);
    // From the cursor, outside the open screen.
    s.apply({ t: 'inventory' });
    s.menu!.cursor = makeStack(I.JEWEL_BLOOM, 2);
    s.drainEvents();
    s.apply({ t: 'dropCursor', all: true });
    expect(heard(s)).toBe(1);
    // Anything else falls without it.
    s.menu!.cursor = makeStack(I.APPLE, 2);
    s.apply({ t: 'dropCursor', all: true });
    expect(heard(s)).toBe(0);
  });

  it('dungeon, temple and mineshaft chests can hold them', () => {
    const rand = mulberry32(7);
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      for (const table of [LOOT_TABLES.dungeon, LOOT_TABLES.temple, LOOT_TABLES.mineshaft]) {
        for (const stack of rollChest(table, rand)) if (stack && jewelKind(stack.id)) seen.add(stack.id);
      }
    }
    expect(seen.has(I.JEWEL_DAWN)).toBe(true);
    expect(seen.has(I.JEWEL_RIFT)).toBe(true);
    expect(seen.has(I.JEWEL_BLOOM)).toBe(true);
  });

  it('the arcanist sells all three, and nobody else', () => {
    const stock = shopOf('lysa')!.stock;
    for (const j of JEWELS) {
      const ware = stock.find((w) => w.id === j.id);
      expect(ware, j.name).toBeDefined();
      expect(ware!.gear).toBeUndefined();
    }
    const price = (id: number): number => stock.find((w) => w.id === id)!.price;
    expect(price(I.JEWEL_DAWN)).toBeLessThan(price(I.JEWEL_RIFT));
    expect(price(I.JEWEL_RIFT)).toBeLessThan(price(I.JEWEL_BLOOM));
    for (const npc of ['tobin', 'hilda', 'garrick', 'fenna']) expect(shopOf(npc)!.stock.some((w) => jewelKind(w.id) !== null)).toBe(false);
  });

  it('a spare jewel sells for less than it costs, and an enhanced piece for more than a plain one', () => {
    for (const j of JEWELS) {
      const cost = shopOf('lysa')!.stock.find((w) => w.id === j.id)!.price;
      const sell = stackSellPrice(makeStack(j.id, 1));
      expect(sell).toBeGreaterThan(0);
      expect(sell).toBeLessThan(cost);
    }
    const plain = stackSellPrice(makeStack(toolId('sword', 'diamond'), 1));
    const plus5 = stackSellPrice({ ...makeStack(toolId('sword', 'diamond'), 1), gear: { r: 0, l: 1, s: [], u: 5 } });
    const plus9 = stackSellPrice({ ...makeStack(toolId('sword', 'diamond'), 1), gear: { r: 0, l: 1, s: [], u: 9 } });
    expect(plus5).toBeGreaterThan(plain);
    expect(plus9).toBeGreaterThan(plus5);
  });
});

describe('crafting with the button, for every recipe', () => {
  it('a recipe is a preview in the result slot until the button makes it, and the items are used up at the end', () => {
    const s = make('warrior');
    s.openScreen('crafting');
    const m = s.menu as CraftingMenu;
    m.grid.set(0, makeStack(B.LOG, 3));
    m.recalc();
    expect(m.result.get(0)).toMatchObject({ id: B.PLANKS, count: 4 });
    expect(m.craftReady()).toMatchObject({ id: B.PLANKS });
    expect(m.hasMade).toBe(false);
    s.drainEvents();
    s.apply({ t: 'forge' });
    expect(s.drainEvents().some((e) => e.t === 'forgeStart' && e.craft)).toBe(true);
    // While it works: the items are still in the grid, nothing to take, nothing to start again.
    expect(m.forging?.duration).toBe(CRAFT_TIME);
    expect(m.grid.get(0)?.count).toBe(3);
    expect(m.result.get(0)).toBeNull();
    expect(m.craftReady()).toBeNull();
    for (let t = 0; t < CRAFT_TIME + 0.2; t += 1 / 20) s.tick(idle());
    expect(m.forging).toBeNull();
    expect(m.grid.get(0)?.count).toBe(2);
    expect(m.hasMade).toBe(true);
    expect(m.result.get(0)).toMatchObject({ id: B.PLANKS, count: 4 });
    const ev = s.drainEvents();
    expect(ev.find((e) => e.t === 'crafted')).toMatchObject({ slot: m.resultSlot });
    // What was made waits to be taken: another craft cannot start, and changing the grid does not lose it.
    expect(m.startForge(() => 0)).toBe(false);
    m.recalc();
    expect(m.result.get(0)?.count).toBe(4);
    s.apply({ t: 'click', slot: m.resultSlot, button: 0 });
    expect(m.cursor).toMatchObject({ id: B.PLANKS, count: 4 });
    expect(m.hasMade).toBe(false);
    // The items left in the grid make a new preview.
    expect(m.result.get(0)).toMatchObject({ id: B.PLANKS, count: 4 });
  });

  it('shift on the button crafts as many as the items allow, in one go', () => {
    const s = make('warrior');
    s.openScreen('crafting');
    const m = s.menu as CraftingMenu;
    m.grid.set(0, makeStack(B.LOG, 5));
    m.recalc();
    expect(m.startForge(() => 0, true)).toBe(true);
    m.stepForge(CRAFT_TIME + 0.1);
    expect(m.grid.get(0)).toBeNull();
    expect(m.result.get(0)).toMatchObject({ id: B.PLANKS, count: 20 });
  });

  it('there is nothing to start without a recipe, the grid is locked while it works, and closing loses nothing', () => {
    const s = make('warrior');
    s.openScreen('crafting');
    const m = s.menu as CraftingMenu;
    expect(m.startForge(() => 0)).toBe(false);
    m.grid.set(0, makeStack(B.LOG, 1));
    m.recalc();
    m.startForge(() => 0);
    s.apply({ t: 'shift', slot: m.gridStart });
    expect(m.grid.get(0)?.count).toBe(1);
    expect(m.fillRecipe(0, false)).toBe(false);
    const out = m.close();
    expect(out).toMatchObject([{ id: B.PLANKS, count: 4 }]);
    expect(m.grid.drain()).toEqual([]);
  });
});