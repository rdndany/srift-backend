// Frame times on the real graphics card (not the software renderer the other scripts use), with the frame rate uncapped.
// Usage: node scripts/gpu-perf.mjs "<label>=<extra query>" ...   e.g.  node scripts/gpu-perf.mjs "shadows=" "none=&noshadows"
// Options (env): SECONDS=12  SCALE=1  MODE=still|walk|fly|load  SPEED=20 (blocks a second, flying)  TIME=0.03 (0 = sunrise, 0.25 = noon)
import { chromium } from 'playwright';

const cases = process.argv.slice(2).map((a) => {
  const i = a.indexOf('=');
  return [a.slice(0, i), a.slice(i + 1)];
});
const seconds = Number(process.env.SECONDS ?? 12);
const scale = Number(process.env.SCALE ?? 1);
const mode = process.env.MODE ?? 'still'; // still | walk | fly (20 blocks a second over new land) | load (the first seconds in the world)
const walk = mode === 'walk';
const speed = Number(process.env.SPEED ?? 20);
const time = Number(process.env.TIME ?? 0.03);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });

for (const [label, extra] of cases) {
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale })).newPage();
  page.on('console', (m) => m.type() === 'error' && !/GPU stall|willReadFrequently|preload|Blit feedback/.test(m.text()) && console.log('console:', m.text().slice(0, 300)));
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto(`http://localhost:3000/?seed=1337&debug&nomobs&postfx${extra}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
  await page.evaluate((t) => {
    document.getElementById('overlay').style.display = 'none';
    const s = window.__solrift;
    s.forceLock();
    s.setMode('creative');
    s.setTime(t);
    const p = s.position();
    s.teleport(p.x, p.y, p.z, -Math.PI / 2, 0.12);
  }, time);
  // The world loads first: chunks being meshed are a cost of their own.
  await sleep(mode === 'load' ? 0 : mode === 'still' ? 14000 : 8000);
  await page.evaluate((t) => window.__solrift.setTime(t), time);
  await sleep(1000);
  if (walk) {
    await page.keyboard.down('ControlLeft');
    await page.keyboard.down('KeyW');
  }
  const r = await page.evaluate(
    ([ms, fly]) =>
      new Promise((done) => {
        const s = window.__solrift;
        const stat = () => (s.shadowStats ? s.shadowStats() : null);
        const strips = (x) => (x ? x.nearBatches + x.farBatches : 0);
        const times = [];
        const drew = [];
        let last = performance.now();
        const t0 = last;
        const first = stat();
        let seen = strips(first);
        // Without a limit on the frame rate the page runs ahead of the card, which then stalls in bursts: waiting for the card
        // each frame makes a frame's time what it really costs (the page's work and the card's).
        const gl = document.getElementById('game').getContext('webgl2');
        const at = s.position();
        if (fly) s.setFlying(true);
        const tick = () => {
          gl.finish();
          const now = performance.now();
          if (fly) s.teleport(at.x + ((now - t0) / 1000) * fly, Math.max(at.y, 120), at.z);
          times.push(now - last);
          last = now;
          const n = strips(stat());
          drew.push(n !== seen);
          seen = n;
          if (now - t0 < ms) requestAnimationFrame(tick);
          else done({ times, drew, first, end: stat(), pos: s.position() });
        };
        requestAnimationFrame(tick);
      }),
    [seconds * 1000, mode === 'fly' ? speed : 0],
  );
  if (walk) {
    await page.keyboard.up('KeyW');
    await page.keyboard.up('ControlLeft');
  }
  const times = r.times.slice(1);
  const drew = r.drew.slice(1);
  const sorted = [...times].sort((a, b) => a - b);
  const q = (f) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))];
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const med = q(0.5);
  // A frame that draws a batch: its own time and the one after it (the card works a frame behind).
  const strip = [];
  const plain = [];
  for (let i = 0; i < times.length; i++) (drew[i] || drew[i - 1] ? strip : plain).push(times[i]);
  const total = times.reduce((x, y) => x + y, 0);
  const d = (k) => (r.end && r.first ? r.end[k] - r.first[k] : 0);
  console.log(
    `${label.padEnd(14)} ${(1000 / mean(times)).toFixed(0).padStart(4)} fps  mean ${mean(times).toFixed(2)} ms  median ${med.toFixed(2)}  p99 ${q(0.99).toFixed(2)}  worst ${sorted[sorted.length - 1].toFixed(1)}` +
      `  hitches(>2x median) ${times.filter((t) => t > med * 2).length}  (>8 ms) ${times.filter((t) => t > 8).length}  (>16.7 ms) ${times.filter((t) => t > 16.7).length}` +
      `\n${''.padEnd(14)} plain frames ${mean(plain).toFixed(2)} ms, frames with shadow work ${mean(strip).toFixed(2)} ms (${strip.length} of ${times.length})` +
      `; drawings near ${d('near')} far ${d('far')}, batches ${d('nearBatches')}+${d('farBatches')} in ${(total / 1000).toFixed(1)} s; at ${r.pos.x.toFixed(0)} ${r.pos.z.toFixed(0)}`,
  );
  await page.close();
}
await browser.close();
