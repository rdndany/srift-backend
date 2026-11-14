// The block-breaking animation: a block mined by hand, a picture every little while. Usage: node scripts/break-look.mjs outPrefix [blockId]
import { chromium } from 'playwright';

const [prefix, blockArg] = process.argv.slice(2);
const block = Number(blockArg ?? 1);
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
await sleep(13000);
await page.evaluate((block) => {
  const s = window.__solrift;
  for (let x = 96; x <= 106; x++) for (let z = 96; z <= 106; z++) { for (let y = 151; y <= 156; y++) s.setBlock(x, y, z, 0); s.setBlock(x, 150, z, 1); }
  s.setBlock(101, 152, 101, block);
  s.select(8);
  s.teleport(101.5, 151, 103.5, 0, 0);
}, block);
await sleep(2500);
await page.evaluate(() => window.__solrift.setHandHidden(true));
await page.mouse.move(640, 360);
await page.mouse.down({ button: 'left' });
for (let i = 0; i < 10; i++) {
  await sleep(i === 0 ? 500 : 700);
  await page.screenshot({ path: prefix + '-' + i + '.png', clip: { x: 340, y: 160, width: 600, height: 400 } });
}
await page.mouse.up({ button: 'left' });
await browser.close();
console.log('saved', prefix, msgs.slice(0, 6));
