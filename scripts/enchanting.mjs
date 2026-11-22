// Enchanting E2E: bookshelves around a Runic Altar are counted, the altar lists the glyphs the piece on it takes,
// inscribing one spends lapis and Auren and fills a socket (the item then shimmers and its tooltip lists the glyph),
// a glyph can be raised or erased, a glyph tool does what it says (Gentle Hand), and an anvil mends a tool
// with its material. Saves `enchanting-*.png`.
// Usage: node scripts/enchanting.mjs [url] [outDir]   (the game server needs CHEATS=1, as scripts/e2e.mjs sets)
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const ITEM_SLOT = 36;
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

// Items: a sword, lapis and Auren for the glyphs.
await sc(([a, b]) => {
  window.__solrift.give(a, 1);
  window.__solrift.give(b, 20);
  window.__solrift.addCoins(1000);
  window.__solrift.addXp(1500); // levels for the anvil, further down
}, [SWORD, LAPIS]);
const coins0 = await sc(() => window.__solrift.coins());
check(coins0 >= 1000, `Auren in the purse (${coins0})`);

check(await sc(([x, y, z]) => window.__solrift.useBlock(x, y, z), [bx, Y + 1, bz]), 'using the altar does something');
check(await until(async () => (await sc(() => window.__solrift.screen())) === 'enchant'), 'the Runic Altar screen opens');
await page.waitForSelector('[data-testid="altar"]', { timeout: 5000 });
check((await page.locator('[data-testid="ench-shelves"]').innerText()).includes('15'), 'with the lore of fifteen shelves');
check((await page.locator('[data-testid="ench-warning"]').innerText()).toLowerCase().includes('lay a piece'), 'an empty altar says to lay a piece on it');
check((await page.locator('.glyph-row').count()) === 0, 'and offers no glyph');
await shot('empty');

// Lay the sword on the altar.
await slot(await slotOf(SWORD)).click();
await slot(ITEM_SLOT).click();
await sleep(400);
let scr = await sc(() => window.__solrift.enchantScreen());
check(!!scr.item, 'the sword is on the altar');
check(scr.lapis === 20, `and the lapis in the bags is counted (${scr.lapis})`);
check(scr.options.length >= 5 && scr.options.some((o) => o.state === 'ok'), `the altar lists the glyphs the sword takes (${scr.options.map((o) => o.name).join(', ')})`);
check(scr.options.every((o) => o.id !== 20), 'none of them is a treasure (Renewal)');
check((await page.locator('.glyph-row').count()) === scr.options.length, 'the screen shows each of them');
check((await page.locator('[data-testid="altar-sockets"] .sock').count()) === 1, 'a plain sword has one socket');
check((await page.locator('[data-testid="glyph-detail"]').count()) === 1, 'and a glyph is described beside the list');
check((await page.locator('[data-testid="ench-warning"]').count()) === 0, 'there is no warning');
await shot('offers');

// Inscribe the first glyph (Keen Edge): it costs lapis and Auren, and fills the socket.
const first = scr.options[0];
// An inscription can fail (the chance is on the button): try again until it takes, and count what the failures cost.
const inscribeUntil = async (done) => {
  let tries = 0;
  while (tries < 15 && !(await done())) {
    await page.locator('[data-testid="inscribe"]').click();
    await sleep(350);
    tries++;
  }
  return tries;
};
check((await page.locator('[data-testid="glyph-chance"]').count()) === 1, 'the chance of the glyph is shown');
const tries1 = await inscribeUntil(async () => ((await sc(() => window.__solrift.enchantScreen()))?.item?.ench?.length ?? 0) === 1);
scr = await sc(() => window.__solrift.enchantScreen());
check(scr.item.ench?.[0]?.[0] === first.id, `the sword now carries ${first.name}`);
// (a failure costs all the lapis and half the Auren: the last, good try costs the full price)
check(20 - scr.lapis >= first.price.lapis, `at least ${first.price.lapis} lapis were spent (${scr.lapis} left after ${tries1 + 1} tries)`);
const coins1 = await sc(() => window.__solrift.coins());
check(coins0 - coins1 >= first.price.auren, `and at least ${first.price.auren} Auren (${coins0} -> ${coins1})`);
check((await page.locator('[data-testid="altar-sockets"] .sock.full').count()) === 1, 'the socket is filled');
check((await page.locator('[data-testid="erase"]').count()) === 1, 'the glyph can be erased');
check((await slot(ITEM_SLOT).locator('.glint').count()) === 1, 'the item shimmers');
check((await page.locator('.glyph-row[data-state="sockets"]').count()) === scr.options.length - 1, 'no other glyph fits: the sockets are full');
await slot(ITEM_SLOT).hover();
await sleep(300);
const tip = await page.locator('.tooltip').innerText();
check(/Glyph sockets: 1 \/ 1/.test(tip) && /iron sword/i.test(tip), `its tooltip lists the glyphs and sockets (${JSON.stringify(tip)})`);
await shot('enchanted');

// Raise it, then erase it for nothing.
await inscribeUntil(async () => ((await sc(() => window.__solrift.enchantScreen()))?.item?.ench?.[0]?.[1] ?? 0) === 2);
check(((await sc(() => window.__solrift.enchantScreen()))?.item?.ench?.[0]?.[1] ?? 0) === 2, 'the same glyph can be raised a rank');
const coins2 = await sc(() => window.__solrift.coins());
await page.locator('[data-testid="erase"]').click();
await until(async () => !(await sc(() => window.__solrift.enchantScreen()))?.item?.ench);
scr = await sc(() => window.__solrift.enchantScreen());
check(!scr.item.ench, 'erasing takes the glyph off');
check((await sc(() => window.__solrift.coins())) === coins2, 'and costs nothing');
await inscribeUntil(async () => ((await sc(() => window.__solrift.enchantScreen()))?.item?.ench?.length ?? 0) === 1);

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

// Gentle Hand (Silk Touch): stone comes out as stone, not cobblestone.
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
check((await sc((i) => window.__solrift.countOf(i), STONE)) >= 1, 'Gentle Hand lifts stone whole');
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
