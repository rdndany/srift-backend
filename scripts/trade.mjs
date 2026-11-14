// Player trading E2E: two real browsers join a game server with cheats on, one looks at the other (the target
// frame), opens the player menu with U, asks to trade, the other accepts, both fill the table and accept, and
// the goods change hands. Saves `trade-*.png`.
// Usage: node scripts/trade.mjs [url] [outDir] [serverUrl]
//   (needs a game server with CHEATS=1, e.g. PORT=8788 CHEATS=1 DATABASE_PATH=:memory: AUTH_ORIGINS=<url> node --import tsx apps/server/src/index.ts)
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:3000';
const outDir = process.argv[3] ?? 'screenshots';
const server = process.argv[4] ?? 'ws://localhost:8788';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
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
const until = async (fn, ms = 10000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(150);
  }
  return false;
};

async function join(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(`${url}/?online&debug&noshadows&noaa&nohalos&name=${name}&server=${encodeURIComponent(server)}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
  await page.evaluate(() => window.__solrift.forceLock());
  return page;
}
const hook = (page, fn, ...args) => page.evaluate(([f, a]) => window.__solrift[f](...a), [fn, args]);
const has = (page, testid) => page.locator(`[data-testid="${testid}"]`).count().then((n) => n > 0);
const click = (page, testid) => page.locator(`[data-testid="${testid}"]`).first().click();
const shot = async (page, name) => {
  await sleep(500);
  await page.screenshot({ path: `${outDir}/trade-${name}.png` });
};
const count = async (page, id) => (await hook(page, 'inventory')).reduce((n, s) => n + (s && s[0] === id ? s[1] : 0), 0);

console.log('joining');
const alice = await join('alice');

console.log('goods: alice carries her starting items, and both get some coins');
// The starting items (the emberstone and the map) cannot be traded: fetch some stone in creative mode.
await hook(alice, 'chat', '/gamemode creative');
check(await until(async () => (await hook(alice, 'mode')) === 'creative', 15000), 'alice is in creative to fetch stone');
await hook(alice, 'command', { t: 'inventory' });
await sleep(1200);
await hook(alice, 'command', { t: 'click', slot: 36, button: 0 });
await sleep(900);
await hook(alice, 'command', { t: 'click', slot: 0, button: 0 });
await sleep(900);
await hook(alice, 'command', { t: 'closeMenu' });
await sleep(1500);
await hook(alice, 'chat', '/gamemode survival');
check(await until(async () => (await hook(alice, 'mode')) === 'survival', 15000), 'alice is back in survival');
// Bob comes after, so the two pages do not share the machine while the big creative menu is up.
const bob = await join('bob');
check(await until(async () => (await hook(alice, 'others')).some((p) => p.name === 'bob')), 'alice sees bob');
await hook(alice, 'chat', '/coins 40');
await hook(bob, 'chat', '/coins 25');
check(await until(async () => (await hook(alice, 'coins')) === 40 && (await hook(bob, 'coins')) === 25, 15000), 'coins are in the purses');
const inv = await hook(alice, 'inventory');
const slot0 = 0;
check(!!inv[0], 'alice carries stone');
const first = inv[slot0]?.[0];
const firstCount = await count(alice, first);
const firstBob = await count(bob, first);
console.log('the target frame and the player menu');
// Bob stands 3 blocks east of alice, and alice turns to face him.
const ap = await hook(alice, 'position');
await hook(bob, 'chat', `/tp ${ap.x + 3} ${ap.y} ${ap.z}`);
check(await until(async () => Math.abs(((await hook(alice, 'others')).find((p) => p.name === 'bob')?.x ?? 0) - (ap.x + 3)) < 0.5, 20000), 'bob walked over');
const bp = (await hook(alice, 'others')).find((p) => p.name === 'bob');
await hook(alice, 'look', Math.atan2(-(bp.x - ap.x), -(bp.z - ap.z)), 0);
check(await until(() => has(alice, 'target-frame'), 8000), 'alice has bob in her target frame');
await shot(alice, 'target');
await alice.keyboard.press('KeyU');
check(await until(() => has(alice, 'player-menu')), 'U opens the menu of the target');
await shot(alice, 'menu');
const items = await alice.locator('#player-menu .pm-item').allTextContents();
console.log('menu:', items.join(' | '));
check(['Whisper', 'Inspect', 'Trade', 'Add friend', 'Ignore'].every((l) => items.includes(l)), 'the menu offers whisper, inspect, trade, friend and ignore');

console.log('asking to trade');
await alice.locator('#player-menu .pm-item[data-act="Trade"]').click();
check(await until(() => has(bob, 'trade-ask')), 'bob is asked to trade');
await shot(bob, 'ask');
await click(bob, 'trade-ask-accept');
check(await until(async () => (await has(alice, 'trade-window')) && (await has(bob, 'trade-window'))), 'the table opens for both');

console.log('filling the table');
await click(alice, `trade-bag-${slot0}`);
check(await until(() => has(alice, 'trade-mine-0')), 'alice put an item on the table');
await alice.locator('[data-testid="trade-coins"]').fill('15');
await alice.locator('[data-testid="trade-coins"]').press('Enter');
await bob.locator('[data-testid="trade-coins"]').fill('5');
await bob.locator('[data-testid="trade-coins"]').press('Enter');
check(await until(async () => (await bob.locator('[data-testid="trade-their-coins"]').textContent())?.includes('15')), 'bob sees the 15 coins alice offers');
await shot(alice, 'table-alice');
await shot(bob, 'table-bob');
await click(alice, 'trade-accept');
check(await until(async () => (await bob.locator('[data-testid="trade-their-state"]').textContent())?.includes('accepted')), 'bob sees that alice accepted');
await click(bob, 'trade-accept');
check(await until(async () => !(await has(alice, 'trade-window')) && !(await has(bob, 'trade-window'))), 'the table closes when both accepted');
await sleep(800);
check((await count(bob, first)) === firstBob + firstCount, `bob got the ${firstCount} item(s) from alice`);
check((await count(alice, first)) === 0, 'alice gave them up');
check((await hook(alice, 'coins')) === 40 - 15 + 5 && (await hook(bob, 'coins')) === 25 - 5 + 15, 'the coins changed hands');

console.log('calling it off');
await hook(alice, 'chat', '/trade bob');
check(await until(() => has(bob, 'trade-ask')), 'a second request arrives');
await hook(bob, 'chat', '/trade accept');
check(await until(() => has(alice, 'trade-window')), 'second table opens');
await alice.keyboard.press('Escape');
check(await until(async () => !(await has(alice, 'trade-window')) && !(await has(bob, 'trade-window'))), 'Escape calls the trade off for both');

console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
if (failures.length) {
  console.log(`${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('trade E2E passed');
