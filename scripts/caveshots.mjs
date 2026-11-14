// Walks into each kind of cave of a seed in the browser (single player) and saves a picture of it as `cave-<name>.png`.
// Usage: node --import tsx scripts/caveshots.mjs [seed] [url] [outDir] [only,names]
// Needs the web app running (npm run dev:web).
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { B, CHUNK_SIZE, IS_LIQUID, IS_SOLID, WorldGenerator, blockIndex } from '../packages/shared/src/index.ts';

const seed = Number(process.argv[2] ?? 1337);
const url = process.argv[3] ?? 'http://localhost:3000';
const outDir = process.argv[4] ?? 'screenshots';
const only = process.argv[5] ? process.argv[5].split(',') : null;
mkdirSync(outDir, { recursive: true });

const gen = new WorldGenerator(seed);
const chunkCache = new Map();
const chunk = (cx, cz) => {
  const k = `${cx},${cz}`;
  if (!chunkCache.has(k)) chunkCache.set(k, gen.generateChunk(cx, cz));
  return chunkCache.get(k);
};
const at = (x, y, z) => chunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE))[blockIndex(((x % 16) + 16) % 16, y, ((z % 16) + 16) % 16)];
const open = (id) => !IS_SOLID[id] && !IS_LIQUID[id];
const solid = (id) => IS_SOLID[id] === 1;

/** Where to stand: the cell of air with a floor under it and two free cells above it, nearest to (x, y, z). */
function standNear(x, y, z, r = 8) {
  let best = null;
  let bestD = Infinity;
  for (let dy = -r; dy <= r; dy++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const px = x + dx;
        const py = y + dy;
        const pz = z + dz;
        if (py < 6) continue;
        if (!open(at(px, py, pz)) || !open(at(px, py + 1, pz)) || !open(at(px, py + 2, pz))) continue;
        if (!solid(at(px, py - 1, pz))) continue;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = { x: px, y: py, z: pz };
        }
      }
    }
  }
  return best;
}

const R = 9;
/** The way to look from a spot to see the farthest: the yaw whose line of sight stays open longest. */
function openestYaw(s) {
  let best = 0;
  let bestLen = -1;
  for (let k = 0; k < 24; k++) {
    const yaw = (k / 24) * Math.PI * 2;
    let len = 0;
    while (len < 24 && open(at(Math.floor(s.x + 0.5 - Math.sin(yaw) * (len + 1)), s.y + 1, Math.floor(s.z + 0.5 - Math.cos(yaw) * (len + 1))))) len++;
    if (len > bestLen) {
      bestLen = len;
      best = yaw;
    }
  }
  return best;
}
const sites = [];
/** The chunk with the most of some blocks, as a point (its centre of mass). */
function richest(name, ids, minY = 5, maxY = 150) {
  let best = null;
  for (let cz = -R; cz <= R; cz++) {
    for (let cx = -R; cx <= R; cx++) {
      const b = chunk(cx, cz);
      let n = 0;
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (let y = minY; y < maxY; y++) {
        for (let lz = 0; lz < 16; lz++) {
          for (let lx = 0; lx < 16; lx++) {
            if (ids.includes(b[blockIndex(lx, y, lz)])) {
              n++;
              sx += cx * 16 + lx;
              sy += y;
              sz += cz * 16 + lz;
            }
          }
        }
      }
      if (n > 0 && (!best || n > best.n)) best = { n, x: Math.round(sx / n), y: Math.round(sy / n), z: Math.round(sz / n) };
    }
  }
  if (!best) return console.log('none of', name);
  const s = standNear(best.x, best.y, best.z, 10);
  if (s) sites.push({ name, ...s, yaw: openestYaw(s), pitch: 0.02 });
  console.log(name, best.n, JSON.stringify(s));
}
richest('lush', [B.CAVE_VINES, B.CAVE_VINES_BERRIES, B.MOSS_BLOCK], 20);
richest('dripstone', [B.STALAGMITE_BASE, B.STALAGMITE_TIP, B.STALACTITE_BASE, B.STALACTITE_TIP, B.DRIPSTONE_BLOCK], 12);
richest('deep-dark', [B.SCULK], 5, 25);
richest('geode', [B.AMETHYST_CLUSTER], 5, 50);

