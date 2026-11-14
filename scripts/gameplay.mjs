// Gameplay E2E: survival mining rules, drops, real UI clicks (inventory / crafting / furnace /
// chest / creative), fall damage and death + respawn. Drives the game through ?debug hooks.
// Usage: node scripts/gameplay.mjs [url] [outDir]
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const B = { STONE: 1, LOG: 6, PLANKS: 10, COBBLE: 11, COAL_ORE: 12, IRON_ORE: 13, GOLD_ORE: 14, DIAMOND_ORE: 15, GLOWSTONE: 19, CRAFTING_TABLE: 20 };
const I = { COAL: 257, IRON_INGOT: 258, GOLD_INGOT: 259, DIAMOND: 260, RAW_IRON: 305, RAW_GOLD: 306, APPLE: 261, COOKED_MEAT: 263, MAP: 390, EMBERSTONE: 430 };
// Tool ids: 270 + kindIndex * 5 + materialIndex (kinds: pickaxe, axe, shovel, sword; materials: wood, stone, iron, gold, diamond)
const WOOD_PICK = 270;
const STONE_PICK = 271;
const IRON_PICK = 272;
const WOOD_SWORD = 285;

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));

const failures = [];
const check = (cond, msg) => {
  if (cond) console.log('  ok  ', msg);
  else {
    console.log('  FAIL', msg);
    failures.push(msg);
  }
};
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

await page.goto(url + '/?seed=1337&debug&nomobs', { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 120000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
});

const sc = (fn, ...args) => page.evaluate(fn, ...args);
const shot = async (name, wait = 400) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('saved', name);
};
const slotOf = async (id) => (await sc(() => window.__solrift.inventory())).findIndex((s) => s && s[0] === id);
const cursorCount = async () => (await page.locator('.cursor-item .count').textContent().catch(() => null)) ?? null;
const click = (slot, opts = {}) => page.click(`[data-slot="${slot}"]`, opts);
/** What the grid shows in the result slot is a preview: the Craft button makes it (it takes a moment of game time, which is long at a software renderer's frame rate), then it can be taken. */
const craft = async () => {
  await page.click('[data-testid=forge-button]');
  await page.waitForSelector('[data-slot="40"]:not(.preview) .item-icon', { timeout: 90000 });
};

const pos = await sc(() => window.__solrift.position());
const px = Math.floor(pos.x);
const pz = Math.floor(pos.z);
const gy = await sc(([x, z]) => window.__solrift.surfaceY(x, z), [px, pz]);
console.log('spawn', pos, 'surface', gy);

// Flat test strip in front of the player, clear of the terrain.
await sc(
  ([px, pz, gy]) => {
    const s = window.__solrift;
    for (let x = px - 4; x <= px + 6; x++)
      for (let z = pz - 4; z <= pz + 6; z++) {
        for (let y = gy; y <= gy + 6; y++) s.setBlock(x, y, z, 0);
        s.setBlock(x, gy - 1, z, 1);
      }
    s.teleport(px + 0.5, gy, pz + 0.5, -Math.PI / 2, -0.1);
  },
  [px, pz, gy],
);
await page.waitForTimeout(800);
const ground = (await sc(() => window.__solrift.position())).y;

console.log('survival defaults');
check((await sc(() => window.__solrift.mode())) === 'survival', 'starts in survival mode');
// A new character carries the Emberstone and the map (slots 2 and 3 of the bar), and nothing else.
check(
  (await sc(() => window.__solrift.inventory())).every((s, i) => (i === 1 ? s?.[0] === I.EMBERSTONE : i === 2 ? s?.[0] === I.MAP : s === null)),
  'starts with the Emberstone and the map, and nothing else',
);
check((await sc(() => window.__solrift.vitals())).health === 20, 'starts with full health');

console.log('mining rules');
const put = (id, dx, dy = 0, dz = 0) =>
  sc(([id, x, y, z]) => window.__solrift.setBlock(x, y, z, id), [id, px + dx, ground + dy, pz + dz]);
const brk = (dx, dy = 0, dz = 0) => sc(([x, y, z]) => window.__solrift.breakAt(x, y, z), [px + dx, ground + dy, pz + dz]);
const btime = (dx, dy = 0, dz = 0) => sc(([x, y, z]) => window.__solrift.breakTimeAt(x, y, z), [px + dx, ground + dy, pz + dz]);
// What was mined lands, then is walked over (an item is picked up by standing on it: it is not drawn in from a distance).
const settle = () =>
  sc(() => {
    window.__solrift.tickDrops(3);
    window.__solrift.gatherDrops();
  });

