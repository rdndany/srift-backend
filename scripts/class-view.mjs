// A class in the real game, in third person: takes pictures of the figure from behind, walking, and from the front.
// Usage: node scripts/class-view.mjs [class=mage] [url] [outDir]   (the dev server must be running)
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const cls = process.argv[2] ?? 'mage';
const url = process.argv[3] ?? 'http://localhost:3000';
const outDir = process.argv[4] ?? 'screenshots/class-view';
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const errors = [];
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${url}/?seed=1337&debug&nomobs&class=${cls}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
});
const sc = (fn, ...args) => page.evaluate(fn, ...args);
const pos = await sc(() => window.__solrift.position());
const px = Math.floor(pos.x);
const pz = Math.floor(pos.z);
const gy = await sc(([x, z]) => window.__solrift.surfaceY(x, z), [px, pz]);
await sc(
  ([px, pz, gy]) => {
    const s = window.__solrift;
    for (let x = px - 30; x <= px + 30; x++)
      for (let z = pz - 30; z <= pz + 30; z++) {
        for (let y = gy; y <= gy + 14; y++) s.setBlock(x, y, z, 0);
        s.setBlock(x, gy - 1, z, 3);
        s.setBlock(x, gy - 2, z, 2);
        s.setBlock(x, gy - 3, z, 1);
      }
    s.setTime(0.3);
    s.teleport(px + 0.5, gy, pz + 0.5, 0, -0.1);
    s.setView(1);
  },
  [px, pz, gy],
);
// HOLD=<item id> gives that item and holds it (staff 393, wand 394, orb 397).
const held = Number(process.env.HOLD || 0);
const tag = held ? `-${held}` : '';
if (held) {
  await sc((id) => {
    window.__solrift.give(id, 1);
  }, held);
  await sleep(300);
  await sc((id) => {
    const s = window.__solrift;
    const inv = s.inventory();
    const list = Array.isArray(inv) ? inv : (inv.slots ?? inv.items ?? []);
    const i = list.findIndex((e) => e && (e.id === id || e.item === id));
    console.log('slot of item', i, JSON.stringify(inv).slice(0, 200));
    if (i >= 0 && i < 9) s.select(i);
  }, held);
}
await sleep(2500);
await page.screenshot({ path: `${outDir}/${cls}${tag}-behind.png` });
console.log('saved behind');
// Turn round to see it from the front (the camera stays behind the body, so turn the player and walk toward the camera).
await sc(() => window.__solrift.setView(2));
await sleep(1500);
await page.screenshot({ path: `${outDir}/${cls}${tag}-front.png` });
console.log('saved front');
await browser.close();
if (errors.length) console.log('errors', errors.slice(0, 5));
