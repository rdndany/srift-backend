// Enchanting E2E: bookshelves around an enchanting table are counted, the table screen shows three offers
// for the item in its slot, choosing one spends lapis and levels and enchants the item (which then shimmers
// and lists its enchantments), an enchanted tool does what it says (Silk Touch), and an anvil mends a tool
// with its material. Saves `enchanting-*.png`.
// Usage: node scripts/enchanting.mjs [url] [outDir]   (the game server needs CHEATS=1, as scripts/e2e.mjs sets)
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const ITEM_SLOT = 36;
const LAPIS_SLOT = 37;
const RESULT_SLOT = 38;
const BOOKSHELF = 255;
const TABLE = 254;
const ANVIL = 59;
const STONE_BLOCK = 1;
const AIR = 0;

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
const until = async (fn, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(200);
  }
  return false;
};

const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${url}/?seed=1337&debug&nomobs`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 120000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
});
const sc = (fn, ...args) => page.evaluate(fn, ...args);
const shot = async (name, wait = 600) => {
  await sleep(wait);
  await page.screenshot({ path: `${outDir}/enchanting-${name}.png` });
  console.log('saved', name);
};
const id = (name) => sc((n) => window.__solrift.itemId(n), name);
const slotOf = async (itemId) => {
  const inv = await sc(() => window.__solrift.inventory());
  return inv.findIndex((s) => s && s[0] === itemId);
};
const slot = (n) => page.locator(`#menu-screen [data-slot="${n}"]`);

const SWORD = await id('iron_sword');
const LAPIS = await id('lapis_lazuli');
const PICK = await id('diamond_pickaxe');
const INGOT = await id('iron_ingot');
const STONE = await id('stone');
const COBBLE = await id('cobblestone');
check(SWORD > 0 && LAPIS > 0 && PICK > 0 && INGOT > 0 && STONE > 0 && COBBLE > 0, `item ids found (${[SWORD, LAPIS, PICK, INGOT, STONE, COBBLE]})`);

// A flat stone platform up in the air, with the table in the middle of a full ring of bookshelves.
const here = await sc(() => window.__solrift.position());
const bx = Math.floor(here.x) + 12;
const bz = Math.floor(here.z) + 12;
const ground = await sc(([x, z]) => window.__solrift.surfaceY(x, z), [bx, bz]);
const Y = ground + 8;
await sc(
  ([bx, bz, Y, STONE_BLOCK, AIR, TABLE, BOOKSHELF]) => {
    const s = window.__solrift;
    for (let x = bx - 5; x <= bx + 5; x++)
      for (let z = bz - 5; z <= bz + 5; z++) {
        s.setBlock(x, Y, z, STONE_BLOCK);
        for (let y = Y + 1; y <= Y + 5; y++) s.setBlock(x, y, z, AIR);
      }
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++) {
        if (Math.abs(dx) < 2 && Math.abs(dz) < 2) continue;
        s.setBlock(bx + dx, Y + 1, bz + dz, BOOKSHELF);
        s.setBlock(bx + dx, Y + 2, bz + dz, BOOKSHELF);
      }
    s.setBlock(bx, Y + 1, bz, TABLE);
  },
  [bx, bz, Y, STONE_BLOCK, AIR, TABLE, BOOKSHELF],
);
await sleep(500);
check((await sc(([x, y, z]) => window.__solrift.getBlock(x, y, z), [bx, Y + 1, bz])) === TABLE, 'the enchanting table is placed');
check((await sc(([x, y, z]) => window.__solrift.countShelves(x, y, z), [bx, Y + 1, bz])) === 15, 'a full ring of bookshelves counts fifteen');
// Stand beside the table inside the ring, looking at it.
await sc(([x, y, z]) => {
  window.__solrift.teleport(x, y, z, Math.PI / 2, -0.55);
  window.__solrift.setFlying(true);
}, [bx + 1.5, Y + 1.01, bz + 0.5]);
await shot('table', 1500);

