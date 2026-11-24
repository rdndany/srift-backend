// A CPU profile of one first-use action after a fresh page load: which functions held the page's thread while it ran.
// Usage: node scripts/profile-action.mjs "<code using s = window.__solrift>" [url]   (the dev server must be running)
import { launchBrowser } from './browser.mjs';

const src = process.env.ACTION ?? process.argv[2] ?? 'const p = s.position(); s.spawnMob("aurelion", p.x, p.y + 0.2, p.z - 9)';
const url = process.argv[3] ?? 'http://localhost:3000/game?world=square&debug&nomobs&class=mage';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await launchBrowser();
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 240000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  const s = window.__solrift;
  s.forceLock();
  s.setMode('creative');
  s.setTime(0.3);
  s.setView(1);
});
await sleep(5000);
const TRACE = process.env.TRACE;
if (TRACE) await browser.startTracing(page, { categories: ['toplevel', 'blink.user_timing', 'gpu', 'viz', 'cc', 'blink', 'gpu.angle', 'disabled-by-default-gpu.service', 'disabled-by-default-gpu.decoder'] });
if (TRACE) await page.evaluate(() => performance.mark('ability-key'));
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');
await page.evaluate((src) => new Function('s', src)(window.__solrift), src);
await sleep(2000);
const { profile } = await cdp.send('Profiler.stop');
if (TRACE) {
  const buf = await browser.stopTracing();
  (await import('node:fs')).writeFileSync(TRACE, buf);
}
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = profile.timeDeltas;
profile.samples.forEach((id, i) => {
  const n = byId.get(id);
  const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop().split('?')[0]}:${n.callFrame.lineNumber + 1}`;
  self.set(k, (self.get(k) ?? 0) + (dt[i] ?? 0) / 1000);
});
// Inclusive time of the functions named in INCL (a regex): what a piece of work cost with everything under it.
if (process.env.INCL) {
  const re = new RegExp(process.env.INCL);
  const kids = new Map();
  for (const n of profile.nodes) kids.set(n.id, n.children ?? []);
  const own = new Map();
  profile.samples.forEach((id, i) => own.set(id, (own.get(id) ?? 0) + (dt[i] ?? 0) / 1000));
  const incl = (id) => (own.get(id) ?? 0) + kids.get(id).reduce((a, k) => a + incl(k), 0);
  const sum = new Map();
  for (const n of profile.nodes) if (re.test(n.callFrame.functionName)) { const k = n.callFrame.functionName; sum.set(k, (sum.get(k) ?? 0) + incl(n.id)); }
  for (const [k, ms] of [...sum].sort((a, b) => b[1] - a[1])) console.log('INCL', ms.toFixed(1).padStart(8), 'ms ', k);
}
const total = [...self.entries()].filter(([k]) => !/^\(idle\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 25);
for (const [k, ms] of total) console.log(ms.toFixed(1).padStart(8), 'ms ', k);
await browser.close();
