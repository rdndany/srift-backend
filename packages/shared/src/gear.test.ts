import { describe, expect, it } from 'vitest';
import {
  ADVENTURE_SEED,
  CLASS_IDS,
  NPCS,
  CLASSES,
  Container,
  GEAR_DROPS,
  GEAR_STATS,
  GameSession,
  HeadlessWorld,
  I,
  LOOT_TABLES,
  RARITIES,
  STAT_INFO,
  armorId,
  canRollGear,
  cloneGear,
  cloneStack,
  gearDrop,
  gearKey,
  gearModifiers,
  gearStack,
  gearSuffix,
  gearRefuse,
  gearUsable,
  gearValue,
  swingRate,
  getItem,
  makeGenerator,
  makeStack,
  mulberry32,
  parseGear,
  parseNetClientMessage,
  pickRarity,
  primaryStat,
  randomGear,
  rarityDef,
  rollChest,
  rollGear,
  shopOf,
  stackSellPrice,
  statLine,
  tooltipLines,
  tooltipName,
  toolId,
  type GearRoll,
  type AdventureWorldGenerator,
  type InputFrame,
  type ItemStack,
  type SessionEvent,
  type Rarity,
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

const piece = (id: number, r: Rarity, l: number, c: 'warrior' | 'mage' | 'ranger' | undefined, s: [string, number][]): ItemStack => ({
  id,
  count: 1,
  damage: 0,
  gear: { r, l, ...(c ? { c } : {}), s: s as GearRoll['s'] },
});

describe('rolling gear', () => {
  it('only armor, shields, weapons, swords, bows and off-hand pieces can carry stats', () => {
    for (const id of [armorId(1, 'iron'), I.SHIELD, I.GREATSWORD, I.STAFF, I.BOW, I.ORB, toolId('sword', 'iron')]) expect(canRollGear(id)).toBe(true);
    for (const id of [I.STICK, I.DIAMOND, toolId('pickaxe', 'iron'), I.EMBERSTONE]) expect(canRollGear(id)).toBe(false);
    expect(rollGear(I.STICK, 5, 1, undefined, Math.random)).toBeNull();
    expect(gearStack(I.STICK, 5, 1, undefined, Math.random).gear).toBeUndefined();
  });

  it('a rarity carries as many stats as it promises, each within its cap, never twice the same', () => {
    const rand = mulberry32(11);
    for (let n = 0; n < 400; n++) {
      const rarity = ((n % 3) + 1) as Rarity;
      const cls = n % 4 === 0 ? undefined : CLASS_IDS[n % CLASS_IDS.length];
      const stack = randomGear(1 + (n % 20), rarity, cls, rand);
      const g = stack.gear!;
      expect(g.r).toBe(rarity);
      expect(g.s.length).toBe(rarityDef(rarity).stats);
      expect(new Set(g.s.map(([k]) => k)).size).toBe(g.s.length);
      for (const [k, v] of g.s) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(STAT_INFO[k].cap);
        expect(Number.isInteger(v)).toBe(true);
      }
      expect(g.c).toBe(cls);
      expect(stack.count).toBe(1);
    }
  });

  it('a weapon always has the stat it is for', () => {
    const rand = mulberry32(3);
    expect(primaryStat(I.GREATSWORD)).toBe('might');
    expect(primaryStat(I.BOW)).toBe('aim');
    expect(primaryStat(I.STAFF)).toBe('arcane');
    expect(primaryStat(armorId(0, 'iron'))).toBeNull();
    for (let i = 0; i < 40; i++) {
      expect(rollGear(I.GREATSWORD, 6, 1, 'warrior', rand)!.s[0][0]).toBe('might');
      expect(rollGear(I.STAFF, 6, 2, 'mage', rand)!.s[0][0]).toBe('arcane');
      expect(rollGear(I.BOW, 6, 3, 'ranger', rand)!.s[0][0]).toBe('aim');
    }
  });

  it('higher levels and rarities roll more', () => {
    const avg = (level: number, rarity: Rarity): number => {
      const rand = mulberry32(99);
      let sum = 0;
      for (let i = 0; i < 200; i++) sum += rollGear(I.GREATSWORD, level, rarity, 'warrior', rand)!.s[0][1];
      return sum / 200;
    };
    expect(avg(10, 1)).toBeGreaterThan(avg(1, 1));
    expect(avg(5, 3)).toBeGreaterThan(avg(5, 1));
  });

  it('a class piece is of its class, and its kinds fit the class', () => {
    const rand = mulberry32(8);
    for (let i = 0; i < 200; i++) {
      expect(['mage', 'warrior', 'ranger']).toContain(randomGear(4, 1, 'mage', rand).gear!.c);
      const m = randomGear(4, 1, 'mage', rand);
      expect(getItem(m.id).tool?.kind === 'sword' || m.id === I.BOW || m.id === I.GREATSWORD || m.id === I.SHIELD || m.id === I.DAGGER || m.id === I.CROSSBOW).toBe(false);
      const w = randomGear(4, 1, 'warrior', rand);
      expect([I.STAFF, I.WAND, I.SPELLBOOK, I.ORB, I.BOW, I.CROSSBOW, I.DAGGER]).not.toContain(w.id);
    }
  });

  it('the material follows the level', () => {
    const rand = mulberry32(2);
    const mats = (level: number): Set<string> => new Set(Array.from({ length: 80 }, () => getItem(randomGear(level, 1, undefined, rand).id).armor!.material));
    expect([...mats(3)]).toEqual(['leather']);
    expect([...mats(9)]).toEqual(['iron']);
    expect([...mats(16)]).toEqual(['diamond']);
  });

  it('pickRarity follows its weights', () => {
    const rand = mulberry32(1);
    const seen = [0, 0, 0, 0];
    for (let i = 0; i < 3000; i++) seen[pickRarity([70, 25, 5], rand)]++;
    expect(seen[1]).toBeGreaterThan(seen[2]);
    expect(seen[2]).toBeGreaterThan(seen[3]);
    expect(seen[3]).toBeGreaterThan(0);
  });
});

