// Rails, minecarts and boats E2E. Saves `vehicles-*.png`.
// Usage: node scripts/vehicles.mjs [url] [outDir]   (the game server needs CHEATS=1, as scripts/e2e.mjs sets)
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const STONE = 1;
const AIR = 0;
const WATER = 5;
const RAIL_X = 48;
const RAIL_Z = 49;
const RAIL_WS = 1003;
const RAIL_UP_PX = 1006;
const POWERED_X = 1010;

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
  await page.screenshot({ path: `${outDir}/vehicles-${name}.png` });
  console.log('saved', name);
};

await page.goto(`${url}/?seed=1337&debug&nomobs&mode=creative`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), null, { timeout: 120000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
});

const itemId = (name) => sc((n) => window.__solrift.itemId(n), name);
const MINECART = await itemId('minecart');
const BOAT = await itemId('boat');
const POWERED_ITEM = await itemId('powered_rail');
check(MINECART === 387 && BOAT === 388, `minecart and boat items are ${MINECART} / ${BOAT}`);
check(POWERED_ITEM === POWERED_X, `the gold rail item is ${POWERED_ITEM}`);

const here = await sc(() => window.__solrift.position());
const bx = Math.floor(here.x) + 14;
const bz = Math.floor(here.z) + 14;
const ground = await sc(([x, z]) => window.__solrift.surfaceY(x, z), [bx, bz]);
const Y = ground + 14;

// A stone platform with a track: along x, round a corner, then south; a gold stretch at the start; a hill at the far end; and a pond.
await sc(
  ([bx, bz, Y, STONE, AIR, WATER, RAIL_X, RAIL_Z, RAIL_WS, RAIL_UP_PX, POWERED_X]) => {
    const s = window.__solrift;
    for (let x = bx - 14; x <= bx + 14; x++)
      for (let z = bz - 14; z <= bz + 14; z++) {
        s.setBlock(x, Y, z, STONE);
        for (let y = Y + 1; y <= Y + 8; y++) s.setBlock(x, y, z, AIR);
      }
    for (let x = bx - 8; x <= bx - 6; x++) s.setBlock(x, Y + 1, bz, POWERED_X);
    for (let x = bx - 5; x <= bx + 5; x++) s.setBlock(x, Y + 1, bz, RAIL_X);
    s.setBlock(bx + 6, Y + 1, bz, RAIL_WS);
    for (let z = bz + 1; z <= bz + 5; z++) s.setBlock(bx + 6, Y + 1, z, RAIL_Z);
    // A pond to the west.
    for (let x = bx - 13; x <= bx - 3; x++)
      for (let z = bz + 4; z <= bz + 12; z++) {
        s.setBlock(x, Y, z, WATER);
        s.setBlock(x, Y - 1, z, STONE);
      }
    // A hill: two blocks up, with a ramp.
    s.setBlock(bx + 10, Y + 1, bz - 6, STONE);
    s.setBlock(bx + 11, Y + 1, bz - 6, STONE);
    s.setBlock(bx + 11, Y + 2, bz - 6, STONE);
  },
  [bx, bz, Y, STONE, AIR, WATER, RAIL_X, RAIL_Z, RAIL_WS, RAIL_UP_PX, POWERED_X],
);
const stand = (x, y, z, yaw = 0, pitch = 0) => sc(([x, y, z, yaw, pitch]) => window.__solrift.teleport(x, y, z, yaw, pitch), [x, y, z, yaw, pitch]);
await stand(bx + 0.5, Y + 4, bz - 6, Math.PI, -0.5);
await sleep(1500);
check((await sc(([x, y, z]) => window.__solrift.getBlock(x, y, z), [bx + 6, Y + 1, bz])) === RAIL_WS, 'the corner rail is in the world');
await shot('track');

// ---- a minecart on the track
const cartId = await sc(([x, y, z]) => window.__solrift.spawnVehicle('minecart', x, y, z), [bx - 4 + 0.5, Y + 1.1, bz + 0.5]);
check(cartId > 0, `a minecart sits on the rail (id ${cartId})`);
check(
  (await sc(() => window.__solrift.vehicles())).some((v) => v.kind === 'minecart' && v.onRail),
  'it is on the rail',
);
check((await sc(() => window.__solrift.spawnVehicle('minecart', 0.5, 300, 0.5))) === -1, 'a cart is not set down off a rail');
await stand(bx - 3.5, Y + 2, bz + 3, 0, -0.45);
await sleep(300);
await shot('cart');

check(await sc((id) => window.__solrift.mount(id), cartId), 'the player climbs in');
check((await sc(() => window.__solrift.riding())) === cartId, 'riding the cart');
await sc((id) => window.__solrift.pushVehicle(id, 7), cartId);
await sleep(700);
await shot('riding', 100);
const mid = (await sc(() => window.__solrift.vehicles()))[0];
const body = await sc(() => window.__solrift.position());
check(Math.abs(body.x - mid.x) < 0.6 && Math.abs(body.z - mid.z) < 0.6, 'the rider is carried with the cart');
check(
  await until(async () => {
    const v = (await sc(() => window.__solrift.vehicles()))[0];
    return v && v.z > bz + 2;
  }, 12000),
  'the cart ran round the corner and south',
);
await shot('corner', 100);
check(
  await until(async () => {
    const v = (await sc(() => window.__solrift.vehicles()))[0];
    return v && v.speed < 0.3;
  }, 20000),
  'it came to rest at the end of the line',
);
const end = (await sc(() => window.__solrift.vehicles()))[0];
check(end.onRail && Math.abs(end.x - (bx + 6.5)) < 0.1 && end.z > bz + 4, `it stopped on the last rail (${end.x.toFixed(1)}, ${end.z.toFixed(1)})`);
await sc(() => window.__solrift.dismount());
check((await sc(() => window.__solrift.riding())) === 0, 'the player gets out');
const out = await sc(() => window.__solrift.position());
check(Math.hypot(out.x - end.x, out.z - end.z) > 0.8, 'and stands beside it');

// ---- a boat on the pond
const boatId = await sc(([x, y, z]) => window.__solrift.spawnVehicle('boat', x, y, z), [bx - 8 + 0.5, Y + 0.6, bz + 8 + 0.5]);
check(boatId > 0, 'a boat is launched');
await stand(bx - 8 + 0.5, Y + 2.5, bz + 13, 0, -0.45);
await sleep(1500);
const boat = (await sc(() => window.__solrift.vehicles())).find((v) => v.kind === 'boat');
check(boat && boat.y > Y + 0.3 && boat.y < Y + 1.1, `it floats at the surface (y ${boat?.y.toFixed(2)})`);
await shot('boat');
check(await sc((id) => window.__solrift.mount(id), boatId), 'the player gets in the boat');
await sc((id) => window.__solrift.pushVehicle(id, 4), boatId);
await sleep(1200);
const moved = (await sc(() => window.__solrift.vehicles())).find((v) => v.kind === 'boat');
check(moved.x > boat.x + 1, 'the boat glides over the water');
await shot('boat-ride', 100);
await sc(() => window.__solrift.dismount());

check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nvehicles E2E passed');
