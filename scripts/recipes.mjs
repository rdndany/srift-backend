// Recipe book E2E: the green book button opens the book, it starts empty, recipes appear as you pick up
// their ingredients, a click lays a recipe out in the grid, shift fills as many as you can, search and
// tabs filter, creative shows everything, and the same works on a server.
// Usage: node scripts/recipes.mjs [url] [outDir]   (the game server needs CHEATS=1, as scripts/e2e.mjs sets)
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const LOG = 6, PLANKS = 10, COBBLE = 11, STICK = 256, COAL = 257;

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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
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
const countOf = (page, id) => sc(page, (i) => window.__solrift.countOf(i), id);
// (The book also lists the forge's upgrades past +9, whatever the player has seen: those are not recipes that are learned.)
const recipes = (page) => page.locator('.rb-item:not(.forge)');
/** The Craft button makes what the grid shows (with shift: as many as the items allow); it takes a moment. */
const craft = async (page, all = false) => {
  await page.locator('[data-testid="forge-button"]').click(all ? { modifiers: ['Shift'] } : {});
  await until(() => page.locator('.slot[data-slot="40"]:not(.preview) img.item-icon').count().then((n) => n > 0), 15000);
};
/** The recipe whose result is `id` (the book tags recipes with their index; the title shows the name). */
const hoverName = async (page, name) => {
  const n = await recipes(page).count();
  for (let i = 0; i < n; i++) {
    await recipes(page).nth(i).hover();
    if (((await recipes(page).nth(i).getAttribute('data-name')) ?? '').startsWith(name)) return recipes(page).nth(i);
  }
  return null;
};
const slotHasItem = (page, slot) => page.locator(`.slot[data-slot="${slot}"] img.item-icon`).count().then((n) => n > 0);

// ---------------------------------------------------------------------------------------------------
console.log('single player');
const page = await open('?seed=1337&debug&nomobs', 'solo');
await sc(page, () => window.__solrift.setMode('survival'));
await sc(page, () => window.__solrift.clearInventory());
await sc(page, () => window.__solrift.openMenu('inventory'));
await page.locator('[data-testid="tab-crafting"]').click();
check(await until(async () => (await page.locator('[data-testid="book-button"]').count()) === 1), 'the inventory screen has the green book button');
check((await page.locator('[data-testid="recipe-book"]').count()) === 0, 'the book starts closed');

await page.locator('[data-testid="book-button"]').click();
check(await until(async () => (await page.locator('[data-testid="recipe-book"]').count()) === 1), 'the button opens the book');
check((await recipes(page).count()) === 0, 'a player who has picked up nothing knows no recipes');
check((await page.locator('.rb-item').count()) === (await page.locator('.rb-item.forge').count()), "and the book lists only the forge's upgrades");
await page.screenshot({ path: `${outDir}/recipes-empty.png` });

console.log('recipes appear with ingredients');
await sc(page, (id) => window.__solrift.give(id, 3), LOG);
check(await until(async () => (await recipes(page).count()) === 1), 'one log unlocks the one recipe that uses it (planks)');
check(await until(async () => (await page.locator('[data-testid="recipe-toast"]').count()) === 1), 'a "New Recipes Unlocked!" card slides in');
check((await page.locator('#recipe-toast').innerText()).includes('New Recipes Unlocked!'), 'and says so');
await sleep(500); // let it finish sliding in
await page.screenshot({ path: `${outDir}/recipes-toast.png` });
await sc(page, (id) => window.__solrift.give(id, 1), LOG);
await sleep(300);
check((await page.locator('[data-testid="recipe-toast"]').count()) === 1, 'more of the same item does not announce anything again');
check(await until(async () => (await page.locator('.rb-item.can').count()) === 1), 'it is lit as makeable');

