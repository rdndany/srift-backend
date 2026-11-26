import { createServer, type IncomingMessage, type Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { PROTOCOL_VERSION, isClientMessage, parseNetClientMessage, type NetServerMessage, type ServerMessage } from '@solrift/shared';
import { AuthService, SESSION_COOKIE, createAuthRouter, readCookie } from './auth';
import { CloudService, createCloudRouter, type CloudServiceOptions } from './cloud';
import { Desk, createDeskRouter } from './desk';
import { createLeaderboardRouter } from './leaderboard';
import { SqliteRepo, type Repo } from './db';
import { GameRoom, STRIKES, type RoomOptions } from './room';
import { TokenService, createTokenRouter, type TradeMove } from './token';

export interface GameServer {
  http: Server;
  wss: WebSocketServer;
  auth: AuthService;
  cloud: CloudService;
  /** The $SOLRIFT ledger and payouts (inert until a token is configured). */
  token: TokenService;
  /** The shared multiplayer world. */
  room: GameRoom;
  listen(port: number): Promise<number>;
  close(): Promise<void>;
}

export interface GameServerOptions {
  seed: number;
  /** Browser origins allowed to sign in. Defaults to the local dev and test web servers. */
  origins?: string[];
  /** Account/session storage. Defaults to a throwaway in-memory SQLite database. */
  repo?: Repo;
  chainId?: string;
  secureCookies?: boolean;
  /** Domain of the session cookie (see `RouterOptions.cookieDomain`). */
  cookieDomain?: string;
  trustProxy?: boolean;
  rateLimitPerMinute?: number;
  /** Cloud save limits and clock (tests shrink the limits). */
  cloud?: CloudServiceOptions;
  /** The $SOLRIFT token. Defaults to none: nothing is paid and the website says "Announced at launch". */
  token?: (repo: Repo) => TokenService;
  /** Multiplayer room settings (the seed is the server's). */
  room?: Partial<Omit<RoomOptions, 'seed'>>;
  /** Connection limits (tests and load tests change them). */
  limits?: Partial<ConnectionLimits>;
}

export interface ConnectionLimits {
  /** Open sockets per client address. */
  maxConnectionsPerIp: number;
  /** New sockets per client address per minute. */
  connectsPerMinutePerIp: number;
  /** A socket that has not joined the game within this time is closed. */
  joinTimeoutMs: number;
  /** Ping interval; a socket that misses a whole interval is dropped (frees its account for a re-login). */
  heartbeatMs: number;
  /** Messages that fail validation before the socket is closed. */
  maxInvalidMessages: number;
}

export const DEFAULT_LIMITS: ConnectionLimits = {
  maxConnectionsPerIp: 10,
  connectsPerMinutePerIp: 60,
  joinTimeoutMs: 15_000,
  heartbeatMs: 15_000,
  maxInvalidMessages: 20,
};

/** Bytes a slow client may have queued before we stop sending it snapshots. */
export const SOFT_BUFFER_LIMIT = 1 << 20;
/** Bytes queued before the client is cut off (it cannot keep up, and the memory would grow without bound). */
export const HARD_BUFFER_LIMIT = 8 << 20;

/** Minimal view of a socket, so the back-pressure rule can be tested without one. */
export interface SendTarget {
  readonly readyState: number;
  readonly bufferedAmount: number;
  send(data: string): void;
  terminate(): void;
}

/**
 * Send a game message with back-pressure. A client that falls behind misses snapshots (the next one
 * replaces them anyway) instead of piling them up; one that falls far behind is dropped.
 */
export function sendWithBackpressure(ws: SendTarget, msg: { t: string }, serialize: () => string = () => JSON.stringify(msg)): 'sent' | 'skipped' | 'dropped' {
  if (ws.readyState !== 1) return 'skipped';
  const queued = ws.bufferedAmount;
  if (queued > HARD_BUFFER_LIMIT) {
    if (process.env.LOG_CLOSE === '1') console.log(`[solrift] backpressure: dropping a client with ${queued} bytes queued`);
    ws.terminate();
    return 'dropped';
  }
  if (queued > SOFT_BUFFER_LIMIT && msg.t === 'snap') return 'skipped';
  ws.send(serialize());
  return 'sent';
}

/**
 * What `JSON.stringify` gives for a snapshot whose players were serialised elsewhere: `snap.players` must be empty,
 * and `playersJson` takes its place. (`"players":[` cannot appear earlier: the keys before it hold no such member,
 * and a quote inside a string value is always escaped.)
 */
export function withPlayersJson(snap: { players: unknown[] }, playersJson: string): string {
  const s = JSON.stringify(snap);
  const key = '"players":[]';
  const at = s.indexOf(key);
  if (at < 0 || snap.players.length > 0) return JSON.stringify({ ...snap, players: JSON.parse(playersJson) });
  return s.slice(0, at + 10) + playersJson + s.slice(at + key.length);
}

export const DEV_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3100', 'http://127.0.0.1:3100'];

/** How often one address may read the market page's list (the page asks every few seconds; searching adds to it). */
const MARKET_PER_MINUTE = 120;

export function createGameServer(opts: GameServerOptions): GameServer {
  const marketByIp = new Map<string, number[]>();
  const repo = opts.repo ?? new SqliteRepo(':memory:');
  const auth = new AuthService(repo, { origins: opts.origins ?? DEV_ORIGINS, chainId: opts.chainId });
  const authRoutes = createAuthRouter(auth, {
    secureCookies: opts.secureCookies ?? false,
    cookieDomain: opts.cookieDomain,
    trustProxy: opts.trustProxy ?? false,
    rateLimitPerMinute: opts.rateLimitPerMinute ?? 30,
    isPlaying: (accountId) => room.hasAccount(accountId),
    saveOf: (accountId) => room.characterSave(accountId),
    stashOf: (wallet) => room.stashOf(wallet),
    deedsOf: (wallet) => room.walletDeeds(wallet),
  });

  const cloud = new CloudService(repo.cloud, opts.cloud);
  const cloudRoutes = createCloudRouter(auth, cloud);

  const token = opts.token ? opts.token(repo) : new TokenService(repo.tokens);
  const tokenRoutes = createTokenRouter(auth, token, { trustProxy: opts.trustProxy ?? false });

  const room = new GameRoom({
    seed: opts.seed,
    store: repo.room,
    ...(repo.land ? { land: repo.land } : {}),
    onAchievement: (e) => token.reward(e.wallet, e.account, e.id),
    onClear: (e) => token.rewardClear(e.wallet, e.account),
    onBounty: (e) => token.rewardBounty(e.wallet, e.account, e.day, e.id),
    ...(token.live ? { stashTabs: (wallet: string) => token.stashTabs(wallet) } : {}),
    ...(token.live ? { keys: { count: (wallet: string) => token.keyCount(wallet), take: (wallet: string) => token.takeKey(wallet) } } : {}),
    ...(token.live ? { tokens: { balance: (wallet: string) => token.balance(wallet), commit: (scope: string, moves: readonly TradeMove[], save: () => void) => token.commitTrades(scope, moves, save) } } : {}),
    ...opts.room,
  });

  // The Camp: what a hero can do from a phone (see desk.ts).
  const deskRoutes = createDeskRouter(auth, new Desk(room, repo.room), room, { trustProxy: opts.trustProxy ?? false });
  const leaderboardRoutes = createLeaderboardRouter(auth, repo, repo.room, { trustProxy: opts.trustProxy ?? false });

  // What the token shop puts in a wallet's Stash, and what the lobby shows a hero wearing (it is in the outfit slot of the saved hero).
  token.stash = { free: (wallet) => room.stashFree(wallet), count: (wallet, itemId) => room.stashCount(wallet, itemId), give: (wallet, itemId) => room.stashGive(wallet, itemId) };
  auth.outfitOf = (accountId, _wallet, cls) => room.wornOutfitOf(accountId, cls);

  const http = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, players: room.playerCount, maxPlayers: room.capacity, connections: wss.clients.size, protocol: PROTOCOL_VERSION, room: room.stats(), memoryMb: Math.round(process.memoryUsage().rss / 1e6) }));
      return;
    }
    // The Auction House for the website (`/api/market` there): public to read, and an account sees its own auctions and mail too.
    if (req.method === 'GET' && req.url?.split('?')[0] === '/market') {
      const ip = clientIp(req);
      const now = Date.now();
      const recent = (marketByIp.get(ip) ?? []).filter((t) => now - t < 60_000);
      recent.push(now);
      marketByIp.set(ip, recent);
      if (recent.length > MARKET_PER_MINUTE) {
        res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '10' });
        res.end(JSON.stringify({ error: 'Too many requests, wait a moment.' }));
        return;
      }
      const params = new URL(req.url, 'http://localhost').searchParams;
      const page = Number(params.get('page') ?? 0);
      const origin = req.headers.origin;
      const account = origin === undefined || auth.isAllowedOrigin(origin) ? auth.resolve(readCookie(req.headers.cookie, SESSION_COOKIE)) : null;
      const view = room.market(
        { q: params.get('q') ?? '', cat: (params.get('cat') ?? 'all') as never, sort: (params.get('sort') ?? 'ending') as never, desc: params.get('desc') === '1', page: Number.isFinite(page) ? page : 0 },
        account?.id ?? null,
      );
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ view, players: room.playerCount, max: room.capacity, now: Date.now(), user: account?.displayName ?? null }));
      return;
    }
    void authRoutes(req, res)
      .then((handled) => handled || cloudRoutes(req, res))
      .then((handled) => handled || tokenRoutes(req, res))
      .then((handled) => handled || leaderboardRoutes(req, res))
      .then((handled) => handled || deskRoutes(req, res))
      .then((handled) => {
        if (!handled) res.writeHead(404).end();
      });
  });

  const limits: ConnectionLimits = { ...DEFAULT_LIMITS, ...opts.limits };
  // Snapshots are repetitive JSON, so compressing them cuts the bandwidth per player roughly ten-fold.
  // No context takeover and a small window keep the memory per connection low, and small messages are
  // sent as they are. Incoming messages are limited after decompression, so this is not a zip-bomb door.
  const wss = new WebSocketServer({
    server: http,
    maxPayload: 16 * 1024,
    perMessageDeflate: {
      threshold: 256,
      zlibDeflateOptions: { level: 1, memLevel: 8 },
      serverNoContextTakeover: true,
      clientNoContextTakeover: true,
      serverMaxWindowBits: 13,
      concurrencyLimit: 8,
    },
  });
  const openByIp = new Map<string, number>();
  const recentByIp = new Map<string, number[]>();
  const clientIp = (req: IncomingMessage): string => {
    const fwd = opts.trustProxy ? req.headers['x-forwarded-for'] : undefined;
    const first = typeof fwd === 'string' ? fwd.split(',')[0].trim() : '';
    return first || req.socket.remoteAddress || 'unknown';
  };
  const purge = setInterval(() => {
    auth.purgeExpired();
    const t = Date.now();
    for (const [ip, times] of marketByIp) if (times.every((x) => t - x >= 60_000)) marketByIp.delete(ip);
  }, 60 * 60 * 1000);
  purge.unref();

  const send = (ws: WebSocket, msg: ServerMessage | NetServerMessage): void => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };

  wss.on('connection', (ws, req) => {
    const ip = clientIp(req);
    const now0 = Date.now();
    const recent = (recentByIp.get(ip) ?? []).filter((t) => now0 - t < 60_000);
    recent.push(now0);
    recentByIp.set(ip, recent);
    if ((openByIp.get(ip) ?? 0) >= limits.maxConnectionsPerIp || recent.length > limits.connectsPerMinutePerIp) {
      ws.close(1013, 'too many connections');
      return;
    }
    openByIp.set(ip, (openByIp.get(ip) ?? 0) + 1);
    let invalid = 0;
    let memberId: number | null = null;
    const bad = (message: string): void => {
      send(ws, { t: 'error', message });
      invalid++;
      if (memberId !== null) room.strike(memberId, STRIKES.invalidMessage, message);
      if (invalid > limits.maxInvalidMessages) ws.close(1008, 'too many invalid messages');
    };
    // Dead connections (a crashed browser, a cut cable) must not hold an account's single seat.
    let alive = true;
    ws.on('pong', () => (alive = true));
    const heartbeat = setInterval(() => {
      if (!alive) {
        if (process.env.LOG_CLOSE === '1') console.log(`[solrift] heartbeat: no pong from member ${memberId}`);
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, limits.heartbeatMs);
    heartbeat.unref();
    // Sockets that never join are not allowed to sit there.
    const joinTimer = setTimeout(() => {
      if (memberId === null) ws.close(1008, 'join timeout');
    }, limits.joinTimeoutMs);
    joinTimer.unref();
    // Per-connection rate limit: 100 messages per second (inputs arrive in batches of a few frames).
    let windowStart = Date.now();
    let count = 0;

    // A session cookie identifies the player, but only when the page that opened the socket is ours.
    const origin = req.headers.origin;
    const trusted = origin === undefined || auth.isAllowedOrigin(origin);
    const account = trusted ? auth.resolve(readCookie(req.headers.cookie, SESSION_COOKIE)) : null;

    send(ws, {
      t: 'welcome',
      v: PROTOCOL_VERSION,
      seed: room.seed,
      kind: room.kind,
      serverTime: Date.now(),
      players: room.playerCount,
      max: room.capacity,
      user: account?.displayName ?? null,
    });

    ws.on('message', (data) => {
      // Anything the client sends proves it is there. A browser whose page is busy (or in a background tab) can be
      // slow to answer a ping, but it keeps sending its inputs, and it must not be dropped for that.
      alive = true;
      const now = Date.now();
      if (now - windowStart > 1000) {
        windowStart = now;
        count = 0;
      }
      if (++count > 100) {
        ws.close(1008, 'rate limit');
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        bad('invalid json');
        return;
      }
      if (isClientMessage(parsed)) {
        if (parsed.t === 'ping') send(ws, { t: 'pong', ts: parsed.ts, serverTime: Date.now() });
        return;
      }
      const msg = parseNetClientMessage(parsed);
      if (!msg) {
        bad('invalid message');
        return;
      }
      if (msg.t === 'join') {
        if (memberId !== null) return;
        // A signed-in account plays under its own name; guests choose one.
        memberId = room.join(
          {
            send: (m) => sendWithBackpressure(ws, m),
            sendSnapshot: (snap, playersJson) => sendWithBackpressure(ws, snap, () => withPlayersJson(snap, playersJson)),
            close: (reason) => ws.close(1000, reason),
          },
          account?.displayName ?? msg.name,
          account?.id ?? null,
          // An account's saved character wins; a guest (or an account that never made one) brings its own.
          account?.look != null ? account.look : (msg.look ?? null),
          // An account's class was chosen when its character was made and never changes; only a guest picks one here.
          account ? (account.class ?? null) : (msg.class ?? null),
          account?.wallet ?? null,
        );
        return;
      }
      if (memberId !== null) room.receive(memberId, msg);
    });

    ws.on('close', (code, reason) => {
      if (process.env.LOG_CLOSE === '1') console.log(`[solrift] socket closed: member ${memberId} code ${code} ${reason.toString()} (buffered ${ws.bufferedAmount}, alive ${alive})`);
      clearInterval(heartbeat);
      clearTimeout(joinTimer);
      const open = (openByIp.get(ip) ?? 1) - 1;
      if (open <= 0) openByIp.delete(ip);
      else openByIp.set(ip, open);
      if (memberId !== null) room.leave(memberId);
      memberId = null;
    });
  });

  return {
    http,
    wss,
    auth,
    cloud,
    token,
    room,
    listen: (port) =>
      new Promise((resolve) => {
        http.listen(port, () => {
          room.start();
          token.start();
          const addr = http.address();
          resolve(typeof addr === 'object' && addr ? addr.port : port);
        });
      }),
    close: () =>
      new Promise((resolve) => {
        clearInterval(purge);
        token.stop();
        room.stop();
        for (const c of wss.clients) c.terminate();
        wss.close(() =>
          http.close(() => {
            repo.close();
            resolve();
          }),
        );
      }),
  };
}
