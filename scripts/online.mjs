// Online multiplayer E2E: two real browsers join the game server (?online), see each other, walk with
// client-side prediction, break a block that the other player sees, chat, open a menu through the
// server, and notice when someone leaves.
// Usage: node scripts/online.mjs [url] [outDir]   (the server needs CHEATS=1, as scripts/e2e.mjs sets)
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const browser = await launchBrowser();
const errors = [];
const failures = [];
const check = (cond, msg) => {
  if (cond) console.log('  ok  ', msg);
  else {
    console.log('  FAIL', msg);
    failures.push(msg);
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function join(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(`${url}/?online&debug&noshadows&noaa&nohalos&name=${name}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 120000 });
  await page.evaluate(() => window.__solrift.forceLock());
  return page;
}
const hook = (page, fn, arg) => page.evaluate(([f, a]) => window.__solrift[f](...(a ?? [])), [fn, arg]);
const until = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(100);
  }
  return false;
};

// ---------------------------------------------------------------------------------------------------
console.log('joining');
const alice = await join('alice');
const bob = await join('bob');
check(await hook(alice, 'online'), 'alice is playing online');
check(await until(async () => (await hook(alice, 'others')).some((p) => p.name === 'bob')), 'alice sees bob');
check(await until(async () => (await hook(bob, 'others')).some((p) => p.name === 'alice')), 'bob sees alice');
check((await hook(alice, 'chatLog')).some((l) => l.includes('bob joined')), 'alice was told that bob joined');
check((await hook(alice, 'pingMs')) >= 0, 'ping is measured');
await alice.screenshot({ path: `${outDir}/online-alice.png` });

console.log('chat');
await hook(alice, 'chat', ['hello bob']);
check(await until(async () => (await hook(bob, 'chatLog')).some((l) => l.includes('<alice> hello bob'))), 'bob receives alice\'s chat line');
await hook(bob, 'chat', ['/who']);
check(await until(async () => (await hook(bob, 'chatLog')).some((l) => l.includes('alice') && l.includes('bob') && !l.startsWith('<'))), '/who lists both players');

console.log('walking (client prediction, server authority)');
await hook(alice, 'chat', ['/gamemode creative']);
check(await until(async () => (await hook(alice, 'mode')) === 'creative'), '/gamemode creative works with cheats on');
// Fly up first so no hill or tree is in the way.
await hook(alice, 'command', [{ t: 'fly' }]);
await hook(alice, 'holdKey', ['Space', true]);
await sleep(1200);
await hook(alice, 'holdKey', ['Space', false]);
await sleep(300);
const start = await hook(alice, 'position');
await hook(alice, 'look', [0, 0]);
await hook(alice, 'holdKey', ['KeyW', true]);
await sleep(1500);
await hook(alice, 'holdKey', ['KeyW', false]);
await sleep(600);
const end = await hook(alice, 'position');
const walked = Math.hypot(end.x - start.x, end.z - start.z);
// The software renderer runs this page at a few frames a second, so allow for a slow walk.
check(walked > 1.5 && walked < 20, `alice walked forward (${walked.toFixed(1)} blocks in 1.5 s)`);
// Bob sees alice roughly where alice thinks she is (server position, smoothed).
await sleep(500);
const seen = (await hook(bob, 'others')).find((p) => p.name === 'alice');
const gap = seen ? Math.hypot(seen.x - end.x, seen.z - end.z) : 99;
check(gap < 1.5, `bob sees alice where she is (gap ${gap.toFixed(2)})`);

console.log('block edits');
await hook(alice, 'command', [{ t: 'fly' }]); // land again
await sleep(1500);
// She may fall a long way if a cave lies below; wait until she has stopped.
for (let i = 0, last = null; i < 40; i++) {
  const y = (await hook(alice, 'position')).y;
  if (last !== null && Math.abs(y - last) < 0.01) break;
  last = y;
  await sleep(400);
}
const p = await hook(alice, 'position');
const bx = Math.floor(p.x);
const by = Math.floor(p.y) - 1;
const bz = Math.floor(p.z);
const before = await hook(bob, 'getBlock', [bx, by, bz]);
check(before !== 0, `there is a block under alice (id ${before})`);
await hook(alice, 'look', [0, -1.55]);
await hook(alice, 'setLeft', [true]);
check(await until(async () => (await hook(alice, 'getBlock', [bx, by, bz])) === 0, 6000), 'alice breaks it (creative)');
await hook(alice, 'setLeft', [false]);
check(await until(async () => (await hook(bob, 'getBlock', [bx, by, bz])) === 0, 6000), 'bob sees the block disappear');

console.log('menus go through the server');
await hook(alice, 'command', [{ t: 'inventory' }]);
check(await until(async () => (await hook(alice, 'screen')) === 'creative'), 'the creative palette opens on the server');
await hook(alice, 'command', [{ t: 'closeMenu' }]);
const closed = await until(async () => (await hook(alice, 'screen')) === 'none');
check(closed, 'and closes');
if (!closed) console.log('  state:', JSON.stringify({ screen: await hook(alice, 'screen'), connected: await hook(alice, 'connected'), chat: (await hook(alice, 'chatLog')).slice(-4) }));

console.log('leaving');
await bob.screenshot({ path: `${outDir}/online-bob.png` });
await alice.context().close();
check(await until(async () => (await hook(bob, 'others')).length === 0), 'bob no longer sees alice');
check((await hook(bob, 'chatLog')).some((l) => l.includes('alice left')), 'bob was told that alice left');

const real = errors.filter((e) => !/favicon|Failed to load resource/.test(e));
check(real.length === 0, `no console errors${real.length ? `: ${real.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('online E2E passed');
