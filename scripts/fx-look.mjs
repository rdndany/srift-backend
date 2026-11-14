// The post-processing looks: the same view with everything off and with everything on (or one part at a time).
// Usage: node scripts/fx-look.mjs [outDir] [only=name,name] [parts=ao,glow,grade,rays,menuBlur]   (the dev server must be running)
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const outDir = process.argv[2] ?? 'screenshots/fx';
const only = process.argv[3] && process.argv[3] !== '-' ? process.argv[3].split(',') : null;
const parts = process.argv[4] ? process.argv[4].split(',') : null; // the parts for the 'on' picture (the rest off)
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const msgs = [];
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall|willReadFrequently|preload/.test(m.text()) && msgs.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => msgs.push(e.message));
await page.goto('http://localhost:3000/?seed=1337&debug&nomobs&class=mage', { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
  window.__solrift.setMode('creative');
});
const pos = await page.evaluate(() => window.__solrift.position());
const px = Math.floor(pos.x);
const pz = Math.floor(pos.z);
const gy = (await page.evaluate(([x, z]) => window.__solrift.surfaceY(x, z), [px, pz])) + 1;
// Torches and glowstone round a stone corner, for the night.
await page.evaluate(
  ([px, gy, pz]) => {
    const s = window.__solrift;
    for (let i = 0; i < 4; i++) for (let y = 0; y < 3; y++) s.setBlock(px + 5 + i, gy + y, pz + 4, 1);
    s.setBlock(px + 5, gy + 3, pz + 4, 23);
    s.setBlock(px + 8, gy + 3, pz + 4, 23);
    s.setBlock(px + 3, gy, pz + 2, 19);
    s.setBlock(px + 3, gy + 1, pz + 2, 19);
    s.setBlock(px + 6, gy, pz + 2, 23);
  },
  [px, gy, pz],
);
await sleep(2500);

// time: 0 sunrise, 0.25 noon, 0.5 sunset, 0.75 midnight.
const shots = [
  ['noon', 0.25, 1, [px + 0.5, gy, pz + 0.5, 0.6, -0.15]],
  ['dusk-sun', 0.455, 1, [px + 0.5, gy, pz + 0.5, Math.PI / 2, 0.12]],
  ['dusk-away', 0.455, 1, [px + 0.5, gy, pz + 0.5, -Math.PI / 2, -0.1]],
  ['night', 0.75, 1, [px + 4.5, gy, pz + 0.5, 0.3, -0.1]],
  ['menu', 0.455, 1, [px + 0.5, gy, pz + 0.5, -Math.PI / 2, -0.1], 'menu'],
];
const allOff = { ao: false, glow: false, grade: false, rays: false, menuBlur: false };
const allOn = { ao: true, glow: true, grade: true, rays: true, menuBlur: true };
const onFlags = parts ? Object.fromEntries(Object.keys(allOff).map((k) => [k, parts.includes(k)])) : allOn;
for (const [name, time, view, at, extra] of shots) {
  if (only && !only.includes(name)) continue;
  for (const on of [false, true]) {
    await page.evaluate(
      ([time, view, at, flags]) => {
        window.__solrift.setTime(time);
        window.__solrift.setPostfx(flags);
        window.__solrift.teleport(at[0], at[1], at[2], at[3], at[4]);
        window.__solrift.setView(view);
      },
      [time, view, at, on ? onFlags : allOff],
    );
    if (extra === 'menu') await page.keyboard.press('KeyE');
    await sleep(4000);
    await page.screenshot({ path: `${outDir}/${name}-${on ? 'on' : 'off'}.png` });
    if (extra === 'menu') await page.keyboard.press('Escape');
    console.log('saved', name, on ? 'on' : 'off');
  }
}
await browser.close();
console.log('messages', msgs.slice(0, 8));
