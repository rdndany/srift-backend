// Ambient occlusion settings side by side: the same view with several settings (and with the pass off).
// Usage: node scripts/postfx-tune.mjs [outDir]   (the dev server must be running)
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const outDir = process.argv[2] ?? 'screenshots/postfx-tune';
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
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
await page.evaluate(
  ([px, gy, pz]) => {
    const s = window.__solrift;
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) for (let y = 0; y <= 4; y++) {
      const wall = Math.abs(x) === 3 || Math.abs(z) === 3 || y === 4;
      if (wall && !(x === 0 && z === 3 && y < 2)) s.setBlock(px + 6 + x, gy + y, pz + 6 + z, 4);
    }
    // a few steps and pillars inside to give the corners something to do
    for (let i = 0; i < 3; i++) s.setBlock(px + 6 + i - 1, gy + i, pz + 6 - 2, 1);
    s.setBlock(px + 6 + 2, gy, pz + 6 + 1, 1);
    s.setBlock(px + 6 + 2, gy + 1, pz + 6 + 1, 1);
  },
  [px, gy, pz],
);
await sleep(2500);

const presets = [
  ['off', null],
  ['a-r1.4-i2.6', { aoRadius: 1.4, intensity: 2.6, distanceFalloff: 0.8 }],
  ['b-r2-i4', { aoRadius: 2, intensity: 4, distanceFalloff: 1 }],
  ['c-r3-i5', { aoRadius: 3, intensity: 5, distanceFalloff: 1 }],
];
const views = [
  ['hut', 1, [px + 6.5, gy, pz + 6.5, 0.2, -0.1]],
  ['out', 1, [px + 0.5, gy, pz + 0.5, 0.6, -0.15]],
];
for (const [vname, view, at] of views) {
  await page.evaluate(([view, at]) => {
    window.__solrift.teleport(at[0], at[1], at[2], at[3], at[4]);
    window.__solrift.setView(view);
  }, [view, at]);
  for (const [pname, cfg] of presets) {
    await page.evaluate((cfg) => {
      window.__solrift.setPostfx(cfg !== null);
      if (cfg) Object.assign(window.__solrift.ao(), cfg);
    }, cfg);
    await sleep(3500);
    await page.screenshot({ path: `${outDir}/${vname}-${pname}.png` });
    console.log('saved', vname, pname);
  }
}
await browser.close();
