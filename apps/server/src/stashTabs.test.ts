import { describe, expect, it } from 'vitest';
import { I, STASH_MAX_SLOTS, STASH_MAX_TABS, STASH_SLOTS, STASH_TAB_SLOTS, StashVault, base58Encode, makeStack, parseNetClientMessage, stashSlotsFor, stashViewOf } from '@solrift/shared';
import { SqliteRepo } from './db';
import { TokenService, tokenConfigFromEnv, type TokenConfig } from './token';
import { MockChain } from './tokenChain';
import { PERK_STASH_TAB } from './tokenRepo';

const MINT = base58Encode(new Uint8Array(32).fill(7));
const cfg = (over: Partial<TokenConfig> = {}): TokenConfig => ({ mint: MINT, cluster: 'devnet', rpcUrl: 'http://rpc.invalid', dailyPool: 10_000, walletDailyReward: 10_000, minWithdraw: 10, walletDailyWithdraw: 10_000, clearRewards: [20], slotPrices: [], bountyRewards: [3, 6, 12], keyPrice: 0, stashPrices: [50, 120], outfitPrices: [], ...over });
function world(over: Partial<TokenConfig> = {}) {
  const repo = new SqliteRepo(':memory:');
  const svc = new TokenService(repo.tokens, cfg(over), new MockChain());
  const fund = (wallet: string, n: number) => repo.tokens.insertTrade({ wallet, ref: `gift:${wallet}:${n}`, kind: 'trade', amount: n, note: 'Test funds', now: 1 });
  return { repo, svc, fund };
}

describe('stash tabs: buying them', () => {
  it('are sold in turn at their prices, and each adds a tab of slots', () => {
    const { svc, fund } = world();
    fund('W1', 500);
    expect(svc.shop('W1')[0]).toMatchObject({ sku: PERK_STASH_TAB, name: 'Stash tab', owned: 0, max: 2, price: 50, consumable: false });
    expect(svc.stashTabs('W1')).toBe(0);
    svc.buy('W1', 'c', PERK_STASH_TAB);
    svc.buy('W1', 'c', PERK_STASH_TAB);
    expect(svc.stashTabs('W1')).toBe(2);
    expect(svc.balance('W1')).toBe(500 - 170);
    expect(svc.shop('W1')[0].price).toBeNull();
    expect(() => svc.buy('W1', 'c', PERK_STASH_TAB)).toThrow(/every tab/);
    expect(svc.balance('W1')).toBe(330);
    expect(svc.stashTabs('W2')).toBe(0); // a tab is the wallet's own
  });

  it('say what is missing, and are off when no prices are set', () => {
    const { svc, fund } = world();
    fund('W1', 20);
    expect(() => svc.buy('W1', 'c', PERK_STASH_TAB)).toThrow(/costs 50 \$SOLRIFT. You have 20/);
    expect(world({ stashPrices: [] }).svc.shop('W1')).toEqual([]);
    expect(tokenConfigFromEnv({}).stashPrices).toEqual([50, 120]);
    expect(tokenConfigFromEnv({ TOKEN_STASH_PRICES: '10,20,30' }).stashPrices).toEqual([10, 20, 30]);
    expect(tokenConfigFromEnv({ TOKEN_STASH_PRICES: 'off' }).stashPrices).toEqual([]);
  });

  it('never offer more tabs than a stash has room for', () => {
    const { svc, fund } = world({ stashPrices: [1, 1, 1, 1, 1, 1, 1] });
    fund('W1', 100);
    expect(svc.shop('W1')[0].max).toBe(STASH_MAX_TABS);
    for (let i = 0; i < STASH_MAX_TABS; i++) svc.buy('W1', 'c', PERK_STASH_TAB);
    expect(() => svc.buy('W1', 'c', PERK_STASH_TAB)).toThrow(/every tab/);
    expect(stashSlotsFor(svc.stashTabs('W1'))).toBe(STASH_MAX_SLOTS);
  });
});

describe('stash tabs: the stash itself', () => {
  it('has room for the tabs bought, and grows when one is bought while it is in use', () => {
    let tabs = 0;
    const vault = new StashVault();
    vault.tabsOf = () => tabs;
    expect(vault.of('W1').size).toBe(STASH_SLOTS);
    vault.of('W1').set(3, makeStack(I.DIAMOND, 5));
    tabs = 1;
    const grown = vault.of('W1');
    expect(grown.size).toBe(STASH_SLOTS + STASH_TAB_SLOTS);
    expect(grown.get(3)).toMatchObject({ id: I.DIAMOND, count: 5 });
    expect(vault.view('W1').slots).toHaveLength(STASH_SLOTS + STASH_TAB_SLOTS);
    // The new room is used, and an item in it can be taken out again.
    for (let i = 0; i < STASH_SLOTS; i++) grown.set(i, makeStack(I.DIAMOND, 1, i + 1));
    expect(vault.put('W1', makeStack(I.EMERALD, 1, 999), 1)).toBe(1);
    expect(vault.peek('W1', STASH_SLOTS)).not.toBeNull();
    expect(vault.peek('W1', STASH_SLOTS + STASH_TAB_SLOTS)).toBeNull();
  });

  it('never loses what was saved, even when the tabs are no longer there, and reads back whole', () => {
    const a = new StashVault();
    a.tabsOf = () => 2;
    a.of('W1').set(STASH_SLOTS + 40, makeStack(I.DIAMOND, 7));
    const saved = JSON.parse(JSON.stringify(a.toJSON('W1')));
    expect(saved).toHaveLength(STASH_SLOTS + 2 * STASH_TAB_SLOTS);
    const b = new StashVault(); // (a server whose token is off: no tabs)
    b.load('W1', saved);
    expect(b.of('W1').size).toBe(STASH_SLOTS + 2 * STASH_TAB_SLOTS);
    expect(b.peek('W1', STASH_SLOTS + 40)).toMatchObject({ id: I.DIAMOND, count: 7 });
    expect(stashViewOf(saved).slots).toHaveLength(STASH_SLOTS + 2 * STASH_TAB_SLOTS);
    expect(stashViewOf(null).slots).toHaveLength(STASH_SLOTS);
    expect(stashViewOf(null, 1).slots).toHaveLength(STASH_SLOTS + STASH_TAB_SLOTS); // (bought, but nothing stored yet)
    expect(stashViewOf(new Array(5000).fill(null)).slots).toHaveLength(STASH_MAX_SLOTS); // (a saved stash cannot be made huge)
  });

  it('are asked for by slot number up to the biggest stash, and no further', () => {
    const take = (slot: number) => parseNetClientMessage({ t: 'cmd', c: { t: 'stash', a: 'take', slot, count: 1 } });
    expect(take(STASH_MAX_SLOTS - 1)).toBeTruthy();
    expect(take(STASH_MAX_SLOTS)).toBeNull();
  });
});
