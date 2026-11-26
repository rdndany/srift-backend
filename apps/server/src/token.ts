import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { ACHIEVEMENT_BY_ID, ACH_TIERS, ACH_TIER_ORDER, BOUNTY_BY_ID, BOUNTY_TIERS, OUTFITS, OUTFIT_TIERS, STASH_MAX_TABS, STASH_TAB_SLOTS, addressToPublicKey, bountiesOn, dayName, dayOf, outfitSetItemId, type AchTier } from '@solrift/shared';
import { AuthError, SESSION_COOKIE, json, readBody, readCookie, type AuthService } from './auth';
import { DEFAULT_RPC, MockChain, SolanaChain, TokenError, loadKeypair, type Cluster, type TokenChain } from './tokenChain';
import { PERK_HERO_SLOT, PERK_HOLLOW_KEY, PERK_OUTFIT_PREFIX, PERK_STASH_TAB, type LedgerEntry, type TokenRepo } from './tokenRepo';

/** What an outfit is bought by (`outfit:<id>`, see `OUTFITS`). */
const SKU_OUTFIT = 'outfit:';
const DAY_MS = 24 * 60 * 60 * 1000;
/** A withdrawal that was debited but never got a signature (the server died in between) never reached the chain: it is released after this. */
const UNSENT_AFTER_MS = 2 * 60 * 1000;

/**
 * How the $SOLRIFT token is set up. Everything starts off: with no `mint` the game pays nothing, the page says "Announced at
 * launch" and the wallet panel is hidden. Setting `TOKEN_MINT` (and `SOLANA_CLUSTER`) turns on rewards; adding `TREASURY_KEYPAIR`
 * turns on withdrawals.
 */
export interface TokenConfig {
  /** The mint address, or null while there is no token. */
  mint: string | null;
  cluster: Cluster | null;
  rpcUrl: string | null;
  /** Whole tokens the game may reward in one UTC day, across everyone (the pool: when it is dry, rewards stop until tomorrow). */
  dailyPool: number;
  /** Whole tokens one wallet may be rewarded in one UTC day. */
  walletDailyReward: number;
  /** The smallest withdrawal, in whole tokens. */
  minWithdraw: number;
  /** Whole tokens one wallet may withdraw in one UTC day. */
  walletDailyWithdraw: number;
  /**
   * What a dungeon clear pays a wallet, in order, through one UTC day: the first clear pays `clearRewards[0]`, the next
   * `clearRewards[1]` and so on, and once the list is used up the rest of the day's clears pay nothing. Empty: clears pay nothing.
   */
  clearRewards: readonly number[];
  /**
   * What the extra hero slots cost, in order: the first one a wallet buys (its fourth character) costs `slotPrices[0]`, the next
   * `slotPrices[1]`, and a wallet that has bought them all can buy no more. Empty: no slots are for sale.
   */
  slotPrices: readonly number[];
  /** What the extra stash tabs cost, in order (27 more slots each; empty: none for sale, at most `STASH_MAX_TABS`). */
  stashPrices: readonly number[];
  /**
   * What a daily bounty pays, once per wallet per UTC day: `[easy, medium, hard]`. Empty: bounties pay nothing (they are still shown and
   * counted). Inside the same pool and caps as the other rewards.
   */
  bountyRewards: readonly number[];
  /** What an outfit costs by tier: common, rare, epic (empty: none for sale). */
  outfitPrices: readonly number[];
  /** What a Hollow Key costs, in whole tokens (0: keys are not for sale). A key lets a party into the Hollow Deep without a Hollow Sigil. */
  keyPrice: number;
}

/** The most Hollow Keys a wallet may hold at once. */
export const KEY_MAX = 10;
export const DEFAULT_KEY_PRICE = 15;

export const DEFAULT_BOUNTY_REWARDS: readonly number[] = [3, 6, 12];
export const DEFAULT_CLEAR_REWARDS: readonly number[] = [20, 10, 5, 3, 2];
export const DEFAULT_SLOT_PRICES: readonly number[] = [100, 250];
export const DEFAULT_OUTFIT_PRICES: readonly number[] = [30, 60, 120];
export const DEFAULT_STASH_PRICES: readonly number[] = [50, 120];
export const DEFAULT_TOKEN_LIMITS = { dailyPool: 50_000, walletDailyReward: 500, minWithdraw: 20, walletDailyWithdraw: 1_000, clearRewards: DEFAULT_CLEAR_REWARDS, slotPrices: DEFAULT_SLOT_PRICES, stashPrices: DEFAULT_STASH_PRICES, bountyRewards: DEFAULT_BOUNTY_REWARDS, outfitPrices: DEFAULT_OUTFIT_PRICES, keyPrice: DEFAULT_KEY_PRICE } as const;

export const NO_TOKEN: TokenConfig = { mint: null, cluster: null, rpcUrl: null, ...DEFAULT_TOKEN_LIMITS };

const CLUSTERS: readonly Cluster[] = ['mainnet-beta', 'devnet', 'testnet'];

