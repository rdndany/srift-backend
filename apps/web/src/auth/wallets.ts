import { getWallets } from '@wallet-standard/app';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import { StandardConnect, type StandardConnectFeature } from '@wallet-standard/features';
import { SolanaSignMessage, type SolanaSignMessageFeature } from '@solana/wallet-standard-features';

/** A wallet that can connect and sign messages (everything we need for Sign-In With Solana). */
export type SolanaWallet = Wallet & { features: StandardConnectFeature & SolanaSignMessageFeature & Wallet['features'] };

const isSolanaWallet = (w: Wallet): w is SolanaWallet => StandardConnect in w.features && SolanaSignMessage in w.features;

/** Wallets currently registered with the page (Phantom, Solflare, Backpack, ... via Wallet Standard). */
export const listSolanaWallets = (): SolanaWallet[] => getWallets().get().filter(isSolanaWallet);

/** Calls `cb` whenever a wallet appears or disappears (extensions can register after page load). */
export function onWalletsChange(cb: () => void): () => void {
  const api = getWallets();
  const offs = [api.on('register', cb), api.on('unregister', cb)];
  return () => offs.forEach((off) => off());
}

const toBase64 = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

/** Connect the wallet and return its first account. Prompts the user. */
export async function connectWallet(wallet: SolanaWallet): Promise<WalletAccount> {
  const { accounts } = await wallet.features[StandardConnect].connect();
  const account = accounts[0] ?? wallet.accounts[0];
  if (!account) throw new Error('The wallet did not share an account.');
  return account;
}

/** Ask the wallet to sign `message` and return the signature as base64. Prompts the user. */
export async function signWith(wallet: SolanaWallet, account: WalletAccount, message: string): Promise<string> {
  const bytes = new TextEncoder().encode(message);
  const [out] = await wallet.features[SolanaSignMessage].signMessage({ account, message: bytes });
  if (!out) throw new Error('The wallet returned no signature.');
  if (new TextDecoder().decode(out.signedMessage) !== message) throw new Error('The wallet signed a different message than requested.');
  return toBase64(out.signature);
}
