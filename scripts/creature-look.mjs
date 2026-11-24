// A look at how creatures move (creatureMotion.ts): for each kind a contact sheet of its walk and run (the mob really travels, its position is
// driven in the page each frame, so the feet are judged against the ground and the gait comes from what the body does), its idle (it is alone
// and then a player stands near it), its swing, its hurt flinch and its death. Mobs stand on a stone stage in the sky, from the side.
// Saves screenshots/creatures/*.png (one sheet per kind and move). Usage: node scripts/creature-look.mjs [url] [kind,kind] [move,move]
//   moves: walk run idle attack hurt death
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3200';
const only = process.argv[3] && process.argv[3] !== 'all' ? process.argv[3].split(',') : null;
const moves = process.argv[4] ? process.argv[4].split(',') : ['walk', 'run', 'idle', 'attack', 'hurt', 'death'];
mkdirSync('screenshots/creatures', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// kind: [camera distance, height of what to look at, how high it floats]
const KINDS = {
  pig: [3.2, 0.45, 0], cow: [4, 0.8, 0], wolf: [3, 0.45, 0], horse: [4.6, 1, 0], sheep: [3.4, 0.6, 0], cat: [2.4, 0.3, 0], chicken: [2.2, 0.35, 0],
  rabbit: [2.2, 0.25, 0], zombie: [4.4, 0.9, 0], skeleton: [4.4, 0.9, 0], villager: [4.2, 0.9, 0], enderman: [6, 1.4, 0], creeper: [3.4, 0.7, 0],
  spider: [3.4, 0.4, 0], bat: [2.6, 0.5, 1.2], squid: [3.6, 0.6, 1.2], slime: [3.4, 0.5, 0], gilt_hound: [3.6, 0.5, 0], ashen_knight: [5, 1, 0],
  hollow_king: [24, 5, 0], aurelion: [8, 1.7, 0],
};

const browser = await launchBrowser();
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
await page.goto(`${url}/?seed=17&debug&nomobs`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
  window.__solrift.setMode('creative');
  window.__solrift.setTime(0.25);
});
const site = await page.evaluate(() => window.__solrift.nearestVillage(0, 0));
await page.evaluate(([x, z]) => window.__solrift.teleport(x + 0.5, 150, z + 0.5), [site.x, site.z]);
await sleep(5000);
const spot = await page.evaluate(([cx, cz]) => {
  const s = window.__solrift;
  const y0 = s.surfaceY(cx, cz) + 25;
  for (let dx = -30; dx <= 30; dx++) for (let dz = -8; dz <= 8; dz++) {
    s.setBlock(cx + dx, y0, cz + dz, 1);
    for (let h = 1; h <= 14; h++) s.setBlock(cx + dx, y0 + h, cz + dz, 0);
  }
  return { x: cx, z: cz, y: y0 };
}, [site.x, site.z]);
await sleep(4000);

