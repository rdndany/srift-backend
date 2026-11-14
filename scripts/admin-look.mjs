// The admin bar (F2) at two window sizes. Usage: node scripts/admin-look.mjs outPrefix
import { chromium } from 'playwright';

const [prefix] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const msgs = [];
for (const [name, width, height] of [['wide', 1600, 900], ['small', 960, 540]]) {
  const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall|willReadFrequently|preload|Blit feedback/.test(m.text()) && msgs.push(m.text().slice(0, 300)));
  page.on('pageerror', (e) => msgs.push(e.message));
  await page.goto('http://localhost:3000/?seed=1337&debug&postfx', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
  await page.evaluate(() => {
    document.getElementById('overlay').style.display = 'none';
    const s = window.__solrift;
    s.forceLock();
    s.setTime(0.1);
  });
  await sleep(6000);
  const before = await page.evaluate(() => getComputedStyle(document.getElementById('admin-bar')).display);
  await page.keyboard.press('F2');
  await sleep(8000);
  await page.screenshot({ path: `${prefix}-${name}.png` });
  const text = await page.evaluate(() => [...document.querySelectorAll('#admin-bar .ab-cell')].filter((c) => c.style.display !== 'none').map((c) => c.innerText.replace('\n', ' = ')).join(' | '));
  const stored = await page.evaluate(() => localStorage.getItem('solrift-admin'));
  console.log(`${name}: hidden first (${before}), stored "${stored}"\n  ${text}`);
  await page.close();
}
console.log('errors:', msgs);
await browser.close();
