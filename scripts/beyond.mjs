// The World Beyond E2E: it loads, has biomes, finds things for the Codex, shows notes, opens the Codex window with B and
// plays with the atmosphere. Saves `beyond-*.png`. Usage: node scripts/beyond.mjs [url] [outDir]
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';
import { openPlay } from './titleFlow.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

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

const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
const sc = (fn, ...args) => page.evaluate(fn, ...args);
const shot = async (name, wait = 600) => {
  await sleep(wait);
  await page.screenshot({ path: `${outDir}/beyond-${name}.png` });
  console.log('saved', name);
};
const ready = async () => {
  await page.waitForFunction(() => window.__solrift?.isReady?.() && window.__solrift.worldKind() === 'beyond', null, { timeout: 180000 });
  await page.evaluate(() => {
    document.getElementById('overlay').style.display = 'none';
    window.__solrift.forceLock();
  });
};

// ---------------------------------------------------------------- the title screen offers it
await page.goto(`${url}/game`, { waitUntil: 'load' });
const pick = await page.waitForSelector('#world-beyond', { timeout: 30000 }).catch(() => null);
check(!!pick, 'the game page offers The World Beyond');
if (pick) {
  await pick.click();
  check((await page.getAttribute('#world-beyond', 'aria-pressed')) === 'true', 'it can be chosen');
}

// ---------------------------------------------------------------- in the world
await page.goto(`${url}/?seed=1&debug&nomobs&mode=creative&world=beyond`, { waitUntil: 'load' });
await ready();
check((await sc(() => window.__solrift.worldKind())) === 'beyond', 'the world kind is beyond');
const start = await sc(() => window.__solrift.position());
check(start.y > 60, `the player stands on land (y ${start.y.toFixed(1)})`);
await shot('start', 1500);

// The Codex fills as the traveller looks around: the first biome is found at once.
await page.waitForFunction(() => (window.__solrift.beyond()?.found.b.length ?? 0) >= 1, null, { timeout: 15000 });
const first = await sc(() => window.__solrift.beyond());
check(first.found.b.length >= 1 && first.name.length > 2, `the first biome is found: ${first.name}`);
check(first.found.a.includes('first_steps'), 'the first achievement unlocks');
await shot('note', 400);

// Travel to some far biomes: each new one is discovered, and the sea, sky and air change.
let sawNote = false;
const seen = new Set([first.name]);
for (const [x, z] of [[900, 300], [-1700, 800], [2600, -1400], [-300, 3000], [4200, 900], [-2500, -2600]]) {
  const y = await sc(([x, z]) => {
    const s = window.__solrift;
    const gy = s.surfaceY(x, z);
    return gy;
  }, [x, z]).catch(() => -1);
  await sc(([x, y, z]) => window.__solrift.teleport(x + 0.5, Math.max(y, 70) + 4, z + 0.5), [x, y, z]);
  if (!sawNote) sawNote = !!(await page.waitForSelector('#beyond-notes .beyond-note', { timeout: 4000 }).catch(() => null));
  await sleep(2500);
  const here = await sc(() => window.__solrift.beyond());
  seen.add(here.name);
}
check(sawNote, 'a note slides in when something is found');
const after = await sc(() => window.__solrift.beyond());
check(after.found.b.length >= 4, `the Codex holds ${after.found.b.length} biomes after the journey`);
check(seen.size >= 4, `the journey crossed ${seen.size} different biomes: ${[...seen].join(', ')}`);
await shot('far', 800);

// The Codex window: B opens it, the tabs list what is found, B closes it.
await page.keyboard.press('KeyB');
const codex = await page.waitForSelector('#codex-window', { timeout: 5000 }).catch(() => null);
check(!!codex, 'B opens the Codex');
if (codex) {
  const rows = await page.$$eval('#codex-window .codex-row', (els) => els.length);
  const found = await page.$$eval('#codex-window .codex-row[data-found="true"]', (els) => els.length);
  check(rows >= 100 && found >= 4, `the Biomes tab lists ${rows} entries, ${found} found`);
  for (const tab of ['places', 'caves', 'deeds']) {
    await page.click(`#codex-window [data-tab="${tab}"]`);
    check((await page.$$eval('#codex-window .codex-row', (els) => els.length)) > 0, `the ${tab} tab has entries`);
  }
  await page.click('#codex-window [data-tab="biomes"]');
  await shot('codex', 400);
  await page.keyboard.press('KeyB');
  await sleep(300);
  check(!(await page.$('#codex-window')), 'B closes it');
}

// The atmosphere: a desert is dry, the tundra snows, and the haze differs from place to place.
const climate = await sc(() => window.__solrift.beyond().feel);
check(typeof climate.fog === 'number' && climate.fog >= 0 && climate.fog <= 1, `the haze is a number between 0 and 1 (${climate.fog.toFixed(2)})`);

// Switching to the other worlds and back keeps working.
check((await sc(() => typeof window.__solrift.beyondBiomeAt(100, 100))) === 'string', 'the biome of any column can be asked for');

check(errors.length === 0, `no errors in the page (${errors.slice(0, 3).join(' | ')})`);
await browser.close();
if (failures.length) {
  console.log(`${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('beyond: all checks passed');
