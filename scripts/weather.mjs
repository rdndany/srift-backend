// Weather E2E: rain and thunderstorm visuals, sky dimming, roofs stopping rain, weather and mob
// persistence across reloads. Usage: node scripts/weather.mjs [url] [outDir]
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));

const failures = [];
const check = (cond, msg) => {
  if (cond) console.log('  ok  ', msg);
  else {
    console.log('  FAIL', msg);
    failures.push(msg);
  }
};
const sc = (fn, ...args) => page.evaluate(fn, ...args);
const shot = async (name, wait = 600) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('saved', name);
};
const boot = async (query) => {
  await page.goto(`${url}/?seed=1337&debug&nomobs${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 120000 });
  await page.evaluate(() => {
    document.getElementById('overlay').style.display = 'none';
    window.__solrift.forceLock();
  });
};

await boot('');
const pos = await sc(() => window.__solrift.position());
const px = Math.floor(pos.x);
const pz = Math.floor(pos.z);
const gy = await sc(([x, z]) => window.__solrift.surfaceY(x, z), [px, pz]);
await sc(
  ([px, pz, gy]) => {
    const s = window.__solrift;
    for (let x = px - 6; x <= px + 14; x++)
      for (let z = pz - 10; z <= pz + 10; z++) {
        for (let y = gy; y <= gy + 14; y++) s.setBlock(x, y, z, 0);
        s.setBlock(x, gy - 1, z, 3);
        s.setBlock(x, gy - 2, z, 2);
        s.setBlock(x, gy - 3, z, 1);
      }
    s.setTime(0.25);
    s.teleport(px + 0.5, gy, pz + 0.5, -Math.PI / 2, -0.15);
  },
  [px, pz, gy],
);
await page.waitForTimeout(1500);

console.log('clear sky');
const clear = await sc(() => ({ w: window.__solrift.weather(), b: window.__solrift.brightness() }));
check(clear.w.kind === 'clear' && clear.w.rain === 0, 'starts clear');
await shot('weather-clear', 300);

console.log('rain');
await sc(() => window.__solrift.setWeather('rain'));
// The front fades in over 15 s of simulated time; sample partway to check it is gradual.
await page.waitForTimeout(4000);
const mid = await sc(() => window.__solrift.weather());
check(mid.rain > 0.05 && mid.rain < 1, `rain fades in gradually (${mid.rain.toFixed(2)})`);
await page.waitForFunction(() => window.__solrift.weather().rain === 1, undefined, { timeout: 90000 });
const wet = await sc(() => ({ w: window.__solrift.weather(), b: window.__solrift.brightness() }));
check(wet.w.rain === 1, 'rain at full intensity');
check(wet.b < clear.b - 0.2, `sky is darker in rain (${clear.b.toFixed(2)} -> ${wet.b.toFixed(2)})`);
await shot('weather-rain', 300);

console.log('thunderstorm');
await sc(() => window.__solrift.setWeather('thunder'));
await page.waitForFunction(() => window.__solrift.weather().storm === 1, undefined, { timeout: 90000 });
const storm = await sc(() => ({ w: window.__solrift.weather(), b: window.__solrift.brightness() }));
check(storm.w.storm === 1, 'storm at full intensity');
// Compare the weather's own darkness: a random lightning flash can briefly brighten the sampled sky.
check(storm.w.darkness > wet.w.darkness, `storm is darker than rain (${wet.w.darkness.toFixed(2)} -> ${storm.w.darkness.toFixed(2)})`);
await shot('weather-storm', 200);
await sc(() => window.__solrift.strike());
await shot('weather-lightning', 40);

console.log('shelter');
await sc(
  ([px, pz, gy]) => {
    const s = window.__solrift;
    // A little hut: roof over the player, open to the front.
    for (let x = px - 1; x <= px + 5; x++) for (let z = pz - 2; z <= pz + 2; z++) s.setBlock(x, gy + 3, z, 10);
    s.teleport(px + 1.5, gy, pz + 0.5, -Math.PI / 2, -0.1);
  },
  [px, pz, gy],
);
await page.waitForTimeout(1500);
// Drops already under the roof fall out of it within a few frames; the software renderer has few, so give it time.
let under = await sc(([a, b, c, d, y]) => window.__solrift.rainDrops(a, b, c, d, y), [px, px + 5.9, pz - 1.9, pz + 2.9, gy + 3]);
for (let i = 0; i < 40 && under > 0; i++) {
  await page.waitForTimeout(500);
  under = await sc(([a, b, c, d, y]) => window.__solrift.rainDrops(a, b, c, d, y), [px, px + 5.9, pz - 1.9, pz + 2.9, gy + 3]);
}
const outside = await sc(([a, b, c, d, y]) => window.__solrift.rainDrops(a, b, c, d, y), [px + 7, px + 13, pz - 8, pz + 8, gy + 10]);
check(under === 0, `no rain falls under the roof (${under})`);
check(outside > 20, `rain falls in the open (${outside})`);
await shot('weather-sheltered', 100);

console.log('persistence');
await sc(() => window.__solrift.setWeather('rain'));
await sc(() => window.__solrift.clearMobs());
await sc(([x, y, z]) => window.__solrift.spawnMob('pig', x, y, z), [px + 3.5, gy, pz + 2.5]);
await sc(([x, y, z]) => window.__solrift.spawnMob('cow', x, y, z), [px + 4.5, gy, pz - 2.5]);
await page.waitForTimeout(600);
// Force a save, then reload the page: weather and animals must come back.
await sc(() => window.__solrift.save());
await page.waitForTimeout(500);
const saved = JSON.parse(await sc(() => window.__solrift.savedState()));
check(saved.world?.weather?.kind === 'rain', 'weather is saved');
check(Array.isArray(saved.player?.mobs) && saved.player.mobs.length === 2, `mobs are saved (${saved.player?.mobs?.length})`);
await boot('');
await page.waitForTimeout(1500);
const back = await sc(() => ({ w: window.__solrift.weather(), m: window.__solrift.mobs() }));
check(back.w.kind === 'rain' && back.w.rain === 1, 'rain resumes after reload');
check(back.m.filter((m) => m.kind === 'pig' || m.kind === 'cow').length === 2, `mobs resume after reload (${back.m.map((m) => m.kind).join(',')})`);
await shot('weather-restored', 800);

check(errors.filter((e) => !/favicon|WebSocket|ERR_CONNECTION/i.test(e)).length === 0, 'no console errors: ' + errors.slice(0, 3).join(' | '));
await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log('weather OK');
