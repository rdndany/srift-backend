// Golden hour, moonlight and torch glow. Usage: node scripts/lookgolden.mjs [url] [outDir] [prefix] [scene,scene...] [extraQuery]
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3000';
const outDir = process.argv[3] ?? 'tmp-shots';
const prefix = process.argv[4] ?? 'gold';
const only = process.argv[5]?.split(',');
const extra = process.argv[6] ?? '';
mkdirSync(outDir, { recursive: true });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('[err]', m.text().slice(0, 300)));
await page.goto(`${url}/?seed=1337&debug&nomobs&mode=creative${extra}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
});

// [x, z, dy, yaw, pitch, time, torches]
const scenes = {
  golden: [120, -60, 3, 2.4, -0.1, 0.455, false],
  goldenlow: [120, -60, 3, -1.4, -0.05, 0.47, false],
  goldensun: [120, -60, 6, 1.5, -0.02, 0.47, false],
  moon: [120, -60, 3, 2.4, -0.15, 0.66, false],
  torches: [120, -60, 3, 0.5, -0.12, 0.74, true],
  torchday: [120, -60, 3, 0.5, -0.12, 0.25, true],
  torchdusk: [120, -60, 3, 0.5, -0.12, 0.5, true],
};
for (const [name, [x, z, dy, yaw, pitch, time, torches]] of Object.entries(scenes)) {
  if (only && !only.includes(name)) continue;
  await page.evaluate(([x, z]) => window.__solrift.teleport(x + 0.5, 200, z + 0.5), [x, z]);
  await page.waitForTimeout(4000);
  const y = await page.evaluate(([x, z]) => window.__solrift.surfaceY(x, z), [x, z]);
  await page.evaluate(([x, y, z, dy, yaw, pitch, time, torches]) => {
    const s = window.__solrift;
    s.setFlying(true);
    s.setTime(time);
    s.setWeather('clear');
    if (torches) {
      for (const [ox, oz] of [[-4, -4], [4, -4], [-4, 4], [4, 4], [0, -6], [-6, 0], [6, 0], [0, 6], [-8, -8], [8, -8], [-8, 8], [8, 8]]) {
        const sy = s.surfaceY(x + ox, z + oz);
        s.setBlock(x + ox, sy, z + oz, 23);
      }
    }
    s.teleport(x + 0.5, y + dy, z + 0.5, yaw, pitch);
  }, [x, y, z, dy, yaw, pitch, time, torches]);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${outDir}/${prefix}-${name}.png` });
  console.log('saved', name);
}
await browser.close();
