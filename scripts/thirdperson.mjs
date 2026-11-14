// Third-person camera E2E (single player): walk into a one-block tunnel in a rock face, look at the camera on the way in, swap
// shoulders (what mouse 3 does), and check that the block the crosshair is on is the one that would be mined.
// Usage: node scripts/thirdperson.mjs [url] [outDir]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:3000';
const outDir = process.argv[3] ?? 'screenshots/thirdperson';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const errors = [];
const failures = [];
const check = (cond, msg) => {
  if (cond) console.log('  ok  ', msg);
  else {
    console.log('  FAIL', msg);
    failures.push(msg);
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${url}/?seed=1337&debug&nomobs`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
});
const sc = (fn, ...args) => page.evaluate(fn, ...args);
const shot = async (name, wait = 1200) => {
  await sleep(wait);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('saved', name);
};

const pos = await sc(() => window.__solrift.position());
const px = Math.floor(pos.x);
const pz = Math.floor(pos.z);
const gy = await sc(([x, z]) => window.__solrift.surfaceY(x, z), [px, pz]);
// A flat clearing with a rock face to the north (-z): a tunnel one block wide and two high goes into it, and a small room at the end.
await sc(
  ([px, pz, gy]) => {
    const s = window.__solrift;
    for (let x = px - 30; x <= px + 30; x++)
      for (let z = pz - 50; z <= pz + 30; z++) {
        for (let y = gy; y <= gy + 14; y++) s.setBlock(x, y, z, 0);
        s.setBlock(x, gy - 1, z, 3);
        s.setBlock(x, gy - 2, z, 2);
        s.setBlock(x, gy - 3, z, 1);
      }
    for (let x = px - 8; x <= px + 8; x++)
      for (let z = pz - 40; z <= pz - 6; z++) for (let y = gy; y <= gy + 7; y++) s.setBlock(x, y, z, 1);
    for (let z = pz - 30; z <= pz - 6; z++) for (let y = gy; y <= gy + 1; y++) s.setBlock(px, y, z, 0);
    for (let x = px - 3; x <= px + 3; x++) for (let z = pz - 36; z <= pz - 30; z++) for (let y = gy; y <= gy + 3; y++) s.setBlock(x, y, z, 0);
    s.setTime(0.3);
    s.teleport(px + 0.5, gy, pz + 6.5, 0, -0.1);
    s.setView(1);
  },
  [px, pz, gy],
);
await sleep(1500);

const dist = async () => {
  const [c, st] = await Promise.all([sc(() => window.__solrift.cameraAt()), sc(() => window.__solrift.position())]);
  return Math.hypot(c.x - st.x, c.y - (st.y + 1.62), c.z - st.z);
};
const stand = async (z, name, yaw = 0, pitch = -0.1) => {
  await sc(([x, y, z, yaw, pitch]) => window.__solrift.teleport(x, y, z, yaw, pitch), [px + 0.5, gy, pz + z + 0.5, yaw, pitch]);
  await shot(name);
  const d = await dist();
  console.log(`   camera ${d.toFixed(2)} blocks from the head`);
  return d;
};

const open = await stand(6, '1-outside');
check(open > 4.5, 'in the open the camera is well behind the head');
const mouth = await stand(-5, '2-mouth');
const inside = await stand(-15, '3-inside');
check(inside > 2.5, 'in the tunnel the camera slides back along it (a low ceiling does not squash it onto the head)');
const cam = await sc(() => window.__solrift.cameraAt());
check(Math.abs(cam.x - (px + 0.5)) < 0.6, 'and stays in the line of the tunnel, not in the wall');
check((await sc(([x, y, z]) => window.__solrift.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)), [cam.x, cam.y, cam.z])) === 0, 'the camera is in air');
const room = await stand(-33, '4-room');
check(room > 2.5 && room < 5, 'in the room it is held off the wall behind');
await stand(-15, '5-inside-looking-back', Math.PI);

// Shoulders.
await sc(([x, y, z]) => window.__solrift.teleport(x, y, z, 0, -0.1), [px + 0.5, gy, pz + 4.5]);
await sleep(1500);
const right = await sc(() => window.__solrift.cameraAt());
const shoulder = await sc(() => window.__solrift.swapShoulder());
await shot('6-left-shoulder', 1500);
const left = await sc(() => window.__solrift.cameraAt());
check(shoulder === -1, 'mouse 3 puts it on the left shoulder');
check(right.x > px + 0.5 && left.x < px + 0.5, 'the camera really moved to the other side');
await sc(() => window.__solrift.swapShoulder());

// The crosshair and what is hit: a block 2 to the right and 4 ahead; the camera looks down at it.
await sc(([px, pz, gy]) => [0, 1, 2].forEach((h) => window.__solrift.setBlock(px + 2, gy + h, pz + 2, 1)), [px, pz, gy]);
await sc(([x, y, z]) => window.__solrift.teleport(x, y, z, 0, -0.187), [px + 0.5, gy, pz + 6.5]);
await shot('7-aim', 3000);
const aimed3 = await sc(() => window.__solrift.aimedBlock());
await sc(() => window.__solrift.setView(0));
await sleep(600);
const aimed1 = await sc(() => window.__solrift.aimedBlock());
console.log('   third person aims at', JSON.stringify(aimed3), ' first person at', JSON.stringify(aimed1));
check(aimed3 && aimed3.x === px + 2 && aimed3.z === pz + 2, 'in third person the block under the crosshair is the one it points at');
check(!aimed1 || aimed1.x !== px + 2, 'in first person the same angle looks elsewhere (so the aim does follow the camera)');

console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
if (failures.length) {
  console.log(`${failures.length} failed`);
  process.exit(1);
}
