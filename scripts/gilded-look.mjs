// A look at the five monsters of the Gilded Tide on the plain square platform: each from the front, the 3/4 and the back, in daylight,
// and the king in the dark. Saves screenshots/gilded/*.png. Usage: node scripts/gilded-look.mjs [url] [only-this-kind]
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3000';
const only = process.argv[3];
mkdirSync('screenshots/gilded', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await launchBrowser();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const sc = (fn, ...a) => page.evaluate(fn, ...a);

await page.goto(`${url}/game?world=square&debug&nomobs&class=warrior`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), null, { timeout: 180000 });
await sc(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
  window.__solrift.setMode('creative');
  window.__solrift.setFlying(true);
  window.__solrift.setHandHidden(true);
  window.__solrift.setWeather('clear');
  window.__solrift.setTime(0.3);
});
const sy = await sc(() => window.__solrift.surfaceY(0.5, 0.5));
await sc((y) => window.__solrift.teleport(0.5, y + 3, 14.5, 0, 0), sy);
await sleep(2500);

// kind, camera distance, height of the camera, height looked at
const KINDS = [
  ['gilt_imp', 4, 1.4, 0.7],
  ['gilt_hound', 5, 1.6, 0.6],
  ['gilt_drake', 6, 2.2, 1.1],
  ['gilt_colossus', 11, 3.4, 2],
  ['aurelion', 20, 5, 3.2],
];
let n = 0;
for (const [kind, dist, h, aim] of KINDS) {
  if (only && kind !== only) continue;
  await sc(([k, y]) => window.__solrift.spawnMob(k, 0.5, y + 1, 0.5, 0), [kind, sy]);
  await sleep(1200);
  const mob = async () => (await sc((k) => window.__solrift.mobs().filter((m) => m.kind === k), kind))[0];
  const m0 = await mob();
  console.log(kind, JSON.stringify(m0));
  await sc(([i, m]) => window.__solrift.holdMob(i, { yaw: 0, speedNow: 0, pos: [m.x, m.y, m.z] }), [m0.id, m0]);
  for (const [name, ang] of [['front', 0], ['34', 0.8], ['side', Math.PI / 2], ['back', Math.PI]]) {
    const m = await mob();
    const fx = -Math.sin(m.yaw + ang);
    const fz = -Math.cos(m.yaw + ang);
    const cx = m.x + fx * dist;
    const cz = m.z + fz * dist;
    const dx = m.x - cx;
    const dz = m.z - cz;
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.atan2(m.y + aim - (m.y + h), Math.hypot(dx, dz));
    await sc(([x, y, z, a, p]) => window.__solrift.teleport(x, y, z, a, p), [cx, m.y + h, cz, yaw, pitch]);
    await sleep(500);
    await page.screenshot({ path: `screenshots/gilded/${String(++n).padStart(2, '0')}-${kind}-${name}.png` });
    console.log('saved', kind, name);
  }
  if (kind === 'aurelion') {
    await sc(() => window.__solrift.setTime(0.8));
    await sleep(1500);
    const m = await mob();
    const cx = m.x;
    const cz = m.z - 20;
    await sc(([x, y, z]) => window.__solrift.teleport(x, y, z, Math.PI, -0.1), [cx, m.y + 5, cz]);
    await sleep(600);
    await page.screenshot({ path: `screenshots/gilded/${String(++n).padStart(2, '0')}-aurelion-night.png` });
    await sc(() => window.__solrift.setTime(0.3));
  }
  await sc(() => window.__solrift.clearMobs());
}
console.log('errors:', JSON.stringify(errors.slice(0, 5)));
await browser.close();
