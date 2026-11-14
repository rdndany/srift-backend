// Lanterns and chains: standing, hanging, on chains, and one in the hand. Usage: node scripts/lantern-look.mjs outPrefix
// Takes <outPrefix>-row.png (the lot, at night), <outPrefix>-close.png (a closer look) and <outPrefix>-held-lantern.png / -held-soul.png
// (the hand, in the dark, with the terrain lit by it). The dev server must be running.
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
await sleep(7000);
await page.evaluate(() => {
  const s = window.__solrift;
  const Y = 150;
  const LANTERN = 1190, LANTERN_HANG = 1191, SOUL = 1192, SOUL_HANG = 1193, CHAIN = 1194, STONE = 1;
  for (let x = 94; x <= 108; x++) {
    for (let z = 94; z <= 106; z++) {
      for (let y = Y + 1; y <= Y + 8; y++) s.setBlock(x, y, z, 0);
      s.setBlock(x, Y, z, STONE);
    }
  }
  for (let x = 94; x <= 108; x++) s.setBlock(x, Y + 5, 98, STONE);
  s.setBlock(98, Y + 1, 98, LANTERN);
  s.setBlock(100, Y + 1, 98, SOUL);
  s.setBlock(102, Y + 4, 98, CHAIN);
  s.setBlock(102, Y + 3, 98, CHAIN);
  s.setBlock(102, Y + 2, 98, LANTERN_HANG);
  s.setBlock(104, Y + 4, 98, CHAIN);
  s.setBlock(104, Y + 3, 98, CHAIN);
  s.setBlock(104, Y + 2, 98, SOUL_HANG);
  s.setBlock(106, Y + 4, 98, LANTERN_HANG);
  s.setBlock(96, Y + 4, 98, SOUL_HANG);
  s.setBlock(108, Y + 1, 98, CHAIN);
  s.teleport(101.5, Y + 1, 103.5, 0, 0);
});
await sleep(9000);
await page.evaluate(() => window.__solrift.setHandHidden(true));
await sleep(500);
await page.screenshot({ path: `${prefix}-row.png` });
await page.evaluate(() => window.__solrift.teleport(101, 151 + 0, 100.6, 0, 0.1));
await sleep(1500);
await page.screenshot({ path: `${prefix}-close.png` });
// In the hand, away from every other light.
for (const [slot, [name, id]] of [['lantern', 1190], ['soul', 1192]].entries()) {
  await page.evaluate(([id, slot]) => {
    const s = window.__solrift;
    for (const [x, y, z] of [[98, 151, 98], [100, 151, 98], [102, 152, 98], [104, 152, 98], [106, 154, 98], [96, 154, 98]]) s.setBlock(x, y, z, 0);
    s.give(id, 1);
    s.select(slot * 3);
    s.setHandHidden(false);
    s.teleport(101.5, 151, 103.5, 0, -0.15);
  }, [id, slot]);
  await sleep(2500);
  await page.screenshot({ path: `${prefix}-held-${name}.png` });
}
await browser.close();
console.log('saved', prefix, msgs.slice(0, 6));
