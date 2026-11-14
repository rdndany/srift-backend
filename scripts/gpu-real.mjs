// The game as a player gets it (no ?debug: automatic quality on, mobs about), on the real graphics card, with the display's usual
// 60 frames a second or uncapped (UNCAPPED=1). Reads the admin bar and counts the frames that came late.
// Usage: node scripts/gpu-real.mjs "<label>=<extra query>" ...
import { chromium } from 'playwright';

const cases = process.argv.slice(2).map((a) => {
  const i = a.indexOf('=');
  return [a.slice(0, i), a.slice(i + 1)];
});
const seconds = Number(process.env.SECONDS ?? 20);
const scale = Number(process.env.SCALE ?? 1);
const uncapped = process.env.UNCAPPED === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', ...(uncapped ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : [])] });

for (const [label, extra] of cases) {
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale })).newPage();
  const logs = [];
  page.on('console', (m) => /solrift|error/i.test(m.text()) && !/GPU stall|willReadFrequently|preload|Blit feedback/.test(m.text()) && logs.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => logs.push(e.message));
  await page.goto(`http://localhost:3000/?seed=1337&admin${extra}`, { waitUntil: 'load' });
  // In: the loading screen goes away on a click once the world is ready.
  await page.waitForFunction(() => document.getElementById('loading-screen')?.classList.contains('ready') || document.getElementById('loading-screen')?.classList.contains('gone'), undefined, { timeout: 180000 });
  await page.mouse.click(960, 540);
  await sleep(1500);
  await page.keyboard.down('KeyW');
  const r = await page.evaluate(
    (ms) =>
      new Promise((done) => {
        const times = [];
        let last = performance.now();
        const t0 = last;
        const tick = (now) => {
          times.push(now - last);
          last = now;
          if (now - t0 < ms) requestAnimationFrame(tick);
          else done(times);
        };
        requestAnimationFrame(tick);
      }),
    seconds * 1000,
  );
  await page.keyboard.up('KeyW');
  const times = r.slice(1);
  const sorted = [...times].sort((a, b) => a - b);
  const q = (f) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))];
  const mean = times.reduce((x, y) => x + y, 0) / times.length;
  const bar = await page.evaluate(() => [...document.querySelectorAll('#admin-bar .ab-cell')].filter((c) => c.style.display !== 'none').map((c) => c.innerText.replace('\n', ' ')).join(' | '));
  const state = await page.evaluate(() => ({ locked: !!document.pointerLockElement, overlay: getComputedStyle(document.getElementById('overlay')).display }));
  console.log(
    `${label.padEnd(12)} ${(1000 / mean).toFixed(0)} fps  median ${q(0.5).toFixed(1)} ms  p99 ${q(0.99).toFixed(1)}  worst ${sorted[sorted.length - 1].toFixed(1)}  late frames (>1.5x median) ${times.filter((t) => t > q(0.5) * 1.5).length} of ${times.length}` +
      `\n   ${bar}\n   locked ${state.locked}, pause screen ${state.overlay}${logs.length ? `\n   ${logs.join('\n   ')}` : ''}`,
  );
  if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}-${label}.png` });
  await page.close();
}
await browser.close();
