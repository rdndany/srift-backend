// Trading E2E: the people of a village come to life, a right-click opens the trade screen, an offer is
// chosen, paid for and taken (with shift-click for a stack of trades), the villager levels up, and walking
// away closes the screen. Saves `trading-*.png`.
// Usage: node scripts/trading.mjs [url] [outDir]   (the game server needs CHEATS=1, as scripts/e2e.mjs sets)
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const EMERALD = 379;
const RESULT_SLOT = 38;

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
const until = async (fn, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(200);
  }
  return false;
};

const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${url}/?seed=1337&debug&nomobs&villagers`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 120000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
});
const sc = (fn, ...args) => page.evaluate(fn, ...args);
const shot = async (name, wait = 800) => {
  await sleep(wait);
  await page.screenshot({ path: `${outDir}/trading-${name}.png` });
  console.log('saved', name);
};

const site = await sc(() => window.__solrift.nearestVillage(0, 0));
check(site !== null, `a village near the spawn (${JSON.stringify(site)})`);
const g = site.groundY;
await sc(([x, y, z]) => {
  window.__solrift.setTime(0.25);
  window.__solrift.teleport(x, y, z, 0, -0.1);
}, [site.x + 0.5, g + 2, site.z + 14.5]);

const villagers = () => sc(() => window.__solrift.mobs().filter((m) => m.kind === 'villager' && !m.dead));
check(await until(async () => (await villagers()).length >= 3, 60000), 'the village is full of villagers');
const all = await villagers();
console.log('  villagers:', all.length, 'variants', all.map((v) => v.variant & 15).join(','));
check(new Set(all.map((v) => v.variant & 15)).size >= 2, 'in more than one trade');
await shot('village', 2500);

// Find one with something to sell (profession index 2 and up: farmer, cleric, ...).
const trader = all.find((v) => (v.variant & 15) >= 2) ?? all[0];
console.log('  trading with', trader.id, 'profession', trader.variant & 15);

// Walk up to it and look at it.
{
  const t = (await villagers()).find((v) => v.id === trader.id);
  await sc(([x, y, z]) => window.__solrift.teleport(x, y, z, Math.PI / 2, -0.05), [t.x + 2.2, t.y + 0.1, t.z]);
  await shot('villager', 1200);
}
// Right-click: the trade screen.
await sc(() => window.__solrift.give(379, 40));
const talked = await sc((id) => window.__solrift.talkToMob(id), trader.id);
check(talked, 'talking to it does something');
check(await until(async () => (await sc(() => window.__solrift.screen())) === 'trade'), 'the trade screen opens');
await page.waitForSelector('.offer', { timeout: 5000 });
const offerCount = await page.locator('.offer').count();
check(offerCount >= 2, `with a list of offers (${offerCount})`);
check((await page.locator('#menu-screen .title').innerText()).includes('Novice'), `titled by trade and level ("${await page.locator('#menu-screen .title').innerText()}")`);
await shot('list');

// Pick an offer that sells something for emeralds.
const screen0 = await sc(() => window.__solrift.tradeScreen());
const buy = screen0.offers.findIndex((o) => o.a[0] === EMERALD && o.r[0] !== EMERALD);
check(buy >= 0, `it sells something for emeralds (offer ${buy})`);
await page.locator(`.offer[data-offer="${buy}"]`).click();
check(await until(async () => (await sc(() => window.__solrift.tradeScreen()))?.selected === buy), 'choosing an offer selects it');
check(await until(async () => (await page.locator(`[data-slot="${RESULT_SLOT}"] img`).count()) > 0), 'the result shows in the output slot');
await shot('selected');

// Take one.
const wanted = screen0.offers[buy];
const emeraldsBefore = await sc((id) => window.__solrift.countOf(id), EMERALD);
await page.locator(`[data-slot="${RESULT_SLOT}"]`).click();
await sleep(500);
const afterOne = await sc(() => window.__solrift.tradeScreen());
check(afterOne.offers[buy].uses === 1, 'one trade is counted');
check(afterOne.xp > screen0.xp, `and gives the villager experience (${afterOne.xp})`);
// The cursor holds the result; drop it into the inventory.
await page.locator('[data-slot="1"]').click();
await sleep(300);
const sold = await sc((id) => window.__solrift.countOf(id), wanted.r[0]);
check(sold >= wanted.r[1], `the goods are in the inventory (${sold})`);
const emeraldsPaid = emeraldsBefore - (await sc((id) => window.__solrift.countOf(id), EMERALD));
check(emeraldsPaid >= wanted.a[1], `and the emeralds were spent (${emeraldsPaid})`);

// Shift-click trades until it is used up or the money is gone; the villager levels up on the way.
await page.locator(`[data-slot="${RESULT_SLOT}"]`).click({ modifiers: ['Shift'] });
await sleep(600);
const afterMany = await sc(() => window.__solrift.tradeScreen());
check(afterMany.offers[buy].uses > 1, `shift-click trades again and again (${afterMany.offers[buy].uses} uses)`);
check(afterMany.level >= 2 || afterMany.xp > afterOne.xp, `the villager has more experience (level ${afterMany.level}, ${afterMany.xp} xp)`);
await shot('traded');

// Walking away closes the screen.
await sc(([x, y, z]) => window.__solrift.teleport(x, y, z), [site.x + 60.5, g + 3, site.z + 60.5]);
check(await until(async () => (await sc(() => window.__solrift.screen())) === 'none', 8000), 'walking away closes the trade screen');

const real = errors.filter((e) => !/favicon|404|Failed to load resource|ERR_|WebSocket/i.test(e));
check(real.length === 0, `no console errors${real.length ? `: ${real.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\ntrading ok');
