// Screenshot the leaves of a tree. Usage: node scripts/leaf-look.mjs outPrefix [leafId=7] [time=0.25] [seed=1337]   (env DIST = how far off)
// Leaf ids: 7 oak, 51 birch, 53 spruce, 1131 acacia, 1134 jungle, 1137 dark oak, 1140 cherry. The dev server must be running.
import { chromium } from 'playwright';

const [prefix, leaf = '7', time = '0.25', seed = '1337'] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const msgs = [];
page.on('console', (m) => m.type() === 'error' && !/GPU stall|willReadFrequently|preload/.test(m.text()) && msgs.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => msgs.push(e.message));
await page.goto(`http://localhost:3000/?seed=${seed}&debug&nomobs`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  const s = window.__solrift;
  s.forceLock();
  s.setMode('creative');
  s.setFlying(true);
  s.setHandHidden(true);
});
let found = null;
for (const [x, z] of [[0, 0], [60, 0], [-60, 0], [0, 60], [0, -60], [60, 60], [-60, -60], [60, -60], [-60, 60]]) {
  await page.evaluate(([x, z]) => window.__solrift.teleport(x, 100, z), [x, z]);
  await sleep(6000);
  found = await page.evaluate(([id, cx, cz]) => {
    const s = window.__solrift;
    let best = null;
    for (let dx = -45; dx <= 45; dx++)
      for (let dz = -45; dz <= 45; dz++) {
        const x = cx + dx;
        const z = cz + dz;
        const top = s.surfaceY(x, z);
        for (let y = top + 3; y < top + 14; y++) {
          if (s.getBlock(x, y, z) === id && s.getBlock(x, y - 1, z) === id) {
            const d = dx * dx + dz * dz;
            if (!best || d < best.d) best = { x, y, z, d };
            break;
          }
        }
      }
    return best;
  }, [Number(leaf), x, z]);
  if (found) break;
}
console.log('leaf', JSON.stringify(found));
if (!found) {
  await browser.close();
  process.exit(1);
}
const want = Number(process.env.DIST ?? 9);
const cam = await page.evaluate(([f, want]) => {
  const s = window.__solrift;
  const clear = (x, y, z) => s.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) === 0;
  for (let dist = want; dist >= 4; dist -= 1)
    for (let k = 0; k < 24; k++) {
      const yaw = (k / 24) * Math.PI * 2;
      for (const up of [0, 1, 2]) {
        const tx = f.x + 0.5;
        const ty = f.y + 0.5;
        const tz = f.z + 0.5;
        const cx = tx + Math.sin(yaw) * dist;
        const cz = tz + Math.cos(yaw) * dist;
        const cy = ty + up;
        let ok = clear(cx, cy, cz) && clear(cx, cy - 1, cz);
        for (let t = 0; ok && t < dist - 1.5; t += 0.5) ok = clear(cx + (tx - cx) * (t / dist), cy + (ty - cy) * (t / dist), cz + (tz - cz) * (t / dist));
        if (ok) return { x: cx, y: cy, z: cz, yaw, pitch: Math.atan2(ty - cy, dist) };
      }
    }
  return null;
}, [found, want]);
console.log('camera', JSON.stringify(cam));
await page.evaluate(([c, time]) => {
  const s = window.__solrift;
  s.setTime(Number(time));
  s.teleport(c.x, c.y - 1.6, c.z, c.yaw, c.pitch);
}, [cam, time]);
await sleep(Number(process.env.WAIT ?? 12000));
await page.screenshot({ path: `${prefix}.png` });
await browser.close();
console.log('saved', prefix, msgs.slice(0, 5));
