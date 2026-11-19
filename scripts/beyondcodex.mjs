// Captures of the Codex of the World Beyond for the /beyond page: a traveller who has been to a few places opens the book (B).
// Scenes come from scripts/_scenes.json (see scripts/beyondshots.mjs). Usage: node scripts/beyondcodex.mjs [url] [outDir]
import { mkdirSync, readFileSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3000';
const outDir = process.argv[3] ?? 'tmp-shots/beyond';
mkdirSync(outDir, { recursive: true });
const scenes = JSON.parse(readFileSync(new URL('./_scenes.json', import.meta.url), 'utf8')).filter((s) => s.seed === 1);

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${url}/?seed=1&debug&nomobs&mode=creative&world=beyond&shadows=4096&postfx`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.() && window.__solrift.worldKind() === 'beyond', undefined, { timeout: 240000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  const st = document.createElement('style');
  st.textContent = 'nextjs-portal{display:none!important}';
  document.head.appendChild(st);
  const s = window.__solrift;
  s.forceLock();
  s.setHandHidden(true);
  s.setFlying(true);
});

// A journey: the biomes, a few places, two caverns.
const route = [
  ...scenes.filter((s) => s.group === 'biome').slice(0, 26),
  ...scenes.filter((s) => s.group === 'place').slice(0, 8),
  ...scenes.filter((s) => s.group === 'cave').slice(0, 3),
];
for (const s of route) {
  // (a place is found by standing at it)
  const spot = s.group === 'place' ? [s.at[0] + 0.5, s.at[1] + 6, s.at[2] + 0.5] : [s.x, s.y, s.z];
  await page.evaluate(([x, y, z, yaw, pitch]) => window.__solrift.teleport(x, y, z, yaw, pitch), [...spot, s.yaw, s.pitch]);
  await page.waitForTimeout(s.group === 'cave' ? 2600 : 1800);
}
const found = await page.evaluate(() => window.__solrift.beyond());
console.log('found', found.found.b.length, 'biomes', found.found.s?.length ?? '', found.found.a.length, 'deeds');

// back among the grass for the picture behind the book
const home = scenes.find((s) => s.name === 'biome-green_plains') ?? scenes[0];
await page.evaluate(([x, y, z, yaw, pitch]) => window.__solrift.teleport(x, y, z, yaw, pitch), [home.x, home.y, home.z, home.yaw, home.pitch]);
await page.evaluate(() => window.__solrift.setTime(0.3));
await page.waitForTimeout(4000);
await page.keyboard.press('KeyB');
await page.waitForSelector('#codex-window', { timeout: 5000 });
await page.waitForTimeout(900);
const snap = async (name) => {
  await page.screenshot({ path: `${outDir}/${name}.jpg`, type: 'jpeg', quality: 86 });
  console.log('saved', name);
};
await snap('codex-biomes');
for (const tab of ['places', 'caves', 'deeds']) {
  await page.click(`#codex-window [data-tab="${tab}"]`);
  await page.waitForTimeout(500);
  // bring the first thing found to the top of the list
  await page.evaluate(() => { const r = document.querySelector('#codex-window [data-found="true"]'); const b = document.querySelector('#codex-window .codex-body'); if (r && b) b.scrollTop = Math.max(0, r.offsetTop - b.offsetTop - 6); });
  await page.waitForTimeout(200);
  await snap(`codex-${tab}`);
}
await browser.close();
