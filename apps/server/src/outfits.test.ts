import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import WebSocket from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { I, OUTFITS, STASH_SLOTS, base58Encode, lookCode, makeStack, mulberry32, outfitOfCode, outfitSetItemId, wornCode, type NetServerMessage } from '@solrift/shared';
import { SqliteRepo } from './db';
import { GameRoom } from './room';
import { MemoryRoomStore } from './roomStore';
import { createGameServer, type GameServer } from './server';
import { TokenService, tokenConfigFromEnv, type StashPort, type TokenConfig } from './token';
import { MockChain } from './tokenChain';

const ORIGIN = 'http://localhost:3000';
const MINT = base58Encode(new Uint8Array(32).fill(7));
const cfg = (over: Partial<TokenConfig> = {}): TokenConfig => ({ mint: MINT, cluster: 'devnet', rpcUrl: 'http://rpc.invalid', dailyPool: 10_000, walletDailyReward: 10_000, minWithdraw: 10, walletDailyWithdraw: 10_000, clearRewards: [20], slotPrices: [], bountyRewards: [3, 6, 12], keyPrice: 0, stashPrices: [], outfitPrices: [30, 60, 120], ...over });
const look = lookCode({ skin: 1, hair: 1, style: 1, eyes: 1, shirt: 1, pants: 1 });

/** A Stash that is a plain list of item ids with `size` slots (what the room does with real ones). */
function fakeStash(size: number, over: Partial<StashPort> = {}) {
  const held: number[] = [];
  const port: StashPort = {
    free: () => size - held.length,
    count: (_w, id) => held.filter((x) => x === id).length,
    give: (_w, id) => (held.length < size ? (held.push(id), true) : false),
    ...over,
  };
  return { held, port };
}

function world(over: Partial<TokenConfig> = {}, size = 10) {
  const repo = new SqliteRepo(':memory:');
  const svc = new TokenService(repo.tokens, cfg(over), new MockChain());
  const stash = fakeStash(size);
  svc.stash = stash.port;
  const fund = (wallet: string, n: number) => repo.tokens.insertTrade({ wallet, ref: `gift:${wallet}:${n}`, kind: 'trade', amount: n, note: 'Test funds', now: 1 });
  return { repo, svc, fund, stash };
}

describe('outfits: buying them (they are items, put in the Stash)', () => {
  it('are priced by tier, spend the tokens and put the set in the Stash', () => {
    const { svc, fund, stash } = world();
    fund('W1', 500);
    const view = svc.outfits('W1');
    expect(view).toHaveLength(OUTFITS.length);
    expect(view.find((o) => o.id === 'mossback')).toMatchObject({ price: 30, have: 0, tier: 'common', cls: 'warrior' });
    expect(view.find((o) => o.id === 'sunforged')!.price).toBe(60);
    expect(view.find((o) => o.id === 'voidwalker')!.price).toBe(120);
    expect(svc.buy('W1', 'hero-a', 'outfit:mossback')).toEqual({ sku: 'outfit:mossback', name: 'Outfit: Mossback', price: 30 });
    expect(svc.balance('W1')).toBe(470);
    expect(stash.held).toEqual([outfitSetItemId('mossback')]);
    expect(svc.outfits('W1').find((o) => o.id === 'mossback')).toMatchObject({ have: 1, price: 30 });
    expect(svc.me('W1').stashFree).toBe(9);
    expect(svc.economy().totals.spent.items).toEqual([{ label: 'Outfit: Mossback', amount: 30 }]);
  });

  it('may be bought again: each is one more item (they are things, not a permission)', () => {
    const { svc, fund, stash } = world();
    fund('W1', 500);
    svc.buy('W1', 'a', 'outfit:mossback');
    svc.buy('W1', 'a', 'outfit:mossback');
    svc.buy('W1', 'a', 'outfit:starweaver'); // (a Mage's: a wallet may buy any class's set)
    expect(stash.held).toEqual([outfitSetItemId('mossback'), outfitSetItemId('mossback'), outfitSetItemId('starweaver')]);
    expect(svc.balance('W1')).toBe(500 - 30 - 30 - 30);
    expect(svc.economy().totals.spent.items.find((i) => i.label === 'Outfit: Mossback')?.amount).toBe(60);
  });

  it('cannot be bought when the Stash has no free slot: nothing is spent', () => {
    const { svc, fund, stash } = world({}, 1);
    fund('W1', 500);
    svc.buy('W1', 'a', 'outfit:mossback');
    expect(() => svc.buy('W1', 'a', 'outfit:tidecaller')).toThrow(/Stash is full/);
    expect(svc.balance('W1')).toBe(470);
    expect(stash.held).toHaveLength(1);
    expect(svc.me('W1').stashFree).toBe(0);
  });

  it('give the tokens back if the Stash refuses after the spend (which the check before should make impossible)', () => {
    const { svc, fund, stash } = world();
    svc.stash = { ...stash.port, give: () => false };
    fund('W1', 100);
    expect(() => svc.buy('W1', 'a', 'outfit:mossback')).toThrow(/nothing was spent/);
    expect(svc.balance('W1')).toBe(100);
  });

  it('need a Stash to put them in', () => {
    const { svc, fund } = world();
    svc.stash = null;
    fund('W1', 100);
    expect(() => svc.buy('W1', 'a', 'outfit:mossback')).toThrow(/Stash cannot be reached/);
    expect(svc.balance('W1')).toBe(100);
    expect(svc.me('W1').stashFree).toBeNull();
  });

  it('refuse what is not an outfit, what cannot be paid, and are off with no prices', () => {
    const { svc, fund, stash } = world();
    fund('W1', 40);
    expect(() => svc.buy('W1', 'a', 'outfit:nope')).toThrow(/not for sale/);
    expect(() => svc.buy('W1', 'a', 'outfit:')).toThrow(/not for sale/);
    expect(() => svc.buy('W1', 'a', 'outfit:crimson-warden')).toThrow(/costs 60 \$SOLRIFT. You have 40/);
    expect(svc.balance('W1')).toBe(40);
    expect(stash.held).toHaveLength(0);
    const off = world({ outfitPrices: [] });
    expect(off.svc.outfits('W1')).toEqual([]);
    expect(() => off.svc.buy('W1', 'a', 'outfit:mossback')).toThrow(/not for sale/);
    expect(tokenConfigFromEnv({}).outfitPrices).toEqual([30, 60, 120]);
    expect(tokenConfigFromEnv({ TOKEN_OUTFIT_PRICES: '1,2,3' }).outfitPrices).toEqual([1, 2, 3]);
    expect(tokenConfigFromEnv({ TOKEN_OUTFIT_PRICES: 'off' }).outfitPrices).toEqual([]);
    expect(() => tokenConfigFromEnv({ TOKEN_OUTFIT_PRICES: '1,2' })).toThrow(/common, rare, epic/);
  });
});

