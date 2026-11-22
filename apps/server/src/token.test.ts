import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, ACH_TIERS, base58Encode, lookCode, type NetServerMessage } from '@solrift/shared';
import { MAX_CHARACTERS, SqliteRepo } from './db';
import { GameRoom } from './room';
import { MemoryRoomStore } from './roomStore';
import { createGameServer, type GameServer } from './server';
import { NO_TOKEN, TokenService, formatUnits, tokenConfigFromEnv, type TokenConfig } from './token';
import { MockChain, TokenError } from './tokenChain';

const ORIGIN = 'http://localhost:3000';
const MINT = base58Encode(new Uint8Array(32).fill(7));
const DAY = 24 * 60 * 60 * 1000;
const T0 = 20_000 * DAY + 5 * 60 * 60 * 1000; // five in the morning, UTC

const cfg = (over: Partial<TokenConfig> = {}): TokenConfig => ({ mint: MINT, cluster: 'devnet', rpcUrl: 'http://rpc.invalid', dailyPool: 10_000, walletDailyReward: 10_000, minWithdraw: 10, walletDailyWithdraw: 10_000, clearRewards: [20, 10, 5, 3, 2], slotPrices: [100, 250], bountyRewards: [3, 6, 12], keyPrice: 15, stashPrices: [], outfitPrices: [], ...over });

const achOf = (tier: 'bronze' | 'silver' | 'gold' | 'mythic', n = 0) => ACHIEVEMENTS.filter((a) => a.tier === tier)[n];

function make(over: Partial<TokenConfig> = {}, chain: MockChain | null = new MockChain()) {
  let t = T0;
  const repo = new SqliteRepo(':memory:');
  const svc = new TokenService(repo.tokens, cfg(over), chain, () => t);
  return { repo, svc, chain: chain as MockChain, advance: (ms: number) => (t += ms), now: () => t };
}

const fails = async (p: Promise<unknown>, status: number, message?: RegExp) => {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(TokenError);
    expect((err as TokenError).status).toBe(status);
    if (message) expect((err as TokenError).message).toMatch(message);
    return;
  }
  throw new Error(`expected a ${status} failure`);
};

describe('the token is off until there is a mint', () => {
  it('pays nothing, shows nothing, and refuses withdrawals', async () => {
    const repo = new SqliteRepo(':memory:');
    const svc = new TokenService(repo.tokens, NO_TOKEN, null);
    expect(svc.live).toBe(false);
    expect(svc.reward('W1', 'a1', achOf('gold').id)).toBe(0);
    expect(svc.balance('W1')).toBe(0);
    const info = await svc.info();
    expect(info).toMatchObject({ live: false, mint: null, decimals: null, supply: null, withdrawals: false, explorer: null });
    await fails(svc.withdraw('W1', 'a1', 50), 503, /not live/);
  });

  it('is configured from the environment, and half a setup is an error rather than a guess', () => {
    expect(tokenConfigFromEnv({}).mint).toBeNull();
    expect(tokenConfigFromEnv({ TOKEN_MINT: MINT, SOLANA_CLUSTER: 'devnet' })).toMatchObject({ mint: MINT, cluster: 'devnet', rpcUrl: 'https://api.devnet.solana.com' });
    expect(tokenConfigFromEnv({ TOKEN_MINT: MINT, SOLANA_CLUSTER: 'mainnet-beta', SOLANA_RPC_URL: 'https://rpc.example' }).rpcUrl).toBe('https://rpc.example');
    expect(() => tokenConfigFromEnv({ TOKEN_MINT: MINT })).toThrow(/SOLANA_CLUSTER/);
    expect(() => tokenConfigFromEnv({ TOKEN_MINT: MINT, SOLANA_CLUSTER: 'moon' })).toThrow(/SOLANA_CLUSTER/);
    expect(() => tokenConfigFromEnv({ TOKEN_MINT: 'not-an-address', SOLANA_CLUSTER: 'devnet' })).toThrow(/valid Solana address/);
    expect(() => tokenConfigFromEnv({ TOKEN_DAILY_POOL: '-5' })).toThrow(/TOKEN_DAILY_POOL/);
    expect(tokenConfigFromEnv({ TOKEN_DAILY_POOL: '123' }).dailyPool).toBe(123);
  });

  it('formats supplies', () => {
    expect(formatUnits(1_000_000_000n * 10n ** 6n, 6)).toBe('1,000,000,000');
    expect(formatUnits(1_234_567_500n, 3)).toBe('1,234,567.5');
    expect(formatUnits(42n, 0)).toBe('42');
  });
});

