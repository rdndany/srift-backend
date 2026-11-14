// World E2E: caves, lava, dungeons with spawners and loot chests, mineshafts, falling sand, cactus.
// Natural spawning is off (?nomobs) for determinism.
// Usage: node scripts/world.mjs [url] [outDir]
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const B = { AIR: 0, STONE: 1, SAND: 4, CHEST: 22, TORCH: 23, LAVA: 37, MOSSY_COBBLE: 38, SPAWNER: 39, CACTUS: 40, PLANKS: 10 };

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
  window.__solrift.forceLock();
  window.__solrift.setTime(0.3);
});

const sc = (fn, ...args) => page.evaluate(fn, ...args);
const shot = async (name, wait = 900) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('saved', name);
};
const at = (x, y, z) => sc(([x, y, z]) => window.__solrift.getBlock(x, y, z), [x, y, z]);
const yawTo = (fx, fz, tx, tz) => Math.atan2(-(tx - fx), -(tz - fz));

/** Visit a column first from above so its chunks are streamed in, then go to the real spot. */
async function goTo(x, y, z, yaw = 0, pitch = 0) {
  await sc(([x, z]) => window.__solrift.teleport(x + 0.5, 230, z + 0.5), [x, z]);
  await page.waitForTimeout(2500);
  await sc(([x, y, z, yaw, pitch]) => window.__solrift.teleport(x, y, z, yaw, pitch), [x, y, z, yaw, pitch]);
  await page.waitForTimeout(800);
}

// A creative player does not die; we switch to survival for the damage checks.
await sc(() => window.__solrift.setMode('creative'));

console.log('caves');
const cave = await sc(() => window.__solrift.findCavePoint('cave', 0, 0));
check(cave !== null, `the generator has roomy caves near the origin (${JSON.stringify(cave)})`);
await goTo(cave.x + 0.5, cave.y, cave.z + 0.5, 0.6, -0.1);
check((await at(cave.x, cave.y, cave.z)) === B.AIR, 'a cave is open air where the generator says');
await sc(([x, y, z]) => { const s = window.__solrift; s.setBlock(x + 1, y, z, 23); s.setBlock(x - 2, y, z + 2, 23); s.setBlock(x + 3, y, z - 3, 23); }, [cave.x, cave.y, cave.z]);
await shot('world-cave', 3000);

console.log('lava');
const lava = await sc(() => window.__solrift.findCavePoint('lava', 0, 0));
check(lava !== null, `there is lava deep underground (${JSON.stringify(lava)})`);
await goTo(lava.x + 0.5, lava.y + 3, lava.z + 3.5, yawTo(lava.x + 0.5, lava.z + 3.5, lava.x + 0.5, lava.z + 0.5), -0.4);
await shot('world-lava', 3500);

console.log('dungeon');
const d = await sc(() => window.__solrift.nearestStructure('dungeon', 0, 0));
check(d && d.chests.length >= 1, `a dungeon with chests exists near the origin (${JSON.stringify(d)})`);
await goTo(d.x, 230, d.z, 0, 0);
await page.waitForFunction(([x, y, z]) => window.__solrift.getBlock(x, y, z) === 39, [d.x, d.y, d.z], { timeout: 30000 });
check((await at(d.x, d.y, d.z)) === B.SPAWNER, 'the spawner cage stands in the middle of the room');
const [cx, cy, cz] = d.chests[0].split(',').map(Number);
check((await at(cx, cy, cz)) === B.CHEST, 'a chest stands against the wall');
// Floor of cobblestone and mossy cobblestone.
const floor = [];
for (let i = -2; i <= 2; i++) floor.push(await at(d.x + i, d.y - 1, d.z + 1));
check(floor.every((b) => b > 0), 'the floor is solid');
// A torch so the picture is not black (rooms are dark, as in the original).
await sc(([x, y, z]) => window.__solrift.setBlock(x, y, z, 23), [d.x + 1, d.y, d.z + 1]);
await goTo(d.x + 0.5, d.y, d.z + 1.5, yawTo(d.x + 0.5, d.z + 1.5, cx + 0.5, cz + 0.5), -0.3);
await shot('world-dungeon');

await goTo(d.x + 0.5, d.y, d.z + 2.2, yawTo(d.x + 0.5, d.z + 2.2, d.x + 0.5, d.z + 0.5), -0.1);
await shot('world-spawner');

const first = await sc(([x, y, z]) => window.__solrift.chestContents(x, y, z), [cx, cy, cz]);
const stacks = first.filter(Boolean);
check(stacks.length >= 3, `the chest holds loot the first time it is opened (${stacks.length} stacks)`);
const again = await sc(([x, y, z]) => window.__solrift.chestContents(x, y, z), [cx, cy, cz]);
check(JSON.stringify(first) === JSON.stringify(again), 'opening it again shows the same items');
const [bx, by, bz] = d.chests[1] ? d.chests[1].split(',').map(Number) : [cx, cy, cz];
if (d.chests[1]) {
  const other = await sc(([x, y, z]) => window.__solrift.chestContents(x, y, z), [bx, by, bz]);
  check(JSON.stringify(other) !== JSON.stringify(first), 'two chests roll different loot');
}

