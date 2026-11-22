import './loadEnv';
import { DEFAULT_SERVER_PORT } from '@solrift/shared';
import { parseIdList } from './admin';
import { SqliteRepo } from './db';
import { DEV_ORIGINS, createGameServer } from './server';
import { TokenService, tokenChainFromEnv, tokenConfigFromEnv } from './token';

const PORT = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);
const WORLD_SEED = Number(process.env.WORLD_SEED ?? 1337);
/**
 * The multiplayer world is the Adventure one: the village of Dawnwatch, its quests and the dungeon (a fixed world,
 * so WORLD_SEED does not matter). WORLD_KIND=overworld runs the plain generated world instead (used by the tests
 * of the core game and by developers). WORLD_KIND=beyond runs the World Beyond, the huge 110-biome planet (WORLD_SEED picks it).
 */
const WORLD_KIND = process.env.WORLD_KIND === 'overworld' ? 'overworld' : process.env.WORLD_KIND === 'beyond' ? 'beyond' : 'adventure';
const DATABASE_PATH = process.env.DATABASE_PATH ?? 'data/solrift.db';
/** Comma-separated browser origins allowed to sign in, e.g. `https://play.example.com`. */
const ORIGINS = process.env.AUTH_ORIGINS ? process.env.AUTH_ORIGINS.split(',').map((s) => s.trim()) : DEV_ORIGINS;

/**
 * The $SOLRIFT token is off until TOKEN_MINT is set (with SOLANA_CLUSTER). Then achievements pay into wallets' balances;
 * add TREASURY_KEYPAIR (a Solana CLI keypair file that holds the tokens) to let players withdraw. See docs/TOKEN.md.
 */
const TOKEN_CONFIG = tokenConfigFromEnv(process.env);
const TOKEN_CHAIN = tokenChainFromEnv(TOKEN_CONFIG, process.env);

const server = createGameServer({
  seed: WORLD_SEED,
  origins: ORIGINS,
  repo: new SqliteRepo(DATABASE_PATH),
  token: (repo) => new TokenService(repo.tokens, TOKEN_CONFIG, TOKEN_CHAIN),
  room: {
    kind: WORLD_KIND,
    cheats: process.env.CHEATS === '1',
    // Who may type /admin on: the wallets (and, optionally, single characters by id) the owner lists. Nobody by default.
    admins: { wallets: parseIdList(process.env.ADMIN_WALLETS), accounts: parseIdList(process.env.ADMIN_ACCOUNTS) },
    onAdmin: (e) => console.warn(`[solrift] ADMIN ${e.name} (${e.account ?? 'no account'}): ${e.action}${e.detail ? ` ${e.detail}` : ''}`),
    naturalSpawning: process.env.NO_MOBS !== '1',
    maxPlayers: process.env.MAX_PLAYERS ? Number(process.env.MAX_PLAYERS) : undefined,
    onViolation: (v) => console.warn(`[solrift] ${v.kicked ? 'KICK' : 'strike'} ${v.name}: ${v.reason} (score ${v.score.toFixed(1)})`),
    mode: process.env.GAME_MODE === 'creative' ? 'creative' : 'survival',
  },
  limits: {
    ...(process.env.MAX_CONN_PER_IP ? { maxConnectionsPerIp: Number(process.env.MAX_CONN_PER_IP) } : {}),
    ...(process.env.CONNECTS_PER_MINUTE ? { connectsPerMinutePerIp: Number(process.env.CONNECTS_PER_MINUTE) } : {}),
    ...(process.env.HEARTBEAT_MS ? { heartbeatMs: Number(process.env.HEARTBEAT_MS) } : {}),
  },
  secureCookies: process.env.COOKIE_SECURE === '1',
  // When the page and the server are on sibling subdomains (play.example.com and api.example.com), share the cookie: COOKIE_DOMAIN=example.com
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  // Behind Next's /api proxy every request comes from the proxy; trust its forwarded client address.
  trustProxy: process.env.TRUST_PROXY === '1',
});
const port = await server.listen(PORT);
console.log(`[solrift] server listening on :${port} (${WORLD_KIND === 'adventure' ? 'adventure world' : `seed ${WORLD_SEED}`}, db ${DATABASE_PATH})`);
console.log(`[solrift] token: ${!TOKEN_CONFIG.mint ? 'not live (no TOKEN_MINT)' : `${TOKEN_CONFIG.mint} on ${TOKEN_CONFIG.cluster}, withdrawals ${server.token.canWithdraw ? 'open' : 'closed (no TREASURY_KEYPAIR)'}`}`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    void server.close().then(() => process.exit(0));
  });
}
