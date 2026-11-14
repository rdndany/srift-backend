// Bed E2E: placing a bed (two blocks), how it looks, using it by day and by night, lying in it (the
// screen fades, Shift or the Leave Bed button get you up), skipping the night, the respawn point and
// breaking it again.
// Usage: node scripts/bed.mjs [url] [outDir]   (the game server needs CHEATS=1, as scripts/e2e.mjs sets)
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const BED = 345;
const FOOT_NZ = 75;
const HEAD_NZ = 79;
const BED_HEIGHT = 9 / 16;

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
const bed = (page) => sc(page, () => window.__solrift.bed());
const shot = async (page, name, wait = 500) => {
  await sleep(wait);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('saved', name);
};
const toastText = (page) => page.locator('#item-name').textContent();

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
    for (let x = px - 8; x <= px + 8; x++)
      for (let z = pz - 8; z <= pz + 8; z++) {
        for (let y = gy; y <= gy + 8; y++) s.setBlock(x, y, z, 0);
        s.setBlock(x, gy - 1, z, 3);
        s.setBlock(x, gy - 2, z, 2);
      }
    // A little room around the bed so the first-person view has a ceiling and a wall to look at.
    for (let x = px; x <= px + 4; x++) for (let z = pz - 3; z <= pz + 2; z++) s.setBlock(x, gy + 3, z, 4);
    for (let y = gy; y <= gy + 2; y++) for (let x = px; x <= px + 4; x++) s.setBlock(x, y, pz - 3, 4);
    s.setTime(0.3);
    s.teleport(px + 0.5, gy, pz + 0.5, 0, 0); // yaw 0 looks toward -z
  },
  [px, pz, gy],
);
await sleep(500);
const bx = px + 2; // the bed: foot at (bx, gy, pz), head at (bx, gy, pz - 1)

console.log('the item');
await sc(page, (id) => window.__solrift.give(id, 1), BED);
const slot = await sc(page, (id) => window.__solrift.inventory().findIndex((s) => s && s[0] === id), BED);
check(slot >= 0, 'the bed is an item that goes in the inventory');
await sc(page, (i) => window.__solrift.select(i), slot);
await sleep(300);
await shot(page, 'bed-in-hand');

console.log('placing it');
const placed = await sc(page, ([x, y, z]) => window.__solrift.useOn(x, y, z, 0, 1, 0), [bx, gy - 1, pz]);
check(placed === true, 'right-click on the floor places it');
const foot = await sc(page, ([x, y, z]) => window.__solrift.getBlock(x, y, z), [bx, gy, pz]);
const head = await sc(page, ([x, y, z]) => window.__solrift.getBlock(x, y, z), [bx, gy, pz - 1]);
check(foot === FOOT_NZ && head === HEAD_NZ, `a foot and a head lie down facing the way you look (${foot}, ${head})`);
check((await sc(page, (id) => window.__solrift.countOf(id), BED)) === 0, 'the item is used up');
await sc(page, ([x, y, z]) => window.__solrift.teleport(x, y, z, Math.PI / 2, -0.45), [bx + 2.6, gy, pz - 0.2]);
await shot(page, 'bed-placed', 900);
await sc(page, ([x, y, z]) => window.__solrift.teleport(x, y, z, Math.PI * 0.25, -0.7), [bx + 1.6, gy, pz + 1.9]);
await shot(page, 'bed-placed-from-the-foot', 700);

console.log('walking onto it');
await sc(page, ([x, y, z]) => window.__solrift.teleport(x, y, z, Math.PI / 2, 0), [bx + 2.6, gy, pz + 0.5]);
await sleep(200);
await sc(page, () => window.__solrift.holdKey('KeyW', true));
const stepped = await until(async () => {
  const p = await sc(page, () => window.__solrift.position());
  return p.x < bx + 0.9 && p.x > bx + 0.1 && Math.abs(p.y - (gy + BED_HEIGHT)) < 0.02;
}, 6000);
await sc(page, () => window.__solrift.holdKey('KeyW', false));
check(stepped, 'walking into the bed steps you up onto the mattress');
await shot(page, 'bed-standing-on', 400);
await sc(page, ([x, y, z]) => window.__solrift.teleport(x, y, z, Math.PI / 2, -0.2), [bx + 2.6, gy, pz + 0.5]);
await sleep(300);

