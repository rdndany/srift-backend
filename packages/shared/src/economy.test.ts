import { describe, expect, it } from 'vitest';
import {
  ADVENTURE_SEED,
  B,
  CURRENCY,
  GameSession,
  armorId,
  HeadlessWorld,
  I,
  MAX_COINS,
  NPCS,
  QUESTS,
  SHOPS,
  coinsForKill,
  formatCoins,
  getItem,
  makeGenerator,
  makeStack,
  mulberry32,
  npcById,
  parsePlayerSave,
  parseSessionMessage,
  questById,
  rewardCoins,
  sellPrice,
  shopOf,
  skillBookAbility,
  type AdventureWorldGenerator,
  type InputFrame,
  type SessionEvent,
} from './index';
import { startInVillage } from './villageStart.testutil';

const idle = (over: Partial<InputFrame> = {}): InputFrame => ({ t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false, ...over });

const generator = makeGenerator(ADVENTURE_SEED, 'adventure') as AdventureWorldGenerator;

function make(seed = 3) {
  const world = new HeadlessWorld(generator);
  const s = new GameSession({ seed: ADVENTURE_SEED, world, generator, naturalSpawning: false, rand: mulberry32(seed) });
  s.finishLoading();
  startInVillage(s, generator);
  return s;
}

const run = (s: GameSession, seconds: number): void => {
  for (let i = 0; i < Math.round(seconds * 20); i++) s.tick(idle());
};

/** Stand in front of a person of the village and speak to them. */
function talkTo(s: GameSession, id: string): void {
  const n = NPCS.find((x) => x.id === id)!;
  s.teleport(n.x, generator.hubY + 1, n.z + 2, 0, 0);
  run(s, 0.2);
  const v = NPCS.findIndex((x) => x.id === id);
  const m = s.mobs.mobs.find((x) => x.kind === 'npc' && x.variant === v)!;
  expect(s.talkNpc(m)).toBe(true);
}

const events = (s: GameSession): SessionEvent[] => s.drainEvents();

describe('the currency', () => {
  it('has a name, and prints amounts with thousands separators', () => {
    expect(CURRENCY.name).toBe('Auren');
    expect(formatCoins(0)).toBe('0 Auren');
    expect(formatCoins(1234567)).toBe('1,234,567 Auren');
    expect(formatCoins(-5)).toBe('0 Auren');
  });

  it('is paid by monsters in a range, more for a bigger slime, and not by what cannot be killed', () => {
    const r = mulberry32(5);
    for (let i = 0; i < 200; i++) {
      const z = coinsForKill('zombie', 1, r);
      expect(z).toBeGreaterThanOrEqual(4);
      expect(z).toBeLessThanOrEqual(9);
    }
    expect(coinsForKill('slime', 4, () => 0.99)).toBe(8);
    expect(coinsForKill('enderman', 1, () => 0)).toBe(30);
    for (const kind of ['npc', 'dummy', 'villager', 'bat', 'squid'] as const) expect(coinsForKill(kind, 1, () => 0.5)).toBe(0);
  });

  it('is paid twice the experience for a quest unless it says otherwise', () => {
    expect(rewardCoins({ xp: 30, items: [] })).toBe(60);
    expect(rewardCoins({ xp: 30, coins: 5, items: [] })).toBe(5);
    for (const q of QUESTS) expect(rewardCoins(q.reward)).toBeGreaterThanOrEqual(0);
  });
});

