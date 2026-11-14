// Anvil, grindstone and enchanting-table extras E2E: renaming at the anvil (the name box, the level it costs, the
// italic name and the penalty in the tooltip), a falling anvil that lands and hurts, the grindstone taking
// enchantments off for experience, a thrown bottle o' enchanting, lapis lazuli, the floating book and the alien
// script of the table's offers. Saves `anvil-*.png`.
// Usage: node scripts/anvil.mjs [url] [outDir]   (the game server needs CHEATS=1, as scripts/e2e.mjs sets)
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const LEFT_SLOT = 36;
const RESULT_SLOT = 38;
const ANVIL = 59;
const ANVIL_CHIPPED = 171;
const ANVIL_DAMAGED = 172;
const GRINDSTONE = 174;
const TABLE = 254;
const BOOKSHELF = 255;
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
  await page.screenshot({ path: `${outDir}/anvil-${name}.png` });
  console.log('saved', name);
};
const id = (name) => sc((n) => window.__solrift.itemId(n), name);
const slotOf = async (itemId, damage) => {
  const inv = await sc(() => window.__solrift.inventory());
  return inv.findIndex((s) => s && s[0] === itemId && (damage === undefined || s[2] === damage));
};
const slot = (n) => page.locator(`#menu-screen [data-slot="${n}"]`);
const blockAt = (x, y, z) => sc(([x, y, z]) => window.__solrift.getBlock(x, y, z), [x, y, z]);

const SWORD = await id('iron_sword');
const LAPIS = await id('lapis_lazuli');
const BOTTLE = await id('bottle_o_enchanting');
const PICK = await id('iron_pickaxe');
check(SWORD > 0 && LAPIS > 0 && BOTTLE > 0 && PICK > 0, `item ids found (${[SWORD, LAPIS, BOTTLE, PICK]})`);

// A flat stone platform up in the air, with a wall just in front of the player (taken down after the bottle).
const here = await sc(() => window.__solrift.position());
const bx = Math.floor(here.x) + 12;
const bz = Math.floor(here.z) + 12;
const ground = await sc(([x, z]) => window.__solrift.surfaceY(x, z), [bx, bz]);
const Y = ground + 10;
await sc(
  ([bx, bz, Y, STONE_BLOCK, AIR]) => {
    const s = window.__solrift;
    for (let x = bx - 6; x <= bx + 6; x++)
      for (let z = bz - 6; z <= bz + 6; z++) {
        s.setBlock(x, Y, z, STONE_BLOCK);
        for (let y = Y + 1; y <= Y + 14; y++) s.setBlock(x, y, z, AIR);
      }
    for (let z = bz - 6; z <= bz + 6; z++) for (let y = Y + 1; y <= Y + 4; y++) s.setBlock(bx - 1, y, z, STONE_BLOCK);
  },
  [bx, bz, Y, STONE_BLOCK, AIR],
);
await sc(([x, y, z]) => {
  window.__solrift.teleport(x, y, z, Math.PI / 2, 0);
  window.__solrift.setFlying(true);
}, [bx + 3.5, Y + 1.01, bz + 0.5]);
await sleep(600);

