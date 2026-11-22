'use client';

import { create } from 'zustand';
import type { AchTier, ClassId } from '@solrift/shared';
import { useAuth, type AccountInfo } from '../auth/store';

/** What `GET /api/token/info` says (mirrors the server's `TokenInfoView`). Without a mint on the server, `live` is false and the rest is empty. */
export interface TokenLiveInfo {
  live: boolean;
  mint: string | null;
  cluster: 'mainnet-beta' | 'devnet' | 'testnet' | null;
  decimals: number | null;
  supply: string | null;
  withdrawals: boolean;
  tiers: Record<AchTier, number>;
  limits: { dailyPool: number; walletDailyReward: number; minWithdraw: number; walletDailyWithdraw: number; clearRewards: number[]; slotPrices: number[]; stashPrices: number[]; bountyRewards: number[]; outfitPrices: number[]; keyPrice: number };
  /** `spentTotal`: what players spent in the game. It is not burned: it stays in the treasury. */
  pool: { paidToday: number; paidTotal: number; withdrawnTotal: number; spentTotal: number };
  explorer: { token: string; tx: string; suffix: string } | null;
}

/** What `GET /api/token/economy` says (mirrors the server's `EconomyView`): how the tokens move, in whole tokens. Public, and it names no wallet. */
export interface TokenEconomy {
  days: { day: string; earned: number; spent: number; withdrawn: number; sales: number; salesVolume: number; earners: number }[];
  totals: {
    earned: { achievements: number; clears: number; bounties: number; total: number };
    spent: { items: { label: string; amount: number }[]; fees: number; total: number };
    withdrawn: number;
    sales: { count: number; volume: number };
  };
  held: { tokens: number; wallets: number };
  earners7d: number;
  returnedPct: number | null;
  dailyPool: number;
  paidToday: number;
}

export interface LedgerRow {
  id: number;
  kind: 'reward' | 'withdraw' | 'spend' | 'trade' | 'fee';
  label: string;
  amount: number;
  status: 'ok' | 'pending' | 'done' | 'failed';
  signature: string | null;
  at: number;
}

/** What `GET /api/token/me` says about the signed-in wallet. */
export interface TokenMe {
  balance: number;
  pending: { amount: number; signature: string | null } | null;
  withdrawableToday: number;
  history: LedgerRow[];
  /** What the balance can be spent on. */
  shop: ShopItem[];
  /** The outfits for sale. A bought one is an item in the wallet's Stash. */
  outfits: OutfitInfo[];
  /** How many slots of the Stash are free (an outfit needs one); null when it cannot be read. */
  stashFree: number | null;
}

export interface OutfitInfo {
  id: string;
  /** The class the set is made for: only its heroes wear it (anyone can buy it). */
  cls: ClassId;
  name: string;
  blurb: string;
  tier: 'common' | 'rare' | 'epic';
  shirt: string;
  pants: string;
  trim: string;
  glow: string;
  /** What it costs. */
  price: number | null;
  /** How many of it are in the Stash now. */
  have: number;
}

export interface ShopItem {
  sku: string;
  name: string;
  blurb: string;
  owned: number;
  max: number;
  /** What the next one costs (null: none left to buy). */
  price: number | null;
  /** Used up rather than kept for good (a Hollow Key): `owned` is how many are in hand now, not how many were ever bought. */
  consumable?: boolean;
}

interface TokenState {
  info: TokenLiveInfo | null;
  /** 'error': the server could not be reached (the page then reads as if the token were not live yet). */
  infoStatus: 'idle' | 'loading' | 'ready' | 'error';
  economy: TokenEconomy | null;
  me: TokenMe | null;
  busy: boolean;
  /** The reason the last withdrawal was refused (the server's own words), or ''. */
  error: string;
  /** What the last withdrawal did, to tell the player. */
  notice: string;
  loadInfo(): Promise<void>;
  /** Read how the tokens move (quietly keeps what it had when the server is away). */
  loadEconomy(): Promise<void>;
  /** Read the signed-in wallet's balance (does nothing, quietly, when signed out). */
  loadMe(): Promise<void>;
  clearMe(): void;
  withdraw(amount: number): Promise<void>;
  /** Buy one of `sku` with the balance. Resolves to what was bought, or null (the reason is in `error`). */
  buy(sku: string): Promise<ShopItem | null>;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/token/${path}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `request failed (${res.status})`);
  return body as T;
}

export const useToken = create<TokenState>()((set, get) => ({
  info: null,
  infoStatus: 'idle',
  economy: null,
  me: null,
  busy: false,
  error: '',
  notice: '',

  async loadInfo() {
    if (get().infoStatus === 'loading') return;
    set({ infoStatus: get().info ? 'ready' : 'loading' });
    try {
      set({ info: await api<TokenLiveInfo>('info'), infoStatus: 'ready' });
    } catch {
      set({ infoStatus: get().info ? 'ready' : 'error' });
    }
  },

  async loadEconomy() {
    try {
      set({ economy: await api<TokenEconomy>('economy') });
    } catch {
      // (what was shown stays shown)
    }
  },

  async loadMe() {
    try {
      set({ me: await api<TokenMe>('me') });
    } catch {
      set({ me: null }); // signed out, or the server is away
    }
  },

  clearMe() {
    set({ me: null, error: '', notice: '' });
  },

  async withdraw(amount) {
    if (get().busy) return;
    set({ busy: true, error: '', notice: '' });
    try {
      const res = await api<{ status: 'done' | 'pending'; amount: number; me: TokenMe }>('withdraw', { method: 'POST', body: JSON.stringify({ amount }) });
      set({
        me: res.me,
        notice: res.status === 'done' ? `Sent ${res.amount.toLocaleString()} $SOLRIFT to your wallet.` : `Sending ${res.amount.toLocaleString()} $SOLRIFT. It is on its way and will show here when the network confirms it.`,
      });
      void get().loadInfo();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ busy: false });
    }
  },

  async buy(sku) {
    if (get().busy) return null;
    set({ busy: true, error: '', notice: '' });
    try {
      const res = await api<{ sku: string; name: string; price: number; me: TokenMe; account: AccountInfo }>('buy', { method: 'POST', body: JSON.stringify({ sku }) });
      set({ me: res.me, notice: sku.startsWith('outfit:') ? `${res.name.replace(/^Outfit: /, '')} is in your Stash: ${res.price.toLocaleString()} $SOLRIFT spent. Take it out in the world and right-click it to wear it.` : `Bought a ${res.name.toLowerCase()} for ${res.price.toLocaleString()} $SOLRIFT.` });
      useAuth.getState().applyAccount(res.account);
      void get().loadInfo();
      return res.me.shop.find((i) => i.sku === sku) ?? ({ sku, name: res.name, blurb: '', owned: 0, max: 0, price: null } as ShopItem);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return null;
    } finally {
      set({ busy: false });
    }
  },
}));

/** Where to look at a transaction (null when the token is not set up). */
export const txUrl = (info: TokenLiveInfo | null, signature: string): string | null => (info?.explorer ? `${info.explorer.tx}${signature}${info.explorer.suffix}` : null);
