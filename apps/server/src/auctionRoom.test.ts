import { describe, expect, it } from 'vitest';
import { ADVENTURE_SEED, AUCTIONEER, I, NPCS, makeGenerator, makeStack, mulberry32, parseNetClientMessage, type AdventureWorldGenerator, type AuctionView, type Command, type NetServerMessage } from '@solrift/shared';
import { GameRoom } from './room';
import { MemoryRoomStore } from './roomStore';

const generator = makeGenerator(ADVENTURE_SEED, 'adventure') as AdventureWorldGenerator;

class Client {
  messages: NetServerMessage[] = [];
  id = 0;
  conn = { send: (m: NetServerMessage) => this.messages.push(m), close: () => {} };
  constructor(readonly room: GameRoom) {}
  join(name: string, account: string | null): void {
    const id = this.room.join(this.conn, name, account);
    if (id === null) throw new Error('join refused');
    this.id = id;
  }
  events() {
    return this.messages.flatMap((m) => (m.t === 'events' ? m.events : []));
  }
  /** The window as the last event showed it. */
  view(): AuctionView | null {
    const e = this.events().filter((x) => x.t === 'auction').pop();
    return e && e.t === 'auction' ? e.view : null;
  }
  toasts(): string[] {
    return this.events().flatMap((e) => (e.t === 'toast' ? [e.text] : []));
  }
}

const ticks = (room: GameRoom, n: number): void => {
  for (let i = 0; i < n; i++) room.tick();
};

/** Stand at the Auctioneer's counter and speak to him. */
function visit(room: GameRoom, c: Client): void {
  const p = room.player(c.id)!;
  const n = NPCS.find((x) => x.id === AUCTIONEER)!;
  p.teleport(n.x, generator.hubY + 1, n.z + 2, 0, 0);
  ticks(room, 6);
  const mob = room.realm.mobs.mobs.find((m) => m.kind === 'npc' && NPCS[m.variant].id === AUCTIONEER)!;
  expect(p.talkNpc(mob)).toBe(true);
  ticks(room, 1);
}

/** Send a command the way a client does: as a message, through the same check. */
function send(room: GameRoom, c: Client, cmd: Command): void {
  const msg = parseNetClientMessage({ t: 'cmd', c: cmd });
  expect(msg, JSON.stringify(cmd)).not.toBeNull();
  room.receive(c.id, msg!);
  ticks(room, 2);
}

const open = (store: MemoryRoomStore) => new GameRoom({ seed: 1, kind: 'adventure', naturalSpawning: false, rand: mulberry32(3), store });
const KEY = `auction:${-ADVENTURE_SEED}`;

