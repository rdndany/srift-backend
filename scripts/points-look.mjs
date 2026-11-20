// The stat points in the inventory window: opens it at level 12, spends points through the buttons, and takes a picture.
// Usage: node scripts/points-look.mjs [class=warrior] [outDir]   (the dev server must be running)
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const cls = process.argv[2] ?? 'warrior';
const outDir = process.argv[3] ?? 'screenshots/points';
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchBrowser();
const errors = [];
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:3000/game?seed=1337&debug&nomobs&class=${cls}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay')?.style && (document.getElementById('overlay').style.display = 'none');
  window.__solrift.forceLock();
});
await page.evaluate(() => window.__solrift.addXp(100000));
await sleep(800);
console.log('view', JSON.stringify(await page.evaluate(() => { const v = window.__solrift.classView(); return { level: v.level, free: v.free, pts: v.pts, hp: v.maxHealth }; })));
await page.keyboard.press('KeyE');
await sleep(800);
await page.screenshot({ path: `${outDir}/before.png` });
await page.click('[data-testid=attr-add-vit]');
await page.click('[data-testid=attr-add-vit]', { modifiers: ['Shift'] });
await page.click('[data-testid=attr-add-str]', { modifiers: ['Shift'] });
await sleep(800);
console.log('free', await page.textContent('[data-testid=attr-free]'));
console.log('view', JSON.stringify(await page.evaluate(() => { const v = window.__solrift.classView(); return { level: v.level, free: v.free, pts: v.pts, hp: v.maxHealth }; })));
await page.screenshot({ path: `${outDir}/after.png` });
await browser.close();
if (errors.length) console.log('errors', errors.slice(0, 5));
