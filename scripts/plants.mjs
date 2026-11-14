// Plants E2E: flowers/grass rendering, torches (floor + wall, light, support), hoe + farmland,
// seeds, crop growth and harvest. Natural spawning is off (?nomobs) for determinism.
// Usage: node scripts/plants.mjs [url] [outDir]
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const B = { STONE: 1, GRASS: 3, TORCH: 23, TORCH_PX: 24, TALL_GRASS: 28, ROSE: 29, DANDELION: 30, FARMLAND: 31, WHEAT_0: 32, WHEAT_3: 35 };
const I = { WHEAT_SEEDS: 268, WHEAT: 269 };
const WOOD_HOE = 290; // 270 + kindIndex(hoe = 4) * 5 + material(wood = 0)

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
const G = gy - 1; // ground (grass) layer; plants live at y = G + 1

// Flat grass arena.
await sc(
  ([px, pz, gy]) => {
    const s = window.__solrift;
    for (let x = px - 4; x <= px + 14; x++)
      for (let z = pz - 8; z <= pz + 8; z++) {
        for (let y = gy; y <= gy + 6; y++) s.setBlock(x, y, z, 0);
        s.setBlock(x, gy - 1, z, 3);
        s.setBlock(x, gy - 2, z, 2);
        s.setBlock(x, gy - 3, z, 1);
      }
    s.setTime(0.3);
    s.teleport(px + 0.5, gy, pz + 0.5, -Math.PI / 2, -0.35);
  },
  [px, pz, gy],
);
await page.waitForTimeout(1200);
const at = (x, y, z) => sc(([x, y, z]) => window.__solrift.getBlock(x, y, z), [x, y, z]);

console.log('flowers and grass');
await sc(
  ([px, pz, G, B]) => {
    const s = window.__solrift;
    for (let x = 3; x <= 9; x++)
      for (let z = -6; z <= -1; z++) {
        const v = (x * 7 + z * 13) & 7;
        if (v < 4) s.setBlock(px + x, G + 1, pz + z, B.TALL_GRASS);
        else if (v === 4) s.setBlock(px + x, G + 1, pz + z, B.ROSE);
        else if (v === 5) s.setBlock(px + x, G + 1, pz + z, B.DANDELION);
      }
  },
  [px, pz, G, B],
);
check((await at(px + 3, G + 1, pz - 5)) === B.ROSE, 'plants were placed');

console.log('hoe + seeds');
await sc(
  ([hoe, seeds]) => {
    const s = window.__solrift;
    s.clearInventory();
    s.give(hoe, 1);
    s.give(seeds, 12);
    s.select(0);
  },
  [WOOD_HOE, I.WHEAT_SEEDS],
);
const field = [];
for (let x = 4; x <= 8; x++) for (let z = 2; z <= 3; z++) field.push([px + x, pz + z]);
const [fx, fz] = field[0];
check(await sc(([x, y, z]) => window.__solrift.useOn(x, y, z, 0, 1, 0), [fx, G, fz]), 'the hoe tills grass');
check((await at(fx, G, fz)) === B.FARMLAND, 'the block became farmland');
const wornHoe = await sc(() => window.__solrift.inventory()[0]);
check(wornHoe && wornHoe[2] === 1, 'tilling wears the hoe');
for (const [x, z] of field.slice(1)) await sc(([x, y, z]) => window.__solrift.useOn(x, y, z, 0, 1, 0), [x, G, z]);
check((await at(fx + 4, G, fz + 1)) === B.FARMLAND, 'a whole field is tilled');

await sc(() => window.__solrift.select(1));
check(
  !(await sc(([x, y, z]) => window.__solrift.useOn(x, y, z, 0, 1, 0), [px + 2, G, pz + 5])),
  'seeds do not take on plain grass',
);
for (const [x, z] of field) await sc(([x, y, z]) => window.__solrift.useOn(x, y, z, 0, 1, 0), [x, G, z]);
check((await at(fx, G + 1, fz)) === B.WHEAT_0, 'seeds plant a sprout on farmland');
check((await sc((id) => window.__solrift.countOf(id), I.WHEAT_SEEDS)) === 12 - field.length, 'planting consumes seeds');

// Show every growth stage in a row next to the field.
await sc(
  ([px, pz, G]) => {
    const s = window.__solrift;
    for (let i = 0; i < 4; i++) {
      s.setBlock(px + 4 + i, G, pz + 5, 31);
      s.setBlock(px + 4 + i, G + 1, pz + 5, 32 + i);
    }
  },
  [px, pz, G],
);
await shot('plants-garden', 800);

console.log('crop growth');
let ripe = false;
for (let i = 0; i < 60 && !ripe; i++) {
  await sc(() => window.__solrift.growCrops(40));
  ripe = (await at(fx, G + 1, fz)) === B.WHEAT_3;
}
check(ripe, 'wheat grows through every stage to ripe');
await shot('plants-ripe', 800);

console.log('harvest');
const near = (x, z) => sc(([x, y, z]) => window.__solrift.teleport(x + 0.5, y, z + 0.5), [x, G + 1, z]);
await near(fx, fz - 1);
await sc(() => window.__solrift.clearInventory());
await sc(([x, y, z]) => window.__solrift.breakAt(x, y, z), [fx, G + 1, fz]);
console.log('  drops in world:', await sc(() => window.__solrift.drops()), 'mode', await sc(() => window.__solrift.mode()));
await sc(() => {
  window.__solrift.tickDrops(4);
  window.__solrift.gatherDrops();
});
console.log('  inventory:', JSON.stringify(await sc(() => window.__solrift.inventory().filter(Boolean))));
check((await sc((id) => window.__solrift.countOf(id), I.WHEAT)) === 1, 'ripe wheat drops wheat');
check((await sc((id) => window.__solrift.countOf(id), I.WHEAT_SEEDS)) >= 1, 'ripe wheat drops seeds');
check((await at(fx, G + 1, fz)) === 0, 'the crop is gone');

