// The three death effects. Usage: node scripts/idle-look.mjs outPrefix
import { chromium } from 'playwright';
import sharp from 'sharp';

const [prefix] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
const msgs = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall|willReadFrequently|preload|Blit feedback/.test(m.text()) && msgs.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => msgs.push(e.message));
await page.goto('http://localhost:3000/?seed=1337&debug&nomobs&noshadows', { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  const s = window.__solrift;
  s.forceLock();
  s.setMode('survival');
  s.setTime(0.35);
  s.teleport(101.5, 151, 103.5, 0, 0);
});
await sleep(9000);
await page.evaluate(() => {
  const s = window.__solrift;
  for (let x = 90; x <= 112; x++) for (let z = 80; z <= 112; z++) { for (let y = 151; y <= 175; y++) s.setBlock(x, y, z, 0); s.setBlock(x, 150, z, 1); }
  s.teleport(101.5, 151, 103.5, 0, 0);
  s.clearInventory();
  s.give(287, 1);
  s.select(0);
  s.setView(2);
});
await sleep(1500);
const files = [];
const shot = async (n) => {
  const f = `${prefix}-${n}.png`;
  await page.screenshot({ path: f });
  files.push(f);
};
for (let v = 0; v < 3; v++) {
  await page.evaluate(() => window.__solrift.setView(2));
  await sleep(800);
  for (const [i, wait] of [[0, 0], [1, 250], [2, 300], [3, 500], [4, 700], [5, 1000]]) {
    if (i === 0) {
      await shot(`v${v}-before`);
      await page.evaluate((k) => window.__solrift.die(k), v);
      await sleep(100);
    } else await sleep(wait);
    await shot(`v${v}-${i}`);
  }
  await page.waitForFunction(() => window.__solrift.dyingDone(), undefined, { timeout: 60000 });
}
const W = 400, H = 260;
const cells = files.map((f, k) => ({ input: f, left: (k % 7) * W, top: Math.floor(k / 7) * H }));
const resized = await Promise.all(cells.map(async (c) => ({ ...c, input: await sharp(c.input).extract({ left: 280, top: 110, width: 400, height: 260 }).toBuffer() })));
await sharp({ create: { width: W * 7, height: H * 3, channels: 3, background: '#000' } }).composite(resized).png().toFile(`${prefix}-sheet.png`);
console.log('errors:', msgs);
await browser.close();