console.log('mineshaft');
const m = await sc(() => window.__solrift.nearestStructure('mineshaft', 0, 0));
check(m !== null, `a mineshaft exists near the origin (${JSON.stringify(m)})`);
await goTo(m.x, 230, m.z, 0, 0);
await page.waitForTimeout(1500);
const passable = (id) => [B.AIR, 47, 48, 49].includes(id); // air, a cobweb, or a rail
check(passable(await at(m.x, m.y, m.z)) && passable(await at(m.x, m.y + 1, m.z)), 'the corridor is open three blocks high');
check((await at(m.x, m.y - 1, m.z)) !== B.AIR, 'with a floor under it');
let timber = 0;
for (let i = -30; i <= 30; i++) {
  if ((await at(m.x + i, m.y + 2, m.z)) === B.PLANKS || (await at(m.x, m.y + 2, m.z + i)) === B.PLANKS) timber++;
}
check(timber > 3, `timber supports line the corridor (${timber} beams)`);
await goTo(m.x + 0.5, m.y, m.z + 0.5, 0, 0);
await sc(([x, y, z]) => window.__solrift.setBlock(x, y, z, 23), [m.x + 1, m.y, m.z + 1]);
await shot('world-mineshaft');

console.log('lava burns');
await goTo(lava.x + 0.5, lava.y + 4, lava.z + 3.5, 0, 0);
await sc(() => {
  const s = window.__solrift;
  s.setMode('survival');
});
const hp0 = await sc(() => window.__solrift.hp());
await sc(([x, y, z]) => window.__solrift.teleport(x + 0.5, y + 0.2, z + 0.5), [lava.x, lava.y, lava.z]);
await page.waitForFunction(() => window.__solrift.hp() < 20 || window.__solrift.screen() === 'dead', undefined, { timeout: 15000 });
const hp1 = await sc(() => window.__solrift.hp());
check(hp1 < hp0, `standing in lava hurts (${hp0} -> ${hp1})`);
check((await sc(() => window.__solrift.lastDamage())) === 'lava', 'and the damage is recorded as lava');
await sc(() => {
  const s = window.__solrift;
  s.setMode('creative');
});

console.log('falling sand');
const px = lava.x + 40;
const pz = lava.z;
await goTo(px, 230, pz, 0, 0);
const gy = await sc(([x, z]) => window.__solrift.surfaceY(x, z), [px, pz]);
await sc(
  ([px, gy, pz]) => {
    const s = window.__solrift;
    for (let y = gy; y <= gy + 8; y++) for (let x = px - 2; x <= px + 2; x++) for (let z = pz - 2; z <= pz + 2; z++) s.setBlock(x, y, z, 0);
    s.setBlock(px, gy + 5, pz, 1); // a floating stone block to build against
    s.clearInventory();
    s.give(4, 4);
    s.select(0);
    s.teleport(px + 0.5, gy, pz + 3.5, 0, -0.3);
  },
  [px, gy, pz],
);
check(await sc(([x, y, z]) => window.__solrift.useOn(x, y, z, 1, 0, 0), [px, gy + 5, pz]), 'sand can be placed beside a floating block');
check((await at(px + 1, gy + 5, pz)) === B.SAND || (await at(px + 1, gy + 4, pz)) === B.SAND, 'it is there right after placing');
await page.waitForTimeout(2500);
check((await at(px + 1, gy + 5, pz)) === B.AIR, 'the unsupported sand left its place');
check((await at(px + 1, gy, pz)) === B.SAND || (await at(px + 1, gy - 1, pz)) === B.SAND, 'and landed on the ground');
await shot('world-falling-sand');

console.log('cactus');
// Software rendering crawls with the whole explored area drawn; a short view keeps the simulation near real time.
await sc(() => window.__solrift.setRenderDistance(3));
await page.waitForTimeout(1500);
await sc(
  ([px, gy, pz]) => {
    const s = window.__solrift;
    for (let x = px - 2; x <= px + 6; x++) for (let z = pz - 2; z <= pz + 2; z++) s.setBlock(x, gy - 1, z, 4);
    for (let k = 0; k < 3; k++) s.setBlock(px + 3, gy + k, pz, 40);
    s.teleport(px + 1.5, gy, pz + 0.5, -Math.PI / 2, -0.15);
  },
  [px, gy, pz],
);
await shot('world-cactus', 500);
await sc(() => window.__solrift.setMode('survival'));
await sc(([px, gy, pz]) => window.__solrift.teleport(px + 4.32, gy, pz + 0.5), [px, gy, pz]);
// Regeneration can mask a single prick in the health bar, so wait for the cause of the last damage instead.
await page.waitForFunction(() => window.__solrift.lastDamage() === 'cactus', undefined, { timeout: 30000 });
check((await sc(() => window.__solrift.lastDamage())) === 'cactus', 'a cactus pricks whoever touches it');

check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('world E2E ok');
