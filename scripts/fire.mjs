// Fire E2E: flint and steel lights a fire on a block, a fire spreads over wooden planks and burns them,
// standing in flames sets the player alight (HUD flames, damage), water puts it all out, and punching
// a flame removes it. Saves `fire-*.png`.
// Usage: node scripts/fire.mjs [url] [outDir]   (the game server needs CHEATS=1, as scripts/e2e.mjs sets)
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const AIR = 0;
const STONE_BLOCK = 1;
const WATER = 5;
const PLANKS = 10;
const FIREBLOCK = 173;

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
  await page.screenshot({ path: `${outDir}/fire-${name}.png` });
  console.log('saved', name);
};
const get = (x, y, z) => sc(([a, b, c]) => window.__solrift.getBlock(a, b, c), [x, y, z]);

const FIRE = await sc(() => window.__solrift.itemId('flint_and_steel'));
check(FIRE > 0, `flint and steel is an item (${FIRE})`);

// A flat stone platform in the air; a wooden hut wall to burn.
const here = await sc(() => window.__solrift.position());
const bx = Math.floor(here.x) + 12;
const bz = Math.floor(here.z) + 12;
const ground = await sc(([x, z]) => window.__solrift.surfaceY(x, z), [bx, bz]);
const Y = ground + 10;
await sc(
  ([bx, bz, Y, STONE_BLOCK, AIR, PLANKS]) => {
    const s = window.__solrift;
    for (let x = bx - 8; x <= bx + 8; x++)
      for (let z = bz - 8; z <= bz + 8; z++) {
        s.setBlock(x, Y, z, STONE_BLOCK);
        for (let y = Y + 1; y <= Y + 8; y++) s.setBlock(x, y, z, AIR);
      }
    // A little wall of planks, four wide and three tall.
    for (let dx = 0; dx < 4; dx++) for (let dy = 1; dy <= 3; dy++) s.setBlock(bx + dx, Y + dy, bz, PLANKS);
  },
  [bx, bz, Y, STONE_BLOCK, AIR, PLANKS],
);
await sleep(500);
await sc(([x, y, z]) => {
  window.__solrift.setMode('survival');
  window.__solrift.setFlying(false);
  window.__solrift.teleport(x, y, z, 0, -0.35);
}, [bx + 1.5, Y + 1.01, bz + 4.5]);
await sleep(800);

// Flint and steel on the top of the stone floor in front of the wall: a fire appears.
await sc((i) => {
  window.__solrift.give(i, 1);
  window.__solrift.select(0);
}, FIRE);
const inv = await sc(() => window.__solrift.inventory());
const slot = inv.findIndex((s) => s && s[0] === FIRE);
await sc((i) => window.__solrift.select(i), slot);
const used = await sc(([x, y, z]) => window.__solrift.useOn(x, y, z, 0, 1, 0), [bx + 1, Y, bz + 1]);
check(used === true, 'flint and steel is used on the floor');
const FIREID = await get(bx + 1, Y + 1, bz + 1);
check(FIREID === FIREBLOCK, `a fire burns where it was used (block ${FIREID})`);
check((await sc(() => window.__solrift.fires())) === 1, 'and the world counts one fire');
const inv2 = await sc(() => window.__solrift.inventory());
const steel = inv2.find((s) => s && s[0] === FIRE);
check(steel && steel[2] === 1, `the tool wore down by one use (damage ${steel && steel[2]})`);
await shot('lit', 1200);

// Let it spread: the planks next to it catch.
let fires = 1;
let planks = 12;
let shotTaken = false;
for (let i = 0; i < 18 && (fires < 3 || planks === 12); i++) {
  await sc(() => window.__solrift.fireRun(10));
  const now = await sc(() => window.__solrift.fires());
  fires = Math.max(fires, now);
  planks = 0;
  for (let dx = 0; dx < 4; dx++) for (let dy = 1; dy <= 3; dy++) if ((await get(bx + dx, Y + dy, bz)) === PLANKS) planks++;
  if (!shotTaken && now > 1) {
    await shot('spreading', 1000);
    shotTaken = true;
  }
}
check(fires > 1, `the fire spreads (up to ${fires} fires at once)`);
check(planks < 12, `the wooden wall is burning away (${planks}/12 planks left)`);

