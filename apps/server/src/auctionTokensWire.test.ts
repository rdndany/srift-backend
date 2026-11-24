import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import WebSocket from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADVENTURE_SEED, AUCTIONEER, HOUSE_WALLET, I, NPCS, base58Encode, lookCode, makeGenerator, type AdventureWorldGenerator, type AuctionView, type NetServerMessage } from '@solrift/shared';
import type { SqliteRepo } from './db';
import { createGameServer, type GameServer } from './server';
import { TokenService, type TokenConfig } from './token';
import { MockChain } from './tokenChain';

// The Auction House in $SOLRIFT through the real server: sign-in, the socket, the wiring of the token service into the room.

const ORIGIN = 'http://localhost:3000';
const generator = makeGenerator(ADVENTURE_SEED, 'adventure') as AdventureWorldGenerator;
const cfg: TokenConfig = { mint: base58Encode(new Uint8Array(32).fill(7)), cluster: 'devnet', rpcUrl: 'http://rpc.invalid', dailyPool: 10_000, walletDailyReward: 10_000, minWithdraw: 10, walletDailyWithdraw: 10_000, clearRewards: [20], slotPrices: [100], bountyRewards: [3, 6, 12], keyPrice: 15, stashPrices: [], outfitPrices: [] };
const look = lookCode({ skin: 1, hair: 1, style: 1, eyes: 1, shirt: 1, pants: 1 });

function newWallet() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = (publicKey as KeyObject).export({ format: 'der', type: 'spki' }).subarray(-32);
  return { address: base58Encode(new Uint8Array(raw)), sign: (m: string) => sign(null, Buffer.from(m, 'utf8'), privateKey).toString('base64') };
}

const until = async (what: string, ok: () => boolean, ms = 4000): Promise<void> => {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe('the Auction House in $SOLRIFT, through the real server', () => {
  let server: GameServer;
  let port: number;
  let repo: SqliteRepo;
  const base = () => `http://127.0.0.1:${port}`;

  beforeAll(async () => {
    server = createGameServer({ seed: 1, origins: [ORIGIN], rateLimitPerMinute: 1000, room: { kind: 'adventure', naturalSpawning: false }, token: (r) => ((repo = r as SqliteRepo), new TokenService(r.tokens, cfg, new MockChain())) });
    port = await server.listen(0);
  });
  afterAll(() => server.close());

  const post = (url: string, body: unknown, cookie?: string) => fetch(base() + url, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });

  /** A signed-in player on a socket, in the game. */
  async function player(name: string) {
    const w = newWallet();
    const ch = await (await post('/auth/challenge', { address: w.address })).json();
    const res = await post('/auth/verify', { message: ch.message, signature: w.sign(ch.message) });
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
    expect((await post('/auth/character', { displayName: name, class: 'warrior', look }, cookie)).status).toBe(200);
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { cookie, origin: ORIGIN } });
    const messages: NetServerMessage[] = [];
    ws.on('message', (d) => messages.push(JSON.parse(d.toString())));
    await new Promise((r) => ws.on('open', r));
    ws.send(JSON.stringify({ t: 'join', name }));
    await until('joined', () => messages.some((m) => m.t === 'joined'));
    const id = (messages.find((m) => m.t === 'joined') as { id: number }).id;
    const p = server.room.player(id)!;
    return {
      wallet: w.address,
      id,
      p,
      ws,
      cmd: (c: object) => ws.send(JSON.stringify({ t: 'cmd', c })),
      view: (): AuctionView | null => {
        const e = messages.flatMap((m) => (m.t === 'events' ? m.events : [])).filter((x) => x.t === 'auction').pop();
        return e && e.t === 'auction' ? e.view : null;
      },
    };
  }

  function visit(p: { teleport: (x: number, y: number, z: number, a: number, b: number) => void; talkNpc: (m: never) => boolean }): void {
    const n = NPCS.find((x) => x.id === AUCTIONEER)!;
    p.teleport(n.x, generator.hubY + 1, n.z + 2, 0, 0);
    for (let i = 0; i < 400 && (i < 6 || !server.room.realm.mobs.mobs.some((m) => m.kind === 'npc' && NPCS[m.variant].id === AUCTIONEER)); i++) server.room.tick();
    const mob = server.room.realm.mobs.mobs.find((m) => m.kind === 'npc' && NPCS[m.variant].id === AUCTIONEER)!;
    expect(p.talkNpc(mob as never)).toBe(true);
  }

  it('sells for tokens between two signed-in wallets over the socket, and the ledger shows it', async () => {
    const ann = await player('Ann');
    const bob = await player('Bob');
    expect(ann.wallet).not.toBe(bob.wallet);
    // bob is given 1,000 $SOLRIFT (a ledger row of his own: nothing is paid from the pool)
    repo.tokens.insertTrade({ wallet: bob.wallet, ref: 'gift', kind: 'trade', amount: 1_000, note: 'Test funds', now: Date.now() });
    expect(server.token.balance(bob.wallet)).toBe(1_000);

    ann.p.clearInventory();
    ann.p.giveItem(I.DIAMOND, 3);
    ann.p.coins = 500;
    visit(ann.p);
    ann.cmd({ t: 'auction', a: 'post', slot: 0, count: 2, bid: 100, buyout: 400, hours: 24, token: true });
    await until('the auction to be up', () => server.room.realm.auctions.size === 1);
    expect(server.room.realm.auctions.get(server.room.realm.auctions.view({ q: '', cat: 'all', sort: 'ending', desc: false, page: 0 }, null).rows[0].id)).toMatchObject({ token: true, sellerWallet: ann.wallet });

    // bob sees it on the website's list as a $SOLRIFT price, and his window knows his balance
    const market = await (await fetch(`${base()}/market?q=diam`)).json();
    expect(market.view.rows[0]).toMatchObject({ token: true, buyout: 400 });
    visit(bob.p);
    bob.cmd({ t: 'auction', a: 'search', q: 'diam', cat: 'all', sort: 'ending', desc: false, page: 0 });
    await until('bob to see the auction', () => (bob.view()?.rows.length ?? 0) === 1);
    expect(bob.view()!.tokens).toEqual({ balance: 1_000 });

    bob.cmd({ t: 'auction', a: 'buyout', id: bob.view()!.rows[0].id });
    await until('the sale', () => server.room.realm.auctions.size === 0);
    await until('the ledger', () => server.token.balance(ann.wallet) === 380);
    expect(server.token.balance(bob.wallet)).toBe(600);
    expect(server.token.balance(HOUSE_WALLET)).toBe(20);
    expect((await server.token.info()).pool.spentTotal).toBe(20);
    expect(server.room.realm.auctions.moves).toEqual([]);

    // ann reads it in her history on the token page
    const hist = server.token.me(ann.wallet).history;
    expect(hist.find((h) => h.kind === 'trade')).toMatchObject({ amount: 380, label: expect.stringContaining('Sold') });
    ann.ws.close();
    bob.ws.close();
  }, 30000);
});