// Items: a sword, lapis and enough experience for the top offer.
await sc(([a, b]) => {
  window.__solrift.give(a, 1);
  window.__solrift.give(b, 20);
  window.__solrift.addXp(1500);
}, [SWORD, LAPIS]);
const level0 = (await sc(() => window.__solrift.xp())).level;
check(level0 >= 30, `thirty levels of experience (${level0})`);

check(await sc(([x, y, z]) => window.__solrift.useBlock(x, y, z), [bx, Y + 1, bz]), 'using the table does something');
check(await until(async () => (await sc(() => window.__solrift.screen())) === 'enchant'), 'the enchanting screen opens');
await page.waitForSelector('.ench-offer', { timeout: 5000 });
check((await page.locator('.ench-offer').count()) === 3, 'with three offers');
check((await page.locator('[data-testid="ench-shelves"]').innerText()).includes('15'), 'and the shelf count');
check((await page.locator('.ench-offer.none').count()) === 3, 'none of them is on offer with nothing in the slot');
check((await page.locator('[data-testid="ench-warning"]').innerText()).includes('item'), 'an empty table says to put an item in');
check((await page.locator('[data-testid="ench-level"]').innerText()).includes('level'), 'the screen shows your level');
await shot('empty');

// Put the sword and the lapis in.
await slot(await slotOf(SWORD)).click();
await slot(ITEM_SLOT).click();
await slot(await slotOf(LAPIS)).click({ modifiers: ['Shift'] });
await sleep(400);
let scr = await sc(() => window.__solrift.enchantScreen());
check(!!scr.item, 'the sword is in the table slot');
check(scr.lapis === 20, `and the lapis in its slot (${scr.lapis})`);
check(scr.offers.some((o) => o.cost > 0), `the table offers ${JSON.stringify(scr.offers.map((o) => o.cost))}`);
check(scr.offers[2].cost >= 20 && scr.offers[2].cost <= 30, `the top offer is dear with fifteen shelves (${scr.offers[2].cost})`);
check((await page.locator('.ench-offer.ok').count()) === scr.offers.filter((o) => o.cost > 0).length, 'every real offer can be afforded');
const clueText = (await page.locator('.ench-offer .clue').nth(2).getAttribute('data-clue')) || '';
check(clueText.includes('...?') && (await page.locator('.ench-offer .clue svg').count()) > 0, `the clue hints at one enchantment in the alien script ("${clueText}")`);
check((await page.locator('[data-testid="ench-warning"]').count()) === 0, 'with an item, lapis and levels there is no warning');
await shot('offers');

// Choose the top offer.
await page.locator('.ench-offer[data-offer="2"]').click();
await until(async () => ((await sc(() => window.__solrift.enchantScreen()))?.lapis ?? 0) === 17);
scr = await sc(() => window.__solrift.enchantScreen());
check(scr.lapis === 17, `three lapis were spent (${scr.lapis} left)`);
const level1 = (await sc(() => window.__solrift.xp())).level;
check(level0 - level1 === 3, `and three levels (${level0} -> ${level1})`);
check((await page.locator('.ench-offer.none').count()) === 3, 'an enchanted item gets no more offers');
check((await slot(ITEM_SLOT).locator('.glint').count()) === 1, 'the item shimmers');
await slot(ITEM_SLOT).hover();
await sleep(300);
const tip = await page.locator('.tooltip').innerText();
check(tip.split('\n').length >= 2 && /iron sword/i.test(tip), `its tooltip lists the enchantments (${JSON.stringify(tip)})`);
await shot('enchanted');