await put(B.STONE, 2);
check(near(await btime(2), 7.5), 'bare hands need 7.5s for stone');
await brk(2);
check((await sc(() => window.__solrift.drops())) === 0, 'stone broken by hand drops nothing');

await sc((id) => window.__solrift.give(id), WOOD_PICK);
await sc(() => window.__solrift.select(0));
await put(B.STONE, 2);
check(near(await btime(2), 1.125), 'wooden pickaxe breaks stone in 1.125s');
await brk(2);
check((await sc(() => window.__solrift.drops())) === 1, 'stone with a pickaxe drops an item entity');
await shot('drops-in-world', 100);
await settle();
check((await sc((id) => window.__solrift.countOf(id), B.COBBLE)) === 1, 'cobblestone is picked up');
check((await sc(() => window.__solrift.inventory()))[0][2] === 1, 'pickaxe lost 1 durability');

await put(B.IRON_ORE, 2);
await brk(2);
check((await sc(() => window.__solrift.drops())) === 0, 'iron ore needs a stone pickaxe (wood drops nothing)');

await sc((id) => window.__solrift.give(id), STONE_PICK);
await sc((i) => window.__solrift.select(i), await slotOf(STONE_PICK));
await put(B.IRON_ORE, 2);
await brk(2);
await settle();
check((await sc((id) => window.__solrift.countOf(id), I.RAW_IRON)) === 1, 'stone pickaxe harvests iron ore as raw iron');

await put(B.GOLD_ORE, 2);
await brk(2);
await settle();
check((await sc((id) => window.__solrift.countOf(id), I.RAW_GOLD)) === 0, 'gold ore needs an iron pickaxe (a stone one drops nothing)');

await sc((id) => window.__solrift.give(id), IRON_PICK);
await sc((i) => window.__solrift.select(i), await slotOf(IRON_PICK));
await put(B.DIAMOND_ORE, 2);
await brk(2);
await settle();
check((await sc((id) => window.__solrift.countOf(id), I.DIAMOND)) === 1, 'iron pickaxe mines a diamond');

await put(B.GOLD_ORE, 2);
await brk(2);
await settle();
check((await sc((id) => window.__solrift.countOf(id), I.RAW_GOLD)) === 1, 'iron pickaxe mines gold ore as raw gold');

await put(B.COAL_ORE, 2);
await brk(2);
await settle();
check((await sc((id) => window.__solrift.countOf(id), I.COAL)) === 1, 'coal ore drops coal');

console.log('inventory UI: crafting by clicking');
await sc(() => {
  window.__solrift.clearInventory();
  window.__solrift.give(6, 1);
  window.__solrift.openMenu('inventory');
});
await page.waitForSelector('#menu-screen');
await page.click('[data-testid=tab-crafting]'); // the crafting grid is the second tab of the inventory window
await click(0); // pick up the log
await click(36); // into the 2x2 grid
await page.waitForSelector('[data-slot="40"] .item-icon');
check(true, 'planks result appears for a single log');
check((await page.locator('[data-slot="40"].preview').count()) === 1, 'it is a preview until it is crafted');
await craft();
await click(40); // take planks onto the cursor
check((await cursorCount()) === '4', 'taking the result gives 4 planks');
await click(0);
check((await sc((id) => window.__solrift.countOf(id), B.PLANKS)) === 4, '4 planks end up in the inventory');
await shot('ui-inventory');

await click(0); // pick up planks
for (const cell of [36, 37, 38, 39]) await click(cell, { button: 'right' }); // one per cell
await page.waitForSelector('[data-slot="40"] .item-icon');
await craft();
await click(40);
await click(1);
check((await sc((id) => window.__solrift.countOf(id), B.CRAFTING_TABLE)) === 1, 'crafting table crafted from 4 planks');
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
check((await sc(() => window.__solrift.screen())) === 'none', 'Escape closes the inventory');

console.log('crafting table, furnace, chest');
await sc(() => {
  window.__solrift.clearInventory();
  window.__solrift.give(11, 8);
  window.__solrift.give(17, 1);
  window.__solrift.openMenu('crafting');
});
await page.waitForSelector('#menu-screen');
await shot('ui-crafting-table');
await page.keyboard.press('Escape');

