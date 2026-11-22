// Map E2E: the minimap in the corner, the map item (hold it, right-click to open it in both hands, scroll to zoom,
// right-click again to put it away) and the underground view, with screenshots to look at.
// Usage: node scripts/map.mjs [url] [outDir]   (the game server needs CHEATS=1, as scripts/e2e.mjs sets)
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

const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${url}/?seed=1337&debug&nomobs&noshadows`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 120000 }).catch((e) => {
  console.log('the game never got ready; console errors:', errors.slice(0, 5));
  throw e;
});
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
});
const hook = (fn, ...args) => page.evaluate(([f, a]) => window.__solrift[f](...a), [fn, args]);
const state = () => hook('mapState');
const rightClick = async () => {
  await page.mouse.click(640, 360, { button: 'right' });
  await sleep(150);
};

console.log('no minimap in the corner');
check(await until(async () => (await state()).painted > 30, 20000), `the ground around is painted (${(await state()).painted} chunks)`);
check((await page.locator('[data-testid=minimap]').count()) === 0, 'there is no minimap on the screen: the map item is the way to see the map');
await page.keyboard.press('KeyJ');
await sleep(200);
check((await page.locator('[data-testid=minimap]').count()) === 0, 'and J brings none up');

console.log('the map item');
// A new character of the plain game carries a map on the bar; where it does not, hand one over. Either way, start with
// some other bar slot in hand (a map that is handed over lands in the first free slot, which may be the one in hand).
const mapSlot = () => page.evaluate(() => window.__solrift.inventory().findIndex((s) => s && s[0] === 390));
if ((await mapSlot()) < 0) await hook('give', 390, 1);
const slot = await mapSlot();
check(slot >= 0 && slot <= 8, `the map is on the bar (slot ${slot + 1})`);
const other = slot === 0 ? 1 : 0;
await hook('select', other);
await sleep(200);
await rightClick();
check(!(await state()).up, 'right-click with something else in hand does nothing');
await hook('select', slot);
await sleep(200);
await rightClick();
check(await until(async () => (await state()).up), 'right-click with the map in hand brings it close');
await sleep(700);
await page.screenshot({ path: `${outDir}/map-held.png` });

const zoom0 = (await state()).zoom;
await page.mouse.wheel(0, 100);
await sleep(200);
const zoom1 = (await state()).zoom;
check(zoom1 < zoom0, `scrolling down zooms out (${zoom0} -> ${zoom1})`);
check((await state()).up, 'the map stays up (the wheel did not change what is held)');
await page.mouse.wheel(0, -100);
await page.mouse.wheel(0, -100);
await sleep(300);
check((await state()).zoom > zoom1, 'scrolling up zooms in');
await page.screenshot({ path: `${outDir}/map-held-zoomed.png` });

await rightClick();
check(await until(async () => !(await state()).up), 'right-click again puts it away');
await rightClick();
check(await until(async () => (await state()).up), 'and it comes up again');
await hook('select', other);
check(await until(async () => !(await state()).up), 'holding something else puts it away');

console.log('the off hand and third person');
await hook('setOffhand', 390);
await hook('select', 8); // an empty hand
await sleep(300);
await sleep(600);
await page.screenshot({ path: `${outDir}/map-held-off.png` });
await rightClick();
await sleep(300);
check(!(await state()).up, 'the map in the off hand does not open on a right click (it is only carried)');
await hook('select', slot);
await sleep(300);
await hook('setView', 1);
await sleep(400);
await rightClick();
await sleep(300);
check(!(await state()).up, 'in third person right-click does not open it');
await hook('setView', 0);
await hook('setOffhand', 0);
await sleep(300);

console.log('underground');
const pos = await hook('position');
const cave = await hook('findCavePoint', 'cave', Math.floor(pos.x), Math.floor(pos.z));
if (cave) {
  await hook('setMode', 'creative');
  await hook('teleport', cave.x + 0.5, cave.y + 0.1, cave.z + 0.5);
  check(await until(async () => (await state()).underground, 8000), 'in a cave the map shows the level you are on');
  await sleep(1200);
} else console.log('  (no cave found near the start, skipped)');

await browser.close();
if (errors.length) {
  console.log('errors:', errors.slice(0, 5));
  failures.push('console errors');
}
if (failures.length) {
  console.log(`MAP E2E FAILED (${failures.length})`);
  process.exit(1);
}
console.log('MAP E2E passed');
