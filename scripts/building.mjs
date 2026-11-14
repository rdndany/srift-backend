// Building blocks E2E: slabs, stairs, doors, trapdoors, ladders, fences, gates, glass panes and stone
// bricks - how they look, how they are placed and used, and how you walk around them.
// Usage: node scripts/building.mjs [url] [outDir]   (the game server needs CHEATS=1, as scripts/e2e.mjs sets)
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

// Block ids (see packages/shared/src/blocks.ts). Materials: 0 wooden, 1 cobblestone, 2 stone, 3 sandstone, 4 stone brick.
const slab = (mat, top) => 80 + mat * 2 + (top ? 1 : 0);
const stairs = (mat, top, dir) => 90 + mat * 8 + (top ? 4 : 0) + dir;
const door = (upper, open, f) => 130 + (upper ? 8 : 0) + (open ? 4 : 0) + f;
const trapdoor = (top, open, f) => 146 + (top ? 8 : 0) + (open ? 4 : 0) + f;
const ladder = (f) => 162 + f;
const FENCE = 166;
const gate = (open, f) => 167 + (open ? 2 : 0) + (f >> 1);
const PANE = 175;
const BRICKS = 176;
const DOOR_ITEM = 346;
const PLANKS = 10;
const EAST = -Math.PI / 2; // yaw looking toward +x

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
const shot = async (page, name, wait = 600) => {
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

const put = (blocks) =>
  sc(
    page,
    (list) => {
      for (const [x, y, z, id] of list) window.__solrift.setBlock(x, y, z, id);
    },
    blocks,
  );
const get = (x, y, z) => sc(page, ([x, y, z]) => window.__solrift.getBlock(x, y, z), [x, y, z]);
const at = (x, y, z, yaw = 0, pitch = 0) => sc(page, ([x, y, z, yaw, pitch]) => window.__solrift.teleport(x, y, z, yaw, pitch), [x, y, z, yaw, pitch]);
const position = () => sc(page, () => window.__solrift.position());
const hold = (code, down) => sc(page, ([c, d]) => window.__solrift.holdKey(c, d), [code, down]);

// A flat grass-topped field, with the floor at gy - 1.
await sc(
  page,
  ([px, pz, gy]) => {
    const s = window.__solrift;
    for (let x = px - 14; x <= px + 14; x++)
      for (let z = pz - 14; z <= pz + 12; z++) {
        for (let y = gy; y <= gy + 12; y++) s.setBlock(x, y, z, 0);
        s.setBlock(x, gy - 1, z, 3);
        s.setBlock(x, gy - 2, z, 2);
      }
    s.setTime(0.3);
    s.teleport(px + 0.5, gy, pz + 0.5, 0, 0);
  },
  [px, pz, gy],
);
await sleep(400);

// --- a showcase to look at ---------------------------------------------------------------------------
const list = [];
// Stairs in all four directions, wooden then stone; one upside-down.
for (let d = 0; d < 4; d++) list.push([px - 7 + d * 2, gy, pz - 3, stairs(0, false, d)]);
for (let d = 0; d < 4; d++) list.push([px - 7 + d * 2, gy, pz - 5, stairs(2, true, d)]);
// Slabs: bottom, top, and a full block made of two.
list.push([px + 2, gy, pz - 3, slab(1, false)]);
list.push([px + 4, gy, pz - 3, slab(3, true)]);
list.push([px + 6, gy, pz - 3, slab(2, false)]);
list.push([px + 6, gy + 1, pz - 3, slab(2, true)]);
// A little house: stone brick walls, a cobble slab roof, windows of glass panes, and a door.
const H0 = px - 3;
const H1 = px + 3;
const Z0 = pz - 11;
const Z1 = pz - 6;
for (let x = H0; x <= H1; x++)
  for (let z = Z0; z <= Z1; z++)
    for (let y = gy; y <= gy + 3; y++) {
      const wall = x === H0 || x === H1 || z === Z0 || z === Z1;
      if (wall) list.push([x, y, z, y === gy + 3 ? slab(1, false) : BRICKS]);
      else if (y === gy + 3) list.push([x, y, z, slab(1, false)]);
      else list.push([x, y, z, 0]);
    }
for (const [x, z] of [[px - 3, pz - 9], [px - 3, pz - 8], [px + 3, pz - 9], [px + 3, pz - 8], [px - 1, Z0], [px + 1, Z0]]) list.push([x, gy + 1, z, PANE]);
// Wooden planks floor inside, a bed of slabs, and the doorway in the front wall.
for (let x = H0 + 1; x < H1; x++) for (let z = Z0 + 1; z < Z1; z++) list.push([x, gy - 1, z, PLANKS]);
list.push([px, gy, Z1, 0], [px, gy + 1, Z1, 0]);
// A fence run with a gate, and a ladder up the east wall.
for (let x = px - 8; x <= px - 5; x++) list.push([x, gy, pz - 1, FENCE]);
list.push([px - 4, gy, pz - 1, gate(false, 2)]);
for (let x = px - 3; x <= px - 1; x++) list.push([x, gy, pz - 1, FENCE]);
list.push([px - 5, gy, pz - 2, FENCE]);
for (let y = gy; y <= gy + 3; y++) list.push([px + 4, y, Z1 - 1, ladder(1)]);
// Trapdoors: closed on the floor, open against a wall.
list.push([px + 5, gy, pz - 1, trapdoor(false, false, 0)], [px + 7, gy, pz - 1, trapdoor(false, true, 2)]);
await put(list);
await sleep(300);

console.log('doors');
await sc(page, (id) => window.__solrift.give(id, 4), DOOR_ITEM);
const slot = await sc(page, (id) => window.__solrift.inventory().findIndex((s) => s && s[0] === id), DOOR_ITEM);
check(slot >= 0, 'a door is an item that goes in the inventory');
await sc(page, (i) => window.__solrift.select(i), slot);
await at(px + 0.5, gy, Z1 + 3.5, 0, 0);
await sleep(200);
// The doorway is open; put the door in it by clicking the floor there.
const placed = await sc(page, ([x, y, z]) => window.__solrift.useOn(x, y, z, 0, 1, 0), [px, gy - 1, Z1]);
check(placed === true, 'right-click on the floor places a door');
const lowId = await get(px, gy, Z1);
const upId = await get(px, gy + 1, Z1);
check(lowId >= 130 && lowId < 146 && upId >= 130 && upId < 146 && upId - lowId === 8, `a door is two blocks (${lowId}, ${upId})`);
check((await sc(page, (id) => window.__solrift.countOf(id), DOOR_ITEM)) === 3, 'it used one door up');
await shot(page, 'building-door-closed', 900);
const opened = await sc(page, ([x, y, z]) => window.__solrift.useBlock(x, y, z), [px, gy + 1, Z1]);
const lowOpen = await get(px, gy, Z1);
const upOpen = await get(px, gy + 1, Z1);
check(opened === true && lowOpen - lowId === 4 && upOpen - upId === 4, 'using it opens both halves');
await at(px + 0.5, gy, Z1 + 3.5, 0.4, -0.1);
await shot(page, 'building-door-open', 700);
await at(px + 0.5, gy, Z1 - 2.5, Math.PI + 0.25, -0.1);
await shot(page, 'building-door-open-inside', 700);
await at(px + 0.5, gy, Z1 + 2.2, 0, 0);
await shot(page, 'building-door-front', 700);

console.log('showcase pictures');
await at(px - 3.5, gy + 4, pz + 1.5, 0, -0.62);
await shot(page, 'building-stairs-fences', 900);
await at(px - 9.5, gy + 1.5, pz - 2.4, EAST + 0.15, -0.4);
await shot(page, 'building-stairs', 700);
await at(px + 9.5, gy, pz - 3.5, EAST + Math.PI + 0.2, -0.25);
await shot(page, 'building-slabs-trapdoors', 700);
await at(px + 8, gy, Z1 + 3.5, EAST + Math.PI + 0.9, -0.15);
await shot(page, 'building-house', 700);
await at(px - 0.5, gy, Z1 - 1.5, 0.35, -0.1);
await shot(page, 'building-house-inside', 700);

console.log('placing by hand');
await sc(page, (id) => window.__solrift.give(id, 8), slab(0, false));
await sc(page, (id) => window.__solrift.give(id, 8), stairs(0, false, 0));
const slotOf = (id) => sc(page, (id) => window.__solrift.inventory().findIndex((s) => s && s[0] === id), id);
await sc(page, (i) => window.__solrift.select(i), await slotOf(slab(0, false)));
await at(px + 10.5, gy, pz + 3.5, 0, 0);
const flat = await sc(page, ([x, y, z]) => window.__solrift.useOn(x, y, z, 0, 1, 0), [px + 10, gy - 1, pz + 5]);
check(flat && (await get(px + 10, gy, pz + 5)) === slab(0, false), 'a slab placed on the floor lies in the lower half');
const merged = await sc(page, ([x, y, z]) => window.__solrift.useOn(x, y, z, 0, 1, 0), [px + 10, gy, pz + 5]);
check(merged && (await get(px + 10, gy, pz + 5)) === PLANKS, 'a second slab on top makes a full block of planks');
const top = await sc(page, ([x, y, z]) => window.__solrift.useOn(x, y, z, 1, 0, 0, 0.85), [px + 10, gy, pz + 5]);
check(top && (await get(px + 11, gy, pz + 5)) === slab(0, true), 'clicking high on a wall gives a top slab');
await sc(page, (i) => window.__solrift.select(i), await slotOf(stairs(0, false, 0)));
const st = await sc(page, ([x, y, z]) => window.__solrift.useOn(x, y, z, 0, 1, 0), [px + 10, gy - 1, pz + 7]);
check(st && (await get(px + 10, gy, pz + 7)) === stairs(0, false, 3), 'stairs rise away from you (you face north)');

console.log('icons');
for (const id of [trapdoor(false, false, 0), ladder(0), FENCE, gate(false, 0), PANE, BRICKS]) await sc(page, (id) => window.__solrift.give(id, 5), id);
await sc(page, (i) => window.__solrift.select(i), 2);
await shot(page, 'building-hotbar', 500);

console.log('walking');
// Over a slab.
await put([[px + 4, gy, pz + 4, slab(0, false)]]);
await at(px + 2.5, gy, pz + 4.5, EAST, 0);
await sleep(200);
await hold('KeyW', true);
const onSlab = await until(async () => {
  const p = await position();
  return p.x > px + 4.3 && p.x < px + 4.7 && Math.abs(p.y - (gy + 0.5)) < 0.03;
}, 6000);
await hold('KeyW', false);
check(onSlab, 'walking into a slab steps you up onto it');
// Up a flight of stairs.
const flight = [];
for (let i = 0; i < 4; i++) {
  for (let y = gy; y < gy + i; y++) flight.push([px - 8 + i, y, pz + 8, BRICKS]);
  flight.push([px - 8 + i, gy + i, pz + 8, stairs(4, false, 0)]);
}
await put(flight);
await at(px - 10 + 0.5, gy, pz + 8.5, EAST, 0);
await sleep(200);
await hold('KeyW', true);
const climbed = await until(async () => (await position()).y > gy + 3.9 && (await position()).x > px - 5, 9000);
await hold('KeyW', false);
check(climbed, 'a flight of stairs can be walked up without jumping');
await shot(page, 'building-on-stairs', 300);
// A fence and a gate.
await put([[px + 4, gy, pz + 6, FENCE], [px + 4, gy, pz + 7, gate(false, 0)]]);
await at(px + 1.5, gy, pz + 6.5, EAST, 0);
await sleep(200);
await hold('KeyW', true);
await sleep(1800);
await hold('KeyW', false);
check((await position()).x < px + 4.4, 'a fence stops you');
await at(px + 1.5, gy, pz + 7.5, EAST, 0);
await sleep(200);
await hold('KeyW', true);
await sleep(1500);
check((await position()).x < px + 4.3, 'a closed gate stops you');
await hold('KeyW', false);
await sc(page, ([x, y, z]) => window.__solrift.useBlock(x, y, z), [px + 4, gy, pz + 7]);
await hold('KeyW', true);
await sleep(1500);
await hold('KeyW', false);
check((await position()).x > px + 5, 'an open gate lets you through');
// A ladder.
const tower = [];
for (let y = gy; y < gy + 10; y++) {
  tower.push([px + 9, y, pz + 10, BRICKS]);
  tower.push([px + 8, y, pz + 10, ladder(0)]);
}
await put(tower);
await at(px + 8.5, gy, pz + 10.5, EAST, 0);
await sleep(200);
await hold('KeyW', true);
const up = await until(async () => (await position()).y > gy + 7, 40000);
await hold('KeyW', false);
check(up, 'holding forward climbs a ladder');
await shot(page, 'building-ladder', 300);

console.log('breaking');
const before = await sc(page, () => window.__solrift.inventory().reduce((n, s) => n + (s ? 1 : 0), 0));
await sc(page, ([x, y, z]) => window.__solrift.breakAt(x, y, z), [px, gy + 1, Z1]);
check((await get(px, gy, Z1)) === 0 && (await get(px, gy + 1, Z1)) === 0, 'breaking half a door removes both');
check(before >= 1, 'inventory is intact');

await browser.close();
const real = errors.filter((e) => !/favicon|WebSocket|ERR_CONNECTION|Failed to load resource/i.test(e));
if (real.length) {
  console.log('console errors:', real);
  failures.push('console errors');
}
if (failures.length) {
  console.log(`BUILDING E2E FAILED (${failures.length})`);
  process.exit(1);
}
console.log('BUILDING E2E passed');
