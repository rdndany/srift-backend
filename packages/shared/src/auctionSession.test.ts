import { describe, expect, it } from 'vitest';
import {
  ADVENTURE_SEED,
  AUCTIONEER,
  B,
  GameSession,
  HeadlessWorld,
  I,
  NPCS,
  makeGenerator,
  makeStack,
  mulberry32,
  type AdventureWorldGenerator,
  type AuctionView,
  type Command,
  type InputFrame,
  type SessionEvent,
} from './index';
import { startInVillage } from './villageStart.testutil';

const idle = (over: Partial<InputFrame> = {}): InputFrame => ({ t: 'frame', dt: 1 / 20, locked: true, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false, ...over });
const generator = makeGenerator(ADVENTURE_SEED, 'adventure') as AdventureWorldGenerator;

function make() {
  const world = new HeadlessWorld(generator);
  const s = new GameSession({ seed: ADVENTURE_SEED, world, generator, naturalSpawning: false, rand: mulberry32(3) });
  s.finishLoading();
  startInVillage(s, generator);
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

const lastView = (events: SessionEvent[]): AuctionView | null => {
  const e = events.filter((x): x is Extract<SessionEvent, { t: 'auction' }> => x.t === 'auction').pop();
  return e ? e.view : null;
};
const toasts = (events: SessionEvent[]): string[] => events.flatMap((e) => (e.t === 'toast' ? [e.text] : []));
const search = (over: Partial<Extract<Command, { a: 'search' }>> = {}): Command => ({ t: 'auction', a: 'search', q: '', cat: 'all', sort: 'ending', desc: false, page: 0, ...over });

describe('the Auctioneer of Dawnwatch', () => {
  it('stands in the market square, behind the counter of his house, on open ground', () => {
    const n = NPCS.find((x) => x.id === AUCTIONEER)!;
    expect(n).toBeDefined();
    expect(n.x).toBeGreaterThan(10);
    expect(n.x).toBeLessThan(31);
    expect(n.z).toBeGreaterThan(11);
    expect(n.z).toBeLessThan(19);
    const st = generator.npcStations().find((x) => x.npc.id === AUCTIONEER)!;
    const world = new HeadlessWorld(generator);
    expect(world.getBlock(Math.floor(st.x), st.y - 1, Math.floor(st.z))).not.toBe(B.AIR);
    expect(world.getBlock(Math.floor(st.x), st.y, Math.floor(st.z))).toBe(B.AIR);
    expect(world.getBlock(Math.floor(st.x), st.y + 1, Math.floor(st.z))).toBe(B.AIR);
  });

  it('opens his window with the house as soon as you speak to him, and the house has stock', () => {
    const s = make();
    run(s, 1.5);
    s.drainEvents();
    talkTo(s, AUCTIONEER);
    const view = lastView(s.drainEvents());
    expect(view).not.toBeNull();
    expect(view!.member).toBe(true);
    expect(view!.total).toBeGreaterThanOrEqual(16);
    expect(view!.rows.length).toBe(12);
  });

  it('ignores the house from anywhere but his counter', () => {
    const s = make();
    run(s, 1.5);
    s.drainEvents();
    s.apply(search());
    expect(lastView(s.drainEvents())).toBeNull();
    talkTo(s, 'tobin');
    s.drainEvents();
    s.apply(search());
    expect(lastView(s.drainEvents())).toBeNull();
  });

  it('puts an item up for a deposit, and it stays on the shelf in your name', () => {
    const s = make();
    run(s, 1.5);
    talkTo(s, AUCTIONEER);
    s.clearInventory();
    s.giveItem(I.IRON_INGOT, 20);
    s.coins = 100;
    s.drainEvents();
    s.apply({ t: 'auction', a: 'post', slot: 0, count: 8, bid: 200, buyout: 400, hours: 24 });
    const events = s.drainEvents();
    const view = lastView(events)!;
    expect(view.mine.length).toBe(1);
    expect(view.mine[0]).toMatchObject({ yours: true, bid: 200, buyout: 400 });
    expect(view.mine[0].item).toMatchObject({ id: I.IRON_INGOT, count: 8 });
    expect(s.inventory.countOf(I.IRON_INGOT)).toBe(12);
    // 8 ingots at 14 each, 15% for two periods of twelve hours
    expect(s.coins).toBe(100 - Math.ceil(8 * 14 * 0.15 * 2));
  });

  it('refuses a post that is not whole: no coins for the deposit, nothing in the slot, a bad price, what cannot be sold', () => {
    const s = make();
    run(s, 1.5);
    talkTo(s, AUCTIONEER);
    s.clearInventory();
    s.giveItem(I.IRON_INGOT, 4);
    s.giveItem(I.MAP, 1);
    s.coins = 0;
    const before = s.realm.auctions.size;
    s.apply({ t: 'auction', a: 'post', slot: 0, count: 4, bid: 10, buyout: 0, hours: 12 });
    expect(toasts(s.drainEvents()).join()).toContain('deposit');
    s.coins = 1000;
    s.apply({ t: 'auction', a: 'post', slot: 5, count: 1, bid: 10, buyout: 0, hours: 12 });
    s.apply({ t: 'auction', a: 'post', slot: 0, count: 1, bid: 50, buyout: 20, hours: 12 });
    s.apply({ t: 'auction', a: 'post', slot: 1, count: 1, bid: 5, buyout: 0, hours: 12 });
    s.apply({ t: 'auction', a: 'post', slot: 9999, count: 1, bid: 5, buyout: 0, hours: 12 });
    expect(s.realm.auctions.size).toBe(before);
    expect(s.inventory.countOf(I.IRON_INGOT)).toBe(4);
    expect(s.coins).toBe(1000);
  });

  it('sells a house item to you on a buyout, pays from your purse, and mails it; you take it and the bags get it', () => {
    const s = make();
    run(s, 1.5);
    talkTo(s, AUCTIONEER);
    s.clearInventory();
    s.coins = 100_000;
    const row = lastView(s.drainEvents())!.rows[0];
    s.apply({ t: 'auction', a: 'buyout', id: row.id });
    const after = lastView(s.drainEvents())!;
    expect(s.coins).toBe(100_000 - row.buyout);
    expect(after.mail.length).toBe(1);
    expect(after.mail[0].item).toMatchObject({ id: row.item.id, count: row.item.count });
    expect(s.inventory.countOf(row.item.id)).toBe(0);
    s.apply({ t: 'auction', a: 'take', id: 0 });
    const done = lastView(s.drainEvents())!;
    expect(done.mail).toEqual([]);
    expect(s.inventory.countOf(row.item.id)).toBe(row.item.count);
  });

  it('refuses a bid that is too low or too dear, and takes the coins of a good one', () => {
    const s = make();
    run(s, 1.5);
    talkTo(s, AUCTIONEER);
    s.coins = 50_000;
    const row = lastView(s.drainEvents())!.rows[0];
    s.apply({ t: 'auction', a: 'bid', id: row.id, amount: row.next - 1 });
    expect(s.coins).toBe(50_000);
    s.coins = row.next - 1;
    s.apply({ t: 'auction', a: 'bid', id: row.id, amount: row.next });
    expect(s.coins).toBe(row.next - 1);
    s.coins = 50_000;
    s.drainEvents();
    s.apply({ t: 'auction', a: 'bid', id: row.id, amount: row.next });
    const view = lastView(s.drainEvents())!;
    expect(s.coins).toBe(50_000 - row.next);
    expect(view.bids.map((r) => r.id)).toEqual([row.id]);
    expect(view.bids[0].leading).toBe(true);
  });

  it('keeps what you collect safe when the bags are full', () => {
    const s = make();
    run(s, 1.5);
    talkTo(s, AUCTIONEER);
    s.coins = 100_000;
    const row = lastView(s.drainEvents())!.rows[0];
    s.apply({ t: 'auction', a: 'buyout', id: row.id });
    for (let i = 0; i < s.inventory.size; i++) if (s.inventory.isUsable(i)) s.inventory.set(i, makeStack(I.BOW, 1));
    s.drainEvents();
    s.apply({ t: 'auction', a: 'take', id: 0 });
    const view = lastView(s.drainEvents())!;
    expect(view.mail.length).toBe(1);
  });

  it('turns a guest away from selling and bidding, but lets them look', () => {
    const world = new HeadlessWorld(generator);
    const s = new GameSession({ seed: ADVENTURE_SEED, world, generator, naturalSpawning: false, rand: mulberry32(3) });
    (s as unknown as { account: string | null }).account = null;
    s.finishLoading();
    startInVillage(s, generator);
    run(s, 1.5);
    talkTo(s, AUCTIONEER);
    const view = lastView(s.drainEvents())!;
    expect(view.member).toBe(false);
    s.coins = 10_000;
    s.apply({ t: 'auction', a: 'buyout', id: view.rows[0].id });
    expect(s.coins).toBe(10_000);
    expect(toasts(s.drainEvents()).join()).toContain('Sign in');
  });

  it('does not trade in creative mode', () => {
    const s = make();
    run(s, 1.5);
    talkTo(s, AUCTIONEER);
    s.mode = 'creative';
    s.coins = 10_000;
    const row = lastView(s.drainEvents())!.rows[0];
    s.apply({ t: 'auction', a: 'buyout', id: row.id });
    expect(s.coins).toBe(10_000);
  });

  it('closes the window when you walk away, and the house does not answer after that', () => {
    const s = make();
    run(s, 1.5);
    talkTo(s, AUCTIONEER);
    s.teleport(0, generator.hubY + 1, 0, 0, 0);
    run(s, 0.5);
    expect(s.screen).toBe('none');
    s.drainEvents();
    s.apply(search());
    expect(lastView(s.drainEvents())).toBeNull();
  });
});
