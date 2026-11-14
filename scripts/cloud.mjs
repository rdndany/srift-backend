// Cloud saves E2E with a mock wallet and several "devices" (separate browser profiles sharing one
// account): first upload, restoring on a new device, the write lease, conflicts, backups and restore,
// deleting the cloud copy, and isolation between accounts.
// Needs the game server running (scripts/e2e.mjs starts one). Usage: node scripts/cloud.mjs [url] [outDir]
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const SEED = 4343;
const B = { AIR: 0, STONE: 1, PLANKS: 10 };
const ARROW = 266;

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
function keypair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = [...publicKey.export({ format: 'der', type: 'spki' }).subarray(-32)];
  return { raw, address: base58(Uint8Array.from(raw)), privateKey };
}

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

/** A browser profile that can sign in as `kp` (a mock Wallet Standard wallet), or reuse a session via `cookies`. */
async function device(kp, cookies) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept()); // confirm() prompts (restore, delete)
  if (cookies) await ctx.addCookies(cookies);
  if (kp) {
    await page.exposeFunction('__mockSign', (msg) => [...sign(null, Buffer.from(msg), kp.privateKey)]);
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
          'standard:connect': { version: '1.0.0', connect: async () => ((connected = true), { accounts: [account] }) },
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
    }, kp);
  }
  return { ctx, page };
}

const ready = (page) => page.waitForFunction(() => window.__solrift?.isReady?.(), undefined, { timeout: 120000 });
const open = async (page) => {
  await page.goto(`${url}/?debug&nomobs&seed=${SEED}&syncms=3600000`, { waitUntil: 'load' });
  await ready(page);
};
const signIn = async (page) => {
  await page.click('#signin');
  await page.click('.wallet-option');
  await page.waitForSelector('#account-name', { timeout: 20000 });
};
const phase = (page) => page.evaluate(() => window.__cloud?.state().phase ?? null);
const cloudState = (page) => page.evaluate(() => window.__cloud.state());
const waitPhase = (page, p, timeout = 30000) =>
  page
    .waitForFunction((p) => window.__cloud?.state().phase === p, p, { timeout })
    .then(() => true)
    .catch(() => false);
const hasButton = async (page, id) => (await page.locator(id).count()) > 0;

/** Click something that reloads the page, then wait until the game and sync are up again in `want`. */
async function clickReload(page, selector, want = 'idle') {
  const nav = page.waitForNavigation({ waitUntil: 'load', timeout: 60000 });
  await page.click(selector);
  await nav;
  await ready(page);
  const ok = await waitPhase(page, want, 30000);
  await page.waitForTimeout(800); // far chunks stream in
  return ok;
}

