import { describe, expect, it } from 'vitest';
import {
  ABILITIES,
  ADVENTURE_SEED,
  ATLAS_COLS,
  ATLAS_ROWS,
  CLASS_LEVELS,
  GameSession,
  HeadlessWorld,
  I,
  NPCS,
  QUESTS,
  SHOPS,
  SKILL_BOOKS,
  TILE_NAMES,
  abilitiesOf,
  getItem,
  makeGenerator,
  makeStack,
  mulberry32,
  parseClassSave,
  questById,
  rewardItems,
  sellPrice,
  shopOf,
  skillBookAbility,
  skillBookDrop,
  skillBookDropChance,
  skillBookId,
  skillBookPrice,
  skillBookStock,
  tileIndex,
  tooltipLines,
  tooltipName,
  type AbilityId,
  type AdventureWorldGenerator,
  type ClassId,
  type InputFrame,
  type SessionEvent,
} from './index';
import { startInVillage } from './villageStart.testutil';

const generator = makeGenerator(ADVENTURE_SEED, 'adventure') as AdventureWorldGenerator;

const idle = (over: Partial<InputFrame> = {}): InputFrame => ({ t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: -1.4, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false, ...over });

function make(classId: ClassId | null = 'warrior', seed = 3, mode: 'survival' | 'creative' = 'survival') {
  const world = new HeadlessWorld(generator);
  const s = new GameSession({ seed: ADVENTURE_SEED, world, generator, naturalSpawning: false, rand: mulberry32(seed), classId, mode });
  s.finishLoading();
  startInVillage(s, generator);
  s.drainEvents();
  return s;
}

const run = (s: GameSession, seconds: number): void => {
  for (let i = 0; i < Math.round(seconds * 20); i++) s.tick(idle());
};

function talkTo(s: GameSession, id: string): void {
  const n = NPCS.find((x) => x.id === id)!;
  s.teleport(n.x, generator.hubY + 1, n.z + 2, 0, 0);
  run(s, 0.2);
  const v = NPCS.findIndex((x) => x.id === id);
  const m = s.mobs.mobs.find((x) => x.kind === 'npc' && x.variant === v)!;
  expect(s.talkNpc(m)).toBe(true);
}

/** Total experience from level 1 up to `level`. */
const xpTo = (level: number): number => {
  let t = 0;
  for (let lv = 1; lv < level; lv++) t += CLASS_LEVELS.toNext(lv);
  return t;
};

const toasts = (ev: SessionEvent[]): string[] => ev.flatMap((e) => (e.t === 'toast' ? [e.text] : []));
const bookCount = (s: GameSession, ability: AbilityId): number => s.inventory.countOf(skillBookId(ability));
const level = (id: AbilityId): number => ABILITIES.find((a) => a.id === id)!.unlockLevel;

/** A clean bag with a single book in the first hotbar slot, held. */
function holdBook(s: GameSession, ability: AbilityId): void {
  s.clearInventory();
  s.inventory.set(0, makeStack(skillBookId(ability), 1));
  s.selected = 0;
}

/** Hold the right button for one frame (it is a press that counts, not the hold). */
const rightClick = (s: GameSession): void => {
  s.tick(idle({ right: false }));
  s.tick(idle({ right: true }));
  s.tick(idle({ right: false }));
};

