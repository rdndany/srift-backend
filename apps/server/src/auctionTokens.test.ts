import { describe, expect, it } from 'vitest';
import { ADVENTURE_SEED, AUCTIONEER, HOUSE_WALLET, I, NPCS, makeGenerator, parseNetClientMessage, type AdventureWorldGenerator, type AuctionView, type Command, type NetServerMessage } from '@solrift/shared';
import { SqliteRepo } from './db';
import { GameRoom } from './room';
import { TokenService, type TokenConfig } from './token';
import { MockChain } from './tokenChain';
import { base58Encode } from '@solrift/shared';

const generator = makeGenerator(ADVENTURE_SEED, 'adventure') as AdventureWorldGenerator;
const MINT = base58Encode(new Uint8Array(32).fill(7));
const cfg: TokenConfig = { mint: MINT, cluster: 'devnet', rpcUrl: 'http://rpc.invalid', dailyPool: 10_000, walletDailyReward: 10_000, minWithdraw: 10, walletDailyWithdraw: 10_000, clearRewards: [20, 10, 5, 3, 2], slotPrices: [100, 250], bountyRewards: [3, 6, 12], keyPrice: 15, stashPrices: [], outfitPrices: [] };
const KEY = `auction:${-ADVENTURE_SEED}`;

class Client {
  messages: NetServerMessage[] = [];
  id = 0;
  conn = { send: (m: NetServerMessage) => this.messages.push(m), close: () => {} };
  constructor(readonly room: GameRoom) {}
  join(name: string, account: string | null, wallet: string | null): this {
    this.id = this.room.join(this.conn, name, account, null, 'warrior', wallet)!;
    return this;
  }
  view(): AuctionView | null {
    const e = this.messages.flatMap((m) => (m.t === 'events' ? m.events : [])).filter((x) => x.t === 'auction').pop();
    return e && e.t === 'auction' ? e.view : null;
  }
  toasts(): string[] {
    return this.messages.flatMap((m) => (m.t === 'events' ? m.events.flatMap((e) => (e.t === 'toast' ? [e.text] : [])) : []));
  }
}

const ticks = (room: GameRoom, n: number): void => {
  for (let i = 0; i < n; i++) room.tick();
};

function visit(room: GameRoom, c: Client): void {
  const p = room.player(c.id)!;
  const n = NPCS.find((x) => x.id === AUCTIONEER)!;
  p.teleport(n.x, generator.hubY + 1, n.z + 2, 0, 0);
  ticks(room, 6);
  const mob = room.realm.mobs.mobs.find((m) => m.kind === 'npc' && NPCS[m.variant].id === AUCTIONEER)!;
  expect(p.talkNpc(mob)).toBe(true);
  ticks(room, 1);
}

function send(room: GameRoom, c: Client, cmd: Command): void {
  const msg = parseNetClientMessage({ t: 'cmd', c: cmd });
  expect(msg, JSON.stringify(cmd)).not.toBeNull();
  room.receive(c.id, msg!);
  ticks(room, 2);
}

function setup(over: Partial<ConstructorParameters<typeof GameRoom>[0]> = {}, commitFails: { on: boolean } = { on: false }) {
  const repo = new SqliteRepo(':memory:');
  const svc = new TokenService(repo.tokens, cfg, new MockChain());
  const tokens = {
    balance: (w: string) => svc.balance(w),
    commit: (scope: string, moves: Parameters<TokenService['commitTrades']>[1], save: () => void) => {
      if (commitFails.on) throw new Error('disk full');
      svc.commitTrades(scope, moves, save);
    },
  };
  const room = new GameRoom({ seed: 1, kind: 'adventure', naturalSpawning: false, store: repo.room, tokens, ...over });
  const fund = (wallet: string, n: number) => repo.tokens.insertTrade({ wallet, ref: `gift:${wallet}`, kind: 'trade', amount: n, note: 'Test funds', now: 1 });
  return { repo, svc, room, fund };
}

/** Ann offers two diamonds for $SOLRIFT: start 100, buyout 400. */
function offer(room: GameRoom, ann: Client): void {
  const p = room.player(ann.id)!;
  p.clearInventory();
  p.giveItem(I.DIAMOND, 3);
  p.coins = 500;
  visit(room, ann);
  send(room, ann, { t: 'auction', a: 'post', slot: 0, count: 2, bid: 100, buyout: 400, hours: 24, token: true });
}

