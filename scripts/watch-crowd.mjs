// Watch the game with a crowd: starts a game server (the Adventure realm, with skills for everyone), 119 load-test bots that run, jump
// and use their skills in the town, and a visible Chromium window that joins as the 120th player. You play in that window.
// Needs the test build (`node scripts/e2e.mjs` builds it into apps/web/.next-test, which this reuses).
// Usage: node scripts/watch-crowd.mjs [minutes=10] [bots=119]      (the window stays open that long, or until you close it)
// It uses :8788 (game) and :3100 (web), the ports the build was made for, never the ones of `npm run dev`.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chromium } from 'playwright';

const MINUTES = Number(process.argv[2] ?? 10);
const BOTS = Number(process.argv[3] ?? 119);
const GAME_PORT = Number(process.env.E2E_GAME_PORT ?? 8788);
const PORT = Number(process.env.E2E_PORT ?? 3100);
const url = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const webDir = path.resolve('apps/web');
const nextBin = createRequire(path.join(webDir, 'package.json')).resolve('next/dist/bin/next');
const env = { ...process.env, NEXT_DIST_DIR: '.next-test', SERVER_ORIGIN: `http://localhost:${GAME_PORT}`, NEXT_PUBLIC_SERVER_URL: `ws://localhost:${GAME_PORT}` };

const children = [];
const start = (cmd, args, opts) => {
  const c = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  children.push(c);
  return c;
};
const stop = () => children.forEach((c) => !c.killed && c.kill());
process.on('exit', stop);
process.on('SIGINT', () => process.exit(130));

const game = start(process.execPath, ['--import', 'tsx', 'scripts/loadtest-skills-server.ts'], {
  env: { ...process.env, PORT: String(GAME_PORT), CHEATS: '1', DATABASE_PATH: ':memory:', MAX_PLAYERS: '130', MAX_CONN_PER_IP: '200', CONNECTS_PER_MINUTE: '100000', AUTH_ORIGINS: url },
});
await new Promise((resolve) => game.stdout.on('data', (d) => String(d).includes('ready') && resolve()));
console.log(`game server on :${GAME_PORT}`);
start(process.execPath, [nextBin, 'start', '-p', String(PORT)], { env, cwd: webDir });
await sleep(4000);

const bots = start(process.execPath, ['scripts/loadtest.mjs', '--skills', '--url', `ws://localhost:${GAME_PORT}`, '--clients', String(BOTS), '--seconds', String(MINUTES * 60), '--ramp', '8000']);
let report = '';
bots.stdout.on('data', (d) => (report += d));
console.log(`${BOTS} bots joining over 8 seconds`);
await sleep(10000);

const browser = await chromium.launch({
  headless: false,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--window-position=40,40'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
const page = await ctx.newPage();
await page.goto(`${url}/?online&debug&name=Watcher`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 120000 });
console.log('You are in. Click the window to take the mouse; the crowd is around you. Closing the window ends this.');

let closed = false;
page.on('close', () => (closed = true));
browser.on('disconnected', () => (closed = true));
const end = Date.now() + MINUTES * 60000;
while (!closed && Date.now() < end) {
  await sleep(5000);
  try {
    const c = await page.evaluate(() => window.__solrift.crowd());
    console.log(`  fps ${c.fps}, other players ${c.players.total} (full ${c.players.full}, blocks ${c.players.blocks}, hidden ${c.players.hidden}), draw calls ${c.calls}`);
  } catch {
    break;
  }
}
await browser.close().catch(() => {});
stop();
