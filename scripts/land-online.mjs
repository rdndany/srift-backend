// Buying land for real: a browser signs in with a (mock) Solana wallet on a live game server with a real SQLite database, takes the Land
// Surveyor, marks four corners with the mouse, reads the server's price, confirms and buys; then the server is stopped and started again
// and the claim must still be there, and be the wallet's. Nothing is faked: every number on the screen comes from the server.
// It starts its own game server (:8795) and web server (:3201), so it does not touch a running game.
// Usage: node scripts/land-online.mjs [outDir]
import { generateKeyPairSync, sign } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, openSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { launchBrowser } from './browser.mjs';

const outDir = process.argv[2] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });
const WEB_PORT = 3201;
const GAME_PORT = 8795;
const url = `http://localhost:${WEB_PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const check = (cond, msg) => {
  if (cond) console.log('  ok  ', msg);
  else {
    console.log('  FAIL', msg);
    failures.push(msg);
  }
};

// ---- a wallet --------------------------------------------------------------------------------------------------------------------
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58(bytes) {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let s = '';
  while (n > 0n) {
    s = ALPHABET[Number(n % 58n)] + s;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    s = '1' + s;
  }
  return s;
}
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const raw = [...publicKey.export({ format: 'der', type: 'spki' }).subarray(-32)];
const address = base58(Uint8Array.from(raw));

// ---- the servers -----------------------------------------------------------------------------------------------------------------
const work = mkdtempSync(path.join(os.tmpdir(), 'land-e2e-'));
const dbPath = path.join(work, 'game.db');
const children = [];
const stopAll = () => children.forEach((c) => !c.killed && c.kill());
process.on('exit', stopAll);
process.on('SIGINT', () => process.exit(130));

function waitForPort(port, ms = 120000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const once = () => {
      const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => {
        s.destroy();
        resolve();
      });
      s.once('error', () => {
        s.destroy();
        if (Date.now() - start > ms) reject(new Error(`port ${port} never opened`));
        else setTimeout(once, 300);
      });
    };
    once();
  });
}
let gameN = 0;
async function startGame() {
  const log = openSync(path.join(work, `game-${++gameN}.log`), 'w');
  const g = spawn(process.execPath, ['--import', 'tsx', 'apps/server/src/index.ts'], {
    env: { ...process.env, PORT: String(GAME_PORT), WORLD_KIND: 'overworld', WORLD_SEED: '1337', DATABASE_PATH: dbPath, AUTH_ORIGINS: url, CHEATS: '1', NO_MOBS: '1', ADMIN_WALLETS: address, HEARTBEAT_MS: '120000', MAX_CONN_PER_IP: '50', CONNECTS_PER_MINUTE: '100000' },
    stdio: ['ignore', log, log],
  });
  children.push(g);
  await waitForPort(GAME_PORT, 60000);
  return g;
}
const webDir = path.resolve('apps/web');
const nextBin = createRequire(path.join(webDir, 'package.json')).resolve('next/dist/bin/next');
const web = spawn(process.execPath, [nextBin, 'dev', '-p', String(WEB_PORT)], {
  cwd: webDir,
  env: { ...process.env, NEXT_DIST_DIR: '.next-look', SERVER_ORIGIN: `http://localhost:${GAME_PORT}`, NEXT_PUBLIC_SERVER_URL: `ws://localhost:${GAME_PORT}` },
  stdio: ['ignore', openSync(path.join(work, 'web.log'), 'w'), 'ignore'],
});
children.push(web);
console.log(`> logs and database in ${work}`);
let game = await startGame();
await waitForPort(WEB_PORT);