// Left alone, fire on bare stone with nothing to eat dies down.
await sc(() => window.__solrift.fireRun(120));
check((await sc(() => window.__solrift.fires())) === 0, 'in the end everything burns out');
await sleep(400);

// Standing in flames sets the player alight and hurts.
const hp0 = (await sc(() => window.__solrift.shield())).health;
await sc((hp) => {
  window.__minHp = hp;
  setInterval(() => (window.__minHp = Math.min(window.__minHp, window.__solrift.shield().health)), 30);
}, hp0);
await sc(([x, y, z]) => window.__solrift.ignite(x, y, z), [bx - 4, Y + 1, bz + 4]);
await sc(([x, y, z]) => window.__solrift.teleport(x, y, z, 0, -0.2), [bx - 3.5, Y + 1.01, bz + 4.5]);
await sc(() => window.__solrift.setMode('survival'));
check(await until(async () => (await sc(() => window.__solrift.onFire())) > 0, 8000), 'standing in the flames sets the player alight');
check(await until(async () => (await page.locator('#fire-overlay').count()) === 1, 4000), 'the HUD shows flames');
check(await until(async () => (await sc(() => window.__minHp)) < hp0, 6000), 'and it hurts');
await shot('burning', 300);

// Step out and into water: the flames go out.
await sc(([x, y, z]) => window.__solrift.setBlock(x, y, z, 5), [bx - 1, Y + 1, bz + 6]);
await sc(([x, y, z]) => window.__solrift.teleport(x, y, z, 0, -0.2), [bx - 1 + 0.5, Y + 1.01, bz + 6.5]);
check(await until(async () => (await sc(() => window.__solrift.onFire())) === 0, 6000), 'water puts the player out');
check(await until(async () => (await page.locator('#fire-overlay').count()) === 0, 4000), 'and the flames leave the screen');

// Water also washes a flame away.
await sc(([x, y, z]) => window.__solrift.ignite(x, y, z), [bx + 6, Y + 1, bz + 6]);
check((await get(bx + 6, Y + 1, bz + 6)) !== AIR, 'a second fire is lit');
await sc(([x, y, z, w]) => window.__solrift.setBlock(x, y, z, w), [bx + 6, Y + 2, bz + 6, WATER]);
// Flowing water and the fire tick follow the game clock, which crawls under software rendering: give it time.
for (let i = 0; i < 30 && ((await get(bx + 6, Y + 1, bz + 6)) === FIREBLOCK || (await sc(() => window.__solrift.fires())) > 0); i++) {
  await sleep(1000);
  await sc(() => window.__solrift.fireRun(5));
}
await sleep(300);
check((await get(bx + 6, Y + 1, bz + 6)) !== FIREBLOCK && (await sc(() => window.__solrift.fires())) === 0, 'water poured onto it puts it out');

// Punching a flame removes it, and drops nothing.
await sc(([x, y, z]) => window.__solrift.ignite(x, y, z), [bx + 6, Y + 1, bz - 4]);
const before = await sc(() => window.__solrift.drops());
await sc(([x, y, z]) => window.__solrift.breakAt(x, y, z), [bx + 6, Y + 1, bz - 4]);
await sleep(300);
check((await get(bx + 6, Y + 1, bz - 4)) === AIR, 'breaking a flame puts it out');
check((await sc(() => window.__solrift.drops())) === before, 'and leaves nothing behind');

const real = errors.filter((e) => !/favicon|404|Failed to load resource|ERR_|WebSocket/i.test(e));
check(real.length === 0, `no console errors${real.length ? `: ${real.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nfire ok');


