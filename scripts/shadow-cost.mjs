// What the sun's shadows and the sun rays cost: how often each shadow map is redrawn, how much goes into a redraw, and the worst frame.
// Usage: node scripts/shadow-cost.mjs [seconds=20]   (the dev server must be running)
import { chromium } from 'playwright';

const seconds = Number(process.argv[2] ?? 20);
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
});
// Let the world load before counting: chunks being meshed redraw the maps too.
await sleep(25000);
for (const [name, time] of [['sunrise', 0.03], ['noon', 0.25]]) {
  await page.evaluate((t) => window.__solrift.setTime(t), time);
  await sleep(3000);
  const a = await page.evaluate(() => ({ s: window.__solrift.shadowStats(true), t: performance.now() }));
  await sleep(seconds * 1000);
  const b = await page.evaluate(() => ({ s: window.__solrift.shadowStats(), t: performance.now(), fps: window.__solrift.crowd().fps }));
  const dt = (b.t - a.t) / 1000;
  const d = (k) => b.s[k] - a.s[k];
  const per = (n, by) => (by > 0 ? Math.round(n / by) : 0);
  const worst = b.s.worstTris;
  console.log(
    `${name}: ${dt.toFixed(1)} s, ${d('frames')} frames (${b.fps} fps here)\n` +
      `  near map   ${d('near')} drawings in ${d('nearBatches')} batches: ${per(d('nearCalls'), d('near'))} draw calls and ${per(d('nearTris'), d('near'))} triangles a drawing, ${per(d('nearTris'), d('nearBatches'))} a batch\n` +
      `  far map    ${d('far')} drawings in ${d('farBatches')} batches: ${per(d('farCalls'), d('far'))} draw calls and ${per(d('farTris'), d('far'))} triangles a drawing, ${per(d('farTris'), d('farBatches'))} a batch\n` +
      `  entities   ${per(d('entCalls'), d('entities'))} draw calls a frame\n` +
      `  near map read twice in ${Math.round((100 * d('blendFrames')) / Math.max(1, d('frames')))}% of frames, far in ${Math.round((100 * d('farBlendFrames')) / Math.max(1, d('frames')))}%; worst frame ${b.s.worstCalls} shadow draw calls, ${worst} triangles`,
  );
}await browser.close();
