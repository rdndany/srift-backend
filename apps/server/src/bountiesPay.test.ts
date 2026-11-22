import { describe, expect, it } from 'vitest';
import { BOUNTY_TIERS, DAY_MS, base58Encode, bountiesOn, dayOf, type NetServerMessage } from '@solrift/shared';
import { SqliteRepo } from './db';
import { GameRoom } from './room';
import { MemoryRoomStore } from './roomStore';
import { NO_TOKEN, TokenService, tokenConfigFromEnv, type TokenConfig } from './token';
import { MockChain } from './tokenChain';

const MINT = base58Encode(new Uint8Array(32).fill(7));
const T0 = 20_778 * DAY_MS + 9 * 3_600_000; // 2026-11-21, nine in the morning UTC
const cfg = (over: Partial<TokenConfig> = {}): TokenConfig => ({ mint: MINT, cluster: 'devnet', rpcUrl: 'http://rpc.invalid', dailyPool: 10_000, walletDailyReward: 10_000, minWithdraw: 10, walletDailyWithdraw: 10_000, clearRewards: [20], slotPrices: [100], bountyRewards: [3, 6, 12], keyPrice: 15, stashPrices: [], outfitPrices: [], ...over });

function world(over: Partial<TokenConfig> = {}, roomOver: Partial<ConstructorParameters<typeof GameRoom>[0]> = {}, store = new MemoryRoomStore()) {
  let t = T0;
  const repo = new SqliteRepo(':memory:');
  const svc = new TokenService(repo.tokens, cfg(over), new MockChain(), () => t);
  const room = new GameRoom({ seed: 1, kind: 'adventure', naturalSpawning: false, store, now: () => t, onBounty: (e) => svc.rewardBounty(e.wallet, e.account, e.day, e.id), ...roomOver });
  return { svc, repo, room, store, advance: (ms: number) => (t += ms), now: () => t, reopen: () => new GameRoom({ seed: 1, kind: 'adventure', naturalSpawning: false, store, now: () => t, onBounty: (e) => svc.rewardBounty(e.wallet, e.account, e.day, e.id), ...roomOver }) };
}

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
  bountyViews() {
    return this.messages.flatMap((m) => (m.t === 'events' ? m.events.flatMap((e) => (e.t === 'bounties' ? [e.view] : [])) : []));
  }
}

/** Do everything today's bounties ask for. */
const doAll = (room: GameRoom, c: Client, day: number) => {
  for (const b of bountiesOn(day)) room.player(c.id)!.achAdd(b.stat, b.goal);
  room.tick();
};

describe('rewardBounty', () => {
  const day = dayOf(T0);
  const [easy, medium, hard] = bountiesOn(day);

  it('pays the tier of the bounty, once per wallet per day', () => {
    const { svc } = world();
    expect(svc.rewardBounty('W1', 'c1', day, easy.id)).toBe(3);
    expect(svc.rewardBounty('W1', 'c1', day, medium.id)).toBe(6);
    expect(svc.rewardBounty('W1', 'c2', day, hard.id)).toBe(12); // another character of the wallet: the same wallet, still its own bounty
    expect(svc.rewardBounty('W1', 'c2', day, easy.id)).toBe(0);
    expect(svc.rewardBounty('W1', 'c1', day, hard.id)).toBe(0);
    expect(svc.balance('W1')).toBe(21);
    expect(svc.rewardBounty('W2', 'c3', day, easy.id)).toBe(3);
  });

  it('pays only what was really posted, for today or the day just ended', () => {
    const { svc } = world();
    expect(svc.rewardBounty('W1', 'c', day, 'made-up')).toBe(0);
    const tomorrow = day + 1;
    const notToday = bountiesOn(tomorrow).find((b) => !bountiesOn(day).some((x) => x.id === b.id));
    if (notToday) expect(svc.rewardBounty('W1', 'c', day, notToday.id)).toBe(0); // posted tomorrow, not today
    expect(svc.rewardBounty('W1', 'c', tomorrow, bountiesOn(tomorrow)[0].id)).toBe(0); // the future
    expect(svc.rewardBounty('W1', 'c', day - 2, bountiesOn(day - 2)[0].id)).toBe(0); // long ago
    expect(svc.rewardBounty('W1', 'c', 1.5, easy.id)).toBe(0);
    expect(svc.rewardBounty('W1', 'c', day - 1, bountiesOn(day - 1)[0].id)).toBeGreaterThan(0); // finished just before midnight
    expect(svc.balance('W1')).toBeGreaterThan(0);
  });

  it('pays nothing with no token, or when the bounties are switched off, and is held to the pool and the wallet cap', () => {
    expect(new TokenService(new SqliteRepo(':memory:').tokens, NO_TOKEN, null).rewardBounty('W1', 'c', day, easy.id)).toBe(0);
    expect(world({ bountyRewards: [] }).svc.rewardBounty('W1', 'c', day, easy.id)).toBe(0);
    const poor = world({ dailyPool: 8 }).svc;
    expect(poor.rewardBounty('W1', 'c', day, easy.id)).toBe(3);
    expect(poor.rewardBounty('W1', 'c', day, medium.id)).toBe(0); // 3 + 6 would pass the pool of 8
    const capped = world({ walletDailyReward: 9 }).svc;
    expect(capped.rewardBounty('W1', 'c', day, easy.id)).toBe(3);
    expect(capped.rewardBounty('W1', 'c', day, medium.id)).toBe(6);
    expect(capped.rewardBounty('W1', 'c', day, hard.id)).toBe(0);
  });

  it('is set in the environment, three amounts or off, and nothing else', () => {
    expect(tokenConfigFromEnv({}).bountyRewards).toEqual([3, 6, 12]);
    expect(tokenConfigFromEnv({ TOKEN_BOUNTY_REWARDS: '1,2,3' }).bountyRewards).toEqual([1, 2, 3]);
    expect(tokenConfigFromEnv({ TOKEN_BOUNTY_REWARDS: 'off' }).bountyRewards).toEqual([]);
    expect(() => tokenConfigFromEnv({ TOKEN_BOUNTY_REWARDS: '1,2' })).toThrow(/TOKEN_BOUNTY_REWARDS/);
    expect(() => tokenConfigFromEnv({ TOKEN_BOUNTY_REWARDS: '1,x,3' })).toThrow(/TOKEN_BOUNTY_REWARDS/);
    expect(BOUNTY_TIERS).toHaveLength(3);
  });
});

