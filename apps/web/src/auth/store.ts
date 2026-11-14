'use client';

import { create } from 'zustand';
import type { ClassId } from '@solrift/shared';
import { cloud } from '../cloud/sync';
import { saveBridge } from '../game/saveBridge';
import { LocalSaveStore } from '../game/storage';
import { connectWallet, listSolanaWallets, onWalletsChange, signWith, type SolanaWallet } from './wallets';

export interface AccountInfo {
  id: string;
  displayName: string;
  wallet: string;
  /** The look (`lookCode`) of the character in play, or null when the wallet has not made one yet. */
  look: number | null;
  /** The class of the character in play (null: none yet, or one from before classes). */
  class: ClassId | null;
  /** All of the wallet's characters, oldest first. */
  characters: CharacterInfo[];
  /** How many characters a wallet may have. */
  maxCharacters: number;
}

export interface CharacterInfo {
  id: string;
  displayName: string;
  look: number;
  class: ClassId | null;
}

interface AuthState {
  status: 'loading' | 'out' | 'in';
  account: AccountInfo | null;
  wallets: SolanaWallet[];
  busy: boolean;
  error: string;
  /** Read the current session from the server (cookie) and watch for wallets. */
  init(): () => void;
  login(wallet: SolanaWallet): Promise<void>;
  logout(): Promise<void>;
  /** Make a character (name and look) for the signed-in wallet and play it. It is permanent. Throws with the server's reason (e.g. name taken, three already). */
  createCharacter(character: { displayName: string; look: number; class: ClassId }): Promise<AccountInfo>;
  /** Play another of the wallet's characters (its own progress and saves). */
  selectCharacter(id: string): Promise<AccountInfo>;
  /** Delete the character in play and all its progress (server and this device); confirm is its name. Another character, if any, takes its place. */
  deleteCharacter(confirm: string): Promise<AccountInfo>;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/auth/${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `request failed (${res.status})`);
  return body as T;
}

const post = <T>(path: string, body: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const useAuth = create<AuthState>()((set, get) => {
  /** Every change of who is signed in goes through here: the device's saves follow the character in play. */
  const enter = (account: AccountInfo | null): void => {
    LocalSaveStore.setScope(account && account.look !== null ? account.id : null);
    set({ account, status: account ? 'in' : 'out' });
  };

  return {
    status: 'loading',
    account: null,
    wallets: [],
    busy: false,
    error: '',

    init() {
      set({ wallets: listSolanaWallets() });
      const off = onWalletsChange(() => set({ wallets: listSolanaWallets() }));
      api<{ account: AccountInfo | null }>('me')
        .then(({ account }) => enter(account))
        // Server unreachable: single-player still works, just without an account.
        .catch(() => enter(null));
      return off;
    },

    async login(wallet) {
      if (get().busy) return;
      set({ busy: true, error: '' });
      try {
        const account = await connectWallet(wallet);
        const { message } = await post<{ message: string }>('challenge', {
          address: account.address,
        });
        const signature = await signWith(wallet, account, message);
        const res = await post<{ account: AccountInfo }>('verify', {
          message,
          signature,
        });
        enter(res.account);
        saveBridge.reconnectNet?.();
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
      } finally {
        set({ busy: false });
      }
    },

    async createCharacter(character) {
      await cloud.leave();
      const res = await post<{ account: AccountInfo }>('character', character);
      enter(res.account);
      return res.account;
    },

    async selectCharacter(id) {
      await cloud.leave(); // the world being synced belongs to the character that is being left
      const res = await post<{ account: AccountInfo }>('character/select', {
        id,
      });
      enter(res.account);
      return res.account;
    },

    async deleteCharacter(confirm) {
      await cloud.leave(); // hand the write lease back first
      const res = await post<{ account: AccountInfo }>('character/delete', {
        confirm,
      });
      // The progress on this device goes too (this character's worlds, before the next one takes over).
      await LocalSaveStore.clearAll();
      enter(res.account);
      return res.account;
    },
    async logout() {
      set({ busy: true, error: '' });
      try {
        await cloud.leave(); // hand the world's write lease back while the session is still valid
        await post('logout', {});
        enter(null);
        saveBridge.reconnectNet?.();
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
      } finally {
        set({ busy: false });
      }
    },
  };
});

export const shortAddress = (a: string): string => `${a.slice(0, 4)}\u2026${a.slice(-4)}`;
