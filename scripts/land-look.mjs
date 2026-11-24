// The Land Surveyor in a real browser: its stakes, beams and walls of light draw (the shaders compile), the corners follow the mouse,
// the live price and the confirmation show what the server said, and nothing is left in the world when it is put away.
// The server's replies are played by the page itself (a single-player game has no land), so this checks the client alone;
// the server's side is tested in apps/server/src/landRoom.test.ts.
// Usage: node scripts/land-look.mjs [url] [outDir]   (a web server is needed: `next dev -p 3200`, or scripts/e2e.mjs's)
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3200';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const check = (cond, msg) => {
  if (cond) console.log('  ok  ', msg);
  else {
    console.log('  FAIL', msg);
    failures.push(msg);
  }
};

const browser = await launchBrowser();
const errors = [];
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall|X3595|willReadFrequently|preload|Blit feedback|favicon/.test(m.text()) && errors.push(m.text().slice(0, 400)));
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${url}/?seed=1337&debug&noshadows&noaa&nohalos&postfx`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 240000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  const s = window.__solrift;
  s.forceLock();
  s.setTime(0.25);
  s.setMode('creative');
});
const hook = (fn, ...args) => page.evaluate(([f, a]) => window.__solrift[f](...a), [fn, args]);
const deliver = (events) => page.evaluate((e) => window.__solrift.deliver(e), events);
const text = (testid) => page.evaluate((id) => document.querySelector(`[data-testid="${id}"]`)?.innerText ?? null, testid);
const has = (testid) => page.evaluate((id) => !!document.querySelector(`[data-testid="${id}"]`), testid);

// The server's word about this world's land, and a Surveyor in the hand.
const cfg = { pricePerBlock: 5, minCorners: 3, maxCorners: 12, minEdge: 3, minArea: 25, maxArea: 10000, maxSpan: 128, maxClaims: 5, maxTotalArea: 20000, depth: 16, height: 64, edgeBuffer: 2, releaseGraceHours: 72, refundPercent: 50, restoreHoursMin: 48, restoreHoursMax: 72, regenEnabled: true };
await hook('clearInventory');
await hook('give', 620, 1);
await hook('select', 0);
const spawn = await hook('position');
console.log('before the server speaks of land: nothing');
await sleep(500);
check(!(await has('land-keys')), 'no land interface while the world has not said it has land');
await deliver([{ t: 'land', e: { k: 'cfg', cfg } }]);
await sleep(600);
check(await has('land-keys'), 'the keys of the Surveyor show while it is held');
check(await has('land-tutorial'), 'the first time, the tutorial card explains the steps');
await page.screenshot({ path: `${outDir}/land-1-held.png` });

console.log('marking corners with the mouse');
const turn = async (yaw, pitch) => {
  await hook('look', yaw, pitch);
  await sleep(250);
};
const click = async (shot) => {
  await page.mouse.click(640, 360);
  if (shot) {
    // The staff is being driven in: its wind-up is over a hundred milliseconds in, the blow a little after.
    for (const [ms, name] of shot) {
      await sleep(ms);
      await page.screenshot({ path: `${outDir}/${name}.png` });
    }
  }
  await sleep(250);
};
const corners = [
  [0.0, -0.16],
  [-0.9, -0.16],
  [-1.9, -0.16],
  [-2.8, -0.16],
];
let first = true;
for (const [yaw, pitch] of corners) {
  await turn(yaw, pitch);
  await click(first ? [[110, 'staff-1-windup'], [90, 'staff-2-plant']] : undefined);
  first = false;
}
const afterClicks = await page.evaluate(() => document.querySelector('[data-testid="land-price"]')?.innerText ?? '');
check(/Corners\s*4/.test(afterClicks) || /4 \/ 12/.test(afterClicks), `four corners are marked (price panel: ${afterClicks.replace(/\s+/g, ' ').slice(0, 80)})`);
await page.screenshot({ path: `${outDir}/land-2-corners.png` });
const seen = await page.evaluate(() => window.__solrift.land?.());
console.log('  (client land state)', JSON.stringify(seen ?? null));

console.log('the server prices the shape');
await deliver([{ t: 'land', e: { k: 'preview', preview: { ok: true, status: 'available', text: 'Available Land', corners: 4, area: 400, pricePerBlock: 5, price: 2000, balance: 5000, depth: 16, maxArea: 10000, claimsLeft: 4, areaLeft: 19600 } } }]);
await sleep(500);
const status = await text('land-status');
check(status === 'Available Land', `the panel says "${status}"`);
await page.screenshot({ path: `${outDir}/land-3-priced.png` });

console.log('E closes the shape, the next E asks to confirm');
await page.keyboard.press('KeyE');
await sleep(400);
await page.keyboard.press('KeyE');
await sleep(700);
check(await has('land-confirm'), 'the confirmation is up');
await deliver([{ t: 'land', e: { k: 'preview', preview: { ok: true, status: 'available', text: 'Available Land', corners: 4, area: 400, pricePerBlock: 5, price: 2000, balance: 5000, depth: 16, maxArea: 10000, claimsLeft: 4, areaLeft: 19600 } } }]);
await sleep(400);
check((await text('land-total'))?.includes('2,000'), `the total is shown (${await text('land-total')})`);
check((await page.evaluate(() => document.querySelector('.land-note')?.innerText ?? '')).includes('48 to 72 hours'), 'it explains what is permanent and what regenerates');
await page.screenshot({ path: `${outDir}/land-4-confirm.png` });

console.log('buying');
await page.evaluate(() => document.querySelector('[data-testid="land-buy"]').click());
await sleep(300);
await deliver([{ t: 'land', e: { k: 'result', what: 'buy', result: { ok: true, code: 'ok', text: 'Land Claimed! Your property is now protected.', charged: 2000 } } }]);
await sleep(700);
check(!(await has('land-confirm')), 'the confirmation closes once it is sold');
await page.screenshot({ path: `${outDir}/land-5-celebration.png` });
await sleep(500);
await page.screenshot({ path: `${outDir}/staff-3-claim-high.png` });
await sleep(1200);
await page.screenshot({ path: `${outDir}/land-6-celebration-later.png` });

console.log('putting it away leaves nothing');
await hook('clearInventory');
await sleep(600);
check(!(await has('land-keys')), 'the keys are gone');
await page.screenshot({ path: `${outDir}/land-7-away.png` });

console.log('the window of the lands');
await hook('give', 620, 1);
await hook('select', 0);
await sleep(300);
await page.keyboard.press('KeyB');
await sleep(500);
check(await has('land-manage'), 'B opens the window of the lands');
await page.screenshot({ path: `${outDir}/land-8-manage.png` });

console.log('home on the map in the hand');
await page.keyboard.press('Escape');
await sleep(300);
const claim = (id, box) => ({ id, name: 'Home', owner: 'me', kind: 'mine', role: 'owner', vertices: [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]], area: 400, box, status: 'active', releaseAt: null, depth: 16, rev: 1, can: { build: true, containers: true, stations: true, doors: true, manage: true, release: true }, shared: false, price: 2000, paid: 2000, createdAt: 0 });
await deliver([{ t: 'land', e: { k: 'mine', claims: [claim('lc_a', [-140, -100, -121, -81]), claim('lc_far', [-600, -400, -581, -381])] } }]);
await hook('clearInventory');
await hook('give', 390, 1);
await hook('select', 0);
await hook('look', 0, -0.9);
await sleep(1200);
check(!(await has('land-keys')), 'the Surveyor is not held');
await page.screenshot({ path: `${outDir}/land-9-map.png` });

console.log("the server's own territory");
{
  const px = Math.floor(spawn.x);
  const pz = Math.floor(spawn.z);
  const zone = { id: 't:look', name: 'Dawnwatch', kind: 'town', box: [px - 12, pz - 12, px + 12, pz + 12], vertices: [[px - 12, pz - 12], [px + 12, pz - 12], [px + 12, pz + 12], [px - 12, pz + 12]] };
  await hook('clearInventory');
  await hook('give', 620, 1);
  await hook('select', 0);
  await deliver([{ t: 'land', e: { k: 'cfg', cfg } }, { t: 'land', e: { k: 'zones', zones: [zone] } }]);
  await hook('look', 0.3, -0.8);
  await sleep(1500);
  const st = await page.evaluate(() => window.__solrift.land());
  check(st.zones.length === 1 && st.zones[0].name === 'Dawnwatch', `the client has the territory (${JSON.stringify(st.zones)})`);
  check(st.look?.kind === 'protected' && st.look.canBuild === false, `the readout names it (${JSON.stringify(st.look)})`);
  check((await text('land-look'))?.includes('Server territory'), `and says it is the server's (${(await text('land-look'))?.replace(/\s+/g, ' ')})`);
  await page.screenshot({ path: `${outDir}/land-10-territory.png` });
}