describe('daily bounties in the game', () => {
  const day = dayOf(T0);

  it('tell a player what the day asks as they join', () => {
    const { room } = world();
    const c = new Client().join(room, 'ann', 'char-ann', 'W1');
    for (let i = 0; i < 25; i++) room.tick(); // (the counts go out once a second)
    const view = c.bountyViews().pop()!;
    expect(view.day).toBe('2026-11-21');
    expect(view.rows.map((r) => r.id)).toEqual(bountiesOn(day).map((b) => b.id));
    expect(view.rows.every((r) => !r.done && r.have === 0)).toBe(true);
    expect(view.resetIn).toBe(15 * 3_600_000);
  });

  it('pay a signed-in wallet when it finishes them, and tell it', () => {
    const { room, svc } = world();
    const c = new Client().join(room, 'ann', 'char-ann', 'W1');
    doAll(room, c, day);
    expect(svc.balance('W1')).toBe(21);
    expect(c.notices().filter((t) => t.includes('daily bounty')).length).toBe(3);
    expect(c.notices().some((t) => t.includes('+12 $SOLRIFT'))).toBe(true);
    // done is done: the same deeds again pay nothing more
    doAll(room, c, day);
    expect(svc.balance('W1')).toBe(21);
  });

  it('are one set of bounties per wallet and day, however many characters it plays', () => {
    const { room, svc } = world();
    const a = new Client().join(room, 'ann', 'char-ann', 'W1');
    const b = new Client().join(room, 'ann2', 'char-ann-2', 'W1');
    doAll(room, a, day);
    doAll(room, b, day);
    expect(svc.balance('W1')).toBe(21);
    expect(b.notices().some((t) => t.includes('daily bounty'))).toBe(false);
  });

  it('pay nothing to a guest, on a cheats server, or in creative mode', () => {
    const guest = world();
    const g = new Client().join(guest.room, 'guest', null, null);
    doAll(guest.room, g, day);
    expect(guest.repo.tokens.total('reward')).toBe(0);

    const cheats = world({}, { cheats: true });
    const c = new Client().join(cheats.room, 'cheater', 'char-c', 'W2');
    doAll(cheats.room, c, day);
    expect(cheats.svc.balance('W2')).toBe(0);

    const creative = world({}, { mode: 'creative' });
    const k = new Client().join(creative.room, 'builder', 'char-k', 'W3');
    doAll(creative.room, k, day);
    expect(creative.svc.balance('W3')).toBe(0);
  });

  it('start over the next day, with the next day\'s bounties', () => {
    const { room, svc, advance } = world();
    const c = new Client().join(room, 'ann', 'char-ann', 'W1');
    doAll(room, c, day);
    expect(svc.balance('W1')).toBe(21);
    advance(DAY_MS);
    for (let i = 0; i < 40; i++) room.tick(); // a second goes by: the character is told the day has turned
    const view = c.bountyViews().pop()!;
    expect(view.day).toBe('2026-11-22');
    expect(view.rows.every((r) => !r.done && r.have === 0)).toBe(true);
    doAll(room, c, day + 1);
    expect(svc.balance('W1')).toBe(42);
  });

  it('are kept with the character through a restart, for the day, and not paid twice', () => {
    const w = world();
    const first = new Client().join(w.room, 'ann', 'char-ann', 'W1');
    const [easy, medium] = bountiesOn(day);
    w.room.player(first.id)!.achAdd(easy.stat, easy.goal); // one finished
    w.room.player(first.id)!.achAdd(medium.stat, medium.goal - 1); // one nearly
    w.room.tick();
    expect(w.svc.balance('W1')).toBe(3);
    w.room.save();
    w.room.stop();

    const again = w.reopen();
    const back = new Client().join(again, 'ann', 'char-ann', 'W1');
    for (let i = 0; i < 25; i++) again.tick();
    const view = back.bountyViews().pop()!;
    expect(view.rows[0]).toMatchObject({ id: easy.id, done: true });
    expect(view.rows[1]).toMatchObject({ id: medium.id, done: false, have: medium.goal - 1 });
    // the finished one does not pay again, the nearly finished one does when it is done
    again.player(back.id)!.achAdd(easy.stat, easy.goal);
    again.player(back.id)!.achAdd(medium.stat, 1);
    again.tick();
    expect(w.svc.balance('W1')).toBe(3 + 6);
  });

  it('show in the economy as their own line, apart from achievements and clears', () => {
    const { room, svc } = world();
    const c = new Client().join(room, 'ann', 'char-ann', 'W1');
    doAll(room, c, day);
    const e = svc.economy();
    expect(e.totals.earned).toMatchObject({ bounties: 21, achievements: expect.any(Number), clears: 0 });
    expect(e.totals.earned.total).toBe(e.totals.earned.achievements + 21);
  });
});
