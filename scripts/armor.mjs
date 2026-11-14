// Armor E2E: put armor on by right-click and from the inventory screen, see the character and the
// armor icons, take a hit in armor, and the same inventory screen online.
// Usage: node scripts/armor.mjs [url] [outDir]   (the game server needs CHEATS=1, as scripts/e2e.mjs sets)
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

// Armor ids: 310 + material * 4 + slot (materials: leather, gold, iron, diamond; slots: helmet .. boots).
const armorId = (material, slot) => 310 + material * 4 + slot;
const LEATHER = 0, GOLD = 1, IRON = 2, DIAMOND = 3;

const browser = await launchBrowser();
const errors = [];
const failures = [];
const check = (cond, msg) => {
  if (cond) console.log('  ok  ', msg);
  else {
    console.log('  FAIL', msg);
    failures.push(msg);
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(100);
  }
  return false;
};

async function open(path, name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(`${url}/${path}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 120000 });
  await page.evaluate(() => {
    document.getElementById('overlay').style.display = 'none';
    window.__solrift.forceLock();
  });
  return page;
}
const sc = (page, fn, ...args) => page.evaluate(fn, ...args);
const armor = (page) => sc(page, () => window.__solrift.armor());

// ---------------------------------------------------------------------------------------------------
console.log('single player');
const page = await open('?seed=1337&debug&nomobs', 'solo');
let a = await armor(page);
check(a.defense === 0 && a.worn.every((id) => id === 0), 'a new player wears nothing');
check((await page.locator('#armor-row').count()) === 0, 'no armor icons while unarmored');

console.log('right-click to wear');
await sc(page, ([id]) => window.__solrift.give(id, 1), [armorId(IRON, 1)]);
const slot = await sc(page, (id) => window.__solrift.inventory().findIndex((s) => s && s[0] === id), armorId(IRON, 1));
await sc(page, (i) => window.__solrift.select(i), slot);
await sc(page, () => window.__solrift.equipHeld());
a = await armor(page);
check(a.worn[1] === armorId(IRON, 1) && a.defense === 6, 'an iron chestplate gives 6 defense');
check(await until(async () => (await page.locator('#armor-row').count()) === 1), 'the armor bar appears in the character frame');

console.log('the inventory screen');
for (const [m, s] of [[DIAMOND, 0], [DIAMOND, 2], [GOLD, 3]]) await sc(page, ([id]) => window.__solrift.give(id, 1), [armorId(m, s)]);
await sc(page, () => window.__solrift.openMenu('inventory'));
check(await until(async () => (await page.locator('.armor-col .slot:not(.locked)').count()) === 4), 'four armor slots');
check((await page.locator('canvas.char-preview').count()) === 1, 'the character is drawn');
check((await page.locator('.armor-col .slot').nth(1).locator('img.item-icon').count()) === 1, 'the chestplate shows in its slot');
check((await page.locator('.armor-col .slot').nth(0).locator('img.ghost').count()) === 1, 'an empty slot shows a ghost of what goes there');
await page.mouse.move(900, 250);
await sleep(300);
await page.screenshot({ path: `${outDir}/armor-inventory-1.png` });

// Shift-click the diamond helmet, leggings and gold boots in.
const where = (id) => sc(page, (i) => window.__solrift.inventory().findIndex((s) => s && s[0] === i), id);
for (const id of [armorId(DIAMOND, 0), armorId(DIAMOND, 2), armorId(GOLD, 3)]) {
  const i = await where(id);
  await page.click(`[data-slot="${i}"]`, { modifiers: ['Shift'] });
}
await sleep(200);
a = await armor(page);
check(a.worn[0] === armorId(DIAMOND, 0) && a.worn[2] === armorId(DIAMOND, 2) && a.worn[3] === armorId(GOLD, 3), 'shift-click puts each piece in its slot');
check(a.defense === 3 + 6 + 6 + 1, `defense adds up (${a.defense})`);
await page.mouse.move(1000, 150);
await sleep(400);
await page.screenshot({ path: `${outDir}/armor-inventory-2.png` });

// The figure looks straight at you when the mouse is right in front of it.
const box = await page.locator('canvas.char-preview').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.28);
await sleep(400);
await page.screenshot({ path: `${outDir}/armor-inventory-front.png` });

// Wrong slot: pick up the gold boots and try to drop them on the helmet slot.
await page.locator('.armor-col .slot').nth(3).click();
await page.locator('.armor-col .slot').nth(0).click();
a = await armor(page);
check(a.worn[0] === armorId(DIAMOND, 0), 'boots will not go in the helmet slot');
await page.locator('.armor-col .slot').nth(3).click(); // put them back
a = await armor(page);
check(a.worn[3] === armorId(GOLD, 3), 'and go back where they were');
await sc(page, () => window.__solrift.closeMenu());
check(await until(async () => (await page.locator('#armor-row').count()) === 1), 'icons after closing');
await sleep(300);
await page.screenshot({ path: `${outDir}/armor-hud.png` });

console.log('taking a hit');
const hp0 = (await sc(page, () => window.__solrift.vitals())).health;
await sc(page, () => window.__solrift.hurtByMob(6));
const hp1 = (await sc(page, () => window.__solrift.vitals())).health;
check(hp0 - hp1 < 6 && hp0 - hp1 > 0, `armor softens a 6 damage hit (took ${(hp0 - hp1).toFixed(2)})`);
a = await armor(page);
check(a.wear.every((w) => w >= 1), 'every piece wore down');

console.log('creative hides the armor icons');
await sc(page, () => window.__solrift.setMode('creative'));
check(await until(async () => (await page.locator('#armor-row').count()) === 0), 'hidden in creative');

// ---------------------------------------------------------------------------------------------------
console.log('online');
const online = await open(`?online&debug&name=armoruser${Date.now() % 10000}`, 'online');
await sc(online, () => window.__solrift.command({ t: 'inventory' }));
check(await until(async () => (await online.locator('.armor-col .slot:not(.locked)').count()) === 4), 'the server sends the inventory screen with armor slots');
check((await online.locator('canvas.char-preview').count()) === 1, 'the character is drawn online too');
await online.screenshot({ path: `${outDir}/armor-online.png` });

await browser.close();
const real = errors.filter((e) => !/favicon|WebSocket|ERR_CONNECTION|Failed to load resource/i.test(e));
if (real.length) {
  console.log('console errors:', real);
  failures.push('console errors');
}
if (failures.length) {
  console.log(`ARMOR E2E FAILED (${failures.length})`);
  process.exit(1);
}
console.log('ARMOR E2E passed');