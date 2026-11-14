// The Emberstone cast. Usage: node scripts/levelup-look.mjs outPrefix [time 0..1]
import { chromium } from 'playwright';

const [prefix, timeArg] = process.argv.slice(2);
const time = Number(timeArg ?? 0.8);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const msgs = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall|willReadFrequently|preload|Blit feedback/.test(m.text()) && msgs.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => msgs.push(e.message));
await page.goto('http://localhost:3000/?seed=1337&debug&nomobs&noshadows', { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate((time) => {
  document.getElementById('overlay').style.display = 'none';
  const s = window.__solrift;
  s.forceLock();
  s.setMode('survival');
  s.setTime(time);
  s.teleport(101.5, 151, 103.5, 0, 0);
}, time);
await sleep(9000);
await page.evaluate(() => {
  const s = window.__solrift;
  for (let x = 90; x <= 112; x++) for (let z = 90; z <= 112; z++) { for (let y = 151; y <= 165; y++) s.setBlock(x, y, z, 0); s.setBlock(x, 150, z, 1); }
  s.teleport(101.5, 151, 103.5, 0, 0);
});
await sleep(2000);
await page.evaluate(() => { const s = window.__solrift; s.give?.('emberstone', 1); s.select(1); s.setRight(true); });
for (let i = 0; i < 3; i++) {
  await sleep(i === 0 ? 1200 : 1000);
  await page.screenshot({ path: `${prefix}-fp-${i}.png` });
}
await page.evaluate(() => window.__solrift.setRight(false));
await sleep(1500);
await page.evaluate(() => { const s = window.__solrift; s.setView(1); });
await sleep(1500);
await page.evaluate(() => window.__solrift.setRight(true));
for (let i = 0; i < 4; i++) {
  await sleep(i === 0 ? 1500 : 800);
  await page.screenshot({ path: `${prefix}-tp-${i}.png` });
}
await browser.close();
console.log('saved', prefix, msgs.slice(0, 6));