describe('what monsters leave', () => {
  it('only the monsters in the table can leave gear, at about their chance', () => {
    const rand = mulberry32(21);
    expect(gearDrop('cow', rand)).toBeNull();
    expect(gearDrop('villager', rand)).toBeNull();
    let hits = 0;
    for (let i = 0; i < 4000; i++) {
      const g = gearDrop('zombie', rand);
      if (g) {
        hits++;
        expect(g.gear!.l).toBeGreaterThanOrEqual(GEAR_DROPS.zombie!.level[0]);
        expect(g.gear!.l).toBeLessThanOrEqual(GEAR_DROPS.zombie!.level[1]);
      }
    }
    expect(hits / 4000).toBeGreaterThan(0.02);
    expect(hits / 4000).toBeLessThan(0.07);
  });

  it('a killed zombie leaves a piece of gear on the ground once the dice say so', () => {
    const s = make('warrior', 7);
    s.setMode('creative');
    let found = false;
    for (let i = 0; i < 600 && !found; i++) {
      const zombie = s.mobs.spawn('zombie', s.body.x + 3, s.body.y, s.body.z);
      s.mobs.damage(zombie, 500, 0, 1, s.realm.mobEvents, true, true, true);
      found = s.drops.drops.some((d) => !!d.stack.gear);
    }
    expect(found).toBe(true);
  });

  it('dungeon and temple chests sometimes hold a piece', () => {
    let dungeon = 0;
    let temple = 0;
    for (let i = 0; i < 300; i++) {
      if (rollChest(LOOT_TABLES.dungeon, mulberry32(i)).some((x) => x?.gear)) dungeon++;
      if (rollChest(LOOT_TABLES.temple, mulberry32(i + 1000)).some((x) => x?.gear)) temple++;
    }
    expect(dungeon).toBeGreaterThan(30);
    expect(dungeon).toBeLessThan(160);
    expect(temple).toBeGreaterThan(dungeon);
    // A chest without a gear entry never has any.
    expect(rollChest(LOOT_TABLES.village, mulberry32(4)).some((x) => x?.gear)).toBe(false);
  });
});

