// King Aurelion in motion: mid-stride, mid-strike and gathering a spell, from the 3/4 front, on the plain square platform.
// Saves screenshots/gilded/pose-*.png. Usage: node scripts/aurelion-poses.mjs [url]
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3000';
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
await sc(([k, y]) => window.__solrift.spawnMob(k, 0.5, y + 1, 0.5, 0), ['aurelion', sy]);
await sleep(1200);
const mob = async () => (await sc(() => window.__solrift.mobs().filter((m) => m.kind === 'aurelion')))[0];
const m0 = await mob();

const POSES = [
  ['walk-a', { speedNow: 2, walkPhase: Math.PI / 2 }],
  ['walk-b', { speedNow: 2, walkPhase: -Math.PI / 2 }],
  ['strike', { speedNow: 0, attackTime: 0.45 }],
  ['cast', { speedNow: 0, casting: true }],
];
for (const [name, flags] of POSES) {
  await sc(([i, m, f]) => window.__solrift.holdMob(i, { yaw: 0, pos: [m.x, m.y, m.z], ...f }), [m0.id, m0, flags]);
  await sleep(1400);
  const m = await mob();
  const dist = 11;
  const ang = 0.8;
  const cx = m.x + -Math.sin(m.yaw + ang) * dist;
  const cz = m.z + -Math.cos(m.yaw + ang) * dist;
  const dx = m.x - cx;
  const dz = m.z - cz;
  const yaw = Math.atan2(-dx, -dz);
  const pitch = Math.atan2(3.4 - 4.6, Math.hypot(dx, dz));
  await sc(([x, y, z, a, p]) => window.__solrift.teleport(x, y, z, a, p), [cx, m.y + 4.6, cz, yaw, pitch]);
  await sleep(500);
  await page.screenshot({ path: `screenshots/gilded/pose-${name}.png` });
  console.log('saved', name);
}
console.log('errors:', JSON.stringify(errors.slice(0, 5)));
await browser.close();