describe('rewards', () => {
  it('pays the tier of the achievement, once per wallet per achievement', () => {
    const { svc } = make();
    const a = achOf('silver');
    expect(svc.reward('W1', 'char-1', a.id)).toBe(ACH_TIERS.silver.reward);
    expect(svc.balance('W1')).toBe(ACH_TIERS.silver.reward);
    // The same deed again, or by another character of the wallet (a deleted and remade one), pays nothing.
    expect(svc.reward('W1', 'char-1', a.id)).toBe(0);
    expect(svc.reward('W1', 'char-2', a.id)).toBe(0);
    expect(svc.balance('W1')).toBe(ACH_TIERS.silver.reward);
    // Another wallet earns its own; another achievement pays too.
    expect(svc.reward('W2', 'char-9', a.id)).toBe(ACH_TIERS.silver.reward);
    expect(svc.reward('W1', 'char-1', achOf('gold').id)).toBe(ACH_TIERS.gold.reward);
    expect(svc.balance('W1')).toBe(ACH_TIERS.silver.reward + ACH_TIERS.gold.reward);
  });

  it('ignores an achievement that does not exist (the id comes from the session, but it is checked anyway)', () => {
    const { svc } = make();
    expect(svc.reward('W1', 'c', 'made-up')).toBe(0);
    expect(svc.balance('W1')).toBe(0);
  });

  it('stops when the day\'s pool is dry and starts again the next UTC day', () => {
    const { svc, advance } = make({ dailyPool: ACH_TIERS.gold.reward + ACH_TIERS.bronze.reward });
    expect(svc.reward('W1', 'c', achOf('gold').id)).toBe(ACH_TIERS.gold.reward);
    expect(svc.reward('W2', 'c', achOf('gold').id)).toBe(0); // would overdraw the pool
    expect(svc.reward('W3', 'c', achOf('bronze').id)).toBe(ACH_TIERS.bronze.reward); // a smaller one still fits
    expect(svc.reward('W4', 'c', achOf('bronze').id)).toBe(0);
    advance(DAY);
    expect(svc.reward('W2', 'c', achOf('gold').id)).toBe(ACH_TIERS.gold.reward);
  });

  it('caps what one wallet can be paid in a day', () => {
    const { svc, advance } = make({ walletDailyReward: ACH_TIERS.gold.reward + 1 });
    expect(svc.reward('W1', 'c', achOf('gold', 0).id)).toBe(ACH_TIERS.gold.reward);
    expect(svc.reward('W1', 'c', achOf('gold', 1).id)).toBe(0);
    expect(svc.reward('W2', 'c', achOf('gold', 1).id)).toBe(ACH_TIERS.gold.reward);
    advance(DAY);
    expect(svc.reward('W1', 'c', achOf('gold', 1).id)).toBe(ACH_TIERS.gold.reward);
  });

  it('reports the numbers the page promises to show', async () => {
    const { svc } = make();
    svc.reward('W1', 'c', achOf('gold').id);
    const info = await svc.info();
    expect(info).toMatchObject({ live: true, mint: MINT, cluster: 'devnet', decimals: 6, supply: '1,000,000,000', withdrawals: true });
    expect(info.tiers).toEqual({ bronze: 5, silver: 15, gold: 40, mythic: 120 });
    expect(info.pool).toEqual({ paidToday: 40, paidTotal: 40, withdrawnTotal: 0, spentTotal: 0 });
    expect(info.explorer).toEqual({ token: `https://solscan.io/token/${MINT}?cluster=devnet`, tx: 'https://solscan.io/tx/', suffix: '?cluster=devnet' });
  });
});

describe('withdrawals', () => {
  const fund = (svc: TokenService, wallet: string, n: number) => {
    let paid = 0;
    for (const a of ACHIEVEMENTS) {
      if (paid >= n) break;
      paid += svc.reward(wallet, 'c', a.id);
    }
    expect(paid).toBeGreaterThanOrEqual(n);
    return svc.balance(wallet);
  };

  it('sends the tokens, takes them off the balance and keeps a record', async () => {
    const { svc, chain } = make();
    const bal = fund(svc, 'W1', 100);
    const res = await svc.withdraw('W1', 'c', 60);
    expect(res).toMatchObject({ status: 'done', amount: 60 });
    expect(chain.sent).toEqual([{ to: 'W1', baseUnits: 60_000_000n, signature: res.signature }]); // 6 decimals
    expect(svc.balance('W1')).toBe(bal - 60);
    const me = svc.me('W1');
    expect(me.pending).toBeNull();
    expect(me.history[0]).toMatchObject({ kind: 'withdraw', amount: -60, status: 'done', signature: res.signature });
    expect(me.history.some((h) => h.kind === 'reward' && h.label.length > 0)).toBe(true);
    expect((await svc.info()).pool.withdrawnTotal).toBe(60);
  });

  it('refuses anything that is not a sensible whole amount, or more than you have', async () => {
    const { svc, chain } = make({ minWithdraw: 20 });
    const bal = fund(svc, 'W1', 100);
    for (const bad of [0, -5, 1.5, NaN, Infinity, '50', null, undefined, {}, [50]]) await fails(svc.withdraw('W1', 'c', bad), 400);
    await fails(svc.withdraw('W1', 'c', 19), 400, /least you can withdraw is 20/);
    await fails(svc.withdraw('W1', 'c', bal + 1), 400, /do not have that many/);
    await fails(svc.withdraw('W-nobody', 'c', 20), 400, /do not have that many/);
    expect(chain.sent).toHaveLength(0);
    expect(svc.balance('W1')).toBe(bal);
  });

  it('enforces a daily limit per wallet', async () => {
    const { svc, advance } = make({ walletDailyWithdraw: 50 });
    fund(svc, 'W1', 200);
    await svc.withdraw('W1', 'c', 30);
    await fails(svc.withdraw('W1', 'c', 30), 429, /most one wallet can withdraw/);
    await svc.withdraw('W1', 'c', 20);
    expect(svc.me('W1').withdrawableToday).toBe(0);
    advance(DAY);
    expect(svc.me('W1').withdrawableToday).toBe(50);
    await svc.withdraw('W1', 'c', 30);
  });

  it('cannot be raced: two at once is one withdrawal and one refusal, never a double spend', async () => {
    const { svc, chain } = make();
    fund(svc, 'W1', 100);
    const bal = svc.balance('W1');
    const [a, b] = await Promise.allSettled([svc.withdraw('W1', 'c', bal), svc.withdraw('W1', 'c', bal)]);
    expect([a.status, b.status].sort()).toEqual(['fulfilled', 'rejected']);
    expect(chain.sent).toHaveLength(1);
    expect(svc.balance('W1')).toBe(0);
  });

  it('is closed when no treasury is set up', async () => {
    const { svc } = make({}, Object.assign(new MockChain(), { canSend: false }));
    fund(svc, 'W1', 50);
    await fails(svc.withdraw('W1', 'c', 20), 503, /not open yet/);
    expect((await svc.info()).withdrawals).toBe(false);
    const none = make({}, null);
    fund(none.svc, 'W1', 50);
    await fails(none.svc.withdraw('W1', 'c', 20), 503, /not open yet/);
  });

  it('puts the tokens back when the transfer could not even be set up (an empty treasury)', async () => {
    const { svc, chain } = make();
    const bal = fund(svc, 'W1', 100);
    chain.failPrepare = new TokenError(503, 'The reward treasury is empty right now.');
    await fails(svc.withdraw('W1', 'c', 50), 503, /treasury is empty/);
    expect(svc.balance('W1')).toBe(bal);
    expect(svc.me('W1').pending).toBeNull();
    chain.failPrepare = null;
    await svc.withdraw('W1', 'c', 50); // and it works again
    expect(svc.balance('W1')).toBe(bal - 50);
  });

  it('keeps a withdrawal pending when the answer is lost, then settles it by what the chain says', async () => {
    const { svc, chain } = make();
    const bal = fund(svc, 'W1', 100);
    chain.failSend = 'before';
    const res = await svc.withdraw('W1', 'c', 40);
    chain.failSend = null;
    expect(res.status).toBe('pending');
    expect(svc.balance('W1')).toBe(bal - 40); // still held while it is unknown
    await fails(svc.withdraw('W1', 'c', 20), 409, /on its way/);
    expect(svc.me('W1').pending).toEqual({ amount: 40, signature: res.signature });

    // It lands late: the reconciler marks it done and the balance stays down.
    chain.land(res.signature);
    await svc.reconcile();
    expect(svc.me('W1').pending).toBeNull();
    expect(svc.balance('W1')).toBe(bal - 40);
    expect(svc.me('W1').history[0]).toMatchObject({ kind: 'withdraw', status: 'done' });
  });

  it('releases a withdrawal that can no longer land, and only then', async () => {
    const { svc, chain } = make();
    const bal = fund(svc, 'W1', 100);
    chain.failSend = 'before';
    const res = await svc.withdraw('W1', 'c', 40);
    chain.failSend = null;

    await svc.reconcile(); // not on chain, but it could still land: wait
    expect(svc.balance('W1')).toBe(bal - 40);
    chain.height += 1000; // past its last valid block, and still not there
    await svc.reconcile();
    expect(svc.balance('W1')).toBe(bal);
    expect(svc.me('W1').pending).toBeNull();
    expect(chain.sent).toHaveLength(0);
    expect(res.status).toBe('pending');
  });

  it('settles a transfer that landed although the confirmation was lost, straight away', async () => {
    const { svc, chain } = make();
    const bal = fund(svc, 'W1', 100);
    chain.failSend = 'after';
    const res = await svc.withdraw('W1', 'c', 40);
    expect(res.status).toBe('done');
    expect(svc.balance('W1')).toBe(bal - 40);
    expect(chain.sent).toHaveLength(1);
  });

  it('does not touch a withdrawal that this process is still working on, and frees one that was never signed', async () => {
    const { svc, repo, advance } = make();
    const bal = fund(svc, 'W1', 100);
    const id = repo.tokens.insertWithdraw({ wallet: 'W1', accountId: 'c', ref: 'x', amount: 30, now: T0 });
    expect(repo.tokens.balance('W1')).toBe(bal - 30);
    await svc.reconcile(); // too soon to say it was never sent
    expect(repo.tokens.get(id)!.status).toBe('pending');
    advance(3 * 60 * 1000);
    await svc.reconcile();
    expect(repo.tokens.get(id)!.status).toBe('failed');
    expect(repo.tokens.balance('W1')).toBe(bal);
  });
});

