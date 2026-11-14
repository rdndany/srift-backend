// A new Adventure character wakes in the Undercroft, the cave under Dawnwatch, with nothing at all. Looks around the cave,
// climbs the stair to the cellar house, and then holds a compass (drawn on the item itself, in hand and on the bar), which
// always points north: turns in steps and saves a picture of the needle each time.
// Saves `compass-*.png`. Usage: node scripts/compass.mjs [url] [outDir]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:3000';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
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
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const sc = (fn, ...args) => page.evaluate(fn, ...args);
const shot = async (name, wait = 600) => {
  await sleep(wait);
  await page.screenshot({ path: `${outDir}/compass-${name}.png` });
  console.log('saved', name);
};
const look = (yaw, pitch = 0) => sc(([y, pi]) => {
  const p = window.__solrift.position();
  window.__solrift.teleport(p.x, p.y, p.z, y, pi);
}, [yaw, pitch]);

await page.goto(`${url}/?world=adventure&debug&nomobs`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.() && window.__solrift.worldKind() === 'adventure', null, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
});
await sleep(2000);

const p = await sc(() => window.__solrift.position());
console.log(`  woke at ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`);
check(Math.abs(p.x) < 20 && p.z > 5 && p.z < 25, 'woke up in the cave under the village');
check((await sc(() => window.__solrift.countOf(434))) === 0, 'with no compass');
check(await sc(() => !document.querySelector('[data-testid=compass]')), 'and there is no compass readout on the screen');
await look(Math.PI / 2, -0.1);
await shot('cave-east', 1500);
await look(-Math.PI / 2, -0.1);
await shot('cave-west', 800);

// The stair, and the cellar house at the top of it.
await sc((y) => window.__solrift.teleport(-14.5, y, 12.5, Math.PI / 2, -0.15), p.y);
await shot('stair-bottom', 1500);

// A compass: find north from every side.
await sc(() => {
  window.__solrift.give(434, 1);
  window.__solrift.select(0);
});
await sc(() => window.__solrift.teleport(0.5, 120, 9.5, 0, 0));
for (let i = 0; i < 60 && (await sc(() => window.__solrift.surfaceY(0, 9))) < 1; i++) await sleep(500);
const ground = await sc(() => window.__solrift.surfaceY(0, 9));
await sc((y) => window.__solrift.teleport(0.5, y + 1.2, 9.5, 0, 0), ground);
await sleep(2500);
for (const [name, yaw] of [['north', 0], ['west', Math.PI / 2], ['south', Math.PI], ['east', -Math.PI / 2]]) {
  await look(yaw);
  await shot(`needle-${name}`, 1200);
}

console.log(failures.length ? `\n${failures.length} FAILED` : '\nall good', errors.length ? `\npage errors: ${errors.slice(0, 5).join(' | ')}` : '');
await browser.close();
process.exit(failures.length ? 1 : 0);
