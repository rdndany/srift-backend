// The same pictures with the post-processing (ambient occlusion + edge smoothing) off and on.
// Usage: node scripts/postfx-compare.mjs [outDir=screenshots/postfx]   (the dev server must be running)
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const outDir = process.argv[2] ?? 'screenshots/postfx';
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const errors = [];
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:3000/?seed=1337&debug&nomobs&class=mage', { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
  window.__solrift.setTime(0.3);
  window.__solrift.setMode('creative');
});
const pos = await page.evaluate(() => window.__solrift.position());
const px = Math.floor(pos.x);
const pz = Math.floor(pos.z);
const gy = (await page.evaluate(([x, z]) => window.__solrift.surfaceY(x, z), [px, pz])) + 1;

// A little stone hut in the open for the corners, and a cave room carved below.
await page.evaluate(
  ([px, gy, pz]) => {
    const s = window.__solrift;
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) for (let y = 0; y <= 3; y++) {
      const wall = Math.abs(x) === 2 || Math.abs(z) === 2 || y === 3;
      if (wall && !(x === 0 && z === 2 && y < 2)) s.setBlock(px + 6 + x, gy + y, pz + 6 + z, 4);
    }
  },
  [px, gy, pz],
);
await sleep(2500);

const shots = [
  ['open-3rd', 1, [px + 0.5, gy, pz + 0.5, 0.6, -0.15]],
  ['hut-3rd', 1, [px + 6.5, gy, pz + 6.5, 0.2, -0.1]],
  ['hut-1st', 0, [px + 6.5, gy, pz + 6.5, 2.4, -0.2]],
];
for (const [name, view, at] of shots) {
  for (const on of [false, true]) {
    await page.evaluate(
      ([view, at, on]) => {
        window.__solrift.setPostfx(on);
        window.__solrift.teleport(at[0], at[1], at[2], at[3], at[4]);
        window.__solrift.setView(view);
      },
      [view, at, on],
    );
    await sleep(3500);
    await page.screenshot({ path: `${outDir}/${name}-${on ? 'on' : 'off'}.png` });
    console.log('saved', name, on ? 'on' : 'off');
  }
}
const fps = await page.evaluate(() => window.__solrift.crowd().fps);
console.log('fps (swiftshader)', fps);
await browser.close();
console.log('messages', errors.slice(0, 8));
