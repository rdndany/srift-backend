// The player's own shadow (and a cow's) on the ground, seen from four sides, on a grass platform built in open air.
// Usage: node scripts/entity-shadow.mjs outPrefix [time=0.1]   (env EXTRA='&noentshadows' to compare). Writes <outPrefix>-0..3.png
import { chromium } from 'playwright';

const [prefix, time = '0.1'] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const msgs = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall|willReadFrequently|preload/.test(m.text()) && msgs.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => msgs.push(e.message));
await page.goto(`http://localhost:3000/?seed=1337&debug&nomobs&class=warrior${process.env.EXTRA ?? ''}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
const spot = await page.evaluate(() => {
  const s = window.__solrift;
  const p = s.position();
  const x = Math.floor(p.x);
  const z = Math.floor(p.z);
  const y = 110;
  s.setMode('creative');
  for (let dx = -9; dx <= 9; dx++) for (let dz = -9; dz <= 9; dz++) {
    s.setBlock(x + dx, y, z + dz, 3);
    s.setBlock(x + dx, y - 1, z + dz, 2);
  }
  return { x, z, h: y };
});
console.log('platform', spot);
await page.evaluate(([time, spot]) => {
  const s = window.__solrift;
  document.getElementById('overlay').style.display = 'none';
  s.forceLock();
  s.setFlying(true);
  s.setTime(Number(time));
  s.setPostfx(false);
  s.teleport(spot.x + 0.5, spot.h + 2, spot.z + 0.5, 0.6, -0.35);
  s.setView(1);
  s.spawnMob('cow', spot.x + 3.5, spot.h + 1, spot.z - 1.5, 0);
}, [time, spot]);
for (let i = 0; i < 4; i++) {
  await page.evaluate(([spot, yaw]) => window.__solrift.teleport(spot.x + 0.5, spot.h + 2, spot.z + 0.5, yaw, -0.45), [spot, i * (Math.PI / 2)]);
  await sleep(9000);
  await page.screenshot({ path: `${prefix}-${i}.png` });
}
await browser.close();
console.log('saved', prefix, msgs.slice(0, 5));
