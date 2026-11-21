// A look at the Hollow King's model on the plain square platform (no dungeon needed): close, medium and far, from the front, the
// 3/4 and the side, from above, in the dark and in daylight, with the arms raised (casting), and hurt.
// Saves screenshots/boss-fire/*.png. Usage: node scripts/boss-model-look.mjs [url] [only-this-shot]
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3000';
const only = process.argv[3];
mkdirSync('screenshots/boss-fire', { recursive: true });
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
});
const sy = await sc(() => window.__solrift.surfaceY(0.5, 0.5));
await sc((y) => window.__solrift.teleport(0.5, y + 3, 14.5, 0, 0), sy);
await sleep(2500);
const id = await sc((y) => window.__solrift.spawnMob('hollow_king', 0.5, y + 1, 0.5, 0), sy);
await sleep(1500);
const king = async () => (await sc(() => window.__solrift.mobs().filter((m) => m.kind === 'hollow_king')))[0];
const k0 = await king();
console.log('king', JSON.stringify(k0));
// Hold him still, facing -Z.
await sc(([i, k0]) => window.__solrift.holdMob(i, { yaw: 0, speedNow: 0, pos: [k0.x, k0.y, k0.z] }), [k0.id, k0]);

let n = 0;
const shot = async (name, { dist = 14, ang = 0, h = 4, aim = 4, wait = 500 } = {}) => {
  if (only && !name.includes(only)) return;
  const k = await king();
  // The camera stands `dist` away from him at `ang` (0: in front of him), `h` above his feet, and looks at the point `aim` up his body.
  const fx = -Math.sin(k.yaw + ang);
  const fz = -Math.cos(k.yaw + ang);
  const cx = k.x + fx * dist;
  const cz = k.z + fz * dist;
  const dx = k.x - cx;
  const dz = k.z - cz;
  const yaw = Math.atan2(-dx, -dz);
  const pitch = Math.atan2(k.y + aim - (k.y + h), Math.hypot(dx, dz));
  await sc(([x, y, z, a, p]) => window.__solrift.teleport(x, y, z, a, p), [cx, k.y + h, cz, yaw, pitch]);
  await sleep(wait);
  await page.screenshot({ path: `screenshots/boss-fire/${String(++n).padStart(2, '0')}-${name}.png` });
  console.log('saved', name);
};

await sc(() => window.__solrift.setTime(0.3));
await sleep(800);
await shot('day-front-far', { dist: 22, h: 5 });
await shot('day-front-med', { dist: 14, h: 4.5 });
await shot('day-front-close', { dist: 8, h: 4.5, aim: 5 });
await shot('day-34', { dist: 14, ang: 0.8, h: 4.5 });
await shot('day-side', { dist: 14, ang: Math.PI / 2, h: 4.5 });
await shot('day-back', { dist: 14, ang: Math.PI, h: 5 });
await shot('day-above', { dist: 10, ang: 0.5, h: 14, aim: 3 });
await shot('day-fist', { dist: 6, ang: -0.6, h: 2.5, aim: 2.5 });
await sc(() => window.__solrift.setTime(0.8));
await sleep(1500);
await shot('night-front-far', { dist: 22, h: 5 });
await shot('night-front-med', { dist: 14, h: 4.5 });
await shot('night-34-close', { dist: 9, ang: 0.8, h: 4.5, aim: 5 });
await shot('night-back', { dist: 14, ang: Math.PI, h: 5 });
await sc(([i, k0]) => window.__solrift.holdMob(i, { yaw: 0, speedNow: 0, pos: [k0.x, k0.y, k0.z], casting: true }), [k0.id, k0]);
await sleep(1200);
await shot('night-cast', { dist: 15, h: 4.5 });
await sc(([i, k0]) => window.__solrift.holdMob(i, { yaw: 0, speedNow: 0, pos: [k0.x, k0.y, k0.z], casting: false, hurtTime: 0.1 }), [k0.id, k0]);
await sleep(200);
await shot('night-hurt', { dist: 14, h: 4.5, wait: 100 });
await sc(([i]) => window.__solrift.holdMob(i), [k0.id]);
console.log('errors:', JSON.stringify(errors.slice(0, 5)));
await browser.close();