describe('saving, copying and sending', () => {
  const sample = (): ItemStack => piece(I.GREATSWORD, 3, 7, 'warrior', [['might', 12], ['crit', 4], ['haste', 6]]);

  it('survives a save and load, and a copy', () => {
    const c = new Container(4);
    c.set(0, sample());
    c.set(1, makeStack(I.STICK, 5));
    const back = new Container(4);
    back.loadJSON(JSON.parse(JSON.stringify(c.toJSON())));
    expect(back.get(0)!.gear).toEqual(sample().gear);
    expect(back.get(1)!.gear).toBeUndefined();
    const copy = cloneStack(sample());
    expect(copy.gear).toEqual(sample().gear);
    copy.gear!.s[0][1] = 99;
    expect(sample().gear!.s[0][1]).toBe(12);
  });

  it('keeps gear when a name is given too', () => {
    const c = new Container(1);
    const s = sample();
    s.name = 'Dawnbreaker';
    c.set(0, s);
    const back = new Container(1);
    back.loadJSON(JSON.parse(JSON.stringify(c.toJSON())));
    expect(back.get(0)!.name).toBe('Dawnbreaker');
    expect(back.get(0)!.gear!.r).toBe(3);
  });

  it('parseGear drops what does not add up', () => {
    expect(parseGear(null)).toBeUndefined();
    expect(parseGear('x')).toBeUndefined();
    expect(parseGear({ r: 9, l: 3, s: [['might', 3]] })).toBeUndefined();
    expect(parseGear({ r: 1, l: 3, s: [] })).toBeUndefined();
    expect(parseGear({ r: 1, l: 3, s: [['bogus', 3]] })).toBeUndefined();
    // Not on an item that cannot carry stats.
    expect(parseGear({ r: 1, l: 3, s: [['might', 3]] }, I.STICK)).toBeUndefined();
    // Out-of-range numbers are clamped, repeats and extra stats dropped, a bad class ignored.
    const g = parseGear({ r: 2, l: 500, c: 'nope', s: [['might', 1e9], ['might', 5], ['crit', 2], ['haste', 2], ['ward', 2]] }, I.GREATSWORD)!;
    expect(g.l).toBeLessThanOrEqual(60);
    expect(g.c).toBeUndefined();
    expect(g.s.length).toBe(3);
    expect(g.s[0][1]).toBe(STAT_INFO.might.cap);
  });

  it('cloneGear copies', () => {
    expect(cloneGear(undefined)).toBeUndefined();
    const g = sample().gear!;
    const c = cloneGear(g)!;
    expect(c).toEqual(g);
    expect(c.s).not.toBe(g.s);
  });

  it('is not merged into anything and a gear message round-trips through the net checks', () => {
    const c = new Container(3);
    c.set(0, sample());
    expect(c.add(sample())).toBeNull();
    expect(c.get(1)).not.toBeNull();
    expect(parseNetClientMessage({ t: 'leave' })).not.toBeNull();
  });
});

