// The ranger's hands in the first-person view: the bow (resting, half drawn, fully drawn), the dagger in the off hand stabbing, and a dagger in the main hand.
// Usage: node scripts/ranger-hand-look.mjs outPrefix [port=3000]   (a dev server of the web app must be running there)
import { chromium } from 'playwright';
import sharp from 'sharp';

const [prefix, port = '3000'] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
const msgs = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall|willReadFrequently|preload|Blit feedback/.test(m.text()) && msgs.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => msgs.push(e.message));
await page.goto(`http://localhost:${port}/?seed=1337&debug&nomobs&noshadows`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 240000 });
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
  s.give(303, 1); // bow
  s.give(266, 32); // arrows
  s.give(392, 1); // dagger (main hand, slot 2)
  s.setOffhand(392);
});
await sleep(1500);
const files = [];
const shot = async (n) => {
  const f = `${prefix}-${n}.png`;
  await page.screenshot({ path: f });
  files.push(f);
};
await page.evaluate(() => window.__solrift.select(0));
await sleep(900);
await shot('bow-idle');
// a left click: the bow goes away and the dagger comes out and stabs, then the bow comes back
await page.evaluate(() => window.__solrift.setLeft(true));
for (const ms of [60, 120, 150, 250]) {
  await sleep(ms);
  await shot(`stab-${ms}`);
}
await page.evaluate(() => window.__solrift.setLeft(false));
await sleep(500);
await shot('stab-after');
await sleep(1500);
await shot('bow-back');
// the same in third person (from the front): the bow in the hands, then the dagger of the left hand alone while it stabs
await page.evaluate(() => window.__solrift.setView(2));
await sleep(1200);
await shot('3p-idle');
await page.evaluate(() => window.__solrift.setLeft(true));
for (const ms of [90, 90, 90, 90]) {
  await sleep(ms);
  await shot(`3p-stab-${ms}-${files.length}`);
}
await page.evaluate(() => window.__solrift.setLeft(false));
await sleep(4500);
await shot('3p-back');
await page.evaluate(() => window.__solrift.setView(0));
await sleep(600);
// a bow drawn
await page.evaluate(() => window.__solrift.setRight(true));
await sleep(500);
await shot('draw-half');
await sleep(900);
await shot('draw-full');
await page.evaluate(() => window.__solrift.setRight(false));
await sleep(600);
// the dagger in the main hand
await page.evaluate(() => window.__solrift.select(2));
await sleep(900);
await shot('dagger-idle');
for (const [v, t] of [[0, 0.22], [0, 0.45], [0, 0.62], [1, 0.22], [1, 0.45], [1, 0.62]]) {
  await page.evaluate(([t, v]) => window.__solrift.holdSwing(t, v), [t, v]);
  await sleep(250);
  await shot(`dagger-v${v}-${t}`);
}
await page.evaluate(() => window.__solrift.holdSwing(null));
await browser.close();
const w = 480;
const h = 270;
const cols = 3;
const rows = Math.ceil(files.length / cols);
const comps = [];
for (let i = 0; i < files.length; i++) comps.push({ input: await sharp(files[i]).resize(w, h).toBuffer(), left: (i % cols) * w, top: Math.floor(i / cols) * h });
await sharp({ create: { width: cols * w, height: rows * h, channels: 3, background: '#000' } }).composite(comps).png().toFile(`${prefix}-sheet.png`);
console.log('saved', prefix, msgs.slice(0, 6));
