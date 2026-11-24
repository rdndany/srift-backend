// First-use stalls: what the picture does the first time something appears after a fresh page load (wings, armor, a boss, a sword
// blow, a particle effect, a crowd). For each action: how long the call itself took (the page's thread was held), the slowest frame
// that followed, the median frame, and how many frames stood still for 100 ms or more.
// Drawn with the graphics card when there is one (see browser.mjs); compare runs of the same script (before / after).
// Usage: node scripts/first-use.mjs [out.json] [baseUrl]   (the dev server must be running)
import { launchBrowser } from './browser.mjs';
import { writeFileSync } from 'node:fs';

const out = process.argv[2] ?? '';
const base = process.argv[3] ?? 'http://localhost:3000/game?world=square&debug&nomobs&class=mage';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await launchBrowser();
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall|willReadFrequently|preload|Blit feedback/.test(m.text()) && console.log('console:', m.text().slice(0, 300)));
page.on('console', (m) => /\[solrift\] freeze/.test(m.text()) && console.log('   ' + m.text()));
page.on('pageerror', (e) => console.log('pageerror:', e.message));
const t0 = Date.now();
await page.goto(base, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 240000 });
const loadSeconds = (Date.now() - t0) / 1000;
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  const s = window.__solrift;
  s.forceLock();
  s.setMode('creative');
  s.setTime(0.3);
  const p = s.position();
  s.teleport(p.x, p.y, p.z, 0, 0);
  s.setView(1); // third person: the figure, with its wings and armor, is in the picture
  // The frame recorder: the gap between frames, and every long task.
  const F = (window.__ft = { frames: [], longs: [] });
  let last = performance.now();
  const tick = (now) => {
    F.frames.push(now - last);
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => F.longs.push(e.duration))).observe({ entryTypes: ['longtask'] });
  } catch {}
});
await sleep(6000);

const ACTIONS = [
  ['idle (baseline)', ''],
  ['wings 1: Cinderwings (bat)', 's.wearWings(1)'],
  ['wings 2: Skywings (feather)', 's.wearWings(2)'],
  ['wings 3: Gladewings (blade)', 's.wearWings(3)'],
  ['wings 6: Stormwings (feather, tier 2)', 's.wearWings(6)'],
  ['wings off', 's.wearWings(0)'],
  ['wings 1 again (second use)', 's.wearWings(1)'],
  ['wings off', 's.wearWings(0)'],
  ['armor: iron helmet', 's.setArmorSlot(0, s.itemId("iron_helmet"))'],
  ['armor: iron chest, legs, boots', '[1, 2, 3].forEach((i) => s.setArmorSlot(i, s.itemId(["", "iron_chestplate", "iron_leggings", "iron_boots"][i])))'],
  ['armor: diamond set', '[0, 1, 2, 3].forEach((i) => s.setArmorSlot(i, s.itemId(["diamond_helmet", "diamond_chestplate", "diamond_leggings", "diamond_boots"][i])))'],
  ['sword: held + first swing', 's.give(s.itemId("diamond_sword")); s.select(0); s.swingHand(1); s.swing()'],
  ['particles: block burst + dust + sparks', 'const p = s.position(); s.burst(p.x, p.y + 1, p.z - 3, 1); s.dust(p.x, p.y + 1, p.z - 3, 1); s.sparks(p.x, p.y + 1.5, p.z - 3, true)'],
  ['spawn King Aurelion', 'const p = s.position(); s.spawnMob("aurelion", p.x, p.y + 0.2, p.z - 9)'],
  ['spawn Gilded: imp, hound, drake, colossus', 'const p = s.position(); ["gilt_imp", "gilt_hound", "gilt_drake", "gilt_colossus"].forEach((k, i) => s.spawnMob(k, p.x - 6 + i * 4, p.y + 0.2, p.z - 12))'],
  ['spawn 12 mixed (zombie, skeleton, spider, creeper ...)', 'const p = s.position(); ["zombie", "skeleton", "spider", "creeper", "enderman", "husk", "stray", "drowned", "slime", "cave_spider", "pig", "cow"].forEach((k, i) => s.spawnMob(k, p.x - 10 + i * 2, p.y + 0.2, p.z - 5))'],
  ['spawn 30 zombies (a crowd)', 'const p = s.position(); for (let i = 0; i < 30; i++) s.spawnMob("zombie", p.x - 10 + (i % 10) * 2, p.y + 0.2, p.z - 14 - Math.floor(i / 10) * 2)'],
  ['class ability, slot 0', 's.addClassXp(5000); s.sendCommand({ t: "ability", slot: 0 })'],
  ['class ability, slot 1', 's.sendCommand({ t: "ability", slot: 1 })'],
  ['class ability, slot 2', 's.sendCommand({ t: "ability", slot: 2 })'],
  ['class ability, slot 3', 's.sendCommand({ t: "ability", slot: 3 })'],
  ['rift opens', 's.startRift("epic")'],
];

const results = [];
if (process.env.ACTION) ACTIONS.splice(0, ACTIONS.length, ['custom', process.env.ACTION]);
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null;
for (const [name, src] of ACTIONS) {
  if (ONLY && !ONLY.test(name)) continue;
  const r = await page.evaluate(
    async ({ src }) => {
      const F = window.__ft;
      F.frames.length = 0;
      F.longs.length = 0;
      const s = window.__solrift;
      const t0 = performance.now();
      try {
        new Function('s', src)(s);
      } catch (e) {
        return { error: String(e).slice(0, 200) };
      }
      const call = performance.now() - t0;
      await new Promise((r) => setTimeout(r, 2500));
      const f = F.frames.slice(1).sort((a, b) => a - b);
      return { call, worst: f[f.length - 1] ?? 0, median: f[Math.floor(f.length / 2)] ?? 0, frames: f.length, stalls: f.filter((x) => x >= 100).length, long: F.longs.reduce((a, b) => a + b, 0), longMax: Math.max(0, ...F.longs) };
    },
    { src },
  );
  results.push({ name, ...r });
  if (r.error) console.log(`${name.padEnd(54)} ERROR ${r.error}`);
  else console.log(`${name.padEnd(54)} call ${r.call.toFixed(0).padStart(5)} ms | worst frame ${r.worst.toFixed(0).padStart(5)} | median ${r.median.toFixed(0).padStart(4)} | >=100ms x${r.stalls} | longest task ${r.longMax.toFixed(0)}`);
  await sleep(500);
}
console.log(`\npage load to ready: ${loadSeconds.toFixed(1)} s`);
if (out) writeFileSync(out, JSON.stringify({ loadSeconds, results }, null, 1));
await browser.close();