// ---- the browser -----------------------------------------------------------------------------------------------------------------
const browser = await launchBrowser();
const errors = [];
async function signedInPage(tag) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/GPU stall|X3595|willReadFrequently|preload|Blit feedback|favicon|Failed to load resource|WebSocket|ERR_CONNECTION/.test(m.text()) && errors.push(`${tag}: ${m.text().slice(0, 300)}`));
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  await page.exposeFunction('__mockSign', (msg) => [...sign(null, Buffer.from(msg), privateKey)]);
  await page.addInitScript(({ address, raw }) => {
    let connected = false;
    const account = { address, publicKey: Uint8Array.from(raw), chains: ['solana:devnet'], features: ['solana:signMessage'] };
    const wallet = {
      version: '1.0.0',
      name: 'Mock Wallet',
      icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=',
      chains: ['solana:devnet'],
      get accounts() {
        return connected ? [account] : [];
      },
      features: {
        'standard:connect': {
          version: '1.0.0',
          connect: async () => {
            connected = true;
            return { accounts: [account] };
          },
        },
        'standard:events': { version: '1.0.0', on: () => () => {} },
        'solana:signMessage': {
          version: '1.0.0',
          signMessage: async (...inputs) => {
            const outs = [];
            for (const i of inputs) outs.push({ signedMessage: i.message, signature: Uint8Array.from(await window.__mockSign(Array.from(i.message))) });
            return outs;
          },
        },
      },
    };
    const register = (api) => api.register(wallet);
    window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: register }));
    window.addEventListener('wallet-standard:app-ready', (e) => register(e.detail));
  }, { address, raw });
  await page.goto(`${url}/?online&debug&nomobs&noshadows&noaa&nohalos`, { waitUntil: 'load' });
  await page.waitForSelector('#signin, #account-name', { timeout: 180000 });
  if (await page.locator('#signin').count()) {
    await page.click('#signin');
    await page.click('.wallet-option');
    await page.waitForSelector('#account-name', { timeout: 30000 });
    await page.reload({ waitUntil: 'load' });
  }
  await page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 240000 });
  await page.evaluate(() => {
    const o = document.getElementById('overlay');
    if (o) o.style.display = 'none';
    window.__solrift.forceLock();
  });
  return page;
}
const hook = (page, fn, ...args) => page.evaluate(([f, a]) => window.__solrift[f](...a), [fn, args]);
const until = async (fn, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(150);
  }
  return false;
};
const chat = async (page, text) => {
  await hook(page, 'chat', text);
  await sleep(500);
};
const text = (page, id) => page.evaluate((i) => document.querySelector(`[data-testid="${i}"]`)?.innerText ?? null, id);
const has = (page, id) => page.evaluate((i) => !!document.querySelector(`[data-testid="${i}"]`), id);
const landState = (page) => hook(page, 'land');

// ---- 1: sign in, equip, mark, buy ------------------------------------------------------------------------------------------------
console.log('signing in and getting ready');
let page = await signedInPage('first');
check(await hook(page, 'online'), 'the game is online, as a signed-in wallet');
await chat(page, '/admin on');
await chat(page, '/coins 10000');
await chat(page, '/give auren_land_surveyor');
await chat(page, '/tp -150 75 -105');
check(await until(async () => Math.abs((await hook(page, 'position')).y - 67) < 3 && Math.abs((await hook(page, 'position')).x + 150) < 3, 30000), 'the server put the player down at the spawn field (-150, -105)');
await sleep(4000);
const chatLog = await hook(page, 'chatLog');
check(!chatLog.some((l) => /No item called|Unknown command|Cheats are off|Admin mode is off/.test(l)), `the commands were accepted (${chatLog.slice(-3).join(' | ')})`);
let slot = -1;
for (let i = 0; i < 9 && slot < 0; i++) {
  await page.keyboard.press(`Digit${i + 1}`);
  await sleep(250);
  if ((await hook(page, 'heldId')) === 620) slot = i;
}
check(slot >= 0, 'the Land Surveyor is in the hotbar (given by an administrator)');
const coinsBefore = await hook(page, 'coins');
check(coinsBefore >= 10000, `the player has the Auren (${coinsBefore})`);
check(await until(() => has(page, 'land-keys'), 20000), 'the server told the client its land rules, so the Surveyor is live');
await page.screenshot({ path: `${outDir}/land-online-1-held.png` });

