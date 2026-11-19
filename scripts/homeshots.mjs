// Scenery screenshots of the Adventure realm (Dawnwatch) for the home page: no HUD, no hand, sun shadows, ambient
// occlusion, bloom and sun shafts all on. 1920x1080 JPEGs.
// Usage: node scripts/homeshots.mjs [url] [outDir] [scene,scene...]
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3000';
const outDir = process.argv[3] ?? 'tmp-shots/scenes';
const only = process.argv[4]?.split(',');
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${url}/?world=adventure&debug&nomobs&class=mage&shadows=4096&postfx`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.() && window.__solrift.worldKind() === 'adventure', undefined, { timeout: 240000 });
await page.evaluate(() => {
  const st = document.createElement('style');
  st.textContent = 'body > :not(#game):not(script):not(style){display:none!important} nextjs-portal{display:none!important}';
  document.head.appendChild(st);
  const s = window.__solrift;
  s.setHandHidden(true);
  s.setRenderDistance(14);
  s.setPostfx({ menuBlur: false });
});
// (The pointer-lock overlay blurs the picture while it shows.)
const lock = () => page.evaluate(() => {
  const o = document.getElementById('overlay');
  if (o) o.style.display = 'none';
  window.__solrift.forceLock();
});
await lock();
await sleep(1500);
// (Any window the realm opened itself blurs it too.)
await page.keyboard.press('Escape');
await sleep(600);
await lock();

// [name, x, y(height above ground), z, yaw, pitch, time, weather]
const scenes = JSON.parse(process.env.SCENES ?? 'null') ?? [];
for (const [name, x, dy, z, yaw, pitch, time, weather = 'clear', opt = {}] of scenes) {
  if (only && !only.includes(name)) continue;
  await page.evaluate(([x, z]) => window.__solrift.teleport(x + 0.5, 200, z + 0.5), [x, z]);
  await sleep(4000);
  const y = await page.evaluate(([x, z]) => window.__solrift.surfaceY(x, z), [x, z]);
  await page.evaluate(([x, y, z, yaw, pitch, time, weather, opt]) => {
    const s = window.__solrift;
    if (opt.fly) s.setMode('creative');
    s.setFlying(!!opt.fly);
    s.setView(opt.view ?? 0);
    s.setTime(time);
    s.setWeather(weather);
    s.teleport(x + 0.5, y, z + 0.5, yaw, pitch);
  }, [x, y + dy, z, yaw, pitch, time, weather, opt]);
  await lock();
  await sleep(4500);
  await page.screenshot({ path: `${outDir}/${name}.jpg`, type: 'jpeg', quality: 86 });
  console.log('saved', name, 'ground', y);
}
await browser.close();