console.log('the marks of a straight shape');
{
  // A stone platform above the shore: flat, dry ground to look at (the spawn is by the sea, where the ground of a shape is the sea floor).
  const px = Math.floor(spawn.x) - 8;
  const pz = Math.floor(spawn.z) - 8;
  const gy = Math.floor(spawn.y) + 3;
  await page.evaluate(
    ([x0, z0, y]) => {
      const w = window.__solrift;
      for (let x = x0 - 2; x <= x0 + 22; x++) for (let z = z0 - 2; z <= z0 + 30; z++) {
        for (let h = 1; h <= 14; h++) w.setBlock(x, y + h, z, 0);
        w.setBlock(x, y - 1, z, 1);
        w.setBlock(x, y, z, 2);
      }
    },
    [px, pz, gy],
  );
  await sleep(1500);  await deliver([{ t: 'land', e: { k: 'zones', zones: [] } }]);
  const state = () => page.evaluate(() => ({ ...window.__solrift.land(), text: document.querySelector('[data-testid="land-straight"]')?.innerText?.replace(/^[^A-Za-z]+/, '') ?? null, perfect: !!document.querySelector('.land-straight.perfect') }));

  await hook('clearInventory');
  await hook('give', 620, 1);
  await hook('select', 0);
  await hook('forceLock');
  // Two corners, and the crosshair straight above the spot in line with the first: the line is drawn to it.
  await hook('landMark', [[px + 3, pz + 3], [px + 13, pz + 3]]);
  await hook('teleport', px + 3.5, gy + 30, pz + 13.5, 0, -Math.PI / 2 + 0.001);
  await sleep(900);
  let s = await state();
  check(s.text === 'In line with corner 1', `the crosshair is in line with the first corner (${s.text})`);
  await page.screenshot({ path: `${outDir}/land-14-inline.png` });
  // The third corner, and the crosshair where the fourth closes a perfect rectangle.
  await hook('landMark', [[px + 3, pz + 3], [px + 13, pz + 3], [px + 13, pz + 13]]);
  await hook('teleport', px + 3.5, gy + 30, pz + 13.5, 0, -Math.PI / 2 + 0.001);
  await sleep(900);
  s = await state();
  check(s.perfect && /perfect square: 11 x 11/.test(s.text ?? ''), `the fourth corner would make a perfect square (${s.text})`);
  await page.screenshot({ path: `${outDir}/land-15-perfect-next.png` });
  await hook('landMark', [[px + 3, pz + 3], [px + 13, pz + 3], [px + 13, pz + 13], [px + 3, pz + 13]], true);
  await hook('setTime', 0.02);
  await hook('teleport', px + 8.5, gy + 4, pz + 21.5, 0, -0.3);
  await sleep(900);
  s = await state();
  check(s.closed && s.perfect && s.text === 'Perfect square, 11 x 11', `closed, it says so (${s.text})`);
  await page.screenshot({ path: `${outDir}/land-16-perfect.png` });
  await hook('landMark', [[px + 3, pz + 3], [px + 13, pz + 3], [px + 13, pz + 13], [px + 4, pz + 13]], true);
  await sleep(900);
  s = await state();
  check(!s.perfect && s.text === 'Straight edges: 3 of 4', `a corner a block off is not perfect (${s.text})`);
  await page.screenshot({ path: `${outDir}/land-17-off.png` });
  await hook('landMark', []);
  await hook('setTime', 0.25);
  await hook('teleport', spawn.x, spawn.y, spawn.z, 0, 0);
}

