// The wings and the flight in the real game: every state of every class, from the back, the front, the side and three-quarters.
// Usage: node scripts/flight-lab.mjs [class=warrior] [wings=2] [outDir=screenshots/flight] [only=name,name]   (the dev server must be running)
// Wings are numbered as in WINGS (1 cinder, 2 sky, 3 glade, 4 ruin, 5 radiant, 6 storm).
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import sharp from 'sharp';

const cls = process.argv[2] ?? 'warrior';
const wings = Number(process.argv[3] ?? 2);
const outDir = process.argv[4] ?? 'screenshots/flight';
const only = process.argv[5] ? new Set(process.argv[5].split(',')) : null;
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HOLD = { warrior: 287, mage: 393, ranger: 303 }[cls];
const t0 = Date.now();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const msgs = [];
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall|willReadFrequently|preload|Blit feedback|DevTools/.test(m.text()) && msgs.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => msgs.push(e.message));
await page.goto(`http://localhost:3000/?seed=1337&debug&nomobs&noshadows&class=${cls}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 1200000 });
console.log('ready after', Math.round((Date.now() - t0) / 1000), 's');
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  const s = window.__solrift;
  s.forceLock();
  s.setMode('survival');
  s.setTime(0.35);
  s.teleport(101.5, 151, 103.5, 0, -0.05);
});
await sleep(6000);
await page.evaluate((hold) => {
  const s = window.__solrift;
  for (let x = 60; x <= 145; x++) for (let z = 50; z <= 150; z++) { for (let y = 151; y <= 190; y++) s.setBlock(x, y, z, 0); s.setBlock(x, 150, z, 1); }
  s.teleport(101.5, 151, 120.5, 0, -0.05);
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

const frames = [];
const keysDown = new Set();
const keys = async (list, on) => {
  for (const k of list) {
    await page.evaluate(([k, on]) => window.__solrift.holdKey(k, on), [k, on]);
    if (on) keysDown.add(k);
    else keysDown.delete(k);
  }
};
const ev = (fn, arg) => page.evaluate(fn, arg);
let n = 0;
const snap = async (name, label) => {
  const f = `${outDir}/${cls}-${wings}-${String(n++).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: f });
  frames.push({ name: label ?? name, f });
};
const want = (name) => !only || only.has(name);
const reset = async () => {
  await keys([...keysDown], false);
  await ev(() => { const s = window.__solrift; s.engage(false); s.turnFigure(0); s.setFlying(false); s.setView(1); });
  await sleep(1800);
  await ev(() => window.__solrift.teleport(101.5, 151, 120.5, 0, -0.05));
  await sleep(600);
};

// 1. Equip: the wings open (taken off first, so that the pair is put on while the figure stands).
if (want('equip')) {
  await ev(() => window.__solrift.wearWings(0));
  await sleep(1200);
  await ev(() => window.__solrift.wearWings(Number(new URLSearchParams('').get('x') ?? 0)));
}
const wear = (n) => ev((n) => window.__solrift.wearWings(n), n);
if (want('equip')) {
  await ev(() => window.__solrift.setView(2));
  await wear(wings);
  for (let i = 0; i < 6; i++) await snap(`equip`, `equip ${i}`);
  await sleep(1800);
} else await wear(wings);
await sleep(2500);

// 2. On the ground.
const poses = [
  ['hover-back', { view: 1 }],
  ['hover-front', { view: 2 }],
  ['hover-side', { view: 1, turn: Math.PI / 2 }],
  ['hover-3q', { view: 1, turn: Math.PI * 0.75 }],
  ['hover-move-back', { keys: ['KeyW'], view: 1, n: 2 }],
  ['hover-move-front', { keys: ['KeyW'], view: 2, n: 2 }],
  ['hover-sprint', { keys: ['KeyW', 'ControlLeft'], view: 1, n: 2 }],
  ['hover-sprint-side', { keys: ['KeyW', 'ControlLeft'], view: 1, turn: Math.PI / 2, n: 2 }],
  ['hover-combat', { engage: true, view: 1 }],
  ['hover-combat-front', { engage: true, view: 2 }],
];
for (const [name, o] of poses) {
  if (!want(name)) continue;
  await reset();
  await wear(wings);
  await ev((o) => { const s = window.__solrift; s.setView(o.view ?? 1); s.turnFigure(o.turn ?? 0); s.engage(!!o.engage); }, o);
  await keys(o.keys ?? [], true);
  await sleep(o.settle ?? 2200);
  for (let i = 0; i < (o.n ?? 1); i++) {
    await snap(name, `${name}${o.n > 1 ? ' ' + i : ''}`);
    await sleep(300);
  }
}

