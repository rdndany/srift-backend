// A tour of the Hollow Deep: the camp, the lush cavern with its pool and shrine, the grottoes, the geode, the dripstone
// descent, the cavern of lava and the Molten Heart, with nothing but a torch for light.
// Saves screenshots/dungeon/*.png. Usage: node scripts/dungeon-look.mjs [url]
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3000';
mkdirSync('screenshots/dungeon', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(100);
  }
  return false;
};
const browser = await launchBrowser();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const sc = (fn, ...a) => page.evaluate(fn, ...a);
const shot = async (name, wait = 900) => {
  await sleep(wait);
  await page.screenshot({ path: `screenshots/dungeon/${name}.png` });
  console.log('saved', name);
};

// The copy's own measures: u east of its west edge, v south of its middle, d the depth below the camp.
const X = 4096;
const Z = 4192;
const FY = 150;
const at = async (u, v, d, yaw, pitch = 0.05, up = 1) => {
  await sc(([x, y, z, a, p]) => window.__solrift.teleport(x, y, z, a, p), [X + u + 0.5, FY - d + up, Z + v + 0.5, yaw, pitch]);
};
const EAST = -Math.PI / 2;
const WEST = Math.PI / 2;
const NORTH = 0;
const SOUTH = Math.PI;
await page.goto(`${url}/game?world=adventure&debug&nomobs&class=warrior`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.() && window.__solrift.worldKind() === 'adventure', null, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
});
await sc(() => window.__solrift.addXp(5000));
await sc(() => window.__solrift.give(504, 1)); // the Hollow Sigil
const chapelY = await sc(() => window.__solrift.surfaceY(86.5, 0.5));
await sc((y) => window.__solrift.teleport(86.5, y + 2.5, 0.5, -Math.PI / 2, -0.1), chapelY);
await sleep(1500);
await sc(() => window.__solrift.setFlying(false));
let carried = false;
for (let y = chapelY - 6; y <= chapelY && !carried; y++) {
  await sc((yy) => window.__solrift.teleport(92.5, yy, 0.5, -Math.PI / 2, 0), y);
  carried = await until(() => sc(() => window.__solrift.position().x > 4000), 600);
}
console.log('in the dungeon:', carried, 'sigils left:', await sc(() => window.__solrift.countOf(504)));
await sleep(2500);
const mobs = await sc(() => window.__solrift.mobs().filter((m) => m.x > 4000));
const kinds = {};
for (const m of mobs) kinds[m.kind] = (kinds[m.kind] ?? 0) + 1;
console.log('in the copy:', JSON.stringify(kinds));

// From here nothing may hurt the camera. A torch in hand is all the light there is.
await sc(() => window.__solrift.setMode('creative'));
await sc(() => window.__solrift.setFlying(true));
await sc(() => window.__solrift.clearInventory());
await sc(() => window.__solrift.give(23, 16));
await sc(() => window.__solrift.select(0));
const tour = [
  ['01-camp', 8, 0, -1, EAST + 0.5, 0.05],
  ['02-camp-portal', 14, 0, -1, WEST, 0.0],
  ['03-first-tunnel', 36, -5, 1, EAST - 0.3, 0.0],
  ['04a-mine-corner', 40, 10, 3, SOUTH - 0.6, 0.35],
  ['04-mineshaft', 58, 14, 3, EAST, 0.0],
  ['05-mineshaft-end', 74, 14, 3, EAST, 0.0],
  ['06-drowned-hollow', 32, 40, 4, EAST, 0.0, 3],
  ['07-drowned-lake', 44, 36, 5, SOUTH, 0.0, 3],
  ['08-quarry', 70, 58, 8, EAST, 0.0, 3],
  ['09-quarry-pool', 86, 60, 13, WEST + 0.4, 0.0, 3],
  ['10-lush-mouth', 60, -24, 10, EAST, 0.0],
  ['11-lush-pool', 78, -18, 10, SOUTH - 0.4, 0.0, 2],
  ['12-shrine', 86, -24, 10, EAST + 0.5, 0.05, 2],
  ['13-lush-vines', 92, -20, 10, NORTH + 0.3, 0.3],
  ['14-branch-a', 68, -41, 11, NORTH, 0.0],
  ['15-grotto-a', 62, -47, 12, NORTH, 0.0],
  ['16-root-cellar', 46, -78, 17, WEST, 0.0, 2],
  ['17-branch-b', 90, -2, 11, SOUTH, 0.0],
  ['18-geode-way', 100, -45, 11, NORTH, 0.0],
  ['19-geode', 100, -62, 13, WEST, 0.0, 2],
  ['20-gate-one', 104, -24, 10, EAST, 0.05],
  ['21-dripstone-descent', 130, -22, 11, EAST, 0.0],
  ['22-dripstone-2', 142, -6, 20, SOUTH, 0.0],
  ['23-vent-cave', 143, 14, 30, SOUTH - 0.4, 0.0, 2],
  ['24-basalt-tunnel', 150, 0, 22, EAST, 0.0],
  ['25-basalt-hall', 176, 4, 25, EAST, 0.0, 3],
  ['26-ember-depths', 152, 44, 41, EAST + 0.4, 0.0, 3],
  ['27-grotto-c', 126, 70, 42, WEST, 0.0],
  ['28-crypt', 160, 70, 41, SOUTH, 0.05, 2],
  ['29-gate-two', 190, 57, 41, EAST, 0.05],
  ['30-last-descent', 214, 58, 44, EAST, 0.0],
  ['31-ossuary', 230, 78, 53, WEST, 0.0, 2],
  ['32-heart-door', 240, 62, 52, EAST, 0.0, 2],
  ['33-boss-far', 292, 0, 71, WEST, 0.0, 5],
  ['34-boss-near', 280, 6, 71, WEST + 0.3, 0.1, 4],
  ['35-boss-side', 264, 18, 71, WEST + 1.2, 0.05, 4],
  ['36-boss-side-near', 262, 12, 71, WEST + 1.0, 0.05, 3],
];
const only = process.argv[3];
for (const [name, u, v, d, yaw, pitch, up] of tour) {
  if (only && !name.startsWith(only) && !only.split(',').some((o) => name.startsWith(o))) continue;
  await at(u, v, d, yaw, pitch, up ?? 1);
  await shot(name, 2200);
}
console.log('errors:', JSON.stringify(errors));
await browser.close();