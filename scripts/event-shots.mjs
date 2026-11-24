// Pictures of a Rift and the Gilded Tide, taken inside the game. 1920x1080 JPEGs.
// Usage: node scripts/event-shots.mjs [url] [outDir]
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3000';
const outDir = process.argv[3] ?? 'apps/web/public/shots';
const only = process.argv[4];
mkdirSync(outDir, { recursive: true });

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('[err]', m.text().slice(0, 300)));

await page.goto(`${url}/?seed=17&debug&world=overworld&shadows=4096&postfx`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 240000 });
await page.evaluate(() => {
  const canvas = document.getElementById('game');
  const hide = (el) => {
    for (const child of el.children) {
      if (child === canvas || child.contains(canvas)) hide(child);
      else child.style.setProperty('display', 'none', 'important');
    }
  };
  hide(document.body);
  const s = window.__solrift;
  s.forceLock();
  s.setHandHidden(true);
  s.setDebug(false);
  s.setRenderDistance(10);
  s.setMode('survival');
  s.setFlying(true);
});

async function settle(ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const waiting = await page.evaluate(() => window.__solrift.chunksWaiting());
    if (waiting === 0 && Date.now() - t0 > 1500) break;
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    for (const id of ['quest-tracker', 'quest-notes', 'hotbar', 'chat', 'hud', 'target-frame']) {
      const el = document.getElementById(id);
      if (el) el.style.setProperty('display', 'none', 'important');
    }
  });
}

/** Stand `dist` blocks south of a point, looking north, a little above the ground. */
async function lookAt(x, z, dist, up, pitch, time = 0.72) {
  await page.evaluate(([x, z]) => window.__solrift.teleport(x, 220, z), [x, z + dist]);
  await page.waitForTimeout(2500);
  const ground = await page.evaluate(([x, z]) => window.__solrift.surfaceY(Math.floor(x), Math.floor(z)), [x, z + dist]);
  await page.evaluate(([x, y, z, yaw, pitch, time]) => {
    const s = window.__solrift;
    s.setFlying(true);
    s.setTime(time);
    s.setWeather('clear');
    s.teleport(x, y, z, yaw, pitch);
  }, [x, ground + up, z + dist, 0, pitch, time]);
  await settle(8000);
  return ground;
}

const site = await page.evaluate(() => window.__solrift.nearestVillage(0, 0));
console.log('village', JSON.stringify(site));
const vx = site?.x ?? 0;
const vz = site?.z ?? 0;
await lookAt(vx + 90, vz, 8, 4, -0.05, 0.72);

if (only !== 'gilded') {
  const opened = await page.evaluate(() => window.__solrift.startRift('epic'));
  console.log('rift opened', opened);
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__solrift.riftSkip(31));
  const rift = await page.evaluate(() => window.__solrift.riftState());
  console.log('rift', JSON.stringify(rift));
  if (rift) {
    await lookAt(rift.x, rift.z, 26, 7, -0.08, 0.74);
    const mobs = await page.evaluate(() => window.__solrift.mobs().filter((m) => !m.dead).length);
    console.log('mobs near rift view', mobs);
    await page.screenshot({ path: `${outDir}/rift.jpg`, type: 'jpeg', quality: 86 });
    console.log('saved rift');
  }
}

await page.evaluate(() => window.__solrift.clearMobs());
const tide = await page.evaluate(() => window.__solrift.startInvasion());
console.log('tide', tide);
await page.waitForTimeout(600);
const gilt = await page.evaluate(() => window.__solrift.mobs().filter((m) => String(m.kind).startsWith('gilt_') && !m.dead));
console.log('gilt', gilt.map((m) => `${m.kind}@${Math.round(m.x)},${Math.round(m.z)}`).join(' '));
const rank = { gilt_colossus: 0, gilt_drake: 1, gilt_hound: 2, gilt_imp: 3 };
gilt.sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9));
const star = gilt[0];
if (star) {
  const cam = await page.evaluate(() => {
    const s = window.__solrift;
    s.setFlying(true);
    s.setTime(0.46);
    s.setWeather('clear');
    s.clearMobs();
    // The grass in front of the rift's trees. Find a column of air to stand in, then put the creatures a short way north of it.
    const air = (x, y, z) => s.getBlock(Math.floor(x), y, Math.floor(z)) === 0;
    let stand = null;
    for (let x = -270; x >= -320 && !stand; x -= 2) {
      for (let z = -28; z <= -16 && !stand; z += 2) {
        const g = s.surfaceY(x, z);
        if (g < 60) continue;
        let clear = true;
        for (let dz = 0; dz <= 16; dz += 2) {
          const gg = s.surfaceY(x, z - dz);
          if (gg < 60 || Math.abs(gg - g) > 2 || !air(x, g + 2, z - dz) || !air(x, g + 4, z - dz)) {
            clear = false;
            break;
          }
        }
        if (clear) stand = { x: x + 0.5, z: z + 0.5, g };
      }
    }
    if (!stand) stand = { x: -288.5, z: -32.5, g: s.surfaceY(-288, -32) };
    const feet = stand.g + 1;
    const mz = stand.z - 10;
    const kinds = [
      ['gilt_colossus', 0, 0],
      ['gilt_drake', -4.5, 1.5],
      ['gilt_hound', 4.5, 1],
      ['gilt_imp', 1.6, 3.2],
    ];
    for (const [kind, dx, dz] of kinds) {
      const gx = Math.floor(stand.x + dx);
      const gz = Math.floor(mz + dz);
      const gy = s.surfaceY(gx, gz);
      s.spawnMob(kind, gx + 0.5, gy + 1, gz + 0.5);
    }
    s.teleport(stand.x, feet + 4, stand.z, 0, -0.16);
    return { stand, feet, mobs: s.mobs().filter((m) => String(m.kind).startsWith('gilt_')).map((m) => `${m.kind}@${m.x.toFixed(0)},${m.y.toFixed(0)},${m.z.toFixed(0)}`) };
  });
  console.log('camera', JSON.stringify(cam));
  await settle(8000);
  await page.screenshot({ path: `${outDir}/gilded.jpg`, type: 'jpeg', quality: 86 });
  console.log('saved gilded', star.kind);
}

await browser.close();