// 3. In the air.
const flights = [
  ['takeoff', { view: 1, n: 5, gap: 60, takeoff: true }],
  ['takeoff-side', { view: 1, turn: Math.PI / 2, n: 5, gap: 60, takeoff: true }],
  ['flight-idle', { view: 1, n: 2 }],
  ['flight-idle-front', { view: 2, n: 2 }],
  ['flight-idle-side', { view: 1, turn: Math.PI / 2, n: 2 }],
  ['flight-fwd', { keys: ['KeyW'], view: 1, n: 2 }],
  ['flight-fwd-front', { keys: ['KeyW'], view: 2, n: 2 }],
  ['flight-fwd-side', { keys: ['KeyW'], view: 1, turn: Math.PI / 2, n: 2 }],
  ['flight-fwd-3q', { keys: ['KeyW'], view: 1, turn: Math.PI * 0.75, n: 2 }],
  ['flight-fast', { keys: ['KeyW', 'ControlLeft'], view: 1, n: 2 }],
  ['flight-fast-side', { keys: ['KeyW', 'ControlLeft'], view: 1, turn: Math.PI / 2, n: 2 }],
  ['flight-fast-front', { keys: ['KeyW', 'ControlLeft'], view: 2, n: 2 }],
  ['ascend', { keys: ['KeyW', 'Space'], view: 1, turn: Math.PI / 2, n: 2 }],
  ['descend', { keys: ['KeyW', 'ShiftLeft'], view: 1, turn: Math.PI / 2, n: 2, high: true }],
  ['bank-left', { keys: ['KeyW', 'ControlLeft'], view: 1, spin: 1.6, n: 3 }],
  ['bank-right', { keys: ['KeyW', 'ControlLeft'], view: 1, spin: -1.6, n: 3 }],
  ['flight-combat', { engage: true, keys: ['KeyW'], view: 1, n: 2 }],
  ['flight-combat-idle', { engage: true, view: 2, n: 2 }],
  ['landing', { view: 1, turn: Math.PI / 2, n: 5, gap: 80, land: true }],
];
for (const [name, o] of flights) {
  if (!want(name)) continue;
  await reset();
  await wear(wings);
  if (o.high) await ev(() => { window.__solrift.teleport(101.5, 170, 120.5, 0, -0.05); });
  await ev((o) => { const s = window.__solrift; s.setView(o.view ?? 1); s.turnFigure(o.turn ?? 0); s.engage(!!o.engage); }, o);
  if (!o.takeoff) await ev(() => window.__solrift.setFlying(true));
  else {
    await sleep(800);
    await ev(() => window.__solrift.setFlying(true));
  }
  await keys(o.keys ?? [], true);
  if (o.spin) await ev((r) => { window.__spin = setInterval(() => { const s = window.__solrift; const f = s.facing(); s.look(f.yaw + r * 0.05, f.pitch); }, 50); }, o.spin);
  if (!o.takeoff) await sleep(o.settle ?? 3500);
  if (o.land) {
    await sleep(2500);
    await ev(() => window.__solrift.teleport(101.5, 158, 120.5, 0, -0.05));
    await ev(() => window.__solrift.setFlying(true));
    await sleep(800);
    await keys(['ShiftLeft'], true);
    await sleep(1200);
    await keys(['ShiftLeft'], false);
    await ev(() => window.__solrift.setFlying(false));
  }
  for (let i = 0; i < (o.n ?? 1); i++) {
    await snap(name, `${name}${o.n > 1 ? ' ' + i : ''}`);
    await sleep(o.gap ?? 300);
  }
  if (o.spin) await ev(() => clearInterval(window.__spin));
}

await browser.close();

// A labelled sheet of all of them.
const cols = 4;
const w = 480;
const h = 270;
const comps = [];
for (let i = 0; i < frames.length; i++) {
  const { f, name } = frames[i];
  const label = Buffer.from(`<svg width="${w}" height="22"><rect width="${w}" height="22" fill="#000a"/><text x="6" y="16" font-size="14" fill="#fff" font-family="monospace">${cls} w${wings} ${name}</text></svg>`);
  comps.push({ input: await sharp(f).resize(w, h).composite([{ input: label, top: 0, left: 0 }]).toBuffer(), left: (i % cols) * w, top: Math.floor(i / cols) * h });
}
await sharp({ create: { width: cols * w, height: Math.ceil(frames.length / cols) * h, channels: 3, background: '#000' } }).composite(comps).png().toFile(`${outDir}/${cls}-${wings}-sheet.png`);
console.log('saved', `${outDir}/${cls}-${wings}-sheet.png`, msgs.slice(0, 8));