describe('the ledger survives a restart', () => {
  it('keeps balances and settles what was pending', async () => {
    const dir = await import('node:fs').then((fs) => fs.mkdtempSync(`${(process.env.TMPDIR ?? '/tmp').replace(/\/$/, '')}/solrift-token-`));
    const file = `${dir}/db.sqlite`;
    try {
      const one = new SqliteRepo(file);
      const chain = new MockChain();
      const svc1 = new TokenService(one.tokens, cfg(), chain);
      svc1.reward('W1', 'c', achOf('gold').id);
      chain.failSend = 'before';
      const res = await svc1.withdraw('W1', 'c', 40);
      expect(res.status).toBe('pending');
      one.close();

      const two = new SqliteRepo(file);
      const svc2 = new TokenService(two.tokens, cfg(), chain);
      expect(svc2.balance('W1')).toBe(0);
      chain.land(res.signature);
      await svc2.reconcile();
      expect(svc2.me('W1').history[0]).toMatchObject({ kind: 'withdraw', status: 'done' });
      two.close();
    } finally {
      await import('node:fs').then((fs) => fs.rmSync(dir, { recursive: true, force: true }));
    }
  });
});

// ---- dungeon clears: the schedule ---------------------------------------------------------------------------

describe('dungeon clears pay a schedule through the day', () => {
  it('pays 20, 10, 5, 3, 2 and then nothing for the rest of the UTC day, and starts over tomorrow', () => {
    const { svc, repo, advance } = make();
    expect([1, 2, 3, 4, 5, 6, 7].map(() => svc.rewardClear('W1', 'a1'))).toEqual([20, 10, 5, 3, 2, 0, 0]);
    expect(svc.balance('W1')).toBe(40);
    advance(DAY);
    expect(svc.rewardClear('W1', 'a1')).toBe(20);
    expect(repo.tokens.history('W1', 50).filter((e) => e.ref.startsWith('clear:')).length).toBe(6);
    // Another wallet has a schedule of its own.
    expect(svc.rewardClear('W2', 'a2')).toBe(20);
  });

  it('is a ledger row per clear, named for what it is', () => {
    const { svc } = make();
    svc.rewardClear('W1', 'a1');
    expect(svc.me('W1').history[0]).toMatchObject({ kind: 'reward', label: 'Hollow Deep cleared', amount: 20 });
  });

  it('stays inside the pool and the wallet cap, and counts against both', () => {
    const capped = make({ walletDailyReward: 25 });
    expect(capped.svc.rewardClear('W1', 'a1')).toBe(20);
    expect(capped.svc.rewardClear('W1', 'a1')).toBe(0); // 20 + 10 > 25
    expect(capped.svc.balance('W1')).toBe(20);

    const dry = make({ dailyPool: 25 });
    expect(dry.svc.rewardClear('W1', 'a1')).toBe(20);
    expect(dry.svc.rewardClear('W2', 'a2')).toBe(0); // the pool has 5 left
    // An achievement and a clear draw from the same pool.
    expect(dry.svc.reward('W3', 'a3', achOf('bronze').id)).toBe(5);
    expect(dry.repo.tokens.sumSince('reward', T0)).toBe(25);
  });

  it('two clears landing together cannot take the same slot', () => {
    const { repo, svc, now } = make();
    // A stale count (another clear just took slot 0 and ours has not seen it yet): the one-row-per-ref rule sends us to slot 1.
    const day = new Date(now() - (now() % DAY)).toISOString().slice(0, 10);
    repo.tokens.insertReward({ wallet: 'W1', accountId: 'a1', ref: `clear:${day}:0`, amount: 20, now: now() });
    const stale = new TokenService(new Proxy(repo.tokens, { get: (t, k) => (k === 'countRewards' ? () => 0 : (t as never)[k]) }), cfg(), new MockChain(), now);
    expect(stale.rewardClear('W1', 'a1')).toBe(10);
    expect(repo.tokens.balance('W1')).toBe(30);
  });

  it('can be switched off, and is off with no token', () => {
    expect(make({ clearRewards: [] }).svc.rewardClear('W1', 'a1')).toBe(0);
    const repo = new SqliteRepo(':memory:');
    expect(new TokenService(repo.tokens).rewardClear('W1', 'a1')).toBe(0);
  });

  it('is set from the environment, and a bad list is an error', () => {
    expect(tokenConfigFromEnv({}).clearRewards).toEqual([20, 10, 5, 3, 2]);
    expect(tokenConfigFromEnv({ TOKEN_CLEAR_REWARDS: '30, 15' }).clearRewards).toEqual([30, 15]);
    expect(tokenConfigFromEnv({ TOKEN_CLEAR_REWARDS: 'off' }).clearRewards).toEqual([]);
    for (const bad of ['0', '5,-1', '2.5', 'lots', '5,,3']) expect(() => tokenConfigFromEnv({ TOKEN_CLEAR_REWARDS: bad })).toThrow(/TOKEN_CLEAR_REWARDS/);
  });
});