await sc(() => {
  window.__solrift.clearInventory();
  window.__solrift.give(305, 3);
  window.__solrift.give(257, 1);
  window.__solrift.openMenu('furnace');
});
await page.waitForSelector('#menu-screen');
await click(0, { modifiers: ['Shift'] });
await click(1, { modifiers: ['Shift'] });
await sc(() => window.__solrift.tickFurnaces(15));
await page.waitForTimeout(300);
await shot('ui-furnace');
await sc(() => window.__solrift.tickFurnaces(16));
await page.waitForTimeout(300);
check((await page.locator('[data-slot="38"] .count').textContent()) === '3', 'furnace smelted 3 iron ingots with 1 coal');
await click(38, { modifiers: ['Shift'] });
check((await sc((id) => window.__solrift.countOf(id), I.IRON_INGOT)) === 3, 'shift-click output moves ingots to the inventory');
await page.keyboard.press('Escape');

await sc(() => {
  window.__solrift.clearInventory();
  window.__solrift.give(11, 40);
  window.__solrift.give(272, 1);
  window.__solrift.openMenu('chest');
});
await page.waitForSelector('#menu-screen');
await click(0, { modifiers: ['Shift'] });
check((await page.locator('[data-slot="36"] .count').textContent()) === '40', 'shift-click stores a stack in the chest');
await shot('ui-chest');
await page.keyboard.press('Escape');
await page.waitForTimeout(150);

console.log('vitals: fall damage, death, respawn');
await sc(() => {
  window.__solrift.clearInventory();
  window.__solrift.give(11, 32);
  window.__solrift.give(261, 3);
  window.__solrift.setHunger(10);
  window.__solrift.openMenu('inventory'); // an open screen keeps the simulation running
});
await page.waitForSelector('#menu-screen');
await sc(([x, y, z]) => window.__solrift.teleport(x, y, z), [px + 0.5, ground + 12, pz + 0.5]);
await page.waitForFunction(() => window.__solrift.vitals().health < 20, undefined, { timeout: 30000 });
await page.waitForTimeout(300);
const hp = (await sc(() => window.__solrift.vitals())).health;
check(hp >= 10 && hp <= 12, `12 block fall deals ~9 damage (health now ${hp})`);

const carried = (await sc(() => window.__solrift.inventory())).filter((s) => s !== null).length;
const droppedBefore = await sc(() => window.__solrift.drops());
await sc(() => window.__solrift.damage(100));
await page.waitForSelector('#death-screen', { timeout: 10000 });
check((await sc(() => window.__solrift.screen())) === 'dead', 'death screen shown at 0 health');
check((await sc(() => window.__solrift.inventory())).filter((s) => s !== null).length === carried, 'the inventory is kept on death');
check((await sc(() => window.__solrift.drops())) === droppedBefore, 'and nothing is dropped');
await shot('death');
await page.click('#death-screen button');
await page.waitForTimeout(300);
check((await sc(() => window.__solrift.screen())) === 'none', 'respawn closes the death screen');
check((await sc(() => window.__solrift.vitals())).health === 20, 'respawn restores health');

console.log('creative mode');
await sc(() => {
  window.__solrift.setMode('creative');
  window.__solrift.openMenu('creative');
});
await page.waitForSelector('#menu-screen');
await click(36 + 18); // some palette entry
check(((await cursorCount()) ?? '0') === '64', 'palette click grants a full stack');
await click(0);
check((await sc(() => window.__solrift.inventory()))[0] !== null, 'stack placed into the hotbar');
await shot('ui-creative');
await sc(() => window.__solrift.closeMenu());
check((await page.locator('#vitals').count()) === 0, 'vitals hidden in creative mode');

console.log('survival HUD');
await sc(([x, y, z]) => {
  const s = window.__solrift;
  s.setMode('survival');
  s.clearInventory();
  s.give(271, 1);
  s.give(11, 37);
  s.give(261, 3);
  s.give(263, 12);
  s.give(285, 1);
  s.give(20, 1);
  s.give(21, 1);
  s.give(22, 1);
  s.select(0);
  s.damage(7);
  s.setHunger(13);
  s.setTime(0.25);
  s.teleport(x, y, z, -Math.PI / 2, -0.2);
  for (let i = 0; i < 4; i++) {
    s.setBlock(Math.floor(x) + 2, Math.floor(y), Math.floor(z) + i - 2, 1);
    s.breakAt(Math.floor(x) + 2, Math.floor(y), Math.floor(z) + i - 2);
  }
}, [px + 0.5, ground, pz + 0.5]);
await sc(() => window.__solrift.forceUi());
await shot('hud-survival', 600);

await browser.close();
if (errors.length) {
  console.log('console errors:', errors);
  process.exit(1);
}
if (failures.length) {
  console.log(`${failures.length} gameplay check(s) failed`);
  process.exit(1);
}
console.log('gameplay OK');