const whole = (env: NodeJS.ProcessEnv, name: string, fallback: number): number => {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} must be a whole number, got "${raw}"`);
  return n;
};

/** "20,10,5" -> [20, 10, 5]; "off" or "none" -> [] (nothing on the list). Anything else is an error. */
const rewardList = (env: NodeJS.ProcessEnv, name: string, fallback: readonly number[]): readonly number[] => {
  const raw = env[name]?.trim();
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'off' || raw === 'none') return [];
  const list = raw.split(',').map((s) => Number(s.trim()));
  if (list.some((n) => !Number.isInteger(n) || n < 1)) throw new Error(`${name} must be whole numbers of at least 1, separated by commas (or "off"), got "${raw}"`);
  if (list.length > 50) throw new Error(`${name} has more than 50 entries`);
  return list;
};

/** Read the token settings from the environment, failing loudly on anything half-set (money should never run on a guess). */
export function tokenConfigFromEnv(env: NodeJS.ProcessEnv): TokenConfig {
  const limits = {
    dailyPool: whole(env, 'TOKEN_DAILY_POOL', DEFAULT_TOKEN_LIMITS.dailyPool),
    walletDailyReward: whole(env, 'TOKEN_WALLET_DAILY_REWARD', DEFAULT_TOKEN_LIMITS.walletDailyReward),
    minWithdraw: whole(env, 'TOKEN_MIN_WITHDRAW', DEFAULT_TOKEN_LIMITS.minWithdraw),
    walletDailyWithdraw: whole(env, 'TOKEN_WALLET_DAILY_WITHDRAW', DEFAULT_TOKEN_LIMITS.walletDailyWithdraw),
    clearRewards: rewardList(env, 'TOKEN_CLEAR_REWARDS', DEFAULT_CLEAR_REWARDS),
    slotPrices: rewardList(env, 'TOKEN_SLOT_PRICES', DEFAULT_SLOT_PRICES),
    stashPrices: rewardList(env, 'TOKEN_STASH_PRICES', DEFAULT_STASH_PRICES),
    bountyRewards: rewardList(env, 'TOKEN_BOUNTY_REWARDS', DEFAULT_BOUNTY_REWARDS),
    outfitPrices: rewardList(env, 'TOKEN_OUTFIT_PRICES', DEFAULT_OUTFIT_PRICES),
    keyPrice: whole(env, 'TOKEN_KEY_PRICE', DEFAULT_KEY_PRICE),
  };
  if (limits.outfitPrices.length !== 0 && limits.outfitPrices.length !== OUTFIT_TIERS.length) throw new Error(`TOKEN_OUTFIT_PRICES needs ${OUTFIT_TIERS.length} amounts (common, rare, epic), or "off"`);
  if (limits.bountyRewards.length !== 0 && limits.bountyRewards.length !== BOUNTY_TIERS.length) throw new Error(`TOKEN_BOUNTY_REWARDS needs ${BOUNTY_TIERS.length} amounts (easy, medium, hard), or "off"`);
  const mint = env.TOKEN_MINT?.trim() || null;
  if (!mint) return { mint: null, cluster: null, rpcUrl: null, ...limits };
  const pub = addressToPublicKey(mint);
  if (!pub) throw new Error('TOKEN_MINT is not a valid Solana address');
  const cluster = env.SOLANA_CLUSTER?.trim() as Cluster | undefined;
  if (!cluster || !CLUSTERS.includes(cluster)) throw new Error(`SOLANA_CLUSTER must be one of ${CLUSTERS.join(', ')} when TOKEN_MINT is set (the same address means different things on devnet and mainnet)`);
  return { mint, cluster, rpcUrl: env.SOLANA_RPC_URL?.trim() || DEFAULT_RPC[cluster], ...limits };
}

/** The chain for a config: real Solana (read-only without a treasury key), or the in-memory one for `TOKEN_DEV_MOCK=1`. */
export function tokenChainFromEnv(cfg: TokenConfig, env: NodeJS.ProcessEnv): TokenChain | null {
  if (!cfg.mint) return null;
  if (env.TOKEN_DEV_MOCK === '1') {
    if (env.NODE_ENV === 'production') throw new Error('TOKEN_DEV_MOCK=1 must never run in production');
    console.warn('[solrift] TOKEN_DEV_MOCK=1: token payouts are FAKE (in memory, nothing reaches any chain)');
    return new MockChain();
  }
  const treasury = env.TREASURY_KEYPAIR ? loadKeypair(env.TREASURY_KEYPAIR) : undefined;
  return new SolanaChain({ rpcUrl: cfg.rpcUrl!, mint: cfg.mint, treasury });
}

/** 1234567.5 -> "1,234,567.5" */
export function formatUnits(units: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const intPart = (units / base).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = decimals > 0 ? (units % base).toString().padStart(decimals, '0').replace(/0+$/, '') : '';
  return frac ? `${intPart}.${frac}` : intPart;
}

export interface TokenInfoView {
  /** False until a mint is set: the page then says "Announced at launch". */
  live: boolean;
  mint: string | null;
  cluster: Cluster | null;
  decimals: number | null;
  /** Total supply as it reads ("1,000,000,000"), or null when it cannot be read from the chain. */
  supply: string | null;
  /** Whether withdrawals are open (a treasury is set up). */
  withdrawals: boolean;
  /** Whole tokens each achievement tier pays. */
  tiers: Record<AchTier, number>;
  limits: { dailyPool: number; walletDailyReward: number; minWithdraw: number; walletDailyWithdraw: number; clearRewards: number[]; slotPrices: number[]; stashPrices: number[]; bountyRewards: number[]; outfitPrices: number[]; keyPrice: number };
  /** Whole tokens, for the "honest numbers" the page promises. `spentTotal` is what players spent in the game: it stays in the treasury. */
  pool: { paidToday: number; paidTotal: number; withdrawnTotal: number; spentTotal: number };
  explorer: { token: string; tx: string; suffix: string } | null;
}

/** One UTC day of the economy, in whole tokens. `spent` is what players put into the game (purchases and the house's cuts): it stays in the treasury. */
export interface EconomyDay {
  day: string;
  earned: number;
  spent: number;
  withdrawn: number;
  sales: number;
  salesVolume: number;
  earners: number;
}

/**
 * How the tokens move, for the economy page: what comes in as rewards, what goes back to the treasury by spending, what leaves the game
 * by withdrawal, and what players hold. Public, and it names no wallet.
 */
export interface EconomyView {
  /** The last days, oldest first, today last (a day with nothing in it is there too, at zero). */
  days: EconomyDay[];
  totals: {
    earned: { achievements: number; clears: number; bounties: number; total: number };
    spent: { items: { label: string; amount: number }[]; fees: number; total: number };
    withdrawn: number;
    sales: { count: number; volume: number };
  };
  /** What players hold in balances (what the treasury owes them), and how many wallets hold any. */
  held: { tokens: number; wallets: number };
  /** Different wallets that earned something in the last 7 days. */
  earners7d: number;
  /** What was spent, in each hundred earned, all time (null before anything was earned). */
  returnedPct: number | null;
  dailyPool: number;
  paidToday: number;
}

export interface LedgerView {
  id: number;
  kind: 'reward' | 'withdraw' | 'spend' | 'trade' | 'fee';
  /** For a reward, the achievement's name; for a purchase, what was bought. */
  label: string;
  amount: number;
  status: 'ok' | 'pending' | 'done' | 'failed';
  signature: string | null;
  at: number;
}

export interface TokenMeView {
  balance: number;
  /** A withdrawal waiting for the chain, if any. */
  pending: { amount: number; signature: string | null } | null;
  /** What this wallet may still withdraw today. */
  withdrawableToday: number;
  history: LedgerView[];
  /** What this wallet can spend its balance on. */
  shop: ShopItemView[];
  /** Every outfit for sale and what it costs (empty when none are for sale): a buyer gets the item in the Stash. */
  outfits: OutfitView[];
  /** How many slots of the wallet's Stash are free (an outfit needs one to be bought); null when the Stash cannot be read. */
  stashFree: number | null;
}

/** One outfit, as the wallet sees it. */
export interface OutfitView {
  id: string;
  name: string;
  blurb: string;
  tier: string;
  shirt: string;
  pants: string;
  /** The class whose set it is: only its heroes can wear it. */
  cls: string;
  trim: string;
  glow: string;
  /** What it costs. */
  price: number | null;
  /** How many of it the wallet has in its Stash right now (it is an item: it may also be in a bag, on a hero, or sold). */
  have: number;
}

/** What the token shop needs of the Stash of the realm (see `GameRoom`): a wallet's, whether or not any of its heroes is in the world. */
export interface StashPort {
  /** Empty slots. */
  free(wallet: string): number;
  /** How many of an item are in it. */
  count(wallet: string, itemId: number): number;
  /** Put one of an item in it, written down at once; false when there is no room (nothing is put in). */
  give(wallet: string, itemId: number): boolean;
}

/** One thing for sale for $SOLRIFT, as the wallet sees it. */
export interface ShopItemView {
  sku: string;
  name: string;
  blurb: string;
  /** How many the wallet has bought (a consumable: holds now), and how many it can buy in all (a consumable: hold at once). */
  owned: number;
  max: number;
  /** Used up when it is used (a key), rather than kept for good (a slot). */
  consumable: boolean;
  /** What the next one costs (null: none left to buy). */
  price: number | null;
}

/** One movement the Auction House asks the ledger for (see `AuctionHouse.moves`). */
export interface TradeMove {
  id: number;
  wallet: string;
  amount: number;
  kind: 'trade' | 'fee';
  note: string;
}

export type BuyResult = { sku: string; name: string; price: number };

export type WithdrawResult = { status: 'done' | 'pending'; amount: number; signature: string };

export class TokenService {
  /** Withdrawals this process is working on (the reconciler leaves them alone). */
  private readonly inFlight = new Set<number>();
  private mintCache: { at: number; decimals: number; supply: bigint } | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private warnedDry = false;
  /** Where a bought outfit goes: set by the server once the room exists (without it outfits cannot be bought). */
  stash: StashPort | null = null;

  constructor(
    private readonly repo: TokenRepo,
    readonly cfg: TokenConfig = NO_TOKEN,
    private readonly chain: TokenChain | null = null,
    private readonly now: () => number = Date.now,
  ) {}

  /** True once there is a token: rewards are paid. */
  get live(): boolean {
    return !!this.cfg.mint;
  }

  get canWithdraw(): boolean {
    return this.live && !!this.chain?.canSend;
  }

  private dayStart(): number {
    const t = this.now();
    return t - (t % DAY_MS);
  }

  // ---- rewards ------------------------------------------------------------------------------------------------

  /**
   * An achievement was won: pay its tier's reward into the wallet's balance. Paid once per wallet per achievement (a deleted and
   * remade character cannot win it again), inside the day's pool and the wallet's daily cap. Returns the whole tokens credited
   * (0: no token yet, already paid, or a limit reached). Never throws: a payout problem must not disturb the game.
   */
  reward(wallet: string, accountId: string | null, achievementId: string): number {
    if (!this.live) return 0;
    try {
      const a = ACHIEVEMENT_BY_ID.get(achievementId);
      if (!a || a.board !== 'realm') return 0;
      const amount = ACH_TIERS[a.tier].reward;
      if (!this.roomFor(wallet, amount)) return 0;
      return this.repo.insertReward({ wallet, accountId, ref: achievementId, amount, now: this.now() }) ? amount : 0;
    } catch (err) {
      console.error('[solrift] token: crediting a reward failed', err);
      return 0;
    }
  }

  /**
   * A daily bounty was finished (see bounties.ts): pay what its tier is worth, once per wallet per day (the ledger's one-row-per-ref rule:
   * `bounty:<UTC day>:<id>`, so a second character of the wallet finishing the same bounty is not paid again). Only a bounty that was really
   * posted for a day that is today or yesterday (UTC) is paid. Inside the same pool and caps as the other rewards. Returns the whole tokens
   * credited (0: no token, nothing posted by that name, already paid, or a limit reached). Never throws.
   */
  rewardBounty(wallet: string, accountId: string | null, day: number, id: string): number {
    if (!this.live || this.cfg.bountyRewards.length === 0) return 0;
    try {
      const def = BOUNTY_BY_ID.get(id);
      const today = dayOf(this.now());
      if (!def || !Number.isInteger(day) || day < today - 1 || day > today || !bountiesOn(day).some((b) => b.id === id)) return 0;
      const amount = this.cfg.bountyRewards[BOUNTY_TIERS.indexOf(def.tier)];
      if (!amount || !this.roomFor(wallet, amount)) return 0;
      return this.repo.insertReward({ wallet, accountId, ref: `bounty:${dayName(day)}:${id}`, amount, now: this.now() }) ? amount : 0;
    } catch (err) {
      console.error('[solrift] token: crediting a bounty failed', err);
      return 0;
    }
  }

  /** Is there room in the day's pool, and in this wallet's daily cap, for `amount` more? */
  private roomFor(wallet: string, amount: number): boolean {
    const day = this.dayStart();
    if (this.repo.sumSince('reward', day) + amount > this.cfg.dailyPool) {
      if (!this.warnedDry) console.warn('[solrift] token: the daily reward pool is dry, rewards stop until tomorrow (UTC)');
      this.warnedDry = true;
      return false;
    }
    this.warnedDry = false;
    return this.repo.sumSince('reward', day, wallet) + amount <= this.cfg.walletDailyReward;
  }

  /**
   * A dungeon was cleared by a player who fought in it: pay the next amount on the wallet's clear schedule for today (see
   * `TokenConfig.clearRewards`). Each paid clear is its own ledger row (`clear:<UTC day>:<n>`), and the ledger's one-row-per-ref rule
   * is what stops two clears landing in the same tick from both taking slot `n`: the loser moves on to the next slot. Inside the same
   * pool and caps as achievements. Returns the whole tokens credited (0: no token, schedule used up, or a limit reached). Never throws.
   */
  rewardClear(wallet: string, accountId: string | null): number {
    if (!this.live || this.cfg.clearRewards.length === 0) return 0;
    try {
      const prefix = `clear:${new Date(this.dayStart()).toISOString().slice(0, 10)}:`;
      for (let n = this.repo.countRewards(wallet, prefix); n < this.cfg.clearRewards.length; n++) {
        const amount = this.cfg.clearRewards[n];
        if (!this.roomFor(wallet, amount)) return 0;
        if (this.repo.insertReward({ wallet, accountId, ref: `${prefix}${n}`, amount, now: this.now() })) return amount;
      }
      return 0;
    } catch (err) {
      console.error('[solrift] token: crediting a clear failed', err);
      return 0;
    }
  }

  balance(wallet: string): number {
    return this.repo.balance(wallet);
  }

  // ---- what the page and the player see ------------------------------------------------------------------------

  private async mint(): Promise<{ decimals: number; supply: bigint } | null> {
    if (!this.chain) return null;
    const t = this.now();
    if (this.mintCache && t - this.mintCache.at < 5 * 60_000) return this.mintCache;
    try {
      const m = await this.chain.mintInfo();
      this.mintCache = { at: t, ...m };
      return this.mintCache;
    } catch (err) {
      console.warn('[solrift] token: cannot read the mint', err instanceof Error ? err.message : err);
      return this.mintCache; // stale is better than nothing
    }
  }

  async info(): Promise<TokenInfoView> {
    const tiers = Object.fromEntries(ACH_TIER_ORDER.map((t) => [t, ACH_TIERS[t].reward])) as Record<AchTier, number>;
    const { mint, cluster } = this.cfg;
    const m = this.live ? await this.mint() : null;
    const suffix = cluster && cluster !== 'mainnet-beta' ? `?cluster=${cluster}` : '';
    return {
      live: this.live,
      mint,
      cluster,
      decimals: m?.decimals ?? null,
      supply: m ? formatUnits(m.supply, m.decimals) : null,
      withdrawals: this.canWithdraw,
      tiers,
      limits: { dailyPool: this.cfg.dailyPool, walletDailyReward: this.cfg.walletDailyReward, minWithdraw: this.cfg.minWithdraw, walletDailyWithdraw: this.cfg.walletDailyWithdraw, clearRewards: [...this.cfg.clearRewards], slotPrices: [...this.cfg.slotPrices], stashPrices: [...this.stashPriceList()], bountyRewards: [...this.cfg.bountyRewards], outfitPrices: [...this.cfg.outfitPrices], keyPrice: this.cfg.keyPrice },
      pool: { paidToday: this.repo.sumSince('reward', this.dayStart()), paidTotal: this.repo.total('reward'), withdrawnTotal: this.repo.total('withdraw'), spentTotal: this.repo.total('spend') + this.repo.total('fee') },
      explorer: mint ? { token: `https://solscan.io/token/${mint}${suffix}`, tx: 'https://solscan.io/tx/', suffix } : null,
    };
  }

  /** The economy as the ledger shows it (see `EconomyView`). */
  economy(days = 14): EconomyView {
    const today = this.dayStart();
    const n = Math.max(1, Math.min(60, Math.floor(days)));
    const first = today - (n - 1) * DAY_MS;
    const rows = this.repo.daily(0);
    const series = new Map<number, EconomyDay>();
    for (let i = 0; i < n; i++) {
      const t = first + i * DAY_MS;
      series.set(t / DAY_MS, { day: new Date(t).toISOString().slice(0, 10), earned: 0, spent: 0, withdrawn: 0, sales: 0, salesVolume: 0, earners: 0 });
    }
    let achievements = 0;
    let clears = 0;
    let bounties = 0;
    let fees = 0;
    let withdrawn = 0;
    let salesCount = 0;
    let salesVolume = 0;
    const items = new Map<string, number>();
    for (const r of rows) {
      const d = series.get(r.day);
      if (r.kind === 'reward') {
        if (r.sub === 'clear') clears += r.sum;
        else if (r.sub === 'bounty') bounties += r.sum;
        else achievements += r.sum;
        if (d) d.earned += r.sum;
      } else if (r.kind === 'spend') {
        items.set(r.sub, (items.get(r.sub) ?? 0) + r.sum);
        if (d) d.spent += r.sum;
      } else if (r.kind === 'fee') {
        fees += r.sum;
        salesVolume += r.sum;
        if (d) {
          d.spent += r.sum;
          d.salesVolume += r.sum;
        }
      } else if (r.kind === 'withdraw') {
        withdrawn += r.sum;
        if (d) d.withdrawn += r.sum;
      } else if (r.kind === 'trade' && r.sub === 'sale') {
        salesCount += r.n;
        salesVolume += r.sum;
        if (d) {
          d.sales += r.n;
          d.salesVolume += r.sum;
        }
      }
    }
    for (const [day, count] of this.repo.earnersByDay(first)) {
      const d = series.get(day);
      if (d) d.earners = count;
    }
    const earned = achievements + clears + bounties;
    const spentItems = [...items].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount);
    const spent = spentItems.reduce((s, i) => s + i.amount, 0) + fees;
    return {
      days: [...series.values()],
      totals: { earned: { achievements, clears, bounties, total: earned }, spent: { items: spentItems, fees, total: spent }, withdrawn, sales: { count: salesCount, volume: salesVolume } },
      held: this.repo.held(),
      earners7d: this.repo.earners(today - 6 * DAY_MS),
      returnedPct: earned > 0 ? Math.round((spent / earned) * 100) : null,
      dailyPool: this.cfg.dailyPool,
      paidToday: this.repo.sumSince('reward', today),
    };
  }

  me(wallet: string): TokenMeView {
    const pending = this.repo.pendingFor(wallet);
    const used = this.repo.sumSince('withdraw', this.dayStart(), wallet);
    return {
      balance: this.repo.balance(wallet),
      pending: pending ? { amount: -pending.amount, signature: pending.signature } : null,
      withdrawableToday: Math.max(0, this.cfg.walletDailyWithdraw - used),
      history: this.repo.history(wallet, 25).map(viewOf),
      shop: this.shop(wallet),
      outfits: this.outfits(wallet),
      stashFree: this.stashFree(wallet),
    };
  }

  // ---- the Auction House ----------------------------------------------------------------------------------------

  /**
   * Write the Auction House's $SOLRIFT movements to the ledger, and (by `save`) the house itself, in one transaction: a bid is never
   * paid without being recorded, nor recorded without being paid. `scope` names the house (its moves are numbered inside it), and a move
   * already written is ignored, so sending the same moves again after a restart is safe. Throws when nothing could be written.
   */
  commitTrades(scope: string, moves: readonly TradeMove[], save: () => void): void {
    this.repo.atomic(() => {
      const t = this.now();
      for (const m of moves) this.repo.insertTrade({ wallet: m.wallet, ref: `${scope}:${m.id}`, kind: m.kind, amount: m.amount, note: m.note, now: t });
      save();
    });
  }

  // ---- spending -----------------------------------------------------------------------------------------------

  /** What the wallet can buy, and at what price. Empty until the token is live. */
  shop(wallet: string): ShopItemView[] {
    if (!this.live) return [];
    const items: ShopItemView[] = [];
    if (this.cfg.slotPrices.length > 0) {
      const owned = this.repo.perkCount(wallet, PERK_HERO_SLOT);
      const max = this.cfg.slotPrices.length;
      items.push({ sku: PERK_HERO_SLOT, name: 'Hero slot', blurb: 'One more character on your wallet.', owned, max, consumable: false, price: owned < max ? this.cfg.slotPrices[owned] : null });
    }
    const tabs = this.stashPriceList();
    if (tabs.length > 0) {
      const owned = this.repo.perkCount(wallet, PERK_STASH_TAB);
      items.push({ sku: PERK_STASH_TAB, name: 'Stash tab', blurb: `${STASH_TAB_SLOTS} more slots in your shared Stash, for every hero of your wallet.`, owned, max: tabs.length, consumable: false, price: owned < tabs.length ? tabs[owned] : null });
    }
    if (this.cfg.keyPrice > 0) {
      const owned = this.repo.perkCount(wallet, PERK_HOLLOW_KEY);
      items.push({ sku: PERK_HOLLOW_KEY, name: 'Hollow Key', blurb: 'Opens the Hollow Deep for you and your party, in place of a Hollow Sigil. Used up on entering.', owned, max: KEY_MAX, consumable: true, price: owned < KEY_MAX ? this.cfg.keyPrice : null });
    }
    return items;
  }

  /** What an outfit of a tier costs (null: none for sale). */
  private outfitPrice(tier: string): number | null {
    const i = OUTFIT_TIERS.findIndex((t) => t === tier);
    return this.live && i >= 0 ? (this.cfg.outfitPrices[i] ?? null) : null;
  }

  /** Free slots in the wallet's Stash (null: it cannot be read). */
  private stashFree(wallet: string): number | null {
    try {
      return this.stash ? this.stash.free(wallet) : null;
    } catch (err) {
      console.error('[solrift] token: reading the stash failed', err);
      return null;
    }
  }

  /** The outfits for sale, with how many of each the wallet has in its Stash. */
  outfits(wallet: string): OutfitView[] {
    if (!this.live) return [];
    const out: OutfitView[] = [];
    for (const o of OUTFITS) {
      const price = this.outfitPrice(o.tier);
      if (price === null) continue;
      let have = 0;
      try {
        have = this.stash?.count(wallet, outfitSetItemId(o.id)) ?? 0;
      } catch {
        // (a Stash that cannot be read shows none)
      }
      out.push({ id: o.id, cls: o.cls, name: o.name, blurb: o.blurb, tier: o.tier, shirt: o.shirt, pants: o.pants, trim: o.trim, glow: o.glow, price, have });
    }
    return out;
  }

  /**
   * Buy an outfit: the tokens are spent and the set, an ITEM, is put in the wallet's Stash. With no free slot in the Stash it cannot be bought (nothing
   * is spent). The room is checked before the spend and the item put in right after it, with nothing awaited in between, so the two happen together;
   * if the Stash still refused, the price is given back at once.
   */
  private buyOutfit(wallet: string, accountId: string | null, id: string): BuyResult {
    const def = OUTFITS.find((o) => o.id === id);
    const price = def ? this.outfitPrice(def.tier) : null;
    if (!def || price === null) throw new TokenError(404, 'That is not for sale.');
    const stash = this.stash;
    if (!stash) throw new TokenError(503, 'Your Stash cannot be reached right now. Try again shortly.');
    if (stash.free(wallet) < 1) throw new TokenError(409, `Your Stash is full: ${def.name} is put there when you buy it, so make room for one more item first.`);
    const itemId = outfitSetItemId(def.id);
    const label = `Outfit: ${def.name}`;
    const result = this.repo.purchase({ wallet, accountId, perk: PERK_OUTFIT_PREFIX + def.id, label, price, max: 1_000_000, consumable: true, now: this.now() });
    if (result === 'maxed') throw new TokenError(409, 'You cannot buy any more of that.');
    if (result === 'broke') throw new TokenError(400, `${def.name} costs ${price.toLocaleString()} $SOLRIFT. You have ${this.repo.balance(wallet).toLocaleString()}.`);
    if (!stash.give(wallet, itemId)) {
      // Cannot happen after the check above, but a spend with nothing to show for it must never stand.
      this.repo.insertReward({ wallet, accountId, ref: `refund:${randomUUID()}`, amount: price, now: this.now() });
      throw new TokenError(409, 'Your Stash could not take it, and nothing was spent.');
    }
    return { sku: SKU_OUTFIT + def.id, name: label, price };
  }

  /** The tab prices that count (no more than the stash has room for). */
  private stashPriceList(): readonly number[] {
    return this.cfg.stashPrices.slice(0, STASH_MAX_TABS);
  }

  /** How many extra stash tabs the wallet has bought. */
  stashTabs(wallet: string): number {
    return this.live ? Math.min(STASH_MAX_TABS, this.repo.perkCount(wallet, PERK_STASH_TAB)) : 0;
  }

  /** How many Hollow Keys the wallet holds. */
  keyCount(wallet: string): number {
    return this.live ? this.repo.perkCount(wallet, PERK_HOLLOW_KEY) : 0;
  }

  /** Use up one of the wallet's Hollow Keys (the party enters the Hollow Deep). Returns how many are left, or -1 when it had none. Never throws. */
  takeKey(wallet: string): number {
    if (!this.live) return -1;
    try {
      return this.repo.takePerk(wallet, PERK_HOLLOW_KEY);
    } catch (err) {
      console.error('[solrift] token: using a key failed', err);
      return -1;
    }
  }

  /**
   * Buy one of something with the wallet's balance. The debit and the thing bought are written together (see `TokenRepo.purchase`),
   * so a purchase is either whole or not there. What is spent is not paid out to anyone and not burned: it simply stays in the
   * treasury, where it backs the balances and funds later rewards. Throws a `TokenError` with the reason when it cannot be done.
   */
  buy(wallet: string, accountId: string | null, sku: unknown): BuyResult {
    if (!this.live) throw new TokenError(503, 'The token is not live yet.');
    if (typeof sku === 'string' && sku.startsWith(SKU_OUTFIT)) return this.buyOutfit(wallet, accountId, sku.slice(SKU_OUTFIT.length));
    const item = typeof sku === 'string' ? this.shop(wallet).find((i) => i.sku === sku) : undefined;
    if (!item) throw new TokenError(404, 'That is not for sale.');
    const maxed = item.consumable ? `You already hold ${item.max} ${item.name.toLowerCase()}s, the most you can keep. Use one first.` : item.sku === PERK_STASH_TAB ? 'Your stash already has every tab there is.' : 'You have already bought every hero slot there is.';
    if (item.price === null) throw new TokenError(409, maxed);
    const result = this.repo.purchase({ wallet, accountId, perk: item.sku, label: item.name, price: item.price, max: item.max, consumable: item.consumable, now: this.now() });
    if (result === 'maxed') throw new TokenError(409, maxed);
    if (result === 'broke') throw new TokenError(400, `A ${item.name.toLowerCase()} costs ${item.price.toLocaleString()} $SOLRIFT. You have ${this.repo.balance(wallet).toLocaleString()}.`);
    return { sku: item.sku, name: item.name, price: item.price };
  }

  // ---- withdrawals --------------------------------------------------------------------------------------------

  /**
   * Send `amount` whole tokens from the treasury to the signed-in wallet. The balance is debited first (as a pending row), the
   * signed transaction's signature is written down before it is broadcast, and the row is only ever released again when the
   * transaction is known not to have landed, so a crash or a lost answer can neither lose a player's tokens nor pay them twice.
   */
  async withdraw(wallet: string, accountId: string | null, amount: unknown): Promise<WithdrawResult> {
    if (!this.live) throw new TokenError(503, 'The token is not live yet.');
    const chain = this.chain;
    if (!chain || !chain.canSend) throw new TokenError(503, 'Withdrawals are not open yet.');
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1) throw new TokenError(400, 'Enter a whole number of tokens.');
    if (amount < this.cfg.minWithdraw) throw new TokenError(400, `The least you can withdraw is ${this.cfg.minWithdraw} $SOLRIFT.`);

    const m = await this.mint(); // before the checks: nothing may be awaited between them and the debit
    if (!m) throw new TokenError(503, 'The token cannot be reached right now. Try again shortly.');

    if (this.repo.pendingFor(wallet)) throw new TokenError(409, 'You already have a withdrawal on its way. Wait for it to finish.');
    if (amount > this.repo.balance(wallet)) throw new TokenError(400, 'You do not have that many $SOLRIFT.');
    if (this.repo.sumSince('withdraw', this.dayStart(), wallet) + amount > this.cfg.walletDailyWithdraw) throw new TokenError(429, `The most one wallet can withdraw in a day is ${this.cfg.walletDailyWithdraw} $SOLRIFT.`);
    const baseUnits = BigInt(amount) * 10n ** BigInt(m.decimals);
    const id = this.repo.insertWithdraw({ wallet, accountId, ref: randomUUID(), amount, now: this.now() });
    this.inFlight.add(id);
    try {
      let prepared;
      try {
        prepared = await chain.prepareTransfer(wallet, baseUnits);
      } catch (err) {
        // Nothing was signed or sent, so the debit is simply undone.
        this.repo.updateWithdraw(id, { status: 'failed', note: err instanceof Error ? err.message : 'prepare failed' }, this.now());
        throw err instanceof TokenError ? err : new TokenError(503, 'The transfer could not be set up. Nothing was taken from your balance.');
      }
      this.repo.updateWithdraw(id, { signature: prepared.signature, lastValid: prepared.lastValidBlockHeight }, this.now());
      try {
        await prepared.send();
      } catch (err) {
        const state = await chain.signatureStatus(prepared.signature).catch(() => 'unknown' as const);
        if (state === 'confirmed') {
          this.repo.updateWithdraw(id, { status: 'done' }, this.now());
          return { status: 'done', amount, signature: prepared.signature };
        }
        if (state === 'failed') {
          this.repo.updateWithdraw(id, { status: 'failed', note: 'failed on chain' }, this.now());
          throw new TokenError(502, 'The transfer failed on the network. Nothing was taken from your balance.');
        }
        console.warn('[solrift] token: a withdrawal is unconfirmed, the reconciler will settle it', prepared.signature, err instanceof Error ? err.message : err);
        return { status: 'pending', amount, signature: prepared.signature };
      }
      this.repo.updateWithdraw(id, { status: 'done' }, this.now());
      return { status: 'done', amount, signature: prepared.signature };
    } finally {
      this.inFlight.delete(id);
    }
  }

  /**
   * Settle withdrawals left pending (a restart, a lost confirmation): confirmed on chain becomes done; one that can no longer
   * land (its block height has passed and it is not there) is released; one never signed is released after a couple of minutes.
   */
  async reconcile(): Promise<void> {
    const chain = this.chain;
    if (!chain) return;
    for (const e of this.repo.listPending()) {
      if (this.inFlight.has(e.id)) continue;
      try {
        await this.settle(chain, e);
      } catch (err) {
        console.warn('[solrift] token: reconcile failed for', e.id, err instanceof Error ? err.message : err);
      }
    }
  }

  private async settle(chain: TokenChain, e: LedgerEntry): Promise<void> {
    if (!e.signature) {
      if (this.now() - e.updatedAt > UNSENT_AFTER_MS) this.repo.updateWithdraw(e.id, { status: 'failed', note: 'never sent' }, this.now());
      return;
    }
    let state = await chain.signatureStatus(e.signature);
    if (state === 'unknown' && e.lastValid !== null && (await chain.blockHeight()) > e.lastValid) {
      state = await chain.signatureStatus(e.signature); // one last look: it may have landed at the very end
      if (state === 'unknown') {
        this.repo.updateWithdraw(e.id, { status: 'failed', note: 'expired' }, this.now());
        return;
      }
    }
    if (state === 'confirmed') this.repo.updateWithdraw(e.id, { status: 'done' }, this.now());
    else if (state === 'failed') this.repo.updateWithdraw(e.id, { status: 'failed', note: 'failed on chain' }, this.now());
  }

  /** Settle what a restart left behind, then keep looking every half minute. */
  start(): void {
    if (this.timer || !this.chain) return;
    void this.reconcile();
    this.timer = setInterval(() => void this.reconcile(), 30_000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

const viewOf = (e: LedgerEntry): LedgerView => ({
  id: e.id,
  kind: e.kind,
  label: e.kind === 'withdraw' ? 'Withdrawal' : e.kind === 'spend' || e.kind === 'trade' || e.kind === 'fee' ? (e.note ?? 'Purchase') : e.ref.startsWith('clear:') ? 'Hollow Deep cleared' : (ACHIEVEMENT_BY_ID.get(e.ref)?.name ?? 'Achievement'),
  amount: e.amount,
  status: e.status,
  signature: e.signature,
  at: e.createdAt,
});

// ---- HTTP ---------------------------------------------------------------------------------------------------

/** Serves `/token/*`: `GET info` (public), `GET me` (signed in), `POST withdraw`, `POST buy`. Returns false for other URLs. */
export function createTokenRouter(auth: AuthService, token: TokenService, opts: { trustProxy: boolean; withdrawsPerMinute?: number }) {
  const hits = new Map<string, { count: number; reset: number }>();
  const limit = opts.withdrawsPerMinute ?? 10;
  const limited = (req: IncomingMessage): boolean => {
    const fwd = opts.trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '';
    const key = fwd || req.socket.remoteAddress || 'unknown';
    const t = Date.now();
    const h = hits.get(key);
    if (!h || h.reset <= t) {
      if (hits.size > 5000) hits.clear();
      hits.set(key, { count: 1, reset: t + 60_000 });
      return false;
    }
    return ++h.count > limit;
  };

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (!url.pathname.startsWith('/token/')) return false;
    const cookie = readCookie(req.headers.cookie, SESSION_COOKIE);
    try {
      if (req.method === 'GET' && url.pathname === '/token/info') {
        json(res, 200, await token.info());
        return true;
      }
      if (req.method === 'GET' && url.pathname === '/token/economy') {
        json(res, 200, token.economy());
        return true;
      }
      if (req.method === 'GET' && url.pathname === '/token/me') {
        const account = auth.resolve(cookie);
        if (!account) throw new AuthError(401, 'sign in first');
        json(res, 200, token.me(account.wallet));
        return true;
      }
      if (req.method === 'POST' && url.pathname === '/token/withdraw') {
        // Browsers always send Origin on cross-site POSTs; requiring a known one blocks CSRF (as for /auth).
        const origin = req.headers.origin;
        if (!auth.isAllowedOrigin(origin)) throw new AuthError(403, 'origin not allowed');
        if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) throw new AuthError(415, 'expected application/json');
        const account = auth.resolve(cookie);
        if (!account) throw new AuthError(401, 'sign in first');
        if (limited(req)) throw new AuthError(429, 'too many requests');
        const body = (await readBody(req)) as Record<string, unknown>;
        const result = await token.withdraw(account.wallet, account.id, body?.amount);
        json(res, 200, { ...result, me: token.me(account.wallet) });
        return true;
      }
      if (req.method === 'POST' && url.pathname === '/token/buy') {
        const origin = req.headers.origin;
        if (!auth.isAllowedOrigin(origin)) throw new AuthError(403, 'origin not allowed');
        if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) throw new AuthError(415, 'expected application/json');
        const account = auth.resolve(cookie);
        if (!account) throw new AuthError(401, 'sign in first');
        if (limited(req)) throw new AuthError(429, 'too many requests');
        const body = (await readBody(req)) as Record<string, unknown>;
        const bought = token.buy(account.wallet, account.id, body?.sku);
        json(res, 200, { ...bought, me: token.me(account.wallet), account: auth.view(account) });
        return true;
      }
      throw new AuthError(404, 'not found');
    } catch (err) {
      if (err instanceof AuthError || err instanceof TokenError) json(res, err.status, { error: err.message });
      else {
        console.error('[token] unexpected error', err);
        json(res, 500, { error: 'internal error' });
      }
      return true;
    }
  };
}