describe('the Auction House in $SOLRIFT, on a server', () => {
  it('sells for tokens: the buyer pays, the seller is paid less the cut, the house keeps the cut, and the sale adds up to nothing', () => {
    const { repo, svc, room, fund } = setup();
    fund('W-bob', 1_000);
    const ann = new Client(room).join('ann', 'acc-ann', 'W-ann');
    const bob = new Client(room).join('bob', 'acc-bob', 'W-bob');
    offer(room, ann);
    expect(room.realm.auctions.size).toBe(1);
    // the deposit is Auren, taken from the purse
    expect(room.player(ann.id)!.coins).toBeLessThan(500);

    visit(room, bob);
    const coinsBefore = room.player(bob.id)!.coins;
    send(room, bob, { t: 'auction', a: 'search', q: 'diam', cat: 'all', sort: 'ending', desc: false, page: 0 });
    expect(bob.view()!.tokens).toEqual({ balance: 1_000 });
    const row = bob.view()!.rows[0];
    expect(row).toMatchObject({ token: true, buyout: 400 });
    send(room, bob, { t: 'auction', a: 'buyout', id: row.id });

    expect(room.realm.auctions.size).toBe(0);
    expect(room.player(bob.id)!.coins).toBe(coinsBefore); // no Auren spent
    expect(svc.balance('W-bob')).toBe(600);
    expect(svc.balance('W-ann')).toBe(380);
    expect(svc.balance(HOUSE_WALLET)).toBe(20);
    expect(svc.balance('W-bob') + svc.balance('W-ann') + svc.balance(HOUSE_WALLET)).toBe(1_000);
    // the cut counts as spent in the game (it stays in the treasury)
    expect(repo.tokens.total('fee')).toBe(20);
    expect(room.realm.auctions.moves).toEqual([]);
    expect(JSON.stringify(repo.room.getJson(KEY))).not.toContain('"moves":[{');
  }, 60000);

  it('returns an outbid wallet its tokens at once', () => {
    const { svc, room, fund } = setup();
    fund('W-bob', 1_000);
    fund('W-cat', 1_000);
    const ann = new Client(room).join('ann', 'acc-ann', 'W-ann');
    const bob = new Client(room).join('bob', 'acc-bob', 'W-bob');
    const cat = new Client(room).join('cat', 'acc-cat', 'W-cat');
    offer(room, ann);
    visit(room, bob);
    visit(room, cat);
    const id = room.realm.auctions.view({ q: '', cat: 'all', sort: 'ending', desc: false, page: 0 }, null).rows[0].id;
    send(room, bob, { t: 'auction', a: 'bid', id, amount: 100 });
    expect(svc.balance('W-bob')).toBe(900);
    send(room, cat, { t: 'auction', a: 'bid', id, amount: 105 });
    expect(svc.balance('W-bob')).toBe(1_000);
    expect(svc.balance('W-cat')).toBe(895);
    expect(bob.toasts().some((t) => t.includes('outbid'))).toBe(true);
  }, 60000);

  it('refuses a bid the balance cannot cover, however it is asked', () => {
    const { svc, room, fund } = setup();
    fund('W-bob', 50);
    const ann = new Client(room).join('ann', 'acc-ann', 'W-ann');
    const bob = new Client(room).join('bob', 'acc-bob', 'W-bob');
    offer(room, ann);
    visit(room, bob);
    const id = room.realm.auctions.view({ q: '', cat: 'all', sort: 'ending', desc: false, page: 0 }, null).rows[0].id;
    send(room, bob, { t: 'auction', a: 'bid', id, amount: 100 });
    expect(bob.toasts().some((t) => t.includes('Not enough $SOLRIFT'))).toBe(true);
    expect(svc.balance('W-bob')).toBe(50);
    expect(room.realm.auctions.get(id)!.bidder).toBeNull();
  }, 60000);

  it('is for honest play only: not a guest, not a cheats server, not creative mode', () => {
    for (const over of [{ cheats: true }, { mode: 'creative' as const }]) {
      const { room } = setup(over);
      const ann = new Client(room).join('ann', 'acc-ann', 'W-ann');
      offer(room, ann);
      expect(room.realm.auctions.size).toBe(0);
      expect(ann.toasts().some((t) => t.includes('cannot trade in $SOLRIFT') || t.includes('Nobody trades in creative'))).toBe(true);
      expect(ann.view()?.tokens ?? null).toBeNull();
    }
    // a guest has no wallet
    const { room, fund } = setup();
    fund('W-bob', 1_000);
    const ann = new Client(room).join('ann', 'acc-ann', 'W-ann');
    offer(room, ann);
    const guest = new Client(room).join('guest', null, null);
    visit(room, guest);
    const id = room.realm.auctions.view({ q: '', cat: 'all', sort: 'ending', desc: false, page: 0 }, null).rows[0].id;
    send(room, guest, { t: 'auction', a: 'bid', id, amount: 100 });
    expect(room.realm.auctions.get(id)!.bidder).toBeNull();
    expect(guest.view()?.tokens ?? null).toBeNull();
  }, 60000);

  it('trades in Auren only when the server has no token', () => {
    const repo = new SqliteRepo(':memory:');
    const room = new GameRoom({ seed: 1, kind: 'adventure', naturalSpawning: false, store: repo.room });
    const ann = new Client(room).join('ann', 'acc-ann', 'W-ann');
    offer(room, ann);
    expect(room.realm.auctions.size).toBe(0);
    expect(ann.view()?.tokens ?? null).toBeNull();
  }, 60000);

  it('keeps a move the ledger could not take, and writes it once when it can, never twice', () => {
    const fails = { on: false };
    const { svc, room, fund } = setup({}, fails);
    fund('W-bob', 1_000);
    const ann = new Client(room).join('ann', 'acc-ann', 'W-ann');
    const bob = new Client(room).join('bob', 'acc-bob', 'W-bob');
    offer(room, ann);
    visit(room, bob);
    const id = room.realm.auctions.view({ q: '', cat: 'all', sort: 'ending', desc: false, page: 0 }, null).rows[0].id;

    fails.on = true;
    send(room, bob, { t: 'auction', a: 'bid', id, amount: 100 });
    // the bid stands, and the tokens are held back from what bob can spend although the ledger has not been told
    expect(room.realm.auctions.get(id)!.bidder).toBe('acc-bob');
    expect(svc.balance('W-bob')).toBe(1_000);
    expect(room.realm.auctions.pendingTokens('W-bob')).toBe(-100);
    send(room, bob, { t: 'auction', a: 'search', q: '', cat: 'all', sort: 'ending', desc: false, page: 0 });
    expect(bob.view()!.tokens).toEqual({ balance: 900 });

    fails.on = false;
    ticks(room, 2);
    expect(svc.balance('W-bob')).toBe(900);
    expect(room.realm.auctions.moves).toEqual([]);
    ticks(room, 5);
    expect(svc.balance('W-bob')).toBe(900);
  }, 60000);

  it('forgives a replay: moves sent again after a restart change nothing', () => {
    const { repo, svc, room, fund } = setup();
    fund('W-bob', 1_000);
    const ann = new Client(room).join('ann', 'acc-ann', 'W-ann');
    const bob = new Client(room).join('bob', 'acc-bob', 'W-bob');
    offer(room, ann);
    visit(room, bob);
    const id = room.realm.auctions.view({ q: '', cat: 'all', sort: 'ending', desc: false, page: 0 }, null).rows[0].id;
    send(room, bob, { t: 'auction', a: 'bid', id, amount: 100 });
    expect(svc.balance('W-bob')).toBe(900);
    // the same move, written again (as a crash between the ledger and the house would make happen)
    const move = { id: 999, wallet: 'W-bob', amount: -100, kind: 'trade' as const, note: 'Bid' };
    svc.commitTrades('x', [move], () => {});
    svc.commitTrades('x', [move], () => {});
    expect(svc.balance('W-bob')).toBe(800);
    expect(repo.tokens.insertTrade({ wallet: 'W-bob', ref: 'x:999', kind: 'trade', amount: -100, note: 'Bid', now: 2 })).toBe(false);
  }, 60000);

  it('writes the ledger and the house together or neither', () => {
    const { repo, svc } = setup();
    repo.tokens.insertTrade({ wallet: 'W-bob', ref: 'gift', kind: 'trade', amount: 100, note: 'Test funds', now: 1 });
    expect(() =>
      svc.commitTrades('x', [{ id: 1, wallet: 'W-bob', amount: -40, kind: 'trade', note: 'Bid' }], () => {
        throw new Error('house not saved');
      }),
    ).toThrow('house not saved');
    expect(svc.balance('W-bob')).toBe(100);
  });
});
