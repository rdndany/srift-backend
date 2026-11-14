// Screenshot from a point looking at another. Usage: node scripts/view-look.mjs out.png "fx,fy,fz" "tx,ty,tz" [time=0.3] [seed=1337] [view=0]
// Env: POSTFX=0 turns post-processing off. (the dev server must be running)
import { chromium } from 'playwright';

const [out, from, to, time = '0.3', seed = '1337', view = '0'] = process.argv.slice(2);
const f = from.split(',').map(Number);
const t = to.split(',').map(Number);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const msgs = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall|willReadFrequently|preload/.test(m.text()) && msgs.push(m.text().slice(0, 400)));
page.on('pageerror', (e) => msgs.push(e.message));
await page.goto(`http://localhost:3000/?seed=${seed}&debug&nomobs&class=mage${process.env.EXTRA ?? ''}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(([time, postfx]) => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
  window.__solrift.setMode('creative');
  window.__solrift.setFlying(true);
  window.__solrift.setTime(Number(time));
  if (postfx === '0') window.__solrift.setPostfx(false);
}, [time, process.env.POSTFX ?? '1']);
const dx = t[0] - f[0];
const dz = t[2] - f[2];
const yaw = Math.atan2(-dx, -dz);
const pitch = Math.atan2(t[1] - f[1], Math.hypot(dx, dz));
await page.evaluate(([f, yaw, pitch, view]) => {
  window.__solrift.teleport(f[0], f[1], f[2], yaw, pitch);
  window.__solrift.setView(Number(view));
}, [f, yaw, pitch, view]);
await sleep(12000);
await page.screenshot({ path: out });
await browser.close();
console.log('saved', out, msgs.slice(0, 6));