describe('the skill book items', () => {
  it('are twelve, one for each ability, in the class and button order', () => {
    expect(SKILL_BOOKS.length).toBe(12);
    expect(SKILL_BOOKS.map((b) => b.ability)).toEqual(ABILITIES.map((a) => a.id));
    for (const b of SKILL_BOOKS) {
      const a = ABILITIES.find((x) => x.id === b.ability)!;
      expect(b.classId).toBe(a.classId);
    }
    for (const c of ['warrior', 'mage', 'ranger'] as const) expect(abilitiesOf(c).length).toBe(4);
  });

  it('are registered one by one, they do not stack, and know which ability they hold', () => {
    const ids = new Set<number>();
    for (const b of SKILL_BOOKS) {
      const id = skillBookId(b.ability);
      expect(ids.has(id)).toBe(false);
      ids.add(id);
      const item = getItem(id);
      expect(item.name).toBe(`skill_book_${b.ability}`);
      expect(item.maxStack).toBe(1);
      expect(skillBookAbility(id)).toBe(b.ability);
      expect(TILE_NAMES[item.tile]).toBe(`skillbook_${b.classId}`);
    }
    expect(skillBookAbility(I.DIAMOND)).toBeNull();
    expect(skillBookAbility(-1)).toBeNull();
    expect(skillBookAbility(skillBookId('fireball') + 100)).toBeNull();
  });

  it('have a tile of their own colour for each class, and fit in the atlas', () => {
    const tiles = (['warrior', 'mage', 'ranger'] as const).map((c) => tileIndex(`skillbook_${c}`));
    expect(new Set(tiles).size).toBe(3);
    expect(TILE_NAMES.length).toBeLessThanOrEqual(ATLAS_COLS * ATLAS_ROWS);
  });
});

describe('a new character', () => {
  it('knows no ability, whatever its class, and does not learn any by levelling', () => {
    for (const c of ['warrior', 'mage', 'ranger'] as const) {
      const s = make(c);
      expect(s.cls!.unlocked.size).toBe(0);
      s.addClassXp(xpTo(10));
      expect(s.cls!.level).toBeGreaterThanOrEqual(10);
      expect(s.cls!.unlocked.size).toBe(0);
      // and so it cannot cast
      expect(s.useAbility(0)).not.toBe('cast');
      expect(toasts(s.drainEvents()).join(' ')).toMatch(/not learned/);
    }
  });

  it('starts with no skill book in the bags either', () => {
    for (const c of ['warrior', 'mage', 'ranger'] as const) {
      const s = make(c);
      for (const b of SKILL_BOOKS) expect(s.inventory.countOf(skillBookId(b.ability))).toBe(0);
    }
  });
});

