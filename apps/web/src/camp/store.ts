'use client';

import { create } from 'zustand';
import type { DeskAct, DeskView, WebChatLine } from '@solrift/shared';

/**
 * The Camp page's link to the server (`/api/desk/*`, see apps/server/src/desk.ts). The server decides everything; this only asks,
 * and keeps the last view of the hero to draw.
 */

export interface Notice {
  /** Counts up, so that the same words said twice are two notices. */
  n: number;
  text: string;
  ok: boolean;
}

interface CampState {
  /** What the server last said of the hero (null: not loaded, or it has never been played). */
  view: DeskView | null;
  status: 'idle' | 'loading' | 'ready' | 'out' | 'error';
  error: string;
  busy: boolean;
  notice: Notice | null;
  load(): Promise<void>;
  /** Ask the server to do something to the hero. Resolves to whether it was done. */
  act(a: DeskAct): Promise<boolean>;
  say(text: string, ok?: boolean): void;
  clear(): void;
}

let notices = 0;

async function call<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const res = await fetch(`/api/desk/${path}`, { credentials: 'same-origin', cache: 'no-store', ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const body = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, body };
}

export const useCamp = create<CampState>()((set, get) => ({
  view: null,
  status: 'idle',
  error: '',
  busy: false,
  notice: null,

  async load() {
    if (get().status === 'idle') set({ status: 'loading' });
    try {
      const { status, body } = await call<{ view?: DeskView | null; error?: string }>('hero');
      if (status === 401) return set({ status: 'out', view: null, error: '' });
      if (status === 404) return set({ status: 'error', error: 'The game server is running an older version without the Camp. It needs to be updated.' });
      if (status === 429) return; // too many asks: the next refresh will do
      if (status >= 400) return set({ status: 'error', error: body.error ?? `The Camp answered ${status}.` });
      set({ status: 'ready', view: body.view ?? null, error: '' });
    } catch {
      set({ status: 'error', error: 'The Camp cannot be reached right now. The game server may be offline.' });
    }
  },

  async act(a) {
    if (get().busy) return false;
    set({ busy: true });
    try {
      const { status, body } = await call<{ ok?: boolean; message?: string; error?: string; view?: DeskView | null }>('act', { method: 'POST', body: JSON.stringify(a) });
      if (status === 401) {
        set({ busy: false, status: 'out', view: null });
        return false;
      }
      const ok = body.ok === true;
      set({
        busy: false,
        ...(body.view !== undefined ? { view: body.view } : {}),
        notice: { n: ++notices, ok, text: ok ? (body.message ?? 'Done.') : (body.error ?? (status === 429 ? 'Too many requests: wait a moment.' : 'That did not work.')) },
      });
      return ok;
    } catch {
      set({ busy: false, notice: { n: ++notices, ok: false, text: 'The Camp cannot be reached right now.' } });
      return false;
    }
  },

  say(text, ok = true) {
    set({ notice: { n: ++notices, ok, text } });
  },
  clear() {
    set({ notice: null });
  },
}));

/** What the website chat gets from the server. */
export interface ChatReply {
  lines: WebChatLine[];
  head: number;
  online: string[];
  you: string;
}

export async function fetchChat(since: number): Promise<ChatReply | null> {
  try {
    const { status, body } = await call<ChatReply>(`chat?since=${since}`);
    return status === 200 ? body : null;
  } catch {
    return null;
  }
}

export async function sendChat(text: string): Promise<string | null> {
  try {
    const { status, body } = await call<{ ok?: boolean; error?: string }>('chat', { method: 'POST', body: JSON.stringify({ text }) });
    if (status === 429) return 'Slow down a little.';
    return body.ok ? null : (body.error ?? 'It was not sent.');
  } catch {
    return 'It was not sent.';
  }
}
