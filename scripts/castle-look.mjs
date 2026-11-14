// Look at the nearest castle from outside and inside. Usage: node scripts/castle-look.mjs [outDir] [seed] [only=name,name]
// (the dev server must be running)
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const outDir = process.argv[2] ?? 'screenshots/castle';
const seed = process.argv[3] ?? '1337';
const only = process.argv[4] && process.argv[4] !== '-' ? process.argv[4].split(',') : null;
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const msgs = [];
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall|willReadFrequently|preload/.test(m.text()) && msgs.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => msgs.push(e.message));
await page.goto(`http://localhost:3000/?seed=${seed}&debug&nomobs&class=mage`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
  window.__solrift.setMode('creative');
  window.__solrift.setTime(0.3);
});
const c = await page.evaluate(() => window.__solrift.nearestStructure('castle', 0, 0));
console.log('castle', c && { x: c.x, y: c.y, z: c.z, minX: c.minX, maxX: c.maxX, minZ: c.minZ, maxZ: c.maxZ });
if (!c) process.exit(1);

const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
const look = (from, to) => {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const pitch = Math.atan2(to[1] - from[1], Math.hypot(dx, dz));
  return [from[0], from[1], from[2], yawTo(dx, dz), pitch];
};
const mid = [c.x + 0.5, c.y + 8, c.z + 0.5];
const shots = [
  ['out-s', look([c.x + 0.5, c.y + 14, c.z - 52], mid)],
  ['out-e', look([c.x + 52, c.y + 14, c.z + 0.5], mid)],
  ['out-n', look([c.x + 0.5, c.y + 14, c.z + 52], mid)],
  ['out-w', look([c.x - 52, c.y + 14, c.z + 0.5], mid)],
  ['far', look([c.x - 90, c.y + 30, c.z - 90], mid)],
  ['court', look([c.x - 9.5, c.y + 1, c.z - 9.5], [c.x + 4, c.y + 7, c.z + 4])],
  ['keep', look([c.x + 0.5, c.y, c.z + 0.5], [c.x + 0.5, c.y + 1.5, c.z + 5.5])],
  ['keep2', look([c.x + 0.5, c.y, c.z + 0.5], [c.x + 5.5, c.y + 1.5, c.z + 0.5])],
  ['keep3', look([c.x + 0.5, c.y + 11, c.z + 0.5], [c.x - 4.5, c.y + 11.5, c.z + 0.5])],
  ['top', look([c.x + 0.5, c.y + 40, c.z - 20], [c.x + 0.5, c.y + 8, c.z + 0.5])],
];
for (const [name, at] of shots) {
  if (only && !only.includes(name)) continue;
  await page.evaluate((at) => {
    window.__solrift.teleport(at[0], at[1], at[2], at[3], at[4]);
    window.__solrift.setView(0);
  }, at);
  await sleep(9000);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('saved', name);
}
await browser.close();
console.log('messages', msgs.slice(0, 8));
