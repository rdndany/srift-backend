// Ender pearls, TNT, shears, bone meal, breeding, slime blocks and the second (square) world E2E.
// Saves `worlds-*.png`. Usage: node scripts/worlds.mjs [url] [outDir]   (the game server needs CHEATS=1, as scripts/e2e.mjs sets)
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const STONE = 1;
const AIR = 0;
const TNT = 1000;
const SLIME = 1001;
const BRICKS = 176;

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
const until = async (fn, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(150);
  }
  return false;
};

const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
const sc = (fn, ...args) => page.evaluate(fn, ...args);
const shot = async (name, wait = 500) => {
  await sleep(wait);
  await page.screenshot({ path: `${outDir}/worlds-${name}.png` });
  console.log('saved', name);
};
const ready = async (kind) => {
  await page.waitForFunction((k) => window.__solrift?.isReady?.() && window.__solrift.worldKind() === k, kind, { timeout: 120000 });
  await page.evaluate(() => {
    document.getElementById('overlay').style.display = 'none';
    window.__solrift.forceLock();
  });
};
const id = (name) => sc((n) => window.__solrift.itemId(n), name);
const blockAt = (x, y, z) => sc(([x, y, z]) => window.__solrift.getBlock(x, y, z), [x, y, z]);
const hold = (itemId, count = 1) =>
  sc(([itemId, count]) => {
    const s = window.__solrift;
    s.clearInventory();
    s.give(itemId, count);
    s.select(0);
  }, [itemId, count]);

// ---------------------------------------------------------------- the overworld
await page.goto(`${url}/?seed=1337&debug&nomobs&mode=creative`, { waitUntil: 'load' });
await ready('overworld');
const PEARL = await id('ender_pearl');
const SHEARS = await id('shears');
const FLINT = await id('flint_and_steel');
const WHEAT = await id('wheat');
const BONE_MEAL = await id('white_dye');
const SLIMEBALL = await id('slimeball');
check([PEARL, SHEARS, FLINT, WHEAT, BONE_MEAL, SLIMEBALL].every((n) => n > 0), 'new item ids found');
const TNT_ITEM = await id('tnt');
const SLIME_ITEM = await id('slime_block');
check(TNT_ITEM === TNT && SLIME_ITEM === SLIME, `TNT and slime block items are ${TNT_ITEM} / ${SLIME_ITEM}`);

const here = await sc(() => window.__solrift.position());
const bx = Math.floor(here.x) + 14;
const bz = Math.floor(here.z) + 14;
const ground = await sc(([x, z]) => window.__solrift.surfaceY(x, z), [bx, bz]);
const Y = ground + 12;
await sc(
  ([bx, bz, Y, STONE, AIR]) => {
    const s = window.__solrift;
    for (let x = bx - 12; x <= bx + 12; x++)
      for (let z = bz - 12; z <= bz + 12; z++) {
        s.setBlock(x, Y, z, STONE);
        for (let y = Y + 1; y <= Y + 14; y++) s.setBlock(x, y, z, AIR);
      }
    // A wall to throw a pearl at, ten blocks away.
    for (let x = bx - 6; x <= bx + 6; x++) for (let y = Y + 1; y <= Y + 5; y++) s.setBlock(x, y, bz - 10, STONE);
  },
  [bx, bz, Y, STONE, AIR],
);
/** Right-click a mob of a kind with what is held: walk up to where it is now, face it, and try again if it moved. */
const useOn = async (pick, pitch = -0.3) => {
  for (let i = 0; i < 8; i++) {
    const m = (await sc(() => window.__solrift.mobs())).find(pick);
    if (!m) return false;
    await sc(([x, y, z, pitch]) => window.__solrift.teleport(x, y, z, 0, pitch), [m.x, m.y, m.z + 1.4, pitch]);
    if (await sc(() => window.__solrift.useOnMob())) return true;
    await sleep(150);
  }
  return false;
};
const stand = (x, z, yaw = 0, pitch = 0) => sc(([x, y, z, yaw, pitch]) => window.__solrift.teleport(x, y, z, yaw, pitch), [x, Y + 1, z, yaw, pitch]);
await stand(bx + 0.5, bz + 8.5);
await sleep(800);

