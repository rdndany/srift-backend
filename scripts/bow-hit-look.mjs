// Shoots a bow at a cow (the head, then the body) and at a wall in the real game, and saves what the screen shows just after: the hit marker, the numbers, the arrow in the wall.
// Usage: node scripts/bow-hit-look.mjs outPrefix [port=3000]   (a dev server of the web app must be running there)
import { chromium } from 'playwright';

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
  // a wall of stone to the left, for the arrow that misses
  for (let x = 94; x <= 98; x++) for (let y = 151; y <= 155; y++) s.setBlock(x, y, 92, 1);
  s.clearInventory();
  s.give(303, 1);
  s.give(266, 32);
  s.select(0);
});
await sleep(1500);
const shot = async (n) => page.screenshot({ path: `${prefix}-${n}.png` });
const loose = async (name, pitch, yaw = 0) => {
  await page.evaluate(([p, y]) => window.__solrift.teleport(101.5, 151, 103.5, y, p), [pitch, yaw]);
  await sleep(300);
  await page.evaluate(() => window.__solrift.setRight(true));
  await sleep(1300);
  await page.evaluate(() => window.__solrift.setRight(false));
  for (const ms of [120, 140, 200]) {
    await sleep(ms);
    await shot(`${name}-${ms}`);
  }
};
for (const [name, h] of [['head', 1.3], ['body', 0.6]]) {
  await page.evaluate(() => window.__solrift.clearMobs());
  await page.evaluate(() => window.__solrift.spawnMob('cow', 101.5, 151, 95.5));
  await sleep(500);
  await loose(name, -Math.atan2(1.62 - h, 8));
}
// the wall: left of the cow, a little above the ground
await loose('wall', 0.02, Math.atan2(5, 11));
await sleep(1500);
await shot('wall-late');
await browser.close();
console.log('saved', prefix, msgs.slice(0, 6));