// ---- the room: who gets paid ----------------------------------------------------------------------------

describe('achievements in the room', () => {
  class Client {
    messages: NetServerMessage[] = [];
    id = 0;
    conn = { send: (m: NetServerMessage) => this.messages.push(m), close: () => {} };
    join(room: GameRoom, name: string, account: string | null, wallet: string | null) {
      this.id = room.join(this.conn, name, account, null, 'warrior', wallet)!;
      return this;
    }
    notices() {
      return this.messages.flatMap((m) => (m.t === 'notice' ? [m.text] : []));
    }
  }
  const open = (opts: Partial<ConstructorParameters<typeof GameRoom>[0]>, svc: TokenService) =>
    new GameRoom({ seed: 1, kind: 'adventure', naturalSpawning: false, store: new MemoryRoomStore(), onAchievement: (e) => svc.reward(e.wallet, e.account, e.id), onClear: (e) => svc.rewardClear(e.wallet, e.account), ...opts });

  it('pays a signed-in wallet when it wins one, and tells it', () => {
    const { svc } = make();
    const room = open({}, svc);
    const c = new Client().join(room, 'ann', 'char-ann', 'W1');
    room.player(c.id)!.achAdd('quests', 1); // "Helping Hand", bronze
    room.tick();
    expect(svc.balance('W1')).toBe(ACH_TIERS.bronze.reward);
    expect(c.notices().some((t) => t.includes(`+${ACH_TIERS.bronze.reward} $SOLRIFT`))).toBe(true);
    room.tick();
    expect(svc.balance('W1')).toBe(ACH_TIERS.bronze.reward); // once
  });

  it('pays nothing to a guest, on a cheats server, or in creative mode', () => {
    const guest = make();
    const room = open({}, guest.svc);
    const g = new Client().join(room, 'guest', null, null);
    room.player(g.id)!.achAdd('quests', 1);
    room.tick();
    expect(guest.repo.tokens.total('reward')).toBe(0);

    const cheats = make();
    const cheatRoom = open({ cheats: true }, cheats.svc);
    const c = new Client().join(cheatRoom, 'cheater', 'char-c', 'W2');
    cheatRoom.player(c.id)!.achAdd('quests', 1);
    cheatRoom.tick();
    expect(cheats.svc.balance('W2')).toBe(0);

    const creative = make();
    const creativeRoom = open({ mode: 'creative' }, creative.svc);
    const k = new Client().join(creativeRoom, 'builder', 'char-k', 'W3');
    creativeRoom.player(k.id)!.achAdd('quests', 1);
    creativeRoom.tick();
    expect(creative.svc.balance('W3')).toBe(0);
  });

  it('pays nothing while there is no token, and the game goes on', () => {
    const repo = new SqliteRepo(':memory:');
    const svc = new TokenService(repo.tokens);
    const room = open({}, svc);
    const c = new Client().join(room, 'ann', 'char-ann', 'W1');
    room.player(c.id)!.achAdd('quests', 1);
    room.tick();
    expect(repo.tokens.total('reward')).toBe(0);
    expect(c.notices().some((t) => t.includes('SOLRIFT'))).toBe(false);
  });

  it('survives a payout that throws', () => {
    const room = open({ onAchievement: () => { throw new Error('disk full'); } }, make().svc);
    const c = new Client().join(room, 'ann', 'char-ann', 'W1');
    room.player(c.id)!.achAdd('quests', 1);
    expect(() => room.tick()).not.toThrow();
  });

  describe('a dungeon clear', () => {
    const KING = { kind: 'hollow_king', elite: false, def: { hostile: true, boss: true } };
    const hit = (room: GameRoom, id: number, taken = false) => room.player(id)!.emit({ t: 'dmg', x: 0, y: 0, z: 0, amount: 4, ...(taken ? { taken: true } : {}) });

    it('pays the player who fought, and tells them', () => {
      const { svc } = make();
      const room = open({}, svc);
      const c = new Client().join(room, 'ann', 'char-ann', 'W1');
      hit(room, c.id);
      room.player(c.id)!.achKill(KING);
      room.tick();
      // 20 for the clear, and the achievements the first boss and the first clear win (Silver, Silver)
      expect(svc.balance('W1')).toBe(20 + 2 * ACH_TIERS.silver.reward);
      expect(c.notices().some((t) => t.includes('+20 $SOLRIFT') && t.includes('the Hollow Deep'))).toBe(true);
    });

    it('pays nothing to someone standing near who never hit anything, or who only took hits, or who stopped long ago', () => {
      const { svc } = make();
      const room = open({}, svc);
      const idle = new Client().join(room, 'idle', 'char-idle', 'W1');
      room.player(idle.id)!.achKill(KING);
      room.tick();
      expect(svc.balance('W1')).toBe(2 * ACH_TIERS.silver.reward); // the achievements only

      const hurt = new Client().join(room, 'hurt', 'char-hurt', 'W2');
      hit(room, hurt.id, true);
      room.player(hurt.id)!.achKill(KING);
      room.tick();
      expect(svc.balance('W2')).toBe(2 * ACH_TIERS.silver.reward);

      const late = new Client().join(room, 'late', 'char-late', 'W3');
      hit(room, late.id);
      room.tick();
      room.tickCount += 61 * room.tickHz; // a minute and a second later
      room.player(late.id)!.achKill(KING);
      room.tick();
      expect(svc.balance('W3')).toBe(2 * ACH_TIERS.silver.reward);
    });

    it('follows the day\'s schedule across clears, and is not paid to a guest, a cheats server or creative mode', () => {
      const { svc } = make();
      const room = open({}, svc);
      const c = new Client().join(room, 'ann', 'char-ann', 'W1');
      const clear = () => {
        hit(room, c.id);
        room.player(c.id)!.achKill(KING);
        room.tick();
      };
      clear();
      const afterFirst = svc.balance('W1');
      clear();
      expect(svc.balance('W1') - afterFirst).toBe(10);

      const guest = make();
      const guestRoom = open({}, guest.svc);
      const g = new Client().join(guestRoom, 'guest', null, null);
      hit(guestRoom, g.id);
      guestRoom.player(g.id)!.achKill(KING);
      guestRoom.tick();
      expect(guest.repo.tokens.total('reward')).toBe(0);

      const cheats = make();
      const cheatRoom = open({ cheats: true }, cheats.svc);
      const k = new Client().join(cheatRoom, 'cheater', 'char-k', 'W2');
      hit(cheatRoom, k.id);
      cheatRoom.player(k.id)!.achKill(KING);
      cheatRoom.tick();
      expect(cheats.repo.tokens.total('reward')).toBe(0);

      const creative = make();
      const creativeRoom = open({ mode: 'creative' }, creative.svc);
      const b = new Client().join(creativeRoom, 'builder', 'char-b', 'W3');
      hit(creativeRoom, b.id);
      creativeRoom.player(b.id)!.achKill(KING);
      creativeRoom.tick();
      expect(creative.repo.tokens.total('reward')).toBe(0);
    });
  });
});