// ---- ender pearl
await sc(() => window.__solrift.setMode('survival'));
await hold(PEARL, 3);
const before = await sc(() => window.__solrift.position());
await sc(() => window.__solrift.setRight(true));
await sleep(200);
await sc(() => window.__solrift.setRight(false));
check(await until(() => sc(() => window.__solrift.arrows() > 0), 4000), 'a thrown pearl is in flight');
await shot('pearl-flight', 100);
check(await until(() => sc(() => window.__solrift.arrows() === 0), 6000), 'the pearl came down');
const after = await sc(() => window.__solrift.position());
check(before.z - after.z > 6, `the thrower was carried across (${before.z.toFixed(1)} -> ${after.z.toFixed(1)})`);
check((await sc(() => window.__solrift.hp())) < 20, 'a pearl costs some health');
check((await sc(() => window.__solrift.countOf(window.__solrift.itemId('ender_pearl')))) === 2, 'one pearl was used');
await shot('pearl-landed');
await sc(() => window.__solrift.setMode('creative'));

// ---- TNT
const tx = bx;
const tz = bz + 2;
await sc(
  ([tx, tz, Y, TNT, STONE]) => {
    const s = window.__solrift;
    for (let x = tx - 1; x <= tx + 1; x++) for (let z = tz - 1; z <= tz + 1; z++) s.setBlock(x, Y + 1, z, STONE);
    s.setBlock(tx, Y + 2, tz, TNT);
    s.setBlock(tx + 1, Y + 2, tz, TNT);
  },
  [tx, tz, Y, TNT, STONE],
);
await stand(bx + 0.5, bz + 11.5, 0, 0.1);
await hold(FLINT, 1);
await sc(([x, y, z]) => window.__solrift.useOn(x, y, z, 0, 1, 0), [tx, Y + 2, tz]);
check((await sc(() => window.__solrift.litTnt())) >= 1, 'flint and steel lit the TNT');
await shot('tnt-lit', 300);
check(await until(async () => (await blockAt(tx, Y + 2, tz)) === AIR, 12000), 'the TNT blew up');
check(await until(async () => (await blockAt(tx + 1, Y + 2, tz)) === AIR, 6000), 'and set off the TNT beside it');
check((await blockAt(tx, Y + 1, tz)) === AIR, 'a crater was left in the stone under it');
check((await blockAt(tx + 9, Y, tz)) === STONE, 'far from it the stone stands');
await shot('tnt-crater', 400);

// ---- shears, bone meal and slime
await stand(bx - 8.5, bz + 6.5, 0, -0.3);
await sc(([x, y, z]) => window.__solrift.spawnMob('sheep', x, y, z, 11), [bx - 8.5, Y + 1, bz + 5]);
await hold(SHEARS, 1);
check(await until(() => sc(() => window.__solrift.mobs().some((m) => m.kind === 'sheep')), 4000), 'a sheep stands in front');
check(await useOn((m) => m.kind === 'sheep'), 'shears work on the sheep');
check(await sc(() => window.__solrift.mobs().find((m) => m.kind === 'sheep').sheared), 'the sheep is shorn');
check(await until(() => sc(() => window.__solrift.drops() > 0), 3000), 'wool dropped');
await shot('sheep-shorn', 600);
await sc(() => window.__solrift.clearMobs());

// Bone meal: wheat ripens, and grass sprouts.
const wx = bx + 5;
const wz = bz + 6;
await sc(
  ([x, z, Y]) => {
    const s = window.__solrift;
    s.setBlock(x, Y, z, 31); // farmland
    s.setBlock(x, Y + 1, z, 32); // young wheat
    for (let dx = -3; dx <= 3; dx++) for (let dz = 4; dz <= 8; dz++) s.setBlock(x + dx, Y, z + dz, 3); // grass
  },
  [wx, wz, Y],
);
await hold(BONE_MEAL, 10);
for (let i = 0; i < 4 && (await blockAt(wx, Y + 1, wz)) !== 35; i++) {
  await sc(([x, y, z]) => window.__solrift.useOn(x, y, z, 0, 1, 0), [wx, Y + 1, wz]);
}
check((await blockAt(wx, Y + 1, wz)) === 35, 'bone meal ripened the wheat');
await sc(([x, y, z]) => window.__solrift.useOn(x, y, z, 0, 1, 0), [wx, Y, wz + 6]);
let sprouts = 0;
for (let dx = -3; dx <= 3; dx++) for (let dz = 4; dz <= 8; dz++) if ((await blockAt(wx + dx, Y + 1, wz + dz)) !== AIR) sprouts++;
check(sprouts > 2, `bone meal sprouted ${sprouts} plants on the grass`);
await stand(wx + 0.5, wz + 11.5, Math.PI, -0.4);
await shot('bone-meal', 700);
// ---- slime: fall onto it
await sc(([x, z, Y, SLIME]) => window.__solrift.setBlock(x, Y, z, SLIME), [bx - 10, bz + 4, Y, SLIME]);
await sc(() => window.__solrift.setMode('survival'));
await sc(() => window.__solrift.setHealth(20));
await sc(([x, y, z]) => window.__solrift.teleport(x, y, z, 0, 0), [bx - 9.5, Y + 12, bz + 4.5]);
let low = 20;
for (let i = 0; i < 40; i++) {
  low = Math.min(low, await sc(() => window.__solrift.hp()));
  await sleep(100);
}
const under = await blockAt(bx - 10, Y, bz + 4);
check(low === 20, `no fall damage on slime (lowest health ${low}, block under , now at ${JSON.stringify(await sc(() => window.__solrift.position()))})`);
await shot('slime', 100);
await sc(() => window.__solrift.setMode('creative'));

