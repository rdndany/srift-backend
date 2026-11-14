// Bow + sapling E2E: draw and shoot a cow, arrow consumption, and a sapling growing into a tree.
// Usage: node scripts/bow.mjs [url] [outDir]
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const B = { LOG: 6, LEAVES: 7, SAPLING: 36 };
const I = { ARROW: 266, BOW: 303 };

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

await page.goto(url + '/?seed=1337&debug&nomobs', { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 120000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
});

const sc = (fn, ...args) => page.evaluate(fn, ...args);
const shot = async (name, wait = 600) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('saved', name);
};

const pos = await sc(() => window.__solrift.position());
const px = Math.floor(pos.x);
const pz = Math.floor(pos.z);
const gy = await sc(([x, z]) => window.__solrift.surfaceY(x, z), [px, pz]);

await sc(
  ([px, pz, gy]) => {
    const s = window.__solrift;
    for (let x = px - 4; x <= px + 16; x++)
      for (let z = pz - 8; z <= pz + 8; z++) {
        for (let y = gy; y <= gy + 10; y++) s.setBlock(x, y, z, 0);
        s.setBlock(x, gy - 1, z, 3);
        s.setBlock(x, gy - 2, z, 2);
        s.setBlock(x, gy - 3, z, 1);
      }
    s.setTime(0.3);
    s.teleport(px + 0.5, gy, pz + 0.5, -Math.PI / 2, -0.12);
  },
  [px, pz, gy],
);
await page.waitForTimeout(1200);

console.log('bow');
await sc(() => window.__solrift.forceLock());
await sc(
  ([bow, arrow]) => {
    const s = window.__solrift;
    s.clearInventory();
    s.give(bow, 1);
    s.give(arrow, 5);
    s.select(0);
  },
  [I.BOW, I.ARROW],
);
const cow = await sc(([x, y, z]) => window.__solrift.spawnMob('cow', x, y, z), [px + 7.5, gy, pz + 0.5]);
await page.waitForTimeout(300);
const hp0 = await sc((id) => window.__solrift.mobs().find((m) => m.id === id)?.health, cow);

await sc(() => window.__solrift.setRight(true));
await page.waitForTimeout(500);
let half = await sc(() => window.__solrift.bowDraw());
// Slow frames (software rendering) may not have drawn much yet: look again until it has started growing.
for (let i = 0; i < 40 && half <= 0.25; i++) {
  await page.waitForTimeout(100);
  half = await sc(() => window.__solrift.bowDraw());
}
await shot('bow-draw', 700);
// The draw is measured in game time; the software renderer plays that slowly, so wait for it rather than a fixed second.
let full = await sc(() => window.__solrift.bowDraw());
for (let i = 0; i < 60 && full < 0.95; i++) {
  await page.waitForTimeout(250);
  full = await sc(() => window.__solrift.bowDraw());
}
check(half > 0.2 && half < 1, `draw grows while holding (${half.toFixed(2)})`);
check(full >= 0.95, `fully drawn after a second of game time (${full.toFixed(2)})`);
// Cows wander while the bow is drawn: turn to wherever it is now, so the shot does not depend on luck.
await sc(
  ([id, px, pz, gy]) => {
    const s = window.__solrift;
    const c = s.mobs().find((m) => m.id === id);
    if (c) s.teleport(px + 0.5, gy, pz + 0.5, Math.atan2(-(c.x - (px + 0.5)), -(c.z - (pz + 0.5))), -0.12);
  },
  [cow, px, pz, gy],
);
await sc(() => window.__solrift.setRight(false));
await page.waitForTimeout(150);
await shot('bow-fired', 80);
await page.waitForTimeout(900);

const arrows = await sc((a) => window.__solrift.countOf(a), I.ARROW);
const cowNow = await sc((id) => window.__solrift.mobs().find((m) => m.id === id), cow);
check(arrows === 4, `one arrow consumed (${arrows} left)`);
check(!cowNow || cowNow.dead || cowNow.health < hp0, `cow was hit (hp ${hp0} -> ${cowNow ? cowNow.health : 'gone'})`);
check((await sc(() => window.__solrift.bowDraw())) === 0, 'draw resets after release');

// A quick tap shoots nothing (below the minimum draw) and wastes no arrow.
await sc(() => window.__solrift.setRight(true));
await page.waitForTimeout(60);
await sc(() => window.__solrift.setRight(false));
await page.waitForTimeout(300);
check((await sc((a) => window.__solrift.countOf(a), I.ARROW)) === 4, 'a tap does not fire');

// Without arrows the bow does not draw.
await sc((a) => {
  const s = window.__solrift;
  s.clearInventory();
  s.give(a[0], 1);
  s.select(0);
}, [I.BOW]);
await sc(() => window.__solrift.setRight(true));
await page.waitForTimeout(500);
check((await sc(() => window.__solrift.bowDraw())) === 0, 'no arrows: no draw');
await sc(() => window.__solrift.setRight(false));

console.log('sapling');
const sx = px + 3;
const sz = pz + 3;
await sc(
  ([sx, sz, gy, sap]) => {
    const s = window.__solrift;
    s.clearInventory();
    s.give(sap, 2);
    s.select(0);
    s.useOn(sx, gy - 1, sz, 0, 1, 0);
  },
  [sx, sz, gy, B.SAPLING],
);
check((await sc(([x, y, z]) => window.__solrift.getBlock(x, y, z), [sx, gy, sz])) === B.SAPLING, 'sapling placed on grass');
await shot('sapling', 400);
let grew = false;
for (let i = 0; i < 40 && !grew; i++) {
  await sc(() => window.__solrift.growCrops(60));
  grew = (await sc(([x, y, z]) => window.__solrift.getBlock(x, y, z), [sx, gy, sz])) === B.LOG;
}
check(grew, 'sapling grew into a tree');
check((await sc(([x, y, z]) => window.__solrift.getBlock(x, y, z), [sx, gy + 4, sz])) !== 0, 'tree has a crown');
await sc(([px, pz, gy]) => window.__solrift.teleport(px + 0.5, gy, pz + 0.5, -Math.PI / 2 - 0.5, -0.1), [px, pz, gy]);
await shot('tree-grown', 1200);

// A sapling under a roof stays a sapling.
await sc(
  ([sx, sz, gy, sap]) => {
    const s = window.__solrift;
    s.give(sap, 1);
    s.select(0);
    s.useOn(sx + 5, gy - 1, sz, 0, 1, 0);
    for (let x = sx + 4; x <= sx + 6; x++) for (let z = sz - 1; z <= sz + 1; z++) s.setBlock(x, gy + 3, z, 1);
    s.growCrops(100000);
  },
  [sx, sz, gy, B.SAPLING],
);
check((await sc(([x, y, z]) => window.__solrift.getBlock(x, y, z), [sx + 5, gy, sz])) === B.SAPLING, 'blocked sapling does not grow');

check(errors.filter((e) => !/favicon|WebSocket|ERR_CONNECTION/i.test(e)).length === 0, 'no console errors: ' + errors.slice(0, 3).join(' | '));
await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log('bow OK');
