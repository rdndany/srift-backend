// The poses of the wings and the flight on the bench page (/wing-lab): the real figure stepped with fixed time steps and photographed from the back,
// the side, three-quarters and the front. Usage: node scripts/wing-bench.mjs [class=warrior] [wings=2] [outDir=screenshots/bench] [part=all|ground|air|seq]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import sharp from 'sharp';

const cls = process.argv[2] ?? 'warrior';
const wings = Number(process.argv[3] ?? 2);
const outDir = process.argv[4] ?? 'screenshots/bench';
const part = process.argv[5] ?? 'all';
mkdirSync(outDir, { recursive: true });
const held = { warrior: 'sword', mage: 'staff', ranger: 'bow' }[cls] ?? 'none';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const msgs = [];
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall|willReadFrequently|preload|Blit feedback|DevTools|React DevTools/.test(m.text()) && msgs.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => msgs.push(e.message));
await page.goto('http://localhost:3000/wing-lab', { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => window.__wingLab?.ready, undefined, { timeout: 300000 });

const VIEWS = [['back', 0], ['side', 1.57], ['3q', 2.45], ['front', 3.14]];
const rows = [];
const reset = (w = wings) => page.evaluate(([c, w, h, s]) => window.__wingLab.setup(c, w, h, s), [cls, w, held, cls === 'warrior']);
const run = (sec, input, fps = 60) => page.evaluate(([s, i, f]) => window.__wingLab.run(s, i, f), [sec, input, fps]);
const view = (az, el = 0.08, dist = 5.0, look = 1.2) => page.evaluate(([a, e, d, l]) => window.__wingLab.view(a, e, d, l), [az, el, dist, look]);
let n = 0;
const grab = async (name, az, o = {}) => {
  await view(az, o.el, o.dist, o.look);
  const f = `${outDir}/${cls}-${wings}-${String(n++).padStart(3, '0')}.png`;
  await page.screenshot({ path: f, clip: { x: 0, y: 0, width: 960, height: 540 } });
  return { f, name };
};
/** One moment from every side: a row. */
const moment = async (label, views = VIEWS) => {
  const cells = [];
  const state = await page.evaluate(() => window.__wingLab.draw());
  void state;
  for (const [vn, az] of views) cells.push(await grab(`${label} (${vn})`, az));
  rows.push(cells);
};
/** The same view over time: a row (each entry steps `sec` more, with this input, then looks). */
const sequence = async (label, az, steps, input) => {
  const cells = [];
  for (const [sec, inp] of steps) {
    const st = await run(sec, { ...input, ...inp });
    cells.push(await grab(`${label} +${sec}s ${st}`, az));
  }
  rows.push(cells);
};

const AIR = { flying: true, airborne: true };
const TOP = 7.3;

if (part === 'all' || part === 'seq') {
  // Equip: folded, opening, open (the wings go on a standing figure).
  await reset();
  await sequence('equip', 2.5, [[0.01, {}], [0.15, {}], [0.15, {}], [0.15, {}], [0.2, {}], [0.3, {}]], {});
  await run(2, {});
  // Takeoff: the flight begins on the ground float.
  await sequence('takeoff', 1.57, [[0.1, AIR], [0.1, AIR], [0.1, AIR], [0.15, AIR], [0.2, AIR], [0.4, AIR]], {});
  await reset();
  await run(2.5, {});
  await sequence('takeoff-3q', 0.8, [[0.1, AIR], [0.1, AIR], [0.1, AIR], [0.15, AIR], [0.2, AIR], [0.4, AIR]], {});
  // Landing: a fast flight ends.
  await run(3, { ...AIR, speed: TOP });
  await sequence('landing', 1.57, [[0.08, {}], [0.12, {}], [0.2, {}], [0.3, {}], [0.4, {}], [0.8, {}]], { speed: 0 });
}

if (part === 'all' || part === 'ground') {
  await reset();
  await run(2.6, {});
  await moment('hover idle');
  await run(2.2, { speed: 4.6 });
  await moment('hover move');
  await run(2.2, { speed: 6.4 });
  await moment('hover sprint');
  await run(1.5, {});
  await run(1.8, { engaged: true });
  await moment('hover combat');
  await run(0.5, { engaged: true, attack: 0.3 });
  await moment('hover attack');
}

if (part === 'all' || part === 'air') {
  await reset();
  await run(2.5, {});
  await run(2.5, AIR);
  await moment('flight idle');
  await run(3, { ...AIR, speed: TOP * 0.5 });
  await moment('flight forward');
  await run(3, { ...AIR, speed: TOP });
  await moment('flight fast');
  await run(2.5, { ...AIR, speed: 4, vy: 6 });
  await moment('ascend');
  await run(2.5, { ...AIR, speed: 4, vy: -6 });
  await moment('descend');
  await run(2.5, { ...AIR, speed: TOP * 0.7 });
  await run(1.2, { ...AIR, speed: TOP * 0.7, turn: 2.5 });
  await moment('bank left');
  await run(2.5, { ...AIR, speed: TOP * 0.7 });
  await run(1.2, { ...AIR, speed: TOP * 0.7, turn: -2.5 });
  await moment('bank right');
  await run(2, { ...AIR, speed: 3.5, engaged: true });
  await moment('flight combat');
  await run(0.4, { ...AIR, speed: 0, engaged: true, attack: 0.3 });
  await moment('flight attack');
}

await browser.close();
// One picture for every row: the four views in a square, or the frames of a sequence in a grid (small enough to be read whole).
const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
const saved = [];
for (const row of rows) {
  const seq = row.length > 4;
  const cols = seq ? 3 : 2;
  const w = seq ? 340 : 512;
  const h = seq ? 200 : 288;
  const comps = [];
  for (let c = 0; c < row.length; c++) {
    const { f, name } = row[c];
    const label = Buffer.from(`<svg width="${w}" height="18"><rect width="${w}" height="18" fill="#000b"/><text x="4" y="13" font-size="12" fill="#fff" font-family="monospace">${cls} w${wings} ${name}</text></svg>`);
    comps.push({ input: await sharp(f).resize(w, h).composite([{ input: label, top: 0, left: 0 }]).toBuffer(), left: (c % cols) * w, top: Math.floor(c / cols) * h });
  }
  const label0 = row[0].name.split(' (')[0].split(' +')[0];
  const out = `${outDir}/${cls}-${wings}-${slug(label0)}.png`;
  await sharp({ create: { width: cols * w, height: Math.ceil(row.length / cols) * h, channels: 3, background: '#000' } }).composite(comps).png().toFile(out);
  saved.push(out);
}
console.log('saved', saved.join('\n'), msgs.slice(0, 6));