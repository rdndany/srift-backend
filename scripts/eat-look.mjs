// Eating: first person (a few moments of the meal) and third person (behind and in front). Usage: node scripts/eat-look.mjs outPrefix [itemId]
import { chromium } from 'playwright';

const [prefix, idArg] = process.argv.slice(2);
const id = Number(idArg ?? 300); // bread
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
  s.setMode('survival');
  s.setTime(0.3);
  s.teleport(101.5, 151, 103.5, 0, 0);
});
await sleep(9000);
await page.evaluate((id) => {
  const s = window.__solrift;
  for (let x = 94; x <= 108; x++) for (let z = 94; z <= 106; z++) { for (let y = 151; y <= 158; y++) s.setBlock(x, y, z, 0); s.setBlock(x, 150, z, 1); }
  s.give(id, 8);
  s.select(0);
  s.setHunger(2);
  s.teleport(101.5, 151, 103.5, 0, -0.05);
}, id);
await sleep(2500);
await page.screenshot({ path: `${prefix}-fp-rest.png` });
await page.evaluate(() => window.__solrift.setRight(true));
for (let i = 0; i < 5; i++) {
  await sleep(i === 0 ? 450 : 130);
  await page.screenshot({ path: `${prefix}-fp-${i}.png` });
}
await page.evaluate(() => window.__solrift.setRight(false));
await sleep(500);
await page.evaluate(() => { window.__solrift.setHunger(2); window.__solrift.setView(2); });
await sleep(2000);
await page.evaluate(() => window.__solrift.setRight(true));
for (let i = 0; i < 4; i++) {
  await sleep(i === 0 ? 450 : 130);
  await page.screenshot({ path: `${prefix}-front-${i}.png`, clip: { x: 340, y: 60, width: 600, height: 520 } });
}
await page.evaluate(() => window.__solrift.setRight(false));
await sleep(400);
await page.evaluate(() => { window.__solrift.setHunger(2); window.__solrift.setView(1); });
await sleep(1500);
await page.evaluate(() => window.__solrift.setRight(true));
await sleep(600);
await page.screenshot({ path: `${prefix}-back.png`, clip: { x: 340, y: 60, width: 600, height: 520 } });
console.log(await page.evaluate(() => window.__solrift.eatState()));
await browser.close();
console.log('saved', prefix, msgs.slice(0, 6));
