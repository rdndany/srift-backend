// The map item in the hands. Usage: node scripts/map-look.mjs outPrefix [main|off|third] [time=0.25]
// Takes <outPrefix>-down.png (the map held low), <outPrefix>-up.png (opened in both hands), and for `off` the main hand empty. The dev server must be running.
import { chromium } from 'playwright';

const [prefix, where = 'main', time = '0.25'] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const msgs = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall|willReadFrequently|preload/.test(m.text()) && msgs.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => msgs.push(e.message));
await page.goto('http://localhost:3000/?seed=1337&debug&nomobs&noshadows', { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(([where, time]) => {
  document.getElementById('overlay').style.display = 'none';
  const s = window.__solrift;
  s.forceLock();
  s.setMode('creative');
  s.setTime(Number(time));
  s.give(390, 1);
  const slot = s.inventory().findIndex((x) => x && x[0] === 390);
  if (where === 'off') {
    s.setOffhand(390);
    s.select(8); // an empty hand
  } else s.select(slot);
  if (where === 'third') s.setView(1);
}, [where, time]);
await sleep(12000);
await page.screenshot({ path: `${prefix}-down.png` });
await page.mouse.click(640, 360, { button: 'right' });
await sleep(2500);
console.log('state', JSON.stringify(await page.evaluate(() => window.__solrift.mapState())));
await page.screenshot({ path: `${prefix}-up.png` });
await browser.close();
console.log('saved', prefix, msgs.slice(0, 6));