const open = (store: MemoryRoomStore) => new GameRoom({ seed: 1, kind: 'adventure', naturalSpawning: false, rand: mulberry32(3), store });
const WALLET = 'wallet-one';

class Client {
  messages: NetServerMessage[] = [];
  id = 0;
  conn = { send: (m: NetServerMessage) => this.messages.push(m), close: () => {} };
  constructor(readonly room: GameRoom) {}
  join(name: string, account: string, cls: 'warrior' | 'mage' | 'ranger', wallet = WALLET): void {
    const id = this.room.join(this.conn, name, account, look, cls, wallet);
    if (id === null) throw new Error('join refused');
    this.id = id;
  }
  joinedLook(): number {
    return (this.messages.find((m) => m.t === 'joined') as { look: number }).look;
  }
  lastLook(of: number): number | null {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i];
      if (m.t === 'snap') {
        const p = m.players.find((x) => x.id === of);
        if (p) return p.look;
      }
    }
    return null;
  }
  toasts(): string[] {
    return this.messages.flatMap((m) => (m.t === 'events' ? m.events.flatMap((e) => (e.t === 'toast' ? [e.text] : [])) : []));
  }
}

const ticks = (room: GameRoom, n: number): void => {
  for (let i = 0; i < n; i++) room.tick();
};

describe('outfits: in the Stash of a wallet', () => {
  it('are put there for a wallet none of whose heroes is in the world, and written down at once', () => {
    const store = new MemoryRoomStore();
    const room = open(store);
    expect(room.stashFree(WALLET)).toBe(STASH_SLOTS);
    expect(room.stashGive(WALLET, outfitSetItemId('mossback'))).toBe(true);
    expect(room.stashCount(WALLET, outfitSetItemId('mossback'))).toBe(1);
    expect(room.stashFree(WALLET)).toBe(STASH_SLOTS - 1);
    expect((store.getJson(`stash:${WALLET}`) as unknown[])[0]).toEqual([outfitSetItemId('mossback'), 1, 0]);
    // A new server (a restart) reads the same Stash back from the store.
    const again = open(store);
    expect(again.stashCount(WALLET, outfitSetItemId('mossback'))).toBe(1);
    expect(again.stashGive(WALLET, outfitSetItemId('mossback'))).toBe(true);
    expect(again.stashFree(WALLET)).toBe(STASH_SLOTS - 2);
    expect(again.stashFree('another-wallet')).toBe(STASH_SLOTS); // (a Stash is the wallet's own)
  });

  it('are refused by a full Stash, and nothing is put in', () => {
    const store = new MemoryRoomStore();
    const room = open(store);
    const stash = room.realm.stashes.of(WALLET);
    for (let i = 0; i < stash.size; i++) stash.set(i, makeStack(I.DIAMOND, 1));
    expect(room.stashFree(WALLET)).toBe(0);
    expect(room.stashGive(WALLET, outfitSetItemId('mossback'))).toBe(false);
    expect(room.stashCount(WALLET, outfitSetItemId('mossback'))).toBe(0);
  });
});

