// Visual check: screenshots a handful of scenes (noon, sunset, night, forest, water, cave) so rendering
// changes can be compared by eye. Usage: node scripts/look.mjs [url] [outDir] [prefix] [scene,scene...]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'tmp-shots';
const prefix = process.argv[4] ?? 'look';
const only = process.argv[5]?.split(',');
const extra = process.argv[6] ?? '';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[console.${m.type()}]`, m.text().slice(0, 600));
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => {
  console.log('[pageerror]', e.message);
  errors.push(e.message);
});

await page.goto(url + '/?seed=1337&debug&nomobs&mode=creative' + extra, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
});

const sc = (fn, ...args) => page.evaluate(fn, ...args);
async function goTo(x, z, dy, yaw, pitch, time, weather = 'clear') {
  await sc(([x, z]) => window.__solrift.teleport(x + 0.5, 200, z + 0.5), [x, z]);
  await page.waitForTimeout(4000);
  const y = await sc(([x, z]) => window.__solrift.surfaceY(x, z), [x, z]);
  await sc(([x, y, z, dy, yaw, pitch, time, weather]) => {
    const s = window.__solrift;
    s.setFlying(true);
    s.setTime(time);
    s.setWeather(weather);
    s.teleport(x + 0.5, y + dy, z + 0.5, yaw, pitch);
  }, [x, y, z, dy, yaw, pitch, time, weather]);
  await page.waitForTimeout(3500);
}

const scenes = {
  noon: [0, 0, 6, 0.6, -0.15, 0.22],
  sunset: [0, 0, 6, 1.9, -0.05, 0.485],
  shadows: [120, -60, 6, -1.57, -0.35, 0.07],
  shadows2: [60, 30, 8, -1.2, -0.4, 0.07],
  cave: [0, 0, -14, 0.6, 0.0, 0.3],
  dawn: [0, 0, 6, -1.2, 0.0, 0.03],
  night: [0, 0, 6, 0.6, 0.05, 0.74],
  high: [40, 40, 40, 0.8, -0.45, 0.3],
  forest: [120, -60, 3, 2.4, -0.05, 0.28],
  rain: [0, 0, 5, 0.6, 0.0, 0.3, 'rain'],
};
for (const [name, args] of Object.entries(scenes)) {
  if (only && !only.includes(name)) continue;
  await goTo(...args);
  await page.screenshot({ path: `${outDir}/${prefix}-${name}.png` });
  console.log('saved', name);
}
await browser.close();
if (errors.length) {
  console.log(`${errors.length} console error(s)`);
  process.exit(1);
}
