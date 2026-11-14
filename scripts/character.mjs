// Character E2E: the skinned model in the inventory screen (turning when dragged), in third person,
// and on another player, with screenshots to look at.
// Usage: node scripts/character.mjs [url] [outDir]   (the game server needs CHEATS=1, as scripts/e2e.mjs sets)
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

async function open(path, name, scale = 2) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(`${url}/${path}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 120000 });
  await page.evaluate(() => {
    const o = document.getElementById('overlay');
    if (o) o.style.display = 'none';
    window.__solrift.forceLock();
  });
  return page;
}
const hook = (page, fn, ...args) => page.evaluate(([f, a]) => window.__solrift[f](...a), [fn, args]);

// ---------------------------------------------------------------------------------------------------
console.log('inventory');
const page = await open('?seed=1337&debug&nomobs&noshadows', 'solo');
await hook(page, 'openMenu', 'inventory');
check(await until(async () => (await page.locator('canvas.char-preview').count()) === 1), 'the character is drawn');
const box = page.locator('.char-box');
await page.mouse.move(40, 40);
await sleep(600);
await box.screenshot({ path: `${outDir}/character-inventory-front.png` });

const cv = await page.locator('canvas.char-preview').boundingBox();
const cx = cv.x + cv.width / 2;
const cy = cv.y + cv.height / 2;
const dragBy = async (dx) => {
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(cx + (dx * i) / 10, cy);
  await sleep(300);
};
await dragBy(90);
await box.screenshot({ path: `${outDir}/character-inventory-side.png` });
await page.mouse.up();
await page.mouse.move(cx, cy);
await page.mouse.down();
for (let i = 1; i <= 20; i++) await page.mouse.move(cx + 13 * i, cy);
await sleep(300);
await box.screenshot({ path: `${outDir}/character-inventory-back.png` });
await page.mouse.up();
await sleep(1800);
const before = await box.screenshot();
await sleep(700);
const after = await box.screenshot();
check(!before.equals(after), 'the figure is alive: it breathes');
await hook(page, 'closeMenu');

console.log('third person');
await hook(page, 'setView', 1);
await sleep(700);
await page.screenshot({ path: `${outDir}/character-third-back.png`, clip: { x: 390, y: 120, width: 500, height: 440 } });
await hook(page, 'setView', 2);
await sleep(700);
await page.screenshot({ path: `${outDir}/character-third-front.png`, clip: { x: 390, y: 120, width: 500, height: 440 } });
await page.context().close();

console.log('other players');
const alice = await open('?online&debug&noshadows&name=alice', 'alice');
const bob = await open('?online&debug&noshadows&name=bob', 'bob', 1);
const carol = await open('?online&debug&noshadows&name=carol', 'carol', 1);
for (const w of [alice, bob, carol]) await hook(w, 'chat', '/gamemode creative');
check(await until(async () => (await hook(alice, 'others')).length >= 2, 15000), 'alice sees the others');
const pos = await hook(alice, 'position');
const at = async (page, x, z, yaw) => {
  await hook(page, 'chat', `/tp ${x} ${pos.y + 1} ${z}`);
  await hook(page, 'look', yaw, 0);
};
await hook(alice, 'look', 0, 0);
// bob stands in front of alice facing her, carol next to him seen from the side.
await at(bob, pos.x - 0.9, pos.z - 3.2, Math.PI);
await at(carol, pos.x + 0.9, pos.z - 3.2, Math.PI / 2);
await sleep(3000);
await alice.screenshot({ path: `${outDir}/character-others.png`, clip: { x: 340, y: 130, width: 600, height: 420 } });
await at(bob, pos.x - 0.9, pos.z - 3.2, 0);
await at(carol, pos.x + 0.9, pos.z - 3.2, -Math.PI / 2);
await sleep(2500);
await alice.screenshot({ path: `${outDir}/character-others-back.png`, clip: { x: 340, y: 130, width: 600, height: 420 } });

await browser.close();
if (errors.length) {
  console.log('errors:', errors.slice(0, 5));
  failures.push('console errors');
}
if (failures.length) {
  console.log(`CHARACTER E2E FAILED (${failures.length})`);
  process.exit(1);
}
console.log('CHARACTER E2E passed');