console.log('using it by day');
await sc(page, ([x, y, z]) => window.__solrift.useBed(x, y, z), [bx, gy, pz]);
let b = await bed(page);
check(b.sleeping === 0, 'you cannot sleep in the daytime');
check(b.spawn && b.spawn.x === bx && b.spawn.y === gy && b.spawn.z === pz - 1, 'but the bed becomes your respawn point (its head block)');
const msg = await toastText(page);
check(/Respawn point set/.test(msg) && /only sleep at night/.test(msg), `and you are told so (${msg})`);
await shot(page, 'bed-by-day-message', 200);

console.log('going to sleep');
await sc(page, () => window.__solrift.setTime(0.75));
await sc(page, ([x, y, z]) => window.__solrift.useBed(x, y, z), [bx, gy, pz]);
check(await until(async () => (await bed(page)).sleeping === 4), 'at night you lie down (the bed points -z)');
b = await bed(page);
const bodyY = await sc(page, () => window.__solrift.position().y);
check(Math.abs(bodyY - (gy + BED_HEIGHT)) < 0.02, 'on top of the mattress');
check(b.eye.y - bodyY < 0.4, 'with your eyes close to it');
check(await until(async () => (await bed(page)).fade > 0.5, 6000), 'the screen fades toward black');
check((await page.locator('#leave-bed').count()) === 1, 'a Leave Bed button shows');
await shot(page, 'bed-sleeping-fade', 100);

console.log('lying down, seen from outside');
// Take the roof and the back wall off so the camera has room.
await sc(
  page,
  ([px, pz, gy]) => {
    const s = window.__solrift;
    for (let x = px; x <= px + 4; x++) for (let z = pz - 3; z <= pz + 2; z++) s.setBlock(x, gy + 3, z, 0);
    for (let y = gy; y <= gy + 2; y++) for (let x = px; x <= px + 4; x++) s.setBlock(x, y, pz - 3, 0);
  },
  [px, pz, gy],
);
await sc(page, () => window.__solrift.setView(1));
await sc(page, () => window.__solrift.look(Math.PI * 0.8, -0.6));
await sleep(1200);
b = await bed(page);
check(b.figure && Math.abs(b.figure.rotX - Math.PI / 2) < 0.01, 'your figure lies on its back');
await sc(page, () => (document.getElementById('sleep-overlay').style.display = 'none'));
await shot(page, 'bed-sleeping-third-person', 800);
await sc(page, () => (document.getElementById('sleep-overlay').style.display = ''));
await sc(page, () => window.__solrift.setView(0));

console.log('lying down, seen from inside');
await sc(page, () => window.__solrift.look(0, 0.5));
await sc(page, () => (document.getElementById('sleep-overlay').style.display = 'none'));
await shot(page, 'bed-sleeping-first-person', 600);
await sc(page, () => (document.getElementById('sleep-overlay').style.display = ''));

console.log('getting up');
await sc(page, () => window.__solrift.holdKey('ShiftLeft', true));
check(await until(async () => (await bed(page)).sleeping === 0, 4000), 'Shift gets you out of bed');
await sc(page, () => window.__solrift.holdKey('ShiftLeft', false));
const out = await sc(page, () => window.__solrift.position());
check(Math.abs(out.y - gy) < 0.05 && !(Math.floor(out.x) === bx && (Math.floor(out.z) === pz || Math.floor(out.z) === pz - 1)), 'you stand on the floor beside the bed');
check(await until(async () => (await page.locator('#sleep-overlay').count()) === 0, 30000), 'and the screen fades back up');
await shot(page, 'bed-awake-again', 300);