describe('reading a skill book', () => {
  it('right-clicking the held book learns the ability and uses the book up', () => {
    const s = make('warrior');
    holdBook(s, 'ground_slam');
    rightClick(s);
    expect(s.cls!.unlocked.has('ground_slam')).toBe(true);
    expect(bookCount(s, 'ground_slam')).toBe(0);
    const ev = s.drainEvents();
    expect(ev).toContainEqual({ t: 'learned', ability: 'ground_slam' });
    expect(toasts(ev)).toContain('You have learned Ground Slam');
    expect(s.useAbility(0)).toBe('cast');
  });

  it('right-clicking a book in the inventory screen learns it too, and it does not end up on the cursor', () => {
    const s = make('mage');
    s.clearInventory();
    s.inventory.set(12, makeStack(skillBookId('fireball'), 1));
    s.apply({ t: 'inventory' });
    const menu = s.menu!;
    const at = menu.slots.findIndex((sl) => sl.container === s.inventory && sl.index === 12);
    expect(at).toBeGreaterThanOrEqual(0);
    s.drainEvents();
    s.apply({ t: 'click', slot: at, button: 1 });
    expect(s.cls!.unlocked.has('fireball')).toBe(true);
    expect(bookCount(s, 'fireball')).toBe(0);
    expect(menu.cursor).toBeNull();
    expect(s.drainEvents()).toContainEqual({ t: 'learned', ability: 'fireball' });
  });

  it('a left click still moves a book around like any item', () => {
    const s = make('mage');
    s.clearInventory();
    s.inventory.set(12, makeStack(skillBookId('fireball'), 1));
    s.apply({ t: 'inventory' });
    const at = s.menu!.slots.findIndex((sl) => sl.container === s.inventory && sl.index === 12);
    s.apply({ t: 'click', slot: at, button: 0 });
    expect(s.menu!.cursor?.id).toBe(skillBookId('fireball'));
    expect(s.cls!.unlocked.size).toBe(0);
  });

  it('keeps the book when it is of another class, and says so', () => {
    const s = make('warrior');
    holdBook(s, 'fireball');
    rightClick(s);
    expect(s.cls!.unlocked.size).toBe(0);
    expect(bookCount(s, 'fireball')).toBe(1);
    expect(toasts(s.drainEvents())).toContain('Only a Mage can learn Fireball');
  });

  it('keeps the book when the level is too low, and says which level it needs', () => {
    const s = make('warrior');
    const need = level('iron_defense');
    expect(need).toBeGreaterThan(1);
    holdBook(s, 'iron_defense');
    rightClick(s);
    expect(s.cls!.unlocked.has('iron_defense')).toBe(false);
    expect(bookCount(s, 'iron_defense')).toBe(1);
    expect(toasts(s.drainEvents())).toContain(`Iron Defense needs level ${need} (you are level 1)`);
    // and once the level is there, the same book works
    s.addClassXp(xpTo(need));
    s.drainEvents();
    rightClick(s);
    expect(s.cls!.unlocked.has('iron_defense')).toBe(true);
    expect(bookCount(s, 'iron_defense')).toBe(0);
  });

  it('keeps a duplicate book when the ability is known, and says so', () => {
    const s = make('ranger');
    s.cls!.unlocked.add('piercing_shot');
    holdBook(s, 'piercing_shot');
    rightClick(s);
    expect(bookCount(s, 'piercing_shot')).toBe(1);
    expect(toasts(s.drainEvents())).toContain('You already know Piercing Shot');
  });

  it('a character without a class cannot learn anything', () => {
    const s = make(null);
    expect(s.cls).toBeNull();
    holdBook(s, 'ground_slam');
    rightClick(s);
    expect(bookCount(s, 'ground_slam')).toBe(1);
    expect(toasts(s.drainEvents()).join(' ')).toMatch(/Only a Warrior/);
  });

  it('is not used up in creative mode', () => {
    const s = make('warrior', 3, 'creative');
    holdBook(s, 'ground_slam');
    rightClick(s);
    expect(s.cls!.unlocked.has('ground_slam')).toBe(true);
    expect(bookCount(s, 'ground_slam')).toBe(1);
  });

  it('is not possible for a dead player', () => {
    const s = make('warrior');
    holdBook(s, 'ground_slam');
    expect(s.learnFromBook(0)).toBe(true);
    s.drainEvents();
    s.inventory.set(0, makeStack(skillBookId('charge'), 1));
    s.vitals.health = 0;
    s.vitals.dead = true;
    expect(s.learnFromBook(0)).toBe(true); // it is a book: the click is taken
    expect(s.cls!.unlocked.has('charge')).toBe(false);
    expect(bookCount(s, 'charge')).toBe(1);
  });

  it('tells about the books waiting in the bags when a level makes them readable', () => {
    const s = make('mage');
    const need = level('meteor');
    s.clearInventory();
    s.inventory.set(0, makeStack(skillBookId('meteor'), 1));
    s.drainEvents();
    s.addClassXp(xpTo(need));
    const text = toasts(s.drainEvents()).join(' ');
    expect(text).toMatch(/Meteor/);
    expect(text).toMatch(/right-click/i);
  });

  it('is learned for good: the ability is saved and comes back, and a damaged save cannot add another', () => {
    const s = make('ranger');
    holdBook(s, 'piercing_shot');
    rightClick(s);
    const save = s.cls!.toJSON();
    expect(save.unlocked).toEqual(['piercing_shot']);
    const back = parseClassSave(JSON.parse(JSON.stringify(save)), 'ranger')!;
    expect(back.unlocked).toEqual(['piercing_shot']);
    // a mage ability and nonsense in the list are thrown away
    const bad = parseClassSave(JSON.parse(JSON.stringify({ ...save, unlocked: ['piercing_shot', 'fireball', 'nonsense', 7] })), 'ranger')!;
    expect(bad.unlocked).toEqual(['piercing_shot']);
    // a character made again from the save still has it
    const t = make('ranger', 4);
    t.cls!.load(JSON.parse(JSON.stringify(save)));
    expect(t.cls!.unlocked.has('piercing_shot')).toBe(true);
  });
});