// ---- breeding
await sc(() => window.__solrift.clearMobs());
await stand(bx + 0.5, bz + 6.5, 0, -0.3);
for (const dx of [-2, 2]) await sc(([x, y, z]) => window.__solrift.spawnMob('cow', x, y, z), [bx + 0.5 + dx, Y + 1, bz + 5]);
await sleep(600);
await hold(WHEAT, 10);
for (const dx of [-1, 1]) {
  check(await useOn((c) => c.kind === 'cow' && !c.love && !c.baby), `fed a cow (${dx < 0 ? 'left' : 'right'})`);
}
check((await sc(() => window.__solrift.mobs().filter((m) => m.love > 0).length)) === 2, 'both cows are in love');
await shot('love', 200);
check(await until(() => sc(() => window.__solrift.mobs().filter((m) => m.kind === 'cow').length === 3), 60000), 'a calf was born');
const calf = (await sc(() => window.__solrift.mobs())).find((m) => m.baby);
check(!!calf, 'the calf is a baby');
await shot('calf', 300);
await sc((id) => window.__solrift.growMob(id, 1), calf.id);
check(await until(() => sc(() => !window.__solrift.mobs().some((m) => m.baby)), 5000), 'the calf grew up');

// ---------------------------------------------------------------- the second world
await sc(([x, y, z]) => window.__solrift.setBlock(x, y, z, 1), [bx, Y + 8, bz]); // an edit to find again in the overworld
await sc(() => window.__solrift.save());
// Typing /world square in the chat box does it.
await page.keyboard.press('Slash');
await sleep(300);
await page.keyboard.type('world square');
await page.keyboard.press('Enter');
await ready('square');
check((await sc(() => window.__solrift.worldKind())) === 'square', 'now in the square world');
check((await sc(() => window.__solrift.mode())) === 'creative', 'and still in creative');
const p = await sc(() => window.__solrift.position());
check(Math.abs(p.x) < 3 && Math.abs(p.z) < 3 && Math.abs(p.y - 64) < 2, `spawned in the middle of the platform (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`);
await sleep(1500);
check((await blockAt(0, 63, 0)) === STONE, 'stone under the spawn');
check((await blockAt(-32, 63, 0)) === BRICKS && (await blockAt(31, 63, 5)) === BRICKS, 'stone-brick border on two sides');
check((await blockAt(40, 63, 0)) === AIR && (await blockAt(0, 63, 40)) === AIR, 'void outside the square');
await sc(() => window.__solrift.setFlying(true));
await sc(() => window.__solrift.teleport(0.5, 80, 20.5, Math.PI, -0.5));
await shot('square-view', 1500);
// Build something and leave: it must still be there on return.
await sc(() => window.__solrift.setBlock(5, 64, 5, 1));
await sc(() => window.__solrift.save());
await page.keyboard.press('Slash');
await sleep(300);
await page.keyboard.type('world overworld');
await page.keyboard.press('Enter');
await ready('overworld');
check((await sc(() => window.__solrift.worldKind())) === 'overworld', 'back in the overworld');
await sleep(1500);
check((await blockAt(bx, Y + 8, bz)) === STONE, 'the overworld edit is still there');
await page.keyboard.press('Slash');
await sleep(300);
await page.keyboard.type('world square');
await page.keyboard.press('Enter');
await ready('square');
await sleep(1500);
check((await blockAt(5, 64, 5)) === STONE, 'the square world kept the block that was built there');

// Walking off the platform ends in the void (survival).
await sc(() => window.__solrift.setMode('survival'));
await sc(() => window.__solrift.setFlying(false));
await sc(() => window.__solrift.teleport(40.5, 66, 0.5, 0, 0));
check(await until(() => sc(() => window.__solrift.hp() === 0 || window.__solrift.screen() === 'dead'), 15000), 'falling off the edge kills');

check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall worlds checks passed');
