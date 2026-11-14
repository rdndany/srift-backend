import { chromium } from 'playwright';
import sharp from 'sharp';

const [prefix, t0 = '0.2'] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall|willReadFrequently|preload|Blit feedback/.test(m.text()) && console.log('console:', m.text().slice(0, 400)));
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('http://localhost:3000/?seed=1337&debug&nomobs', { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate((t) => {
  document.getElementById('overlay').style.display = 'none';
  const s = window.__solrift;
  s.forceLock();
  s.setMode('survival');
  s.setTime(Number(t));
  s.teleport(101.5, 151, 103.5, 0, 0);
}, t0);
await sleep(9000);
await page.evaluate(() => {
  const s = window.__solrift;
  for (let x = 90; x <= 112; x++) for (let z = 80; z <= 112; z++) { for (let y = 151; y <= 175; y++) s.setBlock(x, y, z, 0); s.setBlock(x, 150, z, 1); }
  for (const [x, z, h] of [[97, 96, 8], [101, 94, 5], [105, 96, 7], [99, 92, 3]]) for (let y = 151; y < 151 + h; y++) s.setBlock(x, y, z, 1);
  for (let i = 0; i < 4; i++) for (let x = 102; x < 108; x++) s.setBlock(x + 0, 151 + i, 100 + i, 1);
  s.teleport(101.5, 151, 105.5, 0, -0.1);
  s.setView(1);
});
await sleep(2500);
const frames = [];
for (let i = 0; i < 8; i++) {
  await page.evaluate((t) => window.__solrift.setTime(Number(t)), Number(t0) + i * 0.0003);
  await sleep(700);
  const f = `${prefix}-${i}.png`;
  await page.screenshot({ path: f });
  frames.push(f);
}
await browser.close();
// How much each frame differs from the one before.
const raw = await Promise.all(frames.map((f) => sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true })));
const out = [];
for (let i = 1; i < raw.length; i++) {
  const a = raw[i - 1].data;
  const b = raw[i].data;
  let n = 0;
  for (let k = 0; k < a.length; k += 3) if (Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]) > 24) n++;
  out.push(n);
}
console.log('changed pixels between frames', out.join(' '));

