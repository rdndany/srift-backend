// Experience E2E: experience from a kill goes straight to the player (no orbs), the green bar and level number show in the HUD,
// the level survives a reload, death costs a share of it, and the same works online (server-authoritative).
// Usage: node scripts/xp.mjs [url] [outDir]   (the game server needs CHEATS=1, as scripts/e2e.mjs sets)
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
const until = async (fn, ms = 10000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(100);
  }
  return false;
};

async function open(path, name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(`${url}/${path}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 120000 });
  await page.evaluate(() => {
    document.getElementById('overlay').style.display = 'none';
    window.__solrift.forceLock();
  });
  return page;
}
const sc = (page, fn, ...args) => page.evaluate(fn, ...args);
const xp = (page) => sc(page, () => window.__solrift.xp());
const hudLevel = (page) => page.locator('#xp').getAttribute('data-level').catch(() => null);

// ---------------------------------------------------------------------------------------------------
console.log('single player');
const page = await open('?seed=1337&debug&nomobs', 'solo');
let s = await xp(page);
check(s.level === 0 && s.progress === 0, 'a new player is level 0 with an empty bar');
check((await hudLevel(page)) === '0', 'the HUD shows the bar');

const pos = await sc(page, () => window.__solrift.position());
const id = await sc(page, ([x, y, z]) => window.__solrift.spawnMob('zombie', x, y, z), [pos.x + 2.5, pos.y + 1, pos.z]);
await sc(page, (mobId) => window.__solrift.damageMob(mobId, 100), id);
s = await xp(page);
check(await until(async () => Math.abs((await xp(page)).progress - 5 / 7) < 0.01), 'killing a zombie gives the experience at once');
s = await xp(page);
check(s.level === 0 && Math.abs(s.progress - 5 / 7) < 0.01, `a zombie is worth 5 points (bar ${s.progress.toFixed(2)})`);
check((await page.locator('#xp').getAttribute('data-progress')) === '0.714', 'the bar in the HUD shows it');

await sc(page, () => window.__solrift.addXp(100));
s = await xp(page);
check(s.level >= 5, `100 points more is a level jump (level ${s.level})`);
check(await until(async () => (await hudLevel(page)) === String(s.level)), 'the level number in the HUD follows');
await sleep(300);
await page.screenshot({ path: `${outDir}/xp-bar.png` });

console.log('reload keeps the level');
const level = s.level;
await sc(page, () => window.__solrift.addXp(1));
await sc(page, () => window.__solrift.save()); // write it now (the autosave runs on game time, which is slow here)
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 120000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
});
check((await xp(page)).level >= level, `level ${level} is still there after reload`);

console.log('creative hides it');
await sc(page, () => window.__solrift.setMode('creative'));
check(await until(async () => (await page.locator('#xp').count()) === 0), 'the bar is hidden in creative mode');
await sc(page, () => window.__solrift.setMode('survival'));

console.log('death costs a share of the experience');
const levelBefore = (await xp(page)).level;
await sc(page, () => window.__solrift.damage(100));
check(await until(async () => (await sc(page, () => window.__solrift.screen())) === 'dead'), 'the player dies');
s = await xp(page);
check(s.level < levelBefore && s.level > 0, `some experience is lost, not all (level ${levelBefore} -> ${s.level})`);

// ---------------------------------------------------------------------------------------------------
console.log('online');
const online = await open(`?online&debug&name=xpuser${Date.now() % 10000}`, 'online');
await sc(online, () => window.__solrift.chat('/xp 10L'));
check(await until(async () => (await xp(online)).level === 10), 'the server grants levels and the client shows them');
check(await until(async () => (await hudLevel(online)) === '10'), 'the HUD shows level 10 online');
await online.screenshot({ path: `${outDir}/xp-online.png` });

await browser.close();
const real = errors.filter((e) => !/favicon|WebSocket|ERR_CONNECTION|Failed to load resource/i.test(e));
if (real.length) {
  console.log('console errors:', real);
  failures.push('console errors');
}
if (failures.length) {
  console.log(`XP E2E FAILED (${failures.length})`);
  process.exit(1);
}
console.log('XP E2E passed');