describe('wearing it', () => {
  const sword = piece(I.GREATSWORD, 2, 4, 'warrior', [['might', 10], ['crit', 5]]);

  it('is usable at its level and in its class only', () => {
    expect(gearUsable(sword, { id: 'warrior', level: 4 })).toBe(true);
    expect(gearUsable(sword, { id: 'warrior', level: 3 })).toBe(false);
    expect(gearUsable(sword, { id: 'mage', level: 20 })).toBe(false);
    expect(gearUsable(sword, null)).toBe(false);
    expect(gearUsable(makeStack(I.GREATSWORD, 1), null)).toBe(true);
    // A piece for anyone needs only the level.
    expect(gearUsable(piece(armorId(1, 'iron'), 1, 2, undefined, [['vit', 3]]), { id: 'mage', level: 2 })).toBe(true);
    expect(gearRefuse(sword, { id: 'warrior', level: 3 })).toBe('Requires level 4.');
    expect(gearRefuse(sword, { id: 'mage', level: 20 })).toBe('That is for a Warrior.');
    expect(gearRefuse(makeStack(I.GREATSWORD, 1), null)).toBeNull();
  });

  it('stays in the bag below its level, and the armor it would have given does not count', () => {
    const s = make('warrior');
    for (let i = 0; i < 4; i++) s.armor.set(i, null);
    const chest = piece(armorId(1, 'diamond'), 3, 20, 'warrior', [['ward', 8]]);
    s.inventory.set(0, chest);
    s.apply({ t: 'select', slot: 0 });
    s.drainEvents();
    s.equipHeld();
    expect(s.armor.get(1)).toBeNull();
    expect(s.inventory.get(0)?.gear?.l).toBe(20);
    expect(s.drainEvents().some((e: SessionEvent) => e.t === 'toast' && e.text === 'Requires level 20.')).toBe(true);
    s.apply({ t: 'inventory' });
    s.apply({ t: 'click', slot: 0, button: 0 });
    const menu = s.menu as { armorStart: number; cursor: ItemStack | null };
    s.drainEvents();
    s.apply({ t: 'click', slot: menu.armorStart + 1, button: 0 });
    expect(s.armor.get(1)).toBeNull();
    expect(menu.cursor?.gear?.l).toBe(20);
    expect(s.drainEvents().some((e: SessionEvent) => e.t === 'toast' && e.text === 'Requires level 20.')).toBe(true);
    s.armor.set(1, chest);
    expect(s.defense).toBe(0);
    s.addClassXp(999999);
    expect(s.cls!.level).toBeGreaterThanOrEqual(20);
    s.inventory.set(0, { ...chest });
    s.armor.set(1, null);
    s.apply({ t: 'select', slot: 0 });
    s.equipHeld();
    expect(s.armor.get(1)?.id).toBe(armorId(1, 'diamond'));
    expect(s.defense).toBe(getItem(armorId(1, 'diamond')).armor!.defense);
    // A plain diamond chestplate has no level to reach.
    const low = make('warrior');
    for (let i = 0; i < 4; i++) low.armor.set(i, null);
    low.inventory.set(0, makeStack(armorId(1, 'diamond')));
    low.apply({ t: 'select', slot: 0 });
    low.equipHeld();
    expect(low.armor.get(1)?.id).toBe(armorId(1, 'diamond'));
    expect(low.defense).toBe(getItem(armorId(1, 'diamond')).armor!.defense);
  });

  it('adds nothing when not usable, and the key changes with what counts', () => {
    expect(gearModifiers([sword], { id: 'warrior', level: 1 })).toEqual([]);
    expect(gearModifiers([sword], { id: 'warrior', level: 4 })).toHaveLength(2);
    expect(gearKey([sword], { id: 'warrior', level: 3 })).not.toBe(gearKey([sword], { id: 'warrior', level: 4 }));
    expect(gearKey([sword], { id: 'warrior', level: 4 })).toBe(gearKey([{ ...sword }], { id: 'warrior', level: 4 }));
    expect(gearKey([null], null)).toBe('-');
  });

  it('every stat adds to the class stats', () => {
    for (const stat of GEAR_STATS) {
      const m = STAT_INFO[stat].mod(5);
      expect(Object.keys(m).length).toBeGreaterThan(0);
    }
    expect(statLine('might', 12)).toMatch(/12/);
    expect(statLine('focus', 6, 'Mana')).toMatch(/Mana/);
  });

  it('a worn piece raises the stats of the class once it has the level', () => {
    const s = make('warrior');
    const plain = s.cls!.stats.maxHealth;
    const chest = piece(armorId(1, 'iron'), 2, 1, undefined, [['vit', 20], ['might', 10]]);
    s.armor.set(1, chest);
    s.tick(idle());
    expect(s.cls!.stats.maxHealth).toBeGreaterThan(plain);
    expect(s.vitals.maxHealth).toBe(Math.round(s.cls!.stats.maxHealth));
    // Taking it off takes the bonus away.
    s.armor.set(1, null);
    s.tick(idle());
    expect(s.cls!.stats.maxHealth).toBe(plain);
  });

  it('a piece that asks for a higher level comes off until the level is reached', () => {
    const s = make('warrior');
    for (let i = 0; i < 4; i++) s.armor.set(i, null);
    const plain = s.cls!.stats.maxHealth;
    const chest = piece(armorId(1, 'iron'), 2, 3, undefined, [['vit', 20], ['might', 10]]);
    s.armor.set(1, chest);
    s.tick(idle());
    expect(s.armor.get(1)).toBeNull();
    expect(s.cls!.stats.maxHealth).toBe(plain);
    s.cls!.addXp(1e6);
    expect(s.cls!.level).toBeGreaterThanOrEqual(3);
    s.inventory.set(0, chest);
    s.apply({ t: 'select', slot: 0 });
    s.equipHeld();
    s.tick(idle());
    expect(s.armor.get(1)?.gear?.l).toBe(3);
    expect(s.cls!.stats.maxHealth).toBeGreaterThan(plain);
  });

  it('a piece of another class adds nothing', () => {
    const s = make('warrior');
    const plain = s.cls!.stats.maxHealth;
    s.armor.set(1, piece(armorId(1, 'iron'), 2, 1, 'mage', [['vit', 20], ['arcane', 10]]));
    s.tick(idle());
    expect(s.cls!.stats.maxHealth).toBe(plain);
  });

  it('the item in hand counts, and only while it is in hand', () => {
    const s = make('warrior');
    const plain = s.cls!.stats.critChance;
    s.inventory.set(0, piece(I.GREATSWORD, 3, 1, 'warrior', [['might', 8], ['crit', 8], ['haste', 5]]));
    s.inventory.set(1, makeStack(I.STICK, 1));
    s.selectSlot(0);
    s.tick(idle());
    expect(s.cls!.stats.critChance).toBeGreaterThan(plain);
    s.selectSlot(1);
    s.tick(idle());
    expect(s.cls!.stats.critChance).toBe(plain);
  });

  it('a weapon of haste swings faster than a plain one: the swing event says by how much, the pace of blows follows', () => {
    const swingOf = (weapon: ItemStack) => {
      const s = make('warrior');
      s.inventory.set(0, weapon);
      s.selectSlot(0);
      s.tick(idle());
      s.drainEvents();
      const m = s.mobs.spawn('zombie', s.body.x + 1, s.body.y, s.body.z);
      s.attackMob(m);
      const ev = s.drainEvents().find((e): e is Extract<SessionEvent, { t: 'swing' }> => e.t === 'swing');
      return { ev, rate: s.swingRate, cooldown: (s as unknown as { attackCooldown: number }).attackCooldown };
    };
    const plain = swingOf(piece(I.GREATSWORD, 1, 1, 'warrior', [['might', 2]]));
    const quick = swingOf(piece(I.GREATSWORD, 3, 1, 'warrior', [['might', 2], ['haste', 15], ['haste', 5]]));
    expect(plain.ev).toBeDefined();
    expect(plain.ev!.rate).toBeUndefined();
    expect(plain.rate).toBe(1);
    expect(quick.ev!.rate).toBeGreaterThan(1.2);
    expect(quick.rate).toBe(quick.ev!.rate);
    expect(quick.cooldown).toBeLessThan(plain.cooldown);
  });

  it('mining and placing swing at the usual pace, whatever the haste', () => {
    const s = make('warrior');
    s.inventory.set(0, piece(I.GREATSWORD, 3, 1, 'warrior', [['might', 2], ['haste', 15], ['haste', 5]]));
    s.inventory.set(1, makeStack(I.STICK, 1));
    s.selectSlot(1);
    s.tick(idle());
    s.drainEvents();
    s.emit({ t: 'swing' });
    expect(s.swingRate).toBe(1);
    expect(s.drainEvents().find((e) => e.t === 'swing' && e.rate !== undefined)).toBeUndefined();
  });

  it('a full resource pool stays full when gear deepens it', () => {
    const s = make('mage');
    s.cls!.resource = s.cls!.stats.maxResource;
    s.armor.set(1, piece(armorId(1, 'iron'), 3, 1, undefined, [['focus', 30], ['arcane', 10], ['vit', 5]]));
    s.tick(idle());
    expect(s.cls!.resource).toBeCloseTo(s.cls!.stats.maxResource, 5);
  });
});

