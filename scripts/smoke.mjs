// Headless smoke test: loads the game, waits for the world to generate, screenshots it,
// and fails on console errors. Usage: node scripts/smoke.mjs [url] [outDir]
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[console.${m.type()}]`, m.text());
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => {
  console.log('[pageerror]', e.message);
  errors.push(e.message);
});

const t0 = Date.now();
await page.goto(url + '/?seed=1337', { waitUntil: 'load' });

try {
  await page.waitForFunction(() => document.getElementById('status')?.textContent === '', undefined, { timeout: 120000 });
} catch {
  console.log('status stuck at:', await page.evaluate(() => document.getElementById('status')?.textContent));
  await page.screenshot({ path: `${outDir}/stuck.png` });
  await browser.close();
  process.exit(1);
}
console.log(`world ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// Hide the start overlay (pointer lock is not available headless) and show debug.
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  document.getElementById('debug').style.display = 'block';
});
await page.waitForTimeout(2500);
await page.screenshot({ path: `${outDir}/world.png` });

const info = await page.evaluate(() => ({
  hotbar: document.querySelectorAll('#hotbar .slot').length,
  net: document.getElementById('net')?.textContent,
  canvas: (() => {
    const c = document.getElementById('game');
    return `${c.width}x${c.height}`;
  })(),
}));
console.log('info', info);

await browser.close();
if (errors.length) {
  console.log(`FAILED with ${errors.length} console error(s)`);
  process.exit(1);
}
console.log('smoke OK');
