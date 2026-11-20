// The big damage numbers: a zombie in front of the player, hit with a swing, and a picture of the numbers floating up.
// Usage: node scripts/bignum-look.mjs [class=warrior] [outDir]   (the dev server must be running)
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const cls = process.argv[2] ?? 'warrior';
const outDir = process.argv[3] ?? 'screenshots/bignum';
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchBrowser();
const errors = [];
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:3000/game?seed=1337&debug&nomobs&class=${cls}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay')?.style && (document.getElementById('overlay').style.display = 'none');
  window.__solrift.forceLock();
});
const hit = await page.evaluate(async () => {
  const s = window.__solrift;
  const p = s.position();
  const px = Math.floor(p.x);
  const pz = Math.floor(p.z);
  const gy = s.surfaceY(px, pz);
  for (let x = px - 8; x <= px + 8; x++)
    for (let z = pz - 12; z <= pz + 8; z++) {
      for (let y = gy; y <= gy + 8; y++) s.setBlock(x, y, z, 0);
      s.setBlock(x, gy - 1, z, 3);
    }
  s.setTime(0.3);
  s.teleport(px + 0.5, gy, pz + 0.5, 0, -0.12);
  const id = s.spawnMob('zombie', px + 0.5, gy, pz - 1.6);
  const m = s.mobs().find((x) => x.id === id);
  return { id, health: m?.health };
});
console.log('zombie', JSON.stringify(hit));
await sleep(2500);
for (let i = 0; i < 2; i++) {
  await page.evaluate(() => window.__solrift.swing());
  await sleep(i ? 150 : 700);
}
await page.screenshot({ path: `${outDir}/hit.png` });
console.log('mobs', JSON.stringify(await page.evaluate(() => window.__solrift.mobs().map((m) => ({ k: m.kind, h: m.health })))));
await browser.close();
if (errors.length) console.log('errors', errors.slice(0, 5));
