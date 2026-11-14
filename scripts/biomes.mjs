// Visits a stretch of every biome of a seed in the browser and saves a picture of each as `biome-<name>.png`.
// Usage: node --import tsx scripts/biomes.mjs [seed] [url] [outDir] [only,names]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { BIOME_NAMES, WorldGenerator } from '../packages/shared/src/index.ts';

const seed = Number(process.argv[2] ?? 1337);
const url = process.argv[3] ?? 'http://localhost:3000';
const outDir = process.argv[4] ?? 'screenshots';
const only = process.argv[5] ? process.argv[5].split(',') : null;
mkdirSync(outDir, { recursive: true });

// The nearest big patch of each biome (5 x 5 samples, 7 blocks apart, all the same biome).
const gen = new WorldGenerator(seed);
const found = new Map();
for (let r = 0; r < 9000; r += 16) {
  for (let a = 0; a < Math.max(1, r / 12); a++) {
    const ang = (a / Math.max(1, r / 12)) * Math.PI * 2;
    const cx = Math.round(Math.cos(ang) * r);
    const cz = Math.round(Math.sin(ang) * r);
    const b = gen.columnAt(cx, cz).biome;
    if (found.has(b)) continue;
    let same = true;
    for (let dz = -14; dz <= 14 && same; dz += 7) for (let dx = -14; dx <= 14; dx += 7) if (gen.columnAt(cx + dx, cz + dz).biome !== b) { same = false; break; }
    if (same) found.set(b, { x: cx, z: cz, h: gen.columnAt(cx, cz).height });
  }
}
const slug = (n) => n.toLowerCase().replace(/[^a-z]+/g, '-');
const todo = [...found.entries()].filter(([b]) => !only || only.includes(slug(BIOME_NAMES[b])));
console.log(todo.map(([b, p]) => `${BIOME_NAMES[b]} @ ${p.x},${p.z}`).join('\n'));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${url}/?seed=${seed}&debug&nomobs`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), null, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
  window.__solrift.setMode?.('creative');
  window.__solrift.setFlying?.(true);
  window.__solrift.setHandHidden?.(true);
  window.__solrift.setDebug?.(false);
  window.__solrift.setTime?.(0.3);
});
for (const [b, p] of todo) {
  const name = slug(BIOME_NAMES[b]);
  const eye = Math.max(p.h, 63) + 6;
  await page.evaluate(([x, y, z]) => window.__solrift.teleport(x + 0.5, y, z + 0.5, 0.6, -0.12), [p.x, eye + 40, p.z]);
  let ground = 0;
  for (let i = 0; i < 60 && ground < 1; i++) {
    await sleep(500);
    ground = await page.evaluate(([x, z]) => window.__solrift.surfaceY(x, z), [p.x, p.z]);
  }
  await page.evaluate(([x, y, z]) => window.__solrift.teleport(x + 0.5, y, z + 0.5, 0.6, -0.14), [p.x, Math.max(ground, 63) + 7, p.z]);
  await sleep(5000);
  await page.screenshot({ path: `${outDir}/biome-${name}.png` });
  console.log('saved', name, 'ground', ground);
}
console.log(errors.length ? `page errors: ${errors.slice(0, 5).join(' | ')}` : 'no page errors');
await browser.close();
