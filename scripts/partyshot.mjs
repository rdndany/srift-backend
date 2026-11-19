// A party of three in the square of Dawnwatch at dusk, for the home page: starts its own Adventure server, joins four
// browsers (three heroes and a camera), lines the heroes up and takes the picture from the camera's view. 1920x1080.
// Usage: node scripts/partyshot.mjs [url] [outDir] [time]   (the web app must be running; the server is started here)
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3000';
const outDir = process.argv[3] ?? 'tmp-shots/party';
const clock = process.argv[4] ?? 'dusk';
const PORT = 8795;
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, ['--import', 'tsx', 'apps/server/src/index.ts'], {
  env: { ...process.env, PORT: String(PORT), WORLD_KIND: 'adventure', DATABASE_PATH: ':memory:', AUTH_ORIGINS: url, CHEATS: '1', NO_MOBS: '1', MAX_CONN_PER_IP: '150', CONNECTS_PER_MINUTE: '100000', HEARTBEAT_MS: '120000' },
  stdio: 'ignore',
});
const done = async (code = 0) => {
  server.kill();
  process.exit(code);
};
await sleep(6000);

const browser = await launchBrowser();
const join = async (name, cls, w, h, q = 'noshadows&noaa&nohalos') => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}]`, e.message));
  await page.goto(`${url}/?online&server=ws://localhost:${PORT}&debug&${q}&name=${name}&class=${cls}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 240000 });
  await page.evaluate(() => {
    const o = document.getElementById('overlay');
    if (o) o.style.display = 'none';
    window.__solrift.forceLock();
  });
  return page;
};
const say = (page, line) => page.evaluate((l) => window.__solrift.chat(l), line);
const look = (page, yaw, pitch) => page.evaluate(([y, p]) => window.__solrift.look(y, p), [yaw, pitch]);

const heroes = [
  ['Rowan', 'warrior', -2.6, 15.5],
  ['Mira', 'mage', 0, 14.5],
  ['Tamsin', 'ranger', 2.6, 15.5],
];
const pages = [];
for (const [name, cls] of heroes) pages.push(await join(name, cls, 480, 270));
const cam = await join('Scout', 'mage', 1920, 1080, 'shadows=4096&postfx');

await say(cam, '/gamemode creative');
await say(cam, `/time ${clock}`);
await say(cam, '/weather clear');
for (let i = 0; i < heroes.length; i++) {
  const [, , x, z] = heroes[i];
  await say(pages[i], `/tp ${x + 0.5} 76 ${z + 0.5}`);
}
await sleep(3000);
for (const p of pages) await look(p, Math.PI, 0);
await say(cam, '/tp 0.5 75.9 20.2');
await look(cam, 0, -0.02);
await cam.evaluate(() => {
  const st = document.createElement('style');
  st.textContent = 'body > :not(#game):not(script):not(style){display:none!important} nextjs-portal{display:none!important}';
  document.head.appendChild(st);
  const s = window.__solrift;
  s.setHandHidden(true);
  s.setPostfx({ ao: true, glow: true, grade: true, rays: true, menuBlur: false });
  s.setRenderDistance(14);
});
await sleep(9000);
await cam.screenshot({ path: `${outDir}/party.jpg`, type: 'jpeg', quality: 88 });
console.log('saved party');
await browser.close();
await done(0);