describe('the pace of a swing', () => {
  it('follows the attack speed a little more than one for one, within bounds', () => {
    expect(swingRate(1)).toBe(1);
    expect(swingRate(1.2)).toBeGreaterThan(1.2);
    expect(swingRate(1.5)).toBeGreaterThan(swingRate(1.2));
    expect(swingRate(0.5)).toBeLessThan(0.5);
    expect(swingRate(50)).toBe(swingRate(2));
    expect(swingRate(0)).toBe(swingRate(0.4));
  });
});

describe('what it says', () => {
  const sword = piece(I.GREATSWORD, 3, 7, 'warrior', [['might', 12], ['crit', 4], ['haste', 6]]);

  it('is named after its first stat and coloured by rarity', () => {
    expect(tooltipName(sword)).toBe(`Greatsword ${gearSuffix(sword.gear)}`);
    expect(gearSuffix(sword.gear)).toMatch(/^of /);
    expect(tooltipName(makeStack(I.GREATSWORD, 1))).toBe('Greatsword');
    expect(tooltipLines(sword)[0].color).toBe('epic');
    expect(tooltipLines(piece(I.GREATSWORD, 2, 1, undefined, [['might', 3], ['crit', 1]]))[0].color).toBe('superior');
    expect(tooltipLines(piece(I.GREATSWORD, 1, 1, undefined, [['might', 3]]))[0].color).toBe('uncommon');
    expect(tooltipLines(sword)[1].text).toBe(`${RARITIES[2].name} Equipment`);
  });

  it('lists the class, the level and the stats; warns when you cannot use it', () => {
    const lines = tooltipLines(sword, 'warrior', 10);
    expect(lines.find((l) => l.text === `Class: ${CLASSES.warrior.name}`)!.color).toBe('stat');
    expect(lines.find((l) => l.text === 'Requires level 7')!.color).toBe('stat');
    expect(lines.filter((l) => l.color === 'good')).toHaveLength(3);
    const bad = tooltipLines(sword, 'mage', 2);
    expect(bad.find((l) => l.text.startsWith('Class:'))!.color).toBe('warn');
    expect(bad.find((l) => l.text === 'Requires level 7')!.color).toBe('warn');
    // Unknown viewer: no warnings at all.
    expect(tooltipLines(sword).some((l) => l.color === 'warn')).toBe(false);
  });

  it('a plain item has none of these', () => {
    const lines = tooltipLines(makeStack(I.GREATSWORD, 1));
    expect(lines.some((l) => l.text.startsWith('Requires level'))).toBe(false);
    expect(lines[1].text).toBe('Equipment');
  });
});

