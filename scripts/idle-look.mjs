// The idle animations in third person. Usage: node scripts/idle-look.mjs outPrefix
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
await shot('stand');
for (const [name, kind, waits] of [['sit', 1, [1500, 1500]], ['stretch', 2, [1000, 800, 800]], ['look', 3, [1200, 1200, 1200]]]) {
  await page.evaluate((k) => window.__solrift.idle(k), kind);
  for (let i = 0; i < waits.length; i++) {
    await sleep(waits[i]);
    await shot(`${name}-${i}`);
  }
  await page.evaluate(() => window.__solrift.idle(0));
  await sleep(1500);
}
await page.evaluate(() => {
  window.__solrift.setView(1);
  window.__solrift.idle(1);
});
await sleep(3000);
await shot('sit-back');
await page.evaluate(() => window.__solrift.teleport(101.5, 151, 103.5, 0, 0.7));
await sleep(2500);
await shot('sit-above');
await page.evaluate(() => window.__solrift.setView(2));
await sleep(2000);
await shot('sit-above-front');
await browser.close();
const cols = 3;
const w = 480;
const h = 270;
const comps = [];
for (let i = 0; i < files.length; i++) comps.push({ input: await sharp(files[i]).resize(w, h).toBuffer(), left: (i % cols) * w, top: Math.floor(i / cols) * h });
await sharp({ create: { width: cols * w, height: Math.ceil(files.length / cols) * h, channels: 3, background: '#000' } }).composite(comps).png().toFile(`${prefix}-sheet.png`);
console.log('saved', prefix, msgs.slice(0, 6));