// In the page: `drive(kind, fn)` spawns a mob and makes its properties whatever `fn(t)` says (t in seconds), and the camera follows it from the side.
await page.evaluate(([spot, KINDS]) => {
  const s = window.__solrift;
  window.__look = {
    spot,
    t0: 0,
    fn: null,
    id: 0,
    cam: null,
    start(kind, fn, cam) {
      s.clearMobs();
      s.spawnMob(kind, spot.x + 0.5, spot.y + 1, spot.z + 0.5);
      const m = s.mobs().filter((q) => q.kind === kind).pop();
      this.id = m.id;
      const mob = window.__look.mob();
      const pin = (o, key, get) => Object.defineProperty(o, key, { get, set: () => undefined, configurable: true, enumerable: true });
      this.fn = fn;
      this.t0 = performance.now();
      const read = (k) => () => (this.fn ? this.fn((performance.now() - this.t0) / 1000)[k] : 0);
      for (const k of ['yaw', 'speedNow', 'walkPhase', 'casting', 'hurtTime', 'attackTime', 'dead', 'deathTime']) pin(mob, k, read(k));
      for (const k of ['x', 'y', 'z']) pin(mob.body, k, read(k));
      this.cam = cam;
      const follow = () => {
        if (!window.__look.fn) return;
        const p = window.__look.fn((performance.now() - window.__look.t0) / 1000);
        const c = window.__look.cam;
        const eye = p.y + c.mid + 0.25;
        s.setFlying(true);
        s.teleport(p.x - 0.0, eye - 1.62, p.z + c.dist, 0, -0.04);
        requestAnimationFrame(follow);
      };
      requestAnimationFrame(follow);
    },
    mob() {
      return s.rawMob(window.__look.id);
    },
    make(sp) {
      const stand = (extra) => ({ x: sp.x0 + 24, y: sp.y, z: sp.z, yaw: -Math.PI / 2, speedNow: 0, walkPhase: 0, casting: 0, hurtTime: 5, attackTime: 99, dead: false, deathTime: 0, ...extra });
      switch (sp.move) {
        case 'walk':
        case 'run':
          // A start from rest, then the stride.
          return (t) => stand({ x: sp.x0 + sp.v * Math.max(0, t - 0.4), speedNow: t < 0.4 ? 0 : sp.v });
        case 'attack':
          return (t) => stand({ attackTime: t % 1.4 < 0.9 ? t % 1.4 : 99 });
        case 'hurt':
          return (t) => stand({ hurtTime: t % 1.2 < 0.4 ? t % 1.2 : 5 });
        case 'death':
          return (t) => stand({ dead: t > 0.8, deathTime: Math.max(0, t - 0.8) });
        default:
          return () => stand({});
      }
    },
    stop() {
      this.fn = null;
    },
  };
}, [spot, KINDS]);
const frames = async (n, gap) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    await sleep(gap);
    out.push((await page.screenshot({ type: 'jpeg', quality: 85, clip: { x: 240, y: 110, width: 480, height: 300 } })).toString('base64'));
  }
  return out;
};
const sheet = async (name, imgs, cols) => {
  const p = await page.context().newPage();
  const w = 480;
  await p.setViewportSize({ width: cols * w, height: Math.ceil(imgs.length / cols) * 300 });
  await p.setContent(`<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(${cols},${w}px)">${imgs.map((b) => `<img style="width:${w}px;height:300px" src="data:image/jpeg;base64,${b}">`).join('')}</body>`);
  await p.screenshot({ path: `screenshots/creatures/${name}.png` });
  await p.close();
  console.log('saved', name);
};

const out = { x0: spot.x - 24 + 0.5, y: spot.y + 1, z: spot.z + 0.5 };
for (const [kind, [dist, mid, float]] of Object.entries(KINDS)) {
  if (only && !only.includes(kind)) continue;
  const speeds = await page.evaluate((k) => {
    const d = window.__solrift.mobDef?.(k);
    return d ?? null;
  }, kind);
  const walkV = speeds?.speed ?? 1.6;
  const runV = speeds?.runSpeed ?? walkV * 1.8;
  const y = out.y + float;
  for (const move of moves) {
    const spec = { move, v: move === 'run' ? runV : walkV, x0: out.x0, y, z: out.z };
    await page.evaluate(([kind, spec, cam]) => window.__look.start(kind, window.__look.make(spec), cam), [kind, spec, { dist, mid }]).catch((e) => errors.push(kind + ' ' + move + ': ' + e.message.slice(0, 200)));
    const t = move === 'walk' || move === 'run' ? [1400, 8, 90] : move === 'death' ? [750, 8, 100] : move === 'idle' ? [3000, 8, 700] : [300, 8, 140];
    await sleep(t[0]);
    const imgs = await frames(t[1], t[2]);
    await sheet(`${kind}-${move}`, imgs, 3);
    await page.evaluate(() => window.__look.stop());
  }
}
console.log(errors.length ? `ERRORS:\n${[...new Set(errors)].slice(0, 12).join('\n')}` : 'no console errors');
await browser.close();
