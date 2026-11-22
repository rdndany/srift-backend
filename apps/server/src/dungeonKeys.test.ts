import { describe, expect, it } from 'vitest';
import { DUNGEON_MIN_LEVEL, I, base58Encode, makeStack, totalForLevel, type NetServerMessage } from '@solrift/shared';
import { SqliteRepo } from './db';
import { GameRoom } from './room';
import { MemoryRoomStore } from './roomStore';
import { KEY_MAX, TokenService, tokenConfigFromEnv, type TokenConfig } from './token';
import { MockChain } from './tokenChain';
import { PERK_HOLLOW_KEY } from './tokenRepo';

const MINT = base58Encode(new Uint8Array(32).fill(7));
const cfg = (over: Partial<TokenConfig> = {}): TokenConfig => ({ mint: MINT, cluster: 'devnet', rpcUrl: 'http://rpc.invalid', dailyPool: 10_000, walletDailyReward: 10_000, minWithdraw: 10, walletDailyWithdraw: 10_000, clearRewards: [20], slotPrices: [100], bountyRewards: [3, 6, 12], keyPrice: 15, stashPrices: [], outfitPrices: [], ...over });

function world(over: Partial<TokenConfig> = {}, roomOver: Partial<ConstructorParameters<typeof GameRoom>[0]> = {}) {
  const repo = new SqliteRepo(':memory:');
  const svc = new TokenService(repo.tokens, cfg(over), new MockChain());
  const room = new GameRoom({ seed: 1, kind: 'adventure', naturalSpawning: false, store: new MemoryRoomStore(), keys: { count: (w) => svc.keyCount(w), take: (w) => svc.takeKey(w) }, ...roomOver });
  const fund = (wallet: string, n: number) => repo.tokens.insertTrade({ wallet, ref: `gift:${wallet}:${n}`, kind: 'trade', amount: n, note: 'Test funds', now: 1 });
  return { repo, svc, room, fund };
}

class Client {
  messages: NetServerMessage[] = [];
  id = 0;
  conn = { send: (m: NetServerMessage) => this.messages.push(m), close: () => {} };
  join(room: GameRoom, name: string, account: string | null, wallet: string | null) {
    this.id = room.join(this.conn, name, account, null, 'warrior', wallet)!;
    const p = room.player(this.id)!;
    p.xp.add(totalForLevel(DUNGEON_MIN_LEVEL));
    p.clearInventory();
    return this;
  }
  toasts() {
    return this.messages.flatMap((m) => (m.t === 'events' ? m.events.flatMap((e) => (e.t === 'toast' ? [e.text] : [])) : []));
  }
}

/** Walk into the portal (flushing what the player was told). */
const knock = (room: GameRoom, c: Client): void => {
  const p = room.player(c.id)!;
  p.portalCooldown = 0;
  room.realm.usePortal(p);
  room.tick();
};
const inside = (room: GameRoom, c: Client) => room.realm.copyAt(room.player(c.id)!) >= 0;
const sigils = (room: GameRoom, c: Client) => room.player(c.id)!.inventory.countOf(I.HOLLOW_SIGIL);

describe('Hollow Keys: buying and using them', () => {
  it('are bought one at a time at the price, up to the most a wallet may hold', () => {
    const { svc, fund } = world();
    fund('W1', 1_000);
    expect(svc.shop('W1').find((i) => i.sku === PERK_HOLLOW_KEY)).toMatchObject({ name: 'Hollow Key', owned: 0, max: KEY_MAX, price: 15, consumable: true });
    for (let i = 0; i < KEY_MAX; i++) expect(svc.buy('W1', 'c', PERK_HOLLOW_KEY)).toMatchObject({ price: 15 });
    expect(svc.keyCount('W1')).toBe(KEY_MAX);
    expect(svc.balance('W1')).toBe(1_000 - 15 * KEY_MAX);
    expect(() => svc.buy('W1', 'c', PERK_HOLLOW_KEY)).toThrow(/most you can keep/);
    expect(svc.shop('W1').find((i) => i.sku === PERK_HOLLOW_KEY)!.price).toBeNull();
  });

  it('keep buying after they are used: each purchase is its own ledger row', () => {
    const { svc, repo, fund } = world();
    fund('W1', 100);
    svc.buy('W1', 'c', PERK_HOLLOW_KEY);
    svc.buy('W1', 'c', PERK_HOLLOW_KEY);
    expect(svc.takeKey('W1')).toBe(1);
    expect(svc.takeKey('W1')).toBe(0);
    expect(svc.takeKey('W1')).toBe(-1);
    svc.buy('W1', 'c', PERK_HOLLOW_KEY); // (the count is back at 0: a count-numbered ref would collide with the first)
    svc.buy('W1', 'c', PERK_HOLLOW_KEY);
    expect(svc.keyCount('W1')).toBe(2);
    expect(svc.balance('W1')).toBe(100 - 4 * 15);
    expect(repo.tokens.history('W1', 10).filter((h) => h.kind === 'spend').map((h) => h.ref).sort()).toEqual(['hollow-key:0', 'hollow-key:1', 'hollow-key:2', 'hollow-key:3']);
  });

  it('say plainly when the balance is short, and are not for sale when the price is 0', () => {
    const { svc, fund } = world();
    fund('W1', 10);
    expect(() => svc.buy('W1', 'c', PERK_HOLLOW_KEY)).toThrow(/costs 15 \$SOLRIFT. You have 10/);
    expect(world({ keyPrice: 0 }).svc.shop('W1').some((i) => i.sku === PERK_HOLLOW_KEY)).toBe(false);
    expect(() => world({ keyPrice: 0 }).svc.buy('W1', 'c', PERK_HOLLOW_KEY)).toThrow(/not for sale/);
    expect(tokenConfigFromEnv({}).keyPrice).toBe(15);
    expect(tokenConfigFromEnv({ TOKEN_KEY_PRICE: '40' }).keyPrice).toBe(40);
    expect(() => tokenConfigFromEnv({ TOKEN_KEY_PRICE: '-1' })).toThrow(/TOKEN_KEY_PRICE/);
  });

  it('count as spent in the economy, by name', () => {
    const { svc, fund } = world();
    fund('W1', 100);
    svc.buy('W1', 'c', PERK_HOLLOW_KEY);
    expect(svc.economy().totals.spent.items).toEqual([{ label: 'Hollow Key', amount: 15 }]);
  });
});

