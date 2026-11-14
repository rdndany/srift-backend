// Is the figure drawn smoothly while it walks in third person? Walks forward for a few seconds and, every frame, compares how far the body
// (which moves in steps of 1/60 s) and the drawn figure and the camera moved: at a steady walk each should move the same distance every frame.
// Usage: node scripts/smooth-check.mjs [class=mage] [url]   (the dev server must be running)
import { chromium } from 'playwright';

const cls = process.argv[2] ?? 'mage';
const url = process.argv[3] ?? 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
await page.goto(`${url}/?seed=1337&debug&nomobs&noshadows&class=${cls}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
});
const sc = (fn, ...a) => page.evaluate(fn, ...a);
const pos = await sc(() => window.__solrift.position());
const px = Math.floor(pos.x);
const pz = Math.floor(pos.z);
const gy = await sc(([x, z]) => window.__solrift.surfaceY(x, z), [px, pz]);
await sc(([px, pz, gy]) => { const s = window.__solrift; s.teleport(px + 0.5, gy + 1, pz + 0.5, 0, -0.1); s.setView(1); }, [px, pz, gy]);
await sleep(8000);

// Sample every animation frame while walking forward.
await sc(() => {
  window.__samples = [];
  const tick = (t) => {
    const s = window.__solrift;
    window.__samples.push({ t, b: s.position(), d: s.drawnAt(), c: s.cameraAt() });
    window.__raf = requestAnimationFrame(tick);
  };
  window.__raf = requestAnimationFrame(tick);
  s: window.__solrift.holdKey('KeyW', true);
});
await sleep(4000);
const samples = await sc(() => {
  cancelAnimationFrame(window.__raf);
  window.__solrift.holdKey('KeyW', false);
  return window.__samples;
});
await browser.close();

const speeds = (pick) => {
  const out = [];
  for (let i = 1; i < samples.length; i++) {
    const dt = (samples[i].t - samples[i - 1].t) / 1000;
    const a = pick(samples[i - 1]);
    const b = pick(samples[i]);
    if (dt > 0) out.push(Math.hypot(b.x - a.x, b.z - a.z) / dt);
  }
  return out.slice(Math.floor(out.length * 0.25)); // skip the start-up
};
const stat = (v) => {
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / v.length);
  return `mean ${m.toFixed(2)} b/s, spread ${sd.toFixed(2)} (${((sd / m) * 100).toFixed(0)}%)`;
};
if (process.env.RAW) for (const q of samples) console.log(q.t.toFixed(0), JSON.stringify(q.b), JSON.stringify(q.d), JSON.stringify(q.c));
const frames = samples.length;
console.log(`${frames} frames in 4 s (${(frames / 4).toFixed(0)} fps)`);
console.log('body    :', stat(speeds((s) => s.b)));
console.log('drawn   :', stat(speeds((s) => s.d)));
console.log('camera  :', stat(speeds((s) => s.c)));
// How the figure sits against the camera: the distance between them should not change while walking straight.
const gap = samples.slice(Math.floor(samples.length * 0.4)).map((s) => Math.hypot(s.d.x - s.c.x, s.d.z - s.c.z));
const gm = gap.reduce((a, b) => a + b, 0) / gap.length;
console.log(`figure-to-camera gap: mean ${gm.toFixed(3)}, min ${Math.min(...gap).toFixed(3)}, max ${Math.max(...gap).toFixed(3)}`);
const gapBody = samples.slice(Math.floor(samples.length * 0.4)).map((s) => Math.hypot(s.b.x - s.c.x, s.b.z - s.c.z));
console.log(`body-to-camera gap  : min ${Math.min(...gapBody).toFixed(3)}, max ${Math.max(...gapBody).toFixed(3)} (what it would be if the figure sat on the raw body)`);
