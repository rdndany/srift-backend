// Photograph the water of the World Beyond: a shore from above, the open sea, the bottom under it and the surface from below.
// Usage: node scripts/water-look.mjs [outDir] [url] [seed]   (the dev server must be running)
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const outDir = process.argv[2] ?? 'screenshots/water';
const url = process.argv[3] ?? 'http://localhost:3000';
const seed = Number(process.argv[4] ?? 1);
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await launchBrowser();
const msgs = [];
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('console', (m) => m.type() === 'error' && !/GPU stall|willReadFrequently|preload|WebSocket/.test(m.text()) && msgs.push(m.text().slice(0, 400)));
page.on('pageerror', (e) => msgs.push(e.message));
await page.goto(`${url}/?world=beyond&seed=${seed}&debug&nomobs&mode=creative`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.() && window.__solrift.worldKind() === 'beyond', null, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
  window.__solrift.setMode('creative');
  window.__solrift.setFlying(true);
  window.__solrift.setHandHidden(true);
  window.__solrift.setTime(0.3);
  window.__solrift.setRenderDistance(8);
});

const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
const shots = {
  shore: { from: [-150, 76, 30], to: [-182, 62, 18] },
  sea: { from: [-200, 72, 40], to: [-230, 60, 80] },
  sun: { from: [-200, 66, 30], to: [-120, 74, 60], time: 0.42 },
  floor: { from: [-200, 52, 30], to: [-215, 34, 40] },
  down: { from: [-200, 70, 30], to: [-200, 40, 31] },
  below: { from: [-200, 54, 30], to: [-215, 80, 50] },
};
for (const [name, s] of Object.entries(shots)) {
  const [fx, fy, fz] = s.from;
  const [tx, ty, tz] = s.to;
  if (s.time !== undefined) await page.evaluate((t) => window.__solrift.setTime(t), s.time);
  const dx = tx - fx;
  const dz = tz - fz;
  const pitch = Math.atan2(ty - fy, Math.hypot(dx, dz));
  await page.evaluate(([x, y, z, yaw, pitch]) => {
    window.__solrift.teleport(x + 0.5, y, z + 0.5, yaw, pitch);
    window.__solrift.setView(0);
  }, [fx, fy, fz, yawTo(dx, dz), pitch]);
  await sleep(name === 'shore' ? 20000 : 7000);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('saved', name);
}
await browser.close();
console.log('messages', msgs.slice(0, 8));
