// Dyes E2E: coloured wool, dye items in the hotbar, lapis ore, sheep of every colour, dyeing a sheep by
// right-clicking it with a dye (it changes colour and the dye is used up), and beds of every colour.
// Usage: node scripts/dyes.mjs [url] [outDir]   (the game server needs CHEATS=1, as scripts/e2e.mjs sets)
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const WOOL = 56;
const WOOL_BASE = 178; // coloured wool: 178..192 for colours 1..15
const LAPIS_ORE = 177;
const DYE_BASE = 347;
const BLUE = 11;

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
const shot = async (page, name, wait = 700) => {
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
await sc(
  page,
  ([px, pz, gy]) => {
    const s = window.__solrift;
    for (let x = px - 8; x <= px + 10; x++)
      for (let z = pz - 10; z <= pz + 10; z++) {
        for (let y = gy; y <= gy + 8; y++) s.setBlock(x, y, z, 0);
        s.setBlock(x, gy - 1, z, 3);
        s.setBlock(x, gy - 2, z, 2);
      }
  },
  [px, pz, gy],
);
await sleep(500);

console.log('coloured wool');
await sc(
  page,
  ([px, pz, gy, WOOL, BASE]) => {
    const s = window.__solrift;
    for (let c = 0; c < 16; c++) {
      const id = c === 0 ? WOOL : BASE + c - 1;
      s.setBlock(px + 5, gy + (c >> 3), pz - 4 + (c & 7), id);
    }
    s.setBlock(px + 5, gy + 2, pz - 4, 177);
    s.teleport(px + 0.5, gy, pz - 0.5, -Math.PI / 2, 0);
  },
  [px, pz, gy, WOOL, WOOL_BASE],
);
const got = await sc(page, ([px, pz, gy]) => Array.from({ length: 16 }, (_, c) => window.__solrift.getBlock(px + 5, gy + (c >> 3), pz - 4 + (c & 7))), [px, pz, gy]);
check(new Set(got).size === 16, `sixteen different wool blocks stand in the world (${got.join(',')})`);
check((await sc(page, ([px, pz, gy]) => window.__solrift.getBlock(px + 5, gy + 2, pz - 4), [px, pz, gy])) === LAPIS_ORE, 'a lapis ore block is placeable');
await shot(page, 'dyes-wool');

console.log('dye items');
await sc(
  page,
  ([DYE_BASE]) => {
    const s = window.__solrift;
    s.clearInventory();
    for (let c = 0; c < 9; c++) s.give(DYE_BASE + c, 1);
    s.select(0);
    s.forceUi();
  },
  [DYE_BASE],
);
await shot(page, 'dyes-hotbar');
await sc(
  page,
  ([DYE_BASE]) => {
    const s = window.__solrift;
    s.clearInventory();
    for (let c = 9; c < 16; c++) s.give(DYE_BASE + c, 1);
    s.forceUi();
  },
  [DYE_BASE],
);
await shot(page, 'dyes-hotbar-2');
const inv = await sc(page, () => window.__solrift.inventory());
check(inv.filter(Boolean).length === 7, 'the other seven dyes sit in the hotbar as well');

console.log('sheep');
await sc(
  page,
  ([px, pz, gy]) => {
    const s = window.__solrift;
    s.clearMobs();
    s.teleport(px + 0.5, gy, pz + 5.5, -Math.PI / 2, -0.15);
    [0, 15, 7, 8, 12, 6, 1, 3].forEach((v, i) => s.spawnMob('sheep', px + 4.5, gy, pz + 1.5 + i * 1.2 - 3, v));
  },
  [px, pz, gy],
);
await sleep(300);
const sheep = await sc(page, () => window.__solrift.mobs().filter((m) => m.kind === 'sheep'));
check(sheep.length === 8 && new Set(sheep.map((m) => m.variant)).size === 8, 'sheep of eight different colours are in the field');
await sc(
  page,
  ([px, pz, gy]) => {
    window.__solrift.teleport(px - 3.5, gy, pz + 1, -Math.PI / 2, -0.05);
  },
  [px, pz, gy],
);
await shot(page, 'dyes-sheep', 1200);

console.log('dyeing a sheep');
await sc(
  page,
  ([px, pz, gy, DYE]) => {
    const s = window.__solrift;
    s.clearMobs();
    s.clearInventory();
    s.give(DYE, 3);
    s.select(0);
    s.teleport(px + 0.5, gy, pz + 0.5, -Math.PI / 2, 0);
    s.spawnMob('sheep', px + 2.2, gy, pz + 0.5, 0);
  },
  [px, pz, gy, DYE_BASE + BLUE],
);
await sleep(600);
let used = false;
for (let i = 0; i < 6 && !used; i++) {
  // The sheep wanders a little, so keep looking at it.
  await sc(
    page,
    () => {
      const s = window.__solrift;
      const m = s.mobs().find((m) => m.kind === 'sheep');
      const p = s.position();
      if (m) {
        const dx = m.x - p.x;
        const dz = m.z - p.z;
        const dy = m.y + 0.8 - (p.y + 1.62);
        s.teleport(p.x, p.y, p.z, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
      }
    },
  );
  await sleep(120);
  used = await sc(page, () => window.__solrift.useOnMob());
}
check(used, 'right-clicking the sheep with a dye uses it');
await sleep(500);
const dyed = await sc(page, () => window.__solrift.mobs().find((m) => m.kind === 'sheep'));
check(dyed?.variant === BLUE, `the sheep turned blue (variant ${dyed?.variant})`);
check((await sc(page, () => window.__solrift.inventory()))[0]?.[1] === 2, 'one blue dye was used up');
await shot(page, 'dyes-blue-sheep', 900);

console.log('coloured beds');
const BED_COLORS = [0, 1, 3, 4, 12, 14, 15, 11];
const bedItem = (c) => (c === 14 ? 345 : 363 + c);
const footId = (c, dir) => (c === 14 ? 72 + dir : 193 + (c < 14 ? c : c - 1) * 4 + dir);
await sc(
  page,
  ([px, pz, gy]) => {
    const s = window.__solrift;
    s.clearMobs();
    s.clearInventory();
    for (let x = px + 1; x <= px + 8; x++) for (let z = pz - 6; z <= pz + 6; z++) for (let y = gy; y <= gy + 3; y++) s.setBlock(x, y, z, 0);
    s.teleport(px + 0.5, gy, pz + 0.5, -Math.PI / 2, 0);
  },
  [px, pz, gy],
);
const placedBeds = [];
for (let i = 0; i < BED_COLORS.length; i++) {
  const c = BED_COLORS[i];
  await sc(
    page,
    ([id, x, y, z]) => {
      const s = window.__solrift;
      s.clearInventory();
      s.give(id, 1);
      s.select(0);
      return s.useOn(x, y, z, 0, 1, 0);
    },
    [bedItem(c), px + 3, gy - 1, pz - 4 + i],
  );
  const [foot, head] = await sc(
    page,
    ([x, y, z]) => [window.__solrift.getBlock(x, y, z), window.__solrift.getBlock(x + 1, y, z)],
    [px + 3, gy, pz - 4 + i],
  );
  placedBeds.push(foot === footId(c, 0) && head === 76);
}
check(placedBeds.every(Boolean), `eight beds of different colours lie down in their own colour (${placedBeds.join(',')})`);
await sc(page, ([px, pz, gy]) => window.__solrift.teleport(px + 0.5, gy, pz - 0.5, -Math.PI / 2, -0.7), [px, pz, gy]);
await shot(page, 'dyes-beds', 1200);
await sc(page, (ids) => { const s = window.__solrift; s.clearInventory(); ids.forEach((id) => s.give(id, 1)); s.select(0); s.forceUi(); }, BED_COLORS.map(bedItem));
await shot(page, 'dyes-bed-items');
check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\ndyes ok');
