// A look at the relics of the Hollow King: the armor on the figure (front and back, day and night), each weapon in the first-person hand,
// and the items in the inventory screen and lying on the ground. Saves screenshots/hk/*.png (a developer's look, not a test).
// Usage: node scripts/hk-look.mjs [url] [outDir]
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3200';
const outDir = process.argv[3] ?? 'screenshots/hk';
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await launchBrowser();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 })).newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${url}/?seed=1337&debug&nomobs&noshadows`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 240000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
});
const hook = (fn, ...args) => page.evaluate(([f, a]) => window.__solrift[f](...a), [fn, args]);
const shot = async (name, wait = 1500, clip) => {
  await sleep(wait);
  await page.screenshot({ path: `${outDir}/${name}.png`, ...(clip ? { clip } : {}) });
  console.log('saved', name);
};
const ARMOR = [700, 701, 702, 703];
const WEAPONS = [704, 705, 706];
await hook('clearInventory');
for (const id of [...ARMOR, ...WEAPONS, 707, 708]) await hook('give', id, 1);
const only = process.argv[3] ? [] : null;

// first person: each weapon in the hand
await hook('setTime', 0.3);
for (let i = 0; i < WEAPONS.length; i++) {
  await hook('select', ARMOR.length + i);
  await shot(`hand-${WEAPONS[i]}`, 2500);
}

// the inventory screen
await hook('openMenu', 'inventory');
await shot('inventory', 1500);
await hook('closeMenu');

// the figure in armor, from the front and the back
for (let slot = 0; slot < 4; slot++) await hook('setArmorSlot', slot, ARMOR[slot]);
await hook('select', ARMOR.length + 0);
for (const [name, time] of [['day', 0.3], ['night', 0.85]]) {
  await hook('setTime', time);
  for (const [view, label] of [[2, 'front'], [1, 'back']]) {
    await hook('setView', view);
    await shot(`figure-${name}-${label}`, 2500, { x: 500, y: 250, width: 260, height: 290 });
  }
}
// a staff and a crossbow in the figure's hand
for (let i = 1; i < WEAPONS.length; i++) {
  await hook('select', ARMOR.length + i);
  await hook('setView', 2);
  await shot(`figure-hand-${WEAPONS[i]}`, 2000, { x: 480, y: 250, width: 320, height: 290 });
}
await browser.close();
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no errors');