// ---- bottle o' enchanting: thrown, breaks on the wall, pays experience ----
check((await sc(() => window.__solrift.xp())).level === 0 && (await sc(() => window.__solrift.xp())).progress === 0, 'no experience yet');
await sc(([b]) => window.__solrift.give(b, 2), [BOTTLE]);
await sc(() => window.__solrift.setFlying(false));
const bottleAt = await slotOf(BOTTLE);
check(bottleAt >= 0 && bottleAt < 9, `the bottles are in the hotbar (slot ${bottleAt})`);
await sc((i) => window.__solrift.select(i), bottleAt);
await sc(() => window.__solrift.setRight(true));
let seenFlying = false;
for (let i = 0; i < 6; i++) {
  await sleep(50);
  if ((await sc(() => window.__solrift.projectiles())) > 0) seenFlying = true;
}
await sc(() => window.__solrift.setRight(false));
check(seenFlying || (await sc((b) => window.__solrift.countOf(b), BOTTLE)) < 2, 'right-click throws a bottle');
check(await until(async () => (await sc((b) => window.__solrift.countOf(b), BOTTLE)) === 1, 3000), 'and uses one up');
check(
  await until(async () => {
    const x = await sc(() => window.__solrift.xp());
    return x.level > 0 || x.progress > 0;
  }, 8000),
  'it breaks and the experience comes to you',
);
await shot('bottle', 300);
check(
  await until(async () => {
    const x = await sc(() => window.__solrift.xp());
    return x.level > 0 || x.progress > 0;
  }, 12000),
  'it is added to your experience',
);
await sc(([bx, bz, Y]) => {
  for (let z = bz - 6; z <= bz + 6; z++) for (let y = Y + 1; y <= Y + 4; y++) window.__solrift.setBlock(bx - 1, y, z, 0);
}, [bx, bz, Y]);
await sc(() => window.__solrift.addXp(1500));

// ---- the table: a floating book and alien script ----
await sc(
  ([bx, bz, Y, TABLE, BOOKSHELF]) => {
    const s = window.__solrift;
    s.setBlock(bx - 3, Y + 1, bz - 4, TABLE);
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++) {
        if (Math.abs(dx) < 2 && Math.abs(dz) < 2) continue;
        s.setBlock(bx - 3 + dx, Y + 1, bz - 4 + dz, BOOKSHELF);
        s.setBlock(bx - 3 + dx, Y + 2, bz - 4 + dz, BOOKSHELF);
      }
  },
  [bx, bz, Y, TABLE, BOOKSHELF],
);
check(await until(async () => (await sc(() => window.__solrift.books())) >= 1, 5000), 'a book floats over the enchanting table');
// A table in the open, to see the book.
await sc(([x, y, z, T]) => window.__solrift.setBlock(x, y, z, T), [bx + 1, Y + 1, bz - 1, TABLE]);
await sc(([x, y, z]) => window.__solrift.teleport(x, y, z, Math.PI / 2, -0.12), [bx + 3.4, Y + 1.01, bz - 1 + 0.5]);
await shot('book', 900);

// ---- the anvil: rename ----
await sc(([x, y, z, a]) => window.__solrift.setBlock(x, y, z, a), [bx + 1, Y + 1, bz + 1, ANVIL]);
await sc(([s]) => window.__solrift.giveEnchanted(s, []), [SWORD]);
await sc(([x, y, z]) => window.__solrift.teleport(x, y, z, Math.PI / 2, 0), [bx + 3.5, Y + 1.01, bz + 0.5]);
check(await sc(([x, y, z]) => window.__solrift.useBlock(x, y, z), [bx + 1, Y + 1, bz + 1]), 'using the anvil does something');
check(await until(async () => (await sc(() => window.__solrift.screen())) === 'anvil'), 'the anvil screen opens');
await page.waitForSelector('[data-testid="anvil-name"]', { timeout: 5000 });
check(await page.locator('[data-testid="anvil-name"]').isDisabled(), 'the name box is off until there is an item');
// The hint under an empty anvil wraps inside the panel instead of stretching it.
const panelW = await page.locator('#menu-screen .panel').evaluate((e) => e.getBoundingClientRect().width);
const gridW = await page.locator('#menu-screen .slot-grid').last().evaluate((e) => e.getBoundingClientRect().width);
check(panelW < gridW + 120, `the empty anvil panel is not stretched by its hint (${Math.round(panelW)}px for a ${Math.round(gridW)}px grid)`);
await shot('empty', 200);
await slot(await slotOf(SWORD)).click();
await slot(LEFT_SLOT).click();
await sleep(300);
check(!(await page.locator('[data-testid="anvil-name"]').isDisabled()), 'the name box turns on with an item');
await page.locator('[data-testid="anvil-name"]').fill('Sting');
await sleep(400);
let cost = await page.locator('[data-testid="anvil-cost"]').innerText();
check(/Cost: 1/.test(cost), `renaming quotes one level ("${cost}")`);
check((await slot(RESULT_SLOT).locator('img').count()) === 1, 'and shows the renamed sword');
await slot(RESULT_SLOT).hover();
await sleep(300);
let tipText = await page.locator('.tooltip').innerText();
check(/^Sting/.test(tipText.trim()), `the result's tooltip shows the name (${JSON.stringify(tipText)})`);
check((await page.locator('.tooltip .tip-italic').count()) >= 1, 'in italics');
await shot('rename');
const lv0 = (await sc(() => window.__solrift.xp())).level;
await slot(RESULT_SLOT).click();
await sleep(300);
const empty = (await sc(() => window.__solrift.inventory())).findIndex((s, i) => !s && i >= 9);
await slot(empty).click();
await sleep(300);
const lv1 = (await sc(() => window.__solrift.xp())).level;
check(lv0 - lv1 === 1, `taking it costs one level (${lv0} -> ${lv1})`);
let inv = await sc(() => window.__solrift.inventory());
const named = inv.find((s) => s && s[0] === SWORD && s[4]?.n === 'Sting');
check(!!named, `the sword is called Sting (${JSON.stringify(named)})`);
check(named && !named[4].r, 'a plain rename adds no penalty');

