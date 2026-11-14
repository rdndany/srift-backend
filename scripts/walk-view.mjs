// The third-person view while walking: forward, strafing left and right, backward. For each, how the body is turned against the view (it should face
// where it walks) and a picture. Usage: node scripts/walk-view.mjs [class=mage] [outDir=screenshots/walk]   (the dev server must be running)
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const cls = process.argv[2] ?? 'mage';
const outDir = process.argv[3] ?? 'screenshots/walk';
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const errors = [];
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:3000/?seed=1337&debug&nomobs&noshadows&class=${cls}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
  window.__solrift.setTime(0.3);
  window.__solrift.setView(1);
});
await sleep(6000);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
for (const [name, key] of [['forward', 'KeyW'], ['left', 'KeyA'], ['back', 'KeyS'], ['right', 'KeyD']]) {
  await page.evaluate((k) => window.__solrift.holdKey(k, true), key);
  await sleep(1800);
  const f = await page.evaluate(() => window.__solrift.facing());
  await page.screenshot({ path: `${outDir}/${cls}-${name}.png` });
  await page.evaluate((k) => window.__solrift.holdKey(k, false), key);
  console.log(name.padEnd(8), 'body turned from the view by', ((wrap(f.body - f.yaw) * 180) / Math.PI).toFixed(0), 'degrees');
  await sleep(800);
}
await browser.close();
console.log('errors', errors.slice(0, 5));
