// Saves E2E: legacy localStorage migration + IndexedDB v1 -> v2 upgrade, world export/import through
// the real UI, hostile files, and refusing saves from a newer game version.
// Usage: node scripts/saves.mjs [url] [outDir]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const B = { STONE: 1, AIR: 0, PLANKS: 10 };
const I = { ARROW: 266, BOW: 303 };

const browser = await launchBrowser();
const errors = [];
const failures = [];
const check = (cond, msg) => {
  if (cond) console.log('  ok  ', msg);
  else {
    console.log('  FAIL', msg);
    failures.push(msg);
  }
};

/** A fresh browser profile (own IndexedDB and localStorage) with console error capture. */
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return page;
}
const ready = async (page, query) => {
  await page.goto(`${url}/?debug&nomobs${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 120000 });
};
const state = async (page) => JSON.parse(await page.evaluate(() => window.__solrift.savedState()));
const block = (page, x, y, z) => page.evaluate(([x, y, z]) => window.__solrift.getBlock(x, y, z), [x, y, z]);

// ---------------------------------------------------------------------------------------------------
console.log('legacy save migration');
{
  const page = await newPage();
  // Same origin, but not the game page: builds the database exactly as the old game version did.
  await page.goto(`${url}/robots.txt`, { waitUntil: 'load' });
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('solrift', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('chunks');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const raw = new Uint8Array(16 * 16 * 128);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) for (let y = 0; y <= 5; y++) raw[(y * 16 + z) * 16 + x] = 1;
    raw[(6 * 16 + 1) * 16 + 1] = 10; // a plank block at (1, 6, 1)
    await new Promise((resolve, reject) => {
      const tx = db.transaction('chunks', 'readwrite');
      tx.objectStore('chunks').put(raw, '4242:0,0');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    const inv = Array(36).fill(null);
    inv[0] = [266, 5, 0];
    inv[1] = [303, 1, 12];
    localStorage.setItem(
      'solrift.player.4242',
      JSON.stringify({ x: 8.5, y: 40, z: 8.5, yaw: 1, pitch: 0, time: 0.6, weather: { kind: 'rain', timer: 500 }, mobs: [], inv, vitals: null, mode: 'creative', selected: 3 }),
    );
    localStorage.setItem('solrift.be.4242', JSON.stringify([]));
  });

  await ready(page, '&seed=4242');
  await page.waitForTimeout(800);
  const s = await state(page);
  check(s.player?.v === 1 && s.world?.v === 1, 'legacy data became versioned player + world records');
  check(s.player?.mode === 'creative' && s.player.selected === 3, 'mode and hotbar slot survived');
  check(Math.abs(s.world.time - 0.6) < 0.05, `world clock survived (${s.world.time.toFixed(3)})`);
  check(s.world.weather?.kind === 'rain', 'weather survived');
  check((await page.evaluate((a) => window.__solrift.countOf(a), I.ARROW)) === 5, 'inventory survived');
  check((await block(page, 1, 6, 1)) === B.PLANKS, 'edited chunk from the v1 database loaded');
  check((await block(page, 2, 3, 2)) === B.STONE, 'the rest of the chunk loaded too');
  const left = await page.evaluate(() => [localStorage.getItem('solrift.player.4242'), localStorage.getItem('solrift.be.4242')]);
  check(left[0] === null && left[1] === null, 'legacy localStorage keys were removed');
  const stored = await page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const req = indexedDB.open('solrift');
      req.onsuccess = () => resolve(req.result);
    });
    const v = await new Promise((resolve) => {
      const r = db.transaction('chunks').objectStore('chunks').get('4242:0,0');
      r.onsuccess = () => resolve(r.result);
    });
    const info = { version: db.version, first: v[0], bytes: v.length };
    db.close();
    return info;
  });
  check(stored.version === 3 && stored.first === 4 && stored.bytes < 2000, `chunk was compressed in place (${stored.bytes} bytes, db v${stored.version})`);
  await page.context().close();
}

// ---------------------------------------------------------------------------------------------------
console.log('export and import');
{
  const page = await newPage();
  await ready(page, '&seed=1337');
  const pos = await page.evaluate(() => window.__solrift.position());
  const px = Math.floor(pos.x);
  const pz = Math.floor(pos.z);
  const gy = await page.evaluate(([x, z]) => window.__solrift.surfaceY(x, z), [px, pz]);
  await page.evaluate(
    ([px, pz, gy, plank, arrow]) => {
      const s = window.__solrift;
      s.setBlock(px + 2, gy + 30, pz + 2, plank);
      s.setBlock(px + 40, gy + 30, pz - 40, plank); // a second chunk
      s.clearInventory();
      s.give(arrow, 7);
      s.setTime(0.4);
    },
    [px, pz, gy, B.PLANKS, I.ARROW],
  );

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-world')]);
  const file = `${outDir}/test-world.solrift`;
  await download.saveAs(file);
  const raw = readFileSync(file);
  check(download.suggestedFilename().endsWith('.solrift'), `download is a .solrift file (${download.suggestedFilename()})`);
  const unpacked = gunzipSync(raw);
  check(String.fromCharCode(...unpacked.subarray(0, 4)) === 'SCW1', 'file is gzip around the SCW1 container');
  check(raw.length < 200_000, `exported world is small (${raw.length} bytes)`);

  // Wreck the world, then import the backup over it through the real file picker.
  await page.evaluate(
    ([px, pz, gy, air]) => {
      const s = window.__solrift;
      s.setBlock(px + 2, gy + 30, pz + 2, air);
      s.setBlock(px + 40, gy + 30, pz - 40, air);
      s.clearInventory();
      s.setTime(0.9);
    },
    [px, pz, gy, B.AIR],
  );
  check((await block(page, px + 2, gy + 30, pz + 2)) === B.AIR, 'world was changed after the export');
  page.once('dialog', (d) => d.accept());
  const nav = page.waitForNavigation({ waitUntil: 'load' });
  await page.setInputFiles('#import-file', file);
  await nav;
  await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 120000 });
  await page.waitForTimeout(600);
  check((await block(page, px + 2, gy + 30, pz + 2)) === B.PLANKS, 'imported world has the first edit back');
  check((await block(page, px + 40, gy + 30, pz - 40)) === B.PLANKS, 'imported world has the edit in the second chunk');
  check((await page.evaluate((a) => window.__solrift.countOf(a), I.ARROW)) === 7, 'imported inventory');
  const s = await state(page);
  check(Math.abs(s.world.time - 0.4) < 0.05, `imported world clock (${s.world.time.toFixed(3)})`);

  // Hostile and broken files must be rejected and change nothing.
  console.log('hostile files');
  const bad = [
    ['random bytes', Buffer.from('this is definitely not a world file at all, just text...')],
    ['truncated', raw.subarray(0, Math.floor(raw.length / 2))],
    ['bit flip', (() => { const c = Buffer.from(unpacked); c[Math.floor(c.length / 2)] ^= 4; return c; })()],
  ];
  for (const [name, bytes] of bad) {
    const p = `${outDir}/bad-world.solrift`;
    writeFileSync(p, bytes);
    page.once('dialog', (d) => d.accept());
    await page.setInputFiles('#import-file', p);
    await page.waitForFunction(() => document.getElementById('world-msg')?.textContent, undefined, { timeout: 15000 });
    const msg = await page.textContent('#world-msg');
    check(msg && !msg.startsWith('Saved'), `${name} was rejected: "${msg}"`);
    check((await block(page, px + 2, gy + 30, pz + 2)) === B.PLANKS, `${name}: the world is untouched`);
    await page.evaluate(() => (document.getElementById('world-msg').textContent = ''));
  }
  await page.context().close();
}

// ---------------------------------------------------------------------------------------------------
console.log('saves from a newer version');
{
  const page = await newPage();
  await ready(page, '&seed=777');
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__solrift.save());
  await page.evaluate(() => window.__solrift.freezeSaves());
  await page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const req = indexedDB.open('solrift');
      req.onsuccess = () => resolve(req.result);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('players', 'readwrite');
      tx.objectStore('players').put({ v: 99, x: 1, y: 70, z: 1 }, '777');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.goto(`${url}/?debug&nomobs&seed=777`, { waitUntil: 'load' });
  await page.waitForFunction(() => /cannot be loaded/.test(document.getElementById('status')?.textContent ?? ''), undefined, { timeout: 60000 });
  const msg = await page.textContent('#status');
  check(/newer game version/.test(msg), `newer saves are refused: "${msg}"`);
  const still = await page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const req = indexedDB.open('solrift');
      req.onsuccess = () => resolve(req.result);
    });
    const v = await new Promise((resolve) => {
      const r = db.transaction('players').objectStore('players').get('777');
      r.onsuccess = () => resolve(r.result);
    });
    db.close();
    return v?.v;
  });
  check(still === 99, 'the newer save was not overwritten');
  await page.context().close();
}

const real = errors.filter((e) => !/favicon|WebSocket|ERR_CONNECTION|robots|404|Failed to start|cannot be loaded/i.test(e));
check(real.length === 0, 'no unexpected console errors: ' + real.slice(0, 3).join(' | '));
await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log('saves OK');