describe('the shops', () => {
  it('belong to people of the village, and sell real items at real prices', () => {
    expect(SHOPS.length).toBeGreaterThan(0);
    for (const shop of SHOPS) {
      expect(npcById(shop.npc), shop.npc).not.toBeNull();
      expect(shopOf(shop.npc)).toBe(shop);
      expect(shop.stock.length).toBeGreaterThan(0);
      for (const w of shop.stock) {
        expect(() => getItem(w.id)).not.toThrow();
        expect(Number.isInteger(w.price) && w.price > 0, `price of ${w.id}`).toBe(true);
        expect(w.count).toBeGreaterThan(0);
        expect(w.count).toBeLessThanOrEqual(getItem(w.id).maxStack);
      }
    }
  });

  it('are specialised, as in World of Warcraft: one keeper per trade, and no ware is sold by two of them', () => {
    expect(SHOPS.map((s) => s.npc).sort()).toEqual(['fenna', 'garrick', 'hilda', 'lysa', 'tobin']);
    const seen = new Map<number, string>();
    for (const shop of SHOPS) {
      for (const w of shop.stock) {
        expect(seen.get(w.id) ?? shop.npc, `item ${w.id} sold by ${seen.get(w.id)} and ${shop.npc}`).toBe(shop.npc);
        seen.set(w.id, shop.npc);
      }
    }
    // Every keeper stands at a stall of their own.
    expect(new Set(SHOPS.map((s) => `${npcById(s.npc)!.x},${npcById(s.npc)!.z}`)).size).toBe(SHOPS.length);
  });

  it('keep to their trade: armor at the armorer, blades at the weaponsmith, bows with the ranger, magic with the arcanist', () => {
    const stock = (npc: string) => shopOf(npc)!.stock.map((w) => getItem(w.id));
    // Twelve plain pieces and every set again in uncommon, rare and epic, with rolled stats.
    expect(stock('hilda').filter((i) => i.armor).length).toBe(12 + 36);
    expect(stock('hilda').some((i) => i.shield)).toBe(true);
    expect(stock('garrick').filter((i) => skillBookAbility(i.id) === null).every((i) => i.tool?.kind === 'sword' || i.weapon)).toBe(true);
    expect(shopOf('fenna')!.stock.some((w) => w.id === I.BOW)).toBe(true);
    expect(shopOf('lysa')!.stock.some((w) => w.id === I.WAND)).toBe(true);
    for (const npc of ['tobin', 'garrick', 'fenna', 'lysa']) expect(stock(npc).some((i) => i.armor), npc).toBe(false);
  });
  it('pay less for an item than they charge for it, so buying and selling back never makes money', () => {
    for (const shop of SHOPS) {
      for (const w of shop.stock) expect(sellPrice(w.id) * w.count, `item ${w.id}`).toBeLessThan(w.price);
    }
  });

  it('buy raw materials and loot, and not tools, armor or plain blocks', () => {
    expect(sellPrice(I.DIAMOND)).toBeGreaterThan(sellPrice(I.IRON_INGOT));
    expect(sellPrice(I.IRON_INGOT)).toBeGreaterThan(sellPrice(I.COAL));
    expect(sellPrice(I.BOW)).toBe(0);
    expect(sellPrice(B.DIRT)).toBe(0);
    expect(sellPrice(-1)).toBe(0);
  });
});

describe('an Adventure player with coins', () => {
  it('starts with none, takes coins in and reports them, and cannot go over the top or below zero', () => {
    const s = make();
    expect(s.coins).toBe(0);
    events(s);
    expect(s.addCoins(25)).toBe(25);
    expect(s.coins).toBe(25);
    expect(events(s)).toContainEqual({ t: 'coins', gain: 25 });
    expect(s.addCoins(-5)).toBe(0);
    expect(s.addCoins(Number.NaN)).toBe(0);
    expect(s.addCoins(0.9)).toBe(0);
    expect(s.coins).toBe(25);
    expect(s.addCoins(MAX_COINS)).toBe(MAX_COINS - 25);
    expect(s.coins).toBe(MAX_COINS);
    expect(s.addCoins(1)).toBe(0);
  });

  it('spends coins only when there are enough, and never a negative amount', () => {
    const s = make();
    s.addCoins(50);
    expect(s.spendCoins(51)).toBe(false);
    expect(s.coins).toBe(50);
    expect(s.spendCoins(-10)).toBe(false);
    expect(s.spendCoins(Number.NaN)).toBe(false);
    expect(s.coins).toBe(50);
    expect(s.spendCoins(20)).toBe(true);
    expect(s.coins).toBe(30);
  });

  it('is paid for a kill, but not when nobody hurt the mob', () => {
    const s = make();
    s.teleport(5.5, generator.hubY + 1, 8.5);
    run(s, 0.2);
    let total = 0;
    for (let i = 0; i < 6; i++) {
      const id = s.spawnMob('zombie', 5.5, generator.hubY + 1, 6.5);
      expect(s.damageMob(id, 500)).toBe(true);
      total = s.coins;
    }
    expect(total).toBeGreaterThanOrEqual(6 * 4);
    expect(total).toBeLessThanOrEqual(6 * 9);
    const m = s.mobs.spawn('zombie', 5.5, generator.hubY + 1, 6.5);
    s.mobs.damage(m, 500, 0, 1, s.realm.mobEvents, true, true, false);
    expect(s.coins).toBe(total);
  });

  it('is paid for handing in a quest', () => {
    const s = make();
    const q = questById('welcome')!;
    talkTo(s, q.giver);
    s.apply({ t: 'quest', a: 'accept', id: q.id });
    s.closeMenu();
    talkTo(s, q.turnIn);
    s.apply({ t: 'quest', a: 'complete', id: q.id });
    expect(s.quests!.status(q.id)).toBe('done');
    expect(s.coins).toBe(rewardCoins(q.reward));
    expect(s.coins).toBeGreaterThan(0);
  });

  it('keeps its coins through a save, and a damaged save cannot make more', () => {
    const s = make();
    s.addCoins(1234);
    const save = s.savePlayer();
    expect(save.coins).toBe(1234);
    const t = make(4);
    t.loadPlayer(parsePlayerSave(JSON.parse(JSON.stringify(save)))!);
    expect(t.coins).toBe(1234);
    expect(parsePlayerSave({ ...save, coins: 1e30 })!.coins).toBe(MAX_COINS);
    expect(parsePlayerSave({ ...save, coins: -5 })!.coins).toBeUndefined();
    expect(parsePlayerSave({ ...save, coins: 'lots' })!.coins).toBeUndefined();
    expect(parsePlayerSave({ ...save, coins: Number.NaN })!.coins).toBeUndefined();
    expect(make().savePlayer().coins).toBeUndefined();
  });
});

