// Visual check of villages in three biomes. Usage: node scripts/lookvillage.mjs [url] [outDir] [prefix] [seeds,comma] [time]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:3000';
const outDir = process.argv[3] ?? 'tmp-shots';
const prefix = process.argv[4] ?? 'vil';
const seeds = (process.argv[5] ?? '19,17,56').split(',').map(Number);
const time = Number(process.argv[6] ?? 0.14);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
for (const seed of seeds) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => m.type() === 'error' && console.log('[err]', m.text().slice(0, 500)));
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`${url}/?seed=${seed}&debug&nomobs`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
  await page.evaluate(() => {
    document.getElementById('overlay').style.display = 'none';
    const s = window.__solrift;
    s.forceLock();
    s.setMode('creative');
  });
  const site = await page.evaluate(() => window.__solrift.nearestVillage(0, 0));
  if (!site) {
    console.log('no village for', seed);
    await page.close();
    continue;
  }
  await page.evaluate(([x, z]) => window.__solrift.teleport(x + 0.5, 150, z + 0.5), [site.x, site.z]);
  await page.waitForTimeout(6000);
  const y = await page.evaluate(([x, z]) => window.__solrift.surfaceY(x, z), [site.x, site.z]);
  const shots = [
    ['street', site.x + 0.5, y + 3, site.z + 14.5, 0, -0.12],
    ['aerial', site.x + 0.5, y + 22, site.z + 26.5, 0, -0.55],
  ];
  for (const [name, x, yy, z, yaw, pitch] of shots) {
    await page.evaluate(([x, y, z, yaw, pitch, time]) => {
      const s = window.__solrift;
      s.setFlying(true);
      s.setTime(time);
      s.teleport(x, y, z, yaw, pitch);
    }, [x, yy, z, yaw, pitch, time]);
    await page.waitForTimeout(4500);
    await page.screenshot({ path: `${outDir}/${prefix}-${seed}-${name}.png` });
    console.log('saved', seed, name);
  }
  await page.close();
}
await browser.close();
