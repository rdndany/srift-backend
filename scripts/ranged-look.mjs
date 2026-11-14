// The bow, the crossbow and the dagger, in the first-person hand and on the figure in third person (cropped and enlarged).
// Usage: node scripts/ranged-look.mjs outPrefix [port=3000] [first|third|both]   (a dev server of the web app must be running there)
import { chromium } from 'playwright';
import sharp from 'sharp';

const [prefix, port = '3000', which = 'both'] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
const msgs = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall|willReadFrequently|preload|Blit feedback/.test(m.text()) && msgs.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => msgs.push(e.message));
await page.goto(`http://localhost:${port}/?seed=1337&debug&nomobs&noshadows`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 240000 });
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
  s.give(303, 1); // bow (slot 0)
  s.give(396, 1); // crossbow (slot 1)
  s.give(266, 64); // arrows
  s.give(392, 1); // dagger (slot 3)
  s.setOffhand(392);
});
await sleep(1500);
const files = [];
const shot = async (n, crop) => {
  const f = `${prefix}-${n}.png`;
  if (crop) await page.screenshot({ path: f, clip: crop }).then(async () => {
    const b = await sharp(f).resize(crop.width * 2, crop.height * 2, { kernel: 'nearest' }).toBuffer();
    await sharp(b).toFile(f);
  });
  else await page.screenshot({ path: f });
  files.push(f);
};
const slot = async (i) => {
  await page.evaluate((i) => window.__solrift.select(i), i);
  await sleep(1000);
};
const draw = async (ms) => {
  await page.evaluate(() => window.__solrift.setRight(true));
  await sleep(ms);
};
const release = async () => {
  await page.evaluate(() => window.__solrift.setRight(false));
};

if (which !== 'third') {
  await slot(0);
  await shot('1p-bow-idle');
  await draw(500);
  await shot('1p-bow-half');
  await sleep(1200);
  await shot('1p-bow-full');
  await release();
  await sleep(120);
  await shot('1p-bow-shot');
  await sleep(900);
  await slot(1);
  await shot('1p-xbow-idle');
  await draw(500);
  await shot('1p-xbow-half');
  await sleep(1500);
  await shot('1p-xbow-wound');
  await release();
  await sleep(120);
  await shot('1p-xbow-shot');
  await sleep(900);
  await slot(3);
  await shot('1p-dagger-idle');
  for (const [v, t] of [[0, 0.3], [0, 0.55], [1, 0.3], [1, 0.55]]) {
    await page.evaluate(([t, v]) => window.__solrift.holdSwing(t, v), [t, v]);
    await sleep(300);
    await shot(`1p-dagger-${v}-${t}`);
  }
  await page.evaluate(() => window.__solrift.holdSwing(null));
}

if (which !== 'first') {
  await page.evaluate(() => window.__solrift.setView(2));
  const crop = { x: 340, y: 190, width: 280, height: 220 };
  await slot(0);
  await sleep(600);
  await shot('3p-bow-idle', crop);
  await draw(500);
  await shot('3p-bow-half', crop);
  await sleep(2500);
  await shot('3p-bow-full', crop);
  await release();
  await sleep(100);
  await shot('3p-bow-shot', crop);
  await sleep(2500);
  await slot(1);
  await shot('3p-xbow-idle', crop);
  await draw(500);
  await sleep(3000);
  await shot('3p-xbow-wound', crop);
  await release();
  await sleep(100);
  await shot('3p-xbow-shot', crop);
  await sleep(2500);
  await slot(3);
  await shot('3p-dagger-idle', crop);
  // from behind: the string, the arrow nocked in it
  await page.evaluate(() => window.__solrift.setView(1));
  await slot(0);
  const behind = { x: 300, y: 150, width: 360, height: 290 };
  await draw(500);
  await sleep(2500);
  await shot('3b-bow-full', behind);
  await release();
  await sleep(2500);
  await slot(1);
  await draw(500);
  await sleep(3000);
  await shot('3b-xbow-wound', behind);
  await release();
  await sleep(1500);
  await page.evaluate(() => window.__solrift.setLeft(false));
  await page.evaluate(() => window.__solrift.setView(0));
}
await browser.close();

const sizes = await Promise.all(files.map((f) => sharp(f).metadata()));
const w = 480;
const cols = 3;
const rows = Math.ceil(files.length / cols);
const comps = [];
for (let i = 0; i < files.length; i++) {
  const h = Math.round((w * sizes[i].height) / sizes[i].width);
  comps.push({ input: await sharp(files[i]).resize(w, h).toBuffer(), left: (i % cols) * w, top: Math.floor(i / cols) * 400 });
}
await sharp({ create: { width: cols * w, height: rows * 400, channels: 3, background: '#000' } }).composite(comps).png().toFile(`${prefix}-sheet.png`);
console.log('saved', prefix, files.length, msgs.slice(0, 6));
