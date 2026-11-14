// What the first-person hand shows: gives items and photographs each one held.
// Usage: node scripts/held-look.mjs [outDir] [class=mage]   (the dev server must be running)
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const outDir = process.argv[2] ?? 'screenshots/held';
const cls = process.argv[3] ?? 'mage';
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ITEMS = [
  ['iron_sword', 287],
  ['diamond_pickaxe', 274],
  ['stone_axe', 276],
  ['gold_shovel', 283],
  ['greatsword', 391],
  ['dagger', 392],
  ['bow', 303],
  ['apple', 261],
  ['shield', 344],
];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const msgs = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall|willReadFrequently|preload/.test(m.text()) && msgs.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => msgs.push(e.message));
await page.goto(`http://localhost:3000/?seed=1337&debug&nomobs&class=${cls}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
  window.__solrift.setMode('creative');
  window.__solrift.setTime(0.3);
  window.__solrift.setView(0);
  // Somewhere with a plain sky behind the hand: look up a little.
  window.__solrift.teleport(12, 120, 20, 0.4, 0.15);
  window.__solrift.setFlying(true);
});
for (const [, id] of ITEMS) await page.evaluate((id) => window.__solrift.give(id, 1), id);
await sleep(1500);
for (let i = 0; i < ITEMS.length; i++) {
  // The slots after whatever the class starts with.
  const slot = await page.evaluate((id) => window.__solrift.slotOf?.(id) ?? -1, ITEMS[i][1]);
  await page.evaluate((s) => window.__solrift.select(s), slot >= 0 ? slot : 3 + i);
  await sleep(2500);
  await page.screenshot({ path: `${outDir}/${ITEMS[i][0]}.png`, clip: { x: 640, y: 260, width: 640, height: 460 } });
  console.log('saved', ITEMS[i][0]);
}
await browser.close();
console.log('messages', msgs.slice(0, 6));
