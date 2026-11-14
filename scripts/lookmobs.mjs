// Mobs lit by the world: a row of mobs at noon, golden hour and night. Usage: node scripts/lookmobs.mjs [url] [outDir] [prefix] [seed] [time,time,...]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:3000';
const outDir = process.argv[3] ?? 'tmp-shots';
const prefix = process.argv[4] ?? 'mobs';
const seed = Number(process.argv[5] ?? 17);
const times = (process.argv[6] ?? '0.25,0.47,0.72').split(',').map(Number);
const yaw = Number(process.argv[7] ?? 0);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('[err]', m.text().slice(0, 300)));
await page.goto(`${url}/?seed=${seed}&debug&nomobs`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
  window.__solrift.setMode('creative');
});
const site = await page.evaluate(() => window.__solrift.nearestVillage(0, 0));
await page.evaluate(([x, z]) => window.__solrift.teleport(x + 0.5, 150, z + 0.5), [site.x, site.z]);
await page.waitForTimeout(5000);
// Build a stone stage in the air above the village so the mobs stand in plain view on level ground.
const spot = await page.evaluate(([cx, cz]) => {
  const s = window.__solrift;
  const y0 = s.surfaceY(cx, cz) + 25;
  for (let dx = -12; dx <= 12; dx++) for (let dz = -14; dz <= 8; dz++) {
    s.setBlock(cx + dx, y0, cz + dz, 1);
    for (let h = 1; h <= 6; h++) s.setBlock(cx + dx, y0 + h, cz + dz, 0);
  }
  return { x: cx, z: cz, y: y0 };
}, [site.x, site.z]);
await page.waitForTimeout(4000);
console.log('spot', JSON.stringify(spot));
const y = spot.y;
for (const time of times) {
  await page.evaluate(([x, y, z, time, yaw]) => {
    const s = window.__solrift;
    s.clearMobs();
    s.setFlying(true);
    s.setTime(time);
    const kinds = ['pig', 'cow', 'sheep', 'zombie', 'skeleton', 'creeper', 'villager'];
    kinds.forEach((k, i) => {
      const th = (i / (kinds.length - 1) - 0.5) * 1.5;
      const mx = Math.floor(x + 5 * Math.sin(th));
      const mz = Math.floor(z - 5 * Math.cos(th));
      s.spawnMob(k, mx + 0.5, y + 1, mz + 0.5);
    });
    s.teleport(x + 0.5, y + 2.2, z + 0.5, yaw, -0.2);
  }, [spot.x, y, spot.z, time, yaw]);
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${outDir}/${prefix}-${time}.png` });
  console.log('saved', time);
}
await browser.close();
