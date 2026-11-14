// Marketing screenshots of the game for the home page (clean: no HUD, no hand). 1920x1080 JPEGs.
// Usage: node scripts/shots.mjs [url] [outDir] [scene,scene...]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:3000';
const outDir = process.argv[3] ?? 'tmp-shots/cand';
const only = process.argv[4]?.split(',');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const W = 1920;
const H = 1080;

/** Open a world and get ready. */
async function open(seed) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('[err]', m.text().slice(0, 300)));
  await page.goto(`${url}/?seed=${seed}&debug&nomobs&mode=creative&shadows=4096`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 240000 });
  await page.evaluate(() => {
    for (const id of ['overlay', 'hud-bottom', 'crosshair', 'debug', 'net', 'item-name', 'vignette']) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
    const st = document.createElement('style');
    st.textContent = 'nextjs-portal{display:none!important}';
    document.head.appendChild(st);
    const s = window.__solrift;
    s.forceLock();
    s.setHandHidden(true);
    s.setRenderDistance(10);
  });
  return page;
}

async function go(page, x, z, dy, yaw, pitch, time, weather = 'clear', settle = 5000) {
  await page.evaluate(([x, z]) => window.__solrift.teleport(x + 0.5, 200, z + 0.5), [x, z]);
  await page.waitForTimeout(5000);
  const y = await page.evaluate(([x, z]) => window.__solrift.surfaceY(x, z), [x, z]);
  await page.evaluate(([x, y, z, dy, yaw, pitch, time, weather]) => {
    const s = window.__solrift;
    s.setFlying(true);
    s.setTime(time);
    s.setWeather(weather);
    s.teleport(x + 0.5, y + dy, z + 0.5, yaw, pitch);
  }, [x, y, z, dy, yaw, pitch, time, weather]);
  await page.waitForTimeout(settle);
  return y;
}

const snap = async (page, name) => {
  await page.screenshot({ path: `${outDir}/${name}.jpg`, type: 'jpeg', quality: 84 });
  console.log('saved', name);
};
const want = (n) => !only || only.includes(n);

// ---- villages ----------------------------------------------------------------------------
// [name, seed, dx, dz (from the village centre), height above ground, yaw, pitch, time, weather]
const scenes = [
  ['v17-golden', 17, 0, 14, 3, 0, -0.12, 0.46],
  ['v17-aerial', 17, 0, 28, 24, 0, -0.5, 0.45],
  ['v17-night', 17, 0, 14, 3, 0, -0.1, 0.7],
  ['v17-storm', 17, 0, 22, 8, 0.3, -0.2, 0.3, 'thunder'],
  ['v19-golden', 19, 0, 16, 4, 0, -0.14, 0.46],
  ['v19-aerial', 19, 0, 30, 26, 0, -0.5, 0.45],
  ['v19-noon', 19, 14, 22, 8, 0.6, -0.2, 0.22],
  ['v56-golden', 56, 0, 16, 4, 0, -0.14, 0.46],
  ['v56-aerial', 56, 0, 30, 26, 0, -0.5, 0.45],
  ['v56-noon', 56, 14, 22, 8, 0.6, -0.2, 0.22],
];
for (const seed of [17, 19, 56]) {
  const mine = scenes.filter((s) => s[1] === seed && (want(s[0]) || (only && only.includes(`v${seed}`))));
  const extra = seed === 17 && (want('mobs') || want('hero'));
  if (!mine.length && !extra) continue;
  const page = await open(seed);
  const site = await page.evaluate(() => window.__solrift.nearestVillage(0, 0));
  console.log('village', seed, JSON.stringify(site));
  if (site) {
    for (const [name, , dx, dz, dy, yaw, pitch, time, weather] of mine) {
      await go(page, site.x + dx, site.z + dz, dy, yaw, pitch, time, weather ?? 'clear', weather ? 9000 : 5000);
      await snap(page, name);
    }
    if (extra && want('mobs')) {
      const y = await go(page, site.x, site.z + 16, 2, 0, -0.1, 0.47, 'clear', 500);
      await page.evaluate(([x, y, z]) => {
        const s = window.__solrift;
        s.clearMobs();
        ['pig', 'cow', 'sheep', 'zombie', 'skeleton', 'creeper', 'villager'].forEach((k, i) => {
          const th = (i / 6 - 0.5) * 1.4;
          s.spawnMob(k, x + 5 * Math.sin(th) + 0.5, y + 1, z + 16 - 5 * Math.cos(th) + 0.5);
        });
      }, [site.x, y, site.z]);
      await page.waitForTimeout(6000);
      await snap(page, 'mobs');
    }
    if (extra && want('hero')) {
      // The player in diamond armour with a sword, in the village street at golden hour.
      await go(page, site.x, site.z + 12, 1, 0, -0.1, 0.46, 'clear', 500);
      await page.evaluate(() => {
        const s = window.__solrift;
        s.clearInventory();
        for (const n of ['diamond_helmet', 'diamond_chestplate', 'diamond_leggings', 'diamond_boots']) {
          s.give(s.itemId(n));
          s.select(0);
          s.equipHeld();
        }
        s.give(s.itemId('diamond_sword'));
        s.select(0);
        s.setView(1);
      });
      await page.waitForTimeout(6000);
      await snap(page, 'hero-back');
      await page.evaluate(() => window.__solrift.setView(2));
      await page.waitForTimeout(4000);
      await snap(page, 'hero-front');
    }
  }
  await page.close();
}

await browser.close();
