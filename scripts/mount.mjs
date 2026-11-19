// Mount E2E (single player): put a Fenrir horn in the mount slot, summon it with the key (the cast, the interruption), ride it
// in first person (the view stays there and the beast's head is in front), use its two skills on the mouse buttons, get off,
// and take pictures of all four from outside.
// Usage: node scripts/mount.mjs [url] [outDir]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:3000';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
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

const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${url}/?seed=1337&debug&nomobs`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
});
const sc = (fn, ...args) => page.evaluate(fn, ...args);
const shot = async (name, wait = 400, full = false) => {
  await sleep(wait);
  await page.screenshot(full ? { path: `${outDir}/${name}.png` } : { path: `${outDir}/${name}.png`, clip: { x: 240, y: 100, width: 800, height: 520 } });
  console.log('saved', name);
};

// A flat clearing.
const pos = await sc(() => window.__solrift.position());
const px = Math.floor(pos.x);
const pz = Math.floor(pos.z);
const gy = await sc(([x, z]) => window.__solrift.surfaceY(x, z), [px, pz]);
await sc(
  ([px, pz, gy]) => {
    const s = window.__solrift;
    for (let x = px - 40; x <= px + 40; x++)
      for (let z = pz - 40; z <= pz + 40; z++) {
        for (let y = gy; y <= gy + 14; y++) s.setBlock(x, y, z, 0);
        s.setBlock(x, gy - 1, z, 3);
        s.setBlock(x, gy - 2, z, 2);
        s.setBlock(x, gy - 3, z, 1);
      }
    s.setTime(0.3);
    s.teleport(px + 0.5, gy, pz + 0.5, 0, -0.1);
  },
  [px, pz, gy],
);
await sleep(1500);
const state = () => sc(() => window.__solrift.mountState());
const speed = async () => {
  const a = await sc(() => window.__solrift.position());
  await sleep(1000);
  const b = await sc(() => window.__solrift.position());
  return Math.hypot(b.x - a.x, b.z - a.z);
};

console.log('on foot');
await sc(() => window.__solrift.holdKey('KeyW', true));
await sleep(900);
const walk = await speed();
await sc(() => window.__solrift.holdKey('KeyW', false));
await sleep(1500);
await sc(([x, z, y]) => window.__solrift.teleport(x + 0.5, y, z + 0.5, 0, -0.1), [px, pz, gy]);
await sleep(1200);
check((await page.locator('#mount-slot').count()) === 0, 'no mount icon until you are riding');
check((await state()).pick === 0, 'and it is empty');
await shot('mount-slot-empty', 100, true);

console.log('put the horn in the slot and summon');
await sc(() => window.__solrift.learnMount('fenrir'));
await sleep(300);
check((await state()).pick === 1, 'the horn is in the slot');
await page.keyboard.press('KeyH');
await sleep(500);
await shot('mount-cast', 200);
check((await state()).mount === 0, 'still on foot while the cast runs');
check(await until(async () => (await state()).mount > 0, 20000), 'after the cast, mounted');
check((await sc(() => window.__solrift.view())) === 0, 'the view stays first person');
check((await page.locator('#player-frame .pf-buff.mount').count()) === 1, 'the mount shows in the buff row');
check((await page.locator('[data-testid=mount-bar] .cb-slot').count()) === 2, 'two skill buttons are on the bar');
await shot('mount-fp-idle', 600, true);
await sc(() => window.__solrift.look(0.5, -0.1));
await shot('mount-fp-turn', 300, true);
await sc(() => window.__solrift.look(0, -0.1));

console.log('speed');
await sc(() => window.__solrift.holdKey('KeyW', true));
await sleep(700);
const v = await speed();
check(v > walk * 1.4, `the mount is faster than walking (${v.toFixed(1)} against ${walk.toFixed(1)} blocks per second)`);
await shot('mount-fp-run', 100, true);
await sc(() => window.__solrift.holdKey('KeyW', false));
await sleep(600);

console.log('the skills');
await sc(() => window.__solrift.look(0, -0.05));
await sc(() => window.__solrift.setLeft(true));
await sleep(350);
await shot('mount-fp-bite', 0, true);
await sc(() => window.__solrift.setLeft(false));
check((await state()).cd[0] > 0, 'the bite is on cooldown');
await sleep(900);
await sc(() => window.__solrift.setRight(true));
await sleep(250);
await sc(() => window.__solrift.setRight(false));
await shot('mount-fp-howl', 150, true);
check((await state()).cd[1] > 0, 'the howl is on cooldown');
await sleep(1500);

console.log('outside');
await sc(() => window.__solrift.setView(1));
await sleep(600);
await shot('mount-3p-back', 200);
await sc(() => window.__solrift.setView(2));
await shot('mount-front', 600);
await sc(() => window.__solrift.look(1.4, -0.1));
await shot('mount-side', 800);
await sc(() => window.__solrift.look(0, -0.1));
await sc(() => window.__solrift.setView(0));

console.log('dismount');
await page.keyboard.press('KeyH');
check(await until(async () => (await state()).mount === 0, 15000), 'H again gets off');
await sleep(500);

console.log('interrupted by moving');
await page.keyboard.press('KeyH');
await sleep(500);
await sc(() => window.__solrift.holdKey('KeyW', true));
await sleep(900);
await sc(() => window.__solrift.holdKey('KeyW', false));
await sleep(1500);
check((await state()).mount === 0, 'moving while casting stops the summoning');

console.log('the other three');
for (const id of ['fenrir_black', 'fenrir_blue', 'fenrir_gold']) {
  await sleep(2000);
  await sc((i) => window.__solrift.learnMount(i), id);
  await page.keyboard.press('KeyH');
  check(await until(async () => (await state()).mount > 0, 60000), `${id} summoned`);
  await sc(() => window.__solrift.setView(2));
  await sc(() => window.__solrift.look(0.7, -0.12));
  await shot(`mount-${id}`, 1400);
  await sc(() => window.__solrift.setView(0));
  await page.keyboard.press('KeyH');
  await until(async () => (await state()).mount === 0, 15000);
  await sc(() => window.__solrift.look(0, -0.1));
  await sleep(300);
}

await browser.close();
const real = errors.filter((e) => !/favicon|WebSocket|ERR_CONNECTION|Failed to load resource/i.test(e));
if (real.length) {
  console.log('console errors:', real);
  failures.push('console errors');
}
if (failures.length) {
  console.log(`MOUNT E2E FAILED (${failures.length})`);
  process.exit(1);
}
console.log('MOUNT E2E passed');