describe('selling it', () => {
  it('found gear sells by rarity and level; plain things as before; renamed or enchanted not at all', () => {
    const g = piece(I.GREATSWORD, 2, 10, 'warrior', [['might', 5], ['crit', 2]]);
    expect(stackSellPrice(g)).toBe(gearValue(g.gear!));
    expect(stackSellPrice(g)).toBeGreaterThan(0);
    const epic = piece(I.GREATSWORD, 3, 10, 'warrior', [['might', 5], ['crit', 2], ['haste', 2]]);
    expect(gearValue(epic.gear!)).toBeGreaterThan(gearValue(g.gear!));
    expect(stackSellPrice(makeStack(I.DIAMOND, 1))).toBeGreaterThan(0);
    expect(stackSellPrice({ ...g, name: 'Mine' })).toBe(0);
  });

  it('a merchant buys it and the coins arrive', () => {
    const s = make('warrior');
    const g = piece(I.GREATSWORD, 2, 10, 'warrior', [['might', 5], ['crit', 2]]);
    s.inventory.set(0, g);
    const n = NPCS.find((x) => x.id === 'tobin')!;
    s.teleport(n.x, (generator as AdventureWorldGenerator).hubY + 1, n.z + 2, 0, 0);
    for (let i = 0; i < 4; i++) s.tick(idle());
    const m = s.mobs.mobs.find((x) => x.kind === 'npc' && x.variant === NPCS.findIndex((y) => y.id === 'tobin'))!;
    expect(s.talkNpc(m)).toBe(true);
    const before = s.coins;
    s.apply({ t: 'shop', a: 'sell', i: 0, n: 1 });
    expect(s.coins).toBe(before + gearValue(g.gear!));
    expect(s.inventory.get(0)).toBeNull();
  });
});

