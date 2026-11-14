// Shield E2E: the off-hand slot and its look, F to swap hands, raising the shield with the use
// button, what it stops (a hit from the front, but not from behind), wear, and the same screens online.
// Usage: node scripts/shield.mjs [url] [outDir]   (the game server needs CHEATS=1, as scripts/e2e.mjs sets)
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const SHIELD = 344;
const DIAMOND_SWORD = 289; // only used as "something that is not a shield" below

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

// The raise takes a quarter of game time; the software renderer plays that slowly, so wait for it instead of a fixed pause.
const raised = (p) => until(async () => (await p.evaluate(() => window.__solrift.shield())).blockTime >= 0.3, 20000);

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
const state = (page) => sc(page, () => window.__solrift.shield());
const shot = async (page, name, wait = 500) => {
  await sleep(wait);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('saved', name);
};

// ---------------------------------------------------------------------------------------------------
console.log('single player');
const page = await open('?seed=1337&debug&nomobs', 'solo');
const pos = await sc(page, () => window.__solrift.position());
const px = Math.floor(pos.x);
const pz = Math.floor(pos.z);
const gy = await sc(page, ([x, z]) => window.__solrift.surfaceY(x, z), [px, pz]);
await sc(
  page,
  ([px, pz, gy]) => {
    const s = window.__solrift;
    for (let x = px - 6; x <= px + 6; x++)
      for (let z = pz - 6; z <= pz + 6; z++) {
        for (let y = gy; y <= gy + 8; y++) s.setBlock(x, y, z, 0);
        s.setBlock(x, gy - 1, z, 3);
        s.setBlock(x, gy - 2, z, 2);
      }
    s.setTime(0.3);
    s.teleport(px + 0.5, gy, pz + 0.5, 0, 0); // yaw 0 looks toward -z
  },
  [px, pz, gy],
);
await sleep(500);

let st = await state(page);
check(!st.offhand && !st.blocking, 'a new player has an empty off hand and the shield is down');
check((await page.locator('.off-hotbar').count()) === 0, 'no off-hand slot by the hotbar while it is empty');

console.log('the off hand');
await sc(page, (id) => window.__solrift.give(id, 1), SHIELD);
const slot = await sc(page, (id) => window.__solrift.inventory().findIndex((s) => s && s[0] === id), SHIELD);
check(slot >= 0, 'the shield is a real item that goes in the inventory');
await sc(page, (i) => window.__solrift.select(i), slot);
await shot(page, 'shield-in-hand');
await page.keyboard.press('KeyF');
await sleep(300);
st = await state(page);
check(st.offhand && st.offhand[0] === SHIELD && st.held === 0, 'F moves the shield from the hand to the off hand');
check(await until(async () => (await page.locator('.off-hotbar').count()) === 1), 'the shield shows left of the hotbar');
await shot(page, 'shield-offhand-rest');

console.log('the inventory screen');
await sc(page, () => window.__solrift.openMenu('inventory'));
check(await until(async () => (await page.locator('.off-slot .slot').count()) === 1), 'an off-hand slot on the inventory screen');
check((await page.locator('.off-slot .slot img.item-icon').count()) === 1, 'it shows the shield');
await page.mouse.move(900, 250);
await shot(page, 'shield-inventory');
// Click it out and back in.
await page.locator('.off-slot .slot').click();
st = await state(page);
check(!st.offhand, 'clicking the slot picks the shield up');
check((await page.locator('.off-slot .slot img.ghost').count()) === 1, 'an empty slot shows the ghost of a shield');
await page.locator('.off-slot .slot').click();
st = await state(page);
check(st.offhand && st.offhand[0] === SHIELD, 'and clicking again puts it back');
await sc(page, () => window.__solrift.closeMenu());
await sleep(200);

console.log('raising it');
await sc(page, () => window.__solrift.setRight(true));
await raised(page);
st = await state(page);
check(st.blocking === true, 'holding the use button raises the shield');
await shot(page, 'shield-raised-first-person', 300);
const hp0 = st.health;
await sc(page, () => window.__solrift.hurtFrom(5, 0, 1)); // an attacker in front pushes toward +z
st = await state(page);
check(st.health === hp0, 'a hit from the front does nothing');
check(st.offhand[2] === 6, `and costs the shield 1 + damage durability (${st.offhand[2]})`);
await sleep(700);
await sc(page, () => window.__solrift.hurtFrom(5, 0, -1)); // from behind
st = await state(page);
check(st.health < hp0, 'a hit from behind still hurts');
await sc(page, () => window.__solrift.setHealth(20));

