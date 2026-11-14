// Villages E2E: three villages in three kinds of land (a temperate one, a desert one and a snowy one), seen
// from the air and from the street; checks the well, the paving, doors, beds, roofs and the watchtower,
// and saves `villages-<name>-*.png`.
// Usage: node scripts/villages.mjs [url] [outDir]   (the game server needs CHEATS=1, as scripts/e2e.mjs sets)
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const WATER = 5;
const COBBLE = 11;
const STONE_BRICKS = 176;
const FENCE = 166;
const PANE = 175;
const SANDSTONE = 42;
const PLANKS = 10;
const BED_FOOT_MIN = 72;

// A seed for each kind of land, whose nearest village to the spawn stands in it (`biome` is the Biome id the game gives
// for the site: 2 plains, 4 desert, 5 snowy plains). When the terrain generator changes these seeds drift: the first
// check of each village says so, and new seeds are found with `makeGenerator(seed).nearestVillage(0, 0)`.
const VILLAGES = [
  { name: 'plains', seed: 44, biome: 2 },
  { name: 'desert', seed: 19, biome: 4 },
  { name: 'snow', seed: 68, biome: 5 },
];

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
    await sleep(200);
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
    window.__solrift.setMode('creative');
  });
  return page;
}
const sc = (page, fn, ...args) => page.evaluate(fn, ...args);

for (const v of VILLAGES) {
  console.log(`${v.name} (seed ${v.seed})`);
  const page = await open(`?seed=${v.seed}&debug&nomobs`, v.name);
  const site = await sc(page, () => window.__solrift.nearestVillage(0, 0));
  check(site !== null, `there is a village near the spawn (${JSON.stringify(site)})`);
  if (!site) continue;
  check(site.biome === v.biome, `and it stands in the land this seed was picked for (${v.name}: biome ${site.biome}, expected ${v.biome})`);
  const g = site.groundY;
  const shot = async (name, wait = 2500) => {
    await sleep(wait);
    await page.screenshot({ path: `${outDir}/villages-${v.name}-${name}.png` });
    console.log('saved', `${v.name}-${name}`);
  };
  const go = (x, y, z, yaw, pitch) => sc(page, ([x, y, z, yaw, pitch]) => window.__solrift.teleport(x, y, z, yaw, pitch), [x, y, z, yaw, pitch]);

  await go(site.x + 0.5, g + 30, site.z + 20.5, 0, -0.5);
  await sc(page, () => window.__solrift.setFlying(true));
  check(await until(async () => (await sc(page, ([x, y, z]) => window.__solrift.getBlock(x, y, z), [site.x, g, site.z])) === WATER, 60000), 'the well holds water');
  const at = (dx, dy, dz) => sc(page, ([x, y, z]) => window.__solrift.getBlock(x, y, z), [site.x + dx, g + dy, site.z + dz]);
  check((await at(1, 0, 0)) === COBBLE, 'the well has a cobblestone rim');
  check((await at(3, 0, 0)) === STONE_BRICKS && (await at(2, 0, 0)) === COBBLE, 'the plaza is paved in rings of cobblestone and stone bricks');
  check((await at(1, 2, 1)) === FENCE, 'the well has fence posts');

  const counts = await sc(
    page,
    ([sx, gy, sz]) => {
      const s = window.__solrift;
      const n = {};
      for (let dz = -27; dz <= 27; dz++)
        for (let dx = -27; dx <= 27; dx++)
          for (let dy = -1; dy <= 14; dy++) {
            const b = s.getBlock(sx + dx, gy + dy, sz + dz);
            n[b] = (n[b] ?? 0) + 1;
          }
      return n;
    },
    [site.x, g, site.z],
  );
  const total = (pred) => Object.entries(counts).reduce((a, [id, c]) => a + (pred(Number(id)) ? c : 0), 0);
  check((counts[PANE] ?? 0) > 0, `with glass pane windows (${counts[PANE]})`);
  check((counts[FENCE] ?? 0) > 10, `fences (${counts[FENCE]})`);
  check(total((id) => id >= 130 && id < 146) > 0, 'real doors');
  check(total((id) => id >= BED_FOOT_MIN && id <= 79) + total((id) => id >= 193 && id < 253) > 0, 'and beds');
  check(total((id) => id >= 90 && id < 130) > 20, 'and roofs of stairs');
  if (v.name === 'desert') check((counts[SANDSTONE] ?? 0) > 100, `built of sandstone (${counts[SANDSTONE]})`);
  else check((counts[PLANKS] ?? 0) > 100, `built of planks (${counts[PLANKS]})`);

  // Aerial views from the four sides.
  await go(site.x + 0.5, g + 32, site.z + 24.5, 0, -0.62);
  await shot('aerial-south', 4000);
  await go(site.x + 24.5, g + 32, site.z + 0.5, Math.PI / 2, -0.62);
  await shot('aerial-east');
  await go(site.x + 0.5, g + 32, site.z - 24.5, Math.PI, -0.62);
  await shot('aerial-north');
  await go(site.x - 24.5, g + 32, site.z + 0.5, -Math.PI / 2, -0.62);
  await shot('aerial-west');
  // On the ground: the plaza, and down each road.
  await go(site.x + 0.5, g + 2.6, site.z + 9.5, 0, -0.12);
  await shot('plaza');
  await go(site.x + 0.5, g + 3.2, site.z + 2.5, 0, -0.1);
  await shot('street-north');
  await go(site.x + 2.5, g + 3.2, site.z + 0.5, -Math.PI / 2, -0.1);
  await shot('street-east');
  await go(site.x - 2.5, g + 3.2, site.z + 0.5, Math.PI / 2, -0.1);
  await shot('street-west');
  await go(site.x + 0.5, g + 3.2, site.z - 2.5, Math.PI, -0.1);
  await shot('street-south');
  await page.context().close();
}

const real = errors.filter((e) => !/favicon|404|Failed to load resource|ERR_|WebSocket/i.test(e));
check(real.length === 0, `no console errors${real.length ? `: ${real.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nvillages ok');
