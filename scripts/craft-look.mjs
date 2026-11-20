import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';
const out = process.argv[2] ?? 'screenshots/craft';
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await launchBrowser();
const errors = [];
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:3000/game?seed=1337&debug&nomobs&class=warrior', { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(() => { document.getElementById('overlay')?.style && (document.getElementById('overlay').style.display = 'none'); window.__solrift.forceLock(); });
// planks and sticks and coal in the bags, so some recipes can be made
await page.evaluate(() => { const s = window.__solrift; s.give(10, 16); s.give(256, 8); });
await page.keyboard.press('KeyE');
await sleep(800);
await page.click('[data-testid=tab-crafting]');
await sleep(600);
await page.screenshot({ path: `${out}/crafting.png` });
async function onScreen(sel) { const l = page.locator(sel); for (let i = 0; i < await l.count(); i++) { const b = await l.nth(i).boundingBox(); if (b && b.y > 0 && b.y < 800) return l.nth(i); } return page.locator('.none'); }
const first = await onScreen('.cb-item.can');
console.log('can', await page.locator('.cb-item.can').count(), 'table', await page.locator('.cb-item.table').count(), 'cannot', await page.locator('.cb-item.cannot').count());
if (await first.count()) { console.log('box', JSON.stringify(await first.boundingBox()), JSON.stringify(await page.evaluate(() => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, vv: visualViewport && { w: visualViewport.width, s: visualViewport.scale } })))); await first.hover(); await sleep(300); await page.screenshot({ path: `${out}/hover-can.png` }); await first.click(); await sleep(500); await page.mouse.move(100, 700); await sleep(300); await page.screenshot({ path: `${out}/after-click.png` }); }
await page.mouse.move(850, 400); await page.mouse.wheel(0, 2500); await sleep(400); await page.mouse.move(760, 330); await sleep(300); await page.screenshot({ path: `${out}/hover-table.png` });
console.log('errors', errors.slice(0, 5));
await browser.close();