// The class animations in the real game, from the back, the front, the side and three-quarters, in every state.
// Usage: node scripts/motion-lab.mjs [class=warrior] [outDir=screenshots/motion]   (the dev server must be running)
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import sharp from 'sharp';

const cls = process.argv[2] ?? 'warrior';
const outDir = process.argv[3] ?? 'screenshots/motion';
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HOLD = { warrior: 287, mage: 393, ranger: 303 }[cls];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const msgs = [];
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall|willReadFrequently|preload|Blit feedback/.test(m.text()) && msgs.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => msgs.push(e.message));
await page.goto(`http://localhost:3000/?seed=1337&debug&nomobs&noshadows&class=${cls}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 900000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  const s = window.__solrift;
  s.forceLock();
  s.setMode('survival');
  s.setTime(0.35);
  s.teleport(101.5, 151, 103.5, 0, 0);
});
await sleep(9000);
await page.evaluate((hold) => {
  const s = window.__solrift;
  for (let x = 70; x <= 135; x++) for (let z = 60; z <= 145; z++) { for (let y = 151; y <= 170; y++) s.setBlock(x, y, z, 0); s.setBlock(x, 150, z, 1); }
  s.teleport(101.5, 151, 103.5, 0, -0.05);
  s.clearInventory();
  s.give(hold, 1);
  s.select(0);
  if (hold === 287) {
    s.give(344, 1);
    s.select(1);
    s.equipHeld();
    s.select(0);
  }
  s.setView(1);
}, HOLD);
await sleep(2500);

const hold = async (keys, on) => {
  for (const k of keys) await page.evaluate(([k, on]) => window.__solrift.holdKey(k, on), [k, on]);
};
const frames = [];
/** Picks the pose for a name, waits for it to settle, and takes `n` pictures `gap` ms apart. */
const state = async (name, { keys = [], view = 1, engage = false, idle = 0, settle = 1800, n = 1, gap = 200 }) => {
  await page.evaluate(([v, e]) => { window.__solrift.setView(v); window.__solrift.engage(e); }, [view, engage]);
  if (idle) await page.evaluate((k) => window.__solrift.idle(k), idle);
  await hold(keys, true);
  await sleep(settle);
  for (let i = 0; i < n; i++) {
    const f = `${outDir}/${cls}-${name}-${i}.png`;
    await page.screenshot({ path: f });
    frames.push({ name: `${name}${n > 1 ? ' ' + i : ''}`, f });
    if (i < n - 1) await sleep(gap);
  }
  await hold(keys, false);
  if (idle) await page.evaluate(() => window.__solrift.idle(0));
  await page.evaluate(() => window.__solrift.engage(false));
  await sleep(700);
  // Walk back to the middle so the arena does not run out.
  await page.evaluate(() => window.__solrift.teleport(101.5, 151, 103.5, 0, -0.05));
};

await state('idle-back', {});
await state('idle-front', { view: 2 });
await state('combat-back', { engage: true, settle: 2200 });
await state('combat-front', { engage: true, view: 2, settle: 2200 });
await state('walk-back', { keys: ['KeyW'], n: 2 });
await state('walk-front', { keys: ['KeyW'], view: 2, n: 2 });
await state('strafe-side', { keys: ['KeyA'], n: 2 });
await state('walkback-side', { keys: ['KeyS'], n: 1 });
await state('walk-3q', { keys: ['KeyW', 'KeyA'], n: 2 });
await state('sprint-back', { keys: ['KeyW', 'ControlLeft'], n: 2 });
await state('sprint-front', { keys: ['KeyW', 'ControlLeft'], view: 2, n: 2 });
await state('sprint-3q', { keys: ['KeyW', 'KeyD', 'ControlLeft'], n: 2 });
await state('combatwalk-back', { keys: ['KeyW'], engage: true, n: 2 });
await state('combatwalk-front', { keys: ['KeyW'], engage: true, view: 2, n: 2 });
await state('combatsprint', { keys: ['KeyW', 'ControlLeft'], engage: true, n: 1 });
await state('stretch-front', { idle: 2, view: 2, settle: 1200, n: 4, gap: 1300 });
await state('stretch-back', { idle: 2, view: 1, settle: 1200, n: 2, gap: 1500 });
await browser.close();

// A sheet of all of them, labelled.
const cols = 4;
const w = 480;
const h = 270;
const comps = [];
for (let i = 0; i < frames.length; i++) {
  const { f, name } = frames[i];
  const label = Buffer.from(`<svg width="${w}" height="22"><rect width="${w}" height="22" fill="#000a"/><text x="6" y="16" font-size="14" fill="#fff" font-family="monospace">${cls} ${name}</text></svg>`);
  comps.push({ input: await sharp(f).resize(w, h).composite([{ input: label, top: 0, left: 0 }]).toBuffer(), left: (i % cols) * w, top: Math.floor(i / cols) * h });
}
await sharp({ create: { width: cols * w, height: Math.ceil(frames.length / cols) * h, channels: 3, background: '#000' } }).composite(comps).png().toFile(`${outDir}/${cls}-sheet.png`);
console.log('saved', `${outDir}/${cls}-sheet.png`, msgs.slice(0, 8));