describe('buying skill books', () => {
  const merchants: [string, ClassId][] = [
    ['garrick', 'warrior'],
    ['fenna', 'ranger'],
    ['lysa', 'mage'],
  ];

  it('is done at the merchant of each class, which sells the four books of that class, at a price by level', () => {
    for (const [npc, classId] of merchants) {
      const shop = shopOf(npc)!;
      const books = shop.stock.filter((w) => skillBookAbility(w.id) !== null);
      expect(books.map((w) => skillBookAbility(w.id))).toEqual(abilitiesOf(classId).map((a) => a.id));
      expect(books).toEqual(skillBookStock(classId));
      for (const w of books) {
        expect(w.count).toBe(1);
        expect(w.price).toBe(skillBookPrice(skillBookAbility(w.id)!));
      }
      expect(shop.line).toMatch(/right-click/i);
    }
    expect(skillBookPrice('ground_slam')).toBe(60 * level('ground_slam'));
    expect(skillBookPrice('meteor')).toBeGreaterThan(skillBookPrice('fireball'));
    // no other shop sells a book
    for (const shop of SHOPS) if (!merchants.some(([n]) => n === shop.npc)) expect(shop.stock.some((w) => skillBookAbility(w.id) !== null)).toBe(false);
  });

  it('takes the coins and hands over the book, which then teaches the ability', () => {
    for (const [npc, classId] of merchants) {
      const s = make(classId, 3, 'creative');
      s.clearInventory();
      s.addCoins(5000);
      talkTo(s, npc);
      const ability = abilitiesOf(classId)[0].id;
      const shop = shopOf(npc)!;
      const i = shop.stock.findIndex((w) => skillBookAbility(w.id) === ability);
      expect(i).toBeGreaterThanOrEqual(0);
      s.apply({ t: 'shop', a: 'buy', i, n: 1 });
      expect(s.coins).toBe(5000 - skillBookPrice(ability));
      expect(bookCount(s, ability)).toBe(1);
      s.closeMenu();
      let slot = -1;
      for (let k = 0; k < s.inventory.size; k++) if (s.inventory.get(k)?.id === skillBookId(ability)) slot = k;
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(s.learnFromBook(slot)).toBe(true);
      expect(s.cls!.unlocked.has(ability)).toBe(true);
      expect(bookCount(s, ability)).toBe(1); // creative keeps the book
    }
  });

  it('does not sell on credit', () => {
    const s = make('mage');
    s.clearInventory();
    s.addCoins(10);
    talkTo(s, 'lysa');
    const i = shopOf('lysa')!.stock.findIndex((w) => skillBookAbility(w.id) === 'fireball');
    s.apply({ t: 'shop', a: 'buy', i, n: 1 });
    expect(bookCount(s, 'fireball')).toBe(0);
    expect(s.coins).toBe(10);
  });

  it('buys a book back for a quarter of its price, which is less than it costs', () => {
    for (const b of SKILL_BOOKS) {
      const sell = sellPrice(skillBookId(b.ability));
      expect(sell).toBe(Math.floor(skillBookPrice(b.ability) / 4));
      expect(sell).toBeLessThan(skillBookPrice(b.ability));
    }
  });
});

describe('skill books from quests', () => {
  it('are rewarded by the first four quests of the class lines, each class getting the book of its own', () => {
    const lines = { warrior: 'cl_w', mage: 'cl_m', ranger: 'cl_r' } as const;
    for (const c of ['warrior', 'mage', 'ranger'] as const) {
      [1, 2, 3, 4].forEach((k, n) => {
        const qid = `${lines[c]}${k}`;
        const q = questById(qid)!;
        expect(q.class, qid).toBe(c);
        const items = rewardItems(q.reward, c);
        const want = abilitiesOf(c)[n].id;
        expect(items.some((r) => r.id === skillBookId(want) && r.count === 1), `${c} ${qid}`).toBe(true);
        // and no book of another class
        for (const r of items) {
          const a = skillBookAbility(r.id);
          if (a) expect(ABILITIES.find((x) => x.id === a)!.classId).toBe(c);
        }
      });
    }
  });

  it('give a classless character no book, and keep what every character gets', () => {
    for (const q of QUESTS) {
      const none = rewardItems(q.reward, null);
      expect(none.some((r) => skillBookAbility(r.id) !== null)).toBe(false);
      expect(none).toEqual(q.reward.items ?? []);
    }
  });

  it('are handed over on completion', () => {
    for (const c of ['warrior', 'mage', 'ranger'] as const) {
      const s = make(c, 3, 'creative');
      const q = questById({ warrior: 'cl_w1', mage: 'cl_m1', ranger: 'cl_r1' }[c])!;
      s.quests!.done.add('ms00');
      s.quests!.done.add('ms01');
      s.clearInventory();
      talkTo(s, q.giver);
      s.apply({ t: 'quest', a: 'accept', id: q.id });
      s.closeMenu();
      for (const o of q.objectives) {
        if (o.kind === 'craft') s.questEvent({ t: 'craft', item: o.items[0], count: o.count });
        if (o.kind === 'enter') s.questEvent({ t: 'enter', zone: o.zone });
      }
      talkTo(s, q.turnIn);
      s.apply({ t: 'quest', a: 'complete', id: q.id });
      expect(s.quests!.status(q.id)).toBe('done');
      expect(bookCount(s, abilitiesOf(c)[0].id), c).toBe(1);
      for (const other of ABILITIES) if (other.id !== abilitiesOf(c)[0].id) expect(bookCount(s, other.id), `${c} ${other.id}`).toBe(0);
    }
  });
});