console.log('Escape gives up a shape without the pause screen');
{
  // (A headless browser cannot really lock the pointer: Escape is what the browser does with the lock, so it is played as that: the lock is gone, and the page is told.)
  const letGo = () =>
    page.evaluate(() => {
      if (document.pointerLockElement) return document.exitPointerLock();
      window.__solrift.unlock?.();
      document.dispatchEvent(new Event('pointerlockchange'));
    });
  const overlay = () => page.evaluate(() => document.getElementById('overlay').style.display);
  await hook('clearInventory');
  await hook('give', 620, 1);
  await hook('select', 0);
  await hook('forceLock');
  await sleep(500);
  await hook('look', 0.3, -0.8);
  await sleep(300);
  await click();
  await hook('look', 0.9, -0.8);
  await sleep(300);
  await click();
  check((await page.evaluate(() => window.__solrift.land().corners.length)) === 2, 'two corners are marked');
  await letGo();
  await sleep(500);
  check((await page.evaluate(() => window.__solrift.land().corners.length)) === 0, 'Escape gave the shape up');
  check((await overlay()) === 'none', `and the pause screen did not come up (overlay: ${await overlay()})`);
  check((await text('land-hint'))?.includes('Land selection cancelled'), `the hint says so (${await text('land-hint')})`);
  await page.screenshot({ path: `${outDir}/land-13-escape.png` });
  await hook('forceLock');
  await letGo();
  await sleep(500);
  check((await overlay()) === 'flex', `with nothing marked the next Escape is the game's: the pause screen (overlay: ${await overlay()})`);
  await page.evaluate(() => {
    document.getElementById('overlay').style.display = 'none';
  });
  await hook('forceLock');
}

const real = errors.filter((e) => !/Failed to load resource/.test(e));
check(real.length === 0, `no console errors${real.length ? `: ${real.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('land look passed (spawn was', JSON.stringify(spawn), ')');
