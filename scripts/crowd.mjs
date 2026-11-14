// Crowd E2E: a real browser plays on a server with 99 other players (load-test bots) standing in the same
// spot, the worst case for the client. Checks that the server holds all 100 and that the browser draws the
// crowd cheaply: few full figures, the rest as blocks, a bounded number of draw calls and sync time.
// Usage: node scripts/crowd.mjs [url] [outDir]   (scripts/e2e.mjs starts the server with room for 150 players)
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
const GAME_PORT = Number(process.env.E2E_GAME_PORT ?? 8788);
const BOTS = Number(process.env.CROWD_BOTS ?? 99);
mkdirSync(outDir, { recursive: true });

const failures = [];
const check = (cond, msg) => {
  if (cond) console.log('  ok  ', msg);
  else {
    console.log('  FAIL', msg);
    failures.push(msg);
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`starting ${BOTS} bots`);
const bots = spawn(process.execPath, ['scripts/loadtest.mjs', '--url', `ws://localhost:${GAME_PORT}`, '--clients', String(BOTS), '--seconds', '70', '--ramp', '4000'], { stdio: ['ignore', 'pipe', 'pipe'] });
let botLog = '';
bots.stdout.on('data', (d) => (botLog += d));
bots.stderr.on('data', (d) => (botLog += d));
const stopBots = () => bots.kill();
process.on('exit', stopBots);

const browser = await launchBrowser();
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${url}/?online&debug&noshadows&noaa&name=viewer`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 120000 });
  await page.evaluate(() => window.__solrift.forceLock());
  const hook = (fn, ...args) => page.evaluate(([f, a]) => window.__solrift[f](...a), [fn, args]);

  console.log('waiting for the crowd');
  const want = Math.floor(BOTS * 0.9);
  const deadline = Date.now() + 60000;
  let seen = 0;
  while (Date.now() < deadline && seen < want) {
    seen = (await hook('others')).length;
    await sleep(500);
  }
  check(seen >= want, `the viewer sees ${seen} of ${BOTS} other players (wanted ${want})`);

  // Let the figures settle, then sample for a while.
  await sleep(4000);
  const samples = [];
  for (let i = 0; i < 8; i++) {
    samples.push(await hook('crowd'));
    await sleep(500);
  }
  const last = samples[samples.length - 1];
  const maxOf = (f) => Math.max(...samples.map(f));
  const avgOf = (f) => samples.reduce((s, x) => s + f(x), 0) / samples.length;
  console.log(`  players total ${last.players.total}, full ${last.players.full}, blocks ${last.players.blocks}, hidden ${last.players.hidden}`);
  console.log(`  draw calls ${last.calls}, triangles ${last.triangles}, sync ${avgOf((s) => s.players.syncMs).toFixed(2)} ms avg, fps ${last.fps}`);

  check(last.players.total >= want, 'the renderer was handed the whole crowd');
  check(maxOf((s) => s.players.full) <= 22, 'about 20 full figures at once (a little more while players swap places)');
  check(last.players.blocks > 0 || last.players.hidden > 0, 'the rest are drawn as blocks (or skipped when far)');
  // Meshing, the sky and the hand are in the count too; the crowd must not push it past a sane ceiling.
  check(maxOf((s) => s.calls) < 900, `draw calls stay bounded (max ${maxOf((s) => s.calls)})`);
  check(avgOf((s) => s.players.syncMs) < 6, `player sync is cheap (${avgOf((s) => s.players.syncMs).toFixed(2)} ms avg)`);

  const health = await (await fetch(`http://localhost:${GAME_PORT}/health`)).json();
  console.log(`  server: ${health.players}/${health.maxPlayers} players, tick ${health.room.tickMsAvg.toFixed(1)} ms avg`);
  check(health.players >= want, `the server holds ${health.players} players`);
  check(health.room.tickMsAvg < 25, `server tick under budget (${health.room.tickMsAvg.toFixed(1)} ms)`);

  await page.evaluate(() => {
    const o = document.getElementById('overlay');
    if (o) o.style.display = 'none';
  });
  await sleep(500);
  await page.screenshot({ path: `${outDir}/crowd.png` });
  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
} finally {
  await browser.close();
  stopBots();
}

if (failures.length) {
  console.log(botLog.split('\n').slice(-12).join('\n'));
  console.error(`\ncrowd E2E FAILED (${failures.length})`);
  process.exit(1);
}
console.log('crowd E2E passed');
