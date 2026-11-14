// Shared by the title-screen suites: a mock Wallet Standard wallet, and the "who goes there?" step
// (guest or wallet, then name and character) that comes between the front page and the play page.
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

/** From the front page (the PLAY GAME button is showing) to the play page: single player or multiplayer, then a mode or a realm. */
export async function openPlay(page, { timeout = 30000 } = {}) {
  await page.waitForSelector('.wow-play', { timeout });
  await page.click('.wow-play');
  await page.waitForSelector('#home .mode-card', { timeout });
}

/**
 * The character step, which comes last (after single player / multiplayer and the mode or realm are chosen) and leads
 * straight into the game. `as` is 'guest' or 'wallet' (a wallet is signed in on the way when the session is not there yet).
 * `name` replaces the suggested name, `classId` is the class picked.
 */
export async function chooseCharacter(page, as, { name, classId = 'warrior', timeout = 30000 } = {}) {
  if (as === 'guest') {
    await page.waitForSelector('#who-guest', { timeout });
    await page.click('#who-guest');
  } else {
    await page.waitForSelector('#who-wallet-continue, #who-wallet', { timeout });
    if (await page.isVisible('#who-wallet-continue')) await page.click('#who-wallet-continue');
    else {
      // Signing in takes the player straight on to the character step.
      await page.click('#who-wallet');
      await page.click('.wallet-pick');
    }
  }
  // A new wallet account makes its character here (permanent, so it asks twice); an existing one is only shown.
  await page.waitForSelector('#char-name, #char-name-fixed', { timeout });
  if (await page.isVisible('#char-name')) {
    if (name !== undefined) await page.fill('#char-name', name);
    await page.click('#who-continue');
    // Then the class (a wallet character is permanent, so it asks twice).
    await page.waitForSelector('#class-cards', { timeout });
    await page.click(`.cls-card[data-class="${classId}"]`);
    await page.click('#class-confirm');
    if (as === 'wallet') await page.click('#class-confirm');
  } else {
    await page.click('#who-continue');
  }
}

/** Front page to the game: a new single-player world (the mode picked on the play page, a random seed), then the character. */
export async function enterAs(page, as, opts = {}) {
  await openPlay(page, opts);
  await page.click('#single-panel button.new-world');
  await chooseCharacter(page, as, opts);
}
