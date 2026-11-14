// The third-person camera in tight places: carves little rooms and tunnels in solid stone and takes a picture from several ways of looking.
// Usage: node scripts/tight-view.mjs [outDir=screenshots/tight]   (the dev server must be running)
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const outDir = process.argv[2] ?? 'screenshots/tight';
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const errors = [];
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:3000/?seed=1337&debug&nomobs&noshadows&class=mage', { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
  window.__solrift.setTime(0.3);
  window.__solrift.setMode('creative'); // no fall damage while the pictures are taken
});
const pos = await page.evaluate(() => window.__solrift.position());
const px = Math.floor(pos.x);
const pz = Math.floor(pos.z);
const gy = (await page.evaluate(([x, z]) => window.__solrift.surfaceY(x, z), [px, pz])) + 20;

// A block of stone 21 x 21 x 14 high, with a lit torch-less cave carved in it by `carve(set)`.
const scenes = {
  // A one-wide, two-high tunnel along z; the player at the dead end, looking down it (yaw 0 faces -z).
  tunnel: { carve: 'tunnel', at: [0.5, 0, 5.5] },
  tunnel1: { carve: 'tunnel', at: [0.5, 0, 4.5] },
  tunnel2: { carve: 'tunnel', at: [0.5, 0, 3.5] },
  tunnel3: { carve: 'tunnel', at: [0.5, 0, 2.5] },
  corr: { carve: 'corr', at: [0.5, 0, 3.5] },
  room5: { carve: 'room5', at: [0.5, 0, 0.5] },
  // A room of 3 x 3 x 3.
  room: { carve: 'room', at: [0.5, 0, 0.5] },
  // A shaft going down, one wide.
  shaft: { carve: 'shaft', at: [0.5, 0, 0.5] },
  // A two-high crawl low under a ceiling, wide.
  crawl: { carve: 'crawl', at: [0.5, 0, 0.5] },
};
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
if (only) for (const k of Object.keys(scenes)) if (!only.includes(k)) delete scenes[k];
const looks = [
  ['ahead', 0, 0],
  ['down', 0, -0.9],
  ['back', Math.PI, 0],
  ['up', 0, 0.7],
  ['side', 1.2, -0.2],
];
for (const [name, scene] of Object.entries(scenes)) {
  await page.evaluate(
    ([px, gy, pz, kind]) => {
      const s = window.__solrift;
      const cx = px;
      const cz = pz;
      for (let x = cx - 10; x <= cx + 10; x++)
        for (let z = cz - 10; z <= cz + 10; z++)
          for (let y = gy - 4; y <= gy + 10; y++) s.setBlock(x, y, z, 1);
      const air = (x, y, z) => s.setBlock(cx + x, gy + y, cz + z, 0);
      if (kind === 'tunnel') for (let z = -4; z <= 5; z++) for (let y = 0; y <= 1; y++) air(0, y, z);
      if (kind === 'corr') for (let x = -1; x <= 1; x++) for (let z = -4; z <= 5; z++) for (let y = 0; y <= 1; y++) air(x, y, z);
      if (kind === 'room5') for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) for (let y = 0; y <= 3; y++) air(x, y, z);
      if (kind === 'room') for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) for (let y = 0; y <= 2; y++) air(x, y, z);
      if (kind === 'shaft') for (let y = 0; y <= 8; y++) air(0, y, 0);
      if (kind === 'crawl') for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) for (let y = 0; y <= 1; y++) air(x, y, z);
      // a few lamps in the walls so the pictures can be read
      const lamp = (x, y, z) => s.setBlock(cx + x, gy + y, cz + z, 19);
      if (kind === 'tunnel') for (const z of [-3, 0, 3]) { lamp(1, 1, z); lamp(-1, 1, z); }
      if (kind === 'corr') for (const z of [-3, 0, 3]) { lamp(2, 1, z); lamp(-2, 1, z); }
      if (kind === 'room5') { lamp(3, 1, 0); lamp(-3, 1, 0); lamp(0, 1, 3); lamp(0, 1, -3); }
      if (kind === 'room') { lamp(2, 1, 0); lamp(-2, 1, 0); lamp(0, 1, 2); lamp(0, 1, -2); }
      if (kind === 'shaft') for (let y = -2; y <= 8; y += 2) { lamp(1, y, 0); lamp(-1, y, 0); }
      if (kind === 'crawl') for (const x of [-5, 0, 5]) for (const z of [-5, 0, 5]) { s.setBlock(cx + x, gy + 2, cz + z, 19); }
    },
    [px, gy, pz, scene.carve],
  );
  await sleep(1500);
  for (const [lname, yaw, pitch] of looks) {
    await page.evaluate(
      ([x, y, z, yaw, pitch]) => {
        window.__solrift.teleport(x, y, z, yaw, pitch);
        window.__solrift.setView(1);
      },
      [px + scene.at[0], gy + scene.at[1] + (name === 'shaft' ? 6 : 0), pz + scene.at[2], yaw, pitch],
    );
    await sleep(1800);
    await page.screenshot({ path: `${outDir}/${name}-${lname}.png` });
    console.log('saved', name, lname);
  }
}
await browser.close();
console.log('errors', errors.slice(0, 5));
