// Third-person Ground Slam. Usage: node scripts/slam-fp.mjs outPrefix
import { chromium } from 'playwright';

const [prefix] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
const msgs = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall|willReadFrequently|preload|Blit feedback/.test(m.text()) && msgs.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => msgs.push(e.message));
await page.goto('http://localhost:3000/?seed=1337&debug&nomobs&noshadows&class=warrior', { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  const s = window.__solrift;
  s.forceLock();
  s.setMode('survival');
  s.setTime(0.5);
  s.teleport(101.5, 151, 103.5, 0, 0);
});
await sleep(9000);
await page.evaluate(() => {
  const s = window.__solrift;
  for (let x = 90; x <= 112; x++) for (let z = 80; z <= 112; z++) { for (let y = 151; y <= 175; y++) s.setBlock(x, y, z, 0); s.setBlock(x, 150, z, 1); }
  s.teleport(101.5, 151, 103.5, 0, 0);
  s.clearInventory();
  s.give(400, 1);
  s.give(391, 1);
  s.setOffhand(344);
});
await sleep(1500);
await page.evaluate(() => window.__solrift.select(0));
await page.evaluate(() => window.__solrift.setRight(true));
await sleep(800);
await page.evaluate(() => window.__solrift.setRight(false));
await sleep(500);
await page.evaluate(() => window.__solrift.select(1));
await sleep(800);
const info = await page.evaluate(() => ({ cls: JSON.stringify(window.__solrift.classView?.() ?? null).slice(0, 200) }));
console.log(info);
const shot = (n) => page.screenshot({ path: `${prefix}-${n}.png` });
await shot('0-idle');
await page.evaluate(() => window.__solrift.setView(2));
await sleep(600);
await page.keyboard.press('KeyZ');
for (let i = 0; i < 14; i++) {
  await shot(`f${i}`);
}
await sleep(1500);
await shot('end');
await browser.close();
console.log('saved', prefix, msgs.slice(0, 6));