console.log('marking four corners with the mouse');
for (const yaw of [0, -0.9, -1.9, -2.8]) {
  await hook(page, 'look', yaw, -0.16);
  await sleep(300);
  await page.mouse.click(640, 360);
  await sleep(300);
}
let st = await landState(page);
check(st.corners.length === 4, `four corners are marked ${JSON.stringify(st.corners)}`);
check(await until(async () => (await text(page, 'land-status')) !== null && (await text(page, 'land-status')) !== '', 10000), 'the server answered with a verdict');
const status = await text(page, 'land-status');
check(status === 'Available Land', `the server says: "${status}"`);
await page.screenshot({ path: `${outDir}/land-online-2-priced.png` });

console.log('closing the shape and confirming');
await page.keyboard.press('KeyE');
await sleep(400);
await page.keyboard.press('KeyE');
check(await until(() => has(page, 'land-confirm'), 8000), 'the confirmation is up');
const total = await text(page, 'land-total');
const price = Number((total ?? '').replace(/[^0-9]/g, ''));
check(price > 0, `the server priced it: ${total}`);
await page.screenshot({ path: `${outDir}/land-online-3-confirm.png` });

console.log('buying (the button is pressed twice, as an impatient player would)');
await page.evaluate(() => {
  const b = document.querySelector('[data-testid="land-buy"]');
  b.click();
  b.click();
});
check(await until(async () => (await landState(page)).result?.what === 'buy', 15000), 'the server answered the purchase');
st = await landState(page);
check(st.result?.ok === true, `the purchase went through: "${st.result?.text}"`);
await sleep(1500);
const coinsAfter = await hook(page, 'coins');
check(coinsBefore - coinsAfter === price, `exactly the price was taken, once (${coinsBefore} -> ${coinsAfter}, price ${price})`);
check(await until(async () => (await landState(page)).mine.length === 1, 10000), 'the claim is in the list of the player\u2019s lands');
st = await landState(page);
console.log('  claim:', JSON.stringify(st.mine[0]));
check(st.mine[0]?.paid === price && st.mine[0]?.status === 'active', 'it is active and records what was paid');
await sleep(1200);
await page.screenshot({ path: `${outDir}/land-online-4-bought.png` });
const coinsSaved = coinsAfter;

// The fence the purchase builds: all round the claim, a gate, and the owner's sign (sent to this client with the snapshots).
console.log('the fence, the gate and the sign');
const [bx0, bz0, bx1, bz1] = st.mine[0].box;
const fenceOf = () =>
  page.evaluate(([x0, z0, x1, z1]) => {
    const s = window.__solrift;
    const { fence } = s.signs();
    let columns = 0;
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        for (let y = 50; y < 110; y++) {
          if (s.getBlock(x, y, z) === fence) {
            columns++;
            break;
          }
        }
      }
    }
    return columns;
  }, [bx0, bz0, bx1, bz1]);