describe('skill books from monsters', () => {
  const none = new Set<AbilityId>();

  it('drop only from monsters that are a danger, never from the harmless', () => {
    for (const kind of ['zombie', 'skeleton', 'creeper', 'enderman'] as const) expect(skillBookDropChance(kind)).toBeGreaterThan(0);
    for (const kind of ['npc', 'dummy', 'villager', 'bat', 'squid', 'cow', 'pig'] as const) expect(skillBookDropChance(kind)).toBe(0);
    for (const kind of ['zombie', 'skeleton', 'creeper', 'enderman'] as const) expect(skillBookDropChance(kind)).toBeLessThanOrEqual(0.25);
    expect(skillBookDropChance('enderman')).toBeGreaterThan(skillBookDropChance('zombie'));
  });

  it('can be the book of any of the twelve abilities, of any class, and are chosen with the dice in the caller\u2019s hand', () => {
    const r = mulberry32(11);
    const seen = new Set<number>();
    let drops = 0;
    for (let i = 0; i < 20000; i++) {
      const id = skillBookDrop('zombie', r);
      if (id === null) continue;
      drops++;
      seen.add(id);
    }
    expect([...seen].sort()).toEqual(SKILL_BOOKS.map((b) => skillBookId(b.ability)).sort());
    expect(drops / 20000).toBeGreaterThan(0.05);
    expect(drops / 20000).toBeLessThan(0.09);
    expect(skillBookDrop('zombie', () => 0)).not.toBeNull(); // the lowest roll always drops
    expect(skillBookDrop('zombie', () => 0.999)).toBeNull(); // the highest never does
    const a = mulberry32(5);
    const b = mulberry32(5);
    for (let i = 0; i < 300; i++) expect(skillBookDrop('husk', a)).toBe(skillBookDrop('husk', b));
  });

  it('give each class its share of the books', () => {
    const r = mulberry32(3);
    const byClass = { warrior: 0, mage: 0, ranger: 0 };
    for (let i = 0; i < 30000; i++) {
      const id = skillBookDrop('enderman', r);
      const ability = id === null ? null : skillBookAbility(id);
      if (ability) byClass[ABILITIES.find((x) => x.id === ability)!.classId]++;
    }
    for (const c of ['warrior', 'mage', 'ranger'] as const) expect(byClass[c], c).toBeGreaterThan(1000);
  });

  it('are rarer the higher the level they need', () => {
    const r = mulberry32(8);
    const counts = new Map<number, number>();
    for (let i = 0; i < 40000; i++) {
      const id = skillBookDrop('enderman', r);
      if (id !== null) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const low = counts.get(skillBookId('ground_slam')) ?? 0;
    const high = counts.get(skillBookId('iron_defense')) ?? 0;
    expect(level('iron_defense')).toBeGreaterThan(level('ground_slam'));
    expect(low).toBeGreaterThan(high);
    expect(high).toBeGreaterThan(0);
  });

  it('lie on the ground where a monster killed by a player fell, of any class, even for what the killer knows', () => {
    for (const killerClass of ['warrior', null] as const) {
      const s = make(killerClass, 21, 'creative');
      if (s.cls) for (const a of abilitiesOf(s.cls.classId)) s.cls.unlocked.add(a.id); // knows every book of its own class
      s.teleport(5.5, generator.hubY + 1, 8.5);
      run(s, 0.2);
      const seen = new Set<number>();
      for (let i = 0; i < 1500 && seen.size < 6; i++) {
        const id = s.spawnMob('zombie', 5.5, generator.hubY + 1, 6.5);
        expect(s.damageMob(id, 500)).toBe(true);
        for (const d of s.realm.drops.drops) {
          const ability = skillBookAbility(d.stack.id);
          if (ability) {
            expect(d.stack.count).toBe(1);
            seen.add(ABILITIES.findIndex((x) => x.id === ability));
          }
        }
        s.realm.drops.drops.length = 0;
      }
      const classes = new Set([...seen].map((i) => ABILITIES[i].classId));
      expect(seen.size, String(killerClass)).toBeGreaterThanOrEqual(6);
      expect(classes.size, String(killerClass)).toBeGreaterThanOrEqual(2);
      if (killerClass) expect([...seen].some((i) => ABILITIES[i].classId === killerClass)).toBe(true);
    }
  });

  it('are not found, and no uncommon gear is left, when the killer is in survival', () => {
    const s = make('warrior', 30);
    s.teleport(5.5, generator.hubY + 1, 8.5);
    run(s, 0.2);
    for (let i = 0; i < 400; i++) {
      const id = s.spawnMob('zombie', 5.5, generator.hubY + 1, 6.5);
      expect(s.damageMob(id, 500)).toBe(true);
    }
    expect(s.realm.drops.drops.some((d) => skillBookAbility(d.stack.id) !== null || (d.stack.gear !== undefined && d.stack.gear.r > 0))).toBe(false);
  });

  it('are not sold to a survival player', () => {
    const s = make('mage');
    s.clearInventory();
    s.addCoins(5000);
    talkTo(s, 'lysa');
    const i = shopOf('lysa')!.stock.findIndex((w) => skillBookAbility(w.id) === 'fireball');
    s.apply({ t: 'shop', a: 'buy', i, n: 1 });
    expect(bookCount(s, 'fireball')).toBe(0);
    expect(s.coins).toBe(5000);
  });

  it('are not left by a monster that nobody killed', () => {
    const s = make('warrior', 22);
    s.teleport(5.5, generator.hubY + 1, 8.5);
    run(s, 0.2);
    for (let i = 0; i < 300; i++) {
      const m = s.mobs.spawn('zombie', 5.5, generator.hubY + 1, 6.5);
      s.mobs.damage(m, 500, 0, 1, s.realm.mobEvents, true, true, false); // as in economy.test: no player behind it
    }
    expect(s.realm.drops.drops.filter((d) => skillBookAbility(d.stack.id) !== null).length).toBe(0);
  });
});

describe('the look of a skill book', () => {
  it('is named after the ability and tells what it does and how to learn it', () => {
    const stack = makeStack(skillBookId('fireball'), 1);
    expect(tooltipName(stack)).toBe('Skill Book: Fireball');
    const text = tooltipLines(stack).map((l) => l.text).join('\n');
    expect(text).toMatch(/Mage/);
    expect(text).toMatch(new RegExp(`level ${level('fireball')}`, 'i'));
    expect(text).toMatch(/Right-click to learn/i);
  });

  it('marks the class line in red when the book is of another class (or the viewer has none), not otherwise', () => {
    const stack = makeStack(skillBookId('fireball'), 1);
    const colour = (viewer?: ClassId | null) => tooltipLines(stack, viewer).find((l) => l.text.startsWith('Class:'))!.color;
    expect(colour('mage')).toBe('stat');
    expect(colour('warrior')).toBe('warn');
    expect(colour('ranger')).toBe('warn');
    expect(colour(null)).toBe('warn');
    expect(colour()).toBe('stat'); // not known: no judgement
  });
});