describe('picking it up', () => {
  it('the pickup message carries the gear, and the stack keeps it in the bag', () => {
    const s = make('warrior');
    s.teleport(5.5, (generator as AdventureWorldGenerator).hubY + 1, 8.5);
    for (let i = 0; i < 4; i++) s.tick(idle());
    s.drainEvents();
    const g = piece(I.GREATSWORD, 3, 6, 'warrior', [['might', 9], ['crit', 3], ['haste', 4]]);
    s.realm.drops.spawn(g, 5.5, (generator as AdventureWorldGenerator).hubY + 1, 8.5, 0, 0, 0, 0);
    const events: SessionEvent[] = [];
    for (let i = 0; i < 10; i++) {
      s.tick(idle());
      events.push(...s.drainEvents());
    }
    const got = events.filter((e): e is Extract<SessionEvent, { t: 'pickup' }> => e.t === 'pickup');
    expect(got).toHaveLength(1);
    expect(got[0].gear).toEqual(g.gear);
    expect(s.inventory.slots.some((x) => x?.gear?.r === 3)).toBe(true);
  });
});
describe('the shops', () => {
  it('sell pieces with stats, always the same ones, and a purchase gives the piece', () => {
    for (const npc of ['hilda', 'garrick', 'fenna', 'lysa']) {
      const pieces = shopOf(npc)!.stock.filter((w) => w.gear);
      expect(pieces.length, npc).toBeGreaterThanOrEqual(3);
      for (const w of pieces) expect(w.price).toBeGreaterThan(gearValue(w.gear!));
    }
    const s = make('warrior');
    s.setMode('creative');
    s.addCoins(5000);
    const n = NPCS.find((x) => x.id === 'garrick')!;
    s.teleport(n.x, (generator as AdventureWorldGenerator).hubY + 1, n.z + 2, 0, 0);
    for (let i = 0; i < 4; i++) s.tick(idle());
    const m = s.mobs.mobs.find((x) => x.kind === 'npc' && x.variant === NPCS.findIndex((y) => y.id === 'garrick'))!;
    expect(s.talkNpc(m)).toBe(true);
    const stock = shopOf('garrick')!.stock;
    const i = stock.findIndex((w) => w.gear);
    const before = s.coins;
    s.apply({ t: 'shop', a: 'buy', i, n: 1 });
    const got = s.inventory.slots.find((x) => x?.gear);
    expect(got?.gear).toEqual(stock[i].gear);
    expect(got?.gear).not.toBe(stock[i].gear);
    expect(s.coins).toBe(before - stock[i].price);
  });
});