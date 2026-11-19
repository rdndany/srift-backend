// End-to-end runner: builds the web app into a separate dist dir (so it never clobbers a
// running `next dev`), serves it, runs the headless smoke + visual scenarios, then cleans up.
// Requires: npx playwright install chromium
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const url = `http://localhost:${PORT}`;
const GAME_PORT = Number(process.env.E2E_GAME_PORT ?? 8788);
// The game server is the Adventure realm by default; the suites of the core game run on this plain-world one (WORLD_KIND=overworld),
// and the Adventure suite joins a second server on this port.
const ADVENTURE_PORT = Number(process.env.E2E_ADVENTURE_PORT ?? 8790);
// The web app proxies /api/* to this game server and connects its WebSocket there.
const env = {
  ...process.env,
  NEXT_DIST_DIR: '.next-test',
  SERVER_ORIGIN: `http://localhost:${GAME_PORT}`,
  NEXT_PUBLIC_SERVER_URL: `ws://localhost:${GAME_PORT}`,
  E2E_ADVENTURE_PORT: String(ADVENTURE_PORT),
};

// Run Next's CLI with node directly (no shell, works the same on every OS).
const webDir = path.resolve('apps/web');
const nextBin = createRequire(path.join(webDir, 'package.json')).resolve('next/dist/bin/next');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function waitForPort(port, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => {
        s.destroy();
        resolve();
      });
      s.once('error', () => {
        s.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error(`port ${port} never opened`));
        else setTimeout(tryOnce, 250);
      });
    };
    tryOnce();
  });
}

console.log('> building web (NEXT_DIST_DIR=.next-test)');
const build = spawnSync(process.execPath, [nextBin, 'build'], { stdio: 'inherit', env, cwd: webDir });
if (build.status !== 0) process.exit(build.status ?? 1);

console.log(`> game server on :${GAME_PORT} (in-memory database)`);
const game = spawn(process.execPath, ['--import', 'tsx', 'apps/server/src/index.ts'], {
  env: { ...process.env, PORT: String(GAME_PORT), WORLD_KIND: 'overworld', DATABASE_PATH: ':memory:', AUTH_ORIGINS: url, WORLD_SEED: '1337', CHEATS: '1', NO_MOBS: '1', MAX_PLAYERS: '150', MAX_CONN_PER_IP: '150', CONNECTS_PER_MINUTE: '100000', HEARTBEAT_MS: '120000' },
  // LOG_CLOSE=1 node scripts/e2e.mjs shows why the server drops sockets (see apps/server/src/server.ts).
  stdio: process.env.LOG_CLOSE ? 'inherit' : 'ignore',
});

console.log(`> adventure server on :${ADVENTURE_PORT}`);
const adventure = spawn(process.execPath, ['--import', 'tsx', 'apps/server/src/index.ts'], {
  env: { ...process.env, PORT: String(ADVENTURE_PORT), WORLD_KIND: 'adventure', DATABASE_PATH: ':memory:', AUTH_ORIGINS: url, CHEATS: '1', MAX_CONN_PER_IP: '150', CONNECTS_PER_MINUTE: '100000', HEARTBEAT_MS: '120000' },
  stdio: process.env.LOG_CLOSE ? 'inherit' : 'ignore',
});

console.log(`> serving on :${PORT}`);
const server = spawn(process.execPath, [nextBin, 'start', '-p', String(PORT)], { env, cwd: webDir, stdio: 'ignore' });

const stop = () => {
  if (!server.killed) server.kill();
  if (!game.killed) game.kill();
  if (!adventure.killed) adventure.kill();
};
process.on('exit', stop);
process.on('SIGINT', () => process.exit(130));

try {
  await waitForPort(PORT);
  await waitForPort(GAME_PORT);
  await waitForPort(ADVENTURE_PORT);
  // E2E_ONLY=cloud (comma separated) runs just those suites while developing.
  const only = (process.env.E2E_ONLY ?? '').split(',').filter(Boolean);
  for (const name of ['smoke', 'scenarios', 'gameplay', 'mobs', 'plants', 'bow', 'weather', 'saves', 'auth', 'cloud', 'online', 'crowd', 'xp', 'armor', 'view', 'home', 'world', 'nature', 'recipes', 'shield', 'bed', 'building', 'dyes', 'villages', 'trading', 'enchanting', 'anvil', 'fire', 'worlds', 'adventure', 'legacy', 'vehicles', 'redstone', 'character', 'map', 'identity', 'classes', 'beyond']) {
    if (only.length && !only.includes(name)) continue;
    console.log(`> ${name}`);
    run(process.execPath, [`scripts/${name}.mjs`, url, 'screenshots']);
  }
  console.log('E2E passed. Screenshots in ./screenshots');
} finally {
  stop();
}