console.log('the Leave Bed button');
await sc(page, ([x, y, z]) => window.__solrift.useBed(x, y, z), [bx, gy, pz]);
check(await until(async () => (await bed(page)).sleeping === 4), 'back in bed');
await until(async () => (await page.locator('#leave-bed').count()) === 1);
await page.locator('#leave-bed').click();
check(await until(async () => (await bed(page)).sleeping === 0, 4000), 'clicking it gets you up');

console.log('skipping the night');
await sc(page, () => window.__solrift.setWeather('rain'));
await sc(page, () => window.__solrift.setTime(0.75));
await sc(page, ([x, y, z]) => window.__solrift.useBed(x, y, z), [bx, gy, pz]);
check(await until(async () => (await bed(page)).sleeping === 4), 'asleep again');
check(await until(async () => (await bed(page)).sleeping === 0, 90000), 'after a few seconds you wake up');
b = await bed(page);
check(b.time < 0.1 || b.time > 0.99, `it is morning (${b.time.toFixed(3)})`);
check(b.weather === 'clear', 'and the rain has stopped');

console.log('a bed to come back to');
await sc(page, ([x, y, z]) => window.__solrift.teleport(x, y, z), [px - 6.5, gy, pz + 6.5]);
await sc(page, () => window.__solrift.damage(100));
check(await until(async () => (await sc(page, () => window.__solrift.screen())) === 'dead'), 'you die far away');
await sc(page, () => window.__solrift.sendCommand({ t: 'respawn' }));
check(await until(async () => (await sc(page, () => window.__solrift.screen())) === 'none'), 'and respawn');
const back = await sc(page, () => window.__solrift.position());
check(Math.hypot(back.x - (bx + 0.5), back.z - (pz - 0.5)) < 2.2, `beside the bed (${back.x.toFixed(1)}, ${back.z.toFixed(1)})`);

console.log('breaking it');
await sc(page, () => window.__solrift.setMode('survival'));
await sc(page, ([x, y, z]) => window.__solrift.breakAt(x, y, z), [bx, gy, pz - 1]);
check(
  (await sc(page, ([x, y, z]) => window.__solrift.getBlock(x, y, z), [bx, gy, pz])) === 0 &&
    (await sc(page, ([x, y, z]) => window.__solrift.getBlock(x, y, z), [bx, gy, pz - 1])) === 0,
  'breaking the head takes the foot with it',
);
await sc(page, ([x, y, z]) => window.__solrift.teleport(x, y, z), [bx + 0.5, gy, pz + 0.5]);
await sc(page, () => {
  window.__solrift.tickDrops(3);
  window.__solrift.gatherDrops();
});
check((await sc(page, (id) => window.__solrift.countOf(id), BED)) === 1, 'and drops exactly one bed');
await sc(page, () => window.__solrift.damage(100));
await until(async () => (await sc(page, () => window.__solrift.screen())) === 'dead');
await sc(page, () => window.__solrift.sendCommand({ t: 'respawn' }));
await until(async () => (await sc(page, () => window.__solrift.screen())) === 'none');
await sleep(300);
check(/missing or obstructed/.test(await toastText(page)), 'without the bed you respawn at the world spawn, and are told');

// ---------------------------------------------------------------------------------------------------
console.log('online');
const online = await open(`?online&debug&name=beduser${Date.now() % 10000}`, 'online');
b = await bed(online);
check(b.sleeping === 0, 'an online player starts awake');
await sc(online, () => window.__solrift.command({ t: 'wake' }));
await sleep(500);
check((await bed(online)).sleeping === 0, 'the wake command is accepted when not in bed');
await online.screenshot({ path: `${outDir}/bed-online.png` });

await browser.close();
const real = errors.filter((e) => !/favicon|WebSocket|ERR_CONNECTION|Failed to load resource/i.test(e));
if (real.length) {
  console.log('console errors:', real);
  failures.push('console errors');
}
if (failures.length) {
  console.log(`BED E2E FAILED (${failures.length})`);
  process.exit(1);
}
console.log('BED E2E passed');