// Name it again, and combine it with a book, to see the penalty grow.
await sc(([s]) => window.__solrift.giveEnchanted(s, [[7, 2]]), [SWORD]); // a second sword with Sharpness II
await sleep(200);
inv = await sc(() => window.__solrift.inventory());
const a = inv.findIndex((s) => s && s[0] === SWORD && s[4]?.n === 'Sting');
const b = inv.findIndex((s) => s && s[0] === SWORD && !s[4]);
check(a >= 0 && b >= 0, 'two swords: the named one and a sharp one');
await slot(a).click();
await slot(LEFT_SLOT).click();
await slot(b).click();
await slot(LEFT_SLOT + 1).click();
await sleep(400);
cost = await page.locator('[data-testid="anvil-cost"]').innerText();
check(/Cost: \d+/.test(cost), `joining them has a price ("${cost}")`);
await slot(RESULT_SLOT).click();
await sleep(300);
const empty2 = (await sc(() => window.__solrift.inventory())).findIndex((s, i) => !s && i >= 9);
await slot(empty2).click();
await sleep(300);
inv = await sc(() => window.__solrift.inventory());
const joined = inv.find((s) => s && s[0] === SWORD && s[4]?.n === 'Sting' && s[3]);
check(!!joined && joined[4].r === 1, `the joined sword keeps its name and carries penalty 1 (${JSON.stringify(joined)})`);
await slot(inv.findIndex((s) => s === joined)).hover();
await sleep(300);
tipText = await page.locator('.tooltip').innerText();
check(/Anvil penalty: \+1/.test(tipText), `the tooltip mentions the penalty (${JSON.stringify(tipText)})`);
await sc(() => window.__solrift.closeMenu());
await sleep(300);

// ---- the three anvils, the grindstone and the table side by side ----
await sc(
  ([bx, bz, Y, A, B, C, G]) => {
    const s = window.__solrift;
    s.setBlock(bx + 1, Y + 1, bz + 1, 0);
    [A, B, C, G].forEach((blk, i) => s.setBlock(bx - 2, Y + 1, bz - 1 + i, blk));
  },
  [bx, bz, Y, ANVIL, ANVIL_CHIPPED, ANVIL_DAMAGED, GRINDSTONE],
);
await sc(([x, y, z]) => window.__solrift.teleport(x, y, z, Math.PI / 2, -0.25), [bx + 2.5, Y + 2, bz + 0.5]);
await shot('blocks', 800);