console.log('a click fills the grid');
await recipes(page).first().hover();
check(await until(() => page.locator('.slot[data-slot="36"] img.ghost').count().then((n) => n > 0)), 'pointing at a recipe shows its ingredients as a ghost in the grid');
check((await page.locator('.tooltip').innerText()).toLowerCase().includes('planks'), 'and names it');
await recipes(page).first().click();
check(await until(() => slotHasItem(page, 36)), 'the log is laid out in the grid');
check(await slotHasItem(page, 40), 'the result (planks) shows');
check((await countOf(page, LOG)) === 3, 'one log came out of the inventory');
await page.screenshot({ path: `${outDir}/recipes-planks.png` });

check((await page.locator('.slot[data-slot="40"].preview').count()) === 1, 'as a preview: it is not made yet');
await craft(page);
await page.locator('.slot[data-slot="40"]').click({ modifiers: ['Shift'] });
check(await until(async () => (await countOf(page, PLANKS)) === 4), 'the Craft button makes it, and a shift-click takes it');
check(await until(async () => (await recipes(page).count()) >= 3), 'planks in hand unlock sticks and a crafting table too');

console.log('shift-click fills as many as it can');
await sc(page, (id) => window.__solrift.give(id, 8), PLANKS); // 12 planks
const sticks = await hoverName(page, 'stick');
check(sticks !== null, 'there is a stick recipe in the list');
await sticks.click({ modifiers: ['Shift'] });
// 12 planks over two cells: six crafts of four sticks.
const grid36 = await page.locator('.slot[data-slot="36"] .count').innerText().catch(() => '');
check(grid36 === '6', `the grid holds six crafts' worth (${grid36 || 'none'})`);
await craft(page, true);
await page.locator('.slot[data-slot="40"]').click({ modifiers: ['Shift'] });
check(await until(async () => (await countOf(page, STICK)) === 24), 'and a shift-click on Craft makes all 24 sticks');
await page.screenshot({ path: `${outDir}/recipes-sticks.png` });

console.log('what you cannot make is greyed out and does nothing');
const before = await countOf(page, PLANKS);
check((await page.locator('.rb-item.cannot').count()) > 0, 'recipes without the ingredients are marked');
const cannot = page.locator('.rb-item.cannot').first();
await cannot.click();
await sleep(300);
check((await countOf(page, PLANKS)) === before && !(await slotHasItem(page, 36)), 'clicking one does nothing');

console.log('tabs, search and "can make"');
await sc(page, (id) => window.__solrift.give(id, 5), COBBLE);
await sc(page, (id) => window.__solrift.give(id, 2), COAL);
const all = await recipes(page).count();
await page.locator('[data-tab="building"]').click();
const tabbed = await recipes(page).count();
check(tabbed > 0 && tabbed < all, `the Building tab narrows the list (${tabbed} of ${all})`);
await page.locator('[data-tab="all"]').click();
await page.locator('.rb-search').fill('torch');
check(await until(async () => (await recipes(page).count()) === 2), 'searching for "torch" finds the torch and the redstone torch');
// Typing an "e" must not close the screen.
await page.locator('.rb-search').fill('e');
check((await sc(page, () => window.__solrift.screen())) !== 'none', 'typing E in the search box does not close the inventory');
await page.locator('.rb-search').fill('');
await page.locator('.rb-only').click();
const can = await recipes(page).count();
check(can > 0 && can === (await page.locator('.rb-item.can').count()), `"can make" keeps only makeable recipes (${can})`);
await page.locator('.rb-only').click();

console.log('it is remembered');
const ensureBook = async (pg) => {
  if ((await pg.locator('[data-testid="recipe-book"]').count()) === 0) await pg.locator('[data-testid="book-button"]').click();
  await until(async () => (await pg.locator('[data-testid="recipe-book"]').count()) === 1);
};
await sc(page, () => window.__solrift.closeMenu());
await sc(page, () => window.__solrift.clearInventory());
await sc(page, () => window.__solrift.openMenu('inventory'));
await page.locator('[data-testid="tab-crafting"]').click();
check(await sleep(300).then(async () => (await page.locator('[data-testid="recipe-book"]').count()) === 0), 'the book closes with the window');
await ensureBook(page);
check((await recipes(page).count()) > 3, 'and the recipes stay learned after the items are gone');
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 120000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
});
await sc(page, () => window.__solrift.openMenu('inventory'));
await page.locator('[data-testid="tab-crafting"]').click();
await ensureBook(page);
check(await until(async () => (await recipes(page).count()) > 3), 'even after a reload');
check((await page.locator('[data-testid="recipe-toast"]').count()) === 0, 'and a reload does not announce them again');

