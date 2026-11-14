// Wallet login E2E with a mock Wallet Standard wallet: sign in, session cookie, persistence across
// reloads, WebSocket identity, sign out, bad signatures and the no-wallet case.
// Needs the game server running (scripts/e2e.mjs starts one). Usage: node scripts/auth.mjs [url] [outDir]
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

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

/** `mode`: 'good' signs correctly, 'forged' signs with a different key, 'none' installs no wallet. */
async function newPage(mode) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  const kp = keypair();
  if (mode !== 'none') {
    const signer = mode === 'forged' ? keypair().privateKey : kp.privateKey;
    await page.exposeFunction('__mockSign', (msg) => [...sign(null, Buffer.from(msg), signer)]);
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
    }, kp);
  }
  return { ctx, page, kp };
}

const openGame = async (page) => {
  await page.goto(`${url}/?debug&nomobs`, { waitUntil: 'load' });
  await page.waitForSelector('.account-panel button, #account-name', { timeout: 60000 });
};
const name = async (page) => (await page.textContent('#account-name b'))?.trim();
const netText = (page) => page.textContent('#net');
/** Wait until the #net label contains (or, with 
ot, lacks) a piece of text. */
const waitNet = (page, text, not = false) =>
  page
    .waitForFunction(([t, n]) => (document.getElementById('net')?.textContent ?? '').includes(t) !== n, [text, not], { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
console.log('sign in');
{
  const { ctx, page, kp } = await newPage('good');
  await openGame(page);
  check((await page.locator('#signin').count()) === 1, 'a guest sees the sign-in button');
  check((await page.locator('#account-name').count()) === 0, 'and is not signed in');
  await page.click('#signin');
  await page.click('.wallet-option');
  await page.waitForSelector('#account-name', { timeout: 20000 });
  const display = await name(page);
  const text = await page.textContent('#account-name');
  check(/^Player[0-9a-f]{6}$/.test(display ?? ''), `signed in with a public name (${display})`);
  check(text.includes(kp.address.slice(0, 4)) && text.includes(kp.address.slice(-4)), 'shows the shortened wallet address');
  check(!text.includes(kp.address), 'the full address is not shown');
  await page.screenshot({ path: `${outDir}/auth-signed-in.png` });

  const cookies = await ctx.cookies();
  const session = cookies.find((c) => c.name === 'sc_session');
  check(!!session && session.httpOnly && session.sameSite === 'Lax', 'session cookie is HttpOnly and SameSite=Lax');
  check(!(await page.evaluate(() => document.cookie)).includes('sc_session'), 'scripts cannot read the session cookie');

  check(await waitNet(page, 'online'), 'game connection is online');
  check(await waitNet(page, display), `the game server knows the player (${(await netText(page)).trim()})`);

  console.log('persistence');
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#account-name', { timeout: 30000 });
  check((await name(page)) === display, 'still signed in after a reload, same account');

  console.log('sign out');
  await page.click('#signout');
  await page.waitForSelector('#signin', { timeout: 20000 });
  const after = await ctx.cookies();
  check(!after.some((c) => c.name === 'sc_session' && c.value), 'cookie cleared');
  check(await waitNet(page, display, true), 'game connection is a guest again');
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#signin', { timeout: 30000 });
  check((await page.locator('#account-name').count()) === 0, 'stays signed out after a reload');

  console.log('sign in again');
  await page.click('#signin');
  await page.click('.wallet-option');
  await page.waitForSelector('#account-name', { timeout: 20000 });
  check((await name(page)) === display, 'the same wallet gets the same account back');
  await ctx.close();
}

console.log('forged signature');
{
  const { ctx, page } = await newPage('forged');
  await openGame(page);
  await page.click('#signin');
  await page.click('.wallet-option');
  await page.waitForSelector('#account-msg', { timeout: 20000 });
  const msg = await page.textContent('#account-msg');
  check(/bad signature/i.test(msg), `rejected: "${msg}"`);
  check((await page.locator('#account-name').count()) === 0, 'still a guest');
  check(!(await ctx.cookies()).some((c) => c.name === 'sc_session'), 'no session cookie issued');
  await ctx.close();
}

console.log('no wallet installed');
{
  const { ctx, page } = await newPage('none');
  await openGame(page);
  await page.click('#signin');
  await page.waitForSelector('#account-msg', { timeout: 10000 });
  check(/No Solana wallet found/.test(await page.textContent('#account-msg')), 'explains how to get a wallet');
  await ctx.close();
}

const real = errors.filter((e) => !/favicon|WebSocket|ERR_CONNECTION|401|403|Failed to load resource/i.test(e));
check(real.length === 0, 'no unexpected console errors: ' + real.slice(0, 3).join(' | '));
await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log('auth OK');
