// Visual scenario runner: drives the game through ?debug hooks and saves screenshots.
// Usage: node scripts/scenarios.mjs [url] [outDir]
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const B = { AIR: 0, STONE: 1, GLASS: 17, GLOWSTONE: 19, PLANKS: 10, COBBLE: 11, WATER: 5 };

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(url + '/?seed=1337&debug&nomobs', { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 120000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.setDebug(true);
});

const sc = (fn, ...args) => page.evaluate(fn, ...args);
const shot = async (name, wait = 1500) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('saved', name);
};

// Build scenarios around wherever the player spawned.
const pos = await sc(() => window.__solrift.position());
console.log('player at', pos);
const px = Math.floor(pos.x);
const pz = Math.floor(pos.z);

// 1) Night on the surface.
await sc(([x, y, z]) => {
  window.__solrift.teleport(x, y + 4, z, 0.6, -0.15);
  window.__solrift.setTime(0.75);
}, [pos.x, pos.y, pos.z]);
await shot('night');

// 2) Sealed underground room lit only by glowstone.
const cy = 24;
await sc(
  ([px, pz, cy, STONE, AIR, GLOW, PLANKS]) => {
    const s = window.__solrift;
    // Solid stone shell, hollow 7x4x7 room.
    for (let x = px - 5; x <= px + 5; x++)
      for (let z = pz - 5; z <= pz + 5; z++)
        for (let y = cy - 1; y <= cy + 5; y++) {
          const inside = x >= px - 3 && x <= px + 3 && z >= pz - 3 && z <= pz + 3 && y >= cy && y <= cy + 3;
          s.setBlock(x, y, z, inside ? AIR : STONE);
        }
    s.setBlock(px + 3, cy + 2, pz, GLOW);
    for (let i = -1; i <= 1; i++) s.setBlock(px - 2, cy, pz + i, PLANKS);
    s.teleport(px - 2.5, cy, pz + 2.6, -0.7, -0.1);
    s.setTime(0.25);
  },
  [px, pz, cy, B.STONE, B.AIR, B.GLOWSTONE, B.PLANKS],
);
await shot('cave-glowstone', 2500);

// 3) Same room without the glowstone: should be nearly black.
await sc(([px, pz, cy, AIR]) => window.__solrift.setBlock(px + 3, cy + 2, pz, AIR), [px, pz, cy, B.AIR]);
await shot('cave-dark', 2500);

// 4) Break particles + placing blocks on the surface at noon.
await sc(
  ([x, y, z]) => {
    const s = window.__solrift;
    s.teleport(x, y + 0.5, z, 0.2, -0.35);
    s.setTime(0.25);
    const gy = s.surfaceY(x, z - 4);
    for (let i = 0; i < 4; i++) s.setBlock(x + i - 2, gy + 1, z - 4, i % 2 ? 11 : 10);
    s.setBlock(x, gy + 2, z - 4, 17);
    s.setBlock(x + 1, gy + 2, z - 4, 19);
    s.burst(x + 3, gy, z - 4, 1);
  },
  [px, pos.y, pz],
);
await shot('edits', 800);

console.log(await sc(() => JSON.stringify(window.__solrift.stats())));
await browser.close();
if (errors.length) {
  console.log('console errors:', errors);
  process.exit(1);
}
console.log('scenarios OK');