console.log('the crafting table has the whole 3x3 list');
await sc(page, () => window.__solrift.closeMenu());
await sc(page, () => window.__solrift.openMenu('crafting'));
check(await until(async () => (await page.locator('[data-testid="book-button"]').count()) === 1), 'the crafting table has the button too');
await ensureBook(page);
const totalRecipes = async (pg) => {
  const pages = Number((await pg.locator('[data-testid="rb-page"]').innerText()).split('/')[1]);
  for (let i = 1; i < pages; i++) await pg.locator('[data-testid="rb-next"]').click();
  const last = await recipes(pg).count();
  for (let i = 1; i < pages; i++) await pg.locator('[data-testid="rb-prev"]').click();
  return (pages - 1) * 30 + last;
};
const small = await totalRecipes(page);
check(small > 3, `the table lists recipes (${small})`);
await page.screenshot({ path: `${outDir}/recipes-table.png` });

console.log('creative sees them all');
await sc(page, () => window.__solrift.closeMenu());
await sc(page, () => window.__solrift.setMode('creative'));
await sc(page, () => window.__solrift.openMenu('crafting'));
await ensureBook(page);
check(await until(async () => (await totalRecipes(page)) > small), 'creative lists every recipe');
check(Number((await page.locator('[data-testid="rb-page"]').innerText()).split('/')[1]) >= 2, 'a long list is split into pages');
await page.locator('[data-testid="rb-next"]').click();
check((await page.locator('[data-testid="rb-page"]').innerText()).startsWith('2/'), 'the arrow turns the page');
check((await recipes(page).count()) > 0, 'and the second page has recipes');
await page.screenshot({ path: `${outDir}/recipes-creative.png` });

// ---------------------------------------------------------------------------------------------------
console.log('online');
const online = await open(`?online&debug&name=book${Date.now() % 10000}`, 'online');
// Get some planks from the creative palette, then play on in survival.
await sc(online, () => window.__solrift.chat('/gamemode creative'));
await sleep(400);
await sc(online, () => window.__solrift.command({ t: 'inventory' }));
const planksSlot = online.locator('.slot.palette:has(img[alt="planks"])').first();
check(await until(async () => (await planksSlot.count()) === 1, 15000), 'the creative palette is there online');
await planksSlot.click({ modifiers: ['Shift'] });
await sleep(300);
await sc(online, () => window.__solrift.command({ t: 'closeMenu' }));
await sc(online, () => window.__solrift.chat('/gamemode survival'));
await sleep(400);
await sc(online, () => window.__solrift.command({ t: 'inventory' }));
await online.locator('[data-testid="tab-crafting"]').click();
check(await until(async () => (await online.locator('[data-testid="book-button"]').count()) === 1), 'the server sends the inventory screen with the book button');
if ((await online.locator('[data-testid="recipe-book"]').count()) === 0) await online.locator('[data-testid="book-button"]').click();
check(await until(async () => (await online.locator('[data-testid="recipe-book"]').count()) === 1), 'the book opens online');
check(await until(async () => (await online.locator('.rb-item.can').count()) > 0), 'the planks in the inventory unlock recipes');
await online.locator('.rb-item.can').first().click();
check(await until(() => online.locator('.slot[data-slot="36"] img.item-icon').count().then((n) => n > 0), 5000), 'a click lays the recipe out on the server');
await online.screenshot({ path: `${outDir}/recipes-online.png` });
await browser.close();
const real = errors.filter((e) => !/favicon|WebSocket|ERR_CONNECTION|Failed to load resource/i.test(e));
if (real.length) {
  console.log('console errors:', real);
  failures.push('console errors');
}
if (failures.length) {
  console.log(`RECIPES E2E FAILED (${failures.length})`);
  process.exit(1);
}
console.log('RECIPES E2E passed');
