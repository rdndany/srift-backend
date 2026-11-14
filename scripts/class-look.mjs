// Screenshot a class's figure in third person. Usage: node scripts/class-look.mjs warrior|ranger|mage outPrefix [time=0.25]
// Env: OFF=0,1 takes those armor slots off (0 helmet, 1 chestplate, 2 leggings, 3 boots); WEAR=name,name puts those items on (e.g. mage_hat, iron_chestplate).
// Takes <outPrefix>-back.png and <outPrefix>-front.png (cropped around the figure, 2x). The dev server must be running.
import { chromium } from 'playwright';

const [cls, prefix, time = '0.25'] = process.argv.slice(2);
const off = (process.env.OFF ?? '').split(',').filter(Boolean).map(Number);
const wear = (process.env.WEAR ?? '').split(',').filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 })).newPage();
const msgs = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall|willReadFrequently|preload/.test(m.text()) && msgs.push(m.text().slice(0, 400)));
page.on('pageerror', (e) => msgs.push(e.message));
await page.goto(`http://localhost:3000/?seed=1337&debug&nomobs&class=${cls}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
const worn = await page.evaluate(([time, off, wear]) => {
  const s = window.__solrift;
  document.getElementById('overlay').style.display = 'none';
  s.forceLock();
  s.setMode('creative');
  s.setFlying(true);
  s.setTime(Number(time));
  s.setPostfx(false);
  s.teleport(0, 110, 0, 0.5, 0);
  const before = s.armor().worn;
  for (const slot of off) s.setArmorSlot(slot, 0);
  for (const name of wear) {
    const id = s.itemId(name);
    const slotOf = /helm|hat|hood|helmet/.test(name) ? 0 : /chest|robe|jerkin|cuirass/.test(name) ? 1 : /leg|skirt|trousers|greaves/.test(name) ? 2 : 3;
    s.setArmorSlot(slotOf, id);
  }
  return { before, after: s.armor().worn };
}, [time, off, wear]);
console.log('armor', JSON.stringify(worn));
for (const [name, view] of [['back', 1], ['front', 2]]) {
  await page.evaluate((v) => window.__solrift.setView(v), view);
  await sleep(9000);
  await page.screenshot({ path: `${prefix}-${name}.png`, clip: { x: 440, y: 160, width: 400, height: 400 } });
}
await browser.close();
console.log('saved', prefix, msgs.slice(0, 6));