// Young crops give back a seed; digging out the soil pops the crop off.
const [gx, gz] = field[2];
await near(gx, gz - 1);
await sc(() => window.__solrift.clearInventory());
await sc(([x, y, z]) => window.__solrift.breakAt(x, y, z), [gx, G, gz]);
check((await at(gx, G + 1, gz)) === 0, 'the sprout pops off when its farmland is dug up');
await sc(() => {
  window.__solrift.tickDrops(4);
  window.__solrift.gatherDrops();
});
check((await sc((id) => window.__solrift.countOf(id), I.WHEAT_SEEDS)) >= 1, 'the popped sprout drops a seed');

console.log('torches');
await sc(
  ([px, pz, G, torch, stone]) => {
    const s = window.__solrift;
    s.clearInventory();
    s.give(torch, 8);
    s.give(stone, 4);
    s.select(0);
    // A stone pillar to hang a torch from.
    for (let y = 1; y <= 3; y++) s.setBlock(px + 8, G + y, pz - 3, stone);
  },
  [px, pz, G, B.TORCH, B.STONE],
);
check(await sc(([x, y, z]) => window.__solrift.useOn(x, y, z, 0, 1, 0), [px + 6, G, pz - 3]), 'a torch stands on the ground');
check((await at(px + 6, G + 1, pz - 3)) === B.TORCH, 'it is an upright torch');
check(await sc(([x, y, z]) => window.__solrift.useOn(x, y, z, -1, 0, 0), [px + 8, G + 2, pz - 3]), 'a torch sticks to a wall');
check((await at(px + 7, G + 2, pz - 3)) === B.TORCH_PX, 'it is a wall torch attached to the pillar (+x side)');
check(!(await sc(([x, y, z]) => window.__solrift.useOn(x, y, z, 0, -1, 0), [px + 8, G + 3, pz - 3])), 'torches cannot hang from ceilings');

await near(px + 7, pz - 2);
// Remove the pillar block that holds the wall torch: it must drop as a torch.
await sc(() => {
  window.__solrift.setMode('survival');
  window.__solrift.clearInventory();
});
await sc(([x, y, z]) => window.__solrift.breakAt(x, y, z), [px + 8, G + 2, pz - 3]);
check((await at(px + 7, G + 2, pz - 3)) === 0, 'the wall torch falls when its support is mined');
await sc(() => {
  window.__solrift.tickDrops(4);
  window.__solrift.gatherDrops();
});
check((await sc((id) => window.__solrift.countOf(id), B.TORCH)) >= 1, 'it drops as a normal torch');

// Placing a block onto tall grass replaces it instead of stacking on top.
await sc(
  ([x, y, z, stone]) => {
    const s = window.__solrift;
    s.setBlock(x, y, z, 28);
    s.clearInventory();
    s.give(stone, 2);
    s.select(0);
  },
  [px + 5, G + 1, pz - 4, B.STONE],
);
check(await sc(([x, y, z]) => window.__solrift.useOn(x, y, z, 0, 1, 0), [px + 5, G + 1, pz - 4]), 'a block can be placed onto tall grass');
check((await at(px + 5, G + 1, pz - 4)) === B.STONE, 'the grass was replaced in place');

// First-person hand: block, tool, item and empty-hand views.
console.log('held item');
await sc(
  ([stone, pick, bread, rose, sword]) => {
    const s = window.__solrift;
    s.setTime(0.3);
    s.clearInventory();
    s.give(stone, 8);
    s.give(pick, 1);
    s.give(bread, 3);
    s.give(rose, 3);
    s.give(sword, 1);
    s.select(0);
  },
  [B.STONE, 274, 300, B.ROSE, 289],
);
await shot('hand-block', 900);
for (const [slot, name] of [
  [1, 'hand-tool'],
  [2, 'hand-food'],
  [3, 'hand-flower'],
  [4, 'hand-sword'],
  [8, 'hand-empty'],
]) {
  await sc((i) => window.__solrift.select(i), slot);
  await shot(name, 900);
}

// Mid-swing frames of the sword (the original sweeps toward the centre and turns edge-on).
await sc((i) => window.__solrift.select(i), 4);
await page.waitForTimeout(600);
for (let i = 0; i < 4; i++) {
  await sc(() => window.__solrift.swingHand());
  await shot(`hand-swing-${i}`, 60 + i * 55);
  await page.waitForTimeout(500);
}

// Night shot: a ring of torches lights the garden.
await sc(
  ([px, pz, G, torch]) => {
    const s = window.__solrift;
    s.clearInventory();
    s.give(torch, 12);
    s.select(0);
    for (const [x, z] of [
      [3, 1],
      [9, 1],
      [3, 4],
      [9, 4],
      [6, 0],
      [6, 6],
    ])
      s.useOn(px + x, G, pz + z, 0, 1, 0);
    s.setTime(0.78);
    s.setDebug(true);
    s.teleport(px + 0.5, G + 1, pz + 0.5, -Math.PI / 2, -0.3);
  },
  [px, pz, G, B.TORCH],
);
await page.waitForTimeout(1500);
await shot('plants-night', 1200);

check(errors.filter((e) => !/favicon|WebSocket|ERR_CONNECTION/i.test(e)).length === 0, 'no console errors: ' + errors.slice(0, 3).join(' | '));

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log('plants OK');