describe('buying and selling', () => {
  const tobin = shopOf('tobin')!;
  const wareIndex = (id: number): number => tobin.stock.findIndex((w) => w.id === id);

  it('is only possible in front of a merchant', () => {
    const s = make();
    s.addCoins(1000);
    s.apply({ t: 'shop', a: 'buy', i: 0, n: 1 });
    expect(s.coins).toBe(1000);
    // Talking to somebody who sells nothing does not help either.
    talkTo(s, 'maren');
    s.apply({ t: 'shop', a: 'buy', i: 0, n: 1 });
    expect(s.coins).toBe(1000);
    s.closeMenu();
    // Walking away closes the talk, and with it the shop.
    talkTo(s, 'tobin');
    s.teleport(0, generator.hubY + 1, 60, 0, 0);
    run(s, 0.5);
    expect(s.screen).toBe('none');
    s.apply({ t: 'shop', a: 'buy', i: 0, n: 1 });
    expect(s.coins).toBe(1000);
  });

  it('takes coins and hands over the wares', () => {
    const s = make();
    s.clearInventory();
    s.addCoins(200);
    talkTo(s, 'tobin');
    const i = wareIndex(I.BREAD);
    const w = tobin.stock[i];
    events(s);
    s.apply({ t: 'shop', a: 'buy', i, n: 2 });
    expect(s.coins).toBe(200 - 2 * w.price);
    expect(s.inventory.countOf(I.BREAD)).toBe(2 * w.count);
    const ev = events(s);
    expect(ev).toContainEqual({ t: 'shop', what: 'buy' });
    expect(ev.some((e) => e.t === 'inv')).toBe(true);
  });

  it('sells each trade at its own keeper: armor from the armorer', () => {
    const s = make();
    s.clearInventory();
    s.addCoins(1000);
    const hilda = shopOf('hilda')!;
    const i = hilda.stock.findIndex((w) => w.id === armorId(0, 'iron'));
    talkTo(s, 'hilda');
    s.apply({ t: 'shop', a: 'buy', i, n: 1 });
    expect(s.inventory.countOf(armorId(0, 'iron'))).toBe(1);
    expect(s.coins).toBe(1000 - hilda.stock[i].price);
    // The same index at the general goods merchant is something else entirely.
    s.closeMenu();
    talkTo(s, 'tobin');
    const before = s.coins;
    s.apply({ t: 'shop', a: 'buy', i, n: 1 });
    expect(s.inventory.countOf(armorId(0, 'iron'))).toBe(1);
    expect(s.coins).toBe(before - (shopOf('tobin')!.stock[i]?.price ?? 0));
  });
  it('stops when the coins run out, taking nothing for what it cannot give', () => {
    const s = make();
    s.clearInventory();
    talkTo(s, 'tobin');
    const i = wareIndex(I.BREAD);
    const w = tobin.stock[i];
    s.addCoins(w.price * 2 + 1);
    s.apply({ t: 'shop', a: 'buy', i, n: 10 });
    expect(s.inventory.countOf(I.BREAD)).toBe(2 * w.count);
    expect(s.coins).toBe(1);
    events(s);
    s.apply({ t: 'shop', a: 'buy', i, n: 1 });
    expect(s.coins).toBe(1);
    expect(events(s)).toContainEqual({ t: 'toast', text: 'Not enough coins.' });
  });

  it('refuses a purchase that does not fit in the bags, and an index that is not on the table', () => {
    const s = make();
    s.clearInventory();
    for (let k = 0; k < s.inventory.size; k++) s.inventory.set(k, makeStack(B.DIRT, 64));
    s.addCoins(500);
    talkTo(s, 'tobin');
    events(s);
    s.apply({ t: 'shop', a: 'buy', i: wareIndex(I.BREAD), n: 1 });
    expect(s.coins).toBe(500);
    expect(events(s)).toContainEqual({ t: 'toast', text: 'Your bags are full.' });
    s.apply({ t: 'shop', a: 'buy', i: 200, n: 1 });
    s.apply({ t: 'shop', a: 'buy', i: -1, n: 1 });
    expect(s.coins).toBe(500);
  });

  it('pays for what is sold, one or many, and takes it from the bags', () => {
    const s = make();
    s.clearInventory();
    s.inventory.set(3, makeStack(I.IRON_INGOT, 10));
    talkTo(s, 'tobin');
    s.apply({ t: 'shop', a: 'sell', i: 3, n: 1 });
    expect(s.coins).toBe(sellPrice(I.IRON_INGOT));
    expect(s.inventory.get(3)!.count).toBe(9);
    s.apply({ t: 'shop', a: 'sell', i: 3, n: 64 });
    expect(s.inventory.get(3)).toBeNull();
    expect(s.coins).toBe(10 * sellPrice(I.IRON_INGOT));
  });

  it('will not buy what it has no use for, an enchanted or named item, or from an empty slot', () => {
    const s = make();
    s.clearInventory();
    s.inventory.set(0, makeStack(B.DIRT, 5));
    s.inventory.set(1, { ...makeStack(I.DIAMOND, 1), name: 'My gem' });
    s.inventory.set(2, { ...makeStack(I.DIAMOND, 1), ench: [{ id: 1, level: 1 }] as never });
    talkTo(s, 'tobin');
    for (const i of [0, 1, 2, 5, 99]) s.apply({ t: 'shop', a: 'sell', i, n: 1 });
    expect(s.coins).toBe(0);
    expect(s.inventory.get(0)!.count).toBe(5);
    expect(s.inventory.get(1)).not.toBeNull();
    expect(s.inventory.get(2)).not.toBeNull();
  });

  it('cannot be tricked into free coins with a bad count', () => {
    const s = make();
    s.clearInventory();
    s.inventory.set(0, makeStack(I.COAL, 4));
    talkTo(s, 'tobin');
    s.apply({ t: 'shop', a: 'sell', i: 0, n: 1000 });
    expect(s.coins).toBe(4 * sellPrice(I.COAL));
    expect(parseSessionMessage({ t: 'shop', a: 'sell', i: 0, n: 0 })).toBeNull();
    expect(parseSessionMessage({ t: 'shop', a: 'sell', i: 0, n: -3 })).toBeNull();
    expect(parseSessionMessage({ t: 'shop', a: 'sell', i: 0, n: 1.5 })).toBeNull();
    expect(parseSessionMessage({ t: 'shop', a: 'sell', i: 0, n: 65 })).toBeNull();
    expect(parseSessionMessage({ t: 'shop', a: 'rob', i: 0, n: 1 })).toBeNull();
    expect(parseSessionMessage({ t: 'shop', a: 'buy', i: '0', n: 1 })).toBeNull();
    expect(parseSessionMessage({ t: 'shop', a: 'buy', i: 3, n: 2 })).toEqual({ t: 'shop', a: 'buy', i: 3, n: 2 });
  });
});
