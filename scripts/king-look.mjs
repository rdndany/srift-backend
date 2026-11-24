// A boss (the Hollow King by default) from the front, the sides, three-quarters, behind, above and close up on his head and hands, in the poses that matter.
// He stands on a stone stage in the sky, pinned in place with the page's `__look` driver (see creature-look.mjs). Saves screenshots/boss/<kind>-<time>-<pose>.png.
// Usage: node scripts/king-look.mjs [url] [pose,pose] [kind] [day|night]     poses: idle walk swing-0.3 swing-0.52 swing-0.62 swing-0.8 cast hurt death-0.3 death-0.6
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3200';
const only = process.argv[3] && process.argv[3] !== 'all' ? process.argv[3].split(',') : ['idle', 'walk', 'swing-0.52', 'swing-0.62', 'cast'];
const kind = process.argv[4] ?? 'hollow_king';
const night = process.argv[5] === 'night';
const NIGHT = night;
const S = kind === 'hollow_king' ? 2.3 : 1; // how much bigger than a man-sized view the camera stands
mkdirSync('screenshots/boss', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Where the camera is, round the boss: the angle (0 in front of him, going round to his right (+x, the sword side)), the distance.
// (name, angle, distance, the height he is looked at, and optionally how high the camera is above that.) The angle is measured to his left: -90 is his right.
const VIEWS = [
  ['front', 0, 15 * S / 2.3, 4.5 * S / 2.3],
  ['three-quarter', -40, 15 * S / 2.3, 4.5 * S / 2.3],
  ['side', -90, 15 * S / 2.3, 4.5 * S / 2.3],
  ['other side', 90, 15 * S / 2.3, 4.5 * S / 2.3],
  ['back', 180, 15 * S / 2.3, 4.5 * S / 2.3],
  ['above', 25, 12 * S / 2.3, 4.5 * S / 2.3, 8 * S / 2.3],
  ['head', -25, 5.5 * S / 2.3, 8 * S / 2.3],
  ['face', 0, 4.6 * S / 2.3, 8.4 * S / 2.3, 0.2],
  ['chest', 0, 7 * S / 2.3, 6.4 * S / 2.3, 0.2],
  ['hands', -30, 7 * S / 2.3, 2 * S / 2.3],
  ['legs', 30, 8 * S / 2.3, 1.6 * S / 2.3],
];

const wantViews = process.argv[6] ? process.argv[6].split(',') : null;
const browser = await launchBrowser();
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
await page.goto(`${url}/?seed=17&debug&nomobs`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate((night) => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
  window.__solrift.setMode('creative');
  window.__solrift.setTime(night ? 0.8 : 0.3);
}, NIGHT);
const site = await page.evaluate(() => window.__solrift.nearestVillage(0, 0));
await page.evaluate(([x, z]) => window.__solrift.teleport(x + 0.5, 150, z + 0.5), [site.x, site.z]);
await sleep(5000);
const spot = await page.evaluate(([cx, cz]) => {
  const s = window.__solrift;
  const y0 = s.surfaceY(cx, cz) + 25;
  for (let dx = -30; dx <= 30; dx++) for (let dz = -12; dz <= 12; dz++) {
    s.setBlock(cx + dx, y0, cz + dz, 1);
    for (let h = 1; h <= 14; h++) s.setBlock(cx + dx, y0 + h, cz + dz, 0);
  }
  return { x: cx, z: cz, y: y0 };
}, [site.x, site.z]);
await sleep(4000);

await page.evaluate(([spot, kind]) => {
  window.__kind = kind;
  const s = window.__solrift;
  const L = (window.__look = { spot, fn: null, t0: 0, id: 0, cam: { az: 0, dist: 5.5, mid: 1.5 } });
  L.start = (fn) => {
    s.clearMobs();
    s.spawnMob(window.__kind, spot.x + 0.5, spot.y + 1, spot.z + 0.5);
    const m = s.mobs().filter((q) => q.kind === window.__kind).pop();
    L.id = m.id;
    const mob = s.rawMob(m.id);
    const pin = (o, key, get) => Object.defineProperty(o, key, { get, set: () => undefined, configurable: true, enumerable: true });
    L.fn = fn;
    L.t0 = performance.now();
    const read = (k) => () => (L.fn ? L.fn((performance.now() - L.t0) / 1000)[k] : 0);
    for (const k of ['yaw', 'speedNow', 'walkPhase', 'casting', 'hurtTime', 'attackTime', 'dead', 'deathTime']) pin(mob, k, read(k));
    for (const k of ['x', 'y', 'z']) pin(mob.body, k, read(k));
    const follow = () => {
      if (!L.fn) return;
      const p = L.fn((performance.now() - L.t0) / 1000);
      // The camera goes round him by `az` from the way he faces (he faces -z at yaw 0; his forward is (-sin yaw, -cos yaw)), looking at his middle.
      const a = p.yaw + (L.cam.az * Math.PI) / 180;
      const cx = p.x - Math.sin(a) * L.cam.dist;
      const cz = p.z - Math.cos(a) * L.cam.dist;
      const ty = p.y + L.cam.mid;
      const eye = p.y + L.cam.mid + (L.cam.up ?? 0.7);
      const yaw = Math.atan2(-(p.x - cx), -(p.z - cz));
      const pitch = -Math.atan2(eye - ty, L.cam.dist);
      s.setFlying(true);
      s.teleport(cx, eye - 1.62, cz, yaw, pitch);
      requestAnimationFrame(follow);
    };
    requestAnimationFrame(follow);
  };
  L.make = (pose) => {
    const base = { x: spot.x + 0.5 - 20, y: spot.y + 1, z: spot.z + 0.5, yaw: 0, speedNow: 0, walkPhase: 0, casting: 0, hurtTime: 5, attackTime: 99, dead: false, deathTime: 0 };
    const stand = { ...base, x: spot.x + 0.5 };
    if (pose === 'walk' || pose === 'run') {
      const v = 2.1;
      return (t) => ({ ...base, yaw: -Math.PI / 2, x: base.x + v * Math.max(0, t - 0.4), speedNow: t < 0.4 ? 0 : v });
    }
    if (pose.startsWith('swing-')) return () => ({ ...stand, attackTime: Number(pose.slice(6)) * 1.5 });
    if (pose === 'cast') return () => ({ ...stand, casting: 1 });
    if (pose === 'hurt') return () => ({ ...stand, hurtTime: 0.1 });
    if (pose.startsWith('death-')) return (t) => ({ ...stand, dead: true, deathTime: Number(pose.slice(6)) });
    return () => stand;
  };
}, [spot, kind]);

const shot = async () => (await page.screenshot({ type: 'jpeg', quality: 88, clip: { x: 200, y: 60, width: 560, height: 420 } })).toString('base64');
const sheet = async (name, imgs, labels) => {
  const p = await page.context().newPage();
  const cols = imgs.length <= 4 ? 2 : 3;
  await p.setViewportSize({ width: cols * 560, height: Math.ceil(imgs.length / cols) * 420 });
  await p.setContent(
    `<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(${cols},560px);font:bold 22px sans-serif;color:#fff">${imgs
      .map((b, i) => `<div style="position:relative"><img src="data:image/jpeg;base64,${b}"><span style="position:absolute;left:10px;top:8px;text-shadow:0 0 4px #000">${labels[i]}</span></div>`)
      .join('')}</body>`,
  );
  await p.screenshot({ path: `screenshots/boss/${kind}-${night ? 'night' : 'day'}-${name}.png` });
  await p.close();
  console.log('saved', name);
};

for (const pose of only) {
  const moving = pose === 'walk' || pose === 'run';
  await page.evaluate((pose) => window.__look.start(window.__look.make(pose)), pose);
  const imgs = [];
  const labels = [];
  for (const [name, az, dist, mid, up] of VIEWS.filter((v) => !wantViews || wantViews.includes(v[0]))) {
    await page.evaluate(([az, dist, mid, up]) => (window.__look.cam = { az, dist, mid: mid ?? 1.5, up }), [az, dist, mid, up]);
    await sleep(moving ? 1800 : 700);
    imgs.push(await shot());
    labels.push(`${pose} ${name}`);
  }
  await sheet(pose, imgs, labels);
  await page.evaluate(() => (window.__look.fn = null));
}
console.log(errors.length ? `ERRORS:\n${[...new Set(errors)].slice(0, 12).join('\n')}` : 'no console errors');
await browser.close();
