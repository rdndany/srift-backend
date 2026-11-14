// What a frame costs at sunrise, looking at the sun, with the sun rays (and the other finishing passes) on and off.
// The browser here draws in software, so the numbers are far above a real card's: only how they compare means anything.
// Usage: node scripts/fx-cost.mjs [outPrefix] [seconds=12]   (the dev server must be running)
import { chromium } from 'playwright';

const prefix = process.argv[2] ?? '';
const seconds = Number(process.argv[3] ?? 12);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall|willReadFrequently|preload|Blit feedback/.test(m.text()) && console.log('console:', m.text().slice(0, 400)));
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('http://localhost:3000/?seed=1337&debug&nomobs&postfx', { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  const s = window.__solrift;
  s.forceLock();
  s.setMode('creative');
  s.setTime(0.035);
  const p = s.position();
  s.teleport(p.x, p.y, p.z, -Math.PI / 2, 0.12);
});
await sleep(25000);
/** Milliseconds per frame over a while (the middle one of all the frames, and the slowest tenth). */
const measure = async () => {
  await page.evaluate(() => window.__solrift.setTime(0.035));
  await sleep(1500);
  return page.evaluate(
    (ms) =>
      new Promise((done) => {
        const times = [];
        let last = performance.now();
        const t0 = last;
        const tick = (now) => {
          times.push(now - last);
          last = now;
          if (now - t0 < ms) requestAnimationFrame(tick);
          else {
            times.shift();
            times.sort((a, b) => a - b);
            done({ frames: times.length, median: times[Math.floor(times.length / 2)], p90: times[Math.floor(times.length * 0.9)], mean: times.reduce((a, b) => a + b, 0) / times.length });
          }
        };
        requestAnimationFrame(tick);
      }),
    seconds * 1000,
  );
};
const all = { ao: true, glow: true, grade: true, rays: true, menuBlur: true };
const cases = [
  ['everything on', all],
  ['sun rays off', { ...all, rays: false }],
  ['only sun rays', { ao: false, glow: false, grade: false, rays: true, menuBlur: false }],
  ['rays, glow, colour (no occlusion)', { ...all, ao: false }],
  ['all passes off', { ao: false, glow: false, grade: false, rays: false, menuBlur: false }],
];
for (const [name, flags] of cases) {
  await page.evaluate((f) => window.__solrift.setPostfx(f), flags);
  await sleep(2500);
  const m = await measure();
  console.log(`${name.padEnd(36)} ${m.mean.toFixed(0).padStart(5)} ms/frame mean, ${m.median.toFixed(0).padStart(5)} median, ${m.p90.toFixed(0).padStart(5)} slowest tenth (${m.frames} frames)`);
  if (prefix && name === 'everything on') await page.screenshot({ path: `${prefix}-sunrise.png` });
}
await browser.close();
