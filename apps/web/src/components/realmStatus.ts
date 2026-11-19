'use client';

import { useEffect, useState } from 'react';

export const serverUrl = (): string => process.env.NEXT_PUBLIC_SERVER_URL ?? `ws://${location.hostname}:8787`;

export interface RealmStatus {
  status: 'checking' | 'online' | 'offline';
  /** Players in the realm and how many it takes, once the server has said (its welcome message). */
  players: number | null;
  max: number | null;
}

/** Whether the game server answers and how full it is: opens a connection, listens for the welcome, closes it again. */
export function useRealmStatus(url: () => string): RealmStatus {
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [count, setCount] = useState<{ players: number; max: number | null } | null>(null);
  useEffect(() => {
    setStatus('checking');
    setCount(null);
    let done = false;
    let ws: WebSocket | null = null;
    const finish = (s: 'online' | 'offline') => {
      if (done) return;
      done = true;
      setStatus(s);
      try {
        ws?.close();
      } catch {
        /* already closed */
      }
    };
    const timer = setTimeout(() => finish('offline'), 4000);
    try {
      ws = new WebSocket(url());
      ws.onopen = () => {
        setStatus('online');
        // The welcome carries the head count; give it a moment, then hang up either way.
        setTimeout(() => finish('online'), 1500);
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(String(e.data));
          if (msg.t === 'welcome' && typeof msg.players === 'number') {
            setCount({ players: msg.players, max: typeof msg.max === 'number' ? msg.max : null });
            finish('online');
          }
        } catch {
          /* not for us */
        }
      };
      ws.onerror = () => finish('offline');
    } catch {
      finish('offline');
    }
    return () => {
      done = true;
      clearTimeout(timer);
      try {
        ws?.close();
      } catch {
        /* already closed */
      }
    };
  }, [url]);
  return { status, players: count?.players ?? null, max: count?.max ?? null };
}
