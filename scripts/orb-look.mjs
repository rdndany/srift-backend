// Experience orbs: at rest, then flying in to the player. Usage: node scripts/orb-look.mjs outPrefix
import { chromium } from 'playwright';

const [prefix] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const msgs = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall|willReadFrequently|preload/.test(m.text()) && msgs.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => msgs.push(e.message));
await page.goto('http://localhost:3000/?seed=1337&debug&nomobs&noshadows', { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  const s = window.__solrift;
  s.forceLock();
  s.setMode('survival');
  s.setTime(0.3);
  s.teleport(101.5, 151, 103.5, 0, 0);
});
await sleep(13000);
await page.evaluate(() => {
  const s = window.__solrift;
  for (let x = 90; x <= 112; x++) for (let z = 80; z <= 108; z++) { for (let y = 151; y <= 158; y++) s.setBlock(x, y, z, 0); s.setBlock(x, 150, z, 1); }
  s.teleport(101.5, 151, 103.5, 0, 0);
  s.setHandHidden(true);
});
await sleep(2500);
// At rest: out of reach (nine and a half blocks ahead), so they only lie and bob.
await page.evaluate(() => {
  const s = window.__solrift;
  s.spawnXp(1, 100.5, 151.3, 94);
  s.spawnXp(37, 102.5, 151.3, 94);
  s.spawnXp(617, 101.5, 151.3, 93.5);
});
await sleep(2500);
await page.screenshot({ path: prefix + '-rest.png', clip: { x: 340, y: 240, width: 600, height: 300 } });
// Flying in.
await page.evaluate(() => {
  const s = window.__solrift;
  s.spawnXp(300, 101.5, 151.3, 98.5);
});
for (let i = 0; i < 6; i++) {
  await sleep(120);
  await page.screenshot({ path: prefix + '-fly' + i + '.png', clip: { x: 240, y: 200, width: 800, height: 400 } });
}
await browser.close();
console.log('saved', prefix, msgs.slice(0, 6));

