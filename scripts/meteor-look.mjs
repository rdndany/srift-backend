// A Mage ability in the real game (the Meteor by default, or frost_nova, fireball, arcane_shield): a single-player mage casts it (the real ability command)
// looking at open ground ahead and a picture is taken from the caster's eyes (or from behind, with `behind`) whenever one can be taken,
// named for the mark in it and its age.
// Usage: node scripts/meteor-look.mjs [outDir] [url=http://localhost:3000] [eye|behind] [meteor|frost_nova|fireball|arcane_shield|piercing_shot|evasive_roll|bear_trap|rain_of_arrows]   (a dev server must be running)
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const outDir = process.argv[2] ?? 'screenshots/meteor-look';
const url = process.argv[3] ?? 'http://localhost:3000';
const view = process.argv[4] === 'behind' ? 1 : 0;
const ability = process.argv[5] ?? 'meteor';
const slot = { fireball: 0, frost_nova: 1, meteor: 2, arcane_shield: 3, piercing_shot: 0, evasive_roll: 1, bear_trap: 2, rain_of_arrows: 3 }[ability] ?? 2;
const cls = ['piercing_shot', 'evasive_roll', 'bear_trap', 'rain_of_arrows'].includes(ability) ? 'ranger' : 'mage';
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const msgs = [];
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
// (and the game's own word of a freeze, with the shaders built in it: the first cast of an ability must not make one)
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning' || /\[solrift\] freeze/.test(m.text())) && !/GPU stall|willReadFrequently|preload/.test(m.text()) && msgs.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => msgs.push(e.message));
await page.goto(`${url}/?seed=1337&debug&nomobs&class=${cls}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 240000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
});
const pos = await page.evaluate(() => window.__solrift.position());
const px = Math.floor(pos.x);
const pz = Math.floor(pos.z);
const gy = (await page.evaluate(([x, z]) => window.__solrift.surfaceY(x, z), [px, pz])) + 1;
await page.evaluate(() => window.__solrift.setTime(0.25));
// look a little down the way yaw 0 faces (towards -z), so the meteor lands some blocks ahead on the ground
await page.evaluate(([px, gy, pz]) => window.__solrift.teleport(px + 0.5, gy, pz + 0.5, 0, -0.22), [px, gy, pz]);
await page.evaluate(() => window.__solrift.addClassXp(100000));
await page.evaluate((v) => window.__solrift.setView(v), view);
await sleep(3000);
console.log('class', JSON.stringify(await page.evaluate(() => window.__solrift.classView())).slice(0, 300));
await page.evaluate((a) => window.__solrift.unlockAbility(a), ability);
await page.evaluate((slot) => window.__solrift.netCommand({ t: 'ability', slot }), slot);
// the game runs slower than the clock under software rendering: take a picture whenever one can be taken, named for the age of the mark in it
let shots = 0;
for (let i = 0; i < 30 && shots < 14; i++) {
  const fx = await page.evaluate(() => window.__solrift.fxList());
  if (i > 3 && fx.length === 0) break;
  const m = fx.find((f) => f.k === 'meteor_hit') ?? fx[0];
  const name = m ? `${String(shots).padStart(2, '0')}-${m.k}-${m.age.toFixed(2)}` : `${String(shots).padStart(2, '0')}-none`;
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('saved', name);
  shots++;
}
console.log('fx', JSON.stringify(await page.evaluate(() => window.__solrift.fxList())));
await browser.close();
console.log('messages', msgs.slice(0, 8));
