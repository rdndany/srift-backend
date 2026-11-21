// A look at the six monsters of the Hollow Deep (moss lurker, spore puff, ember wraith, ashen knight, hollow priest, shade): each in
// its poses (what the server's `casting` says it is doing), from the front and from the side, by day and by night, and a line-up of all
// six. They stand on a stone stage in the sky, pinned in place with `holdMob`. Saves screenshots/deep-mobs/*.png.
// Usage: node scripts/deep-mobs-look.mjs [url] [only-kind]
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3000';
const only = process.argv[3];
mkdirSync('screenshots/deep-mobs', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// kind: [camera distance, height of what to look at (above its feet), [poses: [name, casting, walking]]]
const KINDS = {
  moss_lurker: [3.4, 0.8, [['idle', 0, false], ['walk', 0, true], ['rise', 1, false]]],
  spore_puff: [2.0, 1.2, [['idle', 0, false], ['swell', 1, false]]],
  ember_wraith: [4.2, 1.8, [['idle', 0, false], ['gather', 1, false], ['throw', 3, false]]],
  ashen_knight: [4.4, 1.2, [['idle', 0, false], ['walk', 0, true], ['windup', 1, false], ['dash', 2, true], ['stagger', 3, false]]],
  hollow_priest: [4.4, 1.2, [['idle', 0, false], ['curse', 1, false], ['call', 2, false]]],
  shade: [4.4, 1.1, [['idle', 0, false], ['walk', 0, true], ['blink', 2, false]]],
};

const browser = await launchBrowser();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
await page.goto(`${url}/?seed=17&debug&nomobs`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
  window.__solrift.setMode('creative');
});
const site = await page.evaluate(() => window.__solrift.nearestVillage(0, 0));
await page.evaluate(([x, z]) => window.__solrift.teleport(x + 0.5, 150, z + 0.5), [site.x, site.z]);
await sleep(5000);
// A stone stage in the air over the village, with a dark cave-like ceiling kept off so the sky shows (night is set with setTime).
const spot = await page.evaluate(([cx, cz]) => {
  const s = window.__solrift;
  const y0 = s.surfaceY(cx, cz) + 25;
  for (let dx = -14; dx <= 14; dx++) for (let dz = -14; dz <= 14; dz++) {
    s.setBlock(cx + dx, y0, cz + dz, 1);
    for (let h = 1; h <= 8; h++) s.setBlock(cx + dx, y0 + h, cz + dz, 0);
  }
  return { x: cx, z: cz, y: y0 };
}, [site.x, site.z]);
await sleep(4000);
console.log('stage', JSON.stringify(spot));

const place = (kind, x, z, o) =>
  page.evaluate(
    ([kind, x, z, y, casting, walking]) => {
      const s = window.__solrift;
      const lift = kind === 'ember_wraith' || kind === 'spore_puff' ? 0.8 : 0;
      const id = s.spawnMob(kind, x, y + 1, z);
      const m = s.mobs().filter((q) => q.kind === kind).pop();
      s.holdMob(m.id, { pos: [x, y + 1 + lift, z], yaw: 0, speedNow: walking ? 2.4 : 0, walkPhase: walking ? 1.1 : 0, casting, hurtTime: 5, attackTime: 99, burning: false });
      return m.id;
    },
    [kind, x, z, spot.y, o.casting, o.walking],
  );
const shot = async (name, wait = 700) => {
  await sleep(wait);
  await page.screenshot({ path: `screenshots/deep-mobs/${name}.png` });
  console.log('saved', name);
};
// The camera stands at (cx, cz), bove over the target (its feet are at y0, its middle at mid), and looks at it.
const camera = (cx, cz, tx, tz, mid, above) => {
  const eye = spot.y + 1 + mid + above;
  const yaw = Math.atan2(-(tx - cx), -(tz - cz));
  const pitch = -Math.atan2(above, Math.hypot(tx - cx, tz - cz));
  return page.evaluate(([x, y, z, yaw, pitch]) => { window.__solrift.setFlying(true); window.__solrift.teleport(x, y, z, yaw, pitch); }, [cx, eye - 1.62, cz, yaw, pitch]);
};

for (const [time, label] of [[0.25, 'day'], [0.8, 'night']]) {
  await page.evaluate((t) => window.__solrift.setTime(t), time);
  for (const [kind, [dist, mid, poses]] of Object.entries(KINDS)) {
    if (only && only !== kind) continue;
    for (const [pose, casting, walking] of poses) {
      if (label === 'night' && pose !== 'idle' && pose !== 'windup' && pose !== 'throw' && pose !== 'call') continue;
      await page.evaluate(() => window.__solrift.clearMobs());
      const x = spot.x + 0.5;
      const z = spot.z + 0.5;
      await place(kind, x, z, { casting, walking });
      // Front, a little to one side and above.
      await camera(x - dist * 0.25, z - dist, x, z, mid, 0.3);
      await shot(`${kind}-${pose}-front-${label}`);
      if (pose === 'idle' || pose === 'walk') {
        // From the side and behind.
        await camera(x + dist * 0.8, z + dist * 0.6, x, z, mid, 0.4);
        await shot(`${kind}-${pose}-back-${label}`, 400);
      }
    }
  }
}

if (!only) {
  // The six side by side.
  await page.evaluate(() => { window.__solrift.clearMobs(); window.__solrift.setTime(0.8); });
  const kinds = Object.keys(KINDS);
  for (let i = 0; i < kinds.length; i++) await place(kinds[i], spot.x + 0.5 + (i - 2.5) * 2.2, spot.z + 0.5, { casting: 0, walking: false });
  await camera(spot.x + 0.5, spot.z - 9.5, spot.x + 0.5, spot.z + 0.5, 1.1, 1.0);
  await shot('lineup-night', 1000);
  await page.evaluate(() => window.__solrift.setTime(0.25));
  await shot('lineup-day', 800);
}
console.log('errors:', JSON.stringify(errors.slice(0, 5)));
await browser.close();
