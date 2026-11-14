import { describe, expect, it } from 'vitest';
import {
  B,
  BLOCKS,
  BLOCK_XP,
  CHUNK_SIZE,
  Container,
  GameSession,
  HeadlessWorld,
  MobManager,
  I,
  LEVEL_XP,
  MAX_VILLAGER_LEVEL,
  PLAYER_SLOTS,
  PROFESSIONS,
  TRADING_PROFESSIONS,
  TradeMenu,
  WorldGenerator,
  addVillagerXp,
  blockDrops,
  getItem,
  levelForXp,
  makeStack,
  maxStackOf,
  mulberry32,
  newBook,
  offersAt,
  parseOffers,
  parseSessionMessage,
  parseWorldState,
  restock,
  toolId,
  variantLevel,
  variantProfession,
  villagerVariant,
  type InputFrame,
  type Mob,
  type SessionEvent,
} from './index';
import { settleOrbs } from './xpOrbs.testutil';

// ---------------------------------------------------------------------------------------------------
// the offers

describe('what the villagers trade', () => {
  it('has offers at every level for every profession that trades, and none for the others', () => {
    for (const p of TRADING_PROFESSIONS) {
      for (let level = 1; level <= MAX_VILLAGER_LEVEL; level++) expect(offersAt(p, level).length, `${p} level ${level}`).toBeGreaterThan(0);
    }
    for (const p of ['unemployed', 'nitwit'] as const) expect(newBook(p).offers).toEqual([]);
    expect(PROFESSIONS.length).toBe(11);
  });

  it('only names items that exist, in amounts that fit a stack, and always has an emerald on one side', () => {
    for (const p of TRADING_PROFESSIONS) {
      for (let level = 1; level <= MAX_VILLAGER_LEVEL; level++) {
        for (const o of offersAt(p, level)) {
          for (const [id, n] of [o.a, o.b, o.r].filter(Boolean) as [number, number][]) {
            expect(getItem(id).id, `${p}: item ${id}`).toBe(id);
            expect(n).toBeGreaterThan(0);
            expect(n).toBeLessThanOrEqual(maxStackOf(makeStack(id)));
          }
          expect(o.a[0] === I.EMERALD || o.r[0] === I.EMERALD, `${p} level ${level} trades emeralds`).toBe(true);
          expect(o.level).toBe(level);
          expect(o.uses).toBe(0);
          expect(o.max).toBeGreaterThan(0);
        }
      }
    }
  });

  it('buys for emeralds what a villager needs, and sells its wares for emeralds', () => {
    const farmer = offersAt('farmer', 1);
    expect(farmer.some((o) => o.a[0] === I.WHEAT && o.r[0] === I.EMERALD)).toBe(true);
    expect(farmer.some((o) => o.a[0] === I.EMERALD && o.r[0] === I.BREAD)).toBe(true);
    expect(offersAt('armorer', 1).some((o) => o.a[0] === I.EMERALD && getItem(o.r[0]).armor?.material === 'iron')).toBe(true);
    // The shepherd sells beds, which are items of their own colour.
    expect(offersAt('shepherd', 3).some((o) => o.a[0] === I.EMERALD && getItem(o.r[0]).name.endsWith('bed'))).toBe(true);
  });

  it('levels up on experience: 10, 70, 150 and 250', () => {
    expect(LEVEL_XP).toEqual([10, 70, 150, 250]);
    expect([0, 9, 10, 69, 70, 150, 250, 9999].map(levelForXp)).toEqual([1, 1, 2, 2, 3, 4, 5, 5]);
    const book = newBook('toolsmith');
    const before = book.offers.length;
    expect(addVillagerXp(book, 9)).toBe(false);
    expect(addVillagerXp(book, 1)).toBe(true);
    expect(book.level).toBe(2);
    expect(book.offers.length).toBeGreaterThan(before);
    expect(book.offers.at(-1)!.level).toBe(2);
    // A big gain skips levels but adds all of their offers.
    addVillagerXp(book, 1000);
    expect(book.level).toBe(5);
    expect(new Set(book.offers.map((o) => o.level))).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  it('restocks every offer', () => {
    const book = newBook('farmer');
    for (const o of book.offers) o.uses = o.max;
    restock(book);
    expect(book.offers.every((o) => o.uses === 0)).toBe(true);
  });

  it('keeps a mob variant that says profession and level', () => {
    const book = newBook('cleric');
    book.level = 4;
    const v = villagerVariant({ ...book, homeX: 0, homeY: 0, homeZ: 0 });
    expect(variantProfession(v)).toBe('cleric');
    expect(variantLevel(v)).toBe(4);
  });

  it('rejects malformed saved offers', () => {
    expect(parseOffers(null)).toEqual([]);
    expect(parseOffers([{ a: [I.WHEAT, 20], r: [I.EMERALD, 1], max: 16, uses: 3, xp: 2, level: 1 }])).toHaveLength(1);
    const bad = [
      { a: [I.WHEAT, 0], r: [I.EMERALD, 1], max: 16, uses: 0, xp: 2, level: 1 },
      { a: [I.WHEAT, 20], r: 'x', max: 16, uses: 0, xp: 2, level: 1 },
      { a: [I.WHEAT, 20], b: [1], r: [I.EMERALD, 1], max: 16, uses: 0, xp: 2, level: 1 },
      { a: [I.WHEAT, 20], r: [I.EMERALD, 1], max: NaN, uses: 0, xp: 2, level: 1 },
      { a: [I.WHEAT, 99999], r: [I.EMERALD, 1], max: 16, uses: 0, xp: 2, level: 1 },
      null,
      7,
    ];
    expect(parseOffers(bad)).toEqual([]);
    // Numbers are clamped.
    const [o] = parseOffers([{ a: [I.WHEAT, 20], r: [I.EMERALD, 1], max: 9999, uses: -4, xp: 2, level: 12 }]);
    expect(o.max).toBe(64);
    expect(o.uses).toBe(0);
    expect(o.level).toBe(MAX_VILLAGER_LEVEL);
  });

  it('is a valid emerald: an ore that drops it, and an item', () => {
    expect(getItem(I.EMERALD).name).toBe('emerald');
    expect(getItem(B.EMERALD_ORE).block).toBe(B.EMERALD_ORE);
  });
});

// ---------------------------------------------------------------------------------------------------
// the trade screen

function screen(profession = 'farmer' as const, give: [number, number][] = []) {
  const inv = new Container(PLAYER_SLOTS);
  give.forEach(([id, n], i) => inv.set(i, makeStack(id, n)));
  const trades: number[] = [];
  const levels: number[] = [];
  const book = newBook(profession);
  const menu = new TradeMenu(inv, book, { onTrade: (o) => trades.push(o.xp), onLevelUp: (l) => levels.push(l) });
  return { inv, book, menu, trades, levels };
}

describe('the trade screen', () => {
  it('moves the payment in when you choose an offer, and shows what you would get', () => {
    const { inv, menu } = screen('farmer', [[I.WHEAT, 40]]);
    menu.select(0); // 20 wheat for an emerald
    expect(menu.payment.get(0)).toMatchObject({ id: I.WHEAT, count: 20 });
    expect(inv.countOf(I.WHEAT)).toBe(20);
    expect(menu.result.get(0)).toMatchObject({ id: I.EMERALD, count: 1 });
    expect(menu.selected).toBe(0);
  });

  it('shows nothing to take when you cannot pay', () => {
    const { menu } = screen('farmer', [[I.WHEAT, 5]]);
    menu.select(0);
    expect(menu.payment.isEmpty()).toBe(true);
    expect(menu.result.get(0)).toBeNull();
    // Putting the rest in by hand is not enough either.
    menu.select(1); // an emerald for bread: you have none
    expect(menu.result.get(0)).toBeNull();
  });

  it('trades: takes the payment, gives the result, counts the use and the experience, and refills', () => {
    const { inv, book, menu, trades } = screen('farmer', [[I.WHEAT, 45]]);
    menu.select(0);
    menu.click(menu.resultSlot, 0);
    expect(menu.cursor).toMatchObject({ id: I.EMERALD, count: 1 });
    expect(book.offers[0].uses).toBe(1);
    expect(book.xp).toBe(2);
    expect(trades).toEqual([2]);
    // The payment is topped up from the inventory for the next one.
    expect(menu.payment.get(0)).toMatchObject({ id: I.WHEAT, count: 20 });
    expect(inv.countOf(I.WHEAT)).toBe(5);
    expect(menu.result.get(0)).toMatchObject({ id: I.EMERALD, count: 1 });
  });

  it('shift-click trades for as long as you can pay', () => {
    const { inv, book, menu } = screen('farmer', [[I.WHEAT, 64], [I.WHEAT, 36]]);
    menu.select(0);
    menu.shiftClick(menu.resultSlot);
    expect(inv.countOf(I.EMERALD)).toBe(5); // 100 wheat is five lots of 20
    expect(inv.countOf(I.WHEAT)).toBe(0);
    expect(book.offers[0].uses).toBe(5);
    expect(menu.payment.isEmpty()).toBe(true);
    expect(menu.result.get(0)).toBeNull();
  });

  it('stops when the offer is used up, and starts again after a restock', () => {
    const { inv, book, menu } = screen('farmer', [[I.WHEAT, 64], [I.WHEAT, 64], [I.WHEAT, 64], [I.WHEAT, 64], [I.WHEAT, 64], [I.WHEAT, 64]]);
    menu.select(0);
    menu.shiftClick(menu.resultSlot);
    expect(book.offers[0].uses).toBe(16); // it will only do 16
    expect(inv.countOf(I.EMERALD)).toBe(16);
    expect(menu.result.get(0)).toBeNull();
    menu.select(0);
    expect(menu.result.get(0)).toBeNull();
    restock(book);
    menu.select(0);
    expect(menu.result.get(0)).toMatchObject({ id: I.EMERALD });
  });

  it('sells for emeralds, and levels the villager up with enough trades', () => {
    const { inv, book, menu, levels } = screen('farmer', [[I.EMERALD, 40]]);
    expect(book.level).toBe(1);
    menu.select(1); // an emerald for 6 bread
    menu.shiftClick(menu.resultSlot);
    expect(inv.countOf(I.BREAD)).toBe(6 * book.offers[1].uses);
    expect(book.offers[1].uses).toBeGreaterThanOrEqual(5);
    // Each trade is worth 2 experience; ten is level 2.
    expect(book.xp).toBeGreaterThanOrEqual(10);
    expect(book.level).toBe(2);
    expect(levels).toEqual([2]);
    expect(book.offers.some((o) => o.level === 2)).toBe(true);
  });

  it('pays with two kinds of item when an offer asks for two', () => {
    const { inv, book, menu } = screen('farmer', [[I.EMERALD, 4]]);
    // No offer in the table needs two payments yet, so make one.
    book.offers.push({ a: [I.EMERALD, 2], b: [I.WHEAT, 3], r: [I.DIAMOND, 1], max: 4, uses: 0, xp: 5, level: 1 });
    menu.select(book.offers.length - 1);
    expect(menu.result.get(0)).toBeNull(); // no wheat yet
    inv.set(1, makeStack(I.WHEAT, 8));
    menu.select(book.offers.length - 1);
    expect(menu.result.get(0)).toMatchObject({ id: I.DIAMOND, count: 1 });
    menu.click(menu.resultSlot, 0);
    expect(menu.cursor).toMatchObject({ id: I.DIAMOND });
    expect(menu.payment.get(0)).toMatchObject({ id: I.EMERALD, count: 2 }); // refilled
    expect(menu.payment.get(1)).toMatchObject({ id: I.WHEAT, count: 3 });
    expect(inv.countOf(I.WHEAT)).toBe(2);
  });

  it('hands the payment back when you choose another offer or close the screen', () => {
    const { inv, menu } = screen('farmer', [[I.WHEAT, 20], [I.EMERALD, 3]]);
    menu.select(0);
    expect(inv.countOf(I.WHEAT)).toBe(0);
    menu.select(1);
    expect(inv.countOf(I.WHEAT)).toBe(20);
    expect(menu.payment.get(0)).toMatchObject({ id: I.EMERALD, count: 1 });
    const left = menu.close();
    expect(left.map((s) => s.id)).toEqual([I.EMERALD]);
    expect(menu.result.get(0)).toBeNull();
  });

  it('only takes an ingredient of the chosen offer into the payment slots', () => {
    const { inv, menu } = screen('farmer', [[B.STONE, 5], [I.WHEAT, 20]]);
    menu.select(0);
    inv.set(2, makeStack(B.STONE, 3));
    menu.cursor = makeStack(B.STONE, 3);
    menu.click(menu.paymentStart + 1, 0);
    expect(menu.payment.get(1)).toBeNull();
    expect(menu.cursor).toMatchObject({ id: B.STONE, count: 3 });
    // Shift-clicking stone from the inventory does not go to the payment slots either.
    menu.cursor = null;
    menu.shiftClick(0);
    expect(menu.payment.get(1)).toBeNull();
  });

  it('refuses bad offer numbers and conserves what it is given', () => {
    const { inv, menu } = screen('farmer', [[I.WHEAT, 20]]);
    const total = menu.totalItems();
    for (const i of [-1, 99, 1.5, NaN]) menu.select(i);
    expect(menu.selected).toBe(-1);
    menu.select(0);
    expect(menu.totalItems()).toBe(total);
    menu.close();
    expect(inv.countOf(I.WHEAT) + 0).toBeLessThanOrEqual(20);
  });
});

describe('the trade command', () => {
  it('is validated', () => {
    expect(parseSessionMessage({ t: 'trade', index: 2 })).toEqual({ t: 'trade', index: 2 });
    for (const index of [-1, 64, 1.5, NaN, '3', null]) expect(parseSessionMessage({ t: 'trade', index })).toBeNull();
    expect(parseSessionMessage({ t: 'trade' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------
// the villagers in the world

const SEED = 1337;
const idle = (over: Partial<InputFrame> = {}): InputFrame => ({ t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false, ...over });

function world() {
  const generator = new WorldGenerator(SEED);
  const hw = new HeadlessWorld(generator);
  const site = generator.villages.nearest(0, 0)!;
  const make = (): GameSession => {
    const s = new GameSession({ seed: SEED, world: hw, generator, naturalSpawning: false, villagers: true, rand: mulberry32(7) });
    s.finishLoading();
    return s;
  };
  return { generator, hw, site, make };
}

function run(s: GameSession, seconds: number, over: Partial<InputFrame> = {}, events: SessionEvent[] = []): SessionEvent[] {
  for (let t = 0; t < seconds - 1e-9; t += 1 / 20) {
    s.tick(idle(over));
    events.push(...s.drainEvents());
  }
  return events;
}

const villagers = (s: GameSession): Mob[] => s.realm.mobs.mobs.filter((m) => m.kind === 'villager' && !m.dead);
const near = (site: { x: number; z: number; groundY: number }, s: GameSession, dz = 16): void => s.teleport(site.x + 0.5, site.groundY + 1, site.z + dz + 0.5, 0, 0);

describe('the people of a village', () => {
  it('come to life when a player is near, one for every home', () => {
    const { generator, site, make } = world();
    const s = make();
    near(site, s);
    run(s, 3);
    const homes = generator.villages.homesOf(site);
    expect(homes.length).toBeGreaterThan(2);
    expect(villagers(s).length).toBe(homes.length);
    for (const m of villagers(s)) {
      expect(m.villager).not.toBeNull();
      expect(m.def.persistent).toBe(true);
      expect(PROFESSIONS).toContain(m.villager!.profession);
    }
    // Farms have farmers; every villager with a trade has offers.
    const kinds = homes.map((h) => h.kind);
    const farmers = s.realm.folkOf(site).filter((r) => r.profession === 'farmer').length;
    expect(farmers).toBeGreaterThanOrEqual(kinds.filter((k) => k === 'farm').length);
    for (const r of s.realm.folkOf(site)) expect(r.offers.length > 0).toBe((TRADING_PROFESSIONS as readonly string[]).includes(r.profession));
  });

  it('are the same villagers in a new world with the same seed', () => {
    const a = world();
    const sa = a.make();
    near(a.site, sa);
    run(sa, 2);
    const b = world();
    const sb = b.make();
    near(b.site, sb);
    run(sb, 2);
    const key = (s: GameSession) => s.realm.folkOf(a.site).map((r) => `${r.profession}@${r.homeX},${r.homeZ}`);
    expect(key(sa)).toEqual(key(sb));
  });

  it('go back to being records when everyone is far away, and come back as they were', () => {
    const { site, make } = world();
    const s = make();
    near(site, s);
    run(s, 2);
    const rec = s.realm.folkOf(site)[0];
    rec.offers[0].uses = 7;
    rec.xp = 4;
    const count = villagers(s).length;
    // Walk away (a teleport: the world idles unless time passes, so give it a few seconds).
    s.teleport(site.x + 400.5, 250, site.z + 400.5, 0, 0); // high up: the land there may be a mountain
    run(s, 2);
    expect(villagers(s).length).toBe(0);
    expect(rec.mob).toBeNull();
    near(site, s);
    run(s, 2);
    expect(villagers(s).length).toBe(count);
    const back = s.realm.folkOf(site)[0];
    expect(back).toBe(rec);
    expect(back.offers[0].uses).toBe(7);
    expect(back.xp).toBe(4);
    expect(back.mob).not.toBeNull();
  });

  it('are saved with the world: trades, levels, and the dead stay dead', () => {
    const { site, make } = world();
    const s = make();
    near(site, s);
    run(s, 2);
    const folk = s.realm.folkOf(site);
    folk[0].level = 3;
    folk[0].xp = 80;
    folk[0].offers[0].uses = 5;
    const victim = folk[1];
    s.realm.mobs.damage(victim.mob!, 999, 1, 0, s.realm.mobEvents, true, true, true);
    run(s, 3);
    expect(victim.alive).toBe(false);

    const saved = JSON.parse(JSON.stringify(s.saveWorldState()));
    expect(parseWorldState(saved)?.villagers).toBeTruthy();

    const { make: make2 } = world();
    const s2 = make2();
    s2.loadWorldState(parseWorldState(saved)!);
    const again = s2.realm.folkOf(site);
    expect(again.map((r) => r.alive)).toEqual(folk.map((r) => r.alive));
    expect(again[0]).toMatchObject({ level: 3, xp: 80, profession: folk[0].profession });
    expect(again[0].offers[0].uses).toBe(5);
    near(site, s2);
    run(s2, 3);
    expect(villagers(s2).length).toBe(folk.filter((r) => r.alive).length);
    expect(again[1].mob).toBeNull();
  });

  it('are not part of what a player saves with their mobs', () => {
    const { site, make } = world();
    const s = make();
    near(site, s);
    run(s, 2);
    expect(villagers(s).length).toBeGreaterThan(0);
    expect(s.savePlayer().mobs).not.toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'villager' })]));
  });

  it('survive a hostile save that names a villager', () => {
    const { make } = world();
    const s = make();
    expect(s.realm.mobs.loadJSON([{ kind: 'villager', x: 1, y: 100, z: 1, yaw: 0, health: 20 }])).toBe(0);
    expect(() => s.loadWorldState({ v: 1, time: 0.2, weather: null, blockEntities: null, villagers: { epoch: 'x', folk: { '1,2': [{ h: [1] }, null, 5, { h: [1, 2, 3], x: 'a' }] } } })).not.toThrow();
    expect(s.realm.folk.size).toBe(0);
  });

  it('restock twice a day: at dawn and in the afternoon', () => {
    const { site, make } = world();
    const s = make();
    near(site, s);
    run(s, 2);
    const rec = s.realm.folkOf(site).find((r) => r.offers.length > 0)!;
    const used = () => rec.offers.every((o) => o.uses === 0);
    const e0 = s.realm.restockEpoch;
    rec.offers[0].uses = 3;
    s.realm.time = 0.31; // just past the afternoon mark
    run(s, 0.1);
    s.realm.time = 0.35;
    run(s, 2.5);
    expect(s.realm.restockEpoch).toBe(e0 + 1);
    expect(used()).toBe(true);
    rec.offers[0].uses = 3;
    s.realm.time = 0.99;
    run(s, 0.1);
    s.realm.time = 0.01;
    run(s, 2.5);
    expect(s.realm.restockEpoch).toBe(e0 + 2);
    expect(used()).toBe(true);
  });
});

describe('talking to a villager', () => {
  function setup() {
    const w = world();
    const s = w.make();
    near(w.site, s);
    run(s, 2);
    const trader = villagers(s).find((m) => m.villager!.offers.length > 0)!;
    return { ...w, s, trader };
  }

  it('opens the trade screen, and the villager stands still facing you', () => {
    const { s, trader } = setup();
    s.teleport(trader.body.x + 1.5, trader.body.y + 0.1, trader.body.z, 0, 0);
    expect(s.talkToMob(trader.id)).toBe(true);
    expect(s.screen).toBe('trade');
    expect(s.menu).toBeInstanceOf(TradeMenu);
    expect(trader.customer).not.toBeNull();
    const at = { x: trader.body.x, z: trader.body.z };
    run(s, 2);
    expect(Math.hypot(trader.body.x - at.x, trader.body.z - at.z)).toBeLessThan(0.3);
  });

  it('trades through the commands, pays out experience, and closing lets the villager go', () => {
    const { s, trader } = setup();
    s.teleport(trader.body.x + 1.5, trader.body.y + 0.1, trader.body.z, 0, 0);
    s.clearInventory();
    s.giveItem(I.EMERALD, 8);
    s.talkToMob(trader.id);
    const menu = s.menu as TradeMenu;
    const sells = trader.villager!.offers.findIndex((o) => o.a[0] === I.EMERALD);
    expect(sells).toBeGreaterThanOrEqual(0);
    s.command({ t: 'trade', index: sells });
    run(s, 0.1);
    expect(menu.selected).toBe(sells);
    expect(menu.result.get(0)).not.toBeNull();
    s.command({ t: 'shift', slot: menu.resultSlot });
    const events = run(s, 0.1);
    const o = trader.villager!.offers[sells];
    expect(o.uses).toBeGreaterThan(0);
    expect(s.inventory.countOf(o.r[0])).toBeGreaterThanOrEqual(o.r[1]);
    expect(events.some((e) => e.t === 'mob' && e.kind === 'villager' && e.sound === 'yes')).toBe(true);
    // The trade let out orbs of experience, which came to you.
    settleOrbs(s);
    expect(s.xp.total).toBeGreaterThan(0);
    s.command({ t: 'closeMenu' });
    run(s, 0.1);
    expect(s.screen).toBe('none');
    expect(trader.customer).toBeNull();
    expect(s.tradingWith).toBeNull();
  });

  it('closes the screen when you walk away', () => {
    const { s, trader } = setup();
    s.teleport(trader.body.x + 1.5, trader.body.y + 0.1, trader.body.z, 0, 0);
    s.talkToMob(trader.id);
    expect(s.screen).toBe('trade');
    s.teleport(trader.body.x + 12, trader.body.y + 0.1, trader.body.z, 0, 0);
    run(s, 0.3);
    expect(s.screen).toBe('none');
    expect(trader.customer).toBeNull();
  });

  it('closes the screen, and keeps the payment, when the villager dies', () => {
    const { s, trader } = setup();
    s.teleport(trader.body.x + 1.5, trader.body.y + 0.1, trader.body.z, 0, 0);
    s.clearInventory();
    s.giveItem(I.EMERALD, 4);
    s.talkToMob(trader.id);
    const menu = s.menu as TradeMenu;
    s.command({ t: 'trade', index: trader.villager!.offers.findIndex((o) => o.a[0] === I.EMERALD) });
    run(s, 0.1);
    expect(menu.payment.isEmpty()).toBe(false);
    s.damageMob(trader.id, 999);
    run(s, 0.3);
    expect(s.screen).toBe('none');
    expect(s.inventory.countOf(I.EMERALD)).toBe(4);
  });

  it('is only for one customer at a time', () => {
    const { s, trader } = setup();
    s.teleport(trader.body.x + 1.5, trader.body.y + 0.1, trader.body.z, 0, 0);
    trader.customer = { body: { x: 0, z: 0 } }; // somebody else
    const events: SessionEvent[] = [];
    expect(s.talkToMob(trader.id)).toBe(true);
    events.push(...s.drainEvents());
    expect(s.screen).toBe('none');
    expect(events.some((e) => e.t === 'mob' && e.sound === 'no')).toBe(true);
  });

  it('a nitwit shakes its head instead', () => {
    const { s, site } = setup();
    const nit = villagers(s).find((m) => m.villager!.offers.length === 0);
    // Make one if this village has none.
    const m = nit ?? villagers(s)[0];
    if (!nit) {
      m.villager!.profession = 'nitwit';
      m.villager!.offers = [];
    }
    s.teleport(m.body.x + 1.5, m.body.y + 0.1, m.body.z, 0, 0);
    expect(site).toBeTruthy();
    s.drainEvents();
    expect(s.talkToMob(m.id)).toBe(true);
    const events = s.drainEvents();
    expect(s.screen).toBe('none');
    expect(events.some((e) => e.t === 'mob' && e.kind === 'villager' && e.sound === 'no')).toBe(true);
  });
});

describe('villagers going about their day', () => {
  const homeDist = (m: Mob): number => Math.hypot(m.body.x - m.villager!.homeX, m.body.z - m.villager!.homeZ);

  it('stay in the village by day', () => {
    const { site, make } = world();
    const s = make();
    s.realm.time = 0.2;
    s.setMode('creative');
    near(site, s);
    run(s, 40);
    expect(villagers(s).length).toBeGreaterThan(0);
    for (const m of villagers(s)) expect(homeDist(m), `${m.villager!.profession}`).toBeLessThan(25);
  });

  it('go home at night, through their doors', () => {
    const { site, make } = world();
    const s = make();
    s.realm.time = 0.2;
    s.setMode('creative');
    near(site, s);
    run(s, 30);
    // Dusk to deep night: freeze the clock at midnight and let them walk.
    const settled = (): number => villagers(s).filter((m) => homeDist(m) < 2.5).length;
    for (let i = 0; i < 70; i++) {
      s.realm.time = 0.75;
      run(s, 1);
    }
    const all = villagers(s).length;
    expect(settled()).toBeGreaterThanOrEqual(Math.ceil(all * 0.7));
  });

  it('run from zombies, and zombies hunt them down', () => {
    // A dead-end corridor, one block wide, with a villager at the shut end and a zombie coming in.
    const edits = new Map<string, number>();
    for (let x = -1; x <= 8; x++) for (let y = 1; y <= 3; y++) for (const z of [-1, 1]) edits.set(`${x},${y},${z}`, B.STONE);
    for (let y = 1; y <= 3; y++) {
      edits.set(`8,${y},0`, B.STONE);
      edits.set(`-1,${y},0`, B.STONE);
    }
    for (let x = -1; x <= 8; x++) for (const z of [-1, 0, 1]) edits.set(`${x},4,${z}`, B.STONE);
    const world = { getBlock: (x: number, y: number, z: number) => edits.get(`${x},${y},${z}`) ?? (y < 0 ? B.STONE : y === 0 ? B.GRASS : B.AIR) };
    const rand = mulberry32(3);
    const mgr = new MobManager(rand);
    const env = { world, player: { x: 30, y: 1, z: 30, alive: true, invulnerable: true }, daylight: 0, rand };
    const events = { hurtPlayer: () => undefined, explode: () => undefined, sound: () => undefined, drop: () => undefined };
    const villager = mgr.spawn('villager', 7.5, 1, 0.5);
    const zombie = mgr.spawn('zombie', 1.5, 1, 0.5);
    const tick = (seconds: number) => {
      for (let t = 0; t < seconds; t += 1 / 30) mgr.update(1 / 30, env, events);
    };
    tick(1);
    expect(villager.body.x).toBeGreaterThan(6.5); // backed into its corner
    tick(12);
    expect(villager.health, 'the zombie got to it').toBeLessThan(villager.def.health);
    expect(zombie.dead).toBe(false);
  });

  it('run away across open ground', () => {
    const world = { getBlock: (_x: number, y: number) => (y < 0 ? B.STONE : y === 0 ? B.GRASS : B.AIR) };
    const rand = mulberry32(4);
    const mgr = new MobManager(rand);
    const env = { world, player: { x: 30, y: 1, z: 30, alive: true, invulnerable: true }, daylight: 0, rand };
    const events = { hurtPlayer: () => undefined, explode: () => undefined, sound: () => undefined, drop: () => undefined };
    const v = mgr.spawn('villager', 0.5, 1, 0.5);
    const z = mgr.spawn('zombie', 6.5, 1, 0.5);
    for (let t = 0; t < 3; t += 1 / 30) mgr.update(1 / 30, env, events);
    expect(Math.hypot(v.body.x - z.body.x, v.body.z - z.body.z)).toBeGreaterThan(6);
    expect(v.health).toBe(v.def.health);
  });

  it('count against nothing: villagers do not use up the animal cap', () => {
    const { site, make } = world();
    const s = make();
    near(site, s);
    run(s, 2);
    expect(s.realm.mobs.countNear(site.x, site.z, 60, false)).toBe(0);
  });
});

describe('emerald ore in the world', () => {
  it('is rare, deep and the same every time', () => {
    const count = (seed: number) => {
      const gen = new WorldGenerator(seed);
      let n = 0;
      let lowest = 999;
      let highest = -1;
      let stone = 0;
      for (let cx = -6; cx <= 6; cx++)
        for (let cz = -6; cz <= 6; cz++) {
          const chunk = gen.generateChunk(cx, cz);
          for (let i = 0; i < chunk.length; i++) {
            if (chunk[i] === B.STONE) stone++;
            if (chunk[i] !== B.EMERALD_ORE) continue;
            n++;
            const y = Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE));
            lowest = Math.min(lowest, y);
            highest = Math.max(highest, y);
          }
        }
      return { n, lowest, highest, stone };
    };
    const a = count(4242);
    expect(a.n).toBeGreaterThan(0);
    expect(a.n).toBeLessThan(a.stone / 400);
    expect(a.lowest).toBeGreaterThanOrEqual(4);
    expect(a.highest).toBeLessThanOrEqual(48 + 2);
    expect(count(4242).n).toBe(a.n);
  });

  it('is mined with an iron pickaxe, and pays out experience', () => {
    const pick = (kind: 'wood' | 'stone' | 'iron') => getItem(toolId('pickaxe', kind)).tool ?? null;
    expect(blockDrops(BLOCKS[B.EMERALD_ORE], pick('iron'), mulberry32(1))).toEqual([{ id: I.EMERALD, count: 1 }]);
    expect(blockDrops(BLOCKS[B.EMERALD_ORE], pick('stone'), mulberry32(1))).toEqual([]);
    expect(BLOCK_XP[B.EMERALD_ORE]).toEqual([3, 7]);
  });
});