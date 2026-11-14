// Dropped items lying on the ground, seen from a little above. Usage: node scripts/drops-look.mjs outPrefix
import { chromium } from 'playwright';

const [prefix] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const msgs = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall|willReadFrequently|preload/.test(m.text()) && msgs.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => msgs.push(e.message));
await page.goto('http://localhost:3000/?seed=1337&debug&nomobs&noshadows', { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  const s = window.__solrift;
  s.forceLock();
  s.setMode('creative');
  s.setTime(0.3);
  s.teleport(101.5, 151, 103.5, 0, 0);
});
await sleep(9000);
await page.evaluate(() => {
  const s = window.__solrift;
  for (let x = 94; x <= 112; x++) for (let z = 94; z <= 108; z++) { for (let y = 151; y <= 158; y++) s.setBlock(x, y, z, 0); s.setBlock(x, 150, z, 1); }
  s.teleport(101.5, 151, 105.5, 0, -0.45);
  s.setHandHidden(true);
  // blocks: stone, grass, log?, torch, furnace, glass, rose; items: stick, diamond, apple, bread, bucket, feather, greatsword, lantern
  s.spawnDrops([1, 3, 21, 17, 23, 29, 1190], 97.6, 151.4, 100.5, 1.0);
  s.spawnDrops([256, 260, 261, 300, 330, 333, 391], 97.6, 151.4, 102.5, 1.0);
});
await sleep(3500);
await page.screenshot({ path: `${prefix}-a.png` });
await sleep(700);
await page.screenshot({ path: `${prefix}-b.png` });
await browser.close();
console.log('saved', prefix, msgs.slice(0, 6));
