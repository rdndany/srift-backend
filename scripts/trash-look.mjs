import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';
mkdirSync('screenshots/trash', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await launchBrowser();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await page.goto('http://localhost:3000/game?seed=1337&debug&nomobs&class=warrior', { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(() => { document.getElementById('overlay')?.style && (document.getElementById('overlay').style.display = 'none'); window.__solrift.forceLock(); });
await page.keyboard.press('KeyE');
await sleep(800);
const slots = await page.$$('#menu-screen .slot');
console.log('slots', slots.length);
for (const el of slots) { if (await el.$('.item-icon, img')) { await el.click(); break; } }
await sleep(500);
console.log('trash', await page.$('#menu-trash') !== null);
await page.mouse.move(300, 300);
await page.screenshot({ path: 'screenshots/trash/held.png' });
const t = await page.$('#menu-trash');
if (t) { await t.hover(); await sleep(200); await page.screenshot({ path: 'screenshots/trash/hover.png' }); await t.click({ button: 'left' }); await sleep(500); console.log('after', await page.$('#menu-trash') !== null); }
await browser.close();