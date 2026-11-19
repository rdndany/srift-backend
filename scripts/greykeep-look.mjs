// Look at Greykeep, the castle north of Dawnwatch, from outside and inside. Saves `<outDir>/<name>.png`.
// Usage: node scripts/greykeep-look.mjs [outDir] [name,name|-] [url]   (the dev server must be running)
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const outDir = process.argv[2] ?? 'screenshots/greykeep';
const only = process.argv[3] && process.argv[3] !== '-' ? process.argv[3].split(',') : null;
const url = process.argv[4] ?? 'http://localhost:3000';
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await launchBrowser();
const msgs = [];
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('console', (m) => m.type() === 'error' && !/GPU stall|willReadFrequently|preload/.test(m.text()) && msgs.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => msgs.push(e.message));
await page.goto(`${url}/?world=adventure&debug&nomobs`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.() && window.__solrift.worldKind() === 'adventure', null, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
  window.__solrift.setMode('creative');
  window.__solrift.setFlying(true);
  window.__solrift.setHandHidden(true);
  window.__solrift.setTime(0.3);
  window.__solrift.setRenderDistance(8);
});
// Walk the camera north first so the chunks around the castle are loaded.
const g = await page.evaluate(() => window.__solrift.surfaceY(0, -40));
console.log('ground', g);

// Looking from (fx, fy, fz) at (tx, ty, tz); y is above the ground. +z is south (toward the village), so the castle front faces +z.
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
const look = (from, to) => {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const pitch = Math.atan2(to[1] - from[1], Math.hypot(dx, dz));
  return [from[0] + 0.5, g + from[1], from[2] + 0.5, yawTo(dx, dz), pitch];
};
const shots = {
  facade: look([0, 24, -31], [0, 13, -62]),
  'yard-stairs': look([-12, 5, -73], [-12, 7, -64]),
  'yard-east': look([6, 5, -66], [18, 3, -80]),
  'gate-close': look([0, 5, -49], [0, 12, -61]),
  'gate-mid': look([0, 9, -42], [0, 13, -61]),
  'tower-close': look([-26, 12, -48], [-25, 15, -62]),
  'pavilion': look([-25, 22, -52], [-25, 20, -64]),
  'bridge': look([8, 3, -50], [-2, 6, -62]),
  'yard-gate': look([0, 3, -76], [0, 6, -62]),
  'yard-walk': look([-14, 6, -68], [-12, 6, -90]),
  'wall-walk': look([-9, 11, -63], [-19, 11, -63]),
  'tower-in': look([-25, 2, -63], [-25, 4, -69]),
  'gate-hall': look([0, 11, -63], [0, 12, -68]),
  'hall-door': look([0, 3, -70], [0, 3, -80]),
  front: look([0, 17, -14], [0, 14, -62]),
  'front-low': look([0, 3, -22], [0, 14, -62]),
  'front-left': look([-34, 10, -36], [-6, 11, -64]),
  'front-right': look([34, 10, -36], [6, 11, -64]),
  gate: look([0, 3, -48], [0, 5, -62]),
  'tower-l': look([-40, 16, -48], [-25, 14, -64]),
  'tower-r': look([40, 16, -48], [25, 14, -64]),
  'tower-top': look([-25, 22, -44], [-25, 18, -63]),
  back: look([0, 16, -128], [0, 12, -98]),
  'back-left': look([-46, 14, -120], [-24, 10, -96]),
  side: look([-60, 14, -80], [-28, 10, -80]),
  aerial: look([0, 58, -30], [0, 4, -80]),
  court: look([0, 5, -70], [0, 7, -92]),
  'court-back': look([0, 5, -92], [0, 9, -68]),
  'court-left': look([-18, 6, -80], [-27, 8, -80]),
  hall: look([0, 2, -82], [0, 4, -96]),
  'hall-back': look([0, 3, -94], [0, 4, -82]),
  'gate-in': look([0, 3, -70], [0, 3, -59]),
  walk: look([-12, 11, -63], [12, 11, -63]),
};
for (const [name, at] of Object.entries(shots)) {
  if (only && !only.includes(name)) continue;
  await page.evaluate((at) => {
    window.__solrift.teleport(at[0], at[1], at[2], at[3], at[4]);
    window.__solrift.setView(0);
  }, at);
  await sleep(name === Object.keys(shots)[0] ? 14000 : 7000);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('saved', name);
}
await browser.close();
console.log('messages', msgs.slice(0, 8));
