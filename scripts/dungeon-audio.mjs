// The sound of the Hollow Deep and of its king, checked in a real browser (headless audio is not audible, so this checks what can be
// measured): every recipe renders off-line to sound that is not silent, not clipped and not NaN, and gives back every voice and source; each
// one also plays live through the game's audio graph without an exception; the boss's events (bossFx) go through the client's event
// handler; and the dungeon ambience comes up when the player is inside a dungeon copy and is taken apart again when they leave.
// Usage: node scripts/dungeon-audio.mjs [url]   (the dev server must be running)
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'], channel: 'chromium' });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon|WebSocket|status of 404/.test(m.text())) errors.push(m.text());
});
// (A missing file is told apart from an error of the game by its address.)
const missing = [];
page.on('response', (r) => {
  if (r.status() === 404 && !/favicon/.test(r.url())) missing.push(r.url());
});
const sc = (fn, ...a) => page.evaluate(fn, ...a);
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures++;
};

await page.goto(`${url}/game?world=adventure&debug&nomobs&class=warrior`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.() && window.__solrift.worldKind() === 'adventure', null, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
});

// ---- 1. off-line renders -------------------------------------------------------------------------------------------------------
const names = await sc(() => window.__solrift.darkNames());
console.log('\n-- off-line renders: peak / rms / last audible second / voices+sources left');
const reports = [];
for (const kind of ['ambient', 'boss']) {
  for (const name of names[kind]) {
    const r = await sc(([k, n]) => window.__solrift.renderDark(k, n), [kind, name]);
    reports.push(r);
    const line = `${kind}:${name}`.padEnd(24) + `peak ${r.peak.toFixed(3)}  rms ${r.rms.toFixed(4)}  until ${r.lastAudible.toFixed(1)}s  left ${r.pool.active}/${r.pool.sources}`;
    console.log(line);
    check(r.made && r.peak > 0.02 && r.peak <= 1 && r.bad === 0 && r.pool.active === 0 && r.pool.sources === 0, `${kind}:${name} is audible, not clipped, clean and leaves nothing behind`);
  }
}

// ---- 2. live ----------------------------------------------------------------------------------------------------------------------
console.log('\n-- live playing through the game audio');
const ctxState = await sc(() => {
  window.__solrift.playAmbient('drip');
  return window.__solrift.darkStats();
});
console.log('after one drip:', JSON.stringify(ctxState.dungeon?.pools?.drips));
// (The pool of random sounds holds five: wait for room before each one, or it is refused, as it should be.)
for (const name of names.ambient) {
  for (let i = 0; i < 80 && (await sc(() => window.__solrift.darkStats().dungeon.pools.shots.active)) >= 4; i++) await sleep(100);
  const ok = await sc((n) => window.__solrift.playAmbient(n), name);
  check(ok === true, `playAmbient(${name})`);
  await sleep(150);
}
for (const name of names.boss) {
  const ok = await sc((n) => window.__solrift.playBoss(n), name);
  check(ok === true, `playBoss(${name})`);
  await sleep(150);
}
const busy = await sc(() => window.__solrift.darkStats());
console.log('busy:', JSON.stringify({ shots: busy.dungeon.pools.shots, boss: busy.boss }));
check(busy.boss.active <= 14 && busy.dungeon.pools.shots.active <= 5, 'the pools never go over their limits');
// Wait for everything to finish (the death is 14 s).
await sleep(17000);
const calm = await sc(() => window.__solrift.darkStats());
console.log('calm:', JSON.stringify({ shots: calm.dungeon.pools.shots, drips: calm.dungeon.pools.drips, heart: calm.dungeon.pools.heart, fx: calm.dungeon.pools.fx, boss: calm.boss }));
check(calm.boss.active === 0 && calm.boss.sources === 0, 'every boss voice and source was given back');
for (const p of ['shots', 'drips', 'heart', 'fx']) check(calm.dungeon.pools[p].active === 0 && calm.dungeon.pools[p].sources === 0, `every ${p} voice and source was given back`);
// A flood of them: the pools refuse what does not fit.
await sc(() => {
  for (let i = 0; i < 40; i++) window.__solrift.playBoss('step');
  for (let i = 0; i < 40; i++) window.__solrift.playAmbient('groan');
});
const flood = await sc(() => window.__solrift.darkStats());
check(flood.boss.active <= 14 && flood.boss.refused > 0 && flood.dungeon.pools.shots.active <= 5 && flood.dungeon.pools.shots.refused > 0, `a flood is bounded (boss ${flood.boss.active}/14 refused ${flood.boss.refused}, shots ${flood.dungeon.pools.shots.active}/5 refused ${flood.dungeon.pools.shots.refused})`);
await sleep(3000);

