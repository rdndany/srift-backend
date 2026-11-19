// Shared by the title-screen suites: a mock Wallet Standard wallet, and the game page (/game) helpers: open it,
// choose who plays (guest or wallet, name, class) and press Play.
import { generateKeyPairSync, sign } from 'node:crypto';

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

/** Install a wallet that signs with a fresh key, before any page of the context loads. */
export async function installWallet(page) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = [...publicKey.export({ format: 'der', type: 'spki' }).subarray(-32)];
  const address = base58(Uint8Array.from(raw));
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
  return { address };
}

/**
 * Onto the game page, /game: from the front page (the PLAY GAME button is showing) through its dialog (single player or
 * multiplayer, and for single player the `mode`), or when the page is already there.
 */
export async function openPlay(page, { timeout = 30000, way = 'single', mode = 'survival' } = {}) {
  await page.waitForSelector('.wow-play, #play-go', { timeout });
  if (!(await page.$('#play-go'))) {
    await page.click('.wow-play');
    await page.click(`#pick-${way}`, { timeout });
    if (way === 'single') await page.click(`#pick-mode-${mode}`, { timeout });
    await page.waitForSelector('#play-go', { timeout });
  }
  await page.waitForSelector(way === 'multi' ? '#multi-panel' : '#single-panel', { timeout });
}

/**
 * Who plays, then Play: the last thing before the game. `as` is 'guest' or 'wallet' (a wallet is signed in on the way
 * when the session is not there yet, and a new account makes its character: permanent, so it asks twice).
 * `name` replaces the suggested name, `classId` is the class picked.
 */
export async function chooseCharacter(page, as, { name, classId = 'warrior', timeout = 30000 } = {}) {
  if (as === 'guest') {
    await page.click('#who-guest');
  } else {
    await page.click('#who-wallet');
    await page.waitForSelector('#who-account, .wallet-pick', { timeout });
    if (!(await page.isVisible('#who-account'))) await page.click('.wallet-pick');
  }
  await page.waitForSelector('#char-name, #char-name-fixed', { timeout });
  const making = await page.isVisible('#char-name');
  if (making) {
    if (name !== undefined) await page.fill('#char-name', name);
    await page.click(`#class-cards [data-class="${classId}"]`);
  }
  await page.click('#play-go');
  // A new wallet character is permanent: the first click asks, the second creates it.
  if (making && as === 'wallet') await page.click('#play-go');
}

/** Front page to the game: a new single-player world (the mode picked on the page, a random seed), then the character. */
export async function enterAs(page, as, opts = {}) {
  await openPlay(page, opts);
  await chooseCharacter(page, as, opts);
}
