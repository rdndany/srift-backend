// The Mage's wand in the real game: a slow bolt in flight (seen from the caster's eyes and from behind), then a real right-click cast at a wall.
// Usage: node scripts/wand-look.mjs [outDir] [url=http://localhost:3000]   (a dev server must be running)
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const outDir = process.argv[2] ?? 'screenshots/wand-look';
const url = process.argv[3] ?? 'http://localhost:3000';
const spell = Number(process.argv[4] ?? 3); // 3 the wand's bolt, 4 the staff's
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const msgs = [];
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall|willReadFrequently|preload/.test(m.text()) && msgs.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => msgs.push(e.message));
await page.goto(`${url}/?seed=1337&debug&nomobs&class=mage`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 240000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
});
const pos = await page.evaluate(() => window.__solrift.position());
const px = Math.floor(pos.x);
const pz = Math.floor(pos.z);
const gy = (await page.evaluate(([x, z]) => window.__solrift.surfaceY(x, z), [px, pz])) + 1;
// a stone wall 9 blocks ahead (towards -z, where yaw 0 looks)
await page.evaluate(
  ([px, gy, pz]) => {
    const s = window.__solrift;
    for (let x = -4; x <= 4; x++) for (let y = 0; y < 5; y++) s.setBlock(px + x, gy + y, pz - 9, 1);
    s.setTime(0.25);
  },
  [px, gy, pz],
);
await page.evaluate(([px, gy, pz]) => window.__solrift.teleport(px + 0.5, gy, pz + 0.5, 0, 0), [px, gy, pz]);
await sleep(3000);

// a slow bolt (a quarter of the real speed) so it can be photographed in flight
for (const [name, view] of [['eye', 0], ['behind', 1]]) {
  await page.evaluate((v) => window.__solrift.setView(v), view);
  await page.evaluate((s) => window.__solrift.testSpell(s, 4), spell);
  await sleep(700);
  await page.screenshot({ path: `${outDir}/flight-${name}.png` });
  console.log('saved flight', name);
  await sleep(2500);
}

if (spell !== 3) {
  await browser.close();
  console.log('messages', msgs.slice(0, 8));
  process.exit(0);
}
// a real cast: right-click with the wand, looking at the wall
await page.evaluate(() => window.__solrift.setView(0));
await page.mouse.move(640, 360);
await page.mouse.down({ button: 'right' });
await sleep(60);
await page.mouse.up({ button: 'right' });
await sleep(350);
await page.screenshot({ path: `${outDir}/cast-wall.png` });
console.log('saved cast');
await browser.close();
console.log('messages', msgs.slice(0, 8));