// The same from outside.
await sc(page, () => window.__solrift.setView(1));
await shot(page, 'shield-raised-third-person', 600);
await sc(page, () => window.__solrift.setView(2));
await shot(page, 'shield-raised-front-view', 600);
await sc(page, () => window.__solrift.setView(0));

await sc(page, () => window.__solrift.setRight(false));
await sleep(500);
st = await state(page);
check(st.blocking === false, 'letting go lowers it');
await sc(page, () => window.__solrift.setView(2));
await shot(page, 'shield-lowered-front-view', 700);
await sc(page, () => window.__solrift.setView(0));
await sc(page, () => window.__solrift.setHealth(20));
await sleep(900); // the hurt flash from before ends
const hp1 = (await state(page)).health;
await sc(page, () => window.__solrift.hurtFrom(4, 0, 1));
check((await state(page)).health < hp1, 'with the shield down the same hit hurts');

console.log('an explosion');
await sc(page, () => window.__solrift.setHealth(20));
await sleep(900);
await sc(page, () => window.__solrift.setRight(true));
await raised(page);
const p = await sc(page, () => window.__solrift.position());
await sc(page, ([x, y, z]) => window.__solrift.blast(x, y + 0.9, z - 2, 3), [p.x, p.y, p.z]);
const afterBlast = await state(page);
check(afterBlast.health === 20, `a blast two blocks ahead is stopped (health ${afterBlast.health}, blocking ${afterBlast.blocking})`);
await sc(page, () => window.__solrift.setRight(false));

console.log('it wears out');
await sc(page, () => window.__solrift.setHealth(20));
await sc(page, () => window.__solrift.setOffhand(0));
await sc(page, (id) => window.__solrift.setOffhand(id), SHIELD);
await sc(page, () => window.__solrift.setRight(true));
await raised(page);
let broke = false;
for (let i = 0; i < 100 && !broke; i++) {
  await sc(page, () => window.__solrift.hurtFrom(20, 0, 1));
  broke = !(await state(page)).offhand;
}
check(broke, 'a shield that takes enough hits breaks and disappears');
await sc(page, () => window.__solrift.setRight(false));

console.log('only a shield goes in the off hand');
await sc(page, (id) => window.__solrift.give(id, 1), DIAMOND_SWORD);
const sword = await sc(page, (id) => window.__solrift.inventory().findIndex((s) => s && s[0] === id), DIAMOND_SWORD);
await sc(page, (i) => window.__solrift.select(i), sword);
await sc(page, () => window.__solrift.swapHands());
st = await state(page);
check(!st.offhand && st.held === DIAMOND_SWORD, 'a sword stays in the hand');

console.log('a shield in the main hand');
await sc(page, (id) => window.__solrift.give(id, 1), SHIELD);
const s2 = await sc(page, (id) => window.__solrift.inventory().findIndex((s) => s && s[0] === id), SHIELD);
await sc(page, (i) => window.__solrift.select(i), s2);
await sc(page, () => window.__solrift.setRight(true));
await raised(page);
st = await state(page);
check(st.blocking === true && st.held === SHIELD, `it works from the hand too (blocking ${st.blocking}, held ${st.held}, shield ${SHIELD})`);
await shot(page, 'shield-main-hand-raised', 300);
await sc(page, () => window.__solrift.setRight(false));

// ---------------------------------------------------------------------------------------------------
console.log('online');
const online = await open(`?online&debug&name=shielduser${Date.now() % 10000}`, 'online');
await sc(online, () => window.__solrift.command({ t: 'inventory' }));
check(await until(async () => (await online.locator('.off-slot .slot').count()) === 1), 'the inventory screen online has the off-hand slot');
await online.screenshot({ path: `${outDir}/shield-online.png` });
await sc(online, () => window.__solrift.command({ t: 'swap' }));
await sleep(300);

await browser.close();
const real = errors.filter((e) => !/favicon|WebSocket|ERR_CONNECTION|Failed to load resource/i.test(e));
if (real.length) {
  console.log('console errors:', real);
  failures.push('console errors');
}
if (failures.length) {
  console.log(`SHIELD E2E FAILED (${failures.length})`);
  process.exit(1);
}
console.log('SHIELD E2E passed');
