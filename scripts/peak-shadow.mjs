// Find the highest ground near the spawn and look at it from 90 blocks off, to see a mountain's shadow on the ground around it.
// Usage: node scripts/peak-shadow.mjs out.png dx dz [time=0.07]   (env EXTRA='&shadowfar=0' etc.)
import { chromium } from 'playwright';

const [out, dxs, dzs, time = '0.07'] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const msgs = [];
page.on('pageerror', (e) => msgs.push(e.message));
await page.goto(`http://localhost:3000/?seed=1337&debug&nomobs&class=mage${process.env.EXTRA ?? ''}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
const peak = await page.evaluate(() => {
  const s = window.__solrift;
  let best = { h: -1, x: 0, z: 0 };
  for (let x = -160; x <= 160; x += 8) for (let z = -160; z <= 160; z += 8) {
    const h = s.surfaceY(x, z);
    if (h > best.h) best = { h, x, z };
  }
  return best;
});
console.log('peak', peak);
const dx = Number(dxs);
const dz = Number(dzs);
const fx = peak.x + dx;
const fz = peak.z + dz;
await page.evaluate(([time]) => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
  window.__solrift.setMode('creative');
  window.__solrift.setFlying(true);
  window.__solrift.setTime(Number(time));
}, [time]);
const gy = await page.evaluate(([x, z]) => window.__solrift.surfaceY(x, z), [fx, fz]);
const fy = gy + 40;
const ty = peak.h * 0.5 + gy * 0.5;
const yaw = Math.atan2(-(peak.x - fx), -(peak.z - fz));
const pitch = Math.atan2(ty - fy, Math.hypot(dx, dz));
await page.evaluate(([x, y, z, yaw, pitch]) => window.__solrift.teleport(x, y, z, yaw, pitch), [fx, fy, fz, yaw, pitch]);
await sleep(14000);
await page.screenshot({ path: out });
await browser.close();
console.log('saved', out, msgs.slice(0, 4));
