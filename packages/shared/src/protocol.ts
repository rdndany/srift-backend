import type { WorldKind } from './squareWorld';

/**
 * Network protocol (v0). JSON for the bootstrap phase; will move to a packed
 * binary format once gameplay messages (movement, chunks) land in Phase 3.
 */
export const PROTOCOL_VERSION = 0;
export const DEFAULT_SERVER_PORT = 8787;
export type ClientMessage = { t: 'hello'; v: number; name: string } | { t: 'ping'; ts: number };

export type ServerMessage =
  | { t: 'welcome'; v: number; seed: number; kind?: WorldKind; serverTime: number; players: number; max?: number; user: string | null }
  | { t: 'pong'; ts: number; serverTime: number }
  | { t: 'error'; message: string };

export function isClientMessage(x: unknown): x is ClientMessage {
  if (typeof x !== 'object' || x === null) return false;
  const m = x as Record<string, unknown>;
  if (m.t === 'ping') return typeof m.ts === 'number';
  if (m.t === 'hello') return typeof m.v === 'number' && typeof m.name === 'string' && m.name.length <= 32;
  return false;
}
