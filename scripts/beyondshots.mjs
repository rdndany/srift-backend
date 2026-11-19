// Captures of the World Beyond for the /beyond page (clean: no HUD, no hand). Scenes come from scripts/_scenes.json
// (made by `npx tsx scripts/_scout.ts`). Usage: node scripts/beyondshots.mjs [url] [outDir] [group|name,name...]
import { mkdirSync, readFileSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3000';
const outDir = process.argv[3] ?? 'tmp-shots/beyond';
const only = process.argv[4]?.split(',');
// PICKS='{"realm-sunken_earth":[3,0]}': of a realm's sweep, only these pictures (the others are skipped, not drawn).
const picks = process.env.PICKS ? JSON.parse(process.env.PICKS) : {};
mkdirSync(outDir, { recursive: true });
const scenes = JSON.parse(readFileSync(new URL(process.argv[5] ?? './_scenes.json', import.meta.url), 'utf8')).filter((s) => !only || only.includes(s.group) || only.includes(s.name));
const browser = await launchBrowser();
const W = 1600;
const H = 900;

async function open(seed) {
  // Drawn at twice the size (and brought down again by scripts/beyondpack.ts): the edges of the blocks come out clean.
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: Number(process.env.DSF ?? 2) });
  // The widest view the game allows (16 chunks), and nothing that steps the picture down.
  await page.addInitScript((rd) => localStorage.setItem('solrift-settings', JSON.stringify({ renderDistance: rd, adaptive: false })), Number(process.env.RD ?? 16));
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`${url}/?seed=${seed}&debug&nomobs&mode=creative&world=beyond&shadows=4096&postfx`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__solrift?.isReady?.() && window.__solrift.worldKind() === 'beyond', undefined, { timeout: 240000 });
  await page.evaluate((rd) => {
    for (const id of ['overlay', 'hud-bottom', 'crosshair', 'debug', 'net', 'item-name', 'vignette', 'beyond-notes']) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
    // Everything the game draws over the picture goes: what stays is the canvas.
    const cv = document.getElementById('game');
    if (cv?.parentElement) for (const el of cv.parentElement.children) if (el !== cv) el.style.display = 'none';
    const st = document.createElement('style');
    st.textContent = 'nextjs-portal{display:none!important} #beyond-notes{display:none!important}';
    document.head.appendChild(st);
    const s = window.__solrift;
    s.forceLock();
    s.setHandHidden(true);
    s.setRenderDistance(rd);
    s.setFlying(true);
  }, Number(process.env.RD ?? 16));
  return page;
}

/** Fly there and let the land load. */
/** Wait until every chunk in view has come and been drawn (the widest view is a lot of land), or a minute has gone. */
async function settle(page) {
  await page.waitForTimeout(1500);
  let still = 0;
  for (let i = 0; i < 240 && still < 4; i++) {
    still = (await page.evaluate(() => window.__solrift.chunksWaiting())) === 0 ? still + 1 : 0;
    await page.waitForTimeout(250);
  }
}
async function arrive(page, x, y, z) {
  await page.evaluate(([x, y, z]) => window.__solrift.teleport(x, y, z, 0, -0.3), [x, y + 30, z]);
  await settle(page);
}
const place = (page, s, yaw, pitch, y) =>
  page.evaluate(([x, y, z, yaw, pitch, time, weather]) => {
    const w = window.__solrift;
    w.setTime(time);
    w.setClouds(y < 125 || y > 170);
    w.setWeather(weather);
    w.teleport(x, y, z, yaw, pitch);
  }, [s.x, y, s.z, yaw, pitch, s.time ?? 0.3, s.weather ?? 'clear']);
const snap = async (page, name) => {
  await page.screenshot({ path: `${outDir}/${name}.jpg`, type: 'jpeg', quality: 90 });
  console.log('saved', name);
};

for (const seed of [...new Set(scenes.map((s) => s.seed))]) {
  const mine = scenes.filter((s) => s.seed === seed);
  const page = await open(seed);
  for (const s of mine) {
    try {
      if (s.group === 'realm') {
        // A sweep: a ring of cameras around the middle of the realm, each looking in at it, high or low as the realm asks.
        // [distance (a fraction of the radius, or blocks when above 1), how many, height above ground or `abs`olute, pitch]
        const RINGS = {
          shattered_realm: [[0.55, 5, { abs: 150 }, -0.2], [0.2, 2, { abs: 140 }, -0.15]],
          sky_islands: [[0.55, 5, { abs: 150 }, -0.12], [0.2, 2, { abs: 160 }, -0.1]],
          worldroot: [[150, 3, { dy: 95 }, 0.12], [110, 3, { dy: 120 }, 0.05]],
          sunken_earth: [[0.9, 4, { dy: 70 }, -0.3], [0.7, 3, { dy: 90 }, -0.35]],
          ashen_kingdom: [[0.5, 5, { dy: 35 }, -0.2], [0.2, 3, { dy: 60 }, -0.3]],
        };
        const rings = RINGS[s.name.replace('realm-', '')] ?? [[0.55, 6, { dy: 45 }, -0.25], [0.2, 3, { dy: 45 }, -0.25]];        let k = 0;
        for (const [frac, n, cfg, pitch] of rings) {
          for (let i = 0; i < n; i++) {
            const mine = picks[s.name];
            if (mine && !mine.includes(k)) {
              k++;
              continue;
            }
            const a = (i / n) * Math.PI * 2 + frac;
            const reach = frac > 1 ? frac : frac * s.r;
            const x = Math.round(s.cx + Math.cos(a) * reach) + 0.5, z = Math.round(s.cz + Math.sin(a) * reach) + 0.5;
            await arrive(page, x, 200, z);
            const gy = await page.evaluate(([x, z]) => window.__solrift.surfaceY(x, z), [x, z]);
            const yaw = Math.atan2(-(s.cx - x), -(s.cz - z));
            await place(page, { ...s, x, z }, yaw, pitch, cfg.abs ?? gy + cfg.dy);
            await settle(page);
            await page.waitForTimeout(2500);
            await snap(page, `${s.name}-${k++}`);
          }
        }
      } else {
        await arrive(page, s.x, s.y, s.z);
        await place(page, s, s.yaw, s.pitch, s.y);
        if (s.group === 'cave') {
          // The light of a lantern set down ahead, and a few glowing blocks behind the camera (out of the picture).
          await page.evaluate(([x, y, z, yaw]) => {
            const w = window.__solrift;
            const fx = -Math.sin(yaw), fz = -Math.cos(yaw), floor = Math.round(y - 1.6);
            const at = (d, side, dy) => [Math.round(x + fx * d - fz * side), floor + dy, Math.round(z + fz * d + fx * side)];
            for (const [d, side, dy, id] of [[3, 1, 0, 1190], [6, -2, 0, 1190], [10, 2, 0, 1190], [14, -1, 0, 1190], [-5, 0, 3, 19], [-9, 1, 3, 19], [-13, -1, 3, 19]]) {
              const [bx, by, bz] = at(d, side, dy);
              if (w.getBlock(bx, by, bz) === 0) w.setBlock(bx, by, bz, id);
            }
          }, [s.x, s.y, s.z, s.yaw]);
        }
        await settle(page);
        await page.waitForTimeout(s.group === 'cave' ? 4500 : 3000);
        await snap(page, s.name);
      }
    } catch (e) {
      console.log('FAILED', s.name, e.message.split('\n')[0]);
    }
  }
  await page.close();
}
await browser.close();
