// Contact sheets of the first-person weapon swings: sword, greatsword, dagger, wand and staff, each as two swings (a developer's look, not a test).
// Usage: node scripts/weapon-look.mjs [url] [outDir]
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:3000';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.clock.install();
await page.goto(`${url}/?seed=1337&debug&nomobs&noshadows`, { waitUntil: 'load' });
for (let i = 0; i < 4000; i++) {
  if (await page.evaluate(() => Boolean(window.__solrift?.isReady?.()))) break;
  await page.clock.runFor(50);
  if (i % 20 === 0) await sleep(50);
}
await page.evaluate(() => {
  const o = document.getElementById('overlay');
  if (o) o.style.display = 'none';
  window.__solrift.forceLock();
  window.__solrift.setTime(0.3);
});
const hook = (fn, ...args) => page.evaluate(([f, a]) => window.__solrift[f](...a), [fn, args]);
await hook('clearInventory');
const weapons = [
  ['sword', 287, 0.4],
  ['greatsword', 391, 0.62],
  ['dagger', 392, 0.28],
  ['wand', 394, 0.42],
  ['staff', 393, 0.42],
];
for (const [, id] of weapons) await hook('give', id, 1);
const only = process.argv[4];
const clip = { x: 330, y: 180, width: 950, height: 540 };
const stops = [0, 0.2, 0.35, 0.46, 0.6, 0.8];
for (let w = 0; w < weapons.length; w++) {
  const [name, , dur] = weapons[w];
  if (only && only !== name) continue;
  await hook('select', w);
  await page.clock.runFor(900);
  const frames = [];
  for (let v = 0; v < 2; v++) {
    for (const s of stops) {
      await hook('swingHand');
      if (s > 0) await page.clock.runFor(Math.round(s * dur * 1000));
      else await page.clock.runFor(1);
      frames.push((await page.screenshot({ clip })).toString('base64'));
      await page.clock.runFor(Math.round(dur * 1000) + 150);
    }
  }
  const sheet = await context.newPage();
  await sheet.setViewportSize({ width: 6 * 477, height: 2 * 272 });
  const cell = (b) => `<img src="data:image/png;base64,${b}" style="width:475px;height:270px">`;
  await sheet.setContent(`<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(6,475px);gap:2px">${frames.map(cell).join('')}</body>`);
  const buf = await sheet.screenshot({ clip: { x: 0, y: 0, width: 6 * 477, height: 2 * 272 } });
  writeFileSync(`${outDir}/weapon-${name}.png`, buf);
  await sheet.close();
}
console.log('errors', errors);
await browser.close();