describe('the Auction House on a server', () => {
  it('has only what players put up: the house puts up nothing of its own', () => {
    const room = open(new MemoryRoomStore());
    const c = new Client(room);
    c.join('ann', 'acc-ann');
    visit(room, c);
    ticks(room, 40);
    expect(room.realm.auctions.size).toBe(0);
    expect(c.view()).toMatchObject({ total: 0, member: true });
  });

  it('lets one player sell to another across the network, pays everybody once, and writes it all down', () => {
    const store = new MemoryRoomStore();
    const room = open(store);
    const ann = new Client(room);
    const bob = new Client(room);
    ann.join('ann', 'acc-ann');
    bob.join('bob', 'acc-bob');
    const pa = room.player(ann.id)!;
    const pb = room.player(bob.id)!;
    pa.clearInventory();
    pa.giveItem(I.DIAMOND, 3);
    pa.coins = 200;
    pb.coins = 5000;
    visit(room, ann);
    visit(room, bob);

    send(room, ann, { t: 'auction', a: 'post', slot: 0, count: 2, bid: 300, buyout: 1000, hours: 24 });
    expect(room.realm.auctions.size).toBe(1);
    expect(pa.inventory.countOf(I.DIAMOND)).toBe(1);
    const deposit = 200 - pa.coins;
    expect(deposit).toBe(Math.ceil(240 * 0.15 * 2));
    // what each of them carries was written down at once, before the next autosave, and so was the house
    expect((store.getJson('player:acc-ann') as { coins?: number }).coins).toBe(pa.coins);
    expect(JSON.stringify(store.getJson(KEY))).toContain('acc-ann');

    // bob finds it (his window is for his own search) and buys it out
    send(room, bob, { t: 'auction', a: 'search', q: 'diam', cat: 'all', sort: 'ending', desc: false, page: 0 });
    const row = bob.view()!.rows[0];
    expect(row).toMatchObject({ seller: 'ann', yours: false, buyout: 1000 });
    send(room, bob, { t: 'auction', a: 'buyout', id: row.id });
    expect(pb.coins).toBe(4000);
    expect(room.realm.auctions.size).toBe(0);
    expect(ann.toasts().some((t) => t.includes('sold'))).toBe(true);
    expect(bob.toasts().some((t) => t.includes('won'))).toBe(true);

    // each collects from the mail: ann the price less the house's 5% and her deposit back, bob the diamonds
    send(room, bob, { t: 'auction', a: 'take', id: 0 });
    expect(pb.inventory.countOf(I.DIAMOND)).toBe(2);
    const before = pa.coins;
    send(room, ann, { t: 'auction', a: 'take', id: 0 });
    expect(pa.coins).toBe(before + 1000 - 50 + deposit);
    // and the same letter is not paid twice
    send(room, ann, { t: 'auction', a: 'take', id: 0 });
    expect(pa.coins).toBe(before + 1000 - 50 + deposit);
    expect(ann.view()!.mail).toEqual([]);
  }, 60000);

  it('keeps the house, its mail and the sellers across a restart', () => {
    const store = new MemoryRoomStore();
    const room = open(store);
    const ann = new Client(room);
    ann.join('ann', 'acc-ann');
    const pa = room.player(ann.id)!;
    pa.clearInventory();
    pa.giveItem(I.GOLD_INGOT, 5);
    pa.coins = 500;
    visit(room, ann);
    send(room, ann, { t: 'auction', a: 'post', slot: 0, count: 5, bid: 100, buyout: 0, hours: 12 });
    expect(room.realm.auctions.size).toBe(1);
    // a bid, then the time runs out while the server is down
    const bob = new Client(room);
    bob.join('bob', 'acc-bob');
    room.player(bob.id)!.coins = 900;
    visit(room, bob);
    send(room, bob, { t: 'auction', a: 'bid', id: room.realm.auctions.view({ q: '', cat: 'all', sort: 'ending', desc: false, page: 0 }, null).rows[0].id, amount: 100 });
    room.save();
    room.stop();

    const again = open(store);
    expect(again.realm.auctions.size).toBe(1);
    expect(again.realm.auctions.view({ q: '', cat: 'all', sort: 'ending', desc: false, page: 0 }, 'acc-bob').bids.length).toBe(1);
    // (the clock of the house is real time: run it out and see both parties paid)
    const auction = again.realm.auctions.view({ q: '', cat: 'all', sort: 'ending', desc: false, page: 0 }, null).rows[0];
    (again.realm.auctions.get(auction.id) as { end: number }).end = 0;
    again.realm.auctions.update();
    expect(again.realm.auctions.mailOf('acc-ann').map((m) => m.kind)).toEqual(['sold']);
    expect(again.realm.auctions.mailOf('acc-bob').map((m) => m.kind)).toEqual(['won']);
  }, 60000);

  it('turns a guest away: they may look, not buy', () => {
    const store = new MemoryRoomStore();
    const room = open(store);
    const ann = new Client(room);
    ann.join('ann', 'acc-ann');
    const pa = room.player(ann.id)!;
    pa.clearInventory();
    pa.giveItem(I.COAL, 4);
    pa.coins = 100;
    visit(room, ann);
    send(room, ann, { t: 'auction', a: 'post', slot: 0, count: 4, bid: 10, buyout: 20, hours: 12 });
    const guest = new Client(room);
    guest.join('visitor', null);
    const pg = room.player(guest.id)!;
    pg.coins = 1000;
    visit(room, guest);
    const view = guest.view()!;
    expect(view).toMatchObject({ member: false, total: 1 });
    send(room, guest, { t: 'auction', a: 'buyout', id: view.rows[0].id });
    expect(room.realm.auctions.size).toBe(1);
    expect(pg.coins).toBe(1000);
    // and nobody can reach the Auctioneer's business from afar
    ann.messages = [];
    pa.teleport(0, generator.hubY + 1, 0, 0, 0);
    ticks(room, 4);
    send(room, ann, { t: 'auction', a: 'cancel', id: view.rows[0].id });
    expect(room.realm.auctions.size).toBe(1);
  }, 60000);

  it('is not fooled by a post of what you do not hold', () => {
    const room = open(new MemoryRoomStore());
    const ann = new Client(room);
    ann.join('ann', 'acc-ann');
    const pa = room.player(ann.id)!;
    pa.clearInventory();
    pa.coins = 500;
    visit(room, ann);
    send(room, ann, { t: 'auction', a: 'post', slot: 0, count: 64, bid: 10, buyout: 0, hours: 12 });
    expect(room.realm.auctions.size).toBe(0);
    pa.inventory.set(0, makeStack(I.COAL, 3));
    send(room, ann, { t: 'auction', a: 'post', slot: 0, count: 64, bid: 10, buyout: 0, hours: 12 });
    // it puts up what there is, no more
    expect(room.realm.auctions.view({ q: '', cat: 'all', sort: 'ending', desc: false, page: 0 }, null).rows[0].item.count).toBe(3);
    expect(pa.inventory.countOf(I.COAL)).toBe(0);
  }, 60000);
});
