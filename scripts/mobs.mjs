// Mob E2E: rendering lineup, zombie chase + attack, melee kill with loot, skeleton arrows and a
// creeper explosion that carves the ground. Natural spawning is off (?nomobs) for determinism.
// Usage: node scripts/mobs.mjs [url] [outDir]
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

// Tool ids: 270 + kindIndex * 5 + materialIndex (kinds: pickaxe, axe, shovel, sword)
const WOOD_SWORD = 285;
const RAW_MEAT = 262;

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
const shot = async (name, wait = 500) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('saved', name);
};
/** Run the simulation (an open screen keeps it ticking) until `fn` returns truthy in the page. */
const simulateUntil = async (fn, timeout = 60000, ...args) => {
  await sc(() => window.__solrift.openMenu('inventory'));
  try {
    await page.waitForFunction(fn, args[0], { timeout });
    return true;
  } catch {
    return false;
  } finally {
    await sc(() => window.__solrift.closeMenu());
  }
};

const pos = await sc(() => window.__solrift.position());
const px = Math.floor(pos.x);
const pz = Math.floor(pos.z);
const gy = await sc(([x, z]) => window.__solrift.surfaceY(x, z), [px, pz]);

// Large flat arena so mobs can walk freely.
await sc(
  ([px, pz, gy]) => {
    const s = window.__solrift;
    for (let x = px - 6; x <= px + 16; x++)
      for (let z = pz - 10; z <= pz + 10; z++) {
        for (let y = gy; y <= gy + 8; y++) s.setBlock(x, y, z, 0);
        s.setBlock(x, gy - 1, z, 3); // grass
        s.setBlock(x, gy - 2, z, 1);
        s.setBlock(x, gy - 3, z, 1);
      }
    s.setTime(0.75); // night: zombies and skeletons don't burn
    s.teleport(px + 0.5, gy, pz + 0.5, -Math.PI / 2, -0.12);
  },
  [px, pz, gy],
);
await page.waitForTimeout(1000);
const ground = (await sc(() => window.__solrift.position())).y;
console.log('arena ground y =', ground);

console.log('rendering');
await sc(
  ([px, pz, ground]) => {
    const s = window.__solrift;
    ['pig', 'cow', 'zombie', 'skeleton', 'creeper'].forEach((k, i) => s.spawnMob(k, px + 4.5, ground, pz + 0.5 + (i - 2) * 1.8));
  },
  [px, pz, ground],
);
await page.waitForTimeout(400);
check((await sc(() => window.__solrift.mobs())).length === 5, 'five mob kinds spawned');
await shot('mobs-lineup', 600);
await sc(() => window.__solrift.clearMobs());

console.log('zombie chase');
await sc(([px, pz, ground]) => window.__solrift.spawnMob('zombie', px + 12.5, ground, pz + 0.5), [px, pz, ground]);
const startHp = (await sc(() => window.__solrift.vitals())).health;
const hurt = await simulateUntil(() => window.__solrift.vitals().health < 20);
check(hurt, 'a zombie walks up to the player and hits them');
const zombie = (await sc(() => window.__solrift.mobs()))[0];
check(zombie && Math.hypot(zombie.x - (px + 0.5), zombie.z - (pz + 0.5)) < 2.5, 'the zombie is next to the player');
await shot('zombie-attack', 300);
await sc(() => window.__solrift.clearMobs());
await sc(() => window.__solrift.setHealth(20));

console.log('melee + loot');
await sc(
  ([px, pz, ground, sword]) => {
    const s = window.__solrift;
    s.clearInventory();
    s.give(sword, 1);
    s.select(0);
    s.teleport(px + 0.5, ground, pz + 0.5, -Math.PI / 2, -0.4);
    s.spawnMob('pig', px + 2.4, ground, pz + 0.5);
  },
  [px, pz, ground, WOOD_SWORD],
);
await page.waitForTimeout(500);
let swings = 0;
for (let i = 0; i < 4; i++) {
  const hit = await sc(() => window.__solrift.swing());
  if (hit !== null) swings++;
  if ((await sc(() => window.__solrift.mobs())).every((m) => m.dead)) break;
  await page.waitForTimeout(80);
}
check(swings >= 1, `swinging with a sword hits the pig (${swings} swing(s))`);
check((await sc(() => window.__solrift.mobs())).some((m) => m.dead), 'the pig dies after a few sword hits');
check((await sc(() => window.__solrift.inventory()))[0][2] === swings, 'each hit costs the sword one durability');
check((await sc(() => window.__solrift.drops())) > 0, 'the pig drops loot');
await sc(() => {
  window.__solrift.tickDrops(3);
  window.__solrift.gatherDrops();
});
check((await sc((id) => window.__solrift.countOf(id), RAW_MEAT)) >= 1, 'raw meat is collected');
await sc(() => window.__solrift.clearMobs());

console.log('skeleton');
await sc(([px, pz, ground]) => window.__solrift.spawnMob('skeleton', px + 9.5, ground, pz + 0.5), [px, pz, ground]);
const shot1 = await simulateUntil(() => window.__solrift.arrows() > 0 || window.__solrift.vitals().health < 20);
check(shot1, 'a skeleton shoots arrows at the player');
await shot('skeleton-arrow', 200);
await sc(() => window.__solrift.clearMobs());
await sc(() => window.__solrift.setHealth(20));

console.log('creeper');
await sc(
  ([px, pz, ground]) => {
    const s = window.__solrift;
    s.clearInventory();
    s.teleport(px + 0.5, ground, pz + 0.5, -Math.PI / 2, -0.35);
    s.spawnMob('creeper', px + 7.5, ground, pz + 0.5);
  },
  [px, pz, ground],
);
// Track where the creeper was when it blew up.
await sc(() => {
  window.__lastCreeper = null;
  setInterval(() => {
    const c = window.__solrift.mobs().find((m) => m.kind === 'creeper' && !m.dead);
    if (c) window.__lastCreeper = { x: c.x, y: c.y, z: c.z };
  }, 50);
});
const boomed = await simulateUntil(() => window.__solrift.mobs().every((m) => m.dead) || window.__solrift.mobs().length === 0);
check(boomed, 'the creeper walks up and explodes');
const where = await sc(() => window.__lastCreeper);
check(!!where, 'creeper position was tracked');
if (where) {
  const below = await sc(([x, y, z]) => window.__solrift.getBlock(Math.floor(x), Math.floor(y) - 1, Math.floor(z)), [where.x, where.y, where.z]);
  check(below === 0, 'the explosion carved a crater under the creeper');
}
check((await sc(() => window.__solrift.vitals())).health < 20, 'the blast hurt the player');
await sc(() => window.__solrift.teleport(window.__solrift.position().x, window.__solrift.position().y + 3, window.__solrift.position().z, -Math.PI / 2, -0.7));
await shot('creeper-crater', 900);

await browser.close();
if (errors.length) {
  console.log('console errors:', errors);
  process.exit(1);
}
if (failures.length) {
  console.log(`${failures.length} mob check(s) failed`);
  process.exit(1);
}
console.log('mobs OK');