// A wall of rubble: stand five blocks short of it in the tunnel, looking at it.
let wallSite = null;
for (let cz = -R; cz <= R && !wallSite; cz++) {
  for (let cx = -R; cx <= R && !wallSite; cx++) {
    for (const s of gen.caveSeals(cx, cz)) {
      const hl = Math.hypot(s.dx, s.dz);
      if (hl < 0.6 || !s.caches.length) continue;
      const ux = s.dx / hl;
      const uz = s.dz / hl;
      for (let back = 7; back >= 4; back--) {
        const px = Math.floor(s.x - ux * back);
        const pz = Math.floor(s.z - uz * back);
        const st = standNear(px, Math.floor(s.y), pz, 3);
        if (st && Math.hypot(st.x - s.x, st.z - s.z) > 3) {
          wallSite = { name: 'wall', ...st, yaw: Math.atan2(-ux, -uz), pitch: -0.05, cache: s.caches[0] };
          break;
        }
      }
      if (wallSite) break;
    }
  }
}
if (wallSite) {
  sites.push(wallSite);
  const c = wallSite.cache;
  const st = standNear(Math.floor(c.x), Math.floor(c.y), Math.floor(c.z), 4);
  if (st) sites.push({ name: 'cache', ...st, yaw: wallSite.yaw + Math.PI, pitch: -0.15 });
}
const plain = gen.findCavePoint('cave', 0, 0, 12);
if (plain) sites.push({ name: 'plain', ...plain, yaw: openestYaw(plain), pitch: 0 });
const todo = sites.filter((s) => !only || only.includes(s.name));
console.log(todo.map((s) => `${s.name} @ ${s.x},${s.y},${s.z}`).join('\n'));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${url}/?seed=${seed}&debug&nomobs`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), null, { timeout: 180000 });
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
  window.__solrift.forceLock();
  window.__solrift.setMode?.('creative');
  window.__solrift.setFlying?.(true);
  window.__solrift.setHandHidden?.(true);
  window.__solrift.setDebug?.(false);
  window.__solrift.setTime?.(0.3);
});
for (const s of todo) {
  await page.evaluate(([x, y, z, yaw, pitch]) => window.__solrift.teleport(x + 0.5, y + 0.1, z + 0.5, yaw, pitch), [s.x, s.y, s.z, s.yaw, s.pitch]);
  // Wait until the floor underfoot has arrived from the world worker.
  for (let i = 0; i < 80; i++) {
    await sleep(500);
    const here = await page.evaluate(([x, y, z]) => window.__solrift.getBlock(x, y - 1, z), [s.x, s.y, s.z]);
    if (here !== 0) break;
  }
  // A couple of torches on the floor around the spot, for light.
  const torches = [];
  for (const [dx, dz] of [[1, 1], [-1, 1], [2, -1], [-2, -1], [0, 2], [3, 1], [-3, 1]]) {
    const tx = s.x + dx;
    const tz = s.z + dz;
    if (at(tx, s.y, tz) === B.AIR && solid(at(tx, s.y - 1, tz))) torches.push([tx, s.y, tz]);
  }
  await page.evaluate((ts) => ts.forEach(([x, y, z]) => window.__solrift.setBlock(x, y, z, 23)), torches.slice(0, 4));
  await sleep(3500);
  await page.screenshot({ path: `${outDir}/cave-${s.name}.png` });
  console.log('saved', s.name);
}
console.log(errors.length ? `page errors: ${errors.slice(0, 5).join(' | ')}` : 'no page errors');
await browser.close();