await hook(page, 'chat', `/tp ${Math.round((bx0 + bx1) / 2)} 75 ${bz1 + 6}`);
await sleep(4000);
check(await until(async () => (await hook(page, 'signs')).near.length === 1, 20000), 'the server sent the sign it built');
const board = (await hook(page, 'signs')).near[0];
console.log('  sign:', JSON.stringify(board));
check(board.lines[0] === 'Property of' && board.lines[1].length > 0, `it says whose land it is: ${JSON.stringify(board.lines)}`);
const onEdge = board.x >= bx0 && board.x <= bx1 && board.z >= bz0 && board.z <= bz1;
check(onEdge, 'the sign stands in the claim\u2019s square');
const ring = await fenceOf();
check(ring >= 60 && ring <= 400, `a fence of ${ring} blocks stands round a claim of 800 blocks`);
check((await hook(page, 'signs')).boards === 1, 'its writing is drawn');
{
  // Put the Surveyor away and the tutorial card with it, so that the view is clear.
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /got it/i.test(b.textContent ?? ''))?.click());
  await page.keyboard.press('Digit4');
  await sleep(500);
  // Stand outside, in front of the sign, and look at it.
  const mx = (bx0 + bx1) / 2;
  const mz = (bz0 + bz1) / 2;
  const dx = board.x + 0.5 - mx;
  const dz = board.z + 0.5 - mz;
  const along = Math.abs(dx) > Math.abs(dz) ? [Math.sign(dx), 0] : [0, Math.sign(dz)];
  const yaw = along[0] === 0 ? (along[1] > 0 ? Math.PI : 0) : along[0] > 0 ? Math.PI / 2 : -Math.PI / 2;
  await hook(page, 'chat', `/tp ${board.x + 0.5 + along[0] * 3} ${board.y + 2} ${board.z + 0.5 + along[1] * 3}`);
  await sleep(2500);
  await hook(page, 'look', yaw, -0.2);
  await sleep(800);
  await page.screenshot({ path: `${outDir}/land-online-4b-sign.png` });
  await hook(page, 'chat', `/tp ${Math.round(mx)} 75 ${bz1 + 14}`);
  await sleep(2500);
  await hook(page, 'look', 0, -0.35);
  await sleep(800);
  await page.screenshot({ path: `${outDir}/land-online-4c-fence.png` });
}
const signAtBuy = board;
await page.context().close();

// ---- 2: what the database holds ------------------------------------------------------------------------------------------------------
console.log('the database');
// (The server writes the land every few seconds, and the world's blocks and signs every 30 seconds; on Windows a stopped child gets no
// chance to say goodbye, so the test waits for an autosave to pass.)
await sleep(33000);
game.kill();
await sleep(1500);
{
  const db = new DatabaseSync(dbPath);
  const tables = db.prepare("select name from sqlite_master where type='table' and name like '%land%'").all().map((t) => t.name);
  console.log('  land tables:', tables.join(', '));
  const claimTable = tables.find((t) => /claim/.test(t));
  const rows = claimTable ? db.prepare(`select count(*) as n from ${claimTable}`).get() : { n: -1 };
  check(rows.n === 1, `one claim is stored on disk (${rows.n})`);
  const txnTable = tables.find((t) => /txn|transaction/.test(t));
  if (txnTable) {
    const t = db.prepare(`select * from ${txnTable}`).all();
    check(t.length === 1 && t[0].state === 'committed' && Number(t[0].amount) === price, `one committed transaction of ${price} Auren is on record`);
  }
  db.close();
}

// ---- 3: a restart ------------------------------------------------------------------------------------------------------------------------
console.log('stopping and starting the server again');
game = await startGame();
page = await signedInPage('second');
check(await hook(page, 'online'), 'back online with the same wallet');
check(await until(async () => (await landState(page)).mine.length === 1, 30000), 'the claim is still the wallet\u2019s after the restart');
st = await landState(page);
check(st.mine[0]?.paid === price, 'with the same price paid');
const coinsNow = await hook(page, 'coins');
check(coinsNow === coinsSaved, `the Auren are as they were (${coinsNow})`);
await hook(page, 'chat', `/tp ${signAtBuy.x + 3} 75 ${signAtBuy.z + 3}`);
await sleep(6000);
{
  const again = (await hook(page, 'signs')).near;
  check(again.length === 1 && JSON.stringify(again[0].lines) === JSON.stringify(signAtBuy.lines), 'the sign, with its words, is still there after the restart ' + JSON.stringify(again));
}
await page.screenshot({ path: `${outDir}/land-online-5-after-restart.png` });
await hook(page, 'chat', '/tp -150 75 -105');
await sleep(3000);
st = await landState(page);
check(st.nearby >= 1, `the claim is among the lands round the player (${st.nearby})`);

const real = errors.filter((e) => !/Failed to load resource/.test(e));
check(real.length === 0, `no console errors${real.length ? `: ${real.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
stopAll();
await sleep(500);
try {
  rmSync(work, { recursive: true, force: true });
} catch {
  /* a file still open: the temp folder is left for the system */
}
if (failures.length) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('real purchase OK');
