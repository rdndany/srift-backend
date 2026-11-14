// Flies a camera round Dawnwatch (the wall, the gates, the districts) and saves a picture of each view as `village-*.png`.
// Usage: node scripts/village.mjs [url] [outDir]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:3000';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const sc = (fn, ...args) => page.evaluate(fn, ...args);

await page.goto(`${url}/?world=adventure&debug&nomobs`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.() && window.__solrift.worldKind() === 'adventure', null, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
});
await sleep(1500);

// Up in the air first, so the chunks round the village load, then find the village's ground.
await sc(() => window.__solrift.teleport(0.5, 130, 30.5, 0, -0.6));
let ground = 0;
for (let i = 0; i < 80 && ground < 1; i++) {
  await sleep(500);
  ground = await sc(() => window.__solrift.surfaceY(0, 0));
}
console.log('village ground', ground);
await sleep(4000);

const view = async (name, x, dy, z, yaw, pitch) => {
  await sc(([a, b, c, d, e]) => window.__solrift.teleport(a, b, c, d, e), [x, ground + dy, z, yaw, pitch]);
  await sleep(2500);
  await page.screenshot({ path: `${outDir}/village-${name}.png` });
  console.log('saved', name);
};
const N = 0;
const W = Math.PI / 2;
const S = Math.PI;
const E = -Math.PI / 2;

const hub = ground - 3;
const at = async (name, x, y, z, yaw, pitch) => view(name, x, y - ground, z, yaw, pitch);
await at('aerial-south', 0.5, hub + 45, 62, N, -0.72);
await at('aerial-north', 0.5, hub + 45, -62, S, -0.72);
await at('aerial-top', 0.5, hub + 85, 0.5, N, -1.5);
await at('south-gate-out', 0.5, hub + 5, 58, N, -0.12);
await at('south-gate-in', 0.5, hub + 4, 22, S, -0.08);
await at('east-gate-out', 56, hub + 12, 8, 1.15, -0.3);
await at('north-gate-in', 0.5, hub + 5, -14, N, -0.1);
await at('garden', 0.5, hub + 14, -12, N, -0.45);
await at('market', 6.5, hub + 9, 8, -2.05, -0.4);
await at('lane', 2, hub + 10, -12, -0.84, -0.35);
await at('orchard', -6, hub + 9, -14, 1.06, -0.3);
await at('pond', -8.5, hub + 8, 18, W + 0.5, -0.35);
await at('walkway', -36.5, hub + 4.2, 14.5, S, 0);
await at('tower', 22, hub + 7, 24, -2.27, -0.1);
await at('paddock', 6, hub + 12, 18, -1.2, -0.45);
console.log(errors.length ? `page errors: ${errors.slice(0, 5).join(' | ')}` : 'no page errors');
await browser.close();

