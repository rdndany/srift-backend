// Signs in a real browser: placing one opens the editor, the typed lines are kept and drawn on the board (both sides), Escape leaves a sign
// as it was, and a sign without writing draws nothing. A single-player world (the server's side is tested in apps/server).
// Usage: node scripts/sign-look.mjs [url] [outDir]   (a web server is needed: `next dev -p 3200`)
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
  s.setTime(0.3);
  s.setMode('creative');
});
const hook = (fn, ...args) => page.evaluate(([f, a]) => window.__solrift[f](...a), [fn, args]);
const editor = () => page.evaluate(() => !!document.getElementById('sign-editor'));
const inputs = () => page.evaluate(() => [...document.querySelectorAll('#sign-editor .sign-line')].map((i) => i.value));

await hook('clearInventory');
await hook('give', await hook('signItem'), 4);
await hook('select', 0);
const p = await hook('position');
// A flat stone platform to stand a sign on, in front of where we stand (the ground here is whatever the seed made).
const y0 = Math.floor(p.y) - 1;
for (let dx = -6; dx <= 6; dx++) for (let dz = -10; dz <= 6; dz++) await hook('setBlock', Math.floor(p.x) + dx, y0, Math.floor(p.z) + dz, 1);
await hook('teleport', Math.floor(p.x) + 0.5, y0 + 1, Math.floor(p.z) + 0.5).catch(() => {});
await sleep(300);
await hook('look', 0, -0.45);
await sleep(400);

console.log('placing a sign');
// (A click of the mouse is what places it in the game; the hook is the same call with the block named, so that the test is not at the mercy of where the cursor is.)
const at = { x: Math.floor(p.x), y: y0, z: Math.floor(p.z) - 3 };
await hook('useOn', at.x, at.y, at.z, 0, 1, 0);
await sleep(500);
check(await editor(), 'placing a sign opens the editor');
await page.screenshot({ path: `${outDir}/sign-1-editor.png` });
await hook('unlock'); // (the page lets go of the mouse for the editor; this is the same in a headless browser)
const lines = ['Property of', 'Ilia', 'Keep out!', 'This line is far too long to fit'];
await page.keyboard.type(lines[0]);
await page.keyboard.press('Enter');
await page.keyboard.type(lines[1]);
await page.keyboard.press('Enter');
await page.keyboard.type(lines[2]);
await page.keyboard.press('Enter');
await page.keyboard.type(lines[3]);
const typed = await inputs();
check(typed[0] === 'Property of' && typed[1] === 'Ilia' && typed[2] === 'Keep out!', 'the lines are typed one after the other (Enter goes to the next)');
check(typed[3].length === 15, 'a line stops at fifteen characters');
await page.screenshot({ path: `${outDir}/sign-2-typed.png` });
await page.keyboard.press('Enter');
await sleep(500);
check(!(await editor()), 'Enter on the last line finishes');
let s = await hook('signs');
check(s.near.length === 1 && s.near[0].lines[0] === 'Property of' && s.near[0].lines[1] === 'Ilia' && s.near[0].lines[3] === 'This line is fa', 'the server kept the lines (cleaned and cut)');
check(s.boards === 1, 'one board of writing is drawn');
await hook('forceLock');
await sleep(500);
await page.screenshot({ path: `${outDir}/sign-3-front.png` });
// Close up, from the front and from behind (the writing is on both sides, and not mirrored).
await hook('teleport', at.x + 0.5, at.y + 1, at.z + 0.5 + 1.3, 0, -0.2);
await sleep(500);
await page.screenshot({ path: `${outDir}/sign-3b-close-front.png` });
await hook('teleport', at.x + 0.5, at.y + 1, at.z + 0.5 - 1.3, Math.PI, -0.2);
await sleep(500);
await page.screenshot({ path: `${outDir}/sign-3c-close-back.png` });
await hook('teleport', at.x + 0.5, at.y + 1, at.z + 0.5 + 3, 0, -0.45);
await sleep(300);

console.log('Escape leaves it as it was');
await hook('clearInventory');
await hook('useBlock', at.x, at.y + 1, at.z);
await sleep(500);
check(await editor(), 'using the sign with an empty hand opens the editor again');
const again = await inputs();
check(again[0] === 'Property of' && again[3] === 'This line is fa', 'it holds what the sign says');
await page.keyboard.type('X');
await hook('unlock');
await page.keyboard.press('Escape');
await sleep(400);
check(!(await editor()), 'Escape closes the editor');
s = await hook('signs');
check(s.near[0].lines[0] === 'Property of', 'and the sign is unchanged');

console.log('a sign made blank draws nothing');
await hook('forceLock');
await hook('useBlock', at.x, at.y + 1, at.z);
await sleep(500);
await hook('unlock');
for (let n = 0; n < 4; n++) {
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Enter');
}
await sleep(500);
s = await hook('signs');
check(s.near.length === 0 && s.boards === 0, 'clearing the four lines takes the writing away');

check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nsigns look right');
