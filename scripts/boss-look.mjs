// A look at the Hollow King: him asleep, the boss frame when the fight begins, a spell being gathered and its mark on
// the floor, and the second phase (warded). Saves screenshots/boss/*.png. Usage: node scripts/boss-look.mjs [url]
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3000';
mkdirSync('screenshots/boss', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(100);
  }
  return false;
};
const browser = await launchBrowser();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const sc = (fn, ...a) => page.evaluate(fn, ...a);
const shot = async (name, wait = 500) => {
  await sleep(wait);
  await page.screenshot({ path: `screenshots/boss/${name}.png` });
  console.log('saved', name);
};

await page.goto(`${url}/game?world=adventure&debug&nomobs&class=warrior`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.() && window.__solrift.worldKind() === 'adventure', null, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
});
await sc(() => window.__solrift.addXp(5000));
await sc(() => window.__solrift.give(504, 1)); // the Hollow Sigil, the key the portal asks for
const chapelY = await sc(() => window.__solrift.surfaceY(86.5, 0.5));
await sc((y) => window.__solrift.teleport(86.5, y + 2.5, 0.5, -Math.PI / 2, -0.1), chapelY);
await sleep(1500);
await sc(() => window.__solrift.setFlying(false));
let carried = false;
for (let y = chapelY - 6; y <= chapelY && !carried; y++) {
  await sc((yy) => window.__solrift.teleport(92.5, yy, 0.5, -Math.PI / 2, 0), y);
  carried = await until(() => sc(() => window.__solrift.position().x > 4000), 600);
}
console.log('in the dungeon:', carried);
const kings = () => sc(() => window.__solrift.mobs().filter((m) => m.kind === 'hollow_king'));
console.log('kings:', JSON.stringify(await kings()));

// Asleep: seen from the door of his hall.
await sc(() => window.__solrift.setFlying(true));
await sc(() => window.__solrift.teleport(4161.5, 64, 4128.5, -Math.PI / 2, 0.05));
await shot('asleep', 3000);
await sc(() => window.__solrift.teleport(4168.5, 64, 4126.5, -Math.PI / 2 - 0.2, 0.05));
await sleep(300);
console.log('boss frame while asleep:', await sc(() => !!document.querySelector('[data-testid=boss-frame]')), JSON.stringify(await sc(() => window.__solrift.position())), JSON.stringify((await kings())[0]));

// The fight begins when someone is within his reach.
await sc(() => window.__solrift.setFlying(false));
await sc(() => window.__solrift.teleport(4165.5, 64, 4128.5, -Math.PI / 2, 0.05));
await until(() => sc(() => !!document.querySelector('[data-testid=boss-frame]')), 8000);
await shot('frame', 600);
console.log('boss frame:', await sc(() => document.querySelector('[data-testid=boss-frame]')?.textContent));

// The first spell is Ember Slam, ten seconds in. Stay at range and watch it being gathered.
await sc(() => window.__solrift.teleport(4162.5, 64, 4120.5, -Math.PI / 2, 0.1));
const cast = await until(() => sc(() => !!document.querySelector('[data-testid=boss-cast]')), 25000);
console.log('saw a cast:', cast, await sc(() => document.querySelector('[data-testid=boss-cast]')?.textContent));
await shot('cast', 500);

// Second phase: hurt him to 65% and the court is called.
const king = (await kings())[0];
if (king) {
  await sc((id) => window.__solrift.damageMob(id, 300), king.id);
}
await sc(() => window.__solrift.teleport(4162.5, 64, 4124.5, -Math.PI / 2, 0.1));
await until(() => sc(() => document.querySelector('[data-testid=boss-frame]')?.textContent?.includes('Warded') ?? false), 8000);
await shot('phase2', 600);
console.log('phase 2 frame:', await sc(() => document.querySelector('[data-testid=boss-frame]')?.textContent));
console.log('errors:', JSON.stringify(errors));
await browser.close();
