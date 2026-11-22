// A look at the Codex of Aurelion: on the ground, and in the hotbar with its tooltip. Saves screenshots/gilded/codex-*.png.
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3000';
mkdirSync('screenshots/gilded', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await launchBrowser();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const sc = (fn, ...a) => page.evaluate(fn, ...a);

await page.goto(`${url}/game?world=square&debug&nomobs&class=mage`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), null, { timeout: 180000 });
await sc(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
  window.__solrift.setWeather('clear');
  window.__solrift.setTime(0.3);
});
const sy = await sc(() => window.__solrift.surfaceY(0.5, 0.5));
await sc(([y]) => window.__solrift.teleport(0.5, y + 1.7, 3.5, 0, -0.45), [sy]);
await sc(([y]) => window.__solrift.spawnDrops([435, 435, 435], 0.1, y + 0.3, 0.5, 0.5), [sy]);
await sleep(1500);
await page.screenshot({ path: 'screenshots/gilded/codex-ground.png' });
console.log('errors:', JSON.stringify(errors.slice(0, 5)));
await browser.close();