describe('outfits: worn from the outfit slot', () => {
  it('are put on from the bags, show to everyone at once, and stay on when the hero comes back', () => {
    const store = new MemoryRoomStore();
    const room = open(store);
    const ann = new Client(room);
    ann.join('Ann', 'char-ann', 'mage');
    const bob = new Client(room);
    bob.join('Bob', 'char-bob', 'warrior', 'wallet-two');
    const p = room.player(ann.id)!;
    expect(outfitOfCode(ann.joinedLook())).toBeNull();

    const slot = outfitSetItemId('starweaver');
    p.giveItem(slot, 1);
    const at = p.inventory.slots.findIndex((s) => s?.id === slot);
    expect(p.equipOutfit(at)).toBe(true);
    expect(p.inventory.get(at)).toBeNull();
    expect(p.outfitSlot.get(0)?.id).toBe(slot);
    expect(p.wornOutfit).toBe('starweaver');
    ticks(room, 4);
    expect(outfitOfCode(bob.lastLook(ann.id))?.id).toBe('starweaver'); // (the one who looks at her sees it, with nothing else changed)
    expect(bob.lastLook(ann.id)).toBe(wornCode(look, 'starweaver'));

    // Another set takes its place and the first goes back where it came from.
    const other = outfitSetItemId('stormcaller');
    p.giveItem(other, 1);
    const at2 = p.inventory.slots.findIndex((s) => s?.id === other);
    p.equipOutfit(at2);
    expect(p.inventory.get(at2)?.id).toBe(slot);
    ticks(room, 4);
    expect(outfitOfCode(bob.lastLook(ann.id))?.id).toBe('stormcaller');

    // She leaves and comes back: the saved hero wears it, in the lobby and in the world.
    room.leave(ann.id);
    expect(room.wornOutfitOf('char-ann', 'mage')).toBe('stormcaller');
    expect(room.wornOutfitOf('char-ann', 'warrior')).toBeNull(); // (never a set of another class's)
    const back = new Client(room);
    back.join('Ann', 'char-ann', 'mage');
    expect(outfitOfCode(back.joinedLook())?.id).toBe('stormcaller');
    expect(back.joinedLook()).toBe(wornCode(look, 'stormcaller'));
  });

  it('are not worn by a hero of another class, and stay in the bags', () => {
    const room = open(new MemoryRoomStore());
    const c = new Client(room);
    c.join('Wen', 'char-wen', 'warrior');
    const p = room.player(c.id)!;
    const star = outfitSetItemId('starweaver'); // a Mage's
    p.giveItem(star, 1);
    const at = p.inventory.slots.findIndex((s) => s?.id === star);
    expect(p.equipOutfit(at)).toBe(true); // (it was a set, so the click is used up)
    expect(p.outfitSlot.get(0)).toBeNull();
    expect(p.inventory.get(at)?.id).toBe(star);
    ticks(room, 2);
    expect(c.toasts().some((t) => /set for the Mage/.test(t))).toBe(true);
    expect(p.wornOutfit).toBeNull();
  });

  it('are taken off by moving the set out of the slot, and a set put there by a hostile save is not worn', () => {
    const store = new MemoryRoomStore();
    const room = open(store);
    const c = new Client(room);
    c.join('Rae', 'char-rae', 'ranger');
    const p = room.player(c.id)!;
    p.outfitSlot.set(0, makeStack(outfitSetItemId('mossback'), 1)); // (a Warrior's set, somehow in a Ranger's slot)
    expect(p.wornOutfit).toBeNull();
    room.leave(c.id);
    expect(room.wornOutfitOf('char-rae', 'ranger')).toBeNull();
    const back = new Client(room);
    back.join('Rae', 'char-rae', 'ranger');
    expect(outfitOfCode(back.joinedLook())).toBeNull();
  });
});

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