const player = (page) => page.evaluate(() => window.__solrift.position());
const block = (page, x, y, z) => page.evaluate(([x, y, z]) => window.__solrift.getBlock(x, y, z), [x, y, z]);
const setBlock = (page, x, y, z, id) => page.evaluate(([x, y, z, id]) => window.__solrift.setBlock(x, y, z, id), [x, y, z, id]);
const saveLocal = (page) => page.evaluate(() => window.__solrift.save());
/** Same-origin API call as the signed-in page. */
const api = (page, path, init) =>
  page.evaluate(
    async ([path, init]) => {
      const res = await fetch(`/api/cloud/worlds${path}`, { credentials: 'same-origin', ...(init ?? {}) });
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    [path, init ?? null],
  );
const holder = (page) => page.evaluate(() => sessionStorage.getItem('solrift.holder'));
const cloudInfo = async (page) => (await api(page, `/${SEED}?holder=${await holder(page)}`)).body?.world ?? null;

const kp = keypair();
let px = 0;
let pz = 0;
let gy = 0;
const at = (dx, dz) => [px + dx, gy + 30, pz + dz];

// ---------------------------------------------------------------------------------------------------
console.log('first upload from a device with a local world');
const A = await device(kp);
{
  const page = A.page;
  await open(page);
  check((await page.locator('#cloud-panel').count()) === 0, 'guests see no cloud panel');
  const unauth = await api(page, '');
  check(unauth.status === 401, `the cloud API refuses guests (${unauth.status})`);

  const pos = await player(page);
  px = Math.floor(pos.x);
  pz = Math.floor(pos.z);
  gy = await page.evaluate(([x, z]) => window.__solrift.surfaceY(x, z), [px, pz]);
  await page.evaluate(
    ([p1, p2, plank, arrow]) => {
      const s = window.__solrift;
      s.setBlock(...p1, plank);
      s.setBlock(...p2, plank); // a second chunk
      s.clearInventory();
      s.give(arrow, 7);
      s.setTime(0.4);
    },
    [at(2, 2), [px + 40, gy + 30, pz - 40], B.PLANKS, ARROW],
  );
  await saveLocal(page);

  await signIn(page);
  check(await waitPhase(page, 'choose'), 'signing in on a device with a world asks what to do');
  check(!(await hasButton(page, '#cloud-choice-cloud')), 'no "use the cloud world" option when the cloud is empty');
  await page.screenshot({ path: `${outDir}/cloud-choose.png` });
  await page.click('#cloud-choice-upload');
  check(await waitPhase(page, 'synced'), 'upload finished');
  const info = await cloudInfo(page);
  check(info?.revision === 1 && info.chunks >= 2, `cloud has revision ${info?.revision} with ${info?.chunks} chunks`);
  check(info?.mine === true, 'this tab holds the write lease');
  await page.screenshot({ path: `${outDir}/cloud-synced.png` });
}

// ---------------------------------------------------------------------------------------------------
console.log('a second device downloads the cloud world');
const Bdev = await device(kp);
{
  const page = Bdev.page;
  await open(page);
  await saveLocal(page); // give this device its own (fresh) local world so it has to choose
  await signIn(page);
  check(await waitPhase(page, 'choose'), 'a device with its own world is asked, never overwritten silently');
  check(await hasButton(page, '#cloud-choice-cloud'), 'and can use the cloud world');
  check(/already has a cloud copy/.test(await page.textContent('#cloud-status')), 'the dialog says a cloud copy exists');
  check(await clickReload(page, '#cloud-choice-cloud'), 'downloaded and reloaded into the cloud world');
  check((await block(page, ...at(2, 2))) === B.PLANKS, 'first edit arrived');
  check((await block(page, px + 40, gy + 30, pz - 40)) === B.PLANKS, 'edit in the second chunk arrived');
  check((await page.evaluate((a) => window.__solrift.countOf(a), ARROW)) === 7, 'inventory arrived');
  check(Math.abs(JSON.parse(await page.evaluate(() => window.__solrift.savedState())).world.time - 0.4) < 0.05, 'world clock arrived');
  const st = await cloudState(page);
  check(st.revision === 1, `this device is on revision ${st.revision}`);
}

// ---------------------------------------------------------------------------------------------------
console.log('the write lease and conflicts');
{
  // B edits and tries to upload while A holds the lease.
  await setBlock(Bdev.page, ...at(2, 2), B.STONE);
  await saveLocal(Bdev.page);
  await Bdev.page.evaluate(() => window.__cloud.syncNow());
  check((await phase(Bdev.page)) === 'locked', `B is told the world is open elsewhere (${await phase(Bdev.page)})`);
  const infoB = await cloudInfo(Bdev.page);
  check(infoB?.revision === 1, `nothing was uploaded (revision ${infoB?.revision})`);
  check(await hasButton(Bdev.page, '#cloud-takeover'), 'B can take over');
  await Bdev.page.click('#cloud-takeover');
  const tookOver = await waitPhase(Bdev.page, 'synced');
  check(tookOver, `B took over and uploaded (phase ${await phase(Bdev.page)})`);
  check((await cloudInfo(Bdev.page))?.revision === 2, 'cloud is on revision 2');

  // A, unaware, makes its own edit. It no longer holds the lease.
  await setBlock(A.page, ...at(5, 5), B.PLANKS);
  await saveLocal(A.page);
  await A.page.evaluate(() => window.__cloud.syncNow());
  check((await phase(A.page)) === 'locked', `A is locked out after B took over (${await phase(A.page)})`);
  await A.page.click('#cloud-takeover');
  check(await waitPhase(A.page, 'conflict'), 'A takes over but its copy is based on an old revision: conflict');
  check((await cloudInfo(A.page))?.revision === 2, 'the cloud was not overwritten');
  check(await hasButton(A.page, '#cloud-conflict-mine') && (await hasButton(A.page, '#cloud-conflict-cloud')), 'A is asked which world to keep');
  await A.page.screenshot({ path: `${outDir}/cloud-conflict.png` });

  check(await clickReload(A.page, '#cloud-conflict-cloud'), 'A uses the cloud world');
  check((await block(A.page, ...at(2, 2))) === B.STONE, "B's edit is now in A's world");
  check((await block(A.page, ...at(5, 5))) === B.AIR, "A's discarded edit is gone");
  check((await cloudState(A.page)).revision === 2, 'A is on revision 2');
}

// ---------------------------------------------------------------------------------------------------
console.log('keeping this device overwrites the cloud, after a backup');
{
  // A uploads one more change (takes the lease back from B), then B conflicts with it.
  await setBlock(A.page, ...at(6, 6), B.PLANKS);
  await saveLocal(A.page);
  await A.page.evaluate(() => window.__cloud.syncNow());
  check((await phase(A.page)) === 'locked', 'A must take the lease from B again');
  await A.page.click('#cloud-takeover');
  check(await waitPhase(A.page, 'synced'), 'A uploaded revision 3');
  check((await cloudInfo(A.page))?.revision === 3, 'cloud is on revision 3');

  await setBlock(Bdev.page, ...at(7, 7), B.PLANKS);
  await saveLocal(Bdev.page);
  await Bdev.page.evaluate(() => window.__cloud.syncNow());
  await Bdev.page.click('#cloud-takeover');
  check(await waitPhase(Bdev.page, 'conflict'), 'B conflicts with A\'s newer upload');
  await Bdev.page.click('#cloud-conflict-mine');
  const kept = await waitPhase(Bdev.page, 'synced');
  if (!kept) console.log('    state:', JSON.stringify(await cloudState(Bdev.page)));
  check(kept, "B kept its own world");
  const info = await cloudInfo(Bdev.page);
  check(info?.revision === 4, `cloud is on revision ${info?.revision}`);

  const backups = (await api(Bdev.page, `/${SEED}/backups`)).body.backups;
  const overwrite = backups.find((b) => b.kind === 'overwrite');
  check(!!overwrite && overwrite.revision === 3, `the overwritten revision 3 was backed up (${backups.map((b) => `${b.kind}@${b.revision}`).join(', ')})`);
}

// ---------------------------------------------------------------------------------------------------
console.log('a new device that is already signed in restores silently');
{
  const D = await device(null, await Bdev.ctx.cookies());
  await D.page.goto(`${url}/?debug&nomobs&seed=${SEED}&syncms=3600000`, { waitUntil: 'load' });
  let ok = false;
  for (let i = 0; i < 30 && !ok; i++) {
    ok = await D.page
      .waitForFunction(() => window.__solrift?.isReady?.() && window.__cloud?.state().phase === 'idle' && window.__cloud.state().revision === 4, undefined, { timeout: 10000 })
      .then(() => true)
      .catch(() => false);
  }
  check(ok, 'downloaded the cloud world without asking, on revision 4');
  await D.page.waitForTimeout(800);
  check((await block(D.page, ...at(7, 7))) === B.PLANKS, "B's block is there");
  check((await block(D.page, ...at(6, 6))) === B.AIR, "A's overwritten block is not");
  check((await block(D.page, ...at(2, 2))) === B.STONE, 'earlier shared edits are there');
  await D.ctx.close();
}

// ---------------------------------------------------------------------------------------------------
console.log('restoring a backup');
{
  const page = Bdev.page;
  await page.click('#cloud-backups-btn');
  await page.waitForSelector('.cloud-restore', { timeout: 20000 }).catch(() => undefined);
  check((await page.locator('.cloud-restore').count()) >= 1, 'the backup list shows restore buttons');
  // The newest overwrite backup is revision 3: A's world.
  const backups = (await api(page, `/${SEED}/backups`)).body.backups;
  const index = backups.findIndex((b) => b.kind === 'overwrite' && b.revision === 3);
  await page.screenshot({ path: `${outDir}/cloud-backups.png` });
  check(await clickReload(page, `.cloud-restore >> nth=${index}`), 'restored and reloaded');
  check((await block(page, ...at(6, 6))) === B.PLANKS, "A's block is back");
  check((await block(page, ...at(7, 7))) === B.AIR, "B's block is gone");
  const info = await cloudInfo(page);
  check(info?.revision === 5, `restoring is a new revision (${info?.revision})`);
  const after = (await api(page, `/${SEED}/backups`)).body.backups;
  check(after.some((b) => b.kind === 'restore' && b.revision === 4), 'what the restore replaced was backed up, so it can be undone');
}

// ---------------------------------------------------------------------------------------------------
console.log('deleting the cloud copy');
{
  await Bdev.page.click('#cloud-delete');
  await Bdev.page.waitForFunction(() => window.__cloud.state().cloud === null && window.__cloud.state().phase === 'idle', undefined, { timeout: 20000 });
  check((await cloudInfo(Bdev.page)) === null, 'the cloud copy is gone');
  check((await block(Bdev.page, ...at(6, 6))) === B.PLANKS, 'the local world is untouched');

  // A still thinks it is in sync; after a reload it learns the cloud copy is gone and asks.
  await A.page.reload({ waitUntil: 'load' });
  await ready(A.page);
  check(await waitPhase(A.page, 'missing'), 'A is told the cloud copy was deleted elsewhere');
  await A.page.screenshot({ path: `${outDir}/cloud-missing.png` });
  await A.page.click('#cloud-missing-off');
  check(await waitPhase(A.page, 'disabled'), 'A stops syncing');
  check(await hasButton(A.page, '#cloud-enable'), 'and can turn it back on');
  await A.page.click('#cloud-enable');
  check(await waitPhase(A.page, 'choose'), 're-enabling asks again');
  await A.page.click('#cloud-choice-upload');
  check(await waitPhase(A.page, 'synced'), 'A uploaded its world again');
  check((await cloudInfo(A.page))?.revision === 1, 'as a new cloud world');
}

// ---------------------------------------------------------------------------------------------------
console.log('another account cannot see it');
{
  const E = await device(keypair());
  await open(E.page);
  await signIn(E.page);
  check((await cloudInfo(E.page)) === null, 'a different wallet has no cloud world');
  check(((await api(E.page, '')).body?.worlds ?? []).length === 0, 'and an empty list');
  check((await api(E.page, `/${SEED}/file`)).status === 404, 'and cannot download the other account\'s world');
  await E.ctx.close();
}

console.log('signing out');
{
  await A.page.click('#signout');
  await A.page.waitForSelector('#signin', { timeout: 20000 });
  check((await A.page.locator('#cloud-panel').count()) === 0, 'the cloud panel is gone after signing out');
}

await A.ctx.close();
await Bdev.ctx.close();
const real = errors.filter((e) => !/favicon|WebSocket|ERR_CONNECTION|401|403|404|409|423|Failed to load resource|aborted|AbortError/i.test(e));
check(real.length === 0, 'no unexpected console errors: ' + real.slice(0, 3).join(' | '));
await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log('cloud OK');