// ---- 3. the event flow ---------------------------------------------------------------------------------------------------------------
console.log('\n-- bossFx events through the client handler');
const before = (await sc(() => window.__solrift.darkStats())).boss.started;
const pos = await sc(() => window.__solrift.position());
const at = { x: pos.x + 12, y: pos.y, z: pos.z + 5 };
const events = [
  { t: 'boss', text: 'Who dares wake the Hollow King? Kneel, or burn!', kind: 'yell' },
  { t: 'bossFx', what: 'wake', ...at },
  { t: 'bossFx', what: 'cast', spell: 'slam', seconds: 1.8, ...at },
  { t: 'bossFx', what: 'release', spell: 'slam', ...at },
  { t: 'bossFx', what: 'cast', spell: 'pillars', seconds: 1.3, ...at },
  { t: 'bossFx', what: 'release', spell: 'pillars', ...at },
  { t: 'bossFx', what: 'phase', phase: 2, ...at },
  { t: 'bossFx', what: 'cast', spell: 'court', seconds: 2.6, ...at },
  { t: 'bossFx', what: 'release', spell: 'court', ...at },
  { t: 'bossFx', what: 'cast', spell: 'unbound', seconds: 2.2, ...at },
  { t: 'bossFx', what: 'release', spell: 'unbound', ...at },
  { t: 'bossFx', what: 'cast', spell: 'rain', seconds: 5.6, ...at },
  { t: 'bossFx', what: 'release', spell: 'rain', ...at },
  { t: 'bossFx', what: 'step', ...at },
  { t: 'bossFx', what: 'swing', ...at },
  { t: 'mob', kind: 'hollow_king', sound: 'hurt', vol: 0.8, ...at },
];
await sc((evs) => window.__solrift.deliver(evs), events);
const after = (await sc(() => window.__solrift.darkStats())).boss;
console.log(`voices started by ${events.length} events: ${after.started - before} (active ${after.active}, refused ${after.refused})`);
check(after.started - before >= 10, 'the events make boss sounds');
await sleep(1500);
// The fall of the king silences what winds up and plays the collapse.
const preDown = (await sc(() => window.__solrift.darkStats())).boss.started;
await sc((a) => window.__solrift.deliver([{ t: 'bossFx', what: 'down', ...a }]), at);
await sleep(500);
const down = (await sc(() => window.__solrift.darkStats())).boss;
console.log('during the fall:', JSON.stringify(down));
check(down.started - preDown === 2 && down.active >= 1, 'his fall plays (the collapse and, later, the chime) even when the pool was busy');
await sleep(16000);
const quiet = (await sc(() => window.__solrift.darkStats())).boss;
check(quiet.active === 0 && quiet.sources === 0, 'nothing is left of the fall afterwards');

