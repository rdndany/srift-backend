// The glow around torches and lanterns, near and far, at night and by day. Usage: node scripts/glow-look.mjs outPrefix
// Takes <outPrefix>-night-near.png, -night-far.png and -day-near.png. The dev server must be running.
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
  s.setTime(0.8);
  s.teleport(101.5, 151, 103.5, 0, 0);
});
await sleep(13000);
await page.evaluate(() => {
  const s = window.__solrift;
  const Y = 150;
  for (let x = 90; x <= 112; x++) {
    for (let z = 70; z <= 106; z++) {
      for (let y = Y + 1; y <= Y + 8; y++) s.setBlock(x, y, z, 0);
      s.setBlock(x, Y, z, 1);
    }
  }
  // Torch, lantern and soul lantern in a row, near; the same again far off.
  for (const z of [98, 80]) {
    s.setBlock(98, Y + 1, z, 23);
    s.setBlock(101, Y + 1, z, 1190);
    s.setBlock(104, Y + 1, z, 1192);
  }
  s.teleport(101.5, Y + 1, 103.5, 0, 0);
});
await sleep(9000);
await page.evaluate(() => window.__solrift.setHandHidden(true));
await sleep(500);
await page.screenshot({ path: `${prefix}-night-near.png` });
await page.evaluate(() => window.__solrift.teleport(101.5, 151, 94, 0, 0));
await sleep(1500);
await page.screenshot({ path: `${prefix}-night-far.png` });
await page.evaluate(() => {
  const s = window.__solrift;
  s.setTime(0.3);
  s.teleport(101.5, 151, 103.5, 0, 0);
});
await sleep(2500);
await page.screenshot({ path: `${prefix}-day-near.png` });
await page.evaluate(() => {
  const s = window.__solrift;
  s.setTime(0.8);
  for (let x = 96; x <= 108; x++) s.setBlock(x, 155, 98, 1);
  s.setBlock(100, 154, 98, 1191);
  s.setBlock(104, 154, 98, 1193);
  s.teleport(102, 151, 101, 0, 0.7);
});
await sleep(3000);
await page.screenshot({ path: prefix + '-hang-up.png' });
await page.evaluate(() => window.__solrift.teleport(102, 151, 101, 0, 0.2));
await sleep(1500);
await page.screenshot({ path: prefix + '-hang-side.png' });
await browser.close();
console.log('saved', prefix, msgs.slice(0, 6));
