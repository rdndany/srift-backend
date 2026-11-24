import './loadEnv';
import { DEFAULT_LAND_CONFIG, DEFAULT_SERVER_PORT, type LandConfigOverride } from '@solrift/shared';
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
/** LAND_CONFIG is a JSON object of the land rules to change; one that is not valid is said and ignored (the defaults stay). */
function parseLandConfig(raw: string | undefined): LandConfigOverride | undefined {
  if (!raw) return undefined;
  try {
    const v: unknown = JSON.parse(raw);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      // Only the known settings, each of the kind it is by default: a typo or a string for a number is said and left out.
      const keep = (given: object, base: object, where: string): Record<string, unknown> => {
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(given)) {
          const def = (base as Record<string, unknown>)[k];
          if (def === undefined || typeof def !== typeof val) console.warn(`[solrift] LAND_CONFIG: ${where}${k} ignored`);
          else if (k === 'regen' && val && typeof val === 'object') out[k] = keep(val, def as object, 'regen.');
          else out[k] = val;
        }
        return out;
      };
      return keep(v, DEFAULT_LAND_CONFIG, '') as LandConfigOverride;
    }
  } catch {
    /* said below */
  }
  console.warn('[solrift] LAND_CONFIG is not a JSON object: the default land rules are used');
  return undefined;
}
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
    // Land claims: LAND_CONFIG='{"pricePerBlock":8,"maxArea":4000,"regen":{"placedHours":24}}' changes prices, limits and timers (see docs/LAND.md).
    landConfig: parseLandConfig(process.env.LAND_CONFIG),
    naturalSpawning: process.env.NO_MOBS !== '1',
    // The Gilded Tide: an invasion every half hour (on the hour and at half past).
    invasions: process.env.NO_MOBS !== '1' && process.env.NO_INVASIONS !== '1',
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