// ---- over HTTP ------------------------------------------------------------------------------------------

function newWallet() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = (publicKey as KeyObject).export({ format: 'der', type: 'spki' }).subarray(-32);
  return { address: base58Encode(new Uint8Array(raw)), sign: (m: string) => sign(null, Buffer.from(m, 'utf8'), privateKey).toString('base64') };
}

describe('/token over HTTP', () => {
  let server: GameServer;
  let chain: MockChain;
  let base: string;

  beforeAll(async () => {
    chain = new MockChain();
    server = createGameServer({ seed: 1, origins: [ORIGIN], rateLimitPerMinute: 1000, token: (repo) => new TokenService(repo.tokens, cfg(), chain) });
    base = `http://127.0.0.1:${await server.listen(0)}`;
  });
  afterAll(() => server.close());

  const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(base + url, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

  async function login() {
    const w = newWallet();
    const ch = await (await post('/auth/challenge', { address: w.address })).json();
    const res = await post('/auth/verify', { message: ch.message, signature: w.sign(ch.message) });
    return { wallet: w.address, cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] };
  }

  it('publishes what the token page needs without signing in', async () => {
    const res = await fetch(base + '/token/info');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toMatchObject({ live: true, mint: MINT, decimals: 6, supply: '1,000,000,000', withdrawals: true });
  });

  it('a server with no token says so', async () => {
    const bare = createGameServer({ seed: 1, origins: [ORIGIN] });
    const p = await bare.listen(0);
    try {
      expect(await (await fetch(`http://127.0.0.1:${p}/token/info`)).json()).toMatchObject({ live: false, mint: null, supply: null });
    } finally {
      await bare.close();
    }
  });

  it('shows a signed-in wallet its balance and history, and nobody else\'s', async () => {
    expect((await fetch(base + '/token/me')).status).toBe(401);
    const a = await login();
    const b = await login();
    server.token.reward(a.wallet, 'x', achOf('gold').id);
    const mine = await (await fetch(base + '/token/me', { headers: { cookie: a.cookie } })).json();
    expect(mine.balance).toBe(ACH_TIERS.gold.reward);
    expect(mine.history[0]).toMatchObject({ kind: 'reward', amount: ACH_TIERS.gold.reward, status: 'ok' });
    expect((await (await fetch(base + '/token/me', { headers: { cookie: b.cookie } })).json()).balance).toBe(0);
  });

  it('withdraws to the wallet that is signed in, and only with a good request', async () => {
    const a = await login();
    server.token.reward(a.wallet, 'x', achOf('mythic').id);
    server.token.reward(a.wallet, 'x', achOf('gold').id);
    const bal = server.token.balance(a.wallet);

    expect((await post('/token/withdraw', { amount: 20 }, { origin: 'https://evil.example', cookie: a.cookie })).status).toBe(403);
    expect((await fetch(base + '/token/withdraw', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"amount":20}' })).status).toBe(403);
    expect((await post('/token/withdraw', { amount: 20 })).status).toBe(401);
    expect((await post('/token/withdraw', 'x', { 'content-type': 'text/plain', cookie: a.cookie })).status).toBe(415);
    expect((await post('/token/withdraw', '{nope', { cookie: a.cookie })).status).toBe(400);
    expect((await post('/token/withdraw', { amount: 'all' }, { cookie: a.cookie })).status).toBe(400);
    expect((await post('/token/withdraw', { amount: bal + 1 }, { cookie: a.cookie })).status).toBe(400);
    expect((await fetch(base + '/token/withdraw', { headers: { cookie: a.cookie } })).status).toBe(404);
    expect(chain.sent.filter((s) => s.to === a.wallet)).toHaveLength(0);

    const ok = await post('/token/withdraw', { amount: 100 }, { cookie: a.cookie });
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body).toMatchObject({ status: 'done', amount: 100 });
    expect(body.me.balance).toBe(bal - 100);
    // The recipient is the signed-in wallet: there is no way to name another address.
    expect(chain.sent.filter((s) => s.to === a.wallet)).toHaveLength(1);
    expect(chain.sent.at(-1)).toMatchObject({ to: a.wallet, baseUnits: 100_000_000n });
  });
});

// ---- spending ---------------------------------------------------------------------------------------------

/** A wallet that has this many tokens to spend (the daily caps are set high so that rewards alone can fill it). */
const fund = (svc: TokenService, wallet: string, tokens: number): void => {
  let n = 0;
  for (const a of ACHIEVEMENTS) {
    if (svc.balance(wallet) >= tokens) return;
    svc.reward(wallet, 'acc', a.id);
    n++;
  }
  if (svc.balance(wallet) < tokens) throw new Error(`could not fund ${tokens} (${n} achievements gave ${svc.balance(wallet)})`);
};

describe('spending $SOLRIFT on hero slots', () => {
  it('sells nothing while the token is off, or when no slots are set for sale', () => {
    const repo = new SqliteRepo(':memory:');
    expect(new TokenService(repo.tokens, NO_TOKEN, null).shop('W1')).toEqual([]);
    expect(make({ slotPrices: [], keyPrice: 0 }).svc.shop('W1')).toEqual([]);
    expect(make({ slotPrices: [] }).svc.shop('W1').map((i) => i.sku)).toEqual(['hollow-key']); // (the key is a shop of its own)
    expect(() => make({ slotPrices: [] }).svc.buy('W1', 'a', 'hero-slot')).toThrow(/not for sale/);
    expect(() => new TokenService(repo.tokens, NO_TOKEN, null).buy('W1', 'a', 'hero-slot')).toThrow(/not live/);
  });

  it('prices each slot in turn, takes the tokens, and records what they bought', () => {
    const { svc } = make();
    fund(svc, 'W1', 400);
    const before = svc.balance('W1');
    expect(svc.shop('W1')[0]).toEqual({ sku: 'hero-slot', name: 'Hero slot', blurb: expect.any(String), owned: 0, max: 2, consumable: false, price: 100 });

    expect(svc.buy('W1', 'acc', 'hero-slot')).toEqual({ sku: 'hero-slot', name: 'Hero slot', price: 100 });
    expect(svc.balance('W1')).toBe(before - 100);
    expect(svc.shop('W1')[0]).toMatchObject({ owned: 1, price: 250 });

    svc.buy('W1', 'acc', 'hero-slot');
    expect(svc.balance('W1')).toBe(before - 350);
    expect(svc.shop('W1')[0]).toMatchObject({ owned: 2, price: null });
    expect(svc.me('W1').history.slice(0, 2)).toMatchObject([
      { kind: 'spend', label: 'Hero slot', amount: -250, status: 'ok' },
      { kind: 'spend', label: 'Hero slot', amount: -100, status: 'ok' },
    ]);
  });

  it('stops when every slot is bought, and charges nothing for the refusal', () => {
    const { svc } = make();
    fund(svc, 'W1', 600);
    svc.buy('W1', 'acc', 'hero-slot');
    svc.buy('W1', 'acc', 'hero-slot');
    const left = svc.balance('W1');
    expect(() => svc.buy('W1', 'acc', 'hero-slot')).toThrow(/every hero slot/);
    expect(svc.balance('W1')).toBe(left);
  });

  it('refuses what cannot be paid, says what is missing, and writes nothing', () => {
    const { svc } = make();
    fund(svc, 'W1', 30);
    const had = svc.balance('W1');
    const rows = svc.me('W1').history.length;
    let err: unknown;
    try {
      svc.buy('W1', 'acc', 'hero-slot');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(TokenError);
    expect((err as TokenError).status).toBe(400);
    expect((err as TokenError).message).toMatch(new RegExp(`costs 100 \\$SOLRIFT. You have ${had}`));
    expect(svc.balance('W1')).toBe(had);
    expect(svc.me('W1').history).toHaveLength(rows);
    expect(svc.shop('W1')[0].owned).toBe(0);
  });

  it('does not sell anything it does not know, or for a wallet that has nothing', () => {
    const { svc } = make();
    expect(() => svc.buy('W1', 'acc', 'sword-of-a-thousand-truths')).toThrow(/not for sale/);
    expect(() => svc.buy('W1', 'acc', { sku: 'hero-slot' })).toThrow(/not for sale/);
    expect(() => svc.buy('W1', 'acc', undefined)).toThrow(/not for sale/);
    expect(() => svc.buy('W2', 'acc', 'hero-slot')).toThrow(/costs 100/);
  });

  it('keeps one wallet\'s purchases to itself', () => {
    const { svc } = make();
    fund(svc, 'W1', 100);
    fund(svc, 'W2', 100);
    svc.buy('W1', 'acc', 'hero-slot');
    expect(svc.shop('W1')[0].owned).toBe(1);
    expect(svc.shop('W2')[0].owned).toBe(0);
    expect(svc.balance('W2')).toBeGreaterThanOrEqual(100);
  });

  it('is not an emission: what is spent never counts against the reward pool, and shows as kept by the treasury', async () => {
    const { svc } = make({ dailyPool: 1000, walletDailyReward: 1000 });
    fund(svc, 'W1', 100);
    const paid = (await svc.info()).pool;
    svc.buy('W1', 'acc', 'hero-slot');
    const after = (await svc.info()).pool;
    expect(after).toMatchObject({ paidToday: paid.paidToday, paidTotal: paid.paidTotal, withdrawnTotal: 0, spentTotal: 100 });
    expect((await svc.info()).limits.slotPrices).toEqual([100, 250]);
  });

  it('lets only what is left be withdrawn', async () => {
    const { svc } = make({ minWithdraw: 1 });
    fund(svc, 'W1', 130);
    svc.buy('W1', 'acc', 'hero-slot');
    const left = svc.balance('W1');
    await fails(svc.withdraw('W1', 'acc', left + 1), 400, /do not have that many/);
    expect((await svc.withdraw('W1', 'acc', left)).status).toBe('done');
    expect(svc.balance('W1')).toBe(0);
  });

  it('is set from the environment', () => {
    expect(tokenConfigFromEnv({}).slotPrices).toEqual([100, 250]);
    expect(tokenConfigFromEnv({ TOKEN_SLOT_PRICES: '50,75,120' }).slotPrices).toEqual([50, 75, 120]);
    expect(tokenConfigFromEnv({ TOKEN_SLOT_PRICES: 'off' }).slotPrices).toEqual([]);
    expect(() => tokenConfigFromEnv({ TOKEN_SLOT_PRICES: '50,free' })).toThrow(/TOKEN_SLOT_PRICES/);
    expect(() => tokenConfigFromEnv({ TOKEN_SLOT_PRICES: '0' })).toThrow(/TOKEN_SLOT_PRICES/);
  });

  it('is written down for good: the slots and the spending survive a restart', () => {
    const dir = mkdtempSync(`${(process.env.TMPDIR ?? '/tmp').replace(/\/$/, '')}/solrift-spend-`);
    const file = `${dir}/db.sqlite`;
    try {
      const one = new SqliteRepo(file);
      const svc1 = new TokenService(one.tokens, cfg(), new MockChain());
      fund(svc1, 'W1', 100);
      svc1.buy('W1', 'acc', 'hero-slot');
      const left = svc1.balance('W1');
      one.close();
      const two = new SqliteRepo(file);
      expect(two.maxCharacters('W1')).toBe(MAX_CHARACTERS + 1);
      expect(two.tokens.balance('W1')).toBe(left);
      expect(new TokenService(two.tokens, cfg(), new MockChain()).shop('W1')[0]).toMatchObject({ owned: 1, price: 250 });
      two.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('a bought slot lets a wallet make another character', () => {
  const make4 = (repo: SqliteRepo, n: number) => {
    const first = repo.upsertAccount('W1', 1);
    for (let i = 0; i < n; i++) repo.createCharacter(first.id, { displayName: `Hero${i}`, look: 1, class: 'warrior' }, 2 + i);
    return first;
  };

  it('three to begin with, a fourth once the slot is bought, and not a fifth', () => {
    const { repo, svc } = make();
    const first = make4(repo, 3);
    expect(repo.maxCharacters('W1')).toBe(3);
    expect(() => repo.createCharacter(first.id, { displayName: 'Fourth', look: 1, class: 'mage' }, 9)).toThrow(/3 characters/);

    fund(svc, 'W1', 100);
    svc.buy('W1', first.id, 'hero-slot');
    expect(repo.maxCharacters('W1')).toBe(4);
    expect(repo.createCharacter(first.id, { displayName: 'Fourth', look: 1, class: 'mage' }, 9)).toMatchObject({ displayName: 'Fourth' });
    expect(() => repo.createCharacter(first.id, { displayName: 'Fifth', look: 1, class: 'mage' }, 10)).toThrow(/4 characters/);
    expect(repo.listCharacters('W1')).toHaveLength(4);
  });

  it('is the wallet\'s: it does not widen anybody else\'s limit, and survives deleting a character', () => {
    const { repo, svc } = make();
    const first = make4(repo, 3);
    fund(svc, 'W1', 100);
    svc.buy('W1', first.id, 'hero-slot');
    expect(repo.maxCharacters('W2')).toBe(3);
    repo.deleteCharacter(repo.listCharacters('W1')[0].id, 20);
    expect(repo.maxCharacters('W1')).toBe(4);
  });
});

describe('/token/buy over HTTP', () => {
  let server: GameServer;
  let base: string;

  beforeAll(async () => {
    server = createGameServer({ seed: 1, origins: [ORIGIN], rateLimitPerMinute: 1000, token: (repo) => new TokenService(repo.tokens, cfg(), new MockChain()) });
    base = `http://127.0.0.1:${await server.listen(0)}`;
  });
  afterAll(() => server.close());

  const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(base + url, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

  async function login() {
    const w = newWallet();
    const ch = await (await post('/auth/challenge', { address: w.address })).json();
    const res = await post('/auth/verify', { message: ch.message, signature: w.sign(ch.message) });
    return { wallet: w.address, cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] };
  }

  const look = lookCode({ skin: 1, hair: 1, style: 1, eyes: 1, shirt: 1, pants: 1 });

  it('only takes a good request from a signed-in player', async () => {
    const a = await login();
    fund(server.token, a.wallet, 100);
    expect((await post('/token/buy', { sku: 'hero-slot' }, { origin: 'https://evil.example', cookie: a.cookie })).status).toBe(403);
    expect((await post('/token/buy', { sku: 'hero-slot' })).status).toBe(401);
    expect((await post('/token/buy', 'x', { 'content-type': 'text/plain', cookie: a.cookie })).status).toBe(415);
    expect((await post('/token/buy', '{nope', { cookie: a.cookie })).status).toBe(400);
    expect((await post('/token/buy', { sku: 'nothing' }, { cookie: a.cookie })).status).toBe(404);
    expect((await fetch(base + '/token/buy', { headers: { cookie: a.cookie } })).status).toBe(404);
    expect(server.token.balance(a.wallet)).toBeGreaterThanOrEqual(100);
    expect(server.token.shop(a.wallet)[0].owned).toBe(0);
  });

  it('says plainly when the balance is short', async () => {
    const a = await login();
    const res = await post('/token/buy', { sku: 'hero-slot' }, { cookie: a.cookie });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/costs 100 \$SOLRIFT. You have 0/);
  });

  it('sells a slot, and the character screen then offers a fourth character', async () => {
    const a = await login();
    for (const name of ['Alpha', 'Bravo', 'Charlie']) expect((await post('/auth/character', { displayName: name, class: 'warrior', look }, { cookie: a.cookie })).status).toBe(200);
    expect((await post('/auth/character', { displayName: 'Delta', class: 'warrior', look }, { cookie: a.cookie })).status).toBe(409);

    fund(server.token, a.wallet, 100);
    const had = server.token.balance(a.wallet);
    const res = await post('/token/buy', { sku: 'hero-slot' }, { cookie: a.cookie });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ sku: 'hero-slot', price: 100 });
    expect(body.me.balance).toBe(had - 100);
    expect(body.me.shop[0]).toMatchObject({ owned: 1, price: 250 });
    expect(body.account.maxCharacters).toBe(4);
    expect((await (await fetch(base + '/auth/me', { headers: { cookie: a.cookie } })).json()).account.maxCharacters).toBe(4);

    expect((await post('/auth/character', { displayName: 'Delta', class: 'warrior', look }, { cookie: a.cookie })).status).toBe(200);
    const full = await post('/auth/character', { displayName: 'Echo', class: 'warrior', look }, { cookie: a.cookie });
    expect(full.status).toBe(409);
    expect((await full.json()).error).toMatch(/4 characters/);
  });
});

describe('the economy page', () => {
  it('shows nothing but zeros, over a full run of days, before anything happens', () => {
    const { svc } = make();
    const e = svc.economy();
    expect(e.days).toHaveLength(14);
    expect(e.days[13].day).toBe(new Date(T0).toISOString().slice(0, 10));
    expect(e.days.every((d) => d.earned === 0 && d.spent === 0 && d.withdrawn === 0 && d.sales === 0)).toBe(true);
    expect(e).toMatchObject({ held: { tokens: 0, wallets: 0 }, earners7d: 0, returnedPct: null, totals: { earned: { total: 0 }, spent: { total: 0, fees: 0 }, withdrawn: 0 } });
  });

  it('adds up what comes in, what goes back to the treasury, what leaves, and what players hold', async () => {
    const { svc, advance } = make();
    const a = achOf('gold');
    // two days ago: ann earns an achievement
    advance(-2 * DAY);
    svc.reward('W-ann', 'c-ann', a.id);
    advance(2 * DAY);
    // today: ann clears a dungeon, bob earns an achievement
    svc.rewardClear('W-ann', 'c-ann');
    svc.reward('W-bob', 'c-bob', achOf('silver').id);
    // bob buys a hero slot with it? it costs 100: give him more through an auction sale from ann
    svc.commitTrades('auc:test', [
      { id: 1, wallet: 'W-bob', amount: -10, kind: 'trade', note: 'Bid: Sword' },
      { id: 2, wallet: 'W-ann', amount: 9, kind: 'trade', note: 'Sold: Sword' },
      { id: 3, wallet: 'house', amount: 1, kind: 'fee', note: 'House cut: Sword' },
    ], () => {});
    await svc.withdraw('W-ann', 'c-ann', 12);

    const e = svc.economy();
    const today = e.days[13];
    const before = e.days[11];
    expect(before).toMatchObject({ earned: ACH_TIERS.gold.reward, earners: 1 });
    expect(today.earned).toBe(20 + ACH_TIERS.silver.reward);
    expect(today.earners).toBe(2);
    expect(e.totals.earned).toEqual({ achievements: ACH_TIERS.gold.reward + ACH_TIERS.silver.reward, clears: 20, bounties: 0, total: ACH_TIERS.gold.reward + ACH_TIERS.silver.reward + 20 });
    // the cut is what the game kept from the sale; the sale itself is volume, not income
    expect(e.totals.spent).toEqual({ items: [], fees: 1, total: 1 });
    expect(e.totals.sales).toEqual({ count: 1, volume: 10 });
    expect(today).toMatchObject({ spent: 1, sales: 1, salesVolume: 10, withdrawn: 12 });
    expect(e.totals.withdrawn).toBe(12);
    // players hold what they earned less what left, and the house's own account is not theirs
    const total = e.totals.earned.total;
    expect(e.held.tokens).toBe(total - 12 - 1);
    expect(e.held.wallets).toBe(2);
    expect(e.earners7d).toBe(2);
    expect(e.returnedPct).toBe(Math.round((1 / total) * 100));
    expect(e.paidToday).toBe(20 + ACH_TIERS.silver.reward);
  });

  it('counts what was bought by name, and nothing a failed withdrawal gave back', async () => {
    const { svc, repo } = make();
    for (const a of ACHIEVEMENTS.slice(0, 20)) svc.reward('W-cat', 'c-cat', a.id);
    const had = svc.balance('W-cat');
    expect(had).toBeGreaterThanOrEqual(100);
    await svc.buy('W-cat', 'c-cat', 'hero-slot');
    const e = svc.economy();
    expect(e.totals.spent.items).toEqual([{ label: 'Hero slot', amount: 100 }]);
    expect(e.totals.spent.total).toBe(100);
    expect(e.held.tokens).toBe(had - 100);
    expect(repo.tokens.held()).toEqual({ tokens: had - 100, wallets: 1 });
  });

  it('is served to anyone, and says no more than the numbers', async () => {
    const server = createGameServer({ seed: 1, origins: [ORIGIN], rateLimitPerMinute: 1000, token: (repo) => new TokenService(repo.tokens, cfg(), new MockChain()) });
    const base = `http://127.0.0.1:${await server.listen(0)}`;
    try {
      const res = await fetch(`${base}/token/economy`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.days).toHaveLength(14);
      expect(body.totals.earned.total).toBe(0);
      expect(Object.keys(body).sort()).toEqual(['dailyPool', 'days', 'earners7d', 'held', 'paidToday', 'returnedPct', 'totals']);
    } finally {
      await server.close();
    }
  });
});