// ---- the grindstone ----
await sc(([s]) => window.__solrift.giveEnchanted(s, [[11, 4], [13, 3]]), [PICK]); // an iron pickaxe: Efficiency and Unbreaking
await sc(([x, y, z, g]) => window.__solrift.setBlock(x, y, z, g), [bx + 1, Y + 1, bz + 1, GRINDSTONE]);
await sc(([x, y, z]) => window.__solrift.teleport(x, y, z, Math.PI / 2, 0), [bx + 3.5, Y + 1.01, bz + 0.5]);
check(await sc(([x, y, z]) => window.__solrift.useBlock(x, y, z), [bx + 1, Y + 1, bz + 1]), 'using the grindstone does something');
check(await until(async () => (await sc(() => window.__solrift.screen())) === 'grindstone'), 'the grindstone screen opens');
await page.waitForSelector('[data-testid="grind-note"]', { timeout: 5000 });
inv = await sc(() => window.__solrift.inventory());
const enchantedAt = inv.findIndex((s) => s && s[0] === PICK && s[3]);
check(enchantedAt >= 0, 'an enchanted pickaxe is in the inventory');
await slot(enchantedAt).click();
await slot(LEFT_SLOT).click();
await sleep(400);
const note = await page.locator('[data-testid="grind-note"]').innerText();
check(/Experience: \d+/.test(note), `it quotes the experience ("${note}")`);
check((await slot(RESULT_SLOT).locator('img').count()) === 1, 'and shows the plain pickaxe');
await shot('grindstone');
const xp0 = await sc(() => window.__solrift.xp());
await slot(RESULT_SLOT).click();
await sleep(300);
const empty3 = (await sc(() => window.__solrift.inventory())).findIndex((s, i) => !s && i >= 9);
await slot(empty3).click();
await sleep(300);
await sc(() => window.__solrift.closeMenu());
await until(async () => (await sc(() => window.__solrift.screen())) === 'none');
inv = await sc(() => window.__solrift.inventory());
check(inv.some((s) => s && s[0] === PICK && !s[3]), 'the pickaxe comes out with no enchantments');
check(!inv.some((s) => s && s[0] === PICK && s[3]), 'and the enchanted one is gone');
check((await sc(() => window.__solrift.xp())).progress !== xp0.progress, 'experience came out of it');

// ---- a falling anvil ----
await sc(([x, y, z]) => window.__solrift.teleport(x, y, z, Math.PI / 2, -0.2), [bx + 4.5, Y + 1.01, bz + 4.5]);
await sc(([x, y, z, a]) => {
  window.__solrift.setBlock(x, y, z, a);
  window.__solrift.checkFall(x, y, z);
}, [bx, Y + 8, bz - 3, ANVIL]);
check(
  await until(async () => (await blockAt(bx, Y + 1, bz - 3)) === ANVIL || (await blockAt(bx, Y + 1, bz - 3)) === ANVIL_CHIPPED, 6000),
  'an anvil with nothing under it falls to the ground',
);
check((await blockAt(bx, Y + 8, bz - 3)) === AIR, 'and leaves its place empty');
// And one onto the player.
await sc(() => window.__solrift.setMode('survival'));
await sc(() => window.__solrift.setFlying(false));
await sc(([x, y, z]) => window.__solrift.teleport(x, y, z, Math.PI / 2, 0), [bx + 4.5, Y + 1.01, bz + 4.5]);
await sleep(300);
const hp0 = await sc(() => window.__solrift.hp());
await sc(([x, y, z, a]) => {
  window.__solrift.setBlock(x, y, z, a);
  window.__solrift.checkFall(x, y, z);
}, [bx + 4, Y + 9, bz + 4, ANVIL]);
check(await until(async () => (await sc(() => window.__solrift.hp())) < hp0, 6000), 'an anvil landing on the player hurts');
const hp1 = await sc(() => window.__solrift.hp());
check(hp0 - hp1 >= 6, `by how far it fell (${hp0} -> ${hp1})`);
await shot('anvil-fall', 300);

const real = errors.filter((e) => !/favicon|404|Failed to load resource|ERR_|WebSocket/i.test(e));
check(real.length === 0, `no console errors${real.length ? `: ${real.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nanvil ok');