describe('Hollow Keys at the portal', () => {
  it('turn away a player with neither sigil nor key, and say where to buy one', () => {
    const { room } = world();
    const c = new Client().join(room, 'ann', 'char-ann', 'W1');
    knock(room, c);
    expect(inside(room, c)).toBe(false);
    expect(c.toasts().some((t) => t.includes('Hollow Key') && t.includes('token page'))).toBe(true);
  });

  it('let a player in with a key, and use it up', () => {
    const { room, svc, fund } = world();
    fund('W1', 100);
    svc.buy('W1', 'char-ann', PERK_HOLLOW_KEY);
    const c = new Client().join(room, 'ann', 'char-ann', 'W1');
    knock(room, c);
    expect(inside(room, c)).toBe(true);
    expect(svc.keyCount('W1')).toBe(0);
    expect(c.toasts().some((t) => t.includes('Hollow Key opens the way (0 left)'))).toBe(true);
  });

  it('use the sigil first, and keep the key', () => {
    const { room, svc, fund } = world();
    fund('W1', 100);
    svc.buy('W1', 'char-ann', PERK_HOLLOW_KEY);
    const c = new Client().join(room, 'ann', 'char-ann', 'W1');
    room.player(c.id)!.inventory.collect(makeStack(I.HOLLOW_SIGIL, 1));
    knock(room, c);
    expect(inside(room, c)).toBe(true);
    expect(sigils(room, c)).toBe(0);
    expect(svc.keyCount('W1')).toBe(1);
  });

  it('are not used again to come back to a copy that is still open', () => {
    const { room, svc, fund } = world();
    fund('W1', 100);
    svc.buy('W1', 'char-ann', PERK_HOLLOW_KEY);
    svc.buy('W1', 'char-ann', PERK_HOLLOW_KEY);
    const c = new Client().join(room, 'ann', 'char-ann', 'W1');
    knock(room, c); // in
    expect(svc.keyCount('W1')).toBe(1);
    knock(room, c); // out, through the portal inside
    expect(inside(room, c)).toBe(false);
    knock(room, c); // in again: the same copy
    expect(inside(room, c)).toBe(true);
    expect(svc.keyCount('W1')).toBe(1);
  });

  it('let a whole party in on the one key of whoever opens the copy', () => {
    const { room, svc, fund } = world();
    fund('W1', 100);
    svc.buy('W1', 'char-a', PERK_HOLLOW_KEY);
    const a = new Client().join(room, 'ann', 'char-a', 'W1');
    const b = new Client().join(room, 'bob', 'char-b', 'W2'); // no key at all
    const pa = room.player(a.id)!;
    const pb = room.player(b.id)!;
    room.realm.parties.run(pa, 'invite', 'bob');
    room.realm.parties.run(pb, 'accept');
    knock(room, b); // bob alone: the party's copy is not open yet, and he has nothing to open it with
    expect(inside(room, b)).toBe(false);
    knock(room, a);
    expect(inside(room, a)).toBe(true);
    knock(room, b);
    expect(inside(room, b)).toBe(true);
    expect(svc.keyCount('W1')).toBe(0);
  });

  it('are for honest play only: not a guest, not a cheats server, not creative mode', () => {
    const guest = world();
    guest.fund('W1', 100);
    guest.svc.buy('W1', 'c', PERK_HOLLOW_KEY);
    const g = new Client().join(guest.room, 'guest', null, null);
    knock(guest.room, g);
    expect(inside(guest.room, g)).toBe(false);

    const cheats = world({}, { cheats: true });
    cheats.fund('W2', 100);
    cheats.svc.buy('W2', 'c', PERK_HOLLOW_KEY);
    const k = new Client().join(cheats.room, 'cheater', 'char-c', 'W2');
    knock(cheats.room, k);
    expect(inside(cheats.room, k)).toBe(false);
    expect(cheats.svc.keyCount('W2')).toBe(1);
    expect(k.toasts().some((t) => t.includes('Hollow Key'))).toBe(false); // (no hint where a key is no use)
  });

  it('do nothing without a token: the sigil is the only way in', () => {
    const repo = new SqliteRepo(':memory:');
    const room = new GameRoom({ seed: 1, kind: 'adventure', naturalSpawning: false, store: new MemoryRoomStore() });
    const c = new Client().join(room, 'ann', 'char-ann', 'W1');
    knock(room, c);
    expect(inside(room, c)).toBe(false);
    expect(c.toasts().some((t) => t.includes('Hollow Key'))).toBe(false);
    expect(repo.tokens.perkCount('W1', PERK_HOLLOW_KEY)).toBe(0);
  });
});
