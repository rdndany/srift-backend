// View E2E: the first-person hand with armor on, and the third-person views of your own character (F5).
// Usage: node scripts/view.mjs [url] [outDir]
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const armorId = (material, slot) => 310 + material * 4 + slot; // leather, gold, iron, diamond / helmet .. boots
const IRON = 2, DIAMOND = 3;
const IRON_SWORD = 287;
const BOW = 303;

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
const shot = async (name, wait = 500) => {
  await sleep(wait);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('saved', name);
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// A flat clearing with a few landmarks, so the pictures are readable.
const pos = await sc(() => window.__solrift.position());
const px = Math.floor(pos.x);
const pz = Math.floor(pos.z);
const gy = await sc(([x, z]) => window.__solrift.surfaceY(x, z), [px, pz]);
await sc(
  ([px, pz, gy]) => {
    const s = window.__solrift;
    for (let x = px - 12; x <= px + 12; x++)
      for (let z = pz - 12; z <= pz + 12; z++) {
        for (let y = gy; y <= gy + 12; y++) s.setBlock(x, y, z, 0);
        s.setBlock(x, gy - 1, z, 3);
        s.setBlock(x, gy - 2, z, 2);
        s.setBlock(x, gy - 3, z, 1);
      }
    // Pillars of stone and planks around, to give the camera something to look at.
    for (let y = gy; y < gy + 4; y++) {
      s.setBlock(px - 3, y, pz - 5, 1);
      s.setBlock(px + 3, y, pz - 5, 10);
      s.setBlock(px, y, pz - 8, 1);
    }
    s.setTime(0.3);
    s.teleport(px + 0.5, gy, pz + 0.5, 0, -0.1);
  },
  [px, pz, gy],
);
await sleep(1500);
const body = { x: px + 0.5, y: gy, z: pz + 0.5 };
const eyeY = body.y + 1.62;
const cam = () => sc(() => window.__solrift.cameraAt());
const view = () => sc(() => window.__solrift.view());
const wear = async (ids) => {
  for (const id of ids) {
    await sc((i) => window.__solrift.give(i, 1), id);
    const slot = await sc((i) => window.__solrift.inventory().findIndex((s) => s && s[0] === i), id);
    await sc((n) => window.__solrift.select(n), slot);
    await sc(() => window.__solrift.equipHeld());
  }
};
const hold = async (id) => {
  await sc((i) => window.__solrift.give(i, 1), id);
  const slot = await sc((i) => window.__solrift.inventory().findIndex((s) => s && s[0] === i), id);
  await sc((n) => window.__solrift.select(n), slot);
};

console.log('first person');
check((await view()) === 0, 'starts in first person');
await sleep(300);
let c = await cam();
check(Math.abs(c.y - eyeY) < 0.05 && Math.abs(c.x - body.x) < 0.05, 'the camera is at the eyes');
await shot('view-fp-bare', 300);

console.log('the first-person hand while wearing armor');
await wear([armorId(DIAMOND, 1)]);
await sc(() => window.__solrift.select(8));
await shot('view-fp-armor-empty', 400);
await sc(() => window.__solrift.swingHand());
await shot('view-fp-armor-swing', 120);
await hold(IRON_SWORD);
await shot('view-fp-armor-sword', 500);
await sc(() => window.__solrift.give(1, 1));
const stoneSlot = await sc(() => window.__solrift.inventory().findIndex((s) => s && s[0] === 1));
await sc((n) => window.__solrift.select(n), stoneSlot);
await shot('view-fp-armor-block', 500);

console.log('third person (F5)');
await hold(IRON_SWORD);
await page.keyboard.press('F5');
check(await until(async () => (await view()) === 1), 'F5 goes to third person from behind');
await sleep(400);
c = await cam();
const eye = { x: body.x, y: eyeY, z: body.z };
const distBehind = dist(c, eye);
// (5.2 behind, 0.7 to the side and 0.6 up: see BEHIND_DISTANCE, SHOULDER_SIDE and SHOULDER_UP in chaseCamera.ts)
check(Math.abs(distBehind - Math.hypot(5.2, 0.7, 0.6)) < 0.2, `the camera is about 5.3 blocks from the head: behind it and over the shoulder (${distBehind.toFixed(2)})`);
check(c.z > body.z + 3, 'and behind a player who faces -z');
await shot('view-third-back-plain', 300);

await sc(() => window.__solrift.give(310 + 12, 1)); // diamond helmet
await wear([armorId(DIAMOND, 0), armorId(DIAMOND, 2), armorId(IRON, 3)]);
await hold(IRON_SWORD);
await shot('view-third-back-armor', 600);
await sc(() => window.__solrift.swingHand());
await shot('view-third-back-swing', 100);

// Looking around: the camera follows and the body turns after the head.
await sc(() => window.__solrift.look(0.9, -0.25));
await shot('view-third-look', 500);
c = await cam();
check(Math.abs(dist(c, eye) - distBehind) < 0.5, 'the camera orbits the head at about the same distance');

// Walking: the legs and arms swing.
await sc(() => window.__solrift.look(0, -0.1));
await sc(() => window.__solrift.holdKey('KeyW', true));
await sleep(500);
await shot('view-third-walk', 150);
await sc(() => window.__solrift.holdKey('KeyW', false));

await page.keyboard.press('F5');
check(await until(async () => (await view()) === 2), 'F5 again looks at you from the front');
await sleep(400);
c = await cam();
check(c.z < body.z - 3 || c.z < (await sc(() => window.__solrift.position())).z - 3, 'the front camera is ahead of the player');
await shot('view-third-front', 500);
await sc(() => window.__solrift.look(2.4, 0.3));
await shot('view-third-front-turned', 500);
await sc(() => window.__solrift.look(0, -0.1));

await page.keyboard.press('F5');
check(await until(async () => (await view()) === 0), 'a third F5 is back to first person');
await sleep(300);
c = await cam();
const p2 = await sc(() => window.__solrift.position());
check(Math.abs(c.y - (p2.y + 1.62)) < 0.05, 'the camera is back at the eyes');

console.log('a wall behind you');
await sc(
  ([px, pz, gy]) => {
    const s = window.__solrift;
    s.teleport(px + 0.5, gy, pz + 0.5, 0, 0);
    for (let x = px - 3; x <= px + 3; x++) for (let y = gy; y <= gy + 5; y++) s.setBlock(x, y, pz + 3, 1);
  },
  [px, pz, gy],
);
await sleep(400);
await sc(() => window.__solrift.setView(1));
await sleep(400);
c = await cam();
check(c.z < pz + 3, `the camera stops in front of the wall (z ${c.z.toFixed(2)} < ${pz + 3})`);
check(dist(c, { x: px + 0.5, y: gy + 1.62, z: pz + 0.5 }) < 3.4, 'it is pulled in toward the head');
await shot('view-third-wall', 300);
// The camera must stay out of the wall even when looking up and down.
let inside = false;
for (const pitch of [-1.4, -0.7, 0.4, 1.2]) {
  await sc((p) => window.__solrift.look(0, p), pitch);
  await sleep(200);
  const k = await cam();
  const id = await sc(([x, y, z]) => window.__solrift.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)), [k.x, k.y, k.z]);
  if (id !== 0) inside = true;
}
check(!inside, 'the camera never ends up inside a block');
await sc(() => window.__solrift.setView(0));

console.log('with a bow');
await sc(() => window.__solrift.setView(1));
await sc(() => window.__solrift.look(0, -0.1));
await hold(BOW);
await shot('view-third-bow', 600);
await sc(() => window.__solrift.setView(0));

await browser.close();
const real = errors.filter((e) => !/favicon|WebSocket|ERR_CONNECTION|Failed to load resource/i.test(e));
if (real.length) {
  console.log('console errors:', real);
  failures.push('console errors');
}
if (failures.length) {
  console.log(`VIEW E2E FAILED (${failures.length})`);
  process.exit(1);
}
console.log('VIEW E2E passed');