// ---- 4. the dungeon ----------------------------------------------------------------------------------------------------------------------
console.log('\n-- the ambience in a dungeon copy');
const chapelY = await sc(() => window.__solrift.surfaceY(86.5, 0.5));
await sc(() => window.__solrift.addXp(5000));
await sc(() => window.__solrift.give(504, 1));
await sc((y) => window.__solrift.teleport(86.5, y + 2.5, 0.5, -Math.PI / 2, -0.1), chapelY);
await sleep(1500);
await sc(() => window.__solrift.setFlying(false));
let inside = false;
for (let y = chapelY - 6; y <= chapelY && !inside; y++) {
  await sc((yy) => window.__solrift.teleport(92.5, yy, 0.5, -Math.PI / 2, 0), y);
  const end = Date.now() + 600;
  while (Date.now() < end && !inside) {
    inside = await sc(() => window.__solrift.position().x > 4000);
    await sleep(100);
  }
}
check(inside, 'the player is in the dungeon copy');
await sc(() => window.__solrift.setMode('creative'));
await sc(() => window.__solrift.setFlying(true));
// A sound has to have been started by a gesture for the context to run (the flag lets the hooks do it): ask for any one.
await sc(() => window.__solrift.playAmbient('drip'));
await sleep(3000);
let st = await sc(() => window.__solrift.darkStats());
console.log('inside:', JSON.stringify({ built: st.dungeon.built, sources: st.dungeon.bedSources, nodes: st.dungeon.bedNodes }));
check(st.dungeon.built === true, 'the bed is built inside the dungeon');
// Sit still a while and let it make its sounds (at the depth of the boss, so it is thick).
await sc(() => window.__solrift.teleport(4096 + 176.5, 150 - 70, 4160 + 6.5, Math.PI / 2, 0));
const played0 = (await sc(() => window.__solrift.darkStats())).dungeon.played;
await sleep(45000);
st = await sc(() => window.__solrift.darkStats());
const played = Object.fromEntries(Object.entries(st.dungeon.played).map(([k, n]) => [k, n - (played0[k] ?? 0)]).filter(([, n]) => n > 0));
console.log('made in 45 s at depth:', JSON.stringify(played), ' pools:', JSON.stringify({ shots: st.dungeon.pools.shots, drips: st.dungeon.pools.drips }));
const made = Object.values(played).reduce((a, b) => a + b, 0);
check(made >= 3 && made <= 60, `it makes sparse sounds on its own (${made} in 45 s)`);
check(st.dungeon.pools.shots.peak <= 5 && st.dungeon.pools.drips.peak <= 3 && st.dungeon.pools.fx.peak <= 2 && st.dungeon.pools.heart.peak <= 3, 'its pools stayed within their limits');
// Low health, and then a monster at your back: the heart comes in for each.
const beats = async () => (await sc(() => window.__solrift.darkStats())).dungeon.pools.heart.started;
let h0 = await beats();
await sc(() => window.__solrift.setHealth(4));
await sleep(6000);
let h1 = await beats();
check(h1 - h0 >= 3, `a heart beats when health is low (${h1 - h0} beats in 6 s)`);
await sc(() => window.__solrift.setHealth(20));
await sleep(10000); // (the heart fades out slowly)
h0 = await beats();
await sleep(3000);
check((await beats()) === h0, 'and it stops when health is back');
const me = await sc(() => window.__solrift.position());
await sc((p) => window.__solrift.spawnMob('zombie', p.x + 3, p.y, p.z), me);
await sleep(6000);
h1 = await beats();
check(h1 - h0 >= 3, `a heart beats when a hostile is near (${h1 - h0} beats in 6 s)`);
// Out: back to the village.
await sc(() => window.__solrift.setFlying(false));
await sc(() => window.__solrift.setMode('survival'));
await sc((y) => window.__solrift.teleport(0.5, y + 2, 0.5, 0, 0), await sc(() => window.__solrift.surfaceY(0.5, 0.5)));
await sleep(5000);
st = await sc(() => window.__solrift.darkStats());
console.log('after leaving:', JSON.stringify({ built: st.dungeon.built, sources: st.dungeon.bedSources, nodes: st.dungeon.bedNodes, shots: st.dungeon.pools.shots.active, drips: st.dungeon.pools.drips.active, heart: st.dungeon.pools.heart.active, fx: st.dungeon.pools.fx.active }));
check(st.dungeon.built === false && st.dungeon.bedSources === 0, 'the bed is taken apart after leaving');
check(['shots', 'drips', 'heart', 'fx'].every((p) => st.dungeon.pools[p].active === 0 && st.dungeon.pools[p].sources === 0), 'no voice or source is left after leaving');

console.log('\nmissing files:', JSON.stringify([...new Set(missing)]));
console.log('page errors:', JSON.stringify(errors));
check(errors.length === 0, 'no page errors');
await browser.close();
console.log(failures === 0 ? '\nALL OK' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
