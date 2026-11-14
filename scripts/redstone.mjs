// Redstone E2E: a lever, dust and a lamp; a button; a pressure plate. Saves `redstone-*.png`.
// Usage: node scripts/redstone.mjs [url] [outDir]   (the game server needs CHEATS=1, as scripts/e2e.mjs sets)
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const STONE = 1;
const AIR = 0;
const REDSTONE_BLOCK = 1017;
const LAMP = 1018;
const LAMP_ON = 1019;
const WIRE = 1020;
const LEVER = 1040; // on the floor, off
const BUTTON_PX = 1052; // stuck to the -x side of a block, off (face 1)
const PLATE = 1060;
const PLATE_ON = 1061;
const TORCH_ITEM = 1071;

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
const until = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(100);
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
  await page.screenshot({ path: `${outDir}/redstone-${name}.png` });
  console.log('saved', name);
};

await page.goto(`${url}/?seed=1337&debug&nomobs&mode=creative`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), null, { timeout: 120000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
});

const itemId = (name) => sc((n) => window.__solrift.itemId(n), name);
check((await itemId('redstone')) === 389, 'redstone dust is item 389');
check((await itemId('redstone_torch')) === TORCH_ITEM, 'the redstone torch item is its lit standing block');
check((await itemId('lever')) === LEVER && (await itemId('redstone_lamp')) === LAMP, 'lever and lamp items exist');

const here = await sc(() => window.__solrift.position());
const bx = Math.floor(here.x) + 14;
const bz = Math.floor(here.z) + 14;
const ground = await sc(([x, z]) => window.__solrift.surfaceY(x, z), [bx, bz]);
const Y = ground + 14;
const get = (x, y, z) => sc(([x, y, z]) => window.__solrift.getBlock(x, y, z), [x, y, z]);
const set = (x, y, z, id) => sc(([x, y, z, id]) => window.__solrift.setBlock(x, y, z, id), [x, y, z, id]);
const use = (x, y, z) => sc(([x, y, z]) => window.__solrift.useBlock(x, y, z), [x, y, z]);
const stand = (x, y, z, yaw = 0, pitch = 0) => sc(([x, y, z, yaw, pitch]) => window.__solrift.teleport(x, y, z, yaw, pitch), [x, y, z, yaw, pitch]);

await sc(
  ([bx, bz, Y, STONE, AIR]) => {
    const s = window.__solrift;
    for (let x = bx - 10; x <= bx + 10; x++)
      for (let z = bz - 10; z <= bz + 10; z++) {
        s.setBlock(x, Y, z, STONE);
        for (let y = Y + 1; y <= Y + 8; y++) s.setBlock(x, y, z, AIR);
      }
  },
  [bx, bz, Y, STONE, AIR],
);
await stand(bx + 0.5, Y + 4, bz - 7, Math.PI, -0.5);
await sleep(1500);

// ---- a lever, eight blocks of dust and a lamp
await set(bx - 5, Y + 1, bz, LEVER);
for (let x = bx - 4; x <= bx + 3; x++) await set(x, Y + 1, bz, WIRE);
await set(bx + 4, Y + 1, bz, LAMP);
await sleep(600);
check((await get(bx + 4, Y + 1, bz)) === LAMP, 'the lamp is dark');
await shot('off');
check(await use(bx - 5, Y + 1, bz), 'the lever is used');
check(await until(async () => (await get(bx + 4, Y + 1, bz)) === LAMP_ON), 'the lamp lights');
check((await get(bx - 4, Y + 1, bz)) === WIRE + 15, 'the dust next to the lever is at full strength');
check((await get(bx + 3, Y + 1, bz)) === WIRE + 8, 'and eight blocks along it is at 8');
check((await get(bx - 5, Y + 1, bz)) === LEVER + 1, 'the lever is up');
await shot('on');
await use(bx - 5, Y + 1, bz);
check(await until(async () => (await get(bx + 4, Y + 1, bz)) === LAMP), 'the lamp goes out when the lever is flipped back');
check((await get(bx - 4, Y + 1, bz)) === WIRE, 'and the dust is dead');

// ---- a button on a block, with a lamp on its other side
await set(bx + 6, Y + 1, bz + 4, STONE);
await set(bx + 5, Y + 1, bz + 4, BUTTON_PX);
await set(bx + 7, Y + 1, bz + 4, LAMP);
await sleep(400);
await use(bx + 5, Y + 1, bz + 4);
check(await until(async () => (await get(bx + 7, Y + 1, bz + 4)) === LAMP_ON), 'a button lights the lamp beside its block');
check((await get(bx + 5, Y + 1, bz + 4)) === BUTTON_PX + 1, 'the button is pushed in');
check(await until(async () => (await get(bx + 7, Y + 1, bz + 4)) === LAMP, 4000), 'the button springs back and the lamp goes out');

// ---- a pressure plate with a lamp next to it
await set(bx - 4, Y + 1, bz + 4, PLATE);
await set(bx - 3, Y + 1, bz + 4, LAMP);
await sleep(400);
await stand(bx - 4 + 0.5, Y + 1, bz + 4 + 0.5, 0, 0);
check(await until(async () => (await get(bx - 4, Y + 1, bz + 4)) === PLATE_ON), 'standing on a plate presses it');
check(await until(async () => (await get(bx - 3, Y + 1, bz + 4)) === LAMP_ON), 'and lights the lamp');
await shot('plate');
await stand(bx + 0.5, Y + 4, bz - 7, Math.PI, -0.5);
check(await until(async () => (await get(bx - 4, Y + 1, bz + 4)) === PLATE, 5000), 'stepping off lets it rise');
check(await until(async () => (await get(bx - 3, Y + 1, bz + 4)) === LAMP, 3000), 'and the lamp goes out');

// ---- a redstone block lights a lamp and dust beyond it
await set(bx - 8, Y + 1, bz - 4, REDSTONE_BLOCK);
await set(bx - 7, Y + 1, bz - 4, WIRE);
await set(bx - 6, Y + 1, bz - 4, WIRE);
await sleep(800);
check((await get(bx - 7, Y + 1, bz - 4)) === WIRE + 15 && (await get(bx - 6, Y + 1, bz - 4)) === WIRE + 14, 'a block of redstone powers dust beside it');
await shot('block');

check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nredstone E2E passed');