describe('outfits through the real server', () => {
  let server: GameServer;
  let port: number;
  let repo: SqliteRepo;
  const base = () => `http://127.0.0.1:${port}`;

  beforeAll(async () => {
    server = createGameServer({ seed: 1, origins: [ORIGIN], rateLimitPerMinute: 1000, room: { kind: 'adventure', naturalSpawning: false }, token: (r) => ((repo = r as SqliteRepo), new TokenService(r.tokens, cfg(), new MockChain())) });
    port = await server.listen(0);
  });
  afterAll(() => server.close());

  const post = (url: string, body: unknown, cookie?: string) => fetch(base() + url, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  const get = (url: string, cookie: string) => fetch(base() + url, { headers: { cookie } });

  async function signIn(name: string, cls = 'warrior') {
    const w = newWallet();
    const ch = await (await post('/auth/challenge', { address: w.address })).json();
    const res = await post('/auth/verify', { message: ch.message, signature: w.sign(ch.message) });
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
    expect((await post('/auth/character', { displayName: name, class: cls, look }, cookie)).status).toBe(200);
    return { wallet: w.address, cookie };
  }

  async function enter(name: string, cookie: string) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { cookie, origin: ORIGIN } });
    const messages: NetServerMessage[] = [];
    ws.on('message', (d) => messages.push(JSON.parse(d.toString())));
    await new Promise((r) => ws.on('open', r));
    ws.send(JSON.stringify({ t: 'join', name }));
    await until('joined', () => messages.some((m) => m.t === 'joined'));
    const joined = messages.find((m) => m.t === 'joined') as { look: number };
    return { ws, joined, messages };
  }

  it('is bought on the website, lands in the Stash (shown to the website), and the old wear route is gone', async () => {
    const ann = await signIn('Ann');
    expect((await post('/token/buy', { sku: 'outfit:crimson-warden' }, ann.cookie)).status).toBe(400); // (no tokens yet)
    repo.tokens.insertTrade({ wallet: ann.wallet, ref: 'gift', kind: 'trade', amount: 200, note: 'Test funds', now: Date.now() });

    const bought = await (await post('/token/buy', { sku: 'outfit:crimson-warden' }, ann.cookie)).json();
    expect(bought).toMatchObject({ sku: 'outfit:crimson-warden', price: 60 });
    expect(bought.me.balance).toBe(140);
    expect(bought.me.outfits.find((o: { id: string }) => o.id === 'crimson-warden')).toMatchObject({ have: 1, cls: 'warrior' });
    expect(bought.me.stashFree).toBe(STASH_SLOTS - 1);
    expect((await get('/token/me', ann.cookie)).status).toBe(200);
    expect((await post('/token/outfit', { id: 'crimson-warden' }, ann.cookie)).status).toBe(404);

    // She enters the world in her own clothes: a set is worn only from the outfit slot.
    const inWorld = await enter('Ann', ann.cookie);
    expect(inWorld.joined.look).toBe(look);
    inWorld.ws.close();
  });

  it('is refused with a full Stash, and sells the same set to the same wallet again', async () => {
    const mia = await signIn('Mia', 'mage');
    repo.tokens.insertTrade({ wallet: mia.wallet, ref: 'gift', kind: 'trade', amount: 1000, note: 'Test funds', now: Date.now() });
    // Her Stash, as saved, has room for two more things.
    repo.room.setJson(`stash:${mia.wallet}`, [...new Array(STASH_SLOTS - 2).fill([I.DIAMOND, 1, 0]), null, null]);
    expect((await post('/token/buy', { sku: 'outfit:stormcaller' }, mia.cookie)).status).toBe(200);
    expect((await post('/token/buy', { sku: 'outfit:stormcaller' }, mia.cookie)).status).toBe(200); // (the same set again: one more item)
    const full = await post('/token/buy', { sku: 'outfit:stormcaller' }, mia.cookie);
    expect(full.status).toBe(409);
    expect((await full.json()).error).toMatch(/Stash is full/);
    const me = await (await get('/token/me', mia.cookie)).json();
    expect(me.stashFree).toBe(0);
    expect(me.balance).toBe(1000 - 60 * 2);
  });

  it('needs a signed-in wallet', async () => {
    expect((await post('/token/buy', { sku: 'outfit:mossback' })).status).toBe(401);
  });

  it('lets a guest not claim an outfit with a made-up look', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { origin: ORIGIN } });
    const messages: NetServerMessage[] = [];
    ws.on('message', (d) => messages.push(JSON.parse(d.toString())));
    await new Promise((r) => ws.on('open', r));
    ws.send(JSON.stringify({ t: 'join', name: 'Sneaky', look: wornCode(3, 'voidwalker') }));
    await until('joined', () => messages.some((m) => m.t === 'joined'));
    const joined = messages.find((m) => m.t === 'joined') as { look: number };
    expect(outfitOfCode(joined.look)).toBeNull();
    ws.close();
  });
});
