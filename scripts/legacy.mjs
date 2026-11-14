// Rename E2E: worlds saved in the browser under the game's old database name are not lost. Saves belong to a wallet
// character now (a guest keeps nothing and never opens them), so the first wallet character to play on the device takes
// them over: they are copied into that character's own database, and the old database is removed.
// Usage: node scripts/legacy.mjs [url] [outDir]
import { launchBrowser } from './browser.mjs';
import { enterAs, installWallet } from './titleFlow.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';

const OLD = 'sol' + 'craft';
const browser = await launchBrowser();
const failures = [];
const check = (cond, msg) => {
  if (cond) console.log('  ok  ', msg);
  else {
    console.log('  FAIL', msg);
    failures.push(msg);
  }
};

const ctx = await browser.newContext();
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await installWallet(page);
const dbNames = () => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
await page.goto(`${url}/`, { waitUntil: 'load' });
await page.waitForSelector('.wow-play', { timeout: 30000 });

console.log('an old database with a saved world');
await page.evaluate(
  (name) =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 3);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of ['chunks', 'players', 'worlds', 'sync']) db.createObjectStore(s);
      };
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['players', 'chunks'], 'readwrite');
        tx.objectStore('players').put({ marker: 'old world' }, '4242');
        tx.objectStore('chunks').put(new Uint8Array([1, 2, 3]), '4242:0,0');
        tx.oncomplete = () => (db.close(), resolve());
        tx.onerror = () => reject(tx.error);
      };
    }),
  OLD,
);
const before = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
check(before.includes(OLD) && !before.includes('solrift'), 'only the old database exists to begin with');

console.log('a wallet character starting the game takes it over');
await enterAs(page, 'wallet');
await page.waitForFunction(() => document.getElementById('home') === null, undefined, { timeout: 60000 });
const id = (await page.evaluate(() => fetch('/api/auth/me', { credentials: 'same-origin' }).then((r) => r.json()))).account?.id;
const own = `solrift-${id}`;
let names = [];
for (let i = 0; i < 100; i++) {
  names = await dbNames();
  if (names.includes(own) && !names.includes(OLD) && !names.includes('solrift')) break;
  await page.waitForTimeout(200);
}
check(typeof id === 'string' && names.includes(own), `the character's own database was created (${names.join(', ')})`);
check(!names.includes(OLD), 'the old database was removed');
check(!names.includes('solrift'), 'and nothing is left in a database that belongs to nobody');
// (Read only when it is there: opening a database that does not exist would create an empty one.)
const copied = names.includes(own)
  ? await page.evaluate(
      (name) =>
        new Promise((resolve, reject) => {
          const req = indexedDB.open(name);
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction(['players', 'chunks'], 'readonly');
            const p = tx.objectStore('players').get('4242');
            const c = tx.objectStore('chunks').get('4242:0,0');
            tx.oncomplete = () => (db.close(), resolve({ player: p.result, chunk: c.result ? Array.from(c.result) : null }));
            tx.onerror = () => (db.close(), reject(tx.error));
          };
        }),
      own,
    )
  : {};
check(copied.player?.marker === 'old world', 'the player record arrived');
check(JSON.stringify(copied.chunk) === '[1,2,3]', 'the chunk arrived');
check(errors.length === 0, `no page errors${errors.length ? `: ${errors[0]}` : ''}`);

await browser.close();
if (failures.length) {
  console.error(`\nlegacy E2E FAILED (${failures.length})`);
  process.exit(1);
}
console.log('legacy E2E passed');
