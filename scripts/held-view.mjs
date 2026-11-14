// The Mage's held items in first and third person. Usage: node scripts/held-view.mjs [slot=0] [outDir]   (slot = hotbar slot 0-8)
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const slot = Number(process.argv[2] ?? 0);
const outDir = process.argv[3] ?? 'screenshots/held';
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const errors = [];
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:3000/?seed=1337&debug&nomobs&class=mage', { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(([slot, give]) => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
  if (give) window.__solrift.give(give, 1);
  window.__solrift.select(slot);
  window.__solrift.setTime(0.3);
  window.__solrift.setView(0);
}, [slot, Number(process.env.GIVE || 0)]);
await sleep(3000);
await page.screenshot({ path: `${outDir}/slot${slot}-first.png` });
// Mid-swing (SWING_MS after the swing starts).
await page.evaluate(() => window.__solrift.swingHand());
await sleep(Number(process.env.SWING_MS || 170));
await page.screenshot({ path: `${outDir}/slot${slot}-swing.png` });
await sleep(1200);
await page.evaluate(() => window.__solrift.setView(1));
await sleep(1500);
await page.screenshot({ path: `${outDir}/slot${slot}-third.png` });
await page.evaluate(() => window.__solrift.setView(2));
await sleep(1500);
await page.screenshot({ path: `${outDir}/slot${slot}-front.png` });
await browser.close();
console.log('done', errors.slice(0, 5));