// Take it back, close the screen, and hold it.
await slot(ITEM_SLOT).click({ modifiers: ['Shift'] });
await sleep(300);
await sc(() => window.__solrift.closeMenu());
await until(async () => (await sc(() => window.__solrift.screen())) === 'none');
const at = await slotOf(SWORD);
check(at >= 0, 'the sword is back in the inventory');
await sc((i) => window.__solrift.select(i), at < 9 ? at : 0);
const inv = await sc(() => window.__solrift.inventory());
check(Array.isArray(inv[at]?.[3]) && inv[at][3].length >= 1, `with its enchantments (${JSON.stringify(inv[at])})`);

// Silk Touch: stone comes out as stone, not cobblestone.
await sc(([p]) => window.__solrift.giveEnchanted(p, [[12, 1]]), [PICK]);
const pickAt = await slotOf(PICK);
await sc((i) => window.__solrift.select(i), pickAt < 9 ? pickAt : 0);
if (pickAt >= 9) console.log('  (the pickaxe landed outside the hotbar, so it is not held)');
await sc(([x, y, z, s]) => window.__solrift.setBlock(x, y, z, s), [bx + 1, Y + 1, bz + 1, STONE_BLOCK]);
await sc(([x, y, z]) => window.__solrift.breakAt(x, y, z), [bx + 1, Y + 1, bz + 1]);
await sc(() => {
  window.__solrift.tickDrops(2);
  window.__solrift.gatherDrops();
});
check((await sc((i) => window.__solrift.countOf(i), STONE)) >= 1, 'Silk Touch lifts stone whole');
check((await sc((i) => window.__solrift.countOf(i), COBBLE)) === 0, 'and leaves no cobblestone');

// The anvil mends a tool with its material.
await sc(([x, y, z, a]) => window.__solrift.setBlock(x, y, z, a), [bx + 1, Y + 1, bz + 1, ANVIL]);
await shot('anvil-block', 500);
await sc(([s]) => window.__solrift.giveEnchanted(s, [], 100), [SWORD]);
await sc(([i]) => window.__solrift.give(i, 3), [INGOT]);
check(await sc(([x, y, z]) => window.__solrift.useBlock(x, y, z), [bx + 1, Y + 1, bz + 1]), 'using the anvil does something');
check(await until(async () => (await sc(() => window.__solrift.screen())) === 'anvil'), 'the anvil screen opens');
const inv2 = await sc(() => window.__solrift.inventory());
const worn = inv2.findIndex((s) => s && s[0] === SWORD && s[2] === 100);
check(worn >= 0, 'a worn sword is in the inventory');
await slot(worn).click();
await slot(ITEM_SLOT).click();
await slot(await slotOf(INGOT)).click({ modifiers: ['Shift'] });
await sleep(400);
const cost = await page.locator('[data-testid="anvil-cost"]').innerText();
check(/Cost: 2/.test(cost), `the anvil quotes the price ("${cost}")`);
check((await slot(RESULT_SLOT).locator('img').count()) === 1, 'and shows the mended sword');
const levelBefore = (await sc(() => window.__solrift.xp())).level;
await shot('anvil');
await slot(RESULT_SLOT).click();
await sleep(300);
await slot(worn).click();
await sleep(300);
const levelAfter = (await sc(() => window.__solrift.xp())).level;
check(levelBefore - levelAfter === 2, `taking it costs two levels (${levelBefore} -> ${levelAfter})`);
const inv3 = await sc(() => window.__solrift.inventory());
check(!inv3.some((s) => s && s[0] === SWORD && s[2] === 100), 'the worn sword is gone and a mended one took its place');
check(inv3.some((s) => s && s[0] === SWORD && s[2] === 0 && !s[3]), 'the sword is as good as new');
await sc(() => window.__solrift.closeMenu());
await sleep(300);
check((await sc((i) => window.__solrift.countOf(i), INGOT)) === 1, 'two of the three ingots were used up');

const real = errors.filter((e) => !/favicon|404|Failed to load resource|ERR_|WebSocket/i.test(e));
check(real.length === 0, `no console errors${real.length ? `: ${real.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nenchanting ok');
