// First-person weapon and shield: idle, block, block hit and attack poses. Usage: node scripts/hand-look.mjs outPrefix [items: sword,great]
import { chromium } from 'playwright';
import sharp from 'sharp';

const [prefix, which = 'sword,great'] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
const msgs = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall|willReadFrequently|preload|Blit feedback/.test(m.text()) && msgs.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => msgs.push(e.message));
await page.goto('http://localhost:3000/?seed=1337&debug&nomobs&noshadows', { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  const s = window.__solrift;
  s.forceLock();
  s.setMode('survival');
  s.setTime(0.35);
  s.teleport(101.5, 151, 103.5, 0, 0);
});
await sleep(9000);
await page.evaluate(() => {
  const s = window.__solrift;
  for (let x = 90; x <= 112; x++) for (let z = 80; z <= 112; z++) { for (let y = 151; y <= 175; y++) s.setBlock(x, y, z, 0); s.setBlock(x, 150, z, 1); }
  s.teleport(101.5, 151, 103.5, 0, 0);
  s.clearInventory();
  s.give(287, 1);
  s.give(391, 1);
  s.give(344, 1);
  s.setOffhand(344);
});
await sleep(1500);
const files = [];
const shot = async (n) => {
  const f = `${prefix}-${n}.png`;
  await page.screenshot({ path: f });
  files.push(f);
};
const sets = { sword: [0, [0.2, 0.46, 0.64, 0.85]], great: [1, [0.3, 0.52, 0.74, 0.9]] };
for (const name of which.split(',')) {
  const [slot, times] = sets[name];
  await page.evaluate((i) => window.__solrift.select(i), slot);
  await sleep(900);
  await shot(`${name}-idle`);
  await page.evaluate(() => window.__solrift.setRight(true));
  await sleep(900);
  await shot(`${name}-block`);
  await page.evaluate(() => window.__solrift.blockHit(false));
  await sleep(60);
  await shot(`${name}-blockhit`);
  await page.evaluate(() => window.__solrift.setRight(false));
  await sleep(700);
  for (const v of [0, 1]) {
    if (name === 'great' && v) continue;
    for (const t of times) {
      await page.evaluate(([t, v]) => window.__solrift.holdSwing(t, v), [t, v]);
      await sleep(250);
      await shot(`${name}-v${v}-${t}`);
    }
    await page.evaluate(() => window.__solrift.holdSwing(null));
    await sleep(500);
  }
}
await browser.close();
// A contact sheet per item, so one picture shows the whole swing.
for (const name of which.split(',')) {
  const mine = files.filter((f) => f.includes(`-${name}-`) && /v\d-/.test(f));
  const top = files.filter((f) => f.includes(`-${name}-`) && /idle|block/.test(f));
  const all = [...top, ...mine];
  const cols = 3;
  const w = 480;
  const h = 270;
  const rows = Math.ceil(all.length / cols);
  const comps = [];
  for (let i = 0; i < all.length; i++) comps.push({ input: await sharp(all[i]).resize(w, h).toBuffer(), left: (i % cols) * w, top: Math.floor(i / cols) * h });
  await sharp({ create: { width: cols * w, height: rows * h, channels: 3, background: '#000' } }).composite(comps).png().toFile(`${prefix}-sheet-${name}.png`);
}
console.log('saved', prefix, msgs.slice(0, 6));
