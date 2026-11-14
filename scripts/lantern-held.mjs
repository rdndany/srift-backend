// A lantern carried by its ring: first person, then the figure in third person (front view). Usage: node scripts/lantern-held.mjs outPrefix [soul]
// Takes <outPrefix>-fp.png, <outPrefix>-fp-swing.png and <outPrefix>-3p.png. The dev server must be running.
import { chromium } from 'playwright';

const [prefix, kind] = process.argv.slice(2);
const id = kind === 'empty' ? 0 : kind === 'soul' ? 1192 : 1190;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: Number(process.env.W ?? 1280), height: Number(process.env.H ?? 720) } })).newPage();
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
await page.evaluate((id) => {
  const s = window.__solrift;
  for (let x = 94; x <= 108; x++) for (let z = 94; z <= 106; z++) { for (let y = 151; y <= 158; y++) s.setBlock(x, y, z, 0); s.setBlock(x, 150, z, 1); }
  if (id) s.give(id, 1);
  s.select(id ? 0 : 5);
  s.teleport(101.5, 151, 103.5, 0, -0.1);
}, id);
await sleep(3000);
await page.screenshot({ path: `${prefix}-fp.png` });
await page.mouse.move(640, 360);
await page.mouse.down({ button: 'left' });
await sleep(110);
await page.screenshot({ path: `${prefix}-fp-swing.png` });
await page.mouse.up({ button: 'left' });
await page.evaluate(() => window.__solrift.setView(2));
await sleep(2500);
await page.screenshot({ path: `${prefix}-3p.png` });
await browser.close();
console.log('saved', prefix, msgs.slice(0, 6));
